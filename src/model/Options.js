import * as Lockr from "lockr";
import { writeVerified } from "./VerifiedPersistence";
import { reportPersistenceFailure, clearPersistenceFailure, hasPersistenceFailure } from "./PersistenceFeedback";
import {
  DEFAULT_CUSTOM_MIN_VALUE,
  DEFAULT_CUSTOM_MAX_VALUE,
  DEFAULT_CUSTOM_TREBLE_MIN_VALUE,
  DEFAULT_CUSTOM_BASS_MAX_VALUE,
  CUSTOM_DEFAULTS_VERSION,
  getCustomRangeLimits,
  migrateLegacyCustomDefaults
} from "./NoteRanges";
import {
  CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION,
  migrateLegacyCustomRangeClefs,
  SINGLE_NOTE_ALLOWED_CLEFS,
  normalizeSingleNoteClefs
} from "./ClefSelection";
import { normalizeNoteNaming } from "./NoteNaming";
import { DEFAULT_APP_VOLUME, normalizeAppVolume } from "./AppVolume";
import { normalizeNoteFlowMovement } from "./NoteFlowMovement";
import { normalizeRhythmSensePreferences } from "./RhythmSensePreferences";
import { DEFAULT_PREPARATION_SECONDS, normalizePreparationSeconds } from "./PracticePreparation";

export const NORMAL_ALLOWED_CLEFS = SINGLE_NOTE_ALLOWED_CLEFS;

function persistOptions(options) {
  const saved = writeVerified(Lockr, "options", options);
  if (saved) clearPersistenceFailure("options");
  else reportPersistenceFailure("options", "PERSISTENCE_OPTIONS", () => options.saveOptions());
  return saved;
}

