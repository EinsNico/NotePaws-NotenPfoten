import {
  activeLearningDatabaseName,
  activateReadyLearningDatabase
} from "./LearningDatabaseGeneration";
import {
  SAVE_DATA_STORAGE_KEYS,
  SCORE_STORAGE_PREFIX,
  RECORD_STORAGE_PREFIX
} from "./SaveDataBackup";
import SingleNotesLearningStorage from "./SingleNotesLearningStorage";
import NoteFlowRoundStorage from "./NoteFlowRoundStorage";
import RhythmSenseRoundStorage from "./RhythmSenseRoundStorage";
import { shadowLocalPlanByteLimit } from "./SaveDataShadowLocalPlan";
import { matchesMergeLocalSnapshot } from "./SaveDataLargeMergeLocalPlan";
import { readActiveMergeGuard } from "./SaveDataLargeMergePreparation";
import { recoverPendingPracticeWrites } from "./LearningWriteRecovery";

export const SHADOW_IMPORT_JOURNAL_KEY = "noten-pfoten:pending-backup-import";
const SHADOW_NAME = /^noten-pfoten-learning-import-[a-z0-9-]+$/;
const STANDARD_KEYS = Object.keys(SAVE_DATA_STORAGE_KEYS).map(
  key => SAVE_DATA_STORAGE_KEYS[key]
);
const LEGACY_WORKSHOP_KEYS = ["workshopLibrary", "workshopPracticeStatistics"];
const COMMIT_LOCK_NAME = "noten-pfoten-backup-import-commit";
const REALM_QUEUE_KEY = Symbol.for(COMMIT_LOCK_NAME);
const realm = typeof globalThis !== "undefined" ? globalThis
  : typeof window !== "undefined" ? window : global;

function serializeCommit(options, operation) {
  // Duplicate module instances in this realm share the fallback queue. Web
  // Locks additionally protect other tabs/processes of this browser origin.
  const locks = options.locks !== undefined ? options.locks
    : typeof navigator !== "undefined" ? navigator.locks : null;
  const pending = Promise.resolve(realm[REALM_QUEUE_KEY]).then(() => (
    locks && typeof locks.request === "function"
      ? locks.request(COMMIT_LOCK_NAME, { mode: "exclusive" }, operation)
      : operation()
  ));
  // A rejected lock request must not bypass the lock and mutate live data.
  realm[REALM_QUEUE_KEY] = pending.then(() => undefined, () => undefined);
  return pending;
}

function assertFreshPlan(plan, storage) {
  if (activeLearningDatabaseName(storage) !== plan.previousGeneration
    || storage.getItem(SHADOW_IMPORT_JOURNAL_KEY) !== null) {
    throw new Error("The import plan is stale or another import is pending.");
  }
}

function assertJournalOwner(storage, journalRaw) {
  if (storage.getItem(SHADOW_IMPORT_JOURNAL_KEY) !== journalRaw) {
    throw new Error("The import rollback journal belongs to another operation.");
  }
}

function isOwned(key) {
  return STANDARD_KEYS.indexOf(key) !== -1
    || key.indexOf(SCORE_STORAGE_PREFIX) === 0
    || key.indexOf(RECORD_STORAGE_PREFIX) === 0;
}

function ownedKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && isOwned(key)) keys.push(key);
  }
  return keys.sort();
}

function snapshot(storage, keys) {
  return keys.map(key => [key, storage.getItem(key)]);
}

function verifyValues(storage, entries) {
  return entries.every(([key, value]) => storage.getItem(key) === value);
}

function restoreSnapshot(storage, previous) {
  // Remove the newly imported keys first, so rollback has quota headroom.
  ownedKeys(storage).forEach(key => storage.removeItem(key));
  previous.forEach(([key, value]) => {
    if (value !== null) storage.setItem(key, value);
  });
  if (!verifyValues(storage, previous)
    || ownedKeys(storage).length !== previous.filter(([, value]) => value !== null).length) {
    throw new Error("The previous local save data could not be restored.");
  }
}

