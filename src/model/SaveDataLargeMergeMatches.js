import { sameAttempt } from "./SaveDataLargeMergePreview";

const INPUTS = [
  ["data.adaptiveHistory.evaluations", "screen:single-notes"],
  ["data.adaptiveHistoryMidi.evaluations", "midi:single-notes"]
];

function sourceCount(metadata, section) {
  const count = metadata.counts[section] === undefined
    ? 0 : metadata.counts[section];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid staged answer count: ${section}.`);
  }
  return count;
}

// Materialize only exact-overlap IDs in the temporary import database. The
// source and active histories stay untouched; conflicting IDs abort the plan.
export async function indexStagedSingleNoteMatches(
  staging, activeDatabase, shouldContinue = () => true
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.resetMergeMatches !== "function"
    || typeof staging.markMergeMatches !== "function"
    || typeof staging.findRecordsByIdentities !== "function"
    || !activeDatabase
    || typeof activeDatabase.readAttemptHistoryPage !== "function"
    || typeof shouldContinue !== "function") {
    throw new TypeError("A staged backup and active learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  INPUTS.forEach(([section]) => sourceCount(metadata, section));
  await staging.resetMergeMatches();
  const sections = {};
  try {
    for (const [section, scope] of INPUTS) {
      const counts = {
        current: 0, imported: sourceCount(metadata, section),
        new: 0, duplicates: 0
      };
      let after = null;
      let done = false;
      while (!done) {
        if (!shouldContinue()) {
          const error = new Error("The merge was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        const page = await activeDatabase.readAttemptHistoryPage(scope, after, 1);
        if (!page || !Array.isArray(page.records)
          || page.records.length > 250 || typeof page.done !== "boolean"
          || (!page.done && page.records.length === 0)
          || (page.records.length > 0 && (!Number.isSafeInteger(page.nextBlockNumber)
            || page.nextBlockNumber < 0
            || (after !== null && page.nextBlockNumber <= after)))) {
          throw new Error(`Invalid active answer page: ${scope}.`);
        }
        const identities = page.records.map(record => {
          if (!record || typeof record.id !== "string" || !record.id) {
            throw new Error(`Invalid active answer ID: ${scope}.`);
          }
          return record.id;
        });
        const matches = await staging.findRecordsByIdentities(section, identities);
        if (!shouldContinue()) {
          const error = new Error("The merge was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        if (!Array.isArray(matches) || matches.length !== identities.length) {
          throw new Error("The staged answer lookup is incomplete.");
        }
        const duplicates = [];
        page.records.forEach((record, index) => {
          const match = matches[index];
          if (!match) return;
          if (match.section !== section || !sameAttempt(record, match.record)) {
            throw new Error(`Conflicting answer ID: ${record.id}.`);
          }
          duplicates.push(record.id);
        });
        await staging.markMergeMatches(section, duplicates);
        counts.current += page.records.length;
        counts.duplicates += duplicates.length;
        after = page.nextBlockNumber;
        done = page.done;
      }
      if (counts.duplicates > counts.imported) {
        throw new Error(`Duplicate answer count exceeds the backup: ${scope}.`);
      }
      counts.new = counts.imported - counts.duplicates;
      sections[section] = counts;
    }
    return { sections };
  } catch (error) {
    try { await staging.resetMergeMatches(); } catch (ignored) { }
    throw error;
  }
}
