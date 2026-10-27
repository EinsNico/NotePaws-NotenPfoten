<template>
  <div class="adaptive-history">
  <section class="adaptive-history-chart statistics-section-card" :aria-label="$t('ADAPTIVE_TREND_TITLE')">
    <div class="adaptive-chart-heading">
      <div>
        <h4>{{$t('ADAPTIVE_TREND_TITLE')}}</h4>
        <p v-if="totalSegmentCount">
          {{$tc('ADAPTIVE_TREND_DESCRIPTION', totalSegmentCount, {
            count: totalSegmentCount
          })}}
        </p>
        <p v-else>{{$t('ADAPTIVE_TREND_EMPTY')}}</p>
      </div>
      <label v-if="totalSegmentCount > 10" class="adaptive-limit-control">
        <span>{{$t('ADAPTIVE_TREND_RANGE_LABEL')}}</span>
        <select v-model="segmentLimit">
          <option v-for="option in limitOptions" :key="option.value" :value="option.value">
            {{option.label}}
          </option>
        </select>
      </label>
    </div>

    <div v-if="points.length" class="adaptive-trend-summary" :class="`trend-${trend.direction}`">
      <strong>{{$t('ADAPTIVE_TREND_SUMMARY_TITLE')}}</strong>
      <span>{{trendDescription}}</span>
    </div>

    <div v-if="points.length" class="adaptive-chart-legend" aria-hidden="true">
      <span><i class="result-line"></i>{{$t('ADAPTIVE_TREND_RESULTS')}}</span>
      <span><i class="average-line"></i>{{$t('ADAPTIVE_TREND_SMOOTHED')}}</span>
    </div>

    <div v-if="!points.length" class="adaptive-trend-placeholder">
      <div class="collection-progress" role="progressbar" :aria-valuemin="0"
        :aria-valuemax="minimumSegmentSize" :aria-valuenow="trendHistory.pendingCount">
        <span :style="collectionProgressStyle"></span>
      </div>
      <strong>{{$t('ADAPTIVE_TREND_COLLECTING')}}</strong>
      <span>{{$t('ADAPTIVE_TREND_PENDING', {
        count: trendHistory.pendingCount,
        needed: minimumSegmentSize
      })}}</span>
    </div>

    <template v-else>
      <p class="adaptive-point-hint">{{$t('ADAPTIVE_TREND_POINT_HINT')}}</p>
      <p v-if="showHistoryRange" class="adaptive-history-range">
        {{historyRangeDescription}}
      </p>
      <nav v-if="showPageNavigation" class="adaptive-page-navigation"
        :aria-label="$t('ADAPTIVE_TREND_PAGE_NAVIGATION')">
        <button type="button" :disabled="historyPageLoading || !canGoOlder"
          @click="changeHistoryPage(-1)">
          {{$t('ADAPTIVE_TREND_PAGE_OLDER')}}
        </button>
        <span>
          {{$t('ADAPTIVE_TREND_PAGE_STATUS', {
            page: formatSequenceNumber(historyPageInfo.page),
            pages: formatSequenceNumber(historyPageInfo.pageCount)
          })}}
        </span>
        <button type="button" :disabled="historyPageLoading || !canGoNewer"
          @click="changeHistoryPage(1)">
          {{$t('ADAPTIVE_TREND_PAGE_NEWER')}}
        </button>
      </nav>
      <p v-if="isScrollable" class="adaptive-scroll-hint">
        {{$t('ADAPTIVE_TREND_SCROLL_HINT')}}
      </p>
      <div ref="chartScroll" class="adaptive-chart-scroll"
        :class="{ scrollable: isScrollable }" :tabindex="isScrollable ? 0 : null">
        <div class="adaptive-chart-content" :style="chartContentStyle">
          <div class="adaptive-chart-frame">
            <chartist ratio="adaptive-chart-fixed-height" type="Line"
              :data="chartData" :options="chartOptions"
              :event-handlers="chartEventHandlers"></chartist>
          </div>
          <div class="adaptive-chart-direction" aria-hidden="true">
            <span>{{$t('ADAPTIVE_TREND_OLDEST')}}</span>
            <span>{{$t('ADAPTIVE_TREND_NEWEST')}}</span>
          </div>
        </div>
      </div>
    </template>

    <article v-if="selectedSegment" class="adaptive-segment-details" aria-live="polite">
      <button type="button" :aria-label="$t('ADAPTIVE_TREND_CLOSE_DETAILS')"
        @click="selectedSegmentId = null">×</button>
      <strong>{{$t('ADAPTIVE_TREND_DETAILS')}}</strong>
      <span>{{$t('ADAPTIVE_TREND_DETAIL_NUMBER', {
        number: formatSequenceNumber(selectedSegmentNumber)
      })}}</span>
      <span>{{formatDateTime(selectedSegment.completedAt)}}</span>
      <div>
        <span>{{$t('ADAPTIVE_TREND_DETAIL_NOTES', { count: selectedSegment.exerciseCount })}}</span>
        <span>{{$t('ADAPTIVE_TREND_DETAIL_ACCURACY', { value: selectedSegment.accuracy })}}</span>
        <span v-if="selectedSegment.averageResponseTimeMs !== null">
          {{$t('ADAPTIVE_TREND_DETAIL_RESPONSE', {
            value: formatSeconds(selectedSegment.averageResponseTimeMs)
          })}}
        </span>
      </div>
    </article>

  </section>

    <section class="adaptive-learning-times statistics-section-card" :aria-label="$t('ADAPTIVE_TIME_TITLE')">
      <div class="learning-time-heading">
        <h4>{{$t('ADAPTIVE_TIME_TITLE')}}</h4>
        <p>{{$t('ADAPTIVE_TIME_DESCRIPTION')}}</p>
      </div>

      <div class="time-bucket-coverage">
        <div v-for="bucket in learningTimes.buckets" :key="bucket.startHour"
          class="time-bucket" :class="{ eligible: bucket.eligible }">
          <div class="time-bucket-meter" role="progressbar" :aria-valuemin="0"
            :aria-valuemax="minimumDaysPerTimeBucket" :aria-valuenow="bucket.dayCount"
            :aria-label="$t('ADAPTIVE_TIME_BUCKET_PROGRESS', {
              range: timeRange(bucket),
              count: bucket.dayCount,
              needed: minimumDaysPerTimeBucket
            })">
            <span :style="timeBucketStyle(bucket)"></span>
          </div>
          <small>{{timeRange(bucket)}}</small>
        </div>
      </div>

      <div v-if="!learningTimes.ready" class="learning-time-pending">
        <div class="learning-time-progress" role="progressbar" :aria-valuemin="0"
          :aria-valuemax="100" :aria-valuenow="learningTimes.progressPercent">
          <span :style="learningTimeProgressStyle"></span>
        </div>
        <strong>{{$t('ADAPTIVE_TIME_COLLECTING')}}</strong>
        <span>{{$t('ADAPTIVE_TIME_PENDING', {
          days: learningTimes.recordedDays,
          requiredDays: learningTimes.requiredDays,
          windows: learningTimes.eligibleBucketCount,
          requiredWindows: learningTimes.requiredBucketCount
        })}}</span>
      </div>

      <template v-else>
        <div class="learning-time-results">
          <article class="best-learning-time">
            <span>{{$t('ADAPTIVE_TIME_BEST')}}</span>
            <strong>{{timeRange(learningTimes.best)}}</strong>
            <small>{{learningTimeMeta(learningTimes.best)}}</small>
          </article>
          <article class="challenging-learning-time">
            <span>{{$t('ADAPTIVE_TIME_CHALLENGING')}}</span>
            <strong>{{timeRange(learningTimes.mostChallenging)}}</strong>
            <small>{{learningTimeMeta(learningTimes.mostChallenging)}}</small>
          </article>
        </div>
        <p class="learning-time-recommendation">
          {{$t(
            learningTimes.isStable
              ? 'ADAPTIVE_TIME_RECOMMENDATION_STABLE'
              : 'ADAPTIVE_TIME_RECOMMENDATION',
            { range: timeRange(learningTimes.best) }
          )}}
        </p>
      </template>
    </section>
  </div>
