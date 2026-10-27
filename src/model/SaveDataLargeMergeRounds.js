import { sameRound } from "./SaveDataLargeMergePreview";

const INPUTS = [
  ["data.noteFlowRounds.screen", "screen:note-flow"],
  ["data.noteFlowRounds.midi", "midi:note-flow"],
  ["data.noteFlowRounds.chordMidi", "midi:note-flow-chords"],
  ["data.rhythmSenseBars", "rhythm:taktgefuehl"]
];

function sourceCount(metadata, section) {
  const count = metadata.counts[section] === undefined
    ? 0 : metadata.counts[section];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid staged round count: ${section}.`);
  }
  return count;
}

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The round merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

// Called once on a newly staged backup after the single-note match scan.
// Successful note markers remain in the same temporary store. A conflict or
// cancellation clears all markers so no partial index can be used for writing.
export async function indexStagedRoundMatches(
  staging, activeDatabase, shouldContinue = () => true
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.findRecordsByIdentities !== "function"
    || typeof staging.markMergeMatches !== "function"
    || typeof staging.resetMergeMatches !== "function"
    || !activeDatabase
    || typeof activeDatabase.readNoteFlowRoundsPage !== "function"
    || typeof shouldContinue !== "function") {
    throw new TypeError("A staged backup and active learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  INPUTS.forEach(([section]) => sourceCount(metadata, section));
  const sections = {};
  try {
    for (const [section, scope] of INPUTS) {
      const counts = { current: 0, imported: sourceCount(metadata, section),
        new: 0, duplicates: 0 };
      let after = null;
      let done = false;
      while (!done) {
        cancelled(shouldContinue);
        const page = await activeDatabase.readNoteFlowRoundsPage(scope, after, 1);
        if (!page || !Array.isArray(page.records)
          || page.records.length > 100 || typeof page.done !== "boolean"
          || (!page.done && page.records.length === 0)
          || (page.records.length > 0 && (
            !Number.isSafeInteger(page.nextBlockNumber)
            || page.nextBlockNumber < 0
            || (after !== null && page.nextBlockNumber <= after)
          ))) {
          throw new Error(`Invalid active round page: ${scope}.`);
        }
        const identities = page.records.map(record => {
          if (!record || typeof record.id !== "string" || !record.id) {
            throw new Error(`Invalid active round ID: ${scope}.`);
          }
          return record.id;
        });
        const matches = await staging.findRecordsByIdentities(section, identities);
        cancelled(shouldContinue);
        if (!Array.isArray(matches) || matches.length !== identities.length) {
          throw new Error("The staged round lookup is incomplete.");
        }
        const duplicates = [];
        page.records.forEach((record, index) => {
          const match = matches[index];
          if (!match) return;
          if (match.section !== section || !sameRound(record, match.record)) {
            throw new Error(`Conflicting round ID: ${record.id}.`);
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
        throw new Error(`Duplicate round count exceeds the backup: ${scope}.`);
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
