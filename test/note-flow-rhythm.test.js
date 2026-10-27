const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const modulePath = path.resolve(__dirname, "../src/model/NoteFlowRhythm.js");
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename !== modulePath) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const rhythm = require(modulePath);
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function event(kind, startTick, noteValue, dots = 0) {
  return { kind, startTick, noteValue, dots };
}

test("3/4, 4/4 and 6/8 have exact bar lengths and distinct pulses", () => {
  assert.strictEqual(rhythm.getNoteFlowMeter("3/4").durationTicks, 288);
  assert.strictEqual(rhythm.getNoteFlowMeter("4/4").durationTicks, 384);
  assert.strictEqual(rhythm.getNoteFlowMeter("6/8").durationTicks, 288);
  assert.deepStrictEqual(rhythm.getNoteFlowMeter("3/4").pulseStarts, [0, 96, 192]);
  assert.deepStrictEqual(rhythm.getNoteFlowMeter("6/8").pulseStarts, [0, 144]);
  assert.throws(() => rhythm.getNoteFlowMeter("7/8"), RangeError);
});

test("bass and treble can fill the same 4/4 bar with independent rhythms", () => {
  const measure = rhythm.createNoteFlowRhythmMeasure({
    meter: "4/4",
    voices: {
      bass: [event("note", 0, "half"), event("note", 192, "half")],
      treble: Array.from({ length: 8 }, (_, index) => event("note", index * 48, "eighth"))
    }
  });
  assert.strictEqual(measure.rhythmVersion, 1);
  assert.strictEqual(measure.voices.bass.length, 2);
  assert.strictEqual(measure.voices.treble.length, 8);
  assert.strictEqual(measure.voices.bass[1].endTick, 384);
  assert.strictEqual(measure.voices.treble[7].endTick, 384);
  assert.strictEqual(measure.voices.treble[0].hand, "treble");
});

test("6/8 allows dotted beats and explicit rests", () => {
  const measure = rhythm.createNoteFlowRhythmMeasure({
    meter: "6/8",
    voices: {
      treble: [event("note", 0, "quarter", 1), event("rest", 144, "quarter", 1)],
      bass: [event("rest", 0, "eighth"), event("note", 48, "quarter"), event("note", 144, "quarter", 1)]
    }
  });
  assert.strictEqual(measure.voices.treble[0].durationTicks, 144);
  assert.strictEqual(measure.voices.treble[1].kind, "rest");
  assert.strictEqual(measure.voices.bass[2].endTick, 288);
});

test("single-hand 3/4 works without a second voice", () => {
  const measure = rhythm.createNoteFlowRhythmMeasure({
    meter: "3/4",
    voices: { bass: [event("note", 0, "quarter"), event("rest", 96, "half")] }
  });
  assert.deepStrictEqual(Object.keys(measure.voices), ["bass"]);
});

test("invalid gaps, overlaps, overflow and incomplete bars are rejected", () => {
  const make = events => rhythm.createNoteFlowRhythmMeasure({
    meter: "3/4", voices: { treble: events }
  });
  assert.throws(() => make([event("note", 24, "quarter"), event("rest", 120, "half")]), RangeError);
  assert.throws(() => make([event("note", 0, "half"), event("note", 96, "quarter")]), RangeError);
  assert.throws(() => make([event("note", 0, "whole")]), RangeError);
  assert.throws(() => make([event("note", 0, "half")]), RangeError);
  assert.throws(() => make([event("note", 0, "quarter", 2)]), RangeError);
  assert.throws(() => rhythm.createNoteFlowRhythmMeasure({ meter: "4/4", voices: {} }), RangeError);
});
