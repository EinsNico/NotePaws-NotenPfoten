const assert = require("assert");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

test("opens the new home menu before the existing training menus", () => {
  const app = read("src/App.vue");
  assert(app.includes("page: 'home'"));
  assert(app.includes("<HomeMenu"));
  assert(app.includes('@openSingleNotes="openSingleNotes"'));
  assert(app.includes('@openNoteFlow="openNoteFlow"'));
  assert(app.includes('@openAppSettings="openAppSettings"'));
  assert(app.includes("page === 'single-notes-menu'"));
  assert(app.includes("page === 'note-flow-menu'"));
  assert(app.includes("page === 'note-flow-hub'"));
  assert(app.includes('@openMelody="showNoteFlowMenu"'));
  assert(app.includes('@back="showNoteFlowHub"'));
  assert(app.includes("page === 'note-flow-preview'"));
  assert(app.includes('@startPreview="startNoteFlowPreview"'));
  assert(app.includes(':initialPreview="noteFlowPreview"'));
  assert(app.includes("page === 'app-settings'"));
  assert(app.includes("this.$nextTick(() => window.scrollTo(0, 0))"));
});

test("opens the Note Flow and Rhythm Sense prototypes from home", () => {
  const home = read("src/components/HomeMenu.vue");
  assert(home.includes("HOME_SINGLE_NOTES"));
  assert(home.includes("HOME_NOTE_FLOW"));
  assert(home.includes("HOME_RHYTHM_SENSE"));
  assert(home.includes("HOME_APP_SETTINGS"));
  assert(home.includes("HOME_APP_INFO"));
  assert(home.includes('class="home-mode-card home-mode-card-flow"'));
  assert(home.includes('class="home-mode-card home-mode-card-rhythm"'));
  assert(home.includes("$emit('openNoteFlow')"));
  assert(home.includes("$emit('openRhythmSense')"));
  const app = read("src/App.vue");
  assert(app.includes('page === \'rhythm-sense\''));
  assert(app.includes('this.page = \'rhythm-sense\''));
  assert(home.includes("grid-template-columns: 1fr 1fr"));
  assert(home.includes('class="home-mode-card home-mode-card-workshop"'));
  assert(home.includes("$emit('openWorkshop')"));
  assert(app.includes("page === 'workshop'"));
  assert(app.includes("this.page = 'workshop'"));
  assert(home.includes('src="static/icon-512.png"'));
  assert(home.includes('src="static/info-sprechblase-transparent.png"'));
  assert(home.includes("<BrandWordmark />"));
  assert(home.includes("<HomeMusicBackdrop />"));
  assert(home.includes('class="home-midi-status"'));
  assert(home.includes("midiStatus === 'connected'"));
  assert(home.includes("home-midi-status.is-connected .home-midi-light"));
  assert(home.includes("this.checkMidiConnection();"));
  assert(home.includes('WebMidi.addListener("connected", this.refreshMidiStatus)'));
  assert(home.includes('WebMidi.addListener("disconnected", this.refreshMidiStatus)'));
  assert(home.includes('window.addEventListener("focus", this.checkMidiConnection)'));
  assert(home.includes('document.addEventListener("resume", this.checkMidiConnection)'));
  assert(home.includes('document.removeEventListener("resume", this.checkMidiConnection)'));
});

test("shows prestige paws only for archived levels", () => {
  const home = read("src/components/HomeMenu.vue");
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");
  assert(home.includes('v-if="prestigeLevel > 0"'));
  assert(home.includes('v-for="index in prestigePaws"'));
  assert(home.includes('return this.prestigeLevel < 5 ? this.prestigeLevel : 1;'));
  assert(home.includes('v-if="prestigeLevel >= 5"'));
  assert(home.includes('summarizePrestigeArchive(archive).prestige'));
  assert(german.includes('HOME_PRESTIGE_BADGE: "Prestige-Stufe {level}"'));
  assert(english.includes('HOME_PRESTIGE_BADGE: "Prestige level {level}"'));
});

