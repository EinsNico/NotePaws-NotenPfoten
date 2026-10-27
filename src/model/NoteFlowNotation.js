const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCH_CLASSES = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

export const NOTE_FLOW_PREVIEW_EVENT_COUNT = 8;

function tonicLetter(tonality) {
  return String(tonality.tonic || "C").charAt(0).toUpperCase();
}

function scaleDegreeForNote(note, tonality) {
  if (Number.isInteger(note.scaleDegree) && note.scaleDegree >= 1) {
    return note.scaleDegree;
  }
  const index = tonality.scalePitchClasses.indexOf(note.pitchClass);
  return index === -1 ? 1 : index + 1;
}

function writtenLetter(note, tonality) {
  const tonicIndex = LETTERS.indexOf(tonicLetter(tonality));
  const degreeOffset = scaleDegreeForNote(note, tonality) - 1;
  return LETTERS[(Math.max(0, tonicIndex) + degreeOffset) % LETTERS.length];
}

function accidentalAdjustment(note, letter) {
  const difference = (
    note.pitchClass - NATURAL_PITCH_CLASSES[letter] + 12
  ) % 12;
  if (difference === 1) {
    return 1;
  }
  if (difference === 11) {
    return -1;
  }
  return 0;
}

function getWrittenOctave(letter, note, adjustment) {
  return Math.round(
    (note.value - NATURAL_PITCH_CLASSES[letter] - adjustment) / 12
  );
}

function abcOctave(letter, note, adjustment) {
  const writtenOctave = getWrittenOctave(letter, note, adjustment);
  if (writtenOctave < 4) {
    return letter + ",".repeat(4 - writtenOctave);
  }
  const lower = letter.toLowerCase();
  return writtenOctave === 4
    ? letter
    : lower + "'".repeat(Math.max(0, writtenOctave - 5));
}

function abcAccidental(adjustment) {
  if (adjustment > 0) {
    return "^";
  }
  if (adjustment < 0) {
    return "_";
  }
  return "";
}

function abcKeyName(tonality) {
  const tonic = String(tonality.tonic || "C")
    .replace("-sharp", "#")
    .replace("-flat", "b");
  return tonic + (tonality.mode === "minor" ? "m" : "");
}

export function describeNoteFlowPitch(note, cycle) {
  const tonality = cycle.tonalityPlan.key;
  const letter = writtenLetter(note, tonality);
  const adjustment = accidentalAdjustment(note, letter);
  const octave = getWrittenOctave(letter, note, adjustment);
  return {
    letter,
    adjustment,
    octave,
    writtenStep: octave * LETTERS.length + LETTERS.indexOf(letter),
    accidental: adjustment > 0 ? "sharp" : adjustment < 0 ? "flat" : null
  };
}

function abcPitch(note, cycle) {
  const pitch = describeNoteFlowPitch(note, cycle);
  const accidental = cycle.tonalityPlan.displayAccidentalsOnNotes
    ? abcAccidental(pitch.adjustment)
    : "";
  return accidental + abcOctave(pitch.letter, note, pitch.adjustment);
}

export function getNoteFlowRenderedClefs(cycle) {
  const configured = cycle.config && Array.isArray(cycle.config.clefs)
    ? cycle.config.clefs
    : ["treble"];
  if (cycle.config.handMode === "two"
    || (configured.indexOf("bass") !== -1 && configured.indexOf("treble") !== -1)) {
    return ["treble", "bass"];
  }
  return [configured.indexOf("bass") !== -1 ? "bass" : "treble"];
}

function voiceBody(events, clef, cycle) {
  return events.map((event, index) => {
    const note = event.notes.find(candidate => candidate.clef === clef);
    const token = note ? abcPitch(note, cycle) : "z";
    return index > 0 && index % 4 === 0 ? `| ${token}` : token;
  }).join(" ") + " |]";
}

export function createNoteFlowPreviewAbc(
  cycle,
  eventCount = NOTE_FLOW_PREVIEW_EVENT_COUNT
) {
  if (!cycle || !cycle.timeline || !Array.isArray(cycle.timeline.events)) {
    throw new Error("A generated Note Flow cycle is required for notation.");
  }
  const count = Math.max(1, Math.min(
    cycle.timeline.events.length,
    Math.round(Number(eventCount) || NOTE_FLOW_PREVIEW_EVENT_COUNT)
  ));
  const events = cycle.timeline.events.slice(0, count);
  const clefs = getNoteFlowRenderedClefs(cycle);
  const key = cycle.tonalityPlan.displayKeySignature
    ? abcKeyName(cycle.tonalityPlan.key)
    : "C";
  const lines = [
    "X:1",
    "L:1/4",
    "M:none",
    "%%stretchlast 1"
  ];

  if (clefs.length > 1) {
    lines.push("%%score {treble bass}");
  }
  clefs.forEach(clef => lines.push(`V:${clef} clef=${clef}`));
  lines.push(`K:${key}`);
  clefs.forEach(clef => {
    lines.push(`[V:${clef}] ${voiceBody(events, clef, cycle)}`);
  });
  return lines.join("\n");
}

// Separate metered notation; the legacy preview remains unchanged until the
// rhythm-aware playback and interface are ready to use the same score.
export function createNoteFlowRhythmicAbc(cycle, score) {
  if (!cycle || !cycle.tonalityPlan || !score || !score.meter
    || !Array.isArray(score.measures) || score.measures.length === 0
    || !Array.isArray(score.hands) || score.hands.length === 0) {
    throw new TypeError("A generated cycle and rhythmic score are required");
  }
  const key = cycle.tonalityPlan.displayKeySignature
    ? abcKeyName(cycle.tonalityPlan.key)
    : "C";
  const lines = ["X:1", "L:1/16", `M:${score.meter.signature}`];
  if (score.hands.length > 1) {
    lines.push(`%%score {${score.hands.join(" ")}}`);
  }
  score.hands.forEach(hand => lines.push(`V:${hand} clef=${hand}`));
  lines.push(`K:${key}`);
  score.hands.forEach(hand => {
    const bars = score.measures.map(measure => {
      const events = measure.voices[hand];
      if (!events) throw new RangeError(`Missing ${hand} rhythm voice`);
      return events.map(event => {
        const token = event.kind === "rest"
          ? "z"
          : abcPitch(event.note, cycle);
        return `${token}${event.durationTicks / 24}`;
      }).join(" ");
    });
    lines.push(`[V:${hand}] ${bars.join(" | ")} |]`);
  });
  return lines.join("\n");
}
