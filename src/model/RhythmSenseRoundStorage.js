import { NoteFlowRoundWriter } from './NoteFlowRoundStorage';

export const RHYTHM_SENSE_SCOPE = 'rhythm:taktgefuehl';

export class RhythmSenseRoundWriter extends NoteFlowRoundWriter {
  saveBar(record) {
    if (!record || typeof record.id !== 'string' || !record.id) {
      return Promise.resolve({ saved: false, error: new TypeError('A rhythm bar record is required') });
    }
    return this.saveRecord(RHYTHM_SENSE_SCOPE, record)
      .then(result => result.saved
        ? { saved: true, duplicate: result.duplicate }
        : { saved: false, error: result.error });
  }

  readRecent(limit = 25) {
    return this.enqueue(database => database.readRecentNoteFlowRounds(RHYTHM_SENSE_SCOPE, limit))
      .then(rounds => ({ saved: true, rounds }))
      .catch(error => ({ saved: false, error, rounds: [] }));
  }

  readStatistics() {
    return this.enqueue(database => database.readNoteFlowStatistics(RHYTHM_SENSE_SCOPE))
      .then(statistics => ({ saved: true, statistics }))
      .catch(error => ({ saved: false, error, statistics: null }));
  }

  readBarsForExport() {
    return this.enqueue(database => database.readNoteFlowRoundsForExport(RHYTHM_SENSE_SCOPE))
      .then(bars => ({ saved: true, bars }))
      .catch(error => ({ saved: false, error, bars: [] }));
  }

  readBarsPage(afterBlockNumber = null, limit = 4) {
    return this.enqueue(database => (
      database.readNoteFlowRoundsPage(RHYTHM_SENSE_SCOPE, afterBlockNumber, limit)
    )).then(page => ({ saved: true, page })).catch(error => ({
      saved: false, error, page: null
    }));
  }
}

export default new RhythmSenseRoundWriter({ persistenceSourceId: "rhythm-sense-bars" });
