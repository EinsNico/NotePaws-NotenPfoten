<template>
  <details class="audio-sync-settings" @toggle="onDisclosure">
    <summary>
      <span class="sync-summary-title">{{$t('AUDIO_SYNC_TITLE')}}</span>
      <span class="sync-summary-value">{{sync.delayMs}} ms</span>
      <span class="sync-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
    </summary>
    <div class="sync-body">
      <p>{{$t('AUDIO_SYNC_DESCRIPTION')}}</p>
      <div class="sync-status" aria-live="polite">
        <strong>{{sourceLabel}}</strong>
        <span>{{routeLabel}}</span>
      </div>
      <label class="sync-switch">
        <input type="checkbox" :checked="sync.settings.automatic" :disabled="busy || disabled"
          @change="setAutomatic($event.target.checked)">
        <span>{{$t('AUDIO_SYNC_AUTO_RESET')}}</span>
      </label>
      <div class="sync-delay">
        <label for="audio-sync-delay">{{$t('AUDIO_SYNC_DELAY')}} <output>{{sync.delayMs}} ms</output></label>
        <input id="audio-sync-delay" type="range" min="0" max="1000" step="5"
          :value="sync.delayMs" :disabled="busy || disabled" @input="setDelay($event.target.value)">
        <div class="sync-fine">
          <button type="button" :disabled="busy || disabled || sync.delayMs <= 0" @click="setDelay(sync.delayMs - 5)">−5 ms</button>
          <label><span class="sync-sr">{{$t('AUDIO_SYNC_DELAY')}}</span>
            <input type="number" inputmode="numeric" min="0" max="1000" step="1"
              :value="sync.delayMs" :disabled="busy || disabled" @change="setDelay($event.target.value)">
            <span>ms</span>
          </label>
          <button type="button" :disabled="busy || disabled || sync.delayMs >= 1000" @click="setDelay(sync.delayMs + 5)">+5 ms</button>
        </div>
      </div>
      <div class="sync-actions">
        <button type="button" class="sync-primary" :disabled="disabled || busy" @click="startCalibration">{{$t('AUDIO_SYNC_CALIBRATE')}}</button>
        <button type="button" :disabled="disabled || busy" @click="startCheck">{{$t('AUDIO_SYNC_CHECK')}}</button>
      </div>
      <p class="sync-hint">{{$t('AUDIO_SYNC_TAP_INTRO')}}</p>
      <div v-if="busy" class="sync-exercise">
        <template v-if="calibrationState && calibrationState.running">
          <p class="sync-hint">{{$t('AUDIO_SYNC_TAP_HELP')}}</p>
          <p aria-live="polite">{{calibrationState.phase === 'warmup'
            ? $t('AUDIO_SYNC_WARMUP', {count: calibrationState.warmupCompleted, total: calibrationState.totalWarmup})
            : $t('AUDIO_SYNC_PROGRESS', {count: calibrationState.samplesTaken, total: calibrationState.totalSamples})}}</p>
          <button type="button" class="sync-tap" :class="{'is-tapped': tapFlash}"
            @pointerdown.prevent="tap" @click="keyboardTap">{{$t('AUDIO_SYNC_TAP')}}</button>
        </template>
        <template v-else-if="checking">
          <div class="sync-check-dot" :class="{'is-beat': checkFlash}" aria-hidden="true"></div>
          <p>{{$t('AUDIO_SYNC_CHECK_HELP')}}</p>
        </template>
        <p v-else>{{$t('AUDIO_SYNC_PREPARING')}}</p>
        <button type="button" @click="cancelExercise">{{$t('AUDIO_SYNC_CANCEL')}}</button>
      </div>
      <div v-if="result" class="sync-result" role="status">
        <template v-if="result.ok">
          <strong>{{$t('AUDIO_SYNC_RESULT', {delay: result.delayMs})}}</strong>
          <p>{{$t('AUDIO_SYNC_RESULT_DETAIL', {count: result.acceptedCount})}}</p>
          <button type="button" class="sync-primary" :disabled="disabled" @click="applyResult">{{$t('AUDIO_SYNC_APPLY')}}</button>
        </template>
        <p v-else>{{$t('AUDIO_SYNC_RETRY')}}</p>
      </div>
      <p v-if="notice" class="sync-notice" role="status">{{notice}}</p>
      <p v-if="sync.storageSaved === false" class="sync-notice" role="alert">{{$t('AUDIO_SYNC_SAVE_FAILED')}}</p>
      <div class="sync-actions sync-reset-actions">
        <button type="button" :disabled="busy || disabled" @click="useSystemEstimate">{{$t('AUDIO_SYNC_SYSTEM')}}</button>
        <button type="button" :disabled="busy || disabled" @click="reset">{{$t('AUDIO_SYNC_RESET')}}</button>
      </div>
      <details class="sync-help">
        <summary>
          <span class="sync-summary-title">{{$t('AUDIO_SYNC_HELP')}}</span>
          <span class="sync-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
        </summary>
        <p class="sync-hint">{{$t('AUDIO_SYNC_AUTO_HELP')}}</p>
        <p class="sync-hint">{{$t('AUDIO_SYNC_ROUTE_LIMIT')}}</p>
        <p class="sync-hint">{{$t('AUDIO_SYNC_LOCAL')}}</p>
      </details>
    </div>
  </details>
