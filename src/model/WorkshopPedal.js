import { workshopTimeOnGrid } from "./WorkshopRhythm";
import { musicXmlChildren as children, musicXmlChild as child, musicXmlNumber as number, musicXmlEscape as esc } from "./WorkshopMusicXmlParser";

export const WORKSHOP_PEDAL_KINDS = Object.freeze(["damper", "sostenuto", "soft"]);
export const WORKSHOP_PEDAL_ACTIONS = Object.freeze(["start", "stop", "change", "continue", "resume", "discontinue"]);
const FIELDS = ["kind", "action", "line", "sign", "number", "strength", "abbreviated", "placement"];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export function isValidWorkshopPedal(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => FIELDS.includes(key))
    && WORKSHOP_PEDAL_KINDS.includes(value.kind) && WORKSHOP_PEDAL_ACTIONS.includes(value.action)
    && ["line", "sign", "abbreviated"].every(key => !has(value, key) || typeof value[key] === "boolean")
    && (!has(value, "number") || Number.isInteger(value.number) && value.number >= 1 && value.number <= 16)
    && (!has(value, "strength") || Number.isFinite(value.strength) && value.strength >= 0 && value.strength <= 100)
    && (!has(value, "placement") || ["above", "below"].includes(value.placement))
    && (!["stop", "discontinue"].includes(value.action) || value.strength === undefined || value.strength === 0)
    && (value.kind !== "soft" || ["start", "stop"].includes(value.action) && value.line !== true && value.sign !== false);
}
export function workshopPedal(direction) {
  const raw = direction && isValidWorkshopPedal(direction.pedal) ? direction.pedal : null;
  const legacy = direction && ["down", "half", "up"].includes(direction.value) ? direction.value : "down";
  const action = raw ? raw.action : legacy === "up" ? "stop" : "start";
  const line = raw && raw.line !== undefined ? raw.line : false;
  return Object.assign({ kind:"damper", action, line, sign:!line, number:1, strength:legacy === "up" ? 0 : legacy === "half" ? 50 : 100,
    abbreviated:false, placement:"below" }, raw || {});
}
export function workshopPedalValue(pedal) {
  return ["stop", "discontinue"].includes(pedal.action) || pedal.strength === 0 ? "up" : pedal.strength < 100 ? "half" : "down";
}
export function workshopPedalText(direction) {
  const pedal = workshopPedal(direction);
  if (!pedal.sign || ["continue", "resume", "discontinue"].includes(pedal.action)) return "";
  if (pedal.kind === "soft") return ["stop", "discontinue"].includes(pedal.action) || !pedal.strength ? "tre corde" : "una corda";
  if (pedal.action === "stop") return "✱";
  const name = pedal.kind === "sostenuto" ? pedal.abbreviated ? "S" : "Sost." : pedal.abbreviated ? "P" : "Ped.";
  return (pedal.action === "change" ? "✱ " : "") + (pedal.strength > 0 && pedal.strength < 100 ? pedal.strength === 50 ? "½ " : pedal.strength + "% " : "") + name;
}
export function workshopPedalTimelineData(direction) {
  const pedal = workshopPedal(direction), data = { pedalKind:pedal.kind, pedalAction:pedal.action, pedalStrength:pedal.strength };
  // The current sample transport approximates the damper. Other pedal channels
  // are retained for notation without being mistaken for a global sustain pedal.
  if (pedal.kind === "damper" && pedal.action !== "continue") data.pedal = workshopPedalValue(pedal);
  return data;
}
export function workshopPedalTimelineEvents(direction) {
  const data = workshopPedalTimelineData(direction);
  return data.pedalKind === "damper" && data.pedalAction === "change"
    ? [Object.assign({}, data, { pedal:"up", pedalStrength:0 }), data] : [data];
}

