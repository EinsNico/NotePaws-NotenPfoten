<template>
  <details
    ref="details"
    class="save-data-manager"
    :class="{ 'save-data-manager--app-settings': appearance === 'app-settings' }">
    <summary @click="isBusy && $event.preventDefault()">
      <span class="save-data-summary-title">{{$t("SAVE_DATA_TITLE")}}</span>
      <span class="save-data-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
    </summary>
    <div class="save-data-content">
      <p class="description">{{$t("SAVE_DATA_DESCRIPTION")}}</p>
      <div class="save-data-actions">
        <button type="button" class="export" :disabled="isBusy" @click="exportBackup">
          {{$t("SAVE_DATA_EXPORT")}}
        </button>
        <button type="button" class="import" :disabled="isBusy" @click="chooseBackupFile">
          {{$t("SAVE_DATA_IMPORT")}}
        </button>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".json,application/json"
          @change="loadBackupFile"
        />
      </div>

      <p v-if="statusMessage && !showImportActivity && !exportLoading && !exportResult" class="status-message" role="status">
        {{statusMessage}}
      </p>
      <section v-if="exportResult" class="preview-card export-result" role="status">
        <strong>{{$t("SAVE_DATA_EXPORT_READY")}}</strong>
        <span>{{exportResult.filename}}</span>
        <span>{{$t("SAVE_DATA_EXPORT_PROGRESS", { count: exportResult.recordCount,
          size: formatFileSize(exportResult.bytesWritten) })}}</span>
        <button type="button" class="cancel" @click="exportResult = null">OK</button>
      </section>
      <p v-if="errorMessage" class="error-message" role="alert">
        {{errorMessage}}
      </p>

      <section v-if="stagedPreview" class="import-preview" aria-live="polite">
        <h5>{{$t("SAVE_DATA_PREVIEW_TITLE")}}</h5>
        <dl class="backup-meta">
          <div>
            <dt>{{$t("SAVE_DATA_CREATED_AT")}}</dt>
            <dd>{{formatDate(stagedPreview.createdAt)}}</dd>
          </div>
          <div>
            <dt>{{$t("SAVE_DATA_APP_VERSION")}}</dt>
            <dd>{{stagedPreview.appVersion}}</dd>
          </div>
          <div>
            <dt>{{$t("SAVE_DATA_STAGED_FILE_SIZE")}}</dt>
            <dd>{{formatFileSize(stagedPreview.fileSize)}}</dd>
          </div>
        </dl>
        <div class="preview-card">
          <strong>{{$t("SAVE_DATA_IN_BACKUP")}}</strong>
          <span>{{$t("SAVE_DATA_NORMAL_ROUNDS", { count: stagedPreview.normalRounds })}}</span>
          <span>{{$t("SAVE_DATA_ADAPTIVE_SCREEN_ATTEMPTS", { count: stagedPreview.screenPlayedNotes })}}</span>
          <span>{{$t("SAVE_DATA_ADAPTIVE_SCREEN_NOTES", { count: stagedPreview.screenEvaluations })}}</span>
          <span>{{$t("SAVE_DATA_ADAPTIVE_MIDI_ATTEMPTS", { count: stagedPreview.midiPlayedNotes })}}</span>
          <span>{{$t("SAVE_DATA_ADAPTIVE_MIDI_NOTES", { count: stagedPreview.midiEvaluations })}}</span>
          <span>{{$t("SAVE_DATA_NOTE_FLOW_SCREEN_ROUNDS", { count: stagedPreview.noteFlowScreenRounds })}}</span>
          <span>{{$t("SAVE_DATA_NOTE_FLOW_MIDI_ROUNDS", { count: stagedPreview.noteFlowMidiRounds })}}</span>
          <span>{{$t("SAVE_DATA_CHORD_MIDI_ROUNDS", { count: stagedPreview.chordMidiRounds })}}</span>
          <span>{{$t("SAVE_DATA_RHYTHM_BARS", { count: stagedPreview.rhythmBars })}}</span>
          <span v-if="stagedPreview.dailyTaskDays !== undefined">{{$tc("SAVE_DATA_DAILY_TASK_DAYS", stagedPreview.dailyTaskDays)}}</span>
        </div>
        <template v-if="!showReplaceConfirmation && !showMergeConfirmation">
          <p class="merge-detail">{{$t("SAVE_DATA_STAGED_MERGE_HINT")}}</p>
          <div v-if="stagedMergePreview" class="preview-card result" role="status">
            <strong>{{$t("SAVE_DATA_STAGED_COMPARE_TITLE")}}</strong>
            <span>{{$t("SAVE_DATA_STAGED_COMPARE_NEW", { count: stagedMergePreview.total.new })}}</span>
            <span>{{$t("SAVE_DATA_STAGED_COMPARE_DUPLICATES", { count: stagedMergePreview.total.duplicates })}}</span>
            <span v-if="stagedMergePreview.total.conflicts > 0" class="conflict">
              {{$t("SAVE_DATA_STAGED_COMPARE_CONFLICTS", { count: stagedMergePreview.total.conflicts })}}
            </span>
            <small>{{$t("SAVE_DATA_STAGED_COMPARE_SCOPE")}}</small>
          </div>
          <div class="preview-actions">
            <button type="button" class="merge" :disabled="isBusy || !!stagedMergePreview"
              @click="compareStagedBackup">
              {{$t("SAVE_DATA_STAGED_COMPARE")}}
            </button>
            <button type="button" class="merge"
              :disabled="isBusy || !stagedMergePreview || stagedMergePreview.total.conflicts > 0"
              @click="showMergeConfirmation = true">
              {{$t("SAVE_DATA_MERGE")}}
            </button>
            <button type="button" class="replace" :disabled="isBusy"
              @click="showReplaceConfirmation = true">
              {{$t("SAVE_DATA_REPLACE")}}
            </button>
            <button type="button" class="cancel" :disabled="isBusy && !previewBusy" @click="cancelImport">
              {{$t("CANCEL")}}
            </button>
          </div>
        </template>
        <template v-else-if="showMergeConfirmation">
          <h5>{{$t("SAVE_DATA_STAGED_MERGE_TITLE")}}</h5>
          <p class="replace-warning">{{$t("SAVE_DATA_STAGED_MERGE_WARNING")}}</p>
          <div class="preview-actions">
            <button type="button" class="merge confirm" :disabled="isBusy"
              @click="applyStagedMerge">
              {{$t("SAVE_DATA_STAGED_CONFIRM_MERGE")}}
            </button>
            <button type="button" class="cancel" :disabled="isBusy"
              @click="showMergeConfirmation = false">
              {{$t("BACK")}}
            </button>
          </div>
        </template>
        <template v-else>
          <h5>{{$t("SAVE_DATA_REPLACE_TITLE")}}</h5>
          <p class="replace-warning">{{$t("SAVE_DATA_REPLACE_WARNING")}}</p>
          <div class="preview-actions">
            <button type="button" class="replace confirm" :disabled="isBusy"
              @click="applyStagedReplace">
              {{$t("SAVE_DATA_CONFIRM_REPLACE")}}
            </button>
            <button type="button" class="cancel" :disabled="isBusy"
              @click="showReplaceConfirmation = false">
              {{$t("BACK")}}
            </button>
          </div>
        </template>
      </section>

      <div class="backup-activity">
        <div v-if="showImportActivity" class="import-loading" role="status" aria-live="polite">
          <div class="import-loading-heading">
            <span>{{importActivityMessage}}</span>
            <strong v-if="importLoading && importProgress !== null && importProgress < 100">
              {{importProgress}} %
            </strong>
          </div>
          <div class="import-progress-track" role="progressbar"
            :aria-label="importActivityMessage"
            :aria-valuemin="0" :aria-valuemax="100"
            :aria-valuenow="importLoading && importProgress !== null && importProgress < 100 ? importProgress : undefined">
            <div class="import-progress-fill"
              :class="{ 'is-indeterminate': !importLoading || importProgress === null || importProgress === 100 }"
              :style="importLoading && importProgress !== null && importProgress < 100 ? { width: `${importProgress}%` } : null">
            </div>
          </div>
        </div>
        <div v-if="exportLoading" class="import-loading export-loading" role="status" aria-live="polite">
          <div class="import-loading-heading"><span>{{exportActivityMessage}}</span></div>
          <div class="import-progress-track" role="progressbar" :aria-label="exportActivityMessage">
            <div class="import-progress-fill is-indeterminate"></div>
          </div>
          <p v-if="exportProgress.phase === 'writing' || exportProgress.phase === 'finalizing'">
            {{$t("SAVE_DATA_EXPORT_PROGRESS", { count: exportProgress.recordCount,
              size: formatFileSize(exportProgress.bytesWritten) })}}
          </p>
        </div>
        <button v-if="importLoading || (importPreparationBusy && !importCommitting)"
          type="button" class="cancel import-abort"
          :disabled="importCancelRequested" @click="requestImportAbort">
          {{$t("CANCEL")}}
        </button>
      </div>
    </div>
  </details>
