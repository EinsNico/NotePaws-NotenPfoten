<template>
  <main class="flow-game-preview chord-training">
    <div class="flow-game-backdrop-clip" aria-hidden="true"><HomeMusicBackdrop class="flow-game-backdrop" /></div>
    <div class="flow-game-shell">
      <section class="flow-game-status">
        <div class="flow-game-title">
          <span class="flow-game-title-mark" aria-hidden="true"></span>
          <div><small>{{$t('HOME_TRAINING_KICKER')}}</small><h1>{{$t('HOME_NOTE_FLOW')}} · {{$t('FLOW_HUB_CHORDS')}}</h1></div>
          <MidiConnectionStatus :connected="midiConnected" />
        </div>
        <p v-if="displayFit && displayFit.measured && !displayFit.fits" class="chord-space-warning" role="status">{{$t(roundStartedAt || roundIsActive ? 'FLOW_TRAINING_SPACE_DURING_ROUND' : 'FLOW_TRAINING_SPACE_BEFORE_START')}}</p>
        <div class="flow-training-controls">
          <button type="button" class="flow-training-exit" @click="exitTraining">{{roundIsActive ? $t('END_ROUND') : $t('FLOW_BACK_TO_SETTINGS')}}</button>
          <button type="button" class="flow-training-play" :disabled="!canPlay" @click="playMotion"><span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>{{playControlLabel}}</button>
          <button ref="pauseButton" type="button" class="flow-training-pause" :disabled="!canPause" @click="pauseMotion"><span class="flow-control-icon flow-pause-icon" aria-hidden="true"></span>{{$t('PAUSE')}}</button>
        </div>
        <div class="flow-live-score">
          <div><strong>{{roundTimeLabel}}</strong><span>{{$t('TIME')}}</span></div>
          <div><strong>{{roundScore.correct}}</strong><span>{{$t('CORRECT')}}</span></div>
          <div><strong>{{roundScore.accuracy}} %</strong><span>{{$t('ACCURACY')}}</span></div>
        </div>
      </section>
      <section class="flow-stage-card" ref="flowStage" :class="{ 'has-overlay': stageOverlayOpen }">
        <div class="chord-stage-key"><span>{{$t('FLOW_CHORD_PREVIEW_KEY')}}</span><strong>{{keyLabel}}</strong></div>
        <p class="chord-stage-progress">{{$t('FLOW_CHORD_STREAM_PROGRESS', { index: targetNumber })}} · {{$t('FLOW_CHORD_MISTAKES', { count: roundScore.wrong })}}</p>
        <div v-if="rhythmState && rhythmScore" class="chord-stage-score" aria-live="polite">
          <NoteFlowChordRhythmStream fit-height :score="rhythmScore" :elapsed-ms="practice.elapsedMs" :practice-state="practice" :tonality="tonality" :wrong-pitch-markers="visibleWrongPitchMarkers" :preparation-progress="isPreparing ? preparationProgress : 1" @notation-fit="displayFit = $event" />
          <p class="chord-training-feedback" :class="feedback" role="status">{{feedbackLabel}}</p>
        </div>
        <section class="chord-input-panel">
          <div class="chord-input-header"><strong>{{$t('FLOW_INPUT_PANEL_TITLE')}}</strong><span>{{inputStatusLabel}}</span></div>
          <details class="chord-input-help">
            <summary>{{$t('FLOW_CHORD_INPUT_HELP')}}</summary>
            <div class="chord-input-help-content">
              <p>{{$t(practice && practice.behavior === 'wait'
                ? 'FLOW_CHORD_MIDI_WAIT_HINT' : 'FLOW_CHORD_MIDI_HINT', { duration: strikeWindowMs })}}</p>
              <MidiInput :is-sharp="preferSharp" show-octave @solved="pressMidi" @released="releaseMidi" @connection-change="handleMidiConnection" />
            </div>
          </details>
        </section>
        <div ref="pauseDialog" v-if="!isPreparing && roundTimer.status === 'paused' && !roundResult" class="flow-pause-overlay" role="dialog" aria-modal="true" :aria-label="$t('PAUSED')" tabindex="-1">
          <span class="flow-pause-emblem" aria-hidden="true"></span>
          <h2>{{$t('PAUSED')}}</h2>
          <p>{{$t('FLOW_PAUSE_MESSAGE')}}</p>
          <button type="button" @click="playMotion"><span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>{{$t('RESUME')}}</button>
        </div>
        <div v-if="roundResult" class="flow-result-overlay" role="region" aria-labelledby="chord-result-title">
          <div class="flow-result-heading"><span aria-hidden="true">✓</span><div><small>{{$t('FLOW_ROUND_RESULT_KICKER')}}</small><h2 id="chord-result-title">{{$t('FLOW_ROUND_RESULT_TITLE')}}</h2></div></div>
          <p>{{$t(roundResult.completionReason === 'time-limit' ? 'FLOW_RESULT_TIME_COMPLETE' : 'FLOW_RESULT_MANUAL_COMPLETE')}}</p>
          <div class="flow-result-score">
            <div><strong>{{roundResult.score.correct}}</strong><span>{{$t('CORRECT')}}</span></div>
            <div><strong>{{roundResult.score.wrong}}</strong><span>{{$t('wrong')}}</span></div>
            <div><strong>{{roundResult.score.missed}}</strong><span>{{$t('FLOW_RESULT_MISSED')}}</span></div>
            <div><strong>{{roundResult.score.accuracy}} %</strong><span>{{$t('ACCURACY')}}</span></div>
          </div>
          <section class="flow-result-timing">
            <h3>{{$t('FLOW_RESULT_TIMING')}}</h3>
            <div>
              <span><strong>{{roundResult.timing.early}}</strong>{{$t('FLOW_RESULT_EARLY')}}</span>
              <span><strong>{{roundResult.timing.precise}}</strong>{{$t('FLOW_RESULT_PRECISE')}}</span>
              <span><strong>{{roundResult.timing.late}}</strong>{{$t('FLOW_RESULT_LATE')}}</span>
            </div>
            <p v-if="roundResult.timing.averageAbsoluteOffsetMs !== null">
              {{$t('FLOW_RESULT_AVERAGE_OFFSET', { value: roundResult.timing.averageAbsoluteOffsetMs })}}
            </p>
            <p v-else>{{$t('FLOW_RESULT_NO_TIMING')}}</p>
          </section>
          <div v-if="roundResult.chord" class="flow-result-rhythm">
            <div><span>{{$t('FLOW_METER')}}</span><strong>{{roundResult.chord.rhythmMeter}}</strong></div>
            <div><span>{{$t('FLOW_CHORD_RHYTHM_VALUES')}}</span><strong>{{roundResult.chord.rhythmValues.map(rhythmValueLabel).join(' · ')}}</strong></div>
          </div>
          <p class="chord-result-notice" role="status">{{$t(roundSaveState === 'saved' ? 'FLOW_RESULT_SAVED' : roundSaveState === 'error' ? 'FLOW_RESULT_SAVE_ERROR' : 'FLOW_RESULT_SAVING')}}</p>
          <button v-if="roundSaveState === 'error'" type="button" class="persistence-retry" @click="saveRoundResult">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button>
        </div>
      </section>
    </div>
  </main>
