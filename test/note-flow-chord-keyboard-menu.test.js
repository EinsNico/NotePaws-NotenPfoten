const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
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
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const dictionaries = { de: require("../src/resources/de").default, en: require("../src/resources/en").default };
const keyboardDefinition = component("CustomKeyboardPreview");
const menuDefinition = component("NoteFlowChordMenu");
const { getNoteRange } = require("../src/model/NoteRanges");
menuDefinition.components = Object.assign({}, menuDefinition.components, { CustomKeyboardPreview: keyboardDefinition });
Module._extensions[".js"] = originalLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

function translate(locale) {
  return (key, params = {}) => {
    assert(Object.prototype.hasOwnProperty.call(dictionaries[locale], key), "missing " + locale + " translation: " + key);
    return dictionaries[locale][key].replace(/\{([^}]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
  };
}
function view(locale = "de", reset = true) {
  if (reset) {
    values.clear();
    Options.noteFlowChordSettings = null;
    Options.noteFlowChordMovement = "calm";
  }
  const vm = new Vue(Object.assign({}, menuDefinition, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, menuDefinition.methods, { $t: translate(locale) })
  }));
  vm.$i18n = { locale };
  vm.regeneratePreview();
  return vm;
}
function nodes(root) {
  if (!root) return [];
  return [root].concat((root.children || []).flatMap(nodes));
}
function text(root) { return nodes(root).map(node => node.text || "").join(""); }
function child(root, name) {
  return nodes(root).find(node => node.componentOptions && node.componentOptions.tag === name);
}
function findByClass(root, name) {
  return nodes(root).find(node => node.data && String(node.data.staticClass || "").split(/\s+/).includes(name));
}
function button(root, label) {
  const found = nodes(root).find(node => node.tag === "button" && text(node).trim() === String(label));
  assert(found, "missing rendered button " + label);
  return found;
}
function click(node) { assert(node.data && node.data.on && node.data.on.click); node.data.on.click(); }
function keyboard(vm) {
  const vnode = child(vm._render(), "CustomKeyboardPreview");
  assert(vnode, "the actual shared keyboard is rendered");
  const widget = new Vue(Object.assign({}, keyboardDefinition, {
    propsData: vnode.componentOptions.propsData, parent: vm,
    methods: Object.assign({}, keyboardDefinition.methods, { $t: translate(vm.$i18n.locale) })
  }));
  Object.keys(vnode.componentOptions.listeners).forEach(event => {
    const listeners = [].concat(vnode.componentOptions.listeners[event]);
    listeners.forEach(listener => widget.$on(event, listener));
  });
  return widget;
}
function emitHandle(vm, handle, value) {
  const widget = keyboard(vm);
  widget.updateHandle(handle, value);
  widget.$destroy();
}
function renderedSliderCount(widget) {
  return nodes(widget._render()).filter(node => node.data && node.data.attrs && node.data.attrs.role === "slider").length;
}
function assertPlanMatchesRanges(vm) {
  assert(vm.previewPlan, "the selected range must produce an actual playable plan");
  const options = vm.localOptions;
  for (const block of vm.previewPlan.blocks) for (const chord of block.chords) {
    assert.strictEqual(chord.values.length, options.chordSize);
    assert.strictEqual(new Set(chord.values).size, options.chordSize);
    for (const hand of ["bass", "treble"]) {
      assert.strictEqual(chord[hand + "Values"].length, options[hand + "NotesPerChord"]);
      assert(chord[hand + "Values"].every(value => value >= options.ranges[hand].min && value <= options.ranges[hand].max));
    }
  }
  const score = generateNoteFlowChordRhythmicScore(vm.previewPlan, { allowedValues: ["eighth"] });
  assert(score.targets.every(target => target.expectedValues.length === options.chordSize));
  assert.deepStrictEqual(score.hands.slice().sort(), vm.activeHands.slice().sort());
}
const tests = [];
function test(name, body) { tests.push({ name, body }); }

