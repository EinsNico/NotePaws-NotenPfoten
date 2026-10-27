const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const stored = new Map();
global.localStorage = {
  get length() { return stored.size; }, key(index) { return Array.from(stored.keys())[index] || null; },
  getItem(key) { return stored.has(key) ? stored.get(key) : null; },
  setItem(key, value) { stored.set(key, String(value)); }, removeItem(key) { stored.delete(key); }
};
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
const model = require("../src/model/Workshop");
const workshopStorage = require("../src/model/WorkshopStorage");
const { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");

const cases = [];
function test(name, callback) { cases.push({ name, callback }); }
function note(value = 48, noteValue = "quarter", startSlot = 0) {
  return { id: model.workshopId("event"), kind: "note", noteValue, startSlot, pitch: model.workshopPitchFromValue(value) };
}
function rest(noteValue, startSlot) {
  return { id: model.workshopId("rest"), kind: "rest", noteValue, startSlot, pitch: null };
}
function score(count) { return model.createWorkshopDraft("Variable piece", count).score; }
function clone(value) { return model.cloneWorkshop(value); }
function measures(value) { return value.parts[0].measures; }

function fakeClock() {
  let time = 0, sequence = 0, maximumPending = 0;
  const timers = new Map();
  return {
    timers,
    nowFn() { return time; },
    setTimeoutFn(callback, delay) {
      assert(Number.isFinite(delay) && delay >= 0);
      timers.set(++sequence, { callback, due: time + delay });
      maximumPending = Math.max(maximumPending, timers.size);
      return sequence;
    },
    clearTimeoutFn(id) { timers.delete(id); },
    advanceTo(target) {
      assert(target >= time);
      let iterations = 0;
      while (timers.size) {
        const [id, timer] = Array.from(timers.entries()).sort((a, b) => a[1].due - b[1].due)[0];
        if (timer.due > target) break;
        assert(++iterations < 20000, "Playback must finish without an unbounded callback loop");
        time = timer.due;
        timers.delete(id);
        timer.callback();
      }
      time = target;
    },
    get maximumPending() { return maximumPending; }
  };
}
function playbackFixture(value, options = {}) {
  const clock = fakeClock(), voices = [], steps = [], active = [];
  let stopCalls = 0;
  const player = {
    play(pitch, volume) {
      const voice = { pitch, volume, paused: 0, currentTime: 1, pause() { this.paused++; } };
      voices.push(voice); return voice;
    },
    stopAll() { stopCalls++; }
  };
  const playback = createWorkshopPlayback(value, player, Object.assign({}, clock, {
    nowFn: clock.nowFn, appVolume: 31,
    onStep(event) { steps.push(event); },
    onActiveNotes(ids, barIndex) { active.push({ ids, barIndex }); }
  }, options));
  return { clock, voices, steps, active, playback, get stopCalls() { return stopCalls; } };
}

test("starts with one bar and supports two, 200 and 1000 bars with unique identities", () => {
  assert.strictEqual(measures(model.createWorkshopDraft().score).length, 1);
  assert.strictEqual(model.WORKSHOP_MAX_SCORE_MEASURES, 1000);
  for (const count of [1, 2, 200, 1000]) {
    const value = score(count), bars = measures(value);
    assert.strictEqual(bars.length, count);
    assert.strictEqual(new Set(bars.map(bar => bar.id)).size, count);
    assert(bars.every(bar => bar.events.length === 0));
    assert(model.isValidWorkshopScore(value));
    bars[bars.length - 1].events = [note(60, "sixteenth", 7.5)];
    const timeline = model.workshopTimeline(value);
    assert.strictEqual(timeline.durationMs, count * 4000);
    assert.strictEqual(timeline.measures.length, count);
    assert.strictEqual(timeline.measures[count - 1].startMs, (count - 1) * 4000);
    assert.strictEqual(timeline.measures[count - 1].endMs, count * 4000);
    assert.strictEqual(timeline.events.find(event => event.value !== null).startMs, (count - 1) * 4000 + 3750);
  }
  for (const count of [0, -1, 1001, 2.5, "2", NaN]) assert.throws(() => score(count), RangeError);
  const empty = score(1); measures(empty).splice(0); assert(!model.isValidWorkshopScore(empty));
  const tooLarge = score(1000); measures(tooLarge).push({ id: model.workshopId("bar"), events: [] });
  assert(!model.isValidWorkshopScore(tooLarge));
});

test("inserting and deleting bars preserve existing notes and leave the input score untouched", () => {
  const value = score(2); measures(value)[0].events = [note(48)]; measures(value)[1].events = [note(55)];
  const original = JSON.stringify(value), oldIds = measures(value).map(bar => bar.id);
  const inserted = model.insertWorkshopMeasures(value, 0, 198);
  assert.strictEqual(JSON.stringify(value), original);
  assert.strictEqual(measures(inserted).length, 200);
  assert.strictEqual(measures(inserted)[0].id, oldIds[0]);
  assert.strictEqual(measures(inserted)[199].id, oldIds[1]);
  assert.deepStrictEqual(measures(inserted)[199].events, measures(value)[1].events);
  assert.strictEqual(new Set(measures(inserted).map(bar => bar.id)).size, 200);
  const removed = model.removeWorkshopMeasure(inserted, 137);
  assert.strictEqual(measures(removed).length, 199);
  assert.strictEqual(measures(removed)[198].id, oldIds[1]);
  assert.strictEqual(measures(inserted).length, 200);
  const front = model.insertWorkshopMeasures(value, -1, 1);
  assert.strictEqual(measures(front)[1].id, oldIds[0]);
  for (const [index, count] of [[2, 1], [-2, 1], [0, 0], [0, 999], [0.5, 1]]) {
    assert.strictEqual(model.insertWorkshopMeasures(value, index, count), null);
  }
  for (const index of [-1, 2, 0.5]) assert.strictEqual(model.removeWorkshopMeasure(value, index), null);
  assert.strictEqual(model.removeWorkshopMeasure(score(1), 0), null);
  const duplicateBar = clone(value); measures(duplicateBar)[1].id = measures(duplicateBar)[0].id;
  assert(!model.isValidWorkshopScore(duplicateBar));
  const duplicateNote = clone(value); measures(duplicateNote)[1].events[0].id = measures(duplicateNote)[0].events[0].id;
  assert(!model.isValidWorkshopScore(duplicateNote));
});

test("old four-bar revisions stay unchanged while a longer version is saved", () => {
  const old = model.createWorkshopDraft("Existing piece", 4);
  measures(old.score)[0].events = [note(48, "half"), note(55, "half", 4)];
  const first = model.saveWorkshopDraft(null, old, "2026-10-02T10:00:00.000Z");
  const frozen = JSON.stringify(first.piece.revisions[0]);
  const edited = model.openWorkshopPiece(first.piece);
  edited.score = model.insertWorkshopMeasures(edited.score, 3, 196);
  const saved = model.saveWorkshopDraft(first.library, edited, "2026-10-02T10:01:00.000Z");
  assert.strictEqual(saved.piece.revisions.length, 2);
  assert.strictEqual(JSON.stringify(saved.piece.revisions[0]), frozen);
  const reopenedOld = model.openWorkshopPiece(saved.piece, first.piece.currentRevisionId);
  assert.strictEqual(measures(reopenedOld.score).length, 4);
  assert.strictEqual(model.workshopTimeline(reopenedOld.score).durationMs, 16000);
  assert.strictEqual(measures(model.openWorkshopPiece(saved.piece).score).length, 200);
});

test("five populated 200-bar revisions fit the new library limit and a full library preserves stored data", () => {
  const entries = new Map();
  const storage = {
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); }
  };
  const draft = model.createWorkshopDraft("Long piece", 200);
  measures(draft.score).forEach((bar, barIndex) => {
    bar.events = Array.from({ length: 4 }, (_, index) => note(48 + (barIndex + index) % 12, "quarter", index * 2));
  });
  let result;
  for (let index = 0; index < 5; index++) {
    draft.score.bpm = 60 + index;
    result = workshopStorage.storeWorkshopDraft(draft, storage);
    draft.pieceId = result.piece.id;
  }
  assert.strictEqual(model.WORKSHOP_MAX_LIBRARY_CHARS, 128 * 1024 * 1024);
  const five = workshopStorage.readWorkshopLibrary(storage);
  assert.strictEqual(five.pieces.length, 1); assert.strictEqual(five.pieces[0].revisions.length, 5);
  assert(JSON.stringify(five).length > 512 * 1024, "This example must exercise the newly increased capacity");
  assert(JSON.stringify(five).length < model.WORKSHOP_MAX_LIBRARY_CHARS);
  five.pieces[0].revisions.forEach((revision, index) => {
    assert.strictEqual(revision.score.bpm, 60 + index);
    assert.strictEqual(measures(revision.score).length, 200);
    assert(measures(revision.score).every(bar => bar.events.length === 4));
  });
  // Exercise the byte budget specifically, before the separate 64-version
  // cap. Previously this case reached that cap and mislabeled it library-full.
  measures(draft.score).forEach(bar => bar.events.forEach(event => { event.lyric = "x".repeat(512); }));
  draft.score.musicXml = {
    sourceXml: "<!--" + "x".repeat(30 * 1024 * 1024 - 7) + "-->",
    fingerprint: "large-original", warnings: []
  };
  let rejected = false;
  for (let index = 5; index < 80; index++) {
    const previous = storage.getItem(model.WORKSHOP_STORAGE_KEY);
    draft.score.bpm = 60 + index;
    try {
      result = workshopStorage.storeWorkshopDraft(draft, storage);
    } catch (error) {
      assert.strictEqual(error.message, "library-full");
      assert.strictEqual(storage.getItem(model.WORKSHOP_STORAGE_KEY), previous);
      const retained = workshopStorage.readWorkshopLibrary(storage);
      assert.deepStrictEqual(retained, result.library);
      assert(model.isValidWorkshopLibrary(retained));
      assert.strictEqual(retained.pieces[0].revisions.length, index);
      assert(index < model.WORKSHOP_MAX_PIECE_REVISIONS);
      rejected = true; break;
    }
  }
  assert(rejected, "A bounded library must eventually reject further full score revisions");
  assert.strictEqual(measures(draft.score).length, 200);
});

