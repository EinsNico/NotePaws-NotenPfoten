<template>
  <section class="stored-data-overview" aria-live="polite">
    <p v-if="loading" class="overview-status" role="status">{{$t('STORED_DATA_LOADING')}}</p>
    <p v-else-if="failed" class="overview-status" role="alert">{{$t('STORED_DATA_ERROR')}}</p>
    <p v-else-if="countingPrestige" class="overview-status" role="status">{{$t('PRESTIGE_COUNTING')}}</p>
    <details class="stored-entries storage-disclosure">
      <summary>
        <span class="storage-title">{{$t('STORED_DATA_TITLE')}}</span>
        <span class="storage-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
      </summary>
      <div class="storage-content">
      <p>{{$t('STORED_DATA_DESCRIPTION')}}</p>
      <dl v-if="counts && !loading && !failed">
      <div><dt>{{$t('STORED_DATA_SINGLE_SCREEN')}}</dt><dd>{{format(counts.singleNotesScreen)}}</dd></div>
      <div><dt>{{$t('STORED_DATA_SINGLE_MIDI')}}</dt><dd>{{format(counts.singleNotesMidi)}}</dd></div>
      <div><dt>{{$t('STORED_DATA_FREE_ROUNDS')}}</dt><dd>{{format(counts.freeRounds)}}</dd></div>
      <div><dt>{{$t('STORED_DATA_MELODY')}}</dt><dd>{{format(counts.melodyRounds)}}</dd></div>
      <div><dt>{{$t('STORED_DATA_CHORDS')}}</dt><dd>{{format(counts.chordRounds)}}</dd></div>
      <div><dt>{{$t('STORED_DATA_RHYTHM')}}</dt><dd>{{format(counts.rhythmBars)}}</dd></div>
      <div class="total"><dt>{{$t('STORED_DATA_TOTAL')}}</dt><dd>{{format(total)}}</dd></div>
      </dl>
      </div>
    </details>
    <details v-if="counts && !loading && !failed" class="prestige-progress storage-disclosure"
      :open="prestigeExpanded" @toggle="rememberPrestigeDisclosure">
      <summary :aria-disabled="operationBusy ? 'true' : undefined" @click="guardPrestigeDisclosure">
        <span class="storage-title">{{$t('PRESTIGE_TITLE')}}</span>
        <span class="storage-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
      </summary>
      <div v-if="eligibleCounts" class="storage-content">
      <p>{{$t('PRESTIGE_DESCRIPTION', { count: format(prestige.step) })}}</p>
      <dl>
        <div><dt>{{$t('PRESTIGE_CURRENT')}}</dt><dd>{{format(prestige.currentPrestige)}}</dd></div>
        <div><dt>{{$t('PRESTIGE_AVAILABLE')}}</dt><dd>+{{format(prestige.availablePrestiges)}}</dd></div>
        <div><dt>{{$t('PRESTIGE_REMAINING', { level: format(prestige.nextPrestige) })}}</dt>
          <dd>{{format(prestige.entriesUntilNextPrestige)}}</dd></div>
      </dl>
      <div class="prestige-track" role="progressbar" :aria-label="$t('PRESTIGE_PROGRESS')"
        :aria-valuemin="0" :aria-valuemax="prestige.step" :aria-valuenow="prestige.remainder">
        <div class="prestige-fill" :style="{ width: prestige.percent + '%' }"></div>
      </div>
      <p class="prestige-caption">{{format(prestige.remainder)}} / {{format(prestige.step)}}</p>
      <p v-if="prestige.availablePrestiges > 0">{{$t('PRESTIGE_READY', {
        levels: format(prestige.availablePrestiges), entries: format(prestige.archivableEntries)
      })}}</p>
      <p v-if="hasExcludedEntries">{{$t('PRESTIGE_IMPORTED_EXCLUDED', {
        count: format(excludedTotal)
      })}}</p>
      <div v-if="!operationBusy && !preview && prestige.availablePrestiges > 0"
        class="prestige-actions">
        <button type="button" :disabled="busy" @click="showPreview">
          {{$t('PRESTIGE_PREVIEW_ACTION')}}
        </button>
      </div>
      <div v-if="preview && !operationBusy" class="prestige-confirm" role="group">
        <strong>{{$t('PRESTIGE_CONFIRM_TITLE')}}</strong>
        <p>{{$t('PRESTIGE_CONFIRM_DESCRIPTION', {
          levels: format(preview.segment.levels),
          archived: format(preview.selectedEntries),
          remaining: format(preview.detailEntriesRemaining)
        })}}</p>
        <p>{{$t('PRESTIGE_CONFIRM_WARNING')}}</p>
        <div class="prestige-actions">
          <button type="button" class="prestige-secondary" @click="preview = null">
            {{$t('CANCEL')}}
          </button>
          <button type="button" :disabled="busy" @click="applyPrestige">
            {{$t('PRESTIGE_CONFIRM_ACTION')}}
          </button>
        </div>
      </div>
      <div v-if="operationBusy" class="prestige-operation" role="status" aria-live="polite">
        <p>{{operationMessage}}</p>
        <div class="prestige-track" role="progressbar"
          :aria-label="operationMessage" :aria-valuemin="0" :aria-valuemax="100"
          :aria-valuenow="operationPercent === null ? undefined : operationPercent">
          <div class="prestige-fill"
            :class="{ 'prestige-indeterminate': operationPercent === null }"
            :style="operationPercent === null ? null : { width: operationPercent + '%' }"></div>
        </div>
        <p v-if="operationPercent !== null" class="prestige-caption">{{operationPercent}} %</p>
        <button v-if="operationCanCancel" type="button" class="prestige-secondary"
          :disabled="cancelRequested" @click="cancelRequested = true">
          {{$t('CANCEL')}}
        </button>
      </div>
      <p v-if="operationError" class="prestige-error" role="alert">{{$t(operationError)}}</p>
      </div>
    </details>
  </section>
