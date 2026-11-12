import * as Lockr from "lockr";
import { writeVerified } from "./VerifiedPersistence";
import {
  reportPersistenceFailure,
  clearPersistenceFailure
} from "./PersistenceFeedback";
import {
  ROUND_HISTORY_VERSION,
  ROUND_HISTORY_STORAGE_KEY,
  createNormalRoundRecord,
  normalizeRoundHistory
} from "./RoundHistory";
import {
  filterNormalRounds,
  summarizeNormalRounds
} from "./RoundStatistics";

function compareRounds(first, second) {
  const firstTime = Number(first && first.completedAt) || 0;
  const secondTime = Number(second && second.completedAt) || 0;
  return firstTime - secondTime
    || String(first && first.id).localeCompare(String(second && second.id));
}

function insertRound(rounds, round) {
  const end = rounds.length;
  if (end === 0 || compareRounds(rounds[end - 1], round) <= 0) {
    rounds.push(round);
    return;
  }
  let lower = 0;
  let upper = end;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (compareRounds(rounds[middle], round) <= 0) lower = middle + 1;
    else upper = middle;
  }
  rounds.splice(lower, 0, round);
}

// Merge only uncommitted results with the latest storage snapshot, so a stale
// tab cannot restore rounds that another tab removed.
function mergeRounds(current, additions) {
  const rounds = current.slice();
  const ids = new Set();
  let ordered = true;
  rounds.forEach((round, index) => {
    ids.add(round && round.id);
    if (ordered && index > 0 && compareRounds(rounds[index - 1], round) > 0) {
      ordered = false;
    }
  });
  if (!ordered) rounds.sort(compareRounds);
  additions.forEach(round => {
    if (!ids.has(round.id)) {
      insertRound(rounds, round);
      ids.add(round.id);
    }
  });
  return rounds;
}

