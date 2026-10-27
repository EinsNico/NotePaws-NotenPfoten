<template>
  <section class="round-history-chart statistics-section-card" :aria-label="$t('ROUND_STATS_CHART_TITLE')">
    <div class="chart-heading">
      <div>
        <h4>{{$t('ROUND_STATS_CHART_TITLE')}}</h4>
        <p>
          {{$tc(
            isAllRounds
              ? 'ROUND_STATS_CHART_DESCRIPTION_ALL'
              : 'ROUND_STATS_CHART_DESCRIPTION',
            chartDescriptionCount,
            { count: chartDescriptionCount }
          )}}
        </p>
      </div>
      <div class="chart-controls">
        <label class="round-limit-control">
          <span>{{$t('ROUND_STATS_CHART_RANGE_LABEL')}}</span>
          <select v-model="roundLimit" :disabled="loading">
            <option
              v-for="option in roundLimitOptions"
              :key="option.value"
              :value="option.value">
                {{option.label}}
            </option>
          </select>
        </label>
        <div
          v-if="!accuracyOnly"
          class="metric-options"
          role="group"
          :aria-label="$t('ROUND_STATS_CHART_METRIC_LABEL')">
            <button
              v-for="option in metricOptions"
              :key="option.value"
              type="button"
              :class="{ selected: metric === option.value }"
              :aria-pressed="metric === option.value ? 'true' : 'false'"
              @click="metric = option.value">
                {{option.label}}
            </button>
        </div>
      </div>
    </div>

    <div
      v-if="metric === 'accuracy' && !loading"
      class="trend-summary"
      :class="`trend-${accuracyTrend.direction}`"
      aria-live="polite">
        <strong>{{$t(historyWindow ? 'ROUND_STATS_VISIBLE_TREND_TITLE' : 'ROUND_STATS_TREND_TITLE')}}</strong>
        <span>{{trendDescription}}</span>
    </div>
    <div v-if="metric === 'accuracy' && !loading" class="chart-legend" aria-hidden="true">
      <span><i class="round-line"></i>{{$t('ROUND_STATS_TREND_ROUNDS')}}</span>
      <span><i class="trend-line"></i>{{$t('ROUND_STATS_TREND_SMOOTHED')}}</span>
    </div>
    <slot name="status"></slot>
    <p v-if="!loading" class="point-hint">{{$t('ROUND_STATS_CHART_POINT_HINT')}}</p>
    <p v-if="showHistoryRange" class="history-range">
      {{historyRangeDescription}}
    </p>
    <nav
      v-if="showPageNavigation"
      class="history-page-navigation"
      :aria-label="$t('ROUND_STATS_CHART_PAGE_NAVIGATION')">
        <button type="button" :disabled="loading || !canGoOlder" @click="changeHistoryPage(-1)">
          {{$t('ROUND_STATS_CHART_PAGE_OLDER')}}
        </button>
        <span>
          {{$t('ROUND_STATS_CHART_PAGE_STATUS', {
            page: formatSequenceNumber(historyPageInfo.page),
            pages: formatSequenceNumber(historyPageInfo.pageCount)
          })}}
        </span>
        <button type="button" :disabled="loading || !canGoNewer" @click="changeHistoryPage(1)">
          {{$t('ROUND_STATS_CHART_PAGE_NEWER')}}
        </button>
    </nav>
    <p v-if="isScrollable" class="scroll-hint">
      {{$t('ROUND_STATS_CHART_SCROLL_HINT')}}
    </p>
    <div
      v-if="!loading"
      ref="chartScroll"
      class="chart-scroll"
      :class="{ scrollable: isScrollable }"
      :tabindex="isScrollable ? 0 : null"
      :aria-label="isScrollable ? $t('ROUND_STATS_CHART_SCROLL_HINT') : null">
        <div class="chart-content" :style="chartContentStyle">
          <div class="chart-frame">
            <chartist
              ratio="round-chart-fixed-height"
              type="Line"
              :data="chartData"
              :options="chartOptions"
              :event-handlers="chartEventHandlers">
            </chartist>
          </div>
          <div class="chart-direction" aria-hidden="true">
            <span>{{$t('ROUND_STATS_CHART_OLDEST')}}</span>
            <span>{{$t('ROUND_STATS_CHART_NEWEST')}}</span>
          </div>
        </div>
    </div>
  </section>
