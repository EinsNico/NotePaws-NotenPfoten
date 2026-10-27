const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");
const compiler = require("vue-template-compiler");
global.regeneratorRuntime = require("babel-runtime/regenerator");

// Execute the actual SFC scripts and compiled templates, with real practice and
// notation models. Only the browser clock, frame scheduler and audio are fakes.
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJs = Module._extensions[".js"], originalVue = Module._extensions[".vue"];
Module._extensions[".js"] = (loaded, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(loaded, filename);
  loaded._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = loaded => { loaded.exports = { default: {} }; };
function loadView(name) {
  const filename = path.join(sourceRoot, "components", name + ".vue");
  const source = fs.readFileSync(filename, "utf8");
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(babel.transform(compiler.parseComponent(source).script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  const definition = loaded.exports.default;
  const compiled = compiler.compileToFunctions(compiler.parseComponent(source).template.content);
  definition.render = compiled.render;
  definition.staticRenderFns = compiled.staticRenderFns;
  return { View: Vue.extend(definition), definition, source };
}
const Rhythm = loadView("NoteFlowRhythmPreview");
const Melody = loadView("NoteFlowGamePreview");
const Chords = loadView("NoteFlowChordTraining");
const Stream = loadView("NoteFlowChordRhythmStream");
const Midi = loadView("MidiInput");
Melody.View.options.components.NoteFlowRhythmPreview = Rhythm.View;
Chords.View.options.components.NoteFlowChordRhythmStream = Stream.View;
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const { getNoteFlowTouchAudioValue } = require("../src/model/NoteFlowInput");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordRhythmPractice } = require("../src/model/NoteFlowChordRhythmPractice");
const Options = require("../src/model/Options").default;
const Storage = require("../src/model/NoteFlowRoundStorage").default;
const AudioSync = require("../src/model/AudioSynchronization").default;
Module._extensions[".js"] = originalJs;
if (originalVue) Module._extensions[".vue"] = originalVue;
else delete Module._extensions[".vue"];

const originals = {
  performance: global.performance, document: global.document, window: global.window,
  raf: global.requestAnimationFrame, cancel: global.cancelAnimationFrame,
  timeout: global.setTimeout, clearTimeout: global.clearTimeout,
  interval: global.setInterval, clearInterval: global.clearInterval,
  save: Storage.saveRound, resume: AudioSync.resume,
  preparation: Options.preparationSeconds, displayNote: Options.displayNote
};
let now = 1000, serial = 0, checks = 0;
const timeouts = new Map(), intervals = new Map(), frames = new Map(), views = [];
global.performance = { now: () => now };
global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
global.window = { addEventListener() {}, removeEventListener() {} };
global.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
global.cancelAnimationFrame = id => frames.delete(id);
global.setTimeout = (callback, duration) => {
  const id = ++serial; timeouts.set(id, { callback, at: now + duration }); return id;
};
global.clearTimeout = id => timeouts.delete(id);
global.setInterval = callback => { const id = ++serial; intervals.set(id, callback); return id; };
global.clearInterval = id => intervals.delete(id);
Storage.saveRound = async () => ({ saved: true });
AudioSync.resume = () => Promise.resolve(true);
Options.preparationSeconds = 0;
function wall(delta) {
  now += delta;
  let due;
  while ((due = Array.from(timeouts.entries()).find(([, timer]) => timer.at <= now))) {
    timeouts.delete(due[0]); due[1].callback();
  }
}
function frame(view, delta) {
  now += delta;
  const id = view.frameRequest === undefined ? view.animationFrame : view.frameRequest;
  const callback = frames.get(id);
  assert(callback, "the actual view scheduled a frame");
  frames.delete(id); callback(now);
}
const translate = (key, args) => key === "FLOW_WRONG_PITCH_MARKER_VALUE"
  ? `Wrong note played: ${args.note}` : key;
function remember(view) { views.push(view); return view; }
function melody({ behavior = "wait", inputMode = "midi", displayNote = true,
  two = false, key = "C-major", pitches = null } = {}) {
  const menuOptions = {
    handMode: two ? "two" : "single", clef: two ? ["bass", "treble"] : ["treble"],
    secondaryNotesPerBlock: 4, tonalityMode: "circle", selectedKey: key,
    accidentals: key === "C-major" ? "no" : "sharpAndFlat", difficulty: "normal", movement: "calm", bpm: 50,
    gameLength: 20, behavior, inputMode, displayNote, rhythmMeter: "4/4",
    rhythmValues: { treble: ["quarter"], bass: ["quarter"] }
  };
  const parent = remember(new Melody.View({ propsData: { preview: { menuOptions } },
    methods: { $t: translate } }));
  const score = generateNoteFlowRhythmicScore(parent.generatedCycle,
    Object.assign({}, parent.rhythmOptions, { measureCount: 16, restChance: 0 }));
  if (pitches) score.measures.forEach(measure => Object.keys(measure.voices).forEach(hand => {
    measure.voices[hand].forEach(event => {
      if (event.kind !== "note") return;
      const value = pitches[hand];
      const degree = parent.generatedCycle.tonalityPlan.key.scalePitchClasses.indexOf(value % 12) + 1;
      event.note = Object.assign({}, event.note, { value, clef: hand, scaleDegree: degree });
    });
  }));
  const child = remember(new Rhythm.View({ propsData: {
    cycle: parent.generatedCycle, score, bpm: 50, behavior, inputMode, displayNote,
    training: true, rhythmOptions: parent.rhythmOptions
  }, methods: { $t: translate } }));
  const sounds = [];
  child.pianoPlayer = { stopAll() {}, play(value) { sounds.push(value); } };
  child.resetPreview(); child.handleMidiConnection(true); child.togglePreview();
  frame(child, 0);
  return { parent, child, sounds };
}
function chords({ behavior = "wait", displayNote = true, two = true } = {}) {
  const plan = Vue.observable(createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: "C-major",
    chordSize: 3, bassNote: true, handMode: two ? "two" : "single", singleHand: "treble",
    behavior, displayNote, bpm: 50, gameLength: 20, rhythmMeter: "4/4", rhythmValues: ["quarter"] }));
  const view = remember(new Chords.View({ propsData: { plan }, methods: { $t: translate } }));
  view.handleMidiConnection(true); view.playMotion(); frame(view, 0);
  return view;
}
function stream(view) {
  return remember(new Stream.View({ propsData: {
    score: view.rhythmScore, elapsedMs: view.practice.elapsedMs,
    practiceState: view.practice, tonality: view.tonality,
    wrongPitchMarkers: view.visibleWrongPitchMarkers
  }, methods: { $t: translate } }));
}
function collisionChord(key) {
  const plan = Vue.observable(createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: key,
    accidentals: "sharpAndFlat", chordSize: 3, bassNote: false, handMode: "single", singleHand: "treble",
    behavior: "wait", displayNote: true, bpm: 50, gameLength: 20,
    rhythmMeter: "4/4", rhythmValues: ["quarter"] }));
  const view = remember(new Chords.View({ propsData: { plan }, methods: { $t: translate } }));
  // A legal E-minor voicing in either key puts E4 nearest to C4/C-sharp4.
  // Generate the actual product score and practice from this deliberate fixture.
  const chord = Object.assign({}, plan.blocks[0].chords[0], {
    values: [52, 55, 59], trebleValues: [52, 55, 59], bassValues: [], bassValue: null,
    pitchClasses: [4, 7, 11], scaleDegree: key === "C-major" ? 3 : 2,
    sourceDegree: key === "C-major" ? 3 : 2, quality: "minor"
  });
  view.rhythmScore = generateNoteFlowChordRhythmicScore(Object.assign({}, plan, {
    blocks: [{ chords: [chord, chord, chord, chord] }]
  }), { meter: "4/4", allowedValues: ["quarter"], bpm: 50, seed: "collision-fixture" });
  view.rhythmState = createNoteFlowChordRhythmPractice(view.rhythmScore, { behavior: "wait" });
  view.handleMidiConnection(true); view.playMotion(); frame(view, 0);
  return view;
}
function markerNotation(view) {
  if (view.practiceState) return view;
  return stream(view);
}
function textOf(node) {
  return node.text || (node.children || []).map(textOf).join("");
}
function state(view) { return view.practiceState || view.practice; }
function target(view) { const s = state(view); return s.timeline.targets[s.targetIndex]; }
function press(view, value) {
  // Repeated synthetic wrong-pitch trials represent separate physical taps.
  if(state(view).grip && state(view).grip.heldValues.includes(value)
    && !target(view).expectedValues.includes(value)) view.releaseMidi(value);
  if (view.submitMidi) view.submitMidi(value); else view.pressMidi(value);
}
function wrong(view, skip = []) {
  const expected = target(view).expectedValues;
  return Array.from({ length: 127 }, (_, i) => i + 1)
    .find(value => !expected.includes(value) && !skip.includes(value)
      && value >= Math.min(...expected) - 2 && value <= Math.max(...expected) + 2);
}
function timerIds(view) { return Array.from((view._wrongPitchMarkerTimers || new Map()).values()); }
function cleared(view, ids) {
  assert.deepStrictEqual(view.wrongPitchMarkers, []);
  assert.strictEqual(timerIds(view).length, 0);
  ids.forEach(id => assert(!timeouts.has(id), "marker timeout was cancelled"));
}
function nodes(view) {
  const all = [];
  function visit(node, ancestors) {
    if (!node) return;
    all.push({ node, ancestors });
    (node.children || []).forEach(child => visit(child, ancestors.concat(node)));
  }
  visit(view._render(), []); return all;
}
function hasClass(node, name) {
  const data = node.data || {};
  return (data.staticClass || "").split(/\s+/).includes(name);
}
function markerNodes(view) { return nodes(view).filter(({ node }) => hasClass(node, "wrong-pitch-marker")); }
function css(source, selector) {
  const block = source.match(new RegExp("\\." + selector + "\\s*\\{([^}]+)\\}"))[1];
  return Object.fromEntries(block.split(";").filter(part => part.includes(":"))
    .map(part => part.trim().split(/:\s*/)));
}
async function test(name, body) {
  await body(); await Vue.nextTick(); checks++;
  process.stdout.write(`✓ ${name}\n`);
  views.splice(0).forEach(view => { if (!view._isDestroyed) view.$destroy(); });
  assert.strictEqual(timeouts.size, 0, "destroy leaves no marker timeout");
  assert.strictEqual(intervals.size, 0, "destroy leaves no round interval");
  assert.strictEqual(frames.size, 0, "destroy leaves no frame request");
}

