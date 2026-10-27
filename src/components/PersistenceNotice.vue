<template>
  <aside v-if="feedback.sources.length" class="persistence-notice" role="alert"
    aria-labelledby="persistence-notice-title">
    <div>
      <strong id="persistence-notice-title">{{$t('PERSISTENCE_ERROR_TITLE')}}</strong>
      <p>{{$t('PERSISTENCE_ERROR_TEXT')}}</p>
      <p class="persistence-sources">{{feedback.sources.map(source => $t(source.labelKey)).join(' · ')}}</p>
    </div>
    <button type="button" class="persistence-retry" :disabled="retrying"
      :aria-busy="retrying ? 'true' : 'false'" @click="retry">
      {{$t(retrying ? 'PERSISTENCE_RETRYING' : 'PERSISTENCE_RETRY')}}
    </button>
  </aside>
</template>

<script>
import { persistenceFeedback, retryPersistenceFailures } from "../model/PersistenceFeedback";
export default {
  name: "PersistenceNotice",
  data() { return { feedback: persistenceFeedback, retrying: false }; },
  methods: {
    async retry() {
      if (this.retrying) return;
      this.retrying = true;
      try { await retryPersistenceFailures(); } finally { this.retrying = false; }
    }
  }
};
</script>

<style scoped>
.persistence-notice { margin: 12px auto; width: min(680px, calc(100% - 24px)); box-sizing: border-box; display: flex; align-items: center; gap: 16px; padding: 16px 20px; border: 1px solid #ddaf63; border-left: 5px solid #d7942f; border-radius: 18px; background: #fff9ed; color: #6b4820; box-shadow: 0 8px 24px #34230e26; }
.persistence-notice p { margin: 5px 0 0; font-size: 14px; line-height: 1.4; }
.persistence-sources { font-weight: 600; }
.persistence-notice button { flex-shrink: 0; min-height: 44px; padding: 10px 14px; border: 1px solid #d4a75a; border-radius: 12px; background: white; color: #6b4820; font: inherit; cursor: pointer; }
.persistence-notice button:focus-visible { outline: 3px solid #a16b25; outline-offset: 3px; }
@media (max-width: 480px) { .persistence-notice { align-items: stretch; flex-direction: column; gap: 10px; padding: 12px 16px; } }
</style>
