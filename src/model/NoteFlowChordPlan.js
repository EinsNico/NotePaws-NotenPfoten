import { createNoteFlowHarmonicPlan } from "./NoteFlowHarmony";
import { NOTE_FLOW_SUSPENSION_TYPES, normalizeNoteFlowChordOptions } from "./NoteFlowChordConfig";
import { resolveNoteFlowChordAlgorithmSettings } from "./NoteFlowMovement";
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

function createSuspendedGrip(chord, type, tonality) {
  const [root, third, fifth] = chord.pitchClasses;
  const interval = type === "sus2" ? 2 : 5;
  const suspension = pitchClass(root + interval);
  if (!tonality.scalePitchClasses.includes(suspension)) return null;

  // Keep the root and fifth in place so only the suspended voices move into the resolution.
  const shift = interval - pitchClass(third - root);
  const suspendHand = values => values.map(value => pitchClass(value) === third ? value + shift : value);
  const bassValues = suspendHand(chord.bassValues);
  const trebleValues = suspendHand(chord.trebleValues);
  const fits = (values, { min, max }) => !values.length
    || (values.every(value => value >= min && value <= max)
      && values[values.length - 1] - values[0] <= HAND_SPANS[values.length]);
  if (!fits(bassValues, chord.ranges.bass) || !fits(trebleValues, chord.ranges.treble)) return null;

  return Object.assign({}, chord, {
    id: `${chord.id}-${type}`,
    quality: type,
    pitchClasses: [root, suspension, fifth],
    raisedLeadingTone: false,
    values: bassValues.concat(trebleValues).sort((first, second) => first - second),
    bassValues,
    trebleValues,
    bassValue: bassValues.length ? bassValues[0] : null
  });
}

export function chooseNoteFlowSuspendedChord(chord, tonality, settings, random) {
  if (chord.quality !== "major" && chord.quality !== "minor") return null;
  const candidates = NOTE_FLOW_SUSPENSION_TYPES
    .filter(type => settings[type] && settings[type].enabled)
    .map(type => ({ weight: settings[type].weight, chord: createSuspendedGrip(chord, type, tonality) }))
    .filter(candidate => candidate.chord);
  if (!candidates.length) return null;
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  let roll = random() * Math.max(100, totalWeight);
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) return candidate.chord;
  }
  return null;
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
      if (noteCount >= chord.pitchClasses.length && counts.some(count => !count)) return;
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

function targetMotion(random, algorithmSettings, hand) {
  const frequency = hand === "bass" ? algorithmSettings.bassJumpFrequency : algorithmSettings.jumpFrequency;
  return random() < frequency / 100 ? algorithmSettings.jumpSize : 1.5;
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
  )).map(candidate => candidate.values);
}

function findCompleteVoicing(chord, ranked) {
  // Pick the right-hand movement first, then the independent bass movement.
  // Overlapping ranges allow both hands into the same register, but a physical
  // MIDI key occurs only once per target, never once for each hand.
  for (const treble of ranked.treble) {
    for (const bass of ranked.bass) {
      const values = bass.concat(treble).sort((first, second) => first - second);
      if (new Set(values).size !== values.length) continue;
      if (!chord.pitchClasses.every(pc => values.some(value => pitchClass(value) === pc))) continue;
      return { values, bassValues: bass.slice(), trebleValues: treble.slice() };
    }
  }
  return null;
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
      options.movement, targetMotion(random[hand], options.algorithmSettings, hand));
  });
  const voicing = findCompleteVoicing(chord, ranked);
  if (!voicing) throw new RangeError("No playable chord for the selected hand ranges and note counts.");
  return voicing;
}

function voiceSeventhChord(chord, originalChord, nextChord, resolvesInHand) {
  const ranked = {};
  for (const hand of ["treble", "bass"]) {
    const field = hand + "Values";
    const original = originalChord[field];
    const resolution = nextChord[field];
    const candidates = createVoicingCandidates(chord, original.length, originalChord.ranges[hand], hand, false)
      .filter(values => values.every(value => resolvesInHand(value, resolution)));
    const distance = values => motion(values, original) + motion(values, resolution);
    ranked[hand] = candidates.sort((first, second) => distance(first) - distance(second));
  }
  const voicing = findCompleteVoicing(chord, ranked);
  if (!voicing) return null;
  return Object.assign(chord, voicing, { bassValue: voicing.bassValues.length ? voicing.bassValues[0] : null });
}

export function createNoteFlowDominantSeventh(dominant, tonic, tonality) {
  const [root, leadingTone] = dominant.pitchClasses;
  const seventh = pitchClass(root + 10);
  if (!tonality.scalePitchClasses.includes(seventh)) return null;
  const descent = pitchClass(seventh - tonic.pitchClasses[1]);
  const chord = Object.assign({}, dominant, {
    quality: "dominant7",
    romanNumeral: "V7",
    pitchClasses: dominant.pitchClasses.concat(seventh)
  });
  return voiceSeventhChord(chord, dominant, tonic, (value, resolution) => {
    const pc = pitchClass(value);
    if (pc === leadingTone) return resolution.includes(value + 1);
    if (pc === seventh) return resolution.includes(value - descent);
    return true;
  });
}

export function createNoteFlowDiatonicSeventh(original, next, tonality, quality) {
  const scale = tonality.scalePitchClasses;
  const seventhDegree = (original.scaleDegree + 5) % scale.length;
  const seventh = scale[seventhDegree];
  const expectedInterval = quality === "major7" ? 11 : 10;
  if (pitchClass(seventh - original.pitchClasses[0]) !== expectedInterval) return null;

  const lowerScaleTone = scale[(seventhDegree + scale.length - 1) % scale.length];
  const descent = pitchClass(seventh - lowerScaleTone);
  const chord = Object.assign({}, original, {
    quality,
    romanNumeral: original.romanNumeral + "7",
    pitchClasses: original.pitchClasses.concat(seventh)
  });
  // The seventh may stay in place as a common tone or descend one scale step.
  return voiceSeventhChord(chord, original, next, (value, resolution) => (
    pitchClass(value) !== seventh || resolution.includes(value) || resolution.includes(value - descent)
  ));
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
  options.algorithmSettings = resolveNoteFlowChordAlgorithmSettings(options.movement, options.algorithmSettings);
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
