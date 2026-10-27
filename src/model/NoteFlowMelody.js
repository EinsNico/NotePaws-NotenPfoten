import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import { createNoteFlowHarmonicPlan } from "./NoteFlowHarmony";
import { getNoteRange } from "./NoteRanges";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings } from "./NoteFlowMovement";

const MELODY_PROFILES = {
  calm: {
    id: "calm-primary",
    maxSpanSemitones: 9,
    maxIntervalSemitones: 7,
    leapThresholdSemitones: 4,
    comfortableIntervalSemitones: 2,
    stepBonus: 20,
    largeIntervalPenalty: 8,
    intervalScores: [2, 30, 22, 14, 9, 4, 0],
    longIntervalPenalty: 5
  },
  mixed: {
    id: "mixed-primary",
    clefPhraseLength: 4,
    maxSpanSemitones: 12,
    maxIntervalSemitones: 9,
    leapThresholdSemitones: 7,
    comfortableIntervalSemitones: 7,
    stepBonus: 6,
    largeIntervalPenalty: 2,
    intervalScores: [0, 16, 22, 26, 20, 15, 8],
    longIntervalPenalty: 5
  },
  leaping: {
    id: "leaping-primary",
    clefPhraseLength: 2,
    maxSpanSemitones: 24,
    maxIntervalSemitones: 12,
    leapThresholdSemitones: 9,
    comfortableIntervalSemitones: 12,
    stepBonus: 0,
    largeIntervalPenalty: 0,
    intervalScores: [2, 3, 8, 14, 22, 30, 36],
    longIntervalPenalty: 0
  }
};

function getMelodyProfile(movement, algorithmSettings) {
  if (normalizeNoteFlowMovement(movement) === "custom") {
    return {
      id: "custom-primary",
      maxSpanSemitones: 24,
      maxIntervalSemitones: 12,
      leapThresholdSemitones: 13,
      comfortableIntervalSemitones: 12,
      stepBonus: 0,
      largeIntervalPenalty: 0,
      intervalScores: [0],
      longIntervalPenalty: 0,
      algorithmSettings: normalizeNoteFlowAlgorithmSettings(algorithmSettings)
    };
  }
  return MELODY_PROFILES[normalizeNoteFlowMovement(movement)];
}


export function getNoteFlowPitchMovement(config, random) {
  const movement = normalizeNoteFlowMovement(config.movement);
  const presets = {
    calm: { jumpFrequency: 10, jumpSize: 3, repetition: 10 },
    mixed: { jumpFrequency: 45, jumpSize: 7, repetition: 8 },
    leaping: { jumpFrequency: 85, jumpSize: 10, repetition: 2 }
  };
  const settings = movement === "custom"
    ? normalizeNoteFlowAlgorithmSettings(config.algorithmSettings)
    : presets[movement];
  return {
    preferredInterval: random() < settings.jumpFrequency / 100
      ? settings.jumpSize : (random() < settings.repetition / 100 ? 0 : 2),
    repeatLimit: movement === "custom" ? 2 + Math.floor(settings.repetition / 25) : 2,
    allowRepeat: settings.repetition > 0
  };
}

function getConfiguredRanges(config) {
  return {
    bass: getNoteRange(
      "bass",
      config.difficulty,
      config.ranges.bass.min,
      config.ranges.bass.max
    ),
    treble: getNoteRange(
      "treble",
      config.difficulty,
      config.ranges.treble.min,
      config.ranges.treble.max
    )
  };
}

function getPrimaryClefs(config) {
  return config.handMode === "two" ? ["treble"] : config.clefs.slice();
}

function getSupportingClefs(value, clefs, ranges) {
  return clefs.filter(clef => (
    value >= ranges[clef].min && value <= ranges[clef].max
  ));
}

