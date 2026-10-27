<template>
  <div class="piece-details-overlay" @click.self="$emit('cancel')">
    <section ref="dialog" class="piece-details-dialog" role="dialog" aria-modal="true"
      aria-labelledby="workshop-piece-details-title" tabindex="-1" @keydown="handleKeydown">
      <h2 id="workshop-piece-details-title">{{$t('WORKSHOP_PIECE_DETAILS')}}</h2>
      <form novalidate @submit.prevent="save">
        <label for="workshop-piece-title">{{$t('WORKSHOP_TITLE')}}</label>
        <input id="workshop-piece-title" ref="title" v-model="title" type="text" maxlength="80" required
          :aria-invalid="submitted && validationError === 'WORKSHOP_PIECE_TITLE_REQUIRED' ? 'true' : null" />
        <label for="workshop-piece-tempo">{{$t('WORKSHOP_TEMPO')}}</label>
        <input id="workshop-piece-tempo" v-model="tempo" type="number" inputmode="numeric" min="25" max="240" step="1" required
          :aria-invalid="submitted && validationError === 'WORKSHOP_PIECE_TEMPO_INVALID' ? 'true' : null" />
        <details class="piece-credits" :open="hasCredits">
          <summary>{{$t('WORKSHOP_PIECE_CREDITS')}}</summary>
          <div v-for="field in creditFields" :key="field.key" class="piece-credit-field">
            <label :for="'workshop-piece-' + field.key">{{$t(field.label)}}</label>
            <textarea :id="'workshop-piece-' + field.key" v-model="credits[field.key]" :rows="field.key === 'copyright' ? 7 : 2" maxlength="2048" />
          </div>
          <WorkshopSourceLinks v-model="sources" />
        </details>
        <p v-if="displayedError" class="piece-details-error" role="alert">{{$t(displayedError)}}</p>
        <div class="piece-details-actions">
          <button type="button" @click="$emit('cancel')">{{$t('CANCEL')}}</button>
          <button type="submit" class="primary">{{$t('WORKSHOP_SAVE')}}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script>
import WorkshopSourceLinks from './WorkshopSourceLinks';
import { isValidWorkshopSources } from '../model/Workshop';
const CREDIT_FIELDS = Object.freeze([
  { key: 'subtitle', label: 'WORKSHOP_META_SUBTITLE' },
  { key: 'composer', label: 'WORKSHOP_META_COMPOSER' },
  { key: 'arranger', label: 'WORKSHOP_META_ARRANGER' },
  { key: 'lyricist', label: 'WORKSHOP_META_LYRICIST' },
  { key: 'copyright', label: 'WORKSHOP_META_COPYRIGHT' },
  { key: 'license', label: 'WORKSHOP_META_LICENSE' }
]);

