<template>
  <div class="sense-dense-score">
    <div ref="scroller" class="sense-dense-scroll app-focus-ring" tabindex="0" :aria-label="$t('RHYTHM_NOTATION')">
      <svg class="sense-dense-svg" :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
        role="img" :aria-label="$t('RHYTHM_NOTATION')" focusable="false">
        <line x1="16" :x2="layout.width - 16" :y1="layout.headY" :y2="layout.headY" class="dense-staff" />
        <line x1="30" x2="30" y1="62" y2="98" class="dense-percussion" />
        <line x1="39" x2="39" y1="62" y2="98" class="dense-percussion" />
        <text x="69" y="74" class="dense-meter">{{layout.numerator}}</text>
        <text x="69" y="102" class="dense-meter">{{layout.denominator}}</text>
        <line :x1="layout.width - 16" :x2="layout.width - 16" y1="60" y2="100" class="dense-barline" />
        <line v-if="following" :x1="playheadX" :x2="playheadX" y1="16" y2="117" class="dense-playhead" />
        <g v-for="note in layout.notes" :key="note.id"
          :class="['dense-event', resultClass(note.index), { 'is-active': activeEvent === note.id }]">
          <circle v-if="activeEvent === note.id" :cx="note.x" :cy="layout.headY" r="15" class="dense-active-ring" />
          <ellipse :cx="note.x" :cy="layout.headY" rx="8" ry="5.5"
            :transform="`rotate(-16 ${note.x} ${layout.headY})`" :class="['dense-head', { hollow: note.hollow }]" />
          <circle v-if="note.dotted" :cx="note.x + 15" :cy="layout.headY - 1" r="2" class="dense-dot" />
          <line v-if="note.stem" :x1="note.x + layout.stemOffset" :x2="note.x + layout.stemOffset"
            :y1="layout.headY - 1" :y2="layout.stemTop" class="dense-stem" />
          <text :x="note.x" y="135" class="dense-value">{{note.label}}</text>
        </g>
        <line v-for="beam in layout.beams" :key="beam.id" :data-level="beam.level"
          :x1="beam.x1" :x2="beam.x2" :y1="beam.y" :y2="beam.y" class="dense-beam" />
        <path v-for="flag in layout.flags" :key="flag.id" :data-level="flag.level" :d="flag.path" class="dense-flag" />
        <circle v-for="marker in visibleMarkers" :key="marker.id" :cx="marker.x" cy="108" r="4"
          :class="['dense-tap-marker', 'result-' + marker.result]" />
      </svg>
    </div>
  </div>
</template>

<script>
import { createRhythmSenseDenseLayout, rhythmDenseXAtBeat, rhythmDenseTapMarkerX } from "../model/RhythmSenseDenseLayout";

