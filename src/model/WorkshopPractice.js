import { practiceWaitToleranceMs, practiceTimingKind } from './PracticeTiming';
import { createHeldNoteGrip, resetHeldNoteGrip, pressHeldNoteGrip, releaseHeldNoteGrip, heldNoteGripColor } from './HeldNoteGrip';
import { cloneWorkshop, workshopEventVoice, workshopPitchValue, workshopTimeline, workshopMeasureEvents } from './Workshop';
import { createWorkshopPlayback } from './WorkshopPlayback';
import { indexWorkshopExpressionNotes } from './WorkshopExpression';

export const WORKSHOP_PRACTICE_WINDOW_MS = 250;
export const WORKSHOP_PRACTICE_ON_TIME_MS = 100;
const EPSILON = 0.0001;
const silentPlayer = { play() { return null; }, stopAll() {} };

export function freezeWorkshopPracticeSnapshot(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.keys(value).forEach(key => freezeWorkshopPracticeSnapshot(value[key]));
    Object.freeze(value);
  }
  return value;
}

/** A bounded, deliberately simplified overview; never changes the score. */
export function workshopPracticeSectionPreview(plan, page = 0) {
  const measures = plan.timeline.measures, pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(measures.length / pageSize));
  const selectedPage = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(page) || 0)));
  const start = selectedPage * pageSize;
  const bars = measures.slice(start, start + pageSize).map((measure, index) => ({
    number:measure.index + 1, index:start + index, startMs:measure.startMs, endMs:measure.endMs, notes:[]
  }));
  const byIndex = new Map(bars.map(bar => [bar.index, bar]));
  let lowest = Infinity, highest = -Infinity;
  plan.timeline.events.forEach(event => {
    const bar = byIndex.get(event.measureIndex);
    if (!bar || !Number.isFinite(event.value) || (event.partIndex === 1 ? plan.hands.left === false : plan.hands.right === false)) return;
    bar.notes.push(event); lowest = Math.min(lowest,event.value); highest = Math.max(highest,event.value);
  });
  bars.forEach(bar => {
    const notes = bar.notes, step = Math.max(1,Math.ceil(notes.length/32));
    bar.noteCount = notes.length;
    bar.notes = notes.filter((_, index) => index % step === 0).map(event => ({
      x:7+74*Math.max(0,Math.min(1,(event.startMs-bar.startMs)/Math.max(1,bar.endMs-bar.startMs))),
      y:highest === lowest ? 20 : 32-24*(event.value-lowest)/(highest-lowest),
      left:event.partIndex === 1
    }));
  });
  return freezeWorkshopPracticeSnapshot({bars,page:selectedPage,pageCount});
}

