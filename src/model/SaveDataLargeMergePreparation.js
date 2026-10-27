import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { canonicalize as canonical } from "./CanonicalJson";
import { mergeDailyTaskArchives } from "./DailyTaskHistoryData";
import { indexStagedSingleNoteMatches } from "./SaveDataLargeMergeMatches";
import { indexStagedRoundMatches } from "./SaveDataLargeMergeRounds";
import { planMergedSingleNoteProgress } from "./SaveDataLargeMergeProgressPlan";
import { copyMergedRoundsToShadow } from "./SaveDataLargeMergeRoundWriter";
import { copyMergedSingleNotesToShadow } from "./SaveDataLargeMergeSingleNotes";
import { installMergedSingleNoteProgress } from "./SaveDataLargeMergeProgressWriter";
import {
  SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
  formatSingleNotesHistoryFingerprint
} from "./SingleNotesHistoryMigration";
import {
  createProgressFromSnapshotRecords,
  createSingleNotesProgressSnapshot
} from "./SingleNotesLearningStorage";

const ROUND_SCOPES = ["screen:note-flow", "midi:note-flow",
  "midi:note-flow-chords", "rhythm:taktgefuehl"];
const ATTEMPT_SCOPES = ["screen:single-notes", "midi:single-notes"];

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The large backup merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

export async function readActiveMergeGuard(database) {
  const rounds = {};
  const attempts = {};
  for (const scope of ROUND_SCOPES) {
    const statistics = await database.readNoteFlowStatistics(scope);
    if (!statistics || !Number.isSafeInteger(statistics.roundCount)) {
      throw new Error(`Invalid active round statistics: ${scope}.`);
    }
    rounds[scope] = JSON.stringify(canonical(statistics));
  }
  for (const scope of ATTEMPT_SCOPES) {
    const state = await database.readAttemptHistoryState(scope);
    if (!state || !Number.isSafeInteger(state.nextSequence)
      || state.nextSequence < 0) {
      throw new Error(`Invalid active answer state: ${scope}.`);
    }
    const progress = createProgressFromSnapshotRecords(
      await database.readProgressSnapshot(scope)
    );
    attempts[scope] = {
      count: state.nextSequence,
      signature: formatSingleNotesHistoryFingerprint(state.fingerprint),
      progress: createSingleNotesProgressSnapshot(progress).signature
    };
  }
  const dailyTaskHistory = await database.readDailyTaskHistory();
  return JSON.stringify({ rounds, attempts, dailyTaskHistory: canonical(dailyTaskHistory) });
}

// Prepares ONLY a fresh, inactive learning database. The caller owns cleanup
// on error. Local settings/legacy rounds, database sealing and activation are
// deliberately separate; this summary is not an activation permit.
export async function prepareMergedBackupInShadow(
  staging, activeDatabase, shadow, shouldContinue = () => true
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || !activeDatabase
    || typeof activeDatabase.readNoteFlowStatistics !== "function"
    || typeof activeDatabase.readAttemptHistoryState !== "function"
    || typeof activeDatabase.readProgressSnapshot !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.finalizeAttemptHistoryMigration !== "function"
    || typeof shadow.database.readAttemptHistoryState !== "function"
    || typeof shadow.database.readImportGenerationMarker !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()
    || typeof shouldContinue !== "function") {
    throw new TypeError("A staged backup and inactive learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  const initialMarker = await shadow.database.readImportGenerationMarker();
  if (!initialMarker || initialMarker.state !== "preparing") {
    throw new Error("The inactive learning database is not preparing an import.");
  }
  const before = await readActiveMergeGuard(activeDatabase);
  cancelled(shouldContinue);
  const attemptsIndex = await indexStagedSingleNoteMatches(
    staging, activeDatabase, shouldContinue
  );
  const roundsIndex = await indexStagedRoundMatches(
    staging, activeDatabase, shouldContinue
  );
  await planMergedSingleNoteProgress(staging, activeDatabase,
    attemptsIndex, shouldContinue);
  cancelled(shouldContinue);
  const rounds = await copyMergedRoundsToShadow(staging, activeDatabase,
    shadow, roundsIndex, shouldContinue);
  const attempts = await copyMergedSingleNotesToShadow(staging, activeDatabase,
    shadow, attemptsIndex, shouldContinue);
  const progress = await installMergedSingleNoteProgress(staging,
    activeDatabase, shadow, attemptsIndex, shouldContinue);
  const dailyTaskHistory = mergeDailyTaskArchives(await activeDatabase.readDailyTaskHistory(),
    metadata.shell.data.dailyTaskHistory);
  await shadow.database.writeDailyTaskHistory(dailyTaskHistory);
  if (JSON.stringify(await shadow.database.readDailyTaskHistory()) !== JSON.stringify(dailyTaskHistory)) {
    throw new Error("The merged daily task history differs.");
  }
  for (const scope of ATTEMPT_SCOPES) {
    cancelled(shouldContinue);
    const result = attempts[scope];
    if (!result || !Number.isSafeInteger(result.total)
      || typeof result.signature !== "string" || !progress[scope]
      || typeof progress[scope].signature !== "string") {
      throw new Error(`Incomplete merged single-note history: ${scope}.`);
    }
    await shadow.database.finalizeAttemptHistoryMigration(scope, {
      version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
      signature: result.signature,
      sourceEvaluationCount: result.total,
      totalAttemptCount: result.total
    });
    const state = await shadow.database.readAttemptHistoryState(scope);
    if (!state || state.nextSequence !== result.total
      || formatSingleNotesHistoryFingerprint(state.fingerprint)
        !== result.signature
      || !state.migration || state.migration.status !== "complete"
      || state.migration.signature !== result.signature
      || state.migration.totalAttemptCount !== result.total) {
      throw new Error(`Merged single-note history is not ready: ${scope}.`);
    }
  }
  if (await readActiveMergeGuard(activeDatabase) !== before) {
    throw new Error("Active learning data changed during the backup merge.");
  }
  const finalMarker = await shadow.database.readImportGenerationMarker();
  if (!finalMarker || finalMarker.state !== "preparing") {
    throw new Error("The inactive learning database changed during the merge.");
  }
  cancelled(shouldContinue);
  return {
    activeGuard: before,
    source: { createdAt: metadata.shell.createdAt,
      fileSize: metadata.fileSize === undefined ? null : metadata.fileSize },
    rounds, attempts, progress, dailyTaskHistory,
    duplicates: {
      rounds: roundsIndex.sections,
      attempts: attemptsIndex.sections
    }
  };
}
