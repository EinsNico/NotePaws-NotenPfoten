<template>
  <div class="daily-tasks-anchor" ref="anchor">
    <button ref="trigger" type="button" class="daily-tasks-trigger" :class="{ 'is-complete': complete }"
      aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'" aria-controls="daily-tasks-dialog"
      :aria-label="$t('DAILY_TASKS') + ', ' + statusLabel"
      @click="toggle">
      <span class="daily-tasks-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <rect x="4" y="4" width="16" height="17" rx="3" /><path d="M9 3h6v3H9zM8 11h2m3 0h3m-8 5h2m3 0h3" />
        </svg>
        <span v-if="complete" class="daily-tasks-complete-mark"><svg viewBox="0 0 24 24" focusable="false"><path d="m5 12 4 4 10-10" /></svg></span>
      </span>
      <strong>{{$t('DAILY_TASKS')}}</strong>
    </button>
    <span v-if="open" class="daily-tasks-pointer" :class="{ 'is-above': above, 'is-side-right': side === 'right', 'is-side-left': side === 'left' }" :style="pointerPosition" aria-hidden="true"></span>
    <section v-if="open" ref="dialog" id="daily-tasks-dialog" class="daily-tasks-popover"
      :class="{ 'is-above': above }" :style="position" role="dialog" aria-modal="false"
      aria-labelledby="daily-tasks-title" tabindex="-1">
      <header>
        <div>
          <button type="button" class="daily-tasks-date" :aria-label="$t(view === 'calendar' ? 'DAILY_HISTORY_TODAY' : 'DAILY_HISTORY_OPEN')"
            :aria-expanded="view === 'calendar' ? 'true' : 'false'" @click="toggleCalendar">
            {{view === 'day' ? selectedDateLabel : dateLabel}}
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v5m10-5v5M3 11h18" /></svg>
          </button>
          <h2 id="daily-tasks-title">{{$t(view === 'tasks' ? 'DAILY_TASKS_TODAY' : view === 'calendar' ? 'DAILY_HISTORY_TITLE' : 'DAILY_HISTORY_DAY')}}</h2>
        </div>
        <button type="button" class="daily-tasks-close" :aria-label="$t('DAILY_TASKS_CLOSE')" @click="close()">×</button>
      </header>
      <button v-if="view !== 'tasks'" type="button" class="daily-history-back" @click="backToTasks">
        <span aria-hidden="true">←</span> {{$t(view === 'day' ? 'DAILY_HISTORY_BACK' : 'DAILY_HISTORY_TODAY')}}
      </button>
      <p v-if="loading" class="daily-tasks-notice" role="status">{{$t('DAILY_TASKS_LOADING')}}</p>
      <div v-else-if="error" class="daily-tasks-notice" role="status">
        <p>{{$t('DAILY_TASKS_ERROR')}}</p><button type="button" @click="refresh">{{$t('DAILY_TASKS_RETRY')}}</button>
      </div>
      <template v-else>
        <p v-if="view === 'calendar' && historyLoading && !archive" class="daily-tasks-notice" role="status">{{$t('DAILY_HISTORY_LOADING')}}</p>
        <DailyTaskCalendar v-if="view === 'calendar' && archive" :archive="archive" :today="day" :month="calendarMonth"
          @month="calendarMonth = $event" @select="selectDay" />
        <p v-if="view === 'day' && !selectedTasks.length" class="daily-tasks-notice">{{$t('DAILY_HISTORY_NO_ENTRY')}}</p>
        <ul v-if="view !== 'calendar'" class="daily-task-list">
          <li v-for="task in displayedTasks" :key="task.id" :class="['daily-task-' + task.mode, { 'is-complete': task.complete }]">
            <span class="daily-task-check" :aria-label="$t(task.complete ? 'DAILY_TASKS_DONE' : 'DAILY_TASKS_TODO')">
              <svg v-if="task.complete" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
            </span>
            <div class="daily-task-copy">
              <strong>{{$tc('DAILY_TASK_' + task.mode.toUpperCase(), task.goal, { count: task.goal })}}</strong>
              <div class="daily-task-progress" role="progressbar" :aria-label="$t('DAILY_TASKS_PROGRESS')"
                :aria-valuenow="task.value" :aria-valuemax="task.goal" aria-valuemin="0">
                <span :style="{ width: (task.value / task.goal * 100) + '%' }"></span>
              </div>
              <div class="daily-task-bottom"><small>{{task.value}} / {{task.goal}}</small>
                <button v-if="!task.complete && (view === 'tasks' || selectedDay === day)" type="button" @click="start(task.mode)">{{$t('DAILY_TASKS_START')}} <span aria-hidden="true">→</span></button>
                <small v-else-if="task.complete" class="daily-task-done">{{$t('DAILY_TASKS_DONE')}}</small>
              </div>
            </div>
          </li>
        </ul>
        <p v-if="view === 'tasks' && complete" class="daily-tasks-footer is-complete" role="status">
          {{$t('DAILY_TASKS_ALL_DONE')}}
        </p>
        <div v-if="historyError" class="daily-history-error" role="status">
          <p>{{$t('DAILY_HISTORY_ERROR')}}</p><button type="button" @click="refresh">{{$t('DAILY_TASKS_RETRY')}}</button>
        </div>
        <p v-else-if="historyLoading" class="daily-tasks-notice" role="status">{{$t('DAILY_HISTORY_LOADING')}}</p>
        <div v-else-if="archive" class="daily-history-streak" :class="{ 'is-active': streak > 0 }" role="status">
          <svg v-if="streak > 0" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
          <strong>{{$tc('DAILY_HISTORY_STREAK', streak, { count: streak })}}</strong>
        </div>
      </template>
    </section>
  </div>
