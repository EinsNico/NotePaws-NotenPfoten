const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  return loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const { createNoteFlowRhythmMeasure } = require("../src/model/NoteFlowRhythm");
const { createNoteFlowRhythmTimeline } = require("../src/model/NoteFlowRhythmTimeline");
const { createNoteFlowRhythmStaffLayout, getNoteFlowRhythmVisualFrame } = require("../src/model/NoteFlowRhythmStaffLayout");
const { createNoteFlowStaffLayout } = require("../src/model/NoteFlowStaffLayout");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore, appendNoteFlowChordRhythmicScore,
  dropNoteFlowChordRhythmicMeasures } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordRhythmLayout } = require("../src/model/NoteFlowChordRhythmLayout");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const cycle = generateNoteFlowCycle({
  seed: "stream-geometry", handMode: "single", clefs: ["treble"],
  difficulty: "normal", tonalityMode: "random", accidentals: "onlySharp"
});

function measure(noteValue) {
  const step = noteValue === "sixteenth" ? 24 : 48;
  const source = Array.from({ length: 384 / step }, (_, index) => ({
    kind: "note", noteValue, startTick: index * step
  }));
  const result = createNoteFlowRhythmMeasure({ meter: "4/4", voices: { treble: source } });
  result.voices.treble.forEach(event => {
    event.note = cycle.timeline.events[0].notes[0];
    event.tonalityPlan = cycle.tonalityPlan;
  });
  return result;
}

function score(measures) {
  return { meter: measures[0].meter, hands: ["treble"],
    allowedValues: { treble: ["eighth", "sixteenth"] }, measures };
}

function melodyLayout(source, atMs) {
  const timeline = createNoteFlowRhythmTimeline(source, { bpm: 60 });
  const layout = createNoteFlowRhythmStaffLayout(cycle, timeline);
  return { layout, frame: getNoteFlowRhythmVisualFrame(layout, timeline, atMs) };
}

test("selected rhythm values survive generation and timeline buffering", () => {
  const generated = generateNoteFlowRhythmicScore(cycle, {
    allowedValues: { treble: ["eighth", "sixteenth"] }, measureCount: 1
  });
  assert.deepStrictEqual(generated.allowedValues, { treble: ["eighth", "sixteenth"] });
  assert.deepStrictEqual(createNoteFlowRhythmTimeline(generated).allowedValues,
    generated.allowedValues);
});

test("adding future sixteenths keeps the current melody at the same position", () => {
  const initial = score([measure("eighth"), measure("eighth")]);
  const before = melodyLayout(initial, 1000);
  const after = melodyLayout(Object.assign({}, initial, {
    measures: initial.measures.concat(measure("sixteenth"))
  }), 1000);
  assert.strictEqual(before.layout.pixelsPerQuarter, 72);
  assert.strictEqual(after.layout.pixelsPerQuarter, before.layout.pixelsPerQuarter);
  assert.strictEqual(after.frame.offsetX, before.frame.offsetX);
  assert.deepStrictEqual(after.layout.staves, before.layout.staves);
  assert.strictEqual(after.layout.events[2].x + after.frame.offsetX,
    before.layout.events[2].x + before.frame.offsetX);
});

test("discarding the last sixteenth bar keeps a waiting melody target aligned", () => {
  const initial = score([measure("sixteenth"), measure("eighth"), measure("eighth")]);
  const before = melodyLayout(initial, 4000);
  const after = melodyLayout(Object.assign({}, initial, {
    measures: initial.measures.slice(1)
  }), 0);
  assert.strictEqual(after.layout.pixelsPerQuarter, before.layout.pixelsPerQuarter);
  assert.deepStrictEqual(after.layout.staves, before.layout.staves);
  assert.strictEqual(before.layout.events[16].x + before.frame.offsetX,
    after.layout.events[0].x + after.frame.offsetX);
  assert.strictEqual(after.layout.events[0].x + after.frame.offsetX,
    after.layout.playLineX);
});

test("waiting melody accidentals remain in the clip and clear the meter", () => {
  const source = score([measure("eighth")]);
  const { layout } = melodyLayout(source, 0);
  const accidentalLeft = layout.playLineX + layout.events[0].note.accidentalX - 5;
  assert(accidentalLeft >= layout.noteClipX,
    "sharp or flat ink to the left of its origin stays visible");
  assert(accidentalLeft > layout.timeSignatureX + 12,
    "the current accidental has space after the fixed meter");
  const longKey = generateNoteFlowCycle({
    tonalityMode: "circle", selectedKey: "C-sharp-major", accidentals: "sharpAndFlat"
  });
  const staff = createNoteFlowStaffLayout(longKey);
  const lastKeyOrigin = Math.max(...staff.staves[0].keySignature.map(entry => entry.x));
  assert(staff.noteClipX >= lastKeyOrigin + 14,
    "long fixed key signatures also clear the moving note clip");
});

test("chord streams keep their density when the last sixteenth bar is discarded", () => {
  const plan = createNoteFlowChordPlan({ seed: "chord-density", bpm: 60 });
  const dense = generateNoteFlowChordRhythmicScore(plan, {
    allowedValues: ["sixteenth"], bpm: 60
  });
  dense.allowedValues = ["quarter", "sixteenth"];
  const sparse = generateNoteFlowChordRhythmicScore(plan, {
    allowedValues: ["quarter"], bpm: 60
  });
  const appended = appendNoteFlowChordRhythmicScore(dense, sparse);
  const before = createNoteFlowChordRhythmLayout(appended, {
    measureCount: appended.measures.length
  });
  const after = createNoteFlowChordRhythmLayout(
    dropNoteFlowChordRhythmicMeasures(appended, dense.measures.length), {
      measureCount: sparse.measures.length
    }
  );
  assert(before.pixelsPerQuarter >= 76, "sixteenths retain their minimum spacing while glyph bounds may need more");
  assert.strictEqual(after.pixelsPerQuarter, before.pixelsPerQuarter);
  assert.deepStrictEqual(after.staves, before.staves);
});

console.log("Note Flow stream geometry: stable density, buffer rebasing and readable leading notation OK.");
