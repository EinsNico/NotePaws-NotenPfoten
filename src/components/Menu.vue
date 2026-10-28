<template>
  <main
    class="menu"
    :class="{ 'has-floating-start': activeView === 'settings' && showFloatingStart }">
    <div class="single-notes-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="single-notes-backdrop" />
    </div>

    <div class="single-notes-shell">
      <SingleNotesNavigation
        active-mode="normal"
        :active-view="activeView"
        @home="goHome"
        @select-normal="selectView('settings')"
        @select-adaptive="openAdaptiveSettings"
        @select-view="selectView"
      />

      <section
        class="single-notes-content single-notes-start-view">
        <div class="start-container">
          <div class="start-summary">
            <span>{{$t('SINGLE_NOTES_SELECTION')}}</span>
            <strong>{{currentSettingsSummary}}</strong>
          </div>
          <button ref="topStart" class="start" @click="startGame">
            <span>{{$t('SINGLE_NOTES_START_TRAINING')}}</span>
            <span class="start-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section
        v-show="activeView === 'settings'"
        class="single-notes-content single-notes-settings-view"
        :aria-label="$t('SINGLE_NOTES_SETTINGS')">
        <SingleNotesSettings ref="singleNotesSettings" :sections="settingSections">
          <template slot-scope="{ activeSection }">
            <section v-if="activeSection === 'range'" class="settings-section settings-section-range">
              <header class="settings-section-heading">
                <span class="settings-section-icon settings-range-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40" focusable="false">
                    <path d="M5 12h30M5 18h30M5 24h30M5 30h30" />
                    <path class="settings-note-stem" d="M25 8v23" />
                    <ellipse cx="19" cy="31" rx="6" ry="4" />
                  </svg>
                </span>
                <div>
                  <h3>{{$t('SETTINGS_NOTE_RANGE')}}</h3>
                  <p>{{$t('SINGLE_NOTES_RANGE_DESCRIPTION')}}</p>
                </div>
              </header>
              <div class="settings-section-body">
                <div class="setting">
                  <SelectOption
                    class="range-presets"
                    appearance="single-notes"
                    :label="$t('NOTE_RANGE_PRESETS')"
                    :items="difficultyOptions"
                    :value="rangePreset"
                    @input="updateDifficulty"
                  />
                </div>
                <div class="setting">
                  <SelectOptionMulti
                    appearance="single-notes"
                    :label="$t('CLEF')"
                    :items="clefOptions"
                    :value="options.clef"
                    @input="updateClefs"
                  />
                </div>
                <div class="setting custom-range">
                  <div class="label">{{$t('FLOW_NOTE_RANGE')}}</div>
                  <div v-if="showCustomClefSettings" class="range-selectors clef-range-grid">
                    <label class="clef-range-field bass-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄢</span>{{$t('BASS_HIGHEST_NOTE')}}</span>
                      <select :value="rangeValues.customBassMaxValue" @change="updateRangeValue('customBassMaxValue', Number($event.target.value))">
                        <option
                          v-for="note in noteOptions"
                          :key="'bass-max-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field treble-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄞</span>{{$t('TREBLE_HIGHEST_NOTE')}}</span>
                      <select :value="rangeValues.customMaxValue" @change="updateRangeValue('customMaxValue', Number($event.target.value))">
                        <option
                          v-for="note in noteOptions"
                          :key="'max-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field bass-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄢</span>{{$t('BASS_LOWEST_NOTE')}}</span>
                      <select :value="rangeValues.customMinValue" @change="updateRangeValue('customMinValue', Number($event.target.value))">
                        <option
                          v-for="note in noteOptions"
                          :key="'min-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field treble-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄞</span>{{$t('TREBLE_LOWEST_NOTE')}}</span>
                      <select :value="rangeValues.customTrebleMinValue" @change="updateRangeValue('customTrebleMinValue', Number($event.target.value))">
                        <option
                          v-for="note in noteOptions"
                          :key="'treble-min-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div v-else class="range-selectors">
                    <label>
                      <span>{{$t('LOWEST_NOTE')}}</span>
                      <select v-model.number="displayedCustomMinValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'min-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <span class="range-separator">–</span>
                    <label>
                      <span>{{$t('HIGHEST_NOTE')}}</span>
                      <select v-model.number="displayedCustomMaxValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'max-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                  </div>
                  <CustomKeyboardPreview
                    :min-value="displayedCustomMinValue"
                    :max-value="displayedCustomMaxValue"
                    :accidentals="options.accidentals"
                    :show-clef-assignment="showCustomClefSettings"
                    :treble-min-value="rangeValues.customTrebleMinValue"
                    :bass-max-value="rangeValues.customBassMaxValue"
                    @update:min-value="displayedCustomMinValue = $event"
                    @update:max-value="displayedCustomMaxValue = $event"
                    @update:treble-min-value="updateRangeValue('customTrebleMinValue', $event)"
                    @update:bass-max-value="updateRangeValue('customBassMaxValue', $event)"
                  />
                  <div class="range-hint">
                    {{showCustomClefSettings ? $t('CUSTOM_CLEF_RANGES_HINT') : $t('CUSTOM_RANGE_HINT')}}
                  </div>
                </div>
                <div class="setting">
                  <SelectOption
                    appearance="single-notes"
                    :label="$t('ACCIDENTALS')"
                    :items="accidentalOptions"
                    v-model="options.accidentals"
                  />
                </div>
              </div>
            </section>

            <section v-if="activeSection === 'input'" class="settings-section settings-section-input">
              <header class="settings-section-heading">
                <span class="settings-section-icon settings-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40" focusable="false">
                    <rect x="5" y="9" width="30" height="22" rx="5" />
                    <path d="M11 16h2M18 16h2M25 16h2M11 23h12M27 23h2" />
                  </svg>
                </span>
                <div>
                  <h3>{{$t('SETTINGS_INPUT_FEEDBACK')}}</h3>
                  <p>{{$t('SINGLE_NOTES_INPUT_DESCRIPTION')}}</p>
                </div>
              </header>
              <div class="settings-section-body">
                <div class="setting">
                  <SelectOption
                    appearance="single-notes"
                    :label="$t('NOTE_INPUT')"
                    :items="inputModeOptions"
                    v-model="options.inputMode"
                  />
                </div>
                <div class="setting">
                  <SelectOption
                    appearance="single-notes"
                    :label="$t('DISPLAYCORRECTNOTE')"
                    :items="onOffOptions"
                    v-model="options.displayNote"
                  />
                </div>
              </div>
            </section>

            <section v-if="activeSection === 'practice'" class="settings-section settings-section-practice">
              <header class="settings-section-heading">
                <span class="settings-section-icon settings-practice-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40" focusable="false">
                    <circle cx="20" cy="21" r="13" />
                    <path d="M20 21V13M20 21l7 4M15 5h10" />
                  </svg>
                </span>
                <div>
                  <h3>{{$t('SINGLE_NOTES_ROUND_SETTINGS')}}</h3>
                  <p>{{$t('SINGLE_NOTES_PRACTICE_DESCRIPTION')}}</p>
                </div>
              </header>
              <div class="settings-section-body">
                <div class="setting">
                  <SelectOption
                    appearance="single-notes"
                    :label="$t('ROUND_LENGTH')"
                    :items="gameLengthOptions"
                    v-model="options.gameLength"
                  />
                </div>
              </div>
            </section>
          </template>
        </SingleNotesSettings>
      </section>

      <section
        v-if="activeView === 'statistics'"
        class="single-notes-content single-notes-statistics-view"
        :aria-label="$t('SINGLE_NOTES_STATISTICS')">
        <RoundStatisticsPanel
          :statistics="statistics"
          :options="options"
        />
      </section>

      <div
        v-show="activeView === 'settings' && showFloatingStart"
        class="floating-start-bar">
        <div class="floating-start-inner">
          <button class="floating-start" @click="startGame">
            <span>{{$t('SINGLE_NOTES_START_TRAINING')}}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<script>
