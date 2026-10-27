import { workshopStaffContentGeometry,workshopStaffNotation } from "./WorkshopStaff";
import { resolveWorkshopMeasure, workshopMeasureContext, workshopMeasureContextAtSlot } from "../model/Workshop";
import { withWorkshopRestProvenance } from "../model/WorkshopRests";
import { createWorkshopStaffRawNotation as workshopStaffRawNotation } from "../model/WorkshopStaffNotation";
import { spaceWorkshopAccidentalsTogether } from "../model/WorkshopChordLayout";
import { workshopMeasureDirectionSpans } from "../model/WorkshopNotationDirections";
import { layoutWorkshopCrossStaffBeams,layoutWorkshopCrossStaffCurves } from "../model/WorkshopBeamLayout";
import { layoutWorkshopCrossStaffConnections } from "../model/WorkshopConnectionLayout";
import { workshopKeySignature, workshopKeyAlter } from "../model/WorkshopTonality";
import { workshopMeasureTies } from "../model/WorkshopTies";
import { workshopMeasureSlurs, workshopMeasureGlissandos, workshopMeasureTremolos } from "../model/WorkshopExpression";
import { createWorkshopRenderContext } from "../model/WorkshopRenderContext";
import { workshopStreamHeaderGeometry } from "../model/WorkshopStreamContext";
import { createWorkshopNavigationOrder } from "../model/WorkshopNavigation";

function signatureCount(keyId,clef,previousKeyId) {
  const current=workshopKeySignature(keyId,clef);
  const cancelled=previousKeyId && previousKeyId !== keyId
    ? workshopKeySignature(previousKeyId,clef).filter(pitch => workshopKeyAlter(keyId,pitch.step) !== pitch.alter).length : 0;
  return current.length+cancelled;
}

