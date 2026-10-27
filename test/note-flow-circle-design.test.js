const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const filename = path.join(sourceRoot, "components/NoteFlowCircleSelector.vue");
const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (loadedModule, file) => {
  if (!file.startsWith(sourceRoot)) return originalLoader(loadedModule, file);
  const transformed = babel.transform(fs.readFileSync(file, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  loadedModule._compile(transformed.code, file);
};
let definition, tonalities, strings;
try {
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  definition = Object.assign({}, loaded.exports.default,
    compiler.compileToFunctions(parsed.template.content));
  tonalities = require("../src/model/NoteFlowTonality").NOTE_FLOW_TONALITIES;
  strings = {
    de: require("../src/resources/de").default,
    en: require("../src/resources/en").default
  };
} finally {
  Module._extensions[".js"] = originalLoader;
}

function view(locale = "de", noteNaming = "german", options = {}) {
  return new Vue(Object.assign({}, definition, {
    propsData: Object.assign({ value: "C-major", accidentals: "sharpAndFlat", noteNaming }, options),
    methods: Object.assign({}, definition.methods, { $t: key => strings[locale][key] })
  }));
}
function nodes(vnode) {
  return [vnode].concat(...(vnode.children || []).map(nodes));
}
function circleButtons(instance) {
  return nodes(instance._render()).filter(vnode => vnode.tag === "button"
    && (vnode.data.staticClass || "").includes("flow-key-node"));
}
function variantButtons(instance) {
  const region = nodes(instance._render()).find(vnode => vnode.data
    && vnode.data.staticClass === "flow-key-variants");
  return region ? nodes(region).filter(vnode => vnode.tag === "button") : [];
}
function visibleText(vnode) {
  return nodes(vnode).map(child => child.text || "").join("").trim();
}
function declaration(selector, property) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [...parsed.styles[0].content.matchAll(
    new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`, "g")
  )];
  // A second media override requires explicit review of the geometry matrix.
  assert.strictEqual(rules.length, 1, `${selector} must have one unambiguous dimension rule`);
  const match = rules[0][1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`));
  assert(match, `${selector} ${property} must define the tested dimension`);
  return match[1].trim();
}
function pixels(value, circleWidth) {
  assert(/^[\d.]+(?:px|%)$/.test(value), `Unsupported tested length ${value}`);
  return parseFloat(value) * (value.endsWith("%") ? circleWidth / 100 : 1);
}
function rectangle(vnode, circleWidth) {
  const selector = (vnode.data.staticClass || "").includes("major-node")
    ? ".major-node" : ".minor-node";
  const width = pixels(declaration(selector, "width"), circleWidth);
  const height = Math.max(pixels(declaration(selector, "height"), circleWidth),
    pixels(declaration(selector, "min-height"), circleWidth));
  const centerX = pixels(vnode.data.style.left, circleWidth);
  const centerY = pixels(vnode.data.style.top, circleWidth);
  return { label: vnode.data.attrs["aria-label"], width, height,
    left: centerX - width / 2, right: centerX + width / 2,
    top: centerY - height / 2, bottom: centerY + height / 2 };
}

const tests = [];
function test(name, body) { tests.push({ name, body }); }

test("actual Vue buttons have separate rectangles across narrow circle sizes and accidental policies", () => {
  // These are available component widths, not claimed viewport measurements.
  // Border-box dimensions come from the actual SFC CSS, positions from its VNodes.
  assert.strictEqual(declaration(".flow-key-node", "box-sizing"), "border-box");
  for (const accidentals of ["no", "onlySharp", "onlyFlat", "sharpAndFlat"]) {
    const instance = view("de", "german", { accidentals });
    const buttons = circleButtons(instance);
    assert.strictEqual(buttons.length, 24);
    for (const size of [240, 244, 256, 264, 284, 300, 320]) {
      const active = buttons.filter(button => !button.data.attrs.disabled)
        .map(button => rectangle(button, size));
      active.forEach(rect => {
        assert(rect.width >= 24 && rect.height >= 24, `${rect.label} ${size}: target below 24px`);
        assert(rect.left >= -8 && rect.right <= size + 8,
          `${rect.label} ${size}: outside selector horizontal padding`);
        assert(rect.top >= -12 && rect.bottom <= size + 10,
          `${rect.label} ${size}: outside selector vertical padding`);
      });
      for (let i = 0; i < active.length; i += 1) {
        for (let j = i + 1; j < active.length; j += 1) {
          const first = active[i], second = active[j];
          const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          assert(overlapX <= 0 || overlapY <= 0,
            `${size}px ${accidentals}: ${first.label} overlaps ${second.label}`);
        }
      }
    }
    instance.$destroy();
  }
});

test("short node labels retain every written tonality and complete accessible names in DE/EN", () => {
  for (const locale of ["de", "en"]) {
    for (const naming of ["german", "international"]) {
      const instance = view(locale, naming);
      for (const tonality of tonalities) {
        instance.value = tonality.id;
        const selected = circleButtons(instance).filter(button => button.data.attrs["aria-pressed"] === "true");
        assert.strictEqual(selected.length, 1);
        const label = visibleText(selected[0]);
        assert(label.length > 0 && label.length <= 3, `${naming}: oversized ${label}`);
        assert(!label.includes("/"));
        assert(selected[0].data.attrs["aria-label"].includes(instance.fullLabel(tonality)));
        assert.strictEqual(selected[0].data.attrs.title, selected[0].data.attrs["aria-label"]);
        assert.strictEqual(instance.selectedTonality.id, tonality.id);
      }
      instance.$destroy();
    }
  }
  assert.strictEqual(declaration(".major-node", "font-size"), "14px");
  assert.strictEqual(declaration(".minor-node", "font-size"), "13px");
  assert.strictEqual(declaration(".flow-key-variants button", "font-size"), "14px");
  assert.strictEqual(declaration(".flow-key-variants button", "min-height"), "44px");
});

test("already selected ambiguous spellings show readable complete variants without emitting a change", () => {
  for (const locale of ["de", "en"]) {
    for (const naming of ["german", "international"]) {
      const instance = view(locale, naming, { value: "F-sharp-major" });
      const emitted = [];
      instance.$on("input", value => emitted.push(value));
      const buttons = variantButtons(instance);
      assert.strictEqual(buttons.length, 2);
      assert.deepStrictEqual(buttons.map(visibleText), instance.variantCandidates.map(key => instance.fullLabel(key)));
      assert.strictEqual(buttons.filter(button => button.data.attrs["aria-pressed"] === "true").length, 1);
      assert.deepStrictEqual(emitted, []);
      instance.$destroy();
    }
  }
});

test("actual circle and variant click handlers retain original selection order and every alternative", () => {
  for (const locale of ["de", "en"]) {
    const instance = view(locale, locale === "en" ? "international" : "german");
    const emitted = [];
    instance.$on("input", value => { emitted.push(value); instance.value = value; });
    const selected = new Set();
    for (let i = 0; i < 24; i += 1) {
      const segment = instance.displaySegments[Math.floor(i / 2)];
      const candidates = i % 2 ? segment.minorAllowed : segment.majorAllowed;
      const expected = candidates.find(candidate => candidate.id === instance.value) || candidates[0];
      circleButtons(instance)[i].data.on.click();
      assert.strictEqual(emitted[emitted.length - 1], expected.id);
      selected.add(expected.id);
      for (const button of variantButtons(instance)) {
        button.data.on.click();
        selected.add(emitted[emitted.length - 1]);
      }
    }
    assert.deepStrictEqual([...selected].sort(), tonalities.map(key => key.id).sort());
    const chosen = circleButtons(instance).find(button => button.data.attrs["aria-pressed"] === "true");
    const before = instance.value;
    chosen.data.on.click();
    assert.strictEqual(instance.value, before, "selecting same segment must keep chosen spelling");
    instance.$destroy();
  }
});

test("unavailable keys stay disabled and never emit; accidental changes remove disallowed alternatives", async () => {
  const instance = view("de", "german", { accidentals: "no" });
  const emitted = [];
  instance.$on("input", value => emitted.push(value));
  assert.strictEqual(circleButtons(instance).filter(button => !button.data.attrs.disabled).length, 2);
  circleButtons(instance).filter(button => button.data.attrs.disabled).forEach(button => button.data.on.click());
  assert.deepStrictEqual(emitted, []);
  instance.accidentals = "sharpAndFlat";
  instance.value = "F-sharp-major";
  await Vue.nextTick();
  assert.strictEqual(variantButtons(instance).length, 2);
  instance.chooseCandidates(instance.variantCandidates);
  instance.accidentals = "onlySharp";
  await Vue.nextTick();
  assert(instance.variantCandidates.every(candidate => candidate.fifths >= 0));
  assert.strictEqual(variantButtons(instance).length, 0);
  instance.$destroy();
});

test("external key changes show the current register variants instead of a stale open spelling group", async () => {
  const instance = view("en", "international", { value: "F-sharp-major" });
  instance.chooseCandidates(instance.variantCandidates);
  instance.value = "C-sharp-major";
  await Vue.nextTick();
  assert(instance.variantCandidates.some(candidate => candidate.id === "C-sharp-major"));
  assert(instance.variantCandidates.every(candidate => candidate.circlePosition === instance.selectedTonality.circlePosition));
  instance.value = "G-major";
  await Vue.nextTick();
  assert.strictEqual(variantButtons(instance).length, 0);
  instance.$destroy();
});

test("Melody, Chords and Workshop reuse this single selector with their existing value/input contracts", () => {
  for (const name of ["NoteFlowMenu", "NoteFlowChordMenu", "Workshop"]) {
    const source = fs.readFileSync(path.join(sourceRoot, "components", name + ".vue"), "utf8");
    assert(source.includes('import NoteFlowCircleSelector from "./NoteFlowCircleSelector"'));
    assert(source.includes("<NoteFlowCircleSelector"));
  }
});

(async () => {
  for (const { name, body } of tests) {
    await body();
    process.stdout.write(`✓ ${name}\n`);
  }
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
