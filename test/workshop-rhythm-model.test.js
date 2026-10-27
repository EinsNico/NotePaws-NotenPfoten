const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");

function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); }, removeItem(key) { entries.delete(key); } };
}
if (!global.localStorage) global.localStorage = storage();
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const model = require("../src/model/Workshop");
const rhythm = require("../src/model/WorkshopRhythm");
const editor = require("../src/model/WorkshopScoreEditor");
const ties = require("../src/model/WorkshopTies");
const store = require("../src/model/WorkshopStorage");
const backup = require("../src/model/SaveDataBackup");
const imports = require("../src/model/SaveDataImport");
Module._extensions[".js"] = originalLoader;

function test(name, operation) { operation(); process.stdout.write("✓ workshop rhythm model: " + name + "\n"); }
function note(id, startSlot = 0, noteValue = "quarter", dots = 0, value = 48) {
  const result = { id, kind: "note", noteValue, startSlot, pitch: model.workshopPitchFromValue(value) };
  if (dots) result.dots = dots;
  return result;
}
function bar(events = [], meter = "4/4") { return { id: model.workshopId("bar"), meter, events }; }
function tiedScore() {
  const score = model.createWorkshopDraft("Tied notes", 3).score;
  score.parts[0].measures[0].events = [note("a", 6)];
  score.parts[0].measures[1].events = [note("b", 0, "quarter", 1), note("c", 3, "half")];
  score.ties = [{ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" }];
  assert(model.isValidWorkshopScore(score)); return score;
}

test("historical durations and coarse gestures remain unchanged while every single dotted value is exact", () => {
  assert.strictEqual(rhythm.WORKSHOP_SLOT_STEP, .5); assert.strictEqual(rhythm.WORKSHOP_FINE_SLOT_STEP, .25);
  assert.strictEqual(model.WORKSHOP_NOTE_UNITS, rhythm.WORKSHOP_NOTE_UNITS);
  const expected = { whole: [8, 12], half: [4, 6], quarter: [2, 3], eighth: [1, 1.5], sixteenth: [.5, .75] };
  for (const [noteValue, durations] of Object.entries(expected)) {
    assert.strictEqual(rhythm.workshopEventUnits({ noteValue }), durations[0]);
    assert.strictEqual(rhythm.workshopEventUnits({ noteValue, dots: 0 }), durations[0]);
    assert.strictEqual(rhythm.workshopEventUnits({ noteValue, dots: 1 }), durations[1]);
  }
  assert.strictEqual(rhythm.workshopEventUnits({ noteValue: "thirtysecond" }), .25);
  const remembered = { noteValue: "quarter", originalNoteValue: "quarter", originalDots: 1 };
  assert.strictEqual(rhythm.workshopEventUnits(remembered), 2);
  assert.strictEqual(rhythm.workshopRequestedDots(remembered), 1);
  assert.strictEqual(rhythm.workshopRequestedUnits(remembered), 3);
  assert.strictEqual(rhythm.workshopRequestedDots({ noteValue: "eighth", dots: 1, originalNoteValue: "whole" }), 0);
  assert.strictEqual(rhythm.workshopRequestedUnits({ noteValue: "eighth", dots: 1, originalNoteValue: "whole" }), 8);
});

test("dotted notes and rests use their full durations in validation, sequential positions and the timeline", () => {
  let score = model.createWorkshopDraft("Dotted durations").score;
  score = model.setWorkshopMeasureContext(score, 0, { meter: "6/4" });
  const expected = { whole: 12, half: 6, quarter: 3, eighth: 1.5, sixteenth: .75 };
  score.parts[0].measures[0].events = Object.keys(expected).map((value, index) => note(value, 0, value, 1, 48 + index));
  assert(model.isValidWorkshopScore(score));
  const timeline = model.workshopTimeline(score);
  assert.strictEqual(timeline.durationMs, 6000);
  for (const [id, units] of Object.entries(expected)) {
    assert.strictEqual(timeline.events.find(event => event.id === id).durationMs, units * 500);
    assert(model.isValidWorkshopMeasure(bar([{ id: "pause", kind: "rest", noteValue: id, dots: 1, pitch: null, startSlot: 0 }], "6/4")));
  }
  const sequential = { events: [Object.assign(note("first", 0, "sixteenth", 1), { startSlot: undefined }),
    Object.assign(note("second", 0, "thirtysecond"), { startSlot: undefined })] };
  sequential.events.forEach(event => delete event.startSlot);
  assert(model.isValidWorkshopMeasure(sequential));
  assert.deepStrictEqual(model.workshopMeasureEvents(sequential).map(event => event.startSlot), [0, .75]);
  assert.strictEqual(model.workshopMeasureUnits(sequential), 1);
  assert.strictEqual(model.isValidWorkshopMeasure(bar([note("overflow", 7.5, "sixteenth", 1)])), false);
});

test("fine positions, covered duration and gesture snapping adapt only when needed", () => {
  const measure = bar([note("dotted", 0, "sixteenth", 1), note("overlap", .5, "sixteenth")]);
  assert(model.isValidWorkshopMeasure(measure)); assert.strictEqual(model.workshopOccupiedSlots(measure), 1);
  assert.strictEqual(rhythm.workshopMeasureGridStep(measure), .25);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar()), .5);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar(), { noteValue: "sixteenth", dots: 1 }), .25);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar(), { noteValue: "eighth", dots: 1 }), .5);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar([note("quarter-grid", .25)])), .25);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar([note("tiny", 0, "thirtysecond")])), .25);
  const geometry = editor.workshopStaffGeometry(8);
  for (const grid of [.5, .25]) {
    for (let position = 0; position < 8; position += grid) {
      const x = geometry.left + (position + grid) * geometry.unitWidth;
      assert.strictEqual(editor.workshopSlotAtStaffX(x, 8, 0, grid), position);
    }
  }
  assert.strictEqual(editor.workshopSlotAtStaffX(338), 7.5);
  assert.strictEqual(editor.workshopSlotAtStaffX(338, 8, 0, .25), 7.75);
  assert.strictEqual(editor.workshopSlotAtStaffX(100, 8, 0, .125), .25);
  assert.strictEqual(model.isValidWorkshopMeasure(bar([note("bad-grid", 1/11)])), false);
});

