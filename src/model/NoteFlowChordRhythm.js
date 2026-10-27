import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import {
  createNoteFlowRhythmMeasure,
  getNoteFlowDurationTicks,
  getNoteFlowMeter,
  NOTE_FLOW_RHYTHM_VERSION
} from "./NoteFlowRhythm";

const DEFAULT_VALUES = {
  "3/4": ["quarter", "eighth"],
  "4/4": ["quarter", "eighth"],
  "6/8": ["dotted-quarter", "eighth"]
};
const MAX_MEASURES = 512;

function allowedDurations(requested, meter) {
  const source = requested === undefined ? DEFAULT_VALUES[meter.signature] : requested;
  if (!Array.isArray(source) || source.length === 0) {
    throw new RangeError("At least one chord note value is required");
  }
  const values = source.map(value => {
    if (typeof value !== "string") throw new RangeError("Invalid chord note value");
    const dots = value.indexOf("dotted-") === 0 ? 1 : 0;
    const noteValue = dots ? value.slice(7) : value;
    return { noteValue, dots, durationTicks: getNoteFlowDurationTicks(noteValue, dots) };
  });
  if (!values.some(value => meter.durationTicks % value.durationTicks === 0)) {
    throw new RangeError("Chord note values cannot fill the selected meter");
  }
  return values;
}

function canFill(remaining, values, memo) {
  if (remaining === 0) return true;
  if (memo.has(remaining)) return memo.get(remaining);
  const possible = values.some(value => value.durationTicks <= remaining
    && canFill(remaining - value.durationTicks, values, memo));
  memo.set(remaining, possible);
  return possible;
}

function chooseDuration(startTick, meter, values, random) {
  const remaining = meter.durationTicks - startTick;
  const memo = new Map();
  const fitting = values.filter(value => value.durationTicks <= remaining
    && canFill(remaining - value.durationTicks, values, memo));
  if (!fitting.length) throw new RangeError("Chord note values cannot complete a measure");
  const strongPulse = startTick % meter.pulseTicks === 0;
  fitting.sort((left, right) => strongPulse
    ? right.durationTicks - left.durationTicks
    : left.durationTicks - right.durationTicks);
  return fitting[Math.floor(random() * Math.min(2, fitting.length))];
}

function atMilliseconds(tick, bpm, pulseTicks) {
  // Absolute tick conversion avoids drift over a long chord round.
  return Math.round(tick * 60000 / (bpm * pulseTicks));
}

// One chord onset is one MIDI target; its value controls sounding/visible duration.
export function generateNoteFlowChordRhythmicScore(plan, options = {}) {
  const chords = plan && Array.isArray(plan.blocks)
    ? plan.blocks.reduce((all, block) => all.concat(block.chords || []), [])
    : [];
  if (!chords.length) throw new TypeError("A non-empty chord plan is required");
  const meter = getNoteFlowMeter(options.meter || "4/4");
  const values = allowedDurations(options.allowedValues, meter);
  const restChance = options.restChance === undefined ? 0 : options.restChance;
  if (!Number.isFinite(restChance) || restChance < 0 || restChance > 1) {
    throw new RangeError("Rest chance must be between 0 and 1");
  }
  const bpm = options.bpm === undefined ? plan.options.bpm : options.bpm;
  if (!Number.isInteger(bpm) || bpm < 25 || bpm > 120) {
    throw new RangeError("BPM must be between 25 and 120");
  }
  const seed = options.seed === undefined
    ? `${plan.keyId}:${plan.cycleIndex}:${plan.chordSize}:${plan.bassNotePlanned}`
    : options.seed;
  const random = createSeededNoteFlowRandom(seed);
  const hands = Array.isArray(plan.hands) ? plan.hands.slice()
    : plan.bassNotePlanned ? ["treble", "bass"] : ["treble"];
  const measures = [];
  const targets = [];
  let chordIndex = 0;

  while (chordIndex < chords.length) {
    if (measures.length >= MAX_MEASURES) {
      throw new RangeError("Chord rhythm exceeds the maximum measure count");
    }
    const measureIndex = measures.length;
    const events = [];
    let startTick = 0;
    while (startTick < meter.durationTicks) {
      const duration = chooseDuration(startTick, meter, values, random);
      // Every new bar begins with a chord. Later rests never discard harmony.
      const isRest = chordIndex >= chords.length
        || (events.length > 0 && random() < restChance);
      const chord = isRest ? null : chords[chordIndex++];
      const globalStartTick = measureIndex * meter.durationTicks + startTick;
      const event = {
        kind: isRest ? "rest" : "note",
        measureIndex,
        startTick,
        globalStartTick,
        endTick: startTick + duration.durationTicks,
        globalEndTick: globalStartTick + duration.durationTicks,
        startMs: atMilliseconds(globalStartTick, bpm, meter.pulseTicks),
        endMs: atMilliseconds(globalStartTick + duration.durationTicks, bpm, meter.pulseTicks),
        noteValue: duration.noteValue,
        dots: duration.dots,
        durationTicks: duration.durationTicks,
        chord,
        expectedValues: chord ? Array.from(new Set(
          Array.isArray(chord.bassValues) && Array.isArray(chord.trebleValues) ? chord.values
            : (chord.bassValue == null ? [] : [chord.bassValue]).concat(chord.values)
        )) : []
      };
      events.push(event);
      if (chord) targets.push(event);
      startTick = event.endTick;
    }
    const voices = {};
    hands.forEach(hand => {
      voices[hand] = events.map(event => ({
        kind: event.kind, startTick: event.startTick,
        noteValue: event.noteValue, dots: event.dots
      }));
    });
    // Use the same complete-bar validation as the melody rhythm model.
    createNoteFlowRhythmMeasure({ meter: meter.signature, voices });
    measures.push({ index: measureIndex, events });
  }

  const durationTicks = measures.length * meter.durationTicks;
  return {
    rhythmVersion: NOTE_FLOW_RHYTHM_VERSION,
    // Append and trim retain this small round identity. Layout can remember
    // necessary spacing without keeping any discarded measures alive.
    spacingScope: {},
    meter,
    bpm,
    hands,
    allowedValues: values.map(value => value.dots
      ? `dotted-${value.noteValue}` : value.noteValue),
    measures,
    targets,
    durationTicks,
    durationMs: atMilliseconds(durationTicks, bpm, meter.pulseTicks)
  };
}

