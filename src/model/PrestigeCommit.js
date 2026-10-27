import { collectSaveData, SAVE_DATA_STORAGE_KEYS } from "./SaveDataBackup";
import {
  mergePrestigeArchives, createEmptyPrestigeArchive, normalizePrestigeArchive
} from "./PrestigeArchive";
import { preparePrestigeArchivePreview } from "./PrestigePreparation";
import { copyPrestigeRemainingToShadow, retainPrestigeFreeRounds } from "./PrestigeShadowCopy";
import { copyPrestigeLearningProgress } from "./PrestigeProgressCopy";
import { normalizeRoundHistory } from "./RoundHistory";
import { normalizeAdaptiveProgress } from "./AdaptiveLearning";
import {
  createProgressFromSnapshotRecords,
  createSingleNotesProgressSnapshot
} from "./SingleNotesLearningStorage";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { readActiveMergeGuard } from "./SaveDataLargeMergePreparation";
import {
  snapshotMergeLocalStorage, matchesMergeLocalSnapshot
} from "./SaveDataLargeMergeLocalPlan";
import { MAX_SHADOW_LOCAL_PLAN_BYTES } from "./SaveDataShadowLocalPlan";
import {
  SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
  formatSingleNotesHistoryFingerprint
} from "./SingleNotesHistoryMigration";
import { commitStagedShadowImport } from "./SaveDataShadowCommit";

const NOTE_SCOPES = ["screen:single-notes", "midi:single-notes"];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("Prestige preparation was cancelled.");
  error.name = "AbortError";
  throw error;
}

function localValues(snapshot) {
  return snapshot.reduce((values, [key, value]) => {
    values[key] = value;
    return values;
  }, Object.create(null));
}

