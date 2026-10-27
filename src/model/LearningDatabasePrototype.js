import { isPrestigeEligible } from "./PrestigeEligibility";
import { DAILY_TASK_HISTORY_KEY, normalizeDailyTaskHistory } from "./DailyTaskHistoryData";
import {
  createEmptySingleNotesHistoryFingerprint,
  createSingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint,
  normalizeSingleNotesHistoryFingerprint
} from "./SingleNotesHistoryMigration.js";
import {
  createEmptyNoteFlowMeterStatistics,
  addNoteFlowRoundToMeterStatistics,
  hasNoteFlowMeterStatistics
} from "./NoteFlowMeterStatistics.js";

export const LEARNING_DATABASE_PROTOTYPE_VERSION = 2;
export const DEFAULT_ATTEMPT_BLOCK_SIZE = 250;
export const DEFAULT_ATTEMPT_BLOCK_BYTES = 64 * 1024;
export const TREND_SEGMENT_SIZE = 20;
export const SESSION_BLOCK_SIZE = 100;
export const NOTE_FLOW_ROUND_BLOCK_SIZE = 100;
export const TREND_BLOCK_SIZE = 100;
export const LEARNING_TIME_WINDOW_HOURS = 2;

export const LEARNING_DATABASE_STORES = Object.freeze({
  meta: "meta",
  activeSessions: "activeSessions",
  sessionBlocks: "sessionBlocks",
  noteFlowRoundBlocks: "noteFlowRoundBlocks",
  progress: "progress",
  attemptBlocks: "attemptBlocks",
  trendBlocks: "trendBlocks",
  timeBuckets: "timeBuckets",
  statistics: "statistics"
});

const STORE_NAMES = Object.keys(LEARNING_DATABASE_STORES).map(
  key => LEARNING_DATABASE_STORES[key]
);

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error("IndexedDB transaction was aborted")
    );
    transaction.onerror = () => {
      // The following abort event contains the authoritative transaction error.
    };
  });
}

function createStore(database, name, options) {
  if (!database.objectStoreNames.contains(name)) {
    return database.createObjectStore(name, options);
  }
  return null;
}

function createSchema(database) {
  const activeSessions = createStore(database, LEARNING_DATABASE_STORES.activeSessions, {
    keyPath: "id"
  });
  if (activeSessions) {
    activeSessions.createIndex("byScope", "scope", { unique: false });
  }

  const sessionBlocks = createStore(database, LEARNING_DATABASE_STORES.sessionBlocks, {
    keyPath: "id"
  });
  if (sessionBlocks) {
    sessionBlocks.createIndex("byScope", "scope", { unique: false });
    sessionBlocks.createIndex("byScopeAndNumber", ["scope", "blockNumber"], {
      unique: true
    });
  }

  const noteFlowRounds = createStore(
    database,
    LEARNING_DATABASE_STORES.noteFlowRoundBlocks,
    { keyPath: "id" }
  );
  if (noteFlowRounds) {
    noteFlowRounds.createIndex("byScope", "scope", { unique: false });
    noteFlowRounds.createIndex("byScopeAndNumber", ["scope", "blockNumber"], {
      unique: true
    });
  }

  const progress = createStore(database, LEARNING_DATABASE_STORES.progress, {
    keyPath: "id"
  });
  if (progress) {
    progress.createIndex("byScope", "scope", { unique: false });
  }

  const blocks = createStore(database, LEARNING_DATABASE_STORES.attemptBlocks, {
    keyPath: "id"
  });
  if (blocks) {
    blocks.createIndex("byScope", "scope", { unique: false });
    blocks.createIndex("byScopeAndNumber", ["scope", "blockNumber"], {
      unique: true
    });
  }

  const trends = createStore(database, LEARNING_DATABASE_STORES.trendBlocks, {
    keyPath: "id"
  });
  if (trends) {
    trends.createIndex("byScope", "scope", { unique: false });
    trends.createIndex("byScopeAndNumber", ["scope", "blockNumber"], {
      unique: true
    });
  }

  const buckets = createStore(database, LEARNING_DATABASE_STORES.timeBuckets, {
    keyPath: "id"
  });
  if (buckets) {
    buckets.createIndex("byScope", "scope", { unique: false });
    buckets.createIndex("byScopeAndDay", ["scope", "day"], { unique: true });
  }

  createStore(database, LEARNING_DATABASE_STORES.meta, { keyPath: "key" });
  createStore(database, LEARNING_DATABASE_STORES.statistics, { keyPath: "scope" });
}

export function normalizeAttemptBlockPolicy(policy = {}) {
  const requestedSize = Number(policy.maxAttempts);
  const requestedBytes = Number(policy.maxBytes);
  return {
    maxAttempts: Number.isInteger(requestedSize) && requestedSize > 0
      ? requestedSize
      : DEFAULT_ATTEMPT_BLOCK_SIZE,
    maxBytes: Number.isInteger(requestedBytes) && requestedBytes > 0
      ? requestedBytes
      : DEFAULT_ATTEMPT_BLOCK_BYTES
  };
}

export function serializedByteLength(value) {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).length;
  }
  return unescape(encodeURIComponent(serialized)).length;
}

export function shouldStartNewAttemptBlock(block, attemptBytes, policy = {}) {
  const normalizedPolicy = normalizeAttemptBlockPolicy(policy);
  if (!block || block.count === 0) {
    return false;
  }
  return block.count >= normalizedPolicy.maxAttempts ||
    block.payloadBytes + attemptBytes > normalizedPolicy.maxBytes;
}

export function packAttemptsIntoBlocks(attempts, options = {}) {
  const policy = normalizeAttemptBlockPolicy(options);
  const scope = options.scope || "screen:single-notes";
  const blocks = [];
  let block = null;

  attempts.forEach((attempt, sequence) => {
    const normalized = normalizedAttempt(
      attempt,
      Number.isInteger(attempt.sequence) ? attempt.sequence : sequence
    );
    let compactAttempt = block
      ? prepareCompactAttempt(block, normalized)
      : null;
    if (!block || shouldStartNewAttemptBlock(
      block,
      compactAttempt.payloadBytes,
      policy
    )) {
      block = createEmptyBlock(
        scope,
        blocks.length,
        normalized.sequence,
        normalized.completedAt
      );
      blocks.push(block);
      compactAttempt = prepareCompactAttempt(block, normalized);
    }
    appendCompactAttemptToBlock(block, normalized, compactAttempt);
  });

  return blocks;
}

function createEmptyBlock(scope, blockNumber, firstSequence, startedAt) {
  return {
    id: `${scope}|block|${blockNumber}`,
    scope,
    blockNumber,
    firstSequence,
    lastSequence: firstSequence,
    startedAt,
    count: 0,
    payloadBytes: 0,
    sessionIds: [],
    noteKeys: [],
    attemptIds: [],
    staffs: [],
    attempts: []
  };
}

function prepareCompactAttempt(block, attempt) {
  let sessionIndex = block.sessionIds.indexOf(attempt.sessionId);
  let noteIndex = block.noteKeys.indexOf(attempt.noteKey);
  let attemptIndex = block.attemptIds.indexOf(attempt.id);
  let staffIndex = block.staffs.indexOf(attempt.staff);
  const newSessionId = sessionIndex === -1 ? attempt.sessionId : null;
  const newNoteKey = noteIndex === -1 ? attempt.noteKey : null;
  const newAttemptId = attemptIndex === -1 ? attempt.id : null;
  const newStaff = staffIndex === -1 ? attempt.staff : null;
  if (newSessionId !== null) {
    sessionIndex = block.sessionIds.length;
  }
  if (newNoteKey !== null) {
    noteIndex = block.noteKeys.length;
  }
  if (newAttemptId !== null) {
    attemptIndex = block.attemptIds.length;
  }
  if (newStaff !== null) {
    staffIndex = block.staffs.length;
  }
  const tuple = [
    attempt.sequence - block.firstSequence,
    sessionIndex,
    noteIndex,
    attempt.completedAt - block.startedAt,
    attempt.correctFirstTry ? 1 : 0,
    attempt.mistakeCount,
    attempt.responseTimeMs,
    attemptIndex,
    staffIndex
  ];
  // Old nine-field tuples remain valid; only imported records need an extra bit.
  if (!isPrestigeEligible(attempt)) tuple.push(0);
  return {
    tuple,
    newSessionId,
    newNoteKey,
    newAttemptId,
    newStaff,
    payloadBytes: serializedByteLength(tuple) +
      (newSessionId === null ? 0 : serializedByteLength(newSessionId)) +
      (newNoteKey === null ? 0 : serializedByteLength(newNoteKey)) +
      (newAttemptId === null ? 0 : serializedByteLength(newAttemptId)) +
      (newStaff === null ? 0 : serializedByteLength(newStaff))
  };
}

function appendCompactAttemptToBlock(block, attempt, compactAttempt) {
  if (compactAttempt.newSessionId !== null) {
    block.sessionIds.push(compactAttempt.newSessionId);
  }
  if (compactAttempt.newNoteKey !== null) {
    block.noteKeys.push(compactAttempt.newNoteKey);
  }
  if (compactAttempt.newAttemptId !== null) {
    block.attemptIds.push(compactAttempt.newAttemptId);
  }
  if (compactAttempt.newStaff !== null) {
    block.staffs.push(compactAttempt.newStaff);
  }
  block.attempts.push(compactAttempt.tuple);
  block.count += 1;
  block.lastSequence = attempt.sequence;
  block.payloadBytes += compactAttempt.payloadBytes;
  return block;
}

export function expandAttemptBlock(block) {
  return block.attempts.map(tuple => {
    const attempt = {
      id: Array.isArray(block.attemptIds)
        ? block.attemptIds[tuple[7]]
        : `${block.scope}|attempt|${block.firstSequence + tuple[0]}`,
      sessionId: block.sessionIds[tuple[1]],
      scope: block.scope,
      noteKey: block.noteKeys[tuple[2]],
      staff: Array.isArray(block.staffs)
        ? block.staffs[tuple[8]]
        : String(block.noteKeys[tuple[2]] || "").split(":")[0],
      completedAt: block.startedAt + tuple[3],
      correctFirstTry: tuple[4] === 1,
      mistakeCount: tuple[5],
      responseTimeMs: tuple[6],
      sequence: block.firstSequence + tuple[0]
    };
    if (tuple[9] === 0) attempt.prestigeEligible = false;
    return attempt;
  });
}

function normalizedAttempt(attempt, sequence) {
  if (!attempt || typeof attempt !== "object") {
    throw new TypeError("A learning attempt is required");
  }
  if (!attempt.scope || !attempt.sessionId || !attempt.noteKey) {
    throw new TypeError("scope, sessionId and noteKey are required");
  }
  const completedAt = Number(attempt.completedAt);
  const hasResponseTime = attempt.responseTimeMs !== null
    && attempt.responseTimeMs !== undefined;
  const responseTimeMs = hasResponseTime
    ? Number(attempt.responseTimeMs)
    : null;
  const normalized = {
    id: attempt.id || `${attempt.scope}|attempt|${sequence}`,
    sessionId: String(attempt.sessionId),
    scope: String(attempt.scope),
    noteKey: String(attempt.noteKey),
    staff: typeof attempt.staff === "string" && attempt.staff.length > 0
      ? attempt.staff
      : String(attempt.noteKey).split(":")[0],
    completedAt: Number.isFinite(completedAt) ? completedAt : Date.now(),
    correctFirstTry: attempt.correctFirstTry === true,
    mistakeCount: Math.max(0, Number(attempt.mistakeCount) || 0),
    responseTimeMs: responseTimeMs === null
      ? null
      : Math.max(0, Number.isFinite(responseTimeMs) ? responseTimeMs : 0),
    sequence
  };
  if (!isPrestigeEligible(attempt)) normalized.prestigeEligible = false;
  return normalized;
}

