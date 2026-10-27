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
const notation = require("../src/model/NoteFlowNotation.js");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

test("two hands generate distinct, synchronized 4/4 rhythms deterministically", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two", secondaryNotesPerBlock: 8, seed: "rhythm-two-hands"
  });
  const before = JSON.stringify(cycle.timeline);
  const options = {
    meter: "4/4",
    measureCount: 3,
    allowedValues: { treble: ["eighth"], bass: ["half"] }
  };
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, options);
  assert.deepStrictEqual(score, rhythm.generateNoteFlowRhythmicScore(cycle, options));
  assert.strictEqual(JSON.stringify(cycle.timeline), before);
  assert.strictEqual(score.measures.length, 3);
  score.measures.forEach(measure => {
    assert.strictEqual(measure.voices.treble.length, 8);
    assert.strictEqual(measure.voices.bass.length, 2);
    assert.strictEqual(measure.voices.treble[7].endTick, 384);
    assert.strictEqual(measure.voices.bass[1].endTick, 384);
    assert(measure.voices.treble.every(event => event.note.clef === "treble"));
    assert(measure.voices.bass.every(event => event.note.clef === "bass"));
  });
  const abc = notation.createNoteFlowRhythmicAbc(cycle, score);
  assert(abc.includes("M:4/4"));
  assert(abc.includes("%%score {treble bass}"));
  assert.strictEqual((abc.match(/ \| /g) || []).length, 4);
  assert(abc.includes("[V:treble]"));
  assert(abc.includes("[V:bass]"));
  assert(/\d/.test(abc.split("[V:bass] ")[1]));

  const changedTreble = rhythm.generateNoteFlowRhythmicScore(cycle, {
    ...options,
    allowedValues: { treble: ["quarter", "eighth"], bass: ["half"] }
  });
  assert.deepStrictEqual(
    changedTreble.measures.map(measure => measure.voices.bass),
    score.measures.map(measure => measure.voices.bass)
  );
});

test("6/8 uses compound pulses, dotted notes and explicit rests in ABC", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], seed: "rhythm-six-eight"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "6/8",
    measureCount: 2,
    allowedValues: { treble: ["dotted-quarter"] },
    restChance: 1
  });
  assert.deepStrictEqual(score.meter.pulseStarts, [0, 144]);
  assert(score.measures.every(measure => (
    measure.voices.treble[0].kind === "note"
    && measure.voices.treble[1].kind === "rest"
    && measure.voices.treble[1].endTick === 288
  )));
  const abc = notation.createNoteFlowRhythmicAbc(cycle, score);
  assert(abc.includes("M:6/8"));
  assert(abc.includes("z6"));
  assert(!abc.includes("V:bass"));
});

test("3/4 permits a bass-only score and rejects impossible palettes", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["bass"], seed: "rhythm-bass"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "3/4", allowedValues: { bass: ["quarter"] }
  });
  assert.strictEqual(score.measures[0].voices.bass.length, 3);
  assert(notation.createNoteFlowRhythmicAbc(cycle, score).includes("M:3/4"));
  assert.throws(() => rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "3/4", allowedValues: { bass: ["whole"] }
  }), RangeError);
});

test("single-hand mode across both clefs never demands two hands together", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["bass", "treble"], seed: "rhythm-changing-clefs"
  });
  const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 8,
    allowedValues: { treble: ["eighth"], bass: ["quarter"] }
  });
  score.measures.forEach(measure => {
    const activeHands = score.hands.filter(hand => (
      measure.voices[hand].some(event => event.kind === "note")
    ));
    assert.strictEqual(activeHands.length, 1);
    assert(measure.voices[score.hands.find(hand => hand !== activeHands[0])]
      .every(event => event.kind === "rest"));
  });
});
