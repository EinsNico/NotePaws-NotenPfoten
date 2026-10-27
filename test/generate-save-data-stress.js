// Generates a disposable, importable load-test backup. Never uses real app data.
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};

const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const { parseSaveDataFile, MAX_SAVE_DATA_FILE_SIZE_BYTES } = require("../src/model/SaveDataFiles.js");

function testCount(value, fallback) {
  if (value === undefined) return fallback;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 500000) {
    throw new Error("Test counts must be whole numbers between 0 and 500000.");
  }
  return count;
}

const SINGLE_NOTES_COUNT = testCount(process.argv[3], 100000);
const RHYTHM_BARS_COUNT = testCount(process.argv[4], 80000);
// Keep synthetic answers after the existing September test history: the
// append-only merge must not replay older answers over a user's newer notes.
const baseTime = Date.parse("2026-10-01T08:00:00.000Z");
const emptyStorage = { length: 0, key: () => null, getItem: () => null };
const backup = createSaveDataBackup(emptyStorage, {
  createdAt: "2026-09-28T12:00:00.000Z"
});
backup.version = 4;
backup.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };

const evaluations = [];
for (let index = 0; index < SINGLE_NOTES_COUNT; index += 1) {
  const correct = index % 7 !== 0;
  const clef = index % 2 === 0 ? "treble" : "bass";
  evaluations.push({
    id: `stress-20261001-note-${index}`,
    completedAt: baseTime + index * 2000,
    exercise: { clef, staff: "piano", value: 48 + index % 37, isSharp: true },
    correctFirstTry: correct,
    mistakeCount: correct ? 0 : 1,
    responseTimeMs: correct ? 350 + index % 950 : null
  });
}
backup.data.adaptiveHistory = { version: 1, baselines: [], evaluations };

const bars = [];
for (let index = 0; index < RHYTHM_BARS_COUNT; index += 1) {
  const sessionNumber = Math.floor(index / 10);
  const barNumber = index % 10 + 1;
  const result = index % 11 === 0 ? "missed"
    : index % 7 === 0 ? "late"
      : index % 5 === 0 ? "early" : "correct";
  const completedAt = new Date(baseTime + index * 10000).toISOString();
  const offsetMs = result === "missed" ? null
    : result === "early" ? -135
      : result === "late" ? 145 : 25;
  bars.push({
    id: `stress-20261001-rhythm-${index}`,
    sessionId: `stress-20261001-session-${sessionNumber}`,
    barNumber,
    completedAt,
    durationMs: 3000,
    settings: { meter: "4/4", bpm: 80, roundLength: 10 },
    score: {
      correct: result === "correct" ? 1 : 0,
      wrong: result === "early" || result === "late" ? 1 : 0,
      missed: result === "missed" ? 1 : 0,
      accuracy: result === "correct" ? 100 : 0
    },
    timing: {
      precise: result === "correct" ? 1 : 0,
      early: result === "early" ? 1 : 0,
      late: result === "late" ? 1 : 0,
      totalAbsoluteOffsetMs: offsetMs === null ? 0 : Math.abs(offsetMs)
    },
    notes: [{ beat: 0, value: "whole", result, offsetMs }]
  });
}
backup.data.rhythmSenseBars = bars;

const text = JSON.stringify(backup);
const size = Buffer.byteLength(text, "utf8");
if (size > MAX_SAVE_DATA_FILE_SIZE_BYTES) {
  throw new Error(`Synthetic backup exceeds the app's 50 MB import limit: ${size} bytes`);
}
const parsed = parseSaveDataFile(text, size);
if (!parsed.valid
  || parsed.backup.data.adaptiveHistory.evaluations.length !== SINGLE_NOTES_COUNT
  || parsed.backup.data.rhythmSenseBars.length !== RHYTHM_BARS_COUNT) {
  throw new Error(`Synthetic backup validation failed: ${parsed.errors.join(", ")}`);
}

const outputPath = process.argv[2] || path.resolve(
  __dirname, `Noten-Pfoten-Stresstest-${SINGLE_NOTES_COUNT}-${RHYTHM_BARS_COUNT}.json`
);
const descriptor = fs.openSync(outputPath, "wx");
try {
  fs.writeFileSync(descriptor, text, "utf8");
} finally {
  fs.closeSync(descriptor);
}
process.stdout.write(`${outputPath}\n${SINGLE_NOTES_COUNT} Einzelnoten, ${RHYTHM_BARS_COUNT} Takte, ${size} Bytes\n`);
