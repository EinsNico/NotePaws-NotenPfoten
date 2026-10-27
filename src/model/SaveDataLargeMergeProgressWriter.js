import { normalizeAdaptiveEvaluation } from "./AdaptiveHistory";
import {
  createAdaptiveProgress,
  normalizeAdaptiveProgress,
  updateAdaptiveRecord
} from "./AdaptiveLearning";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { planMergedSingleNoteProgress } from "./SaveDataLargeMergeProgressPlan";
import {
  createProgressFromSnapshotRecords,
  createSingleNotesProgressSnapshot
} from "./SingleNotesLearningStorage";
import { formatSingleNotesHistoryFingerprint } from "./SingleNotesHistoryMigration";

const INPUTS = [
  ["data.adaptiveHistory.evaluations", "adaptiveProgress", "screen:single-notes"],
  ["data.adaptiveHistoryMidi.evaluations", "adaptiveProgressMidi", "midi:single-notes"]
];

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The learning-progress merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

function compare(left, right) {
  return left.completedAt - right.completedAt || left.id.localeCompare(right.id);
}

async function latestActiveByNote(database, scope, expected, progress,
  shouldContinue) {
  const latest = Object.create(null);
  const counts = Object.create(null);
  let after = null;
  let done = false;
  let total = 0;
  while (!done) {
    cancelled(shouldContinue);
    const page = await database.readAttemptHistoryPage(scope, after, 1);
    if (!page || !Array.isArray(page.records)
      || page.records.length > 250 || typeof page.done !== "boolean"
      || (!page.done && !page.records.length)
      || (page.records.length && (!Number.isSafeInteger(page.nextBlockNumber)
        || page.nextBlockNumber < 0
        || (after !== null && page.nextBlockNumber <= after)))) {
      throw new Error(`Invalid active answer page: ${scope}.`);
    }
    page.records.forEach(attempt => {
      if (!attempt || typeof attempt.noteKey !== "string" || !attempt.noteKey
        || typeof attempt.id !== "string" || !attempt.id
        || !Number.isFinite(attempt.completedAt)) {
        throw new Error(`Invalid active answer: ${scope}.`);
      }
      const previous = latest[attempt.noteKey];
      if (!previous || compare(previous, attempt) < 0) {
        latest[attempt.noteKey] = {
          id: attempt.id, completedAt: attempt.completedAt
        };
      }
      counts[attempt.noteKey] = (counts[attempt.noteKey] || 0) + 1;
      total += 1;
    });
    after = page.nextBlockNumber;
    done = page.done;
  }
  if (total !== expected) {
    throw new Error(`Active learning answers changed: ${scope}.`);
  }
  Object.keys(counts).forEach(key => {
    if (!progress.notes[key] || progress.notes[key].attempts < counts[key]) {
      throw new Error(`Active learning progress omits answers for ${key}.`);
    }
  });
  return latest;
}

function stateSignature(state) {
  if (!state || !Number.isSafeInteger(state.nextSequence)
    || state.nextSequence < 0) {
    throw new Error("Invalid active learning history state.");
  }
  return `${state.nextSequence}:${formatSingleNotesHistoryFingerprint(
    state.fingerprint
  )}`;
}

