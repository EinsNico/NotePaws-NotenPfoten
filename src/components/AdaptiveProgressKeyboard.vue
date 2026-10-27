<template>
  <div class="progress-keyboard">
    <div class="progress-view-control">
      <div class="progress-view-heading">
        <h3>{{$t('ADAPTIVE_PROGRESS_NOTE_VIEW')}}</h3>
        <span v-if="viewOptions.length > 1">{{$t('ADAPTIVE_PROGRESS_NOTE_VIEW_HINT')}}</span>
      </div>
      <div
        v-if="viewOptions.length > 1"
        class="progress-view-options"
        role="tablist"
        :aria-label="$t('ADAPTIVE_PROGRESS_NOTE_VIEW')">
        <button
          v-for="view in viewOptions"
          :key="view.value"
          type="button"
          role="tab"
          :aria-selected="selectedView === view.value ? 'true' : 'false'"
          :class="{ active: selectedView === view.value }"
          @click="selectView(view.value)">
            {{view.label}}
        </button>
      </div>
    </div>

    <div v-if="showNotationOptions" class="notation-options">
      <span>{{$t('ADAPTIVE_PROGRESS_NOTATION')}}</span>
      <button
        type="button"
        :class="{ active: selectedNotation === 'sharp' }"
        @click="selectNotation('sharp')">♯</button>
      <button
        type="button"
        :class="{ active: selectedNotation === 'flat' }"
        @click="selectNotation('flat')">♭</button>
    </div>

    <div class="keyboard-scroll">
      <div class="keyboard" :style="keyboardStyle">
        <button
          v-for="(key, index) in whiteKeys"
          :key="'progress-white-' + key.value"
          type="button"
          class="piano-key white-key"
          :class="{ first: index === 0, selected: selectedValue === key.value }"
          :style="keyStyle(key)"
          :aria-label="keyAriaLabel(key.value)"
          @click="selectKey(key.value)">
            <span v-if="key.isOctaveStart" class="octave-label">C{{key.octave}}</span>
        </button>
        <button
          v-for="key in blackKeys"
          :key="'progress-black-' + key.value"
          type="button"
          class="piano-key black-key"
          :class="{
            selected: selectedValue === key.value,
            excluded: !accidentalsEnabled
          }"
          :style="keyStyle(key)"
          :disabled="!accidentalsEnabled"
          :aria-label="keyAriaLabel(key.value)"
          @click="selectKey(key.value)"></button>
      </div>
    </div>

    <div class="progress-legend" aria-hidden="true">
      <div class="legend-scale">
        <span>{{$t('ADAPTIVE_PROGRESS_DIFFICULT')}}</span>
        <span class="legend-gradient"></span>
        <span>{{$t('ADAPTIVE_PROGRESS_SECURE')}}</span>
      </div>
      <div class="legend-unpracticed">
        <span class="unpracticed-swatch"></span>
        {{$t('ADAPTIVE_PROGRESS_UNPRACTICED')}}
      </div>
    </div>

    <div class="key-detail" aria-live="polite">
      <template v-if="selectedValue === null">
        {{$t('ADAPTIVE_PROGRESS_KEY_HINT')}}
      </template>
      <template v-else-if="selectedRecord">
        <div>
          {{$t('ADAPTIVE_PROGRESS_KEY_DETAIL', {
            note: selectedNoteLabel,
            mode: selectedViewLabel,
            attempts: selectedRecord.attempts,
            accuracy: selectedAccuracy
          })}}
        </div>
        <div class="response-time-detail">
          {{selectedResponseTimeText}}
        </div>
      </template>
      <template v-else>
        {{$t('ADAPTIVE_PROGRESS_KEY_UNPRACTICED', {
          note: selectedNoteLabel,
          mode: selectedViewLabel
        })}}
      </template>
    </div>
  </div>
</template>

