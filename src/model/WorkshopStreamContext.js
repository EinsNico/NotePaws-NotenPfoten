import {workshopKeySignature,workshopKeyAlter} from './WorkshopTonality';
import Glyphs from 'abcjs/src/write/creation/glyphs';
const FIELDS=['clef','keyId','meter'];
const different=(a,b)=>FIELDS.filter(field=>a[field] !== b[field] || field === 'clef' && (a.clefOctave || 0) !== (b.clefOctave || 0));

/** The positions and horizontal ink reserved for a moving practice header. */
export function workshopStreamHeaderGeometry(part,scale=1) {
  const context=part.context,clef=16*scale;
  const clefGlyph=context.clef === 'bass' ? 'clefs.F' : ['alto','tenor'].includes(context.clef) ? 'clefs.C' : 'clefs.G';
  const clefRight=clef+Glyphs.getSymbolWidth(clefGlyph)*1.9*scale;
  const keyId=part.showClef ? Math.max(54*scale,clefRight+4*scale) : 20*scale;
  const signature=part.showKey ? (part.previousKeyId && part.previousKeyId !== context.keyId
    ? workshopKeySignature(part.previousKeyId,context.clef).filter(pitch=>workshopKeyAlter(context.keyId,pitch.step) !== pitch.alter).map(pitch=>Object.assign({},pitch,{alter:0})) : [])
    .concat(workshopKeySignature(context.keyId,context.clef)) : [];
  let right=part.showClef ? clefRight : -Infinity;
  signature.forEach((pitch,index)=>{
    const glyph=pitch.alter > 0 ? 'accidentals.sharp' : pitch.alter < 0 ? 'accidentals.flat' : 'accidentals.nat';
    right=Math.max(right,keyId+index*20*scale+Glyphs.getSymbolWidth(glyph)*1.7*scale);
  });
  const characters=Math.max(...context.meter.split('/').map(value=>value.length));
  const meterHalfWidth=(16+Math.max(0,characters-1)*10)*scale;
  const meter=Math.max(part.headerLeft-24*scale,part.showMeter && Number.isFinite(right) ? right+4*scale+meterHalfWidth : -Infinity);
  if(part.showMeter) right=Math.max(right,meter+meterHalfWidth);
  return {clef,keyId,meter,right};
}

/** Resolve written context for each performed occurrence, including repeat jumps. */
export function createWorkshopStreamContexts(layout,options={}) {
  const scale=Number.isFinite(options.contextScale) && options.contextScale > 0 ? options.contextScale : 1;
  const rows=new Map(),changes=[];
  (layout.bars || []).forEach(bar=>bar.parts.forEach(part=>{
    let row=rows.get(part.partIndex);
    if (!row) {
      row={partIndex:part.partIndex,entries:[]};rows.set(part.partIndex,row);
      row.entries.push({applyX:-Infinity,context:Object.assign({},part.context),clefX:null,keyX:null,meterX:null});
    }
    const add=(context,applyX,glyphX,fields,signature)=>{
      if (!fields.length) return;
      const previous=row.entries[row.entries.length-1];
      const entry=Object.assign({},previous,{applyX,context:Object.assign({},context)});
      fields.forEach(field=>{entry[field === 'keyId' ? 'keyX' : field+'X']=glyphX[field];});
      if (fields.includes('keyId')) entry.signature=signature || workshopKeySignature(previous.context.keyId,context.clef)
        .filter(pitch=>workshopKeyAlter(context.keyId,pitch.step) !== pitch.alter).map(pitch=>Object.assign({},pitch,{alter:0}))
        .concat(workshopKeySignature(context.keyId,context.clef));
      if (fields.includes('clef') && !fields.includes('keyId')) {entry.keyX=Number.isFinite(options.contextScale) ? glyphX.keyId : entry.clefX+38*scale;entry.signature=undefined;}
      row.entries.push(entry);
      changes.push(Object.assign({},entry,{id:bar.measureIndex+'-'+part.partIndex+'-'+row.entries.length,partIndex:part.partIndex,fields}));
    };
    const first=Math.min(...part.notation.events.filter(event=>!event.implicit && event.startSlot===0).map(event=>event.x));
    const start=bar.x+(Number.isFinite(first) ? first : bar.headerLeft+16);
    const previousContext=row.entries[row.entries.length-1].context;
    const header=Number.isFinite(options.contextScale) ? workshopStreamHeaderGeometry(Object.assign({},part,{previousKeyId:previousContext.keyId}),scale)
      : {clef:16*scale,keyId:(part.showClef ? 54 : 20)*scale,meter:part.headerLeft-24*scale};
    add(part.context,start,{clef:bar.x+header.clef,keyId:bar.x+header.keyId,meter:bar.x+header.meter},different(row.entries[row.entries.length-1].context,part.context));
    (part.notation.contextChanges || []).forEach(change=>{
      const heads=part.notation.events.filter(event=>!event.implicit && event.startSlot>=change.startSlot);
      const next=heads.length ? Math.min(...heads.map(event=>event.x)) : change.x+change.width+10;
      const context=Object.assign({},part.context,{clef:change.clef,clefOctave:change.clefOctave || 0,keyId:change.keyId});
      add(context,bar.x+next,{clef:bar.x+change.x+2,keyId:bar.x+change.x+change.clefWidth,meter:bar.x+change.x},different(row.entries[row.entries.length-1].context,context),change.signature);
    });
  }));
  return Object.freeze({rows:Object.freeze(Array.from(rows.values()).map(row=>Object.freeze({partIndex:row.partIndex,entries:Object.freeze(row.entries.map(Object.freeze))}))),changes:Object.freeze(changes.map(Object.freeze))});
}

export function workshopStreamContextsAtX(cache,x) {
  return cache.rows.map(row=>{
    let low=0,high=row.entries.length;
    while (low+1<high) {const middle=(low+high)>>1;if(row.entries[middle].applyX<=x)low=middle;else high=middle;}
    return Object.assign({partIndex:row.partIndex},row.entries[low]);
  });
}
