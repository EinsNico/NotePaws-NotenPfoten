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

const harmony = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowHarmony.js")
);

function allPositions(cycle) {
  return cycle.blocks.reduce(
    (result, block) => result.concat(block.positions),
    []
  );
}

test("creates a harmonic question and answer across 32 positions", () => {
  const cycle = harmony.createNoteFlowHarmonicPlan({
    tonalityMode: "circle",
    selectedKey: "C-major",
    accidentals: "no",
    seed: 1024
  });
  assert.strictEqual(cycle.positionCount, 32);
  assert.strictEqual(cycle.blocks[0].role, "question");
  assert.strictEqual(cycle.blocks[0].cadenceType, "open");
  assert.strictEqual(cycle.blocks[1].role, "answer");
  assert.strictEqual(cycle.blocks[1].cadenceType, "closed");
  assert.strictEqual(cycle.blocks[0].positions[0].harmony.scaleDegree, 1);
  assert.strictEqual(cycle.blocks[0].positions[15].harmony.scaleDegree, 5);
  assert.strictEqual(cycle.blocks[1].positions[15].harmony.scaleDegree, 1);
  assert.strictEqual(
    cycle.blocks[0].positions[15].harmony.cadenceRole,
    "open-dominant"
  );
  assert.strictEqual(
    cycle.blocks[1].positions[15].harmony.cadenceRole,
    "tonic-resolution"
  );
});

test("builds diatonic chord tones for major and natural minor", () => {
  const cMajor = harmony.createNoteFlowHarmonicPlan({
    tonalityMode: "circle",
    selectedKey: "C-major",
    accidentals: "no"
  });
  const cTonic = cMajor.blocks[0].positions[0].harmony;
  const cDominant = cMajor.blocks[0].positions[15].harmony;
  assert.deepStrictEqual(cTonic.pitchClasses, [0, 4, 7]);
  assert.strictEqual(cTonic.romanNumeral, "I");
  assert.deepStrictEqual(cDominant.pitchClasses, [7, 11, 2]);
  assert.strictEqual(cDominant.romanNumeral, "V");

  const aMinor = harmony.createNoteFlowHarmonicPlan({
    tonalityMode: "circle",
    selectedKey: "A-minor",
    accidentals: "no"
  });
  const aTonic = aMinor.blocks[0].positions[0].harmony;
  const aDominant = aMinor.blocks[0].positions[15].harmony;
  assert.deepStrictEqual(aTonic.pitchClasses, [9, 0, 4]);
  assert.strictEqual(aTonic.romanNumeral, "i");
  assert.deepStrictEqual(aDominant.pitchClasses, [4, 7, 11]);
  assert.strictEqual(aDominant.romanNumeral, "v");
});

test("marks tension and accompaniment support separately", () => {
  const cycle = harmony.createNoteFlowHarmonicPlan({
    tonalityMode: "circle",
    selectedKey: "D-major",
    accidentals: "onlySharp",
    seed: 77
  });
  const questionEnd = cycle.blocks[0].positions[15].harmony;
  const answerEnd = cycle.blocks[1].positions[15].harmony;
  assert(questionEnd.tension > 0.8);
  assert(questionEnd.supportPriority >= 0.95);
  assert.strictEqual(answerEnd.tension, 0);
  assert.strictEqual(answerEnd.supportPriority, 1);
  assert.strictEqual(answerEnd.harmonicFunction, "tonic");
});

test("keeps the harmonic plan deterministic without filling notes", () => {
  const config = {
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "harmonie-faehrte",
    handMode: "two",
    secondaryNotesPerBlock: 8
  };
  const first = harmony.createNoteFlowHarmonicPlan(config, 5);
  const second = harmony.createNoteFlowHarmonicPlan(config, 5);
  assert.deepStrictEqual(first, second);
  assert(allPositions(first).every(position => position.primaryNote === null));
  assert(allPositions(first).every(position => position.secondaryNote === null));
  assert(allPositions(first).every(position => position.harmony));
});

test("supports tiny blocks without losing their cadence goal", () => {
  const onePosition = harmony.createNoteFlowHarmonicPlan({
    positionsPerBlock: 1,
    blocksPerCycle: 2,
    tonalityMode: "circle",
    selectedKey: "C-major"
  });
  assert.strictEqual(onePosition.blocks[0].positions[0].harmony.scaleDegree, 5);
  assert.strictEqual(onePosition.blocks[1].positions[0].harmony.scaleDegree, 1);

  const twoPositions = harmony.createNoteFlowHarmonicPlan({
    positionsPerBlock: 2,
    blocksPerCycle: 2,
    tonalityMode: "circle",
    selectedKey: "C-major"
  });
  assert.deepStrictEqual(
    twoPositions.blocks[0].positions.map(position => position.harmony.scaleDegree),
    [1, 5]
  );
  assert.deepStrictEqual(
    twoPositions.blocks[1].positions.map(position => position.harmony.scaleDegree),
    [5, 1]
  );
});

test("keeps all dynamic harmonies inside the resolved tonality", () => {
  for (let positionsPerBlock = 1; positionsPerBlock <= 64; positionsPerBlock += 1) {
    for (let blocksPerCycle = 1; blocksPerCycle <= 8; blocksPerCycle += 1) {
      const cycle = harmony.createNoteFlowHarmonicPlan({
        positionsPerBlock,
        blocksPerCycle,
        tonalityMode: "random",
        accidentals: "sharpAndFlat",
        seed: 5000 + positionsPerBlock
      }, blocksPerCycle);
      const allowedPitchClasses = new Set(
        cycle.tonalityPlan.key.scalePitchClasses
      );
      allPositions(cycle).forEach(position => {
        assert(position.harmony);
        assert(position.harmony.scaleDegree >= 1);
        assert(position.harmony.scaleDegree <= 7);
        assert(position.harmony.pitchClasses.every(
          pitchClass => allowedPitchClasses.has(pitchClass)
        ));
        assert(position.harmony.tension >= 0);
        assert(position.harmony.tension <= 1);
        assert(position.harmony.supportPriority >= 0);
        assert(position.harmony.supportPriority <= 1);
      });
      const lastBlock = cycle.blocks[cycle.blocks.length - 1];
      assert.strictEqual(
        lastBlock.positions[lastBlock.positions.length - 1].harmony.scaleDegree,
        1
      );
    }
  }
});

test("varies templates over cycles while preserving cadence rules", () => {
  const templatePairs = new Set();
  for (let cycleIndex = 0; cycleIndex < 30; cycleIndex += 1) {
    const cycle = harmony.createNoteFlowHarmonicPlan({
      seed: "template-variation",
      tonalityMode: "random",
      accidentals: "sharpAndFlat"
    }, cycleIndex);
    templatePairs.add(cycle.blocks.map(block => block.harmonicTemplateId).join("/"));
    assert.strictEqual(cycle.blocks[0].positions[15].harmony.scaleDegree, 5);
    assert.strictEqual(cycle.blocks[1].positions[15].harmony.scaleDegree, 1);
  }
  assert(templatePairs.size > 3);
});

process.stdout.write("Note Flow harmony tests passed.\n");

