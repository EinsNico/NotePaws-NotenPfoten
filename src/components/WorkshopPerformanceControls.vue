<template>
  <div class="performance-controls">
    <details v-if="ornamentNotes.length"><summary>{{$t('WORKSHOP_ORNAMENT_DETAILS')}}</summary>
      <div class="fields"><label v-for="side in ['upper','lower']" :key="side">{{$t('WORKSHOP_ORNAMENT_ACCIDENTAL_'+side.toUpperCase())}}
        <select :value="commonNested(ornamentNotes,'ornamentAccidentals',side,'')" @change="setNested('ornamentAccidentals',side,$event.target.value,ornamentNotes)">
          <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_AUTOMATIC')}}</option><option v-for="alter in alterations" :key="alter" :value="alter">{{accidentalLabel(alter)}}</option>
        </select></label></div>
      <label v-if="mordentNotes.length">{{$t('WORKSHOP_ORNAMENT_LONG')}}<select :value="commonFlat(mordentNotes,'ornamentLong',false)" @change="setFlat('ornamentLong',$event.target.value==='true',mordentNotes)"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option :value="false">{{$t('WORKSHOP_ORNAMENT_SHORT')}}</option><option :value="true">{{$t('WORKSHOP_ORNAMENT_LONG')}}</option></select></label>
    </details>
    <label v-if="placedOrnaments.length">{{$t('WORKSHOP_ORNAMENT_PLACEMENT')}}<select :value="commonFlat(placedOrnaments,'ornamentPlacement','')" @change="setFlat('ornamentPlacement',$event.target.value||null,placedOrnaments)"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_AUTOMATIC')}}</option><option value="above">{{$t('WORKSHOP_FINGERING_ABOVE')}}</option><option value="below">{{$t('WORKSHOP_FINGERING_BELOW')}}</option></select></label>
    <details v-if="notes.length"><summary>{{$t('WORKSHOP_ORNAMENT_WAVY')}}</summary>
      <label>{{$t('WORKSHOP_ORNAMENT_WAVY_TYPE')}}<select :value="commonNested(notes,'ornamentWavy','type','')" @change="setWavy($event.target.value)"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_NONE')}}</option><option v-for="type in ['start','continue','stop']" :key="type" :value="type">{{$t('WORKSHOP_ORNAMENT_WAVY_'+type.toUpperCase())}}</option></select></label>
      <label v-if="notes.some(event=>event.ornamentWavy)">{{$t('WORKSHOP_ORNAMENT_WAVY_NUMBER')}}<input type="number" min="1" max="16" step="1" :value="commonNested(notes,'ornamentWavy','number',1)==='mixed'?'':commonNested(notes,'ornamentWavy','number',1)" :placeholder="$t('WORKSHOP_MIXED')" @change="setWavyNumber($event.target.value)" /></label>
    </details>
    <details v-if="graceNotes.length"><summary>{{$t('WORKSHOP_GRACE_TIMING')}}</summary>
      <div class="fields"><label v-for="field in ['stealPrevious','stealFollowing']" :key="field">{{$t(field==='stealPrevious'?'WORKSHOP_GRACE_STEAL_PREVIOUS':'WORKSHOP_GRACE_STEAL_FOLLOWING')}}
        <input type="number" min="0" max="100" step="any" :value="commonNested(graceNotes,'graceTiming',field,'')==='mixed'?'':commonNested(graceNotes,'graceTiming',field,'')" :placeholder="$t(commonNested(graceNotes,'graceTiming',field,'')==='mixed'?'WORKSHOP_MIXED':'WORKSHOP_AUTOMATIC')" @change="setNested('graceTiming',field,$event.target.value,graceNotes)" />
      </label></div>
      <label>{{$t('WORKSHOP_GRACE_MAKE_TIME')}}<input type="number" min="0" max="64" step="any" :value="makeTimeValue" :placeholder="$t(commonNested(graceNotes,'graceTiming','makeTime','')==='mixed'?'WORKSHOP_MIXED':'WORKSHOP_AUTOMATIC')" @change="setNested('graceTiming','makeTime',$event.target.value===''?'':Number($event.target.value)*2,graceNotes)" /></label>
      <p class="hint">{{$t('WORKSHOP_GRACE_TIMING_HINT')}}</p>
    </details>
    <p v-if="error" class="error" role="alert">{{$t('WORKSHOP_ADVANCED_BLOCKED')}}</p>
  </div>
