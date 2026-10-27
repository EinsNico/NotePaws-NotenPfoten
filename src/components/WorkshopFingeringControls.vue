<template>
  <section class="fingering-controls" :class="{'is-compact':compact}" :aria-label="$t('WORKSHOP_FINGERING')">
    <div class="fingering-heading"><h3>{{$t('WORKSHOP_FINGERING')}}</h3><span v-if="singleNote" class="fingering-current" aria-live="polite">{{currentLabel}}</span><button v-if="compact && singleNote" type="button" :disabled="!entries.length" :aria-label="$t('WORKSHOP_FINGERING_CLEAR')" @click="clear">×</button></div>
    <template v-if="singleNote">
      <div class="finger-choices" role="group" :aria-label="$t('WORKSHOP_FINGERING_SET')">
        <button v-for="finger in [1,2,3,4,5]" :key="finger" type="button" :class="{ selected:simpleFinger === finger }" :aria-pressed="simpleFinger === finger" :aria-label="$t('WORKSHOP_FINGERING_FINGER',{finger})" @click="chooseFinger(finger)">{{finger}}</button>
        <button v-if="!compact" type="button" class="clear-fingerings" :disabled="!entries.length" @click="clear">{{$t('WORKSHOP_FINGERING_CLEAR')}}</button>
      </div>
      <details class="fingering-details">
        <summary>{{$t('WORKSHOP_FINGERING_DETAILS')}}</summary>
        <div v-for="(entry,index) in entries" :key="index" class="fingering-entry">
          <div class="fingering-entry-top">
            <label>{{$t('WORKSHOP_FINGERING_ENTRY',{number:index+1})}}<input :value="entry.value" :maxlength="maxChars" :aria-label="$t('WORKSHOP_FINGERING_ENTRY',{number:index+1})" @change="changeValue(index,$event)" /></label>
            <button type="button" class="remove-fingering" :aria-label="$t('WORKSHOP_FINGERING_REMOVE_ENTRY',{number:index+1})" @click="removeEntry(index)">×</button>
          </div>
          <div class="fingering-flags">
            <label><input type="checkbox" :checked="!!entry.substitution" @change="changeEntry(index,'substitution',$event.target.checked)" />{{$t('WORKSHOP_FINGERING_SUBSTITUTION')}}</label>
            <label><input type="checkbox" :checked="!!entry.alternate" @change="changeEntry(index,'alternate',$event.target.checked)" />{{$t('WORKSHOP_FINGERING_ALTERNATE')}}</label>
          </div>
          <label class="fingering-placement">{{$t('WORKSHOP_FINGERING_PLACEMENT')}}<select :value="entry.placement || ''" @change="changeEntry(index,'placement',$event.target.value)"><option value="">{{$t('WORKSHOP_AUTOMATIC')}}</option><option value="above">{{$t('WORKSHOP_FINGERING_ABOVE')}}</option><option value="below">{{$t('WORKSHOP_FINGERING_BELOW')}}</option></select></label>
        </div>
        <div class="fingering-add-actions">
          <button type="button" :disabled="entries.length >= maxEntries" @click="addEntry()">＋ {{$t('WORKSHOP_FINGERING_ADD')}}</button>
          <button type="button" :disabled="!entries.length || entries.length >= maxEntries" @click="addEntry('substitution')">{{$t('WORKSHOP_FINGERING_ADD_CHANGE')}}</button>
          <button type="button" :disabled="!entries.length || entries.length >= maxEntries" @click="addEntry('alternate')">{{$t('WORKSHOP_FINGERING_ADD_ALTERNATIVE')}}</button>
        </div>
        <p class="fingering-hint">{{$t('WORKSHOP_FINGERING_DETAILS_HINT')}}</p>
      </details>
      <p v-if="error" class="fingering-error" role="alert">{{$t('WORKSHOP_FINGERING_INVALID',{max:maxChars})}}</p>
    </template>
    <p v-else class="fingering-hint" role="status">{{$t(mixed ? 'WORKSHOP_FINGERING_MIXED_HINT' : 'WORKSHOP_FINGERING_SELECT_ONE')}}</p>
  </section>
</template>

<script>
import { workshopFingerings, isValidWorkshopFingerings, WORKSHOP_MAX_FINGERINGS, WORKSHOP_MAX_FINGERING_CHARS } from '../model/WorkshopFingerings';