</template>

<script>
import {
  createIndexedDbSaveDataExport,
  createSaveDataFilename,
  exceedsUnstreamedImportLimit,
  streamIndexedDbSaveDataBackup
} from "../model/SaveDataFiles";
import {
  stageBrowserSaveDataFile,
  stageNativeSaveDataFile
} from "../model/SaveDataImportStaging";
import { markSaveDataImportSuccess } from "../model/SaveDataImportNotice";
import { openLearningDatabasePrototype } from "../model/LearningDatabasePrototype";
import { activeLearningDatabaseName } from "../model/LearningDatabaseGeneration";
import { previewStagedIndexedDbMerge } from "../model/SaveDataLargeMergePreview";
import {
  createShadowLearningDatabase,
  discardInactiveShadowLearningDatabase
} from "../model/LearningDatabaseGeneration";
import { prepareStagedBackupInShadow } from "../model/SaveDataShadowPreparation";
import { prepareStagedLocalSaveDataPlan } from "../model/SaveDataShadowLocalPlan";
import { prepareMergedBackupInShadow } from "../model/SaveDataLargeMergePreparation";
import { prepareMergedLocalSaveDataPlan } from "../model/SaveDataLargeMergeLocalPlan";
import { sealMergedBackupForCommit } from "../model/SaveDataLargeMergeSeal";
import { commitStagedShadowImport, flushCurrentWrites } from "../model/SaveDataShadowCommit";
import { hasPersistenceFailure } from "../model/PersistenceFeedback";
import Statistics from "../model/Statistics";

