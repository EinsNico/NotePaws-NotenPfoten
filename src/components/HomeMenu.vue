<template>
  <main class="home-menu">
    <div class="home-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop />
    </div>
    <div class="home-shell">
      <header class="home-brand">
        <div v-if="prestigeLevel > 0" class="home-prestige-badge" role="img"
          :aria-label="$t('HOME_PRESTIGE_BADGE', { level: prestigeLevel })">
          <div class="home-prestige-paws" aria-hidden="true">
            <svg v-for="index in prestigePaws" :key="index" viewBox="0 0 64 64" focusable="false">
              <path d="M32 29c-8 0-18 12-18 20 0 6 5 9 10 9 3 0 5-2 8-2s5 2 8 2c5 0 10-3 10-9 0-8-10-20-18-20z" />
              <ellipse cx="11" cy="29" rx="6" ry="9" transform="rotate(-22 11 29)" />
              <ellipse cx="24" cy="16" rx="6" ry="9" transform="rotate(-10 24 16)" />
              <ellipse cx="40" cy="16" rx="6" ry="9" transform="rotate(10 40 16)" />
              <ellipse cx="53" cy="29" rx="6" ry="9" transform="rotate(22 53 29)" />
            </svg>
          </div>
          <strong v-if="prestigeLevel >= 5" class="home-prestige-level">{{prestigeLevel}}</strong>
        </div>
        <div class="home-logo-frame" aria-hidden="true">
          <span class="home-logo-note home-logo-note-left">♪</span>
          <img class="home-logo" src="static/icon-512.png" alt="" />
          <span class="home-logo-note home-logo-note-right">♫</span>
        </div>
        <h1 class="home-wordmark" :aria-label="$t('APP_BRAND_NAME')">
          <BrandWordmark />
        </h1>
        <p class="home-tagline">{{$t('NOTEN_PFOTEN_TAGLINE')}}</p>
      </header>

      <section class="home-training" aria-labelledby="home-training-title">
        <div class="home-section-heading">
          <div class="home-section-meta">
            <DailyTasksButton ref="dailyTasks" @start="$emit('openDailyTask', $event)" />
            <button
              type="button"
              class="home-midi-status"
              :class="{ 'is-connected': midiStatus === 'connected' }"
              :disabled="midiStatus === 'checking' || midiStatus === 'unsupported'"
              @click="checkMidiConnection">
                <span class="home-midi-light" aria-hidden="true"></span>
                <span aria-live="polite">{{$t(midiStatusLabel)}}</span>
            </button>
          </div>
          <h2 id="home-training-title">{{$t('HOME_TRAINING_PROMPT')}}</h2>
        </div>
        <p v-if="midiStatus === 'permission-pending'" class="home-midi-permission-hint" role="status">{{$t('HOME_MIDI_PERMISSION_HINT')}}</p>

        <div class="home-mode-grid">
          <button
            type="button"
            class="home-mode-card home-mode-card-single"
            @click="$emit('openSingleNotes')">
              <span class="home-mode-icon home-single-note-icon" aria-hidden="true">
                <svg viewBox="0 0 80 80" focusable="false">
                  <path d="M11 25h58M11 34h58M11 43h58M11 52h58" />
                  <path class="note-stem" d="M48 20v36" />
                  <ellipse class="note-head" cx="39" cy="57" rx="10" ry="7" />
                </svg>
              </span>
              <span class="home-mode-copy">
                <strong>{{$t('HOME_SINGLE_NOTES')}}</strong>
                <span>{{$t('HOME_SINGLE_NOTES_DESCRIPTION')}}</span>
              </span>
              <span class="home-mode-arrow" aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            class="home-mode-card home-mode-card-flow"
            @click="$emit('openNoteFlow')">
              <span class="home-mode-icon home-flow-icon" aria-hidden="true">
                <svg viewBox="0 0 80 80" focusable="false">
                  <path class="flow-line" d="M8 52c14-28 33 19 62-16" />
                  <circle cx="18" cy="43" r="6" />
                  <circle cx="41" cy="48" r="6" />
                  <circle cx="64" cy="32" r="6" />
                  <path d="M24 43V27M47 48V32M70 32V16" />
                </svg>
              </span>
              <span class="home-mode-copy">
                <strong>{{$t('HOME_NOTE_FLOW')}}</strong>
                <span>{{$t('HOME_NOTE_FLOW_DESCRIPTION')}}</span>
              </span>
              <span class="home-mode-arrow" aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            class="home-mode-card home-mode-card-rhythm"
            @click="$emit('openRhythmSense')">
              <span class="home-mode-icon home-rhythm-icon" aria-hidden="true">
                <svg viewBox="0 0 80 80" focusable="false">
                  <path class="metronome-body" d="M24 66h32L49 15H31z" />
                  <path class="metronome-arm" d="M40 55L52 24" />
                  <circle class="metronome-weight" cx="49" cy="31" r="4" />
                  <path class="metronome-scale" d="M34 29h12M32 39h12M31 49h10" />
                  <path class="metronome-base" d="M19 66h42" />
                </svg>
              </span>
              <span class="home-mode-copy">
                <strong>{{$t('HOME_RHYTHM_SENSE')}}</strong>
                <span>{{$t('HOME_RHYTHM_SENSE_DESCRIPTION')}}</span>
              </span>
              <span class="home-mode-arrow" aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            class="home-mode-card home-mode-card-workshop"
            @click="$emit('openWorkshop')">
              <span class="home-mode-icon home-workshop-icon" aria-hidden="true">
                <svg viewBox="0 0 80 80" focusable="false">
                  <path d="M12 28h56M12 37h56M12 46h56M12 55h56" />
                  <ellipse cx="37" cy="49" rx="7" ry="5" />
                  <path d="M44 49V24M56 14v18M47 23h18" />
                </svg>
              </span>
              <span class="home-mode-copy">
                <strong>{{$t('HOME_WORKSHOP')}}</strong>
                <span>{{$t('HOME_WORKSHOP_DESCRIPTION')}}</span>
              </span>
              <span class="home-mode-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <button
        type="button"
        class="home-settings-card"
        @click="$emit('openAppSettings')">
          <span class="home-settings-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="M19 5h10l2 6 6 3 6-2 5 9-5 4v7l5 4-5 9-6-2-6 3-2 6H19l-2-6-6-3-6 2-5-9 5-4v-7l-5-4 5-9 6 2 6-3z" />
              <circle cx="24" cy="28" r="7" />
            </svg>
          </span>
          <span class="home-settings-copy">
            <strong>{{$t('HOME_APP_SETTINGS')}}</strong>
            <span>{{$t('HOME_APP_SETTINGS_DESCRIPTION')}}</span>
          </span>
          <span class="home-settings-arrow" aria-hidden="true">→</span>
      </button>

      <footer class="home-info-footer">
        <button
          ref="appInfoTrigger"
          type="button"
          class="home-info-button"
          :aria-label="$t('APP_INFO_OPEN')"
          @click="showAppInfo = true">
            <span class="home-info-mascot" aria-hidden="true">
              <img src="static/info-sprechblase-transparent.png" alt="" />
            </span>
            <strong>{{$t('HOME_APP_INFO')}}</strong>
            <span>{{$t('HOME_APP_INFO_DESCRIPTION')}}</span>
        </button>
      </footer>
    </div>

    <AppInfoDialog v-if="showAppInfo" :return-focus="$refs.appInfoTrigger" @close="closeAppInfo" />
  </main>
