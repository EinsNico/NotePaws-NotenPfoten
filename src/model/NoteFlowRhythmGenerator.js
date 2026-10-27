import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import { getNoteRange } from "./NoteRanges";
import { getNoteFlowPitchMovement } from "./NoteFlowMelody";
import {
  createNoteFlowRhythmMeasure,
  getNoteFlowDurationTicks,
  getNoteFlowMeter,
  NOTE_FLOW_RHYTHM_VERSION
} from "./NoteFlowRhythm";

const DEFAULT_VALUES = {
  "3/4": ["half", "quarter", "eighth"],
  "4/4": ["half", "quarter", "eighth"],
  "6/8": ["dotted-quarter", "quarter", "eighth"]
};

function parseValue(value) {
  const dots = value.indexOf("dotted-") === 0 ? 1 : 0;
  const noteValue = dots ? value.slice(7) : value;
  return { noteValue, dots, durationTicks: getNoteFlowDurationTicks(noteValue, dots) };
}

function getValues(options, hand, meter) {
  const requested = options.allowedValues && options.allowedValues[hand];
  const source = requested === undefined ? DEFAULT_VALUES[meter.signature] : requested;
  if (!Array.isArray(source) || source.length === 0) {
    throw new RangeError(`${hand} needs at least one note value`);
  }
  const values = Array.from(new Set(source)).map(value => {
    if (typeof value !== "string") throw new RangeError("Invalid note value");
    return parseValue(value);
  });
  if (!getCompletableTicks(values, meter.durationTicks)[meter.durationTicks]) {
    throw new RangeError(`${hand} has no value that can fill the measure`);
  }
  return values;
}

// A choice is valid only if its remainder can still be filled exactly. This
// includes combinations of values instead of requiring one repeated value.
function getCompletableTicks(values, durationTicks) {
  const completable = Array(durationTicks + 1).fill(false);
  completable[0] = true;
  for (let ticks = 1; ticks <= durationTicks; ticks += 1) {
    completable[ticks] = values.some(value => (
      value.durationTicks <= ticks && completable[ticks - value.durationTicks]
    ));
  }
  return completable;
}

function chooseValue(values, meter, startTick, random, noteDensity) {
  const shortest = Math.min(...values.map(value => value.durationTicks));
  // At 50 all selected values have an equal starting weight. Moving toward
  // either end favors longer or shorter values without excluding any of them.
  const densityExponent = (50 - noteDensity) / 25;
  const strongPulse = startTick % meter.pulseTicks === 0;
  const weights = values.map(value => {
    const densityWeight = Math.pow(value.durationTicks / shortest, densityExponent);
    const pulseWeight = strongPulse || value.durationTicks <= meter.pulseTicks
      ? 1 : 0.75;
    return densityWeight * pulseWeight;
  });
  let remaining = random() * weights.reduce((total, weight) => total + weight, 0);
  for (let index = 0; index < values.length; index += 1) {
    remaining -= weights[index];
    if (remaining < 0) return values[index];
  }
  return values[values.length - 1];
}

function createVoice(meter, values, random, restChance, noteDensity) {
  const events = [];
  const completable = getCompletableTicks(values, meter.durationTicks);
  let startTick = 0;
  while (startTick < meter.durationTicks) {
    const remaining = meter.durationTicks - startTick;
    const fitting = values.filter(value => (
      value.durationTicks <= remaining
      && completable[remaining - value.durationTicks]
    ));
    if (!fitting.length) {
      throw new RangeError("Allowed values cannot complete the measure");
    }
    const chosen = chooseValue(fitting, meter, startTick, random, noteDensity);
    events.push({
      kind: events.length > 0 && random() < restChance ? "rest" : "note",
      startTick,
      noteValue: chosen.noteValue,
      dots: chosen.dots
    });
    startTick += chosen.durationTicks;
  }
  return events;
}

function melodicIndex(attackIndex, pitchCount) {
  if (pitchCount === 1) return 0;
  // Retrace the phrase at its end instead of jumping back to its first pitch.
  const period = 2 * (pitchCount - 1);
  const index = attackIndex % period;
  return index < pitchCount ? index : period - index;
}

