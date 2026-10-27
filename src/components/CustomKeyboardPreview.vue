<template>
  <div
    class="custom-keyboard-preview"
    role="group"
    :aria-label="previewAriaLabel">
    <div class="preview-summary" aria-hidden="true">
      <span class="summary-dot"></span>
      <span>{{$t(rangeDragHintKey)}}</span>
      <span class="summary-drag-symbol">↔</span>
    </div>
    <div
      ref="keyboard"
      class="keyboard"
      :class="{ 'has-clef-handles': showClefAssignment }"
      @contextmenu.prevent>
      <div
        v-for="key in whiteKeys"
        :key="'white-' + key.value"
        class="piano-key white-key"
        :class="selectionClasses(key.value)"
        :style="key.style"
        aria-hidden="true">
        <span v-if="key.isOctaveStart" class="octave-label">
          {{octaveMarker(key.octave)}}
        </span>
      </div>
      <div
        v-for="key in blackKeys"
        :key="'black-' + key.value"
        class="piano-key black-key"
        :class="selectionClasses(key.value)"
        :style="key.style"
        aria-hidden="true"></div>
      <button
        type="button"
        class="range-handle range-handle-min"
        :class="{
          active: activeHandle === 'min',
          'most-recent': lastInteractedHandle === 'min',
          'range-handle-clef': showClefAssignment,
          'range-handle-bass': showClefAssignment,
          'coincident-left': showClefAssignment
            ? minValue === bassMaxValue
            : minValue === maxValue
        }"
        :style="handleStyle(minValue)"
        role="slider"
        :aria-describedby="precisionHintId"
        @lostpointercapture="endDrag"
        :aria-label="showClefAssignment ? $t('BASS_LOWEST_NOTE') : $t('LOWEST_NOTE')"
        :aria-valuemin="rangeMinimum"
        :aria-valuemax="bassMinHandleMaximum"
        :aria-valuenow="minValue"
        :aria-valuetext="minLabel"
        :title="(showClefAssignment ? $t('BASS_LOWEST_NOTE') : $t('LOWEST_NOTE')) + ': ' + minLabel"
        @pointerdown="startDrag('min', $event)"
        @focus="bringHandleToFront('min')"
        @keydown="moveHandleByKeyboard('min', $event)">
        <span class="range-handle-thumb" aria-hidden="true"></span>
        <span class="range-handle-value">
          <span v-if="showClefAssignment" class="range-handle-clef-symbol" aria-hidden="true">𝄢</span>
          {{minLabel}}
        </span>
      </button>
      <button
        type="button"
        class="range-handle range-handle-max"
        :class="{
          active: activeHandle === 'max',
          'most-recent': lastInteractedHandle === 'max',
          'range-handle-clef': showClefAssignment,
          'range-handle-treble': showClefAssignment,
          'coincident-right': showClefAssignment
            ? trebleMinValue === maxValue
            : minValue === maxValue
        }"
        :style="handleStyle(maxValue)"
        role="slider"
        :aria-describedby="precisionHintId"
        @lostpointercapture="endDrag"
        :aria-label="showClefAssignment ? $t('TREBLE_HIGHEST_NOTE') : $t('HIGHEST_NOTE')"
        :aria-valuemin="trebleMaxHandleMinimum"
        :aria-valuemax="rangeMaximum"
        :aria-valuenow="maxValue"
        :aria-valuetext="maxLabel"
        :title="(showClefAssignment ? $t('TREBLE_HIGHEST_NOTE') : $t('HIGHEST_NOTE')) + ': ' + maxLabel"
        @pointerdown="startDrag('max', $event)"
        @focus="bringHandleToFront('max')"
        @keydown="moveHandleByKeyboard('max', $event)">
        <span class="range-handle-value">
          <span v-if="showClefAssignment" class="range-handle-clef-symbol" aria-hidden="true">𝄞</span>
          {{maxLabel}}
        </span>
        <span class="range-handle-thumb" aria-hidden="true"></span>
      </button>
      <button
        v-if="showClefAssignment"
        type="button"
        class="range-handle range-handle-clef range-handle-treble"
        :class="{
          active: activeHandle === 'treble',
          'most-recent': lastInteractedHandle === 'treble',
          'coincident-left': trebleMinValue === maxValue
        }"
        :style="handleStyle(trebleMinValue)"
        role="slider"
        :aria-describedby="precisionHintId"
        @lostpointercapture="endDrag"
        :aria-label="$t('TREBLE_LOWEST_NOTE')"
        :aria-valuemin="rangeMinimum"
        :aria-valuemax="trebleHandleMaximum"
        :aria-valuenow="trebleMinValue"
        :aria-valuetext="trebleMinLabel"
        :title="$t('TREBLE_LOWEST_NOTE') + ': ' + trebleMinLabel"
        @pointerdown="startDrag('treble', $event)"
        @focus="bringHandleToFront('treble')"
        @keydown="moveHandleByKeyboard('treble', $event)">
        <span class="range-handle-value">
          <span class="range-handle-clef-symbol" aria-hidden="true">𝄞</span>
          {{trebleMinLabel}}
        </span>
        <span class="range-handle-thumb" aria-hidden="true"></span>
      </button>
      <button
        v-if="showClefAssignment"
        type="button"
        class="range-handle range-handle-clef range-handle-bass"
        :class="{
          active: activeHandle === 'bass',
          'most-recent': lastInteractedHandle === 'bass',
          'coincident-right': minValue === bassMaxValue
        }"
        :style="handleStyle(bassMaxValue)"
        role="slider"
        :aria-describedby="precisionHintId"
        @lostpointercapture="endDrag"
        :aria-label="$t('BASS_HIGHEST_NOTE')"
        :aria-valuemin="bassHandleMinimum"
        :aria-valuemax="rangeMaximum"
        :aria-valuenow="bassMaxValue"
        :aria-valuetext="bassMaxLabel"
        :title="$t('BASS_HIGHEST_NOTE') + ': ' + bassMaxLabel"
        @pointerdown="startDrag('bass', $event)"
        @focus="bringHandleToFront('bass')"
        @keydown="moveHandleByKeyboard('bass', $event)">
        <span class="range-handle-thumb" aria-hidden="true"></span>
        <span class="range-handle-value">
          <span class="range-handle-clef-symbol" aria-hidden="true">𝄢</span>
          {{bassMaxLabel}}
        </span>
      </button>
    </div>
    <div
      v-if="precisionMode"
      ref="magnifier"
      v-floating-lens
      class="range-magnifier"
      :class="magnifierTone"
      :style="magnifierStyle"
      aria-hidden="true">
      <div class="magnifier-heading">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="10" cy="10" r="6"></circle><path d="m15 15 6 6"></path>
        </svg>
        <span>{{$t('CUSTOM_RANGE_PRECISION')}}</span>
        <strong>{{noteLabel(handleCurrentValue(activeHandle))}}</strong>
      </div>
      <div class="magnifier-keyboard">
        <div
          v-for="key in magnifiedKeys"
          :key="key.value"
          class="piano-key"
          :class="[key.black ? 'black-key' : 'white-key', selectionClasses(key.value),
            { 'magnifier-current-key': key.value === handleCurrentValue(activeHandle) }]"
          :style="key.style">
          <span v-if="!key.black" class="magnifier-note-label">{{noteLabel(key.value)}}</span>
        </div>
      </div>
    </div>
    <div v-if="showClefAssignment" class="clef-legend" aria-hidden="true">
      <span class="legend-entry">
        <span class="legend-swatch bass-only"></span>{{$t('bassClef')}}
      </span>
      <span class="legend-entry">
        <span
          class="legend-swatch"
          :class="hasClefOverlap ? 'overlap' : 'gap'"></span>
        {{hasClefOverlap
          ? $t('bassClef') + ' + ' + $t('trebleClef')
          : $t('CUSTOM_RANGE_UNUSED')}}
      </span>
      <span class="legend-entry">
        <span class="legend-swatch treble-only"></span>{{$t('trebleClef')}}
      </span>
    </div>
    <p :id="precisionHintId" class="precision-hint">{{$t('CUSTOM_RANGE_PRECISION_HINT')}}</p>
  </div>
