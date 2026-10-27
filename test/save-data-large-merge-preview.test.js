const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
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
const { previewStagedIndexedDbMerge } = require(
  "../src/model/SaveDataLargeMergePreview.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
Module._extensions[".js"] = originalLoader;

const roundsSection = "data.noteFlowRounds.screen";
const notesSection = "data.adaptiveHistory.evaluations";
const currentRounds = [
  { id: "same", score: { correct: 2, wrong: 0 } },
  { id: "changed", score: { correct: 1, wrong: 1 } },
  { id: "old-only", score: { correct: 3, wrong: 0 } }
];
const importedRounds = [
  { id: "same", score: { wrong: 0, correct: 2 } },
  { id: "changed", score: { correct: 2, wrong: 0 } },
  { id: "new-only", score: { correct: 3, wrong: 0 } }
];
const evaluation = {
  id: "note-same", completedAt: 1789550000000,
  exercise: { clef: "bass", staff: "piano", value: 48 },
  correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700
};
const normalized = normalizeAdaptiveEvaluation(evaluation);
const attempt = {
  id: normalized.id, noteKey: normalized.noteKey,
  staff: normalized.exercise.staff,
  completedAt: normalized.completedAt,
  correctFirstTry: normalized.correctFirstTry,
  mistakeCount: normalized.mistakeCount,
  responseTimeMs: normalized.responseTimeMs
};
const imported = new Map([
  ...importedRounds.map((record, index) => [
    `${roundsSection}:${record.id}`,
    { section: roundsSection, index, record }
  ]),
  [`${notesSection}:${evaluation.id}`, {
    section: notesSection, index: 0, record: evaluation
  }]
]);
const counts = { [roundsSection]: 3, [notesSection]: 2 };
let maxLookup = 0;
const staging = {
  async readMetadata() { return { key: "ready", counts }; },
  async findRecordsByIdentities(section, ids) {
    maxLookup = Math.max(maxLookup, ids.length);
    return ids.map(id => imported.get(`${section}:${id}`) || null);
  }
};
const active = {
  async readNoteFlowRoundsPage(scope, after, limit) {
    assert.strictEqual(limit, 1);
    if (scope !== "screen:note-flow") {
      return { records: [], nextBlockNumber: null, done: true };
    }
    if (after === null) {
      return { records: currentRounds.slice(0, 2),
        nextBlockNumber: 0, done: false };
    }
    return { records: currentRounds.slice(2), nextBlockNumber: 1, done: true };
  },
  async readAttemptHistoryPage(scope, after, limit) {
    assert.strictEqual(limit, 1);
    return scope === "screen:single-notes"
      ? { records: [attempt], nextBlockNumber: 0, done: true }
      : { records: [], nextBlockNumber: null, done: true };
  }
};

(async () => {
  const preview = await previewStagedIndexedDbMerge(staging, active);
  assert.deepStrictEqual(preview.sections[roundsSection], {
    current: 3, imported: 3, new: 1, duplicates: 1, conflicts: 1
  });
  assert.deepStrictEqual(preview.sections[notesSection], {
    current: 1, imported: 2, new: 1, duplicates: 1, conflicts: 0
  });
  assert.deepStrictEqual(preview.total, {
    current: 4, imported: 5, new: 2, duplicates: 2, conflicts: 1
  });
  // A previous import adds technical provenance, but the original backup
  // still describes the same round and must remain an exact duplicate.
  currentRounds[0].prestigeEligible = false;
  const reimportPreview = await previewStagedIndexedDbMerge(staging, active);
  assert.deepStrictEqual(reimportPreview.sections[roundsSection],
    preview.sections[roundsSection]);
  assert.strictEqual(currentRounds[0].prestigeEligible, false);
  assert.strictEqual(importedRounds[0].prestigeEligible, undefined);
  delete currentRounds[0].prestigeEligible;
  assert.strictEqual(maxLookup, 2);
  await assert.rejects(previewStagedIndexedDbMerge(
    { ...staging, async readMetadata() { return { key: "ready", counts: {
      [roundsSection]: -1
    } }; } }, active
  ), /invalid/);
  await assert.rejects(previewStagedIndexedDbMerge(staging, {
    ...active,
    async readNoteFlowRoundsPage() {
      return { records: [], nextBlockNumber: null, done: false };
    }
  }), /invalid/);
  let pages = 0;
  let largestBatch = 0;
  const largeActive = {
    ...active,
    async readAttemptHistoryPage(scope, after, limit) {
      if (scope !== "screen:single-notes") {
        return { records: [], nextBlockNumber: null, done: true };
      }
      assert.strictEqual(limit, 1);
      const number = after === null ? 0 : after + 1;
      pages += 1;
      return {
        records: Array.from({ length: 250 }, (_, index) => ({
          id: `old-${number * 250 + index}`
        })),
        nextBlockNumber: number,
        done: number === 399
      };
    }
  };
  const largePreview = await previewStagedIndexedDbMerge({
    ...staging,
    async findRecordsByIdentities(section, ids) {
      largestBatch = Math.max(largestBatch, ids.length);
      return ids.map(() => null);
    }
  }, largeActive);
  assert.strictEqual(largePreview.sections[notesSection].current, 100000);
  assert.strictEqual(largePreview.sections[notesSection].new, 2);
  assert.strictEqual(pages, 400);
  assert.strictEqual(largestBatch, 250);
  // Both directions of Nico's phone test. Generate only the current page,
  // never a complete 500,000-record array; imported identities are disjoint.
  async function checkScale(currentNotes, currentBars, importedNotes, importedBars) {
    let largestPage = 0;
    const page = (count, after, prefix) => {
      const number = after === null ? 0 : after + 1;
      const start = number * 250;
      const length = Math.min(250, Math.max(0, count - start));
      largestPage = Math.max(largestPage, length);
      return {
        records: Array.from({ length }, (_, index) => ({ id: `${prefix}-${start + index}` })),
        nextBlockNumber: length ? number : null,
        done: start + length >= count
      };
    };
    const result = await previewStagedIndexedDbMerge({
      async readMetadata() { return { key: "ready", counts: {
        [notesSection]: importedNotes, "data.rhythmSenseBars": importedBars
      } }; },
      async findRecordsByIdentities(section, ids) {
        assert.ok(ids.length <= 250);
        return ids.map(() => null);
      }
    }, {
      async readAttemptHistoryPage(scope, after, limit) {
        assert.strictEqual(limit, 1);
        return page(scope === "screen:single-notes" ? currentNotes : 0, after, "note");
      },
      async readNoteFlowRoundsPage(scope, after, limit) {
        assert.strictEqual(limit, 1);
        return page(scope === "rhythm:taktgefuehl" ? currentBars : 0, after, "bar");
      }
    });
    assert.strictEqual(result.total.current, currentNotes + currentBars);
    assert.strictEqual(result.total.imported, importedNotes + importedBars);
    assert.strictEqual(result.total.new, importedNotes + importedBars);
    assert.strictEqual(result.total.conflicts, 0);
    assert.strictEqual(result.total.duplicates, 0);
    assert.ok(largestPage <= 250);
  }
  await checkScale(4000, 0, 300000, 200000);
  await checkScale(300000, 200000, 100, 30);
  let checks = 0;
  await assert.rejects(previewStagedIndexedDbMerge(staging, active, () => {
    checks += 1;
    return checks < 2;
  }), error => error && error.name === "AbortError");
  process.stdout.write("Large merge preview tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
