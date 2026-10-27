import { createWorkshopHorizontalMapping } from "./WorkshopHorizontalMapping";
import { workshopAccidentalInk } from "./WorkshopAccidentalGlyphs";
import { workshopRestInk } from "./WorkshopRestLayout";
const STAFF_MIDDLE = 116;
const STEM_LENGTH = 38;
const HALF_HEAD_WIDTH = 6;
const MIN_HEAD_X = 97;
const MAX_HEAD_X = 331;
const MIN_ACCIDENTAL_X = 84;
const ACCIDENTAL_DISTANCE = 15;
const ACCIDENTAL_COLUMN_WIDTH = 12;

function directionFor(notes) {
  const top = Math.min(...notes.map(note => note.y));
  const bottom = Math.max(...notes.map(note => note.y));
  return bottom - STAFF_MIDDLE > STAFF_MIDDLE - top ? 1 : -1;
}

function positionHeads(group, baseX, scale = 1) {
  const ordered = group.notes.slice().sort((left, right) => group.direction * (right.y - left.y));
  let previous = null;
  let shifted = false;
  return ordered.map(note => {
    // Adjacent staff positions alternate sides of the shared stem.
    shifted = !!previous && Math.abs(previous.y - note.y) <= 10 && !shifted;
    previous = note;
    return { note, x: baseX + (shifted ? 12 * scale * group.direction : 0) };
  });
}

function sameHeadPosition(left, right, scale = 1) {
  return Math.abs(left.x - right.x) < 14 * scale - 1e-8 && Math.abs(left.note.y - right.note.y) <= 10;
}

function placeGroup(group, baseX, occupied, minimumX, minimumStemX, scale = 1) {
  const relative = positionHeads(group, 0, scale);
  const minimumBase = Math.max(minimumX - Math.min(...relative.map(head => head.x)),
    minimumStemX - HALF_HEAD_WIDTH * scale * group.direction);
  const maximumBase = MAX_HEAD_X - Math.max(...relative.map(head => head.x));
  const candidates = [Math.max(minimumBase, Math.min(maximumBase, baseX)), minimumBase, maximumBase];
  // A closest free position lies either at the desired position, at a paper
  // boundary, or exactly beside an occupied head. Coarse steps waste room.
  relative.forEach(head => occupied.forEach(other => {
    if (Math.abs(head.note.y - other.note.y) <= 10) {
      candidates.push(other.x - 14 * scale - head.x, other.x + 14 * scale - head.x);
    }
  }));
  const ordered = Array.from(new Set(candidates)).filter(candidate => candidate >= minimumBase && candidate <= maximumBase)
    .sort((left, right) => Math.abs(left - baseX) - Math.abs(right - baseX) || right - left);
  for (const candidate of ordered) {
    const heads = relative.map(head => ({ note: head.note, x: head.x + candidate }));
    if (!heads.some(head => occupied.some(other => sameHeadPosition(head, other, scale)))) return heads;
  }
  // A full bar can run out of its initial paper width. Extend it to the right
  // instead of putting later chords on top of the last readable chord. The
  // following ink-spacing pass reserves the wider paper without changing time.
  const forwardMinimum = Math.max(minimumBase, maximumBase, baseX);
  const forward = Array.from(new Set([forwardMinimum].concat(candidates)))
    .filter(candidate => candidate >= forwardMinimum).sort((left, right) => left - right);
  for (const candidate of forward) {
    const heads = relative.map(head => ({ note: head.note, x: head.x + candidate }));
    if (!heads.some(head => occupied.some(other => sameHeadPosition(head, other, scale)))) return heads;
  }
  const clearBase = Math.max(forwardMinimum, ...occupied.map(head => head.x + 14 * scale))
    - Math.min(...relative.map(head => head.x));
  return relative.map(head => ({ note: head.note, x: head.x + clearBase }));
}

