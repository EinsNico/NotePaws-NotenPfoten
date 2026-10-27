// Match the combined bass + treble range used by the normal difficulty.
export const DEFAULT_CUSTOM_MIN_VALUE = 28; // E2, normal bass minimum
export const DEFAULT_CUSTOM_MAX_VALUE = 69; // A5, normal treble maximum
export const DEFAULT_CUSTOM_TREBLE_MIN_VALUE = 48; // C4
export const DEFAULT_CUSTOM_BASS_MAX_VALUE = 48; // C4
export const CUSTOM_DEFAULTS_VERSION = 2;

const LEGACY_DEFAULT_CUSTOM_MIN_VALUE = 48;
const LEGACY_DEFAULT_CUSTOM_MAX_VALUE = 60;
const LEGACY_DEFAULT_CUSTOM_TREBLE_MIN_VALUE = 36;
const LEGACY_DEFAULT_CUSTOM_BASS_MAX_VALUE = 60;
export const MIN_CUSTOM_VALUE = 12;
// The preview draws the complete final octave through B7. Every visible key
// must also be reachable by its range handles and select controls.
export const MAX_CUSTOM_VALUE = 95;

const ranges = {
  bass: {
    easy: { min: 36, max: 48 },
    normal: { min: 28, max: 48 },
    hard: { min: 19, max: 57 }
  },
  treble: {
    easy: { min: 48, max: 60 },
    normal: { min: 48, max: 69 },
    hard: { min: 40, max: 77 }
  },
  alto: {
    easy: { min: 43, max: 55 },
    normal: { min: 36, max: 60 },
    hard: { min: 29, max: 67 }
  },
  tenor: {
    easy: { min: 43, max: 55 },
    normal: { min: 36, max: 60 },
    hard: { min: 26, max: 64 }
  }
};

export function clampCustomValue(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(MAX_CUSTOM_VALUE, Math.max(MIN_CUSTOM_VALUE, Math.round(numericValue)));
}

export function migrateLegacyCustomDefaults(options) {
  if (!options || typeof options !== "object") {
    return { options, migrated: false };
  }
  if (Number(options.customDefaultsVersion) >= CUSTOM_DEFAULTS_VERSION) {
    return { options, migrated: false };
  }

  const migratedOptions = Object.assign({}, options);
  if (
    Number(migratedOptions.customMinValue) === LEGACY_DEFAULT_CUSTOM_MIN_VALUE
    && Number(migratedOptions.customMaxValue) === LEGACY_DEFAULT_CUSTOM_MAX_VALUE
  ) {
    migratedOptions.customMinValue = DEFAULT_CUSTOM_MIN_VALUE;
    migratedOptions.customMaxValue = DEFAULT_CUSTOM_MAX_VALUE;
  }
  if (
    Number(migratedOptions.customTrebleMinValue)
      === LEGACY_DEFAULT_CUSTOM_TREBLE_MIN_VALUE
    && Number(migratedOptions.customBassMaxValue)
      === LEGACY_DEFAULT_CUSTOM_BASS_MAX_VALUE
  ) {
    migratedOptions.customTrebleMinValue = DEFAULT_CUSTOM_TREBLE_MIN_VALUE;
    migratedOptions.customBassMaxValue = DEFAULT_CUSTOM_BASS_MAX_VALUE;
  }
  migratedOptions.customDefaultsVersion = CUSTOM_DEFAULTS_VERSION;
  return { options: migratedOptions, migrated: true };
}

export function getNoteRange(clef, difficulty, customMin, customMax) {
  if (difficulty === "custom") {
    const min = clampCustomValue(customMin, DEFAULT_CUSTOM_MIN_VALUE);
    const max = clampCustomValue(customMax, DEFAULT_CUSTOM_MAX_VALUE);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }

  const clefRanges = ranges[clef] || ranges.treble;
  return clefRanges[difficulty] || clefRanges.hard;
}

export const NOTE_RANGE_PRESETS = Object.freeze(["easy", "normal", "hard"]);

// Presets change only the ranges of the currently selected clefs/hands.
export function getRangePresetValues(preset, clefs = ["bass", "treble"]) {
  if (!NOTE_RANGE_PRESETS.includes(preset)) return {};
  const selected = Array.isArray(clefs) ? clefs : ["treble"];
  const values = {};
  if (selected.includes("bass") || selected.includes("piano")) {
    const range = getNoteRange("bass", preset);
    values.customMinValue = range.min;
    values.customBassMaxValue = range.max;
  }
  if (selected.includes("treble") || selected.includes("piano") || selected.length === 0) {
    const range = getNoteRange("treble", preset);
    values.customTrebleMinValue = range.min;
    values.customMaxValue = range.max;
  }
  return values;
}

export function getEditableRangeValues(options) {
  const limits = getCustomRangeLimits(options.customMinValue, options.customMaxValue,
    options.customTrebleMinValue, options.customBassMaxValue);
  return Object.assign({customMinValue: limits.min, customMaxValue: limits.max,
    customTrebleMinValue: limits.trebleMin, customBassMaxValue: limits.bassMax},
  getRangePresetValues(options.difficulty, options.clef));
}

export function getMatchingRangePreset(options, clefs = options.clef) {
  const values = getEditableRangeValues(options);
  return NOTE_RANGE_PRESETS.find(preset => {
    const target = getRangePresetValues(preset, clefs);
    const fields = Object.keys(target);
    return fields.length > 0 && fields.every(field => values[field] === target[field]);
  }) || null;
}

