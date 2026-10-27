<template>
  <div
    class="game-screen"
    :class="{ 'is-paused': isPaused, 'is-adaptive-game': isAdaptiveMode }">
    <div class="game-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="game-backdrop" />
    </div>
    <div class="game-screen-section" id="game-status-display">
      <div class="game-status-card">
        <header class="game-mode-header">
          <span class="game-mode-mark" aria-hidden="true"></span>
          <div>
            <span class="game-mode-kicker">{{$t('HOME_TRAINING_KICKER')}}</span>
            <strong>{{gameModeLabel}}</strong>
          </div>
          <MidiConnectionStatus v-if="options.inputMode === 'midi'" :connected="midiConnected" />
        </header>
        <LearningStorageAlert
          v-if="isAdaptiveMode"
          class="game-storage-alert"
          @recovered="handleStorageRecovered" />
        <div class="round-controls" v-if="!isPaused">
          <button class="quit" @click="handleRoundExit">
            {{$t(options.gameLength ? 'ABORT' : 'END_ROUND')}}
          </button>
          <button ref="pauseButton" class="pause" @click="pauseGame">
            {{$t('PAUSE')}}
          </button>
        </div>
        <div class="paused-status" v-else>{{$t('PAUSED')}}</div>
        <ScoreLine
          :result="result"
          :timeLeft="timeLeft"
          :isInfiniteRound="!options.gameLength" />
        <FeedbackLine
          v-if="!isPaused"
          :feedback="feedback"
          :feedbackNote="feedbackNote"
          :uniqueId="numAnswers" />
        <div v-if="midiConnectionLost && !waitingForMidi && !isPaused"
          class="midi-connection-notice" role="alert">
          <p>{{$t('SINGLE_NOTES_MIDI_CONNECTION_LOST')}}</p>
          <button class="pause" @click="pauseGame">{{$t('PAUSE')}}</button>
        </div>
      </div>
    </div>
    <div class="game-screen-section" id="game-note-display">
      <p v-if="waitingForMidi" class="midi-waiting" role="status">
        {{$t('SINGLE_NOTES_MIDI_WAITING')}}
      </p>
      <NoteDisplay v-else
        :currentExercise="currentExercise"
        :exercise-id="currentExerciseId"
        :is-preparing="isPreparing"
        :preparation-seconds="preparationSeconds"
        :preparation-remaining-seconds="preparationRemainingSeconds"
        :preparation-id="preparationId"
        @rendered="onExerciseRendered"
        @play="playNote(currentExercise.value)" />
    </div>
    <div class="game-screen-section" id="game-screen-input">
      <ButtonInput
        v-if="!storageBlocked && options.inputMode === 'button'"
        :isSharp="currentExercise.isSharp"
        @solved="checkAnswer" />  
      <KeyboardInput
        v-if="!storageBlocked && options.inputMode === 'keyboard'"
        @solved="checkAnswer" />
      <MidiInput
        ref="midiInput"
        v-if="!storageBlocked && options.inputMode === 'midi'"
        @connection-change="handleMidiConnection"
        @solved="(value) => checkAnswer(value, true)" />
      <MousetrapInput 
        v-if="!storageBlocked && options.inputMode !== 'midi'"
        @solved="checkAnswer" />
    </div>
    <div ref="pauseDialog" class="pause-overlay" v-if="isPaused"
      role="dialog" aria-modal="true" :aria-label="$t('PAUSED')" tabindex="-1">
      <h2>{{$t('PAUSED')}}</h2>
      <p>{{$t('PAUSE_MESSAGE')}}</p>
      <template v-if="options.inputMode === 'midi' && !midiConnected">
        <p>{{$t('SINGLE_NOTES_MIDI_RECONNECT_BEFORE_RESUME')}}</p>
        <button v-if="!storageBlocked" class="persistence-retry" @click="retryMidi">
          {{$t('RESTART_MIDI')}}
        </button>
      </template>
      <button class="resume" :disabled="options.inputMode === 'midi' && !midiConnected"
        @click="resumeGame">{{$t('RESUME')}}</button>
      <button class="abort-from-pause" @click="handleRoundExit">
        {{$t(options.gameLength ? 'ABORT' : 'END_ROUND')}}
      </button>
    </div>
  </div>
</template>

