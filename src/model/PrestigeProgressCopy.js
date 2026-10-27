import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { createSingleNotesProgressSnapshot } from "./SingleNotesLearningStorage";

const SCOPES = [
  ["screen:single-notes", "singleNotesScreen"],
  ["midi:single-notes", "singleNotesMidi"]
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("Prestige progress copy was cancelled.");
  error.name = "AbortError";
  throw error;
}

function verifiedSnapshot(records, scope) {
  check(Array.isArray(records), `Invalid learning progress: ${scope}.`);
  const notes = Object.create(null);
  records.forEach(record => {
    check(record && typeof record.noteKey === "string" && record.noteKey
      && record.learningRecord && typeof record.learningRecord === "object"
      && !Object.prototype.hasOwnProperty.call(notes, record.noteKey),
    `Invalid learning progress record: ${scope}.`);
    notes[record.noteKey] = record.learningRecord;
  });
  const snapshot = createSingleNotesProgressSnapshot({ notes });
  check(snapshot.records.length === records.length,
    `Incomplete learning progress: ${scope}.`);
  return snapshot;
}

function historySignature(state, scope) {
  check(state && Number.isSafeInteger(state.nextSequence)
    && state.nextSequence >= 0,
  `Invalid learning history state: ${scope}.`);
  return JSON.stringify([state.nextSequence, state.fingerprint]);
}

// Call after the retained detail records have been copied. This preserves
// lifetime per-note learning state, including attempts removed from detail
// history. It does not activate the shadow or modify the active database.
export async function copyPrestigeLearningProgress(active, shadow,
  shouldContinue = () => true) {
  check(active && typeof active.readStoredEntryCounts === "function"
    && typeof active.readProgressSnapshot === "function"
    && typeof active.readAttemptHistoryState === "function"
    && shadow && shadow.database
    && typeof shadow.database.synchronizeProgressSnapshot === "function"
    && typeof shadow.database.readProgressSnapshot === "function"
    && /^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    && shadow.name !== activeLearningDatabaseName()
    && typeof shouldContinue === "function",
  "An active and inactive learning database are required.");
  const beforeCounts = await active.readStoredEntryCounts();
  const installed = {};
  for (const [scope, countKey] of SCOPES) {
    cancelled(shouldContinue);
    const historyState = await active.readAttemptHistoryState(scope);
    const beforeState = historySignature(historyState, scope);
    check(beforeCounts[countKey] === historyState.nextSequence,
      `Active learning count changed: ${scope}.`);
    const original = verifiedSnapshot(
      await active.readProgressSnapshot(scope), scope
    );
    check(beforeCounts[countKey] === 0 || original.records.length > 0,
      `Active learning progress is missing: ${scope}.`);
    cancelled(shouldContinue);
    await shadow.database.synchronizeProgressSnapshot(scope, original,
      { requireImportGeneration: true });
    const copied = verifiedSnapshot(
      await shadow.database.readProgressSnapshot(scope), scope
    );
    check(copied.signature === original.signature
      && copied.records.length === original.records.length,
    `Copied learning progress differs: ${scope}.`);
    const after = verifiedSnapshot(
      await active.readProgressSnapshot(scope), scope
    );
    check(after.signature === original.signature
      && historySignature(await active.readAttemptHistoryState(scope), scope)
        === beforeState,
    `Active learning progress changed: ${scope}.`);
    installed[scope] = {
      noteCount: copied.records.length,
      signature: copied.signature
    };
  }
  cancelled(shouldContinue);
  const afterCounts = await active.readStoredEntryCounts();
  SCOPES.forEach(([scope, countKey]) => {
    check(afterCounts[countKey] === beforeCounts[countKey],
      `Active learning count changed: ${scope}.`);
  });
  return installed;
}
