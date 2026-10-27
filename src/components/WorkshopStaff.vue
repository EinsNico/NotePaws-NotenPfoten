<template>
  <svg ref="sheet" class="workshop-staff" :class="{ compact, 'read-only':readOnly, 'full-size-notation':notationScale > 1 }" :style="[{ '--workshop-notation-scale':notationScale },!compact && geometry.width > 360+headerInset ? { maxWidth:'none' } : null]" :viewBox="'0 '+geometry.top+' '+geometry.width+' '+geometry.height"
    role="group" :aria-label="$t('WORKSHOP_SCORE_EDITOR')"
    @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @click="contextClick"
    @pointercancel="cancelGesture" @lostpointercapture="cancelGesture">
    <rect class="paper" x="0" :y="geometry.top" :width="geometry.width" :height="geometry.height" rx="14" />
    <line v-for="slot in (readOnly ? [] : gridSlots)" :key="'grid-'+slot"
      :x1="mappedSlotX(slot-gridStep)" :x2="mappedSlotX(slot-gridStep)"
      :y1="geometry.top+35" :y2="geometry.top+geometry.height-17" class="time-grid" :class="{ beat: slot%2 === 0 }" />
    <line v-for="y in [76,96,116,136,156]" :key="y" x1="12" :x2="geometry.width-12" :y1="y" :y2="y" class="staff-line" />
    <g v-if="showClef" class="context-symbol" data-workshop-context="clef" :role="readOnly ? null : 'button'" :tabindex="readOnly ? null : '0'" :aria-label="$t('WORKSHOP_CHANGE_CLEF')"
      @pointerdown.stop="contextPointerDown($event,'clef')" @keydown.stop="contextKeyDown($event,'clef')">
      <rect class="context-target" x="8" y="48" width="44" height="128" rx="8" />
      <path class="symbol" :d="clefPath(effectiveClef,16,1.9)" />
      <text v-if="effectiveClefOctave" x="31" :y="clefOctaveY(effectiveClef,effectiveClefOctave)" class="clef-octave" :data-clef-octave="effectiveClefOctave">{{Math.abs(effectiveClefOctave) === 2 ? '15' : '8'}}</text>
    </g>
    <g v-if="showKey" class="key-signature" aria-hidden="true">
      <path v-for="(pitch,index) in keySignature" :key="pitch.step+'-'+index" class="symbol"
        :data-step="pitch.step" :data-alter="pitch.alter" :data-octave="pitch.octave"
        :d="glyph(pitch.alter > 0 ? 'accidentals.sharp' : pitch.alter < 0 ? 'accidentals.flat' : 'accidentals.nat',headerKeyStart+8+index*12*notationScale,pitchY(pitch),.85*notationScale)" />
    </g>
    <g v-if="showMeter" class="context-symbol" data-workshop-context="meter" :role="readOnly ? null : 'button'" :tabindex="readOnly ? null : '0'" :aria-label="$t('WORKSHOP_CHANGE_METER')"
      @pointerdown.stop="contextPointerDown($event,'meter')" @keydown.stop="contextKeyDown($event,'meter')">
      <rect class="context-target" :x="headerKeyStart+signatureWidth" y="68" :width="meterWidth" height="94" rx="8" />
      <text :x="headerKeyStart+meterWidth/2+signatureWidth" y="109" class="meter" text-anchor="middle">{{meterNumbers[0]}}</text><text :x="headerKeyStart+meterWidth/2+signatureWidth" y="151" class="meter" text-anchor="middle">{{meterNumbers[1]}}</text>
    </g>
    <g v-for="change in (showContextChanges ? notation.contextChanges || [] : [])" :key="'context-'+change.id" class="context-symbol inbar-context" :data-context-change="change.id"
      :role="readOnly ? null : 'button'" :tabindex="readOnly ? null : 0" :aria-label="$t('WORKSHOP_CONTEXT_CHANGE_EDIT')"
      @pointerdown.stop="editContextChange($event,change.id)" @keydown.enter.stop.prevent="editContextChange($event,change.id)" @keydown.space.stop.prevent="editContextChange($event,change.id)">
      <rect class="context-target" :x="change.x" y="48" :width="change.width" height="128" rx="5" />
      <path v-if="change.hasClef" class="symbol" :d="clefPath(change.clef,change.x+2,1.35)" />
      <text v-if="change.hasClef && change.clefOctave" :x="change.x+14" :y="clefOctaveY(change.clef,change.clefOctave,true)" class="clef-octave" :data-clef-octave="change.clefOctave">{{Math.abs(change.clefOctave) === 2 ? '15' : '8'}}</text>
      <path v-for="(pitch,index) in change.signature" :key="index" class="symbol"
        :d="glyph(pitch.alter > 0 ? 'accidentals.sharp' : pitch.alter < 0 ? 'accidentals.flat' : 'accidentals.nat',change.x+change.clefWidth+index*12*notationScale,staffPitchY(pitch,change.clef),.85*notationScale)" />
    </g>
    <line :x1="geometry.width-12" :x2="geometry.width-12" y1="76" y2="156" class="staff-line" />
    <g v-if="measure.repeatStart" class="repeat-start" aria-hidden="true">
      <line :x1="geometry.left-8" :x2="geometry.left-8" y1="76" y2="156" class="repeat-heavy" />
      <line :x1="geometry.left-3" :x2="geometry.left-3" y1="76" y2="156" class="staff-line" />
      <circle v-for="y in [106,126]" :key="y" :cx="geometry.left+3" :cy="y" r="2.6" />
    </g>
    <g v-if="measure.repeatEnd" class="repeat-end" aria-hidden="true">
      <line :x1="geometry.width-16" :x2="geometry.width-16" y1="76" y2="156" class="staff-line" />
      <line :x1="geometry.width-11" :x2="geometry.width-11" y1="76" y2="156" class="repeat-heavy" />
      <circle v-for="y in [106,126]" :key="y" :cx="geometry.width-24" :cy="y" r="2.6" />
      <text :x="geometry.width-18" y="60" class="repeat-count">×{{measure.repeatEnd}}</text>
    </g>
    <rect v-if="gesture && gesture.eventId && gesture.pitch" :x="mappedSlotX(gesture.slot+gesture.startOffset-gridStep)"
      :y="geometry.top+35" :width="mappedSlotX(gesture.slot+gesture.startOffset+gesture.units-gridStep)-mappedSlotX(gesture.slot+gesture.startOffset-gridStep)" :height="geometry.height-52" class="time-target" :class="{ blocked:blockedDrag }" />
    <line v-if="gesture && gesture.pitch" :x1="geometry.left" :x2="geometry.width-12"
      :y1="pitchY(gesture.pitch,gesture.slot)" :y2="pitchY(gesture.pitch,gesture.slot)" class="pitch-guide" />
    <g v-for="stem in stems" :key="'stem-'+stem.id" class="notation-stem" :clip-path="noteClipPath" aria-hidden="true" :data-grace="!!stem.grace"
      :data-event-count="stem.eventIds.length" :data-note-value="stem.noteValue"
      :class="{ playing:stem.eventIds.some(id => activeEventIds.includes(id)), selected:stem.eventIds.some(isSelected), blocked:blockedDrag && stem.eventIds.some(isDragging) }">
      <line v-if="hasStem(stem.noteValue) && !crossStaffBeamIds.includes(stem.beamGroupId)" :x1="stem.x" :x2="stem.x" :y1="stem.y1" :y2="stem.y2" class="stem" />
      <template v-if="!stem.beamed && !crossStaffBeamIds.includes(stem.beamGroupId)">
        <path v-for="flag in flagCount(stem.noteValue)" :key="flag" :d="flagPath(stem,(flag-1)*8*notationScale)" class="flag" />
      </template>
    </g>
    <polygon v-for="beam in beams" :key="'beam-'+beam.id" :points="beam.points" class="beam" :clip-path="noteClipPath" aria-hidden="true"
      :data-beam-level="beam.level" :data-event-count="beam.eventIds.length"
      :class="{ playing:beam.eventIds.some(id => activeEventIds.includes(id)), selected:beam.eventIds.some(isSelected), blocked:blockedDrag && beam.eventIds.some(isDragging) }" />
    <path v-for="tie in tieCurves" :key="'tie-'+tie.id" :d="tie.path" class="tie" :clip-path="noteClipPath" aria-hidden="true"
      :data-from-id="tie.fromId" :data-to-id="tie.toId" :data-partial="tie.partial"
      :class="{ playing:tie.eventIds.some(id => activeEventIds.includes(id)), selected:tie.eventIds.some(isSelected) }" />
    <path v-for="slur in slurCurves" :key="'slur-'+slur.id" :d="slur.path" class="slur" :clip-path="noteClipPath" aria-hidden="true"
      :data-from-id="slur.fromId" :data-to-id="slur.toId" :data-partial="slur.partial"
      :class="{ selected:slur.eventIds.some(isSelected) }" />
    <path v-for="connection in glissandoLines" :key="'glissando-'+connection.id" :d="connection.path" class="glissando" :clip-path="noteClipPath" aria-hidden="true"
      :data-glissando="connection.type" :data-from-id="connection.fromId" :data-to-id="connection.toId"
      :class="{ selected:connection.eventIds.some(isSelected), playing:connection.eventIds.some(id => activeEventIds.includes(id)) }" />
    <path v-for="connection in tremoloConnections" :key="'tremolo-'+connection.id" :d="connection.path" class="tremolo" :clip-path="noteClipPath" aria-hidden="true"
      :data-tremolo-marks="connection.marks" :class="{ selected:connection.eventIds.some(isSelected), playing:connection.eventIds.some(id => activeEventIds.includes(id)) }" />
    <g v-for="tuplet in tuplets" :key="'tuplet-'+tuplet.id" class="tuplet" aria-hidden="true">
      <path v-if="tuplet.bracket" :d="tuplet.bracket" class="tuplet-bracket" />
      <text v-if="tuplet.number !== null" :x="tuplet.x" :y="tuplet.y" class="tuplet-number">{{tuplet.number}}</text>
    </g>
    <g v-for="event in events" :key="'event-'+event.id"
      :class="{ 'grip-held':practiceNoteStates && practiceNoteStates[event.id] === 'held', 'grip-found':practiceNoteStates && practiceNoteStates[event.id] === 'found', 'grip-unseen':practiceNoteStates && practiceNoteStates[event.id] === 'unseen', implicit:event.implicit, playing:event.kind === 'note' ? activeEventIds.includes(event.id) : event.id === activeEventId, selected:isSelected(event.id), blocked:blockedDrag && isDragging(event.id) }"
      :data-note-event="event.id" :data-voice="event.voice || 1" :data-grace="!!event.grace" :data-source-staff="event.sourcePartIndex" :role="event.implicit || readOnly ? null : 'button'" :tabindex="event.implicit || readOnly ? null : 0"
      :aria-label="event.implicit ? null : noteLabel(event)" :aria-pressed="event.implicit || readOnly ? null : isSelected(event.id)"
      @keydown="keyDown($event,event)">
      <g :clip-path="noteClipPath">
      <circle v-if="!event.implicit && !readOnly" :cx="event.x" :cy="event.y" r="17" class="note-target" />
      <template v-if="event.kind === 'note'">
        <line v-for="y in event.ledgers" :key="y" :x1="event.x-11*notationScale" :x2="event.x+11*notationScale" :y1="y" :y2="y" class="ledger" />
        <path v-if="event.accidental" class="symbol" :d="accidentalPath(event)" />
        <path v-if="event.accidental && event.accidentalDisplay && event.accidentalDisplay.enclosure" class="accidental-enclosure" :d="accidentalEnclosurePath(event)" />
        <rect v-if="event.noteValue === 'long' || event.noteValue === 'maxima'" :x="event.x-(event.noteValue === 'maxima' ? 10 : 6)*notationScale" :y="event.y-5*notationScale" :width="(event.noteValue === 'maxima' ? 20 : 12)*notationScale" :height="10*notationScale" class="note-head long-head" />
        <ellipse v-else :cx="event.x" :cy="event.y" :rx="(event.grace ? 4.5 : 7)*notationScale" :ry="(event.grace ? 3.2 : 5)*notationScale" class="note-head"
          :class="{ hollow:hollow(event.noteValue) }"
          :transform="'rotate(-15 '+event.x+' '+event.y+')'" />
        <path v-if="event.noteValue === 'breve'" :d="'M '+(event.x-11*notationScale)+' '+(event.y-8*notationScale)+' v '+16*notationScale+' M '+(event.x+11*notationScale)+' '+(event.y-8*notationScale)+' v '+16*notationScale" class="stem breve-bars" />
        <path v-if="event.grace && event.graceSlash !== false" :d="'M '+(event.stemX-5*notationScale)+' '+(event.stemEndY+12*notationScale)+' l '+12*notationScale+' '+(-8*notationScale)" class="grace-slash" />
      </template>
      <path v-else-if="!event.restHidden" class="symbol" :d="restPath(event)" />
      <circle v-for="dot in (event.dots || 0)" :key="'dot-'+dot" :cx="event.dotX+(dot-1)*7*notationScale" :cy="event.dotY" :r="(event.grace ? 1.5 : 2)*notationScale" class="augmentation-dot" />
      </g>
      <path v-for="mark in (event.expressionMarks || [])" :key="mark.kind" class="symbol expression-mark" :data-articulation="mark.kind"
        :d="expressionPath(event,mark)" :transform="inkTransform(event.x,mark.y)" />
      <path v-for="mark in (event.notationMarks || [])" :key="'notation-'+mark.kind" class="symbol notation-mark" :data-notation="mark.kind"
        :d="notationMarkPath(event,mark)" :transform="notationMarkTransform(event,mark)" />
      <path v-if="event.ornament === 'tremolo'" :d="tremoloPath(event)" class="tremolo" :clip-path="noteClipPath" />
      <g v-for="(lyric,index) in event.displayLyrics" :key="'lyric-'+lyric.number" class="lyric-line" :data-stanza="lyric.number">
        <text :x="event.x" :y="event.lyricY+lyric.rowIndex*19*notationScale" class="lyric">{{lyric.text}}</text>
        <text v-if="lyric.syllabic === 'begin' || lyric.syllabic === 'middle'" :x="event.lyricEndX" :y="event.lyricY+lyric.rowIndex*19*notationScale" class="lyric">−</text>
        <line v-if="lyric.extend && lyric.extend !== 'stop' && event.x+Math.max(8,lyric.text.length*3.5)*notationScale < event.lyricEndX" :x1="event.x+Math.max(8,lyric.text.length*3.5)*notationScale" :x2="event.lyricEndX" :y1="event.lyricY+lyric.rowIndex*19*notationScale+3" :y2="event.lyricY+lyric.rowIndex*19*notationScale+3" class="lyric-extension" />
      </g>
      <text v-for="(finger,index) in event.fingeringMarks" :key="'fingering-'+index" :x="finger.x" :y="finger.y" class="fingering" :clip-path="noteClipPath" :data-fingering-placement="finger.placement">{{finger.text}}</text>
      <text v-if="event.pedal" :x="event.x" :y="event.pedalY" class="pedal">{{event.pedal === 'down' ? 'Ped.' : event.pedal === 'half' ? '½ Ped.' : '✱'}}</text>
      <text v-if="event.id === selectedEventId" :x="event.x" :y="event.labelY" class="pitch-label" :clip-path="noteClipPath">{{noteLabel(event)}}</text>
    </g>
    <path v-for="arpeggio in arpeggios" :key="'arpeggio-'+arpeggio.id" :d="arpeggio.path" class="arpeggio" :clip-path="noteClipPath" :data-arpeggio="arpeggio.direction" aria-hidden="true" />
    <g v-for="mark in directionMarks" :key="'direction-'+mark.id" class="score-direction" :data-direction="mark.type" aria-hidden="true">
      <path v-if="mark.path" :d="mark.path" :class="{ 'direction-line':true, dashed:mark.type === 'octaveShift' }" />
      <text v-if="mark.text" :x="mark.x" :y="mark.y" :class="{ 'direction-text':true, 'dynamic-mark':mark.type === 'dynamic', 'tempo-mark':mark.type === 'tempo' }">{{mark.text}}</text>
      <path v-if="mark.glyph" class="symbol" :d="glyph(mark.glyph,mark.x,mark.y,.85*notationScale)" />
    </g>
    <g v-if="endingMark" class="volta-ending" aria-hidden="true">
      <path :d="endingMark.path" class="direction-line" /><text :x="endingMark.x+4*notationScale" :y="endingMark.y+15*notationScale" class="ending-number">{{endingMark.text}}</text>
    </g>
    <g v-for="mark in navigationMarks" :key="'navigation-'+mark.id" class="navigation-mark" :data-navigation="mark.kind" aria-hidden="true">
      <path v-if="mark.glyph" class="symbol" :d="glyph(mark.glyph,mark.x,mark.y,.9*notationScale)" />
      <text v-if="mark.text" :x="mark.textX" :y="mark.y" class="direction-text"><tspan v-for="(line,index) in mark.lines" :key="index" :x="mark.textX" :dy="index ? 18*notationScale : 0">{{line}}</tspan></text>
    </g>
    <text v-if="showContextDynamic" :x="geometry.left+8" :y="dynamicY" class="dynamic-mark">{{effectiveDynamic}}</text>
    <g v-if="gesture && gesture.eventId === null" class="placement-preview">
      <ellipse v-if="kind === 'note'" :cx="gesture.x" :cy="pitchY(gesture.pitch,gesture.slot)" rx="7" ry="5" />
      <path v-else :d="restPath({noteValue,x:gesture.x,y:116})" />
      <circle v-for="dot in dots" :key="dot" :cx="kind === 'rest' ? restDotAnchor({noteValue,x:gesture.x,y:116}).x+(dot-1)*7*notationScale : gesture.x+13+(dot-1)*7"
        :cy="kind === 'note' ? dotY(pitchY(gesture.pitch,gesture.slot)) : restDotAnchor({noteValue,x:gesture.x,y:116}).y" :r="kind === 'rest' ? 2*notationScale : 2" />
    </g>
    <text v-if="blockedDrag" x="214" :y="geometry.top+geometry.height-7" class="blocked-label">{{$t('WORKSHOP_MOVE_BLOCKED_SHORT')}}</text>
  </svg>