test("editor-generated quarter-slot silence becomes a valid 32nd rest without changing nearby dotted notes", () => {
  let measure = bar();
  measure.events = editor.placeWorkshopEvent(measure, 0, note("dotted", 0, "sixteenth", 1));
  assert(measure.events);
  measure.events = editor.placeWorkshopEvent(measure, 1, note("following", 1, "sixteenth"));
  assert(measure.events && model.isValidWorkshopMeasure(measure));
  assert.strictEqual(measure.events.find(event => event.id === "dotted").dots, 1);
  const pause = measure.events.find(event => event.kind === "rest" && event.startSlot === .75);
  assert(pause); assert.strictEqual(pause.noteValue, "thirtysecond"); assert.strictEqual(rhythm.workshopEventUnits(pause), .25);
  assert.strictEqual(editor.placeWorkshopEvent(measure, .5, { id: "blocked-rest", kind: "rest", pitch: null, noteValue: "thirtysecond" }), null);
  const moved = editor.moveWorkshopNotes(measure, ["dotted", "following"], "dotted", .25, model.workshopPitchFromValue(48));
  assert(moved && model.isValidWorkshopMeasure(Object.assign({}, measure, { events: moved })));
  assert.deepStrictEqual(moved.filter(event => event.kind === "note").map(event => event.startSlot), [.25, 1.25]);
});

