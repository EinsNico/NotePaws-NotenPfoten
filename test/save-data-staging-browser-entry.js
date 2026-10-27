import { stageBrowserSaveDataFile } from "../src/model/SaveDataImportStaging";

const input = document.getElementById("backup-file");
const status = document.getElementById("status");
const databaseName = "noten-pfoten-browser-staging-stress-test";
const query = new URLSearchParams(window.location.search);
const expectedNotes = Number(query.get("notes")) || 100000;
const expectedBars = Number(query.get("bars")) || 80000;

function deleteTestDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testdatenbank ist noch geöffnet."));
  });
}

input.addEventListener("change", async () => {
  const file = input.files && input.files[0];
  if (!file) return;
  status.textContent = "Lese und prüfe die Testdatei …";
  const start = performance.now();
  let staging;
  try {
    const result = await stageBrowserSaveDataFile(file, { name: databaseName });
    staging = result.staging;
    const ready = await staging.readMetadata();
    if (!ready || ready.key !== "ready") {
      throw new Error("Die temporäre Ablage wurde nicht abgeschlossen.");
    }
    const noteCount = result.counts["data.adaptiveHistory.evaluations"] || 0;
    const barCount = result.counts["data.rhythmSenseBars"] || 0;
    if (noteCount !== expectedNotes || barCount !== expectedBars) {
      throw new Error(`Unerwartete Datensatzanzahl: ${noteCount}/${barCount}`);
    }
    const elapsedSeconds = Math.round((performance.now() - start) / 1000);
    window.stagingTestResult = {
      ok: true, bytes: file.size, noteCount, barCount, elapsedSeconds
    };
    status.textContent = `Erfolg: ${noteCount} Antworten und ${barCount} Takte in ${elapsedSeconds} s vorbereitet.`;
  } catch (error) {
    window.stagingTestResult = { ok: false, error: String(error) };
    status.textContent = `Fehler: ${error}`;
  } finally {
    if (staging) staging.close();
    try { await deleteTestDatabase(); } catch (error) {
      status.textContent += ` Temporäre Datenbank nicht entfernt: ${error}`;
    }
  }
});
