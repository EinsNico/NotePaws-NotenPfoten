<template>
  <div class="flow-circle-selector">
    <div
      class="flow-circle"
      role="radiogroup"
      :aria-label="$t('FLOW_CIRCLE_ARIA_LABEL')">
      <div class="flow-circle-rings" aria-hidden="true"></div>

      <template v-for="segment in displaySegments">
        <button
          :key="'major-' + segment.circlePosition"
          type="button"
          class="flow-key-node major-node"
          :class="{
            selected: containsSelected(segment.majorDisplay),
            ambiguous: segment.majorDisplay.length > 1
          }"
          :style="nodeStyle(segment.circlePosition, 'major')"
          :disabled="segment.majorAllowed.length === 0"
          :aria-pressed="containsSelected(segment.majorDisplay) ? 'true' : 'false'"
          :aria-label="nodeAriaLabel(segment.majorDisplay, 'major', segment.majorAllowed.length === 0)"
          :title="nodeAriaLabel(segment.majorDisplay, 'major', segment.majorAllowed.length === 0)"
          @click="chooseCandidates(segment.majorAllowed)">
            {{nodeLabel(segment.majorDisplay)}}
        </button>
        <button
          :key="'minor-' + segment.circlePosition"
          type="button"
          class="flow-key-node minor-node"
          :class="{
            selected: containsSelected(segment.minorDisplay),
            ambiguous: segment.minorDisplay.length > 1
          }"
          :style="nodeStyle(segment.circlePosition, 'minor')"
          :disabled="segment.minorAllowed.length === 0"
          :aria-pressed="containsSelected(segment.minorDisplay) ? 'true' : 'false'"
          :aria-label="nodeAriaLabel(segment.minorDisplay, 'minor', segment.minorAllowed.length === 0)"
          :title="nodeAriaLabel(segment.minorDisplay, 'minor', segment.minorAllowed.length === 0)"
          @click="chooseCandidates(segment.minorAllowed)">
            {{nodeLabel(segment.minorDisplay)}}
        </button>
      </template>

      <div class="flow-circle-center" aria-live="polite">
        <strong>{{selectedLabel}}</strong>
        <span>{{selectedModeLabel}}</span>
        <small>{{selectedSignatureLabel}}</small>
      </div>
    </div>

    <div v-if="variantCandidates.length > 1" class="flow-key-variants">
      <span>{{$t('FLOW_CIRCLE_SPELLING')}}</span>
      <div>
        <button
          v-for="candidate in variantCandidates"
          :key="candidate.id"
          type="button"
          :class="{ selected: candidate.id === value }"
          :aria-pressed="candidate.id === value ? 'true' : 'false'"
          @click="selectTonality(candidate)">
            {{fullLabel(candidate)}}
        </button>
      </div>
    </div>

    <div class="flow-circle-legend" aria-hidden="true">
      <span><i class="major-dot"></i>{{$t('FLOW_KEY_MAJOR')}}</span>
      <span><i class="minor-dot"></i>{{$t('FLOW_KEY_MINOR')}}</span>
      <span><i class="disabled-dot"></i>{{$t('FLOW_KEY_UNAVAILABLE')}}</span>
    </div>
  </div>
</template>

<script>
import {
  getNoteFlowCircleSegments,
  getNoteFlowTonality,
  isNoteFlowTonalityAllowed
} from "../model/NoteFlowTonality";
import { formatNoteFlowTonalityLabel } from "../model/NoteFlowKeyLabels";

