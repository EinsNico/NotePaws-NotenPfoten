const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function (loadedModule, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loadedModule, filename);
  return loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { normalizeNoteFlowChordOptions } = require("../src/model/NoteFlowChordConfig");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { createNoteFlowChordNotation } = require("../src/model/NoteFlowChordNotation");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordRhythmLayout } = require("../src/model/NoteFlowChordRhythmLayout");
const { createNoteFlowChordAudition } = require("../src/model/NoteFlowChordAudition");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

function test(name, body) { body(); process.stdout.write("✓ " + name + "\n"); }
function chords(plan) { return plan.blocks.flatMap(block => block.chords); }
function checkPlan(plan) {
  for (const chord of chords(plan)) {
    assert.strictEqual(chord.values.length, plan.chordSize);
    assert.strictEqual(new Set(chord.values).size, plan.chordSize,
      "a physical key belongs to just one hand, even inside an overlapping range");
    assert.deepStrictEqual(chord.values, chord.bassValues.concat(chord.trebleValues).sort((a, b) => a - b));
    for (const hand of ["bass", "treble"]) {
      const values = chord[hand + "Values"];
      assert.strictEqual(values.length, plan.options[hand + "NotesPerChord"]);
      assert(values.every(value => value >= plan.options.ranges[hand].min
        && value <= plan.options.ranges[hand].max));
      assert(values.every((value, index) => !index || value > values[index - 1]));
    }
    assert(chord.pitchClasses.every(pc => chord.values.some(value => value % 12 === pc)));
  }
}

const wide = { customMinValue: 12, customBassMaxValue: 95,
  customTrebleMinValue: 12, customMaxValue: 95 };

test("fresh settings are C major without accidentals and legacy bass sizes migrate once", () => {
  const defaults = normalizeNoteFlowChordOptions();
  assert.strictEqual(defaults.selectedKey, "C-major");
  assert.strictEqual(defaults.tonalityMode, "circle");
  assert.strictEqual(defaults.accidentals, "no");
  assert.strictEqual(defaults.handMode, "single");
  assert.strictEqual(defaults.singleHand, "treble");
  assert.deepStrictEqual([defaults.bassNotesPerChord, defaults.trebleNotesPerChord], [0, 3]);
  const old = { chordSize: 4, bassNote: true, accidentals: "sharpAndFlat", selectedKey: "G-major" };
  const before = JSON.stringify(old);
  const migrated = normalizeNoteFlowChordOptions(old);
  assert.strictEqual(migrated.chordSize, 5);
  assert.deepStrictEqual([migrated.bassNotesPerChord, migrated.trebleNotesPerChord], [1, 4]);
  assert.strictEqual(migrated.ranges.bass.max, 43);
  assert.strictEqual(migrated.accidentals, "sharpAndFlat");
  assert.strictEqual(migrated.selectedKey, "G-major");
  assert.deepStrictEqual(normalizeNoteFlowChordOptions(migrated), migrated);
  assert.strictEqual(JSON.stringify(old), before);
  assert.strictEqual(normalizeNoteFlowChordOptions({ chordSize: 5, bassNote: true }).chordSize, 5,
    "sizes above four are new total-count settings, not a legacy right-hand count");
});

test("hand counts and independent, overlapping ranges normalize without changing inactive ranges", () => {
  const options = normalizeNoteFlowChordOptions({ handMode: "two", chordSize: 8,
    bassNotesPerChord: 4, trebleNotesPerChord: 4,
    customMinValue: 60, customBassMaxValue: 36,
    customTrebleMinValue: 48, customMaxValue: 72 });
  assert.deepStrictEqual(options.ranges, { bass: { min: 36, max: 60 }, treble: { min: 48, max: 72 } });
  assert.deepStrictEqual(normalizeNoteFlowChordOptions(options), options);
  const left = normalizeNoteFlowChordOptions(Object.assign({}, options, { handMode: "single", singleHand: "bass" }));
  assert.deepStrictEqual([left.bassNotesPerChord, left.trebleNotesPerChord], [8, 0]);
  assert.deepStrictEqual(left.ranges, options.ranges);
  assert.strictEqual(normalizeNoteFlowChordOptions({ handMode: "two", chordSize: 6,
    trebleNotesPerChord: 2 }).bassNotesPerChord, 4);
  const patched = normalizeNoteFlowChordOptions(Object.assign({}, options, { customBassMaxValue: 65 }));
  assert.strictEqual(patched.ranges.bass.max, 65, "flat fields override an older derived ranges object");
});

