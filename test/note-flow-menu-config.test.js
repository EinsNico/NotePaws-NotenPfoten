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

const menuConfig = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowMenuConfig.js")
);
const structure = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowStructure.js")
);
const melodyMenuSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/NoteFlowMenu.vue"), "utf8"
);
const preferences = loadEsModule(path.resolve(__dirname, "../src/model/NoteFlowPreferences.js"));
assert(melodyMenuSource.includes('normalizeNoteFlowMelodyPreferences'));
assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences().menuOptions.behavior, "wait");
assert.strictEqual(menuConfig.createNoteFlowConfigFromMenu().difficulty, "easy");
for (const difficulty of ["easy", "normal", "hard", "custom"]) {
  assert.strictEqual(structure.normalizeNoteFlowConfig(menuConfig.createNoteFlowConfigFromMenu({ difficulty })).difficulty, difficulty);
}


function baseOptions() {
  return {
    handMode: "single",
    secondaryNotesPerBlock: 4,
    difficulty: "normal",
    tonalityMode: "random",
    selectedKey: "C-major",
    clef: ["treble"],
    customMinValue: 24,
    customBassMaxValue: 46,
    customTrebleMinValue: 50,
    customMaxValue: 72,
    accidentals: "onlySharp"
  };
}

const oneHand = menuConfig.createNoteFlowConfigFromMenu(baseOptions());
assert.strictEqual(oneHand.handMode, "single");
assert.strictEqual(oneHand.secondaryNotesPerBlock, 0);
assert.deepStrictEqual(oneHand.clefs, ["treble"]);

const piano = baseOptions();
piano.clef = ["piano"];
assert.deepStrictEqual(
  menuConfig.createNoteFlowConfigFromMenu(piano).clefs,
  ["bass", "treble"]
);

const twoHands = baseOptions();
twoHands.handMode = "two";
twoHands.secondaryNotesPerBlock = 8;
twoHands.clef = ["treble"];
const twoHandConfig = menuConfig.createNoteFlowConfigFromMenu(twoHands);
assert.strictEqual(twoHandConfig.handMode, "two");
assert.strictEqual(twoHandConfig.secondaryNotesPerBlock, 8);
assert.deepStrictEqual(twoHandConfig.clefs, ["bass", "treble"]);
assert.strictEqual(twoHandConfig.tonalityMode, "random");
assert.strictEqual(twoHandConfig.selectedKey, "C-major");
assert.deepStrictEqual(twoHandConfig.ranges, {
  bass: { min: 24, max: 46 },
  treble: { min: 50, max: 72 }
});

const normalized = structure.normalizeNoteFlowConfig(twoHandConfig);
assert.strictEqual(normalized.handMode, "two");
assert.strictEqual(normalized.secondaryNotesPerBlock, 8);
assert.deepStrictEqual(normalized.clefs, ["bass", "treble"]);
assert.strictEqual(normalized.tonalityMode, "random");

const circle = baseOptions();
circle.tonalityMode = "circle";
circle.selectedKey = "E-flat-major";
circle.accidentals = "onlyFlat";
const circleConfig = menuConfig.createNoteFlowConfigFromMenu(circle);
assert.strictEqual(circleConfig.tonalityMode, "circle");
assert.strictEqual(circleConfig.selectedKey, "E-flat-major");
assert.strictEqual(
  structure.normalizeNoteFlowConfig(circleConfig).selectedKey,
  "E-flat-major"
);

const invalidDependencies = baseOptions();
invalidDependencies.handMode = "two";
invalidDependencies.clef = ["treble"];
invalidDependencies.secondaryNotesPerBlock = 99;
invalidDependencies.accidentals = "onlySharp";
invalidDependencies.selectedKey = "E-flat-major";
const repaired = menuConfig.applyNoteFlowMenuDependencies(invalidDependencies);
assert.deepStrictEqual(repaired.clef, ["bass", "treble"]);
assert.strictEqual(repaired.secondaryNotesPerBlock, 4);
assert.strictEqual(repaired.selectedKey, "C-major");
assert.strictEqual(invalidDependencies.selectedKey, "E-flat-major");

