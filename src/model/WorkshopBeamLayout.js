import { isValidWorkshopBeamGroup } from "./Workshop";
import { workshopEventVoice } from "./WorkshopRhythm";

const STAFF_MIDDLE = 116;
const STEM_LENGTH = 38;
const BEAM_THICKNESS = 5;
const BEAM_DISTANCE = 9;
const MAX_SLOPE = .18;
const MAX_RISE = 12;
const MIN_BEAM_Y = 8;
const MAX_BEAM_Y = 270;

function beamGroups(events) {
  const ids = Array.from(new Set(events.filter(event => event.beamGroupId).map(event => event.beamGroupId)));
  return ids.filter(id => {
    const anchor=events.find(event => event.beamGroupId === id);
    const context=events.filter(event => !event.implicit && (anchor.sourcePartIndex === undefined || event.sourcePartIndex === anchor.sourcePartIndex));
    return isValidWorkshopBeamGroup(context,id);
  }).map(id => ({
    id, notes: events.filter(event => event.beamGroupId === id)
  }));
}

function directionFor(notes) {
  if (notes.length && notes[0].stem && notes.every(note => note.stem === notes[0].stem)) return notes[0].stem === 'up' ? 1 : -1;
  const top = Math.min(...notes.map(note => note.y));
  const bottom = Math.max(...notes.map(note => note.y));
  return bottom - STAFF_MIDDLE > STAFF_MIDDLE - top ? 1 : -1;
}

// Voice numbers identify independent parts; they do not override explicit
// engraving directions supplied by the score (e.g. melody above triplets).
function beamDirectionFor(notes, multipleVoices) {
  const requested = Array.from(new Set(notes.map(note => note.stem).filter(stem => ["up", "down"].includes(stem))));
  if (requested.length === 1) return requested[0] === "up" ? 1 : -1;
  return multipleVoices ? workshopEventVoice(notes[0]) % 2 === 1 ? 1 : -1 : directionFor(notes);
}

/** Set the common direction before arranging heads on either side of a stem. */
export function workshopBeamStemDirections(events) {
  const directions = new Map();
  // Imported standalone chords also need their requested direction before the
  // heads are placed. Flipping a finished chord can detach displaced seconds
  // and must not replace its full span with a single note's stem length.
  events.filter(event => event.kind === "note" && ["up","down"].includes(event.stem))
    .forEach(event => directions.set(event.id,event.stem === "up" ? 1 : -1));
  const multipleVoices = new Set(events.filter(event => event.kind === "note").map(workshopEventVoice)).size > 1;
  beamGroups(events).forEach(group => {
    if (group.notes.some(note => !Number.isFinite(note.y))) return;
    const direction = beamDirectionFor(group.notes, multipleVoices);
    group.notes.forEach(note => directions.set(note.id, direction));
  });
  return directions;
}

function lineFor(stems, notes, direction, scale = 1) {
  const byId = new Map(notes.map(note => [note.id, note]));
  const positions = stems.map(stem => {
    const heads = stem.eventIds.map(id => byId.get(id));
    return { stem, top: Math.min(...heads.map(note => note.y)),
      bottom: Math.max(...heads.map(note => note.y)) };
  });
  const first = positions[0];
  const last = positions[positions.length - 1];
  const width = last.stem.x - first.stem.x;
  if (!(width > 0)) return null;
  const extreme = item => direction === 1 ? item.top : item.bottom;
  const maximum = Math.min(MAX_SLOPE, MAX_RISE * scale / width);
  let slope = Math.max(-maximum, Math.min(maximum, (extreme(last) - extreme(first)) / width));
  const values=["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"];
  const levels=Math.max(0,...notes.map(note => values.indexOf(note.noteValue)+1));
  const stemLength = (scale === 1 ? STEM_LENGTH : Math.max(STEM_LENGTH,levels * BEAM_DISTANCE + 14)) * scale;
  const paperTop = Math.min(MIN_BEAM_Y, Math.min(...notes.map(note => note.y)) - stemLength);
  const paperBottom = Math.max(MAX_BEAM_Y, Math.max(...notes.map(note => note.y)) + stemLength);
  const minY = paperTop + (direction === -1 ? (BEAM_DISTANCE + BEAM_THICKNESS) * scale : 0);
  const maxY = paperBottom - (direction === 1 ? (BEAM_DISTANCE + BEAM_THICKNESS) * scale : 0);
  function intercept() {
    const limits = positions.map(item => extreme(item) - direction * stemLength
      - slope * (item.stem.x - first.stem.x));
    return direction === 1 ? Math.min(...limits) : Math.max(...limits);
  }
  let y = intercept();
  // Extreme imported chords still need enough stem length. Flatten the beam
  // when a slope would push either endpoint outside the editor paper.
  if (Math.min(y, y + slope * width) < minY || Math.max(y, y + slope * width) > maxY) {
    slope = 0;
    y = intercept();
  }
  y = Math.max(minY, Math.min(maxY, y));
  return { yAt: x => y + slope * (x - first.stem.x), positions };
}

