import { WORKSHOP_STORAGE_KEY, cloneWorkshop, isValidWorkshopLibrary, saveWorkshopDraft, saveWorkshopPieceDetails, deleteWorkshopRevisions } from "./Workshop";
import { WORKSHOP_DEMO_PIECES, createWorkshopDemoDraft, isWorkshopDemoPiece } from "./WorkshopDemoPieces";
import { encodeWorkshopLibrary, decodeWorkshopLibrary } from "./WorkshopLibraryEncoding";

export function readWorkshopLibrary(storage = localStorage) {
  const raw = storage.getItem(WORKSHOP_STORAGE_KEY);
  if (raw === null) return { version: 1, pieces: [] };
  const wrapped = decodeWorkshopLibrary(raw);
  if (!wrapped || !isValidWorkshopLibrary(wrapped.data)) throw new Error("invalid-library");
  return wrapped.data || { version: 1, pieces: [] };
}

function writeWorkshopLibrary(library, previous, storage) {
  const serialized = encodeWorkshopLibrary(library);
  try {
    storage.setItem(WORKSHOP_STORAGE_KEY, serialized);
    if (storage.getItem(WORKSHOP_STORAGE_KEY) !== serialized) throw new Error("save-verification-failed");
  } catch (error) {
    // localStorage writes are atomic; roll back if a verification step failed.
    if (storage.getItem(WORKSHOP_STORAGE_KEY) !== previous) {
      if (previous === null) storage.removeItem(WORKSHOP_STORAGE_KEY);
      else storage.setItem(WORKSHOP_STORAGE_KEY, previous);
    }
    throw error;
  }
}

export function storeWorkshopDraft(draft, storage = localStorage) {
  const previous = storage.getItem(WORKSHOP_STORAGE_KEY);
  const result = saveWorkshopDraft(readWorkshopLibrary(storage), draft);
  writeWorkshopLibrary(result.library, previous, storage);
  return result;
}

export function storeWorkshopPieceDetails(originalDraft, updatedDraft, storage = localStorage) {
  const previous=storage.getItem(WORKSHOP_STORAGE_KEY);
  const result=saveWorkshopPieceDetails(readWorkshopLibrary(storage),originalDraft,updatedDraft);
  if (result.changed) writeWorkshopLibrary(result.library,previous,storage);
  return result;
}

export async function initializeWorkshopLibrary(storage = localStorage) {
  let library = readWorkshopLibrary(storage);
  for (const packaged of WORKSHOP_DEMO_PIECES) {
    if ((library.installedPieceIds || []).includes(packaged.id)) continue;
    let draft;
    // Importing the bundled XML is asynchronous. Always read again afterward:
    // another save or installer must not be overwritten by this older view.
    try {
      if (!library.pieces.some(piece => isWorkshopDemoPiece(piece, packaged.id))) {
        draft = await createWorkshopDemoDraft(packaged.id);
      }
    } catch (error) {
      return { library: readWorkshopLibrary(storage), warning: "demo-install-failed" };
    }
    const previous = storage.getItem(WORKSHOP_STORAGE_KEY);
    library = readWorkshopLibrary(storage);
    if ((library.installedPieceIds || []).includes(packaged.id)) continue;
    let next;
    try {
      if (library.pieces.some(piece => isWorkshopDemoPiece(piece, packaged.id))) next = cloneWorkshop(library);
      else {
        // Only the fast path for an existing copy can lack a draft. If that
        // copy disappeared while loading, defer installation to the next load.
        if (!draft) return { library, warning: "demo-install-failed" };
        next = saveWorkshopDraft(library, draft).library;
      }
      next.installedPieceIds = (next.installedPieceIds || []).concat(packaged.id);
      if (!isValidWorkshopLibrary(next)) throw new Error("library-full");
      writeWorkshopLibrary(next, previous, storage);
      library = next;
    } catch (error) {
      return { library: readWorkshopLibrary(storage), warning: error.message === "library-full" ? "library-full" : "demo-install-failed" };
    }
  }
  return { library };
}

export function deleteStoredWorkshopPiece(pieceId, storage = localStorage) {
  const previous = storage.getItem(WORKSHOP_STORAGE_KEY);
  // Read again when deleting so an older library view cannot overwrite newer saves.
  const current = readWorkshopLibrary(storage);
  const removedPiece = current.pieces.find(piece => piece.id === pieceId);
  if (!removedPiece) throw new Error("missing-piece");
  const library = cloneWorkshop(current);
  library.pieces = library.pieces.filter(piece => piece.id !== pieceId);
  writeWorkshopLibrary(library, previous, storage);
  return { library, removedPiece };
}

export function deleteStoredWorkshopRevisions(pieceId, revisionIds, storage = localStorage) {
  const previous=storage.getItem(WORKSHOP_STORAGE_KEY);
  // Re-read at confirmation time: a stale editor must never remove a newer
  // current version or overwrite a piece saved elsewhere in the meantime.
  const result=deleteWorkshopRevisions(readWorkshopLibrary(storage),pieceId,revisionIds);
  writeWorkshopLibrary(result.library,previous,storage);
  return result;
}
