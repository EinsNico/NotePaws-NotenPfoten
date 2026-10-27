export const DAILY_TASK_HISTORY_KEY = 'daily-task-history-v1';
const MODES = ['single', 'melody', 'chords', 'rhythm'];

export function dailyHistoryDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) throw new TypeError('Invalid task history day');
  const date = new Date(key + 'T12:00:00');
  if (!Number.isFinite(date.getTime()) || [date.getFullYear(), ('0' + (date.getMonth() + 1)).slice(-2), ('0' + date.getDate()).slice(-2)].join('-') !== key) throw new TypeError('Invalid task history date');
  return date;
}

export function shiftDailyHistoryDay(key, offset) {
  const date = dailyHistoryDate(key);
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), ('0' + (date.getMonth() + 1)).slice(-2), ('0' + date.getDate()).slice(-2)].join('-');
}

function dayRecord(day, tasks) {
  dailyHistoryDate(day);
  if (!Array.isArray(tasks) || tasks.length !== 3 || new Set(tasks.map(task => task && task.mode)).size !== 3) throw new Error('Three distinct historical tasks are required');
  return { tasks: tasks.map(task => {
    if (!MODES.includes(task.mode) || !Number.isSafeInteger(task.goal) || task.goal < 1 || task.goal > 100000
      || !Number.isSafeInteger(task.value) || task.value < 0) throw new Error('Invalid historical task');
    const value = Math.min(task.goal, task.value);
    return { id: day + ':' + task.mode, mode: task.mode, goal: task.goal, value, complete: value >= task.goal };
  }) };
}

export function normalizeDailyTaskHistory(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw.version !== 1 || !raw.days || typeof raw.days !== 'object' || Array.isArray(raw.days)) throw new Error('Invalid task history');
  dailyHistoryDate(raw.startDay); dailyHistoryDate(raw.checkedThrough);
  const days = {};
  if (raw.checkedThrough < shiftDailyHistoryDay(raw.startDay, -1)) throw new Error('Invalid history checkpoint');
  Object.keys(raw.days).forEach(day => {
    if (day < raw.startDay || !raw.days[day]) throw new Error('Invalid history day');
    days[day] = dayRecord(day, raw.days[day].tasks);
  });
  return { version: 1, startDay: raw.startDay, checkedThrough: raw.checkedThrough, days };
}

export function isValidDailyTaskHistoryBackup(raw) {
  try {
    if (!raw || Object.keys(raw).some(key => !['version', 'startDay', 'checkedThrough', 'days'].includes(key))) return false;
    const normalized = normalizeDailyTaskHistory(raw);
    return Object.keys(normalized.days).every(day => {
      const record = raw.days[day];
      return Object.keys(record).length === 1 && record.tasks.every((task, index) => {
        const expected = normalized.days[day].tasks[index];
        return Object.keys(task).length === Object.keys(expected).length
          && Object.keys(expected).every(key => task[key] === expected[key]);
      });
    });
  } catch (error) { return false; }
}

// Earned progress is a maximum, never a sum: importing a backup twice must
// not complete tasks twice. Different assignments need an explicit conflict.
export function mergeDailyTaskArchives(current, incoming) {
  const left = normalizeDailyTaskHistory(current), right = normalizeDailyTaskHistory(incoming);
  if (!left || !right) return left || right;
  left.startDay = [left.startDay, right.startDay].sort()[0];
  left.checkedThrough = [left.checkedThrough, right.checkedThrough].sort()[0];
  Object.keys(right.days).forEach(day => {
    const before = left.days[day], next = right.days[day];
    if (!before) { left.days[day] = next; return; }
    before.tasks = before.tasks.map(task => {
      const match = next.tasks.find(other => other.mode === task.mode && other.goal === task.goal);
      if (!match) throw new Error('Conflicting daily task assignments: ' + day);
      const value = Math.max(task.value, match.value);
      return Object.assign({}, task, { value, complete: value >= task.goal });
    });
  });
  return left;
}

export function mergeDailyTaskHistory(raw, candidates, today, checkedThrough) {
  dailyHistoryDate(today); dailyHistoryDate(checkedThrough);
  const archive = normalizeDailyTaskHistory(raw) || { version: 1, startDay: today, checkedThrough: shiftDailyHistoryDay(today, -1), days: {} };
  candidates.forEach(candidate => {
    if (candidate.error || candidate.day < archive.startDay || candidate.day > today) return;
    const next = dayRecord(candidate.day, candidate.tasks), previous = archive.days[candidate.day];
    if (previous) next.tasks = previous.tasks.map(task => {
      const incoming = next.tasks.find(value => value.mode === task.mode && value.goal === task.goal);
      const value = incoming ? Math.max(task.value, incoming.value) : task.value;
      return Object.assign({}, task, { value, complete: value >= task.goal });
    });
    archive.days[candidate.day] = next;
  });
  archive.checkedThrough = [archive.checkedThrough, checkedThrough].sort().pop();
  return archive;
}

export function dailyTaskStreak(archive, today) {
  if (!archive) return 0;
  const done = day => archive.days[day] && archive.days[day].tasks.length === 3 && archive.days[day].tasks.every(task => task.complete);
  let day = done(today) ? today : shiftDailyHistoryDay(today, -1), count = 0;
  while (day >= archive.startDay && done(day)) { count++; day = shiftDailyHistoryDay(day, -1); }
  return count;
}

export function dailyTaskMonth(month, today, archive) {
  const first = dailyHistoryDate(month + '-01'), offset = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, index) => {
    const number = index - offset + 1;
    if (number < 1 || number > length) return null;
    const day = month + '-' + ('0' + number).slice(-2), record = archive && archive.days[day];
    return { day, number, today: day === today, complete: Boolean(record && record.tasks.every(task => task.complete)),
      available: Boolean(archive && day >= archive.startDay && day <= today), recorded: Boolean(record) };
  });
}

