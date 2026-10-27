const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

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

const timer = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowRoundTimer.js")
);

test("counts a finite round down from its selected duration", () => {
  let state = timer.createNoteFlowRoundTimer(20);
  assert.strictEqual(timer.formatNoteFlowRoundTime(state), "0:20");
  state = timer.startNoteFlowRoundTimer(state, 1000);
  state = timer.advanceNoteFlowRoundTimer(state, 6500);
  assert.strictEqual(state.remainingMs, 14500);
  assert.strictEqual(state.elapsedMs, 5500);
  assert.strictEqual(timer.formatNoteFlowRoundTime(state), "0:15");
});

test("pauses without consuming background time and resumes precisely", () => {
  let state = timer.startNoteFlowRoundTimer(
    timer.createNoteFlowRoundTimer(60),
    1000
  );
  state = timer.pauseNoteFlowRoundTimer(state, 11000);
  assert.strictEqual(state.remainingMs, 50000);
  state = timer.advanceNoteFlowRoundTimer(state, 41000);
  assert.strictEqual(state.remainingMs, 50000);
  state = timer.startNoteFlowRoundTimer(state, 41000);
  state = timer.advanceNoteFlowRoundTimer(state, 46000);
  assert.strictEqual(state.remainingMs, 45000);
  assert.strictEqual(state.elapsedMs, 15000);
});

test("finishes exactly when the selected duration expires", () => {
  let state = timer.startNoteFlowRoundTimer(
    timer.createNoteFlowRoundTimer(20),
    0
  );
  state = timer.advanceNoteFlowRoundTimer(state, 20000);
  assert.strictEqual(state.status, "complete");
  assert.strictEqual(state.remainingMs, 0);
  assert.strictEqual(timer.formatNoteFlowRoundTime(state), "0:00");
});

test("keeps an unlimited round running without a countdown", () => {
  let state = timer.startNoteFlowRoundTimer(
    timer.createNoteFlowRoundTimer(0),
    500
  );
  state = timer.advanceNoteFlowRoundTimer(state, 500000);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.remainingMs, null);
  assert.strictEqual(state.elapsedMs, 499500);
  assert.strictEqual(timer.formatNoteFlowRoundTime(state), "∞");
});

test("allows a running round to be ended manually", () => {
  let state = timer.startNoteFlowRoundTimer(
    timer.createNoteFlowRoundTimer(300),
    0
  );
  state = timer.completeNoteFlowRoundTimer(state, 2500);
  assert.strictEqual(state.status, "complete");
  assert.strictEqual(state.remainingMs, 297500);
  assert.strictEqual(state.elapsedMs, 2500);
});

process.stdout.write("Note Flow round timer tests passed.\n");
