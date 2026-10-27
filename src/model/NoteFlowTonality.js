import {
  createSeededNoteFlowRandom,
  deriveNoteFlowCycleSeed,
  normalizeNoteFlowConfig
} from "./NoteFlowStructure";

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const TONIC_PITCH_CLASSES = {
  "C-flat": 11,
  "G-flat": 6,
  "D-flat": 1,
  "A-flat": 8,
  "E-flat": 3,
  "B-flat": 10,
  F: 5,
  C: 0,
  G: 7,
  D: 2,
  A: 9,
  E: 4,
  B: 11,
  "F-sharp": 6,
  "C-sharp": 1,
  "G-sharp": 8,
  "D-sharp": 3,
  "A-sharp": 10
};

const MAJOR_TONICS_BY_FIFTHS = [
  "C-flat", "G-flat", "D-flat", "A-flat", "E-flat", "B-flat", "F",
  "C", "G", "D", "A", "E", "B", "F-sharp", "C-sharp"
];

const MINOR_TONICS_BY_FIFTHS = [
  "A-flat", "E-flat", "B-flat", "F", "C", "G", "D",
  "A", "E", "B", "F-sharp", "C-sharp", "G-sharp", "D-sharp", "A-sharp"
];

function getAccidentalType(fifths) {
  if (fifths > 0) {
    return "sharp";
  }
  if (fifths < 0) {
    return "flat";
  }
  return "none";
}

function getAlteredNotes(fifths) {
  if (fifths > 0) {
    return SHARP_ORDER.slice(0, fifths).map(note => ({ note, accidental: "sharp" }));
  }
  if (fifths < 0) {
    return FLAT_ORDER.slice(0, Math.abs(fifths)).map(note => ({ note, accidental: "flat" }));
  }
  return [];
}

function getScalePitchClasses(tonicPitchClass, mode) {
  const intervals = mode === "minor" ? MINOR_INTERVALS : MAJOR_INTERVALS;
  return intervals.map(interval => (tonicPitchClass + interval) % 12);
}

function createTonality(tonic, mode, fifths) {
  const tonicPitchClass = TONIC_PITCH_CLASSES[tonic];
  return Object.freeze({
    id: `${tonic}-${mode}`,
    tonic,
    tonicPitchClass,
    mode,
    fifths,
    circlePosition: ((fifths % 12) + 12) % 12,
    relativeKeyId: null,
    signature: Object.freeze({
      type: getAccidentalType(fifths),
      count: Math.abs(fifths),
      alteredNotes: Object.freeze(getAlteredNotes(fifths))
    }),
    scalePitchClasses: Object.freeze(getScalePitchClasses(tonicPitchClass, mode))
  });
}

const tonalitiesWithoutRelatives = [];
for (let fifths = -7; fifths <= 7; fifths += 1) {
  const index = fifths + 7;
  tonalitiesWithoutRelatives.push(
    createTonality(MAJOR_TONICS_BY_FIFTHS[index], "major", fifths),
    createTonality(MINOR_TONICS_BY_FIFTHS[index], "minor", fifths)
  );
}

export const NOTE_FLOW_TONALITIES = Object.freeze(
  tonalitiesWithoutRelatives.map(tonality => Object.freeze(Object.assign({}, tonality, {
    relativeKeyId: tonalitiesWithoutRelatives.find(candidate => (
      candidate.fifths === tonality.fifths && candidate.mode !== tonality.mode
    )).id
  })))
);

const TONALITY_BY_ID = NOTE_FLOW_TONALITIES.reduce((result, tonality) => {
  result[tonality.id] = tonality;
  return result;
}, {});

export function getNoteFlowTonality(id) {
  return TONALITY_BY_ID[id] || null;
}

export function isNoteFlowTonalityAllowed(tonality, accidentals) {
  if (!tonality) {
    return false;
  }
  if (accidentals === "sharpAndFlat") {
    return true;
  }
  if (accidentals === "onlySharp") {
    return tonality.fifths >= 0;
  }
  if (accidentals === "onlyFlat") {
    return tonality.fifths <= 0;
  }
  return tonality.fifths === 0;
}

export function getAvailableNoteFlowTonalities(accidentals = "no") {
  return NOTE_FLOW_TONALITIES.filter(tonality => (
    isNoteFlowTonalityAllowed(tonality, accidentals)
  ));
}

export function getNoteFlowCircleSegments() {
  return Array.from({ length: 12 }, (_, circlePosition) => ({
    circlePosition,
    tonalities: NOTE_FLOW_TONALITIES.filter(tonality => (
      tonality.circlePosition === circlePosition
    ))
  }));
}

function chooseRandomTonality(available, seed, previousKeyId) {
  const random = createSeededNoteFlowRandom(seed);
  let index = Math.floor(random() * available.length);
  if (
    available.length > 1
    && previousKeyId
    && available[index].id === previousKeyId
  ) {
    index = (index + 1 + Math.floor(random() * (available.length - 1)))
      % available.length;
  }
  return available[index];
}

export function resolveNoteFlowTonality(
  input = {},
  cycleIndex = 0,
  previousKeyId = null
) {
  const config = normalizeNoteFlowConfig(input);
  const available = getAvailableNoteFlowTonalities(config.accidentals);
  const requested = getNoteFlowTonality(config.selectedKey);
  const cycleSeed = deriveNoteFlowCycleSeed(config.seed, cycleIndex);
  let tonality;
  let fallbackReason = null;

  if (config.tonalityMode === "circle") {
    if (isNoteFlowTonalityAllowed(requested, config.accidentals)) {
      tonality = requested;
    } else {
      tonality = available.find(candidate => candidate.id === "C-major")
        || available[0];
      fallbackReason = requested ? "not-allowed" : "unknown-key";
    }
  } else {
    tonality = chooseRandomTonality(available, cycleSeed, previousKeyId);
  }

  return {
    selectionMode: config.tonalityMode,
    cycleIndex: Math.max(0, Math.round(Number(cycleIndex) || 0)),
    cycleSeed,
    key: tonality,
    availableKeyCount: available.length,
    displayKeySignature: config.tonalityMode === "circle",
    displayAccidentalsOnNotes: config.tonalityMode === "random",
    fallbackReason
  };
}

