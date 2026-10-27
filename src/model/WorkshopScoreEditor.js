import { cloneWorkshop, workshopId, workshopPitchValue, workshopPitchFromValue,
  workshopMeasureEvents, workshopMeasureUnits, isValidWorkshopMeasure, isValidWorkshopBeamGroup, isValidWorkshopTripletGroup,
  workshopMeasureUnitsLimit, WORKSHOP_MIN_PITCH, WORKSHOP_MAX_PITCH, WORKSHOP_MAX_MEASURE_EVENTS, WORKSHOP_PITCH_ALTERS } from "./Workshop";
import { WORKSHOP_NOTE_UNITS, WORKSHOP_SLOT_STEP, WORKSHOP_TICKS_PER_UNIT,
  workshopEventUnits, workshopRequestedDots, workshopRequestedUnits, workshopTimeTicks, workshopTimeOnGrid, workshopEventVoice, isValidWorkshopTuplet } from "./WorkshopRhythm";

import { isWorkshopGeneratedRest, pruneWorkshopGeneratedRestVoices } from "./WorkshopRests";

export const WORKSHOP_STAFF_GEOMETRY = Object.freeze({
  width: 360, height: 280, left: 90, unitWidth: 31,
  bottomLine: 156, lineStep: 20, pitchStep: 10
});
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const NOTE_VALUES = Object.keys(WORKSHOP_NOTE_UNITS);
const DURATION_CHOICES = NOTE_VALUES.reduce((choices, noteValue) => {
  for (let dots=0;dots<=3;dots++) choices.push(Object.assign({noteValue},dots ? {dots}:{}));
  return choices;
}, []).sort((left, right) => workshopEventUnits(right) - workshopEventUnits(left));
const REFERENCE_STEPS = { treble: 30, bass: 18, alto: 24, tenor: 22 };

export function workshopClefReference(clef = "treble") { return REFERENCE_STEPS[clef]; }

export function workshopStaffGeometry(units = 8, horizontalInset = 0) {
  if (!Number.isFinite(units) || units <= 0 || !workshopTimeOnGrid(units)
    || !Number.isFinite(horizontalInset) || horizontalInset < 0) return null;
  return Object.assign({}, WORKSHOP_STAFF_GEOMETRY, {
    width: WORKSHOP_STAFF_GEOMETRY.width + horizontalInset,
    left: WORKSHOP_STAFF_GEOMETRY.left + horizontalInset, unitWidth: 248 / units
  });
}

function validPitch(pitch) {
  return !!pitch && typeof pitch === "object" && !Array.isArray(pitch)
    && Object.keys(pitch).every(key => ["step", "alter", "octave"].includes(key))
    && STEPS.includes(pitch.step) && WORKSHOP_PITCH_ALTERS.includes(pitch.alter)
    && Number.isInteger(pitch.octave) && pitch.octave >= 0 && pitch.octave <= 8
    && workshopPitchValue(pitch) >= WORKSHOP_MIN_PITCH && workshopPitchValue(pitch) <= WORKSHOP_MAX_PITCH;
}

function pitchAtStep(step, alter) {
  return { step: STEPS[step % 7], alter, octave: Math.floor(step / 7) };
}

export function workshopStaffY(pitch, clef = "treble") {
  if (!validPitch(pitch) || !Object.prototype.hasOwnProperty.call(REFERENCE_STEPS, clef)) return null;
  const step = pitch.octave * 7 + STEPS.indexOf(pitch.step);
  return WORKSHOP_STAFF_GEOMETRY.bottomLine - (step - REFERENCE_STEPS[clef]) * WORKSHOP_STAFF_GEOMETRY.pitchStep;
}

export function workshopPitchAtStaffY(y, alter = 0, clef = "treble") {
  if (!Number.isFinite(y) || !WORKSHOP_PITCH_ALTERS.includes(alter)
    || !Object.prototype.hasOwnProperty.call(REFERENCE_STEPS, clef)) return null;
  const minValue = WORKSHOP_MIN_PITCH;
  const maxValue = WORKSHOP_MAX_PITCH;
  const inRange = pitch => validPitch(pitch)
    && workshopPitchValue(pitch) >= minValue && workshopPitchValue(pitch) <= maxValue;
  let minimum = 0;
  let maximum = 62;
  while (!inRange(pitchAtStep(minimum, alter))) minimum++;
  while (!inRange(pitchAtStep(maximum, alter))) maximum--;
  const step = REFERENCE_STEPS[clef] + Math.round((WORKSHOP_STAFF_GEOMETRY.bottomLine - y) / WORKSHOP_STAFF_GEOMETRY.pitchStep);
  return pitchAtStep(Math.max(minimum, Math.min(maximum, step)), alter);
}

