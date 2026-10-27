<template>
  <div id="app">
    <div class="persistence-notice-layer"><PersistenceNotice /></div>
    <HomeMenu
      ref="homeMenu"
      v-if="page === 'home'"
      @openSingleNotes="openSingleNotes"
      @openDailyTask="openDailyTask"
      @openNoteFlow="openNoteFlow"
      @openRhythmSense="openRhythmSense"
      @openWorkshop="openWorkshop"
      @openAppSettings="openAppSettings"
    />
    <Workshop ref="workshop" v-if="page === 'workshop'" @back="showHome" />
    <NoteFlowMenu
      ref="noteFlowMenu"
      v-if="page === 'note-flow-menu'"
      :initialPreview="noteFlowPreview"
      @startPreview="startNoteFlowPreview"
      @back="showNoteFlowHub"
    />
    <RhythmSense
      ref="rhythmSense"
      v-if="page === 'rhythm-sense'"
      @back="showHome"
    />
    <NoteFlowHub
      v-if="page === 'note-flow-hub'"
      @openMelody="showNoteFlowMenu"
      @openChords="showNoteFlowChordMenu"
      @back="showHome"
    />
    <NoteFlowChordMenu
      ref="noteFlowChordMenu"
      v-if="page === 'note-flow-chords-menu'"
      :options="noteFlowChordOptions"
      @change="noteFlowChordOptions = $event"
      @startTraining="startNoteFlowChordTraining"
      @back="showNoteFlowHub"
    />
    <NoteFlowChordTraining
      ref="chordTraining"
      v-if="page === 'note-flow-chords-training' && noteFlowChordPlan"
      :plan="noteFlowChordPlan"
      @back="showNoteFlowChordMenu"
    />
    <NoteFlowGamePreview
      ref="noteFlowPreview"
      v-if="page === 'note-flow-preview'"
      :preview="noteFlowPreview"
      @back="showNoteFlowMenu"
    />
    <Menu
      ref="singleNotesMenu"
      v-if="page === 'single-notes-menu'"
      @startGame="startGame"
      @openAdaptiveSettings="openAdaptiveSettings"
      @back="showHome"
      :initial-view="singleNotesView"
    />
    <AdaptiveMenu
      ref="adaptiveMenu"
      v-if="page === 'adaptive-menu'"
      :initial-view="adaptiveView"
      @back="showSingleNotesMenu"
      @home="showHome"
      @startAdaptive="startAdaptiveGame"
    />
    <SingleNotesRoundResult
      v-if="page === 'single-notes-result'"
      :last-result="currentGameMode === 'adaptive' ? lastAdaptiveResult : lastResult"
      :mode="currentGameMode"
      :round-context="singleNotesResultContext"
      @play-again="restartSingleNotes"
      @statistics="showSingleNotesStatistics"
      @settings="showSingleNotesSettings"
    />
    <AppSettingsMenu
      ref="appSettings"
      v-if="page === 'app-settings'"
      @back="showHome"
      @openTutorial="showTutorial = true"
    />
    <Game
      ref="game"
      v-if="page === 'game'"
      :mode="currentGameMode"
      @gameEnded="returnFromGame"
    />
    <WelcomeTutorial v-if="showTutorial" @finish="finishTutorial" />
    <div v-if="showExitHint" class="app-exit-hint" role="status">
      {{$t('APP_EXIT_DOUBLE_BACK')}}
    </div>
    <div v-if="page === 'home' && importSuccessNotice && !showTutorial" ref="importSuccessOverlay" class="app-import-success-overlay">
      <div ref="importSuccessDialog" class="app-import-success" role="alertdialog" aria-modal="true" tabindex="-1"
        aria-labelledby="app-import-success-title" aria-describedby="app-import-success-text">
        <h2 id="app-import-success-title">{{$t('SAVE_DATA_IMPORT_RESTART_TITLE')}}</h2>
        <p id="app-import-success-text">{{$t('SAVE_DATA_IMPORT_RESTART_SUCCESS')}}</p>
        <button type="button" @click="importSuccessNotice = false">
          {{$t('SAVE_DATA_IMPORT_DISMISS')}}
        </button>
      </div>
    </div>
    <div v-if="page === 'home' && largeDataNotice && !importSuccessNotice && !showTutorial"
      ref="largeDataOverlay" class="app-import-success-overlay">
      <div ref="largeDataDialog" class="app-import-success app-large-data-warning" role="alertdialog" aria-modal="true" tabindex="-1"
        aria-labelledby="app-large-data-title" aria-describedby="app-large-data-text">
        <h2 id="app-large-data-title">{{$t('STORED_DATA_WARNING_TITLE')}}</h2>
        <p id="app-large-data-text">{{$t('STORED_DATA_WARNING_TEXT')}}</p>
        <div class="app-large-data-actions">
          <button type="button" @click="largeDataNotice = false">{{$t('STORED_DATA_WARNING_OK')}}</button>
          <button type="button" @click="hideLargeDataWarning">{{$t('STORED_DATA_WARNING_HIDE')}}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Menu from './components/Menu';
