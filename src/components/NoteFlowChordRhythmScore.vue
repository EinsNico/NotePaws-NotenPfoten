<template>
  <div class="chord-rhythm-score">
    <strong v-if="showHeading">{{$t('FLOW_CHORD_RHYTHM_PREVIEW')}}</strong>
    <div ref="scoreScroll" class="score-scroll">
      <svg :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :style="{ width: `${layout.width}px` }" role="img"
        :aria-label="$t(measureCount === 2 ? 'FLOW_CHORD_RHYTHM_SCORE_ARIA' : 'FLOW_ALGORITHM_SCORE_ARIA')" focusable="false">
        <g v-for="staff in layout.staves" :key="staff.clef">
          <line v-for="(y, index) in staff.lineYs" :key="index"
            class="staff-line" x1="18" :x2="layout.width - 8" :y1="y" :y2="y" />
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
        <line v-for="bar in layout.barlines" :key="bar.index"
          class="barline" :x1="bar.x" :x2="bar.x"
          :y1="layout.staves[0].lineYs[0]"
          :y2="layout.staves[layout.staves.length - 1].lineYs[4]" />
        <line v-for="(beam, index) in layout.beams" :key="index"
          class="beam" :x1="beam.x1" :x2="beam.x2" :y1="beam.y" :y2="beam.y" />
        <g v-for="event in layout.events" :key="event.id"
          :class="{ 'is-playing': isActive(event) }"
          :transform="`translate(${event.x} 0)`">
          <g v-for="part in event.parts" :key="part.clef">
            <template v-if="event.kind === 'note'">
              <g v-for="(head, index) in part.heads" :key="index">
                <line v-for="(y, lineIndex) in head.ledgerLineYs" :key="lineIndex"
                  class="ledger-line" :x1="head.offsetX - 11"
                  :x2="head.offsetX + 11" :y1="y" :y2="y" />
                <path v-if="head.accidental" class="symbol"
                  :d="glyphPath(`accidentals.${head.accidental}`,
                    -19 - index * 9, head.y, .8)" />
                <ellipse class="note-head"
                  :class="{ hollow: event.noteValue === 'whole' || event.noteValue === 'half' }"
                  :cx="head.offsetX" :cy="head.y" rx="7" ry="5"
                  :transform="`rotate(-14 ${head.offsetX} ${head.y})`" />
                <circle v-if="event.dots" class="dot" :cx="head.offsetX + 12"
                  :cy="head.y - 2" r="1.6" />
              </g>
              <line v-if="part.stem" class="stem"
                :x1="part.stem.x" :x2="part.stem.x"
                :y1="part.stem.y1" :y2="part.stem.y2" />
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
      </svg>
    </div>
  </div>
</template>

<script>
import Glyphs from "abcjs/src/write/creation/glyphs";
import { createNoteFlowChordRhythmLayout } from "../model/NoteFlowChordRhythmLayout";

export default {
  name: "NoteFlowChordRhythmScore",
  props: {
    score: { type: Object, required: true },
    tonality: { type: Object, default: null },
    activeChordId: { type: String, default: null },
    measureCount: { type: Number, default: 2 },
    showHeading: { type: Boolean, default: true }
  },
  computed: {
    layout() {
      return createNoteFlowChordRhythmLayout(this.score, {
        measureCount: this.measureCount,
        tonality: this.tonality,
        displayKeySignature: !!this.tonality,
        preferSharp: !this.tonality || this.tonality.fifths >= 0
      });
    }
  },
  watch: {
    score() { if (this.$refs.scoreScroll) this.$refs.scoreScroll.scrollLeft = 0; },
    activeChordId() {
      const event = this.layout.events.find(this.isActive);
      const scroll = this.$refs.scoreScroll;
      if (event && scroll) scroll.scrollLeft = Math.max(0, event.x - scroll.clientWidth / 2);
    }
  },
  methods: {
    isActive(event) {
      return !!this.activeChordId && this.score.targets.some(target =>
        target.globalStartTick === event.globalStartTick && target.chord.id === this.activeChordId);
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
.chord-rhythm-score { box-sizing: border-box; min-width: 0; max-width: 100%; margin-top: 18px; padding: 12px; border: 1px solid #d5e6e9; border-radius: 13px; background: rgba(242,249,250,.8); }
.chord-rhythm-score > strong { color: #2d5661; font-size: 11px; }
.score-scroll { box-sizing: border-box; width: 100%; min-width: 0; margin-top: 9px; overflow-x: auto; border: 1px solid #dce9eb; border-radius: 11px; background: #fff; -webkit-overflow-scrolling: touch; }
svg { display: block; max-width: none; height: auto; }
.staff-line,.ledger-line { stroke: #24464e; stroke-width: 1.15; }
.barline { stroke: #71878b; stroke-width: 1.2; }
.symbol,.note-head,.dot { fill: #24464e; }
.note-head.hollow { fill: #fff; stroke: #24464e; stroke-width: 1.8; }
.is-playing .note-head { stroke: #e76530; stroke-width: 2; }
.time-signature { fill: #24464e; font-size: 18px; font-weight: 800; text-anchor: middle; }
.stem { stroke: #24464e; stroke-width: 1.25; }
.beam { stroke: #24464e; stroke-width: 4; }
.flag { fill: none; stroke: #24464e; stroke-width: 2; stroke-linecap: round; }
</style>
