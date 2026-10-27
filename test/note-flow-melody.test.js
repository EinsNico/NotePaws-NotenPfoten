const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const crypto = require("crypto");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(loadedModule, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return loadedModule._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const melody = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowMelody.js")
);
const tonality = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowTonality.js")
);

function positions(cycle) {
  return cycle.blocks.reduce(
    (result, block) => result.concat(block.positions),
    []
  );
}

test("fills the 32-position hard primary melody without a second voice", () => {
  const cycle = melody.createNoteFlowPrimaryMelody({
    handMode: "two",
    difficulty: "hard",
    tonalityMode: "circle",
    selectedKey: "C-major",
    accidentals: "no",
    seed: 700
  });
  assert.strictEqual(cycle.positionCount, 32);
  assert.strictEqual(cycle.melodyPlan.profile, "mixed-primary");
  assert.strictEqual(cycle.melodyPlan.primaryClefs.length, 1);
  assert.strictEqual(cycle.melodyPlan.primaryClefs[0], "treble");
  assert(positions(cycle).every(position => position.primaryNote));
  assert(positions(cycle).every(position => position.secondaryNote === null));
  assert(positions(cycle).every(position => position.primaryNote.clef === "treble"));
});

test("resolves the question to five and the answer to one", () => {
  const cycle = melody.createNoteFlowPrimaryMelody({
    difficulty: "hard",
    tonalityMode: "circle",
    selectedKey: "G-major",
    accidentals: "onlySharp",
    seed: 44
  });
  assert.strictEqual(cycle.blocks[0].positions[15].primaryNote.scaleDegree, 5);
  assert.strictEqual(cycle.blocks[1].positions[15].primaryNote.scaleDegree, 1);
});

test("keeps every written key inside its scale and treble hard range", () => {
  tonality.NOTE_FLOW_TONALITIES.forEach((key, keyIndex) => {
    const accidentals = key.fifths < 0
      ? "onlyFlat"
      : key.fifths > 0 ? "onlySharp" : "no";
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "two",
      difficulty: "hard",
      tonalityMode: "circle",
      selectedKey: key.id,
      accidentals,
      seed: 8000 + keyIndex
    });
    const allowed = new Set(key.scalePitchClasses);
    positions(cycle).forEach(position => {
      assert(allowed.has(position.primaryNote.pitchClass));
      assert(position.primaryNote.value >= 40);
      assert(position.primaryNote.value <= 77);
      assert.strictEqual(position.primaryNote.clef, "treble");
    });
  });
});

test("produces deterministic notes, motifs and clefs", () => {
  const config = {
    handMode: "single",
    clefs: ["bass", "treble"],
    difficulty: "hard",
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "melodie-test"
  };
  const first = melody.createNoteFlowPrimaryMelody(config, 9);
  const second = melody.createNoteFlowPrimaryMelody(config, 9);
  assert.deepStrictEqual(first, second);
  assert.deepStrictEqual(
    positions(first).map(position => position.primaryNote.value),
    positions(second).map(position => position.primaryNote.value)
  );
});

test("labels source, variation and returning motif material", () => {
  const cycle = melody.createNoteFlowPrimaryMelody({
    seed: 55,
    tonalityMode: "circle",
    selectedKey: "C-major"
  });
  const firstRoles = cycle.blocks[0].positions.map(position => (
    position.primaryNote.motifRole
  ));
  const secondRoles = cycle.blocks[1].positions.map(position => (
    position.primaryNote.motifRole
  ));
  assert(firstRoles.indexOf("source") !== -1);
  assert(firstRoles.indexOf("variation") !== -1);
  assert(secondRoles.indexOf("return") !== -1);
  assert(secondRoles.indexOf("variation") !== -1);
  assert(cycle.blocks.every(block => block.motifId));
});

