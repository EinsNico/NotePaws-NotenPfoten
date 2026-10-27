import { workshopPitchFromValue, workshopPitchValue } from './Workshop';
import { workshopClefReference, WORKSHOP_STAFF_GEOMETRY } from './WorkshopScoreEditor';
import { workshopContextAtSlot } from './WorkshopContextChanges';
import { workshopKeySignature } from './WorkshopTonality';

const STEPS = ['C','D','E','F','G','A','B'];

function writtenPitch(value, context) {
  const pitch = workshopPitchFromValue(value);
  if (!pitch) return null;
  // MIDI has no enharmonic spelling. Use the visible key's flat/sharp family,
  // and always draw an explicit accidental, including naturals.
  if (pitch.alter === 1 && workshopKeySignature(context.keyId, context.clef).some(note => note.alter < 0)) {
    const index = STEPS.indexOf(pitch.step) + 1;
    return {step:STEPS[index % 7], octave:pitch.octave + Math.floor(index / 7), alter:-1};
  }
  return pitch;
}

/** Display-only inverse of the performed sounding pitch and real staff layout. */
export function mapWorkshopWrongPitches({values, target, timeline, system, displayContexts=[]}) {
  if (!target || !system || !Array.isArray(values) || !values.length) return [];
  const references = [];
  // Grace notes can borrow time from the previous bar: one attack target can
  // therefore contain events from different written/performed measures.
  timeline.events.filter(event => target.eventIds.includes(event.id) && target.expectedValues.includes(event.value)
    && Math.abs(event.startMs-target.startMs)<.0001).forEach(event => {
    const bar = system.bars.find(entry => entry.index === event.barIndex);
    if (!bar) return;
    bar.parts.forEach((part, frameIndex) => {
      const note = part.notation.events.find(entry => entry.id === event.id && entry.pitch);
      if (!note) return;
      const context = workshopContextAtSlot(part.measure, note.startSlot, part.context);
      references.push({value:event.value, note, partIndex:part.partIndex, frameIndex,
        context:Object.assign({},context,{clef:note.displayClef || context.clef}),
        offset:event.value - workshopPitchValue(note.pitch)});
    });
  });
  return Array.from(new Set(values)).filter(value => Number.isInteger(value) && !target.expectedValues.includes(value)).map(value => {
    const reference = references.slice().sort((a,b) => Math.abs(a.value-value)-Math.abs(b.value-value)
      || a.partIndex-b.partIndex || a.note.id.localeCompare(b.note.id))[0];
    if (!reference) return null;
    const pitch = writtenPitch(value-reference.offset,reference.context), frame = system.frames[reference.frameIndex];
    const clefReference = workshopClefReference(reference.context.clef);
    if (!pitch || !frame || !Number.isFinite(clefReference)) return null;
    const localY = WORKSHOP_STAFF_GEOMETRY.bottomLine
      - (pitch.octave*7 + STEPS.indexOf(pitch.step)-clefReference)*WORKSHOP_STAFF_GEOMETRY.pitchStep;
    const y = frame.y + localY-frame.top;
    const above = y < frame.y+8, offscreen = above || y > frame.y+frame.height-8;
    const visibleContext = displayContexts.find(entry => entry.partIndex === reference.partIndex);
    const contextPending = !!visibleContext && (visibleContext.context.clef !== reference.context.clef
      || (visibleContext.context.clefOctave || 0) !== (reference.context.clefOctave || 0));
    const ledgers = [];
    if (!offscreen) {
      for (let line=176;line<=localY;line+=20) ledgers.push(frame.y+line-frame.top);
      for (let line=56;line>=localY;line-=20) ledgers.push(frame.y+line-frame.top);
    }
    return {value,partIndex:reference.partIndex,referenceValue:reference.value,offset:reference.offset,
      pitch,localY,y,ledgers,offscreen,contextPending,direction:contextPending ? '↔' : above ? '↑' : '↓',
      accidental:pitch.alter>0 ? 'sharp' : pitch.alter<0 ? 'flat' : 'nat'};
  }).filter(Boolean);
}
