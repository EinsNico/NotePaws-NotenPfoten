// One lock is shared by active exercises; a late request must never keep a
// finished round awake. Android uses a window flag, without a wake-lock permission.
export function createScreenAwakeController(options = {}) {
  const host = options.window || (typeof window !== "undefined" ? window : null);
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  const nav = options.navigator || (typeof navigator !== "undefined" ? navigator : null);
  const owners = new Set();
  const listeners = [];
  let disposed = false;
  let paused = false;
  let pageHidden = false;
  let revision = 0;
  let webAttempt = -1;
  let webPending = false;
  let sentinel = null;
  let native = null;

  function wanted() {
    return !disposed && owners.size > 0 && !paused && !pageHidden
      && (!doc || (!doc.hidden && doc.visibilityState !== "hidden"));
  }

  function nativePlugin() {
    return options.plugin || (host && host.cordova && host.cordova.plugins
      && host.cordova.plugins.screenAwake);
  }

  function releaseWeb(lock) {
    if (!lock || lock.released || typeof lock.release !== "function") return;
    try { Promise.resolve(lock.release()).catch(() => {}); } catch (error) { /* Already released/unavailable. */ }
  }

  function dropWebLock() {
    const previous = sentinel;
    sentinel = null;
    releaseWeb(previous);
  }

  function syncNative() {
    const enabled = wanted();
    if (!native || native.pending || native.enabled === enabled
      || (native.failedRevision === revision && native.failedValue === enabled)) return;
    const record = native;
    const attemptRevision = revision;
    record.pending = true;
    const finish = success => {
      record.pending = false;
      if (success) record.enabled = attemptRevision === revision ? enabled : null;
      else { record.failedRevision = attemptRevision; record.failedValue = enabled; }
      // Commands are serialized. Lifecycle changes invalidate late acknowledgements:
      // Android may have cleared its window flag before JS received the callback.
      synchronize();
    };
    try { record.plugin.setEnabled(enabled, () => finish(true), () => finish(false)); }
    catch (error) { finish(false); }
  }

  function synchronize() {
    const plugin = nativePlugin();
    if (plugin && typeof plugin.setEnabled === "function" && !native) {
      native = { plugin, enabled: false, pending: false, failedRevision: -1 };
      revision++;
    }
    if (native) {
      dropWebLock();
      syncNative();
      return;
    }
    if (!wanted()) { dropWebLock(); return; }
    if (sentinel || webPending || webAttempt === revision || !nav
      || !nav.wakeLock || typeof nav.wakeLock.request !== "function") return;
    const requestedRevision = revision;
    webAttempt = requestedRevision;
    webPending = true;
    let request;
    try { request = nav.wakeLock.request("screen"); }
    catch (error) { webPending = false; return; }
    Promise.resolve(request).then(lock => {
      webPending = false;
      if (requestedRevision !== revision || !wanted() || native) {
        releaseWeb(lock);
        synchronize();
        return;
      }
      if (!lock || lock.released) return;
      sentinel = lock;
      if (typeof lock.addEventListener === "function") {
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
          // A system release (e.g. low battery) must not cause a retry loop.
          // Visibility/resume or a new round can request a fresh lock.
        }, { once: true });
      }
    }, () => {
      webPending = false;
      if (requestedRevision !== revision) synchronize();
    });
  }

  function refresh() { revision++; synchronize(); }
  function listen(target, event, handler) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }
  listen(doc, "visibilitychange", refresh);
  listen(doc, "deviceready", refresh);
  listen(doc, "pause", () => { paused = true; refresh(); });
  listen(doc, "resume", () => {
    paused = false;
    // Android clears its window flag independently onPause. A WebView may
    // suspend before its JS pause callback runs, so do not trust the old state.
    if (native && !native.pending) native.enabled = null;
    refresh();
  });
  listen(host, "pagehide", () => { pageHidden = true; refresh(); });
  listen(host, "pageshow", () => { pageHidden = false; refresh(); });

  return {
    acquire() {
      if (disposed) return () => {};
      const token = {};
      const alreadyWanted = wanted();
      owners.add(token);
      if (!alreadyWanted) revision++;
      synchronize();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners.delete(token);
        if (!owners.size) revision++;
        synchronize();
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      owners.clear();
      revision++;
      synchronize();
      listeners.forEach(remove => remove());
    }
  };
}

export default createScreenAwakeController();
