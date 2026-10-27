const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const model = require("../src/model/Workshop");
const editor = require("../src/model/WorkshopScoreEditor");
const { layoutWorkshopChords } = require("../src/model/WorkshopChordLayout");
const { workshopBeamStemDirections, layoutWorkshopBeams } = require("../src/model/WorkshopBeamLayout");
Module._extensions[".js"] = originalLoader;
let tests = 0;
function test(name, check) { check(); tests++; console.log("✓ " + name); }
function note(value, startSlot = 0, noteValue = "eighth") {
  return { id: model.workshopId("note"), kind: "note", noteValue, startSlot,
    pitch: model.workshopPitchFromValue(value) };
}
function bar(events = [], meter = "4/4", clef = "treble") { return { events, meter, clef }; }
function withEvents(measure, events) { return Object.assign({}, measure, { events }); }
function notes(events) { return events.filter(event => event.kind === "note"); }
function assertValidGroups(measure) {
  assert(model.isValidWorkshopMeasure(measure));
  const ids = new Set(measure.events.filter(event => event.beamGroupId).map(event => event.beamGroupId));
  ids.forEach(id => assert(model.isValidWorkshopBeamGroup(measure.events, id)));
}
function joinedRow(count = 5, meter = "3/2") {
  const measure = bar(Array.from({ length: count }, (_, index) => note(48 + index % 12, index)), meter);
  return withEvents(measure, editor.joinWorkshopNotes(measure, measure.events.map(event => event.id)));
}

test("editor uses all supported meter capacities for placement, replacement, moving and removal", () => {
  for (const meter of model.WORKSHOP_METERS) {
    const units = model.workshopMeterUnits(meter);
    const measure = bar([], meter, "bass");
    const last = note(24, units - .5, "sixteenth");
    let events = editor.placeWorkshopEvent(measure, last.startSlot, last);
    assert(events && model.isValidWorkshopMeasure(withEvents(measure, events)), meter);
    assert.strictEqual(model.workshopMeasureUnits({ events }), units);
    assert(events.every(event => event.startSlot + model.WORKSHOP_NOTE_UNITS[event.noteValue] <= units));
    assert.strictEqual(editor.placeWorkshopEvent(measure, units, note(36, units, "sixteenth")), null);
    assert.strictEqual(editor.moveWorkshopNote(withEvents(measure, events), last.id, units, last.pitch), null);
    events = editor.moveWorkshopNote(withEvents(measure, events), last.id, 0, last.pitch);
    assert(events && notes(events)[0].startSlot === 0);
    events = editor.replaceWorkshopEvents(withEvents(measure, events), [Object.assign({}, notes(events)[0], { noteValue: "quarter" })]);
    assert(events && notes(events)[0].noteValue === "quarter");
    events = editor.removeWorkshopEvent(withEvents(measure, events), last.id);
    assert(events && events.every(event => event.kind === "rest"));
    assert(model.isValidWorkshopMeasure(withEvents(measure, events)));
  }
});

test("3/2 edits retain notes beyond the former 4/4 edge and restore durations to their real bar end", () => {
  const original = note(36, 8, "half");
  const measure = bar([original], "3/2", "bass");
  const before = JSON.stringify(measure);
  const late = note(48, 10.5, "sixteenth");
  let events = editor.placeWorkshopEvent(measure, late.startSlot, late);
  assert(events);
  assert.strictEqual(events.find(event => event.id === original.id).noteValue, "quarter");
  assert.strictEqual(events.find(event => event.id === original.id).originalNoteValue, "half");
  events = editor.removeWorkshopEvents(withEvents(measure, events), [late.id]);
  assert.strictEqual(events.find(event => event.id === original.id).noteValue, "half");
  assert(!events.find(event => event.id === original.id).originalNoteValue);
  assert.strictEqual(JSON.stringify(measure), before);
  assert(model.isValidWorkshopMeasure(withEvents(measure, events)));
});

test("geometry snaps every sixteenth subdivision in each meter and keeps legacy default coordinates", () => {
  assert.deepStrictEqual(editor.workshopStaffGeometry(), editor.WORKSHOP_STAFF_GEOMETRY);
  for (const meter of model.WORKSHOP_METERS) {
    const units = model.workshopMeterUnits(meter);
    const geometry = editor.workshopStaffGeometry(units);
    assert.strictEqual(geometry.unitWidth, 248 / units);
    for (let slot = 0; slot < units; slot += .5) {
      const x = geometry.left + (slot + .5) * geometry.unitWidth;
      assert.strictEqual(editor.workshopSlotAtStaffX(x, units), slot);
    }
    assert.strictEqual(editor.workshopSlotAtStaffX(-100, units), 0);
    assert.strictEqual(editor.workshopSlotAtStaffX(1000, units), units - .5);
  }
  const pickup = editor.workshopStaffGeometry(.25); assert(pickup);
  assert.strictEqual(pickup.unitWidth,248/.25);
  assert.strictEqual(editor.workshopSlotAtStaffX(pickup.left+.25*pickup.unitWidth,.25,0,.25),0);
  for (const invalid of [0, -.5, 1/11, NaN, Infinity]) {
    assert.strictEqual(editor.workshopStaffGeometry(invalid), null);
    assert.strictEqual(editor.workshopSlotAtStaffX(120, invalid), null);
  }
});

