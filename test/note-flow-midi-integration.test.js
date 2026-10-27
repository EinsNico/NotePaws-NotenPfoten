const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const Vue = require("vue");
const compiler = require("vue-template-compiler");

const root = path.resolve(__dirname, "../src");

function evaluate(source, imports = {}) {
  const compiled = babel.transform(source, {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  }).code;
  const loaded = { exports: {} };
  const localRequire = name => {
    assert(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", compiled)(
    localRequire,
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function componentScript(relativePath) {
  const match = read(relativePath).match(/<script>([\s\S]*?)<\/script>/);
  assert(match, `Missing script in ${relativePath}`);
  return match[1];
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

let midiDeviceId=0;
function createMidiDevice() {
  const noteOn = new Set(), noteOff = new Set();
  return {
    id: "synthetic-" + (++midiDeviceId),
    state: "connected",
    connection: "open",
    attachmentCount: 0,
    on(type, channel, listener) {
      assert(["noteon","noteoff"].includes(type));
      assert.strictEqual(channel, "all");
      this.attachmentCount += 1;
      (type === "noteon" ? noteOn : noteOff).add(listener);
    },
    removeListener(type, channel, listener) {
      if (channel === "all") (type === "noteon" ? noteOn : noteOff).delete(listener);
    },
    send(octave, number, velocity = 0.8, channel = 1) {
      Array.from(noteOn).forEach(listener => listener({ note: { octave, number }, velocity, channel, target:this }));
    },
    release(octave, number, channel = 1) {
      Array.from(noteOff).forEach(listener => listener({note:{octave,number},channel,target:this}));
    },
    listenerCount(type = "noteon") {
      return (type === "noteon" ? noteOn : noteOff).size;
    }
  };
}

function createWebMidi() {
  const handlers = { connected: [], disconnected: [] };
  return {
    enabled: false,
    supported: true,
    inputs: [],
    enableCount: 0,
    enable(callback) {
      this.enableCount += 1;
      this.enabled = true;
      callback(null);
    },
    addListener(type, listener) {
      handlers[type].push(listener);
    },
    removeListener(type, listener) {
      handlers[type] = handlers[type].filter(candidate => candidate !== listener);
    },
    emit(type) {
      handlers[type].slice().forEach(listener => listener());
    },
    listenerCount(type) {
      return handlers[type].length;
    },
    disable() {
      this.enabled = false;
    }
  };
}

function createEventTarget() {
  const handlers = {};
  return {
    hidden: false,
    addEventListener(type, listener) {
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(listener);
    },
    removeEventListener(type, listener) {
      handlers[type] = (handlers[type] || []).filter(candidate => candidate !== listener);
    },
    emit(type) {
      (handlers[type] || []).slice().forEach(listener => listener());
    },
    listenerCount(type) {
      return (handlers[type] || []).length;
    }
  };
}

function createHomeComponent(webMidi) {
  const component = evaluate(componentScript("components/HomeMenu.vue"), {
    "./AppInfoDialog": {},
    "./BrandWordmark": {},
    "./HomeMusicBackdrop": {},
    "./DailyTasksButton": {},
    webmidi: webMidi,
    "../model/MidiConnection": midiConnection,
    lockr: { get: () => null },
    "../model/PrestigeArchive": {
      createEmptyPrestigeArchive: () => ({ version: 1, segments: [] }),
      summarizePrestigeArchive: () => ({ prestige: 0 })
    }
  }).default;
  const instance = Object.assign(component.data(), {
    $t: key => key
  });
  Object.keys(component.methods).forEach(name => {
    instance[name] = component.methods[name].bind(instance);
  });
  component.mounted.call(instance);
  return {
    instance,
    destroy() {
      component.beforeDestroy.call(instance);
    }
  };
}

function createMidiComponent(webMidi, onNote = () => {}) {
  const component = evaluate(componentScript("components/MidiInput.vue"), {
    webmidi: webMidi,
    "../model/MidiConnection": midiConnection,
    "../model/Utils": {},
    "../model/Options": {}
  }).default;
  const emitted = [];
  const instance = Object.assign(component.data(), {
    showOctave: true,
    noteNames: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"],
    $t: key => key,
    $emit(name, value) {
      emitted.push([name, value]);
      if (name === "solved") onNote(value);
    }
  });
  Object.keys(component.methods).forEach(name => {
    instance[name] = component.methods[name].bind(instance);
  });
  component.mounted.call(instance);
  return {
    instance,
    emitted,
    destroy() {
      component.beforeDestroy.call(instance);
    }
  };
}

const originalGlobals = {
  window: global.window,
  document: global.document,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval
};
const intervals = new Map();
let nextIntervalId = 1;
global.window = createEventTarget();
global.document = createEventTarget();
global.setInterval = (callback, delay) => {
  const id = nextIntervalId++;
  intervals.set(id, { callback, delay });
  return id;
};
global.clearInterval = id => intervals.delete(id);
function tickIntervals() {
  Array.from(intervals.values()).forEach(timer => timer.callback());
}

const midiConnection = evaluate(read("model/MidiConnection.js"));
const playback = evaluate(read("model/NoteFlowPlayback.js"));
const input = evaluate(read("model/NoteFlowInput.js"), {
  "./NoteFlowPlayback": playback
});
const staffComponent = evaluate(componentScript("components/NoteFlowStaffPreview.vue"), {
  "../model/AudioSynchronization": { resume() {} },
  "../model/AudioSynchronizationPlayback": { watchAudioTimingChanges() { return () => {}; } },
  "abcjs/src/write/creation/glyphs": {},
  "./ButtonInput": {},
  "./KeyboardInput": {},
  "./MidiInput": {},
  "../model/NoteFlowStaffLayout": {},
  "../model/NoteFlowGenerator": {},
  "../model/NoteFlowPlayback": playback,
  "../model/NoteFlowInput": input,
  "../model/PianoAudio": {},
  "../model/NoteFlowKeyLabels": {},
  "../model/Options": {}
}).default;

function createStaff(expectedValues, behavior = "wait", nextExpectedValues = [62]) {
  const instance = {
    playback: playback.startNoteFlowPlayback(
      playback.createNoteFlowPlayback({
        events: [
          { expectedValues },
          { expectedValues: nextExpectedValues }
        ]
      }, { behavior }),
      0
    ),
    behavior,
    pendingInputValues: [],
    pendingInputEventIndex: null,
    visibleWindowStart: 0,
    soundEnabled: false,
    animationFrame: null,
    playInputSound() {},
    emitRoundProgress() {},
    stopAnimationFrame() {}
  };
  Object.defineProperty(instance, "playbackStatus", {
    get() { return this.playback.status; }
  });
  Object.defineProperty(instance, "canSubmitInput", {
    get() { return this.playbackStatus === "running" || this.playbackStatus === "waiting"; }
  });
  ["submitInput", "submitMidiNote", "hasPendingForEvent", "isEnteredNote"].forEach(name => {
    instance[name] = staffComponent.methods[name].bind(instance);
  });
  return instance;
}

test("physical key release, zero-velocity note-off and duplicate channels do not reuse held attacks", () => {
  const webMidi=createWebMidi(),device=createMidiDevice();webMidi.inputs=[device];
  const midi=createMidiComponent(webMidi),events=midi.emitted;
  device.send(4,60);device.send(4,60);device.send(4,60,.8,2);
  assert.deepStrictEqual(events.filter(event=>event[0]==='solved'),[['solved',48]]);
  device.release(4,60);assert.strictEqual(events.filter(event=>event[0]==='released').length,0);
  device.release(4,60,2);assert.deepStrictEqual(events.filter(event=>event[0]==='released'),[['released',48]]);
  device.send(4,60);device.send(4,60,0);
  assert.strictEqual(events.filter(event=>event[0]==='solved').length,2);
  assert.strictEqual(events.filter(event=>event[0]==='released').length,2);
  device.send(4,62);global.document.hidden=true;global.document.emit('visibilitychange');global.document.hidden=false;
  assert(events.some(event=>event[0]==='released'&&event[1]===50));
  assert.strictEqual(device.listenerCount('noteoff'),1);midi.destroy();
  assert.strictEqual(device.listenerCount('noteoff'),0);assert.strictEqual(device.listenerCount(),0);
});

test("MIDI hot-plug, reconnect and disconnect update the input status", () => {
  const webMidi = createWebMidi();
  const midi = createMidiComponent(webMidi);
  assert.strictEqual(midi.instance.midiIsReady, false);
  assert.strictEqual(midi.instance.errorMessage, "noDeviceFound");

  const device = createMidiDevice();
  webMidi.inputs = [device];
  webMidi.emit("connected");
  assert.strictEqual(midi.instance.midiIsReady, true);
  assert.strictEqual(device.listenerCount(), 1);

  webMidi.inputs = [];
  webMidi.emit("disconnected");
  assert.strictEqual(midi.instance.midiIsReady, false);
  assert.strictEqual(device.listenerCount(), 0);
  webMidi.inputs = [device];
  midi.instance.initMidi();
  assert.strictEqual(midi.instance.midiIsReady, true);
  assert.strictEqual(device.listenerCount(), 1);
  midi.destroy();
  assert.strictEqual(device.listenerCount(), 0);
  assert.strictEqual(webMidi.enabled, true);

  const second = createMidiComponent(webMidi);
  assert.strictEqual(second.instance.midiIsReady, true);
  webMidi.inputs = [];
  webMidi.emit("disconnected");
  assert.strictEqual(second.instance.midiIsReady, false);
  second.destroy();
});

test("silent MIDI rendering preserves note input, hot-plug listeners and cleanup while other modes retain their template", () => {
  const webMidi=createWebMidi(),device=createMidiDevice();webMidi.inputs=[device];
  const parsed=compiler.parseComponent(read("components/MidiInput.vue"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const definition=evaluate(parsed.script.content,{
    webmidi:webMidi,
    "../model/MidiConnection": midiConnection,
    "../model/Utils":{getDisplayNoteNamesArray:()=>["C","C#","D","D#","E","F","F#","G","G#","A","A#","H"]},
    "../model/Options":{noteNaming:"german"}
  }).default;
  assert.strictEqual(definition.props.silent.default,false);
  const view=new Vue(Object.assign({},definition,compiler.compileToFunctions(parsed.template.content),{
    propsData:{silent:true,showOctave:true},methods:Object.assign({},definition.methods,{$t:key=>key})
  })),connections=[],notes=[];
  view.$on("connection-change",value=>connections.push(value));view.$on("solved",value=>notes.push(value));
  definition.mounted.call(view);assert.strictEqual(view._render().isComment,true);assert.strictEqual(device.listenerCount(),1);
  assert.strictEqual(webMidi.listenerCount("connected"),1);assert.strictEqual(webMidi.listenerCount("disconnected"),1);
  device.send(4,60);assert.deepStrictEqual(notes,[48]);assert.strictEqual(view.lastNotePlayed,"C4");assert.strictEqual(view._render().isComment,true);
  view.silent=false;assert.strictEqual(view._render().tag,"div");assert.strictEqual(device.listenerCount(),1);
  view.silent=true;webMidi.inputs=[];webMidi.emit("disconnected");assert.strictEqual(view.midiIsReady,false);assert.strictEqual(device.listenerCount(),0);
  assert.strictEqual(view._render().isComment,true);webMidi.inputs=[device];webMidi.emit("connected");device.send(5,67);
  assert.deepStrictEqual(notes,[48,67]);assert.deepStrictEqual(connections,[false,true,false,true]);assert.strictEqual(device.listenerCount(),1);
  view.$destroy();assert.strictEqual(device.listenerCount(),0);assert.strictEqual(webMidi.listenerCount("connected"),0);assert.strictEqual(webMidi.listenerCount("disconnected"),0);
});

test("home MIDI light detects USB MIDI hot-plug without a tap or restart", () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  global.window = createEventTarget();
  global.document = createEventTarget();
  try {
    const webMidi = createWebMidi();
    const home = createHomeComponent(webMidi);
    assert.strictEqual(home.instance.midiStatus, "disconnected");
    assert.strictEqual(webMidi.enableCount, 1);

    const device = createMidiDevice();
    webMidi.inputs = [device];
    webMidi.emit("connected");
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(webMidi.listenerCount("connected"), 1);
    webMidi.inputs = [];
    webMidi.emit("disconnected");
    assert.strictEqual(home.instance.midiStatus, "disconnected");

    webMidi.disable();
    global.document.emit("resume");
    assert.strictEqual(webMidi.enableCount, 2);
    webMidi.inputs = [device];
    global.window.emit("focus");
    assert.strictEqual(home.instance.midiStatus, "connected");

    home.destroy();
    assert.strictEqual(webMidi.listenerCount("connected"), 0);
    assert.strictEqual(global.document.listenerCount("resume"), 0);
    const reopened = createHomeComponent(webMidi);
    assert.strictEqual(reopened.instance.midiStatus, "connected");
    webMidi.inputs = [];
    webMidi.emit("disconnected");
    assert.strictEqual(reopened.instance.midiStatus, "disconnected");
    reopened.destroy();
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
  }
});

test("the watchdog detects missed disconnects and reconnects without duplicate note listeners", () => {
  const webMidi = createWebMidi();
  const device = createMidiDevice();
  webMidi.inputs = [device];
  const home = createHomeComponent(webMidi);
  const notes = [];
  const midi = createMidiComponent(webMidi, value => notes.push(value));
  const initialAttachments = device.attachmentCount;
  const initialEmissions = midi.emitted.length;
  try {
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);
    for (let tick = 0; tick < 5; tick += 1) tickIntervals();
    assert.strictEqual(device.attachmentCount, initialAttachments);
    assert.strictEqual(midi.emitted.length, initialEmissions, "An unchanged watchdog check must not pause a running round");

    // Simulate a native state update while the old library array and event stream remain stale.
    device.state = "disconnected";
    tickIntervals();
    assert.strictEqual(home.instance.midiStatus, "disconnected");
    assert.strictEqual(midi.instance.midiIsReady, false);
    assert.strictEqual(device.listenerCount(), 0);
    device.send(4, 60);
    assert.deepStrictEqual(notes, []);

    device.state = "connected";
    tickIntervals();
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);
    assert.strictEqual(device.listenerCount(), 1);
    for (let tick = 0; tick < 5; tick += 1) tickIntervals();
    assert.strictEqual(device.attachmentCount, initialAttachments + 2);
    device.send(4, 60);
    assert.deepStrictEqual(notes, [48]);
  } finally {
    home.destroy();
    midi.destroy();
  }
});

test("hidden screens defer checks and Android resume checks the MIDI state immediately", () => {
  const webMidi = createWebMidi();
  const device = createMidiDevice();
  webMidi.inputs = [device];
  const home = createHomeComponent(webMidi);
  const midi = createMidiComponent(webMidi);
  try {
    global.document.hidden = true;
    device.state = "disconnected";
    tickIntervals();
    global.document.emit("visibilitychange");
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);

    global.document.hidden = false;
    global.document.emit("resume");
    assert.strictEqual(home.instance.midiStatus, "disconnected");
    assert.strictEqual(midi.instance.midiIsReady, false);
    assert.strictEqual(device.listenerCount(), 0);

    device.state = "connected";
    global.document.emit("visibilitychange");
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);
    device.state = "disconnected";
    global.window.emit("focus");
    assert.strictEqual(home.instance.midiStatus, "disconnected");
    assert.strictEqual(midi.instance.midiIsReady, false);
    device.state = "connected";
    global.document.emit("deviceready");
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);
  } finally {
    global.document.hidden = false;
    home.destroy();
    midi.destroy();
  }
});