</template>

<script>
import AppInfoDialog from "./AppInfoDialog";
import DailyTasksButton from "./DailyTasksButton";
import BrandWordmark from "./BrandWordmark";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import WebMidi from "webmidi";
import { connectedMidiInputs, enableMidiConnection, MIDI_CONNECTION_CHECK_INTERVAL_MS } from "../model/MidiConnection";
import * as Lockr from "lockr";
import { createEmptyPrestigeArchive, summarizePrestigeArchive } from "../model/PrestigeArchive";

export default {
  name: "HomeMenu",
  components: {
    AppInfoDialog,
    DailyTasksButton,
    BrandWordmark,
    HomeMusicBackdrop
  },
  data() {
    return {
      showAppInfo: false,
      midiStatus: "unchecked",
      prestigeLevel: 0
    };
  },
  computed: {
    prestigePaws() {
      return this.prestigeLevel < 5 ? this.prestigeLevel : 1;
    },
    midiStatusLabel() {
      const labels = {
        unchecked: "HOME_MIDI_CHECK",
        checking: "HOME_MIDI_CHECKING",
        'permission-pending': "HOME_MIDI_WAITING_PERMISSION",
        connected: "HOME_MIDI_CONNECTED",
        disconnected: "HOME_MIDI_DISCONNECTED",
        unsupported: "HOME_MIDI_UNSUPPORTED",
        error: "HOME_MIDI_ERROR"
      };
      return labels[this.midiStatus];
    }
  },
  mounted() {
    this.refreshPrestigeLevel();
    this.midiStatusDisposed = false;
    this.midiStatusListening = false;
    this.midiRequestId = 0;
    window.addEventListener("focus", this.checkMidiConnection);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("resume", this.checkMidiConnection);
    document.addEventListener("deviceready", this.checkMidiConnection);
    this.midiStatusTimer = setInterval(() => {
      if (!document.hidden) this.refreshMidiStatus();
    }, MIDI_CONNECTION_CHECK_INTERVAL_MS);
    this.checkMidiConnection();
  },
  beforeDestroy() {
    this.midiStatusDisposed = true;
    this.midiRequestId += 1;
    if (this.cancelMidiEnable) this.cancelMidiEnable();
    clearInterval(this.midiStatusTimer);
    window.removeEventListener("focus", this.checkMidiConnection);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener("resume", this.checkMidiConnection);
    document.removeEventListener("deviceready", this.checkMidiConnection);
    if (WebMidi.enabled && this.midiStatusListening) {
      WebMidi.removeListener("connected", this.refreshMidiStatus);
      WebMidi.removeListener("disconnected", this.refreshMidiStatus);
    }
  },
  methods: {
    closeDailyTasks() {
      return Boolean(this.$refs.dailyTasks && this.$refs.dailyTasks.close());
    },
    refreshPrestigeLevel() {
      try {
        const archive = Lockr.get("prestigeArchive", null)
          || createEmptyPrestigeArchive();
        this.prestigeLevel = summarizePrestigeArchive(archive).prestige;
      } catch (ignored) {
        this.prestigeLevel = 0;
      }
    },
    handleVisibilityChange() {
      if (!document.hidden) this.checkMidiConnection();
    },
    checkMidiConnection() {
      if (this.midiStatusDisposed) return;
      if (WebMidi.enabled) {
        if (this.cancelMidiEnable) this.cancelMidiEnable();
        this.listenForMidiChanges();
        this.refreshMidiStatus();
        return;
      }
      if (this.midiStatus === "checking") return;
      const request = this.midiRequestId = (this.midiRequestId || 0) + 1;
      if (this.cancelMidiEnable) this.cancelMidiEnable();
      this.midiStatus = "checking";
      this.cancelMidiEnable = enableMidiConnection(WebMidi, error => {
        if (this.midiStatusDisposed || request !== this.midiRequestId) return;
        if (error) {
          this.midiStatus = WebMidi.supported ? "error" : "unsupported";
          return;
        }
        this.listenForMidiChanges();
        this.refreshMidiStatus();
      }, () => {
        if (!this.midiStatusDisposed && request === this.midiRequestId) {
          this.midiStatus = 'permission-pending';
        }
      });
    },
    listenForMidiChanges() {
      if (this.midiStatusListening && (typeof WebMidi.hasListener !== "function"
        || (WebMidi.hasListener("connected", this.refreshMidiStatus)
          && WebMidi.hasListener("disconnected", this.refreshMidiStatus)))) return;
      WebMidi.addListener("connected", this.refreshMidiStatus);
      WebMidi.addListener("disconnected", this.refreshMidiStatus);
      this.midiStatusListening = true;
    },
    refreshMidiStatus() {
      if (this.midiStatusDisposed) return;
      if (!WebMidi.enabled) {
        if (this.midiStatus === "connected") this.midiStatus = "disconnected";
        return;
      }
      this.midiStatus = connectedMidiInputs(WebMidi).length > 0
        ? "connected"
        : "disconnected";
    },
    closeAppInfo() {
      this.showAppInfo = false;
      this.$nextTick(() => {
        if (this.$refs.appInfoTrigger) {
          this.$refs.appInfoTrigger.focus();
        }
      });
    }
  }
};
</script>

