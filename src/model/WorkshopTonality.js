import { NOTE_FLOW_TONALITIES } from "./NoteFlowTonality";

const TONALITIES = new Map(NOTE_FLOW_TONALITIES.map(tonality => [tonality.id, tonality]));
// Standard key-signature positions, in the existing sharp/flat ordering.
const SIGNATURE_OCTAVES = {
  treble: { sharp: [5, 5, 5, 5, 4, 5, 4], flat: [4, 5, 4, 5, 4, 5, 4] },
  bass: { sharp: [3, 3, 3, 3, 2, 3, 2], flat: [2, 3, 2, 3, 2, 3, 2] },
  alto: { sharp: [4, 4, 4, 4, 3, 4, 3], flat: [3, 4, 3, 4, 3, 4, 3] },
  tenor: { sharp: [3, 4, 3, 4, 3, 4, 3], flat: [3, 4, 3, 4, 3, 4, 3] }
};

export function isValidWorkshopKeyId(keyId) {
  return typeof keyId === "string" && TONALITIES.has(keyId);
}

function tonalityFor(keyId) {
  return TONALITIES.get(keyId) || TONALITIES.get("C-major");
}

export function workshopKeyAlter(keyId, step) {
  const entry = tonalityFor(keyId).signature.alteredNotes.find(note => note.note === step);
  return entry ? (entry.accidental === "sharp" ? 1 : -1) : 0;
}

export function workshopKeySignature(keyId, clef) {
  if (typeof clef !== "string" || !Object.prototype.hasOwnProperty.call(SIGNATURE_OCTAVES, clef)) return [];
  const signature = tonalityFor(keyId).signature;
  if (signature.type === "none") return [];
  const octaves = SIGNATURE_OCTAVES[clef][signature.type];
  return signature.alteredNotes.map((entry, index) => ({
    step: entry.note, alter: entry.accidental === "sharp" ? 1 : -1, octave: octaves[index]
  }));
}
