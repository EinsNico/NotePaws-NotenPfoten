<template>
  <div class="piece-info-overlay" @click.self="$emit('close')">
    <section ref="dialog" class="piece-info-dialog" role="dialog" aria-modal="true"
      aria-labelledby="workshop-piece-info-title" tabindex="-1" @keydown="handleKeydown">
      <div class="piece-info-heading">
        <h2 id="workshop-piece-info-title">{{$t('WORKSHOP_PIECE_INFO')}}</h2>
        <button ref="close" type="button" class="piece-info-close" @click="$emit('close')">{{$t('APP_INFO_CLOSE')}}</button>
      </div>
      <dl class="piece-info-credits">
        <template v-if="info.title">
          <dt>{{$t('WORKSHOP_TITLE')}}</dt><dd>{{info.title}}</dd>
        </template>
        <template v-for="credit in info.credits">
          <dt :key="credit.key + '-label'">{{$t(credit.label)}}</dt>
          <dd :key="credit.key">{{credit.value}}</dd>
        </template>
      </dl>
      <section class="piece-info-summary" aria-labelledby="workshop-piece-info-summary">
        <h3 id="workshop-piece-info-summary">{{$t('WORKSHOP_INFO_SUMMARY')}}</h3>
        <dl class="piece-info-stats">
          <div><dt>{{$t('WORKSHOP_INFO_DURATION')}}</dt><dd>{{duration}}</dd></div>
          <div><dt>{{$t('WORKSHOP_INFO_BARS')}}</dt><dd>{{info.barCount}}</dd></div>
          <div><dt>{{$t('WORKSHOP_INFO_NOTES')}}</dt><dd>{{info.noteCount}}</dd></div>
          <div><dt>{{$t('WORKSHOP_INFO_STAVES')}}</dt><dd>{{info.staffCount}}</dd></div>
        </dl>
        <p class="piece-info-hint">{{$t('WORKSHOP_INFO_DURATION_NOTE')}} {{$t('WORKSHOP_INFO_NOTES_NOTE')}}</p>
        <dl class="piece-info-musical">
          <dt>{{$t('WORKSHOP_INFO_RANGE')}}</dt><dd>{{pitchRange}}</dd>
          <dt>{{$t('WORKSHOP_INFO_PITCHES')}}</dt>
          <dd v-if="info.pitches.length" class="piece-info-pitches"><span v-for="pitch in info.pitches" :key="pitch.step + ':' + pitch.alter + ':' + pitch.octave">{{pitchLabel(pitch)}}</span></dd>
          <dd v-else>{{$t('WORKSHOP_INFO_NO_NOTES')}}</dd>
          <dt>{{$t('WORKSHOP_INFO_VALUES')}}</dt>
          <dd>{{noteValues || $t('WORKSHOP_INFO_NO_NOTES')}}</dd>
        </dl>
        <section v-for="staff in info.staves" :key="staff.number" class="piece-info-staff">
          <h4>{{$t('WORKSHOP_INFO_STAFF_CONTEXT', { number:staff.number })}}</h4>
          <dl>
            <dt>{{$t('WORKSHOP_INFO_KEY')}}</dt><dd>{{staff.keys.map(keyLabel).join(' · ')}}</dd>
            <dt>{{$t('WORKSHOP_INFO_METER')}}</dt><dd>{{staff.meters.join(' · ')}}</dd>
            <dt>{{$t('WORKSHOP_INFO_CLEF')}}</dt><dd>{{staff.clefs.map(clefLabel).join(' · ')}}</dd>
          </dl>
        </section>
      </section>
      <section v-if="info.sources.length" class="piece-info-sources" aria-labelledby="workshop-piece-info-sources">
        <h3 id="workshop-piece-info-sources">{{$t('WORKSHOP_META_SOURCES')}}</h3>
        <ul><li v-for="(source,index) in info.sources" :key="index"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{source.label}}</a></li></ul>
      </section>
      <p v-if="info.hasImportWarnings" class="piece-info-hint piece-info-import-note">{{$t('WORKSHOP_INFO_IMPORT_NOTE')}}</p>
    </section>
  </div>
</template>

<script>
import Options from '../model/Options';
import { normalizeNoteNaming } from '../model/NoteNaming';
import { getNoteFlowTonality } from '../model/NoteFlowTonality';
import { formatNoteFlowTonalityLabel } from '../model/NoteFlowKeyLabels';
import { createWorkshopPieceInfo, formatWorkshopInfoPitch, formatWorkshopInfoDuration } from '../model/WorkshopPieceInfo';