export default {
  name: "SaveDataManager",
  props: {
    appearance: {
      type: String,
      default: "default"
    }
  },
  data() {
    return {
      stagedPreview: null,
      stagedImport: null,
      stagedMergePreview: null,
      mergePreviewRun: 0,
      previewBusy: false,
      showReplaceConfirmation: false,
      showMergeConfirmation: false,
      isBusy: false,
      exportLoading: false,
      exportProgress: { phase: "selecting", bytesWritten: 0, recordCount: 0 },
      exportResult: null,
      importLoading: false,
      importProgress: null,
      importPreparationBusy: false,
      importCommitting: false,
      importCancelRequested: false,
      importDisposed: false,
      statusMessage: "",
      errorMessage: "",
      reloadTimer: null
    };
  },
  computed: {
    exportActivityMessage() {
      const messages = {
        selecting: "SAVE_DATA_EXPORT_SELECTING",
        preparing: "SAVE_DATA_EXPORT_PREPARING",
        writing: "SAVE_DATA_EXPORT_WRITING",
        finalizing: "SAVE_DATA_EXPORT_FINALIZING"
      };
      return this.$t(messages[this.exportProgress.phase] || messages.preparing);
    },
    showImportActivity() {
      return this.importLoading || this.importPreparationBusy || this.previewBusy;
    },
    importActivityMessage() {
      if (this.importCancelRequested) return this.$t("SAVE_DATA_IMPORT_CANCELLING");
      if (this.importLoading) {
        return this.$t(this.importProgress === 100
          ? "SAVE_DATA_CHECKING" : "SAVE_DATA_READING");
      }
      return this.statusMessage || this.$t("SAVE_DATA_IMPORT_APPLYING");
    },
  },
  watch: {
    isBusy() {
      this.$emit("busy-change", this.isBusy || this.reloadTimer != null);
    },
    reloadTimer() {
      this.$emit("busy-change", this.isBusy || this.reloadTimer != null);
    }
  },
  methods: {
    handleBack() {
      if (this.isBusy || this.reloadTimer != null) return true;
      if (this.showMergeConfirmation) {
        this.showMergeConfirmation = false;
        return true;
      }
      if (this.showReplaceConfirmation) {
        this.showReplaceConfirmation = false;
        return true;
      }
      if (this.stagedPreview) {
        this.cancelImport();
        return true;
      }
      if (this.$refs.details && this.$refs.details.open) {
        this.$refs.details.open = false;
        return true;
      }
      return false;
    },
    async prepareCurrentStorage() {
      this.$emit("before-storage-action");
      if (Statistics && Array.isArray(Statistics.pendingRounds) && Statistics.pendingRounds.length) {
        await Statistics.retryPendingRounds();
      }
      if (hasPersistenceFailure("options") || hasPersistenceFailure("free-rounds")
        || (Statistics && Array.isArray(Statistics.pendingRounds) && Statistics.pendingRounds.length)) {
        const error = new Error("Current settings or round results have not been saved.");
        error.key = "SAVE_DATA_UNSAVED_CHANGES";
        throw error;
      }
    },
    clearMessages() {
      this.statusMessage = "";
      this.errorMessage = "";
      this.exportResult = null;
    },
    async exportBackup() {
      this.clearMessages();
      this.isBusy = true;
      this.exportLoading = true;
      this.exportProgress = { phase: window.cordova ? "selecting" : "preparing",
        bytesWritten: 0, recordCount: 0 };
      try {
        await new Promise(resolve => setTimeout(resolve, 0));
        await this.prepareCurrentStorage();
        const nativeStreamWriter = this.getNativeStreamWriter();
        if (window.cordova) {
          if (!nativeStreamWriter) {
            throw new Error("Android backup file writer is unavailable.");
          }
          const saved = await this.saveWithNativeStreamWriter(nativeStreamWriter);
          if (saved) this.statusMessage = this.$t("SAVE_DATA_EXPORT_READY");
          return;
        }
        const exportData = await createIndexedDbSaveDataExport(localStorage);
        const blob = new Blob([exportData.text], { type: exportData.mimeType });
        const file = typeof File === "function"
          ? new File([blob], exportData.filename, { type: exportData.mimeType })
          : null;
        const shareData = file
          ? { files: [file], title: this.$t("APP_BRAND_NAME") }
          : null;
        if (
          shareData
          && navigator.share
          && navigator.canShare
          && navigator.canShare(shareData)
        ) {
          try {
            await navigator.share(shareData);
          } catch (error) {
            if (error && error.name === "AbortError") return;
            this.downloadBlob(blob, exportData.filename);
          }
        } else {
          this.downloadBlob(blob, exportData.filename);
        }
        this.statusMessage = this.$t("SAVE_DATA_EXPORT_STARTED");
      } catch (error) {
        this.errorMessage = this.$t(error && error.key === "SAVE_DATA_UNSAVED_CHANGES"
          ? error.key : error === "backup-file-verification-failed"
            ? "SAVE_DATA_EXPORT_VERIFICATION_ERROR" : "SAVE_DATA_EXPORT_ERROR");
      } finally {
        this.exportLoading = false;
        this.isBusy = false;
      }
    },
    getNativeStreamWriter() {
      const fileSaver = this.getNativeFileSaver();
      return fileSaver
        && typeof fileSaver.openWriteStream === "function"
        && typeof fileSaver.writeChunk === "function"
        && typeof fileSaver.finishWriteStream === "function"
        && typeof fileSaver.abortWriteStream === "function"
        ? fileSaver : null;
    },
    async saveWithNativeStreamWriter(writer) {
      const createdAt = new Date();
      const selected = await new Promise((resolve, reject) => {
        writer.openWriteStream(
          createSaveDataFilename(createdAt), "application/json", resolve, reject
        );
      });
      if (selected && selected.status === "cancelled") return false;
      if (!selected || selected.status !== "selected" || !selected.token) {
        throw new Error("Android did not open a backup destination.");
      }
      try {
        const result = await streamIndexedDbSaveDataBackup(chunk => (
          new Promise((resolve, reject) => {
            writer.writeChunk(selected.token, chunk, result => {
              if (result && result.status === "written") resolve();
              else reject(new Error("Android did not confirm the backup chunk."));
            }, reject);
          })
        ), localStorage, {
          createdAt: createdAt.toISOString(),
          onProgress: progress => { this.exportProgress = progress; }
        });
        const completed = await new Promise((resolve, reject) => {
          writer.finishWriteStream(selected.token, result.bytesWritten, resolve, reject);
        });
        if (!completed || completed.status !== "saved" || !completed.verified
          || completed.bytesWritten !== result.bytesWritten) {
          throw new Error("Android did not finish the backup file.");
        }
        this.exportResult = Object.assign({}, result, {
          recordCount: Object.keys(result.counts).reduce((sum, key) => sum + result.counts[key], 0)
        });
        return true;
      } catch (error) {
        try {
          await new Promise((resolve, reject) => {
            writer.abortWriteStream(selected.token, resolve, reject);
          });
        } catch (ignored) { }
        throw error;
      }
    },
    getNativeFileSaver() {
      return window.cordova
        && window.cordova.plugins
        && window.cordova.plugins.saveDataFile
        && typeof window.cordova.plugins.saveDataFile.save === "function"
        ? window.cordova.plugins.saveDataFile
        : null;
    },
    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async chooseBackupFile() {
      if (this.isBusy) return;
      this.isBusy = true;
      this.importCancelRequested = false;
      this.clearMessages();
      await this.cancelImport();
      const nativeStreamOpener = this.getNativeStreamOpener();
      if (nativeStreamOpener) {
        try {
          const selected = await new Promise((resolve, reject) => {
            nativeStreamOpener.openStream("application/json", resolve, reject);
          });
          if (!selected || selected.status !== "selected") return;
          this.beginImportLoading();
          const stream = {
            openStream: (mimeType, resolve) => resolve(selected),
            readChunk: (...args) => nativeStreamOpener.readChunk(...args),
            closeStream: (...args) => nativeStreamOpener.closeStream(...args)
          };
          // A small incoming file can still be merged into a huge database.
          // Always stage it; never materialize the active history for a preview.
          await this.prepareStagedBackup(stageNativeSaveDataFile(stream, {
            onProgress: (loaded, total) => this.updateImportProgress(loaded, total),
            shouldContinue: () => !this.importCancelRequested
          }));
          this.checkImportAborted();
        } catch (error) {
          if (error && error.name === "AbortError") {
            await this.cancelImport();
            this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLED");
          } else {
            this.errorMessage = error && error.message === "file-too-large"
              ? this.$t("SAVE_DATA_ERROR_TOO_LARGE")
              : this.$t("SAVE_DATA_READ_ERROR");
          }
        } finally {
          this.importLoading = false;
          this.importCancelRequested = false;
          this.isBusy = false;
        }
        return;
      }
      const nativeFileOpener = this.getNativeFileOpener();
      if (nativeFileOpener) {
        try {
          const result = await this.openWithNativeFilePicker(nativeFileOpener);
          if (!result || result.status !== "selected") {
            return;
          }
          this.beginImportLoading();
          await this.prepareLoadedBackup(result.content, result.size);
          this.checkImportAborted();
        } catch (error) {
          if (error && error.name === "AbortError") {
            await this.cancelImport();
            this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLED");
          } else {
            this.errorMessage = error === "file-too-large"
              ? this.$t("SAVE_DATA_ERROR_TOO_LARGE")
              : this.$t("SAVE_DATA_READ_ERROR");
          }
        } finally {
          this.importLoading = false;
          this.importCancelRequested = false;
          this.isBusy = false;
        }
        return;
      }
      this.$refs.fileInput.value = "";
      this.$refs.fileInput.click();
      this.isBusy = false;
    },
    getNativeFileOpener() {
      const filePlugin = this.getNativeFileSaver();
      return filePlugin && typeof filePlugin.open === "function"
        ? filePlugin
        : null;
    },
    getNativeStreamOpener() {
      const filePlugin = this.getNativeFileSaver();
      return filePlugin && typeof filePlugin.openStream === "function"
        && typeof filePlugin.readChunk === "function"
        && typeof filePlugin.closeStream === "function"
        ? filePlugin : null;
    },
    openWithNativeFilePicker(fileOpener) {
      return new Promise((resolve, reject) => {
        fileOpener.open("application/json", resolve, reject);
      });
    },
    async loadBackupFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file || this.isBusy) {
        return;
      }
      this.clearMessages();
      this.isBusy = true;
      this.importCancelRequested = false;
      await this.cancelImport();
      this.beginImportLoading();
      try {
        await this.prepareStagedBackup(stageBrowserSaveDataFile(file, {
          onProgress: (loaded, total) => this.updateImportProgress(loaded, total),
          shouldContinue: () => !this.importCancelRequested
        }));
        this.checkImportAborted();
      } catch (error) {
        if (error && error.name === "AbortError") {
          await this.cancelImport();
          this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLED");
        } else {
          this.errorMessage = this.$t("SAVE_DATA_READ_ERROR");
        }
      } finally {
        this.importLoading = false;
        this.importCancelRequested = false;
        this.isBusy = false;
      }
    },
    requestImportAbort() {
      if ((!this.importLoading && !this.importPreparationBusy)
        || this.importCommitting || this.importCancelRequested) return;
      this.importCancelRequested = true;
      this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLING");
    },
    checkImportAborted() {
      if (!this.importCancelRequested) return;
      const error = new Error("The backup import was cancelled.");
      error.name = "AbortError";
      throw error;
    },
    beginImportLoading() {
      this.importProgress = null;
      this.importLoading = true;
    },
    updateImportProgress(loaded, total) {
      if (!Number.isFinite(total) || total <= 0) return;
      const percent = Math.max(0, Math.min(100, Math.floor(loaded * 100 / total)));
      if (percent !== this.importProgress) this.importProgress = percent;
    },
    async prepareStagedBackup(stagingPromise) {
      const result = await stagingPromise;
      if (!result) return;
      try {
        if (this.importDisposed) {
          const error = new Error("The backup import was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        this.checkImportAborted();
        this.stagedPreview = await result.staging.readPreview();
        if (this.importDisposed) {
          const error = new Error("The backup import was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        this.checkImportAborted();
        this.stagedImport = result.staging;
        this.stagedMergePreview = null;
      } catch (error) {
        try { await result.staging.clear(); } catch (ignored) { }
        result.staging.close();
        throw error;
      }
    },
    async checkStagedImportCurrent(staging, preview) {
      const isCurrent = () => !this.importDisposed
        && this.stagedImport === staging && this.stagedPreview === preview;
      if (isCurrent() && typeof staging.assertSessionIdentity === "function") {
        await staging.assertSessionIdentity();
      }
      if (!isCurrent()) {
        const error = new Error("The selected backup import session has changed.");
        error.name = "StagedImportSessionError";
        throw error;
      }
    },
    async compareStagedBackup() {
      if (!this.stagedImport || !this.stagedPreview || this.isBusy) return;
      this.clearMessages();
      this.isBusy = true;
      this.previewBusy = true;
      this.statusMessage = this.$t("SAVE_DATA_STAGED_COMPARING");
      const run = ++this.mergePreviewRun;
      const staging = this.stagedImport;
      const selectedPreview = this.stagedPreview;
      let database = null;
      try {
        // Let Vue paint the local loading bar before starting database work.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (this.mergePreviewRun !== run) return;
        await this.checkStagedImportCurrent(staging, selectedPreview);
        database = await openLearningDatabasePrototype({
          name: activeLearningDatabaseName()
        });
        const preview = await previewStagedIndexedDbMerge(
          staging, database, () => this.mergePreviewRun === run
        );
        await this.checkStagedImportCurrent(staging, selectedPreview);
        if (this.mergePreviewRun === run) this.stagedMergePreview = preview;
      } catch (error) {
        if (this.mergePreviewRun === run && (!error || error.name !== "AbortError")) {
          this.errorMessage = this.$t(error && error.name === "StagedImportSessionError"
            ? "SAVE_DATA_STAGED_SESSION_CHANGED" : "SAVE_DATA_STAGED_COMPARE_ERROR");
        }
      } finally {
        if (database) database.close();
        this.previewBusy = false;
        this.isBusy = false;
        this.statusMessage = "";
        if (this.mergePreviewRun !== run) await this.cancelImport();
      }
    },
    async prepareLoadedBackup(text, fileSize) {
      if (exceedsUnstreamedImportLimit(fileSize)) {
        this.errorMessage = this.$t("SAVE_DATA_ERROR_TOO_LARGE");
        return;
      }
      // Compatibility with an older native picker that returns bounded text.
      // Even here the subsequent preview/merge must use the staging database.
      await this.prepareStagedBackup(stageBrowserSaveDataFile(
        new Blob([text], { type: "application/json" }), {
          onProgress: (loaded, total) => this.updateImportProgress(loaded, total),
          shouldContinue: () => !this.importCancelRequested
        }
      ));
      this.checkImportAborted();
    },
    async applyStagedReplace() {
      if (!this.stagedImport || this.isBusy || !this.showReplaceConfirmation) return;
      this.clearMessages();
      this.isBusy = true;
      this.importPreparationBusy = true;
      this.importCancelRequested = false;
      let shadow = null;
      let committed = false;
      const staging = this.stagedImport;
      const selectedPreview = this.stagedPreview;
      try {
        await this.checkStagedImportCurrent(staging, selectedPreview);
        await this.prepareCurrentStorage();
        this.statusMessage = this.$t("SAVE_DATA_STAGED_PREPARING");
        shadow = await createShadowLearningDatabase();
        this.checkImportAborted();
        await prepareStagedBackupInShadow(staging, shadow);
        this.checkImportAborted();
        await this.checkStagedImportCurrent(staging, selectedPreview);
        const plan = await prepareStagedLocalSaveDataPlan(staging, shadow);
        this.checkImportAborted();
        await this.checkStagedImportCurrent(staging, selectedPreview);
        this.importCommitting = true;
        this.statusMessage = this.$t("SAVE_DATA_STAGED_SWITCHING");
        const result = await commitStagedShadowImport(plan, shadow, localStorage);
        committed = Boolean(result && result.committed);
        if (!committed) throw new Error("The large backup was not committed.");
        this.statusMessage = this.$t("SAVE_DATA_IMPORT_SUCCESS");
        this.showReplaceConfirmation = false;
        this.stagedImport = null;
        this.stagedPreview = null;
        try { await staging.clear(); } catch (ignored) { }
        staging.close();
        markSaveDataImportSuccess();
        this.reloadTimer = window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        if (error && error.name === "AbortError") {
          this.showReplaceConfirmation = false;
          this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLED");
        } else {
          this.statusMessage = "";
          this.errorMessage = error && error.name === "StagedImportSessionError"
            ? this.$t("SAVE_DATA_STAGED_SESSION_CHANGED")
            : error && (error.key === "SAVE_DATA_UNSAVED_CHANGES"
              || error.message === "SAVE_DATA_UNSAVED_CHANGES")
              ? this.$t("SAVE_DATA_UNSAVED_CHANGES")
            : error && error.rollbackError
            ? this.$t("SAVE_DATA_STAGED_RECOVERY_ERROR")
            : error && /safe local storage limit/.test(error.message || "")
              ? this.$t("SAVE_DATA_STAGED_LOCAL_LIMIT")
            : this.$t("SAVE_DATA_STAGED_IMPORT_ERROR");
        }
      } finally {
        if (shadow) {
          if (committed) shadow.database.close();
          else {
            try { await discardInactiveShadowLearningDatabase(shadow); }
            catch (ignored) { shadow.database.close(); }
          }
        }
        this.importPreparationBusy = false;
        this.importCommitting = false;
        this.importCancelRequested = false;
        this.isBusy = false;
      }
    },
    async applyStagedMerge() {
      if (!this.stagedImport || !this.stagedMergePreview
        || this.stagedMergePreview.total.conflicts > 0
        || this.isBusy || !this.showMergeConfirmation) return;
      this.clearMessages();
      this.isBusy = true;
      this.importPreparationBusy = true;
      this.importCancelRequested = false;
      let shadow = null;
      let activeDatabase = null;
      let committed = false;
      const staging = this.stagedImport;
      const selectedPreview = this.stagedPreview;
      try {
        await this.checkStagedImportCurrent(staging, selectedPreview);
        await this.prepareCurrentStorage();
        this.statusMessage = this.$t("SAVE_DATA_STAGED_PREPARING");
        await flushCurrentWrites();
        this.checkImportAborted();
        activeDatabase = await openLearningDatabasePrototype({
          name: activeLearningDatabaseName()
        });
        this.checkImportAborted();
        shadow = await createShadowLearningDatabase();
        this.checkImportAborted();
        const summary = await prepareMergedBackupInShadow(
          staging, activeDatabase, shadow,
          () => !this.importCancelRequested
        );
        this.checkImportAborted();
        await this.checkStagedImportCurrent(staging, selectedPreview);
        const plan = await prepareMergedLocalSaveDataPlan(
          staging, shadow, summary, localStorage, activeDatabase
        );
        this.checkImportAborted();
        await this.checkStagedImportCurrent(staging, selectedPreview);
        await sealMergedBackupForCommit(
          activeDatabase, shadow, summary, plan, localStorage
        );
        this.checkImportAborted();
        await this.checkStagedImportCurrent(staging, selectedPreview);
        this.importCommitting = true;
        this.statusMessage = this.$t("SAVE_DATA_STAGED_SWITCHING");
        const result = await commitStagedShadowImport(
          plan, shadow, localStorage, { activeDatabase }
        );
        committed = Boolean(result && result.committed);
        if (!committed) throw new Error("The large merge was not committed.");
        this.statusMessage = this.$t("SAVE_DATA_IMPORT_SUCCESS");
        this.showMergeConfirmation = false;
        this.stagedImport = null;
        this.stagedPreview = null;
        this.stagedMergePreview = null;
        try { await staging.clear(); } catch (ignored) { }
        staging.close();
        markSaveDataImportSuccess();
        this.reloadTimer = window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        if (error && error.name === "AbortError") {
          this.showMergeConfirmation = false;
          this.statusMessage = this.$t("SAVE_DATA_IMPORT_CANCELLED");
        } else {
          this.showMergeConfirmation = false;
          this.statusMessage = "";
          this.errorMessage = error && error.name === "StagedImportSessionError"
            ? this.$t("SAVE_DATA_STAGED_SESSION_CHANGED")
            : error && (error.key === "SAVE_DATA_UNSAVED_CHANGES"
              || error.message === "SAVE_DATA_UNSAVED_CHANGES")
              ? this.$t("SAVE_DATA_UNSAVED_CHANGES")
            : error && error.rollbackError
            ? this.$t("SAVE_DATA_STAGED_RECOVERY_ERROR")
            : error && /Overlapping learning baseline/.test(error.message || "")
              ? this.$t("SAVE_DATA_STAGED_BASELINE_CONFLICT")
            : error && /safe local storage limit/.test(error.message || "")
              ? this.$t("SAVE_DATA_STAGED_LOCAL_LIMIT")
            : error && /Local learning progress is not in the database|Active learning progress is needed/.test(error.message || "")
              ? this.$t("SAVE_DATA_STAGED_PROGRESS_MISMATCH")
            : this.$t("SAVE_DATA_STAGED_MERGE_ERROR");
        }
      } finally {
        if (activeDatabase) activeDatabase.close();
        if (shadow) {
          if (committed) shadow.database.close();
          else {
            try { await discardInactiveShadowLearningDatabase(shadow); }
            catch (ignored) { shadow.database.close(); }
          }
        }
        this.importPreparationBusy = false;
        this.importCommitting = false;
        this.importCancelRequested = false;
        this.isBusy = false;
      }
    },
    async cancelImport() {
      if (this.previewBusy) {
        this.mergePreviewRun += 1;
        return;
      }
      const staging = this.stagedImport;
      this.stagedImport = null;
      this.stagedPreview = null;
      this.stagedMergePreview = null;
      this.showReplaceConfirmation = false;
      this.showMergeConfirmation = false;
      if (staging) {
        try { await staging.clear(); } catch (ignored) { }
        staging.close();
      }
    },
    formatDate(value) {
      const locale = this.$i18n.locale === "de" ? "de-DE" : "en-GB";
      return new Date(value).toLocaleString(locale);
    },
    formatFileSize(value) {
      if (value === null) return this.$t("SAVE_DATA_STAGED_FILE_SIZE_UNKNOWN");
      const locale = this.$i18n.locale === "de" ? "de-DE" : "en-GB";
      return `${(value / (1024 * 1024)).toLocaleString(locale, {
        maximumFractionDigits: 1
      })} MiB`;
    }
  },
  beforeDestroy() {
    this.importDisposed = true;
    this.importCancelRequested = true;
    if (this.stagedImport) {
      this.cancelImport();
    }
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
    }
  }
};
</script>

<style scoped>
.save-data-manager {
  margin: 12px 10px 3px;
  border: 1px solid #cfe3eb;
  border-radius: 10px;
  background: white;
  color: #304d59;
  text-align: left;
}

.save-data-manager summary {
  padding: 11px 12px;
  color: #315f72;
  font-size: 10pt;
  font-weight: bold;
  cursor: pointer;
}

.save-data-chevron {
  display: none;
}

.save-data-content {
  padding: 0 12px 12px;
}

.description,
.status-message,
.error-message,
.merge-detail,
.replace-warning {
  margin: 3px 0 10px;
  font-size: 9pt;
  line-height: 1.4;
}

.save-data-actions,
.preview-actions {
  display: grid;
  gap: 8px;
}

.save-data-actions {
  grid-template-columns: 1fr 1fr;
}

.save-data-manager button {
  padding: 10px 8px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
}

.save-data-manager button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.export,
.merge {
  border: 1px solid #72b4ce;
  background: #dff3fa;
  color: #204d60;
}

.import,
.cancel {
  border: 1px solid #b9cbd2;
  background: white;
  color: #304d59;
}

.replace {
  border: 1px solid #d99b82;
  background: #fff6f2;
  color: #8a3518;
}

.replace.confirm {
  background: #f7d3c4;
}

.file-input {
  display: none;
}

.status-message {
  color: #267348;
}

.import-loading {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 10px 0;
  color: #276b7c;
  font-size: 9pt;
}

.import-loading-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  margin-bottom: 8px;
}

