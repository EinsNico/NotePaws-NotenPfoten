<template>
  <details class="pitch-controls">
    <summary>{{$t('WORKSHOP_PITCH_CONTEXT_DETAILS')}}</summary>
    <p class="hint">{{$t('WORKSHOP_PITCH_CONTEXT_HINT')}}</p>
    <label>{{$t('WORKSHOP_CLEF_OCTAVE')}}<select v-model.number="clefOctave"><option v-for="value in [-2,-1,0,1,2]" :key="value" :value="value">{{octaveLabel(value)}}</option></select></label>
    <div class="fields">
      <label>{{$t('WORKSHOP_TRANSPOSE_CHROMATIC')}}<input v-model.number="chromatic" type="number" min="-24" max="24" step="1" /></label>
      <label>{{$t('WORKSHOP_TRANSPOSE_DIATONIC')}}<input v-model.number="diatonic" type="number" min="-14" max="14" step="1" /></label>
    </div>
    <label>{{$t('WORKSHOP_TRANSPOSE_OCTAVES')}}<input v-model.number="octaveChange" type="number" min="-2" max="2" step="1" /></label>
    <div class="actions"><button type="button" @click="apply">{{$t('WORKSHOP_PITCH_CONTEXT_APPLY')}}</button><button type="button" @click="reset">{{$t('WORKSHOP_PITCH_CONTEXT_RESET')}}</button></div>
    <p v-if="error" role="alert" class="error">{{$t('WORKSHOP_PITCH_CONTEXT_BLOCKED')}}</p>
  </details>
</template>
<script>
import { workshopMeasureContext, setWorkshopMeasureContext } from '../model/Workshop';
export default {
  name:'WorkshopPitchContextControls',props:{score:{type:Object,required:true},barIndex:{type:Number,default:0},partIndex:{type:Number,default:0}},
  data(){return {clefOctave:0,chromatic:0,diatonic:0,octaveChange:0,error:false};},
  computed:{context(){return workshopMeasureContext(this.score,this.barIndex,this.partIndex);}},
  created(){this.sync();},watch:{score(){this.sync();},barIndex(){this.sync();},partIndex(){this.sync();}},
  methods:{
    sync(){const context=this.context || {},transpose=context.transpose || {};this.clefOctave=context.clefOctave || 0;this.chromatic=transpose.chromatic || 0;this.diatonic=transpose.diatonic || 0;this.octaveChange=transpose.octaveChange || 0;this.error=false;},
    octaveLabel(value){return value===0?this.$t('WORKSHOP_CLEF_OCTAVE_NORMAL'):(Math.abs(value)===1?'8':'15')+' '+this.$t(value<0?'WORKSHOP_CLEF_OCTAVE_BELOW':'WORKSHOP_CLEF_OCTAVE_ABOVE');},
    commit(changes){const score=setWorkshopMeasureContext(this.score,this.barIndex,changes,this.partIndex,{partOnly:true});if(!score){this.error=true;return false;}this.error=false;this.$emit('change',score);return true;},
    apply(){return this.commit({clefOctave:this.clefOctave,transpose:{chromatic:this.chromatic,diatonic:this.diatonic,octaveChange:this.octaveChange}});},
    reset(){return this.commit({clefOctave:0,transpose:{chromatic:0,diatonic:0,octaveChange:0}});}
  }
};
</script>
<style scoped>
.pitch-controls{margin:12px 0;padding:10px;border:1px solid #d3e0da;border-radius:10px;background:#f4f8f4;}summary{cursor:pointer;font-size:12px;font-weight:700;min-height:28px;}label{display:flex;flex-direction:column;gap:5px;font-size:12px;margin-top:9px;min-width:0;}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}input,select,button{box-sizing:border-box;min-height:42px;min-width:0;padding:8px;border:1px solid #c7d9d7;border-radius:8px;background:#fffdf8;color:#2d515b;font:inherit;}input,select{width:100%;}button{cursor:pointer;}input:focus-visible,select:focus-visible,button:focus-visible{outline:3px solid #dd7135;outline-offset:2px;}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}.hint{color:#637c80;font-size:11px;line-height:1.5;}.error{color:#a24c35;font-size:12px;}
</style>
