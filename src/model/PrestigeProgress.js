export const PRESTIGE_ENTRY_STEP = 100000;

// Read-only projection. A prestige level is earned only after a verified
// archive commit, never merely because an import crosses the threshold.
// Counts contain remaining detail records across all modes; archived totals
// must not be included. The archive writer/backups will be added separately.
export function createPrestigeProgress(counts, currentPrestige = 0) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)
    || !Number.isSafeInteger(currentPrestige) || currentPrestige < 0) {
    throw new TypeError("Invalid prestige progress source.");
  }
  let detailEntries = 0;
  Object.keys(counts).forEach(key => {
    const count = counts[key];
    if (!Number.isSafeInteger(count) || count < 0
      || !Number.isSafeInteger(detailEntries + count)) {
      throw new Error("Invalid prestige entry count.");
    }
    detailEntries += count;
  });
  const availablePrestiges = Math.floor(detailEntries / PRESTIGE_ENTRY_STEP);
  const remainder = detailEntries % PRESTIGE_ENTRY_STEP;
  if (!Number.isSafeInteger(currentPrestige + availablePrestiges + 1)) {
    throw new Error("Prestige level exceeds the safe counter range.");
  }
  return {
    currentPrestige,
    detailEntries,
    availablePrestiges,
    prestigeAfterArchiving: currentPrestige + availablePrestiges,
    archivableEntries: detailEntries - remainder,
    remainder,
    entriesUntilNextPrestige: PRESTIGE_ENTRY_STEP - remainder,
    nextPrestige: currentPrestige + availablePrestiges + 1,
    step: PRESTIGE_ENTRY_STEP,
    percent: remainder / PRESTIGE_ENTRY_STEP * 100
  };
}