function planAccidentals(notes, scale = 1) {
  const columns = [];
  const positions = new Map();
  notes.filter(note => note.accidental).sort((left, right) => left.y - right.y).forEach(note => {
    let column = columns.findIndex(entries => entries.every(y => Math.abs(y - note.y) >= 30 * scale));
    if (column < 0) { column = columns.length; columns.push([]); }
    columns[column].push(note.y);
    positions.set(note.id, column);
  });
  const columnWidth=Math.max(ACCIDENTAL_COLUMN_WIDTH * scale,...notes.filter(note => note.accidental).map(note => {
    const bounds=workshopAccidentalInk(note,0,0,.85 * scale); return Math.ceil(bounds.right-bounds.left+5 * scale);
  }));
  return { positions,columnWidth, minimumHeadX: columns.length
    ? Math.max(MIN_HEAD_X, MIN_ACCIDENTAL_X + ACCIDENTAL_DISTANCE * scale + (columns.length - 1) * columnWidth)
    : MIN_HEAD_X };
}

function notationGroups(notes, multipleVoices) {
  const groups = [];
  notes.forEach(note => {
    let group = groups.find(candidate => candidate.noteValue === note.noteValue && candidate.dots === (note.dots || 0)
      && candidate.sourcePartIndex === note.sourcePartIndex && candidate.voice === workshopEventVoice(note) && candidate.grace === !!note.grace && candidate.tuplet === JSON.stringify(note.tuplet || 0)
      && !candidate.notes.some(other => other.y === note.y));
    if (!group) {
      group = { noteValue: note.noteValue, dots: note.dots || 0, voice: workshopEventVoice(note), tuplet: JSON.stringify(note.tuplet || 0),grace:!!note.grace,sourcePartIndex:note.sourcePartIndex, notes: [] };
      groups.push(group);
    }
    group.notes.push(note);
  });
  groups.forEach(group => { group.middle = group.notes.reduce((sum, note) => sum + note.y, 0) / group.notes.length; });
  groups.sort((left, right) => left.middle - right.middle);
  groups.forEach((group, index) => {
    group.direction = multipleVoices ? group.voice % 2 === 1 ? 1 : -1
      : groups.length === 1 ? directionFor(group.notes) : index % 2 === 0 ? 1 : -1;
  });
  return groups;
}

/** Derive notation only. Score positions, durations and pitches stay unchanged. */
export function layoutWorkshopChords(events, stemDirections, notationScale = 1) {
  const scale = Number.isFinite(notationScale) && notationScale > 0 ? notationScale : 1;
  const result = events.map(event => Object.assign({}, event));
  const multipleVoices = new Set(result.filter(event => event.kind === "note").map(workshopEventVoice)).size > 1;
  const onsets = new Map();
  result.filter(event => event.kind === "note").forEach(event => {
    const slot = event.displaySlot === undefined ? event.startSlot : event.displaySlot;
    if (!onsets.has(slot)) onsets.set(slot, []);
    onsets.get(slot).push(event);
  });
  const stems = [];
  const occupied = [];
  let minimumStemX = -Infinity;
  Array.from(onsets.entries()).sort((left, right) => left[0] - right[0]).forEach(([, notes]) => {
    const accidentals = planAccidentals(notes, scale);
    const groups = notationGroups(notes, multipleVoices);
    if (stemDirections) groups.forEach(group => {
      const direction = stemDirections.get(group.notes[0].id);
      if ([1, -1].includes(direction) && group.notes.every(note => stemDirections.get(note.id) === direction)) {
        group.direction = direction;
      }
    });
    const onsetStems = [];
    groups.forEach(group => {
      const heads = placeGroup(group, group.notes[0].x, occupied, accidentals.minimumHeadX, minimumStemX, scale);
      occupied.push(...heads);
      const top = Math.min(...group.notes.map(note => note.y));
      const bottom = Math.max(...group.notes.map(note => note.y));
      const stemX = heads[0].x + HALF_HEAD_WIDTH * scale * group.direction;
      onsetStems.push(stemX);
      const count=["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"].indexOf(group.noteValue)+1;
      const length=Math.max(STEM_LENGTH,count*8+14) * scale;
      const requestedStemEndY = group.direction === 1 ? top - length : bottom + length;
      const stemEndY = scale > 1 || top < 8 || bottom > 270 ? requestedStemEndY : Math.max(8,Math.min(270,requestedStemEndY));
      heads.forEach(head => {
        Object.assign(head.note, { x: head.x, stemDirection: group.direction, stemX, stemEndY });
        if (scale !== 1) Object.assign(head.note,{ notationScale:scale,stemOffset:HALF_HEAD_WIDTH * scale });
      });
      stems.push({ id: group.notes[0].id, noteValue: group.noteValue,
        eventIds: group.notes.map(note => note.id), x: stemX,
        y1: group.direction === 1 ? bottom : top, y2: stemEndY, direction: group.direction });
    });
    minimumStemX = Math.max(minimumStemX, ...onsetStems) + .001;
    const accidentalLeft = Math.min(...notes.map(note => note.x)) - ACCIDENTAL_DISTANCE * scale;
    notes.filter(note => note.accidental).forEach(note => {
      note.accidentalX = accidentalLeft - accidentals.positions.get(note.id) * accidentals.columnWidth;
    });
    notes.filter(note => !note.accidental).forEach(note => { note.accidentalX = note.x - ACCIDENTAL_DISTANCE * scale; });
  });
  return Object.assign({ events: result, stems },scale !== 1 ? { notationScale:scale } : {});
}

