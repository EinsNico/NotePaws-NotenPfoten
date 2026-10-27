import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { markImportedForPrestige } from "./PrestigeEligibility";

const SECTIONS = [
  ["data.noteFlowRounds.screen", "screen:note-flow"],
  ["data.noteFlowRounds.midi", "midi:note-flow"],
  ["data.noteFlowRounds.chordMidi", "midi:note-flow-chords"],
  ["data.rhythmSenseBars", "rhythm:taktgefuehl"]
];

// The caller owns the inactive shadow database. This function never switches
// the active generation, and no list larger than 100 rounds is materialized.
export async function copyStagedNoteFlowToShadow(staging, shadow) {
  if (!staging || typeof staging.readBatch !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.appendImportedNoteFlowBatch !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()) {
    throw new Error("A separate inactive learning database is required.");
  }
  const copied = Object.create(null);
  for (const [section, scope] of SECTIONS) {
    let start = 0;
    let done = false;
    while (!done) {
      const batch = await staging.readBatch(section, start, 100);
      if (batch.nextIndex < start || batch.nextIndex > batch.total
        || (!batch.done && batch.records.length === 0)) {
        throw new Error("The staged backup has an invalid batch boundary.");
      }
      if (batch.records.length) {
        const written = await shadow.database.appendImportedNoteFlowBatch(
          scope, batch.records.map(markImportedForPrestige), start
        );
        if (!written || written.total !== batch.nextIndex) {
          throw new Error("The shadow database did not verify a copied batch.");
        }
      }
      start = batch.nextIndex;
      done = batch.done;
    }
    copied[scope] = start;
  }
  return copied;
}
