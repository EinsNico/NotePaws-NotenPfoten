// Rhythmisches Datenmodell; noch nicht mit Generator, Anzeige oder Wiedergabe verbunden.
export const NOTE_FLOW_RHYTHM_VERSION = 1;
export const TICKS_PER_QUARTER = 96;

const NOTE_VALUE_TICKS = Object.freeze({
  whole: 384,
  half: 192,
  quarter: 96,
  eighth: 48,
  sixteenth: 24
});

const METERS = Object.freeze({
  "3/4": { numerator: 3, denominator: 4, pulseTicks: 96 },
  "4/4": { numerator: 4, denominator: 4, pulseTicks: 96 },
  "6/8": { numerator: 6, denominator: 8, pulseTicks: 144 }
});

const HANDS = ["bass", "treble"];

export function getNoteFlowMeter(signature) {
  const meter = METERS[signature];
  if (!meter) {
    throw new RangeError(`Unsupported meter: ${signature}`);
  }
  const durationTicks = meter.numerator * TICKS_PER_QUARTER * 4 / meter.denominator;
  return {
    signature,
    numerator: meter.numerator,
    denominator: meter.denominator,
    durationTicks,
    pulseTicks: meter.pulseTicks,
    pulseStarts: Array.from(
      { length: durationTicks / meter.pulseTicks },
      (_, index) => index * meter.pulseTicks
    )
  };
}

export function getNoteFlowDurationTicks(noteValue, dots = 0) {
  const baseTicks = NOTE_VALUE_TICKS[noteValue];
  if (!baseTicks || !Number.isInteger(dots) || dots < 0 || dots > 1) {
    throw new RangeError(`Unsupported note value or dots: ${noteValue}, ${dots}`);
  }
  return baseTicks * (dots ? 1.5 : 1);
}

// Jede Stimme füllt ihren Takt vollständig. Stille ist eine ausdrückliche Pause.
// Dadurch können Bass und Violin verschieden rhythmisiert, aber taktgleich sein.
export function createNoteFlowRhythmMeasure({ meter: signature, voices }) {
  const meter = getNoteFlowMeter(signature);
  if (!voices || typeof voices !== "object" || Array.isArray(voices)) {
    throw new TypeError("Voices must be an object keyed by hand");
  }
  const hands = Object.keys(voices);
  if (!hands.length || hands.some(hand => HANDS.indexOf(hand) === -1)) {
    throw new RangeError("At least one valid hand is required");
  }

  const normalizedVoices = {};
  hands.forEach(hand => {
    const source = voices[hand];
    if (!Array.isArray(source) || !source.length) {
      throw new RangeError(`${hand} needs events filling the measure`);
    }
    let nextTick = 0;
    normalizedVoices[hand] = source.map(event => {
      if (!event || (event.kind !== "note" && event.kind !== "rest")) {
        throw new RangeError(`${hand} has an invalid event kind`);
      }
      const durationTicks = getNoteFlowDurationTicks(event.noteValue, event.dots || 0);
      if (!Number.isInteger(event.startTick) || event.startTick !== nextTick) {
        throw new RangeError(`${hand} has a gap, overlap or invalid start tick`);
      }
      const endTick = event.startTick + durationTicks;
      if (endTick > meter.durationTicks) {
        throw new RangeError(`${hand} extends beyond the measure`);
      }
      nextTick = endTick;
      return {
        kind: event.kind,
        hand,
        startTick: event.startTick,
        durationTicks,
        endTick,
        noteValue: event.noteValue,
        dots: event.dots || 0
      };
    });
    if (nextTick !== meter.durationTicks) {
      throw new RangeError(`${hand} does not fill the measure`);
    }
  });

  return { rhythmVersion: NOTE_FLOW_RHYTHM_VERSION, meter, voices: normalizedVoices };
}
