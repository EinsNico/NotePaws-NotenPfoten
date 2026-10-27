// The workshop uses the existing Android document picker without changing the
// backup format. MusicXML and ZIP bytes are passed through bounded chunks.
import { WORKSHOP_MUSICXML_MAX_BYTES, WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES } from "./WorkshopMusicXmlArchive";
const MAX_IMPORT_BYTES = WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES;
const MAX_EXPORT_BYTES = WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES;
function nativeFiles() { return typeof window !== 'undefined' && window.cordova && window.cordova.plugins && window.cordova.plugins.saveDataFile; }
function invoke(adapter, method, args) { return new Promise((resolve,reject)=>adapter[method].apply(adapter,args.concat([resolve,reject]))); }
function decodeBase64(text) { const raw=atob(text),bytes=new Uint8Array(raw.length); for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i); return bytes; }
function encodeBase64(bytes) { let text=''; for (let i=0;i<bytes.length;i++) text+=String.fromCharCode(bytes[i]); return btoa(text); }

// Android's document reader may not supply a name or MIME type. Inspect only
// the opening bytes; the existing format parser still validates the file.
export function workshopMusicFileKind(file) {
  if (!file) return null;
  const data=file.data;
  const bytes=data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer,data.byteOffset,data.byteLength) : null;
  const prefix=typeof data==='string' ? data : bytes ? String.fromCharCode(...bytes.subarray(0,4)) : '';
  if (prefix.slice(0,4)==='MThd') return 'midi';
  if (prefix.slice(0,2)==='PK' || bytes && (bytes[0]===255 && bytes[1]===254 || bytes[0]===254 && bytes[1]===255)) return 'musicxml';
  if (bytes) {
    let offset=bytes[0]===239 && bytes[1]===187 && bytes[2]===191 ? 3 : 0;
    while(offset<bytes.length && [9,10,13,32].includes(bytes[offset])) offset++;
    if (bytes[offset]===60) return 'musicxml';
  } else if (prefix.replace(/^\uFEFF?\s*/,'').charAt(0)==='<') return 'musicxml';
  const filename=String(file.filename || ''),mime=String(file.mimeType || '').toLowerCase().split(';')[0].trim();
  if (/\.(mid|midi)$/i.test(filename) || ['audio/midi','audio/x-midi'].includes(mime)) return 'midi';
  if (/\.(xml|musicxml|mxl)$/i.test(filename) || ['application/xml','text/xml','application/vnd.recordare.musicxml','application/vnd.recordare.musicxml+xml'].includes(mime)) return 'musicxml';
  return null;
}

export async function readWorkshopMusicFile(file, adapter=nativeFiles()) {
  if (file) {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('musicxml-too-large');
    const data=typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Promise((resolve,reject)=>{
      const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(reader.error); reader.readAsArrayBuffer(file);
    });
    if (data.byteLength > MAX_IMPORT_BYTES) throw new Error('musicxml-too-large');
    const result={data:new Uint8Array(data),filename:file.name};
    if (file.type) result.mimeType=file.type;
    return result;
  }
  if (!adapter || typeof adapter.openStream !== 'function') throw new Error('file-picker-unavailable');
  const selected=await invoke(adapter,'openStream',['*/*']);
  if (selected && selected.status === 'cancelled') return null;
  if (!selected || !selected.token) throw new Error('file-picker-unavailable');
  const chunks=[]; let size=0;
  try {
    if (selected.size > MAX_IMPORT_BYTES) throw new Error('musicxml-too-large');
    while (true) {
      const result=await invoke(adapter,'readChunk',[selected.token]);
      if (!result || result.token !== selected.token || typeof result.data !== 'string') throw new Error('invalid-file-chunk');
      const bytes=decodeBase64(result.data); size+=bytes.length;
      if (size > MAX_IMPORT_BYTES) throw new Error('musicxml-too-large');
      if (bytes.length) chunks.push(bytes);
      if (result.done) break;
      if (!bytes.length) throw new Error('empty-file-chunk');
    }
    const data=new Uint8Array(size); let offset=0; chunks.forEach(bytes=>{data.set(bytes,offset);offset+=bytes.length;});
    return {data,filename:selected.name || ''};
  } finally { try { await invoke(adapter,'closeStream',[selected.token]); } catch (ignored) { /* Native EOF already closes the reader. */ } }
}

export async function saveWorkshopMusicFile(result,title,adapter=nativeFiles()) {
  const filename=(String(title || 'score').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80) || 'score')+'.'+result.extension;
  const bytes=typeof result.data === 'string' ? new TextEncoder().encode(result.data) : result.data;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_EXPORT_BYTES) throw new Error('invalid-export');
  if (result.extension !== 'mxl' && bytes.byteLength > WORKSHOP_MUSICXML_MAX_BYTES) throw new Error('invalid-export');
  if (adapter) {
    const selected=await invoke(adapter,'openWriteStream',[filename,result.mimeType]);
    if (selected && selected.status === 'cancelled') return false;
    if (!selected || !selected.token) throw new Error('file-writer-unavailable');
    try {
      if (typeof adapter.writeBinaryChunk !== 'function') {
        // Old APKs can still export uncompressed text; compressed export needs
        // the newly packaged bridge so ZIP bytes cannot be corrupted as UTF-8.
        if (typeof result.data !== 'string') throw new Error('binary-writer-unavailable');
        for (let offset=0;offset<result.data.length;) {
          let end=Math.min(result.data.length,offset+16384);
          if (end<result.data.length && /[\uD800-\uDBFF]/.test(result.data[end-1])) end--;
          await invoke(adapter,'writeChunk',[selected.token,result.data.slice(offset,end)]); offset=end;
        }
      } else {
        for (let offset=0;offset<bytes.length;offset+=49152) await invoke(adapter,'writeBinaryChunk',[selected.token,encodeBase64(bytes.subarray(offset,offset+49152))]);
      }
      const saved=await invoke(adapter,'finishWriteStream',[selected.token,bytes.length]);
      if (!saved || saved.status !== 'saved' || saved.verified !== true || saved.bytesWritten !== bytes.length) throw new Error('file-verification-failed');
      return true;
    } catch (error) { try { await invoke(adapter,'abortWriteStream',[selected.token]); } catch (ignored) {} throw error; }
  }
  const blob=new Blob([bytes],{type:result.mimeType});
  if (typeof File === 'function' && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    const share={files:[new File([blob],filename,{type:result.mimeType})],title};
    if (navigator.canShare(share)) { try { await navigator.share(share); return true; } catch (error) { if (error.name === 'AbortError') return false; } }
  }
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  return true;
}
