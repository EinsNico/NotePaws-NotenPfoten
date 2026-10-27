const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpile(loadedModule, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(loadedModule, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return loadedModule._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

const databaseModel = loadEsModule(
  path.resolve(__dirname, "../src/model/LearningDatabasePrototype.js")
);
const storageModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowRoundStorage.js")
);
const rhythmStorageModel = loadEsModule(
  path.resolve(__dirname, "../src/model/RhythmSenseRoundStorage.js")
);
const resultModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowRoundResult.js")
);

function round(id, inputMode = "button", minute = 0) {
  return {
    id,
    resultVersion: 1,
    startedAt: `2026-09-22T10:0${minute}:00.000Z`,
    completedAt: `2026-09-22T10:0${minute}:30.000Z`,
    durationMs: 30000,
    score: { correct: 10, wrong: 1, missed: 2, accuracy: 77 },
    timing: { precise: 8, early: 1, late: 1 },
    settings: { inputMode }
  };
}

function test(name, body) {
  return Promise.resolve().then(body).then(() => {
    process.stdout.write(`\u2713 ${name}\n`);
  }, error => {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  });
}

async function run() {
  await test("keeps custom algorithm values in packed melody and chord round records", () => {
    for (const exerciseType of ["melody", "chord"]) {
      const algorithmSettings = exerciseType === "chord"
        ? { jumpFrequency: 77, jumpSize: 10, bassJumpFrequency: 64 }
        : { jumpFrequency: 77, jumpSize: 10, repetition: 64, noteDensity: 92 };
      const result = resultModel.createNoteFlowRoundResult({
        id: "custom-" + exerciseType, exerciseType,
        menuOptions: { inputMode: "midi", movement: "custom", algorithmSettings }
      });
      const blocks = databaseModel.packNoteFlowRoundsIntoBlocks([result], {
        scope: exerciseType === "chord" ? storageModel.NOTE_FLOW_SCOPE_CHORD_MIDI : storageModel.NOTE_FLOW_SCOPE_MIDI
      });
      const restored = databaseModel.expandNoteFlowRoundBlock(blocks[0])[0];
      assert.deepStrictEqual(restored.settings.algorithmSettings, algorithmSettings);
      assert.strictEqual(restored.settings.movement, "custom");
    }
  });
  await test("keeps melody rhythm settings in packed round records", () => {
    const result = resultModel.createNoteFlowRoundResult({
      id: "rhythm-round",
      menuOptions: {
        inputMode: "midi",
        rhythmMeter: "3/4",
        rhythmValues: {
          treble: ["quarter", "eighth"],
          bass: ["half", "quarter"]
        }
      }
    });
    const blocks = databaseModel.packNoteFlowRoundsIntoBlocks([result], {
      scope: storageModel.NOTE_FLOW_SCOPE_MIDI
    });
    const restored = databaseModel.expandNoteFlowRoundBlock(blocks[0])[0];
    assert.deepStrictEqual(restored.settings.rhythm, {
      meter: "3/4",
      noteDensity: 65,
      allowedValues: {
        treble: ["quarter", "eighth"],
        bass: ["half", "quarter"]
      }
    });
  });

  await test("packs many short rounds into bounded physical blocks", () => {
    const rounds = [round("round-1"), round("round-2"), round("round-3")];
    const blocks = databaseModel.packNoteFlowRoundsIntoBlocks(rounds, {
      scope: storageModel.NOTE_FLOW_SCOPE_SCREEN,
      blockSize: 2
    });
    assert.deepStrictEqual(blocks.map(block => block.count), [2, 1]);
    assert.deepStrictEqual(
      blocks.reduce((values, block) => values.concat(
        databaseModel.expandNoteFlowRoundBlock(block)
      ), []).map(value => value.id),
      ["round-1", "round-2", "round-3"]
    );
  });

  await test("serializes saving and loads recent rounds from the same database", async () => {
    const stored = [];
    const database = {
      recordNoteFlowRound(scope, result) {
        const duplicate = stored.some(value => value.result.id === result.id);
        if (!duplicate) stored.push({ scope, result });
        return Promise.resolve({ saved: true, duplicate });
      },
      readRecentNoteFlowRounds(scope, limit) {
        return Promise.resolve(stored
          .filter(value => value.scope === scope)
          .map(value => value.result)
          .reverse()
          .slice(0, limit));
      },
      readNoteFlowRoundsForExport(scope) {
        return Promise.resolve(stored
          .filter(value => value.scope === scope)
          .map(value => value.result));
      },
      readNoteFlowStatistics(scope) {
        const rounds = stored.filter(value => value.scope === scope);
        return Promise.resolve({
          scope,
          kind: "note-flow",
          roundCount: rounds.length
        });
      },
      close() {}
    };
    const writer = new storageModel.NoteFlowRoundWriter({
      openDatabase: () => database
    });
    const first = round("screen-round", "button", 1);
    const second = round("midi-round", "midi", 2);
    const chord = Object.assign(round("chord-round", "midi", 3), { exerciseType: "chord" });
    const results = await Promise.all([
      writer.saveRound(first),
      writer.saveRound(second),
      writer.saveRound(chord),
      writer.saveRound(first)
    ]);
    assert.strictEqual(results[0].scope, storageModel.NOTE_FLOW_SCOPE_SCREEN);
    assert.strictEqual(results[1].scope, storageModel.NOTE_FLOW_SCOPE_MIDI);
    assert.strictEqual(results[2].scope, storageModel.NOTE_FLOW_SCOPE_CHORD_MIDI);
    assert.strictEqual(results[3].duplicate, true);
    assert.strictEqual(stored.length, 3);

    const screen = await writer.readRecent("button", 10);
    const midi = await writer.readRecent("midi", 10);
    assert.deepStrictEqual(screen.rounds.map(value => value.id), ["screen-round"]);
    assert.deepStrictEqual(midi.rounds.map(value => value.id), ["midi-round"]);
    assert.deepStrictEqual(
      (await writer.readRecent("midi", 10, "chord")).rounds.map(value => value.id),
      ["chord-round"]
    );
    assert.deepStrictEqual(
      (await writer.readRoundsForExport("screen")).rounds.map(value => value.id),
      ["screen-round"]
    );
    assert.strictEqual((await writer.readStatistics("button")).statistics.roundCount, 1);
    assert.strictEqual((await writer.readStatistics("midi")).statistics.roundCount, 1);
    assert.strictEqual((await writer.readStatistics("midi", "chord")).statistics.roundCount, 1);
  });

  await test("keeps a failed write retryable with the same round id", async () => {
    let attempts = 0;
    const writer = new storageModel.NoteFlowRoundWriter({
      openDatabase: () => ({
        recordNoteFlowRound() {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error("storage unavailable"))
            : Promise.resolve({ saved: true, duplicate: false });
        }
      })
    });
    const result = round("retry-round");
    assert.strictEqual((await writer.saveRound(result)).saved, false);
    assert.strictEqual((await writer.saveRound(result)).saved, true);
    assert.strictEqual(attempts, 2);
  });

  await test("stores each rhythm bar in its own scope and reads it back", async () => {
    const records = [];
    const writer = new rhythmStorageModel.RhythmSenseRoundWriter({
      openDatabase: () => ({
        recordNoteFlowRound(scope, record) {
          records.push({ scope, record });
          return Promise.resolve({ duplicate: false });
        },
        readRecentNoteFlowRounds(scope) {
          return Promise.resolve(records.filter(item => item.scope === scope).map(item => item.record));
        },
        readNoteFlowStatistics(scope) {
          return Promise.resolve({ scope, roundCount: records.length });
        },
        readNoteFlowRoundsForExport(scope) {
          return Promise.resolve(records.filter(item => item.scope === scope).map(item => item.record));
        }
      })
    });
    const bar = { id: 'session:bar:1', completedAt: '2026-09-28T12:00:00.000Z' };
    assert.strictEqual((await writer.saveBar(bar)).saved, true);
    assert.strictEqual(records[0].scope, rhythmStorageModel.RHYTHM_SENSE_SCOPE);
    assert.deepStrictEqual((await writer.readRecent()).rounds, [bar]);
    assert.deepStrictEqual((await writer.readBarsForExport()).bars, [bar]);
    assert.strictEqual((await writer.readStatistics()).statistics.roundCount, 1);
    assert.strictEqual((await writer.saveBar({})).saved, false);
  });

  process.stdout.write("Note Flow round storage tests passed.\n");
}

run().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
