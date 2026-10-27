import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import { createNoteFlowPrimaryMelody, getNoteFlowPitchMovement } from "./NoteFlowMelody";
import { getNoteRange } from "./NoteRanges";

const MIN_HAND_SEPARATION_SEMITONES = 5;
const MAX_SECONDARY_INTERVAL_SEMITONES = 12;
const MAX_RECENT_VALUES = 6;

function getBassRange(cycle) {
  return getNoteRange(
    "bass",
    cycle.config.difficulty,
    cycle.config.ranges.bass.min,
    cycle.config.ranges.bass.max
  );
}

function createChordCandidates(position, bassRange) {
  const candidates = [];
  for (let value = bassRange.min; value <= bassRange.max; value += 1) {
    const pitchClass = ((value % 12) + 12) % 12;
    const chordToneIndex = position.harmony.pitchClasses.indexOf(pitchClass);
    if (chordToneIndex !== -1) {
      candidates.push({ value, pitchClass, chordToneIndex });
    }
  }
  return candidates;
}

function preferCandidates(candidates, predicate) {
  const preferred = candidates.filter(predicate);
  return preferred.length > 0 ? preferred : candidates;
}

function filterForPrimaryVoice(candidates, primaryValue) {
  const separated = candidates.filter(candidate => (
    candidate.value <= primaryValue - MIN_HAND_SEPARATION_SEMITONES
  ));
  if (separated.length > 0) {
    return separated;
  }
  return preferCandidates(candidates, candidate => candidate.value < primaryValue);
}

function filterForMovement(candidates, previousValue) {
  if (!Number.isFinite(previousValue)) {
    return candidates;
  }
  return preferCandidates(candidates, candidate => {
    const distance = Math.abs(candidate.value - previousValue);
    return distance <= MAX_SECONDARY_INTERVAL_SEMITONES && distance !== 6;
  });
}

