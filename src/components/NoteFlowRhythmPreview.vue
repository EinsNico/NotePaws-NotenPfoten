<template>
  <div class="rhythm-preview" :class="{ 'is-training': training }">
    <div v-if="!training" class="rhythm-preview-heading">
      <strong>{{$t('FLOW_RHYTHM_MOTION_PREVIEW')}}</strong>
      <span>{{score.meter.signature}} · {{bpm}} BPM</span>
    </div>
    <div v-else ref="keyRow" class="rhythm-training-key">
      <span>{{$t('FLOW_PREVIEW_KEY')}}</span>
      <strong>{{currentTonalityLabel}}</strong>
      <span>{{activeScore.meter.signature}} · {{bpm}} BPM</span>
    </div>
    <div ref="notationFrame" class="rhythm-preview-frame" :style="notationStyle">
      <svg :viewBox="`0 0 ${layout.width} ${layout.height}`"
        role="img" :aria-label="$t(training ? 'FLOW_GENERATED_SEQUENCE' : 'FLOW_RHYTHM_MOTION_PREVIEW')">
        <defs>
          <clipPath id="flow-rhythm-preview-clip">
            <rect :x="noteClipX" y="0"
              :width="Math.max(0, layout.width - noteClipX)" :height="layout.height" />
          </clipPath>
        </defs>
        <g v-for="staff in layout.staves" :key="staff.clef">
          <line v-for="(y, index) in staff.lineYs" :key="staff.clef + index"
            class="rhythm-staff-line" x1="12" x2="316" :y1="y" :y2="y" />
          <path class="rhythm-clef" :d="glyphPath(staff.clefGlyph,
            staff.clefX, staff.clefY, staff.clefScale)" />
          <path v-for="signature in staff.keySignature" :key="signature.id"
            class="rhythm-accidental"
            :d="glyphPath(accidentalName(signature.glyph), signature.x,
              signature.y, 0.82)" />
          <text class="rhythm-time-signature" :x="layout.timeSignatureX"
            :y="staff.lineYs[2] - 2">{{layout.timeSignature.numerator}}</text>
          <text class="rhythm-time-signature" :x="layout.timeSignatureX"
            :y="staff.lineYs[4] - 2">{{layout.timeSignature.denominator}}</text>
        </g>
        <line class="rhythm-play-line" :x1="layout.playLineX" :x2="layout.playLineX"
          y1="8" :y2="layout.height - 8" />
        <g clip-path="url(#flow-rhythm-preview-clip)">
          <g :transform="`translate(${frame.offsetX} 0)`">
            <line v-for="bar in visibleBarlines" :key="'bar-' + bar.index"
              class="rhythm-barline" :x1="bar.x" :x2="bar.x"
              :y1="layout.staves[0].lineYs[0]"
              :y2="layout.staves[layout.staves.length - 1].lineYs[4]" />
            <line v-for="(beam, index) in visibleBeams" :key="'beam-' + index"
              class="rhythm-beam" :x1="beam.x1" :x2="beam.x2"
              :y1="beam.y" :y2="beam.y" />
            <g v-for="event in visibleEvents" :key="event.id"
              :class="{
                'rhythm-current': currentTargetStartTick === event.startTick,
                'grip-held': gripColor(event) === 'held',
                'grip-found': gripColor(event) === 'found',
                'rhythm-correct': targetResult(event) === 'correct'
                  || (behavior === 'wait' && targetResult(event) === 'late'),
                'rhythm-wrong': targetResult(event) === 'early'
                  || (behavior !== 'wait' && targetResult(event) === 'late'),
                'rhythm-missed': targetResult(event) === 'missed'
              }"
              :data-note-value="event.note && event.note.value" :transform="`translate(${event.x} 0)`">
              <template v-if="event.kind === 'note'">
                <line v-for="(y, index) in event.note.ledgerLineYs" :key="'ledger-' + index"
                  class="rhythm-ledger" x1="-11" x2="11" :y1="y" :y2="y" />
                <path v-if="event.note.accidental" class="rhythm-accidental"
                  :d="glyphPath(accidentalName(event.note.accidental),
                    event.note.accidentalX, event.note.accidentalY, 0.9)" />
                <ellipse class="rhythm-note-head"
                  :class="{ hollow: event.noteValue === 'whole' || event.noteValue === 'half' }"
                  cx="0" :cy="event.note.y" rx="7.2" ry="5.1"
                  :transform="`rotate(-14 0 ${event.note.y})`" />
                <line v-if="event.noteValue !== 'whole'" class="rhythm-stem"
                  :x1="event.note.stem.x" :x2="event.note.stem.x"
                  :y1="event.note.stem.y1" :y2="event.note.stem.y2" />
                <path v-if="!event.beamed && (event.noteValue === 'eighth'
                  || event.noteValue === 'sixteenth')"
                  class="rhythm-flag" :d="flagPath(event.note.stem,
                    event.noteValue === 'sixteenth')" />
                <circle v-if="event.dots" class="rhythm-dot" cx="12"
                  :cy="event.note.y - 2" r="1.7" />
              </template>
              <template v-else>
                <path class="rhythm-rest"
                  :d="glyphPath(restName(event.noteValue), -4, event.restY, 1)" />
                <circle v-if="event.dots" class="rhythm-dot" cx="9"
                  :cy="event.restY - 3" r="1.7" />
              </template>
            </g>
          </g>
        </g>
        <g v-for="marker in groupedWrongPitchMarkers" :key="marker.id"
          v-if="marker.y >= 8 && marker.y <= layout.height - 8"
          class="wrong-pitch-marker" :transform="`translate(${layout.playLineX} 0)`">
          <title>{{$t('FLOW_WRONG_PITCH_MARKER_VALUE', { note: marker.note })}}</title>
          <line v-for="(y, index) in marker.ledgerLineYs" :key="index"
            class="wrong-pitch-ledger" x1="-7" x2="7" :y1="y" :y2="y" />
          <path v-if="marker.accidental" class="wrong-pitch-accidental"
            :d="glyphPath(`accidentals.${marker.accidental}`, -16, marker.y, 0.7)" />
          <circle class="wrong-pitch-dot" cx="0" :cy="marker.y" r="3.5" />
        </g>
        <g v-for="hint in wrongPitchRangeHints" :key="hint.id + '-range'" class="wrong-pitch-marker">
          <title>{{$t('FLOW_WRONG_PITCH_MARKER_VALUE', { note: hint.note })}}</title>
          <rect class="wrong-pitch-range-background" :x="layout.playLineX + 8" :y="hint.hintY - 10"
            :width="hint.note.length * 7 + 24" height="16" rx="5" />
          <text class="wrong-pitch-range-label" :x="layout.playLineX + 14" :y="hint.hintY">{{hint.direction}} {{hint.note}}</text>
        </g>
      </svg>
    </div>
    <button v-if="!training" type="button" class="rhythm-preview-play" @click="togglePreview">
      {{isPlaying ? $t('PAUSE') : $t('FLOW_RHYTHM_PLAY_PREVIEW')}}
    </button>
    <div ref="practiceStatus" class="rhythm-practice-status"
      :class="{ 'has-pitch-collision': wrongPitchCollisionNotes.length > 0 }" aria-live="polite">
      <span v-if="wrongPitchCollisionNotes.length" class="wrong-pitch-collision-hint" :aria-label="$t('FLOW_WRONG_PITCH_MARKERS')">
        <span v-for="note in wrongPitchCollisionNotes" :key="note.id" class="wrong-pitch-collision-note">{{note.note}}</span>
      </span>
      <span>{{practiceStatusLabel}}</span>
      <span v-if="practiceState">
        {{$t('FLOW_RHYTHM_PRACTICE_SCORE', {
          correct: practiceState.correctCount,
          wrong: practiceState.wrongCount,
          missed: practiceState.missedCount
        })}}
      </span>
    </div>
    <div ref="practiceInput" class="rhythm-practice-input">
      <ButtonInput v-if="inputMode === 'button'" compact
        :disabled="!isPlaying" :is-sharp="isSharpInput" @solved="submitTouch" />
      <KeyboardInput v-else-if="inputMode === 'keyboard'" compact
        :disabled="!isPlaying" @solved="submitTouch" />
      <details v-else-if="training" class="rhythm-midi-details" @toggle="measureDisplay">
        <summary>{{$t(midiConnected ? 'HOME_MIDI_CONNECTED' : 'HOME_MIDI_DISCONNECTED')}}</summary>
        <MidiInput show-octave :is-sharp="isSharpInput"
          @connection-change="handleMidiConnection" @solved="submitMidi" @released="releaseMidi" />
      </details>
      <MidiInput v-else show-octave :is-sharp="isSharpInput"
        @connection-change="handleMidiConnection"
        @solved="submitMidi" @released="releaseMidi" />
    </div>
  </div>