const INK_GAP = 3;
const REST_ACCIDENTAL_GAP = 8;
const REST_GAP = 6;
const SHORT_VALUES = ["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth", "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"];

function accidentalInk(note, scale = 1) { return workshopAccidentalInk(note, note.accidentalX || 0, note.y || 0, .85 * scale); }

function verticallyAdjacent(left, right) {
  return left.top < right.bottom + 1 && right.top < left.bottom + 1;
}

function inkGap(left, right, scale = 1) {
  // A short rest's slanted stroke and a natural can look joined on a narrow
  // staff even when their ink bounds do not touch. Keep a visible separation.
  if (left.rest && right.accidental || right.rest && left.accidental) return REST_ACCIDENTAL_GAP * scale;
  return (left.rest && right.rest ? REST_GAP : INK_GAP) * scale;
}

function noteInk(notes, stems, scale = 1) {
  const boxes = [];
  notes.forEach(note => {
    if (note.kind === "rest") {
      if (scale !== 1) { boxes.push(Object.assign(workshopRestInk(note,scale),{rest:true})); return; }
      const short = SHORT_VALUES.indexOf(note.noteValue) + 1;
      const bounds = ["whole", "breve", "long", "maxima"].includes(note.noteValue) ? [-4, 8.5, -.1, 5.2]
        : note.noteValue === "half" ? [-4, 8.5, -5.3, .1]
          : note.noteValue === "quarter" ? [-4.8, 4.1, -13.2, 10.7]
            : short === 1 ? [-4.2, 4.4, -6.9, 8.7]
              : short === 2 ? [-4.9, 6, -6.9, 16.9]
                : short === 3 ? [-5.9, 6.9, -15.2, 16.9]
                  : short === 4 ? [-6.3, 7.7, -15.2, 25.2]
                    : [-6.1, 8.5, short > 5 ? -30 - (short - 6) * 7 : -23.5, 25.2];
      boxes.push({ left: note.x + bounds[0] * scale, right: note.x + bounds[1] * scale, top: note.y + bounds[2] * scale, bottom: note.y + bounds[3] * scale, rest: true });
      return;
    }
    const halfWidth = (note.noteValue === "maxima" ? 10 : note.grace ? 4.5 : 7) * scale;
    const halfHeight = (note.grace ? 3.6 : 6) * scale;
    boxes.push({ left: note.x - halfWidth, right: note.x + halfWidth,
      top: note.y - halfHeight, bottom: note.y + halfHeight });
    (note.ledgers || []).forEach(y => boxes.push({ left: note.x - 11 * scale, right: note.x + 11 * scale, top: y - scale, bottom: y + scale }));
    if (scale !== 1 && note.dots) {
      const radius=note.grace ? 1.5*scale : 2*scale, dotY=(note.y-156)%20 === 0 ? note.y-10 : note.y;
      boxes.push({left:note.x+11*scale,right:note.x+(15+(note.dots-1)*7)*scale,top:dotY-radius,bottom:dotY+radius});
    }
    if (note.noteValue === "breve") boxes.push({ left: note.x - 12 * scale, right: note.x + 12 * scale, top: note.y - 8 * scale, bottom: note.y + 8 * scale });
  });
  stems.forEach(stem => {
    if (["whole", "breve"].includes(stem.noteValue)) return;
    boxes.push({ left: stem.x - scale, right: stem.x + scale,
      top: Math.min(stem.y1, stem.y2) - scale, bottom: Math.max(stem.y1, stem.y2) + scale });
    const flagCount = SHORT_VALUES.indexOf(stem.noteValue) + 1;
    if (flagCount > 0 && !stem.beamed && !stem.beamGroupId) {
      const end = stem.y2 + stem.direction * (20 + (flagCount - 1) * 8) * scale;
      boxes.push({ left: stem.x + (stem.direction > 0 ? -1 : -9) * scale, right: stem.x + (stem.direction > 0 ? 9 : 1) * scale,
        top: Math.min(stem.y2, end) - scale, bottom: Math.max(stem.y2, end) + scale });
    }
  });
  return boxes;
}

