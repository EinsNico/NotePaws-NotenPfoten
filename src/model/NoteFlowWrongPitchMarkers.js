import { getNoteFlowTouchAudioValue } from "./NoteFlowInput";
import { createNoteFlowChordNotation } from "./NoteFlowChordNotation";
import Utils from "./Utils";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const BOTTOM_STEPS = { treble: 30, bass: 18 };

function playableValue(value) {
  return Number.isInteger(value) && value >= 0 && value <= 127;
}

function expectedNotes(target) {
  const notes = Array.isArray(target.notes) ? target.notes.filter(Boolean).map(entry => {
    const note = entry.note || entry;
    return { value: note.value, clef: entry.hand || entry.clef || note.clef };
  }) : [];
  const chord = target.chord;
  if (chord) {
    if (Array.isArray(chord.trebleValues) && Array.isArray(chord.bassValues)) {
      chord.trebleValues.forEach(value => notes.push({ value, clef: "treble" }));
      chord.bassValues.forEach(value => notes.push({ value, clef: "bass" }));
    } else {
      (Array.isArray(chord.values) ? chord.values : [])
        .forEach(value => notes.push({ value, clef: "treble" }));
      if (chord.bassValue != null) notes.push({ value: chord.bassValue, clef: "bass" });
    }
  }
  return notes.filter(note => playableValue(note.value));
}

function allExpectedValues(target, notes = expectedNotes(target)) {
  return (Array.isArray(target.expectedValues) ? target.expectedValues : [])
    .filter(playableValue).concat(notes.map(note => note.value));
}

function normalizeStaff(staff) {
  if (!staff || BOTTOM_STEPS[staff.clef] === undefined) return null;
  const bottomY = Number.isFinite(staff.bottomY) ? staff.bottomY : staff.bottomLineY;
  if (!Number.isFinite(bottomY) || !Array.isArray(staff.lineYs)
    || staff.lineYs.length !== 5 || !staff.lineYs.every(Number.isFinite)) return null;
  return Object.assign({}, staff, {
    bottomY,
    bottomStep: Number.isFinite(staff.bottomStep) ? staff.bottomStep : BOTTOM_STEPS[staff.clef]
  });
}

function nearestExpectedNote(notes, value, staves) {
  return notes.filter(note => staves.some(staff => staff.clef === note.clef))
    .slice().sort((left, right) => (
      Math.abs(left.value - value) - Math.abs(right.value - value)
      || left.value - right.value
      || staves.findIndex(staff => staff.clef === left.clef)
        - staves.findIndex(staff => staff.clef === right.clef)
    ))[0] || null;
}

function pitchNotation(value, clef, staves, tonality, displayKeySignature, preferSharp) {
  const chord = {
    values: [value],
    trebleValues: clef === "treble" ? [value] : [],
    bassValues: clef === "bass" ? [value] : []
  };
  const options = { staves, preferSharp };
  const unkeyed = createNoteFlowChordNotation(chord, options).notes[0];
  if (!tonality) return unkeyed;

  // Reuse the notation model for key-signature cancellation, octave boundaries
  // and ledger lines. In-key pitches keep the key's written scale degree;
  // chromatic pitches use its existing sharp/flat spelling, never a fake degree.
  const degree = tonality.scalePitchClasses.indexOf(value % 12);
  const letterIndex = ((unkeyed.writtenStep % 7) + 7) % 7;
  const tonicIndex = LETTERS.indexOf(String(tonality.tonic).charAt(0).toUpperCase());
  chord.scaleDegree = degree === -1 ? (letterIndex - tonicIndex + 7) % 7 + 1 : degree + 1;
  chord.pitchClasses = [value % 12];
  return createNoteFlowChordNotation(chord, Object.assign({}, options, {
    tonality, displayKeySignature
  })).notes[0];
}

/**
 * Classify actual input without needing a notation layout. null means no wrong
 * pitch; 0 is a valid audible MIDI value and must not be treated as false/null.
 * This deliberately does not inspect wrong/timing/miss/strike-window feedback.
 */
export function getNoteFlowWrongPitchValue({
  target,
  playedValue,
  inputMode = "midi",
  pendingValues = []
} = {}) {
  if (!target || target.kind === "rest" || playedValue === null
    || playedValue === undefined || typeof playedValue === "boolean"
    || (typeof playedValue === "string" && playedValue.trim() === "")) return null;
  const played = Number(playedValue);
  if (!Number.isInteger(played) || (inputMode === "midi" && !playableValue(played))) return null;
  const expected = allExpectedValues(target);
  if (!expected.length) return null;
  const touch = inputMode !== "midi";
  const pitchClass = ((played % 12) + 12) % 12;
  if (expected.some(value => touch ? value % 12 === pitchClass : value === played)) return null;
  const value = touch ? getNoteFlowTouchAudioValue(expected, pendingValues, played) : played;
  return playableValue(value) ? value : null;
}

