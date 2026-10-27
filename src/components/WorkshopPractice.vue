<template>
  <section class="workshop-practice" :aria-label="$t('WORKSHOP_PRACTICE_MODE')">
    <section v-if="roundResult" class="practice-result" aria-labelledby="workshop-round-result-title">
      <span class="result-kicker">{{$t('WORKSHOP_PRACTICE_RESULT_KICKER')}}</span>
      <h2 id="workshop-round-result-title" ref="resultHeading" tabindex="-1">{{$t('WORKSHOP_PRACTICE_RESULT_TITLE')}}</h2>
      <p class="result-piece">{{title}}</p>
      <p>{{$t(roundResult.reason === 'complete' ? roundResult.range ? 'WORKSHOP_PRACTICE_SECTION_COMPLETE' : 'WORKSHOP_PRACTICE_COMPLETE' : 'WORKSHOP_PRACTICE_RESULT_MANUAL')}}</p>
      <p class="result-context">{{$t('WORKSHOP_PRACTICE_RESULT_CONTEXT',{percent:roundResult.tempoPercent})}}<span v-if="roundResult.range"> · {{rangeLabel(roundResult.range)}}</span></p>
      <dl class="result-counts">
        <div v-for="row in resultRows" :key="row.key"><dt>{{$t(row.label)}}</dt><dd>{{roundResult.counts[row.key]}}</dd></div>
      </dl>
      <aside class="result-tip"><strong>{{$t('WORKSHOP_PRACTICE_RESULT_TIP')}}</strong><p>{{$t(resultTip)}}</p></aside>
      <p class="result-note">{{$t('WORKSHOP_PRACTICE_RESULT_NOTE')}}</p>
      <div class="result-actions"><button type="button" class="result-again" @click="repeatRound">{{$t('WORKSHOP_PRACTICE_RESULT_AGAIN')}}</button><button type="button" @click="adjustRound">{{$t('WORKSHOP_PRACTICE_SETTINGS')}}</button><button type="button" @click="back">{{$t('WORKSHOP_PRACTICE_BACK')}}</button></div>
    </section>
    <div v-show="!roundResult" class="practice-session">
    <WorkshopListening ref="listening" :score="plan.score" :timeline="plan.timeline" :title="title" :practice="true"
      :position="practice.positionMs" :playing="transportPlaying" :busy="audioStarting" :play-disabled="!midiConnected || !plan.targets.length" :active-event-ids="activeEventIds"
      :practice-note-states="practiceNoteStates" :wrong-pitch-values="wrongPitchValues" :wrong-pitch-target="currentTarget" :pitch-label="pitchLabel"
      :preparation-remaining="preparationRemaining" :settings-open="settingsOpen" :practice-summary="practiceSummary" :linear-practice="!!plan.range" :close-label="$t(roundStarted ? 'WORKSHOP_PRACTICE_END_ROUND' : 'WORKSHOP_PRACTICE_BACK')" :note-label="noteLabel"
      @toggle="toggle" @seek="seek" @close="back" @settings-toggle="toggleSettings" @scrub-start="scrubStart" @scrub-end="scrubEnd">
      <template slot="practice-settings" slot-scope="settings">
        <div class="practice-settings">
          <fieldset><legend>{{$t('WORKSHOP_PRACTICE_MODE')}}</legend>
            <button type="button" :aria-pressed="behavior === 'wait'" @click="changeBehavior('wait')">{{$t('WORKSHOP_PRACTICE_WAIT')}}</button>
            <button type="button" :aria-pressed="behavior === 'continuous'" @click="changeBehavior('continuous')">{{$t('WORKSHOP_PRACTICE_CONTINUOUS')}}</button>
          </fieldset>
          <button type="button" class="metronome-toggle" :aria-pressed="metronomeEnabled" @click="toggleMetronome">{{$t('WORKSHOP_PRACTICE_METRONOME')}} · {{$t(metronomeEnabled ? 'WORKSHOP_PRACTICE_ON' : 'WORKSHOP_PRACTICE_OFF')}}</button>
          <button type="button" class="wrong-pitch-toggle" :aria-pressed="wrongPitchMarkersEnabled" :title="$t('FLOW_WRONG_PITCH_MARKERS_HELP')" @click="toggleWrongPitchMarkers">{{$t('FLOW_WRONG_PITCH_MARKERS')}} · {{$t(wrongPitchMarkersEnabled ? 'WORKSHOP_PRACTICE_ON' : 'WORKSHOP_PRACTICE_OFF')}}</button>
        </div>
        <fieldset class="practice-hands"><legend>{{$t('WORKSHOP_PRACTICE_HAND_CHOICE')}}</legend>
          <button v-for="mode in ['both','right','left']" :key="mode" type="button" :aria-pressed="handMode===mode" :disabled="mode==='left' && !hasLeftHand" @click="changeHands(mode)">{{$t('WORKSHOP_PRACTICE_HAND_'+mode.toUpperCase())}}</button>
        </fieldset>
        <div class="practice-tempo"><label><span>{{$t('WORKSHOP_PRACTICE_TEMPO')}}</span><output>{{tempoDraft}} %</output><input type="range" min="25" max="100" step="5" :value="tempoDraft" :aria-label="$t('WORKSHOP_PRACTICE_TEMPO')" :aria-valuetext="tempoDraft+' %'" @input="tempoDraft=Number($event.target.value)" @change="changeTempo(tempoDraft)" /></label><button type="button" :disabled="tempoPercent === 100" @click="changeTempo(100)">{{$t('WORKSHOP_PRACTICE_ORIGINAL_TEMPO')}}</button></div>
        <fieldset class="practice-section"><legend>{{$t('WORKSHOP_PRACTICE_SECTION')}}</legend>
          <label class="section-switch"><input type="checkbox" :checked="sectionEnabled" @change="changeSectionEnabled($event.target.checked)" /> {{$t('WORKSHOP_PRACTICE_SECTION_ON')}}</label>
          <WorkshopPracticeRange v-if="sectionEnabled" :score="score" :hands="hands" :from="sectionFrom" :to="sectionTo" @change="changeSectionRange" />
          <button v-if="sectionEnabled" type="button" class="section-loop" :aria-pressed="loopEnabled" :disabled="audioStarting" @click="changeLoop(!loopEnabled)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3"/></svg><span>{{$t('WORKSHOP_PRACTICE_LOOP')}} · {{$t(loopEnabled ? 'WORKSHOP_PRACTICE_ON' : 'WORKSHOP_PRACTICE_OFF')}}<small v-if="loopEnabled">{{$t('WORKSHOP_PRACTICE_LOOP_PASS',{number:loopPass})}}</small></span></button>
        </fieldset>
      </template>
      <MidiConnectionStatus slot="connection-status" :connected="midiConnected" />
    </WorkshopListening>
    <p v-if="plan.unsupportedTargets.length" class="practice-notice" role="status">{{$t('WORKSHOP_PRACTICE_UNSUPPORTED', {count:plan.unsupportedTargets.length})}}</p>
    <p v-if="!plan.targets.length" class="practice-notice" role="status">{{$t('WORKSHOP_PRACTICE_EMPTY')}}</p>
    <p v-if="audioError" class="practice-notice" role="alert">{{$t(audioError)}}</p>
    <MidiInput ref="midi" :is-sharp="true" show-octave :silent="true" show-connection-feedback @solved="press" @released="release" @connection-change="handleMidiConnection" />
    </div>
  </section>