function assignSingleHandPitches(measures, source, hands, cycle) {
  const tonalityPlan = cycle.tonalityPlan;
  hands.forEach(hand => {
    const pitches = source.reduce((result, event) => (
      result.concat(event.notes.filter(note => note.clef === hand))
    ), []);
    const attackCount = measures.reduce((count, measure) => (
      count + measure.voices[hand].filter(event => event.kind === "note").length
    ), 0);
    if (attackCount && !pitches.length) {
      throw new RangeError(`No generated pitch exists for ${hand}`);
    }
    const initial = cycle.initialPitchState || {};
    let previousValue = initial.lastPrimaryValue;
    let repeatCount = initial.repeatCount || 0;
    const random = createSeededNoteFlowRandom(cycle.seed ^ (hand === "bass" ? 0x53626173 : 0x53747265));
    let attackIndex = 0;
    measures.forEach(measure => {
      measure.voices[hand] = measure.voices[hand].map(event => {
        if (event.kind === "rest") return event;
        // Advance the melody for each attack. A time-based nearest lookup would
        // repeat one source pitch several times when shorter values are chosen.
        const pitchIndex = attackCount <= pitches.length
          ? Math.floor(attackIndex / attackCount * pitches.length)
          : melodicIndex(attackIndex, pitches.length);
        attackIndex += 1;
        let note = pitches[pitchIndex];
        const preference = getNoteFlowPitchMovement(cycle.config, random);
        if (Number.isFinite(previousValue)) {
          const distance = Math.abs(note.value - previousValue);
          const repeatsTooOften = note.value === previousValue
            && (repeatCount >= preference.repeatLimit || !preference.allowRepeat);
          if (distance > 12 || distance === 6 || repeatsTooOften) {
            const alternatives = pitches.filter(candidate => (
              candidate.value !== previousValue
              && Math.abs(candidate.value - previousValue) <= 12
              && Math.abs(candidate.value - previousValue) !== 6
            ));
            if (alternatives.length) {
              note = alternatives.slice().sort((left, right) => (
                Math.abs(left.value - note.value) - Math.abs(right.value - note.value)
              ))[0];
            }
          }
        }
        repeatCount = note.value === previousValue ? repeatCount + 1 : 1;
        previousValue = note.value;
        return Object.assign({}, event, { tonalityPlan, note });
      });
    });
  });
}

function preferredCandidates(candidates, predicate) {
  const preferred = candidates.filter(predicate);
  return preferred.length ? preferred : candidates;
}

function chooseAttackPitch(candidates, sourceNote, context, random) {
  if (!candidates.length) throw new RangeError("No tonal pitch exists inside the selected range");
  const preference = getNoteFlowPitchMovement(context.config, random);
  let choices = candidates;
  if (Number.isFinite(context.previousValue)) {
    choices = preferredCandidates(choices, candidate => (
      Math.abs(candidate.value - context.previousValue) <= 12
      && Math.abs(candidate.value - context.previousValue) !== 6
    ));
    if (context.repeatCount >= preference.repeatLimit || !preference.allowRepeat) {
      choices = preferredCandidates(choices, candidate => candidate.value !== context.previousValue);
    }
  }
  const scored = choices.map(candidate => {
    let score = -Math.abs(candidate.value - sourceNote.value) * 1.5;
    if (Number.isFinite(context.previousValue)) {
      score -= Math.abs(Math.abs(candidate.value - context.previousValue)
        - preference.preferredInterval) * 10;
    }
    if (context.harmony.pitchClasses.includes(candidate.pitchClass)) score += 12;
    score -= context.recentValues.filter(value => value === candidate.value).length * 3;
    return { candidate, score };
  }).sort((left, right) => right.score - left.score);
  const finalists = scored.filter(entry => entry.score >= scored[0].score - 7).slice(0, 3);
  return finalists[Math.floor(random() * finalists.length)].candidate;
}

