// Physical keys and their eligibility belong to different lifetimes: a key
// may remain down across targets, but only a new attack can answer a new note.
export function createHeldNoteGrip(heldValues = []) {
  return { heldValues:heldValues.slice(), activeValues:[], seenValues:[], activeAt:{} };
}

export function resetHeldNoteGrip(grip) {
  return createHeldNoteGrip(grip ? grip.heldValues : []);
}

export function pressHeldNoteGrip(grip, expectedValues, value, at = 0) {
  grip = grip || createHeldNoteGrip();
  if (!Number.isInteger(value) || value < 0 || value > 127 || grip.heldValues.includes(value)) return null;
  const correct = expectedValues.includes(value);
  const next = Object.assign({}, grip, { heldValues:grip.heldValues.concat(value) });
  if (correct) {
    next.activeValues = grip.activeValues.concat(value);
    next.seenValues = grip.seenValues.includes(value) ? grip.seenValues : grip.seenValues.concat(value);
    next.activeAt = Object.assign({}, grip.activeAt, { [value]:at });
  }
  return { grip:next, correct, complete:correct && expectedValues.every(note => next.activeValues.includes(note)) };
}

export function releaseHeldNoteGrip(grip, value) {
  if (!grip || !grip.heldValues.includes(value)) return grip;
  const activeAt = Object.assign({}, grip.activeAt);
  delete activeAt[value];
  return Object.assign({}, grip, {
    heldValues:grip.heldValues.filter(note => note !== value),
    activeValues:grip.activeValues.filter(note => note !== value), activeAt
  });
}

export function heldNoteGripColor(grip, value) {
  if (!grip) return '';
  if (grip.activeValues.includes(value)) return 'held';
  return grip.seenValues.includes(value) ? 'found' : '';
}
