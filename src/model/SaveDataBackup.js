import packageMetadata from "../../package.json";
import {
  ADAPTIVE_HISTORY_VERSION,
  normalizeAdaptiveHistory
} from "./AdaptiveHistory";
import { ROUND_HISTORY_VERSION } from "./RoundHistory";
import { normalizePrestigeArchive } from "./PrestigeArchive";
import { NOTE_FLOW_MOVEMENTS, isValidNoteFlowAlgorithmSettings } from "./NoteFlowMovement";
import { isValidNoteFlowMelodyPreferences, isValidNoteFlowChordPreferences } from "./NoteFlowPreferences";
import { isValidRhythmSensePreferences, isValidRhythmSenseNoteValues } from "./RhythmSensePreferences";
import { isValidWorkshopLibrary } from "./Workshop";
import { PREPARATION_SECONDS } from "./PracticePreparation";
import { isValidDailyTaskHistoryBackup } from "./DailyTaskHistoryData";

export const SAVE_DATA_BACKUP_FORMAT = "noten-pfoten-save-data";
export const SAVE_DATA_BACKUP_VERSION = 6;
export const SAVE_DATA_BASE_VERSION = 2;

export const SAVE_DATA_STORAGE_KEYS = {
  options: "options",
  adaptiveOptions: "adaptiveOptions",
  adaptiveProgress: "adaptiveProgress",
  adaptiveHistory: "adaptiveHistory",
  adaptiveProgressMidi: "adaptiveProgressMidi",
  adaptiveHistoryMidi: "adaptiveHistoryMidi",
  roundHistory: "roundHistory",
  prestigeArchive: "prestigeArchive",
  legacyLastScores: "lastScores",
  legacyRecord: "record"
};

export const SCORE_STORAGE_PREFIX = "lastScores__";
export const RECORD_STORAGE_PREFIX = "record__";

export const BACKUP_VALIDATION_ERRORS = {
  invalidDocument: "invalid-document",
  wrongFormat: "wrong-format",
  invalidVersion: "invalid-version",
  newerVersion: "newer-version",
  missingData: "missing-data",
  invalidData: "invalid-data",
  invalidJson: "invalid-json"
};

function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
  );
}

function isNullableObject(value) {
  return value === null || isPlainObject(value);
}

const NORMAL_OPTION_KEYS = [
  "inputMode",
  "gameLength",
  "clef",
  "difficulty",
  "customMinValue",
  "customMaxValue",
  "customTrebleMinValue",
  "customBassMaxValue",
  "customDefaultsVersion",
  "customClefDefaultsVersion",
  "accidentals",
  "sound",
  "keepScreenAwake",
  "preparationSeconds",
  "vibration",
  "displayNote",
  "language",
  "noteNaming",
  "appVolume",
  "noteFlowMelodyMovement",
  "noteFlowChordMovement",
  "noteFlowMelodySettings",
  "noteFlowChordSettings",
  "rhythmSenseSettings"
];

const ADAPTIVE_OPTION_KEYS = NORMAL_OPTION_KEYS.filter(key => (
  key !== "difficulty"
  && key !== "language"
  && key !== "noteNaming"
  && key !== "appVolume"
  && key !== "keepScreenAwake"
  && key !== "preparationSeconds"
  && key !== "noteFlowMelodyMovement"
  && key !== "noteFlowChordMovement"
  && key !== "noteFlowMelodySettings"
  && key !== "noteFlowChordSettings"
  && key !== "rhythmSenseSettings"
)).concat("rangeExpansionEnabled");

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKnownKeys(value, knownKeys) {
  return Object.keys(value).every(key => knownKeys.indexOf(key) !== -1);
}

function isValidClefSelection(value) {
  const allowedClefs = ["treble", "bass", "alto", "tenor", "piano"];
  if (typeof value === "string") {
    return value === "all" || allowedClefs.indexOf(value) !== -1;
  }
  return Array.isArray(value) && value.every(clef => (
    allowedClefs.indexOf(clef) !== -1
  ));
}