<style scoped>
.home-menu {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: hidden;
  color: #1f2c31;
  background:
    radial-gradient(circle at 9% 7%, rgba(231, 101, 48, 0.14), transparent 25%),
    radial-gradient(circle at 94% 42%, rgba(45, 110, 123, 0.12), transparent 28%),
    #f7f2e9;
}

.home-backdrop-clip {
  position: fixed;
  z-index: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
}

.home-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 760px);
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: calc(18px + env(safe-area-inset-top)) 18px
    calc(14px + env(safe-area-inset-bottom));
}

.home-brand {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 1px;
}

.home-prestige-badge {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  min-width: 34px;
  min-height: 32px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border: 1px solid rgba(185, 119, 39, 0.28);
  border-radius: 14px;
  background: rgba(255, 248, 225, 0.9);
  box-shadow: 0 5px 14px rgba(82, 64, 34, 0.1);
  color: #bf782a;
}

.home-prestige-paws { display: flex; align-items: center; gap: 2px; }
.home-prestige-paws svg { width: 21px; height: 21px; fill: currentColor; }
.home-prestige-level { margin-top: -2px; font-size: 12px; line-height: 1; }

.home-logo-frame {
  position: relative;
  width: 88px;
  height: 88px;
}

.home-logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-logo-note {
  position: absolute;
  color: #e76530;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 4px 10px rgba(231, 101, 48, 0.17);
}

