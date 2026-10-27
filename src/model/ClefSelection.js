const DEFAULT_ALLOWED_CLEFS = ["treble", "bass", "alto", "tenor", "piano"];
export const CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION = 1;
export const DEFAULT_CUSTOM_RANGE_CLEFS = ["bass", "treble"];
export const SINGLE_NOTE_ALLOWED_CLEFS = ["bass", "treble"];

// Retain both clef ranges when restoring the retired single-note piano mode.
export function normalizeSingleNoteClefs(clefs) {
  const requested = Array.isArray(clefs) ? clefs
    : clefs === "all" ? SINGLE_NOTE_ALLOWED_CLEFS : [clefs];
  const expanded = requested.reduce((all, clef) => all.concat(
    clef === "piano" ? SINGLE_NOTE_ALLOWED_CLEFS : clef
  ), []);
  return normalizeExclusivePianoClefs(expanded, SINGLE_NOTE_ALLOWED_CLEFS);
}

function getValidClefs(clefs, allowedClefs) {
  if (!Array.isArray(clefs)) {
    return [];
  }
  return clefs.filter((clef, index) => (
    allowedClefs.indexOf(clef) !== -1 && clefs.indexOf(clef) === index
  ));
}

export function normalizeExclusivePianoClefs(
  clefs,
  allowedClefs = DEFAULT_ALLOWED_CLEFS
) {
  const validClefs = getValidClefs(clefs, allowedClefs);
  if (validClefs.indexOf("piano") !== -1) {
    return ["piano"];
  }
  if (validClefs.length > 0) {
    return validClefs;
  }
  return allowedClefs.indexOf("treble") !== -1
    ? ["treble"]
    : [allowedClefs[0]];
}

export function updateExclusivePianoClefs(
  previousClefs,
  requestedClefs,
  allowedClefs = DEFAULT_ALLOWED_CLEFS
) {
  const previous = normalizeExclusivePianoClefs(previousClefs, allowedClefs);
  const requested = getValidClefs(requestedClefs, allowedClefs);

  if (requested.length === 0) {
    return previous;
  }
  const pianoWasSelected = previous.indexOf("piano") !== -1;
  const pianoIsRequested = requested.indexOf("piano") !== -1;

  if (!pianoWasSelected && pianoIsRequested) {
    return ["piano"];
  }
  if (pianoWasSelected && pianoIsRequested && requested.length > 1) {
    return requested.filter(clef => clef !== "piano");
  }
  return normalizeExclusivePianoClefs(requested, allowedClefs);
}

export function getDefaultCustomRangeClefs(
  allowedClefs = DEFAULT_ALLOWED_CLEFS
) {
  return DEFAULT_CUSTOM_RANGE_CLEFS.filter(
    clef => allowedClefs.indexOf(clef) !== -1
  );
}

export function migrateLegacyCustomRangeClefs(
  clefs,
  defaultsVersion,
  usesCustomRange,
  allowedClefs = DEFAULT_ALLOWED_CLEFS
) {
  const normalizedClefs = normalizeExclusivePianoClefs(clefs, allowedClefs);
  if (Number(defaultsVersion) >= CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION) {
    return {
      clefs: normalizedClefs,
      defaultsVersion: CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION,
      migrated: false
    };
  }

  const usedLegacyTrebleDefault = normalizedClefs.length === 1
    && normalizedClefs[0] === "treble";
  return {
    clefs: usesCustomRange && usedLegacyTrebleDefault
      ? getDefaultCustomRangeClefs(allowedClefs)
      : normalizedClefs,
    defaultsVersion: CUSTOM_RANGE_CLEFS_DEFAULTS_VERSION,
    migrated: true
  };
}

export default {
  normalizeExclusivePianoClefs,
  updateExclusivePianoClefs,
  getDefaultCustomRangeClefs,
  migrateLegacyCustomRangeClefs
};
