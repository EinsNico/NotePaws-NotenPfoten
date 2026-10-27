import * as Lockr from 'lockr';
import { openLearningDatabasePrototype, LEARNING_DATABASE_STORES } from './LearningDatabasePrototype';
import { activeLearningDatabaseName } from './LearningDatabaseGeneration';
import { dailyTaskDay, createDailyTasks, dailyRoundContribution } from './DailyTasks';

// A missed return to the home screen must not lose yesterday's achievements.
// Read at most 31 calendar days in one pass through the existing round blocks.
export async function readDailyTaskRange(dates, dependencies = {}) {
  if (!Array.isArray(dates) || dates.length < 1 || dates.length > 31) throw new RangeError('Read 1 to 31 task days');
  if (dependencies.cancelled && dependencies.cancelled()) throw new Error('History check cancelled');
  const plans = dates.map(date => {
    const day = dailyTaskDay(date), stored = dependencies.definitions && dependencies.definitions[day.key];
    return { day, tasks: (stored ? stored.tasks : createDailyTasks(date)).map(task => Object.assign({}, task, { value: 0, complete: false })) };
  });
  const byDay = new Map(plans.map(plan => [plan.day.key, plan]));
  if (byDay.size !== plans.length) throw new RangeError('Task days must be unique');
  const first = Math.min(...plans.map(plan => plan.day.start)), last = Math.max(...plans.map(plan => plan.day.end));
  const matching = value => {
    const time = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(time) && time >= first && time < last ? byDay.get(dailyTaskDay(time).key) : null;
  };
  const find = (plan, mode) => plan && plan.tasks.find(task => task.mode === mode);
  const add = (task, value) => { if (task) task.value = Math.min(task.goal, task.value + Math.max(0, Number(value) || 0)); };
  let database;
  try {
    database = await (dependencies.openDatabase || openLearningDatabasePrototype)({ name: dependencies.databaseName || activeLearningDatabaseName() });
    const stored = (dependencies.readFreeRounds || (() => Lockr.get('roundHistory', null)))();
    const rounds = Array.isArray(stored) ? stored : stored && stored.rounds || [];
    const seenFree = new Set();
    rounds.forEach(round => {
      const plan = round && matching(round.completedAt), task = find(plan, 'single');
      if (!task || task.value >= task.goal || seenFree.has(round.id)) return;
      const amount = dailyRoundContribution('single', round, plan.day);
      if (amount) { seenFree.add(round.id); add(task, amount); }
    });
    const singles = plans.filter(plan => find(plan, 'single'));
    const readSingles = !singles.length ? Promise.resolve() : new Promise((resolve, reject) => {
      const tx = database.database.transaction(LEARNING_DATABASE_STORES.timeBuckets, 'readonly');
      const index = tx.objectStore(LEARNING_DATABASE_STORES.timeBuckets).index('byScopeAndDay');
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Task day read aborted')); tx.onerror = () => {};
      singles.forEach(plan => ['screen:single-notes', 'midi:single-notes'].forEach(scope => {
        const request = index.get([scope, plan.day.key]);
        request.onsuccess = () => add(find(plan, 'single'), request.result && request.result.attemptCount);
      }));
    });
    const scopeModes = { 'screen:note-flow': 'melody', 'midi:note-flow': 'melody', 'midi:note-flow-chords': 'chords', 'rhythm:taktgefuehl': 'rhythm' };
    const seen = new Map(plans.map(plan => [plan.day.key, new Set()]));
    await Promise.all([readSingles, ...Object.keys(scopeModes).map(scope => {
      const mode = scopeModes[scope], relevant = plans.filter(plan => find(plan, mode));
      if (!relevant.length) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = database.database.transaction(LEARNING_DATABASE_STORES.noteFlowRoundBlocks, 'readonly');
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Task history read aborted')); tx.onerror = () => {};
        const request = tx.objectStore(LEARNING_DATABASE_STORES.noteFlowRoundBlocks).index('byScope').openCursor(database.keyRange.only(scope), 'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = event => {
          try {
            if (dependencies.cancelled && dependencies.cancelled()) throw new Error('History check cancelled');
            const cursor = event.target.result;
            if (!cursor || relevant.every(plan => find(plan, mode).value >= find(plan, mode).goal)) return;
            if (!Array.isArray(cursor.value.rounds)) throw new Error('Invalid round block');
            cursor.value.rounds.forEach(round => {
              const plan = round && matching(round.completedAt), task = find(plan, mode);
              if (!task || task.value >= task.goal) return;
              const identity = mode + ':' + round.id, ids = seen.get(plan.day.key);
              if (ids.has(identity)) return;
              const amount = dailyRoundContribution(mode, round, plan.day);
              if (amount) { ids.add(identity); add(task, amount); }
            });
            cursor.continue();
          } catch (error) { try { tx.abort(); } catch (ignored) {} reject(error); }
        };
      });
    })]);
    return plans.map(plan => ({ day: plan.day.key, error: false,
      tasks: plan.tasks.map(task => Object.assign({}, task, { complete: task.value >= task.goal })) }));
  } finally { if (database) database.close(); }
}