test("opens melody and chord menus without the MIDI-file placeholder", () => {
  const app = read("src/App.vue");
  const hub = read("src/components/NoteFlowHub.vue");
  assert(app.includes("import NoteFlowHub from './components/NoteFlowHub'"));
  assert(app.includes("this.page = 'note-flow-hub'"));
  assert(hub.includes("$emit('openMelody')"));
  assert(hub.includes("FLOW_HUB_MELODY"));
  assert(hub.includes("FLOW_HUB_CHORDS"));
  assert(!hub.includes("FLOW_HUB_MIDI_FILE"));
  assert.strictEqual((hub.split("</template>")[0].match(/ disabled>/g) || []).length, 0);
  assert(hub.includes("$emit('openChords')"));
  assert(app.includes("page === 'note-flow-chords-menu'"));
  assert(app.includes('@openChords="showNoteFlowChordMenu"'));
  const chords = read("src/components/NoteFlowChordMenu.vue");
  assert(chords.includes("<NoteFlowCircleSelector"));
  assert(chords.includes('@click="startTraining"'));
  assert(app.includes("page === 'note-flow-chords-training'"));
  assert(chords.includes("createNoteFlowChordPlan(this.localOptions, this.previewIndex)"));
  assert(chords.includes("FLOW_ALGORITHM_NEW_EXAMPLE"));
  assert(chords.includes("this.previewIndex += 1"));
  assert(chords.includes(':bass-note="localOptions.bassNote"'));
  assert(chords.includes("createNoteFlowChordAudition(this.previewPlan"));
  const auditionVoices = chords.match(/createPianoSamplePlayer\(\{ maxVoices: (\d+) \}\)/);
  assert(auditionVoices && Number(auditionVoices[1]) >= 8, "audition must play every tone of an eight-note chord");
  assert(chords.includes("this.stopAudition();"));
  assert(chords.includes('v-for="section in settingSections"'));
  assert(chords.includes('this.activeSettingSection = section;'));
  assert(chords.includes('v-if="activeSettingSection === \'hands\'"'));
  assert(chords.includes('v-if="activeSettingSection === \'tonality\'"'));
  assert(chords.includes('v-if="activeSettingSection === \'behavior\'"'));
  assert(chords.includes('v-if="activeSettingSection === \'algorithm\'"'));
  assert(chords.includes('v-if="activeSettingSection === \'tempo\'"'));
  assert(chords.includes('NoteFlowRoundStorage.readStatistics("midi", "chord")'));
  assert(chords.includes('statisticsSnapshot.evaluatedNoteCount'));
  assert(chords.includes('FLOW_CHORD_STAT_TOTAL_CHORDS'));
  assert(chords.includes('update("bpm", Number(event.target.value))'));
  const chordTraining = read("src/components/NoteFlowChordTraining.vue");
  assert(chordTraining.includes('bpm: this.plan.options.bpm'));
  assert(chordTraining.includes('createNoteFlowRoundTimer(this.plan.options.gameLength)'));
  assert(chordTraining.includes('this.endRound("time-limit")'));
  assert(!hub.includes("$emit('openMidiFile')"));
});

test("keeps the original Note Flow logo in the overview and labels the melody menu", () => {
  const hub = read("src/components/NoteFlowHub.vue");
  const melody = read("src/components/NoteFlowMenu.vue");
  const chords = read("src/components/NoteFlowChordMenu.vue");
  const originalLogo = [
    'd="M7 49c13-27 31 18 58-16"',
    'cx="17" cy="42" r="6"',
    'cx="38" cy="47" r="6"',
    'cx="59" cy="30" r="6"',
    'd="M23 42V25M44 47V30M65 30V13"'
  ];
  originalLogo.forEach(part => assert(hub.includes(part)));
  assert(melody.includes('<NoteFlowModeHeader'));
  assert(chords.includes('<NoteFlowModeHeader'));
  assert(melody.includes("$t('FLOW_MELODY_MODE_TITLE')"));
  assert(read("src/resources/de.js").includes('FLOW_MELODY_MODE_TITLE: "Melodie"'));
  assert(read("src/resources/en.js").includes('FLOW_MELODY_MODE_TITLE: "Melody"'));
});

