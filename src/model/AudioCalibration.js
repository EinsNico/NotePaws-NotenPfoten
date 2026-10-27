import { getAppAudioDestination } from "./AppSound";

export const CALIBRATION_INTERVAL_MS = 1100;
export const CALIBRATION_WARMUP_BEATS = 4;
export const CALIBRATION_SAMPLE_COUNT = 20;
export const CALIBRATION_MIN_SAMPLES = 14;

export function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function analyzeCalibrationOffsets(offsets) {
  const samples = Array.isArray(offsets) ? offsets : [];
  const valid = samples.filter(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000);
  const failure = reason => ({ ok: false, delayMs: null, reason, acceptedCount: valid.length, spreadMs: null });
  if (valid.length < CALIBRATION_MIN_SAMPLES) return failure("too-few-samples");
  if (valid.length < samples.length * 0.75) return failure("out-of-range");
  const center = median(valid);
  const mad = median(valid.map(value => Math.abs(value - center)));
  const cutoff = Math.max(25, 3 * 1.4826 * mad);
  const retained = valid.filter(value => Math.abs(value - center) <= cutoff);
  const spread = median(retained.map(value => Math.abs(value - median(retained))));
  if (mad > 45 || retained.length < CALIBRATION_MIN_SAMPLES || retained.length < samples.length * 0.75) return failure("unstable");
  return { ok: true, delayMs: Math.round(median(retained)), reason: null, acceptedCount: retained.length, spreadMs: Math.round(spread) };
}

// This is the source scheduling clock, before hardware/output latency. Using
// getOutputTimestamp here would subtract the very delay being calibrated.
export function audioTimeToPerformanceTime(context, audioTime, now) {
  return now() + (audioTime - context.currentTime) * 1000;
}

export function createAudioCalibration(options = {}) {
  const context = options.context;
  const now = options.now || (() => performance.now());
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const volume = Math.max(0, Math.min(1, Number.isFinite(options.volume) ? options.volume : 0.5));
  let timers = [];
  let sources = [];
  let references = [];
  let offsets = [];
  let state = {
    running: false, phase: "idle", warmupCompleted: 0, totalWarmup: CALIBRATION_WARMUP_BEATS,
    samplesTaken: 0, totalSamples: CALIBRATION_SAMPLE_COUNT, result: null
  };
  function getState() { return Object.assign({}, state, { result: state.result && Object.assign({}, state.result) }); }
  function notify() {
    if (typeof options.onUpdate === "function") options.onUpdate(getState());
    return getState();
  }
  function clear() {
    timers.forEach(cancel);
    timers = [];
    sources.forEach(source => {
      try { source.oscillator.stop(); } catch (error) { /* An ended oscillator is already stopped. */ }
      try { source.oscillator.disconnect(); source.gain.disconnect(); } catch (error) { /* Optional in old WebViews. */ }
    });
    sources = [];
  }
  function complete() {
    if (!state.running) return getState();
    clear();
    state.running = false;
    state.phase = "complete";
    state.result = analyzeCalibrationOffsets(offsets);
    return notify();
  }
  return {
    start() {
      clear();
      references = [];
      offsets = [];
      if (!context || context.state !== "running" || typeof context.createOscillator !== "function") {
        state = Object.assign({}, state, { running: false, phase: "stopped", warmupCompleted: 0, samplesTaken: 0, result: null });
        notify();
        return false;
      }
      state = Object.assign({}, state, { running: true, phase: "warmup", warmupCompleted: 0, samplesTaken: 0, result: null });
      const firstTime = context.currentTime + 0.15;
      try {
        for (let index = 0; index < CALIBRATION_WARMUP_BEATS + CALIBRATION_SAMPLE_COUNT; index++) {
          const when = firstTime + index * CALIBRATION_INTERVAL_MS / 1000;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          sources.push({ oscillator, gain });
          oscillator.frequency.setValueAtTime(index < CALIBRATION_WARMUP_BEATS ? 660 : 880, when);
          gain.gain.setValueAtTime(0, when);
          gain.gain.linearRampToValueAtTime(volume * 0.35, when + 0.002);
          gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
          oscillator.connect(gain);
          gain.connect(getAppAudioDestination(context));
          oscillator.start(when);
          oscillator.stop(when + 0.05);
          references.push(audioTimeToPerformanceTime(context, when, now));
          timers.push(schedule(() => {
            if (!state.running) return;
            state.warmupCompleted = Math.min(CALIBRATION_WARMUP_BEATS, index + 1);
            state.phase = index < CALIBRATION_WARMUP_BEATS ? "warmup" : "measuring";
            notify();
          }, Math.max(0, references[index] - now())));
        }
        timers.push(schedule(complete, Math.max(0, references[references.length - 1] + 1050 - now())));
      } catch (error) {
        clear();
        state.running = false;
        state.phase = "stopped";
        notify();
        return false;
      }
      notify();
      return true;
    },
    tap(timestamp = now()) {
      if (!state.running || !Number.isFinite(timestamp) || timestamp < references[CALIBRATION_WARMUP_BEATS]) return getState();
      // Keep the intended beat order: wrapping to the nearest beat would turn
      // consistently one-beat-late taps into a deceptively successful result.
      const reference = references[CALIBRATION_WARMUP_BEATS + offsets.length];
      offsets.push(timestamp - reference);
      state.samplesTaken = offsets.length;
      if (offsets.length >= CALIBRATION_SAMPLE_COUNT) return complete();
      return notify();
    },
    stop() {
      clear();
      state.running = false;
      state.phase = "stopped";
      return notify();
    },
    getState,
    getResult() { return state.result && Object.assign({}, state.result); }
  };
}
