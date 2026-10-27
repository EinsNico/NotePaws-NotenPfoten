import { normalizeAdaptiveEvaluation } from "./AdaptiveHistory";
import { canonicalize as canonical } from "./CanonicalJson";

const SECTIONS = [
  { section: "data.noteFlowRounds.screen", scope: "screen:note-flow", kind: "round" },
  { section: "data.noteFlowRounds.midi", scope: "midi:note-flow", kind: "round" },
  { section: "data.noteFlowRounds.chordMidi", scope: "midi:note-flow-chords", kind: "round" },
  { section: "data.rhythmSenseBars", scope: "rhythm:taktgefuehl", kind: "round" },
  { section: "data.adaptiveHistory.evaluations", scope: "screen:single-notes", kind: "attempt" },
  { section: "data.adaptiveHistoryMidi.evaluations", scope: "midi:single-notes", kind: "attempt" }
];

export function sameAttempt(current, imported) {
  const evaluation = normalizeAdaptiveEvaluation(imported);
  if (!evaluation) throw new Error("An imported answer is invalid.");
  return current.id === evaluation.id
    && current.noteKey === evaluation.noteKey
    && current.staff === evaluation.exercise.staff
    && current.completedAt === evaluation.completedAt
    && current.correctFirstTry === evaluation.correctFirstTry
    && current.mistakeCount === evaluation.mistakeCount
    && current.responseTimeMs === evaluation.responseTimeMs;
}

export function sameRound(current, imported) {
  const currentContent = Object.assign({}, current);
  const importedContent = Object.assign({}, imported);
  // Import provenance does not change a round's result. Keep the existing
  // record and its eligibility when the original backup is imported again.
  delete currentContent.prestigeEligible;
  delete importedContent.prestigeEligible;
  return JSON.stringify(canonical(currentContent))
    === JSON.stringify(canonical(importedContent));
}

function sameRecord(kind, current, imported) {
  return kind === "attempt"
    ? sameAttempt(current, imported)
    : sameRound(current, imported);
}

function checkedSourceCount(metadata, section) {
  const count = metadata.counts[section] === undefined
    ? 0 : metadata.counts[section];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The staged backup count is invalid: ${section}.`);
  }
  return count;
}

// A read-only projection for the six IndexedDB-backed histories. Settings,
// legacy normal rounds and progress reconciliation require separate plans.
// One physical block (at most 250 answers or 100 rounds) is held per page.
export async function previewStagedIndexedDbMerge(staging, activeDatabase,
  shouldContinue = () => true) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.findRecordsByIdentities !== "function"
    || !activeDatabase
    || typeof activeDatabase.readAttemptHistoryPage !== "function"
    || typeof activeDatabase.readNoteFlowRoundsPage !== "function"
    || typeof shouldContinue !== "function") {
    throw new TypeError("A staged backup and active learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  const sections = {};
  const total = { current: 0, imported: 0, new: 0,
    duplicates: 0, conflicts: 0 };
  for (const item of SECTIONS) {
    const counts = { current: 0,
      imported: checkedSourceCount(metadata, item.section),
      new: 0, duplicates: 0, conflicts: 0 };
    let after = null;
    let done = false;
    while (!done) {
      if (!shouldContinue()) {
        const error = new Error("The merge preview was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      const page = item.kind === "attempt"
        ? await activeDatabase.readAttemptHistoryPage(item.scope, after, 1)
        : await activeDatabase.readNoteFlowRoundsPage(item.scope, after, 1);
      if (!page || !Array.isArray(page.records) || page.records.length > 250
        || typeof page.done !== "boolean"
        || (page.records.length > 0 && (!Number.isSafeInteger(page.nextBlockNumber)
          || page.nextBlockNumber < 0
          || (after !== null && page.nextBlockNumber <= after)))
        || (!page.done && page.records.length === 0)) {
        throw new Error(`The active learning history page is invalid: ${item.scope}.`);
      }
      const identities = page.records.map(record => {
        if (!record || typeof record.id !== "string" || !record.id) {
          throw new Error(`The active learning history has an invalid ID: ${item.scope}.`);
        }
        return record.id;
      });
      const matches = await staging.findRecordsByIdentities(
        item.section, identities
      );
      if (!shouldContinue()) {
        const error = new Error("The merge preview was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      if (!Array.isArray(matches) || matches.length !== identities.length) {
        throw new Error("The staged identity lookup is incomplete.");
      }
      page.records.forEach((record, index) => {
        const match = matches[index];
        counts.current += 1;
        if (!match) return;
        if (match.section === item.section
          && sameRecord(item.kind, record, match.record)) {
          counts.duplicates += 1;
        } else {
          counts.conflicts += 1;
        }
      });
      after = page.nextBlockNumber;
      done = page.done;
    }
    if (counts.duplicates + counts.conflicts > counts.imported) {
      throw new Error(`The active history contains duplicate imported IDs: ${item.scope}.`);
    }
    counts.new = counts.imported - counts.duplicates - counts.conflicts;
    sections[item.section] = counts;
    Object.keys(total).forEach(key => { total[key] += counts[key]; });
  }
  return { sections, total };
}