export default {
  name: "NoteFlowCircleSelector",
  props: {
    value: {
      type: String,
      default: "C-major"
    },
    accidentals: {
      type: String,
      default: "no"
    },
    noteNaming: {
      type: String,
      default: null
    }
  },
  data() {
    return {
      activeVariantIds: []
    };
  },
  computed: {
    displaySegments() {
      return getNoteFlowCircleSegments().map(segment => {
        const major = segment.tonalities.filter(tonality => tonality.mode === "major");
        const minor = segment.tonalities.filter(tonality => tonality.mode === "minor");
        const allowed = segment.tonalities.filter(tonality => (
          isNoteFlowTonalityAllowed(tonality, this.accidentals)
        ));
        const majorAllowed = allowed.filter(tonality => tonality.mode === "major");
        const minorAllowed = allowed.filter(tonality => tonality.mode === "minor");
        return {
          circlePosition: segment.circlePosition,
          majorAllowed,
          minorAllowed,
          majorDisplay: majorAllowed.length > 0 ? majorAllowed : major,
          minorDisplay: minorAllowed.length > 0 ? minorAllowed : minor
        };
      });
    },
    selectedTonality() {
      return getNoteFlowTonality(this.value) || getNoteFlowTonality("C-major");
    },
    selectedLabel() {
      return formatNoteFlowTonalityLabel(this.selectedTonality, this.noteNaming);
    },
    selectedModeLabel() {
      return this.selectedTonality.mode === "minor"
        ? this.$t("FLOW_KEY_MINOR")
        : this.$t("FLOW_KEY_MAJOR");
    },
    selectedSignatureLabel() {
      const signature = this.selectedTonality.signature;
      if (signature.count === 0) {
        return this.$t("FLOW_KEY_NO_SIGNATURE");
      }
      return `${signature.count} ${signature.type === "sharp" ? "♯" : "♭"}`;
    },
    variantCandidates() {
      if (this.activeVariantIds.length > 0) {
        return this.activeVariantIds.map(getNoteFlowTonality).filter(Boolean);
      }
      const segment = this.displaySegments.find(item => (
        item.circlePosition === this.selectedTonality.circlePosition
      ));
      return this.selectedTonality.mode === "minor"
        ? segment.minorAllowed
        : segment.majorAllowed;
    }
  },
  watch: {
    value(value) {
      if (this.activeVariantIds.indexOf(value) === -1) {
        this.activeVariantIds = [];
      }
    },
    accidentals() {
      this.activeVariantIds = [];
    }
  },
  methods: {
    nodeStyle(circlePosition, ring) {
      const angle = circlePosition * 30 - 90;
      const radians = angle * Math.PI / 180;
      const radius = ring === "major" ? 45 : 28;
      return {
        left: `${50 + Math.cos(radians) * radius}%`,
        top: `${50 + Math.sin(radians) * radius}%`
      };
    },
    containsSelected(candidates) {
      return candidates.some(candidate => candidate.id === this.value);
    },
    nodeLabel(candidates) {
      if (candidates.length === 0) {
        return "–";
      }
      const selected = candidates.find(candidate => candidate.id === this.value);
      return formatNoteFlowTonalityLabel(selected || candidates[0], this.noteNaming);
    },
    fullLabel(tonality) {
      const tonic = formatNoteFlowTonalityLabel(tonality, this.noteNaming);
      const mode = tonality.mode === "minor"
        ? this.$t("FLOW_KEY_MINOR")
        : this.$t("FLOW_KEY_MAJOR");
      return `${tonic} ${mode}`;
    },
    nodeAriaLabel(candidates, mode, unavailable) {
      if (candidates.length === 0) {
        return `${mode === "minor" ? this.$t("FLOW_KEY_MINOR") : this.$t("FLOW_KEY_MAJOR")} · ${this.$t("FLOW_KEY_UNAVAILABLE")}`;
      }
      const labels = candidates.map(candidate => this.fullLabel(candidate)).join(" / ");
      return unavailable ? `${labels} · ${this.$t("FLOW_KEY_UNAVAILABLE")}` : labels;
    },
    chooseCandidates(candidates) {
      if (candidates.length === 0) {
        return;
      }
      this.activeVariantIds = candidates.map(candidate => candidate.id);
      const selected = candidates.find(candidate => candidate.id === this.value);
      this.selectTonality(selected || candidates[0]);
    },
    selectTonality(tonality) {
      this.$emit("input", tonality.id);
    }
  }
};
</script>