</template>

<script>
import "chartist/dist/chartist.min.css";
import {
  ADAPTIVE_TREND_MIN_SEGMENT_SIZE,
  summarizeAdaptiveTrendHistory
} from "../model/AdaptiveTrend";
import {
  LEARNING_TIME_MIN_DAYS_PER_BUCKET,
  formatLearningTimeRange,
  summarizeAdaptiveLearningTimes,
  summarizeAdaptiveLearningTimeWindows
} from "../model/AdaptiveLearningTime";
import SingleNotesLearningStorage from "../model/SingleNotesLearningStorage";
import { createMovingAverage, summarizeRoundTrend } from "../model/RoundStatistics";
import {
  createHistoryAxisLabels,
  createHistoryPage,
  formatHistoryNumber,
  shouldShowHistoryAxisLabel
} from "../model/HistoryChartWindow";

export default {
  name: "AdaptiveHistoryChart",
  props: {
    history: {
      type: Object,
      required: true
    },
    statisticsSnapshot: {
      type: Object,
      default: null
    },
    inputGroup: {
      type: String,
      default: "screen"
    }
  },
  data() {
    return {
      segmentLimit: 10,
      selectedSegmentId: null,
      historyPage: null,
      historyPageSegments: [],
      loadedHistoryPage: null,
      historyPageLoading: false,
      historyPageRequest: 0
    };
  },
  computed: {
    minimumSegmentSize() {
      return ADAPTIVE_TREND_MIN_SEGMENT_SIZE;
    },
    trendHistory() {
      if (this.usesDatabaseStatistics) {
        const trend = this.statisticsSnapshot.trend || {};
        return {
          segments: Array.isArray(trend.recent) ? trend.recent : [],
          pendingCount: Math.max(0, Number(trend.pendingCount) || 0),
          totalEvaluations: this.statisticsSnapshot.coverage.databaseAttempts,
          totalCount: Math.max(0, Number(trend.totalCount) || 0),
          overallTrend: trend.overallTrend || null
        };
      }
      return summarizeAdaptiveTrendHistory(this.history);
    },
    learningTimes() {
      if (this.usesDatabaseStatistics) {
        return summarizeAdaptiveLearningTimeWindows(
          this.statisticsSnapshot.learningTimeWindows
        );
      }
      return summarizeAdaptiveLearningTimes(this.history);
    },
    usesDatabaseStatistics() {
      return Boolean(
        this.statisticsSnapshot
        && this.statisticsSnapshot.source === "indexeddb"
        && this.statisticsSnapshot.readyForDisplay === true
      );
    },
    minimumDaysPerTimeBucket() {
      return LEARNING_TIME_MIN_DAYS_PER_BUCKET;
    },
    allSegments() {
      return this.trendHistory.segments;
    },
    totalSegmentCount() {
      return this.usesDatabaseStatistics
        ? this.trendHistory.totalCount
        : this.allSegments.length;
    },
    limitOptions() {
      return [
        { value: 10, label: this.$t("ADAPTIVE_TREND_RANGE_10") },
        { value: 25, label: this.$t("ADAPTIVE_TREND_RANGE_25") },
        { value: 50, label: this.$t("ADAPTIVE_TREND_RANGE_50") },
        { value: "all", label: this.$t("ADAPTIVE_TREND_RANGE_ALL") }
      ];
    },
    historyPageInfo() {
      return createHistoryPage(this.totalSegmentCount, this.historyPage);
    },
    historyPageSource() {
      if (!this.usesDatabaseStatistics) {
        return this.allSegments.slice(
          this.historyPageInfo.startIndex,
          this.historyPageInfo.endIndex
        );
      }
      if (this.loadedHistoryPage === this.historyPageInfo.page) {
        return this.historyPageSegments;
      }
      return this.allSegments;
    },
    points() {
      if (this.segmentLimit === "all") {
        if (this.usesDatabaseStatistics) {
          return this.historyPageSource.filter(segment => (
            segment.index >= this.historyPageInfo.firstNumber
            && segment.index <= this.historyPageInfo.lastNumber
          ));
        }
        return this.historyPageSource;
      }
      return this.allSegments.slice(-Number(this.segmentLimit));
    },
    firstSegmentNumber() {
      if (this.usesDatabaseStatistics && this.points.length > 0) {
        return this.points[0].index;
      }
      if (this.segmentLimit === "all") {
        return this.historyPageInfo.firstNumber;
      }
      return Math.max(1, this.allSegments.length - this.points.length + 1);
    },
    movingAverage() {
      if (this.segmentLimit === "all") {
        if (this.usesDatabaseStatistics) {
          const averages = createMovingAverage(
            this.historyPageSource.map(point => point.accuracy)
          );
          const valuesById = this.historyPageSource.reduce((result, point, index) => {
            result[point.id] = averages[index];
            return result;
          }, Object.create(null));
          return this.points.map(point => valuesById[point.id]);
        }
        return createMovingAverage(this.allSegments.map(point => point.accuracy)).slice(
          this.historyPageInfo.startIndex,
          this.historyPageInfo.endIndex
        );
      }
      return createMovingAverage(this.points.map(point => point.accuracy));
    },
    trend() {
      if (
        this.segmentLimit === "all"
        && this.usesDatabaseStatistics
        && this.trendHistory.overallTrend
      ) {
        return this.trendHistory.overallTrend;
      }
      const source = this.segmentLimit === "all" ? this.allSegments : this.points;
      return summarizeRoundTrend(source.map(point => ({ value: point.accuracy })));
    },
    trendDescription() {
      const keys = {
        improving: "ADAPTIVE_TREND_IMPROVING",
        declining: "ADAPTIVE_TREND_DECLINING",
        stable: "ADAPTIVE_TREND_STABLE",
        insufficient: "ADAPTIVE_TREND_INSUFFICIENT"
      };
      return this.$t(keys[this.trend.direction], { difference: this.trend.difference });
    },
    selectedSegment() {
      return this.allSegments.concat(this.historyPageSegments)
        .find(value => value.id === this.selectedSegmentId) || null;
    },
    selectedSegmentNumber() {
      if (this.usesDatabaseStatistics && this.selectedSegment) {
        return this.selectedSegment.index;
      }
      const index = this.allSegments.findIndex(value => value.id === this.selectedSegmentId);
      return index >= 0 ? index + 1 : 0;
    },
    collectionProgressStyle() {
      return {
        width: `${Math.min(100, this.trendHistory.pendingCount / this.minimumSegmentSize * 100)}%`
      };
    },
    learningTimeProgressStyle() {
      return { width: `${this.learningTimes.progressPercent}%` };
    },
    isScrollable() {
      return this.points.length > 10;
    },
    showHistoryRange() {
      return this.points.length > 0 && (
        this.segmentLimit === "all"
        || this.firstSegmentNumber >= 1000
        || this.totalSegmentCount > this.points.length
      );
    },
    historyRangeDescription() {
      return this.$t("ADAPTIVE_TREND_VISIBLE_RANGE", {
        first: this.formatSequenceNumber(this.firstSegmentNumber),
        last: this.formatSequenceNumber(this.firstSegmentNumber + this.points.length - 1),
        total: this.formatSequenceNumber(this.totalSegmentCount)
      });
    },
    showPageNavigation() {
      return this.segmentLimit === "all" && this.historyPageInfo.pageCount > 1;
    },
    canGoOlder() {
      return this.historyPageInfo.page > 1;
    },
    canGoNewer() {
      return this.historyPageInfo.page < this.historyPageInfo.pageCount;
    },
    chartContentStyle() {
      return this.isScrollable
        ? { width: `${Math.max(720, this.points.length * 42)}px` }
        : { width: "100%" };
    },
    chartData() {
      return {
        labels: createHistoryAxisLabels(
          this.firstSegmentNumber,
          this.points.length,
          this.$i18n.locale
        ),
        series: [
          this.points.map(point => point.accuracy),
          this.movingAverage
        ]
      };
    },
    chartEventHandlers() {
      return [{ event: "draw", fn: this.handleChartDraw }];
    },
    chartOptions() {
      const pointCount = this.points.length;
      return {
        fullWidth: true,
        showArea: true,
        showPoint: true,
        lineSmooth: false,
        low: 0,
        high: 100,
        chartPadding: { top: 14, right: 18, bottom: 0, left: 0 },
        axisX: {
          showGrid: false,
          labelInterpolationFnc(value, index) {
            return shouldShowHistoryAxisLabel(index, pointCount)
              ? value
              : null;
          }
        },
        axisY: { onlyInteger: true, scaleMinSpace: 28 }
      };
    }
  },
  watch: {
    segmentLimit() {
      this.historyPageRequest += 1;
      this.historyPageLoading = false;
      this.selectedSegmentId = null;
      this.historyPage = this.segmentLimit === "all"
        ? createHistoryPage(this.totalSegmentCount).page
        : null;
      if (this.segmentLimit === "all" && this.usesDatabaseStatistics) {
        this.loadDatabaseHistoryPage(this.historyPage);
      }
      this.$nextTick(this.scrollToNewest);
    },
    history() {
      if (!this.selectedSegment) {
        this.selectedSegmentId = null;
      }
      if (this.segmentLimit === "all") {
        this.historyPage = createHistoryPage(
          this.totalSegmentCount,
          this.historyPage
        ).page;
      }
    },
    statisticsSnapshot() {
      this.historyPageRequest += 1;
      this.historyPageSegments = [];
      this.loadedHistoryPage = null;
      this.selectedSegmentId = null;
      if (this.segmentLimit === "all" && this.usesDatabaseStatistics) {
        this.historyPage = createHistoryPage(this.totalSegmentCount).page;
        this.loadDatabaseHistoryPage(this.historyPage);
      }
    }
  },
  methods: {
    formatSequenceNumber(value) {
      return formatHistoryNumber(value, this.$i18n.locale);
    },
    changeHistoryPage(offset) {
      if (this.segmentLimit !== "all") {
        return;
      }
      const targetPage = createHistoryPage(
        this.totalSegmentCount,
        this.historyPageInfo.page + offset
      ).page;
      if (this.usesDatabaseStatistics) {
        this.loadDatabaseHistoryPage(targetPage);
        return;
      }
      this.historyPage = targetPage;
      this.selectedSegmentId = null;
      this.$nextTick(this.scrollToNewest);
    },
    loadDatabaseHistoryPage(page) {
      const pageInfo = createHistoryPage(this.totalSegmentCount, page);
      const startIndex = Math.max(0, pageInfo.startIndex - 4);
      const request = this.historyPageRequest + 1;
      this.historyPageRequest = request;
      this.historyPageLoading = true;
      return SingleNotesLearningStorage.readTrendPage(this.inputGroup, {
        startIndex,
        limit: Math.max(1, pageInfo.endIndex - startIndex)
      }).then(result => {
        if (request !== this.historyPageRequest) {
          return false;
        }
        this.historyPageLoading = false;
        if (!result.saved) {
          return false;
        }
        this.historyPageSegments = result.segments;
        this.loadedHistoryPage = pageInfo.page;
        this.historyPage = pageInfo.page;
        this.selectedSegmentId = null;
        this.$nextTick(this.scrollToNewest);
        return true;
      });
    },
    pointAriaLabel(point, index) {
      return this.$t("ADAPTIVE_TREND_ACCESSIBLE_POINT", {
        number: this.firstSegmentNumber + index,
        value: point.accuracy,
        count: point.exerciseCount
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
      data.element.addClass("selectable-adaptive-point");
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", this.pointAriaLabel(point, data.index));
      const selectPoint = () => {
        this.selectedSegmentId = point.id;
        this.$nextTick(this.updateSelectedPointClasses);
      };
      node.addEventListener("click", selectPoint);
      node.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPoint();
        }
      });
    },
    updateSelectedPointClasses() {
      const nodes = this.$el.querySelectorAll(".selectable-adaptive-point");
      Array.prototype.forEach.call(nodes, (node, index) => {
        node.classList.toggle(
          "selected-adaptive-point",
          this.points[index] && this.points[index].id === this.selectedSegmentId
        );
      });
    },
    formatDateTime(timestamp) {
      return new Date(timestamp).toLocaleString(this.$i18n.locale === "de" ? "de-DE" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    },
    formatSeconds(milliseconds) {
      const seconds = (Number(milliseconds) / 1000).toFixed(1);
      return this.$i18n.locale === "de" ? seconds.replace(".", ",") : seconds;
    },
    timeRange(bucket) {
      return formatLearningTimeRange(bucket.startHour);
    },
    timeBucketStyle(bucket) {
      return {
        height: `${Math.min(100, bucket.dayCount / this.minimumDaysPerTimeBucket * 100)}%`
      };
    },
    learningTimeMeta(bucket) {
      return this.$t("ADAPTIVE_TIME_RESULT_META", {
        accuracy: bucket.accuracy,
        days: bucket.dayCount,
        notes: bucket.exerciseCount
      });
    },
    scrollToNewest() {
      const element = this.$refs.chartScroll;
      if (element && this.isScrollable) {
        element.scrollLeft = element.scrollWidth;
      }
    }
  },
  mounted() {
    if (this.segmentLimit === "all" && this.usesDatabaseStatistics) {
      this.loadDatabaseHistoryPage(this.historyPageInfo.page);
    }
    this.$nextTick(this.scrollToNewest);
  }
};
</script>

