import {
  SAVE_DATA_STORAGE_KEYS,
  SCORE_STORAGE_PREFIX,
  RECORD_STORAGE_PREFIX
} from "./SaveDataBackup";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { ADAPTIVE_HISTORY_VERSION } from "./AdaptiveHistory";
import { markImportedRoundHistoryForPrestige } from "./PrestigeEligibility";

// localStorage is not suitable for unbounded answer history. This limit is a
// conservative preflight only; actual writes and rollback are a later stage.
export const MAX_SHADOW_LOCAL_PLAN_BYTES = 3 * 1024 * 1024;
const ROUND_BATCH = 100;

// Workshop scores and sources are separate local data. They never enter this
// plan, so all imported settings share the original bounded storage allowance.
export function shadowLocalPlanByteLimit() {
  return MAX_SHADOW_LOCAL_PLAN_BYTES;
}

function checkedCount(counts, section) {
  const count = counts[section] === undefined ? 0 : counts[section];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid staged backup count: ${section}.`);
  }
  return count;
}

function stored(value) {
  return value === null || value === undefined
    ? null : JSON.stringify({ data: value });
}

export async function readLegacyRounds(staging, metadata) {
  const direct = checkedCount(metadata.counts, "data.roundHistory");
  const nested = checkedCount(metadata.counts, "data.roundHistory.rounds");
  if (direct && nested) throw new Error("The backup has conflicting round histories.");
  const shell = metadata.shell.data.roundHistory;
  const section = Array.isArray(shell)
    ? "data.roundHistory" : "data.roundHistory.rounds";
  if ((direct && section !== "data.roundHistory")
    || (nested && section !== "data.roundHistory.rounds")) {
    throw new Error("The backup round history shape is inconsistent.");
  }
  if (shell === null) {
    if (direct || nested) throw new Error("The backup round history is incomplete.");
    return null;
  }
  const rounds = [];
  let approximateBytes = 0;
  let next = 0;
  const expected = direct + nested;
  while (next < expected) {
    const page = await staging.readBatch(section, next, ROUND_BATCH);
    if (!page || !Array.isArray(page.records) || page.records.length === 0
      || page.records.length > ROUND_BATCH
      || page.nextIndex !== next + page.records.length
      || page.total !== expected) {
      throw new Error("The staged normal rounds are incomplete.");
    }
    page.records.forEach(round => {
      approximateBytes += JSON.stringify(round).length * 2;
      if (approximateBytes > MAX_SHADOW_LOCAL_PLAN_BYTES) {
        throw new Error("Normal rounds exceed the safe local storage limit.");
      }
      rounds.push(round);
    });
    next = page.nextIndex;
  }
  return Array.isArray(shell)
    ? rounds : Object.assign({}, shell, { rounds });
}

// Produces a bounded, read-only plan. No localStorage key or active IndexedDB
// generation is changed. Large attempt histories deliberately stay in IDB.
export async function prepareStagedLocalSaveDataPlan(staging, shadow) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.readBatch !== "function"
    || !shadow || !shadow.database
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()) {
    throw new Error("A staged backup and inactive learning database are required.");
  }
  const metadata = await staging.readMetadata();
  const marker = await shadow.database.readImportGenerationMarker();
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data || !metadata.counts
    || !marker || marker.state !== "database-verified" || !marker.summary
    || !marker.summary.source
    || marker.summary.source.createdAt !== metadata.shell.createdAt
    || marker.summary.source.fileSize !== (metadata.fileSize === undefined
      ? null : metadata.fileSize)) {
    throw new Error("The backup database has not been verified.");
  }
  const pairedCounts = [
    ["data.noteFlowRounds.screen", "screen:note-flow", "rounds"],
    ["data.noteFlowRounds.midi", "midi:note-flow", "rounds"],
    ["data.noteFlowRounds.chordMidi", "midi:note-flow-chords", "rounds"],
    ["data.rhythmSenseBars", "rhythm:taktgefuehl", "rounds"],
    ["data.adaptiveHistory.evaluations", "screen:single-notes", "attempts"],
    ["data.adaptiveHistoryMidi.evaluations", "midi:single-notes", "attempts"]
  ];
  pairedCounts.forEach(([section, scope, group]) => {
    if (!marker.summary[group]
      || marker.summary[group][scope] !== checkedCount(metadata.counts, section)) {
      throw new Error(`The verified database differs from the staged backup: ${scope}.`);
    }
  });

  const data = metadata.shell.data;
  const roundHistory = await readLegacyRounds(staging, metadata);
  const emptyHistory = () => ({
    version: ADAPTIVE_HISTORY_VERSION, baselines: [], evaluations: []
  });
  const values = Object.create(null);
  const assign = (key, value) => { values[key] = stored(value); };
  assign(SAVE_DATA_STORAGE_KEYS.options, data.options);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveOptions, data.adaptiveOptions);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveProgress, data.adaptiveProgress);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveProgressMidi, data.adaptiveProgressMidi);
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveHistory, emptyHistory());
  assign(SAVE_DATA_STORAGE_KEYS.adaptiveHistoryMidi, emptyHistory());
  assign(SAVE_DATA_STORAGE_KEYS.roundHistory,
    markImportedRoundHistoryForPrestige(roundHistory));
  assign(SAVE_DATA_STORAGE_KEYS.prestigeArchive, data.prestigeArchive || null);
  assign(SAVE_DATA_STORAGE_KEYS.legacyLastScores, data.statistics.legacyLastScores);
  assign(SAVE_DATA_STORAGE_KEYS.legacyRecord, data.statistics.legacyRecord);
  for (const [entries, prefix] of [
    [data.statistics.scoreEntries, SCORE_STORAGE_PREFIX],
    [data.statistics.recordEntries, RECORD_STORAGE_PREFIX]
  ]) {
    if (!Array.isArray(entries)) throw new Error("The backup statistics are invalid.");
    entries.forEach(entry => {
      if (!entry || typeof entry.storageKey !== "string"
        || entry.storageKey.indexOf(prefix) !== 0
        || Object.prototype.hasOwnProperty.call(values, entry.storageKey)) {
        throw new Error("The backup statistics keys are invalid.");
      }
      assign(entry.storageKey, entry.value);
    });
  }
  const estimatedBytes = Object.keys(values).reduce((total, key) => (
    total + 2 * (key.length + (values[key] || "").length)
  ), 0);
  if (estimatedBytes > shadowLocalPlanByteLimit(values)) {
    throw new Error("Backup settings and normal rounds exceed the safe local storage limit.");
  }
  return {
    generation: shadow.name,
    previousGeneration: activeLearningDatabaseName(),
    sourceCreatedAt: metadata.shell.createdAt,
    sourceFileSize: metadata.fileSize === undefined ? null : metadata.fileSize,
    normalRoundCount: checkedCount(metadata.counts, "data.roundHistory")
      + checkedCount(metadata.counts, "data.roundHistory.rounds"),
    estimatedBytes,
    values
  };
}
