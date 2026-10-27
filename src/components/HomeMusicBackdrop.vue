<template>
  <div class="home-music-backdrop" aria-hidden="true">
    <svg
      viewBox="0 0 760 1080"
      preserveAspectRatio="xMidYMid slice"
      focusable="false">
      <g ref="sceneLayer" class="music-scroll-layer">
      <g class="music-ornament music-ornament-upper">
        <g class="music-staff music-staff-upper">
          <path d="M-70 246C86 126 206 316 362 211S648 142 836 279" />
          <path d="M-70 286C86 166 206 356 362 251S648 182 836 319" />
          <path d="M-70 326C86 206 206 396 362 291S648 222 836 359" />
          <path d="M-70 366C86 246 206 436 362 331S648 262 836 399" />
          <path d="M-70 406C86 286 206 476 362 371S648 302 836 439" />
        </g>
        <g class="music-notes music-note-layer music-note-layer-upper">
          <g transform="translate(270 222) rotate(-8)">
            <ellipse cx="0" cy="0" rx="15" ry="10" />
            <path d="M13 0v-65" />
          </g>
          <g transform="translate(420 327) rotate(7)">
            <ellipse cx="0" cy="0" rx="15" ry="10" />
            <path d="M13 0v-69c25 5 38 18 37 39-9-11-21-15-37-15" />
          </g>
          <g transform="translate(553 270) rotate(-5)">
            <ellipse cx="0" cy="0" rx="15" ry="10" />
            <path d="M13 0v-60" />
          </g>
        </g>
      </g>

      <g class="music-ornament music-ornament-lower">
        <g class="music-staff music-staff-lower">
          <path d="M-70 606C86 546 206 676 362 602S648 562 836 642" />
          <path d="M-70 644C86 584 206 714 362 640S648 600 836 680" />
          <path d="M-70 682C86 622 206 752 362 678S648 638 836 718" />
          <path d="M-70 720C86 660 206 790 362 716S648 676 836 756" />
          <path d="M-70 758C86 698 206 828 362 754S648 714 836 794" />
        </g>
        <path class="music-clef music-treble-clef" :d="trebleClefPath" />
        <path class="music-clef music-bass-clef" :d="bassClefPath" />
        <g class="music-notes music-note-layer music-note-layer-lower">
          <g transform="translate(285 635) rotate(8)">
            <ellipse cx="0" cy="0" rx="13" ry="9" />
            <path d="M11 0v-55" />
          </g>
          <g transform="translate(410 715) rotate(-9)">
            <ellipse cx="0" cy="0" rx="14" ry="9" />
            <path d="M12 0v-61c22 5 34 17 34 35-9-9-20-13-34-13" />
          </g>
        </g>
      </g>
      </g>
    </svg>
  </div>
</template>

<script>
import Glyphs from "abcjs/src/write/creation/glyphs";
import { getMusicParallaxOffsets } from "../model/MusicParallax";

function createClefPath(name, x, y, scale) {
  return Glyphs.getPathForSymbol(x, y, name, scale, scale)
    .map(part => part.join(" "))
    .join("");
}

const TREBLE_CLEF_PATH = createClefPath("clefs.G", 180, 790, 2.8);
const BASS_CLEF_PATH = createClefPath("clefs.F", 440, 770, 4);

export default {
  name: "HomeMusicBackdrop",
  data() {
    return {
      bassClefPath: BASS_CLEF_PATH,
      trebleClefPath: TREBLE_CLEF_PATH
    };
  },
  created() {
    this.parallaxFrame = null;
    this.reducedMotion = null;
    this.parallaxScrollY = 0;
  },
  mounted() {
    this.reducedMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    window.addEventListener("scroll", this.scheduleParallax, { passive: true });
    document.addEventListener("scroll", this.scheduleParallax, { capture: true, passive: true });
    this.scheduleParallax();
  },
  beforeDestroy() {
    window.removeEventListener("scroll", this.scheduleParallax);
    document.removeEventListener("scroll", this.scheduleParallax, true);
    if (this.parallaxFrame !== null) {
      window.cancelAnimationFrame(this.parallaxFrame);
      this.parallaxFrame = null;
    }
  },
  methods: {
    scheduleParallax(event) {
      const target = event && event.target;
      this.parallaxScrollY = target && target !== document && target !== window
        && typeof target.scrollTop === "number"
        ? target.scrollTop
        : window.scrollY || window.pageYOffset || 0;
      if ((this.reducedMotion && this.reducedMotion.matches)
        || this.parallaxFrame !== null) {
        return;
      }
      this.parallaxFrame = window.requestAnimationFrame(() => {
        this.parallaxFrame = null;
        const offsets = getMusicParallaxOffsets(this.parallaxScrollY);
        this.$refs.sceneLayer.style.transform = `translate3d(0, ${offsets.sceneY}px, 0)`;
      });
    }
  }
};
</script>

<style scoped>
.home-music-backdrop {
  position: absolute;
  z-index: 0;
  top: -9vh;
  right: 0;
  left: 0;
  height: calc(100% + 18vh);
  min-height: 1080px;
  overflow: hidden;
  pointer-events: none;
}

.home-music-backdrop svg {
  display: block;
  width: 100%;
  height: 100%;
}

.music-scroll-layer {
  transform-box: view-box;
  transform-origin: center;
  will-change: transform;
}

.music-staff,
.music-notes,
.music-treble-clef {
  color: #2d6e7b;
}

.music-bass-clef {
  color: #e76530;
}

.music-staff {
  fill: none;
  opacity: 0.15;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 3;
}
.music-staff-lower { opacity: 0.22; }

.music-notes {
  fill: currentColor;
  opacity: 0.16;
}

.music-notes path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 6;
}

.music-ornament {
  transform-box: view-box;
  transform-origin: center;
  will-change: transform;
}

.music-ornament-upper { animation: home-ornament-drift 44s ease-in-out infinite alternate; }
.music-ornament-lower { animation: home-ornament-drift 52s ease-in-out infinite alternate-reverse; }

.music-clef {
  fill: currentColor;
}

.music-treble-clef {
  opacity: 0.13;
}

.music-bass-clef {
  opacity: 0.12;
}

@keyframes home-ornament-drift {
  from { transform: translate3d(-7px, 0, 0); }
  to { transform: translate3d(7px, 0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .music-scroll-layer,
  .music-ornament,
  .music-staff,
  .music-clef {
    animation: none !important;
    transform: none !important;
    will-change: auto;
  }
}
</style>
