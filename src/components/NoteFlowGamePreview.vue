<template>
  <main class="flow-game-preview">
    <div class="flow-game-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="flow-game-backdrop" />
    </div>

    <div class="flow-game-shell">
      <section class="flow-game-status">
        <div class="flow-game-title">
          <span class="flow-game-title-mark" aria-hidden="true"></span>
          <div>
            <small>{{$t('HOME_TRAINING_KICKER')}}</small>
            <h1>{{$t('HOME_NOTE_FLOW')}}</h1>
          </div>
          <MidiConnectionStatus v-if="preview.menuOptions.inputMode === 'midi'" :connected="midiConnected" />
        </div>
        <div class="flow-training-controls">
          <button type="button" class="flow-training-exit" @click="exitTraining">
            {{roundIsActive ? $t('END_ROUND') : $t('FLOW_BACK_TO_SETTINGS')}}
          </button>
          <button
            type="button"
            class="flow-training-play"
            :disabled="!canPlay"
            @click="playTraining">
            <span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>
            <span>{{playControlLabel}}</span>
          </button>
          <button
            ref="pauseButton"
            type="button"
            class="flow-training-pause"
            :disabled="!canPause"
            @click="pauseTraining">
            <span class="flow-control-icon flow-pause-icon" aria-hidden="true"></span>
            <span>{{$t('PAUSE')}}</span>
          </button>
        </div>
        <p v-if="trainingNotice && !roundResult" class="flow-game-space-warning" role="status">
          {{trainingNotice}}
        </p>
        <div class="flow-live-score">
          <div>
            <strong>{{roundTimeLabel}}</strong>
            <span>{{$t('TIME')}}</span>
          </div>
          <div>
            <strong>{{roundProgress.correct}}</strong>
            <span>{{$t('CORRECT')}}</span>
          </div>
          <div>
            <strong>{{roundProgress.accuracy}} %</strong>
            <span>{{$t('ACCURACY')}}</span>
          </div>
        </div>
      </section>

      <section class="flow-stage-card" ref="flowStage" :class="{ 'has-overlay': stageOverlayOpen }">
        <NoteFlowRhythmPreview
          v-if="generatedCycle && generatedRhythmScore"
          ref="flowStaff"
          :cycle="generatedCycle"
          :score="generatedRhythmScore"
          :bpm="preview.menuOptions.bpm"
          :behavior="preview.menuOptions.behavior"
          :input-mode="preview.menuOptions.inputMode"
          :display-note="preview.menuOptions.displayNote"
          :rhythm-options="rhythmOptions"
          training
          @preparation-change="isPreparing = $event"
          @round-start="startRound"
          @round-pause="pauseRound"
          @round-resume="resumeRound"
          @round-reset="resetRound"
          @round-progress="updateRoundProgress"
          @connection-change="midiConnected = $event"
          @display-change="notationFit = $event"
        />
        <div v-else class="flow-preview-error" role="alert">
          <strong>{{$t('FLOW_PREVIEW_GENERATION_ERROR')}}</strong>
          <p>{{$t('FLOW_PREVIEW_GENERATION_ERROR_DESCRIPTION')}}</p>
        </div>
        <div
          ref="pauseDialog"
          v-if="!isPreparing && roundTimer.status === 'paused'"
          class="flow-pause-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="$t('PAUSED')"
          tabindex="-1">
          <span class="flow-pause-emblem" aria-hidden="true"></span>
          <h2>{{$t('PAUSED')}}</h2>
          <p>{{$t('FLOW_PAUSE_MESSAGE')}}</p>
          <button type="button" @click="playTraining">
            <span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>
            {{$t('RESUME')}}
          </button>
        </div>
        <div
          v-if="roundResult"
          class="flow-result-overlay"
          role="region"
          :aria-labelledby="'flow-result-title'">
          <div class="flow-result-heading">
            <span aria-hidden="true">✓</span>
            <div>
              <small>{{$t('FLOW_ROUND_RESULT_KICKER')}}</small>
              <h2 id="flow-result-title">{{$t('FLOW_ROUND_RESULT_TITLE')}}</h2>
            </div>
          </div>
          <p class="flow-result-reason">{{$t(roundResultReasonLabel)}}</p>

          <div class="flow-result-score">
            <div>
              <strong>{{roundResult.score.correct}}</strong>
              <span>{{$t('CORRECT')}}</span>
            </div>
            <div>
              <strong>{{roundResult.score.wrong}}</strong>
              <span>{{$t('wrong')}}</span>
            </div>
            <div>
              <strong>{{roundResult.score.missed}}</strong>
              <span>{{$t('FLOW_RESULT_MISSED')}}</span>
            </div>
            <div>
              <strong>{{roundResult.score.accuracy}} %</strong>
              <span>{{$t('ACCURACY')}}</span>
            </div>
          </div>

          <section class="flow-result-timing">
            <h3>{{$t('FLOW_RESULT_TIMING')}}</h3>
            <div>
              <span><strong>{{roundResult.timing.early}}</strong>{{$t('FLOW_RESULT_EARLY')}}</span>
              <span><strong>{{roundResult.timing.precise}}</strong>{{$t('FLOW_RESULT_PRECISE')}}</span>
              <span><strong>{{roundResult.timing.late}}</strong>{{$t('FLOW_RESULT_LATE')}}</span>
            </div>
            <p v-if="roundResult.timing.averageAbsoluteOffsetMs !== null">
              {{$t('FLOW_RESULT_AVERAGE_OFFSET', {
                value: roundResult.timing.averageAbsoluteOffsetMs
              })}}
            </p>
            <p v-else>{{$t('FLOW_RESULT_NO_TIMING')}}</p>
          </section>

          <div class="flow-result-settings">
            <span>{{resultDurationLabel}}</span>
            <span v-for="detail in resultSettingLabels" :key="detail">{{detail}}</span>
          </div>
          <NoteFlowRhythmSummary :settings="roundResult.settings" />

          <div
            class="flow-result-storage"
            :class="`is-${roundSaveState}`"
            aria-live="polite">
            <span>{{roundSaveLabel}}</span>
            <button
              v-if="roundSaveState === 'error'"
              type="button"
              class="persistence-retry"
              @click="saveRoundResult">
              {{$t('FLOW_RESULT_SAVE_RETRY')}}
            </button>
          </div>

        </div>
      </section>
    </div>
  </main>