</template>

<script>
import "chartist/dist/chartist.min.css";
import {
  createMovingAverage,
  createRoundChartPoints,
  summarizeRoundTrend
} from "../model/RoundStatistics";
import {
  createHistoryAxisLabels,
  createHistoryPage,
  formatHistoryNumber,
  shouldShowHistoryAxisLabel
} from "../model/HistoryChartWindow";

export default {
  name: "RoundHistoryChart",
  props: {
    rounds: {
      type: Array,
      required: true
    },
    selectedRoundId: {
      type: String,
      default: null
    },
    historyWindow: {
      type: Object,
      default: null
    },
    accuracyOnly: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      metric: "accuracy",
      roundLimit: 10,
      historyPage: null
    };
  },
  computed: {
    roundLimitOptions() {
      return [
        { value: 10, label: this.$t("ROUND_STATS_CHART_RANGE_10") },
        { value: 25, label: this.$t("ROUND_STATS_CHART_RANGE_25") },
        { value: 50, label: this.$t("ROUND_STATS_CHART_RANGE_50") },
        { value: "all", label: this.$t("ROUND_STATS_CHART_RANGE_ALL") }
      ];
    },
    metricOptions() {
      return [
        { value: "score", label: this.$t("ROUND_STATS_CHART_SCORE") },
        { value: "accuracy", label: this.$t("ROUND_STATS_CHART_ACCURACY") }
      ];
    },
    activeMetricLabel() {
      return this.metric === "accuracy"
        ? this.$t("ROUND_STATS_CHART_ACCURACY")
        : this.$t("ROUND_STATS_CHART_SCORE");
    },
    isAllRounds() {
      return this.roundLimit === "all";
    },
    pointLimit() {
      return this.isAllRounds ? null : Number(this.roundLimit);
    },
    normalRoundCount() {
      if (this.historyWindow) return this.historyWindow.totalCount;
      return this.rounds.filter(round => round && round.mode === "normal").length;
    },
    chartDescriptionCount() {
      return this.isAllRounds ? this.normalRoundCount : this.points.length;
    },
    allMetricPoints() {
      return createRoundChartPoints(this.rounds, this.metric, null);
    },
    historyPageInfo() {
      if (this.historyWindow) {
        return createHistoryPage(this.normalRoundCount, this.historyWindow.page);
      }
      return createHistoryPage(this.allMetricPoints.length, this.historyPage);
    },
    points() {
      if (this.historyWindow) return this.allMetricPoints;
      if (this.isAllRounds) {
        return this.allMetricPoints.slice(
          this.historyPageInfo.startIndex,
          this.historyPageInfo.endIndex
        );
      }
      return createRoundChartPoints(this.rounds, this.metric, this.pointLimit);
    },
    trendValues() {
      if (this.historyWindow) return this.historyWindow.trendValues;
      if (this.isAllRounds) {
        return createMovingAverage(this.allMetricPoints.map(point => point.value)).slice(
          this.historyPageInfo.startIndex,
          this.historyPageInfo.endIndex
        );
      }
      return createMovingAverage(this.points.map(point => point.value));
    },
    accuracyTrend() {
      if (this.historyWindow) return this.historyWindow.trend;
      const accuracyPoints = createRoundChartPoints(
        this.rounds,
        "accuracy",
        this.isAllRounds ? null : this.pointLimit
      );
      return summarizeRoundTrend(accuracyPoints);
    },
    trendDescription() {
      const translationKeys = {
        improving: "ROUND_STATS_TREND_IMPROVING",
        declining: "ROUND_STATS_TREND_DECLINING",
        stable: "ROUND_STATS_TREND_STABLE",
        insufficient: "ROUND_STATS_TREND_INSUFFICIENT"
      };
      return this.$t(translationKeys[this.accuracyTrend.direction], {
        difference: this.accuracyTrend.difference
      });
    },
    firstRoundNumber() {
      if (this.historyWindow) return this.historyWindow.startIndex + 1;
      if (this.isAllRounds) {
        return this.historyPageInfo.firstNumber;
      }
      return Math.max(1, this.normalRoundCount - this.points.length + 1);
    },
    showHistoryRange() {
      return this.points.length > 0 && (
        this.isAllRounds
        || this.firstRoundNumber >= 1000
        || this.normalRoundCount > this.points.length
      );
    },
    historyRangeDescription() {
      return this.$t("ROUND_STATS_CHART_VISIBLE_RANGE", {
        first: this.formatSequenceNumber(this.firstRoundNumber),
        last: this.formatSequenceNumber(this.firstRoundNumber + this.points.length - 1),
        total: this.formatSequenceNumber(this.normalRoundCount)
      });
    },
    showPageNavigation() {
      return this.isAllRounds && this.historyPageInfo.pageCount > 1;
    },
    canGoOlder() {
      return this.historyPageInfo.page > 1;
    },
    canGoNewer() {
      return this.historyPageInfo.page < this.historyPageInfo.pageCount;
    },
    isScrollable() {
      return this.points.length > 10;
    },
    chartContentStyle() {
      if (!this.isScrollable) {
        return { width: "100%" };
      }
      return { width: `${Math.max(720, this.points.length * 42)}px` };
    },
    chartEventHandlers() {
      return [{ event: "draw", fn: this.handleChartDraw }];
    },
    chartData() {
      const series = [this.points.map(point => point.value)];
      if (this.metric === "accuracy") {
        series.push(this.trendValues);
      }
      return {
        labels: createHistoryAxisLabels(
          this.firstRoundNumber,
          this.points.length,
          this.$i18n.locale
        ),
        series
      };
    },
    chartOptions() {
      const pointCount = this.points.length;
      return {
        fullWidth: true,
        showArea: true,
        showPoint: true,
        lineSmooth: false,
        low: 0,
        high: this.metric === "accuracy" ? 100 : undefined,
        chartPadding: {
          top: 14,
          right: 18,
          bottom: 0,
          left: 0
        },
        axisX: {
          showGrid: false,
          labelInterpolationFnc(value, index) {
            return shouldShowHistoryAxisLabel(index, pointCount)
              ? value
              : null;
          }
        },
        axisY: {
          onlyInteger: true,
          scaleMinSpace: 28
        }
      };
    }
  },
  watch: {
    selectedRoundId() {
      this.$nextTick(this.updateSelectedPointClasses);
    },
    roundLimit() {
      this.$emit("select-round", null, null);
      if (this.historyWindow) {
        this.$emit("request-window", { limit: this.roundLimit, page: null });
        return;
      }
      this.historyPage = this.isAllRounds
        ? createHistoryPage(this.normalRoundCount).page
        : null;
      this.$nextTick(this.scrollToNewest);
    },
    rounds() {
      if (this.isAllRounds && !this.historyWindow) {
        this.historyPage = createHistoryPage(
          this.normalRoundCount,
          this.historyPage
        ).page;
      }
      this.$nextTick(this.scrollToNewest);
    }
  },
  methods: {
    formatSequenceNumber(value) {
      return formatHistoryNumber(value, this.$i18n.locale);
    },
    changeHistoryPage(offset) {
      if (!this.isAllRounds) {
        return;
      }
      const page = createHistoryPage(
        this.normalRoundCount,
        this.historyPageInfo.page + offset
      ).page;
      this.$emit("select-round", null, null);
      if (this.historyWindow) {
        this.$emit("request-window", { limit: "all", page });
        return;
      }
      this.historyPage = page;
      this.$nextTick(this.scrollToNewest);
    },
    pointAriaLabel(point, index) {
      return this.$t("ROUND_STATS_CHART_ACCESSIBLE_POINT", {
        number: this.firstRoundNumber + index,
        value: point.value,
        metric: this.activeMetricLabel
      });
    },
    handleChartDraw(data) {
      if (data.type !== "point" || data.seriesIndex !== 0) {
        return;
      }
      const point = this.points[data.index];
      const node = data.element && data.element._node;
      if (!point || !node) {
        return;
      }
      const roundId = String(point.id || data.index);
      data.element.addClass("selectable-round-point");
      if (roundId === this.selectedRoundId) {
        data.element.addClass("selected-round-point");
      }
      node.setAttribute("data-round-id", roundId);
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", this.pointAriaLabel(point, data.index));
      node.setAttribute(
        "aria-pressed",
        roundId === this.selectedRoundId ? "true" : "false"
      );
      const selectRound = () => this.$emit(
        "select-round",
        point.round,
        this.firstRoundNumber + data.index
      );
      node.addEventListener("click", selectRound);
      node.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRound();
        }
      });
    },
    updateSelectedPointClasses() {
      const nodes = this.$el.querySelectorAll(".selectable-round-point");
      Array.prototype.forEach.call(nodes, node => {
        const selected = node.getAttribute("data-round-id") === this.selectedRoundId;
        node.classList.toggle("selected-round-point", selected);
        node.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    },
    scrollToNewest() {
      const chartScroll = this.$refs.chartScroll;
      if (chartScroll && this.isScrollable) {
        chartScroll.scrollLeft = chartScroll.scrollWidth;
      }
    }
  },
  mounted() {
    this.$nextTick(this.scrollToNewest);
  }
};
</script>

