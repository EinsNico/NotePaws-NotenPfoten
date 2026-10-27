import { createHistoryPage } from "./HistoryChartWindow";
import { summarizeRoundTrend, ROUND_TREND_WINDOW_SIZE } from "./RoundStatistics";

export function createNoteFlowHistoryWindow(totalCount, limit = 10, page = null) {
  const total = Math.max(0, Math.floor(Number(totalCount) || 0));
  const historyPage = createHistoryPage(total, page);
  const all = limit === "all";
  const count = [10, 25, 50].includes(Number(limit)) ? Number(limit) : 10;
  const startIndex = all ? historyPage.startIndex : Math.max(0, total - count);
  const endIndex = all ? historyPage.endIndex : total;
  return {
    totalCount: total,
    limit: all ? "all" : count,
    page: all ? historyPage.page : null,
    startIndex,
    endIndex,
    readStart: Math.max(0, startIndex - ROUND_TREND_WINDOW_SIZE + 1),
    trendValues: [],
    trend: summarizeRoundTrend([])
  };
}

export function evaluatedNoteFlowInputs(round) {
  const score = round && round.score || {};
  return [score.correct, score.wrong, score.missed].reduce((sum, value) => (
    sum + Math.max(0, Number(value) || 0)
  ), 0);
}

export function createNoteFlowHistoryData(window, records) {
  const contextCount = window.startIndex - window.readStart;
  const adapted = records.map((round, index) => ({
    id: round.id,
    mode: "normal",
    // The database sequence defines the round number; the original date stays
    // available in sourceRound even when older history is imported later.
    completedAt: window.readStart + index + 1,
    accuracy: Math.max(0, Math.min(100, Number(round.score && round.score.accuracy) || 0)),
    sourceRound: round,
    evaluatedInputs: evaluatedNoteFlowInputs(round)
  }));
  const rounds = adapted.slice(contextCount);
  const trendValues = adapted.map((round, index) => {
    const rated = adapted.slice(Math.max(0, index - ROUND_TREND_WINDOW_SIZE + 1), index + 1)
      .filter(item => item.evaluatedInputs > 0);
    return rated.length ? Math.round(rated.reduce((sum, item) => sum + item.accuracy, 0) / rated.length) : null;
  }).slice(contextCount);
  return {
    rounds,
    window: Object.assign({}, window, {
      trendValues,
      unratedCount: rounds.filter(round => !round.evaluatedInputs).length,
      trend: summarizeRoundTrend(rounds.filter(round => round.evaluatedInputs > 0)
        .map(round => ({ value: round.accuracy })))
    })
  };
}
