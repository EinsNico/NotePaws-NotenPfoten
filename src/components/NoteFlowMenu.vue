<template>
  <main class="note-flow-menu">
    <div class="note-flow-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="note-flow-backdrop" />
    </div>

    <div class="note-flow-shell">
      <div class="note-flow-header">
        <button type="button" class="note-flow-back" @click="goBack">
          <span aria-hidden="true">←</span>
          {{$t('BACK')}}
        </button>

        <NoteFlowModeHeader
          :title="$t('FLOW_MELODY_MODE_TITLE')"
          :description="$t('FLOW_HUB_MELODY_DESCRIPTION')"
          icon="♪"
        />
      </div>

      <NoteFlowViewTabs :active-view="activeView" @select-view="selectView" />

      <section class="note-flow-content">
        <div class="note-flow-start-card">
          <div class="note-flow-summary">
            <span>{{$t('FLOW_SELECTION')}}</span>
            <strong>{{currentSettingsSummary}}</strong>
          </div>
          <button type="button" class="note-flow-start" :disabled="!inputAvailability.inputAvailable" @click="startPreview">
            <span>{{$t('FLOW_START_PREVIEW')}}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p v-if="!inputAvailability.inputAvailable" class="setting-hint" role="status">
          {{$t('FLOW_KEYBOARD_SINGLE_STAFF_ONLY')}}
        </p>

      </section>

      <section v-show="activeView === 'settings'" class="note-flow-content">
        <div v-if="!activeSettingSection" class="note-flow-settings note-flow-section-list">
          <button
            v-for="section in settingSections"
            :key="section.id"
            type="button"
            class="note-flow-section-link"
            @click="openSettingSection(section.id)">
              <SettingsSectionIcon :type="section.id" />
              <span class="note-flow-section-copy">
                <strong>{{section.title}}</strong>
                <small>{{section.summary}}</small>
              </span>
              <span class="note-flow-section-arrow" aria-hidden="true">→</span>
          </button>
        </div>

        <div v-else class="note-flow-settings note-flow-settings-detail">
          <button type="button" class="note-flow-settings-return" @click="closeSettingSection">
            <span aria-hidden="true">←</span>
            {{$t('FLOW_MENU_ALL_SETTINGS')}}
          </button>
          <section v-if="activeSettingSection === 'notes'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="notes" />
              <div>
                <h2>{{$t('FLOW_MENU_NOTES_TITLE')}}</h2>
                <p>{{$t('FLOW_MENU_NOTES_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body flow-range-controls">
              <div class="flow-notes-field">
                <span>{{$t('NOTE_RANGE_PRESETS')}}</span>
                <div class="flow-notes-choice flow-range-choice" role="group" :aria-label="$t('NOTE_RANGE_PRESETS')">
                  <button v-for="option in difficultyOptions" :key="option.value" type="button"
                    :class="{selected:rangePreset === option.value}"
                    :aria-pressed="rangePreset === option.value"
                    @click="updateDifficulty(option.value)">{{option.label}}</button>
                </div>
              </div>
              <div class="flow-notes-field">
                <span>{{$t('CLEF')}}</span>
                <div v-if="previewOptions.handMode === 'single'" class="flow-notes-choice" role="group" :aria-label="$t('CLEF')">
                  <button v-for="option in clefOptions" :key="option.value" type="button"
                    :class="{selected:previewOptions.clef.includes(option.value)}"
                    :aria-pressed="previewOptions.clef.includes(option.value)"
                    @click="toggleClef(option.value)">{{option.label}}</button>
                </div>
                <div v-else class="flow-fixed-clefs">
                  <span>𝄢 {{$t('bassClef')}}</span>
                  <span>𝄞 {{$t('trebleClef')}}</span>
                  <p>{{$t('FLOW_TWO_HAND_CLEFS')}}</p>
                </div>
              </div>

              <div class="flow-custom-range">
                <div v-for="clef in customRangeClefs" :key="clef" class="flow-hand-range"
                  role="group" :aria-label="rangeHandLabel(clef)">
                  <h3>{{rangeHandLabel(clef)}}</h3>
                  <div class="flow-range-grid">
                    <div class="flow-notes-field">
                      <label :for="`flow-${clef}-min`">{{$t('FLOW_CHORD_RANGE_FROM')}}</label>
                      <select :id="`flow-${clef}-min`" :value="rangeValues[rangeField(clef, 'min')]"
                        @change="updateRange(clef, 'min', Number($event.target.value))">
                        <option v-for="note in noteOptions" :key="note.value" :value="note.value">{{note.label}}</option>
                      </select>
                    </div>
                    <div class="flow-notes-field">
                      <label :for="`flow-${clef}-max`">{{$t('FLOW_CHORD_RANGE_TO')}}</label>
                      <select :id="`flow-${clef}-max`" :value="rangeValues[rangeField(clef, 'max')]"
                        @change="updateRange(clef, 'max', Number($event.target.value))">
                        <option v-for="note in noteOptions" :key="note.value" :value="note.value">{{note.label}}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <CustomKeyboardPreview
                  :min-value="displayedCustomMinValue"
                  :max-value="displayedCustomMaxValue"
                  :accidentals="previewOptions.accidentals"
                  :show-clef-assignment="showCustomClefSettings"
                  :treble-min-value="rangeValues.customTrebleMinValue"
                  :bass-max-value="rangeValues.customBassMaxValue"
                  @update:min-value="displayedCustomMinValue = $event"
                  @update:max-value="displayedCustomMaxValue = $event"
                  @update:treble-min-value="updateRange('treble', 'min', $event)"
                  @update:bass-max-value="updateRange('bass', 'max', $event)"
                />
              </div>

              <div class="flow-notes-field">
                <span>{{$t('FLOW_TONALITY_MODE')}}</span>
                <div class="flow-notes-choice" role="group" :aria-label="$t('FLOW_TONALITY_MODE')">
                  <button v-for="option in tonalityModeOptions" :key="option.value" type="button"
                    :class="{selected:previewOptions.tonalityMode === option.value}"
                    :aria-pressed="previewOptions.tonalityMode === option.value"
                    @click="updateTonalityMode(option.value)">{{option.label}}</button>
                </div>
              </div>
              <div class="flow-notes-field">
                <label for="flow-accidentals">{{$t('ACCIDENTALS')}}</label>
                <select id="flow-accidentals" :value="previewOptions.accidentals" @change="updateAccidentals($event.target.value)">
                  <option v-for="option in accidentalOptions" :key="option.value" :value="option.value">{{option.label}}</option>
                </select>
              </div>

              <NoteFlowCircleSelector
                v-if="previewOptions.tonalityMode === 'circle'"
                v-model="previewOptions.selectedKey"
                :accidentals="previewOptions.accidentals"
                :note-naming="currentNoteNaming"
              />

              <div class="flow-dependency-summary" aria-live="polite">
                <strong>{{$t('FLOW_AVAILABLE_KEYS', { count: availableTonalities.length })}}</strong>
                <span>{{tonalityDependencyHint}}</span>
              </div>
            </div>
          </section>

          <section v-if="activeSettingSection === 'algorithm'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="algorithm" />
              <div>
                <h2>{{$t('FLOW_ALGORITHM_TITLE')}}</h2>
                <p>{{$t('FLOW_ALGORITHM_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body">
              <NoteFlowMovementSelector :value="previewOptions.movement" @input="updateMovement" />
              <NoteFlowAlgorithmControls v-if="previewOptions.movement === 'custom'"
                :value="previewOptions.algorithmSettings" @input="updateAlgorithmSettings" />
              <NoteFlowAlgorithmPreview v-if="algorithmMotionPreview"
                :cycle="algorithmMotionPreview.cycle" :score="algorithmMotionPreview.score"
                :bpm="previewOptions.bpm" @new-example="algorithmPreviewIndex += 1" />
              <p v-else class="setting-hint" role="alert">{{$t('FLOW_CHORD_PREVIEW_ERROR')}}</p>
            </div>
          </section>

          <section v-if="activeSettingSection === 'hands'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="hands" />
              <div>
                <h2>{{$t('FLOW_MENU_HANDS_TITLE')}}</h2>
                <p>{{$t('FLOW_MENU_HANDS_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body flow-hand-controls">
              <SelectOption
                appearance="single-notes"
                :label="$t('FLOW_HAND_MODE')"
                :items="handModeOptions"
                :value="previewOptions.handMode"
                @input="updateHandMode"
              />

              <div v-if="previewOptions.handMode === 'two'" class="flow-density-control">
                <span class="flow-density-label">{{$t('FLOW_SECOND_NOTES_PER_BLOCK', { count: positionsPerBlock })}}</span>
                <div class="flow-density-options" role="radiogroup" :aria-label="$t('FLOW_SECOND_NOTES_PER_BLOCK', { count: positionsPerBlock })">
                  <button
                    v-for="density in secondaryDensityOptions"
                    :key="'flow-density-' + density"
                    type="button"
                    :class="{ selected: previewOptions.secondaryNotesPerBlock === density }"
                    :aria-pressed="previewOptions.secondaryNotesPerBlock === density ? 'true' : 'false'"
                    @click="previewOptions.secondaryNotesPerBlock = density">
                      {{density}}
                  </button>
                </div>
                <p class="flow-hand-hint">
                  {{$t('FLOW_SECOND_NOTES_HINT', { count: previewOptions.secondaryNotesPerBlock })}}
                </p>
              </div>
            </div>
          </section>

          <section v-if="activeSettingSection === 'rhythm'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="rhythm" />
              <div>
                <h2>{{$t('FLOW_RHYTHM_TITLE')}}</h2>
                <p>{{$t('FLOW_RHYTHM_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body flow-rhythm-controls">
              <SelectOption
                appearance="single-notes"
                :label="$t('FLOW_METER')"
                :items="meterOptions"
                :value="previewOptions.rhythmMeter"
                @input="updateRhythmMeter"
              />
              <div v-for="hand in rhythmVisibleHands" :key="'rhythm-' + hand" class="flow-rhythm-hand">
                <strong>{{hand === 'bass' ? '𝄢 ' + $t('bassClef') : '𝄞 ' + $t('trebleClef')}}</strong>
                <div class="flow-rhythm-choice-grid" role="group" :aria-label="$t('FLOW_RHYTHM_VALUES_FOR', { hand: hand === 'bass' ? $t('bassClef') : $t('trebleClef') })">
                  <button
                    v-for="value in rhythmValueOptions"
                    :key="hand + '-' + value.value"
                    type="button"
                    :class="{ selected: previewOptions.rhythmValues[hand].includes(value.value) }"
                    :aria-pressed="previewOptions.rhythmValues[hand].includes(value.value) ? 'true' : 'false'"
                    :aria-describedby="rhythmSelectionNotice && rhythmSelectionNotice.hand === hand && rhythmSelectionNotice.value === value.value ? 'flow-rhythm-rejected-' + hand : null"
                    @click="toggleRhythmValue(hand, value.value)">
                      {{value.label}}
                  </button>
                </div>
                <p v-if="rhythmSelectionNotice && rhythmSelectionNotice.hand === hand"
                  :id="'flow-rhythm-rejected-' + hand" class="setting-hint" role="status">
                  {{rhythmSelectionNoticeLabel}}
                </p>
              </div>

            </div>
          </section>

          <section v-if="activeSettingSection === 'tempo'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="tempo" />
              <div>
                <h2>{{$t('FLOW_MENU_TEMPO_TITLE')}}</h2>
                <p>{{$t('FLOW_MENU_TEMPO_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body flow-controls">
              <SelectOption
                appearance="single-notes"
                :label="$t('ROUND_LENGTH')"
                :items="gameLengthOptions"
                v-model="previewOptions.gameLength"
              />
              <div class="flow-bpm-control">
                <div class="flow-bpm-heading">
                  <label for="flow-bpm-range">{{$t('FLOW_SPEED')}}</label>
                  <label class="flow-bpm-value" for="flow-bpm-number">
                    <input
                      id="flow-bpm-number"
                      type="number"
                      inputmode="numeric"
                      :min="bpmMin"
                      :max="bpmMax"
                      step="1"
                      :value="previewOptions.bpm"
                      @change="updateBpm"
                    />
                    <span>BPM</span>
                  </label>
                </div>
                <input
                  id="flow-bpm-range"
                  class="flow-bpm-range"
                  type="range"
                  :min="bpmMin"
                  :max="bpmMax"
                  step="1"
                  :value="previewOptions.bpm"
                  :aria-valuetext="`${previewOptions.bpm} BPM`"
                  @input="updateBpm"
                />
                <div class="flow-bpm-scale" aria-hidden="true">
                  <span>{{bpmMin}} BPM</span>
                  <span>{{bpmMax}} BPM</span>
                </div>
                <p class="flow-bpm-hint">{{$t('FLOW_BPM_HINT')}}</p>
              </div>
            </div>
          </section>

          <section v-if="activeSettingSection === 'input'" class="note-flow-card">
            <header class="note-flow-card-heading">
              <SettingsSectionIcon type="input" />
              <div>
                <h2>{{$t('FLOW_MENU_INPUT_TITLE')}}</h2>
                <p>{{$t('FLOW_MENU_INPUT_DESCRIPTION')}}</p>
              </div>
            </header>
            <div class="note-flow-card-body flow-input-controls">
              <SelectOption
                appearance="single-notes"
                :label="$t('FLOW_INPUT_BEHAVIOR')"
                :items="behaviorOptions"
                v-model="previewOptions.behavior"
              />
              <p v-if="previewOptions.behavior === 'wait'" class="setting-hint">
                {{$t('FLOW_WAIT_HINT')}}
              </p>
              <div class="select-option select-option--single-notes flow-input-mode-options">
                <div class="label">{{$t('NOTE_INPUT')}}</div>
                <div class="options-container" role="group" :aria-label="$t('NOTE_INPUT')">
                  <button v-for="item in inputModeOptions" :key="item.value" type="button"
                    class="value-box" :class="{ selected: previewOptions.inputMode === item.value }"
                    :aria-pressed="previewOptions.inputMode === item.value"
                    :disabled="item.value === 'keyboard' && !inputAvailability.keyboardAvailable"
                    :aria-describedby="item.value === 'keyboard' && !inputAvailability.keyboardAvailable ? 'flow-keyboard-availability' : null"
                    @click="selectInputMode(item.value)">{{item.label}}</button>
                </div>
              </div>
              <p v-if="!inputAvailability.keyboardAvailable" id="flow-keyboard-availability" class="setting-hint">
                {{$t('FLOW_KEYBOARD_SINGLE_STAFF_ONLY')}}
              </p>
              <SelectOption appearance="single-notes" :label="$t('FLOW_WRONG_PITCH_MARKERS')" :items="onOffOptions" v-model="previewOptions.displayNote" />
              <p class="setting-hint">{{$t('FLOW_WRONG_PITCH_MARKERS_HELP')}}</p>
            </div>
          </section>
        </div>
      </section>

      <section v-show="activeView === 'statistics'" class="note-flow-content note-flow-statistics">
        <div class="flow-statistics-card">
          <header class="statistics-summary">
            <span class="statistics-summary-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40" focusable="false"><path d="M8 31V22M16 31V14M24 31V19M32 31V8M5 31h30" /></svg>
            </span>
            <span class="statistics-summary-copy">
              <small>{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small>
              <h2>{{$t('FLOW_STATISTICS_PREVIEW')}}</h2>
              <span>{{$t('FLOW_STATISTICS_DESCRIPTION')}}</span>
            </span>
            <span v-if="statisticsState === 'ready' && statisticsSnapshot.hasResults" class="summary-meta">
              <span class="statistics-count">{{$tc('ROUND_STATS_ROUND_COUNT', statisticsSnapshot.roundCount, { count: statisticsSnapshot.roundCount })}}</span>
            </span>
          </header>

          <section class="flow-statistics-filter statistics-section-card" :aria-label="$t('ROUND_STATS_FILTER_TITLE')">
            <header class="flow-statistics-filter-heading">
              <span class="flow-statistics-filter-icon" aria-hidden="true">
                <svg viewBox="0 0 40 40" focusable="false"><path d="M7 11h26M7 20h26M7 29h26" /><circle cx="15" cy="11" r="3" /><circle cx="26" cy="20" r="3" /><circle cx="18" cy="29" r="3" /></svg>
              </span>
              <div><h3>{{$t('ROUND_STATS_FILTER_TITLE')}}</h3><p>{{$t('STATISTICS_INPUT_DESCRIPTION')}}</p></div>
            </header>
          <div class="flow-statistics-input statistics-input-switch" role="group" :aria-label="$t('ROUND_STATS_INPUT_LABEL')">
            <button
              type="button"
              :class="{ active: statisticsInputGroup === 'screen' }"
              :aria-pressed="statisticsInputGroup === 'screen' ? 'true' : 'false'"
              @click="selectStatisticsInput('screen')">
              {{$t('ROUND_STATS_INPUT_SCREEN')}}
            </button>
            <button
              type="button"
              :class="{ active: statisticsInputGroup === 'midi' }"
              :aria-pressed="statisticsInputGroup === 'midi' ? 'true' : 'false'"
              @click="selectStatisticsInput('midi')">
              MIDI
            </button>
          </div>
          </section>

          <div v-if="statisticsState === 'loading'" class="flow-statistics-status" aria-live="polite">
            {{$t('FLOW_STAT_LOADING')}}
          </div>

          <div v-else-if="statisticsState === 'error'" class="flow-statistics-status is-error" role="alert">
            <span>{{$t('FLOW_STAT_LOAD_ERROR')}}</span>
            <button type="button" class="persistence-retry" @click="loadStatistics">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button>
          </div>

          <template v-else-if="statisticsSnapshot.hasResults">
            <section class="flow-statistics-overview statistics-section-card">
              <h3>{{$t('ROUND_STATS_RESULTS_TITLE')}}</h3>
              <div class="flow-metric-grid statistics-metric-grid">
                <StatisticsMetric icon="rounds" accent="orange" :value="statisticsSnapshot.roundCount" :label="$t('FLOW_STAT_ROUNDS_COUNT')" />
                <StatisticsMetric icon="notes" accent="gold" :value="statisticsSnapshot.evaluatedNoteCount" :label="$t('FLOW_STAT_TOTAL_NOTES')" />
                <StatisticsMetric accent="petrol" :percentage="statisticsSnapshot.accuracy" :value="`${statisticsSnapshot.accuracy} %`" :label="$t('FLOW_STAT_ACCURACY')" />
                <StatisticsMetric icon="missed" accent="violet" :value="statisticsSnapshot.missedCount" :label="$t('FLOW_STAT_MISSED')" />
                <StatisticsMetric icon="timing" accent="muted" :value="statisticsTimingLabel" :label="$t('FLOW_STAT_TIMING_OFFSET')" />
                <StatisticsMetric icon="duration" accent="orange" :value="statisticsDurationLabel" :label="$t('FLOW_STAT_PLAY_TIME')" />
              </div>
            </section>

            <div class="flow-timing-summary statistics-section-card">
              <h3>{{$t('FLOW_RESULT_TIMING')}}</h3>
              <div>
                <span><strong>{{statisticsSnapshot.earlyCount}}</strong>{{$t('FLOW_RESULT_EARLY')}}</span>
                <span><strong>{{statisticsSnapshot.preciseCount}}</strong>{{$t('FLOW_RESULT_PRECISE')}}</span>
                <span><strong>{{statisticsSnapshot.lateCount}}</strong>{{$t('FLOW_RESULT_LATE')}}</span>
              </div>
              <p>{{$t('FLOW_STAT_PRECISE_RATE', { value: statisticsSnapshot.preciseRate })}}</p>
            </div>

            <section class="flow-meter-statistics statistics-section-card">
              <h3>{{$t('FLOW_METER_STATISTICS')}}</h3>
              <div class="flow-meter-statistics-grid">
                <div v-for="bucket in statisticsSnapshot.rhythmByMeter" :key="bucket.meter">
                  <strong>{{bucket.meter}}</strong>
                  <span>{{$tc('ROUND_STATS_ROUND_COUNT', bucket.roundCount, { count: bucket.roundCount })}}</span>
                  <span>{{bucket.accuracy === null ? '—' : `${bucket.accuracy} %`}} {{$t('FLOW_STAT_ACCURACY')}}</span>
                </div>
              </div>
              <p v-if="uncategorizedRhythmRounds">
                {{$tc('FLOW_METER_OLDER_ROUNDS', uncategorizedRhythmRounds, { count: uncategorizedRhythmRounds })}}
              </p>
            </section>

            <NoteFlowHistoryChart
              :key="statisticsInputGroup"
              :input-group="statisticsInputGroup"
              :total-round-count="statisticsSnapshot.roundCount" />
          </template>

          <div v-else class="flow-empty-results statistics-section-card">
            <span class="flow-empty-icon" aria-hidden="true">♬</span>
            <h3>{{$t('FLOW_NO_RESULTS')}}</h3>
            <p>{{$t('FLOW_NO_RESULTS_DESCRIPTION')}}</p>
          </div>
        </div>
      </section>
    </div>
    <FloatingTrainingStart anchor-selector=".note-flow-start" :view-key="activeView"
      :label="$t('FLOW_START_PREVIEW')" :disabled="!inputAvailability.inputAvailable" @start="startPreview" />
  </main>
</template>

<script>
import FloatingTrainingStart from './FloatingTrainingStart';
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import SelectOption from "./SelectOption";
import CustomKeyboardPreview from "./CustomKeyboardPreview";
import NoteFlowCircleSelector from "./NoteFlowCircleSelector";
import NoteFlowAlgorithmPreview from "./NoteFlowAlgorithmPreview";
import NoteFlowAlgorithmControls from "./NoteFlowAlgorithmControls";
import NoteFlowHistoryChart from "./NoteFlowHistoryChart";
import StatisticsMetric from "./StatisticsMetric";
import NoteFlowModeHeader from "./NoteFlowModeHeader";
import NoteFlowViewTabs from "./NoteFlowViewTabs";
import SettingsSectionIcon from "./SettingsSectionIcon";
import NoteFlowMovementSelector from "./NoteFlowMovementSelector";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings, getNoteFlowMovementLabelKey } from "../model/NoteFlowMovement";
import Options from "../model/Options";
import { normalizeNoteFlowMelodyPreferences } from "../model/NoteFlowPreferences";
import Utils from "../model/Utils";
import { getNaturalNoteValues, usesCustomClefAssignment, getRangePresetValues, getEditableRangeValues, getMatchingRangePreset } from "../model/NoteRanges";
import { updateExclusivePianoClefs } from "../model/ClefSelection";
import {
  applyNoteFlowMenuDependencies,
  createNoteFlowConfigFromMenu,
  createNoteFlowRhythmOptionsFromMenu,
  NOTE_FLOW_SECONDARY_DENSITIES,
  NOTE_FLOW_RHYTHM_VALUES
} from "../model/NoteFlowMenuConfig";
import { DEFAULT_POSITIONS_PER_BLOCK } from "../model/NoteFlowStructure";
import { getNoteFlowInputAvailability } from "../model/NoteFlowDisplayConstraints";
import { generateNoteFlowCycle } from "../model/NoteFlowGenerator";
import { generateNoteFlowRhythmicScore } from "../model/NoteFlowRhythmGenerator";
import {
  getAvailableNoteFlowTonalities,
  getNoteFlowTonality
} from "../model/NoteFlowTonality";
import { formatNoteFlowTonalityLabel } from "../model/NoteFlowKeyLabels";
import {
  NOTE_FLOW_MIN_BPM,
  NOTE_FLOW_MAX_BPM,
  normalizeNoteFlowBpm
} from "../model/NoteFlowPlayback";
import NoteFlowRoundStorage from "../model/NoteFlowRoundStorage";
import {
  createEmptyNoteFlowStatistics,
  createNoteFlowStatisticsSnapshot
} from "../model/NoteFlowStatistics";

export default {
  name: "NoteFlowMenu",
  components: {
    FloatingTrainingStart,
    HomeMusicBackdrop,
    SelectOption,
    CustomKeyboardPreview,
    NoteFlowCircleSelector,
    NoteFlowAlgorithmPreview,
    NoteFlowAlgorithmControls,
    NoteFlowHistoryChart,
    StatisticsMetric,
    NoteFlowModeHeader,
    NoteFlowViewTabs,
    SettingsSectionIcon,
    NoteFlowMovementSelector
  },
  props: {
    initialPreview: {
      type: Object,
      default: null
    }
  },
  data() {
    const previous = Options.noteFlowMelodySettings || this.initialPreview || {};
    const saved = normalizeNoteFlowMelodyPreferences(Object.assign({}, previous, {
      menuOptions: Object.assign({}, previous.menuOptions, {
        movement: normalizeNoteFlowMovement(Options.noteFlowMelodyMovement)
      })
    }), {
      customMinValue: Options.customMinValue,
      customMaxValue: Options.customMaxValue,
      customTrebleMinValue: Options.customTrebleMinValue,
      customBassMaxValue: Options.customBassMaxValue,
      accidentals: Options.accidentals,
      inputMode: "midi",
      sound: Options.sound,
      vibration: Options.vibration,
      displayNote: Options.displayNote
    });
    return {
      activeView: "settings",
      activeSettingSection: null,
      rhythmSelectionNotice: null,
      algorithmPreviewIndex: 0,
      statisticsInputGroup: saved.menuOptions.inputMode === "midi" ? "midi" : "screen",
      statisticsState: "idle",
      statisticsSnapshot: createEmptyNoteFlowStatistics(),
      statisticsLoadToken: 0,
      lastSingleHandClef: saved.lastSingleHandClef,
      bpmMin: NOTE_FLOW_MIN_BPM,
      bpmMax: NOTE_FLOW_MAX_BPM,
      previewOptions: saved.menuOptions
    };
  },
  computed: {
    rangeValues() { return getEditableRangeValues(this.previewOptions); },
    rangePreset() { return getMatchingRangePreset(this.previewOptions); },
    gameLengthOptions() {
      return [
        { value: 20, label: this.$t("twentySeconds") },
        { value: 60, label: this.$t("oneMinute") },
        { value: 300, label: this.$t("fiveMinutes") },
        { value: 0, label: this.$t("infinite") }
      ];
    },
    behaviorOptions() {
      return [
        { value: "continuous", label: this.$t("FLOW_CONTINUOUS") },
        { value: "wait", label: this.$t("FLOW_WAIT") }
      ];
    },
    meterOptions() {
      return ["3/4", "4/4", "6/8"].map(value => ({ value, label: value }));
    },
    rhythmValueOptions() {
      return NOTE_FLOW_RHYTHM_VALUES
        .filter(value => value !== "whole" || this.previewOptions.rhythmMeter === "4/4")
        .map(value => ({
        value,
        label: this.$t(`FLOW_RHYTHM_VALUE_${value.replace(/-/g, "_").toUpperCase()}`)
      }));
    },
    rhythmSelectionNoticeLabel() {
      const notice = this.rhythmSelectionNotice;
      if (!notice) return "";
      if (notice.reason === "minimum") return this.$t("FLOW_RHYTHM_LAST_VALUE");
      const option = this.rhythmValueOptions.find(candidate => candidate.value === notice.value);
      return this.$t("FLOW_RHYTHM_REQUIRED_VALUE", {
        value: option ? option.label : notice.value,
        meter: this.previewOptions.rhythmMeter
      });
    },
    rhythmVisibleHands() {
      if (this.previewOptions.handMode === "two"
        || this.previewOptions.clef.includes("piano")) {
        return ["treble", "bass"];
      }
      return ["treble", "bass"].filter(hand => this.previewOptions.clef.includes(hand));
    },
    algorithmMotionPreview() {
      if (this.activeSettingSection !== "algorithm") return null;
      try {
        const config = createNoteFlowConfigFromMenu(this.previewOptions);
        config.seed = `algorithm-preview:${this.algorithmPreviewIndex}`;
        const cycle = generateNoteFlowCycle(config);
        const options = createNoteFlowRhythmOptionsFromMenu(this.previewOptions);
        const score = generateNoteFlowRhythmicScore(cycle, Object.assign({}, options, {
          measureCount: 4,
          restChance: 0.12
        }));
        return { cycle, score };
      } catch (error) {
        return null;
      }
    },
    handModeOptions() {
      return [
        { value: "single", label: this.$t("FLOW_ONE_HAND") },
        { value: "two", label: this.$t("FLOW_TWO_HANDS") }
      ];
    },
    secondaryDensityOptions() {
      return NOTE_FLOW_SECONDARY_DENSITIES.slice();
    },
    positionsPerBlock() {
      return DEFAULT_POSITIONS_PER_BLOCK;
    },
    tonalityModeOptions() {
      return [
        { value: "random", label: this.$t("FLOW_ALL_KEYS_RANDOM") },
        { value: "circle", label: this.$t("FLOW_CIRCLE_OF_FIFTHS") }
      ];
    },
    difficultyOptions() {
      return [
        { value: "easy", label: this.$t("easy") },
        { value: "normal", label: this.$t("normal") },
        { value: "hard", label: this.$t("hard") }
      ];
    },
    clefOptions() {
      return [
        { value: "bass", label: this.$t("bassClef") },
        { value: "treble", label: this.$t("trebleClef") },
        { value: "piano", label: this.$t("pianoClef") }
      ];
    },
    inputAvailability() {
      return getNoteFlowInputAvailability(this.previewOptions);
    },
    inputModeOptions() {
      return [
        { value: "button", label: this.$t("buttons") },
        { value: "keyboard", label: this.$t("piano") },
        { value: "midi", label: "MIDI" }
      ];
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
    noteOptions() {
      return getNaturalNoteValues().map(value => ({
        value,
        label: `${Utils.getDisplayNoteName(value % 12, true, Options.noteNaming)}${Math.floor(value / 12)}`
      }));
    },
    showCustomClefSettings() {
      return usesCustomClefAssignment(this.previewOptions.clef);
    },
    customRangeClefs() {
      return this.showCustomClefSettings ? ["bass", "treble"]
        : [this.previewOptions.clef.includes("bass") ? "bass" : "treble"];
    },
    currentNoteNaming() {
      return Options.noteNaming;
    },
    availableTonalities() {
      return getAvailableNoteFlowTonalities(this.previewOptions.accidentals);
    },
    tonalityDependencyHint() {
      return this.previewOptions.tonalityMode === "random"
        ? this.$t("FLOW_RANDOM_TONALITY_HINT")
        : this.$t("FLOW_CIRCLE_TONALITY_HINT");
    },
    displayedCustomMinValue: {
      get() {
        return this.showCustomClefSettings || this.previewOptions.clef.includes("bass")
          ? this.rangeValues.customMinValue
          : this.rangeValues.customTrebleMinValue;
      },
      set(value) {
        this.updateRange(this.showCustomClefSettings || this.previewOptions.clef.includes("bass")
          ? "bass" : "treble", "min", value);
      }
    },
    displayedCustomMaxValue: {
      get() {
        return this.showCustomClefSettings || this.previewOptions.clef.includes("treble")
          ? this.rangeValues.customMaxValue
          : this.rangeValues.customBassMaxValue;
      },
      set(value) {
        this.updateRange(this.showCustomClefSettings || this.previewOptions.clef.includes("treble")
          ? "treble" : "bass", "max", value);
      }
    },
    currentSettingsSummary() {
      const labelFor = (items, value) => {
        const match = items.find(item => item.value === value);
        return match ? match.label : "";
      };
      return [
        labelFor(this.handModeOptions, this.previewOptions.handMode),
        `${this.previewOptions.bpm} BPM`,
        `${this.previewOptions.rhythmMeter} ${this.$t('FLOW_RHYTHM_PREVIEW_SHORT')}`
      ].join(" · ");
    },
    settingSections() {
      const labelFor = (items, value) => {
        const match = items.find(item => item.value === value);
        return match ? match.label : "";
      };
      const clefs = this.clefOptions
        .filter(item => this.previewOptions.clef.includes(item.value))
        .map(item => item.label)
        .join(" + ");
      const selectedTonality = getNoteFlowTonality(this.previewOptions.selectedKey);
      const tonalityDetail = this.previewOptions.tonalityMode === "circle"
        && selectedTonality
        ? formatNoteFlowTonalityLabel(selectedTonality, this.currentNoteNaming)
        : this.$t("FLOW_AVAILABLE_KEYS_SHORT", {
          count: this.availableTonalities.length
        });
      return [
        {
          id: "notes",
          title: this.$t("FLOW_MENU_NOTES_TITLE"),
          summary: [
            labelFor(this.difficultyOptions, this.previewOptions.difficulty),
            clefs,
            tonalityDetail,
            labelFor(this.accidentalOptions, this.previewOptions.accidentals)
          ].filter(Boolean).join(" · ")
        },
        {
          id: "tempo",
          title: this.$t("FLOW_MENU_TEMPO_TITLE"),
          summary: [
            labelFor(this.gameLengthOptions, this.previewOptions.gameLength),
            `${this.previewOptions.bpm} BPM`
          ].filter(Boolean).join(" · ")
        },
        {
          id: "hands",
          title: this.$t("FLOW_MENU_HANDS_TITLE"),
          summary: [
            labelFor(this.handModeOptions, this.previewOptions.handMode),
            this.previewOptions.handMode === "two"
              ? this.$t("FLOW_ACCOMPANIMENT_SUMMARY", {
                count: this.previewOptions.secondaryNotesPerBlock
              })
              : ""
          ].filter(Boolean).join(" · ")
        },
        {
          id: "rhythm",
          title: this.$t("FLOW_RHYTHM_TITLE"),
          summary: `${this.previewOptions.rhythmMeter} · ${this.$t('FLOW_RHYTHM_PREVIEW_SHORT')}`
        },
        {
          id: "algorithm",
          title: this.$t("FLOW_ALGORITHM_TITLE"),
          summary: this.movementLabel(this.previewOptions.movement) + " · " + this.$t("FLOW_ALGORITHM_PREVIEW")
        },
        {
          id: "input",
          title: this.$t("FLOW_MENU_INPUT_TITLE"),
          summary: [
            labelFor(this.inputModeOptions, this.previewOptions.inputMode),
            labelFor(this.behaviorOptions, this.previewOptions.behavior)
          ].filter(Boolean).join(" · ")
        }
      ];
    },
    statisticsTimingLabel() {
      return this.statisticsSnapshot.averageAbsoluteOffsetMs === null
        ? "—"
        : `${this.statisticsSnapshot.averageAbsoluteOffsetMs} ms`;
    },
    statisticsDurationLabel() {
      const totalMinutes = Math.round(
        this.statisticsSnapshot.durationTotalMs / 60000
      );
      if (totalMinutes < 60) {
        return this.$t("FLOW_STAT_MINUTES", { value: totalMinutes });
      }
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return this.$t("FLOW_STAT_HOURS_MINUTES", { hours, minutes });
    },
    uncategorizedRhythmRounds() {
      const categorized = this.statisticsSnapshot.rhythmByMeter.reduce(
        (sum, bucket) => sum + bucket.roundCount, 0
      );
      return Math.max(0, this.statisticsSnapshot.roundCount - categorized);
    }
  },
  created() {
    this.savePreferences();
  },
  beforeDestroy() {
    this.savePreferences();
    this.statisticsLoadToken += 1;
  },
  watch: {
    previewOptions: { deep: true, handler() { this.savePreferences(); } },
    lastSingleHandClef: { deep: true, handler() { this.savePreferences(); } }
  },
  methods: {
    savePreferences() {
      const saved = normalizeNoteFlowMelodyPreferences({
        lastSingleHandClef: this.lastSingleHandClef,
        menuOptions: this.previewOptions
      });
      if (JSON.stringify(saved) === JSON.stringify(Options.noteFlowMelodySettings)
        && Options.noteFlowMelodyMovement === saved.menuOptions.movement) return;
      Options.noteFlowMelodySettings = saved;
      Options.noteFlowMelodyMovement = saved.menuOptions.movement;
      Options.saveOptions();
    },
    movementLabel(value) { return this.$t(getNoteFlowMovementLabelKey(value)); },
    updateAlgorithmSettings(value) {
      this.previewOptions.algorithmSettings = normalizeNoteFlowAlgorithmSettings(value);
      this.savePreferences();
    },
    updateMovement(value) {
      this.previewOptions.movement = normalizeNoteFlowMovement(value);
      Options.noteFlowMelodyMovement = this.previewOptions.movement;
      this.savePreferences();
    },
    goBack() {
      if (this.handleBack()) return;
      this.$emit("back");
    },
    handleBack() {
      this.savePreferences();
      if (this.activeView === "settings" && this.activeSettingSection) {
        this.closeSettingSection();
        return true;
      }
      return false;
    },
    openSettingSection(section) {
      if (!["notes", "algorithm", "hands", "rhythm", "tempo", "input"].includes(section)) {
        return;
      }
      this.rhythmSelectionNotice = null;
      this.activeSettingSection = section;
      this.$nextTick(() => window.scrollTo(0, 0));
    },
    closeSettingSection() {
      this.rhythmSelectionNotice = null;
      this.activeSettingSection = null;
      this.$nextTick(() => window.scrollTo(0, 0));
    },
    selectView(view) {
      this.rhythmSelectionNotice = null;
      this.activeView = view === "statistics" ? "statistics" : "settings";
      this.activeSettingSection = null;
      if (this.activeView === "statistics") {
        this.loadStatistics();
      }
    },
    selectStatisticsInput(inputGroup) {
      const normalized = inputGroup === "midi" ? "midi" : "screen";
      if (
        this.statisticsInputGroup === normalized
        && this.statisticsState === "ready"
      ) {
        return;
      }
      this.statisticsInputGroup = normalized;
      this.loadStatistics();
    },
    async loadStatistics() {
      const requestedInput = this.statisticsInputGroup;
      const loadToken = ++this.statisticsLoadToken;
      this.statisticsState = "loading";
      const result = await NoteFlowRoundStorage.readStatistics(requestedInput);
      if (this.statisticsInputGroup !== requestedInput
        || this.statisticsLoadToken !== loadToken) {
        return;
      }
      if (!result.saved) {
        this.statisticsState = "error";
        return;
      }
      this.statisticsSnapshot = createNoteFlowStatisticsSnapshot(
        result.statistics
      );
      this.statisticsState = "ready";
    },
    updateBpm(event) {
      const bpm = normalizeNoteFlowBpm(event.target.value);
      this.previewOptions.bpm = bpm === null ? 50 : bpm;
      event.target.value = String(this.previewOptions.bpm);
    },
    updateRhythmMeter(value) {
      this.rhythmSelectionNotice = null;
      const resolved = applyNoteFlowMenuDependencies(Object.assign(
        {}, this.previewOptions, { rhythmMeter: value }
      ));
      this.previewOptions.rhythmMeter = resolved.rhythmMeter;
      this.previewOptions.rhythmValues = resolved.rhythmValues;
    },
    toggleRhythmValue(hand, value) {
      const selected = this.previewOptions.rhythmValues[hand];
      const next = selected.includes(value)
        ? selected.filter(candidate => candidate !== value)
        : selected.concat(value);
      this.rhythmSelectionNotice = null;
      if (!next.length) {
        this.rhythmSelectionNotice = { hand, value, reason: "minimum" };
        return;
      }
      const resolved = applyNoteFlowMenuDependencies(Object.assign(
        {}, this.previewOptions, {
          rhythmValues: Object.assign({}, this.previewOptions.rhythmValues, { [hand]: next })
        }
      ));
      this.previewOptions.rhythmValues = resolved.rhythmValues;
      if (selected.includes(value) && resolved.rhythmValues[hand].includes(value)) {
        this.rhythmSelectionNotice = { hand, value, reason: "fill" };
      }
    },
    selectInputMode(value) {
      if (value === "keyboard" && !this.inputAvailability.keyboardAvailable) return;
      this.previewOptions.inputMode = value;
    },
    startPreview() {
      if (!this.inputAvailability.inputAvailable) return;
      const resolved = applyNoteFlowMenuDependencies(this.previewOptions);
      Object.assign(this.previewOptions, resolved);
      this.savePreferences();
      this.$emit("startPreview", {
        lastSingleHandClef: this.lastSingleHandClef.slice(),
        menuOptions: Object.assign({}, this.previewOptions, {
          clef: this.previewOptions.clef.slice(),
          rhythmValues: {
            treble: this.previewOptions.rhythmValues.treble.slice(),
            bass: this.previewOptions.rhythmValues.bass.slice()
          }
        })
      });
    },
    ensureSelectedTonalityAllowed() {
      const available = getAvailableNoteFlowTonalities(
        this.previewOptions.accidentals
      );
      const remainsAvailable = available.some(tonality => (
        tonality.id === this.previewOptions.selectedKey
      ));
      if (!remainsAvailable) {
        const cMajor = available.find(tonality => tonality.id === "C-major");
        this.previewOptions.selectedKey = (cMajor || available[0]).id;
      }
    },
    updateTonalityMode(value) {
      this.previewOptions.tonalityMode = value;
      this.ensureSelectedTonalityAllowed();
    },
    updateAccidentals(value) {
      this.previewOptions.accidentals = value;
      this.ensureSelectedTonalityAllowed();
    },
    updateHandMode(value) {
      if (value === "two") {
        if (this.previewOptions.handMode === "single") {
          this.lastSingleHandClef = this.previewOptions.clef.slice();
        }
        this.previewOptions.handMode = "two";
        this.previewOptions.clef = ["bass", "treble"];
        return;
      }
      this.previewOptions.handMode = "single";
      this.previewOptions.clef = this.lastSingleHandClef.length > 0
        ? this.lastSingleHandClef.slice()
        : ["treble"];
    },
    updateDifficulty(value) {
      const fields = getRangePresetValues(value, this.previewOptions.clef);
      if (Object.keys(fields).length) Object.assign(this.previewOptions, fields, {difficulty:value});
    },
    rangeHandLabel(clef) {
      return this.$t(this.showCustomClefSettings
        ? (clef === "bass" ? "FLOW_CHORD_LEFT_HAND" : "FLOW_CHORD_RIGHT_HAND")
        : (clef === "bass" ? "bassClef" : "trebleClef"));
    },
    rangeField(clef, bound) {
      return clef === "bass" ? (bound === "min" ? "customMinValue" : "customBassMaxValue")
        : (bound === "min" ? "customTrebleMinValue" : "customMaxValue");
    },
    updateRange(clef, bound, value) {
      const field = this.rangeField(clef, bound);
      const other = this.rangeField(clef, bound === "min" ? "max" : "min");
      const fields = Object.assign({}, this.rangeValues, {[field]:value});
      if ((bound === "min" && value > fields[other])
        || (bound === "max" && value < fields[other])) {
        fields[other] = value;
      }
      Object.assign(this.previewOptions, fields, {difficulty:"custom"});
    },
    toggleClef(value) {
      this.updateClefs(this.previewOptions.clef.includes(value)
        ? this.previewOptions.clef.filter(clef => clef !== value)
        : this.previewOptions.clef.concat(value));
    },
    updateClefs(value) {
      this.previewOptions.clef = updateExclusivePianoClefs(
        this.previewOptions.clef,
        value,
        this.clefOptions.map(option => option.value)
      ).sort();
      this.lastSingleHandClef = this.previewOptions.clef.slice();
    }
  }
};
</script>

<style scoped>
.flow-input-mode-options .value-box:disabled,
.note-flow-start:disabled { opacity: 0.5; cursor: not-allowed; }
.note-flow-menu {
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

.note-flow-backdrop-clip {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.note-flow-backdrop {
  opacity: 0.38;
}

.note-flow-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 760px);
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: calc(14px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom));
}

.note-flow-header {
  text-align: left;
}

.note-flow-back {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid rgba(207, 86, 39, 0.33);
  border-radius: 12px;
  background: rgba(255, 250, 246, 0.88);
  color: #91401f;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.note-flow-back span {
  font-size: 18px;
}

.note-flow-summary > span {
  color: #2d6e7b;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.note-flow-content {
  margin-top: 12px;
}

.note-flow-start-card,
.note-flow-card {
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.79);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.note-flow-start-card {
  padding: 13px;
  text-align: left;
}

.note-flow-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 0 3px 10px;
}

.note-flow-summary strong {
  overflow: hidden;
  color: #52676c;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-flow-start {
  display: flex;
  width: 100%;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px 13px 20px;
  border: none;
  border-radius: 17px;
  background: linear-gradient(135deg, #ef6936, #dc501f);
  box-shadow: 0 9px 18px rgba(220, 80, 31, 0.2);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.note-flow-start:active {
  transform: translateY(1px);
}

.note-flow-start span:last-child {
  font-size: 24px;
}

.note-flow-settings {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.note-flow-section-link {
  display: grid;
  width: 100%;
  min-height: 88px;
  grid-template-columns: 46px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(43, 70, 77, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 8px 20px rgba(72, 58, 45, 0.07);
  color: #294248;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.note-flow-section-link:active {
  transform: translateY(1px);
}

.note-flow-section-link:focus-visible,
.note-flow-settings-return:focus-visible {
  outline: 2px solid #2d7b88;
  outline-offset: 3px;
}

.note-flow-section-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.note-flow-section-copy strong {
  color: #2d5661;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.04em;
}

.note-flow-section-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: #697d82;
  font-size: 11px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.note-flow-section-arrow {
  color: #d65b2d;
  font-size: 21px;
}

.note-flow-settings-return {
  justify-self: start;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(45, 113, 128, 0.25);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  color: #286a77;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.note-flow-settings-return span {
  margin-right: 6px;
  font-size: 17px;
  vertical-align: -1px;
}

.note-flow-card {
  overflow: hidden;
}

.note-flow-card-heading {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 14px 15px 13px;
  border-bottom: 1px solid rgba(43, 70, 77, 0.09);
  text-align: left;
}

.note-flow-card-heading h2 {
  margin: 0;
  color: #334e55;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.note-flow-card-heading p {
  margin: 3px 0 0;
  color: #7a898c;
  font-size: 10px;
  line-height: 1.35;
}

.note-flow-card-body {
  padding: 0 14px 16px;
}

.note-flow-card-body > * {
  margin-top: 16px;
}

.setting-hint {
  padding: 9px 11px;
  border-left: 3px solid #e76530;
  border-radius: 8px;
  background: #fff1eb;
  color: #78594e;
  font-size: 10px;
  line-height: 1.45;
  text-align: left;
}

.flow-bpm-control {
  padding: 12px;
  border: 1px solid rgba(45, 110, 123, 0.16);
  border-radius: 16px;
  background: rgba(240, 248, 249, 0.77);
  text-align: left;
}

.flow-bpm-heading,
.flow-bpm-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.flow-bpm-heading > label:first-child {
  color: #53686d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
}

.flow-bpm-value {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #245f6b;
  font-size: 12px;
  font-weight: 800;
}

.flow-bpm-value input {
  width: 68px;
  min-height: 44px;
  padding: 4px 6px;
  border: 1px solid rgba(45, 110, 123, 0.35);
  border-radius: 10px;
  background: #fff;
  color: #245f6b;
  font: inherit;
  text-align: center;
}

.flow-bpm-range {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 5px 0 0;
  accent-color: #2d7b88;
}

.flow-bpm-scale {
  color: #71858a;
  font-size: 10px;
}

.flow-bpm-hint {
  margin: 8px 0 0;
  color: #63797e;
  font-size: 10px;
  line-height: 1.4;
}

.flow-density-control {
  padding: 12px;
  border: 1px solid rgba(45, 110, 123, 0.16);
  border-radius: 16px;
  background: rgba(240, 248, 249, 0.77);
}

.flow-density-label {
  display: block;
  color: #53686d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-align: left;
}

.flow-density-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.flow-density-options button {
  min-width: 0;
  min-height: 44px;
  padding: 0;
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #5d6e72;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}

.flow-density-options button.selected {
  border-color: #2d7b88;
  background: #dceef1;
  box-shadow: inset 0 0 0 1px rgba(45, 123, 136, 0.12);
  color: #245f6b;
}

.flow-hand-hint {
  margin: 9px 1px 0;
  color: #708287;
  font-size: 10px;
  line-height: 1.4;
  text-align: left;
}

.flow-rhythm-hand {
  padding: 12px;
  border: 1px solid rgba(45, 110, 123, 0.16);
  border-radius: 16px;
  background: rgba(240, 248, 249, 0.77);
  text-align: left;
}

.flow-rhythm-hand > strong {
  color: #356d77;
  font-size: 12px;
}

.flow-rhythm-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.flow-rhythm-choice-grid button {
  min-height: 44px;
  border: 1px solid rgba(43, 70, 77, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #5d6e72;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.flow-rhythm-choice-grid button.selected {
  border-color: #2d7b88;
  background: #dceef1;
  color: #245f6b;
}

.flow-fixed-clefs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(45, 110, 123, 0.16);
  border-radius: 16px;
  background: rgba(240, 248, 249, 0.77);
}

.flow-fixed-clefs > span {
  padding: 11px 8px;
  border: 1px solid rgba(45, 110, 123, 0.15);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  color: #356d77;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.flow-fixed-clefs > p {
  grid-column: 1 / -1;
  margin: 1px 2px 0;
  color: #708287;
  font-size: 10px;
  line-height: 1.4;
  text-align: left;
}

.flow-dependency-summary {
  display: flex;
  gap: 3px;
  margin: 4px 0 0;
  padding: 9px 11px;
  flex-direction: column;
  border-left: 3px solid #8c72a3;
  border-radius: 8px;
  background: rgba(247, 243, 250, 0.82);
  color: #786c80;
  font-size: 10px;
  line-height: 1.4;
  text-align: left;
}

.flow-dependency-summary strong {
  color: #665173;
  font-size: 11px;
}

.flow-custom-range {
  text-align: left;
}

.flow-range-controls {
  text-align: left;
}

.flow-notes-field {
  margin-top: 17px;
}

.flow-notes-field > span,
.flow-notes-field > label {
  display: block;
  margin-bottom: 8px;
  color: #526970;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.flow-notes-choice {
  display: flex;
  gap: 8px;
}

.flow-notes-choice button {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 7px;
  border: 1px solid #d4e0e2;
  border-radius: 13px;
  background: #fff;
  color: #355864;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.flow-notes-choice button.selected {
  border-color: #85aeb7;
  background: #e8f5f7;
}

.flow-notes-choice button:focus-visible,
.flow-notes-field select:focus-visible {
  outline: 2px solid #2d7180;
  outline-offset: 2px;
}

.flow-range-choice {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.flow-hand-range {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #d4e0e2;
  border-radius: 14px;
}

.flow-hand-range:first-child {
  margin-top: 0;
}

.flow-hand-range h3 {
  margin: 0;
  color: #355864;
  font-size: 14px;
}

.flow-range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.flow-notes-field select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid #d4e0e2;
  border-radius: 13px;
  background: #fff;
  color: #355864;
  font: inherit;
  font-size: 14px;
}

.flow-statistics-card { display: grid; gap: 12px; min-width: 0; padding: 0; text-align: left; }

.flow-statistics-input {
  margin-top: 15px;
}

.flow-statistics-status {
  padding: 20px 14px;
  border: 1px solid rgba(45, 110, 123, 0.13);
  border-radius: 21px;
  background: rgba(244, 250, 250, 0.84);
  color: #5c7479;
  font-size: 11px;
  text-align: center;
}

.flow-statistics-status.is-error {
  color: #9b4127;
}

.flow-statistics-status button {
  margin-left: 8px;
  padding: 5px 8px;
  border: 1px solid currentColor;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  font: inherit;
  font-weight: 800;
}

.flow-empty-results {
  padding: 24px 16px;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.72);
  text-align: center;
}

.flow-empty-icon {
  color: #d96531;
  font-size: 31px;
}

.flow-empty-results h3 {
  margin: 7px 0 3px;
  color: #3d5960;
  font-size: 13px;
}

.flow-empty-results p {
  margin: 0;
  color: #819094;
  font-size: 10px;
  line-height: 1.4;
}

.flow-timing-summary { padding: 14px 15px; }

.flow-timing-summary h3 {
  margin: 0 0 11px;
  color: #8f4d31;
  font-size: 10px;
  letter-spacing: 0.07em;
  text-align: center;
}

.flow-timing-summary > div {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.flow-timing-summary span {
  color: #7b7f7e;
  font-size: 9px;
  text-align: center;
}

.flow-timing-summary strong {
  display: block;
  color: #3b555b;
  font-size: 16px;
}

.flow-timing-summary p {
  margin: 10px 0 0;
  color: #7f6e67;
  font-size: 9px;
  text-align: center;
}

.flow-meter-statistics { padding: 14px 15px; }
.flow-meter-statistics h3 {
  margin: 0 0 9px;
  color: #294b52;
  font-size: 13px;
}
.flow-meter-statistics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.flow-meter-statistics-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 8px;
  border: 1px solid rgba(45, 110, 123, 0.15);
  border-radius: 12px;
  background: rgba(239, 249, 251, 0.78);
  color: #61777c;
  font-size: 10px;
}
.flow-meter-statistics-grid strong { color: #2d7180; font-size: 15px; }
.flow-meter-statistics > p {
  margin: 9px 0 0;
  color: #7b8382;
  font-size: 10px;
  line-height: 1.4;
}

@media (max-width: 430px) {
  .note-flow-shell {
    padding-right: 14px;
    padding-left: 14px;
  }

  .flow-range-choice {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 350px) {
  .flow-range-grid {
    grid-template-columns: 1fr;
  }

}
</style>
