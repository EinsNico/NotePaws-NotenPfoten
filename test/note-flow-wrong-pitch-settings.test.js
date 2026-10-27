const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const values = new Map();
global.localStorage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] || null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
global.window = { scrollTo() {} };
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loadedModule, filename);
  return loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
let preferences, config, backup, files, imports, Options, chordPlan, chordRhythm;
try {
  preferences = require("../src/model/NoteFlowPreferences");
  config = require("../src/model/NoteFlowChordConfig");
  backup = require("../src/model/SaveDataBackup");
  files = require("../src/model/SaveDataFiles");
  imports = require("../src/model/SaveDataImport");
  Options = require("../src/model/Options").default;
  chordPlan = require("../src/model/NoteFlowChordPlan");
  chordRhythm = require("../src/model/NoteFlowChordRhythm");
} finally {
  Module._extensions[".js"] = originalLoader;
}
const Lockr = require("lockr");
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = clone(Options);
let passed = 0;
async function test(name, body) {
  await body();
  passed += 1;
  process.stdout.write(`\u2713 ${name}\n`);
}
function saveState(globalFlag = true, melodyFlag = true, chordFlag = true) {
  values.clear();
  Object.assign(Options, clone(defaults), {
    displayNote: globalFlag,
    noteFlowMelodySettings: preferences.normalizeNoteFlowMelodyPreferences({
      menuOptions: { displayNote: melodyFlag }
    }),
    noteFlowChordSettings: preferences.normalizeNoteFlowChordPreferences({
      displayNote: chordFlag
    })
  });
  assert.strictEqual(Options.saveOptions(), true);
}
function reopen() {
  Options.noteFlowMelodySettings = null;
  Options.noteFlowChordSettings = null;
  Options.loadOptions();
  return {
    melody: preferences.normalizeNoteFlowMelodyPreferences(Options.noteFlowMelodySettings),
    chord: preferences.normalizeNoteFlowChordPreferences(Options.noteFlowChordSettings)
  };
}
function document() {
  return backup.createSaveDataBackup(localStorage, { createdAt: "2026-10-09T08:00:00.000Z" });
}
function legacyChord() {
  const legacy = preferences.normalizeNoteFlowChordPreferences({
    handMode: "two", chordSize: 4, movement: "mixed"
  });
  delete legacy.displayNote;
  delete legacy.algorithmSettings;
  ["handMode", "singleHand", "bassNotesPerChord", "trebleNotesPerChord", "ranges",
    "customMinValue", "customBassMaxValue", "customTrebleMinValue", "customMaxValue"]
    .forEach(key => { delete legacy[key]; });
  // Earlier settings counted the three treble notes, plus an extra bass root.
  legacy.chordSize = 3;
  return legacy;
}
function emptyDatabaseAdapters() {
  // Real export code and schema, isolated empty IO responses. No physical IDB.
  return {
    learningStorage: {
      flush: async () => {},
      verifyHistoryReady: async () => ({ saved: true, verified: true }),
      readDailyTaskHistory: async () => ({ saved: true, history: null }),
    readBackupSnapshot: async () => ({ saved: true, progress: null, attempts: [] })
    },
    noteFlowStorage: {
      flush: async () => {},
      readRoundsForExport: async () => ({ saved: true, rounds: [] })
    },
    rhythmStorage: {
      flush: async () => {},
      readBarsForExport: async () => ({ saved: true, bars: [] })
    }
  };
}

