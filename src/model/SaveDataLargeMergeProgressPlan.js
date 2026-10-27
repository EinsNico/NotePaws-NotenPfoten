import { normalizeAdaptiveEvaluation } from "./AdaptiveHistory";
import { normalizeAdaptiveProgress } from "./AdaptiveLearning";
import {
  createProgressFromSnapshotRecords,
  createSingleNotesProgressSnapshot
} from "./SingleNotesLearningStorage";

const INPUTS = [
  {
    section: "data.adaptiveHistory.evaluations",
    baselineSection: "data.adaptiveHistory.baselines",
    progressKey: "adaptiveProgress",
    scope: "screen:single-notes"
  },
  {
    section: "data.adaptiveHistoryMidi.evaluations",
    baselineSection: "data.adaptiveHistoryMidi.baselines",
    progressKey: "adaptiveProgressMidi",
    scope: "midi:single-notes"
  }
];

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The learning-progress merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

function expectedCount(metadata, section) {
  const count = metadata.counts[section] === undefined
    ? 0 : metadata.counts[section];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid staged learning count: ${section}.`);
  }
  return count;
}

function countByNote(records, scope) {
  if (!Array.isArray(records) || records.length > 10000) {
    throw new Error(`Invalid current learning progress: ${scope}.`);
  }
  const notes = Object.create(null);
  records.forEach(record => {
    if (!record || typeof record.noteKey !== "string" || !record.noteKey
      || !record.learningRecord || typeof record.learningRecord !== "object"
      || Object.prototype.hasOwnProperty.call(notes, record.noteKey)) {
      throw new Error(`Inconsistent current learning progress: ${scope}.`);
    }
    const normalized = normalizeAdaptiveProgress({
      notes: { [record.noteKey]: record.learningRecord }
    });
    const entries = Object.entries(normalized.notes);
    if (entries.length !== 1
      || Object.prototype.hasOwnProperty.call(notes, entries[0][0])) {
      throw new Error(`Inconsistent current learning progress: ${scope}.`);
    }
    notes[entries[0][0]] = entries[0][1].attempts;
  });
  return notes;
}

// Read-only preflight. A saved progress snapshot already includes its own
// evaluations, so adding two snapshots would double-count shared attempts.
// Where both sides have older baseline progress for the same note, the exact
// chronological state cannot be reconstructed and the merge must stop.
export async function planMergedSingleNoteProgress(
  staging, activeDatabase, indexed, shouldContinue = () => true
) {
  if (!staging || typeof staging.readMetadata !== "function"
    || typeof staging.readChronologicalBatch !== "function"
    || typeof staging.hasMergeMatches !== "function"
    || !activeDatabase || typeof activeDatabase.readProgressSnapshot !== "function"
    || !indexed || !indexed.sections || typeof shouldContinue !== "function") {
    throw new TypeError("An indexed backup and active learning database are required.");
  }
  const metadata = await staging.readMetadata();
  if (!metadata || metadata.key !== "ready" || !metadata.counts
    || !metadata.shell || !metadata.shell.data) {
    throw new Error("The staged backup is not ready.");
  }
  const plans = {};
  for (const input of INPUTS) {
    cancelled(shouldContinue);
    const importedCount = expectedCount(metadata, input.section);
    const baselineCount = expectedCount(metadata, input.baselineSection);
    const expected = indexed.sections[input.section];
    if (!expected || expected.imported !== importedCount
      || !Number.isSafeInteger(expected.new) || expected.new < 0
      || !Number.isSafeInteger(expected.duplicates)
      || expected.duplicates < 0
      || expected.new + expected.duplicates !== importedCount) {
      throw new Error(`The answer-match index differs: ${input.scope}.`);
    }
    const activeRecords = await activeDatabase.readProgressSnapshot(input.scope);
    const activeNotes = countByNote(activeRecords, input.scope);
    const activeProgress = createProgressFromSnapshotRecords(activeRecords);
    const currentSignature = createSingleNotesProgressSnapshot(
      createProgressFromSnapshotRecords(activeRecords)
    ).signature;
    const rawProgress = metadata.shell.data[input.progressKey];
    if (rawProgress !== null && rawProgress !== undefined
      && (typeof rawProgress !== "object" || !rawProgress.notes
        || typeof rawProgress.notes !== "object")) {
      throw new Error(`Invalid imported learning progress: ${input.scope}.`);
    }
    const importedNotes = rawProgress === null || rawProgress === undefined
      ? null : normalizeAdaptiveProgress(rawProgress).notes;
    if (!importedNotes && baselineCount > 0) {
      throw new Error(`Legacy learning baselines need separate reconciliation: ${input.scope}.`);
    }
    const evaluated = Object.create(null);
    const additions = Object.create(null);
    const duplicates = Object.create(null);
    let cursor = null;
    let done = false;
    let total = 0;
    let newCount = 0;
    while (!done) {
      cancelled(shouldContinue);
      const page = await staging.readChronologicalBatch(
        input.section, cursor, 250
      );
      if (!page || !Array.isArray(page.records)
        || page.records.length > 250 || typeof page.done !== "boolean"
        || (!page.done && !page.records.length)) {
        throw new Error(`Invalid staged answer page: ${input.scope}.`);
      }
      const matches = await staging.hasMergeMatches(input.section,
        page.records.map(record => record.id));
      cancelled(shouldContinue);
      if (!Array.isArray(matches) || matches.length !== page.records.length) {
        throw new Error(`Incomplete answer-match index: ${input.scope}.`);
      }
      page.records.forEach((record, index) => {
        const evaluation = normalizeAdaptiveEvaluation(record);
        if (!evaluation) {
          throw new Error(`Invalid staged evaluation: ${input.scope}.`);
        }
        evaluated[evaluation.noteKey] = (evaluated[evaluation.noteKey] || 0) + 1;
        if (!matches[index]) {
          additions[evaluation.noteKey] = (additions[evaluation.noteKey] || 0) + 1;
          newCount += 1;
        } else {
          duplicates[evaluation.noteKey] =
            (duplicates[evaluation.noteKey] || 0) + 1;
        }
      });
      total += page.records.length;
      cursor = page.cursor;
      done = page.done;
    }
    if (total !== importedCount || newCount !== expected.new) {
      throw new Error(`The staged learning answers differ: ${input.scope}.`);
    }
    const allKeys = new Set(Object.keys(evaluated).concat(
      Object.keys(importedNotes || {})
    ));
    let importedBaselineAttempts = 0;
    allKeys.forEach(key => {
      const fromEvaluations = evaluated[key] || 0;
      const fromSnapshot = importedNotes
        ? importedNotes[key] && importedNotes[key].attempts || 0
        : fromEvaluations;
      if (fromSnapshot < fromEvaluations) {
        throw new Error(`Imported progress omits answers for ${key}.`);
      }
      const baseline = fromSnapshot - fromEvaluations;
      importedBaselineAttempts += baseline;
      if ((duplicates[key] || 0) > 0 && (activeNotes[key] || 0) === 0) {
        throw new Error(`Duplicate answers lack active progress for ${key}.`);
      }
      // Prestige retains cumulative progress after deleting detailed answers.
      // Reimporting the same snapshot is safe when all retained answers for
      // this note are duplicates. Never add its historical baseline twice.
      const identicalSnapshot = importedNotes && activeProgress.notes[key]
        && !(additions[key] || 0)
        && createSingleNotesProgressSnapshot({ notes: {
          [key]: activeProgress.notes[key]
        } }).signature === createSingleNotesProgressSnapshot({ notes: {
          [key]: importedNotes[key]
        } }).signature;
      if (baseline > 0 && (activeNotes[key] || 0) > 0 && !identicalSnapshot) {
        throw new Error(`Overlapping learning baseline for ${key}.`);
      }
    });
    plans[input.scope] = {
      currentNotes: Object.keys(activeNotes).length,
      currentSignature,
      importedNotes: allKeys.size,
      newAnswers: newCount,
      duplicateAnswers: expected.duplicates,
      importedBaselineAttempts,
      noteAdditions: additions
    };
  }
  return plans;
}
