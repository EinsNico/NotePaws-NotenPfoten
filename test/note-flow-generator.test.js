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

const generator = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowGenerator.js")
);

function timelineNotes(cycle) {
  return cycle.timeline.events.reduce(
    (result, event) => result.concat(event.notes),
    []
  );
}

test("creates one complete deterministic single-hand play cycle", () => {
  const config = {
    handMode: "single",
    clefs: ["treble"],
    difficulty: "normal",
    tonalityMode: "circle",
    selectedKey: "E-flat-major",
    accidentals: "onlyFlat",
    seed: "zentraler-generator"
  };
  const first = generator.generateNoteFlowCycle(config, 3);
  const second = generator.generateNoteFlowCycle(config, 3);

  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.generatorVersion, 1);
  assert.strictEqual(first.tonalityPlan.key.id, "E-flat-major");
  assert.strictEqual(first.timeline.eventCount, 32);
  assert.strictEqual(first.timeline.noteCount, 32);
  assert.strictEqual(first.timeline.simultaneousEventCount, 0);
  assert(first.timeline.events.every(event => event.notes.length === 1));
  assert(first.timeline.events.every(event => event.notes[0].voice === "primary"));
});

test("turns the configured two-hand density into simultaneous events", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two",
    secondaryNotesPerBlock: 4,
    difficulty: "hard",
    tonalityMode: "circle",
    selectedKey: "F-sharp-major",
    accidentals: "onlySharp",
    seed: 9125
  });

  assert.strictEqual(cycle.timeline.eventCount, 32);
  assert.strictEqual(cycle.timeline.simultaneousEventCount, 8);
  assert.strictEqual(cycle.timeline.noteCount, 40);
  assert.strictEqual(
    cycle.timeline.events.filter(event => event.requiresSimultaneousInput).length,
    8
  );
  assert.strictEqual(
    timelineNotes(cycle).filter(note => note.voice === "secondary").length,
    8
  );
});

test("keeps event order, identifiers and expected pitches unambiguous", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two",
    positionsPerBlock: 8,
    blocksPerCycle: 3,
    secondaryNotesPerBlock: 2,
    seed: "zeitachse"
  });
  assert.strictEqual(cycle.timeline.eventCount, 24);
  assert.deepStrictEqual(
    cycle.timeline.events.map(event => event.index),
    Array.from({ length: 24 }, (_, index) => index)
  );
  assert.strictEqual(
    new Set(cycle.timeline.events.map(event => event.id)).size,
    24
  );
  cycle.timeline.events.forEach(event => {
    assert.deepStrictEqual(
      event.expectedValues,
      event.notes.map(note => note.value)
    );
  });
});

test("supports every note range independently of movement through the generator entry point", () => {
  const expectedProfiles = {
    easy: "mixed-primary",
    normal: "mixed-primary",
    hard: "mixed-primary",
    custom: "mixed-primary"
  };
  Object.keys(expectedProfiles).forEach(difficulty => {
    const cycle = generator.generateNoteFlowCycle({
      difficulty,
      seed: `profil-${difficulty}`
    });
    assert.strictEqual(cycle.melodyPlan.profile, expectedProfiles[difficulty]);
    assert.strictEqual(cycle.timeline.eventCount, cycle.positionCount);
  });
});

test("continues melody, accompaniment and random tonality across cycles", () => {
  const config = {
    handMode: "two",
    secondaryNotesPerBlock: 8,
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "endloser-notenfluss"
  };
  const first = generator.generateNoteFlowCycle(config, 0);
  const next = generator.generateNoteFlowCycle(config, 1, first.nextState);

  assert.strictEqual(next.index, 1);
  assert.strictEqual(next.melodyPlan.continuedFromPreviousCycle, true);
  assert.notStrictEqual(next.tonalityPlan.key.id, first.tonalityPlan.key.id);
  assert(Number.isFinite(next.nextState.lastPrimaryValue));
  assert(Number.isFinite(next.nextState.lastSecondaryValue));
});

test("carries custom controls through the two-hand generator without crossing hands", () => {
  const algorithmSettings = { jumpFrequency: 100, jumpSize: 12, repetition: 0, noteDensity: 80 };
  const config = {
    movement: "custom", algorithmSettings, handMode: "two", secondaryNotesPerBlock: 8,
    difficulty: "custom", ranges: { bass: { min: 24, max: 43 }, treble: { min: 50, max: 72 } },
    tonalityMode: "circle", selectedKey: "G-major", accidentals: "onlySharp", seed: "custom-both-hands"
  };
  const cycle = generator.generateNoteFlowCycle(config);
  assert.deepStrictEqual(cycle.config.algorithmSettings, algorithmSettings);
  assert.strictEqual(cycle.melodyPlan.profile, "custom-primary");
  assert.strictEqual(cycle.timeline.simultaneousEventCount, 16);
  cycle.timeline.events.forEach(event => {
    const primary = event.notes.find(note => note.voice === "primary");
    const secondary = event.notes.find(note => note.voice === "secondary");
    assert(primary.value >= 50 && primary.value <= 72);
    if (secondary) {
      assert(secondary.value >= 24 && secondary.value <= 43);
      assert(secondary.value < primary.value);
    }
  });
  config.algorithmSettings.jumpSize = 2;
  assert.strictEqual(cycle.config.algorithmSettings.jumpSize, 12);
});

process.stdout.write("Note Flow central generator tests passed.\n");
