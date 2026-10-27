<template>
  <section class="source-links">
    <h3>{{$t('WORKSHOP_META_SOURCES')}}</h3>
    <div v-for="(source,index) in entries" :key="index" class="source-entry">
      <label>{{$t('WORKSHOP_SOURCE_LABEL')}}
        <input v-model="source.label" type="text" maxlength="256" @input="publish" />
      </label>
      <label>{{$t('WORKSHOP_SOURCE_URL')}}
        <input v-model="source.url" type="url" maxlength="2048" :aria-invalid="source.url && !safeUrl(source.url) ? 'true' : null" @input="publish" />
      </label>
      <div class="source-actions">
        <a v-if="safeUrl(source.url)" :href="source.url" target="_blank" rel="noopener noreferrer">{{$t('WORKSHOP_SOURCE_OPEN')}}: {{source.label || source.url}}</a>
        <button type="button" :aria-label="$t('WORKSHOP_SOURCE_REMOVE')+': '+(source.label || (index+1))" @click="remove(index)">{{$t('WORKSHOP_SOURCE_REMOVE')}}</button>
      </div>
    </div>
    <button type="button" :disabled="entries.length >= 16" @click="add">＋ {{$t('WORKSHOP_SOURCE_ADD')}}</button>
    <p v-if="invalid" class="source-error" role="alert">{{$t('WORKSHOP_SOURCES_INVALID')}}</p>
  </section>
</template>

<script>
import { isValidWorkshopSourceUrl, isValidWorkshopSources } from '../model/Workshop';
export default {
  name:'WorkshopSourceLinks',
  props:{ value:{type:Array,default:()=>[]} },
  data() { return {entries:this.value.map(source=>Object.assign({},source))}; },
  computed:{ invalid() { return !isValidWorkshopSources(this.entries); } },
  watch:{ value(value) { this.entries=value.map(source=>Object.assign({},source)); } },
  methods:{
    safeUrl:isValidWorkshopSourceUrl,
    publish() { this.$emit('input',this.entries.map(source=>Object.assign({},source))); },
    add() { if (this.entries.length < 16) { this.entries.push({label:'',url:''});this.publish(); } },
    remove(index) { this.entries.splice(index,1);this.publish(); }
  }
};
</script>

<style scoped>
.source-links { margin-top:20px; }
h3 { margin:0 0 12px;font-size:16px; }
.source-entry { padding:12px 0;border-bottom:1px solid #dde5e2;margin-bottom:12px; }
label { display:block;margin:8px 0;font-weight:700;font-size:14px; }
input { box-sizing:border-box;display:block;width:100%;min-width:0;margin-top:6px;padding:11px;border:1px solid #cbdadd;border-radius:10px;background:white;color:#344e57;font:inherit;font-size:16px; }
.source-actions { display:flex;align-items:center;justify-content:space-between;gap:12px; }
a { color:#236f7e;overflow-wrap:anywhere;line-height:1.5; }
button { flex-shrink:0;min-height:44px;padding:9px 12px;border:1px solid #cbdadd;border-radius:10px;background:#fffaf2;color:#3d5e68;font:inherit;font-size:14px;font-weight:700;cursor:pointer; }
button:disabled { opacity:.5;cursor:default; }
input:focus,a:focus-visible,button:focus-visible { outline:3px solid #b4d6dc;outline-offset:2px; }
.source-error { color:#a2432d;font-size:14px;line-height:1.5; }
@media (max-width:420px) { .source-actions { align-items:flex-start;flex-direction:column; } }
</style>
