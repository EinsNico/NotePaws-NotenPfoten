<template>
  <div class="range-picker">
    <div class="range-boundaries" role="group" :aria-label="$t('WORKSHOP_PRACTICE_SECTION')">
      <button v-for="edge in ['start','end']" :key="edge" type="button" :aria-pressed="boundary===edge" @click="selectBoundary(edge)">
        <span>{{$t(edge==='start' ? 'WORKSHOP_PRACTICE_FROM_BAR' : 'WORKSHOP_PRACTICE_TO_BAR')}}</span>
        <strong>{{edge==='start' ? from : to}}</strong>
      </button>
    </div>
    <p class="range-instruction">{{$t(boundary==='start' ? 'WORKSHOP_PRACTICE_PICK_START' : 'WORKSHOP_PRACTICE_PICK_END')}}</p>
    <nav v-if="blocks.length>1" class="range-blocks" :aria-label="$t('WORKSHOP_PRACTICE_BLOCKS')">
      <button v-for="block in blocks" :key="block.page" type="button" :class="{included:block.to>=from && block.from<=to}" :aria-current="page===block.page ? 'page' : null" @click="page=block.page">{{block.from}}–{{block.to}}</button>
    </nav>
    <div class="range-caption"><strong>{{$t('WORKSHOP_PRACTICE_RESULT_RANGE',{start:blockStart,end:blockEnd})}}</strong><button v-if="blocks.length>1" type="button" class="whole-block" @click="chooseBlock">{{$t('WORKSHOP_PRACTICE_PICK_BLOCK')}}</button></div>
    <div class="range-bars">
      <button v-for="bar in preview.bars" :key="bar.number" type="button" class="range-bar" :class="{selected:bar.number>=from && bar.number<=to,edge:bar.number===from || bar.number===to}" :aria-pressed="bar.number>=from && bar.number<=to" :aria-label="$t(boundary==='start' ? 'WORKSHOP_PRACTICE_START_AT' : 'WORKSHOP_PRACTICE_END_AT',{number:bar.number})" @click="chooseBar(bar.number)">
        <span>{{$t('WORKSHOP_BAR',{number:bar.number})}}</span>
        <svg viewBox="0 0 88 52" aria-hidden="true" focusable="false">
          <path d="M4 12h80M4 19h80M4 26h80M4 33h80M4 40h80M4 12v28M84 12v28" class="staff"/>
          <g v-for="(note,index) in bar.notes" :key="index" :class="{left:note.left}"><ellipse :cx="note.x" :cy="note.y+7" rx="3" ry="2.2"/><path :d="'M'+(note.x+2.5)+' '+(note.y+7)+'v-12'"/></g>
          <text v-if="!bar.notes.length" x="44" y="30">–</text>
        </svg>
        <small v-if="bar.number===from || bar.number===to">{{bar.number===from && bar.number===to ? 'A · B' : bar.number===from ? 'A' : 'B'}}</small>
      </button>
    </div>
    <div class="range-footer"><button type="button" :disabled="page===0" :aria-label="$t('WORKSHOP_PRACTICE_PREVIOUS_BARS')" @click="page--">←</button><span role="status">{{$t('WORKSHOP_PRACTICE_RESULT_RANGE',{start:from,end:to})}}</span><button type="button" :disabled="page===preview.pageCount-1" :aria-label="$t('WORKSHOP_PRACTICE_NEXT_BARS')" @click="page++">→</button></div>
    <p class="range-note">{{$t('WORKSHOP_PRACTICE_RANGE_SIMPLIFIED')}}</p>
  </div>
</template>

