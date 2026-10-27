import { openLearningDatabasePrototype } from "./LearningDatabasePrototype";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import { reportPersistenceFailure, clearPersistenceFailure } from "./PersistenceFeedback";

export const NOTE_FLOW_DATABASE_NAME = "noten-pfoten-learning";
export const NOTE_FLOW_SCOPE_SCREEN = "screen:note-flow";
export const NOTE_FLOW_SCOPE_MIDI = "midi:note-flow";
export const NOTE_FLOW_SCOPE_CHORD_MIDI = "midi:note-flow-chords";

let writerSequence = 0;

function discardedWriteError() {
  return new Error("This pending result was cleared with its learning data.");
}

function generationWriteError() {
  return new Error("This result belongs to a different learning database generation.");
}

export function getNoteFlowScope(inputMode, exerciseType = "melody") {
  if (exerciseType === "chord") return NOTE_FLOW_SCOPE_CHORD_MIDI;
  return inputMode === "midi"
    ? NOTE_FLOW_SCOPE_MIDI
    : NOTE_FLOW_SCOPE_SCREEN;
}

export class NoteFlowRoundWriter {
  constructor(options = {}) {
    this.options = options;
    this.databasePromise = null;
    this.databaseGeneration = null;
    this.queue = Promise.resolve();
    this.pendingRecords = new Map();
    // Successful receipts follow the caller's object lifetime, rather than
    // retaining an ever-growing list of saved round ids or Vue instances.
    this.originalRecords = new WeakMap();
    this.retryPromise = null;
    this.persistenceSourceId = options.persistenceSourceId
      || `note-flow-writer-${++writerSequence}`;
  }

  currentGeneration() {
    return this.options.databaseName || activeLearningDatabaseName();
  }

  open() {
    const generation = this.currentGeneration();
    if (this.databasePromise && this.databaseGeneration !== generation) {
      const previous = this.databasePromise;
      this.databasePromise = null;
      previous.then(database => database.close()).catch(() => {});
    }
    if (!this.databasePromise) {
      this.databaseGeneration = generation;
      const opening = (
        typeof this.options.openDatabase === "function"
          ? Promise.resolve(this.options.openDatabase({ name: generation }))
          : openLearningDatabasePrototype({
            name: generation,
            indexedDB: this.options.indexedDB,
            IDBKeyRange: this.options.IDBKeyRange
          })
      ).catch(error => {
        if (this.databasePromise === opening) this.databasePromise = null;
        throw error;
      });
      this.databasePromise = opening;
    }
    return this.databasePromise;
  }