for (const locale of ["de", "en"]) test(locale + " places the real graphical keyboard in Notes & keys and keeps only hand/count controls in Hands", () => {
  const vm = view(locale);
  vm.openSettingSection("tonality");
  const noteView = vm._render();
  assert(child(noteView, "CustomKeyboardPreview"));
  assert(text(noteView).includes(dictionaries[locale].FLOW_MENU_NOTES_TITLE));
  assert(nodes(noteView).some(node => node.tag === "select" && node.data.attrs.id === "chord-treble-min"));
  assert(!text(noteView).includes(dictionaries[locale].FLOW_CHORD_TOTAL_TONES));
  vm.openSettingSection("hands");
  const handView = vm._render();
  assert(!child(handView, "CustomKeyboardPreview"));
  assert(!nodes(handView).some(node => node.tag === "select" && /chord-(bass|treble)-(min|max)/.test(node.data.attrs.id || "")));
  const choice = findByClass(handView, "chord-hand-choice");
  assert.deepStrictEqual(nodes(choice).filter(node => node.tag === "button").map(text), [
    dictionaries[locale].FLOW_ONE_HAND, dictionaries[locale].FLOW_TWO_HANDS
  ]);
  const total = nodes(handView).find(node => node.data && node.data.attrs
    && node.data.attrs["aria-label"] === dictionaries[locale].FLOW_CHORD_TOTAL_TONES);
  assert.deepStrictEqual(nodes(total).filter(node => node.tag === "button").map(node => Number(text(node))), [3, 4, 5, 6, 7, 8]);
  vm.$destroy();
});

test("all four shared-keyboard handle events reach stored ranges and actual eight-tone chords", () => {
  const vm = view();
  vm.openSettingSection("hands");
  click(button(vm._render(), dictionaries.de.FLOW_TWO_HANDS));
  vm.openSettingSection("tonality");
  let widget = keyboard(vm);
  assert.strictEqual(renderedSliderCount(widget), 4);
  widget.$destroy();
  emitHandle(vm, "min", 36);
  emitHandle(vm, "bass", 60);
  emitHandle(vm, "treble", 36);
  assert.strictEqual(vm.localOptions.customTrebleMinValue, 36, "the lower treble handle emits a real change");
  emitHandle(vm, "treble", 48);
  emitHandle(vm, "max", 72);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.localOptions.ranges)), {
    bass: { min: 36, max: 60 }, treble: { min: 48, max: 72 }
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Options.noteFlowChordSettings.ranges)), {
    bass: { min: 36, max: 60 }, treble: { min: 48, max: 72 }
  });
  vm.openSettingSection("hands");
  const total = nodes(vm._render()).find(node => node.data && node.data.attrs
    && node.data.attrs["aria-label"] === dictionaries.de.FLOW_CHORD_TOTAL_TONES);
  click(button(total, 8));
  const bassGroup = nodes(vm._render()).find(node => node.data && node.data.attrs
    && node.data.attrs["aria-label"] === dictionaries.de.FLOW_CHORD_LEFT_HAND + " · " + dictionaries.de.FLOW_CHORD_HAND_TONES);
  click(button(bassGroup, 4));
  assert.deepStrictEqual([vm.localOptions.bassNotesPerChord, vm.localOptions.trebleNotesPerChord], [4, 4]);
  assertPlanMatchesRanges(vm);
  let started;
  vm.$on("startTraining", value => { started = value; });
  click(findByClass(vm._render(), "chord-start"));
  assert.strictEqual(started, vm.previewPlan);
  const persisted = JSON.parse(JSON.stringify(vm.localOptions));
  Options.loadOptions();
  const reopened = view("de", false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reopened.localOptions)), persisted);
  assertPlanMatchesRanges(reopened);
  vm.$destroy();
  reopened.$destroy();
});

test("presets change only active hand ranges and remain editable on the always-visible keyboard", () => {
  for(const hand of ["bass","treble","two"]) {
    const vm=view();vm.openSettingSection("tonality");vm.updateHands(hand);
    const original=JSON.parse(JSON.stringify(vm.localOptions));
    for(const preset of ["easy","normal","hard"]) {
      click(button(vm._render(),dictionaries.de[preset]));
      assert(child(vm._render(),"CustomKeyboardPreview"));
      assert.strictEqual(vm.rangePreset,preset);
      for(const active of vm.activeHands)assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.localOptions.ranges[active])),getNoteRange(active,preset));
      if(hand!=="two")assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.localOptions.ranges[hand==="bass"?"treble":"bass"])),original.ranges[hand==="bass"?"treble":"bass"]);
      for(const field of ["handMode","singleHand","chordSize","bassNotesPerChord","trebleNotesPerChord","bpm","selectedKey","accidentals"])assert.deepStrictEqual(vm.localOptions[field],original[field],field+" is unaffected");
      assertPlanMatchesRanges(vm);
    }
    emitHandle(vm,"max",79);assert.strictEqual(vm.rangePreset,null);assert.strictEqual(vm.keyboardMaxValue,79);
    assert.strictEqual(Options.noteFlowChordSettings[vm.rangeField(hand==="two"?"treble":hand,"max")],79);
    assertPlanMatchesRanges(vm);vm.$destroy();
  }
});

