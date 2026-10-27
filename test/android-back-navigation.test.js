const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const originalRegeneratorRuntime = global.regeneratorRuntime;
global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadComponent(name) {
  const source = fs.readFileSync(path.join(__dirname, "../src/components", name), "utf8");
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled = babel.transform(script, {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  }).code;
  const module = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    module, module.exports, () => ({})
  );
  return module.exports.default;
}

function loadApp() {
  const source = fs.readFileSync(path.join(__dirname, "../src/App.vue"), "utf8");
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled = babel.transform(script, {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  }).code;
  const module = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    module, module.exports, name => name === "./model/SaveDataImportNotice"
      ? { takeSaveDataImportSuccess: () => false }
      : {}
  );
  return module.exports.default;
}

function test(name, body) {
  body();
  process.stdout.write(`✓ ${name}\n`);
}

const app = loadApp();
const originalWindow = global.window;
const originalDocument = global.document;
const originalNow = Date.now;
const listeners = {};
const timers = new Map();
let nextTimer = 0;
let exitCount = 0;
let now = 10000;
global.document = {
  addEventListener(type, listener) { listeners[type] = listener; },
  removeEventListener(type, listener) {
    if (listeners[type] === listener) delete listeners[type];
  }
};
global.window = {
  navigator: { app: { exitApp() { exitCount += 1; } } },
  setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
  clearTimeout(id) { timers.delete(id); },
  scrollTo() {}
};
Date.now = () => now;