<style>
.round-history-chart {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-top: 13px;
  padding: 14px 15px;
}

.round-history-chart .chart-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.round-history-chart .chart-controls {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
}

.round-history-chart .round-limit-control {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #526d78;
  font-size: 8pt;
}

.round-history-chart .round-limit-control select {
  box-sizing: border-box;
  width: 120px;
  min-width: 120px;
  min-height: 34px;
  padding: 5px 24px 5px 8px;
  border: 1px solid #9ebfcb;
  border-radius: 8px;
  background: white;
  color: #284b59;
  font-size: 8.5pt;
}

.round-history-chart h4 {
  margin: 0;
  color: #274b5a;
  font-size: 10pt;
}

.round-history-chart .chart-heading p {
  margin: 3px 0 0;
  color: #657982;
  font-size: 8pt;
}

.round-history-chart .point-hint {
  margin: 8px 0 0;
  color: #526d78;
  font-size: 8pt;
}

.round-history-chart .history-range {
  margin: 7px 0 0;
  color: #315f72;
  font-size: 8pt;
  font-weight: bold;
}

.round-history-chart .history-page-navigation {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}

.round-history-chart .history-page-navigation button {
  min-height: 34px;
  padding: 5px 8px;
  border: 1px solid #9ebfcb;
  border-radius: 8px;
  background: white;
  color: #284b59;
  font-size: 8pt;
  cursor: pointer;
}