export function workshopSlotAtStaffX(x, units = 8, horizontalInset = 0, gridStep = WORKSHOP_SLOT_STEP) {
  const geometry = workshopStaffGeometry(units, horizontalInset);
  if (!Number.isFinite(x) || !geometry || !(Number.isFinite(gridStep) && gridStep > 0 && gridStep <= WORKSHOP_SLOT_STEP && workshopTimeOnGrid(gridStep))) return null;
  const slot = (x - geometry.left) / geometry.unitWidth - gridStep;
  return Math.max(0, Math.min(units - gridStep, Math.round(slot / gridStep) * gridStep));
}

function restsForUnits(units, startSlot, voice = 1) {
  const events = [];
  let remaining = workshopTimeTicks(units), cursor = workshopTimeTicks(startSlot);
  const plain = NOTE_VALUES.map(noteValue => ({ noteValue, ticks:workshopTimeTicks(WORKSHOP_NOTE_UNITS[noteValue]) }));
  const choices = plain.concat(NOTE_VALUES.map(noteValue => ({ noteValue, tuplet:3,
    ticks:workshopTimeTicks(workshopEventUnits({ noteValue, tuplet:3 })) }))).sort((a,b) => b.ticks - a.ticks);
  while (remaining > 0 && events.length < WORKSHOP_MAX_MEASURE_EVENTS) {
    // A single tick cannot be written with this value catalogue. Keep it as an
    // explicit silent gap instead of inventing a longer rest.
    const available = remaining % 3 === 0 ? plain : choices;
    const choice = available.find(value => value.ticks <= remaining && remaining - value.ticks !== 1);
    if (!choice) break;
    const event = { id:workshopId("rest"), kind:"rest", noteValue:choice.noteValue, pitch:null, autoRest:true,
      startSlot:cursor / WORKSHOP_TICKS_PER_UNIT };
    if (choice.tuplet) event.tuplet = choice.tuplet;
    if (voice !== 1) event.voice = voice;
    events.push(event); cursor += choice.ticks; remaining -= choice.ticks;
  }
  return events;
}

function withoutGroups(event) {
  const result = withoutBeam(event);
  delete result.tupletGroupId;
  return result;
}

function overlaps(left, right) {
  if (left.grace || right.grace) return false;
  return workshopEventVoice(left) === workshopEventVoice(right)
    && workshopTimeTicks(left.startSlot) < workshopTimeTicks(right.startSlot) + workshopTimeTicks(workshopEventUnits(right))
    && workshopTimeTicks(left.startSlot) + workshopTimeTicks(workshopEventUnits(left)) > workshopTimeTicks(right.startSlot);
}

function withoutBeam(event) {
  const result = cloneWorkshop(event);
  delete result.beamGroupId;
  return result;
}

function detachBeams(events, groupIds) {
  return events.map(event => groupIds.has(event.beamGroupId) ? withoutBeam(event) : cloneWorkshop(event));
}

function validUpdates(originals, updates, measure) {
  // A partial replacement cannot validate a beam by itself. Check the note
  // fields independently; group consistency is checked again on the full bar.
  return updates.every(event => !!event && typeof event === "object" && !Array.isArray(event)
      && (!Object.prototype.hasOwnProperty.call(event, "beamGroupId")
        || originals.some(original => original.id === event.id && original.beamGroupId
          && original.beamGroupId === event.beamGroupId)))
    && updates.every(event => !Object.prototype.hasOwnProperty.call(event, "tupletGroupId")
      || originals.some(original => original.id === event.id && original.tupletGroupId === event.tupletGroupId))
    && isValidWorkshopMeasure(Object.assign({}, measure, { events: updates.map(withoutGroups) }));
}

