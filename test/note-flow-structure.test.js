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

const structure = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowStructure.js")
);

test("creates the agreed dynamic 16 by 2 default structure", () => {
  const cycle = structure.createNoteFlowCycleSkeleton();
  assert.strictEqual(cycle.structureVersion, 1);
  assert.strictEqual(cycle.config.difficulty, "easy");
  assert.strictEqual(cycle.config.positionsPerBlock, 16);
  assert.strictEqual(cycle.config.blocksPerCycle, 2);
  assert.strictEqual(cycle.positionCount, 32);
  assert.deepStrictEqual(cycle.blocks.map(block => block.role), [
    "question", "answer"
  ]);
  assert(cycle.blocks.every(block => block.positions.length === 16));
  assert(cycle.blocks.every(block => block.secondaryNoteBudget === 0));
});

test("divides every standard block into four structural phases", () => {
  const block = structure.createNoteFlowCycleSkeleton().blocks[0];
  assert.deepStrictEqual(
    block.positions.reduce((counts, position) => {
      counts[position.phaseRole] = (counts[position.phaseRole] || 0) + 1;
      return counts;
    }, {}),
    {
      statement: 4,
      restatement: 4,
      departure: 4,
      conclusion: 4
    }
  );
  assert.strictEqual(block.positions[0].structuralRole, "entry");
  assert.strictEqual(block.positions[4].structuralRole, "anchor");
  assert.strictEqual(block.positions[15].structuralRole, "cadence");
  assert(block.positions.every(position => position.primaryNote === null));
  assert(block.positions.every(position => position.secondaryNote === null));
  assert(block.positions.every(position => position.harmonicFunction === null));
});

test("supports other block sizes and multi-block development", () => {
  const cycle = structure.createNoteFlowCycleSkeleton({
    positionsPerBlock: 12,
    blocksPerCycle: 3
  });
  assert.strictEqual(cycle.positionCount, 36);
  assert.deepStrictEqual(cycle.blocks.map(block => block.role), [
    "question", "development", "answer"
  ]);
  assert.deepStrictEqual(
    cycle.blocks[1].positions.reduce((counts, position) => {
      counts[position.phaseRole] = (counts[position.phaseRole] || 0) + 1;
      return counts;
    }, {}),
    {
      statement: 3,
      restatement: 3,
      departure: 3,
      conclusion: 3
    }
  );
});

test("keeps second-hand density exact and bounded by the block", () => {
  const twoHands = structure.createNoteFlowCycleSkeleton({
    positionsPerBlock: 16,
    handMode: "two",
    secondaryNotesPerBlock: 8,
    clefs: ["treble"]
  });
  assert.deepStrictEqual(twoHands.config.clefs, ["bass", "treble"]);
  assert(twoHands.blocks.every(block => block.secondaryNoteBudget === 8));

  const clamped = structure.normalizeNoteFlowConfig({
    positionsPerBlock: 7,
    handMode: "two",
    secondaryNotesPerBlock: 99
  });
  assert.strictEqual(clamped.secondaryNotesPerBlock, 7);

  const singleHand = structure.normalizeNoteFlowConfig({
    handMode: "single",
    secondaryNotesPerBlock: 8,
    clefs: ["bass", "treble"]
  });
  assert.strictEqual(singleHand.secondaryNotesPerBlock, 0);
  assert.deepStrictEqual(singleHand.clefs, ["bass", "treble"]);
});

test("normalizes bass and treble ranges independently", () => {
  const source = {
    handMode: "two",
    ranges: {
      bass: { min: 57, max: 24 },
      treble: { min: 81, max: 48 }
    }
  };
  const config = structure.normalizeNoteFlowConfig(source);
  assert.deepStrictEqual(config.ranges, {
    bass: { min: 24, max: 57 },
    treble: { min: 48, max: 81 }
  });
  assert.deepStrictEqual(source.ranges.bass, { min: 57, max: 24 });
  assert.deepStrictEqual(source.ranges.treble, { min: 81, max: 48 });
});

test("represents circle and random tonality without choosing a key yet", () => {
  const circle = structure.createNoteFlowCycleSkeleton({
    tonalityMode: "circle",
    selectedKey: "E-flat-major",
    accidentals: "onlyFlat"
  });
  assert.deepStrictEqual(circle.tonalityPlan, {
    mode: "circle",
    requestedKey: "E-flat-major",
    resolvedKey: null,
    displayKeySignature: true
  });

  const random = structure.createNoteFlowCycleSkeleton({
    tonalityMode: "random",
    selectedKey: "G-major",
    accidentals: "sharpAndFlat"
  });
  assert.strictEqual(random.tonalityPlan.requestedKey, null);
  assert.strictEqual(random.tonalityPlan.resolvedKey, null);
  assert.strictEqual(random.tonalityPlan.displayKeySignature, false);
});

test("provides deterministic seeded randomness and cycle identities", () => {
  const first = structure.createSeededNoteFlowRandom("noten-pfoten");
  const second = structure.createSeededNoteFlowRandom("noten-pfoten");
  const other = structure.createSeededNoteFlowRandom("andere-faehrte");
  const firstValues = Array.from({ length: 12 }, () => first());
  const secondValues = Array.from({ length: 12 }, () => second());
  const otherValues = Array.from({ length: 12 }, () => other());
  assert.deepStrictEqual(firstValues, secondValues);
  assert.notDeepStrictEqual(firstValues, otherValues);
  assert(firstValues.every(value => value >= 0 && value < 1));

  const cycleA = structure.createNoteFlowCycleSkeleton({ seed: 12345 }, 4);
  const cycleB = structure.createNoteFlowCycleSkeleton({ seed: 12345 }, 4);
  const cycleC = structure.createNoteFlowCycleSkeleton({ seed: 12345 }, 5);
  assert.strictEqual(cycleA.id, cycleB.id);
  assert.strictEqual(cycleA.seed, cycleB.seed);
  assert.notStrictEqual(cycleA.id, cycleC.id);
  assert.notStrictEqual(cycleA.seed, cycleC.seed);
});

test("keeps every supported dynamic structure internally consistent", () => {
  for (let positionsPerBlock = 1; positionsPerBlock <= 64; positionsPerBlock += 1) {
    for (let blocksPerCycle = 1; blocksPerCycle <= 8; blocksPerCycle += 1) {
      const cycle = structure.createNoteFlowCycleSkeleton({
        positionsPerBlock,
        blocksPerCycle,
        handMode: "two",
        secondaryNotesPerBlock: positionsPerBlock
      }, blocksPerCycle);
      assert.strictEqual(
        cycle.positionCount,
        positionsPerBlock * blocksPerCycle
      );
      assert.strictEqual(cycle.blocks.length, blocksPerCycle);
      const flattened = cycle.blocks.reduce(
        (result, block) => result.concat(block.positions),
        []
      );
      assert.strictEqual(flattened.length, cycle.positionCount);
      assert.deepStrictEqual(
        flattened.map(position => position.globalIndex),
        Array.from({ length: cycle.positionCount }, (_, index) => index)
      );
      assert(cycle.blocks.every(
        block => block.secondaryNoteBudget === positionsPerBlock
      ));
    }
  }
});

process.stdout.write("Note Flow structure tests passed.\n");