export function importWorkshopPedalDirections(node, startSlot, cursor, divisions, state, onWarning) {
  const sound = child(node, "sound"), attrs = sound ? sound.attrs : {}, warnings = [], entries = [], consumedWords = new Set(), used = new Set();
  const sounds = {}, at = Math.max(0, cursor + number(sound, "offset", number(node, "offset", 0)) * 2 / divisions);
  const warning = (code,source) => { if (!warnings.includes(code)) warnings.push(code); if(onWarning)onWarning(code,source); };
  if (!state.pedalMarks) state.pedalMarks = new Map();
  WORKSHOP_PEDAL_KINDS.forEach(kind => {
    if (attrs[kind + "-pedal"] === undefined) return;
    const source = attrs[kind + "-pedal"], strength = source === "yes" ? 100 : source === "no" ? 0 : source.trim() === "" ? NaN : Number(source);
    if (Number.isFinite(strength) && strength >= 0 && strength <= 100 && workshopTimeOnGrid(at)) sounds[kind] = strength;
    else warning("unsupported-notation",sound);
  });
  const marks = children(node, "direction-type").flatMap(type => type.children);
  marks.filter(mark => mark.name === "pedal").forEach(mark => {
    const sourceAction = mark.attrs.type, action = sourceAction === "sostenuto" ? "start" : sourceAction;
    if (!WORKSHOP_PEDAL_ACTIONS.includes(action)) { warning("unsupported-notation",mark); return; }
    const level = mark.attrs.number === undefined ? 1 : Number(mark.attrs.number), staff = number(node, "staff", 1), key = staff + ":" + level;
    const previous = state.pedalMarks.get(key);
    const kind = sourceAction === "sostenuto" ? "sostenuto" : previous && action !== "start" ? previous.kind
      : sounds.damper === undefined && sounds.sostenuto !== undefined ? "sostenuto" : "damper";
    const pedal = { kind, action, line:false, sign:true, number:level, placement:node.attrs.placement === "above" ? "above" : "below" };
    ["line", "sign", "abbreviated"].forEach(field => {
      if (mark.attrs[field] !== undefined) {
        if (["yes", "no"].includes(mark.attrs[field])) pedal[field] = mark.attrs[field] === "yes";
        else warning("unsupported-notation",mark);
      }
    });
    if (mark.attrs.sign === undefined) pedal.sign = !pedal.line;
    pedal.strength = sounds[kind] === undefined ? ["stop", "discontinue"].includes(action) ? 0 : ["start", "resume"].includes(action) ? 100 : previous ? previous.strength : 100 : sounds[kind];
    if (!isValidWorkshopPedal(pedal)) { warning("unsupported-notation",mark); return; }
    if (Object.keys(mark.attrs).some(field => !["type", "number", "line", "sign", "abbreviated", "id"].includes(field))) warning("layout-approximate");
    if (mark.children.length) warning("unsupported-notation",mark);
    entries.push({ startSlot, value:workshopPedalValue(pedal), pedal }); used.add(kind);
    if (sounds[kind] !== undefined && at !== startSlot) warning("unsupported-notation",mark);
    state.pedalMarks.set(key, pedal);
  });
  marks.filter(mark => mark.name === "words").forEach(mark => {
    const word = mark.text.trim().toLowerCase();
    if (!["una corda", "tre corde"].includes(word)) return;
    const strength = sounds.soft === undefined ? word === "tre corde" ? 0 : 100 : sounds.soft;
    const pedal = { kind:"soft", action:strength ? "start" : "stop", strength, sign:true, line:false, placement:node.attrs.placement === "above" ? "above" : "below" };
    entries.push({ startSlot, value:workshopPedalValue(pedal), pedal }); consumedWords.add(mark); used.add("soft");
    if (sounds.soft !== undefined && at !== startSlot) warning("unsupported-notation",mark);
  });
  WORKSHOP_PEDAL_KINDS.forEach(kind => {
    if (sounds[kind] === undefined || used.has(kind)) return;
    const strength = sounds[kind], value = strength === 0 ? "up" : strength === 100 ? "down" : "half";
    const entry = { startSlot:at, value };
    if (kind !== "damper" || ![0, 50, 100].includes(strength)) entry.pedal = { kind, action:strength ? "start" : "stop", strength, line:false, sign:true };
    entries.push(entry);
  });
  return { entries, warnings, consumedWords };
}

