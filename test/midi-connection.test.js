const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

const filename = path.resolve(__dirname, "../src/model/MidiConnection.js");
const compiled = babel.transform(fs.readFileSync(filename, "utf8"), {
  babelrc: false,
  presets: [["env", { modules: "commonjs" }]]
}).code;
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const { connectedMidiInputs, enableMidiConnection, MIDI_CONNECTION_CHECK_INTERVAL_MS } = loaded.exports;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function nativePort(id, state = "connected", connection = "open") {
  return { id, state, connection };
}

function wrapper(port) {
  return {
    id: port.id,
    _midiInput: port,
    get state() { return port.state; },
    get connection() { return port.connection; }
  };
}

function nativeMidi(ports, cachedInputs = ports.map(wrapper)) {
  const map = new Map(ports.map(port => [port.id, port]));
  return {
    enabled: true,
    interface: { inputs: map },
    inputs: cachedInputs,
    updateCount: 0,
    _updateInputs() {
      this.updateCount += 1;
      this.inputs = Array.from(map.values()).map(port => {
        return this.inputs.find(input => input._midiInput === port) || wrapper(port);
      });
    }
  };
}

test("a disabled or unavailable MIDI interface reports no connected inputs", () => {
  assert.deepStrictEqual(connectedMidiInputs(null), []);
  assert.deepStrictEqual(connectedMidiInputs({ enabled: false, inputs: [nativePort("cached")] }), []);
  assert(MIDI_CONNECTION_CHECK_INTERVAL_MS >= 500 && MIDI_CONNECTION_CHECK_INTERVAL_MS <= 2000);
});

test("a cached disconnected input is rejected even when the array remains populated", () => {
  const connected = nativePort("connected");
  const disconnected = nativePort("disconnected", "disconnected");
  const midi = { enabled: true, inputs: [connected, disconnected] };
  assert.deepStrictEqual(connectedMidiInputs(midi), [connected]);
  connected.state = "disconnected";
  assert.deepStrictEqual(connectedMidiInputs(midi), []);
});

test("an available MIDI port remains connected when its listener connection is closed", () => {
  const port = nativePort("closed-listener", "connected", "closed");
  const midi = nativeMidi([port]);
  assert.deepStrictEqual(connectedMidiInputs(midi), midi.inputs);
  assert.strictEqual(midi.updateCount, 0);
});

test("the native input map removes stale wrappers when a hot-plug notification is missed", () => {
  const removed = nativePort("removed");
  const midi = nativeMidi([removed]);
  midi.interface.inputs.delete(removed.id);
  assert.deepStrictEqual(connectedMidiInputs(midi), []);
  assert.strictEqual(midi.updateCount, 1);
  assert.deepStrictEqual(connectedMidiInputs(midi), []);
  assert.strictEqual(midi.updateCount, 1, "Unchanged ports must not repeatedly rebuild input wrappers");
});

test("a newly discovered native input becomes available without a library event", () => {
  const midi = nativeMidi([]);
  const attached = nativePort("new");
  midi.interface.inputs.set(attached.id, attached);
  const inputs = connectedMidiInputs(midi);
  assert.strictEqual(inputs.length, 1);
  assert.strictEqual(inputs[0]._midiInput, attached);
  assert.strictEqual(midi.updateCount, 1);
});

test("reconnecting a port with the same id binds the replacement native input", () => {
  const original = nativePort("same-id");
  const replacement = nativePort("same-id");
  const midi = nativeMidi([original]);
  const originalWrapper = midi.inputs[0];
  midi.interface.inputs.set(replacement.id, replacement);
  const inputs = connectedMidiInputs(midi);
  assert.strictEqual(inputs.length, 1);
  assert.notStrictEqual(inputs[0], originalWrapper);
  assert.strictEqual(inputs[0]._midiInput, replacement);
});

test("several removed inputs cannot survive a library cache reconciliation bug", () => {
  const removedA = nativePort("removed-a"), removedB = nativePort("removed-b");
  const stillConnected = nativePort("still-connected");
  const midi = nativeMidi([stillConnected], [wrapper(removedA), wrapper(removedB), wrapper(stillConnected)]);
  // WebMidi 2.5 uses forward splice: removing one entry may skip the next entry.
  midi._updateInputs = function () {
    this.updateCount += 1;
    for (let index = 0; index < this.inputs.length; index += 1) {
      if (!this.interface.inputs.has(this.inputs[index].id)) this.inputs.splice(index, 1);
    }
  };
  const inputs = connectedMidiInputs(midi);
  assert.strictEqual(inputs.length, 1);
  assert.strictEqual(inputs[0]._midiInput, stillConnected);
  assert(midi.inputs.some(input => input.id === removedB.id), "The fixture must leave a stale cached input");
});

test("a stale same-id wrapper is rejected if the adapter cannot replace it", () => {
  const original = nativePort("same-id"), replacement = nativePort("same-id");
  const midi = nativeMidi([replacement], [wrapper(original)]);
  midi._updateInputs = () => {};
  assert.deepStrictEqual(connectedMidiInputs(midi), []);
});

test("overlapping MIDI enable requests share one permission request and complete all callers once", () => {
  const pending = [];
  const midi = { enabled: false, enableCount: 0, enable(callback) {
    this.enableCount += 1;
    pending.push(callback);
  } };
  const completed = [];
  enableMidiConnection(midi, error => completed.push(["home", error]));
  enableMidiConnection(midi, error => completed.push(["input", error]));
  assert.strictEqual(midi.enableCount, 1);
  midi.enabled = true;
  pending[0](null);
  pending[0](null);
  assert.deepStrictEqual(completed, [["home", null], ["input", null]]);
  enableMidiConnection(midi, error => completed.push(["workshop", error]));
  assert.strictEqual(midi.enableCount, 1);
  assert.deepStrictEqual(completed[2], ["workshop", null]);
});

test("a failed MIDI permission request notifies all waiters and allows a later retry", () => {
  const pending = [];
  const midi = { enabled: false, enable(callback) { pending.push(callback); } };
  const permissionError = new Error("Permission unavailable");
  const failures = [];
  enableMidiConnection(midi, error => failures.push(error));
  enableMidiConnection(midi, error => failures.push(error));
  pending[0](permissionError);
  assert.deepStrictEqual(failures, [permissionError, permissionError]);
  let retryCompleted = false;
  enableMidiConnection(midi, error => { assert.strictEqual(error, null); retryCompleted = true; });
  assert.strictEqual(pending.length, 2);
  pending[1](null);
  assert.strictEqual(retryCompleted, true);
});

test("a synchronous platform MIDI failure does not leave the enable request locked", () => {
  const failure = new Error("Native MIDI unavailable");
  const midi = { enabled: false, enable() { throw failure; } };
  const failures = [];
  enableMidiConnection(midi, error => failures.push(error));
  enableMidiConnection(midi, error => failures.push(error));
  assert.deepStrictEqual(failures, [failure, failure]);
});

process.stdout.write("MIDI connection tests passed.\n");
