import {
  combineAdaptiveProgressSnapshots,
  normalizeAdaptiveHistory
} from "./AdaptiveHistory";
import {
  createAdaptiveProgress,
  createNoteLearningKey,
  normalizeAdaptiveProgress,
  updateAdaptiveRecord
} from "./AdaptiveLearning";
import { createSingleNotesProgressSnapshot } from "./SingleNotesLearningStorage";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";

const INPUTS = [
  {
    scope: "screen:single-notes",
    progress: "adaptiveProgress",
    baselines: "data.adaptiveHistory.baselines",
    evaluations: "data.adaptiveHistory.evaluations"
  },
  {
    scope: "midi:single-notes",
    progress: "adaptiveProgressMidi",
    baselines: "data.adaptiveHistoryMidi.baselines",
    evaluations: "data.adaptiveHistoryMidi.evaluations"
  }
];

async function buildProgress(staging, metadata, input) {
  const saved = metadata.shell.data[input.progress];
  if (saved !== null && saved !== undefined) {
    return normalizeAdaptiveProgress(saved);
  }
  let progress = createAdaptiveProgress();
  let offset = 0;
  let done = false;
  while (!done) {
    const page = await staging.readBatch(input.baselines, offset, 100);
    page.records.forEach(record => {
      const normalized = normalizeAdaptiveHistory({
        version: 1, baselines: [record], evaluations: []
      });
      if (normalized.baselines.length !== 1) {
        throw new Error("The staged single-note baseline is invalid.");
      }
      progress = combineAdaptiveProgressSnapshots(
        progress, normalized.baselines[0].progress
      );
    });
    offset = page.nextIndex;
    done = page.done;
  }
  const expectedBaselines = metadata.counts[input.baselines] || 0;
  if (offset !== expectedBaselines) {
    throw new Error("The staged single-note baselines are incomplete.");
  }
  let cursor = null;
  let evaluationCount = 0;
  done = false;
  while (!done) {
    const page = await staging.readChronologicalBatch(
      input.evaluations, cursor, 250
    );
    page.records.forEach(evaluation => {
      const key = createNoteLearningKey(evaluation.exercise);
      progress.notes[key] = updateAdaptiveRecord(
        progress.notes[key],
        evaluation.correctFirstTry,
        evaluation.mistakeCount,
        evaluation.responseTimeMs
      );
    });
    evaluationCount += page.records.length;
    cursor = page.cursor;
    done = page.done;
  }
  const expectedEvaluations = metadata.counts[input.evaluations] || 0;
  if (evaluationCount !== expectedEvaluations) {
    throw new Error("The staged single-note evaluations are incomplete.");
  }
  return normalizeAdaptiveProgress(progress);
}

// The imported snapshots contain at most one record per distinct note. The
// 100k+ evaluation history is processed in bounded pages and never retained.
export async function installStagedSingleNoteProgress(staging, shadow) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.readBatch !== "function"
    || typeof staging.readChronologicalBatch !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.synchronizeProgressSnapshot !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()) {
    throw new Error("A staged backup and inactive learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.shell
    || !metadata.shell.data || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  const installed = Object.create(null);
  for (const input of INPUTS) {
    const progress = await buildProgress(staging, metadata, input);
    const snapshot = createSingleNotesProgressSnapshot(progress);
    await shadow.database.synchronizeProgressSnapshot(
      input.scope, snapshot, { requireImportGeneration: true }
    );
    const stored = await shadow.database.readProgressSnapshot(input.scope);
    const verified = createSingleNotesProgressSnapshot({
      version: progress.version,
      notes: stored.reduce((notes, record) => {
        if (!record || !record.noteKey || !record.learningRecord
          || Object.prototype.hasOwnProperty.call(notes, record.noteKey)) {
          throw new Error("The copied learning progress is inconsistent.");
        }
        notes[record.noteKey] = record.learningRecord;
        return notes;
      }, {})
    });
    if (verified.signature !== snapshot.signature
      || stored.length !== snapshot.records.length) {
      throw new Error("The copied learning progress differs from the backup.");
    }
    installed[input.scope] = {
      noteCount: stored.length,
      signature: snapshot.signature
    };
  }
  return installed;
}