function forwardClearance(boxes, occupied, minimum, scale = 1) {
  const forbidden = [];
  boxes.forEach(box => occupied.forEach(other => {
    if (verticallyAdjacent(box, other)) forbidden.push({
      from: other.left - inkGap(box, other, scale) - box.right,
      to: other.right + inkGap(box, other, scale) - box.left
    });
  }));
  forbidden.sort((left, right) => left.from - right.from || left.to - right.to);
  let offset = minimum;
  forbidden.forEach(interval => {
    if (interval.from < offset && interval.to > offset) offset = interval.to;
  });
  return offset;
}

function tightRests(events, scale = 1) {
  const boxes = noteInk(events.filter(event => event.kind === "rest"), [], scale)
    .sort((left, right) => left.left - right.left);
  return boxes.some((box, index) => boxes.slice(index + 1).some(other =>
    verticallyAdjacent(box, other) && other.left < box.right + REST_GAP * scale));
}

function spacingGroups(events, stems, gridStep) {
  const groups = new Map();
  events.filter(event => event.kind === "note" || event.kind === "rest").forEach(note => {
    const slot = (note.displaySlot === undefined ? note.startSlot : note.displaySlot)
      + (note.implicit ? workshopEventUnits(note) / 2 - gridStep : 0);
    const stem = note.grace && stems.find(stem => stem.eventIds.includes(note.id));
    const key = slot + (note.grace ? ":grace:" + (stem ? stem.id : note.id) : note.implicit ? ":rest:" + note.id : ":notes");
    if (!groups.has(key)) groups.set(key, { slot, grace: !!note.grace, notes: [] });
    groups.get(key).notes.push(note);
  });
  return groups;
}

function tightNotation(groups, stems, scale = 1) {
  const occupied = [];
  const ordered = Array.from(groups.values()).sort((left, right) => left.slot - right.slot
    || Number(right.grace) - Number(left.grace));
  for (const group of ordered) {
    const ids = new Set(group.notes.map(note => note.id));
    const ownStems = stems.filter(stem => stem.eventIds.length && stem.eventIds.every(id => ids.has(id)));
    const boxes = noteInk(group.notes, ownStems, scale);
    // Heads within one chord intentionally touch their shared stem. Check the
    // ink of separate time columns, including their stems, ledgers and flags.
    if (forwardClearance(boxes, occupied, 0, scale) > 0) return true;
    occupied.push(...boxes);
  }
  return false;
}

function notationColumns(events) {
  const columns = new Map();
  events.filter(event => event.kind === "note" && !event.grace).forEach(event => {
    const slot = event.displaySlot === undefined ? event.startSlot : event.displaySlot;
    if (!columns.has(slot) || columns.get(slot) > event.x) columns.set(slot, event.x);
  });
  return columns;
}