<style>
.adaptive-history { display: grid; gap: 12px; min-width: 0; }
.adaptive-history-chart {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 14px 15px;
  text-align: left;
}

.adaptive-chart-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.adaptive-history-chart h4 {
  margin: 0;
  color: #274b5a;
  font-size: 10pt;
}

.adaptive-chart-heading p,
.adaptive-point-hint,
.adaptive-scroll-hint {
  margin: 3px 0 0;
  color: #657982;
  font-size: 8pt;
}

.adaptive-history-range {
  margin: 7px 0 0;
  color: #315f72;
  font-size: 8pt;
  font-weight: bold;
}

.adaptive-page-navigation {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}

.adaptive-page-navigation button {
  min-height: 34px;
  padding: 5px 8px;
  border: 1px solid #9ebfcb;
  border-radius: 8px;
  background: white;
  color: #284b59;
  font-size: 8pt;
  cursor: pointer;
}

.adaptive-page-navigation button:last-child {
  justify-self: end;
}

.adaptive-page-navigation button:disabled {
  opacity: 0.45;
  cursor: default;
}

.adaptive-page-navigation span {
  color: #657982;
  font-size: 7.5pt;
  text-align: center;
}

.adaptive-limit-control {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: #526d78;
  font-size: 7.5pt;
}

