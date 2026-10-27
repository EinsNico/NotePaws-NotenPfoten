import AudioSynchronization from "./AudioSynchronization";
import Options from "./Options";
import { isValidWorkshopScore } from "./Workshop";
import { createWorkshopPianoPlayer } from "./WorkshopPianoAudio";
import { createWorkshopPlayback } from "./WorkshopPlayback";

/** Audio-only audition of a saved revision; never opens or changes a draft. */
export function createWorkshopLibraryPlayback(options = {}) {
  const audio = options.audioSynchronization || AudioSynchronization;
  const makePlayer = options.createPianoPlayer || createWorkshopPianoPlayer;
  const makePlayback = options.createPlayback || createWorkshopPlayback;
  const getVolume = options.getAppVolume || (() => Options.appVolume);
  let state = { pieceId:null, busy:false, playing:false, error:null };
  let player = null, playback = null, generation = 0, disposed = false;
  let timingRevision = audio.getState().revision;

  function publish(next) {
    state = next;
    if (typeof options.onState === "function") {
      try { options.onState(Object.assign({}, state)); } catch (error) {
        // A view callback must not leave the audio running without a controller.
      }
    }
  }
  function release() {
    const previous = playback;
    playback = null;
    try { if (previous) previous.stop(); } catch (error) { /* Still stop voices. */ }
    try { if (player) player.stopAll(); } catch (error) { /* Teardown is best effort. */ }
  }
  function stop() {
    generation++;
    release();
    publish({ pieceId:null, busy:false, playing:false, error:null });
  }
  const unsubscribe = typeof audio.subscribe === "function" ? audio.subscribe(next => {
    if (next.revision === timingRevision) return;
    timingRevision = next.revision;
    // A route/delay change needs a fresh snapshot, just as in editor playback.
    if (state.busy || state.playing) stop();
  }) : null;

  async function toggle(piece) {
    if (disposed) return false;
    if (piece && piece.id === state.pieceId && (state.busy || state.playing)) {
      stop();
      return false;
    }
    stop();
    const request = generation;
    const pieceId = piece && typeof piece.id === "string" ? piece.id : null;
    publish({ pieceId, busy:true, playing:false, error:null });
    try {
      const revision = piece && Array.isArray(piece.revisions)
        && piece.revisions.find(candidate => candidate.id === piece.currentRevisionId);
      const score = revision && revision.score;
      if (!pieceId || !isValidWorkshopScore(score) || !score.parts.some(part => part.enabled !== false
        && part.measures.some(bar => bar.events.some(event => event.kind === "note")))) {
        throw new Error("unplayable-piece");
      }
      const ready = await audio.resume();
      if (request !== generation || disposed) return false;
      const context = audio.getContext();
      if (context && (!ready || context.state !== "running")) throw new Error("audio-unavailable");
      if (!player) player = makePlayer({ maxVoices:256, allowFractionalPitch:true,
        audioSynchronization:audio, fallbackPlayer:options.fallbackPlayer });
      const candidate = makePlayback(score, player, Object.assign({}, options.playbackOptions, {
        appVolume:getVolume(), delayMs:audio.getDelayMs(),
        onStop() {
          if (request !== generation || disposed) return;
          generation++;
          release();
          publish({ pieceId:null, busy:false, playing:false, error:null });
        }
      }));
      playback = candidate;
      const samplesReady = await player.prepare(candidate.getTimeline().events.map(event => event.value));
      // stop() already released a cancelled candidate. Never release it again here:
      // the same decoded-sample player may now belong to another piece.
      if (request !== generation || disposed) return false;
      if (!samplesReady || !candidate.start()) throw new Error("piano-unavailable");
      if (request !== generation || playback !== candidate || disposed) return false;
      publish({ pieceId, busy:false, playing:true, error:null });
      return true;
    } catch (error) {
      if (request !== generation || disposed) return false;
      generation++;
      release();
      publish({ pieceId, busy:false, playing:false, error:"WORKSHOP_AUDIO_UNAVAILABLE" });
      return false;
    }
  }
  return {
    toggle, stop,
    getState() { return Object.assign({}, state); },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      if (unsubscribe) unsubscribe();
    }
  };
}
