import Options from "./Options";
import ScreenAwake from "./ScreenAwake";

// Include the countdown and MIDI waiting state in the predicate, but exclude
// explicit pause, results and menus. The component owns exactly one token.
export function createScreenAwakeMixin(isExerciseRunning) {
  return {
    computed: {
      screenAwakeRequested() {
        return Options.keepScreenAwake !== false && Boolean(isExerciseRunning.call(this, this));
      }
    },
    watch: {
      screenAwakeRequested: {
        immediate: true,
        handler(active) {
          if (active && !this._releaseScreenAwake) this._releaseScreenAwake = ScreenAwake.acquire();
          else if (!active && this._releaseScreenAwake) {
            this._releaseScreenAwake();
            this._releaseScreenAwake = null;
          }
        }
      }
    },
    beforeDestroy() {
      if (this._releaseScreenAwake) this._releaseScreenAwake();
      this._releaseScreenAwake = null;
    }
  };
}
