import * as Lockr from "lockr";
import { writeVerified } from "./VerifiedPersistence";
import { reportPersistenceFailure, clearPersistenceFailure } from "./PersistenceFeedback";

// This device's output path must never be transferred in a learning-data backup.
export const AUDIO_SYNC_STORAGE_KEY = "deviceAudioSynchronizationV1";
export const MAX_AUDIO_DELAY_MS = 1000;

export function normalizeAudioDelay(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(MAX_AUDIO_DELAY_MS, Math.round(number))) : 0;
}

export function estimateOutputDelay(context) {
  // baseLatency alone omits the hardware/Bluetooth output queue entirely.
  if (!context || typeof context.outputLatency !== "number" || !Number.isFinite(context.outputLatency) || context.outputLatency < 0) return null;
  const base = typeof context.baseLatency === "number" && Number.isFinite(context.baseLatency) && context.baseLatency >= 0 ? context.baseLatency : 0;
  return normalizeAudioDelay((base + context.outputLatency) * 1000);
}

export function createAudioSynchronization(options = {}) {
  const host = options.window || (typeof window !== "undefined" ? window : null);
  const documentObject = options.document || (typeof document !== "undefined" ? document : null);
  const navigatorObject = options.navigator || (typeof navigator !== "undefined" ? navigator : null);
  const storage = options.storage || Lockr;
  const listeners = new Set();
  const disposers = [];
  let saved = {};
  try { saved = storage.get(AUDIO_SYNC_STORAGE_KEY, {}) || {}; } catch (error) { /* Storage can be unavailable. */ }
  const settings = {
    automatic: saved.automatic !== false,
    manualMs: saved.manualMs == null ? null : normalizeAudioDelay(saved.manualMs),
    feedbackSound: saved.feedbackSound !== false
  };
  // Native device IDs identify the current route only within its lifetime. They
  // cannot safely validate an automatic calibration after an app restart.
  if (settings.automatic) settings.manualMs = null;
  let context = null;
  let observedContextState = null;
  let estimatedMs = null;
  let route = "unknown";
  let routeReliable = false;
  let routeKey = null;
  let revision = 0;
  let nativePlugin = null;
  let disposed = false;
  let storageSaved = true;

  function snapshot() {
    return {
      settings: Object.assign({}, settings),
      delayMs: settings.manualMs !== null ? settings.manualMs : estimatedMs === null ? 0 : estimatedMs,
      estimatedMs,
      source: settings.manualMs !== null ? "manual" : estimatedMs === null ? "unavailable" : "system",
      route, routeReliable, revision,
      pendingRouteValidation: false,
      storageSaved
    };
  }

  function persist() {
    storageSaved = writeVerified(storage, AUDIO_SYNC_STORAGE_KEY, Object.assign({}, settings));
    if (storageSaved) clearPersistenceFailure("audio-sync");
    else reportPersistenceFailure("audio-sync", "PERSISTENCE_AUDIO", retryPersistence);
    return storageSaved;
  }

  function retryPersistence() {
    const before = snapshot();
    const saved = persist();
    publish(before, false, true);
    return saved;
  }

  function publish(before, forceTimingChange = false, keepRevision = false) {
    const after = snapshot();
    if (!keepRevision && (forceTimingChange || before.delayMs !== after.delayMs || before.route !== route || before.routeReliable !== routeReliable)) revision++;
    const state = snapshot();
    if (JSON.stringify(before) !== JSON.stringify(state)) {
      listeners.forEach(listener => { try { listener(state); } catch (error) { /* One observer cannot break playback. */ } });
    }
    return state;
  }

  function refreshEstimate() {
    const before = snapshot();
    estimatedMs = estimateOutputDelay(context);
    return publish(before, false, true);
  }

  function observeContextState() {
    const before = snapshot();
    const nextState = context && context.state;
    const interrupted = observedContextState === "running" && nextState !== "running";
    observedContextState = nextState;
    estimatedMs = estimateOutputDelay(context);
    // Timers must not keep advancing after audible output was suspended. The
    // initial unlock/resume path and normal estimate jitter are not interruptions.
    return publish(before, interrupted, !interrupted);
  }

  function listen(target, event, callback) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(event, callback);
    disposers.push(() => target.removeEventListener && target.removeEventListener(event, callback));
  }

  function receiveRoute(info) {
    if (disposed || !info) return;
    if (info.reliable !== true || typeof info.key !== "string" || !info.key || ["speaker", "headphones", "external"].indexOf(info.route) < 0) {
      loseRoute(info.changed === true);
      return;
    }
    const before = snapshot();
    const changed = info.changed === true || (routeKey !== null && routeKey !== info.key) || (routeReliable && route !== info.route);
    route = info.route;
    routeReliable = true;
    routeKey = info.key;
    if (settings.automatic && changed) settings.manualMs = null;
    estimatedMs = estimateOutputDelay(context);
    persist();
    // First successful discovery describes the already-active output. It must
    // not cancel a round or calibration that started while the probe was pending.
    publish(before, changed, !changed);
  }

  function loseRoute(changed = false) {
    if (disposed) return;
    const before = snapshot();
    const wasReliable = routeReliable;
    routeReliable = false;
    route = "unknown";
    routeKey = null;
    if (settings.automatic && (wasReliable || changed)) settings.manualMs = null;
    persist();
    publish(before, changed || wasReliable);
  }

  function watchRoute(refresh = false) {
    if (disposed) return;
    const plugin = options.routePlugin || (host && host.cordova && host.cordova.plugins && host.cordova.plugins.audioRoute);
    if (!plugin) return;
    const failed = () => loseRoute();
    let startedWatching = false;
    if (nativePlugin !== plugin && typeof plugin.watch === "function") {
      nativePlugin = plugin;
      startedWatching = true;
      try { plugin.watch(receiveRoute, failed); } catch (error) { failed(); }
    }
    // watch() sends its initial probe. Avoid starting another native AudioTrack
    // for every piano note when the shared context is already running.
    if (!startedWatching && (refresh || typeof plugin.watch !== "function") && typeof plugin.getState === "function") {
      try { plugin.getState(receiveRoute, failed); } catch (error) { failed(); }
    }
  }

  function invalidateUnknownRoute(force = false) {
    // An available-device list says nothing about the active speaker/headset.
    if (routeReliable && !force) return;
    const before = snapshot();
    route = "unknown";
    routeReliable = false;
    routeKey = null;
    if (settings.automatic) settings.manualMs = null;
    estimatedMs = estimateOutputDelay(context);
    persist();
    publish(before, true);
    watchRoute(true);
  }

  function getContext() {
    if (disposed) return null;
    if (context && context.state !== "closed") return context;
    const Constructor = options.AudioContext || (host && (host.AudioContext || host.webkitAudioContext));
    if (!Constructor) return null;
    try {
      context = new Constructor({ latencyHint: "interactive" });
      observedContextState = context.state;
      const createdContext = context;
      listen(context, "statechange", () => { if (context === createdContext) observeContextState(); });
      listen(context, "sinkchange", () => invalidateUnknownRoute(true));
      refreshEstimate();
      watchRoute();
      return context;
    } catch (error) {
      context = null;
      return null;
    }
  }

  function resume() {
    const audioContext = getContext();
    watchRoute(audioContext && audioContext.state !== "running");
    if (!audioContext) return Promise.resolve(false);
    try {
      const resumed = audioContext.state === "running" || typeof audioContext.resume !== "function" ? null : audioContext.resume();
      return Promise.resolve(resumed).then(() => {
        observeContextState();
        return audioContext.state === "running";
      }).catch(() => false);
    } catch (error) { return Promise.resolve(false); }
  }

  listen(documentObject, "deviceready", () => watchRoute());
  listen(documentObject, "resume", () => { watchRoute(true); refreshEstimate(); });
  listen(navigatorObject && navigatorObject.mediaDevices, "devicechange", () => invalidateUnknownRoute());
  watchRoute();

  return {
    getContext,
    resume,
    retryPersistence,
    getDelayMs() { return refreshEstimate().delayMs; },
    getSettings() { return Object.assign({}, settings); },
    getState() { return refreshEstimate(); },
    updateSettings(patch = {}) {
      const before = snapshot();
      if (typeof patch.automatic === "boolean") settings.automatic = patch.automatic;
      if (typeof patch.feedbackSound === "boolean") settings.feedbackSound = patch.feedbackSound;
      if (Object.prototype.hasOwnProperty.call(patch, "manualMs")) {
        settings.manualMs = patch.manualMs == null ? null : normalizeAudioDelay(patch.manualMs);
      }
      persist();
      return publish(before);
    },
    reset() {
      const before = snapshot();
      settings.manualMs = null;
      estimatedMs = estimateOutputDelay(context);
      persist();
      return publish(before);
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      disposers.forEach(dispose => dispose());
      listeners.clear();
      if (nativePlugin && typeof nativePlugin.unwatch === "function") {
        try { nativePlugin.unwatch(); } catch (error) { /* Teardown must be safe. */ }
      }
    }
  };
}

export default createAudioSynchronization();
