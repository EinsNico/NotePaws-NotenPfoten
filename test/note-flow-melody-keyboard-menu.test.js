const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");

// These tests use the real Options persistence code against this process's RAM only.
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const values = new Map();
global.localStorage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] || null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
const originalVueLoader = Module._extensions[".vue"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
function component(name) {
  const filename = path.join(sourceRoot, "components", name + ".vue");
  const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
}
const Options = require("../src/model/Options").default;
const { normalizeNoteFlowChordOptions } = require("../src/model/NoteFlowChordConfig");
const { createNoteFlowConfigFromMenu } = require("../src/model/NoteFlowMenuConfig");
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { getNoteRange } = require("../src/model/NoteRanges");
const dictionaries = { de: require("../src/resources/de").default, en: require("../src/resources/en").default };
const keyboardDefinition = component("CustomKeyboardPreview");
const menuDefinition = component("NoteFlowMenu");
menuDefinition.components = Object.assign({}, menuDefinition.components, { CustomKeyboardPreview: keyboardDefinition });
Module._extensions[".js"] = originalLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function translate(locale) {
  return (key, params = {}) => {
    assert(Object.prototype.hasOwnProperty.call(dictionaries[locale], key), "missing " + locale + " translation: " + key);
    return dictionaries[locale][key].replace(/\{([^}]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
  };
}
const singleNoteFields = ["clef", "difficulty", "customMinValue", "customBassMaxValue", "customTrebleMinValue", "customMaxValue", "accidentals", "inputMode"];
function unrelatedPreferences() {
  return plain({ chord: Options.noteFlowChordSettings, single: Object.fromEntries(singleNoteFields.map(key => [key, Options[key]])) });
}
function view(locale = "de", reset = true) {
  if (reset) {
    values.clear();
    Object.assign(Options, {
      noteFlowMelodySettings: null, noteFlowMelodyMovement: "mixed",
      noteFlowChordSettings: normalizeNoteFlowChordOptions({ handMode: "two", chordSize: 8,
        customMinValue: 24, customBassMaxValue: 48, customTrebleMinValue: 48, customMaxValue: 72 }),
      clef: ["treble"], difficulty: "hard", customMinValue: 28, customBassMaxValue: 48,
      customTrebleMinValue: 48, customMaxValue: 69, accidentals: "no", inputMode: "button",
      language: "de", noteNaming: "german"
    });
  }
  const vm = new Vue(Object.assign({}, menuDefinition, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, menuDefinition.methods, { $t: translate(locale) })
  }));
  vm.$i18n = { locale };
  return vm;
}
function nodes(root) {
  if (!root) return [];
  return [root].concat((root.children || []).flatMap(nodes));
}
function text(root) { return nodes(root).map(node => node.text || "").join(""); }
function attrs(node) { return node.data && node.data.attrs || {}; }
function child(root, name) {
  return nodes(root).find(node => node.componentOptions && node.componentOptions.tag === name);
}
function button(root, label) {
  const found = nodes(root).find(node => node.tag === "button" && text(node).trim() === String(label));
  assert(found, "missing rendered native button " + label);
  assert.strictEqual(attrs(found).type, "button");
  return found;
}
function click(node) { assert(node.data && node.data.on && node.data.on.click); node.data.on.click(); }
function select(root, id) {
  const found = nodes(root).find(node => node.tag === "select" && attrs(node).id === id);
  assert(found, "missing rendered range selector " + id);
  assert(nodes(root).some(node => node.tag === "label" && attrs(node).for === id), "range selector must have a native label");
  return found;
}
function changeSelect(vm, id, value) {
  const field = select(vm._render(), id);
  assert(field.data.on.change);
  field.data.on.change({ target: { value: String(value) } });
}
function keyboard(vm) {
  const vnode = child(vm._render(), "CustomKeyboardPreview");
  assert(vnode, "the actual shared keyboard is rendered");
  const widget = new Vue(Object.assign({}, keyboardDefinition, {
    propsData: vnode.componentOptions.propsData, parent: vm,
    methods: Object.assign({}, keyboardDefinition.methods, { $t: translate(vm.$i18n.locale) })
  }));
  Object.keys(vnode.componentOptions.listeners).forEach(event => {
    [].concat(vnode.componentOptions.listeners[event]).forEach(listener => widget.$on(event, listener));
  });
  return widget;
}
function sliders(widget) { return nodes(widget._render()).filter(node => attrs(node).role === "slider"); }
function emitHandle(vm, handle, value) {
  const widget = keyboard(vm);
  widget.updateHandle(handle, value);
  widget.$destroy();
}
function ranges(vm) { return plain(createNoteFlowConfigFromMenu(vm.previewOptions).ranges); }
function custom(vm) {
  vm.openSettingSection("notes");
  vm.updateClefs(["bass", "treble"]);
  vm.updateRange("treble", "min", vm.rangeValues.customTrebleMinValue);
}
function assertGeneratedRanges(vm) {
  const config = Object.assign({}, createNoteFlowConfigFromMenu(vm.previewOptions), { seed: "melody-keyboard-ui" });
  const cycle = generateNoteFlowCycle(config);
  assert.strictEqual(cycle.timeline.eventCount, 32);
  for (const event of cycle.timeline.events) for (const note of event.notes) {
    assert(config.clefs.includes(note.clef));
    assert(note.value >= config.ranges[note.clef].min && note.value <= config.ranges[note.clef].max,
      note.clef + " note " + note.value + " must respect the visible selected register");
  }
  return cycle;
}
const tests = [];
function test(name, body) { tests.push({ name, body }); }

for (const locale of ["de", "en"]) test(locale + " Notes & keys exposes native choices, per-clef Min/Max pairs and the shared keyboard", async () => {
  const vm = view(locale);
  vm.openSettingSection("notes");
  let rendered = vm._render();
  for (const option of vm.difficultyOptions) {
    assert.notStrictEqual(attrs(button(rendered, option.label))["aria-pressed"], undefined);
  }
  assert(child(rendered, "CustomKeyboardPreview"), "keyboard is visible without a Custom range button");
  assert.deepStrictEqual(vm.difficultyOptions.map(option=>option.value), ["easy","normal","hard"]);
  custom(vm);
  rendered = vm._render();
  assert(child(rendered, "CustomKeyboardPreview"));
  for (const clef of ["bass", "treble"]) {
    const low = select(rendered, "flow-" + clef + "-min");
    const high = select(rendered, "flow-" + clef + "-max");
    assert(nodes(rendered).indexOf(low) < nodes(rendered).indexOf(high), "lowest note precedes highest within each pair");
  }
  for (const option of vm.clefOptions.concat(vm.tonalityModeOptions)) {
    assert.notStrictEqual(attrs(button(rendered, option.label))["aria-pressed"], undefined);
  }
  const widget = keyboard(vm);
  assert.strictEqual(sliders(widget).length, 4);
  for (const slider of sliders(widget)) {
    assert(attrs(slider)["aria-label"]);
    assert(attrs(slider)["aria-valuetext"]);
    assert(Number(attrs(slider)["aria-valuemin"]) <= Number(attrs(slider)["aria-valuenow"]));
    assert(Number(attrs(slider)["aria-valuenow"]) <= Number(attrs(slider)["aria-valuemax"]));
  }
  widget.$destroy();
  await Vue.nextTick();
  vm.$destroy();
});

test("all four graphical events feed real generated melody ranges, persistence, reload and the actual Start action", async () => {
  const vm = view();
  const unrelated = unrelatedPreferences();
  custom(vm);
  vm.updateHandMode("two");
  emitHandle(vm, "min", 36);
  emitHandle(vm, "bass", 60);
  emitHandle(vm, "treble", 48);
  emitHandle(vm, "max", 72);
  assert.deepStrictEqual(ranges(vm), { bass: { min: 36, max: 60 }, treble: { min: 48, max: 72 } });
  const cycle = assertGeneratedRanges(vm);
  assert(cycle.timeline.simultaneousEventCount > 0, "two hands retain the supporting voice");
  await Vue.nextTick();
  assert(values.size > 0, "actual Options persistence writes to the isolated RAM adapter");
  let started;
  vm.$on("startPreview", value => { started = value; });
  const start = nodes(vm._render()).find(node => node.tag === "button"
    && node.data.staticClass === "note-flow-start");
  assert(start && text(start).includes(dictionaries.de.FLOW_START_PREVIEW));
  click(start);
  assert(started && started.menuOptions);
  assert.deepStrictEqual(plain(createNoteFlowConfigFromMenu(started.menuOptions).ranges), ranges(vm));
  const persisted = plain(Options.noteFlowMelodySettings);
  assert.deepStrictEqual(unrelatedPreferences(), unrelated);
  Options.noteFlowMelodySettings = null;
  Options.loadOptions();
  const reopened = view("de", false);
  reopened.openSettingSection("notes");
  assert.deepStrictEqual(plain(reopened.previewOptions), persisted.menuOptions);
  assert.deepStrictEqual(ranges(reopened), ranges(vm));
  assertGeneratedRanges(reopened);
  assert.deepStrictEqual(unrelatedPreferences(), unrelated, "Melody never rewrites chord or single-note preferences");
  vm.$destroy();
  reopened.$destroy();
});

test("range presets set the visible registers; moving a handle applies immediately and survives reload", async () => {
  const vm = view();
  custom(vm);
  changeSelect(vm, "flow-bass-min", 36);
  changeSelect(vm, "flow-bass-max", 60);
  changeSelect(vm, "flow-treble-min", 48);
  changeSelect(vm, "flow-treble-max", 72);
  vm.updateHandMode("two");
  for (const difficulty of ["easy", "normal", "hard"]) {
    click(button(vm._render(), vm.difficultyOptions.find(option => option.value === difficulty).label));
    assert.strictEqual(vm.previewOptions.difficulty, difficulty);
    assert(child(vm._render(), "CustomKeyboardPreview"));
    assert.strictEqual(vm.rangePreset, difficulty);
    assert.deepStrictEqual(ranges(vm), {bass:getNoteRange("bass",difficulty),treble:getNoteRange("treble",difficulty)});
    const config = createNoteFlowConfigFromMenu(vm.previewOptions);
    const cycle = generateNoteFlowCycle(Object.assign({}, config, { seed: "preset-" + difficulty }));
    for (const event of cycle.timeline.events) for (const note of event.notes) {
      const range = getNoteRange(note.clef, difficulty);
      assert(note.value >= range.min && note.value <= range.max, "preset keeps its established playing range");
    }
  }
  emitHandle(vm, "max", 79);
  assert.strictEqual(vm.previewOptions.difficulty, "custom");
  assert.strictEqual(ranges(vm).treble.max, 79);
  assert.strictEqual(vm.rangePreset, null);
  assertGeneratedRanges(vm);
  await Vue.nextTick();
  Options.loadOptions();
  const reopened = view("de", false);
  assert.strictEqual(ranges(reopened).treble.max, 79);
  assert.strictEqual(reopened.previewOptions.difficulty, "custom");
  reopened.$destroy();
  vm.$destroy();
});

for (const clef of ["bass", "treble"]) test("single " + clef + " keeps two graphical grips, its other register and its selected clef across hand-mode changes", async () => {
  const vm = view();
  custom(vm);
  vm.updateClefs([clef]);
  const inactive = clef === "bass" ? "treble" : "bass";
  const inactiveBefore = ranges(vm)[inactive];
  let widget = keyboard(vm);
  assert.strictEqual(sliders(widget).length, 2);
  assert.strictEqual(widget.showClefAssignment, false);
  widget.$destroy();
  emitHandle(vm, "min", 36);
  emitHandle(vm, "max", 72);
  assert.deepStrictEqual(ranges(vm)[clef], { min: 36, max: 72 });
  assert.deepStrictEqual(ranges(vm)[inactive], inactiveBefore);
  assert(!nodes(vm._render()).some(node => node.tag === "select" && attrs(node).id === "flow-" + inactive + "-min"));
  assertGeneratedRanges(vm);
  vm.updateHandMode("two");
  widget = keyboard(vm);
  assert.strictEqual(sliders(widget).length, 4);
  widget.$destroy();
  vm.updateHandMode("single");
  assert.deepStrictEqual(plain(vm.previewOptions.clef), [clef]);
  assert.deepStrictEqual(ranges(vm)[inactive], inactiveBefore);
  await Vue.nextTick();
  Options.loadOptions();
  const reopened = view("de", false);
  reopened.openSettingSection("notes");
  assert.deepStrictEqual(plain(reopened.previewOptions.clef), [clef]);
  assert.deepStrictEqual(ranges(reopened)[clef], { min: 36, max: 72 });
  assert.deepStrictEqual(ranges(reopened)[inactive], inactiveBefore);
  vm.$destroy();
  reopened.$destroy();
});

test("native clef toggles preserve single-hand Piano and Bass plus Treble with four grips", async () => {
  const vm = view("en");
  custom(vm);
  click(button(vm._render(), dictionaries.en.piano));
  assert.deepStrictEqual(plain(vm.previewOptions.clef), ["piano"]);
  assert.strictEqual(vm.previewOptions.handMode, "single");
  let widget = keyboard(vm);
  assert.strictEqual(sliders(widget).length, 4);
  widget.$destroy();
  assertGeneratedRanges(vm);
  click(button(vm._render(), dictionaries.en.bassClef));
  assert.deepStrictEqual(plain(vm.previewOptions.clef), ["bass"]);
  click(button(vm._render(), dictionaries.en.trebleClef));
  assert.deepStrictEqual(plain(vm.previewOptions.clef), ["bass", "treble"]);
  widget = keyboard(vm);
  assert.strictEqual(sliders(widget).length, 4);
  widget.$destroy();
  assertGeneratedRanges(vm);
  click(button(vm._render(), dictionaries.en.bassClef));
  click(button(vm._render(), dictionaries.en.trebleClef));
  assert.deepStrictEqual(plain(vm.previewOptions.clef), ["treble"], "the final selected clef cannot be removed");
  await Vue.nextTick();
  vm.$destroy();
});

test("all four native range selectors repair reversed pairs only in the changed clef", async () => {
  const vm = view();
  custom(vm);
  const originalTreble = ranges(vm).treble;
  changeSelect(vm, "flow-bass-min", 60);
  assert.deepStrictEqual(ranges(vm).bass, { min: 60, max: 60 });
  assert.deepStrictEqual(ranges(vm).treble, originalTreble);
  changeSelect(vm, "flow-bass-max", 36);
  assert.deepStrictEqual(ranges(vm).bass, { min: 36, max: 36 });
  assert.deepStrictEqual(ranges(vm).treble, originalTreble);
  const collapsedBass = ranges(vm).bass;
  changeSelect(vm, "flow-treble-min", 72);
  assert.deepStrictEqual(ranges(vm).treble, { min: 72, max: 72 });
  assert.deepStrictEqual(ranges(vm).bass, collapsedBass);
  changeSelect(vm, "flow-treble-max", 48);
  assert.deepStrictEqual(ranges(vm).treble, { min: 48, max: 48 });
  assert.deepStrictEqual(ranges(vm).bass, collapsedBass);
  await Vue.nextTick();
  Options.loadOptions();
  const reopened = view("de", false);
  assert.deepStrictEqual(ranges(reopened), ranges(vm));
  vm.$destroy();
  reopened.$destroy();
});

test("keyboard arrow/Home/End events update the selected menu range with bounded accessible values", async () => {
  const vm = view("en");
  custom(vm);
  vm.updateClefs(["treble"]);
  const inactive = ranges(vm).bass;
  changeSelect(vm, "flow-treble-min", 36);
  changeSelect(vm, "flow-treble-max", 72);
  let prevented = 0;
  function key(handle, name) {
    const widget = keyboard(vm);
    widget.moveHandleByKeyboard(handle, { key: name, preventDefault() { prevented += 1; } });
    widget.$destroy();
  }
  key("min", "ArrowRight");
  assert.strictEqual(vm.previewOptions.customTrebleMinValue, 38);
  key("max", "End");
  assert.strictEqual(vm.previewOptions.customMaxValue, 95);
  key("max", "Home");
  assert.strictEqual(vm.previewOptions.customMaxValue, 38, "a graphical upper grip cannot pass its own lower grip");
  assert.deepStrictEqual(ranges(vm).bass, inactive);
  assert.strictEqual(prevented, 3);
  const widget = keyboard(vm);
  assert(sliders(widget).every(slider => Number(attrs(slider)["aria-valuenow"]) === 38));
  widget.$destroy();
  await Vue.nextTick();
  vm.$destroy();
});

test("real menu ranges and shared overlap legend retain overlapping, touching, gapped and swapped registers", async () => {
  const vm = view();
  custom(vm);
  const cases = [
    { bass: [36, 60], treble: [48, 72], overlap: true },
    { bass: [36, 48], treble: [48, 72], overlap: true },
    { bass: [36, 48], treble: [60, 72], overlap: false },
    { bass: [60, 72], treble: [36, 48], overlap: false }
  ];
  for (const value of cases) {
    for (const clef of ["bass", "treble"]) {
      changeSelect(vm, "flow-" + clef + "-min", value[clef][0]);
      changeSelect(vm, "flow-" + clef + "-max", value[clef][1]);
    }
    const widget = keyboard(vm);
    assert.strictEqual(widget.hasClefOverlap, value.overlap);
    assert.strictEqual(text(widget._render()).includes(dictionaries.de.CUSTOM_RANGE_UNUSED), !value.overlap);
    assert.deepStrictEqual(ranges(vm), { bass: { min: value.bass[0], max: value.bass[1] },
      treble: { min: value.treble[0], max: value.treble[1] } });
    assertGeneratedRanges(vm);
    widget.$destroy();
  }
  await Vue.nextTick();
  vm.$destroy();
});

async function run() {
  for (const { name, body } of tests) {
    await body();
    process.stdout.write("✓ " + name + "\n");
  }
  process.stdout.write("Melody graphical keyboard menu: " + tests.length + " checks passed\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
