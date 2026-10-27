const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

const source = fs.readFileSync(path.join(
  __dirname, "../src/model/SaveDataImportNotice.js"
), "utf8");
const compiled = babel.transform(source, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const moduleUnderTest = { exports: {} };
new Function("module", "exports", compiled)(moduleUnderTest, moduleUnderTest.exports);
const { markSaveDataImportSuccess, takeSaveDataImportSuccess } = moduleUnderTest.exports;

const values = new Map();
const storage = {
  setItem(key, value) { values.set(key, value); },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  removeItem(key) { values.delete(key); }
};
assert.strictEqual(takeSaveDataImportSuccess(storage), false);
markSaveDataImportSuccess(storage);
assert.strictEqual(takeSaveDataImportSuccess(storage), true);
assert.strictEqual(takeSaveDataImportSuccess(storage), false);
assert.doesNotThrow(() => markSaveDataImportSuccess({ setItem() { throw new Error("quota"); } }));
const previousWindow = global.window;
const persistentValues = new Map();
global.window = {
  sessionStorage: { setItem() { throw new Error("blocked"); }, getItem() { return null; }, removeItem() {} },
  localStorage: {
    setItem(key, value) { persistentValues.set(key, value); },
    getItem(key) { return persistentValues.get(key) || null; },
    removeItem(key) { persistentValues.delete(key); }
  }
};
try {
  markSaveDataImportSuccess();
  assert.strictEqual(takeSaveDataImportSuccess(), true);
  assert.strictEqual(takeSaveDataImportSuccess(), false);
} finally {
  global.window = previousWindow;
}
console.log("Save-data import notice tests passed.");
