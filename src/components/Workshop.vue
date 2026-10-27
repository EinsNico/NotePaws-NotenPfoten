<template>
  <main class="workshop" :class="draft ? ['is-editing', 'piece-color-'+editorColorIndex] : null">
    <div class="backdrop" aria-hidden="true"><HomeMusicBackdrop /></div>
    <div ref="shell" class="shell" :inert="importNotice || confirmExit || revisionDeleteIds.length ? '' : null" :aria-hidden="importNotice || confirmExit || revisionDeleteIds.length ? 'true' : null">
      <header :class="{ 'editing-header':!!draft || !!practiceSession }">
        <div class="workshop-navigation">
          <button ref="editorBack" type="button" class="back" :disabled="xmlBusy" @click="goBack">← {{$t('BACK')}}</button>
          <MidiConnectionStatus v-if="!draft && !practiceSession" :connected="midiConnected" />
        </div>
        <div v-if="!draft && !practiceSession" class="hero"><span>{{$t('WORKSHOP_KICKER')}}</span><h1>{{$t('HOME_WORKSHOP')}}</h1>
          <p>{{$t('WORKSHOP_LIBRARY_HINT')}}</p></div>
      </header>
      <input ref="musicFile" class="file-input" type="file" accept=".musicxml,.xml,.mxl,.mid,.midi,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,text/xml,application/xml,audio/midi,audio/x-midi" @change="importMusicFile" />
      <section v-if="!importNotice && (xmlMessage || xmlError || xmlWarnings.length)" class="notice xml-status" role="status">
        <p v-if="xmlMessage">{{$t(xmlMessage)}}</p><p v-if="xmlError" class="error" role="alert">{{$t(xmlError)}}</p>
        <details v-if="xmlWarnings.length" class="import-details"><summary>{{$t('WORKSHOP_EXPORT_DETAILS')}}</summary><ul><li v-for="warning in xmlWarnings" :key="warning">{{$t(xmlWarningKey(warning))}}</li></ul></details>
      </section>
      <div v-if="practiceStatsError" class="notice error" role="alert"><p>{{$t('WORKSHOP_PRACTICE_STATS_ERROR')}}</p><button type="button" class="persistence-retry" @click="retryPracticeStatistics">{{$t('WORKSHOP_RETRY')}}</button></div>
      <div v-if="loadError" class="notice error" role="alert">
        <p>{{$t('WORKSHOP_LOAD_ERROR')}}</p><button type="button" class="persistence-retry" @click="initializeLibrary">{{$t('WORKSHOP_RETRY')}}</button>
      </div>
      <section v-else-if="practiceSession" class="card practice-panel">
        <WorkshopPractice ref="practice" :score="practiceSession.score" :title="practiceSession.title" :hands="practiceSession.hands" :player="player" :show-license="practiceSession.showLicense" @hands-change="changePracticeHands" @assessment="recordPracticeAssessment" @info="openPracticeInfo" @back="closePractice" />
      </section>
      <template v-else-if="!draft">
        <button type="button" class="primary new-piece" :disabled="xmlBusy" @click="newPiece">＋ {{$t('WORKSHOP_NEW')}}</button>
        <div class="import-actions">
          <button type="button" class="secondary" :disabled="xmlBusy" @click="chooseImportFile()">{{$t(xmlBusy ? 'WORKSHOP_XML_BUSY' : 'WORKSHOP_MUSIC_IMPORT')}}</button>
        </div>
        <section class="library">
          <h2>{{$t('WORKSHOP_MY_PIECES')}}</h2>
          <p v-if="!pieces.length" class="empty">{{$t('WORKSHOP_EMPTY')}}</p>
          <p v-if="libraryNotice" class="library-notice" role="status">{{$t(libraryNotice)}}</p>
          <button v-if="libraryNotice === 'WORKSHOP_BUNDLED_INSTALL_ERROR' || libraryNotice === 'WORKSHOP_BUNDLED_INSTALL_FULL'" type="button" class="persistence-retry" :disabled="xmlBusy" @click="initializeLibrary">{{$t('WORKSHOP_RETRY')}}</button>
          <article v-for="(piece, pieceIndex) in pieces" :key="piece.id" class="piece-entry" :class="['piece-color-'+(pieceIndex % 5), {'is-expanded':pieceExpanded(piece)}]">
            <div class="piece-summary">
              <h3 class="piece-heading">
                <button type="button" class="piece-disclosure" :disabled="xmlBusy" :aria-expanded="pieceExpanded(piece)" :aria-controls="'workshop-piece-'+piece.id" :aria-describedby="(pieceComposer(piece) ? 'workshop-composer-'+piece.id+' ' : '')+'workshop-metadata-'+piece.id" :aria-label="$t(pieceExpanded(piece) ? 'WORKSHOP_PIECE_COLLAPSE' : 'WORKSHOP_PIECE_EXPAND',{title:piece.title})" @click="togglePieceExpanded(piece)">
                  <span class="piece-icon" aria-hidden="true">♫</span>
                  <span class="piece-identity">
                    <span class="piece-title">{{piece.title}}</span>
                    <span v-if="pieceComposer(piece)" :id="'workshop-composer-'+piece.id" class="piece-composer">{{pieceComposer(piece)}}</span>
                    <span :id="'workshop-metadata-'+piece.id" class="piece-metadata">{{pieceBpm(piece)}} BPM · {{pieceMeterLabel(piece)}} · {{$tc('WORKSHOP_BAR_COUNT', pieceBarCount(piece), { count:pieceBarCount(piece) })}}</span>
                  </span>
                  <span class="piece-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span>
                </button>
              </h3>
              <div class="piece-summary-tools"><WorkshopPracticeStatistics :title="piece.title" :statistics="practiceStatisticsFor(piece)" :progress-percent="practiceProgressFor(piece)" /><button type="button" class="summary-info" :disabled="xmlBusy" :aria-label="$t('WORKSHOP_PIECE_INFO')+': '+piece.title" @click="openLibraryInfo(piece)">ⓘ</button></div>
            </div>
            <div :id="'workshop-piece-'+piece.id" class="piece-content" :hidden="!pieceExpanded(piece)"><template v-if="pieceExpanded(piece)">
            <div class="piece-preview-block">
              <button type="button" class="piece-preview" :class="{'is-listening':libraryPieceActive(piece)}" :disabled="xmlBusy" :aria-label="$t(libraryPieceActive(piece) ? 'WORKSHOP_PIECE_PREVIEW_STOP' : 'WORKSHOP_PIECE_PREVIEW_LISTEN',{title:piece.title})" :aria-pressed="libraryPieceActive(piece)" @click="toggleLibraryPiece(piece)">
                <WorkshopPiecePreview :score="pieceScore(piece)" />
                <span class="library-preview-control" aria-hidden="true">{{libraryPieceActive(piece) ? '■' : '▶'}} {{$t(libraryAudio.pieceId === piece.id && libraryAudio.busy ? 'WORKSHOP_AUDIO_LOADING' : libraryPieceActive(piece) ? 'WORKSHOP_STOP' : 'WORKSHOP_LIBRARY_LISTEN')}}</span>
              </button>
              <div class="practice-controls" role="group" :aria-label="$t('WORKSHOP_PRACTICE_HANDS',{title:piece.title})">
                <button type="button" class="practice-hand" :class="{selected:practiceHandsFor(piece).left}" :aria-label="$t('WORKSHOP_PRACTICE_LEFT')" :aria-pressed="practiceHandsFor(piece).left" :disabled="xmlBusy || practiceHandsFor(piece).left && !practiceHandsFor(piece).right" @click="togglePracticeHand(piece,'left')">
                  <svg class="practice-paw-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 29c-8 0-18 12-18 20 0 6 5 9 10 9 3 0 5-2 8-2s5 2 8 2c5 0 10-3 10-9 0-8-10-20-18-20z" /><ellipse cx="11" cy="29" rx="6" ry="9" transform="rotate(-22 11 29)" /><ellipse cx="24" cy="16" rx="6" ry="9" transform="rotate(-10 24 16)" /><ellipse cx="40" cy="16" rx="6" ry="9" transform="rotate(10 40 16)" /><ellipse cx="53" cy="29" rx="6" ry="9" transform="rotate(22 53 29)" /></svg><span>L</span>
                </button>
                <button type="button" class="practice-start" :disabled="xmlBusy" @click="startPractice(piece)">▶ {{$t('WORKSHOP_PRACTICE')}}</button>
                <button type="button" class="practice-hand" :class="{selected:practiceHandsFor(piece).right}" :aria-label="$t('WORKSHOP_PRACTICE_RIGHT')" :aria-pressed="practiceHandsFor(piece).right" :disabled="xmlBusy || practiceHandsFor(piece).right && !practiceHandsFor(piece).left" @click="togglePracticeHand(piece,'right')">
                  <svg class="practice-paw-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 29c-8 0-18 12-18 20 0 6 5 9 10 9 3 0 5-2 8-2s5 2 8 2c5 0 10-3 10-9 0-8-10-20-18-20z" /><ellipse cx="11" cy="29" rx="6" ry="9" transform="rotate(-22 11 29)" /><ellipse cx="24" cy="16" rx="6" ry="9" transform="rotate(-10 24 16)" /><ellipse cx="40" cy="16" rx="6" ry="9" transform="rotate(10 40 16)" /><ellipse cx="53" cy="29" rx="6" ry="9" transform="rotate(22 53 29)" /></svg><span>R</span>
                </button>
              </div>
            </div>
            <p v-if="libraryAudio.pieceId === piece.id && libraryAudio.error" class="error" role="alert">{{$t(libraryAudio.error)}}</p>
            <div class="piece-actions saved-piece-actions">
              <button type="button" class="secondary" :disabled="xmlBusy" :aria-label="$t('WORKSHOP_LIBRARY_EDIT')+': '+piece.title" @click="openPiece(piece)">{{$t('WORKSHOP_LIBRARY_EDIT')}}</button>
              <button type="button" :disabled="xmlBusy" :aria-label="$t('WORKSHOP_RENAME')+': '+piece.title" @click="openPieceDetails(piece)">{{$t('WORKSHOP_RENAME')}}</button>
              <button type="button" class="delete-piece" :ref="'delete-'+piece.id" :disabled="xmlBusy" :aria-label="$t('WORKSHOP_DELETE_PIECE')+': '+piece.title" @click="requestPieceDeletion(piece)">{{$t('WORKSHOP_DELETE_PIECE')}}</button>
              <button type="button" class="export-piece" :disabled="xmlBusy" :aria-label="$t('WORKSHOP_XML_EXPORT')+': '+piece.title" @click="exportLibraryPiece(piece)">{{$t('WORKSHOP_XML_EXPORT')}}</button>
            </div>
            </template></div>
          </article>
        </section>
        <p class="footnote library-total">{{$tc('WORKSHOP_PIECE_COUNT', pieces.length, { count:pieces.length })}}</p>
      </template>
      <template v-else>
        <details ref="pieceSettings" class="card piece-settings">
          <summary><strong>{{$t('WORKSHOP_TOOLS_PIECE')}}</strong><span>{{draft.title || $t('WORKSHOP_UNTITLED')}}</span><small>{{draft.score.bpm}} BPM · {{$t('WORKSHOP_EDIT_PIECE')}}</small></summary>
          <label>{{$t('WORKSHOP_TITLE')}}<input v-model="draft.title" maxlength="80" @focus="beginTitleEdit" @input="savedNotice = false" @change="setTitle" /></label>
          <div class="settings-row"><label>{{$t('WORKSHOP_TEMPO')}}
            <input type="number" min="25" max="240" :value="tempoInput === null ? draft.score.bpm : tempoInput" @input="tempoInput=$event.target.value; savedNotice=false" @change="setTempo($event)" />
          </label><div class="fixed-settings"><strong>{{currentContext.meter}} · {{keyLabel(currentContext.keyId)}}</strong><small>{{clefLabel(currentContext.clef)}} · {{$t('WORKSHOP_BAR', { number:barIndex + 1 })}}</small></div></div>
          <WorkshopNotationControls section="document" :score="draft.score" @change="commitAdvancedNotation" />
          <div v-if="midiImportAvailable" class="midi-notation-options" role="group" :aria-label="$t('WORKSHOP_MIDI_NOTATION')">
            <p>{{$t('WORKSHOP_MIDI_NOTATION_HINT')}}</p>
            <button type="button" @click="setMidiNotation(true)">{{$t('WORKSHOP_MIDI_NOTATION_SIMPLIFY')}}</button>
          </div>
          <div class="xml-actions"><button type="button" :disabled="xmlBusy" @click="exportMusicXml(false)">{{$t('WORKSHOP_XML_EXPORT')}}</button><button type="button" :disabled="xmlBusy" @click="exportMusicXml(true)">{{$t('WORKSHOP_MXL_EXPORT')}}</button></div>
          <label v-if="currentPiece && (currentPiece.revisions.length > 1 || selectedRevisionId === null)" class="revision-select">
            {{$t('WORKSHOP_SAVED_VERSIONS')}}
            <select v-model="revisionChoice">
              <option v-if="selectedRevisionId === null" value="" disabled>{{$t('WORKSHOP_REVISION_EDITED')}}</option>
              <option v-for="(revision, index) in currentPiece.revisions" :key="revision.id" :value="revision.id">
                {{$t('WORKSHOP_VERSION', { number: index + 1 })}}
              </option>
            </select>
          </label>
          <details v-if="currentPiece" ref="revisionManager" class="revision-manager">
            <summary>{{$t('WORKSHOP_REVISIONS_MANAGE')}}</summary>
            <p>{{$t('WORKSHOP_REVISIONS_HINT',{count:currentPiece.revisions.length,max:maxPieceRevisions})}}</p>
            <label v-for="(revision,index) in currentPiece.revisions" :key="revision.id" class="revision-choice">
              <input type="checkbox" :checked="revisionSelection.includes(revision.id)" :disabled="revision.id === currentPiece.currentRevisionId" @change="toggleRevisionSelection(revision.id,$event.target.checked)" />
              <span>{{$t('WORKSHOP_VERSION',{number:index+1})}}<small v-if="revision.id === currentPiece.currentRevisionId">{{$t('WORKSHOP_REVISIONS_CURRENT')}}</small></span>
            </label>
            <p v-if="revisionDeleteError" class="error" role="alert">{{$t(revisionDeleteError)}}</p>
            <button type="button" class="delete-piece" :disabled="!revisionSelection.length" @click="requestRevisionDeletion">{{$t('WORKSHOP_REVISIONS_DELETE_SELECTED',{count:revisionSelection.length})}}</button>
          </details>
        </details>
        <div class="editor-actions">
          <button type="button" class="secondary" :disabled="!hasNotes" @click="togglePlayback">
            {{audioStarting ? '■' : playing ? 'Ⅱ' : '▶'}} {{$t(audioStarting ? 'WORKSHOP_STOP' : playing ? 'WORKSHOP_PAUSE' : playbackPaused ? 'RESUME' : listeningView ? 'WORKSHOP_PLAY' : playbackBarIndex !== null ? 'WORKSHOP_LISTEN_BAR' : 'WORKSHOP_LISTEN')}}</button>
          <button ref="editorSave" type="button" class="primary" :disabled="!draft.title.trim()" @click="savePiece">{{$t('WORKSHOP_SAVE')}}</button>
        </div>
        <p v-if="playbackError" class="error" role="alert">{{$t(playbackError)}}</p>
        <p class="save-state" role="status">{{$t(saveError || (savedNotice ? 'WORKSHOP_SAVED' : dirty ? 'WORKSHOP_UNSAVED' : 'WORKSHOP_UP_TO_DATE'))}}</p>
        <button v-if="saveError === 'WORKSHOP_REVISION_LIMIT'" type="button" @click="openRevisionManager">{{$t('WORKSHOP_REVISIONS_MANAGE')}}</button>
        <div class="score-view-toggle" role="group" :aria-label="$t('WORKSHOP_VIEW')">
          <button type="button" :class="{ selected:!sheetView && !listeningView }" :aria-pressed="!sheetView && !listeningView" @click="setSheetView(false)">{{$t('WORKSHOP_VIEW_EDIT')}}</button>
          <button type="button" :class="{ selected:sheetView && !listeningView }" :aria-pressed="sheetView && !listeningView" @click="setSheetView(true)">{{$t('WORKSHOP_VIEW_SHEET')}}</button>
        </div>
        <WorkshopEditorZoom v-if="!listeningView" :value="editorZoom" :panning="editorPanning" :can-pan="!sheetView" @input="setEditorZoom" @pan="setEditorPanning" />
        <div class="editor-grid">
          <section v-if="listeningView && playbackTimeline" class="card listening-preview">
            <WorkshopListening ref="listening" :score="draft.score" :timeline="playbackTimeline" :title="draft.title" :note-label="eventLabel"
              :position="playbackPosition" :playing="playing" :busy="audioStarting" :active-event-ids="activeEventIds"
              @toggle="togglePlayback" @seek="seekPlayback" @scrub-start="pausePlayback" @scrub-end="finishPlaybackScrub" @close="setSheetView(false)" @edit="openSheetBar" @info="openPreviewInfo" />
          </section>
          <section v-else-if="sheetView" class="card sheet-preview">
            <WorkshopSheet :zoom="editorZoom" :follow-playback="playing" @stop-playback="stopPlayback" :score="draft.score" :title="draft.title" :note-naming="noteNaming" :note-label="eventLabel" :active-event-ids="activeEventIds" :active-bar="playing || audioStarting ? playingBar : barIndex" @select-bar="openSheetBar" />
          </section>
          <section v-else class="card composition">
            <div class="section-heading"><h2>{{$t('WORKSHOP_YOUR_BARS')}} <small class="bar-count">{{bars.length}}</small></h2><div class="undo-controls">
              <button type="button" :disabled="!undoStack.length" @click="undo" :aria-label="$t('WORKSHOP_UNDO')">↶</button>
              <button type="button" :disabled="!redoStack.length" @click="redo" :aria-label="$t('WORKSHOP_REDO')">↷</button>
              <button type="button" class="history-toggle" :class="{ selected:historyOpen }" :aria-expanded="historyOpen" aria-controls="workshop-history" @click="toggleHistory">{{$t('WORKSHOP_HISTORY')}}</button></div></div>
            <section v-if="historyOpen" id="workshop-history" class="history-panel" :aria-label="$t('WORKSHOP_HISTORY_TITLE')" @keydown.esc="historyOpen = false">
              <h3>{{$t('WORKSHOP_HISTORY_TITLE')}}</h3>
              <p class="history-hint">{{$t('WORKSHOP_HISTORY_HINT')}}</p>
              <ol ref="historyList" class="history-list">
                <li v-for="entry in historyEntries" :key="entry.index">
                  <button type="button" :class="{ current:entry.current, future:entry.future }" :aria-current="entry.current ? 'step' : null" @click="jumpToHistory(entry.index)">
                    <span class="history-number" aria-hidden="true">{{entry.index}}</span>
                    <span class="history-name">{{historyEntryLabel(entry)}}</span>
                    <small v-if="entry.current || entry.future">{{$t(entry.current ? 'WORKSHOP_HISTORY_CURRENT' : 'WORKSHOP_HISTORY_FUTURE')}}</small>
                  </button>
                </li>
              </ol>
              <p class="history-limit">{{$t('WORKSHOP_HISTORY_LIMIT')}}</p>
            </section>
            <div ref="barTabs" class="bar-tabs" role="tablist" :aria-label="$t('WORKSHOP_YOUR_BARS')">
              <button v-for="(bar, index) in bars" :key="bar.id" type="button" role="tab"
                :aria-selected="barIndex === index ? 'true' : 'false'" :class="{ selected: barIndex === index, sounding: (playing || audioStarting) && playingBar === index }"
                @click="selectBar(index)"><strong>{{index + 1}}</strong><small>{{numberLabel(barUsedSlots(index))}}/{{numberLabel(barSlots(index))}}</small></button>
            </div>
            <label v-if="bars.length > 8" class="bar-jump">{{$t('WORKSHOP_JUMP_BAR')}}
              <input type="number" inputmode="numeric" min="1" :max="bars.length" :value="barIndex + 1" @change="jumpToBar" />
              <span>/ {{bars.length}}</span>
            </label>
            <details ref="barSettings" class="bar-settings">
              <summary><strong>{{$t('WORKSHOP_TOOLS_BAR')}}</strong><span>{{currentContext.meter}} · {{keyLabel(currentContext.keyId)}}</span><small>{{$t('WORKSHOP_BAR_SETTINGS')}}</small></summary>
            <div class="bar-management">
              <label class="add-bar-count">{{$t('WORKSHOP_NEW_BARS')}}
                <input type="number" inputmode="numeric" min="1" :max="remainingBars"
                  :disabled="!remainingBars" :value="addBarCount" @change="setAddBarCount" />
              </label>
              <button type="button" class="secondary" :disabled="!remainingBars" @click="addBars">＋ {{$t('WORKSHOP_ADD_BARS')}}</button>
              <button type="button" :disabled="bars.length === 1" @click="deleteBar">{{$t('WORKSHOP_DELETE_BAR')}}</button>
            </div>
            <p v-if="bars.length > 1" class="bar-management-hint">{{$t('WORKSHOP_INSERT_AFTER', { number:barIndex + 1 })}}</p>
            <div class="staff-controls">
              <button ref="barKeyButton" type="button" class="secondary key-button" @click="openContextPicker('key')">{{$t('WORKSHOP_KEY_SELECT', { key:keyLabel(currentContext.keyId) })}}</button>
              <button type="button" class="secondary" :class="{ selected:secondStaffEnabled }" :aria-pressed="secondStaffEnabled" @click="toggleSecondStaff">
                {{secondStaffEnabled ? '−' : '＋'}} {{$t(secondStaffEnabled ? 'WORKSHOP_SECOND_STAFF_OFF' : hasSecondStaff ? 'WORKSHOP_SECOND_STAFF_ON' : 'WORKSHOP_SECOND_STAFF_ADD')}}
              </button>
              <p v-if="hasSecondStaff">{{$t('WORKSHOP_SECOND_STAFF_HINT')}}</p>
            </div>
            <details class="notation-settings">
              <summary>{{$t('WORKSHOP_BAR_STRUCTURE')}}</summary>
              <label>{{$t('WORKSHOP_PICKUP')}}
                <select :value="draft.score.pickupUnits || ''" @change="setPickup($event.target.value)">
                  <option value="">{{$t('WORKSHOP_NO_PICKUP')}}</option>
                  <option v-for="units in pickupChoices" :key="units" :value="units">{{$t('WORKSHOP_PICKUP_BEATS', { beats:numberLabel(units/2) })}}</option>
                </select>
              </label>
              <label>{{$t('WORKSHOP_PICKUP_CUSTOM')}}
                <input type="number" step="any" :min="pickupMinimumBeats" :max="pickupMaximumBeats" :value="draft.score.pickupUnits === undefined ? '' : draft.score.pickupUnits/2" @change="setPickupBeats($event)" />
              </label>
              <div class="repeat-controls">
                <button type="button" :class="{ selected:!!currentBar.repeatStart }" :aria-pressed="!!currentBar.repeatStart" @click="setRepeat(!currentBar.repeatStart,currentBar.repeatEnd || null)">𝄆 {{$t('WORKSHOP_REPEAT_START')}}</button>
                <button type="button" :class="{ selected:!!currentBar.repeatEnd }" :aria-pressed="!!currentBar.repeatEnd" @click="setRepeat(!!currentBar.repeatStart,currentBar.repeatEnd ? null : 2)">{{$t('WORKSHOP_REPEAT_END')}} 𝄇</button>
              </div>
              <label v-if="currentBar.repeatEnd">{{$t('WORKSHOP_REPEAT_COUNT')}}
                <select :value="currentBar.repeatEnd" @change="setRepeat(!!currentBar.repeatStart,$event.target.value)">
                  <option v-for="count in [2,3,4,5,6,7,8]" :key="count" :value="count">{{count}}</option>
                </select>
              </label>
              <p class="notation-hint">{{$t('WORKSHOP_REPEAT_HINT')}}</p>
            </details>
            <WorkshopNotationControls section="bar" :score="draft.score" :bar-index="barIndex" :part-index="partIndex" :selected-events="selectedEvents" @change="commitAdvancedNotation" />
            <WorkshopContextControls ref="contextChanges" :score="draft.score" :bar-index="barIndex" :part-index="partIndex" :part-only="keyStaffOnly" :selected-events="selectedEvents" :note-naming="noteNaming" @scope-change="keyStaffOnly = $event" @change="commitAdvancedNotation" />
            <label class="dynamic-picker">{{$t('WORKSHOP_DYNAMIC', { staff:staffLabel(partIndex) })}}
              <select :value="currentContext.dynamic" @change="setDynamic($event.target.value)">
                <option v-for="dynamic in dynamics" :key="dynamic" :value="dynamic">{{dynamic}} · {{$t('WORKSHOP_DYNAMIC_'+dynamic.toUpperCase())}}</option>
              </select>
              <button v-if="currentBar.dynamic" type="button" @click="setDynamic(null)">{{$t('WORKSHOP_DYNAMIC_INHERIT')}}</button>
            </label>
            <details class="bar-options"><summary>{{$t('WORKSHOP_BAR_OPTIONS')}}</summary>
            <div class="bar-tools"><label>{{$t('WORKSHOP_COPY_TO')}}
              <select v-model.number="copyTarget" :disabled="bars.length === 1"><option v-for="(bar, index) in bars" :key="bar.id" :value="index" :disabled="index === barIndex">{{index + 1}}</option></select>
            </label><button type="button" class="secondary" :disabled="bars.length === 1 || copyTarget === barIndex" @click="copyBar">{{$t('WORKSHOP_COPY')}}</button></div>
            <p v-if="bars.length > 1 && copyTarget !== barIndex" class="notation-hint">{{$t('WORKSHOP_COPY_REPLACES',{from:barIndex + 1,to:copyTarget + 1})}}</p>
            <p v-if="copyNotice" class="notation-hint" role="status">{{$t('WORKSHOP_COPY_REPLACED',copyNotice)}}</p>
            <div class="bar-move"><button type="button" :disabled="barIndex === 0" @click="moveBar(-1)">← {{$t('WORKSHOP_MOVE_BAR')}}</button>
              <button type="button" :disabled="barIndex === bars.length - 1" @click="moveBar(1)">{{$t('WORKSHOP_MOVE_BAR')}} →</button></div>
            </details>
            </details>
            <div class="score-title"><strong>{{$t('WORKSHOP_BAR', { number: barIndex + 1 })}}</strong>
              <span>{{$t('WORKSHOP_SPACE', { count: numberLabel(freeSlots), total: numberLabel(currentContext.units*2) })}}</span></div>
            <button type="button" class="secondary listen-bar" :disabled="!hasCurrentBarNotes && !((playing || audioStarting || playbackPaused) && playbackBarIndex !== null)" @click="toggleBarPlayback">
              {{audioStarting ? '■' : playing && playbackBarIndex !== null ? 'Ⅱ' : '▶'}} {{$t(audioStarting ? 'WORKSHOP_STOP' : playing && playbackBarIndex !== null ? 'WORKSHOP_PAUSE' : playbackPaused && playbackBarIndex !== null ? 'RESUME' : 'WORKSHOP_LISTEN_BAR')}}
            </button>
            <p v-if="notationError" class="error notation-hint" role="alert">{{$t(notationError)}}</p>
            <div class="selection-toolbar">
              <button type="button" :class="{ selected:multiSelect }" :aria-pressed="multiSelect" @click="toggleMultiSelect">{{$t('WORKSHOP_MULTI_SELECT')}}</button>
              <div v-if="multiSelect" class="selection-units" role="group" :aria-label="$t('WORKSHOP_SELECTION_UNIT')">
                <button type="button" :class="{ selected:selectionUnit === 'note' }" :aria-pressed="selectionUnit === 'note'" @click="setSelectionUnit('note')">{{$t('WORKSHOP_SELECT_NOTES')}}</button>
                <button type="button" :class="{ selected:selectionUnit === 'chord' }" :aria-pressed="selectionUnit === 'chord'" @click="setSelectionUnit('chord')">{{$t('WORKSHOP_SELECT_CHORDS')}}</button>
              </div>
            </div>
            <WorkshopZoomViewport ref="editorViewport" :zoom="editorZoom" :min-width="editorSpacing && editorSpacing.width > 360 ? editorFrameWidth*.78 : 0" :max-width="570" :aria-label="$t('WORKSHOP_SCORE_EDITOR')">
            <div class="score-staves" :class="{ paired:secondStaffEnabled, 'is-panning':editorPanning }" @pointerdown="startEditorPan" @pointermove="moveEditorPan" @pointerup="cancelEditorPan" @pointercancel="cancelEditorPan" @lostpointercapture="cancelEditorPan">
              <div v-for="staff in activeParts" :key="staff.part.id" class="staff-row" :class="{ editing:partIndex === staff.index }"
                @pointerdown.capture="activateStaff(staff.index,$event)" @focusin.capture="activateStaff(staff.index,$event)">
                <button v-if="secondStaffEnabled" type="button" class="staff-label" :aria-pressed="partIndex === staff.index" @click="selectPart(staff.index)">
                  <strong>{{staffLabel(staff.index)}}</strong><span>{{clefLabel(staffContexts[staff.index].clef)}}</span>
                  <small v-if="partIndex === staff.index">{{$t('WORKSHOP_STAFF_EDITING')}}</small>
                </button>
                <WorkshopStaff ref="sheet" :allow-legacy-generated-rests="!draft.score.musicXml" :horizontal-columns="editorSpacing ? editorSpacing.columns : null" :frame-width="editorFrameWidth" :cross-staff-beam-ids="editorCrossStaffBeamIds" :cross-staff-relation-ids="editorCrossStaffRelationIds" :direction-spans="directionSpans[staff.index]" :staff-index="staff.index" :companion-measure="secondStaffEnabled ? editorBars[staff.index === 0 ? 1 : 0] : null" :companion-clef="secondStaffEnabled ? staffContexts[staff.index === 0 ? 1 : 0].clef : null" :measure="editorBars[staff.index]" :clef="staffContexts[staff.index].clef" :meter="staffContexts[staff.index].meter" :key-id="staffContexts[staff.index].keyId" :previous-key-id="previousStaffKeys[staff.index]" :dynamic="staffContexts[staff.index].dynamic" :show-dynamic="barIndex === 0 || !!staff.part.measures[barIndex].dynamic" :voice="toolVoice" :slurs="secondStaffEnabled ? [].concat(...staffSlurs) : staffSlurs[staff.index]" :follow-key-signature="followKeySignature" :active-event-id="activeEventId" :active-event-ids="activeEventIds"
                  :clef-octave="staffContexts[staff.index].clefOctave || 0" :selected-event-id="selectedEventId" :selected-event-ids="staffSelectedIds(staff.index)" :dots="toolDots" :ties="secondStaffEnabled ? [].concat(...staffTies) : staffTies[staff.index]" :glissandos="secondStaffEnabled ? [].concat(...staffGlissandos) : staffGlissandos[staff.index]" :tremolos="secondStaffEnabled ? [].concat(...staffTremolos) : staffTremolos[staff.index]" :lyric-verse-numbers="editorLyricVerseNumbers[staff.index]" :source-lyric-verse-numbers="editorLyricVerseNumbers" :bar-index="barIndex" :selection-only="!!tieAnchorId" :kind="tool.kind" :note-value="tool.noteValue" :alter="tool.alter"
                  :multi-select="multiSelect" :selection-unit="selectionUnit" :note-label="eventLabel" @select="onStaffEvent(staff.index,'selectEvent',$event)" @select-group="onStaffEvent(staff.index,'selectGroup',$event)"
                  @toggle-selection="onStaffEvent(staff.index,'toggleSelection',$event)" @extend-selection="onStaffEvent(staff.index,'extendSelection',$event)"
                  @edit-context="editInbarContext(staff.index,$event)" @change-clef="openContextPicker('clef',staff.index)" @change-meter="openContextPicker('meter',staff.index)"
                  @place="onStaffEvent(staff.index,'placeOnSheet',$event)" @move-note="onStaffEvent(staff.index,'moveSheetNote',$event)" @move-notes="onStaffEvent(staff.index,'moveSheetNotes',$event)" />
              </div>
              <WorkshopEditorBeamBridge v-if="secondStaffEnabled" :display-zoom="editorZoom" :score="draft.score" :bar-index="barIndex" :get-staffs="sheetInstances" :selected-event-ids="selectedEventIds.concat(selectedEventId ? [selectedEventId] : [])" :active-event-ids="activeEventIds" @groups="editorCrossStaffBeamIds = $event" @relationgroups="editorCrossStaffRelationIds = $event" />
            </div>
            </WorkshopZoomViewport>
            <div class="toolbox" v-show="!tieAnchorId">
              <div class="toolbox-heading"><h3>{{$t('WORKSHOP_TOOLS_NOTE')}}</h3><span>{{$t(hasSelection ? 'WORKSHOP_EDIT_SELECTED_TOOL' : tool.kind === 'rest' ? 'WORKSHOP_NEW_REST_TOOL' : 'WORKSHOP_NEW_NOTE_TOOL')}}</span></div>
              <div class="toggle" role="group" :aria-label="$t('WORKSHOP_BLOCK_TYPE')">
                <button type="button" :class="{ selected: !hasSelection && tool.kind === 'note' }" :aria-pressed="!hasSelection && tool.kind === 'note'" @click="chooseToolKind('note')"><WorkshopSymbol />{{$t(hasSelection ? 'WORKSHOP_NEW_NOTE_TOOL' : 'WORKSHOP_NOTE')}}</button>
                <button type="button" :class="{ selected: !hasSelection && tool.kind === 'rest' }" :aria-pressed="!hasSelection && tool.kind === 'rest'" @click="chooseToolKind('rest')"><WorkshopSymbol kind="rest" />{{$t(hasSelection ? 'WORKSHOP_NEW_REST_TOOL' : 'WORKSHOP_REST')}}</button></div>
              <div class="durations" role="group" :aria-label="$t('WORKSHOP_NOTE_VALUE')">
                <button v-for="value in basicNoteValues" :key="value" type="button" :class="{ selected: activeNoteValue === value }"
                  :aria-pressed="activeNoteValue === value" :aria-label="durationLabel(value)" @click="chooseToolValue(value)"><WorkshopSymbol :note-value="value" :kind="tool.kind" /><span>{{value === 'sixteenth' ? $t('WORKSHOP_SIXTEENTH_SHORT') : value === 'thirtysecond' ? $t('WORKSHOP_THIRTYSECOND_SHORT') : durationLabel(value)}}</span></button>
              </div>
              <button type="button" class="dot-toggle" :class="{ selected:activeDots > 0 }" :aria-pressed="activeDots > 0" :disabled="!canDotSelection" @click="toggleDots">· {{$t('WORKSHOP_DOTTED')}}</button>
              <p v-if="selectedNotes.some(event => event.originalNoteValue)" class="auto-value-hint">{{$t('WORKSHOP_AUTO_VALUE_HINT')}}</p>
              <div v-if="hasSelection ? selectedNotes.length : tool.kind === 'note'" class="alter-picker placement-alter" role="group" :aria-label="$t(hasSelection ? 'WORKSHOP_SELECTION_ACCIDENTAL' : 'WORKSHOP_ACCIDENTAL')">
                <button v-for="alter in [-1, 0, 1]" :key="alter" type="button" :class="{ selected:isActiveAlter(alter) }"
                  :aria-pressed="isActiveAlter(alter)" @click="chooseActiveAlter(alter)">{{alterSymbol(alter)}} {{alterLabel(alter)}}</button>
                <button v-if="!hasSelection" type="button" :class="{ selected:followKeySignature }" :aria-pressed="followKeySignature" @click="chooseKeyAccidentals">{{$t('WORKSHOP_USE_KEY')}}</button>
              </div>
              <p v-if="!hasSelection && tool.kind === 'note'" class="key-placement-hint">{{$t(followKeySignature ? 'WORKSHOP_USE_KEY_HINT' : 'WORKSHOP_OVERRIDE_KEY_HINT')}}</p>
              <details ref="keyboardInsertion" class="keyboard-insertion" @toggle="prepareKeyboardInsertion">
                <summary>{{$t('WORKSHOP_KEYBOARD_INSERT')}}</summary>
                <p class="hint">{{$t('WORKSHOP_KEYBOARD_INSERT_HINT',{staff:staffLabel(partIndex),bar:barIndex + 1})}}</p>
                <form @submit.prevent="insertWithKeyboard">
                  <div class="keyboard-insertion-fields">
                    <label>{{$t('WORKSHOP_KEYBOARD_POSITION')}}<input v-model="keyboardBeat" type="number" min="1" :max="keyboardLastBeat" :step="keyboardGridStep / 2" required /></label>
                    <label>{{$t('WORKSHOP_VOICES')}}<select v-model.number="toolVoice"><option v-for="voice in [1,2,3,4]" :key="voice" :value="voice">{{$t('WORKSHOP_VOICE_LABEL',{voice})}}</option></select></label>
                    <label v-if="tool.kind === 'note'">{{$t('WORKSHOP_KEYBOARD_WRITTEN_NOTE')}}<select v-model="keyboardStep"><option v-for="step in ['C','D','E','F','G','A','B']" :key="step" :value="step">{{keyboardStepLabel(step)}}</option></select></label>
                    <label v-if="tool.kind === 'note'">{{$t('WORKSHOP_OCTAVE')}}<input v-model.number="keyboardOctave" type="number" min="0" max="8" step="1" required /></label>
                  </div>
                  <button type="submit" :disabled="keyboardInserting">{{$t('WORKSHOP_INSERT')}}</button>
                </form>
                <p v-if="keyboardInsertNotice" class="hint" role="status">{{$t('WORKSHOP_KEYBOARD_INSERTED',keyboardInsertNotice)}}</p>
              </details>
              <p v-if="placementError" class="hint error" role="alert">{{$t(placementError)}}</p>
            </div>
            <section class="selection-panel" :aria-label="$t('WORKSHOP_SELECTION')">
              <template v-if="hasSelection && !tieAnchorId">
              <div class="selection-tools">
                <div class="selection-identity" aria-live="polite"><small>{{$t(chordSelected ? 'WORKSHOP_EDIT_CHORD' : groupSelected ? 'WORKSHOP_EDIT_SELECTION' : 'WORKSHOP_EDIT_BLOCK')}}</small>
                  <strong>{{selectionTitle}}</strong></div>
                <button type="button" :disabled="!hasSelection" @click="clearSelection">{{$t('WORKSHOP_DESELECT')}}</button>
                <button type="button" :disabled="!hasSelection" @click="eraseSelectedEvent">{{$t(chordSelected ? 'WORKSHOP_REMOVE_CHORD' : groupSelected ? 'WORKSHOP_REMOVE_SELECTION' : 'WORKSHOP_REMOVE')}}</button>
              </div>
              <p v-if="chordSelected" class="chord-tones">{{$t('WORKSHOP_CHORD_TONES', { notes:selectionToneNames.join(' · ') })}}</p>
              <p v-if="selectionAlternatives.length" class="chord-alternatives">{{$t('WORKSHOP_CHORD_ALTERNATIVES', { names:selectionAlternatives.join(' · ') })}}</p>
              <WorkshopFingeringControls v-if="selectedNotes.length" compact :selected-notes="selectedNotes" @simple="setFingering" @change="setFingerings" />
              </template>
              <div v-if="tieAnchorEntry" class="tie-target" aria-live="polite">
                <strong>{{$t(connectionMessage('TARGET'), { note:eventLabel(tieAnchorEntry.event),bar:tieAnchorEntry.barIndex + 1 })}}</strong>
                <p>{{$t(connectionMessage('TARGET_HINT'))}}</p>
                <p v-if="tieError" class="error" role="alert">{{$t(tieError)}}</p>
                <button type="button" @click="cancelTieSelection">{{$t(connectionMessage('CANCEL'))}}</button>
              </div>
            </section>
              <details v-show="!tieAnchorId" class="note-more">
                <summary>{{$t('WORKSHOP_MORE_TOOLS')}}</summary>
              <details class="extra-note-values"><summary>{{$t('WORKSHOP_EXTRA_VALUES')}}</summary><div class="durations"><button v-for="value in extraNoteValues" :key="value" type="button" :class="{selected:activeNoteValue === value}" :aria-pressed="activeNoteValue === value" @click="chooseToolValue(value)"><WorkshopSymbol :note-value="value" :kind="tool.kind" /><span>{{durationLabel(value)}}</span></button></div></details>
                <details v-if="hasSelection ? selectedNotes.length : tool.kind === 'note'" class="quartertone-options">
                  <summary>{{$t('WORKSHOP_RARE_ACCIDENTALS')}}</summary>
                  <div class="alter-picker rare-alter"><button v-for="alter in [-2, 2]" :key="alter" type="button" :class="{selected:isActiveAlter(alter)}" :aria-pressed="isActiveAlter(alter)" @click="chooseActiveAlter(alter)">{{alterSymbol(alter)}} {{alterLabel(alter)}}</button></div>
                  <details class="quartertone-options"><summary>{{$t('WORKSHOP_QUARTERTONES')}}</summary>
                    <div class="alter-picker quarter-alter"><button v-for="alter in [-1.5,-.5,.5,1.5]" :key="alter" type="button" :class="{selected:isActiveAlter(alter)}" :aria-pressed="isActiveAlter(alter)" @click="chooseActiveAlter(alter)">{{alterLabel(alter)}}</button></div>
                  </details>
                </details>
                <template v-if="hasSelection && !tieAnchorId">
              <label v-if="selectedNotes.length" class="accidental-display-picker">{{$t('WORKSHOP_ACCIDENTAL_DISPLAY')}}
                <select :value="selectionAccidentalDisplay" @change="changeAccidentalDisplay($event.target.value)">
                  <option v-if="selectionAccidentalDisplay === 'mixed'" value="mixed" disabled>{{$t('WORKSHOP_ACCIDENTAL_MIXED')}}</option>
                  <option value="auto">{{$t('WORKSHOP_ACCIDENTAL_AUTO')}}</option><option value="always">{{$t('WORKSHOP_ACCIDENTAL_ALWAYS')}}</option>
                  <option value="parentheses">{{$t('WORKSHOP_ACCIDENTAL_PARENTHESES')}}</option><option value="bracket">{{$t('WORKSHOP_ACCIDENTAL_BRACKET')}}</option>
                </select><small>{{$t('WORKSHOP_ACCIDENTAL_DISPLAY_HINT')}}</small>
              </label>
              <div v-if="selectedNotes.length" class="accidental-flags" role="group" :aria-label="$t('WORKSHOP_ACCIDENTAL_DISPLAY')">
                <button v-for="flag in ['cautionary','editorial']" :key="flag" type="button" :class="{ selected:hasAccidentalFlag(flag) }" :aria-pressed="hasAccidentalFlag(flag)" @click="toggleAccidentalFlag(flag)">{{$t('WORKSHOP_ACCIDENTAL_'+flag.toUpperCase())}}</button>
                <small>{{$t('WORKSHOP_ACCIDENTAL_FLAGS_HINT')}}</small>
              </div>
              <div v-if="selectedNotes.length > 1 || canUnlinkSelection" class="beam-controls" role="group" :aria-label="$t('WORKSHOP_BEAM_ACTIONS')">
                <button type="button" :disabled="!canConnectSelection" @click="connectSelection">{{$t('WORKSHOP_CONNECT')}}</button>
                <button type="button" :disabled="!canUnlinkSelection" @click="unlinkSelection">{{$t('WORKSHOP_UNLINK')}}</button>
              </div>
              <p v-if="selectedNotes.length > 1 && !canConnectSelection && !canUnlinkSelection" class="beam-hint">{{$t('WORKSHOP_BEAM_HINT')}}</p>
              <div v-if="selectedNotes.length" class="tie-controls" role="group" :aria-label="$t('WORKSHOP_TIE_ACTIONS')">
                <button type="button" :disabled="!canTieSelection" @click="connectTies">{{$t('WORKSHOP_TIE')}}</button>
                <button type="button" :disabled="!hasSelectedTies" @click="unlinkTies">{{$t('WORKSHOP_UNTIE')}}</button>
              </div>
              <p v-if="selectedNotes.length" class="tie-hint">{{$t('WORKSHOP_TIE_HINT')}}</p>
              <div v-if="selectedNotes.length" class="slur-controls" role="group" :aria-label="$t('WORKSHOP_SLUR_ACTIONS')">
                <button type="button" :disabled="!canSlurSelection" @click="connectSlur">{{$t('WORKSHOP_SLUR')}}</button>
                <button type="button" :disabled="!hasSelectedSlurs" @click="unlinkSlurs">{{$t('WORKSHOP_UNSLUR')}}</button>
              </div>
              <div v-if="selectedNotes.length === 1 && selectedEvents.length === 1" class="glissando-controls">
                <button type="button" @click="startGlissandoSelection('glissando')">{{$t('WORKSHOP_GLISSANDO')}}</button>
                <button type="button" @click="startGlissandoSelection('slide')">{{$t('WORKSHOP_SLIDE')}}</button>
              </div>
              <div v-if="selectedEvents.length > 1 || hasSelectedTriplets" class="triplet-controls" role="group" :aria-label="$t('WORKSHOP_TRIPLETS')">
                <button type="button" :disabled="!canTripletSelection" @click="connectTriplet">{{$t('WORKSHOP_TRIPLET_FORM')}}</button>
                <button type="button" :disabled="!hasSelectedTriplets" @click="unlinkTriplets">{{$t('WORKSHOP_TRIPLET_REMOVE')}}</button>
              </div>
              <p v-if="selectedEvents.length > 1 || hasSelectedTriplets" class="notation-hint">{{$t('WORKSHOP_TRIPLET_HINT')}}</p>
              <details v-if="selectedEvents.length" class="expression-tools">
                <summary>{{$t('WORKSHOP_EXPRESSION')}}</summary>
                <div v-if="selectedNotes.length" class="articulation-controls" role="group" :aria-label="$t('WORKSHOP_ARTICULATION')">
                  <button v-for="kind in articulationOptions" :key="kind" type="button" :class="{ selected:hasArticulation(kind) }" :aria-pressed="hasArticulation(kind)" @click="toggleArticulation(kind)">{{$t('WORKSHOP_ARTICULATION_'+kind.toUpperCase())}}</button>
                </div>
                <label>{{$t('WORKSHOP_PEDAL')}}
                  <select :value="selectedPedal" :disabled="selectedEvents.length !== 1" @change="setPedal($event.target.value)">
                    <option value="">{{$t('WORKSHOP_NONE')}}</option><option value="down">{{$t('WORKSHOP_PEDAL_DOWN')}}</option><option value="up">{{$t('WORKSHOP_PEDAL_UP')}}</option>
                  </select>
                </label>
                <p class="notation-hint">{{$t('WORKSHOP_EXPRESSION_HINT')}}</p>
              </details>
                </template>
                <details class="voice-options"><summary>{{$t('WORKSHOP_VOICES')}} · {{$t('WORKSHOP_VOICE_LABEL', { voice:selectionVoice || toolVoice })}}</summary>
            <div class="voice-picker" role="group" :aria-label="$t('WORKSHOP_VOICES')">
              <button v-for="voice in [1,2,3,4]" :key="voice" type="button" :class="{ selected:selectionVoice === voice }" :aria-pressed="selectionVoice === voice" @click="chooseVoice(voice)">{{$t('WORKSHOP_VOICE_LABEL', { voice })}}</button>
            </div>
            <p class="voice-hint">{{$t(hasSelection ? 'WORKSHOP_VOICE_SELECTION_HINT' : 'WORKSHOP_VOICE_HINT')}}</p>
                </details>
            <WorkshopNotationControls section="selection" :score="draft.score" :bar-index="barIndex" :part-index="partIndex" :selected-events="selectedEvents" @change="commitAdvancedNotation" />
                <details class="editor-help"><summary>{{$t('WORKSHOP_EDITOR_HELP')}}</summary>
            <p class="sheet-hint">{{$t(multiSelect ? 'WORKSHOP_MULTI_HINT' : 'WORKSHOP_SHEET_HINT')}}</p>
              <p class="dot-hint">{{$t('WORKSHOP_DOTTED_HINT')}}</p>
                </details>
              </details>
          </section>
        </div>
      </template>
    </div>
    <div v-if="importNotice" class="confirmation-overlay" @click.self="closeImportNotice">
      <section class="card confirmation import-notice" role="dialog" aria-modal="true" aria-labelledby="workshop-import-notice-title" aria-describedby="workshop-import-notice-content" @keydown.esc.stop.prevent="closeImportNotice" @keydown.tab.prevent="trapDecisionFocus($event,'import')">
        <h2 id="workshop-import-notice-title">{{$t('WORKSHOP_IMPORT_DETAILS')}}</h2>
        <div id="workshop-import-notice-content">
          <p v-if="importNoteCounts && importNoteCounts.skipped > 0" class="import-note-count" role="status">{{$t('WORKSHOP_IMPORT_NOTE_COUNTS',importNoteCounts)}}</p>
          <section v-if="importUnsupportedElements.length" class="import-symbols" aria-labelledby="workshop-import-symbols-title">
            <h3 id="workshop-import-symbols-title">{{$t('WORKSHOP_IMPORT_UNSUPPORTED_SYMBOLS')}}</h3>
            <ul role="list"><li v-for="(item,index) in importUnsupportedElements" :key="index">
              <strong>{{importSymbolName(item)}}</strong>
              <code>&lt;{{item.element}}&gt;<span v-if="item.detail"> · {{item.detail}}</span></code>
              <span v-if="item.measures.length" class="import-symbol-location">{{$t('WORKSHOP_IMPORT_SYMBOL_MEASURES',{measures:item.measures.slice(0,8).join(', ') + (item.measures.length > 8 ? ' …' : '')})}}</span>
            </li></ul>
          </section>
          <ul role="list"><li v-for="warning in importNoticeWarnings" :key="warning">{{$t(xmlWarningKey(warning))}}</li></ul>
        <div v-if="midiImportAvailable" class="midi-notation-options">
          <h3>{{$t('WORKSHOP_MIDI_NOTATION')}}</h3><p>{{$t('WORKSHOP_MIDI_NOTATION_HINT')}}</p>
          <button ref="importNotation" type="button" :aria-pressed="midiNotationSimplified" @click="setMidiNotation(!midiNotationSimplified)">{{$t(midiNotationSimplified ? 'WORKSHOP_MIDI_NOTATION_EXACT' : 'WORKSHOP_MIDI_NOTATION_SIMPLIFY')}}</button>
          <p v-if="midiNotationSimplified" role="status">{{$t('WORKSHOP_MIDI_NOTATION_CHANGED')}}</p>
        </div>
        </div>
        <button ref="importNoticeClose" type="button" class="secondary" @click="closeImportNotice">{{$t('WORKSHOP_IMPORT_ACK')}}</button>
      </section>
    </div>
    <div v-if="contextPicker" ref="contextOverlay" class="confirmation-overlay" @click.self="closeContextPicker">
      <section ref="contextDialog" class="card confirmation context-dialog" role="dialog" aria-modal="true" tabindex="-1" :aria-label="contextPickerTitle" @keydown.esc.stop.prevent="closeContextPicker">
        <h2>{{contextPickerTitle}}</h2>
        <p v-if="secondStaffEnabled && contextPicker !== 'key'" class="context-staff">{{$t(contextPicker === 'clef' ? 'WORKSHOP_CLEF_STAFF_SCOPE' : 'WORKSHOP_METER_STAFF_SCOPE', { staff:staffLabel(partIndex) })}}</p>
        <p>{{$t(contextPicker === 'key' ? 'WORKSHOP_BAR_KEY_APPLIES' : 'WORKSHOP_CONTEXT_APPLIES', { number:barIndex + 1 })}}</p>
        <template v-if="contextPicker === 'key' && hasSecondStaff">
          <label class="key-scope"><input type="checkbox" v-model="keyStaffOnly" />{{$t('WORKSHOP_KEY_STAFF_ONLY',{staff:staffLabel(partIndex)})}}</label>
          <p class="hint">{{$t('WORKSHOP_KEY_STAFF_ONLY_HINT')}}</p>
        </template>
        <NoteFlowCircleSelector v-if="contextPicker === 'key'" :value="currentContext.keyId" accidentals="sharpAndFlat" :note-naming="noteNaming" @input="applyBarKey" />
        <div v-if="contextPicker === 'clef'" class="context-choices clef-choices">
          <button v-for="clef in clefs" :key="clef" type="button" :class="{ selected:currentContext.clef === clef }" :aria-pressed="currentContext.clef === clef" @click="applyBarContext(clef)">{{clefLabel(clef)}}</button>
        </div>
        <div v-else-if="contextPicker === 'meter'" class="context-choices meter-choices">
          <button v-for="meter in meters" :key="meter" type="button" :class="{ selected:currentContext.meter === meter }" :aria-pressed="currentContext.meter === meter" @click="applyBarContext(meter)">{{meter}}</button>
        </div>
        <label v-if="contextPicker === 'meter'">{{$t('WORKSHOP_CUSTOM_METER')}}<input v-model="customMeter" placeholder="4/4 · 3+2/8" maxlength="24" /><button type="button" @click="applyBarContext(customMeter)">{{$t('WORKSHOP_APPLY')}}</button></label>
        <p v-if="contextError" class="error" role="alert">{{$t(contextError)}}</p>
        <button v-if="hasContextOverride" type="button" class="secondary" @click="applyBarContext(null)">{{$t(barIndex === 0 ? 'WORKSHOP_CONTEXT_DEFAULT' : 'WORKSHOP_CONTEXT_INHERIT')}}</button>
        <button type="button" class="plain" @click="closeContextPicker">{{$t('APP_INFO_CLOSE')}}</button>
      </section>
    </div>
    <div v-if="pieceToDelete" class="confirmation-overlay" @click.self="cancelPieceDeletion">
      <section class="card confirmation" role="alertdialog" aria-modal="true" :aria-label="$t('WORKSHOP_DELETE_PIECE')" @keydown.esc="cancelPieceDeletion" @keydown.tab.prevent="cycleDeletionFocus">
        <h2>{{$t('WORKSHOP_DELETE_PIECE')}}</h2>
        <p class="delete-title">{{pieceToDelete.title}}</p><p>{{$t('WORKSHOP_DELETE_PIECE_HINT')}}</p>
        <p v-if="pieceDeleteError" class="error" role="alert">{{$t(pieceDeleteError)}}</p>
        <button ref="deleteCancel" type="button" class="secondary" @click="cancelPieceDeletion">{{$t('WORKSHOP_DELETE_CANCEL')}}</button>
        <button ref="deleteConfirm" type="button" class="delete-piece" @click="confirmPieceDeletion">{{$t('WORKSHOP_DELETE_CONFIRM')}}</button>
      </section>
    </div>
    <WorkshopPieceDetails v-if="pieceDetailsDraft" :draft="pieceDetailsDraft" :error="pieceDetailsError" @save="savePieceDetails" @cancel="closePieceDetails" />
    <WorkshopPieceInfo v-if="infoPiece" :score="infoPiece.score" :title="infoPiece.title" :timeline="infoPiece.timeline" :show-license="infoPiece.showLicense" @close="infoPiece=null" />
    <div v-if="revisionDeleteIds.length" class="confirmation-overlay"><section class="card confirmation" role="alertdialog" aria-modal="true" :aria-label="$t('WORKSHOP_REVISIONS_DELETE_TITLE')" @keydown.esc.stop.prevent="cancelRevisionDeletion" @keydown.tab.prevent="trapDecisionFocus($event,'revision')">
      <h2>{{$t('WORKSHOP_REVISIONS_DELETE_TITLE')}}</h2><p>{{$t('WORKSHOP_REVISIONS_DELETE_CONFIRM',{count:revisionDeleteIds.length})}}</p>
      <p v-if="revisionDeleteError" class="error" role="alert">{{$t(revisionDeleteError)}}</p>
      <button ref="revisionCancel" type="button" @click="cancelRevisionDeletion">{{$t('WORKSHOP_DELETE_CANCEL')}}</button>
      <button ref="revisionConfirm" type="button" class="delete-piece" @click="confirmRevisionDeletion">{{$t('WORKSHOP_DELETE_CONFIRM')}}</button>
    </section></div>
    <div v-if="confirmExit" class="confirmation-overlay"><section class="card confirmation" role="alertdialog" aria-modal="true" :aria-label="$t('WORKSHOP_UNSAVED')" @keydown.esc.stop.prevent="cancelExit" @keydown.tab.prevent="trapDecisionFocus($event,'exit')">
      <h2>{{$t('WORKSHOP_UNSAVED')}}</h2><p>{{$t('WORKSHOP_EXIT_HINT')}}</p>
      <p v-if="saveError" class="error" role="alert">{{$t(saveError)}}</p>
      <button ref="exitSave" type="button" class="primary" @click="saveAndClose">{{$t('WORKSHOP_SAVE_AND_BACK')}}</button>
      <button ref="exitDiscard" type="button" class="secondary" @click="closeEditor">{{$t('WORKSHOP_DISCARD')}}</button>
      <button ref="exitContinue" type="button" class="plain" @click="cancelExit">{{$t('WORKSHOP_CONTINUE')}}</button>
      <button v-if="saveError === 'WORKSHOP_REVISION_LIMIT'" ref="exitManage" type="button" @click="cancelExit();openRevisionManager()">{{$t('WORKSHOP_REVISIONS_MANAGE')}}</button>
    </section></div>
  </main>