</template>

<script>
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import NoteFlowChordRhythmStream from "./NoteFlowChordRhythmStream";
import MidiInput from "./MidiInput";
import MidiConnectionStatus from "./MidiConnectionStatus";
import { NOTE_FLOW_CHORD_STRIKE_WINDOW_MS } from "../model/NoteFlowChordTraining";
import { createNoteFlowChordPlan } from "../model/NoteFlowChordPlan";
import { createNoteFlowRoundSeed } from "../model/NoteFlowRoundSeed";
import {
  generateNoteFlowChordRhythmicScore,
  appendNoteFlowChordRhythmicScore,
  dropNoteFlowChordRhythmicMeasures
} from "../model/NoteFlowChordRhythm";
import {
  createNoteFlowChordRhythmPractice,
  startNoteFlowChordRhythmPractice,
  advanceNoteFlowChordRhythmPractice,
  submitNoteFlowChordRhythmInput,
  releaseNoteFlowChordRhythmInput,
  pauseNoteFlowChordRhythmPractice,
  resumeNoteFlowChordRhythmPractice,
  rebaseNoteFlowChordRhythmPractice
} from "../model/NoteFlowChordRhythmPractice";
import {
  createNoteFlowRoundTimer,
  startNoteFlowRoundTimer,
  advanceNoteFlowRoundTimer,
  pauseNoteFlowRoundTimer,
  completeNoteFlowRoundTimer,
  formatNoteFlowRoundTime
} from "../model/NoteFlowRoundTimer";
import { createNoteFlowRoundResult } from "../model/NoteFlowRoundResult";
import NoteFlowRoundStorage from "../model/NoteFlowRoundStorage";
import { lockNoteFlowViewport } from "../model/NoteFlowViewport";
import { getNoteFlowTonality } from "../model/NoteFlowTonality";
import { formatNoteFlowTonalityLabel } from "../model/NoteFlowKeyLabels";
import Options from "../model/Options";
import { normalizePreparationSeconds } from "../model/PracticePreparation";
import { createScreenAwakeMixin } from "../model/ScreenAwakeMixin";
import { createModalFocusGuard } from "../model/ModalFocus";
import { getNoteFlowWrongPitchValue } from "../model/NoteFlowWrongPitchMarkers";