.home-logo-note-left {
  bottom: 3px;
  left: -25px;
  font-size: 23px;
  transform: rotate(-12deg);
}

.home-logo-note-right {
  top: 4px;
  right: -28px;
  color: #2d6e7b;
  font-size: 21px;
  transform: rotate(11deg);
}

.home-wordmark {
  width: min(88%, 390px);
  margin: 12px 0 0;
  font-size: 24px;
  line-height: 1;
}

.home-tagline {
  margin: 3px 0 0;
  color: #64767a;
  font-size: 13px;
  letter-spacing: 0.025em;
}

.home-midi-status {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 4px 10px;
  border: 1px solid rgba(45, 110, 123, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.79);
  color: #44636a;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.home-midi-status:hover,
.home-midi-status:focus-visible {
  border-color: #2d6e7b;
  outline: 2px solid rgba(45, 110, 123, 0.28);
  outline-offset: 2px;
}

.home-midi-status:disabled {
  cursor: default;
}

.home-midi-status.is-connected {
  border-color: rgba(35, 147, 103, 0.7);
  background: rgba(235, 255, 244, 0.95);
  box-shadow: 0 0 14px rgba(42, 188, 112, 0.28);
  color: #176244;
}

.home-midi-light {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: #aab9b9;
}

.home-midi-status.is-connected .home-midi-light {
  background: #2dca79;
  box-shadow: 0 0 0 3px rgba(45, 202, 121, 0.16), 0 0 11px #2dca79;
}

.home-training {
  margin-top: 10px;
}

.home-section-heading {
  margin: 0 4px 10px;
  text-align: left;
}

.home-midi-permission-hint {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid #d7e0e2;
  border-radius: 14px;
  background: rgba(242, 247, 248, .92);
  color: #586e75;
  font-size: 13px;
  line-height: 1.5;
}

.home-section-meta {
  display: flex;
  flex-wrap: wrap;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.home-section-kicker {
  display: block;
  color: #c95025;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.home-section-heading h2 {
  margin: 3px 0 0;
  color: #17262b;
  font-size: 20px;
  line-height: 1.15;
}

.home-mode-grid {
  display: grid;
  gap: 11px;
}

.home-mode-card {
  position: relative;
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) 26px;
  align-items: center;
  width: 100%;
  min-height: 124px;
  box-sizing: border-box;
  gap: 15px;
  padding: 16px 16px 16px 14px;
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 23px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 27px rgba(72, 58, 45, 0.1);
  color: #1f3035;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}

.home-mode-card::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 5px;
  border-radius: 23px 0 0 23px;
  background: #e76530;
  content: "";
}

.home-mode-card:not(:disabled):hover,
.home-mode-card:not(:disabled):focus-visible {
  border-color: rgba(231, 101, 48, 0.5);
  box-shadow: 0 15px 31px rgba(72, 58, 45, 0.15);
  outline: none;
  transform: translateY(-2px);
}

.home-mode-card:not(:disabled):active {
  transform: translateY(0) scale(0.99);
}

.home-mode-card-flow {
  background: linear-gradient(135deg, rgba(238, 247, 247, 0.97), rgba(255, 255, 255, 0.94));
}

.home-mode-card-flow::before {
  background: #2d6e7b;
}

.home-mode-card-rhythm {
  background: linear-gradient(135deg, rgba(255, 249, 238, 0.97), rgba(255, 255, 255, 0.94));
}

.home-mode-card-rhythm::before {
  background: #d7942f;
}

.home-mode-card-workshop {
  background: linear-gradient(135deg, rgba(244, 241, 249, 0.97), rgba(255, 255, 255, 0.94));
}

.home-mode-card-workshop::before {
  background: #8066a2;
}

.home-mode-card:disabled {
  color: #44585d;
  cursor: default;
}

.home-mode-icon {
  display: grid;
  width: 66px;
  height: 66px;
  place-items: center;
  border-radius: 20px;
  background: #fff0e8;
  color: #d85624;
}

.home-mode-card-flow .home-mode-icon {
  background: #dfeff1;
  color: #286a77;
}

.home-mode-card-rhythm .home-mode-icon {
  background: #faecd3;
  color: #a66a17;
}

.home-mode-card-workshop .home-mode-icon {
  background: #ede7f4;
  color: #725895;
}

.home-workshop-icon ellipse {
  fill: currentColor;
  stroke: none;
}

.home-mode-icon svg {
  width: 58px;
  height: 58px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.home-mode-icon .note-head,
.home-flow-icon circle {
  fill: currentColor;
  stroke: none;
}

.home-rhythm-icon .metronome-body {
  fill: rgba(255, 255, 255, 0.52);
}

.home-rhythm-icon .metronome-arm,
.home-rhythm-icon .metronome-base {
  stroke-width: 3;
}

.home-rhythm-icon .metronome-weight {
  fill: currentColor;
  stroke: none;
}

.home-rhythm-icon .metronome-scale {
  opacity: 0.42;
}

.home-mode-icon .note-stem {
  stroke-width: 4;
}

.home-flow-icon .flow-line {
  opacity: 0.35;
  stroke-dasharray: 3 5;
}

.home-mode-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.home-mode-copy strong {
  color: #1b2b30;
  font-size: 18px;
  line-height: 1.1;
}

.home-mode-copy > span {
  color: #67787c;
  font-size: 13px;
  line-height: 1.32;
}

.home-mode-arrow,
.home-settings-arrow {
  color: #d85a28;
  font-size: 27px;
  line-height: 1;
}

.home-mode-card-flow .home-mode-arrow {
  color: #6f8589;
}

.home-mode-card-rhythm .home-mode-arrow {
  color: #9d8a66;
}

.home-settings-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 24px;
  align-items: center;
  width: 100%;
  min-height: 72px;
  box-sizing: border-box;
  gap: 12px;
  margin-top: 12px;
  padding: 11px 15px;
  border: 1px solid rgba(43, 70, 77, 0.13);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.66);
  color: #24363b;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
}