</template>

<script>
import WorkshopListening from './WorkshopListening';
import WorkshopPracticeRange from './WorkshopPracticeRange';
import MidiInput from './MidiInput';
import MidiConnectionStatus from './MidiConnectionStatus';
import Options from '../model/Options';
import {loadWorkshopWrongPitchMarkers,saveWorkshopWrongPitchMarkers} from '../model/WorkshopPracticePreferences';
import { normalizePreparationSeconds } from '../model/PracticePreparation';
import { createScreenAwakeMixin } from '../model/ScreenAwakeMixin';
import Utils from '../model/Utils';
import AudioSync from '../model/AudioSynchronization';
import { watchAudioTimingChanges } from '../model/AudioSynchronizationPlayback';
import { createWorkshopPianoPlayer } from '../model/WorkshopPianoAudio';
import { createWorkshopPracticeMetronome } from '../model/WorkshopPracticeMetronome';
import { workshopPracticeFeedback } from '../model/WorkshopPracticeFeedback';
import { workshopPitchValue } from '../model/Workshop';
import { createWorkshopPracticePlan, createWorkshopPractice, startWorkshopPractice, pauseWorkshopPractice,
  advanceWorkshopPractice, submitWorkshopPracticeInput, seekWorkshopPractice,
  releaseWorkshopPracticeInput, workshopPracticeNoteStates, workshopPracticeIsPlaying, workshopPracticeActiveEventIds } from '../model/WorkshopPractice';

