const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
const originalRuntime = global.regeneratorRuntime;
const originalWindow = global.window;
const originalTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { removeEventListener() {}, scrollTo() {} };

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src", relative), "utf8");
  const parsed = relative.endsWith(".vue") ? compiler.parseComponent(source) : null;
  const module = { exports: {} };
  new Function("module", "exports", "require", babel.transform(parsed ? parsed.script.content : source, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code)(module, module.exports, name => dependencies[name] || {});
  if (parsed) {
    const compiled = compiler.compile(parsed.template.content);
    assert.deepStrictEqual(compiled.errors, [], relative + " template");
    Object.assign(module.exports.default, compiler.compileToFunctions(parsed.template.content));
  }
  return module.exports;
}

function instance(component, extra = {}) {
  const definition = Object.assign({}, component, {
    created: undefined, mounted: undefined, beforeDestroy: undefined
  }, extra);
  definition.methods = Object.assign({}, component.methods, { $t: key => key }, extra.methods);
  return new Vue(definition);
}

function nodes(root) {
  return (Array.isArray(root) ? root : [root]).reduce((all, node) =>
    node ? all.concat(node, nodes(node.children || [])) : all, []);
}

async function test(name, body) {
  await body();
  process.stdout.write("✓ " + name + "\n");
}

