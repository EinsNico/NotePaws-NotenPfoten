<template>
  <div class="single-notes-navigation">
    <header class="single-notes-header">
      <button type="button" class="single-notes-back" @click="$emit('home')">
        <span aria-hidden="true">←</span>
        {{$t('BACK')}}
      </button>

      <div class="single-notes-hero">
        <span class="single-notes-hero-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <path d="M7 20h50M7 28h50M7 36h50M7 44h50" />
            <path class="single-notes-symbol-stem" d="M40 15v34" />
            <ellipse cx="31" cy="50" rx="9" ry="6" />
          </svg>
        </span>
        <div class="single-notes-hero-copy">
          <span>{{$t('HOME_TRAINING_KICKER')}}</span>
          <h1>{{$t('HOME_SINGLE_NOTES')}}</h1>
          <p>{{$t('HOME_SINGLE_NOTES_DESCRIPTION')}}</p>
        </div>
      </div>
    </header>

    <div
      class="single-notes-mode-switch"
      role="group"
      :aria-label="$t('SINGLE_NOTES_MODE_NAVIGATION')">
      <button
        type="button"
        class="single-notes-mode-button single-notes-mode-button-adaptive"
        :class="{ active: activeMode === 'adaptive' }"
        :aria-pressed="activeMode === 'adaptive' ? 'true' : 'false'"
        @click="$emit('select-adaptive')">
          {{$t('SINGLE_NOTES_LEARNING_MODE')}}
      </button>
      <button
        type="button"
        class="single-notes-mode-button single-notes-mode-button-normal"
        :class="{ active: activeMode === 'normal' }"
        :aria-pressed="activeMode === 'normal' ? 'true' : 'false'"
        @click="$emit('select-normal')">
          {{$t('SINGLE_NOTES_FREE_TRAINING')}}
      </button>
    </div>

    <div
      class="single-notes-view-switch"
      role="tablist"
      :aria-label="$t('SINGLE_NOTES_VIEW_NAVIGATION')">
      <button
        type="button"
        role="tab"
        class="single-notes-view-button single-notes-view-button-settings"
        :class="{ active: activeView === 'settings' }"
        :aria-selected="activeView === 'settings' ? 'true' : 'false'"
        @click="$emit('select-view', 'settings')">
          <span class="single-notes-view-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" focusable="false">
              <path d="M5 9h22M5 16h22M5 23h22" />
              <circle cx="12" cy="9" r="2.5" />
              <circle cx="21" cy="16" r="2.5" />
              <circle cx="14" cy="23" r="2.5" />
            </svg>
          </span>
          {{$t('SINGLE_NOTES_SETTINGS')}}
      </button>
      <button
        type="button"
        role="tab"
        class="single-notes-view-button single-notes-view-button-statistics"
        :class="{ active: activeView === 'statistics' }"
        :aria-selected="activeView === 'statistics' ? 'true' : 'false'"
        @click="$emit('select-view', 'statistics')">
          <span class="single-notes-view-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" focusable="false">
              <path d="M5 27V16h6v11M13 27V9h6v18M21 27V4h6v23M3 27h26" />
            </svg>
          </span>
          {{$t('SINGLE_NOTES_STATISTICS')}}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: "SingleNotesNavigation",
  props: {
    activeMode: {
      type: String,
      required: true,
      validator(value) {
        return value === "normal" || value === "adaptive";
      }
    },
    activeView: {
      type: String,
      required: true,
      validator(value) {
        return value === "settings" || value === "statistics";
      }
    }
  }
};
</script>

<style scoped>
.single-notes-navigation {
  padding: calc(14px + env(safe-area-inset-top)) 18px 0;
}

.single-notes-header {
  text-align: left;
}

.single-notes-back {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid rgba(207, 86, 39, 0.33);
  border-radius: 12px;
  background: rgba(255, 250, 246, 0.88);
  color: #91401f;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.single-notes-back span {
  font-size: 18px;
  line-height: 1;
}

.single-notes-back:hover,
.single-notes-back:focus-visible {
  border-color: rgba(231, 101, 48, 0.62);
  background: #fff;
  outline: 2px solid rgba(231, 101, 48, 0.22);
  outline-offset: 2px;
}

.single-notes-hero {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 13px;
  padding: 13px 15px;
  border: 1px solid rgba(43, 70, 77, 0.11);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 11px 25px rgba(72, 58, 45, 0.09);
}

.single-notes-hero-icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 18px;
  background: #fff0e8;
  color: #d85624;
}

.single-notes-hero-icon svg {
  width: 52px;
  height: 52px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.single-notes-hero-icon ellipse {
  fill: currentColor;
  stroke: none;
}

.single-notes-hero-icon .single-notes-symbol-stem {
  stroke-width: 3.5;
}

.single-notes-hero-copy {
  min-width: 0;
}

.single-notes-hero-copy > span {
  color: #c95025;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.single-notes-hero-copy h1 {
  margin: 2px 0 0;
  color: #17262b;
  font-size: 24px;
  line-height: 1.05;
}

.single-notes-hero-copy p {
  margin: 4px 0 0;
  color: #64767a;
  font-size: 12px;
  line-height: 1.35;
}

.single-notes-mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 12px;
  padding: 4px;
  border: 1px solid rgba(43, 70, 77, 0.12);
  border-radius: 16px;
  background: rgba(238, 229, 217, 0.75);
}

.single-notes-mode-button {
  min-width: 0;
  min-height: 42px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #586a6e;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background 150ms ease, box-shadow 150ms ease, color 150ms ease;
}

.single-notes-mode-button:hover,
.single-notes-mode-button:focus-visible {
  background: rgba(255, 255, 255, 0.7);
  outline: 2px solid rgba(45, 110, 123, 0.2);
  outline-offset: 1px;
}

.single-notes-mode-button-adaptive.active {
  background: #e76530;
  box-shadow: 0 5px 12px rgba(207, 86, 39, 0.2);
  color: #fff;
}

.single-notes-mode-button-normal.active {
  background: #2d6e7b;
  box-shadow: 0 5px 12px rgba(45, 110, 123, 0.2);
  color: #fff;
}

.single-notes-view-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 10px;
}

.single-notes-view-button {
  display: flex;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(43, 70, 77, 0.13);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.54);
  color: #53676c;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.single-notes-view-button:hover,
.single-notes-view-button:focus-visible {
  border-color: rgba(45, 110, 123, 0.4);
  background: rgba(255, 255, 255, 0.82);
  outline: none;
}

.single-notes-view-button.active {
  border-color: rgba(207, 86, 39, 0.4);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 7px 16px rgba(72, 58, 45, 0.09);
  color: #b84922;
}

.single-notes-view-button-statistics.active {
  border-color: rgba(45, 110, 123, 0.42);
  color: #286a77;
}

.single-notes-view-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  background: #f3e8dd;
}

.single-notes-view-button-statistics .single-notes-view-icon {
  background: #e1eef0;
}

.single-notes-view-icon svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

@media (max-width: 370px) {
  .single-notes-navigation {
    padding-right: 12px;
    padding-left: 12px;
  }

  .single-notes-hero {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 11px;
    padding: 11px 12px;
  }

  .single-notes-hero-icon {
    width: 50px;
    height: 50px;
  }

  .single-notes-hero-icon svg {
    width: 45px;
    height: 45px;
  }

  .single-notes-hero-copy h1 {
    font-size: 21px;
  }

  .single-notes-mode-button,
  .single-notes-view-button {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .single-notes-mode-button {
    transition: none;
  }
}
</style>
