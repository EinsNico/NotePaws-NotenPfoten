<template>
  <main class="flow-hub">
    <div class="flow-hub-backdrop" aria-hidden="true">
      <HomeMusicBackdrop />
    </div>
    <div class="flow-hub-shell">
      <button type="button" class="flow-hub-back" @click="$emit('back')">
        <span aria-hidden="true">←</span> {{$t('BACK')}}
      </button>

      <header class="flow-hub-hero">
        <span class="flow-hub-hero-icon" aria-hidden="true">
          <svg viewBox="0 0 72 72" focusable="false">
            <path class="flow-curve" d="M7 49c13-27 31 18 58-16" />
            <circle cx="17" cy="42" r="6" />
            <circle cx="38" cy="47" r="6" />
            <circle cx="59" cy="30" r="6" />
            <path d="M23 42V25M44 47V30M65 30V13" />
          </svg>
        </span>
        <div>
          <span class="flow-hub-kicker">{{$t('HOME_TRAINING_KICKER')}}</span>
          <h1>{{$t('HOME_NOTE_FLOW')}}</h1>
          <p>{{$t('FLOW_HUB_INTRO')}}</p>
        </div>
      </header>

      <section class="flow-hub-choices" aria-labelledby="flow-hub-title">
        <div class="flow-hub-heading">
          <span class="flow-hub-kicker">{{$t('FLOW_HUB_KICKER')}}</span>
          <h2 id="flow-hub-title">{{$t('FLOW_HUB_TITLE')}}</h2>
        </div>

        <button type="button" class="flow-hub-card flow-hub-card-active"
          @click="$emit('openMelody')">
          <span class="flow-hub-card-icon" aria-hidden="true">♪</span>
          <span class="flow-hub-card-copy">
            <span class="flow-hub-card-top">
              <strong>{{$t('FLOW_HUB_MELODY')}}</strong>
            </span>
            <span>{{$t('FLOW_HUB_MELODY_DESCRIPTION')}}</span>
          </span>
          <span class="flow-hub-arrow" aria-hidden="true">→</span>
        </button>

        <button type="button" class="flow-hub-card flow-hub-card-active" @click="$emit('openChords')">
          <span class="flow-hub-card-icon" aria-hidden="true">♬</span>
          <span class="flow-hub-card-copy">
            <span class="flow-hub-card-top">
              <strong>{{$t('FLOW_HUB_CHORDS')}}</strong>
            </span>
            <span>{{$t('FLOW_HUB_CHORDS_DESCRIPTION')}}</span>
          </span>
          <span class="flow-hub-arrow" aria-hidden="true">→</span>
        </button>

      </section>

    </div>
  </main>
</template>

<script>
import HomeMusicBackdrop from "./HomeMusicBackdrop";

export default {
  name: "NoteFlowHub",
  components: { HomeMusicBackdrop }
};
</script>

<style scoped>
.flow-hub {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: hidden;
  color: #213237;
  background:
    radial-gradient(circle at 8% 6%, rgba(231, 101, 48, .13), transparent 25%),
    radial-gradient(circle at 94% 42%, rgba(45, 110, 123, .11), transparent 30%),
    #f7f2e9;
}
.flow-hub-backdrop {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  opacity: .38;
  pointer-events: none;
}
.flow-hub-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 760px);
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: calc(14px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom));
  text-align: left;
}
.flow-hub-back {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid rgba(207, 86, 39, .33);
  border-radius: 12px;
  background: rgba(255, 250, 246, .88);
  color: #91401f;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
  cursor: pointer;
}
.flow-hub-back span { font-size: 18px; }
.flow-hub-hero, .flow-hub-card {
  border: 1px solid rgba(43, 70, 77, .11);
  border-radius: 21px;
  background: rgba(255, 255, 255, .8);
  box-shadow: 0 11px 25px rgba(72, 58, 45, .09);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}
.flow-hub-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 13px;
  padding: 15px;
}
.flow-hub-hero-icon, .flow-hub-card-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: #286a77;
  background: #e1eef0;
}
.flow-hub-hero-icon {
  width: 58px;
  height: 58px;
  border-radius: 18px;
}
.flow-hub-hero-icon svg {
  width: 54px;
  height: 54px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.flow-hub-hero-icon circle {
  fill: currentColor;
  stroke: none;
}
.flow-hub-hero-icon .flow-curve {
  stroke: #e76530;
  stroke-width: 2.5;
}
.flow-hub-kicker {
  color: #2d6e7b;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .15em;
}
.flow-hub-hero h1 {
  margin: 4px 0;
  font-size: 24px;
  line-height: 1.1;
}
.flow-hub-hero p, .flow-hub-card-copy > span:last-child {
  margin: 0;
  color: #63777b;
  font-size: 12px;
  line-height: 1.4;
}
.flow-hub-choices { display: grid; gap: 12px; margin-top: 24px; }
.flow-hub-heading { padding: 0 4px 2px; }
.flow-hub-heading h2 { margin: 5px 0 0; font-size: 20px; }
.flow-hub-card {
  display: flex;
  width: 100%;
  min-height: 106px;
  align-items: center;
  gap: 14px;
  padding: 15px;
  font: inherit;
  text-align: left;
}
.flow-hub-card-active { cursor: pointer; }
.flow-hub-card-active:focus-visible {
  outline: 3px solid #e76530;
  outline-offset: 2px;
}
.flow-hub-card-active:active { transform: translateY(1px); }
.flow-hub-card-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  font-size: 34px;
}
.flow-hub-card-active .flow-hub-card-icon {
  color: #d45324;
  background: #fff0e7;
}
.flow-hub-card-copy { display: grid; min-width: 0; flex: 1; gap: 5px; }
.flow-hub-card-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.flow-hub-card-top strong { font-size: 16px; }
.flow-hub-arrow { color: #d85a28; font-size: 24px; }
@media (max-width: 430px) {
  .flow-hub-shell { padding-right: 14px; padding-left: 14px; }
  .flow-hub-card { gap: 11px; padding: 12px; }
  .flow-hub-card-icon { width: 48px; height: 48px; }
}
</style>
