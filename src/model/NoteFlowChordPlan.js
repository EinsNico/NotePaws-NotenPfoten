import { createNoteFlowHarmonicPlan } from "./NoteFlowHarmony";
import { normalizeNoteFlowChordOptions } from "./NoteFlowChordConfig";
import { createSeededNoteFlowRandom } from "./NoteFlowStructure";

export const NOTE_FLOW_CHORD_PLAN_VERSION = 2;

// Candidate generation is confined to a hand-sized window, even when a user
// selects the entire piano. Large grips are explicit advanced settings.
const HAND_SPANS = { 1: 0, 2: 12, 3: 12, 4: 12, 5: 19, 6: 24, 7: 28, 8: 31 };
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

function pitchClass(value) {
  return ((value % 12) + 12) % 12;
}

function chordQuality(pitchClasses) {
  const third = pitchClass(pitchClasses[1] - pitchClasses[0]);
  const fifth = pitchClass(pitchClasses[2] - pitchClasses[0]);
  if (third === 4 && fifth === 7) return "major";
  if (third === 3 && fifth === 7) return "minor";
  if (third === 3 && fifth === 6) return "diminished";
  throw new Error("Unsupported chord quality in the selected key.");
}

function getHarmonicStyle(tonality, accidentals) {
  if (tonality.mode !== "minor") return "major";
  // "No accidentals" and "only flats" must not introduce a raised seventh
  // that the current notation settings cannot represent reliably.
  return accidentals === "no" || accidentals === "onlyFlat"
    ? "modal-minor"
    : "tonal-minor";
}

function getChordDegree(sourceDegree, style) {
  if (style !== "modal-minor") return sourceDegree;
  // i–iv–VI–VII–i is a deliberate natural-minor alternative to V–i.
  if (sourceDegree === 2) return 6;
  if (sourceDegree === 5) return 7;
  return sourceDegree;
}

function createChord(tonality, sourceDegree, style) {
  const degree = getChordDegree(sourceDegree, style);
  const scale = tonality.scalePitchClasses;
  const index = degree - 1;
  const pitchClasses = [scale[index], scale[(index + 2) % 7], scale[(index + 4) % 7]];
  const raisedLeadingTone = style === "tonal-minor" && degree === 5;
  if (raisedLeadingTone) pitchClasses[1] = pitchClass(pitchClasses[1] + 1);
  const quality = chordQuality(pitchClasses);
  const numerals = tonality.mode === "minor" ? MINOR_NUMERALS : MAJOR_NUMERALS;
  return {
    scaleDegree: degree,
    sourceDegree,
    romanNumeral: raisedLeadingTone ? "V" : numerals[index],
    quality,
    pitchClasses,
    raisedLeadingTone
  };
}

function createVoicingCandidates(chord, noteCount, range, hand, legacyVoicing) {
  if (!noteCount) return [[]];
  const permitted = [];
  for (let value = range.min; value <= range.max; value += 1) {
    if (chord.pitchClasses.indexOf(pitchClass(value)) !== -1) permitted.push(value);
  }
  // A single bass tone supports the harmony with its root. A narrow range may
  // still allow an inversion if no root can be played in that range.
  if (hand === "bass" && noteCount === 1) {
    const roots = permitted.filter(value => pitchClass(value) === chord.pitchClasses[0]);
    return (roots.length ? roots : permitted).map(value => [value]);
  }
  const duplicated = chord.quality === "diminished" ? chord.pitchClasses[1] : chord.pitchClasses[0];
  const candidates = [];
  function addNext(values, startIndex) {
    if (values.length === noteCount) {
      const counts = chord.pitchClasses.map(pc => values.filter(value => pitchClass(value) === pc).length);
      if (noteCount >= 3 && counts.some(count => !count)) return;
      if (legacyVoicing && noteCount === 4 && counts[chord.pitchClasses.indexOf(duplicated)] !== 2) return;
      candidates.push(values.slice());
      return;
    }
    if (permitted.length - startIndex < noteCount - values.length) return;
    for (let index = startIndex; index < permitted.length; index += 1) {
      const value = permitted[index];
      if (values.length && value - values[0] > HAND_SPANS[noteCount]) break;
      values.push(value);
      addNext(values, index + 1);
      values.pop();
    }
  }
  addNext([], 0);
  return candidates;
}