function normalizeTempoPercent(value) {
  const number=typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(25,Math.min(100,number)) : 100;
}
function normalizePracticeRange(range,barCount) {
  if (!range || typeof range !== 'object' || !Number.isFinite(range.startBar) || !Number.isFinite(range.endBar)) return null;
  const first=Math.max(0,Math.min(barCount-1,Math.round(range.startBar)));
  const last=Math.max(0,Math.min(barCount-1,Math.round(range.endBar)));
  return {startBar:Math.min(first,last),endBar:Math.max(first,last)};
}
/** A chosen written section runs once; the practice UI owns its repetitions. */
function selectedPracticeTimeline(score,range) {
  const complete=workshopTimeline(score,{includeBeats:true,expandExpressions:false});
  const selected=complete.measures.slice(range.startBar,range.endBar+1);
  const start=Math.min(selected[0].startMs,...complete.events.filter(event=>event.grace && event.barIndex === range.startBar).map(event=>event.startMs)),end=selected[selected.length-1].endMs;
  const slots=new Map();
  score.parts.forEach(part=>part.measures.forEach(bar=>{
    workshopMeasureEvents(bar).forEach(event=>slots.set(event.id,event.startSlot));
    (bar.directions || []).forEach(direction=>slots.set(direction.id,direction.startSlot));
  }));
  const inSection=event=>event.barIndex>=range.startBar && event.barIndex<=range.endBar
    && event.startMs>=start-EPSILON && event.startMs<end-EPSILON;
  const rebase=event=>Object.assign({},event,{
    measureIndex:event.barIndex-range.startBar,startMs:Math.max(0,event.startMs-start),
    durationMs:Math.max(0,Math.min(event.durationMs,end-event.startMs))
  });
  const events=complete.events.filter(inSection).map(event=>{
    const next=rebase(event);if (slots.has(event.id)) next.startSlot=slots.get(event.id);return next;
  });
  return {events,measures:selected.map((measure,measureIndex)=>Object.assign({},measure,{
    measureIndex,startMs:measureIndex === 0 ? 0 : measure.startMs-start,endMs:measure.endMs-start
  })),beats:complete.beats.filter(inSection).map(rebase),durationMs:end-start};
}
function scalePracticeTimeline(timeline,tempoPercent) {
  if (tempoPercent === 100) return timeline;
  const factor=100/tempoPercent;
  const scaled=entry=>{
    const next=Object.assign({},entry);
    ['startMs','endMs','durationMs'].forEach(field=>{if (Number.isFinite(entry[field])) next[field]=entry[field]*factor;});
    return next;
  };
  return {events:timeline.events.map(scaled),measures:timeline.measures.map(scaled),
    beats:timeline.beats.map(scaled),durationMs:timeline.durationMs*factor};
}

