import Utils from "./Utils";
import {
  getNoteRange,
  getEligibleCustomPianoClefs,
  getPlayableCustomNoteValues,
  hasTrebleAndBassClefs
} from "./NoteRanges";
import {
  normalizeSingleNoteClefs
} from "./ClefSelection";

function getAccidentalVariants(value, accidentals) {
  const hasAccidental = Utils.hasAccidental(value);
  if (!hasAccidental) {
    return [{ isSharp: true }];
  }
  switch (accidentals) {
    case "onlySharp":
      return [{ isSharp: true }];
    case "onlyFlat":
      return [{ isSharp: false }];
    case "sharpAndFlat":
      return [{ isSharp: true }, { isSharp: false }];
    default:
      return [];
  }
}

function getStaffVariants(value, options, clefs) {
  if (hasTrebleAndBassClefs(clefs)) {
    return getEligibleCustomPianoClefs(
      value,
      options.customTrebleMinValue,
      options.customBassMaxValue,
      options.customMinValue,
      options.customMaxValue
    ).map(clef => ({ clef, staff: clef }));
  }
  return clefs.map(clef => ({ clef, staff: clef }));
}

export function createAdaptiveCandidates(options) {
  const source = options || {};
  const clefs = normalizeSingleNoteClefs(source.clef);
  const singleClef = clefs[0] === "bass" ? "bass" : "treble";
  const trebleMin = source.customTrebleMinValue === undefined
    ? source.customMinValue
    : source.customTrebleMinValue;
  const bassMax = source.customBassMaxValue === undefined
    ? source.customMaxValue
    : source.customBassMaxValue;
  const range = getNoteRange(
    singleClef,
    "custom",
    singleClef === "bass"
      ? source.customMinValue
      : trebleMin,
    singleClef === "bass"
      ? bassMax
      : source.customMaxValue
  );
  const usesIndependentClefRanges = hasTrebleAndBassClefs(clefs);
  const noteValues = usesIndependentClefRanges
    ? getPlayableCustomNoteValues(
      source.customMinValue,
      source.customMaxValue,
      source.customTrebleMinValue,
      source.customBassMaxValue
    )
    : Array.from(
      { length: range.max - range.min + 1 },
      (unused, index) => range.min + index
    );
  const candidates = [];

  noteValues.forEach(value => {
    const accidentals = getAccidentalVariants(value, source.accidentals);
    const staves = getStaffVariants(value, source, clefs);
    staves.forEach(staff => {
      accidentals.forEach(accidental => {
        candidates.push({
          clef: staff.clef,
          staff: staff.staff,
          value,
          isSharp: accidental.isSharp
        });
      });
    });
  });
  return candidates;
}

export default {
  createAdaptiveCandidates
};
