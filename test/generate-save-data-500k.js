// Disposable 500,000-record backup. Writes incrementally instead of holding
// hundreds of thousands of records (and their JSON copy) in memory.
const fs = require("fs");
const Module = require("module");
const path = require("path");
const { once } = require("events");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function loadProjectModule(mod, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(mod, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return mod._compile(transformed.code, filename);
};
const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
Module._extensions[".js"] = originalLoader;

const NOTE_COUNT = 300000;
const BAR_COUNT = 200000;
const baseTime = Date.parse("2026-09-15T08:00:00.000Z");
const storage = { length: 0, key: () => null, getItem: () => null };
const backup = createSaveDataBackup(storage, {
  createdAt: "2026-09-28T12:00:00.000Z"
});
backup.version = 4;
backup.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
backup.data.adaptiveHistory = {
  version: 1, baselines: [], evaluations: "__NOTES__"
};
backup.data.rhythmSenseBars = "__BARS__";

function note(index) {
  const correct = index % 7 !== 0;
  return {
    id: `stress-500k-note-${index}`,
    completedAt: baseTime + index * 2000,
    exercise: {
      clef: index % 2 === 0 ? "treble" : "bass",
      staff: "piano", value: 48 + index % 37, isSharp: true
    },
    correctFirstTry: correct,
    mistakeCount: correct ? 0 : 1,
    responseTimeMs: correct ? 350 + index % 950 : null
  };
}

function bar(index) {
  const result = index % 11 === 0 ? "missed"
    : index % 7 === 0 ? "late"
      : index % 5 === 0 ? "early" : "correct";
  const offsetMs = result === "missed" ? null
    : result === "early" ? -135
      : result === "late" ? 145 : 25;
  return {
    id: `stress-500k-rhythm-${index}`,
    sessionId: `stress-500k-session-${Math.floor(index / 10)}`,
    barNumber: index % 10 + 1,
    completedAt: new Date(baseTime + index * 10000).toISOString(),
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
  };
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("Pass an output path for the disposable backup.");
  const shell = JSON.stringify(backup);
  const noteMarker = '"__NOTES__"';
  const barMarker = '"__BARS__"';
  const notesAt = shell.indexOf(noteMarker);
  const barsAt = shell.indexOf(barMarker);
  if (notesAt < 0 || barsAt <= notesAt) throw new Error("Backup template changed.");
  const output = fs.createWriteStream(outputPath, { flags: "wx" });
  async function write(text) {
    if (!output.write(text)) await once(output, "drain");
  }
  await write(shell.slice(0, notesAt));
  await write("[");
  for (let index = 0; index < NOTE_COUNT; index += 1) {
    await write(`${index ? "," : ""}${JSON.stringify(note(index))}`);
  }
  await write("]");
  await write(shell.slice(notesAt + noteMarker.length, barsAt));
  await write("[");
  for (let index = 0; index < BAR_COUNT; index += 1) {
    await write(`${index ? "," : ""}${JSON.stringify(bar(index))}`);
  }
  await write("]");
  await write(shell.slice(barsAt + barMarker.length));
  output.end();
  await once(output, "finish");
  process.stdout.write(`${outputPath}\n${NOTE_COUNT} Einzelnoten, ${BAR_COUNT} Takte, ${fs.statSync(outputPath).size} Bytes\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
