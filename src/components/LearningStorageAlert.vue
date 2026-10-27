<template>
  <aside
    v-if="status.state === 'error'"
    class="learning-storage-alert"
    role="alert"
    aria-live="assertive">
    <span class="learning-storage-alert-mark" aria-hidden="true">!</span>
    <div class="learning-storage-alert-copy">
      <strong>{{title}}</strong>
      <p>{{description}}</p>
      <small>{{$t('LEARNING_STORAGE_FAILED_COUNT', {
        count: status.failedWrites
      })}}</small>
    </div>
    <button
      type="button"
      class="persistence-retry"
      :disabled="status.retrying"
      :aria-busy="status.retrying ? 'true' : 'false'"
      @click="retry">
      {{status.retrying
        ? $t('LEARNING_STORAGE_RETRYING')
        : $t('LEARNING_STORAGE_RETRY')}}
    </button>
  </aside>
</template>

<script>
import SingleNotesLearningStorage, {
  SINGLE_NOTES_STORAGE_ERROR_QUOTA
} from "../model/SingleNotesLearningStorage";

export default {
  name: "LearningStorageAlert",
  data() {
    return {
      status: SingleNotesLearningStorage.status
    };
  },
  computed: {
    isQuotaError() {
      return this.status.errorType === SINGLE_NOTES_STORAGE_ERROR_QUOTA;
    },
    title() {
      return this.$t(
        this.isQuotaError
          ? "LEARNING_STORAGE_QUOTA_TITLE"
          : "LEARNING_STORAGE_ERROR_TITLE"
      );
    },
    description() {
      return this.$t(
        this.isQuotaError
          ? "LEARNING_STORAGE_QUOTA_DESCRIPTION"
          : "LEARNING_STORAGE_ERROR_DESCRIPTION"
      );
    }
  },
  methods: {
    async retry() {
      const result = await SingleNotesLearningStorage.retryFailedWrites();
      if (result.saved) {
        this.$emit("recovered");
      }
    }
  }
};
</script>

<style scoped>
.learning-storage-alert {
  position: relative;
  z-index: 4;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin: 10px 18px;
  padding: 11px 12px;
  border: 1px solid rgba(188, 67, 35, 0.34);
  border-radius: 15px;
  background: rgba(255, 241, 235, 0.96);
  box-shadow: 0 7px 18px rgba(106, 49, 31, 0.12);
  color: #79351f;
  text-align: left;
}

.learning-storage-alert-mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: #d9552a;
  color: #fff;
  font-size: 17px;
  font-weight: 900;
}

.learning-storage-alert-copy {
  min-width: 0;
}

.learning-storage-alert-copy strong {
  display: block;
  font-size: 12px;
  line-height: 1.25;
}

.learning-storage-alert-copy p {
  margin: 3px 0;
  font-size: 10px;
  line-height: 1.4;
}

.learning-storage-alert-copy small {
  color: #99604d;
  font-size: 9px;
}

.learning-storage-alert button {
  min-height: 38px;
  padding: 7px 11px;
  border: 1px solid #b94b29;
  border-radius: 11px;
  background: #fffaf7;
  color: #9a3d20;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.learning-storage-alert button:focus-visible {
  outline: 3px solid rgba(217, 85, 42, 0.25);
  outline-offset: 2px;
}

.learning-storage-alert button:disabled {
  cursor: wait;
  opacity: 0.65;
}

@media (max-width: 430px) {
  .learning-storage-alert {
    grid-template-columns: auto minmax(0, 1fr);
    margin-right: 12px;
    margin-left: 12px;
  }

  .learning-storage-alert button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
