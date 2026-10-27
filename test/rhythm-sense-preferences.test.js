const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");

function memory() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
global.localStorage = memory();
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const preferences = require("../src/model/RhythmSensePreferences");
const Options = require("../src/model/Options").default;
const Lockr = require("lockr");
const backup = require("../src/model/SaveDataBackup");
const files = require("../src/model/SaveDataFiles");
const imports = require("../src/model/SaveDataImport");
const { RhythmSenseRoundWriter, RHYTHM_SENSE_SCOPE } = require("../src/model/RhythmSenseRoundStorage");
const { packNoteFlowRoundsIntoBlocks, expandNoteFlowRoundBlock } = require("../src/model/LearningDatabasePrototype");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader");
Module._extensions[".js"] = originalLoader;
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = { noteValues: ["whole", "half", "quarter"], previewVibration: false, tapVibration: false };
const selected = { noteValues: ["quarter", "thirtySecond", "sixtyFourth"], previewVibration: true, tapVibration: false };
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("normalizes safe defaults without sharing arrays or enabling malformed vibration values", () => {
  for (const raw of [undefined, null, [], false, {}, { noteValues: [] }, { noteValues: ["unknown"] }, { noteValues: ["quarter", "unknown"] }, { noteValues: ["quarter", "quarter"] }, { noteValues: new Array(1) }]) {
    assert.deepStrictEqual(preferences.normalizeRhythmSensePreferences(raw), defaults);
  }
  const normalized = preferences.normalizeRhythmSensePreferences(selected);
  assert.deepStrictEqual(normalized, selected);
  normalized.noteValues.push("whole");
  assert.deepStrictEqual(selected.noteValues, ["quarter", "thirtySecond", "sixtyFourth"]);
  const first = preferences.normalizeRhythmSensePreferences();
  first.noteValues.pop();
  assert.deepStrictEqual(preferences.normalizeRhythmSensePreferences(), defaults);
  assert.deepStrictEqual(preferences.normalizeRhythmSensePreferences({ previewVibration: "true", tapVibration: 1 }), defaults);
});
test("strictly validates all seven values, required booleans, unique nonempty arrays and known fields", () => {
  assert.strictEqual(preferences.isValidRhythmSensePreferences(null), true);
  assert.strictEqual(preferences.isValidRhythmSensePreferences(selected), true);
  assert.strictEqual(preferences.isValidRhythmSensePreferences(Object.assign({}, defaults, { noteValues: preferences.RHYTHM_SENSE_NOTE_VALUES.slice() })), true);
  for (const invalid of [undefined, [], {}, { noteValues: ["quarter"] },
    Object.assign({}, selected, { noteValues: [] }),
    Object.assign({}, selected, { noteValues: ["sixtyfourth"] }),
    Object.assign({}, selected, { noteValues: ["quarter", "quarter"] }),
    Object.assign({}, selected, { previewVibration: 1 }),
    Object.assign({}, selected, { tapVibration: "false" }),
    Object.assign({}, selected, { extra: true })]) {
    assert.strictEqual(preferences.isValidRhythmSensePreferences(invalid), false);
  }
});
test("persists selected note values and independent vibration preferences without changing other modes", () => {
  assert.strictEqual(Options.rhythmSenseSettings, null);
  Options.saveOptions();
  const before = Lockr.get("options");
  Options.rhythmSenseSettings = clone(selected);
  Options.saveOptions();
  const stored = Lockr.get("options");
  for (const key of Object.keys(before).filter(key => key !== "rhythmSenseSettings")) {
    assert.deepStrictEqual(stored[key], before[key], key + " must stay unchanged");
  }
  Options.rhythmSenseSettings = null;
  Options.loadOptions();
  assert.deepStrictEqual(Options.rhythmSenseSettings, selected);
  Options.rhythmSenseSettings = { noteValues: [], previewVibration: true, tapVibration: true, extra: true };
  Options.saveOptions();
  assert.deepStrictEqual(Lockr.get("options").rhythmSenseSettings, Object.assign({}, defaults, { previewVibration: true, tapVibration: true }));
  Options.rhythmSenseSettings = clone(selected);
  Options.saveOptions();
});
test("backs up normal preferences, rejects malformed settings, and excludes them from adaptive options", () => {
  const document = backup.createSaveDataBackup(localStorage);
  assert.strictEqual(backup.validateSaveDataBackup(document).valid, true);
  assert.deepStrictEqual(document.data.options.rhythmSenseSettings, selected);
  for (const value of [null, clone(defaults), clone(selected)]) {
    const valid = clone(document);
    valid.data.options.rhythmSenseSettings = value;
    assert.strictEqual(backup.validateSaveDataBackup(valid).valid, true);
  }
  for (const value of [{}, { noteValues: ["quarter"], previewVibration: false },
    Object.assign({}, selected, { noteValues: ["quarter", "quarter"] }),
    Object.assign({}, selected, { noteValues: ["dottedQuarter"] }),
    Object.assign({}, selected, { tapVibration: null }),
    Object.assign({}, selected, { other: false })]) {
    const invalid = clone(document);
    invalid.data.options.rhythmSenseSettings = value;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
  }
  const adaptive = clone(document);
  adaptive.data.adaptiveOptions = { rhythmSenseSettings: clone(selected) };
  assert.strictEqual(backup.validateSaveDataBackup(adaptive).valid, false);
});
test("replacement restores preferences; older backups reset them instead of retaining a previous session", () => {
  const document = backup.createSaveDataBackup(localStorage);
  Options.rhythmSenseSettings = clone(defaults);
  Options.saveOptions();
  imports.applyPreparedSaveDataImport(localStorage, imports.prepareSaveDataImport(localStorage, document, "replace"));
  Options.loadOptions();
  assert.deepStrictEqual(Options.rhythmSenseSettings, selected);
  const old = clone(document);
  delete old.data.options.rhythmSenseSettings;
  assert.strictEqual(backup.validateSaveDataBackup(old).valid, true);
  imports.applyPreparedSaveDataImport(localStorage, imports.prepareSaveDataImport(localStorage, old, "replace"));
  Options.loadOptions();
  assert.strictEqual(Options.rhythmSenseSettings, null);
  assert.deepStrictEqual(preferences.normalizeRhythmSensePreferences(Options.rhythmSenseSettings), defaults);
  Lockr.set("options", { rhythmSenseSettings: { noteValues: ["invalid"] } });
  Options.loadOptions();
  assert.deepStrictEqual(Options.rhythmSenseSettings, defaults);
  Options.rhythmSenseSettings = clone(selected);
  Options.saveOptions();
});

