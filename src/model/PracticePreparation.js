export const DEFAULT_PREPARATION_SECONDS = 3;
export const PREPARATION_SECONDS = [0, 3, 5];

export function normalizePreparationSeconds(value) {
  const seconds = typeof value === "number"
    ? value : typeof value === "string" && /^(0|3|5)$/.test(value)
      ? Number(value) : NaN;
  return PREPARATION_SECONDS.indexOf(seconds) !== -1
    ? seconds : DEFAULT_PREPARATION_SECONDS;
}