export default {
  name:'WorkshopPractice', components:{ WorkshopListening, WorkshopPracticeRange, MidiInput, MidiConnectionStatus },
  mixins: [createScreenAwakeMixin(function () {
    return !this.roundResult && (this.transportPlaying || this.audioStarting);
  })],
  props:{ score:{type:Object,required:true}, title:{type:String,default:''},
    hands:{type:Object,default:() => ({left:true,right:true})}, showLicense:{type:Boolean,default:false},
    player:{type:Object,default:null} },
  data() {
    const plan = createWorkshopPracticePlan(this.score, {hands:this.hands});
    return { plan, practice:createWorkshopPractice(plan), behavior:'wait',
      midiConnected:false, audioStarting:false, audioError:'', preparing:false, preparationRemaining:0, settingsOpen:true,
      wrongPitchMarkersEnabled:loadWorkshopWrongPitchMarkers(),wrongPitchValues:[],
      metronomeEnabled:false, tempoPercent:100, tempoDraft:100, sectionEnabled:false, sectionFrom:1, sectionTo:Math.min(4,this.score.parts[0].measures.length), loopEnabled:false, loopPass:1,
      completedLoopCounts:{correct:0,early:0,late:0,wrong:0,missed:0}, completedLoopActiveMs:0,
      roundStarted:false, roundStartPosition:0, roundResult:null };
  },
  computed:{
    playing() { return workshopPracticeIsPlaying(this.practice); },
    transportPlaying() { return this.playing || this.preparing; },
    currentTarget() { return this.plan.targets[this.practice.targetIndex] || null; },
    activeEventIds() { return workshopPracticeActiveEventIds(this.practice); },
    practiceNoteStates() { return workshopPracticeNoteStates(this.practice); },
    barCount() {return this.score.parts[0].measures.length;},
    hasLeftHand() {return !!(this.score.parts[1] && this.score.parts[1].enabled !== false);},
    handMode() {return this.hands.left !== false && this.hands.right !== false ? 'both' : this.hands.left !== false ? 'left' : 'right';},
    practiceSummary() {
      const items=[this.$t('WORKSHOP_PRACTICE_HAND_'+this.handMode.toUpperCase())];
      if(this.tempoPercent !== 100) items.push(this.$t('WORKSHOP_PRACTICE_RESULT_CONTEXT',{percent:this.tempoPercent}));
      if(this.plan.range) items.push(this.rangeLabel(this.plan.range));
      if(this.loopEnabled && this.plan.range) items.push(this.$t('WORKSHOP_PRACTICE_LOOP_PASS',{number:this.loopPass}));
      return items.join(' · ');
    },
    resultTip() {return workshopPracticeFeedback(this.roundResult);},
    resultRows() { return [
      {key:'correct',label:'WORKSHOP_PRACTICE_STATS_CORRECT'},
      {key:'early',label:'WORKSHOP_PRACTICE_STATS_EARLY'},
      {key:'late',label:'WORKSHOP_PRACTICE_STATS_LATE'},
      {key:'wrong',label:'WORKSHOP_PRACTICE_STATS_WRONG'},
      {key:'missed',label:'WORKSHOP_PRACTICE_STATS_MISSED'}
    ]; }
  },
  watch:{ score:'resetScore', hands:{deep:true,handler:'resetScore'} },
  created() {
    this._practiceFrame = null; this._lastFrameAt = null; this._preparationFrame = null; this._preparationDeadline = 0;
    this._soundTimers = new Set(); this._wrongPitchTimers = new Map(); this._startRequest = 0; this._audioGeneration = 0;
    this._practiceDisposed = false; this._practicePlayer = null; this._metronome = null;this._pausing=false;
  },
  mounted() {
    this._unsubscribeTiming = watchAudioTimingChanges(this.pause);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  },
  beforeDestroy() {
    this._practiceDisposed = true; this.pause();
    if (this._metronome) this._metronome.destroy();
    if (this._unsubscribeTiming) this._unsubscribeTiming();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
  },
  methods:{
    clearWrongPitchMarkers() {
      this._wrongPitchTimers.forEach(clearTimeout);this._wrongPitchTimers.clear();this.wrongPitchValues=[];
    },
    toggleWrongPitchMarkers() {
      this.wrongPitchMarkersEnabled=saveWorkshopWrongPitchMarkers(!this.wrongPitchMarkersEnabled);
      this.clearWrongPitchMarkers();
    },
    showWrongPitch(value) {
      if (!this.wrongPitchMarkersEnabled || this._practiceDisposed) return;
      if (this._wrongPitchTimers.has(value)) clearTimeout(this._wrongPitchTimers.get(value));
      if (!this.wrongPitchValues.includes(value)) this.wrongPitchValues=this.wrongPitchValues.concat(value);
      const timer=setTimeout(()=>{
        if (this._wrongPitchTimers.get(value) !== timer || this._practiceDisposed) return;
        this._wrongPitchTimers.delete(value);this.wrongPitchValues=this.wrongPitchValues.filter(note=>note!==value);
      },1000);
      this._wrongPitchTimers.set(value,timer);
    },
    rangeLabel(range) {
      return range.startBar === range.endBar ? this.$t('WORKSHOP_BAR',{number:range.startBar+1})
        : this.$t('WORKSHOP_PRACTICE_RESULT_RANGE',{start:range.startBar+1,end:range.endBar+1});
    },
    toggleSettings() {
      if (this.transportPlaying || this.audioStarting) this.pause();
      this.settingsOpen=!this.settingsOpen;
      if (this.settingsOpen && !this.midiConnected) {
        const midi=this.$refs.midi;
        if (midi && typeof midi.initMidi === 'function') midi.initMidi();
      }
    },
    resetScore() {
      this.sectionFrom=Math.max(1,Math.min(this.barCount,this.sectionFrom));
      this.sectionTo=Math.max(this.sectionFrom,Math.min(this.barCount,this.sectionTo));
      this.rebuildPlan();
    },
    rebuildPlan(position=0) {
      this.pause(); this.audioError='';
      if (this._metronome) { this._metronome.destroy(); this._metronome=null; }
      this.plan=createWorkshopPracticePlan(this.score, {hands:this.hands,tempoPercent:this.tempoPercent,
        range:this.sectionEnabled ? {startBar:this.sectionFrom-1,endBar:this.sectionTo-1} : null});
      this.tempoPercent=this.tempoDraft=this.plan.tempoPercent;
      this.resetSection(position);
    },
    changeTempo(percent) {
      const value=Number(percent);
      if(!Number.isFinite(value)) return;
      const next=Math.max(25,Math.min(100,value));
      this.tempoDraft=next;if(next === this.tempoPercent) return;
      this.pause();const position=this.practice.positionMs*this.tempoPercent/next;
      this.tempoPercent=next;this.rebuildPlan(position);
    },
    changeHands(mode) {
      if(!['both','left','right'].includes(mode) || mode===this.handMode || mode==='left' && !this.hasLeftHand) return;
      this.pause();
      this.$emit('hands-change',{left:mode!=='right',right:mode!=='left'});
    },
    changeSectionRange(range) {
      if(!this.sectionEnabled || !range || !Number.isInteger(range.from) || !Number.isInteger(range.to)) return;
      const from=Math.max(1,Math.min(this.barCount,range.from)),to=Math.max(from,Math.min(this.barCount,range.to));
      if(from===this.sectionFrom && to===this.sectionTo) return;
      this.sectionFrom=from;this.sectionTo=to;this.rebuildPlan();
    },
    changeSectionEnabled(enabled) {
      if(this.sectionEnabled === (enabled === true)) return;
      this.sectionEnabled=enabled === true;
      if(!this.sectionEnabled) this.loopEnabled=false;
      this.rebuildPlan();
    },
    changeSectionBar(side,value) {
      if(!this.sectionEnabled || value === '' || !Number.isFinite(Number(value))) return;
      const bar=Math.max(1,Math.min(this.barCount,Math.round(Number(value))));
      if(side === 'start') {
        if(bar === this.sectionFrom) return;
        this.sectionFrom=bar;this.sectionTo=Math.max(bar,this.sectionTo);
      } else {
        if(bar === this.sectionTo) return;
        this.sectionTo=bar;this.sectionFrom=Math.min(bar,this.sectionFrom);
      }
      this.rebuildPlan();
    },
    changeLoop(enabled) {
      this.pause();this.loopEnabled=this.sectionEnabled && enabled === true;
    },
    changeBehavior(behavior) {
      if (this.behavior === behavior) return;
      this.pause(); this.behavior=behavior; this.resetSection(0);
    },
    resetSection(position) {
      this.clearWrongPitchMarkers();
      const initial=createWorkshopPractice(this.plan,{behavior:this.behavior});
      this.practice=position === 0 ? initial : seekWorkshopPractice(initial,position);
      this.roundStartPosition=this.practice.positionMs; this.roundStarted=false; this.roundResult=null;
      this.loopPass=1;this.completedLoopActiveMs=0;this.completedLoopCounts={correct:0,early:0,late:0,wrong:0,missed:0};
    },
    ensurePlayer() {
      if (!this._practicePlayer) this._practicePlayer=createWorkshopPianoPlayer({maxVoices:16,allowFractionalPitch:true,fallbackPlayer:this.player || undefined});
      return this._practicePlayer;
    },
    async toggle() {
      if (this.transportPlaying || this.audioStarting) { this.pause(); return; }
      if (!this.midiConnected || !this.plan.targets.length || this.roundResult) return;
      if (this.practice.status === 'complete') {
        if(this.loopEnabled && this.plan.range && this.roundStarted) {this.startNextLoop();return;}
        this.resetSection(0);
      }
      const request=++this._startRequest; this.audioStarting=true; this.audioError='';
      try {
        const ready=await AudioSync.resume(), context=AudioSync.getContext();
        if (request !== this._startRequest || this._practiceDisposed || !this.midiConnected) return;
        if (context && (!ready || context.state !== 'running')) throw new Error('audio-unavailable');
        const player=this.ensurePlayer();
        const samplesReady=await player.prepare(this.plan.targets.reduce((all,target) => all.concat(target.expectedValues),[]));
        if (request !== this._startRequest || this._practiceDisposed || !this.midiConnected || document.hidden) return;
        if (!samplesReady) throw new Error('samples-unavailable');
        this.beginPreparation(request);
      } catch (error) {
        if (request === this._startRequest) this.audioError='WORKSHOP_AUDIO_UNAVAILABLE';
      } finally { if (request === this._startRequest) this.audioStarting=false; }
    },
    now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); },
    clearPreparation() {
      if (this._preparationFrame !== null) cancelAnimationFrame(this._preparationFrame);
      this._preparationFrame=null; this._preparationDeadline=0;
      this.preparing=false; this.preparationRemaining=0;
    },
    beginPreparation(request) {
      this.settingsOpen=false;
      this.clearPreparation();
      const duration=normalizePreparationSeconds(Options.preparationSeconds)*1000;
      let previous=this.now(); this._preparationDeadline=previous+duration;
      this.preparing=duration>0; this.preparationRemaining=duration>0 ? 1 : 0;
      this.startMetronome(duration/1000);
      const start=() => {
        const startedAt=this._preparationDeadline;
        this.clearPreparation(); this.roundStarted=true;
        this.applyState(startWorkshopPractice(this.practice)); this.beginFrame(startedAt);
      };
      if(!duration) {start();this.centerListening();return;}
      this.centerListening();
      const step=(now) => {
        this._preparationFrame=null;
        if (request !== this._startRequest || this._practiceDisposed || !this.midiConnected || document.hidden) { this.pause(); return; }
        // A suspended tab must never silently skip the preparation phase.
        if(now-previous>1000) {this.pause();return;} previous=now;
        const remaining=this._preparationDeadline-now;
        if(remaining<=0) {start();return;}
        this.preparationRemaining=Math.min(1,remaining/duration);
        this._preparationFrame=requestAnimationFrame(step);
      };
      this._preparationFrame=requestAnimationFrame(step);
    },
    metronomeLimit() {
      return this.behavior === 'wait' && this.currentTarget ? this.currentTarget.startMs : this.plan.durationMs;
    },
    startMetronome(leadSeconds=0) {
      if (!this.metronomeEnabled) return;
      if (this._metronome) this._metronome.destroy();
      this._metronome=createWorkshopPracticeMetronome(this.plan.timeline,{
        getContext:() => AudioSync.getContext(), getVolume:() => Options.appVolume,
        delayMs:AudioSync.getDelayMs()
      });
      const context=AudioSync.getContext();
      this._metronome.start(this.practice.positionMs,{
        audibleAtSeconds:context ? context.currentTime+leadSeconds : undefined,limitMs:this.metronomeLimit()
      });
      if (!leadSeconds && this.practice.status === 'waiting') this.updateMetronome();
    },
    updateMetronome() {
      if (this.metronomeEnabled && this._metronome && this.playing) this._metronome.update(this.practice.positionMs,{
        waiting:this.practice.status === 'waiting',limitMs:this.metronomeLimit()
      });
    },
    stopMetronome() { if (this._metronome) this._metronome.stop(); },
    toggleMetronome() {
      this.metronomeEnabled=!this.metronomeEnabled;
      if (!this.metronomeEnabled) { this.stopMetronome(); return; }
      if (this.preparing) this.startMetronome(Math.max(0,this._preparationDeadline-this.now())/1000);
      else if (this.playing) { this.updateClock(); if (this.playing) this.startMetronome(); }
    },
    centerListening() {
      const request=this._startRequest;
      this.$nextTick(() => {
        if (request !== this._startRequest || this._practiceDisposed || !this.transportPlaying) return;
        const listening=this.$refs.listening;
        if (listening && typeof listening.centerForPractice === 'function') listening.centerForPractice();
      });
    },
    beginFrame(startedAt=this.now()) {
      this.stopFrame(); this._lastFrameAt=startedAt;
      if (this.playing) this._practiceFrame=requestAnimationFrame(this.tick);
    },
    tick(now) {
      this._practiceFrame=null; this.updateClock(now);
      if (this.playing) this._practiceFrame=requestAnimationFrame(this.tick);
    },
    updateClock(now=this.now()) {
      if (!this.playing) return;
      const delta=this._lastFrameAt === null ? 0 : Math.max(0, now-this._lastFrameAt);
      this._lastFrameAt=now;
      // Suspend after a stalled/hidden frame rather than recording a burst of misses.
      if (delta > 1000) { this.pause(); return; }
      this.applyState(advanceWorkshopPractice(this.practice,delta));
      if (!this.playing) { this.stopFrame(); this.stopPressedAudio(); this.stopMetronome(); }
    },
    stopFrame() {
      if (this._practiceFrame !== null) cancelAnimationFrame(this._practiceFrame);
      this._practiceFrame=null; this._lastFrameAt=null;
    },
    pause() {
      this.clearWrongPitchMarkers();
      // Count the active fraction since the last drawn frame before stopping;
      // subsequent time in a manual pause never reaches the response clock.
      const alreadyPausing=this._pausing;this._pausing=true;
      try {
        if (this.playing && this._lastFrameAt !== null) {
          const delta=Math.max(0,this.now()-this._lastFrameAt);
          if (delta <= 1000) this.applyState(advanceWorkshopPractice(this.practice,delta));
        }
      } finally {this._pausing=alreadyPausing;}
      this._startRequest++; this.audioStarting=false; this.clearPreparation(); this.stopFrame(); this.stopPressedAudio(); this.stopMetronome();
      this.practice=pauseWorkshopPractice(this.practice);
    },
    seek(position) {
      if (!Number.isFinite(position)) return;
      const resume=this.playing; this.pause(); this.resetSection(position);
      if (resume && this.practice.status !== 'complete') this.toggle();
    },
    scrubStart() { this.pause(); },
    scrubEnd(result) {
      this.seek(result.position);
      if (result.resume && this.practice.status !== 'complete') this.toggle();
    },
    press(value) {
      if (!this.midiConnected || !this.playing || !Number.isInteger(value)) return;
      this.updateClock(); if (!this.playing) return;
      const target=this.currentTarget;
      if (target && target.expectedValues.includes(value)) this.clearWrongPitchMarkers();
      else if (target) this.showWrongPitch(value);
      this.playPressedAudio(value); this.applyState(submitWorkshopPracticeInput(this.practice,value));
    },
    release(value) { this.applyState(releaseWorkshopPracticeInput(this.practice,value)); },
    playPressedAudio(value) {
      const player=this.ensurePlayer(), generation=this._audioGeneration;
      // Only the user's actual key is audible; targets are never auto-played.
      Promise.resolve(player.prepare([value])).then(ready => {
        if (!ready || this._practiceDisposed || !this.playing || generation !== this._audioGeneration) return;
        const handle=player.play(value,Options.appVolume);
        if (!handle) return;
        const timer=setTimeout(() => { this._soundTimers.delete(timer); player.stop(handle); },500);
        this._soundTimers.add(timer);
      }).catch(() => { if (!this._practiceDisposed && generation === this._audioGeneration) this.audioError='WORKSHOP_AUDIO_UNAVAILABLE'; });
    },
    stopPressedAudio() {
      this._audioGeneration++; this._soundTimers.forEach(clearTimeout); this._soundTimers.clear();
      if (this._practicePlayer) this._practicePlayer.stopAll();
    },
    applyState(next) {
      const assessed=next.assessmentRevision > this.practice.assessmentRevision;
      if (next.targetIndex !== this.practice.targetIndex || !workshopPracticeIsPlaying(next)) this.clearWrongPitchMarkers();
      this.practice=next;
      if (assessed) this.$emit('assessment',Object.assign({},next.assessmentDelta,{learnedNoteKeys:next.assessmentDelta.learnedNoteKeys.slice()}));
      this.updateMetronome();
      if (next.status === 'complete' && this.roundStarted && !this.roundResult) {
        if(this.loopEnabled && this.plan.range && this.plan.targets.length) {if(!this._pausing) this.startNextLoop();}
        else this.endRound('complete');
      }
    },
    startNextLoop() {
      const finished=this.practice;
      this.pause();
      const counts=Object.assign({},this.completedLoopCounts);
      Object.keys(counts).forEach(key=>{counts[key]+=finished.toneCounts[key];});
      this.completedLoopCounts=counts;this.completedLoopActiveMs+=finished.activeMs;this.loopPass++;
      this.practice=createWorkshopPractice(this.plan,{behavior:this.behavior});
      this.toggle();
    },
    exitFullscreen() {
      const listening=this.$refs.listening;
      return !!(listening && typeof listening.exitFullscreen === 'function' && listening.exitFullscreen());
    },
    endRound(reason='manual') {
      if (this.roundResult) return;
      this.pause(); if (this.roundResult) return;
      this.exitFullscreen();
      const counts=Object.assign({},this.completedLoopCounts);
      Object.keys(counts).forEach(key=>{counts[key]+=this.practice.toneCounts[key];});
      this.roundResult=Object.freeze({reason,behavior:this.behavior,startPositionMs:this.roundStartPosition,
        endPositionMs:this.practice.positionMs,durationMs:this.completedLoopActiveMs+this.practice.activeMs,counts:Object.freeze(counts),
        tempoPercent:this.tempoPercent,range:this.plan.range,loopPass:this.loopPass});
      this.$nextTick(() => {
        if (!this._practiceDisposed && this.roundResult && this.$refs.resultHeading) this.$refs.resultHeading.focus({preventScroll:true});
      });
    },
    repeatRound() {
      if (!this.roundResult) return;
      const position=this.roundResult.startPositionMs;
      this.pause(); this.resetSection(position); this.toggle();
    },
    adjustRound() {
      if(!this.roundResult) return;
      const position=this.roundResult.startPositionMs;
      this.pause();this.resetSection(position);this.settingsOpen=true;
      this.$nextTick(()=>{
        const listening=this.$refs.listening;
        if(!this._practiceDisposed && listening && typeof listening.focusSettings === 'function') listening.focusSettings();
      });
    },
    pitchLabel(value) {
      const pitch=((value%12)+12)%12;
      return Utils.getDisplayNoteNamesArray(true,Options.noteNaming)[pitch]+Math.floor(value/12);
    },
    noteLabel(event) { return event.pitch ? this.pitchLabel(workshopPitchValue(event.pitch)) : event.kind; },
    handleMidiConnection(connected) {
      this.midiConnected=connected === true;
      if (!this.midiConnected) this.pause();
    },
    visibilityChanged() { if (document.hidden) this.pause(); },
    back() {
      if (this.exitFullscreen()) return;
      if (this.roundStarted && !this.roundResult) { this.endRound(); return; }
      this.pause(); this.$emit('back');
    }
  }
};
</script>