try {
  const instance = Object.assign(app.data(), {
    $refs: {},
    $nextTick(callback) { callback(); }
  });
  Object.keys(app.methods).forEach(name => {
    instance[name] = app.methods[name].bind(instance);
  });
  app.mounted.call(instance);
  function back(elapsedMs = 300) {
    now += elapsedMs;
    let prevented = false;
    listeners.backbutton({ preventDefault() { prevented = true; } });
    assert(prevented);
  }

  function backContext(page) {
    const context = Object.assign(app.data(), { page, $refs: {} });
    Object.keys(app.methods).forEach(name => {
      context[name] = app.methods[name].bind(context);
    });
    return context;
  }

  function deliverBack(context, elapsedMs = 0) {
    now += elapsedMs;
    let prevented = false;
    context.handleAndroidBack({ preventDefault() { prevented = true; } });
    assert(prevented, "duplicate events must also prevent native fallback");
  }

  test("Android Back closes daily tasks without leaving home or arming app exit", () => {
    const context = backContext("home");
    let open = true;
    context.$refs.homeMenu = { closeDailyTasks() { const wasOpen = open; open = false; return wasOpen; } };
    deliverBack(context);
    assert.strictEqual(open, false);
    assert.strictEqual(context.page, "home");
    assert.strictEqual(context.showExitHint, false);
    assert.strictEqual(context.lastHomeBackAt, 0);
    deliverBack(context, 30);
    assert.strictEqual(context.showExitHint, false, "duplicate Back must not arm the app exit hint");
  });

  test("duplicate Android events navigate one parent while a later press still works", () => {
    const context = backContext("note-flow-menu");
    deliverBack(context);
    assert.strictEqual(context.page, "note-flow-hub");
    deliverBack(context);
    assert.strictEqual(context.page, "note-flow-hub");
    deliverBack(context, 249);
    assert.strictEqual(context.page, "note-flow-hub");
    deliverBack(context, 1);
    assert.strictEqual(context.page, "home", "ignored duplicates do not prolong the window");
  });

  test("Back leaves the dedicated result for its own settings exactly once", () => {
    for (const [mode, page, view] of [["normal", "single-notes-menu", "singleNotesView"],
      ["adaptive", "adaptive-menu", "adaptiveView"]]) {
      const context = backContext("single-notes-result");
      context.currentGameMode = mode;
      context[view] = "statistics";
      deliverBack(context, 300);
      assert.strictEqual(context.page, page);
      assert.strictEqual(context[view], "settings");
      deliverBack(context, 30);
      assert.strictEqual(context.page, page);
    }
  });

  test("duplicate home Back cannot exit the app with one physical action", () => {
    const context = backContext("home"), exitsBefore = exitCount;
    deliverBack(context);
    deliverBack(context, 20);
    assert(context.showExitHint);
    assert.strictEqual(exitCount, exitsBefore);
    deliverBack(context, 300);
    assert.strictEqual(exitCount, exitsBefore + 1);
    assert.strictEqual(context.showExitHint, false);
    exitCount = exitsBefore;
  });

  test("duplicate Back closes a setting section without also leaving its menu", () => {
    const context = backContext("single-notes-menu");
    let sectionOpen = true, handled = 0;
    context.$refs.singleNotesMenu = { handleBack() {
      handled += 1;
      if (!sectionOpen) return false;
      sectionOpen = false;
      return true;
    } };
    deliverBack(context);
    deliverBack(context, 30);
    assert.strictEqual(sectionOpen, false);
    assert.strictEqual(handled, 1);
    assert.strictEqual(context.page, "single-notes-menu");
    deliverBack(context, 300);
    assert.strictEqual(context.page, "home");
  });

  test("duplicate Back dismisses an import dialog without showing an exit hint", () => {
    const context = backContext("home");
    context.importSuccessNotice = true;
    deliverBack(context);
    deliverBack(context, 40);
    assert.strictEqual(context.importSuccessNotice, false);
    assert.strictEqual(context.showExitHint, false);
  });

  test("duplicate Back requests a training exit only once", () => {
    const context = backContext("game");
    let requests = 0;
    context.$refs.game = { handleRoundExit() { requests += 1; } };
    deliverBack(context);
    deliverBack(context, 10);
    assert.strictEqual(requests, 1);
    deliverBack(context, 300);
    assert.strictEqual(requests, 2);
  });

  test("the duplicate guard accepts an initial zero timestamp and recovers after clock rollback", () => {
    const context = backContext("note-flow-menu"), previousNow = now;
    now = 0;
    deliverBack(context);
    deliverBack(context);
    assert.strictEqual(context.page, "note-flow-hub");
    now = -100;
    deliverBack(context);
    assert.strictEqual(context.page, "home");
    now = previousNow;
  });

  test("home first Back shows the hint, second Back exits, and timeout resets", () => {
    back();
    assert(instance.showExitHint);
    assert.strictEqual(exitCount, 0);
    now += 1000;
    back();
    assert.strictEqual(exitCount, 1);
    assert.strictEqual(instance.showExitHint, false);
    back();
    assert(instance.showExitHint);
    timers.get(instance.exitHintTimer)();
    assert.strictEqual(instance.showExitHint, false);
    now += 3000;
    back();
    assert.strictEqual(exitCount, 1);
  });

  test("Back acknowledges an import-success dialog before offering to exit", () => {
    instance.page = "home";
    instance.importSuccessNotice = true;
    const exitsBefore = exitCount;
    back();
    assert.strictEqual(instance.importSuccessNotice, false);
    assert.strictEqual(instance.showExitHint, false);
    assert.strictEqual(exitCount, exitsBefore);
  });

  test("home information closes before the exit gesture begins", () => {
    let closed = 0;
    instance.$refs.homeMenu = {
      showAppInfo: true,
      closeAppInfo() { this.showAppInfo = false; closed += 1; }
    };
    back();
    assert.strictEqual(closed, 1);
    assert.strictEqual(instance.showExitHint, false);
    assert.strictEqual(exitCount, 1);
    delete instance.$refs.homeMenu;
  });

  test("Back follows each visible menu's parent page", () => {
    const routes = [
      ["single-notes-menu", "home"],
      ["adaptive-menu", "home"],
      ["note-flow-hub", "home"],
      ["note-flow-menu", "note-flow-hub"],
      ["note-flow-chords-menu", "note-flow-hub"],
      ["workshop", "home"]
    ];
    routes.forEach(([from, to]) => {
      instance.page = from;
      back();
      assert.strictEqual(instance.page, to);
    });
  });

  test("Single Notes Back closes a setting section before leaving either mode", () => {
    [
      ["single-notes-menu", "singleNotesMenu", "home"],
      ["adaptive-menu", "adaptiveMenu", "home"]
    ].forEach(([page, ref, parent]) => {
      let sectionOpen = true;
      instance.$refs[ref] = {
        handleBack() {
          if (!sectionOpen) return false;
          sectionOpen = false;
          return true;
        }
      };
      instance.page = page;
      back();
      assert.strictEqual(sectionOpen, false);
      assert.strictEqual(instance.page, page);
      back();
      assert.strictEqual(instance.page, parent);
      delete instance.$refs[ref];
    });
  });

  test("Note Flow header and Android Back close details before returning to the hub", () => {
    [
      ["note-flow-menu", "noteFlowMenu", "NoteFlowMenu.vue", "activeView"],
      ["note-flow-chords-menu", "noteFlowChordMenu", "NoteFlowChordMenu.vue", "tab"]
    ].forEach(([page, ref, filename, viewKey]) => {
      const menu = loadComponent(filename);
      let saved = 0;
      let stopped = 0;
      const state = {
        [viewKey]: "settings", activeSettingSection: "rhythm",
        savePreferences() { saved += 1; },
        stopAudition() { stopped += 1; },
        $nextTick(callback) { callback(); },
        $emit(event) { assert.strictEqual(event, "back"); instance.showNoteFlowHub(); }
      };
      ["handleBack", "goBack", "closeSettingSection"].forEach(name => {
        state[name] = menu.methods[name].bind(state);
      });
      instance.$refs[ref] = state;
      instance.page = page;
      back();
      assert.strictEqual(state.activeSettingSection, null);
      assert.strictEqual(instance.page, page);
      state.activeSettingSection = "rhythm";
      state.goBack();
      assert.strictEqual(state.activeSettingSection, null);
      assert.strictEqual(instance.page, page);
      back();
      assert.strictEqual(instance.page, "note-flow-hub");
      instance.page = page;
      state.goBack();
      assert.strictEqual(instance.page, "note-flow-hub");
      assert.strictEqual(saved, 4);
      if (ref === "noteFlowChordMenu") assert.strictEqual(stopped, 2);
      delete instance.$refs[ref];
    });
  });

  test("Workshop Back closes history, stops playback and protects unsaved editor changes", () => {
    const workshop = loadComponent("Workshop.vue");
    const state = { historyOpen: true, playing: true, confirmExit: false, draft: {}, dirty: true,
      revisionDeleteIds: [], $refs: {}, $nextTick(callback) { callback(); },
      libraryAudio:{busy:false,playing:false},
      stopLibraryPlayback() { this.libraryAudio={busy:false,playing:false}; },
      commitTitleEdit() {}, commitTempoEdit() {},
      stopPlayback() { this.playing = false; }, closeEditor() { this.draft = null; } };
    ["requestExit", "cancelExit"].forEach(name => { state[name] = workshop.methods[name].bind(state); });
    state.handleBack = workshop.methods.handleBack.bind(state);
    instance.$refs.workshop = state;
    instance.page = "workshop";
    back(); assert.strictEqual(state.historyOpen, false); assert.strictEqual(state.playing, true); assert.strictEqual(state.confirmExit, false);
    back(); assert.strictEqual(state.playing, false); assert.strictEqual(state.confirmExit, false);
    back(); assert.strictEqual(state.confirmExit, true); assert(state.draft);
    back(); assert.strictEqual(state.confirmExit, false); assert(state.draft);
    state.dirty = false;
    back(); assert.strictEqual(state.draft, null); assert.strictEqual(instance.page, "workshop");
    state.libraryAudio={busy:true,playing:false};back();assert.strictEqual(state.libraryAudio.busy,false);assert.strictEqual(instance.page,"workshop");
    state.libraryAudio={busy:false,playing:true};back();assert.strictEqual(state.libraryAudio.playing,false);assert.strictEqual(instance.page,"workshop");
    back(); assert.strictEqual(instance.page, "home");
    delete instance.$refs.workshop;
  });

  test("Back uses training and settings exit methods instead of discarding state", () => {
    const calls = [];
    instance.$refs.appSettings = { handleBack() { calls.push("settings"); } };
    instance.$refs.noteFlowPreview = { exitTraining() { calls.push("melody"); } };
    instance.$refs.chordTraining = { exitTraining() { calls.push("chord"); } };
    instance.$refs.game = { handleRoundExit() { calls.push("single-notes"); } };
    [
      ["app-settings", "settings"],
      ["note-flow-preview", "melody"],
      ["note-flow-chords-training", "chord"],
      ["game", "single-notes"]
    ].forEach(([page, expected]) => {
      instance.page = page;
      back();
      assert.strictEqual(calls[calls.length - 1], expected);
      assert.strictEqual(instance.page, page);
    });
  });

  test("settings Back closes confirmations before leaving the page", () => {
    const settings = loadComponent("AppSettingsMenu.vue");
    const state = {
      resetStep: "final", resetInProgress: false, $refs: {},
      cancelLearningDataReset() { this.resetStep = "idle"; },
      goBack() { this.left = true; }
    };
    settings.methods.handleBack.call(state);
    assert.strictEqual(state.resetStep, "idle");
    assert.strictEqual(state.left, undefined);
    state.$refs.saveDataManager = { handleBack() { return true; } };
    settings.methods.handleBack.call(state);
    assert.strictEqual(state.left, undefined);
    state.$refs.saveDataManager = { handleBack() { return false; } };
    settings.methods.handleBack.call(state);
    assert.strictEqual(state.left, true);
  });

  test("settings header Back stays put while backup import or reload is pending", () => {
    const settings = loadComponent("AppSettingsMenu.vue");
    let exits = 0;
    const state = {
      $refs: { saveDataManager: { isBusy: true, reloadTimer: null } },
      saveOptions() {},
      $emit() { exits += 1; }
    };
    settings.methods.goBack.call(state);
    assert.strictEqual(exits, 0);
    state.$refs.saveDataManager.isBusy = false;
    state.$refs.saveDataManager.reloadTimer = 1;
    settings.methods.goBack.call(state);
    assert.strictEqual(exits, 0);
    state.$refs.saveDataManager.reloadTimer = null;
    settings.methods.goBack.call(state);
    assert.strictEqual(exits, 1);
    state.resetInProgress = true;
    settings.methods.goBack.call(state);
    assert.strictEqual(exits, 1);
    state.resetInProgress = false;
    state.resetStep = "success";
    settings.methods.goBack.call(state);
    assert.strictEqual(exits, 1);
  });

  test("settings Back closes the learning-data section before leaving or touching another panel", () => {
    const settings = loadComponent("AppSettingsMenu.vue");
    let exits = 0, backupBacks = 0;
    const state = {
      resetStep: "idle", resetInProgress: false, storageBusy: false,
      $refs: {
        deleteDetails: { open: true },
        saveDataManager: { handleBack() { backupBacks += 1; return false; } }
      },
      goBack() { exits += 1; }
    };
    settings.methods.handleBack.call(state);
    assert.strictEqual(state.$refs.deleteDetails.open, false);
    assert.strictEqual(exits, 0);
    assert.strictEqual(backupBacks, 0);
    state.$refs.deleteDetails.open = true;
    state.resetInProgress = true;
    settings.methods.handleBack.call(state);
    assert.strictEqual(state.$refs.deleteDetails.open, true);
    assert.strictEqual(exits, 0);
  });

  test("closing the learning-data section cancels pending confirmations without deleting data", () => {
    const settings = loadComponent("AppSettingsMenu.vue");
    const state = {
      resetStep: "final", resetError: "", resetInProgress: false,
      cancelLearningDataReset: settings.methods.cancelLearningDataReset
    };
    settings.methods.handleDeleteDisclosure.call(state, { target: { open: false } });
    assert.strictEqual(state.resetStep, "idle");
    state.resetStep = "final";
    state.resetInProgress = true;
    settings.methods.handleDeleteDisclosure.call(state, { target: { open: false } });
    assert.strictEqual(state.resetStep, "final");
    state.resetInProgress = false;
    state.resetStep = "success";
    settings.methods.handleDeleteDisclosure.call(state, { target: { open: false } });
    assert.strictEqual(state.resetStep, "success");
  });

  test("backup activity locks settings until the import and reload finish", () => {
    const manager = loadComponent("SaveDataManager.vue");
    const states = [];
    const state = {
      isBusy: true, reloadTimer: null,
      $emit(name, busy) {
        assert.strictEqual(name, "busy-change");
        states.push(busy);
      }
    };
    manager.watch.isBusy.call(state);
    state.isBusy = false;
    state.reloadTimer = 1;
    manager.watch.reloadTimer.call(state);
    state.reloadTimer = null;
    manager.watch.reloadTimer.call(state);
    assert.deepStrictEqual(states, [true, true, false]);
  });

  test("backup Back reverses replace confirmation, preview, then drawer", () => {
    const manager = loadComponent("SaveDataManager.vue");
    const state = {
      isBusy: false,
      showReplaceConfirmation: true,
      stagedPreview: {},
      $refs: { details: { open: true } },
      cancelImport() { this.stagedPreview = null; }
    };
    assert.strictEqual(manager.methods.handleBack.call(state), true);
    assert.strictEqual(state.showReplaceConfirmation, false);
    assert(state.stagedPreview);
    assert.strictEqual(manager.methods.handleBack.call(state), true);
    assert.strictEqual(state.stagedPreview, null);
    assert.strictEqual(manager.methods.handleBack.call(state), true);
    assert.strictEqual(state.$refs.details.open, false);
    assert.strictEqual(manager.methods.handleBack.call(state), false);
  });

  app.beforeDestroy.call(instance);
  assert.strictEqual(listeners.backbutton, undefined);
} finally {
  global.window = originalWindow;
  global.document = originalDocument;
  global.regeneratorRuntime = originalRegeneratorRuntime;
  Date.now = originalNow;
}

process.stdout.write("Android Back navigation tests passed.\n");
