import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import { normalizeNoteFlowChordPercent } from "./NoteFlowMix";
import {
  chooseNoteFlowSuspendedChord, createNoteFlowDiatonicSeventh, createNoteFlowDominantSeventh
} from "./NoteFlowChordPlan";
import { NOTE_FLOW_DIATONIC_SEVENTH_TYPES, NOTE_FLOW_SEVENTH_TYPES, NOTE_FLOW_SUSPENSION_TYPES } from "./NoteFlowChordConfig";
import { getNoteFlowTonality } from "./NoteFlowTonality";
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

function singleNoteFromChord(chord) {
  const treble = chord.trebleValues || chord.values;
  const bass = chord.bassValues || [];
  const hand = treble.length ? treble : bass;
  const value = hand[hand.length - 1];
  return Object.assign({}, chord, {
    values: [value],
    trebleValues: treble.length ? [value] : [],
    bassValues: treble.length ? [] : [value],
    bassValue: treble.length ? null : value
  });
}

function planDominantSevenths(chords, tonality, weight, random) {
  const sevenths = new Map();
  for (let index = 0; index < chords.length - 1; index += 1) {
    const dominant = chords[index];
    const tonic = chords[index + 1];
    if (dominant.scaleDegree !== 5 || dominant.quality !== "major" || tonic.scaleDegree !== 1
      || random() >= weight / 100) continue;
    const chord = createNoteFlowDominantSeventh(dominant, tonic, tonality);
    if (chord) sevenths.set(dominant.id, { chord, next: tonic });
  }
  return sevenths;
}

function planSeventhChords(chords, tonality, extensions, seed) {
  const dominant = extensions.dominant7;
  const sevenths = dominant && dominant.enabled
    ? planDominantSevenths(chords, tonality, dominant.weight, createSeededNoteFlowRandom(`${seed}:dominant7`))
    : new Map();
  const reserved = new Set();
  for (const pair of sevenths.values()) {
    reserved.add(pair.chord.id);
    reserved.add(pair.next.id);
  }
  const random = createSeededNoteFlowRandom(`${seed}:diatonicSevenths`);
  const candidates = [];
  for (let index = 0; index < chords.length - 1; index += 1) {
    const original = chords[index];
    const next = chords[index + 1];
    const type = original.quality + "7";
    if (!NOTE_FLOW_DIATONIC_SEVENTH_TYPES.includes(type)
      || reserved.has(original.id) || reserved.has(next.id)) continue;
    const setting = extensions[type];
    const roll = random();
    const order = random();
    if (!setting || !setting.enabled || roll >= setting.weight / 100) continue;
    const chord = createNoteFlowDiatonicSeventh(original, next, tonality, type);
    if (chord) candidates.push({ chord, next, order });
  }
  // Adjacent pairs compete for their shared chord. Vary the order so that
  // a seventh chord does not always lose because it comes later in the phrase.
  candidates.sort((first, second) => first.order - second.order);
  for (const pair of candidates) {
    if (reserved.has(pair.chord.id) || reserved.has(pair.next.id)) continue;
    sevenths.set(pair.chord.id, pair);
    reserved.add(pair.chord.id);
    reserved.add(pair.next.id);
  }
  return sevenths;
}

function replaceTargetChord(target, chord) {
  target.chord = chord;
  target.expectedValues = chord.values.slice();
}

function placeSeventhChords(targets, sevenths) {
  const targetIndices = new Map();
  const protectedTargets = new Set();
  targets.forEach((target, index) => {
    targetIndices.set(target.chord.id, index);
    if (NOTE_FLOW_SUSPENSION_TYPES.includes(target.chord.quality)) {
      protectedTargets.add(target);
      protectedTargets.add(targets[index + 1]);
    }
  });
  for (const [id, pair] of sevenths) {
    const index = targetIndices.get(id);
    const target = targets[index];
    const resolution = targets[index + 1];
    if (!resolution || resolution.chord.id !== pair.next.id
      || target.globalEndTick !== resolution.globalStartTick
      || protectedTargets.has(target) || protectedTargets.has(resolution)) continue;

    // Move full-chord slots to the pair when needed in Mixed mode. Reserve
    // each pair once placed so later substitutions cannot break its resolution.
    const missingChordSlots = Number(target.expectedValues.length === 1)
      + Number(resolution.expectedValues.length === 1);
    const donors = [];
    for (let earlier = index - 1; earlier >= 0 && donors.length < missingChordSlots; earlier -= 1) {
      const donor = targets[earlier];
      if (donor.expectedValues.length > 1 && !protectedTargets.has(donor)) donors.push(donor);
    }
    if (pair.chord.quality !== "dominant7") {
      for (let later = index + 2; later < targets.length - 1 && donors.length < missingChordSlots; later += 1) {
        const donor = targets[later];
        if (donor.expectedValues.length > 1 && !protectedTargets.has(donor)) donors.push(donor);
      }
    }
    if (donors.length !== missingChordSlots) continue;
    donors.forEach(donor => replaceTargetChord(donor, singleNoteFromChord(donor.chord)));
    replaceTargetChord(target, pair.chord);
    replaceTargetChord(resolution, pair.next);
    protectedTargets.add(target);
    protectedTargets.add(resolution);
  }
}

