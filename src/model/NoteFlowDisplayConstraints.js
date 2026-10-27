// Display decisions only: no score, clock, practice, input or storage mutation.
export const NOTE_FLOW_DISPLAY_INTRINSIC_WIDTH = 320;
// The existing 360px Melody view draws a roughly 296px SVG (scale 0.925).
// A design floor, not an accessibility guarantee: keep the 10-unit staff gap
// >= 9 CSS px rather than fitting by tiny glyphs. Browser review remains needed.
export const NOTE_FLOW_DISPLAY_MIN_SCALE = 0.9;

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// Use normalized menu options, not the notes present in a generated window.
// A piano clef and a bass+treble selection both require two systems even when
// a randomly generated passage currently contains notes on just one system.
export function getNoteFlowConfiguredStaffCount(menuOptions = {}) {
  const options = menuOptions || {};
  const clefs = Array.isArray(options.clef) ? options.clef : [];
  if (options.handMode === "two" || clefs.indexOf("piano") !== -1) return 2;
  return ["bass", "treble"].filter(clef => clefs.indexOf(clef) !== -1).length;
}

export function getNoteFlowInputAvailability(menuOptions = {}) {
  const options = menuOptions || {};
  const staffCount = getNoteFlowConfiguredStaffCount(options);
  const keyboardAvailable = options.handMode === "single" && staffCount === 1;
  const inputAvailable = options.inputMode !== "keyboard" || keyboardAvailable;
  return {
    staffCount,
    keyboardAvailable,
    midiAvailable: true,
    inputAvailable,
    reason: inputAvailable ? null : "keyboard-requires-single-hand-and-staff"
  };
}

/**
 * Fit an unchanged SVG viewBox into measured stage/client dimensions.
 * Insets are TOTAL padding/borders inside that client rectangle. reservedHeight
 * includes measured key/status/input rows and their gaps, excluding the SVG.
 * Keep intrinsicHeight from the real layout; ledger-line ranges can increase it.
 * When it cannot fit, retain the readable minimum size and report fits:false.
 * The caller may offer scrolling while displaying the pre-start/resize warning.
 */
export function fitNoteFlowNotation({
  stageWidth,
  stageHeight,
  intrinsicWidth = NOTE_FLOW_DISPLAY_INTRINSIC_WIDTH,
  intrinsicHeight,
  reservedHeight = 0,
  horizontalInset = 0,
  verticalInset = 0,
  minScale = NOTE_FLOW_DISPLAY_MIN_SCALE
} = {}) {
  const viewWidth = positive(intrinsicWidth);
  const viewHeight = positive(intrinsicHeight);
  const validNotation = viewWidth > 0 && viewHeight > 0;
  const measured = positive(stageWidth) > 0 && positive(stageHeight) > 0
    && [reservedHeight, horizontalInset, verticalInset].every(value => (
      Number.isFinite(value) && value >= 0
    ));
  const insetX = nonNegative(horizontalInset);
  const insetY = nonNegative(verticalInset);
  const reserved = nonNegative(reservedHeight);
  // Callers may ask for larger notation but cannot lower the readability floor.
  const minimumScale = Math.max(NOTE_FLOW_DISPLAY_MIN_SCALE, positive(minScale));
  const availableWidth = Math.max(0, positive(stageWidth) - insetX);
  const availableHeight = Math.max(0, positive(stageHeight) - insetY - reserved);
  const fittingScale = validNotation
    ? Math.min(availableWidth / viewWidth, availableHeight / viewHeight) : 0;
  const scale = Math.max(minimumScale, fittingScale);
  const width = viewWidth * scale;
  const height = viewHeight * scale;
  const widthFits = availableWidth >= viewWidth * minimumScale;
  const heightFits = availableHeight >= viewHeight * minimumScale;
  const fits = measured && validNotation && widthFits && heightFits;
  return {
    width,
    height,
    scale,
    minimumScale,
    availableWidth,
    availableHeight,
    requiredWidth: viewWidth * minimumScale + insetX,
    requiredHeight: viewHeight * minimumScale + insetY + reserved,
    overflowWidth: Math.max(0, width - availableWidth),
    overflowHeight: Math.max(0, height - availableHeight),
    measured,
    fits,
    reason: !validNotation ? "invalid-notation"
      : !measured ? "not-measured"
        : fits ? null : "insufficient-space",
    constrainedBy: fits || !measured || !validNotation ? null
      : !widthFits && !heightFits ? "both" : !widthFits ? "width" : "height"
  };
}

/**
 * Pure pre-start advice: only unavailable keyboard configurations block start;
 * geometry is a warning and retains the caller's existing scrolling fallback.
 * roundStarted stays true through preparation, running
 * and pause/resume; do not derive it solely from the current timer status.
 * MIDI selection remains available. Space checking is a separate decision.
 * Resizing an existing round produces advice only: never reset/end/regenerate.
 */
export function getNoteFlowStartConstraint({
  inputAvailability,
  notation,
  roundStarted = false
} = {}) {
  const inputBlocked = inputAvailability && inputAvailability.inputAvailable === false;
  const reason = inputBlocked ? inputAvailability.reason
    || "keyboard-requires-single-hand-and-staff"
    : notation && notation.fits ? null
      : notation && notation.reason || "not-measured";
  return {
    canStart: Boolean(roundStarted) || !inputBlocked,
    warning: reason !== null && reason !== "not-measured",
    reason,
    preserveRound: Boolean(roundStarted)
  };
}