// Only the safe append-only case is supported: current progress is preserved,
// new imported evaluations for an existing note must follow its last active
// evaluation, and a note absent from current progress can use the imported
// snapshot. The shadow is not activated here.
export async function installMergedSingleNoteProgress(
  staging, activeDatabase, shadow, indexed, shouldContinue = () => true
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.readChronologicalBatch !== "function"
    || typeof staging.hasMergeMatches !== "function"
    || !activeDatabase
    || typeof activeDatabase.readProgressSnapshot !== "function"
    || typeof activeDatabase.readAttemptHistoryPage !== "function"
    || typeof activeDatabase.readAttemptHistoryState !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.synchronizeProgressSnapshot !== "function"
    || typeof shadow.database.readProgressSnapshot !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()
    || !indexed || !indexed.sections || typeof shouldContinue !== "function") {
    throw new TypeError("An indexed backup and inactive learning database are required.");
  }
  const plan = await planMergedSingleNoteProgress(staging, activeDatabase,
    indexed, shouldContinue);
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data) {
    throw new Error("The staged backup is not ready.");
  }
  const installed = {};
  for (const [section, progressKey, scope] of INPUTS) {
    cancelled(shouldContinue);
    const beforeState = stateSignature(
      await activeDatabase.readAttemptHistoryState(scope)
    );
    const currentRecords = await activeDatabase.readProgressSnapshot(scope);
    const current = createProgressFromSnapshotRecords(currentRecords);
    const currentSignature = createSingleNotesProgressSnapshot(current).signature;
    if (currentSignature !== plan[scope].currentSignature) {
      throw new Error(`Active learning data changed after preflight: ${scope}.`);
    }
    const latest = await latestActiveByNote(activeDatabase, scope,
      indexed.sections[section].current, current, shouldContinue);
    const importedRaw = metadata.shell.data[progressKey];
    const imported = importedRaw === null || importedRaw === undefined
      ? createAdaptiveProgress() : normalizeAdaptiveProgress(importedRaw);
    const merged = normalizeAdaptiveProgress(current);
    const inherited = new Set();
    let cursor = null;
    let done = false;
    let additions = 0;
    while (!done) {
      cancelled(shouldContinue);
      const page = await staging.readChronologicalBatch(section, cursor, 250);
      if (!page || !Array.isArray(page.records)
        || page.records.length > 250 || typeof page.done !== "boolean"
        || (!page.done && !page.records.length)) {
        throw new Error(`Invalid staged answer page: ${scope}.`);
      }
      const matches = await staging.hasMergeMatches(section,
        page.records.map(record => record.id));
      cancelled(shouldContinue);
      if (!Array.isArray(matches) || matches.length !== page.records.length) {
        throw new Error(`Incomplete answer-match index: ${scope}.`);
      }
      page.records.forEach((record, index) => {
        if (matches[index]) return;
        const evaluation = normalizeAdaptiveEvaluation(record);
        if (!evaluation) throw new Error(`Invalid staged answer: ${scope}.`);
        const key = evaluation.noteKey;
        if (!current.notes[key] || current.notes[key].attempts === 0) {
          if (inherited.has(key)) {
            additions += 1;
            return;
          }
          const saved = imported.notes[key];
          if (saved) {
            merged.notes[key] = saved;
            inherited.add(key);
            additions += 1;
            return;
          }
        }
        const last = latest[key];
        if (last && compare(evaluation, last) < 0) {
          throw new Error(`Older imported answers need a full replay: ${key}.`);
        }
        merged.notes[key] = updateAdaptiveRecord(merged.notes[key],
          evaluation.correctFirstTry, evaluation.mistakeCount,
          evaluation.responseTimeMs);
        additions += 1;
      });
      cursor = page.cursor;
      done = page.done;
    }
    if (additions !== plan[scope].newAnswers) {
      throw new Error(`Merged learning answers differ: ${scope}.`);
    }
    // A note with only a historical imported baseline has no evaluation page.
    // It is safe to adopt when the active side has no attempts for that note.
    Object.keys(imported.notes).forEach(key => {
      if (!merged.notes[key] || merged.notes[key].attempts === 0) {
        merged.notes[key] = imported.notes[key];
      }
    });
    const snapshot = createSingleNotesProgressSnapshot(merged);
    if (stateSignature(await activeDatabase.readAttemptHistoryState(scope))
      !== beforeState
      || createSingleNotesProgressSnapshot(createProgressFromSnapshotRecords(
        await activeDatabase.readProgressSnapshot(scope)
      )).signature !== currentSignature) {
      throw new Error(`Active learning data changed during merge: ${scope}.`);
    }
    await shadow.database.synchronizeProgressSnapshot(scope, snapshot,
      { requireImportGeneration: true });
    const stored = await shadow.database.readProgressSnapshot(scope);
    const verified = createSingleNotesProgressSnapshot(
      createProgressFromSnapshotRecords(stored)
    );
    if (stored.length !== snapshot.records.length
      || verified.signature !== snapshot.signature) {
      throw new Error(`Stored merged learning progress differs: ${scope}.`);
    }
    installed[scope] = { noteCount: stored.length,
      signature: snapshot.signature, addedAnswers: additions };
  }
  return installed;
}
