import AudioSynchronization from "./AudioSynchronization";
import { getAppAudioDestination } from "./AppSound";
import { appVolumeToAudioLevel } from "./AppVolume";
import { createPianoSamplePlayer, normalizePianoSampleValue } from "./PianoAudio";

/** Decode once per pitch, then play independent voices without media src changes. */
export function createWorkshopPianoPlayer(options = {}) {
  const sync = options.audioSynchronization || AudioSynchronization;
  const fetchSample = options.fetchFn || (typeof fetch === "function" ? fetch.bind(typeof window === "undefined" ? null : window) : null);
  const fallback = options.fallbackPlayer || createPianoSamplePlayer(Object.assign({}, options, { reuseSamples:false }));
  const basePath = options.basePath || "static/samples/piano";
  const maxVoices = Math.max(1, Math.round(Number(options.maxVoices) || 256));
  const voices = new Set(), buffers = new Map(), pending = new Map();
  let context = null;

  function samplePitch(value) {
    return normalizePianoSampleValue(options.allowFractionalPitch ? Math.floor(value) : value);
  }
  function playbackRate(value) {
    const pitch = options.allowFractionalPitch ? Number(value) : Math.round(Number(value));
    return Number.isFinite(pitch) ? Math.pow(2, (pitch - samplePitch(pitch)) / 12) : 1;
  }

  function supported(candidate) {
    return fetchSample && candidate && typeof candidate.createBufferSource === "function"
      && typeof candidate.createGain === "function" && typeof candidate.decodeAudioData === "function";
  }
  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch (error) { /* Already ended. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function selectContext() {
    const next = sync.getContext();
    if (!supported(next)) return null;
    if (context !== next) {
      Array.from(voices).forEach(release);
      buffers.clear(); pending.clear(); context = next;
    }
    return next;
  }
  function load(value, target) {
    const pitch = normalizePianoSampleValue(value);
    if (buffers.has(pitch)) return Promise.resolve(buffers.get(pitch));
    if (pending.has(pitch)) return pending.get(pitch);
    const request = Promise.resolve().then(() => fetchSample(basePath + "/" + pitch + ".mp3"))
      .then(response => {
        if (response.ok === false) throw new Error("piano-sample-unavailable");
        return response.arrayBuffer();
      }).then(bytes => new Promise((resolve, reject) => {
        // Callback and Promise forms cover Android WebViews and older WebKit.
        const decoded = target.decodeAudioData(bytes, resolve, reject);
        if (decoded && typeof decoded.then === "function") decoded.then(resolve, reject);
      })).then(buffer => {
        if (context === target) { buffers.set(pitch, buffer); pending.delete(pitch); }
        return buffer;
      }, error => {
        if (context === target) pending.delete(pitch);
        throw error;
      });
    pending.set(pitch, request); return request;
  }
  return {
    async prepare(values) {
      const target = selectContext();
      if (!target) return true;
      const pitches = Array.from(new Set(values.filter(Number.isFinite).map(value =>
        normalizePianoSampleValue(options.allowFractionalPitch ? Math.floor(value) : value))));
      let index = 0;
      // Bound parallel decoding and cache only the pitches required by this piece.
      await Promise.all(Array.from({ length:Math.min(4, pitches.length) }, async () => {
        while (index < pitches.length) await load(pitches[index++], target);
      }));
      return context === target;
    },
    play(value, appVolume, playOptions = {}) {
      const target = selectContext();
      const rate = playbackRate(value);
      if (!target) {
        const handle = fallback.play(value, appVolume, playOptions);
        if (handle && rate !== 1) {
          handle.playbackRate = rate;
          handle.preservesPitch = handle.mozPreservesPitch = handle.webkitPreservesPitch = false;
        }
        return handle;
      }
      const buffer = buffers.get(samplePitch(value));
      const offset = Math.max(0, Number(playOptions.offsetSeconds) || 0);
      if (!buffer || offset >= buffer.duration) return null;
      while (voices.size >= maxVoices) release(voices.values().next().value);
      const source = target.createBufferSource(), gain = target.createGain();
      const when = Number.isFinite(playOptions.whenSeconds) ? Math.max(target.currentTime, playOptions.whenSeconds) : target.currentTime;
      source.buffer = buffer; source.playbackRate.value = rate;
      gain.gain.value = appVolumeToAudioLevel(appVolume);
      source.connect(gain); gain.connect(getAppAudioDestination(target));
      const voice = { source, gain, started:when, offset, rate };
      voices.add(voice); source.onended = () => release(voice);
      const handle = { pause() { release(voice); },
        stopAt(time) { if (voices.has(voice)) source.stop(Math.max(target.currentTime, time)); },
        volumeAt(level, time) {
          if (!voices.has(voice)) return;
          const volume = Math.max(0, Math.min(1, Number(level) || 0));
          if (typeof gain.gain.setValueAtTime === "function") gain.gain.setValueAtTime(volume, Math.max(target.currentTime, time));
          else gain.gain.value = volume;
        }
      };
      Object.defineProperties(handle, {
        paused:{ get:() => !voices.has(voice) },
        volume:{ get:() => gain.gain.value, set:level => {
          if (voices.has(voice)) gain.gain.value = Math.max(0, Math.min(1, Number(level) || 0));
        } },
        currentTime:{ get:() => voices.has(voice) ? offset + Math.max(0, target.currentTime - voice.started) * rate : 0 }
      });
      try { source.start(when, offset); }
      catch (error) { release(voice); throw error; }
      return handle;
    },
    getAudioTime() { const target = selectContext(); return target ? target.currentTime * 1000 : null; },
    getPlaybackRate:playbackRate,
    setVolume(handle, appVolume, settings = {}) {
      if (!handle) return;
      const level = appVolumeToAudioLevel(appVolume);
      if (Number.isFinite(settings.whenSeconds) && typeof handle.volumeAt === "function") handle.volumeAt(level, settings.whenSeconds);
      else handle.volume = level;
    },
    stop(handle, settings = {}) {
      if (!handle) return;
      if (Number.isFinite(settings.whenSeconds) && typeof handle.stopAt === "function") handle.stopAt(settings.whenSeconds);
      else if (typeof handle.pause === "function") handle.pause();
    },
    stopAll() { Array.from(voices).forEach(release); fallback.stopAll(); },
    getActiveVoiceCount() { return voices.size + fallback.getActiveVoiceCount(); }
  };
}