export default {
  name:'WorkshopFingeringControls',
  props:{ selectedNotes:{ type:Array,default:()=>[] }, compact:{type:Boolean,default:false} },
  data(){ return { error:false,maxEntries:WORKSHOP_MAX_FINGERINGS,maxChars:WORKSHOP_MAX_FINGERING_CHARS }; },
  computed:{
    singleNote(){ return this.selectedNotes.length === 1 ? this.selectedNotes[0] : null; },
    entries(){ return this.singleNote ? workshopFingerings(this.singleNote) : []; },
    simpleFinger(){
      const entries=this.entries;
      return entries.length && /^[1-5]$/.test(entries[0].value) ? Number(entries[0].value) : null;
    },
    mixed(){ return new Set(this.selectedNotes.map(event=>JSON.stringify(workshopFingerings(event)))).size > 1; },
    selectionIdentity(){ return this.selectedNotes.map(event=>event.id).join('|'); },
    currentLabel(){
      return this.entries.map((entry,index)=>{
        const value=entry.alternate ? '('+entry.value+')' : entry.value;
        return (entry.substitution && index ? '–' : index ? ' ' : '')+value;
      }).join('') || this.$t('WORKSHOP_NONE');
    }
  },
  watch:{ selectionIdentity(){ this.error=false; } },
  methods:{
    chooseFinger(finger){
      if (!this.singleNote || ![1,2,3,4,5].includes(finger)) return false;
      const entries=workshopFingerings(this.singleNote);
      if (entries.length > 1 || entries.length && (entries[0].substitution || entries[0].alternate || entries[0].placement)) {
        entries[0].value=String(finger); return this.commit(entries);
      }
      this.error=false; this.$emit('simple',String(finger)); return true;
    },
    clear(){ if (!this.singleNote || !this.entries.length) return; this.error=false; this.$emit('change',[]); },
    commit(entries){
      if (!this.singleNote) return false;
      if (entries.length && !isValidWorkshopFingerings(entries)) { this.error=true; return false; }
      this.error=false; this.$emit('change',entries); return true;
    },
    changeEntry(index,field,value){
      // Edit a fresh snapshot so invalid input cannot alter the computed display.
      const entries=workshopFingerings(this.singleNote);
      if (!entries[index] || !['value','substitution','alternate','placement'].includes(field)) return false;
      if (field === 'value') entries[index].value=String(value).trim();
      else if (value) entries[index][field]=value; else delete entries[index][field];
      return this.commit(entries);
    },
    changeValue(index,event){ const changed=this.changeEntry(index,'value',event.target.value); if (!changed && this.entries[index]) event.target.value=this.entries[index].value; return changed; },
    addEntry(kind){
      const entries=workshopFingerings(this.singleNote);
      if (!this.singleNote || entries.length >= this.maxEntries || kind && !['substitution','alternate'].includes(kind) || kind && !entries.length) return false;
      const last=entries[entries.length-1];
      const entry={ value:last && last.value === '1' ? '2' : '1' };
      if (kind) entry[kind]=true;
      entries.push(entry); return this.commit(entries);
    },
    removeEntry(index){ const entries=workshopFingerings(this.singleNote); if (!entries[index]) return false; entries.splice(index,1); return this.commit(entries); }
  }
};
</script>

<style scoped>
.fingering-controls { margin-top:12px; padding-top:12px; border-top:1px solid #d2dfda; text-align:left; min-width:0; }
.fingering-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
h3 { margin:0; color:#34585f; font-size:13px; }
.fingering-current { color:#a65332; font-size:13px; font-weight:700; overflow-wrap:anywhere; text-align:right; }
.finger-choices { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; margin-top:9px; }
button { min-height:44px; padding:7px; border:1px solid #cbdcde; border-radius:10px; background:#fffefa; color:#23464f; font-size:13px; font-weight:700; cursor:pointer; }
button.selected { background:#2e7b88; border-color:#2e7b88; color:#fff; }
button:disabled { opacity:.45; cursor:default; }
button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline:2px solid #d86a34; outline-offset:2px; }
.clear-fingerings { grid-column:1 / -1; min-height:38px; font-size:11px; }
.fingering-details { margin-top:9px; }
summary { min-height:38px; display:flex; align-items:center; cursor:pointer; font-size:12px; color:#526e74; list-style:none; }
summary::-webkit-details-marker { display:none; }
summary::before { content:'›'; font-size:20px; margin-right:8px; }
.fingering-details[open] > summary::before { transform:rotate(90deg); }
.fingering-entry { padding:10px; margin:8px 0; border:1px solid #d5e1dc; border-radius:10px; background:#fffaf3; }
.fingering-entry-top { display:grid; grid-template-columns:minmax(0,1fr) 44px; gap:8px; align-items:end; }
label { display:flex; flex-direction:column; gap:5px; font-size:11px; font-weight:700; }
input:not([type=checkbox]),select { box-sizing:border-box; width:100%; min-width:0; min-height:44px; padding:8px; border:1px solid #cbdcde; border-radius:9px; background:#fffefa; color:#23464f; font-size:14px; }
.remove-fingering { font-size:22px; font-weight:400; }
.fingering-flags { display:flex; flex-wrap:wrap; gap:4px 14px; margin:8px 0; }
.fingering-flags label { flex-direction:row; align-items:center; min-height:38px; }
.fingering-flags input { width:18px; height:18px; margin:0; accent-color:#2e7b88; }
.fingering-placement { margin-top:4px; }
.fingering-add-actions { display:grid; grid-template-columns:1fr; gap:6px; }
.fingering-add-actions button { font-size:11px; }
.fingering-hint,.fingering-error { margin:8px 0 0; font-size:11px; line-height:1.5; color:#637b7f; }
.fingering-error { color:#ae4f36; }
.is-compact {margin-top:10px;padding-top:10px;}
.is-compact .fingering-heading {gap:8px;}.is-compact .fingering-heading button {flex:0 0 44px;font-size:22px;}
.is-compact .finger-choices {margin-top:4px;}.is-compact .fingering-details {margin-top:4px;}
</style>
