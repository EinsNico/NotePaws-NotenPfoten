import { indexWorkshopExpressionNotes as indexNotes } from "./WorkshopExpression";

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function validId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function pitchKey(pitch) { return pitch.step + ":" + pitch.alter + ":" + pitch.octave; }

function validEdge(edge, notes) {
  if (!plain(edge) || Object.keys(edge).some(key => !["fromId", "toId", "sustainAcrossGap"].includes(key))
    || !Object.prototype.hasOwnProperty.call(edge, "fromId") || !Object.prototype.hasOwnProperty.call(edge, "toId")
    || (Object.prototype.hasOwnProperty.call(edge, "sustainAcrossGap") && edge.sustainAcrossGap !== true)
    || !validId(edge.fromId) || !validId(edge.toId) || edge.fromId === edge.toId) return false;
  const from = notes.get(edge.fromId);
  const to = notes.get(edge.toId);
  if (!from || !to || to.event.grace || from.partIndex !== to.partIndex || from.voice !== to.voice
    || pitchKey(from.soundingPitch) !== pitchKey(to.soundingPitch)) return false;
  // A tied grace note belongs to the same onset as its main note. Imported
  // arpeggiated figures can also sustain a tone until a later chord, despite
  // other notes of the same voice occupying the intervening written time.
  if (from.event.grace) return from.start === to.start && !edge.sustainAcrossGap;
  return from.start < to.start && (from.end === to.start || edge.sustainAcrossGap === true && from.end < to.start);
}

export function isValidWorkshopTies(score) {
  if (!plain(score)) return false;
  if (!Object.prototype.hasOwnProperty.call(score, "ties")) return true;
  if (!Array.isArray(score.ties)) return false;
  const notes = indexNotes(score);
  if (!notes || score.ties.length > notes.size) return false;
  const outgoing = new Set();
  const incoming = new Set();
  for (const edge of score.ties) {
    if (!validEdge(edge, notes) || outgoing.has(edge.fromId) || incoming.has(edge.toId)) return false;
    outgoing.add(edge.fromId); incoming.add(edge.toId);
    // Positive durations and strictly increasing start times prohibit cycles.
  }
  return true;
}

export function repairWorkshopTies(score) {
  const next = clone(score);
  if (!Object.prototype.hasOwnProperty.call(next, "ties")) return next;
  const notes = indexNotes(next);
  const outgoing = new Set();
  const incoming = new Set();
  next.ties = notes && Array.isArray(next.ties) ? next.ties.filter(edge => {
    if (!validEdge(edge, notes) || outgoing.has(edge.fromId) || incoming.has(edge.toId)) return false;
    outgoing.add(edge.fromId); incoming.add(edge.toId); return true;
  }) : [];
  if (!next.ties.length) delete next.ties;
  return next;
}

export function connectWorkshopTies(score, ids) {
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length
    || !ids.every(validId) || !isValidWorkshopTies(score)) return null;
  const notes = indexNotes(score);
  if (!notes || ids.some(id => !notes.has(id))) return null;
  const selected = ids.map(id => notes.get(id));
  if (selected.some(note => note.partIndex !== selected[0].partIndex || note.voice !== selected[0].voice)) return null;
  const chains = new Map();
  selected.forEach(note => {
    const key = pitchKey(note.soundingPitch);
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key).push(note);
  });
  const edges = [];
  for (const chain of chains.values()) {
    if (chain.length < 2) return null;
    chain.sort((left, right) => left.start - right.start);
    for (let index = 1; index < chain.length; index++) {
      const edge = { fromId: chain[index - 1].event.id, toId: chain[index].event.id };
      if (!validEdge(edge, notes)) return null;
      edges.push(edge);
    }
  }
  const next = clone(score);
  next.ties = next.ties || [];
  const outgoing = new Map(next.ties.map(edge => [edge.fromId, edge.toId]));
  const incoming = new Map(next.ties.map(edge => [edge.toId, edge.fromId]));
  for (const edge of edges) {
    if ((outgoing.has(edge.fromId) && outgoing.get(edge.fromId) !== edge.toId)
      || (incoming.has(edge.toId) && incoming.get(edge.toId) !== edge.fromId)) return null;
    if (!outgoing.has(edge.fromId)) next.ties.push(edge);
    outgoing.set(edge.fromId, edge.toId); incoming.set(edge.toId, edge.fromId);
  }
  return isValidWorkshopTies(next) ? next : null;
}

export function disconnectWorkshopTies(score, ids) {
  if (!Array.isArray(ids) || !ids.every(validId) || !isValidWorkshopTies(score)) return null;
  const selected = new Set(ids);
  const next = clone(score);
  if (!next.ties) return next;
  next.ties = next.ties.filter(edge => !selected.has(edge.fromId) && !selected.has(edge.toId));
  if (!next.ties.length) delete next.ties;
  return next;
}

export function workshopMeasureTies(score, partIndex, barIndex) {
  if (!Number.isInteger(partIndex) || !Number.isInteger(barIndex) || partIndex < 0 || barIndex < 0
    || !isValidWorkshopTies(score)) return [];
  const notes = indexNotes(score);
  if (!notes) return [];
  return (score.ties || []).filter(edge => {
    const from = notes.get(edge.fromId); const to = notes.get(edge.toId);
    return from.partIndex === partIndex && (from.barIndex === barIndex || to.barIndex === barIndex);
  }).map(edge => Object.assign({}, edge, {
    fromBarIndex: notes.get(edge.fromId).barIndex, toBarIndex: notes.get(edge.toId).barIndex }));
}

export function findWorkshopTieTarget(score, id) {
  if (!validId(id) || !isValidWorkshopTies(score)) return null;
  const notes = indexNotes(score);
  const from = notes && notes.get(id);
  if (!from) return null;
  const existing = (score.ties || []).find(edge => edge.fromId === id);
  if (existing) return existing.toId;
  const incoming = new Set((score.ties || []).map(edge => edge.toId));
  const matches = Array.from(notes.values()).filter(to => !incoming.has(to.event.id)
    && validEdge({ fromId: id, toId: to.event.id }, notes));
  return matches.length === 1 ? matches[0].event.id : null;
}