test("automatic shortening remembers and restores the requested dots, including a clipped dot on the same note value", () => {
  for (const [value, nextStart, shortenedValue, shortenedDots] of [
    ["quarter", 2, "quarter", undefined], ["half", 1.5, "eighth", 1], ["sixteenth", .5, "sixteenth", undefined]
  ]) {
    let measure = bar();
    measure.events = editor.placeWorkshopEvent(measure, 0, note("requested", 0, value, 1));
    measure.events = editor.placeWorkshopEvent(measure, nextStart, note("following", nextStart, "sixteenth", 0, 52));
    assert(measure.events);
    const clipped = measure.events.find(event => event.id === "requested");
    assert.strictEqual(clipped.noteValue, shortenedValue); assert.strictEqual(clipped.dots, shortenedDots);
    assert.strictEqual(clipped.originalNoteValue, value); assert.strictEqual(clipped.originalDots, 1);
    assert.strictEqual(rhythm.workshopRequestedDots(clipped), 1);
    const restored = editor.removeWorkshopEvent(measure, "following").find(event => event.id === "requested");
    assert.strictEqual(restored.noteValue, value); assert.strictEqual(restored.dots, 1);
    assert.strictEqual(restored.originalNoteValue, undefined); assert.strictEqual(restored.originalDots, undefined);
  }
  let legacy = bar();
  legacy.events = editor.placeWorkshopEvent(legacy, 0, note("whole", 0, "whole"));
  legacy.events = editor.placeWorkshopEvent(legacy, 3, note("later", 3));
  const clipped = legacy.events.find(event => event.id === "whole");
  assert.strictEqual(clipped.noteValue, "quarter"); assert.strictEqual(clipped.dots, undefined);
  assert.strictEqual(clipped.originalNoteValue, "whole"); assert.strictEqual(clipped.originalDots, undefined);
  let tiny = bar();
  tiny.events = editor.placeWorkshopEvent(tiny, 0, note("dot-sixteenth", 0, "sixteenth", 1));
  tiny.events = editor.placeWorkshopEvent(tiny, .25, note("neighbour", .25, "thirtysecond"));
  const shortest = tiny.events.find(event => event.id === "dot-sixteenth");
  assert.strictEqual(shortest.noteValue, "thirtysecond"); assert.strictEqual(shortest.originalDots, 1);
  assert.strictEqual(rhythm.workshopRequestedUnits(shortest), .75);
});

test("beams use actual dotted durations and retain complete fine-grid note groups", () => {
  const measure = bar([note("one", 0, "eighth", 1), note("two", 1.5, "sixteenth", 1),
    { id: "gap", kind: "rest", noteValue: "thirtysecond", pitch: null, startSlot: 2.25 },
    note("three", 2.5, "thirtysecond")]);
  const connected = editor.joinWorkshopNotes(measure, ["one", "two", "three"]);
  assert(connected); const group = connected.find(event => event.id === "one").beamGroupId;
  assert(connected.filter(event => event.kind === "note").every(event => event.beamGroupId === group));
  assert(model.isValidWorkshopMeasure(Object.assign({}, measure, { events: connected })));
  const moved = editor.moveWorkshopNotes(Object.assign({}, measure, { events: connected }), ["one", "two", "three"], "one", .25, model.workshopPitchFromValue(48));
  assert(moved && moved.filter(event => event.kind === "note").every(event => event.beamGroupId === group));
  const overlap = model.cloneWorkshop(connected); overlap.find(event => event.id === "gap").startSlot = 1.25;
  assert.strictEqual(model.isValidWorkshopMeasure(Object.assign({}, measure, { events: overlap })), false);
});

test("dot metadata is strict and original dots cannot describe a shorter request than the sounding event", () => {
  for (const mutate of [
    event => { event.dots = -1; }, event => { event.dots = 4; }, event => { event.dots = true; },
    event => { event.dots = .5; event.noteValue = "thirtysecond"; },
    event => { event.originalDots = 1; },
    event => { event.originalNoteValue = "quarter"; event.originalDots = -1; },
    event => { event.originalNoteValue = "thirtysecond"; event.originalDots = 1; },
    event => { event.noteValue = "half"; event.dots = 1; event.originalNoteValue = "quarter"; event.originalDots = 1; },
    event => { event.noteValue = "sixteenth"; event.dots = 1; event.originalNoteValue = "sixteenth"; }
  ]) {
    const event = note("malformed"); mutate(event);
    assert.strictEqual(model.isValidWorkshopMeasure(bar([event])), false);
  }
  assert(model.isValidWorkshopMeasure(bar([Object.assign(note("remembered", 0, "thirtysecond"), {
    originalNoteValue: "sixteenth", originalDots: 1
  })])));
});

