<template>
  <section class="workshop-listening" :class="{practicing:practice,'fullscreen-mode':fullscreen}" :aria-label="$t(practice ? 'WORKSHOP_PRACTICE' : 'WORKSHOP_LISTENING')">
    <div v-if="practice" class="listening-topline"><slot name="connection-status" /><button ref="settingsButton" type="button" class="settings-toggle" :aria-expanded="settingsOpen ? 'true' : 'false'" :aria-controls="settingsId" @click="$emit('settings-toggle')">{{$t('WORKSHOP_PRACTICE_SETTINGS')}} <span aria-hidden="true">{{settingsOpen ? '▴' : '▾'}}</span></button></div>
    <div class="listening-heading"><div><span v-if="!practice" class="eyebrow">{{$t('WORKSHOP_LISTENING')}}</span><h2 :title="title">{{title}}</h2></div><span class="position-label">{{$t('WORKSHOP_BAR', {number:currentBar+1})}} / {{score.parts[0].measures.length}}</span></div>
    <p v-if="practice && practiceSummary" class="practice-summary">{{practiceSummary}}</p>
    <div v-if="practice" class="practice-progress"><progress :value="Math.max(0,Math.min(duration,displayPosition))" :max="duration || 1" :aria-label="$t('WORKSHOP_PRACTICE_PROGRESS')" :aria-valuetext="formatTime(displayPosition)+' / '+formatTime(duration)" /><output>{{formatTime(displayPosition)}} / {{formatTime(duration)}}</output></div>
    <div class="transport-controls">
      <button type="button" class="play-toggle" :disabled="busy || playDisabled" @click="$emit('toggle')">{{playing ? 'Ⅱ' : '▶'}} {{$t(playing ? 'WORKSHOP_PAUSE' : 'WORKSHOP_PLAY')}}</button>
      <button v-if="!practice" type="button" :disabled="busy" @click="$emit('seek',0)">↤ {{$t('WORKSHOP_RESTART')}}</button>
      <button type="button" :disabled="busy" @click="$emit('close')">{{closeLabel || $t(practice ? 'WORKSHOP_PRACTICE_BACK' : 'WORKSHOP_VIEW_EDIT')}}</button>
      <button v-if="!practice" type="button" class="piece-info-toggle" @click="$emit('info')">ⓘ {{$t('WORKSHOP_PIECE_INFO')}}</button>
    </div>
    <section v-if="practice" :id="settingsId" class="practice-setup" :hidden="!settingsOpen" :aria-label="$t('WORKSHOP_PRACTICE_SETTINGS')">
      <slot name="practice-settings" />
      <label class="seek-label"><span>{{$t('WORKSHOP_PRACTICE_POSITION')}}</span><output>{{formatTime(displayPosition)}} / {{formatTime(duration)}}</output>
        <input type="range" min="0" :max="duration" step="1" :value="displayPosition" :disabled="busy" :aria-label="$t('WORKSHOP_PRACTICE_POSITION')" :aria-valuetext="formatTime(displayPosition)" @input="rangeSeek" />
      </label>
      <div class="position-controls"><label>{{$t('WORKSHOP_JUMP_BAR')}} <input type="number" :min="barMinimum" :max="barMaximum" :value="barInput === null ? currentBar+1 : barInput" :disabled="busy" @focus="barInput=String(currentBar+1)" @input="barInput=$event.target.value" @change="jumpToBar" @keydown.enter.prevent="jumpToBar($event)" @blur="barInput=null" /></label><button type="button" :disabled="busy" @click="$emit('seek',0)">↤ {{$t('WORKSHOP_RESTART')}}</button></div>
    </section>
    <div ref="viewport" class="listening-viewport" :class="{ dragging:drag }" :role="fullscreen ? 'dialog' : null" :aria-modal="fullscreen ? 'true' : null" :aria-label="fullscreen ? title || $t('WORKSHOP_PRACTICE') : null"
      @pointerdown="beginDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag">
      <svg class="listening-score" :viewBox="'0 0 '+logicalWidth+' '+system.height" :style="{height:system.height*scale+'px','--workshop-note-stroke':1.8*notationScale+'px'}" role="img" :aria-label="$t(practice ? 'WORKSHOP_PRACTICE' : 'WORKSHOP_LISTENING')">
        <defs v-if="practice">
          <clipPath :id="clipId"><rect :x="noteClipLeft" y="0" :width="Math.max(0,logicalWidth-noteClipLeft)" :height="system.height" /></clipPath>
          <clipPath :id="streamClipId">
            <rect :x="noteClipLeft" y="0" :width="Math.max(0,logicalWidth-noteClipLeft)" :height="system.height" />
            <rect v-for="window in annotationWindows" :key="window.top" x="0" :y="window.top" :width="anchor-noteClipInset" :height="window.height" />
          </clipPath>
          <clipPath :id="streamNoteClipId"><rect :x="noteClipLeft-translation" y="0" :width="Math.max(0,logicalWidth-noteClipLeft)" :height="system.height" /></clipPath>
          <template v-for="bar in visibleBars">
            <clipPath v-for="(part,index) in bar.parts" :key="staffNoteClipId(bar,part.partIndex)" :id="staffNoteClipId(bar,part.partIndex)">
              <rect :x="noteClipLeft-bar.x-translation" :y="system.frames[index].top" :width="Math.max(0,bar.width-noteClipLeft+bar.x+translation)" :height="system.frames[index].height" />
            </clipPath>
          </template>
        </defs>
        <g v-for="(frame,index) in system.frames" :key="'lines-'+index" aria-hidden="true">
          <line v-for="y in [76,96,116,136,156]" :key="y" x1="0" :x2="logicalWidth" :y1="frame.y+y-frame.top" :y2="frame.y+y-frame.top" class="continuous-line" />
        </g>
        <g :clip-path="practice ? 'url(#'+streamClipId+')' : null"><g :transform="'translate('+translation+' 0)'">
          <g v-for="bar in visibleBars" :key="bar.measureIndex" class="stream-bar" :data-stream-bar="bar.index+1" :data-performance-index="bar.measureIndex">
            <WorkshopStaff v-for="(part,index) in bar.parts" :key="part.partIndex" :measure="streamMeasure(part,bar)" :clef="part.context.clef" :clef-octave="part.context.clefOctave || 0"
              :meter="part.context.meter" :key-id="part.context.keyId" :previous-key-id="part.previousKeyId" :dynamic="part.context.dynamic"
              :show-clef="!practice && part.showClef" :show-key="!practice && part.showKey" :show-meter="!practice && part.showMeter" :show-context-changes="!practice" :show-dynamic="part.showDynamic"
              :frame-top="system.frames[index].top" :frame-bottom="system.frames[index].bottom" :header-left="bar.headerLeft" :frame-width="bar.width" :horizontal-columns="bar.spacing.columns" :leading-context-right="part.leadingContextRight"
              :staff-index="part.partIndex" :companion-measure="part.companionMeasure" :cross-staff-beam-ids="bar.crossStaff.groupIds" :cross-staff-relation-ids="bar.crossStaff.relationIds" :direction-spans="part.directionSpans"
              :ties="part.ties" :slurs="part.slurs" :glissandos="part.glissandos" :tremolos="part.tremolos" :lyric-verse-numbers="part.lyricVerseNumbers" :source-lyric-verse-numbers="part.sourceLyricVerseNumbers" :bar-index="bar.index" :note-label="noteLabel" :active-event-ids="!drag && currentMeasure && bar.measureIndex === currentMeasure.measureIndex ? activeEventIds : emptyEventIds"
              :practice-note-states="practice && !drag && currentMeasure && bar.measureIndex === currentMeasure.measureIndex ? practiceNoteStates : null"
              :notation-scale="notationScale" :context-scale="practice ? contextScale : null" :practice-layout="practice" :note-clip-path="practice ? 'url(#'+staffNoteClipId(bar,part.partIndex)+')' : null" :read-only="true" :compact="true" :x="bar.x" :y="system.frames[index].y" :width="bar.width" :height="system.frames[index].height"
              :style="{width:bar.width+'px',height:system.frames[index].height+'px',maxWidth:'none',margin:0}" />
            <g :clip-path="practice ? 'url(#'+streamNoteClipId+')' : null"><g :transform="'translate('+(bar.x-sourceSystem.bars[bar.index].x)+' 0)'" class="cross-staff-notation" aria-hidden="true">
              <line v-for="stem in bar.crossStaff.stems" :key="'stem-'+stem.id" :x1="stem.x" :x2="stem.x" :y1="stem.y1" :y2="stem.y2" class="cross-staff-stem" />
              <path v-for="curve in bar.crossStaff.curves" :key="'curve-'+curve.id" :d="curve.path" class="cross-staff-curve" :class="{tremolo:curve.kind === 'tremolo'}" />
              <polygon v-for="beam in bar.crossStaff.beams" :key="'beam-'+beam.id" :points="beam.points" class="cross-staff-beam" />
            </g></g>
          </g>
        </g></g>
        <g v-if="practice" class="fixed-context" aria-hidden="true">
          <g v-for="(entry,index) in fixedContexts" :key="entry.partIndex" :transform="'translate(0 '+(system.frames[index].y-system.frames[index].top)+')'" :data-fixed-staff="entry.partIndex" :data-clef="entry.context.clef" :data-key="entry.context.keyId" :data-meter="entry.context.meter">
            <rect x="0" y="76" :width="headerWidth" height="80" class="header-paper" />
            <line v-for="y in [76,96,116,136,156]" :key="y" x1="12" :x2="headerWidth" :y1="y" :y2="y" class="continuous-line" />
            <g data-context-field="clef" :opacity="fixedContextOpacity(entry,'clef')">
              <path class="context-glyph" :d="clefPath(entry.context.clef,16*contextScale*headerFit,headerFit)" />
              <text v-if="entry.context.clefOctave" class="context-clef-octave" :x="31*contextScale*headerFit" :y="clefOctaveY(entry.context)" :data-clef-octave="entry.context.clefOctave">{{Math.abs(entry.context.clefOctave) === 2 ? '15' : '8'}}</text>
            </g>
            <g data-context-field="keyId" :opacity="fixedContextOpacity(entry,'keyId')">
              <path v-for="(pitch,number) in fixedSignature(entry)" :key="'key-'+number" class="context-glyph" :d="signaturePath(pitch,entry.context.clef,(54*contextScale+number*signatureStep)*headerFit,headerFit)" />
            </g>
            <g data-context-field="meter" :opacity="fixedContextOpacity(entry,'meter')" :transform="'translate('+meterDock+' 0) scale('+headerFit+' 1)'">
              <text class="context-meter" :style="contextMeterStyle" x="0" y="109">{{entry.context.meter.split('/')[0]}}</text><text class="context-meter" :style="contextMeterStyle" x="0" y="151">{{entry.context.meter.split('/')[1]}}</text>
            </g>
            <g class="fixed-start-barline" :class="{'repeat-start':openingRepeat(entry.partIndex)}" :data-opening-staff="entry.partIndex">
              <line v-if="openingRepeat(entry.partIndex)" :x1="headerWidth-8" :x2="headerWidth-8" y1="76" y2="156" class="repeat-heavy" />
              <line :x1="headerWidth-3" :x2="headerWidth-3" y1="76" y2="156" class="opening-barline" />
              <template v-if="openingRepeat(entry.partIndex)"><circle v-for="y in [106,126]" :key="y" :cx="headerWidth+3" :cy="y" r="2.6" /></template>
            </g>
          </g>
          <g v-for="preview in previewContexts" :key="'preview-'+preview.change.id" :transform="'translate(0 '+frameOffset(preview.change.partIndex)+')'" :data-preview-context="preview.change.id" :opacity="preview.progress">
            <g v-if="preview.change.fields.includes('clef')" data-context-field="clef">
              <path class="context-glyph" :d="clefPath(preview.change.context.clef,16*contextScale*headerFit,headerFit)" />
              <text v-if="preview.change.context.clefOctave" class="context-clef-octave" :x="31*contextScale*headerFit" :y="clefOctaveY(preview.change.context)" :data-clef-octave="preview.change.context.clefOctave">{{Math.abs(preview.change.context.clefOctave) === 2 ? '15' : '8'}}</text>
            </g>
            <g v-if="changesContextField(preview.change,'keyId')" data-context-field="keyId">
              <path v-for="(pitch,number) in fixedSignature(preview.change)" :key="'key-'+number" class="context-glyph" :d="signaturePath(pitch,preview.change.context.clef,(54*contextScale+number*signatureStep)*headerFit,headerFit)" />
            </g>
            <g v-if="preview.change.fields.includes('meter')" data-context-field="meter" :transform="'translate('+meterDock+' 0) scale('+headerFit+' 1)'">
              <text class="context-meter" :style="contextMeterStyle" x="0" y="109">{{preview.change.context.meter.split('/')[0]}}</text><text class="context-meter" :style="contextMeterStyle" x="0" y="151">{{preview.change.context.meter.split('/')[1]}}</text>
            </g>
          </g>
          <g v-for="change in upcomingContexts" :key="change.id" :transform="'translate(0 '+frameOffset(change.partIndex)+')'" :clip-path="'url(#'+clipId+')'" :opacity="incomingContextOpacity(change)" class="moving-context" :data-moving-context="change.id">
            <path v-if="change.fields.includes('clef')" class="context-glyph" :d="clefPath(change.context.clef,change.clefX+translation)" />
            <text v-if="change.fields.includes('clef') && change.context.clefOctave" class="context-clef-octave" :x="change.clefX+translation+15*contextScale" :y="clefOctaveY(change.context)" :data-clef-octave="change.context.clefOctave">{{Math.abs(change.context.clefOctave) === 2 ? '15' : '8'}}</text>
            <path v-for="(pitch,number) in movingSignature(change)" :key="'key-'+number" class="context-glyph" :d="signaturePath(pitch,change.context.clef,change.keyX+translation+number*signatureStep)" />
            <template v-if="change.fields.includes('meter')"><text class="context-meter" :style="contextMeterStyle" :x="change.meterX+translation" y="109">{{change.context.meter.split('/')[0]}}</text><text class="context-meter" :style="contextMeterStyle" :x="change.meterX+translation" y="151">{{change.context.meter.split('/')[1]}}</text></template>
          </g>
        </g>
        <g class="play-line" :class="feedback" :transform="'translate('+lineX+' 0)'" aria-hidden="true">
          <line x1="0" x2="0" y1="16" :y2="system.height-8" /><path d="M -9 5 H 9 L 0 17 Z" />
        </g>
        <g v-if="practice && wrongPitchMarkers.length" class="wrong-pitch-markers" :transform="'translate('+lineX+' 0)'">
          <g v-for="marker in wrongPitchGroups" :key="marker.partIndex+'-'+marker.y" :data-wrong-pitch="marker.values.join(',')" :data-marker-staff="marker.partIndex">
            <title>{{$t('FLOW_WRONG_PITCH_MARKER_VALUE',{note:marker.values.map(pitchLabel).join(' / ')})}}</title>
              <line v-for="y in marker.ledgers" :key="y" x1="-12" x2="12" :y1="y" :y2="y" class="wrong-pitch-ledger" />
              <path v-if="marker.values.length === 1" class="wrong-pitch-accidental" :d="wrongPitchAccidental(marker)" />
              <circle class="wrong-pitch-dot" cx="0" :cy="marker.y" r="7" />
          </g>
        </g>
      </svg>
      <span v-if="wrongPitchEdges.length || wrongPitchCollisions.length" class="wrong-pitch-edge" role="status"><span v-for="marker in wrongPitchEdges" :key="marker.value">{{marker.direction}} {{pitchLabel(marker.value)}}</span><span v-for="marker in wrongPitchCollisions" :key="marker.partIndex+'-'+marker.y" :data-shared-pitch-line="marker.values.join(',')">{{marker.values.map(pitchLabel).join(' / ')}}</span></span>
      <button type="button" class="play-line-handle" :style="{left:(lineX*scale)+'px',top:scoreTop+'px'}" :aria-label="$t('WORKSHOP_PLAY_LINE')" :tabindex="fullscreen ? -1 : 0" :aria-hidden="fullscreen ? 'true' : null"
        @keydown.left.prevent="seekRelative(-1000)" @keydown.right.prevent="seekRelative(1000)" @keydown.home.prevent="$emit('seek',0)" @keydown.end.prevent="$emit('seek',duration)"><span aria-hidden="true">↔</span></button>
      <span v-if="practice && preparationRemaining>0" class="practice-preparing" role="status">{{$t('WORKSHOP_PRACTICE_COUNTDOWN')}}</span>
      <button v-if="practice" ref="fullscreenButton" type="button" class="fullscreen-toggle" :aria-label="$t(fullscreen ? 'WORKSHOP_FULLSCREEN_EXIT' : 'WORKSHOP_FULLSCREEN_ENTER')" :title="$t(fullscreen ? 'WORKSHOP_FULLSCREEN_EXIT' : 'WORKSHOP_FULLSCREEN_ENTER')" :aria-pressed="fullscreen ? 'true' : 'false'" @pointerdown.stop @pointerup.stop @click.stop="toggleFullscreen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="fullscreen" d="M 3 9 H 9 V 3 M 15 3 V 9 H 21 M 21 15 H 15 V 21 M 9 21 V 15 H 3" /><path v-else d="M 9 3 H 3 V 9 M 15 3 H 21 V 9 M 21 15 V 21 H 15 M 3 15 V 21 H 9" /></svg>
      </button>
    </div>
    <p v-if="!practice" class="listening-hint">{{$t('WORKSHOP_LISTENING_HINT')}}</p>
    <label v-if="!practice" class="seek-label"><span>{{$t('WORKSHOP_POSITION')}}</span><output>{{formatTime(displayPosition)}} / {{formatTime(duration)}}</output>
      <input type="range" min="0" :max="duration" step="1" :value="displayPosition" :disabled="busy" :aria-label="$t(practice ? 'WORKSHOP_PRACTICE_POSITION' : 'WORKSHOP_POSITION')" :aria-valuetext="formatTime(displayPosition)" @input="rangeSeek" />
    </label>
    <div v-if="!practice" class="position-controls"><label>{{$t('WORKSHOP_JUMP_BAR')}} <input type="number" min="1" :max="score.parts[0].measures.length" :value="barInput === null ? currentBar+1 : barInput" :disabled="busy" @focus="barInput=String(currentBar+1)" @input="barInput=$event.target.value" @change="jumpToBar" @keydown.enter.prevent="jumpToBar($event)" @blur="barInput=null" /></label><button type="button" :disabled="busy" @click="$emit('edit',currentBar)">{{$t('WORKSHOP_EDIT_THIS_BAR')}}</button></div>
  </section>