  enqueue(operation, generation) {
    const pending = this.queue.then(() => {
      if (generation && generation !== this.currentGeneration()) throw generationWriteError();
      return this.open();
    }).then(operation);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  saveRound(result) {
    if (!result || typeof result.id !== "string" || !result.id) {
      return Promise.resolve({
        saved: false,
        error: new TypeError("A complete Note Flow round result is required")
      });
    }
    const scope = getNoteFlowScope(
      result.settings && result.settings.inputMode,
      result.exerciseType
    );
    return this.saveRecord(scope, result);
  }

  saveRecord(scope, result) {
    const generation = this.currentGeneration();
    const original = this.originalRecords.get(result);
    if (original && original.id === result.id && original.scope === scope) {
      if (original.token.discarded) {
        return Promise.resolve({ saved: false, error: discardedWriteError(), scope });
      }
      if (original.generation !== generation) {
        return Promise.resolve({ saved: false, error: generationWriteError(), scope });
      }
      if (original.token.receipt) {
        return Promise.resolve(Object.assign({}, original.token.receipt, { duplicate: true }));
      }
      if (original.promise) {
        return original.promise.then(receipt => receipt.saved
          ? Object.assign({}, receipt, { duplicate: true }) : receipt);
      }
    }
    const key = JSON.stringify([scope, result.id]);
    let entry = this.pendingRecords.get(key);
    const duplicatePending = Boolean(entry && entry.inFlight);
    if (entry && entry.generation !== generation) {
      return Promise.resolve({ saved: false, error: generationWriteError(), scope });
    }
    if (!entry) {
      let snapshot;
      try { snapshot = JSON.parse(JSON.stringify(result)); }
      catch (error) { return Promise.resolve({ saved: false, error, scope }); }
      entry = {
        key, scope, generation, snapshot,
        token: { discarded: false, receipt: null }, inFlight: null, failed: false, error: null
      };
      this.pendingRecords.set(key, entry);
    }
    const state = original && original.id === result.id && original.scope === scope
      ? original
      : { id: result.id, scope, generation, token: entry.token, promise: null };
    this.originalRecords.set(result, state);
    // The continuation retains only this small state and the snapshot entry.
    // It never closes over the original result or its component owner.
    state.promise = this.writeEntry(entry).then(receipt => {
      state.promise = null;
      return receipt.saved && duplicatePending
        ? Object.assign({}, receipt, { duplicate: true }) : receipt;
    });
    return state.promise;
  }

  writeEntry(entry) {
    if (entry.inFlight) return entry.inFlight;
    if (entry.token.discarded) {
      return Promise.resolve({ saved: false, error: discardedWriteError(), scope: entry.scope });
    }
    if (entry.token.receipt) {
      return Promise.resolve(Object.assign({}, entry.token.receipt, { duplicate: true }));
    }
    const pending = this.enqueue(database => {
      if (entry.token.discarded) throw discardedWriteError();
      if (entry.generation !== this.currentGeneration()) throw generationWriteError();
      return database.recordNoteFlowRound(entry.scope, entry.snapshot);
    }, entry.generation).then(value => {
      const receipt = { saved: true, duplicate: Boolean(value && value.duplicate), scope: entry.scope };
      entry.token.receipt = receipt;
      if (this.pendingRecords.get(entry.key) === entry) this.pendingRecords.delete(entry.key);
      return receipt;
    }, error => {
      entry.failed = true;
      entry.error = error;
      return { saved: false, error, scope: entry.scope };
    }).then(receipt => {
      entry.inFlight = null;
      this.refreshPersistenceFailure();
      return receipt;
    });
    entry.inFlight = pending;
    // A drain includes the receipt and failure bookkeeping, not just the IO.
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  refreshPersistenceFailure() {
    if (Array.from(this.pendingRecords.values()).some(entry => entry.failed)) {
      reportPersistenceFailure(this.persistenceSourceId, "PERSISTENCE_ROUNDS", () => this.retryFailedWrites());
    } else clearPersistenceFailure(this.persistenceSourceId);
  }

  getStatus() {
    const records = Array.from(this.pendingRecords.values());
    const failed = records.filter(entry => entry.failed);
    return {
      pendingWrites: records.filter(entry => entry.inFlight).length,
      failedWrites: failed.length,
      lastError: failed.length ? failed[failed.length - 1].error : null
    };
  }

  retryFailedWrites() {
    if (this.retryPromise) return this.retryPromise;
    const failed = Array.from(this.pendingRecords.values()).filter(entry => entry.failed);
    this.retryPromise = failed.reduce((previous, entry) => (
      previous.then(() => this.writeEntry(entry))
    ), Promise.resolve()).then(() => {
      this.retryPromise = null;
      const status = this.getStatus();
      return { saved: status.failedWrites === 0, failedWrites: status.failedWrites, error: status.lastError };
    });
    return this.retryPromise;
  }

  capturePendingWrites() {
    return Array.from(this.pendingRecords.values());
  }

  discardPendingWrites(capturedEntries) {
    (capturedEntries || []).forEach(entry => {
      entry.token.discarded = true;
      if (this.pendingRecords.get(entry.key) === entry) this.pendingRecords.delete(entry.key);
    });
    this.refreshPersistenceFailure();
  }

  pauseWrites() {
    const ready = this.queue;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    this.queue = ready.then(() => barrier);
    return { ready, release };
  }

  readRecent(inputMode, limit = 25, exerciseType = "melody") {
    const scope = getNoteFlowScope(inputMode, exerciseType);
    return this.enqueue(database => (
      database.readRecentNoteFlowRounds(scope, limit)
    )).then(rounds => ({ saved: true, scope, rounds })).catch(error => ({
      saved: false,
      error,
      scope,
      rounds: []
    }));
  }

  readStatistics(inputMode, exerciseType = "melody") {
    const scope = getNoteFlowScope(inputMode, exerciseType);
    return this.enqueue(database => (
      database.readNoteFlowStatistics(scope)
    )).then(statistics => ({
      saved: true,
      scope,
      statistics
    })).catch(error => ({
      saved: false,
      error,
      scope,
      statistics: null
    }));
  }

  readRoundsForExport(inputMode, exerciseType = "melody") {
    const scope = getNoteFlowScope(inputMode, exerciseType);
    return this.enqueue(database => (
      database.readNoteFlowRoundsForExport(scope)
    )).then(rounds => ({ saved: true, scope, rounds })).catch(error => ({
      saved: false,
      error,
      scope,
      rounds: []
    }));
  }

  readRoundsPage(inputMode, afterBlockNumber = null, limit = 4, exerciseType = "melody") {
    const scope = getNoteFlowScope(inputMode, exerciseType);
    return this.enqueue(database => (
      database.readNoteFlowRoundsPage(scope, afterBlockNumber, limit)
    )).then(page => ({ saved: true, scope, page })).catch(error => ({
      saved: false, error, scope, page: null
    }));
  }

  readHistoryWindow(inputMode, startIndex, endIndex, exerciseType = "melody") {
    const scope = getNoteFlowScope(inputMode, exerciseType);
    return this.enqueue(database => (
      database.readNoteFlowHistoryWindow(scope, startIndex, endIndex)
    )).then(rounds => ({ saved: true, scope, rounds })).catch(error => ({
      saved: false, error, scope, rounds: []
    }));
  }

  flush() {
    return this.queue;
  }

  close() {
    return this.flush().then(() => {
      if (!this.databasePromise) return;
      return this.databasePromise.then(database => database.close()).catch(() => {});
    });
  }
}

const NoteFlowRoundStorage = new NoteFlowRoundWriter({ persistenceSourceId: "note-flow-rounds" });

export default NoteFlowRoundStorage;
