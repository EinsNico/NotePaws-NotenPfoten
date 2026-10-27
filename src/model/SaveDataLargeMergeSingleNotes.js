import { normalizeAdaptiveEvaluation } from "./AdaptiveHistory";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { markImportedForPrestige } from "./PrestigeEligibility";
import {
  SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE,
  createEmptySingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint,
  formatSingleNotesHistoryFingerprint
} from "./SingleNotesHistoryMigration";

const INPUTS = [
  ["data.adaptiveHistory.evaluations", "screen:single-notes"],
  ["data.adaptiveHistoryMidi.evaluations", "midi:single-notes"]
];

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

function compare(left, right) {
  return left.completedAt - right.completedAt || left.id.localeCompare(right.id);
}

function activeIterator(database, scope, shouldContinue) {
  let after = null;
  let page = [];
  let index = 0;
  let done = false;
  let previous = null;
  return async () => {
    while (index === page.length) {
      if (done) return null;
      cancelled(shouldContinue);
      const result = await database.readAttemptHistoryPage(scope, after, 1);
      if (!result || !Array.isArray(result.records)
        || result.records.length > 250 || typeof result.done !== "boolean"
        || (!result.done && !result.records.length)
        || (result.records.length && (!Number.isSafeInteger(result.nextBlockNumber)
          || result.nextBlockNumber < 0
          || (after !== null && result.nextBlockNumber <= after)))) {
        throw new Error(`Invalid active answer page: ${scope}.`);
      }
      page = result.records;
      index = 0;
      after = result.nextBlockNumber;
      done = result.done;
    }
    const attempt = page[index++];
    if (!attempt || typeof attempt.id !== "string" || !attempt.id
      || !Number.isFinite(attempt.completedAt)
      || !attempt.sessionId || !attempt.noteKey || attempt.scope !== scope
      || (previous && compare(previous, attempt) >= 0)) {
      throw new Error(`Active answers are not chronological: ${scope}.`);
    }
    previous = attempt;
    return attempt;
  };
}

function stagedIterator(staging, section, scope, shouldContinue) {
  let cursor = null;
  let page = [];
  let matches = [];
  let index = 0;
  let originalIndex = 0;
  let done = false;
  let previous = null;
  return async () => {
    while (true) {
      while (index === page.length) {
        if (done) return null;
        cancelled(shouldContinue);
        const result = await staging.readChronologicalBatch(section, cursor, 250);
        if (!result || !Array.isArray(result.records)
          || result.records.length > 250 || typeof result.done !== "boolean"
          || (!result.done && !result.records.length)) {
          throw new Error(`Invalid staged answer page: ${section}.`);
        }
        page = result.records;
        index = 0;
        cursor = result.cursor;
        done = result.done;
        matches = await staging.hasMergeMatches(section,
          page.map(record => record.id));
        cancelled(shouldContinue);
        if (!Array.isArray(matches) || matches.length !== page.length) {
          throw new Error(`Incomplete answer-match index: ${section}.`);
        }
      }
      const record = page[index];
      const duplicate = matches[index++];
      const sourceIndex = originalIndex++;
      const evaluation = normalizeAdaptiveEvaluation(record);
      if (!evaluation || typeof evaluation.id !== "string" || !evaluation.id
        || !Number.isFinite(evaluation.completedAt)
        || (previous && compare(previous, evaluation) >= 0)) {
        throw new Error(`Staged answers are not chronological: ${section}.`);
      }
      previous = evaluation;
      if (duplicate) continue;
      return {
        id: evaluation.id,
        sessionId: `${scope}|legacy-history|${Math.floor(
          sourceIndex / SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE
        )}`,
        scope,
        noteKey: evaluation.noteKey,
        staff: evaluation.exercise.staff,
        completedAt: evaluation.completedAt,
        correctFirstTry: evaluation.correctFirstTry,
        mistakeCount: evaluation.mistakeCount,
        responseTimeMs: evaluation.responseTimeMs
      };
    }
  };
}

// Writes only into a fresh inactive generation. The exact-overlap index must
// already have been built against the same active generation. This does not
// seal or activate the shadow and therefore cannot change the user's data.
export async function copyMergedSingleNotesToShadow(
  staging, activeDatabase, shadow, indexed, shouldContinue = () => true
) {
  if (!staging || typeof staging.readChronologicalBatch !== "function"
    || typeof staging.hasMergeMatches !== "function"
    || !activeDatabase || typeof activeDatabase.readAttemptHistoryPage !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.appendImportedAttemptBatch !== "function"
    || typeof shadow.database.readAttemptHistoryState !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()
    || !indexed || !indexed.sections || typeof shouldContinue !== "function") {
    throw new TypeError("An indexed backup and inactive learning database are required.");
  }
  const summaries = {};
  for (const [section, scope] of INPUTS) {
    const expected = indexed.sections[section];
    if (!expected || !["current", "imported", "new", "duplicates"].every(
      key => Number.isSafeInteger(expected[key]) && expected[key] >= 0
    ) || expected.imported !== expected.new + expected.duplicates) {
      throw new Error(`Invalid answer merge plan: ${section}.`);
    }
    const nextActive = activeIterator(activeDatabase, scope, shouldContinue);
    const nextStaged = stagedIterator(staging, section, scope, shouldContinue);
    let active = await nextActive();
    let imported = await nextStaged();
    let currentCount = 0;
    let newCount = 0;
    let sequence = 0;
    let batch = [];
    let last = null;
    let result = null;
    let fingerprint = createEmptySingleNotesHistoryFingerprint();
    const flush = async () => {
      if (!batch.length) return;
      cancelled(shouldContinue);
      result = await shadow.database.appendImportedAttemptBatch(
        scope, batch, sequence - batch.length
      );
      if (!result || result.total !== sequence || !result.fingerprint
        || formatSingleNotesHistoryFingerprint(result.fingerprint)
          !== formatSingleNotesHistoryFingerprint(fingerprint)) {
        throw new Error(`The merged answer batch was not verified: ${scope}.`);
      }
      batch = [];
    };
    while (active || imported) {
      cancelled(shouldContinue);
      if (active && imported && compare(active, imported) === 0) {
        throw new Error(`Unindexed answer collision: ${active.id}.`);
      }
      const takeActive = active && (!imported || compare(active, imported) < 0);
      const attempt = takeActive ? active : markImportedForPrestige(imported);
      if (last && compare(last, attempt) >= 0) {
        throw new Error(`Merged answers are not chronological: ${scope}.`);
      }
      last = attempt;
      batch.push(attempt);
      sequence += 1;
      fingerprint = extendSingleNotesHistoryFingerprint(fingerprint, attempt);
      if (takeActive) {
        currentCount += 1;
        active = await nextActive();
      } else {
        newCount += 1;
        imported = await nextStaged();
      }
      if (batch.length === 250) await flush();
    }
    await flush();
    if (currentCount !== expected.current || newCount !== expected.new
      || sequence !== expected.current + expected.new) {
      throw new Error(`Merged answer count differs: ${scope}.`);
    }
    const state = await shadow.database.readAttemptHistoryState(scope);
    const signature = formatSingleNotesHistoryFingerprint(fingerprint);
    if (!state || state.nextSequence !== sequence
      || (sequence > 0 && !state.fingerprint)
      || formatSingleNotesHistoryFingerprint(state.fingerprint) !== signature) {
      throw new Error(`The stored merged answers differ: ${scope}.`);
    }
    summaries[scope] = { current: currentCount, added: newCount,
      total: sequence, signature };
  }
  return summaries;
}
