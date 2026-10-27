const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const source = fs.readFileSync(path.join(__dirname,
  "../src/components/SaveDataManager.vue"), "utf8");
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
let route;
let stagedFile;
const preview = { createdAt: "2026-09-28", screenEvaluations: 1 };
function stagingResult() {
  return { staging: {
    async readPreview() { return preview; },
    async clear() {},
    close() {}
  } };
}
const modules = {
  "../model/SaveDataFiles": {
    exceedsUnstreamedImportLimit: size => size > 12 * 1024 * 1024
  },
  "../model/SaveDataStreamReader": {
    async readNativeSelectedBackupText() {
      route = "text";
      return { text: "{}", size: 100 };
    }
  },
  "../model/SaveDataImportStaging": {
    async stageNativeSaveDataFile() { route = "stream"; return stagingResult(); },
    async stageBrowserSaveDataFile(file) {
      route = "browser-stream";
      stagedFile = file;
      return stagingResult();
    }
  }
};
const compiled = babel.transform(script, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const component = { exports: {} };
new Function("module", "exports", "require", compiled)(component,
  component.exports, name => modules[name] || {});
const manager = component.exports.default;
function instance() {
  const state = Object.assign(manager.data(), {
    $t: key => key,
    $emit() {},
    $refs: { details: { open: true } }
  });
  Object.keys(manager.methods).forEach(name => {
    state[name] = manager.methods[name].bind(state);
  });
  return state;
}
async function check(selected, expected) {
  route = null;
  const state = {
    isBusy: false, $t: key => key,
    clearMessages() {}, async cancelImport() {}, beginImportLoading() {},
    checkImportAborted() {}, async prepareLoadedBackup() {},
    async prepareStagedBackup(promise) { await promise; },
    getNativeStreamOpener() {
      return { openStream(type, resolve) { resolve(Object.assign({
        status: "selected", token: "test"
      }, selected)); }, readChunk() {}, closeStream() {} };
    }
  };
  await manager.methods.chooseBackupFile.call(state);
  assert.strictEqual(route, expected);
  assert.strictEqual(state.isBusy, false);
  assert.strictEqual(state.errorMessage, undefined);
}
(async () => {
  await check({ size: 0 }, "stream");
  await check({ size: 100, sizeVerified: false }, "stream");
  await check({ size: 100 }, "stream");
  await check({ size: -1, sizeVerified: false }, "stream");
  await check({ size: 151000000, sizeVerified: true }, "stream");
  await check({ size: 100, sizeVerified: true }, "stream");
  assert.ok(!source.includes("createIndexedDbSaveDataBackup"));
  for (const size of [100, 151000000]) {
    const browser = instance();
    const file = { size };
    await browser.loadBackupFile({ target: { files: [file] } });
    assert.strictEqual(route, "browser-stream");
    assert.strictEqual(stagedFile, file);
    assert.strictEqual(browser.stagedPreview, preview);
    assert.ok(browser.stagedImport);
    assert.strictEqual(browser.isBusy, false);
    assert.strictEqual(browser.importLoading, false);
    await browser.cancelImport();
    assert.strictEqual(browser.stagedPreview, null);
    assert.strictEqual(browser.stagedImport, null);
  }

  // Older native pickers return verified, bounded text. They also reach the
  // active staging preview rather than a separate in-memory import screen.
  const nativeText = instance();
  nativeText.getNativeStreamOpener = () => null;
  nativeText.getNativeFileOpener = () => ({
    open(type, resolve) {
      assert.strictEqual(type, "application/json");
      resolve({ status: "selected", content: "{}", size: 2, sizeVerified: true });
    }
  });
  await nativeText.chooseBackupFile();
  assert.strictEqual(route, "browser-stream");
  assert.ok(stagedFile instanceof Blob);
  assert.strictEqual(await stagedFile.text(), "{}");
  assert.strictEqual(nativeText.stagedPreview, preview);
  assert.strictEqual(nativeText.isBusy, false);
  await nativeText.cancelImport();

  const oversizedText = instance();
  route = null;
  await oversizedText.prepareLoadedBackup("{}", 13 * 1024 * 1024);
  assert.strictEqual(route, null);
  assert.strictEqual(oversizedText.stagedPreview, null);
  assert.strictEqual(oversizedText.errorMessage, "SAVE_DATA_ERROR_TOO_LARGE");
  process.stdout.write("Native backup import routing tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
