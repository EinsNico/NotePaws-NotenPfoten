import { dailyTaskDay } from './DailyTasks';
import { readDailyTaskRange } from './DailyTaskHistoryProgress';
import { openLearningDatabasePrototype, LEARNING_DATABASE_STORES } from './LearningDatabasePrototype';
import { activeLearningDatabaseName } from './LearningDatabaseGeneration';

import { DAILY_TASK_HISTORY_KEY, normalizeDailyTaskHistory, mergeDailyTaskHistory, shiftDailyHistoryDay, dailyHistoryDate } from './DailyTaskHistoryData';
export { DAILY_TASK_HISTORY_KEY, normalizeDailyTaskHistory, mergeDailyTaskHistory, shiftDailyHistoryDay, dailyHistoryDate, dailyTaskStreak, dailyTaskMonth } from './DailyTaskHistoryData';

function readArchive(database) {
  return new Promise((resolve, reject) => {
    const tx = database.database.transaction(LEARNING_DATABASE_STORES.meta, 'readonly');
    const request = tx.objectStore(LEARNING_DATABASE_STORES.meta).get(DAILY_TASK_HISTORY_KEY);
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => { try { resolve(normalizeDailyTaskHistory(value)); } catch (error) { reject(error); } };
    tx.onabort = () => reject(tx.error || new Error('Task history could not be read')); tx.onerror = () => {};
  });
}

export function commitDailyTaskHistory(database, original, candidates, today, checkedThrough, cancelled = () => false) {
  return new Promise((resolve, reject) => {
    const tx = database.database.transaction(LEARNING_DATABASE_STORES.meta, 'readwrite');
    const store = tx.objectStore(LEARNING_DATABASE_STORES.meta), request = store.get(DAILY_TASK_HISTORY_KEY);
    let saved, failure;
    request.onsuccess = () => {
      try {
        if (cancelled() || (original && !request.result)) throw new Error('Task history changed or was cleared');
        saved = mergeDailyTaskHistory(request.result, candidates, today, checkedThrough);
        const record = Object.assign({ key: DAILY_TASK_HISTORY_KEY }, saved);
        if (JSON.stringify(request.result) !== JSON.stringify(record)) store.put(record);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = () => reject(failure || tx.error || new Error('Task history could not be saved')); tx.onerror = () => {};
  });
}

export async function updateDailyTaskHistory(snapshot, dependencies = {}) {
  let database, archive = null;
  const generation = activeLearningDatabaseName(), today = dailyTaskDay().key;
  const cancelled = () => (dependencies.cancelled && dependencies.cancelled()) || generation !== activeLearningDatabaseName() || today !== dailyTaskDay().key;
  try {
    if (!snapshot || snapshot.error || snapshot.day !== today) throw new Error('A current task snapshot is required');
    database = await (dependencies.openDatabase || openLearningDatabasePrototype)({ name: generation });
    archive = await readArchive(database);
    const candidates = [snapshot], yesterday = shiftDailyHistoryDay(today, -1);
    if (archive) {
      let day = shiftDailyHistoryDay(archive.checkedThrough, 1);
      if (day < archive.startDay) day = archive.startDay;
      while (day <= yesterday) {
        if (cancelled()) throw new Error('History check cancelled');
        const dates = [];
        while (day <= yesterday && dates.length < 31) { dates.push(dailyHistoryDate(day)); day = shiftDailyHistoryDay(day, 1); }
        const values = await (dependencies.readRange || readDailyTaskRange)(dates, { databaseName: generation, definitions: archive.days, cancelled });
        candidates.push(...values);
      }
    }
    if (cancelled()) throw new Error('History check cancelled');
    archive = await commitDailyTaskHistory(database, archive, candidates, today, yesterday, cancelled);
    return { error: false, archive };
  } catch (error) {
    return { error: true, archive };
  } finally { if (database) database.close(); }
}
