<template>
  <div class="chord-rhythm-stream" :class="{ 'fits-stage': fitHeight, 'has-pitch-collision': wrongPitchCollisionNotes.length > 0 }">
    <svg :viewBox="`0 0 ${viewWidth} ${layout.height}`" :style="notationStyle" role="img"
      :aria-label="$t('FLOW_CHORD_STREAM_ARIA')" focusable="false">
      <defs><clipPath id="chord-rhythm-live-clip">
        <rect :x="noteClipX" y="0" :width="Math.max(0, viewWidth - noteClipX)"
          :height="layout.height" />
      </clipPath></defs>
      <g v-for="staff in layout.staves" :key="staff.clef">
        <line v-for="(y, index) in staff.lineYs" :key="index" class="staff-line"
          x1="18" :x2="viewWidth - 8" :y1="y" :y2="y" />
        <path class="symbol" :d="glyphPath(staff.clef === 'bass' ? 'clefs.F' : 'clefs.G',
          28, staff.clefY, staff.clef === 'bass' ? 1.15 : 1.05)" />
        <path v-for="(signature, index) in staff.keySignature" :key="index"
          class="symbol" :d="glyphPath(`accidentals.${signature.glyph}`,
            signature.x, signature.y, .82)" />
        <text class="time-signature" :x="layout.timeSignatureX"
          :y="staff.lineYs[2] - 2">{{layout.timeSignature.numerator}}</text>
        <text class="time-signature" :x="layout.timeSignatureX"
          :y="staff.lineYs[4] - 2">{{layout.timeSignature.denominator}}</text>
      </g>
      <line class="play-line" :class="{ wrong: practiceState.feedback === 'wrong' }"
        :x1="playLineX" :x2="playLineX" y1="8" :y2="layout.height - 8" />
      <g clip-path="url(#chord-rhythm-live-clip)">
        <g :transform="`translate(${offsetX} 0)`">
          <line v-for="bar in visibleBarlines" :key="bar.index" class="barline"
            :x1="bar.x" :x2="bar.x" :y1="layout.staves[0].lineYs[0]"
            :y2="layout.staves[layout.staves.length - 1].lineYs[4]" />
          <line v-for="(beam, index) in visibleBeams" :key="index" class="beam"
            :x1="beam.x1" :x2="beam.x2" :y1="beam.y" :y2="beam.y" />
          <g v-for="event in visibleEvents" :key="event.id"
            :transform="`translate(${event.x} 0)`"
            :class="{
              'is-correct': resultAt(event) === 'correct'
                || (practiceState.behavior === 'wait' && resultAt(event) === 'late'),
              'is-wrong': resultAt(event) === 'early'
                || (practiceState.behavior !== 'wait' && resultAt(event) === 'late'),
              'is-missed': resultAt(event) === 'missed',
              'is-pending': currentTick === event.globalStartTick
                && practiceState.pendingValues.length > 0
            }">
            <g v-for="part in event.parts" :key="part.clef">
              <template v-if="event.kind === 'note'">
                <g v-for="(head, index) in part.heads" :key="index" :data-note-value="head.value"
                  :class="{ 'grip-held': gripColor(event,head) === 'held', 'grip-found': gripColor(event,head) === 'found' }">
                  <line v-for="(y, lineIndex) in head.ledgerLineYs" :key="lineIndex"
                    class="ledger-line" :x1="head.offsetX - 11"
                    :x2="head.offsetX + 11" :y1="y" :y2="y" />
                  <path v-if="head.accidental" class="symbol"
                    :d="glyphPath(`accidentals.${head.accidental}`,
                      -19 - index * 9, head.y, .8)" />
                  <ellipse class="note-head"
                    :class="{
                      hollow: event.noteValue === 'whole' || event.noteValue === 'half',
                      'is-entered': isEnteredHead(event, head)
                    }"
                    :cx="head.offsetX" :cy="head.y" rx="7" ry="5"
                    :transform="`rotate(-14 ${head.offsetX} ${head.y})`" />
                  <circle v-if="event.dots" class="dot" :cx="head.offsetX + 12"
                    :cy="head.y - 2" r="1.6" />
                </g>
                <line v-if="part.stem" class="stem" :x1="part.stem.x"
                  :x2="part.stem.x" :y1="part.stem.y1" :y2="part.stem.y2" />
                <path v-if="part.stem && !part.beamed
                  && (event.noteValue === 'eighth' || event.noteValue === 'sixteenth')"
                  class="flag" :d="flagPath(part.stem, event.noteValue === 'sixteenth')" />
              </template>
              <template v-else>
                <path class="symbol" :d="glyphPath(restName(event.noteValue), -4,
                  part.restY, 1)" />
                <circle v-if="event.dots" class="dot" cx="9"
                  :cy="part.restY - 3" r="1.6" />
              </template>
            </g>
          </g>
        </g>
      </g>
      <g v-for="marker in groupedWrongPitchMarkers" :key="marker.id"
        v-if="marker.y >= 8 && marker.y <= layout.height - 8"
        class="wrong-pitch-marker" :transform="`translate(${playLineX} 0)`">
        <title>{{$t('FLOW_WRONG_PITCH_MARKER_VALUE', { note: marker.note })}}</title>
        <line v-for="(y, index) in marker.ledgerLineYs" :key="index"
          class="wrong-pitch-ledger" x1="-7" x2="7" :y1="y" :y2="y" />
        <path v-if="marker.accidental" class="wrong-pitch-accidental"
          :d="glyphPath(`accidentals.${marker.accidental}`, -16, marker.y, 0.7)" />
        <circle class="wrong-pitch-dot" cx="0" :cy="marker.y" r="3.5" />
      </g>
      <g v-for="hint in wrongPitchRangeHints" :key="hint.id + '-range'" class="wrong-pitch-marker">
        <title>{{$t('FLOW_WRONG_PITCH_MARKER_VALUE', { note: hint.note })}}</title>
        <rect class="wrong-pitch-range-background" :x="playLineX + 8" :y="hint.hintY - 10"
          :width="hint.note.length * 7 + 24" height="16" rx="5" />
        <text class="wrong-pitch-range-label" :x="playLineX + 14" :y="hint.hintY">{{hint.direction}} {{hint.note}}</text>
      </g>
    </svg>
    <div v-if="wrongPitchCollisionNotes.length" class="wrong-pitch-collision-hint" role="status" :aria-label="$t('FLOW_WRONG_PITCH_MARKERS')">
      <span v-for="note in wrongPitchCollisionNotes" :key="note.id" class="wrong-pitch-collision-note">{{note.note}}</span>
    </div>
  </div>
