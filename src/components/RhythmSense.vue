<template>
  <main class="sense-page" :class="{ 'is-running': isRunning, 'flow-game-preview': screen === 'training' && phase === 'result' }">
    <template v-if="screen === 'training' && phase === 'result'">
      <div class="flow-game-backdrop-clip" aria-hidden="true"><HomeMusicBackdrop class="flow-game-backdrop" /></div>
      <div class="flow-game-shell">
        <section class="flow-game-status">
          <div class="flow-game-title"><span class="flow-game-title-mark" aria-hidden="true"></span><div><small>{{$t('HOME_TRAINING_KICKER')}}</small><h1>{{$t('HOME_RHYTHM_SENSE')}}</h1></div></div>
          <div class="flow-training-controls">
            <button type="button" class="flow-training-exit" @click="showResultSettings">{{$t('FLOW_BACK_TO_SETTINGS')}}</button>
            <button type="button" class="flow-training-play" @click="start"><span class="flow-control-icon flow-play-icon" aria-hidden="true"></span>{{$t('FLOW_PLAY_AGAIN')}}</button>
            <button type="button" class="flow-training-pause" @click="showResultStatistics">{{$t('SINGLE_NOTES_RESULT_STATISTICS')}}</button>
          </div>
          <div class="flow-live-score">
            <div><strong>{{resultSummary.hitCount}} / {{resultSummary.total}}</strong><span>{{$t('RHYTHM_EVAL_HITS_SHORT')}}</span></div>
            <div><strong>{{resultSummary.correct}}</strong><span>{{$t('CORRECT')}}</span></div>
            <div><strong>{{resultSummary.precisionPercent}} %</strong><span>{{$t('ACCURACY')}}</span></div>
          </div>
        </section>
        <section class="flow-stage-card has-overlay">
          <div class="flow-result-overlay sense-result" role="region" aria-labelledby="sense-result-title">
            <div class="flow-result-heading"><span aria-hidden="true">✓</span><div><small>{{$t('FLOW_ROUND_RESULT_KICKER')}}</small><h2 id="sense-result-title" ref="resultTitle" tabindex="-1">{{$t('FLOW_ROUND_RESULT_TITLE')}}</h2></div></div>
            <p class="flow-result-reason">{{$t('RHYTHM_RESULT', { correct: resultSummary.correct, total: resultSummary.total })}}</p>
            <div class="flow-result-score">
              <div><strong>{{resultSummary.correct}}</strong><span>{{$t('CORRECT')}}</span></div>
              <div><strong>{{resultSummary.missed}}</strong><span>{{$t('RHYTHM_RESULT_MISSED')}}</span></div>
              <div><strong>{{resultSummary.hitCount}} / {{resultSummary.total}}</strong><span>{{$t('RHYTHM_EVAL_HITS')}}</span></div>
              <div><strong>{{resultSummary.precisionPercent}} %</strong><span>{{$t('RHYTHM_EVAL_PRECISION')}}</span></div>
            </div>
            <section class="flow-result-timing">
              <h3>{{$t('FLOW_RESULT_TIMING')}}</h3>
              <div><span><strong>{{resultSummary.early}}</strong>{{$t('RHYTHM_RESULT_EARLY')}}</span><span><strong>{{resultSummary.correct}}</strong>{{$t('RHYTHM_RESULT_CORRECT')}}</span><span><strong>{{resultSummary.late}}</strong>{{$t('RHYTHM_RESULT_LATE')}}</span></div>
            </section>
            <div class="flow-result-settings"><span>{{bpm}} BPM</span><span>{{meter}}</span><span>{{sessionProgress}}</span></div>
            <section class="flow-rhythm-summary">
              <h3>{{$t('RHYTHM_EVAL_BY_VALUE')}}</h3>
              <p v-for="row in resultSummary.byValue" :key="row.value"><strong>{{$t('RHYTHM_VALUE_' + row.value.toUpperCase())}}:</strong> {{$t('RHYTHM_EVAL_VALUE_SCORE', { correct: row.correct, total: row.total })}}</p>
            </section>
            <div class="flow-result-storage" :class="{ 'is-error': storageError || previousStorageError, 'is-saved': currentRoundSaved }" aria-live="polite">
              <p v-if="storageError" role="alert">{{$t('RHYTHM_SAVE_FAILED')}}</p>
              <p v-if="previousStorageError" role="alert">{{$t('RHYTHM_SAVE_PREVIOUS_FAILED')}}</p>
              <button v-if="storageError || previousStorageError" type="button" class="persistence-retry" :disabled="storageRetrying" @click="retryFailedBars">{{storageRetrying ? $t('LEARNING_STORAGE_RETRYING') : $t('RHYTHM_SAVE_RETRY')}}</button>
              <p v-if="storagePendingCount" role="status">{{$t('RHYTHM_SAVE_PENDING')}}</p>
              <p v-else-if="currentRoundSaved" role="status">{{$t('RHYTHM_EVAL_SAVED')}}</p>
            </div>
          </div>
        </section>
      </div>
    </template>
    <template v-else>
    <div class="sense-backdrop" aria-hidden="true"><HomeMusicBackdrop /></div>
    <div class="sense-shell">
      <button type="button" class="sense-back" @click="exitTraining"><span aria-hidden="true">←</span> {{$t('BACK')}}</button>
      <header v-if="screen === 'menu'" class="sense-heading">
        <span class="sense-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <path d="M20 52h24L39 10H25zM17 52h30M32 43l10-24" />
            <circle cx="39" cy="25" r="3" />
          </svg>
        </span>
        <div class="sense-heading-copy">
          <span class="sense-kicker">{{$t('HOME_TRAINING_KICKER')}}</span>
          <h1>{{$t('HOME_RHYTHM_SENSE')}}</h1>
          <p>{{$t('RHYTHM_INTRO')}}</p>
        </div>
      </header>
      <NoteFlowViewTabs v-if="screen === 'menu'" :aria-label="$t('HOME_RHYTHM_SENSE')" :active-view="menuView" @select-view="menuView = $event" />
      <section v-if="screen === 'menu'" class="sense-menu" :aria-label="$t('SINGLE_NOTES_SELECTION')">
        <div class="sense-start-card">
          <div class="sense-start-summary">
            <span>{{$t('SINGLE_NOTES_SELECTION')}}</span>
            <strong>{{meter}} · {{bpm}} BPM · {{roundLength ? $t('RHYTHM_ROUND_BARS', { count: roundLength }) : $t('RHYTHM_ROUND_UNLIMITED')}}</strong>
          </div>
          <p v-if="!selectionFitsMeter" class="sense-selection-warning" role="status">{{$t('RHYTHM_VALUES_DO_NOT_FIT', { meter })}}</p>
          <button type="button" class="sense-menu-start" :disabled="!selectionFitsMeter" @click="beginTraining"><span>{{$t('RHYTHM_START_TRAINING')}}</span><span class="sense-start-arrow" aria-hidden="true">→</span></button>
        </div>
      </section>
      <RhythmSenseStatistics v-if="screen === 'menu' && menuView === 'statistics'" />
      <section v-if="screen === 'menu'" class="sense-menu" v-show="menuView === 'settings'" :aria-label="$t('HOME_RHYTHM_SENSE')">
        <div v-if="!activeSettingSection" class="sense-section-list">
          <button v-for="section in settingSections" :key="section.id" type="button" class="sense-section-link"
            :data-setting="section.id" @click="activeSettingSection = section.id">
            <SettingsSectionIcon :type="section.icon" />
            <span class="sense-section-copy"><strong>{{section.title}}</strong><small>{{section.summary}}</small></span>
            <span class="sense-section-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <button v-else type="button" class="sense-settings-return" @click="closeSettingSection"><span aria-hidden="true">←</span> {{$t('FLOW_MENU_ALL_SETTINGS')}}</button>
        <section v-show="activeSettingSection === 'round'" class="sense-settings-section">
          <header class="sense-section-heading">
            <SettingsSectionIcon type="round" />
            <h2>{{$t('RHYTHM_ROUND_LENGTH')}}</h2>
          </header>
          <div class="sense-section-body">
            <div class="sense-round-length" role="group" :aria-label="$t('RHYTHM_ROUND_LENGTH')">
              <div class="sense-round-options">
                <button v-for="length in roundLengths" :key="length" type="button"
                  :aria-pressed="roundLength === length" :class="{ selected: roundLength === length }"
                  @click="setRoundLength(length)">{{length ? $t('RHYTHM_ROUND_BARS', { count: length }) : $t('RHYTHM_ROUND_UNLIMITED')}}</button>
              </div>
            </div>
          </div>
        </section>
        <section v-show="activeSettingSection === 'values'" class="sense-settings-section">
          <header class="sense-section-heading">
            <SettingsSectionIcon type="notes" />
            <h2>{{$t('RHYTHM_NOTE_VALUES')}}</h2>
          </header>
          <div class="sense-section-body">
            <p class="sense-settings-help">{{$t('RHYTHM_NOTE_VALUES_HELP')}}</p>
            <div class="sense-value-options" role="group" :aria-label="$t('RHYTHM_NOTE_VALUES')">
              <button v-for="value in noteValueChoices" :key="value" type="button"
                :aria-pressed="noteValues.includes(value)" :class="{ selected: noteValues.includes(value) }"
                :disabled="noteValues.length === 1 && noteValues[0] === value" @click="toggleNoteValue(value)">
                <strong>{{mobileNoteValue(value)}}</strong><span>{{$t('RHYTHM_VALUE_' + value.toUpperCase())}}</span>
              </button>
            </div>
          </div>
        </section>
        <section v-show="activeSettingSection === 'tempo'" class="sense-settings-section">
          <header class="sense-section-heading">
            <SettingsSectionIcon type="tempo" />
            <h2>{{$t('RHYTHM_TEMPO')}}</h2>
          </header>
          <div class="sense-section-body">
            <div class="sense-tempo" role="group" :aria-label="$t('RHYTHM_TEMPO')">
              <div class="sense-tempo-choices">
                <button v-for="tempo in tempos" :key="tempo" type="button"
                  :aria-pressed="bpm === tempo" :class="{ selected: bpm === tempo }"
                  @click="setTempo(tempo)">{{tempo}} BPM</button>
              </div>
            </div>
          </div>
        </section>
        <section v-show="activeSettingSection === 'meter'" class="sense-settings-section">
          <header class="sense-section-heading">
            <SettingsSectionIcon type="rhythm" />
            <h2>{{$t('RHYTHM_METER')}}</h2>
          </header>
          <div class="sense-section-body">
            <div class="sense-meter-choice" role="group" :aria-label="$t('RHYTHM_METER')">
              <div class="sense-meter-options">
                <button v-for="choice in meters" :key="choice" type="button"
                  :aria-pressed="meter === choice" :class="{ selected: meter === choice }"
                  @click="setMeter(choice)">{{choice}}</button>
              </div>
            </div>
          </div>
        </section>
        <section v-if="globalVibrationEnabled" v-show="activeSettingSection === 'vibration'" class="sense-settings-section">
          <header class="sense-section-heading">
            <SettingsSectionIcon type="vibration" />
            <h2>{{$t('RHYTHM_VIBRATION')}}</h2>
          </header>
          <div class="sense-section-body">
            <label class="sense-haptic-option"><span><strong>{{$t('RHYTHM_VIBRATION_PREVIEW')}}</strong><small>{{$t('RHYTHM_VIBRATION_PREVIEW_HELP')}}</small></span>
              <input type="checkbox" :checked="previewVibration" @change="setVibration('previewVibration', $event.target.checked)"></label>
            <label class="sense-haptic-option"><span><strong>{{$t('RHYTHM_VIBRATION_TAP')}}</strong><small>{{$t('RHYTHM_VIBRATION_TAP_HELP')}}</small></span>
              <input type="checkbox" :checked="tapVibration" @change="setVibration('tapVibration', $event.target.checked)"></label>
            <p class="sense-settings-help">{{$t(hapticsAvailable ? 'RHYTHM_VIBRATION_HELP' : 'RHYTHM_VIBRATION_UNAVAILABLE')}}</p>
          </div>
        </section>
      </section>

      <section v-if="screen === 'training'" class="sense-card sense-exercise" :aria-label="$t('RHYTHM_NOTATION')">
        <header class="sense-training-heading">
          <span class="sense-training-mark" aria-hidden="true"></span>
          <div class="sense-training-copy"><span>{{$t('HOME_TRAINING_KICKER')}}</span><strong>{{$t('HOME_RHYTHM_SENSE')}}</strong></div>
          <span class="sense-training-meta">{{meter}} · {{bpm}} BPM</span>
        </header>
        <div class="sense-session-controls">
          <span class="sense-session-progress" aria-live="polite">{{sessionProgress}}</span>
          <button v-if="roundLength === 0 && isRunning" type="button" class="sense-end-round" @click="endTraining">{{$t('END_ROUND')}}</button>
        </div>
        <RhythmSenseDenseScore v-if="usesDenseScore" :events="events" :meter="meter" :results="results"
          :active-event="activeEvent" :tap-markers="tapMarkers" :bpm="bpm" :phase="phase" :playhead-beat="playheadBeat" />
        <div v-else ref="scoreScroll" class="sense-score-scroll">
          <svg class="sense-score sense-score-wide" viewBox="0 0 620 178" role="img" :aria-label="$t('RHYTHM_NOTATION')">
            <line x1="20" x2="600" y1="88" y2="88" class="sense-staff" />
            <line x1="36" x2="36" y1="68" y2="108" class="sense-percussion" />
            <line x1="45" x2="45" y1="68" y2="108" class="sense-percussion" />
            <text x="76" y="78" class="sense-meter">{{meter.split('/')[0]}}</text><text x="76" y="114" class="sense-meter">{{meter.split('/')[1]}}</text>
            <line x1="600" x2="600" y1="66" y2="110" class="sense-barline" />
            <g v-for="event in events" :key="event.id" :transform="`translate(${noteX(event)}, 0)`"
              :class="['sense-event', resultClass(event.id), { 'is-active': activeEvent === event.id }]">
              <ellipse cx="0" cy="88" rx="9" ry="6" transform="rotate(-16 0 88)"
                :class="['sense-head', { hollow: event.value === 'whole' || event.value === 'half' }]" />
              <circle v-if="event.value === 'dottedQuarter' || event.value === 'dottedEighth'" cx="17" cy="88" r="2.5" class="sense-dot" />
              <line v-if="event.value !== 'whole'" x1="8" x2="8" y1="86" y2="47" class="sense-stem" />
              <path v-if="(event.value === 'eighth' || event.value === 'dottedEighth' || event.value === 'sixteenth') && !isBeamed(event)"
                d="M8 47 C30 48 29 66 18 70" class="sense-flag" />
              <path v-if="event.value === 'sixteenth' && !isBeamed(event)" d="M8 56 C28 57 27 73 18 78" class="sense-flag" />
              <g v-if="activeEvent === event.id" class="sense-spark" aria-hidden="true">
                <line x1="-21" y1="75" x2="-14" y2="79" /><line x1="-23" y1="90" x2="-15" y2="90" />
                <line x1="-18" y1="104" x2="-12" y2="98" /><line x1="16" y1="101" x2="22" y2="107" />
              </g>
              <text v-if="event.value !== 'sixteenth' || !isBeamed(event)" x="0" y="139" class="sense-value">{{$t('RHYTHM_VALUE_' + event.value.toUpperCase())}}</text>
            </g>
            <line v-for="group in beamGroups" :key="'wide-' + group.start"
              :x1="noteX(events[group.start]) + 8" :x2="noteX(events[group.end]) + 8"
              y1="47" y2="47" class="sense-beam" />
            <line v-for="group in secondaryBeamGroups" :key="'wide-secondary-' + group.start"
              :x1="noteX(events[group.secondaryStart]) + 8" :x2="noteX(events[group.secondaryEnd]) + 8"
              y1="56" y2="56" class="sense-secondary-beam" />
            <text v-for="group in secondaryBeamGroups" :key="'wide-value-' + group.start"
              :x="(noteX(events[group.secondaryStart]) + noteX(events[group.secondaryEnd])) / 2"
              y="158" class="sense-value sense-pair-value">2 × 1/16</text>
            <circle v-for="marker in tapMarkers" :key="'wide-tap-' + marker.id"
              :cx="tapMarkerX(marker, false)" cy="116" r="5"
              :class="['sense-tap-marker', 'is-' + marker.result]" />
          </svg>
          <svg v-if="meter === '4/4'" class="sense-score sense-score-mobile" viewBox="0 0 360 236" role="img" :aria-label="$t('RHYTHM_NOTATION')">
            <line x1="12" x2="348" y1="58" y2="58" class="sense-staff" />
            <line x1="12" x2="348" y1="168" y2="168" class="sense-staff" />
            <line x1="22" x2="22" y1="38" y2="78" class="sense-percussion" />
            <line x1="28" x2="28" y1="38" y2="78" class="sense-percussion" />
            <line x1="22" x2="22" y1="148" y2="188" class="sense-percussion" />
            <line x1="28" x2="28" y1="148" y2="188" class="sense-percussion" />
            <line x1="348" x2="348" y1="38" y2="78" class="sense-barline" />
            <line x1="348" x2="348" y1="148" y2="188" class="sense-barline" />
            <g v-for="event in events" :key="event.id"
              :transform="`translate(${mobileNoteX(event)}, ${event.beat < 2 ? 0 : 110})`"
              :class="['sense-event', resultClass(event.id), { 'is-active': activeEvent === event.id }]">
              <ellipse cx="0" cy="58" rx="9" ry="6" transform="rotate(-16 0 58)"
                :class="['sense-head', { hollow: event.value === 'whole' || event.value === 'half' }]" />
              <circle v-if="event.value === 'dottedQuarter' || event.value === 'dottedEighth'" cx="17" cy="58" r="2.5" class="sense-dot" />
              <line v-if="event.value !== 'whole'" x1="8" x2="8" y1="56" y2="17" class="sense-stem" />
              <path v-if="event.value === 'eighth' || event.value === 'dottedEighth' || event.value === 'sixteenth'"
                d="M8 17 C30 18 29 36 18 40" class="sense-flag" />
              <path v-if="event.value === 'sixteenth'" d="M8 26 C28 27 27 43 18 48" class="sense-flag" />
              <g v-if="activeEvent === event.id" class="sense-spark" aria-hidden="true">
                <line x1="-21" y1="45" x2="-14" y2="49" /><line x1="-23" y1="60" x2="-15" y2="60" />
                <line x1="-18" y1="74" x2="-12" y2="68" /><line x1="16" y1="71" x2="22" y2="77" />
              </g>
              <text x="0" y="94" class="sense-value">{{mobileNoteValue(event.value)}}</text>
            </g>
            <circle v-for="marker in tapMarkers" :key="'mobile-tap-' + marker.id"
              :cx="tapMarkerX(marker, true)" :cy="tapMarkerY(marker)" r="5"
              :class="['sense-tap-marker', 'is-' + marker.result]" />
          </svg>
          <svg v-else class="sense-score sense-score-mobile" viewBox="0 0 360 126" role="img" :aria-label="$t('RHYTHM_NOTATION')">
            <line x1="12" x2="348" y1="58" y2="58" class="sense-staff" />
            <line x1="22" x2="22" y1="38" y2="78" class="sense-percussion" />
            <line x1="28" x2="28" y1="38" y2="78" class="sense-percussion" />
            <line x1="348" x2="348" y1="38" y2="78" class="sense-barline" />
            <g v-for="event in events" :key="event.id" :transform="`translate(${mobileNoteX(event)}, 0)`"
              :class="['sense-event', resultClass(event.id), { 'is-active': activeEvent === event.id }]">
              <ellipse cx="0" cy="58" rx="9" ry="6" transform="rotate(-16 0 58)"
                :class="['sense-head', { hollow: event.value === 'whole' || event.value === 'half' }]" />
              <circle v-if="event.value === 'dottedQuarter' || event.value === 'dottedEighth'" cx="17" cy="58" r="2.5" class="sense-dot" />
              <line v-if="event.value !== 'whole'" x1="8" x2="8" y1="56" y2="17" class="sense-stem" />
              <path v-if="(event.value === 'eighth' || event.value === 'dottedEighth' || event.value === 'sixteenth') && !isBeamed(event)"
                d="M8 17 C30 18 29 36 18 40" class="sense-flag" />
              <path v-if="event.value === 'sixteenth' && !isBeamed(event)" d="M8 26 C28 27 27 43 18 48" class="sense-flag" />
              <g v-if="activeEvent === event.id" class="sense-spark" aria-hidden="true">
                <line x1="-21" y1="45" x2="-14" y2="49" /><line x1="-23" y1="60" x2="-15" y2="60" />
                <line x1="-18" y1="74" x2="-12" y2="68" /><line x1="16" y1="71" x2="22" y2="77" />
              </g>
              <text v-if="event.value !== 'sixteenth' || !isBeamed(event)" x="0"
                :y="isAfterDottedEighth(event) && meter !== '2/4' ? 109 : 94"
                :class="['sense-value', { 'is-sixteenth': event.value === 'sixteenth' }]">{{mobileNoteValue(event.value)}}</text>
            </g>
            <line v-for="group in beamGroups" :key="'mobile-' + group.start"
              :x1="mobileNoteX(events[group.start]) + 8" :x2="mobileNoteX(events[group.end]) + 8"
              y1="17" y2="17" class="sense-beam" />
            <line v-for="group in secondaryBeamGroups" :key="'mobile-secondary-' + group.start"
              :x1="mobileNoteX(events[group.secondaryStart]) + 8" :x2="mobileNoteX(events[group.secondaryEnd]) + 8"
              y1="26" y2="26" class="sense-secondary-beam" />
            <text v-for="group in secondaryBeamGroups" :key="'mobile-value-' + group.start"
              :x="(mobileNoteX(events[group.secondaryStart]) + mobileNoteX(events[group.secondaryEnd])) / 2"
              :y="meter === '9/8' ? 109 : 94" class="sense-value sense-pair-value">2 × 1/16</text>
            <circle v-for="marker in tapMarkers" :key="'mobile-tap-' + marker.id"
              :cx="tapMarkerX(marker, true)" cy="82" r="5"
              :class="['sense-tap-marker', 'is-' + marker.result]" />
          </svg>
        </div>
        <p v-if="tapMarkers.length" class="sense-tap-offset" aria-live="polite">{{lastTapOffset}}</p>
        <p v-if="storageError" class="sense-storage-error" role="alert">{{$t('RHYTHM_SAVE_FAILED')}}</p>
        <p v-if="previousStorageError" class="sense-storage-error" role="alert">{{$t('RHYTHM_SAVE_PREVIOUS_FAILED')}}</p>
        <button v-if="storageError || previousStorageError" type="button"
          class="sense-storage-retry persistence-retry" :disabled="storageRetrying" @click="retryFailedBars">
          {{storageRetrying ? $t('LEARNING_STORAGE_RETRYING') : $t('RHYTHM_SAVE_RETRY')}}
        </button>
        <div class="sense-beats" :class="{ 'is-nine': meter === '9/8' }" aria-hidden="true"><span v-for="beat in displayedCount" :key="beat" :class="{ current: activeBeat === beat - 1, grouped: (meter === '6/8' || meter === '9/8') && beat > 1 && (beat - 1) % 3 === 0 }">{{beat}}</span></div>
        <p class="sense-status" aria-live="polite">{{statusText}}</p>
        <div class="sense-actions">
          <button type="button" class="sense-start" :disabled="isRunning" @click="start">{{phase === 'result' ? $t('RHYTHM_NEW_ROUND') : $t('RHYTHM_PLAY_PREVIEW')}}</button>
          <button type="button" class="sense-change" :disabled="isRunning" @click="changePattern">{{$t('RHYTHM_NEW_PATTERN')}}</button>
        </div>
      </section>

      <section v-if="screen === 'training'" ref="drumCard" class="sense-card sense-drum-card" :class="{ 'is-practice': phase === 'practice' }">
        <strong>{{$t('RHYTHM_DRUM_TITLE')}}</strong>
        <p>{{$t('RHYTHM_DRUM_HINT')}}</p>
        <button type="button" class="sense-drum" :class="{ struck: drumFlash }"
          :disabled="phase !== 'countin' && phase !== 'practice'" :aria-label="$t('RHYTHM_DRUM_TAP')"
          @pointerdown.prevent="handleDrumPointer" @click="handleDrumClick">
          <span class="sense-drum-face"><span class="sense-drum-center"></span></span>
        </button>
        <p class="sense-feedback" aria-live="polite">{{feedbackText}}</p>

      </section>
    </div>
    </template>
    <FloatingTrainingStart anchor-selector=".sense-menu-start" :view-key="menuView" :enabled="screen === 'menu'"
      :label="$t('RHYTHM_START_TRAINING')" :disabled="!selectionFitsMeter" @start="beginTraining" />
  </main>