export default {
  name: "NoteFlowChordTraining",
  components: { HomeMusicBackdrop, NoteFlowChordRhythmStream, MidiInput, MidiConnectionStatus },
  props: { plan: { type: Object, required: true } },
  mixins: [createScreenAwakeMixin(function () {
    return (this.isPreparing || this.roundTimer.status === 'running') && !this.roundResult;
  })],
  data() {
    return {
      feedback: "", midiConnected: false, displayFit: null,
      wrongPitchMarkers: [],
      isPreparing: false, preparationProgress: 1,
      rhythmScore: null, rhythmState: null, targetOffset: 0,
      nextChordState: null,
      roundSeed: null,
      roundTimer: createNoteFlowRoundTimer(this.plan.options.gameLength), roundResult: null,
      roundStartedAt: null, roundSaveState: "idle"
    };
  },
  computed: {
    pauseDialogOpen() { return !this.isPreparing && this.roundTimer.status === "paused" && !this.roundResult; },
    stageOverlayOpen() { return Boolean(this.roundResult) || (!this.isPreparing && this.roundTimer.status === "paused"); },
    strikeWindowMs() { return NOTE_FLOW_CHORD_STRIKE_WINDOW_MS; },
    practice() { return this.rhythmState ? this.rhythmState.practice : null; },
    targetNumber() { return this.targetOffset + (this.practice ? this.practice.targetIndex : 0) + 1; },
    markerTargetKey() {
      const target = this.practice && this.practice.timeline.targets[this.practice.targetIndex];
      return target ? `${this.targetNumber}:${target.expectedValues.join(",")}` : null;
    },
    visibleWrongPitchMarkers() {
      return this.plan.options.displayNote !== false
        ? this.wrongPitchMarkers.filter(marker => marker.targetKey === this.markerTargetKey) : [];
    },
    tonality() { return getNoteFlowTonality(this.plan.keyId); },
    keyLabel() { return formatNoteFlowTonalityLabel(this.tonality, Options.noteNaming || "german"); },
    preferSharp() { return !this.tonality || this.tonality.fifths >= 0; },
    roundIsActive() { return this.isPreparing || this.roundTimer.status === "running" || this.roundTimer.status === "paused"; },
    canPlay() { return this.midiConnected && !this.isPreparing && this.practice && (Boolean(this.roundResult) || this.practice.status === "ready" || this.practice.status === "paused"); },
    canPause() { return !this.roundResult && this.practice && (this.isPreparing || this.practice.status === "running" || this.practice.status === "waiting"); },
    playControlLabel() {
      if (this.roundResult) return this.$t("FLOW_PLAY_AGAIN");
      if (this.isPreparing) return this.$t("FLOW_ROUND_RUNNING");
      return this.practice && this.practice.status === "paused" ? this.$t("RESUME") : this.$t("FLOW_PLAY_CONTROL");
    },
    roundTimeLabel() { return formatNoteFlowRoundTime(this.roundTimer); },
    roundScore() {
      const state = this.practice || {};
      const correct = state.correctCount || 0;
      const wrong = state.wrongCount || 0;
      const missed = state.missedCount || 0;
      const total = correct + wrong + missed;
      return {
        correct, wrong, missed,
        correctFirstTry: state.correctFirstTryCount || 0,
        precise: state.preciseEventCount || 0,
        early: state.earlyAttemptCount || 0,
        late: state.lateAttemptCount || 0,
        totalAbsoluteTimingOffsetMs: state.totalAbsoluteTimingOffsetMs || 0,
        accuracy: total ? Math.round(correct / total * 100) : 0
      };
    },
    inputStatusLabel() {
      if (this.isPreparing || !this.practice || this.practice.status === "ready") return this.$t("FLOW_INPUT_READY");
      if (this.practice.pendingValues.length) {
        const target = this.practice.timeline.targets[this.practice.targetIndex];
        return this.$t("FLOW_CHORD_NOTES_COLLECTED", {
          count: this.practice.pendingValues.length,
          total: target ? target.expectedValues.length : 0
        });
      }
      if (this.practice.status === "waiting") return this.$t("FLOW_INPUT_WAITING");
      if (this.practice.status === "paused") return this.$t("PAUSED");
      return this.$t("FLOW_INPUT_PLAY_NOW");
    },
    feedbackLabel() {
      if (this.isPreparing) return "";
      if (this.feedback === "wrong") return this.$t(this.practice.behavior === "wait"
        ? "FLOW_CHORD_WRONG_WAIT" : "FLOW_CHORD_WRONG");
      if (this.feedback === "late") return this.$t("FLOW_CHORD_TOO_SLOW");
      if (this.feedback === "timing") return this.$t("FLOW_CHORD_TIMING_WRONG");
      if (this.feedback === "complete") return this.$t("FLOW_CHORD_CORRECT");
      if (!this.practice || this.practice.status === "ready") return this.$t("FLOW_CHORD_PRESS_PLAY");
      if (this.practice.status === "waiting") return this.$t("FLOW_CHORD_WAITING");
      return this.$t("FLOW_CHORD_MIDI_INPUT_HINT");
    }
  },
  watch: {
    markerTargetKey() { this.pruneWrongPitchMarkers(); },
    "plan.options.displayNote"() { this.clearWrongPitchMarkers(); },
    pauseDialogOpen(open) {
      if (open) this.openPauseFocus();
      else this.releasePauseFocus(true);
    },
    stageOverlayOpen(open) {
      if (open) this.$nextTick(() => {
        if (this.$refs.flowStage) this.$refs.flowStage.scrollTop = 0;
      });
    }
  },
  created() {
    this.animationFrame = null;
    this.timerTicker = null;
    this.initializeTraining();
  },
  mounted() {
    this.releaseViewport = lockNoteFlowViewport(this.$el);
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => this.pauseMotion());
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  },
  beforeDestroy() {
    this.clearWrongPitchMarkers();
    this.releasePauseFocus();
    if (this.releaseViewport) this.releaseViewport();
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    this.cancelPreparation();
    this.stopAnimation();
    this.stopTimerTicker();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  },
  methods: {
    removeWrongPitchMarker(id) {
      const timers = this._wrongPitchMarkerTimers;
      if (timers && timers.has(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
      }
      this.wrongPitchMarkers = this.wrongPitchMarkers.filter(marker => marker.id !== id);
    },
    clearWrongPitchMarkers() {
      this.wrongPitchMarkers.forEach(marker => this.removeWrongPitchMarker(marker.id));
    },
    pruneWrongPitchMarkers() {
      this.wrongPitchMarkers.filter(marker => marker.targetKey !== this.markerTargetKey)
        .forEach(marker => this.removeWrongPitchMarker(marker.id));
    },
    showWrongPitchMarker(target, value) {
      if (this.plan.options.displayNote === false || !target) return;
      const wrongValue = getNoteFlowWrongPitchValue({ target, playedValue: value, inputMode: "midi" });
      if (wrongValue === null) {
        this.clearWrongPitchMarkers();
        return;
      }
      const id = `${this.markerTargetKey}:${wrongValue}`;
      this.removeWrongPitchMarker(id);
      this.wrongPitchMarkers.push({ id, value: wrongValue, target, targetKey: this.markerTargetKey });
      if (!this._wrongPitchMarkerTimers) this._wrongPitchMarkerTimers = new Map();
      this._wrongPitchMarkerTimers.set(id, setTimeout(() => this.removeWrongPitchMarker(id), 1000));
    },
    openPauseFocus() {
      const requestId = this.pauseFocusRequestId = (this.pauseFocusRequestId || 0) + 1;
      this.pauseReturnFocus = typeof document !== "undefined" ? document.activeElement : null;
      this.$nextTick(() => {
        if (requestId !== this.pauseFocusRequestId || this._isDestroyed
          || this._isBeingDestroyed || !this.pauseDialogOpen || !this.$refs.pauseDialog) return;
        this.pauseFocusGuard = createModalFocusGuard(
          this.$refs.pauseDialog, this.$refs.pauseDialog, document, this.pauseReturnFocus
        );
      });
    },
    releasePauseFocus(restore = false) {
      const requestId = this.pauseFocusRequestId = (this.pauseFocusRequestId || 0) + 1;
      if (this.pauseFocusGuard) {
        this.pauseFocusGuard.release();
        this.pauseFocusGuard = null;
      }
      if (!restore) return;
      this.$nextTick(() => {
        if (requestId !== this.pauseFocusRequestId || this._isDestroyed
          || this._isBeingDestroyed || this.pauseDialogOpen || this.roundResult
          || typeof document === "undefined") return;
        const opener = this.pauseReturnFocus;
        const target = opener && document.body.contains(opener) && !opener.disabled
          ? opener : this.$refs.pauseButton;
        if (target && !target.disabled && !target.closest('[inert], [hidden]')) target.focus();
      });
    },
    rhythmValueLabel(value) {
      return this.$t(`FLOW_RHYTHM_VALUE_${value.replace(/-/g, "_").toUpperCase()}`);
    },
    initializeTraining() {
      this.clearWrongPitchMarkers();
      this.cancelPreparation();
      this.roundSeed = createNoteFlowRoundSeed();
      const roundPlan = createNoteFlowChordPlan(Object.assign({}, this.plan.options, {
        tonalityMode: "circle", selectedKey: this.plan.keyId, seed: this.roundSeed
      }));
      this.rhythmScore = generateNoteFlowChordRhythmicScore(roundPlan, {
        meter: this.plan.options.rhythmMeter,
        allowedValues: this.plan.options.rhythmValues,
        bpm: this.plan.options.bpm,
        seed: this.roundSeed
      });
      this.rhythmState = createNoteFlowChordRhythmPractice(this.rhythmScore, {
        behavior: this.plan.behavior
      });
      this.nextCycleIndex = roundPlan.cycleIndex + 1;
      this.nextChordState = roundPlan.nextState;
      this.streamExhausted = false;
      this.targetOffset = 0;
      this.lastFrameAt = null;
      this.feedback = "";
      this.roundTimer = createNoteFlowRoundTimer(this.plan.options.gameLength);
      this.roundResult = null;
      this.roundStartedAt = null;
      this.roundSaveState = "idle";
    },
    startTimerTicker() {
      this.stopTimerTicker();
      this.timerTicker = setInterval(this.updateTimer, 200);
    },
    stopTimerTicker() {
      if (this.timerTicker !== null) clearInterval(this.timerTicker);
      this.timerTicker = null;
    },
    updateTimer() {
      this.roundTimer = advanceNoteFlowRoundTimer(this.roundTimer, performance.now());
      if (this.roundTimer.status === "complete") this.endRound("time-limit");
    },
    exitTraining() {
      if (this.roundIsActive) this.endRound();
      else this.$emit("back");
    },
    endRound(reason = "manual") {
      this.clearWrongPitchMarkers();
      if (this.roundResult) return;
      const now = performance.now();
      this.roundTimer = completeNoteFlowRoundTimer(this.roundTimer, now);
      this.cancelPreparation();
      this.stopTimerTicker();
      this.stopAnimation();
      this.rhythmState = pauseNoteFlowChordRhythmPractice(this.rhythmState);
      const completedAt = new Date().toISOString();
      this.roundResult = createNoteFlowRoundResult({
        exerciseType: "chord",
        timer: this.roundTimer,
        progress: this.roundScore,
        menuOptions: Object.assign({}, this.plan.options, { inputMode: "midi",
          clef: this.plan.options.handMode === "two" ? ["bass", "treble"] : [this.plan.options.singleHand || "treble"] }),
        completionReason: reason,
        startedAt: this.roundStartedAt,
        completedAt
      });
      this.roundResult.chord = {
        keyId: this.plan.keyId,
        chordSize: this.plan.options.chordSize,
        bassNote: this.plan.options.bassNote,
        handMode: this.plan.options.handMode,
        singleHand: this.plan.options.singleHand,
        bassNotesPerChord: this.plan.options.bassNotesPerChord,
        trebleNotesPerChord: this.plan.options.trebleNotesPerChord,
        roundLengthSeconds: this.plan.options.gameLength,
        rhythmMeter: this.plan.options.rhythmMeter,
        rhythmValues: this.plan.options.rhythmValues.slice()
      };
      this.saveRoundResult();
    },
    async saveRoundResult() {
      if (!this.roundResult || this.roundSaveState === "saving") return;
      const roundResult = this.roundResult;
      this.roundSaveState = "saving";
      const result = await NoteFlowRoundStorage.saveRound(roundResult);
      if (this.roundResult === roundResult) {
        this.roundSaveState = result.saved ? "saved" : "error";
      }
    },
    restartRound() {
      this.stopAnimation();
      this.stopTimerTicker();
      this.initializeTraining();
      this.playMotion();
    },
    ensureScoreAhead() {
      if (this.streamExhausted) return;
      const measureMs = this.practice.timeline.measures[0].endMs;
      while (this.rhythmScore.durationMs - this.practice.elapsedMs < measureMs * 2) {
        try {
          const options = Object.assign({}, this.plan.options, {
            tonalityMode: "circle", selectedKey: this.plan.keyId, seed: this.roundSeed
          });
          const next = createNoteFlowChordPlan(options, this.nextCycleIndex, this.plan.keyId, this.nextChordState);
          const nextScore = generateNoteFlowChordRhythmicScore(next, {
            meter: this.plan.options.rhythmMeter,
            allowedValues: this.plan.options.rhythmValues,
            bpm: this.plan.options.bpm,
            seed: `${this.roundSeed}:${next.cycleIndex}`
          });
          this.nextCycleIndex += 1;
          this.nextChordState = next.nextState;
          this.rhythmScore = appendNoteFlowChordRhythmicScore(this.rhythmScore, nextScore);
          this.rhythmState = rebaseNoteFlowChordRhythmPractice(this.rhythmState, this.rhythmScore);
        } catch (error) {
          this.streamExhausted = true;
          break;
        }
      }
    },
    trimScore() {
      if (this.rhythmScore.measures.length <= 16) return;
      const count = 4;
      const shiftMs = this.practice.timeline.measures[count - 1].endMs;
      if (this.practice.elapsedMs <= shiftMs + this.practice.timeline.measures[0].endMs) return;
      const removedTargets = this.practice.timeline.targets.filter(
        target => target.startMs < shiftMs
      ).length;
      this.rhythmScore = dropNoteFlowChordRhythmicMeasures(this.rhythmScore, count);
      this.rhythmState = rebaseNoteFlowChordRhythmPractice(
        this.rhythmState, this.rhythmScore, shiftMs
      );
      this.targetOffset += removedTargets;
    },
    stopAnimation() {
      if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    },
    updateMotion() {
      const now = performance.now();
      this.ensureScoreAhead();
      const beforeIndex = this.practice.targetIndex;
      const beforeWrong = this.practice.wrongCount;
      this.rhythmState = advanceNoteFlowChordRhythmPractice(
        this.rhythmState, Math.max(0, now - this.lastFrameAt), now
      );
      this.lastFrameAt = now;
      if (this.practice.targetIndex !== beforeIndex) this.feedback = "";
      if (this.practice.wrongCount !== beforeWrong) this.feedback = "late";
      this.trimScore();
      this.pruneWrongPitchMarkers();
      this.animationFrame = this.practice.status === "running" || this.practice.status === "waiting"
        ? requestAnimationFrame(this.updateMotion) : null;
    },
    cancelPreparation() {
      if (!this.isPreparing) return;
      this.stopAnimation();
      this.isPreparing = false;
      this.preparationProgress = 1;
    },
    beginMotion() {
      if (this._isDestroyed || !this.midiConnected || this.roundResult) return;
      const now = performance.now();
      if (this.practice.status === "ready") {
        this.rhythmState = startNoteFlowChordRhythmPractice(this.rhythmState);
      }
      else if (this.practice.status === "paused") this.rhythmState = resumeNoteFlowChordRhythmPractice(this.rhythmState);
      else return;
      if (this.roundStartedAt === null) this.roundStartedAt = new Date().toISOString();
      this.lastFrameAt = now;
      this.roundTimer = startNoteFlowRoundTimer(this.roundTimer, now);
      this.startTimerTicker();
      this.stopAnimation();
      this.animationFrame = requestAnimationFrame(this.updateMotion);
    },
    updatePreparation(now) {
      if (!this.isPreparing || this._isDestroyed) return;
      if (this.preparationStartedAt === null) this.preparationStartedAt = now;
      this.preparationProgress = Math.min(1, Math.max(0,
        (now - this.preparationStartedAt) / this.preparationDurationMs));
      if (this.preparationProgress >= 1) {
        this.animationFrame = null;
        this.isPreparing = false;
        this.beginMotion();
      } else {
        this.animationFrame = requestAnimationFrame(this.updatePreparation);
      }
    },
    playMotion() {
      if (!this.canPlay) return;
      if (this.roundResult) {
        this.restartRound();
        return;
      }
      if (this.isPreparing
        || !this.practice || !["ready", "paused"].includes(this.practice.status)) return;
      this.ensureScoreAhead();
      const durationMs = normalizePreparationSeconds(Options.preparationSeconds) * 1000;
      if (durationMs === 0) {
        this.beginMotion();
        return;
      }
      this.stopAnimation();
      this.preparationDurationMs = durationMs;
      // Mobile WebViews can paint late after a cold start. Begin the approach
      // on its first frame so rendering work cannot consume the preparation.
      this.preparationStartedAt = null;
      this.preparationProgress = 0;
      this.isPreparing = true;
      this.feedback = "";
      this.animationFrame = requestAnimationFrame(this.updatePreparation);
    },
    pauseMotion() {
      this.clearWrongPitchMarkers();
      if (!this.practice || (!this.isPreparing
        && this.practice.status !== "running" && this.practice.status !== "waiting")) return;
      const now = performance.now();
      if (!this.isPreparing && (this.practice.status === "running" || this.practice.status === "waiting")) {
        this.rhythmState = advanceNoteFlowChordRhythmPractice(this.rhythmState, Math.max(0,now-this.lastFrameAt), now);
        this.lastFrameAt = now;
      }
      this.cancelPreparation();
      this.rhythmState = this.practice.status === "ready"
        ? Object.assign({}, this.rhythmState, { practice: Object.assign({}, this.practice, {
          status: "paused", resumeStatus: "running"
        }) })
        : pauseNoteFlowChordRhythmPractice(this.rhythmState);
      this.roundTimer = this.roundTimer.status === "ready"
        ? Object.assign({}, this.roundTimer, { status: "paused" })
        : pauseNoteFlowRoundTimer(this.roundTimer, now);
      this.stopTimerTicker();
      this.stopAnimation();
      this.feedback = "";
      if (this.roundTimer.status === "complete") this.endRound("time-limit");
    },
    handleVisibilityChange() {
      if (document.hidden) this.pauseMotion();
    },
    handleMidiConnection(connected) {
      this.midiConnected = connected === true;
      if (!connected) {
        this.pauseMotion();
        this.rhythmState = Object.assign({}, this.rhythmState, {
          pendingSinceMs: null,
          practice: Object.assign({}, this.practice, {
            pendingValues: [], pendingAtMs: null
          })
        });
        this.feedback = "";
      }
    },
    releaseMidi(value) {
      if (this.rhythmState) this.rhythmState=releaseNoteFlowChordRhythmInput(this.rhythmState,value);
    },
    pressMidi(value) {
      if (this.isPreparing || !this.midiConnected || (this.practice.status !== "running" && this.practice.status !== "waiting")) return;
      const now = performance.now();
      this.ensureScoreAhead();
      this.rhythmState = advanceNoteFlowChordRhythmPractice(
        this.rhythmState, Math.max(0, now - this.lastFrameAt), now
      );
      this.lastFrameAt = now;
      const previous = this.practice;
      this.pruneWrongPitchMarkers();
      this.showWrongPitchMarker(previous.timeline.targets[previous.targetIndex], value);
      this.rhythmState = submitNoteFlowChordRhythmInput(this.rhythmState, value, now);
      this.pruneWrongPitchMarkers();
      if (this.practice === previous) return;
      if (this.practice.targetIndex !== previous.targetIndex) {
        const result = this.practice.results[previous.targetIndex];
        this.feedback = result === "correct" ? "complete" : "timing";
      } else if (this.practice.wrongCount !== previous.wrongCount) {
        this.feedback = "wrong";
      } else {
        this.feedback = "";
      }
      if (this.practice.status === "running" && this.animationFrame === null) {
        this.animationFrame = requestAnimationFrame(this.updateMotion);
      }
    }
  }
};
</script>

