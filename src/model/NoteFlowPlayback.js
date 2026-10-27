export const NOTE_FLOW_PLAYBACK_VERSION = 2;
export const NOTE_FLOW_MIN_PRECISION_MS = 150;
export const NOTE_FLOW_MAX_PRECISION_MS = 320;
export const NOTE_FLOW_PRECISION_RATIO = 0.25;
export const NOTE_FLOW_LATE_INPUT_GRACE_RATIO = 0.7;
export const NOTE_FLOW_MIN_BPM = 25;
export const NOTE_FLOW_MAX_BPM = 120;

export const NOTE_FLOW_SPEED_DURATIONS_MS = Object.freeze({
  "very-slow": 2400,
  slow: 1800,
  normal: 1200,
  fast: 800,
  "very-fast": 550
});

function normalizeTimestamp(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(fallback, numericValue)
    : fallback;
}

function validateEvents(events) {
  events.forEach(event => {
    if (!event || !Array.isArray(event.expectedValues) || event.expectedValues.length === 0) {
      throw new Error("Every Note Flow event requires at least one expected note.");
    }
  });
}

function normalizeTimeline(source) {
  const timeline = source && source.timeline ? source.timeline : source;
  const events = timeline && Array.isArray(timeline.events)
    ? timeline.events
    : [];
  if (events.length === 0) {
    throw new Error("A non-empty Note Flow timeline is required.");
  }
  validateEvents(events);
  return timeline;
}

function normalizeBehavior(value) {
  return value === "wait" ? "wait" : "continuous";
}

