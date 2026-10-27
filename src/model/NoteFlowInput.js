import {
  advanceNoteFlowPlayback,
  getNoteFlowEventTiming,
  getNoteFlowLateInputGraceMs
} from "./NoteFlowPlayback";

function pitchClass(value) {
  const numericValue = Math.round(Number(value));
  return ((numericValue % 12) + 12) % 12;
}

export function selectNoteFlowInputTarget(
  playback,
  playedValue,
  timestampMs,
  pendingEventIndex = null
) {
  if (!playback || !playback.timeline
    || !Array.isArray(playback.timeline.events)
    || !Number.isFinite(Number(playedValue))) {
    return null;
  }
  const active = advanceNoteFlowPlayback(playback, timestampMs);
  if (active.status === "complete" || active.status === "paused"
    || active.status === "ready") {
    return null;
  }
  if (active.behavior === "wait" && active.status === "running"
    && active.currentAnswered) {
    return null;
  }
  const pendingIndex = Math.round(Number(pendingEventIndex));
  const pendingTiming = pendingEventIndex === null
    ? null
    : getNoteFlowEventTiming(active, pendingIndex, timestampMs);
  if (pendingEventIndex !== null
    && Number.isFinite(pendingIndex)
    && active.timeline.events[pendingIndex]
    && active.timeline.events[pendingIndex].inputResult !== "correct"
    && (pendingIndex === active.currentEventIndex
      || (pendingIndex === active.currentEventIndex - 1
        && pendingTiming
        && pendingTiming.offsetMs <= getNoteFlowLateInputGraceMs(active)))) {
    return {
      eventIndex: pendingIndex,
      event: active.timeline.events[pendingIndex],
      timing: pendingTiming
    };
  }

  const currentIndex = active.currentEventIndex;
  const previousIndex = currentIndex - 1;
  // Erst die zeitliche Position wählen: eine passende Tonhöhe darf niemals
  // eine spätere Note vorzeitig als gespielt markieren.
  if (active.behavior !== "wait" && previousIndex >= 0) {
    const previous = active.timeline.events[previousIndex];
    const timing = getNoteFlowEventTiming(active, previousIndex, timestampMs);
    if (previous && previous.inputResult !== "correct" && timing
      && timing.offsetMs >= 0
      && timing.offsetMs <= getNoteFlowLateInputGraceMs(active)) {
      return { eventIndex: previousIndex, event: previous, timing };
    }
  }
  const event = active.timeline.events[currentIndex];
  return event && event.inputResult !== "correct"
    ? {
      eventIndex: currentIndex,
      event,
      timing: getNoteFlowEventTiming(active, currentIndex, timestampMs)
    }
    : null;
}

export const selectNoteFlowTouchTarget = selectNoteFlowInputTarget;

function findUnusedExpectedIndex(expectedValues, pendingValues, playedPitchClass) {
  const usedIndexes = new Set();
  pendingValues.forEach(pendingValue => {
    const index = expectedValues.findIndex((expectedValue, expectedIndex) => (
      !usedIndexes.has(expectedIndex)
      && expectedValue === pendingValue
    ));
    if (index !== -1) {
      usedIndexes.add(index);
    }
  });
  return expectedValues.findIndex((expectedValue, expectedIndex) => (
    !usedIndexes.has(expectedIndex)
    && pitchClass(expectedValue) === playedPitchClass
  ));
}

export function getNoteFlowTouchAudioValue(
  expectedValues,
  pendingValues,
  playedValue
) {
  const expected = Array.isArray(expectedValues)
    ? expectedValues.map(Number).filter(Number.isFinite)
    : [];
  const pending = Array.isArray(pendingValues)
    ? pendingValues.map(Number).filter(Number.isFinite)
    : [];
  const playedPitchClass = pitchClass(playedValue);
  const matchIndex = findUnusedExpectedIndex(
    expected,
    pending,
    playedPitchClass
  );
  if (matchIndex !== -1) {
    return expected[matchIndex];
  }

  const anchor = expected.length > 0 ? expected[0] : 48;
  let audibleValue = playedPitchClass;
  while (anchor >= audibleValue + 6) {
    audibleValue += 12;
  }
  while (anchor < audibleValue - 6) {
    audibleValue -= 12;
  }
  return audibleValue;
}

export function collectNoteFlowPitchClassInput(
  expectedValues,
  pendingValues,
  playedValue
) {
  const expected = Array.isArray(expectedValues)
    ? expectedValues.map(Number).filter(Number.isFinite)
    : [];
  const pending = Array.isArray(pendingValues)
    ? pendingValues.map(Number).filter(Number.isFinite)
    : [];
  const playedPitchClass = pitchClass(playedValue);
  const matchIndex = findUnusedExpectedIndex(
    expected,
    pending,
    playedPitchClass
  );

  if (matchIndex === -1) {
    return {
      status: "wrong",
      pendingValues: [],
      playedValues: [Number.MIN_SAFE_INTEGER + playedPitchClass],
      collectedCount: 0,
      expectedCount: expected.length
    };
  }

  const collected = pending.concat(expected[matchIndex]);
  if (collected.length < expected.length) {
    return {
      status: "pending",
      pendingValues: collected,
      playedValues: null,
      collectedCount: collected.length,
      expectedCount: expected.length
    };
  }

  return {
    status: "complete",
    pendingValues: [],
    playedValues: collected,
    collectedCount: collected.length,
    expectedCount: expected.length
  };
}

export function collectNoteFlowMidiInput(
  expectedValues,
  pendingValues,
  playedValue
) {
  const expected = Array.isArray(expectedValues)
    ? expectedValues.map(Number).filter(Number.isInteger)
    : [];
  const pending = Array.isArray(pendingValues)
    ? pendingValues.map(Number).filter(Number.isInteger)
    : [];
  if (playedValue === null || playedValue === undefined || playedValue === "") {
    return null;
  }
  const played = Number(playedValue);
  if (!Number.isInteger(played) || played < 0 || played > 127) {
    return null;
  }

  const usedIndexes = new Set();
  pending.forEach(value => {
    const index = expected.findIndex((candidate, candidateIndex) => (
      candidate === value && !usedIndexes.has(candidateIndex)
    ));
    if (index !== -1) {
      usedIndexes.add(index);
    }
  });
  const matchIndex = expected.findIndex((value, index) => (
    value === played && !usedIndexes.has(index)
  ));
  if (matchIndex === -1) {
    // Re-striking an already recognized key must not erase the other hand's
    // progress. Devices may also send the same physical key on two channels.
    if (expected.includes(played) && pending.includes(played)) return null;
    return {
      status: "wrong",
      pendingValues: [],
      playedValues: [played],
      collectedCount: 0,
      expectedCount: expected.length
    };
  }

  // Two overlapping staves can write the same physical key at one onset.
  // One MIDI strike answers both written notes; different octaves still need
  // separate keys. Keep their written multiplicity for playback matching.
  const collected = pending.concat(expected.filter((value, index) => (
    value === played && !usedIndexes.has(index)
  )));
  return collected.length < expected.length
    ? {
      status: "pending",
      pendingValues: collected,
      playedValues: null,
      collectedCount: collected.length,
      expectedCount: expected.length
    }
    : {
      status: "complete",
      pendingValues: [],
      playedValues: collected,
      collectedCount: collected.length,
      expectedCount: expected.length
    };
}
