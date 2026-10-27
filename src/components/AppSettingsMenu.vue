<template>
  <main class="app-settings-menu">
    <div class="app-settings-backdrop-clip" aria-hidden="true">
      <HomeMusicBackdrop class="app-settings-backdrop" />
    </div>

    <div class="app-settings-shell">
      <header class="app-settings-header">
        <button type="button" class="app-settings-back"
          :disabled="storageBusy || resetInProgress || resetStep === 'success'" @click="goBack">
          <span aria-hidden="true">←</span>
          {{$t('BACK')}}
        </button>

        <div class="app-settings-hero">
          <span class="app-settings-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="M19 4h10l2 6 6 3 6-2 5 9-5 4v7l5 4-5 9-6-2-6 3-2 6H19l-2-6-6-3-6 2-5-9 5-4v-7l-5-4 5-9 6 2 6-3z" />
              <circle cx="24" cy="27" r="7" />
            </svg>
          </span>
          <div class="app-settings-hero-copy">
            <span>{{$t('HOME_APP_SETTINGS_KICKER')}}</span>
            <h1>{{$t('HOME_APP_SETTINGS')}}</h1>
          </div>
        </div>
      </header>

      <div class="app-settings-sections">
        <section
          class="app-settings-card app-settings-card-audio"
          aria-labelledby="app-settings-audio-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-audio-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M8 20h9l11-9v26l-11-9H8z" />
                <path d="M34 18c3 3 3 9 0 12M39 13c6 6 6 16 0 22" />
              </svg>
            </span>
            <div>
              <h2 id="app-settings-audio-title">{{$t('APP_SETTINGS_AUDIO')}}</h2>
              <p id="app-settings-audio-description">{{$t('APP_SETTINGS_AUDIO_DESCRIPTION')}}</p>
            </div>
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              :label="$t('APP_SETTINGS_SOUND')"
              :items="onOffOptions"
              :disabled="settingsBusy"
              :value="options.sound"
              @input="options.sound = $event === 'true'"
            />
          </div>
          <div class="app-settings-control app-settings-volume-control">
            <label for="app-volume">
              <span>{{$t('APP_SETTINGS_VOLUME')}}</span>
              <output for="app-volume">{{options.appVolume}} %</output>
            </label>
            <input
              id="app-volume"
              v-model.number="options.appVolume"
              type="range"
              :disabled="settingsBusy || !options.sound"
              min="0"
              max="100"
              step="5"
              :aria-describedby="'app-settings-audio-description'"
            />
            <div class="app-settings-volume-scale" aria-hidden="true">
              <span>{{$t('APP_SETTINGS_VOLUME_QUIET')}}</span>
              <span>{{$t('APP_SETTINGS_VOLUME_LOUD')}}</span>
            </div>
          </div>
          <AudioSyncSettings :app-volume="options.appVolume" :sound-enabled="options.sound" :disabled="settingsBusy" />
        </section>

        <section
          class="app-settings-card app-settings-card-screen"
          aria-labelledby="app-settings-screen-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-screen-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <rect x="12" y="5" width="24" height="38" rx="4" />
                <path d="M21 37h6M24 14v3M24 25v3M17 21h3M28 21h3" />
                <circle cx="24" cy="21" r="3" />
              </svg>
            </span>
            <div>
              <h2 id="app-settings-screen-title">{{$t('APP_SETTINGS_SCREEN')}}</h2>
              <p>{{$t('APP_SETTINGS_SCREEN_DESCRIPTION')}}</p>
            </div>
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              :label="$t('APP_SETTINGS_KEEP_SCREEN_AWAKE')"
              :items="onOffOptions"
              :disabled="settingsBusy"
              :value="options.keepScreenAwake"
              @input="options.keepScreenAwake = $event === 'true'"
            />
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              wide
              :label="$t('APP_SETTINGS_PREPARATION_TIME')"
              :items="preparationOptions"
              :disabled="settingsBusy"
              :value="options.preparationSeconds"
              @input="setPreparationSeconds"
            />
            <p class="app-settings-control-hint">{{$t('APP_SETTINGS_PREPARATION_DESCRIPTION')}}</p>
          </div>
        </section>

        <section
          class="app-settings-card app-settings-card-vibration"
          aria-labelledby="app-settings-vibration-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-vibration-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <rect x="15" y="7" width="18" height="34" rx="4" />
                <path d="M8 16l-4 8 4 8M40 16l4 8-4 8M21 35h6" />
              </svg>
            </span>
            <div>
              <h2 id="app-settings-vibration-title">{{$t('APP_SETTINGS_VIBRATION')}}</h2>
              <p>{{$t('APP_SETTINGS_VIBRATION_DESCRIPTION')}}</p>
            </div>
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              :label="$t('APP_SETTINGS_VIBRATION_ENABLE')"
              :items="onOffOptions"
              :disabled="settingsBusy"
              :value="options.vibration"
              @input="options.vibration = $event === 'true'"
            />
          </div>
        </section>

        <section
          class="app-settings-card app-settings-card-language"
          aria-labelledby="app-settings-language-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-language-icon" aria-hidden="true">
              <strong>DE</strong>
              <small>EN</small>
            </span>
            <div>
              <h2 id="app-settings-language-title">{{$t('APP_SETTINGS_LANGUAGE')}}</h2>
              <p>{{$t('APP_SETTINGS_LANGUAGE_DESCRIPTION')}}</p>
            </div>
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              :label="$t('APP_SETTINGS_LANGUAGE_SELECT')"
              :items="languageOptions"
              :disabled="storageBusy"
              v-model="options.language"
            />
          </div>
        </section>

        <section
          class="app-settings-card app-settings-card-note-naming"
          aria-labelledby="app-settings-note-naming-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-note-naming-icon" aria-hidden="true">
              <strong>H</strong>
              <small>B</small>
            </span>
            <div>
              <h2 id="app-settings-note-naming-title">{{$t('APP_SETTINGS_NOTE_NAMING')}}</h2>
              <p>{{$t('APP_SETTINGS_NOTE_NAMING_DESCRIPTION')}}</p>
            </div>
          </div>
          <div class="app-settings-control">
            <SelectOptionDropdown
              appearance="app-settings"
              wide
              :label="$t('APP_SETTINGS_NOTE_NAMING_SELECT')"
              :items="noteNamingOptions"
              :disabled="storageBusy"
              v-model="options.noteNaming"
            />
          </div>
        </section>

        <section class="app-settings-card app-settings-card-help"
          aria-labelledby="app-settings-help-title">
          <h2 id="app-settings-help-title" class="app-settings-help-title">{{$t('APP_SETTINGS_HELP')}}</h2>
          <button type="button" class="app-settings-tutorial" :disabled="settingsBusy"
            @click="$emit('openTutorial')">
            <span class="app-settings-tutorial-symbol" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M24 13c-5-4-11-5-18-3v27c7-2 13-1 18 3 5-4 11-5 18-3V10c-7-2-13-1-18 3zM24 13v27M12 18l6 1M12 25l6 1M30 19l6-1M30 26l6-1" />
              </svg>
            </span>
            <span class="app-settings-tutorial-copy">
              <strong>{{$t('WELCOME_REOPEN')}}</strong>
              <small>{{$t('APP_SETTINGS_HELP_DESCRIPTION')}}</small>
            </span>
            <span class="app-settings-tutorial-arrow" aria-hidden="true">→</span>
          </button>
        </section>

        <section
          class="app-settings-card app-settings-card-backup"
          aria-labelledby="app-settings-backup-title">
          <div class="app-settings-section-heading">
            <span class="app-settings-section-icon app-settings-backup-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M11 30v10h26V30" />
                <path d="M24 5v25M15 21l9 9 9-9" />
              </svg>
            </span>
            <div>
              <h2 id="app-settings-backup-title">{{$t('APP_SETTINGS_BACKUP')}}</h2>
              <p>{{$t('APP_SETTINGS_BACKUP_DESCRIPTION')}}</p>
            </div>
          </div>
          <fieldset class="app-settings-storage-controls"
            :disabled="resetInProgress || resetStep === 'success'">
          <StoredDataOverview :busy="backupBusy || resetInProgress || resetStep === 'success'"
            @busy-change="prestigeBusy = $event" />
          <SaveDataManager
            v-if="!prestigeBusy"
            ref="saveDataManager"
            appearance="app-settings"
            @before-storage-action="saveOptions"
            @busy-change="backupBusy = $event"
          />
          </fieldset>
        </section>

        <section
          class="app-settings-card app-settings-card-danger"
          aria-labelledby="app-settings-delete-title">
          <details ref="deleteDetails" class="app-settings-delete-disclosure"
            @toggle="handleDeleteDisclosure">
          <summary :aria-disabled="storageBusy || resetInProgress || resetStep === 'success'"
            @click="(storageBusy || resetInProgress || resetStep === 'success') && $event.preventDefault()">
          <h2 id="app-settings-delete-title" class="app-settings-section-heading app-settings-delete-heading">
            <span class="app-settings-section-icon app-settings-danger-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M9 14h30M18 14V9h12v5M14 14l2 27h16l2-27" />
                <path d="M21 21v13M27 21v13" />
              </svg>
            </span>
            <span>{{$t('APP_SETTINGS_DELETE_DATA')}}</span>
            <span class="app-settings-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </h2>
          </summary>

          <div class="app-settings-danger-body">
            <p class="app-settings-delete-description">{{$t('APP_SETTINGS_DELETE_DATA_DESCRIPTION')}}</p>
            <template v-if="resetStep === 'idle'">
              <p class="app-settings-preserved-note">
                {{$t('APP_SETTINGS_DELETE_DATA_PRESERVED')}}
              </p>
              <button
                type="button"
                class="app-settings-danger-button app-settings-danger-button-outline"
                :disabled="storageBusy"
                @click="openLearningDataReset">
                {{$t('APP_SETTINGS_DELETE_DATA_ACTION')}}
              </button>
            </template>

            <div
              v-else-if="resetStep === 'warning'"
              class="app-settings-confirmation"
              role="group"
              :aria-labelledby="'app-settings-delete-warning-title'">
              <h3
                id="app-settings-delete-warning-title"
                ref="resetPanelHeading"
                tabindex="-1">
                {{$t('APP_SETTINGS_DELETE_WARNING_TITLE')}}
              </h3>
              <p>{{$t('APP_SETTINGS_DELETE_WARNING_DESCRIPTION')}}</p>
              <p class="app-settings-backup-hint">
                {{$t('APP_SETTINGS_DELETE_BACKUP_HINT')}}
              </p>
              <div class="app-settings-danger-actions">
                <button
                  type="button"
                  class="app-settings-secondary-button"
                  :disabled="storageBusy"
                  @click="cancelLearningDataReset">
                  {{$t('CANCEL')}}
                </button>
                <button
                  type="button"
                  class="app-settings-danger-button"
                  :disabled="storageBusy"
                  @click="showFinalLearningDataReset">
                  {{$t('APP_SETTINGS_DELETE_CONTINUE')}}
                </button>
              </div>
            </div>

            <div
              v-else-if="resetStep === 'final'"
              class="app-settings-confirmation app-settings-confirmation-final"
              role="group"
              :aria-labelledby="'app-settings-delete-final-title'">
              <h3
                id="app-settings-delete-final-title"
                ref="resetPanelHeading"
                tabindex="-1">
                {{$t('APP_SETTINGS_DELETE_FINAL_TITLE')}}
              </h3>
              <p>{{$t('APP_SETTINGS_DELETE_FINAL_DESCRIPTION')}}</p>
              <div class="app-settings-danger-actions">
                <button
                  type="button"
                  class="app-settings-secondary-button"
                  :disabled="resetInProgress || storageBusy"
                  @click="openLearningDataReset">
                  {{$t('BACK')}}
                </button>
                <button
                  type="button"
                  class="app-settings-danger-button app-settings-danger-button-final"
                  :disabled="resetInProgress || storageBusy"
                  @click="deleteLearningData">
                  {{$t('APP_SETTINGS_DELETE_CONFIRM')}}
                </button>
              </div>
            </div>

            <div
              v-else-if="resetStep === 'success'"
              class="app-settings-reset-message app-settings-reset-success"
              role="status">
              {{$t('APP_SETTINGS_DELETE_SUCCESS')}}
            </div>

            <div
              v-else
              class="app-settings-reset-message app-settings-reset-error"
              role="alert">
              <p>{{resetError}}</p>
              <button
                type="button"
                class="app-settings-secondary-button"
                :disabled="storageBusy"
                @click="cancelLearningDataReset">
                {{$t('BACK')}}
              </button>
            </div>
          </div>
          </details>
        </section>
      </div>
    </div>
  </main>
