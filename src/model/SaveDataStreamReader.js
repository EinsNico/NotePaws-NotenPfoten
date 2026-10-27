import { validateSaveDataBackup } from "./SaveDataBackup";
import { exceedsUnstreamedImportLimit } from "./SaveDataFiles";

// These are the potentially unbounded collections in a backup. They are
// emitted one record at a time; the remaining, small JSON document is kept
// as a shell for metadata and options.
export const STREAMED_BACKUP_ARRAYS = [
  "data.adaptiveHistory.baselines",
  "data.adaptiveHistory.evaluations",
  "data.adaptiveHistoryMidi.baselines",
  "data.adaptiveHistoryMidi.evaluations",
  "data.roundHistory",
  "data.roundHistory.rounds",
  "data.noteFlowRounds.screen",
  "data.noteFlowRounds.midi",
  "data.noteFlowRounds.chordMidi",
  "data.rhythmSenseBars"
];

const MAX_SHELL_CHARS = 16 * 1024 * 1024;
const MAX_ITEM_CHARS = 1024 * 1024;

export class SaveDataStreamReader {
  constructor(onItem) {
    if (typeof onItem !== "function") {
      throw new TypeError("A streamed backup needs an item callback.");
    }
    this.onItem = onItem;
    this.stack = [];
    this.shellParts = [];
    this.shellLength = 0;
    this.string = false;
    this.escaped = false;
    this.keyString = false;
    this.keyBuffer = "";
    this.array = null;
    this.seenArrays = new Set();
    this.counts = Object.create(null);
    this.finished = false;
  }

  appendShell(part) {
    if (!part) return;
    this.shellLength += part.length;
    if (this.shellLength > MAX_SHELL_CHARS) {
      throw new Error("The backup metadata is too large to stream safely.");
    }
    this.shellParts.push(part);
  }

  valuePath() {
    const parent = this.stack[this.stack.length - 1];
    if (!parent) return "";
    if (parent.type === "array") return `${parent.path}[]`;
    return parent.path
      ? `${parent.path}.${parent.key}`
      : String(parent.key);
  }

  readOutside(character) {
    if (this.string) {
      if (this.keyString) this.keyBuffer += character;
      if (this.escaped) {
        this.escaped = false;
      } else if (character === "\\") {
        this.escaped = true;
      } else if (character === '"') {
        this.string = false;
        if (this.keyString) {
          // Remove the closing quote before decoding JSON escapes in a key.
          const key = JSON.parse(this.keyBuffer);
          const parent = this.stack[this.stack.length - 1];
          parent.key = key;
          parent.expectKey = false;
          this.keyBuffer = "";
        }
      }
      return false;
    }
    const parent = this.stack[this.stack.length - 1];
    if (character === '"') {
      this.string = true;
      this.keyString = Boolean(parent && parent.type === "object" && parent.expectKey);
      this.keyBuffer = this.keyString ? '"' : "";
    } else if (character === "{") {
      this.stack.push({ type: "object", path: this.valuePath(), key: null, expectKey: true });
    } else if (character === "[") {
      const path = this.valuePath();
      if (STREAMED_BACKUP_ARRAYS.indexOf(path) !== -1) {
        if (this.seenArrays.has(path)) {
          throw new SyntaxError("Duplicate streamed backup array.");
        }
        this.seenArrays.add(path);
        this.array = {
          path, item: "", depth: 0, string: false, escaped: false,
          state: "start"
        };
        return true;
      }
      this.stack.push({ type: "array", path });
    } else if (character === "}" || character === "]") {
      this.stack.pop();
    } else if (character === "," && parent && parent.type === "object") {
      parent.key = null;
      parent.expectKey = true;
    }
    return false;
  }

  finishItem() {
    const item = JSON.parse(this.array.item);
    this.onItem(this.array.path, item);
    this.counts[this.array.path] = (this.counts[this.array.path] || 0) + 1;
    this.array.item = "";
  }

  readArray(character) {
    const array = this.array;
    if (!array.item) {
      if (/\s/.test(character)) return false;
      if (character === "]") {
        if (array.state === "afterComma") {
          throw new SyntaxError("Trailing comma in streamed backup array.");
        }
        this.array = null;
        return true;
      }
      if (character === ",") {
        throw new SyntaxError("Missing item in streamed backup array.");
      }
      array.state = "item";
    } else if (!array.string && array.depth === 0
      && (character === "," || character === "]")) {
      this.finishItem();
      if (character === "]") {
        this.array = null;
        return true;
      }
      array.state = "afterComma";
      return false;
    }
    array.item += character;
    if (array.item.length > MAX_ITEM_CHARS) {
      throw new Error("A backup record is too large to stream safely.");
    }
    if (array.string) {
      if (array.escaped) array.escaped = false;
      else if (character === "\\") array.escaped = true;
      else if (character === '"') array.string = false;
    } else if (character === '"') {
      array.string = true;
    } else if (character === "{" || character === "[") {
      array.depth += 1;
    } else if (character === "}" || character === "]") {
      array.depth -= 1;
    }
    return false;
  }