function assignTwoHandPitches(measures, source, hands, cycle, durationTicks) {
  const totalTicks = durationTicks * measures.length;
  const positions = cycle.blocks.reduce((all, block) => all.concat(block.positions), []);
  const state = cycle.initialPitchState || {};
  const assigned = { bass: [], treble: [] };
  // Bass chooses its chord tones from the timed harmony, rather than repeating
  // the nearest sparse anchor. Keep each hand's random stream independent.
  ["bass", "treble"].filter(hand => hands.includes(hand)).forEach(hand => {
    const range = getNoteRange(hand, cycle.config.difficulty,
      cycle.config.ranges[hand].min, cycle.config.ranges[hand].max);
    const random = createSeededNoteFlowRandom(cycle.seed ^ (hand === "bass" ? 0x50626173 : 0x50747265));
    let previousValue = hand === "bass" ? state.lastSecondaryValue : state.lastPrimaryValue;
    let repeatCount = hand === "bass" ? state.secondaryRepeatCount || 0 : state.repeatCount || 0;
    const recentValues = ((hand === "bass" ? state.recentSecondaryValues : state.recentValues) || []).slice();
    measures.forEach((measure, measureIndex) => {
      measure.voices[hand] = measure.voices[hand].map(event => {
        if (event.kind === "rest") return event;
        const startTick = measureIndex * durationTicks + event.startTick;
        const endTick = measureIndex * durationTicks + event.endTick;
        const sourceIndex = Math.min(source.length - 1, Math.floor(startTick / totalTicks * source.length));
        const position = positions[sourceIndex];
        const sourceNote = source[sourceIndex].notes.find(note => note.clef === hand)
          || source.reduce((found, entry) => found || entry.notes.find(note => note.clef === hand), null);
        if (!sourceNote) throw new RangeError(`No generated pitch exists for ${hand}`);
        let candidates = [];
        for (let value = range.min; value <= range.max; value += 1) {
          const pitchClass = value % 12;
          if (cycle.tonalityPlan.key.scalePitchClasses.includes(pitchClass)) {
            candidates.push({ value, pitchClass });
          }
        }
        if (hand === "bass") {
          candidates = preferredCandidates(candidates, candidate => position.harmony.pitchClasses.includes(candidate.pitchClass));
          const finishesCadence = position.harmony.cadenceRole
            && endTick >= (sourceIndex + 1) / source.length * totalTicks;
          if (finishesCadence) {
            candidates = preferredCandidates(candidates, candidate => candidate.pitchClass === position.harmony.rootPitchClass);
          }
          const lastSourceIndex = Math.min(source.length - 1, Math.ceil(endTick / totalTicks * source.length) - 1);
          const primaryMinimum = Math.min(...source.slice(sourceIndex, lastSourceIndex + 1).map(entry => (
            entry.notes.find(note => note.clef === "treble").value
          )));
          candidates = preferredCandidates(candidates, candidate => candidate.value <= primaryMinimum - 5);
        } else {
          const overlappingBass = assigned.bass.filter(note => note.startTick < endTick && startTick < note.endTick);
          if (overlappingBass.length) {
            const minimum = Math.max(...overlappingBass.map(note => note.value)) + 5;
            candidates = preferredCandidates(candidates, candidate => candidate.value >= minimum);
          }
        }
        const chosen = chooseAttackPitch(candidates, sourceNote, {
          config: cycle.config, harmony: position.harmony, previousValue, repeatCount, recentValues
        }, random);
        const interval = Number.isFinite(previousValue) ? chosen.value - previousValue : null;
        const chordToneIndex = position.harmony.pitchClasses.indexOf(chosen.pitchClass);
        const note = Object.assign({}, sourceNote, chosen, {
          clef: hand,
          scaleDegree: cycle.tonalityPlan.key.scalePitchClasses.indexOf(chosen.pitchClass) + 1,
          chordToneIndex,
          isRoot: chordToneIndex === 0,
          isChordTone: chordToneIndex !== -1,
          intervalFromPrevious: interval,
          directionFromPrevious: interval === null ? 0 : Math.sign(interval)
        });
        assigned[hand].push({ value: note.value, startTick, endTick });
        repeatCount = previousValue === note.value ? repeatCount + 1 : 1;
        previousValue = note.value;
        recentValues.push(note.value);
        if (recentValues.length > 8) recentValues.shift();
        return Object.assign({}, event, { tonalityPlan: cycle.tonalityPlan, note });
      });
    });
  });
}

