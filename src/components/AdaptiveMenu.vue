<template>
  <main
    class="adaptive-menu"
    :class="{ 'has-floating-start': activeView === 'settings' && showFloatingStart }">
    <div class="single-notes-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="single-notes-backdrop" />
    </div>

    <div class="single-notes-shell">
      <SingleNotesNavigation
        active-mode="adaptive"
        :active-view="activeView"
        @home="goHome"
        @select-normal="goBack"
        @select-adaptive="selectView('settings')"
        @select-view="selectView"
      />

      <LearningStorageAlert />

      <section
        class="single-notes-content single-notes-start-view">
        <div class="adaptive-start-container">
          <div class="adaptive-start-summary">
            <span>{{$t('SINGLE_NOTES_SELECTION')}}</span>
            <strong>{{currentSettingsSummary}}</strong>
          </div>
          <button ref="topStart" type="button" class="adaptive-start" @click="startAdaptive">
            <span>{{$t('START_ADAPTIVE_TRAINING')}}</span>
            <span class="adaptive-start-arrow" aria-hidden="true">→</span>
          </button>
        </div>

      </section>

      <section
        v-show="activeView === 'settings'"
        class="single-notes-content single-notes-settings-view"
        :aria-label="$t('SINGLE_NOTES_SETTINGS')">
        <SingleNotesSettings ref="singleNotesSettings" :sections="settingSections">
          <template slot-scope="{ activeSection }">
            <section v-if="activeSection === 'range'" class="adaptive-settings-card adaptive-settings-range">
              <header class="adaptive-settings-heading">
                <span class="adaptive-settings-icon adaptive-range-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40" focusable="false">
                    <path d="M5 12h30M5 18h30M5 24h30M5 30h30" />
                    <path class="adaptive-note-stem" d="M25 8v23" />
                    <ellipse cx="19" cy="31" rx="6" ry="4" />
                  </svg>
                </span>
                <div>
                  <h3>{{$t('SETTINGS_NOTE_RANGE')}}</h3>
                  <p>{{$t('ADAPTIVE_RANGE_DESCRIPTION')}}</p>
                </div>
              </header>
              <div class="adaptive-settings-body">
                <div class="setting">
                  <SelectOptionMulti
                    appearance="single-notes"
                    :label="$t('CLEF')"
                    :items="clefOptions"
                    :value="options.clef"
                    @input="updateClefs"
                  />
                </div>
                <div class="setting">
                  <SelectOption class="range-presets" appearance="single-notes" :label="$t('NOTE_RANGE_PRESETS')"
                    :items="difficultyOptions" :value="rangePreset" @input="updateDifficulty" />
                </div>
                <div class="setting custom-range">
                  <div class="label">{{$t('FLOW_NOTE_RANGE')}}</div>
                  <div v-if="showCustomClefSettings" class="range-selectors clef-range-grid">
                    <label class="clef-range-field bass-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄢</span>{{$t('BASS_HIGHEST_NOTE')}}</span>
                      <select v-model.number="options.customBassMaxValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'adaptive-bass-max-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field treble-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄞</span>{{$t('TREBLE_HIGHEST_NOTE')}}</span>
                      <select v-model.number="options.customMaxValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'adaptive-max-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field bass-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄢</span>{{$t('BASS_LOWEST_NOTE')}}</span>
                      <select v-model.number="options.customMinValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'adaptive-min-' + note.value"
                          :value="note.value">
                            {{note.label}}
                        </option>
                      </select>
                    </label>
                    <label class="clef-range-field treble-range-field">
                      <span><span class="field-clef-symbol" aria-hidden="true">𝄞</span>{{$t('TREBLE_LOWEST_NOTE')}}</span>
                      <select v-model.number="options.customTrebleMinValue">
                        <option
                          v-for="note in noteOptions"
                          :key="'adaptive-treble-min-' + note.value"
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
                          :key="'adaptive-min-' + note.value"
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
                          :key="'adaptive-max-' + note.value"
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
                    :treble-min-value="options.customTrebleMinValue"
                    :bass-max-value="options.customBassMaxValue"
                    @update:min-value="displayedCustomMinValue = $event"
                    @update:max-value="displayedCustomMaxValue = $event"
                    @update:treble-min-value="options.customTrebleMinValue = $event"
                    @update:bass-max-value="options.customBassMaxValue = $event"
                  />
                  <div class="range-hint">
                    {{showCustomClefSettings ? $t('CUSTOM_CLEF_RANGES_HINT') : $t('ADAPTIVE_RANGE_HINT')}}
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

                <div class="range-expansion-setting">
                  <SelectOption
                    appearance="single-notes"
                    :label="$t('ADAPTIVE_EXPANSION_SETTING')"
                    :items="onOffOptions"
                    v-model="options.rangeExpansionEnabled"
                  />
                  <div class="setting-hint">
                    {{$t('ADAPTIVE_EXPANSION_SETTING_HINT')}}
                  </div>
                </div>

                <AdaptiveRangeExpansion
                  v-if="options.rangeExpansionEnabled"
                  :evaluation="rangeExpansionEvaluation"
                  @apply="applyRangeExpansion"
                />
              </div>
            </section>

            <section v-if="activeSection === 'input'" class="adaptive-settings-card adaptive-settings-input">
              <header class="adaptive-settings-heading">
                <span class="adaptive-settings-icon adaptive-input-icon" aria-hidden="true">
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
              <div class="adaptive-settings-body">
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

            <section v-if="activeSection === 'practice'" class="adaptive-settings-card adaptive-settings-practice">
              <header class="adaptive-settings-heading">
                <span class="adaptive-settings-icon adaptive-practice-icon" aria-hidden="true">
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
              <div class="adaptive-settings-body">
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
        <section class="adaptive-progress learning-statistics" aria-labelledby="adaptive-progress-title">
          <header class="statistics-summary">
            <span class="statistics-summary-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40" focusable="false">
                <path d="M8 31V22M16 31V14M24 31V19M32 31V8" />
                <path d="M5 31h30" />
              </svg>
            </span>
            <span class="statistics-summary-copy">
              <small>{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small>
              <h2 id="adaptive-progress-title">{{$t('ADAPTIVE_STATISTICS_TITLE')}}</h2>
              <span>{{$t('ADAPTIVE_STATISTICS_DESCRIPTION')}}</span>
            </span>
            <span class="summary-meta">
              <span class="statistics-count">{{$tc('ADAPTIVE_STATISTICS_NOTE_COUNT', adaptiveStatistics.attempts, {
                count: adaptiveStatistics.attempts
              })}}</span>
            </span>
          </header>
          <div class="adaptive-progress-content">
            <section class="learning-input-card statistics-section-card" :aria-label="$t('ROUND_STATS_FILTER_TITLE')">
              <header class="learning-input-heading">
                <span class="learning-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40" focusable="false">
                    <path d="M7 11h26M7 20h26M7 29h26" />
                    <circle cx="15" cy="11" r="3" /><circle cx="26" cy="20" r="3" /><circle cx="18" cy="29" r="3" />
                  </svg>
                </span>
                <div>
                  <h3>{{$t('ROUND_STATS_FILTER_TITLE')}}</h3>
                  <p>{{$t('ADAPTIVE_STATISTICS_INPUT_DESCRIPTION')}}</p>
                </div>
              </header>
              <div class="learning-input-body">
                <div class="learning-input-label">{{$t('ROUND_STATS_INPUT_LABEL')}}</div>
                <div class="progress-input-options statistics-input-switch" role="group" :aria-label="$t('ROUND_STATS_INPUT_LABEL')">
                  <button
                    v-for="input in progressInputOptions"
                    :key="input.value"
                    type="button"
                    :class="{ selected: progressStore.inputGroup === input.value }"
                    :aria-pressed="progressStore.inputGroup === input.value ? 'true' : 'false'"
                    @click="selectProgressInput(input.value)">
                      {{input.label}}
                  </button>
                </div>
              </div>
            </section>
            <p class="adaptive-progress-input">
              {{$t('ADAPTIVE_PROGRESS_INPUT_LABEL', { input: progressInputLabel })}}
            </p>
            <AdaptiveProgressDashboard :summary="adaptiveStatistics">
              <AdaptiveProgressKeyboard
                class="statistics-section-card"
                :progress="progressStore.progress"
                :min-value="options.customMinValue"
                :max-value="options.customMaxValue"
                :clefs="options.clef"
                :accidentals="options.accidentals"
                :candidates="adaptiveCandidates"
              />
            </AdaptiveProgressDashboard>

            <AdaptiveHistoryChart
              :history="progressStore.history"
              :statistics-snapshot="progressStore.statisticsSnapshot"
              :input-group="progressStore.inputGroup"
            />

            <section class="learning-reset-card statistics-section-card" :aria-label="$t('RESET_ADAPTIVE_PROGRESS')">
              <button
                v-if="!showResetConfirmation"
                type="button"
                class="reset-progress"
                :disabled="!hasProgress"
                @click="showResetConfirmation = true">
                  {{$t('RESET_ADAPTIVE_PROGRESS')}}
              </button>
              <div v-else class="reset-confirmation">
                <div>{{$t('RESET_ADAPTIVE_PROGRESS_CONFIRMATION', {
                  input: progressInputLabel
                })}}</div>
                <div class="reset-actions">
                  <button type="button" class="cancel-reset" @click="showResetConfirmation = false">
                    {{$t('CANCEL')}}
                  </button>
                  <button type="button" class="confirm-reset" @click="resetProgress">
                    {{$t('CONFIRM_RESET')}}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>

      <div
        v-show="activeView === 'settings' && showFloatingStart"
        class="floating-start-bar">
        <div class="floating-start-inner">
          <button type="button" class="floating-start" @click="startAdaptive">
            <span>{{$t('START_ADAPTIVE_TRAINING')}}</span>
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
import AdaptiveProgressKeyboard from "./AdaptiveProgressKeyboard";
import AdaptiveProgressDashboard from "./AdaptiveProgressDashboard";
import AdaptiveHistoryChart from "./AdaptiveHistoryChart";
import AdaptiveRangeExpansion from "./AdaptiveRangeExpansion";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import SingleNotesNavigation from "./SingleNotesNavigation";
import SingleNotesSettings from "./SingleNotesSettings";
import LearningStorageAlert from "./LearningStorageAlert";

import AdaptiveOptions, { ADAPTIVE_ALLOWED_CLEFS } from "../model/AdaptiveOptions";
import Options from "../model/Options";
import AdaptiveProgress, {
  ADAPTIVE_INPUT_MIDI,
  ADAPTIVE_INPUT_SCREEN,
  getAdaptiveInputGroup
} from "../model/AdaptiveProgress";
import { createAdaptiveCandidates } from "../model/AdaptiveExercises";
import { createNoteLearningKey } from "../model/AdaptiveLearning";
import { summarizeAdaptiveCandidates } from "../model/AdaptiveStatistics";
import {
  applyAdaptiveRangeRecommendation,
  evaluateAdaptiveRangeExpansion
} from "../model/AdaptiveRangeExpansion";
import Utils from "../model/Utils";
import { getNaturalNoteValues, usesCustomClefAssignment, getRangePresetValues, getMatchingRangePreset } from "../model/NoteRanges";
import { updateExclusivePianoClefs } from "../model/ClefSelection";
import SingleNotesLearningStorage from "../model/SingleNotesLearningStorage";

export default {
  name: "AdaptiveMenu",
  components: {
    SelectOption,
    SelectOptionMulti,
    CustomKeyboardPreview,
    AdaptiveProgressKeyboard,
    AdaptiveProgressDashboard,
    AdaptiveHistoryChart,
    AdaptiveRangeExpansion,
    HomeMusicBackdrop,
    SingleNotesNavigation,
    SingleNotesSettings,
    LearningStorageAlert
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
      options: AdaptiveOptions,
      progressStore: AdaptiveProgress,
      showResetConfirmation: false,
      showFloatingStart: false
    };
  },
  computed: {
    rangePreset() { return getMatchingRangePreset(this.options); },
    difficultyOptions() {
      return ["easy", "normal", "hard"].map(value => ({value, label:this.$t(value)}));
    },
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
          ? this.options.customMinValue : this.options.customTrebleMinValue;
        const maximum = clef === "bass"
          ? this.options.customBassMaxValue : this.options.customMaxValue;
        return `${labelFor(this.clefOptions, clef)} ${labelFor(this.noteOptions, minimum)}–${labelFor(this.noteOptions, maximum)}`;
      }).join(" · ");
      const rangeSummary = [
        this.options.clef.includes("piano") ? `${clefs} (${ranges})` : ranges,
        labelFor(this.accidentalOptions, this.options.accidentals),
        this.$t("SINGLE_NOTES_EXPANSION_SUMMARY", {
          state: labelFor(this.onOffOptions, this.options.rangeExpansionEnabled)
        })
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
        { value: "midi", label: "MIDI" }
      ];
    },
    clefOptions() {
      return [
        { value: "bass", label: this.$t("bassClef") },
        { value: "treble", label: this.$t("trebleClef") }
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
          ? this.options.customMinValue
          : this.options.customTrebleMinValue;
      },
      set(value) {
        if (
          this.showCustomClefSettings
          || this.options.clef.indexOf("bass") !== -1
        ) {
          this.options.customMinValue = value;
        } else {
          this.options.customTrebleMinValue = value;
        }
      }
    },
    displayedCustomMaxValue: {
      get() {
        return this.showCustomClefSettings
          || this.options.clef.indexOf("treble") !== -1
          ? this.options.customMaxValue
          : this.options.customBassMaxValue;
      },
      set(value) {
        if (
          this.showCustomClefSettings
          || this.options.clef.indexOf("treble") !== -1
        ) {
          this.options.customMaxValue = value;
        } else {
          this.options.customBassMaxValue = value;
        }
      }
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
      const minimum = findLabel(this.noteOptions, this.displayedCustomMinValue);
      const maximum = findLabel(this.noteOptions, this.displayedCustomMaxValue);
      return [
        clefs,
        minimum && maximum ? `${minimum}–${maximum}` : "",
        findLabel(this.gameLengthOptions, this.options.gameLength),
        findLabel(this.inputModeOptions, this.options.inputMode)
      ].filter(Boolean).join(" · ");
    },
    progressSummary() {
      return this.progressStore.getSummary();
    },
    progressInputLabel() {
      return this.progressStore.inputGroup === ADAPTIVE_INPUT_MIDI
        ? this.$t("ROUND_STATS_INPUT_MIDI")
        : this.$t("ROUND_STATS_INPUT_SCREEN");
    },
    progressInputOptions() {
      return [
        { value: ADAPTIVE_INPUT_SCREEN, label: this.$t("ROUND_STATS_INPUT_SCREEN") },
        { value: ADAPTIVE_INPUT_MIDI, label: this.$t("ROUND_STATS_INPUT_MIDI") }
      ];
    },
    adaptiveCandidates() {
      return createAdaptiveCandidates(this.options);
    },
    adaptiveStatistics() {
      return summarizeAdaptiveCandidates(
        this.progressStore.progress,
        this.adaptiveCandidates
      );
    },
    rangeExpansionEvaluation() {
      return evaluateAdaptiveRangeExpansion(
        this.progressStore.progress,
        this.options
      );
    },
    hasProgress() {
      return this.progressSummary.attempts > 0;
    }
  },
  watch: {
    "options.gameLength": "saveOptions",
    "options.inputMode": "updateInputMode",
    "options.rangeExpansionEnabled": "saveOptions",
    "options.accidentals": "saveOptions",
    "options.displayNote": "saveOptions",
    "options.customMinValue": "updateBassMinimum",
    "options.customMaxValue": "updateTrebleMaximum",
    "options.customTrebleMinValue": "updateTrebleMinimum",
    "options.customBassMaxValue": "updateBassMaximum"
  },
  methods: {
    updateDifficulty(difficulty) {
      const values = getRangePresetValues(difficulty, this.options.clef);
      if (!Object.keys(values).length) return;
      Object.assign(this.options, values);
      this.saveOptions();
    },
    handleBack() {
      return this.activeView === "settings" && this.$refs.singleNotesSettings
        ? this.$refs.singleNotesSettings.handleBack() : false;
    },
    selectView(view) {
      if (this.$refs.singleNotesSettings) this.$refs.singleNotesSettings.reset();
      this.activeView = view === "statistics" ? "statistics" : "settings";
      if (this.activeView !== "statistics" && this.progressStore.inputGroup !== getAdaptiveInputGroup(this.options.inputMode)) {
        this.showResetConfirmation = false;
        this.progressStore.loadFromDatabase(this.options.inputMode);
      }
      this.showFloatingStart = false;
      this.$nextTick(this.updateFloatingStartVisibility);
    },
    updateClefs(requestedClefs) {
      this.options.clef = updateExclusivePianoClefs(
        this.options.clef,
        requestedClefs,
        ADAPTIVE_ALLOWED_CLEFS
      ).sort();
      this.saveOptions();
    },
    updateBassMinimum(value) {
      if (value > this.options.customBassMaxValue) {
        this.options.customBassMaxValue = value;
      }
      this.saveOptions();
    },
    updateTrebleMaximum(value) {
      if (value < this.options.customTrebleMinValue) {
        this.options.customTrebleMinValue = value;
      }
      this.saveOptions();
    },
    updateTrebleMinimum(value) {
      if (value > this.options.customMaxValue) {
        this.options.customMaxValue = value;
      }
      this.saveOptions();
    },
    updateBassMaximum(value) {
      if (value < this.options.customMinValue) {
        this.options.customMinValue = value;
      }
      this.saveOptions();
    },
    saveOptions() {
      AdaptiveOptions.saveOptions();
    },
    async updateInputMode(inputMode) {
      this.saveOptions();
      this.showResetConfirmation = false;
      await this.progressStore.loadFromDatabase(inputMode);
    },
    async selectProgressInput(inputMode) {
      this.showResetConfirmation = false;
      await this.progressStore.loadFromDatabase(inputMode);
    },
    applyRangeExpansion(recommendationId, confirmApplied) {
      const previousKeys = createAdaptiveCandidates(this.options)
        .map(createNoteLearningKey);
      const updated = applyAdaptiveRangeRecommendation(
        this.options,
        recommendationId
      );
      const updatedKeys = createAdaptiveCandidates(updated).map(createNoteLearningKey);
      const expandsSelection = keys => previousKeys.every(key => keys.includes(key))
        && keys.some(key => !previousKeys.includes(key));
      if (!expandsSelection(updatedKeys)) {
        if (typeof confirmApplied === "function") confirmApplied(false);
        return false;
      }
      this.options.customMinValue = updated.customMinValue;
      this.options.customMaxValue = updated.customMaxValue;
      this.options.customTrebleMinValue = updated.customTrebleMinValue;
      this.options.customBassMaxValue = updated.customBassMaxValue;
      this.saveOptions();
      const applied = expandsSelection(
        createAdaptiveCandidates(this.options).map(createNoteLearningKey)
      );
      if (typeof confirmApplied === "function") confirmApplied(applied);
      return applied;
    },
    async startAdaptive() {
      this.saveOptions();
      await this.progressStore.loadFromDatabase(this.options.inputMode);
      if (SingleNotesLearningStorage.status.state === "error") {
        return;
      }
      this.$emit("startAdaptive");
    },
    resetProgress() {
      this.progressStore.reset();
      this.showResetConfirmation = false;
    },
    goBack() {
      this.saveOptions();
      this.$emit("back");
    },
    goHome() {
      if (this.handleBack()) return;
      this.saveOptions();
      this.$emit("home");
    },
    updateFloatingStartVisibility() {
      const topStart = this.$refs.topStart;
      this.showFloatingStart = Boolean(
        topStart && topStart.getBoundingClientRect().bottom <= 0
      );
    }
  },
  created() {
    AdaptiveOptions.loadOptions();
    AdaptiveProgress.loadFromDatabase(this.options.inputMode);
  },
  mounted() {
    window.addEventListener("scroll", this.updateFloatingStartVisibility, { passive: true });
    window.addEventListener("resize", this.updateFloatingStartVisibility);
    this.updateFloatingStartVisibility();
  },
  beforeDestroy() {
    window.removeEventListener("scroll", this.updateFloatingStartVisibility);
    window.removeEventListener("resize", this.updateFloatingStartVisibility);
    this.saveOptions();
  }
};
</script>

