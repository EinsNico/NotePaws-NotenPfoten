<template>
  <section class="workshop-sheet">
    <div ref="toolbar" class="sheet-toolbar" :class="{ 'following-playback':followPlayback }">
      <h3>{{$t('WORKSHOP_SHEET_TITLE')}}</h3>
      <div class="sheet-pages">
        <button v-if="followPlayback" type="button" class="sheet-stop" @click="$emit('stop-playback')">■ {{$t('WORKSHOP_STOP')}}</button>
        <button type="button" :disabled="pageIndex === 0" @click="changePage(-1)" :aria-label="$t('WORKSHOP_SHEET_PREV')">‹</button>
        <span aria-live="polite">{{$t('WORKSHOP_SHEET_PAGE', { page:pageIndex+1, pages:pageCount })}}</span>
        <button type="button" :disabled="pageIndex+1 === pageCount" @click="changePage(1)" :aria-label="$t('WORKSHOP_SHEET_NEXT')">›</button>
      </div>
    </div>
    <WorkshopZoomViewport ref="zoomViewport" :zoom="zoom" :aria-label="$t('WORKSHOP_SCORE_EDITOR')">
    <div class="score-paper" :style="paperStyle">
    <div v-if="pageIndex === 0 && (title || metadata)" class="score-heading" :style="scoreFontStyle">
      <h2 v-if="title || metadata.title">{{title || metadata.title}}</h2><p v-if="metadata && metadata.subtitle" class="score-subtitle">{{metadata && metadata.subtitle}}</p>
      <p v-if="metadata && (metadata.composer || metadata.arranger)" class="score-credits"><span>{{metadata.composer}}</span><span v-if="metadata.arranger">{{metadata.arranger}}</span></p>
      <p v-if="metadata && metadata.lyricist" class="score-lyricist">{{metadata.lyricist}}</p>
    </div>
    <p class="sheet-hint">{{$t('WORKSHOP_SHEET_EDIT_HINT')}}</p>
    <svg v-for="system in systems" :key="system.firstBar" class="sheet-system" :style="Object.assign({},scoreFontStyle,{marginBottom:(scoreLayout.systemDistance === undefined ? 14 : scoreLayout.systemDistance)+'px'})" :viewBox="'0 0 '+system.width+' '+system.height"
      role="group" :aria-label="$t('WORKSHOP_SCORE_EDITOR')">
      <rect x="0" y="0" :width="system.width" :height="system.height" rx="8" class="system-paper" />
      <g v-for="(frame,index) in system.frames" :key="'lines-'+index" aria-hidden="true">
        <line v-for="y in [76,96,116,136,156]" :key="y" :x1="system.braceSpace+12" :x2="system.width-12"
          :y1="frame.y+y-frame.top" :y2="frame.y+y-frame.top" class="system-line" />
      </g>
      <g v-for="bar in system.bars" :key="bar.index" class="sheet-bar" :class="{ active:bar.index === activeBar }"
        :data-playback-bar="bar.index"
        role="button" tabindex="0" :aria-label="$t('WORKSHOP_BAR', { number:bar.index+1 })"
        :aria-current="bar.index === activeBar ? 'true' : null" @click="selectBar(bar.index)" @keydown="barKeyDown($event,bar.index)">
        <rect :x="bar.x" y="0" :width="bar.width" :height="system.height" class="bar-highlight" />
        <text :x="bar.x+14" y="17" class="bar-number">{{bar.index+1}}</text>
        <WorkshopStaff v-for="(part,index) in bar.parts" :key="part.partIndex" :measure="part.measure" :clef="part.context.clef" :clef-octave="part.context.clefOctave || 0"
          :meter="part.context.meter" :key-id="part.context.keyId" :previous-key-id="part.previousKeyId" :dynamic="part.context.dynamic"
          :show-clef="part.showClef" :show-key="part.showKey" :show-meter="part.showMeter" :show-dynamic="part.showDynamic"
          :frame-top="system.frames[index].top" :frame-bottom="system.frames[index].bottom" :header-left="bar.headerLeft" :frame-width="bar.width" :horizontal-columns="bar.spacing.columns"
          :staff-index="part.partIndex" :companion-measure="part.companionMeasure" :cross-staff-beam-ids="bar.crossStaff.groupIds" :cross-staff-relation-ids="bar.crossStaff.relationIds" :direction-spans="part.directionSpans"
          :ties="part.ties" :slurs="part.slurs" :glissandos="part.glissandos" :tremolos="part.tremolos" :lyric-verse-numbers="part.lyricVerseNumbers" :source-lyric-verse-numbers="part.sourceLyricVerseNumbers" :bar-index="bar.index" :note-label="noteLabel" :active-event-ids="activeEventIds"
          :read-only="true" :compact="true" :x="bar.x" :y="system.frames[index].y" :width="bar.width" :height="system.frames[index].height"
          :style="{ width:bar.width+'px',height:system.frames[index].height+'px',maxWidth:'none',margin:0 }" />
      </g>
      <g v-for="bar in system.bars" :key="'cross-beams-'+bar.index" class="cross-staff-notation" aria-hidden="true">
        <line v-for="stem in bar.crossStaff.stems" :key="'cross-stem-'+stem.id" :x1="stem.x" :x2="stem.x" :y1="stem.y1" :y2="stem.y2" class="cross-staff-stem" />
        <path v-for="curve in bar.crossStaff.curves" :key="'cross-curve-'+curve.id" :d="curve.path" class="cross-staff-curve" :class="{'cross-staff-tremolo':curve.kind === 'tremolo'}" :data-connection="curve.kind" />
        <polygon v-for="beam in bar.crossStaff.beams" :key="'cross-beam-'+beam.id" :points="beam.points" class="cross-staff-beam" :data-beam-level="beam.level" />
      </g>
      <path v-if="system.frames.length > 1" :d="bracePath(system)" class="system-brace" aria-hidden="true" />
      <line v-for="x in system.barLines" :key="'barline-'+x" :x1="x" :x2="x" :y1="system.topLine" :y2="system.bottomLine" class="system-line" aria-hidden="true" />
    </svg>
    <p v-if="metadata && metadata.copyright" class="score-copyright">{{metadata.copyright}}</p>
    </div>
    </WorkshopZoomViewport>
  </section>
