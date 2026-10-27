<template>
  <div class="flow-staff-preview">
    <div v-if="!activeTraining" class="flow-staff-caption">
      <span aria-hidden="true"></span>
      {{$t('FLOW_GENERATED_SEQUENCE')}}
    </div>
    <div class="flow-current-key" aria-live="polite">
      <span>{{$t('FLOW_PREVIEW_KEY')}}</span>
      <strong>{{currentTonalityLabel}}</strong>
    </div>
    <div
      class="flow-score-shell"
      :class="{ 'two-staves': hasTwoStaves }">
      <div
        class="flow-input-line"
        :class="{ wrong: playback && playback.feedback === 'wrong' }"
        :style="inputLineStyle"
        aria-hidden="true">
        <span>{{$t('FLOW_INPUT_LINE')}}</span>
      </div>
      <svg
        class="flow-score"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="$t('FLOW_GENERATED_SEQUENCE')"
        focusable="false">
        <defs>
          <clipPath id="note-flow-moving-notes-clip">
            <rect
              :x="layout.noteClipX"
              y="0"
              :width="layout.width - layout.noteClipX"
              :height="layout.height" />
          </clipPath>
        </defs>

        <g class="flow-fixed-notation">
          <g v-for="staff in layout.staves" :key="staff.clef">
            <line
              v-for="(lineY, lineIndex) in staff.lineYs"
              :key="staff.clef + '-line-' + lineIndex"
              class="flow-staff-line"
              :x1="layout.staffStartX"
              :x2="layout.staffEndX"
              :y1="lineY"
              :y2="lineY" />
            <path
              class="flow-clef"
              :d="glyphPath(
                staff.clefGlyph,
                staff.clefX,
                staff.clefY,
                staff.clefScale
              )" />
            <path
              v-for="signature in staff.keySignature"
              :key="signature.id"
              class="flow-key-signature"
              :d="accidentalPath(
                signature.glyph,
                signature.x,
                signature.y,
                0.82
              )" />
          </g>
        </g>

        <g clip-path="url(#note-flow-moving-notes-clip)">
          <g
            class="flow-moving-notation"
            :transform="trackTransform">
            <g
              v-for="(event, eventIndex) in layout.events"
              :key="event.id"
              class="flow-stream-event"
              :class="{
                'is-current': isCurrentEvent(eventIndex),
                'is-wrong': event.inputResult === 'wrong' && !hasPendingForEvent(eventIndex),
                'is-correct': event.inputResult === 'correct'
              }"
              :transform="'translate(' + event.x + ' 0)'">
              <g
                v-for="(note, noteIndex) in event.notes"
                :key="event.id + '-note-' + noteIndex">
                <line
                  v-for="(ledgerY, ledgerIndex) in note.ledgerLineYs"
                  :key="event.id + '-ledger-' + noteIndex + '-' + ledgerIndex"
                  class="flow-ledger-line"
                  x1="-11"
                  x2="11"
                  :y1="ledgerY"
                  :y2="ledgerY" />
                <path
                  v-if="note.accidental"
                  class="flow-note-accidental"
                  :d="accidentalPath(
                    note.accidental,
                    note.accidentalX,
                    note.accidentalY,
                    0.9
                  )" />
                <ellipse
                  class="flow-note-head"
                  :class="{ 'is-entered': isEnteredNote(eventIndex, note) }"
                  cx="0"
                  :cy="note.y"
                  rx="7.2"
                  ry="5.1"
                  :transform="'rotate(-14 0 ' + note.y + ')'" />
                <line
                  class="flow-note-stem"
                  :x1="note.stem.x"
                  :x2="note.stem.x"
                  :y1="note.stem.y1"
                  :y2="note.stem.y2" />
              </g>
              <path
                v-for="(rest, restIndex) in event.rests"
                :key="event.id + '-rest-' + restIndex"
                class="flow-rest"
                :d="restPath(rest.y)" />
            </g>
          </g>
        </g>
      </svg>
    </div>
    <div v-if="!activeTraining" class="flow-preview-range">
      <span>{{$t('FLOW_PREVIEW_VISIBLE_POSITIONS', { count: visibleEventCount })}}</span>
      <span>{{$t('FLOW_PREVIEW_STATIC_BADGE')}}</span>
    </div>
    <div v-if="!activeTraining" class="flow-motion-controls">
      <span class="flow-motion-status" :class="playbackStatus">
        {{playbackStatusLabel}}
      </span>
      <div>
        <button type="button" class="flow-motion-primary" @click="toggleMotion">
          {{primaryControlLabel}}
        </button>
        <button
          type="button"
          class="flow-motion-reset"
          :disabled="playbackStatus === 'ready'"
          @click="restartMotion">
            {{$t('FLOW_RESTART_MOTION')}}
        </button>
      </div>
    </div>
    <section class="flow-answer-panel">
      <header>
        <strong>{{$t('FLOW_INPUT_PANEL_TITLE')}}</strong>
        <span>{{inputStatusLabel}}</span>
      </header>
      <ButtonInput
        v-if="inputMode === 'button'"
        compact
        :disabled="!canSubmitInput"
        :is-sharp="isSharpInput"
        @solved="submitPitchClass" />
      <KeyboardInput
        v-else-if="inputMode === 'keyboard'"
        compact
        :disabled="!canSubmitInput"
        @solved="submitPitchClass" />
      <div v-else class="flow-midi-input">
        <MidiInput
          show-octave
          :is-sharp="isSharpInput"
          @connection-change="midiConnected = $event"
          @solved="submitMidiNote" />
      </div>
      <p v-if="inputMode === 'midi'">{{$t('FLOW_MIDI_OCTAVE_HINT')}}</p>
      <p>{{inputHint}}</p>
    </section>
  </div>
