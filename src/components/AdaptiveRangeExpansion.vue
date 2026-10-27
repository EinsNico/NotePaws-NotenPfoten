<template>
  <section class="range-expansion" :aria-label="$t('ADAPTIVE_EXPANSION_TITLE')">
    <div class="range-expansion-heading">
      <h5>{{$t('ADAPTIVE_EXPANSION_TITLE')}}</h5>
      <span>
        {{$t('ADAPTIVE_EXPANSION_SECURE_STATUS', {
          secure: evaluation.metrics.secureCount,
          total: evaluation.metrics.totalCandidates
        })}}
      </span>
    </div>

    <div v-if="appliedLabel" class="range-expansion-success" role="status">
      {{$t('ADAPTIVE_EXPANSION_APPLIED', { step: appliedLabel })}}
    </div>

    <template v-if="evaluation.ready && evaluation.recommendations.length > 0">
      <p class="range-expansion-ready">
        {{$t('ADAPTIVE_EXPANSION_READY')}}
      </p>

      <template v-if="!pendingRecommendation">
        <div v-if="rangeRecommendations.length > 0" class="range-expansion-group">
          <h6>{{$t('ADAPTIVE_EXPANSION_RANGE_GROUP')}}</h6>
          <div class="range-expansion-actions">
            <button
              v-for="recommendation in rangeRecommendations"
              :key="recommendation.id"
              type="button"
              @click="selectRecommendation(recommendation.id)">
                {{recommendationLabel(recommendation)}}
            </button>
          </div>
        </div>

        <div v-if="clefRecommendations.length > 0" class="range-expansion-group">
          <h6>{{$t('ADAPTIVE_EXPANSION_CLEF_GROUP')}}</h6>
          <div class="range-expansion-actions">
            <button
              v-for="recommendation in clefRecommendations"
              :key="recommendation.id"
              type="button"
              @click="selectRecommendation(recommendation.id)">
                {{recommendationLabel(recommendation)}}
            </button>
          </div>
        </div>
      </template>

      <div v-else class="range-expansion-confirmation">
        <strong>{{recommendationLabel(pendingRecommendation)}}</strong>
        <p>{{$t('ADAPTIVE_EXPANSION_CONFIRMATION')}}</p>
        <div class="range-expansion-confirm-actions">
          <button type="button" @click="pendingId = null">
            {{$t('CANCEL')}}
          </button>
          <button type="button" class="confirm-expansion" @click="confirmRecommendation">
            {{$t('ADAPTIVE_EXPANSION_CONFIRM')}}
          </button>
        </div>
      </div>
    </template>

    <p v-else-if="evaluation.ready" class="range-expansion-status">
      {{$t('ADAPTIVE_EXPANSION_COMPLETE')}}
    </p>
    <p v-else class="range-expansion-status">
      {{blockerMessage}}
    </p>

    <details class="range-expansion-criteria">
      <summary>{{$t('ADAPTIVE_EXPANSION_CRITERIA_TITLE')}}</summary>
      <p>{{$t('ADAPTIVE_EXPANSION_CRITERIA')}}</p>
    </details>
  </section>
</template>

<script>
import Utils from "../model/Utils";
import Options from "../model/Options";