.export-loading p { margin: 8px 0 0; }
.export-result { margin: 10px 0; border: 1px solid #b8d7dc; }
.export-result span { overflow-wrap: anywhere; }

.import-loading-heading span {
  flex: 1;
  min-width: 0;
}

.import-loading-heading strong {
  flex: none;
  white-space: nowrap;
}

.import-progress-track {
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #d5e5e8;
}

.import-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #2c7b89;
  transition: width 150ms ease;
}

.import-progress-fill.is-indeterminate {
  width: 35%;
  animation: import-progress-slide 1.2s ease-in-out infinite;
}

@keyframes import-progress-slide {
  from { transform: translateX(-100%); }
  to { transform: translateX(300%); }
}

@media (prefers-reduced-motion: reduce) {
  .import-progress-fill.is-indeterminate { animation: none; width: 100%; }
}

.import-abort {
  width: 100%;
  margin: 0 0 10px;
}

.error-message,
.conflict,
.replace-warning {
  color: #a13d1b;
}

.import-preview {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e7c9bc;
  border-radius: 10px;
  background: #fffaf7;
}

.import-preview h5 {
  margin: 0 0 10px;
  color: #8a3518;
  font-size: 10pt;
}

.backup-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin: 0 0 9px;
}

.backup-meta div,
.preview-card {
  padding: 8px;
  border-radius: 7px;
  background: white;
}