<style scoped>
.flow-circle-selector {
  padding: 12px 8px 10px;
  border: 1px solid rgba(112, 86, 138, 0.17);
  border-radius: 18px;
  background: rgba(247, 243, 250, 0.82);
}

.flow-circle {
  position: relative;
  width: min(100%, 320px);
  aspect-ratio: 1;
  margin: 0 auto;
}

.flow-circle-rings {
  position: absolute;
  inset: 5%;
  border: 1px solid rgba(112, 86, 138, 0.18);
  border-radius: 50%;
  background:
    radial-gradient(circle, transparent 0 30%, rgba(255,255,255,.9) 30.5% 46%, transparent 46.5%),
    repeating-conic-gradient(from -15deg, rgba(112, 86, 138, 0.12) 0 1deg, transparent 1deg 30deg),
    rgba(235, 226, 242, 0.55);
  box-shadow: inset 0 0 0 28px rgba(255, 255, 255, 0.44);
}

.flow-circle-rings::after {
  position: absolute;
  inset: 19%;
  border: 1px solid rgba(112, 86, 138, 0.16);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  content: "";
}

.flow-key-node {
  position: absolute;
  z-index: 2;
  display: grid;
  box-sizing: border-box;
  min-width: 0;
  place-items: center;
  padding: 2px;
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-radius: 11px;
  transform: translate(-50%, -50%);
  font: inherit;
  font-weight: 800;
  line-height: 1;
}

.major-node {
  width: 14%;
  height: 12.5%;
  min-height: 32px;
  background: rgba(255, 255, 255, 0.96);
  color: #3f5f67;
  font-size: 14px;
}

.minor-node {
  width: 12.5%;
  height: 9%;
  min-height: 24px;
  background: #e7f1f2;
  color: #386a74;
  font-size: 13px;
}

.flow-key-node.selected {
  z-index: 3;
  border-color: #dc6736;
  background: #fff0e8;
  box-shadow: 0 3px 9px rgba(160, 76, 40, 0.2);
  color: #a6411e;
}

.flow-key-node:disabled {
  border-color: rgba(43, 70, 77, 0.08);
  background: rgba(255, 255, 255, 0.5);
  color: rgba(82, 103, 108, 0.46);
}

.flow-key-node:focus-visible {
  z-index: 4;
  outline: 3px solid #a6411e;
  outline-offset: 1px;
}

.flow-circle-center {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  display: flex;
  width: 76px;
  height: 76px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 1px solid rgba(112, 86, 138, 0.16);
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 5px 15px rgba(82, 62, 98, 0.1);
  color: #59466b;
  transform: translate(-50%, -50%);
}

.flow-circle-center strong {
  font-size: 18px;
}

.flow-circle-center span {
  margin-top: 1px;
  font-size: 9px;
  font-weight: 800;
}

.flow-circle-center small {
  margin-top: 2px;
  color: #897b91;
  font-size: 8px;
}

.flow-key-variants {
  margin: 6px 4px 0;
  padding: 10px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.78);
  text-align: left;
}

.flow-key-variants > span {
  color: #74657c;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.flow-key-variants > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 7px;
}

.flow-key-variants button {
  min-height: 44px;
  padding: 8px;
  border: 1px solid rgba(112, 86, 138, 0.2);
  border-radius: 11px;
  background: #fff;
  color: #65536f;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.flow-key-variants button.selected {
  border-color: #dc6736;
  background: #fff0e8;
  color: #a6411e;
}

.flow-circle-legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  color: #756a7b;
  font-size: 8px;
}

.flow-circle-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.flow-circle-legend i {
  width: 8px;
  height: 8px;
  border: 1px solid rgba(43, 70, 77, 0.16);
  border-radius: 3px;
  background: #fff;
}

.flow-circle-legend .minor-dot {
  background: #e7f1f2;
}

.flow-circle-legend .disabled-dot {
  opacity: 0.35;
}

</style>