function abortTransaction(transaction, completion, error) {
  try {
    transaction.abort();
  } catch (abortError) {
    // The transaction may already have aborted because an IndexedDB request failed.
  }
  return completion.catch(() => {}).then(() => {
    throw error;
  });
}

function dayKey(timestamp) {
  const date = new Date(timestamp);
  const pad = value => (`0${value}`).slice(-2);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

function timeWindowStartHour(timestamp, hours = LEARNING_TIME_WINDOW_HOURS) {
  const hour = new Date(timestamp).getHours();
  return Math.floor(hour / hours) * hours;
}

function progressId(scope, noteKey) {
  return `${scope}|note|${noteKey}`;
}

function progressSnapshotId(scope) {
  return `progress-snapshot|${scope}`;
}

function trendBlockId(scope, blockNumber) {
  return `${scope}|trend-block|${blockNumber}`;
}

function bucketId(scope, day) {
  return `${scope}|day|${day}`;
}

function writerId(scope) {
  return `writer|${scope}`;
}

function historyMigrationId(scope) {
  return `history-migration|${scope}`;
}

function sessionBlockId(scope, blockNumber) {
  return `${scope}|session-block|${blockNumber}`;
}

function createSession(attempt) {
  return {
    id: attempt.sessionId,
    scope: attempt.scope,
    startedAt: attempt.completedAt,
    endedAt: attempt.completedAt,
    completed: false,
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0
  };
}

function addAttemptToAggregate(record, attempt) {
  record.attemptCount += 1;
  record.correctFirstTryCount += attempt.correctFirstTry ? 1 : 0;
  record.mistakeCount += attempt.mistakeCount;
  record.responseTimeTotalMs += attempt.responseTimeMs;
  record.timedAttemptCount = Math.max(
    0,
    Number(record.timedAttemptCount) || 0
  ) + (
    Number.isFinite(attempt.responseTimeMs) && attempt.responseTimeMs > 0
      ? 1
      : 0
  );
  return record;
}

function createProgress(attempt) {
  return {
    id: progressId(attempt.scope, attempt.noteKey),
    scope: attempt.scope,
    noteKey: attempt.noteKey,
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0,
    lastCompletedAt: attempt.completedAt
  };
}

function createStatistics(scope) {
  return {
    scope,
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0,
    sessionCount: 0,
    lastCompletedAt: 0
  };
}

function createNoteFlowStatistics(scope) {
  return {
    scope,
    kind: "note-flow",
    roundCount: 0,
    normalRoundCount: 0,
    learningRoundCount: 0,
    evaluatedNoteCount: 0,
    correctCount: 0,
    wrongCount: 0,
    missedCount: 0,
    preciseCount: 0,
    earlyCount: 0,
    lateCount: 0,
    timingOffsetTotalMs: 0,
    timedInputCount: 0,
    durationTotalMs: 0,
    lastCompletedAt: 0,
    rhythmByMeter: createEmptyNoteFlowMeterStatistics(),
    chordMeterVersion: scope === "midi:note-flow-chords" ? 1 : undefined
  };
}

function addNoteFlowRoundToStatistics(statistics, result) {
  const score = result.score || {};
  const timing = result.timing || {};
  const evaluatedNotes = Math.max(
    0,
    Number(score.evaluatedInputs)
      || Number(score.correct || 0) + Number(score.wrong || 0)
        + Number(score.missed || 0)
  );
  const timedInputs = Math.max(
    0,
    Number(timing.evaluatedInputs)
      || Number(timing.precise || 0) + Number(timing.early || 0)
        + Number(timing.late || 0)
  );
  const timingOffset = Number.isFinite(Number(timing.totalAbsoluteOffsetMs))
    ? Math.max(0, Number(timing.totalAbsoluteOffsetMs))
    : Math.max(0, Number(timing.averageAbsoluteOffsetMs) || 0) * timedInputs;
  statistics.roundCount += 1;
  if (result.mode === "learning") {
    statistics.learningRoundCount += 1;
  } else {
    statistics.normalRoundCount += 1;
  }
  statistics.evaluatedNoteCount += evaluatedNotes;
  statistics.correctCount += Math.max(0, Number(score.correct) || 0);
  statistics.wrongCount += Math.max(0, Number(score.wrong) || 0);
  statistics.missedCount += Math.max(0, Number(score.missed) || 0);
  statistics.preciseCount += Math.max(0, Number(timing.precise) || 0);
  statistics.earlyCount += Math.max(0, Number(timing.early) || 0);
  statistics.lateCount += Math.max(0, Number(timing.late) || 0);
  statistics.timingOffsetTotalMs += timingOffset;
  statistics.timedInputCount += timedInputs;
  statistics.durationTotalMs += Math.max(0, Number(result.durationMs) || 0);
  statistics.lastCompletedAt = Date.parse(result.completedAt) || Date.now();
  addNoteFlowRoundToMeterStatistics(statistics.rhythmByMeter, result);
  return statistics;
}

function addStoredMeterStatistics(statistics, blocks) {
  statistics.rhythmByMeter = createEmptyNoteFlowMeterStatistics();
  blocks.forEach(block => expandNoteFlowRoundBlock(block).forEach(result => (
    addNoteFlowRoundToMeterStatistics(statistics.rhythmByMeter, result)
  )));
  if (statistics.scope === "midi:note-flow-chords") statistics.chordMeterVersion = 1;
  return statistics;
}

function createSessionBlock(scope, blockNumber, startedAt) {
  return {
    id: sessionBlockId(scope, blockNumber),
    scope,
    blockNumber,
    startedAt,
    count: 0,
    sessions: []
  };
}

function appendSessionToBlock(block, session) {
  block.sessions.push([
    session.id,
    session.startedAt - block.startedAt,
    session.endedAt - block.startedAt,
    session.attemptCount,
    session.correctFirstTryCount,
    session.mistakeCount,
    session.responseTimeTotalMs,
    session.timedAttemptCount
  ]);
  block.count += 1;
  return block;
}

function expandSessionBlock(block) {
  return block.sessions.map(tuple => ({
    id: tuple[0],
    scope: block.scope,
    startedAt: block.startedAt + tuple[1],
    endedAt: block.startedAt + tuple[2],
    completed: true,
    attemptCount: tuple[3],
    correctFirstTryCount: tuple[4],
    mistakeCount: tuple[5],
    responseTimeTotalMs: tuple[6],
    timedAttemptCount: Number(tuple[7]) || 0
  }));
}

function noteFlowRoundBlockId(scope, blockNumber) {
  return `${scope}|note-flow-round-block|${blockNumber}`;
}

function noteFlowRoundWriterId(scope) {
  return `note-flow-round-writer|${scope}`;
}

function createNoteFlowRoundBlock(scope, blockNumber, startedAt) {
  return {
    id: noteFlowRoundBlockId(scope, blockNumber),
    scope,
    blockNumber,
    startedAt,
    endedAt: startedAt,
    count: 0,
    rounds: []
  };
}

function cloneNoteFlowRound(result) {
  if (!result || typeof result !== "object") {
    throw new TypeError("A Note Flow round result is required");
  }
  if (typeof result.id !== "string" || result.id.length === 0) {
    throw new TypeError("A Note Flow round result id is required");
  }
  return JSON.parse(JSON.stringify(result));
}

export function appendNoteFlowRoundToBlock(block, rawResult) {
  const result = cloneNoteFlowRound(rawResult);
  block.rounds.push(result);
  block.count = block.rounds.length;
  block.endedAt = Date.parse(result.completedAt) || block.endedAt;
  return block;
}

export function expandNoteFlowRoundBlock(block) {
  return (block && Array.isArray(block.rounds) ? block.rounds : [])
    .map(cloneNoteFlowRound);
}

export function packNoteFlowRoundsIntoBlocks(rounds, options = {}) {
  const scope = String(options.scope || "screen:note-flow");
  const blockSize = Math.max(
    1,
    Math.floor(Number(options.blockSize) || NOTE_FLOW_ROUND_BLOCK_SIZE)
  );
  const blocks = [];
  let block = null;
  (Array.isArray(rounds) ? rounds : []).forEach(rawResult => {
    const result = cloneNoteFlowRound(rawResult);
    if (!block || block.count >= blockSize) {
      const startedAt = Date.parse(result.startedAt || result.completedAt)
        || Date.now();
      block = createNoteFlowRoundBlock(scope, blocks.length, startedAt);
      blocks.push(block);
    }
    appendNoteFlowRoundToBlock(block, result);
  });
  return blocks;
}

function createTrendBlock(scope, blockNumber, startedAt) {
  return {
    id: trendBlockId(scope, blockNumber),
    scope,
    blockNumber,
    startedAt,
    count: 0,
    segments: []
  };
}

function addAttemptToTrendBlock(block, attempt, segmentNumber) {
  const segmentOffset = segmentNumber - block.blockNumber * TREND_BLOCK_SIZE;
  let segment = block.segments[block.segments.length - 1];
  if (!segment || segment[0] !== segmentOffset) {
    segment = [
      segmentOffset,
      attempt.completedAt - block.startedAt,
      attempt.completedAt - block.startedAt,
      0,
      0,
      0,
      0,
      0
    ];
    block.segments.push(segment);
    block.count += 1;
  }
  segment[2] = attempt.completedAt - block.startedAt;
  segment[3] += 1;
  segment[4] += attempt.correctFirstTry ? 1 : 0;
  segment[5] += attempt.mistakeCount;
  segment[6] += attempt.responseTimeMs;
  segment[7] += Number.isFinite(attempt.responseTimeMs)
    && attempt.responseTimeMs > 0
    ? 1
    : 0;
  return block;
}

function expandTrendBlock(block) {
  return block.segments.map(tuple => ({
    id: `${block.scope}|trend|${block.blockNumber * TREND_BLOCK_SIZE + tuple[0]}`,
    scope: block.scope,
    segmentNumber: block.blockNumber * TREND_BLOCK_SIZE + tuple[0],
    startedAt: block.startedAt + tuple[1],
    endedAt: block.startedAt + tuple[2],
    attemptCount: tuple[3],
    correctFirstTryCount: tuple[4],
    mistakeCount: tuple[5],
    responseTimeTotalMs: tuple[6],
    timedAttemptCount: Number(tuple[7]) || 0
  }));
}

function createTimeBucket(attempt, day) {
  return {
    id: bucketId(attempt.scope, day),
    scope: attempt.scope,
    day,
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0,
    windowHours: LEARNING_TIME_WINDOW_HOURS,
    windows: {}
  };
}

function addAttemptToTimeWindow(bucket, attempt) {
  if (!bucket.windows || typeof bucket.windows !== "object") {
    bucket.windows = {};
  }
  // Existing four-hour summaries stay coherent until readTimeBuckets rebuilds them.
  const startHour = timeWindowStartHour(attempt.completedAt, bucket.windowHours || 4);
  const key = String(startHour);
  const window = bucket.windows[key] || {
    startHour,
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0
  };
  addAttemptToAggregate(window, attempt);
  bucket.windows[key] = window;
  return bucket;
}

function buildAttemptHistoryRecords(scope, rawAttempts, sessionCount, policy) {
  const attempts = (Array.isArray(rawAttempts) ? rawAttempts : [])
    .map((attempt, sequence) => normalizedAttempt(
      Object.assign({}, attempt, { scope }),
      sequence
    ))
    .sort((left, right) => (
      left.completedAt - right.completedAt || left.id.localeCompare(right.id)
    ))
    .map((attempt, sequence) => Object.assign({}, attempt, { sequence }));
  const attemptBlocks = packAttemptsIntoBlocks(attempts, Object.assign(
    { scope },
    policy
  ));
  const statistics = createStatistics(scope);
  const timeBuckets = new Map();
  const trendBlocks = [];
  let trendBlock = null;

  attempts.forEach(attempt => {
    addAttemptToAggregate(statistics, attempt);
    statistics.lastCompletedAt = Math.max(
      statistics.lastCompletedAt,
      attempt.completedAt
    );

    const segmentNumber = Math.floor(attempt.sequence / TREND_SEGMENT_SIZE);
    const trendBlockNumber = Math.floor(segmentNumber / TREND_BLOCK_SIZE);
    if (!trendBlock || trendBlock.blockNumber !== trendBlockNumber) {
      trendBlock = createTrendBlock(
        scope,
        trendBlockNumber,
        attempt.completedAt
      );
      trendBlocks.push(trendBlock);
    }
    addAttemptToTrendBlock(trendBlock, attempt, segmentNumber);

    const day = dayKey(attempt.completedAt);
    const bucket = timeBuckets.get(day) || createTimeBucket(attempt, day);
    addAttemptToAggregate(bucket, attempt);
    addAttemptToTimeWindow(bucket, attempt);
    timeBuckets.set(day, bucket);
  });

  statistics.sessionCount = Math.max(0, Number(sessionCount) || 0);
  return {
    attempts,
    attemptBlocks,
    trendBlocks,
    timeBuckets: Array.from(timeBuckets.values()),
    statistics,
    fingerprint: createSingleNotesHistoryFingerprint(attempts)
  };
}

function uniqueStoredSessionCount(sessionBlocks, activeSessions) {
  const ids = Object.create(null);
  (Array.isArray(sessionBlocks) ? sessionBlocks : []).forEach(block => {
    expandSessionBlock(block).forEach(session => {
      ids[session.id] = true;
    });
  });
  (Array.isArray(activeSessions) ? activeSessions : []).forEach(session => {
    if (session && session.id) {
      ids[session.id] = true;
    }
  });
  return Object.keys(ids).length;
}

function cursorValues(index, range, direction, limit) {
  return new Promise((resolve, reject) => {
    const values = [];
    const request = index.openCursor(range, direction);
    request.onerror = () => reject(request.error || new Error("Cursor failed"));
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor || values.length >= limit) {
        resolve(values);
        return;
      }
      values.push(cursor.value);
      cursor.continue();
    };
  });
}

