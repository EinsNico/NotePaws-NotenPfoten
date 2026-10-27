const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const values = new Map();
global.localStorage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] || null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
let Options;
let AdaptiveOptions;
let preparation;
try {
  Options = require("../src/model/Options").default;
  AdaptiveOptions = require("../src/model/AdaptiveOptions").default;
  preparation = require("../src/model/PracticePreparation");
}
finally { Module._extensions[".js"] = originalLoader; }
const Lockr = require("lockr");
const clone = value => JSON.parse(JSON.stringify(value));

Options.loadOptions();
assert.strictEqual(Options.keepScreenAwake, true, "new installations keep active practice awake");
assert.strictEqual(Options.sound, true, "new installations enable app sound by default");
assert.strictEqual(Options.preparationSeconds, 3, "new installations use a three-second visual lead-in");
for (const seconds of [0, 3, 5]) {
  assert.strictEqual(preparation.normalizePreparationSeconds(seconds), seconds);
  assert.strictEqual(preparation.normalizePreparationSeconds(String(seconds)), seconds);
}
for (const value of [undefined, null, true, false, "", "4", 4, -1, 10, {}, [], NaN]) {
  assert.strictEqual(preparation.normalizePreparationSeconds(value), 3, "invalid preparation values return the default");
}
Options.sound = true;
Options.keepScreenAwake = false;
Options.preparationSeconds = 5;
Options.saveOptions();
const chosen = clone(Lockr.get("options"));
assert.strictEqual(chosen.sound, true);
assert.strictEqual(chosen.keepScreenAwake, false);
assert.strictEqual(chosen.preparationSeconds, 5);
Options.sound = false;
Options.keepScreenAwake = true;
Options.preparationSeconds = 0;
Options.loadOptions();
assert.strictEqual(Options.sound, true, "global sound choice survives restart");
assert.strictEqual(Options.keepScreenAwake, false, "screen choice survives restart");
assert.strictEqual(Options.preparationSeconds, 5, "preparation choice survives restart");

const legacy = clone(chosen);
delete legacy.sound;
delete legacy.keepScreenAwake;
delete legacy.preparationSeconds;
Lockr.set("options", legacy);
Options.sound = false;
Options.keepScreenAwake = false;
Options.preparationSeconds = 0;
Options.loadOptions();
assert.strictEqual(Options.sound, true, "older backups without sound restore the default instead of a previous mute");
assert.strictEqual(Lockr.get("options").sound, true, "legacy sound default is persisted");
assert.strictEqual(Options.keepScreenAwake, true, "older restored backups do not inherit the previous session");
assert.strictEqual(Lockr.get("options").keepScreenAwake, true, "legacy default is persisted");
assert.strictEqual(Options.preparationSeconds, 3, "older backups restore the preparation default instead of a previous choice");
assert.strictEqual(Lockr.get("options").preparationSeconds, 3, "legacy preparation default is persisted");
for (const key of Object.keys(chosen).filter(key => key !== "keepScreenAwake" && key !== "preparationSeconds")) {
  assert.deepStrictEqual(Lockr.get("options")[key], chosen[key], key + " is preserved by screen migration");
}

Options.sound = false;
Options.keepScreenAwake = false;
Options.preparationSeconds = 0;
Options.saveOptions();
Options.sound = true;
Options.keepScreenAwake = true;
Options.preparationSeconds = 5;
Options.loadOptions();
assert.strictEqual(Options.sound, false, "stored mute survives reload");
assert.strictEqual(Options.keepScreenAwake, false, "explicit opt-out is not mistaken for a missing default");
assert.strictEqual(Options.preparationSeconds, 0, "immediate start is not mistaken for a missing default");
for (const invalid of ["invalid", true, 8, null]) {
  Lockr.set("options", Object.assign({}, chosen, { preparationSeconds: invalid }));
  Options.loadOptions();
  assert.strictEqual(Options.preparationSeconds, 3, "invalid stored lead-in is repaired");
  assert.strictEqual(Lockr.get("options").preparationSeconds, 3, "repair is persisted");
}
Options.preparationSeconds = "5";
Options.saveOptions();
assert.strictEqual(Lockr.get("options").preparationSeconds, 5, "UI string values are saved as numbers");
for (const [key, model] of [["options", Options], ["adaptiveOptions", AdaptiveOptions]]) {
  const saved = Object.assign({}, chosen, {
    clef: ["piano"], customMinValue: 36, customBassMaxValue: 55,
    customTrebleMinValue: 60, customMaxValue: 81, rangeExpansionEnabled: false
  });
  Lockr.set(key, saved);
  model.loadOptions();
  assert.deepStrictEqual(model.clef, ["bass", "treble"], key + " restores separate single-note clefs");
  assert.deepStrictEqual(Lockr.get(key).clef, ["bass", "treble"], key + " persists the retired-mode migration");
  for (const field of ["customMinValue", "customBassMaxValue", "customTrebleMinValue", "customMaxValue", "inputMode"]) {
    assert.strictEqual(model[field], saved[field], key + " preserves " + field);
  }
  model.clef = ["piano"];
  model.saveOptions();
  assert.deepStrictEqual(model.clef, ["bass", "treble"], key + " also sanitizes a restored runtime selection");
  for (const clefs of [["bass"], ["treble"], ["bass", "treble"]]) {
    model.clef = clefs;
    model.saveOptions();
    model.loadOptions();
    assert.deepStrictEqual(model.clef, clefs, key + " preserves supported clefs");
  }
}
console.log("Global practice options: defaults, persisted choices, older-backup and retired piano-mode migration OK.");