</template>

<script>
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import Glyphs from "abcjs/src/write/creation/glyphs";
import ButtonInput from "./ButtonInput";
import KeyboardInput from "./KeyboardInput";
import MidiInput from "./MidiInput";
import {
  createNoteFlowStaffLayout,
  NOTE_FLOW_EVENT_SPACING
} from "../model/NoteFlowStaffLayout";
import { generateNoteFlowCycle } from "../model/NoteFlowGenerator";
import {
  createNoteFlowPlayback,
  startNoteFlowPlayback,
  advanceNoteFlowPlayback,
  pauseNoteFlowPlayback,
  resumeNoteFlowPlayback,
  submitNoteFlowInput,
  getNoteFlowPlaybackFrame,
  appendNoteFlowPlaybackEvents,
  trimPassedNoteFlowPlaybackEvents
} from "../model/NoteFlowPlayback";
import {
  collectNoteFlowMidiInput,
  collectNoteFlowPitchClassInput,
  getNoteFlowTouchAudioValue,
  selectNoteFlowInputTarget
} from "../model/NoteFlowInput";
import { createPianoSamplePlayer } from "../model/PianoAudio";
import {
  formatNoteFlowTonalityLabel,
  getActiveNoteFlowTonality
} from "../model/NoteFlowKeyLabels";
import Options from "../model/Options";

const STREAM_RENDER_EVENT_COUNT = 8;
const STREAM_BUFFER_AHEAD = 16;
const STREAM_RETAIN_PASSED = 1;
const STREAM_MAX_CATCH_UP = 128;