</template>

<script>
import WorkshopStaff from './WorkshopStaff';
import {createWorkshopSheetSystems} from './WorkshopSheetLayout';
import {createWorkshopStreamPosition,workshopStreamXAtTime,workshopStreamTimeAtX,workshopStreamMeasureAtTime} from '../model/WorkshopStreamPosition';
import {createWorkshopStreamContexts,workshopStreamContextsAtX} from '../model/WorkshopStreamContext';
import {workshopKeySignature} from '../model/WorkshopTonality';
import {workshopStaffY} from '../model/WorkshopScoreEditor';
import {workshopAccidentalInk,workshopAccidentalPath} from '../model/WorkshopAccidentalGlyphs';
import {mapWorkshopWrongPitches} from '../model/WorkshopWrongPitchMapping';
import Glyphs from 'abcjs/src/write/creation/glyphs';
export default {
  name:'WorkshopListening',components:{WorkshopStaff},
  props:{practiceNoteStates:{type:Object,default:()=>({})},score:{type:Object,required:true},timeline:{type:Object,required:true},title:{type:String,default:''},position:{type:Number,default:0},playing:{type:Boolean,default:false},busy:{type:Boolean,default:false},playDisabled:{type:Boolean,default:false},activeEventIds:{type:Array,default:()=>[]},noteLabel:{type:Function,default:event=>event.kind},practice:{type:Boolean,default:false},feedback:{type:String,default:''},preparationRemaining:{type:Number,default:0},closeLabel:{type:String,default:''},settingsOpen:{type:Boolean,default:true},practiceSummary:{type:String,default:''},linearPractice:{type:Boolean,default:false},wrongPitchValues:{type:Array,default:()=>[]},wrongPitchTarget:{type:Object,default:null},pitchLabel:{type:Function,default:value=>String(value)}},
  data() {return {availableWidth:700,availableHeight:0,fullscreen:false,practiceZoom:.7,practiceNoteZoom:.65,practiceContextZoom:.95,observer:null,resizeFrame:null,drag:null,barInput:null,emptyEventIds:Object.freeze([]),engravingRevision:0};},
  computed:{
    wrongPitchMarkers() {return this.practice && !this.drag ? mapWorkshopWrongPitches({values:this.wrongPitchValues,target:this.wrongPitchTarget,timeline:this.timeline,system:this.system,displayContexts:this.fixedContexts}) : [];},
    wrongPitchGroups() {
      const groups=[];
      this.wrongPitchMarkers.filter(marker=>!marker.offscreen && !marker.contextPending).forEach(marker=>{
        const group=groups.find(entry=>entry.partIndex === marker.partIndex && entry.y === marker.y);
        if (group) group.values.push(marker.value);
        else groups.push(Object.assign({},marker,{values:[marker.value]}));
      });
      return groups;
    },
    wrongPitchEdges() {return this.wrongPitchMarkers.filter(marker=>marker.offscreen || marker.contextPending);},
    wrongPitchCollisions() {return this.wrongPitchGroups.filter(marker=>marker.values.length>1);},
    sourceSystem() {return this.engravingRevision > 0 ? this._engraving.system : null;},
    system() {return this.sourceSystem;},
    layout() {return this.engravingRevision > 0 ? this._engraving.layout : null;},
    duration() {return this.timeline.durationMs || 0;},
    startBarIndex() {return this.timeline.measures.length ? this.timeline.measures[0].index : 0;},
    barMinimum() {return this.practice ? this.timeline.measures.reduce((minimum,measure)=>Math.min(minimum,measure.index+1),this.score.parts[0].measures.length) : 1;},
    barMaximum() {return this.practice ? this.timeline.measures.reduce((maximum,measure)=>Math.max(maximum,measure.index+1),1) : this.score.parts[0].measures.length;},
    // Keep the accepted note, staff and context proportions fixed. The
    // responsive outer scale adapts them together without re-engraving.
    notationScale() {return this.practice ? 2*this.practiceNoteZoom/this.practiceZoom : 1;},
    contextScale() {return this.practice ? this.practiceContextZoom/this.practiceZoom : 1;},
    signatureStep() {return this.practice ? 20*this.contextScale : 12;},
    contextMeterStyle() {return this.practice ? {fontSize:32*this.contextScale+'px'} : null;},
    // Compact narrow fields by at most 20%; wider screens reveal more notes
    // rather than enlarging the accepted profile indefinitely.
    practiceResponsiveScale() {return Math.max(.8,Math.min(1,this.availableWidth/390));},
    noteClipInset() {return this.practice && this.engravingRevision > 0 ? this._engraving.noteLeadWidth : 12;},
    scale() {
      const normal=this.practice ? this.practiceZoom*this.practiceResponsiveScale : this.availableWidth<500 ? .75 : .9;
      // Landscape can have less height than two staves need. Retain a readable
      // minimum there and let exceptionally small displays scroll vertically.
      return this.fullscreen && this.availableHeight>0 ? Math.min(normal,Math.max(.4,(this.availableHeight-24)/this.system.height)) : normal;
    },
    scoreTop() {return this.fullscreen ? Math.max(0,(this.availableHeight-this.system.height*this.scale)/2) : 0;},
    logicalWidth() {return this.availableWidth/this.scale;},
    clipId() {return 'workshop-practice-clip-'+this._uid;},
    streamClipId() {return 'workshop-practice-stream-clip-'+this._uid;},
    streamNoteClipId() {return 'workshop-practice-stream-notes-'+this._uid;},
    annotationWindows() {
      // Open the left margin only outside every staff. Notes and fingerings
      // retain their own full-height clip, including their ledger-line ink.
      const bands=this.system.frames.map(frame=>({top:frame.y-frame.top+76,bottom:frame.y-frame.top+156})).sort((a,b)=>a.top-b.top);
      const windows=[];let top=0;
      bands.forEach(band=>{
        const start=Math.max(0,Math.min(this.system.height,band.top));
        if(start>top) windows.push({top,height:start-top});
        top=Math.max(top,Math.min(this.system.height,band.bottom));
      });
      if(top<this.system.height) windows.push({top,height:this.system.height-top});
      return windows;
    },
    settingsId() {return 'workshop-practice-settings-'+this._uid;},
    contexts() {return this.engravingRevision > 0 ? this._engraving.contexts : {rows:[],changes:[]};},
    fixedContexts() {return workshopStreamContextsAtX(this.contexts,this.cursorX);},
    headerWidth() {const width=this.engravingRevision > 0 ? this._engraving.headerWidth : 104;return this.practice ? Math.min(width,Math.max(34,this.logicalWidth-62/this.scale-this.noteClipInset-8)) : width;},
    headerFit() {return this.engravingRevision > 0 ? this.headerWidth/this._engraving.headerWidth : 1;},
    meterExtraWidth() {return this.engravingRevision > 0 ? this._engraving.meterExtraWidth : 0;},
    meterDock() {return this.headerWidth-(26*this.contextScale+this.meterExtraWidth/2)*this.headerFit;},
    upcomingContexts() {return this.contexts.changes.filter(change=>change.applyX>this.cursorX && this.contextLeadingX(change)+this.translation<this.logicalWidth+150);},
    previewContexts() {
      const nearest=new Map();
      this.contexts.changes.forEach(change=>{if(change.applyX>this.cursorX && !nearest.has(change.partIndex)) nearest.set(change.partIndex,change);});
      return Array.from(nearest.values()).map(change=>({change,progress:this.contextHandoffProgress(change)})).filter(preview=>preview.progress>0);
    },
    anchor() {return this.practice ? this.headerWidth+8+this.noteClipInset : Math.min(190,this.logicalWidth*.3);},
    displayPosition() {return this.drag ? this.drag.position : this.position;},
    cursorX() {return workshopStreamXAtTime(this.layout,this.displayPosition);},
    preparationOffset() {
      if(!this.practice) return 0;
      const remaining=Math.max(0,Math.min(1,Number(this.preparationRemaining)||0));
      return Math.min(180/this.scale,Math.max(0,this.logicalWidth-this.anchor-24)*.72)*remaining;
    },
    noteClipLeft() {return this.anchor+this.preparationOffset-this.noteClipInset;},
    translation() {return this.drag && this.drag.line ? this.drag.translation : this.anchor-this.cursorX+this.preparationOffset;},
    lineX() {return this.drag && this.drag.line ? this.cursorX+this.drag.translation : this.anchor;},
    visibleBars() {const left=-this.translation-150,right=left+this.logicalWidth+300;return this.layout.bars.filter(bar=>bar.x+bar.width>=left && bar.x<=right);},
    currentMeasure() {return workshopStreamMeasureAtTime(this.layout,this.displayPosition);},
    currentBar() {return this.currentMeasure ? this.currentMeasure.index : 0;}
  },
  // Build outside a computed getter. Vue otherwise forwards every collected
  // note-property dependency through the cached position/render computeds.
  created() {this.rebuildEngraving();},
  watch:{practice:'rebuildEngraving',linearPractice:'rebuildPositionLayout',practiceZoom:'rebuildEngraving',practiceNoteZoom:'rebuildEngraving',practiceContextZoom:'rebuildEngraving',score:{deep:true,handler:'rebuildEngraving'},timeline:{deep:true,handler:'rebuildPositionLayout'}},
  mounted() {
    this.updateWidth();
    if (typeof ResizeObserver!=='undefined') {this.observer=new ResizeObserver(this.queueWidthUpdate);this.observer.observe(this.$refs.viewport);}
    window.addEventListener('resize',this.queueWidthUpdate);
    window.addEventListener('keydown',this.fullscreenKeydown);
  },
  beforeDestroy() {
    if(this.observer) this.observer.disconnect();
    window.removeEventListener('resize',this.queueWidthUpdate);
    window.removeEventListener('keydown',this.fullscreenKeydown);
    if(this.resizeFrame!==null) cancelAnimationFrame(this.resizeFrame);
    this.restoreFullscreenPage();
  },
  methods:{
    wrongPitchAccidental(marker) {return workshopAccidentalPath({accidental:marker.accidental},-23,marker.y,.9);},
    // The clip URL stays stable while the parent moves its rectangle. Passing
    // the changing clip X to each staff would redraw every glyph on each tick.
    staffNoteClipId(bar,partIndex) {return this.streamNoteClipId+'-'+bar.measureIndex+'-'+partIndex;},
    focusSettings() {
      const button=this.$refs.settingsButton;
      if(button) {
        if(typeof button.scrollIntoView === 'function') button.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
        if(typeof button.focus === 'function') button.focus({preventScroll:true});
      }
    },
    toggleFullscreen() {
      if(!this.practice) return;
      if(this.fullscreen) {this.exitFullscreen();return;}
      if(this.drag) this.cancelDrag();
      if(typeof document!=='undefined' && document.body) {
        this._fullscreenBody=document.body;
        this._fullscreenOverflow=document.body.style.overflow;
        document.body.style.overflow='hidden';
      }
      this._fullscreenBackground=[];
      // Hide the covered controls from assistive technology as well. Walk
      // only sibling branches so the score and its exit button remain active.
      for(let node=this.$refs.viewport;node && node.parentElement && node!==this._fullscreenBody;node=node.parentElement) {
        Array.from(node.parentElement.children).filter(sibling=>sibling!==node).forEach(sibling=>{
          this._fullscreenBackground.push({element:sibling,inert:sibling.hasAttribute('inert'),hidden:sibling.getAttribute('aria-hidden')});
          sibling.setAttribute('inert','');sibling.setAttribute('aria-hidden','true');
        });
      }
      this.fullscreen=true;this.$emit('fullscreen-change',true);
      this.$nextTick(()=>{if(!this._isDestroyed) {this.updateWidth();this.focusFullscreenButton();}});
    },
    exitFullscreen() {
      if(!this.fullscreen) return false;
      if(this.drag) this.cancelDrag();
      this.fullscreen=false;this.restoreFullscreenPage();this.$emit('fullscreen-change',false);
      this.$nextTick(()=>{if(!this._isDestroyed) {this.updateWidth();this.focusFullscreenButton();}});
      return true;
    },
    restoreFullscreenPage() {
      if(this._fullscreenBody) {this._fullscreenBody.style.overflow=this._fullscreenOverflow;this._fullscreenBody=null;}
      (this._fullscreenBackground || []).forEach(entry=>{
        if(!entry.inert) entry.element.removeAttribute('inert');
        if(entry.hidden===null) entry.element.removeAttribute('aria-hidden');else entry.element.setAttribute('aria-hidden',entry.hidden);
      });this._fullscreenBackground=[];
    },
    focusFullscreenButton() {const button=this.$refs.fullscreenButton;if(button && typeof button.focus==='function') button.focus({preventScroll:true});},
    fullscreenKeydown(event) {
      if(!this.fullscreen) return;
      if(event.key==='Escape') {event.preventDefault();event.stopPropagation();this.exitFullscreen();}
      else if(event.key==='Tab') {
        event.preventDefault();
        const viewport=this.$refs.viewport;
        const controls=viewport && typeof viewport.querySelectorAll === 'function' ? Array.from(viewport.querySelectorAll('button:not(:disabled),input:not(:disabled),[href]')).filter(element=>element.getAttribute('tabindex')!=='-1' && element.getClientRects().length>0) : [];
        if(!controls.length) {this.focusFullscreenButton();return;}
        const index=controls.indexOf(document.activeElement);
        const next=index<0 ? event.shiftKey ? controls.length-1 : 0 : (index+(event.shiftKey ? -1 : 1)+controls.length)%controls.length;
        controls[next].focus();
      }
    },
    centerForPractice() {
      const viewport=this.$refs.viewport;
      if (!this.practice || this.fullscreen || !viewport || typeof viewport.scrollIntoView !== 'function') return;
      viewport.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    },
    rebuildEngraving() {
      const count=this.score.parts[0].measures.length;
      const system=Object.freeze(createWorkshopSheetSystems({score:this.score,scoreLayout:{},pageRanges:[{start:0,end:count}],pageIndex:0,barsPerSystem:count,
        activeParts:this.score.parts.map((part,index)=>({part,index})).filter(item=>item.part.enabled!==false),continuous:true,notationScale:this.notationScale,contextScale:this.practice ? this.contextScale : null,practiceLayout:this.practice})[0]);
      this.cacheEngraving(system);
    },
    rebuildPositionLayout() {if(this._engraving) this.cacheEngraving(this._engraving.system);},
    cacheEngraving(system) {
      const layout=createWorkshopStreamPosition(system,this.timeline,bar=>bar.parts.reduce((events,part)=>events.concat(part.notation.events),[]),{smooth:this.practice});
      const contexts=createWorkshopStreamContexts(layout,{contextScale:this.contextScale});
      // The current note stays at the play line. Reserve the left ink of its
      // accidentals, fingering and arpeggio beside the permanent header.
      const noteLeadWidth=this.practice ? Math.ceil(system.bars.reduce((maximum,bar)=>bar.parts.reduce((lead,part)=>part.notation.events.reduce((reserved,event)=>{
        const ink=event.accidental && workshopAccidentalInk(event,event.accidentalX,event.y,.85*this.notationScale);
        let required=ink ? Math.max(reserved,event.x-ink.left+2) : reserved;
        (event.fingeringMarks || []).forEach(mark=>{
          if (Number.isFinite(mark.x) && Number.isFinite(mark.width)) required=Math.max(required,event.x-(mark.x-mark.width/2)+2);
        });
        (event.notationMarks || []).filter(mark=>mark.long).forEach(mark=>{required=Math.max(required,event.x-(mark.x-24*this.notationScale)+2);});
        if (event.arpeggio) {
          const onset=part.notation.events.filter(note=>note.kind === 'note' && note.startSlot === event.startSlot && (note.voice || 1) === (event.voice || 1));
          const left=Math.min(...onset.map(note=>note.accidental ? note.accidentalX : note.x))-16*this.notationScale;
          required=Math.max(required,event.x-left+2);
        }
        return required;
      },lead),maximum),Math.max(20,12*this.notationScale+2))) : 20;
      const signatures=contexts.rows.reduce((all,row)=>all.concat(row.entries.map(entry=>Math.max((entry.signature || []).length,workshopKeySignature(entry.context.keyId,entry.context.clef).length))),[]);
      // Reserve both numerator and denominator, including additive meters.
      // A single 32px bold digit already fits the original header. Every
      // further character needs 20px; half moves its centre, half its edge.
      const meterExtraWidth=contexts.rows.reduce((max,row)=>row.entries.reduce((largest,entry)=>
        Math.max(largest,...entry.context.meter.split('/').map(number=>Math.max(0,number.length-1)*20*this.contextScale)),max),0);
      // Keep ordinary headers at full size. A very wide signature on a narrow
      // screen may compact its fixed header horizontally, retaining glyph height
      // and at least 62 display pixels to the right of the play line.
      const headerWidth=104*this.contextScale+Math.max(0,...signatures)*this.signatureStep+meterExtraWidth;
      const openingMeasures={},linearMeasures={};
      system.bars[this.startBarIndex].parts.forEach(part=>{
        // The permanent header owns the opening repeat. Hide its moving copy
        // so a clipped edge of the original dots cannot appear near the line.
        openingMeasures[part.partIndex]=Object.freeze(Object.assign({},part.measure,{repeatStart:false}));
      });
      if(this.linearPractice) system.bars.forEach(bar=>{
        const parts={};bar.parts.forEach(part=>{parts[part.partIndex]=Object.freeze(Object.assign({},part.measure,{repeatStart:false,repeatEnd:false,navigation:[],ending:[]}));});
        linearMeasures[bar.index]=Object.freeze(parts);
      });
      this._engraving=Object.freeze({system,layout,contexts,headerWidth,meterExtraWidth,noteLeadWidth,openingMeasures:Object.freeze(openingMeasures),linearMeasures:Object.freeze(linearMeasures)});this.engravingRevision++;
    },
    openingRepeat(partIndex) {return !this.linearPractice && !!this.score.parts[partIndex].measures[this.startBarIndex].repeatStart;},
    streamMeasure(part,bar) {
      if(this.practice && this.linearPractice) return this._engraving.linearMeasures[bar.index][part.partIndex];
      return this.practice && bar.index === this.startBarIndex && part.measure.repeatStart ? this._engraving.openingMeasures[part.partIndex] : part.measure;
    },
    dockX(x,dock) {return x === null || x === undefined ? dock : Math.max(dock,x+this.translation);},
    frameOffset(partIndex) {const index=this.sourceSystem.bars[0].parts.findIndex(part=>part.partIndex===partIndex),frame=this.system.frames[index];return frame.y-frame.top;},
    glyph(name,x,y,scale=1,scaleX=scale) {return Glyphs.getPathForSymbol(x,y,name,scaleX,scale).map(part=>part.join(' ')).join(' ');},
    clefPath(clef,x,fit=1) {const name=clef === 'bass' ? 'clefs.F' : ['alto','tenor'].includes(clef) ? 'clefs.C' : 'clefs.G',y=clef === 'bass' || clef === 'tenor' ? 96 : clef === 'alto' ? 116 : 136;return this.glyph(name,x,y,1.9*this.contextScale,1.9*this.contextScale*fit);},
    clefOctaveY(context) {const scale=this.contextScale;return context.clefOctave > 0 ? (context.clef === 'treble' ? 136-74*scale-10 : 96-44*scale-10) : (context.clef === 'treble' ? 136+42*scale+15 : 116+44*scale+15);},
    signaturePath(pitch,clef,x,fit=1) {const size=this.practice ? 1.7*this.contextScale : .85;return this.glyph(pitch.alter>0 ? 'accidentals.sharp' : pitch.alter<0 ? 'accidentals.flat' : 'accidentals.nat',x,workshopStaffY(pitch,clef),size,size*fit);},
    changesContextField(change,field) {return change.fields.includes(field) || field === 'keyId' && change.fields.includes('clef');},
    contextLeadingX(change) {
      const positions=[];
      if(change.fields.includes('clef')) positions.push(change.clefX);
      if(this.changesContextField(change,'keyId')) positions.push(change.keyX);
      if(change.fields.includes('meter')) positions.push(change.meterX);
      const leading=Math.min(...positions.filter(Number.isFinite));
      return Number.isFinite(leading) ? leading : change.applyX;
    },
    contextHandoffProgress(change) {
      const leading=this.contextLeadingX(change);
      // Blend into the stationary dock before any incoming ink reaches the
      // clipping edge. This avoids crossing unchanged meter/signature glyphs.
      // Finish by the musical onset, including unusually wide note lead-ins.
      const end=Math.max(this.anchor-this.noteClipInset+4*this.contextScale,this.anchor+leading-change.applyX);
      const progress=Math.max(0,Math.min(1,(end+36*this.contextScale-leading-this.translation)/(36*this.contextScale)));
      return progress*progress*(3-2*progress);
    },
    incomingContextOpacity(change) {const preview=this.previewContexts.find(item=>item.change.id===change.id);return preview ? 1-preview.progress : 1;},
    fixedContextOpacity(entry,field) {
      const preview=this.previewContexts.find(item=>item.change.partIndex===entry.partIndex);
      return preview && this.changesContextField(preview.change,field) ? 1-preview.progress : 1;
    },
    fixedSignature(entry) {return workshopKeySignature(entry.context.keyId,entry.context.clef);},
    movingSignature(change) {return change.fields.includes('keyId') || change.fields.includes('clef') ? change.signature || workshopKeySignature(change.context.keyId,change.context.clef) : [];},
    queueWidthUpdate() {
      if(this.resizeFrame!==null) return;
      // Updating SVG height inside ResizeObserver delivery can trigger another
      // observation in the same frame. Apply the new width on the next frame.
      this.resizeFrame=requestAnimationFrame(()=>{this.resizeFrame=null;this.updateWidth();});
    },
    updateWidth() {
      if(!this.$refs.viewport) return;
      const width=this.$refs.viewport.clientWidth;
      const height=this.fullscreen ? this.$refs.viewport.clientHeight : 0;
      const validHeight=Number.isFinite(height) && height>0 ? height : 0;
      if(!Number.isFinite(width) || width<=0 || width===this.availableWidth && validHeight===this.availableHeight) return;
      // A rotation or panel resize ends the current scrub before changing
      // its coordinate system. Normal height-only observations leave it alone.
      if(this.drag && (width!==this.availableWidth || this.fullscreen && validHeight!==this.availableHeight)) this.cancelDrag();
      this.availableWidth=width;this.availableHeight=validHeight;
    },
    formatTime(ms) {const seconds=Math.max(0,Math.floor(ms/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');},
    seekRelative(delta) {this.$emit('seek',Math.max(0,Math.min(this.duration,this.position+delta)));},
    rangeSeek(event) {this.$emit('seek',Number(event.target.value));},
    jumpToBar(event) {
      const value=Number(event.target.value);if(!Number.isFinite(value) || value<1) return;
      const index=Math.max(this.barMinimum-1,Math.min(this.barMaximum-1,Math.round(value)-1));
      const matches=this.layout.bars.filter(bar=>bar.index===index);if(!matches.length) return;
      const nearest=matches.slice().sort((a,b)=>Math.abs(a.startMs-this.position)-Math.abs(b.startMs-this.position))[0];this.$emit('seek',nearest.startMs);
    },
    beginDrag(event) {
      if(this.busy || event.isPrimary===false || event.button>0) return;
      const rect=this.$refs.viewport.getBoundingClientRect(),x=(event.clientX-rect.left)/this.scale;
      const line=Math.abs(x-this.anchor)*this.scale<24;
      this.drag={id:event.pointerId,startX:x,originX:workshopStreamXAtTime(this.layout,this.position),position:this.position,translation:this.translation,line,resume:this.playing};
      this.$refs.viewport.setPointerCapture(event.pointerId);this.$emit('scrub-start');event.preventDefault();
    },
    moveDrag(event) {
      if(!this.drag || this.drag.id!==event.pointerId) return;
      const rect=this.$refs.viewport.getBoundingClientRect(),x=(event.clientX-rect.left)/this.scale,delta=x-this.drag.startX;
      const column=this.drag.originX+(this.drag.line ? delta : -delta);
      this.drag.position=workshopStreamTimeAtX(this.layout,column);event.preventDefault();
    },
    endDrag(event) {
      if(!this.drag || this.drag.id!==event.pointerId) return;
      this.moveDrag(event);const result={position:this.drag.position,resume:this.drag.resume};this.drag=null;
      if(this.$refs.viewport.hasPointerCapture(event.pointerId)) this.$refs.viewport.releasePointerCapture(event.pointerId);
      this.$emit('scrub-end',result);
    },
    cancelDrag() {
      if(!this.drag) return;
      const result={position:this.position,resume:this.drag.resume},id=this.drag.id,viewport=this.$refs.viewport;
      this.drag=null;
      if(viewport && typeof viewport.hasPointerCapture === 'function' && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      this.$emit('scrub-end',result);
    }
  }
};
</script>

<style scoped>
.workshop-listening {min-width:0;color:#29464f;}
.listening-heading {display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;}
.practicing .listening-heading {margin-bottom:10px;}.practicing .seek-label {margin-top:12px;}
.listening-topline {display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
.settings-toggle {display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:8px 10px;font-size:.76rem;}
.listening-topline > .midi-connection-status {margin-left:0;}
.practicing .listening-heading {align-items:flex-start;gap:8px;margin-bottom:6px;text-align:left;}
.practicing .listening-heading > div {min-width:0;}
.practicing h2 {font-size:1rem;line-height:1.3;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.practicing .position-label {font-size:.72rem;line-height:1.4;}
.practice-summary {font-size:.72rem;line-height:1.5;color:#64828a;margin:0 0 8px;}
.practice-progress {display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.practice-progress progress {flex:1;min-width:0;height:5px;border:0;border-radius:999px;overflow:hidden;appearance:none;background:#e1eae9;color:#2c7b8b;}
.practice-progress progress::-webkit-progress-bar {background:#e1eae9;border-radius:999px;}.practice-progress progress::-webkit-progress-value {background:#2c7b8b;border-radius:999px;}.practice-progress progress::-moz-progress-bar {background:#2c7b8b;border-radius:999px;}
.practice-progress output {font-size:.72rem;font-variant-numeric:tabular-nums;white-space:nowrap;color:#64828a;}
.practice-setup {padding:12px;margin-bottom:12px;border:1px solid #dbe6e5;border-radius:12px;background:#f6faf9;}
.practice-setup[hidden] {display:none;}
.eyebrow {font-size:.7rem;color:#63828a;text-transform:uppercase;letter-spacing:.09em;font-weight:700;}
h2 {font-size:1.25rem;margin:5px 0;overflow-wrap:anywhere;}
.position-label {font-size:.8rem;white-space:nowrap;color:#63828a;}
.transport-controls {display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
button {border:1px solid #d1dfe1;border-radius:12px;padding:12px 15px;background:#fffaf3;color:#365a64;font:inherit;font-size:.84rem;font-weight:600;cursor:pointer;min-height:44px;}
button:disabled {opacity:.5;cursor:default;}button:focus-visible,input:focus-visible {outline:3px solid #dc6a38;outline-offset:2px;}
.play-toggle {background:#2c7b8b;color:white;border-color:#2c7b8b;min-width:112px;}
.listening-viewport {position:relative;overflow:hidden;border:1px solid #dbe6e5;border-radius:16px;background:#fffdf8;touch-action:pan-y;user-select:none;cursor:grab;}
.listening-viewport.dragging {cursor:grabbing;}.listening-score {display:block;width:100%;min-height:180px;pointer-events:none;}
.practicing .listening-score {min-height:0;}
.fullscreen-toggle {position:absolute;right:8px;top:8px;display:grid;place-items:center;width:44px;height:44px;padding:10px;z-index:2;background:rgba(255,253,248,.94);box-shadow:0 2px 8px rgba(41,70,79,.12);cursor:pointer;touch-action:manipulation;}
.fullscreen-toggle svg {width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;}
.fullscreen-mode > :not(.listening-viewport) {display:none;}
.fullscreen-mode .listening-viewport {position:fixed;inset:0;z-index:10000;border:0;border-radius:0;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;}
.fullscreen-mode .listening-score {flex-shrink:0;margin:auto 0;}
.fullscreen-mode .fullscreen-toggle {position:fixed;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));}
.practice-preparing {position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;}
.continuous-line {stroke:#aec1c4;stroke-width:1.2;}.play-line {fill:#de6935;stroke:#de6935;}.play-line line {stroke-width:2.5;}
.wrong-pitch-markers {pointer-events:none;}.wrong-pitch-dot {fill:#1264db;stroke:#f3f9ff;stroke-width:2.5;}.wrong-pitch-ledger {stroke:#1264db;stroke-width:1.8;}.wrong-pitch-accidental {fill:#1264db;stroke:#f3f9ff;stroke-width:.7;paint-order:stroke fill;}.wrong-pitch-edge {position:absolute;bottom:6px;right:8px;display:flex;flex-wrap:wrap;gap:4px 10px;max-width:calc(100% - 16px);padding:3px 6px;border-radius:6px;background:#fffdf8;color:#1264db;font-size:.75rem;font-weight:700;pointer-events:none;}.wrong-pitch-edge span {overflow-wrap:anywhere;}
.header-paper {fill:#fffdf8;}.context-glyph {fill:#29464f;}.context-meter {fill:#29464f;font-size:32px;font-weight:800;text-anchor:middle;}
.context-clef-octave {fill:#29464f;font-size:14px;font-family:Georgia,serif;font-weight:700;text-anchor:middle;}
.fixed-start-barline {fill:currentColor;}.opening-barline {stroke:#9baeb0;stroke-width:1;}.repeat-heavy {stroke:currentColor;stroke-width:3;}
.practicing .play-line line {stroke-width:3;}.play-line.correct {stroke:#359060;fill:#359060;}.play-line.wrong,.play-line.missed {stroke:#ba493b;fill:#ba493b;}
.play-line-handle {position:absolute;top:0;transform:translateX(-50%);padding:0;width:44px;height:32px;min-height:32px;background:transparent;border:none;color:transparent;cursor:ew-resize;touch-action:none;}
.play-line-handle:focus-visible {color:#de6935;background:#fffaf3;}
.cross-staff-stem {stroke:#29464f;stroke-width:1.8;}.cross-staff-beam {fill:#29464f;}.cross-staff-curve {fill:none;stroke:#29464f;stroke-width:1.8;}
.practicing .cross-staff-stem,.practicing .cross-staff-curve {stroke-width:var(--workshop-note-stroke);}
.cross-staff-curve.tremolo {fill:#29464f;stroke:none;}
.listening-hint {color:#70878c;font-size:.8rem;line-height:1.5;text-align:center;margin:10px 0 18px;}
.seek-label {display:grid;grid-template-columns:1fr auto;gap:8px;font-size:.82rem;font-weight:600;}.seek-label output {font-variant-numeric:tabular-nums;color:#68858b;}
.seek-label input {grid-column:1/-1;width:100%;margin:0;height:36px;accent-color:#2c7b8b;}
.position-controls {display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px;}
.position-controls label {font-size:.8rem;display:flex;align-items:center;gap:8px;}
.position-controls input {box-sizing:border-box;width:64px;min-height:44px;padding:8px;border:1px solid #d1dfe1;border-radius:10px;background:#fffaf3;color:#29464f;font:inherit;}
@media(max-width:420px) {.listening-heading {align-items:flex-start;}h2 {font-size:1.05rem;}.transport-controls {gap:6px;}button {padding:10px;font-size:.8rem;}.position-label {font-size:.72rem;}}
</style>