</template>

<script>
import AudioSync from "../model/AudioSynchronization";
import { createAudioCalibration } from "../model/AudioCalibration";
import { appVolumeToAudioLevel } from "../model/AppVolume";
import { getAppAudioDestination } from "../model/AppSound";

export default {
  name: "AudioSyncSettings",
  props: { disabled: Boolean, appVolume: { type: Number, default: 70 }, soundEnabled: { type: Boolean, default: true } },
  data() {
    return { sync: AudioSync.getState(), calibrationState: null, result: null,
      starting: false, checking: false, checkFlash: false, tapFlash: false, noticeKey: "", noticeParams: null,
      saveNoticeKind: null, saveNoticeDelay: null };
  },
  computed: {
    notice() { return this.noticeKey ? this.$t(this.noticeKey, this.noticeParams) : ""; },
    busy() { return this.starting || this.checking || !!(this.calibrationState && this.calibrationState.running); },
    sourceLabel() {
      return this.$t(this.sync.source === "manual" ? "AUDIO_SYNC_SOURCE_MANUAL"
        : this.sync.source === "system" ? "AUDIO_SYNC_SOURCE_SYSTEM" : "AUDIO_SYNC_SOURCE_UNKNOWN");
    },
    routeLabel() {
      return this.$t("AUDIO_SYNC_ROUTE_" + (this.sync.routeReliable ? this.sync.route.toUpperCase() : "UNKNOWN"));
    }
  },
  watch: {
    disabled(value) { if (value) this.cancelExercise(); },
    appVolume() { if (this.busy) this.cancelExercise(); },
    soundEnabled(value) {
      if (!value && this.busy) {
        this.cancelExercise();
        this.setNotice("AUDIO_SYNC_SOUND_DISABLED");
      }
    }
  },
  created() {
    this.exerciseId = 0;
    this.exerciseTimers = [];
    this.checkSources = [];
    this.calibration = null;
    this.unsubscribeAudioSync = AudioSync.subscribe(state => {
      const changed = state.revision !== this.sync.revision;
      const recovered = this.sync.storageSaved === false && state.storageSaved === true;
      this.sync = state;
      if (recovered && this.saveNoticeKind) {
        this.setNotice(this.saveNoticeKind === "apply" ? "AUDIO_SYNC_APPLIED" : "AUDIO_SYNC_RESET_DONE",
          { delay: this.saveNoticeDelay });
        this.saveNoticeKind = null;
      }
      if (changed && (this.busy || this.result)) {
        this.cancelExercise();
        this.setNotice("AUDIO_SYNC_CHANGED");
      }
    });
    this.onHidden = () => { if (document.hidden && this.busy) this.cancelExercise(); };
    this.onNativePause = () => { if (this.busy) this.cancelExercise(); };
    document.addEventListener("visibilitychange", this.onHidden);
    document.addEventListener("pause", this.onNativePause);
  },
  beforeDestroy() {
    this.cancelExercise();
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    document.removeEventListener("visibilitychange", this.onHidden);
    document.removeEventListener("pause", this.onNativePause);
  },
  methods: {
    setNotice(key, params = null) { this.noticeKey = key; this.noticeParams = params; },
    onDisclosure(event) { if (!event.target.open) this.cancelExercise(); },
    setDelay(value) {
      if (value === "" || !Number.isFinite(Number(value))) return;
      this.result = null;
      this.setNotice("");
      this.saveNoticeKind = null;
      AudioSync.updateSettings({ manualMs: Number(value) });
    },
    setAutomatic(value) { AudioSync.updateSettings({ automatic: value }); },
    async useSystemEstimate() {
      const run = await this.prepareExercise(false);
      if (run === null || this.exerciseId !== run) return;
      if (AudioSync.getState().estimatedMs === null) {
        this.setNotice("AUDIO_SYNC_SOURCE_UNKNOWN"); return;
      }
      AudioSync.updateSettings({ manualMs: null });
    },
    reset() {
      this.cancelExercise();
      const state = AudioSync.reset();
      this.saveNoticeKind = state.storageSaved === false ? "reset" : null;
      this.setNotice(state.storageSaved === false ? "AUDIO_SYNC_SAVE_FAILED" : "AUDIO_SYNC_RESET_DONE");
    },
    cancelExercise() {
      this.exerciseId++;
      if (this.exerciseContext && this.contextInterrupted) {
        this.exerciseContext.removeEventListener("statechange", this.contextInterrupted);
      }
      this.exerciseContext = null;
      if (this.calibration) { this.calibration.stop(); this.calibration = null; }
      this.exerciseTimers.forEach(clearTimeout);
      this.exerciseTimers = [];
      this.checkSources.forEach(item => {
        try { item.oscillator.stop(); } catch (error) { /* Already finished. */ }
        try { item.oscillator.disconnect(); item.gain.disconnect(); } catch (error) { /* Old WebView. */ }
      });
      this.checkSources = [];
      this.calibrationState = null;
      this.result = null;
      this.starting = false; this.checking = false; this.checkFlash = false; this.tapFlash = false;
    },
    async prepareExercise(requireSound = true) {
      if (this.disabled || this.busy) return null;
      this.cancelExercise(); this.setNotice(""); this.saveNoticeKind = null;
      if (requireSound && !this.soundEnabled) { this.setNotice("AUDIO_SYNC_SOUND_DISABLED"); return null; }
      if (requireSound && this.appVolume <= 0) { this.setNotice("AUDIO_SYNC_MUTED"); return null; }
      const run = this.exerciseId;
      this.starting = true;
      let ready = false;
      try { ready = await AudioSync.resume(); } catch (error) { /* Report a usable fallback. */ }
      if (this.exerciseId !== run) return null;
      this.starting = false;
      if (!ready || !AudioSync.getContext() || AudioSync.getContext().state !== "running") {
        this.setNotice("AUDIO_SYNC_UNAVAILABLE"); return null;
      }
      return run;
    },
    observeContext() {
      this.exerciseContext = AudioSync.getContext();
      this.contextInterrupted = () => {
        if (this.exerciseContext && this.exerciseContext.state !== "running") {
          this.cancelExercise(); this.setNotice("AUDIO_SYNC_UNAVAILABLE");
        }
      };
      this.exerciseContext.addEventListener("statechange", this.contextInterrupted);
    },
    async startCalibration() {
      const run = await this.prepareExercise();
      if (run === null || this.exerciseId !== run) return;
      this.observeContext();
      this.calibration = createAudioCalibration({
        context: AudioSync.getContext(), volume: appVolumeToAudioLevel(this.appVolume),
        onUpdate: state => {
          if (this.exerciseId !== run) return;
          this.calibrationState = state;
          if (state.result) this.result = state.result;
        }
      });
      if (!this.calibration.start()) this.setNotice("AUDIO_SYNC_UNAVAILABLE");
    },
    tap(event) {
      if (!this.calibration || !this.calibrationState || !this.calibrationState.running) return;
      const now = performance.now();
      const timestamp = event && Number.isFinite(event.timeStamp) && Math.abs(event.timeStamp - now) < 5000
        ? event.timeStamp : now;
      this.calibration.tap(timestamp);
      this.tapFlash = true;
      this.exerciseTimers.push(setTimeout(() => { this.tapFlash = false; }, 90));
    },
    keyboardTap(event) { if (event.detail === 0) this.tap(event); },
    applyResult() {
      if (!this.result || !this.result.ok || this.disabled) return;
      const delay = this.result.delayMs;
      this.cancelExercise();
      const state = AudioSync.updateSettings({ manualMs: delay });
      this.saveNoticeKind = state.storageSaved === false ? "apply" : null;
      this.saveNoticeDelay = delay;
      this.setNotice(state.storageSaved === false ? "AUDIO_SYNC_APPLIED_TEMPORARY" : "AUDIO_SYNC_APPLIED", { delay });
    },
    async startCheck() {
      const run = await this.prepareExercise();
      if (run === null || this.exerciseId !== run) return;
      const context = AudioSync.getContext(), delay = AudioSync.getDelayMs();
      this.observeContext();
      this.checking = true;
      try {
        const start = context.currentTime + 0.15;
        for (let index = 0; index < 6; index++) {
          const when = start + index * 1.1;
          const oscillator = context.createOscillator(), gain = context.createGain();
          this.checkSources.push({ oscillator, gain });
          oscillator.frequency.setValueAtTime(880, when);
          gain.gain.setValueAtTime(0, when);
          gain.gain.linearRampToValueAtTime(appVolumeToAudioLevel(this.appVolume) * 0.35, when + 0.002);
          gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
          oscillator.connect(gain); gain.connect(getAppAudioDestination(context));
          oscillator.start(when); oscillator.stop(when + 0.05);
          const heardIn = Math.max(0, (when - context.currentTime) * 1000 + delay);
          this.exerciseTimers.push(setTimeout(() => {
            if (this.exerciseId !== run) return;
            this.checkFlash = true;
            this.exerciseTimers.push(setTimeout(() => { this.checkFlash = false; }, 110));
          }, heardIn));
        }
        this.exerciseTimers.push(setTimeout(() => {
          if (this.exerciseId === run) this.cancelExercise();
        }, 6000 + delay));
      } catch (error) {
        this.cancelExercise(); this.setNotice("AUDIO_SYNC_UNAVAILABLE");
      }
    }
  }
};
</script>

