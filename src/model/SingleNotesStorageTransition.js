import {
  ADAPTIVE_HISTORY_VERSION,
  normalizeAdaptiveHistory
} from "./AdaptiveHistory";

export const LEGACY_HISTORY_MODE_MIRROR = "mirror";
export const LEGACY_HISTORY_MODE_DATABASE_PRIMARY = "database-primary";
export const LEGACY_ADAPTIVE_HISTORY_STORAGE_KEYS = [
  "adaptiveHistory",
  "adaptiveHistoryMidi"
];

export const DEFAULT_LEGACY_HISTORY_MODE = (
  LEGACY_HISTORY_MODE_DATABASE_PRIMARY
);

export function getLegacyHistoryMode(options = {}) {
  const mode = options.legacyHistoryMode || DEFAULT_LEGACY_HISTORY_MODE;
  if (
    mode !== LEGACY_HISTORY_MODE_MIRROR
    && mode !== LEGACY_HISTORY_MODE_DATABASE_PRIMARY
  ) {
    throw new Error(`Unknown legacy history mode: ${mode}`);
  }
  return mode;
}

export function shouldWriteLegacyAdaptiveHistory(options = {}) {
  return options.writeHistory !== false
    && getLegacyHistoryMode(options) === LEGACY_HISTORY_MODE_MIRROR;
}

export function createBaselineOnlyAdaptiveHistory(history) {
  const normalized = normalizeAdaptiveHistory(history);
  return {
    version: ADAPTIVE_HISTORY_VERSION,
    baselines: normalized.baselines,
    evaluations: []
  };
}

export function shouldMigrateLegacyAdaptiveHistory(history, options = {}) {
  if (options.migrateHistory === false) {
    return false;
  }
  if (getLegacyHistoryMode(options) === LEGACY_HISTORY_MODE_MIRROR) {
    return true;
  }
  return normalizeAdaptiveHistory(history).evaluations.length > 0;
}

function writeStoredHistory(storage, key, history) {
  storage.setItem(key, JSON.stringify({ data: history }));
}

function restoreRawValues(storage, previousValues) {
  Object.keys(previousValues).forEach(key => {
    if (previousValues[key] === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, previousValues[key]);
    }
  });
}

export function compactStoredAdaptiveHistories(
  storage,
  histories,
  keys = LEGACY_ADAPTIVE_HISTORY_STORAGE_KEYS
) {
  const source = histories && typeof histories === "object"
    ? histories
    : {};
  const selectedKeys = keys.filter((key, index) => (
    LEGACY_ADAPTIVE_HISTORY_STORAGE_KEYS.indexOf(key) !== -1
      && keys.indexOf(key) === index
  ));
  const previousValues = selectedKeys.reduce((values, key) => {
    values[key] = storage.getItem(key);
    return values;
  }, Object.create(null));
  const compacted = selectedKeys.reduce((values, key) => {
    values[key] = createBaselineOnlyAdaptiveHistory(source[key]);
    return values;
  }, Object.create(null));
  try {
    selectedKeys.forEach(key => writeStoredHistory(
      storage,
      key,
      compacted[key]
    ));
    selectedKeys.forEach(key => {
      const stored = storage.getItem(key);
      const parsed = stored === null ? null : JSON.parse(stored);
      if (
        !parsed
        || JSON.stringify(parsed.data) !== JSON.stringify(compacted[key])
      ) {
        throw new Error(`Legacy history compaction failed for ${key}`);
      }
    });
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreRawValues(storage, previousValues);
    } catch (rollbackError) {
      rollbackSucceeded = false;
    }
    const compactionError = new Error(
      rollbackSucceeded
        ? `Legacy history compaction failed and was rolled back: ${error.message}`
        : `Legacy history compaction and rollback failed: ${error.message}`
    );
    compactionError.rollbackSucceeded = rollbackSucceeded;
    throw compactionError;
  }
  return {
    compacted: true,
    histories: compacted,
    removedEvaluations: selectedKeys.reduce((count, key) => (
      count + normalizeAdaptiveHistory(source[key]).evaluations.length
    ), 0)
  };
}

export default {
  LEGACY_HISTORY_MODE_MIRROR,
  LEGACY_HISTORY_MODE_DATABASE_PRIMARY,
  LEGACY_ADAPTIVE_HISTORY_STORAGE_KEYS,
  DEFAULT_LEGACY_HISTORY_MODE,
  getLegacyHistoryMode,
  shouldWriteLegacyAdaptiveHistory,
  createBaselineOnlyAdaptiveHistory,
  shouldMigrateLegacyAdaptiveHistory,
  compactStoredAdaptiveHistories
};
