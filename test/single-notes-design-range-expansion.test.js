const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};
Module._extensions[".js"] = function transpileProjectModule(module, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(module, filename);
  module._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const expansion = require("../src/model/AdaptiveRangeExpansion");
const exercises = require("../src/model/AdaptiveExercises");
const learning = require("../src/model/AdaptiveLearning");
const ranges = require("../src/model/NoteRanges");
const optionsStore = require("../src/model/AdaptiveOptions").default;
const utils = require("../src/model/Utils").default;
const globalOptions = require("../src/model/Options").default;
const dictionaries = {
  de: require("../src/resources/de").default,
  en: require("../src/resources/en").default
};
Module._extensions[".js"] = originalLoader;

function test(name, run) {
  run();
  process.stdout.write("✓ " + name + "\n");
}

function options(overrides = {}) {
  return Object.assign({
    clef: ["treble"], customMinValue: 48, customMaxValue: 48,
    customTrebleMinValue: 48, customBassMaxValue: 48,
    accidentals: "no", rangeExpansionEnabled: true,
    inputMode: "button", gameLength: 60, displayNote: true
  }, overrides);
}

function keys(value) {
  return exercises.createAdaptiveCandidates(value).map(learning.createNoteLearningKey);
}

function assertExpansion(before, after) {
  const oldKeys = keys(before);
  const newKeys = keys(after);
  assert(oldKeys.every(key => newKeys.includes(key)), "old exercises must remain available");
  assert(newKeys.some(key => !oldKeys.includes(key)), "a new active exercise must become available");
}

function mastered(value, responseTimeMs = 900) {
  let progress = learning.createAdaptiveProgress();
  exercises.createAdaptiveCandidates(value).forEach(candidate => {
    for (let i = 0; i < expansion.RANGE_EXPANSION_MIN_ATTEMPTS; i += 1) {
      progress = learning.updateAdaptiveProgress(progress, candidate, true, 0, responseTimeMs);
    }
  });
  return progress;
}

function component(name, dependencies) {
  const parsed = compiler.parseComponent(fs.readFileSync(
    path.join(sourceRoot, "components", name + ".vue"), "utf8"
  ));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const rendered = compiler.compileToFunctions(parsed.template.content);
  const module = { exports: {} };
  new Function("module", "exports", "require", babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(module, module.exports, name => dependencies[name] || {});
  return Object.assign({}, module.exports.default, rendered);
}

const childDefinition = component("AdaptiveRangeExpansion", {
  "../model/Utils": utils, "../model/Options": globalOptions
});
const parentDefinition = component("AdaptiveMenu", {
  "../model/AdaptiveExercises": exercises,
  "../model/AdaptiveRangeExpansion": expansion,
  "../model/AdaptiveLearning": learning,
  "../model/AdaptiveOptions": optionsStore,
  "../model/NoteRanges": ranges
});
const freeDefinition = component("Menu", {
  "../model/Options": globalOptions, "../model/NoteRanges": ranges
});

function child(evaluation, locale = "de") {
  const vm = new Vue(Object.assign({}, childDefinition, {
    propsData: { evaluation },
    methods: Object.assign({}, childDefinition.methods, {
      $t(key, values = {}) {
        assert.strictEqual(typeof dictionaries[locale][key], "string", "Missing translation: " + key);
        return dictionaries[locale][key].replace(/\{([^}]+)\}/g, (_, name) => values[name]);
      }
    })
  }));
  vm.$i18n = { locale };
  return vm;
}

function text(vnode) {
  return !vnode ? "" : (vnode.text || "") + (vnode.children || []).map(text).join(" ");
}

function parent(value, saveOptions = () => optionsStore.saveOptions()) {
  Object.assign(optionsStore, value);
  return { options: optionsStore, saveOptions, applyRangeExpansion: parentDefinition.methods.applyRangeExpansion };
}

test("SN008: treble C4 lower step expands the active treble minimum and retains the hidden bass range", () => {
  const before = options();
  const progress = mastered(before);
  const evaluation = expansion.evaluateAdaptiveRangeExpansion(progress, before);
  assert(evaluation.ready);
  assert.deepStrictEqual(evaluation.recommendations.map(item => [item.id, item.value]), [
    ["range-lower", 47], ["range-upper", 50]
  ]);
  const after = expansion.applyAdaptiveRangeRecommendation(before, "range-lower");
  assert.strictEqual(after.customTrebleMinValue, 47);
  assert.strictEqual(after.customMinValue, 48);
  assert.strictEqual(after.customBassMaxValue, 48);
  assert.deepStrictEqual(exercises.createAdaptiveCandidates(after).map(item => item.value), [47, 48]);
  assertExpansion(before, after);
  assert.strictEqual(expansion.evaluateAdaptiveRangeExpansion(progress, after).ready, false);
  assert.strictEqual(before.customTrebleMinValue, 48, "model must not mutate its argument");
});

test("single-clef offers follow active limits even when inactive ranges are far away", () => {
  const treble = options({ customMinValue: 24, customBassMaxValue: 36 });
  const bass = options({ clef: ["bass"], customMaxValue: 72, customTrebleMinValue: 60 });
  const lower = expansion.createAdaptiveRangeRecommendations(treble).find(item => item.id === "range-lower");
  const upper = expansion.createAdaptiveRangeRecommendations(bass).find(item => item.id === "range-upper");
  assert.deepStrictEqual([lower.currentValue, lower.value], [48, 47]);
  assert.deepStrictEqual([upper.currentValue, upper.value], [48, 50]);
  const expandedBass = expansion.applyAdaptiveRangeRecommendation(bass, "range-upper");
  assert.strictEqual(expandedBass.customBassMaxValue, 50);
  assert.strictEqual(expandedBass.customMaxValue, 72);
  assertExpansion(bass, expandedBass);
});

test("treble upper and bass lower steps retain their existing target fields", () => {
  for (const [clef, id, field, value] of [
    ["treble", "range-upper", "customMaxValue", 50],
    ["bass", "range-lower", "customMinValue", 47]
  ]) {
    const before = options({ clef: [clef] });
    const after = expansion.applyAdaptiveRangeRecommendation(before, id);
    assert.strictEqual(after[field], value);
    assertExpansion(before, after);
  }
});

test("piano and dual-clef preserve all four independent and overlap steps for every accidental mode", () => {
  for (const clef of [["piano"], ["bass", "treble"], ["treble", "bass"]]) {
    for (const accidentals of ["no", "onlySharp", "onlyFlat", "sharpAndFlat"]) {
      const before = options({ clef, accidentals, customMaxValue: 52, customTrebleMinValue: 50, customBassMaxValue: 50 });
      assert.deepStrictEqual(expansion.createAdaptiveRangeRecommendations(before).map(item => [item.id, item.value]), [
        ["range-lower", 47], ["range-upper", 53], ["treble-lower", 48], ["bass-upper", 52]
      ]);
      for (const [id, field] of [
        ["range-lower", "customMinValue"], ["range-upper", "customMaxValue"],
        ["treble-lower", "customTrebleMinValue"], ["bass-upper", "customBassMaxValue"]
      ]) {
        const after = expansion.applyAdaptiveRangeRecommendation(before, id);
        assertExpansion(before, after);
        for (const key of ["customMinValue", "customMaxValue", "customTrebleMinValue", "customBassMaxValue"]) {
          if (key !== field) assert.strictEqual(after[key], before[key]);
        }
      }
    }
  }
});

test("independent crossed clef ranges remain expandable without collapsing either range", () => {
  for (const clef of [["piano"], ["bass", "treble"]]) {
    const before = options({ clef, customMinValue: 60, customBassMaxValue: 72, customTrebleMinValue: 36, customMaxValue: 48 });
    for (const recommendation of expansion.createAdaptiveRangeRecommendations(before)) {
      assertExpansion(before, expansion.applyAdaptiveRangeRecommendation(before, recommendation.id));
    }
  }
});

test("active boundaries suppress unavailable steps and older single-clef option shapes retain fallback limits", () => {
  const treble = options({ customTrebleMinValue: ranges.MIN_CUSTOM_VALUE, customMaxValue: ranges.MAX_CUSTOM_VALUE });
  const bass = options({ clef: ["bass"], customMinValue: ranges.MIN_CUSTOM_VALUE, customBassMaxValue: ranges.MAX_CUSTOM_VALUE });
  assert.deepStrictEqual(expansion.createAdaptiveRangeRecommendations(treble), []);
  assert.deepStrictEqual(expansion.createAdaptiveRangeRecommendations(bass), []);
  assert.throws(() => expansion.applyAdaptiveRangeRecommendation(treble, "range-lower"));
  for (const clef of [["treble"], ["bass"]]) {
    const legacy = { clef, customMinValue: 36, customMaxValue: 48, accidentals: "no" };
    assert.deepStrictEqual(expansion.createAdaptiveRangeRecommendations(legacy).map(item => [item.id, item.value]), [
      ["range-lower", 35], ["range-upper", 50]
    ]);
    for (const id of ["range-lower", "range-upper"]) assertExpansion(legacy, expansion.applyAdaptiveRangeRecommendation(legacy, id));
  }
});

test("readiness thresholds and actual evaluation logic are unchanged", () => {
  const baseline = path.resolve(__dirname, "../docs/audits/design-review-2026-10-08/baseline/src/model/AdaptiveRangeExpansion.js");
  const evaluationBody = file => fs.readFileSync(file, "utf8").split("export function evaluateAdaptiveRangeExpansion")[1].split("export function applyAdaptiveRangeRecommendation")[0];
  assert.strictEqual(evaluationBody(path.join(sourceRoot, "model/AdaptiveRangeExpansion.js")), evaluationBody(baseline));
  const before = options();
  assert.strictEqual(expansion.evaluateAdaptiveRangeExpansion(learning.createAdaptiveProgress(), before).ready, false);
  assert.deepStrictEqual(expansion.evaluateAdaptiveRangeExpansion(mastered(before, 3500), before).blockers, ["speed"]);
});

test("confirmation and cancellation retain the original two-step flow; missing or negative acknowledgment never reports success", () => {
  const vm = child(expansion.evaluateAdaptiveRangeExpansion(mastered(options()), options()));
  let emissions = 0;
  vm.$on("apply", (_, acknowledge) => { emissions += 1; acknowledge(false); });
  vm.selectRecommendation("range-lower");
  assert.strictEqual(emissions, 0);
  vm.pendingId = null;
  vm.confirmRecommendation();
  assert.strictEqual(emissions, 0);
  vm.selectRecommendation("range-lower");
  vm.confirmRecommendation();
  assert.strictEqual(emissions, 1);
  assert.strictEqual(vm.appliedLabel, null);
  assert.strictEqual(vm.pendingId, "range-lower");
  vm.$off("apply");
  vm.confirmRecommendation();
  assert.strictEqual(vm.appliedLabel, null);
  vm.$destroy();
});

test("real menu writer and real child confirmation expand C4 to H3/C4, save to RAM, and render truthful DE/EN success", () => {
  for (const locale of ["de", "en"]) {
    const before = options();
    const progress = mastered(before);
    const menu = parent(before);
    const vm = child(expansion.evaluateAdaptiveRangeExpansion(progress, before), locale);
    vm.$on("apply", (id, acknowledge) => menu.applyRangeExpansion(id, acknowledge));
    vm.selectRecommendation("range-lower");
    vm.confirmRecommendation();
    assert.strictEqual(parentDefinition.computed.displayedCustomMinValue.get.call(menu), 47);
    assert.strictEqual(parentDefinition.computed.displayedCustomMaxValue.get.call(menu), 48);
    assert.strictEqual(vm.pendingId, null);
    assert(vm.appliedLabel);
    assert(text(vm._render()).includes(dictionaries[locale].ADAPTIVE_EXPANSION_APPLIED.split("{step}")[0]));
    const saved = JSON.parse(storage.get("adaptiveOptions")).data;
    assert.strictEqual(saved.customTrebleMinValue, 47);
    assert.strictEqual(saved.customMinValue, 48);
    assertExpansion(before, saved);
    vm.evaluation = expansion.evaluateAdaptiveRangeExpansion(progress, menu.options);
    assert.strictEqual(vm.evaluation.ready, false);
    assert(text(vm._render()).includes(vm.blockerMessage));
    vm.$destroy();
  }
});

test("real menu handler only acknowledges extra active exercises after save and refuses shrinking malformed input", () => {
  const malformed = options({ customTrebleMinValue: 60 });
  let saves = 0;
  let acknowledgment;
  const menu = parent(malformed, () => { saves += 1; });
  assert.strictEqual(menu.applyRangeExpansion("range-lower", value => { acknowledgment = value; }), false);
  assert.strictEqual(saves, 0);
  assert.strictEqual(acknowledgment, false);
  const before = options();
  const discarded = parent(before, () => { Object.assign(optionsStore, before); });
  assert.strictEqual(discarded.applyRangeExpansion("range-lower", value => { acknowledgment = value; }), false);
  assert.strictEqual(acknowledgment, false, "post-save sanitizer/discard must not get a success acknowledgment");
});

test("single-note range presets preserve clefs and other settings, remain editable and persist without touching learning data", () => {
  storage.set("statistics","retained-rounds");storage.set("music","retained-pieces");
  for(const [definition,store,free] of [[freeDefinition,globalOptions,true],[parentDefinition,optionsStore,false]]) {
    for(const clef of [["treble"],["bass"],["piano"]]) {
      Object.assign(store,options({clef,customMinValue:24,customBassMaxValue:43,customTrebleMinValue:50,customMaxValue:72}));
      if(free)store.difficulty="custom";
      const context={options:store,saveOptions:()=>store.saveOptions()};
      Object.defineProperty(context,"rangeValues",{get:()=>ranges.getEditableRangeValues(store)});
      const initial={inputMode:store.inputMode,gameLength:store.gameLength,accidentals:store.accidentals,clef:store.clef.slice()};
      const inactive=clef[0]==="bass"?["customTrebleMinValue","customMaxValue"]:clef[0]==="treble"?["customMinValue","customBassMaxValue"]:[];
      const retained=inactive.map(field=>store[field]);
      for(const preset of ["easy","normal","hard"]) {
        definition.methods.updateDifficulty.call(context,preset);
        const selected=ranges.getRangePresetValues(preset,clef);
        for(const field of Object.keys(selected))assert.strictEqual(store[field],selected[field]);
        assert.strictEqual(ranges.getMatchingRangePreset(store),preset);
        assert.deepStrictEqual(inactive.map(field=>store[field]),retained);
        assert.deepStrictEqual({inputMode:store.inputMode,gameLength:store.gameLength,accidentals:store.accidentals,clef:store.clef.slice()},initial);
      }
      const field=clef[0]==="bass"?"customBassMaxValue":"customMaxValue";
      if(free)definition.methods.updateRangeValue.call(context,field,79);else store[field]=79;
      context.saveOptions();store.loadOptions();
      assert.strictEqual(store[field],79);assert.strictEqual(ranges.getMatchingRangePreset(store),null);
      if(free)assert.strictEqual(store.difficulty,"custom");
      else assert(exercises.createAdaptiveCandidates(store).every(note=>note.value>=store[note.clef==="bass"?"customMinValue":"customTrebleMinValue"]&&note.value<=store[note.clef==="bass"?"customBassMaxValue":"customMaxValue"]));
    }
  }
  Object.assign(globalOptions,{difficulty:"easy",clef:["treble"],customTrebleMinValue:50,customMaxValue:72});
  const before=JSON.stringify(globalOptions);
  assert.deepStrictEqual([ranges.getEditableRangeValues(globalOptions).customTrebleMinValue,ranges.getEditableRangeValues(globalOptions).customMaxValue],[48,60]);
  assert.strictEqual(JSON.stringify(globalOptions),before,"reading a legacy preset never rewrites saved choices");
  assert.strictEqual(storage.get("statistics"),"retained-rounds");assert.strictEqual(storage.get("music"),"retained-pieces");
});
