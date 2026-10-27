<template>
  <details class="route-controls">
    <summary>{{$t('WORKSHOP_ROUTE_DETAILS')}}</summary>
    <ul class="routes"><li v-for="(entry,index) in entries" :key="index">
      <button type="button" :aria-pressed="editingIndex === index" @click="edit(index)">{{label(entry)}}</button>
      <button type="button" :aria-label="$t('WORKSHOP_REMOVE')+': '+label(entry)" @click="remove(index)">×</button>
    </li></ul>
    <label>{{$t('WORKSHOP_ROUTE_KIND')}}<select v-model="kind"><option v-for="type in kinds" :key="type" :value="type">{{kindLabel(type)}}</option></select></label>
    <label v-if="kind === 'segno' || kind === 'coda'">{{$t('WORKSHOP_ROUTE_NAME')}}<input v-model="routeName" maxlength="64" /></label>
    <label v-if="kind === 'ds' || kind === 'toCoda'">{{$t('WORKSHOP_ROUTE_TARGET')}}<select v-model="target"><option value="">{{$t('WORKSHOP_ROUTE_DEFAULT')}}</option><option v-for="name in targets" :key="name" :value="name">{{name}}</option></select></label>
    <label>{{$t('WORKSHOP_ROUTE_PASSES')}}<input v-model="passesText" inputmode="numeric" maxlength="31" placeholder="1, 2" /></label>
    <p class="hint">{{$t('WORKSHOP_ROUTE_PASSES_HINT')}}</p>
    <div class="actions"><button type="button" @click="save">{{$t(editingIndex === null ? 'WORKSHOP_ROUTE_ADD' : 'WORKSHOP_ROUTE_SAVE')}}</button><button v-if="editingIndex !== null" type="button" @click="cancel">{{$t('WORKSHOP_CONTEXT_CHANGE_CANCEL')}}</button></div>
    <p v-if="error" role="alert" class="error">{{$t('WORKSHOP_ROUTE_BLOCKED')}}</p>
  </details>
</template>
<script>
import { setWorkshopMeasureNavigation } from '../model/Workshop';
import { WORKSHOP_NAVIGATION_KINDS, workshopNavigationEntry } from '../model/WorkshopNavigation';
export default {
  name:'WorkshopRouteControls',props:{score:{type:Object,required:true},barIndex:{type:Number,default:0}},
  data(){return {kinds:WORKSHOP_NAVIGATION_KINDS,kind:'segno',routeName:'',target:'',passesText:'',editingIndex:null,snapshot:null,error:false};},
  computed:{
    measure(){return this.score.parts[0].measures[this.barIndex];},entries(){return (this.measure.navigation || []).map(workshopNavigationEntry);},
    targets(){const kind=this.kind==='ds'?'segno':'coda';return this.score.parts[0].measures.flatMap(bar=>(bar.navigation || []).map(workshopNavigationEntry)).filter(entry=>entry.kind===kind && entry.label).map(entry=>entry.label);}
  },watch:{barIndex(){this.cancel();},kind(){this.target='';},score(){if(this.editingIndex!==null && JSON.stringify(this.measure.navigation || [])!==this.snapshot)this.cancel();}},
  methods:{
    kindLabel(kind){return {segno:'𝄋 Segno',coda:'𝄌 Coda',dc:'D.C.',ds:'D.S.',toCoda:'To Coda',fine:'Fine'}[kind];},
    label(entry){return this.kindLabel(entry.kind)+(entry.label?' '+entry.label:'')+(entry.target?' → '+entry.target:'')+(entry.passes?' · '+entry.passes.join(',')+'.':'');},
    cancel(){this.editingIndex=null;this.snapshot=null;this.routeName='';this.target='';this.passesText='';this.error=false;},
    edit(index){const entry=this.entries[index];if(!entry)return false;this.kind=entry.kind;this.routeName=entry.label || '';this.passesText=(entry.passes || []).join(', ');this.editingIndex=index;this.snapshot=JSON.stringify(this.measure.navigation || []);this.$nextTick(()=>{if(this.editingIndex===index)this.target=entry.target || '';});return true;},
    commit(entries,rename){const score=setWorkshopMeasureNavigation(this.score,this.barIndex,{navigation:entries},rename?{rename}:{});if(!score){this.error=true;return false;}this.$emit('change',score);this.cancel();return true;},
    save(){
      if(this.editingIndex!==null && JSON.stringify(this.measure.navigation || [])!==this.snapshot){this.cancel();return false;}
      const entry={kind:this.kind};if(['segno','coda'].includes(this.kind) && this.routeName.trim())entry.label=this.routeName.trim();if(['ds','toCoda'].includes(this.kind) && this.target)entry.target=this.target;
      if(this.passesText.trim()) {if(!/^\s*[1-8](?:\s*,\s*[1-8])*\s*$/.test(this.passesText)){this.error=true;return false;}entry.passes=this.passesText.split(',').map(value=>Number(value.trim()));}
      const entries=(this.measure.navigation || []).slice();if(this.editingIndex===null)entries.push(entry);else entries.splice(this.editingIndex,1,entry);
      const previous=this.editingIndex===null?null:this.entries[this.editingIndex],rename=previous && previous.kind===entry.kind && ['segno','coda'].includes(entry.kind) && previous.label && previous.label!==entry.label?{kind:entry.kind,from:previous.label,to:entry.label || ''}:null;
      return this.commit(entries,rename);
    },remove(index){const entries=(this.measure.navigation || []).slice();entries.splice(index,1);return this.commit(entries);}
  }
};
</script>
<style scoped>
.route-controls{margin:12px 0;padding:10px;border:1px solid #d3e0da;border-radius:10px;background:#f4f8f4;}summary{cursor:pointer;font-weight:700;font-size:12px;min-height:28px;}label{display:flex;flex-direction:column;gap:5px;margin-top:9px;font-size:12px;}input,select,button{box-sizing:border-box;min-height:42px;min-width:0;max-width:100%;padding:8px;border:1px solid #c7d9d7;border-radius:8px;background:#fffdf8;color:#2d515b;font:inherit;}input,select{width:100%;}button{cursor:pointer;overflow-wrap:anywhere;}input:focus-visible,select:focus-visible,button:focus-visible{outline:3px solid #dd7135;outline-offset:2px;}.routes{margin:8px 0;padding:0;list-style:none;}.routes li{display:flex;gap:7px;margin:5px 0;}.routes button:first-child{flex:1;text-align:left;}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}.hint{font-size:11px;color:#637c80;line-height:1.5;}.error{color:#a24c35;font-size:12px;}
</style>