test("provides the configured playable Note Flow 3.0 training preview", () => {
  const flow = read("src/components/NoteFlowMenu.vue");
  const preview = read("src/components/NoteFlowGamePreview.vue");
  const staff = read("src/components/NoteFlowRhythmPreview.vue");
  assert(!flow.includes('activeMode'));
  assert(flow.includes('activeView: "settings"'));
  assert(flow.includes('const previous = Options.noteFlowMelodySettings || this.initialPreview || {}'));
  assert(flow.includes('lastSingleHandClef: this.lastSingleHandClef.slice()'));
  assert(!flow.includes("FLOW_FREE_TRAINING"));
  assert(!flow.includes("FLOW_LEARNING_MODE"));
  assert(!flow.includes("note-flow-mode-switch"));
  assert(flow.includes("FLOW_STATISTICS_PREVIEW"));
  assert(flow.includes('value: "easy"'));
  assert(flow.includes('value: "normal"'));
  assert(flow.includes('value: "hard"'));
  assert(flow.includes('value: "custom"'));
  assert(flow.includes("<CustomKeyboardPreview"));
  assert(flow.includes('value: "continuous"'));
  assert(flow.includes('value: "wait"'));
  assert(flow.includes('id="flow-bpm-range"'));
  assert(flow.includes('id="flow-bpm-number"'));
  assert(read("src/model/NoteFlowPreferences.js").includes('bpm: normalizeNoteFlowBpm(source.bpm) || 50'));
  assert(flow.includes('normalizeNoteFlowBpm(event.target.value)'));
  assert(flow.includes('`${this.previewOptions.bpm} BPM`'));
  const startButton = (flow.match(/<button\b[^>]*>/g) || []).find(tag => tag.includes('class="note-flow-start"'));
  assert(startButton && startButton.includes('@click="startPreview"'));
  assert(startButton.includes(':disabled="!inputAvailability.inputAvailable"'));
  assert(flow.includes('this.$emit("startPreview"'));
  assert(preview.includes("generateNoteFlowCycle"));
  assert(preview.includes("<NoteFlowRhythmPreview"));
  assert(/\.flow-game-preview\s*\{[^}]*overscroll-behavior: none/.test(read("src/styles/training-session.css")));
  assert(preview.includes('src="../styles/training-session.css"'));
  assert(/\.flow-stage-card\s*\{[^}]*overscroll-behavior: none/.test(read("src/styles/training-session.css")));
  assert(preview.includes(':bpm="preview.menuOptions.bpm"'));
  assert(staff.includes("createNoteFlowRhythmTimeline"));
  assert(preview.includes(':behavior="preview.menuOptions.behavior"'));
  assert(preview.includes(':input-mode="preview.menuOptions.inputMode"'));
  assert(staff.includes("createNoteFlowRhythmStaffLayout"));
  assert(staff.includes("submitNoteFlowRhythmPracticeInput"));
  assert(staff.includes("targetResult(event) === 'correct'"));
  assert(staff.includes("targetResult(event) === 'early'"));
  assert(staff.includes("rebaseNoteFlowRhythmPractice"));
  assert(staff.includes("<MidiInput"));
  assert(staff.includes('show-octave'));
  assert(staff.includes("createPianoSamplePlayer"));
  assert(staff.includes("Options.appVolume"));
  assert(!preview.includes(':sound-enabled="preview.menuOptions.sound"'), 'global output replaces the old melody sound preference');
  assert(preview.includes('class="flow-training-controls"'));
  assert(preview.includes('class="flow-training-play"'));
  assert(preview.includes('class="flow-training-pause"'));
  assert(preview.includes('@click="playTraining"'));
  assert(preview.includes('@click="pauseTraining"'));
  assert(preview.includes('class="flow-pause-overlay"'));
  assert(preview.includes('class="flow-live-score"'));
  assert(preview.includes('class="flow-result-overlay"'));
  assert(preview.includes("createNoteFlowRoundResult"));
  assert(preview.includes('completionReason: reason'));
  assert(preview.includes('class="flow-result-timing"'));
  assert(preview.includes("restartRound"));
  assert(preview.includes("playTraining"));
  assert(preview.includes("pauseTraining"));
  assert(preview.includes('@round-progress="updateRoundProgress"'));
  assert(preview.includes("training"));
  assert(staff.includes('v-if="!training" type="button" class="rhythm-preview-play"'));
  assert(staff.includes("<ButtonInput"));
  assert(staff.includes("<KeyboardInput"));
  assert(staff.includes("rhythm-play-line"));
  assert(!flow.includes("startGame"));
  assert(flow.includes("Options.noteFlowMelodyMovement = this.previewOptions.movement"));
  assert(!/\bOptions\.difficulty\s*=/.test(flow));
});

test("groups Melody settings by notes, hands, tempo and input", () => {
  const flow = read("src/components/NoteFlowMenu.vue");
  const template = flow.split("</template>")[0];
  const notes = template.split("activeSettingSection === 'notes'")[1]
    .split("activeSettingSection === 'hands'")[0];
  const hands = template.split("activeSettingSection === 'hands'")[1]
    .split("activeSettingSection === 'tempo'")[0];
  const tempo = template.split("activeSettingSection === 'tempo'")[1]
    .split("activeSettingSection === 'input'")[0];
  const input = template.split("activeSettingSection === 'input'")[1]
    .split("</section>")[0];
  assert(template.includes('v-for="section in settingSections"'));
  assert(notes.includes("<CustomKeyboardPreview"));
  assert(notes.includes("<NoteFlowCircleSelector"));
  assert(hands.includes("FLOW_HAND_MODE"));
  assert(hands.includes("FLOW_SECOND_NOTES_PER_BLOCK"));
  assert(tempo.includes("ROUND_LENGTH"));
  assert(tempo.includes('id="flow-bpm-range"'));
  assert(input.includes("FLOW_INPUT_BEHAVIOR"));
  assert(input.includes("NOTE_INPUT"));
  assert(template.includes("activeView === 'statistics'"));
});

