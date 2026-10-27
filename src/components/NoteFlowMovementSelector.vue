<template>
  <div class="flow-movement-field">
    <span class="flow-movement-label">{{$t(labelKey)}}</span>
    <div class="flow-movement-choices" role="group" :aria-label="$t(labelKey)">
      <button v-for="movement in movements" :key="movement" type="button"
        :class="{ selected: selected === movement }"
        :aria-pressed="selected === movement" @click="$emit('input', movement)">
        {{$t(movementLabelKey(movement))}}
      </button>
    </div>
    <p>{{$t(hintKey)}}</p>
  </div>
</template>

<script>
import { NOTE_FLOW_MOVEMENTS, normalizeNoteFlowMovement, getNoteFlowMovementLabelKey } from "../model/NoteFlowMovement";

export default {
  name: "NoteFlowMovementSelector",
  props: {
    kind: { type: String, default: "melody" },
    value: { type: String, default: "mixed" }
  },
  computed: {
    movements() { return NOTE_FLOW_MOVEMENTS; },
    selected() { return normalizeNoteFlowMovement(this.value); },
    labelKey() { return this.kind === "chord" ? "FLOW_CHORD_MOVEMENT" : "FLOW_MELODY_MOVEMENT"; },
    hintKey() { return this.labelKey + "_" + this.selected.toUpperCase(); }
  },
  methods: { movementLabelKey: getNoteFlowMovementLabelKey }
};
</script>

<style scoped>
.flow-movement-field { margin: 16px 0; }
.flow-movement-label { display: block; margin-bottom: 7px; color: #355864; font-size: 12px; font-weight: 800; }
.flow-movement-choices { display: flex; flex-wrap: wrap; gap: 7px; }
.flow-movement-choices button { flex: 1; min-width: 70px; min-height: 44px; padding: 8px; border: 1px solid #d4e0e2; border-radius: 12px; background: #fff; color: #355864; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.flow-movement-choices button.selected { border-color: #85aeb7; background: #e8f5f7; }
.flow-movement-field p { margin: 8px 0 0; color: #647a7f; font-size: 12px; line-height: 1.45; }
@media (max-width: 480px) {
  .flow-movement-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .flow-movement-choices button { min-width: 0; }
}
</style>