</template>
<script>
import * as Lockr from "lockr";
import { openLearningDatabasePrototype } from "../model/LearningDatabasePrototype";
import { activeLearningDatabaseName, createShadowLearningDatabase,
  discardInactiveShadowLearningDatabase } from "../model/LearningDatabaseGeneration";
import { createPrestigeProgress } from "../model/PrestigeProgress";
import { readPrestigeEligibleCounts, hasExcludedPrestigeEntries } from "../model/PrestigeEligibleCounts";
import { createEmptyPrestigeArchive, summarizePrestigeArchive } from "../model/PrestigeArchive";
import { preparePrestigeArchivePreview } from "../model/PrestigePreparation";
import { preparePrestigeCommit, commitPreparedPrestige } from "../model/PrestigeCommit";
import { flushCurrentWrites } from "../model/SaveDataShadowCommit";
export default {
  name: "StoredDataOverview",
  props: { busy: { type: Boolean, default: false } },
  data() { return { counts: null, eligibleCounts: null, excludedCounts: null,
    archivedLevels: 0, loading: false, countingPrestige: false, refreshPending: false, failed: false,
    preview: null, prestigeExpanded: false, operationBusy: false, operationPhase: "", operationPercent: null,
    cancelRequested: false, operationCanCancel: false, operationError: "" }; },
  computed: {
    total() { return this.counts ? Object.keys(this.counts).reduce((sum, key) => sum + this.counts[key], 0) : 0; },
    prestige() { return createPrestigeProgress(this.eligibleCounts || {}, this.archivedLevels); },
    hasExcludedEntries() { return this.excludedCounts
      ? hasExcludedPrestigeEntries(this.excludedCounts) : false; },
    excludedTotal() { return this.excludedCounts
      ? Object.keys(this.excludedCounts).reduce((sum, key) => sum + this.excludedCounts[key], 0) : 0; },
    operationMessage() { return this.$t(`PRESTIGE_PHASE_${this.operationPhase || 'PREVIEW'}`); }
  },
  watch: { busy(value) { if (!value) {
    if (this.loading || this.countingPrestige) this.refreshPending = true;
    else this.refresh();
  } } },
  mounted() { this.refresh(); },
  methods: {
    format(value) { return value.toLocaleString(this.$i18n.locale); },
    guardPrestigeDisclosure(event) {
      if (this.operationBusy) event.preventDefault();
    },
    rememberPrestigeDisclosure(event) {
      if (this.operationBusy && !event.target.open) event.target.open = true;
      this.prestigeExpanded = event.target.open;
    },
    setOperationBusy(value) {
      if (value) this.prestigeExpanded = true;
      this.operationBusy = value;
      this.$emit("busy-change", value);
    },
    newSegmentId() {
      const random = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().toLowerCase()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      return `prestige-${random}`;
    },
    async showPreview() {
      if (this.busy || this.operationBusy || this.countingPrestige
        || !this.prestige.availablePrestiges) return;
      this.preview = null;
      this.operationError = "";
      this.operationPhase = "PREVIEW";
      this.operationPercent = 0;
      this.operationCanCancel = true;
      this.cancelRequested = false;
      this.setOperationBusy(true);
      let database;
      try {
        await flushCurrentWrites();
        database = await openLearningDatabasePrototype({ name: activeLearningDatabaseName() });
        const history = Lockr.get("roundHistory", null);
        const freeRounds = Array.isArray(history) ? history
          : history && Array.isArray(history.rounds) ? history.rounds : [];
        this.preview = await preparePrestigeArchivePreview(database, {
          id: this.newSegmentId(), freeRounds,
          shouldContinue: () => !this.cancelRequested,
          onProgress: (done, total) => {
            this.operationPercent = Math.floor(done / total * 100);
          }
        });
        if (this.cancelRequested) this.preview = null;
      } catch (error) {
        if (!error || error.name !== "AbortError") this.operationError = "PRESTIGE_ERROR";
      } finally {
        if (database) database.close();
        this.operationCanCancel = false;
        this.setOperationBusy(false);
      }
    },
    async applyPrestige() {
      if (!this.preview || this.busy || this.operationBusy
        || this.countingPrestige) return;
      this.operationError = "";
      this.operationPhase = "COPY";
      this.operationPercent = null;
      this.operationCanCancel = true;
      this.cancelRequested = false;
      this.setOperationBusy(true);
      let active;
      let shadow;
      let committed = false;
      try {
        await flushCurrentWrites();
        active = await openLearningDatabasePrototype({ name: activeLearningDatabaseName() });
        shadow = await createShadowLearningDatabase();
        const prepared = await preparePrestigeCommit(this.preview, active,
          shadow, localStorage, () => !this.cancelRequested);
        if (this.cancelRequested) {
          const error = new Error("Prestige cancelled.");
          error.name = "AbortError";
          throw error;
        }
        this.operationPhase = "SWITCH";
        this.operationCanCancel = false;
        await commitPreparedPrestige(prepared, shadow, active, localStorage);
        committed = true;
        this.operationPhase = "DONE";
        this.preview = null;
      } catch (error) {
        if (shadow && activeLearningDatabaseName() === shadow.name) {
          committed = true;
          this.operationPhase = "DONE";
          this.preview = null;
        } else if (shadow) {
          try { await discardInactiveShadowLearningDatabase(shadow); }
          catch (ignored) {
            if (shadow.database) shadow.database.close();
            /* Keep the old active generation untouched. */
          }
          shadow = null;
        }
        if (!committed) {
          if (!error || error.name !== "AbortError") {
            this.operationError = error && error.rollbackError
              ? "PRESTIGE_RECOVERY_ERROR" : "PRESTIGE_ERROR";
          }
          this.preview = null;
        }
      } finally {
        if (active) active.close();
        if (shadow && shadow.database) shadow.database.close();
        this.operationCanCancel = false;
        if (committed) window.setTimeout(() => window.location.reload(), 800);
        else {
          this.setOperationBusy(false);
          await this.refresh();
        }
      }
    },
    async refresh() {
      if (this.busy || this.loading || this.countingPrestige) return;
      this.loading = true;
      this.failed = false;
      this.eligibleCounts = null;
      this.excludedCounts = null;
      let database = null;
      try {
        database = await openLearningDatabasePrototype({ name: activeLearningDatabaseName() });
        const counts = await database.readStoredEntryCounts();
        const history = Lockr.get("roundHistory", null);
        const rounds = Array.isArray(history) ? history : history && history.rounds;
        this.counts = Object.assign(counts, { freeRounds: Array.isArray(rounds) ? rounds.length : 0 });
        this.archivedLevels = summarizePrestigeArchive(
          Lockr.get("prestigeArchive", null) || createEmptyPrestigeArchive()
        ).prestige;
        this.loading = false;
        this.countingPrestige = true;
        const eligibility = await readPrestigeEligibleCounts(database,
          Array.isArray(rounds) ? rounds : [],
          { shouldContinue: () => !this._isDestroyed && !this.busy });
        this.eligibleCounts = eligibility.eligibleCounts;
        this.excludedCounts = eligibility.excludedCounts;
      } catch (error) { this.failed = true; }
      finally { if (database) database.close(); this.loading = false;
        this.countingPrestige = false;
        if (this.refreshPending && !this.busy && !this._isDestroyed) {
          this.refreshPending = false;
          this.refresh();
        }
      }
    }
  }
};
</script>
<style scoped>
.stored-data-overview { display: grid; gap: 12px; margin: 0; }
.storage-disclosure { margin: 0; padding: 0; border: 1px solid #cce0e4; border-radius: 16px; background: #f3f9fa; }
.storage-disclosure > summary { display: flex; align-items: center; gap: 12px; min-height: 72px; box-sizing: border-box; padding: 16px; border-radius: 16px; color: #356674; text-align: left; cursor: pointer; list-style: none; transition: background .18s ease; }
.storage-disclosure > summary::-webkit-details-marker { display: none; }
.storage-disclosure > summary:hover, .storage-disclosure > summary:focus-visible { background: #e8f2f2; }
.storage-disclosure > summary:focus-visible { outline: 2px solid #2c7b89; outline-offset: 2px; }
.storage-disclosure > summary[aria-disabled="true"] { cursor: default; }
.storage-title { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; line-height: 1.4; letter-spacing: .03em; overflow-wrap: anywhere; }
.storage-chevron { display: flex; flex: 0 0 32px; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: #2c7b8b; background: #e6f0ef; }
.storage-chevron svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .18s ease; }
.storage-disclosure[open] > summary .storage-chevron { background: #dceceb; }
.storage-disclosure[open] > summary .storage-chevron svg { transform: rotate(180deg); }
.storage-content { margin-top: 0; padding: 12px 16px 16px; border-top: 1px solid #dfebee; }
.storage-content > p:first-child { margin-top: 4px; }
.overview-status { margin: 0; padding: 10px 12px; border-radius: 12px; background: #f3f9fa; }
p { color: #71868e; font-size: 10pt; }
dl { margin: 0; }
dl > div { display: flex; align-items: baseline; gap: 12px; padding: 9px 0; border-bottom: 1px solid #dfebee; }
dt { flex: 1; color: #516c76; font-size: 10pt; }
dd { margin: 0; color: #2c7584; font-weight: 600; white-space: nowrap; }
.total { border-bottom: none; border-top: 1px solid #bdd6dd; margin-top: 5px; }
.prestige-track { height: 10px; margin-top: 14px; border-radius: 999px; overflow: hidden; background: #d5e5e8; }
.prestige-fill { height: 100%; border-radius: inherit; background: #2c7b89; }
.prestige-caption { text-align: right; margin: 6px 0; font-variant-numeric: tabular-nums; }
.prestige-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.prestige-actions button, .prestige-operation button { min-height: 44px; padding: 10px 15px;
  border: 1px solid #2c7b89; border-radius: 12px; background: #2c7b89;
  color: white; font: inherit; font-weight: 600; cursor: pointer; }
.prestige-actions .prestige-secondary, .prestige-operation .prestige-secondary {
  background: white; color: #2c7b89; }
.prestige-actions button:disabled, .prestige-operation button:disabled { opacity: .55; cursor: default; }
.prestige-confirm { margin-top: 14px; padding: 14px; border: 1px solid #c6dce2;
  border-radius: 14px; background: white; text-align: left; }
.prestige-confirm strong { color: #356674; }
.prestige-operation { margin-top: 14px; }
.prestige-operation .prestige-secondary { margin-top: 10px; }
.prestige-error { margin-top: 12px; padding: 11px; border-radius: 10px;
  background: #fff1ec; color: #a84429; }
.prestige-indeterminate { width: 30%; animation: prestige-loading 1.4s ease-in-out infinite alternate; }
@keyframes prestige-loading { from { transform: translateX(0); }
  to { transform: translateX(230%); } }
@media (prefers-reduced-motion: reduce) {
  .storage-disclosure > summary, .storage-chevron svg { transition: none; }
  .prestige-indeterminate { animation: none; width: 100%; }
}
</style>