test("closing MIDI views releases every watchdog and foreground listener", () => {
  const webMidi = createWebMidi();
  const device = createMidiDevice();
  webMidi.inputs = [device];
  const home = createHomeComponent(webMidi);
  const midi = createMidiComponent(webMidi);
  assert.strictEqual(intervals.size, 2);
  assert.strictEqual(global.window.listenerCount("focus"), 2);
  ["visibilitychange", "resume", "deviceready"].forEach(type => {
    assert.strictEqual(global.document.listenerCount(type), 2);
  });
  home.destroy();
  midi.destroy();
  assert.strictEqual(intervals.size, 0);
  assert.strictEqual(global.window.listenerCount("focus"), 0);
  ["visibilitychange", "resume", "deviceready"].forEach(type => {
    assert.strictEqual(global.document.listenerCount(type), 0);
  });
  assert.strictEqual(webMidi.listenerCount("connected"), 0);
  assert.strictEqual(webMidi.listenerCount("disconnected"), 0);
  assert.strictEqual(device.listenerCount(), 0);
  assert.strictEqual(webMidi.enabled, true, "Closing a view must preserve the shared MIDI interface");
});

test("simultaneous foreground checks do not restart a pending MIDI permission request", () => {
  const webMidi = createWebMidi();
  const pending = [];
  webMidi.enable = function (callback) {
    this.enableCount += 1;
    pending.push(callback);
  };
  const home = createHomeComponent(webMidi);
  const midi = createMidiComponent(webMidi);
  try {
    global.window.emit("focus");
    global.document.emit("deviceready");
    global.document.emit("resume");
    tickIntervals();
    assert.strictEqual(webMidi.enableCount, 1);
    webMidi.inputs = [createMidiDevice()];
    webMidi.enabled = true;
    pending.forEach(callback => callback(null));
    assert.strictEqual(home.instance.midiStatus, "connected");
    assert.strictEqual(midi.instance.midiIsReady, true);
    assert.strictEqual(webMidi.listenerCount("connected"), 2);
  } finally {
    home.destroy();
    midi.destroy();
  }
});

