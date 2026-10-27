import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { copyStagedNoteFlowToShadow } from "./SaveDataShadowNoteFlow";
import { copyStagedSingleNotesToShadow } from "./SaveDataShadowSingleNotes";
import { installStagedSingleNoteProgress } from "./SaveDataShadowProgress";
import {
  SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
  formatSingleNotesHistoryFingerprint
} from "./SingleNotesHistoryMigration";

const ROUND_SECTIONS = [
  ["data.noteFlowRounds.screen", "screen:note-flow"],
  ["data.noteFlowRounds.midi", "midi:note-flow"],
  ["data.noteFlowRounds.chordMidi", "midi:note-flow-chords"],
  ["data.rhythmSenseBars", "rhythm:taktgefuehl"]
];
const ATTEMPT_SECTIONS = [
  ["data.adaptiveHistory.evaluations", "screen:single-notes"],
  ["data.adaptiveHistoryMidi.evaluations", "midi:single-notes"]
];

function expectedCount(metadata, section) {
  const value = metadata.counts[section] === undefined ? 0 : metadata.counts[section];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The staged backup count is invalid: ${section}.`);
  }
  return value;
}

// Prepares and checks ONLY the inactive IndexedDB generation. The backup's
// settings and the live-generation switch belong to separate later stages.
export async function prepareStagedBackupInShadow(staging, shadow) {
  if (!staging || typeof staging.readMetadata !== "function"
    || !shadow || !shadow.database
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()) {
    throw new Error("A staged backup and inactive learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  // Reject malformed source counts before writing even the first batch.
  ROUND_SECTIONS.concat(ATTEMPT_SECTIONS).forEach(([section]) => (
    expectedCount(metadata, section)
  ));

  const rounds = await copyStagedNoteFlowToShadow(staging, shadow);
  const attempts = await copyStagedSingleNotesToShadow(staging, shadow);
  const progress = await installStagedSingleNoteProgress(staging, shadow);
  // The archive belongs to the inactive generation, just like the learning
  // records. A failed import must never partially replace the live calendar.
  const dailyHistory = metadata.shell.data.dailyTaskHistory || null;
  await shadow.database.writeDailyTaskHistory(dailyHistory);
  if (JSON.stringify(await shadow.database.readDailyTaskHistory()) !== JSON.stringify(dailyHistory)) {
    throw new Error("The copied daily task history differs.");
  }
  const summary = {
    source: {
      createdAt: metadata.shell.createdAt,
      fileSize: metadata.fileSize === undefined ? null : metadata.fileSize
    },
    rounds: {}, attempts: {}, progress: {}, dailyTaskHistory: dailyHistory
  };
  for (const [section, scope] of ROUND_SECTIONS) {
    const expected = expectedCount(metadata, section);
    const statistics = await shadow.database.readNoteFlowStatistics(scope);
    if (rounds[scope] !== expected || !statistics
      || statistics.roundCount !== expected) {
      throw new Error(`The copied round count differs: ${scope}.`);
    }
    summary.rounds[scope] = expected;
  }
  for (const [section, scope] of ATTEMPT_SECTIONS) {
    const expected = expectedCount(metadata, section);
    const state = await shadow.database.readAttemptHistoryState(scope);
    const source = attempts[scope];
    if (!source || source.attemptCount !== expected || !state
      || state.nextSequence !== expected
      || (expected > 0 && (!state.fingerprint
        || formatSingleNotesHistoryFingerprint(state.fingerprint) !== source.signature))) {
      throw new Error(`The copied single-note answers differ: ${scope}.`);
    }
    if (!progress[scope] || !Number.isSafeInteger(progress[scope].noteCount)
      || !progress[scope].signature) {
      throw new Error(`The copied learning progress is incomplete: ${scope}.`);
    }
    // A copied history is not readable by the live learning storage until its
    // migration marker is complete. Seal it only after source and shadow agree.
    await shadow.database.finalizeAttemptHistoryMigration(scope, {
      version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
      signature: source.signature,
      sourceEvaluationCount: expected,
      totalAttemptCount: expected
    });
    const verifiedState = await shadow.database.readAttemptHistoryState(scope);
    if (!verifiedState || !verifiedState.migration
      || verifiedState.migration.status !== "complete"
      || verifiedState.migration.signature !== source.signature
      || verifiedState.migration.totalAttemptCount !== expected
      || verifiedState.nextSequence !== expected
      || (expected > 0 && (!verifiedState.fingerprint
        || formatSingleNotesHistoryFingerprint(verifiedState.fingerprint)
          !== source.signature))) {
      throw new Error(`The copied single-note history is not ready: ${scope}.`);
    }
    summary.attempts[scope] = expected;
    summary.progress[scope] = progress[scope];
  }
  await shadow.database.sealVerifiedImportGeneration(summary);
  return summary;
}