function replacementEvent(event) {
  // A user-edited filler becomes a deliberate rest, including a change of
  // duration/voice which would otherwise leave its generated ID untouched.
  if (event.kind === "rest") return Object.assign(cloneWorkshop(event),{autoRest:false});
  // A deliberate long value leaves its beam even if a close neighbour makes
  // the effective duration short again during completion.
  return event.beamGroupId && !["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth", "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"].includes(event.noteValue)
    ? withoutBeam(event) : cloneWorkshop(event);
}

function repairBeams(events) {
  const result = events.map(cloneWorkshop);
  const groups = Array.from(new Set(events.filter(event => event.beamGroupId).map(event => event.beamGroupId)));
  groups.forEach(groupId => {
    const members = new Set(events.filter(event => event.beamGroupId === groupId).map(event => event.id));
    result.filter(event => members.has(event.id)).forEach(event => { delete event.beamGroupId; });
    const voices = Array.from(new Set(result.filter(event => members.has(event.id)).map(workshopEventVoice)));
    let keptOriginal = false;
    voices.forEach(voice => {
      const onsets = new Map();
      result.filter(event => event.kind === "note" && workshopEventVoice(event) === voice).forEach(event => {
        const tick = workshopTimeTicks(event.startSlot);
        if (!onsets.has(tick)) onsets.set(tick, []);
        onsets.get(tick).push(event);
      });
      const ordered = Array.from(onsets.entries()).sort((a,b) => a[0] - b[0]);
      let run = [], lastEnd = null;
      function finish() {
        if (run.length >= 2) {
          const id = keptOriginal ? workshopId("beam") : groupId;
          const notes = run.reduce((all, onset) => all.concat(onset), []);
          notes.forEach(event => { event.beamGroupId = id; });
          if (isValidWorkshopBeamGroup(result, id)) keptOriginal = true;
          else notes.forEach(event => { delete event.beamGroupId; });
        }
        run = []; lastEnd = null;
      }
      ordered.forEach(([start, notes]) => {
        const eligible = notes.every(event => members.has(event.id) && ["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth", "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"].includes(event.noteValue));
        if (!eligible) { finish(); return; }
        if (lastEnd !== null && (start < lastEnd || start - lastEnd > WORKSHOP_TICKS_PER_UNIT)) finish();
        run.push(notes);
        lastEnd = start + Math.max(...notes.map(event => workshopTimeTicks(workshopEventUnits(event))));
      });
      finish();
    });
  });
  return result;
}

function repairTuplets(events) {
  const result = events.map(cloneWorkshop);
  const groups = Array.from(new Set(result.filter(event => event.tupletGroupId).map(event => event.tupletGroupId)));
  groups.forEach(groupId => {
    if (!isValidWorkshopTripletGroup(result, groupId)) result.filter(event => event.tupletGroupId === groupId).forEach(event => { delete event.tupletGroupId; });
  });
  return result;
}