test("auditioning bar 137 starts locally, keeps polyphonic durations and never plays adjacent bars", () => {
  const value = score(200), bars = measures(value);
  bars[135].events = [note(36, "whole")]; bars[137].events = [note(71, "whole")];
  const long = note(48, "half", 2), short = note(52, "eighth", 2), later = note(55, "quarter", 4);
  bars[136].events = [long, short, later, rest("eighth", 3)];
  const f = playbackFixture(value, { barIndex: 136 });
  assert.strictEqual(f.playback.start(), true);
  assert.strictEqual(f.voices.length, 0);
  f.clock.advanceTo(999); assert.strictEqual(f.voices.length, 0);
  f.clock.advanceTo(1000); assert.deepStrictEqual(f.voices.map(voice => [voice.pitch, voice.volume]), [[48, 31], [52, 31]]);
  assert.deepStrictEqual(f.active[f.active.length - 1], { ids: [long.id, short.id], barIndex: 136 });
  f.clock.advanceTo(1500); assert.strictEqual(f.voices[0].paused, 0); assert.strictEqual(f.voices[1].paused, 1);
  assert.deepStrictEqual(f.active[f.active.length - 1].ids, [long.id]);
  f.clock.advanceTo(2000); assert.deepStrictEqual(f.voices.map(voice => voice.pitch), [48, 52, 55]);
  assert.strictEqual(f.voices[0].paused, 0);
  f.clock.advanceTo(3000); assert.strictEqual(f.voices[0].paused, 1); assert.strictEqual(f.voices[2].paused, 1);
  assert.deepStrictEqual(f.active[f.active.length - 1].ids, []);
  f.clock.advanceTo(4000); assert.strictEqual(f.playback.isPlaying(), false); assert.strictEqual(f.clock.timers.size, 0);
  assert(f.steps.every(event => event.barIndex === 136 && event.startMs >= 0 && event.startMs < 4000));
  assert(f.active.every(update => update.barIndex === 136));
  assert.deepStrictEqual(f.voices.map(voice => voice.pitch), [48, 52, 55]);
});

