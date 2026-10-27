const assert = require("assert");
const fs = require("fs");
const babel = require("babel-core");
const path = require("path");
const compiled = babel.transform(fs.readFileSync(path.join(__dirname,
  "../src/model/StoredDataWarning.js"), "utf8"), {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { shouldShowStoredDataWarning: show, dismissStoredDataWarning: dismiss,
  STORED_DATA_WARNING_DISMISSED_KEY: key } = mod.exports;
const values = new Map();
const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
assert.strictEqual(show({ notes: 399999 }, storage), false);
assert.strictEqual(show({ notes: 300000, bars: 100000 }, storage), true);
assert.strictEqual(show({ notes: 304000, bars: 201000 }, storage), true);
// Okay doesn't modify preferences: next startup still warns.
assert.strictEqual(show({ notes: 500000 }, storage), true);
assert.strictEqual(values.has(key), false);
assert.strictEqual(dismiss(storage), true);
assert.strictEqual(show({ notes: 1000000 }, storage), false);
assert.throws(() => show({ notes: -1 }, { getItem: () => null }), /Invalid/);
const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
assert.strictEqual(show({ notes: 500000 }, unavailable), true);
assert.strictEqual(dismiss(unavailable), false);
const app = fs.readFileSync(path.join(__dirname, "../src/App.vue"), "utf8");
assert.ok(app.includes("largeDataNotice && !importSuccessNotice"));
assert.ok(app.includes("this.checkLargeDataWarning();"));
process.stdout.write("Stored data startup warning tests passed.\n");
