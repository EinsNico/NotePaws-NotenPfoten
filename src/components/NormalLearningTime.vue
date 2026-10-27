<template>
  <section class="normal-learning-times" :aria-label="$t('ROUND_TIME_TITLE')">
    <div class="normal-time-heading">
      <h4>{{$t('ROUND_TIME_TITLE')}}</h4>
      <p>{{$t('ROUND_TIME_DESCRIPTION', { input: inputLabel })}}</p>
    </div>

    <div class="normal-time-buckets">
      <div
        v-for="bucket in learningTimes.buckets"
        :key="bucket.startHour"
        class="normal-time-bucket"
        :class="{ eligible: bucket.eligible }">
        <div
          class="normal-time-meter"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="minimumDaysPerBucket"
          :aria-valuenow="bucket.dayCount"
          :aria-label="$t('ROUND_TIME_BUCKET_PROGRESS', {
            range: timeRange(bucket),
            count: bucket.dayCount,
            needed: minimumDaysPerBucket
          })">
          <span :style="bucketStyle(bucket)"></span>
        </div>
        <small>{{timeRange(bucket)}}</small>
      </div>
    </div>

    <div v-if="!learningTimes.ready" class="normal-time-pending">
      <div
        class="normal-time-progress"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="learningTimes.progressPercent">
        <span :style="progressStyle"></span>
      </div>
      <strong>{{$t('ROUND_TIME_COLLECTING')}}</strong>
      <span>{{$t('ROUND_TIME_PENDING', {
        days: learningTimes.recordedDays,
        requiredDays: learningTimes.requiredDays,
        windows: learningTimes.eligibleBucketCount,
        requiredWindows: learningTimes.requiredBucketCount
      })}}</span>
    </div>

    <template v-else>
      <div class="normal-time-results">
        <article class="normal-time-best">
          <span>{{$t('ROUND_TIME_BEST')}}</span>
          <strong>{{timeRange(learningTimes.best)}}</strong>
          <small>{{resultMeta(learningTimes.best)}}</small>
        </article>
        <article class="normal-time-challenging">
          <span>{{$t('ROUND_TIME_CHALLENGING')}}</span>
          <strong>{{timeRange(learningTimes.mostChallenging)}}</strong>
          <small>{{resultMeta(learningTimes.mostChallenging)}}</small>
        </article>
      </div>
      <p class="normal-time-recommendation">
        {{$t(
          learningTimes.isStable
            ? 'ROUND_TIME_RECOMMENDATION_STABLE'
            : 'ROUND_TIME_RECOMMENDATION',
          { range: timeRange(learningTimes.best), input: inputLabel }
        )}}
      </p>
    </template>
  </section>
</template>

<script>
import {
  LEARNING_TIME_MIN_DAYS_PER_BUCKET,
  formatLearningTimeRange,
  summarizeNormalLearningTimes
} from "../model/NormalLearningTime";

export default {
  name: "NormalLearningTime",
  props: {
    rounds: {
      type: Array,
      required: true
    },
    inputLabel: {
      type: String,
      required: true
    }
  },
  computed: {
    learningTimes() {
      return summarizeNormalLearningTimes(this.rounds);
    },
    minimumDaysPerBucket() {
      return LEARNING_TIME_MIN_DAYS_PER_BUCKET;
    },
    progressStyle() {
      return { width: `${this.learningTimes.progressPercent}%` };
    }
  },
  methods: {
    timeRange(bucket) {
      return formatLearningTimeRange(bucket.startHour);
    },
    bucketStyle(bucket) {
      return {
        height: `${Math.min(
          100,
          bucket.dayCount / this.minimumDaysPerBucket * 100
        )}%`
      };
    },
    resultMeta(bucket) {
      return this.$t("ROUND_TIME_RESULT_META", {
        accuracy: bucket.accuracy,
        days: bucket.dayCount,
        notes: bucket.exerciseCount
      });
    }
  }
};
</script>

<style scoped>
.normal-learning-times {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin-top: 12px;
  padding: 11px;
  overflow: hidden;
  border: 1px solid #d5e8ef;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.normal-time-heading h4 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
}

.normal-time-heading p {
  margin: 3px 0 0;
  color: #657982;
  font-size: 8pt;
  line-height: 1.35;
}

.normal-time-buckets {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  row-gap: 12px;
  align-items: end;
  gap: 5px;
  margin-top: 10px;
}

.normal-time-bucket {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #71838b;
  text-align: center;
}

.normal-time-meter {
  position: relative;
  height: 36px;
  overflow: hidden;
  border: 1px solid #cadbe2;
  border-radius: 5px 5px 2px 2px;
  background: #e8eff2;
}

.normal-time-meter span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  background: #79bfd6;
}

.normal-time-bucket.eligible .normal-time-meter {
  border-color: #4a8da5;
}

.normal-time-bucket.eligible .normal-time-meter span {
  background: #39748b;
}

.normal-time-bucket small {
  overflow: hidden;
  font-size: 6.3pt;
  white-space: nowrap;
}

.normal-time-pending {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #f4f8fa;
  color: #526d78;
  font-size: 8.5pt;
  text-align: center;
}

.normal-time-progress {
  height: 10px;
  overflow: hidden;
  border-radius: 6px;
  background: #dfe9ed;
}

.normal-time-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #79bfd6, #39748b);
}

.normal-time-results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
}

.normal-time-results article {
  display: grid;
  gap: 3px;
  padding: 10px 7px;
  border: 1px solid #cfe2d4;
  border-top: 3px solid #4aaa68;
  border-radius: 8px;
  background: #fafffb;
  color: #60747c;
  font-size: 8pt;
  text-align: center;
}

.normal-time-results .normal-time-challenging {
  border-color: #f0d3c9;
  border-top-color: #df6c4c;
  background: #fffaf8;
}

.normal-time-results strong {
  color: #17495e;
  font-size: 12pt;
}

.normal-time-recommendation {
  margin: 9px 0 0;
  padding: 8px 10px;
  border-left: 4px solid #e85c2c;
  border-radius: 7px;
  background: #fff8f5;
  color: #425d67;
  font-size: 8.5pt;
}

@media (max-width: 480px) {
  .normal-time-bucket small {
    font-size: 9px;
  }
}
@media (min-width: 1000px) { .normal-time-buckets { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
@media (max-width: 480px) { .normal-time-buckets { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
