/** Interpolate engraved note columns against the performed (including repeats) timeline. */
export function createWorkshopStreamPosition(system,timeline,notationForBar,options={}) {
  let x=0;
  const points=new Map(),bars=[];
  const eventsByMeasure=new Map();
  (timeline.events || []).forEach(event=>{
    if (!eventsByMeasure.has(event.measureIndex)) eventsByMeasure.set(event.measureIndex,[]);
    eventsByMeasure.get(event.measureIndex).push(event);
  });
  const noteMaps=new Map();
  timeline.measures.forEach((measure,measureIndex)=>{
    const source=system.bars[measure.index];
    if (!source) return;
    if (!noteMaps.has(measure.index)) {
      const notes=new Map();notationForBar(source).forEach(event=>{
        if (event.id && !event.implicit && !notes.has(event.id)) notes.set(event.id,event.x);
      });noteMaps.set(measure.index,notes);
    }
    const notes=noteMaps.get(measure.index),onsets=new Map();
    (eventsByMeasure.get(measureIndex) || []).forEach(event=>{
      if (!notes.has(event.id)) return;
      const at=Math.max(measure.startMs,Math.min(measure.endMs,event.startMs));
      const column=x+notes.get(event.id);
      onsets.set(at,onsets.has(at) ? Math.min(onsets.get(at),column) : column);
    });
    const first=x+source.headerLeft+16;
    points.set(measure.startMs,first);
    Array.from(onsets.entries()).sort((a,b)=>a[0]-b[0]).forEach(([time,column])=>points.set(time,column));
    points.set(measure.endMs,x+source.width-12);
    bars.push(Object.assign({},source,{x,measureIndex,startMs:measure.startMs,endMs:measure.endMs}));
    x+=source.width;
  });
  let previous=-Infinity;
  const anchors=Array.from(points.entries()).sort((a,b)=>a[0]-b[0]).map(([time,column])=>{
    // Ornaments share a head but have several sounding onsets. Keep seeking monotonic.
    previous=Math.max(previous+1e-6,column);return Object.freeze({time,x:previous});
  });
  const result={bars:Object.freeze(bars),anchors:Object.freeze(anchors),width:x,durationMs:timeline.durationMs};
  // Practice keeps every performed note exactly at its engraved column, but
  // changes scrolling speed continuously around space reserved for a header.
  // Listening retains its original linear mapping unless explicitly enabled.
  if(options.smooth === true) result.motionSegments=createMotionSegments(anchors);
  return Object.freeze(result);
}
function segmentAt(anchors,value,from) {
  let low=0,high=anchors.length-1;
  while (low+1<high) {const mid=(low+high)>>1;if (anchors[mid][from]<=value) low=mid;else high=mid;}
  return low;
}
function interpolate(anchors,value,from,to) {
  if (!anchors.length) return 0;
  if (value<=anchors[0][from]) return anchors[0][to];
  if (value>=anchors[anchors.length-1][from]) return anchors[anchors.length-1][to];
  const low=segmentAt(anchors,value,from),high=low+1;
  const a=anchors[low],b=anchors[high];return a[to]+(value-a[from])/(b[from]-a[from])*(b[to]-a[to]);
}
function createMotionSegments(anchors) {
  const count=anchors.length-1;
  if(count<1) return Object.freeze([]);
  const durations=[],speeds=[];
  for(let index=0;index<count;index++) {
    const left=anchors[index],right=anchors[index+1],duration=right.time-left.time;
    durations.push(duration);speeds.push((right.x-left.x)/duration);
  }
  const slopes=new Array(count+1);
  if(count===1) slopes[0]=slopes[1]=speeds[0];
  else {
    // Monotone piecewise cubic Hermite slopes: a weighted harmonic mean
    // avoids overshooting very close ornament columns beside wide headers.
    slopes[0]=Math.max(0,Math.min(3*speeds[0],((2*durations[0]+durations[1])*speeds[0]-durations[0]*speeds[1])/(durations[0]+durations[1])));
    slopes[count]=Math.max(0,Math.min(3*speeds[count-1],((2*durations[count-1]+durations[count-2])*speeds[count-1]-durations[count-1]*speeds[count-2])/(durations[count-1]+durations[count-2])));
    for(let index=1;index<count;index++) {
      const previous=speeds[index-1],next=speeds[index],first=2*durations[index]+durations[index-1],second=durations[index]+2*durations[index-1];
      slopes[index]=previous>0 && next>0 ? (first+second)/(first/previous+second/next) : 0;
    }
  }
  return Object.freeze(speeds.map((speed,index)=>{
    if(!Number.isFinite(speed) || speed<=0 || !Number.isFinite(slopes[index]) || !Number.isFinite(slopes[index+1])) return null;
    const start=slopes[index]/speed,end=slopes[index+1]/speed;
    return Object.freeze({start,quadratic:3-2*start-end,cubic:start+end-2});
  }));
}
function curveAt(segment,fraction) {
  return Math.max(0,Math.min(1,fraction*(segment.start+fraction*(segment.quadratic+fraction*segment.cubic))));
}
export function workshopStreamXAtTime(layout,time) {
  const anchors=layout.anchors;
  if(!layout.motionSegments || anchors.length<2 || time<=anchors[0].time || time>=anchors[anchors.length-1].time) return interpolate(anchors,time,'time','x');
  const index=segmentAt(anchors,time,'time'),segment=layout.motionSegments[index];
  if(!segment) return interpolate(anchors,time,'time','x');
  const left=anchors[index],right=anchors[index+1];
  return left.x+(right.x-left.x)*curveAt(segment,(time-left.time)/(right.time-left.time));
}
export function workshopStreamTimeAtX(layout,x) {
  const anchors=layout.anchors;
  if(!layout.motionSegments || anchors.length<2 || x<=anchors[0].x || x>=anchors[anchors.length-1].x) return interpolate(anchors,x,'x','time');
  const index=segmentAt(anchors,x,'x'),segment=layout.motionSegments[index];
  if(!segment) return interpolate(anchors,x,'x','time');
  const left=anchors[index],right=anchors[index+1],target=(x-left.x)/(right.x-left.x);
  // The same polynomial must be inverted when dragging or seeking. Newton
  // steps stay inside a shrinking bracket, including nearly flat ornaments.
  let low=0,high=1,fraction=target;
  for(let attempt=0;attempt<40;attempt++) {
    const value=curveAt(segment,fraction),error=value-target;
    if(Math.abs(error)<1e-13) break;
    if(error<0) low=fraction;else high=fraction;
    const derivative=segment.start+fraction*(2*segment.quadratic+3*fraction*segment.cubic);
    const candidate=derivative>0 ? fraction-error/derivative : NaN;
    fraction=Number.isFinite(candidate) && candidate>low && candidate<high ? candidate : (low+high)/2;
  }
  return left.time+(right.time-left.time)*fraction;
}
export function workshopStreamMeasureAtTime(layout,time) {
  let low=0,high=layout.bars.length;
  while (low+1<high) {const mid=(low+high)>>1;if (layout.bars[mid].startMs<=time) low=mid;else high=mid;}
  return layout.bars[low] || null;
}