test("first, last and silent bars audition with valid limits, and invalid bar selections refuse to start", () => {
  const value = score(200); measures(value)[0].events = [note(48)]; measures(value)[199].events = [note(60)];
  for (const [barIndex, expected] of [[0, [48]], [199, [60]], [137, []]]) {
    const f = playbackFixture(value, { barIndex });
    assert.strictEqual(f.playback.start(), true); f.clock.advanceTo(4000);
    assert.deepStrictEqual(f.voices.map(voice => voice.pitch), expected);
    assert.strictEqual(f.playback.isPlaying(), false);
    assert(f.steps.every(event => event.barIndex === barIndex));
  }
  for (const barIndex of [-1, 200, 0.5, "137", null]) {
    const f = playbackFixture(value, { barIndex });
    assert.strictEqual(f.playback.start(), false);
    assert.strictEqual(f.voices.length, 0); assert.strictEqual(f.clock.timers.size, 0);
  }
});

test("a complete 200-bar playback keeps one pending timer, reports all bars and stops at its real end", () => {
  const value = score(200);
  measures(value).forEach((bar, index) => { bar.events = [note(48 + index % 12)]; });
  const f = playbackFixture(value);
  assert.strictEqual(f.playback.start(), true);
  assert.strictEqual(f.clock.timers.size, 1);
  f.clock.advanceTo(800000);
  assert.strictEqual(f.voices.length, 200);
  assert.strictEqual(f.clock.maximumPending, 1);
  assert.strictEqual(f.clock.timers.size, 0);
  assert.strictEqual(f.playback.isPlaying(), false);
  assert.deepStrictEqual(Array.from(new Set(f.steps.map(event => event.barIndex))), Array.from({ length: 200 }, (_, index) => index));
  assert(f.voices.every(voice => voice.paused === 1));
});

