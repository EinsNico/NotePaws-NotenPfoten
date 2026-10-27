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
const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const {
  stageBrowserSaveDataFile,
  stageNativeSaveDataFile,
  openSaveDataImportStaging
} = require("../src/model/SaveDataImportStaging.js");
Module._extensions[".js"] = originalLoader;

function fakeIndexedDB() {
  const databases = new Map();
  return {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        let database = databases.get(name);
        const created = !database;
        if (created) {
          const stores = new Map();
          database = {
            objectStoreNames: { contains: store => stores.has(store) },
            createObjectStore(store, options) {
              stores.set(store, { keyPath: options.keyPath, records: new Map() });
            },
            transaction(names) {
              const selected = Array.isArray(names) ? names : [names];
              const copies = new Map(selected.map(store => [store,
                new Map(stores.get(store).records)]));
              const transaction = {
                objectStore(store) {
                  const state = stores.get(store);
                  const records = copies.get(store);
                  const keyOf = value => Array.isArray(state.keyPath)
                    ? JSON.stringify(state.keyPath.map(part => value[part]))
                    : value[state.keyPath];
                  return {
                    add(value) {
                      const key = keyOf(value);
                      if (records.has(key)) {
                        transaction.error = new Error("ConstraintError");
                      } else records.set(key, value);
                    },
                    put(value) { records.set(keyOf(value), value); },
                    clear() { records.clear(); },
                    get(key) {
                      const request = {};
                      queueMicrotask(() => {
                        request.result = records.get(Array.isArray(key)
                          ? JSON.stringify(key) : key);
                        request.onsuccess();
                      });
                      return request;
                    },
                    getAll(range, limit) {
                      const request = {};
                      queueMicrotask(() => {
                        const compare = (left, right) => {
                          for (let index = 0; index < left.length; index += 1) {
                            if (left[index] < right[index]) return -1;
                            if (left[index] > right[index]) return 1;
                          }
                          return 0;
                        };
                        request.result = Array.from(records.values())
                          .filter(value => {
                            const key = state.keyPath.map(part => value[part]);
                            const low = compare(key, range.lower);
                            const high = compare(key, range.upper);
                            return (low > 0 || (low === 0 && !range.lowerOpen))
                              && (high < 0 || (high === 0 && !range.upperOpen));
                          })
                          .sort((left, right) => compare(
                            state.keyPath.map(part => left[part]),
                            state.keyPath.map(part => right[part])
                          )).slice(0, limit);
                        request.onsuccess();
                      });
                      return request;
                    }
                  };
                }
              };
              queueMicrotask(() => {
                if (transaction.error) {
                  if (transaction.onabort) transaction.onabort();
                }
                else {
                  copies.forEach((copy, store) => { stores.get(store).records = copy; });
                  if (transaction.oncomplete) transaction.oncomplete();
                }
              });
              return transaction;
            },
            close() {}
          };
          databases.set(name, database);
        }
        request.result = database;
        if (created) request.onupgradeneeded({ target: request });
        request.onsuccess();
      });
      return request;
    }
  };
}

const storage = { length: 0, key: () => null, getItem: () => null };
const backup = createSaveDataBackup(storage, { createdAt: "2026-09-28T12:00:00.000Z" });
backup.version = 4;
backup.data.adaptiveHistory = {
  version: 1, baselines: [],
  evaluations: [{
    id: "note-1", completedAt: 1,
    exercise: { clef: "bass", value: 48 }, correctFirstTry: true
  }]
};
backup.data.rhythmSenseBars = [{
  id: "bar-1", sessionId: "session-1", barNumber: 1,
  completedAt: "2026-09-28T12:00:00.000Z",
  settings: { meter: "4/4", bpm: 80 }, score: {}, timing: {}, notes: []
}];