export function getNaturalNoteValues() {
  const naturalPitchClasses = [0, 2, 4, 5, 7, 9, 11];
  const values = [];
  for (let value = MIN_CUSTOM_VALUE; value <= MAX_CUSTOM_VALUE; value += 1) {
    if (naturalPitchClasses.indexOf(value % 12) !== -1) {
      values.push(value);
    }
  }
  return values;
}

export function getCustomPianoLimits(customTrebleMin, customBassMax) {
  const trebleMin = clampCustomValue(
    customTrebleMin,
    DEFAULT_CUSTOM_TREBLE_MIN_VALUE
  );
  const bassMax = clampCustomValue(
    customBassMax,
    DEFAULT_CUSTOM_BASS_MAX_VALUE
  );
  return {
    trebleMin,
    bassMax
  };
}

export function getCustomRangeLimits(
  customMin,
  customMax,
  customTrebleMin,
  customBassMax
) {
  const min = clampCustomValue(customMin, DEFAULT_CUSTOM_MIN_VALUE);
  const max = clampCustomValue(customMax, DEFAULT_CUSTOM_MAX_VALUE);
  const requestedTrebleMin = clampCustomValue(
    customTrebleMin,
    DEFAULT_CUSTOM_TREBLE_MIN_VALUE
  );
  const trebleMin = Math.min(max, requestedTrebleMin);
  const requestedBassMax = clampCustomValue(
    customBassMax,
    DEFAULT_CUSTOM_BASS_MAX_VALUE
  );
  const bassMax = Math.max(min, requestedBassMax);
  return { min, max, trebleMin, bassMax };
}

export function getEligibleCustomPianoClefs(
  noteValue,
  customTrebleMin,
  customBassMax,
  customBassMin = MIN_CUSTOM_VALUE,
  customTrebleMax = MAX_CUSTOM_VALUE
) {
  const limits = getCustomPianoLimits(customTrebleMin, customBassMax);
  const bassMin = clampCustomValue(customBassMin, MIN_CUSTOM_VALUE);
  const trebleMax = clampCustomValue(customTrebleMax, MAX_CUSTOM_VALUE);
  const clefs = [];
  if (noteValue >= bassMin && noteValue <= limits.bassMax) {
    clefs.push("bass");
  }
  if (noteValue >= limits.trebleMin && noteValue <= trebleMax) {
    clefs.push("treble");
  }
  return clefs;
}

export function getPlayableCustomNoteValues(
  customMin,
  customMax,
  customTrebleMin,
  customBassMax
) {
  const limits = getCustomRangeLimits(
    customMin,
    customMax,
    customTrebleMin,
    customBassMax
  );
  const range = {
    min: Math.min(limits.min, limits.trebleMin),
    max: Math.max(limits.bassMax, limits.max)
  };
  const values = [];
  for (let value = range.min; value <= range.max; value += 1) {
    if (
      getEligibleCustomPianoClefs(
        value,
        limits.trebleMin,
        limits.bassMax,
        limits.min,
        limits.max
      ).length > 0
    ) {
      values.push(value);
    }
  }
  return values;
}

export function hasTrebleAndBassClefs(clefs) {
  if (!Array.isArray(clefs)) {
    return false;
  }
  return clefs.indexOf("treble") !== -1 && clefs.indexOf("bass") !== -1;
}

export function usesCustomClefAssignment(clefs) {
  return Array.isArray(clefs)
    && (clefs.indexOf("piano") !== -1 || hasTrebleAndBassClefs(clefs));
}

export function getStatisticsDifficulty(options) {
  if (options.difficulty !== "custom") {
    return options.difficulty;
  }
  const limits = getCustomRangeLimits(
    options.customMinValue,
    options.customMaxValue,
    options.customTrebleMinValue,
    options.customBassMaxValue
  );
  if (usesCustomClefAssignment(options.clef)) {
    const followsLegacyOrder = limits.min <= limits.trebleMin
      && limits.bassMax <= limits.max;
    if (followsLegacyOrder) {
      return `custom-${limits.min}-${limits.max}-piano-${limits.trebleMin}-${limits.bassMax}`;
    }
    return `custom-independent-bass-${limits.min}-${limits.bassMax}`
      + `-treble-${limits.trebleMin}-${limits.max}`;
  }
  const selectedClefs = Array.isArray(options.clef) ? options.clef : [];
  const bassOnly = selectedClefs.indexOf("bass") !== -1
    && selectedClefs.indexOf("treble") === -1
    && selectedClefs.indexOf("piano") === -1;
  const range = getNoteRange(
    bassOnly ? "bass" : "treble",
    options.difficulty,
    bassOnly ? limits.min : limits.trebleMin,
    bassOnly ? limits.bassMax : limits.max
  );
  return `custom-${range.min}-${range.max}`;
}

export default {
  getNoteRange,
  migrateLegacyCustomDefaults,
  getNaturalNoteValues,
  getCustomPianoLimits,
  getCustomRangeLimits,
  getEligibleCustomPianoClefs,
  getPlayableCustomNoteValues,
  hasTrebleAndBassClefs,
  usesCustomClefAssignment,
  getStatisticsDifficulty
};