<script>
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import ScoreLine from './ScoreLine';
import NoteDisplay from './NoteDisplay';
import FeedbackLine from './FeedbackLine';
import ButtonInput from './ButtonInput';
import KeyboardInput from './KeyboardInput';
import MidiInput from './MidiInput';
import MidiConnectionStatus from './MidiConnectionStatus';
import MousetrapInput from './MousetrapInput';
import HomeMusicBackdrop from './HomeMusicBackdrop';
import LearningStorageAlert from './LearningStorageAlert';

import Utils from '../model/Utils';
import Options from '../model/Options';
import AdaptiveOptions from '../model/AdaptiveOptions';
import AdaptiveProgress from '../model/AdaptiveProgress';
import { createAdaptiveCandidates } from '../model/AdaptiveExercises';
import {
  MAX_ADAPTIVE_COOLDOWN_LENGTH,
  createNoteLearningKey,
  normalizeResponseTimeMs,
  selectAdaptiveCandidate
} from '../model/AdaptiveLearning';
import Statistics from '../model/Statistics';
import {
  getNoteRange,
  getEligibleCustomPianoClefs,
  getPlayableCustomNoteValues,
  usesCustomClefAssignment
} from '../model/NoteRanges';
import { adjustTimestampAfterPause } from '../model/RoundPause';
import { createPianoSamplePlayer } from '../model/PianoAudio';
import SingleNotesLearningStorage from '../model/SingleNotesLearningStorage';
import { createScreenAwakeMixin } from '../model/ScreenAwakeMixin';
import { normalizePreparationSeconds } from '../model/PracticePreparation';
import { createModalFocusGuard } from '../model/ModalFocus';

import * as _ from 'lodash';

