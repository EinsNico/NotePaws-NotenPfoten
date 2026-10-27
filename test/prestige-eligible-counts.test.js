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
const { readPrestigeEligibleCounts, hasExcludedPrestigeEntries } =
  require("../src/model/PrestigeEligibleCounts");
const { createPrestigeProgress } = require("../src/model/PrestigeProgress");
Module._extensions[".js"] = original;

function fixture() {
  const records = {
    "screen:single-notes": [{ id: "old" }, { id: "imported", prestigeEligible: false }],
    "midi:single-notes": [],
    "screen:note-flow": [{ id: "melody", prestigeEligible: false }],
    "midi:note-flow": [{ id: "midi-melody" }],
    "midi:note-flow-chords": [{ id: "chord" }],
    "rhythm:taktgefuehl": [{ id: "rhythm", prestigeEligible: false }]
  };
  const counts = { singleNotesScreen: 2, singleNotesMidi: 0,
    melodyRounds: 2, chordRounds: 1, rhythmBars: 1 };
  const pages = [];
  const page = (scope, after, limit) => {
    assert.strictEqual(limit, 4);
    pages.push(scope);
    const offset = after === null ? 0 : after + 1;
    const chunk = records[scope].slice(offset, offset + 1);
    return { records: chunk, nextBlockNumber: offset,
      done: offset + chunk.length >= records[scope].length };
  };
  return { pages, database: {
    async readStoredEntryCounts() { return { ...counts }; },
    async readAttemptHistoryPage(...args) { return page(...args); },
    async readNoteFlowRoundsPage(...args) { return page(...args); }
  } };
}

(async () => {
  const { database, pages } = fixture();
  const free = [{ id: "old-free" }, { id: "imported-free", prestigeEligible: false }];
  const result = await readPrestigeEligibleCounts(database, free);
  assert.deepStrictEqual(result.physicalCounts, { singleNotesScreen: 2,
    singleNotesMidi: 0, melodyRounds: 2, chordRounds: 1, rhythmBars: 1,
    freeRounds: 2 });
  assert.deepStrictEqual(result.eligibleCounts, { singleNotesScreen: 1,
    singleNotesMidi: 0, melodyRounds: 1, chordRounds: 1, rhythmBars: 0,
    freeRounds: 1 });
  assert.deepStrictEqual(result.excludedCounts, { singleNotesScreen: 1,
    singleNotesMidi: 0, melodyRounds: 1, chordRounds: 0, rhythmBars: 1,
    freeRounds: 1 });
  assert.strictEqual(hasExcludedPrestigeEntries(result.excludedCounts), true);
  assert.strictEqual(createPrestigeProgress(result.eligibleCounts).detailEntries, 4);
  assert.strictEqual(hasExcludedPrestigeEntries({ freeRounds: 0 }), false);
  assert.throws(() => hasExcludedPrestigeEntries({ freeRounds: -1 }), /Invalid/);
  assert.ok(pages.length > 6, "history was counted through bounded pages");
  await assert.rejects(readPrestigeEligibleCounts(database, free,
    { shouldContinue: () => false }), error => error.name === "AbortError");
  const changed = fixture().database;
  changed.readStoredEntryCounts = async () => ({ singleNotesScreen: 3,
    singleNotesMidi: 0, melodyRounds: 2, chordRounds: 1, rhythmBars: 1 });
  await assert.rejects(readPrestigeEligibleCounts(changed, free), /differs/);
  process.stdout.write("Prestige eligible count tests passed.\n");
})().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