export default {
  lastScores: [],
  record: 0,
  clef: [],
  difficulty: '',
  accidentals: '',
  legacyScores: [],
  legacyRecord: 0,
  rounds: [],
  pendingRounds: [],
  roundSavePromise: null,

  init() {
    this.legacyScores = Lockr.get("lastScores", []);
    this.legacyRecord = Lockr.get("record", 0);
    const persistedRounds = normalizeRoundHistory(
      Lockr.get(ROUND_HISTORY_STORAGE_KEY)
    ).rounds;
    this.rounds = mergeRounds(persistedRounds, this.pendingRounds.map(entry => entry.round));
  },
  getScoresKey(clef, difficulty, accidentals) {
    /* the basic idea is to generate an unique key based on the active user settings.
     * Only the three types of settings that make a difference in overall game
     * difficulty/type are considered. */
    let scoresKey = "lastScores__";
    return scoresKey.concat(clef.join('_'), '__',  difficulty, '__',  accidentals);
  },
  getRecordKey(clef, difficulty, accidentals) {
    /* the basic idea is to generate an unique key based on the active user settings.
     * Only the three types of settings that make a difference in overall game
     * difficulty/type are considered. */
    let scoresKey = "record__";
    return scoresKey.concat(clef.join('_'), '__',  difficulty, '__',  accidentals);
  },
  loadStatistics(clef, difficulty, accidentals) {
    // Save arguments for potential later use.
    this.clef = clef;
    this.difficulty = difficulty;
    this.accidentals = accidentals;

    let scoresKey = this.getScoresKey(clef, difficulty, accidentals);
    let recordKey = this.getRecordKey(clef, difficulty, accidentals);

    /* Use legacy scores and record as a fallback/starting point if the respective
     * scoresKey has no dedicated entry yet.*/
    this.lastScores = Lockr.get(scoresKey, this.legacyScores);
    this.record = Lockr.get(recordKey, this.legacyRecord);
  },
  saveStatistics(clef, difficulty, accidentals) {
    // Save arguments for potential later use.
    this.clef = clef;
    this.difficulty = difficulty;
    this.accidentals = accidentals;

    let scoresKey = this.getScoresKey(clef, difficulty, accidentals);
    let recordKey = this.getRecordKey(clef, difficulty, accidentals);
    const scoresSaved = writeVerified(Lockr, scoresKey, this.lastScores);
    const recordSaved = writeVerified(Lockr, recordKey, this.record);
    return scoresSaved && recordSaved;
  },
  addScore(score, clef, difficulty, accidentals) {
    this.lastScores.push(score);
    if (this.lastScores.length > 25) {
      this.lastScores.shift();
    }
    if (score > this.record) {
      this.record = score;
    }
    this.saveStatistics(clef, difficulty, accidentals);
  },
  addRound(result, options, context = {}) {
    const round = createNormalRoundRecord(result, options, context);
    const pending = this.pendingRounds.find(entry => entry.round.id === round.id);
    // Explicit IDs may be retries of a previously committed round. Fresh rounds
    // can use the in-memory history until the save reads the latest snapshot.
    if (context.id && !pending) {
      try {
        const storedRounds = normalizeRoundHistory(Lockr.get(ROUND_HISTORY_STORAGE_KEY)).rounds;
        const storedRound = storedRounds.find(entry => entry && entry.id === round.id);
        if (storedRound) {
          this.rounds = mergeRounds(storedRounds, this.pendingRounds.map(entry => entry.round));
          return storedRound;
        }
      } catch (error) { /* The new result is still queued below. */ }
    }
    if (!pending) {
      this.pendingRounds.push({
        round, clefs: options.clef.slice(), scoresSaved: false, recordSaved: false
      });
      const rounds = this.rounds.slice();
      insertRound(rounds, round);
      this.rounds = rounds;
    }
    this.retryPendingRounds();
    return pending ? pending.round : round;
  },
  retryPendingRounds() {
    if (this.roundSavePromise) return this.roundSavePromise;
    if (!this.pendingRounds.length) {
      clearPersistenceFailure('free-rounds');
      return true;
    }
    // Modern browsers serialize commits across tabs of this origin. Older
    // WebViews still use the latest-history merge immediately before writing.
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks
      && typeof navigator.locks.request === 'function') {
      let request;
      try {
        request = navigator.locks.request('noten-pfoten-free-round-history',
          { mode: 'exclusive' }, () => this.commitPendingRounds());
      } catch (error) { return this.commitPendingRounds(); }
      this.roundSavePromise = Promise.resolve(request).catch(() => this.commitPendingRounds()).then(saved => {
        this.roundSavePromise = null;
        return saved;
      });
      return this.roundSavePromise;
    }
    return this.commitPendingRounds();
  },
  commitPendingRounds() {
    try {
      this.pendingRounds.forEach(entry => {
        const round = entry.round;
        const difficulty = round.settings.statisticsDifficulty;
        const accidentals = round.settings.accidentals;
        this.loadStatistics(entry.clefs, difficulty, accidentals);
        const scoresKey = this.getScoresKey(entry.clefs, difficulty, accidentals);
        if (!entry.scoresSaved) {
          const scores = this.lastScores.concat(round.score).slice(-25);
          entry.scoresSaved = writeVerified(Lockr, scoresKey, scores);
          this.lastScores = scores;
        }
        this.record = Math.max(this.record, round.score);
        if (!entry.recordSaved) {
          entry.recordSaved = writeVerified(Lockr,
            this.getRecordKey(entry.clefs, difficulty, accidentals), this.record);
        }
      });
      // Read immediately before writing, so older WebViews without Web Locks
      // still merge against the most recent history they can see.
      const storedRounds = normalizeRoundHistory(Lockr.get(ROUND_HISTORY_STORAGE_KEY)).rounds;
      this.rounds = mergeRounds(storedRounds, this.pendingRounds.map(entry => entry.round));
      const historySaved = writeVerified(Lockr, ROUND_HISTORY_STORAGE_KEY, {
        version: ROUND_HISTORY_VERSION, rounds: this.rounds
      });
      if (historySaved) {
        this.pendingRounds = this.pendingRounds.filter(entry => !entry.scoresSaved || !entry.recordSaved);
      }
    } catch (error) {
      // Results remain in memory even when reading storage is also unavailable.
      this.rounds = mergeRounds(this.rounds, this.pendingRounds.map(entry => entry.round));
    }
    const saved = this.pendingRounds.length === 0;
    if (saved) clearPersistenceFailure('free-rounds');
    else reportPersistenceFailure('free-rounds', 'PERSISTENCE_ROUNDS', () => this.retryPendingRounds());
    return saved;
  },
  getFilteredRounds(scope, options, customSettingsSignature = "", inputGroup = "") {
    return filterNormalRounds(
      this.rounds,
      scope,
      options,
      customSettingsSignature,
      inputGroup
    );
  },
  getRoundSummary(scope, options, customSettingsSignature = "", inputGroup = "") {
    return summarizeNormalRounds(
      this.getFilteredRounds(scope, options, customSettingsSignature, inputGroup)
    );
  },
  resetRecord() {
    this.record = 0;
    this.saveStatistics(this.clef, this.difficulty, this.accidentals);
  },
  resetHistory() {
    this.lastScores = [];
    this.saveStatistics(this.clef, this.difficulty, this.accidentals);
  }
};