function hasValidSharedOptionValues(value) {
  const numericKeys = [
    "gameLength",
    "customMinValue",
    "customMaxValue",
    "customTrebleMinValue",
    "customBassMaxValue",
    "customDefaultsVersion",
    "customClefDefaultsVersion"
  ];
  const booleanKeys = [
    "sound",
    "keepScreenAwake",
    "vibration",
    "displayNote",
    "rangeExpansionEnabled"
  ];
  if (
    hasOwn(value, "inputMode")
    && ["button", "keyboard", "midi"].indexOf(value.inputMode) === -1
  ) {
    return false;
  }
  if (hasOwn(value, "clef") && !isValidClefSelection(value.clef)) {
    return false;
  }
  if (
    hasOwn(value, "accidentals")
    && ["no", "sharp", "flat", "sharpAndFlat"].indexOf(value.accidentals) === -1
  ) {
    return false;
  }
  return numericKeys.every(key => (
    !hasOwn(value, key) || Number.isFinite(Number(value[key]))
  )) && booleanKeys.every(key => (
    !hasOwn(value, key) || typeof value[key] === "boolean"
  ));
}

function isValidNormalOptions(value) {
  if (value === null) {
    return true;
  }
  return Boolean(
    isPlainObject(value)
    && hasOnlyKnownKeys(value, NORMAL_OPTION_KEYS)
    && hasValidSharedOptionValues(value)
    && (!hasOwn(value, "preparationSeconds") || PREPARATION_SECONDS.indexOf(value.preparationSeconds) !== -1)
    && (!hasOwn(value, "noteFlowMelodySettings") || isValidNoteFlowMelodyPreferences(value.noteFlowMelodySettings))
    && (!hasOwn(value, "noteFlowChordSettings") || isValidNoteFlowChordPreferences(value.noteFlowChordSettings))
    && (!hasOwn(value, "rhythmSenseSettings") || isValidRhythmSensePreferences(value.rhythmSenseSettings))
    && ["noteFlowMelodyMovement", "noteFlowChordMovement"].every(key => (
      !hasOwn(value, key) || NOTE_FLOW_MOVEMENTS.indexOf(value[key]) !== -1
    ))
    && (
      !hasOwn(value, "difficulty")
      || ["easy", "normal", "hard", "custom"].indexOf(value.difficulty) !== -1
    )
    && (
      !hasOwn(value, "language")
      || value.language === null
      || ["de", "en"].indexOf(value.language) !== -1
    )
    && (
      !hasOwn(value, "noteNaming")
      || value.noteNaming === null
      || ["german", "international"].indexOf(value.noteNaming) !== -1
    )
    && (
      !hasOwn(value, "appVolume")
      || (
        Number.isFinite(Number(value.appVolume))
        && Number(value.appVolume) >= 0
        && Number(value.appVolume) <= 100
      )
    )
  );
}

function isValidAdaptiveOptions(value) {
  return value === null || Boolean(
    isPlainObject(value)
    && hasOnlyKnownKeys(value, ADAPTIVE_OPTION_KEYS)
    && hasValidSharedOptionValues(value)
  );
}

function isNullableRoundHistory(value) {
  if (value === null) {
    return true;
  }
  const rounds = Array.isArray(value)
    ? value
    : isPlainObject(value)
      && value.version === ROUND_HISTORY_VERSION
      && Array.isArray(value.rounds)
      ? value.rounds
      : null;
  if (!rounds) {
    return false;
  }
  const seenIds = Object.create(null);
  return rounds.every(round => {
    if (
      !isPlainObject(round)
      || typeof round.id !== "string"
      || round.id.length === 0
      || !Number.isFinite(Number(round.completedAt))
      || Number(round.completedAt) < 0
      || seenIds[round.id]
    ) {
      return false;
    }
    seenIds[round.id] = true;
    return true;
  });
}

function isNullableAdaptiveHistory(value) {
  if (value === null) {
    return true;
  }
  if (
    !isPlainObject(value)
    || value.version !== ADAPTIVE_HISTORY_VERSION
    || !Array.isArray(value.baselines)
    || !Array.isArray(value.evaluations)
  ) {
    return false;
  }
  const normalized = normalizeAdaptiveHistory(value);
  return Boolean(
    normalized.baselines.length === value.baselines.length
    && normalized.evaluations.length === value.evaluations.length
  );
}

function isNullableFiniteNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableNumberArray(value) {
  return value === null || (
    Array.isArray(value)
    && value.every(item => typeof item === "number" && Number.isFinite(item))
  );
}

function readLockrValue(storage, storageKey) {
  const rawValue = storage.getItem(storageKey);
  if (rawValue === null) {
    return null;
  }

  let storedValue;
  try {
    storedValue = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`Stored value "${storageKey}" is not valid JSON.`);
  }

  if (
    !isPlainObject(storedValue)
    || !Object.prototype.hasOwnProperty.call(storedValue, "data")
  ) {
    throw new Error(`Stored value "${storageKey}" is not a valid app value.`);
  }
  return storedValue.data;
}

function listStorageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") {
      keys.push(key);
    }
  }
  return keys.sort();
}

function collectPrefixedEntries(storage, keys, prefix) {
  return keys
    .filter(key => key.indexOf(prefix) === 0)
    .map(storageKey => ({
      storageKey,
      value: readLockrValue(storage, storageKey)
    }));
}

export function collectSaveData(storage = localStorage) {
  const storageKeys = listStorageKeys(storage);
  return {
    options: readLockrValue(storage, SAVE_DATA_STORAGE_KEYS.options),
    adaptiveOptions: readLockrValue(
      storage,
      SAVE_DATA_STORAGE_KEYS.adaptiveOptions
    ),
    adaptiveProgress: readLockrValue(
      storage,
      SAVE_DATA_STORAGE_KEYS.adaptiveProgress
    ),
    adaptiveHistory: readLockrValue(
      storage,
      SAVE_DATA_STORAGE_KEYS.adaptiveHistory
    ),
    adaptiveProgressMidi: readLockrValue(
      storage,
      SAVE_DATA_STORAGE_KEYS.adaptiveProgressMidi
    ),
    adaptiveHistoryMidi: readLockrValue(
      storage,
      SAVE_DATA_STORAGE_KEYS.adaptiveHistoryMidi
    ),
    roundHistory: readLockrValue(storage, SAVE_DATA_STORAGE_KEYS.roundHistory),
    prestigeArchive: readLockrValue(storage, SAVE_DATA_STORAGE_KEYS.prestigeArchive),
    statistics: {
      legacyLastScores: readLockrValue(
        storage,
        SAVE_DATA_STORAGE_KEYS.legacyLastScores
      ),
      legacyRecord: readLockrValue(
        storage,
        SAVE_DATA_STORAGE_KEYS.legacyRecord
      ),
      scoreEntries: collectPrefixedEntries(
        storage,
        storageKeys,
        SCORE_STORAGE_PREFIX
      ),
      recordEntries: collectPrefixedEntries(
        storage,
        storageKeys,
        RECORD_STORAGE_PREFIX
      )
    }
  };
}

function normalizeCreatedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("A backup needs a valid creation date.");
  }
  return date.toISOString();
}

export function createSaveDataBackup(storage = localStorage, options = {}) {
  const data = collectSaveData(storage);
  const createdAt = options.createdAt === undefined
    ? new Date()
    : options.createdAt;
  return {
    format: SAVE_DATA_BACKUP_FORMAT,
    version: SAVE_DATA_BASE_VERSION,
    app: {
      name: "Noten Pfoten",
      version: String(options.appVersion || packageMetadata.version)
    },
    createdAt: normalizeCreatedAt(createdAt),
    data
  };
}

function isValidStoredEntry(entry, expectedValueType) {
  if (!isPlainObject(entry) || typeof entry.storageKey !== "string") {
    return false;
  }
  return expectedValueType(entry.value);
}

function isValidStoredEntryList(entries, prefix, expectedValueType) {
  if (!Array.isArray(entries)) {
    return false;
  }
  const seenKeys = {};
  return entries.every(entry => {
    if (
      !isValidStoredEntry(entry, expectedValueType)
      || entry.storageKey.indexOf(prefix) !== 0
      || seenKeys[entry.storageKey]
    ) {
      return false;
    }
    seenKeys[entry.storageKey] = true;
    return true;
  });
}

