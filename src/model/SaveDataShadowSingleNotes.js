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

// Supplies the same chronological attempt shape as the legacy migration,
// without building one unbounded array. Baselines and derived aggregates are
// deliberately separate work; this function never changes the live database.
export async function streamStagedSingleNoteAttempts(staging, onBatch) {
  if (!staging || typeof staging.readChronologicalBatch !== "function"
    || typeof onBatch !== "function") {
    throw new TypeError("A staged backup and batch consumer are required.");
  }
  const counts = Object.create(null);
  for (const [section, scope] of INPUTS) {
    let cursor = null;
    let index = 0;
    let done = false;
    while (!done) {
      const page = await staging.readChronologicalBatch(section, cursor, 250);
      if (!page || !Array.isArray(page.records)
        || (!page.done && page.records.length === 0)
        || page.records.length > 250) {
        throw new Error("The staged single-note batch is incomplete.");
      }
      const attempts = page.records.map((record, offset) => {
        const evaluation = normalizeAdaptiveEvaluation(record);
        if (!evaluation) {
          throw new Error("The staged single-note evaluation is invalid.");
        }
        return {
          id: evaluation.id,
          sessionId: `${scope}|legacy-history|${Math.floor(
            (index + offset) / SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE
          )}`,
          scope,
          noteKey: evaluation.noteKey,
          staff: evaluation.exercise.staff,
          completedAt: evaluation.completedAt,
          correctFirstTry: evaluation.correctFirstTry,
          mistakeCount: evaluation.mistakeCount,
          responseTimeMs: evaluation.responseTimeMs
        };
      });
      if (attempts.length) {
        await onBatch({ scope, section, start: index, attempts });
      }
      index += attempts.length;
      cursor = page.cursor;
      done = page.done;
    }
    counts[scope] = index;
  }
  return counts;
}

function emptyManifest() {
  return {
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0,
    fingerprint: createEmptySingleNotesHistoryFingerprint()
  };
}

// Create a bounded source manifest before any imported attempts are written.
// The same fingerprint can later be checked against the shadow database.
export async function verifyStagedSingleNoteAttempts(staging) {
  if (!staging || typeof staging.readMetadata !== "function") {
    throw new TypeError("A staged backup is required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  const manifests = Object.create(null);
  INPUTS.forEach(([, scope]) => { manifests[scope] = emptyManifest(); });
  const readCounts = await streamStagedSingleNoteAttempts(staging, batch => {
    const manifest = manifests[batch.scope];
    batch.attempts.forEach(attempt => {
      manifest.attemptCount += 1;
      manifest.correctFirstTryCount += attempt.correctFirstTry ? 1 : 0;
      manifest.mistakeCount += attempt.mistakeCount;
      if (Number.isFinite(attempt.responseTimeMs) && attempt.responseTimeMs > 0) {
        manifest.responseTimeTotalMs += attempt.responseTimeMs;
        manifest.timedAttemptCount += 1;
      }
      manifest.fingerprint = extendSingleNotesHistoryFingerprint(
        manifest.fingerprint, attempt
      );
    });
  });
  for (const [section, scope] of INPUTS) {
    const rawCount = metadata.counts[section];
    const expected = rawCount === undefined ? 0 : rawCount;
    if (!Number.isSafeInteger(expected) || expected < 0
      || readCounts[scope] !== expected
      || manifests[scope].fingerprint.count !== expected) {
      throw new Error(`The staged single-note count is inconsistent: ${scope}.`);
    }
    manifests[scope].signature = formatSingleNotesHistoryFingerprint(
      manifests[scope].fingerprint
    );
  }
  return manifests;
}

export async function copyStagedSingleNotesToShadow(staging, shadow) {
  if (!shadow || !shadow.database
    || typeof shadow.database.appendImportedAttemptBatch !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()) {
    throw new Error("A separate inactive learning database is required.");
  }
  const source = await verifyStagedSingleNoteAttempts(staging);
  const written = Object.create(null);
  await streamStagedSingleNoteAttempts(staging, async batch => {
    const result = await shadow.database.appendImportedAttemptBatch(
      batch.scope, batch.attempts.map(markImportedForPrestige), batch.start
    );
    if (!result || result.total !== batch.start + batch.attempts.length) {
      throw new Error("The shadow database did not verify a copied batch.");
    }
    written[batch.scope] = result;
  });
  for (const [, scope] of INPUTS) {
    const result = written[scope];
    if (source[scope].attemptCount > 0 && (!result
      || result.total !== source[scope].attemptCount
      || formatSingleNotesHistoryFingerprint(result.fingerprint)
        !== source[scope].signature)) {
      throw new Error(`The copied single-note history differs: ${scope}.`);
    }
  }
  return source;
}
