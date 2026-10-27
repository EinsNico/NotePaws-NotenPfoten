<template>
  <div class="editor-zoom" role="group" :aria-label="$t('WORKSHOP_EDITOR_ZOOM')">
    <span class="zoom-title">{{$t('WORKSHOP_EDITOR_ZOOM')}}</span>
    <div class="zoom-controls">
      <button type="button" :disabled="value <= .75" :aria-label="$t('WORKSHOP_ZOOM_OUT')" @click="change(value-.25)">−</button>
      <input type="range" min="75" max="200" step="25" :value="Math.round(value*100)" :aria-label="$t('WORKSHOP_EDITOR_ZOOM')" :aria-valuetext="Math.round(value*100)+' %'" @input="change(Number($event.target.value)/100)" />
      <button type="button" :disabled="value >= 2" :aria-label="$t('WORKSHOP_ZOOM_IN')" @click="change(value+.25)">＋</button>
      <button type="button" class="zoom-reset" :aria-label="$t('WORKSHOP_ZOOM_RESET')" @click="change(1)">{{Math.round(value*100)}} %</button>
    </div>
    <button v-if="canPan" type="button" class="zoom-pan" :class="{ selected:panning }" :aria-pressed="panning" @click="$emit('pan',!panning)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>
      {{$t(panning ? 'WORKSHOP_ZOOM_EDIT' : 'WORKSHOP_ZOOM_PAN')}}
    </button>
  </div>
</template>
<script>
export default {
  name:'WorkshopEditorZoom',
  props:{value:{type:Number,default:1},panning:{type:Boolean,default:false},canPan:{type:Boolean,default:true}},
  methods:{change(value) {if(Number.isFinite(value))this.$emit('input',Math.max(.75,Math.min(2,value)));}}
};
</script>
<style scoped>
.editor-zoom { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:10px 0; padding:8px 10px; border:1px solid #d5e1dc; border-radius:12px; background:#f3f7f4; }
.zoom-title { font-size:12px; font-weight:700; }
.zoom-controls { display:flex; flex:1; align-items:center; gap:5px; min-width:200px; }
button { min-width:44px; min-height:44px; padding:5px; border:1px solid #cbdcde; border-radius:10px; background:#fffefa; color:#29464d; font-size:20px; cursor:pointer; }
button:disabled { opacity:.4; cursor:default; }
input { flex:1; min-width:35px; width:100%; min-height:44px; padding:0; accent-color:#2c7b8b; cursor:pointer; }
.zoom-reset { min-width:66px; font-size:12px; }
.zoom-pan { display:flex; align-items:center; justify-content:center; gap:6px; padding:6px 10px; font-size:12px; }
.zoom-pan svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
.zoom-pan.selected { border-color:#2c7b8b; background:#2c7b8b; color:#fff; }
@media(max-width:620px) { .zoom-title { flex-basis:100%; }.zoom-pan { width:100%; } }
</style>