test("all total sizes from three through eight work with left, right and both hands", () => {
  for (let chordSize = 3; chordSize <= 8; chordSize++) {
    for (const selected of ["bass", "treble", "two"]) {
      const input = Object.assign({}, wide, { chordSize, handMode: selected === "two" ? "two" : "single",
        singleHand: selected, bassNotesPerChord: Math.floor(chordSize / 2), seed: "hands-" + chordSize });
      const before = JSON.stringify(input);
      const plan = createNoteFlowChordPlan(input);
      checkPlan(plan);
      assert.deepStrictEqual(plan.hands, selected === "two" ? ["treble", "bass"] : [selected]);
      assert.strictEqual(JSON.stringify(input), before);
      assert.deepStrictEqual(plan, createNoteFlowChordPlan(input));
      const notation = createNoteFlowChordNotation(chords(plan)[0]);
      assert.deepStrictEqual(notation.staves.map(staff => staff.clef), plan.hands);
      assert.strictEqual(notation.notes.length, chordSize);
      assert(notation.notes.every(note => note.y >= 10 && note.y <= notation.height - 10));
      const score = generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["eighth"] });
      assert.deepStrictEqual(score.hands, plan.hands);
      assert(score.targets.every(target => target.expectedValues.length === chordSize
        && new Set(target.expectedValues).size === chordSize));
      const layout = createNoteFlowChordRhythmLayout(score);
      assert(layout.events.filter(event => event.kind === "note").every(event =>
        event.parts.reduce((count, part) => count + part.heads.length, 0) === chordSize));
    }
  }
});

test("four plus four remains a playable eight-key target in overlapping hand ranges", () => {
  const input = { chordSize: 8, handMode: "two", bassNotesPerChord: 4, trebleNotesPerChord: 4,
    customMinValue: 36, customBassMaxValue: 60, customTrebleMinValue: 48, customMaxValue: 72 };
  for (let seed = 0; seed < 16; seed++) {
    checkPlan(createNoteFlowChordPlan(Object.assign({}, input, { seed })));
  }
  const sameRanges = createNoteFlowChordPlan(Object.assign({}, input, {
    customMinValue: 36, customBassMaxValue: 71, customTrebleMinValue: 36, customMaxValue: 71
  }));
  checkPlan(sameRanges);
  assert(chords(sameRanges).some(chord => chord.bassValues.some(value => value >= 48)),
    "a left hand can actually use the overlap rather than being hard-limited below C4");
});

test("full ranges stay bounded and all supported tonalities retain correct chord spelling", () => {
  const startedAt = Date.now();
  for (const tonality of NOTE_FLOW_TONALITIES) {
    const plan = createNoteFlowChordPlan(Object.assign({}, wide, { handMode: "two", chordSize: 8,
      bassNotesPerChord: 4, trebleNotesPerChord: 4, tonalityMode: "circle", selectedKey: tonality.id,
      accidentals: "sharpAndFlat", seed: "all-keys" }));
    checkPlan(plan);
    for (const chord of chords(plan)) {
      const notation = createNoteFlowChordNotation(chord, { tonality, displayKeySignature: true });
      assert.strictEqual(new Set(notation.notes.map(note => note.value)).size, 8);
      assert(notation.notes.every(note => Number.isFinite(note.y) && note.accidental !== undefined));
    }
  }
  const elapsed = Date.now() - startedAt;
  assert(elapsed < 5000, "wide ranges must not trigger unrestricted combination generation");
  console.log("All-key eight-tone plans generated in " + elapsed + " ms");
});