</template>

<script>
import { workshopAccidentalPath, workshopAccidentalEnclosurePath, workshopAccidentalInk } from "../model/WorkshopAccidentalGlyphs";
import { workshopContextAtSlot } from "../model/WorkshopContextChanges";
import Glyphs from "abcjs/src/write/creation/glyphs";
import { workshopMeasureEvents, workshopMeasureUnitsLimit, workshopPitchValue } from "../model/Workshop";
import { workshopEventUnits, workshopMeasureGridStep, workshopEventVoice, workshopTimeTicks } from "../model/WorkshopRhythm";
import { workshopStaffGeometry, workshopStaffY, workshopPitchAtStaffY, workshopClefReference,
  workshopChordEvents, moveWorkshopNote, moveWorkshopNotes } from "../model/WorkshopScoreEditor";
import { spaceWorkshopAccidentals } from "../model/WorkshopChordLayout";
import { workshopRestInk, workshopRestDotAnchor } from "../model/WorkshopRestLayout";
import { workshopRestGlyph, workshopRestPath, workshopRestExtraFlags } from "../model/WorkshopRestGlyphs";
import { createWorkshopStaffRawNotation } from "../model/WorkshopStaffNotation";
import { createWorkshopHorizontalMapping, workshopXAtMappedSlot, workshopSlotAtMappedX } from "../model/WorkshopHorizontalMapping";
import { layoutWorkshopBeams } from "../model/WorkshopBeamLayout";
import { workshopKeyAlter, workshopKeySignature } from "../model/WorkshopTonality";
import { workshopGlissandoPath, workshopTremoloConnectionPath } from "../model/WorkshopConnectionLayout";
import { workshopFingerings } from "../model/WorkshopFingerings";
import { workshopSwingLabel } from "../model/WorkshopPerformanceDetails";
import { workshopPedal, workshopPedalText } from "../model/WorkshopPedal";
const PITCH_STEPS=["C","D","E","F","G","A","B"];
const FLAG_VALUES=["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"];
const LONG_VALUES=["whole","breve","long","maxima"];
const ORNAMENT_GLYPHS={ trill:"scripts.trill",mordent:"scripts.mordent","inverted-mordent":"scripts.prall",turn:"scripts.turn","inverted-turn":"scripts.turn",
  "delayed-turn":"scripts.turn","delayed-inverted-turn":"scripts.turn","vertical-turn":"scripts.turn","inverted-vertical-turn":"scripts.turn" };
const ORNAMENT_ACCIDENTALS={"-2":"dblflat","-1.5":"threequarterflat","-1":"flat","-0.5":"halfflat","0":"nat","0.5":"halfsharp","1":"sharp","1.5":"threequartersharp","2":"dblsharp"};
function tupletNumber(value) { return value && typeof value === "object" ? value.actual : value; }
function flagCount(value) { return Math.max(0,FLAG_VALUES.indexOf(value)+1); }
function visualEvents(view) {
  const owner=Number.isInteger(view.staffIndex) ? view.staffIndex : 0;
  const previewOwner=view.gesture && view.gesture.sourcePartIndex !== undefined ? view.gesture.sourcePartIndex : owner;
  const own=workshopMeasureEvents({ events:previewOwner === owner && view.previewEvents || view.measure.events }).map(event => Object.assign({},event,{ sourcePartIndex:owner }));
  if (!view.companionMeasure) return own;
  const other=owner === 0 ? 1 : 0;
  return own.filter(event => event.displayStaff === undefined || event.displayStaff === owner).concat(
    workshopMeasureEvents({ events:previewOwner === other && view.previewEvents || view.companionMeasure.events }).filter(event => event.displayStaff === owner).map(event => Object.assign({},event,{ sourcePartIndex:other })));
}
function measureNavigation(measure) { return Array.isArray(measure.navigation) ? measure.navigation : []; }
function lyricRow(view,event,lyric) {
  const source=event.sourcePartIndex === undefined ? view.staffIndex : event.sourcePartIndex;
  const order=view.lyricVerseOrders[source] || [];
  return Math.max(0,order.indexOf(String(lyric.number)));
}
function displayLyrics(event) { return event.lyrics && event.lyrics.length ? event.lyrics : event.lyric ? [{number:'1',text:event.lyric}] : []; }