function milliseconds(tick, score) {
  return atMilliseconds(tick, score.bpm, score.meter.pulseTicks);
}

// Keep one continuous time axis while harmonic cycles are generated ahead of play.
export function appendNoteFlowChordRhythmicScore(score, next) {
  if (score.meter.signature !== next.meter.signature || score.bpm !== next.bpm
    || score.hands.join() !== next.hands.join()) {
    throw new RangeError("Chord scores must share meter, tempo and hands");
  }
  const tickOffset = score.durationTicks;
  const measureOffset = score.measures.length;
  const appended = next.measures.map(measure => ({
    index: measure.index + measureOffset,
    events: measure.events.map(event => {
      const globalStartTick = event.globalStartTick + tickOffset;
      const globalEndTick = event.globalEndTick + tickOffset;
      return Object.assign({}, event, {
        measureIndex: event.measureIndex + measureOffset,
        globalStartTick, globalEndTick,
        startMs: milliseconds(globalStartTick, score),
        endMs: milliseconds(globalEndTick, score)
      });
    })
  }));
  const measures = score.measures.concat(appended);
  return Object.assign({}, score, {
    measures,
    targets: score.targets.concat(appended.reduce((all, measure) => (
      all.concat(measure.events.filter(event => event.kind === "note"))
    ), [])),
    durationTicks: score.durationTicks + next.durationTicks,
    durationMs: milliseconds(score.durationTicks + next.durationTicks, score)
  });
}

export function dropNoteFlowChordRhythmicMeasures(score, count) {
  if (!Number.isInteger(count) || count < 1 || count >= score.measures.length) {
    throw new RangeError("Keep at least one chord measure");
  }
  const tickOffset = count * score.meter.durationTicks;
  const measures = score.measures.slice(count).map((measure, index) => ({
    index,
    events: measure.events.map(event => {
      const globalStartTick = event.globalStartTick - tickOffset;
      const globalEndTick = event.globalEndTick - tickOffset;
      return Object.assign({}, event, {
        measureIndex: index,
        globalStartTick, globalEndTick,
        startMs: milliseconds(globalStartTick, score),
        endMs: milliseconds(globalEndTick, score)
      });
    })
  }));
  const durationTicks = score.durationTicks - tickOffset;
  return Object.assign({}, score, {
    measures,
    targets: measures.reduce((all, measure) => (
      all.concat(measure.events.filter(event => event.kind === "note"))
    ), []),
    durationTicks,
    durationMs: milliseconds(durationTicks, score)
  });
}