</template>

<script>
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import MidiConnectionStatus from "./MidiConnectionStatus";
import NoteFlowRhythmPreview from "./NoteFlowRhythmPreview";
import NoteFlowRhythmSummary from "./NoteFlowRhythmSummary";
import {
  createNoteFlowConfigFromMenu,
  createNoteFlowRhythmOptionsFromMenu
} from "../model/NoteFlowMenuConfig";
import { generateNoteFlowCycle } from "../model/NoteFlowGenerator";
import { generateNoteFlowRhythmicScore } from "../model/NoteFlowRhythmGenerator";
import { createNoteFlowRoundSeed } from "../model/NoteFlowRoundSeed";
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
import { getNoteFlowInputAvailability, getNoteFlowStartConstraint } from "../model/NoteFlowDisplayConstraints";
import { createScreenAwakeMixin } from "../model/ScreenAwakeMixin";
import { createModalFocusGuard } from "../model/ModalFocus";

function emptyRoundProgress() {
  return {
    correct: 0,
    correctFirstTry: 0,
    wrong: 0,
    missed: 0,
    accuracy: 0,
    precise: 0,
    early: 0,
    late: 0,
    totalAbsoluteTimingOffsetMs: 0
  };
}

export default {
  name: "NoteFlowGamePreview",
  components: {
    HomeMusicBackdrop,
    MidiConnectionStatus,
    NoteFlowRhythmPreview,
    NoteFlowRhythmSummary
  },
  props: {
    preview: {
      type: Object,
      required: true
    }
  },
  mixins: [createScreenAwakeMixin(function () {
    return (this.isPreparing || this.roundTimer.status === 'running') && !this.roundResult;
  })],
  data() {
    return {
      generatedCycle: null,
      notationFit: null,
      isPreparing: false,
      midiConnected: false,
      generatedRhythmScore: null,
      rhythmOptions: null,
      roundTimer: createNoteFlowRoundTimer(
        this.preview.menuOptions.gameLength
      ),
      roundTicker: null,
      roundProgress: emptyRoundProgress(),
      roundStartedAt: null,
      roundResult: null,
      roundSaveState: "idle"
    };
  },
  computed: {
    inputAvailability() {
      return getNoteFlowInputAvailability(this.preview.menuOptions);
    },
    displayConstraint() {
      return getNoteFlowStartConstraint({
        inputAvailability: this.inputAvailability,
        notation: this.notationFit,
        roundStarted: this.roundStartedAt !== null || this.isPreparing || this.roundTimer.status === "paused"
      });
    },
    trainingNotice() {
      if (!this.inputAvailability.inputAvailable) return this.$t("FLOW_KEYBOARD_SINGLE_STAFF_ONLY");
      if (!this.displayConstraint.warning) return "";
      return this.$t(this.displayConstraint.preserveRound
        ? "FLOW_TRAINING_SPACE_DURING_ROUND" : "FLOW_TRAINING_SPACE_BEFORE_START");
    },
    pauseDialogOpen() {
      return !this.isPreparing && this.roundTimer.status === "paused" && !this.roundResult;
    },
    stageOverlayOpen() {
      return Boolean(this.roundResult) || (!this.isPreparing && this.roundTimer.status === "paused");
    },
    roundTimeLabel() {
      return formatNoteFlowRoundTime(this.roundTimer);
    },
    roundIsActive() {
      return this.isPreparing || this.roundTimer.status === "running"
        || this.roundTimer.status === "paused";
    },
    canPlay() {
      return Boolean(this.generatedCycle)
        && this.inputAvailability.inputAvailable
        && (this.preview.menuOptions.inputMode !== "midi" || this.midiConnected)
        && this.roundTimer.status !== "running"
        && !this.isPreparing;
    },
    canPause() {
      return Boolean(this.generatedCycle)
        && (this.isPreparing || this.roundTimer.status === "running");
    },
    playControlLabel() {
      if (this.isPreparing) return this.$t("FLOW_ROUND_RUNNING");
      const labels = {
        ready: "FLOW_PLAY_CONTROL",
        running: "FLOW_ROUND_RUNNING",
        paused: "RESUME",
        complete: "FLOW_PLAY_AGAIN"
      };
      return this.$t(labels[this.roundTimer.status] || labels.ready);
    },
    roundResultReasonLabel() {
      return this.roundResult
        && this.roundResult.completionReason === "time-limit"
        ? "FLOW_RESULT_TIME_COMPLETE"
        : "FLOW_RESULT_MANUAL_COMPLETE";
    },
    resultDurationLabel() {
      if (!this.roundResult) return "";
      const totalSeconds = Math.round(this.roundResult.durationMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return this.$t("FLOW_RESULT_DURATION", {
        value: `${minutes}:${seconds}`
      });
    },
    resultSettingLabels() {
      if (!this.roundResult) return [];
      const settings = this.roundResult.settings;
      const inputLabels = {
        button: this.$t("buttons"),
        keyboard: this.$t("piano"),
        midi: "MIDI"
      };
      return [
        settings.bpm === null ? null : `${settings.bpm} BPM`,
        settings.handMode === "two"
          ? this.$t("FLOW_TWO_HANDS")
          : this.$t("FLOW_ONE_HAND"),
        inputLabels[settings.inputMode] || settings.inputMode
      ].filter(Boolean);
    },
    roundSaveLabel() {
      const labels = {
        saving: "FLOW_RESULT_SAVING",
        saved: "FLOW_RESULT_SAVED",
        error: "FLOW_RESULT_SAVE_ERROR"
      };
      return this.$t(labels[this.roundSaveState] || "FLOW_RESULT_SAVING");
    }
  },
  watch: {
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
    this.generatePreview();
  },
  mounted() {
    this.releaseViewport = lockNoteFlowViewport(this.$el);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  },
  beforeDestroy() {
    this.releasePauseFocus();
    this.stopRoundTicker();
    if (this.releaseViewport) this.releaseViewport();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  },
  methods: {
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
    generatePreview() {
      try {
        const config = createNoteFlowConfigFromMenu(this.preview.menuOptions);
        config.seed = createNoteFlowRoundSeed();
        this.generatedCycle = generateNoteFlowCycle(config);
        this.rhythmOptions = createNoteFlowRhythmOptionsFromMenu(
          this.preview.menuOptions
        );
        this.generatedRhythmScore = generateNoteFlowRhythmicScore(
          this.generatedCycle,
          Object.assign({}, this.rhythmOptions, {
            measureCount: 16,
            restChance: 0.12
          })
        );
      } catch (error) {
        this.generatedCycle = null;
        this.generatedRhythmScore = null;
      }
    },
    startRoundTicker() {
      this.stopRoundTicker();
      if (this.roundTimer.durationMs === null) {
        return;
      }
      this.roundTicker = setInterval(this.updateRoundTimer, 200);
    },
    stopRoundTicker() {
      if (this.roundTicker !== null) {
        clearInterval(this.roundTicker);
        this.roundTicker = null;
      }
    },
    startRound() {
      if (this.roundStartedAt === null) {
        this.roundStartedAt = new Date().toISOString();
      }
      this.roundResult = null;
      this.roundTimer = startNoteFlowRoundTimer(
        this.roundTimer,
        performance.now()
      );
      this.startRoundTicker();
    },
    pauseRound() {
      this.roundTimer = this.roundTimer.status === "ready"
        ? Object.assign({}, this.roundTimer, { status: "paused" })
        : pauseNoteFlowRoundTimer(this.roundTimer, performance.now());
      this.stopRoundTicker();
      if (this.roundTimer.status === "complete") this.completeRound("time-limit");
    },
    resumeRound() {
      this.startRound();
    },
    resetRound() {
      this.isPreparing = false;
      this.stopRoundTicker();
      this.roundTimer = createNoteFlowRoundTimer(
        this.preview.menuOptions.gameLength
      );
      this.roundProgress = emptyRoundProgress();
      this.roundStartedAt = null;
      this.roundResult = null;
      this.roundSaveState = "idle";
    },
    updateRoundTimer() {
      this.roundTimer = advanceNoteFlowRoundTimer(
        this.roundTimer,
        performance.now()
      );
      if (this.roundTimer.status === "complete") {
        this.completeRound("time-limit");
      }
    },
    finishRound() {
      this.completeRound("manual");
    },
    completeRound(reason) {
      if (this.roundResult) return;
      const now = performance.now();
      this.roundTimer = completeNoteFlowRoundTimer(this.roundTimer, now);
      this.stopRoundTicker();
      if (this.$refs.flowStaff) {
        this.$refs.flowStaff.finishMotion();
      }
      this.roundResult = createNoteFlowRoundResult({
        timer: this.roundTimer,
        progress: this.roundProgress,
        menuOptions: this.preview.menuOptions,
        completionReason: reason,
        startedAt: this.roundStartedAt,
        completedAt: new Date().toISOString()
      });
      this.saveRoundResult();
    },
    async saveRoundResult() {
      if (!this.roundResult || this.roundSaveState === "saving") {
        return;
      }
      this.roundSaveState = "saving";
      const roundResult = this.roundResult;
      const result = await NoteFlowRoundStorage.saveRound(roundResult);
      if (!this._isDestroyed && this.roundResult === roundResult) {
        this.roundSaveState = result.saved ? "saved" : "error";
      }
    },
    playTraining() {
      if (!this.canPlay || !this.$refs.flowStaff) {
        return;
      }
      if (this.roundResult) {
        this.restartRound();
        return;
      }
      if (this.roundTimer.status === "paused") {
        this.$refs.flowStaff.resumeMotion();
      } else if (this.roundTimer.status !== "running") {
        this.$refs.flowStaff.toggleMotion();
      }
    },
    pauseTraining() {
      if (
        (this.isPreparing || this.roundTimer.status === "running")
        && this.$refs.flowStaff
      ) {
        this.$refs.flowStaff.pauseMotion();
      }
    },
    exitTraining() {
      if (this.roundIsActive) {
        this.finishRound();
        return;
      }
      this.stopRoundTicker();
      this.$emit("back");
    },
    restartRound() {
      this.resetRound();
      this.generatePreview();
      const score = this.generatedRhythmScore;
      // The score watcher must reset the child's timeline before playback starts.
      this.$nextTick(() => {
        if (!this._isDestroyed && score && this.generatedRhythmScore === score
          && this.$refs.flowStaff) {
          this.$refs.flowStaff.toggleMotion();
        }
      });
    },
    updateRoundProgress(progress) {
      this.roundProgress = Object.assign({}, this.roundProgress, progress);
    },
    handleVisibilityChange() {
      if (
        document.hidden
        && (this.isPreparing || this.roundTimer.status === "running")
        && this.$refs.flowStaff
      ) {
        this.$refs.flowStaff.pauseMotion();
      }
    }
  }
};
</script>

<style scoped src="../styles/training-session.css"></style>