</template>

<script>
import AudioSync from "../model/AudioSynchronization";
import { watchAudioTimingChanges } from "../model/AudioSynchronizationPlayback";
import HomeMusicBackdrop from "./HomeMusicBackdrop";
import MidiConnectionStatus from "./MidiConnectionStatus";
import WebMidi from "webmidi";
import { connectedMidiInputs, MIDI_CONNECTION_CHECK_INTERVAL_MS } from "../model/MidiConnection";
import WorkshopStaff from "./WorkshopStaff";
import { withWorkshopRestProvenance } from "../model/WorkshopRests";
import { createWorkshopStaffRawNotation as workshopStaffRawNotation } from "../model/WorkshopStaffNotation";
import { spaceWorkshopAccidentalsTogether } from "../model/WorkshopChordLayout";
import { workshopMeasureDirectionSpans } from "../model/WorkshopNotationDirections";
import WorkshopSheet from "./WorkshopSheet";
import WorkshopEditorZoom from "./WorkshopEditorZoom";
import WorkshopZoomViewport from "./WorkshopZoomViewport";
import WorkshopListening from "./WorkshopListening";
import WorkshopPractice from "./WorkshopPractice";
import WorkshopPracticeStatistics from "./WorkshopPracticeStatistics";
import { createWorkshopPracticePlan } from "../model/WorkshopPractice";
import { workshopPracticeStatisticsFor, workshopPracticeProgress } from "../model/WorkshopPracticeStatistics";
import { workshopPracticePersistenceState, loadWorkshopPracticePersistence,
  captureWorkshopPracticeAssessment, queueWorkshopPracticeDeletion,
  flushWorkshopPracticePersistence } from "../model/WorkshopPracticePersistence";
