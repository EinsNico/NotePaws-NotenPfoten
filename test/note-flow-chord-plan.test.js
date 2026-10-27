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
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

function chords(plan) {
  return plan.blocks.reduce((all, block) => all.concat(block.chords), []);
}

function checkVoicings(plan, expectedSize) {
  chords(plan).forEach(chord => {
    assert.strictEqual(chord.trebleValues.length, expectedSize);
    assert.strictEqual(chord.values.length, plan.chordSize);
    assert.strictEqual(new Set(chord.values).size, plan.chordSize);
    assert.deepStrictEqual(chord.values, chord.bassValues.concat(chord.trebleValues).sort((a, b) => a - b));
    assert(chord.trebleValues.every(value => value >= 48 && value <= 71));
    assert(chord.trebleValues[chord.trebleValues.length - 1] - chord.trebleValues[0] <= 12);
    assert(chord.trebleValues.every((value, index) => index === 0 || value > chord.trebleValues[index - 1]));
    const pcs = chord.trebleValues.map(value => value % 12);
    assert(chord.pitchClasses.every(pc => pcs.indexOf(pc) !== -1));
    if (expectedSize === 4) {
      const doubled = chord.quality === "diminished" ? chord.pitchClasses[1] : chord.pitchClasses[0];
      assert.strictEqual(pcs.filter(pc => pc === doubled).length, 2);
    }
  });
}

const major = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no", chordSize: 3, seed: 17
});
assert.strictEqual(major.keyId, "C-major");
assert.strictEqual(major.options.selectedKey, "C-major");
assert.strictEqual(createNoteFlowChordPlan({ bpm: 90, gameLength: 20 }).options.bpm, 90);
assert.strictEqual(createNoteFlowChordPlan({ bpm: 90, gameLength: 20 }).options.gameLength, 20);
assert.strictEqual(major.behavior, "wait");
assert.strictEqual(createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: "C-major", behavior: "wait" }).behavior, "wait");
assert.strictEqual(major.blocks[0].chords[0].romanNumeral, "I");
assert.strictEqual(major.blocks[0].chords[major.blocks[0].chords.length - 1].romanNumeral, "V");
assert.strictEqual(major.blocks[1].chords[major.blocks[1].chords.length - 1].romanNumeral, "I");
checkVoicings(major, 3);

const fourNotes = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no", chordSize: 4, seed: 17
});
checkVoicings(fourNotes, 4);
assert.strictEqual(fourNotes.bassNotePlanned, false);
assert(chords(fourNotes).every(chord => chord.bassValue === null));

const withBass = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no", chordSize: 4,
  bassNote: true, seed: 17
});
assert.strictEqual(withBass.bassNotePlanned, true);
checkVoicings(withBass, 4);
const withBassChords = chords(withBass);
withBassChords.forEach(chord => {
  assert(Number.isInteger(chord.bassValue));
  assert(chord.bassValue >= 28 && chord.bassValue <= 43);
  assert(chord.bassValue <= chord.trebleValues[0] - 5);
  assert.strictEqual(chord.bassValue % 12, chord.pitchClasses[0]);
});
withBassChords.slice(1).forEach((chord, index) => {
  assert(Math.abs(chord.bassValue - withBassChords[index].bassValue) <= withBass.options.ranges.bass.max - withBass.options.ranges.bass.min);
});
assert.deepStrictEqual(withBass, createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no", chordSize: 4,
  bassNote: true, seed: 17
}));

const modalMinor = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "A-minor", accidentals: "no", chordSize: 4
});
assert.strictEqual(modalMinor.harmonicStyle, "modal-minor");
assert.strictEqual(modalMinor.blocks[0].chords[modalMinor.blocks[0].chords.length - 1].romanNumeral, "VII");
assert(chords(modalMinor).every(chord => chord.pitchClasses.every(pc => [9, 11, 0, 2, 4, 5, 7].indexOf(pc) !== -1)));
checkVoicings(modalMinor, 4);

const tonalMinor = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "A-minor", accidentals: "sharpAndFlat", chordSize: 3
});
assert.strictEqual(tonalMinor.harmonicStyle, "tonal-minor");
const dominant = tonalMinor.blocks[0].chords[tonalMinor.blocks[0].chords.length - 1];
assert.strictEqual(dominant.romanNumeral, "V");
assert.deepStrictEqual(dominant.pitchClasses, [4, 8, 11]);
assert.strictEqual(dominant.raisedLeadingTone, true);
checkVoicings(tonalMinor, 3);