</template>

<script>
import FloatingTrainingStart from './FloatingTrainingStart';
import HomeMusicBackdrop from './HomeMusicBackdrop';
import NoteFlowViewTabs from './NoteFlowViewTabs';
import SettingsSectionIcon from './SettingsSectionIcon';
import RhythmSenseStatistics from './RhythmSenseStatistics';
import RhythmSenseDenseScore from './RhythmSenseDenseScore';
import { shouldUseRhythmDenseScore } from '../model/RhythmSenseDenseLayout';
import { normalizeRhythmSensePreferences } from '../model/RhythmSensePreferences';
import { createRhythmSenseHaptics } from '../model/RhythmSenseHaptics';
import Options from '../model/Options';
import { createScreenAwakeMixin } from '../model/ScreenAwakeMixin';
import { getAppAudioDestination } from '../model/AppSound';
import AudioSync from '../model/AudioSynchronization';
import RhythmSenseRoundStorage from '../model/RhythmSenseRoundStorage';
import { appVolumeToAudioLevel } from '../model/AppVolume';
import {
  RHYTHM_SENSE_BPM,
  RHYTHM_SENSE_TEMPOS,
  RHYTHM_SENSE_METERS,
  RHYTHM_SENSE_ROUND_LENGTHS,
  RHYTHM_SENSE_NOTE_VALUES,
  rhythmSenseSelectionFitsMeter,
  rhythmSenseBeatsPerBar,
  createRhythmSenseBar,
  createRhythmSensePatternPicker,
  createRhythmSenseBarRecord,
  rhythmSenseBeatMs,
  rhythmSenseBarDurationMs,
  rhythmSenseUnitMs,
  rhythmSenseOnsetMs,
  rhythmSenseWindows,
  rhythmSenseTap,
  evaluateRhythmSenseRound,
  mergeRhythmSenseEvaluations
} from '../model/RhythmSense';

