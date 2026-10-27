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

const voicing = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowSecondVoice.js")
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

test("fills every hard two-hand position with a bass note", () => {
  const cycle = voicing.createNoteFlowFullTwoHandMelody({
    handMode: "two",
    difficulty: "hard",
    tonalityMode: "circle",
    selectedKey: "C-major",
    accidentals: "no",
    seed: 810
  });
  assert.strictEqual(cycle.secondaryVoicePlan.profile, "hard-full-density");
  assert.strictEqual(cycle.secondaryVoicePlan.generatedNoteCount, 32);
  assert(positions(cycle).every(position => position.secondaryNote));
  assert(positions(cycle).every(position => position.secondaryNote.clef === "bass"));
});

test("keeps the second voice disabled in single-hand mode", () => {
  const cycle = voicing.createNoteFlowFullTwoHandMelody({
    handMode: "single",
    clefs: ["bass", "treble"],
    seed: 811
  });
  assert.strictEqual(cycle.secondaryVoicePlan.enabled, false);
  assert.strictEqual(cycle.secondaryVoicePlan.generatedNoteCount, 0);
  assert(positions(cycle).every(position => position.secondaryNote === null));
});

test("uses only current chord tones and exact cadence roots in every key", () => {
  tonality.NOTE_FLOW_TONALITIES.forEach((key, keyIndex) => {
    const cycle = voicing.createNoteFlowFullTwoHandMelody({
      handMode: "two",
      difficulty: "hard",
      tonalityMode: "circle",
      selectedKey: key.id,
      accidentals: key.fifths < 0
        ? "onlyFlat"
        : key.fifths > 0 ? "onlySharp" : "no",
      seed: 9000 + keyIndex
    });
    positions(cycle).forEach(position => {
      const note = position.secondaryNote;
      assert(position.harmony.pitchClasses.indexOf(note.pitchClass) !== -1);
      assert(note.value >= 19 && note.value <= 57);
    });
    cycle.blocks.forEach(block => {
      const finalPosition = block.positions[block.positions.length - 1];
      assert.strictEqual(
        finalPosition.secondaryNote.pitchClass,
        finalPosition.harmony.rootPitchClass
      );
    });
  });
});

test("maintains hand separation and bounded bass movement", () => {
  let previousState = null;
  for (let cycleIndex = 0; cycleIndex < 300; cycleIndex += 1) {
    const cycle = voicing.createNoteFlowFullTwoHandMelody({
      handMode: "two",
      difficulty: "hard",
      tonalityMode: "random",
      accidentals: "sharpAndFlat",
      seed: "zweite-stimme-belastung"
    }, cycleIndex, previousState);
    const notes = positions(cycle).map(position => position.secondaryNote);
    positions(cycle).forEach(position => {
      assert(position.secondaryNote.value <= position.primaryNote.value - 5);
    });
    notes.forEach((note, index) => {
      if (index === 0) {
        return;
      }
      const interval = Math.abs(note.value - notes[index - 1].value);
      assert(interval <= 12);
      assert.notStrictEqual(interval, 6);
      if (index >= 2) {
        assert(!(
          note.value === notes[index - 1].value
          && note.value === notes[index - 2].value
        ));
      }
    });
    assert.strictEqual(cycle.secondaryVoicePlan.separationFallbackCount, 0);
    previousState = cycle.nextState;
  }
});

test("is deterministic and preserves continuation state", () => {
  const config = {
    handMode: "two",
    difficulty: "hard",
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "begleitung"
  };
  const first = voicing.createNoteFlowFullTwoHandMelody(config, 4);
  const second = voicing.createNoteFlowFullTwoHandMelody(config, 4);
  assert.deepStrictEqual(first, second);
  const continued = voicing.createNoteFlowFullTwoHandMelody(
    config,
    5,
    first.nextState
  );
  assert(Number.isFinite(continued.nextState.lastSecondaryValue));
  assert(Array.isArray(continued.nextState.recentSecondaryValues));
});

process.stdout.write("Note Flow full-density second voice tests passed.\n");