import WorkshopPieceInfo from "./WorkshopPieceInfo";
import WorkshopPieceDetails from "./WorkshopPieceDetails";
import WorkshopPiecePreview from "./WorkshopPiecePreview";
import { createWorkshopLibraryPlayback } from "../model/WorkshopLibraryPlayback";
import WorkshopSymbol from "./WorkshopSymbol";
import WorkshopContextControls from "./WorkshopContextControls";
import WorkshopNotationControls from "./WorkshopNotationControls";
import WorkshopFingeringControls from "./WorkshopFingeringControls";
import { workshopFingerings, isValidWorkshopFingerings } from "../model/WorkshopFingerings";
import WorkshopEditorBeamBridge from "./WorkshopEditorBeamBridge";
import { importWorkshopMidi, quantizeWorkshopMidiScore } from "../model/WorkshopMidi";
import { importWorkshopMusicXml, exportWorkshopMusicXml, restoreWorkshopTupletDisplay } from "../model/WorkshopMusicXml";
import { readWorkshopMusicFile, saveWorkshopMusicFile, workshopMusicFileKind } from "../model/WorkshopFileExchange";
import NoteFlowCircleSelector from "./NoteFlowCircleSelector";
import { getNoteFlowTonality } from "../model/NoteFlowTonality";
import { formatNoteFlowTonalityLabel } from "../model/NoteFlowKeyLabels";
import Options from "../model/Options";
import { formatDisplayNoteName, normalizeNoteNaming } from "../model/NoteNaming";
import { createPianoSamplePlayer } from "../model/PianoAudio";
import { createWorkshopPianoPlayer } from "../model/WorkshopPianoAudio";
import { createWorkshopPlayback } from "../model/WorkshopPlayback";
import { readWorkshopLibrary, storeWorkshopDraft, storeWorkshopPieceDetails, deleteStoredWorkshopPiece, deleteStoredWorkshopRevisions, initializeWorkshopLibrary } from "../model/WorkshopStorage";
import { isWorkshopDemoPiece } from "../model/WorkshopDemoPieces";
import { recognizeWorkshopChord } from "../model/WorkshopChordNames";
import { workshopRequestedDots, workshopEventVoice, WORKSHOP_TICKS_PER_UNIT } from "../model/WorkshopRhythm";
import { connectWorkshopSlur, disconnectWorkshopSlurs, repairWorkshopSlurs, workshopMeasureSlurs,
  connectWorkshopGlissando, repairWorkshopGlissandos, repairWorkshopTremolos, workshopMeasureGlissandos, workshopMeasureTremolos } from "../model/WorkshopExpression";
import { connectWorkshopTies, disconnectWorkshopTies, repairWorkshopTies, workshopMeasureTies } from "../model/WorkshopTies";
import { placeWorkshopEvent, moveWorkshopNote, replaceWorkshopEvents, removeWorkshopEvents,
  workshopChordEvents, moveWorkshopNotes, canJoinWorkshopNotes, joinWorkshopNotes, splitWorkshopBeams, canMakeWorkshopTriplet, makeWorkshopTriplet, splitWorkshopTriplets } from "../model/WorkshopScoreEditor";
import { createWorkshopDraft, openWorkshopPiece, cloneWorkshop, workshopId, workshopPitchValue,
  workshopMeasureUnits, workshopMeasureEvents, workshopOccupiedSlots, WORKSHOP_NOTE_UNITS,
  WORKSHOP_MAX_SCORE_MEASURES, WORKSHOP_MAX_PIECE_REVISIONS, insertWorkshopMeasures, removeWorkshopMeasure, WORKSHOP_METERS, WORKSHOP_CLEFS,
  workshopMeasureContext, workshopMeasureContextAtSlot, resolveWorkshopMeasure, setWorkshopMeasureContext, moveWorkshopMeasure, isValidWorkshopScore,
  setWorkshopSecondStaffEnabled, setWorkshopKey, setWorkshopPartKey, workshopMeterUnits, setWorkshopPickup, setWorkshopMeasureRepeat } from "../model/Workshop";

import { validateWorkshopEventEdit, validateWorkshopEditCandidate } from "../model/WorkshopEditValidation";
import { createModalFocusGuard } from "../model/ModalFocus";
import { parseWorkshopMeterInput } from "../model/WorkshopMeterInput";
import { workshopMeasureGridStep } from "../model/WorkshopRhythm";

