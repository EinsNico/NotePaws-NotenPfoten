<template>
  <details ref="panel" class="context-changes">
    <summary>{{$t('WORKSHOP_CONTEXT_CHANGE_TITLE')}}</summary>
    <p class="hint">{{$t('WORKSHOP_CONTEXT_CHANGE_HINT')}}</p>
    <ul v-if="changes.length" class="change-list">
      <li v-for="entry in changes" :key="entry.id">
        <button type="button" class="change-entry" :class="{selected:editingId === entry.id}" :aria-pressed="editingId === entry.id" @click="editChange(entry.id)">
          {{changeLabel(entry)}}<small>{{$t('WORKSHOP_CONTEXT_CHANGE_EDIT')}}</small>
        </button>
        <button type="button" class="remove" :aria-label="$t('WORKSHOP_REMOVE')+': '+changeLabel(entry)" @click="removeChange(entry.id)">×</button>
      </li>
    </ul>
    <p v-else class="hint">{{$t('WORKSHOP_CONTEXT_CHANGE_EMPTY')}}</p>
    <p v-if="editingId" class="editing" role="status">{{$t('WORKSHOP_CONTEXT_CHANGE_EDITING')}}</p>
    <label>{{$t('WORKSHOP_START_BEAT')}}
      <input v-model.number="startBeat" type="number" min="1" :max="maximumBeat" :step="beatStep" />
    </label>
    <p class="hint position-hint">{{$t('WORKSHOP_CONTEXT_CHANGE_POSITION_HINT')}}</p>
    <div class="fields">
      <label>{{$t('WORKSHOP_CONTEXT_CHANGE_CLEF')}}
        <select v-model="clef">
          <option value="">{{$t('WORKSHOP_CONTEXT_CHANGE_KEEP')}}</option>
          <option v-for="name in clefs" :key="name" :value="name">{{$t('WORKSHOP_CLEF_'+name.toUpperCase())}}</option>
        </select>
      </label>
      <label>{{$t('WORKSHOP_CONTEXT_CHANGE_KEY')}}
        <select v-model="keyId">
          <option value="">{{$t('WORKSHOP_CONTEXT_CHANGE_KEEP')}}</option>
          <optgroup v-for="mode in ['major','minor']" :key="mode" :label="$t(mode === 'major' ? 'FLOW_KEY_MAJOR' : 'FLOW_KEY_MINOR')">
            <option v-for="key in keys.filter(item=>item.mode === mode)" :key="key.id" :value="key.id">{{keyLabel(key.id)}}</option>
          </optgroup>
        </select>
      </label>
    </div>
    <details class="pitch-options">
      <summary>{{$t('WORKSHOP_PITCH_CONTEXT_DETAILS')}}</summary>
      <label>{{$t('WORKSHOP_CLEF_OCTAVE')}}<select v-model="clefOctave"><option value="">{{$t('WORKSHOP_CONTEXT_CHANGE_KEEP')}}</option><option v-for="value in [-2,-1,0,1,2]" :key="value" :value="value">{{value === 0 ? $t('WORKSHOP_CLEF_OCTAVE_NORMAL') : (Math.abs(value) === 1 ? '8' : '15')+' '+$t(value < 0 ? 'WORKSHOP_CLEF_OCTAVE_BELOW' : 'WORKSHOP_CLEF_OCTAVE_ABOVE')}}</option></select></label>
      <label class="key-scope"><input v-model="useTranspose" type="checkbox" />{{$t('WORKSHOP_TRANSPOSE_CHANGE')}}</label>
      <div v-if="useTranspose" class="fields">
        <label>{{$t('WORKSHOP_TRANSPOSE_CHROMATIC')}}<input v-model.number="chromatic" type="number" min="-24" max="24" step="1" /></label>
        <label>{{$t('WORKSHOP_TRANSPOSE_DIATONIC')}}<input v-model.number="diatonic" type="number" min="-14" max="14" step="1" /></label>
        <label>{{$t('WORKSHOP_TRANSPOSE_OCTAVES')}}<input v-model.number="octaveChange" type="number" min="-2" max="2" step="1" /></label>
      </div>
    </details>
    <template v-if="score.parts.length > 1">
      <label class="key-scope"><input type="checkbox" :checked="partOnly" @change="$emit('scope-change',$event.target.checked)" />{{$t('WORKSHOP_KEY_STAFF_ONLY',{staff:$t(partIndex === 0 ? 'WORKSHOP_STAFF_UPPER' : 'WORKSHOP_STAFF_LOWER')})}}</label>
      <p class="hint">{{$t('WORKSHOP_KEY_STAFF_ONLY_HINT')}}</p>
    </template>
    <div class="actions">
      <button type="button" class="save" :disabled="!canSave" @click="saveChange">{{$t(editingId ? 'WORKSHOP_CONTEXT_CHANGE_SAVE' : 'WORKSHOP_CONTEXT_CHANGE_ADD')}}</button>
      <button v-if="editingId" type="button" @click="cancelEditing">{{$t('WORKSHOP_CONTEXT_CHANGE_CANCEL')}}</button>
    </div>
    <p v-if="error" role="alert" class="error">{{$t('WORKSHOP_CONTEXT_CHANGE_BLOCKED')}}</p>
  </details>
