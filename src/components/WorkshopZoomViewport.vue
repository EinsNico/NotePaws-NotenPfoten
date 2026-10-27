<template>
  <div ref="viewport" class="workshop-zoom-viewport" :style="{'--workshop-zoom-viewport-width':availableWidth > 0 ? availableWidth+'px' : '100vw'}" :role="ariaLabel ? 'region' : null" :aria-label="ariaLabel || null"
    :tabindex="contentWidth > availableWidth ? 0 : null">
    <div ref="content" class="workshop-zoom-content" :style="contentStyle"><slot /></div>
  </div>
</template>

<script>
export default {
  name:"WorkshopZoomViewport",
  props:{ zoom:{type:Number,default:1},minWidth:{type:Number,default:0},maxWidth:{type:Number,default:Infinity},ariaLabel:{type:String,default:""} },
  data() { return {availableWidth:0,observer:null}; },
  computed:{
    effectiveZoom() { return Number.isFinite(this.zoom) && this.zoom > 0 ? this.zoom : 1; },
    baseWidth() {
      const minimum=Number.isFinite(this.minWidth) && this.minWidth > 0 ? this.minWidth : 0;
      const maximum=Number.isFinite(this.maxWidth) && this.maxWidth > 0 ? this.maxWidth : Infinity;
      return Math.max(minimum,Math.min(maximum,this.availableWidth));
    },
    contentWidth() { return this.baseWidth*this.effectiveZoom; },
    contentStyle() { return {width:this.contentWidth > 0 ? this.contentWidth+'px' : '100%',maxWidth:'none'}; }
  },
  watch:{
    zoom() { this.preserveScroll(); },
    minWidth() { this.preserveScroll(); },
    maxWidth() { this.preserveScroll(); }
  },
  mounted() {
    this.updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      this.observer=new ResizeObserver(this.updateWidth);this.observer.observe(this.$refs.viewport);
    } else if (typeof window !== "undefined") window.addEventListener("resize",this.updateWidth);
  },
  beforeDestroy() {
    this._zoomDestroyed=true;this._scrollRequest=(this._scrollRequest || 0)+1;
    if (this.observer) this.observer.disconnect();
    else if (typeof window !== "undefined") window.removeEventListener("resize",this.updateWidth);
  },
  methods:{
    viewportElement() { return this.$refs.viewport; },
    resetScroll() {
      this._scrollRequest=(this._scrollRequest || 0)+1;
      const viewport=this.viewportElement();if (viewport) viewport.scrollLeft=0;
    },
    scrollBy(delta) {
      const viewport=this.viewportElement();if (!viewport || !Number.isFinite(delta)) return;
      this._scrollRequest=(this._scrollRequest || 0)+1;
      viewport.scrollLeft=Math.max(0,Math.min(Math.max(0,viewport.scrollWidth-viewport.clientWidth),viewport.scrollLeft+delta));
    },
    scrollCenter() {
      const viewport=this.viewportElement(),content=this.$refs.content;
      if (!viewport || !viewport.getBoundingClientRect || !content || !content.getBoundingClientRect) return .5;
      const viewportRect=viewport.getBoundingClientRect(),contentRect=content.getBoundingClientRect();
      // The content can be centered with auto margins before it becomes wider
      // than the viewport. Its actual left edge includes both those margins
      // and the current scroll position.
      return contentRect.width > 0 ? (viewportRect.left+(viewport.clientLeft || 0)+viewport.clientWidth/2-contentRect.left)/contentRect.width : .5;
    },
    preserveScroll(center=this.scrollCenter()) {
      const request=this._scrollRequest=(this._scrollRequest || 0)+1;
      this.$nextTick(() => {
        if (this._zoomDestroyed || request !== this._scrollRequest) return;
        const viewport=this.viewportElement();if (!viewport) return;
        const maximum=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
        viewport.scrollLeft=this.effectiveZoom === 1 ? 0 : Math.max(0,Math.min(maximum,center*this.contentWidth-viewport.clientWidth/2));
      });
    },
    updateWidth() {
      if (this._zoomDestroyed) return;
      const viewport=this.viewportElement(),width=viewport && viewport.clientWidth;
      if (!(width > 0) || width === this.availableWidth) return;
      const center=this.scrollCenter();this.availableWidth=width;this.preserveScroll(center);this.$emit("resize",width);
    }
  }
};
</script>

<style scoped>
.workshop-zoom-viewport {box-sizing:border-box;min-width:0;max-width:100%;width:100%;overflow-x:auto;overscroll-behavior-x:contain;}
.workshop-zoom-content {box-sizing:border-box;min-width:0;margin-left:auto;margin-right:auto;}
</style>
