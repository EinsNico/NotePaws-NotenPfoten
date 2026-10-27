<template>
  <svg class="workshop-symbol" viewBox="0 0 44 48" aria-hidden="true" focusable="false">
    <path v-if="kind === 'rest'" :d="restPath" fill="currentColor" />
    <template v-else>
      <path v-if="noteValue === 'breve'" d="M 6 12 V 28 M 25 12 V 28" fill="none" stroke="currentColor" stroke-width="1.6" />
      <rect v-if="['long','maxima'].includes(noteValue)" :x="noteValue === 'maxima' ? 1 : 3" y="23" :width="noteValue === 'maxima' ? 18 : 12" height="8" fill="currentColor" />
      <ellipse v-else :cx="['whole','breve'].includes(noteValue) ? 16 : 9" :cy="['whole','breve'].includes(noteValue) ? 20 : 27"
        rx="6" ry="4.4" :fill="hollow ? 'none' : 'currentColor'" stroke="currentColor" stroke-width="1.6" />
      <line v-if="!['whole','breve'].includes(noteValue)" x1="14" x2="14" y1="26" y2="4" stroke="currentColor" stroke-width="1.6" />
      <path v-for="flag in flagCount" :key="'flag-'+flag" :d="'M 14 '+(4+(flag-1)*(flagCount > 4 ? 3 : 7))+' Q 29 '+(10+(flag-1)*(flagCount > 4 ? 3 : 7))+' 20 '+(21+(flag-1)*(flagCount > 4 ? 3 : 7))" fill="none" stroke="currentColor" stroke-width="2" />
    </template>
    <path v-if="dots > 0" :d="dotPath" fill="currentColor" />
    <circle v-for="dot in Math.max(0,dots-1)" :key="'dot-'+dot" :cx="31+(dot-1)*6" :cy="kind === 'rest' || ['whole','breve'].includes(noteValue) ? 20 : 27" r="1.6" fill="currentColor" />
  </svg>
</template>

<script>
import Glyphs from "abcjs/src/write/creation/glyphs";
import { workshopRestPath, workshopRestBounds } from "../model/WorkshopRestGlyphs";
export default {
  name: "WorkshopSymbol",
  props: { noteValue: { type: String, default: "quarter" }, kind: { type: String, default: "note" },
    dots: { type: Number, default: 0, validator: value => [0,1,2,3].includes(value) } },
  computed: {
    flagCount() { return ({ eighth:1,sixteenth:2,thirtysecond:3,sixtyfourth:4,onetwentyeighth:5,twofiftysixth:6,fivehundredtwelfth:7,onethousandtwentyfourth:8 })[this.noteValue] || 0; },
    hollow() { return ["whole","half","breve"].includes(this.noteValue); },
    restPath() {
      const bounds=workshopRestBounds(this.noteValue);
      if (!bounds) return "";
      const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
      const availableWidth=this.dots ? 20 : 36,scale=Math.min(1/1.1,availableWidth/width,40/height);
      const x=4+(availableWidth-width*scale)/2-bounds.left*scale;
      // Whole hangs below the shared anchor; half stands above it. Centering
      // both bounding boxes would erase that meaningful distinction.
      const y=["whole","half"].includes(this.noteValue) ? 20 : 24-(bounds.top+bounds.bottom)*scale/2;
      return workshopRestPath(this.noteValue,x,y,scale);
    },
    dotPath() { return Glyphs.getPathForSymbol(25,this.kind === "rest" || this.noteValue === "whole" ? 20 : 27,"dots.dot",1,1).map(part => part.join(" ")).join(" "); }
  }
};
</script>

<style scoped>
.workshop-symbol { display: block; width: 24px; height: 30px; flex: none; }
</style>
