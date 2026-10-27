<template>
  <div class="personal-demo welcome-accidental-demo" :class="{'includes-black':selection !== 'no'}">
    <div class="accidental-setting">
      <SelectOption appearance="single-notes" :label="$t('ACCIDENTALS')" :items="choices" :value="selection" @input="select" />
    </div>
    <svg class="accidental-playfield" viewBox="0 0 360 230" aria-hidden="true">
      <path v-for="y in [32,44,56,68,80]" :key="y" class="accidental-staff" :d="'M28 '+y+'h304'"/>
      <path class="accidental-clef" :d="clef"/>
      <circle class="accidental-note-halo" cx="210" :cy="noteY" r="17"/>
      <path v-if="selection !== 'no'" class="accidental-symbol" :d="selection === 'onlyFlat' ? flat : sharp"/>
      <ellipse class="accidental-note" cx="210" :cy="noteY" rx="9" ry="6.5" :transform="'rotate(-15 210 '+noteY+')'"/>
      <path class="accidental-note-stem" :d="'M218 '+(noteY-1)+'v-35'"/>
      <rect class="accidental-keyboard-case" x="25" y="127" width="310" height="82" rx="8"/>
      <g v-for="(note,i) in ['C','D','E','F','G','A','B','C']" :key="i">
        <rect class="accidental-white-key" :class="{'accidental-answer':selection === 'no' && i === 4}" :x="28+i*38" y="130" width="38" height="76" rx="4"/>
        <text :x="47+i*38" y="196">{{note==='B' ? $t('WELCOME_NOTE_B') : note}}</text>
      </g>
      <rect v-for="i in [0,1,3,4,5]" :key="'black'+i" class="accidental-black-key" :class="{'accidental-answer':selection !== 'no' && i === answerBlackKey}" :x="55+i*38" y="130" width="22" height="46" rx="3"/>
    </svg>
    <p class="accidental-explanation"><slot /></p>
  </div>
</template>

<script>
import Glyphs from 'abcjs/src/write/creation/glyphs';
import SelectOption from './SelectOption';
function glyph(name,x,y,scale) {return Glyphs.getPathForSymbol(x,y,name,scale,scale).map(part=>part.join(' ')).join('');}
export default {
  name:'WelcomeAccidentalPreview',
  components:{SelectOption},
  props:{playing:Boolean},
  data() {return {selection:'no',phase:0,automatic:true,reducedMotion:false,
    clef:glyph('clefs.G',47,68,12/7.5),sharp:glyph('accidentals.sharp',181,68,12/7.5),flat:glyph('accidentals.flat',185,68,12/7.5)};},
  computed:{
    choices() {return [{value:'no',label:this.$t('none')},{value:'onlySharp',label:this.$t('sharp')},{value:'onlyFlat',label:this.$t('flat')},{value:'sharpAndFlat',label:this.$t('sharpAndFlat')}];},
    noteY() {return 68;},
    answerBlackKey() {return this.selection==='onlyFlat' ? 3 : 4;}
  },
  watch:{playing(value) {if(value)this.resume();}},
  mounted() {
    this.reducedMotion=!!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.addEventListener('visibilitychange',this.queue);
    this.queue();
  },
  beforeDestroy() {this.clear();document.removeEventListener('visibilitychange',this.queue);},
  methods:{
    clear() {if(this._demoTimer!=null)clearTimeout(this._demoTimer);this._demoTimer=null;},
    queue() {
      this.clear();
      if(!this.automatic || this.reducedMotion || typeof document!=='undefined' && document.hidden)return;
      this._demoTimer=setTimeout(()=>{
        this._demoTimer=null;
        if(this._isDestroyed || this._isBeingDestroyed)return;
        this.phase=(this.phase+1)%3;
        this.selection=['no','onlySharp','onlyFlat'][this.phase];
        this.queue();
      },[1200,1500,1300][this.phase]);
    },
    select(value) {
      if(!this.choices.some(choice=>choice.value===value))return;
      this.selection=value;this.automatic=false;this.clear();this.$emit('pause');
    },
    resume() {this.selection='no';this.phase=0;this.automatic=true;this.queue();}
  }
};
</script>

<style>
.personal-preview.personal-preview-keys .welcome-accidental-demo {display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;height:330px;min-height:0;width:100%;max-width:360px;margin:auto;}
.welcome-accidental-demo .accidental-setting {padding:10px 12px;border:1px solid #d1dfdd;border-radius:14px;background:#fffefa;}
.welcome-accidental-demo .select-option .options-container {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:7px 0 0;}
.welcome-accidental-demo .select-option .value-box {min-height:40px;width:auto;padding:6px 3px;margin:0;min-width:0;font-size:13px;border-radius:10px;}
.welcome-accidental-demo .select-option .value-box.selected {background:#ffdfb6;border-color:#d97736;color:#874721;}
.welcome-accidental-demo .accidental-playfield {width:100%;height:100%;min-height:0;overflow:hidden;background:#f3f8f6;border-radius:14px;}
.welcome-accidental-demo .accidental-staff {fill:none;stroke:#afc4c1;stroke-width:1.4;}
.welcome-accidental-demo .accidental-clef {fill:#345e68;}
.welcome-accidental-demo .accidental-note-halo {fill:#ffead0;}
.welcome-accidental-demo .accidental-note,.welcome-accidental-demo .accidental-symbol {fill:#c76830;}
.welcome-accidental-demo .accidental-note-stem {fill:none;stroke:#c76830;stroke-width:2.2;}
.welcome-accidental-demo .accidental-keyboard-case {fill:#fffdf8;stroke:#bdcfca;stroke-width:1;}
.welcome-accidental-demo .accidental-white-key {fill:#deede8;stroke:#b5cbc4;stroke-width:1;}
.welcome-accidental-demo .accidental-black-key {fill:#355862;stroke:#284b55;stroke-width:1;transition:stroke .18s,fill .18s;}
.welcome-accidental-demo .accidental-answer {fill:#efad74;stroke:#c46d32;stroke-width:2;}
.welcome-accidental-demo.includes-black .accidental-answer {fill:#d87536;stroke:#a95525;}
.welcome-accidental-demo svg text {font-family:inherit;fill:#43666b;font-size:14px;font-weight:600;text-anchor:middle;}
.personal-preview .accidental-explanation {margin:0;text-align:center;color:#45636b;font-size:12px;line-height:1.45;}
@media(max-width:599px),(max-height:600px) {
  .personal-preview.personal-preview-keys .welcome-accidental-demo {height:100%;max-height:100%;gap:6px;}
  .welcome-accidental-demo .accidental-setting {padding:7px 9px;}
  .welcome-accidental-demo .select-option .value-box {min-height:40px;}
}
@media(prefers-reduced-motion:reduce) {.welcome-accidental-demo * {transition:none!important;}}
</style>