export default {
  name: "NoteFlowStaffPreview",
  components: {
    ButtonInput,
    KeyboardInput,
    MidiInput
  },
  props: {
    cycle: {
      type: Object,
      required: true
    },
    speed: {
      type: String,
      default: "normal"
    },
    bpm: {
      type: Number,
      default: null
    },
    behavior: {
      type: String,
      default: "wait"
    },
    inputMode: {
      type: String,
      default: "button"
    },
    activeTraining: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      playback: null,
      eventProgress: 0,
      nextCycleIndex: 1,
      continuationState: null,
      animationFrame: null,
      pendingInputValues: [],
      pendingInputEventIndex: null,
      midiConnected: false,
      pianoPlayer: createPianoSamplePlayer({ feedback: true })
    };
  },
  computed: {
    visibleEventCount() {
      return this.visibleEvents.length;
    },
    visibleWindowStart() {
      if (!this.playback) {
        return 0;
      }
      return Math.max(0, this.playback.currentEventIndex - 1);
    },
    visibleEvents() {
      if (!this.playback) {
        return this.cycle.timeline.events.slice(0, STREAM_RENDER_EVENT_COUNT);
      }
      return this.playback.timeline.events.slice(
        this.visibleWindowStart,
        this.visibleWindowStart + STREAM_RENDER_EVENT_COUNT
      );
    },
    layoutCycle() {
      return Object.assign({}, this.cycle, {
        timeline: Object.assign({}, this.cycle.timeline, {
          events: this.visibleEvents
        })
      });
    },
    hasTwoStaves() {
      return this.layout.staves.length > 1;
    },
    layout() {
      return createNoteFlowStaffLayout(
        this.layoutCycle,
        this.visibleEventCount,
        {
          metricEvents: this.playback
            ? this.playback.timeline.events
            : this.cycle.timeline.events
        }
      );
    },
    viewBox() {
      return `0 0 ${this.layout.width} ${this.layout.height}`;
    },
    playbackStatus() {
      return this.playback ? this.playback.status : "ready";
    },
    currentEvent() {
      if (!this.playback) {
        return null;
      }
      return this.playback.timeline.events[this.playback.currentEventIndex]
        || null;
    },
    activeTonality() {
      return getActiveNoteFlowTonality(this.cycle, this.currentEvent);
    },
    currentTonalityLabel() {
      if (!this.activeTonality) {
        return "";
      }
      const tonic = formatNoteFlowTonalityLabel(
        this.activeTonality,
        Options.noteNaming
      );
      const mode = this.activeTonality.mode === "minor"
        ? this.$t("FLOW_KEY_MINOR")
        : this.$t("FLOW_KEY_MAJOR");
      return `${tonic} ${mode}`;
    },
    canSubmitInput() {
      if (!this.playback) {
        return false;
      }
      return this.playbackStatus === "waiting"
        || this.playbackStatus === "running";
    },
    isSharpInput() {
      return !this.activeTonality
        || this.activeTonality.signature.type !== "flat";
    },
    inputStatusLabel() {
      if (this.inputMode === "midi" && !this.midiConnected) {
        return this.$t("FLOW_INPUT_NOT_CONNECTED");
      }
      if (this.pendingInputValues.length > 0 && this.currentEvent) {
        return this.$t("FLOW_INPUT_TWO_HAND_PROGRESS", {
          current: this.pendingInputValues.length,
          total: this.currentEvent.expectedValues.length
        });
      }
      if (this.playback && this.playback.feedback === "wrong") {
        return this.$t("FLOW_INPUT_WRONG");
      }
      if (this.playback && this.playback.feedback === "correct") {
        return this.$t("correctExcl");
      }
      if (this.playbackStatus === "waiting") {
        return this.$t("FLOW_INPUT_WAITING");
      }
      return this.canSubmitInput
        ? this.$t("FLOW_INPUT_PLAY_NOW")
        : this.$t("FLOW_INPUT_READY");
    },
    inputHint() {
      if (this.inputMode === "midi" && !this.midiConnected) {
        return this.$t("FLOW_MIDI_CONNECT_HINT");
      }
      if (this.playback && this.playback.feedback === "wrong") {
        return this.$t(this.behavior === "wait"
          ? "FLOW_INPUT_WRONG_HINT"
          : "FLOW_INPUT_CONTINUOUS_WRONG_HINT");
      }
      if (this.currentEvent && this.currentEvent.expectedValues.length > 1) {
        return this.$t("FLOW_INPUT_TWO_HAND_HINT");
      }
      if (this.behavior === "wait") {
        return this.$t("FLOW_INPUT_WAIT_MODE_HINT");
      }
      return this.$t("FLOW_INPUT_CONTINUOUS_HINT");
    },
    playbackStatusLabel() {
      const labels = {
        ready: "FLOW_MOTION_READY",
        running: "FLOW_MOTION_RUNNING",
        waiting: "FLOW_INPUT_WAITING",
        paused: "PAUSED",
        complete: "FLOW_MOTION_COMPLETE"
      };
      return this.$t(labels[this.playbackStatus] || labels.ready);
    },
    primaryControlLabel() {
      if (this.playbackStatus === "running" || this.playbackStatus === "waiting") {
        return this.$t("PAUSE");
      }
      if (this.playbackStatus === "paused") {
        return this.$t("RESUME");
      }
      if (this.playbackStatus === "complete") {
        return this.$t("FLOW_PLAY_AGAIN");
      }
      return this.$t("FLOW_START_MOTION");
    },
    trackTransform() {
      const currentPosition = this.playback
        ? this.playback.currentEventIndex - this.visibleWindowStart
          + this.eventProgress
        : 0;
      const offset = this.layout.playLineX + NOTE_FLOW_EVENT_SPACING
        - currentPosition * NOTE_FLOW_EVENT_SPACING;
      return `translate(${offset} 0)`;
    },
    inputLineStyle() {
      return {
        left: `${this.layout.playLineX / this.layout.width * 100}%`
      };
    }
  },
  watch: {
    cycle() {
      this.resetMotion(false);
    },
    speed() {
      this.resetMotion(false);
    },
    behavior() {
      this.resetMotion(false);
    },
    inputMode() {
      this.pendingInputValues = [];
      this.pendingInputEventIndex = null;
      this.midiConnected = false;
      this.stopInputSounds();
    }
  },
  mounted() {
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => {
      if (["running", "waiting"].includes(this.playbackStatus)) this.pauseMotion();
    });
    this.resetMotion(false);
  },
  beforeDestroy() {
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    this.stopAnimationFrame();
    this.stopInputSounds();
  },
  methods: {
    glyphPath(name, x, y, scale) {
      return Glyphs.getPathForSymbol(x, y, name, scale, scale)
        .map(part => part.join(" "))
        .join("");
    },
    accidentalPath(accidental, x, y, scale) {
      return this.glyphPath(
        accidental === "flat" ? "accidentals.flat" : "accidentals.sharp",
        x,
        y,
        scale
      );
    },
    restPath(y) {
      return this.glyphPath("rests.quarter", -4, y, 1);
    },
    isCurrentEvent(eventIndex) {
      return !!this.playback
        && this.visibleWindowStart + eventIndex === this.playback.currentEventIndex;
    },
    hasPendingForEvent(eventIndex) {
      return this.pendingInputValues.length > 0
        && this.pendingInputEventIndex === this.visibleWindowStart + eventIndex;
    },
    isEnteredNote(eventIndex, note) {
      return this.hasPendingForEvent(eventIndex)
        && this.pendingInputValues.includes(note.value);
    },
    streamEvents(cycle) {
      return cycle.timeline.events.map(event => Object.assign({}, event, {
        streamCycleIndex: cycle.cycleIndex,
        tonalityPlan: cycle.tonalityPlan
      }));
    },
    createNextCycle() {
      const nextCycle = generateNoteFlowCycle(
        this.cycle.config,
        this.nextCycleIndex,
        this.continuationState
      );
      this.nextCycleIndex += 1;
      this.continuationState = nextCycle.nextState;
      return nextCycle;
    },
    createPlayback() {
      this.nextCycleIndex = 1;
      this.continuationState = this.cycle.nextState;
      const nextCycle = this.createNextCycle();
      const timeline = Object.assign({}, this.cycle.timeline, {
        events: this.streamEvents(this.cycle).concat(
          this.streamEvents(nextCycle)
        ),
        eventCount: this.cycle.timeline.events.length
          + nextCycle.timeline.events.length
      });
      return createNoteFlowPlayback(timeline, {
        speed: this.speed,
        bpm: this.bpm,
        behavior: this.behavior
      });
    },
    appendNextCycle() {
      const nextCycle = this.createNextCycle();
      this.playback = appendNoteFlowPlaybackEvents(
        this.playback,
        this.streamEvents(nextCycle)
      );
    },
    ensurePlaybackAhead(requiredAhead = STREAM_BUFFER_AHEAD) {
      if (!this.playback) {
        return;
      }
      const target = Math.min(STREAM_MAX_CATCH_UP, Math.max(
        STREAM_BUFFER_AHEAD,
        Math.ceil(requiredAhead)
      ));
      let remaining = this.playback.timeline.events.length
        - this.playback.currentEventIndex - 1;
      while (remaining < target) {
        this.appendNextCycle();
        remaining = this.playback.timeline.events.length
          - this.playback.currentEventIndex - 1;
      }
    },
    requiredAheadAt(timestamp) {
      if (!this.playback || this.playback.nextTransitionAtMs === null) {
        return STREAM_BUFFER_AHEAD;
      }
      const overdue = Math.max(
        0,
        timestamp - this.playback.nextTransitionAtMs
      );
      return STREAM_BUFFER_AHEAD
        + Math.floor(overdue / this.playback.stepDurationMs) + 1;
    },
    stopAnimationFrame() {
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    },
    resetMotion(startImmediately) {
      this.stopAnimationFrame();
      this.stopInputSounds();
      this.playback = this.createPlayback();
      this.eventProgress = 0;
      this.pendingInputValues = [];
      this.pendingInputEventIndex = null;
      this.emitRoundProgress();
      if (startImmediately) {
        this.startMotion();
      }
    },
    startMotion() {
      AudioSync.resume();
      const now = performance.now();
      this.playback = startNoteFlowPlayback(this.playback, now);
      this.$emit("round-start");
      if (window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.ensurePlaybackAhead();
        const nextStep = now + this.playback.stepDurationMs;
        this.playback = advanceNoteFlowPlayback(
          this.playback,
          nextStep
        );
        this.playback = trimPassedNoteFlowPlaybackEvents(
          this.playback,
          STREAM_RETAIN_PASSED
        );
        this.playback = pauseNoteFlowPlayback(this.playback, nextStep);
        this.eventProgress = 0;
        return;
      }
      this.animationFrame = requestAnimationFrame(this.updateMotion);
    },
    pauseMotion() {
      const now = performance.now();
      this.playback = pauseNoteFlowPlayback(this.playback, now);
      this.eventProgress = getNoteFlowPlaybackFrame(
        this.playback,
        now
      ).progress;
      this.stopAnimationFrame();
      this.stopInputSounds();
      this.$emit("round-pause");
    },
    resumeMotion() {
      AudioSync.resume();
      this.playback = resumeNoteFlowPlayback(this.playback, performance.now());
      this.animationFrame = requestAnimationFrame(this.updateMotion);
      this.$emit("round-resume");
    },
    restartMotion() {
      this.resetMotion(false);
      this.$emit("round-reset");
    },
    finishMotion() {
      this.stopAnimationFrame();
      this.stopInputSounds();
      this.pendingInputValues = [];
      this.pendingInputEventIndex = null;
      this.eventProgress = getNoteFlowPlaybackFrame(
        this.playback,
        performance.now()
      ).progress;
      this.playback = Object.assign({}, this.playback, {
        status: "complete",
        completionReason: "round-complete",
        completedAtMs: performance.now(),
        nextTransitionAtMs: null,
        waitingReason: null,
        feedback: "none"
      });
      this.emitRoundProgress();
    },
    toggleMotion() {
      if (this.playbackStatus === "running" || this.playbackStatus === "waiting") {
        this.pauseMotion();
      } else if (this.playbackStatus === "paused") {
        this.resumeMotion();
      } else if (this.playbackStatus === "complete") {
        this.resetMotion(false);
        this.$emit("round-reset");
        this.startMotion();
      } else {
        this.startMotion();
      }
    },
    submitPitchClass(value) {
      this.submitInput(value, false);
    },
    submitMidiNote(value) {
      this.submitInput(value, true);
    },
    submitInput(value, isMidi) {
      if (!this.canSubmitInput || !this.playback) {
        return;
      }
      const now = performance.now();
      const previousEventIndex = this.playback.currentEventIndex;
      this.playback = advanceNoteFlowPlayback(this.playback, now);
      if (this.playback.currentEventIndex !== previousEventIndex) {
        this.pendingInputValues = [];
        this.pendingInputEventIndex = null;
      }
      const target = selectNoteFlowInputTarget(
        this.playback,
        value,
        now,
        this.pendingInputEventIndex
      );
      if (!target) {
        return;
      }
      this.playInputSound(value, target.event, isMidi);
      const collector = isMidi
        ? collectNoteFlowMidiInput
        : collectNoteFlowPitchClassInput;
      const retainPendingOnWrong = this.behavior === "wait"
        && this.pendingInputEventIndex === target.eventIndex
        && this.pendingInputValues.length > 0;
      const previousPending = this.pendingInputValues.slice();
      const collected = collector(
        target.event.expectedValues,
        this.pendingInputValues,
        value
      );
      if (!collected) {
        return;
      }
      this.pendingInputValues = collected.pendingValues;
      if (collected.status === "pending") {
        // Eine Zweihand-Position bleibt ein gemeinsames Ereignis. Erst wenn
        // alle erwarteten Töne vorliegen, darf die Wiedergabe sie bewerten.
        this.pendingInputEventIndex = target.eventIndex;
        return;
      }

      const previousStatus = this.playbackStatus;
      this.playback = submitNoteFlowInput(
        this.playback,
        collected.playedValues,
        now,
        target.eventIndex
      );
      this.eventProgress = getNoteFlowPlaybackFrame(this.playback, now).progress;
      this.pendingInputValues = retainPendingOnWrong && collected.status === "wrong"
        ? previousPending : [];
      this.pendingInputEventIndex = this.pendingInputValues.length
        ? target.eventIndex : null;
      this.emitRoundProgress();
      if (this.playbackStatus === "waiting") {
        this.stopAnimationFrame();
      } else if (
        previousStatus === "waiting"
        && this.playbackStatus === "running"
        && this.animationFrame === null
      ) {
        this.ensurePlaybackAhead();
        this.animationFrame = requestAnimationFrame(this.updateMotion);
      }
    },
    playInputSound(value, targetEvent, isMidi = false) {
      if (!targetEvent) {
        return;
      }
      const audibleValue = isMidi
        ? value
        : getNoteFlowTouchAudioValue(
          targetEvent.expectedValues,
          this.pendingInputValues,
          value
        );
      this.pianoPlayer.play(audibleValue, Options.appVolume);
    },
    stopInputSounds() {
      if (this.pianoPlayer) {
        this.pianoPlayer.stopAll();
      }
    },
    emitRoundProgress() {
      if (!this.playback) {
        return;
      }
      const correct = this.playback.correctEventCount || 0;
      const wrong = this.playback.wrongAttemptCount || 0;
      const missed = this.playback.missedEventCount || 0;
      const attempts = correct + wrong + missed;
      this.$emit("round-progress", {
        correct,
        correctFirstTry: this.playback.correctFirstTryCount || 0,
        wrong,
        missed,
        accuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0,
        precise: this.playback.preciseEventCount || 0,
        early: this.playback.earlyAttemptCount || 0,
        late: this.playback.lateAttemptCount || 0,
        totalAbsoluteTimingOffsetMs:
          this.playback.totalAbsoluteTimingOffsetMs || 0
      });
    },
    updateMotion(timestamp) {
      const previousEventId = this.currentEvent ? this.currentEvent.id : null;
      this.ensurePlaybackAhead(this.requiredAheadAt(timestamp));
      this.playback = advanceNoteFlowPlayback(this.playback, timestamp);
      this.playback = trimPassedNoteFlowPlaybackEvents(
        this.playback,
        STREAM_RETAIN_PASSED
      );
      this.ensurePlaybackAhead();
      const frame = getNoteFlowPlaybackFrame(this.playback, timestamp);
      this.eventProgress = frame.progress;
      if (this.currentEvent && this.currentEvent.id !== previousEventId) {
        this.pendingInputValues = [];
        this.pendingInputEventIndex = null;
        this.emitRoundProgress();
      }
      if (this.playbackStatus === "running") {
        this.animationFrame = requestAnimationFrame(this.updateMotion);
      } else {
        this.animationFrame = null;
      }
    }
  }
};
</script>

