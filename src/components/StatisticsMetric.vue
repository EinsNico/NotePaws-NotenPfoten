<template>
  <div class="statistics-metric" :style="accentStyle">
    <div v-if="hasPercentage" class="statistics-metric-ring">
      <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <circle class="metric-ring-track" cx="22" cy="22" r="18" pathLength="100" />
        <circle class="metric-ring-value" cx="22" cy="22" r="18" pathLength="100" :stroke-dasharray="`${ringPercentage} 100`" />
      </svg>
      <strong>{{value}}</strong>
    </div>
    <template v-else>
      <span v-if="icon === 'notes'" class="statistics-metric-symbol" aria-hidden="true">♪</span>
      <svg v-else class="statistics-metric-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <template v-if="icon === 'record'">
          <path d="M10 5h12v8a6 6 0 0 1-12 0zM16 19v7M11 27h10M10 7H5v4c0 4 3 6 6 6M22 7h5v4c0 4-3 6-6 6" />
        </template>
        <template v-else-if="icon === 'score'">
          <path d="m16 4 3.6 7.4 8.2 1.2-5.9 5.7 1.4 8.1L16 22.6l-7.3 3.8 1.4-8.1-5.9-5.7 8.2-1.2z" />
        </template>
        <template v-else-if="icon === 'rounds'">
          <path d="M25 12a10 10 0 1 0 1 8M25 5v7h-7" />
        </template>
        <template v-else-if="icon === 'missed'">
          <circle cx="16" cy="16" r="11" /><path d="m12 12 8 8m0-8-8 8" />
        </template>
        <template v-else-if="icon === 'bars'">
          <path d="M5 9h22M5 16h22M5 23h22M9 6v20M23 6v20" />
        </template>
        <template v-else-if="icon === 'strikes'">
          <ellipse cx="16" cy="17" rx="10" ry="4" /><path d="M6 17v7c0 5 20 5 20 0v-7M12 5l5 8M24 5l-5 8" />
        </template>
        <template v-else-if="icon === 'duration'">
          <circle cx="16" cy="18" r="10" /><path d="M16 8V4m-4 0h8m3 5 3-3M16 12v7l4 2" />
        </template>
        <template v-else>
          <circle cx="16" cy="16" r="11" /><path d="M16 5v11h11M16 16l-5 5" />
        </template>
      </svg>
      <strong class="statistics-metric-value">{{value}}</strong>
    </template>
    <span class="statistics-metric-label">{{label}}</span>
  </div>
</template>

<script>
export default {
  name: "StatisticsMetric",
  props: {
    value: { type: [String, Number], required: true },
    label: { type: String, required: true },
    icon: { type: String, default: "notes" },
    accent: { type: String, default: "petrol" },
    percentage: { type: Number, default: null }
  },
  computed: {
    hasPercentage() { return typeof this.percentage === "number" && Number.isFinite(this.percentage); },
    ringPercentage() { return Math.max(0, Math.min(100, this.percentage)); },
    accentStyle() {
      const colors = { orange: "#dc6736", petrol: "#2d6e7b", gold: "#e6a34a", violet: "#8065a3", muted: "#79a7ad" };
      return { "--statistics-accent": colors[this.accent] || colors.petrol };
    }
  }
};
</script>

<style scoped>
.statistics-metric {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  min-height: 108px;
  padding: 8px 5px;
  border: 1px solid #d5e8ef;
  border-top: 3px solid var(--statistics-accent);
  border-radius: 10px;
  background: white;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}
.statistics-metric-icon { width: 23px; height: 23px; margin-bottom: 3px; fill: none; stroke: var(--statistics-accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.statistics-metric-symbol { height: 24px; color: var(--statistics-accent); font-size: 25px; line-height: 22px; }
.statistics-metric-value { color: #17495e; font-size: 20px; line-height: 1.1; }
.statistics-metric-label { min-height: 24px; margin-top: 4px; color: #657982; font-size: 10.5px; line-height: 1.2; overflow-wrap: anywhere; }
.statistics-metric-ring { position: relative; width: 50px; height: 50px; }
.statistics-metric-ring svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }
.statistics-metric-ring circle { fill: none; stroke-width: 4; }
.metric-ring-track { stroke: #e5eef2; }
.metric-ring-value { stroke: var(--statistics-accent); stroke-linecap: round; }
.statistics-metric-ring strong { position: absolute; top: 50%; left: 50%; width: 44px; transform: translate(-50%, -50%); color: #17495e; font-size: 12px; line-height: 1; }
</style>