function bar(number, value, count, duration) {
  return {
    id: "value-session:bar:" + number, sessionId: "value-session", barNumber: number,
    completedAt: "2026-10-05T12:00:00.000Z",
    settings: { meter: "4/4", bpm: 80, noteValues: [value] },
    score: { correct: count, wrong: 0, missed: 0, evaluatedInputs: count },
    timing: { precise: count, early: 0, late: 0, evaluatedInputs: count, totalAbsoluteOffsetMs: 0 },
    notes: Array.from({ length: count }, (_, index) => ({ beat: index * duration, value, result: "correct", offsetMs: 0 }))
  };
}
test("preserves 32nd/64th records and older dotted records through storage, export, streamed validation and replacement", async () => {
  const bars = [bar(1, "thirtySecond", 32, 1 / 8), bar(2, "sixtyFourth", 64, 1 / 16), bar(3, "dottedQuarter", 1, 1.5)];
  delete bars[2].settings.noteValues;
  let records = [];
  const roundStorage = new RhythmSenseRoundWriter({ openDatabase: () => ({
    recordNoteFlowRound(scope, record) {
      assert.strictEqual(scope, RHYTHM_SENSE_SCOPE);
      records.push(clone(record));
      return Promise.resolve({ duplicate: false });
    },
    readNoteFlowRoundsForExport(scope) {
      assert.strictEqual(scope, RHYTHM_SENSE_SCOPE);
      return Promise.resolve(packNoteFlowRoundsIntoBlocks(records, { scope, blockSize: 1 }).reduce((all, block) => all.concat(expandNoteFlowRoundBlock(block)), []));
    }
  }) });
  for (const record of bars) assert.strictEqual((await roundStorage.saveBar(record)).saved, true);
  const learningStorage = {
    flush: () => Promise.resolve({ saved: true }),
    getStatus: () => ({ failedWrites: 0 }),
    verifyHistoryReady: () => Promise.resolve({ saved: true, verified: true }),
    synchronizeProgress: () => Promise.resolve({ saved: true }),
    readDailyTaskHistory: async () => ({ saved: true, history: null }),
    readBackupSnapshot: () => Promise.resolve({ saved: true, progress: null, attempts: [] }),
    replaceBackupData(data, options) {
      assert.strictEqual(options.replaceRhythmSenseBars, true);
      records = packNoteFlowRoundsIntoBlocks(data.rhythmSenseBars, { scope: RHYTHM_SENSE_SCOPE, blockSize: 1 })
        .reduce((all, block) => all.concat(expandNoteFlowRoundBlock(block)), []);
      return Promise.resolve({ saved: true, replacedScopes: 1, attemptCount: 0 });
    }
  };
  const document = await files.createIndexedDbSaveDataBackup(localStorage, {
    learningStorage, rhythmStorage: roundStorage, includeRhythmSenseBars: true,
    createdAt: "2026-10-05T12:01:00.000Z"
  });
  assert.deepStrictEqual(document.data.rhythmSenseBars, bars);
  const serialized = files.serializeSaveDataBackup(document);
  const parsed = backup.parseSaveDataBackup(serialized);
  assert.strictEqual(parsed.valid, true);
  const streamed = [];
  const reader = new SaveDataStreamReader((section, record) => {
    assert.strictEqual(backup.validateStreamedBackupRecord(section, record).valid, true);
    if (section === "data.rhythmSenseBars") streamed.push(record);
  });
  for (let offset = 0; offset < serialized.length; offset += 29) reader.push(serialized.slice(offset, offset + 29));
  const streamedResult = reader.finish();
  assert.deepStrictEqual(streamed, bars);
  assert.deepStrictEqual(streamedResult.backup.data.options.rhythmSenseSettings, selected);
  records = [];
  const prepared = imports.prepareSaveDataImport(localStorage, parsed.backup, "replace");
  await imports.applyPreparedSaveDataReplaceEverywhere(localStorage, prepared, learningStorage);
  assert.deepStrictEqual((await roundStorage.readBarsForExport()).bars, bars);
  Options.loadOptions();
  assert.deepStrictEqual(Options.rhythmSenseSettings, selected);
  for (const selection of [[], ["quarter", "quarter"], ["unknown"], null]) {
    const invalid = clone(document);
    invalid.data.rhythmSenseBars[0].settings.noteValues = selection;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
    assert.strictEqual(backup.validateStreamedBackupRecord("data.rhythmSenseBars", invalid.data.rhythmSenseBars[0]).valid, false);
  }
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    process.stdout.write(`✓ ${entry.name}\n`);
  }
  process.stdout.write("Rhythm Sense preference tests passed.\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
