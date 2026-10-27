import {
  PRESTIGE_ENTRY_SCOPES, PRESTIGE_METRIC_FIELDS, PRESTIGE_TIME_WINDOWS,
  normalizePrestigeArchive
} from "./PrestigeArchive";
import { PRESTIGE_ENTRY_STEP } from "./PrestigeProgress";
import { isPrestigeEligible } from "./PrestigeEligibility";
import { readPrestigeEligibleCounts } from "./PrestigeEligibleCounts";

const SOURCES = Object.freeze([
  { scope: "singleNotesScreen", databaseScope: "screen:single-notes", kind: "attempt" },
  { scope: "singleNotesMidi", databaseScope: "midi:single-notes", kind: "attempt" },
  { scope: "melodyRounds", databaseScope: "screen:note-flow", kind: "round" },
  { scope: "melodyRounds", databaseScope: "midi:note-flow", kind: "round" },
  { scope: "chordRounds", databaseScope: "midi:note-flow-chords", kind: "round" },
  { scope: "rhythmBars", databaseScope: "rhythm:taktgefuehl", kind: "round" },
  { scope: "freeRounds", databaseScope: null, kind: "free" }
]);

function checkedInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid prestige ${label}.`);
  }
  return value;
}

function emptyMetrics() {
  return PRESTIGE_METRIC_FIELDS.reduce((value, key) => {
    value[key] = 0;
    return value;
  }, {});
}

function increment(metrics, field, amount) {
  metrics[field] = checkedInteger(metrics[field] + amount, `${field} total`);
}

function recordTime(record) {
  const timestamp = typeof record.completedAt === "number"
    ? record.completedAt : Date.parse(record.completedAt);
  if (!Number.isFinite(timestamp)) throw new Error("A prestige entry has no valid timestamp.");
  return timestamp;
}

function addRecord(segment, source, record) {
  increment(segment.entryCounts, source.scope, 1);
  const metrics = segment.metrics[source.scope];
  if (source.kind === "attempt") {
    const correct = record.correctFirstTry === true;
    increment(metrics, "playedCount", 1);
    increment(metrics, correct ? "correctCount" : "wrongCount", 1);
    if (correct) increment(metrics, "firstTryCount", 1);
    const duration = Number(record.responseTimeMs);
    if (Number.isSafeInteger(duration) && duration >= 0) {
      increment(metrics, "durationTotalMs", duration);
    }
    const hour = new Date(recordTime(record)).getHours();
    const window = PRESTIGE_TIME_WINDOWS[Math.floor(hour / 4)];
    const timeMetrics = segment.timeWindows[window];
    increment(timeMetrics, "playedCount", 1);
    increment(timeMetrics, correct ? "correctCount" : "wrongCount", 1);
    if (correct) increment(timeMetrics, "firstTryCount", 1);
    if (Number.isSafeInteger(duration) && duration >= 0) {
      increment(timeMetrics, "durationTotalMs", duration);
    }
    return;
  }
  if (source.kind === "free") {
    const correct = checkedInteger(Number(record.numCorrect || 0), "free correct score");
    const wrong = checkedInteger(Number(record.numWrong || 0), "free wrong score");
    const played = checkedInteger(Number(record.numAnswers || 0), "free played count");
    if (correct + wrong > played) throw new Error("Invalid free-round answer totals.");
    increment(metrics, "roundCount", 1);
    increment(metrics, "correctCount", correct);
    increment(metrics, "wrongCount", wrong);
    increment(metrics, "playedCount", played);
    return;
  }
  const score = record.score || {};
  const correct = checkedInteger(Number(score.correct || 0), "correct score");
  const wrong = checkedInteger(Number(score.wrong || 0), "wrong score");
  const missed = checkedInteger(Number(score.missed || 0), "missed score");
  increment(metrics, "roundCount", 1);
  increment(metrics, "correctCount", correct);
  increment(metrics, "wrongCount", wrong);
  increment(metrics, "missedCount", missed);
  increment(metrics, "playedCount", checkedInteger(correct + wrong + missed, "played count"));
  const duration = Number(record.durationMs);
  if (Number.isSafeInteger(duration) && duration >= 0) {
    increment(metrics, "durationTotalMs", duration);
  }
}

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("Prestige preparation was cancelled.");
  error.name = "AbortError";
  throw error;
}

// Bounded, read-only preview. Each source provides at most one 250-record
// database block; records are merged by completion time. A later commit must
// re-check the source and build an inactive database before deleting details.
export async function preparePrestigeArchivePreview(database, options = {}) {
  if (!database || typeof database.readStoredEntryCounts !== "function"
    || typeof database.readAttemptHistoryPage !== "function"
    || typeof database.readNoteFlowRoundsPage !== "function") {
    throw new TypeError("A learning database is required for prestige preparation.");
  }
  const shouldContinue = options.shouldContinue || (() => true);
  const onProgress = options.onProgress || (() => {});
  if (typeof shouldContinue !== "function" || typeof onProgress !== "function") {
    throw new TypeError("Invalid prestige preparation callbacks.");
  }
  const freeRounds = options.freeRounds || [];
  if (!Array.isArray(freeRounds)) throw new TypeError("Free training rounds must be an array.");
  const eligibility = await readPrestigeEligibleCounts(database, freeRounds,
    { shouldContinue });
  const counts = eligibility.physicalCounts;
  const eligibleCounts = eligibility.eligibleCounts;
  let total = 0;
  PRESTIGE_ENTRY_SCOPES.forEach(scope => {
    total = checkedInteger(total + checkedInteger(eligibleCounts[scope], scope), "entry total");
  });
  const available = Math.floor(total / PRESTIGE_ENTRY_STEP);
  if (available === 0) throw new Error("Prestige requires 100,000 detail entries.");
  const levels = options.levels === undefined ? available : options.levels;
  if (!Number.isSafeInteger(levels) || levels < 1 || levels > available) {
    throw new Error("Invalid number of prestige levels.");
  }
  const target = levels * PRESTIGE_ENTRY_STEP;
  const segment = {
    id: options.id || "prestige-preview",
    createdAt: options.createdAt || new Date().toISOString(),
    levels,
    entryCounts: PRESTIGE_ENTRY_SCOPES.reduce((value, scope) => {
      value[scope] = 0;
      return value;
    }, {}),
    metrics: PRESTIGE_ENTRY_SCOPES.reduce((value, scope) => {
      value[scope] = emptyMetrics();
      return value;
    }, {}),
    timeWindows: PRESTIGE_TIME_WINDOWS.reduce((value, window) => {
      value[window] = emptyMetrics();
      return value;
    }, {})
  };
  const sourceCounts = SOURCES.reduce((value, source) => {
    value[source.databaseScope || "freeRounds"] = 0;
    return value;
  }, {});
  const states = SOURCES.map(source => Object.assign({}, source, {
    records: [], index: 0, after: null, done: false,
    lastTime: -Infinity, freeOffset: 0
  }));
  async function head(state) {
    while (true) {
      while (state.index >= state.records.length && !state.done) {
        cancelled(shouldContinue);
        const page = state.kind === "free"
          ? { records: freeRounds.slice(state.freeOffset, state.freeOffset + 250),
            nextBlockNumber: state.freeOffset + 250,
            done: state.freeOffset + 250 >= freeRounds.length }
          : await (state.kind === "attempt"
            ? database.readAttemptHistoryPage(state.databaseScope, state.after, 1)
            : database.readNoteFlowRoundsPage(state.databaseScope, state.after, 1));
        if (!page || !Array.isArray(page.records) || page.records.length > 250
          || typeof page.done !== "boolean" || (!page.done && page.records.length === 0)) {
          throw new Error(`Invalid prestige page: ${state.scope}.`);
        }
        state.records = page.records;
        state.index = 0;
        state.done = page.done;
        state.after = page.nextBlockNumber;
        state.freeOffset += state.kind === "free" ? 250 : 0;
      }
      const record = state.records[state.index];
      if (!record) return null;
      const timestamp = recordTime(record);
      if (timestamp < state.lastTime) {
        throw new Error(`Prestige history is not chronological: ${state.scope}.`);
      }
      if (isPrestigeEligible(record)) return { record, timestamp };
      state.lastTime = timestamp;
      state.index += 1;
    }
  }
  const heads = await Promise.all(states.map(head));
  for (let processed = 0; processed < target; processed++) {
    cancelled(shouldContinue);
    let chosen = -1;
    for (let index = 0; index < heads.length; index++) {
      if (heads[index] && (chosen === -1
        || heads[index].timestamp < heads[chosen].timestamp)) chosen = index;
    }
    if (chosen < 0) throw new Error("Stored prestige counts exceed available records.");
    const state = states[chosen];
    const item = heads[chosen];
    addRecord(segment, state, item.record);
    sourceCounts[state.databaseScope || "freeRounds"] += 1;
    state.lastTime = item.timestamp;
    state.index += 1;
    heads[chosen] = await head(state);
    if ((processed + 1) % 1000 === 0 || processed + 1 === target) {
      onProgress(processed + 1, target);
    }
  }
  cancelled(shouldContinue);
  const after = await database.readStoredEntryCounts();
  PRESTIGE_ENTRY_SCOPES.filter(scope => scope !== "freeRounds").forEach(scope => {
    if (counts[scope] !== after[scope]) {
      throw new Error("Learning data changed during prestige preparation.");
    }
  });
  if (freeRounds.length !== counts.freeRounds) {
    throw new Error("Free training data changed during prestige preparation.");
  }
  normalizePrestigeArchive({ version: 1, segments: [segment] });
  return {
    segment, detailEntriesBefore: PRESTIGE_ENTRY_SCOPES.reduce(
      (sum, scope) => sum + counts[scope], 0),
    detailEntriesRemaining: PRESTIGE_ENTRY_SCOPES.reduce(
      (sum, scope) => sum + counts[scope], 0) - target,
    selectedEntries: target,
    currentCounts: counts,
    sourceCounts
  };
}
