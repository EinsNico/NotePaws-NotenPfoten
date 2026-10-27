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
const { indexStagedRoundMatches } = require(
  "../src/model/SaveDataLargeMergeRounds.js"
);
Module._extensions[".js"] = originalLoader;

const screen = "data.noteFlowRounds.screen";
const rhythm = "data.rhythmSenseBars";
const counts = { [screen]: 2, "data.noteFlowRounds.midi": 0,
  "data.noteFlowRounds.chordMidi": 0, [rhythm]: 1 };
const same = { id: "same", score: { correct: 2, wrong: 0 } };
const imported = new Map([
  [`${screen}:same`, { section: screen,
    record: { id: "same", score: { wrong: 0, correct: 2 } } }]
]);
function fixture() {
  const markers = new Set(["data.adaptiveHistory.evaluations:note-same"]);
  const staging = {
    markers,
    async readMetadata() { return { key: "ready", counts }; },
    async findRecordsByIdentities(section, ids) {
      assert(ids.length <= 100);
      return ids.map(id => imported.get(`${section}:${id}`) || null);
    },
    async markMergeMatches(section, ids) {
      ids.forEach(id => markers.add(`${section}:${id}`));
    },
    async resetMergeMatches() { markers.clear(); }
  };
  const active = {
    async readNoteFlowRoundsPage(scope, after, limit) {
      assert.strictEqual(limit, 1);
      return { records: scope === "screen:note-flow" ?
        [same, { id: "old", score: { correct: 1 } }] : [],
      nextBlockNumber: scope === "screen:note-flow" ? 0 : null,
      done: true };
    }
  };
  return { staging, active };
}

(async () => {
  const first = fixture();
  const result = await indexStagedRoundMatches(first.staging, first.active);
  assert.deepStrictEqual(result.sections[screen], {
    current: 2, imported: 2, new: 1, duplicates: 1
  });
  assert.deepStrictEqual(result.sections[rhythm], {
    current: 0, imported: 1, new: 1, duplicates: 0
  });
  assert(first.staging.markers.has(`${screen}:same`));
  assert(first.staging.markers.has(
    "data.adaptiveHistory.evaluations:note-same"
  ));

  same.prestigeEligible = false;
  const replay = fixture();
  const replayResult = await indexStagedRoundMatches(replay.staging, replay.active);
  assert.deepStrictEqual(replayResult.sections[screen], result.sections[screen]);
  assert.strictEqual(same.prestigeEligible, false);
  assert.strictEqual(imported.get(`${screen}:same`).record.prestigeEligible, undefined);
  delete same.prestigeEligible;

  const conflict = fixture();
  conflict.staging.findRecordsByIdentities = async (section, ids) =>
    ids.map(id => id === "same" ? { section,
      record: { ...same, score: { correct: 0 } } } : null);
  await assert.rejects(indexStagedRoundMatches(conflict.staging,
    conflict.active), /Conflicting round ID/);
  assert.strictEqual(conflict.staging.markers.size, 0);

  const crossMode = fixture();
  crossMode.staging.findRecordsByIdentities = async (section, ids) =>
    ids.map(id => id === "same" ? { section: "data.noteFlowRounds.midi",
      record: same } : null);
  await assert.rejects(indexStagedRoundMatches(crossMode.staging,
    crossMode.active), /Conflicting round ID/);

  const cancelled = fixture();
  let checks = 0;
  await assert.rejects(indexStagedRoundMatches(cancelled.staging,
    cancelled.active, () => ++checks < 2),
  error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.staging.markers.size, 0);

  const large = fixture();
  let pages = 0;
  let largestLookup = 0;
  large.active.readNoteFlowRoundsPage = async (scope, after, limit) => {
    assert.strictEqual(limit, 1);
    if (scope !== "screen:note-flow") {
      return { records: [], nextBlockNumber: null, done: true };
    }
    const block = after === null ? 0 : after + 1;
    pages += 1;
    return { records: Array.from({ length: 100 }, (_, index) => ({
      id: `old-${block * 100 + index}`
    })), nextBlockNumber: block, done: block === 999 };
  };
  large.staging.findRecordsByIdentities = async (section, ids) => {
    largestLookup = Math.max(largestLookup, ids.length);
    return ids.map(() => null);
  };
  const resultLarge = await indexStagedRoundMatches(large.staging,
    large.active);
  assert.strictEqual(resultLarge.sections[screen].current, 100000);
  assert.strictEqual(resultLarge.sections[screen].new, 2);
  assert.strictEqual(pages, 1000);
  assert.strictEqual(largestLookup, 100);
  process.stdout.write("Large round merge match-index tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
