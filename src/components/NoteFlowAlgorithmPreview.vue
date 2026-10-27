<template>
  <div class="algorithm-preview">
    <div class="algorithm-preview-heading">
      <strong>{{$t('FLOW_ALGORITHM_PREVIEW')}}</strong>
      <span>{{score.meter.signature}} · {{bpm}} BPM</span>
    </div>
    <p class="algorithm-preview-key">{{$t('FLOW_PREVIEW_KEY')}} <strong>{{keyLabel}}</strong></p>
    <div ref="scoreScroll" class="algorithm-score-scroll">
      <svg :viewBox="`0 0 ${scoreWidth} ${layout.height}`" :style="{ width: scoreWidth + 'px' }"
        role="img" :aria-label="$t('FLOW_ALGORITHM_PREVIEW')" focusable="false">
        <g v-for="staff in layout.staves" :key="staff.clef">
          <line v-for="(y, index) in staff.lineYs" :key="staff.clef + index"
            class="rhythm-staff-line" x1="12" :x2="scoreWidth - 12" :y1="y" :y2="y" />
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
            <line v-for="bar in layout.barlines" :key="'bar-' + bar.index"
              class="rhythm-barline" :x1="bar.x" :x2="bar.x"
              :y1="layout.staves[0].lineYs[0]"
              :y2="layout.staves[layout.staves.length - 1].lineYs[4]" />
            <line v-for="(beam, index) in layout.beams" :key="'beam-' + index"
              class="rhythm-beam" :x1="beam.x1" :x2="beam.x2"
              :y1="beam.y" :y2="beam.y" />
            <g v-for="event in layout.events" :key="event.id"
              :class="{ 'rhythm-current': activeNotes.includes(event.hand + ':' + event.startTick) }"
              :transform="`translate(${event.x} 0)`">
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
      </svg>
    </div>
    <div class="algorithm-preview-actions">
      <button type="button" @click="$emit('new-example')">{{$t('FLOW_ALGORITHM_NEW_EXAMPLE')}}</button>
      <button type="button" :class="{ 'is-playing': playing }" @click="playing ? stop() : listen()">
        {{playing ? $t('FLOW_CHORD_STOP') : $t('FLOW_ALGORITHM_LISTEN')}}
      </button>
    </div>
    <p class="algorithm-preview-hint">{{$t('FLOW_ALGORITHM_PREVIEW_HINT')}}</p>
  </div>
</template>

<script>
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import Glyphs from "abcjs/src/write/creation/glyphs";
import { createNoteFlowRhythmTimeline } from "../model/NoteFlowRhythmTimeline";
import { createNoteFlowRhythmStaffLayout } from "../model/NoteFlowRhythmStaffLayout";
import { createNoteFlowPreviewAudition } from "../model/NoteFlowPreviewAudition";
import { createPianoSamplePlayer } from "../model/PianoAudio";
import { formatNoteFlowTonalityLabel, getActiveNoteFlowTonality } from "../model/NoteFlowKeyLabels";
import Options from "../model/Options";

