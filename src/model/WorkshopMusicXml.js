import { createWorkshopDraft, cloneWorkshop, isValidWorkshopScore, workshopId, workshopMeterUnits,
  workshopMeasureContext, workshopMeasureContextAtSlot, workshopMeasureEvents, workshopActiveParts, isValidWorkshopBeamGroup,
  isValidWorkshopTripletGroup, WORKSHOP_MAX_SCORE_MEASURES, WORKSHOP_MAX_MEASURE_EVENTS,
  WORKSHOP_ARTICULATIONS, WORKSHOP_DYNAMICS, workshopPitchValue, WORKSHOP_MIN_PITCH, WORKSHOP_MAX_PITCH, WORKSHOP_PITCH_ALTERS,
  isValidWorkshopSourceUrl, isValidWorkshopSources } from "./Workshop";
import { workshopOrderedContextChanges } from "./WorkshopContextChanges";
import { isValidWorkshopTranspose } from './WorkshopPitchContext';
import { workshopNavigationKind, workshopNavigationEntry } from './WorkshopNavigation';
import { workshopFingerings, WORKSHOP_MAX_FINGERINGS, WORKSHOP_MAX_FINGERING_CHARS } from "./WorkshopFingerings";
import { workshopTupletDisplay, importWorkshopTupletDisplay, exportWorkshopTupletDisplay } from "./WorkshopTupletDisplay";
import { importWorkshopPedalDirections, exportWorkshopPedalDirection } from "./WorkshopPedal";
import { WORKSHOP_EXPRESSION_ORNAMENTS, isValidWorkshopGraceTiming, isValidWorkshopOrnamentWavy, isValidWorkshopSwing, workshopSwingLabel } from "./WorkshopPerformanceDetails";
import { layoutWorkshopAccidentals } from "./WorkshopAccidentals";
import { WORKSHOP_NOTE_UNITS, WORKSHOP_TICKS_PER_UNIT, workshopEventUnits, workshopTimeOnGrid, workshopTimeTicks, workshopRestDurationValues } from "./WorkshopRhythm";
import { withWorkshopRestProvenance, pruneWorkshopGeneratedRestVoices } from "./WorkshopRests";
import { repairWorkshopTies } from "./WorkshopTies";
import { repairWorkshopSlurs, repairWorkshopGlissandos, repairWorkshopTremolos, indexWorkshopExpressionNotes } from "./WorkshopExpression";
import { NOTE_FLOW_TONALITIES } from "./NoteFlowTonality";
import { readMusicXmlArchive, writeMusicXmlArchive, musicXmlUtf8Encode, musicXmlUtf8Decode, WORKSHOP_MUSICXML_MAX_BYTES, WORKSHOP_MUSICXML_MAX_SOURCE_BYTES } from "./WorkshopMusicXmlArchive";
import { parseWorkshopMusicXmlDocument, musicXmlChildren as children, musicXmlChild as child,
  musicXmlText as text, musicXmlNumber as number, musicXmlEscape as esc } from "./WorkshopMusicXmlParser";

import { createMusicXmlWarnings, warnMusicXml as warn, musicXmlWarningDetails } from "./WorkshopMusicXmlWarnings";

const MAX_SOURCE_CHARS = WORKSHOP_MUSICXML_MAX_SOURCE_BYTES;
const SOURCE_FIELD = "notenpfoten-preserved-musicxml";
const NATIVE_FIELD = "notenpfoten-editor-score-v1";
const ASSET_FIELD = "notenpfoten-archive-assets-v1";
const LICENSE_FIELD = "notenpfoten-license";
const SOURCES_FIELD = "notenpfoten-sources-v1";
const TYPES = { maxima:"maxima", long:"long", breve:"breve", whole:"whole", half:"half", quarter:"quarter", eighth:"eighth",
  "16th":"sixteenth", "32nd":"thirtysecond", "64th":"sixtyfourth", "128th":"onetwentyeighth", "256th":"twofiftysixth",
  "512th":"fivehundredtwelfth", "1024th":"onethousandtwentyfourth" };
const REVERSE_TYPES = Object.keys(TYPES).reduce((result,type) => { result[TYPES[type]]=type; return result; },{});
const ORNAMENTS = WORKSHOP_EXPRESSION_ORNAMENTS;
const ACCIDENTALS = { "-2":"flat-flat", "-1.5":"three-quarters-flat", "-1":"flat", "-0.5":"quarter-flat",
  "0":"natural", "0.5":"quarter-sharp", "1":"sharp", "1.5":"three-quarters-sharp", "2":"double-sharp" };
function error(code,message) { const value = new Error(message); value.code=code; throw value; }