/** Whole pieces retain the audition's performed repeats and navigation. */
export function createWorkshopPracticePlan(score, options = {}) {
  const snapshot = freezeWorkshopPracticeSnapshot(cloneWorkshop(score));
  const tempoPercent=normalizeTempoPercent(options.tempoPercent);
  const range=normalizePracticeRange(options.range,snapshot.parts[0].measures.length);
  const originalTimeline=range ? selectedPracticeTimeline(snapshot,range)
    : createWorkshopPlayback(snapshot, silentPlayer, { includeBeats:true,expandExpressions:false }).getTimeline();
  const timeline=scalePracticeTimeline(originalTimeline,tempoPercent);
  const hands = Object.assign({ left:true, right:true }, options.hands || {});
  const notes = timeline.events.filter(event => Number.isFinite(event.value)
    && (event.partIndex === 1 ? hands.left : hands.right));
  const writtenKeys = new Map();
  indexWorkshopExpressionNotes(snapshot).forEach((note,id) => {
    const part = snapshot.parts[note.partIndex], bar = part.measures[note.barIndex];
    // Owner and sounding pitch survive repeats, while an edited pitch starts
    // fresh progress even when the editor retains the written event ID.
    writtenKeys.set(id,part.id+':'+bar.id+':'+id+':'+workshopPitchValue(note.soundingPitch));
  });
  const earlierById = new Map(), attackByEvent = new Map(), groups = [];
  notes.forEach(event => {
    const possible = earlierById.get(event.tieFromId) || [];
    // A written tie only continues if its source was actually performed here.
    // A repeat/navigation jump to its destination needs a fresh attack.
    function isContinuation(previous) {
      const end = previous.startMs + previous.durationMs;
      const adjacent = Math.abs(end - event.startMs) < EPSILON;
      const acrossGap = previous.tieSustainAcrossGap && end <= event.startMs + EPSILON
        && event.measureIndex - previous.measureIndex === event.barIndex - previous.barIndex;
      return previous.tieToId === event.id && previous.value === event.value
        && (previous.partIndex || 0) === (event.partIndex || 0)
        && workshopEventVoice(previous) === workshopEventVoice(event)
        && previous.startMs < event.startMs - EPSILON && (adjacent || acrossGap);
    }
    let continuation = null;
    for (let index = possible.length - 1; index >= 0 && !continuation; index--) {
      if (isContinuation(possible[index])) continuation = possible[index];
    }
    if (!earlierById.has(event.id)) earlierById.set(event.id, []);
    earlierById.get(event.id).push(event);
    if (continuation) {
      const attack = attackByEvent.get(continuation);
      if (writtenKeys.has(event.id)) attack.noteKeys.add(writtenKeys.get(event.id));
      attackByEvent.set(event,attack);return;
    }
    const attack = { event, noteKeys:new Set(writtenKeys.has(event.id) ? [writtenKeys.get(event.id)] : []) };
    attackByEvent.set(event,attack);
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.startMs - event.startMs) < EPSILON) last.attacks.push(attack);
    else groups.push({ startMs:event.startMs, attacks:[attack] });
  });
  const unsupportedTargets = [], targets = [];
  const beats=timeline.beats || [];
  function waitToleranceAt(startMs) {
    let low=0,high=beats.length;
    while (low<high) {const middle=(low+high)>>>1;if(beats[middle].startMs<=startMs)low=middle+1;else high=middle;}
    const beat=beats[Math.max(0,low-1)];
    return practiceWaitToleranceMs(beat ? beat.durationMs : 60000/snapshot.bpm*100/tempoPercent);
  }
  groups.forEach(group => {
    const events = group.attacks.map(attack => attack.event);
    const values = Array.from(new Set(events.map(event => event.value))).sort((a,b) => a-b);
    const noteKeysByValue = {};
    group.attacks.forEach(attack => {
      const value = attack.event.value;
      if (!noteKeysByValue[value]) noteKeysByValue[value] = [];
      attack.noteKeys.forEach(key => { if (!noteKeysByValue[value].includes(key)) noteKeysByValue[value].push(key); });
    });
    const eventIdsByValue={};
    events.forEach(event => {if (!eventIdsByValue[event.value]) eventIdsByValue[event.value]=[];eventIdsByValue[event.value].push(event.id);});
    const target = { startMs:group.startMs, waitToleranceMs:waitToleranceAt(group.startMs),
      expectedValues:values, noteKeysByValue,
      eventIdsByValue,
      eventIds:Array.from(new Set(events.map(event => event.id).filter(Boolean))),
      measureIndex:events[0].measureIndex,
      barIndex:events[0].barIndex };
    // Integer MIDI inputs cannot reproduce a quarter-tone chord.
    // Skip its complete attack rather than accepting an incomplete chord.
    if (values.some(value => !Number.isInteger(value))) unsupportedTargets.push(target);
    else targets.push(target);
  });
  const totalKeys = new Set();
  targets.forEach(target => target.expectedValues.forEach(value => target.noteKeysByValue[value].forEach(key => totalKeys.add(key))));
  const totalNoteKeys = Array.from(totalKeys);
  return freezeWorkshopPracticeSnapshot({ score:snapshot, timeline, targets, unsupportedTargets, hands, totalNoteKeys,
    durationMs:timeline.durationMs,tempoPercent,range });
}

export function createWorkshopPractice(plan, options = {}) {
  return { plan, behavior:options.behavior === 'continuous' ? 'continuous' : 'wait',
    windowMs:WORKSHOP_PRACTICE_WINDOW_MS, onTimeMs:WORKSHOP_PRACTICE_ON_TIME_MS, status:'ready', positionMs:0, targetIndex:0,
    activeMs:0, targetDueActiveMs:plan.targets.length ? plan.targets[0].startMs : 0,
    results:plan.targets.map(() => null), pendingValues:[], grip:createHeldNoteGrip(), lastCompletedTargetIndex:null, correctCount:0, wrongCount:0,
    missedCount:0, feedback:'', feedbackRevision:0, toneCounts:emptyToneCounts(),
    assessmentRevision:0, assessmentDelta:emptyAssessment() };
}