</template>

<script>
import WorkshopStaff from "./WorkshopStaff";
import WorkshopZoomViewport from "./WorkshopZoomViewport";
import { createWorkshopSheetSystems } from "./WorkshopSheetLayout";
const PAGE_BARS=24;
function rangesForScore(score) {
  const count=score.parts[0].measures.length,breakIds=new Set(score.layout && score.layout.pageBreaks || []),ranges=[];
  let start=0;
  for (let index=1;index<=count;index++) if (index === count || index-start >= PAGE_BARS || breakIds.has(score.parts[0].measures[index].id)) {ranges.push({start,end:index});start=index;}
  return ranges.length ? ranges : [{start:0,end:0}];
}

function visibleBounds(element) {
  if (typeof window === "undefined") return null;
  const viewport=window.visualViewport,root=typeof document !== "undefined" && document.documentElement;
  const top=viewport ? viewport.offsetTop : 0,left=viewport ? viewport.offsetLeft : 0;
  const height=viewport ? viewport.height : window.innerHeight || root && root.clientHeight;
  const width=viewport ? viewport.width : window.innerWidth || root && root.clientWidth;
  if (!(height > 0 && width > 0)) return null;
  const bounds={top,bottom:top+height,left,right:left+width};
  // The sheet can live in the app's scrolling pane rather than in the window.
  // Account for each clipping parent before deciding whether scrolling is needed.
  for (let parent=element.parentElement;parent;parent=parent.parentElement) {
    if (!window.getComputedStyle || !parent.getBoundingClientRect) continue;
    const style=window.getComputedStyle(parent),rect=parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow || "")) {
      bounds.top=Math.max(bounds.top,rect.top);bounds.bottom=Math.min(bounds.bottom,rect.bottom);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow || "")) {
      bounds.left=Math.max(bounds.left,rect.left);bounds.right=Math.min(bounds.right,rect.right);
    }
  }
  return bounds.bottom > bounds.top && bounds.right > bounds.left ? bounds : null;
}
export default {
  name:"WorkshopSheet",components:{ WorkshopStaff,WorkshopZoomViewport },
  props:{ score:{ type:Object,required:true },title:{type:String,default:""},noteNaming:{ type:String,default:"german" },
    noteLabel:{ type:Function,default:event => event.kind },activeEventIds:{ type:Array,default:() => [] },activeBar:{ type:Number,default:null },
    followPlayback:{type:Boolean,default:false},zoom:{type:Number,default:1} },
  data() { return { pageIndex:Number.isInteger(this.activeBar) && this.activeBar >= 0 && this.activeBar < this.score.parts[0].measures.length
    ? Math.max(0,rangesForScore(this.score).findIndex(range => this.activeBar >= range.start && this.activeBar < range.end)) : 0,availableWidth:900,observer:null }; },
  computed:{
    metadata() { return this.score.metadata || null; },
    scoreLayout() { return this.score.layout || {}; },
    scoreFontStyle() { return { fontFamily:this.scoreLayout.fontFamily || undefined,fontSize:this.scoreLayout.fontSize === undefined ? undefined : this.scoreLayout.fontSize+'px',
      '--workshop-score-font':this.scoreLayout.fontFamily || 'Georgia,serif' }; },
    paperStyle() {
      const layout=this.scoreLayout,width=layout.pageWidth || 1000;
      return Object.assign({},this.scoreFontStyle,{ paddingLeft:Math.min(20,(layout.marginLeft || 0)/width*100)+'%',paddingRight:Math.min(20,(layout.marginRight || 0)/width*100)+'%',
        paddingTop:layout.marginTop === undefined ? undefined : Math.min(80,layout.marginTop)+'px',paddingBottom:layout.marginBottom === undefined ? undefined : Math.min(80,layout.marginBottom)+'px',
        minHeight:layout.pageHeight ? Math.min(2000,this.availableWidth*layout.pageHeight/width)+'px' : undefined });
    },
    barCount() { return this.score.parts[0].measures.length; },
    pageRanges() { return rangesForScore(this.score); },
    pageCount() { return this.pageRanges.length; },
    barsPerSystem() { return Math.max(1,Math.min(this.scoreLayout.barsPerSystem || 4,Math.floor(this.availableWidth/280))); },
    activeParts() { return this.score.parts.map((part,index) => ({ part,index })).filter(item => item.part.enabled !== false); },
    systems() { return createWorkshopSheetSystems(this); }
  },
  watch:{
    score() { this.pageIndex=Math.min(this.pageIndex,this.pageCount-1);this.queuePlaybackScroll(); },
    activeBar(value) { if (Number.isInteger(value) && value >= 0 && value < this.barCount) this.pageIndex=this.pageRanges.findIndex(range => value >= range.start && value < range.end);this.queuePlaybackScroll(); },
    followPlayback(value) {
      if (!value) { this.cancelPlaybackScroll();return; }
      if (Number.isInteger(this.activeBar) && this.activeBar >= 0 && this.activeBar < this.barCount) this.pageIndex=this.pageRanges.findIndex(range => this.activeBar >= range.start && this.activeBar < range.end);
      this.queuePlaybackScroll();
    },
    activeEventIds() { this.queuePlaybackScroll(); },
    availableWidth() { this.queuePlaybackScroll(); },
    zoom() { this.queuePlaybackScroll(); }
  },
  mounted() {
    if (Number.isInteger(this.activeBar)) this.pageIndex=Math.max(0,this.pageRanges.findIndex(range => this.activeBar >= range.start && this.activeBar < range.end));
    this.updateWidth();
    if (typeof ResizeObserver !== "undefined") { this.observer=new ResizeObserver(this.updateWidth); this.observer.observe(this.$el); }
    else if (typeof window !== "undefined") window.addEventListener("resize",this.updateWidth);
    this.queuePlaybackScroll();
  },
  beforeDestroy() {
    this._followDestroyed=true;this.cancelPlaybackScroll();
    if (this.observer) this.observer.disconnect();
    else if (typeof window !== "undefined") window.removeEventListener("resize",this.updateWidth);
  },
  methods:{
    cancelPlaybackScroll() { this._followRequest=(this._followRequest || 0)+1; },
    queuePlaybackScroll() {
      this.cancelPlaybackScroll();
      if (!this.followPlayback || this._followDestroyed || !Number.isInteger(this.activeBar) || this.activeBar < 0 || this.activeBar >= this.barCount) return;
      const request=this._followRequest;
      this.$nextTick(() => {
        if (this.followPlayback && !this._followDestroyed && this._followRequest === request) this.revealPlayingBar();
      });
    },
    revealPlayingBar() {
      if (!this.followPlayback || this._followDestroyed || !this.$el || !Number.isInteger(this.activeBar) || this.activeBar < 0 || this.activeBar >= this.barCount) return;
      const bar=this.$el.querySelector('[data-playback-bar="'+this.activeBar+'"]');
      if (!bar || !bar.getBoundingClientRect) return;
      const bounds=this.playbackVisibleBounds(bar);if (!bounds) return;
      let target=bar,rect=bar.getBoundingClientRect(),oversized=rect.height > bounds.bottom-bounds.top;
      if (oversized) {
        const head=bar.querySelector('g.playing .note-head');
        if (head) { target=head;rect=head.getBoundingClientRect(); }
        else if (rect.top < bounds.bottom && rect.bottom > bounds.top) return;
      }
      if (rect.top >= bounds.top-1 && rect.bottom <= bounds.bottom+1 && rect.left >= bounds.left-1 && rect.right <= bounds.right+1) return;
      if (typeof target.scrollIntoView === "function") {
        // Instant movement also respects reduced motion and cannot continue after
        // playback stops, unlike a queued smooth scroll at every note or repeat.
        target.scrollIntoView({block:oversized && target === bar ? "start" : "nearest",inline:"nearest",behavior:"instant"});
        const after=this.playbackVisibleBounds(target),position=target.getBoundingClientRect();
        if (after && position.top < after.top && position.height <= after.bottom-after.top) this.scrollPlaybackBy(target,position.top-after.top);
      }
    },
    playbackVisibleBounds(element) {
      const bounds=visibleBounds(element),toolbar=this.$refs.toolbar;
      if (bounds && toolbar && toolbar.getBoundingClientRect) {
        const rect=toolbar.getBoundingClientRect();
        if (rect.top <= bounds.top+1 && rect.bottom > bounds.top) bounds.top=rect.bottom;
      }
      return bounds && bounds.bottom > bounds.top ? bounds : null;
    },
    scrollPlaybackBy(element,delta) {
      for (let parent=element.parentElement;parent;parent=parent.parentElement) {
        const style=window.getComputedStyle && window.getComputedStyle(parent);
        if (style && /(auto|scroll)/.test(style.overflowY || style.overflow || "") && parent.scrollHeight > parent.clientHeight) {
          parent.scrollTop+=delta;return;
        }
      }
      if (window.scrollBy) window.scrollBy({top:delta,left:0,behavior:"instant"});
    },
    updateWidth() { const width=this.$el && this.$el.getBoundingClientRect().width; if (width > 0) this.availableWidth=width; },
    changePage(delta) { this.pageIndex=Math.max(0,Math.min(this.pageCount-1,this.pageIndex+delta)); },
    selectBar(index) { this.$emit("select-bar",index); },
    barKeyDown(event,index) { if (["Enter"," "].includes(event.key)) { event.preventDefault(); this.selectBar(index); } },
    bracePath(system) {
      const top=system.topLine,bottom=system.bottomLine,middle=(top+bottom)/2;
      return "M 18 "+top+" C 4 "+top+" 10 "+(middle-16)+" 3 "+middle+" C 10 "+(middle+16)+" 4 "+bottom+" 18 "+bottom;
    }
  }
};
</script>

