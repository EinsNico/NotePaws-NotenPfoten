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

const melody = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowMelody.js")
);
const tonality = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowTonality.js")
);

const PROFILES = {
  calm: { id: "calm-primary", span: 9, interval: 7 },
  mixed: { id: "mixed-primary", span: 12, interval: 9 },
  leaping: { id: "leaping-primary", span: 24, interval: 12 }
};

function positions(cycle) {
  return cycle.blocks.reduce(
    (result, block) => result.concat(block.positions),
    []
  );
}

function getMovementStatistics(movement) {
  let previousState = null;
  let movementCount = 0;
  let stepCount = 0;
  let maximumInterval = 0;
  let maximumSpan = 0;
  let totalMotion = 0;
  let leapCount = 0;
  for (let cycleIndex = 0; cycleIndex < 120; cycleIndex += 1) {
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "two",
      difficulty: "hard",
      movement,
      tonalityMode: "random",
      accidentals: "sharpAndFlat",
      seed: "schwierigkeitsprofile"
    }, cycleIndex, previousState);
    const values = positions(cycle).map(position => position.primaryNote.value);
    values.forEach((value, index) => {
      if (index === 0) {
        return;
      }
      const interval = Math.abs(value - values[index - 1]);
      maximumInterval = Math.max(maximumInterval, interval);
      stepCount += interval <= 2 ? 1 : 0;
      totalMotion += interval;
      leapCount += interval > 4 ? 1 : 0;
      movementCount += 1;
    });
    cycle.blocks.forEach(block => {
      const blockValues = block.positions.map(position => position.primaryNote.value);
      maximumSpan = Math.max(
        maximumSpan,
        Math.max(...blockValues) - Math.min(...blockValues)
      );
    });
    previousState = cycle.nextState;
  }
  return {
    maximumInterval,
    maximumSpan,
    stepRatio: stepCount / movementCount,
    meanMotion: totalMotion / movementCount,
    leapRatio: leapCount / movementCount
  };
}

test("applies the three distinct primary melody profiles", () => {
  Object.keys(PROFILES).forEach(movement => {
    const cycle = melody.createNoteFlowPrimaryMelody({
      handMode: "two",
      difficulty: "hard",
      movement,
      seed: `profil-${movement}`
    });
    const profile = PROFILES[movement];
    assert.strictEqual(cycle.melodyPlan.profile, profile.id);
    assert.strictEqual(cycle.melodyPlan.maxSpanSemitones, profile.span);
    assert.strictEqual(cycle.melodyPlan.maxIntervalSemitones, profile.interval);
  });
});

test("keeps every profile inside its melodic limits", () => {
  const statistics = {};
  Object.keys(PROFILES).forEach(movement => {
    statistics[movement] = getMovementStatistics(movement);
    assert(
      statistics[movement].maximumInterval <= PROFILES[movement].interval
    );
    assert(statistics[movement].maximumSpan <= PROFILES[movement].span);
  });
  assert(statistics.calm.stepRatio > statistics.mixed.stepRatio);
  assert(statistics.mixed.stepRatio > statistics.leaping.stepRatio);
  assert(statistics.calm.stepRatio >= 0.75);
  // Mixed now intentionally includes thirds/fourths rather than requiring
  // most attacks to be adjacent scale steps. Keep Calm's gentle motion and
  // verify that both increasingly varied profiles change the actual pitches.
  assert(statistics.mixed.stepRatio >= 0.35);
  assert(statistics.mixed.stepRatio < 0.6);
  assert(statistics.mixed.meanMotion > statistics.calm.meanMotion + 0.5);
  assert(statistics.leaping.meanMotion > statistics.mixed.meanMotion + 1);
  assert(statistics.mixed.leapRatio > statistics.calm.leapRatio + 0.1);
  assert(statistics.leaping.leapRatio > statistics.mixed.leapRatio + 0.1);
  process.stdout.write("Primary profile movement: " + JSON.stringify(statistics) + "\n");
});

test("retains exact open and closed cadences in every written key", () => {
  Object.keys(PROFILES).forEach(movement => {
    tonality.NOTE_FLOW_TONALITIES.forEach((key, keyIndex) => {
      const cycle = melody.createNoteFlowPrimaryMelody({
        handMode: "two",
        difficulty: "hard",
        movement,
        tonalityMode: "circle",
        selectedKey: key.id,
        accidentals: key.fifths < 0
          ? "onlyFlat"
          : key.fifths > 0 ? "onlySharp" : "no",
        seed: 15000 + keyIndex
      });
      const questionEnd = cycle.blocks[0].positions[15].primaryNote;
      const answerEnd = cycle.blocks[1].positions[15].primaryNote;
      assert.strictEqual(questionEnd.scaleDegree, 5);
      assert.strictEqual(answerEnd.scaleDegree, 1);
    });
  });
});

test("selects note jumps independently of standard and custom note ranges", () => {
  Object.keys(PROFILES).forEach(movement => {
  ["easy", "normal", "hard", "custom"].forEach(difficulty => {
  const cycle = melody.createNoteFlowPrimaryMelody({
    handMode: "two",
    difficulty,
    movement,
    ranges: {
      bass: { min: 24, max: 43 },
      treble: { min: 50, max: 72 }
    },
    seed: "eigener-bereich"
  });
  assert.strictEqual(cycle.melodyPlan.profile, PROFILES[movement].id);
  assert.strictEqual(cycle.melodyPlan.maxIntervalSemitones, PROFILES[movement].interval);
  if (difficulty === "custom") positions(cycle).forEach(position => {
    assert(position.primaryNote.value >= 50);
    assert(position.primaryNote.value <= 72);
  });
  });
  });
});

process.stdout.write("Note Flow difficulty profile tests passed.\n");