<style scoped>
.workshop-practice {min-width:0;color:#29464f;}
.practice-settings {display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
fieldset {display:flex;gap:8px;flex-wrap:wrap;border:0;padding:0;margin:0;}legend {font-size:.78rem;font-weight:700;color:#64828a;margin-bottom:8px;}
button {font:inherit;color:#365a64;border:1px solid #d1dfe1;border-radius:11px;background:#fffaf3;min-height:44px;padding:10px 14px;cursor:pointer;font-size:.84rem;}
button[aria-pressed="true"] {background:#2c7b8b;color:#fff;border-color:#2c7b8b;}
button:disabled {cursor:default;opacity:.55;}button:focus-visible {outline:3px solid #dc6a38;outline-offset:2px;}
.practice-tempo {display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:16px;}.practice-tempo label {display:grid;grid-template-columns:1fr auto;flex:1 1 160px;gap:6px;font-size:.8rem;font-weight:600;}.practice-tempo output {color:#64828a;font-variant-numeric:tabular-nums;}.practice-tempo input {grid-column:1/-1;width:100%;margin:0;min-height:36px;accent-color:#2c7b8b;}.practice-tempo button {font-size:.75rem;}
.practice-hands {margin-top:16px;}.practice-hands button {flex:1 1 90px;}
.practice-section {margin-top:14px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;}.section-switch {display:flex;align-items:center;gap:8px;min-height:44px;font-size:.8rem;}.section-switch input {width:18px;height:18px;margin:0;accent-color:#2c7b8b;}.practice-tempo input:focus-visible,.practice-section input:focus-visible {outline:3px solid #dc6a38;outline-offset:2px;}
.section-loop {display:flex;align-items:center;gap:8px;text-align:left;}.section-loop svg {width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}.section-loop small {display:block;margin-top:3px;}
.practice-notice {font-size:.82rem;line-height:1.5;color:#9b5033;background:#fff3e5;border-radius:10px;padding:12px;}
.practice-result {padding:clamp(12px,3vw,24px);}.result-kicker {color:#64828a;font-size:.72rem;font-weight:700;}.practice-result h2 {font-size:clamp(1.2rem,4vw,1.6rem);margin:6px 0;}.result-piece {overflow-wrap:anywhere;font-weight:600;}
.practice-result p {font-size:.84rem;line-height:1.5;color:#64828a;}.result-counts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:20px 0;}.result-counts > div {min-width:0;border:1px solid #dbe6e5;border-radius:12px;padding:12px;background:#f6faf9;}.result-counts dt {font-size:.8rem;color:#64828a;line-height:1.35;}.result-counts dd {font-size:1.5rem;font-weight:700;margin:5px 0 0;}
.result-actions {display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;}.result-actions button {flex:1 1 130px;}.result-again {background:#2c7b8b;color:#fff;border-color:#2c7b8b;}
.result-tip {border-radius:12px;padding:12px;background:#eef7f5;}.result-tip strong {font-size:.8rem;}.result-tip p {margin:6px 0 0;}.result-context {font-variant-numeric:tabular-nums;}
@media(max-width:420px) {.practice-settings button {padding:10px;}}
</style>