</template>

<script>
import Utils from "../model/Utils";
import Options from "../model/Options";
import { formatOctaveMarker } from "../model/NoteNaming";
import {
  MIN_CUSTOM_VALUE,
  MAX_CUSTOM_VALUE,
  getNaturalNoteValues
} from "../model/NoteRanges";

const KEYBOARD_MAX_VALUE = MAX_CUSTOM_VALUE; // B7: every visible key is selectable.
const NUM_WHITE_KEYS = 49; // Seven complete octaves from C1 through B7.
const WHITE_KEY_WIDTH = 100 / NUM_WHITE_KEYS;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.62;
const NATURAL_NOTE_VALUES = getNaturalNoteValues();
const LONG_PRESS_MS = 450;
const MAGNIFIER_KEY_WIDTH = 28;
const MAGNIFIER_KEY_COUNT = 7;

export default {
  name: "CustomKeyboardPreview",
  directives: {
    floatingLens: {
      // The menus use clipped/blurred cards, which otherwise contain fixed elements.
      inserted(element) { document.body.appendChild(element); },
      unbind(element) { if (element.parentNode) element.parentNode.removeChild(element); }
    }
  },
  data() {
    return {
      activeHandle: null,
      lastInteractedHandle: null,
      activePointerId: null,
      dragStartX: 0,
      dragStartY: 0,
      horizontalDragStarted: false,
      dragStartValue: 0,
      pointerX: 0,
      pointerY: 0,
      precisionMode: false,
      magnifierPosition: { left: 0, top: 0 }
    };
  },
  props: {
    minValue: {
      type: Number,
      required: true
    },
    maxValue: {
      type: Number,
      required: true
    },
    accidentals: {
      type: String,
      default: "no"
    },
    showClefAssignment: {
      type: Boolean,
      default: false
    },
    trebleMinValue: {
      type: Number,
      default: null
    },
    bassMaxValue: {
      type: Number,
      default: null
    }
  },
  computed: {
    precisionHintId() {
      return `range-precision-hint-${this._uid}`;
    },
    magnifierStyle() {
      return { left: `${this.magnifierPosition.left}px`, top: `${this.magnifierPosition.top}px` };
    },
    magnifierTone() {
      if (!this.showClefAssignment) return 'magnifier-single';
      return this.activeHandle === 'min' || this.activeHandle === 'bass'
        ? 'magnifier-bass' : 'magnifier-treble';
    },
    magnifiedKeys() {
      const index = NATURAL_NOTE_VALUES.indexOf(this.handleCurrentValue(this.activeHandle));
      const start = Math.max(0, Math.min(NUM_WHITE_KEYS - MAGNIFIER_KEY_COUNT, index - 3));
      const lower = NATURAL_NOTE_VALUES[start];
      const upper = NATURAL_NOTE_VALUES[start + MAGNIFIER_KEY_COUNT - 1];
      return this.keys.filter(key => key.value >= lower && key.value <= upper).map(key => ({
        value: key.value,
        black: key.black,
        style: {
          left: `${(parseFloat(key.style.left) / WHITE_KEY_WIDTH - start) * MAGNIFIER_KEY_WIDTH}px`,
          width: `${(key.black ? 0.62 : 1) * MAGNIFIER_KEY_WIDTH}px`
        }
      }));
    },
    rangeDragHintKey() {
      return this.showClefAssignment
        ? "CUSTOM_RANGE_DRAG_HINT"
        : "CUSTOM_RANGE_SINGLE_DRAG_HINT";
    },
    rangeMinimum() {
      return MIN_CUSTOM_VALUE;
    },
    rangeMaximum() {
      return MAX_CUSTOM_VALUE;
    },
    bassMinHandleMaximum() {
      return this.showClefAssignment
        ? this.bassMaxValue
        : this.maxValue;
    },
    trebleMaxHandleMinimum() {
      return this.showClefAssignment
        ? this.trebleMinValue
        : this.minValue;
    },
    trebleHandleMaximum() {
      return this.maxValue;
    },
    bassHandleMinimum() {
      return this.minValue;
    },
    hasClefOverlap() {
      return Math.max(this.minValue, this.trebleMinValue)
        <= Math.min(this.bassMaxValue, this.maxValue);
    },
    minLabel() {
      return this.noteLabel(this.minValue);
    },
    maxLabel() {
      return this.noteLabel(this.maxValue);
    },
    trebleMinLabel() {
      return this.noteLabel(this.trebleMinValue);
    },
    bassMaxLabel() {
      return this.noteLabel(this.bassMaxValue);
    },
    previewAriaLabel() {
      if (this.showClefAssignment) {
        return `${this.$t("bassClef")}: ${this.minLabel} – ${this.bassMaxLabel}.`
          + ` ${this.$t("trebleClef")}: ${this.trebleMinLabel} – ${this.maxLabel}.`
          + ` ${this.$t("CUSTOM_CLEF_HINT")}`;
      }
      return `${this.minLabel} – ${this.maxLabel}`;
    },
    keys() {
      const keys = [];
      let whiteIndex = 0;
      for (let value = MIN_CUSTOM_VALUE; value <= KEYBOARD_MAX_VALUE; value += 1) {
        const black = Utils.hasAccidental(value);
        if (black) {
          keys.push({
            value,
            black: true,
            style: {
              left: `${whiteIndex * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2}%`,
              width: `${BLACK_KEY_WIDTH}%`
            }
          });
        } else {
          keys.push({
            value,
            black: false,
            octave: Math.floor(value / 12),
            isOctaveStart: value % 12 === 0,
            style: {
              left: `${whiteIndex * WHITE_KEY_WIDTH}%`,
              width: `${WHITE_KEY_WIDTH}%`
            }
          });
          whiteIndex += 1;
        }
      }
      return keys;
    },
    whiteKeys() {
      return this.keys.filter(key => !key.black);
    },
    blackKeys() {
      return this.keys.filter(key => key.black);
    }
  },
  methods: {
    handleStyle(value) {
      return { left: `${this.keyCenter(value)}%` };
    },
    startDrag(handle, event) {
      if (event.isPrimary === false || this.activeHandle !== null
        || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }
      this.bringHandleToFront(handle);
      this.activeHandle = handle;
      this.activePointerId = event.pointerId;
      this.dragStartX = this.pointerX = event.clientX;
      this.dragStartY = this.pointerY = event.clientY;
      this.dragStartValue = this.handleCurrentValue(handle);
      this.horizontalDragStarted = false;
      this._dragTarget = event.currentTarget;
      if (this._dragTarget && this._dragTarget.setPointerCapture) {
        this._dragTarget.setPointerCapture(event.pointerId);
      }
      this._longPressTimer = setTimeout(this.activatePrecision, LONG_PRESS_MS);
      window.addEventListener("pointermove", this.handlePointerMove, { passive: false });
      window.addEventListener("pointerup", this.endDrag);
      window.addEventListener("pointercancel", this.endDrag);
      window.addEventListener("blur", this.stopDrag);
      window.addEventListener("resize", this.stopDrag);
      window.addEventListener("scroll", this.stopDrag, true);
      window.addEventListener("keydown", this.cancelDragByKeyboard);
    },
    bringHandleToFront(handle) {
      this.lastInteractedHandle = handle;
    },
    clearLongPress() {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    },
    activatePrecision() {
      this.clearLongPress();
      if (this.activeHandle === null || this.horizontalDragStarted) return;
      this.precisionMode = true;
      // Re-anchor at the held note: enabling the lens must never change the range.
      this.dragStartX = this.pointerX;
      this.dragStartValue = this.handleCurrentValue(this.activeHandle);
      this.positionMagnifier();
    },
    positionMagnifier() {
      const width = 222;
      const height = 128;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, this.pointerX - width / 2));
      const above = this.pointerY - height - 48;
      const top = above >= 8 ? above : this.pointerY + 48;
      this.magnifierPosition = {
        left,
        top: Math.max(8, Math.min(window.innerHeight - height - 8, top))
      };
    },
    handlePointerMove(event) {
      if (this.activeHandle === null || event.pointerId !== this.activePointerId) return;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      const horizontalDistance = Math.abs(event.clientX - this.dragStartX);
      const verticalDistance = Math.abs(event.clientY - this.dragStartY);
      if (!this.precisionMode && !this.horizontalDragStarted) {
        if (verticalDistance > 7 && verticalDistance > horizontalDistance) {
          this.stopDrag();
          return;
        }
        if (horizontalDistance < 4 || horizontalDistance <= verticalDistance) return;
        this.horizontalDragStarted = true;
        this.clearLongPress();
      }
      if (event.cancelable) event.preventDefault();
      const keyboard = this.$refs.keyboard;
      if (!keyboard) return;
      const bounds = keyboard.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const keyWidth = bounds.width / NUM_WHITE_KEYS;
      // At least three times finer, with >= 28 physical pixels per white key on phones.
      const scale = this.precisionMode ? Math.max(3, MAGNIFIER_KEY_WIDTH / keyWidth) : 1;
      const anchor = bounds.left + this.keyCenter(this.dragStartValue) / 100 * bounds.width;
      const requested = this.naturalValueFromClientX(anchor + (event.clientX - this.dragStartX) / scale);
      this.updateHandle(this.activeHandle, requested);
      if (this.precisionMode) this.positionMagnifier();
    },
    endDrag(event) {
      if (event && event.pointerId !== this.activePointerId) return;
      this.stopDrag();
    },
    cancelDragByKeyboard(event) {
      if (event.key === 'Escape') this.stopDrag();
    },
    stopDrag() {
      this.clearLongPress();
      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.endDrag);
      window.removeEventListener("pointercancel", this.endDrag);
      window.removeEventListener("blur", this.stopDrag);
      window.removeEventListener("resize", this.stopDrag);
      window.removeEventListener("scroll", this.stopDrag, true);
      window.removeEventListener("keydown", this.cancelDragByKeyboard);
      const target = this._dragTarget;
      const pointerId = this.activePointerId;
      this.activeHandle = null;
      this.activePointerId = null;
      this.horizontalDragStarted = false;
      this.precisionMode = false;
      this._dragTarget = null;
      if (target && target.hasPointerCapture && target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    },
    naturalValueFromClientX(clientX) {
      const keyboard = this.$refs.keyboard;
      if (!keyboard) {
        return this.handleCurrentValue(this.activeHandle);
      }
      const bounds = keyboard.getBoundingClientRect();
      const ratio = bounds.width > 0
        ? Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width))
        : 0;
      let closestValue = NATURAL_NOTE_VALUES[0];
      let closestDistance = Infinity;
      NATURAL_NOTE_VALUES.forEach(value => {
        const distance = Math.abs(this.keyCenter(value) / 100 - ratio);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestValue = value;
        }
      });
      return closestValue;
    },
    updateHandle(handle, requestedValue) {
      const configurations = {
        min: {
          lower: MIN_CUSTOM_VALUE,
          upper: this.bassMinHandleMaximum,
          eventName: "update:min-value"
        },
        max: {
          lower: this.trebleMaxHandleMinimum,
          upper: MAX_CUSTOM_VALUE,
          eventName: "update:max-value"
        },
        treble: {
          lower: MIN_CUSTOM_VALUE,
          upper: this.trebleHandleMaximum,
          eventName: "update:treble-min-value"
        },
        bass: {
          lower: this.bassHandleMinimum,
          upper: MAX_CUSTOM_VALUE,
          eventName: "update:bass-max-value"
        }
      };
      const configuration = configurations[handle];
      if (!configuration) {
        return;
      }
      const value = Math.max(
        configuration.lower,
        Math.min(configuration.upper, requestedValue)
      );
      const currentValue = this.handleCurrentValue(handle);
      if (value !== currentValue) {
        this.$emit(configuration.eventName, value);
      }
    },
    handleCurrentValue(handle) {
      const values = {
        min: this.minValue,
        max: this.maxValue,
        treble: this.trebleMinValue,
        bass: this.bassMaxValue
      };
      return Object.prototype.hasOwnProperty.call(values, handle)
        ? values[handle]
        : this.minValue;
    },
    moveHandleByKeyboard(handle, event) {
      const directionByKey = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1
      };
      const currentValue = this.handleCurrentValue(handle);
      let currentIndex = NATURAL_NOTE_VALUES.indexOf(currentValue);
      if (currentIndex === -1) {
        currentIndex = 0;
      }
      let targetIndex = currentIndex;
      if (Object.prototype.hasOwnProperty.call(directionByKey, event.key)) {
        targetIndex += directionByKey[event.key];
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = NATURAL_NOTE_VALUES.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.bringHandleToFront(handle);
      targetIndex = Math.max(0, Math.min(NATURAL_NOTE_VALUES.length - 1, targetIndex));
      this.updateHandle(handle, NATURAL_NOTE_VALUES[targetIndex]);
    },
    isSelected(value) {
      return value >= this.minValue && value <= this.maxValue;
    },
    selectionClasses(value) {
      if (this.accidentals === "no" && Utils.hasAccidental(value)) {
        return {};
      }
      if (!this.showClefAssignment) {
        return this.isSelected(value) ? { selected: true } : {};
      }
      const bassSelected = value >= this.minValue && value <= this.bassMaxValue;
      const trebleSelected = value >= this.trebleMinValue && value <= this.maxValue;
      if (bassSelected && trebleSelected) {
        return { selected: true, overlap: true };
      }
      if (bassSelected) {
        return { selected: true, "bass-only": true };
      }
      if (trebleSelected) {
        return { selected: true, "treble-only": true };
      }
      return {};
    },
    keyCenter(value) {
      let whiteKeysBefore = 0;
      for (let candidate = MIN_CUSTOM_VALUE; candidate < value; candidate += 1) {
        if (!Utils.hasAccidental(candidate)) {
          whiteKeysBefore += 1;
        }
      }
      return Utils.hasAccidental(value)
        ? whiteKeysBefore * WHITE_KEY_WIDTH
        : (whiteKeysBefore + 0.5) * WHITE_KEY_WIDTH;
    },
    noteLabel(value) {
      return `${Utils.getDisplayNoteName(
        value % 12,
        true,
        Options.noteNaming
      )}${Math.floor(value / 12)}`;
    },
    octaveMarker(octave) {
      return formatOctaveMarker(octave, Options.noteNaming);
    }
  },
  beforeDestroy() {
    this.stopDrag();
  }
};
</script>

