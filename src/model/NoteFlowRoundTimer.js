function timestamp(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(fallback, numericValue)
    : fallback;
}

function durationMilliseconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return seconds === 0 ? null : seconds * 1000;
}

export function createNoteFlowRoundTimer(durationSeconds = 0) {
  const durationMs = durationMilliseconds(durationSeconds);
  return {
    durationSeconds: durationMs === null ? 0 : durationMs / 1000,
    durationMs,
    remainingMs: durationMs,
    elapsedMs: 0,
    status: "ready",
    startedAtMs: null,
    lastStartedAtMs: null,
    pausedAtMs: null,
    completedAtMs: null
  };
}

export function advanceNoteFlowRoundTimer(state, timestampMs) {
  if (!state || state.status !== "running") {
    return state;
  }
  const now = timestamp(timestampMs, state.lastStartedAtMs || 0);
  const elapsed = Math.max(0, now - state.lastStartedAtMs);
  const elapsedMs = state.elapsedMs + elapsed;
  if (state.durationMs === null) {
    return Object.assign({}, state, {
      elapsedMs,
      lastStartedAtMs: now
    });
  }
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  if (remainingMs === 0) {
    return Object.assign({}, state, {
      remainingMs: 0,
      elapsedMs,
      status: "complete",
      lastStartedAtMs: null,
      completedAtMs: now
    });
  }
  return Object.assign({}, state, {
    remainingMs,
    elapsedMs,
    lastStartedAtMs: now
  });
}

export function startNoteFlowRoundTimer(state, timestampMs = 0) {
  if (!state || (state.status !== "ready" && state.status !== "paused")) {
    return state;
  }
  const now = timestamp(timestampMs);
  return Object.assign({}, state, {
    status: "running",
    startedAtMs: state.startedAtMs === null ? now : state.startedAtMs,
    lastStartedAtMs: now,
    pausedAtMs: null
  });
}

export function pauseNoteFlowRoundTimer(state, timestampMs = 0) {
  const advanced = advanceNoteFlowRoundTimer(state, timestampMs);
  if (!advanced || advanced.status !== "running") {
    return advanced;
  }
  const now = timestamp(timestampMs, advanced.lastStartedAtMs || 0);
  return Object.assign({}, advanced, {
    status: "paused",
    lastStartedAtMs: null,
    pausedAtMs: now
  });
}

export function completeNoteFlowRoundTimer(state, timestampMs = 0) {
  if (!state || state.status === "complete") {
    return state;
  }
  const advanced = advanceNoteFlowRoundTimer(state, timestampMs);
  const now = timestamp(timestampMs);
  return Object.assign({}, advanced, {
    status: "complete",
    lastStartedAtMs: null,
    completedAtMs: now
  });
}

export function formatNoteFlowRoundTime(state) {
  if (!state || state.durationMs === null) {
    return "∞";
  }
  const seconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
