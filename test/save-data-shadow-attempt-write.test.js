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
const { LearningDatabasePrototype, expandAttemptBlock } = require(
  "../src/model/LearningDatabasePrototype.js"
);
const { copyStagedSingleNotesToShadow } = require(
  "../src/model/SaveDataShadowSingleNotes.js"
);
Module._extensions[".js"] = originalLoader;

function fakeDatabase() {
  const names = ["meta", "attemptBlocks", "trendBlocks", "timeBuckets", "statistics"];
  const stores = new Map(names.map(name => [name, new Map()]));
  stores.get("meta").set("backup-import-generation", {
    key: "backup-import-generation", state: "preparing"
  });
  return {
    stores,
    transaction(selected) {
      const copies = new Map(selected.map(name => [name, new Map(stores.get(name))]));
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

function evaluation(index) {
  return {
    id: `e-${String(index).padStart(4, "0")}`,
    completedAt: 1789550000000 + index * 1000,
    exercise: { clef: "bass", staff: "bass", value: 48 },
    correctFirstTry: index % 2 === 0,
    mistakeCount: index % 2,
    responseTimeMs: index % 2 === 0 ? 800 : null
  };
}

function staged(count) {
  return {
    async readMetadata() {
      return { key: "ready", counts: {
        "data.adaptiveHistory.evaluations": count
      } };
    },
    async readChronologicalBatch(section, after, limit) {
      const total = section === "data.adaptiveHistory.evaluations" ? count : 0;
      const start = after ? Number(after.id.slice(2)) + 1 : 0;
      const end = Math.min(total, start + limit);
      const records = Array.from({ length: end - start }, (_, i) => evaluation(start + i));
      return {
        records,
        cursor: records.length ? {
          completedAt: records[records.length - 1].completedAt,
          id: records[records.length - 1].id
        } : after,
        done: end === total
      };
    }
  };
}

(async () => {
  const live = fakeDatabase();
  const inactive = fakeDatabase();
  const shadow = {
    name: "noten-pfoten-learning-import-attempt-test",
    database: new LearningDatabasePrototype(inactive, {
      name: "noten-pfoten-learning-import-attempt-test"
    })
  };
  const manifest = await copyStagedSingleNotesToShadow(staged(301), shadow);
  assert.strictEqual(manifest["screen:single-notes"].attemptCount, 301);
  const statistics = inactive.stores.get("statistics").get("screen:single-notes");
  assert.strictEqual(statistics.attemptCount, 301);
  assert.strictEqual(statistics.correctFirstTryCount, 151);
  assert.strictEqual(statistics.mistakeCount, 150);
  assert.strictEqual(statistics.timedAttemptCount, 151);
  const blocks = Array.from(inactive.stores.get("attemptBlocks").values());
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks.reduce((total, block) => total + block.count, 0), 301);
  assert.strictEqual(expandAttemptBlock(blocks[1])[0].id, "e-0250");
  assert.strictEqual(expandAttemptBlock(blocks[1])[0].prestigeEligible, false);
  assert.strictEqual(inactive.stores.get("timeBuckets").size, 1);
  assert.strictEqual(inactive.stores.get("trendBlocks").size, 1);
  assert.strictEqual(live.stores.get("attemptBlocks").size, 0);
  assert.strictEqual(inactive.stores.get("meta").get("backup-import-generation").state,
    "preparing");
  await assert.rejects(copyStagedSingleNotesToShadow(staged(301), shadow),
    /out of order/);

  const interrupted = fakeDatabase();
  const interruptedModel = new LearningDatabasePrototype(interrupted, {
    name: "noten-pfoten-learning-import-interrupted-test"
  });
  const append = interruptedModel.appendImportedAttemptBatch.bind(interruptedModel);
  let calls = 0;
  interruptedModel.appendImportedAttemptBatch = (...args) => {
    calls += 1;
    return calls === 2 ? Promise.reject(new Error("simulated write failure"))
      : append(...args);
  };
  await assert.rejects(copyStagedSingleNotesToShadow(staged(301), {
    name: "noten-pfoten-learning-import-interrupted-test",
    database: interruptedModel
  }), /simulated write failure/);
  assert.strictEqual(interrupted.stores.get("meta").get(
    "backup-import-generation"
  ).state, "preparing");
  assert.strictEqual(live.stores.get("attemptBlocks").size, 0);
  process.stdout.write("Save-data shadow attempt write tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