<style scoped>
.custom-keyboard-preview {
  box-sizing: border-box;
  width: 100%;
  max-width: 620px;
  margin: 14px auto 8px;
  padding: 11px 10px 10px;
  border: 1px solid rgba(43, 70, 77, 0.13);
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(255, 253, 248, 0.94), rgba(241, 248, 247, 0.88));
  box-shadow:
    0 8px 18px rgba(65, 54, 44, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.preview-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 1px 10px;
  color: #29464d;
  font-size: 11px;
  font-weight: 700;
}

.summary-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #e76530;
}

.summary-drag-symbol {
  color: #d75a28;
  font-size: 15px;
  line-height: 1;
}

.keyboard {
  position: relative;
  width: 100%;
  height: clamp(58px, 15vw, 82px);
  margin-top: 52px;
  touch-action: pan-y;
  margin-bottom: 20px;
  border-radius: 7px 7px 9px 9px;
  background: #dce4e1;
  box-shadow:
    0 7px 13px rgba(34, 52, 56, 0.13),
    0 1px 0 rgba(255, 255, 255, 0.7) inset;
}

.keyboard.has-clef-handles {
  margin-top: 68px;
  margin-bottom: 68px;
}

.piano-key {
  position: absolute;
  top: 0;
  box-sizing: border-box;
}

