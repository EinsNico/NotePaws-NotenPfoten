const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
const previousRuntime = global.regeneratorRuntime;
global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadComponent(name, dependencies = {}) {
  const parsed = compiler.parseComponent(fs.readFileSync(
    path.join(__dirname, "../src/components", name + ".vue"), "utf8"
  ));
  const template = compiler.compile(parsed.template.content);
  assert.deepStrictEqual(template.errors, [], name + " template errors");
  const compiled = compiler.compileToFunctions(parsed.template.content);
  const module = { exports: {} };
  new Function("module", "exports", "require", babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(module, module.exports, name => dependencies[name] || {});
  return Object.assign({}, module.exports.default, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    render: compiled.render, staticRenderFns: compiled.staticRenderFns
  });
}

function language(name) {
  const source = fs.readFileSync(path.join(__dirname, "../src/resources", name + ".js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", babel.transform(source, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(module, module.exports);
  return module.exports.default;
}

function translate(dictionary) {
  return (key, values = {}) => {
    assert.strictEqual(typeof dictionary[key], "string", "Missing translation: " + key);
    return dictionary[key].replace(/\{([^}]+)\}/g, (_, name) => values[name]);
  };
}

function nodes(root) {
  return (Array.isArray(root) ? root : [root]).reduce((all, node) => {
    return !node ? all : all.concat(node, nodes(node.children || []));
  }, []);
}

function text(root) {
  return nodes(root).map(node => node.text || "").join(" ");
}

function component(root, name) {
  return nodes(root).find(node => node.componentOptions && node.componentOptions.tag === name);
}

function test(name, body) {
  body();
  process.stdout.write("✓ " + name + "\n");
}

const originalWindow = global.window;
global.window = { scrollTo() {} };

(async () => {
  const dictionaries = { de: language("de"), en: language("en") };
  const settingsComponent = loadComponent("SingleNotesSettings", {
    "./SettingsSectionIcon": loadComponent("SettingsSectionIcon")
  });
  for (const mode of ["Menu", "AdaptiveMenu"]) {
    for (const locale of ["de", "en"]) {
      const options = {
        difficulty: "custom", clef: ["bass", "treble"],
        customMinValue: 36, customBassMaxValue: 48,
        customTrebleMinValue: 60, customMaxValue: 69,
        gameLength: 20, inputMode: "button", accidentals: "no",
        sound: true, vibration: false, displayNote: false, rangeExpansionEnabled: true
      };
      const dependencies = {
        "./SingleNotesSettings": settingsComponent,
        "./SelectOption": loadComponent("SelectOption"),
        "./SelectOptionMulti": loadComponent("SelectOptionMulti"),
        "./CustomKeyboardPreview": loadComponent("CustomKeyboardPreview", {
          "../model/NoteRanges": { getNaturalNoteValues: () => [36, 48, 60, 69] }
        }),
        "./AdaptiveRangeExpansion": loadComponent("AdaptiveRangeExpansion"),
        "../model/Options": options,
        "../model/AdaptiveOptions": options,
        "../model/AdaptiveProgress": {
          getSummary: () => ({ attempts: 0 }), progress: {}, inputGroup: "screen",
          ADAPTIVE_INPUT_SCREEN: "screen", ADAPTIVE_INPUT_MIDI: "midi",
          getAdaptiveInputGroup: mode => mode === "midi" ? "midi" : "screen",
          loadFromDatabase() { return Promise.resolve(); }
        },
        "../model/UiPreferences": { loadAdaptiveProgressOpen: () => false, saveAdaptiveProgressOpen: value => value },
        "../model/NoteRanges": {
          getNaturalNoteValues: () => [36, 48, 60, 69],
          usesCustomClefAssignment: clefs => clefs.includes("piano") || clefs.length === 2
        },
        "../model/Utils": { getDisplayNoteName: value => value === 9 ? "A" : "C" },
        "../model/AdaptiveRangeExpansion": { evaluateAdaptiveRangeExpansion: () => ({}) }
      };
      const menuOptions = loadComponent(mode, dependencies);
      const vm = new Vue(Object.assign({}, menuOptions, {
        watch: {},
        methods: Object.assign({}, menuOptions.methods, { $t: translate(dictionaries[locale]) })
      }));
      test(mode + " " + locale + " groups notes, feedback and round with accurate live summaries", () => {
        assert.deepStrictEqual(vm.settingSections.map(section => section.id), ["range", "input", "practice"]);
        const summary = vm.settingSections[0].summary;
        assert(summary.includes("C3–C4"));
        assert(summary.includes("C5–A5"));
        assert(!summary.includes("C3–A5"), "separate clef limits must stay distinct");
        if (mode === "AdaptiveMenu") assert(summary.includes(dictionaries[locale].on));
        options.gameLength = 0;
        assert.strictEqual(vm.settingSections[2].summary, dictionaries[locale].infinite);
        options.inputMode = "midi";
        assert(vm.settingSections[1].summary.startsWith("MIDI"));
        assert(vm.settingSections[1].summary.includes(dictionaries[locale].off));
        options.clef = ["piano"];
        assert(vm.settingSections[0].summary.includes(dictionaries[locale].pianoClef));
        assert(vm.settingSections[0].summary.includes("C3–C4"));
        assert(vm.settingSections[0].summary.includes("C5–A5"));
        options.clef = ["bass", "treble"];
      });
      const wrapper = component(vm._render(), "SingleNotesSettings");
      assert(wrapper, "compiled menu renders the shared setting navigator");
      const slot = wrapper.data.scopedSlots.default;
      test(mode + " " + locale + " exposes only the selected controls and keeps their original bindings", () => {
        const range = slot({ activeSection: "range" });
        assert(component(range, "SelectOptionMulti"));
        assert(component(range, "CustomKeyboardPreview"));
        assert(!component(range, "AdaptiveHistoryChart"));
        const rangeLabels = nodes(range).filter(node => node.componentOptions)
          .map(node => (node.componentOptions.propsData || {}).label);
        assert(rangeLabels.includes(dictionaries[locale].ACCIDENTALS));
        assert(!rangeLabels.includes(dictionaries[locale].NOTE_INPUT));
        if (mode === "AdaptiveMenu") {
          assert(rangeLabels.indexOf(dictionaries[locale].ACCIDENTALS)
            < rangeLabels.indexOf(dictionaries[locale].ADAPTIVE_EXPANSION_SETTING),
          "choose the practiced notes before reviewing expansion recommendations");
        }
        component(range, "CustomKeyboardPreview").componentOptions.listeners["update:bass-max-value"](36);
        assert.strictEqual(options.customBassMaxValue, 36);
        assert(vm.settingSections[0].summary.includes("C3–C3"));
        assert.strictEqual(Boolean(component(range, "AdaptiveRangeExpansion")), mode === "AdaptiveMenu");
        if (mode === "AdaptiveMenu") {
          options.rangeExpansionEnabled = false;
          assert(!component(slot({ activeSection: "range" }), "AdaptiveRangeExpansion"));
        } else {
          options.difficulty = "normal";
          assert(!component(slot({ activeSection: "range" }), "CustomKeyboardPreview"));
          assert(!vm.settingSections[0].summary.includes("C3–C3"));
        }
        const input = slot({ activeSection: "input" });
        assert(!component(input, "CustomKeyboardPreview"));
        const controls = nodes(input).filter(node => node.componentOptions && node.componentOptions.tag === "SelectOption");
        assert.deepStrictEqual(controls.map(node => node.componentOptions.propsData.label), [
          dictionaries[locale].NOTE_INPUT,
          dictionaries[locale].DISPLAYCORRECTNOTE
        ]);
        controls[0].data.model.callback("keyboard");
        controls[1].data.model.callback(false);
        assert.strictEqual(options.inputMode, "keyboard");
        assert.strictEqual(options.vibration, false, 'mode controls leave the global vibration setting unchanged');
        assert.strictEqual(options.displayNote, false);
        assert.strictEqual(options.sound, true, 'mode controls leave the global sound setting unchanged');
        const round = slot({ activeSection: "practice" });
        assert(!component(round, "CustomKeyboardPreview"));
        const length = component(round, "SelectOption");
        assert.strictEqual(length.componentOptions.propsData.label, dictionaries[locale].ROUND_LENGTH);
        length.data.model.callback(300);
        assert.strictEqual(options.gameLength, 300);
      });

      const navigator = new Vue(Object.assign({}, settingsComponent, {
        propsData: { sections: vm.settingSections },
        methods: Object.assign({}, settingsComponent.methods, { $t: translate(dictionaries[locale]) }),
        scopedSlots: { default: slot }
      }));
      let focusedReturn = 0;
      let focusedSection = null;
      navigator.$refs.returnButton = { focus() { focusedReturn += 1; } };
      navigator.$refs.sectionLinks = vm.settingSections.map(section => ({
        dataset: { section: section.id }, focus() { focusedSection = section.id; }
      }));
      assert.strictEqual(navigator.handleBack(), false);
      navigator.openSection("unknown");
      assert.strictEqual(navigator.activeSection, null);
      navigator.openSection("range");
      await Vue.nextTick();
      assert.strictEqual(focusedReturn, 1);
      assert(text(navigator._render()).includes(dictionaries[locale].SINGLE_NOTES_ALL_SETTINGS));
      assert.strictEqual(navigator.handleBack(), true);
      await Vue.nextTick();
      assert.strictEqual(navigator.activeSection, null);
      assert.strictEqual(focusedSection, "range");
      assert.strictEqual(navigator.handleBack(), false);
      navigator.openSection("input");
      await Vue.nextTick();
      vm.$refs.singleNotesSettings = navigator;
      let menuExits = 0;
      vm.$on("back", () => { menuExits += 1; });
      vm.$on("home", () => { menuExits += 1; });
      vm.goHome();
      await Vue.nextTick();
      assert.strictEqual(navigator.activeSection, null);
      assert.strictEqual(menuExits, 0, "header Back stays in the current mode");
      navigator.openSection("input");
      await Vue.nextTick();
      vm.selectView("statistics");
      assert.strictEqual(navigator.activeSection, null);
      assert.strictEqual(vm.handleBack(), false);
      vm.selectView("settings");
      assert.strictEqual(navigator.activeSection, null);
      assert.deepStrictEqual(options.clef, ["bass", "treble"]);
      process.stdout.write("✓ " + mode + " " + locale + " returns from details and tabs without resetting settings\n");
      vm.$destroy();
      navigator.$destroy();
    }
  }
  const keys = Object.keys(dictionaries.de).filter(key => /^SINGLE_NOTES_(SETTINGS_HINT|ALL_SETTINGS|ROUND_SETTINGS|INPUT_SUMMARY|EXPANSION_SUMMARY)$/.test(key));
  assert.strictEqual(keys.length, 5);
  keys.forEach(key => {
    assert.strictEqual(typeof dictionaries.en[key], "string");
    const placeholders = value => (value.match(/\{[^}]+\}/g) || []).sort();
    assert.deepStrictEqual(placeholders(dictionaries.de[key]), placeholders(dictionaries.en[key]));
  });
  process.stdout.write("✓ New DE/EN labels have matching placeholders\n");
})().catch(error => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
}).finally(() => {
  global.window = originalWindow;
  global.regeneratorRuntime = previousRuntime;
});