import SelectOption from "./SelectOption";
import SelectOptionMulti from "./SelectOptionMulti";
import CustomKeyboardPreview from "./CustomKeyboardPreview";
import RoundStatisticsPanel from "./RoundStatisticsPanel";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import SingleNotesNavigation from "./SingleNotesNavigation";
import SingleNotesSettings from "./SingleNotesSettings";

import Options, { NORMAL_ALLOWED_CLEFS } from "../model/Options";
import Statistics from "../model/Statistics";
import Utils from "../model/Utils";
import {
  getNaturalNoteValues,
  getStatisticsDifficulty,
  usesCustomClefAssignment,
  getRangePresetValues, getEditableRangeValues, getMatchingRangePreset
} from "../model/NoteRanges";
import {
  updateExclusivePianoClefs
} from "../model/ClefSelection";

export default {
  name: "Menu",
  components: {
    SelectOption,
    SelectOptionMulti,
    CustomKeyboardPreview,
    RoundStatisticsPanel,
    HomeMusicBackdrop,
    SingleNotesNavigation,
    SingleNotesSettings
  },
  props: {
    initialView: {
      type: String,
      default: "settings"
    }
  },
  data() {
    return {
      activeView: this.initialView === "statistics" ? "statistics" : "settings",
      options: Options,
      statistics: Statistics,
      showFloatingStart: false
    };
  },
  computed: {
    rangeValues() { return getEditableRangeValues(this.options); },
    rangePreset() { return getMatchingRangePreset(this.options); },
    settingSections() {
      const labelFor = (items, value) => {
        const match = items.find(item => item.value === value);
        return match ? match.label : "";
      };
      const clefs = this.clefOptions
        .filter(item => this.options.clef.includes(item.value))
        .map(item => item.label).join(" + ");
      const rangeClefs = this.options.clef.includes("piano")
        ? ["bass", "treble"] : this.options.clef;
      const ranges = rangeClefs.map(clef => {
        const minimum = clef === "bass"
          ? this.rangeValues.customMinValue : this.rangeValues.customTrebleMinValue;
        const maximum = clef === "bass"
          ? this.rangeValues.customBassMaxValue : this.rangeValues.customMaxValue;
        return `${labelFor(this.clefOptions, clef)} ${labelFor(this.noteOptions, minimum)}–${labelFor(this.noteOptions, maximum)}`;
      }).join(" · ");
      const rangeSummary = [
        labelFor(this.difficultyOptions, this.options.difficulty),
        this.options.clef.includes("piano") ? `${clefs} (${ranges})` : ranges,
        labelFor(this.accidentalOptions, this.options.accidentals),
      ].filter(Boolean).join(" · ");
      return [
        { id: "range", title: this.$t("SETTINGS_NOTE_RANGE"), summary: rangeSummary },
        {
          id: "input", title: this.$t("SETTINGS_INPUT_FEEDBACK"),
          summary: this.$t("SINGLE_NOTES_INPUT_SUMMARY", {
            input: labelFor(this.inputModeOptions, this.options.inputMode),
            displayNote: labelFor(this.onOffOptions, this.options.displayNote)
          })
        },
        {
          id: "practice", title: this.$t("SINGLE_NOTES_ROUND_SETTINGS"),
          summary: labelFor(this.gameLengthOptions, this.options.gameLength)
        }
      ];
    },
    gameLengthOptions() {
      return [
        { value: 20, label: this.$t("twentySeconds") },
        { value: 60, label: this.$t("oneMinute") },
        { value: 300, label: this.$t("fiveMinutes") },
        { value: 0, label: this.$t("infinite") }
      ];
    },
    inputModeOptions() {
      return [
        { value: "button", label: this.$t("buttons") },
        { value: "keyboard", label: this.$t("piano") },
        { value: "midi", label: 'MIDI' }
      ];
    },
    clefOptions() {
      return [
        { value: "bass", label: this.$t("bassClef") },
        { value: "treble", label: this.$t("trebleClef") }
      ];
    },
    difficultyOptions() {
      return [
        { value: "easy", label: this.$t("easy") },
        { value: "normal", label: this.$t("normal") },
        { value: "hard", label: this.$t("hard") }
      ];
    },
    noteOptions() {
      return getNaturalNoteValues().map(value => ({
        value,
        label: `${Utils.getDisplayNoteName(
          value % 12,
          true,
          Options.noteNaming
        )}${Math.floor(value / 12)}`
      }));
    },
    showCustomClefSettings() {
      return usesCustomClefAssignment(this.options.clef);
    },
    displayedCustomMinValue: {
      get() {
        return this.showCustomClefSettings
          || this.options.clef.indexOf("bass") !== -1
          ? this.rangeValues.customMinValue
          : this.rangeValues.customTrebleMinValue;
      },
      set(value) {
        if (
          this.showCustomClefSettings
          || this.options.clef.indexOf("bass") !== -1
        ) {
          this.updateRangeValue("customMinValue", value);
        } else {
          this.updateRangeValue("customTrebleMinValue", value);
        }
      }
    },
    displayedCustomMaxValue: {
      get() {
        return this.showCustomClefSettings
          || this.options.clef.indexOf("treble") !== -1
          ? this.rangeValues.customMaxValue
          : this.rangeValues.customBassMaxValue;
      },
      set(value) {
        if (
          this.showCustomClefSettings
          || this.options.clef.indexOf("treble") !== -1
        ) {
          this.updateRangeValue("customMaxValue", value);
        } else {
          this.updateRangeValue("customBassMaxValue", value);
        }
      }
    },
    currentSettingsSummary() {
      const findLabel = (items, value) => {
        const selected = items.find(item => item.value === value);
        return selected ? selected.label : "";
      };
      const clefs = this.clefOptions
        .filter(item => this.options.clef.includes(item.value))
        .map(item => item.label)
        .join(" + ");
      const parts = [
        findLabel(this.difficultyOptions, this.options.difficulty),
        clefs,
        findLabel(this.gameLengthOptions, this.options.gameLength),
        findLabel(this.inputModeOptions, this.options.inputMode)
      ];
      return parts.filter(Boolean).join(" · ");
    },
    accidentalOptions() {
      return [
        { value: "no", label: this.$t("none") },
        { value: "onlySharp", label: this.$t("sharp") },
        { value: "onlyFlat", label: this.$t("flat") },
        { value: "sharpAndFlat", label: this.$t("sharpAndFlat") }
      ];
    },
    onOffOptions() {
      return [
        { value: false, label: this.$t("off") },
        { value: true, label: this.$t("on") }
      ];
    }
  },
  watch: {
    "options.gameLength": "saveOptions",
    "options.inputMode": "saveOptions",
    "options.displayNote": "saveOptions",
    "options.clef": function(value, previous) {
      // Saving normalizes the array; an unchanged selection must not save again.
      if (Array.isArray(previous) && value.length === previous.length
        && value.every((clef, index) => clef === previous[index])) return;
      this.updateGameType();
    },
    "options.difficulty": function() {
      this.updateGameType();
    },
    "options.customMinValue": function(value) {
      if (value > this.options.customBassMaxValue) {
        this.options.customBassMaxValue = value;
      }
      Options.sanitizeCustomRange();
      this.updateGameType();
    },
    "options.customMaxValue": function(value) {
      if (value < this.options.customTrebleMinValue) {
        this.options.customTrebleMinValue = value;
      }
      Options.sanitizeCustomRange();
      this.updateGameType();
    },
    "options.customTrebleMinValue": function(value) {
      if (value > this.options.customMaxValue) {
        this.options.customMaxValue = value;
      }
      Options.sanitizeCustomRange();
      this.updateGameType();
    },
    "options.customBassMaxValue": function(value) {
      if (value < this.options.customMinValue) {
        this.options.customMinValue = value;
      }
      Options.sanitizeCustomRange();
      this.updateGameType();
    },
    "options.accidentals": function() {
      this.updateGameType();
    }
  },
  methods: {
    saveOptions() {
      Options.saveOptions();
    },
    handleBack() {
      return this.activeView === "settings" && this.$refs.singleNotesSettings
        ? this.$refs.singleNotesSettings.handleBack() : false;
    },
    selectView(view) {
      if (this.$refs.singleNotesSettings) this.$refs.singleNotesSettings.reset();
      this.activeView = view === "statistics" ? "statistics" : "settings";
      this.showFloatingStart = false;
      this.$nextTick(() => {
        this.updateFloatingStartVisibility();
      });
    },
    openAdaptiveSettings() {
      Options.saveOptions();
      this.$emit("openAdaptiveSettings");
    },
    goHome() {
      if (this.handleBack()) return;
      Options.saveOptions();
      this.$emit("back");
    },
    updateClefs(requestedClefs) {
      this.options.clef = updateExclusivePianoClefs(
        this.options.clef,
        requestedClefs,
        NORMAL_ALLOWED_CLEFS
      ).sort();
    },
    updateDifficulty(difficulty) {
      const values = getRangePresetValues(difficulty, this.options.clef);
      if (Object.keys(values).length) Object.assign(this.options, values, {difficulty});
    },
    updateRangeValue(field, value) {
      const values = Object.assign({}, this.rangeValues, {[field]:value});
      const other = {customMinValue:"customBassMaxValue", customBassMaxValue:"customMinValue",
        customTrebleMinValue:"customMaxValue", customMaxValue:"customTrebleMinValue"}[field];
      const minimum = field === "customMinValue" || field === "customTrebleMinValue";
      if (minimum ? value > values[other] : value < values[other]) values[other] = value;
      Object.assign(this.options, values, {difficulty:"custom"});
    },
    startGame() {
      Options.saveOptions();
      this.$emit("startGame");
    },
    updateGameType() {
        this.saveOptions();
        Statistics.loadStatistics(
          Options.clef,
          getStatisticsDifficulty(Options),
          Options.accidentals
        );
    },
    updateFloatingStartVisibility() {
      const topStart = this.$refs.topStart;
      this.showFloatingStart = Boolean(
        topStart && topStart.getBoundingClientRect().bottom <= 0
      );
    }
  },
  created() {
    Options.loadOptions();
    Statistics.init();
    Statistics.loadStatistics(
      Options.clef,
      getStatisticsDifficulty(Options),
      Options.accidentals
    );
  },
  mounted() {
    window.addEventListener("scroll", this.updateFloatingStartVisibility, { passive: true });
    window.addEventListener("resize", this.updateFloatingStartVisibility);
    this.updateFloatingStartVisibility();
  },
  beforeDestroy() {
    this.saveOptions();
    window.removeEventListener("scroll", this.updateFloatingStartVisibility);
    window.removeEventListener("resize", this.updateFloatingStartVisibility);
  }
};
</script>

