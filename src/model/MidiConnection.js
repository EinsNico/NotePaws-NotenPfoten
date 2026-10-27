export const MIDI_CONNECTION_CHECK_INTERVAL_MS = 1000;
export const MIDI_PERMISSION_WAIT_HINT_MS = 10000;
const pendingEnables = new WeakMap();

export function enableMidiConnection(webMidi, callback, onPending) {
  if (webMidi.enabled) { callback(null); return () => {}; }
  let pending = pendingEnables.get(webMidi);
  const existing = !!pending;
  if (!pending) {
    pending = { listeners: [], startedAt: Date.now(), timer: null, finished: false };
    pendingEnables.set(webMidi, pending);
  }
  const listener = { callback, onPending };
  pending.listeners.push(listener);
  const cancel = () => {
    pending.listeners = pending.listeners.filter(candidate => candidate !== listener);
  };
  if (typeof onPending === 'function') {
    const remaining = MIDI_PERMISSION_WAIT_HINT_MS - (Date.now() - pending.startedAt);
    if (remaining <= 0) onPending();
    else if (!pending.timer) {
      pending.timer = setTimeout(() => {
        pending.timer = null;
        if (pending.finished) return;
        pending.listeners.slice().forEach(waiter => {
          if (typeof waiter.onPending === 'function') waiter.onPending();
        });
      }, remaining);
      // Node-based regression tests should not wait for an intentionally open
      // permission fixture. Browser timers are numeric and have no unref().
      if (pending.timer && typeof pending.timer.unref === 'function') pending.timer.unref();
    }
  }
  if (existing) return cancel;
  const complete = error => {
    if (pending.finished || pendingEnables.get(webMidi) !== pending) return;
    pending.finished = true;
    clearTimeout(pending.timer);
    const callbacks = pending.listeners.slice();
    pending.listeners = [];
    pendingEnables.delete(webMidi);
    callbacks.forEach(waiter => waiter.callback(error));
  };
  try { webMidi.enable(complete); }
  catch (error) { complete(error); }
  return cancel;
}

export function connectedMidiInputs(webMidi) {
  if (!webMidi || !webMidi.enabled) return [];
  const ports = webMidi.interface && webMidi.interface.inputs;
  let inputs = Array.isArray(webMidi.inputs) ? webMidi.inputs : [];

  // WebMidi 2 keeps its own wrappers. Reconcile them with MIDIAccess when a
  // platform misses a hot-plug event, without closing the shared interface or
  // requesting permission again. Keep this version-specific adapter here.
  if (ports && typeof ports.forEach === "function" && typeof ports.get === "function") {
    const nativeInputs = [];
    ports.forEach(port => nativeInputs.push(port));
    const changed = nativeInputs.length !== inputs.length || nativeInputs.some(port => (
      !inputs.some(input => input && input.id === port.id
        && (!input._midiInput || input._midiInput === port))
    ));
    if (changed && typeof webMidi._updateInputs === "function") {
      webMidi._updateInputs();
      inputs = webMidi.inputs;
    }
    return inputs.filter(input => {
      if (!input || input.state === "disconnected") return false;
      const port = ports.get(input.id);
      return !!port && port.state === "connected"
        && (!input._midiInput || input._midiInput === port);
    });
  }
  // Fallback for MIDI shims that expose only the library's input list.
  return inputs.filter(input => input && input.state !== "disconnected");
}
