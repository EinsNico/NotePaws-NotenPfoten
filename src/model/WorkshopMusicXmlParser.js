import { WORKSHOP_MUSICXML_MAX_BYTES, musicXmlUtf8Encode } from "./WorkshopMusicXmlArchive";

function invalid(message) { throw new Error(message); }
function decode(text) {
  return text.replace(/&([^;\s<&]+);|&/g,(whole,name) => {
    if (!name) invalid("Invalid XML entity");
    const entities = { amp:"&", lt:"<", gt:">", quot:'"', apos:"'" };
    if (Object.prototype.hasOwnProperty.call(entities,name)) return entities[name];
    const numeric = /^#x[0-9a-f]+$/i.test(name) ? parseInt(name.slice(2),16) : /^#[0-9]+$/.test(name) ? Number(name.slice(1)) : NaN;
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 0x10ffff || numeric >= 0xd800 && numeric <= 0xdfff
      || numeric < 32 && ![9,10,13].includes(numeric)) invalid("Unsupported XML entity");
    return String.fromCodePoint(numeric);
  });
}
export function musicXmlEscape(value) {
  return String(value === undefined || value === null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
export function parseWorkshopMusicXmlDocument(xml) {
  if (typeof xml !== "string" || musicXmlUtf8Encode(xml).length > WORKSHOP_MUSICXML_MAX_BYTES) invalid("MusicXML document is too large");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml)) invalid("Invalid XML characters");
  // Standard MusicXML files frequently name their public DTD. We deliberately
  // ignore that declaration; internal subsets and custom entities are rejected.
  if (/<!ENTITY\b/i.test(xml) || /<!DOCTYPE[^>]*\[/i.test(xml)) invalid("XML entity declarations are not supported");
  const document = { name:"#document",children:[],text:"",attrs:Object.create(null) }, stack=[document];
  let position=xml.charCodeAt(0)===0xfeff ? 1 : 0, nodes=0, declarationSeen=false;
  function addText(value) { stack[stack.length-1].text += value; }
  while (position < xml.length) {
    if (xml[position] !== "<") {
      const next=xml.indexOf("<",position), end=next<0?xml.length:next;
      const value=decode(xml.slice(position,end));
      if (stack.length===1 && value.trim()) invalid("Text outside XML root");
      addText(value); position=end; continue;
    }
    if (xml.slice(position,position+4)==="<!--") {
      const end=xml.indexOf("-->",position+4);
      if (end<0 || xml.slice(position+4,end).includes("--")) invalid("Invalid XML comment");
      position=end+3; continue;
    }
    if (xml.slice(position,position+9)==="<![CDATA[") {
      if (stack.length===1) invalid("CDATA outside XML root");
      const end=xml.indexOf("]]>",position+9); if (end<0) invalid("Unclosed XML CDATA");
      addText(xml.slice(position+9,end)); position=end+3; continue;
    }
    if (xml.slice(position,position+2)==="<?") {
      const end=xml.indexOf("?>",position+2); if (end<0) invalid("Unclosed XML instruction");
      if (/^<\?xml\b/i.test(xml.slice(position,end))) {
        if (declarationSeen || document.children.length || stack.length!==1) invalid("Misplaced XML declaration");
        declarationSeen=true;
      }
      position=end+2; continue;
    }
    if (/^<!DOCTYPE\b/i.test(xml.slice(position,position+10))) {
      if (stack.length!==1 || document.children.length) invalid("Misplaced XML document declaration");
      const end=xml.indexOf(">",position+9); if (end<0) invalid("Unclosed XML declaration");
      position=end+1; continue;
    }
    if (xml.slice(position,position+2)==="<!") invalid("Unsupported XML declaration");
    let end=position+1, quote="";
    for (;end<xml.length;end++) {
      const char=xml[end];
      if (quote) { if (char===quote) quote=""; }
      else if (char==='"' || char==="'") quote=char;
      else if (char===">") break;
    }
    if (end>=xml.length || quote) invalid("Unclosed XML element");
    const content=xml.slice(position+1,end);
    if (content[0]==="/") {
      const fullName=content.slice(1).trim();
      if (!/^[A-Za-z_][\w.:-]*$/.test(fullName) || stack.length<=1 || stack[stack.length-1].fullName!==fullName) invalid("Mismatched XML element");
      const node=stack.pop(); node.end=end+1; node.raw=xml.slice(node.start,node.end); position=end+1; continue;
    }
    const match=/^([A-Za-z_][\w.:-]*)/.exec(content); if (!match) invalid("Invalid XML element name");
    const fullName=match[1], node={name:fullName.split(":").pop(),fullName,attrs:Object.create(null),children:[],text:"",start:position,end:end+1};
    let rest=content.slice(fullName.length), selfClosing=false;
    while (rest.length) {
      if (/^\s*\/\s*$/.test(rest)) { selfClosing=true; rest=""; break; }
      if (/^\s*$/.test(rest)) break;
      const attr=/^\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(rest);
      if (!attr || attr[3].includes("<") || Object.prototype.hasOwnProperty.call(node.attrs,attr[1])) invalid("Invalid XML attribute");
      node.attrs[attr[1]]=decode(attr[3]); rest=rest.slice(attr[0].length);
    }
    if (++nodes>120000 || stack.length>64) invalid("MusicXML document is too complex");
    stack[stack.length-1].children.push(node);
    if (selfClosing) node.raw=xml.slice(position,end+1); else stack.push(node);
    position=end+1;
  }
  if (stack.length!==1 || document.children.length!==1) invalid("MusicXML requires one complete root");
  return document.children[0];
}
export function musicXmlChildren(node,name) { return node && node.children ? node.children.filter(child=>child.name===name) : []; }
export function musicXmlChild(node,name) { return musicXmlChildren(node,name)[0] || null; }
export function musicXmlText(node,name,fallback="") {
  const selected = name ? musicXmlChild(node,name) : node;
  return selected ? selected.text.trim() : fallback;
}
export function musicXmlNumber(node,name,fallback=NaN) {
  const value=musicXmlText(node,name,""); return value==="" ? fallback : Number(value);
}
