import {
  SAVE_DATA_STORAGE_KEYS, SCORE_STORAGE_PREFIX, RECORD_STORAGE_PREFIX,
  collectSaveData
} from "./SaveDataBackup";
import { createEmptyPrestigeArchive, mergePrestigeArchives } from "./PrestigeArchive";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { ADAPTIVE_HISTORY_VERSION, rebuildAdaptiveProgress } from "./AdaptiveHistory";
import { normalizeAdaptiveProgress } from "./AdaptiveLearning";
import { mergeRoundHistories, mergeStoredStatistics } from "./SaveDataMerge";
import { createProgressFromSnapshotRecords } from "./SingleNotesLearningStorage";
import {
  shadowLocalPlanByteLimit, readLegacyRounds
} from "./SaveDataShadowLocalPlan";

function stored(value) {
  return value === null || value === undefined
    ? null : JSON.stringify({ data: value });
}

function hasUnmigratedEvaluations(history) {
  if (!history || typeof history !== "object") return false;
  return !Array.isArray(history.evaluations)
    || history.evaluations.length > 0;
}

async function verifyLocalLearningCovered(current, activeDatabase) {
  const groups = [
    ["adaptiveHistory", "adaptiveProgress", "screen:single-notes"],
    ["adaptiveHistoryMidi", "adaptiveProgressMidi", "midi:single-notes"]
  ];
  for (const [historyKey, progressKey, scope] of groups) {
    const localSnapshots = [
      normalizeAdaptiveProgress(current[progressKey]),
      rebuildAdaptiveProgress(current[historyKey])
    ];
    if (localSnapshots.every(value => Object.keys(value.notes).length === 0)) {
      continue;
    }
    if (!activeDatabase || typeof activeDatabase.readProgressSnapshot !== "function") {
      throw new Error("Active learning progress is needed to verify the merge.");
    }
    const active = createProgressFromSnapshotRecords(
      await activeDatabase.readProgressSnapshot(scope)
    );
    localSnapshots.forEach(snapshot => {
      Object.keys(snapshot.notes).forEach(noteKey => {
        const saved = active.notes[noteKey];
        const local = snapshot.notes[noteKey];
        if (!saved || saved.attempts < local.attempts
          || (saved.attempts === local.attempts
            && JSON.stringify(saved) !== JSON.stringify(local))) {
          throw new Error(`Local learning progress is not in the database: ${scope}.`);
        }
      });
    });
  }
}

export function snapshotMergeLocalStorage(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && (
      Object.keys(SAVE_DATA_STORAGE_KEYS).some(name => (
        SAVE_DATA_STORAGE_KEYS[name] === key
      ))
      || key.indexOf(SCORE_STORAGE_PREFIX) === 0
      || key.indexOf(RECORD_STORAGE_PREFIX) === 0
    )) keys.push(key);
  }
  return keys.sort().map(key => [key, storage.getItem(key)]);
}

export function matchesMergeLocalSnapshot(storage, expected) {
  if (!Array.isArray(expected)) return false;
  const current = snapshotMergeLocalStorage(storage);
  return current.length === expected.length && current.every((entry, index) => (
    entry[0] === expected[index][0] && entry[1] === expected[index][1]
  ));
}