// Notes and rests complete independently within each voice. A long note in
// another voice is not shortened by a simultaneous melody.
function completeEvents(events,extent,priorityId,measure) {
  const limit=workshopMeasureUnitsLimit(measure),limitTicks=workshopTimeTicks(limit),extentTicks=workshopTimeTicks(extent);
  if (!Number.isFinite(extent) || extent<0 || extentTicks>limitTicks) return null;
  events=pruneWorkshopGeneratedRestVoices(events);
  const result=events.filter(event=>event.kind==="note").map(cloneWorkshop);
  const voices=Array.from(new Set(events.map(workshopEventVoice))); if (!voices.length) voices.push(1);
  const occupied=new Map(voices.map(voice=>[voice,[]]));
  function cover(event) {
    if (event.grace) return;
    occupied.get(workshopEventVoice(event)).push([workshopTimeTicks(event.startSlot),workshopTimeTicks(event.startSlot+workshopEventUnits(event))]);
  }
  function freeSpans(voice,first,end) {
    let cursor=first;const spans=[];
    occupied.get(voice).slice().sort((a,b)=>a[0]-b[0]).forEach(interval=>{
      if (interval[1]<=cursor || interval[0]>=end) return;
      if (interval[0]>cursor) spans.push([cursor,Math.min(interval[0],end)]);
      cursor=Math.min(end,Math.max(cursor,interval[1]));
    });
    if (cursor<end) spans.push([cursor,end]); return spans;
  }
  for (const event of result) {
    if (event.grace) continue;
    const original=event.originalNoteValue||event.noteValue,originalDots=workshopRequestedDots(event),start=workshopTimeTicks(event.startSlot);
    const starts=result.filter(note=>!note.grace && workshopEventVoice(note)===workshopEventVoice(event))
      .map(note=>workshopTimeTicks(note.startSlot)).filter(tick=>tick>start);
    const nextStart=starts.length ? Math.min(...starts) : limitTicks;
    const available=Math.min(workshopTimeTicks(workshopRequestedUnits(event)),nextStart-start);
    const choice=DURATION_CHOICES.find(candidate=>(candidate.dots||0)<=originalDots
      && workshopTimeTicks(workshopEventUnits(Object.assign({},candidate,{tuplet:event.tuplet,twoNoteTremolo:event.twoNoteTremolo})))<=available);
    if (!choice) return null;
    event.noteValue=choice.noteValue;if (choice.dots) event.dots=choice.dots;else delete event.dots;
    if (event.noteValue===original && (event.dots||0)===originalDots) {delete event.originalNoteValue;delete event.originalDots;}
    else {event.originalNoteValue=original;if (originalDots) event.originalDots=originalDots;else delete event.originalDots;}
  }
  result.forEach(cover);
  events.filter(event=>event.kind==="rest").sort((a,b)=>(b.id===priorityId?1:0)-(a.id===priorityId?1:0)).forEach(event=>{
    const first=workshopTimeTicks(event.startSlot),end=first+workshopTimeTicks(workshopEventUnits(event));
    freeSpans(workshopEventVoice(event),first,end).forEach(([start,finish])=>{
      const fragments=start===first && finish===end ? [cloneWorkshop(event)]
        : restsForUnits((finish-start)/WORKSHOP_TICKS_PER_UNIT,start/WORKSHOP_TICKS_PER_UNIT,workshopEventVoice(event));
      // A deliberate rest's onset owns its ID and annotations. Preserve them
      // only when that onset survives; later fragments must not repeat a pedal
      // action or a fermata, nor inherit the old duration/group bookkeeping.
      if (!isWorkshopGeneratedRest(event) && start===first && fragments.length && fragments[0].id!==event.id) {
        const retained=withoutGroups(event);
        ['noteValue','dots','tuplet','tupletDisplay','originalNoteValue','originalDots'].forEach(key=>{delete retained[key];});
        fragments[0]=Object.assign(retained,fragments[0],{id:event.id,autoRest:false});
      }
      fragments.forEach(fragment=>{
        if (!isWorkshopGeneratedRest(event) && fragment.id !== event.id) fragment.autoRest=false;
        result.push(fragment);cover(fragment);
      });
    });
  });
  const required=result.length;
  voices.forEach(voice=>freeSpans(voice,0,extentTicks).forEach(([start,end])=>result.push(...restsForUnits((end-start)/WORKSHOP_TICKS_PER_UNIT,start/WORKSHOP_TICKS_PER_UNIT,voice))));
  if (result.length>WORKSHOP_MAX_MEASURE_EVENTS) result.splice(required);
  result.sort((a,b)=>workshopTimeTicks(a.startSlot)-workshopTimeTicks(b.startSlot));
  const completed=repairBeams(repairTuplets(result));
  return isValidWorkshopMeasure(Object.assign({},measure,{events:completed})) ? completed : null;
}

export function placeWorkshopEvent(measure, startSlot, event) {
  if (!isValidWorkshopMeasure(measure) || !event || typeof event !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(event, "beamGroupId") || Object.prototype.hasOwnProperty.call(event, "tupletGroupId")) return null;
  const updated = Object.assign({}, cloneWorkshop(event), { startSlot });
  if (updated.kind === "rest") updated.autoRest=false;
  if (!isValidWorkshopMeasure(Object.assign({}, measure, { events: [updated] }))) return null;
  const endSlot=startSlot+(event.grace ? 0:workshopEventUnits(event));
  const events = workshopMeasureEvents(measure);
  if (events.some(entry => entry.id === event.id || (event.kind === "rest" && entry.kind === "note"
    && overlaps(entry, updated)))) return null;
  return completeEvents(events.concat([updated]), Math.max(workshopMeasureUnits(measure), endSlot), updated.id, measure);
}

