import { workshopTimeOnGrid, workshopTimeTicks } from "./WorkshopRhythm";
import { isValidWorkshopKeyId } from "./WorkshopTonality";
import { isValidWorkshopPitchContext } from './WorkshopPitchContext';

const FIELDS = ["clef", "keyId", "clefOctave", "transpose"];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// Context boundaries store written notation only; absolute note pitches do not
// change when a clef or signature is edited.
export function isValidWorkshopContextChanges(changes, limit = Infinity) {
  if (!Array.isArray(changes) || changes.length > 128) return false;
  const ids = new Set(), positions = new Set();
  return changes.every(change => {
    if (!change || typeof change !== "object" || Array.isArray(change)
      || Object.keys(change).some(key => !["id", "startSlot", "clef", "keyId", "clefOctave", "transpose"].includes(key))
      || typeof change.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(change.id)
      || !workshopTimeOnGrid(change.startSlot) || change.startSlot <= 0 || change.startSlot >= limit
      || !FIELDS.some(key => own(change, key))
      || own(change, "clef") && !["treble", "bass", "alto", "tenor"].includes(change.clef)
      || own(change, "keyId") && !isValidWorkshopKeyId(change.keyId)
      || !isValidWorkshopPitchContext(change)) return false;
    const position = workshopTimeTicks(change.startSlot);
    if (ids.has(change.id) || positions.has(position)) return false;
    ids.add(change.id); positions.add(position); return true;
  });
}

export function workshopOrderedContextChanges(measure) {
  return (measure && measure.contextChanges || []).slice().sort((a, b) => workshopTimeTicks(a.startSlot) - workshopTimeTicks(b.startSlot));
}

export function workshopContextAtSlot(measure, slot, baseContext = {}) {
  const context = Object.assign({}, baseContext);
  FIELDS.forEach(key => { if (measure && own(measure, key)) context[key] = measure[key]; });
  const ticks = slot === Infinity ? Infinity : workshopTimeTicks(slot);
  workshopOrderedContextChanges(measure).forEach(change => {
    if (workshopTimeTicks(change.startSlot) <= ticks) FIELDS.forEach(key => { if (own(change, key)) context[key] = change[key]; });
  });
  return context;
}

// Every segment carries the effective clef/key, plus its original boundary ID
// and changed fields. The first segment always describes the measure header.
export function workshopContextChangeSegments(measure, baseContext = {}) {
  let context = workshopContextAtSlot(measure, 0, baseContext);
  const segments = [Object.assign({}, context, { startSlot: 0 })];
  workshopOrderedContextChanges(measure).forEach(change => {
    const previous = Object.assign({}, context);
    FIELDS.forEach(key => { if (own(change, key)) context[key] = change[key]; });
    segments.push(Object.assign({}, context, {
      id: change.id, startSlot: change.startSlot, previous,
      changedFields: FIELDS.filter(key => own(change, key))
    }));
  });
  return segments;
}
