const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originals = {
  js: Module._extensions[".js"],
  vue: Module._extensions[".vue"],
  css: Module._extensions[".css"]
};
Module._extensions[".js"] = function transpileProject(loadedModule, filename) {
  if (!filename.startsWith(sourceRoot)) return originals.js(loadedModule, filename);
  loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = loadedModule => { loadedModule.exports = { name: "VisualStub" }; };
Module._extensions[".css"] = loadedModule => { loadedModule.exports = {}; };

function readComponent(name) {
  const filename = path.join(sourceRoot, "components", name + ".vue");
  const source = fs.readFileSync(filename, "utf8");
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  loadedModule._compile(babel.transform(script, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return { definition: loadedModule.exports.default, source };
}

const history = require("../src/model/NoteFlowHistoryWindow");
const statistics = require("../src/model/RoundStatistics");
const storage = require("../src/model/NoteFlowRoundStorage").default;
const flowComponent = readComponent("NoteFlowHistoryChart");
const sharedComponent = readComponent("RoundHistoryChart");
const languages = [require("../src/resources/de").default, require("../src/resources/en").default];
Object.keys(originals).forEach(extension => {
  if (originals[extension]) Module._extensions["." + extension] = originals[extension];
  else delete Module._extensions["." + extension];
});

function makeView(definition, values = {}) {
  const view = {
    $i18n: { locale: "de" },
    $t: (key, parameters) => key + (parameters ? JSON.stringify(parameters) : ""),
    $emit() {},
    $nextTick(callback) { if (callback) callback.call(this); },
    $refs: {}
  };
  Object.keys(definition.props || {}).forEach(name => {
    const prop = definition.props[name];
    if (Object.prototype.hasOwnProperty.call(prop, "default")) {
      view[name] = typeof prop.default === "function" ? prop.default() : prop.default;
    }
  });
  Object.assign(view, values);
  Object.assign(view, definition.data ? definition.data.call(view) : {});
  Object.keys(definition.methods || {}).forEach(name => {
    view[name] = definition.methods[name].bind(view);
  });
  Object.keys(definition.computed || {}).forEach(name => {
    Object.defineProperty(view, name, { get: definition.computed[name].bind(view), configurable: true });
  });
  return view;
}

function round(index, accuracy = 80, correct = 4, wrong = 1) {
  return {
    id: "round-" + index,
    mode: index % 3 ? "normal" : "learning",
    completedAt: new Date(Date.UTC(2026, 9, 7, 8, index)).toISOString(),
    durationMs: 12500,
    score: { accuracy, correct, wrong, missed: 0, evaluatedInputs: correct + wrong },
    timing: { averageAbsoluteOffsetMs: 0 },
    settings: {
      bpm: 60, behavior: "wait", handMode: "two", movement: "custom",
      rhythm: { meter: "3/4", noteDensity: 0, allowedValues: { treble: ["quarter"], bass: ["half"] } }
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function test(name, body) {
  await body();
  process.stdout.write("✓ " + name + "\n");
}

async function run() {
  await test("bounds recent and all-history windows including smoothing context", () => {
    for (const count of [0, 1, 9, 10, 25, 50, 51, 137, 1000000]) {
      for (const limit of [10, 25, 50, "all"]) {
        for (const page of [null, 1, 2, 999999]) {
          const window = history.createNoteFlowHistoryWindow(count, limit, page);
          assert(window.readStart >= 0);
          assert(window.startIndex >= window.readStart);
          assert(window.endIndex <= count);
          assert(window.endIndex - window.startIndex <= 50);
          assert(window.endIndex - window.readStart <= 54);
        }
      }
    }
    const newest = history.createNoteFlowHistoryWindow(137, "all");
    assert.deepStrictEqual([newest.page, newest.startIndex, newest.endIndex, newest.readStart], [3, 100, 137, 96]);
    const earlier = history.createNoteFlowHistoryWindow(137, "all", 2);
    assert.deepStrictEqual([earlier.startIndex, earlier.endIndex, earlier.readStart], [50, 100, 46]);
  });

  await test("keeps source dates and legacy rounds while giving each point its database number", () => {
    const window = history.createNoteFlowHistoryWindow(17, 10);
    const records = Array.from({ length: window.endIndex - window.readStart }, (unused, index) => round(window.readStart + index + 1));
    records[5].completedAt = "2020-01-01T00:00:00.000Z";
    const data = history.createNoteFlowHistoryData(window, records);
    assert.strictEqual(data.rounds.length, 10);
    assert.deepStrictEqual(data.rounds.map(item => item.completedAt), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert(data.rounds.every(item => item.mode === "normal"));
    assert.strictEqual(data.rounds[1].sourceRound.completedAt, "2020-01-01T00:00:00.000Z");
    assert(data.rounds.some(item => item.sourceRound.mode === "learning"));
    assert.strictEqual(data.rounds[0].sourceRound, records[4]);
    assert.deepStrictEqual(statistics.createRoundChartPoints(data.rounds, "accuracy", null).map(point => point.id), data.rounds.map(item => item.id));
  });

  await test("uses the four preceding rounds for the first visible moving average", () => {
    const window = history.createNoteFlowHistoryWindow(15, 10);
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 20, 40, 60, 80];
    const records = values.map((value, index) => round(index + 2, value));
    const data = history.createNoteFlowHistoryData(window, records);
    assert.strictEqual(data.rounds[0].accuracy, 50);
    assert.deepStrictEqual(data.window.trendValues.slice(0, 3), [30, 40, 50]);
  });

  await test("excludes unplayed rounds from trends but includes genuinely wrong zero-percent rounds", () => {
    const empty = index => round(index, 0, 0, 0);
    const records = [round(1), empty(2), round(3), round(4), round(5), empty(6)];
    const data = history.createNoteFlowHistoryData(history.createNoteFlowHistoryWindow(records.length), records);
    assert.strictEqual(data.rounds.length, 6);
    assert.strictEqual(data.window.unratedCount, 2);
    assert.strictEqual(data.window.trend.direction, "stable");
    assert.strictEqual(data.window.trend.comparedRounds, 4);
    assert(data.window.trendValues.every(value => value === 80));
    const wrongOnly = [round(1), round(2), round(3, 0, 0, 5), round(4, 0, 0, 5)];
    const declining = history.createNoteFlowHistoryData(history.createNoteFlowHistoryWindow(4), wrongOnly);
    assert.strictEqual(declining.window.unratedCount, 0);
    assert.strictEqual(declining.window.trend.direction, "declining");
    assert.strictEqual(declining.window.trend.difference, 80);
    const noInputs = history.createNoteFlowHistoryData(history.createNoteFlowHistoryWindow(5), Array.from({ length: 5 }, (unused, index) => empty(index)));
    assert.deepStrictEqual(noInputs.window.trendValues, [null, null, null, null, null]);
    assert.strictEqual(noInputs.window.trend.direction, "insufficient");
  });

  const originalRead = storage.readHistoryWindow;
  try {
    await test("ignores late history responses and loads each input scope with exact bounds", async () => {
      const requests = [];
      storage.readHistoryWindow = (...args) => {
        const pending = deferred();
        requests.push({ args, pending });
        return pending.promise;
      };
      const view = makeView(flowComponent.definition, { inputGroup: "midi", totalRoundCount: 60 });
      const first = view.loadWindow({ limit: 10 });
      const second = view.loadWindow({ limit: 25 });
      assert.deepStrictEqual(requests.map(item => item.args), [["midi", 46, 60, "melody"], ["midi", 31, 60, "melody"]]);
      requests[1].pending.resolve({ saved: true, rounds: Array.from({ length: 29 }, (unused, index) => round(index + 32)) });
      await second;
      assert.strictEqual(view.historyState, "ready");
      assert.strictEqual(view.rounds.length, 25);
      const accepted = view.rounds;
      requests[0].pending.resolve({ saved: false, rounds: [] });
      await first;
      assert.strictEqual(view.historyState, "ready");
      assert.strictEqual(view.rounds, accepted);
      const screen = makeView(flowComponent.definition, { inputGroup: "screen", totalRoundCount: 1 });
      const screenRequest = screen.loadWindow();
      assert.deepStrictEqual(requests[2].args, ["screen", 0, 1, "melody"]);
      requests[2].pending.resolve({ saved: true, rounds: [round(1)] });
      await screenRequest;
      assert.strictEqual(screen.rounds.length, 1);
    });

    await test("shows read errors, retries the requested page, and ignores completion after destruction", async () => {
      const view = makeView(flowComponent.definition, { inputGroup: "midi", totalRoundCount: 75 });
      storage.readHistoryWindow = async () => ({ saved: false, rounds: [] });
      await view.loadWindow({ limit: "all", page: 1 });
      assert.strictEqual(view.historyState, "error");
      storage.readHistoryWindow = async () => ({ saved: true, rounds: [] });
      await view.loadWindow(view.historyWindow);
      assert.strictEqual(view.historyState, "error");
      storage.readHistoryWindow = async () => { throw new Error("unavailable"); };
      await view.loadWindow(view.historyWindow);
      assert.strictEqual(view.historyState, "error");
      storage.readHistoryWindow = async (input, start, end) => ({ saved: true, rounds: Array.from({ length: end - start }, (unused, index) => round(start + index + 1)) });
      await view.loadWindow(view.historyWindow);
      assert.strictEqual(view.historyWindow.page, 1);
      assert.strictEqual(view.rounds.length, 50);
      assert.strictEqual(view.historyState, "ready");
      const pending = deferred();
      storage.readHistoryWindow = () => pending.promise;
      const destroyed = view.loadWindow({ limit: 10 });
      const previous = view.rounds;
      flowComponent.definition.beforeDestroy.call(view);
      pending.resolve({ saved: true, rounds: Array.from({ length: 14 }, (unused, index) => round(index + 62)) });
      await destroyed;
      assert.strictEqual(view.rounds, previous);
      assert.strictEqual(view.historyState, "loading");
    });

    await test("switches exercise and input scopes without accepting stale successes or errors", async () => {
      const requests = [];
      storage.readHistoryWindow = (...args) => {
        const pending = deferred(); requests.push({ args, pending }); return pending.promise;
      };
      const view = makeView(flowComponent.definition, { inputGroup: "midi", totalRoundCount: 1 });
      assert.strictEqual(view.exerciseType, "melody");
      assert.strictEqual(view.showHandMode, true);
      const first = view.loadWindow();
      view.exerciseType = "chord";
      const second = flowComponent.definition.watch.exerciseType.call(view);
      view.inputGroup = "keyboard";
      const third = flowComponent.definition.watch.inputGroup.call(view);
      assert.deepStrictEqual(requests.map(request => request.args), [
        ["midi", 0, 1, "melody"], ["midi", 0, 1, "chord"], ["keyboard", 0, 1, "chord"]
      ]);
      const stored = Object.assign(round(1), { exerciseType: "chord", chord: { chordSize: 3, bassNote: true } });
      requests[2].pending.resolve({ saved: true, rounds: [stored] });
      await third;
      const accepted = view.rounds;
      requests[0].pending.resolve({ saved: true, rounds: [round(1)] });
      requests[1].pending.reject(new Error("old chord input scope failed"));
      await Promise.all([first, second]);
      assert.strictEqual(view.historyState, "ready");
      assert.strictEqual(view.rounds, accepted);
      view.selectRound(view.rounds[0], 1);
      assert.strictEqual(view.selectedRound, stored);
      assert.deepStrictEqual(view.selectedRound.chord, { chordSize: 3, bassNote: true });
      view.totalRoundCount = 2;
      const refreshed = flowComponent.definition.watch.totalRoundCount.call(view);
      assert.strictEqual(view.selectedRound, null);
      requests[3].pending.resolve({ saved: true, rounds: [stored, round(2)] });
      await refreshed;
      assert.strictEqual(view.rounds.length, 2);
    });

    await test("scope changes preserve a selected all-history page and limit", async () => {
      const calls = [];
      storage.readHistoryWindow = async (...args) => {
        calls.push(args);
        return { saved: true, rounds: Array.from({ length: args[2] - args[1] }, (unused, index) => round(args[1] + index + 1)) };
      };
      const view = makeView(flowComponent.definition, { inputGroup: "midi", totalRoundCount: 137 });
      await view.loadWindow({ limit: "all", page: 2 });
      view.exerciseType = "chord";
      await flowComponent.definition.watch.exerciseType.call(view);
      assert.strictEqual(view.historyWindow.limit, "all");
      assert.strictEqual(view.historyWindow.page, 2);
      assert.deepStrictEqual(calls[1], ["midi", 46, 100, "chord"]);
      view.inputGroup = "screen";
      await flowComponent.definition.watch.inputGroup.call(view);
      assert.strictEqual(view.historyWindow.limit, "all");
      assert.strictEqual(view.historyWindow.page, 2);
      assert.deepStrictEqual(calls[2], ["screen", 46, 100, "chord"]);
    });

    await test("selects the real round and retains meaningful zero timing and zero density", async () => {
      const stored = round(1);
      storage.readHistoryWindow = async () => ({ saved: true, rounds: [stored] });
      const view = makeView(flowComponent.definition, { inputGroup: "midi", totalRoundCount: 1 });
      await view.loadWindow();
      view.selectRound(view.rounds[0], 1);
      assert.strictEqual(view.selectedRound, stored);
      assert.strictEqual(view.selectedRoundNumber, 1);
      assert.strictEqual(view.evaluatedInputs, 5);
      assert.strictEqual(view.timingOffset, "0 ms");
      assert.strictEqual(view.noteDensity, 0);
      assert.notStrictEqual(view.formatDate(view.selectedRound.completedAt), "—");
      assert.strictEqual(view.formatDate("invalid date"), "—");
      view.selectRound(null);
      assert.strictEqual(view.selectedRound, null);
      assert.strictEqual(view.selectedRoundNumber, null);
      view.historyState = "loading";
      view.selectRound(view.rounds[0], 1);
      assert.strictEqual(view.selectedRound, null);
    });
  } finally {
    storage.readHistoryWindow = originalRead;
  }

  await test("keeps shared chart points clickable and keyboard accessible with global numbers", () => {
    const data = history.createNoteFlowHistoryData(history.createNoteFlowHistoryWindow(60, 10), Array.from({ length: 14 }, (unused, index) => round(index + 47)));
    const emitted = [];
    const view = makeView(sharedComponent.definition, {
      rounds: data.rounds, historyWindow: data.window, accuracyOnly: true,
      selectedRoundId: data.rounds[0].id,
      $emit: (...args) => emitted.push(args)
    });
    const attributes = {};
    const listeners = {};
    const classes = new Set();
    const node = {
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener(name, handler) { listeners[name] = handler; }
    };
    view.handleChartDraw({ type: "point", seriesIndex: 0, index: 0, element: { _node: node, addClass(name) { classes.add(name); } } });
    assert.strictEqual(attributes.role, "button");
    assert.strictEqual(attributes.tabindex, "0");
    assert.strictEqual(attributes["aria-pressed"], "true");
    assert(attributes["aria-label"].includes('"number":51'));
    assert(classes.has("selected-round-point"));
    listeners.click();
    let prevented = 0;
    listeners.keydown({ key: "Enter", preventDefault() { prevented += 1; } });
    listeners.keydown({ key: " ", preventDefault() { prevented += 1; } });
    listeners.keydown({ key: "Escape", preventDefault() { prevented += 1; } });
    assert.strictEqual(prevented, 2);
    assert.strictEqual(emitted.length, 3);
    emitted.forEach(event => assert.deepStrictEqual(event, ["select-round", data.rounds[0], 51]));
    assert.deepStrictEqual(view.chartData.series[1], data.window.trendValues);
    view.roundLimit = "all";
    sharedComponent.definition.watch.roundLimit.call(view);
    assert.deepStrictEqual(emitted[4], ["request-window", { limit: "all", page: null }]);
    view.changeHistoryPage(-1);
    assert.deepStrictEqual(emitted[6], ["request-window", { limit: "all", page: 1 }]);
  });

  await test("preserves local single-note filtering, accuracy/score metrics and page navigation", () => {
    const normal = Array.from({ length: 61 }, (unused, index) => ({
      id: "single-" + (index + 1), mode: "normal", completedAt: index + 1,
      accuracy: index % 101, score: index * 20
    }));
    const view = makeView(sharedComponent.definition, {
      rounds: [{ id: "learning", mode: "learning", completedAt: 999, accuracy: 99, score: 5000 }].concat(normal).reverse()
    });
    assert.strictEqual(view.historyWindow, null);
    assert.strictEqual(view.accuracyOnly, false);
    assert.strictEqual(view.normalRoundCount, 61);
    assert.strictEqual(view.points.length, 10);
    assert.strictEqual(view.firstRoundNumber, 52);
    assert.deepStrictEqual(view.points.map(point => point.value), [51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    view.metric = "score";
    assert.strictEqual(view.points[0].value, 1020);
    assert.strictEqual(view.chartData.series.length, 1);
    view.metric = "accuracy";
    view.roundLimit = "all";
    sharedComponent.definition.watch.roundLimit.call(view);
    assert.strictEqual(view.historyPageInfo.page, 2);
    assert.strictEqual(view.points.length, 11);
    assert.strictEqual(view.firstRoundNumber, 51);
    assert.strictEqual(view.trendValues[0], 48);
    view.changeHistoryPage(-1);
    assert.strictEqual(view.historyPageInfo.page, 1);
    assert.strictEqual(view.points.length, 50);
    assert.strictEqual(view.firstRoundNumber, 1);
  });

  await test("provides German and English labels for all static chart and detail keys", () => {
    const keys = new Set();
    [flowComponent.source, sharedComponent.source].forEach(source => {
      const expression = /["']([A-Z][A-Z0-9_]+|wrong)["']/g;
      let match;
      while ((match = expression.exec(source))) {
        if (match[1] !== "Line") keys.add(match[1]);
      }
    });
    keys.forEach(key => languages.forEach((language, index) => {
      assert.strictEqual(typeof language[key], "string", key + " missing in " + (index ? "English" : "German"));
      assert(language[key].trim(), key + " is empty");
    }));
  });
  process.stdout.write("Note Flow interactive history tests passed.\n");
}

run().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