test("keeps the decorative music background lightweight and motion-aware", () => {
  const backdrop = read("src/components/HomeMusicBackdrop.vue");
  const home = read("src/components/HomeMenu.vue");
  assert(backdrop.includes('viewBox="0 0 760 1080"'));
  assert.strictEqual((backdrop.match(/class="music-staff music-staff-upper"[\s\S]*?<\/g>/) || [""])[0].match(/<path/g).length, 5);
  assert.strictEqual((backdrop.match(/class="music-staff music-staff-lower"[\s\S]*?<\/g>/) || [""])[0].match(/<path/g).length, 5);
  assert(backdrop.includes("music-treble-clef"));
  assert(backdrop.includes("music-bass-clef"));
  assert(backdrop.includes("music-note-layer-upper"));
  assert(backdrop.includes("music-note-layer-lower"));
  assert(backdrop.includes("home-ornament-drift 44s"));
  assert(backdrop.includes("home-ornament-drift 52s"));
  assert(backdrop.includes("transform: translate3d(-7px, 0, 0)"));
  assert(!backdrop.includes("home-clef-drift"));
  assert(backdrop.includes("infinite alternate"));
  assert.strictEqual((backdrop.match(/class="music-scroll-layer"/g) || []).length, 1);
  assert(backdrop.includes('window.addEventListener("scroll"'));
  assert(backdrop.includes('document.addEventListener("scroll"'));
  assert(backdrop.includes('document.removeEventListener("scroll"'));
  assert(backdrop.includes('target.scrollTop'));
  assert(backdrop.includes("window.requestAnimationFrame"));
  assert(backdrop.includes("getMusicParallaxOffsets"));
  assert(backdrop.includes("music-scroll-layer"));
  assert(!backdrop.includes("scrollOffset"));
  assert(backdrop.includes("prefers-reduced-motion: reduce"));
  assert(backdrop.includes("animation: none !important"));
  assert(backdrop.includes("pointer-events: none"));
  assert(home.includes("overflow-x: hidden"));
  assert(home.includes('class="home-backdrop-clip"'));
  assert(home.includes(".home-backdrop-clip"));
  assert(home.includes("position: fixed"));
  assert(home.includes("overflow: hidden"));
});

test("keeps language, note naming and backup access in the app settings destination", () => {
  const settings = read("src/components/AppSettingsMenu.vue");
  const game = read("src/components/Game.vue");
  const saveDataManager = read("src/components/SaveDataManager.vue");
  const languageSelect = read("src/components/SelectOptionDropdown.vue");
  assert(settings.includes("SelectOptionDropdown"));
  assert(settings.includes("ENABLED_LANGUAGES"));
  assert(settings.includes("SaveDataManager"));
  assert(settings.includes('@before-storage-action="saveOptions"'));
  assert(settings.includes('<HomeMusicBackdrop class="app-settings-backdrop" />'));
  assert(settings.includes('class="app-settings-backdrop-clip"'));
  assert(settings.includes("overflow-x: clip;"));
  assert(settings.includes('appearance="app-settings"'));
  assert(settings.includes("app-settings-card-language"));
  assert(settings.includes("app-settings-card-note-naming"));
  assert(settings.includes("app-settings-card-audio"));
  assert(settings.includes("app-settings-card-backup"));
  assert(settings.includes('v-model="options.noteNaming"'));
  assert(settings.includes("NOTE_NAMING_GERMAN"));
  assert(settings.includes("NOTE_NAMING_INTERNATIONAL"));
  assert(settings.includes('v-model.number="options.appVolume"'));
  assert(settings.includes('type="range"'));
  assert(settings.includes('min="0"'));
  assert(settings.includes('max="100"'));
  assert(game.includes("this.pianoPlayer.play(value, Options.appVolume)"));
  assert(game.includes("createPianoSamplePlayer({ maxVoices: 1, feedback: true })"));
  assert(!game.includes("new Audio("));
  assert(saveDataManager.includes("save-data-manager--app-settings"));
  assert(saveDataManager.includes('@click="exportBackup"'));
  assert(saveDataManager.includes('@click="chooseBackupFile"'));
  assert(saveDataManager.includes('@click="applyStagedMerge"'));
  assert(saveDataManager.includes('@click="applyStagedReplace"'));
  assert(languageSelect.includes("select-option-dropdown--app-settings"));
  assert(languageSelect.includes(':aria-label="label"'));
  assert(languageSelect.includes(':disabled="disabled"'));
});