/**
 * Map one actual input to a visual wrong-pitch marker, without changing practice.
 * `target` accepts rhythm timeline notes ({ hand, note }) or a chord target.
 * `playedValue` is already the app value (C4 = 48), never a raw MIDI note number.
 * Supply pendingValues from BEFORE input collection so touch audio is identical
 * to getNoteFlowTouchAudioValue. A correct pitch anywhere in the complete target
 * produces no marker, including repeats, partial chords and timing-only errors.
 *
 * Staff assignment uses nearest expected sounding pitch. Ties use the lower
 * expected value, then the supplied staff order for a same-pitch unison. Target
 * note order and pending-input order do not affect this tie rule.
 *
 * The caller owns x, visibility, marker lifetime and lifecycle reset. Coordinates
 * are not clamped: a wrong octave must keep its actual notated pitch and ledgers.
 * `accidental` is the existing ABC glyph suffix, including "nat" for a natural.
 * `note` follows the existing MIDI readout's naming and sounding octave.
 */
export function createNoteFlowWrongPitchMarker({
  target,
  playedValue,
  inputMode = "midi",
  pendingValues = [],
  staves = [],
  tonality = null,
  displayKeySignature = false,
  preferSharp = true,
  noteNaming = null
} = {}) {
  const value = getNoteFlowWrongPitchValue({ target, playedValue, inputMode, pendingValues });
  if (value === null) return null;
  const notes = expectedNotes(target);
  const lanes = (Array.isArray(staves) ? staves : []).map(normalizeStaff).filter(Boolean);
  if (!lanes.length) return null;
  // A bare expectedValues target is unambiguous only with one rendered staff.
  if (!notes.length && lanes.length === 1) {
    allExpectedValues(target, notes).forEach(expectedValue => (
      notes.push({ value: expectedValue, clef: lanes[0].clef })
    ));
  }
  const nearest = nearestExpectedNote(notes, value, lanes);
  if (!nearest) return null;
  const notation = pitchNotation(value, nearest.clef, lanes, tonality,
    displayKeySignature, preferSharp);
  return {
    value,
    clef: nearest.clef,
    expectedValue: nearest.value,
    y: notation.y,
    writtenStep: notation.writtenStep,
    accidental: notation.accidental,
    ledgerLineYs: notation.ledgerLineYs,
    note: Utils.getDisplayNoteName(value, preferSharp, noteNaming) + Math.floor(value / 12)
  };
}

/**
 * Combine rendered markers at one exact staff position without changing inputs.
 * A group retains one set of ledger lines and the original coordinates. Distinct
 * sounding values and their matching names are sorted numerically; a repeated
 * value is one entry. A collision suppresses the shared accidental because one
 * glyph cannot describe all values (for example C4 and C-sharp4 at the same y).
 * The position-based id survives changes to group membership and marker timers.
 */
export function groupNoteFlowWrongPitchMarkers(markers) {
  const positions = new Map();
  (Array.isArray(markers) ? markers : []).forEach(marker => {
    if (!marker || !playableValue(marker.value)
      || BOTTOM_STEPS[marker.clef] === undefined
      || !Number.isInteger(marker.writtenStep) || !Number.isFinite(marker.y)) return;
    const key = JSON.stringify([marker.clef, marker.writtenStep, marker.y]);
    if (!positions.has(key)) positions.set(key, []);
    positions.get(key).push(marker);
  });
  return Array.from(positions.entries()).map(([key, members]) => {
    const distinct = new Map();
    members.forEach(marker => {
      if (!distinct.has(marker.value)) distinct.set(marker.value, marker);
    });
    const ordered = Array.from(distinct.values()).sort((left, right) => left.value - right.value);
    const baseline = ordered[0];
    const notes = ordered.map(marker => marker.note);
    const colliding = ordered.length > 1;
    return Object.assign({}, baseline, {
      id: `wrong-pitch-position:${key}`,
      ledgerLineYs: Array.isArray(baseline.ledgerLineYs) ? baseline.ledgerLineYs.slice() : [],
      values: ordered.map(marker => marker.value),
      notes,
      note: notes.join(" / "),
      colliding,
      accidental: colliding ? null : baseline.accidental
    });
  }).sort((left, right) => (
    (left.clef < right.clef ? -1 : left.clef > right.clef ? 1 : 0)
    || left.writtenStep - right.writtenStep
    || left.y - right.y
  ));
}
