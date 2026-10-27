<template>
  <div v-if="!silent || showConnectionFeedback" class="midi-input">
    <div class="ready" v-if="!silent && midiIsReady && !lastNotePlayed">{{$t('playTheNote')}}</div>
    <div class="last-note" v-if="!silent && lastNotePlayed">{{$t('lastNotePlayed')}}: {{lastNotePlayed}}</div>
    <div class="error-message" v-if="errorMessage" role="status">{{errorMessage}}</div>
    <p class="permission-message" v-if="midiPermissionPending" role="status">{{$t('MIDI_PERMISSION_PENDING')}}</p>
    <div class="restart-button" v-if="!midiIsReady"><button class="persistence-retry" :disabled="midiEnabling" :aria-busy="midiEnabling ? 'true' : 'false'" @click="initMidi()">{{$t('RESTART_MIDI')}}</button></div>
  </div>
</template>

<script>
import WebMidi from 'webmidi';
import Utils from '../model/Utils';
import Options from '../model/Options';
import { connectedMidiInputs, enableMidiConnection, MIDI_CONNECTION_CHECK_INTERVAL_MS } from '../model/MidiConnection';

export default {
  name: 'MidiInput',
  props: {
    isSharp: Boolean,
    silent: {
      type: Boolean,
      default: false
    },
    showConnectionFeedback: {
      type: Boolean,
      default: false
    },
    showOctave: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      heldMidiKeys: new Map(),
      midiIsReady: false,
      lastNotePlayed: null,
      errorMessage: '',
      midiEnabling: false,
      midiPermissionPending: false,
    }
  },
  computed: {
    noteNames(){
      return Utils.getDisplayNoteNamesArray(
        this.isSharp,
        Options.noteNaming
      );
    }
  },
  methods: {
    initMidi() {
      if (this.midiDisposed || this.midiEnabling) return;
      const request = this.midiEnableRequestId = (this.midiEnableRequestId || 0) + 1;
      if (this.cancelMidiEnable) this.cancelMidiEnable();
      this.errorMessage = '';
      this.midiPermissionPending = false;
      this.midiIsReady = false;
      this.$emit('connection-change', false);
      if (WebMidi.enabled) {
        this.listenForDevices();
        this.connectInputs();
        return;
      }
      this.midiEnabling = true;
      this.cancelMidiEnable = enableMidiConnection(WebMidi, error => {
        if (this.midiDisposed || request !== this.midiEnableRequestId) return;
        this.midiEnabling = false;
        this.midiPermissionPending = false;
        if (error) {
          this.errorMessage = this.$t('noMidiSupport');
          return;
        }
        this.listenForDevices();
        this.connectInputs();
      }, () => {
        if (this.midiDisposed || request !== this.midiEnableRequestId) return;
        this.midiEnabling = false;
        this.midiPermissionPending = true;
      });
    },
    listenForDevices() {
      if (this.midiListening && (typeof WebMidi.hasListener !== 'function'
        || (WebMidi.hasListener('connected', this.connectInputs)
          && WebMidi.hasListener('disconnected', this.connectInputs)))) return;
      WebMidi.addListener('connected', this.connectInputs);
      WebMidi.addListener('disconnected', this.connectInputs);
      this.midiListening = true;
    },
    connectInputs() {
      if (this.midiDisposed) return;
      const connected = connectedMidiInputs(WebMidi);
      const changed = connected.length !== this.boundMidiInputs.length
        || connected.some((input, index) => input !== this.boundMidiInputs[index]);
      if (changed) {
        this.boundMidiInputs.forEach(input => {
          input.removeListener('noteon', 'all', this.handleNoteOn);
          input.removeListener('noteoff', 'all', this.handleNoteOff);
        });
        this.releaseHeldNotes();
        this.boundMidiInputs = connected;
        connected.forEach(input => {
          input.on('noteon', 'all', this.handleNoteOn);
          input.on('noteoff', 'all', this.handleNoteOff);
        });
      }
      const wasReady = this.midiIsReady;
      this.midiIsReady = this.boundMidiInputs.length > 0;
      this.errorMessage = this.midiIsReady ? '' : this.$t('noDeviceFound');
      if (changed || wasReady !== this.midiIsReady) this.$emit('connection-change', this.midiIsReady);
    },
    checkVisibleMidiConnection() {
      if (document.hidden) this.releaseHeldNotes();
      else if (WebMidi.enabled || this.midiIsReady) this.connectInputs();
    },
    resumeMidi() {
      if (this.midiDisposed) return;
      if (WebMidi.enabled) this.connectInputs();
      else this.initMidi();
    },
    midiKey(stroke, value) {
      return ((stroke.target && stroke.target.id) || 'input') + ':' + (stroke.channel || 1) + ':' + value;
    },
    handleNoteOn(stroke) {
      if (stroke.velocity === 0) { this.handleNoteOff(stroke); return; }
      // Match the app's existing octave convention (middle C = 48).
      const value = stroke.note.octave * 12 + stroke.note.number % 12;
      const alreadyHeld = Array.from(this.heldMidiKeys.values()).includes(value);
      this.heldMidiKeys.set(this.midiKey(stroke, value), value);
      if (!alreadyHeld) this.solve(value);
    },
    handleNoteOff(stroke) {
      const value = stroke.note.octave * 12 + stroke.note.number % 12;
      if (!this.heldMidiKeys.delete(this.midiKey(stroke, value))) return;
      if (!Array.from(this.heldMidiKeys.values()).includes(value)) this.$emit('released', value);
    },
    releaseHeldNotes() {
      if (!this.heldMidiKeys) return;
      const values = Array.from(new Set(this.heldMidiKeys.values()));
      this.heldMidiKeys.clear();
      values.forEach(value => this.$emit('released', value));
    },
    solve(v) {
      this.lastNotePlayed = this.noteNames[v % 12]
        + (this.showOctave ? Math.floor(v / 12) : '');
      this.$emit('solved', v);
    }
  },
  mounted() {
    this.midiDisposed = false;
    this.midiListening = false;
    this.midiEnabling = false;
    this.boundMidiInputs = [];
    this.heldMidiKeys = new Map();
    this.midiConnectionTimer = setInterval(this.checkVisibleMidiConnection, MIDI_CONNECTION_CHECK_INTERVAL_MS);
    window.addEventListener('focus', this.resumeMidi);
    document.addEventListener('resume', this.resumeMidi);
    document.addEventListener('deviceready', this.resumeMidi);
    document.addEventListener('visibilitychange', this.checkVisibleMidiConnection);
    this.initMidi();
  },
  beforeDestroy() {
    this.midiDisposed = true;
    this.midiEnableRequestId = (this.midiEnableRequestId || 0) + 1;
    if (this.cancelMidiEnable) this.cancelMidiEnable();
    clearInterval(this.midiConnectionTimer);
    window.removeEventListener('focus', this.resumeMidi);
    document.removeEventListener('resume', this.resumeMidi);
    document.removeEventListener('deviceready', this.resumeMidi);
    document.removeEventListener('visibilitychange', this.checkVisibleMidiConnection);
    if (WebMidi.enabled) {
      if (this.midiListening) {
        WebMidi.removeListener('connected', this.connectInputs);
        WebMidi.removeListener('disconnected', this.connectInputs);
      }
      // Keep the MIDI interface available for the status light on the home menu.
    }
    this.boundMidiInputs.forEach(input => {
      input.removeListener('noteon', 'all', this.handleNoteOn);
      input.removeListener('noteoff', 'all', this.handleNoteOff);
    });
    this.releaseHeldNotes();
  }
}
</script>

<style scoped>
.ready {
  font-style: italic;
}

.last-note {
  text-align: center;
}

.error-message {
  text-align: center;
  font-weight: bold;
  color: red;
}

.restart-button {
  text-align: center;
  margin-top: 12px;
}

.permission-message {
  color: #586e75;
  text-align: center;
  line-height: 1.5;
}
</style>
