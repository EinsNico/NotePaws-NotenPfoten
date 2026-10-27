<template>
  <div class="keyboard-input" :class="{ compact }">
    <button 
      v-for="value in 13" 
      :key="value" 
      type="button"
      class="key"
      :aria-label="keyLabel(value-1)"
      :class="{black: isBlack(value-1), white: !isBlack(value-1)}" 
      :style="keyStyle[value-1]" 
      :disabled="disabled"
      @click.stop="solve(value-1)" />
  </div>
</template>

<script>
import Utils from '../model/Utils';
import Options from '../model/Options';

export default {
  name: 'KeyboardInput',
  props: {
    compact: Boolean,
    disabled: Boolean
  },
  computed: {
    keyStyle(){
      return Array.from(Array(13).keys()).map(v => Utils.hasAccidental(v) ? 
      {
        // black keys
        height: '65%',
        width: '7.5%',
        'z-index': 2,
        left: (12.5 * (this.keyPos(v-1)) + 8.75) + '%'
      } : {
        // white keys
        height: '100%',
        width: '12.5%',
        'z-index': 1,
        left: (12.5 * this.keyPos(v)) + '%'
      });
    }
  },
  methods: {
    keyLabel(value){
      const note = Utils.getDisplayNoteName(value % 12, true, Options.noteNaming);
      if(value === 0 || value === 12){
        return this.$t(value === 0 ? 'KEYBOARD_LEFT_C' : 'KEYBOARD_RIGHT_C', { note });
      }
      if(Utils.hasAccidental(value)){
        return `${note} / ${Utils.getDisplayNoteName(value, false, Options.noteNaming)}`;
      }
      return note;
    },
    isBlack(v){
      return Utils.hasAccidental(v);
    },
    keyPos(v){
      return (v <= 4) ? Math.floor(v / 2) : (v <= 11) ? Math.floor((v+1) / 2) : 7;
    },
    solve(v){
      if (!this.disabled) {
        this.$emit('solved', v);
      }
    }
  }
}
</script>

<style scoped>
.keyboard-input {
  position: relative;
  width: 92%;
  height: clamp(118px, 20vh, 150px);
  margin: 0 auto clamp(44px, 7vh, 72px);
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.18);
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 9px 21px rgba(72, 58, 45, 0.11);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.keyboard-input.compact {
  width: 100%;
  height: clamp(96px, 16vh, 124px);
  margin-bottom: 0;
}

@media (orientation: landscape) and (max-height: 600px) {
  .keyboard-input {
    height: clamp(112px, 31vh, 145px);
    margin-bottom: clamp(14px, 4vh, 24px);
  }
}

.key {
  position: absolute;
  top: 0;
  padding: 0;
  box-sizing: border-box;
  cursor: pointer;
  outline: none;
  transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

.white {
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-top: none;
  border-radius: 0 0 10px 10px;
  background: linear-gradient(180deg, #fff 0%, #fffdf9 70%, #f3ebe0 100%);
  box-shadow: inset 0 -6px 8px rgba(110, 91, 70, 0.08);
}

.white:hover,
.white:focus-visible {
  background: linear-gradient(180deg, #fff 0%, #fff7f0 72%, #f0d9c8 100%);
}

.black {
  border: 1px solid #1c474f;
  border-top: none;
  border-radius: 0 0 9px 9px;
  background: linear-gradient(180deg, #315f67 0%, #244b53 72%, #18383f 100%);
  box-shadow: 0 5px 8px rgba(28, 58, 64, 0.26);
}

.black:hover,
.black:focus-visible {
  background: linear-gradient(180deg, #41757e 0%, #2d5d66 72%, #1f454d 100%);
}

.key:focus-visible {
  outline: 3px solid rgba(231, 101, 48, 0.34);
  outline-offset: -3px;
}

.key:active {
  background: #f2c188;
  box-shadow: inset 0 4px 8px rgba(109, 67, 30, 0.2);
  transform: translateY(2px);
}

.key:disabled {
  cursor: default;
  opacity: 0.55;
}

@media (prefers-reduced-motion: reduce) {
  .key {
    transition: none;
  }
}
</style>
