const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const root = path.resolve(__dirname, "../src") + path.sep;
const original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(root)) return original(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = original;

function test(name, body) { body(); process.stdout.write("✓ " + name + "\n"); }
function notes(score, hand) {
  return score.measures.reduce((all, measure) => all.concat((measure.voices[hand] || [])
    .filter(event => event.kind === "note").map(event => event.note)), []);
}
function config(seed, movement, handMode, extra = {}) {
  return Object.assign({ seed, movement, handMode, clefs: ["treble"],
    secondaryNotesPerBlock: 2, difficulty: "custom", tonalityMode: "circle",
    selectedKey: "C-major", accidentals: "no",
    ranges: { bass: { min: 24, max: 47 }, treble: { min: 48, max: 72 } }
  }, extra);
}
function scoreOptions(handMode, shorter = true) {
  return { meter: "4/4", measureCount: shorter ? 16 : 4,
    allowedValues: { treble: shorter ? ["sixteenth"] : ["quarter", "half"],
      bass: ["quarter", "eighth"] }, restChance: 0.1, noteDensity: 65 };
}
function measureMovement(movement, handMode, algorithmSettings) {
  const results = { treble: { pairs: 0, motion: 0, leaps: 0, repeats: 0 },
    bass: { pairs: 0, motion: 0, leaps: 0, repeats: 0 } };
  for (let seed = 0; seed < 24; seed += 1) {
    let state = null;
    const previous = { treble: null, bass: null }, run = { treble: 0, bass: 0 };
    for (let cycleIndex = 0; cycleIndex < 6; cycleIndex += 1) {
      const generated = generateNoteFlowCycle(config(seed, movement, handMode, { algorithmSettings }), cycleIndex, state);
      const score = generateNoteFlowRhythmicScore(generated, scoreOptions(handMode));
      ["treble", "bass"].forEach(hand => {
        notes(score, hand).forEach(note => {
          assert(note.value >= (hand === "bass" ? 24 : 48));
          assert(note.value <= (hand === "bass" ? 47 : 72));
          assert(generated.tonalityPlan.key.scalePitchClasses.includes(note.pitchClass));
          const prior = previous[hand];
          run[hand] = prior && prior.value === note.value ? run[hand] + 1 : 1;
          if (movement !== "custom" || algorithmSettings.repetition === 0) {
            assert(run[hand] <= 2, hand + " got stuck for seed " + seed + ": " + run[hand]);
          }
          if (prior) {
            const distance = Math.abs(note.value - prior.value);
            assert(distance <= 12, hand + " has an oversized played jump: " + distance);
            assert.notStrictEqual(distance, 6);
            results[hand].pairs += 1;
            results[hand].motion += distance;
            results[hand].leaps += distance > 4 ? 1 : 0;
            results[hand].repeats += distance === 0 ? 1 : 0;
          }
          previous[hand] = note;
        });
      });
      state = score.nextState;
    }
  }
  Object.values(results).forEach(result => {
    result.mean = result.motion / (result.pairs || 1);
    result.leapRate = result.leaps / (result.pairs || 1);
    result.repeatRate = result.repeats / (result.pairs || 1);
  });
  return results;
}

test("preset differences survive actual rhythm, sparse bass and buffered phrases across many seeds", () => {
  for (const handMode of ["single", "two"]) {
    const calm = measureMovement("calm", handMode);
    const mixed = measureMovement("mixed", handMode);
    const leaping = measureMovement("leaping", handMode);
    for (const hand of handMode === "two" ? ["treble", "bass"] : ["treble"]) {
      assert(mixed[hand].mean > calm[hand].mean + 0.8);
      assert(leaping[hand].mean > mixed[hand].mean + 1.5);
      assert(mixed[hand].leapRate > calm[hand].leapRate + 0.1);
      assert(leaping[hand].leapRate > mixed[hand].leapRate + 0.15);
    }
    process.stdout.write("Played " + handMode + " motion: " + JSON.stringify({
      calm: [calm.treble.mean, calm.bass.mean], mixed: [mixed.treble.mean, mixed.bass.mean],
      leaping: [leaping.treble.mean, leaping.bass.mean]
    }) + "\n");
  }
});

test("custom jump frequency, size and repetition affect both played hands", () => {
  const few = measureMovement("custom", "two", { jumpFrequency: 0, jumpSize: 10, repetition: 0 });
  const many = measureMovement("custom", "two", { jumpFrequency: 100, jumpSize: 10, repetition: 0 });
  const small = measureMovement("custom", "two", { jumpFrequency: 100, jumpSize: 3, repetition: 0 });
  const repeated = measureMovement("custom", "two", { jumpFrequency: 0, jumpSize: 10, repetition: 100 });
  for (const hand of ["treble", "bass"]) {
    assert(many[hand].mean > few[hand].mean + 4);
    assert(many[hand].mean > small[hand].mean + 3);
    assert(repeated[hand].repeatRate > few[hand].repeatRate + 0.3);
    assert(many[hand].repeatRate < 0.03);
  }
});

test("every key retains tonal ranges, playable motion and non-mutating deterministic rhythm", () => {
  for (const key of NOTE_FLOW_TONALITIES) for (const movement of ["calm", "mixed", "leaping"]) {
    const input = config("key-" + key.id, movement, "two", {
      selectedKey: key.id, accidentals: "sharpAndFlat" });
    const generated = generateNoteFlowCycle(input);
    const before = JSON.stringify(generated);
    const score = generateNoteFlowRhythmicScore(generated, scoreOptions("two"));
    assert.deepStrictEqual(score, generateNoteFlowRhythmicScore(generated, scoreOptions("two")));
    assert.strictEqual(JSON.stringify(generated), before);
    ["treble", "bass"].forEach(hand => {
      const played = notes(score, hand);
      played.forEach((note, index) => {
        assert(key.scalePitchClasses.includes(note.pitchClass));
        assert(note.value >= input.ranges[hand].min && note.value <= input.ranges[hand].max);
        if (index) {
          assert(Math.abs(note.value - played[index - 1].value) <= 12);
          assert.notStrictEqual(Math.abs(note.value - played[index - 1].value), 6);
        }
      });
      assert.strictEqual(score.nextState[hand === "bass" ? "lastSecondaryValue" : "lastPrimaryValue"], played.slice(-1)[0].value);
    });
  }
});

test("the leaping tessitura regression never sticks eleven attacks onto a single pitch", () => {
  let state = null;
  for (let index = 0; index < 12; index += 1) {
    const generated = generateNoteFlowCycle(config(0, "leaping", "two"), index, state);
    const right = generated.timeline.events.map(event => event.notes[0].value);
    assert(generated.melodyPlan.activeMaxValue - generated.melodyPlan.activeMinValue >= 21);
    right.forEach((value, offset) => {
      if (offset >= 2) assert(!(value === right[offset - 1] && value === right[offset - 2]));
    });
    state = generated.nextState;
  }
});

test("a genuinely restricted one-pitch range remains repeatable instead of leaving the selected range", () => {
  for (const movement of ["calm", "mixed", "leaping", "custom"]) {
    const generated = generateNoteFlowCycle(config("one-pitch", movement, "single", {
      ranges: { treble: { min: 60, max: 60 } }, algorithmSettings: { repetition: 0 }
    }));
    const score = generateNoteFlowRhythmicScore(generated, scoreOptions("single"));
    assert(notes(score, "treble").every(note => note.value === 60));
    assert(Number.isFinite(score.nextState.lastPrimaryValue));
  }
});
