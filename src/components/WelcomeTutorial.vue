<template>
  <div class="welcome-overlay">
    <section ref="dialog" class="welcome-dialog" role="dialog" aria-modal="true"
      aria-labelledby="welcome-title" aria-describedby="welcome-copy" tabindex="-1" :class="'welcome-step-'+step" @pointerdown="beginSwipe" @pointerup="endSwipe" @pointercancel="cancelSwipe">
      <header class="welcome-top">
        <span class="welcome-brand"><img src="static/icon-192.png" alt="" />{{$t('APP_BRAND_NAME')}}</span>
        <button class="welcome-skip" type="button" @click="finish(false)">{{$t('WELCOME_SKIP')}} <span aria-hidden="true">×</span></button>
      </header>
      <nav class="welcome-progress" :aria-label="$t('WELCOME_STEPS')">
        <button v-for="(label, index) in stepLabels" :key="label" type="button"
          :aria-current="step === index ? 'step' : null" :class="{current:step === index, passed:step > index}"
          @click="goTo(index)" :aria-label="$t(label)"><span>{{step > index ? '✓' : index + 1}}</span><span class="welcome-step-label">{{$t(label)}}</span></button>
      </nav>
      <div class="welcome-description" aria-live="polite">
        <span class="welcome-eyebrow">{{$t('WELCOME_KICKER')}}</span>
        <h2 id="welcome-title" ref="title" tabindex="-1">{{step === titles.length - 1 ? $t('WELCOME_TRY_TITLE', {note:trial.pitch[0]}) : $t(titles[step])}}</h2>
        <p id="welcome-copy" :class="{'welcome-copy-slot':step === titles.length - 1}">
          <template v-if="step === titles.length - 1"><span v-for="copy in [trial.copy,'WELCOME_RETRY','WELCOME_CORRECT']" :key="copy" class="welcome-copy-reserve" aria-hidden="true">{{$t(copy,{note:trial.pitch[0]})}}</span></template>
          <span class="welcome-copy-live">{{$t(step === titles.length - 1 ? solved ? 'WELCOME_CORRECT' : tried ? 'WELCOME_RETRY' : trial.copy : descriptions[step], {note:trial.pitch[0]})}}</span>
        </p>
      </div>
      <transition name="welcome-swipe" mode="out-in">
      <div :key="step" class="welcome-scene" :class="'welcome-scene-' + step">
        <div v-if="step === 0" class="welcome-discovery">
          <div class="welcome-modes">
          <button v-for="(mode, index) in modes" :key="mode.label" type="button" class="welcome-mode"
            :class="['welcome-mode-' + index, {active:discoverIndex === index,'mobile-current':index === Math.max(0,discoverIndex)}]"
            :style="{transform:'translateY(' + (index * 60 + (discoverIndex >= index ? 0 : 60)) + 'px)'}"
            :aria-pressed="discoverIndex === index ? 'true' : 'false'"
            :aria-label="$t(mode.label) + '. ' + $t(mode.copy)" @click="selectMode(index)">
            <span class="welcome-mode-symbol" aria-hidden="true">
              <svg v-if="index === 0" viewBox="0 0 48 48"><path d="M5 14h38M5 21h38M5 28h38M5 35h38M31 8v29"/><ellipse cx="25" cy="37" rx="6" ry="4"/></svg>
              <svg v-else-if="index === 1" viewBox="0 0 48 48"><path d="M4 33c12-18 20 15 40-10M14 29V14M28 32V17M42 22V7"/><circle cx="10" cy="29" r="4"/><circle cx="24" cy="32" r="4"/><circle cx="38" cy="22" r="4"/></svg>
              <svg v-else-if="index === 2" viewBox="0 0 48 48"><path d="m11 41 9-35h10l8 35zM7 41h35M24 35 35 13M19 20h12M17 29h12"/><circle cx="32" cy="20" r="3"/></svg>
              <svg v-else viewBox="0 0 48 48"><path d="M5 14h38M5 21h38M5 28h38M5 35h38M28 10v23M38 3v14M31 10h14"/><ellipse cx="22" cy="33" rx="6" ry="4"/></svg>
            </span>
            <div><strong>{{$t(mode.label)}}</strong><small v-if="index === 0" class="welcome-recommendation">{{$t('WELCOME_RECOMMEND')}}</small></div>
          </button>
          <transition name="welcome-swipe" mode="out-in">
            <div :key="Math.max(0,discoverIndex)" class="discovery-preview" :class="'discovery-preview-'+Math.max(0,discoverIndex)">
              <h3 class="preview-heading">{{$t(discoveryHeadings[Math.max(0,discoverIndex)])}}</h3>
              <svg class="discovery-art" viewBox="0 42 360 206" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                <g v-if="Math.max(0,discoverIndex) < 2">
                  <path v-for="y in [64,76,88,100,112]" :key="y" class="preview-staff" :d="'M42 '+y+'h274'"/>
                  <path class="preview-clef" :d="discoveryClefs.treble"/>
                  <g v-if="Math.max(0,discoverIndex) === 0" class="preview-single-note">
                    <path class="preview-staff" d="M166 124h34"/>
                    <ellipse class="preview-note" cx="181" cy="124" rx="8" ry="5.5" transform="rotate(-15 181 124)"/>
                    <path class="preview-stem" d="M188 123V82"/>
                  </g>
                  <g v-else>
                    <defs><clipPath id="welcome-flow-preview-clip"><rect x="94" y="45" width="222" height="100"/></clipPath></defs>
                    <rect class="preview-hit-zone" x="98" y="53" width="25" height="84" rx="8"/>
                    <path class="preview-hit-line" d="M110 52v86"/>
                    <g clip-path="url(#welcome-flow-preview-clip)">
                      <g class="preview-flow-notes">
                        <g v-for="(y,index) in [100,94,82,94,106]" :key="index" :transform="'translate('+(160+index*56)+' 0)'">
                          <ellipse class="preview-note" cx="0" :cy="y" rx="7.5" ry="5" :transform="'rotate(-15 0 '+y+')'"/>
                          <path class="preview-stem" :d="'M7 '+(y-1)+'v-35'"/>
                        </g>
                      </g>
                    </g>
                  </g>
                  <g class="preview-keyboard">
                    <g v-for="(note,index) in ['C','D','E','F','G','A','B','C']" :key="index">
                      <rect class="preview-white-key" :class="{'preview-answer-key':Math.max(0,discoverIndex)===0 && index===0,'preview-flow-key':discoverIndex===1 && [2,4,6].includes(index)}" :style="{animationDelay:discoverIndex===1 ? (-index*.25)+'s' : null}" :x="44+index*34" y="174" width="34" height="56" rx="5"/>
                      <text class="preview-key-label" :x="61+index*34" y="218">{{note==='B' ? $t('WELCOME_NOTE_B') : note}}</text>
                    </g>
                    <rect v-for="index in [1,2,4,5,6]" :key="'black-'+index" class="preview-black-key" :x="34+index*34" y="174" width="20" height="33" rx="3"/>
                  </g>
                  <g v-if="Math.max(0,discoverIndex) === 0" class="preview-answer-check">
                    <circle cx="277" cy="133" r="14"/><path d="m270 133 5 5 9-11"/>
                  </g>
                </g>
                <g v-else-if="discoverIndex === 2" class="preview-rhythm">
                  <circle v-for="index in [0,1,2,3]" :key="index" class="preview-beat" :style="{animationDelay:(index*.75)+'s'}" :cx="105+index*50" cy="65" r="8"/>
                  <circle class="preview-drum-rim" cx="180" cy="158" r="59"/>
                  <circle class="preview-drum-skin" cx="180" cy="158" r="49"/>
                  <circle class="preview-drum-grain" cx="180" cy="158" r="15"/>
                  <circle class="preview-drum-ripple" cx="180" cy="158" r="53"/>
                  <g class="preview-drumstick"><path class="preview-stick-shadow" d="m258 96-63 48"/><path d="m258 92-63 48"/><ellipse cx="192" cy="142" rx="9" ry="5" transform="rotate(-38 192 142)"/></g>
                </g>
                <g v-else class="preview-workshop">
                  <rect class="preview-selected-bar" x="87" y="54" width="112" height="122" rx="9"/>
                  <path v-for="y in [64,74,84,94,104,130,140,150,160,170]" :key="y" class="preview-staff" :d="'M42 '+y+'h274'"/>
                  <path class="preview-clef" :d="discoveryClefs.workshopTreble"/><path class="preview-clef" :d="discoveryClefs.bass"/>
                  <path class="preview-staff" d="M88 64v106M200 64v106M316 64v106"/>
                  <g v-for="(y,index) in [94,84,79,89,84,74,79,94]" :key="index">
                    <ellipse class="preview-note" :cx="103+index*28" :cy="y" rx="6" ry="4" :transform="'rotate(-15 '+(103+index*28)+' '+y+')'"/>
                    <path class="preview-stem" :d="'M'+(108+index*28)+' '+(y-1)+'v-23'"/>
                  </g>
                  <g v-for="x in [104,216,272]" :key="x">
                    <ellipse v-for="y in [135,145,155]" :key="y" class="preview-note" :cx="x" :cy="y" rx="6" ry="4" :transform="'rotate(-15 '+x+' '+y+')'"/>
                    <path class="preview-stem" :d="'M'+(x+5)+' 154v-42'"/>
                  </g>
                  <g class="preview-workshop-cursor"><path d="M95 57v117"/><path d="m90 52h10l-5 7z"/></g>
                  <rect class="preview-bar-chip preview-bar-chip-active" x="44" y="195" width="128" height="32" rx="10"/>
                  <rect class="preview-bar-chip" x="184" y="195" width="132" height="32" rx="10"/>
                  <text x="108" y="216">{{$t('WORKSHOP_BAR',{number:1})}}</text><text x="250" y="216">{{$t('WORKSHOP_BAR',{number:2})}}</text>
                </g>
              </svg>
              <p class="discovery-caption">{{$t(modes[Math.max(0,discoverIndex)].copy)}}</p>
            </div>
          </transition>
          <transition name="welcome-mode-copy" mode="out-in">
            <p v-if="discoverIndex >= 0" :key="discoverIndex" class="welcome-mode-copy"
              :style="{top:(discoverIndex * 60 + 62) + 'px'}">{{$t(modes[discoverIndex].copy)}}</p>
          </transition>
          </div>
          <div class="welcome-mode-dots" role="group" :aria-label="$t('WELCOME_STEP_MODES')"><button v-for="(mode,index) in modes" :key="mode.label" type="button" :aria-label="$t(mode.label)" :aria-pressed="discoverIndex===index" @click="selectMode(index)"><span aria-hidden="true"></span></button></div>
          <button type="button" class="welcome-discovery-toggle" :aria-pressed="discoverPaused ? 'true' : 'false'"
            :aria-label="$t(discoverPaused ? 'WELCOME_AUTO_RESUME' : 'WELCOME_AUTO_PAUSE')" @click="toggleDiscoveryRotation">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path v-if="discoverPaused" d="m7 4 9 6-9 6z"/><path v-else d="M6 4h3v12H6zM12 4h3v12h-3z"/></svg>
          </button>
        </div>
        <div v-else-if="step === 1" class="welcome-input-scene">
          <div class="welcome-input-frame">
            <h3 class="input-preview-heading">{{$t(inputOption.title)}}</h3>
            <div class="welcome-input-illustration" aria-hidden="true">
              <transition name="welcome-swipe" mode="out-in">
                <svg :key="input" class="input-device-demo" :class="'input-device-'+input" viewBox="0 0 360 270">
                  <g v-if="input === 'button'" class="input-screen-buttons">
                    <rect class="input-tablet" x="24" y="34" width="312" height="194" rx="19"/>
                    <rect class="input-display" x="36" y="47" width="288" height="168" rx="8"/>
                    <circle class="input-camera" cx="30" cy="131" r="2"/>
                    <path v-for="y in [64,72,80,88,96]" :key="y" class="staff-line" :d="'M56 '+y+'h248'"/>
                    <path class="input-clef" :d="inputClefs.buttons"/>
                    <path class="staff-line" d="M164 104h34"/><ellipse class="input-note" cx="180" cy="104" rx="7" ry="5" transform="rotate(-15 180 104)"/><path class="input-note-stem" d="M186 103V75"/>
                    <g v-for="(note,index) in ['C','D','E','F','G','A','B']" :key="note">
                      <rect class="input-note-button" :class="{'input-button-active':index===0}" :x="49+index*37.5" y="168" width="32" height="31" rx="10"/>
                      <text class="input-button-label" :x="65+index*37.5" y="189">{{note==='B' ? $t('WELCOME_NOTE_B') : note}}</text>
                    </g>
                    <g v-for="(note,index) in ['C','D','F','G','A']" :key="'sharp-'+note">
                      <rect class="input-sharp-button" :x="70+[0,1,3,4,5][index]*37.5" y="131" width="28" height="27" rx="8"/>
                      <text class="input-sharp-label" :x="84+[0,1,3,4,5][index]*37.5" y="149">{{note}}♯</text>
                    </g>
                    <circle class="tap-halo" cx="65" cy="181" r="19"/>
                  </g>
                  <g v-else-if="input === 'keyboard'" class="input-screen-keyboard">
                    <rect class="input-tablet" x="22" y="44" width="316" height="172" rx="19"/>
                    <rect class="input-display" x="36" y="60" width="288" height="142" rx="8"/>
                    <circle class="input-camera" cx="29" cy="131" r="2"/>
                    <path v-for="y in [78,86,94,102,110]" :key="y" class="staff-line" :d="'M56 '+y+'h248'"/>
                    <path class="input-clef" :d="inputClefs.keyboard"/>
                    <path class="staff-line" d="M164 118h34"/><ellipse class="input-note" cx="180" cy="118" rx="7" ry="5" transform="rotate(-15 180 118)"/><path class="input-note-stem" d="M186 117V88"/>
                    <g v-for="(note,index) in ['C','D','E','F','G','A','B','C']" :key="index">
                      <rect class="input-screen-key" :class="{'input-button-active':index===0}" :x="52+index*32" y="139" width="32" height="58" rx="4"/>
                      <text class="input-key-label" :x="68+index*32" y="188">{{note==='B' ? $t('WELCOME_NOTE_B') : note}}</text>
                    </g>
                    <rect v-for="index in [1,2,4,5,6]" :key="'black-'+index" class="input-screen-black" :x="42+index*32" y="139" width="20" height="34" rx="3"/>
                    <circle class="tap-halo" cx="68" cy="179" r="19"/>
                  </g>
                  <g v-else class="input-midi-instrument">
                    <rect class="input-tablet" x="141" y="15" width="78" height="99" rx="12"/>
                    <rect class="input-display" x="148" y="28" width="64" height="74" rx="5"/>
                    <path d="M168 22h24"/><circle class="connected-light" cx="205" cy="36" r="3"/>
                    <path v-for="y in [40,47,54,61,68]" :key="y" class="staff-line input-phone-staff" :d="'M156 '+y+'h49'"/>
                    <path class="input-clef" :d="inputClefs.midi"/>
                    <path class="staff-line" d="M181 75h22"/><ellipse class="input-note" cx="191" cy="75" rx="4.5" ry="3" transform="rotate(-15 191 75)"/><path class="input-note-stem" d="M195 74V52"/>
                    <path class="input-midi-cable" d="M180 114v7q0 8 16 8h28q18 0 18 9"/>
                    <path class="input-midi-signal" d="M180 114v7q0 8 16 8h28q18 0 18 9"/>
                    <text class="input-connection-label" x="278" y="121">USB / MIDI</text>
                    <rect class="input-midi-case" x="18" y="134" width="324" height="92" rx="10"/>
                    <rect class="input-midi-front" x="20" y="214" width="320" height="12" rx="5"/>
                    <text class="input-hardware-label" x="45" y="150">MIDI</text>
                    <rect class="input-midi-display" x="76" y="140" width="46" height="11" rx="3"/>
                    <path class="input-midi-slider" d="M141 145h37M153 141v8"/>
                    <circle v-for="x in [281,296,311]" :key="x" class="input-midi-knob" :cx="x" cy="145" r="4"/>
                    <circle class="connected-light" cx="329" cy="145" r="3"/>
                    <rect v-for="index in 14" :key="index" class="input-hardware-key" :class="{'input-button-active':index===8}" :x="33+(index-1)*21" y="158" width="21" height="56" rx="2"/>
                    <rect v-for="index in [1,2,4,5,6,8,9,11,12,13]" :key="'black-'+index" class="input-hardware-black" :x="26+index*21" y="158" width="14" height="34" rx="2"/>
                    <rect class="input-usb-plug" x="236" y="128" width="12" height="11" rx="2"/>
                    <circle class="tap-halo" cx="190" cy="197" r="16"/>
                  </g>
                  <g class="touch-hand" :transform="inputHandPositions[input]">
                    <g class="input-demo-hand">
                      <path class="hand-outline" d="M23 45V14c0-5 3-8 7-8s7 3 7 8v20c4-3 9-1 10 4 5-3 10 1 10 6v13c0 10-4 15-8 20H28c-2-5-6-8-10-13L8 53c-3-4-2-8 1-10s6-1 9 2l5 5z"/>
                      <path class="hand-folds" d="M37 35v13M47 39v12M23 50c7 4 11 10 11 16"/>
                      <rect class="hand-nail" x="26" y="12" width="8" height="10" rx="3"/>
                      <rect class="hand-cuff" x="26" y="75" width="26" height="9" rx="3"/>
                    </g>
                  </g>
                </svg>
              </transition>
            </div>
            <button type="button" class="welcome-auto-toggle" :aria-pressed="inputPaused ? 'true' : 'false'"
              :aria-label="$t(inputPaused ? 'WELCOME_AUTO_RESUME' : 'WELCOME_AUTO_PAUSE')"
              :title="$t(inputPaused ? 'WELCOME_AUTO_RESUME' : 'WELCOME_AUTO_PAUSE')" @click="toggleInputRotation">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path v-if="inputPaused" d="m7 4 9 6-9 6z"/><path v-else d="M6 4h3v12H6zM12 4h3v12h-3z"/></svg>
            </button>
          </div>
          <div class="welcome-input-options" role="group" :aria-label="$t('WELCOME_INPUT_SELECT')">
            <button v-for="option in inputs" :key="option.id" type="button" :aria-label="$t(option.title)" :aria-pressed="input === option.id ? 'true' : 'false'"
              :class="{selected:input === option.id}" @click="selectInput(option.id)"><span aria-hidden="true"></span></button>
          </div>
        </div>
        <div v-else-if="step === 2" class="welcome-personalize" :class="{paused:personalPaused}">
          <div class="personal-stage">
            <transition name="welcome-swipe" mode="out-in">
              <article :key="personalIndex" class="personal-preview" :class="'personal-preview-' + personalSection.id">
                <header><strong>{{$t(personalSection.label)}}</strong><p v-if="personalSection.id !== 'keys'">{{$t(personalSection.copy)}}</p></header>
                <svg v-if="personalSection.id === 'range'" class="personal-demo personal-demo-range" viewBox="0 0 360 220" aria-hidden="true">
                  <defs>
                    <linearGradient id="welcome-range-white" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".7" stop-color="#fffdf9"/><stop offset="1" stop-color="#f3ebe0"/></linearGradient>
                    <linearGradient id="welcome-range-black" x2="0" y2="1"><stop stop-color="#315f67"/><stop offset=".72" stop-color="#244b53"/><stop offset="1" stop-color="#18383f"/></linearGradient>
                  </defs>
                  <rect class="demo-keyboard-case" x="20" y="64" width="320" height="106" rx="8"/>
                  <rect v-for="i in 15" :key="i" class="demo-white-key" :x="24 + (i - 1) * 20.8" y="68" width="20.8" height="96" rx="4"/>
                  <rect v-for="i in 15" :key="'selected'+i" class="demo-range-key" :class="{'demo-range-edge':i === 1 || i === 15}" :x="24 + (i - 1) * 20.8" y="68" width="20.8" height="96" rx="4"/>
                  <rect v-for="i in [0,1,3,4,5,7,8,10,11,12]" :key="'black'+i" class="demo-black-key" :x="38 + i * 20.8" y="68" width="13" height="58" rx="3"/>
                  <g class="demo-range-left"><path d="M24 51v17"/><circle cx="24" cy="48" r="10"/><path d="m21 44 4 4-4 4"/></g>
                  <g class="demo-range-right"><path d="M336 51v17"/><circle cx="336" cy="48" r="10"/><path d="m339 44-4 4 4 4"/></g>
                  <text x="34" y="191">C3</text><text x="180" y="191">C4</text><text x="326" y="191">C5</text>
                </svg>
                <WelcomeAccidentalPreview v-else-if="personalSection.id === 'keys'" :playing="!personalPaused" @pause="pausePersonalRotation">{{$t(personalSection.copy)}}</WelcomeAccidentalPreview>
                <svg v-else-if="personalSection.id === 'circle'" class="personal-demo personal-demo-circle" viewBox="0 0 260 270" aria-hidden="true">
                  <circle class="demo-circle-ring" cx="130" cy="123" r="86"/>
                  <path class="demo-circle-direction circle-state-d" d="M131 15 A108 108 0 0 1 223 69"/>
                  <path class="demo-circle-arrow circle-state-d" d="m226 76-11-7 10-5z"/>
                  <g class="circle-state-f" transform="translate(260 0) scale(-1 1)"><path class="demo-circle-direction" d="M131 15 A108 108 0 0 1 177 26"/><path class="demo-circle-arrow" d="m185 30-12-1 5-9z"/></g>
                  <g v-for="(node,index) in circleNotes" :key="index">
                    <circle class="demo-circle-node" :cx="130 + (node.x - 60) * 2" :cy="123 + (node.y - 60) * 2" r="15"/>
                    <circle v-if="index === 0 || index === 2 || index === 11" class="demo-circle-selected" :class="index===0 ? 'circle-state-c' : index===2 ? 'circle-state-d' : 'circle-state-f'" :cx="130 + (node.x - 60) * 2" :cy="123 + (node.y - 60) * 2" r="15"/>
                    <text :x="130 + (node.x - 60) * 2" :y="128 + (node.y - 60) * 2">{{node.label}}</text>
                  </g>
                  <circle class="demo-circle-center" cx="130" cy="123" r="58"/>
                  <g v-for="(key,index) in circleKeys" :key="key.title" :class="'circle-state-'+key.id">
                    <text class="demo-circle-tonic" x="130" y="91">{{$t(key.title)}}</text>
                    <path class="circle-staff" d="M86 114h88M86 122h88M86 130h88M86 138h88M86 146h88"/>
                    <path class="circle-clef" :d="circleClef"/>
                    <path v-if="key.accidental" class="circle-signature" :d="key.accidental"/>
                    <ellipse class="circle-note" cx="152" :cy="key.y" rx="3.5" ry="2.5" :transform="'rotate(-15 152 '+key.y+')'"/><path class="circle-note-stem" :d="'M155 '+key.y+'v-22'"/>
                    <text class="demo-circle-caption" x="130" y="164">{{$t(key.caption)}}</text>
                  </g>
                  <rect class="demo-tonality-badge" x="25" y="234" width="210" height="30" rx="10"/>
                  <text v-for="key in circleKeys" :key="key.id" class="demo-circle-explanation" :class="'circle-state-'+key.id" x="130" y="254">{{$t(key.explanation)}}</text>
                </svg>
                <svg v-else-if="personalSection.id === 'tempo'" class="personal-demo" viewBox="110 10 140 180" aria-hidden="true">
                  <path class="demo-metronome" d="m128 151 33-128h38l33 128z"/><path class="demo-staff" d="M155 69h50M147 102h66"/>
                  <g class="demo-pendulum"><path d="M180 138V39"/><rect x="173" y="64" width="14" height="19" rx="3"/><circle cx="180" cy="138" r="5"/></g>
                  <text x="180" y="178">90 BPM</text>
                </svg>
                <svg v-else-if="personalSection.id === 'values'" class="personal-demo personal-demo-values" viewBox="0 0 360 240" aria-hidden="true">
                  <rect v-for="x in [12,128,244]" :key="x" class="setting-choice" :x="x" y="8" width="104" height="38" rx="11"/>
                  <rect class="setting-choice-active" x="128" y="8" width="104" height="38" rx="11"/><rect class="setting-choice-active custom-phase-b" x="244" y="8" width="104" height="38" rx="11"/>
                  <text v-for="(label,i) in ['WELCOME_DEMO_HALF','WELCOME_DEMO_QUARTER','WELCOME_DEMO_EIGHTH']" :key="label" :x="64+i*116" y="33">{{$t(label)}}</text>
                  <text class="setting-caption custom-phase-a" x="180" y="70">{{$t('WELCOME_VALUES_QUARTERS')}}</text><text class="setting-caption custom-phase-b" x="180" y="70">{{$t('WELCOME_VALUES_MIXED')}}</text>
                  <path v-for="y in [84,92,100,108,116]" :key="y" class="demo-staff" :d="'M28 '+y+'h302'"/><path class="setting-clef" :d="personalClefs.values"/>
                  <text class="setting-time" x="78" y="100">4</text><text class="setting-time" x="78" y="116">4</text>
                  <g v-for="(pattern,index) in noteValuePatterns" :key="index" :class="index===0 ? 'custom-phase-a' : 'custom-phase-b'">
                    <g v-for="note in pattern" :key="note.x"><ellipse class="setting-example-note" :cx="note.x" cy="108" rx="6" ry="4.5" :transform="'rotate(-15 '+note.x+' 108)'"/><path class="setting-note-stem" :d="'M'+(note.x+6)+' 107V77'"/></g>
                    <path v-if="index===1" class="setting-beam" d="M224 77h24M278 77h24"/>
                  </g>
                  <g v-for="i in [0,1,2,3]" :key="'beat'+i"><rect class="setting-beat-cell" :x="89+i*54" y="160" width="42" height="34" rx="9"/><text :x="110+i*54" y="183">{{i+1}}</text></g>
                  <circle class="setting-beat-cursor" cx="110" cy="207" r="4"/>
                  <text class="setting-caption" x="180" y="232">{{$t('WELCOME_VALUES_RESULT')}}</text>
                </svg>
                <svg v-else class="personal-demo personal-demo-hands" viewBox="0 0 360 320" aria-hidden="true">
                  <rect class="setting-choice" x="22" y="8" width="148" height="36" rx="11"/><rect class="setting-choice" x="190" y="8" width="148" height="36" rx="11"/>
                  <rect class="setting-choice-active custom-phase-a" x="22" y="8" width="148" height="36" rx="11"/><rect class="setting-choice-active custom-phase-b" x="190" y="8" width="148" height="36" rx="11"/>
                  <text x="96" y="32">{{$t('WELCOME_HAND_RIGHT_ONLY')}}</text><text x="264" y="32">{{$t('WELCOME_HAND_BOTH')}}</text>
                  <path v-for="y in [70,78,86,94,102,124,132,140,148,156]" :key="y" class="demo-staff" :d="'M30 '+y+'h300'"/>
                  <path class="setting-clef" :d="personalClefs.handTreble"/><path class="setting-clef" :d="personalClefs.handBass"/>
                  <g class="setting-right-hand"><ellipse cx="180" cy="94" rx="6" ry="4.5"/><path d="M186 93V64"/><ellipse cx="244" cy="82" rx="6" ry="4.5"/><path d="M250 81V52"/></g>
                  <g class="setting-left-hand custom-phase-b"><ellipse cx="110" cy="144" rx="6" ry="4.5"/><path d="M116 143V117"/><ellipse cx="160" cy="136" rx="6" ry="4.5"/><path d="M166 135V109"/></g>
                  <rect v-for="i in 15" :key="i" class="demo-example-white" :x="26+(i-1)*20.5" y="178" width="20.5" height="68" rx="4"/>
                  <rect v-for="i in 7" :key="'left'+i" class="setting-left-key custom-phase-b" :x="26+(i-1)*20.5" y="178" width="20.5" height="68" rx="4"/>
                  <rect v-for="i in 8" :key="'right'+i" class="setting-right-key" :x="169.5+(i-1)*20.5" y="178" width="20.5" height="68" rx="4"/>
                  <rect v-for="i in [0,1,3,4,5,7,8,10,11,12]" :key="'black'+i" class="demo-example-black" :x="40+i*20.5" y="178" width="13" height="38" rx="3"/>
                  <g v-for="side in ['left','right']" :key="side" :class="'setting-piano-hand setting-piano-hand-'+side" :transform="side==='left' ? 'translate(135 209) scale(-.72 .72)' : 'translate(218 209) scale(.72)'">
                    <g class="setting-hand-tap">
                      <path class="setting-hand-silhouette" :d="personalHandPath"/>
                      <path class="setting-hand-light" d="M36 59C45 53 65 53 76 62L69 96H47Z"/>
                      <path class="setting-hand-tendons" d="M40 64C42 76 45 87 47 96M56 62C57 75 58 86 59 96M72 64C71 76 70 86 68 96"/>
                      <path class="setting-hand-knuckles" d="M35 52q5-3 10 0M52 51q5-3 10 0M69 55q5-3 9 0"/>
                      <rect v-for="nail in [{x:9,y:56,r:-40},{x:26,y:26,r:-8},{x:44,y:15,r:0},{x:64,y:21,r:8},{x:82,y:36,r:15}]" :key="nail.x" class="setting-hand-nail" :x="nail.x" :y="nail.y" width="7" height="7" rx="2.5" :transform="'rotate('+nail.r+' '+(nail.x+3.5)+' '+(nail.y+3.5)+')'"/>
                      <rect class="setting-hand-cuff" x="32" y="100" width="43" height="13" rx="5"/>
                    </g>
                  </g>
                  <text class="setting-left-label" x="98" y="310">{{$t('WELCOME_HAND_LEFT')}}</text><text class="setting-right-label" x="252" y="310">{{$t('WELCOME_HAND_RIGHT')}}</text>
                </svg>
              </article>
            </transition>
            <button type="button" class="welcome-auto-toggle" :aria-pressed="personalPaused ? 'true' : 'false'" :aria-label="$t(personalPaused ? 'WELCOME_AUTO_RESUME' : 'WELCOME_AUTO_PAUSE')" @click="togglePersonalRotation">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path v-if="personalPaused" d="m7 4 9 6-9 6z"/><path v-else d="M6 4h3v12H6zM12 4h3v12h-3z"/></svg>
            </button>
          </div>
          <div class="personal-topics" role="group" :aria-label="$t('WELCOME_STEP_PERSONAL')">
            <button v-for="(section,index) in personalSections" :key="section.id" type="button" :class="{selected:personalIndex === index}" :aria-pressed="personalIndex === index ? 'true' : 'false'" :aria-label="$t(section.label)" :title="$t(section.label)" @click="selectPersonal(index)">
              <svg v-if="section.id === 'circle'" class="personal-circle-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke-width=".8"/>
                <circle v-for="(node,nodeIndex) in circleNotes" :key="nodeIndex" :cx="12 + (node.x - 60) * 9 / 43" :cy="12 + (node.y - 60) * 9 / 43" :r="nodeIndex === 0 ? 1.8 : 1.2" fill="currentColor" stroke="none"/>
                <path d="M13 14V8l3 1"/><ellipse cx="11" cy="14.5" rx="2" ry="1.5" fill="currentColor" stroke="none"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="section.icon"/></svg><span>{{$t(section.label)}}</span>
            </button>
          </div>
        </div>
        <div v-else class="welcome-try" :class="{solved}">
          <div class="welcome-trial-heading">
            <strong>{{$t(trial.clef === 'treble' ? 'WELCOME_CLEF_TREBLE' : 'WELCOME_CLEF_BASS')}}</strong>
            <span class="welcome-trial-notes" aria-hidden="true"><span :class="{current:tryIndex % 2 === 0}">C</span> → <span :class="{current:tryIndex % 2 === 1}">{{trial.clef === 'treble' ? 'G' : 'F'}}</span></span>
          </div>
          <div class="welcome-sheet" :class="{'has-tip':solved && trial.tip}">
          <svg class="welcome-staff" viewBox="0 0 280 116" role="img" :aria-hidden="solved && trial.tip ? 'true' : null"
            :aria-label="$t('WELCOME_STAFF_NOTE', {note:demoKeyLabel(trial.pitch), clef:$t(trial.clef === 'treble' ? 'WELCOME_CLEF_TREBLE' : 'WELCOME_CLEF_BASS')})">
            <path v-if="solved && trial.tip" class="welcome-reference-glow" :d="'M26 ' + trial.y + 'h228'"/>
            <path class="staff-line" d="M25 32h230M25 44h230M25 56h230M25 68h230M25 80h230"/>
            <path v-if="solved && trial.tip" class="welcome-reference-line" :d="'M26 ' + trial.y + 'h228'"/>
            <path class="welcome-clef" :d="clefPaths[trial.clef]"/>
            <g class="welcome-note">
              <path v-if="trial.pitch === 'C4'" class="welcome-ledger" :d="'M136 ' + trial.y + 'h32'"/>
              <ellipse class="welcome-notehead" cx="152" :cy="trial.y" rx="8.5" ry="5.6" :transform="'rotate(-17 152 ' + trial.y + ')'"/>
              <path class="welcome-note-stem" :d="trial.clef === 'treble' ? 'M159.5 ' + (trial.y - 2) + 'v-41' : 'M144.5 ' + (trial.y + 2) + 'v41'"/>
            </g>
            <text v-if="solved" class="welcome-note-check" x="184" :y="trial.y + 8">✓</text>
          </svg>
          <div v-if="solved && trial.tip" class="welcome-memory-tip" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7M8 16h8v4H8zM10 23h4M12 5v5l-2 2"/></svg>
            <div class="welcome-memory-copy"><strong>{{$t('WELCOME_TIP_LABEL')}}</strong><p>{{$t(trial.tip)}}</p>
              <svg class="welcome-memory-clef" viewBox="20 0 230 116" role="img" :aria-label="$t(trial.tip)">
                <rect class="memory-canvas" x="21" y="1" width="228" height="114" rx="12"/>
                <path v-for="y in [32,44,56,68,80]" :key="y" class="memory-staff-line" :d="'M27 ' + y + 'h198'"/>
                <path class="memory-highlight-line" :d="'M27 ' + trial.y + 'h198'"/>
                <path class="memory-clef-glyph" :d="clefPaths[trial.clef]"/>
                <circle class="memory-point-halo" pathLength="100" :cx="trial.clef === 'bass' ? 44 : 55" :cy="trial.y" :r="trial.clef === 'bass' ? 11 : 17"/>
                <path class="memory-pointer-outline" pathLength="100" :d="trial.clef === 'bass' ? 'M158 24Q116 16 76 29' : 'M158 24Q119 24 85 46'"/>
                <path class="memory-pointer" pathLength="100" :d="trial.clef === 'bass' ? 'M158 24Q116 16 76 29' : 'M158 24Q119 24 85 46'"/>
                <path class="memory-arrowhead" :d="trial.clef === 'bass' ? 'M63 35 74 22 80 34Z' : 'M74 54 79 39 91 50Z'"/>
                <rect class="memory-note-badge" x="158" y="7" width="48" height="34" rx="10"/>
                <text x="182" y="30">{{trial.pitch[0]}}</text>
              </svg>
            </div>
          </div>
          </div>
          <div class="welcome-piano" :class="['welcome-target-' + trial.pitch[0], 'welcome-played-' + playedKey]" role="group" :aria-label="$t('WELCOME_TRY_KEYS')">
            <KeyboardInput compact @solved="playKey"/>
            <div class="welcome-key-labels" aria-hidden="true"><span v-for="(note,index) in ['C','D','E','F','G','A','B','C']" :key="index">{{note === 'B' ? $t('WELCOME_NOTE_B') : note}}</span></div>
          </div>
        </div>
      </div>
      </transition>
      <footer class="welcome-actions">
        <button class="welcome-back" type="button" :disabled="step === 0" @click="back">← {{$t('BACK')}}</button>
        <button class="welcome-next" type="button" @click="next">{{$t(nextLabel, {note:tryIndex === 0 ? 'G4' : 'F3'})}} <span aria-hidden="true">→</span></button>
      </footer>
    </section>
  </div>
