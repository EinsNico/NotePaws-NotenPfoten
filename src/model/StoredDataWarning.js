export const STORED_DATA_WARNING_THRESHOLD = 400000;
export const STORED_DATA_WARNING_DISMISSED_KEY = "noten-pfoten-large-data-warning-dismissed-v1";

export function shouldShowStoredDataWarning(counts, storage) {
  try {
    if (storage.getItem(STORED_DATA_WARNING_DISMISSED_KEY) === "true") return false;
  } catch (ignored) { /* A failed preference read must not hide the warning. */ }
  const values = Object.keys(counts).map(key => counts[key]);
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid stored entry count.");
  }
  return values.reduce((sum, value) => sum + value, 0) >= STORED_DATA_WARNING_THRESHOLD;
}

export function dismissStoredDataWarning(storage) {
  try {
    storage.setItem(STORED_DATA_WARNING_DISMISSED_KEY, "true");
    return true;
  } catch (ignored) { return false; }
}