</template>

<script>
import { heldNoteGripColor } from '../model/HeldNoteGrip';
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import Glyphs from "abcjs/src/write/creation/glyphs";
import ButtonInput from "./ButtonInput";
import KeyboardInput from "./KeyboardInput";
import MidiInput from "./MidiInput";
import { createNoteFlowRhythmTimeline } from "../model/NoteFlowRhythmTimeline";
import {
  createNoteFlowRhythmStaffLayout,
  getNoteFlowRhythmVisualFrame
} from "../model/NoteFlowRhythmStaffLayout";
import {
  createNoteFlowRhythmPractice,
  startNoteFlowRhythmPractice,
  advanceNoteFlowRhythmPractice,
  submitNoteFlowRhythmPracticeInput,
  releaseNoteFlowRhythmPracticeInput,
  pauseNoteFlowRhythmPractice,
  resumeNoteFlowRhythmPractice,
  rebaseNoteFlowRhythmPractice
} from "../model/NoteFlowRhythmPractice";
import { generateNoteFlowRhythmicScore } from "../model/NoteFlowRhythmGenerator";
import { generateNoteFlowCycle } from "../model/NoteFlowGenerator";
import { getNoteFlowTouchAudioValue } from "../model/NoteFlowInput";
import { createNoteFlowWrongPitchMarker, groupNoteFlowWrongPitchMarkers } from "../model/NoteFlowWrongPitchMarkers";
import { createPianoSamplePlayer } from "../model/PianoAudio";
import {
  formatNoteFlowTonalityLabel,
  getActiveNoteFlowTonality
} from "../model/NoteFlowKeyLabels";
import Options from "../model/Options";
import { normalizePreparationSeconds } from "../model/PracticePreparation";
import { createNoteFlowRenderingSnapshot } from "../model/NoteFlowRenderingSnapshot";
import { fitNoteFlowNotation } from "../model/NoteFlowDisplayConstraints";

