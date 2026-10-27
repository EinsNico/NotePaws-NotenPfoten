<template>
  <details class="advanced-notation">
    <summary>{{$t('WORKSHOP_ADVANCED_'+section.toUpperCase())}}</summary>
    <template v-if="section === 'document'">
      <label v-for="field in metadataFields" :key="field">{{$t('WORKSHOP_META_'+field.toUpperCase())}}
        <textarea :value="(score.metadata || {})[field] || ''" :rows="field === 'copyright' ? 7 : 2" maxlength="2048" @change="setMetadata(field,$event.target.value)" />
      </label>
      <WorkshopSourceLinks :value="(score.metadata || {}).sources || []" @input="setSources" />
      <div class="fields">
        <label v-for="field in layoutFields" :key="field">{{$t('WORKSHOP_LAYOUT_'+field.toUpperCase())}}
          <input type="number" :min="layoutMinimum(field)" :max="layoutMaximum(field)" :step="field === 'barsPerSystem' ? 1 : 'any'" :value="layoutValue(field)" :placeholder="$t('WORKSHOP_AUTOMATIC')" @change="setLayout(field,$event.target.value)" />
        </label>
      </div>
      <label>{{$t('WORKSHOP_LAYOUT_FONTFAMILY')}}
        <input :value="layoutValue('fontFamily')" maxlength="200" list="workshop-font-families" :placeholder="$t('WORKSHOP_AUTOMATIC')" @change="setLayout('fontFamily',$event.target.value)" />
        <datalist id="workshop-font-families"><option value="serif">{{$t('WORKSHOP_FONT_SERIF')}}</option><option value="sans-serif">{{$t('WORKSHOP_FONT_SANS')}}</option></datalist>
      </label>
      <p class="hint">{{$t('WORKSHOP_LAYOUT_HINT')}}</p>
    </template>
    <template v-else-if="section === 'selection'">
      <p v-if="!selectedEvents.length" class="hint">{{$t('WORKSHOP_ADVANCED_SELECT_HINT')}}</p>
      <template v-else>
        <div class="fields">
          <label>{{$t('WORKSHOP_DOTS_COUNT')}}<select :value="commonValue('dots',0)" @change="setNoteProperty('dots',Number($event.target.value))">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option v-for="dots in [0,1,2,3]" :key="dots" :value="dots">{{dots ? '·'.repeat(dots) : $t('WORKSHOP_NONE')}}</option>
          </select></label>
          <label>𝄐 {{$t('WORKSHOP_FERMATA_FACTOR')}}<input type="number" min="1.25" max="4" step="any" :aria-describedby="fermataHintId" :value="commonValue('fermata','') === 'mixed' ? '' : commonValue('fermata','')" :placeholder="$t(commonValue('fermata','') === 'mixed' ? 'WORKSHOP_MIXED' : 'WORKSHOP_NONE')" @change="setNoteProperty('fermata',$event.target.value === '' ? null : Number($event.target.value))" /><small :id="fermataHintId" class="hint">{{$t('WORKSHOP_FERMATA_FACTOR_HINT')}}</small></label>
          <label v-if="selectedEvents.some(event=>event.fermata)">{{$t('WORKSHOP_FERMATA_SHAPE')}}<select :value="commonValue('fermataShape','normal')" @change="setNoteProperty('fermataShape',$event.target.value)"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option v-for="shape in ['normal','angled','square']" :key="shape" :value="shape">{{$t('WORKSHOP_FERMATA_SHAPE_'+shape.toUpperCase())}}</option></select></label>
          <label>{{$t('WORKSHOP_ORNAMENT')}}<select :disabled="!notes.length" :value="commonValue('ornament','')" @change="setNoteProperty('ornament',$event.target.value || null)">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_NONE')}}</option><option v-for="kind in ornaments" :key="kind" :value="kind">{{$t('WORKSHOP_ORNAMENT_'+kind.toUpperCase().replace(/-/g,'_'))}}</option>
          </select></label>
          <label v-if="notes.some(event=>event.ornament === 'tremolo')">{{$t('WORKSHOP_TREMOLO_MARKS')}}<select :value="commonValue('tremoloMarks',3)" @change="setNoteProperty('tremoloMarks',Number($event.target.value))"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option v-for="count in [1,2,3,4]" :key="count" :value="count">{{count}}</option></select></label>
          <label>{{$t('WORKSHOP_ARPEGGIO')}}<select :disabled="!notes.length" :value="commonValue('arpeggio','')" @change="setNoteProperty('arpeggio',$event.target.value || null)">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_NONE')}}</option><option value="up">↑ {{$t('WORKSHOP_ARPEGGIO_UP')}}</option><option value="down">↓ {{$t('WORKSHOP_ARPEGGIO_DOWN')}}</option>
          </select></label>
          <label>{{$t('WORKSHOP_GRACE')}}<select :disabled="!notes.length" :value="commonValue('grace',false)" @change="setNoteProperty('grace',$event.target.value === 'true' ? true : null)">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option :value="false">{{$t('WORKSHOP_NORMAL_NOTE')}}</option><option :value="true">{{$t('WORKSHOP_GRACE_NOTE')}}</option>
          </select></label>
          <label v-if="notes.some(event=>event.grace)">{{$t('WORKSHOP_GRACE_SLASH')}}<select :value="commonValue('graceSlash',true)" @change="setNoteProperty('graceSlash',$event.target.value === 'true')"><option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option :value="true">{{$t('WORKSHOP_SLASHED')}}</option><option :value="false">{{$t('WORKSHOP_UNSLASHED')}}</option></select></label>
          <label>{{$t('WORKSHOP_STEM')}}<select :disabled="!notes.length" :value="commonValue('stem','')" @change="setNoteProperty('stem',$event.target.value || null)">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option value="">{{$t('WORKSHOP_AUTOMATIC')}}</option><option value="up">↑</option><option value="down">↓</option>
          </select></label>
          <label v-if="score.parts.length > 1 && score.parts[1].enabled !== false">{{$t('WORKSHOP_DISPLAY_STAFF')}}<select :disabled="!notes.length" :value="commonValue('displayStaff',partIndex)" @change="setNoteProperty('displayStaff',Number($event.target.value))">
            <option value="mixed" disabled>{{$t('WORKSHOP_MIXED')}}</option><option :value="0">{{$t('WORKSHOP_STAFF_UPPER')}}</option><option :value="1">{{$t('WORKSHOP_STAFF_LOWER')}}</option>
          </select></label>
        </div>
        <WorkshopPerformanceControls :score="score" :selected-events="selectedEvents" :bar-index="barIndex" :part-index="partIndex" @change="commit" />
        <label>{{$t('WORKSHOP_LYRIC')}}<textarea :disabled="notes.length !== 1" :value="primaryLyric" rows="2" maxlength="1024" @change="setPrimaryLyric($event.target.value)" /></label>
        <details v-if="notes.length === 1" class="lyric-details"><summary>{{$t('WORKSHOP_LYRIC_DETAILS')}}</summary>
          <div v-for="(entry,index) in lyricEntries" :key="index" class="lyric-entry">
            <label>{{$t('WORKSHOP_LYRIC_VERSE')}}<input :value="entry.number" maxlength="32" @change="changeLyric(index,'number',$event.target.value)" /></label>
            <label>{{$t('WORKSHOP_LYRIC')}}<textarea :value="entry.text" rows="2" maxlength="1024" @change="changeLyric(index,'text',$event.target.value)" /></label>
            <div class="fields"><label>{{$t('WORKSHOP_LYRIC_SYLLABIC')}}<select :value="entry.syllabic || 'single'" @change="changeLyric(index,'syllabic',$event.target.value)"><option v-for="kind in ['single','begin','middle','end']" :key="kind" :value="kind">{{$t('WORKSHOP_LYRIC_SYLLABIC_'+kind.toUpperCase())}}</option></select></label>
              <label>{{$t('WORKSHOP_LYRIC_EXTEND')}}<select :value="entry.extend || ''" @change="changeLyric(index,'extend',$event.target.value)"><option value="">{{$t('WORKSHOP_NONE')}}</option><option v-for="kind in ['start','continue','stop']" :key="kind" :value="kind">{{$t('WORKSHOP_LYRIC_EXTEND_'+kind.toUpperCase())}}</option></select></label></div>
            <button type="button" @click="removeLyric(index)">{{$t('WORKSHOP_REMOVE')}}</button>
          </div><button type="button" :disabled="lyricEntries.length >= 8" @click="addLyric">＋ {{$t('WORKSHOP_LYRIC_ADD_VERSE')}}</button>
        </details>
        <div class="fields tuplet-fields">
          <label>{{$t('WORKSHOP_TUPLET_ACTUAL')}}<input v-model.number="actual" type="number" min="2" max="9" /></label>
          <label>{{$t('WORKSHOP_TUPLET_NORMAL')}}<input v-model.number="normal" type="number" min="2" max="9" /></label>
        </div>
        <p v-if="tupletSelectionMixed" class="hint">{{$t('WORKSHOP_TUPLET_MIXED')}}</p>
        <div class="actions"><button type="button" :disabled="!canApplyTuplet" @click="setTuplet">{{$t('WORKSHOP_TUPLET_APPLY')}}</button><button type="button" :disabled="!selectedEvents.some(event=>event.tuplet)" @click="clearTuplet">{{$t('WORKSHOP_TUPLET_REMOVE')}}</button></div>
        <p class="hint">{{$t('WORKSHOP_TUPLET_HINT')}}</p>
        <div class="actions"><button type="button" :disabled="notes.length !== 2" @click="connectGlissando('glissando')">{{$t('WORKSHOP_GLISSANDO')}}</button><button type="button" :disabled="notes.length !== 2" @click="connectGlissando('slide')">{{$t('WORKSHOP_SLIDE')}}</button><button type="button" :disabled="!hasSelectedGlissandos" @click="clearGlissandos">{{$t('WORKSHOP_GLISSANDO_REMOVE')}}</button></div>
        <label>{{$t('WORKSHOP_TREMOLO_PAIR_MARKS')}}<select v-model.number="pairMarks" :disabled="!notes.length" @change="changePairMarks"><option v-for="count in [1,2,3,4]" :key="count" :value="count">{{count}}</option></select></label>
        <div class="actions"><button type="button" :disabled="notes.length !== 2" @click="setPairTremolo">{{$t('WORKSHOP_TREMOLO_PAIR_APPLY')}}</button><button type="button" :disabled="!hasSelectedTremolos" @click="clearTremolos">{{$t('WORKSHOP_TREMOLO_PAIR_REMOVE')}}</button></div>
      </template>
    </template>
    <template v-else>
      <div class="actions"><button type="button" :class="{selected:hasBreak('systemBreaks')}" :aria-pressed="hasBreak('systemBreaks')" @click="toggleBreak('systemBreaks')">{{$t('WORKSHOP_SYSTEM_BREAK')}}</button><button type="button" :class="{selected:hasBreak('pageBreaks')}" :aria-pressed="hasBreak('pageBreaks')" @click="toggleBreak('pageBreaks')">{{$t('WORKSHOP_PAGE_BREAK')}}</button></div>
      <p class="hint">{{$t('WORKSHOP_ENDINGS_HINT')}}</p>
      <div class="compact-buttons"><button v-for="pass in [1,2,3,4,5,6,7,8]" :key="pass" type="button" :class="{ selected:(measure.ending || []).includes(pass) }" :aria-pressed="(measure.ending || []).includes(pass)" @click="toggleEnding(pass)">{{pass}}.</button></div>
      <div class="compact-buttons navigation"><button v-for="kind in navigation" :key="kind" type="button" :class="{ selected:hasNavigation(kind) }" :aria-pressed="hasNavigation(kind)" @click="toggleNavigation(kind)">{{navigationLabel(kind)}}</button></div>
      <WorkshopRouteControls :score="score" :bar-index="barIndex" @change="commit" />
      <WorkshopPitchContextControls :score="score" :bar-index="barIndex" :part-index="partIndex" @change="commit" />
      <h3>{{$t('WORKSHOP_TIMED_DIRECTIONS')}}</h3>
      <ul class="directions"><li v-for="entry in measure.directions || []" :key="entry.id">
        <button class="direction-entry" type="button" :class="{selected:editingDirectionId === entry.id}" :aria-pressed="editingDirectionId === entry.id" :aria-label="$t('WORKSHOP_EDIT_DIRECTION')+': '+directionLabel(entry)" @click="editDirection(entry.id)">{{directionLabel(entry)}} <span class="direction-edit-label">{{$t('WORKSHOP_EDIT_DIRECTION')}}</span></button>
        <button class="remove-direction" type="button" :aria-label="$t('WORKSHOP_REMOVE')+': '+directionLabel(entry)" @click="removeDirection(entry.id)">×</button>
      </li></ul>
      <p v-if="editingDirectionId" class="direction-editing" role="status">{{$t('WORKSHOP_EDITING_DIRECTION')}}</p>
      <label>{{$t('WORKSHOP_DIRECTION_TYPE')}}<select v-model="directionType"><option v-for="kind in directionTypes" :key="kind" :value="kind">{{$t('WORKSHOP_DIRECTION_'+kind.toUpperCase())}}</option></select></label>
      <div class="fields">
        <label>{{$t('WORKSHOP_START_BEAT')}}<input v-model.number="startBeat" type="number" min="1" :max="beats+1" :step="beatStep" /></label>
        <template v-if="hasSpan"><label>{{$t('WORKSHOP_END_BAR')}}<input v-model.number="endBar" type="number" :min="barIndex+1" :max="score.parts[0].measures.length" /></label><label>{{$t('WORKSHOP_END_BEAT')}}<input v-model.number="endBeat" type="number" min="1" :max="endBeats+1" :step="endBeatStep" /></label></template>
      </div>
      <label v-if="directionType === 'tempo' || directionType === 'tempoRamp'">{{$t(directionType === 'tempoRamp' ? 'WORKSHOP_TARGET_TEMPO' : 'WORKSHOP_TEMPO')}}<input v-model.number="tempo" type="number" min="25" max="240" /></label>
      <label v-else-if="directionType === 'dynamic'">{{$t('WORKSHOP_DIRECTION_DYNAMIC')}}<select v-model="dynamic"><option v-for="value in dynamics" :key="value" :value="value">{{value}}</option></select></label>
      <label v-else-if="directionType === 'wedge'">{{$t('WORKSHOP_DIRECTION_WEDGE')}}<select v-model="wedge"><option value="crescendo">&lt; {{$t('WORKSHOP_CRESCENDO')}}</option><option value="diminuendo">&gt; {{$t('WORKSHOP_DIMINUENDO')}}</option></select></label>
      <label v-else-if="directionType === 'octaveShift'">{{$t('WORKSHOP_DIRECTION_OCTAVESHIFT')}}<select v-model.number="octaveShift"><option :value="1">8va</option><option :value="-1">8vb</option><option :value="2">15ma</option><option :value="-2">15mb</option></select></label>
      <WorkshopPedalControls v-else-if="directionType === 'pedal'" :value="pedalDraft" @input="setPedalDetails" />
      <label v-else-if="directionType === 'text'">{{$t('WORKSHOP_DIRECTION_TEXT')}}<input v-model="words" maxlength="2048" /></label>
      <template v-else-if="directionType === 'swing'">
        <label>{{$t('WORKSHOP_SWING_MODE')}}<select v-model="swingMode"><option value="swing">Swing</option><option value="straight">{{$t('WORKSHOP_SWING_STRAIGHT')}}</option></select></label>
        <template v-if="swingMode==='swing'"><div class="fields"><label>{{$t('WORKSHOP_SWING_FIRST')}}<input v-model.number="swingFirst" type="number" min="1" max="99" step="1" /></label><label>{{$t('WORKSHOP_SWING_SECOND')}}<input v-model.number="swingSecond" type="number" min="1" max="99" step="1" /></label></div>
          <label>{{$t('WORKSHOP_SWING_UNIT')}}<select v-model="swingUnit"><option value="eighth">{{$t('WORKSHOP_SWING_EIGHTH')}}</option><option value="sixteenth">{{$t('WORKSHOP_SWING_SIXTEENTH')}}</option></select></label>
          <label>{{$t('WORKSHOP_SWING_STYLE')}}<input v-model="swingStyle" maxlength="128" /></label></template>
      </template>
      <div class="actions direction-actions">
        <button class="add-direction" type="button" @click="addDirection">{{editingDirectionId ? $t('WORKSHOP_UPDATE_DIRECTION') : '＋ '+$t('WORKSHOP_ADD_DIRECTION')}}</button>
        <button v-if="editingDirectionId" type="button" @click="cancelDirectionEditing">{{$t('WORKSHOP_CANCEL_DIRECTION_EDIT')}}</button>
      </div>
      <p class="hint">{{$t('WORKSHOP_DIRECTIONS_HINT')}}</p>
    </template>
    <p v-if="error" class="error" role="alert">{{$t('WORKSHOP_ADVANCED_BLOCKED')}}</p>
  </details>