</template>

<script>
import Options from "../model/Options";
import { ENABLED_LANGUAGES } from "../model/LanguageOptions";
import {
  NOTE_NAMING_GERMAN,
  NOTE_NAMING_INTERNATIONAL
} from "../model/NoteNaming";
import {
  deleteAllLearningDataEverywhere
} from "../model/LearningDataReset";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import SaveDataManager from "./SaveDataManager";
import StoredDataOverview from "./StoredDataOverview";
import SelectOptionDropdown from "./SelectOptionDropdown";
import AudioSyncSettings from "./AudioSyncSettings";
import { normalizePreparationSeconds } from "../model/PracticePreparation";

export default {
  name: "AppSettingsMenu",
  components: {
    AudioSyncSettings,
    HomeMusicBackdrop,
    SaveDataManager,
    StoredDataOverview,
    SelectOptionDropdown
  },
  data() {
    return {
      options: Options,
      resetStep: "idle",
      resetError: "",
      resetInProgress: false,
      backupBusy: false,
      prestigeBusy: false,
      reloadTimer: null
    };
  },
  computed: {
    storageBusy() { return this.backupBusy || this.prestigeBusy; },
    settingsBusy() { return this.storageBusy || this.resetInProgress || this.resetStep === "success"; },
    onOffOptions() {
      return [{ value: true, label: this.$t("on") }, { value: false, label: this.$t("off") }];
    },
    preparationOptions() {
      return [
        { value: 0, label: this.$t("APP_SETTINGS_PREPARATION_IMMEDIATE") },
        { value: 3, label: this.$t("APP_SETTINGS_PREPARATION_THREE") },
        { value: 5, label: this.$t("APP_SETTINGS_PREPARATION_FIVE") }
      ];
    },
    languageOptions() {
      return ENABLED_LANGUAGES.map(language => ({
        value: language,
        label: language.toUpperCase()
      }));
    },
    noteNamingOptions() {
      return [
        {
          value: NOTE_NAMING_GERMAN,
          label: this.$t("APP_SETTINGS_NOTE_NAMING_GERMAN")
        },
        {
          value: NOTE_NAMING_INTERNATIONAL,
          label: this.$t("APP_SETTINGS_NOTE_NAMING_INTERNATIONAL")
        }
      ];
    }
  },
  watch: {
    "options.language": function updateLanguage(language) {
      this.$i18n.locale = language;
      this.$updateExternalAppMetadata(language);
      this.saveOptions();
    },
    "options.noteNaming": function updateNoteNaming() {
      this.saveOptions();
    },
    "options.appVolume": function updateAppVolume() {
      this.saveOptions();
    },
    "options.sound": function updateSound() {
      this.saveOptions();
    },
    "options.keepScreenAwake": function updateKeepScreenAwake() {
      this.saveOptions();
    },
    "options.preparationSeconds": function updatePreparationSeconds() {
      this.saveOptions();
    },
    "options.vibration": function updateVibration(enabled) {
      if (!enabled && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (error) { /* Some browsers reject vibration. */ }
      }
      this.saveOptions();
    }
  },
  methods: {
    setPreparationSeconds(value) {
      this.options.preparationSeconds = normalizePreparationSeconds(value);
    },
    handleBack() {
      if (this.storageBusy) return;
      if (this.resetInProgress || this.resetStep === "success") return;
      if (this.resetStep !== "idle") {
        this.cancelLearningDataReset();
        return;
      }
      if (this.$refs.deleteDetails && this.$refs.deleteDetails.open) {
        this.$refs.deleteDetails.open = false;
        return;
      }
      if (this.$refs.saveDataManager && this.$refs.saveDataManager.handleBack()) {
        return;
      }
      this.goBack();
    },
    saveOptions() {
      Options.saveOptions();
    },
    handleDeleteDisclosure(event) {
      if (!event.target.open && !this.resetInProgress && this.resetStep !== "success") {
        this.cancelLearningDataReset();
      }
    },
    focusResetPanel() {
      this.$nextTick(() => {
        const heading = this.$refs.resetPanelHeading;
        if (heading && typeof heading.focus === "function") {
          heading.focus();
        }
      });
    },
    openLearningDataReset() {
      if (this.storageBusy) return;
      this.resetError = "";
      this.resetStep = "warning";
      this.focusResetPanel();
    },
    showFinalLearningDataReset() {
      if (this.storageBusy) return;
      this.resetStep = "final";
      this.focusResetPanel();
    },
    cancelLearningDataReset() {
      this.resetError = "";
      this.resetStep = "idle";
    },
    async deleteLearningData() {
      if (this.resetInProgress || this.storageBusy) {
        return;
      }
      this.resetInProgress = true;
      try {
        this.saveOptions();
        await deleteAllLearningDataEverywhere(localStorage);
        this.resetError = "";
        this.resetStep = "success";
        this.reloadTimer = window.setTimeout(() => window.location.reload(), 1200);
      } catch (error) {
        this.resetError = this.$t(
          error && error.rollbackSucceeded === false
            ? "APP_SETTINGS_DELETE_ROLLBACK_ERROR"
            : "APP_SETTINGS_DELETE_ERROR"
        );
        this.resetStep = "error";
      } finally {
        this.resetInProgress = false;
      }
    },
    goBack() {
      if (this.storageBusy || this.resetInProgress || this.resetStep === "success") return;
      if (this.$refs.saveDataManager
        && (this.$refs.saveDataManager.isBusy
          || this.$refs.saveDataManager.reloadTimer != null)) return;
      this.saveOptions();
      this.$emit("back");
    }
  },
  created() {
    Options.loadOptions();
  },
  beforeDestroy() {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
    }
    this.saveOptions();
  }
};
</script>

