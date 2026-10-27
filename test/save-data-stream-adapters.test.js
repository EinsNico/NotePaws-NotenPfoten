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
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return mod._compile(transformed.code, filename);
};
const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const {
  readNativeSaveDataStream,
  readBrowserSaveDataStream,
  readNativeSelectedBackupText
} = require("../src/model/SaveDataStreamReader.js");
Module._extensions[".js"] = originalLoader;

const storage = { length: 0, key: () => null, getItem: () => null };
const backup = createSaveDataBackup(storage, { createdAt: "2026-09-28T12:00:00.000Z" });
backup.version = 4;
backup.data.adaptiveHistory = {
  version: 1, baselines: [], evaluations: [{ id: "note-ü", text: "für Anfänger" }]
};
backup.data.rhythmSenseBars = [{ id: "bar-1", notes: [] }];
const bytes = Buffer.from(JSON.stringify(backup), "utf8");

function makePlugin(buffer, failRead = false) {
  let offset = 0;
  const plugin = {
    closed: false,
    openStream(mime, success) {
      assert.strictEqual(mime, "application/json");
      success({ status: "selected", token: "test-token", size: buffer.length });
    },
    readChunk(token, success, error) {
      assert.strictEqual(token, "test-token");
      if (failRead) {
        error("read-error");
        return;
      }
      const part = buffer.subarray(offset, offset + 11);
      offset += part.length;
      success({
        status: "chunk", token, data: part.toString("base64"),
        done: part.length === 0
      });
    },
    closeStream(token, success) {
      assert.strictEqual(token, "test-token");
      plugin.closed = true;
      success({ status: "closed" });
    }
  };
  return plugin;
}

(async () => {
  const nativeItems = [];
  const nativeProgress = [];
  const plugin = makePlugin(bytes);
  const native = await readNativeSaveDataStream(plugin,
    (section, item) => nativeItems.push({ section, item }), {
      onProgress: (loaded, total) => nativeProgress.push({ loaded, total })
    });
  assert.strictEqual(native.size, bytes.length);
  assert.deepStrictEqual(nativeProgress[nativeProgress.length - 1], {
    loaded: bytes.length, total: bytes.length
  });
  assert.strictEqual(nativeItems.length, 2);
  assert.strictEqual(nativeItems[0].item.id, "note-ü");
  assert.strictEqual(plugin.closed, false); // Native closes at EOF.
  for (const size of [-1, 0, 10]) {
    const stale = makePlugin(bytes);
    stale.openStream = (mime, success) => success({
      status: "selected", token: "test-token", size
    });
    const result = await readNativeSaveDataStream(stale, () => {});
    assert.strictEqual(result.size, bytes.length);
  }

  const smallPlugin = makePlugin(bytes);
  const selected = await new Promise((resolve, reject) => {
    smallPlugin.openStream("application/json", resolve, reject);
  });
  const small = await readNativeSelectedBackupText(smallPlugin, selected);
  assert.strictEqual(small.text, bytes.toString("utf8"));
  assert.strictEqual(small.size, bytes.length);
  assert.strictEqual(smallPlugin.closed, false);

  const cancelledPlugin = makePlugin(bytes);
  await assert.rejects(readNativeSelectedBackupText(cancelledPlugin, selected, {
    shouldContinue: () => false
  }), error => error && error.name === "AbortError");
  assert.strictEqual(cancelledPlugin.closed, true);

  const browserItems = [];
  const browserProgress = [];
  const browser = await readBrowserSaveDataStream(new Blob([bytes]),
    (section, item) => browserItems.push({ section, item }), {
      onProgress: (loaded, total) => browserProgress.push({ loaded, total })
    });
  assert.strictEqual(browser.size, bytes.length);
  assert.deepStrictEqual(browserProgress[browserProgress.length - 1], {
    loaded: bytes.length, total: bytes.length
  });
  assert.deepStrictEqual(browserItems, nativeItems);

  const failedPlugin = makePlugin(bytes, true);
  await assert.rejects(readNativeSaveDataStream(failedPlugin, () => {}));
  assert.strictEqual(failedPlugin.closed, true);
  const failedSmallPlugin = makePlugin(bytes, true);
  await assert.rejects(readNativeSelectedBackupText(failedSmallPlugin, {
    status: "selected", token: "test-token", size: bytes.length
  }));
  assert.strictEqual(failedSmallPlugin.closed, true);
  process.stdout.write("Save-data stream adapter tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
