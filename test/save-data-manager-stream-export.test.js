const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const source = fs.readFileSync(path.resolve(
  __dirname, "../src/components/SaveDataManager.vue"
), "utf8");
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const calls = [];
let shouldFail = false;
let shouldCancel = false;
let completion = { status: "saved", verified: true, bytesWritten: 11 };
let finishError = null;
const modules = {
  "../model/PersistenceFeedback": { hasPersistenceFailure: () => false },
  "../model/SaveDataFiles": {
    createSaveDataFilename: () => "backup.json",
    streamIndexedDbSaveDataBackup: async (write, storage, options) => {
      calls.push("stream");
      await write("{\"part\":1}");
      await write("\n");
      options.onProgress({ phase: "finalizing", bytesWritten: 11, recordCount: 1 });
      return { filename: "backup.json", bytesWritten: 11, counts: { notes: 1 } };
    },
    createIndexedDbSaveDataExport: () => { throw new Error("Old export used."); }
  }
};
const compiled = babel.transform(script, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const component = { exports: {} };
new Function("module", "exports", "require", compiled)(
  component, component.exports, name => modules[name] || {}
);
const manager = component.exports.default;
const previousWindow = global.window;
const previousStorage = global.localStorage;
global.localStorage = {};
const writer = {
  save() {},
  openWriteStream(filename, mime, success) {
    calls.push(`open:${filename}:${mime}`);
    success(shouldCancel ? { status: "cancelled" }
      : { status: "selected", token: "write-token" });
  },
  writeChunk(token, chunk, success, error) {
    calls.push(`write:${token}:${chunk}`);
    if (shouldFail) error(new Error("write failed"));
    else success({ status: "written" });
  },
  finishWriteStream(token, expectedBytes, success, error) {
    assert.strictEqual(expectedBytes, 11);
    calls.push(`finish:${token}`);
    if (finishError) error(finishError);
    else success(completion);
  },
  abortWriteStream(token, success) {
    calls.push(`abort:${token}`);
    success({ status: "aborted" });
  }
};
global.window = { cordova: { plugins: { saveDataFile: writer } } };

function instance() {
  const state = Object.assign(manager.data(), {
    $emit: name => calls.push(`emit:${name}`),
    $t: key => key
  });
  Object.keys(manager.methods).forEach(name => {
    state[name] = manager.methods[name].bind(state);
  });
  return state;
}

(async () => {
  try {
    const success = instance();
    await success.exportBackup();
    assert.deepStrictEqual(calls, [
      "emit:before-storage-action", "open:backup.json:application/json",
      "stream", "write:write-token:{\"part\":1}",
      "write:write-token:\n", "finish:write-token"
    ]);
    assert.strictEqual(success.statusMessage, "SAVE_DATA_EXPORT_READY");
    assert.strictEqual(success.isBusy, false);
    assert.strictEqual(success.exportLoading, false);
    assert.strictEqual(success.exportResult.recordCount, 1);
    assert.strictEqual(success.exportResult.bytesWritten, 11);

    calls.length = 0;
    shouldCancel = true;
    const cancelled = instance();
    await cancelled.exportBackup();
    assert.deepStrictEqual(calls, [
      "emit:before-storage-action", "open:backup.json:application/json"
    ]);
    assert.strictEqual(cancelled.statusMessage, "");

    calls.length = 0;
    shouldCancel = false;
    shouldFail = true;
    const failed = instance();
    await failed.exportBackup();
    assert.deepStrictEqual(calls, [
      "emit:before-storage-action", "open:backup.json:application/json",
      "stream", "write:write-token:{\"part\":1}", "abort:write-token"
    ]);
    assert.strictEqual(failed.errorMessage, "SAVE_DATA_EXPORT_ERROR");
    assert.strictEqual(failed.isBusy, false);

    calls.length = 0;
    shouldFail = false;
    global.window = { cordova: { plugins: { saveDataFile: { save() {} } } } };
    const unavailable = instance();
    await unavailable.exportBackup();
    assert.deepStrictEqual(calls, ["emit:before-storage-action"]);
    assert.strictEqual(unavailable.statusMessage, "");
    assert.strictEqual(unavailable.errorMessage, "SAVE_DATA_EXPORT_ERROR");

    global.window = { cordova: { plugins: { saveDataFile: writer } } };
    for (const invalid of [
      { status: "saved", bytesWritten: 11 },
      { status: "saved", verified: true, bytesWritten: 10 }
    ]) {
      completion = invalid;
      const unchecked = instance();
      await unchecked.exportBackup();
      assert.strictEqual(unchecked.statusMessage, "");
      assert.strictEqual(unchecked.exportResult, null);
      assert.strictEqual(unchecked.errorMessage, "SAVE_DATA_EXPORT_ERROR");
      assert.strictEqual(unchecked.exportLoading, false);
    }
    finishError = "backup-file-verification-failed";
    const unverified = instance();
    await unverified.exportBackup();
    assert.strictEqual(unverified.errorMessage, "SAVE_DATA_EXPORT_VERIFICATION_ERROR");
    assert.strictEqual(unverified.exportResult, null);
    process.stdout.write("Android streamed export UI tests passed.\n");
  } finally {
    global.window = previousWindow;
    global.localStorage = previousStorage;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