test("protects the global learning-data reset with two confirmation stages", () => {
  const settings = read("src/components/AppSettingsMenu.vue");
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");

  assert(settings.includes("deleteAllLearningDataEverywhere"));
  assert(settings.includes("await deleteAllLearningDataEverywhere(localStorage)"));
  assert(settings.includes(':disabled="resetInProgress || storageBusy"'));
  assert(settings.includes('@busy-change="backupBusy = $event"'));
  assert(settings.includes('storageBusy() { return this.backupBusy || this.prestigeBusy; }'));
  assert(settings.includes(':disabled="storageBusy"'));
  assert(settings.includes("app-settings-card-danger"));
  assert(settings.includes("resetStep === 'warning'"));
  assert(settings.includes("resetStep === 'final'"));
  assert(settings.includes("APP_SETTINGS_DELETE_BACKUP_HINT"));
  assert(settings.includes("APP_SETTINGS_DELETE_CONFIRM"));
  assert(settings.includes("error.rollbackSucceeded === false"));
  assert(settings.includes("window.location.reload()"));
  assert(german.includes('APP_SETTINGS_DELETE_DATA: "ALLE LERNSTÄNDE LÖSCHEN"'));
  assert(english.includes('APP_SETTINGS_DELETE_DATA: "DELETE ALL LEARNING DATA"'));
});

test("uses one responsive Single Notes shell for settings and statistics", () => {
  const app = read("src/App.vue");
  const menu = read("src/components/Menu.vue");
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  const navigation = read("src/components/SingleNotesNavigation.vue");
  const roundStatistics = read("src/components/RoundStatisticsPanel.vue");

  assert(menu.includes("<SingleNotesNavigation"));
  assert(adaptiveMenu.includes("<SingleNotesNavigation"));
  assert(menu.includes('default: "settings"'));
  assert(adaptiveMenu.includes('default: "settings"'));
  assert(menu.includes('v-show="activeView === \'settings\'"'));
  assert(menu.includes('v-if="activeView === \'statistics\'"'));
  assert(!menu.includes('v-show="activeView === \'statistics\'"'));
  assert(adaptiveMenu.includes('v-show="activeView === \'settings\'"'));
  assert(adaptiveMenu.includes('v-if="activeView === \'statistics\'"'));
  assert(!adaptiveMenu.includes('v-show="activeView === \'statistics\'"'));
  assert(roundStatistics.includes('<header class="statistics-summary">'));
  assert(!roundStatistics.includes("<details"));
  assert(!roundStatistics.includes("openPanel()"));
  assert(!adaptiveMenu.includes("adaptiveProgressOpen"));
  assert(app.includes('@home="showHome"'));
  assert(navigation.includes("SINGLE_NOTES_FREE_TRAINING"));
  assert(navigation.includes("SINGLE_NOTES_LEARNING_MODE"));
  assert(navigation.includes("SINGLE_NOTES_SETTINGS"));
  assert(navigation.includes("SINGLE_NOTES_STATISTICS"));
  assert(navigation.includes('role="tablist"'));
  assert(navigation.includes(":aria-selected"));
});

test("uses the redesigned free-training settings without duplicating app settings", () => {
  const menu = read("src/components/Menu.vue");
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  const selectOption = read("src/components/SelectOption.vue");
  const selectOptionMulti = read("src/components/SelectOptionMulti.vue");

  assert(menu.includes("SINGLE_NOTES_SELECTION"));
  assert.strictEqual(
    (menu.match(/SINGLE_NOTES_START_TRAINING/g) || []).length,
    2
  );
  assert(menu.includes("currentSettingsSummary"));
  assert(menu.includes("settings-section-practice"));
  assert(menu.includes("settings-section-range"));
  assert(menu.includes("settings-section-input"));
  assert(menu.includes('appearance="single-notes"'));
  assert(menu.includes("showFloatingStart"));
  assert(menu.includes("topStart.getBoundingClientRect().bottom <= 0"));
  assert(!menu.includes("SelectOptionDropdown"));
  assert(!menu.includes("SaveDataManager"));
  assert(!menu.includes("AppInfoDialog"));
  assert(selectOption.includes("select-option--single-notes"));
  assert(selectOptionMulti.includes("select-option-multi--single-notes"));
});