</template>

<script>
import WorkshopSourceLinks from './WorkshopSourceLinks';
import WorkshopRouteControls from './WorkshopRouteControls';
import WorkshopPitchContextControls from './WorkshopPitchContextControls';
import { workshopNavigationKind } from '../model/WorkshopNavigation';
import WorkshopPedalControls from './WorkshopPedalControls';
import { isValidWorkshopPedal,workshopPedal,workshopPedalValue } from '../model/WorkshopPedal';
import WorkshopPerformanceControls from './WorkshopPerformanceControls';
import { WORKSHOP_EXPRESSION_ORNAMENTS,workshopSwingLabel } from '../model/WorkshopPerformanceDetails';
import { cloneWorkshop, isValidWorkshopScore, workshopId, workshopMeasureContext, resolveWorkshopMeasure,
  setWorkshopMetadata, setWorkshopLayout, setWorkshopMeasureDirections, setWorkshopMeasureNavigation,
  workshopMeasureEvents, workshopRequestedDots } from '../model/Workshop';
import { workshopTupletRatio } from '../model/WorkshopRhythm';
import { canMakeWorkshopTuplet, makeWorkshopTuplet, splitWorkshopTriplets, replaceWorkshopEvents } from '../model/WorkshopScoreEditor';
import { repairWorkshopTies } from '../model/WorkshopTies';
import { repairWorkshopSlurs, repairWorkshopGlissandos, repairWorkshopTremolos, connectWorkshopGlissando, disconnectWorkshopGlissandos,
  connectWorkshopTremolo, disconnectWorkshopTremolos } from '../model/WorkshopExpression';

