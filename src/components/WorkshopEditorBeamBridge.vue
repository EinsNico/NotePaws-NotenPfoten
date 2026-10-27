<template>
  <svg class="workshop-editor-beam-bridge" :style="{'--workshop-bridge-scale':screenScale}" :viewBox="'0 0 '+width+' '+height" aria-hidden="true" focusable="false">
    <line v-for="stem in overlay.stems" :key="'stem-'+stem.id" :x1="stem.x" :x2="stem.x" :y1="stem.y1" :y2="stem.y2" class="bridge-stem"
      :class="{selected:stem.eventIds.some(isSelected),playing:stem.eventIds.some(id => activeEventIds.includes(id))}" />
    <path v-for="curve in overlay.curves" :key="'curve-'+curve.id" :d="curve.path" class="bridge-curve" :data-connection="curve.kind"
      :class="{tremolo:curve.kind === 'tremolo',selected:curve.eventIds.some(isSelected),playing:curve.eventIds.some(id => activeEventIds.includes(id))}" />
    <polygon v-for="beam in overlay.beams" :key="'beam-'+beam.id" :points="beam.points" class="bridge-beam" :data-beam-level="beam.level"
      :class="{selected:beam.eventIds.some(isSelected),playing:beam.eventIds.some(id => activeEventIds.includes(id))}" />
  </svg>
</template>
<script>
import { layoutWorkshopCrossStaffBeams,layoutWorkshopCrossStaffCurves } from "../model/WorkshopBeamLayout";
import { layoutWorkshopCrossStaffConnections } from "../model/WorkshopConnectionLayout";
export default {
  name:"WorkshopEditorBeamBridge",
  props:{ score:{type:Object,required:true},barIndex:{type:Number,default:0},getStaffs:{type:Function,required:true},displayZoom:{type:Number,default:1},
    selectedEventIds:{type:Array,default:() => []},activeEventIds:{type:Array,default:() => []} },
  data() { return {width:1,height:1,screenScale:1,overlay:{stems:[],beams:[],groupIds:[],curves:[],relationIds:[]},observer:null,frame:null,unwatch:[],destroyed:false}; },
  watch:{ score:{deep:true,handler() { this.watchStaffs();this.queueUpdate(); }},barIndex() { this.watchStaffs();this.queueUpdate(); },displayZoom:'queueUpdate' },
  mounted() {
    this.watchStaffs();this.queueUpdate();
    const parent=this.$el.parentElement;
    if (typeof ResizeObserver !== "undefined" && parent) {this.observer=new ResizeObserver(this.queueUpdate);this.observer.observe(parent);}
    else if (typeof window !== "undefined") window.addEventListener("resize",this.queueUpdate);
  },
  beforeDestroy() {
    this.destroyed=true;this.unwatch.forEach(stop => stop());this.$emit("groups",[]);this.$emit("relationgroups",[]);
    if (this.observer) this.observer.disconnect();
    if (typeof window !== "undefined") {window.removeEventListener("resize",this.queueUpdate);if (this.frame !== null) window.cancelAnimationFrame(this.frame);}
  },
  methods:{
    isSelected(id) { return this.selectedEventIds.includes(id); },
    watchStaffs() {
      this.unwatch.forEach(stop => stop());this.unwatch=[];
      this.$nextTick(() => { if (this.destroyed) return;
        this.getStaffs().forEach(staff => { if (staff && staff.$watch) this.unwatch.push(staff.$watch(() => staff.gesture,this.queueUpdate,{deep:true})); });
      });
    },
    queueUpdate() {
      if (this.destroyed || this.frame !== null) return;
      this.$nextTick(() => {
        if (this.destroyed || this.frame !== null) return;
        if (typeof window !== "undefined" && window.requestAnimationFrame) this.frame=window.requestAnimationFrame(() => {this.frame=null;this.updateOverlay();});
        else this.updateOverlay();
      });
    },
    updateOverlay() {
      const parent=this.$el && this.$el.parentElement;
      if (!parent || !parent.getBoundingClientRect) return;
      const bounds=parent.getBoundingClientRect();if (!(bounds.width > 0 && bounds.height > 0)) return;
      const events=[],stems=[],lines=[],scales=[];
      this.getStaffs().forEach((staff,index) => {
        const svg=staff && staff.$refs && staff.$refs.sheet,matrix=svg && svg.getScreenCTM && svg.getScreenCTM();
        if (!matrix || !staff.notation) return;
        const point=(x,y) => ({x:matrix.a*x+matrix.c*y+matrix.e-bounds.left,y:matrix.b*x+matrix.d*y+matrix.f-bounds.top});
        const scale=Math.hypot(matrix.a,matrix.b);
        scales.push(scale);
        staff.notation.events.forEach(event => {
          const stem=point(event.stemX,event.stemEndY);
          events.push(Object.assign({},event,point(event.x,event.y),{visualStaff:index,notationScale:scale,stemOffset:6*scale,stemX:stem.x,stemEndY:stem.y}));
        });
        staff.notation.stems.forEach(stem => {const first=point(stem.x,stem.y1),last=point(stem.x,stem.y2);stems.push(Object.assign({},stem,{x:first.x,y1:first.y,y2:last.y}));});
        lines.push({top:point(0,76).y,bottom:point(0,156).y});
      });
      const gap=lines.length > 1 ? (lines[0].bottom+lines[1].top)/2 : undefined;
      this.screenScale=scales.length ? Math.max(...scales) : 1;
      this.width=bounds.width;this.height=bounds.height;this.overlay=Object.assign(layoutWorkshopCrossStaffBeams(events,stems,gap,this.screenScale),layoutWorkshopCrossStaffCurves(events,this.score.ties || [],this.score.slurs || []));
      const connections=layoutWorkshopCrossStaffConnections(events,this.score.glissandos || [],this.score.tremolos || []);
      this.overlay.curves=this.overlay.curves.concat(connections.curves);this.overlay.relationIds=this.overlay.relationIds.concat(connections.relationIds);
      this.$emit("groups",this.overlay.groupIds.slice());this.$emit("relationgroups",this.overlay.relationIds.slice());
    }
  }
};
</script>
<style scoped>
.workshop-editor-beam-bridge {position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;color:#29464d;}
.bridge-stem {stroke:currentColor;stroke-width:calc(1.7px * var(--workshop-bridge-scale,1));}.bridge-curve {fill:none;stroke:currentColor;stroke-width:calc(1.8px * var(--workshop-bridge-scale,1));}.bridge-beam {fill:currentColor;}.selected {color:#ce5d29;}.playing {color:#d75625;}
.bridge-curve.tremolo {fill:currentColor;stroke:none;}
</style>