// Each onset is one MIDI target, whether it contains a chord or one note.
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
  const chordPercent = options.chordPercent === undefined ? 100
    : normalizeNoteFlowChordPercent(options.chordPercent);
  const targetOffset = options.targetOffset || 0;
  const extensions = plan.options.chordExtensions || plan.options.suspensions || {};
  const useSuspensions = NOTE_FLOW_SUSPENSION_TYPES.some(type => extensions[type] && extensions[type].enabled);
  const scheduledChords = Math.round((targetOffset + chords.length) * chordPercent / 100)
    - Math.round(targetOffset * chordPercent / 100);
  const useSevenths = plan.chordSize >= 4 && scheduledChords >= 2
    && NOTE_FLOW_SEVENTH_TYPES.some(type => extensions[type] && extensions[type].enabled);
  const tonality = (useSuspensions || useSevenths) && getNoteFlowTonality(plan.keyId);
  const suspensionRandom = useSuspensions && createSeededNoteFlowRandom(`${seed}:suspensions`);
  const sevenths = useSevenths && tonality
    ? planSeventhChords(chords, tonality, extensions, seed)
    : new Map();
  const isChordSlot = index => Math.round((index + 1) * chordPercent / 100)
    !== Math.round(index * chordPercent / 100);
  const hands = Array.isArray(plan.hands) ? plan.hands.slice()
    : plan.bassNotePlanned ? ["treble", "bass"] : ["treble"];
  const measures = [];
  const targets = [];
  let chordIndex = 0;
  let resolutionPending = false;
  let borrowedChordSlot = null;
  let nextSuspensionIndex = 0;

  while (chordIndex < chords.length) {
    if (measures.length >= MAX_MEASURES) {
      throw new RangeError("Chord rhythm exceeds the maximum measure count");
    }
    const measureIndex = measures.length;
    const events = [];
    let startTick = 0;
    while (startTick < meter.durationTicks) {
      const duration = chooseDuration(startTick, meter, values, random);
      // Every new bar begins with an onset while targets remain.
      const isRest = chordIndex >= chords.length
        || (!resolutionPending && events.length > 0 && random() < restChance);
      const targetIndex = targetOffset + targets.length;
      let chord = isRest ? null : chords[chordIndex];
      if (chord) {
        let suspension = null;
        if (targetIndex === borrowedChordSlot) {
          chord = singleNoteFromChord(chord);
          borrowedChordSlot = null;
        } else if (!resolutionPending && !isChordSlot(targetIndex)) {
          chord = singleNoteFromChord(chord);
        } else if (!resolutionPending && useSuspensions && tonality && borrowedChordSlot === null
          && chordIndex >= nextSuspensionIndex && chordIndex < chords.length - 1
          && startTick % meter.pulseTicks === 0 && !sevenths.has(chord.id)
          && !(chordIndex > 0 && sevenths.has(chords[chordIndex - 1].id))) {
          // A mixed exercise may move the next chord slot forward for the resolution.
          // Pay it back in this cycle, before its closing chord.
          let resolutionSlot = targetIndex + 1;
          const lastBorrowableSlot = targetIndex + chords.length - chordIndex - 1;
          while (resolutionSlot < lastBorrowableSlot && !isChordSlot(resolutionSlot)) {
            resolutionSlot += 1;
          }
          if (isChordSlot(resolutionSlot)) {
            suspension = chooseNoteFlowSuspendedChord(chord, tonality, extensions, suspensionRandom);
            if (suspension && resolutionSlot > targetIndex + 1) borrowedChordSlot = resolutionSlot;
          }
        }
        if (suspension) {
          chord = suspension;
          resolutionPending = true;
          nextSuspensionIndex = chordIndex + 2;
        } else {
          chordIndex += 1;
          resolutionPending = false;
        }
      }
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

  if (sevenths.size) placeSeventhChords(targets, sevenths);
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
