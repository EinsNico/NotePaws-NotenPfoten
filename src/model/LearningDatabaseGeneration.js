import { openLearningDatabasePrototype } from "./LearningDatabasePrototype";

export const LEGACY_LEARNING_DATABASE_NAME = "noten-pfoten-learning";
export const ACTIVE_LEARNING_DATABASE_KEY = "noten-pfoten:active-learning-database";
export const IMPORT_GENERATION_META_KEY = "backup-import-generation";
const SHADOW_PREFIX = `${LEGACY_LEARNING_DATABASE_NAME}-import-`;
const SHADOW_NAME_PATTERN = /^noten-pfoten-learning-import-[a-z0-9-]+$/;

function browserStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Database request failed."));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error("Database transaction failed.")
    );
    transaction.onerror = () => {};
  });
}

export function activeLearningDatabaseName(storage = browserStorage()) {
  if (!storage) return LEGACY_LEARNING_DATABASE_NAME;
  try {
    const selected = storage.getItem(ACTIVE_LEARNING_DATABASE_KEY);
    return selected && SHADOW_NAME_PATTERN.test(selected)
      ? selected : LEGACY_LEARNING_DATABASE_NAME;
  } catch (ignored) {
    return LEGACY_LEARNING_DATABASE_NAME;
  }
}

// Creates a fresh, inactive database with the same schema as the live one.
// Merely preparing it never changes which database the app opens.
export async function createShadowLearningDatabase(options = {}) {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().toLowerCase()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const name = `${SHADOW_PREFIX}${suffix}`;
  const openDatabase = options.openDatabase || openLearningDatabasePrototype;
  const database = await openDatabase(Object.assign({}, options, { name }));
  try {
    const transaction = database.database.transaction("meta", "readwrite");
    const completion = transactionResult(transaction);
    transaction.objectStore("meta").put({
      key: IMPORT_GENERATION_META_KEY,
      state: "preparing",
      createdAt: Date.now()
    });
    await completion;
    return { name, database };
  } catch (error) {
    database.close();
    throw error;
  }
}

// A failed preparation may leave a large inactive copy. Never delete a
// generation selected by the app, even if cleanup is called after an error.
export async function discardInactiveShadowLearningDatabase(shadow, options = {}) {
  if (!shadow || !SHADOW_NAME_PATTERN.test(shadow.name)
    || shadow.name === activeLearningDatabaseName(options.storage || browserStorage())) {
    throw new Error("Only an inactive import database can be discarded.");
  }
  if (shadow.database) shadow.database.close();
  const databaseApi = options.indexedDB || (typeof indexedDB !== "undefined" ? indexedDB : null);
  if (!databaseApi) throw new Error("IndexedDB is unavailable for import cleanup.");
  return new Promise((resolve, reject) => {
    const request = databaseApi.deleteDatabase(shadow.name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Import cleanup failed."));
    request.onblocked = () => reject(new Error("Import cleanup is blocked by an open database."));
  });
}

// The commit boundary sets "ready" only after every batch and its derived
// statistics have been verified.
export async function activateReadyLearningDatabase(name, options = {}) {
  if (typeof name !== "string" || !SHADOW_NAME_PATTERN.test(name)) {
    throw new Error("Invalid learning database generation.");
  }
  const storage = options.storage || browserStorage();
  if (!storage) throw new Error("Local storage is unavailable.");
  const openDatabase = options.openDatabase || openLearningDatabasePrototype;
  const database = await openDatabase(Object.assign({}, options, { name }));
  let marker;
  try {
    const transaction = database.database.transaction("meta", "readonly");
    const completion = transactionResult(transaction);
    [marker] = await Promise.all([
      requestResult(transaction.objectStore("meta").get(IMPORT_GENERATION_META_KEY)),
      completion
    ]);
  } finally {
    database.close();
  }
  if (!marker || marker.state !== "ready") {
    throw new Error("The replacement database is not ready.");
  }
  if (typeof options.assertBeforeSwitch === "function") options.assertBeforeSwitch();
  // One localStorage key is the generation switch. Existing generations are
  // deliberately retained, so a failed switch cannot erase the old database.
  const previous = storage.getItem(ACTIVE_LEARNING_DATABASE_KEY);
  storage.setItem(ACTIVE_LEARNING_DATABASE_KEY, name);
  if (storage.getItem(ACTIVE_LEARNING_DATABASE_KEY) !== name) {
    if (previous === null) storage.removeItem(ACTIVE_LEARNING_DATABASE_KEY);
    else storage.setItem(ACTIVE_LEARNING_DATABASE_KEY, previous);
    throw new Error("The learning database switch could not be verified.");
  }
  return { previous: previous || LEGACY_LEARNING_DATABASE_NAME, active: name };
}
