<template>
  <div
    class="select-option"
    :class="{ 'select-option-multi--single-notes': appearance === 'single-notes' }">
    <div class="label">{{label}}</div>
    <div class="options-container" role="group" :aria-label="label">
      <button 
        v-for="item in items" 
        :key="item.value"
        type="button"
        class="value-box" 
        :class="{selected: value.includes(item.value)}"
        :aria-pressed="value.includes(item.value) ? 'true' : 'false'"
        @click="select(item.value)">
          {{item.label}}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SelectOptionMulti',
  props: {
    appearance: {
      type: String,
      default: 'default'
    },
    items: Array,
    label: String,
    value: Array
  },
  methods: {
    select(value){
      if (!this.value.includes(value)) {
        this.$emit('input', [...this.value, value]);
      } else if (this.value.length > 1) {
        this.$emit('input', this.value.filter(v => v !== value));
      }
    }
  }
}
</script>

<style>
.label {
  font-size: 9pt;
  color: black;
}

.options-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: 5px;
}

.value-box {
  appearance: none;
  box-sizing: content-box;
  padding: 0;
  font-family: inherit;
  font-weight: inherit;
  line-height: inherit;
  margin: 5px;
  width: 100px;
  height: 40px;
  border-radius: 10px;
  background-color: white;
  color: gray;
  border: 1px solid gray;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10pt;
  outline: none;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

.value-box:hover {
  color: black;
  border: 1px solid black;
}

.selected {
  background-color: lightblue;
  color: black;
  border: 1px solid black;
}

.selected:hover {
  background-color: lightblue;
}

.select-option-multi--single-notes {
  width: 100%;
  text-align: left;
}

.select-option-multi--single-notes .label {
  color: #53686d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
}

.select-option-multi--single-notes .options-container {
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 0 0;
}

.select-option-multi--single-notes .value-box {
  width: auto;
  min-width: 0;
  min-height: 44px;
  height: auto;
  flex: 1 1 108px;
  box-sizing: border-box;
  margin: 0;
  padding: 7px 9px;
  border-color: rgba(43, 70, 77, 0.2);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.86);
  color: #5d6e72;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.select-option-multi--single-notes .value-box:hover {
  border-color: rgba(45, 110, 123, 0.52);
  background: #fff;
  color: #26383d;
}

.select-option-multi--single-notes .value-box.selected,
.select-option-multi--single-notes .value-box.selected:hover {
  border-color: #2d6e7b;
  background: #e1eef0;
  box-shadow: inset 0 0 0 1px rgba(45, 110, 123, 0.1);
  color: #245d68;
}

@media (prefers-reduced-motion: reduce) {
  .select-option-multi--single-notes .value-box {
    transition: none;
  }
}
</style>
