<template>
  <div class="algorithm-controls">
    <p class="algorithm-hint">{{$t('FLOW_ALGORITHM_CUSTOM_HINT')}}</p>
    <div v-for="control in controls" :key="control.key" class="algorithm-control">
      <label :for="'algorithm-' + kind + '-' + control.key">
        <span>{{$t(control.label)}}</span>
        <strong>{{control.key === 'jumpSize'
          ? $t('FLOW_ALGORITHM_SEMITONES', { value: settings[control.key] })
          : settings[control.key] + ' / 100'}}</strong>
      </label>
      <input :id="'algorithm-' + kind + '-' + control.key" type="range"
        :min="control.key === 'jumpSize' ? 2 : 0"
        :max="control.key === 'jumpSize' ? 12 : 100" step="1"
        :value="settings[control.key]" @input="update(control.key, $event.target.value)" />
      <div class="algorithm-scale"><span>{{$t(control.low)}}</span><span>{{$t(control.high)}}</span></div>
    </div>
    <button type="button" class="algorithm-reset" @click="$emit('input', normalize({}, kind))">
      {{$t('FLOW_ALGORITHM_RESET')}}
    </button>
  </div>
</template>

<script>
import { normalizeNoteFlowAlgorithmSettings } from "../model/NoteFlowMovement";

export default {
  name: "NoteFlowAlgorithmControls",
  props: {
    value: { type: Object, default: () => ({}) },
    kind: { type: String, default: "melody" },
    bassNote: { type: Boolean, default: false },
    primaryHand: { type: String, default: "treble" }
  },
  computed: {
    settings() { return normalizeNoteFlowAlgorithmSettings(this.value, this.kind); },
    controls() {
      const controls = [
        {
          key: this.kind === "chord" && this.primaryHand === "bass" ? "bassJumpFrequency" : "jumpFrequency", label: "FLOW_ALGORITHM_FREQUENCY",
          low: "FLOW_ALGORITHM_RARE", high: "FLOW_ALGORITHM_OFTEN"
        },
        {
          key: "jumpSize", label: "FLOW_ALGORITHM_SIZE",
          low: "FLOW_ALGORITHM_SMALL", high: "FLOW_ALGORITHM_LARGE"
        }
      ];
      if (this.kind !== "chord") controls.push({
        key: "repetition", label: "FLOW_ALGORITHM_REPETITION",
        low: "FLOW_ALGORITHM_FEWER", high: "FLOW_ALGORITHM_MORE"
      }, {
        key: "noteDensity", label: "FLOW_ALGORITHM_NOTE_DENSITY",
        low: "FLOW_ALGORITHM_SPARSE", high: "FLOW_ALGORITHM_DENSE"
      });
      else if (this.bassNote && this.primaryHand !== "bass") controls.push({
        key: "bassJumpFrequency", label: "FLOW_ALGORITHM_BASS_JUMPS",
        low: "FLOW_ALGORITHM_RARE", high: "FLOW_ALGORITHM_OFTEN"
      });
      return controls;
    }
  },
  methods: {
    normalize: normalizeNoteFlowAlgorithmSettings,
    update(key, value) {
      this.$emit("input", normalizeNoteFlowAlgorithmSettings(
        Object.assign({}, this.settings, { [key]: Number(value) }), this.kind));
    }
  }
};
</script>

<style scoped>
.algorithm-controls { margin-top: 16px; padding: 15px; border: 1px solid #d5e6e9; border-radius: 15px; background: #f1f8f9; }
.algorithm-hint { margin: 0; color: #647a7f; font-size: 12px; line-height: 1.5; }
.algorithm-control { margin-top: 21px; }
.algorithm-control label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px 12px; color: #355864; font-size: 12px; font-weight: 700; }
.algorithm-control strong { color: #2d7180; white-space: nowrap; }
.algorithm-control input { display: block; box-sizing: border-box; width: 100%; min-height: 34px; margin: 5px 0 0; accent-color: #2d7180; }
.algorithm-scale { display: flex; justify-content: space-between; color: #647a7f; font-size: 11px; }
.algorithm-reset { min-height: 40px; margin-top: 18px; padding: 8px 12px; border: 1px solid #b9d2d8; border-radius: 11px; background: #fff; color: #355864; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
</style>
