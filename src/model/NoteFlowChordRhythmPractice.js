import { resetHeldNoteGrip } from './HeldNoteGrip';
import {
  createNoteFlowRhythmPractice,
  startNoteFlowRhythmPractice,
  advanceNoteFlowRhythmPractice,
  submitNoteFlowRhythmPracticeInput,
  releaseNoteFlowRhythmPracticeInput,
  pauseNoteFlowRhythmPractice,
  resumeNoteFlowRhythmPractice,
  rebaseNoteFlowRhythmPractice
} from "./NoteFlowRhythmPractice";
import { NOTE_FLOW_CHORD_STRIKE_WINDOW_MS } from "./NoteFlowChordTraining";

export const NOTE_FLOW_CHORD_RHYTHM_PRACTICE_VERSION = 1;

export function createNoteFlowChordRhythmTimeline(score) {
  if (!score || !score.meter || !Array.isArray(score.measures)
    || !Array.isArray(score.targets) || !score.targets.length
    || !Number.isFinite(score.durationMs)) {
    throw new TypeError("A non-empty chord rhythm score is required");
  }
  return {
    bpm: score.bpm,
    meter: score.meter,
    durationMs: score.durationMs,
    durationTicks: score.durationTicks,
    measures: score.measures.map(measure => {
      const startTick = measure.index * score.meter.durationTicks;
      const endTick = startTick + score.meter.durationTicks;
      const startMs = Math.round(startTick * 60000 / (score.bpm * score.meter.pulseTicks));
      const endMs = Math.round(endTick * 60000 / (score.bpm * score.meter.pulseTicks));
      return { index: measure.index, startTick, endTick, startMs, endMs };
    }),
    events: score.measures.reduce((all, measure) => all.concat(measure.events), []),
    targets: score.targets.map(event => ({
      startTick: event.globalStartTick,
      startMs: event.startMs,
      endMs: event.endMs,
      measureIndex: event.measureIndex,
      expectedValues: event.expectedValues.slice(),
      chord: event.chord
    }))
  };
}

export function createNoteFlowChordRhythmPractice(score, options = {}) {
  const strikeWindowMs = options.strikeWindowMs === undefined
    ? NOTE_FLOW_CHORD_STRIKE_WINDOW_MS : options.strikeWindowMs;
  if (!Number.isFinite(strikeWindowMs) || strikeWindowMs <= 0) {
    throw new RangeError("A positive chord strike window is required");
  }
  const timeline = createNoteFlowChordRhythmTimeline(score);
  return {
    version: NOTE_FLOW_CHORD_RHYTHM_PRACTICE_VERSION,
    strikeWindowMs,
    pendingSinceMs: null,
    practice: createNoteFlowRhythmPractice(timeline, {
      behavior: options.behavior,
      inputMode: "midi"
    })
  };
}

function expirePending(state, wallNowMs) {
  if (state.practice.behavior === "wait" || state.pendingSinceMs === null || !Number.isFinite(wallNowMs)
    || wallNowMs - state.pendingSinceMs < state.strikeWindowMs) return state;
  const practice = state.practice;
  if (!practice.pendingValues.length) {
    return Object.assign({}, state, { pendingSinceMs: null });
  }
  return Object.assign({}, state, {
    pendingSinceMs: null,
    practice: Object.assign({}, practice, {
      grip: resetHeldNoteGrip(practice.grip),
      pendingValues: [],
      pendingAtMs: null,
      feedback: "wrong",
      wrongCount: practice.wrongCount + 1,
      wrongOnTarget: true
    })
  });
}

export function startNoteFlowChordRhythmPractice(state) {
  return Object.assign({}, state, {
    practice: startNoteFlowRhythmPractice(state.practice)
  });
}

export function advanceNoteFlowChordRhythmPractice(state, deltaMs, wallNowMs) {
  const advanced = advanceNoteFlowRhythmPractice(state.practice, deltaMs);
  const next = Object.assign({}, state, {
    practice: advanced,
    pendingSinceMs: advanced.targetIndex === state.practice.targetIndex
      && advanced.pendingValues.length ? state.pendingSinceMs : null
  });
  return expirePending(next, wallNowMs);
}

export function submitNoteFlowChordRhythmInput(state, value, wallNowMs) {
  if (!Number.isFinite(wallNowMs)) throw new RangeError("A MIDI timestamp is required");
  const current = expirePending(state, wallNowMs);
  const nextPractice = submitNoteFlowRhythmPracticeInput(current.practice, value, "midi");
  return Object.assign({}, current, {
    practice: nextPractice,
    pendingSinceMs: nextPractice.pendingValues.length
      ? current.pendingSinceMs === null ? wallNowMs : current.pendingSinceMs
      : null
  });
}

export function pauseNoteFlowChordRhythmPractice(state) {
  const practice = pauseNoteFlowRhythmPractice(state.practice);
  return Object.assign({}, state, {
    pendingSinceMs: null,
    practice: Object.assign({}, practice, { pendingValues: [], pendingAtMs: null })
  });
}

export function resumeNoteFlowChordRhythmPractice(state) {
  return Object.assign({}, state, {
    practice: resumeNoteFlowRhythmPractice(state.practice)
  });
}

export function rebaseNoteFlowChordRhythmPractice(state, score, shiftMs = 0) {
  const practice = rebaseNoteFlowRhythmPractice(
    state.practice, createNoteFlowChordRhythmTimeline(score), shiftMs
  );
  return Object.assign({}, state, {
    practice,
    pendingSinceMs: practice.pendingValues.length ? state.pendingSinceMs : null
  });
}

export function releaseNoteFlowChordRhythmInput(state, value) {
  const practice = releaseNoteFlowRhythmPracticeInput(state.practice, value);
  return Object.assign({}, state, { practice,
    pendingSinceMs: practice.pendingValues.length ? state.pendingSinceMs : null });
}