function boundedText(value,limit=120) { return String(value || "").slice(0,limit); }
function xmlElement(name,value,attrs="") { return `<${name}${attrs}>${esc(value)}</${name}>`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((result,key) => { if (key!=="musicXml") result[key]=canonical(value[key]); return result; },{});
  return value;
}
export function workshopMusicXmlFingerprint(score,title="") {
  const value=JSON.stringify([canonical(score),title]); let left=0x811c9dc5,right=0x9e3779b9;
  for (let i=0;i<value.length;i++) { left=Math.imul(left ^ value.charCodeAt(i),0x01000193); right=Math.imul(right ^ value.charCodeAt(i),0x85ebca6b); }
  return `${(left>>>0).toString(16)}-${(right>>>0).toString(16)}-${value.length}`;
}
function base64EncodeBytes(bytes) {
  const chunks=[];
  for (let i=0;i<bytes.length;i+=24576)
    chunks.push(btoa(String.fromCharCode.apply(null,bytes.subarray(i,i+24576))));
  return chunks.join("");
}
function base64Encode(value) {return base64EncodeBytes(musicXmlUtf8Encode(value));}
function base64DecodeBytes(value) {
  const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", raw=value.replace(/\s/g,"");
  if (raw.length>4*Math.ceil(MAX_SOURCE_CHARS/3)) error("musicxml-too-large","Preserved MusicXML source is too large");
  if (raw.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) error("invalid-musicxml","Invalid preserved MusicXML source");
  const padding=raw.endsWith("==")?2:raw.endsWith("=")?1:0;
  const size=raw.length/4*3-padding;
  if(size>MAX_SOURCE_CHARS)error("musicxml-too-large","Preserved MusicXML source is too large");
  const out=new Uint8Array(size);let offset=0;
  for (let i=0;i<raw.length;i+=4) {
    const word=chars.indexOf(raw[i])<<18 | chars.indexOf(raw[i+1])<<12 | Math.max(0,chars.indexOf(raw[i+2]))<<6 | Math.max(0,chars.indexOf(raw[i+3]));
    out[offset++]=word>>>16&255; if(raw[i+2]!=="=")out[offset++]=word>>>8&255; if(raw[i+3]!=="=")out[offset++]=word&255;
  }
  return out;
}
function base64Decode(value) {return musicXmlUtf8Decode(base64DecodeBytes(value));}
function assetMetadata(root) {
  const field=children(child(child(root,"identification"),"miscellaneous"),"miscellaneous-field").find(item=>item.attrs.name===ASSET_FIELD);
  if(!field)return null;
  try {
    const parsed=JSON.parse(field.text);
    if(parsed&&typeof parsed.rootPath==="string"&&Array.isArray(parsed.archiveAssets))return parsed;
  }catch(caught){/* The caller checks validity against the score schema. */}
  error("invalid-musicxml","Invalid preserved MusicXML archive assets");
}
function sourceOutput(xml){return xml.replace(/^(\uFEFF?\s*<\?xml\b[^?]*\bencoding\s*=\s*["'])[^"']+(["'])/i,"$1UTF-8$2");}
function sourceInside(xml) {
  let current=xml;
  for(let depth=0;depth<8;depth++) {
    const root=parseWorkshopMusicXmlDocument(current), identification=child(root,"identification"), misc=child(identification,"miscellaneous");
    const field=children(misc,"miscellaneous-field").find(item=>item.attrs.name===SOURCE_FIELD);
    if(!field)return current;
    current=base64Decode(field.text);
    if(musicXmlUtf8Encode(current).length>MAX_SOURCE_CHARS)error("musicxml-too-large","Preserved MusicXML source is too large");
  }
  error("invalid-musicxml","Recursive preserved MusicXML source");
}
function keyFrom(node,warnings) {
  const fifths=number(node,"fifths"), mode=text(node,"mode","major");
  const match=NOTE_FLOW_TONALITIES.find(key=>key.fifths===fifths && key.mode===(mode==="minor"?"minor":"major"));
  if(!match || !["major","minor","none"].includes(mode))warn(warnings,"unsupported-notation",node);
  return match ? match.id : "C-major";
}
function clefFrom(node,warnings) {
  const sign=text(node,"sign"), line=number(node,"line");
  if (sign==="G" && line===2)return "treble";
  if (sign==="F" && line===4)return "bass";
  if (sign==="C" && [3,4].includes(line))return line===3?"alto":"tenor";
  warn(warnings,"unsupported-notation",node); return sign==="F"?"bass":"treble";
}
function meterFrom(node,warnings) {
  const beats=children(node,"beats"), types=children(node,"beat-type");
  const meter=beats.map(item=>item.text.trim()).join("+")+"/"+(types[0]?types[0].text.trim():"");
  if(types.some(item=>item.text.trim()!==(types[0]&&types[0].text.trim())) || !workshopMeterUnits(meter)) { warn(warnings,"unsupported-notation",node); return "4/4"; }
  return meter;
}
function noteDuration(node,duration,grace,warnings,twoNoteTremolo=false) {
  const xmlType=text(node,"type"), dots=children(node,"dot").length, modification=child(node,"time-modification");
  let actual=number(modification,"actual-notes"), normal=number(modification,"normal-notes");
  const value={noteValue:TYPES[xmlType]};
  if (twoNoteTremolo) {
    value.twoNoteTremolo=true;
    if (modification) {actual/=2;if(actual===1&&normal===1) {actual=NaN;normal=NaN;}}
  }
  if(dots>0 && dots<=3)value.dots=dots;
  if(modification && Number.isInteger(actual)&&Number.isInteger(normal)&&actual>=2&&actual<=9&&normal>=2&&normal<=9)
    value.tuplet=actual===3&&normal===2 ? 3 : {actual,normal};
  else if(modification && !(twoNoteTremolo && Number.isNaN(actual)))warn(warnings,"unsupported-rhythm",modification);
  if(dots>3)warn(warnings,"unsupported-rhythm",child(node,"dot"));
  if(value.noteValue && Object.prototype.hasOwnProperty.call(WORKSHOP_NOTE_UNITS,value.noteValue)
    && (grace || Math.abs(workshopEventUnits(value)-duration)<1e-7))return value;
  for(const noteValue of Object.keys(WORKSHOP_NOTE_UNITS)) for(let dot=0;dot<=3;dot++) {
    const candidate={noteValue}; if(dot)candidate.dots=dot;
    if(twoNoteTremolo)candidate.twoNoteTremolo=true;
    if(value.tuplet)candidate.tuplet=value.tuplet;
    if(Math.abs(workshopEventUnits(candidate)-duration)<1e-7) { if(xmlType)warn(warnings,"unsupported-rhythm",child(node,"type")); return candidate; }
  }
  if(grace)return {noteValue:"eighth"};
  error("unsupported-score","This note duration cannot be represented accurately");
}
function measureNodes(root) {
  if(root.name==="score-partwise")return children(root,"part").map(part=>({id:part.attrs.id,measures:children(part,"measure")}));
  if(root.name!=="score-timewise")error("unsupported-score","Only partwise and timewise MusicXML scores are supported");
  const parts=new Map();
  children(root,"measure").forEach(measure=>children(measure,"part").forEach(part=>{
    if(!parts.has(part.attrs.id))parts.set(part.attrs.id,{id:part.attrs.id,measures:[]});
    parts.get(part.attrs.id).measures.push(Object.assign({},part,{attrs:measure.attrs}));
  }));
  return Array.from(parts.values());
}
function musicXmlSourceNoteCount(parts) {
  // A chord tone or grace note is still one source note. Rests (including
  // rests later split into several editor events) are not sounding notes.
  return parts.reduce((total,part)=>total+part.measures.reduce((count,bar)=>
    count+children(bar,"note").filter(note=>!child(note,"rest")).length,0),0);
}
function editorSourceNoteCount(score) {
  // A verified editor envelope restores all its editable parts, even a hand
  // hidden from the printed XML. Count that restored source, not the older
  // preserved original or only the currently visible staves.
  return score.parts.reduce((total,part)=>total+part.measures.reduce((count,bar)=>
    count+bar.events.filter(event=>event.kind==="note").length,0),0);
}
function musicXmlImportResult(score,title,warnings,source,imported) {
  return {score,title,warnings,unsupportedElements:musicXmlWarningDetails(warnings),noteCounts:{source,imported,skipped:source-imported}};
}
function metadataFrom(root,warnings) {
  const metadata={}, identification=child(root,"identification"), work=child(root,"work");
  const title=text(work,"work-title") || text(root,"movement-title"); if(title)metadata.title=boundedText(title,2048);
  const movement=text(work,"work-title") ? text(root,"movement-title") : text(root,"movement-number"); if(movement)metadata.subtitle=boundedText(movement,2048);
  children(identification,"creator").forEach(node=>{
    const mapping={composer:"composer",arranger:"arranger",lyricist:"lyricist"}, field=mapping[node.attrs.type];
    if(field)metadata[field]=boundedText(node.text,2048); else warn(warnings,"unsupported-notation",node);
  });
  const rights=children(identification,"rights").map(node=>node.text.trim()).join(" · "); if(rights)metadata.copyright=boundedText(rights,2048);
  const fields=children(child(identification,"miscellaneous"),"miscellaneous-field"),license=fields.find(node=>node.attrs.name===LICENSE_FIELD);
  if(license)metadata.license=boundedText(license.text,2048);
  const sources=fields.find(node=>node.attrs.name===SOURCES_FIELD);
  if(sources) {
    try {
      const parsed=JSON.parse(sources.text);
      if(isValidWorkshopSources(parsed))metadata.sources=parsed;
      else warn(warnings,"unsupported-notation",sources);
    } catch(caught) { warn(warnings,"unsupported-notation",sources); }
  }
  if(!Object.prototype.hasOwnProperty.call(metadata,"sources")) {
    // MusicXML has a single free-text source element. Only recognized safe
    // links become clickable editor metadata; other source text stays in XML.
    const links=children(identification,"source").flatMap(node=>node.text.split(/\r?\n/).map(value=>value.trim())).filter(isValidWorkshopSourceUrl);
    if(links.length)metadata.sources=Array.from(new Set(links)).slice(0,16).map(url=>({label:"",url}));
  }
  if(children(root,"credit").length)warn(warnings,"layout-approximate");
  return metadata;
}
function layoutFrom(root,warnings) {
  const defaults=child(root,"defaults"), page=child(defaults,"page-layout"), system=child(defaults,"system-layout"), staff=child(defaults,"staff-layout"), appearance={};
  [["pageWidth",page,"page-width"],["pageHeight",page,"page-height"],["staffDistance",staff,"staff-distance"],
    ["systemDistance",system,"system-distance"]].forEach(([key,node,field])=>{ const value=number(node,field); if(Number.isFinite(value)&&value>0)appearance[key]=value; });
  const margins=children(page,"page-margins").find(node=>node.attrs.type==="both") || child(page,"page-margins");
  [["marginLeft","left-margin"],["marginRight","right-margin"],["marginTop","top-margin"],["marginBottom","bottom-margin"]]
    .forEach(([key,field])=>{const value=number(margins,field); if(Number.isFinite(value)&&value>=0)appearance[key]=value;});
  const font=child(defaults,"word-font") || child(defaults,"lyric-font");
  if(font&&font.attrs["font-family"])appearance.fontFamily=boundedText(font.attrs["font-family"]);
  if(font&&Number.isFinite(Number(font.attrs["font-size"])))appearance.fontSize=Number(font.attrs["font-size"]);
  if(defaults)warn(warnings,"layout-approximate");
  return appearance;
}
function checkKnown(node,known,warnings) {
  if(node)node.children.filter(value=>!known.includes(value.name)).forEach(value=>warn(warnings,"unsupported-notation",value));
}
function importFingerings(node,event,warnings) {
  const technicals=children(node,"notations").flatMap(notation=>children(notation,"technical"));
  const entries=[];
  technicals.forEach(technical=>{
    checkKnown(technical,["fingering"],warnings);
    children(technical,"fingering").forEach(mark=>{
      const value=mark.text.trim();
      if(event.kind!=="note" || !value || value.length>WORKSHOP_MAX_FINGERING_CHARS || entries.length>=WORKSHOP_MAX_FINGERINGS) {
        warn(warnings,"unsupported-notation",mark);return;
      }
      const entry={value};
      ["substitution","alternate"].forEach(key=>{
        if(mark.attrs[key]===undefined)return;
        if(["yes","no"].includes(mark.attrs[key]))entry[key]=mark.attrs[key]==="yes";
        else warn(warnings,"unsupported-notation",mark);
      });
      if(mark.attrs.placement!==undefined) {
        if(["above","below"].includes(mark.attrs.placement))entry.placement=mark.attrs.placement;
        else warn(warnings,"unsupported-notation",mark);
      }
      if(mark.children.length || Object.keys(mark.attrs).some(key=>!["substitution","alternate","placement"].includes(key)))warn(warnings,"unsupported-notation",mark);
      entries.push(entry);
    });
  });
  if(entries.length===1 && Object.keys(entries[0]).length===1 && /^[1-5]$/.test(entries[0].value))event.fingering=Number(entries[0].value);
  else if(entries.length)event.fingerings=entries;
}
function addDirection(bar,type,value,startSlot,extra={}) {
  const direction=Object.assign({id:workshopId("direction"),startSlot,type,value},extra);
  if(!bar.directions)bar.directions=[]; bar.directions.push(direction); return direction;
}
function importAccidental(node,event,warnings) {
  if(!node || event.kind!=="note")return;
  const value=node.text.trim(), aliases={"sharp-sharp":"double-sharp"};
  if((aliases[value]||value)!==ACCIDENTALS[event.pitch.alter]) {
    // Written accidentals never replace the sounding pitch in <alter>.
    warn(warnings,"unsupported-notation",node);return;
  }
  const display={force:true};
  if(node.attrs.parentheses==="yes")display.enclosure="parentheses";
  if(node.attrs.bracket==="yes") {
    if(display.enclosure)warn(warnings,"unsupported-notation",node);
    display.enclosure="bracket";
  }
  if(node.attrs.cautionary==="yes")display.cautionary=true;
  if(node.attrs.editorial==="yes")display.editorial=true;
  if(node.attrs.smufl || node.attrs.size && node.attrs.size!=="full")warn(warnings,"unsupported-notation",node);
  event.accidentalDisplay=display;
}
function measureAccidentalMap(score,barIndex,parts=score.parts,automaticIds=new Set()) {
  const events=parts.reduce((all,part)=>all.concat(workshopMeasureEvents(part.measures[barIndex]).map(event=>{
    const copy=Object.assign({},event,{sourcePartIndex:score.parts.indexOf(part)});
    if(automaticIds.has(copy.id))delete copy.accidentalDisplay;
    return copy;
  })),[]);
  const signs=new Map();
  parts.forEach(part=>{
    const index=score.parts.indexOf(part),bar=part.measures[barIndex],context=workshopMeasureContext(score,barIndex,index);
    const displayed=events.filter(event=>(event.displayStaff===undefined?event.sourcePartIndex:event.displayStaff)===index);
    layoutWorkshopAccidentals(displayed,context.keyId,bar.contextChanges||[]).forEach(event=>signs.set(event.id,event.accidental));
  });
  return signs;
}
function importContextChange(score,barIndex,partIndex,startSlot,field,value,warnings) {
  const context=workshopMeasureContext(score,barIndex,partIndex), units=context && context.units;
  if(!workshopTimeOnGrid(startSlot) || !Number.isFinite(units) || startSlot>units) {
    warn(warnings,"unsupported-notation",{name:field==="keyId"?"key":field,measure:barIndex+1});return;
  }
  if(startSlot===units) {
    if(barIndex+1>=score.parts[partIndex].measures.length) {warn(warnings,"unsupported-notation",{name:field==="keyId"?"key":field,measure:barIndex+1});return;}
    barIndex++;startSlot=0;
  }
  if(startSlot===0) {
    if(barIndex===0) {
      score.parts[partIndex][field]=value;
    } else score.parts[partIndex].measures[barIndex][field]=value;
    return;
  }
  const bar=score.parts[partIndex].measures[barIndex];
  if(!bar.contextChanges)bar.contextChanges=[];
  let change=bar.contextChanges.find(item=>Math.abs(item.startSlot-startSlot)<1e-7);
  if(!change) {change={id:workshopId("context"),startSlot};bar.contextChanges.push(change);}
  if(change[field]!==undefined && change[field]!==value)warn(warnings,"unsupported-notation",{name:field==="keyId"?"key":field,measure:barIndex+1});
  change[field]=value;
  bar.contextChanges.sort((a,b)=>a.startSlot-b.startSlot);
}
function closeSpan(spans,key,bar,startSlot,warnings) {
  const open=spans.get(key);
  if(!open) { warn(warnings,"unsupported-notation",{name:key.startsWith("wedge-")?"wedge":"octave-shift"}); return; }
  if(open.bar.id===bar.id && startSlot<=open.direction.startSlot) { open.bar.directions=open.bar.directions.filter(item=>item!==open.direction); warn(warnings,"unsupported-notation",{name:key.startsWith("wedge-")?"wedge":"octave-shift"}); }
  else { open.direction.endSlot=startSlot; if(open.bar.id!==bar.id)open.direction.endBarId=bar.id; }
  spans.delete(key);
}
function diagnoseWavyLines(score,warnings) {
  const marks=[];
  score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,barIndex)=>workshopMeasureEvents(bar).forEach((event,order)=>{
    if(event.ornamentWavy)marks.push({barIndex,startSlot:event.startSlot,order,staff:event.displayStaff===undefined?partIndex:event.displayStaff,mark:event.ornamentWavy});
  })));
  marks.sort((a,b)=>a.barIndex-b.barIndex || a.startSlot-b.startSlot || a.order-b.order);
  const open=new Set();
  marks.forEach(({staff,mark})=>{
    const key=staff+":"+mark.number;
    if(mark.type==="start") {if(open.has(key))warn(warnings,"unsupported-notation",{name:"wavy-line"});open.add(key);}
    else if(!open.has(key))warn(warnings,"unsupported-notation",{name:"wavy-line"});
    else if(mark.type==="stop")open.delete(key);
  });
  if(open.size)warn(warnings,"unsupported-notation",{name:"wavy-line"});
}
function importNavigation(bar,entry) {
  const kind=workshopNavigationKind(entry);if(!bar.navigation)bar.navigation=[];
  if(typeof entry==='string') {if(!bar.navigation.some(value=>workshopNavigationKind(value)===kind))bar.navigation.push(entry);return;}
  const simple=bar.navigation.findIndex(value=>value===kind);if(simple>=0)bar.navigation.splice(simple,1);
  if(!bar.navigation.some(value=>JSON.stringify(value)===JSON.stringify(entry)))bar.navigation.push(entry);
}
function navigationPasses(sound,warnings) {
  if(sound.attrs['time-only']===undefined)return undefined;
  const tokens=String(sound.attrs['time-only']).split(',').map(value=>value.trim()),passes=tokens.map(Number);
  if(passes.length && passes.length<=8 && tokens.every(value=>/^\d+$/.test(value)) && passes.every(value=>Number.isInteger(value)&&value>=1&&value<=8))return Array.from(new Set(passes));
  warn(warnings,'unsupported-notation',sound);return null;
}
function importDirection(node,bar,cursor,divisions,state,warnings) {
  const sound=child(node,"sound"), startSlot=Math.max(0,cursor+number(node,"offset",0)*2/divisions);
  if(!workshopTimeOnGrid(startSlot)) {warn(warnings,"unsupported-rhythm",child(node,"offset") || node);return;}
  const pedals=importWorkshopPedalDirections(node,startSlot,cursor,divisions,state,(code,source)=>warn(warnings,code,source));
  pedals.entries.forEach(entry=>addDirection(bar,"pedal",entry.value,entry.startSlot,entry.pedal?{pedal:entry.pedal}:{}));
  let hasTempo=false;
  if(sound&&sound.attrs.tempo!==undefined) {
    const tempo=Number(sound.attrs.tempo); if(tempo>=25&&tempo<=240){addDirection(bar,"tempo",Math.round(tempo),startSlot);hasTempo=true;}else warn(warnings,"unsupported-notation",sound);
  }
  if(sound) {
    const swing=child(sound,"swing");
    if(swing) {
      const unit=text(swing,"swing-type","eighth"),style=text(swing,"swing-style"),value=child(swing,"straight") ? "straight" : {first:number(swing,"first"),second:number(swing,"second"),unit:unit==="16th"?"sixteenth":unit};
      if(style && value!=="straight")value.style=boundedText(style,128);
      if(isValidWorkshopSwing(value))addDirection(bar,"swing",value,startSlot);else warn(warnings,"unsupported-notation",swing);
      // Free-form style is retained for reading; playback follows the explicit ratio.
      if(style)warn(warnings,"unsupported-notation",swing);
      checkKnown(swing,["straight","first","second","swing-type","swing-style"],warnings);
    }
    const passes=navigationPasses(sound,warnings),flags=[['segno','segno'],['coda','coda'],["dacapo","dc"],["dalsegno","ds"],["tocoda","toCoda"],["fine","fine"]];
    flags.forEach(([attribute,kind])=>{
      const value=sound.attrs[attribute];if(value===undefined || value==='no')return;
      if(passes===null && !['segno','coda'].includes(kind))return;
      const entry={kind};if(passes)entry.passes=passes;
      if(['segno','coda'].includes(kind) && value!==kind)entry.label=boundedText(value.trim(),64);
      if(['ds','toCoda'].includes(kind) && value!==(kind==='ds'?'segno':'coda'))entry.target=boundedText(value.trim(),64);
      if(kind==='fine' && value!=='yes')warn(warnings,'unsupported-notation',sound);
      if(entry.label!==undefined && !entry.label || entry.target!==undefined && !entry.target){warn(warnings,'unsupported-notation',sound);return;}
      importNavigation(bar,Object.keys(entry).length===1?kind:entry);
    });
  }
  children(node,"direction-type").forEach(type=>type.children.forEach(mark=>{
    if(mark.name==="words" || mark.name==="rehearsal") {
      const swing=(bar.directions||[]).filter(direction=>direction.type==="swing"&&direction.startSlot===startSlot).slice(-1)[0];
      if(mark.text.trim() && !pedals.consumedWords.has(mark) && !(mark.name==="words" && swing && child(sound,"swing") && mark.text.trim()===workshopSwingLabel(swing.value)))addDirection(bar,"text",boundedText(mark.text,500),startSlot);
    }
    else if(mark.name==="dynamics") {
      const dynamic=mark.children[0] && mark.children[0].name;
      if(WORKSHOP_DYNAMICS.includes(dynamic)) {addDirection(bar,"dynamic",dynamic,startSlot);if(startSlot===0 && !["sf","sfz"].includes(dynamic))bar.dynamic=dynamic;}else warn(warnings,"unsupported-notation",mark.children[0] || mark);
    } else if(mark.name==="metronome"&&!hasTempo) {
      const unit=TYPES[text(mark,"beat-unit")], dots=children(mark,"beat-unit-dot").length, rate=number(mark,"per-minute");
      const bpm=rate*(WORKSHOP_NOTE_UNITS[unit]||2)/2*(2-Math.pow(.5,dots));
      if(bpm>=25&&bpm<=240)addDirection(bar,"tempo",Math.round(bpm),startSlot);else warn(warnings,"unsupported-notation",mark);
    } else if(mark.name==="wedge") {
      const key="wedge-"+(mark.attrs.number||"1"), value=mark.attrs.type;
      if(value==="stop")closeSpan(state.spans,key,bar,startSlot,warnings);
      else if(["crescendo","diminuendo"].includes(value))state.spans.set(key,{bar,direction:addDirection(bar,"wedge",value,startSlot)});
      else if(value!=="continue")warn(warnings,"unsupported-notation",mark);
    } else if(mark.name==="octave-shift") {
      const key="octave-"+(mark.attrs.number||"1"), type=mark.attrs.type;
      if(type==="stop")closeSpan(state.spans,key,bar,startSlot,warnings);
      else if(type==="up" || type==="down") {
        const size=Number(mark.attrs.size||8), value=(size===15?2:1)*(type==="down"?1:-1);
        if(![8,15].includes(size))warn(warnings,"unsupported-notation",mark);
        state.spans.set(key,{bar,direction:addDirection(bar,"octaveShift",value,startSlot)});
      }
    } else if(mark.name==="pedal") {
      // Pedal symbols and sound channels have already been merged above.
    } else if(mark.name==="segno" || mark.name==="coda") {importNavigation(bar,mark.name);}
    else if(mark.name!=="metronome")warn(warnings,"unsupported-notation",mark);
  }));
  checkKnown(node,["direction-type","offset","voice","staff","sound"],warnings);
}