export default {
  name: 'WorkshopPieceDetails',
  components:{WorkshopSourceLinks},
  props: {
    draft: { type: Object, required: true },
    error: { type: String, default: null }
  },
  data() {
    const original = JSON.parse(JSON.stringify(this.draft));
    const metadata = original.score.metadata || {};
    return {
      original,
      title: original.title,
      tempo: String(original.score.bpm),
      creditFields: CREDIT_FIELDS,
      sources:(metadata.sources || []).map(source=>Object.assign({},source)),
      credits: CREDIT_FIELDS.reduce((result, field) => {
        result[field.key] = metadata[field.key] || '';
        return result;
      }, {}),
      submitted: false
    };
  },
  computed: {
    hasCredits() { return CREDIT_FIELDS.some(field=>!!this.credits[field.key]) || this.sources.length > 0; },
    validationError() {
      if (!this.title.trim() || this.title.trim().length > 80) return 'WORKSHOP_PIECE_TITLE_REQUIRED';
      const bpm = Number(this.tempo);
      if (!Number.isInteger(bpm) || bpm < 25 || bpm > 240) return 'WORKSHOP_PIECE_TEMPO_INVALID';
      if (CREDIT_FIELDS.some(field => this.credits[field.key].length > 2048)) return 'WORKSHOP_PIECE_CREDITS_INVALID';
      if (!isValidWorkshopSources(this.sources)) return 'WORKSHOP_SOURCES_INVALID';
      return null;
    },
    displayedError() { return (this.submitted && this.validationError) || this.error; }
  },
  mounted() {
    this.previousFocus = document.activeElement;
    this.$nextTick(() => {
      if (this._isDestroyed || !this.$refs.title) return;
      this.$refs.title.focus();
      this.$refs.title.select();
    });
  },
  beforeDestroy() {
    if (this.previousFocus && document.documentElement.contains(this.previousFocus)) this.previousFocus.focus();
  },
  methods: {
    save() {
      this.submitted = true;
      if (this.validationError) return;
      const updated = JSON.parse(JSON.stringify(this.original));
      updated.title = this.title.trim();
      updated.score.bpm = Number(this.tempo);
      const metadata = updated.score.metadata || {};
      let metadataChanged = false;
      if (updated.title !== this.original.title) {
        metadata.title = updated.title;
        metadataChanged = true;
      }
      CREDIT_FIELDS.forEach(field => {
        const value = this.credits[field.key];
        if (value === (metadata[field.key] || '')) return;
        if (value) metadata[field.key] = value;
        else delete metadata[field.key];
        metadataChanged = true;
      });
      if (metadataChanged) updated.score.metadata = metadata;
      if (JSON.stringify(this.sources) !== JSON.stringify(metadata.sources || [])) {
        if (this.sources.length) metadata.sources=this.sources.map(source=>Object.assign({},source));
        else delete metadata.sources;
        updated.score.metadata=metadata;
      }
      this.$emit('save', updated);
    },
    handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.$emit('cancel');
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = this.$refs.dialog;
      const controls = Array.from(dialog.querySelectorAll('input, textarea, button, summary, a[href], [tabindex="0"]'))
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
.piece-details-overlay {
  position: fixed; z-index: 1000; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 18px; overflow-y: auto; background: rgba(35, 54, 58, .45); box-sizing: border-box;
}
.piece-details-dialog {
  box-sizing: border-box; width: 100%; max-width: 540px; min-width: 0; max-height: calc(100% - 4px);
  overflow-y: auto; padding: 24px; border: 1px solid #d2dfe0; border-radius: 22px;
  color: #344e57; background: #fffdf8; box-shadow: 0 20px 70px rgba(29, 48, 54, .2);
}
h2 { margin: 0 0 22px; font-size: 23px; line-height: 1.3; overflow-wrap: anywhere; }
label { display: block; margin: 17px 0 7px; font-weight: 700; font-size: 15px; }
input, textarea {
  display: block; box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #cbdadd;
  border-radius: 12px; padding: 12px; font: inherit; font-size: 16px; line-height: 1.4;
  color: #344e57; background: white;
}
textarea { resize: vertical; min-height: 70px; }
input:focus, textarea:focus, button:focus-visible, summary:focus-visible { outline: 3px solid #b4d6dc; outline-offset: 2px; }
.piece-credits { margin-top: 22px; border-top: 1px solid #dde5e2; padding-top: 16px; }
summary { cursor: pointer; padding: 8px 0; font-weight: 700; line-height: 1.5; }
.piece-details-error { margin: 18px 0 0; color: #a2432d; line-height: 1.5; }
.piece-details-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
button {
  min-height: 46px; border: 1px solid #cbdadd; border-radius: 12px; padding: 11px 17px;
  background: #fffaf2; color: #3d5e68; font: inherit; font-weight: 700; cursor: pointer;
}
button.primary { background: #2b7f8e; border-color: #2b7f8e; color: white; }
@media (max-width: 420px) {
  .piece-details-overlay { padding: 10px; }
  .piece-details-dialog { padding: 18px; border-radius: 18px; }
  h2 { font-size: 21px; }
  .piece-details-actions { flex-wrap: wrap; }
  .piece-details-actions button { flex: 1 1 105px; padding: 11px 10px; }
}
</style>