.backup-meta dt {
  color: #6c7e85;
  font-size: 8pt;
}

.backup-meta dd {
  margin: 2px 0 0;
  font-size: 9pt;
  font-weight: bold;
}

.preview-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid #ebddd7;
  font-size: 8.5pt;
}

.preview-card.result {
  border-color: #a9d5e5;
  background: #f5fcff;
}

.merge-detail {
  margin-top: 9px;
}

.preview-actions {
  grid-template-columns: 1fr 1fr;
  margin-top: 10px;
}

.preview-actions .cancel {
  grid-column: 1 / -1;
}

@media (max-width: 420px) {
  .save-data-actions,
  .backup-meta {
    grid-template-columns: 1fr;
  }
}

.save-data-manager--app-settings {
  margin: 0;
  border-color: rgba(45, 110, 123, 0.16);
  border-radius: 16px;
  background: rgba(239, 247, 247, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.save-data-manager--app-settings summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  box-sizing: border-box;
  padding: 16px;
  list-style: none;
  color: #245d69;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  transition: background .18s ease;
}

.save-data-manager--app-settings summary::-webkit-details-marker {
  display: none;
}

.save-data-manager--app-settings .save-data-summary-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.save-data-manager--app-settings summary:hover,
.save-data-manager--app-settings summary:focus-visible {
  background: rgba(45, 110, 123, 0.06);
}

.save-data-manager--app-settings summary:focus-visible {
  outline: 2px solid rgba(45, 110, 123, 0.45);
  outline-offset: 2px;
  border-radius: 14px;
}

.save-data-manager--app-settings summary { border-radius: 16px; }

.save-data-manager--app-settings .save-data-chevron {
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e6f0ef;
  color: #2c7b8b;
}

.save-data-chevron svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform .18s ease;
}

