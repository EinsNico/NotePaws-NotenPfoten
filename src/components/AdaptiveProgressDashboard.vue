<template>
  <div class="adaptive-progress-dashboard">
    <section class="adaptive-overview statistics-section-card" :aria-label="$t('ADAPTIVE_MINI_STATS')">
      <h3>{{$t('ROUND_STATS_RESULTS_TITLE')}}</h3>
      <div class="adaptive-mini-stats">
      <div class="mini-stat-card">
        <span class="mini-stat-icon" aria-hidden="true">♪</span>
        <strong>{{summary.attempts}}</strong>
        <span>{{$t('ADAPTIVE_MINI_PLAYED_NOTES')}}</span>
      </div>

      <div class="mini-stat-card accuracy-card">
        <div
          class="accuracy-ring"
          :aria-label="$t('ADAPTIVE_MINI_ACCURACY_VALUE', {
            value: displayAccuracy
          })">
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle class="ring-track" cx="22" cy="22" r="18" pathLength="100"/>
            <circle
              class="ring-value"
              cx="22"
              cy="22"
              r="18"
              pathLength="100"
              :stroke-dasharray="`${accuracyForGraphic} 100`"/>
          </svg>
          <strong>{{displayAccuracy}}</strong>
        </div>
        <span>{{$t('ADAPTIVE_MINI_FIRST_TRY')}}</span>
      </div>

      <div class="mini-stat-card">
        <span class="mini-stat-icon response-icon" aria-hidden="true">◷</span>
        <strong>{{displayResponseTime}}</strong>
        <span>{{$t('ADAPTIVE_MINI_RESPONSE_TIME')}}</span>
      </div>
      </div>
    </section>

    <slot></slot>

    <section class="adaptive-skill-summary statistics-section-card" :aria-label="$t('ADAPTIVE_SKILL_OVERVIEW')">
      <div class="skill-heading">
        <h4>{{$t('ADAPTIVE_SKILL_OVERVIEW')}}</h4>
        <strong>{{$t('ADAPTIVE_SKILL_SECURE_COUNT', {
          secure: summary.statusCounts.secure,
          total: summary.totalCandidates
        })}}</strong>
      </div>

      <div
        class="skill-bar"
        role="img"
        :aria-label="skillBarLabel">
          <span
            v-for="status in statuses"
            :key="status.key"
            :class="['skill-segment', status.key]"
            :style="segmentStyle(status.count)">
          </span>
      </div>

      <div class="skill-legend">
        <div
          v-for="group in statusGroups"
          :key="group.key"
          class="skill-legend-group">
            <div
              v-for="status in group.statuses"
              :key="`legend-${status.key}`"
              class="skill-legend-item">
                <span :class="['skill-dot', status.key]" aria-hidden="true"></span>
                <strong>{{status.count}}</strong>
                <span>{{status.label}}</span>
            </div>
        </div>
      </div>

      <div class="note-highlights">
        <article class="note-highlight safest-note">
          <span>{{$t('ADAPTIVE_SAFEST_NOTE')}}</span>
          <template v-if="summary.safest">
            <div class="note-identity">
              <strong>{{noteLabel(summary.safest)}}</strong>
              <span class="clef-symbol" aria-hidden="true">
                {{clefSymbol(summary.safest)}}
              </span>
              <span class="visually-hidden">{{clefLabel(summary.safest)}}</span>
            </div>
            <small>{{noteMeta(summary.safest)}}</small>
          </template>
          <div v-else class="ranking-pending">{{$t('ADAPTIVE_RANKING_PENDING')}}</div>
        </article>

        <article class="note-highlight practice-note">
          <span>{{$t('ADAPTIVE_PRACTICE_NOTE')}}</span>
          <template v-if="summary.mostDifficult">
            <div class="note-identity">
              <strong>{{noteLabel(summary.mostDifficult)}}</strong>
              <span class="clef-symbol" aria-hidden="true">
                {{clefSymbol(summary.mostDifficult)}}
              </span>
              <span class="visually-hidden">{{clefLabel(summary.mostDifficult)}}</span>
            </div>
            <small>{{noteMeta(summary.mostDifficult)}}</small>
          </template>
          <div v-else class="ranking-pending">{{$t('ADAPTIVE_RANKING_PENDING')}}</div>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import Utils from "../model/Utils";
