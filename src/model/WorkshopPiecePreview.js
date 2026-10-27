import { cloneWorkshop, workshopMeterUnits } from "./Workshop";

const PREVIEW_MEASURES = 2;
export const MAX_WORKSHOP_PIECE_PREVIEW_MEASURES = 16;
const CONNECTIONS = ["ties", "slurs", "glissandos", "tremolos"];

export function workshopPiecePreviewMeasureCount(requestedCount) {
  return Number.isFinite(requestedCount) && requestedCount > 0
    ? Math.max(1,Math.min(MAX_WORKSHOP_PIECE_PREVIEW_MEASURES,Math.ceil(requestedCount))) : PREVIEW_MEASURES;
}

// A library thumbnail must never run the whole-score renderer on a long song.
// Copy only its opening measures; source XML, archives, credits and page layout
// are intentionally not part of this disposable, read-only engraving input.
export function createWorkshopPiecePreviewScore(score,requestedCount=PREVIEW_MEASURES) {
  if (!score || !Array.isArray(score.parts) || !score.parts.length || score.parts.length > 2
    || !score.parts[0] || !Array.isArray(score.parts[0].measures) || !score.parts[0].measures.length) return null;
  const count=Math.min(workshopPiecePreviewMeasureCount(requestedCount),score.parts[0].measures.length),eventIds=new Set();
  const excerpt={version:score.version,bpm:score.bpm,meter:score.meter,keyId:score.keyId,parts:[]};
  if (score.pickupUnits !== undefined) excerpt.pickupUnits=score.pickupUnits;
  for (const part of score.parts) {
    if (!part || !Array.isArray(part.measures) || part.measures.length < count) return null;
    const copy={id:part.id,clef:part.clef,measures:part.measures.slice(0,count).map(cloneWorkshop)};
    if (part.keyId !== undefined) copy.keyId=part.keyId;
    if (part.enabled !== undefined) copy.enabled=part.enabled;
    if (part.clefOctave !== undefined) copy.clefOctave=part.clefOctave;
    if (part.transpose !== undefined) copy.transpose=cloneWorkshop(part.transpose);
    const barIds=new Set(copy.measures.map(bar=>bar.id));
    let meter=excerpt.meter;
    copy.measures.forEach((bar,index)=>{
      if (bar.meter !== undefined) meter=bar.meter;
      if (!Array.isArray(bar.events)) return;
      bar.events.forEach(event=>eventIds.add(event.id));
      // Navigation targets can be outside the excerpt. The thumbnail is never
      // played, so leave playback jumps out of its isolated score validation.
      delete bar.navigation;
      if (!bar.directions) return;
      bar.directions=bar.directions.map(direction=>{
        if (!direction.endBarId || barIds.has(direction.endBarId)) return direction;
        const last=copy.measures[count-1],endMeter=last.meter || meter;
        const endSlot=count === 1 && excerpt.pickupUnits !== undefined ? excerpt.pickupUnits : workshopMeterUnits(endMeter);
        const shortened=Object.assign({},direction,{endSlot});
        if (index < count-1) shortened.endBarId=last.id;
        else delete shortened.endBarId;
        return shortened;
      }).filter(direction=>direction.endBarId || direction.endSlot === undefined || direction.endSlot > direction.startSlot);
    });
    excerpt.parts.push(copy);
  }
  CONNECTIONS.forEach(kind=>{
    if (!Array.isArray(score[kind])) return;
    const visible=score[kind].filter(edge=>eventIds.has(edge.fromId) && eventIds.has(edge.toId));
    if (visible.length) excerpt[kind]=visible.map(cloneWorkshop);
  });
  // Retain only import provenance, preventing old imported rest-* IDs from
  // being mistaken for automatically generated editor rests. No source bytes
  // or archive payloads are touched, copied or rendered here.
  if (score.musicXml) excerpt.musicXml={sourceXml:"",fingerprint:"",warnings:[]};
  return excerpt;
}