import WelcomeTutorial from './components/WelcomeTutorial';
import { rememberWelcome } from './model/WelcomeTutorial';
import AdaptiveMenu from './components/AdaptiveMenu';
import Game from './components/Game';
import SingleNotesRoundResult from './components/SingleNotesRoundResult';
import PersistenceNotice from './components/PersistenceNotice';
import HomeMenu from './components/HomeMenu';
import * as Lockr from 'lockr';
import { openLearningDatabasePrototype } from './model/LearningDatabasePrototype';
import { activeLearningDatabaseName } from './model/LearningDatabaseGeneration';
import { shouldShowStoredDataWarning, dismissStoredDataWarning } from './model/StoredDataWarning';
import AppSettingsMenu from './components/AppSettingsMenu';
import NoteFlowMenu from './components/NoteFlowMenu';
import NoteFlowHub from './components/NoteFlowHub';
import NoteFlowChordMenu from './components/NoteFlowChordMenu';
import NoteFlowChordTraining from './components/NoteFlowChordTraining';
import NoteFlowGamePreview from './components/NoteFlowGamePreview';
import RhythmSense from './components/RhythmSense';
import Workshop from './components/Workshop';
import { takeSaveDataImportSuccess } from './model/SaveDataImportNotice';
import Options from './model/Options';
import { refreshAppSound } from './model/AppSound';
import { createModalFocusGuard } from './model/ModalFocus';
import './styles/interaction-accessibility.css';

const ANDROID_BACK_DUPLICATE_WINDOW_MS = 250;

