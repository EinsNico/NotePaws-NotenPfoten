const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const { createNoteFlowRhythmTimeline } = require("../src/model/NoteFlowRhythmTimeline");
const { getNoteFlowRhythmDensity } = require("../src/model/NoteFlowMovement");
const { getNoteRange } = require("../src/model/NoteRanges");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write("✓ " + name + "\n");
}

function configWith(options = {}) {
  return Object.assign({
    handMode: "single", clefs: ["bass", "treble"], difficulty: "normal",
    movement: "mixed", tonalityMode: "circle", selectedKey: "C-major",
    accidentals: "sharpAndFlat", seed: "clef-variety"
  }, options);
}

function scoreFor(cycle) {
  return generateNoteFlowRhythmicScore(cycle, {
    measureCount: 16, meter: "4/4", restChance: 0.12,
    noteDensity: getNoteFlowRhythmDensity(cycle.config.movement, cycle.config.algorithmSettings),
    allowedValues: {
      treble: ["quarter", "eighth", "sixteenth"],
      bass: ["half", "quarter", "eighth"]
    }
  });
}

function assertPlayableNote(note, cycle) {
  assert(cycle.config.clefs.includes(note.clef));
  const range = getNoteRange(note.clef, cycle.config.difficulty,
    cycle.config.ranges[note.clef].min, cycle.config.ranges[note.clef].max);
  assert(Number.isInteger(note.value));
  assert(note.value >= range.min && note.value <= range.max,
    `${note.clef} pitch ${note.value} must stay in ${range.min}–${range.max}`);
  assert(cycle.tonalityPlan.key.scalePitchClasses.includes(note.value % 12));
}

function inspectSingleScore(cycle, score) {
  assert.strictEqual(score.measures.length, 16);
  assert.strictEqual(cycle.timeline.simultaneousEventCount, 0);
  cycle.timeline.events.forEach(event => {
    assert.strictEqual(event.notes.length, 1);
    assertPlayableNote(event.notes[0], cycle);
  });
  const activeClefs = score.measures.map(measure => {
    const soundingHands = score.hands.filter(hand => measure.voices[hand].some(event => event.kind === "note"));
    assert.strictEqual(soundingHands.length, 1, "a single-hand measure must use one active clef");
    score.hands.forEach(hand => {
      const voice = measure.voices[hand];
      assert.strictEqual(voice[0].startTick, 0);
      assert.strictEqual(voice[voice.length - 1].endTick, 384);
      voice.forEach(event => {
        if (event.kind === "note") {
          assert.strictEqual(event.note.clef, hand);
          assertPlayableNote(event.note, cycle);
        }
      });
    });
    return soundingHands[0];
  });
  const timeline = createNoteFlowRhythmTimeline(score, { bpm: 60 });
  assert(timeline.targets.length > 0);
  timeline.targets.forEach(target => {
    assert.strictEqual(target.notes.length, 1);
    assert.strictEqual(target.expectedValues.length, 1);
  });
  return activeClefs;
}

test("mixed and leaping switch clefs more often than calm in actual 16-bar easy, normal and hard rounds", () => {
  const measurements = {};
  for (const difficulty of ["easy", "normal", "hard"]) {
    measurements[difficulty] = {};
    for (const movement of ["calm", "mixed", "leaping"]) {
      let changes = 0, bassBars = 0, trebleBars = 0;
      for (let seed = 1; seed <= 32; seed += 1) {
        const cycle = generateNoteFlowCycle(configWith({ difficulty, movement, seed }));
        const active = inspectSingleScore(cycle, scoreFor(cycle));
        changes += active.filter((clef, index) => index > 0 && clef !== active[index - 1]).length;
        bassBars += active.filter(clef => clef === "bass").length;
        trebleBars += active.filter(clef => clef === "treble").length;
      }
      assert(bassBars > 0 && trebleBars > 0);
      measurements[difficulty][movement] = changes / 32;
    }
    assert(measurements[difficulty].mixed > measurements[difficulty].calm + 3);
    assert(measurements[difficulty].leaping > measurements[difficulty].calm + 3);
  }
  process.stdout.write("Average clef changes per 16 bars: " + JSON.stringify(measurements) + "\n");
});

test("every major/minor key remains tonal and inside the chosen preset ranges after clef changes", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const movement of ["mixed", "leaping"]) {
      NOTE_FLOW_TONALITIES.forEach((key, index) => {
        const cycle = generateNoteFlowCycle(configWith({ difficulty, movement,
          selectedKey: key.id, seed: "clef-tonal-range-" + index }));
        assert.strictEqual(cycle.tonalityPlan.key.id, key.id);
        inspectSingleScore(cycle, scoreFor(cycle));
      });
    }
  }
});

