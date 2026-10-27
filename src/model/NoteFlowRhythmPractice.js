import { practiceWaitToleranceMs, practiceTimingKind } from './PracticeTiming';
import { createHeldNoteGrip, resetHeldNoteGrip, pressHeldNoteGrip, releaseHeldNoteGrip } from './HeldNoteGrip';
import {
  collectNoteFlowPitchClassInput
} from "./NoteFlowInput";
import { getNoteFlowPrecisionWindowMs } from "./NoteFlowPlayback";

export const NOTE_FLOW_RHYTHM_PRACTICE_VERSION = 1;

function toleranceMs(timeline) {
  return getNoteFlowPrecisionWindowMs(60000 / timeline.bpm);
}

export function createNoteFlowRhythmPractice(timeline, options = {}) {
  if (!timeline || !Array.isArray(timeline.targets)
    || !Number.isFinite(timeline.durationMs)) {
    throw new TypeError("A rhythmic timeline is required");
  }
  return {
    practiceVersion: NOTE_FLOW_RHYTHM_PRACTICE_VERSION,
    timeline,
    behavior: options.behavior === "continuous" ? "continuous" : "wait",
    inputMode: options.inputMode === "midi" ? "midi" : "touch",
    status: "ready",
    elapsedMs: 0,
    waitedMs: 0,
    targetIndex: 0,
    results: timeline.targets.map(() => null),
    pendingValues: [],
    pendingAtMs: null,
    grip: createHeldNoteGrip(),
    feedback: "none",
    correctCount: 0,
    wrongCount: 0,
    missedCount: 0,
    correctFirstTryCount: 0,
    wrongOnTarget: false,
    preciseEventCount: 0,
    earlyAttemptCount: 0,
    lateAttemptCount: 0,
    totalAbsoluteTimingOffsetMs: 0
  };
}

export function advanceNoteFlowRhythmPractice(state, deltaMs) {
  if (!state || (state.status !== "running" && state.status !== "waiting")) return state;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new RangeError("Elapsed time must advance by a nonnegative amount");
  }
  if (state.status === "waiting") return Object.assign({}, state, { waitedMs: state.waitedMs + deltaMs });
  let elapsedMs = Math.min(state.timeline.durationMs, state.elapsedMs + deltaMs);
  let waitedMs = state.waitedMs;
  let targetIndex = state.targetIndex;
  let missedCount = state.missedCount;
  // Most frames only move the clock. Keep the results identity stable until
  // an actual miss changes it, so the score-colour lookup stays cached.
  let results = state.results;
  const tolerance = toleranceMs(state.timeline);
  while (targetIndex < state.timeline.targets.length) {
    const target = state.timeline.targets[targetIndex];
    if (results[targetIndex]) {
      targetIndex += 1;
      continue;
    }
    if (state.behavior === "wait" && elapsedMs >= target.startMs) {
      waitedMs += Math.max(0, state.elapsedMs + deltaMs - target.startMs);
      elapsedMs = target.startMs;
      break;
    }
    const nextTarget = state.timeline.targets[targetIndex + 1];
    if (state.behavior === "continuous" && (
      elapsedMs > target.startMs + tolerance
      || (nextTarget && elapsedMs >= nextTarget.startMs)
      || elapsedMs >= state.timeline.durationMs
    )) {
      if (results === state.results) results = state.results.slice();
      results[targetIndex] = "missed";
      missedCount += 1;
      targetIndex += 1;
      continue;
    }
    break;
  }
  const waiting = state.behavior === "wait"
    && targetIndex < state.timeline.targets.length
    && elapsedMs >= state.timeline.targets[targetIndex].startMs;
  const complete = targetIndex >= state.timeline.targets.length
    && elapsedMs >= state.timeline.durationMs;
  return Object.assign({}, state, {
    status: complete ? "complete" : waiting ? "waiting" : "running",
    elapsedMs,
    waitedMs: targetIndex === state.targetIndex ? waitedMs : 0,
    targetIndex,
    results,
    missedCount,
    grip: targetIndex === state.targetIndex ? state.grip : resetHeldNoteGrip(state.grip),
    wrongOnTarget: targetIndex === state.targetIndex ? state.wrongOnTarget : false,
    pendingValues: targetIndex === state.targetIndex ? state.pendingValues : [],
    pendingAtMs: targetIndex === state.targetIndex ? state.pendingAtMs : null
  });
}