function hasValidMidiProgress(data, backupVersion) {
  const hasProgress = hasOwn(data, "adaptiveProgressMidi");
  const hasHistory = hasOwn(data, "adaptiveHistoryMidi");
  if (backupVersion >= 2 && (!hasProgress || !hasHistory)) {
    return false;
  }
  return Boolean(
    (!hasProgress || isNullableObject(data.adaptiveProgressMidi))
    && (!hasHistory || isNullableAdaptiveHistory(data.adaptiveHistoryMidi))
  );
}

function isValidNoteFlowRounds(rounds) {
  if (!isPlainObject(rounds) || !Array.isArray(rounds.screen)
    || !Array.isArray(rounds.midi)
    || (hasOwn(rounds, "chordMidi") && !Array.isArray(rounds.chordMidi))) {
    return false;
  }
  const seen = new Set();
  return ["screen", "midi", "chordMidi"].every(group =>
    (rounds[group] || []).every(round => {
    if (!isPlainObject(round) || typeof round.id !== "string" || !round.id
      || !isPlainObject(round.settings)
      || (group !== "screen") !== (round.settings.inputMode === "midi")
      || (group === "chordMidi") !== (round.exerciseType === "chord")
      || (hasOwn(round.settings, "movement") && !NOTE_FLOW_MOVEMENTS.includes(round.settings.movement))
      || ((hasOwn(round.settings, "algorithmSettings") || round.settings.movement === "custom")
        && !isValidNoteFlowAlgorithmSettings(round.settings.algorithmSettings,
          round.exerciseType === "chord" ? "chord" : "melody"))
      || seen.has(round.id)) {
      return false;
    }
    seen.add(round.id);
    return true;
  }));
}

function isValidRhythmSenseBars(bars) {
  if (!Array.isArray(bars)) return false;
  const seen = new Set();
  return bars.every(bar => {
    if (!isPlainObject(bar) || typeof bar.id !== "string" || !bar.id
      || seen.has(bar.id) || typeof bar.sessionId !== "string" || !bar.sessionId
      || !Number.isInteger(bar.barNumber) || bar.barNumber < 1
      || typeof bar.completedAt !== "string"
      || !Number.isFinite(Date.parse(bar.completedAt))
      || !isPlainObject(bar.settings)
      || ["4/4", "3/4", "2/4", "6/8", "9/8"].indexOf(bar.settings.meter) === -1
      || ![60, 80, 100, 120].includes(bar.settings.bpm)
      || (hasOwn(bar.settings, "noteValues") && !isValidRhythmSenseNoteValues(bar.settings.noteValues))
      || !isPlainObject(bar.score) || !isPlainObject(bar.timing)
      || !Array.isArray(bar.notes)) return false;
    seen.add(bar.id);
    return bar.notes.every(note => isPlainObject(note)
      && typeof note.beat === "number" && Number.isFinite(note.beat)
      && typeof note.value === "string"
      && ["correct", "early", "late", "missed"].includes(note.result)
      && isNullableFiniteNumber(note.offsetMs));
  });
}

// Used by the bounded import staging area. The complete backup validator
// still runs on the small metadata shell; large lists are checked per item.
export function validateStreamedBackupRecord(section, record) {
  if (section === "data.adaptiveHistory.baselines"
    || section === "data.adaptiveHistoryMidi.baselines") {
    const history = normalizeAdaptiveHistory({
      version: ADAPTIVE_HISTORY_VERSION,
      baselines: [record], evaluations: []
    });
    return history.baselines.length === 1
      ? { valid: true, identity: history.baselines[0].id }
      : { valid: false, identity: null };
  }
  if (section === "data.adaptiveHistory.evaluations"
    || section === "data.adaptiveHistoryMidi.evaluations") {
    const history = normalizeAdaptiveHistory({
      version: ADAPTIVE_HISTORY_VERSION,
      baselines: [], evaluations: [record]
    });
    return history.evaluations.length === 1
      ? { valid: true, identity: history.evaluations[0].id }
      : { valid: false, identity: null };
  }
  if (section === "data.roundHistory" || section === "data.roundHistory.rounds") {
    return { valid: isNullableRoundHistory([record]), identity: record && record.id };
  }
  if (section.indexOf("data.noteFlowRounds.") === 0) {
    const group = section.slice("data.noteFlowRounds.".length);
    if (["screen", "midi", "chordMidi"].indexOf(group) === -1) {
      return { valid: false, identity: null };
    }
    const rounds = { screen: [], midi: [], chordMidi: [] };
    rounds[group].push(record);
    return { valid: isValidNoteFlowRounds(rounds), identity: record && record.id };
  }
  if (section === "data.rhythmSenseBars") {
    return { valid: isValidRhythmSenseBars([record]), identity: record && record.id };
  }
  return { valid: false, identity: null };
}