export default {
  name: "Workshop",
  components: { HomeMusicBackdrop, MidiConnectionStatus, WorkshopStaff, WorkshopSheet, WorkshopEditorZoom, WorkshopZoomViewport, WorkshopListening, WorkshopPractice, WorkshopPracticeStatistics, WorkshopPieceInfo, WorkshopPieceDetails, WorkshopPiecePreview, WorkshopSymbol, WorkshopNotationControls, WorkshopFingeringControls, WorkshopContextControls, WorkshopEditorBeamBridge, NoteFlowCircleSelector },
  data() { return {
    editorCrossStaffBeamIds:[], editorCrossStaffRelationIds:[], xmlBusy:false, xmlMessage:null, xmlError:null, xmlWarnings:[], importNoteCounts:null, importUnsupportedElements:[], importNotice:false, customMeter:'4/4',
    library: { version: 1, pieces: [] }, loadError: false, draft: null, baseline: "", draftDirty:false, editorColorIndex:0,
    practicePersistence:workshopPracticePersistenceState, practiceStatsInitialized:false,
    expandedPieces:{}, midiConnected:false, practiceHands:{}, practiceSession:null, infoPiece:null, libraryAudio:{pieceId:null,busy:false,playing:false,error:null},
    pieceDetailsDraft:null, pieceDetailsError:null, pieceToDelete:null, pieceDeleteError:null, libraryNotice:null, audioStarting:false, playbackError:null, listeningView:false, playbackTimeline:null, playbackPosition:0, playbackPaused:false,
    barIndex: 0, partIndex:0, copyTarget: 0, addBarCount: 1, selectedEventId: null, selectedEventIds: [], selectedAnchorId: null, selectedRevisionId: null,
    multiSelect: false, selectionUnit: 'note', contextPicker:null, contextError:null, keyStaffOnly:false, meters:WORKSHOP_METERS, clefs:WORKSHOP_CLEFS,
    tool: { kind: "note", noteValue: "quarter", alter: 0 }, toolDots:0, toolVoice:1, sheetView:false, tieAnchorId:null, connectionKind:'tie', tieError:null,
    keyboardBeat:1, keyboardStep:'C', keyboardOctave:4, keyboardInserting:false, keyboardInsertNotice:null, copyNotice:null,
    dynamics:['ppp','pp','p','mp','mf','f','ff','fff','sf','sfz','fp'], articulationOptions:['staccato','staccatissimo','accent','tenuto'], notationError:null, followKeySignature:true, placementError: null,
    noteUnits: WORKSHOP_NOTE_UNITS, undoStack: [], redoStack: [], historyOpen:false,
    editorZoom:1, editorPanning:false, editorPanGesture:null,
    historyAction:{ key:'WORKSHOP_HISTORY_START', values:{} }, titleEditStart:null, savedNotice: false,
    tempoInput:null, maxPieceRevisions:WORKSHOP_MAX_PIECE_REVISIONS, revisionSelection:[], revisionDeleteIds:[], revisionDeleteError:null,
    midiImportAvailable:false,midiNotationSimplified:false,
    saveError: null, confirmExit: false, playing: false, playingBar: null, playbackBarIndex: null, activeEventId: null, activeEventIds: []
  }; },
  computed: {
    practiceStatistics:{get(){return this.practicePersistence.statistics;},set(value){this.practicePersistence.statistics=value;}},
    practiceStatsError() {return this.practicePersistence.error;},
    practiceStatsLoaded() {return this.practicePersistence.loaded;},
    revisionChoice:{get(){return this.selectedRevisionId || '';},set(id){this.chooseRevision(id);}},
    importNoticeWarnings() {
      const warnings=Array.from(new Set(this.xmlWarnings));
      if(this.xmlMessage !== 'WORKSHOP_XML_IMPORTED') return warnings;
      return ['layout-approximate'].concat(warnings.filter(code=>!['layout-approximate','source-preserved'].includes(code)),['source-preserved']);
    },
    selectionAccidentalDisplay() {
      const modes=this.selectedNotes.map(event => !event.accidentalDisplay || !event.accidentalDisplay.force ? 'auto' : event.accidentalDisplay.enclosure || 'always');
      return modes.every(mode => mode === modes[0]) ? modes[0] || 'auto' : 'mixed';
    },
    basicNoteValues() { return ['whole','half','quarter','eighth','sixteenth']; },
    extraNoteValues() { return Object.keys(this.noteUnits).filter(value=>!this.basicNoteValues.includes(value)); },
    historyPosition() { return this.undoStack.length; },
    historyEntries() {
      const actions = this.undoStack.map(snapshot => snapshot.historyAction)
        .concat([this.historyAction],this.redoStack.slice().reverse().map(snapshot => snapshot.historyAction));
      return actions.map((action,index) => ({ index,action:action || { key:'WORKSHOP_HISTORY_CHANGE',values:{} },
        current:index === this.historyPosition,future:index > this.historyPosition }));
    },
    pieces() { return this.library.pieces.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    bars() { return this.draft.score.parts[0].measures; },
    hasSecondStaff() { return !!this.draft && this.draft.score.parts.length === 2; },
    secondStaffEnabled() { return this.hasSecondStaff && this.draft.score.parts[1].enabled !== false; },
    activeParts() { return this.draft ? this.draft.score.parts.map((part,index) => ({ part,index })).filter(staff => staff.part.enabled !== false) : []; },
    currentPart() { return this.draft && this.draft.score.parts[this.partIndex]; },
    currentBar() { return this.currentPart && this.currentPart.measures[this.barIndex]; },
    staffContexts() { return this.draft ? this.draft.score.parts.map((part,index) => workshopMeasureContext(this.draft.score,this.barIndex,index)) : []; },
    previousStaffKeys() { return this.draft ? this.draft.score.parts.map((part,index) => {
      const previous = this.barIndex > 0 ? workshopMeasureContextAtSlot(this.draft.score,this.barIndex-1,Infinity,index).keyId : null;
      return previous !== this.staffContexts[index].keyId ? previous : null;
    }) : []; },
    editorSpacing() {
      if (!this.draft) return null;
      const raw=this.activeParts.map(staff => {
        const context=this.staffContexts[staff.index];
        return workshopStaffRawNotation({measure:this.editorBars[staff.index],clef:context.clef,meter:context.meter,keyId:context.keyId,
          previousKeyId:this.previousStaffKeys[staff.index],staffIndex:staff.index,companionMeasure:this.secondStaffEnabled ? this.editorBars[staff.index === 0 ? 1 : 0] : null,
          noteValue:this.tool.noteValue,dots:this.toolDots,voice:this.toolVoice,readOnly:false,compact:false});
      });
      return spaceWorkshopAccidentalsTogether(raw,raw.map(notation => ({gridStep:notation.gridStep})));
    },
    editorFrameWidth() {
      if (!this.editorSpacing) return null;
      return Math.max(...this.editorSpacing.notations.map(notation => this.editorSpacing.width+notation.headerOffset));
    },
    editorBars() { return this.draft ? this.draft.score.parts.map((part,index) => withWorkshopRestProvenance(resolveWorkshopMeasure(this.draft.score,this.barIndex,index),{legacy:!this.draft.score.musicXml})) : []; },
    editorLyricVerseNumbers() { return this.draft ? this.draft.score.parts.map(part=>{
      const numbers=new Set();
      part.measures.forEach(bar=>bar.events.forEach(event=>{
        if(event.lyrics)event.lyrics.forEach(verse=>numbers.add(verse.number));
        else if(event.lyric)numbers.add('1');
      }));
      return Array.from(numbers).sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true}));
    }) : []; },
    currentContext() { return this.staffContexts[this.partIndex] || { meter:'4/4',clef:'treble',keyId:'C-major',dynamic:'mf',units:8 }; },
    editorBar() { return this.editorBars[this.partIndex] || null; },
    keyboardGridStep() { return workshopMeasureGridStep(this.editorBar,{noteValue:this.tool.noteValue,dots:this.toolDots}); },
    keyboardLastBeat() { return 1 + Math.max(0,this.currentContext.units - this.keyboardGridStep) / 2; },
    contextPickerTitle() { return this.$t(this.contextPicker === 'key' ? 'WORKSHOP_BAR_KEY_TITLE' : this.contextPicker === 'clef' ? 'WORKSHOP_CLEF_TITLE' : 'WORKSHOP_METER_TITLE',{ number:this.barIndex + 1 }); },
    hasContextOverride() { return ['clef','meter','key'].includes(this.contextPicker) && (Object.prototype.hasOwnProperty.call(this.currentBar,this.contextPicker === 'key' ? 'keyId' : this.contextPicker)
      || this.contextPicker === 'key' && this.barIndex === 0 && this.keyStaffOnly && Object.prototype.hasOwnProperty.call(this.currentPart,'keyId')); },
    currentPiece() { return this.draft && this.library.pieces.find(piece => piece.id === this.draft.pieceId); },
    dirty() { return !!this.draft && (this.draftDirty || this.tempoInput !== null && this.tempoInput !== String(this.draft.score.bpm)); },
    hasNotes() { return this.activeParts.some(staff => staff.part.measures.some(bar => bar.events.some(event => event.kind === "note"))); },
    hasCurrentBarNotes() { return this.activeParts.some(staff => staff.part.measures[this.barIndex].events.some(event => event.kind === "note")); },
    remainingBars() { return WORKSHOP_MAX_SCORE_MEASURES - this.bars.length; },
    selectedEventIndex() {
      const id = this.selectedEventId || (this.selectedEventIds.length === 1 ? this.selectedEventIds[0] : null);
      return this.draft ? this.currentBar.events.findIndex(event => event.id === id) : -1;
    },
    selectedEvent() { return this.draft ? this.currentBar.events[this.selectedEventIndex] || null : null; },
    selectedEvents() {
      if (!this.draft) return [];
      return this.selectedEvent ? [this.selectedEvent] : this.currentBar.events.filter(event => this.selectedEventIds.includes(event.id));
    },
    selectedNotes() { return this.selectedEvents.filter(event => event.kind === 'note'); },
    selectedAnchor() { return this.selectedEvents.find(event => event.id === this.selectedAnchorId) || this.selectedEvent; },
    hasSelection() { return this.selectedEvents.length > 0; },
    groupSelected() { return this.selectedEvents.length > 1 && !this.selectedEventId; },
    chordSelected() {
      if (!this.groupSelected || this.selectedNotes.length !== this.selectedEvents.length) return false;
      const selected = workshopMeasureEvents(this.currentBar).filter(event => this.selectedEventIds.includes(event.id));
      return new Set(selected.map(event => event.startSlot)).size === 1;
    },
    selectionChord() { return this.chordSelected ? recognizeWorkshopChord(this.selectedNotes) : null; },
    selectionTitle() {
      if (!this.hasSelection) return '';
      if (!this.groupSelected) return this.eventLabel(this.selectedEvent);
      if (!this.chordSelected) return this.$t('WORKSHOP_CHORD_COUNT',{ count:this.selectedNotes.length });
      return this.selectionChord && this.selectionChord.recognized ? this.chordLabel(this.selectionChord) : this.$t('WORKSHOP_CHORD_UNKNOWN');
    },
    selectionToneNames() {
      const values = this.selectedNotes.map(event => workshopPitchValue(event.pitch)).sort((a,b) => a-b);
      return Array.from(new Set(values.map(value => value % 12))).map(value => this.chordPitchLabel(value));
    },
    selectionAlternatives() {
      return this.selectionChord && this.selectionChord.recognized
        ? Array.from(new Set(this.selectionChord.alternatives.map(chord => this.chordLabel(chord)))).filter(label => label !== this.selectionTitle).slice(0,2) : [];
    },
    selectionAlter() { const alters = this.selectedNotes.map(event => event.pitch.alter); return new Set(alters).size === 1 ? alters[0] : null; },
    canConnectSelection() { return !!this.draft && canJoinWorkshopNotes(this.editorBar,this.selectedNotes.map(event => event.id)); },
    canUnlinkSelection() { return this.selectedNotes.some(event => !!event.beamGroupId); },
    selectionVoice() {
      const voices = this.selectedEvents.map(workshopEventVoice);
      return !this.hasSelection ? this.toolVoice : new Set(voices).size === 1 ? voices[0] : null;
    },
    canTripletSelection() { return !!this.draft && canMakeWorkshopTriplet(this.editorBar,this.selectedEvents.map(event => event.id)); },
    hasSelectedTriplets() { return this.selectedEvents.some(event => event.tuplet === 3); },
    directionSpans() { return this.draft ? this.draft.score.parts.map((part,index)=>workshopMeasureDirectionSpans(this.draft.score,index,this.barIndex)) : []; },
    staffSlurs() { return this.draft ? this.draft.score.parts.map((part,index) => workshopMeasureSlurs(this.draft.score,index,this.barIndex).map(edge=>Object.assign({},edge,{sourcePartIndex:index}))) : []; },
    staffGlissandos() { return this.draft ? this.draft.score.parts.map((part,index)=>workshopMeasureGlissandos(this.draft.score,index,this.barIndex)) : []; },
    staffTremolos() { return this.draft ? this.draft.score.parts.map((part,index)=>workshopMeasureTremolos(this.draft.score,index,this.barIndex)) : []; },
    canSlurSelection() {
      return this.selectedNotes.length === this.selectedEvents.length && (this.selectedNotes.length === 1
        || this.selectedNotes.length === 2 && !!connectWorkshopSlur(this.draft.score,this.selectedNotes.map(event => event.id)));
    },
    hasSelectedSlurs() {
      const ids = this.selectedNotes.map(event => event.id);
      return !!this.draft && (this.draft.score.slurs || []).some(edge => ids.includes(edge.fromId) || ids.includes(edge.toId));
    },
    selectedFingering() { const entries=this.selectedNotes.length === 1 ? workshopFingerings(this.selectedNotes[0]) : []; return entries.length === 1 && /^[1-5]$/.test(entries[0].value) && !entries[0].substitution && !entries[0].alternate && !entries[0].placement ? Number(entries[0].value) : ''; },
    selectedPedal() { return this.selectedEvents.length === 1 ? this.selectedEvents[0].pedal || '' : ''; },
    pickupMinimumBeats() { return 1/(WORKSHOP_TICKS_PER_UNIT*2); },
    pickupMaximumBeats() { return (workshopMeterUnits(workshopMeasureContext(this.draft.score,0).meter)-1/WORKSHOP_TICKS_PER_UNIT)/2; },
    pickupChoices() {
      if (!this.draft) return [];
      const limit = workshopMeterUnits(workshopMeasureContext(this.draft.score,0).meter);
      const choices = Array.from({ length:limit*2-1 },(_,index) => (index+1)/2);
      if (this.draft.score.pickupUnits && !choices.includes(this.draft.score.pickupUnits)) choices.push(this.draft.score.pickupUnits);
      return choices.sort((a,b) => a-b);
    },
    staffTies() { return this.draft ? this.draft.score.parts.map((part,index) => workshopMeasureTies(this.draft.score,index,this.barIndex)) : []; },
    tieAnchorEntry() {
      if (!this.draft || !this.tieAnchorId) return null;
      for (let partIndex = 0; partIndex < this.draft.score.parts.length; partIndex++) {
        const measures = this.draft.score.parts[partIndex].measures;
        for (let barIndex = 0; barIndex < measures.length; barIndex++) {
          const event = measures[barIndex].events.find(event => event.id === this.tieAnchorId);
          if (event) return { event,partIndex,barIndex };
        }
      }
      return null;
    },
    canTieSelection() {
      if (!this.selectedNotes.length || this.selectedNotes.length !== this.selectedEvents.length) return false;
      return this.selectedNotes.length === 1 || !!connectWorkshopTies(this.draft.score,this.selectedNotes.map(event => event.id));
    },
    hasSelectedTies() {
      const ids = this.selectedNotes.map(event => event.id);
      return !!this.draft && (this.draft.score.ties || []).some(edge => ids.includes(edge.fromId) || ids.includes(edge.toId));
    },
    activeDots() {
      const dots = this.selectedEvents.map(workshopRequestedDots);
      return !this.hasSelection ? this.toolDots : new Set(dots).size === 1 ? dots[0] : null;
    },
    canDotSelection() {
      return true;
    },
    activeNoteValue() {
      if (!this.hasSelection) return this.tool.noteValue;
      const values = this.selectedEvents.map(event => event.noteValue);
      return new Set(values).size === 1 ? values[0] : null;
    },
    freeSlots() { return this.currentContext.units*2 - workshopOccupiedSlots({ events:this.currentBar.events.filter(event => workshopEventVoice(event) === this.toolVoice) })*2; },
    noteNaming() { return normalizeNoteNaming(Options.noteNaming, this.$i18n.locale); }
  },
  // Keep draft dependencies out of the animation's render watcher. Synchronous
  // updates also preserve the unsaved-changes check before immediate navigation.
  watch: {
    draft:{deep:true,sync:true,handler:'updateDraftDirty'},
    baseline:{sync:true,handler:'updateDraftDirty'},
    contextPicker:'updateContextFocus',
    barIndex:'resetKeyboardPosition',
    partIndex:'resetKeyboardPosition'
  },
  created() { this.player = createPianoSamplePlayer({ maxVoices:128,allowFractionalPitch:true }); this.playback = null; this.initializeLibrary(); },
  mounted() {
    this.midiStatusDisposed=false;
    this.refreshMidiStatus();
    // Observe the shared interface without opening another permission request
    // or listening to piano notes while the user browses their pieces.
    this.midiStatusTimer=setInterval(()=>{if(!document.hidden)this.refreshMidiStatus();},MIDI_CONNECTION_CHECK_INTERVAL_MS);
    window.addEventListener("focus",this.refreshMidiStatus);
    document.addEventListener("resume",this.refreshMidiStatus);
    this.unsubscribeAudioSync = watchAudioTimingChanges(() => { if (this.playing || this.audioStarting || this.playbackPaused) this.stopPlayback(); });
    this.onVisibility = () => { if (document.hidden) { if(this.$refs.practice)this.$refs.practice.pause(); this.flushPracticeStatistics(); this.stopLibraryPlayback(); if (this.listeningView && this.playing) this.pausePlayback(); else if (this.playing || this.audioStarting) this.stopPlayback(); this.cancelSheetGesture(); } else this.refreshMidiStatus(); };
    this.onUnload = event => { if(this.$refs.practice)this.$refs.practice.pause(); this.flushPracticeStatistics(); if (this.dirty) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("beforeunload", this.onUnload);
  },
  updated() {
    // Vue removes its null-bound shell attributes on error renders. Keep the
    // guard's background lock without changing its original restore snapshot.
    if (this.contextPicker && this._contextFocusGuard && this.$refs.shell) {
      this.$refs.shell.setAttribute('inert','');
      this.$refs.shell.setAttribute('aria-hidden','true');
    }
  },
  beforeDestroy() {
    this.releaseContextFocus();
    this.cancelEditorPan();
    if(this.$refs.practice)this.$refs.practice.pause();
    this.flushPracticeStatistics();
    this.midiStatusDisposed=true;
    clearInterval(this.midiStatusTimer);
    window.removeEventListener("focus",this.refreshMidiStatus);
    document.removeEventListener("resume",this.refreshMidiStatus);
    if (this.unsubscribeAudioSync) this.unsubscribeAudioSync();
    if (this.libraryPlayback) this.libraryPlayback.dispose();
    this.stopPlayback();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("beforeunload", this.onUnload);
  },
  methods: {
    pieceExpanded(piece) {return !!this.expandedPieces[piece.id];},
    togglePieceExpanded(piece) {
      if(this.xmlBusy || !piece || !this.pieces.some(item=>item.id === piece.id)) return false;
      const expanded=this.pieceExpanded(piece);
      if(expanded && this.libraryAudio.pieceId === piece.id) this.stopLibraryPlayback();
      this.$set(this.expandedPieces,piece.id,!expanded);return true;
    },
    loadPracticeStatistics() {
      this.practiceStatsInitialized=true;
      return loadWorkshopPracticePersistence();
    },
    retryPracticeStatistics() {if (!this.practiceStatsLoaded && !this.loadPracticeStatistics()) return false;return this.flushPracticeStatistics();},
    practiceStatisticsFor(piece) {return workshopPracticeStatisticsFor(this.practiceStatistics,piece.id);},
    practiceProgressFor(piece) {
      if (!this._practiceNoteKeysCache) this._practiceNoteKeysCache=new Map();
      const cached=this._practiceNoteKeysCache.get(piece.id);
      let keys;
      if (cached && cached.revision === piece.currentRevisionId) keys=cached.keys;
      else {
        keys=createWorkshopPracticePlan(this.pieceScore(piece),{hands:{left:true,right:true}}).totalNoteKeys;
        this._practiceNoteKeysCache.set(piece.id,{revision:piece.currentRevisionId,keys});
      }
      return workshopPracticeProgress(this.practiceStatisticsFor(piece),keys);
    },
    recordPracticeAssessment(assessment) {
      if (!this.practiceSession || !this.practiceStatsLoaded) return false;
      if (!captureWorkshopPracticeAssessment(this.practiceSession.pieceId,assessment)) return false;
      // Batch rapid MIDI chords without serializing the music library.
      if (!this.practiceStatsTimer) this.practiceStatsTimer=setTimeout(()=>this.flushPracticeStatistics(),750);
      return true;
    },
    flushPracticeStatistics() {
      clearTimeout(this.practiceStatsTimer);this.practiceStatsTimer=null;
      return flushWorkshopPracticePersistence();
    },
    refreshMidiStatus() {
      if(this.midiStatusDisposed) return;
      this.midiConnected=connectedMidiInputs(WebMidi).length > 0;
    },
    startPractice(piece) {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete || this.practiceSession || !piece) return false;
      const saved=this.pieces.find(item=>item.id === piece.id);if (!saved) return false;
      this.stopLibraryPlayback();this.stopPlayback();this.xmlMessage=null;this.xmlError=null;this.xmlWarnings=[];
      this.practiceSession={pieceId:saved.id,title:saved.title,score:cloneWorkshop(this.pieceScore(saved)),hands:Object.assign({},this.practiceHandsFor(saved)),showLicense:isWorkshopDemoPiece(saved,'la-candeur-op-100-no-1')};
      window.scrollTo(0,0);return true;
    },
    closePractice() {if(this.$refs.practice)this.$refs.practice.pause();this.flushPracticeStatistics();this.infoPiece=null;this.practiceSession=null;},
    openLibraryInfo(piece) {
      if(this.xmlBusy || this.draft || this.practiceSession || this.pieceDetailsDraft || this.pieceToDelete || !piece)return false;
      const saved=this.pieces.find(item=>item.id===piece.id);if(!saved)return false;
      this.stopLibraryPlayback();
      this.infoPiece={title:saved.title,score:this.pieceScore(saved),showLicense:isWorkshopDemoPiece(saved,'la-candeur-op-100-no-1'),timeline:null};return true;
    },
    openPracticeInfo() {
      if (!this.practiceSession) return;
      if(this.$refs.practice) this.$refs.practice.pause();
      this.infoPiece={title:this.practiceSession.title,score:this.practiceSession.score,showLicense:this.practiceSession.showLicense,timeline:this.$refs.practice ? this.$refs.practice.plan.timeline : null};
    },
    openPreviewInfo() {
      if (!this.draft) return;
      if(this.playing) this.pausePlayback();
      this.infoPiece={title:this.draft.title,score:this.draft.score,timeline:this.playbackTimeline,showLicense:isWorkshopDemoPiece(this.currentPiece,'la-candeur-op-100-no-1')};
    },
    updateDraftDirty() {this.draftDirty=!!this.draft && JSON.stringify(this.draft)!==this.baseline;},
    xmlWarningKey(code) {
      const midi=['notation-inferred','quantized-timing','instruments-ignored','percussion-ignored','performance-controls-ignored','incomplete-notes','voices-merged'];
      if (midi.includes(code)) return 'WORKSHOP_MIDI_WARNING_'+code.toUpperCase().replace(/-/g,'_');
      const known=['unsupported-notation','extra-parts','unsupported-rhythm','layout-approximate','source-preserved','edited-source-preserved','archive-assets-preserved'];
      return 'WORKSHOP_XML_WARNING_'+(known.includes(code) ? code : 'unsupported-notation').toUpperCase().replace(/-/g,'_');
    },
    importSymbolName(item) {
      const names=this.$t('WORKSHOP_XML_ELEMENT_NAMES');
      return names && typeof names==='object' && Object.prototype.hasOwnProperty.call(names,item.element) ? names[item.element] : this.$t('WORKSHOP_IMPORT_UNKNOWN_SYMBOL');
    },
    focusImportNotice() {
      if(this.importNotice && !this._isDestroyed && this.$refs.importNoticeClose) this.$refs.importNoticeClose.focus();
    },
    closeImportNotice() {
      if(!this.importNotice) return false;
      this.importNotice=false;this.importNoteCounts=null;this.importUnsupportedElements=[];this.xmlMessage=null;this.xmlWarnings=[];
      this.$nextTick(()=>{if(!this._isDestroyed && !this.importNotice && this.draft && this.$refs.editorSave)this.$refs.editorSave.focus();});
      return true;
    },
    importErrorKey(error,kind) {
      const code=error.code || error.message;
      if (code === 'musicxml-too-large' || code === 'midi-too-large') return 'WORKSHOP_XML_TOO_LARGE';
      if (code === 'unsupported-music-file') return 'WORKSHOP_MUSIC_IMPORT_ERROR';
      if (kind !== 'midi') return 'WORKSHOP_XML_IMPORT_ERROR';
      const known=['unsupported-midi-format','unsupported-midi-timing','unsupported-midi-score','empty-midi'];
      return known.includes(code) ? 'WORKSHOP_MIDI_ERROR_'+code.toUpperCase().replace(/-/g,'_') : 'WORKSHOP_MIDI_IMPORT_ERROR';
    },
    async chooseImportFile() {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete) return;
      this.stopLibraryPlayback();
      if (window.cordova) return this.runMusicImport(()=>readWorkshopMusicFile());
      const input=this.$refs.musicFile; if (input) input.click();
    },
    async importMusicFile(event) {
      const file=event.target.files && event.target.files[0]; event.target.value='';
      if (file) return this.runMusicImport(()=>readWorkshopMusicFile(file));
    },
    async loadMusicXml(file) { return this.runMusicImport(()=>file,'musicxml'); },
    async loadMidi(file) { return this.runMusicImport(()=>file,'midi'); },
    async runMusicImport(readFile,kind) {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete) return false;
      this.stopLibraryPlayback();
      this.xmlBusy=true;this.xmlMessage=null;this.xmlError=null;this.xmlWarnings=[];this.importNoteCounts=null;this.importUnsupportedElements=[];this.importNotice=false;this.libraryNotice=null;
      try {
        const file=await readFile(); if (!file) return false;
        if (!kind) kind=workshopMusicFileKind(file);
        if (!kind) throw new Error('unsupported-music-file');
        const result=await (kind === 'midi' ? importWorkshopMidi(file.data,{filename:file.filename}) : importWorkshopMusicXml(file.data,{filename:file.filename}));
        if (!isValidWorkshopScore(result.score)) throw new Error('invalid-score');
        const draft=createWorkshopDraft((result.title || this.$t('WORKSHOP_UNTITLED')).slice(0,80)); draft.score=result.score;
        this.editorColorIndex=0;this.draft=draft;this.baseline='';this.selectedRevisionId=null;this.resetEditor();
        this.midiImportAvailable=kind === 'midi';this._midiOriginalScore=this.midiImportAvailable ? cloneWorkshop(result.score) : null;
        this.importNoteCounts=result.noteCounts || null;
        this.importUnsupportedElements=result.unsupportedElements || [];
        this.xmlWarnings=Array.from(new Set(result.warnings || []));this.xmlMessage=kind === 'midi' ? 'WORKSHOP_MIDI_IMPORTED' : 'WORKSHOP_XML_IMPORTED';
        this.importNotice=true;this.$nextTick(()=>this.focusImportNotice());
        return true;
      } catch (error) { this.xmlError=this.importErrorKey(error,kind);return false; }
      finally { this.xmlBusy=false; }
    },
    async exportMusicXml(compressed) {
      if (!this.draft || this.xmlBusy) return; this.commitTempoEdit();this.commitTitleEdit(); this.cancelSheetGesture(); this.stopPlayback(); this.xmlBusy=true; this.xmlError=null; this.xmlMessage=null;
      try { const result=await exportWorkshopMusicXml(cloneWorkshop(this.draft.score),{title:this.draft.title,compressed});
        this.xmlWarnings=Array.from(new Set(result.warnings || [])); const saved=await saveWorkshopMusicFile(result,this.draft.title); if (saved) this.xmlMessage='WORKSHOP_XML_EXPORTED';
      } catch (error) { this.xmlError='WORKSHOP_XML_EXPORT_ERROR'; } finally { this.xmlBusy=false; }
    },
    async exportLibraryPiece(piece) {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete || !piece) return false;
      const saved=this.pieces.find(item=>item.id === piece.id); if (!saved) return false;
      this.stopLibraryPlayback();this.stopPlayback();
      this.xmlBusy=true;this.xmlError=null;this.xmlMessage=null;this.xmlWarnings=[];
      try {
        const result=await exportWorkshopMusicXml(cloneWorkshop(this.pieceScore(saved)),{title:saved.title,compressed:false});
        this.xmlWarnings=Array.from(new Set(result.warnings || []));
        if (!await saveWorkshopMusicFile(result,saved.title)) return false;
        this.xmlMessage='WORKSHOP_XML_EXPORTED';return true;
      } catch (error) { this.xmlError='WORKSHOP_XML_EXPORT_ERROR';return false; }
      finally { this.xmlBusy=false; }
    },
    editInbarContext(staff,id) {
      this.partIndex=staff;
      if (this.$refs.barSettings) this.$refs.barSettings.open = true;
      this.$nextTick(() => { if (this.$refs.contextChanges) { this.$refs.contextChanges.editChange(id); this.$refs.contextChanges.$el.scrollIntoView({block:'nearest',behavior:'smooth'}); } });
    },
    changeAccidentalDisplay(mode) {
      if (!['auto','always','parentheses','bracket'].includes(mode) || !this.selectedNotes.length) return;
      const score=cloneWorkshop(this.draft.score),ids=new Set(this.selectedNotes.map(event => event.id));
      score.parts.forEach(part => part.measures[this.barIndex].events.forEach(event => {
        if (!ids.has(event.id)) return;
        const display=Object.assign({},event.accidentalDisplay,{force:mode !== 'auto'});
        delete display.enclosure;
        if (['parentheses','bracket'].includes(mode)) display.enclosure=mode;
        if (mode === 'auto' && !display.cautionary && !display.editorial) delete event.accidentalDisplay;
        else event.accidentalDisplay=display;
      }));
      this.commitAdvancedNotation(score);
    },
    hasAccidentalFlag(flag) { return this.selectedNotes.length > 0 && this.selectedNotes.every(event => !!(event.accidentalDisplay && event.accidentalDisplay[flag])); },
    toggleAccidentalFlag(flag) {
      if (!['cautionary','editorial'].includes(flag) || !this.selectedNotes.length) return;
      const remove=this.hasAccidentalFlag(flag),score=cloneWorkshop(this.draft.score),ids=new Set(this.selectedNotes.map(event=>event.id));
      score.parts.forEach(part=>part.measures[this.barIndex].events.forEach(event=>{
        if (!ids.has(event.id)) return;
        const display=Object.assign({force:true},event.accidentalDisplay);
        if (remove) delete display[flag]; else display[flag]=true;
        if (!display.force && !display.enclosure && !display.cautionary && !display.editorial) delete event.accidentalDisplay;
        else event.accidentalDisplay=display;
      }));
      this.commitAdvancedNotation(score);
    },
    commitAdvancedNotation(score) {
      return this.commitScoreEdit(score,{key:'WORKSHOP_HISTORY_NOTATION',values:{bar:this.barIndex+1}});
    },
    commitScoreEdit(score,action) {
      const candidate=validateWorkshopEditCandidate(score);
      if (!candidate.score) { this.notationError=candidate.error === 'pitch-range' ? 'WORKSHOP_SOUNDING_PITCH_BLOCKED' : 'WORKSHOP_ADVANCED_BLOCKED'; return false; }
      const originalBpm=this.draft.score.bpm,originalTitle=this.draft.score.metadata && this.draft.score.metadata.title;
      this.change(()=>{
        if(candidate.score.bpm === originalBpm)candidate.score.bpm=this.draft.score.bpm;
        if(candidate.score.metadata && candidate.score.metadata.title === originalTitle && this.draft.score.metadata && typeof this.draft.score.metadata.title === 'string')
          candidate.score.metadata.title=this.draft.score.metadata.title;
        this.draft.score=candidate.score;
      },action);
      this.notationError=null; return true;
    },
    units: workshopMeasureUnits,
    numberLabel(value) { return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toLocaleString(this.$i18n.locale); },
    setEditorZoom(value) {
      if (!Number.isFinite(value)) return;
      this.cancelSheetGesture();this.cancelEditorPan();
      this.editorZoom=Math.max(.75,Math.min(2,value));
    },
    setEditorPanning(value) { this.cancelSheetGesture();this.cancelEditorPan();this.editorPanning=!!value; },
    startEditorPan(event) {
      // Touch uses native scrolling. Mouse dragging needs a separate pan gesture
      // so navigating an enlarged score never places or moves a musical note.
      if (!this.editorPanning || event.pointerType === 'touch' || event.isPrimary === false || event.button !== 0) return;
      const viewport=this.$refs.editorViewport && this.$refs.editorViewport.viewportElement();
      if (!viewport) return;
      this.editorPanGesture={id:event.pointerId,x:event.clientX,left:viewport.scrollLeft};
      this._editorPanTarget=event.currentTarget;
      this._editorPanTarget.setPointerCapture(event.pointerId);
      if(event.cancelable)event.preventDefault();
    },
    moveEditorPan(event) {
      const gesture=this.editorPanGesture,viewport=this.$refs.editorViewport && this.$refs.editorViewport.viewportElement();
      if (!gesture || gesture.id !== event.pointerId || !viewport) return;
      viewport.scrollLeft=gesture.left-event.clientX+gesture.x;
    },
    cancelEditorPan() {
      const gesture=this.editorPanGesture,target=this._editorPanTarget;
      this.editorPanGesture=null;this._editorPanTarget=null;
      if(gesture && target && target.hasPointerCapture(gesture.id))target.releasePointerCapture(gesture.id);
    },
    setSheetView(value) { this.setEditorPanning(false);this.stopPlayback(); this.clearSelection(); this.sheetView = value; this.notationError = null; },
    openSheetBar(index) { this.setSheetView(false); this.selectBar(index); },
    applyBarKey(keyId) {
      if (!this.draft) return false;
      let score;
      if (this.keyStaffOnly && this.hasSecondStaff) {
        score=this.barIndex === 0 ? setWorkshopPartKey(this.draft.score,keyId,this.partIndex)
          : setWorkshopMeasureContext(this.draft.score,this.barIndex,{keyId},this.partIndex,{partOnly:true});
        if(score && this.barIndex === 0 && Object.prototype.hasOwnProperty.call(score.parts[this.partIndex].measures[0],'keyId'))
          score=setWorkshopMeasureContext(score,0,{keyId:null},this.partIndex,{partOnly:true});
      } else if (this.barIndex === 0 && keyId !== null) {
        score = setWorkshopKey(this.draft.score,keyId);
        if (score && score.parts.some(part => Object.prototype.hasOwnProperty.call(part.measures[0],'keyId')))
          score = setWorkshopMeasureContext(score,0,{ keyId:null });
      } else score = setWorkshopMeasureContext(this.draft.score,this.barIndex,{ keyId });
      if (!score) return false;
      if (JSON.stringify(score) === JSON.stringify(this.draft.score)) return false;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_BAR_KEY',values:{ bar:this.barIndex+1,keyId:workshopMeasureContext(score,this.barIndex,this.partIndex).keyId } })) return false;
      this.clearSelection(); this.followKeySignature = true; this.placementError = null; return true;
    },
    setDynamic(value) {
      if (value !== null && !this.dynamics.includes(value)) return false;
      const score = setWorkshopMeasureContext(this.draft.score,this.barIndex,{ dynamic:value },this.partIndex);
      if (!score || JSON.stringify(score) === JSON.stringify(this.draft.score)) return false;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_DYNAMIC',values:{ bar:this.barIndex+1,dynamic:workshopMeasureContext(score,this.barIndex,this.partIndex).dynamic } })) return false;
      this.notationError = null; return true;
    },
    setPickup(value) {
      const units = value === '' ? null : Number(value);
      const score = setWorkshopPickup(this.draft.score,units);
      if (!score) { this.notationError = 'WORKSHOP_PICKUP_BLOCKED'; return false; }
      if (JSON.stringify(score) === JSON.stringify(this.draft.score)) return true;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_PICKUP',values:{} })) return false;
      this.clearSelection(); this.notationError = null; return true;
    },
    setPickupBeats(event) {
      const value=event.target.value.trim();
      const changed=this.setPickup(value === '' ? '' : Number(value)*2);
      if (!changed) event.target.value=this.draft.score.pickupUnits === undefined ? '' : String(this.draft.score.pickupUnits/2);
      return changed;
    },
    setRepeat(start,end) {
      const score = setWorkshopMeasureRepeat(this.draft.score,this.barIndex,!!start,end === '' || end === null ? null : Number(end));
      if (!score) { this.notationError = 'WORKSHOP_REPEAT_BLOCKED'; return false; }
      if (JSON.stringify(score) === JSON.stringify(this.draft.score)) return true;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_REPEAT',values:{ bar:this.barIndex+1 } })) return false;
      this.notationError = null; return true;
    },
    chooseVoice(voice) {
      if (![1,2,3,4].includes(voice)) return;
      this.cancelTieSelection(); this.cancelSheetGesture();
      if (!this.hasSelection) { this.toolVoice = voice; this.placementError = null; return; }
      this.updateSelectedEvents(event => {
        if (voice === 1) delete event.voice; else event.voice = voice;
        return event;
      },{ key:'WORKSHOP_HISTORY_VOICE',values:{ voice,bar:this.barIndex+1 } });
    },
    commitEventEdit(events,action) {
      const candidate=validateWorkshopEventEdit(this.draft.score,this.barIndex,this.partIndex,events);
      if (!candidate.score) {
        this.placementError=candidate.error === 'pitch-range' ? 'WORKSHOP_SOUNDING_PITCH_BLOCKED' : 'WORKSHOP_PLACEMENT_BLOCKED';
        return false;
      }
      // change() commits focused title/tempo inputs first. Adopt only the checked
      // events, so those newly committed document fields cannot be overwritten
      // by the earlier validation snapshot. change() repairs relationships.
      this.change(()=>{this.currentBar.events=candidate.score.parts[this.partIndex].measures[this.barIndex].events;},action);
      this.placementError=null;
      return true;
    },
    updateSelectedEvents(update,action,notesOnly = false) {
      const selected = notesOnly ? this.selectedNotes : this.selectedEvents;
      if (!selected.length) return false;
      const ids = selected.map(event => event.id),group = this.groupSelected || this.multiSelect;
      const selectionIds=this.selectedEvents.map(event=>event.id);
      const anchorId = this.selectedAnchorId,singleId = this.selectedEventId;
      const updates = workshopMeasureEvents(this.currentBar).filter(event => ids.includes(event.id)).map(event => update(cloneWorkshop(event)));
      const events = replaceWorkshopEvents(this.editorBar,updates);
      if (!events) { this.placementError = 'WORKSHOP_PLACEMENT_BLOCKED'; return false; }
      if (!this.commitEventEdit(events,action)) return false;
      if (group) this.restoreSelection(selectionIds,anchorId); else this.selectEvent(events.find(event => event.id === singleId));
      this.placementError = null; return true;
    },
    hasArticulation(kind) { return !!this.selectedNotes.length && this.selectedNotes.every(event => (event.articulations || []).includes(kind)); },
    toggleArticulation(kind) {
      if (!this.articulationOptions.includes(kind) || !this.selectedNotes.length) return;
      const remove = this.hasArticulation(kind);
      this.updateSelectedEvents(event => {
        const detached = ['staccato','staccatissimo'];
        const values = (event.articulations || []).filter(value => value !== kind
          && (remove || !detached.includes(kind) || !detached.includes(value)));
        if (!remove) values.push(kind);
        if (values.length) event.articulations = values; else delete event.articulations;
        return event;
      },{ key:'WORKSHOP_HISTORY_ARTICULATION',values:{ bar:this.barIndex+1 } },true);
    },
    setFingering(value) {
      value=String(value);
      if (this.selectedNotes.length !== 1 || !['','1','2','3','4','5'].includes(value)) return false;
      if (value === '' && !workshopFingerings(this.selectedNotes[0]).length || !this.selectedNotes[0].fingerings && String(this.selectedNotes[0].fingering || '') === value) return false;
      return this.updateSelectedEvents(event => { delete event.fingerings; if (value === '') delete event.fingering; else event.fingering = Number(value); return event; },
        { key:'WORKSHOP_HISTORY_FINGERING',values:{ bar:this.barIndex+1 } },true);
    },
    setFingerings(entries) {
      if (this.selectedNotes.length !== 1 || !Array.isArray(entries) || entries.length && !isValidWorkshopFingerings(entries)) return false;
      if (JSON.stringify(workshopFingerings(this.selectedNotes[0])) === JSON.stringify(entries)) return false;
      return this.updateSelectedEvents(event => { delete event.fingering; if (entries.length) event.fingerings=cloneWorkshop(entries); else delete event.fingerings; return event; },
        { key:'WORKSHOP_HISTORY_FINGERING',values:{ bar:this.barIndex+1 } },true);
    },
    setPedal(value) {
      if (this.selectedEvents.length !== 1 || !['','down','up'].includes(value)) return;
      this.updateSelectedEvents(event => { if (value === '') delete event.pedal; else event.pedal = value; return event; },
        { key:'WORKSHOP_HISTORY_PEDAL',values:{ bar:this.barIndex+1 } });
    },
    connectTriplet() {
      if (!this.canTripletSelection) return;
      const ids = this.selectedEvents.map(event => event.id),anchorId = this.selectedAnchorId;
      const events = makeWorkshopTriplet(this.editorBar,ids);
      if (!events) { this.placementError = 'WORKSHOP_TRIPLET_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_TRIPLET',values:{ bar:this.barIndex+1 } })) return false;
      this.restoreSelection(ids,anchorId); this.placementError = null;
    },
    unlinkTriplets() {
      const ids = this.selectedEvents.map(event => event.id),anchorId = this.selectedAnchorId;
      const events = splitWorkshopTriplets(this.editorBar,ids);
      if (!events) { this.placementError = 'WORKSHOP_TRIPLET_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_TRIPLET_REMOVE',values:{ bar:this.barIndex+1 } })) return false;
      if (this.groupSelected || this.multiSelect) this.restoreSelection(ids,anchorId);
      else this.selectEvent(events.find(event => event.id === ids[0]));
      this.placementError = null;
    },
    durationLabel(value) { return this.$t(['whole','half','quarter','eighth','sixteenth','thirtysecond'].includes(value) ? `FLOW_RHYTHM_VALUE_${value.toUpperCase()}` : `WORKSHOP_VALUE_${value.toUpperCase()}`); },
    pitchLabel(value) { return formatDisplayNoteName(value, true, this.noteNaming); },
    eventLabel(event) {
      if (event.kind === 'rest') return this.$t('WORKSHOP_REST');
      const pitch = event.pitch;
      const natural = this.noteNaming === 'german' && pitch.step === 'B' ? 'H' : pitch.step;
      if (!Number.isInteger(pitch.alter)) return natural+this.alterSymbol(pitch.alter)+pitch.octave;
      const flatNames = { C:'Ces',D:'Des',E:'Es',F:'Fes',G:'Ges',A:'As',B:'B' };
      const sharpNames = { C:'Cis',D:'Dis',E:'Eis',F:'Fis',G:'Gis',A:'Ais',B:'His' };
      const name = this.noteNaming === 'german'
        ? pitch.alter === -2 ? (pitch.step === 'B' ? 'Heses' : flatNames[pitch.step]+(pitch.step === 'E' || pitch.step === 'A' ? 'es' : 'es')) : pitch.alter === 2 ? sharpNames[pitch.step]+'is' : pitch.alter < 0 ? flatNames[pitch.step] : pitch.alter > 0 ? sharpNames[pitch.step] : natural
        : pitch.step + (pitch.alter === -2 ? '𝄫' : pitch.alter === 2 ? '𝄪' : pitch.alter < 0 ? '♭' : pitch.alter > 0 ? '♯' : '');
      return name + pitch.octave;
    },
    keyLabel(id) {
      const key = getNoteFlowTonality(id);
      if (!key || key.id !== id) return '';
      return formatNoteFlowTonalityLabel(key,this.noteNaming) + ' ' + this.$t(key.mode === 'minor' ? 'FLOW_KEY_MINOR' : 'FLOW_KEY_MAJOR');
    },
    setKey(keyId) {
      if (!this.draft || keyId === this.draft.score.keyId) return false;
      const score = setWorkshopKey(this.draft.score,keyId);
      if (!score) return false;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_KEY',values:{ keyId } })) return false;
      this.clearSelection(); this.followKeySignature = true; this.placementError = null;
      return true;
    },
    chordPitchLabel(value) {
      const spelled = this.selectedNotes.find(event => workshopPitchValue(event.pitch) % 12 === value);
      return spelled ? this.eventLabel(spelled).slice(0,-String(spelled.pitch.octave).length)
        : formatDisplayNoteName(value,true,this.noteNaming);
    },
    chordLabel(chord) {
      const root = this.chordPitchLabel(chord.root);
      const symbol = chord.suffix === '' ? this.$t('WORKSHOP_CHORD_MAJOR',{ root })
        : chord.suffix === 'm' ? this.$t('WORKSHOP_CHORD_MINOR',{ root }) : root+chord.suffix;
      return chord.bass !== chord.root ? symbol+'/'+this.chordPitchLabel(chord.bass) : symbol;
    },
    clefLabel(clef) { return this.$t('WORKSHOP_CLEF_'+clef.toUpperCase()); },
    staffLabel(index) { return this.$t(index === 1 ? 'WORKSHOP_STAFF_LOWER' : 'WORKSHOP_STAFF_UPPER'); },
    selectPart(index) {
      if (!Number.isInteger(index) || !this.draft || !this.draft.score.parts[index]
        || this.draft.score.parts[index].enabled === false || index === this.partIndex) return;
      this.clearSelection(true); this.stopPlayback(); this.partIndex = index; this.placementError = null;
    },
    activateStaff(index,event) {
      const target=event && event.target,head=target && target.closest && target.closest('[data-source-staff]');
      const source=head ? Number(head.getAttribute('data-source-staff')) : index;
      this.selectPart(Number.isInteger(source) && this.draft.score.parts[source] ? source : index);
    },
    onStaffEvent(index,method,payload) {
      if (!this.activeParts.some(staff => staff.index === index)) return;
      const id=payload && (payload.anchorId || payload.id || payload.ids && payload.ids[0]);
      const owner=method !== 'placeOnSheet' && id ? this.draft.score.parts.findIndex(part=>part.measures[this.barIndex].events.some(event=>event.id === id)) : index;
      this.selectPart(owner >= 0 ? owner : index); this[method](payload);
    },
    toggleSecondStaff() {
      const enabled = !this.secondStaffEnabled;
      const score = setWorkshopSecondStaffEnabled(this.draft.score,enabled);
      if (!score) return;
      if (!this.commitScoreEdit(score,{ key:enabled ? 'WORKSHOP_HISTORY_SECOND_STAFF_ON' : 'WORKSHOP_HISTORY_SECOND_STAFF_OFF',values:{} })) return false;
      this.partIndex = enabled ? 1 : 0;
      this.clearSelection(); this.closeContextPicker(); this.placementError = null;
    },
    barSlots(index) { return workshopMeasureContext(this.draft.score,index).units*2; },
    barUsedSlots(index) { return Math.max(...this.activeParts.map(staff => workshopMeasureUnits(staff.part.measures[index])*2)); },
    pieceMeterLabel(piece) {
      const score = piece.revisions.find(revision => revision.id === piece.currentRevisionId).score;
      const meters = new Set([workshopMeasureContext(score,0).meter].concat(score.parts[0].measures.slice(1).map(bar => bar.meter).filter(Boolean)));
      return meters.size === 1 ? Array.from(meters)[0] : this.$t('WORKSHOP_METER_MIXED');
    },
    openContextPicker(kind,partIndex = this.partIndex) {
      if (!['clef','meter','key'].includes(kind)) return;
      const sheet=this.sheetInstances().find(staff=>staff.staffIndex === partIndex);
      const symbol=sheet && sheet.$el && sheet.$el.querySelector('[data-workshop-context="'+kind+'"]');
      this._contextReturnFocus=kind === 'key' ? this.$refs.barKeyButton : symbol;
      if (!this._contextReturnFocus && typeof document !== 'undefined') this._contextReturnFocus=document.activeElement;
      this.selectPart(partIndex); this.cancelTieSelection();
      this.cancelSheetGesture(); this.stopPlayback(); this.contextError = null; this.customMeter=this.currentContext.meter; this.contextPicker = kind;
    },
    closeContextPicker() { this.contextPicker = null; this.contextError = null; },
    releaseContextFocus() {
      if (this._contextFocusGuard) this._contextFocusGuard.release();
      this._contextFocusGuard=null;
    },
    updateContextFocus() {
      this.$nextTick(()=>{
        if (this._isDestroyed) return;
        this.releaseContextFocus();
        if (this.contextPicker && this.$refs.contextDialog && this.$refs.contextOverlay && typeof document !== 'undefined')
          this._contextFocusGuard=createModalFocusGuard(this.$refs.contextDialog,this.$refs.contextOverlay,document,this._contextReturnFocus);
      });
    },
    applyBarContext(value) {
      const kind = this.contextPicker;
      if (kind === 'key') { const changed = this.applyBarKey(value); this.closeContextPicker(); return changed; }
      if (!['clef','meter'].includes(kind)) return false;
      if (kind === 'meter' && value !== null) {
        const input=parseWorkshopMeterInput(value);
        if (input.reason) { this.contextError=input.reason === 'format' ? 'WORKSHOP_METER_FORMAT_ERROR' : 'WORKSHOP_METER_VALUE_ERROR'; return false; }
      }
      const score = setWorkshopMeasureContext(this.draft.score,this.barIndex,{ [kind]:value },this.partIndex);
      if (!score) { this.contextError = 'WORKSHOP_METER_BLOCKED'; return false; }
      if (JSON.stringify(score) !== JSON.stringify(this.draft.score)) {
        const context = workshopMeasureContext(score,this.barIndex,this.partIndex);
        if (!this.commitScoreEdit(score,{ key:kind === 'clef' ? 'WORKSHOP_HISTORY_CLEF' : 'WORKSHOP_HISTORY_METER',
          values:{ bar:this.barIndex + 1,clef:kind === 'clef' ? context.clef : undefined,meter:kind === 'meter' ? context.meter : undefined } })) return false;
        this.clearSelection(); this.placementError = null;
      }
      this.closeContextPicker(); return true;
    },
    libraryPieceActive(piece) { return this.libraryAudio.pieceId === piece.id && (this.libraryAudio.busy || this.libraryAudio.playing); },
    async toggleLibraryPiece(piece) {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete) return false;
      const saved=this.pieces.find(item=>item.id === piece.id);if (!saved) return false;
      this.stopPlayback();
      if (!this.libraryPlayback) this.libraryPlayback=createWorkshopLibraryPlayback({
        fallbackPlayer:this.player,
        onState:state=>{if (!this._isDestroyed) this.libraryAudio=state;}
      });
      return this.libraryPlayback.toggle(saved);
    },
    stopLibraryPlayback() { if (this.libraryPlayback) this.libraryPlayback.stop(); },
    practiceHandsFor(piece) { return this.practiceHands[piece.id] || {left:true,right:true}; },
    changePracticeHands(hands) {
      if(!this.practiceSession || !hands || typeof hands.left!=='boolean' || typeof hands.right!=='boolean' || !hands.left && !hands.right) return false;
      const next={left:hands.left,right:hands.right};
      this.$set(this.practiceHands,this.practiceSession.pieceId,next);
      this.practiceSession.hands=next;return true;
    },
    togglePracticeHand(piece,hand) {
      if (this.xmlBusy || !['left','right'].includes(hand) || !this.pieces.some(item=>item.id === piece.id)) return false;
      const current=this.practiceHandsFor(piece),next=Object.assign({},current,{[hand]:!current[hand]});
      if (!next.left && !next.right) return false;
      this.$set(this.practiceHands,piece.id,next);return true;
    },
    pieceScore(piece) {
      const score=piece.revisions.find(revision=>revision.id === piece.currentRevisionId).score;
      if (!this._tupletDisplayScores) this._tupletDisplayScores=new WeakMap();
      const cached=this._tupletDisplayScores.get(score);
      if (cached && cached.title === piece.title) return cached.score;
      const restored=restoreWorkshopTupletDisplay(score,piece.title);
      this._tupletDisplayScores.set(score,{title:piece.title,score:restored});
      return restored;
    },
    pieceComposer(piece) { const metadata=this.pieceScore(piece).metadata;return metadata && metadata.composer; },
    pieceBpm(piece) { return piece.revisions.find(revision => revision.id === piece.currentRevisionId).score.bpm; },
    pieceBarCount(piece) { return piece.revisions.find(revision => revision.id === piece.currentRevisionId).score.parts[0].measures.length; },
    openPieceDetails(piece) {
      if (this.xmlBusy || this.draft || this.pieceToDelete) return;
      this.stopLibraryPlayback();
      this.pieceDetailsDraft = openWorkshopPiece(piece);
      this.pieceDetailsError = null; this.libraryNotice = null;
    },
    requestPieceDeletion(piece) {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete || !piece || !this.pieces.some(saved=>saved.id === piece.id)) return false;
      this.stopLibraryPlayback();
      this.pieceToDelete={id:piece.id,title:piece.title};this.pieceDeleteError=null;this.libraryNotice=null;
      this.$nextTick(()=>{if(this.$refs.deleteCancel)this.$refs.deleteCancel.focus();});return true;
    },
    cycleDeletionFocus(event) {
      const button=event.target === this.$refs.deleteCancel ? this.$refs.deleteConfirm : this.$refs.deleteCancel;
      if(button)button.focus();
    },
    cancelPieceDeletion() {
      const id=this.pieceToDelete && this.pieceToDelete.id;this.pieceToDelete=null;this.pieceDeleteError=null;
      this.$nextTick(()=>{const ref=this.$refs['delete-'+id],button=Array.isArray(ref) ? ref[0] : ref;if(button)button.focus();});
    },
    confirmPieceDeletion() {
      if (!this.pieceToDelete || this.xmlBusy || this.draft) return false;
      try {
        const deletedId=this.pieceToDelete.id;
        const result=deleteStoredWorkshopPiece(deletedId);this.library=result.library;
        queueWorkshopPracticeDeletion(deletedId);
        if(this._practiceNoteKeysCache)this._practiceNoteKeysCache.delete(deletedId);
        this.flushPracticeStatistics();
        this.$delete(this.practiceHands,this.pieceToDelete.id);this.$delete(this.expandedPieces,this.pieceToDelete.id);
        this.pieceToDelete=null;this.pieceDeleteError=null;this.libraryNotice='WORKSHOP_PIECE_DELETED';return true;
      } catch (error) { this.pieceDeleteError='WORKSHOP_PIECE_DELETE_ERROR';return false; }
    },
    closePieceDetails() { this.pieceDetailsDraft = null; this.pieceDetailsError = null; },
    savePieceDetails(updatedDraft) {
      if (!this.pieceDetailsDraft || this.draft || updatedDraft.pieceId !== this.pieceDetailsDraft.pieceId) return false;
      try {
        const result = storeWorkshopPieceDetails(this.pieceDetailsDraft, updatedDraft);
        this.library = result.library; this.closePieceDetails();
        this.libraryNotice = 'WORKSHOP_SAVED'; return true;
      } catch (error) {
        this.pieceDetailsError = error.message === 'missing-piece' ? 'WORKSHOP_DETAILS_MISSING' : error.message === 'revision-limit' ? 'WORKSHOP_REVISION_LIMIT' : error.message === 'library-full' ? 'WORKSHOP_FULL' : 'WORKSHOP_SAVE_ERROR'; return false;
      }
    },
    loadLibrary() {
      this.stopLibraryPlayback();
      if (!this.practiceStatsInitialized) this.loadPracticeStatistics();
      try { this.library = readWorkshopLibrary(); this.loadError = false; return true; }
      catch (error) { this.loadError = true; return false; }
    },
    async initializeLibrary() {
      if (this.xmlBusy || this.draft || this.pieceDetailsDraft || this.pieceToDelete) return false;
      if (!this.loadLibrary()) return false;
      this.xmlBusy=true;this.libraryNotice=null;
      try {
        const result=await initializeWorkshopLibrary();this.library=result.library;
        if(result.warning)this.libraryNotice=result.warning === 'library-full' ? 'WORKSHOP_BUNDLED_INSTALL_FULL' : 'WORKSHOP_BUNDLED_INSTALL_ERROR';
        return !result.warning;
      } catch (error) {
        if(error.message === 'invalid-library')this.loadError=true;
        else this.libraryNotice='WORKSHOP_BUNDLED_INSTALL_ERROR';
        return false;
      } finally {this.xmlBusy=false;}
    },
    resetEditor() {
      this.midiImportAvailable=false;this.midiNotationSimplified=false;this._midiOriginalScore=null;
      this.setEditorPanning(false);
      this.editorCrossStaffBeamIds=[]; this.editorCrossStaffRelationIds=[]; this.barIndex = 0; this.partIndex = 0; this.copyTarget = this.bars.length > 1 ? 1 : 0; this.addBarCount = 1; this.clearSelection();
      this.multiSelect = false; this.selectionUnit = 'note'; this.sheetView = false; this.toolVoice = 1; this.notationError = null;
      this.keyStaffOnly=this.hasIndependentKeys();
      this.resetHistory(); this.tempoInput=null;this.revisionSelection=[];this.revisionDeleteIds=[];this.revisionDeleteError=null;this.savedNotice = false; this.saveError = null;
      this.confirmExit = false; this.playbackError = null; this.closeContextPicker();
      this.tool = { kind: "note", noteValue: "quarter", alter: 0 }; this.toolDots = 0; this.followKeySignature = true; this.placementError = null;
      this.resetKeyboardPosition(); this.keyboardInsertNotice=null; this.copyNotice=null;
      this.$nextTick(()=>{
        if (!this._isDestroyed && this.draft && !this.importNotice) window.scrollTo(0,0);
      });
    },
    newPiece() { if(this.xmlBusy || this.pieceToDelete)return; this.stopLibraryPlayback(); this.importNotice=false; this.importNoteCounts=null; this.importUnsupportedElements=[]; this.xmlWarnings=[]; this.xmlMessage=null; this.xmlError=null; this.editorColorIndex=0; this.draft = createWorkshopDraft(this.$t('WORKSHOP_UNTITLED')); this.baseline = "";
      this.selectedRevisionId = null; this.resetEditor(); },
    openPiece(piece) { if(this.xmlBusy || this.pieceToDelete)return; this.stopLibraryPlayback(); this.importNotice=false; this.importNoteCounts=null; this.importUnsupportedElements=[];
      // Keep the opening list color while saving can move this piece to another position.
      this.editorColorIndex=Math.max(0,this.pieces.findIndex(item=>item.id === piece.id)) % 5;
      this.draft = openWorkshopPiece(piece); this.draft.score=cloneWorkshop(this.pieceScore(piece)); this.xmlWarnings=[]; this.xmlMessage=null; this.xmlError=null; this.baseline = JSON.stringify(this.draft);
      this.selectedRevisionId = piece.currentRevisionId; this.resetEditor(); },
    hasIndependentKeys() {
      if(!this.hasSecondStaff)return false;
      if(this.draft.score.parts.some(part=>Object.prototype.hasOwnProperty.call(part,'keyId')))return true;
      return this.bars.some((bar,index)=>{
        const positions=new Set([0].concat(...this.draft.score.parts.map(part=>(part.measures[index].contextChanges || []).map(change=>change.startSlot))));
        return Array.from(positions).some(slot=>workshopMeasureContextAtSlot(this.draft.score,index,slot,0).keyId !== workshopMeasureContextAtSlot(this.draft.score,index,slot,1).keyId);
      });
    },
    resetHistory(key = 'WORKSHOP_HISTORY_START') {
      this.undoStack = []; this.redoStack = []; this.historyOpen = false; this.titleEditStart = null;
      this.historyAction = { key,values:{} };
    },
    historySnapshot() { return { draft: cloneWorkshop(this.draft), revisionId: this.selectedRevisionId,midiNotationSimplified:this.midiNotationSimplified,
      barIndex:this.barIndex, partIndex:this.partIndex, copyTarget:this.copyTarget, historyAction:cloneWorkshop(this.historyAction) }; },
    restoreSnapshot(snapshot) {
      this.copyNotice=null; this.keyboardInsertNotice=null;
      this.cancelSheetGesture(); this.closeContextPicker(); this.placementError = null;
      this.draft = cloneWorkshop(snapshot.draft); this.selectedRevisionId = snapshot.revisionId;
      this.midiNotationSimplified=!!snapshot.midiNotationSimplified;
      this.historyAction = cloneWorkshop(snapshot.historyAction || { key:'WORKSHOP_HISTORY_CHANGE',values:{} });
      this.titleEditStart = null;
      this.barIndex = snapshot.barIndex === undefined ? this.barIndex : snapshot.barIndex;
      this.partIndex = snapshot.partIndex === undefined ? 0 : snapshot.partIndex;
      this.copyTarget = snapshot.copyTarget === undefined ? this.copyTarget : snapshot.copyTarget;
      this.normalizeBarNavigation();
      this.clearSelection(); this.savedNotice = false; this.saveError = null; this.scrollToHistory();
    },
    change(operation, action = { key:'WORKSHOP_HISTORY_CHANGE',values:{} }) {
      this.copyNotice=null; this.keyboardInsertNotice=null;
      this.commitTempoEdit();
      this.commitTitleEdit();
      this.cancelSheetGesture();
      this.stopPlayback();
      const before = this.historySnapshot();
      operation();
      if (this.draft.score.ties) this.draft.score = repairWorkshopTies(this.draft.score);
      if (this.draft.score.slurs) this.draft.score = repairWorkshopSlurs(this.draft.score);
      if (this.draft.score.glissandos) this.draft.score = repairWorkshopGlissandos(this.draft.score);
      if (this.draft.score.tremolos) this.draft.score = repairWorkshopTremolos(this.draft.score);
      this.cancelTieSelection();
      if (JSON.stringify(before.draft) === JSON.stringify(this.draft) && before.revisionId === this.selectedRevisionId) return;
      this.undoStack.push(before);
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = []; this.historyAction = cloneWorkshop(action);
      this.savedNotice = false; this.saveError = null; this.scrollToHistory();
    },
    undo() { this.commitTempoEdit();this.commitTitleEdit(); if (!this.undoStack.length) return; this.stopPlayback(); this.redoStack.push(this.historySnapshot());
      this.restoreSnapshot(this.undoStack.pop()); },
    redo() { this.commitTempoEdit();this.commitTitleEdit(); if (!this.redoStack.length) return; this.stopPlayback(); this.undoStack.push(this.historySnapshot());
      this.restoreSnapshot(this.redoStack.pop()); },
    jumpToHistory(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.historyEntries.length) return;
      const position = this.historyPosition;
      let target = index < position ? this.undoStack[index]
        : this.redoStack[this.redoStack.length - 1 - (index - position - 1)];
      const previousUndo=new Set(this.undoStack);
      this.commitTempoEdit();this.commitTitleEdit();
      // A pending field edit adds a new row. The row clicked before committing
      // is the first new undo snapshot, even when the history limit shifts it.
      if(index === position){target=this.undoStack.find(snapshot=>!previousUndo.has(snapshot));if(!target)return;}
      const snapshots = this.undoStack.concat([this.historySnapshot()],this.redoStack.slice().reverse());
      const targetIndex = snapshots.indexOf(target);
      if (targetIndex < 0) return;
      this.stopPlayback();
      this.undoStack = snapshots.slice(0,targetIndex); this.redoStack = snapshots.slice(targetIndex + 1).reverse();
      this.restoreSnapshot(snapshots[targetIndex]);
    },
    historyEntryLabel(entry) {
      const action = entry.action || { key:'WORKSHOP_HISTORY_CHANGE',values:{} };
      const values = Object.assign({},action.values);
      if (values.value) values.value = this.durationLabel(values.value);
      if (values.clef) values.clef = this.clefLabel(values.clef);
      if (values.keyId) values.key = this.keyLabel(values.keyId);
      return this.$t(action.key,values);
    },
    toggleHistory() { this.historyOpen = !this.historyOpen; if (this.historyOpen) this.scrollToHistory(); },
    scrollToHistory() {
      if (!this.historyOpen) return;
      this.$nextTick(() => {
        const list = this.$refs.historyList;
        const current = list && list.querySelector('[aria-current="step"]');
        if (current) {
          const top = current.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
          if (top < list.scrollTop) list.scrollTop = top;
          else if (top + current.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + current.offsetHeight - list.clientHeight;
        }
      });
    },
    beginTitleEdit() { if (this.titleEditStart === null) this.titleEditStart = this.draft.title; },
    setTitle(event) {
      const title = String(event.target.value).slice(0,80);
      if (this.titleEditStart === null) this.titleEditStart = this.draft.title;
      this.draft.title = title; this.commitTitleEdit();
    },
    commitTitleEdit() {
      if (this.titleEditStart === null || !this.draft) return;
      const before = this.titleEditStart; const title = this.draft.title; this.titleEditStart = null;
      if (before === title) return;
      this.draft.title = before;
      this.change(() => {
        this.draft.title = title;
        if (this.draft.score.metadata) this.draft.score.metadata.title = title;
      },{ key:'WORKSHOP_HISTORY_TITLE_EDIT',values:{} });
    },
    normalizeBarNavigation() {
      if (!this.activeParts.some(staff => staff.index === this.partIndex)) this.partIndex = 0;
      this.addBarCount = Math.max(1, Math.min(this.remainingBars || 1, Number.isInteger(this.addBarCount) ? this.addBarCount : 1));
      this.barIndex = Math.max(0, Math.min(this.bars.length - 1, Number.isInteger(this.barIndex) ? this.barIndex : 0));
      if (!Number.isInteger(this.copyTarget) || !this.bars[this.copyTarget] || this.copyTarget === this.barIndex) {
        this.copyTarget = this.bars.length > 1 ? (this.barIndex + 1) % this.bars.length : 0;
      }
      this.scrollToBar();
    },
    scrollToBar() {
      this.$nextTick(() => {
        const strip = this.$refs.barTabs;
        const button = strip && strip.children[this.barIndex];
        if (button) strip.scrollLeft = Math.max(0, button.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + button.offsetWidth / 2);
      });
    },
    selectBar(index) {
      if (!Number.isInteger(index) || !this.bars[index]) return;
      this.cancelSheetGesture();
      this.cancelEditorPan();
      if (this.audioStarting || this.playbackBarIndex !== null && (this.playing || this.playbackPaused)) this.stopPlayback();
      this.barIndex = index; this.clearSelection(true); this.placementError = null; this.normalizeBarNavigation();
      this.$nextTick(()=>{if(this.$refs.editorViewport)this.$refs.editorViewport.resetScroll();});
    },
    setAddBarCount(event) {
      const count = Number(event.target.value);
      this.addBarCount = Math.max(1, Math.min(this.remainingBars || 1, Number.isFinite(count) ? Math.round(count) : 1));
      event.target.value = String(this.addBarCount);
    },
    addBars() {
      const count = Math.min(this.remainingBars, this.addBarCount);
      const score = insertWorkshopMeasures(this.draft.score, this.barIndex, count);
      if (!score) return;
      const target = this.barIndex + 1;
      if (!this.commitScoreEdit(score,{ key:count === 1 ? 'WORKSHOP_HISTORY_ADD_BAR' : 'WORKSHOP_HISTORY_ADD_BARS',values:{ count,bar:target + 1 } })) return false;
      this.selectBar(target);
    },
    deleteBar() {
      const score = removeWorkshopMeasure(this.draft.score, this.barIndex);
      if (!score) { this.notationError = 'WORKSHOP_BAR_CHANGE_BLOCKED'; return; }
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_DELETE_BAR',values:{ bar:this.barIndex + 1 } })) return false;
      this.clearSelection(); this.placementError = null; this.notationError = null; this.normalizeBarNavigation();
    },
    jumpToBar(event) {
      const value = Number(event.target.value);
      this.selectBar(Math.max(0, Math.min(this.bars.length - 1, Number.isFinite(value) ? Math.round(value) - 1 : this.barIndex)));
      event.target.value = String(this.barIndex + 1);
    },
    clearSelection(keepTie = false) {
      this.cancelSheetGesture(); this.selectedEventId = null; this.selectedEventIds = []; this.selectedAnchorId = null;
      if (keepTie !== true) this.cancelTieSelection();
    },
    cancelTieSelection() { const selecting = !!this.tieAnchorId; this.tieAnchorId = null; this.tieError = null; this.connectionKind = 'tie'; if (selecting) this.cancelSheetGesture(); },
    staffSelectedIds(index) {
      const ids = this.selectedEventIds.slice();
      const anchor = this.tieAnchorEntry;
      if (anchor && anchor.barIndex === this.barIndex) ids.push(anchor.event.id);
      return Array.from(new Set(ids));
    },
    connectTies() {
      if (!this.canTieSelection) return;
      this.connectionKind = 'tie';
      const ids = this.selectedNotes.map(event => event.id);
      this.cancelSheetGesture(); this.stopPlayback();
      if (ids.length === 1) { this.tieAnchorId = ids[0]; this.tieError = null; return; }
      const score = connectWorkshopTies(this.draft.score,ids);
      if (!score) return;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_TIE',values:{ count:ids.length } })) return false;
      this.clearSelection(); this.placementError = null;
    },
    completeTieSelection(event) {
      if (!event || event.id === this.tieAnchorId) return;
      const kind=this.connectionKind,slur=kind === 'slur',glissando=['glissando','slide'].includes(kind);
      const connect = glissando ? connectWorkshopGlissando : slur ? connectWorkshopSlur : connectWorkshopTies;
      const score = event.kind === 'note' ? connect(this.draft.score,[this.tieAnchorId,event.id],kind) : null;
      if (!score || !(score[glissando ? 'glissandos' : slur ? 'slurs' : 'ties'] || []).some(edge => edge.fromId === this.tieAnchorId && edge.toId === event.id)) {
        this.tieError = glissando ? 'WORKSHOP_GLISSANDO_HINT' : slur ? 'WORKSHOP_SLUR_HINT' : 'WORKSHOP_TIE_HINT'; return;
      }
      if (!this.commitScoreEdit(score,{ key:glissando ? 'WORKSHOP_HISTORY_GLISSANDO' : slur ? 'WORKSHOP_HISTORY_SLUR' : 'WORKSHOP_HISTORY_TIE',values:{ count:2 } })) return false;
      this.clearSelection(); this.placementError = null;
    },
    connectionMessage(suffix) { return 'WORKSHOP_'+(this.connectionKind === 'slur' ? 'SLUR' : ['glissando','slide'].includes(this.connectionKind) ? 'GLISSANDO' : 'TIE')+'_'+suffix; },
    startGlissandoSelection(type) {
      if (!['glissando','slide'].includes(type) || this.selectedNotes.length !== 1 || this.selectedEvents.length !== 1) return false;
      this.cancelSheetGesture(); this.stopPlayback(); this.connectionKind=type; this.tieAnchorId=this.selectedNotes[0].id; this.tieError=null; return true;
    },
    unlinkTies() {
      if (!this.hasSelectedTies) return;
      const score = disconnectWorkshopTies(this.draft.score,this.selectedNotes.map(event => event.id));
      if (!score) return;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_TIE_REMOVE',values:{} })) return false;
      this.placementError = null;
    },
    connectSlur() {
      if (!this.canSlurSelection) return;
      const ids = this.selectedNotes.map(event => event.id);
      this.cancelSheetGesture(); this.stopPlayback();
      if (ids.length === 1) { this.connectionKind = 'slur'; this.tieAnchorId = ids[0]; this.tieError = null; return; }
      const score = connectWorkshopSlur(this.draft.score,ids);
      if (!score) return;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_SLUR',values:{} })) return false;
      this.clearSelection(); this.placementError = null;
    },
    unlinkSlurs() {
      if (!this.hasSelectedSlurs) return;
      const score = disconnectWorkshopSlurs(this.draft.score,this.selectedNotes.map(event => event.id));
      if (!score) return;
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_SLUR_REMOVE',values:{} })) return false;
      this.placementError = null;
    },
    toggleMultiSelect() {
      this.cancelTieSelection(); this.cancelSheetGesture();
      if (this.multiSelect) { this.multiSelect = false; this.clearSelection(); return; }
      const ids = this.selectedEvents.map(event => event.id);
      const anchorId = this.selectedAnchorId || this.selectedEventId;
      this.multiSelect = true; this.restoreSelection(ids,anchorId);
    },
    setSelectionUnit(unit) { if (!['note','chord'].includes(unit)) return; this.cancelSheetGesture(); this.selectionUnit = unit; },
    restoreSelection(ids,anchorId) {
      const notes = this.currentBar.events.filter(event => ids.includes(event.id));
      this.selectedEventId = null; this.selectedEventIds = notes.map(event => event.id);
      this.selectedAnchorId = notes.some(event => event.id === anchorId) ? anchorId : notes.length ? notes[0].id : null;
      const anchor = notes.find(event => event.id === this.selectedAnchorId);
      if (anchor) { this.tool.kind = anchor.kind; this.tool.noteValue = anchor.originalNoteValue || anchor.noteValue; this.toolDots = workshopRequestedDots(anchor); this.toolVoice = workshopEventVoice(anchor); if(anchor.pitch)this.tool.alter = anchor.pitch.alter; }
    },
    toggleSelection({ ids,anchorId }) {
      if (!this.multiSelect || !Array.isArray(ids)) return;
      const current = this.selectedEvents.map(event => event.id);
      const additions = this.currentBar.events.filter(event => ids.includes(event.id)).map(event => event.id);
      if (!additions.length) return;
      const allSelected = additions.every(id => current.includes(id));
      this.stopPlayback(); this.placementError = null;
      this.restoreSelection(allSelected ? current.filter(id => !additions.includes(id)) : Array.from(new Set(current.concat(additions))),anchorId);
    },
    extendSelection({ ids,anchorId }) {
      if (!this.multiSelect || !Array.isArray(ids)) return;
      this.stopPlayback(); this.placementError = null;
      this.restoreSelection(Array.from(new Set(this.selectedEvents.map(event => event.id).concat(ids))),anchorId);
    },
    selectEvent(event) {
      if (!event) return;
      if (this.tieAnchorId) { this.completeTieSelection(event); return; }
      this.stopPlayback(); this.placementError = null;
      this.selectedEventIds = []; this.selectedAnchorId = null;
      this.selectedEventId = event.id; this.tool.kind = event.kind; this.tool.noteValue = event.originalNoteValue || event.noteValue; this.toolDots = workshopRequestedDots(event); this.toolVoice = workshopEventVoice(event);
      if (event.pitch) this.tool.alter = event.pitch.alter;
    },
    selectGroup({ anchorId }) {
      if (this.tieAnchorId) { this.completeTieSelection(this.currentBar.events.find(event => event.id === anchorId)); return; }
      const notes = workshopChordEvents(this.editorBar, anchorId);
      if (notes.length < 2) { const event = this.currentBar.events.find(entry => entry.id === anchorId); if (event) this.selectEvent(event); return; }
      this.stopPlayback(); this.placementError = null;
      this.selectedEventId = null; this.selectedEventIds = notes.map(event => event.id); this.selectedAnchorId = anchorId;
      const anchor = notes.find(event => event.id === anchorId);
      this.tool.kind = 'note'; this.tool.noteValue = anchor.originalNoteValue || anchor.noteValue; this.toolDots = workshopRequestedDots(anchor); this.toolVoice = workshopEventVoice(anchor); this.tool.alter = anchor.pitch.alter;
    },
    sheetInstances() { const sheets = this.$refs && this.$refs.sheet; return sheets ? (Array.isArray(sheets) ? sheets : [sheets]) : []; },
    cancelSheetGesture() { this.sheetInstances().forEach(sheet => sheet.cancelGesture()); },
    alterSymbol(alter) { if (!Number.isInteger(alter)) return (alter < 0 ? '−' : '+')+(Math.abs(alter) === .5 ? '¼' : '¾'); return alter === -2 ? '𝄫' : alter === 2 ? '𝄪' : alter < 0 ? '♭' : alter > 0 ? '♯' : '♮'; },
    alterLabel(alter) { if (!Number.isInteger(alter)) return this.$t({ '-1.5':'WORKSHOP_QUARTERTONE_LOWER_THREE','-0.5':'WORKSHOP_QUARTERTONE_LOWER_ONE','0.5':'WORKSHOP_QUARTERTONE_RAISE_ONE','1.5':'WORKSHOP_QUARTERTONE_RAISE_THREE' }[alter]); return this.$t(alter === -2 ? 'WORKSHOP_DOUBLE_FLAT' : alter === 2 ? 'WORKSHOP_DOUBLE_SHARP' : alter < 0 ? 'WORKSHOP_FLAT' : alter > 0 ? 'WORKSHOP_SHARP' : 'WORKSHOP_NATURAL'); },
    chooseToolKind(kind) {
      if (!['note','rest'].includes(kind)) return false;
      this.cancelSheetGesture(); this.clearSelection(); this.multiSelect=false; this.tool.kind=kind;
      this.placementError=null; this.keyboardInsertNotice=null; return true;
    },
    resetKeyboardPosition() { this.keyboardBeat=1; this.keyboardInsertNotice=null; },
    keyboardStepLabel(step) { return this.eventLabel({kind:'note',pitch:{step,alter:0,octave:4}}).replace(/4$/, ''); },
    prepareKeyboardInsertion(event) {
      if (event.target.open) this.chooseToolKind(this.tool.kind);
    },
    async insertWithKeyboard() {
      if (this.keyboardInserting || !this.draft || this.sheetView || this.contextPicker || this.tieAnchorId) return false;
      const beat=Number(this.keyboardBeat),slot=(beat-1)*2;
      if (this.keyboardBeat === '' || !Number.isFinite(beat) || beat < 1 || beat > this.keyboardLastBeat
        || Math.abs(slot / this.keyboardGridStep - Math.round(slot / this.keyboardGridStep)) > 1e-7) {
        this.placementError='WORKSHOP_KEYBOARD_POSITION_ERROR'; return false;
      }
      const draft=this.draft,bar=this.barIndex,part=this.partIndex;
      this.keyboardInserting=true;
      try {
        this.chooseToolKind(this.tool.kind);
        // Update the real Staff props before deriving the same payload as a
        // pointer placement. Never duplicate clef/key/range or voice rules.
        await this.$nextTick();
        if (this._isDestroyed || this.draft !== draft || this.barIndex !== bar || this.partIndex !== part || this.sheetView || this.contextPicker) return false;
        const staff=this.sheetInstances().find(sheet=>sheet.staffIndex === part);
        const payload=staff && typeof staff.keyboardPlacement === 'function'
          ? staff.keyboardPlacement({slot,step:this.keyboardStep,octave:this.keyboardOctave}) : null;
        if (!payload) { this.placementError='WORKSHOP_KEYBOARD_PLACEMENT_ERROR'; return false; }
        if (!this.placeOnSheet(payload)) return false;
        this.clearSelection();
        this.keyboardInsertNotice={bar:bar+1,staff:this.staffLabel(part)};
        return true;
      } finally { this.keyboardInserting=false; }
    },
    chooseToolValue(value) {
      if (!this.noteUnits[value]) return;
      this.cancelTieSelection(); this.cancelSheetGesture();
      if (this.hasSelection) { this.changeSelectedValue(value); return; }
      this.tool.noteValue = value; this.placementError = null;
    },
    isActiveAlter(alter) {
      return this.hasSelection ? this.selectedNotes.length > 0 && this.selectionAlter === alter : !this.followKeySignature && this.tool.alter === alter;
    },
    chooseActiveAlter(alter) {
      if (this.hasSelection) { this.changeSelectedAlter(alter); return; }
      this.chooseToolAlter(alter);
    },
    chooseToolAlter(alter) { this.cancelSheetGesture(); this.clearSelection(); this.tool.alter = alter; this.followKeySignature = false; this.placementError = null; },
    chooseKeyAccidentals() { this.clearSelection(); this.followKeySignature = true; this.placementError = null; },
    placeOnSheet({ slot, pitch }) {
      if (this.tieAnchorId) return;
      const event = { id: workshopId('note'), kind: this.tool.kind, noteValue: this.tool.noteValue, pitch: this.tool.kind === 'rest' ? null : pitch };
      if (this.toolDots > 0) event.dots = this.toolDots;
      if (this.toolVoice !== 1) event.voice = this.toolVoice;
      const events = placeWorkshopEvent(this.editorBar, slot, event);
      if (!events) { this.placementError = 'WORKSHOP_PLACEMENT_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:event.kind === 'rest' ? 'WORKSHOP_HISTORY_PLACE_REST' : 'WORKSHOP_HISTORY_PLACE_NOTE',
        values:{ bar:this.barIndex + 1,note:event.pitch ? this.eventLabel(event) : '' } })) return false;
      if (event.pitch && workshopChordEvents(this.editorBar,event.id).length > 1) this.selectGroup({ anchorId:event.id });
      else this.selectEvent(event);
      if (event.pitch) this.player.play(workshopPitchValue(event.pitch), Options.appVolume, { feedback: true });
      return true;
    },
    moveSheetNote({ id, pitch, slot }) {
      if (this.tieAnchorId) return;
      const index = this.currentBar.events.findIndex(event => event.id === id && event.kind === 'note');
      if (index < 0 || !pitch) return;
      const old = this.currentBar.events[index];
      const originalSlot = workshopMeasureEvents(this.currentBar).find(event => event.id === id).startSlot;
      const targetSlot = slot === undefined ? originalSlot : slot;
      if (targetSlot === originalSlot && old.pitch.step === pitch.step && old.pitch.alter === pitch.alter && old.pitch.octave === pitch.octave) return;
      const events = moveWorkshopNote(this.editorBar, id, targetSlot, pitch);
      if (!events) { this.placementError = 'WORKSHOP_MOVE_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_MOVE_NOTE',values:{ bar:this.barIndex + 1,note:this.eventLabel(old) } })) return false;
      this.selectEvent(events.find(event => event.id === id));
      this.player.play(workshopPitchValue(pitch), Options.appVolume, { feedback: true });
    },
    moveSheetNotes({ ids, anchorId, pitch, slot }) {
      if (this.tieAnchorId) return;
      const original = workshopMeasureEvents(this.currentBar).find(event => event.id === anchorId);
      if (!original || !pitch) return;
      const targetSlot = slot === undefined ? original.startSlot : slot;
      if (targetSlot === original.startSlot && workshopPitchValue(original.pitch) === workshopPitchValue(pitch)) return;
      const events = moveWorkshopNotes(this.editorBar,ids,anchorId,targetSlot,pitch);
      if (!events) { this.placementError = 'WORKSHOP_MOVE_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_MOVE_NOTES',values:{ bar:this.barIndex + 1,count:ids.length } })) return false;
      if (this.multiSelect) this.restoreSelection(ids,anchorId); else this.selectGroup({ anchorId });
      ids.forEach(id => { const moved = events.find(event => event.id === id); this.player.play(workshopPitchValue(moved.pitch),Options.appVolume, { feedback: true }); });
    },
    changeSelectedValue(value, control) {
      if (!this.hasSelection || !this.noteUnits[value]) return;
      if (this.selectedEvents.every(event => (event.originalNoteValue || event.noteValue) === value)
          && !(this.noteUnits[value] > 1 && this.selectedEvents.some(event => !!event.beamGroupId))) return;
      const group = this.groupSelected || this.multiSelect; const anchorId = this.selectedAnchorId; const singleId = this.selectedEventId;
      const selectedIds = this.selectedEvents.map(event => event.id);
      const updates = workshopMeasureEvents(this.currentBar).filter(event => selectedIds.includes(event.id))
        .map(event => {
          const updated = Object.assign({},event,{ noteValue:value });
          if (workshopRequestedDots(event) > 0) updated.dots = workshopRequestedDots(event);
          else delete updated.dots;
          delete updated.originalNoteValue; delete updated.originalDots; return updated;
        });
      const events = replaceWorkshopEvents(this.editorBar,updates);
      if (!events) { this.placementError = 'WORKSHOP_PLACEMENT_BLOCKED'; if (control) control.value = this.activeNoteValue || this.tool.noteValue; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_VALUE',values:{ bar:this.barIndex + 1,value } })) return false;
      if (group) this.restoreSelection(selectedIds,anchorId); else this.selectEvent(events.find(event => event.id === singleId));
    },
    toggleDots() {
      if (!this.canDotSelection) return;
      this.cancelTieSelection();
      const dots = this.activeDots > 0 ? 0 : 1;
      if (!this.hasSelection) { this.cancelSheetGesture(); this.toolDots = dots; this.placementError = null; return; }
      const group = this.groupSelected || this.multiSelect; const anchorId = this.selectedAnchorId; const singleId = this.selectedEventId;
      const ids = this.selectedEvents.map(event => event.id);
      const updates = workshopMeasureEvents(this.currentBar).filter(event => ids.includes(event.id)).map(event => {
        const updated = Object.assign({},event,{ noteValue:event.originalNoteValue || event.noteValue });
        if (dots === 1) updated.dots = 1; else delete updated.dots;
        delete updated.originalNoteValue; delete updated.originalDots; return updated;
      });
      const events = replaceWorkshopEvents(this.editorBar,updates);
      if (!events) { this.placementError = 'WORKSHOP_PLACEMENT_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:dots ? 'WORKSHOP_HISTORY_DOT_ON' : 'WORKSHOP_HISTORY_DOT_OFF',values:{ bar:this.barIndex + 1 } })) return false;
      if (group) this.restoreSelection(ids,anchorId); else this.selectEvent(events.find(event => event.id === singleId));
      this.placementError = null;
    },
    changeSelectedAlter(alter) {
      if (!this.selectedNotes.length || this.selectedNotes.every(event => event.pitch.alter === alter)) return;
      const group = this.groupSelected || this.multiSelect; const anchorId = this.selectedAnchorId; const singleId = this.selectedEventId;
      const ids = this.selectedNotes.map(event => event.id);
      const selectionIds=this.selectedEvents.map(event=>event.id);
      const updates = workshopMeasureEvents(this.currentBar).filter(event => ids.includes(event.id))
        .map(event => Object.assign({},event,{ pitch:Object.assign({},event.pitch,{ alter }) }));
      const events = replaceWorkshopEvents(this.editorBar,updates);
      if (!events) { this.placementError = 'WORKSHOP_MOVE_BLOCKED'; return; }
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_ALTER',values:{ bar:this.barIndex + 1 } })) return false;
      if (group) this.restoreSelection(selectionIds,anchorId); else this.selectEvent(events.find(event => event.id === singleId));
      updates.forEach(event => this.player.play(workshopPitchValue(event.pitch),Options.appVolume, { feedback: true }));
    },
    connectSelection() {
      if (!this.canConnectSelection) return;
      const ids=this.selectedNotes.map(event => event.id); const anchorId=this.selectedAnchorId || this.selectedEventId;
      const events=joinWorkshopNotes(this.editorBar,ids);
      if (!events) return;
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_CONNECT',values:{ bar:this.barIndex + 1,count:ids.length } })) return false;
      this.restoreSelection(ids,anchorId); this.placementError=null;
    },
    unlinkSelection() {
      if (!this.canUnlinkSelection) return;
      const ids=this.selectedNotes.map(event => event.id); const anchorId=this.selectedAnchorId || this.selectedEventId;
      const events=splitWorkshopBeams(this.editorBar,ids);
      if (!events) return;
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_UNLINK',values:{ bar:this.barIndex + 1 } })) return false;
      this.restoreSelection(ids,anchorId); this.placementError=null;
    },
    eraseSelectedEvent() {
      if (!this.hasSelection) return;
      const events = removeWorkshopEvents(this.editorBar,this.selectedEvents.map(event => event.id));
      if (!events) return;
      if (!this.commitEventEdit(events,{ key:'WORKSHOP_HISTORY_REMOVE',values:{ bar:this.barIndex + 1 } })) return false;
      this.clearSelection(); this.placementError = null;
    },
    copyBar() {
      if (this.copyTarget === this.barIndex || !Number.isInteger(this.copyTarget) || !this.bars[this.copyTarget]) return;
      const target = this.copyTarget; let score = cloneWorkshop(this.draft.score); const copiedIds = new Map();
      score.parts.forEach((part,index) => {
        const sourceContext = workshopMeasureContext(this.draft.score,this.barIndex,index);
        const following = target + 1 < this.bars.length ? workshopMeasureContext(this.draft.score,target + 1,index) : null;
        const copied = part.measures[target];
        copied.events = withWorkshopRestProvenance(this.draft.score.parts[index].measures[this.barIndex],{legacy:!this.draft.score.musicXml}).events.map(event => {
          const id = workshopId('note'); copiedIds.set(event.id,id); return Object.assign(cloneWorkshop(event),{ id });
        });
        copied.meter = sourceContext.meter; copied.clef = sourceContext.clef;
        const source = this.draft.score.parts[index].measures[this.barIndex];
        ['keyId','dynamic'].forEach(key => {
          delete copied[key];
          const inherited = workshopMeasureContext(score,target,index)[key];
          if (sourceContext[key] !== inherited || Object.prototype.hasOwnProperty.call(source,key)) copied[key] = sourceContext[key];
        });
        ['clefOctave','transpose'].forEach(key => {
          delete copied[key];
          const fallback=key === 'clefOctave' ? 0 : {chromatic:0},wanted=sourceContext[key] || fallback;
          const inherited=workshopMeasureContext(score,target,index)[key] || fallback;
          if (JSON.stringify(wanted) !== JSON.stringify(inherited) || Object.prototype.hasOwnProperty.call(source,key)) copied[key]=cloneWorkshop(wanted);
        });
        ['repeatStart','repeatEnd','ending','navigation'].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(source,key)) copied[key] = cloneWorkshop(source[key]); else delete copied[key];
        });
        if (source.contextChanges) copied.contextChanges=source.contextChanges.map(change => Object.assign(cloneWorkshop(change),{id:workshopId('context')}));
        else delete copied.contextChanges;
        if (source.directions) copied.directions=source.directions.map(direction=>{
          const copy=cloneWorkshop(direction); copy.id=workshopId('direction');
          if (copy.endBarId) {
            const endIndex=part.measures.findIndex(measure=>measure.id === copy.endBarId);
            const newEnd=part.measures[target+endIndex-this.barIndex];
            copy.endBarId=newEnd ? newEnd.id : 'missing-bar';
          }
          return copy;
        }); else delete copied.directions;
        if (following) {
          const after = workshopMeasureContext(score,target + 1,index); const next = part.measures[target + 1];
          if (after.meter !== following.meter) next.meter = following.meter;
          if (after.clef !== following.clef) next.clef = following.clef;
          ['keyId','dynamic'].forEach(key => { if (after[key] !== following[key]) next[key] = following[key]; });
          ['clefOctave','transpose'].forEach(key => {
            const fallback=key === 'clefOctave' ? 0 : {chromatic:0},wanted=following[key] || fallback;
            if (JSON.stringify(after[key] || fallback) !== JSON.stringify(wanted)) next[key]=cloneWorkshop(wanted);
          });
        }
      });
      const copiedTies = (this.draft.score.ties || []).filter(edge => copiedIds.has(edge.fromId) && copiedIds.has(edge.toId))
        .map(edge => Object.assign({},edge,{ fromId:copiedIds.get(edge.fromId),toId:copiedIds.get(edge.toId) }));
      if (copiedTies.length) score.ties = (score.ties || []).concat(copiedTies);
      const copiedSlurs = (this.draft.score.slurs || []).filter(edge => copiedIds.has(edge.fromId) && copiedIds.has(edge.toId))
        .map(edge => ({ fromId:copiedIds.get(edge.fromId),toId:copiedIds.get(edge.toId) }));
      if (copiedSlurs.length) score.slurs = (score.slurs || []).concat(copiedSlurs);
      ['glissandos','tremolos'].forEach(kind=>{
        const copied=(this.draft.score[kind] || []).filter(edge=>copiedIds.has(edge.fromId) && copiedIds.has(edge.toId))
          .map(edge=>Object.assign({},edge,{fromId:copiedIds.get(edge.fromId),toId:copiedIds.get(edge.toId)}));
        if(copied.length)score[kind]=(score[kind] || []).concat(copied);
      });
      score = repairWorkshopTremolos(repairWorkshopGlissandos(repairWorkshopSlurs(repairWorkshopTies(score))));
      if (!isValidWorkshopScore(score)) { this.notationError = 'WORKSHOP_COPY_BLOCKED'; return; }
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_COPY_BAR',values:{ from:this.barIndex + 1,to:target + 1 } })) return false;
      this.copyNotice={from:this.barIndex+1,to:target+1}; return true;
    },
    moveBar(direction) { const target = this.barIndex + direction; if (target < 0 || target >= this.bars.length) return;
      const score = moveWorkshopMeasure(this.draft.score,this.barIndex,target); if (!score) { this.notationError = 'WORKSHOP_BAR_CHANGE_BLOCKED'; return; }
      if (!this.commitScoreEdit(score,{ key:'WORKSHOP_HISTORY_MOVE_BAR',values:{ from:this.barIndex + 1,to:target + 1 } })) return false;
      this.notationError = null; this.selectBar(target); },
    setTempo(event) {
      this.tempoInput=null;
      const value = String(event.target.value).trim() === "" ? this.draft.score.bpm : Number(event.target.value);
      const bpm = Number.isFinite(value) ? Math.max(25, Math.min(240, Math.round(value))) : this.draft.score.bpm;
      if (bpm !== this.draft.score.bpm) this.change(() => { this.draft.score.bpm = bpm; },{ key:'WORKSHOP_HISTORY_TEMPO',values:{ bpm } });
      event.target.value = String(bpm);
    },
    commitTempoEdit() {
      if (this.tempoInput !== null && this.draft) this.setTempo({target:{value:this.tempoInput}});
    },
    setMidiNotation(simplified) {
      if(!this.draft || !this.midiImportAvailable || !this._midiOriginalScore)return false;
      // Returning to the imported score is safe while the import dialog blocks
      // editing. Afterward, Undo preserves any later work without replacing it.
      if(!simplified && !this.importNotice)return false;
      const score=simplified ? quantizeWorkshopMidiScore(this.draft.score) : cloneWorkshop(this._midiOriginalScore);
      if(!score || JSON.stringify(score) === JSON.stringify(this.draft.score))return false;
      if (!this.commitScoreEdit(score,{key:'WORKSHOP_HISTORY_MIDI_NOTATION',values:{}})) return false;
      this.midiNotationSimplified=!!simplified;
      this.clearSelection();this.normalizeBarNavigation();return true;
    },
    openRevisionManager() {
      this.$nextTick(()=>{
        if(this.$refs.pieceSettings)this.$refs.pieceSettings.open=true;
        if(this.$refs.revisionManager){this.$refs.revisionManager.open=true;this.$refs.revisionManager.scrollIntoView({block:'nearest'});}
      });
    },
    toggleRevisionSelection(id,selected) {
      if(!this.currentPiece || id === this.currentPiece.currentRevisionId || !this.currentPiece.revisions.some(revision=>revision.id===id))return;
      this.revisionSelection=selected ? Array.from(new Set(this.revisionSelection.concat(id))) : this.revisionSelection.filter(value=>value!==id);
      this.revisionDeleteError=null;
    },
    requestRevisionDeletion() {
      if(!this.currentPiece || !this.revisionSelection.length)return false;
      this.revisionDeleteIds=this.revisionSelection.slice();this.revisionDeleteError=null;
      this._revisionReturnFocus=typeof document !== 'undefined' ? document.activeElement : null;
      this.$nextTick(()=>{if(this.$refs.revisionCancel)this.$refs.revisionCancel.focus();});return true;
    },
    cancelRevisionDeletion() {
      this.revisionDeleteIds=[];this.revisionDeleteError=null;
      this.$nextTick(()=>{if(this._revisionReturnFocus && this._revisionReturnFocus.focus)this._revisionReturnFocus.focus();});
    },
    confirmRevisionDeletion() {
      if(!this.draft || !this.revisionDeleteIds.length)return false;
      try {
        const result=deleteStoredWorkshopRevisions(this.draft.pieceId,this.revisionDeleteIds);
        this.library=result.library;
        if(result.removedRevisionIds.includes(this.selectedRevisionId))this.selectedRevisionId=null;
        this.undoStack.concat(this.redoStack).forEach(snapshot=>{if(result.removedRevisionIds.includes(snapshot.revisionId))snapshot.revisionId=null;});
        this.revisionSelection=[];this.saveError=null;this.cancelRevisionDeletion();return true;
      } catch(error) {
        if(['current-revision-protected','missing-revision','missing-piece'].includes(error.message)){
          try{this.library=readWorkshopLibrary();}catch(readError){/* Keep the intact editor if the stored library cannot be read. */}
        }
        this.revisionDeleteError=error.message === 'current-revision-protected' ? 'WORKSHOP_REVISIONS_PROTECTED' : 'WORKSHOP_REVISIONS_DELETE_ERROR';return false;
      }
    },
    chooseRevision(id) {
      if (id === this.selectedRevisionId) return;
      const revision = this.currentPiece.revisions.find(entry => entry.id === id);
      if (!revision) return;
      this.change(() => { this.draft.score = cloneWorkshop(restoreWorkshopTupletDisplay(revision.score,this.draft.title)); this.selectedRevisionId = id; },{ key:'WORKSHOP_HISTORY_REVISION',
        values:{ number:this.currentPiece.revisions.findIndex(entry => entry.id === id) + 1 } });
      this.clearSelection(); this.normalizeBarNavigation();
    },
    savePiece() {
      this.cancelTieSelection(); this.commitTempoEdit();this.commitTitleEdit();
      this.cancelSheetGesture();
      this.stopPlayback();
      try {
        const result = storeWorkshopDraft(this.draft);
        this.library = result.library; this.draft = openWorkshopPiece(result.piece);
        this.baseline = JSON.stringify(this.draft); this.selectedRevisionId = result.piece.currentRevisionId;
        // An unsaved piece gains its persistent identity here. Keep every undo
        // state on that same piece so saving an older state cannot create a copy.
        this.undoStack.concat(this.redoStack).forEach(snapshot=>{
          snapshot.draft.pieceId=result.piece.id;
        });
        this.revisionSelection=[];this.titleEditStart=null;this.saveError = null; this.savedNotice = true; return true;
      } catch (error) {
        this.saveError = error.message === 'revision-limit' ? 'WORKSHOP_REVISION_LIMIT' : error.message === "library-full" ? "WORKSHOP_FULL" : "WORKSHOP_SAVE_ERROR"; return false;
      }
    },
    stopPlayback() {
      this.audioStartRequest = (this.audioStartRequest || 0) + 1;
      this.audioStarting = false; this.playing = false; this.playbackPaused = false;
      this.stopPlaybackClock();
      if (this.playback) this.playback.stop();
      if (this.previewPlayer) this.previewPlayer.stopAll();
      if (this.player) this.player.stopAll();
      this.playback = null; this.playingBar = null; this.playbackBarIndex = null; this.activeEventId = null; this.activeEventIds = [];
      this.listeningView = false; this.playbackTimeline = null; this.playbackPosition = 0;
    },
    stopPlaybackClock() {
      if (this.playbackFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    },
    updatePlaybackPosition() {
      if (!this.playback) return;
      this.playbackPosition = this.playback.getPosition();
    },
    startPlaybackClock() {
      this.stopPlaybackClock();
      const tick = () => {
        if (!this.playback || !this.playing) return;
        this.updatePlaybackPosition();
        this.playbackFrame = requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame === 'function') this.playbackFrame = requestAnimationFrame(tick);
    },
    pausePlayback() {
      if (!this.playback || !this.playing) return;
      this.playback.pause(); this.updatePlaybackPosition(); this.playing = false; this.playbackPaused = true; this.stopPlaybackClock();
    },
    async resumePlayback() {
      if (!this.playback || this.audioStarting) return;
      const playback=this.playback,request=++this.audioStartRequest;
      this.audioStarting=true; this.playbackError=null;
      try {
        const ready=await AudioSync.resume();
        if (request!==this.audioStartRequest || this.playback!==playback || !this.draft) return;
        const context=AudioSync.getContext();
        if (context && (!ready || context.state!=='running')) {this.playbackError='WORKSHOP_AUDIO_UNAVAILABLE';return;}
        this.playing=playback.getPosition() >= playback.getDuration() ? playback.start() : playback.resume();
        this.playbackPaused=!this.playing;this.updatePlaybackPosition();if(this.playing) this.startPlaybackClock();
      } catch(error) {if(request===this.audioStartRequest) this.playbackError='WORKSHOP_AUDIO_UNAVAILABLE';}
      finally {if(request===this.audioStartRequest) this.audioStarting=false;}
    },
    seekPlayback(position) {
      if (!this.playback || this.audioStarting || !Number.isFinite(position)) return;
      this.playback.seek(position); this.updatePlaybackPosition();
      const state=this.playback.getPositionState();
      this.playing=state.playing;this.playbackPaused=state.paused;
      if(Number.isInteger(state.barIndex)) {this.playingBar=state.barIndex;this.barIndex=state.barIndex;}
      if(this.playing) this.startPlaybackClock();else this.stopPlaybackClock();
    },
    finishPlaybackScrub(result) {this.seekPlayback(result.position);if(result.resume && !this.playing) this.resumePlayback();},
    togglePlayback() {
      this.cancelSheetGesture();
      if (this.audioStarting) {this.stopPlayback();return;}
      if (this.playback) {if(this.playing) this.pausePlayback();else this.resumePlayback();return;}
      if (this.playing) {this.stopPlayback();return;}
      if (this.hasNotes) this.startPlayback();
    },
    toggleBarPlayback() {
      this.cancelSheetGesture();
      if(this.audioStarting){this.stopPlayback();return;}
      if(this.playback && this.playbackBarIndex === this.barIndex){if(this.playing)this.pausePlayback();else this.resumePlayback();return;}
      if (!this.hasCurrentBarNotes) return;
      this.stopPlayback(); this.startPlayback(this.barIndex);
    },
    async startPlayback(barIndex) {
      this.commitTempoEdit();this.commitTitleEdit();
      this.stopLibraryPlayback();
      this.stopPlayback();
      const request = this.audioStartRequest;
      this.audioStarting = true; this.playbackError = null;
      try {
        const ready = await AudioSync.resume();
        if (request !== this.audioStartRequest || !this.draft) return;
        const context = AudioSync.getContext();
        if (context && (!ready || context.state !== "running")) { this.playbackError = 'WORKSHOP_AUDIO_UNAVAILABLE'; return; }
        const wholePiece = !Number.isInteger(barIndex);
        this.playbackBarIndex = wholePiece ? null : barIndex;
        this.playingBar = wholePiece ? 0 : barIndex;
        if (!this.previewPlayer) this.previewPlayer = createWorkshopPianoPlayer({ maxVoices:256,allowFractionalPitch:true,fallbackPlayer:this.player });
        this.playback = createWorkshopPlayback(this.draft.score, this.previewPlayer, {
          barIndex, appVolume: Options.appVolume, delayMs: AudioSync.getDelayMs(),
          onStep: event => { this.playingBar = event.barIndex; this.activeEventId = event.id; },
          onActiveNotes: (ids, currentBar) => {
            this.activeEventIds = ids; this.playingBar = currentBar;
            if (this.playing && this.listeningView && Number.isInteger(currentBar) && currentBar >= 0 && currentBar < this.bars.length) this.barIndex = currentBar;
          },
          onPosition: () => {this.updatePlaybackPosition();},
          onPause: () => {this.playing=false;this.playbackPaused=true;this.stopPlaybackClock();},
          onStop: () => {this.updatePlaybackPosition();this.stopPlaybackClock();this.playing=false;this.playbackPaused=false;this.activeEventId=null;this.activeEventIds=[];}
        });
        const samplesReady = await this.previewPlayer.prepare(this.playback.getTimeline().events.map(event => event.value));
        if (request !== this.audioStartRequest || !this.draft) return;
        if (!samplesReady) throw new Error("piano-samples-unavailable");
        if (wholePiece) {
          this.barIndex=0;this.clearSelection();this.listeningView=true;this.sheetView=false;
          this.playbackTimeline=Object.freeze(this.playback.getTimeline());
          // Engrave before the first sound so long imported scores start in sync.
          await this.$nextTick();
          if (request !== this.audioStartRequest || !this.draft) return;
        }
        this.playing = this.playback.start();
        if (!this.playing) throw new Error("unplayable-score");
        if (this.playing && this.playingBar === null) this.playingBar = wholePiece ? 0 : barIndex;
        this.playbackBarIndex = this.playing && !wholePiece ? barIndex : null;
        if (this.playing && wholePiece) this.startPlaybackClock();
        if (wholePiece) this.$nextTick(()=>{if(this.listeningView && this.$refs.listening) this.$refs.listening.$el.scrollIntoView({block:'nearest',behavior:'instant'});});
      } catch (error) {
        if (request === this.audioStartRequest) { this.stopPlayback(); this.playbackError = 'WORKSHOP_AUDIO_UNAVAILABLE'; }
      } finally {
        if (request === this.audioStartRequest) this.audioStarting = false;
      }
    },
    closeEditor() { this.setEditorPanning(false);this.closeContextPicker(); this.clearSelection(); this.stopPlayback(); this.resetHistory(); this.draft = null; this.tempoInput=null;this.midiImportAvailable=false;this._midiOriginalScore=null;this.revisionSelection=[];this.revisionDeleteIds=[];this.editorColorIndex=0; this.importNotice=false;this.importNoteCounts=null;this.importUnsupportedElements=[];this.xmlMessage=null;this.xmlWarnings=[]; this.confirmExit = false; this.saveError = null; },
    saveAndClose() { if (this.savePiece()) this.closeEditor(); },
    requestExit() {
      this._exitReturnFocus=typeof document !== 'undefined' ? document.activeElement : null;
      this.confirmExit=true;this.$nextTick(()=>{if(this.$refs.exitContinue)this.$refs.exitContinue.focus();});
    },
    cancelExit() {
      this.confirmExit=false;
      this.$nextTick(()=>{
        const button=this._exitReturnFocus && this._exitReturnFocus.focus ? this._exitReturnFocus : this.$refs.editorBack;
        if(button && button.focus)button.focus();
      });
    },
    trapDecisionFocus(event,kind) {
      const names=kind === 'revision' ? ['revisionCancel','revisionConfirm'] : kind === 'import' ? ['importNotation','importNoticeClose'] : ['exitSave','exitDiscard','exitContinue','exitManage'];
      const buttons=names.map(name=>this.$refs[name]).filter(Boolean);
      if(!buttons.length)return;
      const active=typeof document !== 'undefined' ? document.activeElement : null,index=buttons.indexOf(active);
      const next=index < 0 ? (event.shiftKey ? buttons.length-1 : 0) : (index+(event.shiftKey ? -1 : 1)+buttons.length)%buttons.length;
      buttons[next].focus();
    },
    handleBack() {
      if (this.xmlBusy) return true;
      if (this.importNotice) {this.closeImportNotice();return true;}
      if (this.infoPiece) {this.infoPiece=null;return true;}
      if (this.practiceSession) {
        if (this.$refs.practice && typeof this.$refs.practice.back === 'function') this.$refs.practice.back();
        else this.closePractice();
        return true;
      }
      if (this.pieceToDelete) { this.cancelPieceDeletion(); return true; }
      if(this.revisionDeleteIds.length){this.cancelRevisionDeletion();return true;}
      if (this.pieceDetailsDraft) { this.closePieceDetails(); return true; }
      if (this.contextPicker) { this.closeContextPicker(); return true; }
      if (this.tieAnchorId) { this.cancelTieSelection(); return true; }
      this.commitTempoEdit();this.commitTitleEdit();
      if (this.historyOpen) { this.historyOpen = false; return true; }
      if (this.$refs && this.$refs.sheet && this.sheetInstances().some(sheet => sheet.gesture)) { this.cancelSheetGesture(); return true; }
      if (this.confirmExit) { this.cancelExit(); return true; }
      if (this.playing || this.audioStarting || this.listeningView) { this.stopPlayback(); return true; }
      if (this.libraryAudio.busy || this.libraryAudio.playing) {this.stopLibraryPlayback();return true;}
      if (!this.draft) return false;
      if (this.dirty) this.requestExit(); else this.closeEditor();
      return true;
    },
    goBack() { if (!this.handleBack()) this.$emit("back"); }
  }
};
</script>

