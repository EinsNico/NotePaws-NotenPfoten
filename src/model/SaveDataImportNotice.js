const IMPORT_SUCCESS_KEY = "noten-pfoten:import-success-notice";

function noticeStores(storage) {
  if (storage) return [storage];
  const stores = [];
  try { stores.push(window.sessionStorage); } catch (ignored) { }
  try {
    if (window.localStorage !== stores[0]) stores.push(window.localStorage);
  } catch (ignored) { }
  return stores;
}

export function markSaveDataImportSuccess(storage) {
  noticeStores(storage).forEach(store => {
    try { store.setItem(IMPORT_SUCCESS_KEY, "1"); } catch (ignored) { }
  });
  // A completed import must not fail because the optional notice cannot be saved.
}

export function takeSaveDataImportSuccess(storage) {
  let success = false;
  noticeStores(storage).forEach(store => {
    try {
      success = store.getItem(IMPORT_SUCCESS_KEY) === "1" || success;
      store.removeItem(IMPORT_SUCCESS_KEY);
    } catch (ignored) { }
  });
  return success;
}
