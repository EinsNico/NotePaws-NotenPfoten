// Records created by the app before this marker existed remain eligible.
// Import paths explicitly mark newly imported records; prestige selection
// does not yet use this marker.
export function isPrestigeEligible(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("A prestige detail record is required.");
  }
  if (Object.prototype.hasOwnProperty.call(record, "prestigeEligible")
    && typeof record.prestigeEligible !== "boolean") {
    throw new TypeError("Invalid prestige eligibility marker.");
  }
  return record.prestigeEligible !== false;
}

export function markImportedForPrestige(record) {
  isPrestigeEligible(record);
  return Object.assign({}, record, { prestigeEligible: false });
}

export function markImportedRoundHistoryForPrestige(history) {
  if (history === null || history === undefined) return history;
  if (Array.isArray(history)) return history.map(markImportedForPrestige);
  if (!history || typeof history !== "object" || !Array.isArray(history.rounds)) {
    throw new TypeError("Invalid imported round history.");
  }
  return Object.assign({}, history, {
    rounds: history.rounds.map(markImportedForPrestige)
  });
}
