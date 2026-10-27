const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
const prepare = require("../cordova/scripts/prepare-android-screen-awake.js");
const sourceRoot = path.resolve(__dirname, "../cordova/local-plugins/noten-pfoten-screen-awake");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "noten-screen-awake-"));
const relative = "plugins/de.nico.notenpfoten.screenawake/www/screen-awake.js";
const nativeRelative = "platforms/android/app/src/main/java/de/nico/notenpfoten/screen/ScreenAwakePlugin.java";
try {
  const local = path.join(root, "local-plugins/noten-pfoten-screen-awake");
  fs.cpSync(sourceRoot, local, { recursive: true });
  const destinations = ["platform_www", "app/src/main/assets/www"].map(base => path.join(root, "platforms/android", base, relative));
  for (const file of destinations.concat(path.join(root, nativeRelative))) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "stale plugin");
  }
  prepare({ opts: { projectRoot: root, platforms: ["android"] } });
  const first = fs.readFileSync(destinations[0], "utf8");
  prepare({ opts: { projectRoot: root, platforms: ["android"] } });
  assert.strictEqual(fs.readFileSync(destinations[0], "utf8"), first);
  assert.strictEqual(fs.readFileSync(destinations[1], "utf8"), first);
  assert.strictEqual(fs.readFileSync(path.join(root, nativeRelative), "utf8"),
    fs.readFileSync(path.join(local, "src/android/ScreenAwakePlugin.java"), "utf8"));
  let id, factory;
  vm.runInNewContext(first, { cordova: { define(moduleId, implementation) { id = moduleId; factory = implementation; } } });
  assert.strictEqual(id, "de.nico.notenpfoten.screenawake.NotenPfotenScreenAwake");
  const calls = [], module = { exports: {} };
  factory(() => (...args) => calls.push(args), module.exports, module);
  const success = () => {}, error = () => {};
  module.exports.setEnabled(true, success, error);
  assert.deepStrictEqual(calls[0].slice(0, 4), [success, error, "NotenPfotenScreenAwake", "setEnabled"]);
  assert.deepStrictEqual(Array.from(calls[0][4]), [true]);
  module.exports.setEnabled("true", success, error);
  assert.deepStrictEqual(Array.from(calls[1][4]), [false]);
  const xml = fs.readFileSync(path.join(local, "plugin.xml"), "utf8");
  assert(!/uses-permission|WAKE_LOCK/.test(xml));
  const java = fs.readFileSync(path.join(local, "src/android/ScreenAwakePlugin.java"), "utf8");
  assert(java.includes("FLAG_KEEP_SCREEN_ON"));
  for (const lifecycle of ["onPause", "onReset", "onDestroy"]) assert(new RegExp(lifecycle + "[^\\n]+clear\\(\\)").test(java));
  fs.unlinkSync(destinations[0]);
  assert.doesNotThrow(() => prepare({ opts: { projectRoot: root, platforms: ["ios"] } }));
  assert.throws(() => prepare({ opts: { projectRoot: root, platforms: ["android"] } }), /plugin missing/);
  process.stdout.write("Android screen-awake bridge and idempotent prepare tests passed.\n");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
