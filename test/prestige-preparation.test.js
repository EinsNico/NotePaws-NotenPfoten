const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const root = path.resolve(__dirname, "../src") + path.sep;
const original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(root)) return original(mod, filename);
  return mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { preparePrestigeArchivePreview } = require("../src/model/PrestigePreparation");
Module._extensions[".js"] = original;

function fixture(notes, bars, onPage = () => {}, isImported = () => false) {
  let largestPage = 0;
  const page = (scope, after, size, kind) => {
    const offset = (after === null ? 0 : after + 1) * 250;
    const length = Math.min(250, Math.max(0, size - offset));
    largestPage = Math.max(largestPage, length);
    onPage(scope, offset);
    return {
      records: Array.from({ length }, (_, index) => {
        const number = offset + index;
        const completedAt = Date.UTC(2026, 8, 30) + number * 1000;
        return kind === "attempt"
          ? { id: `note-${number}`, completedAt,
            correctFirstTry: number % 2 === 0, responseTimeMs: 500,
            ...(isImported(scope, number) ? { prestigeEligible: false } : {}) }
          : { id: `bar-${number}`, completedAt: new Date(completedAt).toISOString(),
            durationMs: 2000, score: { correct: 2, wrong: 1, missed: 0 },
            ...(isImported(scope, number) ? { prestigeEligible: false } : {}) };
      }),
      nextBlockNumber: length ? Math.floor(offset / 250) : null,
      done: offset + length >= size
    };
  };
  return {
    database: {
      async readStoredEntryCounts() { return {
        singleNotesScreen: notes, singleNotesMidi: 0, melodyRounds: 0,
        chordRounds: 0, rhythmBars: bars
      }; },
      async readAttemptHistoryPage(scope, after, limit) {
        assert.ok(limit === 1 || limit === 4);
        return page(scope, after, scope === "screen:single-notes" ? notes : 0, "attempt");
      },
      async readNoteFlowRoundsPage(scope, after, limit) {
        assert.ok(limit === 1 || limit === 4);
        return page(scope, after, scope === "rhythm:taktgefuehl" ? bars : 0, "round");
      }
    },
    largestPage: () => largestPage
  };
}

(async () => {
  const input = fixture(300000, 50000);
  let lastProgress = 0;
  const preview = await preparePrestigeArchivePreview(input.database, {
    id: "preview-test", createdAt: "2026-09-30T12:00:00.000Z",
    onProgress(done, total) { lastProgress = done; assert.strictEqual(total, 300000); }
  });
  assert.strictEqual(preview.segment.levels, 3);
  assert.strictEqual(preview.selectedEntries, 300000);
  assert.strictEqual(preview.detailEntriesRemaining, 50000);
  assert.strictEqual(Object.values(preview.segment.entryCounts).reduce((a, b) => a + b), 300000);
  assert.strictEqual(preview.segment.metrics.singleNotesScreen.playedCount,
    preview.segment.entryCounts.singleNotesScreen);
  assert.strictEqual(preview.segment.metrics.rhythmBars.roundCount,
    preview.segment.entryCounts.rhythmBars);
  assert.strictEqual(lastProgress, 300000);
  assert.ok(input.largestPage() <= 250);

  const once = await preparePrestigeArchivePreview(fixture(100000, 0).database,
    { id: "one", levels: 1 });
  assert.strictEqual(once.segment.entryCounts.singleNotesScreen, 100000);
  assert.strictEqual(once.detailEntriesRemaining, 0);
  const withFreeRound = await preparePrestigeArchivePreview(
    fixture(100000, 0).database, {
      id: "free-round", freeRounds: [{ id: "free-1",
        completedAt: Date.UTC(2026, 8, 29), numAnswers: 3,
        numCorrect: 2, numWrong: 1 }]
    }
  );
  assert.strictEqual(withFreeRound.segment.entryCounts.freeRounds, 1);
  assert.strictEqual(withFreeRound.segment.metrics.freeRounds.playedCount, 3);
  assert.strictEqual(withFreeRound.segment.metrics.freeRounds.correctCount, 2);
  assert.strictEqual(withFreeRound.segment.entryCounts.singleNotesScreen, 99999);
  const withImportedNotes = await preparePrestigeArchivePreview(
    fixture(100100, 0, () => {}, (scope, number) => (
      scope === "screen:single-notes" && number < 100
    )).database,
    { id: "imported-notes" }
  );
  assert.strictEqual(withImportedNotes.segment.levels, 1);
  assert.strictEqual(withImportedNotes.segment.entryCounts.singleNotesScreen, 100000);
  assert.strictEqual(withImportedNotes.detailEntriesBefore, 100100);
  assert.strictEqual(withImportedNotes.detailEntriesRemaining, 100);
  assert.strictEqual(withImportedNotes.sourceCounts["screen:single-notes"], 100000);
  const withImportedFreeRound = await preparePrestigeArchivePreview(
    fixture(100000, 0).database,
    { id: "imported-free", freeRounds: [{ id: "imported",
      completedAt: Date.UTC(2026, 8, 29), prestigeEligible: false }] }
  );
  assert.strictEqual(withImportedFreeRound.segment.entryCounts.freeRounds, 0);
  assert.strictEqual(withImportedFreeRound.detailEntriesRemaining, 1);
  await assert.rejects(preparePrestigeArchivePreview(
    fixture(100000, 0, () => {}, (scope, number) => (
      scope === "screen:single-notes" && number === 0
    )).database
  ), /requires/);
  await assert.rejects(preparePrestigeArchivePreview(fixture(99999, 0).database), /requires/);
  let keepGoing = true;
  await assert.rejects(preparePrestigeArchivePreview(fixture(100000, 0).database, {
    shouldContinue: () => keepGoing,
    onProgress() { keepGoing = false; }
  }), error => error && error.name === "AbortError");
  process.stdout.write("Prestige preview tests passed (100k and 350k; bounded pages).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