function readScopedBlockPage(database, keyRange, storeName, scope,
  afterBlockNumber, limit, expand) {
  if (!keyRange) return Promise.reject(new Error("IDBKeyRange is not available"));
  if (typeof scope !== "string" || !scope
    || (afterBlockNumber !== null && (!Number.isSafeInteger(afterBlockNumber)
      || afterBlockNumber < 0 || afterBlockNumber >= Number.MAX_SAFE_INTEGER))
    || !Number.isInteger(limit) || limit < 1 || limit > 8) {
    return Promise.reject(new RangeError("Invalid learning history page."));
  }
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionResult(transaction);
  const range = keyRange.bound(
    [scope, afterBlockNumber === null ? 0 : afterBlockNumber + 1],
    [scope, Number.MAX_SAFE_INTEGER]
  );
  return requestResult(transaction.objectStore(storeName)
    .index("byScopeAndNumber").getAll(range, limit))
    .then(blocks => completion.then(() => {
      const records = [];
      blocks.forEach(block => {
        const expanded = expand(block);
        if (block.scope !== scope || !Number.isSafeInteger(block.blockNumber)
          || block.count !== expanded.length) {
          throw new Error("Learning history page has an inconsistent block.");
        }
        records.push(...expanded);
      });
      return {
        records,
        nextBlockNumber: blocks.length
          ? blocks[blocks.length - 1].blockNumber : afterBlockNumber,
        done: blocks.length < limit
      };
    }));
}

function deleteIndexedScope(transaction, storeName, scope) {
  return new Promise((resolve, reject) => {
    const index = transaction.objectStore(storeName).index("byScope");
    const request = index.openCursor(scope);
    request.onerror = () => reject(
      request.error || new Error(`Cannot clear ${storeName}`)
    );
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
  });
}

function createStoredProgressRecord(scope, record, progressVersion) {
  const learningRecord = record.learningRecord;
  const averageResponseTimeMs = Number(learningRecord.averageResponseTimeMs);
  const timedAttempts = Math.max(0, Number(learningRecord.timedAttempts) || 0);
  return {
    id: progressId(scope, record.noteKey),
    scope,
    noteKey: record.noteKey,
    attemptCount: Math.max(0, Number(learningRecord.attempts) || 0),
    correctFirstTryCount: Math.max(
      0,
      Number(learningRecord.correctFirstTry) || 0
    ),
    mistakeCount: Math.max(0, Number(learningRecord.totalMistakes) || 0),
    responseTimeTotalMs: Number.isFinite(averageResponseTimeMs)
      ? Math.max(0, averageResponseTimeMs) * timedAttempts
      : 0,
    timedAttemptCount: timedAttempts,
    lastCompletedAt: 0,
    learningRecord,
    progressVersion,
    snapshotOnly: true
  };
}

function uniqueAttemptSessionCount(attempts) {
  const sessions = Object.create(null);
  attempts.forEach(attempt => {
    if (attempt && attempt.sessionId) {
      sessions[attempt.sessionId] = true;
    }
  });
  return Object.keys(sessions).length;
}

export function openLearningDatabasePrototype(options = {}) {
  const indexedDb = options.indexedDB || (
    typeof indexedDB !== "undefined" ? indexedDB : null
  );
  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  const name = options.name || "noten-pfoten-learning-prototype";
  const request = indexedDb.open(name, LEARNING_DATABASE_PROTOTYPE_VERSION);
  request.onupgradeneeded = event => createSchema(event.target.result);
  return requestResult(request).then(database => new LearningDatabasePrototype(
    database,
    Object.assign({}, options, { indexedDB: indexedDb, name })
  ));
}

export function deleteLearningDatabasePrototype(options = {}) {
  const indexedDb = options.indexedDB || (
    typeof indexedDB !== "undefined" ? indexedDB : null
  );
  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  const name = options.name || "noten-pfoten-learning-prototype";
  return requestResult(indexedDb.deleteDatabase(name));
}

export class LearningDatabasePrototype {
  constructor(database, options = {}) {
    this.database = database;
    this.indexedDB = options.indexedDB;
    this.keyRange = options.IDBKeyRange || (
      typeof IDBKeyRange !== "undefined" ? IDBKeyRange : null
    );
    this.name = options.name || database.name;
    this.blockPolicy = normalizeAttemptBlockPolicy(options.blockPolicy);
  }

  close() {
    this.database.close();
  }

  clear() {
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const completion = transactionResult(transaction);
    STORE_NAMES.forEach(name => transaction.objectStore(name).clear());
    return completion;
  }

  clearScope(scope) {
    const stores = LEARNING_DATABASE_STORES;
    const indexedStores = [
      stores.activeSessions,
      stores.sessionBlocks,
      stores.noteFlowRoundBlocks,
      stores.progress,
      stores.attemptBlocks,
      stores.trendBlocks,
      stores.timeBuckets
    ];
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const completion = transactionResult(transaction);
    const operation = Promise.all(indexedStores.map(name => (
      requestResult(transaction.objectStore(name).index("byScope").getAll(scope))
    )).concat([
      requestResult(transaction.objectStore(stores.meta).getAll()),
      requestResult(transaction.objectStore(stores.statistics).get(scope))
    ])).then(values => {
      indexedStores.forEach((name, index) => {
        const store = transaction.objectStore(name);
        values[index].forEach(record => store.delete(record.id));
      });
      const metaRecords = values[indexedStores.length];
      const metaStore = transaction.objectStore(stores.meta);
      metaRecords
        .filter(record => record && record.scope === scope)
        .forEach(record => metaStore.delete(record.key));
      if (values[indexedStores.length + 1]) {
        transaction.objectStore(stores.statistics).delete(scope);
      }
    });
    return operation.then(
      () => completion,
      error => abortTransaction(transaction, completion, error)
    );
  }

