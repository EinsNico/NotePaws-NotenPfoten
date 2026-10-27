<template>
  <div
    class="select-option-dropdown"
    :class="{
      'select-option-dropdown--app-settings': appearance === 'app-settings',
      'select-option-dropdown--wide': wide
    }">
    <div class="label">{{label}}</div>
    <div class="select-option-dropdown__control">
      <select
        :aria-label="label"
        :disabled="disabled"
        :value="value"
        @input="select($event.target.value)">
        <option
          v-for="item in items"
          :key="item.value"
          :value="item.value">
            {{item.label}}
        </option>
      </select>
      <span
        v-if="appearance === 'app-settings'"
        class="select-option-dropdown__arrow"
        aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SelectOptionDropdown',
  props: {
    appearance: {
      type: String,
      default: 'default'
    },
    items: Array,
    label: String,
    disabled: {
      type: Boolean,
      default: false
    },
    value: [String, Number, Boolean],
    wide: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    select(value){
      this.$emit('input', value);
    }
  }
}
</script>

<style>
.label {
  font-size: 9pt;
  color: black;
}

select {
  margin: 5px;
  width: 100px;
  height: 40px;
  padding-left: 8px;
  border-radius: 10px;
  background-color: white;
  color: black;
  border: 1px solid black;
  cursor: pointer;
  font-size: 10pt;
  outline: none;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

select:hover {
  background-color: lightblue;
}

.select-option-dropdown__control {
  display: contents;
}

.select-option-dropdown--app-settings {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
}

.select-option-dropdown--app-settings .label {
  color: #53686d;
  font-size: 12px;
  font-weight: 700;
}

.select-option-dropdown--app-settings .select-option-dropdown__control {
  position: relative;
  display: block;
  width: 126px;
  min-width: 0;
}

.select-option-dropdown--app-settings select {
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  margin: 0;
  padding: 0 64px 0 13px;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--settings-select-border, rgba(43, 70, 77, 0.2));
  border-radius: 13px;
  background-color: var(--settings-select-background, #fff);
  color: var(--settings-select-color, #24363b);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.select-option-dropdown--app-settings.select-option-dropdown--wide .select-option-dropdown__control {
  width: 224px;
}

.select-option-dropdown--app-settings .select-option-dropdown__arrow {
  position: absolute;
  top: 50%;
  right: 16px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--settings-select-color, #24363b);
  transform: translateY(-50%);
  pointer-events: none;
}

.select-option-dropdown--app-settings .select-option-dropdown__arrow::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-color: currentColor;
  opacity: 0.07;
  content: '';
}

.select-option-dropdown--app-settings .select-option-dropdown__arrow svg {
  position: relative;
}

.select-option-dropdown--app-settings select:disabled + .select-option-dropdown__arrow {
  opacity: 0.55;
}

.select-option-dropdown--app-settings select:hover,
.select-option-dropdown--app-settings select:focus-visible {
  border-color: rgba(207, 86, 39, 0.55);
  background-color: #fff;
  outline: 2px solid rgba(231, 101, 48, 0.22);
  outline-offset: 2px;
}

.select-option-dropdown select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 340px) {
  .select-option-dropdown--app-settings {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .select-option-dropdown--app-settings .select-option-dropdown__control {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .select-option-dropdown--app-settings.select-option-dropdown--wide {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .select-option-dropdown--app-settings.select-option-dropdown--wide .select-option-dropdown__control {
    width: 100%;
  }
}
</style>
