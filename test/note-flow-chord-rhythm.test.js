const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const plan = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no",
  chordSize: 4, bassNote: true, bpm: 60, seed: 17
});
const sourceChords = plan.blocks.reduce((all, block) => all.concat(block.chords), []);

test("default 4/4 preserves every chord and aligns the optional bass onset", () => {
  const before = JSON.stringify(plan);
  const score = generateNoteFlowChordRhythmicScore(plan);
  assert.strictEqual(score.meter.signature, "4/4");
  assert.deepStrictEqual(score.hands, ["treble", "bass"]);
  assert.deepStrictEqual(score.targets.map(event => event.chord.id), sourceChords.map(chord => chord.id));
  score.targets.forEach(event => {
    assert.deepStrictEqual(event.expectedValues, event.chord.values);
    assert.strictEqual(event.endMs - event.startMs,
      Math.round(event.globalEndTick * 1000 / 96)
        - Math.round(event.globalStartTick * 1000 / 96));
  });
  assert.strictEqual(JSON.stringify(plan), before);
  assert.deepStrictEqual(score, generateNoteFlowChordRhythmicScore(plan));
});

test("3/4 and 6/8 fill every measure without dropping harmony", () => {
  ["3/4", "6/8"].forEach(meter => {
    const score = generateNoteFlowChordRhythmicScore(plan, {
      meter, allowedValues: meter === "3/4"
        ? ["quarter", "eighth"] : ["dotted-quarter", "eighth"],
      restChance: 1
    });
    assert.deepStrictEqual(score.targets.map(event => event.chord.id), sourceChords.map(chord => chord.id));
    assert(score.measures.some(measure => measure.events.some(event => event.kind === "rest")));
    score.measures.forEach(measure => {
      assert.strictEqual(measure.events[0].kind, "note");
      assert.strictEqual(measure.events[0].startTick, 0);
      assert.strictEqual(measure.events[measure.events.length - 1].endTick,
        score.meter.durationTicks);
      measure.events.slice(1).forEach((event, index) => {
        assert.strictEqual(event.startTick, measure.events[index].endTick);
      });
    });
    assert.strictEqual(score.durationTicks, score.measures.length * score.meter.durationTicks);
  });
});

test("different lengths change time, not chord order or number of MIDI targets", () => {
  const quarter = generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["quarter"] });
  const half = generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["half"] });
  assert.strictEqual(quarter.targets.length, half.targets.length);
  assert.deepStrictEqual(quarter.targets.map(event => event.chord.id),
    half.targets.map(event => event.chord.id));
  assert.strictEqual(half.targets[1].startTick, quarter.targets[1].startTick * 2);
  assert(half.durationTicks > quarter.durationTicks);
});

test("without bass, each onset expects only the chord hand", () => {
  const singleHand = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", bassNote: false, seed: 17
  });
  const score = generateNoteFlowChordRhythmicScore(singleHand, {
    meter: "6/8", allowedValues: ["dotted-quarter"]
  });
  assert.deepStrictEqual(score.hands, ["treble"]);
  assert(score.targets.every(event => event.expectedValues.length === 3));
  assert(score.measures.every(measure => measure.events.every(event => (
    event.noteValue === "quarter" && event.dots === 1
  ))));
});

test("normalized chord-menu choices feed the separate rhythm preview model", () => {
  const selected = createNoteFlowChordPlan({
    rhythmMeter: "6/8", rhythmValues: ["dotted-quarter"], seed: 23
  });
  const score = generateNoteFlowChordRhythmicScore(selected, {
    meter: selected.options.rhythmMeter,
    allowedValues: selected.options.rhythmValues,
    bpm: selected.options.bpm
  });
  assert.strictEqual(score.meter.signature, "6/8");
  assert(score.measures.every(measure => measure.events.every(event => (
    event.noteValue === "quarter" && event.dots === 1
  ))));
});

test("invalid meters, values, BPM and empty plans fail clearly", () => {
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { meter: "7/8" }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, {
    meter: "3/4", allowedValues: ["whole"]
  }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { allowedValues: [] }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { bpm: 0 }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore({ blocks: [] }), TypeError);
});

console.log("Chord rhythm model: OK");