test("creates one marked climax per block and stays in a compact tessitura", () => {
  for (let cycleIndex = 0; cycleIndex < 80; cycleIndex += 1) {
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "single",
      clefs: ["bass", "treble"],
      difficulty: "hard",
      tonalityMode: "random",
      accidentals: "sharpAndFlat",
      seed: "kontur"
    }, cycleIndex);
    assert(
      cycle.melodyPlan.activeMaxValue - cycle.melodyPlan.activeMinValue <= 16
    );
    cycle.blocks.forEach(block => {
      const climaxes = block.positions.filter(position => (
        position.primaryNote.isClimax
      ));
      assert.strictEqual(climaxes.length, 1);
      assert.strictEqual(climaxes[0].positionIndex, block.climaxPositionIndex);
      const maximum = Math.max(...block.positions.map(position => (
        position.primaryNote.value
      )));
      assert.strictEqual(climaxes[0].primaryNote.value, maximum);
    });
  }
});

test("avoids tritones, oversized jumps and three identical notes", () => {
  let previousState = null;
  for (let cycleIndex = 0; cycleIndex < 300; cycleIndex += 1) {
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "single",
      clefs: ["bass", "treble"],
      difficulty: "hard",
      tonalityMode: "random",
      accidentals: "sharpAndFlat",
      seed: "belastung"
    }, cycleIndex, previousState);
    const notes = positions(cycle).map(position => position.primaryNote);
    notes.forEach((note, index) => {
      if (index === 0) {
        return;
      }
      const interval = Math.abs(note.value - notes[index - 1].value);
      assert.notStrictEqual(interval, 6);
      assert(interval <= 12);
      if (index >= 2) {
        assert(!(
          note.value === notes[index - 1].value
          && note.value === notes[index - 2].value
        ));
      }
    });
    previousState = cycle.nextState;
  }
});

test("keeps single-hand clef changes inside the configured registers", () => {
  let observedBass = false;
  let observedTreble = false;
  let previousState = null;
  for (let cycleIndex = 0; cycleIndex < 120; cycleIndex += 1) {
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "single",
      clefs: ["bass", "treble"],
      difficulty: "hard",
      tonalityMode: "random",
      accidentals: "sharpAndFlat",
      seed: "schluesselwechsel"
    }, cycleIndex, previousState);
    positions(cycle).forEach(position => {
      const note = position.primaryNote;
      if (note.clef === "bass") {
        observedBass = true;
        assert(note.value >= 19 && note.value <= 57);
      } else {
        observedTreble = true;
        assert(note.value >= 40 && note.value <= 77);
      }
    });
    previousState = cycle.nextState;
  }
  assert(observedBass);
  assert(observedTreble);
});

test("continues from the previous cycle without changing the finished plan", () => {
  const config = {
    handMode: "single",
    clefs: ["bass", "treble"],
    difficulty: "hard",
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: 333
  };
  const first = melody.createNoteFlowPrimaryMelody(config, 0);
  const snapshot = JSON.stringify(first);
  const second = melody.createNoteFlowPrimaryMelody(config, 1, first.nextState);
  assert.strictEqual(JSON.stringify(first), snapshot);
  assert.notStrictEqual(second.tonalityPlan.key.id, first.tonalityPlan.key.id);
  assert.strictEqual(second.melodyPlan.continuedFromPreviousCycle, true);
});

test("saved custom controls do not influence preset melodies", () => {
  ["calm", "mixed", "leaping"].forEach(movement => {
    let state = null;
    let defaultState = null;
    const notes = [];
    for (let index = 0; index < 12; index += 1) {
      const config = {
        movement,
        handMode: "single", clefs: ["bass", "treble"], difficulty: "hard",
        tonalityMode: "random", accidentals: "sharpAndFlat", seed: "preset-regression"
      };
      const cycle = melody.createNoteFlowPrimaryMelody(Object.assign({}, config, {
        algorithmSettings: { jumpFrequency: 100, jumpSize: 12, repetition: 100, noteDensity: 0 }
      }), index, state);
      const defaults = melody.createNoteFlowPrimaryMelody(config, index, defaultState);
      assert.deepStrictEqual(positions(cycle).map(position => position.primaryNote),
        positions(defaults).map(position => position.primaryNote));
      assert.deepStrictEqual(cycle.nextState, defaults.nextState);
      notes.push(cycle.blocks.map(block => block.positions.map(position => position.primaryNote)));
      state = cycle.nextState;
      defaultState = defaults.nextState;
    }
    // The calm preset keeps its established seeded material; the other two
    // presets intentionally explore both selected clefs more often now.
    if (movement === "calm") {
      assert.strictEqual(crypto.createHash("sha256").update(JSON.stringify(notes)).digest("hex"),
        "63c32eecfc64eca8be7884e4b51c0882b5adf6641a57dd823a6fd97d174c2d55");
    }
  });
});

