import {
  LEARNING_DATABASE_STORES,
  expandNoteFlowRoundBlock
} from './LearningDatabasePrototype';
import { RHYTHM_SENSE_SCOPE } from './RhythmSenseRoundStorage';

const count = value => Math.max(0, Number(value) || 0);

// These aggregates count saved bars, not training sessions. Prestige retains
// their totals, but no longer retains individual bar timings or session IDs.
export function summarizeRhythmSenseStatistics(raw = {}, archived = {}) {
  raw = raw || {};
  archived = archived || {};
  const barCount = count(raw.roundCount) + count(archived.roundCount);
  const evaluated = count(raw.evaluatedNoteCount) + count(archived.playedCount);
  const correct = count(raw.correctCount) + count(archived.correctCount);
  const timed = count(raw.timedInputCount);
  return {
    barCount,
    evaluated,
    correct,
    missed: count(raw.missedCount) + count(archived.missedCount),
    accuracy: evaluated ? Math.round(correct / evaluated * 100) : null,
    durationMs: count(raw.durationTotalMs) + count(archived.durationTotalMs),
    averageOffsetMs: timed ? Math.round(count(raw.timingOffsetTotalMs) / timed) : null,
    archivedBarCount: count(archived.roundCount),
    hasResults: barCount > 0
  };
}

function sessionKey(bar) {
  return bar.sessionId || bar.id;
}

function newRound(bar) {
  return {
    id: sessionKey(bar),
    startedAt: bar.startedAt || bar.completedAt,
    completedAt: bar.completedAt,
    settings: Object.assign({}, bar.settings),
    barCount: 0, firstBarNumber: Infinity, lastBarNumber: 0,
    durationMs: 0, correct: 0, early: 0, late: 0, missed: 0,
    evaluated: 0, timed: 0, offsetTotalMs: 0,
    accuracy: null, averageOffsetMs: null
  };
}

export function addRhythmBarToRound(round, bar) {
  const score = bar.score || {};
  const timing = bar.timing || {};
  round.barCount += 1;
  round.firstBarNumber = Math.min(round.firstBarNumber, count(bar.barNumber) || 1);
  round.lastBarNumber = Math.max(round.lastBarNumber, count(bar.barNumber) || 1);
  if (Date.parse(bar.startedAt || bar.completedAt) < Date.parse(round.startedAt)) {
    round.startedAt = bar.startedAt || bar.completedAt;
  }
  if (Date.parse(bar.completedAt) > Date.parse(round.completedAt)) {
    round.completedAt = bar.completedAt;
  }
  round.durationMs += count(bar.durationMs);
  round.correct += count(score.correct);
  round.early += count(timing.early);
  round.late += count(timing.late);
  round.missed += count(score.missed);
  round.evaluated += count(score.evaluatedInputs)
    || count(score.correct) + count(score.wrong) + count(score.missed);
  round.timed += count(timing.evaluatedInputs);
  round.offsetTotalMs += count(timing.totalAbsoluteOffsetMs);
  round.accuracy = round.evaluated ? Math.round(round.correct / round.evaluated * 100) : null;
  round.averageOffsetMs = round.timed ? Math.round(round.offsetTotalMs / round.timed) : null;
  // Archived or failed-to-save bars must not make a partial session look complete.
  round.partial = round.firstBarNumber > 1 || round.barCount !== round.lastBarNumber;
  return round;
}

// Read only the blocks needed for up to 50 sessions. Sessions may span blocks
// (including unlimited training); bars are reduced as the cursor advances.
// No export/full-history read, writes, or changes to training storage are needed.
export function readRhythmSenseHistoryPage(database, position = null, limit = 50,
  shouldContinue = () => true) {
  if (!database.keyRange) return Promise.reject(new Error('IDBKeyRange is not available'));
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  const storeName = LEARNING_DATABASE_STORES.noteFlowRoundBlocks;
  const transaction = database.database.transaction(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const rounds = [];
    const bySession = new Map();
    const inheritedExclusions = position && Array.isArray(position.exclusions)
      ? position.exclusions.slice() : [];
    let exclusions = inheritedExclusions.slice();
    let overflowPosition = null;
    let nextPosition = null;
    // Positions are ordered newest to oldest within the stored block stream.
    const atOrBefore = (left, right) => left.blockNumber < right.blockNumber
      || (left.blockNumber === right.blockNumber && left.roundIndex <= right.roundIndex);
    const finishPage = () => {
      if (!overflowPosition) return;
      // Some selected sessions may extend past the next page's starting point.
      // Remember only those overlapping sessions, with their oldest positions,
      // so rereading that bounded overlap cannot create duplicate round points.
      const overlapping = inheritedExclusions.concat(rounds.map(round => ({
        id: round.id, oldestPosition: round.oldestPosition
      }))).filter(item => atOrBefore(item.oldestPosition, overflowPosition));
      nextPosition = Object.assign({}, overflowPosition, { exclusions: overlapping });
    };
    const allSelectedComplete = () => rounds.every(round => round.firstBarNumber === 1);
    let cancelled = false;
    let stopped = false;
    transaction.oncomplete = () => resolve({
      rounds: rounds.reverse().map(round => {
        const result = Object.assign({}, round);
        delete result.oldestPosition;
        return result;
      }), nextPosition, hasOlder: Boolean(nextPosition), cancelled
    });
    transaction.onerror = () => reject(transaction.error || new Error('Rhythm history read failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Rhythm history read aborted'));
    const upper = position ? position.blockNumber : Number.MAX_SAFE_INTEGER;
    const range = database.keyRange.bound([RHYTHM_SENSE_SCOPE, 0], [RHYTHM_SENSE_SCOPE, upper]);
    const request = transaction.objectStore(storeName).index('byScopeAndNumber').openCursor(range, 'prev');
    request.onerror = () => reject(request.error || new Error('Rhythm history cursor failed'));
    request.onsuccess = event => {
      if (stopped) return;
      if (!shouldContinue()) { cancelled = true; stopped = true; return; }
      const cursor = event.target.result;
      if (!cursor) { finishPage(); return; }
      try {
        const block = cursor.value;
        const bars = expandNoteFlowRoundBlock(block);
        const last = position && position.blockNumber === block.blockNumber
          ? Math.min(position.roundIndex, bars.length - 1) : bars.length - 1;
        for (let index = last; index >= 0; index--) {
          const bar = bars[index];
          const currentPosition = { blockNumber: block.blockNumber, roundIndex: index };
          exclusions = exclusions.filter(item => atOrBefore(item.oldestPosition, currentPosition));
          const id = sessionKey(bar);
          if (exclusions.some(item => item.id === id)) continue;
          let round = bySession.get(id);
          if (!round) {
            if (rounds.length === safeLimit) {
              if (!overflowPosition) overflowPosition = currentPosition;
              if (allSelectedComplete()) { finishPage(); stopped = true; return; }
              // Keep looking only for the missing earlier bars of selected
              // sessions. The skipped bars stay reachable on the next page.
              continue;
            }
            round = newRound(bar);
            rounds.push(round);
            bySession.set(id, round);
          }
          addRhythmBarToRound(round, bar);
          round.oldestPosition = currentPosition;
          if (overflowPosition && allSelectedComplete()) {
            finishPage(); stopped = true; return;
          }
        }
        cursor.continue();
      } catch (error) {
        reject(error);
        transaction.abort();
      }
    };
  });
}