export function replaceWorkshopEvent(measure, eventId, updated) {
  if (!isValidWorkshopMeasure(measure)) return null;
  const events = workshopMeasureEvents(measure);
  if (!events.some(event => event.id === eventId) || !updated || updated.id !== eventId
    || !validUpdates(events, [updated], measure)) return null;
  const others = events.filter(event => event.id !== eventId);
  if (updated.kind === "rest" && others.some(event => event.kind === "note"
    && overlaps(event, updated))) return null;
  return completeEvents(others.concat([replacementEvent(updated)]),
    Math.max(workshopMeasureUnits(measure), updated.startSlot + (updated.grace ? 0 : workshopEventUnits(updated))), updated.id, measure);
}

export function removeWorkshopEvent(measure, eventId) {
  if (!isValidWorkshopMeasure(measure) || !measure.events.some(event => event.id === eventId)) return null;
  const events = workshopMeasureEvents(measure);
  return completeEvents(events.filter(event => event.id !== eventId), workshopMeasureUnits(measure), undefined, measure);
}

export function moveWorkshopNote(measure, eventId, startSlot, pitch) {
  if (!isValidWorkshopMeasure(measure) || !validPitch(pitch)) return null;
  const original = workshopMeasureEvents(measure).find(event => event.id === eventId && event.kind === "note");
  if (!original) return null;
  return replaceWorkshopEvent(measure, eventId, Object.assign({}, original, { startSlot, pitch: cloneWorkshop(pitch) }));
}

export function workshopChordEvents(measure, eventId) {
  if (!isValidWorkshopMeasure(measure)) return [];
  const events = workshopMeasureEvents(measure);
  const anchor = events.find(event => event.id === eventId && event.kind === "note");
  return anchor ? events.filter(event => event.kind === "note" && workshopTimeTicks(event.startSlot) === workshopTimeTicks(anchor.startSlot)
    && workshopEventVoice(event) === workshopEventVoice(anchor)) : [];
}

// Validate the entire replacement before completing the bar. Updating a chord
// must not leave a partially edited group when one of its notes exceeds a limit.
export function replaceWorkshopEvents(measure, updates) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(updates) || !updates.length
    || !validUpdates(workshopMeasureEvents(measure), updates, measure)
    || !updates.every(event => Object.prototype.hasOwnProperty.call(event, "startSlot"))) return null;
  const originals = workshopMeasureEvents(measure);
  const replacements = new Map(updates.map(event => [event.id, event]));
  if (updates.some(event => !originals.some(original => original.id === event.id))) return null;
  const events = originals.map(event => replacements.has(event.id) ? replacementEvent(replacements.get(event.id)) : event);
  const notes = events.filter(event => event.kind === "note");
  if (updates.some(event => event.kind === "rest" && notes.some(note =>
    overlaps(note, event)))) return null;
  return completeEvents(events, Math.max(workshopMeasureUnits(measure), workshopMeasureUnits({ events: updates })), updates[0].id, measure);
}

export function removeWorkshopEvents(measure, eventIds) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(eventIds) || !eventIds.length
    || new Set(eventIds).size !== eventIds.length) return null;
  const events = workshopMeasureEvents(measure);
  const selected = new Set(eventIds);
  if (eventIds.some(eventId => !events.some(event => event.id === eventId))) return null;
  return completeEvents(events.filter(event => !selected.has(event.id)), workshopMeasureUnits(measure), undefined, measure);
}

function beamSelection(measure, eventIds) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(eventIds) || eventIds.length < 2
    || new Set(eventIds).size !== eventIds.length) return null;
  const events = workshopMeasureEvents(measure);
  const selected = new Set(eventIds);
  const members = events.filter(event => selected.has(event.id));
  if (members.length !== eventIds.length || members.some(event => event.kind !== "note")) return null;
  const candidateId = "beam-selection";
  const candidate = events.map(event => selected.has(event.id)
    ? Object.assign({}, event, { beamGroupId: candidateId }) : withoutBeam(event));
  if (!isValidWorkshopBeamGroup(candidate, candidateId)) return null;
  const existingId = members[0].beamGroupId;
  if (existingId && members.every(event => event.beamGroupId === existingId)
    && events.filter(event => event.beamGroupId === existingId).length === members.length) return null;
  return { events, members, selected };
}