.white-key {
  height: 100%;
  border: 1px solid #b9c6c3;
  border-left-width: 0;
  border-radius: 0 0 3px 3px;
  background: linear-gradient(180deg, #fffefb 0%, #f4efe5 100%);
  box-shadow: inset 0 -6px 9px rgba(66, 60, 49, 0.04);
  z-index: 1;
}

.white-key:first-child {
  border-left-width: 1px;
}

.white-key.selected {
  background: linear-gradient(180deg, #ffd5bb 0%, #efa06d 100%);
}

.black-key {
  height: 62%;
  border: 1px solid #18383e;
  border-radius: 0 0 3px 3px;
  background: linear-gradient(180deg, #315159 0%, #1d353a 100%);
  box-shadow: 0 3px 4px rgba(20, 38, 42, 0.25);
  z-index: 2;
}

.black-key.selected {
  border-color: #ad4b25;
  background: linear-gradient(180deg, #e97b47 0%, #b94c25 100%);
}

.white-key.bass-only,
.legend-swatch.bass-only {
  background: linear-gradient(180deg, #d3eaec 0%, #91c6ce 100%);
}

.white-key.treble-only,
.legend-swatch.treble-only {
  background: linear-gradient(180deg, #ffe2bd 0%, #efb06f 100%);
}

.white-key.overlap,
.legend-swatch.overlap {
  background: repeating-linear-gradient(
    135deg,
    #a8d1d6 0,
    #a8d1d6 5px,
    #f2bd83 5px,
    #f2bd83 10px
  );
}

.legend-swatch.gap {
  border-color: rgba(55, 78, 83, 0.24);
  background: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.92) 0,
    rgba(255, 255, 255, 0.92) 4px,
    rgba(100, 123, 128, 0.16) 4px,
    rgba(100, 123, 128, 0.16) 8px
  );
}

.black-key.bass-only {
  border-color: #315f68;
  background: linear-gradient(180deg, #4e8791 0%, #2f646e 100%);
}

.black-key.treble-only {
  border-color: #7f4d2b;
  background: linear-gradient(180deg, #b97845 0%, #82502e 100%);
}

.black-key.overlap {
  background: repeating-linear-gradient(
    135deg,
    #447b85 0,
    #447b85 5px,
    #9e6338 5px,
    #9e6338 10px
  );
}

.octave-label {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  color: #6b7d80;
  font-size: clamp(7px, 2.2vw, 10px);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.range-handle {
  position: absolute;
  top: -44px;
  z-index: 5;
  width: 44px;
  height: 44px;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  transform: translateX(-50%);
  border: none;
  outline: none;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: ew-resize;
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.range-handle.most-recent {
  z-index: 7;
}

.range-handle:focus-visible,
.range-handle.active {
  z-index: 8;
}

.range-handle-value {
  position: absolute;
  top: 0;
  left: 50%;
  min-width: 28px;
  box-sizing: border-box;
  padding: 3px 5px;
  transform: translateX(-50%);
  border: 1px solid #bc4b21;
  border-radius: 8px;
  background: linear-gradient(180deg, #ef7743, #d45525);
  box-shadow: 0 3px 7px rgba(151, 65, 32, 0.2);
  font-size: 9px;
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
}

.range-handle-thumb {
  position: absolute;
  top: 20px;
  left: 50%;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  transform: translateX(-50%);
  border: 2px solid #fffdf8;
  border-radius: 50% 50% 7px 7px;
  background: #e76530;
  box-shadow:
    0 0 0 1px #b84922,
    0 3px 7px rgba(116, 58, 35, 0.24);
}

.range-handle-thumb::after {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 2px;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: #c24b20;
  content: "";
}

.range-handle:hover .range-handle-value,
.range-handle:focus-visible .range-handle-value,
.range-handle.active .range-handle-value {
  background: linear-gradient(180deg, #f58852, #dc5d2a);
  box-shadow:
    0 4px 9px rgba(151, 65, 32, 0.25),
    0 0 0 3px rgba(231, 101, 48, 0.18);
}

.range-handle:focus-visible .range-handle-thumb,
.range-handle.active .range-handle-thumb {
  box-shadow:
    0 0 0 1px #b84922,
    0 0 0 5px rgba(231, 101, 48, 0.2),
    0 3px 7px rgba(116, 58, 35, 0.24);
}

.range-handle.coincident-left {
  margin-left: -14px;
}

.range-handle.coincident-right {
  margin-left: 14px;
}

.range-handle-treble {
  top: -44px;
}

.range-handle-bass {
  top: calc(100% + 6px);
}

.range-handle-clef .range-handle-value {
  display: inline-flex;
  min-width: 39px;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.range-handle-clef-symbol {
  font-size: 13px;
  font-weight: 400;
  line-height: 0.8;
}

.range-handle-treble .range-handle-value {
  border-color: #a96b28;
  background: linear-gradient(180deg, #efbc76, #ce8740);
}

.range-handle-treble .range-handle-thumb {
  background: #dea052;
  box-shadow:
    0 0 0 1px #9f682d,
    0 3px 7px rgba(111, 72, 31, 0.22);
}

.range-handle-treble .range-handle-thumb::after {
  background: #a66c2d;
}

.range-handle-bass .range-handle-thumb {
  top: 0;
  border-radius: 7px 7px 50% 50%;
  background: #3e7c88;
  box-shadow:
    0 0 0 1px #245d68,
    0 3px 7px rgba(29, 74, 82, 0.22);
}

.range-handle-bass .range-handle-thumb::after {
  top: -12px;
  height: 12px;
  background: #2d6874;
}

.range-handle-bass .range-handle-value {
  top: 21px;
  border-color: #245d68;
  background: linear-gradient(180deg, #55939e, #326f7b);
}

.range-handle-treble:hover .range-handle-value,
.range-handle-treble:focus-visible .range-handle-value,
.range-handle-treble.active .range-handle-value {
  background: linear-gradient(180deg, #f3c987, #d9964b);
  box-shadow:
    0 4px 9px rgba(111, 72, 31, 0.22),
    0 0 0 3px rgba(222, 160, 82, 0.2);
}

.range-handle-bass:hover .range-handle-value,
.range-handle-bass:focus-visible .range-handle-value,
.range-handle-bass.active .range-handle-value {
  background: linear-gradient(180deg, #63a2ad, #3d7d89);
  box-shadow:
    0 4px 9px rgba(29, 74, 82, 0.22),
    0 0 0 3px rgba(45, 110, 123, 0.2);
}

.range-handle-treble:focus-visible .range-handle-thumb,
.range-handle-treble.active .range-handle-thumb {
  box-shadow:
    0 0 0 1px #9f682d,
    0 0 0 5px rgba(222, 160, 82, 0.2),
    0 3px 7px rgba(111, 72, 31, 0.22);
}

.range-handle-bass:focus-visible .range-handle-thumb,
.range-handle-bass.active .range-handle-thumb {
  box-shadow:
    0 0 0 1px #245d68,
    0 0 0 5px rgba(45, 110, 123, 0.2),
    0 3px 7px rgba(29, 74, 82, 0.22);
}

.clef-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 8px;
  margin: 8px 1px 0;
  color: #53686d;
  font-size: 10px;
  font-weight: 700;
}

.legend-entry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 1px solid rgba(43, 70, 77, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  white-space: nowrap;
}

.legend-swatch {
  display: inline-block;
  width: 17px;
  height: 9px;
  border: 1px solid rgba(43, 70, 77, 0.24);
  border-radius: 3px;
  box-sizing: border-box;
}

.precision-hint {
  margin: 12px 0 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.4;
  color: #53686d;
}

.range-magnifier {
  --magnifier-accent: #c45227;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  position: fixed;
  z-index: 1200;
  box-sizing: border-box;
  width: 222px;
  height: 128px;
  padding: 11px 12px;
  border: 1px solid var(--magnifier-accent);
  border-radius: 17px;
  background: #fffdf8;
  color: var(--magnifier-accent);
  box-shadow: 0 8px 30px rgba(34, 52, 56, 0.23), 0 2px 5px rgba(34, 52, 56, 0.12);
  pointer-events: none;
  user-select: none;
}

.magnifier-bass { --magnifier-accent: #326f7b; }
.magnifier-treble { --magnifier-accent: #a56829; }

.magnifier-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 11px;
  line-height: 20px;
}

.magnifier-heading strong {
  margin-left: auto;
  font-size: 18px;
}

.magnifier-keyboard {
  position: relative;
  width: 196px;
  height: 68px;
}

.magnifier-note-label {
  position: absolute;
  bottom: 4px;
  left: 0;
  width: 100%;
  color: #29464d;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.magnifier-current-key::after {
  content: "";
  position: absolute;
  inset: 1px;
  border: 2px solid var(--magnifier-accent);
  border-radius: 0 0 3px 3px;
}

@media (max-width: 420px) {
  .custom-keyboard-preview {
    padding-right: 7px;
    padding-left: 7px;
  }

}
</style>