.home-settings-card:hover,
.home-settings-card:focus-visible {
  border-color: rgba(231, 101, 48, 0.45);
  background: rgba(255, 255, 255, 0.92);
  outline: none;
}

.home-settings-icon {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border-radius: 14px;
  background: #eee3d7;
  color: #6b5b4c;
}

.home-settings-icon svg {
  width: 25px;
  height: 25px;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.home-settings-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.home-settings-copy strong {
  font-size: 14px;
}

.home-settings-copy span {
  overflow: hidden;
  color: #6e7b7e;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-info-footer {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.home-info-button {
  display: grid;
  min-width: 128px;
  justify-items: center;
  padding: 3px 16px 6px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: #33474c;
  font: inherit;
  cursor: pointer;
}

.home-info-button:hover,
.home-info-button:focus-visible {
  background: rgba(255, 255, 255, 0.64);
  outline: 2px solid rgba(231, 101, 48, 0.35);
  outline-offset: 1px;
}

.home-info-mascot {
  display: block;
  width: 43px;
  height: 43px;
}

.home-info-mascot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-info-button strong {
  margin-top: 1px;
  font-size: 12px;
}

.home-info-button > span:last-child {
  margin-top: 1px;
  color: #788488;
  font-size: 9px;
}

@media (min-width: 650px) {
  .home-shell {
    padding-right: 26px;
    padding-left: 26px;
  }

  .home-mode-grid {
    grid-template-columns: 1fr 1fr;
  }

  .home-mode-card {
    min-height: 154px;
    grid-template-columns: 64px minmax(0, 1fr) 20px;
    gap: 12px;
  }

}

@media (max-width: 370px) {
  .home-shell {
    padding-right: 12px;
    padding-left: 12px;
  }

  .home-logo-frame {
    width: 76px;
    height: 76px;
  }

  .home-wordmark {
    margin-top: 8px;
  }

  .home-training {
    margin-top: 13px;
  }

  .home-mode-card {
    min-height: 113px;
    grid-template-columns: 61px minmax(0, 1fr) 20px;
    gap: 11px;
    padding: 12px 12px 12px 11px;
  }

  .home-mode-icon {
    width: 58px;
    height: 58px;
  }

  .home-mode-icon svg {
    width: 51px;
    height: 51px;
  }

  .home-mode-copy strong {
    font-size: 16px;
  }

  .home-mode-copy > span {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-mode-card,
  .home-settings-card {
    transition: none;
  }
}
</style>