<style scoped>
.quartertone-options { margin:10px 0; }
.quartertone-options summary { cursor:pointer; font-weight:600; padding:8px 0; }
.accidental-display-picker { display:flex; flex-direction:column; gap:6px; margin:12px 0; }
.accidental-display-picker small { color:#71888e; font-size:.8rem; }
.accidental-flags,.glissando-controls {display:flex;flex-wrap:wrap;gap:7px;margin:10px 0;}.accidental-flags small {flex-basis:100%;color:#71888e;font-size:.8rem;}.key-scope {display:flex;flex-direction:row;align-items:center;gap:8px;}.key-scope input {width:auto;min-height:20px;}

.workshop { position: relative; min-height: 100vh; color: #243d44; background: #f7f2e9; }
.backdrop { position: fixed; inset: 0; overflow: hidden; pointer-events: none; opacity: .35; }
.shell { position: relative; max-width: 900px; margin: auto; padding: calc(14px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom)); }
button, input, select { box-sizing: border-box; font: inherit; }
button { min-height: 44px; border: 1px solid #d3dddd; border-radius: 12px; padding: 9px 12px; color: #34555f; background: #fffaf4; cursor: pointer; font-weight: 700; }
button:disabled { opacity: .42; cursor: default; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #db722f; outline-offset: 2px; }
.back { min-height: 39px; font-size: 11px; color: #924c29; border-color: #dec9bb; }
.workshop-navigation { display:flex; align-items:center; justify-content:space-between; gap:12px; text-align:left; }
.hero { margin: 12px 0; padding: 18px; border-radius: 22px; background: #ffffffd4; border: 1px solid #ffffff; }
.hero > span { font-size: 10px; letter-spacing: .15em; color: #49747e; font-weight: 800; }
h1 { margin: 4px 0; font-size: 27px; } h2 { margin: 0 0 14px; font-size: 17px; } h3 { margin: 18px 0 9px; font-size: 12px; }
.hero p, .hint, .footnote, .empty { color: #6b8186; font-size: 12px; line-height: 1.5; }
.hero p { margin: 6px 0 0; }
.tool-context { margin:8px 0; font-size:12px; color:#9a512f; line-height:1.5; }
.card { border: 1px solid #dae2df; border-radius: 21px; padding: 17px; background: #ffffffd9; box-shadow: 0 9px 22px #5443310b; }
.primary { border: none; background: linear-gradient(135deg, #ee7138, #d55022); color: white; }
.secondary { background: #edf5f5; border-color: #c4d9dc; }
.new-piece { width: 100%; margin: 5px 0 17px; min-height: 52px; }
.library > h2 { margin-left:4px; }
.library > .empty { padding:18px; border:1px solid #dae2df; border-radius:18px; background:#ffffffd9; }
.piece-entry { position:relative; margin-top:12px; border:1px solid var(--piece-border); border-radius:18px; background:linear-gradient(135deg,var(--piece-tint),#fffffff2 70%); box-shadow:inset 5px 0 0 var(--piece-accent),0 5px 14px #5443310a; transition:border-color .18s ease; }
/* Colors belong to visible list positions, so deleting or adding music keeps the palette order. */
.piece-color-0 { --piece-accent:#e76530; --piece-icon-color:#d85624; --piece-active:#b64b20; --piece-panel:#fff0e8cc; --piece-soft:#fff0e8; --piece-tint:#fff8f3; --piece-border:#f1d5c7; }
.piece-color-1 { --piece-accent:#2d6e7b; --piece-icon-color:#286a77; --piece-active:#286a77; --piece-panel:#dfeff1cc; --piece-soft:#dfeff1; --piece-tint:#f3f9f9; --piece-border:#cadfe2; }
.piece-color-2 { --piece-accent:#d7942f; --piece-icon-color:#a66a17; --piece-active:#986218; --piece-panel:#faecd3cc; --piece-soft:#faecd3; --piece-tint:#fffbf3; --piece-border:#ecdcc2; }
.piece-color-3 { --piece-accent:#8066a2; --piece-icon-color:#725895; --piece-active:#725895; --piece-panel:#ede7f4cc; --piece-soft:#ede7f4; --piece-tint:#faf7fd; --piece-border:#dfd5ea; }
.piece-color-4 { --piece-accent:#a18c74; --piece-icon-color:#6b5b4c; --piece-active:#6b5b4c; --piece-panel:#ece2d6cc; --piece-soft:#ece2d6; --piece-tint:#faf7f3; --piece-border:#e1d7ca; }
.piece-entry.is-expanded { border-color:var(--piece-accent); }
.piece-summary { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; padding:8px; }
.piece-heading { min-width:0; margin:0; font-size:16px; line-height:1.4; }
.piece-summary-tools { display:flex; gap:5px; align-items:center; padding-right:4px; }
.piece-disclosure { display:flex; align-items:center; gap:12px; width:100%; min-height:76px; padding:10px; border:0; border-radius:12px; background:transparent; text-align:left; font-size:inherit; line-height:inherit; color:inherit; transition:background .18s ease; }
.piece-disclosure:hover:not(:disabled), .piece-disclosure:focus-visible { background:var(--piece-soft); }
.piece-identity { display:flex; flex:1; min-width:0; flex-direction:column; gap:3px; }
.piece-title { overflow-wrap:anywhere; }
.piece-composer, .piece-metadata { font-size:11px; line-height:1.5; font-weight:400; color:#607b81; overflow-wrap:anywhere; }
.piece-chevron { display:flex; flex:0 0 32px; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; color:var(--piece-icon-color); background:var(--piece-soft); }
.piece-chevron svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; transition:transform .18s ease; }
.piece-disclosure[aria-expanded="true"] .piece-chevron { background:var(--piece-accent); color:#fff; }
.piece-disclosure[aria-expanded="true"] .piece-chevron svg { transform:rotate(180deg); }
.piece-content { padding:16px; border-top:1px solid var(--piece-border); }
.piece-content .piece-preview-block { margin-top:0; }
.piece-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
.piece-actions button { font-size:12px; padding:9px 7px; }
.saved-piece-actions { display:flex; flex-wrap:wrap; }
.saved-piece-actions button { flex:1 1 120px; min-width:0; overflow-wrap:anywhere; }
.saved-piece-actions .export-piece { flex-basis:100%; }
.delete-piece { color:#aa432d; border-color:#e5c8bf; }
.delete-title { font-weight:700; overflow-wrap:anywhere; }
.import-actions { display:grid; grid-template-columns:1fr; gap:8px; margin-bottom:17px; }
.import-actions button { font-size:12px; }
.library-notice { font-size:13px; color:#347667; }
.piece-icon { display:flex; flex:0 0 38px; align-items:center; justify-content:center; width:38px; height:46px; border-radius:11px; color:var(--piece-icon-color); background:var(--piece-soft); font-size:26px; }
.piece-preview-block { margin-top:12px; border:1px solid #d3dddd; border-radius:12px; overflow:hidden; background:#fffefa; }
.piece-preview { position:relative; display:block; width:100%; padding:0; border:0; border-radius:0; overflow:hidden; background:#fffefa; text-align:left; }
.library-preview-control { position:absolute; top:10px; right:10px; padding:6px 9px; border-radius:8px; background:#f1f6f4; color:#34555f; font-size:11px; }
.piece-preview.is-listening .library-preview-control { background:#2d7e89; color:#fff; }
.practice-controls { display:grid; grid-template-columns:minmax(48px,1fr) minmax(100px,2fr) minmax(48px,1fr); gap:6px; padding:8px; background:var(--piece-panel); }
.practice-hand { display:flex; justify-content:center; align-items:center; gap:8px; }
.piece-entry .practice-hand { color:var(--piece-active); background:var(--piece-tint); border-color:var(--piece-border); }
.piece-entry .practice-hand.selected { color:#fff; background:var(--piece-active); border-color:var(--piece-active); }
.practice-hand.selected:disabled { opacity:1; }
.practice-paw-icon { width:24px; height:24px; flex:0 0 auto; fill:currentColor; }
.practice-start { color:#fff; background:var(--piece-active); border-color:var(--piece-active); }
.practice-panel {padding:12px;min-width:0;}
.summary-info {width:44px;min-width:44px;height:44px;padding:4px;font-size:24px;color:var(--piece-icon-color);border-color:var(--piece-border);background:var(--piece-soft);}
.footnote { text-align: center; margin: 17px 8px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; }
input, select { min-width: 0; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid #cbdcde; border-radius: 10px; background: #fffefa; color: #23464f; font-size: 15px; }
.settings-row { display: grid; grid-template-columns: 100px 1fr; gap: 15px; align-items: end; margin-top: 12px; }
.fixed-settings { display: flex; flex-direction: column; gap: 5px; padding-bottom: 5px; font-size: 13px; }
.fixed-settings small { color: #70858a; font-size: 11px; }
.revision-select { margin-top: 14px; }
.revision-manager {margin-top:14px;padding:10px;border:1px solid var(--piece-border);border-radius:12px;background:var(--piece-panel);}
.revision-manager summary {min-height:44px;cursor:pointer;font-size:13px;font-weight:700;}
.revision-manager p {font-size:12px;line-height:1.5;}
.revision-choice {display:flex;flex-direction:row;align-items:center;gap:10px;min-height:44px;font-size:12px;}
.revision-choice input {width:18px;height:18px;margin:0;flex:0 0 auto;}
.revision-choice span {display:flex;flex-direction:column;gap:3px;}.revision-choice small {color:#637b7f;font-size:11px;}
.editor-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 13px; }
.save-state { margin: 9px 4px 15px; min-height: 19px; color: #6a8488; font-size: 12px; }
.editor-grid { display: block; }
.score-view-toggle { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0 14px; }
.score-view-toggle button { font-size:12px; }
.notation-settings { margin:12px 0; border:1px solid #d5e1dc; border-radius:12px; padding:10px; }
.notation-settings summary,.expression-tools summary { cursor:pointer; font-size:12px; min-height:30px; color:#526e74; }
.notation-settings label,.expression-tools label { margin-top:9px; }
.repeat-controls,.slur-controls,.triplet-controls { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
.repeat-controls button,.slur-controls button,.triplet-controls button { font-size:11px; padding:6px; min-height:40px; }
.voice-picker { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; margin-top:10px; }
.voice-picker button { padding:6px 2px; font-size:10px; }
.voice-hint,.notation-hint { color:#637b7f; font-size:10px; line-height:1.5; margin:7px 0; }
.dynamic-picker { margin:10px 0; }.dynamic-picker select { font-size:12px; }
.dynamic-picker button { font-size:10px; min-height:36px; }
.expression-tools { border-top:1px solid #d5e1dc; margin-top:10px; padding-top:9px; }
.articulation-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; }
.articulation-controls button { font-size:10px; padding:5px; }
.piece-settings summary { cursor: pointer; font-size: 14px; font-weight: 700; text-align: left; overflow-wrap: anywhere; }
.piece-settings summary small { display: block; margin: 5px 0 0 16px; font-size: 11px; color: #71878a; font-weight: 400; }
.piece-settings[open] summary { margin-bottom: 15px; }
.sheet-hint { margin: 12px 0; color: #71848a; font-size: 11px; line-height: 1.5; }
.toolbox { border-top: 1px solid #e0e6df; padding-top: 12px; max-width: 570px; margin: auto; }
.toolbox .durations { margin-top: 8px; }
.keyboard-insertion { margin-top:12px; border-top:1px solid #e0e6df; padding-top:8px; }
.keyboard-insertion summary { cursor:pointer; min-height:44px; display:flex; align-items:center; }
.keyboard-insertion-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.keyboard-insertion form > button { width:100%; margin-top:10px; }
.keyboard-insertion .hint { line-height:1.5; }
.keyboard-insertion-fields label { min-width:0; }
.alter-picker { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.placement-alter { grid-template-columns:repeat(3,minmax(0,1fr)); }
.key-placement-hint { color:#637b7f; font-size:10px; line-height:1.5; margin:7px 0 0; }
.alter-picker button { min-height: 38px; padding: 5px; font-size: 10px; }
.selection-toolbar { display: flex; align-items: center; gap: 7px; max-width: 570px; margin: 12px auto 0; }
.selection-toolbar > button { min-height: 38px; padding: 6px 9px; font-size: 11px; }
.selection-units { display: grid; grid-template-columns: 1fr 1fr; flex: 1; gap: 5px; min-width: 0; }.selection-units button { min-height: 38px; padding: 5px; font-size: 11px; }
.selection-panel { box-sizing: border-box; max-width: 570px; min-height: 176px; margin: 10px auto 0; padding: 10px; border: 1px solid #dae4df; border-radius: 12px; background: #eef4f2; }
.selection-tools { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1.15fr); align-items: center; gap: 7px; min-height: 58px; }
.selection-tools strong { color: #bd5a2f; font-size: 13px; }.selection-tools button { min-height: 52px; padding: 6px; color: #a65232; font-size: 11px; line-height: 1.4; }
.selection-identity { min-width: 0; text-align: left; overflow-wrap: anywhere; }.selection-tools small { display: block; margin-bottom: 5px; font-size: 9px; color: #6b8588; }.selection-tools strong { display: block; }
.selection-alter { margin: 8px 0 0; }
.beam-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }.beam-controls button { min-height: 38px; padding: 6px; font-size: 11px; }
.tie-controls { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
.tie-controls button { min-height:40px; font-size:11px; padding:6px; }
.tie-hint,.dot-hint { margin:7px 0 0; color:#637b7f; font-size:10px; line-height:1.5; }
.tie-target { text-align:left; font-size:12px; line-height:1.5; }
.tie-target strong { color:#a65232; }.tie-target p { font-size:11px; }.tie-target button { width:100%; font-size:11px; }
.dot-toggle { margin-top:8px; width:100%; min-height:40px; font-size:12px; }
.beam-hint { margin: 7px 0 0; color: #637b7f; font-size: 10px; line-height: 1.5; text-align: left; }
.chord-tones,.chord-alternatives { margin: 7px 0 0; font-size: 10px; line-height: 1.5; text-align: left; color: #526e74; overflow-wrap: anywhere; }
.auto-value-hint { margin: 5px 0 8px; color: #637b7f; font-size: 11px; line-height: 1.5; }
.bar-options { border-top: 1px solid #e0e6df; margin-top: 15px; padding-top: 12px; }
.bar-options summary { cursor: pointer; min-height: 32px; font-size: 12px; color: #526e74; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 13px; }
.section-heading h2 { margin: 0; }.bar-count { color: #6e878c; font-size: 12px; font-weight: 400; }
.undo-controls { display: flex; gap: 5px; }.undo-controls button { width: 42px; padding: 4px; font-size: 23px; }
.undo-controls .history-toggle { width:auto; padding:6px 9px; font-size:11px; }
.history-panel { border:1px solid #d4e2df; border-radius:13px; background:#f1f6f3; padding:12px; margin-bottom:14px; }
.history-panel h3 { margin:0; font-size:13px; }
.history-hint,.history-limit { color:#617c81; font-size:10px; line-height:1.5; margin:7px 0; }
.history-limit { margin-bottom:0; }
.history-list { position:relative; list-style:none; padding:2px; margin:10px 0 0; max-height:260px; overflow-y:auto; scrollbar-width:thin; }
.history-list li + li { margin-top:5px; }
.history-list button { display:flex; align-items:center; gap:8px; width:100%; min-height:44px; padding:8px; text-align:left; font-size:11px; }
.history-list button.current { color:#fff; background:#2e7b88; border-color:#2e7b88; }
.history-list button.future { color:#6d7d81; background:#f7faf8; border-style:dashed; }
.history-number { flex:0 0 19px; font-size:10px; font-weight:400; text-align:center; }
.history-name { flex:1; min-width:0; overflow-wrap:anywhere; line-height:1.4; }
.history-list small { flex:0 0 auto; font-size:8px; font-weight:400; }
.bar-tabs { display: flex; gap: 7px; overflow-x: auto; padding: 3px 0 7px; scrollbar-width: thin; }
.bar-tabs button { display: flex; flex: 0 0 64px; flex-direction: column; align-items: center; gap: 4px; }.bar-tabs small { font-size: 10px; font-weight: 400; }
.bar-management { display: grid; grid-template-columns: 70px minmax(0, 1fr) minmax(0, 1fr); gap: 7px; align-items: end; margin-top: 10px; }
.bar-management button { min-height: 44px; padding: 7px 4px; font-size: 11px; }
.add-bar-count { font-size: 10px; }.add-bar-count input { padding: 8px 5px; min-height: 44px; }
.bar-management-hint { margin: 8px 0 0; color: #6e878c; font-size: 11px; line-height: 1.5; }
.bar-jump { display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 12px; }
.bar-jump input { width: 72px; min-height: 40px; margin: 0; padding: 6px; }.bar-jump span { color: #6e878c; }
.listen-bar { width: 100%; margin-top: 12px; font-size: 12px; }
.staff-controls { margin:12px auto 0; max-width:570px; }.staff-controls > button { width:100%; font-size:12px; }
.staff-controls > button + button { margin-top:7px; }
.staff-controls p { margin:7px 0 0; color:#617c81; font-size:10px; line-height:1.5; }
.score-staves { position:relative; width:100%; margin:10px auto 0; }.staff-row { min-width:0; }
.score-staves .workshop-staff { max-width:none; }
.score-staves.is-panning { touch-action:pan-x pan-y; cursor:grab; }
.score-staves.is-panning .staff-row { pointer-events:none; }
.paired .staff-row { border:1px solid #dae4df; border-radius:15px; padding:5px; background:#fffdfa; }
.paired .staff-row + .staff-row { margin-top:9px; }
.paired .staff-row.editing { border-color:#2e7b88; box-shadow:0 0 0 1px #2e7b88; }
.staff-label { position:sticky; left:6px; display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; width:100%; max-width:calc(var(--workshop-zoom-viewport-width,100vw) - 14px); min-height:44px; border:0; background:transparent; padding:7px; text-align:left; font-size:11px; }
.staff-label span { color:#6e878c; font-weight:400; }.staff-label small { margin-left:auto; color:#2e7b88; font-size:9px; }
.context-staff { color:#2e7b88; font-weight:700; }
button.selected { background: #2e7b88; color: white; border-color: #2e7b88; }
button.sounding { outline: 3px solid #dc743e; outline-offset: -3px; }
.score-title { display: flex; justify-content: space-between; gap: 8px; margin: 20px 0 0; font-size: 12px; }.score-title span { color: #6e878c; }
.bar-tools { display: flex; gap: 8px; align-items: end; margin-top: 18px; }.bar-tools label { flex: 1; }
.bar-move { display: flex; gap: 8px; margin-top: 10px; }.bar-move button { flex: 1; font-size: 11px; }
.toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }.toggle button { display: flex; align-items: center; justify-content: center; gap: 6px; }.durations { display: grid; grid-template-columns: repeat(auto-fit, minmax(62px, 1fr)); gap: 5px; }
.durations button { display: flex; flex-direction: column; gap: 5px; align-items: center; padding: 9px 2px; font-size: 9px; }.durations strong { font-size: 26px; font-weight: 400; }
.durations button span { max-width: 100%; overflow-wrap: anywhere; }
.error { color: #ae4f36; }.notice { padding: 15px; border-radius: 15px; background: #fff2e9; }
.context-dialog { max-height: calc(100vh - 40px); overflow-y: auto; }
.context-choices { display: grid; gap: 7px; }.clef-choices { grid-template-columns: 1fr 1fr; }.meter-choices { grid-template-columns: repeat(3,minmax(0,1fr)); }
.context-choices button { margin: 0; min-width: 0; }.context-choices button.selected { background: #2e7b88; color: white; }
.confirmation-overlay { position: fixed; inset: 0; background: #142d36a6; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 20px; }
.confirmation { max-width: 380px; width: 100%; background: #fffaf3; }.confirmation p { font-size: 13px; line-height: 1.5; }.confirmation button { width: 100%; margin-top: 10px; }.plain { border: none; background: transparent; }
.import-notice { max-height:calc(100vh - 40px); max-height:calc(100dvh - 40px); box-sizing:border-box; overflow:hidden; display:flex; flex-direction:column; }
.import-notice > h2, .import-notice > button { flex-shrink:0; }
#workshop-import-notice-content { min-height:0; overflow-y:auto; }
.import-notice ul { list-style:none; padding:0; text-align:left; font-size:13px; line-height:1.5; }
.import-notice li + li { margin-top:10px; }
.import-symbols { padding:12px; margin:12px 0; background:#fff1df; border:1px solid #e4ba82; border-radius:12px; text-align:left; }
.import-symbols h3 { margin:0 0 10px; font-size:14px; line-height:1.4; }
.import-symbols ul { margin:0; }
.import-symbols code, .import-symbol-location { display:block; font-size:12px; overflow-wrap:anywhere; }
.import-symbols code { margin-top:2px; color:#625340; white-space:normal; }
@media (max-width: 620px) {
  .editor-grid { grid-template-columns:1fr; }
  .shell { padding-left:14px; padding-right:14px; }
  .card { padding:14px; }
  h1 { font-size:24px; }
  .piece-summary { grid-template-columns:minmax(0,1fr); gap:2px; }
  .piece-summary-tools { justify-self:end; padding:0 4px 4px; }
  .piece-disclosure { gap:10px; padding:8px; }
  .piece-icon { flex-basis:34px; width:34px; height:42px; }
  .piece-content { padding:12px; }
}
@media (prefers-reduced-motion: reduce) {
  .piece-entry, .piece-disclosure, .piece-chevron svg { transition:none; }
}
.extra-note-values { margin-top:10px; }.extra-note-values summary { font-size:11px; min-height:30px; cursor:pointer; }.file-input { display:none; }.xml-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }.xml-actions button { flex:1; font-size:12px; }.xml-status { margin:10px 0; font-size:12px; line-height:1.5; }.xml-status ul { padding-left:20px; }

/* The sheet and common note tools stay together; specialist controls are disclosures. */
.editing-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; text-align:left; }
.editing-header .workshop-navigation { flex:0 0 auto; }
.piece-settings { padding:12px 14px; border-radius:14px; }
.piece-settings > summary, .bar-settings > summary { display:flex; align-items:center; flex-wrap:wrap; gap:4px 10px; min-height:32px; list-style:none; }
.piece-settings > summary::-webkit-details-marker, .bar-settings > summary::-webkit-details-marker { display:none; }
.piece-settings > summary::before, .bar-settings > summary::before { content:'▸'; color:#2e7b88; }
.piece-settings[open] > summary::before, .bar-settings[open] > summary::before { content:'▾'; }
.piece-settings > summary > span, .bar-settings > summary > span { flex:1; min-width:100px; font-size:12px; overflow-wrap:anywhere; }
.piece-settings > summary small { flex-basis:100%; margin:0 0 0 20px; }
.bar-settings { margin:9px 0; padding:9px 11px; background:#f3f7f4; border:1px solid #d5e1dc; border-radius:12px; }
.bar-settings > summary { text-align:left; cursor:pointer; font-size:13px; }
.bar-settings > summary small { color:#637b7f; font-size:10px; font-weight:400; }
.bar-settings[open] > summary { padding-bottom:10px; border-bottom:1px solid #d5e1dc; }
.bar-jump { margin-top:6px; }
.bar-jump input { min-height:36px; }
.score-title { margin-top:12px; }
.listen-bar { margin-top:8px; }
.selection-panel { min-height:64px; padding:8px 10px; }
.selection-tools { min-height:44px; }
.selection-tools button { min-height:44px; }
.toolbox { padding-top:10px; border-top:0; }
.toolbox-heading { display:flex; align-items:center; gap:10px; margin:0 0 9px; text-align:left; }
.toolbox-heading h3 { margin:0; font-size:14px; }
.toolbox-heading span { color:#637b7f; font-size:11px; }
.toolbox .durations { grid-template-columns:repeat(5,minmax(0,1fr)); }
.toolbox .durations button {min-height:52px;gap:3px;padding:6px 2px;}
.toolbox .toggle button {font-size:12px;padding:8px;}
.placement-alter { grid-template-columns:repeat(3,minmax(0,1fr)); }
.placement-alter > button:last-child:nth-child(4) { grid-column:1 / -1; min-height:36px; }
.alter-picker button { min-height:44px; }
.note-more { max-width:570px; margin:14px auto 0; padding:0 11px; border:1px solid #d5e1dc; border-radius:12px; background:#f6f8f4; }
.note-more > summary { min-height:44px; display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; font-weight:700; }
.note-more > summary::before { content:'▸'; }
.note-more[open] > summary::before { content:'▾'; }
.note-more > summary::-webkit-details-marker { display:none; }
.note-more[open] { padding-bottom:12px; }
.note-more .rare-alter { grid-template-columns:1fr 1fr; }
.note-more .quarter-alter { grid-template-columns:1fr 1fr; }
.voice-options, .editor-help { margin:12px 0; }
.voice-options > summary, .editor-help > summary, .import-details > summary { min-height:36px; padding:4px 0; cursor:pointer; font-size:12px; }
.xml-status { padding:9px 14px; text-align:left; }
.xml-status p { margin:4px 0; }
.save-state { margin:6px 0 9px; }
.score-view-toggle { margin:8px 0 10px; }

/* Theme editor controls, including child components, without changing score glyphs or feedback. */
.workshop.is-editing /deep/ button:not(.play-line-handle),
.workshop.is-editing /deep/ input:not([type=checkbox]):not([type=range]),
.workshop.is-editing /deep/ select,
.workshop.is-editing /deep/ textarea {
  border-color:var(--piece-border); background:var(--piece-tint); color:var(--piece-active);
}
.workshop.is-editing /deep/ button.selected:not(:disabled),
.workshop.is-editing /deep/ button.current,
.workshop.is-editing /deep/ button.primary,
.workshop.is-editing /deep/ button.play-toggle {
  border-color:var(--piece-active); background:var(--piece-active); color:#fff;
}
.workshop.is-editing /deep/ button:focus-visible,
.workshop.is-editing /deep/ input:focus-visible,
.workshop.is-editing /deep/ select:focus-visible,
.workshop.is-editing /deep/ textarea:focus-visible { outline-color:var(--piece-active); }
.workshop.is-editing /deep/ input[type=range],
.workshop.is-editing /deep/ input[type=checkbox] { accent-color:var(--piece-active); }
.workshop.is-editing .card { border-color:var(--piece-border); background:linear-gradient(135deg,var(--piece-panel),#ffffffd9); }
.workshop.is-editing .bar-settings,
.workshop.is-editing .selection-panel,
.workshop.is-editing .note-more,
.workshop.is-editing .history-panel,
.workshop.is-editing .notation-settings,
.workshop.is-editing /deep/ .editor-zoom,
.workshop.is-editing /deep/ .advanced-notation,
.workshop.is-editing /deep/ .context-changes,
.workshop.is-editing /deep/ .fingering-entry,
.workshop.is-editing /deep/ .flow-circle-selector,
.workshop.is-editing /deep/ .practice-setup {
  border-color:var(--piece-border); background:var(--piece-panel);
}
.workshop.is-editing .paired .staff-row { border-color:var(--piece-border); }
.workshop.is-editing .paired .staff-row.editing { border-color:var(--piece-active); box-shadow:0 0 0 1px var(--piece-active); }
.workshop.is-editing .piece-settings > summary::before,
.workshop.is-editing .bar-settings > summary::before,
.workshop.is-editing .staff-label small,
.workshop.is-editing .context-staff,
.workshop.is-editing .selection-tools strong,
.workshop.is-editing /deep/ .fingering-current,
.workshop.is-editing /deep/ .direction-editing,
.workshop.is-editing /deep/ .context-changes .editing { color:var(--piece-active); }
.workshop.is-editing .expression-tools,
.workshop.is-editing .bar-options,
.workshop.is-editing .bar-settings[open] > summary,
.workshop.is-editing /deep/ .fingering-controls,
.workshop.is-editing /deep/ .lyric-entry,
.workshop.is-editing /deep/ .change-list li { border-color:var(--piece-border); }
.workshop.is-editing /deep/ .minor-node:not(:disabled) { background:var(--piece-soft); }
.workshop.is-editing /deep/ .flow-key-node.selected:not(:disabled) { background:var(--piece-active); color:#fff; }
.workshop.is-editing /deep/ .flow-key-node:disabled { border-color:#2b464d14; background:#ffffff80; color:#52676c75; }
.workshop.is-editing /deep/ button.plain { border-color:transparent; background:transparent; }
.workshop.is-editing /deep/ button.delete-piece { color:#aa432d; border-color:#e5c8bf; }
.workshop.is-editing /deep/ .flow-circle-center { border-color:var(--piece-border); color:var(--piece-active); }
.workshop.is-editing /deep/ .flow-circle-rings::after { border-color:var(--piece-border); }
.workshop.is-editing /deep/ .flow-circle-rings { background:radial-gradient(circle,transparent 0 30%,#ffffffe6 30.5% 46%,transparent 46.5%),repeating-conic-gradient(from -15deg,var(--piece-border) 0 1deg,transparent 1deg 30deg),var(--piece-panel); }
.workshop.is-editing /deep/ .practice-progress progress::-webkit-progress-value { background:var(--piece-active); }
.workshop.is-editing /deep/ .practice-progress progress::-moz-progress-bar { background:var(--piece-active); }
@media (max-width:620px) {
  .editing-header { gap:10px; }
  .bar-settings > summary small { display:none; }
  .composition { padding:12px; }
}
</style>