.save-data-manager--app-settings[open] > summary .save-data-chevron {
  background: #dceceb;
}

.save-data-manager--app-settings[open] > summary .save-data-chevron svg {
  transform: rotate(180deg);
}

.save-data-manager--app-settings .save-data-content {
  padding: 1px 15px 15px;
}

.save-data-manager--app-settings .description,
.save-data-manager--app-settings .status-message,
.save-data-manager--app-settings .error-message,
.save-data-manager--app-settings .merge-detail,
.save-data-manager--app-settings .replace-warning {
  font-size: 11px;
}

.save-data-manager--app-settings button {
  min-height: 46px;
  border-radius: 12px;
  font: inherit;
  font-size: 12px;
  transition: filter 150ms ease, transform 150ms ease;
}

.save-data-manager--app-settings button:not(:disabled):hover,
.save-data-manager--app-settings button:not(:disabled):focus-visible {
  filter: brightness(1.035);
  outline: 2px solid rgba(45, 110, 123, 0.24);
  outline-offset: 2px;
  transform: translateY(-1px);
}

.save-data-manager--app-settings .export,
.save-data-manager--app-settings .merge {
  border-color: rgba(45, 110, 123, 0.3);
  background: #dceff2;
  color: #1f5864;
}

.save-data-manager--app-settings .import,
.save-data-manager--app-settings .cancel {
  border-color: rgba(43, 70, 77, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.save-data-manager--app-settings .import-preview {
  border-color: rgba(207, 86, 39, 0.2);
  border-radius: 14px;
  background: rgba(255, 250, 247, 0.94);
}

@media (prefers-reduced-motion: reduce) {
  .save-data-manager--app-settings summary,
  .save-data-chevron svg,
  .save-data-manager--app-settings button {
    transition: none;
  }
}
</style>