test("clefs preserve pitches while placement ranges and staff reference lines stay correct", () => {
  assert.strictEqual(editor.workshopStaffY(model.workshopPitchFromValue(52)), 156);
  assert.strictEqual(editor.workshopStaffY(model.workshopPitchFromValue(31), "bass"), 156);
  assert.strictEqual(editor.workshopPitchAtStaffY(156, 0, "bass").step, "G");
  assert.strictEqual(model.workshopPitchValue(editor.workshopPitchAtStaffY(156, 0, "bass")), 31);
  for (let value = 9; value <= 96; value++) for (const clef of model.WORKSHOP_CLEFS) {
    const pitch = model.workshopPitchFromValue(value);
    const y = editor.workshopStaffY(pitch, clef);
    assert(Number.isFinite(y));
    const placed = editor.workshopPitchAtStaffY(y, pitch.alter, clef);
    assert(model.workshopPitchValue(placed) >= 9);
    assert(model.workshopPitchValue(placed) <= 96);
    if (value >= 9 && value <= 96) {
      assert.deepStrictEqual(placed, pitch);
    }
  }
  assert(editor.workshopStaffY(model.workshopPitchFromValue(24), "treble") > 280);
  assert(editor.workshopStaffY(model.workshopPitchFromValue(71), "bass") < 0);
  assert.strictEqual(editor.workshopStaffY(model.workshopPitchFromValue(8), "bass"), null);
  assert.strictEqual(editor.workshopPitchAtStaffY(156, 0, "percussion"), null);
});

test("group transposition supports C2 and rejects overflowing one member atomically", () => {
  const measure = bar([note(36, 0), note(40, 1)], "3/2", "bass");
  const before = JSON.stringify(measure);
  const ids = measure.events.map(event => event.id);
  const moved = editor.moveWorkshopNotes(measure, ids, ids[0], 8, model.workshopPitchFromValue(24));
  assert(moved);
  assert.deepStrictEqual(notes(moved).map(event => [event.startSlot, model.workshopPitchValue(event.pitch)]), [[8, 24], [9, 28]]);
  assert.strictEqual(editor.moveWorkshopNotes(measure, ids, ids[0], 8, model.workshopPitchFromValue(8)), null);
  assert.strictEqual(editor.moveWorkshopNotes(measure, ids, ids[0], 11, model.workshopPitchFromValue(24)), null);
  assert.strictEqual(JSON.stringify(measure), before);
});

test("single-note pitch changes and nearby moves keep the beam identity and all note identities", () => {
  const measure = joinedRow();
  const before = JSON.stringify(measure);
  const id = measure.events[2].id;
  const group = measure.events[0].beamGroupId;
  let events = editor.moveWorkshopNote(measure, id, 2, model.workshopPitchFromValue(65));
  assert(events && notes(events).every(event => event.beamGroupId === group));
  events = editor.moveWorkshopNote(withEvents(measure, events), id, 2.5, model.workshopPitchFromValue(65));
  assert(events && notes(events).every(event => event.beamGroupId === group));
  assert.strictEqual(events.find(event => event.id === id).noteValue, "sixteenth");
  assert.strictEqual(events.find(event => event.id === id).originalNoteValue, "eighth");
  assertValidGroups(withEvents(measure, events));
  assert.deepStrictEqual(notes(events).map(event => event.id).sort(), measure.events.map(event => event.id).sort());
  assert.strictEqual(JSON.stringify(measure), before);
});

test("a far move releases only that note and preserves remaining nearby beam members", () => {
  const measure = joinedRow();
  const group = measure.events[0].beamGroupId;
  const movedId = measure.events[2].id;
  const events = editor.moveWorkshopNote(measure, movedId, 10, measure.events[2].pitch);
  assert(events);
  assert(!events.find(event => event.id === movedId).beamGroupId);
  const left = events.filter(event => event.kind === "note" && event.startSlot < 2);
  const right = events.filter(event => event.kind === "note" && event.startSlot >= 3 && event.startSlot <= 4);
  // The remaining onsets are still close: 1 ends at2 and3 starts one unit later.
  assert(left.concat(right).every(event => event.beamGroupId === group));
  assertValidGroups(withEvents(measure, events));
});

test("full beam transport preserves its identity beyond the old bar edge in a long meter", () => {
  const measure = joinedRow();
  const originalGroup = measure.events[0].beamGroupId;
  const ids = measure.events.map(event => event.id);
  const events = editor.moveWorkshopNotes(measure, ids, ids[0], 6, model.workshopPitchFromValue(24));
  assert(events);
  assert.deepStrictEqual(notes(events).map(event => event.startSlot), [6, 7, 8, 9, 10]);
  assert(notes(events).every(event => event.beamGroupId === originalGroup));
  assertValidGroups(withEvents(measure, events));
});

