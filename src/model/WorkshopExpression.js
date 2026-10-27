import { WORKSHOP_NOTE_UNITS, workshopEventUnits, workshopEventVoice, workshopTimeTicks, workshopTimeOnGrid } from "./WorkshopRhythm";
import { workshopContextAtSlot } from './WorkshopContextChanges';
import { workshopSoundingPitch } from './WorkshopPitchContext';

function validMeter(value) {
  if (typeof value!=="string" || !/^\d{1,2}(?:\+\d{1,2}){0,7}\/\d{1,2}$/.test(value)) return false;
  const [beats,denominator]=value.split("/"),numbers=beats.split("+").map(Number);
  return numbers.every(number=>number>=1 && number<=32) && numbers.reduce((a,b)=>a+b,0)<=64 && [1,2,4,8,16,32,64].includes(Number(denominator));
}
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function validId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

// This leaf module deliberately does not import Workshop: the score validator
// calls it only after validating the structure. Ties share the same tick index.
export function indexWorkshopExpressionNotes(score) {
  if (!plain(score) || !Array.isArray(score.parts) || !score.parts.length) return null;
  const notes = new Map();
  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    if (!plain(part) || !Array.isArray(part.measures)) return null;
    let meter = score.meter, barStart = 0,pitchContext={};
    ['clefOctave','transpose'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(part,key))pitchContext[key]=part[key];});
    for (let barIndex = 0; barIndex < part.measures.length; barIndex++) {
      const bar = part.measures[barIndex];
      if (!plain(bar) || !Array.isArray(bar.events)) return null;
      if (Object.prototype.hasOwnProperty.call(bar, "meter")) meter = bar.meter;
      if (!validMeter(meter)) return null;
      const [beats,denominatorText] = meter.split("/");
      const numerator=beats.split("+").reduce((sum,value)=>sum+Number(value),0),denominator=Number(denominatorText);
      const units = barIndex === 0 && Object.prototype.hasOwnProperty.call(score, "pickupUnits")
        ? score.pickupUnits : numerator * 8 / denominator;
      if (!workshopTimeOnGrid(units) || units <= 0) return null;
      const barTicks = workshopTimeTicks(units), cursors = new Map();
      const startContext=workshopContextAtSlot(bar,0,pitchContext);
      for (const event of bar.events) {
        if (!plain(event)) return null;
        const voice = workshopEventVoice(event);
        const start = Object.prototype.hasOwnProperty.call(event, "startSlot") ? event.startSlot : cursors.get(voice) || 0;
        const duration = workshopEventUnits(event);
        if (!Number.isInteger(voice) || voice < 1 || voice > 4 || !workshopTimeOnGrid(start)
          || !workshopTimeOnGrid(duration) || duration <= 0) return null;
        const startTicks=workshopTimeTicks(start),durationTicks=event.grace ? 0:workshopTimeTicks(duration);
        if (startTicks + durationTicks > barTicks) return null;
        cursors.set(voice,start+(event.grace ? 0:duration));
        if (event.kind !== "note") continue;
        if (!validId(event.id) || !plain(event.pitch) || notes.has(event.id)) return null;
        notes.set(event.id, { event, partIndex, barIndex, voice, slot:start, start: barStart + startTicks,
          end: barStart + startTicks + durationTicks,pitchContext:workshopContextAtSlot(bar,start,startContext) });
      }
      barStart += barTicks;
      pitchContext=workshopContextAtSlot(bar,Infinity,startContext);
    }
  }
  const octaveSpans=score.parts.map(part=>{
    const barIndexes=new Map(part.measures.map((bar,index)=>[bar.id,index]));
    return part.measures.reduce((all,bar,index)=>all.concat((bar.directions||[]).filter(direction=>direction.type==="octaveShift").map(direction=>
      Object.assign({},direction,{startBar:index,endBar:direction.endBarId?barIndexes.get(direction.endBarId):index}))),[]);
  });
  notes.forEach(note=>{
    const partIndex=note.event.displayStaff===undefined || !score.parts[note.event.displayStaff]?note.partIndex:note.event.displayStaff;
    const span=(octaveSpans[partIndex]||[]).filter(direction=>direction.startBar<=note.barIndex && direction.endBar>=note.barIndex
      && (direction.startBar!==note.barIndex || direction.startSlot<=note.slot) && (direction.endBar!==note.barIndex || direction.endSlot>note.slot)).slice(-1)[0];
    let context=note.pitchContext;
    if(partIndex!==note.partIndex) {
      const part=score.parts[partIndex];context={};['clefOctave','transpose'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(part,key))context[key]=part[key];});
      for(let index=0;index<=note.barIndex;index++)context=workshopContextAtSlot(part.measures[index],index===note.barIndex?note.slot:Infinity,context);
    }
    note.soundingPitch=workshopSoundingPitch(note.event.pitch,context,span?span.value:0);
  });
  return notes;
}