test("stopping a long piece cancels its pending timer and old callbacks cannot affect a restart", () => {
  const value = score(200); measures(value).forEach(bar => { bar.events = [note()]; });
  const f = playbackFixture(value);
  f.playback.start(); const stale = Array.from(f.clock.timers.values());
  f.playback.stop(); assert.strictEqual(f.clock.timers.size, 0); assert.strictEqual(f.voices[0].paused, 1);
  const stoppedCount = f.voices.length; stale.forEach(timer => timer.callback());
  assert.strictEqual(f.voices.length, stoppedCount);
  f.playback.start(); assert.strictEqual(f.clock.timers.size, 1);
  const restartedCount = f.voices.length; stale.forEach(timer => timer.callback());
  assert.strictEqual(f.voices.length, restartedCount); assert.strictEqual(f.clock.timers.size, 1);
  f.playback.stop(); assert.strictEqual(f.clock.timers.size, 0);
});

const filename = path.resolve(sourceRoot, "components/Workshop.vue");
const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const componentModule = new Module(filename, module);
componentModule.filename = filename; componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
const definition = componentModule.exports.default;
function editor() {
  const view = new Vue(Object.assign({}, definition, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, definition.methods, { $t: key => key })
  }));
  view.$i18n = { locale: "de" }; view.player = { play() {}, stopAll() {} };
  view.newPiece(); return view;
}
function validNavigation(view) {
  assert(view.currentBar);
  assert(view.barIndex >= 0 && view.barIndex < view.bars.length);
  assert(view.copyTarget >= 0 && view.copyTarget < view.bars.length);
  assert(model.isValidWorkshopScore(view.draft.score));
}