test("individual chord tones can move nearby while a newly inserted foreign chord separates only that onset", () => {
  let measure = bar([note(48, 0), note(52, 0), note(55, 1), note(59, 2)]);
  measure = withEvents(measure, editor.joinWorkshopNotes(measure, measure.events.map(event => event.id)));
  const originalGroup = measure.events[0].beamGroupId;
  const movedId = measure.events[0].id;
  let events = editor.moveWorkshopNote(measure, movedId, .5, model.workshopPitchFromValue(40));
  assert(events && notes(events).every(event => event.beamGroupId === originalGroup));
  assertValidGroups(withEvents(measure, events));
  const foreign = note(69, 0);
  events = editor.placeWorkshopEvent(measure, 0, foreign);
  assert(events);
  assert(notes(events).filter(event => event.startSlot === 0).every(event => !event.beamGroupId));
  assert(notes(events).filter(event => event.startSlot > 0).every(event => event.beamGroupId === originalGroup));
  assertValidGroups(withEvents(measure, events));
});

test("foreign insertions split the former beam, retain its first ID and generate a new second ID", () => {
  const measure = joinedRow(6);
  const group = measure.events[0].beamGroupId;
  const foreign = note(70, 2.5, "sixteenth");
  const events = editor.placeWorkshopEvent(measure, foreign.startSlot, foreign);
  assert(events);
  const prefix = notes(events).filter(event => event.startSlot < 2.5);
  const suffix = notes(events).filter(event => event.startSlot > 2.5);
  assert(prefix.every(event => event.beamGroupId === group));
  assert(suffix[0].beamGroupId && suffix[0].beamGroupId !== group);
  assert(suffix.every(event => event.beamGroupId === suffix[0].beamGroupId));
  assert(!events.find(event => event.id === foreign.id).beamGroupId);
  assertValidGroups(withEvents(measure, events));
});

test("choosing long values unlinks the edited note even when auto-shortening restores an eighth shape", () => {
  for (const noteValue of ["quarter", "half", "whole"]) {
    const measure = joinedRow();
    const original = measure.events[2];
    const events = editor.replaceWorkshopEvents(measure, [Object.assign({}, original, { noteValue })]);
    assert(events);
    const changed = events.find(event => event.id === original.id);
    assert.strictEqual(changed.noteValue, "eighth");
    assert.strictEqual(changed.originalNoteValue, noteValue);
    assert(!changed.beamGroupId);
    assert(notes(events).filter(event => event.id !== original.id).every(event => event.beamGroupId));
    assertValidGroups(withEvents(measure, events));
  }
});

test("changing short values, deleting notes and nearby silence retain compatible beams without orphans", () => {
  const measure = joinedRow(4);
  const group = measure.events[0].beamGroupId;
  let events = editor.replaceWorkshopEvent(measure, measure.events[1].id,
    Object.assign({}, measure.events[1], { noteValue: "sixteenth" }));
  assert(events && notes(events).every(event => event.beamGroupId === group));
  events = editor.removeWorkshopEvent(withEvents(measure, events), measure.events[1].id);
  assert(events && notes(events).every(event => event.beamGroupId === group));
  assert(events.some(event => event.kind === "rest"));
  assertValidGroups(withEvents(measure, events));
  events = editor.removeWorkshopEvents(withEvents(measure, events), [measure.events[2].id, measure.events[3].id]);
  assert(events && events.every(event => !event.beamGroupId));
});

test("joining notes allows at most one eighth of silence and requires every chord tone", () => {
  const close = bar([note(48, 0), note(52, 2)], "3/2");
  const joined = editor.joinWorkshopNotes(close, close.events.map(event => event.id));
  assert(joined && notes(joined).every(event => event.beamGroupId));
  const far = bar([note(48, 0), note(52, 2.5)], "3/2");
  assert.strictEqual(editor.joinWorkshopNotes(far, far.events.map(event => event.id)), null);
  const incomplete = bar([note(48, 0), note(52, 0), note(55, 1)]);
  assert.strictEqual(editor.joinWorkshopNotes(incomplete, [incomplete.events[0].id, incomplete.events[2].id]), null);
});

test("beams retain full stem length for stored pitches outside either clef's placement window", () => {
  for (const [values, clef] of [[[24, 26], "treble"], [[69, 71], "bass"]]) {
    const measure = bar(values.map((value, index) => note(value, index)), "4/4", clef);
    const joined = editor.joinWorkshopNotes(measure, measure.events.map(event => event.id));
    const geometry = joined.map(event => Object.assign({}, event, {
      x: 105.5 + event.startSlot * 31, y: editor.workshopStaffY(event.pitch, clef)
    }));
    const notation = layoutWorkshopBeams(layoutWorkshopChords(geometry, workshopBeamStemDirections(geometry)));
    assert(notation.beams.length);
    notation.stems.forEach(stem => assert(Math.abs(stem.y2 - stem.y1) >= 38));
    notation.beams.forEach(beam => assert(beam.points.split(" ").map(point => point.split(",").map(Number))
      .every(point => point.every(Number.isFinite))));
  }
});

console.log("Workshop context editor: " + tests + " tests passed");