function polygon(id, level, x1, x2, line, direction, eventIds, scale = 1) {
  const offset = (level - 1) * BEAM_DISTANCE * direction * scale;
  const y1 = line.yAt(x1) + offset;
  const y2 = line.yAt(x2) + offset;
  const thickness = BEAM_THICKNESS * direction * scale;
  return { id, level, eventIds: eventIds.slice(), points: [
    [x1, y1], [x2, y2], [x2, y2 + thickness], [x1, y1 + thickness]
  ].map(point => point.join(",")).join(" ") };
}

/** Add beams without changing saved pitches, durations, positions or groups. */
export function layoutWorkshopBeams(notation) {
  const scale = notation.notationScale || 1;
  const events = notation.events.map(event => Object.assign({}, event));
  const stems = notation.stems.map(stem => Object.assign({}, stem, { eventIds: stem.eventIds.slice() }));
  const beams = [];
  const multipleVoices = new Set(events.filter(event => event.kind === "note").map(workshopEventVoice)).size > 1;
  const byId = new Map(events.map(event => [event.id, event]));
  beamGroups(events).forEach(group => {
    const memberIds = new Set(group.notes.map(note => note.id));
    const groupedStems = stems.filter(stem => stem.eventIds.length
      && stem.eventIds.every(id => memberIds.has(id))).sort((left, right) => left.x - right.x);
    if (groupedStems.length < 2 || groupedStems.some(stem => !Number.isFinite(stem.x))
      || group.notes.some(note => !Number.isFinite(note.y))) return;
    const direction = beamDirectionFor(group.notes, multipleVoices);
    const line = lineFor(groupedStems, group.notes, direction, scale);
    if (!line) return;
    groupedStems.forEach(stem => {
      const heads = stem.eventIds.map(id => byId.get(id));
      stem.direction = direction;
      stem.y1 = direction === 1 ? Math.max(...heads.map(note => note.y)) : Math.min(...heads.map(note => note.y));
      stem.y2 = line.yAt(stem.x);
      stem.beamed = true;
      stem.beamGroupId = group.id;
      heads.forEach(note => Object.assign(note, {
        stemDirection: direction, stemX: stem.x, stemEndY: stem.y2
      }));
    });
    beams.push(polygon(group.id + "-primary", 1, groupedStems[0].x,
      groupedStems[groupedStems.length - 1].x, line, direction, group.notes.map(note => note.id), scale));

    const onsets = new Map();
    groupedStems.forEach(stem => {
      const start = byId.get(stem.eventIds[0]).startSlot;
      if (!onsets.has(start)) onsets.set(start, []);
      onsets.get(start).push(stem);
    });
    const ordered = Array.from(onsets.entries()).sort((left, right) => left[0] - right[0]);
    // Short values add the second and third beam. Isolated short onsets get
    // hooks; existing sixteenth groups retain their exact second-beam layout.
    for (const level of [2, 3, 4, 5, 6, 7, 8]) {
      const values = ["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"].slice(level-1);
      const positions = ordered.map(([, stems]) => ({ stems, short: stems.filter(stem => values.includes(stem.noteValue)) }));
      let index = 0;
      while (index < positions.length) {
        if (!positions[index].short.length) { index++; continue; }
        const start = index;
        while (index + 1 < positions.length && positions[index + 1].short.length) index++;
        const end = index++;
        const run = positions.slice(start, end + 1).reduce((result, position) => result.concat(position.short), []);
        if (start !== end) {
          beams.push(polygon(group.id + (level === 2 ? "-secondary-" : level === 3 ? "-tertiary-" : "-level-"+level+"-") + start, level, Math.min(...run.map(stem => stem.x)),
            Math.max(...run.map(stem => stem.x)), line, direction, run.reduce((ids, stem) => ids.concat(stem.eventIds), []), scale));
          continue;
        }
        run.forEach((stem, stemIndex) => {
          const previous = start > 0 ? positions[start - 1].stems[positions[start - 1].stems.length - 1] : null;
          const next = end + 1 < positions.length ? positions[end + 1].stems[0] : null;
          const neighbour = !previous ? next : !next ? previous
            : stem.x - previous.x < next.x - stem.x ? previous : next;
          const distance = neighbour.x - stem.x;
          const hookX = stem.x + Math.sign(distance) * Math.min(10 * scale, Math.abs(distance) * .45);
          beams.push(polygon(group.id + (level === 2 ? "-hook-" : level === 3 ? "-third-hook-" : "-level-"+level+"-hook-") + start + "-" + stemIndex, level, Math.min(stem.x, hookX),
            Math.max(stem.x, hookX), line, direction, stem.eventIds, scale));
        });
      }
    }
  });
  return Object.assign({ events, stems, beams },scale !== 1 ? {notationScale:scale} : {});
}

