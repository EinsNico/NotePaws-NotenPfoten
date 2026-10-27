export const NOTE_NAMING_GERMAN = "german";
export const NOTE_NAMING_INTERNATIONAL = "international";

export const NOTE_NAMING_OPTIONS = [
  NOTE_NAMING_GERMAN,
  NOTE_NAMING_INTERNATIONAL
];

const GERMAN_SHARP_NAMES = [
  "C", "Cis", "D", "Dis", "E", "F",
  "Fis", "G", "Gis", "A", "Ais", "H"
];

const GERMAN_FLAT_NAMES = [
  "C", "Des", "D", "Es", "E", "F",
  "Ges", "G", "As", "A", "B", "H"
];

const INTERNATIONAL_SHARP_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F",
  "F♯", "G", "G♯", "A", "A♯", "B"
];

const INTERNATIONAL_FLAT_NAMES = [
  "C", "D♭", "D", "E♭", "E", "F",
  "G♭", "G", "A♭", "A", "B♭", "B"
];

export function normalizeNoteNaming(value, language = "de") {
  if (NOTE_NAMING_OPTIONS.indexOf(value) !== -1) {
    return value;
  }
  return language === "en"
    ? NOTE_NAMING_INTERNATIONAL
    : NOTE_NAMING_GERMAN;
}

export function getDisplayNoteNames(isSharp, noteNaming) {
  const normalizedNaming = normalizeNoteNaming(noteNaming);
  if (normalizedNaming === NOTE_NAMING_INTERNATIONAL) {
    return (isSharp ? INTERNATIONAL_SHARP_NAMES : INTERNATIONAL_FLAT_NAMES).slice();
  }
  return (isSharp ? GERMAN_SHARP_NAMES : GERMAN_FLAT_NAMES).slice();
}

export function formatDisplayNoteName(noteValue, isSharp, noteNaming) {
  const numericValue = Number(noteValue);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  const normalizedValue = ((Math.round(numericValue) % 12) + 12) % 12;
  return getDisplayNoteNames(isSharp, noteNaming)[normalizedValue];
}

function subscriptNumber(value) {
  const digits = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉"
  };
  return String(Math.abs(value)).split("").map(digit => digits[digit]).join("");
}

export function formatOctaveMarker(octave, noteNaming) {
  if (octave === null || octave === "" || typeof octave === "boolean") {
    return "";
  }
  const numericOctave = Number(octave);
  if (!Number.isInteger(numericOctave)) {
    return "";
  }
  if (normalizeNoteNaming(noteNaming) === NOTE_NAMING_INTERNATIONAL) {
    return `C${numericOctave}`;
  }
  if (numericOctave <= 1) {
    return `C${subscriptNumber(2 - numericOctave)}`;
  }
  if (numericOctave === 2) {
    return "C";
  }
  if (numericOctave === 3) {
    return "c";
  }
  return `c${"′".repeat(numericOctave - 3)}`;
}

export default {
  normalizeNoteNaming,
  getDisplayNoteNames,
  formatDisplayNoteName,
  formatOctaveMarker
};