export default {
  name: "AdaptiveRangeExpansion",
  props: {
    evaluation: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      pendingId: null,
      appliedLabel: null
    };
  },
  computed: {
    rangeRecommendations() {
      return this.evaluation.recommendations.filter(item => item.group === "range");
    },
    clefRecommendations() {
      return this.evaluation.recommendations.filter(item => item.group === "clef");
    },
    pendingRecommendation() {
      return this.evaluation.recommendations
        .find(item => item.id === this.pendingId) || null;
    },
    blockerMessage() {
      const metrics = this.evaluation.metrics;
      switch (this.evaluation.blockers[0]) {
        case "empty":
          return this.$t("ADAPTIVE_EXPANSION_EMPTY");
        case "practice":
          return this.$t("ADAPTIVE_EXPANSION_NEEDS_PRACTICE", {
            ready: metrics.practicedEnoughCount,
            total: metrics.totalCandidates
          });
        case "secure":
          return this.$t("ADAPTIVE_EXPANSION_NEEDS_SECURE", {
            percent: metrics.securePercent
          });
        case "accuracy":
          return this.$t("ADAPTIVE_EXPANSION_NEEDS_ACCURACY", {
            percent: metrics.recentAccuracyPercent
          });
        case "timing":
          return this.$t("ADAPTIVE_EXPANSION_NEEDS_TIMING", {
            percent: metrics.timedPercent
          });
        case "speed":
          return this.$t("ADAPTIVE_EXPANSION_NEEDS_SPEED", {
            time: metrics.averageResponseTimeMs === null
              ? "–"
              : this.formatSeconds(metrics.averageResponseTimeMs)
          });
        default:
          return "";
      }
    }
  },
  methods: {
    formatSeconds(milliseconds) {
      const value = (milliseconds / 1000).toFixed(1);
      return this.$i18n.locale === "de" ? value.replace(".", ",") : value;
    },
    noteLabel(value) {
      return `${Utils.getDisplayNoteName(
        value % 12,
        true,
        Options.noteNaming
      )}${Math.floor(value / 12)}`;
    },
    recommendationLabel(recommendation) {
      const note = this.noteLabel(recommendation.value);
      switch (recommendation.id) {
        case "range-lower":
          return this.$t("ADAPTIVE_EXPANSION_RANGE_LOWER", { note });
        case "range-upper":
          return this.$t("ADAPTIVE_EXPANSION_RANGE_UPPER", { note });
        case "treble-lower":
          return this.$t("ADAPTIVE_EXPANSION_TREBLE_LOWER", { note });
        case "bass-upper":
          return this.$t("ADAPTIVE_EXPANSION_BASS_UPPER", { note });
        default:
          return note;
      }
    },
    selectRecommendation(recommendationId) {
      this.pendingId = recommendationId;
      this.appliedLabel = null;
    },
    confirmRecommendation() {
      const recommendation = this.pendingRecommendation;
      if (!recommendation) {
        return;
      }
      const label = this.recommendationLabel(recommendation);
      this.$emit("apply", recommendation.id, applied => {
        if (applied) {
          this.pendingId = null;
          this.appliedLabel = label;
        }
      });
    }
  }
};
</script>

<style scoped>
.range-expansion {
  margin-top: 14px;
  padding: 11px;
  border: 1px solid #b8dce8;
  border-radius: 9px;
  background: white;
  text-align: left;
}

.range-expansion-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.range-expansion-heading h5 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
  letter-spacing: 0.04em;
}

.range-expansion-heading span {
  flex: 0 0 auto;
  color: #39748b;
  font-size: 9pt;
  font-weight: bold;
}

.range-expansion-status,
.range-expansion-ready {
  margin: 8px 0 0;
  color: #555;
  font-size: 9pt;
  line-height: 1.35;
}

.range-expansion-ready {
  color: #256b45;
}

.range-expansion-success {
  margin-top: 8px;
  padding: 7px 8px;
  border-radius: 7px;
  background: #edf8f1;
  color: #256b45;
  font-size: 9pt;
}

.range-expansion-group {
  margin-top: 10px;
}

.range-expansion-group h6 {
  margin: 0 0 6px;
  color: #555;
  font-size: 8.5pt;
  letter-spacing: 0.03em;
}

.range-expansion-actions,
.range-expansion-confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.range-expansion-actions button,
.range-expansion-confirm-actions button {
  min-height: 40px;
  padding: 7px 8px;
  border: 1px solid #78b8cc;
  border-radius: 8px;
  background: #eef9fc;
  color: #244f60;
  font-size: 9pt;
  cursor: pointer;
}

.range-expansion-confirmation {
  margin-top: 10px;
  padding: 9px;
  border: 1px solid #e0a58d;
  border-radius: 8px;
  background: #fff8f5;
  color: #633321;
  font-size: 9pt;
}

.range-expansion-confirmation p {
  margin: 5px 0 9px;
}

.range-expansion-confirm-actions button:first-child {
  border-color: #aaa;
  background: white;
  color: #444;
}

.range-expansion-confirm-actions button.confirm-expansion {
  border-color: #c9572e;
  background: #c9572e;
  color: white;
}

.range-expansion-criteria {
  margin-top: 9px;
  color: #68757a;
  font-size: 8.5pt;
}

.range-expansion-criteria summary {
  cursor: pointer;
}

.range-expansion-criteria p {
  margin: 5px 0 0;
  line-height: 1.35;
}

@media (max-width: 420px) {
  .range-expansion-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .range-expansion-actions,
  .range-expansion-confirm-actions {
    grid-template-columns: 1fr;
  }
}
</style>
