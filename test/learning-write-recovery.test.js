const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const parser = require(require.resolve("babylon", {
  paths: [path.dirname(require.resolve("babel-core"))]
}));

global.regeneratorRuntime = require("babel-runtime/regenerator");
const root = path.resolve(__dirname, "..");
const oracle = require("./fixtures/cleanup-original-functions.json");
assert.strictEqual(oracle.schemaVersion, 1);
const name = "recoverPendingLearningWrites";
function load(source) {
  const mod = new Module(__filename, module);
  mod.paths = module.paths;
  mod._compile(babel.transform(source + `\nmodule.exports = ${name};`, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, __filename);
  return mod.exports;
}
const current = load(fs.readFileSync(path.join(root, "src/model/LearningWriteRecovery.js"), "utf8"));
const originals = ["SaveDataFiles", "SaveDataImport"].map(file => {
  const relative = `src/model/${file}.js`;
  const fixture = oracle.originals[relative].functions[name];
  const source = fixture.source;
  assert.strictEqual(crypto.createHash("sha256").update(source).digest("hex"), fixture.sha256);
  const ast = parser.parse(source, { sourceType: "module" });
  const node = ast.program.body[0];
  assert.strictEqual(ast.program.body.length, 1);
  assert.strictEqual(node.type, "FunctionDeclaration");
  assert.strictEqual(node.id.name, name);
  assert.strictEqual(crypto.createHash("sha256").update(source.slice(node.body.start, node.body.end)).digest("hex"), fixture.bodySha256);
  return [file, load(source)];
});

const sentinel = new Error("original failure object");
const statusFailure = { reason: "status object identity" };
const scenarios = [
  { name: "missing getStatus", getStatus: undefined },
  { name: "nonfunction getStatus", getStatus: 7 },
  { name: "zero failures", failures: 0 },
  { name: "zero failures delayed flush", failures: 0, delayedFlush: true },
  { name: "successful retry", failures: 2 },
  { name: "delayed flush and retry", failures: 1, delayedFlush: true, delayedRetry: true },
  { name: "status is checked after flush", failures: 2, failuresAfterFlush: 0 },
  { name: "getStatus getter", failures: 1, statusGetter: true },
  { name: "strict zero string", failures: "0" },
  { name: "missing failedWrites", failures: undefined },
  { name: "NaN failedWrites", failures: NaN },
  { name: "flush throws", failures: 1, flushThrows: sentinel, identity: sentinel },
  { name: "flush rejects", failures: 1, flushRejects: sentinel, identity: sentinel },
  { name: "status throws", statusThrows: statusFailure, identity: statusFailure },
  { name: "null status", status: null },
  { name: "undefined status", status: undefined },
  { name: "retry throws", failures: 1, retryThrows: sentinel, identity: sentinel },
  { name: "retry rejects", failures: 1, retryRejects: sentinel, identity: sentinel },
  { name: "retry not saved with error", failures: 1, retry: { saved: false, failedWrites: 0, error: sentinel }, identity: sentinel },
  { name: "retry residual failures with error", failures: 1, retry: { saved: true, failedWrites: 1, error: sentinel }, identity: sentinel },
  { name: "retry string error identity", failures: 1, retry: { saved: false, error: "literal error" }, identity: "literal error" },
  { name: "retry unsaved fallback", failures: 1, retry: { saved: false, failedWrites: 0 } },
  { name: "retry residual fallback", failures: 1, retry: { saved: true, failedWrites: 1 } },
  { name: "retry falsy error fallback", failures: 1, retry: { saved: false, error: false } },
  { name: "retry zero ignores error", failures: 1, retry: { saved: true, failedWrites: 0, error: sentinel } },
  { name: "retry missing failedWrites", failures: 1, retry: { saved: true } },
  { name: "retry null result", failures: 1, retry: null },
  { name: "retry undefined result", failures: 1, retry: undefined },
  { name: "retry getter order", failures: 1, retryGetters: true },
  { name: "retry saved getter throws", failures: 1, retrySavedThrows: sentinel, identity: sentinel }
];
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

async function run(fn, scenario) {
  const trace = [];
  let failures = scenario.failures;
  let releaseFlush;
  let releaseRetry;
  const flushGate = new Promise(resolve => { releaseFlush = resolve; });
  const retryGate = new Promise(resolve => { releaseRetry = resolve; });
  const storage = {
    flush() {
      assert.strictEqual(this, storage);
      trace.push("flush:start");
      if (owns(scenario, "flushThrows")) throw scenario.flushThrows;
      if (owns(scenario, "flushRejects")) return Promise.reject(scenario.flushRejects);
      const finish = () => {
        if (owns(scenario, "failuresAfterFlush")) failures = scenario.failuresAfterFlush;
        trace.push("flush:end");
      };
      return scenario.delayedFlush ? flushGate.then(finish) : finish();
    },
    getStatus() {
      assert.strictEqual(this, storage);
      trace.push("status");
      if (owns(scenario, "statusThrows")) throw scenario.statusThrows;
      return owns(scenario, "status") ? scenario.status : { failedWrites: failures };
    },
    retryFailedWrites() {
      assert.strictEqual(this, storage);
      trace.push("retry:start");
      if (owns(scenario, "retryThrows")) throw scenario.retryThrows;
      if (owns(scenario, "retryRejects")) return Promise.reject(scenario.retryRejects);
      const finish = () => {
        trace.push("retry:end");
        if (scenario.retryGetters || owns(scenario, "retrySavedThrows")) {
          return {
            get saved() { trace.push("retry:saved"); if (owns(scenario, "retrySavedThrows")) throw scenario.retrySavedThrows; return true; },
            get failedWrites() { trace.push("retry:failedWrites"); return 0; },
            get error() { trace.push("retry:error"); throw new Error("Successful retry must not inspect error"); }
          };
        }
        return owns(scenario, "retry") ? scenario.retry : { saved: true, failedWrites: 0 };
      };
      return scenario.delayedRetry ? retryGate.then(finish) : finish();
    }
  };
  if (owns(scenario, "getStatus")) storage.getStatus = scenario.getStatus;
  if (scenario.statusGetter) {
    const getter = storage.getStatus;
    Object.defineProperty(storage, "getStatus", { get() { trace.push("getStatus:getter"); return getter; } });
  }
  const pending = fn(storage).then(value => {
    trace.push("resolved"); return { value };
  }, error => { trace.push("rejected"); return { error }; });
  trace.push("caller:after-call");
  await new Promise(resolve => setImmediate(resolve));
  if (scenario.delayedFlush) {
    assert.deepStrictEqual(trace, ["flush:start", "caller:after-call"], scenario.name + " no early status/retry");
    trace.push("caller:release-flush"); releaseFlush();
  }
  await new Promise(resolve => setImmediate(resolve));
  if (scenario.delayedRetry) {
    assert(trace.includes("status") && trace.includes("retry:start"));
    assert(!trace.includes("resolved") && !trace.includes("retry:end"));
    trace.push("caller:release-retry"); releaseRetry();
  }
  const result = await pending;
  return { trace, result };
}

(async () => {
  for (const [file, baseline] of originals) {
    for (const scenario of scenarios) {
      const before = await run(baseline, scenario);
      const after = await run(current, scenario);
      const label = `${file}: ${scenario.name}`;
      assert.deepStrictEqual(after.trace, before.trace, label + " exact async/access/call order");
      assert.strictEqual(owns(after.result, "error"), owns(before.result, "error"), label + " rejection");
      assert.strictEqual(after.result.value, before.result.value, label + " resolution");
      if (owns(scenario, "identity")) {
        assert.strictEqual(before.result.error, scenario.identity, label + " original error identity");
        assert.strictEqual(after.result.error, scenario.identity, label + " current error identity");
      } else if (owns(before.result, "error")) {
        assert.strictEqual(after.result.error.name, before.result.error.name, label + " error type");
        assert.strictEqual(after.result.error.message, before.result.error.message, label + " exact message");
        if (scenario.name.includes("fallback")) {
          assert(after.result.error instanceof Error);
          assert.strictEqual(after.result.error.message, "Pending learning data could not be saved.");
        }
      }
    }
    process.stdout.write(`✓ ${file}: ${scenarios.length} async recovery cases match the hash-verified original body\n`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