for (const hand of ["bass", "treble"]) test("one " + hand + " hand has two graphical handles and never edits the inactive range", () => {
  const vm = view();
  vm.openSettingSection("tonality");
  click(button(vm._render(), dictionaries.de[hand === "bass" ? "bassClef" : "trebleClef"]));
  const inactive = hand === "bass" ? "treble" : "bass";
  const previousInactive = JSON.stringify(vm.localOptions.ranges[inactive]);
  const widget = keyboard(vm);
  assert.strictEqual(widget.showClefAssignment, false);
  assert.strictEqual(renderedSliderCount(widget), 2);
  assert.strictEqual(widget.minValue, vm.localOptions.ranges[hand].min);
  assert.strictEqual(widget.maxValue, vm.localOptions.ranges[hand].max);
  widget.$destroy();
  emitHandle(vm, "min", 36);
  emitHandle(vm, "max", 72);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.localOptions.ranges[hand])), { min: 36, max: 72 });
  assert.strictEqual(JSON.stringify(vm.localOptions.ranges[inactive]), previousInactive);
  assertPlanMatchesRanges(vm);
  vm.openSettingSection("hands");
  click(button(vm._render(), dictionaries.de.FLOW_TWO_HANDS));
  assert.strictEqual(vm.localOptions.singleHand, hand, "switching to two hands retains the selected single hand");
  click(button(vm._render(), dictionaries.de.FLOW_ONE_HAND));
  assert.strictEqual(vm.localOptions.singleHand, hand);
  assert.deepStrictEqual(vm.activeHands, [hand]);
  assert.strictEqual(JSON.stringify(vm.localOptions.ranges[inactive]), previousInactive);
  vm.$destroy();
});

test("narrow graphical selection explains an impossible chord and blocks start without widening the range", () => {
  const vm = view("en");
  vm.openSettingSection("tonality");
  emitHandle(vm, "min", 48);
  emitHandle(vm, "max", 48);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.localOptions.ranges.treble)), { min: 48, max: 48 });
  assert.strictEqual(vm.previewPlan, null);
  assert.strictEqual(vm.previewError, true);
  const rendered = vm._render();
  const alert = nodes(rendered).find(node => node.data && node.data.attrs && node.data.attrs.role === "alert");
  assert.strictEqual(text(alert), dictionaries.en.FLOW_CHORD_RANGE_ERROR);
  assert.strictEqual(findByClass(rendered, "chord-start").data.attrs.disabled, true);
  let starts = 0;
  vm.$on("startTraining", () => { starts += 1; });
  click(findByClass(rendered, "chord-start"));
  assert.strictEqual(starts, 0);
  emitHandle(vm, "max", 72);
  assert.strictEqual(vm.previewError, false);
  assertPlanMatchesRanges(vm);
  assert.strictEqual(Options.noteFlowChordSettings.customMaxValue, 72);
  vm.$destroy();
});

test("shared keyboard legend reflects exact range intersection, including swapped nonoverlapping registers", () => {
  const cases = [
    { bass: [60, 72], treble: [36, 48], overlap: false },
    { bass: [36, 48], treble: [60, 72], overlap: false },
    { bass: [36, 60], treble: [48, 72], overlap: true },
    { bass: [60, 72], treble: [36, 60], overlap: true }
  ];
  for (const { bass, treble, overlap } of cases) {
    const widget = new Vue(Object.assign({}, keyboardDefinition, {
      propsData: { minValue: bass[0], bassMaxValue: bass[1], trebleMinValue: treble[0],
        maxValue: treble[1], showClefAssignment: true },
      methods: Object.assign({}, keyboardDefinition.methods, { $t: translate("de") })
    }));
    assert.strictEqual(widget.hasClefOverlap, overlap);
    const rendered = widget._render();
    assert.strictEqual(text(rendered).includes(dictionaries.de.CUSTOM_RANGE_UNUSED), !overlap);
    for (let value = 12; value <= 95; value++) {
      const intersection = value >= bass[0] && value <= bass[1] && value >= treble[0] && value <= treble[1];
      if ([0, 2, 4, 5, 7, 9, 11].includes(value % 12)) {
        assert.strictEqual(Boolean(widget.selectionClasses(value).overlap), intersection);
      }
    }
    widget.$destroy();
  }
});

async function run() {
  for (const { name, body } of tests) {
    await body();
    process.stdout.write("✓ " + name + "\n");
  }
  process.stdout.write("Chord graphical keyboard menu: " + tests.length + " checks passed\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
