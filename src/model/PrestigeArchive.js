import { PRESTIGE_ENTRY_STEP } from "./PrestigeProgress";

export const PRESTIGE_ARCHIVE_VERSION = 1;
export const PRESTIGE_ENTRY_SCOPES = Object.freeze([
  "singleNotesScreen", "singleNotesMidi", "freeRounds",
  "melodyRounds", "chordRounds", "rhythmBars"
]);
export const PRESTIGE_METRIC_FIELDS = Object.freeze([
  "roundCount", "durationTotalMs", "playedCount", "correctCount",
  "wrongCount", "missedCount", "firstTryCount"
]);
export const PRESTIGE_TIME_WINDOWS = Object.freeze([
  "00-04", "04-08", "08-12", "12-16", "16-20", "20-24"
]);

function nonNegative(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid prestige ${label}.`);
  }
  return value;
}

function add(left, right, label) {
  return nonNegative(left + right, label);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`Invalid prestige ${label}.`);
  }
}

function normalizeMetrics(value, label) {
  exactKeys(value, PRESTIGE_METRIC_FIELDS, label);
  return PRESTIGE_METRIC_FIELDS.reduce((result, key) => {
    result[key] = nonNegative(value[key], `${label}.${key}`);
    return result;
  }, {});
}

function normalizeSegment(segment) {
  if (!segment || typeof segment !== "object" || Array.isArray(segment)
    || typeof segment.id !== "string" || !segment.id
    || typeof segment.createdAt !== "string"
    || !Number.isFinite(Date.parse(segment.createdAt))) {
    throw new Error("Invalid prestige archive segment.");
  }
  const levels = nonNegative(segment.levels, "levels");
  if (levels < 1) throw new Error("A prestige archive segment must earn a level.");
  exactKeys(segment.entryCounts, PRESTIGE_ENTRY_SCOPES, "entry counts");
  exactKeys(segment.metrics, PRESTIGE_ENTRY_SCOPES, "metrics");
  exactKeys(segment.timeWindows, PRESTIGE_TIME_WINDOWS, "learning times");
  const entryCounts = {};
  const metrics = {};
  PRESTIGE_ENTRY_SCOPES.forEach(scope => {
    entryCounts[scope] = nonNegative(segment.entryCounts[scope], `${scope} entries`);
    metrics[scope] = normalizeMetrics(segment.metrics[scope], `${scope} metrics`);
  });
  const total = PRESTIGE_ENTRY_SCOPES.reduce(
    (sum, scope) => add(sum, entryCounts[scope], "entry total"), 0
  );
  if (total !== levels * PRESTIGE_ENTRY_STEP
    || !Number.isSafeInteger(levels * PRESTIGE_ENTRY_STEP)) {
    throw new Error("Prestige entries do not match the earned levels.");
  }
  const timeWindows = {};
  PRESTIGE_TIME_WINDOWS.forEach(window => {
    timeWindows[window] = normalizeMetrics(segment.timeWindows[window],
      `${window} learning time`);
  });
  return { id: segment.id, createdAt: segment.createdAt,
    levels, entryCounts, metrics, timeWindows };
}

export function createEmptyPrestigeArchive() {
  return { version: PRESTIGE_ARCHIVE_VERSION, segments: [] };
}

export function normalizePrestigeArchive(archive) {
  if (!archive || archive.version !== PRESTIGE_ARCHIVE_VERSION
    || !Array.isArray(archive.segments)) {
    throw new Error("Invalid prestige archive version.");
  }
  const ids = new Set();
  const segments = archive.segments.map(segment => {
    const normalized = normalizeSegment(segment);
    if (ids.has(normalized.id)) throw new Error("Duplicate prestige segment ID.");
    ids.add(normalized.id);
    return normalized;
  });
  return { version: PRESTIGE_ARCHIVE_VERSION, segments };
}

export function mergePrestigeArchives(current, incoming) {
  const result = normalizePrestigeArchive(current);
  const source = normalizePrestigeArchive(incoming);
  const byId = new Map(result.segments.map(segment => [segment.id, segment]));
  source.segments.forEach(segment => {
    const existing = byId.get(segment.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(segment)) {
        throw new Error("Conflicting prestige segment ID.");
      }
      return;
    }
    byId.set(segment.id, segment);
    result.segments.push(segment);
  });
  return result;
}

export function summarizePrestigeArchive(archive) {
  const segments = normalizePrestigeArchive(archive).segments;
  const summary = {
    prestige: 0,
    entryCounts: PRESTIGE_ENTRY_SCOPES.reduce((value, scope) => {
      value[scope] = 0;
      return value;
    }, {}),
    metrics: PRESTIGE_ENTRY_SCOPES.reduce((value, scope) => {
      value[scope] = PRESTIGE_METRIC_FIELDS.reduce((item, field) => {
        item[field] = 0;
        return item;
      }, {});
      return value;
    }, {}),
    timeWindows: PRESTIGE_TIME_WINDOWS.reduce((value, window) => {
      value[window] = PRESTIGE_METRIC_FIELDS.reduce((item, field) => {
        item[field] = 0;
        return item;
      }, {});
      return value;
    }, {})
  };
  segments.forEach(segment => {
    summary.prestige = add(summary.prestige, segment.levels, "level total");
    PRESTIGE_ENTRY_SCOPES.forEach(scope => {
      summary.entryCounts[scope] = add(summary.entryCounts[scope],
        segment.entryCounts[scope], `${scope} entry total`);
      PRESTIGE_METRIC_FIELDS.forEach(field => {
        summary.metrics[scope][field] = add(summary.metrics[scope][field],
          segment.metrics[scope][field], `${scope}.${field} total`);
      });
    });
    PRESTIGE_TIME_WINDOWS.forEach(window => {
      PRESTIGE_METRIC_FIELDS.forEach(field => {
        summary.timeWindows[window][field] = add(summary.timeWindows[window][field],
          segment.timeWindows[window][field], `${window}.${field} total`);
      });
    });
  });
  return summary;
}