<style scoped>
.progress-input-options {
  margin-bottom: 10px;
}

.adaptive-menu {
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

.adaptive-menu.has-floating-start {
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

.adaptive-header {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 12px;
  padding: 15px 15px 5px;
}

.adaptive-heading-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 7px 11px;
  border: 1px solid #dbeaf0;
  border-left: 4px solid #e85c2c;
  border-radius: 12px;
  background: linear-gradient(135deg, #fffaf7 0%, #f6fbfd 72%);
  text-align: left;
}

.adaptive-brand-logo {
  width: 68px;
  height: 68px;
  flex: 0 0 auto;
  object-fit: contain;
}

.adaptive-header h2 {
  margin: 0;
  color: #b74520;
}

.adaptive-header p {
  margin: 5px 0 0;
  color: #555;
  font-size: 10pt;
}

button.back {
  padding: 9px 13px;
  border: 1px solid #d99276;
  border-radius: 9px;
  background: white;
  color: #333;
  cursor: pointer;
}

.adaptive-start-container {
  display: grid;
  gap: 11px;
  padding: 13px;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  text-align: left;
}

.adaptive-start-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 0 3px;
}

.adaptive-start-summary span {
  color: #c95025;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.adaptive-start-summary strong {
  overflow: hidden;
  color: #52676c;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button.adaptive-start {
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

.adaptive-start-arrow {
  font-size: 25px;
  font-weight: 500;
  line-height: 1;
}

.setting-hint {
  margin-top: 6px;
  color: #64777b;
  font-size: 10px;
  line-height: 1.4;
}

button.adaptive-start:hover,
button.adaptive-start:focus-visible {
  background: linear-gradient(135deg, #ee7440, #d85727);
  box-shadow: 0 11px 22px rgba(207, 81, 36, 0.29);
  outline: 3px solid rgba(231, 101, 48, 0.24);
  outline-offset: 2px;
  transform: translateY(-1px);
}

button.adaptive-start:active {
  outline: none;
  transform: translateY(0) scale(0.99);
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

.adaptive-settings {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.adaptive-settings-card {
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.adaptive-settings-heading {
  display: grid;
  grid-template-columns: 47px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 14px 15px 13px;
  border-bottom: 1px solid rgba(43, 70, 77, 0.09);
  text-align: left;
}

.adaptive-settings-icon {
  display: grid;
  width: 45px;
  height: 45px;
  place-items: center;
  border-radius: 14px;
  background: #fff0e8;
  color: #d85624;
}

.adaptive-range-icon {
  background: #e1eef0;
  color: #286a77;
}

.adaptive-input-icon {
  background: #eee5da;
  color: #6b5b4c;
}

.adaptive-settings-icon svg {
  width: 30px;
  height: 30px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.adaptive-settings-icon ellipse {
  fill: currentColor;
  stroke: none;
}

.adaptive-settings-icon .adaptive-note-stem {
  stroke-width: 3.5;
}

.adaptive-settings-heading h3 {
  margin: 0;
  color: #26383d;
  font-size: 14px;
  line-height: 1.2;
}

.adaptive-settings-heading p {
  margin: 3px 0 0;
  color: #718084;
  font-size: 10px;
  line-height: 1.35;
}

.adaptive-settings-body {
  padding: 1px 15px 17px;
}

.setting {
  margin-top: 16px;
}

.settings-section {
  margin: 14px 10px 0;
  padding: 5px 5px 12px;
  border: 1px solid #d8eaf1;
  border-radius: 11px;
  background: #fbfdfe;
}

.settings-section h4 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 5px 5px 2px;
  color: #315f72;
  font-size: 10pt;
  letter-spacing: 0.04em;
}

.settings-section h4::before {
  width: 17px;
  height: 3px;
  border-radius: 2px;
  background: #e85c2c;
  content: "";
}

@media (max-width: 420px) {
  .adaptive-header {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
  }

  .adaptive-heading-content {
    gap: 7px;
    padding: 6px 8px;
  }

  .adaptive-brand-logo {
    width: 54px;
    height: 54px;
  }
}

.custom-range {
  margin: 17px 0 2px;
  padding: 15px 12px 13px;
  border: 1px solid rgba(45, 110, 123, 0.22);
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(232, 244, 244, 0.82), rgba(255, 250, 243, 0.76));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 7px 16px rgba(55, 76, 78, 0.07);
}

.custom-range > .label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #315f68;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: left;
}

.custom-range > .label::before {
  width: 4px;
  height: 19px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ed7440, #cd4e22);
  box-shadow: 0 2px 5px rgba(205, 78, 34, 0.18);
  content: "";
}

.range-selectors {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
}

.custom-range > .range-selectors {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
}

.custom-range > .clef-range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 9px 8px;
}

.clef-range-field {
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
}

.clef-range-field > span {
  display: flex;
  min-height: 27px;
  align-items: center;
  gap: 5px;
  line-height: 1.2;
}

.field-clef-symbol {
  flex: 0 0 auto;
  font-size: 17px;
  font-weight: 400;
  line-height: 1;
}

.bass-range-field {
  border-color: rgba(45, 110, 123, 0.2);
  background: rgba(207, 231, 233, 0.5);
  color: #2d6874 !important;
}

.treble-range-field {
  border-color: rgba(181, 119, 51, 0.2);
  background: rgba(249, 224, 185, 0.48);
  color: #98632e !important;
}

.bass-range-field select:focus-visible {
  border-color: #2d6e7b;
  outline-color: rgba(45, 110, 123, 0.2);
}

.treble-range-field select:focus-visible {
  border-color: #c9853c;
  outline-color: rgba(201, 133, 60, 0.2);
}

.range-selectors label {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  flex-direction: column;
  align-items: stretch;
  color: #53686d;
  font-size: 10px;
  font-weight: 700;
  text-align: left;
}

.range-selectors select {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  margin: 6px 0 0;
  padding: 0 30px 0 11px;
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-radius: 12px;
  background: rgba(255, 253, 248, 0.96);
  box-shadow:
    0 3px 8px rgba(58, 68, 65, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: #26383d;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.range-selectors select:focus-visible {
  border-color: #e76530;
  outline: 3px solid rgba(231, 101, 48, 0.2);
  outline-offset: 2px;
}

.range-separator {
  margin-bottom: 14px;
  color: #8a999b;
  font-weight: bold;
}

.range-hint {
  margin: 7px 2px 0;
  color: #64777b;
  font-size: 10px;
  line-height: 1.45;
  text-align: left;
}

.range-expansion-setting {
  margin-top: 14px;
  padding: 13px 10px 10px;
  border: 1px solid rgba(45, 110, 123, 0.13);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.52);
}

.range-expansion-setting .setting-hint {
  margin-right: 2px;
  margin-left: 2px;
  text-align: left;
}

@media (max-width: 370px) {
  .single-notes-content {
    margin-right: 12px;
    margin-left: 12px;
  }

  .adaptive-start-summary strong {
    white-space: normal;
  }

  .adaptive-settings-heading,
  .adaptive-settings-body {
    padding-right: 12px;
    padding-left: 12px;
  }

  .custom-range {
    padding-right: 9px;
    padding-left: 9px;
  }

  .range-selectors {
    gap: 5px;
  }

  .custom-range > .clef-range-grid {
    gap: 7px 5px;
    padding: 7px;
  }

  .clef-range-field {
    padding: 7px 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  button.adaptive-start {
    transition: none;
  }
}

.adaptive-progress {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0 0 15px;
  text-align: left;
}

.adaptive-progress-content {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding-top: 12px;
}

.learning-input-heading {
  display: grid;
  grid-template-columns: 47px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 14px 15px 13px;
  border-bottom: 1px solid rgba(43, 70, 77, 0.09);
}
.learning-input-icon {
  display: grid;
  width: 45px;
  height: 45px;
  place-items: center;
  border-radius: 14px;
  background: #fff0e8;
  color: #d85624;
}
.learning-input-icon svg {
  width: 29px;
  height: 29px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}
.learning-input-icon circle { fill: #fff0e8; }
.learning-input-heading h3 { margin: 0; color: #26383d; font-size: 14px; line-height: 1.2; }
.learning-input-heading p { margin: 3px 0 0; color: #718084; font-size: 10px; line-height: 1.35; }
.learning-input-body { padding: 3px 15px 17px; }
.learning-input-label { margin: 15px 0 8px; color: #53686d; font-size: 11px; font-weight: 800; letter-spacing: 0.07em; }
.learning-reset-card { padding: 14px 15px; }

.adaptive-progress-input {
  margin: 0;
  padding: 10px 13px;
  border-radius: 8px;
  background: #eaf6fa;
  color: #315f72;
  font-size: 8.5pt;
  font-weight: bold;
  text-align: left;
}

button.reset-progress,
.reset-actions button {
  padding: 9px 13px;
  border: 1px solid #888;
  border-radius: 8px;
  background: white;
  color: #333;
}

button.reset-progress {
  margin: 0;
}

button.reset-progress:disabled {
  color: #aaa;
  border-color: #ccc;
}

.reset-confirmation {
  padding: 10px;
  border: 1px solid #e0b4b4;
  border-radius: 8px;
  background: #fff7f7;
  color: #6b3030;
  font-size: 10pt;
}

.reset-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 9px;
}

.reset-actions button.confirm-reset {
  border-color: #b75d5d;
  background: #b75d5d;
  color: white;
}
</style>
