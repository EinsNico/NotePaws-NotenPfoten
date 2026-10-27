import { appVolumeToAudioLevel } from './AppVolume';
import { getAppAudioDestination } from './AppSound';

const EPSILON = 0.0001;
const CLICK_SECONDS = .055;

/** Schedule optional practice clicks on the shared WebAudio clock. */
export function createWorkshopPracticeMetronome(timeline, options = {}) {
  const beats=(timeline.beats || []).filter(beat=>Number.isFinite(beat.startMs) && beat.startMs>=0).slice().sort((a,b)=>a.startMs-b.startMs);
  const getContext=options.getContext || (()=>options.context || null);
  const getVolume=options.getVolume || (()=>options.volume === undefined ? 100 : options.volume);
  const schedule=options.setTimeoutFn || setTimeout,cancel=options.clearTimeoutFn || clearTimeout;
  const sources=new Set(),lookAheadSeconds=.15,refillMs=40;
  let context=null,timer=null,generation=0,active=false,waiting=false,disposed=false;
  let originPosition=0,audibleOrigin=0,position=0,nextIndex=0,limitMs=Infinity,delayMs=0;

  function normalizedDelay(value) {
    const number=Number(value);return Number.isFinite(number) ? Math.max(0,Math.min(1000,number)) : 0;
  }
  function readContext() {try {return getContext();} catch(error) {return null;} }
  function supported(value) {
    return value && Number.isFinite(value.currentTime) && typeof value.createOscillator==='function'
      && typeof value.createGain==='function' && (!value.state || value.state==='running');
  }
  function lowerBound(at) {
    let left=0,right=beats.length;
    while(left<right) {const middle=(left+right)>>>1;if(beats[middle].startMs<at-EPSILON)left=middle+1;else right=middle;}
    return left;
  }
  function release(entry) {
    if(!sources.delete(entry))return;
    entry.source.onended=null;
    try {entry.source.stop();} catch(error) { /* A scheduled click may already have ended. */ }
    entry.source.disconnect();entry.gain.disconnect();
  }
  function clearRefill() {generation++;if(timer!==null)cancel(timer);timer=null;}
  function stop() {clearRefill();active=false;waiting=false;Array.from(sources).forEach(release);}
  function fail(error) {
    stop();if(typeof options.onError==='function')options.onError(error);
  }
  function pulse(beat,index,at) {
    const volume=.16*appVolumeToAudioLevel(getVolume());if(volume<=0)return;
    const source=context.createOscillator(),gain=context.createGain(),accent=beat.accent===true;
    const entry={source,gain,index,positionMs:beat.startMs,end:at+CLICK_SECONDS};
    sources.add(entry);
    source.onended=()=>release(entry);
    source.type='sine';source.frequency.setValueAtTime(accent ? 1100 : 720,at);
    source.frequency.exponentialRampToValueAtTime(accent ? 600 : 400,entry.end);
    gain.gain.setValueAtTime(volume,at);gain.gain.exponentialRampToValueAtTime(.001,entry.end);
    source.connect(gain);gain.connect(getAppAudioDestination(context));
    source.start(at);source.stop(entry.end);
  }
  function queue() {
    if(!active || waiting || disposed)return;
    if(readContext()!==context || !supported(context)) {stop();return;}
    const now=context.currentTime;
    Array.from(sources).forEach(entry=>{if(entry.end<now)release(entry);});
    try {
      while(nextIndex<beats.length) {
        const beat=beats[nextIndex];if(beat.startMs>limitMs+EPSILON)break;
        const at=audibleOrigin+(beat.startMs-originPosition-delayMs)/1000;
        if(at>now+lookAheadSeconds)break;
        const index=nextIndex++;
        // An unpredictable wait release or long device stall cannot make a
        // buffered output click arrive retroactively. Omit that pulse instead
        // of sounding it late and making an on-time MIDI input seem early.
        if(at<now-.005)continue;
        pulse(beat,index,Math.max(now,at));
      }
    } catch(error) {fail(error);return;}
    if(nextIndex<beats.length && beats[nextIndex].startMs<=limitMs+EPSILON) {
      const run=generation;
      timer=schedule(()=>{if(run!==generation)return;timer=null;queue();},refillMs);
    }
  }
  function bound(value) {return typeof value==='number' && !Number.isNaN(value) ? Math.max(0,value) : Infinity;}
  function start(positionMs, settings = {}) {
    stop();if(disposed || !Number.isFinite(positionMs))return false;
    context=readContext();if(!supported(context) || !beats.length)return false;
    position=originPosition=Math.max(0,positionMs);
    audibleOrigin=Number.isFinite(settings.audibleAtSeconds) ? settings.audibleAtSeconds : context.currentTime;
    delayMs=normalizedDelay(settings.delayMs === undefined ? options.delayMs : settings.delayMs);
    limitMs=bound(settings.limitMs);nextIndex=lowerBound(position);active=true;queue();return active;
  }
  function update(positionMs, settings = {}) {
    if(!active || disposed || !Number.isFinite(positionMs))return false;
    if(readContext()!==context || !supported(context)) {stop();return false;}
    if(positionMs<position-EPSILON)return start(positionMs,{delayMs,limitMs:settings.limitMs});
    const wasWaiting=waiting;position=Math.max(0,positionMs);limitMs=bound(settings.limitMs);
    waiting=settings.waiting===true;clearRefill();
    if(waiting) {
      // The pulse at the wait target may be the just-started initial click.
      // Let it finish; only queued pulses beyond the frozen play line stop.
      Array.from(sources).forEach(entry=>{
        if(entry.positionMs>position+EPSILON) {nextIndex=Math.min(nextIndex,entry.index);release(entry);}
      });
      return true;
    }
    if(wasWaiting) {originPosition=position;audibleOrigin=context.currentTime;}
    queue();return active;
  }
  return {start,update,stop,destroy() {stop();disposed=true;}};
}
