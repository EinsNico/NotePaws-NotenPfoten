<template>
  <div class="single-notes-settings">
    <nav v-if="!activeSection" class="settings-section-list" :aria-label="$t('SINGLE_NOTES_SETTINGS')">
      <p class="settings-section-intro">{{$t('SINGLE_NOTES_SETTINGS_HINT')}}</p>
      <button
        v-for="section in sections"
        :key="section.id"
        ref="sectionLinks"
        type="button"
        class="settings-section-link"
        :data-section="section.id"
        @click="openSection(section.id)">
        <SettingsSectionIcon :type="section.id" />
        <span class="settings-section-copy">
          <strong>{{section.title}}</strong>
          <small>{{section.summary}}</small>
        </span>
        <span class="settings-section-arrow" aria-hidden="true">→</span>
      </button>
    </nav>

    <div v-else class="settings-section-detail">
      <button ref="returnButton" type="button" class="settings-return" @click="closeSection">
        <span aria-hidden="true">←</span>
        {{$t('SINGLE_NOTES_ALL_SETTINGS')}}
      </button>
      <slot :active-section="activeSection" />
    </div>
  </div>
</template>

<script>
import SettingsSectionIcon from "./SettingsSectionIcon";

export default {
  name: "SingleNotesSettings",
  components: { SettingsSectionIcon },
  props: {
    sections: { type: Array, required: true }
  },
  data() {
    return { activeSection: null };
  },
  methods: {
    openSection(id) {
      if (!this.sections.some(section => section.id === id)) return;
      this.activeSection = id;
      this.$nextTick(() => {
        window.scrollTo(0, 0);
        if (this.$refs.returnButton) this.$refs.returnButton.focus({ preventScroll: true });
      });
    },
    closeSection() {
      const previousSection = this.activeSection;
      this.activeSection = null;
      this.$nextTick(() => {
        window.scrollTo(0, 0);
        const link = (this.$refs.sectionLinks || [])
          .find(button => button.dataset.section === previousSection);
        if (link) link.focus({ preventScroll: true });
      });
    },
    reset() {
      this.activeSection = null;
    },
    handleBack() {
      if (!this.activeSection) return false;
      this.closeSection();
      return true;
    }
  }
};
</script>

<style scoped>
.single-notes-settings {
  margin-top: 12px;
}

.settings-section-list,
.settings-section-detail {
  display: grid;
  gap: 12px;
}

.settings-section-intro {
  margin: 4px 4px 1px;
  color: #647a80;
  font-size: 11px;
  line-height: 1.4;
}

.settings-section-link {
  display: grid;
  box-sizing: border-box;
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

.settings-section-link:active {
  transform: translateY(1px);
}

.settings-section-link:focus-visible,
.settings-return:focus-visible {
  outline: 2px solid #2d7b88;
  outline-offset: 3px;
}

.settings-section-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.settings-section-copy strong {
  color: #2d5661;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.04em;
}

.settings-section-copy small {
  color: #697d82;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.settings-section-arrow {
  color: #d65b2d;
  font-size: 21px;
}

.settings-return {
  justify-self: start;
  min-height: 40px;
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

.settings-return span {
  margin-right: 6px;
  font-size: 17px;
  vertical-align: -1px;
}

@media (max-width: 370px) {
  .settings-section-link {
    gap: 10px;
    padding: 12px;
  }
}
</style>