<style scoped>
.flow-staff-preview {
  width: 100%;
}

.flow-staff-caption,
.flow-preview-range {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #557077;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.flow-staff-caption {
  justify-content: flex-start;
  gap: 7px;
  margin-bottom: 9px;
}

.flow-staff-caption span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ea6331;
  box-shadow: 0 0 0 4px rgba(234, 99, 49, 0.11);
}

.flow-current-key {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
  padding: 8px 12px;
  border: 1px solid rgba(45, 113, 128, 0.15);
  border-radius: 12px;
  background: rgba(237, 248, 250, 0.72);
  color: #506a71;
  font-size: 11px;
}

.flow-current-key strong {
  color: #245e6c;
  font-size: 13px;
}

.flow-score-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(45, 113, 128, 0.18);
  border-radius: 18px;
  background:
    linear-gradient(90deg, rgba(45, 113, 128, 0.045), transparent 24%),
    rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.flow-score {
  display: block;
  position: relative;
  z-index: 1;
  width: 100%;
  height: auto !important;
  background: transparent;
}

.flow-clef,
.flow-key-signature,
.flow-note-head,
.flow-note-accidental,
.flow-rest {
  fill: #233f46;
}

.flow-staff-line,
.flow-ledger-line,
.flow-note-stem {
  fill: none;
  stroke: #4e656a;
  stroke-linecap: round;
}