function applyNotationColumns(events, stems, columns) {
  if (!(columns instanceof Map)) return false;
  const own = notationColumns(events), slots = Array.from(own.keys()).sort((left, right) => left - right);
  let moved = false;
  slots.forEach(slot => {
    const requested = columns.get(slot), current = own.get(slot);
    if (!Number.isFinite(requested) || requested <= current + 1e-8) return;
    const members = events.filter(event => {
      const position = event.displaySlot === undefined ? event.startSlot : event.displaySlot;
      return !event.implicit && (event.grace ? slots.find(anchor => anchor >= position) === slot : position === slot);
    });
    const ids = new Set(members.map(event => event.id));
    members.forEach(event => {
      for (const key of ["x", "stemX", "accidentalX"]) {
        if (Number.isFinite(event[key])) event[key] = requested + (event[key] - current);
      }
    });
    stems.filter(stem => stem.eventIds.every(id => ids.has(id))).forEach(stem => { stem.x = requested + (stem.x - current); });
    moved = true;
  });
  return moved;
}

function contextInk(change) { return {left:change.x,right:change.x+change.width,top:48,bottom:176}; }

function notationWidth(events, stems, contextChanges = [], notation = {}, scale = 1) {
  const ink = noteInk(events, stems, scale).concat(events.filter(event => event.accidental).map(note => accidentalInk(note, scale)),contextChanges.map(contextInk));
  const right = Math.max(0, ...ink.map(box => box.right));
  const anchors=contextChanges.filter(change => !events.some(event => event.kind === "note" && event.startSlot === change.startSlot))
    .map(change => ({kind:"note",startSlot:change.startSlot,x:change.x+change.width+12}));
  const mapping=notation.timeGeometry ? createWorkshopHorizontalMapping(events.concat(anchors),notation.timeGeometry,notation.gridStep,notation.timeUnits) : null;
  const timeRight=mapping ? mapping.anchors[mapping.anchors.length-1].x+22 : 360;
  return Math.max(360,timeRight,right <= 348 ? 360 : Math.ceil(right + 22));
}

/** Reserve ink space after grace placement and before beams are calculated.
 * Only rendered coordinates change; pitches, timing, values and group IDs do
 * not. A genuinely crowded bar can grow instead of piling up at its edge.
 */
