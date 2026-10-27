<template>
  <div class="pedal-controls">
    <div class="fields">
      <label>{{$t('WORKSHOP_PEDAL_KIND')}}<select :value="value.kind" @change="changeKind($event.target.value)"><option v-for="kind in kinds" :key="kind" :value="kind">{{$t('WORKSHOP_PEDAL_KIND_'+kind.toUpperCase())}}</option></select></label>
      <label>{{$t('WORKSHOP_PEDAL_ACTION')}}<select :value="value.action" @change="changeAction($event.target.value)"><option v-for="action in actions" :key="action" :value="action">{{$t('WORKSHOP_PEDAL_ACTION_'+action.toUpperCase())}}</option></select></label>
    </div>
    <label v-if="!['stop','discontinue'].includes(value.action)">{{$t('WORKSHOP_PEDAL_STRENGTH')}}<input :value="value.strength" type="number" min="0" max="100" step="any" @change="change('strength',Number($event.target.value))" /></label>
    <div v-if="value.kind !== 'soft'" class="choices">
      <label><input type="checkbox" :checked="value.line" @change="change('line',$event.target.checked)" />{{$t('WORKSHOP_PEDAL_SHOW_LINE')}}</label>
      <label><input type="checkbox" :checked="value.sign" @change="change('sign',$event.target.checked)" />{{$t('WORKSHOP_PEDAL_SHOW_SIGN')}}</label>
    </div>
    <details><summary>{{$t('WORKSHOP_PEDAL_DETAILS')}}</summary><div class="fields">
      <label>{{$t('WORKSHOP_PEDAL_PLACEMENT')}}<select :value="value.placement" @change="change('placement',$event.target.value)"><option value="above">{{$t('WORKSHOP_PEDAL_ABOVE')}}</option><option value="below">{{$t('WORKSHOP_PEDAL_BELOW')}}</option></select></label>
      <label v-if="value.kind !== 'soft'">{{$t('WORKSHOP_PEDAL_NUMBER')}}<input :value="value.number" type="number" min="1" max="16" step="1" @change="change('number',Number($event.target.value))" /></label>
    </div><label v-if="value.kind !== 'soft'" class="check"><input type="checkbox" :checked="value.abbreviated" @change="change('abbreviated',$event.target.checked)" />{{$t('WORKSHOP_PEDAL_ABBREVIATED')}}</label></details>
    <p class="hint">{{$t('WORKSHOP_PEDAL_NOT_ASSESSED')}}</p>
  </div>
</template>

<script>
import { WORKSHOP_PEDAL_KINDS,WORKSHOP_PEDAL_ACTIONS } from '../model/WorkshopPedal';
export default {
  name:'WorkshopPedalControls',props:{value:{type:Object,required:true}},
  computed:{kinds(){return WORKSHOP_PEDAL_KINDS;},actions(){return this.value.kind === 'soft' ? ['start','stop'] : WORKSHOP_PEDAL_ACTIONS;}},
  methods:{
    change(field,value){this.$emit('input',Object.assign({},this.value,{[field]:value}));},
    changeAction(action){this.$emit('input',Object.assign({},this.value,{action,strength:['stop','discontinue'].includes(action)?0:this.value.strength || 100}));},
    changeKind(kind){const next=Object.assign({},this.value,{kind});if(kind === 'soft'){next.action=['stop','discontinue'].includes(next.action)?'stop':'start';next.line=false;next.sign=true;next.abbreviated=false;}this.$emit('input',next);}
  }
};
</script>

<style scoped>
.pedal-controls{margin-top:10px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}label{display:flex;flex-direction:column;gap:5px;font-size:11px;margin-top:10px}input,select{width:100%;box-sizing:border-box;min-height:42px;border:1px solid #c7d9d7;border-radius:9px;background:#fffdf8;color:#2d515b;padding:8px;font:inherit;min-width:0}input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #dd7135;outline-offset:2px}.choices{display:flex;gap:14px;flex-wrap:wrap}.choices label,.check{flex-direction:row;align-items:center;gap:7px;min-height:36px}.choices input,.check input{width:18px;min-height:18px;margin:0;flex:0 0 18px}details{margin-top:10px}summary{cursor:pointer;min-height:28px;font-weight:700;font-size:11px;color:#365b64}.hint{font-size:11px;line-height:1.5;color:#637c80}
</style>