const STREAM_MEASURES = 16;
const RETAIN_MEASURES = 16;

export default {
  name: "NoteFlowRhythmPreview",
  components: { ButtonInput, KeyboardInput, MidiInput },
  props: {
    cycle: { type: Object, required: true },
    score: { type: Object, required: true },
    bpm: { type: Number, default: 50 },
    behavior: { type: String, default: "wait" },
    inputMode: { type: String, default: "button" },
    displayNote: { type: Boolean, default: true },
    training: { type: Boolean, default: false },
    rhythmOptions: { type: Object, default: null }
  },
  data() {
    // Props can already have Vue observers. Copying first keeps those observers
    // out of the notation snapshot without freezing/mutating the parent's data.
    const renderCycle = createNoteFlowRenderingSnapshot(this.cycle);
    const activeScore = createNoteFlowRenderingSnapshot(this.score);
    return {
      practiceState: null,
      wrongPitchMarkers: [],
      displayMeasurements: null,
      isPreparing: false,
      preparationProgress: 1,
      midiConnected: false,
      renderCycle,
      activeScore,
      nextCycleIndex: 1,
      continuationState: activeScore.nextState || renderCycle.nextState,
      lastFrameAt: 0,
      frameRequest: null,
      pianoPlayer: createPianoSamplePlayer({ feedback: true })
    };
  },
  computed: {
    notationFit() {
      if (!this.training || !this.displayMeasurements) return null;
      return fitNoteFlowNotation(Object.assign({}, this.displayMeasurements, {
        intrinsicWidth: this.layout.width,
        intrinsicHeight: this.layout.height
      }));
    },
    notationStyle() {
      return this.notationFit && this.notationFit.measured
        ? { width: `${this.notationFit.width}px`, flexShrink: 0 } : null;
    },
    timeline() {
      return createNoteFlowRenderingSnapshot(
        createNoteFlowRhythmTimeline(this.activeScore, { bpm: this.bpm })
      );
    },
    layout() {
      return createNoteFlowRenderingSnapshot(
        createNoteFlowRhythmStaffLayout(this.renderCycle, this.timeline)
      );
    },
    preparationOffsetX() {
      return this.isPreparing
        ? (1 - this.preparationProgress) * (this.layout.width - this.layout.playLineX) * 0.65
        : 0;
    },
    noteClipX() {
      // Retain the same passed-note boundary while the band approaches on resume.
      return this.layout.noteClipX + this.preparationOffsetX;
    },
    frame() {
      const frame = getNoteFlowRhythmVisualFrame(this.layout, this.timeline,
        this.practiceState ? this.practiceState.elapsedMs : 0);
      // The preparatory approach moves notation only; neither practice clock runs.
      return Object.assign({}, frame, {
        offsetX: frame.offsetX + this.preparationOffsetX
      });
    },
    visibleEvents() {
      return this.layout.events.filter(event => {
        const x = event.x + this.frame.offsetX;
        return x >= this.layout.playLineX - 28 && x <= this.layout.width + 28;
      });
    },
    visibleBeams() {
      return this.layout.beams.filter(beam => (
        beam.x2 + this.frame.offsetX >= this.layout.playLineX - 28
        && beam.x1 + this.frame.offsetX <= this.layout.width + 28
      ));
    },
    visibleBarlines() {
      return this.layout.barlines.filter(bar => (
        bar.x + this.frame.offsetX >= this.layout.playLineX - 28
        && bar.x + this.frame.offsetX <= this.layout.width + 28
      ));
    },
    resultByTick() {
      if (!this.practiceState) return Object.create(null);
      const timeline = this.timeline;
      const results = this.practiceState.results;
      // The practice clock creates a new small state each frame, while these
      // identities change only for an answer, miss, append or trim.
      if (this._resultTimeline === timeline && this._resultValues === results) {
        return this._resultByTick;
      }
      const result = Object.create(null);
      timeline.targets.forEach((target, index) => {
        result[target.startTick] = results[index];
      });
      this._resultTimeline = timeline;
      this._resultValues = results;
      this._resultByTick = result;
      return result;
    },
    isPlaying() {
      return this.practiceState && (this.practiceState.status === "running"
        || this.practiceState.status === "waiting");
    },
    currentTargetStartTick() {
      const target = this.practiceState
        && this.timeline.targets[this.practiceState.targetIndex];
      return target ? target.startTick : null;
    },
    markerTargetKey() {
      const target = this.practiceState && this.timeline.targets[this.practiceState.targetIndex];
      return target ? `${target.startTick}:${target.expectedValues.join(",")}` : null;
    },
    visibleWrongPitchMarkers() {
      return this.displayNote ? this.wrongPitchMarkers.filter(marker => marker.targetKey === this.markerTargetKey) : [];
    },
    groupedWrongPitchMarkers() {
      return groupNoteFlowWrongPitchMarkers(this.visibleWrongPitchMarkers);
    },
    wrongPitchCollisionNotes() {
      return this.groupedWrongPitchMarkers.filter(marker => marker.colliding
        && marker.y >= 8 && marker.y <= this.layout.height - 8)
        .reduce((notes, marker) => notes.concat(marker.notes.map((note, index) => ({
          id: `${marker.id}:${marker.values[index]}`, note
        }))), []);
    },
    wrongPitchRangeHints() {
      let above = 0, below = 0;
      return this.visibleWrongPitchMarkers.filter(marker => marker.y < 8 || marker.y > this.layout.height - 8)
        .map(marker => Object.assign({}, marker, marker.y < 8
          ? { direction: "↑", hintY: 16 + above++ * 17 }
          : { direction: "↓", hintY: this.layout.height - 12 - below++ * 17 }));
    },
    isSharpInput() {
      return !this.activeTonality || !this.activeTonality.signature
        || this.activeTonality.signature.type !== "flat";
    },
    activeTonality() {
      const event = this.timeline.events.find(candidate => (
        candidate.kind === "note"
        && candidate.startTick === this.currentTargetStartTick
      ));
      return getActiveNoteFlowTonality(this.renderCycle, event);
    },
    currentTonalityLabel() {
      const key = this.activeTonality;
      if (!key) return "";
      const tonic = formatNoteFlowTonalityLabel(key, Options.noteNaming);
      return `${tonic} ${this.$t(key.mode === "minor"
        ? "FLOW_KEY_MINOR" : "FLOW_KEY_MAJOR")}`;
    },
    practiceStatusLabel() {
      if (this.isPreparing || !this.practiceState) return this.$t("FLOW_RHYTHM_PRACTICE_READY");
      if (this.practiceState.status === "paused") return this.$t("PAUSED");
      if (this.practiceState.status === "complete") {
        return this.$t("FLOW_RHYTHM_PRACTICE_DONE");
      }
      if (this.practiceState.status === "waiting") {
        return this.$t(this.practiceState.feedback === "wrong"
          ? "FLOW_RHYTHM_PRACTICE_WRONG_WAITING" : "FLOW_RHYTHM_PRACTICE_WAITING");
      }
      if (this.practiceState.feedback === "wrong") {
        return this.$t("FLOW_RHYTHM_PRACTICE_WRONG");
      }
      return this.$t(this.practiceState.status === "running"
        ? "FLOW_RHYTHM_PRACTICE_RUNNING" : "FLOW_RHYTHM_PRACTICE_READY");
    }
  },
  watch: {
    markerTargetKey() { this.pruneWrongPitchMarkers(); },
    displayNote() { this.clearWrongPitchMarkers(); },
    notationFit(value) { this.$emit("display-change", value); },
    cycle() { this.resetPreview(); },
    score() { this.resetPreview(); },
    bpm() { this.resetPreview(); },
    behavior() { this.resetPreview(); },
    inputMode() { this.resetPreview(); }
  },
  mounted() {
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => this.pauseMotion());
    this.resetPreview();
    this.observeDisplay();
  },
  beforeDestroy() {
    this.clearWrongPitchMarkers();
    if (this.displayObserver) this.displayObserver.disconnect();
    if (this.displayWindow) this.displayWindow.removeEventListener("resize", this.measureDisplay);
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    this.cancelPreparation();
    this.stopFrame();
    this.pianoPlayer.stopAll();
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
    showWrongPitchMarker(target, value, inputMode) {
      if (!this.displayNote || !target) return;
      const marker = createNoteFlowWrongPitchMarker({ target, playedValue: value, inputMode,
        pendingValues: this.practiceState.pendingValues, staves: this.layout.staves,
        tonality: this.activeTonality, preferSharp: this.isSharpInput,
        displayKeySignature: this.layout.staves.some(staff => staff.keySignature.length > 0),
        noteNaming: Options.noteNaming });
      if (!marker) {
        this.clearWrongPitchMarkers();
        return;
      }
      const id = `${this.markerTargetKey}:${marker.clef}:${marker.value}`;
      this.removeWrongPitchMarker(id);
      this.wrongPitchMarkers.push(Object.assign({}, marker, { id, targetKey: this.markerTargetKey }));
      if (!this._wrongPitchMarkerTimers) this._wrongPitchMarkerTimers = new Map();
      this._wrongPitchMarkerTimers.set(id, setTimeout(() => this.removeWrongPitchMarker(id), 1000));
    },
    observeDisplay() {
      if (!this.training || !this.$el || !this.$el.ownerDocument) return;
      const view = this.$el.ownerDocument.defaultView;
      if (!view) return;
      this.displayWindow = view;
      view.addEventListener("resize", this.measureDisplay);
      if (view.ResizeObserver) {
        this.displayObserver = new view.ResizeObserver(this.measureDisplay);
        [this.$el, this.$refs.keyRow, this.$refs.practiceStatus, this.$refs.practiceInput]
          .filter(Boolean).forEach(element => this.displayObserver.observe(element));
      }
      this.$nextTick(this.measureDisplay);
    },
    measureDisplay() {
      if (!this.training || this._isDestroyed || this._isBeingDestroyed || !this.$el) return;
      const root = this.$el, view = root.ownerDocument && root.ownerDocument.defaultView;
      if (!view || !view.getComputedStyle || !this.$refs.notationFrame) return;
      const px = value => parseFloat(value) || 0;
      const style = view.getComputedStyle(root);
      const reservedHeight = Array.from(root.children)
        .filter(element => element !== this.$refs.notationFrame)
        .reduce((total, element) => {
          const css = view.getComputedStyle(element);
          return total + element.getBoundingClientRect().height
            + px(css.marginTop) + px(css.marginBottom);
        }, 0);
      const next = {
        stageWidth: root.clientWidth,
        stageHeight: root.clientHeight,
        horizontalInset: px(style.paddingLeft) + px(style.paddingRight),
        verticalInset: px(style.paddingTop) + px(style.paddingBottom),
        reservedHeight
      };
      // Layout measurements never alter the score, practice clock or input mode.
      if (JSON.stringify(next) !== JSON.stringify(this.displayMeasurements)) {
        this.displayMeasurements = next;
      }
    },
    glyphPath(name, x, y, scale) {
      return Glyphs.getPathForSymbol(x, y, name, scale, scale)
        .map(part => part.join(" ")).join("");
    },
    accidentalName(value) {
      return value === "flat" ? "accidentals.flat" : "accidentals.sharp";
    },
    restName(value) {
      return `rests.${value === "eighth" ? "8th"
        : value === "sixteenth" ? "16th"
          : value === "dotted-quarter" ? "quarter" : value}`;
    },
    flagPath(stem, doubleFlag) {
      const up = stem.y2 < stem.y1;
      const direction = up ? 1 : -1;
      const first = `M ${stem.x} ${stem.y2} q ${10 * direction} 2 ${10 * direction} ${13 * direction}`;
      return doubleFlag
        ? `${first} M ${stem.x} ${stem.y2 + 7 * direction} q ${10 * direction} 2 ${10 * direction} ${13 * direction}`
        : first;
    },
    stopFrame() {
      if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    },
    resetPreview() {
      this.clearWrongPitchMarkers();
      this.cancelPreparation();
      this.stopFrame();
      this.pianoPlayer.stopAll();
      this.renderCycle = createNoteFlowRenderingSnapshot(this.cycle);
      this.activeScore = createNoteFlowRenderingSnapshot(this.score);
      this.nextCycleIndex = 1;
      this.continuationState = this.activeScore.nextState || this.renderCycle.nextState;
      this.practiceState = createNoteFlowRhythmPractice(this.timeline, {
        behavior: this.behavior,
        inputMode: this.inputMode === "midi" ? "midi" : "touch"
      });
      this.emitRoundProgress();
    },
    targetResult(event) {
      if (!this.practiceState || event.kind !== "note") return null;
      return this.resultByTick[event.startTick] || null;
    },
    ensureStream() {
      if (!this.training || !this.practiceState || !this.rhythmOptions) return;
      const remaining = this.timeline.durationMs - this.practiceState.elapsedMs;
      const measureMs = this.timeline.measures[0].endMs;
      if (remaining <= measureMs * 2) {
        const cycle = generateNoteFlowCycle(this.renderCycle.config,
          this.nextCycleIndex, this.continuationState);
        this.nextCycleIndex += 1;
        const next = generateNoteFlowRhythmicScore(cycle,
          Object.assign({}, this.rhythmOptions, {
            measureCount: STREAM_MEASURES,
            restChance: 0.12
          }));
        this.continuationState = createNoteFlowRenderingSnapshot(next.nextState || cycle.nextState);
        this.activeScore = createNoteFlowRenderingSnapshot(Object.assign({}, this.activeScore, {
          measures: this.activeScore.measures.concat(next.measures)
        }));
        this.practiceState = rebaseNoteFlowRhythmPractice(
          this.practiceState, this.timeline
        );
      }
      if (this.activeScore.measures.length > STREAM_MEASURES * 3
        && this.practiceState.elapsedMs
          > this.timeline.measures[RETAIN_MEASURES - 1].endMs + measureMs) {
        const shiftMs = this.timeline.measures[RETAIN_MEASURES - 1].endMs;
        this.activeScore = createNoteFlowRenderingSnapshot(Object.assign({}, this.activeScore, {
          measures: this.activeScore.measures.slice(RETAIN_MEASURES)
        }));
        this.practiceState = rebaseNoteFlowRhythmPractice(
          this.practiceState, this.timeline, shiftMs
        );
      }
    },
    emitRoundProgress() {
      if (!this.training || !this.practiceState) return;
      const state = this.practiceState;
      const attempts = state.correctCount + state.wrongCount + state.missedCount;
      this.$emit("round-progress", {
        correct: state.correctCount,
        correctFirstTry: state.correctFirstTryCount,
        wrong: state.wrongCount,
        missed: state.missedCount,
        accuracy: attempts ? Math.round(state.correctCount / attempts * 100) : 0,
        precise: state.preciseEventCount,
        early: state.earlyAttemptCount,
        late: state.lateAttemptCount,
        totalAbsoluteTimingOffsetMs: state.totalAbsoluteTimingOffsetMs
      });
    },
    updateFrame(now) {
      this.ensureStream();
      const before = this.practiceState.missedCount;
      this.practiceState = advanceNoteFlowRhythmPractice(
        this.practiceState, Math.max(0, now - this.lastFrameAt)
      );
      this.lastFrameAt = now;
      this.pruneWrongPitchMarkers();
      if (this.practiceState.missedCount !== before) this.emitRoundProgress();
      this.frameRequest = this.practiceState.status === "running"
        ? requestAnimationFrame(this.updateFrame) : null;
    },
    submitTouch(value) {
      this.submitInput(value, "touch");
    },
    gripColor(event) {
      return this.practiceState && event.kind === "note" && event.startTick === this.currentTargetStartTick
        ? heldNoteGripColor(this.practiceState.grip,event.note.value) : "";
    },
    releaseMidi(value) {
      this.practiceState=releaseNoteFlowRhythmPracticeInput(this.practiceState,value);
    },
    submitMidi(value) {
      if (this.midiConnected) this.submitInput(value, "midi");
    },
    handleMidiConnection(connected) {
      this.midiConnected = connected === true;
      if (!this.midiConnected) this.pauseMotion();
      this.$emit("connection-change", this.midiConnected);
    },
    submitInput(value, inputMode) {
      if (this.isPreparing || !this.isPlaying || !this.practiceState) return;
      const now = performance.now();
      this.ensureStream();
      if (this.isPlaying) {
        this.practiceState = advanceNoteFlowRhythmPractice(
          this.practiceState, Math.max(0, now - this.lastFrameAt)
        );
      }
      this.lastFrameAt = now;
      this.pruneWrongPitchMarkers();
      const target = this.timeline.targets[this.practiceState.targetIndex];
      if (target) {
        const audible = inputMode === "midi" ? value
          : getNoteFlowTouchAudioValue(target.expectedValues,
            this.practiceState.pendingValues, value);
        this.pianoPlayer.play(audible, Options.appVolume);
        this.showWrongPitchMarker(target, value, inputMode);
      }
      this.practiceState = submitNoteFlowRhythmPracticeInput(
        this.practiceState, value, inputMode
      );
      this.pruneWrongPitchMarkers();
      this.emitRoundProgress();
      if (this.practiceState.status === "running" && this.frameRequest === null) {
        this.frameRequest = requestAnimationFrame(this.updateFrame);
      }
    },
    cancelPreparation() {
      if (!this.isPreparing) return;
      this.stopFrame();
      this.isPreparing = false;
      this.preparationProgress = 1;
      if (this.training) this.$emit("preparation-change", false);
    },
    beginMotion() {
      if (this._isDestroyed || !this.practiceState) return;
      const wasPaused = this.practiceState.status === "paused";
      this.practiceState = wasPaused
        ? resumeNoteFlowRhythmPractice(this.practiceState)
        : startNoteFlowRhythmPractice(this.practiceState);
      if (this.training) this.$emit(wasPaused ? "round-resume" : "round-start");
      this.lastFrameAt = performance.now();
      if (this.practiceState.status === "running") {
        this.frameRequest = requestAnimationFrame(this.updateFrame);
      }
    },
    updatePreparation(now) {
      if (!this.isPreparing || this._isDestroyed) return;
      if (this.preparationStartedAt === null) this.preparationStartedAt = now;
      this.preparationProgress = Math.min(1, Math.max(0,
        (now - this.preparationStartedAt) / this.preparationDurationMs));
      if (this.preparationProgress >= 1) {
        this.frameRequest = null;
        this.isPreparing = false;
        this.$emit("preparation-change", false);
        this.beginMotion();
      } else {
        this.frameRequest = requestAnimationFrame(this.updatePreparation);
      }
    },
    togglePreview() {
      if (this.isPreparing || this.isPlaying) {
        this.pauseMotion();
        return;
      }
      if (!this.training && window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      if (this.inputMode === "midi" && !this.midiConnected) return;
      // Unlock Web Audio in the Play/Resume gesture, before the visual approach.
      AudioSync.resume();
      if (!this.practiceState || this.practiceState.status === "complete") {
        this.resetPreview();
        if (this.training) this.$emit("round-reset");
      }
      const durationMs = this.training
        ? normalizePreparationSeconds(Options.preparationSeconds) * 1000 : 0;
      if (durationMs === 0) {
        this.beginMotion();
        return;
      }
      this.stopFrame();
      this.preparationDurationMs = durationMs;
      // Mobile WebViews can paint late after a cold start. Begin the approach
      // on its first frame so rendering work cannot consume the preparation.
      this.preparationStartedAt = null;
      this.preparationProgress = 0;
      this.isPreparing = true;
      this.$emit("preparation-change", true);
      this.frameRequest = requestAnimationFrame(this.updatePreparation);
    },
    toggleMotion() { this.togglePreview(); },
    pauseMotion() {
      this.clearWrongPitchMarkers();
      if (!this.isPreparing && !this.isPlaying) return;
      if (!this.isPreparing && this.isPlaying) {
        const now = performance.now();
        this.practiceState = advanceNoteFlowRhythmPractice(this.practiceState, Math.max(0,now-this.lastFrameAt));
        this.lastFrameAt = now;
      }
      this.cancelPreparation();
      this.stopFrame();
      this.practiceState = this.practiceState.status === "ready"
        ? Object.assign({}, this.practiceState, { status: "paused", resumeStatus: "running" })
        : pauseNoteFlowRhythmPractice(this.practiceState);
      this.pianoPlayer.stopAll();
      if (this.training) this.$emit("round-pause");
    },
    resumeMotion() {
      if (this.practiceState && this.practiceState.status === "paused") {
        this.togglePreview();
      }
    },
    finishMotion() {
      this.clearWrongPitchMarkers();
      this.cancelPreparation();
      this.stopFrame();
      this.pianoPlayer.stopAll();
      if (this.practiceState) {
        this.practiceState = Object.assign({}, this.practiceState, {
          status: "complete"
        });
      }
      this.emitRoundProgress();
    }
  }
};
</script>