.adaptive-limit-control select {
  box-sizing: border-box;
  width: 120px;
  min-width: 120px;
  min-height: 34px;
  padding: 5px 24px 5px 8px;
  border: 1px solid #9ebfcb;
  border-radius: 8px;
  background: white;
  color: #284b59;
}

.adaptive-trend-summary {
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

.adaptive-trend-summary.trend-improving {
  border-left-color: #36a853;
  background: #eef9f1;
}

.adaptive-trend-summary.trend-declining {
  border-left-color: #e85c2c;
  background: #fff3ee;
}

.adaptive-trend-summary.trend-stable {
  border-left-color: #e3bd32;
  background: #fffbea;
}

.adaptive-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
  color: #526d78;
  font-size: 7.5pt;
}

.adaptive-chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.adaptive-chart-legend i {
  display: inline-block;
  width: 23px;
  border-top: 3px solid #39748b;
}

.adaptive-chart-legend .average-line {
  border-top-color: #e85c2c;
  border-top-style: dashed;
}

.adaptive-trend-placeholder {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  padding: 13px;
  border-radius: 8px;
  background: #f4f8fa;
  color: #526d78;
  font-size: 8.5pt;
  text-align: center;
}

.collection-progress {
  height: 10px;
  overflow: hidden;
  border-radius: 6px;
  background: #dfe9ed;
}

