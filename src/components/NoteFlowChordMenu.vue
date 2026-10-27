<template>
  <main class="chord-menu">
    <div class="chord-backdrop" aria-hidden="true"><HomeMusicBackdrop /></div>
    <div class="chord-shell">
      <button type="button" class="chord-back" @click="goBack"><span aria-hidden="true">←</span> {{$t('BACK')}}</button>
      <NoteFlowModeHeader
        :title="$t('FLOW_HUB_CHORDS')"
        :description="$t('FLOW_CHORD_INTRO')"
        icon="♬"
      />

      <NoteFlowViewTabs :active-view="tab" @select-view="selectTab" />

      <section class="chord-content">
        <div class="chord-panel chord-intro-panel">
          <div class="chord-summary">
            <span>{{$t('FLOW_SELECTION')}}</span>
            <button type="button" class="chord-summary-toggle" :class="{ expanded: summaryExpanded }"
              :aria-expanded="summaryExpanded ? 'true' : 'false'" @click="summaryExpanded = !summaryExpanded">
              {{localOptions.chordSize}} {{$t('FLOW_CHORD_TONES')}} · {{handsSummary}} · {{movementLabel(localOptions.movement)}} · {{roundLengthLabel}} · {{localOptions.bpm}} BPM · MIDI
            </button>
          </div>
          <button type="button" class="chord-start" :disabled="!previewPlan" @click="startTraining">
            <span>{{$t('FLOW_CHORD_TRAINING_START')}}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <p v-if="previewError" class="chord-preview-error" role="alert">{{$t('FLOW_CHORD_RANGE_ERROR')}}</p>

      </section>

      <section v-if="tab === 'settings'" class="chord-content">
        <div v-if="!activeSettingSection" class="chord-section-list">
          <button v-for="section in settingSections" :key="section.id" type="button" class="chord-section-link" @click="openSettingSection(section.id)">
            <SettingsSectionIcon :type="section.id" />
            <span class="chord-section-copy"><strong>{{section.title}}</strong><small>{{section.summary}}</small></span>
            <span class="chord-section-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <div v-else class="chord-section-detail">
          <button type="button" class="chord-section-return" @click="closeSettingSection"><span aria-hidden="true">←</span> {{$t('FLOW_MENU_ALL_SETTINGS')}}</button>
        <section v-if="activeSettingSection === 'hands'" class="chord-panel">
          <header class="chord-setting-heading">
            <SettingsSectionIcon type="hands" />
            <div><h2>{{$t('FLOW_CHORD_HANDS_TITLE')}}</h2><p>{{$t('FLOW_CHORD_HANDS_HINT')}}</p></div>
          </header>
          <div class="chord-field">
            <span>{{$t('FLOW_HAND_MODE')}}</span>
            <div class="chord-choice chord-hand-choice" role="group" :aria-label="$t('FLOW_HAND_MODE')">
              <button v-for="mode in ['single', 'two']" :key="mode" type="button"
                :class="{ selected: localOptions.handMode === mode }" :aria-pressed="localOptions.handMode === mode"
                @click="updateHands(mode === 'two' ? 'two' : localOptions.singleHand)">{{$t(mode === 'two' ? 'FLOW_TWO_HANDS' : 'FLOW_ONE_HAND')}}</button>
            </div>
          </div>
          <div class="chord-field">
            <span>{{$t('FLOW_CHORD_TOTAL_TONES')}}</span>
            <div class="chord-choice chord-tone-choice" role="group" :aria-label="$t('FLOW_CHORD_TOTAL_TONES')">
              <button v-for="size in [3, 4, 5, 6, 7, 8]" :key="size" type="button"
                :class="{selected:localOptions.chordSize === size}" :aria-pressed="localOptions.chordSize === size"
                :aria-label="`${size} ${$t('FLOW_CHORD_TONES')}`" @click="update('chordSize', size)">{{size}}</button>
            </div>
          </div>
          <div v-for="hand in activeHands" :key="hand" class="chord-hand-count">
            <h3>{{handLabel(hand)}}</h3>
            <div v-if="localOptions.handMode === 'two'" class="chord-field">
              <span>{{$t('FLOW_CHORD_HAND_TONES')}}</span>
              <div class="chord-choice chord-tone-choice" role="group" :aria-label="`${handLabel(hand)} · ${$t('FLOW_CHORD_HAND_TONES')}`">
                <button v-for="count in localOptions.chordSize - 1" :key="count" type="button"
                  :class="{selected:localOptions[hand === 'bass' ? 'bassNotesPerChord' : 'trebleNotesPerChord'] === count}"
                  :aria-pressed="localOptions[hand === 'bass' ? 'bassNotesPerChord' : 'trebleNotesPerChord'] === count"
                  @click="updateHandCount(hand, count)">{{count}}</button>
              </div>
            </div>
            <p v-else class="chord-hand-hint">{{localOptions.chordSize}} {{$t('FLOW_CHORD_TONES')}}</p>
          </div>
          <p v-if="localOptions.chordSize > 4" class="chord-hand-hint">{{$t('FLOW_CHORD_LARGE_GRIP_HINT')}}</p>
        </section>

        <section v-if="activeSettingSection === 'rhythm'" class="chord-panel">
          <h2>{{$t('FLOW_RHYTHM_TITLE')}}</h2>
          <p>{{$t('FLOW_CHORD_RHYTHM_DESCRIPTION')}}</p>
          <div class="chord-field">
            <span>{{$t('FLOW_METER')}}</span>
            <div class="chord-choice chord-meter-choice" role="group" :aria-label="$t('FLOW_METER')">
              <button v-for="meter in ['3/4', '4/4', '6/8']" :key="meter" type="button"
                :class="{ selected: localOptions.rhythmMeter === meter }"
                :aria-pressed="localOptions.rhythmMeter === meter"
                @click="update('rhythmMeter', meter)">{{meter}}</button>
            </div>
          </div>
          <div class="chord-field">
            <span>{{$t('FLOW_CHORD_RHYTHM_VALUES')}}</span>
            <div class="chord-choice chord-rhythm-choice" role="group" :aria-label="$t('FLOW_CHORD_RHYTHM_VALUES')">
              <button v-for="value in rhythmValueOptions" :key="value" type="button"
                :class="{ selected: localOptions.rhythmValues.includes(value) }"
                :aria-pressed="localOptions.rhythmValues.includes(value)"
                @click="toggleRhythmValue(value)">{{rhythmValueLabel(value)}}</button>
            </div>
          </div>
          <p class="chord-rhythm-pending">{{$t('FLOW_CHORD_RHYTHM_PENDING')}}</p>
        </section>

        <section v-if="activeSettingSection === 'behavior'" class="chord-panel">
          <h2>{{$t('FLOW_CHORD_BEHAVIOR_TITLE')}}</h2>
          <p>{{$t('FLOW_CHORD_BEHAVIOR_HINT')}}</p>
          <div class="chord-field">
            <span>{{$t('FLOW_INPUT_BEHAVIOR')}}</span>
            <div class="chord-choice">
              <button type="button" :class="{ selected: localOptions.behavior === 'continuous' }" :aria-pressed="localOptions.behavior === 'continuous'" @click="update('behavior', 'continuous')">{{$t('FLOW_CONTINUOUS')}}</button>
              <button type="button" :class="{ selected: localOptions.behavior === 'wait' }" :aria-pressed="localOptions.behavior === 'wait'" @click="update('behavior', 'wait')">{{$t('FLOW_WAIT')}}</button>
            </div>
          </div>
          <div class="chord-field">
            <span>{{$t('FLOW_WRONG_PITCH_MARKERS')}}</span>
            <div class="chord-choice" role="group" :aria-label="$t('FLOW_WRONG_PITCH_MARKERS')">
              <button v-for="enabled in [true, false]" :key="String(enabled)" type="button"
                :class="{ selected: localOptions.displayNote === enabled }" :aria-pressed="localOptions.displayNote === enabled"
                @click="update('displayNote', enabled)">{{$t(enabled ? 'on' : 'off')}}</button>
            </div>
          </div>
          <p>{{$t('FLOW_WRONG_PITCH_MARKERS_HELP')}}</p>
        </section>

        <section v-if="activeSettingSection === 'tempo'" class="chord-panel">
          <h2>{{$t('FLOW_MENU_TEMPO_TITLE')}}</h2>
          <p>{{$t('FLOW_MENU_TEMPO_DESCRIPTION')}}</p>
          <div class="chord-field">
            <span>{{$t('ROUND_LENGTH')}}</span>
            <div class="chord-choice chord-length-choice">
              <button v-for="length in roundLengthOptions" :key="length.value" type="button" :class="{ selected: localOptions.gameLength === length.value }" :aria-pressed="localOptions.gameLength === length.value" @click="update('gameLength', length.value)">{{length.label}}</button>
            </div>
          </div>
          <div class="chord-field">
            <label for="chord-bpm-range">{{$t('FLOW_SPEED')}} · {{localOptions.bpm}} BPM</label>
            <input id="chord-bpm-range" class="chord-bpm-range" type="range" :min="bpmMin" :max="bpmMax" step="1" :value="localOptions.bpm" :aria-valuetext="`${localOptions.bpm} BPM`" @input="updateBpm" />
            <div class="chord-bpm-scale"><span>{{bpmMin}} BPM</span><span>{{bpmMax}} BPM</span></div>
            <p class="chord-bpm-hint">{{$t('FLOW_BPM_HINT')}}</p>
          </div>
        </section>

        <section v-if="activeSettingSection === 'tonality'" class="chord-panel">
          <header class="chord-setting-heading">
            <SettingsSectionIcon type="notes" />
            <div><h2>{{$t('FLOW_MENU_NOTES_TITLE')}}</h2><p>{{$t('FLOW_MENU_NOTES_DESCRIPTION')}}</p></div>
          </header>
          <div v-if="localOptions.handMode === 'single'" class="chord-field">
            <span>{{$t('CLEF')}}</span>
            <div class="chord-choice" role="group" :aria-label="$t('CLEF')">
              <button v-for="hand in ['bass', 'treble']" :key="hand" type="button"
                :class="{selected:localOptions.singleHand === hand}" :aria-pressed="localOptions.singleHand === hand"
                @click="updateHands(hand)">{{$t(hand === 'bass' ? 'bassClef' : 'trebleClef')}}</button>
            </div>
          </div>
          <div class="chord-field">
            <span>{{$t('NOTE_RANGE_PRESETS')}}</span>
            <div class="chord-choice" role="group" :aria-label="$t('NOTE_RANGE_PRESETS')">
              <button v-for="preset in ['easy','normal','hard']" :key="preset" type="button"
                :class="{selected:rangePreset === preset}" :aria-pressed="rangePreset === preset"
                @click="applyRangePreset(preset)">{{$t(preset)}}</button>
            </div>
          </div>
          <div v-for="hand in activeHands" :key="hand" class="chord-hand-range">
            <h3>{{handLabel(hand)}}</h3>
            <div class="chord-range-fields">
              <div class="chord-field">
                <label :for="`chord-${hand}-min`">{{$t('FLOW_CHORD_RANGE_FROM')}}</label>
                <select :id="`chord-${hand}-min`" :value="localOptions[rangeField(hand, 'min')]"
                  @change="updateRange(hand, 'min', Number($event.target.value))">
                  <option v-for="note in noteOptions" :key="note.value" :value="note.value">{{note.label}}</option>
                </select>
              </div>
              <div class="chord-field">
                <label :for="`chord-${hand}-max`">{{$t('FLOW_CHORD_RANGE_TO')}}</label>
                <select :id="`chord-${hand}-max`" :value="localOptions[rangeField(hand, 'max')]"
                  @change="updateRange(hand, 'max', Number($event.target.value))">
                  <option v-for="note in noteOptions" :key="note.value" :value="note.value">{{note.label}}</option>
                </select>
              </div>
            </div>
          </div>
          <CustomKeyboardPreview
            :min-value="keyboardMinValue" :max-value="keyboardMaxValue"
            :accidentals="localOptions.accidentals" :show-clef-assignment="localOptions.handMode === 'two'"
            :treble-min-value="localOptions.customTrebleMinValue" :bass-max-value="localOptions.customBassMaxValue"
            @update:min-value="updateRange(localOptions.handMode === 'two' ? 'bass' : localOptions.singleHand, 'min', $event)"
            @update:max-value="updateRange(localOptions.handMode === 'two' ? 'treble' : localOptions.singleHand, 'max', $event)"
            @update:treble-min-value="updateRange('treble', 'min', $event)"
            @update:bass-max-value="updateRange('bass', 'max', $event)"
          />
          <p v-if="localOptions.handMode === 'two'" class="chord-hand-hint">{{$t('FLOW_CHORD_HANDS_OVERLAP')}}</p>
          <div class="chord-field">
            <span>{{$t('FLOW_TONALITY_MODE')}}</span>
            <div class="chord-choice">
              <button type="button" :class="{ selected: localOptions.tonalityMode === 'random' }" :aria-pressed="localOptions.tonalityMode === 'random'" @click="update('tonalityMode', 'random')">{{$t('FLOW_ALL_KEYS_RANDOM')}}</button>
              <button type="button" :class="{ selected: localOptions.tonalityMode === 'circle' }" :aria-pressed="localOptions.tonalityMode === 'circle'" @click="update('tonalityMode', 'circle')">{{$t('FLOW_CIRCLE_OF_FIFTHS')}}</button>
            </div>
          </div>
          <div class="chord-field">
            <label for="chord-accidentals">{{$t('ACCIDENTALS')}}</label>
            <select id="chord-accidentals" :value="localOptions.accidentals" @change="update('accidentals', $event.target.value)">
              <option value="no">{{$t('none')}}</option>
              <option value="onlySharp">{{$t('sharp')}}</option>
              <option value="onlyFlat">{{$t('flat')}}</option>
              <option value="sharpAndFlat">{{$t('sharpAndFlat')}}</option>
            </select>
          </div>
          <NoteFlowCircleSelector v-if="localOptions.tonalityMode === 'circle'" :value="localOptions.selectedKey" :accidentals="localOptions.accidentals" :note-naming="noteNaming" @input="update('selectedKey', $event)" />
        </section>

        <section v-if="activeSettingSection === 'algorithm'" class="chord-panel chord-preview">
          <h2>{{$t('FLOW_ALGORITHM_TITLE')}}</h2>
          <p>{{$t('FLOW_ALGORITHM_DESCRIPTION')}}</p>
          <NoteFlowMovementSelector kind="chord" :value="localOptions.movement" @input="update('movement', $event)" />
          <NoteFlowAlgorithmControls v-if="localOptions.movement === 'custom'" kind="chord"
            :value="localOptions.algorithmSettings" :bass-note="localOptions.bassNote"
            :primary-hand="localOptions.handMode === 'single' ? localOptions.singleHand : 'treble'"
            @input="update('algorithmSettings', $event)" />
          <div class="chord-algorithm-preview">
            <div class="chord-preview-heading">
              <h3>{{$t('FLOW_ALGORITHM_PREVIEW')}}</h3>
              <span>{{localOptions.rhythmMeter}} · {{localOptions.bpm}} BPM</span>
            </div>
            <p v-if="previewError || !rhythmScore" class="chord-preview-error" role="alert">{{$t('FLOW_CHORD_PREVIEW_ERROR')}}</p>
            <template v-else>
              <p class="chord-preview-key">{{$t('FLOW_CHORD_PREVIEW_KEY')}} <strong>{{previewKeyLabel}}</strong></p>
              <NoteFlowChordRhythmScore :score="rhythmScore" :tonality="previewKey" :active-chord-id="activeChordId" :measure-count="4" :show-heading="false" />
              <div class="chord-audition-controls">
                <button type="button" class="chord-audition-play" @click="nextPreview">{{$t('FLOW_ALGORITHM_NEW_EXAMPLE')}}</button>
                <button type="button" :class="auditionPlaying ? 'chord-audition-stop' : 'chord-audition-play'"
                  @click="auditionPlaying ? stopAudition() : startAudition()">
                    {{auditionPlaying ? $t('FLOW_CHORD_STOP') : $t('FLOW_ALGORITHM_LISTEN')}}
                </button>
              </div>
              <p class="chord-preview-footnote">{{$t('FLOW_ALGORITHM_PREVIEW_HINT')}}</p>
            </template>
          </div>
        </section>
        </div>
      </section>
      <section v-else class="chord-statistics">
          <header class="statistics-summary">
            <span class="statistics-summary-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40" focusable="false"><path d="M8 31V22M16 31V14M24 31V19M32 31V8M5 31h30" /></svg>
            </span>
            <span class="statistics-summary-copy">
              <small>{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small>
              <h2>{{$t('FLOW_STATISTICS_PREVIEW')}}</h2>
              <span>{{$t('FLOW_CHORD_STATISTICS_DESCRIPTION')}}</span>
            </span>
            <span v-if="statisticsState === 'ready' && statisticsSnapshot.hasResults" class="summary-meta">
              <span class="statistics-count">{{$tc('ROUND_STATS_ROUND_COUNT', statisticsSnapshot.roundCount, { count: statisticsSnapshot.roundCount })}}</span>
            </span>
          </header>
        <div v-if="statisticsState === 'loading'" class="chord-statistics-status" role="status">{{$t('FLOW_STAT_LOADING')}}</div>
        <div v-else-if="statisticsState === 'error'" class="chord-statistics-status is-error" role="alert">
          {{$t('FLOW_STAT_LOAD_ERROR')}}
          <button type="button" class="persistence-retry" @click="loadStatistics">{{$t('FLOW_RESULT_SAVE_RETRY')}}</button>
        </div>
        <template v-else-if="statisticsSnapshot.hasResults">
            <section class="flow-statistics-overview statistics-section-card">
              <h3>{{$t('ROUND_STATS_RESULTS_TITLE')}}</h3>
              <div class="chord-metric-grid statistics-metric-grid">
                <StatisticsMetric icon="rounds" accent="orange" :value="statisticsSnapshot.roundCount" :label="$t('FLOW_STAT_ROUNDS_COUNT')" />
                <StatisticsMetric icon="notes" accent="gold" :value="statisticsSnapshot.evaluatedNoteCount" :label="$t('FLOW_CHORD_STAT_TOTAL_CHORDS')" />
                <StatisticsMetric accent="petrol" :percentage="statisticsSnapshot.accuracy" :value="`${statisticsSnapshot.accuracy} %`" :label="$t('FLOW_STAT_ACCURACY')" />
                <StatisticsMetric icon="missed" accent="violet" :value="statisticsSnapshot.missedCount" :label="$t('FLOW_STAT_MISSED')" />
                <StatisticsMetric icon="timing" accent="muted" :value="statisticsTimingLabel" :label="$t('FLOW_STAT_TIMING_OFFSET')" />
                <StatisticsMetric icon="duration" accent="orange" :value="statisticsDurationLabel" :label="$t('FLOW_STAT_PLAY_TIME')" />
              </div>
            </section>
          <div v-if="statisticsSnapshot.timedInputCount > 0" class="chord-timing-summary statistics-section-card">
            <h3>{{$t('FLOW_RESULT_TIMING')}}</h3>
            <div>
              <span><strong>{{statisticsSnapshot.earlyCount}}</strong>{{$t('FLOW_RESULT_EARLY')}}</span>
              <span><strong>{{statisticsSnapshot.preciseCount}}</strong>{{$t('FLOW_RESULT_PRECISE')}}</span>
              <span><strong>{{statisticsSnapshot.lateCount}}</strong>{{$t('FLOW_RESULT_LATE')}}</span>
            </div>
            <p>{{$t('FLOW_STAT_PRECISE_RATE', { value: statisticsSnapshot.preciseRate })}}</p>
          </div>
          <section class="chord-meter-statistics statistics-section-card">
            <h3>{{$t('FLOW_METER_STATISTICS')}}</h3>
            <div class="chord-meter-grid">
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
          <NoteFlowHistoryChart input-group="midi" exercise-type="chord"
            evaluated-label-key="FLOW_CHORD_STAT_TOTAL_CHORDS" movement-label-key="FLOW_CHORD_MOVEMENT"
            :show-hand-mode="false" :total-round-count="statisticsSnapshot.roundCount">
            <template slot="additional-details" slot-scope="{ round }">
              <div v-if="round.chord"><dt>{{$t('FLOW_CHORD_TOTAL_TONES')}}</dt><dd>{{roundTotalTones(round.chord)}}</dd></div>
              <div v-if="round.chord"><dt>{{$t('FLOW_CHORD_HANDS_TITLE')}}</dt><dd>{{roundHandsSummary(round.chord)}}</dd></div>
            </template>
            <template slot="rhythm-details" slot-scope="{ round }">
              <template v-if="round.chord && round.chord.rhythmMeter && Array.isArray(round.chord.rhythmValues) && round.chord.rhythmValues.length">
                <p>{{$t('FLOW_METER')}}: {{round.chord.rhythmMeter}}</p>
                <p>{{$t('FLOW_CHORD_RHYTHM_VALUES')}}: {{round.chord.rhythmValues.map(rhythmValueLabel).join(' · ')}}</p>
              </template>
              <p v-else>{{$t('FLOW_RHYTHM_NOT_RECORDED')}}</p>
            </template>
          </NoteFlowHistoryChart>
        </template>
        <div v-else-if="statisticsState === 'ready'" class="chord-statistics-empty statistics-section-card">
          <span aria-hidden="true">♬</span>
          <h3>{{$t('FLOW_NO_RESULTS')}}</h3>
          <p>{{$t('FLOW_CHORD_NO_RESULTS_DESCRIPTION')}}</p>
        </div>
      </section>
    </div>
    <FloatingTrainingStart anchor-selector=".chord-start" :view-key="tab"
      :label="$t('FLOW_CHORD_TRAINING_START')" :disabled="!previewPlan" @start="startTraining" />
  </main>
</template>

<script>
import FloatingTrainingStart from './FloatingTrainingStart';
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import NoteFlowModeHeader from "./NoteFlowModeHeader";
import NoteFlowViewTabs from "./NoteFlowViewTabs";
import SettingsSectionIcon from "./SettingsSectionIcon";
import CustomKeyboardPreview from "./CustomKeyboardPreview";
import NoteFlowCircleSelector from "./NoteFlowCircleSelector";
import NoteFlowChordRhythmScore from "./NoteFlowChordRhythmScore";
import NoteFlowMovementSelector from "./NoteFlowMovementSelector";
import NoteFlowHistoryChart from "./NoteFlowHistoryChart";
import StatisticsMetric from "./StatisticsMetric";
import NoteFlowAlgorithmControls from "./NoteFlowAlgorithmControls";
import { normalizeNoteFlowMovement, getNoteFlowMovementLabelKey } from "../model/NoteFlowMovement";
import { normalizeNoteFlowChordOptions } from "../model/NoteFlowChordConfig";
import { NOTE_FLOW_RHYTHM_VALUES } from "../model/NoteFlowMenuConfig";
import { NOTE_FLOW_MIN_BPM, NOTE_FLOW_MAX_BPM } from "../model/NoteFlowPlayback";
import { createNoteFlowChordPlan } from "../model/NoteFlowChordPlan";
import { generateNoteFlowChordRhythmicScore } from "../model/NoteFlowChordRhythm";
import { getNoteFlowTonality } from "../model/NoteFlowTonality";
import { formatNoteFlowTonalityLabel } from "../model/NoteFlowKeyLabels";
import { createNoteFlowChordAudition } from "../model/NoteFlowChordAudition";
import { createPianoSamplePlayer } from "../model/PianoAudio";
import NoteFlowRoundStorage from "../model/NoteFlowRoundStorage";
import { createEmptyNoteFlowStatistics, createNoteFlowStatisticsSnapshot } from "../model/NoteFlowStatistics";
import Options from "../model/Options";
import Utils from "../model/Utils";
import { getNaturalNoteValues, getRangePresetValues, getMatchingRangePreset } from "../model/NoteRanges";
import { normalizeNoteFlowChordPreferences } from "../model/NoteFlowPreferences";

export default {
  name: "NoteFlowChordMenu",
  components: { FloatingTrainingStart, StatisticsMetric, HomeMusicBackdrop, NoteFlowModeHeader, NoteFlowViewTabs, SettingsSectionIcon, CustomKeyboardPreview, NoteFlowCircleSelector, NoteFlowChordRhythmScore, NoteFlowMovementSelector, NoteFlowAlgorithmControls, NoteFlowHistoryChart },
  props: { options: { type: Object, default: null } },
  data() {
    return {
      tab: "settings",
      activeSettingSection: null,
      summaryExpanded: false,
      bpmMin: NOTE_FLOW_MIN_BPM,
      bpmMax: NOTE_FLOW_MAX_BPM,
      localOptions: normalizeNoteFlowChordPreferences(Object.assign({}, Options.noteFlowChordSettings || this.options || {}, {
        movement: normalizeNoteFlowMovement(Options.noteFlowChordMovement)
      })),
      previewIndex: 0,
      previewPlan: null,
      previewError: false,
      auditionPlaying: false,
      auditionProgress: "",
      activeChordId: null,
      statisticsState: "idle",
      statisticsSnapshot: createEmptyNoteFlowStatistics(),
      statisticsRequest: 0
    };
  },
  computed: {
    rangePreset() { return getMatchingRangePreset(this.localOptions, this.activeHands); },
    noteNaming() { return Options.noteNaming || "german"; },
    noteOptions() {
      return getNaturalNoteValues().map(value => ({ value,
        label: `${Utils.getDisplayNoteName(value % 12, true, this.noteNaming)}${Math.floor(value / 12)}` }));
    },
    selectedHands() { return this.localOptions.handMode === "two" ? "two" : this.localOptions.singleHand; },
    activeHands() { return this.localOptions.handMode === "two" ? ["bass", "treble"] : [this.localOptions.singleHand]; },
    keyboardMinValue() { return this.localOptions[this.rangeField(this.localOptions.handMode === "two" ? "bass" : this.localOptions.singleHand, "min")]; },
    keyboardMaxValue() { return this.localOptions[this.rangeField(this.localOptions.handMode === "two" ? "treble" : this.localOptions.singleHand, "max")]; },
    handsSummary() {
      return this.activeHands.map(hand => `${this.handLabel(hand)}: ${this.localOptions[hand === "bass" ? "bassNotesPerChord" : "trebleNotesPerChord"]}`).join(" · ");
    },
    rangesSummary() {
      return this.activeHands.map(hand => `${this.handLabel(hand)}: ${this.rangeNoteLabel(this.localOptions[this.rangeField(hand, "min")])}–${this.rangeNoteLabel(this.localOptions[this.rangeField(hand, "max")])}`).join(" · ");
    },
    previewKey() {
      return this.previewPlan ? getNoteFlowTonality(this.previewPlan.keyId)
        : this.localOptions.tonalityMode === "circle" ? getNoteFlowTonality(this.localOptions.selectedKey) : null;
    },
    previewKeyLabel() { return formatNoteFlowTonalityLabel(this.previewKey, this.noteNaming); },
    roundLengthOptions() {
      return [
        { value: 20, label: this.$t("twentySeconds") },
        { value: 60, label: this.$t("oneMinute") },
        { value: 300, label: this.$t("fiveMinutes") },
        { value: 0, label: this.$t("infinite") }
      ];
    },
    roundLengthLabel() {
      return this.roundLengthOptions.filter(item => item.value === this.localOptions.gameLength)[0].label;
    },
    rhythmValueOptions() {
      return NOTE_FLOW_RHYTHM_VALUES.filter(value => (
        value !== "whole" || this.localOptions.rhythmMeter === "4/4"
      ));
    },
    rhythmScore() {
      if (!this.previewPlan) return null;
      try {
        const score = generateNoteFlowChordRhythmicScore(this.previewPlan, {
          meter: this.localOptions.rhythmMeter,
          allowedValues: this.localOptions.rhythmValues,
          bpm: this.localOptions.bpm
        });
        const measures = score.measures.slice(0, 4);
        const lastMeasure = measures[measures.length - 1];
        const end = lastMeasure.events[lastMeasure.events.length - 1];
        return Object.assign({}, score, { measures,
          targets: score.targets.filter(target => target.globalStartTick < end.globalEndTick),
          durationTicks: end.globalEndTick, durationMs: end.endMs });
      } catch (error) {
        return null;
      }
    },
    settingSections() {
      return [
        {
          id: "tonality", title: this.$t("FLOW_MENU_NOTES_TITLE"),
          summary: `${this.rangesSummary} · ${this.localOptions.tonalityMode === "circle" ? this.previewKeyLabel : this.$t("FLOW_ALL_KEYS_RANDOM")} · ${this.accidentalsLabel}`
        },
        {
          id: "tempo", title: this.$t("FLOW_MENU_TEMPO_TITLE"),
          summary: `${this.roundLengthLabel} · ${this.localOptions.bpm} BPM`
        },
        {
          id: "hands", title: this.$t("FLOW_CHORD_HANDS_TITLE"),
          summary: `${this.localOptions.chordSize} ${this.$t("FLOW_CHORD_TONES")} · ${this.handsSummary}`
        },
        {
          id: "rhythm", title: this.$t("FLOW_RHYTHM_TITLE"),
          summary: `${this.localOptions.rhythmMeter} · ${this.localOptions.rhythmValues.map(this.rhythmValueLabel).join(", ")}`
        },
        {
          id: "algorithm", title: this.$t("FLOW_ALGORITHM_TITLE"),
          summary: this.movementLabel(this.localOptions.movement) + " · " + this.$t("FLOW_ALGORITHM_PREVIEW")
        },
        {
          id: "behavior", title: this.$t("FLOW_CHORD_BEHAVIOR_TITLE"),
          summary: `${this.$t(this.localOptions.behavior === "wait" ? "FLOW_WAIT" : "FLOW_CONTINUOUS")} · MIDI`
        }
      ];
    },
    accidentalsLabel() {
      const labels = { no: "none", onlySharp: "sharp", onlyFlat: "flat", sharpAndFlat: "sharpAndFlat" };
      return this.$t(labels[this.localOptions.accidentals]);
    },
    statisticsTimingLabel() {
      return this.statisticsSnapshot.averageAbsoluteOffsetMs === null
        ? "—" : `${this.statisticsSnapshot.averageAbsoluteOffsetMs} ms`;
    },
    statisticsDurationLabel() {
      const seconds = Math.round(this.statisticsSnapshot.durationTotalMs / 1000);
      return this.$t("FLOW_CHORD_STAT_DURATION", {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60
      });
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
    this.pianoPlayer = createPianoSamplePlayer({ maxVoices: 16 });
    this.audition = null;
    this.regeneratePreview();
  },
  mounted() {
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => { if (this.auditionPlaying) this.stopAudition(); });
    this.visibilityHandler = () => {
      if (document.hidden) this.stopAudition();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  },
  beforeDestroy() {
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    this.savePreferences();
    this.statisticsRequest += 1;
    this.stopAudition();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
  },
  watch: {
    tab(value) {
      if (value !== "settings") this.stopAudition();
    }
  },
  methods: {
    savePreferences() {
      const saved = normalizeNoteFlowChordPreferences(this.localOptions);
      if (JSON.stringify(saved) === JSON.stringify(Options.noteFlowChordSettings)
        && Options.noteFlowChordMovement === saved.movement) return;
      Options.noteFlowChordSettings = saved;
      Options.noteFlowChordMovement = saved.movement;
      Options.saveOptions();
    },
    movementLabel(value) { return this.$t(getNoteFlowMovementLabelKey(value)); },
    goBack() {
      if (this.handleBack()) return;
      this.$emit("back");
    },
    handleBack() {
      this.savePreferences();
      if (this.tab === "settings" && this.activeSettingSection) {
        this.closeSettingSection();
        return true;
      }
      return false;
    },
    openSettingSection(section) {
      if (section === "structure") section = "hands";
      if (!["hands", "tonality", "algorithm", "rhythm", "behavior", "tempo"].includes(section)) return;
      this.activeSettingSection = section;
      this.$nextTick(() => window.scrollTo(0, 0));
    },
    closeSettingSection() {
      this.stopAudition();
      this.activeSettingSection = null;
      this.$nextTick(() => window.scrollTo(0, 0));
    },
    selectTab(tab) {
      this.stopAudition();
      this.tab = tab === "statistics" ? "statistics" : "settings";
      this.activeSettingSection = null;
      if (this.tab === "statistics") this.loadStatistics();
      else this.statisticsRequest += 1;
      this.$nextTick(() => window.scrollTo(0, 0));
    },
    async loadStatistics() {
      const request = ++this.statisticsRequest;
      this.statisticsState = "loading";
      try {
        const result = await NoteFlowRoundStorage.readStatistics("midi", "chord");
        if (request !== this.statisticsRequest || this.tab !== "statistics") return;
        if (!result.saved) {
          this.statisticsState = "error";
          return;
        }
        this.statisticsSnapshot = createNoteFlowStatisticsSnapshot(result.statistics);
        this.statisticsState = "ready";
      } catch (error) {
        if (request === this.statisticsRequest && this.tab === "statistics") this.statisticsState = "error";
      }
    },
    handLabel(hand) { return this.$t(hand === "bass" ? "FLOW_CHORD_LEFT_HAND" : "FLOW_CHORD_RIGHT_HAND"); },
    rangeNoteLabel(value) { return `${Utils.getDisplayNoteName(value % 12, true, this.noteNaming)}${Math.floor(value / 12)}`; },
    roundHandsSummary(chord) {
      if (!chord.handMode) return this.$t(chord.bassNote ? "FLOW_CHORD_BASS_ON" : "FLOW_CHORD_BASS_OFF");
      const hands = chord.handMode === "two" ? ["bass", "treble"] : [chord.singleHand];
      return hands.map(hand => `${this.handLabel(hand)}: ${chord[hand === "bass" ? "bassNotesPerChord" : "trebleNotesPerChord"]}`).join(" · ");
    },
    roundTotalTones(chord) { return normalizeNoteFlowChordOptions(chord).chordSize; },
    rangeField(hand, bound) {
      return hand === "bass" ? (bound === "min" ? "customMinValue" : "customBassMaxValue")
        : (bound === "min" ? "customTrebleMinValue" : "customMaxValue");
    },
    updateHands(hand) {
      this.updatePatch({ handMode: hand === "two" ? "two" : "single",
        singleHand: hand === "two" ? this.localOptions.singleHand : hand,
        bassNotesPerChord: hand === "two" ? Math.max(1, Math.min(this.localOptions.chordSize - 1, this.localOptions.bassNotesPerChord)) : (hand === "bass" ? this.localOptions.chordSize : 0)
      });
    },
    updateHandCount(hand, count) {
      const bassCount = hand === "bass" ? count : this.localOptions.chordSize - count;
      this.updatePatch({ bassNotesPerChord: bassCount, trebleNotesPerChord: this.localOptions.chordSize - bassCount });
    },
    applyRangePreset(preset) {
      const patch = getRangePresetValues(preset, this.activeHands);
      if (Object.keys(patch).length) this.updatePatch(patch);
    },
    updateRange(hand, bound, value) {
      const field = this.rangeField(hand, bound);
      const otherField = this.rangeField(hand, bound === "min" ? "max" : "min");
      const patch = { [field]: value };
      if ((bound === "min" && value > this.localOptions[otherField])
        || (bound === "max" && value < this.localOptions[otherField])) patch[otherField] = value;
      this.updatePatch(patch);
    },
    update(key, value) {
      if (key === "bassNote") return this.updateHands(value ? "two" : "treble");
      this.updatePatch({ [key]: value }, key);
    },
    updatePatch(patch, key) {
      this.stopAudition();
      this.localOptions = normalizeNoteFlowChordOptions(Object.assign({}, this.localOptions, patch));
      this.savePreferences();
      this.$emit("change", Object.assign({}, this.localOptions));
      if (["bpm", "gameLength", "behavior", "displayNote", "rhythmMeter", "rhythmValues"].includes(key) && this.previewPlan) {
        this.previewPlan = Object.assign({}, this.previewPlan, {
          options: Object.assign({}, this.localOptions),
          behavior: this.localOptions.behavior
        });
        return;
      }
      this.previewIndex = 0;
      this.regeneratePreview();
    },
    updateBpm(event) {
      this.update("bpm", Number(event.target.value));
    },
    toggleRhythmValue(value) {
      const selected = this.localOptions.rhythmValues;
      if (selected.includes(value) && selected.length === 1) return;
      this.update("rhythmValues", selected.includes(value)
        ? selected.filter(item => item !== value)
        : selected.concat(value));
    },
    rhythmValueLabel(value) {
      return this.$t(`FLOW_RHYTHM_VALUE_${value.replace(/-/g, "_").toUpperCase()}`);
    },
    nextPreview() {
      this.stopAudition();
      this.previewIndex += 1;
      this.regeneratePreview();
    },
    startTraining() {
      if (!this.previewPlan) return;
      this.stopAudition();
      this.$emit("startTraining", this.previewPlan);
    },
    async startAudition() {
      if (!this.previewPlan || !this.rhythmScore) return;
      this.stopAudition();
      const request = this.audioStartRequest;
      const ready = await AudioSync.resume();
      if (request !== this.audioStartRequest) return;
      const context = AudioSync.getContext();
      if (context && (!ready || context.state !== "running")) return;
      this.audition = createNoteFlowChordAudition(this.previewPlan, {
        rhythmScore: this.rhythmScore,
        player: this.pianoPlayer,
        appVolume: Options.appVolume,
        delayMs: AudioSync.getDelayMs(),
        onStep: (chord, index, total) => {
          this.activeChordId = chord.id;
          this.auditionProgress = this.$t("FLOW_CHORD_AUDITION_PROGRESS", { index, total });
          this.auditionPlaying = true;
        },
        onRest: () => { this.activeChordId = null; },
        onStop: () => {
          this.activeChordId = null;
          this.auditionProgress = "";
          this.auditionPlaying = false;
        }
      });
      this.auditionPlaying = this.audition.start();
    },
    stopAudition() {
      this.audioStartRequest = (this.audioStartRequest || 0) + 1;
      if (this.audition) this.audition.stop();
      this.audition = null;
    },
    regeneratePreview() {
      try {
        this.previewPlan = createNoteFlowChordPlan(this.localOptions, this.previewIndex);
        this.previewError = false;
      } catch (error) {
        this.previewPlan = null;
        this.previewError = true;
      }
    }
  }
};
</script>

<style scoped>
.chord-menu { position: relative; min-height: 100vh; color: #213237; background: #f7f2e9; }
.chord-backdrop { position: fixed; inset: 0; overflow: hidden; opacity: .38; pointer-events: none; }
.chord-shell { position: relative; box-sizing: border-box; max-width: 760px; min-height: 100vh; margin: auto; padding: calc(14px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom)); text-align: left; }
.chord-back { display: inline-flex; align-items: center; gap: 7px; min-height: 39px; padding: 0 13px; border: 1px solid rgba(207,86,39,.33); border-radius: 12px; background: rgba(255,250,246,.88); color: #91401f; font: inherit; font-size: 11px; font-weight: 800; letter-spacing: .04em; cursor: pointer; }
.chord-back span { font-size: 18px; }
.chord-panel { border: 1px solid rgba(43,70,77,.12); border-radius: 21px; background: rgba(255,255,255,.84); box-shadow: 0 11px 25px rgba(72,58,45,.08); }
h2 { margin: 0 0 5px; font-size: 17px; }
p { margin: 0; color: #647a7f; font-size: 12px; line-height: 1.45; }
.chord-choice button { flex: 1; min-height: 44px; border: 1px solid #d4e0e2; border-radius: 13px; background: #fff; color: #355864; font: inherit; font-weight: 700; cursor: pointer; }
.chord-choice button.selected { border-color: #85aeb7; background: #e8f5f7; }
.chord-content { display: grid; grid-template-columns: minmax(0,1fr); gap: 12px; margin-top: 12px; }
.chord-section-list,.chord-section-detail { display: grid; grid-template-columns: minmax(0,1fr); gap: 12px; min-width: 0; }
.chord-section-link { display: grid; width: 100%; min-height: 88px; grid-template-columns: 46px minmax(0,1fr) 20px; align-items: center; gap: 12px; padding: 14px; border: 1px solid rgba(43,70,77,.12); border-radius: 18px; background: rgba(255,255,255,.82); box-shadow: 0 8px 20px rgba(72,58,45,.07); color: #294248; font: inherit; text-align: left; cursor: pointer; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.chord-section-link:active { transform: translateY(1px); }
.chord-section-link:focus-visible,.chord-section-return:focus-visible { outline: 2px solid #2d7b88; outline-offset: 3px; }
.chord-section-copy { display: grid; min-width: 0; gap: 5px; }
.chord-section-copy strong { color: #2d5661; font-size: 12px; font-weight: 850; letter-spacing: .04em; }
.chord-section-copy small { display: -webkit-box; overflow: hidden; color: #697d82; font-size: 11px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.chord-section-arrow { color: #d65b2d; font-size: 21px; }
.chord-section-return { justify-self: start; min-height: 38px; padding: 0 12px; border: 1px solid rgba(45,113,128,.25); border-radius: 12px; background: rgba(255,255,255,.82); color: #286a77; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
.chord-section-return span { margin-right: 6px; font-size: 17px; vertical-align: -1px; }
.chord-panel { min-width: 0; padding: 17px; }
.chord-setting-heading { display: grid; grid-template-columns: 46px minmax(0,1fr); align-items: center; gap: 12px; }
.chord-intro-panel {
  padding: 13px;
  border-color: rgba(43, 70, 77, .11);
  background: rgba(255, 255, 255, .79);
  box-shadow: 0 11px 25px rgba(72, 58, 45, .09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}
.chord-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 0 3px 10px;
}
.chord-summary > span { color: #2d6e7b; font-size: 9px; font-weight: 800; letter-spacing: .16em; }
.chord-summary-toggle {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-weight: bold;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  color: #52676c;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chord-summary-toggle.expanded { overflow: visible; text-overflow: clip; white-space: normal; }
.chord-start {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px 13px 20px;
  border: none;
  border-radius: 17px;
  background: linear-gradient(135deg, #ef6936, #dc501f);
  box-shadow: 0 9px 18px rgba(220, 80, 31, .2);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .02em;
  cursor: pointer;
}
.chord-start:active:not(:disabled) { transform: translateY(1px); }
.chord-start span:last-child { font-size: 24px; }
.chord-start:disabled { opacity: .5; cursor: not-allowed; }
.chord-field { margin-top: 17px; }
.chord-hand-range,.chord-hand-count { margin-top: 18px; padding: 14px; border: 1px solid #d4e0e2; border-radius: 14px; }
.chord-hand-range h3,.chord-hand-count h3 { margin: 0; font-size: 14px; color: #355864; }
.chord-range-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.chord-hand-hint { margin-top: 12px; }
.chord-hand-choice button { min-width: 0; padding: 7px; font-size: 12px; }
.chord-field > span, .chord-field > label { display: block; margin-bottom: 8px; color: #526970; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.chord-choice { display: flex; gap: 8px; }
.chord-tone-choice { display: grid; grid-template-columns: repeat(auto-fit,minmax(36px,1fr)); }
.chord-tone-choice button { min-width: 0; padding: 7px 3px; font-size: 12px; }
.chord-length-choice { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
.chord-meter-choice { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
.chord-rhythm-choice { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
.chord-rhythm-choice button { min-width: 0; padding: 6px; font-size: 11px; }
.chord-rhythm-pending { color: #97512e; }
.chord-bpm-range { width: 100%; accent-color: #2d7180; }
.chord-bpm-scale { display: flex; justify-content: space-between; color: #647a7f; font-size: 10px; }
.chord-bpm-hint { margin-top: 9px; }
.chord-field select { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #d4e0e2; border-radius: 13px; background: #fff; color: #355864; font: inherit; }
.chord-statistics { display: grid; gap: 12px; min-width: 0; margin-top: 13px; padding: 0; text-align: left; }
.chord-statistics-status { padding: 20px 14px; border: 1px solid rgba(45,110,123,.13); border-radius: 21px; background: rgba(244,250,250,.84); color: #5c7479; font-size: 11px; text-align: center; }
.chord-statistics-status.is-error { color: #9b4127; }
.chord-statistics-status button { margin-left: 8px; padding: 5px 8px; border: 1px solid currentColor; border-radius: 8px; background: #fff; color: inherit; font: inherit; font-weight: 800; }
.chord-metric-grid div { display: flex; min-height: 82px; align-items: center; justify-content: center; flex-direction: column; gap: 5px; padding: 8px; border: 1px solid rgba(45,110,123,.14); border-radius: 14px; background: rgba(242,249,250,.8); text-align: center; }
.chord-timing-summary { padding: 14px 15px; }
.chord-meter-statistics { padding: 14px 15px; }
.chord-meter-statistics h3 { margin: 0 0 9px; color: #294b52; font-size: 13px; }
.chord-meter-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }
.chord-meter-grid > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 10px 8px; border: 1px solid rgba(45,110,123,.15); border-radius: 12px; background: rgba(239,249,251,.78); color: #61777c; font-size: 10px; }
.chord-meter-grid strong { color: #2d7180; font-size: 15px; }
.chord-meter-statistics > p { margin: 9px 0 0; color: #7b8382; font-size: 10px; line-height: 1.4; }
.chord-timing-summary h3 { margin: 0 0 11px; color: #8f4d31; font-size: 10px; letter-spacing: .07em; }
.chord-timing-summary > div { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
.chord-timing-summary span { color: #7b7f7e; font-size: 9px; }
.chord-timing-summary strong { display: block; color: #3b555b; font-size: 16px; }
.chord-timing-summary p { margin: 10px 0 0; color: #7f6e67; font-size: 9px; }
.chord-statistics-empty { padding: 24px 16px; border: 1px solid rgba(43,70,77,.11); border-radius: 21px; background: rgba(255,255,255,.72); text-align: center; }
.chord-statistics-empty > span { color: #d96531; font-size: 31px; }
.chord-statistics-empty h3 { margin: 7px 0 3px; color: #3d5960; font-size: 13px; }
.chord-statistics-empty p { margin: 0; color: #819094; font-size: 10px; line-height: 1.4; }
.chord-algorithm-preview { margin-top: 23px; padding-top: 18px; border-top: 1px solid #d5e6e9; }
.chord-preview-heading h3 { margin: 0; color: #355864; font-size: 12px; }
.chord-preview-heading > span { color: #647a7f; font-size: 12px; }
.chord-audition-controls { margin-top: 13px; }
.chord-audition-controls button { flex: 1; }
.chord-preview-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.chord-regenerate { min-height: 40px; padding: 0 12px; border: 1px solid #85aeb7; border-radius: 11px; background: #e8f5f7; color: #245f6c; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.chord-preview-key { margin: 16px 0 10px; color: #385e67; }
.chord-audition-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.chord-audition-controls button { min-height: 42px; padding: 0 13px; border: 1px solid #85aeb7; border-radius: 11px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.chord-audition-play { background: #dff0f3; color: #245f6c; }
.chord-audition-stop { background: #fff9f5; color: #a64a2b; }
.chord-audition-controls button:disabled { opacity: .46; cursor: not-allowed; }
.chord-audition-progress { color: #406a74; font-size: 11px; font-weight: 800; }
.chord-preview-block { margin-top: 14px; }
.chord-preview-block h3 { margin: 0 0 7px; color: #345f6a; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; }
.chord-preview-block ol { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.chord-preview-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-height: 43px; padding: 7px 10px; border: 1px solid #dce8ea; border-radius: 11px; background: rgba(246,251,252,.9); }
.chord-preview-item.is-playing { border-color: #e76530; background: #fff0e7; box-shadow: 0 0 0 2px rgba(231,101,48,.16); }
.chord-preview-degree { min-width: 32px; color: #a74724; font-size: 16px; }
.chord-preview-notes { flex: 1; min-width: 110px; color: #284a55; font-size: 12px; font-weight: 700; }
.chord-preview-bass { color: #327887; font-size: 12px; font-weight: 800; }
.chord-preview-footnote { margin-top: 13px; }
.chord-preview-error { margin-top: 12px; color: #9d3e2a; }
</style>