test("an unplayable range fails clearly instead of adding pitches outside the selected range", () => {
  assert.throws(() => createNoteFlowChordPlan({ handMode: "single", chordSize: 3,
    customTrebleMinValue: 48, customMaxValue: 52 }), /No playable chord.*selected hand ranges/);
  assert.throws(() => createNoteFlowChordPlan({ handMode: "single", chordSize: 8,
    customTrebleMinValue: 48, customMaxValue: 71 }), /No playable chord.*selected hand ranges/);
  assert.throws(() => createNoteFlowChordPlan({ handMode: "two", chordSize: 8,
    bassNotesPerChord: 4, trebleNotesPerChord: 4,
    customMinValue: 48, customBassMaxValue: 60, customTrebleMinValue: 48, customMaxValue: 60 }), RangeError);
});

test("audition sounds each distinct key once for new hand arrays and old chord objects", () => {
  const played = [];
  const timers = [];
  const first = chords(createNoteFlowChordPlan(Object.assign({}, wide, {
    handMode: "two", chordSize: 8, bassNotesPerChord: 4, trebleNotesPerChord: 4
  })))[0];
  const audition = createNoteFlowChordAudition({ blocks: [{ chords: [first] }] }, {
    player: { play: value => played.push(value), stopAll() {} },
    setTimeoutFn: handler => { timers.push(handler); return timers.length; }, clearTimeoutFn() {}
  });
  assert.strictEqual(audition.start(), true);
  assert.deepStrictEqual(played, first.values);
  assert.strictEqual(new Set(played).size, 8);
  audition.stop();
  const legacy = createNoteFlowChordAudition({ blocks: [{ chords: [{ bassValue: 48, values: [48, 52, 55] }] }] }, {
    player: { play: value => played.push(value), stopAll() {} }, setTimeoutFn: () => 1, clearTimeoutFn() {}
  });
  legacy.start();
  assert.deepStrictEqual(played.slice(8), [48, 52, 55]);
  legacy.stop();
});

test("both hands vary at every new grip and presets/custom sliders change actual distances", () => {
  function sample(movement, algorithmSettings) {
    let trebleMotion = 0, bassMotion = 0, transitions = 0;
    const input = { chordSize: 8, handMode: "two", bassNotesPerChord: 4, trebleNotesPerChord: 4,
      customMinValue: 28, customBassMaxValue: 60, customTrebleMinValue: 48, customMaxValue: 84,
      movement, algorithmSettings };
    for (let seed = 0; seed < 24; seed++) {
      const sequence = chords(createNoteFlowChordPlan(Object.assign({}, input, { seed })));
      sequence.slice(1).forEach((chord, index) => {
        const previous = sequence[index];
        assert.notDeepStrictEqual(chord.trebleValues, previous.trebleValues,
          "the right hand must change when another playable grip is available");
        assert.notDeepStrictEqual(chord.bassValues, previous.bassValues,
          "the left hand must change when another playable grip is available");
        trebleMotion += chord.trebleValues.reduce((sum, value, i) =>
          sum + Math.abs(value - previous.trebleValues[i]), 0) / 4;
        bassMotion += chord.bassValues.reduce((sum, value, i) =>
          sum + Math.abs(value - previous.bassValues[i]), 0) / 4;
        transitions++;
      });
    }
    return { treble: trebleMotion / transitions, bass: bassMotion / transitions };
  }
  const calm = sample("calm"), mixed = sample("mixed"), leaping = sample("leaping");
  assert(mixed.treble > calm.treble + 0.5 && leaping.treble > mixed.treble + 1);
  assert(mixed.bass > calm.bass + 0.5 && leaping.bass > mixed.bass + 1);
  const low = sample("custom", { jumpFrequency: 0, jumpSize: 12, bassJumpFrequency: 0 });
  const high = sample("custom", { jumpFrequency: 100, jumpSize: 12, bassJumpFrequency: 100 });
  const narrow = sample("custom", { jumpFrequency: 100, jumpSize: 2, bassJumpFrequency: 100 });
  assert(high.treble > low.treble + 2 && high.bass > low.bass + 2);
  assert(high.treble > narrow.treble + 2 && high.bass > narrow.bass + 2);
  console.log("Eight-tone hand motion:", { calm, mixed, leaping, low, high, narrow });
});

console.log("Chord hands, total sizes and custom ranges: OK");