export default {
  name: 'Game',
  mixins: [createScreenAwakeMixin(function () {
    return this.roundActive && this.gameReady && this.hasGeneratedExercise && !this.isPaused;
  })],
  props: {
    mode: {
      type: String,
      default: 'normal'
    }
  },
  components: { 
    ScoreLine,
    NoteDisplay,
    FeedbackLine,
    ButtonInput,
    KeyboardInput,
    MidiInput,
    MidiConnectionStatus,
    MousetrapInput,
    HomeMusicBackdrop,
    LearningStorageAlert,
  },
  data () {
    return {
      options: this.mode === 'adaptive' ? AdaptiveOptions : Options,
      midiConnected: false,
      awaitingMidiStart: false,
      midiConnectionLost: false,
      currentExercise: {
        clef: 'treble',
        staff: 'treble',
        value: 36,
        isSharp: false
      },
      numCorrect: 0,
      numWrong: 0,
      responseTimeTotalMs: 0,
      timedNoteCount: 0,
      timeLeft: 0,
      timer: null,
      roundTimeRemainingMs: 0,
      roundTimerUpdatedAtMs: null,
      roundTimerId: 0,
      isPaused: false,
      pauseStartedAtMs: null,
      feedbackNote: 'none',
      feedback: 'none',
      sample: null,
      pianoPlayer: createPianoSamplePlayer({ maxVoices: 1, feedback: true }),
      adaptiveCandidates: [],
      recentAdaptiveValues: [],
      currentExerciseMistakes: 0,
      currentExerciseRecorded: false,
      hasGeneratedExercise: false,
      currentExerciseId: 0,
      shouldMeasureCurrentExercise: false,
      exerciseRenderedAtMs: null,
      currentExerciseResponseTimeMs: null,
      hasRespondedToCurrentExercise: false,
      adaptiveSessionId: null,
      adaptiveSessionHasResults: false,
      gameReady: this.mode !== 'adaptive',
      roundActive: false,
      gameClosed: false,
      gameSessionId: 0,
      isPreparing: false,
      preparationSeconds: 0,
      preparationRemainingSeconds: 0,
      preparationId: 0,
      preparationStarted: false,
      preparationStartedAtMs: null,
      preparationCountdownStartedAtMs: null,
      preparationTimer: null,
    }
  },
  computed: {
    numAnswers(){
      return this.numCorrect + this.numWrong;
    },
    accuracy(){
      if(this.numAnswers === 0){
        return 0;
      }
      return Math.round(100 * this.numCorrect / this.numAnswers);
    },
    score(){
      if(this.numAnswers === 0){
        return 0;
      }
      return Math.round(this.baseFactor * this.numCorrect * this.numCorrect / this.numAnswers);
    },
    baseFactor(){
      // 20s -> 300, 1min -> 100, 5min -> 20
      return this.options.gameLength ? (6000 / this.options.gameLength) : 0;
    },
    result(){
      return {
        numAnswers: this.numAnswers,
        numCorrect: this.numCorrect,
        numWrong: this.numWrong,
        accuracy: this.accuracy,
        score: this.score,
        responseTimeTotalMs: this.responseTimeTotalMs,
        timedNoteCount: this.timedNoteCount,
        isInfiniteRound: !this.options.gameLength
      }
    },
    isAdaptiveMode(){
      return this.mode === 'adaptive';
    },
    storageBlocked(){
      return this.isAdaptiveMode && !this.gameReady;
    },
    waitingForMidi(){
      return this.gameReady && this.options.inputMode === 'midi'
        && this.awaitingMidiStart && !this.midiConnected;
    },
    gameModeLabel(){
      return this.$t(
        this.isAdaptiveMode
          ? 'ADAPTIVE_MODE'
          : 'SINGLE_NOTES_FREE_TRAINING'
      );
    }
  },
  methods: {
    async startGame(){
      this.releasePauseFocus();
      this.stopRoundTimer();
      this.cancelPreparation();
      const sessionId = ++this.gameSessionId;
      this.gameClosed = false;
      this.roundActive = true;
      this.isPaused = false;
      this.pauseStartedAtMs = null;
      this.awaitingMidiStart = this.options.inputMode === 'midi' && !this.midiConnected;
      this.midiConnectionLost = false;
      this.gameReady = !this.isAdaptiveMode;
      this.numCorrect = 0;
      this.numWrong = 0;
      this.responseTimeTotalMs = 0;
      this.timedNoteCount = 0;
      this.timeLeft = this.options.gameLength;
      this.roundTimeRemainingMs = this.options.gameLength * 1000;
      this.hasGeneratedExercise = false;
      this.currentExerciseId = 0;
      this.recentAdaptiveValues = [];
      this.adaptiveSessionId = null;
      this.adaptiveSessionHasResults = false;
      if(this.isAdaptiveMode){
        await AdaptiveProgress.loadFromDatabase(this.options.inputMode);
        if(this.gameClosed || sessionId !== this.gameSessionId){
          return;
        }
        if(SingleNotesLearningStorage.status.state === "error"){
          return;
        }
        this.adaptiveSessionId = AdaptiveProgress.createSession(
          this.options.inputMode
        );
        this.adaptiveCandidates = createAdaptiveCandidates(this.options);
        this.gameReady = true;
      }
      this.prepareReadyRound();
    },
    prepareReadyRound(){
      if(this.gameClosed || !this.roundActive || !this.gameReady || this.isPaused){
        return;
      }
      if(this.options.inputMode === 'midi' && !this.midiConnected){
        this.awaitingMidiStart = true;
        return;
      }
      this.awaitingMidiStart = false;
      if(!this.hasGeneratedExercise){
        this.generateNewExercise();
      }
      this.beginPreparation();
    },
    handleMidiConnection(connected){
      const wasConnected = this.midiConnected;
      this.midiConnected = Boolean(connected);
      if(this.midiConnected){
        this.midiConnectionLost = false;
        if(this.awaitingMidiStart){
          this.prepareReadyRound();
        }
        return;
      }
      if(!this.roundActive || this.gameClosed){
        return;
      }
      if(wasConnected && this.hasGeneratedExercise){
        this.midiConnectionLost = true;
      }
      if(!this.hasGeneratedExercise || this.isPreparing){
        this.awaitingMidiStart = true;
        // Preserve preparation timing until the next preparation or pause can
        // exclude the whole wait from adaptive response measurement.
        if(this.preparationTimer !== null){
          clearTimeout(this.preparationTimer);
          this.preparationTimer = null;
        }
      }
    },
    retryMidi(){
      if(this.$refs.midiInput){
        this.$refs.midiInput.initMidi();
      }
    },
    handleStorageRecovered(){
      if(!this.gameReady){
        this.startGame();
      }
    },
    handleAppInterruption(){
      if(this.roundActive && !this.isPaused){
        this.pauseGame();
      }
      if(this.isAdaptiveMode){
        SingleNotesLearningStorage.flush();
      }
    },
    handleVisibilityChange(){
      if(document.hidden){
        this.handleAppInterruption();
      }
    },
    startRoundTimer(){
      this.stopRoundTimer();
      if(!this.options.gameLength || !this.roundActive || this.gameClosed
        || this.isPaused || this.isPreparing || this.awaitingMidiStart){
        return;
      }
      this.roundTimerUpdatedAtMs = this.getCurrentTimeMs();
      this.advanceRoundTimer(this.roundTimerId);
    },
    updateRoundTime(){
      if(!this.options.gameLength){
        return true;
      }
      if(this.roundTimerUpdatedAtMs !== null){
        const now = this.getCurrentTimeMs();
        this.roundTimeRemainingMs = Math.max(0, this.roundTimeRemainingMs
          - Math.max(0, now - this.roundTimerUpdatedAtMs));
        this.roundTimerUpdatedAtMs = now;
      }
      this.timeLeft = Math.ceil(this.roundTimeRemainingMs / 1000);
      return this.roundTimeRemainingMs > 0;
    },
    advanceRoundTimer(timerId){
      if(timerId !== this.roundTimerId || !this.roundActive || this.gameClosed
        || this.isPaused || this.isPreparing || this.awaitingMidiStart){
        return;
      }
      if(!this.updateRoundTime()){
        this.onGameFinished();
        return;
      }
      // Preserve partial seconds across pauses and align to the active clock,
      // including when a callback arrives late.
      const nextTickMs = this.roundTimeRemainingMs - (this.timeLeft - 1) * 1000;
      this.timer = setTimeout(() => this.advanceRoundTimer(timerId), Math.max(1, nextTickMs));
    },
    stopRoundTimer(){
      this.updateRoundTime();
      this.roundTimerUpdatedAtMs = null;
      this.roundTimerId += 1;
      if(this.timer !== null){
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    beginPreparation(){
      this.cancelPreparation();
      if(this.gameClosed || !this.roundActive || !this.gameReady || this.isPaused){
        return;
      }
      if(this.options.inputMode === 'midi' && !this.midiConnected){
        this.awaitingMidiStart = true;
        return;
      }
      this.awaitingMidiStart = false;
      // Start counting only once the fixed note has rendered behind the countdown.
      // Inputs and the round clock remain idle until the preparation finishes.
      this.preparationSeconds = normalizePreparationSeconds(Options.preparationSeconds);
      this.preparationRemainingSeconds = this.preparationSeconds;
      this.preparationId += 1;
      this.preparationStartedAtMs = this.getCurrentTimeMs();
      this.isPreparing = true;
    },
    cancelPreparation(){
      // A second pause can interrupt the countdown after resume. Exclude that
      // partial preparation too, rather than counting it as reaction time.
      if(
        this.isPreparing
        && this.preparationStartedAtMs !== null
        && this.exerciseRenderedAtMs !== null
      ){
        this.exerciseRenderedAtMs += Math.max(0,
          this.getCurrentTimeMs() - this.preparationStartedAtMs
        );
      }
      if(this.preparationTimer !== null){
        clearTimeout(this.preparationTimer);
        this.preparationTimer = null;
      }
      this.isPreparing = false;
      this.preparationRemainingSeconds = 0;
      this.preparationStarted = false;
      this.preparationStartedAtMs = null;
      this.preparationCountdownStartedAtMs = null;
    },
    advancePreparationCountdown(preparationId){
      if(
        preparationId !== this.preparationId
        || !this.isPreparing
        || !this.preparationStarted
        || this.awaitingMidiStart
        || this.isPaused
        || this.gameClosed
        || !this.roundActive
      ){
        return;
      }
      const remainingMs = Math.max(0,
        this.preparationSeconds * 1000
        - (this.getCurrentTimeMs() - this.preparationCountdownStartedAtMs)
      );
      this.preparationRemainingSeconds = Math.ceil(remainingMs / 1000);
      if(remainingMs === 0){
        this.finishPreparation(preparationId);
        return;
      }
      // Align each number with its clock boundary even if a timeout runs late.
      const nextTickMs = remainingMs - (this.preparationRemainingSeconds - 1) * 1000;
      this.preparationTimer = setTimeout(
        () => this.advancePreparationCountdown(preparationId),
        Math.max(1, nextTickMs)
      );
    },
    finishPreparation(preparationId){
      if(
        preparationId !== this.preparationId
        || !this.isPreparing
        || this.awaitingMidiStart
        || this.isPaused
        || this.gameClosed
        || !this.roundActive
      ){
        return;
      }
      const now = this.getCurrentTimeMs();
      const startsResponseMeasurement = this.exerciseRenderedAtMs === null
        && this.shouldMeasureCurrentExercise;
      this.cancelPreparation();
      if(startsResponseMeasurement){
        this.exerciseRenderedAtMs = now;
      }
      this.startRoundTimer();
    },
    onExit(){
      this.gameClosed = true;
      this.roundActive = false;
      this.gameSessionId += 1;
      this.cancelPreparation();
      this.stopRoundTimer();
      this.releasePauseFocus();
      this.pianoPlayer.stopAll();
      this.sample = null;
    },
    pauseGame(){
      if(this.isPaused || !this.roundActive || this.gameClosed){
        return;
      }
      if(!this.updateRoundTime()){
        this.onGameFinished();
        return;
      }
      this.pauseStartedAtMs = this.getCurrentTimeMs();
      this.pauseReturnFocus = typeof document !== 'undefined' ? document.activeElement : null;
      this.isPaused = true;
      this.cancelPreparation();
      this.stopRoundTimer();
      this.pianoPlayer.stopAll();
      this.sample = null;
      this.openPauseFocus();
    },
    openPauseFocus(){
      const requestId = this.pauseFocusRequestId = (this.pauseFocusRequestId || 0) + 1;
      this.$nextTick(() => {
        if(requestId !== this.pauseFocusRequestId || !this.isPaused
          || !this.roundActive || this.gameClosed || !this.$refs.pauseDialog){
          return;
        }
        this.pauseFocusGuard = createModalFocusGuard(
          this.$refs.pauseDialog, this.$refs.pauseDialog, document, this.pauseReturnFocus
        );
      });
    },
    releasePauseFocus(){
      this.pauseFocusRequestId = (this.pauseFocusRequestId || 0) + 1;
      if(this.pauseFocusGuard){
        this.pauseFocusGuard.release();
        this.pauseFocusGuard = null;
      }
    },
    resumeGame(){
      if(!this.isPaused || (this.options.inputMode === 'midi' && !this.midiConnected)){
        return;
      }
      AudioSync.resume();
      const resumedAtMs = this.getCurrentTimeMs();
      this.exerciseRenderedAtMs = adjustTimestampAfterPause(
        this.exerciseRenderedAtMs,
        this.pauseStartedAtMs,
        resumedAtMs
      );
      this.pauseStartedAtMs = null;
      const returnFocus = this.pauseReturnFocus;
      this.releasePauseFocus();
      this.isPaused = false;
      this.prepareReadyRound();
      const requestId = this.pauseFocusRequestId;
      this.$nextTick(() => {
        if(requestId !== this.pauseFocusRequestId || this.isPaused
          || !this.roundActive || this.gameClosed || typeof document === 'undefined'){
          return;
        }
        const target = returnFocus && document.body.contains(returnFocus)
          ? returnFocus : this.$refs.pauseButton;
        if(target && !target.disabled && !target.closest('[inert], [hidden]')){
          target.focus();
        }
      });
    },
    onGameFinished(){
      if(!this.roundActive || this.gameClosed){
        return;
      }
      this.recordUnresolvedAdaptiveMistake();
      this.finishAdaptiveLearningSession();
      this.onExit();
      if(!this.isAdaptiveMode){
        Statistics.addRound(this.result, this.options);
      }
      this.$emit('gameEnded', this.result); 
    },
    handleRoundExit(){
      if(this.options.gameLength){
        this.quit();
        return;
      }
      this.onGameFinished();
    },
    quit(){
      this.recordUnresolvedAdaptiveMistake();
      this.finishAdaptiveLearningSession();
      this.onExit();
      this.$emit('gameEnded', null);
    },
    generateNewExercise(){
      let exercise;
      let attempts = 0;
      const previousExercise = this.hasGeneratedExercise
        ? this.currentExercise
        : null;
      do {
        exercise = this.generateExercise();
        attempts += 1;
      } while(
        previousExercise
        && exercise.value === previousExercise.value
        && attempts < 20
      );
      this.shouldMeasureCurrentExercise = (
        !this.isAdaptiveMode || this.hasGeneratedExercise
      );
      this.exerciseRenderedAtMs = null;
      this.currentExerciseResponseTimeMs = null;
      this.hasRespondedToCurrentExercise = false;
      this.currentExercise = exercise;
      this.currentExerciseId += 1;
      this.currentExerciseMistakes = 0;
      this.currentExerciseRecorded = false;
      this.hasGeneratedExercise = true;
    },
    generateExercise(){
      if(this.isAdaptiveMode){
        return this.generateAdaptiveExercise();
      }
      let clef = _.sample(this.options.clef);
      let staff = clef;
      let value;
      if(
        this.options.difficulty === 'custom'
        && usesCustomClefAssignment(this.options.clef)
      ){
        value = _.sample(getPlayableCustomNoteValues(
          this.options.customMinValue,
          this.options.customMaxValue,
          this.options.customTrebleMinValue,
          this.options.customBassMaxValue
        ));
        clef = _.sample(getEligibleCustomPianoClefs(
          value,
          this.options.customTrebleMinValue,
          this.options.customBassMaxValue,
          this.options.customMinValue,
          this.options.customMaxValue
        ));
        staff = this.options.clef.indexOf('piano') !== -1 ? 'piano' : clef;
      }else if(clef === 'piano'){
        staff = 'piano';
        clef = _.sample(['treble', 'bass']);
      }
      if(value === undefined){
        value = this.getRandomNoteForClef(clef);
      }
      const exercise = { clef, staff, value };
      switch(this.options.accidentals){
        case 'no':
          exercise.isSharp = true;
          if(Utils.hasAccidental(exercise.value)){
            _.sample([true, false]) ? exercise.value++ : exercise.value--;
          }
          break;
        case 'onlySharp':
          exercise.isSharp = true;
          break;
        case 'onlyFlat':
          exercise.isSharp = false;
          break;
        case 'sharpAndFlat':
          exercise.isSharp = _.sample([true, false])
          break;
      }
      return exercise;
    },
    generateAdaptiveExercise(){
      const previousExercise = this.hasGeneratedExercise
        ? this.currentExercise
        : null;
      const selected = selectAdaptiveCandidate(
        this.adaptiveCandidates,
        AdaptiveProgress.progress,
        {
          previousKey: previousExercise
            ? createNoteLearningKey(previousExercise)
            : null,
          previousValue: previousExercise ? previousExercise.value : null,
          recentValues: this.recentAdaptiveValues
        }
      );
      if (selected) {
        this.recentAdaptiveValues = this.recentAdaptiveValues
          .concat(Number(selected.value))
          .slice(-MAX_ADAPTIVE_COOLDOWN_LENGTH);
      }
      return selected || {
        clef: 'treble',
        staff: 'treble',
        value: 48,
        isSharp: true
      };
    },
    getRandomNoteForClef(clef){
      let customMin = this.options.customMinValue;
      let customMax = this.options.customMaxValue;
      if(this.options.difficulty === 'custom' && clef === 'bass'){
        customMax = this.options.customBassMaxValue;
      }else if(this.options.difficulty === 'custom' && clef === 'treble'){
        customMin = this.options.customTrebleMinValue;
      }
      const range = getNoteRange(
        clef,
        this.options.difficulty,
        customMin,
        customMax
      );
      return _.random(range.min, range.max);
    },
    checkAnswer(value, checkOctave = false){
      if(!this.roundActive || !this.gameReady || !this.hasGeneratedExercise
        || this.awaitingMidiStart || this.isPaused || this.isPreparing
        || (this.options.inputMode === 'midi' && !this.midiConnected)){
        return;
      }
      if(!this.updateRoundTime()){
        this.onGameFinished();
        return;
      }
      this.captureFirstResponseTime();
      this.playNote(Utils.getNearestNoteOfValue(value, this.currentExercise.value));
      if(checkOctave){
        var submittedValue = value;
        var expectedValue = this.currentExercise.value;
      } else {
        var submittedValue = value % 12;
        var expectedValue = this.currentExercise.value % 12;
      }
      if(submittedValue === expectedValue){
        this.onCorrectAnswer(value, this.currentExercise.isSharp);
        this.generateNewExercise();
      } else {
        this.onWrongAnswer();
      }
    },
    onCorrectAnswer(noteValue, isSharp){
      this.numCorrect += 1;
      if(!this.isAdaptiveMode && this.currentExerciseMistakes === 0
        && this.currentExerciseResponseTimeMs > 0){
        this.responseTimeTotalMs += this.currentExerciseResponseTimeMs;
        this.timedNoteCount += 1;
      }

      if(this.isAdaptiveMode){
        this.recordCurrentAdaptiveResult();
      }

      if(this.options.displayNote) {
        this.feedback = 'correct-note';
        this.feedbackNote = Utils.getDisplayNoteName(
          noteValue % 12,
          isSharp,
          Options.noteNaming
        );
      }else{
        this.feedback = 'correct';
      }
    },
    onWrongAnswer(){
      this.numWrong += 1;
      this.currentExerciseMistakes += 1;
      this.feedback = 'wrong';
      if(Options.vibration !== false && typeof navigator !== 'undefined'
        && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(200); } catch(error) { /* Feedback still works when vibration is blocked. */ }
      }
    },
    recordCurrentAdaptiveResult(){
      if(this.currentExerciseRecorded){
        return;
      }
      AdaptiveProgress.recordResult(
        this.currentExercise,
        this.currentExerciseMistakes === 0,
        this.currentExerciseMistakes,
        this.currentExerciseMistakes === 0
          ? this.currentExerciseResponseTimeMs
          : null,
        { sessionId: this.adaptiveSessionId }
      );
      this.adaptiveSessionHasResults = true;
      this.currentExerciseRecorded = true;
    },
    recordUnresolvedAdaptiveMistake(){
      if(
        !this.isAdaptiveMode
        || this.currentExerciseRecorded
        || this.currentExerciseMistakes === 0
      ){
        return;
      }
      AdaptiveProgress.recordResult(
        this.currentExercise,
        false,
        this.currentExerciseMistakes,
        null,
        { sessionId: this.adaptiveSessionId }
      );
      this.adaptiveSessionHasResults = true;
      this.currentExerciseRecorded = true;
    },
    finishAdaptiveLearningSession(){
      if(
        !this.isAdaptiveMode
        || !this.adaptiveSessionHasResults
        || !this.adaptiveSessionId
      ){
        return;
      }
      AdaptiveProgress.finishSession(this.adaptiveSessionId);
      this.adaptiveSessionId = null;
      this.adaptiveSessionHasResults = false;
    },
    getCurrentTimeMs(){
      if(
        typeof performance !== 'undefined'
        && performance
        && typeof performance.now === 'function'
      ){
        return performance.now();
      }
      return Date.now();
    },
    onExerciseRendered(exerciseId, preparationId){
      if(exerciseId !== this.currentExerciseId || this.gameClosed || this.isPaused
        || this.awaitingMidiStart){
        return;
      }
      if(this.isPreparing){
        if(preparationId !== this.preparationId || this.preparationStarted){
          return;
        }
        this.preparationStarted = true;
        this.preparationCountdownStartedAtMs = this.getCurrentTimeMs();
        if(this.preparationSeconds === 0){
          this.finishPreparation(preparationId);
        }else{
          this.advancePreparationCountdown(preparationId);
        }
        return;
      }
      this.exerciseRenderedAtMs = this.shouldMeasureCurrentExercise
        ? this.getCurrentTimeMs()
        : null;
    },
    captureFirstResponseTime(){
      if(
        this.hasRespondedToCurrentExercise
      ){
        return;
      }
      this.hasRespondedToCurrentExercise = true;
      if(this.exerciseRenderedAtMs === null){
        return;
      }
      this.currentExerciseResponseTimeMs = normalizeResponseTimeMs(
        this.getCurrentTimeMs() - this.exerciseRenderedAtMs
      );
    },
    playNote(value){
      if(!this.roundActive || !this.gameReady || !this.hasGeneratedExercise
        || this.awaitingMidiStart || this.isPaused || this.isPreparing){
        return;
      }
      this.pianoPlayer.stopAll();
      this.sample = this.pianoPlayer.play(value, Options.appVolume);
    }
  },
  mounted(){
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => this.handleAppInterruption());
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("pause", this.handleAppInterruption);
    window.addEventListener("pagehide", this.handleAppInterruption);
    this.startGame();
  },
  beforeDestroy(){
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener("pause", this.handleAppInterruption);
    window.removeEventListener("pagehide", this.handleAppInterruption);
    this.onExit();
  }
}
</script>