import Options from "../model/Options";

export default {
  name: "AdaptiveProgressDashboard",
  props: {
    summary: {
      type: Object,
      required: true
    }
  },
  computed: {
    displayAccuracy() {
      return this.summary.firstTryAccuracy === null
        ? "–"
        : `${this.summary.firstTryAccuracy} %`;
    },
    accuracyForGraphic() {
      return this.summary.firstTryAccuracy === null
        ? 0
        : this.summary.firstTryAccuracy;
    },
    displayResponseTime() {
      if (this.summary.averageResponseTimeMs === null) {
        return "–";
      }
      return `${this.formatSeconds(this.summary.averageResponseTimeMs)} s`;
    },
    statuses() {
      return [
        {
          key: "secure",
          label: this.$t("ADAPTIVE_PROGRESS_SECURE"),
          count: this.summary.statusCounts.secure
        },
        {
          key: "building",
          label: this.$t("ADAPTIVE_PROGRESS_BUILDING"),
          count: this.summary.statusCounts.building
        },
        {
          key: "practice",
          label: this.$t("ADAPTIVE_PROGRESS_PRACTICE"),
          count: this.summary.statusCounts.practice
        },
        {
          key: "unpracticed",
          label: this.$t("ADAPTIVE_PROGRESS_UNPRACTICED"),
          count: this.summary.statusCounts.unpracticed
        }
      ];
    },
    statusGroups() {
      const statusesByKey = this.statuses.reduce((result, status) => {
        result[status.key] = status;
        return result;
      }, {});
      return [
        {
          key: "secure-practice",
          statuses: [statusesByKey.secure, statusesByKey.practice]
        },
        {
          key: "building-unpracticed",
          statuses: [statusesByKey.building, statusesByKey.unpracticed]
        }
      ];
    },
    skillBarLabel() {
      return this.statuses.map(status => (
        `${status.label}: ${status.count}`
      )).join(" · ");
    }
  },
  methods: {
    formatSeconds(milliseconds) {
      const seconds = (Number(milliseconds) / 1000).toFixed(1);
      return this.$i18n.locale === "de" ? seconds.replace(".", ",") : seconds;
    },
    segmentStyle(count) {
      const total = this.summary.totalCandidates;
      return {
        width: total > 0 ? `${count / total * 100}%` : "0%"
      };
    },
    noteLabel(entry) {
      const noteName = Utils.getDisplayNoteName(
        entry.value % 12,
        entry.isSharp !== false,
        Options.noteNaming
      );
      return `${noteName}${Math.floor(entry.value / 12)}`;
    },
    clefSymbol(entry) {
      return entry.clef === "bass" ? "𝄢" : "𝄞";
    },
    clefLabel(entry) {
      return this.$t(entry.clef === "bass" ? "bassClef" : "trebleClef");
    },
    noteMeta(entry) {
      const attempts = this.$tc(
        "ADAPTIVE_MINI_ATTEMPTS",
        entry.attempts,
        { count: entry.attempts }
      );
      return `${entry.accuracy} % · ${attempts}`;
    }
  }
};
</script>

<style scoped>
.adaptive-progress-dashboard { display: grid; gap: 12px; min-width: 0; }
.adaptive-overview { padding: 12px 15px; }
.adaptive-overview h3 { margin: 0; color: #26383d; font-size: 12px; }

.adaptive-mini-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 12px 0 0;
}