<script>
import Utils from "../model/Utils";
import Options from "../model/Options";
import { getPersonalResponseTimeBaseline } from "../model/AdaptiveLearning";
import {
  getFirstTryAccuracy,
  getProgressColor,
  getProgressViewRecord,
  getResponseTimeComparison
} from "../model/AdaptiveProgressView";

const MIN_WHITE_KEY_WIDTH = 23;

export default {
  name: "AdaptiveProgressKeyboard",
  props: {
    progress: {
      type: Object,
      required: true
    },
    minValue: {
      type: Number,
      required: true
    },
    maxValue: {
      type: Number,
      required: true
    },
    clefs: {
      type: Array,
      required: true
    },
    accidentals: {
      type: String,
      default: "no"
    },
    candidates: {
      type: Array,
      default: null
    }
  },
  data() {
    return {
      selectedView: "treble",
      selectedNotation: "sharp",
      selectedValue: null
    };
  },
  computed: {
    viewOptions() {
      if (this.clefs.indexOf("piano") !== -1) {
        return [
          { value: "piano-bass", label: this.$t("bassClef") },
          { value: "piano-treble", label: this.$t("trebleClef") }
        ];
      }
      const views = [];
      if (this.clefs.indexOf("bass") !== -1) {
        views.push({ value: "bass", label: this.$t("bassClef") });
      }
      if (this.clefs.indexOf("treble") !== -1) {
        views.push({ value: "treble", label: this.$t("trebleClef") });
      }
      return views.length > 0
        ? views
        : [{ value: "treble", label: this.$t("trebleClef") }];
    },
    showNotationOptions() {
      return this.accidentals === "sharpAndFlat";
    },
    accidentalsEnabled() {
      return this.accidentals !== "no";
    },
    viewCandidates() {
      if (!this.candidates) return null;
      const piano = this.selectedView.indexOf("piano-") === 0;
      const clef = piano ? this.selectedView.replace("piano-", "") : this.selectedView;
      return this.candidates.filter(note => note.clef === clef
        && note.staff === (piano ? "piano" : clef));
    },
    viewRange() {
      if (!this.viewCandidates) return { min: this.minValue, max: this.maxValue };
      const values = this.viewCandidates.map(note => note.value);
      return values.length
        ? { min: Math.min(...values), max: Math.max(...values) }
        : { min: this.minValue, max: this.minValue - 1 };
    },
    keys() {
      const keys = [];
      let whiteIndex = 0;
      const whiteCount = this.whiteKeyCount;
      const whiteWidth = 100 / whiteCount;
      const blackWidth = whiteWidth * 0.62;
      for (let value = this.viewRange.min; value <= this.viewRange.max; value += 1) {
        if (Utils.hasAccidental(value)) {
          keys.push({
            value,
            black: true,
            left: whiteIndex * whiteWidth - blackWidth / 2,
            width: blackWidth
          });
        } else {
          keys.push({
            value,
            black: false,
            left: whiteIndex * whiteWidth,
            width: whiteWidth,
            octave: Math.floor(value / 12),
            isOctaveStart: value % 12 === 0
          });
          whiteIndex += 1;
        }
      }
      return keys;
    },
    whiteKeyCount() {
      let count = 0;
      for (let value = this.viewRange.min; value <= this.viewRange.max; value += 1) {
        if (!Utils.hasAccidental(value)) {
          count += 1;
        }
      }
      return Math.max(1, count);
    },
    whiteKeys() {
      return this.keys.filter(key => !key.black);
    },
    blackKeys() {
      return this.keys.filter(key => key.black);
    },
    keyboardStyle() {
      return {
        minWidth: `${this.whiteKeyCount * MIN_WHITE_KEY_WIDTH}px`
      };
    },
    selectedRecord() {
      if (this.selectedValue === null) {
        return null;
      }
      return this.recordFor(this.selectedValue);
    },
    selectedAccuracy() {
      return getFirstTryAccuracy(this.selectedRecord);
    },
    personalResponseTimeBaseline() {
      return getPersonalResponseTimeBaseline(this.progress);
    },
    selectedResponseTimeText() {
      return this.responseTimeText(this.selectedRecord);
    },
    selectedNoteLabel() {
      return this.noteLabel(this.selectedValue);
    },
    selectedViewLabel() {
      const selected = this.viewOptions.find(view => view.value === this.selectedView);
      return selected ? selected.label : this.selectedView;
    }
  },
  watch: {
    clefs: {
      deep: true,
      handler() {
        this.syncSelectedView();
      }
    },
    accidentals() {
      this.syncSelectedNotation();
      this.selectedValue = null;
    },
    minValue() {
      this.keepSelectedValueInRange();
    },
    maxValue() {
      this.keepSelectedValueInRange();
    },
    candidates() {
      this.keepSelectedValueInRange();
    }
  },
  methods: {
    syncSelectedView() {
      if (!this.viewOptions.some(view => view.value === this.selectedView)) {
        this.selectedView = this.viewOptions[0].value;
        this.selectedValue = null;
      }
    },
    syncSelectedNotation() {
      if (this.accidentals === "onlyFlat") {
        this.selectedNotation = "flat";
      } else if (this.accidentals === "onlySharp") {
        this.selectedNotation = "sharp";
      }
    },
    keepSelectedValueInRange() {
      if (
        this.selectedValue !== null
        && (this.selectedValue < this.viewRange.min || this.selectedValue > this.viewRange.max)
      ) {
        this.selectedValue = null;
      }
    },
    selectView(view) {
      this.selectedView = view;
      this.selectedValue = null;
    },
    selectNotation(notation) {
      this.selectedNotation = notation;
      this.selectedValue = null;
    },
    selectKey(value) {
      if (value >= this.viewRange.min && value <= this.viewRange.max) {
        this.selectedValue = value;
      }
    },
    recordFor(value) {
      return getProgressViewRecord(
        this.progress,
        this.selectedView,
        value,
        this.selectedNotation
      );
    },
    keyStyle(key) {
      const included = !key.black || this.accidentalsEnabled;
      return {
        left: `${key.left}%`,
        width: `${key.width}%`,
        backgroundColor: included
          ? getProgressColor(this.recordFor(key.value), key.black)
          : "#333333"
      };
    },
    noteLabel(value) {
      const noteName = Utils.getDisplayNoteName(
        value % 12,
        this.selectedNotation === "sharp",
        Options.noteNaming
      );
      return `${noteName}${Math.floor(value / 12)}`;
    },
    formatResponseTime(milliseconds) {
      const seconds = (Number(milliseconds) / 1000).toFixed(2).replace(/0$/, "");
      return this.$i18n.locale === "de" ? seconds.replace(".", ",") : seconds;
    },
    responseTimeText(record) {
      if (!record || record.averageResponseTimeMs === null) {
        return this.$t("ADAPTIVE_PROGRESS_RESPONSE_TIME_EMPTY");
      }
      const averageText = this.$t("ADAPTIVE_PROGRESS_RESPONSE_TIME_AVERAGE", {
        time: this.formatResponseTime(record.averageResponseTimeMs)
      });
      const comparison = getResponseTimeComparison(
        record,
        this.personalResponseTimeBaseline
      );
      if (!comparison) {
        return `${averageText} · ${this.$t("ADAPTIVE_PROGRESS_RESPONSE_TIME_PENDING")}`;
      }
      if (comparison.direction === "similar") {
        return `${averageText} · ${this.$t("ADAPTIVE_PROGRESS_RESPONSE_TIME_SIMILAR")}`;
      }
      return `${averageText} · ${this.$t(
        comparison.direction === "faster"
          ? "ADAPTIVE_PROGRESS_RESPONSE_TIME_FASTER"
          : "ADAPTIVE_PROGRESS_RESPONSE_TIME_SLOWER",
        { time: this.formatResponseTime(comparison.differenceMs) }
      )}`;
    },
    keyAriaLabel(value) {
      const record = this.recordFor(value);
      if (!record) {
        return this.$t("ADAPTIVE_PROGRESS_KEY_UNPRACTICED", {
          note: this.noteLabel(value),
          mode: this.selectedViewLabel
        });
      }
      const detail = this.$t("ADAPTIVE_PROGRESS_KEY_DETAIL", {
        note: this.noteLabel(value),
        mode: this.selectedViewLabel,
        attempts: record.attempts,
        accuracy: getFirstTryAccuracy(record)
      });
      return `${detail}. ${this.responseTimeText(record)}`;
    }
  },
  created() {
    this.syncSelectedView();
    this.syncSelectedNotation();
  }
};
</script>