function isValidBackupData(data, backupVersion) {
  if (Object.prototype.hasOwnProperty.call(data || {}, "prestigeArchive")
    && data.prestigeArchive !== null) {
    try { normalizePrestigeArchive(data.prestigeArchive); }
    catch (error) { return false; }
  }
  if (
    !isPlainObject(data)
    || (backupVersion >= 6 && !hasOwn(data, "dailyTaskHistory"))
    || (hasOwn(data, "dailyTaskHistory") && (backupVersion < 6
      || !isValidDailyTaskHistoryBackup(data.dailyTaskHistory)))
    || !isValidNormalOptions(data.options)
    || (hasOwn(data, "workshopLibrary") && !isValidWorkshopLibrary(data.workshopLibrary))
    || !isValidAdaptiveOptions(data.adaptiveOptions)
    || !isNullableObject(data.adaptiveProgress)
    || !isNullableAdaptiveHistory(data.adaptiveHistory)
    || !hasValidMidiProgress(data, backupVersion)
    || !isNullableRoundHistory(data.roundHistory)
    || !isPlainObject(data.statistics)
    || (backupVersion >= 3 && hasOwn(data, "noteFlowRounds")
      && !isValidNoteFlowRounds(data.noteFlowRounds))
    || (backupVersion === 4 || (backupVersion >= 5 && hasOwn(data, "rhythmSenseBars"))
      ? !hasOwn(data, "rhythmSenseBars") || !isValidRhythmSenseBars(data.rhythmSenseBars)
      : backupVersion < 4 && hasOwn(data, "rhythmSenseBars"))
  ) {
    return false;
  }
  return Boolean(
    isNullableNumberArray(data.statistics.legacyLastScores)
    && isNullableFiniteNumber(data.statistics.legacyRecord)
    && isValidStoredEntryList(
      data.statistics.scoreEntries,
      SCORE_STORAGE_PREFIX,
      isNullableNumberArray
    )
    && isValidStoredEntryList(
      data.statistics.recordEntries,
      RECORD_STORAGE_PREFIX,
      isNullableFiniteNumber
    )
  );
}

export function validateSaveDataBackup(backup) {
  const errors = [];
  if (!isPlainObject(backup)) {
    return {
      valid: false,
      errors: [BACKUP_VALIDATION_ERRORS.invalidDocument]
    };
  }
  if (backup.format !== SAVE_DATA_BACKUP_FORMAT) {
    errors.push(BACKUP_VALIDATION_ERRORS.wrongFormat);
  }
  if (!Number.isInteger(backup.version) || backup.version < 1) {
    errors.push(BACKUP_VALIDATION_ERRORS.invalidVersion);
  } else if (backup.version > SAVE_DATA_BACKUP_VERSION) {
    errors.push(BACKUP_VALIDATION_ERRORS.newerVersion);
  }
  if (!Object.prototype.hasOwnProperty.call(backup, "data")) {
    errors.push(BACKUP_VALIDATION_ERRORS.missingData);
  } else if (backup.version <= SAVE_DATA_BACKUP_VERSION
    && !isValidBackupData(backup.data, backup.version)) {
    errors.push(BACKUP_VALIDATION_ERRORS.invalidData);
  }
  if (
    !isPlainObject(backup.app)
    || backup.app.name !== "Noten Pfoten"
    || typeof backup.app.version !== "string"
    || typeof backup.createdAt !== "string"
    || !Number.isFinite(new Date(backup.createdAt).getTime())
  ) {
    errors.push(BACKUP_VALIDATION_ERRORS.invalidData);
  }
  return {
    valid: errors.length === 0,
    errors: errors.filter((error, index) => errors.indexOf(error) === index)
  };
}

