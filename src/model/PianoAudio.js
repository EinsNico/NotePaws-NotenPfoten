import { appVolumeToAudioLevel } from "./AppVolume";
import AudioSynchronization from "./AudioSynchronization";
import { getAppAudioDestination, trackAppMediaElement } from "./AppSound";

export const PIANO_SAMPLE_MIN_VALUE = 0;
export const PIANO_SAMPLE_MAX_VALUE = 71;

export function normalizePianoSampleValue(value) {
  let normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized)) {
    normalized = 48;
  }
  while (normalized < PIANO_SAMPLE_MIN_VALUE) {
    normalized += 12;
  }
  while (normalized > PIANO_SAMPLE_MAX_VALUE) {
    normalized -= 12;
  }
  return normalized;
}

function stopSample(sample) {
  if (!sample) {
    return;
  }
  if (typeof sample.pause === "function") {
    sample.pause();
  }
  try {
    sample.currentTime = 0;
  } catch (error) {
    // Some WebViews make currentTime read-only until the sample has loaded.
  }
}

export function createPianoSamplePlayer(options = {}) {
  const AudioConstructor = options.AudioConstructor
    || (typeof Audio === "function" ? Audio : null);
  const basePath = options.basePath || "static/samples/piano";
  const requestedVoices = Math.round(Number(options.maxVoices));
  const maxVoices = Number.isFinite(requestedVoices) ? Math.max(1, requestedVoices || 6) : 6;
  const synchronization = options.audioSynchronization || AudioSynchronization;
  const pool = [];
  const leases = new WeakMap();
  let active = [];

  function owns(lease) { return lease && lease.voice.lease === lease; }
  function disconnect(voice) {
    if (voice.source && voice.connected) {
      try { voice.source.disconnect(); } catch (error) { /* Already disconnected. */ }
      voice.connected = false;
    }
  }
  function clearMedia(voice) {
    const sample = voice.sample;
    // Releasing src + load relinquishes native decoder/network resources. Pausing
    // and disconnecting a MediaElementSource alone does not release a player.
    if (typeof sample.removeAttribute === "function") sample.removeAttribute("src");
    else if (voice.reusable) sample.src = "";
    if (typeof sample.load === "function") {
      try { sample.load(); } catch (error) { /* Old/custom media implementations. */ }
    }
    voice.url = null;
  }
  function release(lease, clear = false) {
    if (!owns(lease)) return;
    const voice = lease.voice, sample = voice.sample;
    voice.lease = null;
    active = active.filter(candidate => candidate !== lease);
    lease.listeners.forEach(([event, handler]) => {
      if (typeof sample.removeEventListener === "function") sample.removeEventListener(event, handler);
    });
    lease.listeners = [];
    if (lease.releaseMaster) lease.releaseMaster();
    stopSample(sample);
    disconnect(voice);
    if (clear || !voice.reusable) clearMedia(voice);
  }
  function listen(lease, event, handler) {
    if (typeof lease.voice.sample.addEventListener !== "function") return;
    lease.listeners.push([event, handler]);
    lease.voice.sample.addEventListener(event, handler);
  }
  function createVoice(url) {
    const sample = new AudioConstructor(url);
    // Custom sample constructors can have immutable per-note state. Pool actual
    // browser media elements, or explicitly compatible constructors in hosts/tests.
    const nativeMedia = typeof HTMLMediaElement !== "undefined" && sample instanceof HTMLMediaElement;
    const reusable = options.reuseSamples !== false && (nativeMedia || options.reuseSamples === true);
    const voice = { sample, reusable, nativeMedia, url, lease: null, source: null, context: null, connected: false };
    if (reusable) pool.push(voice);
    return voice;
  }
  function routeVoice(voice) {
    if (!voice.nativeMedia && !options.audioSynchronization) return false;
    const context = synchronization.getContext();
    if (!context || !context.destination || typeof context.createMediaElementSource !== "function") return false;
    try {
      if (!voice.source) {
        voice.source = context.createMediaElementSource(voice.sample);
        voice.context = context;
      }
      if (voice.context !== context) return false;
      if (!voice.connected) {
        // Volume belongs to the media element; a second gain would square it.
        voice.source.connect(getAppAudioDestination(context));
        voice.connected = true;
      }
      return true;
    } catch (error) { return false; }
  }
  function handleFor(lease) {
    if (!lease.voice.reusable) return lease.voice.sample;
    const sample = lease.voice.sample;
    const handle = { pause() { release(lease); } };
    // A transport may retain an ended/pedalled note after this media element is
    // reused. Each play gets its own handle; old stops/volume edits stay harmless.
    const fields = ["src", "volume", "playbackRate", "preservesPitch", "mozPreservesPitch", "webkitPreservesPitch"];
    fields.forEach(field => {
      let value = sample[field];
      Object.defineProperty(handle, field, { enumerable: true,
        get() { return owns(lease) ? sample[field] : value; },
        set(next) { value = next; if (owns(lease)) sample[field] = next; }
      });
    });
    Object.defineProperty(handle, "paused", { enumerable: true, get() { return !owns(lease) || sample.paused; } });
    Object.defineProperty(handle, "currentTime", { enumerable: true,
      get() { return owns(lease) ? sample.currentTime : 0; },
      set(value) { if (owns(lease)) sample.currentTime = value; }
    });
    return handle;
  }

  return {
    play(value, appVolume, playOptions = {}) {
      if (!AudioConstructor) return null;
      const fractionalPitch = options.allowFractionalPitch && Number.isFinite(value) && !Number.isInteger(value);
      const sampleValue = normalizePianoSampleValue(fractionalPitch ? Math.floor(value) : value);
      const url = `${basePath}/${sampleValue}.mp3`;
      while (active.length >= maxVoices) release(active[0]);
      let voice = pool.find(candidate => !candidate.lease && candidate.url === url)
        || pool.find(candidate => !candidate.lease);
      // A media element can be bound to only one MediaElementSource/context for
      // its lifetime. Replace that slot if the shared context was recreated.
      if (voice && voice.source && voice.context !== synchronization.getContext()) {
        disconnect(voice); clearMedia(voice);
        pool.splice(pool.indexOf(voice), 1); voice = null;
      }
      if (!voice) voice = createVoice(url);
      const sample = voice.sample;
      if (voice.url !== url) { sample.src = url; voice.url = url; }
      sample.volume = appVolumeToAudioLevel(appVolume);
      sample.playbackRate = fractionalPitch ? Math.pow(2, (value - Math.floor(value)) / 12) : 1;
      // Reset all detuning state before a pooled fractional sample is reused.
      sample.preservesPitch = !fractionalPitch;
      sample.mozPreservesPitch = !fractionalPitch;
      sample.webkitPreservesPitch = !fractionalPitch;
      const lease = { voice, listeners: [], handle: null, releaseMaster: trackAppMediaElement(sample) };
      voice.lease = lease;
      lease.handle = handleFor(lease);
      leases.set(lease.handle, lease);
      active.push(lease);
      listen(lease, "ended", () => { if (owns(lease) && sample.ended !== false) release(lease); });
      listen(lease, "error", () => {
        // A queued event from the previous URL can arrive after a slot was
        // reused. Native media resets error to null when a new load begins.
        if (owns(lease) && sample.error !== null) release(lease, true);
      });
      const offset = Number.isFinite(Number(playOptions.offsetSeconds)) ? Math.max(0, Number(playOptions.offsetSeconds)) : 0;
      let requested = false;
      const play = () => {
        if (!owns(lease) || requested) return;
        // Resume/seek must not attack again when the original recorded sound has
        // already decayed completely. Wait for real metadata before seeking.
        if (offset > 0 && typeof sample.readyState === "number" && sample.readyState < 1) return;
        if (offset > 0 && Number.isFinite(sample.duration) && offset >= sample.duration) { release(lease); return; }
        try {
          sample.currentTime = offset;
        } catch (error) {
          if (offset > 0) return;
        }
        requested = true;
        try {
          const playback = typeof sample.play === "function" ? sample.play() : null;
          if (playback && typeof playback.catch === "function") playback.catch(() => release(lease, true));
        } catch (error) { release(lease, true); }
      };
      let audioReady = false;
      if (offset > 0) listen(lease, "loadedmetadata", () => { if (audioReady) play(); });
      const ready = () => { if (!owns(lease)) return; audioReady = true; play(); };
      if (routeVoice(voice)) {
        try {
          // Running contexts need no Promise hop per note. Besides avoiding
          // artificial onset delay, this prevents old work queuing behind seeks.
          if (voice.context.state === "running") ready();
          else Promise.resolve(synchronization.resume()).then(resumed => {
            if (resumed === false) release(lease, true);
            else ready();
          }, () => release(lease, true));
        } catch (error) { release(lease, true); }
      } else ready();
      return lease.handle;
    },
    stop(sample) { if (sample) release(leases.get(sample)); },
    stopAll() {
      active.slice().forEach(lease => release(lease));
      pool.forEach(voice => { disconnect(voice); clearMedia(voice); });
    },
    getActiveVoiceCount() { return active.length; }
  };
}

export default {
  normalizePianoSampleValue,
  createPianoSamplePlayer
};