export default {
  name: 'App',
  props: { initialTutorial: { type: Boolean, default: false } },
  components: {
    WelcomeTutorial,
    Menu,
    AdaptiveMenu,
    Game,
    SingleNotesRoundResult,
    PersistenceNotice,
    HomeMenu,
    AppSettingsMenu,
    NoteFlowMenu,
    NoteFlowHub,
    NoteFlowChordMenu,
    NoteFlowChordTraining,
    NoteFlowGamePreview,
    RhythmSense,
    Workshop
  },
  data(){
    return {
      globalOptions: Options,
      page: 'home',
      showTutorial: false,
      lastResult: null,
      lastAdaptiveResult: null,
      singleNotesResultContext: null,
      singleNotesView: 'settings',
      adaptiveView: 'settings',
      noteFlowPreview: null,
      noteFlowChordOptions: null,
      noteFlowChordPlan: null,
      currentGameMode: 'normal',
      showExitHint: false,
      importSuccessNotice: takeSaveDataImportSuccess(),
      largeDataNotice: false,
      lastHomeBackAt: 0,
      lastAndroidBackAt: null,
      exitHintTimer: null
    }
  },
  computed: {
    activeHomeNotice() {
      if (this.page !== 'home' || this.showTutorial) return null;
      return this.importSuccessNotice ? 'import' : this.largeDataNotice ? 'large-data' : null;
    }
  },
  watch: {
    activeHomeNotice() { this.$nextTick(this.syncHomeNoticeFocus); },
    'globalOptions.sound': {
      immediate: true,
      handler() { refreshAppSound(); }
    },
    page(){
      this.clearExitHint();
      this.$nextTick(() => window.scrollTo(0, 0));
    }
  },
  mounted(){
    this.showTutorial = this.initialTutorial === true && !this.importSuccessNotice;
    this.homeNoticeFocusDestroyed = false;
    this.$nextTick(this.syncHomeNoticeFocus);
    document.addEventListener('backbutton', this.handleAndroidBack, false);
    this.checkLargeDataWarning();
  },
  beforeDestroy(){
    this.homeNoticeFocusDestroyed = true;
    this.releaseHomeNoticeFocus();
    document.removeEventListener('backbutton', this.handleAndroidBack, false);
    this.clearExitHint();
  },
  methods: {
    finishTutorial(startLearning) {
      rememberWelcome(localStorage);
      this.showTutorial = false;
      if (startLearning === true) this.$nextTick(() => this.openSingleNotes());
    },
    releaseHomeNoticeFocus() {
      if (this.homeNoticeFocusGuard) this.homeNoticeFocusGuard.release();
      this.homeNoticeFocusGuard = null;
    },
    syncHomeNoticeFocus() {
      if (this.homeNoticeFocusDestroyed) return;
      this.releaseHomeNoticeFocus();
      const importing = this.activeHomeNotice === 'import';
      const dialog = this.activeHomeNotice && this.$refs[importing ? 'importSuccessDialog' : 'largeDataDialog'];
      const overlay = this.$refs[importing ? 'importSuccessOverlay' : 'largeDataOverlay'];
      if (!dialog || !overlay) return;
      const home = this.$refs.homeMenu && this.$refs.homeMenu.$el;
      const returnFocus = home && home.contains(document.activeElement)
        ? document.activeElement : home && home.querySelector('button:not([disabled])');
      this.homeNoticeFocusGuard = createModalFocusGuard(dialog, overlay, document, returnFocus);
    },
    async checkLargeDataWarning(){
      let database = null;
      try {
        database = await openLearningDatabasePrototype({ name: activeLearningDatabaseName() });
        const counts = await database.readStoredEntryCounts();
        const history = Lockr.get('roundHistory', null);
        const rounds = Array.isArray(history) ? history : history && history.rounds;
        counts.freeRounds = Array.isArray(rounds) ? rounds.length : 0;
        this.largeDataNotice = shouldShowStoredDataWarning(counts, localStorage);
      } catch (ignored) {
        // This informational warning must never prevent the app from starting.
      } finally { if(database) database.close(); }
    },
    hideLargeDataWarning(){
      dismissStoredDataWarning(localStorage);
      this.largeDataNotice = false;
    },
    clearExitHint(){
      if(this.exitHintTimer !== null){
        window.clearTimeout(this.exitHintTimer);
        this.exitHintTimer = null;
      }
      this.showExitHint = false;
      this.lastHomeBackAt = 0;
    },
    handleAndroidBack(event){
      if(event && typeof event.preventDefault === 'function'){
        event.preventDefault();
      }
      const now = Date.now();
      const elapsed = now - this.lastAndroidBackAt;
      // Some Android navigation paths deliver the same action twice. Keep this
      // timestamp across page/dialog changes and do not extend it for duplicates.
      if(this.lastAndroidBackAt !== null && elapsed >= 0
        && elapsed < ANDROID_BACK_DUPLICATE_WINDOW_MS) return;
      this.lastAndroidBackAt = now;
      if(this.showTutorial){
        this.finishTutorial(false);
        this.clearExitHint();
        return;
      }
      if(this.importSuccessNotice){
        this.importSuccessNotice = false;
        this.clearExitHint();
        return;
      }
      if(this.page === 'home' && this.largeDataNotice){
        this.largeDataNotice = false;
        this.clearExitHint();
        return;
      }
      if(this.page === 'home'){
        if(this.$refs.homeMenu && typeof this.$refs.homeMenu.closeDailyTasks === 'function'
          && this.$refs.homeMenu.closeDailyTasks()){
          this.clearExitHint();
          return;
        }
        if(this.$refs.homeMenu && this.$refs.homeMenu.showAppInfo){
          this.$refs.homeMenu.closeAppInfo();
          this.clearExitHint();
          return;
        }
        if(this.lastHomeBackAt && now - this.lastHomeBackAt <= 2000){
          this.clearExitHint();
          if(window.navigator && window.navigator.app
            && typeof window.navigator.app.exitApp === 'function'){
            window.navigator.app.exitApp();
          }
          return;
        }
        this.clearExitHint();
        this.lastHomeBackAt = now;
        this.showExitHint = true;
        this.exitHintTimer = window.setTimeout(this.clearExitHint, 2000);
        return;
      }
      this.clearExitHint();
      switch(this.page){
        case 'workshop':
          if(this.$refs.workshop && this.$refs.workshop.handleBack()) break;
          this.showHome();
          break;
        case 'app-settings':
          if(this.$refs.appSettings) this.$refs.appSettings.handleBack();
          break;
        case 'single-notes-menu':
          if(this.$refs.singleNotesMenu && this.$refs.singleNotesMenu.handleBack()) break;
          this.showHome();
          break;
        case 'note-flow-hub':
          this.showHome();
          break;
        case 'adaptive-menu':
          if(this.$refs.adaptiveMenu && this.$refs.adaptiveMenu.handleBack()) break;
          this.showHome();
          break;
        case 'note-flow-menu':
          if(this.$refs.noteFlowMenu && this.$refs.noteFlowMenu.handleBack()) break;
          this.showNoteFlowHub();
          break;
        case 'note-flow-chords-menu':
          if(this.$refs.noteFlowChordMenu && this.$refs.noteFlowChordMenu.handleBack()) break;
          this.showNoteFlowHub();
          break;
        case 'note-flow-preview':
          if(this.$refs.noteFlowPreview) this.$refs.noteFlowPreview.exitTraining();
          break;
        case 'note-flow-chords-training':
          if(this.$refs.chordTraining) this.$refs.chordTraining.exitTraining();
          break;
        case 'rhythm-sense':
          if(this.$refs.rhythmSense) this.$refs.rhythmSense.exitTraining();
          break;
        case 'single-notes-result':
          this.showSingleNotesSettings();
          break;
        case 'game':
          if(this.$refs.game) this.$refs.game.handleRoundExit();
          break;
        default:
          this.showHome();
      }
    },
    returnFromGame(result){
      // Snapshot presentation values before Game unmounts; this is not saved
      // learning data and must not change the result/storage schema.
      const game = this.$refs && this.$refs.game;
      this.singleNotesResultContext = result && game ? {
        remainingSeconds: game.timeLeft,
        gameLength: game.options.gameLength,
        inputMode: game.options.inputMode
      } : null;
      if(this.currentGameMode === 'adaptive') this.lastAdaptiveResult = result;
      else this.lastResult = result;
      if(result) this.page = 'single-notes-result';
      else this.showSingleNotesSettings();
    },
    restartSingleNotes(){
      if(this.currentGameMode === 'adaptive') this.startAdaptiveGame();
      else this.startGame();
    },
    showSingleNotesStatistics(){
      if(this.currentGameMode === 'adaptive'){
        this.adaptiveView = 'statistics';
        this.page = 'adaptive-menu';
      } else {
        this.singleNotesView = 'statistics';
        this.page = 'single-notes-menu';
      }
    },
    showSingleNotesSettings(){
      if(this.currentGameMode === 'adaptive') this.openAdaptiveSettings();
      else this.showSingleNotesMenu();
    },
    startGame(){
      this.currentGameMode = 'normal';
      this.page = 'game';
    },
    startAdaptiveGame(){
      this.currentGameMode = 'adaptive';
      this.page = 'game';
    },
    openAdaptiveSettings(){
      this.adaptiveView = 'settings';
      this.page = 'adaptive-menu';
    },
    openSingleNotes(){
      this.openAdaptiveSettings();
    },
    openDailyTask(mode){
      if(mode === 'single') this.openSingleNotes();
      else if(mode === 'melody') this.showNoteFlowMenu();
      else if(mode === 'chords') this.showNoteFlowChordMenu();
      else if(mode === 'rhythm') this.openRhythmSense();
    },
    openNoteFlow(){
      this.page = 'note-flow-hub';
    },
    openRhythmSense(){
      this.page = 'rhythm-sense';
    },
    openWorkshop(){
      this.page = 'workshop';
    },
    showNoteFlowHub(){
      this.page = 'note-flow-hub';
    },
    startNoteFlowPreview(preview){
      this.noteFlowPreview = preview;
      this.page = 'note-flow-preview';
    },
    showNoteFlowMenu(){
      this.page = 'note-flow-menu';
    },
    showNoteFlowChordMenu(){
      this.page = 'note-flow-chords-menu';
    },
    startNoteFlowChordTraining(plan){
      this.noteFlowChordPlan = plan;
      this.page = 'note-flow-chords-training';
    },
    openAppSettings(){
      this.page = 'app-settings';
    },
    showSingleNotesMenu(){
      this.singleNotesView = 'settings';
      this.page = 'single-notes-menu';
    },
    showHome(){
      this.page = 'home';
    }
  }
}
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  user-select: none;
  height: 100%;
  background: #f7f2e9;
}

