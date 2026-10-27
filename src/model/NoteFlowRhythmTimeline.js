import { createNoteFlowRhythmMeasure, getNoteFlowMeter } from "./NoteFlowRhythm";
import { NOTE_FLOW_MIN_BPM, NOTE_FLOW_MAX_BPM } from "./NoteFlowPlayback";

export const NOTE_FLOW_RHYTHM_TIMELINE_VERSION = 1;

function validateHands(hands) {
  if (!Array.isArray(hands) || hands.length < 1 || hands.length > 2
    || new Set(hands).size !== hands.length
    || hands.some(hand => hand !== "bass" && hand !== "treble")) {
    throw new RangeError("A score needs one or two distinct rhythm hands");
  }
}

function atMilliseconds(tick, bpm, pulseTicks) {
  // Round absolute positions, not accumulated durations: long rounds cannot drift.
  return Math.round(tick * 60000 / (bpm * pulseTicks));
}

// An opt-in time axis for the future rhythmic player. The current equal-step
// playback deliberately does not consume this structure yet.
export function createNoteFlowRhythmTimeline(score, options = {}) {
  if (!score || !score.meter || !Array.isArray(score.measures)
    || score.measures.length === 0) {
    throw new TypeError("A non-empty rhythmic score is required");
  }
  const bpm = options.bpm === undefined ? 50 : options.bpm;
  if (!Number.isInteger(bpm) || bpm < NOTE_FLOW_MIN_BPM || bpm > NOTE_FLOW_MAX_BPM) {
    throw new RangeError(`BPM must be ${NOTE_FLOW_MIN_BPM}–${NOTE_FLOW_MAX_BPM}`);
  }
  const meter = getNoteFlowMeter(score.meter.signature);
  validateHands(score.hands);

  const events = [];
  const measures = [];
  score.measures.forEach((sourceMeasure, measureIndex) => {
    if (!sourceMeasure || !sourceMeasure.meter
      || sourceMeasure.meter.signature !== meter.signature
      || !sourceMeasure.voices) {
      throw new RangeError("All measures must use the score meter");
    }
    const voices = {};
    score.hands.forEach(hand => {
      if (!Array.isArray(sourceMeasure.voices[hand])) {
        throw new RangeError(`Missing ${hand} rhythm voice`);
      }
      voices[hand] = sourceMeasure.voices[hand];
    });
    if (Object.keys(sourceMeasure.voices).some(hand => score.hands.indexOf(hand) === -1)) {
      throw new RangeError("A measure contains an unselected hand");
    }
    // Revalidate coverage so a partially edited score cannot silently skip time.
    const validated = createNoteFlowRhythmMeasure({ meter: meter.signature, voices });
    const measureStartTick = measureIndex * meter.durationTicks;
    measures.push({
      index: measureIndex,
      startTick: measureStartTick,
      endTick: measureStartTick + meter.durationTicks,
      startMs: atMilliseconds(measureStartTick, bpm, meter.pulseTicks),
      endMs: atMilliseconds(measureStartTick + meter.durationTicks, bpm, meter.pulseTicks)
    });
    score.hands.forEach(hand => {
      validated.voices[hand].forEach((event, eventIndex) => {
        const original = voices[hand][eventIndex];
        if (event.kind === "note"
          && (!original.note || !Number.isFinite(original.note.value))) {
          throw new RangeError(`${hand} note needs a playable pitch`);
        }
        const startTick = measureStartTick + event.startTick;
        const endTick = measureStartTick + event.endTick;
        events.push(Object.assign({}, event, {
          measureIndex,
          startTick,
          endTick,
          startMs: atMilliseconds(startTick, bpm, meter.pulseTicks),
          endMs: atMilliseconds(endTick, bpm, meter.pulseTicks),
          note: event.kind === "note" ? original.note : null,
          tonalityPlan: event.kind === "note" ? original.tonalityPlan || null : null
        }));
      });
    });
  });

  events.sort((left, right) => (
    left.startTick - right.startTick
    || score.hands.indexOf(left.hand) - score.hands.indexOf(right.hand)
  ));
  const targets = [];
  events.forEach(event => {
    if (event.kind === "rest") return;
    const previous = targets[targets.length - 1];
    const target = previous && previous.startTick === event.startTick
      ? previous
      : {
        startTick: event.startTick,
        startMs: event.startMs,
        measureIndex: event.measureIndex,
        notes: [],
        expectedValues: []
      };
    if (target !== previous) targets.push(target);
    target.notes.push({
      hand: event.hand,
      note: event.note,
      durationTicks: event.durationTicks,
      endMs: event.endMs
    });
    target.expectedValues.push(event.note.value);
  });

  const durationTicks = score.measures.length * meter.durationTicks;
  return {
    timelineVersion: NOTE_FLOW_RHYTHM_TIMELINE_VERSION,
    bpm,
    meter,
    allowedValues: score.allowedValues || null,
    durationTicks,
    durationMs: atMilliseconds(durationTicks, bpm, meter.pulseTicks),
    measures,
    pulseStarts: score.measures.reduce((result, measure, index) => (
      result.concat(meter.pulseStarts.map(pulse => {
        const tick = index * meter.durationTicks + pulse;
        return { tick, atMs: atMilliseconds(tick, bpm, meter.pulseTicks) };
      }))
    ), []),
    events,
    targets
  };
}
