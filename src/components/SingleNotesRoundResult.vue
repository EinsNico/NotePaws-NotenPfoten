<template>
  <main class="flow-game-preview single-notes-result-screen">
    <div class="flow-game-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="flow-game-backdrop" />
    </div>
    <div class="flow-game-shell single-notes-result-shell">
      <section class="flow-game-status">
        <div class="flow-game-title">
          <span class="flow-game-title-mark" aria-hidden="true"></span>
          <div>
            <small>{{$t('HOME_TRAINING_KICKER')}}</small>
            <h1>{{$t('HOME_SINGLE_NOTES')}}</h1>
          </div>
        </div>
        <div class="flow-training-controls">
          <button type="button" class="flow-training-exit result-settings" @click="$emit('settings')">{{$t('FLOW_BACK_TO_SETTINGS')}}</button>
          <button type="button" class="flow-training-play result-again" @click="$emit('play-again')">
            <span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>{{$t('FLOW_PLAY_AGAIN')}}
          </button>
          <button type="button" class="flow-training-pause result-statistics" @click="$emit('statistics')">{{$t('SINGLE_NOTES_RESULT_STATISTICS')}}</button>
        </div>
        <div class="flow-live-score">
          <div><strong>{{remainingTimeLabel}}</strong><span>{{$t('TIME')}}</span></div>
          <div><strong>{{lastResult.numCorrect}}</strong><span>{{$t('CORRECT')}}</span></div>
          <div><strong>{{lastResult.accuracy}} %</strong><span>{{$t('ACCURACY')}}</span></div>
        </div>
      </section>
      <section class="flow-stage-card has-overlay">
        <LastResultDisplay :last-result="lastResult" :mode="mode" :round-context="roundContext" />
      </section>
    </div>
  </main>
</template>

<script>
import HomeMusicBackdrop from './HomeMusicBackdrop';
import LastResultDisplay from './LastResultDisplay';
export default {
  name: 'SingleNotesRoundResult',
  components: { HomeMusicBackdrop, LastResultDisplay },
  props: {
    lastResult: { type: Object, required: true },
    mode: { type: String, default: 'normal' },
    roundContext: { type: Object, default: null }
  },
  computed: {
    remainingTimeLabel() {
      if (this.lastResult.isInfiniteRound === true) return '∞';
      const seconds = Math.max(0, Math.ceil(this.roundContext && this.roundContext.remainingSeconds || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
  }
};
</script>

<style scoped src="../styles/training-session.css"></style>