export function canJoinWorkshopNotes(measure, eventIds) {
  return !!beamSelection(measure, eventIds);
}

export function joinWorkshopNotes(measure, eventIds) {
  const selection = beamSelection(measure, eventIds);
  if (!selection) return null;
  const groupId = workshopId("beam");
  const events = repairBeams(selection.events.map(event => selection.selected.has(event.id)
    ? Object.assign({}, event, { beamGroupId: groupId }) : cloneWorkshop(event)));
  return isValidWorkshopMeasure(Object.assign({}, measure, { events })) ? events : null;
}

export function splitWorkshopBeams(measure, eventIds) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(eventIds) || !eventIds.length
    || new Set(eventIds).size !== eventIds.length) return null;
  const events = workshopMeasureEvents(measure);
  const selected = new Set(eventIds);
  if (eventIds.some(eventId => !events.some(event => event.id === eventId && event.kind === "note"))) return null;
  const groups = new Set(events.filter(event => selected.has(event.id) && event.beamGroupId).map(event => event.beamGroupId));
  return groups.size ? detachBeams(events, groups) : null;
}

function tripletSelection(measure,eventIds,actual=3,normal=2) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(eventIds) || eventIds.length < actual
    || new Set(eventIds).size !== eventIds.length) return null;
  const events = workshopMeasureEvents(measure), selected = new Set(eventIds);
  const members = events.filter(event => selected.has(event.id));
  if (members.length !== eventIds.length || members.some(event => !["note", "rest"].includes(event.kind) || event.tuplet || event.grace)) return null;
  const first = members[0], voice = workshopEventVoice(first);
  if (members.some(event => workshopEventVoice(event) !== voice || event.noteValue !== first.noteValue
    || (event.dots || 0) !== (first.dots || 0))) return null;
  const starts = Array.from(new Set(members.map(event => workshopTimeTicks(event.startSlot)))).sort((a,b) => a-b);
  if (starts.length !== actual || events.some(event => !isWorkshopGeneratedRest(event) && workshopEventVoice(event) === voice
    && workshopTimeTicks(event.startSlot) >= starts[0] && workshopTimeTicks(event.startSlot) <= starts[starts.length-1] && !selected.has(event.id))) return null;
  const duration = workshopTimeTicks(workshopEventUnits(Object.assign({},first,{tuplet:actual===3 && normal===2 ? 3 : {actual,normal}})));
  const end = starts[0] + actual * duration;
  if (end > workshopTimeTicks(workshopMeasureUnitsLimit(measure))) return null;
  if (events.some(event => !isWorkshopGeneratedRest(event) && workshopEventVoice(event) === voice && !selected.has(event.id)
    && workshopTimeTicks(event.startSlot) < end && workshopTimeTicks(event.startSlot) + workshopTimeTicks(workshopEventUnits(event)) > starts[0])) return null;
  return { events, selected, starts, duration };
}

export function canMakeWorkshopTuplet(measure,eventIds,actual=3,normal=2) {
  const tuplet=actual===3 && normal===2 ? 3 : {actual,normal};
  return isValidWorkshopTuplet(tuplet) && !!tripletSelection(measure,eventIds,actual,normal);
}
export function canMakeWorkshopTriplet(measure,eventIds) { return canMakeWorkshopTuplet(measure,eventIds); }

export function makeWorkshopTriplet(measure,eventIds) { return makeWorkshopTuplet(measure,eventIds,3,2); }
export function makeWorkshopTuplet(measure,eventIds,actual=3,normal=2) {
  const tuplet=actual===3 && normal===2 ? 3 : {actual,normal};
  if (!isValidWorkshopTuplet(tuplet)) return null;
  const selection=tripletSelection(measure,eventIds,actual,normal);
  if (!selection) return null;
  const groupId = workshopId("triplet");
  const events = selection.events.map(event => {
    if (!selection.selected.has(event.id)) return event;
    const changed = Object.assign({}, event, { tuplet, tupletGroupId:groupId,
      startSlot:(selection.starts[0] + selection.starts.indexOf(workshopTimeTicks(event.startSlot)) * selection.duration) / WORKSHOP_TICKS_PER_UNIT });
    // Turning the visible notes into a triplet deliberately commits their value.
    delete changed.originalNoteValue; delete changed.originalDots;
    return changed;
  });
  return completeEvents(events, Math.max(workshopMeasureUnits(measure), workshopMeasureUnits({ events })), undefined, measure);
}

