const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

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

const density = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowDensity.js")
);

function selectedPositions(block) {
  return block.positions.filter(position => position.secondaryNote);
}

test("supports the five planned accompaniment densities", () => {
  assert.deepStrictEqual(
    density.NOTE_FLOW_SECOND_VOICE_DENSITIES,
    [1, 2, 4, 8, 16]
  );
  density.NOTE_FLOW_SECOND_VOICE_DENSITIES.forEach(notesPerBlock => {
    const cycle = density.createNoteFlowTwoHandMelody({
      handMode: "two",
      secondaryNotesPerBlock: notesPerBlock,
      seed: `dichte-${notesPerBlock}`
    });
    cycle.blocks.forEach(block => {
      assert.strictEqual(selectedPositions(block).length, notesPerBlock);
      assert.strictEqual(block.secondaryNoteIndexes.length, notesPerBlock);
    });
    assert.deepStrictEqual(
      cycle.secondaryVoicePlan.generatedNotesPerBlock,
      [notesPerBlock, notesPerBlock]
    );
  });
});

test("always retains each block cadence", () => {
  [1, 2, 4, 8].forEach(notesPerBlock => {
    const cycle = density.createNoteFlowTwoHandMelody({
      handMode: "two",
      secondaryNotesPerBlock: notesPerBlock,
      seed: 1200 + notesPerBlock
    });
    cycle.blocks.forEach(block => {
      const finalPosition = block.positions[block.positions.length - 1];
      assert(finalPosition.secondaryNote);
      assert(finalPosition.secondaryNote.isRoot);
      assert.strictEqual(finalPosition.secondaryNote.isDensityAnchor, true);
    });
  });
});

test("prefers harmonically important positions while spreading activity", () => {
  const cycle = density.createNoteFlowTwoHandMelody({
    handMode: "two",
    secondaryNotesPerBlock: 4,
    seed: "harmonische-dichte"
  });
  cycle.blocks.forEach(block => {
    const selected = selectedPositions(block);
    assert(selected.some(position => position.harmony.startsStep));
    assert(selected.some(position => position.harmony.supportPriority >= 0.8));
    const indexes = block.secondaryNoteIndexes;
    assert(new Set(indexes.map(index => Math.floor(index / 4))).size >= 3);
  });
});

test("preserves chord tones, hand separation and deterministic selection", () => {
  const config = {
    handMode: "two",
    difficulty: "hard",
    secondaryNotesPerBlock: 8,
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "dichte-belastung"
  };
  const first = density.createNoteFlowTwoHandMelody(config, 12);
  const second = density.createNoteFlowTwoHandMelody(config, 12);
  assert.deepStrictEqual(first, second);
  first.blocks.forEach(block => {
    selectedPositions(block).forEach(position => {
      const note = position.secondaryNote;
      assert(position.harmony.pitchClasses.indexOf(note.pitchClass) !== -1);
      assert(note.value <= position.primaryNote.value - 5);
    });
  });
});

test("keeps sparse bass movement within an octave across changing keys", () => {
  density.NOTE_FLOW_SECOND_VOICE_DENSITIES.forEach(notesPerBlock => {
    let previousState = null;
    for (let cycleIndex = 0; cycleIndex < 60; cycleIndex += 1) {
      const cycle = density.createNoteFlowTwoHandMelody({
        handMode: "two",
        difficulty: "hard",
        secondaryNotesPerBlock: notesPerBlock,
        tonalityMode: "random",
        accidentals: "sharpAndFlat",
        seed: "dichte-sprungtest"
      }, cycleIndex, previousState);
      const notes = cycle.blocks.reduce((result, block) => (
        result.concat(selectedPositions(block).map(position => position.secondaryNote))
      ), []);
      if (previousState && Number.isFinite(previousState.lastSecondaryValue)) {
        const openingInterval = Math.abs(
          notes[0].value - previousState.lastSecondaryValue
        );
        assert(openingInterval <= 12);
      }
      notes.forEach((note, index) => {
        if (index === 0) {
          return;
        }
        const interval = Math.abs(note.value - notes[index - 1].value);
        assert(interval <= 12);
        assert.notStrictEqual(interval, 6);
      });
      previousState = cycle.nextState;
    }
  });
});

test("keeps the second voice empty in single-hand mode", () => {
  const cycle = density.createNoteFlowTwoHandMelody({
    handMode: "single",
    secondaryNotesPerBlock: 16,
    seed: 1300
  });
  assert.strictEqual(cycle.secondaryVoicePlan.enabled, false);
  assert.strictEqual(cycle.secondaryVoicePlan.generatedNoteCount, 0);
  assert(cycle.blocks.every(block => (
    block.positions.every(position => position.secondaryNote === null)
  )));
});

process.stdout.write("Note Flow second-voice density tests passed.\n");