test("score-level ties validate and timeline metadata survives valid structural changes while broken connections are repaired", () => {
  const score = tiedScore(); const before = JSON.stringify(score);
  const timeline = model.workshopTimeline(score); const notes = timeline.events.filter(event => event.id);
  assert.strictEqual(notes.find(event => event.id === "a").tieToId, "b");
  assert.strictEqual(notes.find(event => event.id === "b").tieFromId, "a");
  assert.strictEqual(notes.find(event => event.id === "b").tieToId, "c");
  assert.strictEqual(notes.find(event => event.id === "b").durationMs, 1500);
  const retained = [{ fromId: "b", toId: "c" }];
  for (const changed of [model.insertWorkshopMeasures(score, 0), model.removeWorkshopMeasure(score, 0),
    model.moveWorkshopMeasure(score, 1, 0), model.setWorkshopMeasureContext(score, 0, { meter: "6/4" })]) {
    assert(changed && model.isValidWorkshopScore(changed)); assert.deepStrictEqual(changed.ties, retained);
  }
  assert.deepStrictEqual(model.setWorkshopKey(score, "G-major").ties, score.ties);
  let two = model.setWorkshopSecondStaffEnabled(score, true);
  two.parts[1].measures[0].events = [note("lower-a", 6, "quarter", 0, 24)];
  two.parts[1].measures[1].events = [note("lower-b", 0, "quarter", 0, 24)];
  two.ties.push({ fromId: "lower-a", toId: "lower-b" });
  const hidden = model.setWorkshopSecondStaffEnabled(two, false);
  assert.deepStrictEqual(hidden.ties, two.ties); assert(model.isValidWorkshopScore(hidden));
  const broken = model.cloneWorkshop(score); broken.ties[0].toId = "missing";
  assert.strictEqual(model.isValidWorkshopScore(broken), false);
  assert.strictEqual(model.isValidWorkshopScore(Object.assign(model.cloneWorkshop(score), { ties: null })), false);
  assert(model.isValidWorkshopScore(ties.repairWorkshopTies(broken)));
  assert.strictEqual(JSON.stringify(score), before);
  const untied = model.createWorkshopDraft("Legacy bars", 2).score;
  assert.strictEqual(Object.prototype.hasOwnProperty.call(model.moveWorkshopMeasure(untied, 0, 1), "ties"), false);
});

test("legacy revisions stay byte-for-byte intact and dots, remembered values, fine timing and ties round-trip through backups", () => {
  const persisted = storage(); const draft = model.createWorkshopDraft("Backup rhythm", 3);
  draft.score.parts[0].measures[0].events = [{ id: "legacy", kind: "note", noteValue: "quarter", pitch: model.workshopPitchFromValue(48) }];
  const first = store.storeWorkshopDraft(draft, persisted); const oldRevision = JSON.stringify(first.piece.revisions[0]);
  const changed = model.openWorkshopPiece(first.piece); changed.score = tiedScore();
  changed.score = model.setWorkshopSecondStaffEnabled(changed.score, true);
  changed.score.parts[1].measures[0].events = [Object.assign(note("remembered", .25, "thirtysecond", 0, 24), {
    originalNoteValue: "sixteenth", originalDots: 1
  }), note("following", .5, "sixteenth", 0, 28)];
  changed.score.parts[1].enabled = false;
  const saved = store.storeWorkshopDraft(changed, persisted);
  assert.strictEqual(JSON.stringify(saved.piece.revisions[0]), oldRevision);
  const exported = backup.createSaveDataBackup(persisted); assert(backup.validateSaveDataBackup(exported).valid);
  const expected = store.readWorkshopLibrary(persisted); const target = storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); target.setItem("unrelated", "keep");
  for (const mode of ["replace", "merge", "merge"]) {
    imports.applyPreparedSaveDataImport(target, imports.prepareSaveDataImport(target, exported, mode));
    assert.deepStrictEqual(store.readWorkshopLibrary(target), expected);
  }
  assert.strictEqual(target.getItem("unrelated"), "keep");
  const malformed = model.cloneWorkshop(exported); malformed.version=5; malformed.data.workshopLibrary=model.cloneWorkshop(expected);
  malformed.data.workshopLibrary.pieces[0].revisions[1].score.parts[1].measures[0].events[0].originalDots = 4;
  assert.strictEqual(backup.validateSaveDataBackup(malformed).valid, false);
  const before = target.getItem(model.WORKSHOP_STORAGE_KEY);
  assert.throws(() => imports.prepareSaveDataImport(target, malformed, "replace"));
  assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY), before);
});

process.stdout.write("Workshop rhythm model tests passed.\n");
