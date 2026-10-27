export const HISTORY_CHART_PAGE_SIZE = 50;
export const HISTORY_CHART_MAX_AXIS_LABELS = 6;

function toWholeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numericValue));
}

export function createHistoryPage(totalCount, requestedPage = null, pageSize = HISTORY_CHART_PAGE_SIZE) {
  const safeTotal = toWholeNumber(totalCount);
  const safePageSize = Math.max(1, toWholeNumber(pageSize, HISTORY_CHART_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const desiredPage = requestedPage === null || requestedPage === undefined
    ? pageCount
    : toWholeNumber(requestedPage, pageCount);
  const page = Math.min(pageCount, Math.max(1, desiredPage));
  const startIndex = safeTotal > 0 ? (page - 1) * safePageSize : 0;
  const endIndex = Math.min(safeTotal, startIndex + safePageSize);

  return {
    page,
    pageCount,
    pageSize: safePageSize,
    totalCount: safeTotal,
    startIndex,
    endIndex,
    firstNumber: safeTotal > 0 ? startIndex + 1 : 0,
    lastNumber: endIndex
  };
}

export function formatHistoryNumber(value, locale = "de") {
  const safeValue = toWholeNumber(value);
  const language = String(locale).toLowerCase().indexOf("de") === 0
    ? "de-DE"
    : "en-US";
  return safeValue.toLocaleString(language);
}

export function formatCompactHistoryNumber(value, locale = "de") {
  const safeValue = toWholeNumber(value);
  const isGerman = String(locale).toLowerCase().indexOf("de") === 0;
  const units = isGerman
    ? [
      { value: 1000000000, label: "Mrd." },
      { value: 1000000, label: "Mio." },
      { value: 1000, label: "Tsd." }
    ]
    : [
      { value: 1000000000, label: "B" },
      { value: 1000000, label: "M" },
      { value: 1000, label: "K" }
    ];
  const unit = units.find(item => safeValue >= item.value);
  if (!unit) {
    return formatHistoryNumber(safeValue, locale);
  }

  const scaled = safeValue / unit.value;
  const decimals = scaled < 10 ? 2 : (scaled < 100 ? 1 : 0);
  const rounded = Number(scaled.toFixed(decimals));
  const number = String(rounded).replace(".", isGerman ? "," : ".");
  const approximate = safeValue % unit.value === 0 ? "" : "≈";
  return `${approximate}${number} ${unit.label}`;
}

export function createHistoryAxisLabels(firstNumber, count, locale = "de") {
  const safeFirst = Math.max(1, toWholeNumber(firstNumber, 1));
  const safeCount = toWholeNumber(count);
  const useRelativeLabels = safeFirst + Math.max(0, safeCount - 1) >= 1000;

  return Array.from({ length: safeCount }, (unused, index) => {
    if (!useRelativeLabels) {
      return formatHistoryNumber(safeFirst + index, locale);
    }
    return index === 0
      ? formatCompactHistoryNumber(safeFirst, locale)
      : `+${index}`;
  });
}

export function shouldShowHistoryAxisLabel(index, count, maxLabels = HISTORY_CHART_MAX_AXIS_LABELS) {
  const safeCount = toWholeNumber(count);
  if (safeCount <= 0) {
    return false;
  }
  const lastIndex = safeCount - 1;
  const safeIndex = toWholeNumber(index);
  if (safeIndex === 0 || safeIndex === lastIndex) {
    return true;
  }
  const safeMaxLabels = Math.max(2, toWholeNumber(maxLabels, HISTORY_CHART_MAX_AXIS_LABELS));
  const interval = Math.max(1, Math.ceil(lastIndex / (safeMaxLabels - 1)));
  return safeIndex % interval === 0;
}

export default {
  HISTORY_CHART_PAGE_SIZE,
  HISTORY_CHART_MAX_AXIS_LABELS,
  createHistoryPage,
  formatHistoryNumber,
  formatCompactHistoryNumber,
  createHistoryAxisLabels,
  shouldShowHistoryAxisLabel
};
