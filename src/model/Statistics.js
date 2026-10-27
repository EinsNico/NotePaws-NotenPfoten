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

// Only locally uncommitted rounds are merged into the current stored history.
// A stale tab's old snapshot must never replace (or restore deleted) history.
function mergeRounds(current, additions) {
  const rounds = current.slice();
  const ids = new Set(rounds.map(round => round && round.id));
  additions.forEach(round => {
    if (!ids.has(round.id)) {
      rounds.push(round);
      ids.add(round.id);
    }
  });
  return rounds.sort((a, b) => {
    const timeA = Number(a && a.completedAt) || 0;
    const timeB = Number(b && b.completedAt) || 0;
    return timeA - timeB || String(a && a.id).localeCompare(String(b && b.id));
  });
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
    let persisted = [];
    try { persisted = normalizeRoundHistory(Lockr.get(ROUND_HISTORY_STORAGE_KEY)).rounds; }
    catch (error) { /* The immutable new result is still queued below. */ }
    if (!pending && persisted.some(entry => entry && entry.id === round.id)) {
      this.rounds = mergeRounds(persisted, this.pendingRounds.map(entry => entry.round));
      return persisted.find(entry => entry && entry.id === round.id);
    }
    if (!pending) {
      this.pendingRounds.push({
        round, clefs: options.clef.slice(), scoresSaved: false, recordSaved: false
      });
    }
    this.rounds = mergeRounds(persisted, this.pendingRounds.map(entry => entry.round));
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
    let storedRounds;
    try {
      storedRounds = normalizeRoundHistory(Lockr.get(ROUND_HISTORY_STORAGE_KEY)).rounds;
      this.rounds = mergeRounds(storedRounds, this.pendingRounds.map(entry => entry.round));
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
      // Read again just before the commit: another already-open tab may have
      // completed its round since this tab loaded its settings or statistics.
      storedRounds = normalizeRoundHistory(Lockr.get(ROUND_HISTORY_STORAGE_KEY)).rounds;
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