function stored(value) {
  return JSON.stringify({ data: value });
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verifyLocalProgressCovered(data, active) {
  for (const [scope, key] of [
    ["screen:single-notes", "adaptiveProgress"],
    ["midi:single-notes", "adaptiveProgressMidi"]
  ]) {
    const local = normalizeAdaptiveProgress(data[key]);
    const database = createProgressFromSnapshotRecords(
      await active.readProgressSnapshot(scope)
    );
    Object.keys(local.notes).forEach(noteKey => {
      const saved = database.notes[noteKey];
      const value = local.notes[noteKey];
      check(saved && saved.attempts >= value.attempts
        && (saved.attempts !== value.attempts || same(saved, value)),
      `Local learning progress is not in the database: ${scope}.`);
    });
  }
}

// Prepare and seal a fresh, inactive generation. The caller owns cleanup on
// error. Only commitPreparedPrestige may switch to the verified generation.
export async function preparePrestigeCommit(preview, active, shadow,
  storage = localStorage, shouldContinue = () => true) {
  check(preview && preview.segment && preview.currentCounts
    && preview.segment.id !== "prestige-preview"
    && active && shadow && shadow.database
    && typeof shadow.database.readImportGenerationMarker === "function"
    && typeof shadow.database.finalizeAttemptHistoryMigration === "function"
    && typeof shadow.database.readAttemptHistoryState === "function"
    && typeof shadow.database.sealVerifiedImportGeneration === "function"
    && /^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    && shadow.name !== activeLearningDatabaseName(storage)
    && typeof shouldContinue === "function",
  "A prestige preview and fresh inactive database are required.");
  const marker = await shadow.database.readImportGenerationMarker();
  check(marker && marker.state === "preparing",
    "The inactive prestige database is not preparing.");
  const previousGeneration = activeLearningDatabaseName(storage);
  const sourceLocalSnapshot = snapshotMergeLocalStorage(storage);
  const data = collectSaveData(storage);
  const freeRounds = normalizeRoundHistory(data.roundHistory).rounds;
  const existingArchive = normalizePrestigeArchive(
    data.prestigeArchive || createEmptyPrestigeArchive()
  );
  check(!existingArchive.segments.some(segment => (
    segment.id === preview.segment.id
  )), "This prestige segment has already been archived.");
  check(freeRounds.length === preview.currentCounts.freeRounds,
    "Free training rounds changed before prestige.");
  for (const key of ["adaptiveHistory", "adaptiveHistoryMidi"]) {
    const history = data[key];
    check(!history || (Array.isArray(history.evaluations)
      && history.evaluations.length === 0),
    "Local single-note history must be migrated before prestige.");
  }
  await verifyLocalProgressCovered(data, active);
  const activeGuard = await readActiveMergeGuard(active);
  cancelled(shouldContinue);
  const checkedPreview = await preparePrestigeArchivePreview(active, {
    id: preview.segment.id,
    createdAt: preview.segment.createdAt,
    levels: preview.segment.levels,
    freeRounds,
    shouldContinue
  });
  check(same(checkedPreview.segment, preview.segment)
    && same(checkedPreview.sourceCounts, preview.sourceCounts),
  "Prestige preview changed before copying.");
  const details = await copyPrestigeRemainingToShadow(preview, active,
    shadow, shouldContinue);
  const progress = await copyPrestigeLearningProgress(active, shadow,
    shouldContinue);
  // Prestige compacts learning details, while the independently earned daily
  // calendar belongs to the new generation unchanged.
  const dailyTaskHistory = await active.readDailyTaskHistory();
  await shadow.database.writeDailyTaskHistory(dailyTaskHistory);
  check(same(await shadow.database.readDailyTaskHistory(), dailyTaskHistory),
    "Retained daily task history differs.");
  for (const scope of NOTE_SCOPES) {
    cancelled(shouldContinue);
    const state = await shadow.database.readAttemptHistoryState(scope);
    const expected = details.kept[scope];
    check(state && state.nextSequence === expected,
      `Retained single-note history differs: ${scope}.`);
    const signature = formatSingleNotesHistoryFingerprint(state.fingerprint);
    await shadow.database.finalizeAttemptHistoryMigration(scope, {
      version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
      signature,
      sourceEvaluationCount: expected,
      totalAttemptCount: expected
    });
    const verified = await shadow.database.readAttemptHistoryState(scope);
    check(verified && verified.nextSequence === expected
      && verified.migration && verified.migration.status === "complete"
      && verified.migration.signature === signature
      && verified.migration.totalAttemptCount === expected,
    `Retained single-note history was not finalized: ${scope}.`);
  }
  const values = localValues(sourceLocalSnapshot);
  if (preview.sourceCounts.freeRounds > 0) {
    const retained = retainPrestigeFreeRounds(freeRounds, preview.sourceCounts.freeRounds);
    check(retained.length === details.localFreeRoundsToKeep,
      "Retained free training rounds differ from the prestige preview.");
    values[SAVE_DATA_STORAGE_KEYS.roundHistory] = stored(
      Array.isArray(data.roundHistory) ? retained
        : Object.assign({}, data.roundHistory, { rounds: retained })
    );
  }
  values[SAVE_DATA_STORAGE_KEYS.prestigeArchive] = stored(
    mergePrestigeArchives(existingArchive,
      { version: 1, segments: [preview.segment] })
  );
  const estimatedBytes = Object.keys(values).reduce((total, key) => (
    total + 2 * (key.length + (values[key] || "").length)
  ), 0);
  check(estimatedBytes <= MAX_SHADOW_LOCAL_PLAN_BYTES,
    "Prestige local data exceed the safe rollback limit.");
  check(await readActiveMergeGuard(active) === activeGuard
    && matchesMergeLocalSnapshot(storage, sourceLocalSnapshot)
    && activeLearningDatabaseName(storage) === previousGeneration,
  "Learning data changed during prestige preparation.");
  const summary = {
    source: { createdAt: preview.segment.createdAt, fileSize: null },
    activeGuard,
    prestigeSegmentId: preview.segment.id,
    details,
    progress,
    dailyTaskHistory
  };
  cancelled(shouldContinue);
  await shadow.database.sealVerifiedImportGeneration(summary);
  return {
    summary,
    plan: {
      generation: shadow.name,
      previousGeneration,
      sourceCreatedAt: preview.segment.createdAt,
      sourceFileSize: null,
      activeGuard,
      sourceLocalSnapshot,
      estimatedBytes,
      values
    }
  };
}

// Uses the established rollback journal and one-key database-generation
// switch. The app must close its writes and reload after a successful switch.
export async function commitPreparedPrestige(prepared, shadow, active,
  storage = localStorage, options = {}) {
  check(prepared && prepared.plan && prepared.summary
    && prepared.summary.prestigeSegmentId
    && active && shadow && shadow.name === prepared.plan.generation,
  "A sealed prestige preparation is required.");
  const marker = await shadow.database.readImportGenerationMarker();
  check(marker && marker.state === "database-verified"
    && same(marker.summary, prepared.summary),
  "The sealed prestige database changed.");
  const kept = prepared.summary.details && prepared.summary.details.kept;
  const counts = await shadow.database.readStoredEntryCounts();
  check(kept && counts.singleNotesScreen === kept["screen:single-notes"]
    && counts.singleNotesMidi === kept["midi:single-notes"]
    && counts.melodyRounds === kept["screen:note-flow"]
      + kept["midi:note-flow"]
    && counts.chordRounds === kept["midi:note-flow-chords"]
    && counts.rhythmBars === kept["rhythm:taktgefuehl"],
  "The retained prestige details changed.");
  for (const scope of NOTE_SCOPES) {
    const history = await shadow.database.readAttemptHistoryState(scope);
    check(history && history.nextSequence === kept[scope]
      && history.migration && history.migration.status === "complete"
      && history.migration.totalAttemptCount === kept[scope]
      && history.migration.signature
        === formatSingleNotesHistoryFingerprint(history.fingerprint),
    `The retained learning history changed: ${scope}.`);
    const storedProgress = createSingleNotesProgressSnapshot(
      createProgressFromSnapshotRecords(
        await shadow.database.readProgressSnapshot(scope)
      )
    );
    check(prepared.summary.progress[scope]
      && storedProgress.signature === prepared.summary.progress[scope].signature,
    `The retained learning progress changed: ${scope}.`);
  }
  return commitStagedShadowImport(prepared.plan, shadow, storage,
    Object.assign({}, options, { activeDatabase: active }));
}