<style scoped>
.app-settings-help-title { margin:0 0 14px; color:#2b464d; font-size:15px; line-height:1.35; }
.app-settings-tutorial { display:flex; align-items:center; gap:12px; box-sizing:border-box; width:100%; min-height:76px; padding:14px; border:1px solid var(--settings-accent-border); border-radius:16px; background:var(--settings-accent-soft); color:#345e68; font:inherit; cursor:pointer; text-align:left; }
.app-settings-tutorial-copy { display:grid; gap:5px; min-width:0; }
.app-settings-tutorial-copy strong { color:#2b464d; font-size:15px; line-height:1.35; }
.app-settings-tutorial-copy small { color:#607a80; font-size:12px; font-weight:400; line-height:1.5; }
.app-settings-tutorial-arrow { margin-left:auto; color:#d85624; font-size:22px; }
.app-settings-tutorial-symbol { display:grid; place-items:center; flex:0 0 42px; width:42px; height:42px; border-radius:13px; background:var(--settings-accent-light); color:var(--settings-accent-color); }
.app-settings-tutorial-symbol svg { width:28px; height:28px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
.app-settings-tutorial:hover:not(:disabled) { border-color:var(--settings-accent-color); background:var(--settings-accent-light); }
.app-settings-tutorial:disabled { opacity:.55; cursor:default; }
.app-settings-tutorial:focus-visible { outline:3px solid #2d7180; outline-offset:3px; }

.app-settings-menu {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: #213237;
  background:
    radial-gradient(circle at 8% 6%, rgba(231, 101, 48, 0.13), transparent 25%),
    radial-gradient(circle at 94% 42%, rgba(45, 110, 123, 0.11), transparent 30%),
    #f7f2e9;
}

.app-settings-backdrop-clip {
  position: fixed;
  z-index: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
}

.app-settings-backdrop {
  opacity: 0.48;
}

.app-settings-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 760px);
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 18px
    calc(28px + env(safe-area-inset-bottom));
}

.app-settings-header {
  text-align: left;
}

.app-settings-hero {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  margin-top: 17px;
}

.app-settings-hero-icon {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border: 1px solid rgba(107, 91, 76, 0.13);
  border-radius: 20px;
  background: #ece2d6;
  box-shadow: 0 10px 22px rgba(94, 58, 41, 0.09);
  color: #6b5b4c;
}

.app-settings-hero-icon svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
}

.app-settings-hero-copy > span {
  color: #cf5627;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.app-settings-hero-copy h1 {
  margin: 3px 0 0;
  color: #17262b;
  font-size: 28px;
  line-height: 1.08;
}

.app-settings-back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 15px 0 12px;
  border: 1px solid rgba(207, 86, 39, 0.35);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: #93401f;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease,
    transform 150ms ease;
}

.app-settings-back span {
  font-size: 19px;
  line-height: 1;
}

.app-settings-back:hover,
.app-settings-back:focus-visible {
  border-color: rgba(207, 86, 39, 0.58);
  background: #fff;
  outline: 2px solid rgba(231, 101, 48, 0.27);
  outline-offset: 2px;
  transform: translateX(-1px);
}

.app-settings-sections {
  display: grid;
  gap: 14px;
  margin-top: 20px;
}

.app-settings-card {
  --settings-accent: #e76530;
  --settings-accent-color: #d85624;
  --settings-accent-light: #fff0e8;
  --settings-accent-soft: #fff8f3;
  --settings-accent-border: rgba(216, 86, 36, 0.28);
  --settings-accent-focus: rgba(231, 101, 48, 0.24);
  position: relative;
  box-sizing: border-box;
  padding: 18px;
  overflow: hidden;
  border: 1px solid rgba(43, 70, 77, 0.12);
  border-radius: 23px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 27px rgba(72, 58, 45, 0.1);
  backdrop-filter: blur(2px);
}

.app-settings-card::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 5px;
  background: var(--settings-accent);
  content: "";
}

.app-settings-card-screen,
.app-settings-card-help {
  --settings-accent: #2d6e7b;
  --settings-accent-color: #286a77;
  --settings-accent-light: #dfeff1;
  --settings-accent-soft: #f3f9fa;
  --settings-accent-border: rgba(45, 110, 123, 0.28);
  --settings-accent-focus: rgba(45, 110, 123, 0.24);
}

.app-settings-card-vibration {
  --settings-accent: #d7942f;
  --settings-accent-color: #a66a17;
  --settings-accent-light: #faecd3;
  --settings-accent-soft: #fffaf0;
  --settings-accent-border: rgba(166, 106, 23, 0.28);
  --settings-accent-focus: rgba(215, 148, 47, 0.24);
}

.app-settings-card-language {
  --settings-accent: #8066a2;
  --settings-accent-color: #725895;
  --settings-accent-light: #ede7f4;
  --settings-accent-soft: #faf7fd;
  --settings-accent-border: rgba(128, 102, 162, 0.28);
  --settings-accent-focus: rgba(128, 102, 162, 0.24);
}

.app-settings-card-note-naming {
  --settings-accent: #a18c74;
  --settings-accent-color: #6b5b4c;
  --settings-accent-light: #ece2d6;
  --settings-accent-soft: #faf6f0;
  --settings-accent-border: rgba(107, 91, 76, 0.24);
  --settings-accent-focus: rgba(107, 91, 76, 0.24);
}

.app-settings-card-backup {
  --settings-accent: #e76530;
  --settings-accent-color: #d85624;
  --settings-accent-light: #fff0e8;
  --settings-accent-soft: #fff8f3;
  --settings-accent-border: rgba(216, 86, 36, 0.28);
  --settings-accent-focus: rgba(231, 101, 48, 0.24);
}

.app-settings-card-danger {
  border-color: rgba(151, 47, 38, 0.2);
  background: rgba(255, 250, 248, 0.92);
}

.app-settings-card-danger::before {
  background: #a13c32;
}

.app-settings-storage-controls {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 0;
  margin: 16px 0 0;
  border: 0;
}

.app-settings-section-heading {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  text-align: left;
}

.app-settings-delete-disclosure summary {
  padding: 0 16px 0 0;
  margin: 0;
  border-radius: 12px;
  list-style: none;
  cursor: pointer;
  transition: background .18s ease;
}

.app-settings-delete-disclosure summary::-webkit-details-marker { display: none; }
.app-settings-delete-disclosure summary::marker { content: ""; }
.app-settings-delete-disclosure summary:hover { background: #faefeb; }
.app-settings-delete-disclosure summary:focus-visible {
  background: #faefeb;
  outline: 2px solid rgba(151, 47, 38, .4);
  outline-offset: 3px;
}
.app-settings-delete-disclosure summary[aria-disabled="true"] { cursor: default; }
.app-settings-delete-heading { grid-template-columns: 48px minmax(0, 1fr) 32px; }
.app-settings-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #96362e;
  background: #f7e5e1;
}
.app-settings-chevron svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform .18s ease;
}
.app-settings-delete-disclosure[open] .app-settings-chevron { background: #efd7d1; }
.app-settings-delete-disclosure[open] .app-settings-chevron svg { transform: rotate(180deg); }

.app-settings-section-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 15px;
}

.app-settings-language-icon {
  grid-template-columns: 1fr;
  align-content: center;
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
  line-height: 1;
}

.app-settings-language-icon strong {
  font-size: 13px;
}

.app-settings-language-icon small {
  margin-top: 3px;
  color: inherit;
  font-size: 10px;
  font-weight: 800;
}

.app-settings-note-naming-icon {
  grid-template-columns: auto auto;
  align-content: center;
  justify-content: center;
  gap: 5px;
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
  line-height: 1;
}

.app-settings-note-naming-icon strong {
  font-size: 16px;
  font-weight: 800;
}

.app-settings-note-naming-icon small {
  padding-left: 5px;
  border-left: 1px solid var(--settings-accent-border);
  color: inherit;
  font-size: 16px;
  font-weight: 800;
}

.app-settings-backup-icon {
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
}

.app-settings-audio-icon {
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
}

.app-settings-screen-icon,
.app-settings-vibration-icon {
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
}

.app-settings-danger-icon {
  background: #f7e5e1;
  color: #96362e;
}

.app-settings-audio-icon svg,
.app-settings-screen-icon svg,
.app-settings-vibration-icon svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.app-settings-backup-icon svg,
.app-settings-danger-icon svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.app-settings-card h2 {
  margin: 0;
  color: #1f3035;
  font-size: 16px;
  letter-spacing: 0.03em;
}

.app-settings-section-heading p {
  margin: 4px 0 0;
  color: #6c7b7f;
  font-size: 12px;
  line-height: 1.4;
}

.app-settings-control {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(43, 70, 77, 0.1);
}

.app-settings-control .select-option-dropdown--app-settings {
  --settings-select-background: var(--settings-accent-soft);
  --settings-select-border: var(--settings-accent-border);
  --settings-select-color: var(--settings-accent-color);
}

.app-settings-control >>> .select-option-dropdown--app-settings select:hover,
.app-settings-control >>> .select-option-dropdown--app-settings select:focus-visible {
  border-color: var(--settings-accent);
  outline-color: var(--settings-accent-focus);
}

.app-settings-control-hint {
  margin: 9px 0 0;
  color: #6c7b7f;
  font-size: 12px;
  line-height: 1.4;
}

.app-settings-card-backup .app-settings-storage-controls >>> .storage-disclosure,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings {
  border-color: var(--settings-accent-border);
  background: var(--settings-accent-soft);
}

.app-settings-card-backup .app-settings-storage-controls >>> .storage-disclosure > summary,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings summary,
.app-settings-card-backup .app-settings-storage-controls >>> dd,
.app-settings-card-backup .app-settings-storage-controls >>> .prestige-confirm strong,
.app-settings-card-backup .app-settings-storage-controls >>> .import-loading {
  color: var(--settings-accent-color);
}

.app-settings-card-backup .app-settings-storage-controls >>> .storage-chevron,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-chevron,
.app-settings-card-backup .app-settings-storage-controls >>> .overview-status,
.app-settings-card-backup .app-settings-storage-controls >>> .prestige-track,
.app-settings-card-backup .app-settings-storage-controls >>> .import-progress-track {
  color: var(--settings-accent-color);
  background: var(--settings-accent-light);
}

.app-settings-card-backup .app-settings-storage-controls >>> summary:hover,
.app-settings-card-backup .app-settings-storage-controls >>> summary:focus-visible,
.app-settings-card-backup .app-settings-storage-controls >>> details[open] > summary .storage-chevron,
.app-settings-card-backup .app-settings-storage-controls >>> details[open] > summary .save-data-chevron {
  background: var(--settings-accent-light);
}

.app-settings-card-backup .app-settings-storage-controls >>> .storage-content,
.app-settings-card-backup .app-settings-storage-controls >>> dl > div,
.app-settings-card-backup .app-settings-storage-controls >>> .total,
.app-settings-card-backup .app-settings-storage-controls >>> .prestige-confirm,
.app-settings-card-backup .app-settings-storage-controls >>> .export-result,
.app-settings-card-backup .app-settings-storage-controls >>> .preview-card.result {
  border-color: var(--settings-accent-border);
}

.app-settings-card-backup .app-settings-storage-controls >>> .prestige-fill,
.app-settings-card-backup .app-settings-storage-controls >>> .import-progress-fill,
.app-settings-card-backup .app-settings-storage-controls >>> .prestige-actions button,
.app-settings-card-backup .app-settings-storage-controls >>> .prestige-operation button {
  border-color: var(--settings-accent-color);
  background: var(--settings-accent-color);
}

.app-settings-card-backup .app-settings-storage-controls >>> .prestige-secondary,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings .export,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings .merge,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings .import,
.app-settings-card-backup .app-settings-storage-controls >>> .save-data-manager--app-settings .cancel {
  border-color: var(--settings-accent-border);
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
}

.app-settings-card-backup .app-settings-storage-controls >>> summary:focus-visible,
.app-settings-card-backup .app-settings-storage-controls >>> button:focus-visible {
  outline-color: var(--settings-accent-focus);
}

.app-settings-card-backup .app-settings-storage-controls >>> .preview-card.result {
  background: var(--settings-accent-soft);
}

.app-settings-volume-control label,
.app-settings-volume-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-settings-volume-control label {
  color: #53686d;
  font-size: 12px;
  font-weight: 700;
}

.app-settings-volume-control output {
  min-width: 54px;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--settings-accent-light);
  color: var(--settings-accent-color);
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.app-settings-volume-control input[type="range"] {
  width: 100%;
  height: 28px;
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  accent-color: var(--settings-accent);
}

.app-settings-volume-control input[type="range"]:focus-visible {
  border-radius: 999px;
  outline: 2px solid var(--settings-accent-focus);
  outline-offset: 3px;
}

.app-settings-volume-scale {
  margin-top: -2px;
  color: #819095;
  font-size: 10px;
}

.app-settings-danger-body {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(151, 47, 38, 0.14);
  text-align: left;
}

.app-settings-preserved-note,
.app-settings-delete-description,
.app-settings-confirmation p,
.app-settings-reset-message p {
  margin: 0;
  color: #65777b;
  font-size: 12px;
  line-height: 1.5;
}

.app-settings-delete-description { margin-bottom: 12px; }

.app-settings-danger-button,
.app-settings-secondary-button {
  min-height: 44px;
  padding: 10px 15px;
  border-radius: 13px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease,
    box-shadow 150ms ease, transform 150ms ease;
}

.app-settings-menu input:disabled,
.app-settings-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.app-settings-danger-button {
  border: 1px solid #96362e;
  background: #96362e;
  color: #fff;
  box-shadow: 0 7px 14px rgba(123, 42, 35, 0.16);
}

.app-settings-danger-button-outline {
  width: 100%;
  margin-top: 12px;
  background: #fff8f6;
  color: #8e3029;
  box-shadow: none;
}

.app-settings-danger-button:hover,
.app-settings-danger-button:focus-visible {
  border-color: #762820;
  background: #7f2d26;
  outline: 2px solid rgba(161, 60, 50, 0.24);
  outline-offset: 2px;
  transform: translateY(-1px);
}

.app-settings-danger-button-outline:hover,
.app-settings-danger-button-outline:focus-visible {
  background: #fbe8e4;
  color: #762820;
}

.app-settings-secondary-button {
  border: 1px solid rgba(71, 91, 96, 0.24);
  background: rgba(255, 255, 255, 0.9);
  color: #435a60;
}

.app-settings-secondary-button:hover,
.app-settings-secondary-button:focus-visible {
  border-color: rgba(45, 110, 123, 0.52);
  background: #fff;
  outline: 2px solid rgba(45, 110, 123, 0.18);
  outline-offset: 2px;
  transform: translateY(-1px);
}

.app-settings-confirmation,
.app-settings-reset-message {
  padding: 14px;
  border: 1px solid rgba(151, 47, 38, 0.18);
  border-radius: 16px;
  background: rgba(253, 237, 233, 0.7);
}

.app-settings-confirmation-final {
  border-color: rgba(151, 47, 38, 0.35);
  background: #f9e1dc;
}

.app-settings-confirmation h3 {
  margin: 0 0 6px;
  color: #792b25;
  font-size: 14px;
}

.app-settings-confirmation h3:focus {
  outline: none;
}

.app-settings-backup-hint {
  margin-top: 9px !important;
  padding: 9px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: #654840 !important;
  font-weight: 700;
}

.app-settings-danger-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 13px;
}

.app-settings-danger-button-final {
  background: #7f2923;
}

.app-settings-reset-success {
  border-color: rgba(45, 110, 123, 0.28);
  background: #e5f1f2;
  color: #265f6a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.5;
}

.app-settings-reset-error {
  color: #792b25;
}

.app-settings-reset-error .app-settings-secondary-button {
  margin-top: 12px;
}

@media (min-width: 650px) {
  .app-settings-shell {
    padding-right: 26px;
    padding-left: 26px;
  }

  .app-settings-card {
    padding: 21px 22px;
  }
}

@media (max-width: 370px) {
  .app-settings-shell {
    padding-right: 12px;
    padding-left: 12px;
  }

  .app-settings-hero {
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 12px;
  }

  .app-settings-hero-icon {
    width: 54px;
    height: 54px;
    border-radius: 17px;
  }

  .app-settings-hero-copy h1 {
    font-size: 24px;
  }

  .app-settings-card {
    padding: 15px 14px 16px 16px;
  }

  .app-settings-danger-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-settings-delete-disclosure summary,
  .app-settings-chevron svg,
  .app-settings-back,
  .app-settings-danger-button,
  .app-settings-secondary-button {
    transition: none;
  }
}
</style>
