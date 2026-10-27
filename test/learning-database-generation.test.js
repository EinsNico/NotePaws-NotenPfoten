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
const {
  ACTIVE_LEARNING_DATABASE_KEY,
  IMPORT_GENERATION_META_KEY,
  LEGACY_LEARNING_DATABASE_NAME,
  activeLearningDatabaseName,
  activateReadyLearningDatabase,
  createShadowLearningDatabase
} = require("../src/model/LearningDatabaseGeneration.js");
const { SingleNotesLearningWriter } = require("../src/model/SingleNotesLearningStorage.js");
const { NoteFlowRoundWriter } = require("../src/model/NoteFlowRoundStorage.js");
Module._extensions[".js"] = originalLoader;

function fakeStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function fakeDatabaseOpener() {
  const generations = new Map();
  const openDatabase = async ({ name }) => {
    if (!generations.has(name)) generations.set(name, new Map());
    const records = generations.get(name);
    return {
      database: {
        transaction(store) {
          assert.strictEqual(store, "meta");
          const transaction = {
            objectStore() {
              return {
                put(value) { records.set(value.key, value); },
                get(key) {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = records.get(key);
                    request.onsuccess();
                  });
                  return request;
                }
              };
            }
          };
          queueMicrotask(() => transaction.oncomplete());
          return transaction;
        }
      },
      close() {}
    };
  };
  return { generations, openDatabase };
}

(async () => {
  const storage = fakeStorage();
  const databases = fakeDatabaseOpener();
  assert.strictEqual(activeLearningDatabaseName(storage), LEGACY_LEARNING_DATABASE_NAME);
  const shadow = await createShadowLearningDatabase({
    openDatabase: databases.openDatabase
  });
  assert.notStrictEqual(shadow.name, LEGACY_LEARNING_DATABASE_NAME);
  assert.strictEqual(activeLearningDatabaseName(storage), LEGACY_LEARNING_DATABASE_NAME);
  const marker = databases.generations.get(shadow.name).get(IMPORT_GENERATION_META_KEY);
  assert.strictEqual(marker.state, "preparing");
  shadow.database.close();
  await assert.rejects(activateReadyLearningDatabase(shadow.name, {
    storage, openDatabase: databases.openDatabase
  }), /not ready/);
  assert.strictEqual(activeLearningDatabaseName(storage), LEGACY_LEARNING_DATABASE_NAME);
  await assert.rejects(activateReadyLearningDatabase("untrusted-name", {
    storage, openDatabase: databases.openDatabase
  }), /Invalid learning database generation/);
  databases.generations.get(shadow.name).set(IMPORT_GENERATION_META_KEY,
    Object.assign({}, marker, { state: "ready" }));
  const switched = await activateReadyLearningDatabase(shadow.name, {
    storage, openDatabase: databases.openDatabase
  });
  assert.strictEqual(switched.previous, LEGACY_LEARNING_DATABASE_NAME);
  assert.strictEqual(activeLearningDatabaseName(storage), shadow.name);
  global.localStorage = storage;
  const opened = [];
  const indexedDB = {
    open(name) {
      opened.push(name);
      const request = {};
      queueMicrotask(() => {
        request.result = { name, close() {} };
        request.onsuccess();
      });
      return request;
    }
  };
  await new SingleNotesLearningWriter({ indexedDB }).open();
  await new NoteFlowRoundWriter({ indexedDB }).open();
  assert.deepStrictEqual(opened, [shadow.name, shadow.name]);
  delete global.localStorage;
  storage.setItem(ACTIVE_LEARNING_DATABASE_KEY, "invalid-name");
  assert.strictEqual(activeLearningDatabaseName(storage), LEGACY_LEARNING_DATABASE_NAME);
  process.stdout.write("Learning database generation tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
