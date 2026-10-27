import { workshopMeasureUnitsLimit } from './Workshop';

/** Trill endpoints are visual annotations; they create no practice attacks. */
export function workshopTrillLineSpans(score,partIndex) {
  const target=score.parts[partIndex];if (!target) return [];
  const result=target.measures.map(()=>[]);
  // Line numbers belong to each stored part. Only the derived drawing follows
  // the displayed start/tr anchor; score ownership and practice attacks stay intact.
  score.parts.forEach((part,ownerIndex)=>{
    if (part.enabled === false) return;
    const open=new Map();let meter=score.meter;
    const limits=part.measures.map((measure,index)=>{meter=measure.meter || meter;return index === 0 && score.pickupUnits !== undefined ? score.pickupUnits : workshopMeasureUnitsLimit(measure,meter);});
    function span(first,last) {
      const displayed=Number.isInteger(first.event.displayStaff) && score.parts[first.event.displayStaff]
        && score.parts[first.event.displayStaff].enabled !== false ? first.event.displayStaff : ownerIndex;
      if (displayed !== partIndex) return;
      for(let index=first.barIndex;index<=last.barIndex;index++) {
        const startSlot=index===first.barIndex ? first.event.startSlot : 0,endSlot=index===last.barIndex ? last.event.startSlot : limits[index];
        if(endSlot<=startSlot) continue;
        result[index].push({id:'trill-'+first.event.id+'-'+index,type:'trillLine',startSlot,endSlot,placement:first.event.ornamentPlacement || 'above',continuation:index!==first.barIndex});
      }
    }
    part.measures.forEach((measure,barIndex)=>measure.events.filter(event=>event.ornamentWavy).slice().sort((a,b)=>a.startSlot-b.startSlot).forEach(event=>{
      const mark=event.ornamentWavy,number=mark.number || 1,anchor={event,barIndex};
      if(mark.type==='start') {
        if(open.has(number)) span(open.get(number),anchor);
        open.set(number,anchor);
      } else if(mark.type==='stop') {
        if(open.has(number)) {span(open.get(number),anchor);open.delete(number);}
      } else if(!open.has(number)) open.set(number,anchor);
    }));
    open.forEach(first=>span(first,{barIndex:part.measures.length-1,event:{startSlot:limits[limits.length-1]}}));
  });
  return result;
}