<style>
.game-screen {
  position: relative;
  margin: 0 auto;
  display: grid;
  grid-template-areas:
    "status"
    "note"
    "input";
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-width: 720px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  color: #213237;
  background:
    radial-gradient(circle at 8% 6%, rgba(231, 101, 48, 0.13), transparent 27%),
    radial-gradient(circle at 94% 42%, rgba(45, 110, 123, 0.11), transparent 31%),
    #f7f2e9;
}

.game-backdrop-clip {
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
}

.game-backdrop {
  opacity: 0.32;
}

.game-status-card {
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 10px 24px rgba(72, 58, 45, 0.1);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

.game-mode-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 10px;
  text-align: left;
}

.game-mode-mark {
  width: 5px;
  height: 35px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #e76530;
}

.is-adaptive-game .game-mode-mark {
  background: #2d6e7b;
}

.game-mode-header div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.game-mode-kicker {
  color: #c95025;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.is-adaptive-game .game-mode-kicker {
  color: #2d6e7b;
}

.game-mode-header strong {
  overflow: hidden;
  color: #26383d;
  font-size: 14px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.round-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 12px 11px;
}

.round-controls button,
.paused-status {
  min-height: 39px;
  padding: 8px 7px;
  border-radius: 12px;
  outline: none;
  font: inherit;
  font-size: 11px;
  font-weight: bold;
}

