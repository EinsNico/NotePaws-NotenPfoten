import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { canonicalize as canonical } from "./CanonicalJson";
import { markImportedForPrestige } from "./PrestigeEligibility";

const INPUTS = [
  ["data.noteFlowRounds.screen", "screen:note-flow"],
  ["data.noteFlowRounds.midi", "midi:note-flow"],
  ["data.noteFlowRounds.chordMidi", "midi:note-flow-chords"],
  ["data.rhythmSenseBars", "rhythm:taktgefuehl"]
];

function cancelled(shouldContinue) {
  if (shouldContinue()) return;
  const error = new Error("The round merge was cancelled.");
  error.name = "AbortError";
  throw error;
}

function timestamp(record, scope) {
  if (!record || typeof record.id !== "string" || !record.id) {
    throw new Error(`Invalid merged round ID: ${scope}.`);
  }
  const value = Date.parse(record.completedAt);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid merged round timestamp: ${scope}.`);
  }
  return value;
}

function addFingerprint(current, record) {
  const value = JSON.stringify(canonical(record));
  let hash = current.hash;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return { count: current.count + 1, hash };
}

function activeIterator(database, scope, shouldContinue) {
  let after = null;
  let page = [];
  let index = 0;
  let done = false;
  let previousTime = -1;
  return async () => {
    while (index === page.length) {
      if (done) return null;
      cancelled(shouldContinue);
      const result = await database.readNoteFlowRoundsPage(scope, after, 1);
      if (!result || !Array.isArray(result.records)
        || result.records.length > 100 || typeof result.done !== "boolean"
        || (!result.done && !result.records.length)
        || (result.records.length && (!Number.isSafeInteger(result.nextBlockNumber)
          || result.nextBlockNumber < 0
          || (after !== null && result.nextBlockNumber <= after)))) {
        throw new Error(`Invalid active round page: ${scope}.`);
      }
      page = result.records;
      index = 0;
      done = result.done;
      after = result.nextBlockNumber;
    }
    const record = page[index++];
    const time = timestamp(record, scope);
    if (time < previousTime) {
      throw new Error(`Active rounds are not chronological: ${scope}.`);
    }
    previousTime = time;
    return { record, time };
  };
}

function stagedIterator(staging, section, shouldContinue) {
  let start = 0;
  let page = [];
  let matches = [];
  let index = 0;
  let done = false;
  let previousTime = -1;
  return async () => {
    while (true) {
      while (index === page.length) {
        if (done) return null;
        cancelled(shouldContinue);
        const result = await staging.readBatch(section, start, 100);
        if (!result || !Array.isArray(result.records)
          || result.records.length > 100
          || !Number.isSafeInteger(result.nextIndex)
          || result.nextIndex !== start + result.records.length
          || !Number.isSafeInteger(result.total)
          || result.total < result.nextIndex
          || typeof result.done !== "boolean"
          || result.done !== (result.nextIndex === result.total)
          || (!result.done && !result.records.length)) {
          throw new Error(`Invalid staged round page: ${section}.`);
        }
        page = result.records;
        index = 0;
        start = result.nextIndex;
        done = result.done;
        matches = await staging.hasMergeMatches(section,
          page.map(record => record.id));
        cancelled(shouldContinue);
        if (!Array.isArray(matches) || matches.length !== page.length) {
          throw new Error(`Incomplete round-match index: ${section}.`);
        }
      }
      const record = page[index];
      const duplicate = matches[index++];
      const time = timestamp(record, section);
      if (time < previousTime) {
        throw new Error(`Staged rounds are not chronological: ${section}.`);
      }
      previousTime = time;
      if (!duplicate) return { record, time };
    }
  };
}

async function verifyShadowRounds(database, scope, expected, shouldContinue) {
  let after = null;
  let done = false;
  let fingerprint = { count: 0, hash: 2166136261 };
  while (!done) {
    cancelled(shouldContinue);
    const page = await database.readNoteFlowRoundsPage(scope, after, 1);
    if (!page || !Array.isArray(page.records) || page.records.length > 100
      || typeof page.done !== "boolean"
      || (!page.done && !page.records.length)
      || (page.records.length && (!Number.isSafeInteger(page.nextBlockNumber)
        || page.nextBlockNumber < 0
        || (after !== null && page.nextBlockNumber <= after)))) {
      throw new Error(`Invalid stored round page: ${scope}.`);
    }
    page.records.forEach(record => {
      fingerprint = addFingerprint(fingerprint, record);
    });
    after = page.nextBlockNumber;
    done = page.done;
  }
  const statistics = await database.readNoteFlowStatistics(scope);
  if (fingerprint.count !== expected.count || fingerprint.hash !== expected.hash
    || !statistics || statistics.roundCount !== expected.count) {
    throw new Error(`Stored merged rounds differ: ${scope}.`);
  }
}

// A bounded two-stream chronological merge into a fresh inactive generation.
// No settings or active generation are changed here.
export async function copyMergedRoundsToShadow(
  staging, activeDatabase, shadow, indexed, shouldContinue = () => true
) {
  if (!staging || typeof staging.readBatch !== "function"
    || typeof staging.hasMergeMatches !== "function"
    || !activeDatabase || typeof activeDatabase.readNoteFlowRoundsPage !== "function"
    || !shadow || !shadow.database
    || typeof shadow.database.appendImportedNoteFlowBatch !== "function"
    || typeof shadow.database.readNoteFlowRoundsPage !== "function"
    || typeof shadow.database.readNoteFlowStatistics !== "function"
    || !/^noten-pfoten-learning-import-[a-z0-9-]+$/.test(shadow.name)
    || shadow.name === activeLearningDatabaseName()
    || !indexed || !indexed.sections || typeof shouldContinue !== "function") {
    throw new TypeError("An indexed backup and inactive learning database are required.");
  }
  const summaries = {};
  for (const [section, scope] of INPUTS) {
    const expected = indexed.sections[section];
    if (!expected || !["current", "imported", "new", "duplicates"].every(
      key => Number.isSafeInteger(expected[key]) && expected[key] >= 0
    ) || expected.imported !== expected.new + expected.duplicates) {
      throw new Error(`Invalid round merge plan: ${section}.`);
    }
    const nextActive = activeIterator(activeDatabase, scope, shouldContinue);
    const nextStaged = stagedIterator(staging, section, shouldContinue);
    let active = await nextActive();
    let imported = await nextStaged();
    let currentCount = 0;
    let newCount = 0;
    let fingerprint = { count: 0, hash: 2166136261 };
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      cancelled(shouldContinue);
      const start = fingerprint.count - batch.length;
      const result = await shadow.database.appendImportedNoteFlowBatch(
        scope, batch, start
      );
      if (!result || result.total !== fingerprint.count) {
        throw new Error(`Merged round batch was not verified: ${scope}.`);
      }
      batch = [];
    };
    while (active || imported) {
      cancelled(shouldContinue);
      const takeActive = active && (!imported || active.time <= imported.time);
      const chosen = takeActive ? active
        : Object.assign({}, imported, {
          record: markImportedForPrestige(imported.record)
        });
      batch.push(chosen.record);
      fingerprint = addFingerprint(fingerprint, chosen.record);
      if (takeActive) {
        currentCount += 1;
        active = await nextActive();
      } else {
        newCount += 1;
        imported = await nextStaged();
      }
      if (batch.length === 100) await flush();
    }
    await flush();
    if (currentCount !== expected.current || newCount !== expected.new
      || fingerprint.count !== expected.current + expected.new) {
      throw new Error(`Merged round count differs: ${scope}.`);
    }
    await verifyShadowRounds(shadow.database, scope, fingerprint, shouldContinue);
    summaries[scope] = { current: currentCount, added: newCount,
      total: fingerprint.count };
  }
  return summaries;
}