export default {
  name:'WorkshopNotationControls',
  components:{WorkshopSourceLinks,WorkshopPerformanceControls,WorkshopPedalControls,WorkshopRouteControls,WorkshopPitchContextControls},
  props:{ score:{ type:Object,required:true },section:{ type:String,default:'bar' },barIndex:{ type:Number,default:0 },partIndex:{ type:Number,default:0 },selectedEvents:{ type:Array,default:()=>[] } },
  data() { return { error:false,editingDirectionId:null,editingDirectionSnapshot:null,editingDirectionContext:null,actual:5,normal:4,pairMarks:3,directionType:'tempo',startBeat:1,endBeat:3,endBar:this.barIndex+1,tempo:this.score.bpm,dynamic:'mf',wedge:'crescendo',octaveShift:1,pedal:'down',pedalDetails:null,words:'',
    metadataFields:['subtitle','composer','arranger','lyricist','copyright','license'],layoutFields:['barsPerSystem','staffDistance','systemDistance','fontSize','pageWidth','pageHeight','marginLeft','marginRight','marginTop','marginBottom'],
    swingMode:'swing',swingFirst:2,swingSecond:1,swingUnit:'eighth',swingStyle:'',
    ornaments:WORKSHOP_EXPRESSION_ORNAMENTS,navigation:['segno','coda','fine','dc','ds','toCoda'],
    directionTypes:['tempo','tempoRamp','dynamic','wedge','octaveShift','pedal','text','swing'],dynamics:['ppp','pp','p','mp','mf','f','ff','fff','sf','sfz','fp'] }; },
  computed:{ measure() { return this.score.parts[this.partIndex].measures[this.barIndex]; },notes() { return this.selectedEvents.filter(event=>event.kind === 'note'); },
    fermataHintId() { return 'workshop-fermata-factor-'+this._uid; },
    pedalDraft() { return Object.assign(workshopPedal({value:this.pedal}),this.pedalDetails || {}); },
    selectedResolvedEvents() { const ids=new Set(this.selectedEvents.map(event=>event.id));return workshopMeasureEvents(resolveWorkshopMeasure(this.score,this.barIndex,this.partIndex)).filter(event=>ids.has(event.id)); },
    lyricEntries() { const note=this.notes.length === 1 ? this.notes[0] : null;return note ? cloneWorkshop(note.lyrics || (note.lyric ? [{number:'1',text:note.lyric}] : [])) : []; },
    primaryLyric() { return this.lyricEntries.length ? this.lyricEntries[0].text : ''; },
    tupletSelectionMixed() { return new Set(this.selectedEvents.map(event=>JSON.stringify(workshopTupletRatio(event)))).size > 1; },
    canApplyTuplet() {
      if (!this.selectedEvents.length || this.selectedEvents.every(event=>{const ratio=workshopTupletRatio(event);return ratio && ratio.actual === this.actual && ratio.normal === this.normal;})) return false;
      const ids=this.selectedEvents.map(event=>event.id),original=resolveWorkshopMeasure(this.score,this.barIndex,this.partIndex);
      const plain=this.selectedEvents.some(event=>event.tuplet) ? splitWorkshopTriplets(original,ids) : original.events;
      return !!plain && canMakeWorkshopTuplet(Object.assign({},original,{events:plain}),ids,this.actual,this.normal);
    },
    hasSelectedGlissandos() { const ids=new Set(this.notes.map(event=>event.id));return (this.score.glissandos || []).some(edge=>ids.has(edge.fromId) || ids.has(edge.toId)); },
    selectedTremolos() { const ids=new Set(this.notes.map(event=>event.id));return (this.score.tremolos || []).filter(edge=>ids.has(edge.fromId) || ids.has(edge.toId)); },
    hasSelectedTremolos() { return this.selectedTremolos.length > 0; },
    beatUnits() { return 8/Number(workshopMeasureContext(this.score,this.barIndex,this.partIndex).meter.split('/')[1]); },beatStep() { return 0.25/this.beatUnits; },beats() { return workshopMeasureContext(this.score,this.barIndex,this.partIndex).units/this.beatUnits; },endIndex() { const index=Number(this.endBar)-1;return Number.isInteger(index) ? Math.max(this.barIndex,Math.min(this.score.parts[0].measures.length-1,index)) : this.barIndex; },endBeatUnits() { return 8/Number(workshopMeasureContext(this.score,this.endIndex,this.partIndex).meter.split('/')[1]); },endBeats() { return workshopMeasureContext(this.score,this.endIndex,this.partIndex).units/this.endBeatUnits; },endBeatStep() { return 0.25/this.endBeatUnits; },hasSpan() { return ['tempoRamp','wedge','octaveShift'].includes(this.directionType); } },
  created() { this.syncTupletSelection();this.syncPairMarks(); },
  watch:{
    barIndex() { this.cancelDirectionEditing(); },partIndex() { this.cancelDirectionEditing(); },
    selectedEvents() { if (!this.editingDirectionId) this.resetPosition();this.syncTupletSelection();this.syncPairMarks(); },
    score() { if (this.editingDirectionId && !this.directionEditingIsCurrent()) this.cancelDirectionEditing(); }
  },
  methods:{
    setPedalDetails(value) { this.pedalDetails=cloneWorkshop(value);this.error=!isValidWorkshopPedal(value);if(!this.error)this.pedal=workshopPedalValue(value); },
    pedalLabel(entry) { const pedal=workshopPedal(entry);return this.$t('WORKSHOP_PEDAL_KIND_'+pedal.kind.toUpperCase())+' · '+this.$t('WORKSHOP_PEDAL_ACTION_'+pedal.action.toUpperCase())+(['stop','discontinue'].includes(pedal.action)?'':' · '+pedal.strength+'%'); },
    resetPosition() { this.error=false; this.endBar=this.barIndex+1; const selected=this.selectedResolvedEvents[0]; this.startBeat=selected ? selected.startSlot/this.beatUnits+1 : 1; this.endBeat=Math.min(this.beats+1,this.startBeat+2); },
    commit(score) { if (score) score=repairWorkshopTremolos(repairWorkshopGlissandos(repairWorkshopSlurs(repairWorkshopTies(score)))); if (!score || !isValidWorkshopScore(score)) { this.error=true; return false; } this.error=false;if (JSON.stringify(score) === JSON.stringify(this.score)) return false;this.$emit('change',score); return true; },
    propertyEvents(key) {
      const events=['dots','fermata','fermataShape'].includes(key) ? this.selectedEvents : this.notes;
      return events.filter(event=>key !== 'fermataShape' || event.fermata).filter(event=>key !== 'graceSlash' || event.grace).filter(event=>key !== 'tremoloMarks' || event.ornament === 'tremolo');
    },
    commonValue(key,fallback) { const values=this.propertyEvents(key).map(event=>key === 'dots' ? workshopRequestedDots(event) : event[key] === undefined ? fallback : event[key]); return new Set(values).size > 1 ? 'mixed' : values[0] === undefined ? fallback : values[0]; },
    setMetadata(key,value) { const metadata=Object.assign({},this.score.metadata); if (value) metadata[key]=value; else delete metadata[key]; this.commit(setWorkshopMetadata(this.score,metadata)); },
    setSources(value) { const metadata=Object.assign({},this.score.metadata); if (value.length) metadata.sources=value;else delete metadata.sources;this.commit(setWorkshopMetadata(this.score,metadata)); },
    layoutValue(key) { const value=(this.score.layout || {})[key];return value === undefined ? '' : value; },
    layoutMinimum(key) { return key === 'barsPerSystem' ? 1 : 0; },layoutMaximum(key) { return key === 'barsPerSystem' ? 8 : 10000; },
    setLayout(key,value) { const layout=Object.assign({},this.score.layout); if (value === '') delete layout[key]; else layout[key]=key === 'fontFamily' ? value : Number(value); this.commit(setWorkshopLayout(this.score,layout)); },
    setNoteProperty(key,value) { const score=cloneWorkshop(this.score),ids=new Set(this.propertyEvents(key).map(event=>event.id));if (!ids.size) {this.error=false;return false;}
      const change=event=>{
      if (!ids.has(event.id)) return event;
      if (event.kind === 'rest') event.autoRest=false;
      if (value === null || key === 'dots' && value === 0 || key === 'displayStaff' && value === this.partIndex) delete event[key]; else event[key]=value;
      if (key === 'dots') { if (event.originalNoteValue) event.noteValue=event.originalNoteValue; delete event.originalNoteValue; delete event.originalDots; }
      if (key === 'fermata' && value === null) delete event.fermataShape;
      if (key === 'grace' && value === null) {delete event.graceSlash;delete event.graceTiming;}
      if (key === 'ornament' && value !== 'tremolo') delete event.tremoloMarks;
      if (key === 'ornament' && (value === 'tremolo' || value === null && !event.ornamentWavy)) delete event.ornamentAccidentals;
      if (key === 'ornament' && !['mordent','inverted-mordent'].includes(value)) delete event.ornamentLong;
      if (key === 'ornament' && value === null && !event.ornamentWavy) delete event.ornamentPlacement;
      if (key === 'lyrics') delete event.lyric;
      if (key === 'lyric') delete event.lyrics;
      return event;
    };
      const measure=score.parts[this.partIndex].measures[this.barIndex];
      if (['dots','grace'].includes(key)) { const updates=this.selectedResolvedEvents.filter(event=>ids.has(event.id)).map(event=>change(cloneWorkshop(event))); const events=replaceWorkshopEvents(resolveWorkshopMeasure(this.score,this.barIndex,this.partIndex),updates); if (!events) {this.error=true;return false;} measure.events=events; }
      else measure.events.forEach(change);
      return this.commit(score);
    },
    setPrimaryLyric(value) { if (this.notes.length !== 1) return false;if (!this.notes[0].lyrics) return this.setNoteProperty('lyric',value || null);const entries=this.lyricEntries;if (entries.length) entries[0].text=value;else if (value) entries.push({number:'1',text:value});return this.setNoteProperty('lyrics',entries.length ? entries : null); },
    changeLyric(index,key,value) { const entries=this.lyricEntries;if (!entries[index]) return false;if (!value && ['syllabic','extend'].includes(key)) delete entries[index][key];else entries[index][key]=value;return this.setNoteProperty('lyrics',entries); },
    addLyric() { if (this.notes.length !== 1 || this.lyricEntries.length >= 8) return false;const entries=this.lyricEntries;let number=1;while (entries.some(entry=>entry.number === String(number))) number++;entries.push({number:String(number),text:''});return this.setNoteProperty('lyrics',entries); },
    removeLyric(index) { const entries=this.lyricEntries.filter((entry,i)=>i !== index);return this.setNoteProperty('lyrics',entries.length ? entries : null); },
    syncTupletSelection() { const ratios=this.selectedEvents.map(workshopTupletRatio),ratio=ratios[0];if (this.tupletSelectionMixed) {this.actual='';this.normal='';}else {this.actual=ratio ? ratio.actual : 5;this.normal=ratio ? ratio.normal : 4;} },
    setTuplet() { if (!this.canApplyTuplet) {this.error=false;return false;} const score=cloneWorkshop(this.score),measure=score.parts[this.partIndex].measures[this.barIndex];
      const ids=this.selectedEvents.map(event=>event.id),original=resolveWorkshopMeasure(this.score,this.barIndex,this.partIndex);
      const plain=this.selectedEvents.some(event=>event.tuplet) ? splitWorkshopTriplets(original,ids) : original.events;
      const events=plain && makeWorkshopTuplet(Object.assign({},original,{events:plain}),ids,this.actual,this.normal);
      if (!events) { this.error=true; return; } measure.events=events; this.commit(score); },
    clearTuplet() { const score=cloneWorkshop(this.score),measure=score.parts[this.partIndex].measures[this.barIndex]; const events=splitWorkshopTriplets(resolveWorkshopMeasure(this.score,this.barIndex,this.partIndex),this.selectedEvents.map(event=>event.id)); if (!events) { this.error=true; return; } measure.events=events; this.commit(score); },
    connectGlissando(type) { return this.commit(connectWorkshopGlissando(this.score,this.notes.map(event=>event.id),type)); },
    clearGlissandos() { return this.commit(disconnectWorkshopGlissandos(this.score,this.notes.map(event=>event.id))); },
    syncPairMarks() { const values=this.selectedTremolos.map(edge=>edge.marks);this.pairMarks=values.length && values.every(value=>value === values[0]) ? values[0] : 3; },
    setPairTremolo() { return this.commit(connectWorkshopTremolo(this.score,this.notes.map(event=>event.id),this.pairMarks)); },
    changePairMarks() { if (this.selectedTremolos.length !== 1) return false;const edge=this.selectedTremolos[0];return this.commit(connectWorkshopTremolo(this.score,[edge.fromId,edge.toId],this.pairMarks)); },
    clearTremolos() { return this.commit(disconnectWorkshopTremolos(this.score,this.notes.map(event=>event.id))); },
    hasBreak(key) { return ((this.score.layout || {})[key] || []).includes(this.score.parts[0].measures[this.barIndex].id); },
    toggleBreak(key) { const layout=Object.assign({},this.score.layout),id=this.score.parts[0].measures[this.barIndex].id; const ids=(layout[key] || []).filter(value=>value !== id); if (!this.hasBreak(key)) ids.push(id); if (ids.length) layout[key]=ids; else delete layout[key]; this.commit(setWorkshopLayout(this.score,layout)); },
    toggleEnding(pass) { const ending=(this.measure.ending || []).filter(value=>value !== pass); if (!(this.measure.ending || []).includes(pass)) ending.push(pass); this.commit(setWorkshopMeasureNavigation(this.score,this.barIndex,{ending:ending.sort((a,b)=>a-b),navigation:this.measure.navigation || []})); },
    hasNavigation(kind) {return (this.measure.navigation || []).some(value=>workshopNavigationKind(value)===kind);},
    toggleNavigation(kind) { const navigation=(this.measure.navigation || []).filter(value=>workshopNavigationKind(value) !== kind); if (!this.hasNavigation(kind)) navigation.push(kind); this.commit(setWorkshopMeasureNavigation(this.score,this.barIndex,{ending:this.measure.ending || [],navigation})); },
    navigationLabel(kind) { return {segno:'𝄋',coda:'𝄌',fine:'Fine',dc:'D.C.',ds:'D.S.',toCoda:'To Coda'}[kind]; },
    directionContextSignature() {
      const part=this.score.parts[this.partIndex];
      return JSON.stringify([this.partIndex,this.barIndex,this.score.meter,this.score.pickupUnits,
        part.measures.map(bar=>[bar.id,bar.meter,bar.pickupUnits])]);
    },
    directionEditingIsCurrent() {
      const entry=(this.measure.directions || []).find(item=>item.id === this.editingDirectionId);
      return !!entry && JSON.stringify(entry) === this.editingDirectionSnapshot && this.directionContextSignature() === this.editingDirectionContext;
    },
    editDirection(id) {
      const entry=(this.measure.directions || []).find(item=>item.id === id);
      if (!entry) return;
      this.error=false;this.editingDirectionId=id;this.editingDirectionSnapshot=JSON.stringify(entry);this.editingDirectionContext=this.directionContextSignature();
      this.directionType=entry.type;this.startBeat=1+entry.startSlot/this.beatUnits;
      const endIndex=entry.endBarId ? this.score.parts[this.partIndex].measures.findIndex(bar=>bar.id === entry.endBarId) : this.barIndex;
      this.endBar=endIndex+1;
      this.endBeat=entry.endSlot === undefined ? Math.min(this.beats+1,this.startBeat+2) : 1+entry.endSlot/this.endBeatUnits;
      if (entry.type === 'tempo' || entry.type === 'tempoRamp') this.tempo=entry.value;
      else if (entry.type === 'octaveShift') this.octaveShift=entry.value;
      else if (entry.type === 'dynamic') this.dynamic=entry.value;
      else if (entry.type === 'wedge') this.wedge=entry.value;
      else if (entry.type === 'pedal') {this.pedal=entry.value;this.pedalDetails=entry.pedal?cloneWorkshop(entry.pedal):null;}
      else if (entry.type === 'swing') {this.swingMode=entry.value==='straight'?'straight':'swing';if(entry.value!=='straight'){this.swingFirst=entry.value.first;this.swingSecond=entry.value.second;this.swingUnit=entry.value.unit;this.swingStyle=entry.value.style||'';}}
      else this.words=entry.value;
    },
    cancelDirectionEditing() {
      this.editingDirectionId=null;this.editingDirectionSnapshot=null;this.editingDirectionContext=null;this.resetPosition();
    },
    addDirection() {
      // A stale draft must never replace an instruction in another bar or undo state.
      if (this.editingDirectionId && !this.directionEditingIsCurrent()) { this.cancelDirectionEditing();return; }
      const entry={id:this.editingDirectionId || workshopId('direction'),startSlot:(Number(this.startBeat)-1)*this.beatUnits,type:this.directionType};
      if (this.directionType === 'pedal' && this.pedalDetails) entry.pedal=cloneWorkshop(this.pedalDetails);
      entry.value=this.directionType === 'tempo' || this.directionType === 'tempoRamp' ? Number(this.tempo) : this.directionType === 'octaveShift' ? this.octaveShift : this.directionType === 'dynamic' ? this.dynamic : this.directionType === 'wedge' ? this.wedge : this.directionType === 'pedal' ? this.pedal : this.words;
      if(this.directionType==='swing'){entry.value=this.swingMode==='straight'?'straight':{first:Number(this.swingFirst),second:Number(this.swingSecond),unit:this.swingUnit};if(this.swingMode!=='straight'&&this.swingStyle)entry.value.style=this.swingStyle;}
      if (this.hasSpan) {
        const target=this.score.parts[this.partIndex].measures[Number(this.endBar)-1];
        if (!Number.isInteger(Number(this.endBar)) || !target || Number(this.endBar)<this.barIndex+1) {this.error=true;return;}
        entry.endSlot=(Number(this.endBeat)-1)*this.endBeatUnits;
        if (Number(this.endBar)>this.barIndex+1) entry.endBarId=target.id;
      }
      const entries=this.measure.directions || [];
      const next=this.editingDirectionId ? entries.map(item=>item.id === this.editingDirectionId ? entry : item) : entries.concat([entry]);
      if (this.commit(setWorkshopMeasureDirections(this.score,this.barIndex,next,this.partIndex))) this.cancelDirectionEditing();
    },
    removeDirection(id) {
      if (this.commit(setWorkshopMeasureDirections(this.score,this.barIndex,(this.measure.directions || []).filter(entry=>entry.id !== id),this.partIndex)) && this.editingDirectionId === id) this.cancelDirectionEditing();
    },
    directionLabel(entry) { const end=entry.endBarId ? this.score.parts[this.partIndex].measures.findIndex(bar=>bar.id === entry.endBarId)+1 : this.barIndex+1; const value=entry.type === 'swing' ? workshopSwingLabel(entry.value,this.$t('WORKSHOP_SWING_STRAIGHT')) : entry.type === 'wedge' ? this.$t(entry.value === 'crescendo' ? 'WORKSHOP_CRESCENDO' : 'WORKSHOP_DIMINUENDO') : entry.type === 'pedal' ? this.pedalLabel(entry) : entry.type === 'octaveShift' ? ({1:'8va','-1':'8vb',2:'15ma','-2':'15mb'}[entry.value]) : entry.value;
      return this.$t('WORKSHOP_DIRECTION_'+entry.type.toUpperCase())+' · '+value+' · '+this.$t('WORKSHOP_POSITION',{beat:1+entry.startSlot/this.beatUnits})+(entry.endSlot === undefined ? '' : ' → '+this.$t('WORKSHOP_BAR',{number:end})+', '+this.$t('WORKSHOP_POSITION',{beat:1+entry.endSlot/(8/Number(workshopMeasureContext(this.score,end-1,this.partIndex).meter.split('/')[1]))})); }
  }
};
</script>

