import {
  openLearningDatabasePrototype,
  deleteLearningDatabasePrototype
} from "../src/model/LearningDatabasePrototype.js";

const status = document.getElementById("status");
const scope = "screen:single-notes";
const results = [];

function roundMilliseconds(value) {
  return Math.round(value * 10) / 10;
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function render(message) {
  status.textContent = `${message}\n\n${JSON.stringify({
    finishedScenarios: results.length,
    results
  }, null, 2)}`;
}

async function storageEstimate() {
  if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
    return null;
  }
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage,
    quota: estimate.quota
  };
}

async function runScenario(configuration) {
  const databaseName = `noten-pfoten-benchmark-${Date.now()}-${results.length}`;
  const options = {
    name: databaseName,
    indexedDB,
    IDBKeyRange,
    blockPolicy: {
      maxAttempts: configuration.blockSize,
      maxBytes: configuration.blockBytes
    }
  };
  render(`Läuft: ${configuration.label}`);
  await deleteLearningDatabasePrototype(options);
  const beforeEstimate = await storageEstimate();

  let startedAt = performance.now();
  let database = await openLearningDatabasePrototype(options);
  const openMs = performance.now() - startedAt;

  startedAt = performance.now();
  const seeded = await database.seedSyntheticData({
    scope,
    attemptCount: configuration.attemptCount,
    roundLength: configuration.roundLength,
    blockPolicy: options.blockPolicy,
    writeBatchSize: 500
  });
  const seedMs = performance.now() - startedAt;

  startedAt = performance.now();
  const dashboard = await database.readDashboard(scope, 10);
  const dashboardMs = performance.now() - startedAt;

  startedAt = performance.now();
  const recentSessions = await database.readRecentSessions(scope, 25);
  const recentSessionsMs = performance.now() - startedAt;

  const appendTimes = [];
  for (let index = 0; index < 20; index += 1) {
    startedAt = performance.now();
    await database.recordAttempt({
      id: `${scope}|live|${index}`,
      sessionId: `${scope}|live-session`,
      scope,
      noteKey: `treble:${60 + index % 7}:natural`,
      completedAt: Date.UTC(2026, 8, 16, 12, 0, index),
      correctFirstTry: index % 4 !== 0,
      mistakeCount: index % 4 === 0 ? 1 : 0,
      responseTimeMs: 650 + index * 10
    });
    appendTimes.push(performance.now() - startedAt);
  }
  await database.finishSession(
    scope,
    `${scope}|live-session`,
    Date.UTC(2026, 8, 16, 12, 1, 0)
  );

  const counts = await database.countRecords();
  database.close();

  startedAt = performance.now();
  database = await openLearningDatabasePrototype(options);
  await database.readDashboard(scope, 10);
  const reopenAndDashboardMs = performance.now() - startedAt;
  const verified = await database.readDashboard(scope, 10);
  const afterEstimate = await storageEstimate();

  if (dashboard.statistics.attemptCount !== configuration.attemptCount) {
    throw new Error(`Seed count mismatch in ${configuration.label}`);
  }
  if (verified.statistics.attemptCount !== configuration.attemptCount + 20) {
    throw new Error(`Append count mismatch in ${configuration.label}`);
  }
  if (recentSessions.length !== Math.min(25, seeded.sessionCount)) {
    throw new Error(`Recent session page mismatch in ${configuration.label}`);
  }

  const result = {
    label: configuration.label,
    attemptCount: configuration.attemptCount,
    roundLength: configuration.roundLength,
    blockSize: configuration.blockSize,
    blockBytes: configuration.blockBytes,
    sessionCount: seeded.sessionCount,
    blockCount: seeded.blockCount,
    sessionBlockCount: seeded.sessionBlockCount,
    trendSegmentCount: seeded.trendSegmentCount,
    trendBlockCount: seeded.trendBlockCount,
    logicalAttemptMiB: Math.round(seeded.logicalAttemptBytes / 104857.6) / 10,
    logicalDatabaseMiB: Math.round(seeded.logicalDatabaseBytes / 104857.6) / 10,
    openMs: roundMilliseconds(openMs),
    seedMs: roundMilliseconds(seedMs),
    dashboardMs: roundMilliseconds(dashboardMs),
    recentSessionsMs: roundMilliseconds(recentSessionsMs),
    appendMedianMs: roundMilliseconds(percentile(appendTimes, 0.5)),
    appendP95Ms: roundMilliseconds(percentile(appendTimes, 0.95)),
    reopenAndDashboardMs: roundMilliseconds(reopenAndDashboardMs),
    recordCounts: counts,
    storageUsageDeltaMiB: beforeEstimate && afterEstimate
      ? Math.round((afterEstimate.usage - beforeEstimate.usage) / 104857.6 * 10) / 10
      : null
  };

  database.close();
  await deleteLearningDatabasePrototype(options);
  results.push(result);
  render(`Abgeschlossen: ${configuration.label}`);
  return result;
}

async function run() {
  if (typeof indexedDB === "undefined") {
    throw new Error("Dieser Browser stellt keine IndexedDB bereit.");
  }

  const query = new URLSearchParams(window.location.search);
  if (query.get("single") === "1") {
    await runScenario({
      label: query.get("label") || "Einzelmessung",
      attemptCount: Number(query.get("attempts")) || 100000,
      roundLength: Number(query.get("roundLength")) || 20,
      blockSize: Number(query.get("blockSize")) || 250,
      blockBytes: (Number(query.get("blockKiB")) || 64) * 1024
    });
    window.__NOTEN_PFOTEN_INDEXED_DB_BENCHMARK__ = {
      completed: true,
      userAgent: navigator.userAgent,
      finishedAt: new Date().toISOString(),
      results
    };
    render("Einzelmessung abgeschlossen.");
    return;
  }

  const scaleCounts = [4000, 10000, 50000, 100000, 500000];
  for (const attemptCount of scaleCounts) {
    await runScenario({
      label: `Skalierung ${attemptCount}`,
      attemptCount,
      roundLength: 20,
      blockSize: 250,
      blockBytes: 64 * 1024
    });
  }

  for (const blockSize of [50, 100, 250, 500]) {
    if (blockSize === 250) {
      continue;
    }
    await runScenario({
      label: `Blockgrenze ${blockSize}`,
      attemptCount: 100000,
      roundLength: 20,
      blockSize,
      blockBytes: 512 * 1024
    });
  }

  for (const blockBytes of [32, 64, 128]) {
    await runScenario({
      label: `Größengrenze ${blockBytes} KiB`,
      attemptCount: 100000,
      roundLength: 20,
      blockSize: 500,
      blockBytes: blockBytes * 1024
    });
  }

  for (const roundLength of [1, 5]) {
    await runScenario({
      label: `Kurze Runden ${roundLength} Antwort(en)`,
      attemptCount: 100000,
      roundLength,
      blockSize: 250,
      blockBytes: 64 * 1024
    });
  }

  window.__NOTEN_PFOTEN_INDEXED_DB_BENCHMARK__ = {
    completed: true,
    userAgent: navigator.userAgent,
    finishedAt: new Date().toISOString(),
    results
  };
  render("Alle Messungen abgeschlossen.");
}

run().catch(error => {
  window.__NOTEN_PFOTEN_INDEXED_DB_BENCHMARK__ = {
    completed: false,
    error: error && error.stack ? error.stack : String(error),
    results
  };
  render(`FEHLER: ${error && error.stack ? error.stack : error}`);
});