function parseJournal(raw) {
  let journal;
  try { journal = JSON.parse(raw); } catch (error) {
    throw new Error("The pending import journal is damaged.");
  }
  if (!journal || !SHADOW_NAME.test(journal.target)
    || typeof journal.previousGeneration !== "string"
    || !Array.isArray(journal.previous)
    || journal.previous.some(entry => !Array.isArray(entry) || entry.length !== 2
      || typeof entry[0] !== "string"
      || (!isOwned(entry[0]) && LEGACY_WORKSHOP_KEYS.indexOf(entry[0]) === -1)
      || (entry[1] !== null && typeof entry[1] !== "string"))) {
    throw new Error("The pending import journal is invalid.");
  }
  // Older import journals included workshop data. Recover their app data, but
  // leave the current separate workshop untouched, including a later edit.
  journal.previous = journal.previous.filter(([key]) => isOwned(key));
  return journal;
}

// Synchronous so the app can recover before Options.loadOptions or any writer
// opens an IndexedDB generation. An unfinished switch restores all old keys.
export function recoverPendingShadowImport(storage = localStorage, expectedJournal) {
  const raw = storage.getItem(SHADOW_IMPORT_JOURNAL_KEY);
  if (expectedJournal !== undefined) assertJournalOwner(storage, expectedJournal);
  if (raw === null) return { recovered: false };
  const journal = parseJournal(raw);
  const selected = activeLearningDatabaseName(storage);
  if (selected === journal.target) {
    // The single-key generation switch happened after every local value was
    // verified. A crash during journal cleanup is therefore a committed import.
    storage.removeItem(SHADOW_IMPORT_JOURNAL_KEY);
    return { recovered: true, committed: true };
  }
  if (selected !== journal.previousGeneration) {
    throw new Error("The active learning database changed during import recovery.");
  }
  restoreSnapshot(storage, journal.previous);
  storage.removeItem(SHADOW_IMPORT_JOURNAL_KEY);
  return { recovered: true, committed: false };
}

export async function flushCurrentWrites() {
  await SingleNotesLearningStorage.flush();
  const status = SingleNotesLearningStorage.getStatus();
  if (status.failedWrites > 0 || status.pendingWrites > 0) {
    throw new Error("Pending single-note learning data could not be saved.");
  }
  await recoverPendingPracticeWrites(NoteFlowRoundStorage);
  await recoverPendingPracticeWrites(RhythmSenseRoundStorage);
}

function validatePlan(plan) {
  if (!plan || !SHADOW_NAME.test(plan.generation)
    || typeof plan.previousGeneration !== "string"
    || typeof plan.sourceCreatedAt !== "string"
    || (plan.sourceFileSize !== null
      && (!Number.isSafeInteger(plan.sourceFileSize) || plan.sourceFileSize < 0))
    || !plan.values || typeof plan.values !== "object"
    || !Number.isSafeInteger(plan.estimatedBytes) || plan.estimatedBytes < 0
    || plan.estimatedBytes > shadowLocalPlanByteLimit(plan.values)
    || Object.keys(plan.values).some(key => !isOwned(key)
      || (plan.values[key] !== null && typeof plan.values[key] !== "string"))) {
    throw new Error("The local import plan is invalid.");
  }
  const actualBytes = Object.keys(plan.values).reduce((total,key) =>
    total + 2 * (key.length + (plan.values[key] || "").length),0);
  if (actualBytes > shadowLocalPlanByteLimit(plan.values)) {
    throw new Error("The local import plan exceeds its safe storage limit.");
  }
}

// Both replace and merge use this boundary for the verified shadow generation
// and bounded local-settings plan. Without Web Locks, separate browser realms
// still rely on the journal guards rather than full cross-process atomicity.
export function commitStagedShadowImport(
  plan, shadow, storage = localStorage, options = {}
) {
  return serializeCommit(options, () => commitOwnedShadowImport(plan, shadow, storage, options));
}