.round-controls button {
  cursor: pointer;
}

.round-controls .quit {
  border: 1px solid rgba(215, 89, 42, 0.28);
  background: rgba(255, 244, 238, 0.92);
  color: #9e3d1c;
}

.round-controls .pause {
  border: 1px solid rgba(45, 110, 123, 0.25);
  background: rgba(232, 243, 244, 0.94);
  color: #245d68;
}

.paused-status {
  margin: 0 12px 11px;
  border: 1px solid rgba(45, 110, 123, 0.22);
  background: rgba(232, 243, 244, 0.94);
  color: #245d68;
}

.round-controls button:hover,
.round-controls button:focus-visible {
  outline: 3px solid rgba(45, 110, 123, 0.16);
  outline-offset: 1px;
}

.round-controls button:active {
  transform: scale(0.985);
}

.midi-connection-notice {
  margin: 0 12px 12px;
  padding: 12px;
  border: 1px solid #d99276;
  border-radius: 12px;
  background: #fff4ee;
  color: #8b3518;
}

.midi-connection-notice p {
  margin: 0 0 8px;
}

.midi-connection-notice .pause {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid rgba(45, 110, 123, 0.25);
  border-radius: 12px;
  background: rgba(232, 243, 244, 0.94);
  color: #245d68;
  font: inherit;
  cursor: pointer;
}

