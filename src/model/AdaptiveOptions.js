import * as Lockr from "lockr";
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
  DEFAULT_CUSTOM_RANGE_CLEFS,
  migrateLegacyCustomRangeClefs,
  SINGLE_NOTE_ALLOWED_CLEFS,
  normalizeSingleNoteClefs
} from "./ClefSelection";

export const ADAPTIVE_ALLOWED_CLEFS = SINGLE_NOTE_ALLOWED_CLEFS;

const storedOptionNames = [
  "inputMode",
  "gameLength",
  "clef",
  "customMinValue",
  "customMaxValue",
  "customTrebleMinValue",
  "customBassMaxValue",
  "customDefaultsVersion",
  "customClefDefaultsVersion",
  "rangeExpansionEnabled",
  "accidentals",
  "sound",
  "vibration",
  "displayNote"
];

const AdaptiveOptions = {
  inputMode: "button",
  gameLength: 60,
  clef: DEFAULT_CUSTOM_RANGE_CLEFS.slice(),
  customMinValue: DEFAULT_CUSTOM_MIN_VALUE,
  customMaxValue: DEFAULT_CUSTOM_MAX_VALUE,
  customTrebleMinValue: DEFAULT_CUSTOM_TREBLE_MIN_VALUE,
  customBassMaxValue: DEFAULT_CUSTOM_BASS_MAX_VALUE,
  customDefaultsVersion: CUSTOM_DEFAULTS_VERSION,
  customClefDefaultsVersion: CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION,
  rangeExpansionEnabled: true,
  accidentals: "no",
  sound: false,
  vibration: true,
  displayNote: true,

  loadOptions() {
    const loadedOptions = Lockr.get("adaptiveOptions");
    if (
      !loadedOptions
      || typeof loadedOptions !== "object"
      || !Object.prototype.hasOwnProperty.call(
        loadedOptions,
        "rangeExpansionEnabled"
      )
    ) {
      this.rangeExpansionEnabled = true;
    }
    if (loadedOptions && typeof loadedOptions === "object") {
      const migration = migrateLegacyCustomDefaults(loadedOptions);
      storedOptionNames.forEach(name => {
        if (Object.prototype.hasOwnProperty.call(migration.options, name)) {
          this[name] = migration.options[name];
        }
      });
      const previousClefs = Array.isArray(this.clef) ? this.clef.slice() : [];
      const clefMigration = migrateLegacyCustomRangeClefs(
        normalizeSingleNoteClefs(this.clef),
        loadedOptions.customClefDefaultsVersion,
        true,
        ADAPTIVE_ALLOWED_CLEFS
      );
      this.clef = clefMigration.clefs;
      this.customClefDefaultsVersion = clefMigration.defaultsVersion;
      const changedClefs = previousClefs.length !== this.clef.length
        || previousClefs.some((clef, index) => clef !== this.clef[index]);
      if (migration.migrated || clefMigration.migrated || changedClefs) {
        this.saveOptions();
      }
    }
    this.sanitize();
  },

  sanitize() {
    if (typeof this.rangeExpansionEnabled !== "boolean") {
      this.rangeExpansionEnabled = true;
    }
    this.clef = normalizeSingleNoteClefs(this.clef);
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
    this.sanitize();
    const values = {};
    storedOptionNames.forEach(name => {
      values[name] = this[name];
    });
    Lockr.set("adaptiveOptions", values);
  }
};

export default AdaptiveOptions;