.collection-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #79bfd6, #39748b);
}

.adaptive-chart-scroll {
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

.adaptive-chart-scroll.scrollable {
  overflow-x: auto;
  padding-bottom: 4px;
}

.adaptive-chart-content {
  min-width: 100%;
}

.adaptive-chart-frame .adaptive-chart-fixed-height {
  position: relative;
  height: 205px;
}

.adaptive-chart-frame .adaptive-chart-fixed-height > svg {
  display: block;
  width: 100%;
  height: 100%;
}

.adaptive-history-chart .ct-series-a .ct-line,
.adaptive-history-chart .ct-series-a .ct-point {
  stroke: #39748b;
}

.adaptive-history-chart .ct-series-a .ct-area {
  fill: #79bfd6;
}

.adaptive-history-chart .ct-series-b .ct-line {
  stroke: #e85c2c;
  stroke-width: 4px;
  stroke-dasharray: 7px 5px;
}

.adaptive-history-chart .ct-series-b .ct-point,
.adaptive-history-chart .ct-series-b .ct-area {
  display: none;
}

.adaptive-history-chart .ct-line {
  stroke-width: 3px;
}

.adaptive-history-chart .ct-point {
  stroke-width: 12px;
  stroke-linecap: round;
  cursor: pointer;
}

.adaptive-history-chart .ct-point.selected-adaptive-point {
  stroke: #e85c2c;
  stroke-width: 16px;
}

.adaptive-history-chart .ct-grid {
  stroke: #dbe9ee;
}

.adaptive-history-chart .ct-label {
  color: #687b83;
  fill: #687b83;
  font-size: 8pt;
}

.adaptive-chart-direction {
  display: flex;
  justify-content: space-between;
  margin: 1px 4px 0 34px;
  color: #77888f;
  font-size: 7.5pt;
}

.adaptive-segment-details {
  position: relative;
  display: grid;
  gap: 3px;
  margin-top: 10px;
  padding: 10px 34px 10px 10px;
  border: 1px solid #efb39e;
  border-left: 4px solid #e85c2c;
  border-radius: 8px;
  background: #fff8f5;
  color: #526d78;
  font-size: 8.5pt;
}

.adaptive-segment-details > strong {
  color: #94401f;
}

.adaptive-segment-details div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.adaptive-segment-details button {
  position: absolute;
  top: 5px;
  right: 6px;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #94401f;
  font-size: 16pt;
  cursor: pointer;
}

.adaptive-learning-times { padding: 14px 15px; }

.learning-time-heading h4 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
}

