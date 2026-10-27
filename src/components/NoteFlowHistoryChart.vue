<template>
  <section class="flow-history">
    <RoundHistoryChart
      :rounds="rounds"
      :selected-round-id="selectedRound ? selectedRound.id : null"
      :history-window="historyWindow"
      :loading="historyState !== 'ready'"
      accuracy-only
      @request-window="loadWindow"
      @select-round="selectRound">
      <div slot="status" aria-live="polite">
        <p v-if="historyState === 'loading'" class="history-status">{{$t('FLOW_STAT_LOADING')}}</p>
        <div v-else-if="historyState === 'error'" class="history-status is-error" role="alert">
          <span>{{$t('FLOW_STAT_LOAD_ERROR')}}</span>
          <button type="button" class="persistence-retry" @click="loadWindow(historyWindow)">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button>
        </div>
        <p v-else-if="historyWindow.unratedCount" class="history-status">{{$t('FLOW_HISTORY_UNRATED_HINT')}}</p>
      </div>
    </RoundHistoryChart>

    <article v-if="selectedRound" class="flow-round-details" aria-live="polite">
      <header>
        <h4>{{$t('ROUND_STATS_ROUND_DETAILS')}}</h4>
        <button type="button" :aria-label="$t('ROUND_STATS_CLOSE_DETAILS')" @click="selectRound(null)">×</button>
      </header>
      <strong>{{$t('ROUND_STATS_ROUND_NUMBER', { number: formatNumber(selectedRoundNumber) })}}</strong>
      <p>{{formatDate(selectedRound.completedAt)}}</p>
      <p v-if="!evaluatedInputs">{{$t('FLOW_HISTORY_NO_INPUTS')}}</p>
      <dl>
        <div><dt>{{$t('FLOW_STAT_ACCURACY')}}</dt><dd>{{selectedRound.score.accuracy}} %</dd></div>
        <div><dt>{{$t(evaluatedLabelKey)}}</dt><dd>{{evaluatedInputs}}</dd></div>
        <div><dt>{{$t('CORRECT')}}</dt><dd>{{selectedRound.score.correct}}</dd></div>
        <div><dt>{{$t('wrong')}}</dt><dd>{{selectedRound.score.wrong}}</dd></div>
        <div><dt>{{$t('FLOW_RESULT_MISSED')}}</dt><dd>{{selectedRound.score.missed}}</dd></div>
        <div><dt>{{$t('FLOW_STAT_PLAY_TIME')}}</dt><dd>{{$t('ROUND_STATS_SECONDS', { count: Math.round(selectedRound.durationMs / 1000) })}}</dd></div>
        <div><dt>{{$t('FLOW_STAT_TIMING_OFFSET')}}</dt><dd>{{timingOffset}}</dd></div>
        <div v-if="settings.bpm !== null && settings.bpm !== undefined"><dt>{{$t('FLOW_HISTORY_TEMPO')}}</dt><dd>{{settings.bpm}} BPM</dd></div>
        <div v-if="settings.behavior"><dt>{{$t('FLOW_INPUT_BEHAVIOR')}}</dt><dd>{{$t(settings.behavior === 'wait' ? 'FLOW_WAIT' : 'FLOW_CONTINUOUS')}}</dd></div>
        <div v-if="showHandMode && settings.handMode"><dt>{{$t('FLOW_HAND_MODE')}}</dt><dd>{{$t(settings.handMode === 'two' ? 'FLOW_TWO_HANDS' : 'FLOW_ONE_HAND')}}</dd></div>
        <div v-if="settings.movement"><dt>{{$t(movementLabelKey)}}</dt><dd>{{$t(movementKey)}}</dd></div>
        <div v-if="noteDensity !== null"><dt>{{$t('FLOW_ALGORITHM_NOTE_DENSITY')}}</dt><dd>{{noteDensity}} %</dd></div>
        <slot name="additional-details" :round="selectedRound" :settings="settings" />
      </dl>
      <slot name="rhythm-details" :round="selectedRound" :settings="settings">
        <NoteFlowRhythmSummary :settings="settings" />
        <p v-if="!settings.rhythm">{{$t('FLOW_RHYTHM_NOT_RECORDED')}}</p>
      </slot>
    </article>
  </section>
</template>

