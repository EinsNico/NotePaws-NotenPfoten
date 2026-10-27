import { cloneWorkshop, isValidWorkshopScore, workshopPitchValue, WORKSHOP_MIN_PITCH, WORKSHOP_MAX_PITCH } from './Workshop';
import { repairWorkshopTies } from './WorkshopTies';
import { indexWorkshopExpressionNotes, repairWorkshopSlurs, repairWorkshopGlissandos, repairWorkshopTremolos } from './WorkshopExpression';

function rejected(error = 'invalid-score', detail = {}) {
  return Object.assign({ score:null, error }, detail);
}

// Match the editor's automatic relationship repair before checking the complete
// candidate. A pitch correction may legitimately disconnect an existing tie.
// Keep this pure: rejecting an edit must leave its score and history untouched.
export function validateWorkshopEditCandidate(score) {
  try {
    let candidate = cloneWorkshop(score);
    if (!candidate || !Array.isArray(candidate.parts)) return rejected();
    if (candidate.ties) candidate = repairWorkshopTies(candidate);
    if (candidate.slurs) candidate = repairWorkshopSlurs(candidate);
    if (candidate.glissandos) candidate = repairWorkshopGlissandos(candidate);
    if (candidate.tremolos) candidate = repairWorkshopTremolos(candidate);

    // This shared index applies inherited/in-bar transposition, octave clefs,
    // octave lines and the displayed staff's context, including grace notes.
    // Check it even when the score contains only an octave line and no explicit
    // transpose/clefOctave property.
    const notes = indexWorkshopExpressionNotes(candidate);
    if (!notes) return rejected();
    for (const [eventId, note] of notes) {
      const soundingValue = workshopPitchValue(note.soundingPitch);
      if (!Number.isFinite(soundingValue)) return rejected();
      if (soundingValue < WORKSHOP_MIN_PITCH || soundingValue > WORKSHOP_MAX_PITCH) {
        return rejected('pitch-range', { eventId, partIndex:note.partIndex, barIndex:note.barIndex,
          soundingValue, min:WORKSHOP_MIN_PITCH, max:WORKSHOP_MAX_PITCH });
      }
    }
    return isValidWorkshopScore(candidate) ? { score:candidate, error:null } : rejected();
  } catch (error) {
    return rejected();
  }
}

// Assemble the full score before adopting a locally valid measure edit. Written
// notes alone cannot determine whether their sounding pitch is playable.
export function validateWorkshopEventEdit(score, barIndex, partIndex, events) {
  if (!score || !Array.isArray(score.parts) || !Number.isInteger(barIndex) || barIndex < 0
    || !Number.isInteger(partIndex) || partIndex < 0 || !score.parts[partIndex]
    || !Array.isArray(score.parts[partIndex].measures) || !score.parts[partIndex].measures[barIndex]
    || !Array.isArray(events)) return rejected();
  try {
    const part = Object.assign({},score.parts[partIndex], { measures:score.parts[partIndex].measures.slice() });
    part.measures[barIndex] = Object.assign({},part.measures[barIndex], { events });
    const candidate = Object.assign({},score, { parts:score.parts.slice() });
    candidate.parts[partIndex] = part;
    return validateWorkshopEditCandidate(candidate);
  } catch (error) {
    return rejected();
  }
}
