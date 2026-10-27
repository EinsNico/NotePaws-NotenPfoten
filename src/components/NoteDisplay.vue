<template>
  <div id="note-outer-box">
    <div
      id="note-display"
      :class="{ 'note-hidden-for-countdown': showCountdown }"
      :data-clef="currentExercise.clef"
      :data-note-value="currentExercise.value"
      role="button"
      :tabindex="isPreparing ? -1 : 0"
      :aria-label="$t('SINGLE_NOTES_PREVIEW_NOTE')"
      :aria-disabled="isPreparing"
      @click="playCurrentNote"
      @keydown.enter.prevent="playCurrentNote"
      @keydown.space.prevent="playCurrentNote"></div>
    <div v-if="showCountdown" class="note-preparation-countdown" role="status" aria-live="polite">
      <span>{{$t('SINGLE_NOTES_PREPARATION_LABEL')}}</span>
      <strong>{{preparationRemainingSeconds}}</strong>
    </div>
  </div>
</template>

<script>
import Utils from '../model/Utils';

import abcjs from 'abcjs';

export default {
  name: 'NoteDisplay',
  props: {
    currentExercise: Object,
    exerciseId: {
      type: Number,
      default: 0
    },
    isPreparing: {
      type: Boolean,
      default: false
    },
    preparationSeconds: {
      type: Number,
      default: 0
    },
    preparationRemainingSeconds: {
      type: Number,
      default: 0
    },
    preparationId: {
      type: Number,
      default: 0
    }
  },
  computed: {
    showCountdown(){
      return this.isPreparing && this.preparationRemainingSeconds > 0;
    },
    displayRevision(){
      return this.exerciseId + ':' + this.preparationId;
    },
    accidental(){
      if(!Utils.hasAccidental(this.currentExercise.value)){
        return '';
      }
      return this.currentExercise.isSharp ? '^' : '_';
    },
    noteLetter(){
      const v = this.currentExercise.value % 12;
      const isSharp = this.currentExercise.isSharp;
      switch(v){
        case 0: return 'C';
        case 1: return isSharp ? 'C' : 'D';
        case 2: return 'D';
        case 3: return isSharp ? 'D' : 'E';
        case 4: return 'E';
        case 5: return 'F';
        case 6: return isSharp ? 'F' : 'G';
        case 7: return 'G';
        case 8: return isSharp ? 'G' : 'A';
        case 9: return 'A';
        case 10: return isSharp ? 'A' : 'B';
        case 11: return 'B'
      }
    },
    note(){
      // ABC notation reference: https://abcnotation.com/wiki/abc:standard:v2.1#pitch
      // We are numbering the notes starting with C0 = 0, D0 = 1 and so on. Thus C4 = 48.
      const value = this.currentExercise.value;
      if(value < 12){
        return this.noteLetter + ',,,,';
      } else if(value < 24){
        return this.noteLetter + ',,,';
      } else if(value < 36){
        return this.noteLetter + ',,';
      } else if(value < 48){
        return this.noteLetter + ',';
      } else if(value < 60){
        return this.noteLetter;
      } else if(value < 72){
        return this.noteLetter.toLowerCase();
      } else if(value < 84){
        return this.noteLetter.toLowerCase() + '\'';
      } else if(value < 96){
        return this.noteLetter.toLowerCase() + '\'\'';
      }
    },
    abc(){
      if (this.currentExercise.staff === 'piano') {
        return (
          // Multiple voices notation: https://abcnotation.com/wiki/abc:standard:v2.1#multiple_voices
          'L:1/4\n'
          + '%%score {1 2}\n'
          + 'V:1 clef=treble\n'
          + 'V:2 clef=bass\n'
          + 'K:C\n'
          + '[V:1] ' + (this.currentExercise.clef === 'treble' ? this.accidental + this.note : 'z') + '\n'
          + '[V:2] ' + (this.currentExercise.clef === 'bass' ? this.accidental + this.note : 'z')
        )
      } else {
        return (
          'L:1/4\nK:C ' + this.currentExercise.clef
          + '\n'
          + this.accidental + this.note
        );
      }
    },
  },
  watch: {
    displayRevision() {
      this.renderNote();
    }
  },
  mounted(){
    // The first exercise can equal Game.vue's initial exercise. In that case the
    // watcher does not fire, so render once explicitly after the element exists.
    this.renderNote();
  },
  methods: {
	  renderNote(){
      abcjs.renderAbc('note-display', this.abc, {
        clickListener: () => this.unselect(),
        paddingtop: 4,
        paddingleft: 0,
        paddingbottom: 4,
        paddingright: 0,
        // It is somewhat tricky to size and layout an SVG image correctly. We start by setting 'responsive'
        // here, which lets us control size via the width of the parent object.
        responsive: 'resize',
        add_classes: true,
        staffwidth: 80  // Sufficient to show a single quarter note.
      });
      const svg = this.$el.querySelector('svg');
      if(svg){
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
      const exerciseId = this.exerciseId;
      const preparationId = this.preparationId;
      this.$nextTick(() => this.$emit('rendered', exerciseId, preparationId));
	  },
	  playCurrentNote(){
      if(this.isPreparing){
        return;
      }
      this.$emit('play');
    },
    unselect(){
      Array.from(document.getElementsByTagName('path'))
        .filter(p => p.getAttribute('fill') === '#ff0000')
        .forEach(p => p.setAttribute('fill', null));
    }
  }
}
</script>

<style scoped>
#note-display {
  width: 100%;
  height: 100% !important;
  padding-bottom: 0 !important;
  margin: 0 auto;
  cursor: pointer;
  display: flex !important;
  position: relative !important;
  overflow: visible !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

#note-display.note-hidden-for-countdown {
  visibility: hidden;
  pointer-events: none;
}

.note-preparation-countdown {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #2d6e7b;
}

.note-preparation-countdown span {
  font-size: clamp(14px, 2.5vw, 18px);
  font-weight: 700;
}

.note-preparation-countdown strong {
  font-size: clamp(56px, 16vw, 96px);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

#note-outer-box {
  position: relative;
  width: clamp(210px, 72vw, 360px);
  height: 100%;
  max-width: 100%;
  max-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 2vh, 16px);
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 10px 25px rgba(72, 58, 45, 0.08);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  box-sizing: border-box;
}

#note-outer-box::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 4px;
  border-radius: 0 999px 999px 0;
  background: rgba(45, 110, 123, 0.72);
  content: "";
}

#note-display >>> svg {
  display: block;
  position: static !important;
  top: auto !important;
  left: auto !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  overflow: visible !important;
}

@media (orientation: landscape) and (max-height: 600px) {
  #note-outer-box {
    width: min(100%, 300px);
    max-height: 240px;
    padding: 6px 10px;
    border-radius: 19px;
  }
}

</style>
