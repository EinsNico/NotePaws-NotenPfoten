<template>
  <div class="button-input" :class="{ compact }">
    <div v-for="value in 12" :key="value-1" class="button-container" :style="gridParams[value-1]">
      <button
        :class="{ accidental: isAccidental(value-1), natural: !isAccidental(value-1) }"
        :disabled="disabled"
        @click="solve(value-1)">
        {{noteNames[value-1]}}
      </button>
    </div>
  </div>
</template>

<script>
import Utils from '../model/Utils';
import Options from '../model/Options';

export default {
  name: 'ButtonInput',
  props: {
    isSharp: Boolean,
    compact: Boolean,
    disabled: Boolean
  },
  computed: {
    noteNames(){
      return Utils.getDisplayNoteNamesArray(
        this.isSharp,
        Options.noteNaming
      );
    },
    gridParams(){
      return Array.from(Array(12).keys()).map(v => ({
        'grid-row': Utils.hasAccidental(v) ? 1 : 2,
        'grid-column': (v <= 4 ? v+1 : v+2) + '/ span 2'
      }));
    }
  },
  methods: {
    isAccidental(v) {
      return Utils.hasAccidental(v);
    },
    solve(v) {
      if (!this.disabled) {
        this.$emit('solved', v);
      }
    }
  }
}
</script>

<style scoped>
.button-input {
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  width: 100%;
  padding: 0 10px;
  margin: 0 auto clamp(44px, 7vh, 72px);
  box-sizing: border-box;
}

.button-input.compact {
  padding: 0;
  margin-bottom: 0;
}

@media (orientation: landscape) and (max-height: 600px) {
  .button-input {
    height: 150px;
    align-content: end;
    margin-bottom: clamp(14px, 4vh, 24px);
  }
}

.button-container {
  height: clamp(44px, 6.5vh, 52px);
  padding: 2px;
  box-sizing: border-box;
}

button {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  cursor: pointer;
  outline: none;
  font: inherit;
  font-size: 12px;
  font-weight: bold;
  transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease,
    transform 120ms ease;
}

button:disabled {
  cursor: default;
  opacity: 0.48;
}

button.natural {
  border: 1px solid rgba(43, 70, 77, 0.2);
  background: rgba(255, 253, 249, 0.94);
  box-shadow: 0 5px 12px rgba(72, 58, 45, 0.1);
  color: #26383d;
}

button.accidental {
  border: 1px solid rgba(24, 71, 80, 0.72);
  background: linear-gradient(180deg, #3d7883, #285f69);
  box-shadow: 0 5px 12px rgba(35, 83, 92, 0.18);
  color: #fff;
}

button.natural:hover,
button.natural:focus-visible {
  border-color: rgba(231, 101, 48, 0.58);
  background: #fff5ee;
}

button.accidental:hover,
button.accidental:focus-visible {
  border-color: #1f535d;
  background: linear-gradient(180deg, #4a8792, #2d6974);
}

button:focus-visible {
  outline: 3px solid rgba(231, 101, 48, 0.23);
  outline-offset: 1px;
}

button:active {
  background: #f2c188;
  border-color: #d98531;
  color: #56351d;
  transform: translateY(1px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