.flow-staff-line {
  stroke-width: 1.25px;
}

.flow-clef,
.flow-key-signature {
  opacity: 0.96;
}

.flow-moving-notation {
  will-change: transform;
}

.flow-ledger-line {
  stroke-width: 1.4px;
}

.flow-note-stem {
  stroke: #233f46;
  stroke-width: 1.7px;
}

.flow-note-head,
.flow-rest {
  fill: #233f46;
}

.flow-stream-event .flow-note-head,
.flow-stream-event .flow-note-stem,
.flow-stream-event .flow-note-accidental,
.flow-stream-event .flow-ledger-line {
  transition: fill 130ms ease, stroke 130ms ease;
}

.flow-stream-event.is-correct .flow-note-head,
.flow-stream-event.is-correct .flow-note-accidental {
  fill: #36966e;
}

.flow-stream-event.is-correct {
  animation: flow-note-correct-flash 260ms ease-out;
}

.flow-stream-event.is-correct .flow-note-stem,
.flow-stream-event.is-correct .flow-ledger-line {
  stroke: #36966e;
}

.flow-stream-event.is-wrong .flow-note-head,
.flow-stream-event.is-wrong .flow-note-accidental {
  fill: #d8483c;
}

.flow-stream-event.is-wrong {
  animation: flow-note-wrong-flash 260ms ease-out;
}

