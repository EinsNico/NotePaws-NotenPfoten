<template>
	<div class="score-line">
    <div class="score-item" v-if="!isInfiniteRound">
      <div class="score-value">{{timeLeftFormatted}}</div>
      <div class="score-label">{{$t('TIME')}}</div>
    </div>
    <div class="score-item">
      <div class="score-value">{{result.numCorrect}}</div>
      <div class="score-label">{{$t('CORRECT')}}</div>  
    </div>
    <div class="score-item">
      <div class="score-value">{{result.accuracy}} %</div>
      <div class="score-label">{{$t('ACCURACY')}}</div>  
    </div>
    <div class="score-item" v-if="!isInfiniteRound">
      <div class="score-value">{{result.score}}</div>
      <div class="score-label">{{$t('SCORE')}}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ScoreLine',
  props: {
    result: Object,
    timeLeft: Number,
    isInfiniteRound: Boolean,
  },
  computed: {
    timeLeftFormatted(){
      var formatterDate = new Date(null);
      formatterDate.setSeconds(this.timeLeft);
      return formatterDate.toISOString().substr(15, 4);
    }
  }
};
</script>

<style scoped>
.score-line {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  padding: 11px 8px 9px;
  border-top: 1px solid rgba(43, 70, 77, 0.09);
}

.score-item {
  min-width: 0;
  flex: 1 1 0;
  padding: 1px 5px;
}

.score-item + .score-item {
  border-left: 1px solid rgba(43, 70, 77, 0.1);
}

.score-value {
  overflow: hidden;
  color: #26383d;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-label {
  margin-top: 2px;
  color: #778589;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

@media (orientation: landscape) and (max-height: 600px) {
  .score-line {
    padding: 6px 8px 5px;
  }

  .score-value {
    font-size: 13px;
  }
}
</style>
