<template>
  <section class="sense-statistics" :aria-label="$t('RHYTHM_STATS_TITLE')">
    <header class="statistics-summary">
      <span class="statistics-summary-icon" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M8 30V22M16 30V14M24 30V19M32 30V8M5 31h30" /></svg></span>
      <div class="statistics-summary-copy"><small>{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small><h2>{{$t('RHYTHM_STATS_TITLE')}}</h2><span>{{$t('RHYTHM_STATS_DESCRIPTION')}}</span></div>
    </header>
    <p v-if="state === 'loading'" class="stats-message statistics-section-card" role="status">{{$t('FLOW_STAT_LOADING')}}</p>
    <div v-else-if="state === 'error'" class="stats-message is-error statistics-section-card" role="alert">
      <p>{{$t('FLOW_STAT_LOAD_ERROR')}}</p><button type="button" class="persistence-retry" @click="load">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button>
    </div>
    <template v-else-if="summary.hasResults">
      <section class="stats-overview statistics-section-card">
        <h3>{{$t('ROUND_STATS_RESULTS_TITLE')}}</h3>
        <div class="statistics-metric-grid">
          <StatisticsMetric :value="number(summary.barCount)" :label="$t('RHYTHM_STATS_BARS')" icon="bars" accent="orange" />
          <StatisticsMetric :value="percent(summary.accuracy)" :label="$t('RHYTHM_EVAL_PRECISION')" :percentage="summary.accuracy" />
          <StatisticsMetric :value="duration(summary.durationMs)" :label="$t('RHYTHM_STATS_TIME')" icon="duration" accent="gold" />
          <StatisticsMetric :value="number(summary.evaluated)" :label="$t('RHYTHM_STATS_STRIKES')" icon="strikes" accent="violet" />
          <StatisticsMetric :value="offset(summary.averageOffsetMs)" :label="$t('RHYTHM_STATS_OFFSET')" icon="timing" accent="muted" />
          <StatisticsMetric :value="number(summary.missed)" :label="$t('RHYTHM_RESULT_MISSED')" icon="missed" accent="orange" />
        </div>
        <p class="stats-footnote">{{$t('RHYTHM_STATS_TIME_NOTE')}}</p>
        <p v-if="summary.archivedBarCount" class="stats-footnote">{{$t('RHYTHM_STATS_ARCHIVE_NOTE', { count: number(summary.archivedBarCount) })}}</p>
      </section>
      <section class="stats-history statistics-section-card" :aria-label="$t('RHYTHM_STATS_HISTORY')" :aria-busy="historyLoading ? 'true' : 'false'">
        <div class="history-heading"><div><h3>{{$t('ROUND_STATS_CHART_TITLE')}}</h3><p>{{$t('RHYTHM_STATS_POINT_HINT')}}</p></div><span v-if="rounds.length" class="history-page">{{$t('RHYTHM_STATS_PAGE', { page: number(pageIndex + 1) })}}</span></div>
        <div v-if="historyError" class="stats-message is-error" role="alert"><p>{{$t('FLOW_STAT_LOAD_ERROR')}}</p><button type="button" class="persistence-retry" @click="loadHistory(historyTargetPage)">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button></div>
        <template v-else-if="rounds.length">
          <p class="history-dates">{{date(rounds[0].startedAt)}} – {{date(rounds[rounds.length - 1].completedAt)}}</p>
          <div class="history-chart">
            <svg class="history-axis" viewBox="0 0 38 230" aria-hidden="true" focusable="false">
              <text v-for="tick in [0, 50, 100]" :key="tick" x="34" :y="pointY(tick) + 4" text-anchor="end">{{tick}} %</text>
            </svg>
          <div ref="historyScroll" class="history-scroll app-focus-ring" tabindex="0" :aria-label="$t('RHYTHM_STATS_SCROLL')">
            <div class="history-plot" :style="{ width: plotWidth + 'px' }">
              <svg :viewBox="'0 0 ' + plotWidth + ' 230'" class="history-lines" aria-hidden="true">
                <line v-for="tick in [0, 50, 100]" :key="tick" x1="0" :x2="plotWidth - 18" :y1="pointY(tick)" :y2="pointY(tick)" />
                <polyline :points="linePoints" />
                <text x="40" y="218">{{$t('ROUND_STATS_CHART_OLDEST')}}</text><text :x="plotWidth - 18" y="218" text-anchor="end">{{$t('ROUND_STATS_CHART_NEWEST')}}</text>
              </svg>
              <button v-for="(round, index) in rounds" :key="round.id" type="button" class="history-point"
                :class="{ selected: selectedRound && selectedRound.id === round.id }"
                :style="{ left: pointX(index) + 'px', top: pointY(round.accuracy) + 'px' }"
                :aria-label="pointLabel(round)" :title="pointLabel(round)" :aria-pressed="selectedRound && selectedRound.id === round.id ? 'true' : 'false'"
                @click="selectRound(round, $event.currentTarget)"><span></span></button>
            </div>
          </div>
          </div>
          <nav v-if="hasOlder || pageIndex > 0" class="history-navigation" :aria-label="$t('ROUND_STATS_CHART_PAGE_NAVIGATION')">
            <button type="button" :disabled="historyLoading || !hasOlder" @click="loadHistory(pageIndex + 1)">← {{$t('ROUND_STATS_CHART_PAGE_OLDER')}}</button>
            <span>{{rounds.length}} {{$t('RHYTHM_STATS_ROUNDS')}}</span>
            <button type="button" :disabled="historyLoading || pageIndex === 0" @click="loadHistory(pageIndex - 1)">{{$t('ROUND_STATS_CHART_PAGE_NEWER')}} →</button>
          </nav>
        </template>
        <p v-else-if="!historyLoading" class="stats-message">{{$t('RHYTHM_STATS_NO_DETAILS')}}</p>
        <p v-if="historyLoading" class="stats-footnote" role="status">{{$t('FLOW_STAT_LOADING')}}</p>
      </section>
      <section v-if="selectedRound" class="stats-round statistics-section-card" aria-live="polite">
        <header><h3>{{$t('ROUND_STATS_ROUND_DETAILS')}}</h3><button type="button" :aria-label="$t('ROUND_STATS_CLOSE_DETAILS')" @click="closeRoundDetails">×</button></header>
        <p class="round-date">{{date(selectedRound.completedAt)}}</p>
        <div class="round-key-values"><strong>{{percent(selectedRound.accuracy)}}</strong><span>{{$t('RHYTHM_EVAL_PRECISION')}}</span></div>
        <dl>
          <div><dt>{{$t('FLOW_METER')}}</dt><dd>{{selectedRound.settings.meter || '—'}}</dd></div>
          <div><dt>{{$t('FLOW_SPEED')}}</dt><dd>{{selectedRound.settings.bpm ? selectedRound.settings.bpm + ' BPM' : '—'}}</dd></div>
          <div><dt>{{$t('RHYTHM_STATS_BARS')}}</dt><dd>{{number(selectedRound.barCount)}}</dd></div>
          <div><dt>{{$t('RHYTHM_STATS_TIME')}}</dt><dd>{{duration(selectedRound.durationMs)}}</dd></div>
          <div><dt>{{$t('RHYTHM_STATS_OFFSET')}}</dt><dd>{{offset(selectedRound.averageOffsetMs)}}</dd></div>
        </dl>
        <div class="round-breakdown"><div v-for="item in breakdown" :key="item.key" :class="item.key"><strong>{{number(selectedRound[item.key])}}</strong><span>{{$t(item.label)}}</span></div></div>
        <p v-if="selectedRound.partial" class="stats-footnote">{{$t('RHYTHM_STATS_PARTIAL')}}</p>
      </section>
    </template>
    <div v-else class="stats-empty statistics-section-card"><span aria-hidden="true">♩</span><h3>{{$t('ROUND_STATS_EMPTY_TITLE')}}</h3><p>{{$t('RHYTHM_STATS_EMPTY')}}</p></div>
  </section>
</template>

<script>
import Lockr from 'lockr';
import StatisticsMetric from './StatisticsMetric';
import RhythmSenseRoundStorage from '../model/RhythmSenseRoundStorage';
import { summarizePrestigeArchive, createEmptyPrestigeArchive } from '../model/PrestigeArchive';
import { summarizeRhythmSenseStatistics, readRhythmSenseHistoryPage } from '../model/RhythmSenseStatistics';

export default {
  name: 'RhythmSenseStatistics',
  components: { StatisticsMetric },
  data() {
    return {
      state: 'loading', summary: summarizeRhythmSenseStatistics(),
      rounds: [], selectedRound: null, pageIndex: 0, historyTargetPage: 0, positions: [null],
      hasOlder: false, historyLoading: false, historyError: false, request: 0, viewportWidth: 300,
      breakdown: [
        { key: 'correct', label: 'RHYTHM_RESULT_CORRECT' },
        { key: 'early', label: 'RHYTHM_RESULT_EARLY' },
        { key: 'late', label: 'RHYTHM_RESULT_LATE' },
        { key: 'missed', label: 'RHYTHM_RESULT_MISSED' }
      ]
    };
  },
  computed: {
    locale() { return this.$i18n.locale === 'de' ? 'de-DE' : 'en-GB'; },
    plotWidth() { return Math.max(this.viewportWidth, 240, (this.rounds.length - 1) * 40 + 70); },
    linePoints() { return this.rounds.map((round, index) => this.pointX(index) + ',' + this.pointY(round.accuracy)).join(' '); }
  },
  mounted() {
    this.load();
    window.addEventListener('resize', this.measurePlot);
    if (typeof ResizeObserver !== 'undefined') {
      this.plotObserver = new ResizeObserver(this.measurePlot);
      this.plotObserver.observe(this.$el);
    }
  },
  beforeDestroy() {
    this.request += 1;
    this._roundFocusTarget = null;
    window.removeEventListener('resize', this.measurePlot);
    if (this.plotObserver) this.plotObserver.disconnect();
  },
  methods: {
    async load() {
      const request = ++this.request;
      this.state = 'loading'; this.historyLoading = false; this.historyError = false;
      this.rounds = []; this.selectedRound = null; this.positions = [null]; this.pageIndex = 0;
      try {
        const result = await RhythmSenseRoundStorage.readStatistics();
        if (request !== this.request || this._isDestroyed) return;
        if (!result.saved) throw result.error;
        const archive = summarizePrestigeArchive(Lockr.get('prestigeArchive', null) || createEmptyPrestigeArchive());
        this.summary = summarizeRhythmSenseStatistics(result.statistics, archive.metrics.rhythmBars);
        this.state = 'ready';
        if (this.summary.hasResults) await this.loadHistory(0);
      } catch (error) {
        if (request === this.request && !this._isDestroyed) this.state = 'error';
      }
    },
    async loadHistory(pageIndex) {
      if (this.historyLoading || pageIndex < 0 || pageIndex >= this.positions.length) return;
      const request = this.request;
      this.historyTargetPage = pageIndex; this.historyLoading = true; this.historyError = false; this.selectedRound = null;
      try {
        const result = await RhythmSenseRoundStorage.enqueue(database => readRhythmSenseHistoryPage(
          database, this.positions[pageIndex], 50, () => request === this.request && !this._isDestroyed
        ));
        if (request !== this.request || this._isDestroyed || result.cancelled) return;
        this.rounds = result.rounds; this.pageIndex = pageIndex; this.hasOlder = result.hasOlder;
        this.positions.splice(pageIndex + 1);
        if (result.hasOlder) this.positions.push(result.nextPosition);
        this.measurePlot();
        this.$nextTick(() => {
          const scroll = this.$el.querySelector('.history-scroll');
          if (scroll) scroll.scrollLeft = scroll.scrollWidth;
        });
      } catch (error) {
        if (request === this.request && !this._isDestroyed) this.historyError = true;
      } finally {
        if (request === this.request && !this._isDestroyed) this.historyLoading = false;
      }
    },
    measurePlot() {
      this.$nextTick(() => {
        if (this._isDestroyed) return;
        const scroll = this.$el.querySelector('.history-scroll');
        if (scroll) this.viewportWidth = scroll.clientWidth;
      });
    },
    selectRound(round, focusTarget) {
      this._roundFocusTarget = focusTarget || null;
      this.selectedRound = round;
      this.$nextTick(() => {
        const details = this.$el.querySelector('.stats-round');
        if (details) details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    },
    closeRoundDetails() {
      const focusTarget = this._roundFocusTarget;
      this.selectedRound = null;
      this._roundFocusTarget = null;
      this.$nextTick(() => {
        if (this._isDestroyed) return;
        const target = focusTarget && focusTarget.isConnected
          ? focusTarget : this.$refs.historyScroll;
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      });
    },
    number(value) { return Number(value || 0).toLocaleString(this.locale); },
    percent(value) { return value === null ? '—' : this.number(value) + ' %'; },
    offset(value) { return value === null ? '—' : this.number(value) + ' ms'; },
    duration(value) {
      const seconds = Math.round(Math.max(0, Number(value) || 0) / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      const remaining = seconds % 60;
      return hours ? hours + ' h ' + minutes + ' min' : minutes ? minutes + ' min ' + remaining + ' s' : seconds + ' s';
    },
    date(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(this.locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    },
    pointX(index) { return this.rounds.length < 2 ? (this.plotWidth + 20) / 2 : 40 + index * (this.plotWidth - 60) / (this.rounds.length - 1); },
    pointY(value) { return 20 + (100 - Math.max(0, Math.min(100, Number(value) || 0))) * 1.6; },
    pointLabel(round) { return this.$t('RHYTHM_STATS_POINT', { date: this.date(round.completedAt), accuracy: this.percent(round.accuracy), bars: this.number(round.barCount) }); }
  }
};
</script>

<style scoped>
.sense-statistics { display:grid; gap:12px; min-width:0; margin-top:14px; text-align:left; }
.stats-overview, .stats-history, .stats-round { padding:14px 15px; }
.stats-overview > h3 { margin:0; color:#26383d; font-size:13px; }
.history-heading p { margin:4px 0 0; color:#718084; font-size:11px; line-height:1.45; }
.stats-footnote { margin:10px 0 0; color:#6c7d80; font-size:11px; line-height:1.5; }

.history-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.history-heading h3, .stats-round h3 { margin:0; color:#294c53; font-size:14px; }
.history-page { flex-shrink:0; padding:4px 8px; border-radius:8px; background:#eef4f3; color:#536f75; font-size:10px; }
.history-dates { color:#667d82; font-size:10px; line-height:1.4; }
.history-chart { display:grid; grid-template-columns:38px minmax(0,1fr); min-width:0; border:1px solid #dbe9e9; border-radius:13px; background:#f7fbfa; }
.history-axis { display:block; width:38px; height:230px; }
.history-axis text { fill:#6d8287; font-size:10px; }
.history-scroll { min-width:0; overflow-x:auto; overscroll-behavior-x:contain; border-radius:0 13px 13px 0; }
.history-plot { position:relative; height:230px; }
.history-lines { position:absolute; inset:0; width:100%; height:230px; }
.history-lines line { stroke:#dce8e7; stroke-dasharray:3 4; }
.history-lines text { fill:#6d8287; font-size:10px; }
.history-lines polyline { fill:none; stroke:#2d7b86; stroke-width:2; stroke-linejoin:round; }
.history-point { position:absolute; display:grid; width:40px; height:40px; padding:0; place-items:center; border:0; background:transparent; transform:translate(-50%,-50%); cursor:pointer; }
.history-point span { display:block; box-sizing:border-box; width:10px; height:10px; border:2px solid #fff; border-radius:50%; background:#2d7b86; box-shadow:0 0 0 1px #2d7b86; }
.history-point.selected span { width:14px; height:14px; background:#d6612d; box-shadow:0 0 0 2px #eeb898; }
.history-navigation { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; }
.history-navigation span { font-size:10px; color:#6c7d80; }
.history-navigation button, .stats-message button { min-height:36px; padding:7px 10px; border:1px solid #cbdcdd; border-radius:10px; background:#f4faf9; color:#315f68; font:inherit; font-size:11px; font-weight:700; cursor:pointer; }
button:disabled { opacity:.45; cursor:default; }

.stats-round header { display:flex; justify-content:space-between; align-items:center; }
.stats-round header button { width:36px; height:36px; padding:0; border:0; background:transparent; color:#8a5c3e; font-size:25px; cursor:pointer; }
.round-date { margin:0 0 12px; color:#776f65; font-size:11px; }
.round-key-values { display:flex; align-items:baseline; gap:8px; color:#b85327; }
.round-key-values strong { font-size:27px; }
.round-key-values span { color:#766f66; font-size:12px; }
.stats-round dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:16px 0; }
.stats-round dl > div { min-width:0; }
.stats-round dt { color:#746e66; font-size:11px; }
.stats-round dd { margin:3px 0 0; color:#3b555a; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
.round-breakdown { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
.round-breakdown > div { display:flex; min-width:0; flex-direction:column; gap:3px; padding:8px 4px; border-radius:8px; background:#fff; text-align:center; }
.round-breakdown strong { min-width:0; overflow-wrap:anywhere; font-size:16px; color:#38626c; }
.round-breakdown span { color:#706e67; font-size:10px; }
.round-breakdown .correct strong { color:var(--sense-correct,#247047); }
.round-breakdown .early strong { color:var(--sense-early,#895c16); }
.round-breakdown .late strong { color:var(--sense-late,#a63e32); }
.round-breakdown .missed strong { color:var(--sense-missed,#53646c); }
.stats-message { margin:0; padding:18px 15px; color:#677c82; font-size:12px; text-align:center; }
.is-error { color:#9c422a; }
.stats-empty { padding:30px 12px 20px; text-align:center; color:#667a80; }
.stats-empty > span { font-size:36px; color:#bd8732; }
.stats-empty h3 { font-size:15px; color:#294c53; }
.stats-empty p { font-size:12px; line-height:1.5; }
@media (max-width:480px) { .history-heading { flex-wrap:wrap; } .round-breakdown { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
