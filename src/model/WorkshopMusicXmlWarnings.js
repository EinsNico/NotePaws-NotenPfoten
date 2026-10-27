// Import diagnostics stay outside the score schema. Saved warning codes and
// preserved MusicXML remain compatible with existing pieces and exports.
const diagnostics = new WeakMap();
export function createMusicXmlWarnings(root) {
  const warnings=[], locations=new WeakMap();
  function visit(node,measure=null,ordinal=0) {
    if(node.name==='measure')measure=String(node.attrs.number || ordinal);
    locations.set(node,measure);
    let index=0;
    node.children.forEach(value=>visit(value,measure,value.name==='measure'?++index:0));
  }
  visit(root);
  diagnostics.set(warnings,{locations,entries:new Map()});
  return warnings;
}
export function warnMusicXml(warnings,code,node) {
  if(!warnings.includes(code))warnings.push(code);
  const state=diagnostics.get(warnings);
  if(!state || !node || !['unsupported-notation','unsupported-rhythm'].includes(code))return;
  const attrs=node.attrs || {}, element=node.name;
  const value=(node.children && node.children.length ? '' : String(node.text || '').trim()).slice(0,80);
  const variant=Object.keys(attrs).filter(key=>!['id','default-x','default-y','relative-x','relative-y','color'].includes(key)).slice(0,8).map(key=>key+'='+String(attrs[key]).slice(0,40)).join(', ');
  const values=(node.children || []).filter(value=>['sign','line','fifths','mode','step','alter','octave','actual-notes','normal-notes'].includes(value.name)).map(value=>value.name+'='+value.text.trim().slice(0,40)).join(', ');
  const detail=[value,values,variant].filter(Boolean).join('; '), key=element+':'+detail;
  if(!state.entries.has(key))state.entries.set(key,{element,detail,measures:new Set()});
  const entry=state.entries.get(key), measure=state.locations.get(node) || node.measure;
  if(measure!==undefined && measure!==null)entry.measures.add(String(measure).slice(0,40));
}
export function musicXmlWarningDetails(warnings) {
  const state=diagnostics.get(warnings);
  return state ? Array.from(state.entries.values(),entry=>({element:entry.element,detail:entry.detail,measures:Array.from(entry.measures)})) : [];
}
