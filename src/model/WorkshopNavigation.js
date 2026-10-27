export const WORKSHOP_NAVIGATION_KINDS=['segno','coda','fine','dc','ds','toCoda'];
const token=value=>typeof value==='string' && value.length>0 && value.length<=64 && value===value.trim() && !/[\u0000-\u001f]/.test(value);
export function workshopNavigationKind(value) {return typeof value==='string'?value:value && value.kind;}
export function workshopNavigationEntry(value) {return typeof value==='string'?{kind:value}:Object.assign({},value,value.passes?{passes:value.passes.slice()}:{});}
export function isValidWorkshopNavigation(values) {
  if(!Array.isArray(values) || !values.length || values.length>16)return false;
  const seen=new Set();
  return values.every(value=>{
    const kind=workshopNavigationKind(value);
    if(!WORKSHOP_NAVIGATION_KINDS.includes(kind))return false;
    if(typeof value!=='string' && (!value || typeof value!=='object' || Array.isArray(value)
      || Object.keys(value).some(key=>!['kind','label','target','passes'].includes(key))
      || value.label!==undefined && (!['segno','coda'].includes(kind) || !token(value.label))
      || value.target!==undefined && (!['ds','toCoda'].includes(kind) || !token(value.target))
      || value.passes!==undefined && (!Array.isArray(value.passes) || !value.passes.length || value.passes.length>8 || new Set(value.passes).size!==value.passes.length || value.passes.some(pass=>!Number.isInteger(pass)||pass<1||pass>8))))return false;
    const entry=workshopNavigationEntry(value),key=[kind,entry.label||'',entry.target||'',(entry.passes||[]).join(',')].join(':');
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
// Keep legacy simple navigation and repeat endings compatible. Named routes are
// checked before playing; each written jump/pass executes once and all walks
// have a hard upper bound, including imported cycles.
export function createWorkshopNavigationOrder(score,maximum=8000) {
  const measures=score.parts[0].measures,order=[],frames=[],usedJumps=new Set(),visits=new Map(),targets=new Map(),firstTargets=new Map();
  let invalid=false;
  measures.forEach((bar,index)=>(bar.navigation||[]).forEach(value=>{
    const entry=workshopNavigationEntry(value);
    if(!['segno','coda'].includes(entry.kind))return;
    if(!firstTargets.has(entry.kind))firstTargets.set(entry.kind,index);
    const key=entry.kind+':'+(entry.label||entry.kind);
    if(targets.has(key) && targets.get(key)!==index && entry.label)invalid=true;
    if(!targets.has(key))targets.set(key,index);
  }));
  const targetFor=entry=>{
    if(entry.kind==='dc')return 0;
    const kind=entry.kind==='ds'?'segno':'coda',target=targets.get(kind+':'+(entry.target||kind));
    return target!==undefined || entry.target ? target : firstTargets.get(kind);
  };
  measures.forEach(bar=>(bar.navigation||[]).forEach(value=>{const entry=workshopNavigationEntry(value);if(entry.target && targetFor(entry)===undefined)invalid=true;}));
  if(invalid)return null;
  const starts=[],endStarts=new Map();
  measures.forEach((bar,index)=>{if(bar.repeatStart)starts.push(index);if(bar.repeatEnd)endStarts.set(index,starts.length?starts.pop():0);});
  let index=0,lastPass=1,jumped=false,steps=0;
  while(index<measures.length && steps++<maximum*16) {
    const bar=measures[index];
    if(bar.repeatStart && !frames.some(frame=>frame.start===index)) {const end=Array.from(endStarts.entries()).find(entry=>entry[1]===index);if(end)frames.push({start:index,end:end[0],pass:1,times:measures[end[0]].repeatEnd});}
    let frame=frames[frames.length-1];
    if(bar.repeatEnd && (!frame || frame.end!==index)) {frame={start:endStarts.get(index)||0,end:index,pass:1,times:bar.repeatEnd};frames.push(frame);}
    const pass=frame?frame.pass:lastPass,included=!bar.ending||bar.ending.includes(pass);
    if(included) {order.push(index);visits.set(index,(visits.get(index)||0)+1);if(order.length>maximum)return null;}
    if(bar.repeatEnd && frame && frame.end===index) {if(frame.pass<frame.times){frame.pass++;lastPass=frame.pass;index=frame.start;continue;}lastPass=frame.pass;frames.pop();}
    const navigation=included?(bar.navigation||[]).map(workshopNavigationEntry):[],currentPass=Math.max(pass,visits.get(index)||1);
    const applies=entry=>!entry.passes||entry.passes.includes(currentPass);
    if(navigation.some(entry=>entry.kind==='fine' && applies(entry) && (jumped||entry.passes)))break;
    const jump=navigation.find(entry=>['dc','ds','toCoda'].includes(entry.kind) && applies(entry)
      && (entry.kind!=='toCoda'||jumped||entry.passes) && !usedJumps.has(index+':'+entry.kind+':'+(entry.target||'')+':'+(entry.passes?currentPass:'once')));
    if(jump) {
      const target=targetFor(jump);
      if(target!==undefined) {usedJumps.add(index+':'+jump.kind+':'+(jump.target||'')+':'+(jump.passes?currentPass:'once'));jumped=true;frames.length=0;lastPass=1;index=target;continue;}
    }
    if(!bar.ending&&!frames.length&&!bar.repeatEnd)lastPass=1;
    index++;
  }
  return steps>=maximum*16?null:order;
}