  push(chunk) {
    if (this.finished) throw new Error("The backup stream is already finished.");
    if (typeof chunk !== "string") throw new TypeError("Backup chunks must be text.");
    let start = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (this.array) {
        if (this.readArray(chunk[index])) start = index + 1;
      } else if (this.readOutside(chunk[index])) {
        this.appendShell(chunk.slice(start, index));
        this.appendShell("[]");
        start = index + 1;
      }
    }
    if (!this.array) this.appendShell(chunk.slice(start));
  }

  finish() {
    if (this.finished) throw new Error("The backup stream is already finished.");
    this.finished = true;
    if (this.array || this.string || this.stack.length) {
      throw new SyntaxError("The backup JSON ended before it was complete.");
    }
    const backup = JSON.parse(this.shellParts.join(""));
    const validation = validateSaveDataBackup(backup);
    if (!validation.valid) {
      throw new Error(`Invalid backup metadata: ${validation.errors.join(", ")}`);
    }
    return { backup, counts: Object.assign({}, this.counts) };
  }
}

function decodeNativeChunk(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

// Preserve the established small-file import path after the Android streaming
// picker has selected a document. Enforce the old limit while reading too,
// because some document providers cannot report the file size in advance.
export async function readNativeSelectedBackupText(plugin, selected, options = {}) {
  if (!selected || selected.status !== "selected" || !selected.token) {
    throw new Error("No Android backup stream was selected.");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts = [];
  let bytesRead = 0;
  let done = false;
  try {
    while (!done) {
      const chunk = await new Promise((resolve, reject) => {
        plugin.readChunk(selected.token, resolve, reject);
      });
      if (!chunk || chunk.status !== "chunk" || chunk.token !== selected.token
        || typeof chunk.data !== "string" || typeof chunk.done !== "boolean") {
        throw new Error("Android returned an invalid backup chunk.");
      }
      const bytes = decodeNativeChunk(chunk.data);
      bytesRead += bytes.length;
      if (exceedsUnstreamedImportLimit(bytesRead)) {
        throw new Error("file-too-large");
      }
      parts.push(decoder.decode(bytes, { stream: true }));
      if (options.shouldContinue && !options.shouldContinue()) {
        const error = new Error("The backup import was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      done = chunk.done;
    }
    parts.push(decoder.decode());
    return { text: parts.join(""), size: bytesRead };
  } finally {
    if (!done) {
      try {
        await new Promise((resolve, reject) => {
          plugin.closeStream(selected.token, resolve, reject);
        });
      } catch (ignored) { }
    }
  }
}

export async function readNativeSaveDataStream(plugin, onItem, options = {}) {
  if (!plugin || typeof plugin.openStream !== "function"
    || typeof plugin.readChunk !== "function"
    || typeof plugin.closeStream !== "function") {
    throw new TypeError("The Android stream reader is unavailable.");
  }
  const selected = await new Promise((resolve, reject) => {
    plugin.openStream("application/json", resolve, reject);
  });
  if (!selected || selected.status !== "selected" || !selected.token) {
    return null;
  }
  const reader = new SaveDataStreamReader(onItem);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let done = false;
  let bytesRead = 0;
  try {
    while (!done) {
      const chunk = await new Promise((resolve, reject) => {
        plugin.readChunk(selected.token, resolve, reject);
      });
      if (!chunk || chunk.status !== "chunk" || chunk.token !== selected.token
        || typeof chunk.data !== "string" || typeof chunk.done !== "boolean") {
        throw new Error("Android returned an invalid backup chunk.");
      }
      const bytes = decodeNativeChunk(chunk.data);
      bytesRead += bytes.length;
      reader.push(decoder.decode(bytes, { stream: true }));
      if (options.afterChunk) await options.afterChunk();
      if (options.onProgress) options.onProgress(bytesRead, selected.size);
      done = chunk.done;
    }
    reader.push(decoder.decode());
    // Android provider metadata may be missing or stale. Preview the actual
    // bytes consumed, not the declared size (which may even be -1).
    return Object.assign({ size: bytesRead }, reader.finish());
  } finally {
    if (!done) {
      try {
        await new Promise((resolve, reject) => {
          plugin.closeStream(selected.token, resolve, reject);
        });
      } catch (ignored) {
        // Keep the original parse/read error; the plugin also closes on
        // destruction and after a native read failure.
      }
    }
  }
}

export async function readBrowserSaveDataStream(file, onItem, options = {}) {
  if (!file || typeof file.slice !== "function") {
    throw new TypeError("A readable backup file is required.");
  }
  const reader = new SaveDataStreamReader(onItem);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let offset = 0; offset < file.size; offset += 64 * 1024) {
    const bytes = await file.slice(offset, offset + 64 * 1024).arrayBuffer();
    reader.push(decoder.decode(bytes, { stream: true }));
    if (options.afterChunk) await options.afterChunk();
    if (options.onProgress) options.onProgress(Math.min(offset + bytes.byteLength, file.size), file.size);
  }
  reader.push(decoder.decode());
  return Object.assign({ size: file.size }, reader.finish());
}

export default SaveDataStreamReader;