/** Shared engraving for the printable sheet and the continuous listening strip. */
export function createWorkshopSheetSystems(view) {
      const notationScale=view.notationScale || 1;
      const practiceLayout=view.practiceLayout === true;
      const contextScale=practiceLayout && Number.isFinite(view.contextScale) ? view.contextScale : null;
      const range=view.pageRanges[Math.min(view.pageIndex,view.pageRanges.length-1)],start=range.start,end=range.end,result=[];
      const renderContext=createWorkshopRenderContext(view.score);
      // A repeat or navigation jump can restore another clef/key even when
      // its destination has no written change relative to the preceding bar.
      const jumpPredecessors=new Map(),order=contextScale !== null ? createWorkshopNavigationOrder(view.score) : null;
      (order || []).forEach((index,occurrence)=>{
        if(occurrence && order[occurrence-1] !== index-1) {
          if(!jumpPredecessors.has(index)) jumpPredecessors.set(index,new Set());
          jumpPredecessors.get(index).add(order[occurrence-1]);
        }
      });
      const lyricVerseNumbers=new Map(view.activeParts.map(item=>{
        if (renderContext) return [item.index,renderContext.lyricVerseNumbers[item.index]];
        const numbers=new Set();
        item.part.measures.forEach(bar=>bar.events.forEach(event=>{
          if (event.lyrics) event.lyrics.forEach(verse=>numbers.add(verse.number));
          else if (event.lyric) numbers.add('1');
        }));
        return [item.index,Array.from(numbers).sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true}))];
      }));
      for (let first=start; first < end;) {
        let count=Math.min(view.barsPerSystem,end-first);
        const breaks=view.continuous ? [] : (view.scoreLayout.systemBreaks || []).concat(view.scoreLayout.pageBreaks || []);
        for (let offset=1;offset<count;offset++) if (breaks.includes(view.score.parts[0].measures[first+offset].id)) { count=offset;break; }
        const braceSpace=view.activeParts.length > 1 ? 24 : 0;
        const bars=Array.from({ length:count },(_,offset) => {
          const index=first+offset;
          const relation=(kind,helper)=>view.activeParts.reduce((all,item)=>all.concat((renderContext ? renderContext.connections[item.index][index][kind] : helper(view.score,item.index,index))
            .map(edge=>Object.assign({},edge,{sourcePartIndex:item.index}))),[]);
          const allTies=relation("ties",workshopMeasureTies),allSlurs=relation("slurs",workshopMeasureSlurs);
          const allGlissandos=relation("glissandos",workshopMeasureGlissandos),allTremolos=relation("tremolos",workshopMeasureTremolos);
          const parts=view.activeParts.map(item => {
            const context=renderContext ? renderContext.contexts[item.index][index] : workshopMeasureContext(view.score,index,item.index),previous=index > 0 ? renderContext ? renderContext.endContexts[item.index][index-1] : workshopMeasureContextAtSlot(view.score,index-1,Infinity,item.index) : null;
            const jumpEntry=jumpPredecessors.has(index);
            const showClef=offset === 0 || !previous || previous.clef !== context.clef || (previous.clefOctave || 0) !== (context.clefOctave || 0) || jumpEntry;
            const showKey=offset === 0 || !previous || previous.keyId !== context.keyId || contextScale !== null && showClef;
            const showMeter=offset === 0 || !previous || previous.meter !== context.meter || jumpEntry;
            const previousKeyId=previous && previous.keyId !== context.keyId ? previous.keyId : null;
            const signature=showKey ? signatureCount(context.keyId,context.clef,previousKeyId) : 0;
            const headerLeft=12+(showClef ? 34*(contextScale || 1) : 0)+(signature ? (signature*12+8)*(contextScale ? 2*contextScale : notationScale) : 0)+(showMeter ? Math.max(44,context.meter.split('/')[0].length*16+8)*(contextScale || 1) : 0);
            const other=item.index === 0 ? 1 : 0;
            const measure=partIndex=>renderContext ? renderContext.measure(partIndex,index) : withWorkshopRestProvenance(resolveWorkshopMeasure(view.score,index,partIndex),{legacy:!view.score.musicXml});
            return { notationScale,contextScale,partIndex:item.index,context,measure:measure(item.index),showClef,showKey,showMeter,
              companionMeasure:view.score.parts[other] && view.score.parts[other].enabled !== false ? measure(other) : null,
              directionSpans:renderContext ? renderContext.directionSpans[item.index][index] : workshopMeasureDirectionSpans(view.score,item.index,index),
              showDynamic:index === start || Object.prototype.hasOwnProperty.call(item.part.measures[index],"dynamic"),previousKeyId,headerLeft,
              ties:allTies,slurs:allSlurs,glissandos:allGlissandos,tremolos:allTremolos,lyricVerseNumbers:lyricVerseNumbers.get(item.index),sourceLyricVerseNumbers:Array.from(lyricVerseNumbers).reduce((all,entry) => {all[entry[0]]=entry[1];return all;},{}) };
          });
          const headerLeft=Math.max(...parts.map(part => part.headerLeft));
          parts.forEach(part=>{
            let right=contextScale !== null ? workshopStreamHeaderGeometry(part,contextScale).right : -Infinity;
            (jumpPredecessors.get(index) || []).forEach(previousIndex=>{
              const previous=renderContext ? renderContext.endContexts[part.partIndex][previousIndex] : workshopMeasureContextAtSlot(view.score,previousIndex,Infinity,part.partIndex);
              right=Math.max(right,workshopStreamHeaderGeometry(Object.assign({},part,{previousKeyId:previous.keyId}),contextScale).right);
            });
            part.leadingContextRight=Number.isFinite(right) ? right-(headerLeft-90) : null;
          });
          const raw=parts.map(part => workshopStaffRawNotation(Object.assign({},part,{ measure:part.measure,clef:part.context.clef,clefOctave:part.context.clefOctave || 0,
            meter:part.context.meter,keyId:part.context.keyId,headerLeft,staffIndex:part.partIndex })));
          const spacing=spaceWorkshopAccidentalsTogether(raw,raw.map((notation,index) => ({gridStep:notation.gridStep,leadingContextRight:parts[index].leadingContextRight})));
          parts.forEach((part,partIndex)=>{
            part.notation=workshopStaffNotation({notationScale,contextScale,measure:part.measure,clef:part.context.clef,clefOctave:part.context.clefOctave || 0,meter:part.context.meter,keyId:part.context.keyId,
              showClef:part.showClef,showKey:part.showKey,showMeter:part.showMeter,headerLeft,leadingContextRight:part.leadingContextRight,horizontalColumns:spacing.columns,
              staffIndex:part.partIndex,companionMeasure:part.companionMeasure,cachedRawNotation:raw[partIndex]});
          });
          return { index,parts,headerLeft,spacing,width:spacing.width+headerLeft-90,x:0 };
        });
        let y=practiceLayout ? 12 : 24;
        const frames=view.activeParts.map((item,partIndex) => {
          // Use the compact renderer's real notation bounds. A fixed reserve
          // around every owned pitch duplicates its ledger/stem/expression
          // space and also expands the wrong row for cross-staff notes.
          let top=Infinity,bottom=-Infinity;
          bars.forEach(bar => {
            const part=bar.parts[partIndex],geometry=workshopStaffContentGeometry({ notationScale,practiceLayout,measure:part.measure,clef:part.context.clef,clefOctave:part.context.clefOctave || 0,
              meter:part.context.meter,keyId:part.context.keyId,previousKeyId:part.previousKeyId,dynamic:part.context.dynamic,
              showClef:part.showClef,showKey:part.showKey,showMeter:part.showMeter,showDynamic:part.showDynamic,
              headerLeft:bar.headerLeft,horizontalColumns:bar.spacing.columns,cachedNotation:part.notation,ties:part.ties,slurs:part.slurs,glissandos:part.glissandos,tremolos:part.tremolos,barIndex:bar.index,staffIndex:part.partIndex,companionMeasure:part.companionMeasure,
              directionSpans:part.directionSpans,lyricVerseNumbers:part.lyricVerseNumbers,sourceLyricVerseNumbers:part.sourceLyricVerseNumbers });
            bar.width=Math.max(bar.width,geometry.width);
            top=Math.min(top,geometry.top);bottom=Math.max(bottom,geometry.top+geometry.height);
          });
          // Independently enlarged fixed/moving clefs and signatures must fit
          // even when the distance between staff lines is set very small.
          if(contextScale !== null) {
            top=Math.min(top,136-74*contextScale,76-36*contextScale,96-44*contextScale);
            bottom=Math.max(bottom,136+42*contextScale,156+26*contextScale,116+44*contextScale);
            if(bars.some(bar=>bar.parts[partIndex].context.clefOctave || (bar.parts[partIndex].measure.contextChanges || []).some(change=>change.clefOctave))) {
              top=Math.min(top,136-74*contextScale-25,96-44*contextScale-25);
              bottom=Math.max(bottom,136+42*contextScale+20,116+44*contextScale+20);
            }
          }
          top=Math.floor(top/10)*10; bottom=Math.ceil(bottom/10)*10;
          const frame={ top,bottom,height:bottom-top,y }; y+=frame.height+(view.scoreLayout.staffDistance === undefined ? practiceLayout ? 8 : 16 : view.scoreLayout.staffDistance); return frame;
        });
        let x=braceSpace; bars.forEach(bar => { bar.x=x; x+=bar.width; });
        bars.forEach(bar => {
          const events=[],stems=[];
          bar.parts.forEach((part,index) => {
            const frame=frames[index],notation=part.notation;
            notation.events.forEach(event => events.push(Object.assign({},event,{ x:bar.x+event.x,y:frame.y+event.y-frame.top,
              stemX:bar.x+event.stemX,stemEndY:frame.y+event.stemEndY-frame.top,visualStaff:index })));
            notation.stems.forEach(stem => stems.push(Object.assign({},stem,{ x:bar.x+stem.x,y1:frame.y+stem.y1-frame.top,y2:frame.y+stem.y2-frame.top })));
          });
          const gap=frames.length > 1 ? ((frames[0].y+156-frames[0].top)+(frames[1].y+76-frames[1].top))/2 : undefined;
          const ties=bar.parts[0] ? bar.parts[0].ties : [],slurs=bar.parts[0] ? bar.parts[0].slurs : [];
          bar.crossStaff=Object.assign(layoutWorkshopCrossStaffBeams(events,stems,gap,notationScale),layoutWorkshopCrossStaffCurves(events,ties,slurs));
          const connections=layoutWorkshopCrossStaffConnections(events,bar.parts[0] ? bar.parts[0].glissandos : [],bar.parts[0] ? bar.parts[0].tremolos : []);
          bar.crossStaff.curves=bar.crossStaff.curves.concat(connections.curves);
          bar.crossStaff.relationIds=bar.crossStaff.relationIds.concat(connections.relationIds);
        });
        const topLine=frames[0].y+76-frames[0].top,last=frames[frames.length-1],bottomLine=last.y+156-last.top;
        result.push({ firstBar:first,bars,frames,braceSpace,width:x,height:y,topLine,bottomLine,
          barLines:[braceSpace+12].concat(bars.map(bar => bar.x+bar.width-12)) });
        first+=count;
      }
      return result;
}
