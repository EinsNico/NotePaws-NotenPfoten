<template>
  <div v-show="visible" class="floating-training-start">
    <div class="floating-start-space" aria-hidden="true"></div>
    <div class="floating-start-bar">
      <div class="floating-start-inner">
        <button type="button" class="floating-start" :disabled="disabled" @click="$emit('start')">
          <span>{{label}}</span><span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FloatingTrainingStart',
  props: {
    anchorSelector: { type: String, required: true },
    label: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    viewKey: { type: String, default: '' }
  },
  data() { return { visible: false }; },
  watch: {
    enabled() { this.$nextTick(this.updateVisibility); },
    viewKey() { this.$nextTick(this.updateVisibility); }
  },
  mounted() {
    window.addEventListener('scroll', this.updateVisibility, { passive: true });
    window.addEventListener('resize', this.updateVisibility);
    this.updateVisibility();
  },
  beforeDestroy() {
    window.removeEventListener('scroll', this.updateVisibility);
    window.removeEventListener('resize', this.updateVisibility);
  },
  methods: {
    updateVisibility() {
      if (this._isDestroyed || this._isBeingDestroyed) return;
      const parent = this.$el && this.$el.parentElement;
      const anchor = parent && parent.querySelector(this.anchorSelector);
      this.visible = Boolean(this.enabled && anchor && anchor.getClientRects().length
        && anchor.getBoundingClientRect().bottom <= 0);
    }
  }
};
</script>

<style scoped>
.floating-start-space { height: calc(72px + env(safe-area-inset-bottom)); }
.floating-start-bar {
  position: fixed; z-index: 20; right: 0; bottom: 0; left: 0; box-sizing: border-box;
  padding: 8px max(12px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  border-top: 1px solid rgba(43,70,77,.13); background: rgba(247,242,233,.94);
  box-shadow: 0 -5px 18px rgba(65,54,44,.13); backdrop-filter: blur(9px);
}
.floating-start-inner { max-width: 696px; margin: 0 auto; }
button.floating-start {
  display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: space-between;
  padding: 10px 17px; border: none; border-radius: 14px; background: linear-gradient(135deg,#e76530,#cf5124);
  box-shadow: 0 7px 16px rgba(207,81,36,.22); color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
}
button.floating-start:hover:not(:disabled), button.floating-start:focus-visible {
  background: linear-gradient(135deg,#ee7440,#d85727); outline: 3px solid rgba(231,101,48,.24); outline-offset: 1px;
}
button.floating-start:disabled { opacity: .5; box-shadow: none; cursor: not-allowed; }
</style>
