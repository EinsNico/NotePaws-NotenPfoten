const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const STEPS=['C','D','E','F','G','A','B'],SEMITONES=[0,2,4,5,7,9,11];
export function isValidWorkshopTranspose(value) {
  return !!value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).every(key=>['chromatic','diatonic','octaveChange'].includes(key))
    && Number.isInteger(value.chromatic) && Math.abs(value.chromatic)<=24
    && (!own(value,'diatonic') || Number.isInteger(value.diatonic) && Math.abs(value.diatonic)<=14)
    && (!own(value,'octaveChange') || Number.isInteger(value.octaveChange) && Math.abs(value.octaveChange)<=2);
}
export function isValidWorkshopPitchContext(value) {
  return (!own(value,'clefOctave') || Number.isInteger(value.clefOctave) && Math.abs(value.clefOctave)<=2)
    && (!own(value,'transpose') || isValidWorkshopTranspose(value.transpose));
}
export function workshopPitchContextOffset(context={}) {
  const transpose=context.transpose || {};
  return 12*(context.clefOctave || 0)+ (transpose.chromatic || 0)+12*(transpose.octaveChange || 0);
}
export function workshopSoundingPitch(pitch,context={},octaveShift=0) {
  const transpose=context.transpose || {},offset=workshopPitchContextOffset(context)+12*octaveShift;
  const absolute=pitch.octave*7+STEPS.indexOf(pitch.step)+(transpose.diatonic || 0)+7*((context.clefOctave || 0)+(transpose.octaveChange || 0)+octaveShift);
  const index=((absolute%7)+7)%7,octave=Math.floor(absolute/7);
  const value=pitch.octave*12+SEMITONES[STEPS.indexOf(pitch.step)]+pitch.alter+offset;
  return {step:STEPS[index],octave,alter:value-octave*12-SEMITONES[index]};
}