</template>
<script>
import { cloneWorkshop,isValidWorkshopScore } from '../model/Workshop';
export default {
  name:'WorkshopPerformanceControls',
  props:{score:{type:Object,required:true},selectedEvents:{type:Array,default:()=>[]},barIndex:{type:Number,default:0},partIndex:{type:Number,default:0}},
  data(){return {error:false,alterations:[-2,-1.5,-1,-.5,0,.5,1,1.5,2]};},
  computed:{
    notes(){return this.selectedEvents.filter(event=>event.kind==='note');},
    ornamentNotes(){return this.notes.filter(event=>event.ornament && event.ornament!=='tremolo' || event.ornamentWavy);},
    mordentNotes(){return this.notes.filter(event=>['mordent','inverted-mordent'].includes(event.ornament));},
    placedOrnaments(){return this.notes.filter(event=>event.ornament || event.ornamentWavy);},
    graceNotes(){return this.notes.filter(event=>event.grace);},
    makeTimeValue(){const value=this.commonNested(this.graceNotes,'graceTiming','makeTime','');return value==='' || value==='mixed'?'':value/2;}
  },
  watch:{selectedEvents(){this.error=false;}},
  methods:{
    commonFlat(events,key,fallback){const values=events.map(event=>event[key]===undefined?fallback:event[key]);return new Set(values.map(value=>JSON.stringify(value))).size>1?'mixed':values[0]===undefined?fallback:values[0];},
    commonNested(events,key,field,fallback){const values=events.map(event=>event[key] && event[key][field]!==undefined?event[key][field]:fallback);return new Set(values.map(value=>JSON.stringify(value))).size>1?'mixed':values[0]===undefined?fallback:values[0];},
    update(events,operation){
      if(!events.length)return false;
      const score=cloneWorkshop(this.score),ids=new Set(events.map(event=>event.id));score.parts[this.partIndex].measures[this.barIndex].events.filter(event=>ids.has(event.id)).forEach(operation);
      if(!isValidWorkshopScore(score)){this.error=true;return false;}this.error=false;
      if(JSON.stringify(score)===JSON.stringify(this.score))return false;this.$emit('change',score);return true;
    },
    setNested(key,field,value,events){
      if(!['ornamentAccidentals','graceTiming'].includes(key) || !['upper','lower','stealPrevious','stealFollowing','makeTime'].includes(field))return false;
      return this.update(events,event=>{const details=Object.assign({},event[key]);if(value==='')delete details[field];else details[field]=Number(value);if(Object.keys(details).length)event[key]=details;else delete event[key];});
    },
    setFlat(key,value,events){if(!['ornamentLong','ornamentPlacement'].includes(key))return false;return this.update(events,event=>{if(value===null)delete event[key];else event[key]=value;});},
    setWavy(type){return this.update(this.notes,event=>{if(!type){delete event.ornamentWavy;if(!event.ornament){delete event.ornamentAccidentals;delete event.ornamentPlacement;}}else event.ornamentWavy={type,number:event.ornamentWavy?event.ornamentWavy.number:1};});},
    setWavyNumber(value){return this.update(this.notes.filter(event=>event.ornamentWavy),event=>{event.ornamentWavy.number=Number(value);});},
    accidentalLabel(alter){return {'-2':'𝄫','-1.5':'−¾','-1':'♭','-0.5':'−¼','0':'♮','0.5':'+¼','1':'♯','1.5':'+¾','2':'𝄪'}[alter];}
  }
};
</script>
<style scoped>
details {margin-top:10px;padding-top:8px;border-top:1px solid #d3e0da;text-align:left;}
summary {cursor:pointer;color:#365b64;font-size:12px;font-weight:700;min-height:32px;}
label {display:flex;flex-direction:column;gap:5px;margin-top:9px;font-size:11px;}
input,select {width:100%;box-sizing:border-box;min-width:0;min-height:42px;padding:8px;border:1px solid #c7d9d7;border-radius:9px;color:#2d515b;background:#fffdf8;font:inherit;}
.fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}
.hint,.error {font-size:11px;line-height:1.5;color:#637c80;}.error {color:#a24c35;}
input:focus-visible,select:focus-visible,summary:focus-visible {outline:2px solid #dd7135;outline-offset:2px;}
</style>
