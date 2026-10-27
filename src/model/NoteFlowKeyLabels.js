import {
  NOTE_NAMING_GERMAN,
  normalizeNoteNaming
} from "./NoteNaming";

const GERMAN_TONICS = {
  "C-flat": "Ces",
  "G-flat": "Ges",
  "D-flat": "Des",
  "A-flat": "As",
  "E-flat": "Es",
  "B-flat": "B",
  F: "F",
  C: "C",
  G: "G",
  D: "D",
  A: "A",
  E: "E",
  B: "H",
  "F-sharp": "Fis",
  "C-sharp": "Cis",
  "G-sharp": "Gis",
  "D-sharp": "Dis",
  "A-sharp": "Ais"
};

function formatInternationalTonic(tonic) {
  return tonic.replace("-flat", "♭").replace("-sharp", "♯");
}

function lowerFirstCharacter(value) {
  return value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

export function formatNoteFlowTonic(tonic, mode, noteNaming) {
  const normalizedNaming = normalizeNoteNaming(noteNaming);
  const formatted = normalizedNaming === NOTE_NAMING_GERMAN
    ? GERMAN_TONICS[tonic] || tonic
    : formatInternationalTonic(tonic);
  return mode === "minor" ? lowerFirstCharacter(formatted) : formatted;
}

export function formatNoteFlowTonalityLabel(tonality, noteNaming) {
  if (!tonality) {
    return "";
  }
  return formatNoteFlowTonic(tonality.tonic, tonality.mode, noteNaming);
}

export function getActiveNoteFlowTonality(cycle, event) {
  const eventPlan = event && event.tonalityPlan;
  const cyclePlan = cycle && cycle.tonalityPlan;
  return (eventPlan && eventPlan.key) || (cyclePlan && cyclePlan.key) || null;
}
