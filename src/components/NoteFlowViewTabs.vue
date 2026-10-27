<template>
  <div
    class="flow-view-tabs"
    role="tablist"
    :aria-label="$t('FLOW_VIEW_NAVIGATION')">
    <button
      type="button"
      role="tab"
      class="flow-view-tab is-settings"
      :class="{ active: activeView === 'settings' }"
      :aria-selected="activeView === 'settings' ? 'true' : 'false'"
      @click="$emit('select-view', 'settings')">
      <span class="flow-view-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path d="M5 9h22M5 16h22M5 23h22" />
          <circle cx="12" cy="9" r="2.5" />
          <circle cx="21" cy="16" r="2.5" />
          <circle cx="14" cy="23" r="2.5" />
        </svg>
      </span>
      {{$t('FLOW_SETTINGS')}}
    </button>
    <button
      type="button"
      role="tab"
      class="flow-view-tab is-statistics"
      :class="{ active: activeView === 'statistics' }"
      :aria-selected="activeView === 'statistics' ? 'true' : 'false'"
      @click="$emit('select-view', 'statistics')">
      <span class="flow-view-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path d="M5 27V16h6v11M13 27V9h6v18M21 27V4h6v23M3 27h26" />
        </svg>
      </span>
      {{$t('FLOW_STATISTICS')}}
    </button>
  </div>
</template>

<script>
export default {
  name: "NoteFlowViewTabs",
  props: {
    activeView: {
      type: String,
      required: true,
      validator(value) {
        return value === "settings" || value === "statistics";
      }
    }
  }
};
</script>

<style scoped>
.flow-view-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 10px;
}

.flow-view-tab {
  display: flex;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(43, 70, 77, 0.13);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.54);
  color: #53676c;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.flow-view-tab:hover,
.flow-view-tab:focus-visible {
  border-color: rgba(45, 110, 123, 0.4);
  background: rgba(255, 255, 255, 0.82);
  outline: none;
}

.flow-view-tab.active {
  border-color: rgba(207, 86, 39, 0.4);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 7px 16px rgba(72, 58, 45, 0.09);
  color: #b84922;
}

.flow-view-tab.is-statistics.active {
  border-color: rgba(45, 110, 123, 0.42);
  color: #286a77;
}

.flow-view-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  background: #f3e8dd;
}

.flow-view-tab.is-statistics .flow-view-icon {
  background: #e1eef0;
}

.flow-view-icon svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

@media (max-width: 370px) {
  .flow-view-tab {
    font-size: 11px;
  }
}
</style>