NOTE_FLOW_TONALITIES.forEach(key => {
  [3, 4].forEach(chordSize => {
    const input = { tonalityMode: "circle", selectedKey: key.id, accidentals: "sharpAndFlat", chordSize, bassNote: true, seed: 983 };
    const first = createNoteFlowChordPlan(input, 2);
    const second = createNoteFlowChordPlan(input, 2);
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.blocks[first.blocks.length - 1].chords.slice(-1)[0].scaleDegree, 1);
    checkVoicings(first, chordSize);
    const generatedChords = chords(first);
    generatedChords.forEach(chord => {
      assert(chord.bassValue >= 28 && chord.bassValue <= 43);
      assert.strictEqual(chord.bassValue % 12, chord.pitchClasses[0]);
      assert(chord.bassValue <= chord.trebleValues[0] - 5);
    });
    generatedChords.slice(1).forEach((chord, index) => {
      assert(Math.abs(chord.bassValue - generatedChords[index].bassValue) <= first.options.ranges.bass.max - first.options.ranges.bass.min);
    });
  });
});

// The new controls only choose between the same harmonically valid voicings.
NOTE_FLOW_TONALITIES.forEach(key => {
  for (const chordSize of [3, 4]) for (const frequency of [0, 100]) {
    const input = { movement: "custom", chordSize, bassNote: true, tonalityMode: "circle",
      selectedKey: key.id, accidentals: "sharpAndFlat", seed: 983,
      algorithmSettings: { jumpFrequency: frequency, jumpSize: 12, bassJumpFrequency: frequency } };
    const before = JSON.stringify(input);
    const plan = createNoteFlowChordPlan(input, 2);
    assert.deepStrictEqual(plan, createNoteFlowChordPlan(input, 2));
    assert.strictEqual(JSON.stringify(input), before);
    checkVoicings(plan, chordSize);
    const reference = chords(createNoteFlowChordPlan(Object.assign({}, input, { movement: "mixed" }), 2));
    chords(plan).forEach((chord, index) => {
      assert.deepStrictEqual(chord.pitchClasses, reference[index].pitchClasses);
      assert.strictEqual(chord.romanNumeral, reference[index].romanNumeral);
      assert.strictEqual(chord.bassValue % 12, chord.pitchClasses[0]);
      assert(chord.bassValue >= 28 && chord.bassValue <= 43);
      assert(chord.bassValue <= chord.trebleValues[0] - 5);
    });
  }
});

function movementMeasurements(algorithmSettings) {
  let movement = 0, bassJumps = 0, transitions = 0;
  for (let seed = 0; seed < 40; seed++) {
    const sequence = chords(createNoteFlowChordPlan({ movement: "custom", chordSize: seed % 2 ? 3 : 4,
      bassNote: true, tonalityMode: "circle", selectedKey: ["C-major", "G-major", "A-minor"][seed % 3],
      accidentals: "sharpAndFlat", seed, algorithmSettings }, seed % 4));
    sequence.slice(1).forEach((chord, index) => {
      const previous = sequence[index];
      movement += chord.trebleValues.reduce((sum, value, voice) => sum + Math.abs(value - previous.trebleValues[voice]), 0)
        / chord.trebleValues.length;
      if (Math.abs(chord.bassValue - previous.bassValue) >= 8) bassJumps++;
      transitions++;
    });
  }
  return { mean: movement / transitions, bassJumpRate: bassJumps / transitions };
}
const small = movementMeasurements({ jumpFrequency: 0, jumpSize: 12, bassJumpFrequency: 0 });
const large = movementMeasurements({ jumpFrequency: 100, jumpSize: 12, bassJumpFrequency: 100 });
const narrow = movementMeasurements({ jumpFrequency: 100, jumpSize: 2, bassJumpFrequency: 0 });
assert(large.mean > small.mean + 2, "jump frequency favors larger whole-grip motion across seeds");
assert(large.mean > narrow.mean + 2, "jump size affects the selected voicings across seeds");
assert(large.bassJumpRate > small.bassJumpRate + .1, "the bass control changes octave-jump preference within the allowed bass range");

for (const movement of ["calm", "mixed", "leaping"]) {
  const input = { movement, chordSize: 4, bassNote: true, seed: 17, tonalityMode: "circle", selectedKey: "C-major" };
  const reference = createNoteFlowChordPlan(input, 2);
  const customStored = createNoteFlowChordPlan(Object.assign({}, input, {
    algorithmSettings: { jumpFrequency: 100, jumpSize: 12, bassJumpFrequency: 100 }
  }), 2);
  assert.deepStrictEqual(customStored.blocks, reference.blocks, "stored custom values do not affect a preset");
  assert.deepStrictEqual(customStored.nextState, reference.nextState);
}
const independent = { movement: "custom", chordSize: 4, bassNote: true, seed: 991,
  tonalityMode: "circle", selectedKey: "G-major", algorithmSettings: { jumpFrequency: 55, jumpSize: 9, bassJumpFrequency: 0 } };
const quietBass = chords(createNoteFlowChordPlan(independent, 2));
const jumpingBass = chords(createNoteFlowChordPlan(Object.assign({}, independent, {
  algorithmSettings: Object.assign({}, independent.algorithmSettings, { bassJumpFrequency: 100 })
}), 2));
assert.deepStrictEqual(quietBass.map(chord => chord.trebleValues), jumpingBass.map(chord => chord.trebleValues),
  "bass movement does not alter the right-hand grips");

console.log("Chord harmony plans: OK");
