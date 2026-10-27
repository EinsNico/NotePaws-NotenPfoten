import { normalizeNoteFlowConfig } from "./NoteFlowStructure";
import { createNoteFlowPrimaryMelody } from "./NoteFlowMelody";
import { createNoteFlowTwoHandMelody } from "./NoteFlowDensity";

export const NOTE_FLOW_GENERATOR_VERSION = 1;

function createPlayableNote(note, voice) {
  return Object.assign({ voice }, note);
}

function createTimeline(cycle) {
  const events = [];
  let noteCount = 0;
  let simultaneousEventCount = 0;

  cycle.blocks.forEach(block => {
    block.positions.forEach(position => {
      const notes = [createPlayableNote(position.primaryNote, "primary")];
      if (position.secondaryNote) {
        notes.push(createPlayableNote(position.secondaryNote, "secondary"));
        simultaneousEventCount += 1;
      }
      noteCount += notes.length;
      events.push({
        id: position.id,
        index: position.globalIndex,
        blockIndex: position.blockIndex,
        positionIndex: position.positionIndex,
        blockRole: block.role,
        phaseRole: position.phaseRole,
        structuralRole: position.structuralRole,
        harmonicFunction: position.harmonicFunction,
        keyId: cycle.tonalityPlan.key.id,
        notes,
        expectedValues: notes.map(note => note.value),
        requiresSimultaneousInput: notes.length > 1
      });
    });
  });

  return {
    version: NOTE_FLOW_GENERATOR_VERSION,
    eventCount: events.length,
    noteCount,
    simultaneousEventCount,
    events
  };
}

function assertCompleteCycle(cycle) {
  const positions = cycle.blocks.reduce(
    (result, block) => result.concat(block.positions),
    []
  );
  if (positions.length !== cycle.positionCount) {
    throw new Error("The generated Note Flow cycle is incomplete.");
  }
  if (positions.some(position => !position.primaryNote)) {
    throw new Error("The generated Note Flow cycle contains an empty primary voice.");
  }
  if (
    cycle.config.handMode === "single"
    && positions.some(position => position.secondaryNote)
  ) {
    throw new Error("A single-hand Note Flow cycle contains a second voice.");
  }
  const ids = positions.map(position => position.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("The generated Note Flow cycle contains duplicate positions.");
  }
}

export function generateNoteFlowCycle(
  input = {},
  cycleIndex = 0,
  previousState = null
) {
  const config = normalizeNoteFlowConfig(input);
  const cycle = config.handMode === "two"
    ? createNoteFlowTwoHandMelody(config, cycleIndex, previousState)
    : createNoteFlowPrimaryMelody(config, cycleIndex, previousState);

  assertCompleteCycle(cycle);
  cycle.generatorVersion = NOTE_FLOW_GENERATOR_VERSION;
  cycle.timeline = createTimeline(cycle);
  return cycle;
}