<style scoped>
.menu {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: hidden;
  color: #213237;
  background:
    radial-gradient(circle at 8% 6%, rgba(231, 101, 48, 0.13), transparent 25%),
    radial-gradient(circle at 94% 42%, rgba(45, 110, 123, 0.11), transparent 30%),
    #f7f2e9;
}

.menu.has-floating-start {
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}

.single-notes-backdrop-clip {
  position: fixed;
  z-index: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
}

.single-notes-backdrop {
  opacity: 0.38;
}

.single-notes-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 760px);
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

.single-notes-content {
  margin: 12px 18px 0;
}

.single-notes-statistics-view {
  box-sizing: border-box;
}

.start-container {
  display: grid;
  gap: 11px;
  padding: 13px;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  text-align: left;
}

.start-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 0 3px;
}

.start-summary span {
  color: #c95025;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.start-summary strong {
  overflow: hidden;
  color: #52676c;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button.start {
  display: flex;
  width: 100%;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 18px 13px 20px;
  border: none;
  border-radius: 17px;
  background: linear-gradient(135deg, #e76530, #cf5124);
  box-shadow: 0 9px 19px rgba(207, 81, 36, 0.23);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
}

button.start:hover,
button.start:focus-visible {
  background: linear-gradient(135deg, #ee7440, #d85727);
  box-shadow: 0 11px 22px rgba(207, 81, 36, 0.29);
  outline: 3px solid rgba(231, 101, 48, 0.24);
  outline-offset: 2px;
  transform: translateY(-1px);
}

button.start:active {
  outline: none;
  transform: translateY(0) scale(0.99);
}

.start-arrow {
  font-size: 25px;
  font-weight: 500;
  line-height: 1;
}

.floating-start-bar {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(43, 70, 77, 0.13);
  background: rgba(247, 242, 233, 0.94);
  box-shadow: 0 -5px 18px rgba(65, 54, 44, 0.13);
  backdrop-filter: blur(9px);
}

.floating-start-inner {
  max-width: 696px;
  margin: 0 auto;
}

button.floating-start {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 17px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #e76530, #cf5124);
  box-shadow: 0 7px 16px rgba(207, 81, 36, 0.22);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

button.floating-start:hover,
button.floating-start:focus-visible {
  background: linear-gradient(135deg, #ee7440, #d85727);
  outline: 3px solid rgba(231, 101, 48, 0.24);
  outline-offset: 1px;
}

.settings {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.setting {
  margin-top: 16px;
}

.settings-section {
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.settings-section-heading {
  display: grid;
  grid-template-columns: 47px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 14px 15px 13px;
  border-bottom: 1px solid rgba(43, 70, 77, 0.09);
  text-align: left;
}

.settings-section-icon {
  display: grid;
  width: 45px;
  height: 45px;
  place-items: center;
  border-radius: 14px;
  background: #fff0e8;
  color: #d85624;
}

.settings-range-icon {
  background: #e1eef0;
  color: #286a77;
}

.settings-input-icon {
  background: #eee5da;
  color: #6b5b4c;
}

.settings-section-icon svg {
  width: 30px;
  height: 30px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.settings-section-icon ellipse {
  fill: currentColor;
  stroke: none;
}

.settings-section-icon .settings-note-stem {
  stroke-width: 3.5;
}

.settings-section-heading h3 {
  margin: 0;
  color: #26383d;
  font-size: 14px;
  line-height: 1.2;
}

.settings-section-heading p {
  margin: 3px 0 0;
  color: #718084;
  font-size: 10px;
  line-height: 1.35;
}

.settings-section-body {
  padding: 1px 15px 17px;
}

@media (max-width: 370px) {
  .single-notes-content {
    margin-right: 12px;
    margin-left: 12px;
  }

  .start-summary strong {
    white-space: normal;
  }

  .settings-section-heading {
    padding-right: 12px;
    padding-left: 12px;
  }

  .settings-section-body {
    padding-right: 12px;
    padding-left: 12px;
  }




}

@media (prefers-reduced-motion: reduce) {
  button.start {
    transition: none;
  }
}
</style>

<style scoped src="../styles/note-range-controls.css"></style>
