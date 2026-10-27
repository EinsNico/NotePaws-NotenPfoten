<template>
  <span class="midi-connection-status" :class="{ 'is-connected': connected }"
    role="status" aria-live="polite">
    <span class="midi-connection-light" aria-hidden="true"></span>
    <span>{{$t(connected ? 'HOME_MIDI_CONNECTED' : 'HOME_MIDI_DISCONNECTED')}}</span>
  </span>
</template>

<script>
// Passive display: the active MidiInput owns device listeners and permissions.
export default {
  name: "MidiConnectionStatus",
  props: { connected: { type: Boolean, default: false } }
};
</script>

<style scoped>
.midi-connection-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 6px 8px;
  border: 1px solid #d7e0e2;
  border-radius: 999px;
  background: #f2f5f5;
  color: #586e75;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
}
.midi-connection-light {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #82949a;
}
.is-connected {
  border-color: #a4d4b5;
  background: #edf8f0;
  color: #287744;
}
.is-connected .midi-connection-light {
  background: #38ad64;
  box-shadow: 0 0 7px rgba(56, 173, 100, .55);
}
</style>