function validSlur(edge, notes) {
  if (!plain(edge) || Object.keys(edge).length !== 2
    || !Object.prototype.hasOwnProperty.call(edge, "fromId") || !Object.prototype.hasOwnProperty.call(edge, "toId")
    || !validId(edge.fromId) || !validId(edge.toId) || edge.fromId === edge.toId) return false;
  const from = notes.get(edge.fromId), to = notes.get(edge.toId);
  return !!from && !!to && from.partIndex === to.partIndex && from.voice === to.voice && from.start < to.start;
}

export function isValidWorkshopSlurs(score) {
  if (!plain(score)) return false;
  if (!Object.prototype.hasOwnProperty.call(score, "slurs")) return true;
  if (!Array.isArray(score.slurs)) return false;
  const notes = indexWorkshopExpressionNotes(score), seen = new Set();
  if (!notes) return false;
  for (const edge of score.slurs) {
    if (!validSlur(edge, notes)) return false;
    const key = edge.fromId + ":" + edge.toId;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function repairWorkshopSlurs(score) {
  const next = clone(score);
  if (!plain(next) || !Object.prototype.hasOwnProperty.call(next, "slurs")) return next;
  const notes = indexWorkshopExpressionNotes(next), seen = new Set();
  next.slurs = notes && Array.isArray(next.slurs) ? next.slurs.filter(edge => {
    if (!validSlur(edge, notes)) return false;
    const key = edge.fromId + ":" + edge.toId;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }) : [];
  if (!next.slurs.length) delete next.slurs;
  return next;
}

export function connectWorkshopSlur(score, ids) {
  if (!Array.isArray(ids) || ids.length !== 2 || !ids.every(validId) || ids[0] === ids[1]
    || !isValidWorkshopSlurs(score)) return null;
  const notes = indexWorkshopExpressionNotes(score);
  if (!notes || !notes.has(ids[0]) || !notes.has(ids[1])) return null;
  const ordered = ids.slice().sort((a,b) => notes.get(a).start - notes.get(b).start);
  const edge = { fromId:ordered[0], toId:ordered[1] };
  if (!validSlur(edge, notes)) return null;
  const next = clone(score);
  next.slurs = next.slurs || [];
  if (!next.slurs.some(existing => existing.fromId === edge.fromId && existing.toId === edge.toId)) next.slurs.push(edge);
  return next;
}

export function disconnectWorkshopSlurs(score, ids) {
  if (!Array.isArray(ids) || !ids.every(validId) || !isValidWorkshopSlurs(score)) return null;
  const next = clone(score), selected = new Set(ids);
  if (!next.slurs) return next;
  next.slurs = next.slurs.filter(edge => !selected.has(edge.fromId) && !selected.has(edge.toId));
  if (!next.slurs.length) delete next.slurs;
  return next;
}

export function workshopMeasureSlurs(score, partIndex, barIndex) {
  if (!Number.isInteger(partIndex) || !Number.isInteger(barIndex) || partIndex < 0 || barIndex < 0
    || !isValidWorkshopSlurs(score)) return [];
  const notes = indexWorkshopExpressionNotes(score);
  if (!notes) return [];
  return (score.slurs || []).filter(edge => {
    const from = notes.get(edge.fromId), to = notes.get(edge.toId);
    return from.partIndex === partIndex && (from.barIndex <= barIndex && to.barIndex >= barIndex);
  }).map(edge => ({ fromId:edge.fromId, toId:edge.toId,
    fromBarIndex:notes.get(edge.fromId).barIndex, toBarIndex:notes.get(edge.toId).barIndex,
    voice:notes.get(edge.fromId).voice }));
}

function validGlissando(edge,notes) {
  if (!plain(edge) || Object.keys(edge).some(key=>!["fromId","toId","type"].includes(key))
    || !["glissando","slide"].includes(edge.type)) return false;
  return validSlur({fromId:edge.fromId,toId:edge.toId},notes);
}
export function isValidWorkshopGlissandos(score) {
  if (!plain(score)) return false;
  if (!Object.prototype.hasOwnProperty.call(score,"glissandos")) return true;
  if (!Array.isArray(score.glissandos) || score.glissandos.length>1024) return false;
  const notes=indexWorkshopExpressionNotes(score),seen=new Set();
  return !!notes && score.glissandos.every(edge=>{
    if (!validGlissando(edge,notes)) return false;
    const key=edge.fromId+":"+edge.toId;
    if (seen.has(key)) return false;seen.add(key);return true;
  });
}
export function repairWorkshopGlissandos(score) {
  const next=clone(score);
  if (!plain(next) || !Object.prototype.hasOwnProperty.call(next,"glissandos")) return next;
  const notes=indexWorkshopExpressionNotes(next),seen=new Set();
  next.glissandos=notes && Array.isArray(next.glissandos) ? next.glissandos.filter(edge=>{
    const key=edge && edge.fromId+":"+edge.toId;
    if (!validGlissando(edge,notes) || seen.has(key)) return false;seen.add(key);return true;
  }) : [];
  if (!next.glissandos.length) delete next.glissandos;return next;
}
export function connectWorkshopGlissando(score,ids,type="glissando") {
  if (!Array.isArray(ids) || ids.length!==2 || !ids.every(validId) || !["glissando","slide"].includes(type)) return null;
  const notes=indexWorkshopExpressionNotes(score);
  if (!notes || !ids.every(id=>notes.has(id))) return null;
  const ordered=ids.slice().sort((a,b)=>notes.get(a).start-notes.get(b).start),edge={fromId:ordered[0],toId:ordered[1],type};
  if (!validGlissando(edge,notes)) return null;
  const next=clone(score);next.glissandos=(next.glissandos||[]).filter(item=>item.fromId!==edge.fromId || item.toId!==edge.toId).concat([edge]);return next;
}
export function disconnectWorkshopGlissandos(score,ids) {
  if (!Array.isArray(ids) || !ids.every(validId)) return null;
  const next=clone(score),selected=new Set(ids);
  if (next.glissandos) {next.glissandos=next.glissandos.filter(edge=>!selected.has(edge.fromId) && !selected.has(edge.toId));if (!next.glissandos.length) delete next.glissandos;}
  return next;
}
export function workshopMeasureGlissandos(score,partIndex,barIndex) {
  if (!isValidWorkshopGlissandos(score)) return [];
  const notes=indexWorkshopExpressionNotes(score);if (!notes) return [];
  return (score.glissandos||[]).filter(edge=>{const from=notes.get(edge.fromId),to=notes.get(edge.toId);return from.partIndex===partIndex && from.barIndex<=barIndex && to.barIndex>=barIndex;})
    .map(edge=>Object.assign({},edge,{fromBarIndex:notes.get(edge.fromId).barIndex,toBarIndex:notes.get(edge.toId).barIndex,
      sourcePartIndex:notes.get(edge.fromId).partIndex,voice:notes.get(edge.fromId).voice,
      fromPitch:clone(notes.get(edge.fromId).event.pitch),toPitch:clone(notes.get(edge.toId).event.pitch)}));
}

const TREMOLO_VALUES=Object.keys(WORKSHOP_NOTE_UNITS);
function validTremolo(edge,notes) {
  if (!plain(edge) || Object.keys(edge).some(key=>!["fromId","toId","marks"].includes(key)) || !Number.isInteger(edge.marks) || edge.marks<1 || edge.marks>4
    || !validSlur({fromId:edge.fromId,toId:edge.toId},notes)) return false;
  const from=notes.get(edge.fromId),to=notes.get(edge.toId);
  return from.barIndex===to.barIndex && from.end===to.start && from.end-from.start===to.end-to.start
    && [from.event,to.event].every(event=>event.twoNoteTremolo===true && !event.grace && !event.ornament && !event.beamGroupId && !event.tupletGroupId
      && TREMOLO_VALUES.indexOf(event.noteValue)<TREMOLO_VALUES.length-1);
}
export function isValidWorkshopTremolos(score) {
  if (!plain(score)) return false;
  const notes=indexWorkshopExpressionNotes(score);if (!notes) return false;
  const edges=score.tremolos===undefined ? []:score.tremolos,used=new Set();
  if (!Array.isArray(edges) || edges.length>1024 || !edges.every(edge=>{
    if (!validTremolo(edge,notes) || used.has(edge.fromId) || used.has(edge.toId)) return false;
    if ((score.ties||[]).some(tie=>[tie.fromId,tie.toId].some(id=>id===edge.fromId || id===edge.toId))) return false;
    used.add(edge.fromId);used.add(edge.toId);return true;
  })) return false;
  return Array.from(notes.values()).every(note=>!note.event.twoNoteTremolo || used.has(note.event.id));
}
function clearTwoNoteTremolo(event) {
  if (!event.twoNoteTremolo) return;
  const index=TREMOLO_VALUES.indexOf(event.noteValue);
  if (index>=0 && index<TREMOLO_VALUES.length-1) event.noteValue=TREMOLO_VALUES[index+1];
  delete event.twoNoteTremolo;
}
export function repairWorkshopTremolos(score) {
  const next=clone(score),notes=indexWorkshopExpressionNotes(next),used=new Set();
  if (!notes) return next;
  next.tremolos=(Array.isArray(next.tremolos)?next.tremolos:[]).filter(edge=>{
    if (!validTremolo(edge,notes) || used.has(edge.fromId) || used.has(edge.toId)
      || (next.ties||[]).some(tie=>[tie.fromId,tie.toId].some(id=>id===edge.fromId || id===edge.toId))) return false;
    used.add(edge.fromId);used.add(edge.toId);return true;
  });
  notes.forEach(note=>{if (!used.has(note.event.id)) clearTwoNoteTremolo(note.event);});
  if (!next.tremolos.length) delete next.tremolos;return next;
}
export function connectWorkshopTremolo(score,ids,marks=3) {
  if (!Array.isArray(ids) || ids.length!==2 || !ids.every(validId) || !Number.isInteger(marks) || marks<1 || marks>4) return null;
  const next=clone(score),notes=indexWorkshopExpressionNotes(next);if (!notes || !ids.every(id=>notes.has(id))) return null;
  const ordered=ids.slice().sort((a,b)=>notes.get(a).start-notes.get(b).start),edge={fromId:ordered[0],toId:ordered[1],marks};
  const existing=(next.tremolos||[]).find(item=>item.fromId===edge.fromId && item.toId===edge.toId);
  if (!existing) {
    if ((next.tremolos||[]).some(item=>ids.includes(item.fromId) || ids.includes(item.toId))) return null;
    for (const id of ordered) {
      const event=notes.get(id).event,index=TREMOLO_VALUES.indexOf(event.noteValue);
      if (index<=0 || event.twoNoteTremolo || event.grace || event.ornament || event.beamGroupId || event.tupletGroupId) return null;
      event.noteValue=TREMOLO_VALUES[index-1];event.twoNoteTremolo=true;
      delete event.originalNoteValue;delete event.originalDots;
    }
  }
  next.tremolos=(next.tremolos||[]).filter(item=>item!==existing).concat([edge]);
  return isValidWorkshopTremolos(next) ? next:null;
}
export function disconnectWorkshopTremolos(score,ids) {
  if (!Array.isArray(ids) || !ids.every(validId)) return null;
  const next=clone(score),selected=new Set(ids);
  if (next.tremolos) next.tremolos=next.tremolos.filter(edge=>!selected.has(edge.fromId) && !selected.has(edge.toId));
  return repairWorkshopTremolos(next);
}
export function workshopMeasureTremolos(score,partIndex,barIndex) {
  if (!isValidWorkshopTremolos(score)) return [];
  const notes=indexWorkshopExpressionNotes(score);
  return (score.tremolos||[]).filter(edge=>{const from=notes.get(edge.fromId);return from.partIndex===partIndex && from.barIndex===barIndex;})
    .map(edge=>Object.assign({},edge,{fromBarIndex:barIndex,toBarIndex:barIndex,sourcePartIndex:partIndex,voice:notes.get(edge.fromId).voice}));
}

export const WORKSHOP_DYNAMIC_LEVELS = Object.freeze({ ppp:0.12, pp:0.2, p:0.35, mp:0.55, mf:0.7, f:0.85, ff:1, fff:1, sf:1, sfz:1, fp:0.35 });
export function workshopExpressionVolume(appVolume, dynamic = "mf", articulations = []) {
  const numeric = Number(appVolume);
  const base = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 100;
  const level = Number.isFinite(dynamic) ? Math.max(0,Math.min(1,dynamic)) : Object.prototype.hasOwnProperty.call(WORKSHOP_DYNAMIC_LEVELS, dynamic) ? WORKSHOP_DYNAMIC_LEVELS[dynamic] : WORKSHOP_DYNAMIC_LEVELS.mf;
  return Math.max(0, Math.min(base, base * level * (articulations.includes("strong-accent") ? 1.35 : articulations.includes("accent") ? 1.2 : 1)));
}