function contextClef(view) { return view.effectiveClef || view.clef || view.measure.clef || "treble"; }
function clefOctaveY(clef,octave,inline=false) { return octave > 0 ? (clef === 'treble' ? (inline ? 72 : 53) : 65) : (clef === 'treble' ? (inline ? 185 : 205) : 174); }
function contextMeter(view) { return view.effectiveMeter || view.meter || view.measure.meter || "4/4"; }
function contextKeyId(view) { return view.keyId || view.measure.keyId || "C-major"; }
function displaySignature(view) {
  const current=workshopKeySignature(contextKeyId(view),contextClef(view));
  const cancelled=view.previousKeyId && view.previousKeyId !== contextKeyId(view)
    ? workshopKeySignature(view.previousKeyId,contextClef(view)).filter(pitch => workshopKeyAlter(contextKeyId(view),pitch.step) !== pitch.alter)
      .map(pitch => Object.assign({},pitch,{ alter:0 })) : [];
  return cancelled.concat(current);
}
function inkScale(view) { return view.notationScale || 1; }
function keySignatureWidth(view) { const count=view.showKey === false ? 0 : displaySignature(view).length; return count ? (count*12+8)*inkScale(view) : 0; }
function contextualMeasure(view) { return Object.assign({},view.measure,{ clef:contextClef(view),meter:contextMeter(view) }); }
function displayGeometry(view,units) {
  const base=workshopStaffGeometry(units),offset=typeof view.headerInset === "number" ? view.headerInset : keySignatureWidth(view);
  const required=view.notation && view.notation.width;
  // Dense notation can need more horizontal room than the normal time grid.
  // Keep that grid and freeze the viewport during a drag to avoid pointer jumps.
  const width=view.gesture && Number.isFinite(view.gesture.originalWidth) ? view.gesture.originalWidth
    : Math.max(base.width+offset,Number.isFinite(required) ? required : 0,Number.isFinite(view.frameWidth) ? view.frameWidth : 0);
  return Object.assign({},base,{ left:base.left+offset,width });
}
function layoutDots(notation) {
  const scale=inkScale(notation),onsets=new Map();
  notation.events.filter(event => event.dots > 0).forEach(event => {
    if (event.kind === "rest") {
      const dot=workshopRestDotAnchor(event,scale);
      event.dotX=dot.x; event.dotY=dot.y; return;
    }
    const slot=event.displaySlot === undefined ? event.startSlot : event.displaySlot;
    if (!onsets.has(slot)) onsets.set(slot,[]); onsets.get(slot).push(event);
  });
  onsets.forEach((notes,slot) => {
    const heads=notation.events.filter(event => event.kind === "note" && (event.displaySlot === undefined ? event.startSlot : event.displaySlot) === slot);
    const left=Math.max(...heads.map(note => note.x))+13*scale,placed=[];
    notes.slice().sort((a,b) => a.y-b.y).forEach(note => {
      note.dotY=(note.y-156)%20 === 0 ? note.y-10 : note.y; note.dotX=left;
      while (placed.some(dot => Math.abs(dot.dotY-note.dotY) < 6*scale && Math.abs(dot.dotX-note.dotX) < 7*scale)) note.dotX+=8*scale;
      placed.push(note);
    });
  });
  return notation;
}
function layoutExpression(notation,multipleVoices) {
  const scale=inkScale(notation),fingers=[];
  notation.events.filter(event => !event.implicit).forEach(event => {
    const direction=multipleVoices && workshopEventVoice(event)%2 === 0 ? 1 : -1;
    const anchor=direction < 0 ? Math.min(event.y,event.stemEndY || event.y) : Math.max(event.y,event.stemEndY || event.y);
    event.expressionMarks=(event.articulations || []).map((kind,index) => ({ kind,direction,y:anchor+direction*(12+index*12)*scale }));
    event.notationMarks=[];
    if (ORNAMENT_GLYPHS[event.ornament]) event.notationMarks.push({ kind:event.ornament,glyph:ORNAMENT_GLYPHS[event.ornament],inverted:event.ornament.includes("inverted") && event.ornament.includes("turn"),rotation:event.ornament.includes("vertical") ? 90 : 0,long:!!event.ornamentLong,
      x:event.x+(event.ornament.startsWith("delayed") ? 18*scale : 0) });
    if (!event.ornament && event.ornamentWavy && event.ornamentWavy.type === 'start') event.notationMarks.push({kind:'trill',glyph:ORNAMENT_GLYPHS.trill,x:event.x});
    if (event.fermata) event.notationMarks.push({ kind:"fermata",direction,glyph:direction < 0 ? "scripts.ufermata" : "scripts.dfermata" });
    event.notationMarks.forEach((mark,index) => {
      const side=mark.kind !== 'fermata' && event.ornamentPlacement ? event.ornamentPlacement === 'above' ? -1 : 1 : direction;
      const markAnchor=side < 0 ? Math.min(event.y,event.stemEndY || event.y) : Math.max(event.y,event.stemEndY || event.y);
      mark.y=markAnchor+side*(24+event.expressionMarks.length*12+index*25)*scale;
      if(mark.kind !== 'fermata') mark.y=side < 0 ? Math.min(76-34*scale,mark.y) : Math.max(156+40*scale,mark.y);
    });
    const ornament=event.notationMarks.find(mark => mark.kind === event.ornament || mark.kind === 'trill' && event.ornamentWavy);
    if (ornament && event.ornamentAccidentals) ["upper","lower"].forEach(side => {
      if (Object.prototype.hasOwnProperty.call(event.ornamentAccidentals,side)) event.notationMarks.push({kind:"ornament-"+side+"-accidental",accidental:ORNAMENT_ACCIDENTALS[String(event.ornamentAccidentals[side])],
        x:ornament.x,y:ornament.y+(side === "upper" ? -25 : 21)*scale});
    });
    if (ornament && event.ornamentAccidentals) {
      const side=event.ornamentPlacement ? event.ornamentPlacement === 'above' ? -1 : 1 : direction;
      const accidentals=event.notationMarks.filter(mark=>mark.accidental);
      const ink=accidentals.map(mark=>workshopAccidentalInk(mark,mark.x-3*scale,mark.y,.65*scale)).filter(Boolean);
      if(ink.length) {
        // Ledger notes need the same clearance as notes inside the staff. Move
        // the ornament and its signs together only where their ink needs room.
        const head=(event.grace ? 3.2 : 5)*scale,stem=event.kind === 'note' && !['whole','breve'].includes(event.noteValue) && Number.isFinite(event.stemEndY);
        const edge=side < 0 ? Math.min(event.y-head,stem ? event.stemEndY-.85*scale : Infinity) : Math.max(event.y+head,stem ? event.stemEndY+.85*scale : -Infinity);
        const shift=side < 0 ? Math.min(0,edge-4*scale-Math.max(...ink.map(box=>box.bottom))) : Math.max(0,edge+4*scale-Math.min(...ink.map(box=>box.top)));
        ornament.y+=shift;accidentals.forEach(mark=>{mark.y+=shift;});
      }
    }
    const notationSpace=event.notationMarks.length*25*scale;
    if (event.fingering) {
      event.fingeringX=event.x;
      event.fingeringY=direction < 0 ? anchor-event.expressionMarks.length*12*scale-notationSpace-19*scale : anchor+event.expressionMarks.length*12*scale+notationSpace+28*scale;
      const sideMarks=event.notationMarks.filter(mark=>direction < 0 ? mark.y < anchor : mark.y > anchor);
      if(sideMarks.length) event.fingeringY=direction < 0 ? Math.min(event.fingeringY,Math.min(...sideMarks.map(mark=>mark.y-20*scale))-19*scale) : Math.max(event.fingeringY,Math.max(...sideMarks.map(mark=>mark.y+12*scale))+28*scale);
      while (fingers.some(other => Math.abs(other.fingeringX-event.fingeringX) < 11*scale && Math.abs(other.fingeringY-event.fingeringY) < 13*scale)) event.fingeringX+=12*scale;
      fingers.push(event);
    }
    event.fingeringMarks=event.fingering && !Array.isArray(event.fingerings)
      ? [{text:String(event.fingering),x:event.fingeringX,y:event.fingeringY,placement:direction < 0 ? 'above' : 'below'}] : [];
    if (event.pedal) event.pedalY=Math.max(226,event.y+65*scale);
  });
  return notation.events.some(event => Array.isArray(event.fingerings)) ? layoutFingerings(notation,multipleVoices) : notation;
}
function fingeringTextWidth(text,scale) {
  // Leave a conservative reserve for the score font and user-supplied labels.
  return Array.from(text).reduce((width,character) => width+(/\s/.test(character) ? 5 : /[1-5]/.test(character) ? 9 : /[().,\/]/.test(character) ? 6 : /[–\-]/.test(character) ? 10 : 15),0)*scale;
}
function fingeringLines(text,maximumWidth,scale) {
  const lines=[];let line='';
  Array.from(text).forEach(character => {
    if (line && fingeringTextWidth(line+character,scale) > maximumWidth) {
      // Prefer a gap between separate fingers; a long imported label can wrap
      // inside itself, retaining every character and its original order.
      const gap=line.lastIndexOf(' ');
      if (gap > 0) {lines.push(line.slice(0,gap));line=line.slice(gap+1);}
      else {lines.push(line);line='';}
    }
    line+=character;
  });
  if (line.trim()) lines.push(line.trim());
  return lines;
}
function overlaps(first,second,padding) {
  return first.left < second.right+padding && first.right > second.left-padding && first.top < second.bottom+padding && first.bottom > second.top-padding;
}
function layoutFingerings(notation,multipleVoices) {
  const scale=inkScale(notation),placed=[],obstacles=[];
  notation.events.filter(event => !event.implicit).forEach(event => {
    obstacles.push({left:event.x-12*scale,right:event.x+12*scale,top:event.y-7*scale,bottom:event.y+7*scale});
    if (Number.isFinite(event.stemEndY) && !['whole','breve'].includes(event.noteValue)) obstacles.push({left:event.stemX-2*scale,right:event.stemX+2*scale,top:Math.min(event.y,event.stemEndY)-3*scale,bottom:Math.max(event.y,event.stemEndY)+3*scale});
    (event.expressionMarks || []).forEach(mark => obstacles.push({left:event.x-14*scale,right:event.x+14*scale,top:mark.y-7*scale,bottom:mark.y+7*scale}));
    (event.notationMarks || []).forEach(mark => obstacles.push({left:(mark.x === undefined ? event.x : mark.x)-(mark.long ? 24 : 17)*scale,right:(mark.x === undefined ? event.x : mark.x)+(mark.long ? 24 : 17)*scale,top:mark.y-20*scale,bottom:mark.y+12*scale}));
  });
  notation.beams.forEach(beam => {
    const points=beam.points.split(' ').map(point => point.split(',').map(Number));
    obstacles.push({left:Math.min(...points.map(point => point[0])),right:Math.max(...points.map(point => point[0])),top:Math.min(...points.map(point => point[1]))-2*scale,bottom:Math.max(...points.map(point => point[1]))+2*scale});
  });
  notation.events.filter(event => !event.implicit).forEach(event => {
    const preferred=multipleVoices && workshopEventVoice(event)%2 === 0 ? 'below' : 'above',groups=new Map();
    workshopFingerings(event).forEach(finger => {
      const placement=finger.placement || preferred,value=finger.alternate ? '('+finger.value+')' : finger.value;
      const previous=groups.get(placement) || '';
      groups.set(placement,previous+(finger.substitution ? '–' : previous ? ' ' : '')+value);
    });
    event.fingeringMarks=[];
    groups.forEach((text,placement) => {
      const direction=placement === 'above' ? -1 : 1,anchor=direction < 0 ? Math.min(event.y,event.stemEndY || event.y) : Math.max(event.y,event.stemEndY || event.y);
      const sideMarks=(event.expressionMarks || []).concat(event.notationMarks || []).filter(mark => direction < 0 ? mark.y < anchor : mark.y > anchor);
      const edge=sideMarks.length ? (direction < 0 ? Math.min(...sideMarks.map(mark => mark.y-20*scale)) : Math.max(...sideMarks.map(mark => mark.y+12*scale))) : anchor;
      const paperWidth=Number.isFinite(notation.width) ? notation.width : 360,paperLeft=8-(notation.headerOffset || 0);
      const maximumWidth=Math.max(15*scale,Math.min(112*scale,(paperWidth-paperLeft-12)/2)),lines=fingeringLines(text,maximumWidth,scale);
      const width=Math.max(...lines.map(line => fingeringTextWidth(line,scale))),x=Math.max(paperLeft+width/2,Math.min(paperWidth-12-width/2,event.x));
      let baseline=direction < 0 ? edge-19*scale-(lines.length-1)*19*scale : edge+28*scale;
      const box=() => ({left:x-width/2,right:x+width/2,top:baseline-14*scale,bottom:baseline+(lines.length-1)*19*scale+5*scale});
      let collisions=obstacles.concat(placed).filter(other => overlaps(box(),other,4*scale));
      while (collisions.length) {
        const current=box();
        baseline+=direction < 0 ? Math.min(...collisions.map(other => other.top))-current.bottom-4*scale-.01 : Math.max(...collisions.map(other => other.bottom))-current.top+4*scale+.01;
        collisions=obstacles.concat(placed).filter(other => overlaps(box(),other,4*scale));
      }
      placed.push(box());
      lines.forEach((line,index) => event.fingeringMarks.push({text:line,x,y:baseline+index*19*scale,placement,width:fingeringTextWidth(line,scale)}));
    });
    if (event.fingeringMarks.length) {event.fingeringX=event.fingeringMarks[0].x;event.fingeringY=event.fingeringMarks[0].y;}
  });
  return notation;
}
function expressionEdge(event,direction,practiceLayout=false) {
  const scale=inkScale(event),hasVisibleStem=event.kind === 'note' && !['whole','breve'].includes(event.noteValue);
  const bounds=[event.y,!practiceLayout || hasVisibleStem ? event.stemEndY || event.y : event.y];
  if (practiceLayout && event.kind === 'rest') {const ink=workshopRestInk(event,scale);bounds.push(ink.top,ink.bottom);}
  if (scale > 1) bounds.push(event.y-6*scale,event.y+6*scale);
  (event.expressionMarks || []).forEach(mark => bounds.push(mark.y-5*scale,mark.y+5*scale));
  (event.notationMarks || []).forEach(mark => bounds.push(mark.y-17*scale,mark.y+10*scale));
  (event.fingeringMarks || []).forEach(mark => bounds.push(mark.y-14*scale,mark.y+5*scale));
  return direction < 0 ? Math.min(...bounds) : Math.max(...bounds);
}
function shiftNotation(notation,offset) {
  if (!offset) return notation;
  if (Number.isFinite(notation.width)) notation.width+=offset;
  // Chord and beam layout keep their proven time-area bounds. A key signature
  // adds space before that area, so translate the completed notation together.
  notation.events.forEach(event => {
    ["x","stemX","accidentalX","dotX","fingeringX"].forEach(field => {if (Number.isFinite(event[field])) event[field]+=offset;});
    (event.fingeringMarks || []).forEach(mark => {mark.x+=offset;});
    (event.notationMarks || []).forEach(mark => {if (Number.isFinite(mark.x)) mark.x+=offset;});
  });
  (notation.contextChanges || []).forEach(change => { change.x+=offset; });
  notation.stems.forEach(stem => { stem.x+=offset; });
  notation.beams.forEach(beam => { beam.points=beam.points.split(" ").map(point => {
    const [x,y]=point.split(","); return (Number(x)+offset)+","+y;
  }).join(" "); });
  return notation;
}
const WorkshopStaff={
  name:"WorkshopStaff",
  props:{
    allowLegacyGeneratedRests:{ type:Boolean, default:false },
    notationScale:{ type:Number, default:1 },
    contextScale:{ type:Number, default:null },
    measure:{ type:Object, required:true }, activeEventId:{ type:String, default:null },
    clef:{ type:String, default:null }, clefOctave:{ type:Number, default:null }, meter:{ type:String, default:null },
    keyId:{ type:String, default:"C-major" }, followKeySignature:{ type:Boolean, default:false },
    previousKeyId:{ type:String, default:null }, dynamic:{ type:String, default:"mf" },
    voice:{ type:Number, default:1 }, tuplet:{ type:[Number,Object], default:0 },
    staffIndex:{ type:Number, default:0 }, companionMeasure:{ type:Object, default:null }, companionClef:{ type:String, default:null },
    crossStaffBeamIds:{ type:Array,default:() => [] }, crossStaffRelationIds:{ type:Array,default:() => [] }, directionSpans:{ type:Array,default:() => [] },
    readOnly:{ type:Boolean, default:false }, compact:{ type:Boolean, default:false },
    practiceLayout:{ type:Boolean, default:false },
    noteClipPath:{ type:String, default:null },
    leadingContextRight:{ type:Number, default:null },
    showClef:{ type:Boolean, default:true }, showKey:{ type:Boolean, default:true }, showMeter:{ type:Boolean, default:true }, showDynamic:{ type:Boolean, default:true },
    showContextChanges:{ type:Boolean, default:true },
    frameTop:{ type:Number, default:null }, frameBottom:{ type:Number, default:null },
    headerLeft:{ type:Number, default:null }, frameWidth:{ type:Number, default:null }, horizontalColumns:{ type:Map, default:null },
    activeEventIds:{ type:Array, default:() => [] },
    practiceNoteStates:{ type:Object, default:null },
    selectedEventId:{ type:String, default:null }, selectedEventIds:{ type:Array, default:() => [] }, kind:{ type:String, default:"note" },
    multiSelect:{ type:Boolean, default:false },
    selectionOnly:{ type:Boolean, default:false },
    selectionUnit:{ type:String, default:"note", validator:value => ["note","chord"].includes(value) },
    noteValue:{ type:String, default:"quarter" }, alter:{ type:Number, default:0 },
    dots:{ type:Number, default:0, validator:value => [0,1,2,3].includes(value) },
    ties:{ type:Array, default:() => [] }, slurs:{ type:Array, default:() => [] }, glissandos:{ type:Array, default:() => [] }, tremolos:{ type:Array, default:() => [] }, barIndex:{ type:Number, default:0 },
    lyricVerseNumbers:{ type:Array, default:() => [] }, sourceLyricVerseNumbers:{ type:[Array,Object], default:null },
    noteLabel:{ type:Function, default:event => event.kind }
  },
  data() { return { gesture:null,contextClickKind:null }; },
  computed:{
    lyricVerseOrders() {
      const orders={};
      Object.keys(this.sourceLyricVerseNumbers || {}).forEach(source => { orders[source]=new Set(this.sourceLyricVerseNumbers[source].map(String)); });
      if (!orders[this.staffIndex]) orders[this.staffIndex]=new Set(this.lyricVerseNumbers.map(String));
      this.notation.events.forEach(event => {
        const source=event.sourcePartIndex === undefined ? this.staffIndex : event.sourcePartIndex;
        if (!orders[source]) orders[source]=new Set();
        displayLyrics(event).forEach(lyric => orders[source].add(String(lyric.number)));
      });
      Object.keys(orders).forEach(source => { orders[source]=Array.from(orders[source]).sort((a,b) => a.localeCompare(b,'en',{numeric:true})); });
      return orders;
    },
    lyricRows() {
      return Math.max(0,...this.notation.events.reduce((rows,event) => rows.concat(displayLyrics(event).map(lyric => lyricRow(this,event,lyric)+1)),[]));
    },
    effectiveClef() { return this.clef || this.measure.clef || "treble"; },
    effectiveClefOctave() { return this.clefOctave === null || this.clefOctave === undefined ? this.measure.clefOctave || 0 : this.clefOctave; },
    effectiveMeter() { return this.meter || this.measure.meter || "4/4"; },
    keySignature() { return displaySignature(this); },
    signatureWidth() { return keySignatureWidth(this); },
    headerKeyStart() { return this.showClef ? 46 : 12; },
    meterWidth() { return Math.max(44,this.effectiveMeter.split('/')[0].length*16+8); },
    headerInset() { return Number.isFinite(this.headerLeft) ? this.headerLeft-90 : this.headerKeyStart+this.signatureWidth+(this.showMeter ? this.meterWidth : 0)-90; },
    effectiveDynamic() { return this.measure.dynamic || this.dynamic; },
    notationDirections() {
      const byId=new Map((this.measure.directions || []).map(direction => [direction.id,direction]));
      (this.directionSpans || []).forEach(direction => {
        if (direction.type === 'pedal' && direction.startsHere) {
          const sourceId=direction.id.replace(/-pedal-\d+$/,'');
          byId.set(sourceId,Object.assign({},byId.get(sourceId),direction,{id:sourceId}));
        } else byId.set(direction.id,direction);
      });
      return Array.from(byId.values()).filter(direction => direction.type !== 'pedal' || direction.startsHere !== undefined || !!workshopPedalText(direction));
    },
    showContextDynamic() {
      // MusicXML keeps the initial dynamic both as measure context and as an
      // editable direction. Draw that explicit mark once, retaining later changes.
      return this.showDynamic && !!this.effectiveDynamic && !this.notationDirections.some(direction =>
        direction.type === "dynamic" && workshopTimeTicks(direction.startSlot || 0) === 0 && direction.value === this.effectiveDynamic);
    },
    dynamicY() {
      const bounds=this.notation.events.map(event => expressionEdge(event,1,this.practiceLayout));
      this.tuplets.forEach(tuplet => bounds.push(tuplet.y+12*this.notationScale));
      this.tieCurves.forEach(curve => bounds.push(curve.maximumY));
      this.slurCurves.forEach(curve => bounds.push(curve.maximumY));
      this.pedalMarks.forEach(pedal => bounds.push(pedal.y+6*this.notationScale));
      const lyricRows=this.lyricRows;
      if (lyricRows) bounds.push(Math.max(216,...this.notation.events.map(event => expressionEdge(event,1,this.practiceLayout)+34*this.notationScale))+(lyricRows-1)*19*this.notationScale+6*this.notationScale);
      return Math.max(204,...this.notation.events.filter(event => event.pitch).map(event => event.y+32*this.notationScale),...bounds.map(y => y+(this.practiceLayout ? 22 : 31)*this.notationScale));
    },
    meterUnits() { return workshopMeasureUnitsLimit(contextualMeasure(this)); },
    meterNumbers() { return this.effectiveMeter.split("/"); },
    gridStep() { return workshopMeasureGridStep(this.measure,{ noteValue:this.noteValue,dots:this.dots,tuplet:this.tuplet }); },
    gridSlots() { const count=Math.round(this.meterUnits/this.gridStep),stride=Math.max(1,Math.ceil(count/256)); return Array.from({ length:Math.floor(count/stride)+1 },(_,index) => index*stride*this.gridStep); },
    geometry() {
      const base=displayGeometry(this,this.meterUnits);
      const limits=this.compact ? [40,220] : [0,base.height];
      if (this.showClef && this.effectiveClefOctave) {const y=clefOctaveY(this.effectiveClef,this.effectiveClefOctave);limits.push(y-15,y+5);}
      (this.notation.contextChanges || []).filter(change => this.showContextChanges && change.hasClef && change.clefOctave).forEach(change => {const y=clefOctaveY(change.clef,change.clefOctave,true);limits.push(y-15,y+5);});
      if (this.gesture && Number.isFinite(this.gesture.originalTop)) limits.push(this.gesture.originalTop,this.gesture.originalBottom);
      if (Number.isFinite(this.frameTop)) limits.push(this.frameTop); if (Number.isFinite(this.frameBottom)) limits.push(this.frameBottom);
      // Keep the saved notes' space while previewing a drag so the paper does
      // not shrink beneath a pointer that began on an outer ledger line.
      if (!this.practiceLayout) visualEvents({ measure:this.measure,companionMeasure:this.companionMeasure,staffIndex:this.staffIndex,previewEvents:null,gesture:null }).filter(event => event.pitch).forEach(event => {
        const context=workshopContextAtSlot({contextChanges:this.measure.contextChanges},event.startSlot,{clef:contextClef(this),keyId:contextKeyId(this)});
        const y=workshopStaffY(event.pitch,context.clef); limits.push(y-24*this.notationScale,y+24*this.notationScale);
      });
      this.events.filter(event => event.pitch).forEach(event => {
        const headReserve=this.practiceLayout ? (event.noteValue === 'breve' ? 8 : 6)*this.notationScale+4 : 24*this.notationScale;
        limits.push(event.y-headReserve,event.y+headReserve);
        if (this.practiceLayout && event.accidental) {const ink=workshopAccidentalInk(event,event.accidentalX,event.y,.85*this.notationScale);limits.push(ink.top-4,ink.bottom+4);}
        (event.expressionMarks || []).forEach(mark => limits.push(mark.y-5*this.notationScale,mark.y+5*this.notationScale));
        (event.notationMarks || []).forEach(mark => limits.push(mark.y-20*this.notationScale,mark.y+12*this.notationScale));
        if (event.displayLyrics.length) limits.push(event.lyricY-14*this.notationScale,event.lyricY+Math.max(...event.displayLyrics.map(lyric => lyric.rowIndex))*19*this.notationScale+6*this.notationScale);
        (event.fingeringMarks || []).forEach(mark => limits.push(mark.y-14*this.notationScale,mark.y+5*this.notationScale));
        if (event.pedal) limits.push(event.pedalY-15*this.notationScale,event.pedalY+6*this.notationScale);
        if (event.id === this.selectedEventId) {
          const label=event.labelY;
          limits.push(label-14,label+5);
        }
      });
      this.events.filter(event => event.kind === "rest").forEach(event => {
        const bounds=workshopRestInk(event,this.notationScale),padding=(this.practiceLayout ? 4 : 8)*this.notationScale; limits.push(bounds.top-padding,bounds.bottom+padding);
      });
      this.notation.stems.forEach(stem => {
        if (this.practiceLayout && ['whole','breve'].includes(stem.noteValue)) return;
        const flags=flagCount(stem.noteValue),hasFlag=flags && !(this.practiceLayout && stem.beamed);
        const flagEnd=stem.y2+stem.direction*(hasFlag ? (20+flags*8)*this.notationScale : 0);
        limits.push(stem.y1-4*this.notationScale,stem.y1+4*this.notationScale,stem.y2-4*this.notationScale,stem.y2+4*this.notationScale,flagEnd-4*this.notationScale,flagEnd+4*this.notationScale);
      });
      this.notation.beams.forEach(beam => beam.points.split(" ").forEach(point => {
        const y=Number(point.split(",")[1]); limits.push(y-8*this.notationScale,y+8*this.notationScale);
      }));
      this.tieCurves.forEach(tie => limits.push(tie.minimumY-4*this.notationScale,tie.maximumY+4*this.notationScale));
      this.slurCurves.forEach(slur => limits.push(slur.minimumY-4*this.notationScale,slur.maximumY+4*this.notationScale));
      this.glissandoLines.forEach(line => limits.push(line.minimumY-4*this.notationScale,line.maximumY+4*this.notationScale));
      this.tremoloConnections.forEach(line => limits.push(line.minimumY-4*this.notationScale,line.maximumY+4*this.notationScale));
      this.tuplets.forEach(tuplet => limits.push(tuplet.y-17*this.notationScale,tuplet.y+12*this.notationScale));
      if (this.practiceLayout) this.arpeggios.forEach(mark => limits.push(mark.minimumY,mark.maximumY));
      if (this.showContextDynamic) limits.push(this.dynamicY-22*this.notationScale,this.dynamicY+7*this.notationScale);
      this.directionMarks.forEach(mark => limits.push(mark.minimumY,mark.maximumY));
      this.navigationMarks.forEach(mark => limits.push(mark.y-30*this.notationScale,mark.y+8*this.notationScale+Math.max(0,mark.lines.length-1)*18*this.notationScale));
      if (this.endingMark) limits.push(this.endingMark.y-3*this.notationScale,this.endingMark.y+18*this.notationScale);
      const top=Math.floor(Math.min(...limits)/10)*10;
      const bottom=Math.ceil(Math.max(...limits)/10)*10;
      return Object.assign({},base,{ top,height:bottom-top });
    },
    previewEvents() {
      if (!this.gesture || !this.gesture.eventId || !this.gesture.pitch || this.gesture.pitchOverflow) return null;
      const measure=Object.assign({},this.sourceMeasure(this.gesture.eventId),{ clef:this.effectiveClef,meter:this.effectiveMeter });
      return this.gesture.group
        ? moveWorkshopNotes(measure,this.gesture.eventIds,this.gesture.eventId,this.gesture.slot,this.gesture.requestedPitch || this.gesture.pitch)
        : moveWorkshopNote(measure,this.gesture.eventId,this.gesture.slot,this.gesture.pitch);
    },
    blockedDrag() { return !!(this.gesture && this.gesture.eventId && this.gesture.pitch && !this.previewEvents); },
    pedalMarks() {
      const bounds=this.notation.events.map(event => expressionEdge(event,1,this.practiceLayout));
      this.tuplets.forEach(tuplet => bounds.push(tuplet.y+12*this.notationScale));
      this.tieCurves.forEach(curve => bounds.push(curve.maximumY));
      this.slurCurves.forEach(curve => bounds.push(curve.maximumY));
      const lyricRows=this.lyricRows;
      if (lyricRows) bounds.push(Math.max(216,...this.notation.events.map(event => expressionEdge(event,1,this.practiceLayout)+34*this.notationScale))+(lyricRows-1)*19*this.notationScale+8*this.notationScale);
      const baseline=Math.max(226,...bounds.map(y => y+25*this.notationScale)),placed=[];
      this.notation.events.filter(event => event.pedal).forEach(event => {
        let y=baseline;
        while (placed.some(other => Math.abs(other.x-event.x) < 31*this.notationScale && Math.abs(other.y-y) < 22*this.notationScale)) y+=22*this.notationScale;
        placed.push({ id:event.id,x:event.x,y });
      });
      return placed;
    },
    events() {
      const pedals=new Map(this.pedalMarks.map(pedal => [pedal.id,pedal.y]));
      const lyricY=Math.max(216,...this.notation.events.map(event => expressionEdge(event,1,this.practiceLayout)+34*this.notationScale));
      const labelY=Math.max(this.dynamicY+27,...this.directionMarks.filter(mark => mark.maximumY > 156).map(mark => mark.maximumY+22));
      return this.notation.events.map(event => {
        const lyrics=displayLyrics(event).map(lyric => Object.assign({},lyric,{rowIndex:lyricRow(this,event,lyric)})),next=this.notation.events.filter(other => other.kind === 'note' && other.startSlot > event.startSlot && other.sourcePartIndex === event.sourcePartIndex && workshopEventVoice(other) === workshopEventVoice(event)).sort((a,b) => a.startSlot-b.startSlot)[0];
        return Object.assign({},event,{displayLyrics:lyrics,lyricY,labelY,lyricEndX:next ? (event.x+next.x)/2 : event.x+32},pedals.has(event.id) ? { pedalY:pedals.get(event.id) } : {});
      });
    },
    stems() { return this.notation.stems; },
    beams() { return this.notation.beams; },
    tieCurves() {
      const notes=new Map(this.notation.events.filter(event => event.kind === "note").map(event => [event.id,event]));
      const base=displayGeometry(this,this.meterUnits);
      return this.ties.map(tie => {
        if (this.crossStaffRelationIds.includes("tie:"+tie.fromId+":"+tie.toId)) return null;
        const from=tie.fromBarIndex === this.barIndex ? notes.get(tie.fromId) : null;
        const to=tie.toBarIndex === this.barIndex ? notes.get(tie.toId) : null;
        if (!from && !to) return null;
        const anchor=from || to,direction=anchor.stemDirection;
        const distance=from && to ? to.x-from.x : Infinity,inset=Math.min(6*this.notationScale,Math.max(this.notationScale,distance*.15));
        const x1=from ? from.x+inset : base.left,x2=to ? to.x-inset : base.width-12;
        if (x2 <= x1) return null;
        const y1=(from || to).y+direction*7*this.notationScale,y2=(to || from).y+direction*7*this.notationScale;
        const bend=Math.min(18*this.notationScale,Math.max(8*this.notationScale,(x2-x1)*.18)),middle1=y1+direction*bend,middle2=y2+direction*bend;
        return { id:tie.fromId+":"+tie.toId,fromId:tie.fromId,toId:tie.toId,eventIds:[from && from.id,to && to.id].filter(Boolean),
          partial:!from || !to,minimumY:Math.min(y1,y2,middle1,middle2),maximumY:Math.max(y1,y2,middle1,middle2),
          path:"M "+x1+" "+y1+" C "+(x1+(x2-x1)*.3)+" "+middle1+" "+(x2-(x2-x1)*.3)+" "+middle2+" "+x2+" "+y2 };
      }).filter(Boolean);
    },
    slurCurves() {
      const events=this.notation.events.filter(event => event.kind === "note"),notes=new Map(events.map(event => [event.id,event]));
      const base=displayGeometry(this,this.meterUnits);
      return this.slurs.map(slur => {
        if (this.crossStaffRelationIds.includes("slur:"+slur.fromId+":"+slur.toId)) return null;
        const from=slur.fromBarIndex === this.barIndex ? notes.get(slur.fromId) : null,to=slur.toBarIndex === this.barIndex ? notes.get(slur.toId) : null;
        if (!from && !to && !(slur.fromBarIndex < this.barIndex && slur.toBarIndex > this.barIndex)) return null;
        const anchor=from || to,voice=anchor ? workshopEventVoice(anchor) : slur.voice || 1;
        const owner=anchor ? anchor.sourcePartIndex : slur.sourcePartIndex;
        if (!from && !to && owner !== undefined && owner !== this.staffIndex && !events.some(event => event.sourcePartIndex === owner)) return null;
        const direction=voice%2 === 0 ? 1 : -1,within=events.filter(event => (owner === undefined || event.sourcePartIndex === owner) && workshopEventVoice(event) === voice
          && (!from || event.startSlot >= from.startSlot) && (!to || event.startSlot <= to.startSlot));
        const bounds=within.map(event => expressionEdge(event,direction,this.practiceLayout)),withinIds=new Set(within.map(event => event.id));
        this.tuplets.filter(tuplet => tuplet.voice === voice && tuplet.eventIds.some(id => withinIds.has(id)))
          .forEach(tuplet => bounds.push(direction < 0 ? tuplet.y-17*this.notationScale : tuplet.y+12*this.notationScale));
        const y=direction < 0 ? Math.min(65,...bounds)-18*this.notationScale : Math.max(175,...bounds)+18*this.notationScale;
        const x1=from ? from.x : base.left,x2=to ? to.x : base.width-12;
        if (x2 <= x1) return null;
        const bend=Math.min(34*this.notationScale,Math.max(14*this.notationScale,(x2-x1)*.13)),middle=y+direction*bend;
        return { id:slur.fromId+":"+slur.toId,fromId:slur.fromId,toId:slur.toId,eventIds:[from && from.id,to && to.id].filter(Boolean),partial:!from || !to,
          minimumY:Math.min(y,middle),maximumY:Math.max(y,middle),path:"M "+x1+" "+y+" C "+(x1+(x2-x1)*.3)+" "+middle+" "+(x2-(x2-x1)*.3)+" "+middle+" "+x2+" "+y };
      }).filter(Boolean);
    },
    glissandoLines() {
      const notes=new Map(this.notation.events.filter(event => event.kind === 'note').map(event => [event.id,event])),base=displayGeometry(this,this.meterUnits);
      return this.glissandos.map(edge => {
        if (this.crossStaffRelationIds.includes('glissando:'+edge.fromId+':'+edge.toId)) return null;
        const from=edge.fromBarIndex === this.barIndex ? notes.get(edge.fromId) : null,to=edge.toBarIndex === this.barIndex ? notes.get(edge.toId) : null;
        if (!from && !to && !(edge.fromBarIndex < this.barIndex && edge.toBarIndex > this.barIndex)) return null;
        if (!from && !to && edge.sourcePartIndex !== undefined && edge.sourcePartIndex !== this.staffIndex) return null;
        const y1=from ? from.y : edge.fromPitch ? workshopStaffY(edge.fromPitch,this.effectiveClef) : to ? to.y : 116;
        const y2=to ? to.y : edge.toPitch ? workshopStaffY(edge.toPitch,this.effectiveClef) : from ? from.y : 116;
        const inset=from && to ? Math.min(10*this.notationScale,(to.x-from.x)/4) : 10*this.notationScale;
        const x1=from ? from.x+inset : base.left,x2=to ? to.x-inset : base.width-12;
        if (!(x2 > x1) || !Number.isFinite(y1) || !Number.isFinite(y2)) return null;
        return Object.assign({},edge,{id:edge.fromId+':'+edge.toId,eventIds:[from && from.id,to && to.id].filter(Boolean),minimumY:Math.min(y1,y2)-3,maximumY:Math.max(y1,y2)+3,path:workshopGlissandoPath(x1,y1,x2,y2,edge.type,this.notationScale)});
      }).filter(Boolean);
    },
    tremoloConnections() {
      const notes=new Map(this.notation.events.filter(event => event.kind === 'note').map(event => [event.id,event]));
      return this.tremolos.map(edge => {
        if (this.crossStaffRelationIds.includes('tremolo:'+edge.fromId+':'+edge.toId)) return null;
        const from=notes.get(edge.fromId),to=notes.get(edge.toId);if (!from || !to || to.x <= from.x) return null;
        const y1=(from.y+from.stemEndY)/2,y2=(to.y+to.stemEndY)/2;
        return Object.assign({},edge,{id:edge.fromId+':'+edge.toId,eventIds:[edge.fromId,edge.toId],minimumY:Math.min(y1,y2)-2,maximumY:Math.max(y1,y2)+edge.marks*6*this.notationScale,path:workshopTremoloConnectionPath(from.stemX,y1,to.stemX,y2,edge.marks,this.notationScale)});
      }).filter(Boolean);
    },
    tuplets() {
      const groups=new Map();
      this.notation.events.filter(event => !event.implicit && tupletNumber(event.tuplet) > 1).forEach(event => {
        const id=event.tupletGroupId || event.id;
        if (!groups.has(id)) groups.set(id,[]); groups.get(id).push(event);
      });
      return Array.from(groups.entries()).map(([id,notes]) => {
        const display=notes.find(note => note.tupletDisplay) || notes[0],options=display.tupletDisplay || {};
        const number=options.showNumber === 'none' ? null : options.showNumber === 'both'
          ? tupletNumber(notes[0].tuplet)+":"+(typeof notes[0].tuplet === 'object' ? notes[0].tuplet.normal : 2) : tupletNumber(notes[0].tuplet);
        const showBracket=options.bracket !== false && notes.length > 1;
        if (number === null && !showBracket) return null;
        const stemDirections=Array.from(new Set(notes.filter(note => note.kind === 'note' && !['whole','breve'].includes(note.noteValue) && [1,-1].includes(note.stemDirection)).map(note => note.stemDirection)));
        const direction=options.placement === 'above' ? -1 : options.placement === 'below' ? 1
          : stemDirections.length === 1 ? -stemDirections[0] : workshopEventVoice(notes[0])%2 === 0 ? 1 : -1;
        const x1=Math.min(...notes.map(note => note.x))-7*this.notationScale,x2=Math.max(...notes.map(note => note.x))+7*this.notationScale,x=(x1+x2)/2;
        // Reserve space beyond the staff and all ink in the group's horizontal
        // span, including another voice. Tuplet numbers must not cross a staff line.
        const nearby=this.notation.events.filter(note => note.x >= x1-7*this.notationScale && note.x <= x2+7*this.notationScale);
        const edges=nearby.map(note => {
          const edge=expressionEdge(note,direction,this.practiceLayout);
          if (note.kind !== 'rest') return edge;
          const ink=workshopRestInk(note,this.notationScale);
          return direction < 0 ? Math.min(edge,ink.top) : Math.max(edge,ink.bottom);
        });
        const edge=direction < 0 ? Math.min(76,...edges) : Math.max(156,...edges);
        const y=edge+direction*24*this.notationScale;
        const gap=number === null ? 0 : options.showNumber === 'both' ? 18*this.notationScale : 8*this.notationScale;
        const bracket=showBracket ? "M "+x1+" "+(y+direction*-6*this.notationScale)+" V "+y+" H "+(x-gap)+" M "+(x+gap)+" "+y+" H "+x2+" V "+(y+direction*-6*this.notationScale) : null;
        return { id,x,y:y+4*this.notationScale,bracket,number,voice:workshopEventVoice(notes[0]),eventIds:notes.map(note => note.id) };
      }).filter(Boolean);
    },
    arpeggios() {
      const groups=new Map();
      this.notation.events.filter(event => event.arpeggio && event.kind === "note").forEach(event => {
        const key=event.startSlot+":"+workshopEventVoice(event)+":"+event.arpeggio;
        if (!groups.has(key)) groups.set(key,[]);groups.get(key).push(event);
      });
      return Array.from(groups.entries()).map(([id,events]) => {
        const onset=this.notation.events.filter(event => event.kind === "note" && event.startSlot === events[0].startSlot && workshopEventVoice(event) === workshopEventVoice(events[0]));
        const x=Math.min(...onset.map(event => event.accidental ? event.accidentalX : event.x))-12*this.notationScale;
        const top=Math.min(...onset.map(event => event.y))-10*this.notationScale,bottom=Math.max(...onset.map(event => event.y))+10*this.notationScale;
        let path="M "+x+" "+top; for (let y=top; y < bottom; y+=8*this.notationScale) path+=" q "+(-4*this.notationScale)+" "+2*this.notationScale+" 0 "+4*this.notationScale+" q "+4*this.notationScale+" "+2*this.notationScale+" 0 "+4*this.notationScale;
        const direction=events[0].arpeggio;path+=" M "+(x-4*this.notationScale)+" "+(direction === "down" ? bottom-4*this.notationScale : top+4*this.notationScale)+" l "+4*this.notationScale+" "+((direction === "down" ? 4 : -4)*this.notationScale)+" l "+4*this.notationScale+" "+((direction === "down" ? -4 : 4)*this.notationScale);
        return { id,path,direction,minimumY:top-4,maximumY:bottom+4 };
      });
    },
    notationTop() {
      const bounds=this.notation.events.map(event => expressionEdge(event,-1,this.practiceLayout));
      this.tuplets.forEach(tuplet => bounds.push(tuplet.y-17*this.notationScale));this.slurCurves.forEach(slur => bounds.push(slur.minimumY));
      return Math.min(48,...bounds)-(this.practiceLayout ? 12 : 22)*this.notationScale;
    },
    directionMarks() {
      const base=displayGeometry(this,this.meterUnits),right=base.width-26*this.notationScale,placed=[],pedalRows=new Map();
      const bottom=Math.max(this.dynamicY+30*this.notationScale,...this.notation.events.filter(event => displayLyrics(event).length).map(event => expressionEdge(event,1,this.practiceLayout)+58*this.notationScale+Math.max(...displayLyrics(event).map(lyric => lyricRow(this,event,lyric)))*19*this.notationScale));
      const xFor=slot => Math.max(base.left,Math.min(right,workshopXAtMappedSlot(this.horizontalMapping,Number(slot || 0)-this.gridStep)));
      return this.notationDirections.map((direction,index) => {
        const x=xFor(direction.startSlot),end=xFor(direction.endSlot === undefined ? this.meterUnits : direction.endSlot);
        const pedal=direction.type === 'pedal' ? workshopPedal(direction) : null;
        const above=pedal ? pedal.placement === 'above' : direction.type === 'trillLine' ? direction.placement !== 'below' : ["tempo","tempoRamp","octaveShift","text","swing"].includes(direction.type);
        let y=above ? this.notationTop : bottom;
        const width=direction.endSlot === undefined ? Math.min(100*this.notationScale,right-x) : Math.max(30*this.notationScale,end-x);
        const pedalKey=pedal ? pedal.kind+':'+pedal.number+':'+pedal.placement : null;
        if(pedalKey && pedalRows.has(pedalKey)) y=pedalRows.get(pedalKey);
        else {
          while (placed.some(mark => mark.above === above && Math.abs(mark.y-y) < 23*this.notationScale && mark.x < x+width && x < mark.x+mark.width)) y+=above ? -27*this.notationScale : 27*this.notationScale;
          if(pedalKey) pedalRows.set(pedalKey,y);
        }
        placed.push({ x,y,width,above });
        let text=null,path=null;
        if (direction.type === "tempo") text="♩ = "+direction.value;
        if (direction.type === "tempoRamp") { text="→ ♩ = "+direction.value;path="M "+x+" "+(y+6*this.notationScale)+" H "+end; }
        if (direction.type === "text") text=direction.value;
        if (direction.type === "swing") text=workshopSwingLabel(direction.value,this.$t ? this.$t('WORKSHOP_SWING_STRAIGHT') : 'Straight');
        if (direction.type === "trillLine") {
          const wave=4*this.notationScale,cycles=Math.max(1,Math.ceil((end-x)/(wave*2))),step=(end-x)/cycles;
          path='M '+x+' '+y;
          for(let index=0;index<cycles;index++) {const at=x+index*step;path+=' Q '+(at+step/4)+' '+(y-wave)+' '+(at+step/2)+' '+y+' Q '+(at+step*3/4)+' '+(y+wave)+' '+(at+step)+' '+y;}
        }
        if (direction.type === "dynamic") text=direction.value;
        if (pedal) {
          text=direction.continuation ? null : workshopPedalText(direction);
          if (pedal.line && direction.endSlot !== undefined) {
            const lineY=y+7*this.notationScale,start=x+(text ? Math.min(36*this.notationScale,(end-x)/3) : 0);
            path=direction.changeStart ? 'M '+start+' '+(lineY-6*this.notationScale)+' L '+(start+4*this.notationScale)+' '+lineY
              : 'M '+start+' '+(direction.startsHere && pedal.action === 'start' ? y : lineY)+' V '+lineY;
            path+=' H '+end;
            if(direction.changeEnd) path+=' L '+(end+4*this.notationScale)+' '+(lineY-6*this.notationScale);
            else if(direction.endsHere && direction.endAction !== 'discontinue') path+=' V '+y;
          }
        }
        if (direction.type === "octaveShift") {
          text=direction.continuation ? null : (Math.abs(direction.value) === 2 ? "15" : "8")+(direction.value > 0 ? "va" : "vb");
          const endsHere=direction.endsHere === undefined ? !direction.endBarId || direction.endBarId === this.measure.id : direction.endsHere;
          path="M "+(x+(text ? 27*this.notationScale : 0))+" "+y+" H "+end+(endsHere ? " v "+((direction.value > 0 ? 8 : -8)*this.notationScale) : "");
        }
        if (direction.type === "wedge") {
          const spread=8*this.notationScale,growing=direction.value === "crescendo";
          const first=direction.spanStartProgress === undefined ? 0 : direction.spanStartProgress,last=direction.spanEndProgress === undefined ? 1 : direction.spanEndProgress;
          const left=spread*(growing ? first : 1-first),rightSpread=spread*(growing ? last : 1-last);
          path="M "+x+" "+(y-left)+" L "+end+" "+(y-rightSpread)+" M "+x+" "+(y+left)+" L "+end+" "+(y+rightSpread);
        }
        return { id:direction.id || "timed-"+index,type:direction.type,x,y,text,path,pedalKind:pedal && pedal.kind,minimumY:y-22*this.notationScale,maximumY:y+12*this.notationScale };
      });
    },
    navigationMarks() {
      const base=displayGeometry(this,this.meterUnits),labels={ fine:"Fine",dc:"D.C.",ds:"D.S.",toCoda:"al Coda" };
      let top=Math.min(this.notationTop,...this.directionMarks.filter(mark=>mark.minimumY < 76).map(mark=>mark.minimumY-12*this.notationScale));
      return measureNavigation(this.measure).map((entry,index) => {
        const mark=typeof entry === 'string' ? {kind:entry} : entry,kind=mark.kind,glyph=kind === "segno" ? "scripts.segno" : kind === "coda" ? "scripts.coda" : null;
        const text=(labels[kind] || '')+(mark.label ? ' '+mark.label : '')+(mark.target ? ' '+mark.target : '')+(mark.passes ? ' ('+mark.passes.join(',')+'.)' : '');
        const count=Math.max(6,Math.min(28,Math.floor((base.width-base.left-40*this.notationScale)/(10*this.notationScale)))),lines=[];
        for(let cursor=0;cursor<text.length;cursor+=count) lines.push(text.slice(cursor,cursor+count).trim());
        const x=glyph ? base.left : Math.max(base.left,base.width-24*this.notationScale-Math.max(0,...lines.map(line=>line.length))*10*this.notationScale),y=top-Math.max(0,lines.length-1)*18*this.notationScale;
        top=y-28*this.notationScale;
        return {id:index,kind,x,textX:x+(glyph ? 26*this.notationScale : 0),y,glyph,text,lines};
      });
    },
    endingMark() {
      if (!Array.isArray(this.measure.ending) || !this.measure.ending.length) return null;
      const base=displayGeometry(this,this.meterUnits),y=Math.min(this.notationTop-18*this.notationScale,...this.directionMarks.map(mark => mark.minimumY-8*this.notationScale),...this.navigationMarks.map(mark => mark.y-35*this.notationScale));
      return { x:base.left,y,text:this.measure.ending.map(number => number+".").join(" "),path:"M "+base.left+" "+(y+15*this.notationScale)+" V "+y+" H "+(base.width-12) };
    },
    unspacedNotation() { return createWorkshopStaffRawNotation(this); },
    notation() {
      const raw=this.unspacedNotation || WorkshopStaff.computed.unspacedNotation.call(this);
      const own=spaceWorkshopAccidentals(raw,{ gridStep:raw.gridStep,leadingContextRight:this.leadingContextRight });
      const spaced=this.horizontalColumns && this.horizontalColumns.size ? spaceWorkshopAccidentals(own,{ gridStep:raw.gridStep,columns:this.horizontalColumns,leadingContextRight:this.leadingContextRight }) : own;
      const beamed=Object.assign(layoutWorkshopBeams(spaced),{ width:spaced.width,contextChanges:spaced.contextChanges,headerOffset:raw.headerOffset });
      return shiftNotation(layoutExpression(layoutDots(beamed),raw.multipleVoices),raw.headerOffset);
    },
    horizontalMapping() {
      const anchors=(this.notation.contextChanges || []).filter(change => !this.notation.events.some(event => event.kind === "note" && event.startSlot === change.startSlot))
        .map(change => ({kind:"note",startSlot:change.startSlot,displaySlot:change.startSlot,x:change.x+change.width+12}));
      return createWorkshopHorizontalMapping(this.notation.events.concat(anchors),displayGeometry(this,this.meterUnits),this.gridStep,this.meterUnits);
    }
  },
  watch:{
    measure() { this.cancelGesture(); },
    multiSelect() { this.cancelGesture(); },
    selectionUnit() { this.cancelGesture(); },
    selectionOnly() { this.cancelGesture(); }, dots() { this.cancelGesture(); },
    voice() { this.cancelGesture(); }, tuplet() { this.cancelGesture(); }, readOnly() { this.cancelGesture(); },
    clef() { this.cancelGesture(); }, meter() { this.cancelGesture(); },
    keyId() { this.cancelGesture(); }, followKeySignature() { this.cancelGesture(); }
  },
  beforeDestroy() { this.cancelGesture(); },
  methods:{
    accidentalPath(event) { return workshopAccidentalPath(event,event.accidentalX,event.y,.85*this.notationScale); },
    accidentalEnclosurePath(event) { return workshopAccidentalEnclosurePath(event,event.accidentalX,event.y,.85*this.notationScale); },
    inkTransform(x,y,inverted=false) {
      const scale=this.notationScale;
      return (inverted ? 'rotate(180 '+x+' '+y+') ' : '')+(scale === 1 ? '' : 'translate('+x+' '+y+') scale('+scale+') translate('+(-x)+' '+(-y)+')') || null;
    },
    notationMarkTransform(event,mark) {
      const x=mark.x === undefined ? event.x : mark.x;
      return (mark.rotation ? 'rotate('+mark.rotation+' '+x+' '+mark.y+') ' : '')+(this.inkTransform(x,mark.y,mark.inverted) || '') || null;
    },
    expressionPath(event,mark) {
      if (mark.kind === "staccatissimo") {
        // A filled wedge points toward the note, above or below its voice.
        const baseY=mark.y+mark.direction*5,tipY=mark.y-mark.direction*5;
        return "M "+(event.x-3)+" "+baseY+" L "+(event.x+3)+" "+baseY+" L "+event.x+" "+tipY+" Z";
      }
      if (mark.kind === 'strong-accent') return this.glyph(mark.direction < 0 ? 'scripts.umarcato' : 'scripts.dmarcato',event.x,mark.y,1);
      if (mark.kind === 'detached-legato') return this.glyph('scripts.tenuto',event.x,mark.y,1)+this.glyph('scripts.staccato',event.x,mark.y-mark.direction*5,1);
      if (mark.kind === 'breath-mark') return 'M '+(event.x+9)+' '+(mark.y-5)+' c 7 -1 7 6 0 10 c 4 -5 2 -6 0 -6 z';
      if (mark.kind === 'caesura') return [0,6].map(offset => 'M '+(event.x-4+offset)+' '+(mark.y+5)+' l 5 -10 h 2 l -5 10 z').join(' ');
      return this.glyph(mark.kind === "accent" ? "scripts.sforzato" : "scripts."+mark.kind,event.x,mark.y,1,1);
    },
    staffPitchY:workshopStaffY,
    contextAtSlot(slot=0) { return workshopContextAtSlot({contextChanges:this.measure.contextChanges},slot,{clef:this.effectiveClef,keyId:contextKeyId(this)}); },
    editContextChange(event,id) {
      if (this.readOnly || event.isPrimary === false || event.button !== undefined && event.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      this.cancelGesture(); this.$emit("edit-context",id);
    },
    mappedSlotX(slot) { return workshopXAtMappedSlot(this.horizontalMapping,slot); },
    allSourceEvents() { return this.measure.events.concat(this.companionMeasure ? this.companionMeasure.events : []); },
    eventById(id) { return this.allSourceEvents().find(event => event.id === id); },
    sourceMeasure(id) { return this.measure.events.some(event => event.id === id) ? this.measure : this.companionMeasure || this.measure; },
    pitchY(pitch,slot=0) { return workshopStaffY(pitch,this.contextAtSlot(slot).clef); },
    dotY(y) { return (y-156)%20 === 0 ? y-10 : y; },
    placementPitch(y,slot=0) {
      const context=this.contextAtSlot(slot);
      if (!this.followKeySignature) return workshopPitchAtStaffY(y,this.alter,context.clef);
      const natural=workshopPitchAtStaffY(y,0,context.clef);
      if (!natural) return null;
      const minimum=9,maximum=96;
      let step=natural.octave*7+PITCH_STEPS.indexOf(natural.step);
      // A signature can turn the edge C into C-flat or B into B-sharp.
      // Choose the nearest usable staff position with its own key alteration.
      for (let attempt=0; attempt < 7; attempt++) {
        const name=PITCH_STEPS[step%7],pitch={ step:name,alter:workshopKeyAlter(context.keyId,name),octave:Math.floor(step/7) };
        const value=workshopPitchValue(pitch);
        if (value >= minimum && value <= maximum) return pitch;
        step+=value < minimum ? 1 : -1;
      }
      return null;
    },
    // The keyboard form delegates to the same context/alteration placement
    // path as pointer entry, but an explicit written pitch must never clamp.
    keyboardPlacement({slot,step,octave}={}) {
      if (this.readOnly || this.selectionOnly || this.multiSelect || !Number.isFinite(slot)) return null;
      const ticks=workshopTimeTicks(slot),grid=workshopTimeTicks(this.gridStep);
      const units=workshopEventUnits({noteValue:this.noteValue,dots:this.dots,tuplet:this.tuplet});
      if (ticks < 0 || !grid || ticks%grid || workshopTimeTicks(slot+units) > workshopTimeTicks(this.meterUnits)) return null;
      if (this.kind === 'rest') return {slot,pitch:null};
      if (!PITCH_STEPS.includes(step) || !Number.isInteger(octave)) return null;
      const y=workshopStaffY({step,octave,alter:0},this.contextAtSlot(slot).clef);
      if (!Number.isFinite(y)) return null;
      const pitch=this.placementPitch(y,slot);
      return pitch && pitch.step === step && pitch.octave === octave ? {slot,pitch} : null;
    },
    contextPointerDown(event,kind) {
      if (this.readOnly) return;
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      if (event.cancelable) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      this.cancelGesture(); this.contextClickKind=null;
      this.gesture={pointerId:event.pointerId,contextKind:kind,startClientX:event.clientX,startClientY:event.clientY,moved:false};
      this.$refs.sheet.setPointerCapture(event.pointerId);
    },
    contextClick(event) {
      const target=event.target && event.target.closest ? event.target.closest('[data-workshop-context]') : null;
      const kind=this.contextClickKind || (event.detail === 0 && !this.gesture && target && target.getAttribute('data-workshop-context'));
      this.contextClickKind=null;
      if (this.readOnly || this.gesture || !['clef','meter'].includes(kind) || (event.button !== undefined && event.button !== 0)) return;
      if (event.cancelable) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      // Opening only from the completed click keeps its release from selecting
      // a newly mounted dialog button beneath the same finger or mouse pointer.
      this.$emit("change-"+kind);
    },
    contextKeyDown(event,kind) {
      if (this.readOnly) return;
      if (!["Enter"," "].includes(event.key)) return;
      event.preventDefault(); this.cancelGesture(); this.contextClickKind=null; this.$emit("change-"+kind);
    },
    restGlyph: workshopRestGlyph,
    restPath(event) { return workshopRestPath(event.restDisplayValue || event.noteValue,event.x,event.y,this.notationScale); },
    restDotAnchor(event) { return workshopRestDotAnchor(event,this.notationScale); },
    flagCount,
    extraRestFlags(event) { return workshopRestExtraFlags(event.noteValue,event.x,event.y); },
    hasStem(value) { return !["whole","breve"].includes(value); },
    hollow(value) { return ["whole","half","breve"].includes(value); },
    flagPath(stem,offset) { return 'M '+stem.x+' '+(stem.y2+offset*stem.direction)+' q '+(14*stem.direction*this.notationScale)+' '+(8*stem.direction*this.notationScale)+' '+(5*stem.direction*this.notationScale)+' '+(20*stem.direction*this.notationScale); },
    isSelected(id) { return id === this.selectedEventId || (this.selectedEventIds || []).includes(id); },
    isDragging(id) { return !!(this.gesture && (this.gesture.eventIds || [this.gesture.eventId]).includes(id)); },
    groupSelected(events) {
      const ids=this.selectedEventIds || [];
      return events.length > 1 && ids.length === events.length && events.every(item => ids.includes(item.id));
    },
    selectedNoteIds() {
      const ids=new Set((this.selectedEventIds || []).concat(this.selectedEventId ? [this.selectedEventId] : []));
      const notes=new Set(this.allSourceEvents().filter(event => event.kind === "note").map(event => event.id));
      return Array.from(ids).filter(id => notes.has(id));
    },
    selectedEditableIds() {
      const ids=new Set((this.selectedEventIds || []).concat(this.selectedEventId ? [this.selectedEventId] : []));
      return this.allSourceEvents().filter(event => ids.has(event.id)).map(event => event.id);
    },
    selectionUnitIds(item) {
      return item.kind === 'rest' ? [item.id] : this.selectionUnit === "chord"
        ? workshopChordEvents(this.sourceMeasure(item.id),item.id).map(event => event.id) : [item.id];
    },
    movementBounds(ids,anchorId) {
      const notes=workshopMeasureEvents(this.sourceMeasure(anchorId)).filter(event => ids.includes(event.id));
      const anchor=notes.find(event => event.id === anchorId);
      if (!anchor || !notes.length) return null;
      const start=Math.min(...notes.map(event => event.startSlot));
      const end=Math.max(...notes.map(event => event.startSlot+workshopEventUnits(event)));
      return { minimum:anchor.startSlot-start,maximum:anchor.startSlot+this.meterUnits-end,
        span:end-start,startOffset:start-anchor.startSlot };
    },
    selectionFor(item) {
      if (this.multiSelect) {
        const selected=this.selectedEditableIds();
        const unitIds=this.selectionUnitIds(item);
        const selectedHit=selected.includes(item.id);
        const ids=selectedHit ? selected : Array.from(new Set(selected.concat(unitIds)));
        const notes=new Set(this.allSourceEvents().filter(event => event.kind === 'note').map(event => event.id));
        return { ids,unitIds,multi:true,extendSelection:!selectedHit,
          group:ids.length > 1 && ids.every(id => notes.has(id)),groupWasSelected:selectedHit,tapGroup:false };
      }
      const events=workshopChordEvents(this.sourceMeasure(item.id),item.id);
      const selectedGroup=this.groupSelected(events);
      const sameSingle=events.some(event => event.id === this.selectedEventId);
      return { ids:events.length ? events.map(event => event.id) : [item.id],
        group:events.length > 1 && (selectedGroup || !sameSingle),
        groupWasSelected:selectedGroup, tapGroup:events.length > 1 && !selectedGroup && !sameSingle,
        units:events.length ? Math.max(...events.map(workshopEventUnits)) : workshopEventUnits(item) };
    },
    selectGesture(gesture,dragging) {
      if (gesture.multi) {
        if (!dragging) this.$emit("toggle-selection",{ ids:gesture.unitIds.slice(),anchorId:gesture.eventId });
        else if (gesture.extendSelection) this.$emit("extend-selection",{ ids:gesture.unitIds.slice(),anchorId:gesture.eventId });
        return;
      }
      if ((dragging && gesture.group && !gesture.groupWasSelected) || (!dragging && gesture.tapGroup)) {
        this.$emit("select-group",{ ids:gesture.eventIds.slice(),anchorId:gesture.eventId });
      } else if ((!dragging || !gesture.group) && gesture.eventId) {
        this.$emit("select",this.eventById(gesture.eventId));
      }
    },
    glyph(name,x,y,scale) { const path=Glyphs.getPathForSymbol(x,y,name,scale,scale); return path ? path.map(part => part.join(" ")).join("") : ""; },
    clefPath(clef,x,scale) { const name=clef === 'bass' ? 'clefs.F' : ['alto','tenor'].includes(clef) ? 'clefs.C' : 'clefs.G',y=clef === 'bass' || clef === 'tenor' ? 96 : clef === 'alto' ? 116 : 136;return this.glyph(name,x,y,scale); },
    clefOctaveY,
    notationMarkPath(event,mark) {
      const markX=mark.x === undefined ? event.x : mark.x;
      if (mark.accidental) return workshopAccidentalPath(mark,markX-3,mark.y,.65);
      if (mark.long) return this.glyph('scripts.prall',markX-18,mark.y,.9)+this.glyph('scripts.prall',markX-4,mark.y,.9)+(mark.kind === 'mordent' ? ' M '+(markX-3)+' '+(mark.y-7)+' h 1.8 v 14 h -1.8 z' : '');
      if (mark.kind !== 'fermata' || !['angled','square'].includes(event.fermataShape)) return this.glyph(mark.glyph,markX-8,mark.y,mark.kind === 'fermata' ? 1 : .9);
      const x=event.x,y=mark.y,d=mark.direction < 0 ? 1 : -1;
      const cap=event.fermataShape === 'angled'
        ? 'M '+(x-10)+' '+(y-2*d)+' L '+x+' '+(y-16*d)+' L '+(x+10)+' '+(y-2*d)+' L '+(x+8)+' '+(y-2*d)+' L '+x+' '+(y-13*d)+' L '+(x-8)+' '+(y-2*d)+' Z'
        : 'M '+(x-10)+' '+(y-2*d)+' V '+(y-14*d)+' H '+(x+10)+' V '+(y-2*d)+' H '+(x+8)+' V '+(y-12*d)+' H '+(x-8)+' V '+(y-2*d)+' Z';
      return cap+' M '+(x-2)+' '+(y-3*d)+' a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0';
    },
    tremoloPath(event) {
      const scale=this.notationScale,x=event.stemX,y=(event.y+event.stemEndY)/2;
      return Array.from({length:event.tremoloMarks || 3},(_,index) => "M "+(x-6*scale)+" "+(y+index*6*scale)+" l "+12*scale+" "+(-5*scale)+" l 0 "+3*scale+" l "+(-12*scale)+" "+5*scale+" z").join(" ");
    },
    point(event) {
      const svg=this.$refs.sheet;
      const matrix=svg && svg.getScreenCTM();
      if (!matrix) return null;
      const point=svg.createSVGPoint(); point.x=event.clientX; point.y=event.clientY;
      return point.matrixTransform(matrix.inverse());
    },
    movementPitch(original,y,clef=this.effectiveClef) {
      // Existing notes use the whole score range. Clef-specific placement
      // windows must not transpose them while they are moved or edited.
      const reference=workshopClefReference(clef);
      let minimum=5,maximum=56;
      const pitch=step => ({ step:PITCH_STEPS[((step%7)+7)%7],alter:original.alter,octave:Math.floor(step/7) });
      while (workshopStaffY(pitch(minimum),clef) === null) minimum++;
      while (workshopStaffY(pitch(maximum),clef) === null) maximum--;
      const step=reference+Math.round((this.geometry.bottomLine-y)/this.geometry.pitchStep);
      return pitch(Math.max(minimum,Math.min(maximum,step)));
    },
    pointerDown(event) {
      if (this.readOnly || this.gesture || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      this.contextClickKind=null;
      const point=this.point(event);
      if (!point) return;
      const contextTarget=event.target && event.target.closest ? event.target.closest('[data-workshop-context]') : null;
      const context=contextTarget && contextTarget.getAttribute('data-workshop-context')
        || (this.showClef && point.y >= 48 && point.y <= 176 && point.x >= 8 && point.x < 46 ? 'clef'
          : this.showMeter && point.y >= 68 && point.y <= 162 && point.x >= this.headerKeyStart+this.signatureWidth && point.x < this.geometry.left ? 'meter' : null);
      if (context) { this.contextPointerDown(event,context); return; }
      if (point.x < this.geometry.left-.001 || point.x > this.geometry.width-22+.001 || point.y < this.geometry.top+25 || point.y > this.geometry.top+this.geometry.height-10) return;
      if (event.cancelable) event.preventDefault();
      const horizontalMapping=this.horizontalMapping;
      const slot=workshopSlotAtMappedX(horizontalMapping,point.x);
      const scale=this.$refs.sheet.getScreenCTM();
      const radiusX=22/Math.hypot(scale.a,scale.b);
      const radiusY=22/Math.hypot(scale.c,scale.d);
      const matchesPitch=item => item.pitch && Math.abs(item.y-point.y) <= this.geometry.pitchStep/2;
      const restHit=item => (this.multiSelect || this.kind === 'rest') && workshopEventVoice(item) === this.voice;
      const direct=this.events.filter(item => !item.implicit && (item.kind === 'note' ? matchesPitch(item) : restHit(item))
        && Math.abs(item.x-point.x) <= Math.min(radiusX,9) && Math.abs(item.y-point.y) <= Math.min(radiusY,6))
        .sort((a,b) => Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
      const hit=direct || this.events.filter(item => !item.implicit && slot >= item.startSlot && slot < item.endSlot
        && (item.kind === 'note' ? matchesPitch(item) : restHit(item))
        && Math.abs(item.x-point.x) <= radiusX && Math.abs(item.y-point.y) <= radiusY)
        .sort((a,b) => Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]
        || (!this.selectionOnly && this.events.find(item => !item.implicit && item.kind === "note" && workshopEventVoice(item) === this.voice
          && matchesPitch(item) && slot >= item.startSlot && slot < item.endSlot));
      if (this.selectionOnly) {
        if (!hit || hit.kind !== "note") return;
        this.gesture={ pointerId:event.pointerId,eventId:hit.id,selectionOnly:true,pitch:null };
        this.$refs.sheet.setPointerCapture(event.pointerId); return;
      }
      if (this.multiSelect && !hit) return;
      const selection=hit ? this.selectionFor(hit) : null;
      const eventIds=selection ? (selection.group ? selection.ids : [hit.id]) : [];
      const bounds=hit ? this.movementBounds(eventIds,hit.id) : null;
      this.gesture={ pointerId:event.pointerId, eventId:hit ? hit.id : null, startX:point.x, startY:point.y,
        horizontalMapping,startTime:workshopSlotAtMappedX(horizontalMapping,point.x,{snap:false,clamp:false}),
        sourcePartIndex:hit ? hit.sourcePartIndex : this.staffIndex,
        originalTop:this.geometry.top,originalBottom:this.geometry.top+this.geometry.height,originalWidth:this.geometry.width,
        startClientX:event.clientX, startClientY:event.clientY, originalClef:hit ? hit.displayClef || this.effectiveClef : this.contextAtSlot(slot).clef, originalY:hit && hit.pitch ? hit.y : point.y,
        pitch:hit ? hit.pitch : this.placementPitch(point.y,slot), moved:false, slot:hit ? hit.startSlot : slot,
        originalPitch:hit ? hit.pitch : null, requestedPitch:null, pitchOverflow:false,
        eventIds,multi:!!(selection && selection.multi),unitIds:selection && selection.unitIds,
        extendSelection:!!(selection && selection.extendSelection),
        group:!!(selection && selection.group), groupWasSelected:!!(selection && selection.groupWasSelected),
        tapGroup:!!(selection && selection.tapGroup),
        originalSlot:hit ? hit.startSlot : slot, units:bounds ? bounds.span : workshopEventUnits({ noteValue:this.noteValue,dots:this.dots,tuplet:this.tuplet }),
        minimumSlot:bounds ? bounds.minimum : 0,maximumSlot:bounds ? bounds.maximum : this.meterUnits-workshopEventUnits({ noteValue:this.noteValue,dots:this.dots,tuplet:this.tuplet }),
        gridStep:this.gridStep,
        startOffset:bounds ? bounds.startOffset : 0,
        x:this.mappedSlotX(slot) };
      this.$refs.sheet.setPointerCapture(event.pointerId);
    },
    pointerMove(event) {
      if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
      if (this.gesture.contextKind) {
        if (event.cancelable) event.preventDefault();
        if (Math.hypot(event.clientX-this.gesture.startClientX,event.clientY-this.gesture.startClientY) >= 8) this.gesture.moved=true;
        return;
      }
      if (this.gesture.selectionOnly) return;
      const point=this.point(event); if (!point) return;
      if (event.cancelable) event.preventDefault();
      const previouslyMoved=this.gesture.moved;
      if (Math.hypot(event.clientX-this.gesture.startClientX,event.clientY-this.gesture.startClientY) >= 3) this.gesture.moved=true;
      if (!this.gesture.moved) return;
      if (!previouslyMoved && this.gesture.eventId) this.selectGesture(this.gesture,true);
      if (!this.gesture) return;
      if (this.gesture.eventId) {
        if (this.gesture.pitch) {
          const alter=this.gesture.originalPitch.alter;
          const wantedY=this.gesture.originalY+point.y-this.gesture.startY;
          this.gesture.pitch=this.movementPitch(this.gesture.originalPitch,wantedY,this.gesture.originalClef);
          if (this.gesture.group) {
            const step=this.gesture.originalPitch.octave*7+PITCH_STEPS.indexOf(this.gesture.originalPitch.step)
              +Math.round((this.gesture.startY-point.y)/this.geometry.pitchStep);
            this.gesture.requestedPitch={ step:PITCH_STEPS[((step%7)+7)%7],alter,octave:Math.floor(step/7) };
            this.gesture.pitchOverflow=workshopStaffY(this.gesture.requestedPitch,this.effectiveClef) === null;
          }
          this.gesture.slot=Math.max(this.gesture.minimumSlot,Math.min(this.gesture.maximumSlot,
            this.gesture.originalSlot+Math.round((workshopSlotAtMappedX(this.gesture.horizontalMapping,point.x,{snap:false,clamp:false})-this.gesture.startTime)/this.gesture.gridStep)*this.gesture.gridStep));
        }
      } else this.gesture.pitch=this.placementPitch(point.y,this.gesture.slot);
    },
    pointerUp(event) {
      if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
      if (this.gesture.contextKind) {
        this.pointerMove(event);
        const kind=!this.gesture.moved ? this.gesture.contextKind : null;
        this.cancelGesture(); this.contextClickKind=kind;
        return;
      }
      const point=this.point(event);
      if (this.gesture.eventId === null && (!point || point.x < this.geometry.left-.001 || point.x > this.geometry.width-22+.001
        || point.y < this.geometry.top+25 || point.y > this.geometry.top+this.geometry.height-10)) { this.cancelGesture(); return; }
      this.pointerMove(event);
      if (!this.gesture) return;
      const gesture=this.gesture; this.cancelGesture();
      if (gesture.selectionOnly) this.$emit("select",this.eventById(gesture.eventId));
      else if (gesture.eventId === null) this.$emit("place",{ slot:gesture.slot,pitch:gesture.pitch });
      else if (!gesture.moved) this.selectGesture(gesture,false);
      else if (gesture.pitch && gesture.group) this.$emit("move-notes",{
        ids:gesture.eventIds.slice(),anchorId:gesture.eventId,pitch:gesture.requestedPitch || gesture.pitch,slot:gesture.slot
      });
      else if (gesture.pitch) this.$emit("move-note",{ id:gesture.eventId,pitch:gesture.pitch,slot:gesture.slot });
    },
    cancelGesture(event) {
      if (!this.gesture) { if (!event || event.type === 'pointercancel') this.contextClickKind=null; return; }
      if (event && event.pointerId !== this.gesture.pointerId) return;
      this.contextClickKind=null;
      const pointerId=this.gesture.pointerId; this.gesture=null;
      const svg=this.$refs.sheet;
      if (svg && svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    },
    keyDown(event,item) {
      if (this.readOnly || item.implicit) return;
      if (this.selectionOnly) {
        if (["Enter"," ","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) event.preventDefault();
        if (["Enter"," "].includes(event.key) && item.pitch) this.$emit("select",this.eventById(item.id));
        return;
      }
      if (["Enter"," ","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const selection=this.selectionFor(item);
        if (["Enter"," "].includes(event.key)) {
          if (this.multiSelect) {
            const ids=this.selectionUnitIds(item);
            if (ids.length) this.$emit("toggle-selection",{ ids,anchorId:item.id });
            return;
          }
          this.selectGesture({ eventId:item.id,eventIds:selection.ids,tapGroup:selection.tapGroup },false); return;
        }
        if (this.multiSelect && !item.pitch) return;
        if (!item.pitch) { this.$emit("select",this.eventById(item.id)); return; }
        const group=this.multiSelect ? selection.group : selection.groupWasSelected;
        const ids=group ? selection.ids : [item.id];
        if (this.multiSelect) {
          if (selection.extendSelection) this.$emit("extend-selection",{ ids:selection.unitIds,anchorId:item.id });
        } else if (!group) this.$emit("select",this.eventById(item.id));
        const pitch=["ArrowUp","ArrowDown"].includes(event.key)
          ? this.movementPitch(item.pitch,item.y+(event.key === "ArrowUp" ? -10 : 10),item.displayClef || this.effectiveClef) : item.pitch;
        const bounds=this.movementBounds(ids,item.id);
        const slot=["ArrowLeft","ArrowRight"].includes(event.key)
          ? Math.max(bounds.minimum,Math.min(bounds.maximum,item.startSlot+(event.key === "ArrowLeft" ? -this.gridStep : this.gridStep))) : item.startSlot;
        if (group) this.$emit("move-notes",{ ids,anchorId:item.id,pitch,slot });
        else this.$emit("move-note",{ id:item.id,pitch,slot });
      }
    }
  }
};
export default WorkshopStaff;
/** Derive the same bounds as the renderer, without creating reactive instances. */
export function workshopStaffContentGeometry(props) {
  const view=Object.assign({ notationScale:1,practiceLayout:false,gesture:null,voice:1,noteValue:"quarter",dots:0,tuplet:0,readOnly:true,compact:true,
    showClef:true,showKey:true,showMeter:true,showDynamic:true,keyId:"C-major",dynamic:"mf",ties:[],slurs:[],glissandos:[],tremolos:[],barIndex:0,
    selectedEventId:null,staffIndex:0,companionMeasure:null,crossStaffBeamIds:[],crossStaffRelationIds:[],directionSpans:[],lyricVerseNumbers:[],sourceLyricVerseNumbers:null },props),cache=Object.create(null);
  if (props.cachedNotation) cache.notation=props.cachedNotation;
  Object.keys(WorkshopStaff.computed).forEach(key => Object.defineProperty(view,key,{ get() {
    if (!Object.prototype.hasOwnProperty.call(cache,key)) cache[key]=WorkshopStaff.computed[key].call(view);
    return cache[key];
  } }));
  return view.geometry;
}
export function workshopStaffNotation(props,raw=false) {
  const view=Object.assign({ notationScale:1,practiceLayout:false,gesture:null,previewEvents:null,voice:1,noteValue:"quarter",dots:0,tuplet:0,readOnly:true,compact:true,
    showClef:true,showKey:true,showMeter:true,showDynamic:true,keyId:"C-major",dynamic:"mf",ties:[],slurs:[],glissandos:[],tremolos:[],barIndex:0,
    selectedEventId:null,staffIndex:0,companionMeasure:null,crossStaffBeamIds:[],crossStaffRelationIds:[],directionSpans:[],lyricVerseNumbers:[],sourceLyricVerseNumbers:null },props),cache=Object.create(null);
  if (props.cachedRawNotation) cache.unspacedNotation=props.cachedRawNotation;
  Object.keys(WorkshopStaff.computed).forEach(key => Object.defineProperty(view,key,{ get() {
    if (!Object.prototype.hasOwnProperty.call(cache,key)) cache[key]=WorkshopStaff.computed[key].call(view);
    return cache[key];
  } }));
  return raw ? view.unspacedNotation : view.notation;
}
export function workshopStaffRawNotation(props) { return workshopStaffNotation(props,true); }
export { workshopMeasureDirectionSpans } from "../model/WorkshopNotationDirections";

</script>

<style scoped>
.accidental-enclosure { fill:none; stroke:currentColor; stroke-width:calc(1px * var(--workshop-notation-scale,1)); }
.workshop-staff { display:block; width:100%; max-width:570px; margin:8px auto; color:#29464d; touch-action:none; user-select:none; cursor:crosshair; }
.workshop-staff.compact { margin:0; max-width:none; }.workshop-staff.read-only { cursor:pointer; touch-action:auto; }
.paper { fill:#fffdf7; }
.compact .paper { fill:transparent; }
.time-grid { stroke:#eee9dd; stroke-width:.7; stroke-dasharray:2 5; }.time-grid.beat { stroke:#dbe6e3; }
.staff-line { stroke:#9baeb0; stroke-width:1; }
.ledger,.stem { stroke:currentColor; stroke-width:calc(1.7px * var(--workshop-notation-scale,1)); }
.notation-stem { pointer-events:none; }
.beam { fill:currentColor; pointer-events:none; }
.tie { fill:none; stroke:currentColor; stroke-width:calc(1.8px * var(--workshop-notation-scale,1)); pointer-events:none; }
.slur { fill:none; stroke:currentColor; stroke-width:calc(1.8px * var(--workshop-notation-scale,1)); pointer-events:none; }
.tuplet-bracket { fill:none; stroke:currentColor; stroke-width:calc(1.2px * var(--workshop-notation-scale,1)); }.tuplet-number { fill:currentColor; font-size:calc(16px * var(--workshop-notation-scale,1)); font-family:var(--workshop-score-font,Georgia),serif; font-style:italic; font-weight:bold; text-anchor:middle; }
.tuplet,.expression-mark,.notation-mark,.fingering,.pedal,.dynamic-mark,.score-direction,.volta-ending,.navigation-mark { pointer-events:none; }
.direction-line { fill:none;stroke:currentColor;stroke-width:calc(1.5px * var(--workshop-notation-scale,1)); }.direction-line.dashed { stroke-dasharray:calc(5px * var(--workshop-notation-scale,1)) calc(4px * var(--workshop-notation-scale,1)); }
.direction-text { fill:currentColor;font-size:calc(16px * var(--workshop-notation-scale,1));font-family:var(--workshop-score-font,Georgia),serif;font-style:italic;font-weight:normal; }.tempo-mark { font-style:normal; }
.ending-number { fill:currentColor;font-size:calc(15px * var(--workshop-notation-scale,1));font-family:var(--workshop-score-font,Georgia),serif;font-style:normal;font-weight:bold; }.lyric { fill:currentColor;font-size:calc(14px * var(--workshop-notation-scale,1));font-family:var(--workshop-score-font,Georgia),serif;font-style:normal;font-weight:normal;text-anchor:middle; }
.grace-slash,.arpeggio { fill:none;stroke:currentColor;stroke-width:calc(1.3px * var(--workshop-notation-scale,1));pointer-events:none; }.tremolo { fill:currentColor;pointer-events:none; }
.glissando,.lyric-extension { fill:none;stroke:currentColor;stroke-width:calc(1.2px * var(--workshop-notation-scale,1));pointer-events:none; }
.fingering { fill:currentColor; font-size:calc(14px * var(--workshop-notation-scale,1)); font-family:var(--workshop-score-font,Georgia),serif; font-style:normal; font-weight:normal; text-anchor:middle; }
.pedal { fill:currentColor; font-size:calc(17px * var(--workshop-notation-scale,1)); font-family:var(--workshop-score-font,Georgia),serif; font-style:italic; font-weight:normal; text-anchor:middle; }
.clef-octave { fill:currentColor; font-size:14px; font-family:Georgia,serif; font-weight:700; text-anchor:middle; pointer-events:none; }
.dynamic-mark { fill:currentColor; font-size:calc(22px * var(--workshop-notation-scale,1)); font-family:var(--workshop-score-font,Georgia),serif; font-style:italic; font-weight:bold; }
.repeat-heavy { stroke:currentColor; stroke-width:3; }.repeat-start,.repeat-end { fill:currentColor; }
.repeat-count { fill:currentColor; font:12px sans-serif; text-anchor:middle; }
.augmentation-dot { fill:currentColor; pointer-events:none; }
.symbol { fill:currentColor; }
.note-head { fill:#263238; }
.note-head.hollow { fill:#fffaf2; stroke:#263238; stroke-width:calc(1.7px * var(--workshop-notation-scale,1)); }
.flag { fill:none; stroke:currentColor; stroke-width:calc(2px * var(--workshop-notation-scale,1)); }
.meter { fill:currentColor; font:bold 28px var(--workshop-score-font,Georgia),serif; }
.implicit { opacity:.3; pointer-events:none; }
.selected { color:#ce5d29; }
.playing .note-head { stroke:#d75625; stroke-width:calc(1.7px * var(--workshop-notation-scale,1)); }
.grip-unseen .note-head { stroke:#263238; }
.grip-held .note-head { fill:#25864b; stroke:#25864b; stroke-width:calc(2px * var(--workshop-notation-scale,1)); }
.grip-found .note-head { fill:#929b9e; stroke:#929b9e; stroke-width:calc(2px * var(--workshop-notation-scale,1)); }
.grip-held .note-head.hollow,.grip-found .note-head.hollow { fill:#fffaf2; }
.selected .note-head { stroke:#ce5d29; stroke-width:calc(1.7px * var(--workshop-notation-scale,1)); }
.blocked .note-head { stroke:#b73c35; stroke-width:calc(1.7px * var(--workshop-notation-scale,1)); }
.time-target { fill:#4e9c8620; stroke:#64a591; stroke-width:1; pointer-events:none; }.time-target.blocked { fill:#d4484120; stroke:#bd4540; }
.blocked { color:#b73c35; }.blocked-label { fill:#b73c35; font:bold 11px sans-serif; text-anchor:middle; pointer-events:none; }
.note-target { fill:transparent; stroke:transparent; }.selected .note-target,g:focus .note-target { fill:#ee8b3020; stroke:#d97939; stroke-width:1; }
g[role=button] { cursor:grab; outline:none; }
.context-symbol { cursor:pointer; }.context-target { fill:transparent; stroke:transparent; }
.context-symbol:focus .context-target { fill:#ee8b3020; stroke:#d97939; stroke-width:1; }
.pitch-guide { stroke:#d97939; stroke-width:1; stroke-dasharray:4 4; pointer-events:none; }
.pitch-label { fill:currentColor; font:bold 12px sans-serif; text-anchor:middle; pointer-events:none; }
.placement-preview { fill:#dc7639; opacity:.65; pointer-events:none; }
</style>