function createPitchPool(cycle) {
  const ranges = getConfiguredRanges(cycle.config);
  const clefs = getPrimaryClefs(cycle.config);
  const scalePitchClasses = cycle.tonalityPlan.key.scalePitchClasses;
  const minimum = Math.min(...clefs.map(clef => ranges[clef].min));
  const maximum = Math.max(...clefs.map(clef => ranges[clef].max));
  const candidates = [];

  for (let value = minimum; value <= maximum; value += 1) {
    const pitchClass = ((value % 12) + 12) % 12;
    const scaleDegreeIndex = scalePitchClasses.indexOf(pitchClass);
    if (scaleDegreeIndex === -1) {
      continue;
    }
    const supportingClefs = getSupportingClefs(value, clefs, ranges);
    if (supportingClefs.length === 0) {
      continue;
    }
    candidates.push({
      value,
      pitchClass,
      scaleDegree: scaleDegreeIndex + 1,
      supportingClefs
    });
  }

  candidates.forEach((candidate, index) => {
    candidate.diatonicIndex = index;
  });
  return { candidates, ranges, clefs };
}

function findNearestCandidateIndex(candidates, value) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const distance = Math.abs(candidate.value - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function chooseActiveTessitura(pool, random, previousValue, profile, clefs) {
  if (pool.length === 0) {
    return [];
  }
  const centerIndex = Number.isFinite(previousValue)
    ? findNearestCandidateIndex(pool, previousValue)
    : Math.floor(random() * pool.length);
  const centerValue = pool[centerIndex].value;
  let active = pool.filter(candidate => (
    candidate.value >= centerValue - profile.maxSpanSemitones / 2
    && candidate.value <= centerValue + profile.maxSpanSemitones / 2
  ));

  const minimumWindowSize = Math.min(5, pool.length);
  const cadenceReadyWindows = pool.map((startCandidate, startIndex) => {
    const window = pool.slice(startIndex).filter(candidate => (
      candidate.value - startCandidate.value <= profile.maxSpanSemitones
    ));
    const degrees = window.map(candidate => candidate.scaleDegree);
    const midpoint = window.length > 0
      ? (window[0].value + window[window.length - 1].value) / 2
      : startCandidate.value;
    return {
      window,
      distanceFromCenter: Math.abs(midpoint - centerValue),
      supportsCadences: window.length >= minimumWindowSize
        && degrees.indexOf(1) !== -1
        && degrees.indexOf(5) !== -1
    };
  }).filter(candidate => candidate.supportsCadences)
    .sort((first, second) => first.distanceFromCenter - second.distanceFromCenter);

  if (cadenceReadyWindows.length > 0) {
    // When both clefs are selected, varied presets should explore both
    // registers instead of spending the entire cycle in a high/low window.
    const spanningWindows = profile.clefPhraseLength && clefs.length === 2
      ? cadenceReadyWindows.filter(candidate => clefs.every(clef => (
        candidate.window.filter(note => note.supportingClefs.includes(clef)).length >= 2
      ))) : [];
    const distinctRegisters = spanningWindows.filter(candidate => clefs.every(clef => (
      candidate.window.some(note => note.supportingClefs.length === 1
        && note.supportingClefs[0] === clef)
    )));
    const windows = distinctRegisters.length ? distinctRegisters
      : spanningWindows.length ? spanningWindows : cadenceReadyWindows;
    // A short window at the edge can look closer to the last note but leave
    // only one pitch below a reachable climax. Use the full selected span
    // before comparing its centre, so a phrase never gets trapped on one key.
    const fullestSize = Math.max(...windows.map(candidate => candidate.window.length));
    active = windows.find(candidate => candidate.window.length === fullestSize).window;
  }

  if (active.length < minimumWindowSize) {
    const halfWindow = minimumWindowSize;
    const start = Math.max(
      0,
      Math.min(pool.length - halfWindow, centerIndex - Math.floor(halfWindow / 2))
    );
    active = pool.slice(start, start + halfWindow);
  }
  return active;
}

function chooseClef(candidate, currentClef, ranges, preferredClef) {
  if (candidate.supportingClefs.includes(preferredClef)) {
    return preferredClef;
  }
  if (
    currentClef
    && candidate.supportingClefs.indexOf(currentClef) !== -1
  ) {
    return currentClef;
  }
  if (candidate.supportingClefs.length === 1) {
    return candidate.supportingClefs[0];
  }
  return candidate.supportingClefs.reduce((bestClef, clef) => {
    if (!bestClef) {
      return clef;
    }
    const center = (ranges[clef].min + ranges[clef].max) / 2;
    const bestCenter = (ranges[bestClef].min + ranges[bestClef].max) / 2;
    return Math.abs(candidate.value - center) < Math.abs(candidate.value - bestCenter)
      ? clef
      : bestClef;
  }, null);
}

function getContourTarget(positionIndex, positionCount, climaxPositionIndex) {
  if (positionCount <= 1) {
    return 0.5;
  }
  if (positionIndex <= climaxPositionIndex) {
    const progress = climaxPositionIndex === 0
      ? 1
      : positionIndex / climaxPositionIndex;
    return 0.32 + progress * 0.52;
  }
  const remaining = positionCount - 1 - climaxPositionIndex;
  const progress = remaining === 0
    ? 1
    : (positionIndex - climaxPositionIndex) / remaining;
  return 0.84 - progress * 0.46;
}

function getClimaxPosition(block) {
  const departurePositions = block.positions.filter(position => (
    position.phaseRole === "departure"
  ));
  if (departurePositions.length > 0) {
    return departurePositions[departurePositions.length - 1].positionIndex;
  }
  return Math.max(0, Math.floor((block.positions.length - 1) * 0.68));
}

function choosePlannedClimax(activePool, previousCandidate, profile) {
  if (activePool.length === 0) {
    return null;
  }
  const reachable = previousCandidate
    ? activePool.filter(candidate => (
      Math.abs(candidate.value - previousCandidate.value) <= profile.maxIntervalSemitones
    ))
    : activePool;
  const choices = reachable.length > 0 ? reachable : activePool;
  return choices[choices.length - 1];
}

function getDirection(interval) {
  if (interval > 0) {
    return 1;
  }
  if (interval < 0) {
    return -1;
  }
  return 0;
}

function filterMelodicCandidates(
  candidates,
  previousCandidate,
  recentIntervals,
  repeatCount,
  profile
) {
  if (!previousCandidate || candidates.length <= 1) {
    return candidates;
  }
  let filtered = candidates.filter(candidate => {
    const interval = candidate.value - previousCandidate.value;
    return Math.abs(interval) <= profile.maxIntervalSemitones
      && Math.abs(interval) !== 6;
  });
  if (filtered.length === 0) {
    filtered = candidates.slice();
  }

  const repeatLimit = profile.algorithmSettings
    ? 2 + Math.floor(profile.algorithmSettings.repetition / 25) : 2;
  if (repeatCount >= repeatLimit
    || (profile.algorithmSettings && profile.algorithmSettings.repetition === 0)) {
    const withoutRepeat = filtered.filter(candidate => (
      candidate.value !== previousCandidate.value
    ));
    if (withoutRepeat.length > 0) filtered = withoutRepeat;
  }

  const previousInterval = recentIntervals[recentIntervals.length - 1] || 0;
  if (Math.abs(previousInterval) >= profile.leapThresholdSemitones) {
    const resolved = filtered.filter(candidate => {
      const interval = candidate.value - previousCandidate.value;
      return getDirection(interval) === -getDirection(previousInterval)
        && Math.abs(interval) <= 4;
    });
    if (resolved.length > 0) {
      filtered = resolved;
    }
  }

  const twoRecentLeaps = recentIntervals.length >= 2
    && recentIntervals.slice(-2).every(interval => Math.abs(interval) > 2);
  if (twoRecentLeaps && !profile.algorithmSettings) {
    const stepwise = filtered.filter(candidate => (
      Math.abs(candidate.value - previousCandidate.value) <= 2
    ));
    if (stepwise.length > 0) {
      filtered = stepwise;
    }
  }

  return filtered;
}

function scoreCandidate({
  candidate,
  position,
  positionCount,
  climaxPositionIndex,
  activePool,
  previousCandidate,
  recentValues,
  motifTargetIndex,
  preferredInterval,
  profile
}) {
  let score = 0;
  const isChordTone = position.harmony.pitchClasses.indexOf(candidate.pitchClass) !== -1;
  const strongPosition = position.harmony.startsStep
    || position.structuralRole === "anchor"
    || position.structuralRole === "cadence";
  score += isChordTone ? (strongPosition ? 34 : 13) : (strongPosition ? -18 : 2);

  if (previousCandidate) {
    const semitoneDistance = Math.abs(candidate.value - previousCandidate.value);
    const diatonicDistance = Math.abs(
      candidate.diatonicIndex - previousCandidate.diatonicIndex
    );
    const intervalScores = profile.intervalScores;
    score += intervalScores[Math.min(diatonicDistance, intervalScores.length - 1)];
    if (semitoneDistance > 7) {
      score -= (semitoneDistance - 7) * profile.longIntervalPenalty;
    }
    if (semitoneDistance <= 2) {
      score += profile.stepBonus;
    }
    if (semitoneDistance > profile.comfortableIntervalSemitones) {
      score -= (
        semitoneDistance - profile.comfortableIntervalSemitones
      ) * profile.largeIntervalPenalty;
    }
    if (profile.algorithmSettings && Number.isFinite(preferredInterval)) {
      // A preference rather than an exact interval: cadence and tonal candidates still decide.
      score -= Math.abs(semitoneDistance - preferredInterval) * 10;
    }
  }

  const activeSpan = activePool[activePool.length - 1].value - activePool[0].value;
  const normalizedHeight = activeSpan === 0
    ? 0.5
    : Math.max(0, Math.min(
      1,
      (candidate.value - activePool[0].value) / activeSpan
    ));
  const contourTarget = getContourTarget(
    position.positionIndex,
    positionCount,
    climaxPositionIndex
  );
  score -= Math.abs(normalizedHeight - contourTarget) * 27;

  if (Number.isFinite(motifTargetIndex)) {
    score += Math.max(
      -22,
      28 - Math.abs(candidate.diatonicIndex - motifTargetIndex) * 12
    );
  }

  const recentMatches = recentValues.filter(value => value === candidate.value).length;
  score -= recentMatches * (profile.algorithmSettings
    ? 8 * (1 - profile.algorithmSettings.repetition / 100) : 7);
  return score;
}

function chooseWeightedCandidate(candidates, scoreContext, random) {
  const scored = candidates.map(candidate => ({
    candidate,
    score: scoreCandidate(Object.assign({}, scoreContext, { candidate }))
  })).sort((first, second) => second.score - first.score);
  const bestScore = scored[0].score;
  const finalists = scored.filter(entry => entry.score >= bestScore - 14).slice(0, 4);
  const weights = finalists.map(entry => Math.exp((entry.score - bestScore) / 7));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * totalWeight;
  for (let index = 0; index < finalists.length; index += 1) {
    target -= weights[index];
    if (target <= 0) {
      return finalists[index].candidate;
    }
  }
  return finalists[0].candidate;
}

function getPhaseOffset(position, phasePositions) {
  return phasePositions.findIndex(candidate => (
    candidate.positionIndex === position.positionIndex
  ));
}

function getMotifTargetIndex(position, block, sourceMotif, transposition) {
  if (!sourceMotif || sourceMotif.length === 0) {
    return null;
  }
  const phasePositions = block.positions.filter(candidate => (
    candidate.phaseRole === position.phaseRole
  ));
  const phaseOffset = getPhaseOffset(position, phasePositions);
  if (
    position.phaseRole !== "statement"
    && position.phaseRole !== "restatement"
  ) {
    return null;
  }
  const source = sourceMotif[phaseOffset % sourceMotif.length];
  return source.diatonicIndex + transposition;
}

function getMotifRole(blockIndex, phaseRole) {
  if (phaseRole === "statement") {
    return blockIndex === 0 ? "source" : "return";
  }
  if (phaseRole === "restatement") {
    return "variation";
  }
  return null;
}

function createNote(candidate, clef, previousCandidate, position, motifId, motifRole) {
  const interval = previousCandidate
    ? candidate.value - previousCandidate.value
    : null;
  return {
    value: candidate.value,
    pitchClass: candidate.pitchClass,
    scaleDegree: candidate.scaleDegree,
    diatonicIndex: candidate.diatonicIndex,
    clef,
    intervalFromPrevious: interval,
    directionFromPrevious: interval === null ? 0 : getDirection(interval),
    isChordTone: position.harmony.pitchClasses.indexOf(candidate.pitchClass) !== -1,
    isClimax: false,
    motifId,
    motifRole
  };
}

function generateBlock({
  block,
  blockIndex,
  activePool,
  fullPool,
  ranges,
  random,
  previousCandidate,
  currentClef,
  clefPhrases,
  sourceMotif,
  initialRecentIntervals = [],
  initialRecentValues = [],
  initialRepeatCount = 0,
  profile
}) {
  const climaxPositionIndex = getClimaxPosition(block);
  let plannedClimax = choosePlannedClimax(
    activePool,
    previousCandidate,
    profile
  );
  const recentIntervals = initialRecentIntervals.slice(-3);
  const recentValues = initialRecentValues.slice(-8);
  let repeatCount = initialRepeatCount;
  const localMotif = [];
  const motifId = `${block.id}:motif-a`;
  const motifTransposition = random() < 0.5 ? -1 : 1;
  const cadenceDegree = block.cadenceType === "closed" ? 1 : 5;
  const boundedCadenceCandidates = fullPool.filter(candidate => (
    candidate.scaleDegree === cadenceDegree
    && (
      !plannedClimax
      || (
        candidate.value <= plannedClimax.value
        && candidate.value >= plannedClimax.value - profile.maxSpanSemitones
      )
    )
  ));
  const allCadenceCandidates = fullPool.filter(candidate => (
    candidate.scaleDegree === cadenceDegree
  ));
  const closingHarmony = block.positions[block.positions.length - 1].harmony;
  const availableChordTones = fullPool.filter(candidate => (
    closingHarmony.pitchClasses.includes(candidate.pitchClass)
  ));
  const cadenceCandidates = boundedCadenceCandidates.length > 0
    ? boundedCadenceCandidates
    : allCadenceCandidates.length > 0 ? allCadenceCandidates
      : availableChordTones.length > 0 ? availableChordTones : fullPool;

  block.climaxPositionIndex = climaxPositionIndex;
  block.motifId = motifId;

  block.positions.forEach(position => {
    let candidates = activePool.slice();
    const isFinalPosition = position.positionIndex === block.positions.length - 1;
    const isBeforeFinalPosition = position.positionIndex === block.positions.length - 2;

    if (
      isBeforeFinalPosition
      && previousCandidate
      && previousCandidate.scaleDegree === cadenceDegree
    ) {
      const withoutEarlyCadenceRepeat = candidates.filter(candidate => (
        candidate.value !== previousCandidate.value
      ));
      if (withoutEarlyCadenceRepeat.length > 0) {
        candidates = withoutEarlyCadenceRepeat;
      }
    }

    if (position.positionIndex < climaxPositionIndex && plannedClimax) {
      const belowClimax = candidates.filter(candidate => (
        candidate.value < plannedClimax.value
      ));
      if (belowClimax.length > 0) {
        candidates = belowClimax;
      }
      if (position.positionIndex === climaxPositionIndex - 1) {
        const leadsToClimax = candidates.filter(candidate => {
          const interval = Math.abs(plannedClimax.value - candidate.value);
          return interval <= profile.maxIntervalSemitones && interval !== 6;
        });
        if (leadsToClimax.length > 0) {
          candidates = leadsToClimax;
        }
      }
    } else if (position.positionIndex === climaxPositionIndex && plannedClimax) {
      const reachableClimax = Math.abs(
        plannedClimax.value - (previousCandidate ? previousCandidate.value : plannedClimax.value)
      ) <= profile.maxIntervalSemitones;
      if (reachableClimax) {
        candidates = [plannedClimax];
      }
    } else if (position.positionIndex > climaxPositionIndex && plannedClimax) {
      const belowClimax = candidates.filter(candidate => (
        candidate.value < plannedClimax.value
      ));
      if (belowClimax.length > 0) {
        candidates = belowClimax;
      }
    }

    if (isBeforeFinalPosition) {
      const preparesCadence = candidates.filter(candidate => (
        cadenceCandidates.some(cadenceCandidate => {
          const interval = Math.abs(cadenceCandidate.value - candidate.value);
          return interval <= profile.maxIntervalSemitones && interval !== 6;
        })
      ));
      if (preparesCadence.length > 0) {
        candidates = preparesCadence;
      }
    }

    if (isFinalPosition) {
      candidates = cadenceCandidates;
    }

    candidates = filterMelodicCandidates(
      candidates,
      previousCandidate,
      recentIntervals,
      repeatCount,
      profile
    );

    const preferredClef = clefPhrases ? clefPhrases.clefs[
      Math.floor((blockIndex * block.positions.length + position.positionIndex)
        / profile.clefPhraseLength) % clefPhrases.clefs.length
    ] : null;
    if (preferredClef) {
      const inPreferredRegister = candidates.filter(candidate => (
        candidate.supportingClefs.includes(preferredClef)
      ));
      if (inPreferredRegister.length) candidates = inPreferredRegister;
    }

    const referenceMotif = sourceMotif && sourceMotif.length > 0
      ? sourceMotif
      : localMotif;
    const motifTargetIndex = blockIndex === 0 && position.phaseRole === "statement"
      ? null
      : getMotifTargetIndex(
        position,
        block,
        referenceMotif,
        motifTransposition
      );
    let preferredInterval = null;
    if (previousCandidate && profile.algorithmSettings) {
      const settings = profile.algorithmSettings;
      preferredInterval = random() < settings.jumpFrequency / 100
        ? settings.jumpSize
        : (random() < settings.repetition / 100 ? 0 : 2);
    }
    const chosen = chooseWeightedCandidate(candidates, {
      position,
      positionCount: block.positions.length,
      climaxPositionIndex,
      activePool,
      previousCandidate,
      recentValues,
      motifTargetIndex,
      preferredInterval,
      profile
    }, random);
    const nextClef = chooseClef(chosen, currentClef, ranges, preferredClef);
    const motifRole = getMotifRole(blockIndex, position.phaseRole);
    position.motifId = motifRole ? motifId : null;
    position.primaryNote = createNote(
      chosen,
      nextClef,
      previousCandidate,
      position,
      position.motifId,
      motifRole
    );
    if (position.positionIndex === climaxPositionIndex) {
      position.primaryNote.isClimax = true;
      plannedClimax = chosen;
    }
    if (blockIndex === 0 && position.phaseRole === "statement") {
      localMotif.push(chosen);
    }

    const interval = previousCandidate ? chosen.value - previousCandidate.value : 0;
    if (previousCandidate && chosen.value === previousCandidate.value) {
      repeatCount += 1;
    } else {
      repeatCount = 1;
    }
    if (previousCandidate) {
      recentIntervals.push(interval);
      if (recentIntervals.length > 3) {
        recentIntervals.shift();
      }
    }
    recentValues.push(chosen.value);
    if (recentValues.length > 8) {
      recentValues.shift();
    }
    previousCandidate = chosen;
    currentClef = nextClef;
  });

  return {
    previousCandidate,
    currentClef,
    sourceMotif: sourceMotif && sourceMotif.length > 0 ? sourceMotif : localMotif,
    recentIntervals,
    recentValues,
    repeatCount
  };
}

export function createNoteFlowPrimaryMelody(
  input = {},
  cycleIndex = 0,
  previousState = null
) {
  const previous = previousState && typeof previousState === "object"
    ? previousState
    : {};
  const hasPreviousPrimaryValue = Number.isFinite(Number(previous.lastPrimaryValue));
  const cycle = createNoteFlowHarmonicPlan(
    input,
    cycleIndex,
    previous.keyId || null
  );
  const poolResult = createPitchPool(cycle);
  if (poolResult.candidates.length === 0) {
    throw new Error("The selected Note Flow range contains no tonal notes.");
  }
  const random = createSeededNoteFlowRandom(cycle.seed ^ 0x4d656c6f);
  const profile = getMelodyProfile(cycle.config.movement, cycle.config.algorithmSettings);
  const activePool = chooseActiveTessitura(
    poolResult.candidates,
    random,
    Number(previous.lastPrimaryValue),
    profile,
    poolResult.clefs
  );
  let previousCandidate = Number.isFinite(Number(previous.lastPrimaryValue))
    ? poolResult.candidates.find(candidate => (
      candidate.value === Number(previous.lastPrimaryValue)
    )) || null
    : null;
  let currentClef = previous.lastClef || null;
  const firstClef = currentClef && poolResult.clefs.includes(currentClef)
    ? currentClef : poolResult.clefs[0];
  const clefPhrases = profile.clefPhraseLength && poolResult.clefs.length === 2
    ? { clefs: [firstClef, poolResult.clefs.find(clef => clef !== firstClef)] }
    : null;
  let sourceMotif = null;
  let recentIntervals = Array.isArray(previous.recentIntervals)
    ? previous.recentIntervals.slice(-3)
    : [];
  let recentValues = Array.isArray(previous.recentValues)
    ? previous.recentValues.slice(-8)
    : [];
  let repeatCount = Number.isInteger(previous.repeatCount)
    ? previous.repeatCount
    : (previousCandidate ? 1 : 0);

  cycle.blocks.forEach((block, blockIndex) => {
    const result = generateBlock({
      block,
      blockIndex,
      activePool,
      fullPool: poolResult.candidates,
      ranges: poolResult.ranges,
      random,
      previousCandidate,
      currentClef,
      clefPhrases,
      sourceMotif,
      initialRecentIntervals: recentIntervals,
      initialRecentValues: recentValues,
      initialRepeatCount: repeatCount,
      profile
    });
    previousCandidate = result.previousCandidate;
    currentClef = result.currentClef;
    sourceMotif = result.sourceMotif;
    recentIntervals = result.recentIntervals;
    recentValues = result.recentValues;
    repeatCount = result.repeatCount;
  });

  cycle.initialPitchState = {
    lastPrimaryValue: Number.isFinite(previous.lastPrimaryValue) ? previous.lastPrimaryValue : null,
    lastSecondaryValue: Number.isFinite(previous.lastSecondaryValue) ? previous.lastSecondaryValue : null,
    repeatCount: Number.isInteger(previous.repeatCount) ? previous.repeatCount : 0,
    secondaryRepeatCount: Number.isInteger(previous.secondaryRepeatCount) ? previous.secondaryRepeatCount : 0,
    recentValues: Array.isArray(previous.recentValues) ? previous.recentValues.slice(-8) : [],
    recentSecondaryValues: Array.isArray(previous.recentSecondaryValues) ? previous.recentSecondaryValues.slice(-6) : []
  };
  cycle.melodyPlan = {
    profile: profile.id,
    availablePitchCount: poolResult.candidates.length,
    activePitchCount: activePool.length,
    activeMinValue: activePool[0].value,
    activeMaxValue: activePool[activePool.length - 1].value,
    maxSpanSemitones: profile.maxSpanSemitones,
    maxIntervalSemitones: profile.maxIntervalSemitones,
    leapThresholdSemitones: profile.leapThresholdSemitones,
    primaryClefs: poolResult.clefs,
    continuedFromPreviousCycle: hasPreviousPrimaryValue
  };
  cycle.nextState = {
    keyId: cycle.tonalityPlan.key.id,
    lastPrimaryValue: previousCandidate.value,
    lastClef: currentClef,
    recentIntervals,
    recentValues,
    repeatCount
  };
  return cycle;
}
