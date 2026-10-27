export const RHYTHM_SENSE_NOTE_VALUES = Object.freeze([
  "whole", "half", "quarter", "eighth", "sixteenth", "thirtySecond", "sixtyFourth"
]);
export const DEFAULT_RHYTHM_SENSE_NOTE_VALUES = Object.freeze(["whole", "half", "quarter"]);

export function isValidRhythmSenseNoteValues(value) {
  return Array.isArray(value) && value.length > 0
    && Array.from(value).every((entry, index) => RHYTHM_SENSE_NOTE_VALUES.indexOf(entry) !== -1
      && value.indexOf(entry) === index);
}

export function normalizeRhythmSensePreferences(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    noteValues: isValidRhythmSenseNoteValues(source.noteValues)
      ? source.noteValues.slice() : DEFAULT_RHYTHM_SENSE_NOTE_VALUES.slice(),
    previewVibration: source.previewVibration === true,
    tapVibration: source.tapVibration === true
  };
}

// Local malformed settings receive defaults; imported backups must instead be
// rejected before any stored settings or learning records can be replaced.
export function isValidRhythmSensePreferences(value) {
  return value === null || Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.keys(value).length === 3
    && Object.prototype.hasOwnProperty.call(value, "noteValues")
    && Object.prototype.hasOwnProperty.call(value, "previewVibration")
    && Object.prototype.hasOwnProperty.call(value, "tapVibration")
    && isValidRhythmSenseNoteValues(value.noteValues)
    && typeof value.previewVibration === "boolean"
    && typeof value.tapVibration === "boolean");
}