</template>

<script>
import { workshopMeasureContext, setWorkshopContextChange, removeWorkshopContextChange, WORKSHOP_CLEFS } from '../model/Workshop';
import { workshopOrderedContextChanges, isValidWorkshopContextChanges } from '../model/WorkshopContextChanges';
import { WORKSHOP_TICKS_PER_UNIT, workshopTimeTicks, workshopMeasureGridStep } from '../model/WorkshopRhythm';
import { NOTE_FLOW_TONALITIES, getNoteFlowTonality } from '../model/NoteFlowTonality';
import { formatNoteFlowTonalityLabel } from '../model/NoteFlowKeyLabels';

export default {
  name:'WorkshopContextControls',
  props:{score:{type:Object,required:true},barIndex:{type:Number,default:0},partIndex:{type:Number,default:0},partOnly:{type:Boolean,default:false},selectedEvents:{type:Array,default:()=>[]},noteNaming:{type:String,default:'international'}},
  data() {return {editingId:null,editingSnapshot:null,editingContext:null,startBeat:2,clef:'',keyId:'',clefOctave:'',useTranspose:false,chromatic:0,diatonic:0,octaveChange:0,error:false,keys:NOTE_FLOW_TONALITIES,clefs:WORKSHOP_CLEFS};},
  computed:{
    measure() {const part=this.score.parts[this.partIndex];return part && part.measures[this.barIndex] || {events:[]};},
    context() {return workshopMeasureContext(this.score,this.barIndex,this.partIndex);},
    changes() {return workshopOrderedContextChanges(this.measure);},
    beatUnits() {return this.context ? 8/Number(this.context.meter.split('/')[1]) : 2;},
    stepUnits() {return Math.min(workshopMeasureGridStep(this.measure),this.context ? this.context.units/2 : .5);},
    beatStep() {return this.stepUnits/this.beatUnits;},
    maximumBeat() {return this.context ? 1+(this.context.units-1/WORKSHOP_TICKS_PER_UNIT)/this.beatUnits : 1;},
    changeDraft() {const entry={id:this.editingId || 'draft-context',startSlot:(Number(this.startBeat)-1)*this.beatUnits};if(this.clef)entry.clef=this.clef;if(this.keyId)entry.keyId=this.keyId;if(this.clefOctave!=='')entry.clefOctave=Number(this.clefOctave);if(this.useTranspose)entry.transpose={chromatic:this.chromatic,diatonic:this.diatonic,octaveChange:this.octaveChange};return entry;},
    canSave() {return !!this.context && isValidWorkshopContextChanges([this.changeDraft],this.context.units);}
  },
  created() {this.resetPosition();},
  watch:{
    barIndex() {this.cancelEditing();},partIndex() {this.cancelEditing();},
    selectedEvents() {if(!this.editingId)this.resetPosition();},
    score() {if(this.editingId && !this.editingIsCurrent())this.cancelEditing();else if(!this.editingId && this.context && (Number(this.startBeat)-1)*this.beatUnits>=this.context.units)this.resetPosition();}
  },
  methods:{
    resetPosition() {
      if(!this.context){this.startBeat=1;return;}
      const selected=this.selectedEvents.filter(event=>Number.isFinite(event.startSlot) && event.startSlot>0 && event.startSlot<this.context.units).sort((a,b)=>a.startSlot-b.startSlot)[0];
      const slot=selected ? selected.startSlot : workshopTimeTicks(Math.min(this.beatUnits,this.context.units/2))/WORKSHOP_TICKS_PER_UNIT;
      this.startBeat=1+slot/this.beatUnits;this.error=false;
    },
    contextSignature() {return JSON.stringify([this.partIndex,this.barIndex,this.measure.id,this.context,this.measure.contextChanges || []]);},
    editingIsCurrent() {const entry=this.changes.find(item=>item.id===this.editingId);return !!entry && JSON.stringify(entry)===this.editingSnapshot && this.contextSignature()===this.editingContext;},
    editChange(id) {
      const entry=this.changes.find(item=>item.id===id);if(!entry)return false;
      this.editingId=id;this.editingSnapshot=JSON.stringify(entry);this.editingContext=this.contextSignature();
      this.startBeat=1+entry.startSlot/this.beatUnits;this.clef=entry.clef || '';this.keyId=entry.keyId || '';this.error=false;
      this.clefOctave=entry.clefOctave===undefined?'':entry.clefOctave;this.useTranspose=!!entry.transpose;this.chromatic=entry.transpose && entry.transpose.chromatic || 0;this.diatonic=entry.transpose && entry.transpose.diatonic || 0;this.octaveChange=entry.transpose && entry.transpose.octaveChange || 0;
      if(this.$refs.panel)this.$refs.panel.open=true;return true;
    },
    cancelEditing() {this.editingId=null;this.editingSnapshot=null;this.editingContext=null;this.clef='';this.keyId='';this.clefOctave='';this.useTranspose=false;this.chromatic=0;this.diatonic=0;this.octaveChange=0;this.resetPosition();},
    saveChange() {
      if(this.editingId && !this.editingIsCurrent()){this.cancelEditing();return false;}
      if(!this.canSave){this.error=true;return false;}
      const entry=Object.assign({},this.changeDraft);if(!this.editingId)delete entry.id;
      const score=setWorkshopContextChange(this.score,this.barIndex,this.partIndex,entry,{partOnly:this.partOnly});
      if(!score){this.error=true;return false;}
      this.error=false;this.$emit('change',score);this.cancelEditing();return true;
    },
    removeChange(id) {
      const score=removeWorkshopContextChange(this.score,this.barIndex,this.partIndex,id,{partOnly:this.partOnly});
      if(!score){this.error=true;return false;}
      this.error=false;this.$emit('change',score);if(this.editingId===id)this.cancelEditing();return true;
    },
    keyLabel(id) {const key=getNoteFlowTonality(id);return key && key.id===id ? formatNoteFlowTonalityLabel(key,this.noteNaming)+' '+this.$t(key.mode==='minor' ? 'FLOW_KEY_MINOR' : 'FLOW_KEY_MAJOR') : '';},
    changeLabel(entry) {const values=[];if(entry.clef)values.push(this.$t('WORKSHOP_CLEF_'+entry.clef.toUpperCase()));if(entry.keyId)values.push(this.keyLabel(entry.keyId));if(entry.clefOctave!==undefined)values.push(this.$t('WORKSHOP_CLEF_OCTAVE')+' '+entry.clefOctave);if(entry.transpose)values.push(this.$t('WORKSHOP_TRANSPOSE_CHANGE')+' '+entry.transpose.chromatic+' / '+(entry.transpose.octaveChange || 0));return this.$t('WORKSHOP_POSITION',{beat:Number((1+entry.startSlot/this.beatUnits).toFixed(4))})+' · '+values.join(' · ');}
  }
};
</script>

