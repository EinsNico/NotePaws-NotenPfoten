<template>
  <SelectOption
    appearance="single-notes"
    :label="$t('FLOW_METRONOME')"
    :items="choices"
    :value="value && !disabled"
    :disabled="disabled"
    @input="$emit('input', $event)"
    @blocked="showNotice" />
</template>

<script>
import SelectOption from "./SelectOption";

export default {
  name: "NoteFlowMetronomeSetting",
  components: { SelectOption },
  props: { value: Boolean, disabled: Boolean },
  beforeDestroy() {
    clearTimeout(this.noticeTimer);
    this.$emit("notice", false);
  },
  computed: {
    choices() {
      return [
        { value: true, label: this.$t("on") },
        { value: false, label: this.$t("off") }
      ];
    }
  },
  methods: {
    showNotice() {
      clearTimeout(this.noticeTimer);
      this.$emit("notice", true);
      this.noticeTimer = setTimeout(() => this.$emit("notice", false), 4500);
    }
  }
};
</script>