<script>
import {createWorkshopPracticePlan,workshopPracticeSectionPreview} from '../model/WorkshopPractice';
export default {
  name:'WorkshopPracticeRange',
  props:{score:{type:Object,required:true},hands:{type:Object,required:true},from:{type:Number,required:true},to:{type:Number,required:true}},
  data() {return {boundary:'start',page:Math.floor((this.from-1)/8)};},
  computed:{
    // Written bars, once each: repeats never duplicate choices or change their numbers.
    writtenPlan() {return createWorkshopPracticePlan(this.score,{hands:this.hands,range:{startBar:0,endBar:this.score.parts[0].measures.length-1}});},
    preview() {return workshopPracticeSectionPreview(this.writtenPlan,this.page);},
    blocks() {return Array.from({length:this.preview.pageCount},(_,page)=>({page,from:page*8+1,to:Math.min((page+1)*8,this.score.parts[0].measures.length)}));},
    blockStart() {return this.preview.bars[0].number;},
    blockEnd() {return this.preview.bars[this.preview.bars.length-1].number;}
  },
  watch:{score() {this.page=0;this.boundary='start';}},
  methods:{
    selectBoundary(edge) {this.boundary=edge;this.page=Math.floor(((edge==='start' ? this.from : this.to)-1)/8);},
    chooseBar(number) {
      if(this.boundary==='start') {
        this.$emit('change',{from:number,to:Math.max(number,this.to)});this.boundary='end';
      } else this.$emit('change',{from:Math.min(number,this.from),to:number});
    },
    chooseBlock() {this.$emit('change',{from:this.blockStart,to:this.blockEnd});this.boundary='start';}
  }
};
</script>

<style scoped>
.range-picker {box-sizing:border-box;width:100%;min-width:0;padding:12px;border:1px solid #d4e2e1;border-radius:14px;background:#fffdf8;color:#29464f;}
button {box-sizing:border-box;font:inherit;font-size:12px;font-weight:600;min-height:44px;padding:8px 10px;color:inherit;border:1px solid #cedede;border-radius:10px;background:#fffdf9;cursor:pointer;}button:focus-visible {outline:3px solid #dc6a38;outline-offset:2px;}button:disabled {opacity:.4;cursor:default;}
.range-boundaries {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}.range-boundaries button {display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;}.range-boundaries strong {font-size:19px;}.range-boundaries [aria-pressed="true"] {background:#2c7b8b;color:white;border-color:#2c7b8b;}
.range-instruction {font-size:12px;line-height:1.5;margin:10px 0;color:#4e7079;}.range-blocks {display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:2px 2px 8px;overscroll-behavior-x:contain;}.range-blocks button {flex:0 0 auto;font-variant-numeric:tabular-nums;}.range-blocks .included {background:#e3eff0;}.range-blocks [aria-current="page"] {border-color:#2c7b8b;box-shadow:inset 0 0 0 1px #2c7b8b;}
.range-caption {display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:6px 0 10px;font-size:12px;}.whole-block {font-size:11px;color:#a34e29;background:#fff2e7;border-color:#edc2a9;}
.range-bars {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;}.range-bar {position:relative;min-width:0;padding:8px 3px 3px;overflow:hidden;}.range-bar > span {font-size:11px;}.range-bar.selected {background:#e9f4f2;border-color:#83b8af;}.range-bar.edge {border-color:#d77537;box-shadow:inset 0 0 0 1px #d77537;}.range-bar svg {display:block;width:100%;height:52px;fill:#d77537;}.range-bar svg g path {stroke:#d77537;stroke-width:1.2;}.range-bar svg .left {fill:#2c7b8b;}.range-bar svg .left path {stroke:#2c7b8b;}.range-bar svg .staff {fill:none;stroke:#bacdce;stroke-width:.7;}.range-bar text {text-anchor:middle;fill:#7a9399;font-size:16px;}.range-bar small {display:block;font-size:10px;color:#a04a21;min-height:12px;}
.range-footer {display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:12px;font-weight:600;}.range-footer button {min-width:44px;}.range-note {font-size:10px;color:#64828a;line-height:1.5;margin:10px 0 0;}
@media(max-width:380px) {.range-picker {padding:9px;}.range-bars {grid-template-columns:repeat(2,minmax(0,1fr));}.range-boundaries button {padding:8px;font-size:11px;}}
</style>
