import { isPrestigeEligible } from "./PrestigeEligibility";

const SOURCES = Object.freeze([
  ["singleNotesScreen", "screen:single-notes", "attempt"],
  ["singleNotesMidi", "midi:single-notes", "attempt"],
  ["melodyRounds", "screen:note-flow", "round"],
  ["melodyRounds", "midi:note-flow", "round"],
  ["chordRounds", "midi:note-flow-chords", "round"],
  ["rhythmBars", "rhythm:taktgefuehl", "round"]
]);

function checkedCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid prestige entry count.");
  }
  return value;
}

export function hasExcludedPrestigeEntries(excludedCounts) {
  if (!excludedCounts || typeof excludedCounts !== "object"
    || Array.isArray(excludedCounts)) {
    throw new TypeError("Invalid excluded prestige counts.");
  }
  return Object.keys(excludedCounts).some(key => checkedCount(excludedCounts[key]) > 0);
}

// Read bounded pages: never collect the full history in memory merely to
// display prestige progress. Physical counts remain the storage overview.
export async function readPrestigeEligibleCounts(database, freeRounds = [],
  options = {}) {
  if (!database || typeof database.readStoredEntryCounts !== "function"
    || typeof database.readAttemptHistoryPage !== "function"
    || typeof database.readNoteFlowRoundsPage !== "function"
    || !Array.isArray(freeRounds)) {
    throw new TypeError("Invalid prestige count source.");
  }
  const shouldContinue = options.shouldContinue || (() => true);
  if (typeof shouldContinue !== "function") {
    throw new TypeError("Invalid prestige count callback.");
  }
  const before = await database.readStoredEntryCounts();
  const physicalCounts = Object.assign({}, before,
    { freeRounds: checkedCount(freeRounds.length) });
  const eligibleCounts = Object.keys(physicalCounts).reduce((counts, key) => {
    counts[key] = 0;
    return counts;
  }, {});
  const observedCounts = Object.assign({}, eligibleCounts);

  for (const [key, scope, kind] of SOURCES) {
    let after = null;
    let seen = 0;
    let done = false;
    while (!done) {
      if (!shouldContinue()) {
        const error = new Error("Prestige counting was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      const page = await (kind === "attempt"
        ? database.readAttemptHistoryPage(scope, after, 4)
        : database.readNoteFlowRoundsPage(scope, after, 4));
      if (!page || !Array.isArray(page.records) || typeof page.done !== "boolean"
        || (!page.done && (!page.records.length || page.nextBlockNumber === after))) {
        throw new Error(`Invalid prestige count page: ${scope}.`);
      }
      seen = checkedCount(seen + page.records.length);
      observedCounts[key] = checkedCount(observedCounts[key] + page.records.length);
      if (observedCounts[key] > physicalCounts[key]) {
        throw new Error(`Prestige count exceeds stored entries: ${scope}.`);
      }
      page.records.forEach(record => {
        if (isPrestigeEligible(record)) eligibleCounts[key] += 1;
      });
      after = page.nextBlockNumber;
      done = page.done;
    }
  }
  freeRounds.forEach(round => {
    if (isPrestigeEligible(round)) eligibleCounts.freeRounds += 1;
  });
  observedCounts.freeRounds = freeRounds.length;
  const after = await database.readStoredEntryCounts();
  for (const key of Object.keys(before)) {
    if (checkedCount(before[key]) !== checkedCount(after[key])) {
      throw new Error("Learning data changed during prestige counting.");
    }
  }
  for (const key of Object.keys(physicalCounts)) {
    if (observedCounts[key] !== checkedCount(physicalCounts[key])) {
      throw new Error(`Prestige count differs from stored entries: ${key}.`);
    }
  }
  const excludedCounts = Object.keys(physicalCounts).reduce((counts, key) => {
    counts[key] = physicalCounts[key] - eligibleCounts[key];
    return counts;
  }, {});
  return { physicalCounts, eligibleCounts, excludedCounts };
}
