<template>
  <section
    class="round-statistics"
    aria-labelledby="round-statistics-title">
    <header class="statistics-summary">
      <span class="statistics-summary-icon" aria-hidden="true">
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M8 31V22M16 31V14M24 31V19M32 31V8" />
          <path d="M5 31h30" />
        </svg>
      </span>
      <span class="statistics-summary-copy">
        <small>{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small>
        <h3 id="round-statistics-title">{{$t('ROUND_STATISTICS')}}</h3>
        <span>{{$t('ROUND_STATS_OVERVIEW_DESCRIPTION')}}</span>
      </span>
      <span class="summary-meta">
        <span class="round-count">
          {{hasRounds
            ? $tc('ROUND_STATS_ROUND_COUNT', summary.roundCount, { count: summary.roundCount })
            : $t('ROUND_STATS_NO_ROUNDS')}}
        </span>
      </span>
    </header>

    <div class="statistics-content">
      <section class="statistics-filter-card" aria-labelledby="round-statistics-filter-title">
        <header class="statistics-filter-heading">
          <span class="statistics-filter-icon" aria-hidden="true">
            <svg viewBox="0 0 40 40" focusable="false">
              <path d="M7 11h26M7 20h26M7 29h26" />
              <circle cx="15" cy="11" r="3" />
              <circle cx="26" cy="20" r="3" />
              <circle cx="18" cy="29" r="3" />
            </svg>
          </span>
          <div>
            <h4 id="round-statistics-filter-title">{{$t('ROUND_STATS_FILTER_TITLE')}}</h4>
            <p>{{$t('ROUND_STATS_FILTER_DESCRIPTION')}}</p>
          </div>
        </header>

        <div class="statistics-filter-body">
          <div class="scope-label">{{$t('ROUND_STATS_INPUT_LABEL')}}</div>
          <div class="input-options statistics-input-switch" role="group" :aria-label="$t('ROUND_STATS_INPUT_LABEL')">
            <button
              v-for="item in inputOptions"
              :key="item.value"
              type="button"
              :class="{ selected: inputGroup === item.value }"
              :aria-pressed="inputGroup === item.value ? 'true' : 'false'"
              @click="inputGroup = item.value">
                {{item.label}}
            </button>
          </div>

          <div class="scope-label">{{$t('ROUND_STATS_SCOPE_LABEL')}}</div>
          <div class="scope-options" role="group" :aria-label="$t('ROUND_STATS_SCOPE_LABEL')">
            <button
              v-for="item in scopeOptions"
              :key="item.value"
              type="button"
              :class="{ selected: scope === item.value }"
              :aria-pressed="scope === item.value ? 'true' : 'false'"
              @click="scope = item.value">
                {{item.label}}
            </button>
          </div>

          <label v-if="showCustomConfigurationFilter" class="custom-configuration-filter">
            <span>{{$t('ROUND_STATS_CUSTOM_FILTER_LABEL')}}</span>
            <select v-model="selectedCustomSignature">
              <option value="">
                {{$tc('ROUND_STATS_CUSTOM_FILTER_ALL', customRoundCount, {
                  count: customRoundCount
                })}}
              </option>
              <option
                v-for="configuration in customConfigurations"
                :key="configuration.signature"
                :value="configuration.signature">
                  {{formatCustomConfigurationOption(configuration)}}
              </option>
            </select>
          </label>
        </div>
      </section>

      <p class="comparison-label" aria-live="polite">{{comparisonLabel}}</p>

      <section class="statistics-overview" v-if="hasRounds" aria-live="polite">
        <div class="statistics-overview-heading">
          <h4>{{$t('ROUND_STATS_RESULTS_TITLE')}}</h4>
          <span>{{$tc('ROUND_STATS_ROUND_COUNT', summary.roundCount, { count: summary.roundCount })}}</span>
        </div>
        <div class="statistics-cards">
          <StatisticsMetric class="statistics-card statistics-card-latest" icon="score" accent="orange"
            :value="summary.latestScore" :label="$t('ROUND_STATS_LAST_SCORE')" />
          <StatisticsMetric class="statistics-card statistics-card-record" icon="record" accent="gold"
            :value="summary.record" :label="$t('ROUND_STATS_RECORD')" />
          <StatisticsMetric class="statistics-card statistics-card-accuracy" accent="petrol"
            :value="`${summary.averageAccuracy} %`" :percentage="summary.averageAccuracy" :label="$t('ROUND_STATS_AVERAGE_ACCURACY')" />
          <StatisticsMetric class="statistics-card statistics-card-exercises" icon="notes" accent="muted"
            :value="summary.playedExercises" :label="$t('ROUND_STATS_PLAYED_EXERCISES')" />
          <StatisticsMetric class="statistics-card statistics-card-response" icon="response" accent="gold"
            :value="displayResponseTime" :label="$t('ROUND_STATS_RESPONSE_TIME')" />
        </div>
        <p class="statistics-response-note">{{$t('ROUND_STATS_RESPONSE_TIME_HINT')}}</p>
      </section>
      <template v-if="hasRounds">
        <RoundHistoryChart
          :rounds="filteredRounds"
          :selected-round-id="selectedRoundId"
          @select-round="selectRound"
        />
        <section v-if="selectedRound" class="selected-round-details" aria-live="polite">
          <div class="round-details-heading">
            <h4>{{$t('ROUND_STATS_ROUND_DETAILS')}}</h4>
            <button
              type="button"
              :aria-label="$t('ROUND_STATS_CLOSE_DETAILS')"
              @click="selectedRound = null">
                ×
            </button>
          </div>
          <p v-if="selectedRoundNumber" class="round-sequence-number">
            {{$t('ROUND_STATS_ROUND_NUMBER', {
              number: formatSequenceNumber(selectedRoundNumber)
            })}}
          </p>
          <p class="round-completed-at">
            {{$t('ROUND_STATS_COMPLETED_AT')}}: {{formatCompletedAt(selectedRound.completedAt)}}
          </p>
          <div class="round-result-values">
            <span>{{$t('score')}}: <strong>{{selectedRound.score}}</strong></span>
            <span>{{$t('accuracy')}}: <strong>{{selectedRound.accuracy}} %</strong></span>
          </div>
          <dl class="round-settings-list">
            <div v-for="item in selectedRoundDetails" :key="item.label">
              <dt>{{item.label}}</dt>
              <dd>{{item.value}}</dd>
            </div>
          </dl>
        </section>
      </template>
      <section class="empty-state" v-else>
        <span class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 40 40" focusable="false">
            <path d="M8 31V23M16 31V17M24 31V21M32 31V12" />
            <path d="M6 31h28" />
          </svg>
        </span>
        <div>
          <strong>{{$t('ROUND_STATS_EMPTY_TITLE')}}</strong>
          <span>{{$t('ROUND_STATS_EMPTY')}}</span>
        </div>
      </section>
      <NormalLearningTime
        :rounds="learningTimeRounds"
        :input-label="selectedInputLabel"
      />
    </div>
  </section>
</template>

<script>
import RoundHistoryChart from "./RoundHistoryChart";
import StatisticsMetric from "./StatisticsMetric";
import NormalLearningTime from "./NormalLearningTime";
import Utils from "../model/Utils";
import { createNormalRoundSettings } from "../model/RoundHistory";
import {
  ROUND_SCOPE_CURRENT,
  ROUND_SCOPE_ALL_CUSTOM,
  ROUND_SCOPE_TOTAL,
  ROUND_INPUT_SCREEN,
  ROUND_INPUT_MIDI,
  getRoundInputGroup,
  listCustomRoundConfigurations
} from "../model/RoundStatistics";

export default {
  name: "RoundStatisticsPanel",
  components: {
    RoundHistoryChart,
    StatisticsMetric,
    NormalLearningTime
  },
  props: {
    statistics: {
      type: Object,
      required: true
    },
    options: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      scope: ROUND_SCOPE_CURRENT,
      inputGroup: getRoundInputGroup(this.options.inputMode),
      selectedCustomSignature: "",
      selectedRound: null,
      selectedRoundNumber: null
    };
  },
  computed: {
    inputOptions() {
      return [
        {
          value: ROUND_INPUT_SCREEN,
          label: this.$t("ROUND_STATS_INPUT_SCREEN")
        },
        {
          value: ROUND_INPUT_MIDI,
          label: this.$t("ROUND_STATS_INPUT_MIDI")
        }
      ];
    },
    selectedInputLabel() {
      const selected = this.inputOptions.find(item => item.value === this.inputGroup);
      return selected ? selected.label : "–";
    },
    scopeOptions() {
      return [
        {
          value: ROUND_SCOPE_CURRENT,
          label: this.$t("ROUND_STATS_SCOPE_CURRENT")
        },
        {
          value: ROUND_SCOPE_ALL_CUSTOM,
          label: this.$t("ROUND_STATS_SCOPE_ALL_CUSTOM")
        },
        {
          value: ROUND_SCOPE_TOTAL,
          label: this.$t("ROUND_STATS_SCOPE_TOTAL")
        }
      ];
    },
    summary() {
      return this.statistics.getRoundSummary(
        this.scope,
        this.options,
        this.activeCustomSignature,
        this.inputGroup
      );
    },
    filteredRounds() {
      return this.statistics.getFilteredRounds(
        this.scope,
        this.options,
        this.activeCustomSignature,
        this.inputGroup
      );
    },
    displayResponseTime() {
      return this.summary.averageResponseTimeMs === null ? '–'
        : `${(this.summary.averageResponseTimeMs / 1000).toLocaleString(this.$i18n.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
    },
    learningTimeRounds() {
      return this.statistics.getFilteredRounds(
        ROUND_SCOPE_TOTAL,
        this.options,
        "",
        this.inputGroup
      );
    },
    customConfigurations() {
      return listCustomRoundConfigurations(this.statistics.rounds, this.inputGroup);
    },
    customRoundCount() {
      return this.customConfigurations.reduce(
        (total, configuration) => total + configuration.roundCount,
        0
      );
    },
    activeCustomConfiguration() {
      return this.customConfigurations.find(configuration => (
        configuration.signature === this.selectedCustomSignature
      )) || null;
    },
    activeCustomSignature() {
      return this.scope === ROUND_SCOPE_ALL_CUSTOM
        && this.activeCustomConfiguration
        ? this.activeCustomConfiguration.signature
        : "";
    },
    showCustomConfigurationFilter() {
      return this.scope === ROUND_SCOPE_ALL_CUSTOM;
    },
    hasRounds() {
      return this.summary.roundCount > 0;
    },
    selectedRoundId() {
      return this.selectedRound ? this.selectedRound.id : null;
    },
    selectedRoundDetails() {
      if (!this.selectedRound) {
        return [];
      }
      const settings = this.selectedRound.settings || {};
      const details = [
        {
          label: this.$t("ROUND_STATS_ROUND_MODE"),
          value: this.$t("ROUND_STATS_NORMAL_ROUND")
        },
        {
          label: this.$t("DIFFICULTY"),
          value: settings.difficulty
            ? this.$t(settings.difficulty)
            : "–"
        },
        {
          label: this.$t("ROUND_STATS_NOTE_RANGE"),
          value: this.formatNoteRange(settings.noteRange)
        },
        {
          label: this.$t("CLEF"),
          value: this.formatClefs(settings.clefs)
        }
      ];
      const transition = this.formatTransition(settings.clefTransition);
      if (transition) {
        details.push({
          label: this.$t("ROUND_STATS_CLEF_ASSIGNMENT"),
          value: transition
        });
      }
      details.push(
        {
          label: this.$t("ROUND_LENGTH"),
          value: this.formatDuration(settings.durationSeconds)
        },
        {
          label: this.$t("ACCIDENTALS"),
          value: this.formatAccidentals(settings.accidentals)
        },
        {
          label: this.$t("NOTE_INPUT"),
          value: this.formatInputMode(settings.inputMode)
        }
      );
      return details;
    },
    comparisonLabel() {
      let description;
      if (this.scope === ROUND_SCOPE_ALL_CUSTOM) {
        if (this.activeCustomConfiguration) {
          description = this.$t("ROUND_STATS_CUSTOM_SELECTED_DESCRIPTION", {
            settings: this.formatSettingsSummary(
              this.activeCustomConfiguration.settings
            )
          });
        } else {
          description = this.$t("ROUND_STATS_ALL_CUSTOM_DESCRIPTION");
        }
      } else if (this.scope === ROUND_SCOPE_TOTAL) {
        description = this.$t("ROUND_STATS_TOTAL_DESCRIPTION");
      } else {
        description = this.formatCurrentSettings();
      }
      return this.$t("ROUND_STATS_INPUT_DESCRIPTION", {
        input: this.selectedInputLabel,
        view: description
      });
    }
  },
  watch: {
    scope() {
      this.selectedRound = null;
      this.selectedRoundNumber = null;
    },
    selectedCustomSignature() {
      this.selectedRound = null;
      this.selectedRoundNumber = null;
    },
    inputGroup() {
      this.selectedCustomSignature = "";
      this.selectedRound = null;
      this.selectedRoundNumber = null;
    },
    "options.inputMode"(inputMode) {
      this.inputGroup = getRoundInputGroup(inputMode);
    }
  },
  methods: {
    formatNote(value) {
      if (!Number.isFinite(Number(value))) {
        return "–";
      }
      return `${Utils.getDisplayNoteName(
        value % 12,
        true,
        this.options.noteNaming
      )}${Math.floor(value / 12)}`;
    },
    formatClef(clef) {
      const keys = {
        treble: "trebleClef",
        bass: "bassClef",
        alto: "altoClef",
        tenor: "tenorClef",
        piano: "pianoClef"
      };
      return keys[clef] ? this.$t(keys[clef]) : clef;
    },
    formatDuration(seconds) {
      if (!Number.isFinite(Number(seconds))) {
        return "–";
      }
      const keys = {
        0: "infinite",
        20: "twentySeconds",
        60: "oneMinute",
        300: "fiveMinutes"
      };
      return keys[seconds]
        ? this.$t(keys[seconds])
        : this.$t("ROUND_STATS_SECONDS", { count: seconds });
    },
    formatInputMode(inputMode) {
      if (!inputMode) {
        return "–";
      }
      if (inputMode === "button") {
        return this.$t("buttons");
      }
      if (inputMode === "keyboard") {
        return this.$t("piano");
      }
      return inputMode === "midi" ? "MIDI" : inputMode;
    },
    formatAccidentals(accidentals) {
      if (!accidentals) {
        return "–";
      }
      const keys = {
        no: "ROUND_STATS_NO_ACCIDENTALS",
        onlySharp: "sharp",
        onlyFlat: "flat",
        sharpAndFlat: "sharpAndFlat"
      };
      return keys[accidentals] ? this.$t(keys[accidentals]) : accidentals;
    },
    formatNoteRange(noteRange) {
      if (!noteRange) {
        return "–";
      }
      return `${this.formatNote(noteRange.min)}–${this.formatNote(noteRange.max)}`;
    },
    formatClefs(clefs) {
      return Array.isArray(clefs) && clefs.length > 0
        ? clefs.map(this.formatClef).join(" + ")
        : "–";
    },
    formatTransition(transition) {
      if (!transition) {
        return null;
      }
      if (transition.trebleMinValue === transition.bassMaxValue) {
        return this.$t("ROUND_STATS_TRANSITION", {
          note: this.formatNote(transition.trebleMinValue)
        });
      }
      return this.$t("ROUND_STATS_TRANSITION_OVERLAP", {
        bass: this.formatNote(transition.bassMaxValue),
        treble: this.formatNote(transition.trebleMinValue)
      });
    },
    formatCompletedAt(value) {
      const date = new Date(Number(value));
      if (!Number.isFinite(date.getTime())) {
        return "–";
      }
      return date.toLocaleString(this.$i18n.locale === "de" ? "de-DE" : "en-GB");
    },
    formatSequenceNumber(value) {
      return Math.max(0, Number(value) || 0).toLocaleString(
        this.$i18n.locale === "de" ? "de-DE" : "en-US"
      );
    },
    selectRound(round, number) {
      this.selectedRound = round || null;
      this.selectedRoundNumber = round ? Number(number) || null : null;
    },
    formatSettingsSummary(settings) {
      const parts = [
        this.$t(settings.difficulty),
        this.formatNoteRange(settings.noteRange),
        this.formatClefs(settings.clefs)
      ];
      if (settings.clefTransition) {
        parts.push(this.formatTransition(settings.clefTransition));
      }
      parts.push(this.formatDuration(settings.durationSeconds));
      parts.push(this.formatAccidentals(settings.accidentals));
      return parts.join(" · ");
    },
    formatCustomConfigurationOption(configuration) {
      return this.$tc(
        "ROUND_STATS_CUSTOM_FILTER_OPTION",
        configuration.roundCount,
        {
          count: configuration.roundCount,
          settings: this.formatSettingsSummary(configuration.settings)
        }
      );
    },
    formatCurrentSettings() {
      return this.formatSettingsSummary(createNormalRoundSettings(this.options));
    }
  }
};
</script>

<style scoped>
.round-statistics {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0 0 15px;
  border: 0;
  background: transparent;
  text-align: left;
  overflow: visible;
}


.statistics-summary-icon,
.statistics-filter-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  background: #e1eef0;
  color: #286a77;
}

.statistics-summary-icon svg,
.statistics-filter-icon svg,
.empty-state-icon svg {
  width: 29px;
  height: 29px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}






.statistics-content {
  min-width: 0;
  padding: 12px 0 0;
}


.statistics-filter-card,
.empty-state {
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.statistics-overview {
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
}

.statistics-filter-heading {
  display: grid;
  grid-template-columns: 47px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 14px 15px 13px;
  border-bottom: 1px solid rgba(43, 70, 77, 0.09);
}

.statistics-filter-icon {
  width: 45px;
  height: 45px;
  background: #fff0e8;
  color: #d85624;
}

.statistics-filter-icon circle {
  fill: #fff0e8;
}

.statistics-filter-heading h4 {
  margin: 0;
  color: #26383d;
  font-size: 14px;
  line-height: 1.2;
}

.statistics-filter-heading p {
  margin: 3px 0 0;
  color: #718084;
  font-size: 10px;
  line-height: 1.35;
}

.statistics-filter-body {
  padding: 3px 15px 17px;
}

.scope-label {
  margin-top: 15px;
  color: #53686d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
}

.scope-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.input-options {
  margin-top: 8px;
}

.scope-options button {
  min-width: 0;
  min-height: 44px;
  padding: 7px 8px;
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.86);
  color: #5d6e72;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.scope-options button:hover,
.scope-options button:focus-visible {
  border-color: rgba(45, 110, 123, 0.52);
  background: #fff;
  color: #26383d;
  outline: none;
}

.scope-options button.selected {
  border-color: #2d6e7b;
  background: #e1eef0;
  box-shadow: inset 0 0 0 1px rgba(45, 110, 123, 0.1);
  color: #245d68;
}


.custom-configuration-filter {
  display: block;
  margin-top: 15px;
}

.custom-configuration-filter span {
  display: block;
  margin-bottom: 8px;
  color: #53686d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
}

.custom-configuration-filter select {
  width: 100%;
  min-height: 44px;
  padding: 7px 11px;
  border: 1px solid rgba(43, 70, 77, 0.22);
  border-radius: 13px;
  background: #fff;
  color: #304d59;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
}

.comparison-label {
  position: relative;
  margin: 10px 0 0;
  padding: 10px 12px 10px 28px;
  border: 1px solid rgba(45, 110, 123, 0.12);
  border-radius: 14px;
  background: rgba(225, 238, 240, 0.7);
  color: #41636a;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.comparison-label::before {
  content: "";
  position: absolute;
  top: 14px;
  left: 13px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2d6e7b;
}

.statistics-overview {
  margin-top: 12px;
  padding: 15px;
}

.statistics-overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.statistics-overview-heading h4 {
  margin: 0;
  color: #26383d;
  font-size: 13px;
}

.statistics-overview-heading span {
  color: #718084;
  font-size: 9px;
  font-weight: 700;
}

.statistics-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
}

.empty-state {
  display: grid;
  grid-template-columns: 43px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 14px 15px;
  color: #62757d;
}

.empty-state-icon {
  display: grid;
  width: 41px;
  height: 41px;
  place-items: center;
  border-radius: 13px;
  background: #edf4f4;
  color: #76949a;
}

.empty-state-icon svg {
  width: 25px;
  height: 25px;
}

.empty-state > div:last-child {
  display: grid;
  gap: 3px;
}

.empty-state strong {
  color: #3f555a;
  font-size: 11px;
}

.empty-state > div:last-child > span {
  font-size: 10px;
  line-height: 1.4;
}

.selected-round-details {
  margin-top: 10px;
  padding: 11px;
  border: 1px solid #efb7a3;
  border-left: 4px solid #e85c2c;
  border-radius: 10px;
  background: #fffaf7;
}

.round-details-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.round-details-heading h4 {
  margin: 0;
  color: #7e351e;
  font-size: 10pt;
}

.round-details-heading button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border: 1px solid #d7a18e;
  border-radius: 8px;
  background: white;
  color: #6e3827;
  font-size: 15pt;
  cursor: pointer;
}

.round-sequence-number {
  margin: 4px 0 0;
  color: #7e351e;
  font-size: 8.5pt;
  font-weight: bold;
}

.round-completed-at {
  margin: 3px 0 8px;
  color: #697b82;
  font-size: 8pt;
}

.round-result-values {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.round-result-values span {
  flex: 1 1 0;
  padding: 7px;
  border-radius: 8px;
  background: white;
  color: #526871;
  font-size: 8.5pt;
  text-align: center;
}

.round-result-values strong {
  color: #17495e;
}

.round-settings-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 12px;
  margin: 0;
}

.round-settings-list div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 2px;
  border-bottom: 1px solid #f0ded7;
  font-size: 8.5pt;
}

.round-settings-list dt {
  color: #718188;
}

.round-settings-list dd {
  margin: 0;
  color: #304d59;
  font-weight: bold;
  text-align: right;
}

@media (max-width: 540px) {
  .round-count {
    font-size: 8px;
  }

  .statistics-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .round-settings-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 370px) {
  .statistics-summary {
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 10px;
    padding-right: 12px;
    padding-left: 12px;
  }

  .statistics-summary-icon {
    width: 43px;
    height: 43px;
  }

  .statistics-summary-copy > span,
  .summary-meta {
    display: none;
  }

  .statistics-filter-heading,
  .statistics-filter-body,
  .statistics-overview,
  .empty-state {
    padding-right: 12px;
    padding-left: 12px;
  }

  .scope-options {
    gap: 6px;
  }

  .scope-options button {
    padding-right: 5px;
    padding-left: 5px;
    font-size: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scope-options button {
    transition: none;
  }
}
.statistics-response-note { margin: 10px 0 0; color: #657982; font-size: 11px; line-height: 1.45; }
@media (max-width: 540px) { .statistics-card-response { grid-column: 1 / -1; } }
</style>