test("opening a MIDI exercise while its home request is pending preserves one request and ignores the disposed view", () => {
  const webMidi = createWebMidi();
  let complete;
  webMidi.enable = function (callback) {
    this.enableCount += 1;
    complete = callback;
  };
  const home = createHomeComponent(webMidi);
  home.destroy();
  const midi = createMidiComponent(webMidi);
  try {
    assert.strictEqual(webMidi.enableCount, 1);
    const device = createMidiDevice();
    webMidi.inputs = [device];
    webMidi.enabled = true;
    complete(null);
    assert.strictEqual(home.instance.midiStatus, "checking", "A disposed view must ignore the permission callback");
    assert.strictEqual(midi.instance.midiIsReady, true);
    assert.strictEqual(device.listenerCount(), 1);
    assert.strictEqual(webMidi.listenerCount("connected"), 1);
    assert.strictEqual(intervals.size, 1);
    complete(null);
    assert.strictEqual(device.attachmentCount, 2);
  } finally {
    midi.destroy();
  }
});

test("simulated note-on reaches Note Flow with its octave and two-hand pitches", () => {
  const originalPerformance = global.performance;
  global.performance = { now: () => 1050 };
  try {
    const staff = createStaff([48, 67]);
    const device = createMidiDevice();
    const webMidi = createWebMidi();
    webMidi.inputs = [device];
    const midi = createMidiComponent(webMidi, value => staff.submitMidiNote(value));

    device.send(5, 67, 0);
    assert.deepStrictEqual(staff.pendingInputValues, []);
    device.send(5, 67);
    assert.deepStrictEqual(staff.pendingInputValues, [67]);
    device.send(4, 60);
    assert.deepStrictEqual(staff.pendingInputValues, []);
    assert.strictEqual(staff.playback.correctEventCount, 1);
    assert.strictEqual(staff.playback.timeline.events[0].inputResult, "correct");
    assert.strictEqual(midi.instance.lastNotePlayed, "C4");
    midi.destroy();
  } finally {
    global.performance = originalPerformance;
  }
});

