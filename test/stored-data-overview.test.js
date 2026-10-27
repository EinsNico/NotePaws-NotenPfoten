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
const { LearningDatabasePrototype } = require("../src/model/LearningDatabasePrototype");
Module._extensions[".js"] = original;
async function read(values) {
  let reads = 0;
  const database = {
    transaction(stores, mode) {
      assert.strictEqual(mode, "readonly");
      assert.deepStrictEqual(stores, ["meta", "statistics"]);
      const transaction = {
        objectStore(name) {
          return { get(key) {
            reads++;
            const request = {};
            queueMicrotask(() => {
              request.result = values[name === "meta" ? key.replace(/^writer\|/, "") : key];
              request.onsuccess();
            });
            return request;
          } };
        }
      };
      setTimeout(() => transaction.oncomplete(), 0);
      return transaction;
    }
  };
  const result = await new LearningDatabasePrototype(database).readStoredEntryCounts();
  assert.strictEqual(reads, 6);
  return result;
}
(async () => {
  const counts = await read({
    "screen:single-notes": { nextSequence: 304000 },
    "midi:single-notes": { nextSequence: 0 },
    "rhythm:taktgefuehl": { roundCount: 201000 }
  });
  assert.strictEqual(counts.singleNotesScreen, 304000);
  assert.strictEqual(counts.rhythmBars, 201000);
  assert.strictEqual(Object.values(counts).reduce((a, b) => a + b, 0), 505000);
  const empty = await read({});
  assert.ok(Object.values(empty).every(value => value === 0));
  await assert.rejects(read({ "rhythm:taktgefuehl": { roundCount: -1 } }), /Invalid/);
  const populated = await read({
    "screen:note-flow": { roundCount: 3 }, "midi:note-flow": { roundCount: 4 },
    "midi:note-flow-chords": { roundCount: 5 }
  });
  assert.strictEqual(populated.melodyRounds, 7);
  assert.strictEqual(populated.chordRounds, 5);
  process.stdout.write("Stored entry overview tests passed (six metadata reads).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