const singlePiano = baseOptions();
singlePiano.clef = ["bass", "piano", "treble"];
assert.deepStrictEqual(
  menuConfig.applyNoteFlowMenuDependencies(singlePiano).clef,
  ["piano"]
);
assert.deepStrictEqual(
  menuConfig.NOTE_FLOW_SECONDARY_DENSITIES,
  [1, 2, 4, 8, 16]
);

const defaultRhythm = menuConfig.createNoteFlowRhythmOptionsFromMenu(baseOptions());
assert.strictEqual(defaultRhythm.meter, "4/4");
assert.deepStrictEqual(defaultRhythm.allowedValues.treble, ["quarter", "eighth"]);
assert.deepStrictEqual(defaultRhythm.allowedValues.bass, ["half", "quarter"]);

const independentRhythm = menuConfig.createNoteFlowRhythmOptionsFromMenu({
  rhythmMeter: "6/8",
  rhythmValues: { treble: ["dotted-quarter"], bass: ["eighth"] }
});
assert.deepStrictEqual(independentRhythm, {
  meter: "6/8",
  noteDensity: 65,
  allowedValues: { treble: ["dotted-quarter"], bass: ["eighth"] }
});
assert.strictEqual(
  menuConfig.createNoteFlowRhythmOptionsFromMenu({ rhythmMeter: "7/8" }).meter,
  "4/4"
);
assert.deepStrictEqual(
  menuConfig.createNoteFlowRhythmOptionsFromMenu({
    rhythmMeter: "3/4", rhythmValues: { treble: ["whole"], bass: ["half"] }
  }).allowedValues,
  { treble: ["quarter", "eighth"], bass: ["half", "quarter"] }
);
assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences().menuOptions.rhythmMeter, "4/4");

const customAlgorithm = { jumpFrequency: 72, jumpSize: 11, repetition: 18, noteDensity: 84 };
const customMenu = menuConfig.createNoteFlowConfigFromMenu({ movement: "custom", algorithmSettings: customAlgorithm });
assert.deepStrictEqual(customMenu.algorithmSettings, customAlgorithm);
assert.deepStrictEqual(structure.normalizeNoteFlowConfig(customMenu).algorithmSettings, customAlgorithm);
assert.deepStrictEqual(preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: { movement: "calm", algorithmSettings: customAlgorithm } }).menuOptions.algorithmSettings, customAlgorithm);
const legacyPreferences = preferences.normalizeNoteFlowMelodyPreferences();
delete legacyPreferences.menuOptions.algorithmSettings;
assert.strictEqual(preferences.isValidNoteFlowMelodyPreferences(legacyPreferences), true);
legacyPreferences.menuOptions.movement = "custom";
assert.strictEqual(preferences.isValidNoteFlowMelodyPreferences(legacyPreferences), false);
legacyPreferences.menuOptions.algorithmSettings = customAlgorithm;
assert.strictEqual(preferences.isValidNoteFlowMelodyPreferences(legacyPreferences), true);
for (const invalid of [null, [], {}, { jumpFrequency: 72, jumpSize: 13, repetition: 18 },
  { jumpFrequency: "72", jumpSize: 11, repetition: 18 }, { jumpFrequency: 72, jumpSize: 11, repetition: 18, extra: 1 }]) {
  legacyPreferences.menuOptions.algorithmSettings = invalid;
  assert.strictEqual(preferences.isValidNoteFlowMelodyPreferences(legacyPreferences), false);
}
assert(melodyMenuSource.includes('activeSettingSection === \'rhythm\''));
assert(melodyMenuSource.includes("<NoteFlowAlgorithmPreview"));
assert(melodyMenuSource.includes('activeSettingSection !== "algorithm"'));

process.stdout.write("Note Flow menu configuration tests passed.\n");