export default {
  name:'WorkshopPieceInfo',
  props:{
    score:{ type:Object, required:true }, title:{ type:String, default:'' },
    timeline:{ type:Object, default:null }, showLicense:{ type:Boolean, default:false }
  },
  computed:{
    info() { return createWorkshopPieceInfo(this.score, { title:this.title, timeline:this.timeline, showLicense:this.showLicense }); },
    noteNaming() { return normalizeNoteNaming(Options.noteNaming, this.$i18n.locale); },
    duration() { return formatWorkshopInfoDuration(this.info.durationMs); },
    pitchRange() {
      if (!this.info.range) return this.$t('WORKSHOP_INFO_NO_NOTES');
      const first = this.pitchLabel(this.info.range.lowest), last = this.pitchLabel(this.info.range.highest);
      return first === last ? first : first + ' – ' + last;
    },
    noteValues() { return this.info.noteValues.map(this.valueLabel).join(' · '); }
  },
  mounted() {
    this.previousFocus = document.activeElement;
    this.$nextTick(() => { if (!this._isDestroyed && this.$refs.close) this.$refs.close.focus(); });
  },
  beforeDestroy() {
    if (this.previousFocus && document.documentElement.contains(this.previousFocus)) this.previousFocus.focus();
  },
  methods:{
    pitchLabel(pitch) { return formatWorkshopInfoPitch(pitch, this.noteNaming); },
    keyLabel(id) {
      const key = getNoteFlowTonality(id);
      if (!key || key.id !== id) return '';
      return formatNoteFlowTonalityLabel(key, this.noteNaming) + ' ' + this.$t(key.mode === 'minor' ? 'FLOW_KEY_MINOR' : 'FLOW_KEY_MAJOR');
    },
    clefLabel(clef) { return this.$t('WORKSHOP_CLEF_' + clef.toUpperCase()); },
    valueLabel(value) {
      const common = ['whole','half','quarter','eighth','sixteenth','thirtysecond'].includes(value.noteValue);
      let label = this.$t((common ? 'FLOW_RHYTHM_VALUE_' : 'WORKSHOP_VALUE_') + value.noteValue.toUpperCase());
      if (value.dots) label += ' (' + this.$t('WORKSHOP_INFO_DOTTED', { count:value.dots }) + ')';
      if (value.tuplet) label += ' (' + this.$t('WORKSHOP_INFO_TUPLET', value.tuplet) + ')';
      return label;
    },
    handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.$emit('close'); return;
      }
      if (event.key !== 'Tab') return;
      const dialog = this.$refs.dialog;
      const controls = Array.from(dialog.querySelectorAll('button, a[href], [tabindex="0"]'))
        .filter(element => !element.disabled && element.getClientRects().length);
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  }
};
</script>

<style scoped>
.piece-info-overlay {
  position:fixed; z-index:1000; inset:0; display:flex; align-items:center; justify-content:center;
  padding:18px; overflow-y:auto; background:rgba(35,54,58,.45); box-sizing:border-box;
}
.piece-info-dialog {
  box-sizing:border-box; width:100%; max-width:620px; min-width:0; max-height:calc(100% - 4px);
  overflow-y:auto; padding:24px; border:1px solid #d2dfe0; border-radius:22px;
  color:#344e57; background:#fffdf8; box-shadow:0 20px 70px rgba(29,48,54,.2);
}
.piece-info-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:20px; }
h2 { margin:0; font-size:23px; line-height:1.3; overflow-wrap:anywhere; }
h3 { margin:0 0 14px; font-size:18px; line-height:1.4; }
h4 { margin:0 0 10px; font-size:15px; line-height:1.4; }
dl { margin:0; min-width:0; }
dt { font-size:14px; font-weight:700; line-height:1.5; }
dd { margin:4px 0 16px; line-height:1.55; overflow-wrap:anywhere; white-space:pre-wrap; }
.piece-info-summary, .piece-info-sources { margin-top:24px; padding-top:20px; border-top:1px solid #dde5e2; }
.piece-info-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.piece-info-stats > div { padding:12px; border-radius:12px; background:#eef5f3; }
.piece-info-stats dd { margin:4px 0 0; font-size:23px; font-weight:700; }
.piece-info-hint { margin:14px 0 20px; font-size:13px; line-height:1.55; color:#657b80; }
.piece-info-pitches { display:flex; flex-wrap:wrap; gap:6px; }
.piece-info-pitches span { padding:3px 8px; border:1px solid #d9e5e2; border-radius:8px; background:white; }
.piece-info-staff { margin-top:20px; }
.piece-info-staff dl { display:grid; grid-template-columns:minmax(0,110px) minmax(0,1fr); gap:6px 12px; }
.piece-info-staff dd { margin:0; }
.piece-info-import-note { margin-bottom:0; }
ul { margin:0; padding-left:20px; } li { margin:10px 0; line-height:1.5; }
a { color:#236f7e; overflow-wrap:anywhere; }
button {
  min-height:44px; border:1px solid #cbdadd; border-radius:12px; padding:10px 13px;
  background:#fffaf2; color:#3d5e68; font:inherit; font-weight:700; cursor:pointer;
}
button:focus-visible, a:focus-visible { outline:3px solid #b4d6dc; outline-offset:3px; }
@media (max-width:420px) {
  .piece-info-overlay { padding:10px; }
  .piece-info-dialog { padding:18px; border-radius:18px; }
  .piece-info-heading { flex-wrap:wrap; } h2 { font-size:21px; }
  .piece-info-staff dl { grid-template-columns:minmax(0,90px) minmax(0,1fr); }
}
</style>