(async () => {
  await test("normalization preserves both booleans and supplies the explicit legacy default", () => {
    assert.strictEqual(config.normalizeNoteFlowChordOptions().displayNote, true);
    [true, false].forEach(displayNote => {
      const normalized = config.normalizeNoteFlowChordOptions({ displayNote });
      assert.strictEqual(normalized.displayNote, displayNote);
      assert.strictEqual(preferences.isValidNoteFlowChordPreferences(normalized), true);
    });
  });

  await test("recent complete chord backups without the flag remain valid without mutation", () => {
    const old = preferences.normalizeNoteFlowChordPreferences({ movement: "custom", displayNote: false });
    delete old.displayNote;
    const before = clone(old);
    Object.freeze(old);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(old), true);
    assert.strictEqual(preferences.normalizeNoteFlowChordPreferences(old).displayNote, true);
    assert.deepStrictEqual(old, before);
  });

  await test("older pre-hand/preset backups receive the flag default while preserving migration", () => {
    const old = legacyChord();
    const before = clone(old);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(old), true);
    const normalized = preferences.normalizeNoteFlowChordPreferences(old);
    assert.strictEqual(normalized.displayNote, true);
    assert.strictEqual(normalized.handMode, "two");
    assert.strictEqual(normalized.chordSize, 4);
    assert.deepStrictEqual(old, before);
  });

  await test("present invalid flag types are rejected rather than treated as omitted legacy data", () => {
    const normalized = preferences.normalizeNoteFlowChordPreferences({ displayNote: false });
    [undefined, null, 0, 1, "false", "true", [], {}].forEach(displayNote => {
      assert.strictEqual(preferences.isValidNoteFlowChordPreferences(
        Object.assign({}, normalized, { displayNote })), false);
      assert.strictEqual(preferences.isValidNoteFlowChordPreferences(
        Object.assign({}, legacyChord(), { displayNote })), false);
    });
  });

  await test("legacy default does not admit malformed settings, partial hand fields or unknown keys", () => {
    const old = legacyChord();
    [ { bpm: "bad" }, { inputMode: "button" }, { handMode: "two" },
      { markerEnabled: true }, { chordSize: 8 }, { rhythmValues: [] }
    ].forEach(patch => assert.strictEqual(preferences.isValidNoteFlowChordPreferences(
      Object.assign({}, old, patch)), false));
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(null), true);
  });

  await test("false survives real Options save/load and preference reopening independently of global displayNote", () => {
    saveState(true, false, false);
    assert.strictEqual(Lockr.get("options").noteFlowChordSettings.displayNote, false);
    Options.displayNote = false;
    const reopened = reopen();
    assert.strictEqual(reopened.chord.displayNote, false);
    assert.strictEqual(reopened.melody.menuOptions.displayNote, false);
    assert.strictEqual(Options.displayNote, true);
  });

  await test("all eight global/Melody/Chord flag combinations persist independently", () => {
    [true, false].forEach(globalFlag => [true, false].forEach(melodyFlag =>
      [true, false].forEach(chordFlag => {
        saveState(globalFlag, melodyFlag, chordFlag);
        const reopened = reopen();
        assert.strictEqual(Options.displayNote, globalFlag);
        assert.strictEqual(reopened.melody.menuOptions.displayNote, melodyFlag);
        assert.strictEqual(reopened.chord.displayNote, chordFlag);
      })));
  });

  await test("regular JSON export/parser retain false in both mode-specific saved settings", () => {
    saveState(true, false, false);
    const exported = files.createSaveDataExport(localStorage);
    const parsed = files.parseSaveDataFile(exported.text);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.backup.data.options.noteFlowChordSettings.displayNote, false);
    assert.strictEqual(parsed.backup.data.options.noteFlowMelodySettings.menuOptions.displayNote, false);
    assert.strictEqual(parsed.backup.data.options.displayNote, true);
  });

  await test("real database-backed export and schema retain false with explicit empty IO adapters", async () => {
    saveState(true, false, false);
    const exported = await files.createIndexedDbSaveDataExport(localStorage, emptyDatabaseAdapters());
    assert.strictEqual(exported.backup.version, 4);
    const parsed = files.parseSaveDataFile(exported.text);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.backup.data.options.noteFlowChordSettings.displayNote, false);
    assert.strictEqual(parsed.backup.data.options.noteFlowMelodySettings.menuOptions.displayNote, false);
    assert.deepStrictEqual(parsed.backup.data.noteFlowRounds, { screen: [], midi: [], chordMidi: [] });
  });

  await test("replacement restores false through the actual prepared local-settings import and reopening", () => {
    saveState(true, false, false);
    const incoming = document();
    saveState(false, true, true);
    const prepared = imports.prepareSaveDataImport(localStorage, incoming, "replace");
    imports.applyPreparedSaveDataImport(localStorage, prepared);
    const reopened = reopen();
    assert.strictEqual(reopened.chord.displayNote, false);
    assert.strictEqual(reopened.melody.menuOptions.displayNote, false);
    assert.strictEqual(Options.displayNote, true);
  });

  await test("merge preserves current false and the existing policy for conflicting incoming settings", () => {
    saveState(false, true, true);
    const incoming = document();
    saveState(true, false, false);
    const current = clone(Lockr.get("options"));
    imports.applyPreparedSaveDataImport(localStorage,
      imports.prepareSaveDataImport(localStorage, incoming, "merge"));
    assert.deepStrictEqual(Lockr.get("options"), current);
    assert.strictEqual(reopen().chord.displayNote, false);
  });

  await test("merge into an empty settings store adopts incoming false and reopens it", () => {
    saveState(true, false, false);
    const incoming = document();
    values.clear();
    imports.applyPreparedSaveDataImport(localStorage,
      imports.prepareSaveDataImport(localStorage, incoming, "merge"));
    const reopened = reopen();
    assert.strictEqual(reopened.chord.displayNote, false);
    assert.strictEqual(reopened.melody.menuOptions.displayNote, false);
  });

  await test("flag-less old backup validates, replaces and reopens with true without changing global/Melody flags", () => {
    saveState(false, false, false);
    const old = document();
    delete old.data.options.noteFlowChordSettings.displayNote;
    assert.strictEqual(backup.validateSaveDataBackup(old).valid, true);
    saveState(true, true, false);
    imports.applyPreparedSaveDataImport(localStorage,
      imports.prepareSaveDataImport(localStorage, old, "replace"));
    const reopened = reopen();
    assert.strictEqual(reopened.chord.displayNote, true);
    assert.strictEqual(reopened.melody.menuOptions.displayNote, false);
    assert.strictEqual(Options.displayNote, false);
  });

  await test("backup versions2-5 accept omission/booleans while rejecting bad types and unrelated extra keys", () => {
    saveState();
    [2, 3, 4, 5].forEach(version => {
      const doc = document();
      doc.version = version;
      if (version >= 3) doc.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
      if (version >= 4) doc.data.rhythmSenseBars = [];
      delete doc.data.options.noteFlowChordSettings.displayNote;
      assert.strictEqual(backup.validateSaveDataBackup(doc).valid, true, `legacy version${version}`);
      [true, false].forEach(displayNote => {
        doc.data.options.noteFlowChordSettings.displayNote = displayNote;
        assert.strictEqual(backup.validateSaveDataBackup(doc).valid, true);
      });
      [null, 0, "false", {}].forEach(displayNote => {
        doc.data.options.noteFlowChordSettings.displayNote = displayNote;
        assert.strictEqual(backup.validateSaveDataBackup(doc).valid, false);
      });
      doc.data.options.noteFlowChordSettings.displayNote = false;
      doc.data.options.noteFlowChordSettings.unrecognizedMarkerOption = true;
      assert.strictEqual(backup.validateSaveDataBackup(doc).valid, false);
    });
  });

  await test("the display flag does not change actual seeded chord plans or rhythmic music", () => {
    ["single", "two"].forEach(handMode => {
      const options = { handMode, chordSize: 4, movement: "custom", selectedKey: "C-major",
        seed: "marker-setting-music-invariance", bpm: 60 };
      const enabled = chordPlan.createNoteFlowChordPlan(Object.assign({}, options, { displayNote: true }));
      const disabled = chordPlan.createNoteFlowChordPlan(Object.assign({}, options, { displayNote: false }));
      const enabledMusic = clone(enabled), disabledMusic = clone(disabled);
      delete enabledMusic.options.displayNote;
      delete disabledMusic.options.displayNote;
      assert.deepStrictEqual(disabledMusic, enabledMusic);
      assert.deepStrictEqual(chordRhythm.generateNoteFlowChordRhythmicScore(disabled),
        chordRhythm.generateNoteFlowChordRhythmicScore(enabled));
    });
  });

  process.stdout.write(JSON.stringify({ passed, globalFlagCombinations: 8, backupVersions: [2, 3, 4, 5] }) + "\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