export function importWorkshopMusicXmlText(xml,options={}) {
  try {
    if(typeof xml!=="string" || xml.length>WORKSHOP_MUSICXML_MAX_BYTES)error("musicxml-too-large","MusicXML source exceeds the editor's safe size limit");
    const sourceBytes=musicXmlUtf8Encode(xml).length;
    if(sourceBytes>WORKSHOP_MUSICXML_MAX_BYTES)error("musicxml-too-large","MusicXML source exceeds the editor's safe size limit");
    const largeEnvelope=sourceBytes>MAX_SOURCE_CHARS;
    if(largeEnvelope && !xml.includes(SOURCE_FIELD) && !xml.includes(NATIVE_FIELD))
      error("musicxml-too-large","MusicXML source exceeds the editor's safe size limit");
    const root=parseWorkshopMusicXmlDocument(xml), warnings=createMusicXmlWarnings(root),assets=assetMetadata(root);
    const sourceField=children(child(child(root,"identification"),"miscellaneous"),"miscellaneous-field").find(item=>item.attrs.name===SOURCE_FIELD);
    if(largeEnvelope && sourceField)sourceInside(xml);
    const nativeField=children(child(child(root,"identification"),"miscellaneous"),"miscellaneous-field").find(item=>item.attrs.name===NATIVE_FIELD);
    if(nativeField && !options.standardOnly) {
      try {
        const native=JSON.parse(nativeField.text), view=xml.slice(0,nativeField.start)+xml.slice(nativeField.end);
        if(native.version===1&&native.digest===workshopMusicXmlFingerprint({xml:view})&&isValidWorkshopScore(native.score)&&!native.score.musicXml) {
          const imported=cloneWorkshop(native.score), title=boundedText(native.title||imported.metadata&&imported.metadata.title||"MusicXML",2048);
          diagnoseWavyLines(imported,warnings);
          warn(warnings,"source-preserved");
          // A verified native envelope already contains its editable state.
          // Keep just the exact original source, rather than another copy of
          // that state plus Base64 source in every saved revision. Invalidate
          // the shortcut so subsequent exports regenerate the edited notation.
          const preservedSource=sourceField?sourceInside(xml):null;
          imported.musicXml=Object.assign({sourceXml:preservedSource||xml,fingerprint:preservedSource?"editor-envelope-restored":workshopMusicXmlFingerprint(imported,title),warnings},assets||{});
          if(assets)warn(warnings,"archive-assets-preserved");
          if(!isValidWorkshopScore(imported))error("invalid-musicxml","Invalid preserved MusicXML archive assets");
          const noteCount=editorSourceNoteCount(imported);
          return musicXmlImportResult(imported,title,warnings,noteCount,noteCount);
        }
        warn(warnings,"unsupported-notation",nativeField);
      }catch(caught){warn(warnings,"unsupported-notation",nativeField);}
    }
    if(largeEnvelope && !sourceField)error("musicxml-too-large","MusicXML source exceeds the editor's safe size limit");
    const xmlParts=measureNodes(root);
    if(!xmlParts.length)error("unsupported-score","MusicXML contains no parts");
    const count=xmlParts.reduce((max,part)=>Math.max(max,part.measures.length),0);
    if(!count || count>WORKSHOP_MAX_SCORE_MEASURES)error("unsupported-score","MusicXML contains too many measures");
    const sourceNoteCount=musicXmlSourceNoteCount(xmlParts);let importedNoteCount=0;
    const metadata=metadataFrom(root,warnings), title=boundedText(metadata.title || options.filename && options.filename.replace(/\.(?:musicxml|xml|mxl)$/i,"") || "MusicXML",2048);
    const score=createWorkshopDraft(title,count).score;
    score.metadata=metadata; const layout=layoutFrom(root,warnings); if(Object.keys(layout).length)score.layout=layout;
    const targets=[];
    for(let partIndex=0;partIndex<xmlParts.length;partIndex++) {
      const part=xmlParts[partIndex], attrs=part.measures.reduce((result,bar)=>result.concat(children(bar,"attributes")),[]);
      const staffCount=Math.max(1,...attrs.map(node=>number(node,"staves",1)),...part.measures.reduce((result,bar)=>result.concat(children(bar,"note").map(note=>number(note,"staff",1))),[]));
      for(let staff=1;staff<=staffCount;staff++)targets.push({partIndex,staff});
    }
    if(targets.length>2)warn(warnings,"extra-parts");
    const selected=targets.slice(0,2), targetIndex=new Map(selected.map((target,index)=>[target.partIndex+":"+target.staff,index]));
    if(selected.length===2)score.parts.push({id:"left",clef:"bass",measures:Array.from({length:count},()=>({id:workshopId("bar"),events:[]})),enabled:true});
    const tieStarts=new Map(), slurStarts=new Map(), glissandoStarts=new Map(), tremoloStarts=new Map(), ties=[], slurs=[], glissandos=[], tremolos=[], pickupCandidates=[], ordinaryAccidentals=new Set();
    xmlParts.forEach((sourcePart,sourcePartIndex)=>{
      if(!selected.some(target=>target.partIndex===sourcePartIndex))return;
      const state={divisions:1,meter:"4/4",keyId:"C-major",voices:new Map(),voiceCounts:[0,0],spans:new Map(),ending:null};
      sourcePart.measures.forEach((sourceBar,barIndex)=>{
        const pendingDirections=[];
        let cursor=0,lastStart=0,maximum=0; const beamStarts=new Map(), tupletStarts=new Map(), tupletDisplays=new Map();
        const bars=selected.map((target,index)=>target.partIndex===sourcePartIndex?score.parts[index].measures[barIndex]:null);
        if(state.ending)bars.filter(Boolean).forEach(bar=>{bar.ending=state.ending.slice();});
        sourceBar.children.forEach(node=>{
          if(node.name==="attributes") {
            const divisions=number(node,"divisions",state.divisions); if(!Number.isFinite(divisions)||divisions<=0||divisions>1e9)error("invalid-musicxml","Invalid MusicXML divisions"); state.divisions=divisions;
            const meter=child(node,"time");
            if(meter) {
              if(cursor!==0)warn(warnings,"unsupported-notation",meter);
              else {state.meter=meterFrom(meter,warnings);if(barIndex===0)score.meter=state.meter;else score.parts.forEach(part=>{part.measures[barIndex].meter=state.meter;});}
            }
            children(node,"key").forEach(key=>{
              state.keyId=keyFrom(key,warnings);
              selected.forEach((target,index)=>{
                if(target.partIndex===sourcePartIndex && (key.attrs.number===undefined || target.staff===Number(key.attrs.number)))
                  importContextChange(score,barIndex,index,cursor,"keyId",state.keyId,warnings);
              });
            });
            children(node,"clef").forEach(clef=>{
              const index=targetIndex.get(sourcePartIndex+":"+Number(clef.attrs.number||1));
              if(index===undefined)return; const value=clefFrom(clef,warnings);
              importContextChange(score,barIndex,index,cursor,"clef",value,warnings);
              const octave=number(clef,'clef-octave-change',0),current=workshopMeasureContextAtSlot(score,barIndex,cursor,index);
              if(Number.isInteger(octave) && Math.abs(octave)<=2) {
                if(child(clef,'clef-octave-change') || current.clefOctave)importContextChange(score,barIndex,index,cursor,'clefOctave',octave,warnings);
              } else warn(warnings,'unsupported-notation',clef);
              checkKnown(clef,['sign','line','clef-octave-change'],warnings);
            });
            children(node,'transpose').forEach(transpose=>{
              const value={chromatic:number(transpose,'chromatic')};
              if(child(transpose,'diatonic'))value.diatonic=number(transpose,'diatonic');
              if(child(transpose,'octave-change'))value.octaveChange=number(transpose,'octave-change');
              if(!isValidWorkshopTranspose(value)){warn(warnings,'unsupported-notation',transpose);return;}
              selected.forEach((target,index)=>{if(target.partIndex===sourcePartIndex && (transpose.attrs.number===undefined || target.staff===Number(transpose.attrs.number)))importContextChange(score,barIndex,index,cursor,'transpose',value,warnings);});
              checkKnown(transpose,['chromatic','diatonic','octave-change'],warnings);
            });
            checkKnown(node,["divisions","key","time","staves","clef","transpose"],warnings);
          } else if(node.name==="backup" || node.name==="forward") {
            const duration=number(node,"duration")*2/state.divisions;
            if(!Number.isFinite(duration)||duration<0)error("invalid-musicxml","Invalid MusicXML movement");
            cursor+=node.name==="backup"?-duration:duration;
            if(cursor < -1e-7)error("invalid-musicxml","MusicXML cursor moves before the measure");cursor=Math.max(0,cursor);maximum=Math.max(maximum,cursor);
          } else if(node.name==="note") {
            const staff=number(node,"staff",1), display=targetIndex.get(sourcePartIndex+":"+staff), voiceName=text(node,"voice","1");
            const grace=!!child(node,"grace"), chord=!!child(node,"chord"), duration=grace?0:number(node,"duration")*2/state.divisions;
            if(!Number.isFinite(duration)||duration<0||!grace&&duration===0)error("invalid-musicxml","Invalid MusicXML note duration");
            const start=chord?lastStart:cursor;
            if(!chord)lastStart=start;
            if(!chord&&!grace)cursor+=duration;
            maximum=Math.max(maximum,start+duration,cursor);
            if(display===undefined){warn(warnings,"extra-parts");return;}
            if(!state.voices.has(voiceName)) {
              const voice=++state.voiceCounts[display]; if(voice>4)error("unsupported-score","The editor supports four voices per staff");
              state.voices.set(voiceName,{partIndex:display,voice});
            }
            const location=state.voices.get(voiceName), partIndex=location.partIndex, voice=location.voice, bar=score.parts[partIndex].measures[barIndex];
            if(!workshopTimeOnGrid(start))error("unsupported-score","MusicXML timing is outside the supported rhythm grid");
            const isRest=!!child(node,"rest");let values;
            const tremoloMark=child(child(child(node,"notations"),"ornaments"),"tremolo"),twoNoteTremolo=!!tremoloMark && ["start","stop"].includes(tremoloMark.attrs.type);
            try { values=[noteDuration(node,duration,grace,warnings,twoNoteTremolo)]; }
            catch(caught) {
              if(!isRest||caught.code!=="unsupported-score")throw caught;
              values=workshopRestDurationValues(duration);
              if(!values.length||Math.abs(values.reduce((sum,value)=>sum+workshopEventUnits(value),0)-duration)>1e-7)throw caught;
              warn(warnings,"unsupported-rhythm",child(node,"rest"));
            }
            const event=Object.assign({id:workshopId(isRest?"rest":"note"),kind:isRest?"rest":"note",startSlot:start,pitch:null},values[0]);
            if(isRest)event.autoRest=false;
            if(voice!==1)event.voice=voice;
            if(grace) {
              const mark=child(node,"grace"),timing={};event.grace=true;event.graceSlash=mark.attrs.slash==="yes";
              [["steal-time-previous","stealPrevious"],["steal-time-following","stealFollowing"],["make-time","makeTime"]].forEach(([attribute,field])=>{
                if(mark.attrs[attribute]===undefined)return;
                const value=Number(mark.attrs[attribute])*(field==="makeTime"?2/state.divisions:1);
                if(String(mark.attrs[attribute]).trim() && isValidWorkshopGraceTiming({[field]:value}))timing[field]=value;else warn(warnings,"unsupported-notation",mark);
              });
              if(Object.keys(timing).length)event.graceTiming=timing;
              if(Object.keys(mark.attrs).some(attribute=>!["slash","steal-time-previous","steal-time-following","make-time"].includes(attribute)) || mark.attrs.slash!==undefined && !["yes","no"].includes(mark.attrs.slash))warn(warnings,"unsupported-notation",mark);
            }
            if(display!==partIndex)event.displayStaff=display;
            if(event.kind==="note") {
              const pitch=child(node,"pitch");
              if(!pitch){warn(warnings,"unsupported-notation",child(node,"unpitched") || node);return;}
              event.pitch={step:text(pitch,"step"),alter:number(pitch,"alter",0),octave:number(pitch,"octave")};
              const pitchValue=workshopPitchValue(event.pitch);
              if(!/^[A-G]$/.test(event.pitch.step)||!WORKSHOP_PITCH_ALTERS.includes(event.pitch.alter)||!Number.isInteger(event.pitch.octave)
                ||pitchValue<WORKSHOP_MIN_PITCH||pitchValue>WORKSHOP_MAX_PITCH){warn(warnings,"unsupported-notation",pitch);return;}
              importAccidental(child(node,"accidental"),event,warnings);
              if(event.accidentalDisplay && Object.keys(event.accidentalDisplay).length===1)ordinaryAccidentals.add(event.id);
            }
            const stem=text(node,"stem");if(event.kind==="note"&&["up","down"].includes(stem))event.stem=stem;
            const notation=child(node,"notations"), articulations=child(notation,"articulations"), ornaments=child(notation,"ornaments");
            if(articulations) {
              const supported=articulations.children.map(mark=>mark.name).filter(mark=>WORKSHOP_ARTICULATIONS.includes(mark));
              if(supported.length)event.articulations=Array.from(new Set(supported));
              checkKnown(articulations,WORKSHOP_ARTICULATIONS,warnings);
            }
            importFingerings(node,event,warnings);
            if(child(notation,"fermata")) {
              event.fermata=2;
              const shape=child(notation,"fermata").text.trim() || "normal";
              if(["normal","angled","square"].includes(shape))event.fermataShape=shape;else warn(warnings,"unsupported-notation",child(notation,"fermata"));
            }
            if(child(notation,"arpeggiate"))event.arpeggio=child(notation,"arpeggiate").attrs.direction==="down"?"down":"up";
            if(ornaments) {
              const mark=ornaments.children.find(item=>ORNAMENTS.includes(item.name==="trill-mark"?"trill":item.name));
              if(mark) {
                if(mark.name==="tremolo") {
                  const marks=Number(mark.text.trim()),valid=Number.isInteger(marks)&&marks>=1&&marks<=4,key=sourcePartIndex+":"+voiceName;
                  if(!valid)warn(warnings,"unsupported-notation",mark);
                  if(twoNoteTremolo) {
                    if(mark.attrs.type==="start")tremoloStarts.set(key,{id:event.id,marks:valid?marks:3});
                    else if(tremoloStarts.has(key)) {const open=tremoloStarts.get(key);tremolos.push({fromId:open.id,toId:event.id,marks:open.marks});tremoloStarts.delete(key);}
                    else warn(warnings,"unsupported-notation",mark);
                  } else if(!mark.attrs.type || mark.attrs.type==="single") {event.ornament="tremolo";event.tremoloMarks=valid?marks:3;}
                  else warn(warnings,"unsupported-notation",mark);
                } else event.ornament=mark.name==="trill-mark"?"trill":mark.name;
                if(mark.attrs.long!==undefined) {
                  if(["mordent","inverted-mordent"].includes(event.ornament) && ["yes","no"].includes(mark.attrs.long))event.ornamentLong=mark.attrs.long==="yes";else warn(warnings,"unsupported-notation",mark);
                }
                if(mark.attrs.placement!==undefined) {
                  if(["above","below"].includes(mark.attrs.placement))event.ornamentPlacement=mark.attrs.placement;else warn(warnings,"unsupported-notation",mark);
                }
              }
              const wavy=child(ornaments,"wavy-line");
              if(wavy) {
                const value={type:wavy.attrs.type,number:Number(wavy.attrs.number||1)};
                if(isValidWorkshopOrnamentWavy(value))event.ornamentWavy=value;else warn(warnings,"unsupported-notation",wavy);
                if(wavy.attrs.placement!==undefined) {
                  if(["above","below"].includes(wavy.attrs.placement)) {
                    if(event.ornamentPlacement && event.ornamentPlacement!==wavy.attrs.placement)warn(warnings,"unsupported-notation",wavy);else event.ornamentPlacement=wavy.attrs.placement;
                  } else warn(warnings,"unsupported-notation",wavy);
                }
              }
              if(event.ornamentPlacement && !event.ornament && !event.ornamentWavy) {delete event.ornamentPlacement;warn(warnings,"unsupported-notation",ornaments);}
              const accidentals={};
              children(ornaments,"accidental-mark").forEach(accidental=>{
                const alteration=Object.keys(ACCIDENTALS).find(value=>ACCIDENTALS[value]===accidental.text.trim()),side=accidental.attrs.placement==="below"?"lower":"upper";
                if(alteration!==undefined && (event.ornament && event.ornament!=="tremolo" || event.ornamentWavy)) {
                  if(accidentals[side]!==undefined)warn(warnings,"unsupported-notation",accidental);accidentals[side]=Number(alteration);
                } else warn(warnings,"unsupported-notation",accidental);
                if(accidental.attrs.parentheses==="yes" || accidental.attrs.bracket==="yes" || accidental.attrs.smufl)warn(warnings,"unsupported-notation",accidental);
              });
              if(Object.keys(accidentals).length)event.ornamentAccidentals=accidentals;
              if(ornaments.children.filter(item=>ORNAMENTS.includes(item.name==="trill-mark"?"trill":item.name)).length>1 || children(ornaments,"wavy-line").length>1)ornaments.children.forEach(item=>warn(warnings,"unsupported-notation",item));
              checkKnown(ornaments,ORNAMENTS.map(value=>value==="trill"?"trill-mark":value).concat(["wavy-line","accidental-mark"]),warnings);
              [mark,wavy].filter(Boolean).filter(item=>Object.keys(item.attrs).some(attribute=>["approach","departure","start-note","trill-step","two-note-turn","accelerate","beats","first-beat","second-beat","last-beat"].includes(attribute))).forEach(item=>warn(warnings,"unsupported-notation",item));
            }
            const lyrics=children(node,"lyric");
            if(lyrics.length) {
              event.lyrics=lyrics.slice(0,8).map((lyric,index)=>{
                const verse={number:boundedText(lyric.attrs.number || String(index+1),32),text:boundedText(lyric.children.filter(item=>item.name==="text").map(item=>item.text).join(""),1024)},syllabic=text(lyric,"syllabic"),extend=child(lyric,"extend");
                if(syllabic) {if(["single","begin","middle","end"].includes(syllabic))verse.syllabic=syllabic;else warn(warnings,"unsupported-notation",child(lyric,"syllabic"));}
                if(extend) {const type=extend.attrs.type || "start";if(["start","continue","stop"].includes(type))verse.extend=type;else warn(warnings,"unsupported-notation",extend);}
                checkKnown(lyric,["syllabic","text","extend"],warnings);return verse;
              });
              const numbers=new Set();event.lyrics=event.lyrics.filter(verse=>{if(numbers.has(verse.number)){warn(warnings,"unsupported-notation",lyrics.find(lyric=>(lyric.attrs.number || "1")===verse.number));return false;}numbers.add(verse.number);return true;});
              if(event.lyrics[0].text)event.lyric=event.lyrics[0].text;
              if(lyrics.length>8)warn(warnings,"unsupported-notation",lyrics[8]);
            }
            const tieKey=sourcePartIndex+":"+voiceName+":"+JSON.stringify(event.pitch), tieNodes=children(node,"tie").concat(children(notation,"tied"));
            if(tieNodes.some(mark=>mark.attrs.type==="stop")&&tieStarts.has(tieKey)){ties.push({fromId:tieStarts.get(tieKey),toId:event.id});tieStarts.delete(tieKey);}
            if(tieNodes.some(mark=>mark.attrs.type==="start"))tieStarts.set(tieKey,event.id);
            children(notation,"slur").forEach(mark=>{
              const key=sourcePartIndex+":"+voiceName+":"+(mark.attrs.number||1);
              if(mark.attrs.type==="stop"&&slurStarts.has(key)){slurs.push({fromId:slurStarts.get(key),toId:event.id});slurStarts.delete(key);}
              if(mark.attrs.type==="start")slurStarts.set(key,event.id);
            });
            ["glissando","slide"].forEach(type=>children(notation,type).forEach(mark=>{
              const key=sourcePartIndex+":"+voiceName+":"+type+":"+(mark.attrs.number||1);
              if(mark.attrs.type==="stop" && glissandoStarts.has(key)) {glissandos.push({fromId:glissandoStarts.get(key),toId:event.id,type});glissandoStarts.delete(key);}
              else if(mark.attrs.type==="start")glissandoStarts.set(key,event.id);
              else if(mark.attrs.type!=="continue")warn(warnings,"unsupported-notation",mark);
            }));
            const beam=children(node,"beam").find(mark=>!mark.attrs.number||mark.attrs.number==="1"), beamKey=partIndex+":"+voice;
            const chordMembers=chord?bar.events.filter(mark=>mark.kind==="note"&&mark.startSlot===start&&workshopEventVoiceCompat(mark)===voice):[];
            const beamedMember=chordMembers.find(mark=>mark.beamGroupId);
            // A chord has one beam boundary, even when an exporter repeats
            // begin/end on every tone. An end may already have closed the
            // active beam, so inherit the onset's group before reading tags.
            if(beamedMember)event.beamGroupId=beamedMember.beamGroupId;
            else {
              if(beam&&beam.text.trim()==="begin")beamStarts.set(beamKey,workshopId("beam"));
              if(beam&&beamStarts.has(beamKey))event.beamGroupId=beamStarts.get(beamKey);
              // Some exporters put the single beam tag on a later chord tone.
              if(event.beamGroupId)chordMembers.forEach(mark=>{mark.beamGroupId=event.beamGroupId;});
            }
            if(beam&&beam.text.trim()==="end")beamStarts.delete(beamKey);
            const tupletMember=event.tuplet && chordMembers.find(mark=>mark.tupletGroupId);
            if(tupletMember)event.tupletGroupId=tupletMember.tupletGroupId;
            const tupletTags=children(notation,"tuplet");
            // A one-note visual boundary retains the choice after an editor
            // operation detaches an incomplete group. It is not a new rhythmic
            // group and must not discard the time-modified note on import.
            const standaloneNumbers=new Set(tupletTags.filter(mark=>mark.attrs.type==="start"
              && tupletTags.some(stop=>stop.attrs.type==="stop" && (stop.attrs.number||1)===(mark.attrs.number||1)))
              .map(mark=>mark.attrs.number||1));
            tupletTags.forEach(mark=>{
              const key=partIndex+":"+voice+":"+(mark.attrs.number||1);
              const display=importWorkshopTupletDisplay(mark.attrs,()=>warn(warnings,"unsupported-notation",mark));
              if(standaloneNumbers.has(mark.attrs.number||1)) {
                if(event.tuplet && mark.attrs.type==="start" && display)event.tupletDisplay=display;
                return;
              }
              if(mark.attrs.type==="start") {
                const id=event.tupletGroupId || workshopId("tuplet");
                tupletStarts.set(key,id);
                if(display)tupletDisplays.set(id,Object.assign({},display,tupletDisplays.get(id)||{}));
              }
              if(tupletStarts.has(key))event.tupletGroupId=tupletStarts.get(key);
              if(event.tupletGroupId && display && !tupletDisplays.has(event.tupletGroupId))tupletDisplays.set(event.tupletGroupId,display);
              if(mark.attrs.type==="stop")tupletStarts.delete(key);
            });
            if(event.tuplet&&!event.tupletGroupId){const prefix=partIndex+":"+voice+":";const active=Array.from(tupletStarts.keys()).filter(key=>key.startsWith(prefix));if(active.length===1)event.tupletGroupId=tupletStarts.get(active[0]);}
            if(event.tupletGroupId)chordMembers.filter(mark=>mark.tuplet).forEach(mark=>{mark.tupletGroupId=event.tupletGroupId;});
            checkKnown(notation,["tied","slur","glissando","slide","tuplet","articulations","technical","ornaments","fermata","arpeggiate"],warnings);
            checkKnown(node,["pitch","rest","duration","tie","voice","type","dot","accidental","time-modification","stem","staff","beam","notations","lyric","chord","grace"],warnings);
            if(bar.events.length+values.length>WORKSHOP_MAX_MEASURE_EVENTS)error("unsupported-score","MusicXML measure contains too many notes");bar.events.push(event);
            if(event.kind==="note")importedNoteCount++;
            let silentCursor=start+workshopEventUnits(event);
            values.slice(1).forEach(value=>{bar.events.push(Object.assign({id:workshopId("rest"),kind:"rest",autoRest:false,startSlot:silentCursor,pitch:null},voice!==1?{voice}:{},display!==partIndex?{displayStaff:display}:{},value));silentCursor+=workshopEventUnits(value);});
          } else if(node.name==="direction") {
            const index=targetIndex.get(sourcePartIndex+":"+number(node,"staff",1));
            if(index!==undefined)pendingDirections.push({node,bar:score.parts[index].measures[barIndex],cursor,divisions:state.divisions});
          } else if(node.name==="barline") {
            children(node,"repeat").forEach(repeat=>score.parts.forEach(part=>{
              if(repeat.attrs.direction==="forward")part.measures[barIndex].repeatStart=true;
              else if(repeat.attrs.direction==="backward")part.measures[barIndex].repeatEnd=Math.min(8,Math.max(2,Number(repeat.attrs.times)||2));
            }));
            children(node,"ending").forEach(ending=>{
              const passes=(ending.attrs.number||"").split(/[,\s]+/).filter(Boolean).map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=8);
              if(ending.attrs.type==="start"&&passes.length)state.ending=passes;
              if(state.ending)score.parts.forEach(part=>{part.measures[barIndex].ending=state.ending.slice();});
              if(["stop","discontinue"].includes(ending.attrs.type))state.ending=null;
            });
            checkKnown(node,["bar-style","repeat","ending"],warnings);
          } else if(node.name==="print") {
            if(!score.layout)score.layout={};
            ["systemBreaks","pageBreaks"].forEach(field=>{if(node.attrs[field==="systemBreaks"?"new-system":"new-page"]==="yes"){
              score.layout[field]=score.layout[field]||[];const id=score.parts[0].measures[barIndex].id;if(!score.layout[field].includes(id))score.layout[field].push(id);
            }});
            warn(warnings,"layout-approximate");
          } else if(node.name==="sound")pendingDirections.push({node:{children:[node],attrs:{}},bar:bars.find(Boolean),cursor,divisions:state.divisions});
          else warn(warnings,"unsupported-notation",node);
        });
        // MusicXML serializes each voice separately. A stop in the first voice
        // may precede its start in a later voice in document order. Pair spans
        // in musical time, keeping offsets and divisions from each occurrence.
        pendingDirections.map((entry,order)=>Object.assign({order,
          position:Math.max(0,entry.cursor+number(entry.node,"offset",0)*2/entry.divisions)},entry))
          .sort((a,b)=>workshopTimeTicks(a.position)-workshopTimeTicks(b.position) || a.order-b.order)
          .forEach(entry=>importDirection(entry.node,entry.bar,entry.cursor,entry.divisions,state,warnings));
        if(barIndex===0 && sourceBar.attrs.implicit==="yes" && maximum>0&&maximum<workshopMeterUnits(state.meter)&&workshopTimeOnGrid(maximum))pickupCandidates.push(maximum);
        bars.filter(Boolean).forEach(bar=>{
          bar.events.forEach(event=>{const display=tupletDisplays.get(event.tupletGroupId);if(event.tuplet && display)event.tupletDisplay=Object.assign({},display);});
          Array.from(new Set(bar.events.map(event=>event.beamGroupId).filter(Boolean))).forEach(id=>{if(!isValidWorkshopBeamGroup(bar.events,id)){bar.events.forEach(event=>{if(event.beamGroupId===id)delete event.beamGroupId;});warn(warnings,"unsupported-notation",{name:"beam",measure:barIndex+1});}});
          Array.from(new Set(bar.events.map(event=>event.tupletGroupId).filter(Boolean))).forEach(id=>{if(!isValidWorkshopTripletGroup(bar.events,id)){bar.events.forEach(event=>{if(event.tupletGroupId===id)delete event.tupletGroupId;});warn(warnings,"unsupported-notation",{name:"tuplet",measure:barIndex+1});}});
        });
      });
      state.spans.forEach(({bar,direction})=>{
        const part=score.parts.find(item=>item.measures.includes(bar)), last=part.measures[part.measures.length-1];
        direction.endSlot=workshopMeasureContext(score,part.measures.length-1,score.parts.indexOf(part)).units;
        if(last.id!==bar.id)direction.endBarId=last.id;
        if(!Number.isFinite(direction.endSlot))direction.endSlot=workshopMeterUnits(score.meter);
        warn(warnings,"unsupported-notation",{name:direction.type==="wedge"?"wedge":"octave-shift"});
      });
    });
    const initialTempo=score.parts.reduce((directions,part)=>directions.concat(part.measures[0].directions||[]),[])
      .find(direction=>direction.type==="tempo"&&direction.startSlot===0);
    if(initialTempo)score.bpm=initialTempo.value;
    if(pickupCandidates.length)score.pickupUnits=Math.max(...pickupCandidates);
    score.keyId=score.parts[0].keyId || score.keyId;
    score.parts.forEach(part=>{if(part.keyId===score.keyId)delete part.keyId;});
    const octaveSpans=musicXmlOctaveSpans(score);
    score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,barIndex)=>bar.events.forEach(event=>{
      if(event.kind==="note") {
        const display=event.displayStaff===undefined?partIndex:event.displayStaff,context=workshopMeasureContextAtSlot(score,barIndex,event.startSlot,display);
        event.pitch.octave-=musicXmlOctaveValue(octaveSpans,display,barIndex,event.startSlot)+(context.clefOctave || 0);
      }
    })));
    // An ordinary printed sharp/natural is usually required by the musical
    // context, not a permanently forced reminder. Resolve this after every
    // voice and cross-staff note has been read in score order.
    for(let barIndex=0;barIndex<count;barIndex++) {
      const signs=measureAccidentalMap(score,barIndex,score.parts,ordinaryAccidentals);
      score.parts.forEach(part=>part.measures[barIndex].events.forEach(event=>{
        if(ordinaryAccidentals.has(event.id) && signs.get(event.id))delete event.accidentalDisplay;
      }));
    }
    if(ties.length) {
      const notes=indexWorkshopExpressionNotes(score);
      ties.forEach(edge=>{
        const from=notes&&notes.get(edge.fromId),to=notes&&notes.get(edge.toId);
        if(from&&to&&!from.event.grace&&from.end<to.start)edge.sustainAcrossGap=true;
      });
      score.ties=ties;
    }
    if(slurs.length)score.slurs=slurs;if(glissandos.length)score.glissandos=glissandos;if(tremolos.length)score.tremolos=tremolos;
    let repaired=repairWorkshopGlissandos(repairWorkshopTremolos(repairWorkshopSlurs(repairWorkshopTies(score))));
    [["ties",ties,tieStarts,"tied"],["slurs",slurs,slurStarts,"slur"],["glissandos",glissandos,glissandoStarts,"glissando"],["tremolos",tremolos,tremoloStarts,"tremolo"]]
      .forEach(([field,entries,open,name])=>{if((repaired[field]||[]).length!==entries.length || open.size)warn(warnings,"unsupported-notation",{name});});
    diagnoseWavyLines(repaired,warnings);
    checkKnown(root,["work","movement-title","movement-number","identification","defaults","credit","part-list","part","measure"],warnings);
    warn(warnings,"source-preserved");
    if(assets)warn(warnings,"archive-assets-preserved");
    repaired.musicXml=Object.assign({sourceXml:xml,fingerprint:workshopMusicXmlFingerprint(repaired,title),warnings:warnings.slice()},assets||{});
    if(!isValidWorkshopScore(repaired))error("unsupported-score","This MusicXML score uses notation outside the editor's supported structure");
    return musicXmlImportResult(repaired,title,warnings,sourceNoteCount,importedNoteCount);
  }catch(caught){if(!caught.code)caught.code="invalid-musicxml";throw caught;}
}

