import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { readActiveMergeGuard } from "./SaveDataLargeMergePreparation";
import { matchesMergeLocalSnapshot } from "./SaveDataLargeMergeLocalPlan";
import {
  createProgressFromSnapshotRecords,
  createSingleNotesProgressSnapshot
} from "./SingleNotesLearningStorage";
import { formatSingleNotesHistoryFingerprint } from "./SingleNotesHistoryMigration";

const ROUND_SCOPES = ["screen:note-flow", "midi:note-flow",
  "midi:note-flow-chords", "rhythm:taktgefuehl"];
const NOTE_SCOPES = ["screen:single-notes", "midi:single-notes"];

// The last read-only gate before a prepared merge becomes committable. This
// only changes the marker in the inactive database; it never activates it.
export async function sealMergedBackupForCommit(
  activeDatabase, shadow, summary, plan, storage = localStorage
) {
  if (!activeDatabase || !shadow || !shadow.database || !summary
    || !summary.source || !plan
    || typeof summary.activeGuard !== "string"
    || plan.activeGuard !== summary.activeGuard
    || plan.generation !== shadow.name
    || plan.previousGeneration !== activeLearningDatabaseName(storage)
    || plan.sourceCreatedAt !== summary.source.createdAt
    || plan.sourceFileSize !== summary.source.fileSize
    || !matchesMergeLocalSnapshot(storage, plan.sourceLocalSnapshot)) {
    throw new Error("The prepared backup merge is stale.");
  }
  const database = shadow.database;
  const marker = await database.readImportGenerationMarker();
  if (!marker || marker.state !== "preparing") {
    throw new Error("The inactive database is not preparing a merge.");
  }
  if (JSON.stringify(await database.readDailyTaskHistory()) !== JSON.stringify(summary.dailyTaskHistory || null)) {
    throw new Error("Merged daily task history changed before sealing.");
  }
  if (await readActiveMergeGuard(activeDatabase) !== summary.activeGuard) {
    throw new Error("Active learning data changed during backup preparation.");
  }
  for (const scope of ROUND_SCOPES) {
    const expected = summary.rounds && summary.rounds[scope];
    const actual = await database.readNoteFlowStatistics(scope);
    if (!expected || !Number.isSafeInteger(expected.total)
      || !actual || actual.roundCount !== expected.total) {
      throw new Error(`Merged rounds changed before sealing: ${scope}.`);
    }
  }
  for (const scope of NOTE_SCOPES) {
    const expected = summary.attempts && summary.attempts[scope];
    const expectedProgress = summary.progress && summary.progress[scope];
    const actual = await database.readAttemptHistoryState(scope);
    const progress = createSingleNotesProgressSnapshot(
      createProgressFromSnapshotRecords(await database.readProgressSnapshot(scope))
    );
    if (!expected || !Number.isSafeInteger(expected.total)
      || !expectedProgress || !actual
      || actual.nextSequence !== expected.total
      || formatSingleNotesHistoryFingerprint(actual.fingerprint)
        !== expected.signature
      || !actual.migration || actual.migration.status !== "complete"
      || actual.migration.signature !== expected.signature
      || progress.signature !== expectedProgress.signature) {
      throw new Error(`Merged single-note data changed before sealing: ${scope}.`);
    }
  }
  if (await readActiveMergeGuard(activeDatabase) !== summary.activeGuard
    || !matchesMergeLocalSnapshot(storage, plan.sourceLocalSnapshot)) {
    throw new Error("Learning data changed before the merge was sealed.");
  }
  await database.sealVerifiedImportGeneration(summary);
  return { sealed: true, generation: shadow.name };
}
