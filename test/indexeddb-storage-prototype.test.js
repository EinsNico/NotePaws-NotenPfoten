const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
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

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const prototype = loadEsModule(
  path.resolve(__dirname, "../src/model/LearningDatabasePrototype.js")
);
const prestigeEligibility = loadEsModule(
  path.resolve(__dirname, "../src/model/PrestigeEligibility.js")
);

function attempts(count, sessionLength = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `attempt-${index}`,
    sessionId: `session-${Math.floor(index / sessionLength)}`,
    scope: "screen:single-notes",
    noteKey: `treble:${60 + index % 7}:natural`,
    completedAt: 1789550000000 + index,
    correctFirstTry: index % 4 !== 0,
    mistakeCount: index % 4 === 0 ? 1 : 0,
    responseTimeMs: 500 + index
  }));
}

test("uses safe defaults and accepts explicit physical block limits", () => {
  assert.deepStrictEqual(prototype.normalizeAttemptBlockPolicy(), {
    maxAttempts: 250,
    maxBytes: 65536
  });
  assert.deepStrictEqual(prototype.normalizeAttemptBlockPolicy({
    maxAttempts: 100,
    maxBytes: 32768
  }), {
    maxAttempts: 100,
    maxBytes: 32768
  });
});

test("keeps physical blocks independent from many one-answer sessions", () => {
  const blocks = prototype.packAttemptsIntoBlocks(attempts(100), {
    scope: "screen:single-notes",
    maxAttempts: 25,
    maxBytes: 1024 * 1024
  });
  assert.strictEqual(blocks.length, 4);
  assert.deepStrictEqual(blocks.map(block => block.count), [25, 25, 25, 25]);
  assert.strictEqual(new Set(
    blocks.reduce((result, block) => result.concat(
      prototype.expandAttemptBlock(block).map(attempt => attempt.sessionId)
    ), [])
  ).size, 100);
});

test("preserves session attribution and a continuous sequence across blocks", () => {
  const blocks = prototype.packAttemptsIntoBlocks(attempts(23, 5), {
    maxAttempts: 10,
    maxBytes: 1024 * 1024
  });
  assert.deepStrictEqual(blocks.map(block => block.count), [10, 10, 3]);
  const flattened = blocks.reduce((result, block) => result.concat(
    prototype.expandAttemptBlock(block)
  ), []);
  assert.deepStrictEqual(flattened.map(attempt => attempt.sequence),
    Array.from({ length: 23 }, (_, index) => index));
  assert.deepStrictEqual(flattened.map(attempt => attempt.id),
    Array.from({ length: 23 }, (_, index) => `attempt-${index}`));
  assert(flattened.every(attempt => attempt.staff === "treble"));
  assert.deepStrictEqual(flattened.slice(0, 6).map(attempt => attempt.sessionId), [
    "session-0", "session-0", "session-0", "session-0", "session-0", "session-1"
  ]);
});

test("preserves an intentionally missing response time", () => {
  const source = attempts(1);
  source[0].responseTimeMs = null;
  const block = prototype.packAttemptsIntoBlocks(source)[0];
  assert.strictEqual(prototype.expandAttemptBlock(block)[0].responseTimeMs, null);
});

test("preserves imported prestige provenance in compact notes and round records", () => {
  const earned = attempts(1)[0];
  const imported = prestigeEligibility.markImportedForPrestige(
    Object.assign({}, attempts(1)[0], { id: "imported-note" })
  );
  assert.strictEqual(prestigeEligibility.isPrestigeEligible(earned), true);
  assert.strictEqual(prestigeEligibility.isPrestigeEligible(imported), false);
  assert.strictEqual(earned.prestigeEligible, undefined);
  const noteBlocks = prototype.packAttemptsIntoBlocks([earned, imported]);
  const stored = noteBlocks.flatMap(prototype.expandAttemptBlock);
  assert.strictEqual(noteBlocks[0].attempts[0].length, 9);
  assert.strictEqual(noteBlocks[0].attempts[1][9], 0);
  assert.strictEqual(prestigeEligibility.isPrestigeEligible(stored[0]), true);
  assert.strictEqual(prestigeEligibility.isPrestigeEligible(stored[1]), false);
  const round = { id: "imported-round", completedAt: "2026-09-30T12:00:00.000Z" };
  const importedRound = prestigeEligibility.markImportedForPrestige(round);
  const roundBlock = prototype.packNoteFlowRoundsIntoBlocks([importedRound])[0];
  assert.strictEqual(prestigeEligibility.isPrestigeEligible(
    prototype.expandNoteFlowRoundBlock(roundBlock)[0]
  ), false);
  assert.strictEqual(round.prestigeEligible, undefined);
  assert.throws(() => prestigeEligibility.isPrestigeEligible({ prestigeEligible: "false" }),
    /Invalid prestige eligibility marker/);
});

test("closes a block at the byte limit even before the count limit", () => {
  const source = attempts(2);
  const singleBlock = prototype.packAttemptsIntoBlocks(source.slice(0, 1), {
    maxAttempts: 100,
    maxBytes: 1024 * 1024
  })[0];
  const blocks = prototype.packAttemptsIntoBlocks(source, {
    maxAttempts: 100,
    maxBytes: singleBlock.payloadBytes
  });
  assert.strictEqual(blocks.length, 2);
  assert.deepStrictEqual(blocks.map(block => block.count), [1, 1]);
});

test("defines the isolated learning and Note Flow stores", () => {
  assert.deepStrictEqual(Object.keys(prototype.LEARNING_DATABASE_STORES).sort(), [
    "activeSessions",
    "attemptBlocks",
    "meta",
    "noteFlowRoundBlocks",
    "progress",
    "sessionBlocks",
    "statistics",
    "timeBuckets",
    "trendBlocks"
  ]);
});

process.stdout.write("IndexedDB storage prototype model tests passed.\n");