export function normalizeSaveDataBackup(backup) {
  const validation = validateSaveDataBackup(backup);
  if (!validation.valid) {
    return null;
  }
  const normalized = JSON.parse(JSON.stringify(backup));
  // Version-five backups may contain the old workshop library. Keep validating
  // those files, but importing app settings or learning data never owns the
  // separate local workshop or its practice statistics.
  delete normalized.data.workshopLibrary;
  delete normalized.data.workshopPracticeStatistics;
  if (!hasOwn(normalized.data, "adaptiveProgressMidi")) {
    normalized.data.adaptiveProgressMidi = null;
  }
  if (!hasOwn(normalized.data, "prestigeArchive")) {
    normalized.data.prestigeArchive = null;
  }
  if (!hasOwn(normalized.data, "adaptiveHistoryMidi")) {
    normalized.data.adaptiveHistoryMidi = null;
  }
  normalized.version = backup.version >= 3
    ? backup.version
    : SAVE_DATA_BASE_VERSION;
  return normalized;
}

export function parseSaveDataBackup(jsonText) {
  let backup;
  try {
    backup = JSON.parse(jsonText);
  } catch (error) {
    return {
      valid: false,
      errors: [BACKUP_VALIDATION_ERRORS.invalidJson],
      backup: null
    };
  }
  const validation = validateSaveDataBackup(backup);
  return Object.assign({}, validation, {
    backup: validation.valid ? backup : null
  });
}

export function summarizeSaveDataBackup(backup) {
  const validation = validateSaveDataBackup(backup);
  if (!validation.valid) {
    return null;
  }
  const roundHistory = backup.data.roundHistory;
  const rounds = Array.isArray(roundHistory)
    ? roundHistory
    : roundHistory && Array.isArray(roundHistory.rounds)
      ? roundHistory.rounds
      : [];
  const summarizeProgress = progress => {
    const notes = progress && isPlainObject(progress.notes)
      ? progress.notes
      : {};
    const attempts = Object.keys(notes).reduce((total, key) => {
      const noteAttempts = Number(notes[key] && notes[key].attempts);
      return total + (
        Number.isFinite(noteAttempts) && noteAttempts > 0 ? noteAttempts : 0
      );
    }, 0);
    return {
      practicedNotes: Object.keys(notes).length,
      attempts: Math.floor(attempts)
    };
  };
  const screenProgress = summarizeProgress(backup.data.adaptiveProgress);
  const midiProgress = summarizeProgress(backup.data.adaptiveProgressMidi);
  const practicedAdaptiveNotes = (
    screenProgress.practicedNotes + midiProgress.practicedNotes
  );
  const adaptiveAttempts = screenProgress.attempts + midiProgress.attempts;

  const summary = {
    createdAt: backup.createdAt,
    appVersion: backup.app.version,
    normalRounds: rounds.length,
    practicedAdaptiveNotes,
    adaptiveAttempts,
    screenPracticedAdaptiveNotes: screenProgress.practicedNotes,
    screenAdaptiveAttempts: screenProgress.attempts,
    midiPracticedAdaptiveNotes: midiProgress.practicedNotes,
    midiAdaptiveAttempts: midiProgress.attempts,
    hasNormalOptions: backup.data.options !== null,
    hasAdaptiveOptions: backup.data.adaptiveOptions !== null
  };
  return summary;
}

export default {
  SAVE_DATA_BACKUP_FORMAT,
  SAVE_DATA_BACKUP_VERSION,
  SAVE_DATA_STORAGE_KEYS,
  SCORE_STORAGE_PREFIX,
  RECORD_STORAGE_PREFIX,
  BACKUP_VALIDATION_ERRORS,
  collectSaveData,
  createSaveDataBackup,
  validateSaveDataBackup,
  normalizeSaveDataBackup,
  parseSaveDataBackup,
  summarizeSaveDataBackup
};