export function splitWorkshopTriplets(measure, eventIds) {
  if (!isValidWorkshopMeasure(measure) || !Array.isArray(eventIds) || !eventIds.length
    || new Set(eventIds).size !== eventIds.length) return null;
  const events = workshopMeasureEvents(measure), selected = new Set(eventIds);
  if (eventIds.some(eventId => !events.some(event => event.id === eventId && ["note", "rest"].includes(event.kind)))) return null;
  const groups = new Set(events.filter(event => selected.has(event.id) && event.tupletGroupId).map(event => event.tupletGroupId));
  const changedIds = new Set(events.filter(event => isValidWorkshopTuplet(event.tuplet) && (selected.has(event.id) || groups.has(event.tupletGroupId))).map(event => event.id));
  if (!changedIds.size) return null;
  const groupStarts = new Map();
  groups.forEach(groupId => groupStarts.set(groupId, Array.from(new Set(events.filter(event => event.tupletGroupId === groupId)
    .map(event => workshopTimeTicks(event.startSlot)))).sort((a,b) => a-b)));
  const next = events.map(event => {
    if (!changedIds.has(event.id)) return cloneWorkshop(event);
    const changed = cloneWorkshop(event);
    const starts = groupStarts.get(event.tupletGroupId);
    delete changed.tuplet; delete changed.tupletGroupId; delete changed.tupletDisplay; delete changed.originalNoteValue; delete changed.originalDots;
    if (starts) changed.startSlot = (starts[0] + starts.indexOf(workshopTimeTicks(event.startSlot)) * workshopTimeTicks(workshopEventUnits(changed))) / WORKSHOP_TICKS_PER_UNIT;
    return changed;
  });
  if (next.some(event => changedIds.has(event.id)
    && workshopTimeTicks(event.startSlot) + workshopTimeTicks(workshopEventUnits(event)) > workshopTimeTicks(workshopMeasureUnitsLimit(measure)))) return null;
  if (next.some(event => changedIds.has(event.id) && next.some(other => !isWorkshopGeneratedRest(other) && other.id !== event.id
    && !(changedIds.has(other.id) && workshopTimeTicks(other.startSlot) === workshopTimeTicks(event.startSlot)) && overlaps(event, other)))) return null;
  return completeEvents(next, Math.max(workshopMeasureUnits(measure), workshopMeasureUnits({ events:next })), undefined, measure);
}

export function moveWorkshopNotes(measure, eventIds, anchorId, startSlot, pitch) {
  if (!isValidWorkshopMeasure(measure) || !validPitch(pitch) || !Array.isArray(eventIds)
    || !eventIds.length || new Set(eventIds).size !== eventIds.length
    || !eventIds.includes(anchorId) || !workshopTimeOnGrid(startSlot)) return null;
  const originals = workshopMeasureEvents(measure);
  const selected = eventIds.map(eventId => originals.find(event => event.id === eventId && event.kind === "note"));
  if (selected.some(event => !event)) return null;
  const anchor = selected.find(event => event.id === anchorId);
  const timeDelta = workshopTimeTicks(startSlot) - workshopTimeTicks(anchor.startSlot);
  const pitchDelta = workshopPitchValue(pitch) - workshopPitchValue(anchor.pitch);
  const updates = selected.map(event => {
    const value = workshopPitchValue(event.pitch) + pitchDelta;
    if (value < WORKSHOP_MIN_PITCH || value > WORKSHOP_MAX_PITCH) return null;
    const movedPitch = event.id === anchorId ? pitch : pitchDelta === 0 ? event.pitch : workshopPitchFromValue(value);
    return Object.assign({}, event, { startSlot: (workshopTimeTicks(event.startSlot) + timeDelta) / WORKSHOP_TICKS_PER_UNIT, pitch: cloneWorkshop(movedPitch) });
  });
  if (updates.some(event => !event)) return null;
  return replaceWorkshopEvents(measure, updates);
}