function emptyToneCounts() { return { correct:0, early:0, late:0, wrong:0, missed:0 }; }
function emptyAssessment() { return Object.assign(emptyToneCounts(),{ learnedNoteKeys:[] }); }
function copy(state) {
  return Object.assign({}, state, { pendingValues:state.pendingValues.slice(), assessmentDelta:emptyAssessment() });
}
function assess(state,kind,count=1,learnedNoteKeys=[]) {
  if (count <= 0) return;
  state.toneCounts = Object.assign({},state.toneCounts,{[kind]:state.toneCounts[kind]+count});
  state.assessmentDelta[kind] += count;state.assessmentRevision++;
  learnedNoteKeys.forEach(key => {
    if (!state.assessmentDelta.learnedNoteKeys.includes(key)) state.assessmentDelta.learnedNoteKeys.push(key);
  });
}
function missTarget(state,target) {
  // An incomplete physical grip earns no partial score or learned-note credit.
  const remaining = target.expectedValues;
  assess(state,'missed',remaining.length);state.pendingValues = [];state.grip=resetHeldNoteGrip(state.grip);
}
function recordResult(state, index, result) {
  state.results = state.results.slice(); state.results[index] = result;
}
function feedback(state, value) {
  state.feedback = value; state.feedbackRevision++;
}
export function workshopPracticeIsPlaying(state) {
  return state.status === 'running' || state.status === 'waiting';
}
export function startWorkshopPractice(state) {
  if (workshopPracticeIsPlaying(state)) return state;
  const next = state.status === 'complete'
    ? createWorkshopPractice(state.plan, { behavior:state.behavior }) : copy(state);
  next.status = 'running'; next.feedback = '';
  return advanceWorkshopPractice(next, 0);
}
export function pauseWorkshopPractice(state) {
  if (!workshopPracticeIsPlaying(state)) return state;
  const next = copy(state); next.status = 'paused';
  next.grip=resetHeldNoteGrip(state.grip);next.pendingValues=[];return next;
}
export function advanceWorkshopPractice(state, deltaMs) {
  if (!workshopPracticeIsPlaying(state) || !Number.isFinite(deltaMs) || deltaMs < 0) return state;
  const next = copy(state), targets = state.plan.targets;
  next.activeMs = state.activeMs + deltaMs;
  // The score waits, but the performer's active response clock keeps running.
  // Manual pause never calls this advancement and therefore adds no lateness.
  if (state.status === 'waiting') return next;
  const destination = Math.min(state.plan.durationMs, state.positionMs + deltaMs);
  if (state.behavior === 'wait') {
    const target = targets[next.targetIndex];
    if (target && target.startMs <= destination + EPSILON) {
      next.positionMs = Math.max(state.positionMs, target.startMs); next.status = 'waiting';
      return next;
    }
  } else {
    while (next.targetIndex < targets.length
      && destination > targets[next.targetIndex].startMs + next.windowMs) {
      missTarget(next,targets[next.targetIndex]);
      if (next.results === state.results) next.results = state.results.slice();
      next.results[next.targetIndex++] = 'missed'; next.missedCount++;
      next.pendingValues = []; feedback(next, 'missed');
    }
  }
  next.positionMs = destination;
  if (destination >= state.plan.durationMs) {
    while (next.targetIndex < targets.length) {
      missTarget(next,targets[next.targetIndex]);
      if (next.results === state.results) next.results = state.results.slice();
      next.results[next.targetIndex++] = 'missed'; next.missedCount++;
    }
    next.pendingValues = []; next.status = 'complete'; feedback(next, 'complete');
  }
  return next;
}
export function submitWorkshopPracticeInput(state, value) {
  if (!workshopPracticeIsPlaying(state) || !Number.isInteger(value)) return state;
  const next = copy(state), target = state.plan.targets[state.targetIndex];
  const inWindow = target && (state.behavior === 'wait' ? state.status === 'waiting'
    || target.startMs - state.positionMs <= state.windowMs
    : Math.abs(state.positionMs - target.startMs) <= state.windowMs);
  const strike=pressHeldNoteGrip(state.grip,inWindow ? target.expectedValues : [],value,state.activeMs);
  if (!strike) return state;
  next.grip=strike.grip;next.pendingValues=strike.grip.activeValues.slice();
  if (!strike.correct) {
    next.wrongCount++; assess(next,'wrong');feedback(next, 'wrong'); return next;
  }
  feedback(next,'pending');
  if (strike.complete) {
    target.expectedValues.forEach(expected => {
      const offset = state.behavior === 'wait' ? next.grip.activeAt[expected] - state.targetDueActiveMs
        : next.grip.activeAt[expected] - state.activeMs + state.positionMs - target.startMs;
      const kind = practiceTimingKind(offset,state.onTimeMs,state.behavior === 'wait' ? target.waitToleranceMs : state.onTimeMs);
      assess(next,kind,1,kind === 'correct' ? target.noteKeysByValue[expected] : []);
    });
    const offset=state.behavior === 'wait' ? state.activeMs-state.targetDueActiveMs : state.positionMs-target.startMs;
    feedback(next,practiceTimingKind(offset,state.onTimeMs,state.behavior === 'wait' ? target.waitToleranceMs : state.onTimeMs));
    next.grip=resetHeldNoteGrip(next.grip);
    next.lastCompletedTargetIndex=next.targetIndex;
    recordResult(next, next.targetIndex++, 'correct'); next.correctCount++; next.pendingValues = [];
    next.status = 'running';
    const following = state.plan.targets[next.targetIndex];
    // Each following onset gets a fresh due time relative to the moving score;
    // time spent waiting for the previous chord cannot make it automatically late.
    next.targetDueActiveMs = following ? next.activeMs + following.startMs - next.positionMs : next.activeMs;
  }
  return next;
}
/** Seeking starts a new section; earlier attacks are unscored, not missed. */
export function seekWorkshopPractice(state, positionMs) {
  if (!Number.isFinite(positionMs)) return state;
  const playing = workshopPracticeIsPlaying(state);
  const next = createWorkshopPractice(state.plan, { behavior:state.behavior });
  next.positionMs = Math.max(0, Math.min(state.plan.durationMs, positionMs));
  next.targetIndex = state.plan.targets.findIndex(target => target.startMs >= next.positionMs - EPSILON);
  if (next.targetIndex < 0) next.targetIndex = state.plan.targets.length;
  const target = state.plan.targets[next.targetIndex];
  next.targetDueActiveMs = target ? target.startMs - next.positionMs : 0;
  for (let index = 0; index < next.targetIndex; index++) next.results[index] = 'skipped';
  next.status = next.positionMs >= state.plan.durationMs ? 'complete' : playing ? 'running' : 'paused';
  return playing ? advanceWorkshopPractice(next, 0) : next;
}
export function clearWorkshopPracticeFeedback(state) {
  if (!state.feedback) return state;
  const next = copy(state); next.feedback = ''; return next;
}
export function workshopPracticeActiveEventIds(state) {
  const target = state.plan.targets[state.targetIndex];
  if (!target || !workshopPracticeIsPlaying(state)) return [];
  return state.status === 'waiting' || Math.abs(state.positionMs - target.startMs) <= state.windowMs
    ? target.eventIds : [];
}

export function releaseWorkshopPracticeInput(state, value) {
  const grip=releaseHeldNoteGrip(state.grip,value);
  return grip === state.grip ? state : Object.assign({},state,{grip,pendingValues:grip.activeValues.slice(),assessmentDelta:emptyAssessment()});
}

export function workshopPracticeNoteStates(state) {
  const target=state.plan.targets[state.targetIndex],result={};
  if (!workshopPracticeIsPlaying(state)) return result;
  const previous=state.plan.targets[state.lastCompletedTargetIndex];
  if (previous && (!target || previous.measureIndex === target.measureIndex)) {
    previous.expectedValues.forEach(value => (previous.eventIdsByValue[value] || []).forEach(id => {
      result[id]=state.grip.heldValues.includes(value) ? 'held' : 'found';
    }));
  }
  if (target) target.expectedValues.forEach(value => {
    (target.eventIdsByValue[value] || []).forEach(id => {result[id]=heldNoteGripColor(state.grip,value) || 'unseen';});
  });
  return result;
}