export default {
  name: "RhythmSenseDenseScore",
  props: {
    events: { type: Array, default: () => [] },
    meter: { type: String, default: "4/4" },
    results: { type: Array, default: () => [] },
    activeEvent: { type: [Number, String], default: -1 },
    tapMarkers: { type: Array, default: () => [] },
    bpm: { type: Number, default: 80 },
    phase: { type: String, default: "idle" },
    playheadBeat: { type: Number, default: 0 }
  },
  computed: {
    layout() { return createRhythmSenseDenseLayout(this.events, this.meter); },
    following() { return this.phase === "preview" || this.phase === "practice"; },
    playheadX() { return rhythmDenseXAtBeat(this.layout, this.playheadBeat); },
    visibleMarkers() {
      return this.tapMarkers.map(marker => Object.assign({}, marker, { x: rhythmDenseTapMarkerX(this.layout, marker, this.bpm) }))
        .filter(marker => marker.x !== null);
    }
  },
  watch: {
    events() { this.resetScroll(); },
    meter() { this.resetScroll(); },
    phase(value) {
      if (value === "idle" || value === "countin") this.resetScroll();
      else this.scheduleFollow();
    },
    playheadBeat() { this.scheduleFollow(); }
  },
  mounted() {
    this.followFrame = null;
    this.destroyed = false;
    window.addEventListener("resize", this.scheduleFollow);
    this.scheduleFollow();
  },
  beforeDestroy() {
    this.destroyed = true;
    if (this.followFrame !== null) cancelAnimationFrame(this.followFrame);
    window.removeEventListener("resize", this.scheduleFollow);
  },
  methods: {
    resultClass(index) { return this.results[index] ? "result-" + this.results[index] : ""; },
    resetScroll() {
      if (this.followFrame !== null) cancelAnimationFrame(this.followFrame);
      this.followFrame = null;
      if (this.$refs.scroller) this.$refs.scroller.scrollLeft = 0;
    },
    scheduleFollow() {
      if (this.destroyed || !this.following || this.followFrame != null) return;
      this.followFrame = requestAnimationFrame(() => {
        this.followFrame = null;
        if (!this.destroyed) this.followPlayhead();
      });
    },
    followPlayhead() {
      const scroller = this.$refs.scroller;
      if (!scroller || !this.following || !scroller.clientWidth) return;
      const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      if (!maximum) return;
      // A forward dead band keeps the audible target visible without bouncing
      // between consecutive notes or undoing the user's backward inspection.
      if (this.playheadX > scroller.scrollLeft + scroller.clientWidth * 0.72) {
        scroller.scrollLeft = Math.min(maximum, Math.max(scroller.scrollLeft,
          this.playheadX - scroller.clientWidth * 0.38));
      }
    }
  }
};
</script>

<style scoped>
.sense-dense-score { width: 100%; min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box; }
.sense-dense-scroll { width: 100%; min-width: 0; max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; border-radius: 10px; }
.sense-dense-svg { display: block; max-width: none; color: #34505a; }
.dense-staff { stroke: #9eafb4; stroke-width: 1.2; }
.dense-percussion { stroke: #34505a; stroke-width: 4; }
.dense-meter { fill: #34505a; font: 700 24px Georgia, serif; text-anchor: middle; }
.dense-barline { stroke: #607c85; stroke-width: 1.8; }
.dense-head, .dense-dot { fill:var(--sense-note-ink,#151515); }
.dense-head { stroke:var(--sense-note-ink,#151515); stroke-width:1.8; }
.dense-head.hollow { fill:#fff; }
.dense-stem { stroke:var(--sense-note-ink,#151515); stroke-width:1.5; }
.dense-beam { stroke:var(--sense-note-ink,#151515); stroke-width:4; stroke-linecap:butt; }
.dense-flag { fill:none; stroke:var(--sense-note-ink,#151515); stroke-width:2.8; stroke-linecap:round; }
.dense-value { fill: #667f88; font: 500 10px system-ui, sans-serif; text-anchor: middle; }
.dense-active-ring { fill: #f8e1cd; stroke: #d86b36; stroke-width: 1.4; }
.dense-event.result-correct .dense-head { stroke:var(--sense-correct,#247047); stroke-width:3; }
.dense-event.result-early .dense-head { stroke:var(--sense-early,#895c16); stroke-width:3; }
.dense-event.result-late .dense-head { stroke:var(--sense-late,#a63e32); stroke-width:3; }
.dense-event.result-missed .dense-head { stroke:var(--sense-missed,#53646c); stroke-width:3; }
.dense-playhead { stroke: #df6b3b; stroke-width: 1.5; opacity: .45; }
.dense-tap-marker { fill: #698a98; stroke: #fffaf4; stroke-width: 1.5; }
.dense-tap-marker.result-correct { fill:var(--sense-correct,#247047); }
.dense-tap-marker.result-early { fill:var(--sense-early,#895c16); }
.dense-tap-marker.result-late { fill:var(--sense-late,#a63e32); }
.dense-tap-marker.result-missed, .dense-tap-marker.result-extra { fill:var(--sense-missed,#53646c); }
</style>