test("the editor inserts and deletes at the selected position with one undo and restores navigation", () => {
  const view = editor(); const first = view.currentBar.id;
  assert.strictEqual(view.bars.length, 1); assert.strictEqual(view.copyTarget, 0);
  view.addBarCount = 199; view.addBars(); assert.strictEqual(view.bars.length, 200); assert.strictEqual(view.barIndex, 1);
  assert.strictEqual(view.bars[0].id, first); assert.strictEqual(view.undoStack.length, 1); validNavigation(view);
  view.undo(); assert.strictEqual(view.bars.length, 1); assert.strictEqual(view.barIndex, 0); validNavigation(view);
  view.redo(); assert.strictEqual(view.bars.length, 200); assert.strictEqual(view.barIndex, 1); validNavigation(view);
  view.selectBar(199); const last = view.currentBar.id; view.deleteBar();
  assert.strictEqual(view.bars.length, 199); assert.strictEqual(view.barIndex, 198); validNavigation(view);
  view.undo(); assert.strictEqual(view.bars.length, 200); assert.strictEqual(view.barIndex, 199); assert.strictEqual(view.currentBar.id, last);
  view.redo(); assert.strictEqual(view.bars.length, 199); validNavigation(view);
  view.selectBar(0); view.deleteBar(); assert.strictEqual(view.bars.length, 198); assert.strictEqual(view.barIndex, 0); validNavigation(view);
  view.undo(); assert.strictEqual(view.bars.length, 199); assert.strictEqual(view.currentBar.id, first);
  view.newPiece(); const before = JSON.stringify(view.draft); view.deleteBar();
  assert.strictEqual(JSON.stringify(view.draft), before); assert.strictEqual(view.undoStack.length, 0);
  view.$destroy();
});

test("copying, moving and jumping work beyond four bars and reject invalid destinations", () => {
  const view = editor(); view.draft.score = score(200); view.normalizeBarNavigation();
  view.selectBar(136); const originalBarId = view.currentBar.id;
  view.currentBar.events = [note(48), note(52, "eighth", 2)]; view.copyTarget = 199;
  view.copyBar(); assert.strictEqual(view.bars[199].events.length, 2);
  assert(view.bars[199].events.every(event => !view.currentBar.events.some(original => original.id === event.id)));
  view.moveBar(1); assert.strictEqual(view.barIndex, 137); assert.strictEqual(view.currentBar.id, originalBarId);
  view.undo(); assert.strictEqual(view.barIndex, 136); assert.strictEqual(view.currentBar.id, originalBarId);
  view.redo(); assert.strictEqual(view.barIndex, 137); assert.strictEqual(view.currentBar.id, originalBarId);
  const input = { target: { value: "200" } }; view.jumpToBar(input); assert.strictEqual(view.barIndex, 199);
  const boundary = JSON.stringify(view.draft); view.moveBar(1); assert.strictEqual(JSON.stringify(view.draft), boundary);
  input.target.value = "1"; view.jumpToBar(input); assert.strictEqual(view.barIndex, 0);
  view.moveBar(-1); assert.strictEqual(JSON.stringify(view.draft), boundary);
  input.target.value = "9999"; view.jumpToBar(input); assert.strictEqual(view.barIndex, 199); assert.strictEqual(input.target.value, "200");
  for (const target of [-1, 200, 0.5, "5"]) {
    const selected = view.barIndex; view.selectBar(target); assert.strictEqual(view.barIndex, selected);
    view.copyTarget = target; const unchanged = JSON.stringify(view.draft), undo = view.undoStack.length;
    view.copyBar(); assert.strictEqual(JSON.stringify(view.draft), unchanged); assert.strictEqual(view.undoStack.length, undo);
  }
  view.normalizeBarNavigation(); validNavigation(view);
  view.$destroy();
});