<style scoped>
.audio-sync-settings { margin-top: 22px; border-top: 1px solid var(--settings-accent-border, #d7e2e3); color: var(--settings-accent-color, #34545e); }
summary { display: flex; align-items: center; gap: 12px; min-height: 64px; box-sizing: border-box; cursor: pointer; padding: 16px; margin: 8px 0 0; border-radius: 16px; font-size: 14px; font-weight: 700; line-height: 1.4; text-align: left; list-style: none; transition: background .18s ease; }
summary::-webkit-details-marker { display: none; }
summary:hover, summary:focus-visible { background: var(--settings-accent-soft, #eef5f4); }
.sync-summary-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sync-summary-value { flex: none; color: var(--settings-accent, #2c7c8a); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sync-chevron { display: flex; flex: 0 0 32px; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: var(--settings-accent, #2c7c8a); background: var(--settings-accent-light, #edf4f2); }
.sync-chevron svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .18s ease; }
details[open] > summary .sync-chevron { background: var(--settings-accent-light, #dceceb); }
details[open] > summary .sync-chevron svg { transform: rotate(180deg); }
.sync-body { padding-top: 8px; }
.sync-body p { line-height: 1.5; }
.sync-status, .sync-result, .sync-exercise { padding: 14px; border-radius: 14px; background: var(--settings-accent-soft, #eef5f4); margin: 14px 0; }
.sync-status span, .sync-status small { display: block; margin-top: 5px; }
.sync-switch { display: flex; align-items: center; gap: 10px; line-height: 1.4; font-weight: 600; margin-top: 18px; cursor: pointer; }
.sync-switch input { width: 22px; height: 22px; flex: 0 0 22px; accent-color: var(--settings-accent, #2c7c8a); }
.sync-hint, .sync-status small { font-size: 13px; color: #667f88; }
.sync-delay { margin-top: 20px; }
.sync-delay > label { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; }
.sync-delay > input { width: 100%; margin: 15px 0; accent-color: var(--settings-accent, #2c7c8a); }
.sync-fine, .sync-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sync-fine { justify-content: space-between; }
.sync-fine label { display: flex; align-items: center; gap: 4px; }
.sync-fine input { width: 62px; padding: 11px 2px; font: inherit; text-align: center; color: inherit; border: 1px solid var(--settings-accent-border, #cadbdd); border-radius: 10px; background: white; }
.sync-actions { margin-top: 18px; }
.sync-body button { min-height: 44px; padding: 10px 12px; border: 1px solid var(--settings-accent-border, #cadbdd); border-radius: 12px; color: var(--settings-accent-color, #34545e); background: var(--settings-accent-soft, #fffaf4); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.sync-body button.sync-primary { background: var(--settings-accent, #2c7c8a); border-color: var(--settings-accent, #2c7c8a); color: white; }
.sync-body button:disabled { opacity: .45; cursor: default; }
.sync-body button:focus-visible, .sync-body input:focus-visible, summary:focus-visible { outline: 3px solid var(--settings-accent-focus, #df6b3b); outline-offset: 3px; }
.sync-exercise { text-align: center; }
.sync-exercise .sync-tap { display: block; width: 100%; min-height: 110px; margin: 12px 0; background: var(--settings-accent, #2c7c8a); color: white; font-size: 19px; touch-action: manipulation; }
.sync-exercise .sync-tap.is-tapped { background: var(--settings-accent-color, #d96a37); }
.sync-check-dot { width: 44px; height: 44px; margin: 18px auto; background: var(--settings-accent-light, #aecace); border-radius: 50%; }
.sync-check-dot.is-beat { background: var(--settings-accent-color, #d96a37); box-shadow: 0 0 0 7px var(--settings-accent-light, #f4d4bc); }
.sync-notice { color: #9f4827; }
.sync-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
@media (max-width: 360px) { .sync-fine button { padding: 9px 7px; } }
@media (prefers-reduced-motion: reduce) { summary, .sync-chevron svg { transition: none; } }
</style>
