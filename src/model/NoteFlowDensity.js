import { createNoteFlowFullTwoHandMelody } from "./NoteFlowSecondVoice";
import { createSeededNoteFlowRandom } from "./NoteFlowStructure";
import { getNoteFlowPitchMovement } from "./NoteFlowMelody";

const SUPPORTED_DENSITIES = [1, 2, 4, 8, 16];

function getDirection(interval) {
  if (interval > 0) {
    return 1;
  }
  if (interval < 0) {
    return -1;
  }
  return 0;
}

function normalizeDensity(requestedDensity, positionCount) {
  const numericDensity = Number(requestedDensity);
  const requested = Number.isFinite(numericDensity)
    ? Math.round(numericDensity)
    : 4;
  const supported = SUPPORTED_DENSITIES.filter(value => value <= positionCount);
  if (supported.indexOf(requested) !== -1) {
    return requested;
  }
  const candidates = supported.length > 0 ? supported : [1];
  return candidates.reduce((closest, value) => (
    Math.abs(value - requested) < Math.abs(closest - requested)
      ? value
      : closest
  ), candidates[0]);
}

function getSelectionScore(position, index, selectedIndexes, positionCount) {
  let score = position.harmony.supportPriority * 105;
  score += position.harmony.tension * 55;
  if (position.harmony.startsStep) {
    score += 82;
  }
  if (position.structuralRole === "anchor") {
    score += 38;
  }
  if (position.phaseRole === "departure") {
    score += 24;
  }
  if (position.harmony.cadenceRole) {
    score += 260;
  }

  const nearestSelectedDistance = selectedIndexes.reduce(
    (nearest, selectedIndex) => Math.min(nearest, Math.abs(index - selectedIndex)),
    positionCount
  );
  score += nearestSelectedDistance * 13;
  return score;
}

function selectPositionIndexes(block, requestedDensity) {
  const positionCount = block.positions.length;
  const density = normalizeDensity(requestedDensity, positionCount);
  if (density >= positionCount) {
    return block.positions.map((position, index) => index);
  }

  const finalIndex = positionCount - 1;
  const selectedIndexes = [finalIndex];
  while (selectedIndexes.length < density) {
    const candidates = block.positions
      .map((position, index) => ({
        index,
        score: selectedIndexes.indexOf(index) === -1
          ? getSelectionScore(position, index, selectedIndexes, positionCount)
          : Number.NEGATIVE_INFINITY
      }))
      .sort((first, second) => (
        second.score - first.score || first.index - second.index
      ));
    selectedIndexes.push(candidates[0].index);
  }
  return selectedIndexes.sort((first, second) => first - second);
}

function createsParallelPerfectInterval(
  primaryValue,
  secondaryValue,
  previousPrimaryValue,
  previousSecondaryValue
) {
  if (
    !Number.isFinite(previousPrimaryValue)
    || !Number.isFinite(previousSecondaryValue)
  ) {
    return false;
  }
  const primaryDirection = getDirection(primaryValue - previousPrimaryValue);
  const secondaryDirection = getDirection(secondaryValue - previousSecondaryValue);
  if (primaryDirection === 0 || primaryDirection !== secondaryDirection) {
    return false;
  }
  const previousInterval = Math.abs(
    previousPrimaryValue - previousSecondaryValue
  ) % 12;
  const currentInterval = Math.abs(primaryValue - secondaryValue) % 12;
  return (previousInterval === 0 || previousInterval === 7)
    && currentInterval === previousInterval;
}