export function spaceWorkshopAccidentals(notation, options = {}) {
  const scale = options.notationScale || notation.notationScale || 1;
  // Shared columns constrain a staff's already readable layout. Establish its
  // own grace gaps first when the caller supplied raw, unspaced notation.
  if (options.columns instanceof Map && !(notation.columns instanceof Map)) {
    const own = spaceWorkshopAccidentals(notation, Object.assign({}, options, { columns: null }));
    return spaceWorkshopAccidentals(own, options);
  }
  const events = notation.events.map(event => Object.assign({}, event));
  const stems = notation.stems.map(stem => Object.assign({}, stem, { eventIds: stem.eventIds.slice() }));
  const contextChanges=(notation.contextChanges || []).map(change => Object.assign({},change));
  const result = Object.assign({}, notation, { events, stems, contextChanges, width: 360 });
  const columnsMoved = applyNotationColumns(events, stems, options.columns);
  const gridStep = Number.isFinite(options.gridStep) ? options.gridStep : .5;
  const groups = spacingGroups(events, stems, gridStep);
  if (!events.some(event => event.kind === "note" && event.accidental) && !columnsMoved && !tightRests(events, scale)
    && !tightNotation(groups, stems, scale) && !contextChanges.length && !Number.isFinite(options.leadingContextRight) && scale === 1) {
    result.columns = notationColumns(events);
    result.width = notationWidth(events, stems, contextChanges, notation, scale);
    return result;
  }
  contextChanges.forEach(change => groups.set("context:"+change.id,{slot:change.startSlot,context:change,notes:[]}));
  const ordered = Array.from(groups.values()).sort((left, right) => left.slot - right.slot
    || Number(!!right.context)-Number(!!left.context)
    || Number(right.grace) - Number(left.grace)
    || Math.min(...left.notes.map(note => note.x)) - Math.min(...right.notes.map(note => note.x)));
  const occupied = [];
  let previousStemX = -Infinity;
  // A moving clef/key/meter at the bar boundary owns ink just like an in-bar
  // change. Keep every note/rest/ledger/accidental behind its actual right edge.
  let previousContextRight=Number.isFinite(options.leadingContextRight) ? options.leadingContextRight : -Infinity;
  ordered.forEach(group => {
    if (group.context) {
      const box=contextInk(group.context);
      const minimum=Math.max(0,previousContextRight+3-box.left,...occupied.map(other => other.right+5-box.left));
      const offset=Math.ceil(forwardClearance([box],occupied,minimum,scale));
      group.context.x+=offset; previousContextRight=box.right+offset;
      occupied.push(Object.assign({},box,{left:box.left+offset,right:box.right+offset})); return;
    }
    const ids = new Set(group.notes.map(note => note.id));
    const groupStems = stems.filter(stem => stem.eventIds.length && stem.eventIds.every(id => ids.has(id)));
    const ink = noteInk(group.notes, groupStems, scale);
    const signs = group.notes.filter(note => note.accidental);
    const columns = planAccidentals(group.notes, scale);
    const signAnchor = Math.min(...group.notes.filter(note => note.kind === "note").map(note => note.x)) - ACCIDENTAL_DISTANCE * scale;
    signs.forEach(note => { note.accidentalX = signAnchor - columns.positions.get(note.id) * columns.columnWidth; });
    let signOffset = 0;
    signs.forEach(note => {
      const box = accidentalInk(note, scale);
      ink.filter(other => verticallyAdjacent(box, other)).forEach(other => {
        signOffset = Math.min(signOffset, other.left - inkGap(box, other, scale) - box.right);
      });
    });
    signOffset = Math.floor(signOffset);
    signs.forEach(note => { note.accidentalX += signOffset; });
    const signBoxes = signs.map(note => accidentalInk(note, scale));
    const boxes = ink.concat(signBoxes);
    const minimum = Math.max(0,
      boxes.length ? previousContextRight+5-Math.min(...boxes.map(box => box.left)) : 0,
      signBoxes.length ? MIN_ACCIDENTAL_X - Math.min(...signBoxes.map(box => box.left)) : 0,
      groupStems.length ? previousStemX + .001 - Math.min(...groupStems.map(stem => stem.x)) : 0);
    const offset = Math.ceil(forwardClearance(boxes, occupied, minimum, scale));
    group.notes.forEach(note => {
      note.x += offset;
      if (Number.isFinite(note.stemX)) note.stemX += offset;
      if (Number.isFinite(note.accidentalX)) note.accidentalX += offset;
    });
    groupStems.forEach(stem => { stem.x += offset; });
    if (groupStems.length) previousStemX = Math.max(previousStemX, ...groupStems.map(stem => stem.x));
    boxes.forEach(box => occupied.push(Object.assign({}, box, { left: box.left + offset, right: box.right + offset })));
  });
  const right = Math.max(0, ...occupied.map(box => box.right));
  result.width = Math.max(right <= 348 ? 360 : Math.ceil(right + 22),notationWidth(events,stems,contextChanges,notation,scale));
  result.columns = notationColumns(events);
  return result;
}

/** Keep simultaneous notes vertically aligned across the piano staves. Each
 * staff retains its own accidental and grace spacing; only forward column
 * constraints are shared, so an empty staff cannot collapse its neighbour.
 */
export function spaceWorkshopAccidentalsTogether(notations, optionsArray = []) {
  let spaced = notations.map((notation, index) => spaceWorkshopAccidentals(notation, optionsArray[index] || {}));
  const merged = new Map();
  function mergeColumns() {
    let changed = false;
    spaced.forEach(notation => notation.columns.forEach((x, slot) => {
      if (!merged.has(slot) || x > merged.get(slot) + 1e-8) {
        merged.set(slot, x); changed = true;
      }
    }));
    return changed;
  }
  mergeColumns();
  // The shared constraints move in time order. A displacement can propagate
  // through at most one new onset per pass; proposals use the already spaced
  // layout so earlier grace gaps are preserved during that propagation.
  for (let pass = 0; pass <= merged.size; pass++) {
    spaced = spaced.map((notation, index) => spaceWorkshopAccidentals(notation,
      Object.assign({}, optionsArray[index] || {}, { columns: merged })));
    if (!mergeColumns()) break;
  }
  return { notations: spaced, columns: merged, width: Math.max(360, ...spaced.map(notation => notation.width)) };
}
import { workshopEventVoice, workshopEventUnits } from "./WorkshopRhythm";