.mini-stat-card {
  display: flex;
  min-width: 0;
  min-height: 88px;
  padding: 8px 5px;
  border: 1px solid #d5e8ef;
  border-radius: 10px;
  background: white;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.mini-stat-card:first-child { border-top: 3px solid #dc6736; }
.mini-stat-card.accuracy-card { border-top: 3px solid #2d6e7b; }
.mini-stat-card:last-child { border-top: 3px solid #e6a34a; }

.mini-stat-card > strong {
  color: #17495e;
  font-size: 15pt;
  line-height: 1.1;
}

.mini-stat-card > span:last-child {
  min-height: 24px;
  margin-top: 4px;
  color: #657982;
  font-size: 8pt;
  line-height: 1.2;
}

.mini-stat-icon {
  height: 21px;
  color: #e85c2c;
  font-size: 19pt;
  line-height: 18px;
}

.mini-stat-icon.response-icon {
  color: #39748b;
}

.accuracy-ring {
  position: relative;
  width: 50px;
  height: 50px;
}

.accuracy-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.accuracy-ring circle {
  fill: none;
  stroke-width: 4;
}

.accuracy-ring .ring-track {
  stroke: #e5eef2;
}

.accuracy-ring .ring-value {
  stroke: #39748b;
  stroke-linecap: round;
}

.accuracy-ring strong {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 42px;
  transform: translate(-50%, -50%);
  color: #17495e;
  font-size: 9pt;
  line-height: 1;
  text-align: center;
}

.adaptive-skill-summary { padding: 14px 15px; }

.skill-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.skill-heading h4 {
  margin: 0;
  color: #315f72;
  font-size: 9.5pt;
  letter-spacing: 0.03em;
}

.skill-heading strong {
  color: #246342;
  font-size: 9pt;
}

.skill-bar {
  display: flex;
  height: 13px;
  margin-top: 9px;
  overflow: hidden;
  border: 1px solid #9fb1b8;
  border-radius: 7px;
  background: #e5e5e5;
}

.skill-segment {
  display: block;
  height: 100%;
}

.skill-segment.secure,
.skill-dot.secure {
  background: hsl(120, 58%, 52%);
}

.skill-segment.building,
.skill-dot.building {
  background: hsl(55, 75%, 58%);
}

.skill-segment.practice,
.skill-dot.practice {
  background: hsl(5, 70%, 58%);
}

.skill-segment.unpracticed,
.skill-dot.unpracticed {
  background: #d6dadd;
}

.skill-legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 8px;
}

.skill-legend-group {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0 7px;
}

.skill-legend-item {
  display: grid;
  grid-template-columns: 8px minmax(18px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: #596b73;
  font-size: 8pt;
  line-height: 1.2;
  text-align: left;
}

.skill-legend-item strong {
  color: #334d58;
  font-variant-numeric: tabular-nums;
  text-align: left;
}

.skill-legend-item > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.skill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.note-highlights {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.note-highlight {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  min-width: 0;
  padding: 9px 7px;
  border: 1px solid #d5e8ef;
  border-top: 3px solid #5cac72;
  border-radius: 9px;
  background: white;
  text-align: center;
}

.note-highlight.practice-note {
  border-top-color: #df6c4c;
}

.note-highlight > span:first-child {
  display: block;
  color: #657982;
  font-size: 8pt;
  font-weight: bold;
}

.note-identity {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 54px;
  margin: 4px 0 2px;
  overflow: hidden;
  color: #17495e;
}

.note-identity strong {
  font-size: 15pt;
  line-height: 1.2;
}

.clef-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 50px;
  flex: 0 0 34px;
  overflow: hidden;
  font-family: "Noto Music", "Apple Symbols", "Segoe UI Symbol", serif;
  font-size: 22pt;
  line-height: 1;
}

.note-highlight small {
  display: block;
  color: #657982;
  font-size: 7.5pt;
}

.ranking-pending {
  min-height: 34px;
  margin-top: 7px;
  color: #88969c;
  font-size: 8pt;
  line-height: 1.3;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 420px) {
  .mini-stat-card {
    min-height: 84px;
  }

  .mini-stat-card > strong {
    font-size: 13.5pt;
  }

  .skill-heading {
    display: block;
  }

  .skill-heading strong {
    display: block;
    margin-top: 3px;
  }
}
</style>
