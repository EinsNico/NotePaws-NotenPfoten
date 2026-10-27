<template>
  <section class="flow-result-overlay last-result-display" aria-labelledby="single-notes-result-title">
    <header class="flow-result-heading">
      <span aria-hidden="true">✓</span>
      <div>
        <small>{{$t('FLOW_ROUND_RESULT_KICKER')}}</small>
        <h2 id="single-notes-result-title" ref="title" tabindex="-1">{{$t('SINGLE_NOTES_ROUND_COMPLETE')}}</h2>
      </div>
    </header>
    <p class="flow-result-reason">{{$t(reasonLabel)}}</p>
    <div class="flow-result-score" :class="{ 'is-unlimited': isInfiniteRound }">
      <div class="result-value"><strong>{{lastResult.numCorrect}}</strong><span>{{$t('CORRECT')}}</span></div>
      <div class="result-value"><strong>{{lastResult.numWrong}}</strong><span>{{$t('wrong')}}</span></div>
      <div v-if="!isInfiniteRound" class="result-value"><strong>{{lastResult.score}}</strong><span>{{$t('score')}}</span></div>
      <div class="result-value"><strong>{{lastResult.accuracy}} %</strong><span>{{$t('ACCURACY')}}</span></div>
    </div>
    <div class="flow-result-settings">
      <span class="result-mode">{{$t(mode === 'adaptive' ? 'SINGLE_NOTES_LEARNING_MODE' : 'SINGLE_NOTES_FREE_TRAINING')}}</span>
      <span v-if="inputLabel">{{inputLabel}}</span>
      <span v-if="durationLabel">{{durationLabel}}</span>
      <span v-if="isInfiniteRound" class="result-no-score">{{$t('SINGLE_NOTES_NO_SCORE')}}</span>
    </div>
  </section>
</template>

<script>
export default {
  name: 'LastResultDisplay',
  props: {
    lastResult: { type: Object, required: true },
    mode: { type: String, default: 'normal' },
    roundContext: { type: Object, default: null }
  },
  mounted() { this.$nextTick(() => this.$refs.title.focus()); },
  computed: {
    isInfiniteRound() { return this.lastResult.isInfiniteRound === true; },
    reasonLabel() {
      return !this.isInfiniteRound && this.roundContext && this.roundContext.remainingSeconds === 0
        ? 'FLOW_RESULT_TIME_COMPLETE' : 'FLOW_RESULT_MANUAL_COMPLETE';
    },
    inputLabel() {
      const mode = this.roundContext && this.roundContext.inputMode;
      return mode === 'midi' ? 'MIDI' : mode === 'button' ? this.$t('buttons')
        : mode === 'keyboard' ? this.$t('piano') : '';
    },
    durationLabel() {
      const length = this.roundContext && this.roundContext.gameLength;
      const remaining = this.roundContext && this.roundContext.remainingSeconds;
      const seconds = Number.isFinite(length) && Number.isFinite(remaining)
        ? Math.max(0, length - remaining) : null;
      return length > 0 && seconds !== null
        ? this.$t('FLOW_RESULT_DURATION', { value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }) : '';
    }
  }
};
</script>

<style scoped src="../styles/training-session.css"></style>
