const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");

// Execute Vue's real attribute patcher against a minimal element adapter. This
// covers Vue 2's DOM removal of boolean false without installing a DOM library.
const patchDomAttrs = new Function("module", "exports", "require",
  fs.readFileSync(require.resolve("vue/dist/vue.common.dev.js"), "utf8") + "\nreturn updateAttrs;"
)({ exports: {} }, {}, require);

function domAttribute(vnode, name) {
  const attributes = {};
  vnode.elm = {
    tagName: "BUTTON",
    setAttribute(key, value) { attributes[key] = String(value); },
    removeAttribute(key) { delete attributes[key]; }
  };
  patchDomAttrs({ data: { attrs: {} } }, vnode);
  return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
}

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src", relative), "utf8");
  const parsed = relative.endsWith(".vue") ? compiler.parseComponent(source) : null;
  const module = { exports: {} };
  new Function("module", "exports", "require", babel.transform(parsed ? parsed.script.content : source, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(module, module.exports, name => {
    assert(Object.prototype.hasOwnProperty.call(dependencies, name), relative + " dependency " + name);
    return dependencies[name];
  });
  if (parsed) {
    const compiled = compiler.compile(parsed.template.content);
    assert.deepStrictEqual(compiled.errors, [], relative + " template");
    Object.assign(module.exports.default, compiler.compileToFunctions(parsed.template.content));
  }
  return module.exports;
}

function instance(component, propsData) {
  return new Vue(Object.assign({}, component, {
    propsData,
    mounted: undefined,
    beforeDestroy: undefined,
    methods: Object.assign({}, component.methods, { $t: key => key })
  }));
}

function nodes(root) {
  return (Array.isArray(root) ? root : [root]).reduce((all, node) =>
    node ? all.concat(node, nodes(node.children || [])) : all, []);
}

function text(root) {
  return nodes(root).map(node => node.text || "").join(" ");
}

function handlers(handler, event) {
  (Array.isArray(handler) ? handler : [handler]).forEach(fn => fn(event));
}

function test(name, body) {
  body();
  process.stdout.write("✓ " + name + "\n");
}

const naming = load("model/NoteNaming.js");
const utils = load("model/Utils.js", { "./NoteNaming": naming }).default;
const ranges = load("model/NoteRanges.js");
const clefs = load("model/ClefSelection.js");
const multi = load("components/SelectOptionMulti.vue").default;
const preview = load("components/CustomKeyboardPreview.vue", {
  "../model/Utils": utils,
  "../model/Options": { noteNaming: "international" },
  "../model/NoteNaming": naming,
  "../model/NoteRanges": ranges
}).default;
const result = load("components/LastResultDisplay.vue").default;
const note = load("components/NoteDisplay.vue", {
  "../model/Utils": utils,
  abcjs: { renderAbc() { throw new Error("This VNode test does not mount ABC notation"); } }
}).default;
const items = [
  { value: "treble", label: "Violin" },
  { value: "bass", label: "Bass" },
  { value: "piano", label: "Klavier" }
];

test("clef choices expose native buttons and the selected state", () => {
  const vm = instance(multi, { label: "Notenschlüssel", items, value: ["treble"] });
  const tree = nodes(vm._render());
  const group = tree.find(node => node.data && node.data.attrs && node.data.attrs.role === "group");
  assert.strictEqual(group.data.attrs["aria-label"], "Notenschlüssel");
  const buttons = tree.filter(node => node.tag === "button");
  assert.strictEqual(buttons.length, 3);
  assert.deepStrictEqual(buttons.map(node => node.data.attrs.type), ["button", "button", "button"]);
  assert.deepStrictEqual(buttons.map(node => node.data.attrs["aria-pressed"]), ["true", "false", "false"]);
  assert.deepStrictEqual(buttons.map(node => domAttribute(node, "aria-pressed")), ["true", "false", "false"],
    "unselected buttons must retain an explicit false state after Vue's DOM attribute patch");
  assert.strictEqual(domAttribute({ data: { attrs: { "aria-pressed": false } } }, "aria-pressed"), null,
    "the Vue 2 boolean-false removal control must reproduce the original regression");
  assert(buttons.every(node => !Object.prototype.hasOwnProperty.call(node.data.attrs, "tabindex")),
    "native button focus must not be removed");
  vm.$destroy();
});

test("native choice activation preserves the minimum choice and exclusive piano transitions", () => {
  const vm = instance(multi, { label: "Notenschlüssel", items, value: ["treble"] });
  const requests = [];
  vm.$on("input", requested => {
    requests.push(requested.slice());
    vm.value = clefs.updateExclusivePianoClefs(vm.value, requested, items.map(item => item.value));
  });
  const activate = label => {
    const button = nodes(vm._render()).find(node => node.tag === "button" && text(node).trim() === label);
    button.data.on.click();
  };
  activate("Violin");
  assert.strictEqual(requests.length, 0, "the last selected clef cannot be removed");
  activate("Bass");
  assert.deepStrictEqual(vm.value, ["treble", "bass"]);
  activate("Violin");
  assert.deepStrictEqual(vm.value, ["bass"]);
  activate("Klavier");
  assert.deepStrictEqual(vm.value, ["piano"]);
  activate("Klavier");
  assert.deepStrictEqual(vm.value, ["piano"]);
  activate("Violin");
  assert.deepStrictEqual(vm.value, ["treble"]);
  const buttons = nodes(vm._render()).filter(node => node.tag === "button");
  assert.deepStrictEqual(buttons.map(node => node.data.attrs["aria-pressed"]), ["true", "false", "false"]);
  vm.$destroy();
});

test("shared keyboard preview selects its hint from the existing two/four-handle configuration", () => {
  for (const showClefAssignment of [false, true]) {
    const vm = instance(preview, { minValue: 36, maxValue: 72, trebleMinValue: 48, bassMaxValue: 60,
      accidentals: "no", showClefAssignment });
    const tree = vm._render();
    const content = text(tree);
    assert(content.includes(showClefAssignment ? "CUSTOM_RANGE_DRAG_HINT" : "CUSTOM_RANGE_SINGLE_DRAG_HINT"));
    assert(!content.includes(showClefAssignment ? "CUSTOM_RANGE_SINGLE_DRAG_HINT" : "CUSTOM_RANGE_DRAG_HINT"));
    const sliders = nodes(tree).filter(node => node.data && node.data.attrs && node.data.attrs.role === "slider");
    assert.strictEqual(sliders.length, showClefAssignment ? 4 : 2);
    assert.strictEqual(vm.rangeMinimum, ranges.MIN_CUSTOM_VALUE);
    assert.strictEqual(vm.rangeMaximum, ranges.MAX_CUSTOM_VALUE);
    assert.strictEqual(vm.bassMinHandleMaximum, showClefAssignment ? 60 : 72);
    assert.strictEqual(vm.trebleMaxHandleMinimum, showClefAssignment ? 48 : 36);
    vm.$destroy();
  }
});

test("the corrected hint leaves existing natural-note movements and bounds intact", () => {
  const vm = instance(preview, { minValue: 48, maxValue: 50, accidentals: "no", showClefAssignment: false });
  const values = [];
  vm.$on("update:min-value", value => values.push(["min", value]));
  vm.$on("update:max-value", value => values.push(["max", value]));
  let prevented = 0;
  vm.moveHandleByKeyboard("min", { key: "ArrowRight", preventDefault() { prevented += 1; } });
  vm.moveHandleByKeyboard("min", { key: "End", preventDefault() { prevented += 1; } });
  vm.moveHandleByKeyboard("max", { key: "Home", preventDefault() { prevented += 1; } });
  assert.deepStrictEqual(values, [["min", 50], ["min", 50], ["max", 48]]);
  assert.strictEqual(prevented, 3);
  assert.deepStrictEqual(vm.selectionClasses(49), {}, "accidentals stay excluded");
  assert.deepStrictEqual(vm.selectionClasses(48), { selected: true });
  vm.$destroy();
});

test("only an explicitly unlimited result suppresses points, including the timed zero-score control", () => {
  for (const [isInfiniteRound, score] of [[true, 0], [false, 0], [false, 125], [undefined, 0]]) {
    const vm = instance(result, { lastResult: { isInfiniteRound, score, accuracy: 80, numCorrect: 4, numWrong: 1 } });
    const tree = vm._render();
    const content = text(tree);
    const strongValues = nodes(tree).filter(node => node.tag === "strong").map(text).map(value => value.trim());
    assert.strictEqual(content.includes("SINGLE_NOTES_NO_SCORE"), isInfiniteRound === true);
    assert.deepStrictEqual(strongValues, isInfiniteRound === true ? ["4", "1", "80 %"] : ["4", "1", String(score), "80 %"]);
    const metrics = nodes(tree).filter(node => node.data && node.data.staticClass === "result-value").map(text);
    assert(metrics[0].replace(/\s/g, "").includes("4CORRECT") && metrics[1].replace(/\s/g, "").includes("1wrong"));
    assert.strictEqual(nodes(tree).filter(node => node.tag === "button").length, 0,
      "actions belong to the shared session header");
    vm.$destroy();
  }
});

test("note-card click, Enter and Space emit the same preview action without an answer event", () => {
  const vm = instance(note, { currentExercise: { clef: "treble", staff: "treble", value: 48, isSharp: true } });
  const card = nodes(vm._render()).find(node => node.data && node.data.attrs && node.data.attrs.id === "note-display");
  assert.strictEqual(card.data.attrs.role, "button");
  assert.strictEqual(card.data.attrs.tabindex, 0);
  assert.strictEqual(card.data.attrs["aria-label"], "SINGLE_NOTES_PREVIEW_NOTE");
  const emitted = [];
  vm.$emit = name => emitted.push(name);
  let prevented = 0;
  for (const [key, keyCode] of [["Enter", 13], [" ", 32], ["c", 67]]) {
    handlers(card.data.on.keydown, { type: "keydown", key, keyCode, preventDefault() { prevented += 1; } });
  }
  card.data.on.click();
  assert.deepStrictEqual(emitted, ["play", "play", "play"]);
  assert.strictEqual(prevented, 2, "Space and Enter prevent their default browser action");
  assert.strictEqual(vm.abc, "L:1/4\nK:C treble\nC");
  vm.$destroy();
});

test("preparation removes note-card tab focus and blocks all three preview activations", () => {
  const vm = instance(note, { currentExercise: { clef: "bass", staff: "piano", value: 36, isSharp: true },
    isPreparing: true, preparationRemainingSeconds: 3 });
  const card = nodes(vm._render()).find(node => node.data && node.data.attrs && node.data.attrs.id === "note-display");
  assert.strictEqual(card.data.attrs.tabindex, -1);
  assert.strictEqual(card.data.attrs["aria-disabled"], true);
  const emitted = [];
  vm.$emit = name => emitted.push(name);
  handlers(card.data.on.keydown, { type: "keydown", key: "Enter", keyCode: 13, preventDefault() {} });
  handlers(card.data.on.keydown, { type: "keydown", key: " ", keyCode: 32, preventDefault() {} });
  card.data.on.click();
  assert.deepStrictEqual(emitted, []);
  assert.strictEqual(vm.abc, "L:1/4\n%%score {1 2}\nV:1 clef=treble\nV:2 clef=bass\nK:C\n[V:1] z\n[V:2] C,");
  vm.$destroy();
});

process.stdout.write("All 7 single-note design-control groups passed.\n");