function sortedValues(values) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .map(value => Number(value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function valuesMatch(expected, received) {
  const left = sortedValues(expected);
  const right = sortedValues(received);
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function currentEvent(state) {
  return state.timeline.events[state.currentEventIndex] || null;
}

function setEventResult(state, eventIndex, values) {
  const events = state.timeline.events.slice();
  events[eventIndex] = Object.assign(
    {},
    events[eventIndex],
    values
  );
  return Object.assign({}, state, {
    timeline: Object.assign({}, state.timeline, { events })
  });
}

export function getNoteFlowPrecisionWindowMs(stateOrDuration) {
  const duration = typeof stateOrDuration === "number"
    ? stateOrDuration
    : stateOrDuration && stateOrDuration.stepDurationMs;
  return Math.min(
    NOTE_FLOW_MAX_PRECISION_MS,
    Math.max(
      NOTE_FLOW_MIN_PRECISION_MS,
      Math.round((Number(duration) || NOTE_FLOW_SPEED_DURATIONS_MS.normal)
        * NOTE_FLOW_PRECISION_RATIO)
    )
  );
}

export function getNoteFlowLateInputGraceMs(stateOrDuration) {
  const duration = typeof stateOrDuration === "number"
    ? stateOrDuration
    : stateOrDuration && stateOrDuration.stepDurationMs;
  return Math.round(
    (Number(duration) || NOTE_FLOW_SPEED_DURATIONS_MS.normal)
      * NOTE_FLOW_LATE_INPUT_GRACE_RATIO
  );
}

export function getNoteFlowEventTiming(state, eventIndex, timestampMs) {
  if (!state || state.currentTargetAtMs === null) {
    return null;
  }
  const index = Math.round(Number(eventIndex));
  if (!Number.isFinite(index) || !state.timeline.events[index]) {
    return null;
  }
  const timestamp = normalizeTimestamp(timestampMs, state.lastUpdatedAtMs);
  const targetAtMs = state.currentTargetAtMs
    + (index - state.currentEventIndex) * state.stepDurationMs;
  const offsetMs = Math.round(timestamp - targetAtMs);
  const toleranceMs = getNoteFlowPrecisionWindowMs(state);
  return {
    targetAtMs,
    offsetMs,
    toleranceMs,
    result: Math.abs(offsetMs) <= toleranceMs
      ? "precise"
      : offsetMs < 0 ? "early" : "late"
  };
}

function completePlayback(state, timestamp, reason) {
  return Object.assign({}, state, {
    status: "complete",
    completionReason: reason,
    completedAtMs: timestamp,
    nextTransitionAtMs: null,
    waitingReason: null,
    feedback: "none",
    pausedSnapshot: null,
    lastUpdatedAtMs: timestamp
  });
}

function moveToNextEvent(state, timestamp) {
  if (state.currentEventIndex >= state.timeline.events.length - 1) {
    return completePlayback(state, timestamp, "timeline-complete");
  }
  return Object.assign({}, state, {
    status: "running",
    currentEventIndex: state.currentEventIndex + 1,
    currentAnswered: false,
    currentHadMistake: false,
    currentWrongAttemptCount: 0,
    waitingReason: null,
    feedback: "none",
    nextTransitionAtMs: timestamp + state.stepDurationMs,
    currentTargetAtMs: timestamp + state.stepDurationMs,
    lastUpdatedAtMs: timestamp
  });
}

export function getNoteFlowStepDurationMs(speed) {
  return NOTE_FLOW_SPEED_DURATIONS_MS[speed]
    || NOTE_FLOW_SPEED_DURATIONS_MS.normal;
}

export function normalizeNoteFlowBpm(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const bpm = Number(value);
  return Number.isFinite(bpm)
    ? Math.min(NOTE_FLOW_MAX_BPM, Math.max(NOTE_FLOW_MIN_BPM, Math.round(bpm)))
    : null;
}

export function getNoteFlowBpmStepDurationMs(bpm) {
  const normalized = normalizeNoteFlowBpm(bpm);
  return normalized === null ? null : Math.round(60000 / normalized);
}

export function createNoteFlowPlayback(source, options = {}) {
  const timeline = normalizeTimeline(source);
  const speed = Object.prototype.hasOwnProperty.call(
    NOTE_FLOW_SPEED_DURATIONS_MS,
    options.speed
  ) ? options.speed : "normal";
  const bpm = normalizeNoteFlowBpm(options.bpm);
  return {
    playbackVersion: NOTE_FLOW_PLAYBACK_VERSION,
    timeline,
    speed,
    bpm,
    behavior: normalizeBehavior(options.behavior),
    stepDurationMs: bpm === null
      ? getNoteFlowStepDurationMs(speed)
      : getNoteFlowBpmStepDurationMs(bpm),
    status: "ready",
    eventOffset: 0,
    currentEventIndex: 0,
    currentAnswered: false,
    currentHadMistake: false,
    currentWrongAttemptCount: 0,
    waitingReason: null,
    feedback: "none",
    nextTransitionAtMs: null,
    currentTargetAtMs: null,
    startedAtMs: null,
    completedAtMs: null,
    completionReason: null,
    lastUpdatedAtMs: 0,
    pausedAtMs: null,
    pausedDurationMs: 0,
    pausedSnapshot: null,
    correctEventCount: 0,
    correctFirstTryCount: 0,
    wrongAttemptCount: 0,
    missedEventCount: 0,
    preciseEventCount: 0,
    earlyAttemptCount: 0,
    lateAttemptCount: 0,
    totalAbsoluteTimingOffsetMs: 0
  };
}

export function appendNoteFlowPlaybackEvents(state, events) {
  const additions = Array.isArray(events) ? events : [];
  if (!state || additions.length === 0) {
    return state;
  }
  validateEvents(additions);
  return Object.assign({}, state, {
    timeline: Object.assign({}, state.timeline, {
      events: state.timeline.events.concat(additions),
      eventCount: state.timeline.events.length + additions.length
    })
  });
}

export function trimPassedNoteFlowPlaybackEvents(state, retainPassed = 1) {
  if (!state || !state.timeline || !Array.isArray(state.timeline.events)) {
    return state;
  }
  const retained = Math.max(0, Math.round(Number(retainPassed) || 0));
  const removable = Math.max(0, state.currentEventIndex - retained);
  if (removable === 0) {
    return state;
  }
  return Object.assign({}, state, {
    timeline: Object.assign({}, state.timeline, {
      events: state.timeline.events.slice(removable),
      eventCount: state.timeline.events.length - removable
    }),
    currentEventIndex: state.currentEventIndex - removable,
    eventOffset: (state.eventOffset || 0) + removable
  });
}

export function startNoteFlowPlayback(state, timestampMs = 0) {
  if (!state || state.status !== "ready") {
    return state;
  }
  const timestamp = normalizeTimestamp(timestampMs);
  return Object.assign({}, state, {
    status: "running",
    startedAtMs: timestamp,
    lastUpdatedAtMs: timestamp,
    nextTransitionAtMs: timestamp + state.stepDurationMs,
    currentTargetAtMs: timestamp + state.stepDurationMs
  });
}

export function advanceNoteFlowPlayback(state, timestampMs) {
  if (!state || state.status !== "running") {
    return state;
  }
  const timestamp = normalizeTimestamp(timestampMs, state.lastUpdatedAtMs);
  if (timestamp < state.nextTransitionAtMs) {
    return Object.assign({}, state, { lastUpdatedAtMs: timestamp });
  }

  if (state.behavior === "wait") {
    if (state.currentAnswered) {
      return moveToNextEvent(state, state.nextTransitionAtMs);
    }
    return Object.assign({}, state, {
      status: "waiting",
      waitingReason: "input",
      feedback: "none",
      nextTransitionAtMs: null,
      lastUpdatedAtMs: timestamp
    });
  }

  let next = state;
  let transitionAt = state.nextTransitionAtMs;
  while (next.status === "running" && timestamp >= transitionAt) {
    if (!next.currentAnswered) {
      next = Object.assign({}, setEventResult(
        next,
        next.currentEventIndex,
        { missedRecorded: true }
      ), {
        missedEventCount: next.missedEventCount + 1
      });
    }
    next = moveToNextEvent(next, transitionAt);
    transitionAt = next.nextTransitionAtMs;
  }
  return Object.assign({}, next, { lastUpdatedAtMs: timestamp });
}

export function submitNoteFlowInput(
  state,
  playedValues,
  timestampMs,
  requestedEventIndex = null
) {
  if (!state || state.status === "ready" || state.status === "paused"
    || state.status === "complete") {
    return state;
  }
  let current = advanceNoteFlowPlayback(state, timestampMs);
  if (current.status === "complete") {
    return current;
  }
  const timestamp = normalizeTimestamp(timestampMs, current.lastUpdatedAtMs);
  const eventIndex = requestedEventIndex === null
    ? current.currentEventIndex
    : Math.round(Number(requestedEventIndex));
  const event = current.timeline.events[eventIndex];
  const timing = getNoteFlowEventTiming(current, eventIndex, timestamp);
  if (!event || !timing) {
    return current;
  }
  if (eventIndex > current.currentEventIndex
    || eventIndex < current.currentEventIndex - 1
    || (eventIndex < current.currentEventIndex
      && timing.offsetMs > getNoteFlowLateInputGraceMs(current))) {
    return current;
  }
  if (event.inputResult === "correct") {
    return current;
  }

  const targetsCurrentEvent = eventIndex === current.currentEventIndex;
  if (current.behavior === "wait" && current.status === "running"
    && targetsCurrentEvent && current.currentAnswered) {
    return current;
  }
  const firstAttempt = !event.inputAttempted;
  if (!valuesMatch(event.expectedValues, playedValues)) {
    return Object.assign({}, setEventResult(current, eventIndex, {
      inputResult: "wrong",
      inputAttempted: true,
      timingResult: timing.result,
      timingOffsetMs: timing.offsetMs
    }), {
      waitingReason: current.status === "waiting" ? "wrong-input" : null,
      feedback: "wrong",
      currentHadMistake: targetsCurrentEvent || current.currentHadMistake,
      currentWrongAttemptCount: targetsCurrentEvent
        ? current.currentWrongAttemptCount + 1
        : current.currentWrongAttemptCount,
      wrongAttemptCount: current.wrongAttemptCount + 1,
      lastUpdatedAtMs: timestamp
    });
  }

  if (timing.result !== "precise") {
    const timingError = Object.assign({}, setEventResult(current, eventIndex, {
      inputResult: "wrong",
      inputAttempted: true,
      timingResult: timing.result,
      timingOffsetMs: timing.offsetMs
    }), {
      feedback: "wrong",
      currentAnswered: current.behavior === "wait"
        && targetsCurrentEvent && timing.result === "early"
        ? true : current.currentAnswered,
      currentHadMistake: targetsCurrentEvent || current.currentHadMistake,
      wrongAttemptCount: current.wrongAttemptCount + 1,
      earlyAttemptCount: current.earlyAttemptCount
        + (timing.result === "early" ? 1 : 0),
      lateAttemptCount: current.lateAttemptCount
        + (timing.result === "late" ? 1 : 0),
      totalAbsoluteTimingOffsetMs: current.totalAbsoluteTimingOffsetMs
        + Math.abs(timing.offsetMs),
      lastUpdatedAtMs: timestamp
    });
    if (current.status === "waiting" && targetsCurrentEvent) {
      return moveToNextEvent(timingError, timestamp);
    }
    return timingError;
  }

  const recoveredMiss = event.missedRecorded ? 1 : 0;
  const correct = Object.assign({}, setEventResult(current, eventIndex, {
    inputResult: "correct",
    inputAttempted: true,
    timingResult: "precise",
    timingOffsetMs: timing.offsetMs,
    missedRecorded: false
  }), {
    currentAnswered: targetsCurrentEvent ? true : current.currentAnswered,
    feedback: "correct",
    correctEventCount: current.correctEventCount + 1,
    correctFirstTryCount: current.correctFirstTryCount + (firstAttempt ? 1 : 0),
    missedEventCount: Math.max(0, current.missedEventCount - recoveredMiss),
    preciseEventCount: current.preciseEventCount + 1,
    totalAbsoluteTimingOffsetMs: current.totalAbsoluteTimingOffsetMs
      + Math.abs(timing.offsetMs),
    lastUpdatedAtMs: timestamp
  });
  return current.status === "waiting" && targetsCurrentEvent
    ? moveToNextEvent(correct, timestamp)
    : correct;
}

export function pauseNoteFlowPlayback(state, timestampMs) {
  if (!state || (state.status !== "running" && state.status !== "waiting")) {
    return state;
  }
  const current = advanceNoteFlowPlayback(state, timestampMs);
  if (current.status === "complete") {
    return current;
  }
  const timestamp = normalizeTimestamp(timestampMs, current.lastUpdatedAtMs);
  return Object.assign({}, current, {
    status: "paused",
    pausedAtMs: timestamp,
    pausedSnapshot: {
      status: current.status,
      waitingReason: current.waitingReason,
      targetOffsetMs: current.currentTargetAtMs === null
        ? null
        : current.currentTargetAtMs - timestamp,
      remainingTransitionMs: current.nextTransitionAtMs === null
        ? null
        : Math.max(0, current.nextTransitionAtMs - timestamp)
    },
    nextTransitionAtMs: null,
    lastUpdatedAtMs: timestamp
  });
}

export function resumeNoteFlowPlayback(state, timestampMs) {
  if (!state || state.status !== "paused" || !state.pausedSnapshot) {
    return state;
  }
  const timestamp = normalizeTimestamp(timestampMs, state.lastUpdatedAtMs);
  const snapshot = state.pausedSnapshot;
  return Object.assign({}, state, {
    status: snapshot.status,
    waitingReason: snapshot.waitingReason,
    nextTransitionAtMs: snapshot.remainingTransitionMs === null
      ? null
      : timestamp + snapshot.remainingTransitionMs,
    currentTargetAtMs: snapshot.targetOffsetMs === null
      ? null
      : timestamp + snapshot.targetOffsetMs,
    pausedDurationMs: state.pausedDurationMs + Math.max(
      0,
      timestamp - state.pausedAtMs
    ),
    pausedAtMs: null,
    pausedSnapshot: null,
    lastUpdatedAtMs: timestamp
  });
}

export function getNoteFlowPlaybackFrame(state, timestampMs) {
  const event = currentEvent(state);
  let progress = state && state.status === "complete" ? 1 : 0;
  if (state && state.status === "running" && state.nextTransitionAtMs !== null) {
    const timestamp = normalizeTimestamp(timestampMs, state.lastUpdatedAtMs);
    progress = 1 - Math.max(
      0,
      state.nextTransitionAtMs - timestamp
    ) / state.stepDurationMs;
  } else if (state && (state.status === "waiting" || state.status === "paused")) {
    progress = state.status === "paused"
      && state.pausedSnapshot
      && state.pausedSnapshot.remainingTransitionMs !== null
      ? 1 - state.pausedSnapshot.remainingTransitionMs / state.stepDurationMs
      : 1;
  }
  return {
    status: state.status,
    event,
    eventIndex: state.currentEventIndex,
    absoluteEventIndex: (state.eventOffset || 0) + state.currentEventIndex,
    progress: Math.max(0, Math.min(1, progress)),
    highlight: state.feedback === "wrong" ? "wrong" : state.feedback
  };
}
