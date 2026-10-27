import {
  validateSaveDataBackup,
  validateStreamedBackupRecord
} from "./SaveDataBackup";
import {
  STREAMED_BACKUP_ARRAYS,
  readBrowserSaveDataStream,
  readNativeSaveDataStream
} from "./SaveDataStreamReader";
import { summarizeStagedSaveData } from "./SaveDataStagedPreview";

const DATABASE_NAME = "noten-pfoten-backup-import-staging";
const DATABASE_VERSION = 3;
const STORES = ["records", "identities", "order", "metadata", "mergeMatches"];
const MAX_READ_BATCH = 250;
let nextSession = 0;
const EVALUATION_SECTIONS = [
  "data.adaptiveHistory.evaluations",
  "data.adaptiveHistoryMidi.evaluations"
];
const MERGE_MATCH_SECTIONS = EVALUATION_SECTIONS.concat([
  "data.noteFlowRounds.screen",
  "data.noteFlowRounds.midi",
  "data.noteFlowRounds.chordMidi",
  "data.rhythmSenseBars"
]);

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error("Backup staging transaction failed.")
    );
    transaction.onerror = () => {};
  });
}

function identityGroup(section) {
  if (section.indexOf("data.noteFlowRounds.") === 0) return "noteFlowRounds";
  if (section === "data.roundHistory" || section === "data.roundHistory.rounds") {
    return "roundHistory";
  }
  return section;
}

