const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJsLoader = Module._extensions[".js"];
const originalVueLoader = Module._extensions[".vue"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (!filename.startsWith(sourceRoot)) return originalJsLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
Module._extensions[".vue"] = function stubVisualComponent(loadedModule) {
  loadedModule.exports = { default: { name: "VisualStub" } };
};

const storage = require("../src/model/NoteFlowRoundStorage").default;
const filename = path.resolve(__dirname, "../src/components/NoteFlowChordMenu.vue");
const source = fs.readFileSync(filename, "utf8");
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const loadedModule = new Module(filename, module);
loadedModule.filename = filename;
loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
loadedModule._compile(babel.transform(script, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, filename);
const menu = loadedModule.exports.default;
Module._extensions[".js"] = originalJsLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function run() {
  const originalReadStatistics = storage.readStatistics;
  const originalReadRecent = storage.readRecent;
  const calls = [];
  const view = {
    tab: "statistics", statisticsRequest: 0, statisticsState: "idle", statisticsSnapshot: null,
    $t: key => key
  };
  view.handLabel = menu.methods.handLabel.bind(view);
  storage.readStatistics = async (...args) => {
    calls.push(args);
    return { saved: true, statistics: { roundCount: 137, evaluatedNoteCount: 5,
      correctCount: 4, wrongCount: 1, durationTotalMs: 61000 } };
  };
  storage.readRecent = () => { throw new Error("History paging belongs to the shared chart"); };
  try {
    await menu.methods.loadStatistics.call(view);
    assert.deepStrictEqual(calls, [["midi", "chord"]]);
    assert.strictEqual(view.statisticsState, "ready");
    assert.strictEqual(view.statisticsSnapshot.roundCount, 137);
    assert.strictEqual(view.statisticsSnapshot.accuracy, 80);
    assert.strictEqual(view.statisticsSnapshot.durationTotalMs, 61000);
    process.stdout.write("✓ chord metrics retain data and leave history paging to the shared chart\n");

    for (const result of [{ saved: false }, new Error("unavailable")]) {
      storage.readStatistics = async () => { if (result instanceof Error) throw result; return result; };
      await menu.methods.loadStatistics.call(view);
      assert.strictEqual(view.statisticsState, "error");
    }
    const requests = [];
    storage.readStatistics = () => { const pending = deferred(); requests.push(pending); return pending.promise; };
    const first = menu.methods.loadStatistics.call(view);
    const second = menu.methods.loadStatistics.call(view);
    requests[1].resolve({ saved: true, statistics: { roundCount: 2 } });
    await second;
    const snapshot = view.statisticsSnapshot;
    requests[0].resolve({ saved: false });
    await first;
    assert.strictEqual(view.statisticsState, "ready");
    assert.strictEqual(view.statisticsSnapshot, snapshot);
    const leftTab = menu.methods.loadStatistics.call(view);
    view.tab = "settings";
    requests[2].resolve({ saved: true, statistics: { roundCount: 999 } });
    await leftTab;
    assert.strictEqual(view.statisticsSnapshot, snapshot);
    process.stdout.write("✓ errors can retry and late requests cannot replace newer data or another tab\n");

    const old = { chordSize: 3, bassNote: true };
    const before = JSON.stringify(old);
    assert.strictEqual(menu.methods.roundTotalTones(old), 4);
    assert.strictEqual(menu.methods.roundTotalTones({ chordSize: 4, bassNote: true }), 5);
    assert.strictEqual(menu.methods.roundTotalTones({ chordSize: 5, bassNote: true }), 5);
    assert.strictEqual(menu.methods.roundTotalTones({ chordSize: 3, bassNote: false }), 3);
    assert.strictEqual(menu.methods.roundTotalTones({ chordSize: 8, handMode: "two", bassNote: true }), 8);
    assert.strictEqual(menu.methods.roundHandsSummary.call(view, old), "FLOW_CHORD_BASS_ON");
    assert.strictEqual(menu.methods.roundHandsSummary.call(view, { handMode: "two", chordSize: 8, bassNotesPerChord: 3, trebleNotesPerChord: 5 }), "FLOW_CHORD_LEFT_HAND: 3 · FLOW_CHORD_RIGHT_HAND: 5");
    assert.strictEqual(JSON.stringify(old), before);
    process.stdout.write("✓ legacy and current hand/tone descriptions preserve source records\n");
  } finally {
    storage.readStatistics = originalReadStatistics;
    storage.readRecent = originalReadRecent;
  }
}
run().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