<style scoped>
.flow-game-preview { position: fixed; inset: 0; height: 100%; height: 100dvh; min-height: 0; overflow: hidden; overscroll-behavior: none; color: #294248; text-align: left; background: radial-gradient(circle at 8% 6%, rgba(231,101,48,.13), transparent 27%), radial-gradient(circle at 94% 42%, rgba(45,110,123,.11), transparent 31%), #f7f2e9; }
.flow-game-backdrop-clip { position: fixed; z-index: 0; inset: 0; overflow: hidden; pointer-events: none; }
.flow-game-backdrop { width: 100%; min-height: 100%; opacity: .32; }
.flow-game-shell { position: relative; z-index: 1; display: grid; width: min(100%,720px); height: 100%; min-height: 0; margin: 0 auto; padding: 10px 12px max(8px,env(safe-area-inset-bottom)); box-sizing: border-box; grid-template-rows: auto minmax(0,1fr); gap: 10px; }
.flow-game-status,.flow-stage-card { border: 1px solid rgba(43,70,77,.11); border-radius: 20px; background: rgba(255,255,255,.81); box-shadow: 0 12px 28px rgba(72,58,45,.09); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.flow-game-status { overflow: hidden; }
.chord-space-warning { margin: 0; padding: 8px 12px; border-top: 1px solid rgba(43,70,77,.09); color: #8f4d31; font-size: 11px; line-height: 1.4; }
.flow-game-title { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 14px 10px; }
.flow-game-title-mark { width: 5px; height: 35px; flex: 0 0 auto; border-radius: 999px; background: #2d7180; }
.flow-game-title small { color: #2d7180; font-size: 8px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.flow-game-title h1 { margin: 2px 0 0; color: #253e44; font-size: 18px; }
.flow-training-controls { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(0,.82fr) minmax(0,.82fr); gap: 8px; padding: 0 12px 11px; }
.flow-training-controls button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 39px; padding: 8px 7px; border-radius: 12px; outline: none; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease; }
.flow-training-exit { border: 1px solid rgba(215,89,42,.28); background: rgba(255,244,238,.92); color: #9e3d1c; }
.flow-training-play { border: 1px solid #2d7180; background: #2d7180; color: #fff; }
.flow-training-pause { border: 1px solid rgba(45,110,123,.25); background: rgba(232,243,244,.94); color: #245d68; }
.flow-training-controls button:hover:not(:disabled),.flow-training-controls button:focus-visible { box-shadow: 0 0 0 3px rgba(45,110,123,.14); }
.flow-training-controls button:active:not(:disabled) { transform: scale(.98); }
.flow-training-controls button:disabled { cursor: default; opacity: .42; }
.flow-control-icon { position: relative; display: inline-block; width: 12px; height: 12px; flex: 0 0 auto; }
.flow-play-icon::before { position: absolute; top: 1px; left: 3px; width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 8px solid currentColor; content: ""; }
.flow-pause-icon::before,.flow-pause-icon::after { position: absolute; top: 1px; bottom: 1px; width: 3px; border-radius: 2px; background: currentColor; content: ""; }
.flow-pause-icon::before { left: 2px; }.flow-pause-icon::after { right: 2px; }
.flow-live-score { display: flex; justify-content: space-around; padding: 11px 8px 9px; border-top: 1px solid rgba(43,70,77,.09); text-align: center; }
.flow-live-score div { min-width: 0; flex: 1 1 0; padding: 1px 5px; }.flow-live-score div + div { border-left: 1px solid rgba(43,70,77,.1); }
.flow-live-score strong,.flow-live-score span { display: block; }.flow-live-score strong { overflow: hidden; color: #26383d; font-size: 15px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.flow-live-score span { margin-top: 2px; color: #778589; font-size: 8px; font-weight: 800; letter-spacing: .06em; }
.flow-stage-card { position: relative; min-height: 0; margin: 0; padding: 14px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
.flow-stage-card.has-overlay { overflow: hidden; }
.flow-stage-card { display: grid; grid-template-rows: auto auto minmax(0,1fr) auto; gap: 8px; overflow: hidden; }
.chord-stage-key { display: flex; align-items: center; justify-content: space-between; padding: 9px 11px; border: 1px solid #d5e8ed; border-radius: 11px; background: #f3fbfd; color: #557077; font-size: 11px; }.chord-stage-key strong { color: #245e6c; font-size: 13px; }
.chord-stage-progress { margin: 9px 0; color: #53727a; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.chord-stage-score { margin-bottom: 14px; }.chord-training-feedback { min-height: 18px; margin: 6px 3px 0; color: #60777e; font-size: 11px; }.chord-training-feedback.wrong,.chord-training-feedback.late,.chord-training-feedback.timing { color: #b7422b; }.chord-training-feedback.complete { color: #237a48; }
.chord-stage-progress { margin: 0; }
.chord-stage-score { display: grid; grid-template-rows: minmax(0,1fr) auto; min-height: 0; margin: 0; }
.chord-stage-score > .chord-rhythm-stream { min-height: 0; margin: 0; }
.chord-input-panel { padding: 14px; border: 1px solid #d5e8ed; border-radius: 17px; background: #f9fdfe; }.chord-input-header { display: flex; justify-content: space-between; gap: 10px; color: #536d75; font-size: 10px; font-weight: 800; letter-spacing: .06em; }.chord-input-header span { color: #b24c2e; text-align: right; }.chord-input-panel p { color: #71868c; font-size: 11px; line-height: 1.45; }
.chord-input-panel { position: relative; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 8px 11px; }
.chord-input-header { min-width: 0; flex-wrap: wrap; }
.chord-input-help summary { min-height: 32px; box-sizing: border-box; padding: 7px 9px; border: 1px solid #d5e8ed; border-radius: 9px; color: #536d75; font-size: 11px; cursor: pointer; }
.chord-input-help-content { position: absolute; z-index: 4; right: 0; bottom: calc(100% + 8px); left: 0; max-height: min(60dvh,300px); overflow-y: auto; padding: 14px; border: 1px solid #d5e8ed; border-radius: 14px; background: #f9fdfe; box-shadow: 0 8px 22px rgba(43,70,77,.14); }
.chord-input-help-content p { margin-top: 0; }
@media (max-width:500px) { .chord-input-panel { grid-template-columns: minmax(0,1fr); gap: 7px; }.chord-input-help { justify-self: start; } }
@media (max-height:500px) and (min-width:620px) {
  .flow-game-shell { width: min(100%,960px); grid-template-columns: 180px minmax(0,1fr); grid-template-rows: minmax(0,1fr); padding-top: 8px; padding-bottom: 8px; gap: 8px; }
  .flow-game-status { display: flex; min-height: 0; flex-direction: column; overflow-y: auto; }
  .flow-game-status > * { flex-shrink: 0; }
  .flow-game-title { padding: 10px 8px; gap: 8px; }
  .flow-game-title > div { min-width: 0; flex: 1 1 calc(100% - 13px); }
  .flow-training-controls { grid-template-columns: minmax(0,1fr); padding: 0 8px 10px; }
  .flow-live-score { display: grid; gap: 6px; margin-top: auto; padding: 8px 10px; text-align: left; }
  .flow-live-score div { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0; }
  .flow-live-score div + div { border-left: 0; }
  .flow-stage-card { padding: 8px 10px; gap: 4px; }
  .chord-stage-key { padding: 5px 9px; }
}
.flow-pause-overlay { position: absolute; z-index: 5; inset: 0; display: flex; min-height: 0; padding: 24px; flex-direction: column; align-items: center; justify-content: flex-start; overflow-y: auto; overscroll-behavior: none; box-sizing: border-box; background: rgba(255,250,247,.97); text-align: center; }
.flow-pause-overlay > :first-child { margin-top: auto; flex-shrink: 0; }.flow-pause-overlay > :last-child { margin-bottom: auto; flex-shrink: 0; }
.flow-pause-emblem { position: relative; width: 42px; height: 42px; border-radius: 50%; background: rgba(45,113,128,.11); color: #2d7180; }.flow-pause-emblem::before,.flow-pause-emblem::after { position: absolute; top: 12px; bottom: 12px; width: 5px; border-radius: 3px; background: currentColor; content: ""; }.flow-pause-emblem::before { left: 13px; }.flow-pause-emblem::after { right: 13px; }
.flow-pause-overlay h2 { margin: 12px 0 0; color: #294248; font-size: 22px; }.flow-pause-overlay p { max-width: 360px; margin: 8px 0 18px; color: #647a80; font-size: 11px; line-height: 1.5; }.flow-pause-overlay button { display: inline-flex; width: min(100%,280px); min-height: 44px; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 13px; background: #2d7180; color: #fff; font: inherit; font-size: 12px; font-weight: 850; cursor: pointer; }
.flow-result-overlay { position: absolute; z-index: 6; inset: 0; overflow-y: auto; overscroll-behavior: none; padding: 20px; box-sizing: border-box; background: rgba(250,253,251,.98); }.flow-result-heading { display: flex; align-items: center; justify-content: center; gap: 10px; }.flow-result-heading > span { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; background: #dbf2e6; color: #27825c; font-size: 20px; font-weight: 900; }.flow-result-heading small { color: #2d7180; font-size: 8px; font-weight: 850; letter-spacing: .12em; }.flow-result-heading h2 { margin: 2px 0 0; color: #294248; font-size: 21px; }.flow-result-overlay > p { margin: 13px 0; color: #647a80; font-size: 11px; text-align: center; }
.flow-result-score { display: grid; grid-template-columns: repeat(4,1fr); gap: 7px; margin: 16px 0; }.flow-result-score div { padding: 11px 4px; border: 1px solid #d5e8ed; border-radius: 12px; text-align: center; }.flow-result-score strong,.flow-result-score span { display: block; }.flow-result-score strong { color: #294248; font-size: 17px; }.flow-result-score span { color: #75868b; font-size: 9px; }
.flow-result-timing { margin: 12px 0; padding: 12px; border: 1px solid rgba(231,101,48,.16); border-radius: 14px; background: rgba(255,246,240,.75); }
.flow-result-timing h3 { margin: 0 0 9px; color: #a44a28; font-size: 10px; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
.flow-result-timing > div { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
.flow-result-timing span { color: #6e7778; font-size: 9px; text-align: center; }
.flow-result-timing span strong { display: block; color: #354d52; font-size: 15px; }
.flow-result-timing p { margin: 8px 0 0; color: #7a7f7e; font-size: 9px; text-align: center; }
.flow-result-rhythm { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,2fr); gap: 8px; }.flow-result-rhythm div { min-width: 0; padding: 9px 11px; border: 1px solid #d5e8ed; border-radius: 12px; background: #f4fafb; }.flow-result-rhythm span,.flow-result-rhythm strong { display: block; }.flow-result-rhythm span { color: #71868c; font-size: 9px; font-weight: 800; }.flow-result-rhythm strong { margin-top: 3px; color: #294248; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
@media (min-width:620px) and (min-height:501px) { .flow-game-shell { padding-top: 16px; padding-bottom: 16px; } }
@media (max-width:370px) { .flow-game-shell { padding-right: 8px; padding-left: 8px; }.flow-stage-card { padding: 10px; }.flow-training-controls { grid-template-columns: 1fr 1fr; }.flow-training-exit { grid-column: 1 / -1; } }
</style>