.learning-time-heading p {
  margin: 3px 0 0;
  color: #657982;
  font-size: 8pt;
}

.time-bucket-coverage {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  row-gap: 12px;
  align-items: end;
  gap: 5px;
  margin-top: 10px;
}

.time-bucket {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #71838b;
  text-align: center;
}

.time-bucket-meter {
  position: relative;
  height: 36px;
  overflow: hidden;
  border: 1px solid #cadbe2;
  border-radius: 5px 5px 2px 2px;
  background: #e8eff2;
}

.time-bucket-meter span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  background: #79bfd6;
}

.time-bucket.eligible .time-bucket-meter {
  border-color: #4a8da5;
}

.time-bucket.eligible .time-bucket-meter span {
  background: #39748b;
}

.time-bucket small {
  overflow: hidden;
  font-size: 6.3pt;
  white-space: nowrap;
}

.learning-time-pending {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 8px;
  background: white;
  color: #526d78;
  font-size: 8.5pt;
  text-align: center;
}

.learning-time-progress {
  height: 10px;
  overflow: hidden;
  border-radius: 6px;
  background: #dfe9ed;
}

.learning-time-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #79bfd6, #39748b);
}

.learning-time-results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
}

.learning-time-results article {
  display: grid;
  gap: 3px;
  padding: 10px 7px;
  border: 1px solid #cfe2d4;
  border-top: 3px solid #4aaa68;
  border-radius: 8px;
  background: white;
  color: #60747c;
  font-size: 8pt;
  text-align: center;
}

.learning-time-results .challenging-learning-time {
  border-color: #f0d3c9;
  border-top-color: #df6c4c;
}

.learning-time-results strong {
  color: #17495e;
  font-size: 12pt;
}

.learning-time-recommendation {
  margin: 9px 0 0;
  padding: 8px 10px;
  border-left: 4px solid #e85c2c;
  border-radius: 7px;
  background: #fff8f5;
  color: #425d67;
  font-size: 8.5pt;
}

@media (max-width: 480px) {
  .adaptive-chart-heading {
    display: block;
  }

  .adaptive-limit-control {
    align-items: stretch;
    margin-top: 8px;
  }

  .adaptive-chart-frame .adaptive-chart-fixed-height {
    height: 220px;
  }

  .time-bucket small {
    font-size: 9px;
  }
}
@media (min-width: 1000px) { .time-bucket-coverage { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
@media (max-width: 480px) { .time-bucket-coverage { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