async function commitOwnedShadowImport(plan, shadow, storage, options) {
  validatePlan(plan);
  if (!shadow || shadow.name !== plan.generation || !shadow.database
  ) {
    throw new Error("The import plan is stale or another import is pending.");
  }
  assertFreshPlan(plan, storage);
  await (options.flushCurrentWrites || flushCurrentWrites)();
  if (activeLearningDatabaseName(storage) !== plan.previousGeneration) {
    throw new Error("The active learning database changed during preparation.");
  }
  const marker = await shadow.database.readImportGenerationMarker();
  if (!marker || marker.state !== "database-verified" || !marker.summary
    || !marker.summary.source
    || marker.summary.source.createdAt !== plan.sourceCreatedAt
    || marker.summary.source.fileSize !== plan.sourceFileSize) {
    throw new Error("The replacement database has not been verified.");
  }
  if (Object.prototype.hasOwnProperty.call(marker.summary, "dailyTaskHistory")
    && JSON.stringify(await shadow.database.readDailyTaskHistory()) !== JSON.stringify(marker.summary.dailyTaskHistory)) {
    throw new Error("The prepared daily task history changed.");
  }
  if (plan.activeGuard !== undefined) {
    if (typeof plan.activeGuard !== "string"
      || !options.activeDatabase
      || await readActiveMergeGuard(options.activeDatabase) !== plan.activeGuard
      || !matchesMergeLocalSnapshot(storage, plan.sourceLocalSnapshot)) {
      throw new Error("Learning data changed after merge preparation.");
    }
  }
  // Every asynchronous preflight is complete. Recheck immediately before the
  // synchronous journal/settings writes, while still holding commit ownership.
  assertFreshPlan(plan, storage);
  const keys = Array.from(new Set(ownedKeys(storage).concat(
    Object.keys(plan.values)
  ))).sort();
  const previous = snapshot(storage, keys);
  const desired = keys.map(key => [key,
    Object.prototype.hasOwnProperty.call(plan.values, key) ? plan.values[key] : null
  ]);
  const journal = {
    target: plan.generation,
    previousGeneration: plan.previousGeneration,
    previous
  };
  const journalRaw = JSON.stringify(journal);
  // The journal write is one atomic localStorage operation. If quota is too
  // tight to record it, nothing in the user's save is modified.
  storage.setItem(SHADOW_IMPORT_JOURNAL_KEY, journalRaw);
  assertJournalOwner(storage, journalRaw);
  const assertBeforeSwitch = () => {
    assertJournalOwner(storage, journalRaw);
    if (activeLearningDatabaseName(storage) !== plan.previousGeneration
      || !verifyValues(storage, desired)) {
      throw new Error("The active save data changed during import activation.");
    }
  };
  let switched;
  try {
    desired.forEach(([key, value]) => {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    });
    if (!verifyValues(storage, desired)) {
      throw new Error("Imported local settings did not verify after writing.");
    }
    await shadow.database.markVerifiedImportReady();
    assertBeforeSwitch();
    switched = await activateReadyLearningDatabase(plan.generation, {
      storage,
      openDatabase: options.openDatabase,
      assertBeforeSwitch
    });
  } catch (error) {
    if (activeLearningDatabaseName(storage) === plan.generation
      && storage.getItem(SHADOW_IMPORT_JOURNAL_KEY) === journalRaw
      && verifyValues(storage, desired)) {
      // An exception after the switch cannot safely roll back local values.
      // Startup recovery will finish cleanup instead.
      return { active: plan.generation, committed: true, journalPending: true };
    }
    try {
      recoverPendingShadowImport(storage, journalRaw);
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    if (!error.rollbackError) {
      try {
        const pendingMarker = await shadow.database.readImportGenerationMarker();
        if (pendingMarker && pendingMarker.state === "ready") {
          await shadow.database.revertUnactivatedImportReady();
        }
      } catch (markerError) {
        error.markerRollbackError = markerError;
      }
    }
    throw error;
  }
  let journalPending = false;
  try {
    assertJournalOwner(storage, journalRaw);
    storage.removeItem(SHADOW_IMPORT_JOURNAL_KEY);
    journalPending = storage.getItem(SHADOW_IMPORT_JOURNAL_KEY) !== null;
  } catch (ignored) { journalPending = true; }
  return Object.assign({ committed: true, journalPending }, switched);
}