.flow-stream-event.is-wrong .flow-note-stem,
.flow-stream-event.is-wrong .flow-ledger-line {
  stroke: #d8483c;
}

.flow-stream-event .flow-note-head.is-entered {
  fill: #f49a35;
  stroke: #b55f14;
  stroke-width: 2.4px;
}

@keyframes flow-note-correct-flash {
  0% { opacity: 1; }
  45% { opacity: 0.42; }
  100% { opacity: 1; }
}

@keyframes flow-note-wrong-flash {
  0% { opacity: 1; }
  35% { opacity: 0.34; }
  70% { opacity: 1; }
  100% { opacity: 0.72; }
}

.flow-input-line {
  position: absolute;
  z-index: 3;
  top: 14px;
  bottom: 14px;
  left: 30%;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(#f09a55, #e85a2a);
  box-shadow: 0 0 0 4px rgba(232, 90, 42, 0.09);
  pointer-events: none;
}

.flow-input-line span {
  position: absolute;
  top: 1px;
  left: 50%;
  padding: 3px 6px;
  border-radius: 999px;
  background: #e95e2e;
  color: #fff;
  font-size: 8px;
  font-weight: 850;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
  transform: translate(-50%, -100%);
  white-space: nowrap;
}

.flow-input-line.wrong {
  background: #d8483c;
  box-shadow: 0 0 0 6px rgba(216, 72, 60, 0.13);
}

.flow-input-line.wrong span {
  background: #c93d33;
}

.flow-preview-range {
  margin-top: 9px;
  color: #829397;
  font-size: 9px;
  letter-spacing: 0.02em;
  text-transform: none;
}

.flow-preview-range span:last-child {
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(45, 113, 128, 0.09);
  color: #39727d;
  font-weight: 800;
}

.flow-motion-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid rgba(45, 113, 128, 0.1);
}

