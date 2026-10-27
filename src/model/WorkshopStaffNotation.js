import { WORKSHOP_NOTE_UNITS, workshopMeasureEvents, workshopMeasureUnitsLimit } from "./Workshop";
import { workshopEventUnits, workshopMeasureGridStep, workshopEventVoice, workshopTimeTicks, WORKSHOP_TICKS_PER_UNIT } from "./WorkshopRhythm";
import { workshopStaffGeometry, workshopStaffY } from "./WorkshopScoreEditor";
import { layoutWorkshopChords } from "./WorkshopChordLayout";
import { layoutWorkshopAccidentals } from "./WorkshopAccidentals";
import { layoutWorkshopBeams, workshopBeamStemDirections } from "./WorkshopBeamLayout";
import { workshopContextAtSlot, workshopContextChangeSegments } from "./WorkshopContextChanges";
import { workshopKeyAlter, workshopKeySignature } from "./WorkshopTonality";
import { layoutWorkshopRestLanes } from "./WorkshopRestLayout";
import { pruneWorkshopGeneratedRestVoices } from "./WorkshopRests";

function contextClef(view) { return view.effectiveClef || view.clef || view.measure.clef || "treble"; }
function contextMeter(view) { return view.effectiveMeter || view.meter || view.measure.meter || "4/4"; }
function contextKeyId(view) { return view.keyId || view.measure.keyId || "C-major"; }
function contextualMeasure(view) { return Object.assign({},view.measure,{ clef:contextClef(view),meter:contextMeter(view) }); }

function keySignatureWidth(view) {
  if (view.showKey === false) return 0;
  const key=contextKeyId(view),clef=contextClef(view),current=workshopKeySignature(key,clef);
  const cancelled=view.previousKeyId && view.previousKeyId !== key
    ? workshopKeySignature(view.previousKeyId,clef).filter(pitch => workshopKeyAlter(key,pitch.step) !== pitch.alter) : [];
  const count=current.length+cancelled.length;
  return count ? (count*12+8)*(view.notationScale || 1) : 0;
}

function headerOffset(view) {
  if (Number.isFinite(view.headerInset)) return view.headerInset;
  if (Number.isFinite(view.headerLeft)) return view.headerLeft-90;
  const keyStart=view.showClef === false ? 12 : 46;
  const meterWidth=view.showMeter === false ? 0 : Math.max(44,contextMeter(view).split('/')[0].length*16+8);
  return keyStart+keySignatureWidth(view)+meterWidth-90;
}

function visualEvents(view) {
  const owner=Number.isInteger(view.staffIndex) ? view.staffIndex : 0;
  const previewOwner=view.gesture && view.gesture.sourcePartIndex !== undefined ? view.gesture.sourcePartIndex : owner;
  const visible = events => pruneWorkshopGeneratedRestVoices(events,{legacy:view.allowLegacyGeneratedRests === true});
  const own=workshopMeasureEvents({ events:visible(previewOwner === owner && view.previewEvents || view.measure.events) })
    .map(event => Object.assign({},event,{ sourcePartIndex:owner }));
  if (!view.companionMeasure) return own;
  const other=owner === 0 ? 1 : 0;
  return own.filter(event => event.displayStaff === undefined || event.displayStaff === owner).concat(
    workshopMeasureEvents({ events:visible(previewOwner === other && view.previewEvents || view.companionMeasure.events) })
      .filter(event => event.displayStaff === owner).map(event => Object.assign({},event,{ sourcePartIndex:other })));
}