(async () => {
  const ranges = load("model/NoteRanges.js");
  const clefs = load("model/ClefSelection.js");
  const preparation = load("model/PracticePreparation.js");
  const stored = {};
  let writes = 0;
  const options = load("model/Options.js", {
    "./VerifiedPersistence": load("model/VerifiedPersistence.js"),
    "./PersistenceFeedback": load("model/PersistenceFeedback.js"),
    lockr: {
      get: key => stored[key],
      set(key, value) { stored[key] = JSON.parse(JSON.stringify(value)); writes += 1; }
    },
    "./NoteRanges": ranges,
    "./ClefSelection": clefs,
    "./NoteNaming": load("model/NoteNaming.js"),
    "./AppVolume": load("model/AppVolume.js"),
    "./NoteFlowMovement": load("model/NoteFlowMovement.js"),
    "./PracticePreparation": preparation
  }).default;
  const menu = load("components/Menu.vue", {
    "../model/Options": options,
    "../model/NoteRanges": ranges,
    "../model/ClefSelection": clefs,
    "../model/Statistics": { loadStatistics() {} }
  }).default;
  const settings = load("components/AppSettingsMenu.vue", {
    "../model/Options": options,
    "../model/PracticePreparation": preparation,
    "../model/LanguageOptions": { ENABLED_LANGUAGES: ["de", "en"] }
  }).default;

  await test("free settings survive reload without starting or leaving through the header", async () => {
    const vm = instance(menu);
    const settingsVm = instance(settings);
    const warnings = [];
    const originalWarn = Vue.config.warnHandler;
    Vue.config.warnHandler = message => warnings.push(message);
    try {
      for (const [key, value] of [["gameLength", 20], ["inputMode", "midi"],
        ["sound", true], ["keepScreenAwake", false], ["preparationSeconds", 5], ["vibration", false], ["displayNote", false],
        ["difficulty", "custom"], ["clef", ["bass", "treble"]],
        ["customMinValue", 36], ["customMaxValue", 72],
        ["customTrebleMinValue", 60], ["customBassMaxValue", 48],
        ["accidentals", "onlyFlat"]]) {
        // General app choices are saved by their new owner; mode choices stay local.
        const owner = ["sound", "keepScreenAwake", "preparationSeconds", "vibration"].includes(key) ? settingsVm : vm;
        owner.options[key] = value;
        await Vue.nextTick();
        assert.deepStrictEqual(stored.options[key], value, key + " must persist");
      }
      const saved = JSON.parse(JSON.stringify(stored.options));
      const writesBeforeIdle = writes;
      await Vue.nextTick();
      await Vue.nextTick();
      assert.strictEqual(writes, writesBeforeIdle, "normalizing clefs must not cause a save loop");
      assert(!warnings.some(message => /infinite update loop/.test(message)));
      options.gameLength = 60;
      options.loadOptions();
      assert.strictEqual(options.gameLength, saved.gameLength);
      assert.strictEqual(options.sound, saved.sound);
      assert.strictEqual(options.keepScreenAwake, saved.keepScreenAwake);
      assert.strictEqual(options.preparationSeconds, saved.preparationSeconds);
      settingsVm.setPreparationSeconds("0");
      await Vue.nextTick();
      assert.strictEqual(stored.options.preparationSeconds, 0, "immediate-start UI selection persists as a number");
      vm.options.gameLength = 300;
      menu.beforeDestroy.call(vm);
      assert.strictEqual(stored.options.gameLength, 300, "native Back/destruction saves pending changes");
    } finally {
      vm.$destroy();
      settingsVm.$destroy();
      Vue.config.warnHandler = originalWarn;
    }
  });

  const utils = { hasAccidental: value => [1, 3, 6, 8, 10].includes(value % 12) };
  const exercises = load("model/AdaptiveExercises.js", {
    "./Utils": utils, "./NoteRanges": ranges, "./ClefSelection": clefs,
    "./AdaptiveOptions": { ADAPTIVE_ALLOWED_CLEFS: ["bass", "treble", "piano"] }
  });
  const keyboard = load("components/AdaptiveProgressKeyboard.vue", { "../model/Utils": utils }).default;

  await test("learning keyboard follows the actual candidates for separate, overlapping and piano ranges", async () => {
    const settings = { customMinValue: 28, customMaxValue: 69,
      customBassMaxValue: 48, customTrebleMinValue: 48, accidentals: "no" };
    for (const selectedClefs of [["bass", "treble"], ["piano"], ["treble"], ["bass"]]) {
      settings.clef = selectedClefs;
      const vm = instance(keyboard, { propsData: { progress: {}, minValue: 28, maxValue: 69,
        clefs: selectedClefs, candidates: exercises.createAdaptiveCandidates(settings) } });
      for (const view of vm.viewOptions) {
        vm.selectView(view.value);
        const bass = view.value.includes("bass");
        assert.deepStrictEqual(vm.viewRange, bass ? { min: 28, max: 48 } : { min: 48, max: 69 });
        assert(vm.keys.every(key => key.value >= vm.viewRange.min && key.value <= vm.viewRange.max));
        vm.selectKey(bass ? 69 : 28);
        assert.strictEqual(vm.selectedValue, null, "outside notes must not appear as learning gaps");
        vm.selectKey(48);
        assert.strictEqual(vm.selectedValue, 48, "C4 overlap remains available in both views");
      }
      if (selectedClefs.includes("treble")) {
        vm.selectView("treble");
        vm.selectKey(48);
        vm.candidates = exercises.createAdaptiveCandidates(Object.assign({}, settings, { customTrebleMinValue: 60 }));
        await Vue.nextTick();
        assert.strictEqual(vm.selectedValue, null, "tightening a clef boundary clears stale detail");
        assert.strictEqual(vm.viewRange.min, 60);
      }
      vm.$destroy();
    }
  });

  const training = { inputMode: "button" };
  const progress = {
    inputGroup: "screen", loads: [],
    loadFromDatabase(inputMode) {
      this.inputGroup = inputMode === "midi" ? "midi" : "screen";
      this.loads.push(inputMode);
      return Promise.resolve();
    }
  };
  const adaptive = load("components/AdaptiveMenu.vue", {
    "../model/AdaptiveOptions": Object.assign(training, { saveOptions() {} }),
    "../model/AdaptiveProgress": Object.assign(progress, {
      ADAPTIVE_INPUT_SCREEN: "screen", ADAPTIVE_INPUT_MIDI: "midi",
      getAdaptiveInputGroup: mode => mode === "midi" ? "midi" : "screen"
    }),
    "../model/UiPreferences": { loadAdaptiveProgressOpen: () => false, saveAdaptiveProgressOpen: value => value },
    "../model/SingleNotesLearningStorage": { status: { state: "ready" } }
  }).default;

  await test("MIDI statistics switch independently and training reloads its own learning group", async () => {
    const vm = instance(adaptive, { propsData: { initialView: "statistics" } });
    vm.showResetConfirmation = true;
    await vm.selectProgressInput("midi");
    assert.strictEqual(progress.inputGroup, "midi");
    assert.strictEqual(training.inputMode, "button");
    assert.strictEqual(vm.showResetConfirmation, false);
    vm.selectView("settings");
    assert.strictEqual(progress.inputGroup, "screen", "range suggestions return to the training group");
    vm.selectView("statistics");
    await vm.selectProgressInput("midi");
    let started = 0;
    vm.$on("startAdaptive", () => { started += 1; });
    await vm.startAdaptive();
    assert.strictEqual(progress.inputGroup, "screen", "Play again cannot train against MIDI statistics");
    assert.strictEqual(training.inputMode, "button");
    assert.strictEqual(started, 1);
    vm.$destroy();
  });

  const app = load("App.vue", { "./model/SaveDataImportNotice": { takeSaveDataImportSuccess: () => false } }).default;
  await test("dedicated results preserve each mode across restart, statistics, settings and abort", () => {
    for (const [mode, page, view, resultKey] of [["normal", "single-notes-menu", "singleNotesView", "lastResult"],
      ["adaptive", "adaptive-menu", "adaptiveView", "lastAdaptiveResult"]]) {
      const state = Object.assign(app.data(), app.methods, { currentGameMode: mode });
      const result = { score: 100 };
      state.returnFromGame(result);
      assert.strictEqual(state.page, "single-notes-result");
      assert.strictEqual(state[resultKey], result);
      state.restartSingleNotes();
      assert.strictEqual(state.page, "game");
      assert.strictEqual(state.currentGameMode, mode);
      state.returnFromGame(result);
      state.showSingleNotesStatistics();
      assert.strictEqual(state.page, page);
      assert.strictEqual(state[view], "statistics");
      const vm = instance(mode === "normal" ? menu : adaptive, { propsData: { initialView: state[view] } });
      assert.strictEqual(vm.activeView, "statistics");
      vm.$destroy();
      state.showSingleNotesSettings();
      assert.strictEqual(state.page, page);
      assert.strictEqual(state[view], "settings");
      state.returnFromGame(null);
      assert.strictEqual(state.page, page);
      assert.strictEqual(state[view], "settings");
      state.openSingleNotes();
      assert.strictEqual(state.page, "adaptive-menu", "Home always enters real Learning Mode");
      assert.strictEqual(state.adaptiveView, "settings");
    }
  });

  await test("round display snapshots settings without changing the persisted result", () => {
    for (const mode of ["normal", "adaptive"]) {
      const result = { score: 125, accuracy: 80, numCorrect: 4, numWrong: 1 };
      const original = JSON.stringify(result);
      const game = { timeLeft: 0, options: { gameLength: 20, inputMode: "midi" } };
      const state = Object.assign(app.data(), app.methods, { currentGameMode: mode, $refs: { game } });
      state.returnFromGame(result);
      assert.deepStrictEqual(state.singleNotesResultContext, { remainingSeconds: 0, gameLength: 20, inputMode: "midi" });
      game.options.inputMode = "button"; game.options.gameLength = 60;
      assert.strictEqual(state.singleNotesResultContext.inputMode, "midi");
      assert.strictEqual(state.singleNotesResultContext.gameLength, 20);
      assert.strictEqual(JSON.stringify(result), original);
      state.returnFromGame(null);
      assert.strictEqual(state.singleNotesResultContext, null);
    }
    const shell = load("components/SingleNotesRoundResult.vue").default;
    for (const [infinite, remaining, label] of [[false, 0, "0:00"], [false, 9, "0:09"], [true, 0, "∞"]]) {
      const vm = instance(shell, { propsData: { lastResult: { isInfiniteRound: infinite }, roundContext: { remainingSeconds: remaining } } });
      assert.strictEqual(vm.remainingTimeLabel, label); vm.$destroy();
    }
  });

  await test("result card displays DE/EN values and the shared header connects all three actions", () => {
    const card = load("components/LastResultDisplay.vue").default;
    for (const locale of ["de", "en"]) {
      const dictionary = load("resources/" + locale + ".js").default;
      const vm = instance(card, { propsData: { lastResult: {
        score: 125, accuracy: 80, numCorrect: 4, numWrong: 1
      } }, methods: { $t(key) { assert.strictEqual(typeof dictionary[key], "string", key); return dictionary[key]; } } });
      const tree = nodes(vm._render());
      const content = tree.map(node => node.text || "").join(" ");
      assert(content.includes("125"));
      assert(content.includes("80 %"));
      assert(content.includes(dictionary.SINGLE_NOTES_ROUND_COMPLETE));
      assert.strictEqual(tree.filter(node => node.tag === "button").length, 0,
        "result body must not duplicate header actions");
      const shell = instance(load("components/SingleNotesRoundResult.vue").default, {
        propsData: { lastResult: { score: 125, accuracy: 80, numCorrect: 4, numWrong: 1 } },
        methods: { $t(key) { assert.strictEqual(typeof dictionary[key], "string", key); return dictionary[key]; } }
      });
      const events = [];
      shell.$on("play-again", () => events.push("again"));
      shell.$on("statistics", () => events.push("statistics"));
      shell.$on("settings", () => events.push("settings"));
      nodes(shell._render()).filter(node => node.tag === "button").forEach(node => node.data.on.click());
      assert.deepStrictEqual(events, ["settings", "again", "statistics"]);
      shell.$destroy();
      vm.$destroy();
    }
  });

  await test("round clock ends at twenty active seconds and preserves pause, unlimited and abort behavior", async () => {
    const game = load("components/Game.vue", {
      "../model/Options": { gameLength: 20, inputMode: 'button', preparationSeconds: 0 },
      "../model/ScreenAwakeMixin": { createScreenAwakeMixin: () => ({}) },
      "../model/PianoAudio": { createPianoSamplePlayer: () => ({ stopAll() {}, play() {} }) },
      "../model/PracticePreparation": preparation,
      "../model/RoundPause": load("model/RoundPause.js"),
      "../model/AudioSynchronization": { resume() {} }
    }).default;
    let now = 0;
    let finishes = 0;
    let timerId = 0;
    const pending = new Map();
    global.setTimeout = (callback, delay) => { const id = ++timerId; pending.set(id, { callback, at: now + delay }); return id; };
    global.clearTimeout = id => pending.delete(id);
    const round = instance(game, { methods: {
      getCurrentTimeMs: () => now,
      generateExercise: () => ({ clef: 'treble', staff: 'treble', value: 48, isSharp: true }),
      onGameFinished() { finishes += 1; this.onExit(); }
    } });
    await round.startGame(); round.onExerciseRendered(round.currentExerciseId, round.preparationId);
    function tick() {
      const timer = pending.get(round.timer); assert(timer);
      pending.delete(round.timer); now = timer.at; timer.callback();
    }
    for (let second = 0; second < 19; second += 1) tick();
    assert.strictEqual(now, 19000);
    assert.strictEqual(finishes, 0);
    round.pauseGame();
    assert.strictEqual(pending.size, 0);
    assert.strictEqual(round.timeLeft, 1);
    now += 60000;
    round.startRoundTimer();
    assert.strictEqual(pending.size, 0, "pause cannot restart the timer");
    round.resumeGame(); round.onExerciseRendered(round.currentExerciseId, round.preparationId);
    tick();
    assert.strictEqual(now, 80000, "only twenty active seconds count");
    assert.strictEqual(finishes, 1);
    assert.strictEqual(round.timeLeft, 0);
    assert.strictEqual(pending.size, 0);
    round.options = Object.assign({}, round.options, { gameLength: 0 });
    await round.startGame(); round.onExerciseRendered(round.currentExerciseId, round.preparationId);
    assert.strictEqual(pending.size, 0, "unlimited has no countdown");
    let quits = 0;
    round.quit = () => { quits += 1; };
    round.handleRoundExit();
    assert.strictEqual(finishes, 2, "unlimited End round still finishes");
    round.options.gameLength = 20;
    round.handleRoundExit();
    assert.strictEqual(quits, 1, "timed Abort still discards the round");
    assert.strictEqual(finishes, 2);
    round.onExit(); round.$destroy();
  });
})().catch(error => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
}).finally(() => {
  global.regeneratorRuntime = originalRuntime;
  global.window = originalWindow;
  global.setTimeout = originalTimeout;
  global.clearTimeout = originalClearTimeout;
});