.round-history-chart .history-page-navigation button:last-child {
  justify-self: end;
}

.round-history-chart .history-page-navigation button:disabled {
  opacity: 0.45;
  cursor: default;
}

.round-history-chart .history-page-navigation span {
  color: #657982;
  font-size: 7.5pt;
  text-align: center;
}

.round-history-chart .trend-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 7px;
  margin-top: 10px;
  padding: 8px 10px;
  border-left: 4px solid #81939a;
  border-radius: 7px;
  background: #f2f6f7;
  color: #425d67;
  font-size: 8.5pt;
}

.round-history-chart .trend-improving {
  border-left-color: #36a853;
  background: #eef9f1;
}

.round-history-chart .trend-declining {
  border-left-color: #e85c2c;
  background: #fff3ee;
}

.round-history-chart .trend-stable {
  border-left-color: #e3bd32;
  background: #fffbea;
}

.round-history-chart .chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
  color: #526d78;
  font-size: 7.5pt;
}

.round-history-chart .chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.round-history-chart .chart-legend i {
  display: inline-block;
  width: 23px;
  height: 0;
  border-top: 3px solid #39748b;
}

.round-history-chart .chart-legend .trend-line {
  border-top-color: #e85c2c;
  border-top-style: dashed;
}

.round-history-chart .scroll-hint {
  margin: 4px 0 0;
  color: #77888f;
  font-size: 7.5pt;
}