function playedNextState(cycle, measures, hands) {
  const chronological = measures.reduce((result, measure) => (
    result.concat(hands.reduce((events, hand) => (
      events.concat(measure.voices[hand].filter(event => event.kind === "note"))
    ), []).sort((left, right) => left.startTick - right.startTick).map(event => event.note))
  ), []);
  if (!chronological.length) return cycle.nextState;
  const next = Object.assign({}, cycle.nextState);
  const groups = cycle.config.handMode === "two"
    ? [chronological.filter(note => note.clef === "treble"), chronological.filter(note => note.clef === "bass")]
    : [chronological];
  groups.forEach((notes, index) => {
    if (!notes.length) return;
    const values = notes.map(note => note.value);
    const last = notes[notes.length - 1];
    const intervals = values.slice(1).map((value, offset) => value - values[offset]);
    let repeatCount = 1;
    while (repeatCount < notes.length && values[values.length - 1 - repeatCount] === last.value) repeatCount += 1;
    if (index === 0) {
      Object.assign(next, { lastPrimaryValue: last.value, lastClef: last.clef,
        recentValues: values.slice(-8), recentIntervals: intervals.slice(-3), repeatCount });
    } else {
      Object.assign(next, { lastSecondaryValue: last.value,
        recentSecondaryValues: values.slice(-6), secondaryRepeatCount: repeatCount });
    }
  });
  return next;
}

// Rhythmic score for the preview and the melody training round.
export function generateNoteFlowRhythmicScore(cycle, options = {}) {
  const source = cycle && cycle.timeline && cycle.timeline.events;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError("A generated Note Flow cycle is required");
  }
  const meter = getNoteFlowMeter(options.meter || "4/4");
  const measureCount = options.measureCount === undefined ? 1 : options.measureCount;
  if (!Number.isInteger(measureCount) || measureCount < 1 || measureCount > 32) {
    throw new RangeError("Measure count must be between 1 and 32");
  }
  const restChance = options.restChance === undefined ? 0 : options.restChance;
  if (!Number.isFinite(restChance) || restChance < 0 || restChance > 1) {
    throw new RangeError("Rest chance must be between 0 and 1");
  }
  const noteDensity = options.noteDensity === undefined ? 50 : options.noteDensity;
  if (!Number.isFinite(noteDensity) || noteDensity < 0 || noteDensity > 100) {
    throw new RangeError("Note density must be between 0 and 100");
  }
  const hands = options.hands || (cycle.config.handMode === "two"
    ? ["treble", "bass"]
    : cycle.config.clefs);
  if (!Array.isArray(hands) || !hands.length
    || new Set(hands).size !== hands.length
    || hands.some(hand => hand !== "bass" && hand !== "treble")) {
    throw new RangeError("Select one or two distinct valid hands");
  }
  const values = {};
  hands.forEach(hand => { values[hand] = getValues(options, hand, meter); });
  const measures = Array.from({ length: measureCount }, (_, measureIndex) => {
    const voices = {};
    const singleAcrossClefs = cycle.config.handMode === "single"
      && hands.length === 2;
    const sourcePosition = source[Math.floor(measureIndex / measureCount * source.length)];
    const sourceNote = singleAcrossClefs && sourcePosition.notes.find(note => (
      hands.indexOf(note.clef) !== -1
    ));
    const activeHand = singleAcrossClefs
      ? sourceNote ? sourceNote.clef : hands[0] : null;
    hands.forEach(hand => {
      if (singleAcrossClefs && hand !== activeHand) return;
      const handSeed = hand === "bass" ? 0x42617373 : 0x54726562;
      const random = createSeededNoteFlowRandom(
        (cycle.seed ^ handSeed ^ Math.imul(measureIndex + 1, 0x9e3779b1)) >>> 0
      );
      voices[hand] = createVoice(meter, values[hand], random, restChance, noteDensity);
    });
    if (singleAcrossClefs) {
      const silentHand = hands.find(hand => hand !== activeHand);
      voices[silentHand] = voices[activeHand].map(event => Object.assign({}, event, {
        kind: "rest"
      }));
    }
    return createNoteFlowRhythmMeasure({ meter: meter.signature, voices });
  });
  const singleHand = cycle.config.handMode === "single";
  if (singleHand) {
    assignSingleHandPitches(measures, source, hands, cycle);
  } else {
    assignTwoHandPitches(measures, source, hands, cycle, meter.durationTicks);
  }
  return {
    rhythmVersion: NOTE_FLOW_RHYTHM_VERSION,
    meter,
    hands,
    // The moving score must keep its density while future bars are buffered
    // and past bars are discarded, even if a buffer contains no sixteenths.
    allowedValues: hands.reduce((result, hand) => {
      result[hand] = values[hand].map(value => value.dots
        ? `dotted-${value.noteValue}` : value.noteValue);
      return result;
    }, {}),
    measures,
    nextState: playedNextState(cycle, measures, hands)
  };
}