test("fixed seeds and continued rounds keep deterministic clef and pitch plans without mutating past rounds", () => {
  for (const movement of ["calm", "mixed", "leaping", "custom"]) {
    const config = configWith({ movement, difficulty: "hard", seed: "clef-continuation" });
    const first = generateNoteFlowCycle(config, 0);
    const snapshot = JSON.stringify(first);
    assert.deepStrictEqual(first, generateNoteFlowCycle(config, 0));
    assert.deepStrictEqual(scoreFor(first), scoreFor(generateNoteFlowCycle(config, 0)));
    const next = generateNoteFlowCycle(config, 1, first.nextState);
    assert.deepStrictEqual(next, generateNoteFlowCycle(config, 1, first.nextState));
    inspectSingleScore(next, scoreFor(next));
    assert.strictEqual(JSON.stringify(first), snapshot);
  }
});

test("single-clef rounds retain one clef and two-hand rounds retain their separate voice budget", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const movement of ["calm", "mixed", "leaping", "custom"]) {
      for (const clef of ["bass", "treble"]) {
        const cycle = generateNoteFlowCycle(configWith({ difficulty, movement, clefs: [clef] }));
        assert(cycle.timeline.events.every(event => event.notes[0].clef === clef));
        assert.deepStrictEqual(scoreFor(cycle).hands, [clef]);
        inspectSingleScore(cycle, scoreFor(cycle));
      }
      const config = configWith({ difficulty, movement, handMode: "two", secondaryNotesPerBlock: 4 });
      const cycle = generateNoteFlowCycle(config);
      assert.deepStrictEqual(cycle, generateNoteFlowCycle(Object.assign({}, config, { clefs: ["treble"] })));
      assert.strictEqual(cycle.timeline.simultaneousEventCount, 8);
      cycle.timeline.events.forEach(event => {
        assert.strictEqual(event.notes[0].clef, "treble");
        if (event.notes.length === 2) assert.strictEqual(event.notes[1].clef, "bass");
        event.notes.forEach(note => assertPlayableNote(note, cycle));
      });
      const score = scoreFor(cycle);
      assert.deepStrictEqual(score.hands, ["treble", "bass"]);
      score.measures.forEach(measure => {
        for (const hand of score.hands) assert(measure.voices[hand].some(event => event.kind === "note"));
      });
    }
  }
});

test("narrow, overlapping, separated and reversed custom ranges never produce invalid pitches or impossible hand combinations", () => {
  const ranges = [
    { bass: { min: 24, max: 36 }, treble: { min: 60, max: 72 } },
    { bass: { min: 45, max: 48 }, treble: { min: 48, max: 52 } },
    { bass: { min: 48, max: 48 }, treble: { min: 48, max: 48 } },
    { bass: { min: 25, max: 25 }, treble: { min: 48, max: 52 } },
    { bass: { min: 36, max: 24 }, treble: { min: 60, max: 48 } }
  ];
  for (const movement of ["calm", "mixed", "leaping", "custom"]) {
    for (const selectedRanges of ranges) {
      for (let seed = 1; seed <= 8; seed += 1) {
        const config = configWith({ movement, difficulty: "custom", ranges: selectedRanges, seed });
        let cycle;
        try { cycle = generateNoteFlowCycle(config); } catch (error) {
          error.message += "\nFailed custom configuration: " + JSON.stringify(config);
          throw error;
        }
        inspectSingleScore(cycle, scoreFor(cycle));
        assert.deepStrictEqual(cycle, generateNoteFlowCycle(config));
      }
    }
  }
});

test("calm and custom pitch plans stay independent of the rhythm-density slider", () => {
  for (const movement of ["calm", "custom"]) {
    const sparse = generateNoteFlowCycle(configWith({ movement,
      algorithmSettings: { jumpFrequency: 65, jumpSize: 8, repetition: 20, noteDensity: 0 } }));
    const dense = generateNoteFlowCycle(configWith({ movement,
      algorithmSettings: { jumpFrequency: 65, jumpSize: 8, repetition: 20, noteDensity: 100 } }));
    assert.deepStrictEqual(sparse.timeline, dense.timeline);
    assert.deepStrictEqual(sparse.nextState, dense.nextState);
  }
});
