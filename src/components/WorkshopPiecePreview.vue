<template>
  <div class="workshop-piece-preview" aria-hidden="true">
    <svg v-if="system" class="preview-system" :viewBox="'0 0 '+visibleWidth+' '+system.height" preserveAspectRatio="xMinYMid meet" focusable="false">
      <g v-for="bar in system.bars" :key="bar.index">
        <WorkshopStaff v-for="(part,index) in bar.parts" :key="part.partIndex" :measure="part.measure" :clef="part.context.clef" :clef-octave="part.context.clefOctave || 0"
          :meter="part.context.meter" :key-id="part.context.keyId" :previous-key-id="part.previousKeyId" :dynamic="part.context.dynamic"
          :show-clef="part.showClef" :show-key="part.showKey" :show-meter="part.showMeter" :show-dynamic="part.showDynamic"
          :frame-top="system.frames[index].top" :frame-bottom="system.frames[index].bottom" :header-left="bar.headerLeft" :frame-width="bar.width" :horizontal-columns="bar.spacing.columns"
          :staff-index="part.partIndex" :companion-measure="part.companionMeasure" :cross-staff-beam-ids="bar.crossStaff.groupIds" :cross-staff-relation-ids="bar.crossStaff.relationIds" :direction-spans="part.directionSpans"
          :ties="part.ties" :slurs="part.slurs" :glissandos="part.glissandos" :tremolos="part.tremolos" :lyric-verse-numbers="part.lyricVerseNumbers" :source-lyric-verse-numbers="part.sourceLyricVerseNumbers" :bar-index="bar.index"
          :read-only="true" :compact="true" :x="bar.x" :y="system.frames[index].y" :width="bar.width" :height="system.frames[index].height"
          :style="{width:bar.width+'px',height:system.frames[index].height+'px',maxWidth:'none',margin:0}" />
      </g>
      <g v-for="bar in system.bars" :key="'cross-'+bar.index" class="cross-staff-notation">
        <line v-for="stem in bar.crossStaff.stems" :key="'stem-'+stem.id" :x1="stem.x" :x2="stem.x" :y1="stem.y1" :y2="stem.y2" class="cross-staff-stem" />
        <path v-for="curve in bar.crossStaff.curves" :key="'curve-'+curve.id" :d="curve.path" class="cross-staff-curve" :class="{'cross-staff-tremolo':curve.kind === 'tremolo'}" />
        <polygon v-for="beam in bar.crossStaff.beams" :key="'beam-'+beam.id" :points="beam.points" class="cross-staff-beam" />
      </g>
      <path v-if="system.frames.length > 1" :d="bracePath(system)" class="system-brace" />
      <line v-for="x in system.barLines" :key="x" :x1="x" :x2="x" :y1="system.topLine" :y2="system.bottomLine" class="system-line" />
    </svg>
  </div>
</template>

<script>
import WorkshopStaff from "./WorkshopStaff";
import { createWorkshopSheetSystems } from "./WorkshopSheetLayout";
import { createWorkshopPiecePreviewScore,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES,workshopPiecePreviewMeasureCount } from "../model/WorkshopPiecePreview";

const PREVIEW_CONTENT_HEIGHT=134,PREVIEW_HORIZONTAL_PADDING=16;