.midi-waiting {
  max-width: 460px;
  margin: auto;
  padding: 24px;
  color: #245d68;
  text-align: center;
}

.pause-overlay {
  z-index: 10;
  grid-row: 2 / 4;
  grid-column: 1;
  align-self: stretch;
  display: flex;
  min-height: 0;
  padding: 24px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: #fffaf7;
}

.pause-overlay h2 {
  margin: 0;
  color: #b74520;
  font-size: 22pt;
}

.pause-overlay p {
  max-width: 360px;
  margin: 10px 0 22px;
  color: #536971;
  font-size: 10pt;
}

.pause-overlay button {
  width: min(100%, 340px);
  padding: 14px 10px;
  border-radius: 9px;
  font-size: 12pt;
  font-weight: bold;
  cursor: pointer;
}

.pause-overlay .resume {
  border: none;
  background: lightblue;
}

.pause-overlay .resume:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pause-overlay .abort-from-pause {
  margin-top: 9px;
  border: 1px solid #d99276;
  background: white;
  color: #8b3518;
}

.is-paused #game-note-display,
.is-paused #game-screen-input {
  visibility: hidden;
  pointer-events: none;
}

.game-screen-section {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-flow: column nowrap;
}

#game-status-display {
  grid-area: status;
  padding: 10px 12px 0;
  box-sizing: border-box;
}

#game-screen-input {
  grid-area: input;
  width: 100%;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
  box-sizing: border-box;
}

#game-note-display {
  grid-area: note;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 8px 12px 12px;
  box-sizing: border-box;
}

@media (orientation: landscape) and (max-height: 600px) {
  .game-screen {
    grid-template-areas:
      "status status"
      "note input";
    grid-template-columns: minmax(220px, 2fr) minmax(360px, 3fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  #game-screen-input {
    align-self: center;
  }

  #game-status-display {
    padding: 6px 8px 0;
  }

  .game-mode-header {
    padding: 7px 10px 5px;
  }

  .game-mode-mark {
    height: 27px;
  }

  .round-controls {
    gap: 6px;
    padding: 0 9px 7px;
  }

  .round-controls button,
  .paused-status {
    min-height: 31px;
    padding: 5px 7px;
  }

  #game-note-display {
    padding: 6px 12px;
  }

  .pause-overlay {
    grid-row: 2;
    grid-column: 1 / 3;
    padding: 12px 24px;
  }

  .pause-overlay p {
    margin: 5px 0 10px;
  }

  .pause-overlay button {
    padding: 9px 10px;
  }
}
</style>