(async () => {
  const indexedDB = fakeIndexedDB();
  const options = {
    indexedDB, name: "staging-test",
    IDBKeyRange: { bound: (lower, upper, lowerOpen, upperOpen) => ({
      lower, upper, lowerOpen, upperOpen
    }) }
  };
  const result = await stageBrowserSaveDataFile(
    new Blob([JSON.stringify(backup)]), options
  );
  assert.strictEqual(result.counts["data.adaptiveHistory.evaluations"], 1);
  assert.strictEqual(result.counts["data.rhythmSenseBars"], 1);
  const ready = await result.staging.readMetadata();
  assert.strictEqual(ready.key, "ready");
  assert.strictEqual(ready.shell.data.rhythmSenseBars.length, 0);
  const preview = await result.staging.readPreview();
  assert.strictEqual(preview.fileSize, new Blob([JSON.stringify(backup)]).size);
  assert.strictEqual(preview.screenEvaluations, 1);
  assert.strictEqual(preview.rhythmBars, 1);
  assert.strictEqual(preview.noteFlowScreenRounds, 0);
  assert.strictEqual(preview.mergeProjectionAvailable, false);
  const firstBatch = await result.staging.readBatch(
    "data.adaptiveHistory.evaluations", 0, 1
  );
  assert.strictEqual(firstBatch.records[0].id, "note-1");
  assert.strictEqual(firstBatch.done, true);
  assert.deepStrictEqual(await result.staging.findRecordByIdentity(
    "data.adaptiveHistory.evaluations", "note-1"
  ), {
    section: "data.adaptiveHistory.evaluations",
    index: 0,
    record: backup.data.adaptiveHistory.evaluations[0]
  });
  assert.strictEqual(await result.staging.findRecordByIdentity(
    "data.adaptiveHistory.evaluations", "missing"
  ), null);
  assert.strictEqual(await result.staging.findRecordByIdentity(
    "data.rhythmSenseBars", "note-1"
  ), null);
  assert.deepStrictEqual((await result.staging.findRecordsByIdentities(
    "data.adaptiveHistory.evaluations", ["missing", "note-1"]
  )).map(value => value && value.record.id), [null, "note-1"]);
  assert.deepStrictEqual(await result.staging.findRecordsByIdentities(
    "data.adaptiveHistory.evaluations", []
  ), []);
  await assert.rejects(result.staging.findRecordsByIdentities(
    "data.adaptiveHistory.evaluations", Array(251).fill("note-1")
  ), /Invalid staged backup identities/);
  await assert.rejects(result.staging.findRecordByIdentity(
    "data.rhythmSenseBars", ""
  ), /Invalid staged backup identity/);
  await result.staging.resetMergeMatches();
  await result.staging.markMergeMatches(
    "data.adaptiveHistory.evaluations", ["note-1"]
  );
  assert.deepStrictEqual(await result.staging.hasMergeMatches(
    "data.adaptiveHistory.evaluations", ["missing", "note-1"]
  ), [false, true]);
  await result.staging.markMergeMatches("data.rhythmSenseBars", ["bar-1"]);
  assert.deepStrictEqual(await result.staging.hasMergeMatches(
    "data.rhythmSenseBars", ["bar-1"]
  ), [true]);
  await assert.rejects(result.staging.markMergeMatches(
    "data.roundHistory.rounds", ["round-1"]
  ), /Invalid merge-match identities/);
  await result.staging.resetMergeMatches();
  assert.deepStrictEqual(await result.staging.hasMergeMatches(
    "data.adaptiveHistory.evaluations", ["note-1"]
  ), [false]);
  assert.deepStrictEqual((await result.staging.readBatch(
    "data.adaptiveHistory.evaluations", 1, 1
  )).records, []);
  await assert.rejects(result.staging.readBatch(
    "data.adaptiveHistory.evaluations", 0, 251
  ), /Invalid staged backup batch range/);
  result.staging.close();

  const many = JSON.parse(JSON.stringify(backup));
  many.data.rhythmSenseBars = Array.from({ length: 301 }, (_, index) => (
    Object.assign({}, backup.data.rhythmSenseBars[0], {
      id: `bar-${index + 1}`, barNumber: index + 1
    })
  ));
  const manyResult = await stageBrowserSaveDataFile(
    new Blob([JSON.stringify(many)]), options
  );
  const batch1 = await manyResult.staging.readBatch("data.rhythmSenseBars");
  const batch2 = await manyResult.staging.readBatch(
    "data.rhythmSenseBars", batch1.nextIndex
  );
  assert.strictEqual(batch1.records.length, 250);
  assert.strictEqual(batch2.records.length, 51);
  assert.strictEqual(batch2.records[50].id, "bar-301");
  assert.strictEqual(batch2.done, true);
  assert.strictEqual((await manyResult.staging.findRecordByIdentity(
    "data.rhythmSenseBars", "bar-301"
  )).index, 300);
  assert.deepStrictEqual((await manyResult.staging.findRecordsByIdentities(
    "data.rhythmSenseBars", ["bar-1", "bar-301", "missing"]
  )).map(value => value && value.record.id),
  ["bar-1", "bar-301", null]);
  manyResult.staging.close();

  const unordered = JSON.parse(JSON.stringify(backup));
  unordered.data.adaptiveHistory.evaluations = [
    { id: "later", completedAt: 3, exercise: { clef: "bass", value: 48 } },
    { id: "first", completedAt: 1, exercise: { clef: "bass", value: 48 } },
    { id: "middle", completedAt: 2, exercise: { clef: "bass", value: 48 } }
  ];
  const unorderedResult = await stageBrowserSaveDataFile(
    new Blob([JSON.stringify(unordered)]), options
  );
  const chronological1 = await unorderedResult.staging.readChronologicalBatch(
    "data.adaptiveHistory.evaluations", null, 2
  );
  const chronological2 = await unorderedResult.staging.readChronologicalBatch(
    "data.adaptiveHistory.evaluations", chronological1.cursor, 2
  );
  assert.deepStrictEqual(chronological1.records.map(value => value.id),
    ["first", "middle"]);
  assert.deepStrictEqual(chronological2.records.map(value => value.id), ["later"]);
  assert.strictEqual(chronological2.done, true);
  unorderedResult.staging.close();

  const duplicate = JSON.parse(JSON.stringify(backup));
  duplicate.data.rhythmSenseBars.push(Object.assign({}, duplicate.data.rhythmSenseBars[0]));
  await assert.rejects(stageBrowserSaveDataFile(
    new Blob([JSON.stringify(duplicate)]), options
  ), /ConstraintError/);
  const afterFailure = await openSaveDataImportStaging(options);
  assert.strictEqual(await afterFailure.readMetadata(), undefined);
  afterFailure.close();

  const invalid = JSON.parse(JSON.stringify(backup));
  invalid.data.rhythmSenseBars[0].settings.meter = "bad";
  await assert.rejects(stageBrowserSaveDataFile(
    new Blob([JSON.stringify(invalid)]), options
  ), /Invalid backup record/);

  let keepReading = true;
  const paddedBackup = new Blob([JSON.stringify(backup), " ".repeat(70 * 1024)]);
  await assert.rejects(stageBrowserSaveDataFile(paddedBackup, Object.assign({}, options, {
    shouldContinue: () => keepReading,
    onProgress: () => { keepReading = false; }
  })), error => error && error.name === "AbortError");
  const afterCancellation = await openSaveDataImportStaging(options);
  assert.strictEqual(await afterCancellation.readMetadata(), undefined);
  afterCancellation.close();

  // Every file-picker route now uses staging, including historical JSON
  // versions and both supported free-round history shapes.
  for (const version of [1, 2, 3, 4]) {
    const legacy = JSON.parse(JSON.stringify(backup));
    legacy.version = version;
    if (version < 4) delete legacy.data.rhythmSenseBars;
    if (version === 1) {
      delete legacy.data.adaptiveProgressMidi;
      delete legacy.data.adaptiveHistoryMidi;
    }
    const rounds = [{ id: `legacy-${version}`, completedAt: 1 }];
    legacy.data.roundHistory = version % 2
      ? rounds : { version: 1, rounds };
    const serialized = JSON.stringify(legacy);
    const legacyResult = await stageBrowserSaveDataFile(
      new Blob([serialized, version === 1 ? " ".repeat(70 * 1024) : ""]), options
    );
    const legacyPreview = await legacyResult.staging.readPreview();
    assert.strictEqual(legacyPreview.normalRounds, 1);
    assert.strictEqual(legacyPreview.screenEvaluations, 1);
    assert.strictEqual(legacyPreview.rhythmBars, version === 4 ? 1 : 0);
    const section = version % 2 ? "data.roundHistory" : "data.roundHistory.rounds";
    assert.deepStrictEqual((await legacyResult.staging.readBatch(section)).records, rounds);
    legacyResult.staging.close();

    if (version === 1) {
      const bytes = Buffer.from(serialized, "utf8");
      let offset = 0;
      const nativeResult = await stageNativeSaveDataFile({
        openStream(mimeType, resolve) {
          assert.strictEqual(mimeType, "application/json");
          resolve({ status: "selected", token: "legacy-native", size: -1 });
        },
        readChunk(token, resolve) {
          assert.strictEqual(token, "legacy-native");
          const end = Math.min(bytes.length, offset + 17);
          const data = bytes.subarray(offset, end).toString("base64");
          offset = end;
          resolve({ status: "chunk", token, data, done: offset === bytes.length });
        },
        closeStream(token, resolve) { resolve({ status: "closed", token }); }
      }, options);
      const nativePreview = await nativeResult.staging.readPreview();
      assert.strictEqual(nativePreview.normalRounds, 1);
      assert.strictEqual(nativePreview.screenEvaluations, 1);
      assert.strictEqual(nativePreview.fileSize, bytes.length);
      nativeResult.staging.close();
    }
  }
  process.stdout.write("Save-data import staging tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
