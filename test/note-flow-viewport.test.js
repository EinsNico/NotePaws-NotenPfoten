const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

const source = fs.readFileSync(path.resolve(__dirname,
  "../src/model/NoteFlowViewport.js"), "utf8");
const loaded = { exports: {} };
new Function("module", "exports", babel.transform(source, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code)(loaded, loaded.exports);
const { lockNoteFlowViewport } = loaded.exports;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function declaration(initial = {}) {
  const values = Object.assign({}, initial);
  return {
    getPropertyValue(property) { return values[property] ? values[property].value : ""; },
    getPropertyPriority(property) { return values[property] ? values[property].priority || "" : ""; },
    setProperty(property, value, priority = "") { values[property] = { value, priority }; },
    removeProperty(property) { delete values[property]; }
  };
}

function element(parent = null, options = {}) {
  return Object.assign({
    nodeType: 1, parentElement: parent, style: declaration(),
    overflowX: "visible", overflowY: "visible",
    scrollTop: 0, scrollLeft: 0, scrollHeight: 0, clientHeight: 0,
    scrollWidth: 0, clientWidth: 0,
    contains(target) {
      for (let current = target; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    }
  }, options);
}

function fixture() {
  const listeners = {};
  const registrations = {};
  const html = element(null, { style: declaration({
    overflow: { value: "scroll", priority: "important" },
    "overscroll-behavior": { value: "contain", priority: "important" }
  }) });
  const body = element(html);
  const root = element(body);
  root.ownerDocument = {
    documentElement: html, body,
    defaultView: { getComputedStyle(target) { return target; } }
  };
  root.addEventListener = (type, handler, options) => {
    assert(!listeners[type], `duplicate ${type} handler`);
    listeners[type] = handler;
    registrations[type] = options;
  };
  root.removeEventListener = (type, handler) => {
    assert.strictEqual(listeners[type], handler);
    delete listeners[type];
  };
  const stage = element(root, {
    overflowY: "auto", scrollHeight: 700, clientHeight: 300
  });
  const label = element(stage);
  function send(type, options = {}) {
    const event = Object.assign({
      target: label, cancelable: true, deltaX: 0, deltaY: 0,
      touches: [], prevented: 0,
      preventDefault() { this.prevented++; }
    }, options);
    if (listeners[type]) listeners[type](event);
    return event;
  }
  return { html, body, root, stage, label, listeners, registrations, send };
}

function touch(x, y) { return { clientX: x, clientY: y }; }

test("viewport lock disables page scroll and registers cancellable movement guards", () => {
  const view = fixture();
  const release = lockNoteFlowViewport(view.root);
  for (const target of [view.html, view.body]) {
    assert.strictEqual(target.style.getPropertyValue("overflow"), "hidden");
    assert.strictEqual(target.style.getPropertyValue("overscroll-behavior"), "none");
  }
  assert.strictEqual(view.registrations.wheel.passive, false);
  assert.strictEqual(view.registrations.touchmove.passive, false);
  assert.strictEqual(view.registrations.touchstart.passive, true);
  assert.deepStrictEqual(Object.keys(view.listeners).sort(),
    ["touchcancel", "touchend", "touchmove", "touchstart", "wheel"]);
  release();
});

test("wheel scrolling stays available inside the score panel and stops at its edges", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  assert.strictEqual(view.send("wheel", { deltaY: -30 }).prevented, 1);
  assert.strictEqual(view.send("wheel", { deltaY: 30 }).prevented, 0);
  view.stage.scrollTop = 200;
  assert.strictEqual(view.send("wheel", { deltaY: -30 }).prevented, 0);
  assert.strictEqual(view.send("wheel", { deltaY: 30 }).prevented, 0);
  view.stage.scrollTop = 400;
  assert.strictEqual(view.send("wheel", { deltaY: 30 }).prevented, 1);
  assert.strictEqual(view.send("wheel", { deltaY: -30 }).prevented, 0);
  release();
});

test("the result overlay can scroll through nested labels and text-node targets", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  const results = element(view.root, {
    overflowY: "scroll", scrollHeight: 1000, clientHeight: 350, scrollTop: 120
  });
  const text = { nodeType: 3, parentElement: element(element(results)) };
  assert.strictEqual(view.send("wheel", { target: text, deltaY: 50 }).prevented, 0);
  assert.strictEqual(view.send("wheel", { target: text, deltaY: -50 }).prevented, 0);
  results.scrollTop = 650;
  assert.strictEqual(view.send("wheel", { target: text, deltaY: 50 }).prevented, 1);
  release();
});

