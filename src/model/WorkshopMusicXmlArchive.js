// Small, bounded ZIP implementation for MusicXML. Nothing is extracted to disk,
// and neither XML nor archive paths can cause network or filesystem access.
// Edited documents contain the original source, native editor state and normal
// MusicXML notation. Bound that envelope separately from the 30 MiB original
// source limit and the unchanged 2 MiB attachment budget.
export const WORKSHOP_MUSICXML_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const WORKSHOP_MUSICXML_MAX_BYTES = 96 * 1024 * 1024;
export const WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES;
const MAX_ENTRIES = 128;
function fail(message) { throw new Error(message); }
export function musicXmlUtf8Encode(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const encoded = unescape(encodeURIComponent(text));
  return Uint8Array.from(encoded, char => char.charCodeAt(0));
}
export function musicXmlUtf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal:true }).decode(bytes);
  let binary = "";
  for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+8192));
  return decodeURIComponent(escape(binary));
}
const CRC_TABLE = Array.from({length:256}, (_,index) => {
  let value = index;
  for (let bit=0;bit<8;bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function musicXmlCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i=0;i<bytes.length;i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
function safePath(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 512
    && !name.startsWith("/") && !/[\\\u0000-\u001f]/.test(name)
    && !name.split("/").some(part => part === ".." || part === ".") && !/^[A-Za-z]:/.test(name);
}
function huffman(lengths) {
  const counts = new Array(16).fill(0), next = new Array(16).fill(0), table = new Map();
  lengths.forEach(length => { if (length < 0 || length > 15) fail("Invalid DEFLATE code length"); if (length) counts[length]++; });
  let code = 0;
  for (let bits=1;bits<=15;bits++) { code = (code + counts[bits-1]) << 1; next[bits] = code; if (code + counts[bits] > 1 << bits) fail("Invalid DEFLATE Huffman tree"); }
  lengths.forEach((length,symbol) => {
    if (!length) return;
    const value = next[length]++; let reversed = 0;
    for (let i=0;i<length;i++) reversed = reversed << 1 | value >>> i & 1;
    table.set(length * 65536 + reversed,symbol);
  });
  return table;
}
const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DISTANCE_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DISTANCE_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
export function inflateMusicXmlRaw(input, expectedSize) {
  if (!Number.isInteger(expectedSize) || expectedSize < 0 || expectedSize > WORKSHOP_MUSICXML_MAX_BYTES) fail("MusicXML archive entry is too large");
  const output = new Uint8Array(expectedSize); let position = 0, bitPosition = 0;
  function bits(count) {
    if (bitPosition + count > input.length * 8) fail("Truncated DEFLATE data");
    let value = 0;
    for (let i=0;i<count;i++,bitPosition++) value |= (input[bitPosition >>> 3] >>> (bitPosition & 7) & 1) << i;
    return value;
  }
  function symbol(tree) {
    let value = 0;
    for (let count=1;count<=15;count++) { value |= bits(1) << count-1; const result = tree.get(count * 65536 + value); if (result !== undefined) return result; }
    fail("Invalid DEFLATE symbol");
  }
  function write(value) { if (position >= expectedSize) fail("DEFLATE output exceeds declared size"); output[position++] = value; }
  let final = false;
  while (!final) {
    final = !!bits(1); const type = bits(2);
    if (type === 0) {
      bitPosition = Math.ceil(bitPosition / 8) * 8;
      const length = bits(16), complement = bits(16);
      if ((length ^ 0xffff) !== complement) fail("Invalid DEFLATE stored block");
      for (let i=0;i<length;i++) write(bits(8));
      continue;
    }
    if (type === 3) fail("Invalid DEFLATE block");
    let literalTree, distanceTree;
    if (type === 1) {
      literalTree = huffman(Array.from({length:288},(_,i) => i<=143 ? 8 : i<=255 ? 9 : i<=279 ? 7 : 8));
      distanceTree = huffman(new Array(32).fill(5));
    } else {
      const literalCount = bits(5)+257, distanceCount = bits(5)+1, codeCount = bits(4)+4;
      if (literalCount > 286 || distanceCount > 32) fail("Invalid DEFLATE tree size");
      const order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const codeLengths = new Array(19).fill(0);
      for (let i=0;i<codeCount;i++) codeLengths[order[i]] = bits(3);
      const codeTree = huffman(codeLengths), lengths = [];
      while (lengths.length < literalCount + distanceCount) {
        const value = symbol(codeTree);
        if (value <= 15) lengths.push(value);
        else {
          if (value === 16 && !lengths.length) fail("Invalid DEFLATE repeated code");
          const count = value === 16 ? bits(2)+3 : value === 17 ? bits(3)+3 : value === 18 ? bits(7)+11 : 0;
          if (!count || lengths.length + count > literalCount + distanceCount) fail("Invalid DEFLATE code run");
          const repeated = value === 16 ? lengths[lengths.length-1] : 0;
          for (let i=0;i<count;i++) lengths.push(repeated);
        }
      }
      if (!lengths[256]) fail("Missing DEFLATE end code");
      literalTree = huffman(lengths.slice(0,literalCount)); distanceTree = huffman(lengths.slice(literalCount));
    }
    while (true) {
      const value = symbol(literalTree);
      if (value < 256) { write(value); continue; }
      if (value === 256) break;
      if (value > 285) fail("Invalid DEFLATE length");
      const length = LENGTH_BASE[value-257] + bits(LENGTH_EXTRA[value-257]), distanceCode = symbol(distanceTree);
      if (distanceCode >= DISTANCE_BASE.length) fail("Invalid DEFLATE distance");
      const distance = DISTANCE_BASE[distanceCode] + bits(DISTANCE_EXTRA[distanceCode]);
      if (distance > position) fail("DEFLATE distance before output");
      for (let i=0;i<length;i++) write(output[position-distance]);
    }
  }
  if (position !== expectedSize) fail("Incorrect DEFLATE output size");
  return output;
}
export function readMusicXmlArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES) fail("Invalid or oversized MusicXML archive");
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16 = offset => { if (offset < 0 || offset+2 > bytes.length) fail("Truncated ZIP archive"); return view.getUint16(offset,true); };
  const u32 = offset => { if (offset < 0 || offset+4 > bytes.length) fail("Truncated ZIP archive"); return view.getUint32(offset,true); };
  let end = -1;
  for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if (u32(i) === 0x06054b50 && i+22+u16(i+20) === bytes.length) { end=i; break; }
  if (end < 0 || u16(end+4) || u16(end+6) || u16(end+8) !== u16(end+10)) fail("Unsupported ZIP archive");
  const count = u16(end+10), centralSize = u32(end+12), centralOffset = u32(end+16);
  if (!count || count > MAX_ENTRIES || centralOffset+centralSize !== end) fail("Invalid ZIP directory");
  const entries = new Map(); let cursor = centralOffset, total = 0;
  for (let i=0;i<count;i++) {
    if (u32(cursor) !== 0x02014b50) fail("Invalid ZIP entry");
    const flags=u16(cursor+8), method=u16(cursor+10), crc=u32(cursor+16), compressed=u32(cursor+20), size=u32(cursor+24);
    const nameLength=u16(cursor+28), extraLength=u16(cursor+30), commentLength=u16(cursor+32), local=u32(cursor+42);
    if (cursor+46+nameLength+extraLength+commentLength > end) fail("Truncated ZIP entry");
    const name = musicXmlUtf8Decode(bytes.subarray(cursor+46,cursor+46+nameLength));
    total += size;
    if (!safePath(name) || entries.has(name) || flags & 1 || ![0,8].includes(method) || size > WORKSHOP_MUSICXML_MAX_BYTES
      || total > MAX_ARCHIVE_BYTES || local+30 > centralOffset || u32(local) !== 0x04034b50) fail("Unsafe or unsupported ZIP entry");
    const localFlags=u16(local+6), localMethod=u16(local+8), localNameLength=u16(local+26), localExtra=u16(local+28);
    const localName=musicXmlUtf8Decode(bytes.subarray(local+30,local+30+localNameLength)), start=local+30+localNameLength+localExtra;
    if (localName !== name || localMethod !== method || localFlags !== flags || start+compressed > centralOffset) fail("Inconsistent ZIP entry");
    const packed = bytes.subarray(start,start+compressed), decoded = method === 0 ? packed.slice() : inflateMusicXmlRaw(packed,size);
    if (decoded.length !== size || musicXmlCrc32(decoded) !== crc) fail("MusicXML archive checksum mismatch");
    entries.set(name,decoded); cursor += 46+nameLength+extraLength+commentLength;
  }
  if (cursor !== end) fail("Invalid ZIP directory length");
  return entries;
}
// Stored DEFLATE blocks remain standards-compliant without a bundled compressor.
function deflateStored(bytes) {
  const blocks=Math.max(1,Math.ceil(bytes.length/65535)), output=new Uint8Array(bytes.length+blocks*5), view=new DataView(output.buffer);
  let source=0,target=0;
  for (let i=0;i<blocks;i++) {
    const size=Math.min(65535,bytes.length-source); output[target++]=i===blocks-1 ? 1 : 0;
    view.setUint16(target,size,true); view.setUint16(target+2,size ^ 0xffff,true); target+=4;
    output.set(bytes.subarray(source,source+size),target); source+=size; target+=size;
  }
  return output;
}
export function writeMusicXmlArchive(xml,options={}) {
  const rootPath=options.rootPath||"score.musicxml",assets=options.assets||[];
  if(!safePath(rootPath)||["mimetype","META-INF/container.xml"].includes(rootPath)||rootPath.endsWith("/"))fail("Unsafe MusicXML root path");
  const escapedPath=rootPath.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const files = [
    ["mimetype",musicXmlUtf8Encode("application/vnd.recordare.musicxml"),0],
    ["META-INF/container.xml",musicXmlUtf8Encode('<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="'+escapedPath+'" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),8],
    [rootPath,musicXmlUtf8Encode(xml),8]
  ];
  if(assets.length>MAX_ENTRIES-3)fail("Too many MusicXML archive assets");
  const names=new Set(files.map(file=>file[0]));let assetSize=0;
  assets.forEach(asset=>{
    if(!asset||!safePath(asset.path)||names.has(asset.path)||!(asset.data instanceof Uint8Array))fail("Unsafe MusicXML archive asset");
    names.add(asset.path);assetSize+=asset.data.length;
    if(assetSize>2*1024*1024)fail("MusicXML archive assets are too large");
    files.push([asset.path,asset.data,8]);
  });
  if (files[2][1].length > WORKSHOP_MUSICXML_MAX_BYTES) fail("MusicXML export is too large");
  const entries=files.map(([name,data,method]) => ({name:musicXmlUtf8Encode(name),data,method,packed:method===8?deflateStored(data):data,crc:musicXmlCrc32(data)}));
  const size=entries.reduce((sum,item)=>sum+30+item.name.length+item.packed.length+46+item.name.length,22);
  if(size>MAX_ARCHIVE_BYTES || entries.reduce((sum,item)=>sum+item.data.length,0)>MAX_ARCHIVE_BYTES)fail("MusicXML archive export is too large");
  const output=new Uint8Array(size), view=new DataView(output.buffer);
  const u16=(offset,value)=>view.setUint16(offset,value,true), u32=(offset,value)=>view.setUint32(offset,value,true);
  let cursor=0;
  entries.forEach(item=>{
    item.offset=cursor; u32(cursor,0x04034b50); u16(cursor+4,20); u16(cursor+6,0x800); u16(cursor+8,item.method); u32(cursor+14,item.crc);
    u32(cursor+18,item.packed.length); u32(cursor+22,item.data.length); u16(cursor+26,item.name.length);
    output.set(item.name,cursor+30); output.set(item.packed,cursor+30+item.name.length); cursor+=30+item.name.length+item.packed.length;
  });
  const central=cursor;
  entries.forEach(item=>{
    u32(cursor,0x02014b50); u16(cursor+4,20); u16(cursor+6,20); u16(cursor+8,0x800); u16(cursor+10,item.method); u32(cursor+16,item.crc);
    u32(cursor+20,item.packed.length); u32(cursor+24,item.data.length); u16(cursor+28,item.name.length); u32(cursor+42,item.offset);
    output.set(item.name,cursor+46); cursor+=46+item.name.length;
  });
  u32(cursor,0x06054b50); u16(cursor+8,entries.length); u16(cursor+10,entries.length); u32(cursor+12,cursor-central); u32(cursor+16,central);
  return output;
}