</template>

<script>
import Glyphs from 'abcjs/src/write/creation/glyphs';
import { createModalFocusGuard } from '../model/ModalFocus';
import { formatNoteFlowTonic } from '../model/NoteFlowKeyLabels';
import KeyboardInput from './KeyboardInput';
import WelcomeAccidentalPreview from './WelcomeAccidentalPreview';

function glyph(name,x,y,scale) {
  return Glyphs.getPathForSymbol(x,y,name,scale,scale).map(part => part.join(' ')).join('');
}

// Staff lines are 12 units apart. ABCJS clefs use 7.5 units, so 1.6 aligns
// the treble loop to G4 and the bass dots around F3 without font substitution.
const clefPaths = {
  treble: Glyphs.getPathForSymbol(39,68,'clefs.G',1.6,1.6).map(part => part.join(' ')).join(''),
  bass: Glyphs.getPathForSymbol(39,44,'clefs.F',1.6,1.6).map(part => part.join(' ')).join('')
};
const trials = [
  {pitch:'C4',clef:'treble',y:92,copy:'WELCOME_TRY_C_TREBLE'},
  {pitch:'G4',clef:'treble',y:68,copy:'WELCOME_TRY_G_TREBLE',tip:'WELCOME_TIP_TREBLE'},
  {pitch:'C4',clef:'bass',y:20,copy:'WELCOME_TRY_C_BASS'},
  {pitch:'F3',clef:'bass',y:44,copy:'WELCOME_TRY_F_BASS',tip:'WELCOME_TIP_BASS'}
];
export default {
  name: 'WelcomeTutorial',
  components: { KeyboardInput, WelcomeAccidentalPreview },
  data() {
    return {
      step: 0, input: 'button', inputPaused: false, solved: false, tried: false, tryIndex: 0, playedKey: null,
      discoverIndex: -1, discoverPaused: false,
      personalIndex: 0, personalPaused: false,
      clefPaths, swipeStart:null,
      inputClefs:{buttons:glyph('clefs.G',72,88,8/7.5),keyboard:glyph('clefs.G',67,102,8/7.5),midi:glyph('clefs.G',158,61,7/7.5)},
      inputHandPositions:{button:'translate(45 176) scale(.65)',keyboard:'translate(48 175) scale(.65)',midi:'translate(170 193) scale(.65)'},
      discoveryHeadings:['WELCOME_PREVIEW_SINGLE','WELCOME_PREVIEW_FLOW','WELCOME_PREVIEW_RHYTHM','WELCOME_PREVIEW_WORKSHOP'],
      discoveryClefs:{treble:glyph('clefs.G',55,100,12/7.5),workshopTreble:glyph('clefs.G',51,94,10/7.5),bass:glyph('clefs.F',51,140,10/7.5)},
      circleClef:glyph('clefs.G',94,138,8/7.5),
      circleKeys:[
        {id:'c',title:'WELCOME_DEMO_C_MAJOR',caption:'WELCOME_DEMO_NO_ACCIDENTALS',explanation:'WELCOME_DEMO_F_NATURAL',y:126},
        {id:'d',title:'WELCOME_DEMO_D_MAJOR',caption:'WELCOME_DEMO_TWO_SHARPS',explanation:'WELCOME_DEMO_D_SHARPS',y:122,accidental:glyph('accidentals.sharp',114,114,8/7.5)+' '+glyph('accidentals.sharp',125,126,8/7.5)},
        {id:'f',title:'WELCOME_DEMO_F_MAJOR',caption:'WELCOME_DEMO_ONE_FLAT',explanation:'WELCOME_DEMO_B_FLAT',y:142,accidental:glyph('accidentals.flat',116,130,8/7.5)}
      ],
      personalClefs:{keys:glyph('clefs.G',39,108,12/7.5),values:glyph('clefs.G',36,108,8/7.5),handTreble:glyph('clefs.G',39,94,8/7.5),handBass:glyph('clefs.F',39,132,8/7.5)},
      personalHandPath:'M36 105C34 94 26 85 17 77L7 65C3 60 4 55 8 53C12 51 17 54 25 62L22 35C21 26 24 19 29 19C34 19 37 24 38 31L40 48L39 23C39 14 42 9 47 9C53 9 56 15 56 22L57 47L59 25C60 17 64 13 69 15C74 17 76 22 75 30L74 51L78 38C80 30 84 28 88 31C93 34 93 41 91 48L85 76C83 86 76 94 74 105Z',
      noteValuePatterns:[[{x:110,beats:1},{x:164,beats:1},{x:218,beats:1},{x:272,beats:1}],[{x:110,beats:1},{x:164,beats:1},{x:218,beats:.5},{x:242,beats:.5},{x:272,beats:.5},{x:296,beats:.5}]],
      personalSections: [
        {id:'range',label:'WELCOME_PERSONAL_RANGE',copy:'WELCOME_PERSONAL_RANGE_COPY',icon:'M3 7h18v13H3zM7 7v13M12 7v13M17 7v13M5 3h14'},
        {id:'keys',label:'WELCOME_PERSONAL_KEYS',copy:'WELCOME_PERSONAL_KEYS_COPY',icon:'M4 8h16M4 16h16M9 3 7 21M17 3l-2 18'},
        {id:'circle',label:'WELCOME_PERSONAL_CIRCLE_TITLE',copy:'WELCOME_PERSONAL_CIRCLE_COPY'},
        {id:'tempo',label:'WELCOME_PERSONAL_TEMPO',copy:'WELCOME_PERSONAL_TEMPO_COPY',icon:'m5 21 4-18h6l4 18zM3 21h18M12 17l6-12'},
        {id:'values',label:'WELCOME_PERSONAL_VALUES',copy:'WELCOME_PERSONAL_VALUES_COPY',icon:'M9 17V3l10 3v14M9 6l10 3M9 17c-7-4-8 5-2 4l2-1M19 20c-6-4-8 4-2 3l2-1'},
        {id:'hands',label:'WELCOME_PERSONAL_HANDS',copy:'WELCOME_PERSONAL_HANDS_COPY',icon:'M8 20 3 13q-1-3 2-2l3 3V5q2-3 3 0v7-8q2-3 3 0v8-6q2-3 3 0v7-3q2-3 3 0v6l-3 5z'}
      ],
      stepLabels: ['WELCOME_STEP_MODES','WELCOME_STEP_INPUT','WELCOME_STEP_PERSONAL','WELCOME_STEP_TRY'],
      titles: ['WELCOME_TITLE_MODES','WELCOME_TITLE_INPUT','WELCOME_TITLE_PERSONAL','WELCOME_TITLE_TRY'],
      descriptions: ['WELCOME_COPY_MODES','WELCOME_COPY_INPUT','WELCOME_COPY_PERSONAL','WELCOME_COPY_TRY'],
      inputs: [{id:'button',label:'WELCOME_INPUT_BUTTONS',title:'WELCOME_INPUT_BUTTONS_TITLE'},{id:'keyboard',label:'WELCOME_INPUT_PIANO',title:'WELCOME_INPUT_PIANO_TITLE'},{id:'midi',label:'WELCOME_INPUT_MIDI',title:'WELCOME_INPUT_MIDI_TITLE'}],
      modes: [
        {label:'HOME_SINGLE_NOTES',copy:'WELCOME_DISCOVER_SINGLE'},
        {label:'HOME_NOTE_FLOW',copy:'WELCOME_DISCOVER_FLOW'},
        {label:'HOME_RHYTHM_SENSE',copy:'WELCOME_DISCOVER_RHYTHM'},
        {label:'HOME_WORKSHOP',copy:'WELCOME_DISCOVER_WORKSHOP'}
      ]
    };
  },
  computed: {
    inputOption() { return this.inputs.find(option=>option.id===this.input) || this.inputs[0]; },
    trial() { return trials[this.tryIndex]; },
    personalSection() { return this.personalSections[this.personalIndex]; },
    circleNotes() {
      const naming = this.$t('WELCOME_NOTE_B') === 'H' ? 'german' : 'international';
      return ['C','G','D','A','E','B','F-sharp','D-flat','A-flat','E-flat','B-flat','F'].map((tonic,index) => {
        const radians = (index * 30 - 90) * Math.PI / 180;
        return {label:formatNoteFlowTonic(tonic,'major',naming),x:60 + 43 * Math.cos(radians),y:60 + 43 * Math.sin(radians)};
      });
    },
    nextLabel() {
      if(this.step < this.titles.length - 1) return 'WELCOME_NEXT';
      if(this.tryIndex === 1) return 'WELCOME_TRY_BASS';
      return this.tryIndex < trials.length - 1 ? 'WELCOME_TRY_NEXT' : 'WELCOME_START';
    }
  },
  mounted() {
    this.focusGuard = createModalFocusGuard(this.$refs.dialog,this.$el,document);
    document.addEventListener('keydown',this.handleKey);
    document.addEventListener('visibilitychange',this.handleVisibility);
    this.queueInputAdvance();
    this.queueDiscoveryAdvance();
    this.queuePersonalAdvance();
  },
  beforeDestroy() {
    this.clearInputTimer();
    this.clearDiscoveryTimer();
    this.clearPersonalTimer();
    document.removeEventListener('keydown',this.handleKey);
    document.removeEventListener('visibilitychange',this.handleVisibility);
    if(this.focusGuard) this.focusGuard.release();
  },
  methods: {
    beginSwipe(event) {
      this.swipeStart=null;
      if(!['touch','pen'].includes(event.pointerType) || event.isPrimary===false || event.target.closest('button,input,.welcome-piano')) return;
      this.swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now(),scene:!!event.target.closest('.welcome-scene')};
    },
    cancelSwipe() {this.swipeStart=null;},
    endSwipe(event) {
      const start=this.swipeStart;this.swipeStart=null;
      if(!start || event.pointerId!==start.id || Date.now()-start.at>1200) return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.abs(dx)<48 || Math.abs(dy)>Math.abs(dx)*.6) return;
      const direction=dx<0 ? 1 : -1;
      if(start.scene && this.step===2) this.selectPersonal((this.personalIndex+direction+this.personalSections.length)%this.personalSections.length);
      else if(start.scene && this.step===1) this.selectInput(this.inputs[(this.inputs.findIndex(option=>option.id===this.input)+direction+this.inputs.length)%this.inputs.length].id);
      else if(start.scene && this.step===0) this.selectMode((Math.max(0,this.discoverIndex)+direction+this.modes.length)%this.modes.length);
      else if(direction>0) {if(this.step<this.titles.length-1) this.goTo(this.step+1);}
      else if(this.step>0) this.back();
    },
    goTo(step) {
      const nextStep = Math.max(0,Math.min(this.titles.length - 1,step));
      if(nextStep === 0) { this.discoverIndex = -1; this.discoverPaused = false; }
      if(nextStep === 1) { this.input = 'button'; this.inputPaused = false; }
      if(nextStep === 2) { this.personalIndex = 0; this.personalPaused = false; }
      if(nextStep === this.titles.length - 1) this.changeTrial(0);
      this.swipeStart=null;this.step = nextStep;
      this.queueInputAdvance(900);
      this.queueDiscoveryAdvance();
      this.queuePersonalAdvance();
      this.$nextTick(()=>this.$refs.title && this.$refs.title.focus({preventScroll:true}));
    },
    changeTrial(index) { this.tryIndex = index; this.solved = false; this.tried = false; this.playedKey = null; },
    next() {
      if(this.step < this.titles.length - 1) this.goTo(this.step + 1);
      else if(this.tryIndex < trials.length - 1) this.changeTrial(this.tryIndex + 1);
      else this.finish(true);
    },
    back() {
      if(this.step === this.titles.length - 1 && this.tryIndex > 0) this.changeTrial(this.tryIndex - 1);
      else this.goTo(this.step - 1);
    },
    finish(start) { this.clearInputTimer(); this.clearDiscoveryTimer(); this.clearPersonalTimer(); this.$emit('finish',start); },
    clearPersonalTimer() {
      if(this._personalTimer != null) clearTimeout(this._personalTimer);
      this._personalTimer = null;
    },
    queuePersonalAdvance() {
      this.clearPersonalTimer();
      if(this.step !== 2 || this.personalPaused || (typeof document !== 'undefined' && document.hidden)) return;
      this._personalTimer = setTimeout(() => {
        this._personalTimer = null;
        if(this._isDestroyed || this._isBeingDestroyed || this.step !== 2) return;
        this.personalIndex = (this.personalIndex + 1) % this.personalSections.length;
        this.queuePersonalAdvance();
      },this.personalSection.id === 'range' ? 3000 : 4000);
    },
    selectPersonal(index) {
      if(!Number.isInteger(index) || index < 0 || index >= this.personalSections.length) return;
      this.personalIndex = index;
      this.personalPaused = true;
      this.queuePersonalAdvance();
    },
    pausePersonalRotation() {this.personalPaused=true;this.clearPersonalTimer();},
    togglePersonalRotation() { this.personalPaused = !this.personalPaused; this.queuePersonalAdvance(); },
    clearDiscoveryTimer() {
      if(this._discoverTimer != null) clearTimeout(this._discoverTimer);
      this._discoverTimer = null;
    },
    queueDiscoveryAdvance(delay = this.discoverIndex === -1 ? 400 : 3000) {
      this.clearDiscoveryTimer();
      if(this.step !== 0 || this.discoverPaused || (typeof document !== 'undefined' && document.hidden)) return;
      this._discoverTimer = setTimeout(() => {
        this._discoverTimer = null;
        if(this._isDestroyed || this._isBeingDestroyed || this.step !== 0) return;
        this.discoverIndex = this.discoverIndex === this.modes.length - 1 ? -1 : this.discoverIndex + 1;
        this.queueDiscoveryAdvance();
      },delay);
    },
    selectMode(index) {
      if(index < 0 || index >= this.modes.length) return;
      this.discoverIndex = index;
      this.discoverPaused = true;
      this.queueDiscoveryAdvance();
    },
    toggleDiscoveryRotation() { this.discoverPaused = !this.discoverPaused; this.queueDiscoveryAdvance(); },
    clearInputTimer() {
      if(this._inputTimer != null) clearTimeout(this._inputTimer);
      this._inputTimer = null;
    },
    queueInputAdvance(delay = 2500) {
      this.clearInputTimer();
      if(this.step !== 1 || this.inputPaused || (typeof document !== 'undefined' && document.hidden)) return;
      this._inputTimer = setTimeout(() => {
        this._inputTimer = null;
        if(this._isDestroyed || this._isBeingDestroyed || this.step !== 1) return;
        const index = this.inputs.findIndex(option => option.id === this.input);
        this.input = this.inputs[(index + 1) % this.inputs.length].id;
        this.queueInputAdvance();
      },delay);
    },
    selectInput(input) {
      if(!this.inputs.some(option => option.id === input)) return;
      this.input = input;
      this.inputPaused = true;
      this.queueInputAdvance();
    },
    toggleInputRotation() { this.inputPaused = !this.inputPaused; this.queueInputAdvance(); },
    handleVisibility() { this.queueInputAdvance(); this.queueDiscoveryAdvance(); this.queuePersonalAdvance(); },
    demoKeyLabel(key) { return key[0] === 'B' ? this.$t('WELCOME_NOTE_B') + key.slice(1) : key; },
    playKey(key) {
      if(this.solved) return;
      this.tried = true;
      const expected = {C:0,F:5,G:7}[this.trial.pitch[0]];
      // The normal on-screen keyboard selects a note name, independent of octave.
      this.solved = typeof key === 'number' && key % 12 === expected;
      if(this.solved) this.playedKey = key;
    },
    handleKey(event) {
      if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.finish(false); }
    }
  }
};
</script>

