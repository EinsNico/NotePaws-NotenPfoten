const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const generator = require("../src/model/NoteFlowGenerator.js");
const rhythm = require("../src/model/NoteFlowRhythmGenerator.js");
const rhythmModel = require("../src/model/NoteFlowRhythm.js");
const clock = require("../src/model/NoteFlowRhythmTimeline.js");
const visual = require("../src/model/NoteFlowRhythmStaffLayout.js");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

test("eighths and halves occupy proportional positions on fixed staves", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two", secondaryNotesPerBlock: 8, seed: "visual-rhythm"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 2,
    allowedValues: { treble: ["eighth"], bass: ["half"] }
  });
  const timeline = clock.createNoteFlowRhythmTimeline(score, { bpm: 60 });
  const layout = visual.createNoteFlowRhythmStaffLayout(cycle, timeline);
  const treble = layout.events.filter(event => event.hand === "treble");
  const bass = layout.events.filter(event => event.hand === "bass");
  assert.strictEqual(layout.staves.length, 2);
  assert.deepStrictEqual(layout.timeSignature, { numerator: 4, denominator: 4 });
  assert(layout.timeSignatureX < layout.playLineX);
  assert.strictEqual(treble[1].x - treble[0].x, 24);
  assert.strictEqual(bass[1].x - bass[0].x, 96);
  assert.strictEqual(layout.barlines[0].x - layout.firstNoteX, 192);
  assert.strictEqual(layout.barlines[1].x - layout.barlines[0].x, 192);
  assert.strictEqual(treble[0].note.clef, "treble");
  assert.strictEqual(bass[0].note.clef, "bass");
  assert.strictEqual(visual.getNoteFlowRhythmVisualFrame(layout, timeline, 0).offsetX,
    layout.playLineX - layout.firstNoteX);
  assert.strictEqual(visual.getNoteFlowRhythmVisualFrame(layout, timeline, 1000).offsetX,
    layout.playLineX - layout.firstNoteX - 48);
});

test("6/8 places compound beats and rests on the same moving axis", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], seed: "visual-compound"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "6/8", allowedValues: { treble: ["dotted-quarter"] },
    restChance: 1
  });
  const timeline = clock.createNoteFlowRhythmTimeline(score, { bpm: 60 });
  const layout = visual.createNoteFlowRhythmStaffLayout(cycle, timeline);
  assert.strictEqual(layout.events[0].kind, "note");
  assert.deepStrictEqual(layout.timeSignature, { numerator: 6, denominator: 8 });
  assert.strictEqual(layout.events[1].kind, "rest");
  assert.strictEqual(layout.events[1].x - layout.events[0].x, 72);
  assert.strictEqual(layout.barlines[0].x - layout.firstNoteX, 144);
  assert.strictEqual(visual.getNoteFlowRhythmVisualFrame(layout, timeline, 1000).offsetX,
    layout.playLineX - layout.firstNoteX - 72);
});

test("the time signature follows a long key signature without touching notes", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], tonalityMode: "circle",
    selectedKey: "C-sharp-major", accidentals: "sharpAndFlat",
    seed: "rhythm-seven-sharps"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "3/4", allowedValues: { treble: ["quarter"] }
  });
  const timeline = clock.createNoteFlowRhythmTimeline(score, { bpm: 60 });
  const layout = visual.createNoteFlowRhythmStaffLayout(cycle, timeline);
  const lastSharp = Math.max(...layout.staves[0].keySignature.map(note => note.x));
  assert.deepStrictEqual(layout.timeSignature, { numerator: 3, denominator: 4 });
  assert(layout.timeSignatureX > lastSharp);
  assert(layout.playLineX >= layout.timeSignatureX + 30);
  assert.strictEqual(layout.events[0].x, layout.firstNoteX);
  assert.strictEqual(visual.getNoteFlowRhythmVisualFrame(layout, timeline, 0).offsetX,
    layout.playLineX - layout.firstNoteX);
});

function measuredLayout(signature, values) {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], seed: `beams-${signature}`
  });
  const note = cycle.timeline.events[0].notes[0];
  let startTick = 0;
  const voices = { treble: values.map(value => {
    const event = { kind: value === "rest" ? "rest" : "note",
      noteValue: value === "rest" ? "eighth" : value,
      startTick, note };
    startTick += rhythmModel.getNoteFlowDurationTicks(event.noteValue);
    return event;
  }) };
  const measure = rhythmModel.createNoteFlowRhythmMeasure({ meter: signature, voices });
  measure.voices.treble.forEach((event, index) => {
    if (event.kind === "note") event.note = voices.treble[index].note;
  });
  const score = { meter: measure.meter, hands: ["treble"], measures: [measure] };
  const timeline = clock.createNoteFlowRhythmTimeline(score, { bpm: 60 });
  return visual.createNoteFlowRhythmStaffLayout(cycle, timeline);
}

test("sixteenths beam within each 4/4 beat and gain readable spacing", () => {
  const layout = measuredLayout("4/4", Array(16).fill("sixteenth"));
  assert.strictEqual(layout.pixelsPerQuarter, 72);
  assert.strictEqual(layout.events[1].x - layout.events[0].x, 18);
  assert.strictEqual(layout.beams.filter(beam => beam.level === 1).length, 4);
  assert.strictEqual(layout.beams.filter(beam => beam.level === 2).length, 12);
  assert.ok(layout.events.every(event => event.beamed));
  assert.ok(layout.beams.every(beam => beam.x2 > beam.x1));
});

test("mixed values use one primary beam and secondary sixteenth beam", () => {
  const layout = measuredLayout("4/4", ["eighth", "sixteenth", "sixteenth",
    "quarter", "quarter", "quarter"]);
  assert.strictEqual(layout.beams.filter(beam => beam.level === 1).length, 1);
  assert.strictEqual(layout.beams.filter(beam => beam.level === 2).length, 1);
  assert.strictEqual(layout.events[0].beamed, true);
  assert.strictEqual(layout.events[1].beamed, true);
  assert.strictEqual(layout.events[2].beamed, true);
  assert.strictEqual(layout.events[3].beamed, undefined);
});

test("rests break beams and 6/8 groups at each compound beat", () => {
  const layout = measuredLayout("6/8", ["eighth", "eighth", "eighth",
    "eighth", "rest", "eighth"]);
  const primary = layout.beams.filter(beam => beam.level === 1);
  assert.strictEqual(primary.length, 1);
  assert.strictEqual(primary[0].x1, layout.events[0].x + layout.events[0].note.stem.x);
  assert.strictEqual(primary[0].x2, layout.events[2].x + layout.events[2].note.stem.x);
  assert.strictEqual(layout.events[3].beamed, undefined);
  assert.strictEqual(layout.events[5].beamed, undefined);
});
