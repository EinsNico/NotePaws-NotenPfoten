import { cloneWorkshop, isValidWorkshopScore, workshopMeterUnits } from "./Workshop";
import { indexWorkshopExpressionNotes } from "./WorkshopExpression";
import { workshopContextAtSlot } from "./WorkshopContextChanges";
import { withWorkshopRestProvenance } from "./WorkshopRests";
import { workshopTrillLineSpans } from "./WorkshopTrillLines";
import { workshopPedalDirectionSegments } from "./WorkshopPedal";
import { workshopDirectionSpans } from "./WorkshopDirectionSpans";

// The context belongs to one engraving request. It deliberately has no global
// score cache: callers may edit a score in place between requests.
export function createWorkshopRenderContext(score) {
  if (!isValidWorkshopScore(score)) return null;
  const notes=indexWorkshopExpressionNotes(score);
  if (!notes) return null;
  const contexts=[],endContexts=[],measures=[],directionSpans=[],connections=[],lyricVerseNumbers=[];
  score.parts.forEach((part,partIndex)=>{
    let meter=score.meter,clef=part.clef,clefOctave=part.clefOctave || 0,transpose=part.transpose,keyId=part.keyId || score.keyId,dynamic="mf";
    const verses=new Set();
    contexts[partIndex]=[];endContexts[partIndex]=[];measures[partIndex]=[];
    directionSpans[partIndex]=part.measures.map(()=>[]);
    connections[partIndex]=part.measures.map(()=>({ties:[],slurs:[],glissandos:[],tremolos:[]}));
    part.measures.forEach((bar,barIndex)=>{
      if (bar.meter !== undefined) meter=bar.meter;
      if (bar.clef !== undefined) clef=bar.clef;
      if (bar.clefOctave !== undefined) clefOctave=bar.clefOctave;
      if (bar.transpose !== undefined) transpose=bar.transpose;
      if (bar.keyId !== undefined) keyId=bar.keyId;
      if (bar.dynamic !== undefined) dynamic=bar.dynamic;
      const context={meter,clef,keyId,dynamic,units:barIndex === 0 && score.pickupUnits !== undefined ? score.pickupUnits : workshopMeterUnits(meter)};
      if (clefOctave || part.clefOctave !== undefined || bar.clefOctave !== undefined) context.clefOctave=clefOctave;
      if (transpose) context.transpose=cloneWorkshop(transpose);
      contexts[partIndex].push(context);
      const end=workshopContextAtSlot(bar,Infinity,context);
      endContexts[partIndex].push(end);clef=end.clef;clefOctave=end.clefOctave || 0;transpose=end.transpose;keyId=end.keyId;
      bar.events.forEach(event=>{
        if (event.lyrics) event.lyrics.forEach(verse=>verses.add(verse.number));
        else if (event.lyric) verses.add("1");
      });
    });
    lyricVerseNumbers[partIndex]=Array.from(verses).sort((a,b)=>String(a).localeCompare(String(b),"en",{numeric:true}));
    directionSpans[partIndex]=workshopDirectionSpans(score,partIndex,contexts[partIndex].map(context=>context.units));
    workshopTrillLineSpans(score,partIndex).forEach((spans,index)=>directionSpans[partIndex][index].push(...spans));
    workshopPedalDirectionSegments(score,partIndex).forEach((spans,index)=>directionSpans[partIndex][index].push(...spans));
  });
  function add(kind,edge) {
    const from=notes.get(edge.fromId),to=notes.get(edge.toId);
    const descriptor=Object.assign({},edge,{fromBarIndex:from.barIndex,toBarIndex:to.barIndex});
    if (kind !== "ties") descriptor.voice=from.voice;
    if (["glissandos","tremolos"].includes(kind)) descriptor.sourcePartIndex=from.partIndex;
    if (kind === "glissandos") {descriptor.fromPitch=cloneWorkshop(from.event.pitch);descriptor.toPitch=cloneWorkshop(to.event.pitch);}
    if (kind === "ties") {
      connections[from.partIndex][from.barIndex][kind].push(descriptor);
      if (to.barIndex !== from.barIndex) connections[from.partIndex][to.barIndex][kind].push(descriptor);
    } else for (let index=from.barIndex;index<=to.barIndex;index++) connections[from.partIndex][index][kind].push(descriptor);
  }
  ["ties","slurs","glissandos","tremolos"].forEach(kind=>(score[kind] || []).forEach(edge=>add(kind,edge)));
  return {
    score,contexts,endContexts,directionSpans,connections,lyricVerseNumbers,
    measure(partIndex,barIndex) {
      if (!measures[partIndex][barIndex]) {
        const context=contexts[partIndex][barIndex];
        const bar=Object.assign(cloneWorkshop(score.parts[partIndex].measures[barIndex]),{
          meter:context.meter,clef:context.clef,keyId:context.keyId,dynamic:context.dynamic
        });
        if (context.clefOctave !== undefined) bar.clefOctave=context.clefOctave;
        if (context.transpose) bar.transpose=cloneWorkshop(context.transpose);
        if (barIndex === 0 && score.pickupUnits !== undefined) bar.pickupUnits=score.pickupUnits;
        measures[partIndex][barIndex]=withWorkshopRestProvenance(bar,{legacy:!score.musicXml});
      }
      return measures[partIndex][barIndex];
    }
  };
}
