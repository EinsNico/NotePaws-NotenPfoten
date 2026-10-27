<template>
  <div class="feedback-line">
    <span class="feedback correct" v-if="visibleFeedback === 'correct-note'">{{$t('correctExcl')}} - {{feedbackNote}}</span>
    <span class="feedback correct" v-if="visibleFeedback === 'correct'">{{$t('correctExcl')}}</span>
    <span class="feedback wrong" v-if="visibleFeedback === 'wrong'">{{$t('wrongExcl')}}</span>
    <span class="feedback dummy" v-if="visibleFeedback === 'none'">dummy</span>
    <span class="feedback dummy" v-if="visibleFeedback === 'none_temp'">dummy_temp</span>
  </div>
</template>

<script>
export default {
  name: 'FeedbackLine',
  data(){
    return {
      visible: true
    };
  },
  computed: {
    visibleFeedback(){
      return this.visible ? this.feedback : 'none_temp';
    }
  },
  props: {
    feedback: String,
    feedbackNote: String,
    uniqueId: Number
  },
  watch: {
    uniqueId(){
      this.visible = false;
      setTimeout(() => {this.visible = true;}, 0);
    }
  }
}
</script>

<style scoped>
@keyframes feedback {
  0% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0.58;
  }
}

.feedback-line {
  display: flex;
  min-height: 34px;
  align-items: flex-start;
  justify-content: center;
  padding: 0 10px 9px;
  box-sizing: border-box;
}

.feedback {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  justify-content: center;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  opacity: 0.58;
  text-align: center;
  animation-name: feedback;
  animation-duration: 0.5s;
  animation-iteration-count: 1;
}

.correct {
  background: #dfeee6;
  color: #246545;
}

.wrong {
  background: #f7ddd5;
  color: #a23f23;
}

.dummy {
  visibility: hidden;
}

@media (orientation: landscape) and (max-height: 600px) {
  .feedback-line {
    min-height: 26px;
    padding-bottom: 5px;
  }

  .feedback {
    min-height: 20px;
    padding: 2px 9px;
  }
}
</style>
