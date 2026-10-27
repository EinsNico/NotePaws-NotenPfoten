<template>
  <section class="daily-calendar" :aria-label="$t('DAILY_HISTORY_TITLE')">
    <div class="daily-calendar-navigation">
      <button type="button" :disabled="month <= archive.startDay.slice(0, 7)" :aria-label="$t('DAILY_HISTORY_PREVIOUS')" @click="move(-1)">‹</button>
      <h3 ref="monthHeading" tabindex="-1">{{monthLabel}}</h3>
      <button type="button" :disabled="month >= today.slice(0, 7)" :aria-label="$t('DAILY_HISTORY_NEXT')" @click="move(1)">›</button>
    </div>
    <div class="daily-calendar-weekdays" aria-hidden="true"><span v-for="(label, index) in weekdays" :key="index">{{label}}</span></div>
    <div class="daily-calendar-grid" :aria-label="monthLabel">
      <template v-for="(cell, index) in cells">
        <span v-if="!cell" :key="'empty-' + index" aria-hidden="true"></span>
        <button v-else :key="cell.day" type="button" :disabled="!cell.available"
          :class="{ 'is-today': cell.today, 'is-complete': cell.complete }"
          :aria-current="cell.today ? 'date' : null" :aria-label="dayLabel(cell)" @click="$emit('select', cell.day)">
          <span>{{cell.number}}</span>
          <svg v-if="cell.complete" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
        </button>
      </template>
    </div>
    <p class="daily-calendar-start">{{$t('DAILY_HISTORY_SINCE', { date: shortDate(archive.startDay) })}}</p>
  </section>
</template>

<script>
import { dailyHistoryDate, dailyTaskMonth } from '../model/DailyTaskHistory';
export default {
  name: 'DailyTaskCalendar',
  props: { archive: { type: Object, required: true }, today: { type: String, required: true }, month: { type: String, required: true } },
  computed: {
    locale() { return this.$i18n.locale === 'de' ? 'de-DE' : 'en-GB'; },
    monthLabel() { return dailyHistoryDate(this.month + '-01').toLocaleDateString(this.locale, { month: 'long', year: 'numeric' }); },
    cells() { return dailyTaskMonth(this.month, this.today, this.archive); },
    weekdays() { return Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(this.locale, { weekday: 'short' })); }
  },
  methods: {
    shortDate(day) { return dailyHistoryDate(day).toLocaleDateString(this.locale, { day: 'numeric', month: 'short', year: 'numeric' }); },
    dayLabel(cell) {
      const date = dailyHistoryDate(cell.day).toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return date + ': ' + this.$t(cell.complete ? 'DAILY_TASKS_DONE' : cell.available && cell.recorded ? 'DAILY_TASKS_TODO' : 'DAILY_HISTORY_NO_ENTRY');
    },
    move(amount) {
      const date = dailyHistoryDate(this.month + '-01'); date.setMonth(date.getMonth() + amount);
      this.$emit('month', date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2));
      this.$nextTick(() => { if (this.$refs.monthHeading) this.$refs.monthHeading.focus({ preventScroll: true }); });
    }
  }
};
</script>

<style scoped>
.daily-calendar-navigation { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
.daily-calendar-navigation h3 { margin: 0; font-size: 15px; text-transform: capitalize; }
.daily-calendar-navigation button { width: 34px; height: 34px; border: 1px solid #dbe3dd; border-radius: 11px; background: #f0f4ef; color: #48675a; font: inherit; font-size: 25px; cursor: pointer; }
.daily-calendar button:disabled { opacity: .35; cursor: default; }
.daily-calendar-weekdays, .daily-calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.daily-calendar-weekdays { margin-bottom: 7px; color: #7a8780; text-align: center; font-size: 10px; }
.daily-calendar-grid button { position: relative; min-width: 0; min-height: 35px; aspect-ratio: 1; border: 1px solid #e0e6df; border-radius: 10px; background: #eef2ec; color: #596a5e; font: inherit; font-size: 12px; cursor: pointer; }
.daily-calendar-grid button.is-complete { border-color: #a8d2b7; background: #def1e4; color: #236943; font-weight: 800; }
.daily-calendar-grid button.is-today { outline: 2px solid #2e7683; outline-offset: 1px; }
.daily-calendar-grid svg { position: absolute; right: 1px; bottom: 0; width: 12px; height: 12px; fill: none; stroke: #288352; stroke-width: 2.7; stroke-linecap: round; stroke-linejoin: round; }
.daily-calendar-start { margin: 12px 0 0; color: #7a8780; font-size: 10px; line-height: 1.4; }
</style>