export default {
  name: 'RhythmSense',
  mixins: [createScreenAwakeMixin(function () { return this.isRunning; })],
  components: { FloatingTrainingStart, HomeMusicBackdrop, RhythmSenseStatistics, RhythmSenseDenseScore, NoteFlowViewTabs, SettingsSectionIcon },
  data(){
    const preferences = normalizeRhythmSensePreferences(Options.rhythmSenseSettings);
    return {
      globalOptions: Options,
      screen: 'menu', menuView: 'settings', activeSettingSection: null, bpm: RHYTHM_SENSE_BPM, tempos: RHYTHM_SENSE_TEMPOS,
      meter: '4/4', meters: RHYTHM_SENSE_METERS, patternIndex: 0, events: createRhythmSenseBar(0, '4/4', preferences.noteValues), patternPicker: null,
      noteValueChoices: RHYTHM_SENSE_NOTE_VALUES, noteValues: preferences.noteValues,
      previewVibration: preferences.previewVibration, tapVibration: preferences.tapVibration, hapticsAvailable: false, playheadBeat: 0,
      roundLength: 3, roundLengths: RHYTHM_SENSE_ROUND_LENGTHS,
      completedBarCount: 0, sessionEvaluation: evaluateRhythmSenseRound([], []),
      sessionId: '', storageError: false, storagePendingCount: 0,
      barSaveSessions: {}, storageRetrying: false,
      phase: 'idle', phaseStart: 0, activeBeat: -1, activeEvent: -1,
      results: [], acceptedOffsets: [], tapMarkers: [], feedback: '', drumFlash: false,
      clockTimer: null, flashTimer: null, audioContext: null, snareNoise: null,
      roundDelayMs: 0, audioNotice: '', audioStarting: false,
      lastBeat: -1, lastNote: -1,
      lastPointerTapAt: -Infinity
    };
  },
  computed: {
    settingSections(){
      const sections = [
        { id: 'round', icon: 'round', title: this.$t('RHYTHM_ROUND_LENGTH'), summary: this.roundLength ? this.$t('RHYTHM_ROUND_BARS', { count: this.roundLength }) : this.$t('RHYTHM_ROUND_UNLIMITED') },
        { id: 'values', icon: 'notes', title: this.$t('RHYTHM_NOTE_VALUES'), summary: this.noteValues.map(value => this.$t('RHYTHM_VALUE_' + value.toUpperCase())).join(' · ') },
        { id: 'tempo', icon: 'tempo', title: this.$t('RHYTHM_TEMPO'), summary: this.bpm + ' BPM' },
        { id: 'meter', icon: 'rhythm', title: this.$t('RHYTHM_METER'), summary: this.meter }
      ];
      if(this.globalVibrationEnabled) sections.push({ id: 'vibration', icon: 'vibration', title: this.$t('RHYTHM_VIBRATION'), summary: [this.previewVibration ? this.$t('RHYTHM_VIBRATION_PREVIEW') : '', this.tapVibration ? this.$t('RHYTHM_VIBRATION_TAP') : ''].filter(Boolean).join(' · ') || this.$t('off') });
      return sections;
    },
    previousStorageError(){
      return Object.keys(this.barSaveSessions).some(sessionId => (
        sessionId !== this.sessionId && this.barSaveSessions[sessionId].failedBars.length > 0
      ));
    },
    currentRoundSaved(){
      const session = this.barSaveSessions[this.sessionId];
      return Boolean(session && this.completedBarCount > 0 && !session.pending
        && !session.failedBars.length && session.saved >= this.completedBarCount);
    },
    globalVibrationEnabled(){ return this.globalOptions.vibration !== false; },
    selectionFitsMeter(){ return rhythmSenseSelectionFitsMeter(this.noteValues, this.meter); },
    usesDenseScore(){ return shouldUseRhythmDenseScore(this.events, this.meter); },
    isRunning(){ return this.audioStarting || this.phase === 'preview' || this.phase === 'countin' || this.phase === 'practice'; },
    beatCount(){ return rhythmSenseBeatsPerBar(this.meter); },
    displayedCount(){ return this.meter === '6/8' ? 6 : this.meter === '9/8' ? 9 : this.beatCount; },
    beamGroups(){
      if(this.meter !== '6/8' && this.meter !== '9/8') return [];
      const groupStarts = this.meter === '9/8' ? [0, 1.5, 3] : [0, 1.5];
      return groupStarts.map(startBeat => {
        const indices = this.events.map((event, index) => ({ event, index }))
          .filter(({ event }) => event.beat >= startBeat && event.beat < startBeat + 1.5);
        if(indices.length === 3 && indices.every(({ event }) => event.value === 'eighth')) {
          return { start: indices[0].index, end: indices[2].index };
        }
        if(indices.length === 4
          && indices.map(({ event }) => event.value).join(',') === 'eighth,sixteenth,sixteenth,eighth') {
          return { start: indices[0].index, end: indices[3].index,
            secondaryStart: indices[1].index, secondaryEnd: indices[2].index };
        }
        return null;
      }).filter(Boolean);
    },
    secondaryBeamGroups(){ return this.beamGroups.filter(group => group.secondaryStart != null); },
    resultSummary(){ return this.phase === 'result' ? this.sessionEvaluation : evaluateRhythmSenseRound(this.events, this.results); },
    lastTapOffset(){
      const marker = this.tapMarkers[this.tapMarkers.length - 1];
      if(!marker) return '';
      const sign = marker.offsetMs > 0 ? '+' : marker.offsetMs < 0 ? '−' : '';
      return `${sign}${Math.abs(marker.offsetMs)} ms`;
    },
    sessionProgress(){
      if(this.phase === 'result') return this.$t('RHYTHM_ROUND_COMPLETED', { count: this.completedBarCount });
      const current = this.completedBarCount + 1;
      return this.roundLength
        ? this.$t('RHYTHM_ROUND_PROGRESS', { current, total: this.roundLength })
        : this.$t('RHYTHM_ROUND_PROGRESS_UNLIMITED', { current });
    },
    statusText(){
      const countIn = this.meter === '9/8' ? 'RHYTHM_COUNT_IN_9_8'
        : this.meter === '6/8' ? 'RHYTHM_COUNT_IN_6_8'
        : this.meter === '3/4' ? 'RHYTHM_COUNT_IN_3'
          : this.meter === '2/4' ? 'RHYTHM_COUNT_IN_2' : 'RHYTHM_COUNT_IN';
      const key = { idle: 'RHYTHM_READY', preview: 'RHYTHM_PREVIEW_PHASE', countin: countIn, practice: 'RHYTHM_PRACTICE_PHASE', result: 'RHYTHM_FINISHED' }[this.phase];
      return this.$t(this.audioNotice || key || 'RHYTHM_READY');
    },
    feedbackText(){
      if(this.phase === 'countin'){
        return this.feedback === 'early' ? this.$t('RHYTHM_FEEDBACK_EARLY') : this.$t('RHYTHM_WARMUP');
      }
      if(this.phase === 'practice'){
        if(!this.feedback) return this.$t('RHYTHM_TAP_NOW');
        const shortKey = {
          'too-early': 'RHYTHM_FEEDBACK_EARLY',
          'too-late': 'RHYTHM_FEEDBACK_LATE',
          extra: 'RHYTHM_FEEDBACK_DONE'
        }[this.feedback];
        if(shortKey) return this.$t(shortKey);
      }
      return this.feedback
        ? this.$t('RHYTHM_FEEDBACK_' + this.feedback.toUpperCase().replace('-', '_'))
        : this.$t('RHYTHM_FEEDBACK_IDLE');
    }
  },
  watch: {
    globalVibrationEnabled(enabled){
      if(!enabled && this._haptics) this._haptics.cancel();
      if(!enabled && this.activeSettingSection === 'vibration') this.activeSettingSection = null;
    }
  },
  created(){
    this._haptics = createRhythmSenseHaptics(undefined, () => Options.vibration !== false);
    this._deviceReadyHandler = () => { this.hapticsAvailable = this._haptics.available(); };
    this._deviceReadyHandler();
    document.addEventListener('deviceready', this._deviceReadyHandler);
    this._audioRevision = null;
    this._unsubscribeAudio = AudioSync.subscribe(state => {
      const changed = this._audioRevision !== null && state.revision !== this._audioRevision;
      this._audioRevision = state.revision;
      if(changed && this.isRunning) this.pauseForAudio('RHYTHM_AUDIO_CHANGED');
    });
    this._visibilityHandler = () => {
      if(document.hidden && this.isRunning) this.pauseForAudio('RHYTHM_AUDIO_HIDDEN');
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  },
  beforeDestroy(){
    this.stopClock();
    if(this.flashTimer) clearTimeout(this.flashTimer);
    if(this._unsubscribeAudio) this._unsubscribeAudio();
    if(this._visibilityHandler) document.removeEventListener('visibilitychange', this._visibilityHandler);
    if(this._deviceReadyHandler) document.removeEventListener('deviceready', this._deviceReadyHandler);
    if(this.audioContext && this._contextStateHandler) {
      this.audioContext.removeEventListener('statechange', this._contextStateHandler);
    }
  },
  methods: {
    savePreferences(){
      Options.rhythmSenseSettings = normalizeRhythmSensePreferences({ noteValues: this.noteValues,
        previewVibration: this.previewVibration, tapVibration: this.tapVibration });
      Options.saveOptions();
    },
    toggleNoteValue(value){
      if(this.isRunning || !this.noteValueChoices.includes(value)) return;
      if(this.noteValues.includes(value) && this.noteValues.length === 1) return;
      this.noteValues = this.noteValueChoices.filter(choice => choice === value ? !this.noteValues.includes(choice) : this.noteValues.includes(choice));
      this.savePreferences();
      this.setMeter(this.meter);
    },
    setVibration(setting, enabled){
      if(this.isRunning || !['previewVibration', 'tapVibration'].includes(setting)) return;
      this[setting] = Boolean(enabled);
      if(!enabled && this._haptics) this._haptics.cancel();
      this.savePreferences();
    },
    vibrate(durationMs){
      if(!this.globalVibrationEnabled) return;
      if(this._haptics && !this._haptics.pulse(durationMs)) this.hapticsAvailable = false;
    },
    noteX(event){
      if(this.meter === '9/8') return 110 + event.beat * 95 + Math.floor(event.beat / 1.5) * 25;
      return this.meter === '6/8' ? 100 + event.beat * 170 + (event.beat >= 1.5 ? 35 : 0)
        : 118 + event.beat * (this.meter === '2/4' ? 220 : this.meter === '3/4' ? 154 : 116);
    },
    mobileNoteX(event){
      if(this.meter === '9/8') return 45 + event.beat * 60 + Math.floor(event.beat / 1.5) * 10
        + (this.isAfterDottedEighth(event) ? -10 : this.isAfterDottedSixteenth(event) ? 10 : 0);
      if(this.meter === '6/8') return 60 + event.beat * 90 + (event.beat >= 1.5 ? 30 : 0);
      return this.meter === '3/4'
        ? 76 + event.beat * 88 - (this.isAfterDottedEighth(event) ? 10 : 0)
        : 76 + (event.beat % 2) * 132;
    },
    tapMarkerX(marker, mobile){
      const target = this.events[marker.targetIndex];
      if(!target) return 0;
      const unitOffset = marker.offsetMs / rhythmSenseUnitMs(this.bpm, this.meter);
      const step = mobile
        ? this.meter === '9/8' ? 60 : this.meter === '6/8' ? 90 : this.meter === '3/4' ? 88 : 132
        : this.meter === '9/8' ? 95 : this.meter === '6/8' ? 170 : this.meter === '2/4' ? 220 : this.meter === '3/4' ? 154 : 116;
      const x = (mobile ? this.mobileNoteX(target) : this.noteX(target)) + unitOffset * step;
      return Math.max(mobile ? 35 : 30, Math.min(mobile ? 337 : 590, x));
    },
    tapMarkerY(marker){ return this.meter === '4/4' && this.events[marker.targetIndex].beat >= 2 ? 192 : 82; },
    recordTapMarker(elapsedMs, result, targetIndex = -1){
      if(!this.events.length) return;
      if(targetIndex < 0){
        targetIndex = this.events.reduce((nearest, event, index) =>
          Math.abs(elapsedMs - rhythmSenseOnsetMs(event, this.bpm, this.meter))
            < Math.abs(elapsedMs - rhythmSenseOnsetMs(this.events[nearest], this.bpm, this.meter)) ? index : nearest, 0);
      }
      const offsetMs = Math.round(elapsedMs - rhythmSenseOnsetMs(this.events[targetIndex], this.bpm, this.meter));
      this.tapMarkers.push({ id: Date.now() + Math.random(), targetIndex, offsetMs, result });
      if(this.tapMarkers.length > 32) this.tapMarkers.shift();
    },
    mobileNoteValue(value){ return { whole: '1', half: '1/2', dottedQuarter: '3/8', quarter: '1/4', dottedEighth: '3/16', eighth: '1/8', sixteenth: '1/16', thirtySecond: '1/32', sixtyFourth: '1/64' }[value]; },
    isBeamed(event){ return this.beamGroups.some(group => event.id >= group.start && event.id <= group.end); },
    isAfterDottedEighth(event){
      return event.value === 'sixteenth' && event.id > 0
        && this.events[event.id - 1].value === 'dottedEighth';
    },
    isAfterDottedSixteenth(event){
      return event.id > 1 && this.events[event.id - 1].value === 'sixteenth'
        && this.events[event.id - 2].value === 'dottedEighth';
    },
    revealEvent(index){
      const scroller = this.$refs.scoreScroll;
      if(!scroller || !this.events[index]) return;
      if(scroller.scrollWidth <= scroller.clientWidth) return;
      const scaledX = this.noteX(this.events[index]) * scroller.scrollWidth / 620;
      const left = scaledX - scroller.clientWidth * 0.5;
      if(left < scroller.scrollLeft + 20 || left > scroller.scrollLeft + scroller.clientWidth - 20){
        scroller.scrollLeft = Math.max(0, left);
      }
    },
    resultClass(index){ return this.results[index] ? 'result-' + this.results[index] : ''; },
    showResultSettings(){
      this.exitTraining();
      this.menuView = 'settings';
    },
    showResultStatistics(){
      this.exitTraining();
      this.menuView = 'statistics';
    },
    closeSettingSection(){
      const section = this.activeSettingSection;
      this.activeSettingSection = null;
      this.$nextTick(() => {
        const button = this.$el.querySelector('[data-setting="' + section + '"]');
        if(button) button.focus({ preventScroll: true });
      });
    },
    exitTraining(){
      if(this.screen === 'menu' && this.menuView === 'settings' && this.activeSettingSection){
        this.closeSettingSection();
        return;
      }
      this.stopClock();
      if(this.screen === 'training'){
        if(this.flashTimer) clearTimeout(this.flashTimer);
        this.screen = 'menu'; this.phase = 'idle'; this.results = []; this.acceptedOffsets = []; this.tapMarkers = [];
        this.audioNotice = '';
        this.completedBarCount = 0;
        this.sessionEvaluation = evaluateRhythmSenseRound([], []);
        this.feedback = ''; this.activeBeat = -1; this.activeEvent = -1;
        this.drumFlash = false;
        return;
      }
      this.$emit('back');
    },
    beginTraining(){
      if(!this.selectionFitsMeter) return;
      this.patternPicker = createRhythmSensePatternPicker(this.meter, null, Math.random, this.noteValues);
      this.patternIndex = this.patternPicker();
      this.events = createRhythmSenseBar(this.patternIndex, this.meter, this.noteValues);
      this.screen = 'training';
      this.$nextTick(() => this.start());
    },
    setRoundLength(length){
      if(this.isRunning || !RHYTHM_SENSE_ROUND_LENGTHS.includes(length)) return;
      this.roundLength = length;
    },
    setTempo(tempo){
      if(this.isRunning || !RHYTHM_SENSE_TEMPOS.includes(tempo)) return;
      this.bpm = tempo;
      this.results = [];
      this.acceptedOffsets = [];
      this.tapMarkers = [];
      this.completedBarCount = 0;
      this.sessionEvaluation = evaluateRhythmSenseRound([], []);
      this.feedback = '';
      this.phase = 'idle';
      this.audioNotice = '';
      this.activeBeat = -1;
      this.activeEvent = -1;
    },
    setMeter(meter){
      if(this.isRunning || !RHYTHM_SENSE_METERS.includes(meter)) return;
      this.meter = meter;
      this.patternIndex = 0;
      this.patternPicker = null;
      this.events = this.selectionFitsMeter ? createRhythmSenseBar(0, meter, this.noteValues) : [];
      this.results = [];
      this.acceptedOffsets = [];
      this.tapMarkers = [];
      this.completedBarCount = 0;
      this.sessionEvaluation = evaluateRhythmSenseRound([], []);
      this.feedback = '';
      this.phase = 'idle';
      this.audioNotice = '';
      this.activeBeat = -1;
      this.activeEvent = -1;
    },
    changePattern(){
      if(!this.selectionFitsMeter || this.isRunning) return;
      if(!this.patternPicker) this.patternPicker = createRhythmSensePatternPicker(this.meter, this.patternIndex, Math.random, this.noteValues);
      this.patternIndex = this.patternPicker();
      this.events = createRhythmSenseBar(this.patternIndex, this.meter, this.noteValues);
      this.results = [];
      this.acceptedOffsets = [];
      this.tapMarkers = [];
      this.completedBarCount = 0;
      this.sessionEvaluation = evaluateRhythmSenseRound([], []);
      this.phase = 'idle';
      this.audioNotice = '';
      this.feedback = '';
      this.activeEvent = -1;
      this.activeBeat = -1;
    },
    ensureAudio(){
      const context = AudioSync.getContext();
      if(context !== this.audioContext){
        if(this.audioContext && this._contextStateHandler) {
          this.audioContext.removeEventListener('statechange', this._contextStateHandler);
        }
        this.audioContext = context;
        this.snareNoise = null;
        this._contextStateHandler = () => {
          if(this.audioContext.state !== 'running' && this.isRunning) {
            this.pauseForAudio('RHYTHM_AUDIO_UNAVAILABLE');
          }
        };
        if(context) context.addEventListener('statechange', this._contextStateHandler);
      }
      return AudioSync.resume();
    },
    trackAudioSource(source, nodes){
      if(!this._audioSources) this._audioSources = new Set();
      const entry = { source, nodes };
      this._audioSources.add(entry);
      source.onended = () => {
        this._audioSources.delete(entry);
        nodes.forEach(node => { if(node.disconnect) node.disconnect(); });
      };
    },
    cancelAudio(){
      this._pendingSounds = [];
      this._scheduledSound = 0;
      if(!this._audioSources) return;
      this._audioSources.forEach(({ source, nodes }) => {
        source.onended = null;
        try { source.stop(); } catch(error) { /* Already ended. */ }
        nodes.forEach(node => { if(node.disconnect) node.disconnect(); });
      });
      this._audioSources.clear();
    },
    pauseForAudio(reason){
      this.stopClock();
      if(this.flashTimer) clearTimeout(this.flashTimer);
      this.phase = 'paused';
      this.audioNotice = reason;
      this.results = this.events.map(() => null);
      this.acceptedOffsets = this.events.map(() => null);
      this.tapMarkers = [];
      this.activeBeat = -1; this.activeEvent = -1;
      this.feedback = ''; this.drumFlash = false;
    },
    scheduleBarAudio(){
      // All visible targets refer to the time the scheduled audio reaches the
      // listener. Touch timestamps stay in this same performance-clock frame.
      const leadMs = 100;
      this.phaseStart = performance.now() + leadMs + this.roundDelayMs;
      const context = this.audioContext;
      if(!context) return;
      const origin = context.currentTime + leadMs / 1000;
      const barMs = rhythmSenseBarDurationMs(this.bpm, this.meter);
      const beatMs = rhythmSenseBeatMs(this.bpm);
      const sounds = [];
      for(let phase = 0; phase < 3; phase++){
        for(let beat = 0; beat < this.beatCount; beat++) {
          sounds.push({ at: origin + (phase * barMs + beat * beatMs) / 1000,
            kind: 'metronome', accent: beat === 0 });
        }
      }
      this.events.forEach(event => sounds.push({ kind: 'drum',
        at: origin + rhythmSenseOnsetMs(event, this.bpm, this.meter) / 1000 }));
      this._pendingSounds = sounds.sort((a, b) => a.at - b.at);
      this._scheduledSound = 0;
      this.scheduleAudio();
    },
    scheduleAudio(){
      if(!this.audioContext || !this._pendingSounds) return;
      const now = this.audioContext.currentTime;
      // Bound created sources to 150 ms of audio, regardless of output latency.
      while(this._scheduledSound < this._pendingSounds.length){
        const sound = this._pendingSounds[this._scheduledSound];
        if(sound.at > now + 0.15) break;
        if(sound.at < now - 0.05){
          this.pauseForAudio('RHYTHM_AUDIO_UNAVAILABLE');
          return;
        }
        this._scheduledSound++;
        if(sound.kind === 'metronome') this.playMetronome(sound.accent, Math.max(now, sound.at));
        else this.playDrum(false, Math.max(now, sound.at));
      }
    },
    tone(frequency, duration, level, endFrequency, at){
      const context = this.audioContext;
      if(!context) return;
      const volume = level * appVolumeToAudioLevel(Options.appVolume);
      if(volume <= 0) return;
      const start = Number.isFinite(at) ? at : context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain); gain.connect(getAppAudioDestination(context));
      this.trackAudioSource(oscillator, [oscillator, gain]);
      oscillator.start(start); oscillator.stop(start + duration);
    },
    playMetronome(accent, at){ this.tone(accent ? 1100 : 720, 0.055, 0.16, accent ? 600 : 400, at); },
    playDrum(dull, at){
      const context = this.audioContext;
      if(!context || appVolumeToAudioLevel(Options.appVolume) <= 0) return;
      // The short noise burst gives a snare its rattle; the low body stays audible
      // on small phone speakers. A muffled strike uses the same sound components.
      this.tone(dull ? 115 : 185, 0.13, dull ? 0.28 : 0.36, dull ? 58 : 82, at);
      if(!this.snareNoise){
        const length = Math.ceil(context.sampleRate * 0.2);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for(let index = 0; index < length; index++) samples[index] = Math.random() * 2 - 1;
        this.snareNoise = buffer;
      }
      const start = Number.isFinite(at) ? at : context.currentTime;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = this.snareNoise;
      filter.type = dull ? 'lowpass' : 'highpass';
      filter.frequency.setValueAtTime(dull ? 520 : 1700, start);
      gain.gain.setValueAtTime((dull ? 0.12 : 0.32) * appVolumeToAudioLevel(Options.appVolume), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (dull ? 0.12 : 0.17));
      source.connect(filter); filter.connect(gain); gain.connect(getAppAudioDestination(context));
      this.trackAudioSource(source, [source, filter, gain]);
      source.start(start); source.stop(start + 0.2);
    },
    handleDrumPointer(event){
      this.lastPointerTapAt = performance.now();
      this.tapDrum(event);
    },
    handleDrumClick(event){
      // Keyboard activation fires click without a preceding pointer press.
      if(event.detail === 0 && performance.now() - this.lastPointerTapAt > 350){
        this.tapDrum(event);
      }
    },
    stopClock(){
      if(this._haptics) this._haptics.cancel();
      this._startRequest = (this._startRequest || 0) + 1;
      this.audioStarting = false;
      if(this.clockTimer){ clearInterval(this.clockTimer); this.clockTimer = null; }
      this.cancelAudio();
    },
    start(){
      if(this.audioStarting || !this.selectionFitsMeter) return;
      this.stopClock();
      const request = this._startRequest;
      this.audioStarting = true;
      this.audioNotice = '';
      return this.ensureAudio().then(ready => {
        if(request !== this._startRequest) return;
        if(!ready){ this.pauseForAudio('RHYTHM_AUDIO_UNAVAILABLE'); return; }
        this.audioStarting = false;
        this.roundDelayMs = AudioSync.getDelayMs();
        this.startReady();
      }).catch(() => {
        if(request === this._startRequest) this.pauseForAudio('RHYTHM_AUDIO_UNAVAILABLE');
      });
    },
    startReady(){
      this.sessionId = `rhythm:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      this.storageError = false;
      this.storagePendingCount = 0;
      // Keep pending and failed sessions until their own replies or retry settle.
      // Successful old sessions no longer need an in-memory status record.
      Object.keys(this.barSaveSessions).forEach(sessionId => {
        const session = this.barSaveSessions[sessionId];
        if(!session.pending && !session.failedBars.length){
          if(this.$delete) this.$delete(this.barSaveSessions, sessionId);
          else delete this.barSaveSessions[sessionId];
        }
      });
      if(this.phase === 'result'){
        this.patternPicker = createRhythmSensePatternPicker(this.meter, null, Math.random, this.noteValues);
        this.patternIndex = this.patternPicker();
        this.events = createRhythmSenseBar(this.patternIndex, this.meter, this.noteValues);
      }
      this.completedBarCount = 0;
      this.sessionEvaluation = evaluateRhythmSenseRound([], []);
      this.results = this.events.map(() => null);
      this.acceptedOffsets = this.events.map(() => null);
      this.tapMarkers = [];
      this.feedback = '';
      this.phase = 'preview';
      this.playheadBeat = 0;
      this.scheduleBarAudio();
      this.activeBeat = -1; this.activeEvent = -1;
      this.lastBeat = -1; this.lastNote = -1;
      if(this.$refs.scoreScroll) this.$refs.scoreScroll.scrollLeft = 0;
      this.clockTimer = setInterval(this.tick, 16);
      this.tick();
    },
    nextPhase(){
      if(this.phase === 'practice'){
        this.completeBar();
        if(this.roundLength && this.completedBarCount >= this.roundLength) this.showFinalResult();
        else this.beginNextBar();
        return;
      }
      this.phase = this.phase === 'preview' ? 'countin' : 'practice';
      this.playheadBeat = 0;
      if(this._haptics) this._haptics.cancel();
      if(this.phase === 'practice' && this.feedback === 'warmup') this.feedback = '';
      this.phaseStart += rhythmSenseBarDurationMs(this.bpm, this.meter);
      this.lastBeat = -1; this.lastNote = -1;
      this.activeBeat = -1; this.activeEvent = -1;
    },
    completeBar(){
      this.events.forEach((_, index) => { if(!this.results[index]) this.$set(this.results, index, 'missed'); });
      const sessionId = this.sessionId || `rhythm:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      this.sessionId = sessionId;
      const record = createRhythmSenseBarRecord({
        sessionId, barNumber: this.completedBarCount + 1,
        meter: this.meter, bpm: this.bpm, roundLength: this.roundLength, noteValues: this.noteValues,
        events: this.events, results: this.results, tapMarkers: this.tapMarkers,
        acceptedOffsets: this.acceptedOffsets
      });
      this.saveBarForSession(record);
      this.sessionEvaluation = mergeRhythmSenseEvaluations(
        this.sessionEvaluation, evaluateRhythmSenseRound(this.events, this.results)
      );
      this.completedBarCount += 1;
    },
    saveBarForSession(record){
      const sessionId = record.sessionId;
      if(!this.barSaveSessions[sessionId]){
        this.$set(this.barSaveSessions, sessionId, { pending: 0, saved: 0, failedBars: [] });
      }
      const session = this.barSaveSessions[sessionId];
      session.pending += 1;
      if(sessionId === this.sessionId) this.storagePendingCount = session.pending;
      let write;
      try { write = RhythmSenseRoundStorage.saveBar(record); }
      catch(error) { write = Promise.resolve({ saved: false, error }); }
      return Promise.resolve(write).catch(error => ({ saved: false, error })).then(result => {
        session.pending -= 1;
        const failedIndex = session.failedBars.findIndex(bar => bar.id === record.id);
        if(result && result.saved){
          session.saved += 1;
          if(failedIndex !== -1) session.failedBars.splice(failedIndex, 1);
        }else if(failedIndex === -1) session.failedBars.push(record);
        // A late reply must only update the session it was written for.
        if(sessionId === this.sessionId){
          this.storagePendingCount = session.pending;
          this.storageError = session.failedBars.length > 0;
        }
        return Boolean(result && result.saved);
      });
    },
    retryFailedBars(){
      if(this.storageRetrying) return Promise.resolve(false);
      this.storageRetrying = true;
      const failed = Object.keys(this.barSaveSessions).reduce((bars, sessionId) => (
        bars.concat(this.barSaveSessions[sessionId].failedBars.slice())
      ), []);
      return Promise.all(failed.map(record => this.saveBarForSession(record))).then(results => {
        this.storageRetrying = false;
        return results.every(Boolean);
      });
    },
    beginNextBar(){
      if(!this.patternPicker) this.patternPicker = createRhythmSensePatternPicker(this.meter, this.patternIndex, Math.random, this.noteValues);
      this.patternIndex = this.patternPicker();
      this.events = createRhythmSenseBar(this.patternIndex, this.meter, this.noteValues);
      this.results = this.events.map(() => null);
      this.acceptedOffsets = this.events.map(() => null);
      this.tapMarkers = [];
      this.feedback = '';
      this.phase = 'preview';
      this.playheadBeat = 0;
      this.scheduleBarAudio();
      this.lastBeat = -1; this.lastNote = -1;
      this.activeBeat = -1; this.activeEvent = -1;
      if(this.$refs.scoreScroll) this.$refs.scoreScroll.scrollLeft = 0;
    },
    showFinalResult(){
      this.phase = 'result'; this.activeBeat = -1; this.activeEvent = -1;
      this.stopClock();
      this.$nextTick(() => {
        if(this.$refs.resultTitle) this.$refs.resultTitle.focus();
      });
    },
    endTraining(){
      if(this.roundLength !== 0 || !this.isRunning) return;
      if(this.phase === 'practice') this.completeBar();
      if(this.completedBarCount) this.showFinalResult();
      else this.exitTraining();
    },
    tick(){
      if(!this.isRunning || this.audioStarting) return;
      this.scheduleAudio();
      if(!this.isRunning) return;
      const beatMs = rhythmSenseBeatMs(this.bpm);
      let elapsed = performance.now() - this.phaseStart;
      if(elapsed < 0) return;
      const barDurationMs = rhythmSenseBarDurationMs(this.bpm, this.meter);
      if(elapsed >= barDurationMs){
        // Let already timestamped touch events arrive before saving this bar.
        // Their original timestamps still determine correctness; no hit window
        // is widened. This matters for the final 64th just before the barline.
        if(this.phase === 'practice' && elapsed < barDurationMs + 50) return;
        this.nextPhase(); if(this.isRunning) this.tick(); return;
      }
      this.playheadBeat = elapsed / rhythmSenseUnitMs(this.bpm, this.meter);
      const beat = Math.floor(elapsed / beatMs);
      if(beat > this.lastBeat){
        this.lastBeat = beat;
      }
      this.activeBeat = this.meter === '6/8' || this.meter === '9/8' ? Math.floor(elapsed / (beatMs / 3)) : beat;
      if(this.phase === 'preview'){
        const previousNote = this.lastNote;
        this.events.forEach((event, index) => {
          if(index > this.lastNote && elapsed >= rhythmSenseOnsetMs(event, this.bpm, this.meter)){
            this.lastNote = index;
            this.activeEvent = index;
            this.revealEvent(index);
          }
        });
        if(this.previewVibration && this.lastNote > previousNote){
          const current = this.events[this.lastNote];
          const gapMs = current.duration * rhythmSenseUnitMs(this.bpm, this.meter);
          // Follow the audible timeline and skip stale pulses after a delayed
          // frame, rather than vibrating a backlog of notes at once.
          const latenessMs = elapsed - rhythmSenseOnsetMs(current, this.bpm, this.meter);
          const pulseMs = Math.min(18, gapMs * 0.3, (gapMs - latenessMs) / 2);
          if(latenessMs <= 35 && pulseMs >= 2) this.vibrate(pulseMs);
        }
      }
      if(this.phase === 'practice'){
        this.events.forEach((event, index) => {
          if(!this.results[index] && elapsed > rhythmSenseOnsetMs(event, this.bpm, this.meter) + rhythmSenseWindows(this.events, index, this.bpm, this.meter).outerMs){
            this.$set(this.results, index, 'missed');
          }
        });
      }
      if(this.phase !== 'preview' || (this.lastNote >= 0 && elapsed > rhythmSenseOnsetMs(this.events[this.lastNote], this.bpm, this.meter) + 220)) this.activeEvent = -1;
    },
    tapDrum(event){
      if(this.phase !== 'countin' && this.phase !== 'practice') return;
      const now = performance.now();
      const eventTime = event && Number.isFinite(event.timeStamp)
        && Math.abs(event.timeStamp - now) < 5000 ? event.timeStamp : now;
      if(this.phase === 'countin'){
        const practiceStart = this.phaseStart + rhythmSenseBarDurationMs(this.bpm, this.meter);
        if(eventTime >= practiceStart){
          this.nextPhase();
        } else {
          const firstWindow = rhythmSenseWindows(this.events, 0, this.bpm, this.meter).outerMs;
          const early = eventTime >= practiceStart - firstWindow && !this.results[0];
          if(early){
            this.$set(this.results, 0, 'early');
            this.$set(this.acceptedOffsets, 0, Math.round(eventTime - practiceStart));
            this.recordTapMarker(eventTime - practiceStart, 'early', 0);
            this.activeEvent = 0;
            this.feedback = 'early';
          } else if(!this.results[0]) {
            this.feedback = 'warmup';
          }
          if(this.tapVibration) this.vibrate(18);
          this.playDrum(early);
          this.drumFlash = true;
          if(this.flashTimer) clearTimeout(this.flashTimer);
          this.flashTimer = setTimeout(() => { this.drumFlash = false; this.activeEvent = -1; }, 180);
          return;
        }
      }
      if(this.tapVibration) this.vibrate(18);
      const elapsed = eventTime - this.phaseStart;
      // A queued pointer event may predate a miss assigned by the visual timer.
      const resultsAtTouch = this.results.slice();
      resultsAtTouch.forEach((result, index) => {
        const onset = rhythmSenseOnsetMs(this.events[index], this.bpm, this.meter);
        const windowMs = rhythmSenseWindows(this.events, index, this.bpm, this.meter).outerMs;
        if(!result && elapsed > onset + windowMs){
          resultsAtTouch[index] = 'missed';
          this.$set(this.results, index, 'missed');
        } else if(result === 'missed' && Math.abs(elapsed - onset) <= windowMs){
          resultsAtTouch[index] = null;
        }
      });
      const judgement = rhythmSenseTap(this.events, resultsAtTouch, elapsed, this.bpm, this.meter);
      this.recordTapMarker(elapsed, judgement.result, judgement.index);
      this.feedback = judgement.result;
      if(judgement.index >= 0){
        this.$set(this.results, judgement.index, judgement.result);
        this.$set(this.acceptedOffsets, judgement.index, Math.round(judgement.differenceMs));
        this.activeEvent = judgement.index;
        this.revealEvent(judgement.index);
      }
      this.playDrum(judgement.result !== 'correct');
      this.drumFlash = true;
      if(this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => { this.drumFlash = false; this.activeEvent = -1; }, 180);
    }
  }
};
</script>

