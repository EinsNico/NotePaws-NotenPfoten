<template>
  <section v-if="rhythm" class="flow-rhythm-summary">
    <h3>{{$t('FLOW_RHYTHM_TITLE')}}</h3>
    <p><strong>{{$t('FLOW_METER')}}:</strong> {{rhythm.meter}}</p>
    <p v-for="hand in visibleHands" :key="hand.name">
      <strong>{{$t(hand.name === 'bass' ? 'bassClef' : 'trebleClef')}}:</strong>
      {{hand.values.map(value => $t(`FLOW_RHYTHM_VALUE_${value.replace(/-/g, '_').toUpperCase()}`)).join(' · ')}}
    </p>
  </section>
</template>

<script>
import { NOTE_FLOW_RHYTHM_VALUES } from "../model/NoteFlowMenuConfig";

export default {
  name: "NoteFlowRhythmSummary",
  props: {
    settings: { type: Object, default: null }
  },
  computed: {
    rhythm() {
      const rhythm = this.settings && this.settings.rhythm;
      return rhythm && ["3/4", "4/4", "6/8"].includes(rhythm.meter)
        && rhythm.allowedValues && typeof rhythm.allowedValues === "object"
        ? rhythm : null;
    },
    visibleHands() {
      if (!this.rhythm) return [];
      const clefs = Array.isArray(this.settings.clefs) ? this.settings.clefs : [];
      const both = this.settings.handMode === "two" || clefs.includes("piano");
      return ["bass", "treble"].filter(hand => both || clefs.includes(hand))
        .map(name => ({
          name,
          values: Array.isArray(this.rhythm.allowedValues[name])
            ? NOTE_FLOW_RHYTHM_VALUES.filter(value => (
              this.rhythm.allowedValues[name].includes(value)
            )) : []
        })).filter(hand => hand.values.length > 0);
    }
  }
};
</script>

<style scoped src="../styles/training-session.css"></style>