// Recover engraving metadata that older importers omitted, but only when the
// saved score is untouched and each recovered group exactly matches its source.
// Different importer generations may preserve different optional annotations.
// No notes, IDs,
// revisions or stored library data are replaced by this read-time enrichment.
export function restoreWorkshopTupletDisplay(score,title="") {
  if(!isValidWorkshopScore(score) || !score.musicXml || !score.musicXml.sourceXml
    || score.musicXml.fingerprint!==workshopMusicXmlFingerprint(score,title))return score;
  let imported;
  try { imported=importWorkshopMusicXmlText(score.musicXml.sourceXml,{standardOnly:true}).score; }
  catch(caught) { return score; }
  if(score.parts.length!==imported.parts.length || score.parts.some((part,index)=>part.measures.length!==imported.parts[index].measures.length))return score;
  function identity(event,partIndex) {
    const ratio=event.tuplet===3?{actual:3,normal:2}:event.tuplet;
    return JSON.stringify([event.kind,event.pitch && [event.pitch.step,event.pitch.alter,event.pitch.octave],event.startSlot,
      event.noteValue,event.dots||0,ratio && [ratio.actual,ratio.normal],event.voice||1,
      event.displayStaff===undefined?partIndex:event.displayStaff,!!event.grace]);
  }
  function groups(bar) {
    const result=new Map();
    bar.events.forEach((event,index)=>{
      if(!event.tupletGroupId)return;
      if(!result.has(event.tupletGroupId))result.set(event.tupletGroupId,[]);
      result.get(event.tupletGroupId).push({event,index});
    });
    return Array.from(result.values());
  }
  function matchingMembers(members,candidate,partIndex) {
    if(members.length!==candidate.length)return null;
    const used=new Set(),matches=[];
    for(const member of members) {
      const match=candidate.findIndex((entry,index)=>!used.has(index) && identity(member.event,partIndex)===identity(entry.event,partIndex)
        && (!Object.prototype.hasOwnProperty.call(member.event,"stem") || member.event.stem===entry.event.stem));
      if(match===-1)return null;
      used.add(match);matches.push({member,source:candidate[match].event});
    }
    return matches;
  }
  let result=null;
  score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,barIndex)=>{
    const sourceGroups=groups(imported.parts[partIndex].measures[barIndex]);
    groups(bar).forEach(members=>{
      const matches=sourceGroups.map(candidate=>matchingMembers(members,candidate,partIndex)).filter(Boolean);
      if(matches.length!==1)return;
      matches[0].forEach(({member,source})=>{
        const display=workshopTupletDisplay(source);
        if(!display || Object.prototype.hasOwnProperty.call(member.event,"tupletDisplay"))return;
        if(!result)result=cloneWorkshop(score);
        result.parts[partIndex].measures[barIndex].events[member.index].tupletDisplay=display;
      });
    });
  }));
  if(!result || !isValidWorkshopScore(result))return score;
  // The original fingerprint and exact group checks make this safe: unchanged-source export
  // remains available, while later editor changes invalidate it as before.
  result.musicXml.fingerprint=workshopMusicXmlFingerprint(result,title);
  return result;
}
function workshopEventVoiceCompat(event){return event.voice||1;}
export async function importWorkshopMusicXml(input,options={}) {
  try {
    if(typeof input==="string")return importWorkshopMusicXmlText(input,options);
    if(input && typeof input.arrayBuffer==="function")input=await input.arrayBuffer();
    const bytes=input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
    if(!bytes)error("invalid-musicxml","No MusicXML file data supplied");
    let xml,archiveMetadata=null;
    if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b) {
      const archive=readMusicXmlArchive(bytes), manifest=archive.get("META-INF/container.xml");
      if(!manifest)error("invalid-musicxml","MusicXML archive has no container manifest");
      const container=parseWorkshopMusicXmlDocument(musicXmlUtf8Decode(manifest));
      const rootfile=child(child(container,"rootfiles"),"rootfile"), path=rootfile&&rootfile.attrs["full-path"];
      if(container.name!=="container"||!path||!archive.has(path))error("invalid-musicxml","MusicXML archive has no root score");
      xml=musicXmlUtf8Decode(archive.get(path));
      const archiveAssets=[];let size=0;
      archive.forEach((data,name)=>{
        if(["mimetype","META-INF/container.xml",path].includes(name)||name.endsWith("/")&&!data.length)return;
        size+=data.length;if(size>2*1024*1024)error("musicxml-too-large","MusicXML archive attachments are too large");
        archiveAssets.push({path:name,data:base64EncodeBytes(data)});
      });
      if(archiveAssets.length)archiveMetadata={rootPath:path,archiveAssets};
    } else if(bytes[0]===0xff&&bytes[1]===0xfe || bytes[0]===0xfe&&bytes[1]===0xff) {
      if(typeof TextDecoder==="undefined")error("invalid-musicxml","UTF-16 MusicXML is not supported on this device");
      xml=new TextDecoder(bytes[0]===0xff?"utf-16le":"utf-16be",{fatal:true}).decode(bytes);
    } else xml=musicXmlUtf8Decode(bytes);
    const imported=importWorkshopMusicXmlText(xml,options);
    if(archiveMetadata){Object.assign(imported.score.musicXml,archiveMetadata);warn(imported.warnings,"archive-assets-preserved");imported.score.musicXml.warnings=imported.warnings.slice();if(!isValidWorkshopScore(imported.score))error("invalid-musicxml","Unsafe MusicXML archive assets");}
    return imported;
  }catch(caught){if(!caught.code)caught.code="invalid-musicxml";throw caught;}
}