// Read-only local half of a large merge. The caller must separately verify and
// seal the shadow database before using the existing rollback-safe commit.
export async function prepareMergedLocalSaveDataPlan(
  staging, shadow, summary, storage = localStorage, activeDatabase = null
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.readBatch !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.readImportGenerationMarker !== "function"
    || typeof shadow.database.readProgressSnapshot !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName(storage)) {
    throw new Error("A staged backup and inactive learning database are required.");
  }
  const metadata = await staging.readMetadata();
  const marker = await shadow.database.readImportGenerationMarker();
  const fileSize = metadata && metadata.fileSize === undefined
    ? null : metadata && metadata.fileSize;
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data || !metadata.counts
    || !summary || !summary.source || typeof summary.activeGuard !== "string"
    || !summary.rounds
    || !summary.attempts || !summary.progress
    || summary.source.createdAt !== metadata.shell.createdAt
    || summary.source.fileSize !== fileSize
    || !marker || marker.state !== "preparing") {
    throw new Error("The merged backup preparation is incomplete or stale.");
  }

  const sourceLocalSnapshot = snapshotMergeLocalStorage(storage);
  const current = collectSaveData(storage);
  // In database-primary mode, compacted local baselines are retained for
  // compatibility; their learning records already live in IndexedDB. Only
  // un-migrated evaluations must block the switch.
  if (hasUnmigratedEvaluations(current.adaptiveHistory)
    || hasUnmigratedEvaluations(current.adaptiveHistoryMidi)) {
    throw new Error("Local single-note history must be migrated before merging.");
  }
  await verifyLocalLearningCovered(current, activeDatabase);
  const imported = metadata.shell.data;
  const importedRounds = await readLegacyRounds(staging, metadata);
  const rounds = mergeRoundHistories(current.roundHistory, importedRounds,
    { markImportedForPrestige: true });
  if (rounds.conflicts) {
    throw new Error("Conflicting legacy rounds require manual resolution.");
  }
  const statistics = mergeStoredStatistics(current.statistics, imported.statistics);
  const screenProgress = createProgressFromSnapshotRecords(
    await shadow.database.readProgressSnapshot("screen:single-notes")
  );
  const midiProgress = createProgressFromSnapshotRecords(
    await shadow.database.readProgressSnapshot("midi:single-notes")
  );
  const emptyHistory = () => ({
    version: ADAPTIVE_HISTORY_VERSION, baselines: [], evaluations: []
  });
  const values = Object.create(null);
  const assign = (key, value) => { values[key] = stored(value); };
  assign(SAVE_DATA_STORAGE_KEYS.options,
    current.options === null ? imported.options : current.options);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveOptions,
    current.adaptiveOptions === null
      ? imported.adaptiveOptions : current.adaptiveOptions);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveProgress, screenProgress);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveProgressMidi, midiProgress);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveHistory, emptyHistory());
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveHistoryMidi, emptyHistory());
  assign(SAVE_DATA_STORAGE_KEYS.roundHistory, rounds.history);
  assign(SAVE_DATA_STORAGE_KEYS.prestigeArchive, mergePrestigeArchives(
    current.prestigeArchive || createEmptyPrestigeArchive(),
    imported.prestigeArchive || createEmptyPrestigeArchive()
  ));
  assign(SAVE_DATA_STORAGE_KEYS.legacyLastScores, statistics.legacyLastScores);
  assign(SAVE_DATA_STORAGE_KEYS.legacyRecord, statistics.legacyRecord);
  for (const [entries, prefix] of [
    [statistics.scoreEntries, SCORE_STORAGE_PREFIX],
    [statistics.recordEntries, RECORD_STORAGE_PREFIX]
  ]) {
    entries.forEach(entry => {
      if (!entry || typeof entry.storageKey !== "string"
        || entry.storageKey.indexOf(prefix) !== 0
        || Object.prototype.hasOwnProperty.call(values, entry.storageKey)) {
        throw new Error("The merged statistics keys are invalid.");
      }
      assign(entry.storageKey, entry.value);
    });
  }
  const estimatedBytes = Object.keys(values).reduce((total, key) => (
    total + 2 * (key.length + (values[key] || "").length)
  ), 0);
  if (estimatedBytes > shadowLocalPlanByteLimit(values)) {
    throw new Error("Merged settings and normal rounds exceed the safe local storage limit.");
  }
  if (!matchesMergeLocalSnapshot(storage, sourceLocalSnapshot)) {
    throw new Error("Local learning data changed during merge preparation.");
  }
  return {
    generation: shadow.name,
    previousGeneration: activeLearningDatabaseName(storage),
    sourceCreatedAt: metadata.shell.createdAt,
    sourceFileSize: fileSize,
    normalRoundCount: rounds.history.rounds.length,
    normalRoundDuplicates: rounds.duplicates,
    activeGuard: summary.activeGuard,
    sourceLocalSnapshot,
    estimatedBytes,
    values
  };
}
