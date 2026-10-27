import { PRESTIGE_ENTRY_SCOPES, normalizePrestigeArchive } from "./PrestigeArchive";
import { isPrestigeEligible } from "./PrestigeEligibility";

const SOURCES = Object.freeze([
  { scope: "singleNotesScreen", databaseScope: "screen:single-notes", kind: "attempt", batch: 250 },
  { scope: "singleNotesMidi", databaseScope: "midi:single-notes", kind: "attempt", batch: 250 },
  { scope: "melodyRounds", databaseScope: "screen:note-flow", kind: "round", batch: 100 },
  { scope: "melodyRounds", databaseScope: "midi:note-flow", kind: "round", batch: 100 },
  { scope: "chordRounds", databaseScope: "midi:note-flow-chords", kind: "round", batch: 100 },
  { scope: "rhythmBars", databaseScope: "rhythm:taktgefuehl", kind: "round", batch: 100 }
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("Prestige shadow preparation was cancelled.");
  error.name = "AbortError";
  throw error;
}

// Free-training rounds live in local storage rather than the shadow DB.
// Keep imported rounds even when they precede the selected eligible rounds.
export function retainPrestigeFreeRounds(rounds, selected) {
  check(Array.isArray(rounds) && Number.isSafeInteger(selected) && selected >= 0,
    "Invalid planned free-round prestige selection.");
  let remainingSkip = selected;
  const retained = [];
  for (const round of rounds) {
    if (remainingSkip > 0 && isPrestigeEligible(round)) remainingSkip -= 1;
    else retained.push(round);
  }
  check(remainingSkip === 0, "Prestige preview exceeds eligible free rounds.");
  return retained;
}

// Copy only surviving detail records into an inactive generation. Per-scope
// chronology is preserved; append methods repack records in bounded batches.
// The caller must later restore the complete learning-progress snapshots,
// verify them, and commit atomically. This helper cannot activate or delete.
export async function copyPrestigeRemainingToShadow(
  preview, active, shadow, shouldContinue = () => true
) {
  check(preview && preview.segment && preview.currentCounts && preview.sourceCounts
    && active && shadow && shadow.database
    && typeof active.readStoredEntryCounts === "function"
    && typeof shadow.database.readStoredEntryCounts === "function"
    && typeof shadow.database.appendImportedAttemptBatch === "function"
    && typeof shadow.database.appendImportedNoteFlowBatch === "function",
  "A verified prestige preview and inactive database are required.");
  normalizePrestigeArchive({ version: 1, segments: [preview.segment] });
  const sourceGroups = {
    singleNotesScreen: ["screen:single-notes"],
    singleNotesMidi: ["midi:single-notes"],
    freeRounds: ["freeRounds"],
    melodyRounds: ["screen:note-flow", "midi:note-flow"],
    chordRounds: ["midi:note-flow-chords"],
    rhythmBars: ["rhythm:taktgefuehl"]
  };
  PRESTIGE_ENTRY_SCOPES.forEach(scope => {
    const selected = sourceGroups[scope].reduce((sum, key) => {
      const count = preview.sourceCounts[key];
      check(Number.isSafeInteger(count) && count >= 0,
        `Invalid planned prestige count: ${key}.`);
      return sum + count;
    }, 0);
    check(selected === preview.segment.entryCounts[scope],
      `Prestige source counts differ: ${scope}.`);
  });
  const current = await active.readStoredEntryCounts();
  PRESTIGE_ENTRY_SCOPES.filter(scope => scope !== "freeRounds").forEach(scope => {
    check(current[scope] === preview.currentCounts[scope],
      `Active prestige data changed: ${scope}.`);
  });
  const skipped = {};
  const kept = {};
  const scanned = {};
  for (const source of SOURCES) {
    let after = null;
    let done = false;
    let remainingSkip = preview.sourceCounts[source.databaseScope];
    check(Number.isSafeInteger(remainingSkip) && remainingSkip >= 0,
      `Invalid planned prestige count: ${source.databaseScope}.`);
    let writerStart = 0;
    let processed = 0;
    let pending = [];
    while (!done) {
      cancelled(shouldContinue);
      const page = source.kind === "attempt"
        ? await active.readAttemptHistoryPage(source.databaseScope, after, 1)
        : await active.readNoteFlowRoundsPage(source.databaseScope, after, 1);
      check(page && Array.isArray(page.records)
        && page.records.length <= source.batch
        && typeof page.done === "boolean"
        && (page.done || page.records.length > 0)
        && (page.records.length === 0 || Number.isSafeInteger(page.nextBlockNumber))
        && (after === null || page.records.length === 0
          || page.nextBlockNumber > after),
      `Invalid active prestige page: ${source.databaseScope}.`);
      for (const record of page.records) {
        if (remainingSkip > 0 && isPrestigeEligible(record)) remainingSkip -= 1;
        else {
          pending.push(record);
          if (pending.length === source.batch) {
            const append = source.kind === "attempt"
              ? shadow.database.appendImportedAttemptBatch
              : shadow.database.appendImportedNoteFlowBatch;
            await append.call(shadow.database, source.databaseScope, pending, writerStart);
            writerStart += pending.length;
            pending = [];
          }
        }
        processed += 1;
      }
      after = page.nextBlockNumber;
      done = page.done;
    }
    if (pending.length) {
      const append = source.kind === "attempt"
        ? shadow.database.appendImportedAttemptBatch
        : shadow.database.appendImportedNoteFlowBatch;
      await append.call(shadow.database, source.databaseScope, pending, writerStart);
      writerStart += pending.length;
    }
    check(remainingSkip === 0, `Prestige preview exceeds ${source.databaseScope}.`);
    skipped[source.databaseScope] = preview.sourceCounts[source.databaseScope];
    kept[source.databaseScope] = writerStart;
    scanned[source.databaseScope] = processed;
    check(processed === skipped[source.databaseScope] + kept[source.databaseScope],
      `Prestige copy count differs: ${source.databaseScope}.`);
  }
  cancelled(shouldContinue);
  const shadowCounts = await shadow.database.readStoredEntryCounts();
  PRESTIGE_ENTRY_SCOPES.filter(scope => scope !== "freeRounds").forEach(scope => {
    const scannedCount = sourceGroups[scope]
      .reduce((sum, key) => sum + scanned[key], 0);
    const expectedKept = current[scope] - preview.segment.entryCounts[scope];
    check(scannedCount === current[scope],
      `Prestige source scan differs from active count: ${scope}.`);
    check(shadowCounts[scope] === expectedKept,
      `Prestige inactive database count differs: ${scope}.`);
  });
  check(Number.isSafeInteger(preview.currentCounts.freeRounds)
    && preview.currentCounts.freeRounds >= preview.sourceCounts.freeRounds,
  "Invalid remaining free-round count.");
  const after = await active.readStoredEntryCounts();
  PRESTIGE_ENTRY_SCOPES.filter(scope => scope !== "freeRounds").forEach(scope => {
    check(after[scope] === current[scope], `Active prestige data changed: ${scope}.`);
  });
  return { skipped, kept,
    localFreeRoundsToKeep: preview.currentCounts.freeRounds
      - preview.sourceCounts.freeRounds,
    inactiveGeneration: shadow.name };
}