</template>

<script>
import { createDailyTasks, dailyTaskDay, readDailyTasks } from '../model/DailyTasks';
import { updateDailyTaskHistory, dailyTaskStreak, dailyHistoryDate } from '../model/DailyTaskHistory';
import DailyTaskCalendar from './DailyTaskCalendar';

export default {
  name: 'DailyTasksButton',
  components: { DailyTaskCalendar },
  data() {
    return { open: false, day: dailyTaskDay().key, tasks: createDailyTasks(), loading: true, error: false,
      position: {}, pointerPosition: {}, above: false, side: '',
      view: 'tasks', archive: null, historyLoading: false, historyError: false,
      selectedDay: null, calendarMonth: dailyTaskDay().key.slice(0, 7) };
  },
  computed: {
    complete() { return !this.loading && !this.error && this.tasks.every(task => task.complete); },
    statusLabel() { return this.$t(this.loading ? 'DAILY_TASKS_LOADING_SHORT' : this.error ? 'DAILY_TASKS_ERROR_SHORT'
      : this.complete ? 'DAILY_TASKS_DONE' : 'DAILY_TASKS_TODO'); },
    dateLabel() {
      return new Date(this.day + 'T12:00:00').toLocaleDateString(this.$i18n.locale === 'de' ? 'de-DE' : 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'long' });
    },
    selectedDateLabel() { return this.selectedDay ? dailyHistoryDate(this.selectedDay).toLocaleDateString(this.$i18n.locale === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : this.dateLabel; },
    selectedTasks() { return this.selectedDay === this.day ? this.tasks : this.archive && this.archive.days[this.selectedDay] ? this.archive.days[this.selectedDay].tasks : []; },
    displayedTasks() { return this.view === 'day' ? this.selectedTasks : this.tasks; },
    streak() { return dailyTaskStreak(this.archive, this.day); }
  },
  mounted() {
    this.disposed = false;
    this.refresh();
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('focusin', this.focusOutside);
    document.addEventListener('keydown', this.keydown);
    document.addEventListener('visibilitychange', this.checkVisible);
    document.addEventListener('resume', this.checkVisible);
    window.addEventListener('focus', this.checkVisible);
    window.addEventListener('storage', this.checkVisible);
    window.addEventListener('resize', this.measure);
    window.addEventListener('scroll', this.measure, true);
    this.refreshTimer = setInterval(() => {
      if (!document.hidden && (this.open || dailyTaskDay().key !== this.day)) this.refresh();
    }, 15000);
  },
  beforeDestroy() {
    this.disposed = true;
    clearInterval(this.refreshTimer);
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('focusin', this.focusOutside);
    document.removeEventListener('keydown', this.keydown);
    document.removeEventListener('visibilitychange', this.checkVisible);
    document.removeEventListener('resume', this.checkVisible);
    window.removeEventListener('focus', this.checkVisible);
    window.removeEventListener('storage', this.checkVisible);
    window.removeEventListener('resize', this.measure);
    window.removeEventListener('scroll', this.measure, true);
  },
  methods: {
    async refresh() {
      if (this.disposed || this.refreshing) return;
      this.refreshing = true;
      const day = dailyTaskDay().key;
      if (day !== this.day) { this.day = day; this.tasks = createDailyTasks(); this.loading = true; this.calendarMonth = day.slice(0, 7); }
      const result = await readDailyTasks();
      if (this.disposed) { this.refreshing = false; return; }
      // A read finishing over midnight must not restore yesterday's green state.
      if (result.day !== dailyTaskDay().key) { this.refreshing = false; this.refresh(); return; }
      this.day = result.day; this.tasks = result.tasks; this.error = result.error; this.loading = false;
      if (!result.error) {
        this.historyLoading = true;
        const history = await updateDailyTaskHistory(result, { cancelled: () => this.disposed });
        this.historyLoading = false;
        if (!this.disposed) {
          if (this.day !== dailyTaskDay().key) { this.refreshing = false; this.refresh(); return; }
          this.archive = history.archive; this.historyError = history.error;
          if (!history.error && history.archive && history.archive.days[this.day]) this.tasks = history.archive.days[this.day].tasks;
        }
      }
      this.refreshing = false;
      if (this.disposed) return;
      this.$nextTick(this.measure);
    },
    toggle() {
      if (this.open) { this.close(); return; }
      this.view = 'tasks'; this.selectedDay = null; this.calendarMonth = this.day.slice(0, 7);
      this.open = true; this.refresh();
      this.$nextTick(() => { this.measure(); if (this.$refs.dialog) this.$refs.dialog.focus({ preventScroll: true }); });
    },
    close(returnFocus = true) {
      if (!this.open) return false;
      this.open = false;
      if (returnFocus && this.$refs.trigger) this.$refs.trigger.focus({ preventScroll: true });
      return true;
    },
    start(mode) { this.close(false); this.$emit('start', mode); },
    toggleCalendar() { this.view = this.view === 'calendar' ? 'tasks' : 'calendar'; this.$nextTick(this.measure); },
    selectDay(day) { this.selectedDay = day; this.view = 'day'; this.$nextTick(() => { this.measure(); if (this.$refs.dialog) this.$refs.dialog.focus({ preventScroll: true }); }); },
    backToTasks() { this.view = this.view === 'day' ? 'calendar' : 'tasks'; this.$nextTick(this.measure); },
    outside(event) { if (this.open && !this.$refs.anchor.contains(event.target)) this.close(false); },
    focusOutside(event) { if (this.open && !this.$refs.anchor.contains(event.target)) this.close(false); },
    keydown(event) {
      if (this.open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    },
    checkVisible() { if (!document.hidden) this.refresh(); },
    measure() {
      if (!this.open || !this.$refs.trigger) return;
      const rect = this.$refs.trigger.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 24, above = rect.top - 24;
      const rightSpace = window.innerWidth - rect.right - 24, leftSpace = rect.left - 24;
      this.side = '';
      // Short landscape screens have more useful space beside the trigger.
      // Keep that trigger reachable while giving the calendar room to scroll.
      if (this.view !== 'tasks' && Math.max(below, above) < 300 && Math.max(rightSpace, leftSpace) >= width) {
        this.side = rightSpace >= width ? 'right' : 'left'; this.above = false;
        this.position = { left: (this.side === 'right' ? rect.right + 12 : rect.left - width - 12) + 'px',
          width: width + 'px', top: '12px', bottom: 'auto', maxHeight: window.innerHeight - 24 + 'px' };
        this.pointerPosition = { left: (this.side === 'right' ? rect.right + 6 : rect.left - 18) + 'px',
          top: Math.max(24, Math.min(window.innerHeight - 30, rect.top + rect.height / 2 - 6)) + 'px' };
        return;
      }
      this.above = below < 180 && above > below;
      this.position = { left: left + 'px', width: width + 'px',
        maxHeight: Math.max(100, this.above ? above : below) + 'px',
        top: this.above ? 'auto' : rect.bottom + 12 + 'px',
        bottom: this.above ? window.innerHeight - rect.top + 12 + 'px' : 'auto' };
      const pointerLeft = Math.max(18, Math.min(width - 26, rect.left + rect.width / 2 - left));
      this.pointerPosition = { left: left + pointerLeft - 6 + 'px', top: (this.above ? rect.top - 18 : rect.bottom + 6) + 'px' };
    }
  }
};
</script>

<style scoped>
.daily-tasks-anchor { position: relative; z-index: 30; }
.daily-tasks-trigger { display: inline-flex; min-height: 40px; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid #d4dedd; border-radius: 12px; background: #edf1f0; color: #506264; font: inherit; text-align: left; cursor: pointer; }
.daily-tasks-icon { position: relative; display: block; width: 22px; height: 22px; flex-shrink: 0; }
.daily-tasks-icon > svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.daily-tasks-complete-mark { position: absolute; top: -5px; right: -6px; display: grid; place-items: center; width: 15px; height: 15px; border: 2px solid #e1f3e7; border-radius: 50%; background: #288352; color: white; }
.daily-tasks-complete-mark svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.daily-tasks-trigger strong { display: block; }
.daily-tasks-trigger strong { font-size: 11px; font-weight: 800; }
.daily-tasks-trigger.is-complete { border-color: #a7d5b9; background: #e1f3e7; color: #246443; }
.daily-tasks-trigger:focus-visible, .daily-tasks-popover button:focus-visible { outline: 3px solid #d99a47; outline-offset: 3px; }
.daily-tasks-popover { position: fixed; z-index: 80; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; padding: 17px; border: 1px solid #d7e0dc; border-radius: 20px; background: #fffefa; box-shadow: 0 14px 42px rgba(40,55,49,.22); color: #2c4246; text-align: left; }
.daily-tasks-pointer { position: fixed; z-index: 81; width: 12px; height: 12px; transform: rotate(45deg); border-top: 1px solid #d7e0dc; border-left: 1px solid #d7e0dc; background: #fffefa; pointer-events: none; }
.daily-tasks-pointer.is-above { transform: rotate(225deg); }
.daily-tasks-pointer.is-side-right { transform: rotate(-45deg); }
.daily-tasks-pointer.is-side-left { transform: rotate(135deg); }
.daily-tasks-popover > header { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 14px; }
.daily-tasks-popover header small { font-size: 10px; color: #7b8887; }
.daily-tasks-date { display: inline-flex; align-items: center; gap: 5px; margin-left: -4px; padding: 4px; border: 0; border-radius: 5px; background: transparent; color: #708177; font: inherit; font-size: 10px; cursor: pointer; }
.daily-tasks-date:hover { background: #edf3ec; }
.daily-tasks-date svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.daily-history-back { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; margin: -4px 0 10px; padding: 4px 7px; border: 0; border-radius: 7px; background: #edf3ec; color: #3d7160; font: inherit; font-size: 11px; cursor: pointer; }
.daily-history-streak { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 12px; padding: 10px; border-radius: 12px; background: #edf2ec; color: #718173; font-size: 12px; }
.daily-history-streak.is-active { background: #e2f3e7; color: #286c48; }
.daily-history-streak svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; }
.daily-history-error { margin-top: 12px; padding: 10px; border: 1px solid #e3d5b7; border-radius: 11px; background: #fff8e9; color: #806132; font-size: 11px; line-height: 1.4; }
.daily-history-error p { margin: 0 0 5px; }
.daily-history-error button { min-height: 30px; border: 0; background: transparent; color: #806132; font: inherit; font-weight: 700; cursor: pointer; }
.daily-tasks-popover h2 { margin: 4px 0 0; font-size: 18px; line-height: 1.2; }
.daily-tasks-close { width: 32px; height: 32px; flex-shrink: 0; border: 0; border-radius: 50%; background: #edf1ef; color: #526965; font: inherit; font-size: 23px; cursor: pointer; }
.daily-task-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.daily-task-list li { --task-color: #d45a29; display: flex; gap: 10px; padding: 12px; border: 1px solid #e4e6e1; border-left: 3px solid var(--task-color); border-radius: 13px; background: #fafaf6; }
.daily-task-list .daily-task-melody { --task-color: #2e7683; }
.daily-task-list .daily-task-chords { --task-color: #2e7683; }
.daily-task-list .daily-task-rhythm { --task-color: #a67a24; }
.daily-task-check { display: grid; place-items: center; flex-shrink: 0; width: 19px; height: 19px; box-sizing: border-box; margin-top: 1px; border: 1.5px solid #c7d1cb; border-radius: 50%; }
.is-complete > .daily-task-check { background: #288352; border-color: #288352; color: white; }
.daily-task-check svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.daily-task-copy { min-width: 0; flex: 1; }
.daily-task-copy > strong { display: block; font-size: 13px; line-height: 1.4; }
.daily-task-progress { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 4px; background: #e1e8e1; }
.daily-task-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--task-color); }
.is-complete .daily-task-progress > span { background: #288352; }
.daily-task-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; gap: 5px; }
.daily-task-bottom small { color: #72817c; font-size: 10px; }
.daily-task-bottom .daily-task-done { color: #288352; }
.daily-task-bottom button, .daily-tasks-notice button { min-height: 30px; padding: 3px 6px; border: 0; border-radius: 7px; background: transparent; color: var(--task-color, #2e7683); font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
.daily-tasks-footer { margin: 13px 0 0; color: #7a8881; font-size: 11px; line-height: 1.5; }
.daily-tasks-footer.is-complete { color: #288352; }
.daily-tasks-notice { margin: 12px 0; font-size: 12px; line-height: 1.5; }
</style>
