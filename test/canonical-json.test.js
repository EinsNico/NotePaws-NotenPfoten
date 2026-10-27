const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const parser = require(require.resolve("babylon", {
  paths: [path.dirname(require.resolve("babel-core"))]
}));

const root = path.resolve(__dirname, "..");
const oracle = require("./fixtures/cleanup-original-functions.json");
assert.strictEqual(oracle.schemaVersion, 1);
const originals = [
  ["AdaptiveHistory", "canonicalize"], ["SaveDataImport", "canonicalize"],
  ["SaveDataMerge", "canonicalize"], ["SaveDataLargeMergePreparation", "canonical"],
  ["SaveDataLargeMergePreview", "canonical"], ["SaveDataLargeMergeRoundWriter", "canonical"]
];

function load(source, name) {
  const mod = new Module(__filename, module);
  mod.paths = module.paths;
  mod._compile(babel.transform(source + `\nmodule.exports = ${name};`, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, __filename);
  return mod.exports;
}
const canonicalize = load(fs.readFileSync(path.join(root, "src/model/CanonicalJson.js"), "utf8"), "canonicalize");

function original(file, name) {
  const relative = `src/model/${file}.js`;
  const fixture = oracle.originals[relative].functions[name];
  const source = fixture.source;
  assert.strictEqual(crypto.createHash("sha256").update(source).digest("hex"), fixture.sha256);
  const ast = parser.parse(source, { sourceType: "module" });
  const node = ast.program.body[0];
  assert.strictEqual(ast.program.body.length, 1);
  assert.strictEqual(node.type, "FunctionDeclaration");
  assert.strictEqual(node.id.name, name);
  assert.strictEqual(crypto.createHash("sha256").update(source.slice(node.body.start, node.body.end)).digest("hex"), fixture.bodySha256);
  return load(source, name);
}

// Include own-key order, array holes, -0 and the legacy __proto__ assignment behavior.
function shape(value) {
  if (!value || typeof value !== "object") return [typeof value, value];
  const prototype = Object.getPrototypeOf(value);
  return [Array.isArray(value) ? "array" : "object",
    prototype === Object.prototype ? "Object.prototype"
      : prototype === Array.prototype ? "Array.prototype"
        : prototype === null ? null : shape(prototype),
    Reflect.ownKeys(value).map(key => [key, shape(value[key])])];
}

function outcome(fn, factory) {
  const trace = [];
  let value;
  try { value = fn(factory(trace)); }
  catch (error) { return { trace, error: [error.name, error.message], thrown: error }; }
  let json;
  let jsonError;
  try { json = JSON.stringify(value); }
  catch (error) { jsonError = [error.name, error.message]; }
  return { trace, shape: shape(value), json, jsonError };
}

const thrown = new Error("getter failure identity");
const callable = function toJSON() { return { z: 2, a: this.a }; };
const symbol = Symbol("same identity");
const fixtures = [
  () => null, () => undefined, () => false, () => true, () => 0, () => -0,
  () => NaN, () => Infinity, () => -Infinity, () => "Ö🦊\u0000", () => 12n,
  () => symbol, () => callable,
  () => ({ z: { y: 2, a: [undefined, null, NaN, -0] }, a: { b: 4, a: 1 } }),
  () => ({ "10": "ten", "2": "two", "01": "one", "é": 1, "e\u0301": 2, A: 3, a: 4 }),
  () => JSON.parse('{"z":1,"__proto__":{"z":3,"a":2},"constructor":{"z":4,"a":1}}'),
  () => JSON.parse('{"__proto__":null,"constructor":null}'),
  () => Object.assign(Object.create({ inherited: 1 }), { z: 2, a: 3 }),
  () => { const value = Object.create(null); value.z = 1; value.a = 2; return value; },
  () => { const value = new Array(5); value[1] = undefined; value[3] = { z: 1, a: 2 }; value.extra = 3; return value; },
  () => { const value = { z: 1, [symbol]: 2 }; Object.defineProperty(value, "hidden", { value: 3 }); return value; },
  () => new Date("2026-10-08T00:00:00Z"), () => /fox/g, () => new Map([["z", 1]]),
  () => new Set([2, 1]), () => new Uint8Array([9, 3]), () => new Number(-0),
  () => ({ toJSON: callable, z: undefined, a: 1 }),
  trace => { const value = {}; ["z", "a", "2", "10"].forEach(key => Object.defineProperty(value, key, {
    enumerable: true, get() { trace.push(key); return { z: key, a: 1 }; }
  })); return value; },
  trace => new Proxy({ z: 2, a: 1 }, {
    ownKeys(target) { trace.push("ownKeys"); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trace.push(`descriptor:${key}`); return Object.getOwnPropertyDescriptor(target, key); },
    get(target, key) { trace.push(`get:${String(key)}`); return target[key]; }
  }),
  () => { const value = {}; Object.defineProperty(value, "a", { enumerable: true, get() { throw thrown; } }); return value; }
];

function generated(seed, depth = 0) {
  if (depth === 3 || seed % 4 === 0) return [null, undefined, -0, NaN, "🦊", seed][seed % 6];
  if (seed % 4 === 1) return [generated(seed * 3 + 1, depth + 1), generated(seed * 5 + 2, depth + 1)];
  const value = {};
  ["z", "10", "2", "a", "constructor"].forEach((key, index) => { value[key] = generated(seed * 7 + index, depth + 1); });
  return value;
}
for (let seed = 0; seed < 200; seed += 1) fixtures.push(() => generated(seed));

originals.forEach(([file, name]) => {
  const baseline = original(file, name);
  fixtures.forEach((factory, index) => {
    const before = outcome(baseline, factory);
    const after = outcome(canonicalize, factory);
    const label = `${file} fixture ${index}`;
    assert.deepStrictEqual(after.trace, before.trace, label + " access order");
    assert.deepStrictEqual(after.shape, before.shape, label + " value/key/hole/prototype identity");
    assert.strictEqual(after.json, before.json, label + " serialized bytes");
    assert.deepStrictEqual(after.jsonError, before.jsonError, label + " stringify failure");
    assert.deepStrictEqual(after.error, before.error, label + " canonical failure");
    if (before.thrown === thrown) assert.strictEqual(after.thrown, thrown, label + " thrown identity");
  });
  process.stdout.write(`✓ ${file}: ${fixtures.length} cases match the hash-verified original function body\n`);
});
assert.strictEqual(JSON.stringify(canonicalize({ z: 1, a: { z: 3, a: 2 } })), '{"a":{"a":2,"z":3},"z":1}');
assert.strictEqual(Object.is(canonicalize(-0), -0), true);
assert.strictEqual(canonicalize([, undefined]).hasOwnProperty(0), false);
process.stdout.write("✓ canonical JSON known ordering, signed zero and sparse-array contract\n");