test("horizontal keyboard or score scroll remains available without leaking beyond its edges", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  const keyboard = element(view.stage, {
    overflowX: "auto", scrollWidth: 850, clientWidth: 300, scrollLeft: 200
  });
  assert.strictEqual(view.send("wheel", { target: keyboard, deltaX: 60 }).prevented, 0);
  assert.strictEqual(view.send("wheel", { target: keyboard, deltaX: -60 }).prevented, 0);
  keyboard.scrollLeft = 550;
  assert.strictEqual(view.send("wheel", { target: keyboard, deltaX: 60 }).prevented, 1);
  keyboard.scrollLeft = 0;
  assert.strictEqual(view.send("wheel", { target: keyboard, deltaX: -60 }).prevented, 1);
  view.stage.scrollTop = 200;
  assert.strictEqual(view.send("wheel", {
    target: keyboard, deltaX: 2, deltaY: 20
  }).prevented, 0, "vertical gestures reach the surrounding score panel");
  release();
});

test("blank fixed areas never move the document, while zero and uncancellable events stay untouched", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  assert.strictEqual(view.send("wheel", { target: view.root, deltaY: 70 }).prevented, 1);
  assert.strictEqual(view.send("wheel", { target: view.root, deltaX: 70 }).prevented, 1);
  assert.strictEqual(view.send("wheel", { target: view.root }).prevented, 0);
  assert.strictEqual(view.send("wheel", {
    target: view.root, deltaY: 70, cancelable: false
  }).prevented, 0);
  release();
});

test("browser zoom and trackpad pinch keep their original wheel handling", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  assert.strictEqual(view.send("wheel", { deltaY: -90, ctrlKey: true }).prevented, 0);
  assert.strictEqual(view.send("wheel", { deltaY: -90, metaKey: true }).prevented, 0);
  release();
});

test("single-finger movement uses scroll direction and prevents top or bottom bounce", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  view.send("touchstart", { touches: [touch(10, 100)] });
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 130)] }).prevented, 1,
    "a downward finger movement tries to scroll above the top");
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 100)] }).prevented, 0,
    "an upward finger movement can scroll into the panel");
  view.stage.scrollTop = 400;
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 70)] }).prevented, 1,
    "an upward movement cannot pull below the panel bottom");
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 100)] }).prevented, 0);
  release();
});

test("multitouch pinch and ended or cancelled gestures are not trapped", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  view.send("touchstart", { touches: [touch(10, 100), touch(20, 110)] });
  assert.strictEqual(view.send("touchmove", {
    touches: [touch(10, 130), touch(20, 140)]
  }).prevented, 0);
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 150)] }).prevented, 0,
    "a pinch ending with one finger does not become a stale drag");
  for (const type of ["touchend", "touchcancel"]) {
    view.send("touchstart", { touches: [touch(10, 100)] });
    view.send(type);
    assert.strictEqual(view.send("touchmove", { touches: [touch(10, 130)] }).prevented, 0);
  }
  view.send("touchstart", { touches: [touch(10, 100)] });
  assert.strictEqual(view.send("touchmove", { touches: [touch(10, 130)] }).prevented, 1,
    "a fresh single-finger gesture is guarded again");
  release();
});

test("cleanup restores previous values and priorities, removes listeners and is idempotent", () => {
  const view = fixture(), release = lockNoteFlowViewport(view.root);
  release();
  assert.strictEqual(view.html.style.getPropertyValue("overflow"), "scroll");
  assert.strictEqual(view.html.style.getPropertyPriority("overflow"), "important");
  assert.strictEqual(view.html.style.getPropertyValue("overscroll-behavior"), "contain");
  assert.strictEqual(view.html.style.getPropertyPriority("overscroll-behavior"), "important");
  assert.strictEqual(view.body.style.getPropertyValue("overflow"), "");
  assert.strictEqual(view.body.style.getPropertyValue("overscroll-behavior"), "");
  assert.strictEqual(Object.keys(view.listeners).length, 0);
  assert.doesNotThrow(release);
  assert.strictEqual(view.send("wheel", { target: view.root, deltaY: 100 }).prevented, 0);
});

test("a missing mounted document safely returns an empty release function", () => {
  for (const root of [null, {}, { ownerDocument: {} }]) {
    assert.doesNotThrow(lockNoteFlowViewport(root));
  }
});

console.log("Note Flow viewport: inner scrolling, edge guards, gesture preservation and cleanup OK.");