export default {
  name:"WorkshopPiecePreview",components:{WorkshopStaff},
  props:{score:{type:Object,required:true}},
  data() { return {previewRevision:0,availableWidth:0}; },
  computed:{
    system() { return this.previewRevision ? this._previewSystem : null; },
    // Widen the engraving window, rather than stretching a fixed two-bar image.
    // A short piece keeps the same note size and leaves unused space at the right.
    visibleWidth() { return this.previewWindowWidth(this.system); }
  },
  // Saved library revisions are replaced after editing, rather than mutated in
  // place. Build outside Vue's render watcher to avoid subscribing every card
  // to every event in a long imported score's reactive arrays.
  created() { this.rebuildPreview(); },
  watch:{score:"rebuildPreview"},
  mounted() {
    this.updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      this._previewObserver=new ResizeObserver(this.queueWidthUpdate);this._previewObserver.observe(this.$el);
    } else {
      if (typeof window !== "undefined") window.addEventListener("resize",this.queueWidthUpdate);
      // Older WebViews also need to notice a hidden library becoming visible,
      // even when no window resize occurred. Only observe ancestor attributes.
      if (typeof MutationObserver !== "undefined") {
        this._previewMutationObserver=new MutationObserver(this.queueWidthUpdate);
        for(let ancestor=this.$el && this.$el.parentElement;ancestor;ancestor=ancestor.parentElement)
          this._previewMutationObserver.observe(ancestor,{attributes:true,attributeFilter:["class","style"]});
      }
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange",this.queueWidthUpdate);
  },
  beforeDestroy() {
    this._previewDestroyed=true;
    if (this._previewObserver) this._previewObserver.disconnect();
    if (this._previewMutationObserver) this._previewMutationObserver.disconnect();
    if (typeof window !== "undefined") window.removeEventListener("resize",this.queueWidthUpdate);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange",this.queueWidthUpdate);
    if (this._previewResizeFrame !== undefined) {
      if (this._previewUsesAnimationFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._previewResizeFrame);
      else clearTimeout(this._previewResizeFrame);
      this._previewResizeFrame=undefined;
    }
  },
  methods:{
    rebuildPreview() {
      this._previewSystem=this.createPreviewSystem(2);
      this.extendPreview();this.previewRevision++;
    },
    createPreviewSystem(count) {
      const score=createWorkshopPiecePreviewScore(this.score,count);
      const activeParts=score ? score.parts.map((part,index)=>({part,index})).filter(item=>item.part.enabled !== false) : [];
      const system=activeParts.length ? createWorkshopSheetSystems({score,scoreLayout:{},pageRanges:[{start:0,end:score.parts[0].measures.length}],
        pageIndex:0,barsPerSystem:score.parts[0].measures.length,activeParts,continuous:true})[0] : null;
      return system ? Object.freeze(system) : null;
    },
    previewWindowWidth(system) {
      if (!system) return 360;
      return this.availableWidth > 0 ? Math.max(1,this.availableWidth-PREVIEW_HORIZONTAL_PADDING)*system.height/PREVIEW_CONTENT_HEIGHT
        : Math.min(system.width,Math.max(360,system.height*2.5));
    },
    extendPreview() {
      let system=this._previewSystem;
      while (system && this.availableWidth > 0 && system.width < this.previewWindowWidth(system)
        && system.bars.length < MAX_WORKSHOP_PIECE_PREVIEW_MEASURES) {
        // Estimate from actual engraved widths; dense opening bars do not make
        // a narrow card read many invisible measures. At most 16 bars are ever
        // copied or engraved, irrespective of the saved piece's total length.
        const count=workshopPiecePreviewMeasureCount(Math.max(system.bars.length+1,
          Math.ceil(system.bars.length*this.previewWindowWidth(system)/system.width)));
        const expanded=this.createPreviewSystem(count);
        if (!expanded || expanded.bars.length <= system.bars.length) break;
        system=expanded;
      }
      this._previewSystem=system;
    },
    queueWidthUpdate() {
      if (this._previewDestroyed || this._previewResizeFrame !== undefined) return;
      const update=()=>{this._previewResizeFrame=undefined;this.updateWidth();};
      this._previewUsesAnimationFrame=typeof requestAnimationFrame === "function";
      this._previewResizeFrame=this._previewUsesAnimationFrame ? requestAnimationFrame(update) : setTimeout(update,16);
    },
    updateWidth() {
      if (this._previewDestroyed) return;
      const width=Math.round(this.$el && this.$el.clientWidth || 0);
      // An invisible card must retain its last useful engraving, not rebuild
      // against a zero-size container while changing app sections.
      if (!(width > 0) || width === this.availableWidth) return;
      this.availableWidth=width;
      const previous=this._previewSystem;this.extendPreview();
      if (previous !== this._previewSystem) this.previewRevision++;
    },
    bracePath(system) {
      const top=system.topLine,bottom=system.bottomLine,middle=(top+bottom)/2;
      return "M 18 "+top+" C 4 "+top+" 10 "+(middle-16)+" 3 "+middle+" C 10 "+(middle+16)+" 4 "+bottom+" 18 "+bottom;
    }
  }
};
</script>

<style scoped>
.workshop-piece-preview { height:144px;min-width:0;overflow:hidden;border:1px solid #e3e8e5;border-radius:11px;background:#fffdf7;color:#29464d;pointer-events:none; }
.preview-system { display:block;width:100%;height:100%;overflow:hidden;padding:5px 8px;box-sizing:border-box; }
.system-line {stroke:#9baeb0;stroke-width:1;}.system-brace {stroke:currentColor;stroke-width:2.3;fill:none;}
.cross-staff-stem {stroke:currentColor;stroke-width:1.7;}.cross-staff-curve {fill:none;stroke:currentColor;stroke-width:1.8;}
.cross-staff-beam,.cross-staff-tremolo {fill:currentColor;}.cross-staff-tremolo {stroke:none;}
</style>