test("wait-mode melody marks each recognized MIDI note and keeps it after a wrong key", () => {
  const originalPerformance = global.performance;
  global.performance = { now: () => 1050 };
  try {
    const staff = createStaff([48, 67]);
    staff.submitMidiNote(67);
    assert.deepStrictEqual(staff.pendingInputValues, [67]);
    assert.strictEqual(staff.isEnteredNote(0, { value: 67 }), true);
    assert.strictEqual(staff.isEnteredNote(0, { value: 48 }), false);
    staff.submitMidiNote(70);
    assert.strictEqual(staff.playback.wrongAttemptCount, 1);
    assert.deepStrictEqual(staff.pendingInputValues, [67]);
    assert.strictEqual(staff.isEnteredNote(0, { value: 67 }), true);
    staff.submitMidiNote(48);
    assert.strictEqual(staff.playback.correctEventCount, 1);
    assert.deepStrictEqual(staff.pendingInputValues, []);
  } finally {
    global.performance = originalPerformance;
  }
});

test("the same two MIDI notes can be recognized again at the next event", () => {
  const originalPerformance = global.performance;
  let now = 1050;
  global.performance = { now: () => now };
  try {
    const staff = createStaff([48, 67], "wait", [48, 67]);
    staff.submitMidiNote(48);
    staff.submitMidiNote(67);
    assert.strictEqual(staff.playback.correctEventCount, 1);
    now = 2400;
    staff.submitMidiNote(48);
    assert.deepStrictEqual(staff.pendingInputValues, [48]);
    assert.strictEqual(staff.isEnteredNote(1, { value: 48 }), true);
    staff.submitMidiNote(67);
    assert.strictEqual(staff.playback.correctEventCount, 2);
  } finally {
    global.performance = originalPerformance;
  }
});

test("a MIDI note in the wrong octave is not accepted by Note Flow", () => {
  const originalPerformance = global.performance;
  global.performance = { now: () => 1050 };
  try {
    const staff = createStaff([60]);
    const device = createMidiDevice();
    const webMidi = createWebMidi();
    webMidi.inputs = [device];
    const midi = createMidiComponent(webMidi, value => staff.submitMidiNote(value));
    device.send(4, 60);
    assert.strictEqual(staff.playback.wrongAttemptCount, 1);
    assert.strictEqual(staff.playback.timeline.events[0].inputResult, "wrong");
    midi.destroy();
  } finally {
    global.performance = originalPerformance;
  }
});

process.stdout.write("Note Flow MIDI integration tests passed.\n");
assert.strictEqual(intervals.size, 0, "Every mounted MIDI view must stop its watchdog");
Object.keys(originalGlobals).forEach(name => { global[name] = originalGlobals[name]; });
