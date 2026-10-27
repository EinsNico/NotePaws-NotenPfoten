import { NOTE_FLOW_METERS } from "./NoteFlowMeterStatistics";

function count(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function percentage(part, total) {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

export function createEmptyNoteFlowStatistics() {
  return {
    roundCount: 0,
    normalRoundCount: 0,
    learningRoundCount: 0,
    evaluatedNoteCount: 0,
    correctCount: 0,
    wrongCount: 0,
    missedCount: 0,
    accuracy: 0,
    preciseCount: 0,
    earlyCount: 0,
    lateCount: 0,
    preciseRate: 0,
    timedInputCount: 0,
    averageAbsoluteOffsetMs: null,
    durationTotalMs: 0,
    lastCompletedAt: null,
    rhythmByMeter: NOTE_FLOW_METERS.map(meter => ({
      meter,
      roundCount: 0,
      accuracy: null
    })),
    hasResults: false
  };
}

export function createNoteFlowStatisticsSnapshot(raw = {}) {
  const snapshot = createEmptyNoteFlowStatistics();
  snapshot.roundCount = count(raw.roundCount);
  snapshot.normalRoundCount = count(raw.normalRoundCount);
  snapshot.learningRoundCount = count(raw.learningRoundCount);
  snapshot.evaluatedNoteCount = count(raw.evaluatedNoteCount);
  snapshot.correctCount = count(raw.correctCount);
  snapshot.wrongCount = count(raw.wrongCount);
  snapshot.missedCount = count(raw.missedCount);
  snapshot.preciseCount = count(raw.preciseCount);
  snapshot.earlyCount = count(raw.earlyCount);
  snapshot.lateCount = count(raw.lateCount);
  snapshot.timedInputCount = count(raw.timedInputCount);
  snapshot.durationTotalMs = count(raw.durationTotalMs);
  snapshot.accuracy = percentage(
    snapshot.correctCount,
    snapshot.evaluatedNoteCount
  );
  snapshot.preciseRate = percentage(
    snapshot.preciseCount,
    snapshot.timedInputCount
  );
  snapshot.averageAbsoluteOffsetMs = snapshot.timedInputCount > 0
    ? Math.round(count(raw.timingOffsetTotalMs) / snapshot.timedInputCount)
    : null;
  const lastCompletedAt = Number(raw.lastCompletedAt);
  snapshot.lastCompletedAt = Number.isFinite(lastCompletedAt)
    && lastCompletedAt > 0
    ? lastCompletedAt
    : null;
  snapshot.rhythmByMeter = NOTE_FLOW_METERS.map(meter => {
    const item = raw.rhythmByMeter && raw.rhythmByMeter[meter] || {};
    const evaluated = count(item.evaluatedNoteCount);
    return {
      meter,
      roundCount: count(item.roundCount),
      accuracy: evaluated > 0
        ? percentage(count(item.correctCount), evaluated) : null
    };
  });
  snapshot.hasResults = snapshot.roundCount > 0;
  return snapshot;
}

export default {
  createEmptyNoteFlowStatistics,
  createNoteFlowStatisticsSnapshot
};