.flow-motion-status {
  position: relative;
  padding-left: 13px;
  color: #6f858a;
  font-size: 9px;
  font-weight: 800;
}

.flow-motion-status::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9eadaf;
  content: "";
  transform: translateY(-50%);
}

.flow-motion-status.running::before {
  background: #43a37a;
  box-shadow: 0 0 0 4px rgba(67, 163, 122, 0.1);
}

.flow-motion-status.paused::before {
  background: #e49b43;
}

.flow-motion-status.waiting::before {
  background: #d8483c;
  box-shadow: 0 0 0 4px rgba(216, 72, 60, 0.11);
}

.flow-motion-status.complete::before {
  background: #2d7180;
}

.flow-motion-controls > div {
  display: flex;
  gap: 6px;
}

.flow-motion-controls button {
  min-height: 36px;
  padding: 7px 10px;
  border-radius: 11px;
  font: inherit;
  font-size: 9px;
  font-weight: 850;
}

.flow-motion-primary {
  border: 0;
  background: #2d7180;
  color: #fff;
}

.flow-motion-reset {
  border: 1px solid rgba(45, 113, 128, 0.2);
  background: rgba(255, 255, 255, 0.7);
  color: #537177;
}

.flow-motion-reset:disabled {
  opacity: 0.42;
}

