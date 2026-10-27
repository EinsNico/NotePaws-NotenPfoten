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
  LearningDatabasePrototype,
  LEARNING_DATABASE_STORES,
  packAttemptsIntoBlocks,
  packNoteFlowRoundsIntoBlocks
} = require("../src/model/LearningDatabasePrototype.js");
Module._extensions[".js"] = originalLoader;

function fakeDatabase(blocksByStore) {
  return {
    transaction(storeName, mode) {
      assert.strictEqual(mode, "readonly");
      const transaction = {
        objectStore(name) {
          assert.strictEqual(name, storeName);
          return {
            index(indexName) {
              assert.strictEqual(indexName, "byScopeAndNumber");
              return {
                getAll(range, limit) {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = (blocksByStore[name] || [])
                      .filter(block => (
                        block.scope === range.lower[0]
                        && block.blockNumber >= range.lower[1]
                        && block.blockNumber <= range.upper[1]
                      ))
                      .sort((left, right) => left.blockNumber - right.blockNumber)
                      .slice(0, limit);
                    request.onsuccess();
                  });
                  return request;
                }
              };
            }
          };
        }
      };
      setImmediate(() => transaction.oncomplete());
      return transaction;
    }
  };
}

(async () => {
  const roundScope = "rhythm:taktgefuehl";
  const attemptScope = "screen:single-notes";
  const rounds = Array.from({ length: 5 }, (_, index) => ({
    id: `round-${index}`, completedAt: "2026-09-28T12:00:00.000Z"
  }));
  const attempts = Array.from({ length: 5 }, (_, index) => ({
    id: `attempt-${index}`, scope: attemptScope,
    sessionId: "session-1", noteKey: "treble:60:natural",
    completedAt: 1789550000000 + index,
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 500
  }));
  const stores = LEARNING_DATABASE_STORES;
  const blocks = {
    [stores.noteFlowRoundBlocks]: packNoteFlowRoundsIntoBlocks(rounds, {
      scope: roundScope, blockSize: 2
    }),
    [stores.attemptBlocks]: packAttemptsIntoBlocks(attempts, {
      scope: attemptScope, maxAttempts: 2
    })
  };
  const database = new LearningDatabasePrototype(fakeDatabase(blocks), {
    IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) }
  });
  const firstRounds = await database.readNoteFlowRoundsPage(roundScope, null, 2);
  assert.deepStrictEqual(firstRounds.records.map(value => value.id),
    ["round-0", "round-1", "round-2", "round-3"]);
  assert.strictEqual(firstRounds.nextBlockNumber, 1);
  assert.strictEqual(firstRounds.done, false);
  const lastRounds = await database.readNoteFlowRoundsPage(
    roundScope, firstRounds.nextBlockNumber, 2
  );
  assert.deepStrictEqual(lastRounds.records.map(value => value.id), ["round-4"]);
  assert.strictEqual(lastRounds.done, true);
  const firstAttempts = await database.readAttemptHistoryPage(attemptScope, null, 2);
  assert.deepStrictEqual(firstAttempts.records.map(value => value.id),
    ["attempt-0", "attempt-1", "attempt-2", "attempt-3"]);
  const lastAttempts = await database.readAttemptHistoryPage(
    attemptScope, firstAttempts.nextBlockNumber, 2
  );
  assert.deepStrictEqual(lastAttempts.records.map(value => value.id),
    ["attempt-4"]);
  assert.strictEqual(lastAttempts.done, true);
  assert.deepStrictEqual((await database.readNoteFlowRoundsPage(
    "screen:note-flow", null, 2
  )).records, []);
  await assert.rejects(database.readAttemptHistoryPage(attemptScope, null, 9),
    /Invalid learning history page/);
  blocks[stores.attemptBlocks][0].count += 1;
  await assert.rejects(database.readAttemptHistoryPage(attemptScope, null, 1),
    /inconsistent block/);
  process.stdout.write("Paged learning history tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