<style scoped>
.wrong-pitch-marker { pointer-events: none; }
.wrong-pitch-dot { fill: #1267d6; stroke: #f7fbff; stroke-width: 1.3; }
.wrong-pitch-ledger { stroke: #1267d6; stroke-width: 1.2; }
.wrong-pitch-accidental { fill: #1267d6; }
.wrong-pitch-range-background { fill: #edf5ff; stroke: #b6d1f3; stroke-width: 1; }
.wrong-pitch-range-label { fill: #1267d6; font-size: 10px; font-weight: 750; }
.rhythm-practice-status.has-pitch-collision { flex-wrap: wrap; }
.wrong-pitch-collision-hint { display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 4px 8px; color: #1267d6; font-size: 11px; line-height: 1.4; }
.wrong-pitch-collision-note { padding: 1px 6px; border-radius: 5px; background: #edf5ff; }
.rhythm-preview {
  padding: 12px;
  border: 1px solid rgba(45, 110, 123, 0.17);
  border-radius: 16px;
  background: rgba(240, 248, 249, 0.84);
}
.rhythm-preview.is-training {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: rgba(240, 248, 249, 0.55);
}
.rhythm-preview.is-training .rhythm-preview-frame {
  margin-top: 0;
}
.rhythm-preview-heading {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #356d77;
  font-size: 11px;
}
.rhythm-preview-heading span { color: #6d8186; }
.rhythm-training-key {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: #356d77;
  font-size: 11px;
}
.rhythm-training-key strong { color: #245e6c; }
.rhythm-preview-frame {
  overflow: hidden;
  margin-top: 10px;
  border-radius: 12px;
  background: #fff;
}
.rhythm-preview-frame svg { display: block; width: 100%; }
.is-training .rhythm-preview-frame { margin-right: auto; margin-left: auto; }
.rhythm-midi-details summary { cursor: pointer; }
@media (min-width: 620px) and (max-height: 500px) {
  .rhythm-preview.is-training { padding: 6px; }
  .is-training .rhythm-training-key { margin-bottom: 6px; }
  .is-training .rhythm-practice-status { margin-top: 6px; flex-wrap: wrap; gap: 2px 10px; }
  .is-training .rhythm-practice-input { margin-top: 6px; }
}
.rhythm-staff-line, .rhythm-ledger { stroke: #354e54; stroke-width: 1.1; }
.rhythm-clef, .rhythm-note-head, .rhythm-stem, .rhythm-flag,
.rhythm-rest, .rhythm-accidental, .rhythm-dot { fill: #233b42; }
.rhythm-stem, .rhythm-flag { fill: none; stroke: #233b42; stroke-width: 1.3; }
.rhythm-beam { stroke: #233b42; stroke-width: 3.7; stroke-linecap: square; }
.rhythm-note-head.hollow { fill: #fff; stroke: #233b42; stroke-width: 1.5; }
.rhythm-barline { stroke: #9fb0b4; stroke-width: 1.1; }
.rhythm-time-signature {
  fill: #233b42;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 18px;
  font-weight: 700;
  text-anchor: middle;
}
.rhythm-play-line { stroke: #e76530; stroke-width: 2.3; }
.rhythm-preview-play {
  min-height: 44px;
  margin-top: 10px;
  padding: 0 16px;
  border: 1px solid #2d7b88;
  border-radius: 12px;
  background: #e6f4f6;
  color: #286674;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}
.rhythm-current .rhythm-note-head { stroke: #e76530; stroke-width: 2; }
.rhythm-correct .rhythm-note-head { fill:#25864b; stroke:#25864b; stroke-width:2; }
.rhythm-correct .rhythm-note-head.hollow { fill:#fff; }
.rhythm-wrong .rhythm-note-head { stroke: #b34036; stroke-width: 2; }
.rhythm-missed .rhythm-note-head { stroke: #879599; stroke-width: 2; }
.grip-held .rhythm-note-head { fill:#25864b; stroke:#25864b; stroke-width:2; }
.grip-found .rhythm-note-head { fill:#929b9e; stroke:#929b9e; stroke-width:2; }
.grip-held .rhythm-note-head.hollow,.grip-found .rhythm-note-head.hollow { fill:#fff; }
.rhythm-practice-status {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  color: #356d77;
  font-size: 11px;
}
.rhythm-practice-input { margin-top: 10px; }
</style>
