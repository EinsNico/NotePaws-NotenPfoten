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
const { copyPrestigeRemainingToShadow, retainPrestigeFreeRounds } =
  require("../src/model/PrestigeShadowCopy");
Module._extensions[".js"] = original;

const start = Date.UTC(2026, 8, 30);
const counts = { singleNotesScreen: 100250, singleNotesMidi: 0,
  melodyRounds: 0, chordRounds: 0, rhythmBars: 0 };
const page = (scope, after, imported = false) => {
  const offset = (after === null ? 0 : after + 1) * 250;
  const size = scope === "screen:single-notes" ? counts.singleNotesScreen : 0;
  const length = Math.min(250, Math.max(0, size - offset));
  return {
    records: Array.from({ length }, (_, index) => ({
      id: `note-${offset + index}`, scope,
      sessionId: "session", noteKey: "treble:C4", staff: "treble",
      completedAt: start + (offset + index) * 1000,
      correctFirstTry: true, mistakeCount: 0, responseTimeMs: 500,
      ...(imported && offset + index < 100 ? { prestigeEligible: false } : {})
    })),
    nextBlockNumber: length ? Math.floor(offset / 250) : null,
    done: offset + length >= size
  };
};
const active = {
  async readStoredEntryCounts() { return { ...counts }; },
  async readAttemptHistoryPage(scope, after) { return page(scope, after); },
  async readNoteFlowRoundsPage() {
    return { records: [], nextBlockNumber: null, done: true };
  }
};

(async () => {
  const preview = await preparePrestigeArchivePreview(active,
    { id: "shadow-test" });
  assert.strictEqual(preview.sourceCounts["screen:single-notes"], 100000);
  assert.strictEqual(preview.detailEntriesRemaining, 250);
  const written = [];
  const shadow = { name: "noten-pfoten-learning-import-test", database: {
    async readStoredEntryCounts() {
      return { ...counts, singleNotesScreen: written.length };
    },
    async appendImportedAttemptBatch(scope, batch, offset) {
      assert.strictEqual(scope, "screen:single-notes");
      assert.ok(batch.length <= 250);
      assert.strictEqual(offset, written.length);
      written.push(...batch);
    },
    async appendImportedNoteFlowBatch() {
      throw new Error("No round batch expected.");
    }
  } };
  const result = await copyPrestigeRemainingToShadow(preview, active, shadow);
  assert.strictEqual(written.length, 250);
  assert.strictEqual(written[0].id, "note-100000");
  assert.strictEqual(written[249].id, "note-100249");
  assert.strictEqual(result.skipped["screen:single-notes"], 100000);
  assert.strictEqual(result.kept["screen:single-notes"], 250);
  assert.strictEqual(result.localFreeRoundsToKeep, 0);
  assert.deepStrictEqual(retainPrestigeFreeRounds([
    { id: "imported-a", prestigeEligible: false }, { id: "earned-a" },
    { id: "imported-b", prestigeEligible: false }, { id: "earned-b" }
  ], 1).map(round => round.id), ["imported-a", "imported-b", "earned-b"]);
  assert.throws(() => retainPrestigeFreeRounds([{ id: "imported",
    prestigeEligible: false }], 1), /exceeds eligible/);
  const mixedActive = { ...active,
    async readAttemptHistoryPage(scope, after) { return page(scope, after, true); }
  };
  const mixedPreview = await preparePrestigeArchivePreview(mixedActive,
    { id: "shadow-mixed-test" });
  const mixedWritten = [];
  const mixedShadow = { name: "noten-pfoten-learning-import-mixed", database: {
    ...shadow.database,
    async readStoredEntryCounts() {
      return { ...counts, singleNotesScreen: mixedWritten.length };
    },
    async appendImportedAttemptBatch(scope, batch, offset) {
      assert.strictEqual(scope, "screen:single-notes");
      assert.strictEqual(offset, mixedWritten.length);
      mixedWritten.push(...batch);
    }
  } };
  const mixedResult = await copyPrestigeRemainingToShadow(
    mixedPreview, mixedActive, mixedShadow);
  assert.strictEqual(mixedWritten.length, 250);
  assert.deepStrictEqual(mixedWritten.slice(0, 100).map(record => record.id),
    Array.from({ length: 100 }, (_, index) => `note-${index}`));
  assert.strictEqual(mixedWritten[100].id, "note-100100");
  assert.strictEqual(mixedWritten[249].id, "note-100249");
  assert.strictEqual(mixedResult.skipped["screen:single-notes"], 100000);
  const changed = { ...active,
    async readStoredEntryCounts() { return { ...counts, singleNotesScreen: 100251 }; } };
  await assert.rejects(copyPrestigeRemainingToShadow(preview, changed, shadow), /changed/);
  const malformed = { ...preview,
    sourceCounts: { ...preview.sourceCounts, "screen:single-notes": 99999 } };
  await assert.rejects(copyPrestigeRemainingToShadow(malformed, active, shadow), /counts differ/);
  const shortSource = { ...active,
    async readAttemptHistoryPage(scope, after) {
      if (scope === "screen:single-notes" && after === 399) {
        return { records: [], nextBlockNumber: null, done: true };
      }
      return page(scope, after);
    }
  };
  await assert.rejects(copyPrestigeRemainingToShadow(preview, shortSource, shadow),
    /source scan differs/);
  const badShadow = { ...shadow, database: { ...shadow.database,
    async appendImportedAttemptBatch() {},
    async readStoredEntryCounts() {
      return { ...counts, singleNotesScreen: 249 };
    }
  } };
  await assert.rejects(copyPrestigeRemainingToShadow(preview, active, badShadow),
    /inactive database count differs/);
  process.stdout.write("Prestige shadow copy tests passed (100k skipped; 250 retained).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
