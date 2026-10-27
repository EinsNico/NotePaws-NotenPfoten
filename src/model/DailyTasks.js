import * as Lockr from 'lockr';
import { openLearningDatabasePrototype, LEARNING_DATABASE_STORES } from './LearningDatabasePrototype';
import { activeLearningDatabaseName } from './LearningDatabaseGeneration';

const DAY_MS = 86400000;
const MODES = ['single', 'melody', 'chords', 'rhythm'];
const GOALS = { single: [10, 12, 15], melody: [1, 2, 1], chords: [4, 6, 8], rhythm: [2, 3, 4] };
const SCOPES = {
  melody: ['screen:note-flow', 'midi:note-flow'],
  chords: ['midi:note-flow-chords'],
  rhythm: ['rhythm:taktgefuehl']
};
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function dailyTaskDay(now = new Date()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid local date is required');
  const year = date.getFullYear(), month = date.getMonth(), day = date.getDate();
  const key = [year, ('0' + (month + 1)).slice(-2), ('0' + day).slice(-2)].join('-');
  return { key, number: Math.floor(Date.UTC(year, month, day) / DAY_MS),
    start: new Date(year, month, day).getTime(), end: new Date(year, month, day + 1).getTime() };
}

export function createDailyTasks(now = new Date(), progress = {}) {
  const day = dailyTaskDay(now), omitted = ((day.number % 4) + 4) % 4;
  return MODES.filter((_, index) => index !== omitted).map(mode => {
    const variant = ((Math.floor(day.number / 4) + MODES.indexOf(mode)) % 3 + 3) % 3;
    const goal = GOALS[mode][variant], value = Math.min(goal, count(progress[mode]));
    return { id: day.key + ':' + mode, mode, goal, value, complete: value >= goal };
  });
}

function onDay(value, day) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= day.start && timestamp < day.end;
}

export function dailyRoundContribution(mode, round, day) {
  if (!round || !onDay(round.completedAt, day)) return 0;
  if (mode === 'single') return count(round.numCorrect);
  const score = round.score || {}, timing = round.timing || {};
  if (mode === 'rhythm') return round.exerciseType === 'rhythm'
    && (count(score.correct) + count(score.wrong) > 0 || (Array.isArray(round.taps) && round.taps.length > 0)) ? 1 : 0;
  const played = count(score.correct) + count(timing.early) + count(timing.late);
  if (mode === 'chords') return round.exerciseType === 'chord' ? played : 0;
  return mode === 'melody' && !['chord', 'rhythm'].includes(round.exerciseType) && played > 0 ? 1 : 0;
}

// Read existing records, never write another copy of learning progress. Cursors
// keep memory bounded, tolerate out-of-order imports and stop at the daily goal.
export function readDailyRoundProgress(database, mode, day, goal) {
  const scopes = SCOPES[mode];
  if (!scopes) return Promise.resolve(0);
  const transaction = database.database.transaction(LEARNING_DATABASE_STORES.noteFlowRoundBlocks, 'readonly');
  const index = transaction.objectStore(LEARNING_DATABASE_STORES.noteFlowRoundBlocks).index('byScope');
  let total = 0;
  const seen = new Set();
  const reading = Promise.all(scopes.map(scope => new Promise((resolve, reject) => {
    const request = index.openCursor(database.keyRange.only(scope), 'prev');
    request.onerror = () => reject(request.error || new Error('Daily tasks could not read saved rounds'));
    request.onsuccess = event => {
      try {
        const cursor = event.target.result;
        if (!cursor || total >= goal) { resolve(); return; }
        if (!Array.isArray(cursor.value.rounds)) throw new Error('Invalid saved round block');
        cursor.value.rounds.some(round => {
          const contribution = dailyRoundContribution(mode, round, day);
          if (contribution && !seen.has(round.id)) { seen.add(round.id); total += contribution; }
          return total >= goal;
        });
        if (total >= goal) resolve();
        else cursor.continue();
      } catch (error) { reject(error); }
    };
  })));
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Daily tasks read aborted'));
    transaction.onerror = () => {};
  });
  return Promise.all([reading, completed]).then(() => Math.min(goal, total));
}

function readSingleNotesDay(database, day) {
  const transaction = database.database.transaction(LEARNING_DATABASE_STORES.timeBuckets, 'readonly');
  const index = transaction.objectStore(LEARNING_DATABASE_STORES.timeBuckets).index('byScopeAndDay');
  let total = 0;
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(total);
    transaction.onabort = () => reject(transaction.error || new Error('Daily single-note progress read aborted'));
    transaction.onerror = () => {};
    ['screen:single-notes', 'midi:single-notes'].forEach(scope => {
      const request = index.get([scope, day.key]);
      request.onsuccess = () => { total += count(request.result && request.result.attemptCount); };
    });
  });
}

export async function readDailyTasks(now = new Date(), dependencies = {}) {
  const day = dailyTaskDay(now), tasks = createDailyTasks(now), progress = {};
  let database;
  try {
    database = await (dependencies.openDatabase || openLearningDatabasePrototype)({ name: activeLearningDatabaseName() });
    await Promise.all(tasks.map(async task => {
      if (task.mode !== 'single') {
        progress[task.mode] = await readDailyRoundProgress(database, task.mode, day, task.goal);
        return;
      }
      const stored = (dependencies.readFreeRounds || (() => Lockr.get('roundHistory', null)))();
      const rounds = Array.isArray(stored) ? stored : stored && stored.rounds || [];
      const seen = new Set();
      progress.single = rounds.reduce((total, round) => {
        if (!round || seen.has(round.id)) return total;
        seen.add(round.id);
        return total + dailyRoundContribution('single', round, day);
      }, 0) + await readSingleNotesDay(database, day);
    }));
    return { day: day.key, tasks: createDailyTasks(now, progress), error: false };
  } catch (error) {
    return { day: day.key, tasks, error: true };
  } finally { if (database) database.close(); }
}