<style scoped>
.progress-keyboard { margin: 0; padding: 14px 15px; }

.progress-view-control { margin-bottom: 12px; }

.progress-view-heading {
  display: grid;
  gap: 2px;
  margin-bottom: 7px;
  color: #526d78;
  font-size: 7.5pt;
  text-align: left;
}

.progress-view-heading h3 {
  margin: 0;
  font-size: 12px;
  color: #315f72;
}

.progress-view-options,
.notation-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
}

.progress-view-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 0;
}

.progress-view-options button,
.notation-options button {
  min-width: 58px;
  padding: 7px 9px;
  border: 1px solid #888;
  border-radius: 7px;
  background: white;
  color: #333;
  font-size: 9pt;
}

.progress-view-options button.active,
.notation-options button.active {
  border-color: #406f82;
  background: lightblue;
  color: #111;
  font-weight: bold;
}

.notation-options span {
  margin-right: 3px;
  color: #555;
  font-size: 9pt;
}

.notation-options button {
  min-width: 42px;
}

.keyboard-scroll {
  overflow-x: auto;
  padding: 4px 1px 8px;
  -webkit-overflow-scrolling: touch;
}

.keyboard {
  position: relative;
  width: 100%;
  height: 92px;
  margin-bottom: 16px;
}

.piano-key {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  min-width: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  cursor: pointer;
}

