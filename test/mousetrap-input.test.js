const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");

const source = fs.readFileSync(
  path.join(__dirname, "../src/components/MousetrapInput.vue"),
  "utf8"
);
const parsed = compiler.parseComponent(source);
const componentModule = { exports: {} };
new Function("module", "exports", babel.transform(parsed.script.content, {
  babelrc: false,
  presets: [["env", { modules: "commonjs" }]]
}).code)(componentModule, componentModule.exports);
const component = componentModule.exports.default;

const expectedNotes = {
  y: 0, s: 1, x: 2, d: 3, c: 4, v: 5,
  g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ",": 0, l: 1, ".": 2, "ö": 3, "-": 4,
  q: 0, "2": 1, w: 2, "3": 3, e: 4, r: 5,
  "5": 6, t: 7, "6": 8, z: 9, "7": 10, u: 11,
  i: 0, "9": 1, o: 2, "0": 3, p: 4, "ü": 5, "+": 7
};
const bindings = new Map();
const unrelatedHandler = () => {};
bindings.set("esc", unrelatedHandler);
const mousetrap = {
  bind(key, handler) { bindings.set(key, handler); },
  unbind(key) { bindings.delete(key); }
};

function mount() {
  const events = [];
  const instance = Object.assign({
    $mousetrap: mousetrap,
    $emit: (name, note) => events.push({ name, note })
  }, component.methods);
  component.mounted.call(instance);
  return { instance, events };
}

const first = mount();
assert.strictEqual(bindings.size, Object.keys(expectedNotes).length + 1);
for (const [key, note] of Object.entries(expectedNotes)) {
  bindings.get(key)();
  assert.deepStrictEqual(first.events.pop(), { name: "solved", note }, key);
}
process.stdout.write("✓ every existing computer-keyboard shortcut keeps its note\n");

assert.strictEqual(typeof component.beforeDestroy, "function",
  "leaving training must release its global shortcuts");
component.beforeDestroy.call(first.instance);
assert.deepStrictEqual(Array.from(bindings.keys()), ["esc"]);
assert.strictEqual(bindings.get("esc"), unrelatedHandler);
assert.deepStrictEqual(first.events, []);
process.stdout.write("✓ leaving training removes note shortcuts and preserves unrelated shortcuts\n");

const second = mount();
bindings.get("q")();
assert.deepStrictEqual(second.events, [{ name: "solved", note: 0 }]);
assert.deepStrictEqual(first.events, [], "the previous training receives no input");
component.beforeDestroy.call(second.instance);
assert.deepStrictEqual(Array.from(bindings.keys()), ["esc"]);
process.stdout.write("✓ a new training registers fresh callbacks and releases them again\n");
