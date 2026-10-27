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
  packNoteFlowRoundsIntoBlocks
} = require("../src/model/LearningDatabasePrototype.js");
const { NoteFlowRoundWriter } = require("../src/model/NoteFlowRoundStorage.js");
Module._extensions[".js"] = originalLoader;

const scopes = {
  screen: "screen:note-flow",
  midi: "midi:note-flow",
  chord: "midi:note-flow-chords"
};
const keyRange = { bound: (lower, upper) => ({ lower, upper }) };

function round(index, inputMode = "screen") {
  return {
    id: `${inputMode}-${index}`,
    completedAt: new Date(1789550000000 + index * 1000).toISOString(),
    durationMs: 1000,
    score: { correct: 8, wrong: 2, missed: 0, accuracy: 80 },
    timing: { precise: 8, early: 0, late: 0 },
    settings: { inputMode }
  };
}

function fakeDatabase(blocks, reads, options = {}) {
  return {
    transaction(storeName, mode) {
      assert.strictEqual(storeName, LEARNING_DATABASE_STORES.noteFlowRoundBlocks);
      assert.strictEqual(mode, "readonly");
      let aborted = false;
      const transaction = {
        abort() {
          aborted = true;
          queueMicrotask(() => transaction.onabort());
        },
        objectStore() {
          return {
            index(indexName) {
              assert.strictEqual(indexName, "byScopeAndNumber");
              return {
                getAll(range, limit) {
                  reads.push({ range, limit });
                  const request = {};
                  queueMicrotask(() => {
                    if (options.failRequest) {
                      request.error = new Error("History read failed");
                      request.onerror();
                      return;
                    }
                    request.result = blocks.filter(block => (
                      block.scope === range.lower[0]
                      && block.blockNumber >= range.lower[1]
                      && block.blockNumber <= range.upper[1]
                    )).sort((left, right) => left.blockNumber - right.blockNumber)
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
      setImmediate(() => {
        if (!aborted) transaction.oncomplete();
      });
      return transaction;
    }
  };
}

function ids(records) { return records.map(record => record.id); }
function expectedIds(start, end, inputMode = "screen") {
  return Array.from({ length: end - start }, (_, index) => (
    `${inputMode}-${start + index}`
  ));
}

async function run() {
  const screenRounds = Array.from({ length: 270 }, (_, index) => round(index));
  // Older results may contain only their identity and completion time.
  screenRounds[0] = { id: "screen-0", completedAt: screenRounds[0].completedAt };
  const blocks = packNoteFlowRoundsIntoBlocks(screenRounds, { scope: scopes.screen })
    .concat(packNoteFlowRoundsIntoBlocks([round(0, "midi")], { scope: scopes.midi }))
    .concat(packNoteFlowRoundsIntoBlocks([round(0, "chord")], { scope: scopes.chord }));
  const reads = [];
  const database = new LearningDatabasePrototype(fakeDatabase(blocks, reads), {
    IDBKeyRange: keyRange
  });
  const writer = new NoteFlowRoundWriter({ openDatabase: () => database });

  assert.deepStrictEqual(ids(await database.readNoteFlowHistoryWindow(
    scopes.screen, 96, 150
  )), expectedIds(96, 150));
  assert.deepStrictEqual(reads[0], {
    range: { lower: [scopes.screen, 0], upper: [scopes.screen, 1] }, limit: 2
  });
  assert.deepStrictEqual(ids(await database.readNoteFlowHistoryWindow(
    scopes.screen, 100, 150
  )), expectedIds(100, 150));
  assert.deepStrictEqual(reads[1].range, {
    lower: [scopes.screen, 1], upper: [scopes.screen, 1]
  });
  assert.deepStrictEqual(ids(await database.readNoteFlowHistoryWindow(
    scopes.screen, 245, 275
  )), expectedIds(245, 270));
  assert.deepStrictEqual(await database.readNoteFlowHistoryWindow(
    scopes.screen, 270, 280
  ), []);
  assert.deepStrictEqual(await database.readNoteFlowHistoryWindow(
    "screen:empty", 0, 10
  ), []);
  assert.deepStrictEqual(await database.readNoteFlowHistoryWindow(
    scopes.screen, 0, 1
  ), [screenRounds[0]]);
  const cloned = await database.readNoteFlowHistoryWindow(scopes.screen, 1, 2);
  cloned[0].score.accuracy = 0;
  assert.strictEqual((await database.readNoteFlowHistoryWindow(
    scopes.screen, 1, 2
  ))[0].score.accuracy, 80);

  const beforeEmpty = reads.length;
  assert.deepStrictEqual(await database.readNoteFlowHistoryWindow(
    scopes.screen, 40, 40
  ), []);
  assert.strictEqual(reads.length, beforeEmpty, "An empty window needs no transaction");
  const invalid = [
    ["", 0, 1], [scopes.screen, -1, 1], [scopes.screen, 2, 1],
    [scopes.screen, 0.5, 1], [scopes.screen, 0, NaN],
    [scopes.screen, "0", 1], [scopes.screen, 0, 55],
    [scopes.screen, 0, Number.MAX_SAFE_INTEGER + 1]
  ];
  for (const args of invalid) {
    await assert.rejects(database.readNoteFlowHistoryWindow(...args),
      /Invalid Note Flow history window/);
  }

  const screen = await writer.readHistoryWindow("button", 0, 2);
  const midi = await writer.readHistoryWindow("midi", 0, 2);
  const chord = await writer.readHistoryWindow("midi", 0, 2, "chord");
  assert.strictEqual(screen.saved, true);
  assert.strictEqual(screen.scope, scopes.screen);
  assert.deepStrictEqual(ids(screen.rounds), ["screen-0", "screen-1"]);
  assert.strictEqual(midi.scope, scopes.midi);
  assert.deepStrictEqual(ids(midi.rounds), ["midi-0"]);
  assert.strictEqual(chord.scope, scopes.chord);
  assert.deepStrictEqual(ids(chord.rounds), ["chord-0"]);
  const badBounds = await writer.readHistoryWindow("midi", 0, 55);
  assert.strictEqual(badBounds.saved, false);
  assert.deepStrictEqual(badBounds.rounds, []);
  assert.strictEqual((await writer.readHistoryWindow("midi", 0, 1)).saved, true);

  blocks[0].count += 1;
  await assert.rejects(database.readNoteFlowHistoryWindow(scopes.screen, 0, 1),
    /inconsistent block/);
  blocks[0].count -= 1;
  const noRange = new LearningDatabasePrototype(fakeDatabase(blocks, []));
  await assert.rejects(noRange.readNoteFlowHistoryWindow(scopes.screen, 0, 1),
    /IDBKeyRange is not available/);
  const failedDatabase = new LearningDatabasePrototype(fakeDatabase(blocks, [], {
    failRequest: true
  }), { IDBKeyRange: keyRange });
  const failedWriter = new NoteFlowRoundWriter({ openDatabase: () => failedDatabase });
  const failedRead = await failedWriter.readHistoryWindow("screen", 0, 1);
  assert.strictEqual(failedRead.saved, false);
  assert.strictEqual(failedRead.scope, scopes.screen);
  assert.deepStrictEqual(failedRead.rounds, []);
  assert.match(failedRead.error.message, /History read failed/);
  const failedOpen = new NoteFlowRoundWriter({
    openDatabase: () => Promise.reject(new Error("Database unavailable"))
  });
  assert.strictEqual((await failedOpen.readHistoryWindow("screen", 0, 1)).saved, false);

  // An optional external fake-indexeddb installation also exercises IndexedDB's
  // real request/transaction scheduling without adding a production dependency.
  if (process.env.NOTE_FLOW_HISTORY_INDEXEDDB_MODULE) {
    const indexed = require(process.env.NOTE_FLOW_HISTORY_INDEXEDDB_MODULE);
    const realWriter = new NoteFlowRoundWriter({
      databaseName: "noten-pfoten-history-window-test",
      indexedDB: indexed.indexedDB,
      IDBKeyRange: indexed.IDBKeyRange
    });
    for (let index = 0; index < 270; index += 1) {
      assert.strictEqual((await realWriter.saveRound(round(index))).saved, true);
    }
    await realWriter.saveRound(round(0, "midi"));
    await realWriter.saveRound(Object.assign(round(0, "chord"), {
      settings: { inputMode: "midi" }, exerciseType: "chord"
    }));
    assert.deepStrictEqual(ids((await realWriter.readHistoryWindow(
      "screen", 96, 150
    )).rounds), expectedIds(96, 150));
    assert.deepStrictEqual(ids((await realWriter.readHistoryWindow(
      "screen", 245, 275
    )).rounds), expectedIds(245, 270));
    assert.deepStrictEqual(ids((await realWriter.readHistoryWindow(
      "midi", 0, 10
    )).rounds), ["midi-0"]);
    assert.deepStrictEqual(ids((await realWriter.readHistoryWindow(
      "midi", 0, 10, "chord"
    )).rounds), ["chord-0"]);
    assert.strictEqual((await realWriter.readStatistics("screen")).statistics.roundCount, 270);
    await realWriter.close();
    const closed = await realWriter.readHistoryWindow("screen", 0, 1);
    assert.strictEqual(closed.saved, false);
    assert.deepStrictEqual(closed.rounds, []);
    process.stdout.write("Note Flow history windows: IndexedDB scheduling passed.\n");
  }
  process.stdout.write("Note Flow history windows: bounded reads, ordering, scopes and failures passed.\n");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