<style scoped>
.sense-page { --sense-correct:#247047; --sense-early:#895c16; --sense-late:#a63e32; --sense-missed:#53646c; --sense-note-ink:#151515; position:relative; min-height:100vh; min-height:100svh; overflow-x:hidden; background:#f7f2e9; color:#213c43; }
.sense-backdrop { position:fixed; inset:0; overflow:hidden; opacity:.36; pointer-events:none; }
.sense-shell { position:relative; box-sizing:border-box; width:min(100%,760px); margin:auto; padding:calc(14px + env(safe-area-inset-top)) 18px calc(38px + env(safe-area-inset-bottom)); text-align:left; }
.sense-back { display:inline-flex; min-height:39px; align-items:center; gap:7px; border:1px solid rgba(207,86,39,.33); border-radius:12px; background:rgba(255,250,246,.88); color:#91401f; padding:0 13px; font:inherit; font-size:11px; font-weight:800; letter-spacing:.04em; cursor:pointer; }
.sense-back span { font-size:18px; line-height:1; }
.sense-card { margin-top:14px; padding:20px; border:1px solid #dbe7e7; border-radius:22px; background:rgba(255,255,255,.88); box-shadow:0 12px 27px rgba(62,55,47,.08); }
.sense-heading { display:grid; grid-template-columns:60px minmax(0,1fr); align-items:center; gap:14px; margin-top:13px; padding:13px 15px; border:1px solid rgba(43,70,77,.11); border-radius:21px; background:rgba(255,255,255,.8); box-shadow:0 11px 25px rgba(72,58,45,.09); }
.sense-heading-icon { display:grid; width:58px; height:58px; place-items:center; border-radius:18px; background:#faecd3; color:#a66a17; }
.sense-heading-icon svg { width:49px; height:49px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.sense-heading-icon circle { fill:currentColor; stroke:none; }
.sense-heading-copy { min-width:0; }
.sense-kicker { color:#c95025; font-size:9px; font-weight:800; letter-spacing:.16em; }
.sense-heading h1 { margin:2px 0 0; color:#17262b; font-size:24px; line-height:1.05; }
.sense-heading p { margin:4px 0 0; color:#64767a; font-size:12px; line-height:1.35; }
.sense-drum-card p { margin:5px 0; color:#627b80; font-size:14px; }
.sense-menu { display:grid; gap:12px; margin-top:12px; }
.sense-section-list { display:grid; gap:12px; }
.sense-section-link { display:grid; box-sizing:border-box; width:100%; min-height:88px; grid-template-columns:46px minmax(0,1fr) 20px; align-items:center; gap:12px; padding:14px; border:1px solid rgba(43,70,77,.12); border-radius:18px; background:rgba(255,255,255,.82); box-shadow:0 8px 20px rgba(72,58,45,.07); color:#294248; font:inherit; text-align:left; cursor:pointer; }
.sense-section-copy { display:grid; min-width:0; gap:5px; }
.sense-section-copy strong { color:#2d5661; font-size:12px; font-weight:850; letter-spacing:.04em; text-transform:uppercase; }
.sense-section-copy small { color:#697d82; font-size:11px; line-height:1.35; overflow-wrap:anywhere; }
.sense-section-arrow { color:#d65b2d; font-size:21px; }
.sense-settings-return { justify-self:start; min-height:38px; padding:0 12px; border:1px solid rgba(45,113,128,.25); border-radius:12px; background:rgba(255,255,255,.82); color:#286a77; font:inherit; font-size:11px; font-weight:800; cursor:pointer; }
.sense-settings-return span { margin-right:6px; font-size:17px; vertical-align:-1px; }
.sense-section-link:focus-visible, .sense-settings-return:focus-visible { outline:2px solid #2d7b88; outline-offset:3px; }
.sense-section-link:active, .sense-menu-start:active { transform:translateY(1px); }
.sense-start-card { display:grid; gap:11px; padding:13px; border:1px solid rgba(43,70,77,.11); border-radius:21px; background:rgba(255,255,255,.82); box-shadow:0 11px 25px rgba(72,58,45,.09); }
.sense-start-summary { display:flex; min-width:0; flex-direction:column; gap:3px; padding:0 3px; }
.sense-start-summary span { color:#c95025; font-size:9px; font-weight:800; letter-spacing:.13em; }
.sense-start-summary strong { overflow:hidden; color:#52676c; font-size:12px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.sense-selection-warning { margin:0; color:#9b411f; font-size:13px; line-height:1.45; }
.sense-settings-help { margin:0 0 12px; color:#60777c; font-size:12px; line-height:1.5; }
.sense-value-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(85px,1fr)); gap:8px; }
.sense-value-options button { display:flex; min-height:70px; flex-direction:column; justify-content:center; align-items:center; gap:6px; padding:10px 5px; border:1px solid #bfd6d9; border-radius:11px; background:#f6fbfb; color:#326b76; font:inherit; cursor:pointer; }
.sense-value-options button strong { font-size:18px; }
.sense-value-options button span { font-size:12px; font-weight:700; }
.sense-value-options button.selected { border-color:#e75f2a; background:#fff0e7; color:#b34f28; }
.sense-value-options button:disabled { cursor:default; }
.sense-menu-start:disabled { opacity:.55; box-shadow:none; cursor:not-allowed; }
.sense-haptic-option { display:flex; gap:16px; justify-content:space-between; align-items:center; min-height:64px; cursor:pointer; }
.sense-haptic-option + .sense-haptic-option { border-top:1px solid #dbe7e7; margin-top:8px; padding-top:8px; }
.sense-haptic-option span { display:flex; flex-direction:column; gap:5px; }
.sense-haptic-option strong { font-size:13px; }
.sense-haptic-option small { color:#60777c; font-size:12px; line-height:1.4; }
.sense-haptic-option input { width:22px; height:22px; flex:0 0 22px; accent-color:#2d6e7b; cursor:pointer; }
.sense-haptic-option + .sense-settings-help { margin:14px 0 0; }
.sense-settings-section { overflow:hidden; border:1px solid rgba(43,70,77,.11); border-radius:21px; background:rgba(255,255,255,.78); box-shadow:0 11px 25px rgba(72,58,45,.09); }
.sense-section-heading { display:grid; grid-template-columns:47px minmax(0,1fr); align-items:center; gap:12px; padding:14px 15px 13px; border-bottom:1px solid rgba(43,70,77,.09); }
.sense-section-heading h2 { margin:0; color:#2d5661; font-size:13px; line-height:1.2; text-transform:uppercase; letter-spacing:.04em; }
.sense-section-body { padding:15px; }
.sense-round-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.sense-meter-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.sense-round-options button, .sense-meter-options button, .sense-tempo-choices button { min-height:43px; border:1px solid #bfd6d9; border-radius:11px; background:#f6fbfb; color:#326b76; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
.sense-round-options button.selected, .sense-meter-options button.selected, .sense-tempo-choices button.selected { border-color:#e75f2a; background:#fff0e7; color:#b34f28; }
.sense-menu-start { display:flex; width:100%; min-height:60px; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px 13px 20px; border:0; border-radius:17px; background:linear-gradient(135deg,#ef6936,#dc501f); color:#fff; font:inherit; font-size:14px; font-weight:800; letter-spacing:.02em; box-shadow:0 9px 18px rgba(220,80,31,.2); cursor:pointer; }
.sense-start-arrow { font-size:25px; font-weight:500; line-height:1; }
.sense-training-heading { display:flex; align-items:center; gap:10px; padding-bottom:12px; border-bottom:1px solid rgba(43,70,77,.1); }
.sense-training-mark { width:5px; height:35px; flex:0 0 auto; border-radius:999px; background:#e76530; }
.sense-training-copy { display:flex; min-width:0; flex:1; flex-direction:column; gap:1px; }
.sense-training-copy span { color:#c95025; font-size:8px; font-weight:800; letter-spacing:.15em; }
.sense-training-copy strong { color:#26383d; font-size:14px; line-height:1.25; }
.sense-training-meta { flex:0 0 auto; padding:6px 9px; border-radius:999px; background:#eaf3f3; color:#326b76; font-size:11px; font-weight:800; }
.sense-session-controls { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; min-height:26px; }
.sense-session-progress { color:#627b80; font-size:12px; font-weight:800; }
.sense-end-round { min-height:28px; padding:3px 9px; border:1px solid #e7c7ba; border-radius:8px; background:#fff7f2; color:#aa4b27; font:inherit; font-size:11px; font-weight:800; }
.sense-tempo-choices { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
.sense-tempo-choices button { padding:5px 2px; }
.sense-tempo-choices button:disabled { opacity:.65; }
.sense-score-scroll { overflow-x:auto; margin-top:12px; }
.sense-score { display:block; width:100%; min-width:560px; }
.sense-score-mobile { display:none; }
.sense-staff, .sense-barline { stroke:#41646b; stroke-width:1.5; }
.sense-percussion { stroke:#23454c; stroke-width:5; stroke-linecap:round; }
.sense-meter { fill:#23454c; font-size:23px; font-weight:800; text-anchor:middle; }
.sense-head { fill:var(--sense-note-ink); stroke:var(--sense-note-ink); stroke-width:2; }
.sense-head.hollow { fill:white; }
.sense-dot { fill:var(--sense-note-ink); }
.sense-stem, .sense-flag { fill:none; stroke:var(--sense-note-ink); stroke-width:2.5; stroke-linecap:round; }
.sense-beam { stroke:var(--sense-note-ink); stroke-width:6; stroke-linecap:square; }
.sense-secondary-beam { stroke:var(--sense-note-ink); stroke-width:4; stroke-linecap:square; }
.sense-value { fill:#688087; font-size:10px; text-anchor:middle; }
.sense-value.is-sixteenth { font-size:8px; }
.sense-pair-value { font-size:8px; }
.sense-event.result-correct .sense-head { stroke:var(--sense-correct); stroke-width:3; }
.sense-event.result-early .sense-head { stroke:var(--sense-early); stroke-width:3; }
.sense-event.result-late .sense-head { stroke:var(--sense-late); stroke-width:3; }
.sense-event.result-missed .sense-head { stroke:var(--sense-missed); stroke-width:3; }
.sense-spark line { stroke:#ed7840; stroke-width:3; stroke-linecap:round; }
.sense-tap-marker { fill:#7b8990; stroke:#fff; stroke-width:2; filter:drop-shadow(0 1px 2px rgba(25,45,50,.3)); }
.sense-tap-marker.is-correct { fill:var(--sense-correct); }
.sense-tap-marker.is-early, .sense-tap-marker.is-too-early { fill:var(--sense-early); }
.sense-tap-marker.is-late, .sense-tap-marker.is-too-late { fill:var(--sense-late); }
.sense-tap-marker.is-missed, .sense-tap-marker.is-extra { fill:var(--sense-missed); }
.sense-tap-offset { margin:1px 0 8px; color:#526e75; font-size:12px; font-weight:800; text-align:center; font-variant-numeric:tabular-nums; }
.sense-storage-error { margin:8px 0; padding:9px 11px; border:1px solid #e8b2a1; border-radius:9px; background:#fff2eb; color:#aa472d; font-size:12px; font-weight:700; }
.sense-storage-retry { margin:0 0 8px; font:inherit; font-size:12px; font-weight:700; }
.sense-storage-retry:disabled { opacity:.6; cursor:wait; }
.sense-beats { display:flex; gap:8px; justify-content:center; }
.sense-beats span { display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:#e6f0f1; color:#3a7680; font-weight:800; }
.sense-beats span.grouped { margin-left:12px; }
.sense-beats.is-nine { gap:5px; }
.sense-beats.is-nine span { width:23px; height:23px; font-size:12px; }
.sense-beats.is-nine span.grouped { margin-left:8px; }
.sense-beats span.current { color:#fff; background:#e76131; box-shadow:0 0 0 5px #fbe6dd; }
.sense-status { text-align:center; min-height:22px; font-weight:800; }
.sense-actions { display:flex; gap:9px; }
.sense-actions button { flex:1; min-height:44px; border-radius:12px; font-weight:800; }
.sense-start { border:0; background:#b84c22; color:white; }
.sense-change { border:1px solid #bdd5d8; background:#f3fafb; color:#276b77; }
.sense-actions button:disabled { opacity:.52; }
.sense-drum-card { text-align:center; }
.sense-drum-card > strong { display:block; color:#2e6c79; }
.sense-drum { display:grid; place-items:center; width:min(240px,70vw); height:min(240px,70vw); margin:20px auto 10px; border:10px solid #9f5a3f; border-radius:50%; background:linear-gradient(145deg,#f5d3b4,#e9a77d); box-shadow:inset 0 0 0 5px #cf875f,0 16px 22px rgba(79,45,38,.2); touch-action:none; }
.sense-drum:not(:disabled) { cursor:pointer; }
.sense-drum.struck { transform:scale(.97); box-shadow:inset 0 0 0 5px #cf875f,0 3px 10px rgba(79,45,38,.25); }
.sense-drum:disabled { opacity:.65; }
.sense-drum-face { display:grid; place-items:center; width:86%; height:86%; border:3px solid rgba(153,83,61,.4); border-radius:50%; background:radial-gradient(circle,#fff7e6,#f2d9c2); }
.sense-drum-center { width:22%; height:22%; border-radius:50%; border:2px solid rgba(155,92,70,.2); }
.sense-feedback { min-height:22px; font-weight:800; }
@media(max-width:600px) {
  .sense-card { padding:15px; }
  .sense-score-scroll { overflow:visible; }
  .sense-score-wide { display:none; }
  .sense-score-mobile { display:block; min-width:0; }
  .sense-score-mobile .sense-value { font-size:11px; font-weight:700; }
  .sense-score-mobile .sense-pair-value { font-size:8px; }
  .sense-drum { width:clamp(130px,35vw,170px); height:clamp(130px,35vw,170px); margin:11px auto 8px; border-width:8px; }
  .sense-page.is-running .sense-shell { padding-top:calc(6px + env(safe-area-inset-top)); padding-bottom:calc(10px + env(safe-area-inset-bottom)); }
  .sense-page.is-running .sense-heading { display:none; }
  .sense-page.is-running .sense-back { min-height:34px; }
  .sense-page.is-running .sense-card { margin-top:8px; padding:10px 12px; }
  .sense-page.is-running .sense-score-scroll { margin-top:3px; }
  .sense-page.is-running .sense-beats span { width:25px; height:25px; font-size:12px; }
  .sense-page.is-running .sense-status { margin:7px 0; min-height:18px; font-size:13px; }
  .sense-page.is-running .sense-actions { display:none; }
  .sense-page.is-running .sense-drum-card > p:first-of-type { display:none; }
  .sense-page.is-running .sense-drum-card .sense-feedback { margin:5px 0 0; }
}
@media (orientation:landscape) and (max-height:500px) {
  .sense-page.is-running .sense-shell { display:grid; grid-template-columns:minmax(0,1fr) clamp(180px,28vw,260px); grid-template-rows:34px minmax(0,1fr); gap:6px 10px; width:min(100%,1040px); height:100vh; height:100dvh; min-height:320px; padding:calc(6px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left)); }
  .sense-page.is-running .sense-back { grid-column:1 / -1; justify-self:start; min-height:34px; }
  .sense-page.is-running .sense-card { min-width:0; min-height:0; margin:0; padding:10px 12px; }
  .sense-page.is-running .sense-exercise { display:flex; flex-direction:column; overflow-y:auto; }
  .sense-page.is-running .sense-training-heading { padding-bottom:6px; }
  .sense-page.is-running .sense-training-mark { height:28px; }
  .sense-page.is-running .sense-session-controls { margin-top:3px; min-height:24px; }
  .sense-page.is-running .sense-score-scroll { display:flex; flex:1; min-height:0; align-items:center; margin-top:3px; }
  .sense-page.is-running .sense-score-wide { min-width:0; max-height:160px; }
  .sense-page.is-running .sense-dense-score { display:flex; flex:1; flex-direction:column; justify-content:center; }
  .sense-page.is-running .sense-tap-offset { margin:1px 0 3px; }
  .sense-page.is-running .sense-status { min-height:22px; margin:5px 0 0; }
  .sense-page.is-running .sense-actions, .sense-page.is-running .sense-drum-card > p:first-of-type { display:none; }
  .sense-page.is-running .sense-drum-card { display:flex; flex-direction:column; justify-content:center; }
  .sense-page.is-running .sense-drum { flex:0 0 auto; width:clamp(140px,20vw,190px); height:clamp(140px,20vw,190px); margin:12px auto 8px; border-width:8px; }
  .sense-page.is-running .sense-drum-card .sense-feedback { margin:5px 0 0; }
}
</style>

<style scoped src="../styles/training-session.css"></style>