async function run() {
  await test("real MIDI C4 is internal 48 and its marker uses the actual C4 ledger line", () => {
    const { child, sounds } = melody({ pitches: { treble: 50 } });
    const midi = remember(new Midi.View({ propsData: { isSharp: true, showOctave: true }, methods: { $t: translate } }));
    midi.boundMidiInputs = [];
    midi.$on("solved", child.submitMidi);
    midi.handleNoteOn({ velocity: 0, note: { number: 60, octave: 4 } });
    assert.strictEqual(child.wrongPitchMarkers.length, 0);
    midi.handleNoteOn({ velocity: 0.8, note: { number: 60, octave: 4 } });
    assert.deepStrictEqual(sounds, [48]);
    const marker = child.visibleWrongPitchMarkers[0];
    const staff = child.layout.staves[0];
    assert.strictEqual(marker.value, 48);
    assert.strictEqual(marker.note, "C4");
    assert.strictEqual(marker.y, staff.bottomLineY + 10);
    assert.deepStrictEqual(marker.ledgerLineYs, [staff.bottomLineY + 10]);
    assert.strictEqual(child.practiceState.wrongCount, 1);
  });
  await test("waiting-mode dots expire at 1000 wall milliseconds with no animation frames", () => {
    const { child } = melody(); const index = child.practiceState.targetIndex;
    press(child, wrong(child)); assert.strictEqual(child.visibleWrongPitchMarkers.length, 1);
    assert.strictEqual(child.practiceState.status, "waiting");
    wall(999); assert.strictEqual(child.visibleWrongPitchMarkers.length, 1);
    wall(1); cleared(child, []);
    assert.strictEqual(child.practiceState.targetIndex, index);
    assert.strictEqual(child.practiceState.elapsedMs, target(child).startMs);
  });
  await test("right pitches at wrong timing create no dot despite wrong grading, in both modes", () => {
    const { child } = melody(); const chord = chords();
    [child, chord].forEach(view => {
      target(view).expectedValues.forEach(value => press(view, value));
      const attemptedIndex = state(view).targetIndex;
      assert(attemptedIndex > 0);
      // Physically release the completed grip, then play the next target early.
      state(view).grip.heldValues.forEach(value => view.releaseMidi(value));
      // Deliberately play the following target before its scheduled onset.
      target(view).expectedValues.forEach(value => press(view, value));
      assert.strictEqual(state(view).results[attemptedIndex], "early");
      assert(state(view).wrongCount > 0);
      assert.strictEqual(view.visibleWrongPitchMarkers.length, 0);
    });
  });
  await test("all multi-voice expected pitches clear errors, including a repeated correct partial pitch", () => {
    const { child } = melody({ two: true, pitches: { bass: 36, treble: 60 } });
    press(child, 36); press(child, 37);
    assert.strictEqual(child.visibleWrongPitchMarkers.length, 1);
    const ids = timerIds(child);
    press(child, 36); cleared(child, ids);
    assert.strictEqual(child.practiceState.targetIndex, 0);
    assert.deepStrictEqual(child.practiceState.pendingValues, [36]);
    press(child, 60); assert.strictEqual(child.practiceState.correctCount, 1);
    assert.strictEqual(child.visibleWrongPitchMarkers.length, 0);
  });
  await test("a duplicate correct chord tone clears the dot even when the collector returns unchanged", () => {
    const chord = chords(); const right = target(chord).expectedValues[0];
    press(chord, right); press(chord, wrong(chord));
    const ids = timerIds(chord), beforeCount = chord.practice.wrongCount;
    press(chord, right); cleared(chord, ids);
    assert.strictEqual(chord.practice.wrongCount, beforeCount);
    assert(chord.practice.pendingValues.includes(right));
  });
  await test("an actual wrong octave is marked while a screen pitch class uses the audible octave", () => {
    const { child } = melody({ pitches: { treble: 50 } });
    press(child, 62); assert.strictEqual(child.visibleWrongPitchMarkers[0].value, 62);
    assert.strictEqual(child.visibleWrongPitchMarkers[0].y, child.layout.staves[0].bottomLineY - 30);
    ["button", "keyboard"].forEach(inputMode => {
      const touch = melody({ inputMode, pitches: { treble: 62 } });
      touch.child.submitTouch(0);
      const audible = getNoteFlowTouchAudioValue(target(touch.child).expectedValues, [], 0);
      assert.strictEqual(audible, 60);
      assert.deepStrictEqual(touch.sounds, [audible]);
      assert.strictEqual(touch.child.visibleWrongPitchMarkers[0].value, audible);
      touch.child.submitTouch(2); cleared(touch.child, []);
      assert.strictEqual(touch.child.practiceState.correctCount, 1);
    });
  });
  await test("multiple wrong chord pitches coexist and expire separately; repeating refreshes one pitch", () => {
    const chord = chords(), first = wrong(chord), second = wrong(chord, [first]);
    press(chord, first); wall(300); press(chord, second);
    assert.deepStrictEqual(chord.visibleWrongPitchMarkers.map(marker => marker.value), [first, second]);
    wall(400); press(chord, first);
    assert.strictEqual(chord.visibleWrongPitchMarkers.length, 2);
    wall(599); assert.strictEqual(chord.visibleWrongPitchMarkers.length, 2);
    wall(1); assert.deepStrictEqual(chord.visibleWrongPitchMarkers.map(marker => marker.value), [first]);
    wall(399); assert.strictEqual(chord.visibleWrongPitchMarkers.length, 1);
    wall(1); cleared(chord, []);
    assert.strictEqual(chord.practice.targetIndex, 0);
  });
  await test("nearest sounding expected voice selects the staff, with a stable lower-pitch tie", () => {
    const { child } = melody({ two: true, pitches: { bass: 36, treble: 60 } });
    press(child, 37); assert.strictEqual(child.visibleWrongPitchMarkers[0].clef, "bass");
    press(child, 59); assert.strictEqual(child.visibleWrongPitchMarkers[1].clef, "treble");
    press(child, 48); assert.strictEqual(child.visibleWrongPitchMarkers[2].clef, "bass");
  });
  await test("missed targets create no dots and a frame target change cancels old dots and timers", async () => {
    [melody({ behavior: "continuous" }).child, chords({ behavior: "continuous" })].forEach(view => {
      press(view, wrong(view)); const ids = timerIds(view), index = state(view).targetIndex;
      frame(view, 1200); assert(state(view).targetIndex > index);
      assert(state(view).missedCount > 0); cleared(view, ids);
    });
    await Vue.nextTick();
  });
  await test("a timed-out partial chord changes grading without inventing a wrong-pitch dot", () => {
    const chord = chords({ behavior: "continuous" });
    target(chord).expectedValues.forEach(value => press(chord, value));
    frame(chord, 450);
    press(chord, target(chord).expectedValues[0]);
    assert.strictEqual(chord.practice.pendingValues.length, 1);
    frame(chord, chord.strikeWindowMs);
    assert.strictEqual(chord.practice.pendingValues.length, 0);
    assert(chord.practice.wrongCount > 0);
    assert.strictEqual(chord.visibleWrongPitchMarkers.length, 0);
    assert.strictEqual(timerIds(chord).length, 0);
  });
  await test("advancing before input leaves the fresh target's marker alive after Vue watcher flush", async () => {
    for (const factory of [() => melody({ behavior: "continuous" }).child, () => chords({ behavior: "continuous" })]) {
      const view = factory();
      const oldIndex = state(view).targetIndex;
      const next = state(view).timeline.targets[oldIndex + 1];
      const value = next.expectedValues[0] + 1;
      assert(!next.expectedValues.includes(value));
      press(view, wrong(view));
      now += next.startMs - state(view).elapsedMs;
      press(view, value);
      assert.strictEqual(state(view).targetIndex, oldIndex + 1);
      assert.deepStrictEqual(view.visibleWrongPitchMarkers.map(marker => marker.value), [value]);
      await Vue.nextTick();
      assert.deepStrictEqual(view.visibleWrongPitchMarkers.map(marker => marker.value), [value]);
      wall(1000); cleared(view, []);
    }
  });
  await test("session flags suppress markers without suppressing grading or using the global single-note preference", async () => {
    Options.displayNote = false;
    const on = melody().child, chordOn = chords();
    [on, chordOn].forEach(view => { press(view, wrong(view)); assert.strictEqual(view.visibleWrongPitchMarkers.length, 1); });
    Options.displayNote = true;
    const off = melody({ displayNote: false }).child, chordOff = chords({ displayNote: false });
    [off, chordOff].forEach(view => {
      press(view, wrong(view)); assert.strictEqual(view.visibleWrongPitchMarkers.length, 0);
      assert.strictEqual(state(view).wrongCount, 1); assert.strictEqual(timerIds(view).length, 0);
    });
    on.displayNote = false; chordOn.plan.options.displayNote = false;
    await Vue.nextTick(); cleared(on, []); cleared(chordOn, []);
    const parent = melody({ displayNote: false }).parent;
    const childNode = nodes(parent).find(({ node }) => node.componentOptions
      && node.componentOptions.tag === "NoteFlowRhythmPreview");
    assert(childNode, "the actual parent template instantiates rhythm notation");
    assert.strictEqual(childNode.node.componentOptions.propsData.displayNote, false);
    const chordView = chords(); press(chordView, wrong(chordView));
    const streamNode = nodes(chordView).find(({ node }) => node.componentOptions
      && node.componentOptions.tag === "NoteFlowChordRhythmStream");
    assert.deepStrictEqual(streamNode.node.componentOptions.propsData.wrongPitchMarkers, chordView.visibleWrongPitchMarkers);
  });
  await test("enabling the display leaves actual melody and chord grading identical", () => {
    [displayNote => melody({ displayNote }).child, displayNote => chords({ displayNote })].forEach(factory => {
      const outcomes = [true, false].map(displayNote => {
        const view = factory(displayNote);
        press(view, wrong(view));
        target(view).expectedValues.forEach(value => press(view, value));
        state(view).grip.heldValues.forEach(value => view.releaseMidi(value));
        target(view).expectedValues.forEach(value => press(view, value));
        const s = state(view);
        const outcome = Object.fromEntries(["targetIndex", "pendingValues", "feedback",
          "correctCount", "wrongCount", "missedCount", "correctFirstTryCount",
          "preciseEventCount", "earlyAttemptCount", "lateAttemptCount",
          "totalAbsoluteTimingOffsetMs"].map(key => [key, s[key]]));
        outcome.results = s.results.slice(0, s.targetIndex);
        return outcome;
      });
      assert.deepStrictEqual(outcomes[0], outcomes[1]);
    });
  });
  await test("pause, already-paused early return, disconnect and leaving cancel timers in both modes", () => {
    [() => melody().child, () => chords()].forEach(factory => {
      ["pause", "disconnect", "destroy", "early-return"].forEach(action => {
        const view = factory(); press(view, wrong(view)); const ids = timerIds(view);
        if (action === "disconnect") view.handleMidiConnection(false);
        else if (action === "destroy") view.$destroy();
        else {
          if (action === "early-return") {
            if (view.practiceState) view.practiceState = Object.assign({}, view.practiceState, { status: "paused" });
            else view.rhythmState = Object.assign({}, view.rhythmState, { practice: Object.assign({}, view.practice, { status: "paused" }) });
          }
          view.pauseMotion();
        }
        cleared(view, ids); wall(1000); cleared(view, ids);
      });
    });
  });
  await test("melody reset and finish, chord initialize/restart and end remove every dot", () => {
    ["resetPreview", "finishMotion"].forEach(method => {
      const child = melody().child; press(child, wrong(child)); const ids = timerIds(child);
      child[method](); cleared(child, ids);
    });
    ["initializeTraining", "restartRound", "endRound"].forEach(method => {
      const chord = chords(); press(chord, wrong(chord)); const ids = timerIds(chord);
      chord[method](); cleared(chord, ids);
    });
  });
  await test("compiled SVG has a fixed play-line filled blue dot, lighter outline, ledger, accidental and pitch title", () => {
    const child = melody({ pitches: { treble: 50 } }).child;
    press(child, 49);
    const chord = chords(); press(chord, wrong(chord)); const chordStream = stream(chord);
    [[child, Rhythm.source, child.layout.playLineX], [chordStream, Stream.source, chordStream.playLineX]]
      .forEach(([view, source, x]) => {
        const marker = markerNodes(view)[0]; assert(marker);
        assert.strictEqual(marker.node.data.attrs.transform, `translate(${x} 0)`);
        assert(!marker.ancestors.some(node => node.data && node.data.attrs
          && (node.data.attrs["clip-path"] || node.data.attrs.transform)), "marker is outside the scrolling/clipped notes");
        const dot = marker.node.children.find(node => hasClass(node, "wrong-pitch-dot"));
        assert.strictEqual(dot.tag, "circle"); assert.strictEqual(dot.data.attrs.cx, "0");
        assert.strictEqual(dot.data.attrs.r, "3.5");
        const style = css(source, "wrong-pitch-dot");
        assert(/^#[0-9a-f]{6}$/i.test(style.fill));
        const rgb = style.fill.slice(1).match(/../g).map(v => parseInt(v, 16));
        assert(rgb[2] > rgb[0] && rgb[2] > rgb[1], "the circle is filled blue");
        const outline = style.stroke.slice(1).match(/../g).map(v => parseInt(v, 16));
        assert(outline.every(channel => channel >= 235), "the outline is light");
        assert(Number(style["stroke-width"]) > 0);
        const title = marker.node.children.find(node => node.tag === "title");
        assert(title.children[0].text.startsWith("Wrong note played: "));
        assert(nodes(view).some(({ node }) => node.tag === "ellipse"), "targets retain distinct ellipse noteheads");
      });
    const marker = markerNodes(child)[0].node;
    const accidental = marker.children.find(node => hasClass(node, "wrong-pitch-accidental"));
    assert(accidental && accidental.data.attrs.d.length > 10);
    assert(marker.children.some(node => hasClass(node, "wrong-pitch-ledger")));
    assert.strictEqual(marker.children.find(node => hasClass(node, "wrong-pitch-dot")).data.attrs.cy,
      child.layout.staves[0].bottomLineY + 10);
  });
  await test("key-signature cancellation renders the real natural glyph at F4", () => {
    const child = melody({ key: "G-major", pitches: { treble: 50 } }).child;
    press(child, 53);
    const marker = child.visibleWrongPitchMarkers[0];
    assert.strictEqual(marker.accidental, "nat");
    assert.strictEqual(marker.y, child.layout.staves[0].bottomLineY - 5);
    const accidental = markerNodes(child)[0].node.children.find(node => hasClass(node, "wrong-pitch-accidental"));
    assert(accidental && accidental.data.attrs.d.length > 10);
  });
  await test("extreme played pitches keep their true height and show the named direction at a visible SVG edge", () => {
    [() => melody().child, () => chords()].forEach(factory => {
      const view = factory();
      press(view, 0); press(view, 127);
      const notation = view.practiceState ? view : stream(view);
      const values = view.practiceState ? notation.visibleWrongPitchMarkers : notation.renderedWrongPitchMarkers;
      assert.deepStrictEqual(values.map(marker => marker.value), [0, 127]);
      const low = values.find(marker => marker.value === 0), high = values.find(marker => marker.value === 127);
      assert(low.y > notation.layout.height, "very low C remains below the staff");
      assert(high.y < 0, "very high G remains above the staff");
      assert.strictEqual(nodes(notation).filter(({ node }) => hasClass(node, "wrong-pitch-dot")).length, 0);
      const hints = nodes(notation).filter(({ node }) => hasClass(node, "wrong-pitch-range-label"));
      assert.strictEqual(hints.length, 2);
      assert(hints.some(({ node }) => node.children[0].text === "↓ C0"));
      assert(hints.some(({ node }) => node.children[0].text === "↑ G10"));
      hints.forEach(({ node }) => {
        assert(node.data.attrs.y >= 8 && node.data.attrs.y <= notation.layout.height - 8);
        const x = notation.playLineX || notation.layout.playLineX;
        assert(node.data.attrs.x > x, "the edge label stays beside the input line");
      });
      const ids = timerIds(view); wall(1000); cleared(view, ids);
    });
  });
  for (const mode of ["melody", "chord"]) {
    for (const key of ["C-major", "D-major"]) {
      await test(`${mode} ${key} retains both colliding C4/C-sharp4 inputs and restores the surviving accidental`, async () => {
        for (const order of [[48, 49], [49, 48]]) {
          const view = mode === "melody" ? melody({ key, pitches: { treble: 52 } }).child : collisionChord(key);
          assert.strictEqual(target(view).expectedValues[0], 52);
          assert(!target(view).expectedValues.includes(48) && !target(view).expectedValues.includes(49));
          const targetIndex = state(view).targetIndex;
          press(view, order[0]); wall(300); press(view, order[1]);
          const actualMarkers = view.visibleWrongPitchMarkers;
          assert.strictEqual(actualMarkers.length, 2, "each actual wrong input retains its own lifetime");
          assert.strictEqual(actualMarkers[0].targetKey, actualMarkers[1].targetKey);
          const notation = markerNotation(view);
          const mapped = view.practiceState ? actualMarkers : notation.renderedWrongPitchMarkers;
          assert.strictEqual(mapped[0].clef, "treble");
          assert.strictEqual(mapped[1].clef, "treble");
          assert.strictEqual(mapped[0].writtenStep, mapped[1].writtenStep);
          assert.strictEqual(mapped[0].y, mapped[1].y);
          assert.strictEqual(state(view).targetIndex, targetIndex);
          assert.strictEqual(state(view).wrongCount, 2);
          assert.strictEqual(state(view).missedCount, 0);
          assert.strictEqual(timerIds(view).length, 2);
          const groups = markerNodes(notation);
          assert.strictEqual(groups.length, 1, "one exact-position group represents the shared staff location");
          const group = groups[0].node;
          assert.strictEqual(group.children.filter(node => hasClass(node, "wrong-pitch-dot")).length, 1);
          assert.strictEqual(group.children.filter(node => hasClass(node, "wrong-pitch-ledger")).length, 1);
          assert.strictEqual(group.children.filter(node => hasClass(node, "wrong-pitch-accidental")).length, 0,
            "the collision does not present one pitch's accidental as if it described both pitches");
          const dot = group.children.find(node => hasClass(node, "wrong-pitch-dot"));
          assert.strictEqual(dot.data.attrs.cy, mapped[0].y);
          const playLineX = notation.playLineX || notation.layout.playLineX;
          assert.strictEqual(group.data.attrs.transform, `translate(${playLineX} 0)`);
          const title = textOf(group.children.find(node => node.tag === "title"));
          assert(title.includes("C4") && title.includes("Cis4"));
          const hints = nodes(notation).filter(({ node }) => hasClass(node, "wrong-pitch-collision-hint"));
          assert.strictEqual(hints.length, 1);
          assert(!hints[0].ancestors.some(node => node.tag === "svg"), "named collision feedback remains outside SVG clipping");
          const names = nodes(notation).filter(({ node }) => hasClass(node, "wrong-pitch-collision-note"));
          assert.deepStrictEqual(names.map(({ node }) => textOf(node)).sort(), ["C4", "Cis4"]);
          wall(699); assert.strictEqual(view.visibleWrongPitchMarkers.length, 2);
          wall(1); await Vue.nextTick();
          assert.deepStrictEqual(view.visibleWrongPitchMarkers.map(marker => marker.value), [order[1]]);
          assert.strictEqual(timerIds(view).length, 1);
          const remaining = markerNotation(view);
          assert.strictEqual(nodes(remaining).filter(({ node }) => hasClass(node, "wrong-pitch-collision-hint")).length, 0);
          assert.strictEqual(nodes(remaining).filter(({ node }) => hasClass(node, "wrong-pitch-collision-note")).length, 0);
          const survivingGroup = markerNodes(remaining)[0].node;
          const expectedAccidental = order[1] === 49 ? (key === "C-major" ? "sharp" : null)
            : (key === "D-major" ? "nat" : null);
          const accidental = survivingGroup.children.find(node => hasClass(node, "wrong-pitch-accidental"));
          if (expectedAccidental) {
            assert(accidental, `the surviving pitch restores ${expectedAccidental}`);
            assert.strictEqual(accidental.data.attrs.d,
              remaining.glyphPath(`accidentals.${expectedAccidental}`, -16, mapped[1].y, 0.7));
          } else assert.strictEqual(accidental, undefined);
          assert.strictEqual(survivingGroup.children.find(node => hasClass(node, "wrong-pitch-dot")).data.attrs.cy, mapped[1].y);
          assert.strictEqual(state(view).wrongCount, 2);
          wall(299); assert.strictEqual(view.visibleWrongPitchMarkers.length, 1);
          wall(1); cleared(view, []);
          press(view, order[0]); wall(300); press(view, order[1]);
          const ids = timerIds(view); press(view, 52); cleared(view, ids);
          assert.strictEqual(state(view).wrongCount-state(view).earlyAttemptCount-state(view).lateAttemptCount, 4, "a correct tone adds no pitch error; response timing is judged separately");
          press(view, order[0]); wall(300); press(view, order[1]);
          const switchIds = timerIds(view);
          if (view.practiceState) view.displayNote = false;
          else view.plan.options.displayNote = false;
          await Vue.nextTick(); cleared(view, switchIds);
          assert.strictEqual(state(view).wrongCount-state(view).earlyAttemptCount-state(view).lateAttemptCount, 6, "turning off collision feedback preserves pitch grading and separate timing");
        }
      });
    }
  }
  process.stdout.write(`${checks} wrong-pitch UI integration tests passed\n`);
}
run().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; }).finally(() => {
  views.forEach(view => { if (!view._isDestroyed) view.$destroy(); });
  global.performance = originals.performance; global.document = originals.document; global.window = originals.window;
  global.requestAnimationFrame = originals.raf; global.cancelAnimationFrame = originals.cancel;
  global.setTimeout = originals.timeout; global.clearTimeout = originals.clearTimeout;
  global.setInterval = originals.interval; global.clearInterval = originals.clearInterval;
  Storage.saveRound = originals.save; AudioSync.resume = originals.resume;
  Options.preparationSeconds = originals.preparation; Options.displayNote = originals.displayNote;
});
