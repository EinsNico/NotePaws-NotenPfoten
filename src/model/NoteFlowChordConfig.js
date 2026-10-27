import { getAvailableNoteFlowTonalities } from "./NoteFlowTonality";
import { normalizeNoteFlowBpm } from "./NoteFlowPlayback";
import { getNoteFlowDurationTicks, getNoteFlowMeter } from "./NoteFlowRhythm";
import { NOTE_FLOW_RHYTHM_VALUES } from "./NoteFlowMenuConfig";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings } from "./NoteFlowMovement";
import { clampCustomValue } from "./NoteRanges";

const VALID_ACCIDENTALS = ["no", "onlySharp", "onlyFlat", "sharpAndFlat"];
const VALID_ROUND_LENGTHS = [0, 20, 60, 300];
const DEFAULT_RHYTHM_VALUES = {
  "3/4": ["quarter", "eighth"],
  "4/4": ["quarter", "eighth"],
  "6/8": ["dotted-quarter", "eighth"]
};

function normalizeChordRhythmValues(requested, meter) {
  const source = Array.isArray(requested) ? requested : DEFAULT_RHYTHM_VALUES[meter.signature];
  const selected = NOTE_FLOW_RHYTHM_VALUES.filter(value => (
    source.indexOf(value) !== -1
    && getNoteFlowDurationTicks(value === "dotted-quarter" ? "quarter" : value,
      value === "dotted-quarter" ? 1 : 0) <= meter.durationTicks
  ));
  if (!selected.length) return DEFAULT_RHYTHM_VALUES[meter.signature].slice();
  if (!selected.some(value => meter.durationTicks
    % getNoteFlowDurationTicks(value === "dotted-quarter" ? "quarter" : value,
      value === "dotted-quarter" ? 1 : 0) === 0)) {
    selected.push(meter.signature === "6/8" ? "eighth" : "quarter");
  }
  return selected;
}

function requestedCount(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= minimum && numeric <= maximum ? numeric : fallback;
}

function handRange(options, hand, minField, maxField, defaultMin, defaultMax) {
  const requested = options.ranges && options.ranges[hand] || {};
  const minimum = clampCustomValue(options[minField] === undefined ? requested.min : options[minField], defaultMin);
  const maximum = clampCustomValue(options[maxField] === undefined ? requested.max : options[maxField], defaultMax);
  return { min: Math.min(minimum, maximum), max: Math.max(minimum, maximum) };
}

export function normalizeNoteFlowChordOptions(options = {}) {
  // Earlier settings counted only the right-hand grip; an optional bass root
  // was additional. Normalize that input once into the total-note contract.
  const requestedSize = requestedCount(options.chordSize, 3, 8, 3);
  const legacyBass = options.bassNote === true && options.handMode === undefined
    && options.bassNotesPerChord === undefined && options.trebleNotesPerChord === undefined
    && requestedSize <= 4;
  const chordSize = Math.min(8, requestedSize + (legacyBass ? 1 : 0));
  const handMode = options.handMode === "two"
    || options.handMode === undefined && options.bassNote === true ? "two" : "single";
  const singleHand = options.singleHand === "bass" ? "bass" : "treble";
  const bassCount = handMode === "single" ? (singleHand === "bass" ? chordSize : 0)
    : requestedCount(options.bassNotesPerChord, 1, chordSize - 1,
      chordSize - requestedCount(options.trebleNotesPerChord, 1, chordSize - 1, chordSize - 1));
  const ranges = {
    bass: handRange(options, "bass", "customMinValue", "customBassMaxValue", 28, legacyBass ? 43 : 48),
    treble: handRange(options, "treble", "customTrebleMinValue", "customMaxValue", 48, 71)
  };
  const accidentals = VALID_ACCIDENTALS.indexOf(options.accidentals) !== -1
    ? options.accidentals
    : "no";
  const available = getAvailableNoteFlowTonalities(accidentals);
  const selectedKey = available.some(key => key.id === options.selectedKey)
    ? options.selectedKey
    : "C-major";
  let meter;
  try {
    meter = getNoteFlowMeter(options.rhythmMeter || "4/4");
  } catch (error) {
    meter = getNoteFlowMeter("4/4");
  }

  return {
    chordSize,
    handMode,
    singleHand,
    bassNotesPerChord: bassCount,
    trebleNotesPerChord: chordSize - bassCount,
    ranges,
    customMinValue: ranges.bass.min,
    customBassMaxValue: ranges.bass.max,
    customTrebleMinValue: ranges.treble.min,
    customMaxValue: ranges.treble.max,
    movement: normalizeNoteFlowMovement(options.movement),
    algorithmSettings: normalizeNoteFlowAlgorithmSettings(options.algorithmSettings, "chord"),
    bassNote: bassCount > 0,
    inputMode: "midi",
    displayNote: typeof options.displayNote === "boolean" ? options.displayNote : true,
    bpm: normalizeNoteFlowBpm(options.bpm) || 33,
    gameLength: VALID_ROUND_LENGTHS.indexOf(Number(options.gameLength)) !== -1
      ? Number(options.gameLength) : 0,
    behavior: options.behavior === "continuous" ? "continuous" : "wait",
    tonalityMode: options.tonalityMode === "random" ? "random" : "circle",
    selectedKey,
    accidentals,
    rhythmMeter: meter.signature,
    rhythmValues: normalizeChordRhythmValues(options.rhythmValues, meter)
  };
}