.white-key {
  z-index: 1;
  height: 100%;
  border: 1px solid #666;
  border-left-width: 0;
}

.white-key.first {
  border-left-width: 1px;
}

.black-key {
  z-index: 2;
  height: 61%;
  border: 1px solid #222;
}

.black-key.excluded {
  cursor: default;
  opacity: 0.92;
}

.piano-key.selected {
  z-index: 3;
  outline: 3px solid #2b7da0;
  outline-offset: -3px;
}

.octave-label {
  position: absolute;
  top: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  color: #666;
  font-size: 8px;
  line-height: 1;
  white-space: nowrap;
}

.progress-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 14px;
  color: #555;
  font-size: 8.5pt;
}

.legend-scale,
.legend-unpracticed {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-gradient {
  display: inline-block;
  width: 70px;
  height: 10px;
  border: 1px solid #777;
  border-radius: 5px;
  background: linear-gradient(to right, hsl(0, 68%, 60%), hsl(60, 68%, 64%), hsl(120, 68%, 60%));
}

.unpracticed-swatch {
  display: inline-block;
  width: 14px;
  height: 10px;
  border: 1px solid #777;
  border-radius: 2px;
  background: #e5e5e5;
}

.key-detail {
  min-height: 30px;
  margin-top: 9px;
  padding: 7px 8px;
  border-radius: 6px;
  background: white;
  color: #444;
  font-size: 9pt;
}

.response-time-detail {
  margin-top: 5px;
  color: #315f72;
  font-weight: bold;
}

@media (max-width: 420px) {
  .keyboard {
    height: 82px;
  }

  .legend-gradient {
    width: 55px;
  }
}
</style>
