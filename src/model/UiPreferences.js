import * as Lockr from "lockr";

export const ROUND_STATISTICS_OPEN_STORAGE_KEY = "uiRoundStatisticsOpen";
export const ADAPTIVE_PROGRESS_OPEN_STORAGE_KEY = "uiAdaptiveProgressOpen";

export function loadRoundStatisticsOpen() {
  return Lockr.get(ROUND_STATISTICS_OPEN_STORAGE_KEY, false) === true;
}

export function saveRoundStatisticsOpen(value) {
  const isOpen = value === true;
  Lockr.set(ROUND_STATISTICS_OPEN_STORAGE_KEY, isOpen);
  return isOpen;
}

export function loadAdaptiveProgressOpen() {
  return Lockr.get(ADAPTIVE_PROGRESS_OPEN_STORAGE_KEY, false) === true;
}

export function saveAdaptiveProgressOpen(value) {
  const isOpen = value === true;
  Lockr.set(ADAPTIVE_PROGRESS_OPEN_STORAGE_KEY, isOpen);
  return isOpen;
}