<style scoped>
.advanced-notation { margin:12px 0; padding:10px; border:1px solid #d3e0da; border-radius:12px; background:#f4f8f4; text-align:left; }
summary { cursor:pointer; font-weight:700; font-size:12px; min-height:28px; color:#365b64; } label { display:flex; flex-direction:column; gap:5px; font-size:11px; margin-top:10px; }
input,select,textarea,button { box-sizing:border-box; min-height:42px; border:1px solid #c7d9d7; border-radius:9px; font:inherit; color:#2d515b; background:#fffdf8; min-width:0; padding:8px; }
input,select,textarea { width:100%; } textarea { resize:vertical; } input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible { outline:3px solid #dd7135; outline-offset:2px; } button { cursor:pointer; font-weight:700; } button:disabled,input:disabled,select:disabled,textarea:disabled { opacity:.45; }
.lyric-details { margin-top:12px; }.lyric-entry { padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #d3e0da; }.lyric-entry > button { margin-top:9px; }
.fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 9px; }.actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }.compact-buttons { display:flex; flex-wrap:wrap; gap:5px; margin:9px 0; }.compact-buttons button { flex:1 0 40px; font-size:12px; }.navigation button { flex:1 0 65px; }.selected { background:#2e7b88; color:#fff; border-color:#2e7b88; }
h3 { margin:15px 0 5px; font-size:12px; }.hint { color:#637c80; font-size:11px; line-height:1.5; }.error { color:#a24c35; font-size:12px; }.direction-actions .add-direction { flex:1; }.direction-editing { font-size:12px; font-weight:700; color:#2e7b88; }.direction-edit-label { display:block; margin-top:4px; font-size:10px; opacity:.8; }.directions { margin:10px 0 0; padding:0; list-style:none; }.directions li { display:flex; align-items:center; gap:8px; padding:5px 0; border-top:1px solid #dae4df; font-size:11px; overflow-wrap:anywhere; }.directions .direction-entry { flex:1; text-align:left; overflow-wrap:anywhere; }.directions .remove-direction { flex:0 0 36px; min-height:36px; }
</style>
