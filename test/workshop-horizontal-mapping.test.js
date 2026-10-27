const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const { createWorkshopHorizontalMapping, workshopXAtMappedSlot, workshopSlotAtMappedX } = require("../src/model/WorkshopHorizontalMapping");
const cases = [];
function test(name, body) { cases.push([name, body]); }
function close(actual, expected) { assert(Math.abs(actual - expected) < 1e-8, actual + " != " + expected); }
const geometry = { left: 90, unitWidth: 31, width: 360 };
function note(slot, x, extra = {}) { return Object.assign({ kind: "note", startSlot: slot, x, noteValue: "sixteenth" }, extra); }

test("empty and ordinary measures preserve the former uniform time grid", () => {
  for (const step of [.5, .25, 1 / 12]) {
    const events = [0, 2, 6].map(slot => note(slot, geometry.left + (slot + step) * geometry.unitWidth));
    for (const source of [[], events]) {
      const map = createWorkshopHorizontalMapping(source, geometry, step, 8);
      for (let i = -1; i <= Math.round(8 / step); i++) {
        const slot = i * step, x = geometry.left + (slot + step) * geometry.unitWidth;
        close(workshopXAtMappedSlot(map, slot), x);
        close(workshopSlotAtMappedX(map, x, { snap: false, clamp: false }), slot);
        close(workshopSlotAtMappedX(map, x), Math.max(0, Math.min(8 - step, slot)));
      }
      close(workshopXAtMappedSlot(map, -step), geometry.left);
    }
  }
});

test("shifted dense columns invert to their written onsets rather than the bar end", () => {
  const events = [note(0, 105.5), note(2, 213.5), note(4, 321.5), note(6, 429.5)];
  const map = createWorkshopHorizontalMapping(events, { ...geometry, width: 538 }, .5, 8);
  close(workshopSlotAtMappedX(map, 429.5), 6);
  close(workshopXAtMappedSlot(map, 6), 429.5);
  close(workshopSlotAtMappedX(map, (213.5 + 321.5) / 2, { snap: false }), 3);
  close(workshopSlotAtMappedX(map, workshopXAtMappedSlot(map, 7.5)), 7.5);
  assert(workshopXAtMappedSlot(map, 7.5) > 429.5);
});

test("uniform mappings retain the exact original floating-point formulas", () => {
  const frame = { left: 90, unitWidth: 248 / 12, width: 360 }, step = .5;
  const map = createWorkshopHorizontalMapping([], frame, step, 12);
  assert(map.linear);
  for (const slot of [-step, 0, .5, 1 / 12, 3.5, 11.5]) {
    const x = frame.left + (slot + step) * frame.unitWidth;
    assert.strictEqual(workshopXAtMappedSlot(map, slot), x);
    assert.strictEqual(workshopSlotAtMappedX(map, x, { snap: false, clamp: false }),
      (x - frame.left) / frame.unitWidth - step);
  }
});

test("both displaced chord heads and explicit rests target their shared onset", () => {
  const map = createWorkshopHorizontalMapping([note(0, 105.5), note(2, 200), note(2, 212),
    { kind: "rest", startSlot: 4, x: 280, noteValue: "quarter" }], geometry, .5, 8);
  for (const x of [200, 206, 212]) close(workshopSlotAtMappedX(map, x), 2);
  close(workshopSlotAtMappedX(map, 280), 4);
  close(workshopXAtMappedSlot(map, 2), 200);
});

test("grace heads do not create time columns and silence uses its visual midpoint", () => {
  const map = createWorkshopHorizontalMapping([note(2, 90, { grace: true }), note(2, 167.5),
    { kind: "rest", startSlot: 4, x: 276, noteValue: "half", implicit: true }], geometry, .5, 8);
  assert.strictEqual(map.anchors.filter(anchor => anchor.slot === 2).length, 1);
  close(workshopSlotAtMappedX(map, 167.5), 2);
  close(workshopSlotAtMappedX(map, 276, { snap: false }), 5.5);
});

test("frozen drag maps survive changes to source events and viewport geometry", () => {
  const events = [note(0, 105.5), note(2, 200), note(6, 400)], frame = { ...geometry };
  const map = createWorkshopHorizontalMapping(events, frame, .5, 8), snapshot = JSON.stringify(map);
  const start = workshopSlotAtMappedX(map, 200, { snap: false, clamp: false });
  close(workshopSlotAtMappedX(map, 250, { snap: false, clamp: false }) - start, 1);
  events[1].x = 320; events.push(note(4, 450)); frame.left = 400; frame.unitWidth = 200;
  assert.strictEqual(JSON.stringify(map), snapshot);
  close(workshopSlotAtMappedX(map, 250, { snap: false, clamp: false }) - start, 1);
  assert(Object.isFrozen(map) && Object.isFrozen(map.anchors) && Object.isFrozen(map.anchors[1]));
  assert.strictEqual(workshopSlotAtMappedX(map, -1000), 0);
  assert.strictEqual(workshopSlotAtMappedX(map, 10000), 7.5);
});

cases.forEach(([name, body]) => { body(); process.stdout.write("PASS " + name + "\n"); });
process.stdout.write("All " + cases.length + " workshop horizontal mapping tests passed.\n");
