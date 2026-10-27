import {
  emptyWorkshopPracticeStatistics,
  emptyWorkshopPracticeCounts,
  readWorkshopPracticeStatistics,
  mergeWorkshopPracticeAssessments,
  applyWorkshopPracticeAssessment,
  storeWorkshopPracticeAssessments,
  removeWorkshopPracticeStatistics
} from "./WorkshopPracticeStatistics";
import { reportPersistenceFailure, clearPersistenceFailure } from "./PersistenceFeedback";

// Vue observes this shared state when Workshop mounts. Its retry owner retains
// only per-piece count deltas and note keys, never a component or music snapshot.
export const workshopPracticePersistenceState = {
  statistics: emptyWorkshopPracticeStatistics(),
  loaded: false,
  error: false
};
let pending = new Map();
const deletions = new Set();
let flushing = false;
const FAILURE_ID = "workshop-practice";

function hasPendingChanges() {
  return pending.size > 0 || deletions.size > 0;
}

function projectPending(data) {
  pending.forEach((assessment, pieceId) => {
    data = applyWorkshopPracticeAssessment(data, pieceId, assessment);
  });
  return {
    version: 1,
    pieces: data.pieces.filter(piece => !deletions.has(piece.pieceId))
  };
}

function updateFailure() {
  if (hasPendingChanges() && workshopPracticePersistenceState.error) {
    reportPersistenceFailure(
      FAILURE_ID, "WORKSHOP_PRACTICE_STATS_TITLE", flushWorkshopPracticePersistence
    );
  } else if (!hasPendingChanges()) clearPersistenceFailure(FAILURE_ID);
}

export function loadWorkshopPracticePersistence() {
  try {
    // Reload the current persisted values; replay only our still-unsaved deltas.
    workshopPracticePersistenceState.statistics = projectPending(
      readWorkshopPracticeStatistics()
    );
    workshopPracticePersistenceState.loaded = true;
    if (!hasPendingChanges()) workshopPracticePersistenceState.error = false;
    updateFailure();
    return true;
  } catch (error) {
    workshopPracticePersistenceState.loaded = false;
    workshopPracticePersistenceState.error = true;
    updateFailure();
    return false;
  }
}

export function captureWorkshopPracticeAssessment(pieceId, assessment) {
  if (!workshopPracticePersistenceState.loaded || deletions.has(pieceId)) return false;
  try {
    const merged = mergeWorkshopPracticeAssessments(
      pending.get(pieceId) || emptyWorkshopPracticeCounts(), assessment
    );
    const next = applyWorkshopPracticeAssessment(
      workshopPracticePersistenceState.statistics, pieceId, assessment
    );
    pending.set(pieceId, merged);
    workshopPracticePersistenceState.statistics = next;
    return true;
  } catch (error) {
    workshopPracticePersistenceState.error = true;
    updateFailure();
    return false;
  }
}

export function queueWorkshopPracticeDeletion(pieceId) {
  pending.delete(pieceId);
  deletions.add(pieceId);
  workshopPracticePersistenceState.statistics = {
    version: 1,
    pieces: workshopPracticePersistenceState.statistics.pieces.filter(
      piece => piece.pieceId !== pieceId
    )
  };
}

export function flushWorkshopPracticePersistence() {
  if (flushing) return false;
  if (!hasPendingChanges()) return !workshopPracticePersistenceState.error;
  flushing = true;
  // A newer input owns a new Map while the old batch is being written. Never
  // clear its answers on the older write's success, or restore deleted pieces.
  const batch = pending;
  pending = new Map();
  let batchSaved = false;
  try {
    if (batch.size) {
      const stored = storeWorkshopPracticeAssessments(
        Array.from(batch, ([pieceId, assessment]) => ({ pieceId, assessment }))
      );
      batchSaved = true;
      workshopPracticePersistenceState.statistics = projectPending(stored);
      workshopPracticePersistenceState.loaded = true;
    }
    Array.from(deletions).forEach(pieceId => {
      const stored = removeWorkshopPracticeStatistics(pieceId);
      deletions.delete(pieceId);
      workshopPracticePersistenceState.statistics = projectPending(stored);
      workshopPracticePersistenceState.loaded = true;
    });
    workshopPracticePersistenceState.error = hasPendingChanges();
    updateFailure();
    return !workshopPracticePersistenceState.error;
  } catch (error) {
    if (!batchSaved) batch.forEach((assessment, pieceId) => {
      if (!deletions.has(pieceId)) pending.set(pieceId, mergeWorkshopPracticeAssessments(
        assessment, pending.get(pieceId) || emptyWorkshopPracticeCounts()
      ));
    });
    workshopPracticePersistenceState.error = true;
    updateFailure();
    return false;
  } finally {
    flushing = false;
  }
}