</template>

<script>
import { heldNoteGripColor } from "../model/HeldNoteGrip";
import Glyphs from "abcjs/src/write/creation/glyphs";
import { createNoteFlowChordRhythmLayout } from "../model/NoteFlowChordRhythmLayout";
import { TICKS_PER_QUARTER } from "../model/NoteFlowRhythm";
import { NOTE_FLOW_STAFF_WIDTH, NOTE_FLOW_PLAY_LINE_X } from "../model/NoteFlowStaffLayout";
import { fitNoteFlowNotation } from "../model/NoteFlowDisplayConstraints";
import { createNoteFlowWrongPitchMarker, groupNoteFlowWrongPitchMarkers } from "../model/NoteFlowWrongPitchMarkers";
import Options from "../model/Options";

export default {
  name: "NoteFlowChordRhythmStream",
  props: {
    score: { type: Object, required: true },
    elapsedMs: { type: Number, default: 0 },
    preparationProgress: { type: Number, default: 1 },
    fitHeight: { type: Boolean, default: false },
    practiceState: { type: Object, required: true },
    wrongPitchMarkers: { type: Array, default: () => [] },
    tonality: { type: Object, default: null }
  },
  data() { return { stageWidth: 0, stageHeight: 0 }; },
  computed: {
    renderedWrongPitchMarkers() {
      return this.wrongPitchMarkers.map(marker => {
        const rendered = createNoteFlowWrongPitchMarker({ target: marker.target, playedValue: marker.value,
          inputMode: "midi", staves: this.layout.staves, tonality: this.tonality,
          displayKeySignature: !!this.tonality, preferSharp: !this.tonality || this.tonality.fifths >= 0,
          noteNaming: Options.noteNaming });
        return rendered ? Object.assign({}, rendered, { id: marker.id }) : null;
      }).filter(Boolean);
    },
    groupedWrongPitchMarkers() {
      return groupNoteFlowWrongPitchMarkers(this.renderedWrongPitchMarkers);
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
      return this.renderedWrongPitchMarkers.filter(marker => marker.y < 8 || marker.y > this.layout.height - 8)
        .map(marker => Object.assign({}, marker, marker.y < 8
          ? { direction: "↑", hintY: 16 + above++ * 17 }
          : { direction: "↓", hintY: this.layout.height - 12 - below++ * 17 }));
    },
    notationFit() {
      return fitNoteFlowNotation({ stageWidth: this.stageWidth, stageHeight: this.stageHeight,
        intrinsicWidth: this.viewWidth, intrinsicHeight: this.layout.height,
        horizontalInset: 2, verticalInset: 2 });
    },
    notationStyle() {
      return this.fitHeight && this.notationFit.measured
        ? { "--notation-width": `${this.notationFit.width}px`, "--notation-height": `${this.notationFit.height}px` } : null;
    },
    viewWidth() { return NOTE_FLOW_STAFF_WIDTH; },
    playLineX() { return Math.max(NOTE_FLOW_PLAY_LINE_X, this.layout.timeSignatureX + 30); },
    layout() {
      return createNoteFlowChordRhythmLayout(this.score, {
        measureCount: this.score.measures.length,
        tonality: this.tonality,
        displayKeySignature: !!this.tonality,
        preferSharp: !this.tonality || this.tonality.fifths >= 0
      });
    },
    currentTick() {
      const target = this.practiceState.timeline.targets[this.practiceState.targetIndex];
      return target ? target.startTick : null;
    },
    preparationOffsetX() {
      return (1 - this.preparationProgress) * (this.viewWidth - this.playLineX) * 0.65;
    },
    noteClipX() {
      return this.playLineX - 12 + this.preparationOffsetX;
    },
    offsetX() {
      const tick = this.elapsedMs * this.score.bpm * this.score.meter.pulseTicks / 60000;
      return this.playLineX - this.layout.firstNoteX
        - tick / TICKS_PER_QUARTER * this.layout.pixelsPerQuarter
        + this.preparationOffsetX;
    },
    visibleEvents() {
      return this.layout.events.filter(event => event.x + this.offsetX >= this.playLineX - 28
        && event.x + this.offsetX <= this.viewWidth + 28);
    },
    visibleBeams() {
      return this.layout.beams.filter(beam => beam.x2 + this.offsetX >= this.playLineX - 28
        && beam.x1 + this.offsetX <= this.viewWidth + 28);
    },
    visibleBarlines() {
      return this.layout.barlines.filter(bar => bar.x + this.offsetX >= this.playLineX - 28
        && bar.x + this.offsetX <= this.viewWidth + 28);
    },
    resultByTick() {
      const results = Object.create(null);
      this.practiceState.timeline.targets.forEach((target, index) => {
        results[target.startTick] = this.practiceState.results[index];
      });
      return results;
    }
  },
  watch: {
    notationFit(value) { if (this.fitHeight) this.$emit("notation-fit", value); }
  },
  mounted() {
    if (!this.fitHeight) return;
    this.measureStage();
    if (typeof ResizeObserver !== "undefined") {
      this.stageObserver = new ResizeObserver(() => this.measureStage());
      this.stageObserver.observe(this.$el);
    }
    window.addEventListener("resize", this.measureStage);
  },
  beforeDestroy() {
    if (this.stageObserver) this.stageObserver.disconnect();
    if (this.fitHeight) window.removeEventListener("resize", this.measureStage);
  },
  methods: {
    measureStage() {
      this.stageWidth = this.$el.offsetWidth;
      this.stageHeight = this.$el.offsetHeight;
    },
    resultAt(event) { return event.kind === "note" ? this.resultByTick[event.globalStartTick] : null; },
    gripColor(event, head) {
      return event.kind === "note" && event.globalStartTick === this.currentTick
        ? heldNoteGripColor(this.practiceState.grip,head.value) : "";
    },
    isEnteredHead(event, head) {
      return event.kind === "note" && event.globalStartTick === this.currentTick
        && this.practiceState.pendingValues.includes(head.value);
    },
    glyphPath(name, x, y, scale) {
      return Glyphs.getPathForSymbol(x, y, name, scale, scale)
        .map(part => part.join(" ")).join("");
    },
    restName(value) {
      return `rests.${value === "eighth" ? "8th"
        : value === "sixteenth" ? "16th" : value}`;
    },
    flagPath(stem, doubleFlag) {
      const direction = stem.up ? 1 : -1;
      const first = `M ${stem.x} ${stem.y2} q ${10 * direction} 2 ${10 * direction} ${13 * direction}`;
      return doubleFlag
        ? `${first} M ${stem.x} ${stem.y2 + 7 * direction} q ${10 * direction} 2 ${10 * direction} ${13 * direction}`
        : first;
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
.wrong-pitch-collision-hint { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 4px 8px; padding: 4px 8px; color: #1267d6; font-size: 11px; line-height: 1.4; }
.wrong-pitch-collision-note { padding: 1px 6px; border-radius: 5px; background: #edf5ff; }
.fits-stage.has-pitch-collision { display: flex; flex-direction: column; }
.fits-stage.has-pitch-collision svg { flex: 1 1 0; min-height: 0; }
.chord-rhythm-stream { margin: 14px 0; overflow: hidden; border: 1px solid rgba(45,113,128,.18); border-radius: 18px; background: rgba(255,255,255,.88); }
svg { display: block; width: 100%; height: auto !important; }
.fits-stage { min-height: 0; height: 100%; overflow: auto; box-sizing: border-box; }
.fits-stage svg { width: var(--notation-width,100%); max-width: none; height: var(--notation-height,100%) !important; margin: 0 auto; }
.staff-line,.ledger-line { stroke: #24464e; stroke-width: 1.15; }
.barline { stroke: #71878b; stroke-width: 1.2; }
.symbol,.note-head,.dot { fill: #24464e; }
.note-head.hollow { fill: #fff; stroke: #24464e; stroke-width: 1.8; }
.time-signature { fill: #24464e; font-size: 18px; font-weight: 800; text-anchor: middle; }
.stem { stroke: #24464e; stroke-width: 1.25; }
.beam { stroke: #24464e; stroke-width: 4; }
.flag { fill: none; stroke: #24464e; stroke-width: 2; stroke-linecap: round; }
.play-line { stroke: #e95e2e; stroke-width: 3; }
.play-line.wrong { stroke: #c93d33; stroke-width: 5; }
.is-correct .note-head { fill:#25864b; stroke:#25864b; stroke-width:2.5; }
.is-correct .note-head.hollow { fill:#fff; }
.is-wrong .note-head,.is-missed .note-head { stroke: #bd4434; stroke-width: 2.5; }
.grip-held .note-head { fill:#25864b; stroke:#25864b; stroke-width:2.5; }
.grip-found .note-head { fill:#929b9e; stroke:#929b9e; stroke-width:2.5; }
.grip-held .note-head.hollow,.grip-found .note-head.hollow { fill:#fff; }
</style>