<style scoped>
.welcome-overlay { position:fixed; inset:0; z-index:11000; display:grid; place-items:center; padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left)); box-sizing:border-box; background:rgba(31,52,57,.48); backdrop-filter:blur(5px); }
.welcome-dialog { outline:none; width:100%; max-width:510px; max-height:100%; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; box-sizing:border-box; padding:22px; border:1px solid rgba(255,255,255,.85); border-radius:28px; background:#fffcf6; color:#29464d; text-align:left; box-shadow:0 24px 80px rgba(25,46,52,.25); }
.welcome-top,.welcome-brand,.welcome-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.welcome-top { position:sticky; top:0; z-index:2; background:#fffcf6; }
.welcome-brand { justify-content:flex-start; font-size:13px; font-weight:850; }
.welcome-brand img { width:32px; height:32px; object-fit:contain; }
.welcome-dialog button { font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.welcome-dialog button:focus-visible { outline:3px solid #2d7180; outline-offset:3px; }
.welcome-skip { display:flex; align-items:center; gap:7px; min-height:42px; padding:6px 11px; border:1px solid #deaa87; border-radius:12px; background:#ffeadb; color:#8e3e1f; font-size:12px!important; font-weight:800!important; white-space:nowrap; box-shadow:0 2px 5px #c5753020; }
.welcome-skip span { font-size:24px; font-weight:400; }
.welcome-progress { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin:17px 0; }
.welcome-progress button { flex:1; display:flex; align-items:center; gap:6px; min-height:34px; padding:5px 7px; border:0; border-radius:10px; background:#f0ede6; color:#788889; font-size:10px; font-weight:750; }
.welcome-progress button.current { color:#aa4821; background:#ffebdc; }
.welcome-progress button.passed { color:#2d7180; background:#e1eff0; }
.welcome-progress button > span:first-child { display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:rgba(255,255,255,.7); flex-shrink:0; }
.welcome-scene { display:flex; align-items:center; justify-content:center; min-height:248px; overflow:hidden; padding:18px; box-sizing:border-box; border-radius:21px; background:radial-gradient(ellipse at top left,#ffdfc88c,transparent 75%),#f4f5ef; }
.welcome-discovery { width:100%; max-width:330px; }
.discovery-preview { display:none; }
.discovery-art { display:block; width:100%; height:100%; min-height:0; }
.discovery-art text { fill:#45636b; text-anchor:middle; font-size:13px; font-family:inherit; font-weight:650; }
.discovery-preview .preview-heading { margin:12px 10px 0; color:inherit; font-size:15px; line-height:1.25; font-weight:750; text-align:center; }
.discovery-caption {margin:0;padding:8px 12px 12px;color:#45636b;font-size:13px;line-height:1.4;text-align:left;}
.preview-staff { fill:none; stroke:#bccdcd; stroke-width:1.2; }
.preview-clef,.preview-black-key { fill:#345e68; }
.preview-note { fill:currentColor; }
.preview-stem { fill:none; stroke:currentColor; stroke-width:2; }
.preview-white-key { fill:#fffdf8; stroke:#c7d6d5; stroke-width:1; }
.discovery-art .preview-key-label { font-size:11px; font-weight:500; }
.preview-single-note { animation:discovery-note-answer 3s ease infinite; }
.preview-answer-key { animation:discovery-key-answer 3s ease infinite; }
.preview-answer-check { color:#27825c; opacity:0; animation:discovery-answer-check 3s ease infinite; }
.preview-answer-check circle { fill:#def2e7; }.preview-answer-check path { fill:none; stroke:currentColor; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
.preview-hit-zone { fill:#e1f0ee; }.preview-hit-line { fill:none; stroke:currentColor; stroke-width:2; }
.preview-flow-notes { animation:discovery-note-flow 3s linear infinite; }
.preview-flow-key { animation:discovery-flow-key 1.5s ease infinite; }
.preview-beat { fill:#e8dfcd; animation:discovery-beat 3s ease infinite; }
.preview-drum-rim { fill:#e9bc88; stroke:#b77e20; stroke-width:2; }.preview-drum-skin { fill:#fff3df; stroke:#dbaa6b; stroke-width:2; }.preview-drum-grain { fill:none; stroke:#ebd7ba; stroke-width:1.5; }
.preview-drum-ripple { fill:none; stroke:#b77e20; stroke-width:2; transform-origin:180px 158px; animation:discovery-drum-ripple .75s ease-out infinite; }
.preview-drumstick { transform-origin:258px 92px; animation:discovery-drumstick .75s ease-in-out infinite; }
.preview-drumstick path { fill:none; stroke:#af7040; stroke-width:7; stroke-linecap:round; }.preview-drumstick .preview-stick-shadow { stroke:#704f2d; opacity:.13; }.preview-drumstick ellipse { fill:#af7040; }
.preview-selected-bar { fill:#eee8f6; }.preview-workshop-cursor { animation:discovery-workshop-play 3s ease-in-out infinite; }.preview-workshop-cursor path { fill:#8060a7; stroke:#8060a7; stroke-width:2; }
.preview-bar-chip { fill:#fffdf8; stroke:#d4deda; }.preview-bar-chip-active { fill:#eee8f6; stroke:#b7a1d0; }
@keyframes discovery-note-answer { 0%,25%,100% { color:#d65b2a; } 45%,85% { color:#27825c; } }
@keyframes discovery-key-answer { 0%,25%,100% { fill:#fffdf8; } 45%,85% { fill:#c9ebd9; } }
@keyframes discovery-answer-check { 0%,30%,100% { opacity:0; transform:translateY(4px); } 45%,85% { opacity:1; transform:translateY(0); } }
@keyframes discovery-note-flow { from { transform:translateX(0); } to { transform:translateX(-168px); } }
@keyframes discovery-flow-key { 0%,15%,80%,100% { fill:#fffdf8; } 35%,60% { fill:#c3e2e2; } }
@keyframes discovery-beat { 0%,18% { fill:#b77e20; } 25%,100% { fill:#e8dfcd; } }
@keyframes discovery-drumstick { 0%,75%,100% { transform:rotate(14deg); } 34%,44% { transform:rotate(-6deg); } }
@keyframes discovery-drum-ripple { 0%,35%,100% { opacity:0; transform:scale(.78); } 45% { opacity:.6; transform:scale(.9); } 85% { opacity:0; transform:scale(1.13); } }
@keyframes discovery-workshop-play { 0%,8% { opacity:1; transform:translateX(0); } 82% { opacity:1; transform:translateX(98px); } 92%,100% { opacity:0; transform:translateX(98px); } }
.welcome-modes { position:relative; width:100%; height:300px; }
.welcome-mode { position:absolute; top:0; left:0; width:100%; height:56px; box-sizing:border-box; display:flex; align-items:center; gap:12px; border:1px solid #e4d8c9; border-left:4px solid currentColor; border-radius:14px; padding:7px 10px; background:#fffdf9; color:#d65b2a; text-align:left; transition:transform .3s cubic-bezier(.22,.68,.25,1),box-shadow .18s; }
.welcome-mode.active { box-shadow:0 4px 12px #29464d18; }
.welcome-mode-copy { position:absolute; left:0; width:100%; box-sizing:border-box; margin:0; padding:0 10px; color:#3f5d66; font-size:12px; line-height:1.35; }
.welcome-mode-copy-enter-active,.welcome-mode-copy-leave-active { transition:opacity .12s ease,transform .12s ease; }
.welcome-mode-copy-enter-active { transition-delay:.08s; }
.welcome-mode-copy-enter { opacity:0; transform:translateY(8px); }
.welcome-mode-copy-leave-to { opacity:0; transform:translateY(-8px); }
.welcome-discovery-toggle { display:grid; place-items:center; width:32px; height:28px; margin:7px 0 0 auto; padding:4px; border:1px solid #c6d8d9; border-radius:9px; background:#fffdf9; color:#345e68; }
.welcome-discovery-toggle svg { width:16px; height:16px; fill:currentColor; }
.welcome-discovery-toggle[aria-pressed="true"] { background:#e1eff0; border-color:#2d7180; }
.welcome-mode-0 { box-shadow:0 5px 15px #d85a2020; }
.welcome-mode-1 { color:#2d7180; }.welcome-mode-2 { color:#b77e20; }.welcome-mode-3 { color:#8060a7; }
.welcome-mode-symbol { box-sizing:border-box; width:38px; height:38px; flex-shrink:0; padding:4px; border-radius:11px; background:color-mix(in srgb,currentColor 10%,white); }
.welcome-mode-symbol svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }.welcome-mode-symbol svg ellipse,.welcome-mode-symbol svg circle { fill:currentColor; stroke:none; }
.welcome-mode strong { display:block; font-size:14px; }.welcome-mode-arrow { margin-left:auto; font-size:20px; }
.welcome-recommendation { display:block; margin-top:3px; font-size:10px; font-weight:700; color:#9e663c; }
.welcome-input-scene { width:100%; }
.welcome-input-frame { position:relative; }
.welcome-auto-toggle { position:absolute; top:0; right:0; display:grid; place-items:center; width:36px; height:36px; border:1px solid #c6d8d9; border-radius:11px; background:#fffdf9; color:#345e68; }
.welcome-auto-toggle svg { width:17px; height:17px; fill:currentColor; }
.welcome-auto-toggle[aria-pressed="true"] { background:#e1eff0; border-color:#2d7180; }
.welcome-personalize { display:grid; width:100%; max-width:390px; gap:13px; }
.personal-stage { position:relative; min-height:275px; perspective:800px; }
.personal-preview { --demo-accent:#2d7180; min-height:275px; box-sizing:border-box; padding:17px 14px 10px; border:1px solid #d1dfdd; border-radius:20px; background:linear-gradient(150deg,#fffefa,#f1f8f7); box-shadow:0 8px 22px #29464d12; }
.personal-preview header { padding-right:28px; min-height:80px; }
.personal-preview strong { display:block; color:#29464d; font-size:15px; }
.personal-preview p { margin:7px 0 0; color:#45636b; font-size:12px; line-height:1.5; }
.personal-preview-keys header {min-height:0;margin-bottom:8px;}
.personal-preview-keys,.personal-preview-circle { --demo-accent:#b7771e; background:linear-gradient(150deg,#fffefa,#fff6e4); }
.personal-preview-tempo,.personal-preview-values { --demo-accent:#d85624; background:linear-gradient(150deg,#fffefa,#fff1e6); }
.personal-demo { display:block; width:100%; height:220px; overflow:visible; }
.personal-demo text { fill:#345e68; font-size:15px; font-weight:700; text-anchor:middle; }
.personal-demo .demo-small { font-size:14px; font-weight:500; }
.welcome-copy-slot {display:grid;}
.welcome-copy-slot > span {grid-area:1/1;}
.welcome-copy-reserve {visibility:hidden;pointer-events:none;}
.setting-choice {fill:#fffdf9;stroke:#d1dfdd;stroke-width:1;}
.setting-choice-active {fill:#dceeed;stroke:#2d7180;stroke-width:1.7;}
.setting-clef {fill:#345e68;}
.setting-signature {fill:#c46a25;}.setting-signature-halo {fill:#ffebc2;stroke:#dba755;stroke-width:1;}
.setting-example-note {fill:#d66b31;}.setting-note-stem {fill:none;stroke:#d66b31;stroke-width:1.8;}
.personal-demo .setting-note-label {fill:#bd6027;font-size:20px;}
.setting-piano-hand {--hand-accent:#c36732;}.setting-piano-hand-left {--hand-accent:#2d7180;animation:setting-left-playing 4s ease-in-out infinite;}
.setting-hand-tap {animation:setting-hand-press 1s ease-in-out infinite;}
.setting-hand-silhouette {fill:#fff0d9;stroke:var(--hand-accent);stroke-width:2.5;stroke-linejoin:round;}
.setting-hand-light {fill:#fffaf1;opacity:.65;}
.setting-hand-tendons {fill:none;stroke:#c6a981;stroke-width:1.2;stroke-linecap:round;opacity:.5;}
.setting-hand-knuckles {fill:none;stroke:#c6a981;stroke-width:1.3;stroke-linecap:round;opacity:.7;}
.setting-hand-nail {fill:#fffaf1;stroke:#d4ba96;stroke-width:.8;}
.setting-hand-cuff {fill:var(--hand-accent);stroke:var(--hand-accent);stroke-width:2;}
@keyframes setting-hand-press {0%,65%,100% {transform:translateY(0);}25%,40% {transform:translateY(4px);}}
@keyframes setting-left-playing {0%,40%,100% {opacity:.25;}48%,92% {opacity:1;}}
.personal-demo .setting-caption {font-size:13px;font-weight:600;}
.personal-demo .setting-time {font-size:19px;font-weight:800;}
.setting-beam {fill:none;stroke:#d66b31;stroke-width:4;}
.setting-beat-cell {fill:#fff6e8;stroke:#e8c69d;stroke-width:1;}
.setting-beat-cursor {fill:#d66b31;animation:setting-count 2s linear infinite;}
.setting-right-hand {fill:#d66b31;stroke:#d66b31;stroke-width:1.6;}
.setting-left-hand {fill:#2d7180;stroke:#2d7180;stroke-width:1.6;}
.setting-hand-link {fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.setting-left-key {fill:#bddde0;stroke:#77aeb6;stroke-width:.7;}
.setting-right-key {fill:#f9d2b3;stroke:#dfad88;stroke-width:.7;}
.personal-demo .setting-left-label {fill:#2d7180;font-size:13px;}.personal-demo .setting-right-label {fill:#bd6027;font-size:13px;}
.custom-phase-a {animation:setting-first 4s ease-in-out infinite;}
.custom-phase-b {opacity:0;animation:setting-second 4s ease-in-out infinite;}
@keyframes setting-first {0%,40%,100% {opacity:1;}48%,92% {opacity:0;}}
@keyframes setting-second {0%,40%,100% {opacity:0;}48%,92% {opacity:1;}}
@keyframes setting-count {from {transform:translateX(0);}to {transform:translateX(162px);}}
@media(prefers-reduced-motion:reduce) {.personal-demo .custom-phase-a {opacity:1;}.personal-demo .custom-phase-b {opacity:0;display:none;}.personal-demo .setting-piano-hand-left {opacity:.25;}}
.demo-keyboard-case { fill:#fffdf8; stroke:#d1d8d6; stroke-width:1; }
.demo-white-key { fill:url(#welcome-range-white); stroke:#d1cbc2; stroke-width:1; }
.demo-black-key { fill:url(#welcome-range-black); }
.demo-range-key { fill:#a8d3d7; fill-opacity:.6; stroke:#8abac0; stroke-width:.7; }
.demo-range-edge { animation:personal-range-edge 3s ease-in-out infinite; }
.demo-range-left,.demo-range-right { stroke:#2d7180; stroke-width:2.5; fill:#eff8f6; }
.demo-range-left { animation:personal-range-left 3s ease-in-out infinite; }.demo-range-right { animation:personal-range-right 3s ease-in-out infinite; }
.demo-staff { fill:none; stroke:#abbfbe; stroke-width:1.5; }
.demo-state-c { animation:personal-state-c 4s infinite; }.demo-state-g { opacity:0; animation:personal-state-g 4s infinite; }
.demo-tonality-badge { fill:#fff5df; stroke:#dfba76; stroke-width:1; }
.personal-demo .demo-title { font-size:20px; fill:#80551a; }
.personal-demo .demo-key-change { font-size:20px; fill:#a65021; }
.demo-example-white { fill:#fffdf9; stroke:#c9c7bd; stroke-width:1; }
.demo-example-black { fill:#254c54; }.demo-natural-key { fill:#c6e4e3; stroke:#4b929c; stroke-width:2; }
.demo-sharp-key { fill:#d66b31; stroke:#994016; stroke-width:2; }.personal-demo .demo-sharp-label { fill:white; font-size:28px; }
.personal-demo .demo-key-label { font-size:14px; font-weight:500; }
.personal-demo-circle { height:260px; max-width:290px; margin:auto; }
.demo-circle-ring { fill:none; stroke:#d9c39b; stroke-width:2; }
.demo-circle-node { fill:#fffdf7; stroke:#dacbad; stroke-width:1; }.demo-circle-selected { fill:#f8d999; stroke:#b7771e; stroke-width:2; }
.personal-demo-circle text { font-size:12px; }.demo-circle-center { fill:#fffaf0; stroke:#e9d9b8; stroke-width:1; }
.personal-demo-circle .demo-circle-tonic { font-size:20px; fill:#80551a; }.personal-demo-circle .demo-circle-caption { font-size:10px; font-weight:500; }
.personal-demo-circle .demo-circle-explanation { font-size:14px; fill:#8e4b1f; }
.demo-circle-direction { fill:none; stroke:#c77824; stroke-width:3; stroke-linecap:round; }
.demo-circle-arrow { fill:#c77824; }
.demo-metronome { fill:#fff0d5; stroke:#b7771e; stroke-width:2; }.demo-pendulum { stroke:#d85624; stroke-width:3; fill:#eda45e; transform-origin:180px 138px; animation:personal-pendulum .666667s ease-in-out infinite alternate; }
.demo-value-tile { fill:#fffdf8; stroke:#e2d7c3; stroke-width:1; }.demo-value-glyph { fill:#d85624; }.demo-value-stem { fill:none; stroke:#d85624; stroke-width:1.5; }
.personal-demo .demo-value-name { font-size:16px; text-anchor:start; }.personal-demo .demo-beat-label { font-size:13px; font-weight:500; text-anchor:end; }
.demo-duration-track { fill:#eee8dc; }.demo-duration-fill { fill:#d9753e; transform-origin:76px 0; animation:personal-duration-half 6s linear infinite; }
.demo-duration-1 { animation-name:personal-duration-quarter; }.demo-duration-2 { animation-name:personal-duration-eighth; }.demo-duration-tick { fill:none; stroke:#fffdf8; stroke-width:2; }
.demo-hand { --hand:#2d7180; animation:personal-hand 1.2s ease-in-out infinite; }.demo-hand-right { --hand:#d85624; }.demo-hand rect { fill:#f7fbf9; stroke:#d1dfdd; }.demo-hand path { fill:#fff3e2; stroke:var(--hand); stroke-width:2; }.demo-hand text { font-size:13px; }
.personal-stage .welcome-auto-toggle { top:10px; right:10px; width:30px; height:30px; }
.personal-topics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
.personal-topics button { min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; min-height:62px; padding:7px 3px; border:1px solid #d1dfdd; border-radius:12px; background:#fffdfa; color:#45636b; font-size:10px!important; line-height:1.25; }
.personal-topics button.selected { background:#e1eff0; border-color:#2d7180; color:#285e6b; box-shadow:inset 0 0 0 1px #2d7180; }
.personal-topics svg { display:block; width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
@keyframes personal-range-left { 0%,15%,85%,100% { transform:translateX(0); } 35%,65% { transform:translateX(20.8px); } }
@keyframes personal-range-right { 0%,15%,85%,100% { transform:translateX(0); } 35%,65% { transform:translateX(-20.8px); } }
@keyframes personal-range-edge { 0%,15%,85%,100% { opacity:1; } 35%,65% { opacity:0; } }
@keyframes personal-state-c { 0%,38%,100% { opacity:1; } 46%,92% { opacity:0; } }
@keyframes personal-state-g { 0%,38%,100% { opacity:0; } 46%,92% { opacity:1; } }
@keyframes personal-circle-direction { 0%,34%,100% { stroke-dashoffset:100; opacity:0; } 36% { stroke-dashoffset:100; opacity:1; } 46%,92% { stroke-dashoffset:0; opacity:1; } }
@keyframes personal-pendulum { from { transform:rotate(-23deg); } to { transform:rotate(23deg); } }
/* Same start and fill speed: 2, 1 and half a beat, with a quarter-note beat of 1 s. */
@keyframes personal-duration-half { 0%,20%,100% { transform:scaleX(0); } 45%,90% { transform:scaleX(1); } }
@keyframes personal-duration-quarter { 0%,20%,100% { transform:scaleX(0); } 32.5%,90% { transform:scaleX(1); } }
@keyframes personal-duration-eighth { 0%,20%,100% { transform:scaleX(0); } 26.25%,90% { transform:scaleX(1); } }
@keyframes personal-hand { 0%,45%,100% { opacity:1; } 50%,95% { opacity:.45; } }
@media(prefers-reduced-motion:reduce) {
  .personal-demo * { animation:none!important; }
  .personal-demo .demo-state-c { opacity:1; }.personal-demo .demo-state-g,.demo-circle-direction,.demo-circle-arrow { opacity:0; }
  .demo-duration-fill { transform:scaleX(1); }
}
.welcome-swipe-enter-active, .welcome-swipe-leave-active { transition:transform .15s ease,opacity .15s ease; }
.welcome-swipe-enter { opacity:0; transform:translateX(24px); }
.welcome-swipe-leave-to { opacity:0; transform:translateX(-24px); }
.welcome-input-illustration { height:174px; }
.welcome-input-illustration svg { width:100%; height:100%; fill:none; stroke:#345e68; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.device-body { fill:#e0edef; }.device-key { fill:#fffdfa; }.device-black-key { fill:#31545e; }.active-key { fill:#f7b482; stroke:#d75b2c; }.connected-light { fill:#36946c; stroke:none; }
.staff-line { fill:none; stroke:#a8bbbb; stroke-width:1.6; }.input-note { fill:#d65b2a; stroke:none; }.input-note-stem { stroke:#d65b2a; }
.tap-halo { fill:none; stroke:#df6c34; stroke-dasharray:3 4; animation:welcome-pulse 1.2s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }.touch-hand { stroke:#345e68; stroke-width:2.2; fill:none; }
.hand-outline { fill:#fff4e6; }
.hand-folds { stroke:#789398; stroke-width:1.6; }
.hand-nail { fill:#fffdfa; stroke:#c7d3d1; stroke-width:1.2; }
.hand-cuff { fill:#f7b482; stroke:#d75b2c; }
.welcome-input-options { display:flex; gap:7px; margin-top:15px; }.welcome-input-options button { flex:1; min-width:0; display:grid; gap:4px; justify-items:center; padding:9px 4px; border:1px solid #cedcdf; border-radius:12px; background:#fffdfa; color:#45636b; font-size:11px; }.welcome-input-options button.selected { border-color:#2d7180; background:#e1eff0; }.welcome-input-icon { display:block; width:32px; height:32px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.input-icon-key { fill:#e1eff0; }
.input-icon-black { fill:currentColor; stroke:none; }
.input-icon-connector { stroke-width:1.8; }
.welcome-try { width:100%; max-width:320px; }
.welcome-trial-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; color:#31545e; font-size:12px; }
.welcome-trial-notes { display:flex; align-items:center; gap:6px; color:#6c8386; }
.welcome-trial-notes span { display:grid; place-items:center; width:25px; height:25px; border-radius:8px; }
.welcome-trial-notes .current { background:#ffeadb; color:#a34823; font-weight:800; }
.welcome-try.solved .welcome-trial-notes .current { background:#d7eee2; color:#24704f; }
.welcome-staff { display:block; width:100%; height:132px; }.welcome-clef { fill:#31545e; }.welcome-note { color:#d85d2a; }
.welcome-sheet { position:relative; display:grid; align-items:center; min-height:156px; }
.welcome-sheet.has-tip .welcome-staff { filter:blur(3px); opacity:.45; }
.welcome-reference-glow { fill:none; stroke:#ccebdc; stroke-width:11; stroke-linecap:round; }
.welcome-reference-line { fill:none; stroke:#27845d; stroke-width:2; }
.welcome-notehead { fill:currentColor; }
.welcome-note-stem { fill:none; stroke:currentColor; stroke-width:2; }
.welcome-ledger { fill:none; stroke:#789398; stroke-width:1.6; }
.solved .welcome-note { color:#27845d; }.welcome-note-check { font-size:27px; fill:#27845d; font-weight:900; }
.welcome-piano { position:relative; margin-top:8px; }
.welcome-key-labels { position:absolute; bottom:10px; left:0; right:0; z-index:3; display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); pointer-events:none; color:#527079; font-size:11px; text-align:center; }
.welcome-try:not(.solved) .welcome-target-C /deep/ .key:nth-child(1),
.welcome-try:not(.solved) .welcome-target-F /deep/ .key:nth-child(6),
.welcome-try:not(.solved) .welcome-target-G /deep/ .key:nth-child(8) { background:linear-gradient(#ffeedf,#f9c59e); box-shadow:inset 0 0 0 2px #df915f; }
.welcome-try.solved .welcome-played-0 /deep/ .key:nth-child(1),
.welcome-try.solved .welcome-played-12 /deep/ .key:nth-child(13),
.welcome-try.solved .welcome-played-5 /deep/ .key:nth-child(6),
.welcome-try.solved .welcome-played-7 /deep/ .key:nth-child(8) { background:#ccebdc; box-shadow:inset 0 0 0 2px #62b38c; }
.welcome-memory-tip { position:absolute; top:50%; left:0; right:0; transform:translateY(-50%); display:flex; align-items:flex-start; gap:9px; box-sizing:border-box; padding:14px; border:1px solid #83bc9b; border-radius:14px; background:rgba(241,255,246,.97); color:#255c46; box-shadow:0 7px 22px #244c392b; }
.welcome-memory-tip svg { width:20px; height:23px; flex-shrink:0; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.welcome-memory-tip strong { display:block; font-size:14px; }
.welcome-memory-tip p { margin:4px 0 0; font-size:13px; line-height:1.5; }
.welcome-description { text-align:center; margin:0 0 16px; }.welcome-eyebrow { color:#255e6b; font-size:9px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }.welcome-description h2 { margin:7px 0; font-size:25px; line-height:1.15; letter-spacing:-.4px; outline:none; }.welcome-description p { max-width:390px; margin:9px auto 0; color:#3f5d66; font-size:14px; line-height:1.55; }
.welcome-actions { margin-top:10px; }.welcome-back,.welcome-next { min-height:48px; padding:11px 17px; border-radius:13px; font-size:13px!important; font-weight:800!important; }.welcome-back { border:1px solid #d3dee0; color:#48636b; background:#fffdfa; }.welcome-back:disabled { opacity:.35; cursor:default; }.welcome-next { flex:1; display:flex; justify-content:space-between; align-items:center; max-width:270px; border:1px solid #dd602b; background:linear-gradient(115deg,#ed7135,#d45421); color:white; box-shadow:0 5px 12px #dc5c2426; }
@keyframes welcome-pulse { 50% { opacity:.35; transform:scale(1.15); } }
@media(max-width:380px) { .welcome-dialog { padding:16px; border-radius:22px; }.welcome-scene { padding:13px; min-height:230px; }.welcome-mode { gap:8px; padding:7px 9px; }.welcome-mode strong { font-size:12px; }.welcome-description h2 { font-size:22px; }.welcome-progress button { font-size:9px; gap:4px; padding:5px; }.welcome-brand { font-size:11px; } }
@media(max-width:480px) { .welcome-progress { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:13px 0; }.welcome-progress button { min-height:32px; }.welcome-skip { padding:6px 9px; } }
@media(max-height:600px) and (min-width:600px) { .welcome-dialog { max-width:650px; padding:16px; }.welcome-progress { margin:10px 0; }.welcome-description { margin-bottom:12px; }.welcome-description h2 { font-size:23px; }.welcome-modes { max-width:100%; grid-template-columns:1fr 1fr; gap:8px; }.welcome-mode { padding:7px 9px; gap:8px; }.welcome-mode-symbol { width:26px; height:26px; }.welcome-mode strong { font-size:12px; }.welcome-scene { min-height:155px; padding:12px; }.welcome-input-illustration { height:110px; }.welcome-input-options { margin-top:7px; }.welcome-input-options button { min-height:52px; padding:5px; }.welcome-input-icon { width:26px; height:26px; }.welcome-personalize { max-width:100%; }.welcome-custom-card { grid-template-columns:1fr; align-content:start; }.welcome-custom-icon { width:30px; height:30px; }.welcome-custom-card strong { font-size:11px; }.welcome-actions { margin-top:10px; } }
@media(max-height:680px) and (max-width:599px) { .welcome-dialog { padding:14px; }.welcome-brand img { width:26px; height:26px; }.welcome-skip { min-height:36px; }.welcome-progress { margin:10px 0; }.welcome-scene { min-height:185px; padding:10px; }.welcome-modes { gap:6px; }.welcome-mode { padding:5px 8px; }.welcome-mode-symbol { width:24px; height:24px; }.welcome-mode strong { font-size:12px; }.welcome-recommendation { font-size:9px; }.welcome-description { margin-bottom:12px; }.welcome-description h2 { font-size:22px; }.welcome-description p { margin:8px auto 0; font-size:13px; }.welcome-actions { margin-top:8px; }.welcome-input-illustration { height:130px; }.welcome-input-options { margin-top:10px; } }
@media(prefers-reduced-motion:reduce) { .tap-halo { animation:none; }.welcome-mode,.welcome-mode-copy-enter-active,.welcome-mode-copy-leave-active,.welcome-swipe-enter-active, .welcome-swipe-leave-active { transition:none; }.welcome-mode-copy-enter,.welcome-mode-copy-leave-to,.welcome-swipe-enter, .welcome-swipe-leave-to { transform:none; } }
.welcome-sheet.has-tip { min-height: 288px; }
.welcome-memory-copy { min-width: 0; flex: 1; }
.welcome-memory-tip .welcome-memory-clef { display:block; width:100%; height:132px; margin-top:10px; stroke:none; }
.welcome-memory-clef .memory-canvas { fill:#fffdf8; stroke:#ead9bd; stroke-width:1; }
.welcome-memory-clef .memory-staff-line { fill:none; stroke:#b9c8c5; stroke-width:1; }
.welcome-memory-clef .memory-highlight-line { fill:none; stroke:#27845d; stroke-width:2.5; }
.welcome-memory-clef .memory-clef-glyph { fill:#31545e; stroke:none; }
.welcome-memory-clef .memory-point-halo { fill:none; stroke:#d75b18; stroke-width:3.3; stroke-dasharray:100 100; animation:welcome-reference-circle 4s ease-in-out infinite; }
.welcome-memory-clef .memory-pointer-outline { fill:none; stroke:#fffdf8; stroke-width:9; }
.welcome-memory-clef .memory-pointer { fill:none; stroke:#d75b18; stroke-width:4; }
.welcome-memory-clef .memory-pointer, .welcome-memory-clef .memory-pointer-outline { stroke-linecap:butt; stroke-dasharray:100 100; animation:welcome-reference-arrow 4s ease-in-out infinite; }
.welcome-memory-clef .memory-arrowhead { fill:#d75b18; stroke:#fffdf8; stroke-width:1.5; stroke-linejoin:round; animation:welcome-reference-head 4s ease-in-out infinite; }
.welcome-memory-clef .memory-note-badge { fill:#d75b18; stroke:none; }
.welcome-memory-clef text { fill:#fff; stroke:none; font-size:23px; font-weight:850; text-anchor:middle; }

@keyframes welcome-reference-arrow { 0%,91%,100% { stroke-dashoffset:100; } 16%,76% { stroke-dashoffset:0; } }
@keyframes welcome-reference-head { 0%,12%,76%,100% { opacity:0; } 16%,73% { opacity:1; } }
@keyframes welcome-reference-circle {
  0%,16% { stroke-dashoffset:100; opacity:1; }
  28%,65% { stroke-dashoffset:0; opacity:1; }
  73%,100% { stroke-dashoffset:0; opacity:0; }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-memory-clef .memory-pointer, .welcome-memory-clef .memory-pointer-outline, .welcome-memory-clef .memory-arrowhead, .welcome-memory-clef .memory-point-halo { animation:none; stroke-dashoffset:0; opacity:1; }
}

/* Matching key signatures inside the original circle. */
.circle-staff {fill:none;stroke:#a6bdb9;stroke-width:.8;}.circle-clef {fill:#31545e;}.circle-signature {fill:#b26721;}.circle-note {fill:#d65b2a;}.circle-note-stem {fill:none;stroke:#d65b2a;stroke-width:1.2;}
.circle-state-c {animation:circle-demo-c 4s infinite;}.circle-state-d {opacity:0;animation:circle-demo-d 4s infinite;}.circle-state-f {opacity:0;animation:circle-demo-f 4s infinite;}
@keyframes circle-demo-c {0%,29%,100% {opacity:1;}33%,96% {opacity:0;}}
@keyframes circle-demo-d {0%,29%,66%,100% {opacity:0;}33%,62% {opacity:1;}}
@keyframes circle-demo-f {0%,62%,100% {opacity:0;}66%,96% {opacity:1;}}
.welcome-mode-dots {display:none;}
/* Phone-sized tutorials use the available screen; artwork yields space to text and controls. */
@media(max-width:599px),(max-height:600px) {
 .welcome-overlay {padding:0;overscroll-behavior:none;}
 .welcome-dialog {display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:8px;height:100%;height:100dvh;max-height:100%;max-width:none;overflow:hidden;border:0;border-radius:0;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));}
 .welcome-top {position:relative;}.welcome-brand {font-size:13px;}.welcome-brand img {width:28px;height:28px;}.welcome-skip {min-height:44px;}
 .welcome-progress {display:flex;justify-content:center;gap:8px;margin:0;}.welcome-progress button {flex:0 1 52px;justify-content:center;min-height:36px;padding:4px;}.welcome-progress .welcome-step-label {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .welcome-description {margin:0;}.welcome-eyebrow {display:none;}.welcome-description h2 {font-size:23px;line-height:1.2;margin:0;}.welcome-description p {font-size:13px;line-height:1.4;margin:6px auto 0;max-width:430px;}.welcome-step-2 .welcome-description p {display:none;}
 .welcome-scene {min-height:0;min-width:0;height:100%;padding:10px;touch-action:pan-y;border-radius:18px;}
 .welcome-actions {margin:0;gap:10px;}.welcome-actions button {min-height:44px;padding:10px 14px;font-size:13px;}.welcome-next {min-width:0;}
 .welcome-personalize {height:100%;min-height:0;max-width:440px;grid-template-rows:minmax(0,1fr) 44px;gap:2px;}.personal-stage {height:100%;min-height:0;}.personal-preview {display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0;padding:12px 10px 6px;}.personal-preview header {min-height:0;padding-right:30px;}.personal-preview strong {font-size:14px;}.personal-preview p {font-size:12px;line-height:1.4;margin:5px 0 0;}.personal-demo,.personal-demo-circle {height:100%;min-height:0;max-height:100%;width:100%;max-width:320px;margin:auto;overflow:hidden;}
 .personal-topics {display:flex;justify-content:center;gap:0;}.personal-topics button {display:grid;place-items:center;min-width:0;flex:1;min-height:44px;height:44px;padding:0;border:0;background:transparent;box-shadow:none;}.personal-topics button::before {content:'';width:8px;height:8px;border-radius:50%;background:#adc2c3;}.personal-topics button.selected::before {background:#2d7180;box-shadow:0 0 0 4px #dcebec;}.personal-topics svg {display:none;}.personal-topics span {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .welcome-input-scene {height:100%;display:grid;grid-template-rows:minmax(0,1fr) 44px;gap:4px;}.welcome-input-frame {min-height:0;}.welcome-input-illustration {height:100%;min-height:0;}.welcome-input-illustration > svg {height:100%;max-height:100%;width:100%;}.welcome-input-options {margin:0;gap:6px;}.welcome-input-options button {display:flex;justify-content:center;align-items:center;min-height:44px;padding:6px;font-size:12px;}.welcome-input-options .welcome-input-icon {display:none;}
 .welcome-discovery {height:100%;max-width:400px;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) 44px;position:relative;}.welcome-modes {height:100%;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:12px;}.welcome-mode {visibility:hidden;pointer-events:none;opacity:0;transform:none!important;}.welcome-mode.mobile-current {visibility:visible;pointer-events:auto;opacity:1;position:relative;top:auto;left:auto;grid-row:1;height:auto;min-height:74px;align-self:end;animation:mobile-mode-in .2s ease-out;}.welcome-mode-symbol {width:48px;height:48px;}.welcome-mode strong {font-size:15px;}.welcome-recommendation {font-size:11px;}.welcome-mode-copy {position:relative;top:auto!important;grid-row:2;padding:0 10px;font-size:14px;line-height:1.45;align-self:start;}.welcome-mode-dots {display:flex;justify-content:center;align-items:center;}.welcome-mode-dots button {display:grid;place-items:center;border:0;background:transparent;width:44px;height:44px;padding:0;}.welcome-mode-dots span {width:8px;height:8px;border-radius:50%;background:#adc2c3;}.welcome-mode-dots [aria-pressed="true"] span {background:#2d7180;box-shadow:0 0 0 4px #dcebec;}.welcome-discovery-toggle {position:absolute;top:0;right:0;margin:0;min-width:36px;min-height:36px;}
 .welcome-try {height:100%;min-height:0;max-width:400px;display:grid;grid-template-rows:auto minmax(0,1fr) minmax(76px,.65fr);gap:4px;}.welcome-trial-heading {margin:0;}.welcome-sheet,.welcome-sheet.has-tip {min-height:0;height:100%;}.welcome-staff {height:100%;max-height:180px;min-height:0;}.welcome-piano {margin:0;height:100%;min-height:0;}.welcome-piano /deep/ .keyboard-input.compact {height:100%;min-height:0;max-height:none;}.welcome-key-labels {bottom:8px;}
 .welcome-memory-tip {position:absolute;inset:0;transform:none;width:auto;max-width:none;padding:9px;gap:7px;box-sizing:border-box;align-items:start;}.welcome-memory-tip > svg {width:17px;height:20px;}.welcome-memory-copy {height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);}.welcome-memory-tip strong {font-size:13px;}.welcome-memory-tip p {font-size:12px;line-height:1.35;margin:4px 0;}.welcome-memory-tip .welcome-memory-clef {height:100%;min-height:0;max-height:110px;margin:0;}
}
@keyframes mobile-mode-in {from {opacity:0;transform:translateX(15px);}to {opacity:1;transform:translateX(0);}}
@media(max-width:599px),(max-height:600px) {
 .welcome-modes {grid-template-rows:auto minmax(0,1fr);gap:9px;}
 .welcome-mode.mobile-current {min-height:64px;align-self:start;padding:8px 52px 8px 10px;gap:10px;}
 .welcome-mode-symbol {width:38px;height:38px;}
 .welcome-mode-copy {display:none;}
 .welcome-discovery-toggle {top:10px;right:10px;}
 .discovery-preview {display:grid;grid-template-rows:auto minmax(0,1fr) auto;grid-row:2;min-height:0;width:100%;box-sizing:border-box;overflow:hidden;border:1px solid #d6e1dd;border-radius:18px;background:linear-gradient(145deg,#fffefa,#f5f9f6);color:#d65b2a;box-shadow:0 7px 18px #29464d0b;}
 .discovery-preview-1 {color:#2d7180;}.discovery-preview-2 {color:#a8751f;background:linear-gradient(145deg,#fffefa,#fff5e5);}.discovery-preview-3 {color:#8060a7;background:linear-gradient(145deg,#fffefa,#f7f3fb);}
 /* A short indicator row; invisible hit areas keep the touch height at 44px. */
 .welcome-personalize,.welcome-discovery {grid-template-rows:minmax(0,1fr) 20px;gap:0;}
 .personal-topics,.welcome-mode-dots {display:flex;justify-self:center;justify-content:center;align-items:center;width:max-content;max-width:100%;height:20px;gap:0;}
 .personal-topics button,.welcome-mode-dots button {position:relative;flex:0 1 44px;min-width:0;width:44px;height:20px;min-height:20px;padding:0;border:0;border-radius:12px;background:transparent;box-shadow:none;}
 .personal-topics button.selected,.welcome-mode-dots button[aria-pressed="true"] {border:0;background:transparent;box-shadow:none;}
 .personal-topics button::after,.welcome-mode-dots button::after {content:'';position:absolute;inset:-12px 0;}
 .personal-topics button::before,.welcome-mode-dots span {width:6px;height:6px;border-radius:4px;background:#adc2c3;box-shadow:none;transition:width .15s ease,background-color .15s ease;}
 .personal-topics button.selected::before,.welcome-mode-dots [aria-pressed="true"] span {width:16px;background:#2d7180;box-shadow:none;}
 .personal-topics button:focus-visible,.welcome-mode-dots button:focus-visible {outline:2px solid #2d7180;outline-offset:0;}
}
@media(max-height:440px) and (min-width:480px) {
 .welcome-dialog {grid-template-columns:minmax(190px,.8fr) minmax(0,1.2fr);grid-template-rows:auto minmax(0,1fr) auto;column-gap:18px;row-gap:6px;padding-top:max(6px,env(safe-area-inset-top));padding-bottom:max(6px,env(safe-area-inset-bottom));}
 .welcome-top {grid-column:1;grid-row:1;}.welcome-brand img {display:none;}.welcome-progress {grid-column:2;grid-row:1;justify-content:flex-end;}.welcome-description {grid-column:1;grid-row:2;align-self:center;}.welcome-description h2 {font-size:21px;}.welcome-description p {font-size:13px;}.welcome-scene {grid-column:2;grid-row:2;}.welcome-actions {grid-column:1/-1;grid-row:3;}.welcome-actions button {max-width:240px;}.welcome-try {grid-template-rows:auto minmax(0,1fr) 65px;}.personal-preview {padding-top:8px;}.personal-preview p {font-size:11px;}.personal-demo {max-width:260px;}
 .welcome-memory-tip {padding:6px;}.welcome-memory-tip > svg {display:none;}.welcome-memory-tip strong {display:none;}.welcome-memory-tip p {font-size:11px;}.welcome-memory-copy {grid-template-rows:auto minmax(0,1fr);}.welcome-memory-tip .welcome-memory-clef {max-height:70px;}
}
@media(prefers-reduced-motion:reduce) {.circle-state-c {animation:none;opacity:1;}.circle-state-d,.circle-state-f {animation:none;display:none;}.welcome-mode.mobile-current {animation:none;}}
@media(prefers-reduced-motion:reduce) {
 .discovery-art * {animation:none!important;}
 .preview-single-note {color:#27825c;}.preview-answer-key {fill:#c9ebd9;}.preview-answer-check {opacity:1;}.preview-drum-ripple {display:none;}
 .personal-topics button::before,.welcome-mode-dots span,.welcome-input-options span {transition:none;}
}
/* Input examples distinguish screen controls from a connected physical instrument. */
.welcome-input-scene {display:grid;max-width:440px;grid-template-rows:minmax(0,1fr) 20px;gap:0;}
.welcome-input-frame {display:grid;grid-template-rows:auto minmax(0,1fr);height:300px;min-height:0;box-sizing:border-box;border:1px solid #d6e1dd;border-radius:18px;background:linear-gradient(145deg,#fffefa,#f1f7f6);overflow:hidden;}
.input-preview-heading {margin:12px 44px 0;color:#2d7180;font-size:15px;line-height:1.3;font-weight:750;text-align:center;}
.welcome-input-frame .welcome-input-illustration {height:100%;min-height:0;}
.welcome-input-frame .welcome-auto-toggle {top:9px;right:9px;width:30px;height:30px;}
.input-device-demo .input-tablet {fill:#dcebed;stroke:#345e68;stroke-width:3.5;}
.input-device-demo .input-display {fill:#fffefa;stroke:#c7d8d8;stroke-width:1;}
.input-camera,.input-clef {fill:#345e68;stroke:none;}
.input-device-demo text {stroke:none;fill:#345e68;text-anchor:middle;font-family:inherit;}
.input-note-button {fill:#fffdf8;stroke:#bbcece;stroke-width:1.3;}
.input-sharp-button {fill:#345e68;stroke:#294b54;stroke-width:1;}
.input-device-demo .input-button-label {font-size:16px;font-weight:750;}
.input-device-demo .input-sharp-label {fill:#fffefa;font-size:11px;font-weight:650;}
.input-screen-key {fill:#fffdf8;stroke:#bbcece;stroke-width:1;}
.input-screen-black {fill:#345e68;stroke:none;}
.input-device-demo .input-key-label {font-size:10px;font-weight:600;}
.input-midi-cable {stroke:#345e68;stroke-width:4;}
.input-midi-signal {stroke:#e98742;stroke-width:2;stroke-dasharray:3 12;animation:input-midi-data 1.2s linear infinite;}
.input-device-demo .input-connection-label {font-size:10px;font-weight:750;}
.input-midi-case {fill:#345861;stroke:#23444d;stroke-width:1.5;}
.input-midi-front {fill:#243f49;stroke:none;}
.input-device-demo .input-hardware-label {fill:#e0eeea;font-size:10px;font-weight:750;}
.input-midi-display {fill:#b6ddd5;stroke:none;}
.input-midi-slider {stroke:#b6caca;stroke-width:2;}
.input-midi-knob {fill:#afc2c3;stroke:#1d3d46;stroke-width:1;}
.input-hardware-key {fill:#fffaf0;stroke:#aab9b9;stroke-width:.8;}
.input-hardware-black {fill:#233842;stroke:#183037;stroke-width:.6;}
.input-usb-plug {fill:#e8edef;stroke:#345e68;stroke-width:1.5;}
.input-device-demo .input-phone-staff {stroke-width:1;}
.input-device-demo .input-button-active {fill:#f9c699;stroke:#d75b2c;stroke-width:1.5;}
.input-demo-hand {animation:input-demo-tap 1.2s ease-in-out infinite;}
.welcome-input-options {display:flex;justify-self:center;justify-content:center;align-items:center;width:max-content;max-width:100%;height:20px;gap:0;margin:0;}
.welcome-input-options button {display:grid;place-items:center;position:relative;flex:0 1 44px;min-width:0;width:44px;min-height:20px;height:20px;gap:0;padding:0;border:0;border-radius:12px;background:transparent;box-shadow:none;}
.welcome-input-options button.selected {border:0;background:transparent;box-shadow:none;}
.welcome-input-options button::after {content:'';position:absolute;inset:-12px 0;}
.welcome-input-options span {width:6px;height:6px;border-radius:4px;background:#adc2c3;transition:width .15s ease,background-color .15s ease;}
.welcome-input-options .selected span {width:16px;background:#2d7180;}
.welcome-input-options button:focus-visible {outline:2px solid #2d7180;outline-offset:0;}
@keyframes input-midi-data {to {stroke-dashoffset:30;}}
@keyframes input-demo-tap {0%,70%,100% {transform:translateY(0);}30%,45% {transform:translateY(3px);}}
@media(max-width:599px),(max-height:600px) {.welcome-input-frame {height:100%;}}
@media(prefers-reduced-motion:reduce) {.input-midi-signal,.input-demo-hand {animation:none;}.welcome-input-options span {transition:none;}}
</style>