export default {
  inputMode: "button",
  gameLength: 60,
  clef: ["treble"],
  difficulty: "easy",
  customMinValue: DEFAULT_CUSTOM_MIN_VALUE,
  customMaxValue: DEFAULT_CUSTOM_MAX_VALUE,
  customTrebleMinValue: DEFAULT_CUSTOM_TREBLE_MIN_VALUE,
  customBassMaxValue: DEFAULT_CUSTOM_BASS_MAX_VALUE,
  customDefaultsVersion: CUSTOM_DEFAULTS_VERSION,
  customClefDefaultsVersion: CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION,
  accidentals: "no",
  sound: true,
  keepScreenAwake: true,
  preparationSeconds: DEFAULT_PREPARATION_SECONDS,
  vibration: true,
  displayNote: true,
  language: null,
  noteNaming: null,
  appVolume: DEFAULT_APP_VOLUME,
  noteFlowMelodyMovement: "mixed",
  noteFlowChordMovement: "mixed",
  noteFlowMelodySettings: null,
  noteFlowChordSettings: null,
  rhythmSenseSettings: null,

  loadOptions() {
    if (hasPersistenceFailure("options")) return;
    const loadedOptions = Lockr.get("options");
    let shouldPersistMigration = false;
    if (loadedOptions) {
      if (!Object.prototype.hasOwnProperty.call(loadedOptions, "noteNaming")) {
        this.noteNaming = null;
      }
      const migration = migrateLegacyCustomDefaults(loadedOptions);
      Object.assign(this, migration.options);
      this.appVolume = normalizeAppVolume(loadedOptions.appVolume);
      this.convertOldClefValues();
      const clefMigration = migrateLegacyCustomRangeClefs(
        this.clef,
        loadedOptions.customClefDefaultsVersion,
        this.difficulty === "custom"
      );
      this.clef = clefMigration.clefs;
      this.customClefDefaultsVersion = clefMigration.defaultsVersion;
      shouldPersistMigration = migration.migrated || clefMigration.migrated;
    }
    const previousClefs = Array.isArray(this.clef) ? this.clef.slice() : [];
    const hasStoredSound = loadedOptions && Object.prototype.hasOwnProperty.call(loadedOptions, "sound");
    this.sound = loadedOptions
      ? !hasStoredSound || loadedOptions.sound === true : this.sound === true;
    shouldPersistMigration = shouldPersistMigration || Boolean(loadedOptions && !hasStoredSound);
    // Older backups must restore the default rather than a previous session's choice.
    this.keepScreenAwake = loadedOptions
      ? loadedOptions.keepScreenAwake !== false : this.keepScreenAwake !== false;
    this.vibration = loadedOptions
      ? loadedOptions.vibration !== false : this.vibration !== false;
    shouldPersistMigration = shouldPersistMigration || Boolean(loadedOptions
      && !Object.prototype.hasOwnProperty.call(loadedOptions, "keepScreenAwake"));
    shouldPersistMigration = shouldPersistMigration || Boolean(loadedOptions
      && loadedOptions.vibration !== this.vibration);
    this.preparationSeconds = normalizePreparationSeconds(loadedOptions
      ? loadedOptions.preparationSeconds : this.preparationSeconds);
    shouldPersistMigration = shouldPersistMigration || Boolean(loadedOptions
      && loadedOptions.preparationSeconds !== this.preparationSeconds);
    this.noteFlowMelodyMovement = normalizeNoteFlowMovement(loadedOptions ? loadedOptions.noteFlowMelodyMovement : this.noteFlowMelodyMovement);
    this.noteFlowChordMovement = normalizeNoteFlowMovement(loadedOptions ? loadedOptions.noteFlowChordMovement : this.noteFlowChordMovement);
    // An older restored backup must not retain settings from the previous session.
    this.noteFlowMelodySettings = loadedOptions && loadedOptions.noteFlowMelodySettings || null;
    this.noteFlowChordSettings = loadedOptions && loadedOptions.noteFlowChordSettings || null;
    this.rhythmSenseSettings = loadedOptions && loadedOptions.rhythmSenseSettings != null
      ? normalizeRhythmSensePreferences(loadedOptions.rhythmSenseSettings) : null;
    this.clef = normalizeSingleNoteClefs(this.clef);
    const removedUnavailableClef = previousClefs.length !== this.clef.length
      || previousClefs.some((clef, index) => clef !== this.clef[index]);
    this.sanitizeCustomRange();
    if (loadedOptions && (shouldPersistMigration || removedUnavailableClef)) {
      persistOptions(this);
    }
  },
  convertOldClefValues() {
    if (this.clef === 'all') {
      this.clef = ['treble', 'bass'];
    } else if (this.clef === 'treble' || this.clef === 'bass') {
      this.clef = [this.clef];
    }
  },
  sanitizeCustomRange() {
    const limits = getCustomRangeLimits(
      this.customMinValue,
      this.customMaxValue,
      this.customTrebleMinValue,
      this.customBassMaxValue
    );
    this.customMinValue = limits.min;
    this.customMaxValue = limits.max;
    this.customTrebleMinValue = limits.trebleMin;
    this.customBassMaxValue = limits.bassMax;
  },
  saveOptions() {
    this.clef = normalizeSingleNoteClefs(this.clef);
    this.sanitizeCustomRange();
    this.noteNaming = normalizeNoteNaming(this.noteNaming, this.language);
    this.appVolume = normalizeAppVolume(this.appVolume);
    this.sound = this.sound === true;
    this.keepScreenAwake = this.keepScreenAwake !== false;
    this.vibration = this.vibration !== false;
    this.preparationSeconds = normalizePreparationSeconds(this.preparationSeconds);
    this.noteFlowMelodyMovement = normalizeNoteFlowMovement(this.noteFlowMelodyMovement);
    this.noteFlowChordMovement = normalizeNoteFlowMovement(this.noteFlowChordMovement);
    this.rhythmSenseSettings = this.rhythmSenseSettings == null
      ? null : normalizeRhythmSensePreferences(this.rhythmSenseSettings);
    return persistOptions(this);
  }
};