  synchronizeProgressSnapshot(scope, snapshot, options = {}) {
    if (options.requireImportGeneration
      && !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Progress import requires a shadow database."));
    }
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.progress,
      stores.meta
    ], "readwrite");
    const completion = transactionResult(transaction);
    const progressStore = transaction.objectStore(stores.progress);
    const metaStore = transaction.objectStore(stores.meta);
    const snapshotKey = progressSnapshotId(scope);
    const records = Array.isArray(snapshot.records) ? snapshot.records : [];
    const operation = Promise.all([
      requestResult(progressStore.index("byScope").getAll(scope)),
      requestResult(metaStore.get(snapshotKey)),
      options.requireImportGeneration
        ? requestResult(metaStore.get("backup-import-generation"))
        : Promise.resolve(null)
    ]).then(values => {
      const existingRecords = values[0];
      const existingSnapshot = values[1];
      if (options.requireImportGeneration
        && (!values[2] || values[2].state !== "preparing")) {
        throw new Error("The shadow database is not preparing an import.");
      }
      if (
        existingSnapshot
        && existingSnapshot.signature === snapshot.signature
        && existingSnapshot.progressVersion === snapshot.progressVersion
      ) {
        return {
          records: existingRecords,
          synchronized: false
        };
      }

      existingRecords.forEach(record => progressStore.delete(record.id));
      const storedRecords = records.map(record => {
        const storedRecord = createStoredProgressRecord(
          scope,
          record,
          snapshot.progressVersion
        );
        progressStore.put(storedRecord);
        return storedRecord;
      });
      metaStore.put({
        key: snapshotKey,
        scope,
        signature: snapshot.signature,
        progressVersion: snapshot.progressVersion,
        syncedAt: Date.now()
      });
      return {
        records: storedRecords,
        synchronized: true
      };
    });
    return operation.then(
      result => completion.then(() => result),
      error => abortTransaction(transaction, completion, error)
    );
  }

  replaceSingleNotesBackup(replacements, noteFlowRounds = null, rhythmSenseBars = null, dailyTaskHistory = undefined) {
    const dailyHistory = normalizeDailyTaskHistory(dailyTaskHistory);
    const values = Array.isArray(replacements) ? replacements : [];
    const scopes = Object.create(null);
    const prepared = values.map(replacement => {
      const scope = String(replacement && replacement.scope || "");
      if (!scope || scopes[scope]) {
        throw new Error("A backup replacement needs unique scopes");
      }
      scopes[scope] = true;
      const progressSnapshot = replacement.progressSnapshot || {};
      const migration = replacement.migration || {};
      const records = buildAttemptHistoryRecords(
        scope,
        replacement.attempts,
        uniqueAttemptSessionCount(replacement.attempts || []),
        this.blockPolicy
      );
      return {
        scope,
        progressSnapshot,
        migration,
        records,
        progressRecords: (progressSnapshot.records || []).map(record => (
          createStoredProgressRecord(
            scope,
            record,
            progressSnapshot.progressVersion
          )
        ))
      };
    });
    if (prepared.length === 0) {
      return Promise.reject(new Error("A backup replacement is required"));
    }

    const noteFlowReplacements = noteFlowRounds === null ? [] : [
      { scope: "screen:note-flow", rounds: noteFlowRounds.screen },
      { scope: "midi:note-flow", rounds: noteFlowRounds.midi },
      { scope: "midi:note-flow-chords", rounds: noteFlowRounds.chordMidi || [] }
    ].map(replacement => {
      if (!Array.isArray(replacement.rounds)) {
        throw new Error("A Note Flow backup needs both input groups");
      }
      const blocks = packNoteFlowRoundsIntoBlocks(replacement.rounds, {
        scope: replacement.scope
      });
      const statistics = replacement.rounds.reduce(
        (summary, round) => addNoteFlowRoundToStatistics(summary, round),
        createNoteFlowStatistics(replacement.scope)
      );
      return { scope: replacement.scope, blocks, statistics };
    });
    if (rhythmSenseBars !== null) {
      if (!Array.isArray(rhythmSenseBars)) {
        throw new Error("A Rhythm Sense backup needs a list of bars");
      }
      const scope = "rhythm:taktgefuehl";
      const blocks = packNoteFlowRoundsIntoBlocks(rhythmSenseBars, { scope });
      const statistics = rhythmSenseBars.reduce(
        (summary, bar) => addNoteFlowRoundToStatistics(summary, bar),
        createNoteFlowStatistics(scope)
      );
      noteFlowReplacements.push({ scope, blocks, statistics });
    }

    const stores = LEARNING_DATABASE_STORES;
    const indexedStores = [
      stores.activeSessions,
      stores.sessionBlocks,
      stores.noteFlowRoundBlocks,
      stores.progress,
      stores.attemptBlocks,
      stores.trendBlocks,
      stores.timeBuckets
    ];
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const completion = transactionResult(transaction);
    const noteFlowDeletes = noteFlowReplacements.map(replacement => (
      deleteIndexedScope(
        transaction,
        stores.noteFlowRoundBlocks,
        replacement.scope
      )
    ));
    const operation = Promise.all(prepared.reduce((tasks, replacement) => (
      tasks.concat(indexedStores.map(storeName => (
        deleteIndexedScope(transaction, storeName, replacement.scope)
      )))
    ), []).concat(noteFlowDeletes).concat([
      requestResult(transaction.objectStore(stores.meta).getAll())
    ])).then(results => {
      const metaRecords = results[results.length - 1];
      const metaStore = transaction.objectStore(stores.meta);
      if (dailyTaskHistory !== undefined) {
        if (dailyHistory) metaStore.put(Object.assign({ key: DAILY_TASK_HISTORY_KEY }, dailyHistory));
        else metaStore.delete(DAILY_TASK_HISTORY_KEY);
      }
      metaRecords.filter(record => (
        record && scopes[record.scope]
      )).forEach(record => metaStore.delete(record.key));

      prepared.forEach(replacement => {
        const scope = replacement.scope;
        const records = replacement.records;
        const progressSnapshot = replacement.progressSnapshot;
        const migration = replacement.migration;
        const progressStore = transaction.objectStore(stores.progress);
        const attemptStore = transaction.objectStore(stores.attemptBlocks);
        const trendStore = transaction.objectStore(stores.trendBlocks);
        const timeStore = transaction.objectStore(stores.timeBuckets);

        replacement.progressRecords.forEach(record => progressStore.put(record));
        records.attemptBlocks.forEach(record => attemptStore.put(record));
        records.trendBlocks.forEach(record => trendStore.put(record));
        records.timeBuckets.forEach(record => timeStore.put(record));
        transaction.objectStore(stores.statistics).put(records.statistics);
        metaStore.put({
          key: writerId(scope),
          scope,
          nextSequence: records.attempts.length,
          blockNumber: Math.max(0, records.attemptBlocks.length - 1),
          sessionBlockNumber: 0,
          attemptFingerprint: records.fingerprint
        });
        metaStore.put({
          key: progressSnapshotId(scope),
          scope,
          signature: String(progressSnapshot.signature || ""),
          progressVersion: Number(progressSnapshot.progressVersion) || 0,
          syncedAt: Date.now()
        });
        metaStore.put({
          key: historyMigrationId(scope),
          scope,
          version: Number(migration.version) || 1,
          status: "complete",
          signature: String(migration.signature || ""),
          sourceEvaluationCount: Math.max(
            0,
            Number(migration.sourceEvaluationCount) || 0
          ),
          totalAttemptCount: records.attempts.length,
          completedAt: Date.now()
        });
      });
      noteFlowReplacements.forEach(replacement => {
        const scope = replacement.scope;
        const blockStore = transaction.objectStore(stores.noteFlowRoundBlocks);
        replacement.blocks.forEach(block => blockStore.put(block));
        transaction.objectStore(stores.statistics).put(replacement.statistics);
        metaStore.put({
          key: noteFlowRoundWriterId(scope),
          scope,
          blockNumber: Math.max(0, replacement.blocks.length - 1),
          roundCount: replacement.statistics.roundCount,
          lastCompletedAt: replacement.statistics.lastCompletedAt
        });
      });
    });
    return operation.then(
      () => completion.then(() => ({
        replacedScopes: prepared.length,
        attemptCount: prepared.reduce(
          (total, replacement) => total + replacement.records.attempts.length,
          0
        ),
        noteFlowRoundCount: noteFlowReplacements.reduce(
          (total, replacement) => total + replacement.statistics.roundCount,
          0
        )
      })),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readProgressSnapshot(scope) {
    const storeName = LEARNING_DATABASE_STORES.progress;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    return requestResult(
      transaction.objectStore(storeName).index("byScope").getAll(scope)
    ).then(records => completion.then(() => records));
  }

  putRecords(storeName, records) {
    if (!records.length) {
      return Promise.resolve();
    }
    const transaction = this.database.transaction(storeName, "readwrite");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore(storeName);
    records.forEach(record => store.put(record));
    return completion;
  }

  async putRecordsInBatches(storeName, records, batchSize = 100) {
    const values = Array.isArray(records) ? records : [];
    const size = Math.max(1, Math.floor(Number(batchSize) || 100));
    for (let offset = 0; offset < values.length; offset += size) {
      await this.putRecords(storeName, values.slice(offset, offset + size));
    }
  }

  readAttemptHistory(scope) {
    const storeName = LEARNING_DATABASE_STORES.attemptBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    return requestResult(
      transaction.objectStore(storeName).index("byScope").getAll(scope)
    ).then(blocks => completion.then(() => blocks
      .sort((left, right) => left.blockNumber - right.blockNumber)
      .reduce((attempts, block) => attempts.concat(
        expandAttemptBlock(block)
      ), [])
      .sort((left, right) => left.sequence - right.sequence)));
  }

  readAttemptHistoryPage(scope, afterBlockNumber = null, limit = 4) {
    return readScopedBlockPage(this.database, this.keyRange,
      LEARNING_DATABASE_STORES.attemptBlocks, scope,
      afterBlockNumber, limit, expandAttemptBlock);
  }

  readAttemptHistoryForExport(scope) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const storeName = LEARNING_DATABASE_STORES.attemptBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const index = transaction.objectStore(storeName).index("byScopeAndNumber");
    const range = this.keyRange.bound(
      [scope, 0],
      [scope, Number.MAX_SAFE_INTEGER]
    );
    const operation = new Promise((resolve, reject) => {
      const attempts = [];
      const request = index.openCursor(range, "next");
      request.onerror = () => reject(
        request.error || new Error("Attempt export cursor failed")
      );
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(attempts);
          return;
        }
        try {
          expandAttemptBlock(cursor.value).forEach(attempt => {
            attempts.push(attempt);
          });
          cursor.continue();
        } catch (error) {
          reject(error);
        }
      };
    });
    return operation.then(
      attempts => completion.then(() => attempts),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readDailyTaskHistory() {
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readonly");
    const completion = transactionResult(transaction);
    return requestResult(transaction.objectStore(LEARNING_DATABASE_STORES.meta)
      .get(DAILY_TASK_HISTORY_KEY)).then(value => completion.then(() => normalizeDailyTaskHistory(value)));
  }

  async writeDailyTaskHistory(history) {
    const value = normalizeDailyTaskHistory(history);
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readwrite");
    const completion = transactionResult(transaction);
    try {
      const store = transaction.objectStore(LEARNING_DATABASE_STORES.meta);
      if (value) store.put(Object.assign({ key: DAILY_TASK_HISTORY_KEY }, value));
      else store.delete(DAILY_TASK_HISTORY_KEY);
    } catch (error) { return abortTransaction(transaction, completion, error); }
    await completion;
  }

  readAttemptHistoryState(scope) {
    const storeName = LEARNING_DATABASE_STORES.meta;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore(storeName);
    return Promise.all([
      requestResult(store.get(writerId(scope))),
      requestResult(store.get(historyMigrationId(scope)))
    ]).then(values => completion.then(() => {
      const writer = values[0] || {};
      return {
        nextSequence: Math.max(0, Number(writer.nextSequence) || 0),
        fingerprint: writer.attemptFingerprint
          ? normalizeSingleNotesHistoryFingerprint(writer.attemptFingerprint)
          : null,
        migration: values[1] || null
      };
    }));
  }

  // Settings overview: fixed metadata reads, never load history blocks or
  // rebuild statistics merely to display the number of stored entries.
  readStoredEntryCounts() {
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([stores.meta, stores.statistics], "readonly");
    const completion = transactionResult(transaction);
    const meta = transaction.objectStore(stores.meta);
    const stats = transaction.objectStore(stores.statistics);
    const count = value => {
      if (value === undefined || value === null) return 0;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid stored entry count.");
      return value;
    };
    return Promise.all([
      requestResult(meta.get(writerId("screen:single-notes"))),
      requestResult(meta.get(writerId("midi:single-notes"))),
      requestResult(stats.get("screen:note-flow")),
      requestResult(stats.get("midi:note-flow")),
      requestResult(stats.get("midi:note-flow-chords")),
      requestResult(stats.get("rhythm:taktgefuehl"))
    ]).then(values => completion.then(() => ({
      singleNotesScreen: count(values[0] && values[0].nextSequence),
      singleNotesMidi: count(values[1] && values[1].nextSequence),
      melodyRounds: count(values[2] && values[2].roundCount) + count(values[3] && values[3].roundCount),
      chordRounds: count(values[4] && values[4].roundCount),
      rhythmBars: count(values[5] && values[5].roundCount)
    })));
  }

  // Database content is verified, but the rest of the backup (settings and
  // activation) is not. This state must never be accepted by the live switch.
  sealVerifiedImportGeneration(summary) {
    if (!/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Only an inactive import database can be sealed."));
    }
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readwrite");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore(LEARNING_DATABASE_STORES.meta);
    const operation = requestResult(store.get("backup-import-generation")).then(marker => {
      if (!marker || marker.state !== "preparing") {
        throw new Error("The import generation is not preparing.");
      }
      store.put(Object.assign({}, marker, {
        state: "database-verified",
        verifiedAt: Date.now(),
        summary
      }));
    });
    return operation.then(
      () => completion,
      error => abortTransaction(transaction, completion, error)
    );
  }

  readImportGenerationMarker() {
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readonly");
    const completion = transactionResult(transaction);
    return requestResult(transaction.objectStore(LEARNING_DATABASE_STORES.meta)
      .get("backup-import-generation")).then(marker => completion.then(() => marker));
  }

  markVerifiedImportReady() {
    if (!/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Only an inactive import database can be made ready."));
    }
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readwrite");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore(LEARNING_DATABASE_STORES.meta);
    const operation = requestResult(store.get("backup-import-generation")).then(marker => {
      if (!marker || marker.state !== "database-verified" || !marker.summary) {
        throw new Error("The import database has not been verified.");
      }
      store.put(Object.assign({}, marker, { state: "ready", readyAt: Date.now() }));
    });
    return operation.then(
      () => completion,
      error => abortTransaction(transaction, completion, error)
    );
  }

  revertUnactivatedImportReady() {
    if (!/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Only an inactive import database can be reverted."));
    }
    const transaction = this.database.transaction(LEARNING_DATABASE_STORES.meta, "readwrite");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore(LEARNING_DATABASE_STORES.meta);
    const operation = requestResult(store.get("backup-import-generation")).then(marker => {
      if (!marker || marker.state !== "ready" || !marker.summary) {
        throw new Error("The import database is not ready for rollback.");
      }
      const reverted = Object.assign({}, marker, { state: "database-verified" });
      delete reverted.readyAt;
      store.put(reverted);
    });
    return operation.then(
      () => completion,
      error => abortTransaction(transaction, completion, error)
    );
  }

  async replaceAttemptHistory(scope, rawAttempts, migration = {}) {
    const stores = LEARNING_DATABASE_STORES;
    const sessionTransaction = this.database.transaction([
      stores.sessionBlocks,
      stores.activeSessions
    ], "readonly");
    const sessionCompletion = transactionResult(sessionTransaction);
    const sessionValues = await Promise.all([
      requestResult(sessionTransaction.objectStore(stores.sessionBlocks)
        .index("byScope").getAll(scope)),
      requestResult(sessionTransaction.objectStore(stores.activeSessions)
        .index("byScope").getAll(scope))
    ]);
    await sessionCompletion;
    const sessionCount = uniqueStoredSessionCount(
      sessionValues[0],
      sessionValues[1]
    );
    const records = buildAttemptHistoryRecords(
      scope,
      rawAttempts,
      sessionCount,
      this.blockPolicy
    );

    const resetTransaction = this.database.transaction([
      stores.attemptBlocks,
      stores.trendBlocks,
      stores.timeBuckets,
      stores.statistics,
      stores.meta
    ], "readwrite");
    const resetCompletion = transactionResult(resetTransaction);
    const resetStores = [
      stores.attemptBlocks,
      stores.trendBlocks,
      stores.timeBuckets
    ];
    const resetOperation = Promise.all(resetStores.map(name => (
      requestResult(resetTransaction.objectStore(name)
        .index("byScope").getAll(scope))
    )).concat([
      requestResult(resetTransaction.objectStore(stores.meta).get(
        writerId(scope)
      ))
    ])).then(values => {
      resetStores.forEach((name, index) => {
        const store = resetTransaction.objectStore(name);
        values[index].forEach(record => store.delete(record.id));
      });
      resetTransaction.objectStore(stores.statistics).delete(scope);
      const existingWriter = values[resetStores.length] || {};
      resetTransaction.objectStore(stores.meta).put({
        key: writerId(scope),
        scope,
        nextSequence: 0,
        blockNumber: 0,
        sessionBlockNumber: Math.max(
          0,
          Number(existingWriter.sessionBlockNumber) || 0
        ),
        attemptFingerprint: createEmptySingleNotesHistoryFingerprint()
      });
      resetTransaction.objectStore(stores.meta).put({
        key: historyMigrationId(scope),
        scope,
        version: Number(migration.version) || 1,
        status: "pending",
        signature: String(migration.signature || ""),
        sourceEvaluationCount: Math.max(
          0,
          Number(migration.sourceEvaluationCount) || 0
        ),
        totalAttemptCount: records.attempts.length,
        startedAt: Date.now()
      });
    });
    await resetOperation.then(
      () => resetCompletion,
      error => abortTransaction(resetTransaction, resetCompletion, error)
    );

    await this.putRecordsInBatches(
      stores.attemptBlocks,
      records.attemptBlocks
    );
    await this.putRecordsInBatches(
      stores.trendBlocks,
      records.trendBlocks
    );
    await this.putRecordsInBatches(
      stores.timeBuckets,
      records.timeBuckets
    );
    await this.putRecords(stores.statistics, [records.statistics]);

    const finishTransaction = this.database.transaction(stores.meta, "readwrite");
    const finishCompletion = transactionResult(finishTransaction);
    const metaStore = finishTransaction.objectStore(stores.meta);
    const writer = await requestResult(metaStore.get(writerId(scope)));
    metaStore.put(Object.assign({}, writer, {
      key: writerId(scope),
      scope,
      nextSequence: records.attempts.length,
      blockNumber: Math.max(0, records.attemptBlocks.length - 1),
      attemptFingerprint: records.fingerprint
    }));
    await finishCompletion;
    return {
      attemptCount: records.attempts.length,
      blockCount: records.attemptBlocks.length,
      trendBlockCount: records.trendBlocks.length,
      timeBucketCount: records.timeBuckets.length,
      fingerprint: records.fingerprint
    };
  }

  finalizeAttemptHistoryMigration(scope, migration = {}) {
    const storeName = LEARNING_DATABASE_STORES.meta;
    const transaction = this.database.transaction(storeName, "readwrite");
    const completion = transactionResult(transaction);
    transaction.objectStore(storeName).put({
      key: historyMigrationId(scope),
      scope,
      version: Number(migration.version) || 1,
      status: "complete",
      signature: String(migration.signature || ""),
      sourceEvaluationCount: Math.max(
        0,
        Number(migration.sourceEvaluationCount) || 0
      ),
      totalAttemptCount: Math.max(
        0,
        Number(migration.totalAttemptCount) || 0
      ),
      completedAt: Date.now()
    });
    return completion;
  }

  recordAttempt(rawAttempt) {
    const scope = String(rawAttempt.scope || "");
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const completion = transactionResult(transaction);
    const metaStore = transaction.objectStore(stores.meta);
    const writerRequest = metaStore.get(writerId(scope));

    const operation = requestResult(writerRequest).then(existingWriter => {
      const writer = existingWriter || {
        key: writerId(scope),
        scope,
        nextSequence: 0,
        blockNumber: 0
      };
      const attempt = normalizedAttempt(rawAttempt, writer.nextSequence);
      const blockStore = transaction.objectStore(stores.attemptBlocks);
      const currentBlockId = `${scope}|block|${writer.blockNumber}`;
      const segmentNumber = Math.floor(writer.nextSequence / TREND_SEGMENT_SIZE);
      const trendBlockNumber = Math.floor(segmentNumber / TREND_BLOCK_SIZE);
      const day = dayKey(attempt.completedAt);

      return Promise.all([
        requestResult(blockStore.get(currentBlockId)),
        requestResult(transaction.objectStore(stores.activeSessions).get(attempt.sessionId)),
        requestResult(transaction.objectStore(stores.progress).get(
          progressId(scope, attempt.noteKey)
        )),
        requestResult(transaction.objectStore(stores.statistics).get(scope)),
        requestResult(transaction.objectStore(stores.trendBlocks).get(
          trendBlockId(scope, trendBlockNumber)
        )),
        requestResult(transaction.objectStore(stores.timeBuckets).get(
          bucketId(scope, day)
        )),
        requestResult(metaStore.get(progressSnapshotId(scope)))
      ]).then(values => {
        let block = values[0];
        let compactAttempt = block
          ? prepareCompactAttempt(block, attempt)
          : null;
        if (!block || shouldStartNewAttemptBlock(
          block,
          compactAttempt.payloadBytes,
          this.blockPolicy
        )) {
          if (block && block.count > 0) {
            writer.blockNumber += 1;
          }
          block = createEmptyBlock(
            scope,
            writer.blockNumber,
            attempt.sequence,
            attempt.completedAt
          );
          compactAttempt = prepareCompactAttempt(block, attempt);
        }
        appendCompactAttemptToBlock(block, attempt, compactAttempt);

        const isNewSession = !values[1];
        const session = values[1] || createSession(attempt);
        const progress = values[2] || createProgress(attempt);
        const statistics = values[3] || createStatistics(scope);
        const trendBlock = values[4] || createTrendBlock(
          scope,
          trendBlockNumber,
          attempt.completedAt
        );
        const timeBucket = values[5] || createTimeBucket(attempt, day);

        addAttemptToAggregate(session, attempt);
        session.endedAt = attempt.completedAt;
        addAttemptToAggregate(progress, attempt);
        progress.lastCompletedAt = attempt.completedAt;
        if (
          rawAttempt.learningRecord
          && typeof rawAttempt.learningRecord === "object"
        ) {
          progress.learningRecord = rawAttempt.learningRecord;
          progress.progressVersion = Math.max(
            0,
            Number(rawAttempt.progressVersion) || 0
          );
        }
        addAttemptToAggregate(statistics, attempt);
        statistics.sessionCount += isNewSession ? 1 : 0;
        statistics.lastCompletedAt = attempt.completedAt;
        addAttemptToTrendBlock(trendBlock, attempt, segmentNumber);
        addAttemptToAggregate(timeBucket, attempt);
        addAttemptToTimeWindow(timeBucket, attempt);

        const storedFingerprint = writer.attemptFingerprint
          ? normalizeSingleNotesHistoryFingerprint(writer.attemptFingerprint)
          : null;
        writer.attemptFingerprint = (
          storedFingerprint
          && storedFingerprint.count === writer.nextSequence
        )
          ? extendSingleNotesHistoryFingerprint(storedFingerprint, attempt)
          : null;
        writer.nextSequence += 1;
        blockStore.put(block);
        transaction.objectStore(stores.activeSessions).put(session);
        transaction.objectStore(stores.progress).put(progress);
        transaction.objectStore(stores.statistics).put(statistics);
        transaction.objectStore(stores.trendBlocks).put(trendBlock);
        transaction.objectStore(stores.timeBuckets).put(timeBucket);
        metaStore.put(writer);
        if (
          values[6]
          && typeof rawAttempt.progressSignature === "string"
          && rawAttempt.progressSignature.length > 0
        ) {
          metaStore.put(Object.assign({}, values[6], {
            signature: rawAttempt.progressSignature,
            progressVersion: Math.max(
              0,
              Number(rawAttempt.progressVersion) || 0
            ),
            syncedAt: attempt.completedAt
          }));
        }
      });
    });
    return operation.then(
      () => completion.then(() => ({ saved: true })),
      error => abortTransaction(transaction, completion, error)
    );
  }

  appendImportedAttemptBatch(scope, rawAttempts, expectedStart) {
    if (!/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Bulk import requires a shadow database."));
    }
    if (!Array.isArray(rawAttempts) || rawAttempts.length < 1
      || rawAttempts.length > 250
      || !Number.isSafeInteger(expectedStart) || expectedStart < 0) {
      return Promise.reject(new RangeError("Invalid single-note import batch."));
    }
    const attempts = rawAttempts.map((raw, offset) => normalizedAttempt(
      Object.assign({}, raw, { scope }), expectedStart + offset
    ));
    for (let index = 0; index < attempts.length; index += 1) {
      if (!rawAttempts[index].id || rawAttempts[index].scope !== scope
        || (index && (
          attempts[index].completedAt < attempts[index - 1].completedAt
          || (attempts[index].completedAt === attempts[index - 1].completedAt
            && attempts[index].id.localeCompare(attempts[index - 1].id) <= 0)
        ))) {
        return Promise.reject(new Error("Single-note import order is invalid."));
      }
    }
    const stores = LEARNING_DATABASE_STORES;
    const names = [stores.meta, stores.attemptBlocks, stores.trendBlocks,
      stores.timeBuckets, stores.statistics];
    const transaction = this.database.transaction(names, "readwrite");
    const completion = transactionResult(transaction);
    const meta = transaction.objectStore(stores.meta);
    const blocks = transaction.objectStore(stores.attemptBlocks);
    const trends = transaction.objectStore(stores.trendBlocks);
    const buckets = transaction.objectStore(stores.timeBuckets);
    const statisticsStore = transaction.objectStore(stores.statistics);
    const trendNumbers = Array.from(new Set(attempts.map(attempt => Math.floor(
      attempt.sequence / TREND_SEGMENT_SIZE / TREND_BLOCK_SIZE
    ))));
    const days = Array.from(new Set(attempts.map(attempt => dayKey(
      attempt.completedAt
    ))));
    const operation = Promise.all([
      requestResult(meta.get("backup-import-generation")),
      requestResult(meta.get(writerId(scope))),
      requestResult(statisticsStore.get(scope))
    ].concat(trendNumbers.map(number => requestResult(trends.get(
      trendBlockId(scope, number)
    )))).concat(days.map(day => requestResult(buckets.get(
      bucketId(scope, day)
    ))))).then(values => {
      const generation = values[0];
      const previousWriter = values[1];
      if (!generation || generation.state !== "preparing") {
        throw new Error("The shadow database is not preparing an import.");
      }
      const writer = previousWriter || {
        key: writerId(scope), scope, nextSequence: 0, blockNumber: 0,
        attemptFingerprint: createEmptySingleNotesHistoryFingerprint()
      };
      if (writer.nextSequence !== expectedStart
        || !writer.attemptFingerprint
        || writer.attemptFingerprint.count !== expectedStart) {
        throw new Error("Single-note import batch is out of order.");
      }
      if (expectedStart > 0 && (
        !Number.isFinite(writer.lastCompletedAt)
        || writer.lastCompletedAt > attempts[0].completedAt
        || (writer.lastCompletedAt === attempts[0].completedAt
          && String(writer.lastAttemptId || "").localeCompare(attempts[0].id) >= 0)
      )) {
        throw new Error("Single-note chronological order changed.");
      }
      const statistics = values[2] || createStatistics(scope);
      const trendValues = new Map(trendNumbers.map((number, index) => (
        [number, values[3 + index]]
      )));
      const bucketValues = new Map(days.map((day, index) => (
        [day, values[3 + trendNumbers.length + index]]
      )));
      return requestResult(blocks.get(`${scope}|block|${writer.blockNumber}`))
        .then(storedBlock => {
          let block = storedBlock || null;
          attempts.forEach(attempt => {
            let compact = block ? prepareCompactAttempt(block, attempt) : null;
            if (!block || shouldStartNewAttemptBlock(
              block, compact.payloadBytes, this.blockPolicy
            )) {
              if (block) {
                blocks.put(block);
                writer.blockNumber += 1;
              }
              block = createEmptyBlock(scope, writer.blockNumber,
                attempt.sequence, attempt.completedAt);
              compact = prepareCompactAttempt(block, attempt);
            }
            appendCompactAttemptToBlock(block, attempt, compact);
            addAttemptToAggregate(statistics, attempt);
            statistics.lastCompletedAt = Math.max(
              statistics.lastCompletedAt, attempt.completedAt
            );
            const segment = Math.floor(attempt.sequence / TREND_SEGMENT_SIZE);
            const trendNumber = Math.floor(segment / TREND_BLOCK_SIZE);
            let trend = trendValues.get(trendNumber);
            if (!trend) {
              trend = createTrendBlock(scope, trendNumber, attempt.completedAt);
              trendValues.set(trendNumber, trend);
            }
            addAttemptToTrendBlock(trend, attempt, segment);
            const day = dayKey(attempt.completedAt);
            let bucket = bucketValues.get(day);
            if (!bucket) {
              bucket = createTimeBucket(attempt, day);
              bucketValues.set(day, bucket);
            }
            addAttemptToAggregate(bucket, attempt);
            addAttemptToTimeWindow(bucket, attempt);
            writer.attemptFingerprint = extendSingleNotesHistoryFingerprint(
              writer.attemptFingerprint, attempt
            );
          });
          blocks.put(block);
          trendValues.forEach(value => trends.put(value));
          bucketValues.forEach(value => buckets.put(value));
          writer.nextSequence += attempts.length;
          writer.lastCompletedAt = attempts[attempts.length - 1].completedAt;
          writer.lastAttemptId = attempts[attempts.length - 1].id;
          meta.put(writer);
          statisticsStore.put(statistics);
          return {
            scope, imported: attempts.length, total: writer.nextSequence,
            fingerprint: writer.attemptFingerprint
          };
        });
    });
    return operation.then(
      result => completion.then(() => result),
      error => abortTransaction(transaction, completion, error)
    );
  }

  finishSession(scope, sessionId, endedAt = Date.now()) {
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.activeSessions,
      stores.sessionBlocks,
      stores.meta
    ], "readwrite");
    const completion = transactionResult(transaction);
    const activeStore = transaction.objectStore(stores.activeSessions);
    const blockStore = transaction.objectStore(stores.sessionBlocks);
    const metaStore = transaction.objectStore(stores.meta);
    const operation = Promise.all([
      requestResult(activeStore.get(sessionId)),
      requestResult(metaStore.get(writerId(scope)))
    ]).then(values => {
      const session = values[0];
      const writer = values[1];
      if (!session || session.scope !== scope) {
        throw new Error("Session was not found in the selected scope");
      }
      session.completed = true;
      session.endedAt = endedAt;
      const initialBlockNumber = writer.sessionBlockNumber || 0;
      return requestResult(blockStore.get(
        sessionBlockId(scope, initialBlockNumber)
      )).then(existingBlock => {
        let block = existingBlock;
        if (!block || block.count >= SESSION_BLOCK_SIZE) {
          if (block && block.count >= SESSION_BLOCK_SIZE) {
            writer.sessionBlockNumber = initialBlockNumber + 1;
          }
          block = createSessionBlock(
            scope,
            writer.sessionBlockNumber || 0,
            session.startedAt
          );
        }
        appendSessionToBlock(block, session);
        blockStore.put(block);
        activeStore.delete(sessionId);
        metaStore.put(writer);
      });
    });
    return operation.then(
      () => completion,
      error => abortTransaction(transaction, completion, error)
    );
  }

  recoverInterruptedSessions(scope, excludedSessionIds = []) {
    const excludedSessions = excludedSessionIds.reduce((result, sessionId) => {
      result[String(sessionId)] = true;
      return result;
    }, Object.create(null));
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.activeSessions,
      stores.sessionBlocks,
      stores.meta
    ], "readwrite");
    const completion = transactionResult(transaction);
    const activeStore = transaction.objectStore(stores.activeSessions);
    const blockStore = transaction.objectStore(stores.sessionBlocks);
    const metaStore = transaction.objectStore(stores.meta);
    const operation = Promise.all([
      requestResult(activeStore.index("byScope").getAll(scope)),
      requestResult(blockStore.index("byScope").getAll(scope)),
      requestResult(metaStore.get(writerId(scope)))
    ]).then(values => {
      const interruptedSessions = values[0]
        .filter(session => !excludedSessions[session.id])
        .sort((first, second) => first.startedAt - second.startedAt);
      if (interruptedSessions.length === 0) {
        return { recoveredSessions: 0 };
      }

      const sessionBlocks = values[1].slice().sort((first, second) => (
        first.blockNumber - second.blockNumber
      ));
      const writer = values[2] || {
        key: writerId(scope),
        scope,
        nextSequence: 0,
        blockNumber: 0,
        sessionBlockNumber: 0
      };
      let block = sessionBlocks.length > 0
        ? sessionBlocks[sessionBlocks.length - 1]
        : null;
      let blockNumber = block
        ? block.blockNumber
        : Math.max(0, Number(writer.sessionBlockNumber) || 0);
      const changedBlocks = [];

      interruptedSessions.forEach(session => {
        if (!block || block.count >= SESSION_BLOCK_SIZE) {
          if (block) {
            changedBlocks.push(block);
            blockNumber = block.blockNumber + 1;
          }
          block = createSessionBlock(scope, blockNumber, session.startedAt);
        }
        session.completed = true;
        session.endedAt = Number.isFinite(Number(session.endedAt))
          ? Math.max(session.startedAt, Number(session.endedAt))
          : session.startedAt;
        appendSessionToBlock(block, session);
        activeStore.delete(session.id);
      });

      changedBlocks.push(block);
      changedBlocks.forEach(changedBlock => blockStore.put(changedBlock));
      writer.sessionBlockNumber = block.blockNumber;
      metaStore.put(writer);
      return { recoveredSessions: interruptedSessions.length };
    });
    return operation.then(
      result => completion.then(() => result),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readDashboard(scope, recentLimit = 10) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.progress,
      stores.statistics,
      stores.trendBlocks
    ], "readonly");
    const completion = transactionResult(transaction);
    const trendIndex = transaction.objectStore(stores.trendBlocks)
      .index("byScopeAndNumber");
    const trendRange = this.keyRange.bound(
      [scope, 0],
      [scope, Number.MAX_SAFE_INTEGER]
    );
    return Promise.all([
      requestResult(transaction.objectStore(stores.progress)
        .index("byScope").getAll(scope)),
      requestResult(transaction.objectStore(stores.statistics).get(scope)),
      cursorValues(
        trendIndex,
        trendRange,
        "prev",
        Math.ceil(recentLimit / TREND_BLOCK_SIZE) + 1
      ),
      cursorValues(
        trendIndex,
        trendRange,
        "next",
        1
      )
    ]).then(values => completion.then(() => ({
      progress: values[0],
      statistics: values[1] || createStatistics(scope),
      recentTrend: values[2].reduce((segments, block) => segments.concat(
        expandTrendBlock(block).reverse()
      ), []).filter(segment => segment.attemptCount >= 5)
        .slice(0, recentLimit).reverse(),
      firstTrend: values[3].reduce((segments, block) => segments.concat(
        expandTrendBlock(block)
      ), []).slice(0, 5)
    })));
  }

  readTrendSegments(scope, startIndex = 0, limit = 50) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const safeStart = Math.max(0, Math.floor(Number(startIndex) || 0));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
    const endIndex = safeStart + safeLimit;
    const storeName = LEARNING_DATABASE_STORES.trendBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const range = this.keyRange.bound(
      [scope, Math.floor(safeStart / TREND_BLOCK_SIZE)],
      [scope, Math.floor((endIndex - 1) / TREND_BLOCK_SIZE)]
    );
    return requestResult(
      transaction.objectStore(storeName).index("byScopeAndNumber").getAll(range)
    ).then(blocks => completion.then(() => blocks
      .sort((left, right) => left.blockNumber - right.blockNumber)
      .reduce((segments, block) => segments.concat(expandTrendBlock(block)), [])
      .filter(segment => (
        segment.segmentNumber >= safeStart
        && segment.segmentNumber < endIndex
      ))
      .sort((left, right) => left.segmentNumber - right.segmentNumber)));
  }

  recordNoteFlowRound(scope, rawResult) {
    const result = cloneNoteFlowRound(rawResult);
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.noteFlowRoundBlocks,
      stores.meta,
      stores.statistics
    ], "readwrite");
    const completion = transactionResult(transaction);
    const blockStore = transaction.objectStore(stores.noteFlowRoundBlocks);
    const metaStore = transaction.objectStore(stores.meta);
    const writerKey = noteFlowRoundWriterId(scope);
    const statisticsStore = transaction.objectStore(stores.statistics);
    const operation = Promise.all([
      requestResult(metaStore.get(writerKey)),
      requestResult(statisticsStore.get(scope))
    ]).then(values => {
      const writer = values[0] || {
        key: writerKey,
        scope,
        blockNumber: 0,
        roundCount: 0
      };
      const statistics = values[1] || createNoteFlowStatistics(scope);
      const initialBlockId = noteFlowRoundBlockId(scope, writer.blockNumber);
      const readyStatistics = hasNoteFlowMeterStatistics(statistics)
        ? Promise.resolve(statistics)
        : requestResult(blockStore.index("byScope").getAll(scope))
          .then(blocks => addStoredMeterStatistics(statistics, blocks));
      return readyStatistics.then(() => requestResult(
        blockStore.get(initialBlockId)
      )).then(storedBlock => {
        let block = storedBlock;
        if (
          block
          && block.rounds.some(savedResult => savedResult.id === result.id)
        ) {
          return { saved: true, duplicate: true };
        }
        if (block && block.count >= NOTE_FLOW_ROUND_BLOCK_SIZE) {
          writer.blockNumber += 1;
          block = null;
        }
        if (!block) {
          const startedAt = Date.parse(result.startedAt || result.completedAt)
            || Date.now();
          block = createNoteFlowRoundBlock(
            scope,
            writer.blockNumber,
            startedAt
          );
        }
        appendNoteFlowRoundToBlock(block, result);
        writer.roundCount = Math.max(0, Number(writer.roundCount) || 0) + 1;
        writer.lastCompletedAt = Date.parse(result.completedAt) || Date.now();
        addNoteFlowRoundToStatistics(statistics, result);
        blockStore.put(block);
        metaStore.put(writer);
        statisticsStore.put(statistics);
        return { saved: true, duplicate: false };
      });
    });
    return operation.then(
      value => completion.then(() => value),
      error => abortTransaction(transaction, completion, error)
    );
  }

  // Import only into an inactive generation. Each batch is one transaction;
  // a failed batch leaves the live database untouched and the generation
  // remains marked "preparing".
  appendImportedNoteFlowBatch(scope, rawRounds, expectedStart) {
    if (!/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(this.name)) {
      return Promise.reject(new Error("Bulk import requires a shadow database."));
    }
    if (!Array.isArray(rawRounds) || rawRounds.length < 1
      || rawRounds.length > NOTE_FLOW_ROUND_BLOCK_SIZE
      || !Number.isSafeInteger(expectedStart) || expectedStart < 0) {
      return Promise.reject(new RangeError("Invalid Note Flow import batch."));
    }
    const rounds = rawRounds.map(cloneNoteFlowRound);
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.noteFlowRoundBlocks, stores.meta, stores.statistics
    ], "readwrite");
    const completion = transactionResult(transaction);
    const blockStore = transaction.objectStore(stores.noteFlowRoundBlocks);
    const metaStore = transaction.objectStore(stores.meta);
    const statisticsStore = transaction.objectStore(stores.statistics);
    const writerKey = noteFlowRoundWriterId(scope);
    const operation = Promise.all([
      requestResult(metaStore.get("backup-import-generation")),
      requestResult(metaStore.get(writerKey)),
      requestResult(statisticsStore.get(scope))
    ]).then(([generation, previousWriter, previousStatistics]) => {
      if (!generation || generation.state !== "preparing") {
        throw new Error("The shadow database is not preparing an import.");
      }
      const writer = previousWriter || {
        key: writerKey, scope, blockNumber: 0, roundCount: 0
      };
      if (writer.roundCount !== expectedStart) {
        throw new Error("Note Flow import batch is out of order.");
      }
      const statistics = previousStatistics || createNoteFlowStatistics(scope);
      return requestResult(blockStore.get(
        noteFlowRoundBlockId(scope, writer.blockNumber)
      )).then(storedBlock => {
        let block = storedBlock || null;
        rounds.forEach(round => {
          if (!block || block.count >= NOTE_FLOW_ROUND_BLOCK_SIZE) {
            if (block) {
              blockStore.put(block);
              writer.blockNumber += 1;
            }
            const startedAt = Date.parse(round.startedAt || round.completedAt)
              || Date.now();
            block = createNoteFlowRoundBlock(scope, writer.blockNumber, startedAt);
          }
          appendNoteFlowRoundToBlock(block, round);
          addNoteFlowRoundToStatistics(statistics, round);
        });
        blockStore.put(block);
        writer.roundCount += rounds.length;
        writer.lastCompletedAt = Date.parse(rounds[rounds.length - 1].completedAt)
          || Date.now();
        metaStore.put(writer);
        statisticsStore.put(statistics);
        return { scope, imported: rounds.length, total: writer.roundCount };
      });
    });
    return operation.then(
      result => completion.then(() => result),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readNoteFlowStatistics(scope) {
    const stores = LEARNING_DATABASE_STORES;
    const transaction = this.database.transaction([
      stores.statistics,
      stores.noteFlowRoundBlocks
    ], "readwrite");
    const completion = transactionResult(transaction);
    const statisticsStore = transaction.objectStore(stores.statistics);
    const operation = requestResult(statisticsStore.get(scope)).then(value => {
      if (value && value.kind === "note-flow"
        && hasNoteFlowMeterStatistics(value)) {
        return value;
      }
      return requestResult(
        transaction.objectStore(stores.noteFlowRoundBlocks)
          .index("byScope").getAll(scope)
      ).then(blocks => {
        const statistics = value && value.kind === "note-flow"
          ? addStoredMeterStatistics(value, blocks)
          : blocks.sort((left, right) => left.blockNumber - right.blockNumber)
            .reduce((summary, block) => {
              expandNoteFlowRoundBlock(block).forEach(result => (
                addNoteFlowRoundToStatistics(summary, result)
              ));
              return summary;
            }, createNoteFlowStatistics(scope));
        statisticsStore.put(statistics);
        return statistics;
      });
    });
    return operation.then(
      value => completion.then(() => value),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readRecentNoteFlowRounds(scope, limit = 25) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const safeLimit = Math.max(1, Math.min(
      500,
      Math.floor(Number(limit) || 25)
    ));
    const storeName = LEARNING_DATABASE_STORES.noteFlowRoundBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const index = transaction.objectStore(storeName).index("byScopeAndNumber");
    const range = this.keyRange.bound(
      [scope, 0],
      [scope, Number.MAX_SAFE_INTEGER]
    );
    return cursorValues(
      index,
      range,
      "prev",
      Math.ceil(safeLimit / NOTE_FLOW_ROUND_BLOCK_SIZE) + 1
    ).then(blocks => completion.then(() => blocks.reduce(
      (rounds, block) => rounds.concat(
        expandNoteFlowRoundBlock(block).reverse()
      ),
      []
    ).slice(0, safeLimit)));
  }

  readNoteFlowRoundsPage(scope, afterBlockNumber = null, limit = 4) {
    return readScopedBlockPage(this.database, this.keyRange,
      LEARNING_DATABASE_STORES.noteFlowRoundBlocks, scope,
      afterBlockNumber, limit, expandNoteFlowRoundBlock);
  }

  readNoteFlowHistoryWindow(scope, startIndex, endIndex) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    if (typeof scope !== "string" || !scope
      || !Number.isSafeInteger(startIndex) || startIndex < 0
      || !Number.isSafeInteger(endIndex) || endIndex < startIndex
      || endIndex - startIndex > 54) {
      return Promise.reject(new RangeError("Invalid Note Flow history window."));
    }
    if (startIndex === endIndex) return Promise.resolve([]);

    // Stored and imported rounds fill consecutive blocks of 100. A chart page
    // needs at most 50 rounds plus four preceding rounds for its rolling mean.
    const firstBlock = Math.floor(startIndex / NOTE_FLOW_ROUND_BLOCK_SIZE);
    const lastBlock = Math.floor((endIndex - 1) / NOTE_FLOW_ROUND_BLOCK_SIZE);
    const storeName = LEARNING_DATABASE_STORES.noteFlowRoundBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const range = this.keyRange.bound([scope, firstBlock], [scope, lastBlock]);
    return requestResult(transaction.objectStore(storeName)
      .index("byScopeAndNumber").getAll(range, 2))
      .then(blocks => completion.then(() => {
        const rounds = [];
        blocks.forEach(block => {
          if (block.scope !== scope || !Number.isSafeInteger(block.blockNumber)
            || block.blockNumber < firstBlock || block.blockNumber > lastBlock
            || !Array.isArray(block.rounds)
            || block.count !== block.rounds.length
            || block.count > NOTE_FLOW_ROUND_BLOCK_SIZE) {
            throw new Error("Note Flow history window has an inconsistent block.");
          }
          const offset = block.blockNumber * NOTE_FLOW_ROUND_BLOCK_SIZE;
          block.rounds.slice(
            Math.max(0, startIndex - offset),
            Math.min(block.count, endIndex - offset)
          ).forEach(round => rounds.push(cloneNoteFlowRound(round)));
        });
        return rounds;
      })).catch(error => abortTransaction(transaction, completion, error));
  }

  readNoteFlowRoundsForExport(scope) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const storeName = LEARNING_DATABASE_STORES.noteFlowRoundBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const index = transaction.objectStore(storeName).index("byScopeAndNumber");
    const range = this.keyRange.bound(
      [scope, 0],
      [scope, Number.MAX_SAFE_INTEGER]
    );
    const operation = new Promise((resolve, reject) => {
      const rounds = [];
      const request = index.openCursor(range, "next");
      request.onerror = () => reject(
        request.error || new Error("Note Flow export cursor failed")
      );
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(rounds);
          return;
        }
        try {
          const block = cursor.value;
          const expanded = expandNoteFlowRoundBlock(block);
          if (block.count !== expanded.length) {
            throw new Error("Note Flow export block count is inconsistent");
          }
          rounds.push(...expanded);
          cursor.continue();
        } catch (error) {
          reject(error);
        }
      };
    });
    return operation.then(
      rounds => completion.then(() => rounds),
      error => abortTransaction(transaction, completion, error)
    );
  }

  readRecentSessions(scope, limit = 25) {
    if (!this.keyRange) {
      return Promise.reject(new Error("IDBKeyRange is not available"));
    }
    const storeName = LEARNING_DATABASE_STORES.sessionBlocks;
    const transaction = this.database.transaction(storeName, "readonly");
    const completion = transactionResult(transaction);
    const index = transaction.objectStore(storeName).index("byScopeAndNumber");
    const range = this.keyRange.bound(
      [scope, 0],
      [scope, Number.MAX_SAFE_INTEGER]
    );
    return cursorValues(
      index,
      range,
      "prev",
      Math.ceil(limit / SESSION_BLOCK_SIZE) + 1
    ).then(blocks => completion.then(() => blocks.reduce(
      (sessions, block) => sessions.concat(expandSessionBlock(block).reverse()),
      []
    ).slice(0, limit)));
  }

  readTimeBuckets(scope) {
    const stores = LEARNING_DATABASE_STORES;
    // Lock both stores: a parallel answer must not be lost while the derived
    // windows are rebuilt. Raw answers, daily totals and progress stay intact.
    const transaction = this.database.transaction([
      stores.timeBuckets, stores.attemptBlocks
    ], "readwrite");
    const completion = transactionResult(transaction);
    const bucketStore = transaction.objectStore(stores.timeBuckets);
    const operation = requestResult(bucketStore.index("byScope").getAll(scope))
      .then(buckets => {
        const oldBuckets = new Map(buckets.filter(bucket => (
          bucket.windowHours !== LEARNING_TIME_WINDOW_HOURS
        )).map(bucket => [bucket.day, bucket]));
        if (!oldBuckets.size) return buckets;
        const rebuilt = new Map();
        return new Promise((resolve, reject) => {
          const request = transaction.objectStore(stores.attemptBlocks)
            .index("byScope").openCursor(scope);
          request.onerror = () => reject(request.error || new Error("Learning-time rebuild failed"));
          request.onsuccess = event => {
            const cursor = event.target.result;
            try {
              if (cursor) {
                expandAttemptBlock(cursor.value).forEach(attempt => {
                  const day = dayKey(attempt.completedAt);
                  if (!oldBuckets.has(day)) return;
                  const bucket = rebuilt.get(day) || createTimeBucket(attempt, day);
                  addAttemptToAggregate(bucket, attempt);
                  addAttemptToTimeWindow(bucket, attempt);
                  rebuilt.set(day, bucket);
                });
                cursor.continue();
                return;
              }
              const result = buckets.map(bucket => {
                const replacement = rebuilt.get(bucket.day);
                // Never replace a summary with partial or missing history.
                if (!replacement || replacement.attemptCount !== bucket.attemptCount
                  || replacement.correctFirstTryCount !== bucket.correctFirstTryCount
                  || replacement.mistakeCount !== bucket.mistakeCount
                  || replacement.responseTimeTotalMs !== bucket.responseTimeTotalMs
                  || replacement.timedAttemptCount !== bucket.timedAttemptCount) return bucket;
                const updated = Object.assign({}, bucket, {
                  windowHours: LEARNING_TIME_WINDOW_HOURS, windows: replacement.windows
                });
                bucketStore.put(updated);
                return updated;
              });
              resolve(result);
            } catch (error) { reject(error); }
          };
        });
      });
    return operation.then(
      buckets => completion.then(() => buckets.sort((first, second) => (
        String(first.day).localeCompare(String(second.day))
      ))),
      error => abortTransaction(transaction, completion, error)
    );
  }

  countRecords() {
    const transaction = this.database.transaction(STORE_NAMES, "readonly");
    const completion = transactionResult(transaction);
    return Promise.all(STORE_NAMES.map(name => requestResult(
      transaction.objectStore(name).count()
    ))).then(counts => completion.then(() => STORE_NAMES.reduce(
      (result, name, index) => Object.assign(result, { [name]: counts[index] }),
      {}
    )));
  }

  async seedSyntheticData(options = {}) {
    const attemptCount = Math.max(0, Number(options.attemptCount) || 0);
    const roundLength = Math.max(1, Number(options.roundLength) || 20);
    const scope = options.scope || "screen:single-notes";
    const baseTimestamp = Number(options.baseTimestamp) || Date.UTC(2026, 0, 1);
    const policy = normalizeAttemptBlockPolicy(
      options.blockPolicy || this.blockPolicy
    );
    const batchSize = Math.max(10, Number(options.writeBatchSize) || 500);
    const progress = new Map();
    const timeBuckets = new Map();
    const statistics = createStatistics(scope);
    let blockNumber = 0;
    let block = null;
    let session = null;
    let sessionBlock = null;
    let sessionBlockCount = 0;
    let trendBlock = null;
    let trendBlockCount = 0;
    let blocksBatch = [];
    let sessionBlocksBatch = [];
    let trendBlocksBatch = [];
    let logicalAttemptBytes = 0;
    let logicalDatabaseBytes = 0;
    let attemptFingerprint = createEmptySingleNotesHistoryFingerprint();

    const flush = async (storeName, records) => {
      if (!records.length) {
        return [];
      }
      logicalDatabaseBytes += records.reduce(
        (total, record) => total + serializedByteLength(record),
        0
      );
      await this.putRecords(storeName, records);
      return [];
    };

    for (let sequence = 0; sequence < attemptCount; sequence += 1) {
      const sessionNumber = Math.floor(sequence / roundLength);
      const timestamp = baseTimestamp + sequence * 1500;
      const attempt = normalizedAttempt({
        id: `${scope}|synthetic|${sequence}`,
        sessionId: `${scope}|session|${sessionNumber}`,
        scope,
        noteKey: `${sequence % 2 === 0 ? "treble" : "bass"}:${36 + sequence % 67}:natural`,
        completedAt: timestamp,
        correctFirstTry: sequence % 5 !== 0,
        mistakeCount: sequence % 5 === 0 ? 1 : 0,
        responseTimeMs: 450 + sequence % 2200
      }, sequence);
      attemptFingerprint = extendSingleNotesHistoryFingerprint(
        attemptFingerprint,
        attempt
      );
      let compactAttempt = block
        ? prepareCompactAttempt(block, attempt)
        : null;
      if (!block || shouldStartNewAttemptBlock(
        block,
        compactAttempt.payloadBytes,
        policy
      )) {
        if (block) {
          blocksBatch.push(block);
        }
        block = createEmptyBlock(scope, blockNumber, sequence, timestamp);
        blockNumber += 1;
        compactAttempt = prepareCompactAttempt(block, attempt);
      }
      appendCompactAttemptToBlock(block, attempt, compactAttempt);
      logicalAttemptBytes += compactAttempt.payloadBytes;

      if (!session || session.id !== attempt.sessionId) {
        if (session) {
          session.completed = true;
          if (!sessionBlock || sessionBlock.count >= SESSION_BLOCK_SIZE) {
            if (sessionBlock) {
              sessionBlocksBatch.push(sessionBlock);
            }
            sessionBlock = createSessionBlock(
              scope,
              sessionBlockCount,
              session.startedAt
            );
            sessionBlockCount += 1;
          }
          appendSessionToBlock(sessionBlock, session);
        }
        session = createSession(attempt);
      }
      addAttemptToAggregate(session, attempt);
      session.endedAt = timestamp;

      const existingProgress = progress.get(attempt.noteKey) || createProgress(attempt);
      addAttemptToAggregate(existingProgress, attempt);
      existingProgress.lastCompletedAt = timestamp;
      progress.set(attempt.noteKey, existingProgress);

      addAttemptToAggregate(statistics, attempt);
      statistics.lastCompletedAt = timestamp;

      const segmentNumber = Math.floor(sequence / TREND_SEGMENT_SIZE);
      const requiredTrendBlockNumber = Math.floor(
        segmentNumber / TREND_BLOCK_SIZE
      );
      if (!trendBlock || trendBlock.blockNumber !== requiredTrendBlockNumber) {
        if (trendBlock) {
          trendBlocksBatch.push(trendBlock);
        }
        trendBlock = createTrendBlock(
          scope,
          requiredTrendBlockNumber,
          attempt.completedAt
        );
        trendBlockCount += 1;
      }
      addAttemptToTrendBlock(trendBlock, attempt, segmentNumber);

      const day = dayKey(timestamp);
      const bucket = timeBuckets.get(day) || createTimeBucket(attempt, day);
      addAttemptToAggregate(bucket, attempt);
      addAttemptToTimeWindow(bucket, attempt);
      timeBuckets.set(day, bucket);

      if (blocksBatch.length >= batchSize) {
        blocksBatch = await flush(LEARNING_DATABASE_STORES.attemptBlocks, blocksBatch);
      }
      if (sessionBlocksBatch.length >= batchSize) {
        sessionBlocksBatch = await flush(
          LEARNING_DATABASE_STORES.sessionBlocks,
          sessionBlocksBatch
        );
      }
      if (trendBlocksBatch.length >= batchSize) {
        trendBlocksBatch = await flush(
          LEARNING_DATABASE_STORES.trendBlocks,
          trendBlocksBatch
        );
      }
    }

    if (block) {
      blocksBatch.push(block);
    }
    if (session) {
      session.completed = true;
      if (!sessionBlock || sessionBlock.count >= SESSION_BLOCK_SIZE) {
        if (sessionBlock) {
          sessionBlocksBatch.push(sessionBlock);
        }
        sessionBlock = createSessionBlock(
          scope,
          sessionBlockCount,
          session.startedAt
        );
        sessionBlockCount += 1;
      }
      appendSessionToBlock(sessionBlock, session);
    }
    if (sessionBlock) {
      sessionBlocksBatch.push(sessionBlock);
    }
    if (trendBlock) {
      trendBlocksBatch.push(trendBlock);
    }

    await flush(LEARNING_DATABASE_STORES.attemptBlocks, blocksBatch);
    await flush(LEARNING_DATABASE_STORES.sessionBlocks, sessionBlocksBatch);
    await flush(LEARNING_DATABASE_STORES.trendBlocks, trendBlocksBatch);
    await flush(LEARNING_DATABASE_STORES.progress, Array.from(progress.values()));
    await flush(LEARNING_DATABASE_STORES.timeBuckets, Array.from(timeBuckets.values()));
    statistics.sessionCount = Math.ceil(attemptCount / roundLength);
    await flush(LEARNING_DATABASE_STORES.statistics, [statistics]);
    await flush(LEARNING_DATABASE_STORES.meta, [{
      key: writerId(scope),
      scope,
      nextSequence: attemptCount,
      blockNumber: Math.max(0, blockNumber - 1),
      sessionBlockNumber: Math.max(0, sessionBlockCount - 1),
      attemptFingerprint
    }]);

    return {
      attemptCount,
      sessionCount: Math.ceil(attemptCount / roundLength),
      blockCount: blockNumber,
      sessionBlockCount,
      trendSegmentCount: Math.ceil(attemptCount / TREND_SEGMENT_SIZE),
      trendBlockCount,
      progressCount: progress.size,
      logicalAttemptBytes,
      logicalDatabaseBytes
    };
  }
}

export default {
  LEARNING_DATABASE_PROTOTYPE_VERSION,
  LEARNING_DATABASE_STORES,
  DEFAULT_ATTEMPT_BLOCK_SIZE,
  DEFAULT_ATTEMPT_BLOCK_BYTES,
  NOTE_FLOW_ROUND_BLOCK_SIZE,
  TREND_SEGMENT_SIZE,
  LEARNING_TIME_WINDOW_HOURS,
  normalizeAttemptBlockPolicy,
  serializedByteLength,
  shouldStartNewAttemptBlock,
  packAttemptsIntoBlocks,
  expandAttemptBlock,
  appendNoteFlowRoundToBlock,
  expandNoteFlowRoundBlock,
  packNoteFlowRoundsIntoBlocks,
  openLearningDatabasePrototype,
  deleteLearningDatabasePrototype,
  LearningDatabasePrototype
};