function preferCandidates(candidates, predicate) {
  const preferred = candidates.filter(predicate);
  return preferred.length > 0 ? preferred : candidates;
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

function filterForHandSeparation(candidates, primaryValue) {
  const separated = candidates.filter(candidate => candidate.value <= primaryValue - 5);
  if (separated.length > 0) {
    return separated;
  }
  return preferCandidates(candidates, candidate => candidate.value < primaryValue);
}

function filterForMovement(candidates, previousSecondaryValue) {
  if (!Number.isFinite(previousSecondaryValue)) {
    return candidates;
  }
  const bounded = candidates.filter(candidate => (
    Math.abs(candidate.value - previousSecondaryValue) <= 12
  ));
  if (bounded.length > 0) {
    return preferCandidates(bounded, candidate => (
      Math.abs(candidate.value - previousSecondaryValue) !== 6
    ));
  }
  return preferCandidates(candidates, candidate => {
    const distance = Math.abs(candidate.value - previousSecondaryValue);
    return distance !== 6;
  });
}

function prepareForSelectedCadence(candidates, nextEntry, bassRange, previousValue, repeatCount) {
  if (!nextEntry || !nextEntry.position.harmony.cadenceRole) {
    return candidates;
  }
  let roots = createChordCandidates(nextEntry.position, bassRange).filter(candidate => (
    candidate.chordToneIndex === 0
  ));
  roots = filterForHandSeparation(roots, nextEntry.position.primaryNote.value);
  if (repeatCount >= 1 && roots.length === 1 && roots[0].value === previousValue) {
    candidates = preferCandidates(candidates, candidate => candidate.value !== previousValue);
  }
  return preferCandidates(candidates, candidate => roots.some(root => {
    const distance = Math.abs(root.value - candidate.value);
    return distance <= 12 && distance !== 6;
  }));
}

function scoreSparseCandidate(
  candidate,
  entry,
  denseNote,
  previousPrimaryValue,
  previousSecondaryValue,
  recentValues,
  movementPreference
) {
  const position = entry.position;
  const primaryValue = position.primaryNote.value;
  let score = 0;
  if (position.harmony.startsStep && candidate.chordToneIndex === 0) {
    score += 34;
  }
  if (position.harmony.cadenceRole && candidate.chordToneIndex === 0) {
    score += 80;
  }
  if (denseNote && candidate.chordToneIndex === denseNote.chordToneIndex) {
    score += 12;
  }
  if (Number.isFinite(previousSecondaryValue)) {
    const distance = Math.abs(candidate.value - previousSecondaryValue);
    score += Math.max(0, 42 - distance * 4);
    if (movementPreference) {
      score -= Math.abs(distance - movementPreference.preferredInterval) * 10;
    }
  }
  const verticalInterval = primaryValue - candidate.value;
  if (verticalInterval >= 7 && verticalInterval <= 19) {
    score += 20;
  }
  if (createsParallelPerfectInterval(
    primaryValue,
    candidate.value,
    previousPrimaryValue,
    previousSecondaryValue
  )) {
    score -= 60;
  }
  score -= recentValues.filter(value => value === candidate.value).length * 5;
  return score;
}

function chooseSparseCandidate(
  candidates,
  entry,
  denseNote,
  previousPrimaryValue,
  previousSecondaryValue,
  recentValues,
  movementPreference
) {
  return candidates.map(candidate => ({
    candidate,
    score: scoreSparseCandidate(
      candidate,
      entry,
      denseNote,
      previousPrimaryValue,
      previousSecondaryValue,
      recentValues,
      movementPreference
    )
  })).sort((first, second) => (
    second.score - first.score || first.candidate.value - second.candidate.value
  ))[0].candidate;
}

function createSparseNote(
  candidate,
  position,
  previousPrimaryValue,
  previousSecondaryValue
) {
  const primaryValue = position.primaryNote.value;
  const interval = Number.isFinite(previousSecondaryValue)
    ? candidate.value - previousSecondaryValue
    : null;
  return {
    value: candidate.value,
    pitchClass: candidate.pitchClass,
    clef: "bass",
    chordToneIndex: candidate.chordToneIndex,
    isRoot: candidate.chordToneIndex === 0,
    intervalFromPrevious: interval,
    directionFromPrevious: interval === null ? 0 : getDirection(interval),
    verticalInterval: primaryValue - candidate.value,
    hasMinimumHandSeparation: candidate.value <= primaryValue - 5,
    createsParallelPerfectInterval: createsParallelPerfectInterval(
      primaryValue,
      candidate.value,
      previousPrimaryValue,
      previousSecondaryValue
    ),
    harmonicFunction: position.harmonicFunction,
    isDensityAnchor: true
  };
}

function applySelectedPositions(cycle, selectedByBlock, previousState = null) {
  const previous = previousState && typeof previousState === "object"
    ? previousState
    : {};
  let previousPrimaryValue = Number.isFinite(Number(previous.lastPrimaryValue))
    ? Number(previous.lastPrimaryValue)
    : null;
  let previousSecondaryValue = Number.isFinite(Number(previous.lastSecondaryValue))
    ? Number(previous.lastSecondaryValue)
    : null;
  let repeatCount = Number.isInteger(previous.secondaryRepeatCount)
    ? previous.secondaryRepeatCount
    : (previousSecondaryValue === null ? 0 : 1);
  const random = createSeededNoteFlowRandom(cycle.seed ^ 0x53706172);
  const recentValues = Array.isArray(previous.recentSecondaryValues)
    ? previous.recentSecondaryValues.slice(-6)
    : [];
  let generatedNoteCount = 0;
  let parallelPerfectCount = 0;
  const selectedEntries = [];

  cycle.blocks.forEach((block, blockIndex) => {
    const selectedIndexes = selectedByBlock[blockIndex];
    block.secondaryNoteIndexes = selectedIndexes.slice();
    block.positions.forEach((position, positionIndex) => {
      if (selectedIndexes.indexOf(positionIndex) === -1) {
        position.secondaryNote = null;
        return;
      }
      selectedEntries.push({ position, denseNote: position.secondaryNote });
    });
  });

  selectedEntries.forEach((entry, entryIndex) => {
      const position = entry.position;
      const primaryValue = position.primaryNote.value;
      let candidates = createChordCandidates(
        position,
        cycle.secondaryVoicePlan.bassRange
      );
      if (position.harmony.cadenceRole) {
        candidates = preferCandidates(candidates, candidate => (
          candidate.chordToneIndex === 0
        ));
      }
      candidates = filterForHandSeparation(candidates, primaryValue);
      candidates = prepareForSelectedCadence(
        candidates,
        selectedEntries[entryIndex + 1],
        cycle.secondaryVoicePlan.bassRange,
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
      candidates = preferCandidates(candidates, candidate => (
        !createsParallelPerfectInterval(
          primaryValue,
          candidate.value,
          previousPrimaryValue,
          previousSecondaryValue
        )
      ));
      const chosen = chooseSparseCandidate(
        candidates,
        entry,
        entry.denseNote,
        previousPrimaryValue,
        previousSecondaryValue,
        recentValues,
        movementPreference
      );
      const note = createSparseNote(
        chosen,
        position,
        previousPrimaryValue,
        previousSecondaryValue
      );
      position.secondaryNote = note;
      if (note.createsParallelPerfectInterval) {
        parallelPerfectCount += 1;
      }
      repeatCount = note.value === previousSecondaryValue ? repeatCount + 1 : 1;
      recentValues.push(note.value);
      if (recentValues.length > 6) {
        recentValues.shift();
      }
      previousPrimaryValue = primaryValue;
      previousSecondaryValue = note.value;
      generatedNoteCount += 1;
  });

  const fullDensityGeneratedNoteCount = cycle.secondaryVoicePlan.generatedNoteCount;
  cycle.secondaryVoicePlan = Object.assign({}, cycle.secondaryVoicePlan, {
    profile: cycle.secondaryVoicePlan.enabled
      ? "hard-variable-density"
      : "disabled-single-hand",
    density: cycle.secondaryVoicePlan.enabled
      ? generatedNoteCount / cycle.positionCount
      : 0,
    requestedNotesPerBlock: cycle.config.secondaryNotesPerBlock,
    generatedNotesPerBlock: selectedByBlock.map(indexes => indexes.length),
    generatedNoteCount,
    fullDensityGeneratedNoteCount,
    parallelPerfectCount
  });
  cycle.nextState = Object.assign({}, cycle.nextState, {
    lastSecondaryValue: previousSecondaryValue,
    secondaryRepeatCount: repeatCount,
    recentSecondaryValues: recentValues
  });
  return cycle;
}

export function applyNoteFlowSecondVoiceDensity(cycle, previousState = null) {
  if (!cycle || !Array.isArray(cycle.blocks)) {
    throw new Error("A generated two-hand Note Flow melody is required.");
  }
  if (!cycle.secondaryVoicePlan || !cycle.secondaryVoicePlan.enabled) {
    return cycle;
  }
  const selectedByBlock = cycle.blocks.map(block => (
    selectPositionIndexes(block, cycle.config.secondaryNotesPerBlock)
  ));
  return applySelectedPositions(cycle, selectedByBlock, previousState);
}

export function createNoteFlowTwoHandMelody(
  input = {},
  cycleIndex = 0,
  previousState = null
) {
  const cycle = createNoteFlowFullTwoHandMelody(input, cycleIndex, previousState);
  return applyNoteFlowSecondVoiceDensity(cycle, previousState);
}

export { SUPPORTED_DENSITIES as NOTE_FLOW_SECOND_VOICE_DENSITIES };