/** Join one logical voice that is distributed over two visible piano staves. */
export function layoutWorkshopCrossStaffBeams(events, stems, gapY, notationScale = 1) {
  const scale = notationScale !== 1 ? notationScale : Math.max(1,...events.map(event => event.notationScale || 1));
  const result={ stems:[],beams:[],groupIds:[] };
  beamGroups(events).forEach(group => {
    const staves=new Set(group.notes.map(note => note.visualStaff));
    if (staves.size < 2) return;
    const ids=new Set(group.notes.map(note => note.id)),byId=new Map(group.notes.map(note => [note.id,note]));
    const members=stems.filter(stem => stem.eventIds.length && stem.eventIds.every(id => ids.has(id))).map(stem => Object.assign({},stem,{eventIds:stem.eventIds.slice()}));
    if (members.length < 2) return;
    const centre=Number.isFinite(gapY) ? gapY : (Math.min(...group.notes.map(note => note.y))+Math.max(...group.notes.map(note => note.y)))/2;
    members.forEach(stem => {
      const heads=stem.eventIds.map(id => byId.get(id));
      stem.direction=heads.reduce((sum,head) => sum+head.y,0)/heads.length < centre ? -1 : 1;
      stem.x=heads[0].x+(heads[0].stemOffset || 6)*stem.direction;
      stem.y1=stem.direction === 1 ? Math.max(...heads.map(head => head.y)) : Math.min(...heads.map(head => head.y));
      stem.y2=centre;stem.beamed=true;stem.beamGroupId=group.id;
    });
    members.sort((a,b) => a.x-b.x);
    if (!(members[members.length-1].x > members[0].x)) return;
    const line={ yAt:() => centre };
    result.groupIds.push(group.id);result.stems.push(...members);
    result.beams.push(polygon(group.id+"-cross-primary",1,members[0].x,members[members.length-1].x,line,1,group.notes.map(note => note.id),scale));
    const values=["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"];
    for (let level=2;level<=8;level++) {
      let index=0;
      while (index < members.length) {
        if (values.indexOf(members[index].noteValue)+1 < level) { index++;continue; }
        const start=index;
        while (index+1 < members.length && values.indexOf(members[index+1].noteValue)+1 >= level) index++;
        const end=index++;
        if (start !== end) result.beams.push(polygon(group.id+"-cross-"+level+"-"+start,level,members[start].x,members[end].x,line,1,
          members.slice(start,end+1).reduce((all,stem) => all.concat(stem.eventIds),[]),scale));
        else {
          const stem=members[start],next=members[start+1] || members[start-1],offset=Math.sign(next.x-stem.x)*Math.min(10*scale,Math.abs(next.x-stem.x)*.45);
          result.beams.push(polygon(group.id+"-cross-hook-"+level+"-"+start,level,Math.min(stem.x,stem.x+offset),Math.max(stem.x,stem.x+offset),line,1,stem.eventIds,scale));
        }
      }
    }
  });
  return result;
}

/** Complete ties and phrase bows whose two heads are on different staves. */
export function layoutWorkshopCrossStaffCurves(events, ties = [], slurs = []) {
  const notes=new Map(events.filter(event => event.kind === "note" && Number.isFinite(event.x) && Number.isFinite(event.y)).map(event => [event.id,event]));
  const curves=[];
  [["tie",ties],["slur",slurs]].forEach(([kind,relations]) => relations.forEach(relation => {
    const from=notes.get(relation.fromId),to=notes.get(relation.toId);
    // A single-bar overlay only joins heads that are both present. Relations
    // leaving the current bar retain the existing per-staff boundary segments.
    if (!from || !to || from.visualStaff === to.visualStaff || !(to.startSlot > from.startSlot)) return;
    const direction=to.y > from.y ? 1 : -1,scale=(from.stemOffset || 6)/6;
    const inset=Math.min(kind === "tie" ? 6*scale : 2*scale,Math.max(0,(to.x-from.x)*.18));
    const x1=from.x+inset,x2=to.x-inset;
    const y1=from.y+direction*(kind === "tie" ? 7 : 12)*scale,y2=to.y-direction*(kind === "tie" ? 7 : 12)*scale;
    const dx=x2-x1,dy=y2-y1,bend=Math.min((kind === "tie" ? 26 : 42)*scale,Math.max(12*scale,dx*.16+Math.abs(dy)*.06));
    const sideBend=Math.max(0,14*scale-dx*.2);
    const c1x=x1+dx*.32+sideBend,c2x=x2-dx*.32+sideBend,c1y=y1+dy*.24+direction*bend,c2y=y2-dy*.24+direction*bend;
    curves.push({id:kind+":"+relation.fromId+":"+relation.toId,kind,fromId:relation.fromId,toId:relation.toId,eventIds:[relation.fromId,relation.toId],
      minimumY:Math.min(y1,y2,c1y,c2y),maximumY:Math.max(y1,y2,c1y,c2y),
      path:"M "+x1+" "+y1+" C "+c1x+" "+c1y+" "+c2x+" "+c2y+" "+x2+" "+y2});
  }));
  return {curves,relationIds:curves.map(curve => curve.id)};
}
