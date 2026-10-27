const SHARP_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const FLAT_STEPS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const ACCIDENTAL_PITCH_CLASSES = [1, 3, 6, 8, 10];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = { "-2": "dblflat", "-1": "flat", 0: "nat", 1: "sharp", 2: "dblsharp" };
const KEY_SIGNATURE_STEPS = {
  treble: { sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
  bass: { sharp: [6, 3, 7, 4, 1, 5, 2], flat: [2, 5, 1, 4, 0, 3, -1] }
};

const STAVES = {
  treble: { clef: "treble", bottomY: 100, bottomStep: 30, lineYs: [60, 70, 80, 90, 100], clefY: 90 },
  bass: { clef: "bass", bottomY: 175, bottomStep: 18, lineYs: [135, 145, 155, 165, 175], clefY: 145 }
};

function ledgerLines(writtenStep, staff) {
  const offset = writtenStep - staff.bottomStep;
  const lines = [];
  for (let step = -2; step >= offset; step -= 2) lines.push(staff.bottomY - step * 5);
  for (let step = 10; step <= offset; step += 2) lines.push(staff.bottomY - step * 5);
  return lines;
}

function spellChordPitch(value, chord, tonality) {
  const chordToneIndex = chord.pitchClasses.indexOf(value % 12);
  if (chordToneIndex < 0) throw new Error("Pitch is not part of the planned chord.");
  const scaleDegree = (chord.scaleDegree - 1 + chordToneIndex * 2) % 7;
  const tonicIndex = LETTERS.indexOf(String(tonality.tonic).charAt(0).toUpperCase());
  const letter = LETTERS[(tonicIndex + scaleDegree) % 7];
  let adjustment = (value % 12 - NATURAL_PITCH_CLASSES[letter] + 12) % 12;
  if (adjustment > 6) adjustment -= 12;
  if (Math.abs(adjustment) > 2) throw new Error("Unsupported chord spelling.");
  const octave = (value - NATURAL_PITCH_CLASSES[letter] - adjustment) / 12;
  if (!Number.isInteger(octave)) throw new Error("Invalid written octave.");
  return { letter, adjustment, writtenStep: octave * 7 + LETTERS.indexOf(letter) };
}

function createKeySignature(staff, tonality, display) {
  if (!display || !tonality.signature || tonality.signature.type === "none") return [];
  const positions = KEY_SIGNATURE_STEPS[staff.clef][tonality.signature.type];
  return tonality.signature.alteredNotes.map((entry, index) => ({
    glyph: entry.accidental,
    x: 54 + index * 9,
    y: staff.bottomY - positions[index] * 5
  }));
}

function naturalWrittenStep(value, preferSharp) {
  return Math.floor(value / 12) * 7 + (preferSharp ? SHARP_STEPS[value % 12] : FLAT_STEPS[value % 12]);
}

function createHandStaves(pitches, ranges, preferSharp) {
  const hands = ["treble", "bass"].filter(hand => pitches.some(pitch => pitch.clef === hand));
  let previousBottom = null;
  return hands.map((hand, index) => {
    const base = STAVES[hand];
    const values = pitches.filter(pitch => pitch.clef === hand).map(pitch => pitch.value);
    const range = ranges && ranges[hand] || { min: Math.min(...values), max: Math.max(...values) };
    const noteTop = base.bottomY - (naturalWrittenStep(range.max, preferSharp) - base.bottomStep) * 5;
    const noteBottom = base.bottomY - (naturalWrittenStep(range.min, preferSharp) - base.bottomStep) * 5;
    const top = Math.min(base.lineYs[0] - 20, noteTop);
    const bottom = Math.max(base.lineYs[4], noteBottom);
    // Bass-only practice uses the first row, just like treble-only practice.
    const shift = index === 0 ? Math.max(hand === "bass" ? -75 : 0, 35 - top)
      : Math.max(0, previousBottom + 32 - top);
    previousBottom = bottom + shift;
    return Object.assign({}, base, {
      bottomY: base.bottomY + shift,
      clefY: base.clefY + shift,
      lineYs: base.lineYs.map(y => y + shift),
      noteBottom: noteBottom + shift
    });
  });
}

export function createNoteFlowChordNotation(chord, input = true) {
  if (!chord || !Array.isArray(chord.values)) throw new Error("A chord is required.");
  const options = typeof input === "boolean" ? { preferSharp: input } : input;
  const tonality = options.tonality || null;
  const preferSharp = options.preferSharp !== false;
  const displayKeySignature = !!(tonality && options.displayKeySignature);
  const handArrays = Array.isArray(chord.bassValues) && Array.isArray(chord.trebleValues);
  const pitches = handArrays
    ? chord.trebleValues.map(value => ({ value, clef: "treble" }))
      .concat(chord.bassValues.map(value => ({ value, clef: "bass" })))
    : chord.values.map(value => ({ value, clef: "treble" }))
      .concat(chord.bassValue == null ? [] : [{ value: chord.bassValue, clef: "bass" }]);
  const staffSource = Array.isArray(options.staves) ? options.staves
    : handArrays ? createHandStaves(pitches, chord.ranges, preferSharp)
      : chord.bassValue == null ? [STAVES.treble] : [STAVES.treble, STAVES.bass];
  const staves = staffSource.map(staff => Object.assign({}, staff, {
    keySignature: tonality ? createKeySignature(staff, tonality, displayKeySignature) : []
  }));
  const notes = pitches.map(({ value, clef }, index) => {
    if (!Number.isInteger(value) || value < 0) throw new Error("Invalid chord pitch.");
    const pitchClass = value % 12;
    const spelling = tonality ? spellChordPitch(value, chord, tonality) : null;
    const writtenStep = spelling ? spelling.writtenStep : Math.floor(value / 12) * 7
      + (preferSharp ? SHARP_STEPS[pitchClass] : FLAT_STEPS[pitchClass]);
    const staff = staves.find(item => item.clef === clef);
    const y = staff.bottomY - (writtenStep - staff.bottomStep) * 5;
    const hasAccidental = ACCIDENTAL_PITCH_CLASSES.indexOf(pitchClass) !== -1;
    const signedAdjustment = spelling ? spelling.adjustment : (hasAccidental ? (preferSharp ? 1 : -1) : 0);
    const signatureEntry = spelling && displayKeySignature && tonality.signature.alteredNotes
      .find(entry => entry.note === spelling.letter);
    const signatureAdjustment = signatureEntry ? (signatureEntry.accidental === "sharp" ? 1 : -1) : 0;
    return {
      value, clef, y, x: 178 + (index % 2) * 1,
      writtenStep,
      letter: spelling ? spelling.letter : null,
      alteration: signedAdjustment,
      accidental: signedAdjustment === signatureAdjustment ? null : ACCIDENTALS[signedAdjustment],
      ledgerLineYs: ledgerLines(writtenStep, staff)
    };
  });
  const height = handArrays ? Math.max(145, ...staves.map(staff => (
    Math.max(staff.lineYs[4], staff.noteBottom || 0) + 35
  )), ...notes.map(note => note.y + 35)) : staves.length === 2 ? 205 : 145;
  return { width: 320, height, staves, notes };
}