export function submitNoteFlowRhythmPracticeInput(state, value, inputMode = null) {
  if (!state || (state.status !== "running" && state.status !== "waiting")) {
    return state;
  }
  const target = state.timeline.targets[state.targetIndex];
  if (!target || state.results[state.targetIndex]) return state;
  const midi = (inputMode || state.inputMode) === "midi";
  const strike = midi ? pressHeldNoteGrip(state.grip, target.expectedValues, value, state.elapsedMs) : null;
  if (midi && !strike) return state;
  const collected = midi ? {
    status: !strike.correct ? 'wrong' : strike.complete ? 'complete' : 'pending',
    pendingValues: target.expectedValues.filter(note => strike.grip.activeValues.includes(note))
  } : collectNoteFlowPitchClassInput(target.expectedValues, state.pendingValues, value);
  if (midi) state = Object.assign({}, state, { grip:strike.grip });
  if (!collected) return state;
  if (collected.status === "pending") {
    return Object.assign({}, state, {
      pendingValues: collected.pendingValues,
      pendingAtMs: state.pendingAtMs === null ? state.elapsedMs : state.pendingAtMs,
      feedback: "pending"
    });
  }

  const onsetMs = state.behavior === "wait" && collected.status === "complete"
    ? state.elapsedMs + state.waitedMs
    : midi && collected.status === "complete" ? state.elapsedMs
    : state.pendingAtMs === null ? state.elapsedMs : state.pendingAtMs;
  const offsetMs = onsetMs - target.startMs;
  const precise = practiceTimingKind(offsetMs, toleranceMs(state.timeline),
    state.behavior === "wait" ? practiceWaitToleranceMs(60000 / state.timeline.bpm) : toleranceMs(state.timeline)) === "correct";
  const correct = collected.status === "complete" && precise;
  const timing = offsetMs < 0 ? "early" : "late";
  // A right pitch at the wrong time has been attempted and passes in wait
  // mode; a wrong pitch keeps the current note available for correction.
  const consumed = collected.status === "complete";
  const results = consumed ? state.results.slice() : state.results;
  if (consumed) results[state.targetIndex] = correct ? "correct" : timing;
  const nextIndex = state.targetIndex + (consumed ? 1 : 0);
  const nextTarget = state.timeline.targets[nextIndex];
  const waiting = state.behavior === "wait" && nextTarget
    && state.elapsedMs >= nextTarget.startMs;
  return Object.assign({}, state, {
    status: waiting ? "waiting" : "running",
    targetIndex: nextIndex,
    waitedMs: consumed ? 0 : state.waitedMs,
    results,
    grip: consumed ? resetHeldNoteGrip(state.grip) : state.grip,
    pendingValues: midi && !consumed ? collected.pendingValues
      : !consumed && state.behavior === "wait" ? state.pendingValues : [],
    pendingAtMs: !consumed && (midi || state.behavior === "wait") ? state.pendingAtMs : null,
    feedback: correct ? "correct" : "wrong",
    correctCount: state.correctCount + (correct ? 1 : 0),
    correctFirstTryCount: state.correctFirstTryCount
      + (correct && !state.wrongOnTarget ? 1 : 0),
    wrongOnTarget: consumed ? false : true,
    wrongCount: state.wrongCount + (correct ? 0 : 1),
    preciseEventCount: state.preciseEventCount + (correct ? 1 : 0),
    earlyAttemptCount: state.earlyAttemptCount
      + (consumed && !precise && offsetMs < 0 ? 1 : 0),
    lateAttemptCount: state.lateAttemptCount
      + (consumed && !precise && offsetMs > 0 ? 1 : 0),
    totalAbsoluteTimingOffsetMs: state.totalAbsoluteTimingOffsetMs
      + (consumed ? Math.round(Math.abs(offsetMs)) : 0)
  });
}

// Replace the bounded visible score without losing the cumulative round result.
// shiftMs is the exact duration of complete measures removed from the front.
export function rebaseNoteFlowRhythmPractice(state, timeline, shiftMs = 0) {
  if (!state || !timeline || !Array.isArray(timeline.targets)
    || !Number.isFinite(shiftMs) || shiftMs < 0) {
    throw new TypeError("A practice, timeline and nonnegative shift are required");
  }
  const dropped = state.timeline.targets.filter(target => target.startMs < shiftMs).length;
  const boundary = shiftMs === 0 ? null
    : state.timeline.measures.find(measure => measure.endMs === shiftMs);
  if (shiftMs !== 0 && !boundary) {
    throw new RangeError("The shift must end at a measure boundary");
  }
  const shiftTicks = boundary ? boundary.endTick : 0;
  if (dropped > state.targetIndex || shiftMs > state.elapsedMs) {
    throw new RangeError("Only completed, elapsed measures may be removed");
  }
  const retained = state.timeline.targets.slice(dropped);
  if (timeline.targets.length < retained.length || retained.some((target, index) => (
    timeline.targets[index].startTick !== target.startTick - shiftTicks
  ))) {
    throw new RangeError("The replacement timeline must retain pending targets");
  }
  return Object.assign({}, state, {
    timeline,
    elapsedMs: state.elapsedMs - shiftMs,
    pendingAtMs: state.pendingAtMs === null ? null : state.pendingAtMs - shiftMs,
    targetIndex: state.targetIndex - dropped,
    results: state.results.slice(dropped).concat(
      Array(timeline.targets.length - retained.length).fill(null)
    )
  });
}

export function startNoteFlowRhythmPractice(state) {
  if (!state || (state.status !== "ready" && state.status !== "paused")) return state;
  return Object.assign({}, state, { status: "running" });
}

export function pauseNoteFlowRhythmPractice(state) {
  if (!state || (state.status !== "running" && state.status !== "waiting")) return state;
  return Object.assign({}, state, {
    status: "paused",
    resumeStatus: state.status,
    grip: resetHeldNoteGrip(state.grip), pendingValues: [], pendingAtMs: null
  });
}

export function resumeNoteFlowRhythmPractice(state) {
  if (!state || state.status !== "paused") return state;
  return Object.assign({}, state, {
    status: state.resumeStatus || "running",
    resumeStatus: null
  });
}

export function releaseNoteFlowRhythmPracticeInput(state, value) {
  if (!state) return state;
  const grip = releaseHeldNoteGrip(state.grip, value);
  if (grip === state.grip) return state;
  const target = state.timeline.targets[state.targetIndex];
  const pendingValues = target ? target.expectedValues.filter(note => grip.activeValues.includes(note)) : [];
  const times = grip.activeValues.map(note => grip.activeAt[note]);
  return Object.assign({}, state, { grip, pendingValues,
    pendingAtMs: times.length ? Math.min(...times) : null });
}