.round-history-chart .metric-options {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
}

.round-history-chart .metric-options button {
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid #9ebfcb;
  border-radius: 8px;
  background: white;
  color: #49636d;
  font-size: 8.5pt;
  cursor: pointer;
}

.round-history-chart .metric-options button.selected {
  border-color: #39748b;
  background: lightblue;
  color: #153b4b;
  font-weight: bold;
}

.round-history-chart .chart-scroll {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-top: 8px;
  overflow-x: hidden;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.round-history-chart .chart-scroll.scrollable {
  overflow-x: auto;
  padding-bottom: 4px;
}

.round-history-chart .chart-scroll:focus {
  outline: 2px solid #79bfd6;
  outline-offset: 2px;
}

.round-history-chart .chart-content {
  min-width: 100%;
}

.round-history-chart .chart-frame .round-chart-fixed-height {
  position: relative;
  height: 205px;
}

.round-history-chart .chart-frame .round-chart-fixed-height > svg {
  display: block;
  width: 100%;
  height: 100%;
}

.round-history-chart .ct-series-a .ct-line,
.round-history-chart .ct-series-a .ct-point {
  stroke: #39748b;
}

.round-history-chart .ct-series-a .ct-area {
  fill: #79bfd6;
  pointer-events: none;
}

.round-history-chart .ct-line,
.round-history-chart .ct-series-b {
  pointer-events: none;
}

.round-history-chart .ct-series-b .ct-line {
  stroke: #e85c2c;
  stroke-width: 4px;
  stroke-dasharray: 7px 5px;
}

.round-history-chart .ct-series-b .ct-point,
.round-history-chart .ct-series-b .ct-area {
  display: none;
}

.round-history-chart .ct-line {
  stroke-width: 3px;
}

.round-history-chart .ct-point {
  stroke-width: 12px;
  stroke-linecap: round;
}

.round-history-chart .ct-point.selectable-round-point {
  cursor: pointer;
}

.round-history-chart .ct-point.selectable-round-point:focus {
  outline: none;
  stroke-width: 16px;
}

.round-history-chart .ct-series-a .ct-point.selected-round-point {
  stroke: #e85c2c;
  stroke-width: 16px;
}

.round-history-chart .ct-grid {
  stroke: #dbe9ee;
}

.round-history-chart .ct-label {
  color: #687b83;
  fill: #687b83;
  font-size: 8pt;
}

.round-history-chart .chart-direction {
  display: flex;
  justify-content: space-between;
  margin: 1px 4px 0 34px;
  color: #77888f;
  font-size: 7.5pt;
}

@media (max-width: 540px) {
  .round-history-chart .chart-heading {
    display: block;
  }

  .round-history-chart .chart-controls {
    align-items: stretch;
    margin-top: 8px;
  }

  .round-history-chart .round-limit-control {
    justify-content: space-between;
  }

  .round-history-chart .metric-options button {
    flex: 1 1 0;
  }

  .round-history-chart .chart-frame .round-chart-fixed-height {
    height: 220px;
  }
}
</style>