export function exportWorkshopPedalDirection(direction) {
  const pedal = workshopPedal(direction), sound = `<sound ${pedal.kind}-pedal="${["stop", "discontinue"].includes(pedal.action) ? 0 : pedal.strength}"/>`;
  if (pedal.kind === "soft") return { mark:`<words>${esc(workshopPedalText(Object.assign({}, direction, { pedal:Object.assign({}, pedal, { sign:true }) })))}</words>`, sound, placement:pedal.placement };
  const type = pedal.kind === "sostenuto" && pedal.action === "start" ? "sostenuto" : pedal.action;
  return { mark:`<pedal type="${type}" number="${pedal.number}" line="${pedal.line ? "yes" : "no"}" sign="${pedal.sign ? "yes" : "no"}" abbreviated="${pedal.abbreviated ? "yes" : "no"}"/>`, sound, placement:pedal.placement };
}

// Returns bar-local segments. The open line is carried across meter changes;
// change marks split the line so the renderer can draw the pedal-release notch.
export function workshopPedalDirectionSegments(score, partIndex, barIndex) {
  const part = score && score.parts && score.parts[partIndex];
  if (!part || barIndex !== undefined && !part.measures[barIndex]) return [];
  let meter = score.meter, cursor = 0;
  const bars = part.measures.map((bar, index) => {
    meter = bar.meter || meter;
    const split = meter.split("/"), units = index === 0 && score.pickupUnits !== undefined ? score.pickupUnits : bar.pickupUnits || split[0].split("+").reduce((sum, value) => sum + Number(value), 0) * 8 / Number(split[1]);
    const location = { bar, start:cursor, units }; cursor += units; return location;
  });
  const marks = bars.flatMap((item, index) => (item.bar.directions || []).filter(direction => direction.type === "pedal")
    .map(direction => ({ direction, pedal:workshopPedal(direction), index, at:item.start + direction.startSlot }))).sort((left, right) => left.at - right.at);
  const open = new Map(), spans = [];
  function close(mark, end, endAction) {
    spans.push({ mark, end, endAction });
  }
  marks.forEach(mark => {
    const key = mark.pedal.kind + ":" + mark.pedal.number, prior = open.get(key), action = mark.pedal.action;
    if (action === "continue") return;
    if (["stop", "discontinue", "change"].includes(action)) {
      if (prior) close(prior, mark.at, action); open.delete(key);
      if (action !== "change") return;
    } else if (prior) { close(prior, mark.at, "discontinue"); open.delete(key); }
    if (mark.pedal.line) open.set(key, mark);
  });
  open.forEach(mark => close(mark, cursor, null));
  const all = bars.map(() => []);
  spans.forEach(span => {
    for (let index=span.mark.index;index<bars.length && bars[index].start<span.end;index++) {
      const own=bars[index], ownEnd=own.start+own.units;
      if(span.mark.at>=ownEnd || span.end<=own.start)continue;
      all[index].push({id:span.mark.direction.id+"-pedal-"+index,type:"pedal",pedal:Object.assign({},span.mark.pedal),
        startSlot:Math.max(0,span.mark.at-own.start),endSlot:Math.min(own.units,span.end-own.start),
        startsHere:span.mark.index===index,endsHere:span.end<=ownEnd && !!span.endAction,endAction:span.end<=ownEnd ? span.endAction:null,
        changeStart:span.mark.index===index && span.mark.pedal.action==="change",changeEnd:span.endAction==="change" && span.end<=ownEnd,
        continuation:span.mark.index!==index});
    }
  });
  return barIndex===undefined ? all:all[barIndex];
}
