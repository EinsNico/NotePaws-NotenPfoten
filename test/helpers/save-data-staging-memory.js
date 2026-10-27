// Isolated IndexedDB-shaped staging adapter. Each open creates a connection
// to shared named stores; no browser storage or user data is touched.
module.exports = function stagingMemory() {
  const databases = new Map();
  const openedNames = [];
  const deletedNames = [];
  return {
    databases, openedNames, deletedNames,
    open(name) {
      openedNames.push(name);
      const request = {};
      queueMicrotask(() => {
        const created = !databases.has(name);
        if (created) databases.set(name, new Map());
        const stores = databases.get(name);
        let closed = false;
        request.result = {
          name,
          objectStoreNames: { contains: store => stores.has(store) },
          createObjectStore(store, options) {
            stores.set(store, { keyPath: options.keyPath, records: new Map() });
          },
          close() { closed = true; },
          transaction(names, mode) {
            if (closed) throw new Error("InvalidStateError");
            const selected = Array.isArray(names) ? names : [names];
            const copies = new Map(selected.map(store => [store,
              new Map(stores.get(store).records)]));
            const transaction = {
              objectStore(store) {
                const definition = stores.get(store);
                const rows = copies.get(store);
                const keyOf = value => Array.isArray(definition.keyPath)
                  ? JSON.stringify(definition.keyPath.map(key => value[key]))
                  : value[definition.keyPath];
                return {
                  add(value) {
                    if (rows.has(keyOf(value))) transaction.error = new Error("ConstraintError");
                    else rows.set(keyOf(value), JSON.parse(JSON.stringify(value)));
                  },
                  put(value) { rows.set(keyOf(value), JSON.parse(JSON.stringify(value))); },
                  clear() { rows.clear(); },
                  get(key) {
                    const read = {};
                    queueMicrotask(() => {
                      const value = rows.get(Array.isArray(key) ? JSON.stringify(key) : key);
                      read.result = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
                      read.onsuccess();
                    });
                    return read;
                  }
                };
              }
            };
            setImmediate(() => {
              if (transaction.error) {
                if (transaction.onabort) transaction.onabort();
              } else {
                if (mode === "readwrite") {
                  copies.forEach((copy, store) => { stores.get(store).records = copy; });
                }
                if (transaction.oncomplete) transaction.oncomplete();
              }
            });
            return transaction;
          }
        };
        if (created) request.onupgradeneeded({ target: request });
        request.onsuccess();
      });
      return request;
    },
    deleteDatabase(name) {
      const request = {};
      deletedNames.push(name);
      queueMicrotask(() => {
        databases.delete(name);
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
    alterMetadata(name, change) {
      const rows = databases.get(name).get("metadata").records;
      const next = JSON.parse(JSON.stringify(rows.get("ready")));
      change(next);
      rows.set("ready", next);
    }
  };
};
