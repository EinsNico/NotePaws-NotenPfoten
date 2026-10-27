export const NOTE_FLOW_CHORD_STRIKE_WINDOW_MS = 650;

export function createNoteFlowChordTraining(plan, options = {}) {
  const chords = plan && Array.isArray(plan.blocks)
    ? plan.blocks.reduce((all, block) => all.concat(block.chords || []), [])
    : [];
  let index = 0;
  let offset = 0;
  let selected = [];
  let mistakes = 0;
  let firstStrikeAt = null;
  const strikeWindowMs = Number.isFinite(options.strikeWindowMs) && options.strikeWindowMs > 0
    ? options.strikeWindowMs : NOTE_FLOW_CHORD_STRIKE_WINDOW_MS;

  function target() {
    return chords[index - offset] || null;
  }

  function requiredValues() {
    const chord = target();
    return chord ? Array.from(new Set(
      Array.isArray(chord.bassValues) && Array.isArray(chord.trebleValues)
        ? chord.values
        : (chord.bassValue == null ? [] : [chord.bassValue]).concat(chord.values)
    )) : [];
  }

  function clearAttempt() {
    selected = [];
    firstStrikeAt = null;
  }

  function expire(now) {
    if (firstStrikeAt === null || !target() || selected.length === requiredValues().length
      || now - firstStrikeAt < strikeWindowMs) return false;
    mistakes += 1;
    clearAttempt();
    return true;
  }

  return {
    state() {
      return { index, total: offset + chords.length, selected: selected.slice(), mistakes,
        strikeDeadline: firstStrikeAt === null ? null : firstStrikeAt + strikeWindowMs,
        target: target(), complete: index >= offset + chords.length };
    },
    press(value, now = Date.now()) {
      if (!Number.isInteger(value) || !target() || selected.length === requiredValues().length) return "ignored";
      if (expire(now)) return "late";
      const required = requiredValues();
      if (required.indexOf(value) === -1) {
        mistakes += 1;
        clearAttempt();
        return "wrong";
      }
      if (selected.indexOf(value) !== -1) return "duplicate";
      if (firstStrikeAt === null) firstStrikeAt = now;
      selected.push(value);
      if (selected.length === required.length) {
        firstStrikeAt = null;
        return "complete";
      }
      return "correct";
    },
    expire,
    cancelAttempt: clearAttempt,
    next() {
      if (!target() || selected.length !== requiredValues().length) return false;
      index += 1;
      clearAttempt();
      return true;
    },
    skip() {
      if (!target()) return false;
      index += 1;
      clearAttempt();
      return true;
    },
    appendChords(additions) {
      if (!Array.isArray(additions) || additions.length === 0) return 0;
      chords.push(...additions);
      return additions.length;
    },
    trimPassed(retainPassed = 1) {
      const removable = Math.max(0, index - offset - Math.max(0, Math.round(retainPassed)));
      chords.splice(0, removable);
      offset += removable;
      return removable;
    }
  };
}