function prepareForCadence(candidates, nextPosition, bassRange, previousValue, repeatCount) {
  if (!nextPosition || !nextPosition.harmony.cadenceRole) {
    return candidates;
  }
  const nextPrimaryValue = nextPosition.primaryNote.value;
  let cadenceRoots = createChordCandidates(nextPosition, bassRange).filter(candidate => (
    candidate.chordToneIndex === 0
  ));
  cadenceRoots = filterForPrimaryVoice(cadenceRoots, nextPrimaryValue);
  if (repeatCount >= 1 && cadenceRoots.length === 1 && cadenceRoots[0].value === previousValue) {
    candidates = preferCandidates(candidates, candidate => candidate.value !== previousValue);
  }
  return preferCandidates(candidates, candidate => (
    cadenceRoots.some(root => {
      const distance = Math.abs(root.value - candidate.value);
      return distance <= MAX_SECONDARY_INTERVAL_SEMITONES && distance !== 6;
    })
  ));
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

function createsParallelPerfectInterval({
  candidate,
  primaryValue,
  previousPrimaryValue,
  previousSecondaryValue
}) {
  if (
    !Number.isFinite(previousPrimaryValue)
    || !Number.isFinite(previousSecondaryValue)
  ) {
    return false;
  }
  const primaryDirection = getDirection(primaryValue - previousPrimaryValue);
  const secondaryDirection = getDirection(candidate.value - previousSecondaryValue);
  if (primaryDirection === 0 || primaryDirection !== secondaryDirection) {
    return false;
  }
  const previousVerticalInterval = Math.abs(
    previousPrimaryValue - previousSecondaryValue
  ) % 12;
  const nextVerticalInterval = Math.abs(primaryValue - candidate.value) % 12;
  return (previousVerticalInterval === 0 || previousVerticalInterval === 7)
    && nextVerticalInterval === previousVerticalInterval;
}

function scoreCandidate({
  candidate,
  position,
  primaryValue,
  previousPrimaryValue,
  previousSecondaryValue,
  patternToneIndex,
  recentValues,
  movementPreference
}) {
  let score = 0;
  const isRoot = candidate.chordToneIndex === 0;
  if (position.harmony.startsStep) {
    score += isRoot ? 42 : -8;
  }
  if (position.harmony.cadenceRole) {
    score += isRoot ? 56 : -18;
  }
  if (candidate.chordToneIndex === patternToneIndex) {
    score += 24;
  }

  if (Number.isFinite(previousSecondaryValue)) {
    const interval = candidate.value - previousSecondaryValue;
    const distance = Math.abs(interval);
    if (movementPreference) {
      score -= Math.abs(distance - movementPreference.preferredInterval) * 8;
    }
    if (distance === 0) {
      score += 15;
    } else if (distance <= 4) {
      score += 30;
    } else if (distance <= 7) {
      score += 19;
    } else if (distance <= 12) {
      score += 7;
    }
    if (Number.isFinite(previousPrimaryValue)) {
      const primaryDirection = getDirection(primaryValue - previousPrimaryValue);
      const secondaryDirection = getDirection(interval);
      if (primaryDirection !== 0 && secondaryDirection === -primaryDirection) {
        score += 11;
      }
    }
  }

  const verticalInterval = primaryValue - candidate.value;
  if (verticalInterval >= 7 && verticalInterval <= 19) {
    score += 18;
  } else if (verticalInterval > 28) {
    score -= (verticalInterval - 28) * 2;
  }
  if (createsParallelPerfectInterval({
    candidate,
    primaryValue,
    previousPrimaryValue,
    previousSecondaryValue
  })) {
    score -= 34;
  }
  score -= recentValues.filter(value => value === candidate.value).length * 4;
  return score;
}

function chooseCandidate(candidates, context, random) {
  const scored = candidates.map(candidate => ({
    candidate,
    score: scoreCandidate(Object.assign({}, context, { candidate }))
  })).sort((first, second) => second.score - first.score);
  const bestScore = scored[0].score;
  const finalists = scored.filter(entry => entry.score >= bestScore - 9).slice(0, 3);
  return finalists[Math.floor(random() * finalists.length)].candidate;
}

function createSecondaryNote(candidate, position, context) {
  const previousValue = context.previousSecondaryValue;
  const interval = Number.isFinite(previousValue)
    ? candidate.value - previousValue
    : null;
  return {
    value: candidate.value,
    pitchClass: candidate.pitchClass,
    clef: "bass",
    chordToneIndex: candidate.chordToneIndex,
    isRoot: candidate.chordToneIndex === 0,
    intervalFromPrevious: interval,
    directionFromPrevious: interval === null ? 0 : getDirection(interval),
    verticalInterval: context.primaryValue - candidate.value,
    hasMinimumHandSeparation: (
      candidate.value <= context.primaryValue - MIN_HAND_SEPARATION_SEMITONES
    ),
    createsParallelPerfectInterval: createsParallelPerfectInterval({
      candidate,
      primaryValue: context.primaryValue,
      previousPrimaryValue: context.previousPrimaryValue,
      previousSecondaryValue: previousValue
    }),
    harmonicFunction: position.harmonicFunction
  };
}

export function addFullDensitySecondVoice(cycle, previousState = null) {
  if (!cycle || !Array.isArray(cycle.blocks)) {
    throw new Error("A generated Note Flow melody is required.");
  }
  const previous = previousState && typeof previousState === "object"
    ? previousState
    : {};
  const enabled = cycle.config.handMode === "two";
  const bassRange = getBassRange(cycle);
  const random = createSeededNoteFlowRandom(cycle.seed ^ 0x42617373);
  let previousSecondaryValue = Number.isFinite(Number(previous.lastSecondaryValue))
    ? Number(previous.lastSecondaryValue)
    : null;
  let previousPrimaryValue = Number.isFinite(Number(previous.lastPrimaryValue))
    ? Number(previous.lastPrimaryValue)
    : null;
  let repeatCount = Number.isInteger(previous.secondaryRepeatCount)
    ? previous.secondaryRepeatCount
    : (previousSecondaryValue === null ? 0 : 1);
  const recentValues = Array.isArray(previous.recentSecondaryValues)
    ? previous.recentSecondaryValues.slice(-MAX_RECENT_VALUES)
    : [];
  let generatedNoteCount = 0;
  let separationFallbackCount = 0;
  let parallelPerfectCount = 0;

  cycle.blocks.forEach(block => {
    let stepOffset = 0;
    block.positions.forEach((position, positionIndex) => {
      if (!enabled) {
        position.secondaryNote = null;
        return;
      }
      if (position.harmony.startsStep) {
        stepOffset = 0;
      }
      const primaryValue = position.primaryNote.value;
      let candidates = createChordCandidates(position, bassRange);
      if (position.harmony.cadenceRole) {
        candidates = preferCandidates(candidates, candidate => (
          candidate.chordToneIndex === 0
        ));
      }
      candidates = filterForPrimaryVoice(candidates, primaryValue);
      candidates = prepareForCadence(
        candidates,
        block.positions[positionIndex + 1],
        bassRange,
        previousSecondaryValue,
        repeatCount
      );
      candidates = filterForMovement(candidates, previousSecondaryValue);
      const movementPreference = getNoteFlowPitchMovement(cycle.config, random);
      if (repeatCount >= movementPreference.repeatLimit || !movementPreference.allowRepeat) {
        candidates = preferCandidates(candidates, candidate => (
          candidate.value !== previousSecondaryValue
        ));
      }
      const accompanimentPattern = [0, 2, 1, 2];
      const patternToneIndex = accompanimentPattern[
        stepOffset % accompanimentPattern.length
      ];
      const chosen = chooseCandidate(candidates, {
        position,
        primaryValue,
        previousPrimaryValue,
        previousSecondaryValue,
        patternToneIndex,
        recentValues,
        movementPreference
      }, random);
      const secondaryNote = createSecondaryNote(chosen, position, {
        primaryValue,
        previousPrimaryValue,
        previousSecondaryValue
      });
      position.secondaryNote = secondaryNote;
      generatedNoteCount += 1;
      if (!secondaryNote.hasMinimumHandSeparation) {
        separationFallbackCount += 1;
      }
      if (secondaryNote.createsParallelPerfectInterval) {
        parallelPerfectCount += 1;
      }
      repeatCount = chosen.value === previousSecondaryValue
        ? repeatCount + 1
        : 1;
      recentValues.push(chosen.value);
      if (recentValues.length > MAX_RECENT_VALUES) {
        recentValues.shift();
      }
      previousSecondaryValue = chosen.value;
      previousPrimaryValue = primaryValue;
      stepOffset += 1;
    });
  });

  cycle.secondaryVoicePlan = {
    profile: enabled ? "hard-full-density" : "disabled-single-hand",
    enabled,
    density: enabled ? 1 : 0,
    generatedNoteCount,
    bassRange,
    minimumHandSeparationSemitones: MIN_HAND_SEPARATION_SEMITONES,
    maximumMelodicIntervalSemitones: MAX_SECONDARY_INTERVAL_SEMITONES,
    separationFallbackCount,
    parallelPerfectCount
  };
  cycle.nextState = Object.assign({}, cycle.nextState, {
    lastSecondaryValue: previousSecondaryValue,
    secondaryRepeatCount: repeatCount,
    recentSecondaryValues: recentValues
  });
  return cycle;
}

export function createNoteFlowFullTwoHandMelody(
  input = {},
  cycleIndex = 0,
  previousState = null
) {
  const cycle = createNoteFlowPrimaryMelody(input, cycleIndex, previousState);
  return addFullDensitySecondVoice(cycle, previousState);
}