function implicitSilence(source,units,voices) {
  const total=workshopTimeTicks(units),plain=Object.keys(WORKSHOP_NOTE_UNITS).map(noteValue => ({ noteValue,ticks:workshopTimeTicks(WORKSHOP_NOTE_UNITS[noteValue]) }));
  const triplets=plain.map(item => Object.assign({},item,{ tuplet:3,ticks:workshopTimeTicks(WORKSHOP_NOTE_UNITS[item.noteValue]*2/3) }));
  const candidates=plain.concat(triplets).filter(item => item.ticks > 0).sort((a,b) => b.ticks-a.ticks);
  let index=0;
  voices.forEach(voice => {
    const intervals=source.filter(event => !event.grace && workshopEventVoice(event) === voice).map(event => ({
      start:Math.max(0,workshopTimeTicks(event.startSlot)),end:Math.min(total,workshopTimeTicks(event.startSlot)+workshopTimeTicks(workshopEventUnits(event)))
    })).sort((a,b) => a.start-b.start);
    const gaps=[]; let cursor=0;
    intervals.forEach(interval => { if (interval.start > cursor) gaps.push([cursor,interval.start]); cursor=Math.max(cursor,interval.end); });
    if (cursor < total) gaps.push([cursor,total]);
    gaps.forEach(([start,end]) => {
      let position=start,safety=0;
      while (position < end && safety++ < 128) {
        const remaining=end-position;
        const minimumPlain=Math.min(...plain.map(item => item.ticks));
        const choices=remaining%minimumPlain === 0 ? plain.slice().sort((a,b) => b.ticks-a.ticks) : candidates;
        const value=choices.find(item => item.ticks <= remaining);
        if (!value) break;
        const event={ id:"implicit-"+index++,kind:"rest",noteValue:value.noteValue,pitch:null,implicit:true,startSlot:position/WORKSHOP_TICKS_PER_UNIT };
        // Keep the exact silent time segments, but draw one conventional whole
        // measure rest for a completely empty voice, including additive meters.
        // These display fields never enter the source score or audio timeline.
        if (start === 0 && end === total) {
          event.restDisplayValue="whole";
          if (position === 0) event.measureRestUnits=units;
          else event.restHidden=true;
        }
        if (voice !== 1) event.voice=voice; if (value.tuplet) event.tuplet=value.tuplet;
        source.push(event); position+=value.ticks;
      }
    });
  });
}

