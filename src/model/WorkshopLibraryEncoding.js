import { deflate } from "pako/lib/deflate";
import { Inflate } from "pako/lib/inflate";
import { musicXmlUtf8Encode, musicXmlUtf8Decode } from "./WorkshopMusicXmlArchive";

const ENCODING = "notenpfoten-workshop-deflate-v1";
const MAX_PACKED_CHARS = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024 * 1024;

export function encodeWorkshopLibrary(library) {
  const json = JSON.stringify({ data: library });
  if (json.length < 128 * 1024) return json;
  const input = musicXmlUtf8Encode(json);
  if (input.length > MAX_JSON_BYTES) throw new Error("library-full");
  const packed = deflate(input, { level: 6 }), chunks = [];
  for (let offset = 0; offset < packed.length; offset += 24576)
    chunks.push(btoa(String.fromCharCode.apply(null, packed.subarray(offset, offset + 24576))));
  const encoded = JSON.stringify({ encoding: ENCODING, bytes: input.length, data: chunks.join("") });
  const result = encoded.length < json.length ? encoded : json;
  if (result.length > MAX_PACKED_CHARS) throw new Error("library-full");
  return result;
}

export function decodeWorkshopLibrary(raw) {
  const wrapped = JSON.parse(raw);
  if (!wrapped || !Object.prototype.hasOwnProperty.call(wrapped, "encoding")) return wrapped;
  if (wrapped.encoding !== ENCODING || !Number.isInteger(wrapped.bytes)
    || wrapped.bytes < 1 || wrapped.bytes > MAX_JSON_BYTES || typeof wrapped.data !== "string"
    || raw.length > MAX_PACKED_CHARS || wrapped.data.length % 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(wrapped.data)) throw new Error("invalid-library");
  const binary = atob(wrapped.data), input = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) input[i] = binary.charCodeAt(i);
  const reader = new Inflate({ chunkSize: 32768 }), chunks = [];
  let total = 0;
  reader.onData = chunk => {
    total += chunk.length;
    if (total > wrapped.bytes) throw new Error("invalid-library");
    chunks.push(chunk);
  };
  // The header limits output before it is allocated; also require an actual
  // end-of-stream so truncated data cannot masquerade as a valid saved library.
  if (!reader.push(input, false) || reader.err || !reader.ended
    || reader.strm.avail_in || total !== wrapped.bytes) throw new Error("invalid-library");
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length; });
  return JSON.parse(musicXmlUtf8Decode(output));
}