test("revision changes and undo keep a valid selected bar when the piece shrinks from 200 to four bars", () => {
  const first = model.saveWorkshopDraft(null, model.createWorkshopDraft("Revision piece", 4), "2026-10-02T11:00:00.000Z");
  const longer = model.openWorkshopPiece(first.piece); longer.score = model.insertWorkshopMeasures(longer.score, 3, 196);
  const saved = model.saveWorkshopDraft(first.library, longer, "2026-10-02T11:01:00.000Z");
  const view = editor(); view.library = saved.library; view.openPiece(saved.piece); view.selectBar(199);
  view.chooseRevision(first.piece.currentRevisionId);
  assert.strictEqual(view.bars.length, 4); assert.strictEqual(view.barIndex, 3); validNavigation(view);
  view.undo(); assert.strictEqual(view.bars.length, 200); assert.strictEqual(view.barIndex, 199); validNavigation(view);
  view.redo(); assert.strictEqual(view.bars.length, 4); validNavigation(view);
  view.$destroy();
});

test("the editor auditions the selected bar and changing bars cancels its playback", async () => {
  const view = editor(), clock = fakeClock(), played = [];
  const startPlayback = view.startPlayback.bind(view);
  let starting;
  view.startPlayback = (...args) => { starting = startPlayback(...args); return starting; };
  const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
  view.draft.score = score(200); view.normalizeBarNavigation();
  view.bars[0].events = [note(36)]; view.bars[136].events = [note(60)];
  view.player = { play(value) { played.push(value); return { pause() {}, currentTime: 0 }; }, stopAll() {} };
  global.setTimeout = clock.setTimeoutFn; global.clearTimeout = clock.clearTimeoutFn;
  try {
    view.selectBar(136); view.toggleBarPlayback();
    await starting;
    assert.strictEqual(view.playing, true); assert.strictEqual(view.playbackBarIndex, 136);
    assert.strictEqual(view.playingBar, 136); assert.deepStrictEqual(played, [60]);
    assert(clock.timers.size > 0);
    view.selectBar(137); assert.strictEqual(view.playing, false); assert.strictEqual(clock.timers.size, 0);
    assert.deepStrictEqual(view.activeEventIds, []);
    view.toggleBarPlayback(); assert.strictEqual(view.playing, false); assert.deepStrictEqual(played, [60]);
  } finally {
    view.stopPlayback(); global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout;
    view.$destroy();
  }
});

test("the editor enforces the 1000-bar limit without adding undo entries or losing existing bars", () => {
  const view = editor(); view.addBarCount = 200;
  for (let index = 0; index < 4; index++) view.addBars();
  assert.strictEqual(view.bars.length, 801); assert.strictEqual(view.remainingBars, 199); assert.strictEqual(view.addBarCount, 199);
  view.addBars(); assert.strictEqual(view.bars.length, 1000); assert.strictEqual(view.remainingBars, 0); assert.strictEqual(view.addBarCount, 1);
  view.undoStack = []; view.redoStack = []; view.selectBar(999);
  const before = JSON.stringify(view.draft); view.addBarCount = 10; view.addBars();
  assert.strictEqual(JSON.stringify(view.draft), before); assert.strictEqual(view.undoStack.length, 0);
  assert.strictEqual(view.remainingBars, 0); validNavigation(view);
  view.deleteBar(); assert.strictEqual(view.bars.length, 999); validNavigation(view);
  view.addBarCount = 1; view.addBars(); assert.strictEqual(view.bars.length, 1000); validNavigation(view);
  view.$destroy();
});

async function run() {
  for (const { name, callback } of cases) {
    await callback();
    process.stdout.write("✓ " + name + "\n");
  }
  process.stdout.write("Workshop variable bar and audition tests passed.\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