function exportLayout(layout) {
  if(!layout)return ""; const nodes=[];
  if(layout.pageWidth||layout.pageHeight||layout.marginLeft!==undefined) {
    let page="";if(layout.pageHeight)page+=xmlElement("page-height",layout.pageHeight);if(layout.pageWidth)page+=xmlElement("page-width",layout.pageWidth);
    if(["marginLeft","marginRight","marginTop","marginBottom"].some(key=>layout[key]!==undefined))page+='<page-margins type="both">'+
      xmlElement("left-margin",layout.marginLeft||0)+xmlElement("right-margin",layout.marginRight||0)+xmlElement("top-margin",layout.marginTop||0)+xmlElement("bottom-margin",layout.marginBottom||0)+"</page-margins>";
    nodes.push("<page-layout>"+page+"</page-layout>");
  }
  if(layout.systemDistance)nodes.push("<system-layout>"+xmlElement("system-distance",layout.systemDistance)+"</system-layout>");
  if(layout.staffDistance)nodes.push("<staff-layout>"+xmlElement("staff-distance",layout.staffDistance)+"</staff-layout>");
  if(layout.fontFamily||layout.fontSize)nodes.push(`<word-font${layout.fontFamily?` font-family="${esc(layout.fontFamily)}"`:""}${layout.fontSize?` font-size="${layout.fontSize}"`:""}/>`);
  return nodes.length?"<defaults>"+nodes.join("")+"</defaults>":"";
}
function exportIdentification(metadata,preserved,assets) {
  let out="";
  ["composer","arranger","lyricist"].forEach(key=>{if(metadata[key])out+=xmlElement("creator",metadata[key],` type="${key}"`);});
  if(metadata.copyright)out+=xmlElement("rights",metadata.copyright);
  out+="<encoding><software>Noten Pfoten</software></encoding>";
  if(metadata.sources&&metadata.sources.length)out+=xmlElement("source",metadata.sources.map(source=>source.url).join("\n"));
  const fields=(preserved?xmlElement("miscellaneous-field",base64Encode(preserved),` name="${SOURCE_FIELD}"`):"")
    +(assets?xmlElement("miscellaneous-field",JSON.stringify(assets),` name="${ASSET_FIELD}"`):"")
    +(metadata.license!==undefined?xmlElement("miscellaneous-field",metadata.license,` name="${LICENSE_FIELD}"`):"")
    +(metadata.sources!==undefined?xmlElement("miscellaneous-field",JSON.stringify(metadata.sources),` name="${SOURCES_FIELD}"`):"");
  if(fields)out+="<miscellaneous>"+fields+"</miscellaneous>";
  return "<identification>"+out+"</identification>";
}
function directionXml(direction,staff,startSlot,end=false) {
  let mark="",sound="",placement="above";
  if(direction.type==="tempo" || direction.type==="tempoRamp") {
    if(direction.type==="tempoRamp"&&!end)return "";
    mark='<metronome><beat-unit>quarter</beat-unit>'+xmlElement("per-minute",direction.value)+"</metronome>";sound=`<sound tempo="${direction.value}"/>`;
  } else if(direction.type==="dynamic")mark=`<dynamics><${direction.value}/></dynamics>`;
  else if(direction.type==="wedge")mark=`<wedge type="${end?"stop":direction.value}" number="${direction.spanNumber||1}"/>`;
  else if(direction.type==="octaveShift")mark=`<octave-shift type="${end?"stop":direction.value>0?"down":"up"}" size="${Math.abs(direction.value)===2?15:8}" number="${direction.spanNumber||1}"/>`;
  else if(direction.type==="pedal") {const pedal=exportWorkshopPedalDirection(direction);mark=pedal.mark;sound=pedal.sound;placement=pedal.placement;}
  else if(direction.type==="text")mark=xmlElement("words",direction.value);
  else if(direction.type==="swing") {
    mark=xmlElement("words",workshopSwingLabel(direction.value));
    const value=direction.value;
    sound='<sound><swing>'+(value==="straight"?'<straight/>':xmlElement("first",value.first)+xmlElement("second",value.second)+xmlElement("swing-type",value.unit==="sixteenth"?"16th":"eighth")+(value.style?xmlElement("swing-style",value.style):""))+'</swing></sound>';
  }
  if(!mark)return "";
  return `<direction placement="${placement}"><direction-type>`+mark+"</direction-type>"+xmlElement("offset",Math.round(startSlot*WORKSHOP_TICKS_PER_UNIT))+xmlElement("staff",staff)+sound+"</direction>";
}
function clefXml(clef,staff,octave=0) {
  const sign=clef==="bass"?"F":["alto","tenor"].includes(clef)?"C":"G",line=clef==="alto"?3:clef==="treble"?2:4;
  return `<clef number="${staff}">`+xmlElement("sign",sign)+xmlElement("line",line)+(octave?xmlElement('clef-octave-change',octave):'')+"</clef>";
}
function transposeXml(value,staff) {return `<transpose number="${staff}">`+(value.diatonic!==undefined?xmlElement('diatonic',value.diatonic):'')+xmlElement('chromatic',value.chromatic)+(value.octaveChange!==undefined?xmlElement('octave-change',value.octaveChange):'')+'</transpose>';}
function musicXmlOctaveSpans(score) {
  return score.parts.map(part=>part.measures.reduce((spans,bar,barIndex)=>spans.concat((bar.directions||[]).filter(direction=>direction.type==="octaveShift")
    .map(direction=>Object.assign({},direction,{startBar:barIndex,endBar:direction.endBarId?part.measures.findIndex(item=>item.id===direction.endBarId):barIndex}))),[]));
}
function musicXmlOctaveValue(spans,partIndex,barIndex,slot) {
  const span=(spans[partIndex]||[]).filter(direction=>direction.startBar<=barIndex && direction.endBar>=barIndex
    && (direction.startBar!==barIndex || direction.startSlot<=slot) && (direction.endBar!==barIndex || direction.endSlot>slot)).slice(-1)[0];
  return span ? span.value:0;
}
// A notation number is occupied until its stop, even across many measures.
// Reusing numbers by total connection count overwrites still-open long spans.
function exportConnectionNumbers(score, edges) {
  const notes=indexWorkshopExpressionNotes(score),numbers=[],pools=new Map();
  edges.map((edge,index)=>({edge,index,from:notes.get(edge.fromId),to:notes.get(edge.toId)}))
    .sort((a,b)=>a.from.start-b.from.start || a.edge.fromId.localeCompare(b.edge.fromId) || a.index-b.index)
    .forEach(entry=>{
      const scope=entry.from.partIndex+":"+entry.from.voice+":"+(entry.edge.type||"slur");
      const active=(pools.get(scope)||[]).filter(previous=>previous.to.start>entry.from.start
        || previous.to.start===entry.from.start && previous.edge.toId!==entry.edge.fromId);
      let number=1;while(active.some(previous=>previous.number===number))number++;
      if(number>16)error("unsupported-notation","Too many simultaneously open notation connections");
      numbers[entry.index]=number;active.push(Object.assign({number},entry));pools.set(scope,active);
    });
  return numbers;
}
function exportNote(event,staff,chord,score,beamMarks,tupletMarks,slurNumbers,glissandoNumbers) {
  let out="<note>";
  if(event.grace) {
    const timing=event.graceTiming||{};
    const attributes=[["stealPrevious","steal-time-previous"],["stealFollowing","steal-time-following"],["makeTime","make-time"]].filter(([field])=>timing[field]!==undefined)
      .map(([field,attribute])=>` ${attribute}="${timing[field]*(field==="makeTime"?WORKSHOP_TICKS_PER_UNIT:1)}"`).join("");
    out+=`<grace slash="${event.graceSlash===false?"no":"yes"}"${attributes}/>`;
  }
  if(chord)out+="<chord/>";
  if(event.kind==="rest")out+="<rest/>";
  else {const pitch=event.xmlPitch||event.pitch;out+="<pitch>"+xmlElement("step",pitch.step)+(pitch.alter?xmlElement("alter",pitch.alter):"")+xmlElement("octave",pitch.octave)+"</pitch>";}
  if(!event.grace)out+=xmlElement("duration",Math.round(workshopEventUnits(event)*WORKSHOP_TICKS_PER_UNIT));
  const tieStart=(score.ties||[]).some(edge=>edge.fromId===event.id),tieStop=(score.ties||[]).some(edge=>edge.toId===event.id);
  if(tieStop)out+='<tie type="stop"/>';if(tieStart)out+='<tie type="start"/>';
  out+=xmlElement("voice",event.xmlVoice)+xmlElement("type",REVERSE_TYPES[event.noteValue]);
  for(let dot=0;dot<(event.dots||0);dot++)out+="<dot/>";
  if(event.kind==="note"&&event.xmlAccidental) {
    const display=event.accidentalDisplay||{};
    const attrs=(display.enclosure?` ${display.enclosure}="yes"`:"")
      +(display.cautionary || display.force && !display.enclosure && !display.editorial?' cautionary="yes"':"")+(display.editorial?' editorial="yes"':"");
    out+=xmlElement("accidental",ACCIDENTALS[event.pitch.alter],attrs);
  }
  if(event.tuplet || event.twoNoteTremolo){const ratio=event.tuplet===3?{actual:3,normal:2}:event.tuplet||{actual:1,normal:1};out+="<time-modification>"+xmlElement("actual-notes",ratio.actual*(event.twoNoteTremolo?2:1))+xmlElement("normal-notes",ratio.normal)+"</time-modification>";}
  if(event.stem)out+=xmlElement("stem",event.stem);
  out+=xmlElement("staff",event.displayStaff!==undefined?event.displayStaff+1:staff);
  const beam=beamMarks.get(event.id);if(beam)beam.forEach((type,index)=>{out+=xmlElement("beam",type,` number="${index+1}"`);});
  let notations="";
  if(tieStop)notations+='<tied type="stop"/>';if(tieStart)notations+='<tied type="start"/>';
  ["stop","start"].forEach(type=>{
    const endpoint=type==="stop"?"toId":"fromId";
    (score.slurs||[]).forEach((edge,index)=>{if(edge[endpoint]===event.id)notations+=`<slur type="${type}" number="${slurNumbers[index]}"/>`;});
    (score.glissandos||[]).forEach((edge,index)=>{if(edge[endpoint]===event.id)notations+=`<${edge.type} type="${type}" number="${glissandoNumbers[index]}"/>`;});
  });
  const tuplet=tupletMarks.get(event.id),standaloneTuplet=!tuplet && event.tuplet && workshopTupletDisplay(event);
  if(tuplet)notations+=`<tuplet type="${tuplet.type}" number="1"${tuplet.type==="start" ? exportWorkshopTupletDisplay(tuplet.display) || ' bracket="yes"' : ""}/>`;
  else if(standaloneTuplet)notations+=`<tuplet type="start" number="1"${exportWorkshopTupletDisplay(standaloneTuplet)}/><tuplet type="stop" number="1"/>`;
  if(event.fermata)notations+=event.fermataShape && event.fermataShape!=="normal" ? xmlElement("fermata",event.fermataShape):"<fermata/>";
  if(event.arpeggio)notations+=`<arpeggiate direction="${event.arpeggio}"/>`;
  if(event.articulations&&event.articulations.length)notations+="<articulations>"+event.articulations.map(value=>`<${value}/>`).join("")+"</articulations>";
  const fingerings=workshopFingerings(event);
  if(fingerings.length)notations+="<technical>"+fingerings.map(entry=>{
    const attrs=["substitution","alternate"].filter(key=>Object.prototype.hasOwnProperty.call(entry,key))
      .map(key=>` ${key}="${entry[key]?"yes":"no"}"`).join("")+(entry.placement?` placement="${entry.placement}"`:"");
    return xmlElement("fingering",entry.value,attrs);
  }).join("")+"</technical>";
  const paired=(score.tremolos||[]).find(edge=>edge.fromId===event.id || edge.toId===event.id);
  if(paired || event.ornament || event.ornamentWavy) {
    const wavy=event.ornamentWavy,accidentals=event.ornamentAccidentals||{};
    const placement=event.ornamentPlacement?` placement="${event.ornamentPlacement}"`:"",long=event.ornamentLong===undefined?"":` long="${event.ornamentLong?"yes":"no"}"`;
    const mark=paired ? xmlElement("tremolo",paired.marks,` type="${paired.fromId===event.id?"start":"stop"}"${placement}`) : event.ornament ? (event.ornament==="tremolo"?`<tremolo type="single"${placement}>${event.tremoloMarks||3}</tremolo>`:`<${event.ornament==="trill"?"trill-mark":event.ornament}${long}${placement}/>`):"";
    notations+="<ornaments>"+mark+(wavy?`<wavy-line type="${wavy.type}" number="${wavy.number}"${placement}/>`:"")
      +Object.keys(accidentals).map(side=>xmlElement("accidental-mark",ACCIDENTALS[accidentals[side]],` placement="${side==="lower"?"below":"above"}"`)).join("")+"</ornaments>";
  }
  if(notations)out+="<notations>"+notations+"</notations>";
  const lyrics=event.lyrics || (event.lyric?[{number:"1",text:event.lyric,syllabic:"single"}]:[]);
  lyrics.forEach(verse=>{out+=`<lyric number="${esc(verse.number)}">`+(verse.syllabic?xmlElement("syllabic",verse.syllabic):"")
    +xmlElement("text",verse.text)+(verse.extend?`<extend type="${verse.extend}"/>`:"")+"</lyric>";});
  return out+"</note>";
}
function beamCount(event){const units=WORKSHOP_NOTE_UNITS[event.noteValue];return units<=1?Math.round(1-Math.log(units)/Math.LN2):0;}
export function exportWorkshopMusicXmlText(score,options={}) {
  if(!isValidWorkshopScore(score))error("invalid-score","Cannot export an invalid workshop score");
  // Clean only derived export data. Import provenance protects intentional
  // silent voices, while new autoRest flags also survive a native XML roundtrip.
  const sourceScore=score;
  score=cloneWorkshop(score);
  score.parts.forEach(part=>part.measures.forEach(measure=>{
    measure.events=pruneWorkshopGeneratedRestVoices(withWorkshopRestProvenance(measure,{legacy:!sourceScore.musicXml}).events);
  }));
  const metadata=score.metadata||{},title=options.title===undefined?metadata.title||"":String(options.title),warnings=[];
  // In MXL each attachment already has its own ZIP entry. An additional Base64
  // copy inside the XML would needlessly exceed the source-document size limit.
  const assets=!options.compressed&&score.musicXml&&score.musicXml.archiveAssets&&score.musicXml.archiveAssets.length?{rootPath:score.musicXml.rootPath,archiveAssets:score.musicXml.archiveAssets}:null;
  if(score.musicXml&&score.musicXml.sourceXml&&score.musicXml.fingerprint===workshopMusicXmlFingerprint(score,title)
    && (!assets || assetMetadata(parseWorkshopMusicXmlDocument(score.musicXml.sourceXml))))
    return {data:sourceOutput(score.musicXml.sourceXml),mimeType:"application/vnd.recordare.musicxml+xml",extension:"musicxml",warnings:(score.musicXml.warnings||[]).slice()};
  const preserved=score.musicXml&&score.musicXml.sourceXml?sourceInside(score.musicXml.sourceXml):"";
  if(preserved)warn(warnings,"edited-source-preserved");
  if(assets)warn(warnings,"archive-assets-preserved");
  const parts=workshopActiveParts(score),barCount=parts[0].measures.length,spanEnds=new Map();let spanNumber=0;
  parts.forEach((part,index)=>part.measures.forEach((bar,barIndex)=>(bar.directions||[]).forEach(direction=>{
    if(direction.endSlot===undefined)return;
    const endId=direction.endBarId||bar.id,key=index+":"+endId;
    if(!spanEnds.has(key))spanEnds.set(key,[]);
    const copy=Object.assign({},direction,{spanNumber:++spanNumber});
    spanEnds.get(key).push(copy);
  })));
  const slurNumbers=exportConnectionNumbers(score,score.slurs||[]),glissandoNumbers=exportConnectionNumbers(score,score.glissandos||[]),octaveSpans=musicXmlOctaveSpans(score);
  let xml='<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">';
  if(title)xml+="<work>"+xmlElement("work-title",title)+"</work>";
  if(metadata.subtitle)xml+=xmlElement("movement-title",metadata.subtitle);
  xml+=exportIdentification(metadata,preserved,assets)+exportLayout(score.layout);
  xml+='<part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list><part id="P1">';
  const previous=[];
  for(let barIndex=0;barIndex<barCount;barIndex++) {
    const primary=parts[0].measures[barIndex],contexts=parts.map((part,index)=>workshopMeasureContext(score,barIndex,index));
    xml+=`<measure number="${barIndex+1}"${barIndex===0&&score.pickupUnits!==undefined?' implicit="yes"':""}>`;
    if(score.layout && ((score.layout.systemBreaks||[]).includes(primary.id)||(score.layout.pageBreaks||[]).includes(primary.id)))
      xml+=`<print${(score.layout.systemBreaks||[]).includes(primary.id)?' new-system="yes"':""}${(score.layout.pageBreaks||[]).includes(primary.id)?' new-page="yes"':""}/>`;
    let attributes=barIndex===0?xmlElement("divisions",WORKSHOP_TICKS_PER_UNIT*2):"";
    const context=contexts[0];
    const sharedKey=contexts.every(value=>value.keyId===context.keyId);
    if(sharedKey) {
      if(barIndex===0 || contexts.some((value,index)=>previous[index].keyId!==value.keyId)) {const key=NOTE_FLOW_TONALITIES.find(item=>item.id===context.keyId);attributes+="<key>"+xmlElement("fifths",key.fifths)+xmlElement("mode",key.mode)+"</key>";}
    } else contexts.forEach((value,index)=>{
      if(barIndex===0 || previous[index].keyId!==value.keyId) {const key=NOTE_FLOW_TONALITIES.find(item=>item.id===value.keyId);attributes+=`<key number="${index+1}">`+xmlElement("fifths",key.fifths)+xmlElement("mode",key.mode)+"</key>";}
    });
    if(barIndex===0||previous[0].meter!==context.meter) {const split=context.meter.split("/");attributes+="<time>"+xmlElement("beats",split[0])+xmlElement("beat-type",split[1])+"</time>";}
    if(barIndex===0&&parts.length===2)attributes+="<staves>2</staves>";
    contexts.forEach((value,index)=>{
      if(barIndex===0||previous[index].clef!==value.clef||(previous[index].clefOctave||0)!==(value.clefOctave||0))attributes+=clefXml(value.clef,index+1,value.clefOctave);
      if(value.transpose && (barIndex===0 || JSON.stringify(previous[index].transpose)!==JSON.stringify(value.transpose)))attributes+=transposeXml(value.transpose,index+1);
    });
    if(attributes)xml+="<attributes>"+attributes+"</attributes>";
    if(primary.repeatStart || primary.ending)xml+='<barline location="left">'+(primary.ending?`<ending number="${primary.ending.join(",")}" type="start"/>`:"")+(primary.repeatStart?'<repeat direction="forward"/>':"")+"</barline>";
    if(barIndex===0)xml+=directionXml({type:"tempo",value:score.bpm},1,0);
    parts.forEach((part,index)=>{
      const bar=part.measures[barIndex],dynamic=contexts[index].dynamic;
      const explicitDynamic=(bar.directions||[]).some(direction=>direction.type==="dynamic"&&direction.startSlot===0&&direction.value===dynamic);
      if((barIndex===0||previous[index].dynamic!==dynamic)&&!explicitDynamic)xml+=directionXml({type:"dynamic",value:dynamic},index+1,0);
      (bar.directions||[]).forEach(direction=>{
        const ends=Array.from(spanEnds.values()).reduce((all,array)=>all.concat(array),[]), numbered=ends.find(item=>item.id===direction.id)||direction;
        xml+=directionXml(numbered,index+1,direction.startSlot);
        if(direction.type==="tempoRamp")xml+=directionXml({type:"text",value:direction.value>(contexts[index].bpm||score.bpm)?"accel.":"rit."},index+1,direction.startSlot);
      });
      (spanEnds.get(index+":"+bar.id)||[]).forEach(direction=>{xml+=directionXml(direction,index+1,direction.endSlot,true);});
      (bar.navigation||[]).forEach(value=>{
        const entry=workshopNavigationEntry(value);
        if(["segno","coda"].includes(entry.kind))xml+=`<direction><direction-type><${entry.kind}/></direction-type>`+xmlElement("staff",index+1)+(entry.label || entry.passes?`<sound ${entry.kind}="${esc(entry.label || entry.kind)}"${entry.passes?` time-only="${entry.passes.join(',')}"`:''}/>`:'')+"</direction>";
      });
    });
    // Attributes apply in score order across all voices. Emit their exact
    // positions in a separate forward/back-up pass, then write each voice
    // from zero so held notes and rests retain their original timing.
    const contextAttributes=new Map();
    parts.forEach((part,index)=>workshopOrderedContextChanges(part.measures[barIndex]).forEach(change=>{
      if(!contextAttributes.has(change.startSlot))contextAttributes.set(change.startSlot,{keys:"",clefs:[]});
      const target=contextAttributes.get(change.startSlot);
      if(change.keyId!==undefined) {
        const key=NOTE_FLOW_TONALITIES.find(item=>item.id===change.keyId);
        target.keys+=`<key number="${index+1}">`+xmlElement("fifths",key.fifths)+xmlElement("mode",key.mode)+"</key>";
      }
      const context=workshopMeasureContextAtSlot(score,barIndex,change.startSlot,index);
      if(change.clef!==undefined || change.clefOctave!==undefined)target.clefs.push(clefXml(context.clef,index+1,context.clefOctave));
      if(change.transpose!==undefined)target.clefs.push(transposeXml(change.transpose,index+1));
    }));
    let contextCursor=0;
    Array.from(contextAttributes.entries()).sort((a,b)=>a[0]-b[0]).forEach(([slot,attributes])=>{
      xml+="<forward>"+xmlElement("duration",Math.round((slot-contextCursor)*WORKSHOP_TICKS_PER_UNIT))+"</forward>";
      xml+="<attributes>"+attributes.keys+attributes.clefs.join("")+"</attributes>";
      contextCursor=slot;
    });
    if(contextCursor>0)xml+="<backup>"+xmlElement("duration",Math.round(contextCursor*WORKSHOP_TICKS_PER_UNIT))+"</backup>";
    const beamMarks=new Map(),tupletMarks=new Map();
    const accidentals=measureAccidentalMap(score,barIndex,parts);
    const events=parts.reduce((all,part,index)=>all.concat(workshopMeasureEvents(part.measures[barIndex]).map(event=>{
      const display=event.displayStaff===undefined?index:event.displayStaff,shift=musicXmlOctaveValue(octaveSpans,display,barIndex,event.startSlot)+(workshopMeasureContextAtSlot(score,barIndex,event.startSlot,display).clefOctave || 0);
      return Object.assign({},event,{xmlStaff:index+1,xmlVoice:index*4+workshopEventVoiceCompat(event),xmlAccidental:!!accidentals.get(event.id),
        xmlPitch:event.kind==="note"?Object.assign({},event.pitch,{octave:event.pitch.octave+shift}):null});
    })),[]);
    for(const groupKey of ["beamGroupId","tupletGroupId"])Array.from(new Set(events.map(event=>event[groupKey]).filter(Boolean))).forEach(id=>{
      const members=events.filter(event=>event[groupKey]===id).sort((a,b)=>a.startSlot-b.startSlot),starts=Array.from(new Set(members.map(event=>event.startSlot))).sort((a,b)=>a-b);
      members.forEach(event=>{const type=event.startSlot===starts[0]?"begin":event.startSlot===starts[starts.length-1]?"end":"continue";
        if(groupKey==="beamGroupId") {
          const position=starts.indexOf(event.startSlot),before=members.filter(member=>member.startSlot===starts[position-1]),after=members.filter(member=>member.startSlot===starts[position+1]);
          const types=Array.from({length:beamCount(event)},(_,level)=>{
            const connectedBefore=before.some(member=>beamCount(member)>level),connectedAfter=after.some(member=>beamCount(member)>level);
            return connectedBefore&&connectedAfter?"continue":connectedBefore?"end":connectedAfter?"begin":position===starts.length-1?"backward hook":"forward hook";
          });
          beamMarks.set(event.id,types);
        }
        else if(type!=="continue")tupletMarks.set(event.id,{type:type==="begin"?"start":"stop",display:workshopTupletDisplay(members.find(member=>workshopTupletDisplay(member)))});
      });
    });
    let cursor=0;
    const voices=Array.from(new Set(events.map(event=>event.xmlVoice))).sort((a,b)=>a-b);
    voices.forEach(voice=>{
      if(cursor>0)xml+="<backup>"+xmlElement("duration",Math.round(cursor*WORKSHOP_TICKS_PER_UNIT))+"</backup>";cursor=0;
      let previousEvent=null;
      events.filter(event=>event.xmlVoice===voice).sort((a,b)=>a.startSlot-b.startSlot || Number(!!b.grace)-Number(!!a.grace) || a.id.localeCompare(b.id)).forEach(event=>{
        const chord=previousEvent&&event.kind==="note"&&previousEvent.kind==="note"&&event.startSlot===previousEvent.startSlot
          && workshopEventUnits(event)===workshopEventUnits(previousEvent)&&!!event.grace===!!previousEvent.grace;
        if(!chord&&Math.abs(cursor-event.startSlot)>1e-7) {const delta=event.startSlot-cursor,name=delta>0?"forward":"backup";xml+=`<${name}>`+xmlElement("duration",Math.round(Math.abs(delta)*WORKSHOP_TICKS_PER_UNIT))+`</${name}>`;cursor=event.startSlot;}
        if(event.pedal)xml+=directionXml({type:"pedal",value:event.pedal},event.xmlStaff,event.startSlot-cursor);
        xml+=exportNote(event,event.xmlStaff,chord,score,beamMarks,tupletMarks,slurNumbers,glissandoNumbers);
        if(!chord&&!event.grace)cursor=event.startSlot+workshopEventUnits(event);previousEvent=event;
      });
      // Standard notation must describe silent trailing time too. In an
      // implicit pickup measure the importer cannot infer it from the meter.
      const measureUnits=barIndex===0 && score.pickupUnits!==undefined ? score.pickupUnits:workshopMeterUnits(context.meter);
      if(cursor<measureUnits-1e-7) {
        xml+="<forward>"+xmlElement("duration",Math.round((measureUnits-cursor)*WORKSHOP_TICKS_PER_UNIT))+xmlElement("voice",voice)+"</forward>";
        cursor=measureUnits;
      }
    });
    if(!voices.length)xml+="<note><rest measure=\"yes\"/>"+xmlElement("duration",Math.round((barIndex===0&&score.pickupUnits!==undefined?score.pickupUnits:workshopMeterUnits(context.meter))*WORKSHOP_TICKS_PER_UNIT))+"<voice>1</voice><staff>1</staff></note>";
    const jumps=(primary.navigation||[]).map(workshopNavigationEntry).filter(value=>!["segno","coda"].includes(value.kind));
    jumps.forEach(value=>{
      const attributes={dc:' dacapo="yes"',ds:` dalsegno="${esc(value.target || 'segno')}"`,toCoda:` tocoda="${esc(value.target || 'coda')}"`,fine:' fine="yes"'};
      const label={dc:"D.C.",ds:"D.S.",toCoda:"To Coda",fine:"Fine"}[value.kind]+(value.target?' '+value.target:'');
      xml+=`<direction><direction-type>${xmlElement("words",label)}</direction-type><sound${attributes[value.kind]||""}${value.passes?` time-only="${value.passes.join(',')}"`:''}/></direction>`;
    });
    if(primary.repeatEnd||primary.ending)xml+='<barline location="right">'+(primary.ending?`<ending number="${primary.ending.join(",")}" type="${primary.repeatEnd?"stop":"discontinue"}"/>`:"")+(primary.repeatEnd?`<repeat direction="backward" times="${primary.repeatEnd}"/>`:"")+"</barline>";
    xml+="</measure>";contexts.forEach((value,index)=>{previous[index]=workshopMeasureContextAtSlot(score,barIndex,Infinity,index);});
  }
  xml+="</part></score-partwise>";
  const nativeScore=cloneWorkshop(score);delete nativeScore.musicXml;
  const nativeField=xmlElement("miscellaneous-field",JSON.stringify({version:1,score:nativeScore,title,digest:workshopMusicXmlFingerprint({xml})}),` name="${NATIVE_FIELD}"`);
  if(xml.includes("</miscellaneous>"))xml=xml.replace("</miscellaneous>",nativeField+"</miscellaneous>");
  else xml=xml.replace("</identification>","<miscellaneous>"+nativeField+"</miscellaneous></identification>");
  // The digest refers to the exact document with only our score field removed.
  // When adding the wrapper above it belongs to that document too.
  if(musicXmlUtf8Encode(xml).length>WORKSHOP_MUSICXML_MAX_BYTES)error("musicxml-too-large","MusicXML export exceeds its safe size limit");
  const document=parseWorkshopMusicXmlDocument(xml), field=children(child(child(document,"identification"),"miscellaneous"),"miscellaneous-field").find(item=>item.attrs.name===NATIVE_FIELD);
  const view=xml.slice(0,field.start)+xml.slice(field.end), payload={version:1,score:nativeScore,title,digest:workshopMusicXmlFingerprint({xml:view})};
  xml=xml.slice(0,field.start)+xmlElement("miscellaneous-field",JSON.stringify(payload),` name="${NATIVE_FIELD}"`)+xml.slice(field.end);
  if(musicXmlUtf8Encode(xml).length>WORKSHOP_MUSICXML_MAX_BYTES)error("musicxml-too-large","MusicXML export exceeds its safe size limit");
  return {data:xml,mimeType:"application/vnd.recordare.musicxml+xml",extension:"musicxml",warnings};
}
export async function exportWorkshopMusicXml(score,options={}) {
  const result=exportWorkshopMusicXmlText(score,options);
  if(options.compressed) {
    const metadata=score.musicXml||{},assets=(metadata.archiveAssets||[]).map(asset=>({path:asset.path,data:base64DecodeBytes(asset.data)}));
    return Object.assign({},result,{data:writeMusicXmlArchive(result.data,{rootPath:metadata.rootPath,assets}),mimeType:"application/vnd.recordare.musicxml",extension:"mxl"});
  }
  return result;
}