.flow-answer-panel {
  margin-top: 14px;
  padding: 13px;
  border: 1px solid rgba(45, 113, 128, 0.15);
  border-radius: 17px;
  background: rgba(244, 250, 249, 0.78);
}

.flow-answer-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;
}

.flow-answer-panel header strong {
  color: #335f68;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.flow-answer-panel header span {
  color: #b84e2c;
  font-size: 10px;
  font-weight: 800;
  text-align: right;
}

.flow-answer-panel > p {
  margin: 10px 2px 0;
  color: #75898d;
  font-size: 10px;
  line-height: 1.4;
  text-align: center;
}

.flow-midi-input {
  padding: 18px 14px;
  border: 1px dashed rgba(45, 113, 128, 0.24);
  border-radius: 13px;
  color: #657e84;
  font-size: 11px;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .flow-stream-event.is-correct,
  .flow-stream-event.is-wrong {
    animation: none;
  }
  .flow-stream-event .flow-note-head,
  .flow-stream-event .flow-note-stem,
  .flow-stream-event .flow-note-accidental,
  .flow-stream-event .flow-ledger-line {
    transition: none;
  }
}

@media (max-width: 380px) {
  .flow-motion-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .flow-motion-controls > div {
    width: 100%;
  }

  .flow-motion-controls button {
    flex: 1;
  }
}
</style>