function center(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sameValues(first, second) {
  return !!first && first.length === second.length && first.every((value, index) => value === second[index]);
}

function motion(values, previous) {
  if (!previous || !previous.length) return 0;
  return values.reduce((sum, value, index) => sum + Math.abs(value
    - previous[Math.min(index, previous.length - 1)]), 0) / values.length;
}

function parallelPerfectPenalty(previous, current) {
  if (!previous || previous.length !== current.length) return 0;
  let penalty = 0;
  for (let first = 0; first < current.length; first += 1) {
    for (let second = first + 1; second < current.length; second += 1) {
      const before = pitchClass(previous[second] - previous[first]);
      const after = pitchClass(current[second] - current[first]);
      const lowerMotion = current[first] - previous[first];
      const upperMotion = current[second] - previous[second];
      if ((before === 0 || before === 7) && before === after
        && lowerMotion !== 0 && Math.sign(lowerMotion) === Math.sign(upperMotion)) penalty += 30;
    }
  }
  return penalty;
}

function targetMotion(movement, random, algorithmSettings, hand) {
  if (movement === "custom") {
    const frequency = hand === "bass" ? algorithmSettings.bassJumpFrequency : algorithmSettings.jumpFrequency;
    return random() < frequency / 100 ? algorithmSettings.jumpSize : 1.5;
  }
  if (movement === "leaping") return 8 + random() * 4;
  if (movement === "mixed") return random() < 0.4 ? 6 + random() * 2 : 2;
  return 1.5;
}

function rankCandidates(candidates, previous, range, movement, target) {
  const rangeCenter = (range.min + range.max) / 2;
  const cost = values => {
    if (!values.length) return 0;
    if (!previous || !previous.length) return Math.abs(center(values) - rangeCenter)
      + (values[values.length - 1] - values[0]) / 10;
    // An identical grip loses to every playable alternative. This prevents the
    // least-motion rule from parking a hand on one key across repeated chords.
    const repeatPenalty = sameValues(values, previous) ? 10000 : 0;
    const averageMotion = motion(values, previous);
    const centerMotion = Math.abs(center(values) - center(previous));
    return repeatPenalty + Math.abs(averageMotion - target) * values.length * 2
      + Math.abs(centerMotion - target) * 2
      + parallelPerfectPenalty(previous, values) * (movement === "calm" ? 1 : 0.2)
      + Math.abs(center(values) - rangeCenter) / 30;
  };
  return candidates.map(values => ({ values, cost: cost(values) })).sort((first, second) => (
    first.cost - second.cost || first.values.join(",").localeCompare(second.values.join(","))
  ));
}

function chooseHandVoicing(chord, options, previous, random, candidateCache, legacyVoicing) {
  const ranked = {};
  ["treble", "bass"].forEach(hand => {
    const noteCount = hand === "bass" ? options.bassNotesPerChord : options.trebleNotesPerChord;
    const range = options.ranges[hand];
    const cacheKey = `${chord.pitchClasses.join()}:${chord.quality}:${hand}:${noteCount}`;
    if (!candidateCache.has(cacheKey)) {
      candidateCache.set(cacheKey, createVoicingCandidates(chord, noteCount, range, hand, legacyVoicing));
    }
    ranked[hand] = rankCandidates(candidateCache.get(cacheKey), previous[hand], range,
      options.movement, targetMotion(options.movement, random[hand], options.algorithmSettings, hand));
  });
  // Pick the right-hand movement first, then the independent bass movement.
  // Overlapping ranges allow both hands into the same register, but a physical
  // MIDI key occurs only once per target, never once for each hand.
  for (const treble of ranked.treble) {
    for (const bass of ranked.bass) {
      const values = bass.values.concat(treble.values).sort((first, second) => first - second);
      if (new Set(values).size !== values.length) continue;
      if (!chord.pitchClasses.every(pc => values.some(value => pitchClass(value) === pc))) continue;
      return { values, bassValues: bass.values.slice(), trebleValues: treble.values.slice() };
    }
  }
  throw new RangeError("No playable chord for the selected hand ranges and note counts.");
}

function previousHandValues(previous, hand, noteCount, range) {
  const field = hand === "bass" ? "lastBassValues" : "lastTrebleValues";
  const fallback = hand === "bass" ? (Number.isInteger(previous.lastBassValue) ? [previous.lastBassValue] : null)
    : previous.lastVoicing;
  const values = Array.isArray(previous[field]) ? previous[field] : fallback;
  return Array.isArray(values) && values.length === noteCount
    && values.every(value => Number.isInteger(value) && value >= range.min && value <= range.max)
    ? values.slice() : null;
}

export function createNoteFlowChordPlan(input = {}, cycleIndex = 0, previousKeyId = null, previousState = null) {
  const options = normalizeNoteFlowChordOptions(input);
  const harmonicPlan = createNoteFlowHarmonicPlan(
    Object.assign({}, input, options), cycleIndex, previousKeyId
  );
  const tonality = harmonicPlan.tonalityPlan.key;
  const harmonicStyle = getHarmonicStyle(tonality, options.accidentals);
  const random = {
    treble: createSeededNoteFlowRandom(harmonicPlan.seed ^ 0x43484f52),
    bass: createSeededNoteFlowRandom(harmonicPlan.seed ^ 0x42415353)
  };
  const previous = previousState || {};
  const previousHands = {
    treble: previousHandValues(previous, "treble", options.trebleNotesPerChord, options.ranges.treble),
    bass: previousHandValues(previous, "bass", options.bassNotesPerChord, options.ranges.bass)
  };
  const legacyVoicing = input.handMode === undefined && input.bassNotesPerChord === undefined
    && input.trebleNotesPerChord === undefined;
  const candidateCache = new Map();
  let lastValues = null;
  const blocks = harmonicPlan.blocks.map(block => {
    const chords = block.positions.filter(position => position.harmony.startsStep).map(position => {
      const chord = createChord(tonality, position.harmony.scaleDegree, harmonicStyle);
      const selected = chooseHandVoicing(chord, options, previousHands, random, candidateCache, legacyVoicing);
      previousHands.treble = selected.trebleValues;
      previousHands.bass = selected.bassValues;
      lastValues = selected.values;
      return Object.assign({
        id: position.id,
        positionIndex: position.positionIndex,
        globalIndex: position.globalIndex,
        harmonicFunction: position.harmonicFunction,
        values: selected.values,
        bassValues: selected.bassValues,
        trebleValues: selected.trebleValues,
        bassValue: selected.bassValues.length ? selected.bassValues[0] : null,
        ranges: options.ranges
      }, chord);
    });
    return { id: block.id, role: block.role, templateId: block.harmonicTemplateId, chords };
  });
  return {
    version: NOTE_FLOW_CHORD_PLAN_VERSION,
    cycleIndex: harmonicPlan.index,
    keyId: tonality.id,
    harmonicStyle,
    options,
    tonalityMode: options.tonalityMode,
    inputMode: options.inputMode,
    behavior: options.behavior,
    chordSize: options.chordSize,
    hands: ["treble", "bass"].filter(hand => previousHands[hand] && previousHands[hand].length),
    bassNotePlanned: options.bassNote,
    blocks,
    nextState: {
      lastVoicing: lastValues.slice(),
      lastTrebleValues: previousHands.treble.slice(),
      lastBassValues: previousHands.bass.slice(),
      lastBassValue: previousHands.bass.length ? previousHands.bass[0] : null
    }
  };
}
