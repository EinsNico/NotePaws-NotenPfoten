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
const { LearningDatabasePrototype } = require("../src/model/LearningDatabasePrototype.js");
const { copyStagedNoteFlowToShadow } = require("../src/model/SaveDataShadowNoteFlow.js");
Module._extensions[".js"] = originalLoader;

function fakeDatabase() {
  const stores = new Map([
    ["meta", new Map([["backup-import-generation", {
      key: "backup-import-generation", state: "preparing"
    }]])],
    ["statistics", new Map()],
    ["noteFlowRoundBlocks", new Map()]
  ]);
  return {
    stores,
    transaction(names) {
      const copies = new Map((Array.isArray(names) ? names : [names]).map(name => (
        [name, new Map(stores.get(name))]
      )));
      let aborted = false;
      const transaction = {
        objectStore(name) {
          const values = copies.get(name);
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = values.get(key);
                request.onsuccess();
              });
              return request;
            },
            put(value) { values.set(value.id || value.key || value.scope, value); }
          };
        },
        abort() {
          aborted = true;
          queueMicrotask(() => transaction.onabort());
        }
      };
      setImmediate(() => {
        if (!aborted) {
          copies.forEach((values, name) => stores.set(name, values));
          transaction.oncomplete();
        }
      });
      return transaction;
    }
  };
}

function round(id) {
  return {
    id, mode: "free", completedAt: "2026-09-28T12:00:00.000Z",
    score: { correct: 3, wrong: 1, missed: 0 },
    timing: { precise: 2, early: 1, late: 0 },
    settings: { inputMode: "button", meter: "4/4" }
  };
}

(async () => {
  const live = fakeDatabase();
  const inactive = fakeDatabase();
  const shadow = {
    name: "noten-pfoten-learning-import-test",
    database: new LearningDatabasePrototype(inactive, {
      name: "noten-pfoten-learning-import-test"
    })
  };
  const sections = {
    "data.noteFlowRounds.screen": Array.from({ length: 205 }, (_, i) => {
      const record = round(`n-${i}`);
      record.settings.movement = ["calm", "mixed", "leaping"][i % 3];
      return record;
    }),
    "data.noteFlowRounds.midi": [],
    "data.noteFlowRounds.chordMidi": ["calm", "mixed", "leaping"].map(movement => {
      const record = round(`chord-${movement}`);
      record.exerciseType = "chord";
      record.settings = { inputMode: "midi", movement };
      return record;
    }),
    "data.rhythmSenseBars": Array.from({ length: 3 }, (_, i) => round(`r-${i}`))
  };
  const staging = {
    async readBatch(section, start, limit) {
      const all = sections[section];
      const records = all.slice(start, start + limit);
      const nextIndex = start + records.length;
      return { records, nextIndex, total: all.length, done: nextIndex === all.length };
    }
  };
  const copied = await copyStagedNoteFlowToShadow(staging, shadow);
  assert.strictEqual(copied["screen:note-flow"], 205);
  assert.strictEqual(copied["midi:note-flow-chords"], 3);
  assert.strictEqual(copied["rhythm:taktgefuehl"], 3);
  assert.strictEqual(inactive.stores.get("noteFlowRoundBlocks").size, 5);
  const storedChords = Array.from(inactive.stores.get("noteFlowRoundBlocks").values())
    .filter(block => block.scope === "midi:note-flow-chords")
    .reduce((all, block) => all.concat(block.rounds), []);
  assert.deepStrictEqual(storedChords.map(record => record.settings.movement), ["calm", "mixed", "leaping"]);
  const storedMelody = Array.from(inactive.stores.get("noteFlowRoundBlocks").values())
    .filter(block => block.scope === "screen:note-flow")
    .reduce((all, block) => all.concat(block.rounds), []);
  assert.deepStrictEqual(storedMelody.map(record => record.settings.movement),
    sections["data.noteFlowRounds.screen"].map(record => record.settings.movement));
  assert(Array.from(inactive.stores.get("noteFlowRoundBlocks").values())
    .every(block => block.rounds.every(record => record.prestigeEligible === false)));
  assert.strictEqual(inactive.stores.get("statistics").get("screen:note-flow").roundCount, 205);
  assert.strictEqual(inactive.stores.get("statistics").get("rhythm:taktgefuehl").roundCount, 3);
  assert.strictEqual(inactive.stores.get("meta").get(
    "note-flow-round-writer|screen:note-flow"
  ).roundCount, 205);
  assert.strictEqual(live.stores.get("noteFlowRoundBlocks").size, 0);
  assert.strictEqual(inactive.stores.get("meta").get("backup-import-generation").state,
    "preparing");
  await assert.rejects(copyStagedNoteFlowToShadow(staging, shadow), /out of order/);
  process.stdout.write("Save-data shadow Note Flow tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
