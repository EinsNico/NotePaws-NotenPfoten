<template>
  <span class="settings-section-icon" :class="'settings-icon-' + iconType" aria-hidden="true">
    <svg :viewBox="iconType === 'hands' ? '0 0 64 64' : '0 0 40 40'" focusable="false">
      <g v-if="iconType === 'notes'">
        <path d="M5 12h30M5 18h30M5 24h30M5 30h30" />
        <path class="note-stem" d="M25 8v23" />
        <ellipse cx="19" cy="31" rx="6" ry="4" />
      </g>
      <g v-else-if="iconType === 'input'">
        <rect x="5" y="9" width="30" height="22" rx="5" />
        <path d="M11 16h2M18 16h2M25 16h2M11 23h12M27 23h2" />
      </g>
      <g v-else-if="iconType === 'hands'" class="paw-shape">
        <path d="M32 29c-8 0-18 12-18 20 0 6 5 9 10 9 3 0 5-2 8-2s5 2 8 2c5 0 10-3 10-9 0-8-10-20-18-20z" />
        <ellipse cx="11" cy="29" rx="6" ry="9" transform="rotate(-22 11 29)" />
        <ellipse cx="24" cy="16" rx="6" ry="9" transform="rotate(-10 24 16)" />
        <ellipse cx="40" cy="16" rx="6" ry="9" transform="rotate(10 40 16)" />
        <ellipse cx="53" cy="29" rx="6" ry="9" transform="rotate(22 53 29)" />
      </g>
      <g v-else-if="iconType === 'chord'">
        <path d="M5 12h30M5 18h30M5 24h30M5 30h30" />
        <path class="note-stem" d="M26 6v25" />
        <ellipse cx="20" cy="19" rx="6" ry="3" />
        <ellipse cx="20" cy="25" rx="6" ry="3" />
        <ellipse cx="20" cy="31" rx="6" ry="3" />
      </g>
      <g v-else-if="iconType === 'rhythm'">
        <path d="M10 34l6-27h8l6 27zM8 34h24M15 18h10M14 26h12M20 29l8-17" />
        <circle class="icon-control" cx="28" cy="12" r="2" />
      </g>
      <g v-else-if="iconType === 'round'">
        <path d="M10 8v26M10 9h21l-5 7 5 7H10" />
      </g>
      <g v-else-if="iconType === 'vibration'">
        <rect x="12" y="6" width="16" height="28" rx="3" /><path d="M6 13l-3 7 3 7M34 13l3 7-3 7M18 29h4" />
      </g>
      <g v-else-if="iconType === 'algorithm'">
        <path d="M6 11h28M6 20h28M6 29h28" />
        <circle class="icon-control" cx="13" cy="11" r="3" />
        <circle class="icon-control" cx="27" cy="20" r="3" />
        <circle class="icon-control" cx="17" cy="29" r="3" />
      </g>
      <g v-else>
        <circle cx="20" cy="21" r="13" />
        <path d="M20 21V13M20 21l7 4M15 5h10" />
      </g>
    </svg>
  </span>
</template>

<script>
const ICON_ALIASES = {
  range: "notes",
  tonality: "notes",
  practice: "tempo",
  structure: "chord",
  behavior: "input"
};

export default {
  name: "SettingsSectionIcon",
  props: {
    type: { type: String, required: true }
  },
  computed: {
    iconType() {
      return ICON_ALIASES[this.type] || this.type;
    }
  }
};
</script>

<style scoped>
.settings-section-icon {
  --settings-icon-background: #fff0e8;
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  background: var(--settings-icon-background);
  color: #d85624;
}

.settings-icon-notes,
.settings-icon-hands,
.settings-icon-chord {
  --settings-icon-background: #e1eef0;
  color: #286a77;
}

.settings-icon-input,
.settings-icon-round {
  --settings-icon-background: #eee5da;
  color: #6b5b4c;
}

.settings-icon-vibration,
.settings-icon-algorithm {
  --settings-icon-background: #ede7f4;
  color: #725895;
}

.settings-icon-rhythm {
  --settings-icon-background: #faecd3;
  color: #a66a17;
}

svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

ellipse {
  fill: currentColor;
  stroke: none;
}

.note-stem {
  stroke-width: 3.5;
}

.icon-control {
  fill: var(--settings-icon-background);
}

.paw-shape {
  fill: currentColor;
  stroke: none;
}
</style>
