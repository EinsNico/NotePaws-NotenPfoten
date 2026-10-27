const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const source = fs.readFileSync(path.resolve(__dirname, "../src/model/ScreenAwake.js"), "utf8");
const loaded = { exports: {} };
new Function("module", "exports", babel.transform(source, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code)(loaded, loaded.exports);
const { createScreenAwakeController } = loaded.exports;

function events(target = {}) {
  const listeners = {};
  return Object.assign(target, {
    addEventListener(name, handler) { (listeners[name] || (listeners[name] = [])).push(handler); },
    removeEventListener(name, handler) { listeners[name] = (listeners[name] || []).filter(value => value !== handler); },
    send(name) { (listeners[name] || []).slice().forEach(handler => handler()); },
    listenerCount() { return Object.keys(listeners).reduce((count, name) => count + listeners[name].length, 0); }
  });
}
function fixture() {
  const doc = events({ hidden: false, visibilityState: "visible" });
  const host = events();
  const requests = [];
  const nav = { wakeLock: { request(type) {
    assert.strictEqual(type, "screen");
    const request = {};
    request.promise = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject; });
    requests.push(request);
    return request.promise;
  } } };
  const controller = createScreenAwakeController({ document: doc, window: host, navigator: nav });
  return { controller, doc, host, nav, requests };
}
function lock() {
  return events({ released: false, releases: 0,
    release() { this.releases++; this.released = true; this.send("release"); return Promise.resolve(); }
  });
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("two exercises share one lock and the last release restores the timeout", async () => {
  const f = fixture(), first = f.controller.acquire(), second = f.controller.acquire();
  assert.strictEqual(f.requests.length, 1);
  const screen = lock(); f.requests[0].resolve(screen); await flush();
  first(); first(); assert.strictEqual(screen.releases, 0);
  second(); assert.strictEqual(screen.releases, 1);
  f.controller.dispose(); assert.strictEqual(screen.releases, 1);
});
test("a delayed browser request is released after the exercise ends", async () => {
  const f = fixture(), finish = f.controller.acquire();
  finish();
  const screen = lock(); f.requests[0].resolve(screen); await flush();
  assert.strictEqual(screen.releases, 1);
  assert.strictEqual(f.requests.length, 1);
  f.controller.dispose();
});
test("ending and restarting during a delayed request cannot reuse the old lock", async () => {
  const f = fixture(), finish = f.controller.acquire();
  finish(); const finishNext = f.controller.acquire();
  const stale = lock(); f.requests[0].resolve(stale); await flush();
  assert.strictEqual(stale.releases, 1);
  assert.strictEqual(f.requests.length, 2);
  const current = lock(); f.requests[1].resolve(current); await flush();
  assert.strictEqual(current.releases, 0);
  finishNext(); assert.strictEqual(current.releases, 1);
  f.controller.dispose();
});
test("visibility and Cordova pause release immediately and resume only when visible", async () => {
  const f = fixture(), finish = f.controller.acquire();
  const first = lock(); f.requests[0].resolve(first); await flush();
  f.doc.hidden = true; f.doc.visibilityState = "hidden"; f.doc.send("visibilitychange");
  assert.strictEqual(first.releases, 1);
  f.doc.send("pause"); f.doc.send("resume"); assert.strictEqual(f.requests.length, 1);
  f.doc.hidden = false; f.doc.visibilityState = "visible"; f.doc.send("visibilitychange");
  assert.strictEqual(f.requests.length, 2);
  const second = lock(); f.requests[1].resolve(second); await flush();
  f.doc.send("pause"); assert.strictEqual(second.releases, 1);
  f.doc.send("resume"); assert.strictEqual(f.requests.length, 3);
  finish(); const late = lock(); f.requests[2].resolve(late); await flush();
  assert.strictEqual(late.releases, 1);
  f.controller.dispose();
});
test("pagehide stops the lock and pageshow never wakes a completed round", async () => {
  const f = fixture(), finish = f.controller.acquire();
  const first = lock(); f.requests[0].resolve(first); await flush();
  f.host.send("pagehide"); assert.strictEqual(first.releases, 1);
  f.host.send("pageshow"); assert.strictEqual(f.requests.length, 2);
  finish(); const late = lock(); f.requests[1].resolve(late); await flush();
  f.host.send("pageshow"); assert.strictEqual(f.requests.length, 2);
  assert.strictEqual(late.releases, 1);
  f.controller.dispose();
});
test("system releases and request rejection do not cause a battery-draining retry loop", async () => {
  const f = fixture(), finish = f.controller.acquire();
  f.requests[0].reject(new Error("Low battery")); await flush();
  const finishOther = f.controller.acquire(); assert.strictEqual(f.requests.length, 1);
  finishOther(); assert.strictEqual(f.requests.length, 1);
  f.doc.send("resume"); assert.strictEqual(f.requests.length, 2);
  const screen = lock(); f.requests[1].resolve(screen); await flush();
  screen.release(); await flush(); assert.strictEqual(f.requests.length, 2);
  finish(); f.controller.dispose();
});
test("unsupported APIs and synchronous errors leave practice usable", () => {
  const controller = createScreenAwakeController({ navigator: {}, document: events(), window: events() });
  assert.doesNotThrow(() => { controller.acquire()(); controller.dispose(); });
  const failing = createScreenAwakeController({ navigator: { wakeLock: { request() { throw new Error("Unavailable"); } } } });
  assert.doesNotThrow(() => { failing.acquire()(); failing.dispose(); });
});
test("dispose removes listeners and releases even an outstanding acquisition", async () => {
  const f = fixture(); f.controller.acquire(); f.controller.dispose();
  assert.strictEqual(f.doc.listenerCount(), 0); assert.strictEqual(f.host.listenerCount(), 0);
  const late = lock(); f.requests[0].resolve(late); await flush();
  assert.strictEqual(late.releases, 1);
  f.controller.acquire()(); assert.strictEqual(f.requests.length, 1);
});
test("Android bridge wins over the browser API and serializes late enable/disable", () => {
  const calls = [], plugin = { setEnabled(enabled, success, error) { calls.push({ enabled, success, error }); } };
  const doc = events(), controller = createScreenAwakeController({ plugin, document: doc,
    navigator: { wakeLock: { request() { throw new Error("Browser fallback should not run"); } } } });
  const finish = controller.acquire(); assert.deepStrictEqual(calls.map(call => call.enabled), [true]);
  finish(); assert.strictEqual(calls.length, 1);
  calls[0].success(); assert.deepStrictEqual(calls.map(call => call.enabled), [true, false]);
  const finishNext = controller.acquire(); assert.strictEqual(calls.length, 2);
  calls[1].success(); assert.deepStrictEqual(calls.map(call => call.enabled), [true, false, true]);
  calls[2].success(); doc.send("pause"); assert.strictEqual(calls[3].enabled, false);
  calls[3].success(); doc.send("resume"); assert.strictEqual(calls[4].enabled, true);
  controller.dispose(); calls[4].success(); assert.strictEqual(calls[5].enabled, false);
  calls[5].success(); finishNext(); assert.strictEqual(calls.length, 6);
});
test("an Android bridge rejection retries only after a lifecycle change", () => {
  const calls = [], doc = events();
  const controller = createScreenAwakeController({ document: doc,
    plugin: { setEnabled(enabled, success, error) { calls.push({ enabled, success, error }); } } });
  const finish = controller.acquire(); calls[0].error("Paused"); assert.strictEqual(calls.length, 1);
  const finishOther = controller.acquire(); assert.strictEqual(calls.length, 1);
  doc.send("resume"); assert.strictEqual(calls.length, 2); calls[1].success();
  finish(); finishOther(); assert.strictEqual(calls[2].enabled, false); calls[2].success();
  controller.dispose();
});
test("native resume restores a cleared window flag even if JS missed the pause event", () => {
  const doc = events(), calls = [];
  const controller = createScreenAwakeController({ document: doc, plugin: {
    setEnabled(enabled, success) { calls.push(enabled); success(); }
  } });
  const finish = controller.acquire();
  assert.deepStrictEqual(calls, [true]);
  doc.send("resume"); assert.deepStrictEqual(calls, [true, true]);
  finish(); assert.deepStrictEqual(calls, [true, true, false]);
  controller.dispose();
});
test("native acknowledgements received after resume cannot confirm a cleared flag", () => {
  const doc = events(), calls = [];
  const controller = createScreenAwakeController({ document: doc, plugin: {
    setEnabled(enabled, success) { calls.push({ enabled, success }); }
  } });
  const finish = controller.acquire(); doc.send("resume");
  assert.strictEqual(calls.length, 1);
  calls[0].success(); assert.deepStrictEqual(calls.map(call => call.enabled), [true, true]);
  calls[1].success(); finish(); assert.strictEqual(calls[2].enabled, false);
  calls[2].success(); controller.dispose();
});
test("deviceready replaces an existing browser lock with the native window flag", async () => {
  const f = fixture(), finish = f.controller.acquire(), screen = lock();
  f.requests[0].resolve(screen); await flush();
  const calls = []; f.host.cordova = { plugins: { screenAwake: {
    setEnabled(enabled, success) { calls.push(enabled); success(); }
  } } };
  f.doc.send("deviceready"); assert.strictEqual(screen.releases, 1);
  assert.deepStrictEqual(calls, [true]);
  finish(); assert.deepStrictEqual(calls, [true, false]); f.controller.dispose();
});
test("the Vue mixin reacts to the global setting, explicit pause and destruction", async () => {
  const Vue = require("vue"), options = Vue.observable({ keepScreenAwake: true });
  let acquisitions = 0, releases = 0;
  const model = { acquire() { acquisitions++; return () => { releases++; }; } };
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/model/ScreenAwakeMixin.js"), "utf8");
  new Function("require", "module", "exports", babel.transform(source, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(name => ({ __esModule: true, default: name === "./Options" ? options : model }), module, module.exports);
  const vm = new Vue({ mixins: [module.exports.createScreenAwakeMixin(function() { return this.running && !this.paused; })],
    data: { running: false, paused: false } });
  assert.strictEqual(acquisitions, 0);
  vm.running = true; await Vue.nextTick(); assert.strictEqual(acquisitions, 1);
  vm.paused = true; await Vue.nextTick(); assert.strictEqual(releases, 1);
  vm.paused = false; await Vue.nextTick(); assert.strictEqual(acquisitions, 2);
  options.keepScreenAwake = false; await Vue.nextTick(); assert.strictEqual(releases, 2);
  options.keepScreenAwake = true; await Vue.nextTick(); assert.strictEqual(acquisitions, 3);
  vm.running = false; await Vue.nextTick(); assert.strictEqual(releases, 3);
  vm.running = true; await Vue.nextTick(); assert.strictEqual(acquisitions, 4);
  vm.$destroy(); assert.strictEqual(releases, 4);
});

(async () => {
  for (const { name, run } of tests) { await run(); process.stdout.write(`✓ ${name}\n`); }
  process.stdout.write(`Screen-awake tests passed (${tests.length} groups).\n`);
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exit(1); });