<style scoped>
.context-changes {margin:12px 0;padding:10px;border:1px solid #d3e0da;border-radius:12px;background:#f4f8f4;text-align:left;}
summary {cursor:pointer;font-weight:700;font-size:12px;min-height:28px;color:#365b64;}
.hint {color:#637c80;font-size:11px;line-height:1.5;}.position-hint {margin:5px 0;}.editing {color:#2e7b88;font-size:12px;font-weight:700;}.error {color:#a24c35;font-size:12px;}
label {display:flex;flex-direction:column;gap:5px;font-size:11px;margin-top:10px;min-width:0;}
input,select,button {box-sizing:border-box;min-height:42px;border:1px solid #c7d9d7;border-radius:9px;font:inherit;color:#2d515b;background:#fffdf8;min-width:0;padding:8px;}
input,select {width:100%;}input:focus-visible,select:focus-visible,button:focus-visible {outline:3px solid #dd7135;outline-offset:2px;}button {cursor:pointer;font-weight:700;}button:disabled {opacity:.45;cursor:default;}
.fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 9px;}.actions {display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}.save {flex:1;}.selected {background:#2e7b88;color:#fff;border-color:#2e7b88;}
.key-scope {flex-direction:row;align-items:center;}.key-scope input {width:auto;min-height:20px;}
.change-list {margin:10px 0;padding:0;list-style:none;}.change-list li {display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #dae4df;font-size:11px;}.change-entry {flex:1;text-align:left;overflow-wrap:anywhere;}.change-entry small {display:block;margin-top:4px;font-size:10px;opacity:.8;}.remove {flex:0 0 36px;min-height:36px;}
</style>