#app {
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  height: 100%;
}

.persistence-notice-layer { position: sticky; top: max(12px, env(safe-area-inset-top)); z-index: 90; }

.app-exit-hint {
  position: fixed;
  z-index: 10000;
  right: 16px;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 16px;
  width: fit-content;
  max-width: min(360px, calc(100% - 32px));
  margin: 0 auto;
  padding: 12px 18px;
  border-radius: 14px;
  background: #29464d;
  box-shadow: 0 8px 24px rgba(27, 48, 53, 0.25);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  pointer-events: none;
}

.app-import-success-overlay {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(27, 48, 53, 0.45);
}

.app-import-success {
  width: min(100%, 380px);
  box-sizing: border-box;
  padding: 22px;
  border-radius: 14px;
  background: #e4f5eb;
  box-shadow: 0 8px 24px rgba(27, 48, 53, 0.2);
  color: #215b3e;
  font-size: 14px;
}

.app-import-success h2 {
  margin: 0 0 9px;
  font-size: 18px;
}

.app-import-success p {
  margin: 0 0 18px;
  line-height: 1.5;
}

.app-import-success button {
  min-width: 90px;
  min-height: 42px;
  padding: 8px 16px;
  border: 1px solid #2c7b89;
  border-radius: 10px;
  background: #2c7b89;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.app-large-data-warning { background: #fff8e9; color: #715426; }
.app-large-data-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.app-large-data-actions button:last-child { background: #fff; color: #356674; }
</style>