<script>
import RoundHistoryChart from "./RoundHistoryChart";
import NoteFlowRhythmSummary from "./NoteFlowRhythmSummary";
import NoteFlowRoundStorage from "../model/NoteFlowRoundStorage";
import { formatHistoryNumber } from "../model/HistoryChartWindow";
import { getNoteFlowMovementLabelKey } from "../model/NoteFlowMovement";
import { createNoteFlowHistoryWindow, createNoteFlowHistoryData, evaluatedNoteFlowInputs } from "../model/NoteFlowHistoryWindow";

export default {
  name: "NoteFlowHistoryChart",
  components: { RoundHistoryChart, NoteFlowRhythmSummary },
  props: {
    inputGroup: { type: String, required: true },
    totalRoundCount: { type: Number, required: true },
    exerciseType: { type: String, default: "melody" },
    evaluatedLabelKey: { type: String, default: "FLOW_STAT_TOTAL_NOTES" },
    movementLabelKey: { type: String, default: "FLOW_MELODY_MOVEMENT" },
    showHandMode: { type: Boolean, default: true }
  },
  data() {
    return {
      rounds: [],
      historyWindow: createNoteFlowHistoryWindow(this.totalRoundCount),
      historyState: "loading",
      loadToken: 0,
      selectedRound: null,
      selectedRoundNumber: null
    };
  },
  computed: {
    settings() { return this.selectedRound && this.selectedRound.settings || {}; },
    evaluatedInputs() { return evaluatedNoteFlowInputs(this.selectedRound); },
    movementKey() { return getNoteFlowMovementLabelKey(this.settings.movement); },
    noteDensity() {
      const value = this.settings.rhythm && this.settings.rhythm.noteDensity;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    timingOffset() {
      const value = this.selectedRound && this.selectedRound.timing && this.selectedRound.timing.averageAbsoluteOffsetMs;
      return typeof value === "number" && Number.isFinite(value) ? `${value} ms` : "—";
    }
  },
  watch: {
    exerciseType() { return this.loadWindow(this.historyWindow); },
    inputGroup() { return this.loadWindow(this.historyWindow); },
    totalRoundCount() { return this.loadWindow(this.historyWindow); }
  },
  methods: {
    async loadWindow(request = {}) {
      const token = ++this.loadToken;
      const window = createNoteFlowHistoryWindow(this.totalRoundCount, request.limit, request.page);
      this.selectRound(null);
      this.historyWindow = window;
      this.historyState = "loading";
      try {
        const result = await NoteFlowRoundStorage.readHistoryWindow(this.inputGroup, window.readStart, window.endIndex, this.exerciseType);
        if (token !== this.loadToken) return;
        if (!result.saved || result.rounds.length !== window.endIndex - window.readStart) {
          this.historyState = "error";
          return;
        }
        const data = createNoteFlowHistoryData(window, result.rounds);
        this.rounds = data.rounds;
        this.historyWindow = data.window;
        this.historyState = "ready";
      } catch (error) {
        if (token === this.loadToken) this.historyState = "error";
      }
    },
    selectRound(round, number = null) {
      this.selectedRound = round && this.historyState === "ready" ? round.sourceRound : null;
      this.selectedRoundNumber = this.selectedRound ? number : null;
    },
    formatNumber(value) { return formatHistoryNumber(value, this.$i18n.locale); },
    formatDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(this.$i18n.locale === "de" ? "de-DE" : "en-GB");
    }
  },
  mounted() { this.loadWindow(); },
  beforeDestroy() { this.loadToken += 1; }
};
</script>

<style scoped>
.flow-history { min-width: 0; }
.history-status { margin: 10px 0; color: #61777c; font-size: 11px; line-height: 1.5; }
.history-status.is-error { display: flex; flex-wrap: wrap; gap: 8px; color: #a64a2c; }
.history-status button, .flow-round-details header button {
  min-height: 36px; padding: 6px 12px; border: 1px solid #a6c6cd; border-radius: 9px;
  background: white; color: #315e6a; cursor: pointer;
}
.flow-round-details { margin-top: 10px; padding: 14px; border: 1px solid #d5e8ef; border-radius: 12px; background: #f4fafb; color: #425e65; font-size: 12px; }
.flow-round-details header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.flow-round-details h4 { margin: 0; font-size: 12px; color: #294b52; }
.flow-round-details header button { min-width: 36px; font-size: 20px; }
.flow-round-details p { margin: 8px 0; line-height: 1.5; }
.flow-round-details dl { margin: 12px 0 0; }
.flow-round-details dl > div { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-top: 1px solid #deebee; }
.flow-round-details dt { color: #61777c; }
.flow-round-details dd { margin: 0; text-align: right; font-weight: bold; }
</style>
