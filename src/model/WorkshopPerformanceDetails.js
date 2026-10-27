export const WORKSHOP_EXPRESSION_ORNAMENTS = Object.freeze(['trill','mordent','inverted-mordent','turn','inverted-turn','delayed-turn','delayed-inverted-turn','vertical-turn','inverted-vertical-turn','tremolo']);
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const fields=(value,allowed)=>!!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>allowed.includes(key));
const alterations=[-2,-1.5,-1,-.5,0,.5,1,1.5,2];
export function isValidWorkshopOrnamentAccidentals(value) {
  return fields(value,['upper','lower']) && Object.keys(value).length>0 && Object.keys(value).every(key=>alterations.includes(value[key]));
}
export function isValidWorkshopOrnamentWavy(value) {
  return fields(value,['type','number']) && ['start','continue','stop'].includes(value.type)
    && Number.isInteger(value.number) && value.number>=1 && value.number<=16;
}
export function isValidWorkshopGraceTiming(value) {
  return fields(value,['stealPrevious','stealFollowing','makeTime']) && Object.keys(value).length>0
    && ['stealPrevious','stealFollowing'].every(key=>!has(value,key) || Number.isFinite(value[key]) && value[key]>=0 && value[key]<=100)
    && (!has(value,'makeTime') || Number.isFinite(value.makeTime) && value.makeTime>0 && value.makeTime<=128);
}
export function isValidWorkshopSwing(value) {
  return value==='straight' || fields(value,['first','second','unit','style'])
    && ['first','second'].every(key=>Number.isInteger(value[key]) && value[key]>=1 && value[key]<=99)
    && ['eighth','sixteenth'].includes(value.unit)
    && (!has(value,'style') || typeof value.style==='string' && value.style.length<=128);
}
export function workshopSwingLabel(value,straight='Straight') {
  if (value==='straight') return straight;
  if (!isValidWorkshopSwing(value)) return '';
  return 'Swing '+value.first+':'+value.second+' ('+(value.unit==='sixteenth'?'¹⁄₁₆':'⅛')+')'+(value.style?' · '+value.style:'');
}
