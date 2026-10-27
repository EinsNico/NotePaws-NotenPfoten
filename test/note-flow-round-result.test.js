const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpile(loadedModule, filename) {
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

const resultModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowRoundResult.js")
);

test("marks chord rounds without changing melody round results", () => {
  const melody = resultModel.createNoteFlowRoundResult({});
  const chord = resultModel.createNoteFlowRoundResult({
    exerciseType: "chord",
    progress: { correct: 3, wrong: 1, missed: 2, precise: 2, early: 1, totalAbsoluteTimingOffsetMs: 120 }
  });
  assert.strictEqual(melody.exerciseType, undefined);
  assert.strictEqual(chord.exerciseType, "chord");
  assert.deepStrictEqual(melody.settings.rhythm, {
    meter: "4/4",
    noteDensity: 65,
    allowedValues: { treble: ["quarter", "eighth"], bass: ["half", "quarter"] }
  });
  assert.strictEqual(chord.settings.rhythm, undefined);
  assert.strictEqual(chord.score.evaluatedInputs, 6);
  assert.strictEqual(chord.timing.averageAbsoluteOffsetMs, 40);
});

test("new rounds use regular training even with an older Learning Mode preview", () => {
  [undefined, "melody", "chord"].forEach(exerciseType => {
    const result = resultModel.createNoteFlowRoundResult({ trainingMode: "learning", exerciseType });
    assert.strictEqual(result.mode, "normal");
  });
});

test("creates a complete result from score, timing and settings", () => {
  const result = resultModel.createNoteFlowRoundResult({
    id: "round-result-1",
    timer: { elapsedMs: 65432 },
    progress: {
      correct: 8,
      correctFirstTry: 6,
      wrong: 2,
      missed: 1,
      precise: 8,
      early: 1,
      late: 1,
      totalAbsoluteTimingOffsetMs: 900
    },
    menuOptions: {
      bpm: 72,
      behavior: "wait",
      difficulty: "custom",
      handMode: "two",
      secondaryNotesPerBlock: 8,
      clef: ["bass", "treble"],
      inputMode: "midi",
      tonalityMode: "circle",
      selectedKey: "D-major",
      accidentals: "onlySharp",
      customMinValue: 24,
      customBassMaxValue: 48,
      customTrebleMinValue: 48,
      customMaxValue: 72,
      rhythmMeter: "6/8",
      rhythmValues: {
        treble: ["eighth", "sixteenth"],
        bass: ["dotted-quarter", "quarter"]
      }
    },
    trainingMode: "normal",
    completionReason: "time-limit",
    startedAt: "2026-09-22T10:00:00.000Z",
    completedAt: "2026-09-22T10:01:05.432Z"
  });

  assert.strictEqual(result.resultVersion, 1);
  assert.strictEqual(result.id, "round-result-1");
  assert.strictEqual(result.durationMs, 65432);
  assert.strictEqual(result.score.evaluatedInputs, 11);
  assert.strictEqual(result.score.accuracy, 73);
  assert.strictEqual(result.timing.averageAbsoluteOffsetMs, 90);
  assert.deepStrictEqual(result.settings.clefs, ["bass", "treble"]);
  assert.strictEqual(result.settings.inputMode, "midi");
  assert.deepStrictEqual(result.settings.range, {
    bassMin: 24,
    bassMax: 48,
    trebleMin: 48,
    trebleMax: 72
  });
  assert.deepStrictEqual(result.settings.rhythm, {
    meter: "6/8",
    noteDensity: 65,
    allowedValues: {
      treble: ["eighth", "sixteenth"],
      bass: ["quarter", "dotted-quarter"]
    }
  });
});

test("creates a safe empty manual result", () => {
  const result = resultModel.createNoteFlowRoundResult({
    timer: { elapsedMs: 0 },
    completionReason: "manual"
  });
  assert.strictEqual(result.score.accuracy, 0);
  assert.strictEqual(result.timing.averageAbsoluteOffsetMs, null);
  assert.strictEqual(result.completionReason, "manual");
  assert.strictEqual(result.settings.behavior, "continuous");
  assert(result.id.indexOf("note-flow-round|") === 0);
});

test("snapshots active custom controls independently for melody and chords", () => {
  const melodySettings = { jumpFrequency: 80, jumpSize: 10, repetition: 20, noteDensity: 81 };
  const chordSettings = { jumpFrequency: 70, jumpSize: 9, bassJumpFrequency: 45 };
  const melody = resultModel.createNoteFlowRoundResult({ menuOptions: { movement: "custom", algorithmSettings: melodySettings } });
  const chord = resultModel.createNoteFlowRoundResult({ exerciseType: "chord", menuOptions: { movement: "custom", algorithmSettings: chordSettings } });
  assert.deepStrictEqual(melody.settings.algorithmSettings, melodySettings);
  assert.deepStrictEqual(chord.settings.algorithmSettings, chordSettings);
  melodySettings.jumpFrequency = chordSettings.jumpFrequency = 0;
  assert.strictEqual(melody.settings.algorithmSettings.jumpFrequency, 80);
  assert.strictEqual(chord.settings.algorithmSettings.jumpFrequency, 70);
  for (const movement of ["calm", "mixed", "leaping"]) {
    assert.strictEqual(resultModel.createNoteFlowRoundResult({ menuOptions: { movement, algorithmSettings: melodySettings } }).settings.algorithmSettings, undefined);
  }
});

process.stdout.write("Note Flow round result tests passed.\n");
