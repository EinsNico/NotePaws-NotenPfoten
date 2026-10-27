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
const { copyMergedRoundsToShadow } = require(
  "../src/model/SaveDataLargeMergeRoundWriter.js"
);
Module._extensions[".js"] = originalLoader;

const screen = "data.noteFlowRounds.screen";
const scopes = ["screen:note-flow", "midi:note-flow",
  "midi:note-flow-chords", "rhythm:taktgefuehl"];
const sections = [screen, "data.noteFlowRounds.midi",
  "data.noteFlowRounds.chordMidi", "data.rhythmSenseBars"];
function round(id, second) {
  return { id, completedAt: new Date(1780000000000 + second * 1000)
    .toISOString(), score: { correct: 1 } };
}
const indexed = { sections: Object.fromEntries(sections.map(section => [
  section, section === screen
    ? { current: 2, imported: 3, new: 2, duplicates: 1 }
    : { current: 0, imported: 0, new: 0, duplicates: 0 }
])) };

function fixture(currentEligibility) {
  const imported = [round("new-first", 1), round("same", 3),
    round("new-last", 4)];
  const current = [round("old", 2), round("same", 3)];
  if (typeof currentEligibility === "boolean") {
    current[1].prestigeEligible = currentEligibility;
  }
  const written = new Map(scopes.map(scope => [scope, []]));
  const staging = {
    async readBatch(section, start, limit) {
      assert.strictEqual(limit, 100);
      const all = section === screen ? imported : [];
      const records = all.slice(start, start + limit);
      const nextIndex = start + records.length;
      return { records, nextIndex, total: all.length,
        done: nextIndex === all.length };
    },
    async hasMergeMatches(section, ids) {
      return ids.map(id => id === "same");
    }
  };
  const active = {
    async readNoteFlowRoundsPage(scope, after, limit) {
      assert.strictEqual(limit, 1);
      const records = scope === "screen:note-flow" && after === null
        ? current : [];
      return { records, nextBlockNumber: records.length ? 0 : null,
        done: true };
    }
  };
  const database = {
    async appendImportedNoteFlowBatch(scope, batch, start) {
      assert.strictEqual(start, written.get(scope).length);
      assert(batch.length <= 100);
      written.get(scope).push(...batch.map(record => JSON.parse(
        JSON.stringify(record)
      )));
      return { total: written.get(scope).length };
    },
    async readNoteFlowRoundsPage(scope, after, limit) {
      assert.strictEqual(limit, 1);
      const records = after === null ? written.get(scope) : [];
      return { records, nextBlockNumber: records.length ? 0 : null,
        done: true };
    },
    async readNoteFlowStatistics(scope) {
      return { roundCount: written.get(scope).length };
    }
  };
  const shadow = { name: "noten-pfoten-learning-import-test", database };
  return { staging, active, shadow, written };
}

(async () => {
  const first = fixture();
  const result = await copyMergedRoundsToShadow(first.staging, first.active,
    first.shadow, indexed);
  assert.deepStrictEqual(first.written.get("screen:note-flow")
    .map(record => record.id), ["new-first", "old", "same", "new-last"]);
  assert.deepStrictEqual(first.written.get("screen:note-flow")
    .map(record => record.prestigeEligible), [false, undefined, undefined, false]);
  assert.deepStrictEqual(result["screen:note-flow"], {
    current: 2, added: 2, total: 4
  });
  assert.strictEqual(result["rhythm:taktgefuehl"].total, 0);

  for (const eligible of [false, true]) {
    const replay = fixture(eligible);
    await copyMergedRoundsToShadow(replay.staging, replay.active, replay.shadow, indexed);
    const copied = replay.written.get("screen:note-flow");
    assert.strictEqual(copied.filter(record => record.id === "same").length, 1);
    assert.strictEqual(copied.find(record => record.id === "same").prestigeEligible, eligible);
    assert.strictEqual(copied.find(record => record.id === "new-first").prestigeEligible, false);
  }

  const corrupt = fixture();
  const originalRead = corrupt.shadow.database.readNoteFlowRoundsPage;
  corrupt.shadow.database.readNoteFlowRoundsPage = async (...args) => {
    const page = await originalRead(...args);
    return args[0] === "screen:note-flow" && page.records.length
      ? { ...page, records: page.records.map((record, index) => index === 0
        ? { ...record, score: { correct: 0 } } : record) }
      : page;
  };
  await assert.rejects(copyMergedRoundsToShadow(corrupt.staging,
    corrupt.active, corrupt.shadow, indexed), /Stored merged rounds differ/);

  const unordered = fixture();
  const originalBatch = unordered.staging.readBatch;
  unordered.staging.readBatch = async (...args) => {
    const page = await originalBatch(...args);
    return args[0] === screen
      ? { ...page, records: page.records.slice().reverse() } : page;
  };
  await assert.rejects(copyMergedRoundsToShadow(unordered.staging,
    unordered.active, unordered.shadow, indexed), /not chronological/);

  const cancelled = fixture();
  await assert.rejects(copyMergedRoundsToShadow(cancelled.staging,
    cancelled.active, cancelled.shadow, indexed, () => false),
  error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.written.get("screen:note-flow").length, 0);

  const large = fixture();
  const total = 100000;
  large.staging.readBatch = async (section, start, limit) => {
    assert.strictEqual(limit, 100);
    const end = section === screen ? Math.min(total, start + limit) : 0;
    const records = Array.from({ length: Math.max(0, end - start) },
      (_, offset) => round(`r-${start + offset}`, start + offset));
    return { records, nextIndex: end, total: section === screen ? total : 0,
      done: end === (section === screen ? total : 0) };
  };
  large.staging.hasMergeMatches = async (section, ids) => ids.map(() => false);
  large.active.readNoteFlowRoundsPage = async () => ({ records: [],
    nextBlockNumber: null, done: true });
  let largestBatch = 0;
  let totalWritten = 0;
  // A readback fixture that regenerates the written records page-by-page,
  // without retaining 100,000 rounds in the test process.
  large.shadow.database.appendImportedNoteFlowBatch = async (
    scope, batch, start
  ) => {
    assert.strictEqual(start, totalWritten);
    largestBatch = Math.max(largestBatch, batch.length);
    totalWritten += batch.length;
    return { total: totalWritten };
  };
  large.shadow.database.readNoteFlowRoundsPage = async (scope, after) => {
    if (scope !== "screen:note-flow") {
      return { records: [], nextBlockNumber: null, done: true };
    }
    const block = after === null ? 0 : after + 1;
    const start = block * 100;
    const end = Math.min(totalWritten, start + 100);
    return { records: Array.from({ length: Math.max(0, end - start) },
      (_, offset) => Object.assign(
        round(`r-${start + offset}`, start + offset),
        { prestigeEligible: false }
      )),
    nextBlockNumber: block, done: end === totalWritten };
  };
  large.shadow.database.readNoteFlowStatistics = async scope => ({
    roundCount: scope === "screen:note-flow" ? totalWritten : 0
  });
  const largeIndexed = { sections: Object.fromEntries(sections.map(section => [
    section, section === screen
      ? { current: 0, imported: total, new: total, duplicates: 0 }
      : { current: 0, imported: 0, new: 0, duplicates: 0 }
  ])) };
  const largeResult = await copyMergedRoundsToShadow(large.staging,
    large.active, large.shadow, largeIndexed);
  assert.strictEqual(largeResult["screen:note-flow"].total, total);
  assert.strictEqual(largestBatch, 100);
  assert.strictEqual(totalWritten, total);
  process.stdout.write("Large round merge writer tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