function newSessionId() {
  nextSession += 1;
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().toLowerCase()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${random}-${nextSession.toString(36)}`;
}

function sessionError() {
  const error = new Error("The selected backup import session has changed.");
  error.name = "StagedImportSessionError";
  return error;
}

export class SaveDataImportStaging {
  constructor(database, sessionId, indexedDb, databaseName) {
    this.database = database;
    this.sessionId = sessionId;
    this.indexedDb = indexedDb;
    this.databaseName = databaseName;
    this.closed = false;
    this.readyIdentity = null;
    this.pending = [];
    this.counts = Object.create(null);
    this.readyCounts = null;
  }

  append(section, record) {
    const validation = validateStreamedBackupRecord(section, record);
    if (!validation.valid || typeof validation.identity !== "string"
      || !validation.identity) {
      throw new Error(`Invalid backup record in ${section}.`);
    }
    const index = this.counts[section] || 0;
    this.pending.push({
      section, index, record,
      identity: `${identityGroup(section)}:${validation.identity}`
    });
    this.counts[section] = index + 1;
  }

  async flush() {
    if (!this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    const transaction = this.database.transaction(["records", "identities", "order"], "readwrite");
    const completion = transactionResult(transaction);
    const records = transaction.objectStore("records");
    const identities = transaction.objectStore("identities");
    const order = transaction.objectStore("order");
    batch.forEach(item => {
      records.add({ section: item.section, index: item.index, value: item.record });
      identities.add({ key: item.identity, section: item.section, index: item.index });
      if (EVALUATION_SECTIONS.indexOf(item.section) !== -1) {
        order.add({
          section: item.section,
          completedAt: Number(item.record.completedAt),
          id: item.record.id,
          index: item.index
        });
      }
    });
    await completion;
  }

  async complete(shell, counts, fileSize) {
    const validation = validateSaveDataBackup(shell);
    if (!validation.valid) {
      throw new Error(`Invalid backup metadata: ${validation.errors.join(", ")}`);
    }
    if (Object.keys(this.counts).some(section => (
      this.counts[section] !== counts[section]
    ))) {
      throw new Error("The staged backup is incomplete.");
    }
    await this.flush();
    const transaction = this.database.transaction("metadata", "readwrite");
    const completion = transactionResult(transaction);
    const metadata = { key: "ready", sessionId: this.sessionId, shell, counts, fileSize };
    transaction.objectStore("metadata").put(metadata);
    await completion;
    this.readyCounts = Object.assign({}, counts);
    this.readyIdentity = JSON.stringify(metadata);
  }

  checkMetadataIdentity(metadata) {
    if (this.closed || !metadata || metadata.sessionId !== this.sessionId
      || !this.readyIdentity || JSON.stringify(metadata) !== this.readyIdentity) {
      throw sessionError();
    }
    return metadata;
  }

  async assertSessionIdentity() {
    if (!this.readyCounts || this.closed) throw sessionError();
    return this.checkMetadataIdentity(await this.readMetadata());
  }

  // The large-file replacement must consume records in bounded batches.
  // Reading a whole section at once would recreate the original OOM risk.
  async readBatch(section, start = 0, limit = MAX_READ_BATCH) {
    if (!this.readyCounts) {
      throw new Error("The staged backup is not ready.");
    }
    if (STREAMED_BACKUP_ARRAYS.indexOf(section) === -1) {
      throw new Error(`Unknown staged backup section: ${section}.`);
    }
    if (!Number.isSafeInteger(start) || start < 0
      || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_READ_BATCH) {
      throw new RangeError("Invalid staged backup batch range.");
    }
    const total = this.readyCounts[section] || 0;
    if (!Number.isSafeInteger(total) || total < 0 || start > total) {
      throw new Error("Invalid staged backup section count.");
    }
    const end = Math.min(total, start + limit);
    if (start === end) {
      return { records: [], nextIndex: end, total, done: true };
    }
    const transaction = this.database.transaction(["records", "metadata"], "readonly");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore("records");
    const metadata = requestResult(transaction.objectStore("metadata").get("ready"));
    const requests = [];
    for (let index = start; index < end; index += 1) {
      requests.push(requestResult(store.get([section, index])));
    }
    const [rows, ready] = await Promise.all([Promise.all(requests), metadata, completion]);
    this.checkMetadataIdentity(ready);
    const records = rows.map((row, offset) => {
      if (!row || row.section !== section || row.index !== start + offset) {
        throw new Error("The staged backup is missing a record.");
      }
      const validation = validateStreamedBackupRecord(section, row.value);
      if (!validation.valid) {
        throw new Error("The staged backup contains an invalid record.");
      }
      return row.value;
    });
    return { records, nextIndex: end, total, done: end === total };
  }

  // Exact, bounded lookup for a future large-backup merge. A matching ID is
  // not necessarily a duplicate: callers must still compare the records.
  async findRecordByIdentity(section, identity) {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    if (STREAMED_BACKUP_ARRAYS.indexOf(section) === -1
      || typeof identity !== "string" || !identity) {
      throw new TypeError("Invalid staged backup identity.");
    }
    const transaction = this.database.transaction("identities", "readonly");
    const completion = transactionResult(transaction);
    const row = await requestResult(
      transaction.objectStore("identities").get(
        `${identityGroup(section)}:${identity}`
      )
    );
    await completion;
    if (!row) return null;
    if (STREAMED_BACKUP_ARRAYS.indexOf(row.section) === -1
      || identityGroup(row.section) !== identityGroup(section)
      || !Number.isSafeInteger(row.index) || row.index < 0) {
      throw new Error("The staged backup identity index is inconsistent.");
    }
    const page = await this.readBatch(row.section, row.index, 1);
    const record = page.records[0];
    const validation = validateStreamedBackupRecord(row.section, record);
    if (!validation.valid || validation.identity !== identity) {
      throw new Error("The staged backup identity index is inconsistent.");
    }
    return { section: row.section, index: row.index, record };
  }

  // Resolve one bounded active-history page in two IndexedDB transactions,
  // rather than opening a new transaction for every answer in a large merge.
  async findRecordsByIdentities(section, identities) {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    if (STREAMED_BACKUP_ARRAYS.indexOf(section) === -1
      || !Array.isArray(identities) || identities.length > MAX_READ_BATCH
      || identities.some(id => typeof id !== "string" || !id)) {
      throw new TypeError("Invalid staged backup identities.");
    }
    if (!identities.length) return [];
    const group = identityGroup(section);
    const identityTransaction = this.database.transaction("identities", "readonly");
    const identityCompletion = transactionResult(identityTransaction);
    const identityStore = identityTransaction.objectStore("identities");
    const rows = await Promise.all(identities.map(id => requestResult(
      identityStore.get(`${group}:${id}`)
    )));
    await identityCompletion;
    const recordTransaction = this.database.transaction("records", "readonly");
    const recordCompletion = transactionResult(recordTransaction);
    const recordStore = recordTransaction.objectStore("records");
    const records = await Promise.all(rows.map(row => row
      ? requestResult(recordStore.get([row.section, row.index]))
      : Promise.resolve(null)));
    await recordCompletion;
    return records.map((stored, index) => {
      const row = rows[index];
      if (!row) return null;
      const validation = stored && validateStreamedBackupRecord(
        row.section, stored.value
      );
      if (!stored || stored.section !== row.section
        || stored.index !== row.index
        || STREAMED_BACKUP_ARRAYS.indexOf(row.section) === -1
        || identityGroup(row.section) !== group
        || !validation.valid || validation.identity !== identities[index]) {
        throw new Error("The staged backup identity index is inconsistent.");
      }
      return { section: row.section, index: row.index, record: stored.value };
    });
  }

  async resetMergeMatches() {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    const transaction = this.database.transaction("mergeMatches", "readwrite");
    const completion = transactionResult(transaction);
    transaction.objectStore("mergeMatches").clear();
    await completion;
  }

  async markMergeMatches(section, identities) {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    if (MERGE_MATCH_SECTIONS.indexOf(section) === -1
      || !Array.isArray(identities) || identities.length > MAX_READ_BATCH
      || identities.some(id => typeof id !== "string" || !id)) {
      throw new TypeError("Invalid merge-match identities.");
    }
    if (!identities.length) return;
    const transaction = this.database.transaction("mergeMatches", "readwrite");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore("mergeMatches");
    identities.forEach(identity => store.add({
      key: `${identityGroup(section)}:${identity}`
    }));
    await completion;
  }

  async hasMergeMatches(section, identities) {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    if (MERGE_MATCH_SECTIONS.indexOf(section) === -1
      || !Array.isArray(identities) || identities.length > MAX_READ_BATCH
      || identities.some(id => typeof id !== "string" || !id)) {
      throw new TypeError("Invalid merge-match identities.");
    }
    if (!identities.length) return [];
    const transaction = this.database.transaction("mergeMatches", "readonly");
    const completion = transactionResult(transaction);
    const store = transaction.objectStore("mergeMatches");
    const matches = await Promise.all(identities.map(identity => requestResult(
      store.get(`${identityGroup(section)}:${identity}`)
    )));
    await completion;
    return matches.map(Boolean);
  }

  // Uses a small IndexedDB index page instead of sorting all evaluations in
  // JavaScript. The cursor is the last chronological key, not a row offset.
  async readChronologicalBatch(section, after = null, limit = MAX_READ_BATCH) {
    if (!this.readyCounts) throw new Error("The staged backup is not ready.");
    if (EVALUATION_SECTIONS.indexOf(section) === -1) {
      throw new Error("Only single-note evaluations have chronological order.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_READ_BATCH) {
      throw new RangeError("Invalid chronological batch size.");
    }
    if (after !== null && (!after || !Number.isFinite(after.completedAt)
      || after.completedAt < 0 || typeof after.id !== "string")) {
      throw new RangeError("Invalid chronological cursor.");
    }
    const keyRange = this.keyRange || (
      typeof IDBKeyRange !== "undefined" ? IDBKeyRange : null
    );
    if (!keyRange) throw new Error("IDBKeyRange is unavailable.");
    const lower = after
      ? [section, after.completedAt, after.id]
      : [section, 0, ""];
    const range = keyRange.bound(
      lower, [section, Number.MAX_SAFE_INTEGER, "\uffff"], Boolean(after), false
    );
    const transaction = this.database.transaction(["order", "records", "metadata"], "readonly");
    const completion = transactionResult(transaction);
    const metadata = requestResult(transaction.objectStore("metadata").get("ready"));
    const positions = await requestResult(
      transaction.objectStore("order").getAll(range, limit)
    );
    const records = await Promise.all(positions.map(position => requestResult(
      transaction.objectStore("records").get([section, position.index])
    )));
    await completion;
    this.checkMetadataIdentity(await metadata);
    const values = records.map((row, index) => {
      const position = positions[index];
      if (!row || row.section !== section || row.index !== position.index
        || row.value.id !== position.id
        || Number(row.value.completedAt) !== position.completedAt) {
        throw new Error("The staged chronological index is inconsistent.");
      }
      return row.value;
    });
    const last = positions[positions.length - 1];
    return {
      records: values,
      cursor: last ? { completedAt: last.completedAt, id: last.id } : after,
      done: positions.length < limit
    };
  }

  async clear() {
    this.pending = [];
    this.counts = Object.create(null);
    this.readyCounts = null;
    this.readyIdentity = null;
    const transaction = this.database.transaction(STORES, "readwrite");
    const completion = transactionResult(transaction);
    STORES.forEach(name => transaction.objectStore(name).clear());
    await completion;
  }

  async readMetadata() {
    if (this.closed) throw sessionError();
    const transaction = this.database.transaction("metadata", "readonly");
    const completion = transactionResult(transaction);
    const [metadata] = await Promise.all([
      requestResult(transaction.objectStore("metadata").get("ready")), completion
    ]);
    return this.readyIdentity ? this.checkMetadataIdentity(metadata) : metadata;
  }

  async readPreview() {
    return summarizeStagedSaveData(await this.readMetadata());
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
    // Only this handle owns this fresh database. Never delete a shared name
    // or another tab's staging when a preview is cancelled or applied.
    if (this.indexedDb && typeof this.indexedDb.deleteDatabase === "function") {
      try {
        const request = this.indexedDb.deleteDatabase(this.databaseName);
        request.onerror = () => {};
      } catch (ignored) { }
    }
  }
}

export async function openSaveDataImportStaging(options = {}) {
  const indexedDb = options.indexedDB || (
    typeof indexedDB !== "undefined" ? indexedDB : null
  );
  if (!indexedDb) throw new Error("IndexedDB is unavailable.");
  const sessionId = newSessionId();
  const name = `${options.name || DATABASE_NAME}-${sessionId}`;
  let created = false;
  const request = indexedDb.open(name, DATABASE_VERSION);
  request.onupgradeneeded = event => {
    // Real IndexedDB supplies oldVersion. The undefined fallback supports
    // existing small test adapters without weakening the browser guard.
    created = event.oldVersion === 0 || event.oldVersion === undefined;
    if (!created) return;
    const database = event.target.result;
    if (!database.objectStoreNames.contains("records")) {
      database.createObjectStore("records", { keyPath: ["section", "index"] });
    }
    if (!database.objectStoreNames.contains("identities")) {
      database.createObjectStore("identities", { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains("order")) {
      database.createObjectStore("order", {
        keyPath: ["section", "completedAt", "id"]
      });
    }
    if (!database.objectStoreNames.contains("metadata")) {
      database.createObjectStore("metadata", { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains("mergeMatches")) {
      database.createObjectStore("mergeMatches", { keyPath: "key" });
    }
  };
  const database = await requestResult(request);
  // Even an unlikely generated-name collision must not clear an older import.
  if (!created) {
    database.close();
    throw sessionError();
  }
  const staging = new SaveDataImportStaging(database, sessionId, indexedDb, name);
  staging.keyRange = options.IDBKeyRange || null;
  try {
    await staging.clear(); // Never reuse an incomplete or older staged import.
    return staging;
  } catch (error) {
    staging.close();
    throw error;
  }
}

async function stageWithReader(read, source, options = {}) {
  const staging = await openSaveDataImportStaging(options);
  const checkCancelled = () => {
    if (!options.shouldContinue || options.shouldContinue()) return;
    const error = new Error("The backup import was cancelled.");
    error.name = "AbortError";
    throw error;
  };
  try {
    checkCancelled();
    const result = await read(source,
      (section, record) => staging.append(section, record),
      {
        afterChunk: async () => {
          await staging.flush();
          checkCancelled();
        },
        onProgress: options.onProgress
      });
    if (!result) {
      staging.close();
      return null;
    }
    checkCancelled();
    await staging.complete(result.backup, result.counts, result.size);
    checkCancelled();
    return { staging, size: result.size, counts: result.counts };
  } catch (error) {
    try { await staging.clear(); } catch (ignored) { }
    staging.close();
    throw error;
  }
}

export function stageBrowserSaveDataFile(file, options = {}) {
  return stageWithReader(readBrowserSaveDataStream, file, options);
}

export function stageNativeSaveDataFile(plugin, options = {}) {
  return stageWithReader(readNativeSaveDataStream, plugin, options);
}