export default {
  name: "NoteFlowAlgorithmPreview",
  props: {
    cycle: { type: Object, required: true },
    score: { type: Object, required: true },
    bpm: { type: Number, default: 50 }
  },
  data() { return { playing: false, activeNotes: [] }; },
  computed: {
    timeline() { return createNoteFlowRhythmTimeline(this.score, { bpm: this.bpm }); },
    layout() { return createNoteFlowRhythmStaffLayout(this.cycle, this.timeline); },
    scoreWidth() { return Math.max(this.layout.width, this.layout.barlines[this.layout.barlines.length - 1].x + 20); },
    keyLabel() {
      return formatNoteFlowTonalityLabel(getActiveNoteFlowTonality(this.cycle, this.timeline.events.find(event => event.kind === "note")), Options.noteNaming);
    }
  },
  watch: {
    score() {
      this.stop();
      if (this.$refs.scoreScroll) this.$refs.scoreScroll.scrollLeft = 0;
    },
    bpm() { this.stop(); }
  },
  mounted() {
    this.player = createPianoSamplePlayer();
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => { if (this.playing) this.stop(); });
    this.visibilityHandler = () => { if (document.hidden) this.stop(); };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  },
  beforeDestroy() {
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    this.stop();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
  },
  methods: {
    glyphPath(name, x, y, scale) {
      return Glyphs.getPathForSymbol(x, y, name, scale, scale).map(part => part.join(" ")).join("");
    },
    accidentalName(value) { return value === "flat" ? "accidentals.flat" : "accidentals.sharp"; },
    restName(value) { return `rests.${value === "eighth" ? "8th" : value === "sixteenth" ? "16th" : value === "dotted-quarter" ? "quarter" : value}`; },
    flagPath(stem, doubleFlag) {
      const direction = stem.y2 < stem.y1 ? 1 : -1;
      const first = `M ${stem.x} ${stem.y2} q ${10 * direction} 2 ${10 * direction} ${13 * direction}`;
      return doubleFlag ? `${first} M ${stem.x} ${stem.y2 + 7 * direction} q ${10 * direction} 2 ${10 * direction} ${13 * direction}` : first;
    },
    async listen() {
      this.stop();
      const request = this.audioStartRequest;
      const ready = await AudioSync.resume();
      if (request !== this.audioStartRequest) return;
      const context = AudioSync.getContext();
      if (context && (!ready || context.state !== "running")) return;
      const notes = this.timeline.events.filter(event => event.kind === "note");
      this.audition = createNoteFlowPreviewAudition(this.timeline, {
        player: this.player, appVolume: Options.appVolume, delayMs: AudioSync.getDelayMs(),
        onActiveNotes: indices => {
          this.activeNotes = indices.map(index => notes[index].hand + ":" + notes[index].startTick);
          const first = this.layout.events.find(event => this.activeNotes.includes(event.hand + ":" + event.startTick));
          const scroll = this.$refs.scoreScroll;
          if (first && scroll) scroll.scrollLeft = Math.max(0, first.x - scroll.clientWidth / 2);
        },
        onStop: () => { this.playing = false; this.activeNotes = []; }
      });
      this.playing = this.audition.start();
    },
    stop() {
      this.audioStartRequest = (this.audioStartRequest || 0) + 1;
      if (this.audition) this.audition.stop();
      this.audition = null;
      this.playing = false;
      this.activeNotes = [];
    }
  }
};
</script>

<style scoped>
.algorithm-preview { box-sizing: border-box; min-width: 0; margin-top: 23px; padding-top: 18px; border-top: 1px solid #d5e6e9; }
.algorithm-preview-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; color: #355864; font-size: 12px; }
.algorithm-preview-heading span { color: #647a7f; }
.algorithm-preview-key { color: #647a7f; font-size: 12px; }
.algorithm-score-scroll { width: 100%; min-width: 0; overflow-x: auto; margin-top: 10px; border: 1px solid #d5e6e9; border-radius: 12px; background: #fff; -webkit-overflow-scrolling: touch; }
svg { display: block; max-width: none; height: auto; }
.algorithm-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
.algorithm-preview-actions button { flex: 1; min-height: 44px; padding: 8px 12px; border: 1px solid #85aeb7; border-radius: 12px; background: #e8f5f7; color: #245f6c; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.algorithm-preview-actions .is-playing { border-color: #d69b82; background: #fff0e7; color: #a64a2b; }
.algorithm-preview-hint { margin: 10px 0 0; color: #647a7f; font-size: 11px; line-height: 1.5; }
.rhythm-staff-line,.rhythm-ledger { stroke: #354e54; stroke-width: 1.1; }
.rhythm-clef,.rhythm-note-head,.rhythm-rest,.rhythm-accidental,.rhythm-dot { fill: #233b42; }
.rhythm-stem,.rhythm-flag { fill: none; stroke: #233b42; stroke-width: 1.3; }
.rhythm-beam { stroke: #233b42; stroke-width: 3.7; stroke-linecap: square; }
.rhythm-note-head.hollow { fill: #fff; stroke: #233b42; stroke-width: 1.5; }
.rhythm-barline { stroke: #9fb0b4; stroke-width: 1.1; }
.rhythm-time-signature { fill: #233b42; font-family: Georgia, serif; font-size: 18px; font-weight: 700; text-anchor: middle; }
.rhythm-current .rhythm-note-head { stroke: #e76530; stroke-width: 2; fill: #e76530; }
.rhythm-current .rhythm-note-head.hollow { fill: #fff; }
</style>
