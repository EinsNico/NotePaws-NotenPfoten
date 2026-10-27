const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const prepare = require("../cordova/scripts/prepare-android-save-data-plugin.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "noten-save-plugin-"));
const pluginFile = "plugins/de.nico.notenpfoten.savedatafile/www/save-data-file.js";
const source = path.join(root, "local-plugins/noten-pfoten-save-data-file/www/save-data-file.js");
const nativeSource = path.join(root, "local-plugins/noten-pfoten-save-data-file/src/android/SaveDataFilePlugin.java");
const nativeDestination = path.join(root, "platforms/android/app/src/main/java/de/nico/notenpfoten/savedata/SaveDataFilePlugin.java");
const destinations = [
  path.join(root, "platforms/android/platform_www", pluginFile),
  path.join(root, "platforms/android/app/src/main/assets/www", pluginFile)
];
try {
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "module.exports = { openWriteStream: function() { return 'ready'; } };");
  fs.mkdirSync(path.dirname(nativeSource), { recursive: true });
  fs.mkdirSync(path.dirname(nativeDestination), { recursive: true });
  fs.writeFileSync(nativeSource, "current native bridge");
  fs.writeFileSync(path.join(path.dirname(nativeSource), "BackupFileSizeVerifier.java"), "current verifier");
  fs.writeFileSync(nativeDestination, "old native bridge");
  for (const destination of destinations) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "stale bridge");
  }
  prepare({ opts: { projectRoot: root, platforms: ["android"] } });
  assert.strictEqual(fs.readFileSync(nativeDestination, "utf8"), "current native bridge");
  assert.strictEqual(fs.readFileSync(path.join(path.dirname(nativeDestination),
    "BackupFileSizeVerifier.java"), "utf8"), "current verifier");
  const packaged = fs.readFileSync(destinations[0], "utf8");
  for (const destination of destinations) {
    assert.strictEqual(fs.readFileSync(destination, "utf8"), packaged);
  }
  let registeredId;
  let registeredFactory;
  vm.runInNewContext(packaged, {
    cordova: { define(id, factory) {
      registeredId = id;
      registeredFactory = factory;
    } }
  });
  assert.strictEqual(registeredId,
    "de.nico.notenpfoten.savedatafile.NotenPfotenSaveDataFile");
  assert.strictEqual(typeof registeredFactory, "function");
  const plugin = { exports: {} };
  registeredFactory(() => {}, plugin.exports, plugin);
  assert.strictEqual(plugin.exports.openWriteStream(), "ready");
  fs.unlinkSync(destinations[0]);
  assert.throws(() => prepare({ opts: { projectRoot: root, platforms: ["android"] } }),
    /plugin asset is missing/);
  process.stdout.write("Android save-data plugin packaging tests passed.\n");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