/** Build the same raw staff notation for Vue views and plain model consumers. */
export function createWorkshopStaffRawNotation(view) {
  const notationScale = Number.isFinite(view.notationScale) && view.notationScale > 0 ? view.notationScale : 1;
  const clef=contextClef(view),units=workshopMeasureUnitsLimit(contextualMeasure(view));
  const geometry=workshopStaffGeometry(units),source=visualEvents(view);
  const gridStep=workshopMeasureGridStep({ events:source },{ noteValue:view.noteValue || "quarter",dots:view.dots || 0,tuplet:view.tuplet || 0 });
  const voice=view.voice || 1;
  const voices=Array.from(new Set(source.map(workshopEventVoice)));
  // Choosing an insertion voice does not create music in that voice.
  if (!voices.length) voices.push(voice);
  const multipleVoices=voices.length > 1;
  implicitSilence(source,units,voices);
  source.sort((a,b) => a.startSlot-b.startSlot);
  const events=source.map(original => {
    const event=view.gesture && !view.gesture.group && view.gesture.eventId === original.id && view.gesture.pitch
      ? Object.assign({},original,{ pitch:view.gesture.pitch }) : original;
    const units=workshopEventUnits(event),startSlot=event.startSlot;
    const displaySlot=view.gesture && !view.gesture.group && view.gesture.eventId === event.id ? view.gesture.slot : startSlot;
    let x=geometry.left+(displaySlot+(event.implicit ? (event.measureRestUnits || units)/2 : gridStep))*geometry.unitWidth;
    if (event.kind === "rest" && gridStep < .25) x=Math.max(geometry.left+7,Math.min(geometry.width-24,x));
    const eventContext=workshopContextAtSlot({contextChanges:view.measure.contextChanges},displaySlot,{clef,keyId:contextKeyId(view)});
    const y=event.pitch ? workshopStaffY(event.pitch,eventContext.clef) : multipleVoices ? workshopEventVoice(event)%2 === 0 ? 136 : 96 : 116;
    const ledgers=[];
    for (let line=176; line <= y; line+=20) ledgers.push(line);
    for (let line=56; line >= y; line-=20) ledgers.push(line);
    const stemDirection=y >= 116 ? 1 : -1;
    return Object.assign({},event,{ x,y,ledgers,displayClef:eventContext.clef,stemDirection,startSlot,displaySlot,endSlot:startSlot+(event.grace ? 0 : units),
      stemX:x+6*notationScale*stemDirection,stemEndY:y-38*notationScale*stemDirection },notationScale !== 1 ? {notationScale,stemOffset:6*notationScale} : {});
  });
  const marked=layoutWorkshopAccidentals(events,contextKeyId(view),view.measure.contextChanges || []);
  const notation=layoutWorkshopRestLanes(layoutWorkshopChords(marked,workshopBeamStemDirections(marked),notationScale));
  const graceGroups=new Map();
  notation.events.filter(event => event.grace).forEach(event => {
    const slot=event.displaySlot === undefined ? event.startSlot : event.displaySlot;
    if (!graceGroups.has(slot)) graceGroups.set(slot,[]);graceGroups.get(slot).push(event);
  });
  graceGroups.forEach((graces,slot) => {
    const anchor=notation.events.filter(event => !event.grace && !event.implicit
      && (event.displaySlot === undefined ? event.startSlot : event.displaySlot) >= slot)
      .sort((a,b) => a.displaySlot-b.displaySlot)[0];
    graces.forEach((event,index) => {
      event.x=Math.max(geometry.left+5,(anchor ? anchor.x : event.x)-(graces.length-index)*15*notationScale);
      event.stemX=event.x+4*notationScale*event.stemDirection;event.stemEndY=event.y-26*notationScale*event.stemDirection;event.accidentalX=event.x-12*notationScale;
      if (notationScale !== 1) event.stemOffset=4*notationScale;
      const stem=notation.stems.find(stem => stem.eventIds.includes(event.id));
      if (stem && stem.eventIds.length > 1) {
        stem.eventIds=stem.eventIds.filter(id => id !== event.id);stem.id=stem.eventIds[0];
        notation.stems.push(Object.assign({},stem,{ id:event.id,eventIds:[event.id],x:event.stemX,y1:event.y,y2:event.stemEndY,grace:true }));
      } else if (stem) Object.assign(stem,{ x:event.stemX,y1:event.y,y2:event.stemEndY,grace:true });
    });
  });
  notation.stems.forEach(stem => {
    const heads=stem.eventIds.map(id => notation.events.find(event => event.id === id));
    if (heads.some(head => head.beamGroupId)) stem.beamGroupId=heads.find(head => head.beamGroupId).beamGroupId;
  });
  const contextChanges=workshopContextChangeSegments({contextChanges:view.measure.contextChanges},Object.assign({clef,keyId:contextKeyId(view)},view.clefOctave!==undefined?{clefOctave:view.clefOctave}:{})).slice(1).map(segment => {
    const hasClef=segment.changedFields.includes("clef") || segment.changedFields.includes('clefOctave'),hasKey=segment.changedFields.includes("keyId");
    const contextScale=Number.isFinite(view.contextScale) && view.contextScale > 0 ? view.contextScale : null;
    const signature=hasKey ? workshopKeySignature(segment.previous.keyId,segment.clef)
      .filter(pitch => workshopKeyAlter(segment.keyId,pitch.step) !== pitch.alter).map(pitch => Object.assign({},pitch,{alter:0}))
      .concat(workshopKeySignature(segment.keyId,segment.clef)) : contextScale && hasClef ? workshopKeySignature(segment.keyId,segment.clef) : [];
    const clefWidth=hasClef ? (contextScale ? 48*contextScale : 30) : 0,width=clefWidth+signature.length*12*(contextScale ? 2*contextScale : notationScale)+8;
    return Object.assign({},segment,{hasClef,signature,clefWidth,width,
      x:Math.max(geometry.left,geometry.left+(segment.startSlot+gridStep)*geometry.unitWidth-width-10)});
  });
  return Object.assign(layoutWorkshopBeams(notation),{ contextChanges,timeGeometry:geometry,timeUnits:units,gridStep,multipleVoices,headerOffset:headerOffset(view) });
}