function customMovementStatistics(algorithmSettings) {
  let state = null, distance = 0, count = 0, repeated = 0, leaps = 0;
  for (let index = 0; index < 40; index += 1) {
    const cycle = melody.createNoteFlowPrimaryMelody({
      movement: "custom", algorithmSettings, handMode: "two", difficulty: "hard",
      tonalityMode: "circle", selectedKey: "C-major", seed: "custom-regression"
    }, index, state);
    assert.deepStrictEqual(cycle, melody.createNoteFlowPrimaryMelody({
      movement: "custom", algorithmSettings, handMode: "two", difficulty: "hard",
      tonalityMode: "circle", selectedKey: "C-major", seed: "custom-regression"
    }, index, state));
    positions(cycle).forEach(position => {
      const interval = position.primaryNote.intervalFromPrevious;
      if (interval === null) return;
      const absolute = Math.abs(interval);
      assert(absolute <= 12);
      assert.notStrictEqual(absolute, 6);
      distance += absolute;
      repeated += absolute === 0 ? 1 : 0;
      leaps += absolute > 4 ? 1 : 0;
      count += 1;
    });
    state = cycle.nextState;
  }
  return { meanDistance: distance / count, repeats: repeated / count, leaps: leaps / count };
}

test("custom frequency, preferred size and repetition each change actual note selection", () => {
  const few = customMovementStatistics({ jumpFrequency: 0, jumpSize: 9, repetition: 0 });
  const many = customMovementStatistics({ jumpFrequency: 100, jumpSize: 9, repetition: 0 });
  const small = customMovementStatistics({ jumpFrequency: 100, jumpSize: 3, repetition: 0 });
  const repeats = customMovementStatistics({ jumpFrequency: 0, jumpSize: 9, repetition: 100 });
  assert(many.leaps > few.leaps + 0.3);
  assert(many.meanDistance > small.meanDistance + 2);
  assert(repeats.repeats > few.repeats + 0.3);
});

test("custom extremes preserve keys, configured ranges and the harmonic cadences", () => {
  tonality.NOTE_FLOW_TONALITIES.forEach((key, keyIndex) => {
    [0, 100].forEach(jumpFrequency => {
      const cycle = melody.createNoteFlowPrimaryMelody({
        movement: "custom", algorithmSettings: { jumpFrequency, jumpSize: 12, repetition: jumpFrequency },
        handMode: "two", difficulty: "custom", ranges: { bass: { min: 24, max: 43 }, treble: { min: 50, max: 72 } },
        tonalityMode: "circle", selectedKey: key.id, accidentals: "sharpAndFlat", seed: 29000 + keyIndex
      });
      assert.strictEqual(cycle.melodyPlan.profile, "custom-primary");
      positions(cycle).forEach(position => {
        const note = position.primaryNote;
        assert(note.value >= 50 && note.value <= 72);
        assert(key.scalePitchClasses.includes(note.pitchClass));
      });
      assert.strictEqual(cycle.blocks[0].positions[15].primaryNote.scaleDegree, 5);
      assert.strictEqual(cycle.blocks[1].positions[15].primaryNote.scaleDegree, 1);
    });
  });
});

process.stdout.write("Note Flow primary melody tests passed.\n");
