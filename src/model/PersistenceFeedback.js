// This state deliberately lives outside persisted options. Pending changes stay
// in their owner; navigating between pages must not dismiss a failed save.
export const persistenceFeedback = { sources: [] };
const retries = new Map();

export function reportPersistenceFailure(id, labelKey, retry) {
  retries.set(id, retry);
  if (!persistenceFeedback.sources.some(source => source.id === id)) {
    persistenceFeedback.sources.push({ id, labelKey });
  }
}

export function clearPersistenceFailure(id) {
  retries.delete(id);
  const index = persistenceFeedback.sources.findIndex(source => source.id === id);
  if (index !== -1) persistenceFeedback.sources.splice(index, 1);
}

export function hasPersistenceFailure(id) {
  return persistenceFeedback.sources.some(source => source.id === id);
}

export function retryPersistenceFailures() {
  const ids = persistenceFeedback.sources.map(source => source.id);
  return ids.reduce((previous, id) => previous.then(() => {
    const retry = retries.get(id);
    if (typeof retry !== "function") return;
    return Promise.resolve().then(retry).catch(() => { /* Keep its warning until verified. */ });
  }), Promise.resolve()).then(() => persistenceFeedback.sources.length === 0);
}
