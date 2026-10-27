import { DEFAULT_POSITIONS_PER_BLOCK } from "./NoteFlowStructure";
import { getAvailableNoteFlowTonalities } from "./NoteFlowTonality";
import { getNoteFlowDurationTicks, getNoteFlowMeter } from "./NoteFlowRhythm";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings, getNoteFlowRhythmDensity } from "./NoteFlowMovement";

const VALID_CLEFS = ["bass", "treble"];
const VALID_MENU_CLEFS = ["bass", "treble", "piano"];
const VALID_ACCIDENTALS = ["no", "onlySharp", "onlyFlat", "sharpAndFlat"];
export const NOTE_FLOW_RHYTHM_VALUES = Object.freeze([
  "whole", "half", "quarter", "eighth", "sixteenth", "dotted-quarter"
]);
const DEFAULT_RHYTHM_VALUES = Object.freeze({
  treble: ["quarter", "eighth"],
  bass: ["half", "quarter"]
});

function rhythmDuration(value) {
  const dotted = value === "dotted-quarter";
  return getNoteFlowDurationTicks(dotted ? "quarter" : value, dotted ? 1 : 0);
}

function normalizeRhythmValues(values, hand, meter) {
  const source = Array.isArray(values) ? values : DEFAULT_RHYTHM_VALUES[hand];
  const allowed = NOTE_FLOW_RHYTHM_VALUES.filter(value => (
    source.indexOf(value) !== -1 && rhythmDuration(value) <= meter.durationTicks
  ));
  const selected = allowed.length ? allowed : DEFAULT_RHYTHM_VALUES[hand].slice();
  // The generator must always be able to fill a complete bar.
  if (!selected.some(value => meter.durationTicks % rhythmDuration(value) === 0)) {
    selected.push(meter.signature === "6/8" ? "eighth" : "quarter");
  }
  return selected;
}

export const NOTE_FLOW_SECONDARY_DENSITIES = Object.freeze(
  [1, 2, 4, 8, 16].filter(value => value <= DEFAULT_POSITIONS_PER_BLOCK)
);

export function applyNoteFlowMenuDependencies(menuOptions = {}) {
  const next = Object.assign({}, menuOptions);
  next.movement = normalizeNoteFlowMovement(next.movement);
  next.algorithmSettings = normalizeNoteFlowAlgorithmSettings(next.algorithmSettings);
  let meter;
  try {
    meter = getNoteFlowMeter(next.rhythmMeter || "4/4");
  } catch (error) {
    meter = getNoteFlowMeter("4/4");
  }
  next.rhythmMeter = meter.signature;
  const requestedValues = next.rhythmValues || {};
  next.rhythmValues = {
    treble: normalizeRhythmValues(requestedValues.treble, "treble", meter),
    bass: normalizeRhythmValues(requestedValues.bass, "bass", meter)
  };
  next.handMode = next.handMode === "two" ? "two" : "single";
  next.tonalityMode = next.tonalityMode === "random" ? "random" : "circle";
  next.accidentals = VALID_ACCIDENTALS.indexOf(next.accidentals) !== -1
    ? next.accidentals
    : "no";

  if (next.handMode === "two") {
    next.clef = ["bass", "treble"];
  } else {
    const requestedClefs = Array.isArray(next.clef) ? next.clef : [];
    next.clef = VALID_MENU_CLEFS.filter(clef => requestedClefs.indexOf(clef) !== -1);
    if (next.clef.indexOf("piano") !== -1) {
      next.clef = ["piano"];
    } else if (next.clef.length === 0) {
      next.clef = ["treble"];
    }
  }

  const density = Math.round(Number(next.secondaryNotesPerBlock));
  next.secondaryNotesPerBlock = NOTE_FLOW_SECONDARY_DENSITIES.indexOf(density) !== -1
    ? density
    : 4;

  const available = getAvailableNoteFlowTonalities(next.accidentals);
  if (!available.some(tonality => tonality.id === next.selectedKey)) {
    const cMajor = available.find(tonality => tonality.id === "C-major");
    next.selectedKey = (cMajor || available[0]).id;
  }
  return next;
}

function getAlgorithmClefs(menuOptions) {
  if (menuOptions.handMode === "two") {
    return ["bass", "treble"];
  }
  const selected = Array.isArray(menuOptions.clef) ? menuOptions.clef : [];
  if (selected.indexOf("piano") !== -1) {
    return ["bass", "treble"];
  }
  const clefs = VALID_CLEFS.filter(clef => selected.indexOf(clef) !== -1);
  return clefs.length > 0 ? clefs : ["treble"];
}

export function createNoteFlowConfigFromMenu(menuOptions = {}) {
  const resolved = applyNoteFlowMenuDependencies(menuOptions);
  const handMode = resolved.handMode;
  return {
    handMode,
    secondaryNotesPerBlock: handMode === "two"
      ? resolved.secondaryNotesPerBlock
      : 0,
    difficulty: resolved.difficulty || "easy",
    movement: resolved.movement,
    algorithmSettings: resolved.algorithmSettings,
    tonalityMode: resolved.tonalityMode,
    selectedKey: resolved.selectedKey,
    clefs: getAlgorithmClefs(resolved),
    ranges: {
      bass: {
        min: resolved.customMinValue,
        max: resolved.customBassMaxValue
      },
      treble: {
        min: resolved.customTrebleMinValue,
        max: resolved.customMaxValue
      }
    },
    accidentals: resolved.accidentals
  };
}

export function createNoteFlowRhythmOptionsFromMenu(menuOptions = {}) {
  const resolved = applyNoteFlowMenuDependencies(menuOptions);
  return {
    meter: resolved.rhythmMeter,
    noteDensity: getNoteFlowRhythmDensity(resolved.movement, resolved.algorithmSettings),
    allowedValues: {
      treble: resolved.rhythmValues.treble.slice(),
      bass: resolved.rhythmValues.bass.slice()
    }
  };
}