<style scoped>
.workshop-sheet { min-width:0; }.score-paper { box-sizing:border-box;background:#fffdf7; }.sheet-toolbar { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.sheet-toolbar h3 { margin:0; }.sheet-pages { display:flex; align-items:center; gap:8px; font-size:12px; }
.sheet-toolbar.following-playback { position:sticky;top:0;z-index:3;background:#fffdf7;padding:10px 0;border-bottom:1px solid #d5dfdd; }
.sheet-pages button { min-width:42px; min-height:42px; border:1px solid #d5dfdd; border-radius:9px; background:#fffaf2; color:#29464d; font-size:24px; }
.sheet-pages .sheet-stop { padding:8px 12px;font-size:12px;font-weight:700;border-color:#bb643e;color:#9d4826; }
.sheet-pages button:disabled { opacity:.4; }.sheet-hint { margin:8px 0 14px; font-size:12px; color:#668084; }
.sheet-system { display:block; width:100%; margin:0 0 14px; overflow:visible; color:#29464d; }
.system-paper { fill:#fffdf7; }.system-line { stroke:#9baeb0; stroke-width:1; }
.score-heading h2 { margin:10px 0 4px;text-align:center; }.score-subtitle { margin:0;text-align:center; }
.score-credits { display:flex;justify-content:flex-end;gap:12px;margin:8px 0;font-size:14px; }.score-lyricist { text-align:right;font-size:13px; }.score-copyright { text-align:center;font-size:11px;color:#668084; }
.cross-staff-notation { pointer-events:none; }.cross-staff-stem { stroke:currentColor;stroke-width:1.7; }.cross-staff-curve {fill:none;stroke:currentColor;stroke-width:1.8;}.cross-staff-beam { fill:currentColor; }
.cross-staff-tremolo { fill:currentColor;stroke:none; }
.system-brace { stroke:currentColor; stroke-width:2.3; fill:none; }.bar-number { fill:#668084; font:11px sans-serif; }
.bar-highlight { fill:transparent; stroke:transparent; }.sheet-bar { cursor:pointer; outline:none; }
.sheet-bar.active .bar-highlight,.sheet-bar:focus .bar-highlight { fill:#ee8b3018; stroke:#d97939; stroke-width:1; }
</style>