test("uses the redesigned Learning Mode start and settings cards", () => {
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");

  assert(adaptiveMenu.includes('class="adaptive-start-summary"'));
  assert(adaptiveMenu.includes("currentSettingsSummary"));
  assert.strictEqual(
    (adaptiveMenu.match(/START_ADAPTIVE_TRAINING/g) || []).length,
    2
  );
  assert(adaptiveMenu.includes("adaptive-settings-practice"));
  assert(adaptiveMenu.includes("adaptive-settings-range"));
  assert(adaptiveMenu.includes("adaptive-settings-input"));
  assert(adaptiveMenu.includes('appearance="single-notes"'));
  assert(adaptiveMenu.includes("showFloatingStart"));
  assert(adaptiveMenu.includes("topStart.getBoundingClientRect().bottom <= 0"));
  assert(adaptiveMenu.includes('<section class="adaptive-progress learning-statistics"'));
  assert(!adaptiveMenu.includes('<details'));
  assert(german.includes("ADAPTIVE_RANGE_DESCRIPTION:"));
  assert(english.includes("ADAPTIVE_RANGE_DESCRIPTION:"));
});

test("keeps all manual custom-range controls in the modern keyboard design", () => {
  const noteRanges = read("src/model/NoteRanges.js");
  const menu = read("src/components/Menu.vue");
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  const keyboardPreview = read("src/components/CustomKeyboardPreview.vue");
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");

  [menu, adaptiveMenu].forEach(source => {
    assert(source.includes('v-model.number="options.customMinValue"'));
    assert(source.includes('v-model.number="options.customMaxValue"'));
    assert(source.includes('v-model.number="options.customBassMaxValue"'));
    assert(source.includes('v-model.number="options.customTrebleMinValue"'));
    assert(source.includes("linear-gradient(145deg, rgba(232, 244, 244, 0.82)"));
    assert(source.includes(".range-selectors select:focus-visible"));
    assert(source.includes('v-model.number="displayedCustomMinValue"'));
    assert(source.includes('v-model.number="displayedCustomMaxValue"'));
    assert(source.includes('@update:min-value="displayedCustomMinValue = $event"'));
    assert(source.includes('@update:max-value="displayedCustomMaxValue = $event"'));
    assert(source.includes('@update:treble-min-value="options.customTrebleMinValue = $event"'));
    assert(source.includes('@update:bass-max-value="options.customBassMaxValue = $event"'));
    assert(source.includes('class="range-selectors clef-range-grid"'));
    ["BASS_HIGHEST_NOTE", "TREBLE_HIGHEST_NOTE", "BASS_LOWEST_NOTE", "TREBLE_LOWEST_NOTE"].forEach(key => {
      assert(source.includes(`$t('${key}')`));
    });
    assert(source.indexOf("$t('BASS_HIGHEST_NOTE')") < source.indexOf("$t('TREBLE_HIGHEST_NOTE')"));
    assert(source.indexOf("$t('TREBLE_HIGHEST_NOTE')") < source.indexOf("$t('BASS_LOWEST_NOTE')"));
    assert(source.indexOf("$t('BASS_LOWEST_NOTE')") < source.indexOf("$t('TREBLE_LOWEST_NOTE')"));
  });
  assert(keyboardPreview.includes("linear-gradient(180deg, #fffefb 0%, #f4efe5 100%)"));
  assert(keyboardPreview.includes("linear-gradient(180deg, #315159 0%, #1d353a 100%)"));
  assert(keyboardPreview.includes(".clef-legend"));
  assert.strictEqual((keyboardPreview.match(/role="slider"/g) || []).length, 4);
  assert(keyboardPreview.includes('@pointerdown="startDrag(\'min\', $event)"'));
  assert(keyboardPreview.includes('@pointerdown="startDrag(\'max\', $event)"'));
  assert(keyboardPreview.includes('@pointerdown="startDrag(\'treble\', $event)"'));
  assert(keyboardPreview.includes('@pointerdown="startDrag(\'bass\', $event)"'));
  assert.strictEqual((keyboardPreview.match(/'most-recent': lastInteractedHandle ===/g) || []).length, 4);
  assert.strictEqual((keyboardPreview.match(/@focus="bringHandleToFront\('/g) || []).length, 4);
  assert(keyboardPreview.includes("this.bringHandleToFront(handle);"));
  assert(keyboardPreview.includes(".range-handle.most-recent"));
  assert(keyboardPreview.includes("trebleHandleMaximum"));
  assert(keyboardPreview.includes("bassHandleMinimum"));
  assert(keyboardPreview.includes("trebleMaxHandleMinimum"));
  assert(keyboardPreview.includes("lower: MIN_CUSTOM_VALUE"));
  assert(keyboardPreview.includes("upper: MAX_CUSTOM_VALUE"));
  assert(keyboardPreview.includes("bassMinHandleMaximum"));
  assert(keyboardPreview.includes("return this.maxValue;"));
  assert(keyboardPreview.includes("return this.minValue;"));
  assert(keyboardPreview.includes("hasClefOverlap"));
  assert(keyboardPreview.includes("CUSTOM_RANGE_UNUSED"));
  assert(keyboardPreview.includes(".range-handle-treble"));
  assert(keyboardPreview.includes(".range-handle-bass"));
  assert(keyboardPreview.includes("getNaturalNoteValues"));
  assert(noteRanges.includes("export const MAX_CUSTOM_VALUE = 95;"));
  assert(keyboardPreview.includes("const KEYBOARD_MAX_VALUE = MAX_CUSTOM_VALUE"));
  assert(keyboardPreview.includes("horizontalDistance <= verticalDistance"));
  assert(keyboardPreview.includes("touch-action: pan-y"));
  assert(keyboardPreview.includes("formatOctaveMarker"));
  assert(keyboardPreview.includes("octaveMarker(key.octave)"));
  assert(read("src/components/Game.vue").includes("getPlayableCustomNoteValues"));
  ["BASS_LOWEST_NOTE", "BASS_HIGHEST_NOTE", "TREBLE_LOWEST_NOTE", "TREBLE_HIGHEST_NOTE"].forEach(key => {
    assert(german.includes(`${key}:`));
    assert(english.includes(`${key}:`));
  });
});

test("uses the shared branded status shell in the active training screen", () => {
  const game = read("src/components/Game.vue");
  const scoreLine = read("src/components/ScoreLine.vue");
  const feedbackLine = read("src/components/FeedbackLine.vue");
  const noteDisplay = read("src/components/NoteDisplay.vue");
  const buttonInput = read("src/components/ButtonInput.vue");
  const keyboardInput = read("src/components/KeyboardInput.vue");

  assert(game.includes('<HomeMusicBackdrop class="game-backdrop" />'));
  assert(game.includes("'is-adaptive-game': isAdaptiveMode"));
  assert(game.includes('class="game-status-card"'));
  assert(game.includes("gameModeLabel"));
  assert(game.includes("SINGLE_NOTES_FREE_TRAINING"));
  assert(game.includes("ADAPTIVE_MODE"));
  assert(game.includes("background: rgba(255, 255, 255, 0.8);"));
  assert(scoreLine.includes('class="score-item"'));
  assert(feedbackLine.includes('class="feedback-line"'));
  assert(noteDisplay.includes("background: rgba(255, 255, 255, 0.62);"));
  assert(noteDisplay.includes("backdrop-filter: blur(2px);"));
  assert(buttonInput.includes("isAccidental(value-1)"));
  assert(buttonInput.includes("button.accidental"));
  assert(buttonInput.includes("button.natural"));
  assert(keyboardInput.includes("linear-gradient(180deg, #315f67"));
  assert(keyboardInput.includes("border-radius: 17px;"));
});

test("shows retryable learning-storage failures in menu and training", () => {
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  const game = read("src/components/Game.vue");
  const alert = read("src/components/LearningStorageAlert.vue");
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");

  assert(adaptiveMenu.includes("<LearningStorageAlert />"));
  assert(adaptiveMenu.includes("SingleNotesLearningStorage.status.state"));
  assert(game.includes("<LearningStorageAlert"));
  assert(game.includes('@recovered="handleStorageRecovered"'));
  assert(game.includes("storageBlocked"));
  assert(game.includes("if(!this.gameReady)"));
  assert(game.includes('if(SingleNotesLearningStorage.status.state === "error")'));
  assert(!game.includes("if(this.storageBlocked){"));
  assert(alert.includes('role="alert"'));
  assert(alert.includes("SINGLE_NOTES_STORAGE_ERROR_QUOTA"));
  assert(alert.includes("retryFailedWrites"));
  [
    "LEARNING_STORAGE_QUOTA_TITLE",
    "LEARNING_STORAGE_QUOTA_DESCRIPTION",
    "LEARNING_STORAGE_ERROR_TITLE",
    "LEARNING_STORAGE_ERROR_DESCRIPTION",
    "LEARNING_STORAGE_FAILED_COUNT",
    "LEARNING_STORAGE_RETRY",
    "LEARNING_STORAGE_RETRYING"
  ].forEach(key => {
    assert(german.includes(`${key}:`));
    assert(english.includes(`${key}:`));
  });
});

test("gives each Learning Mode round one queued database session", () => {
  const game = read("src/components/Game.vue");
  const progress = read("src/model/AdaptiveProgress.js");
  assert(game.includes("AdaptiveProgress.createSession"));
  assert(game.includes("{ sessionId: this.adaptiveSessionId }"));
  assert(game.includes("finishAdaptiveLearningSession"));
  assert(game.includes("AdaptiveProgress.finishSession(this.adaptiveSessionId)"));
  assert(progress.includes("SingleNotesLearningStorage.enqueueEvaluation"));
  assert(progress.includes("learningRecord: this.progress.notes[evaluation.noteKey]"));
  assert(progress.includes("SingleNotesLearningStorage.synchronizeProgress"));
  assert(progress.includes("SingleNotesLearningStorage.recoverInterruptedSessions"));
  assert(progress.includes("SingleNotesLearningStorage.readStatisticsSnapshot"));
  assert(progress.includes("statisticsSnapshot"));
  assert(progress.includes("loadFromDatabase(inputMode"));
  assert(progress.includes("SingleNotesLearningStorage.clearScope"));
  assert(progress.includes("persistLegacyAdaptiveState("));
  assert(progress.includes("localStorage.setItem(storageKey"));
});

test("pauses safely when the app moves into the background", () => {
  const game = read("src/components/Game.vue");
  assert(game.includes('document.addEventListener("visibilitychange"'));
  assert(game.includes('document.addEventListener("pause"'));
  assert(game.includes('window.addEventListener("pagehide"'));
  assert(game.includes("this.pauseGame();"));
  assert(game.includes("SingleNotesLearningStorage.flush();"));
  assert(game.includes('document.removeEventListener("visibilitychange"'));
  assert(game.includes('document.removeEventListener("pause"'));
  assert(game.includes('window.removeEventListener("pagehide"'));
});

test("lets the music background show subtly through the Single Notes setting cards", () => {
  const menu = read("src/components/Menu.vue");
  const adaptiveMenu = read("src/components/AdaptiveMenu.vue");
  [
    { source: menu, selector: ".settings-section {" },
    { source: adaptiveMenu, selector: ".adaptive-settings-card {" }
  ].forEach(({ source, selector }) => {
    const ruleStart = source.indexOf(selector);
    const ruleEnd = source.indexOf("}", ruleStart);
    const rule = source.slice(ruleStart, ruleEnd);
    assert(ruleStart >= 0);
    assert(rule.includes("background: rgba(255, 255, 255, 0.78);"));
    assert(rule.includes("-webkit-backdrop-filter: blur(2px);"));
    assert(rule.includes("backdrop-filter: blur(2px);"));
  });
});

test("provides complete German and English home labels", () => {
  const german = read("src/resources/de.js");
  const english = read("src/resources/en.js");
  [
    "HOME_TRAINING_PROMPT",
    "HOME_SINGLE_NOTES",
    "HOME_NOTE_FLOW",
    "HOME_VERSION_3_BADGE",
    "HOME_PREVIEW_AVAILABLE",
    "FLOW_SETTINGS",
    "FLOW_STATISTICS",
    "FLOW_SPEED",
    "FLOW_CONTINUOUS",
    "FLOW_WAIT",
    "FLOW_WAIT_HINT",
    "FLOW_STATISTICS_PREVIEW",
    "HOME_RHYTHM_SENSE",
    "HOME_RHYTHM_SENSE_DESCRIPTION",
    "HOME_VERSION_4_BADGE",
    "SINGLE_NOTES_MODE_NAVIGATION",
    "SINGLE_NOTES_VIEW_NAVIGATION",
    "SINGLE_NOTES_FREE_TRAINING",
    "SINGLE_NOTES_LEARNING_MODE",
    "SINGLE_NOTES_SETTINGS",
    "SINGLE_NOTES_STATISTICS",
    "SINGLE_NOTES_SELECTION",
    "SINGLE_NOTES_START_TRAINING",
    "SINGLE_NOTES_PRACTICE_DESCRIPTION",
    "SINGLE_NOTES_RANGE_DESCRIPTION",
    "SINGLE_NOTES_INPUT_DESCRIPTION",
    "HOME_APP_SETTINGS",
    "HOME_APP_INFO",
    "APP_SETTINGS_BACKUP",
    "APP_SETTINGS_LANGUAGE_DESCRIPTION",
    "APP_SETTINGS_LANGUAGE_SELECT",
    "APP_SETTINGS_NOTE_NAMING_DESCRIPTION",
    "APP_SETTINGS_NOTE_NAMING_SELECT",
    "APP_SETTINGS_NOTE_NAMING_GERMAN",
    "APP_SETTINGS_NOTE_NAMING_INTERNATIONAL",
    "APP_SETTINGS_AUDIO_DESCRIPTION",
    "APP_SETTINGS_VOLUME",
    "APP_SETTINGS_VOLUME_QUIET",
    "APP_SETTINGS_VOLUME_LOUD",
    "APP_SETTINGS_BACKUP_DESCRIPTION"
  ].forEach(key => {
    assert(german.includes(`${key}:`));
    assert(english.includes(`${key}:`));
  });
});

process.stdout.write("Home menu navigation tests passed.\n");
