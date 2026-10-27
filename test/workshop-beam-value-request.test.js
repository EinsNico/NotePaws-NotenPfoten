const assert=require("assert"),fs=require("fs"),path=require("path"),Module=require("module"),babel=require("babel-core");
const sourceRoot=path.resolve(__dirname,"../src")+path.sep,originalLoader=Module._extensions[".js"];
Module._extensions[".js"]=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{babelrc:false,presets:[["env",{modules:"commonjs"}]]}).code,filename);
};
const model=require("../src/model/Workshop"),editor=require("../src/model/WorkshopScoreEditor");
function note(value,slot) {return {id:model.workshopId("note"),kind:"note",pitch:model.workshopPitchFromValue(value),startSlot:slot,noteValue:"eighth"};}
function joinedMeasure() {
  const notes=[note(48,0),note(52,1),note(55,2)];notes[0].originalNoteValue="whole";
  const measure={events:notes},events=editor.joinWorkshopNotes(measure,notes.map(event => event.id));assert(events);
  return {measure:{events},ids:notes.map(event => event.id),groupId:events[0].beamGroupId};
}
{
  const {measure,ids,groupId}=joinedMeasure(),before=JSON.stringify(measure),first=measure.events.find(event => event.id === ids[0]);
  const changed=Object.assign({},first,{noteValue:"whole"});delete changed.originalNoteValue;
  const events=editor.replaceWorkshopEvents(measure,[changed]);assert(events);
  const selected=events.find(event => event.id === ids[0]);assert.strictEqual(selected.beamGroupId,undefined);
  assert.strictEqual(selected.noteValue,"eighth");assert.strictEqual(selected.originalNoteValue,"whole");
  assert(events.filter(event => ids.slice(1).includes(event.id)).every(event => event.beamGroupId === groupId));
  assert.strictEqual(JSON.stringify(measure),before);assert(model.isValidWorkshopMeasure({events}));
  process.stdout.write("✓ explicit long value detaches only the edited note before automatic shortening\n");
}
{
  const {measure,ids,groupId}=joinedMeasure(),before=JSON.stringify(measure);
  const events=editor.moveWorkshopNote(measure,ids[0],0,model.workshopPitchFromValue(49));assert(events);
  const selected=events.find(event => event.id === ids[0]);assert.strictEqual(selected.beamGroupId,groupId);
  assert.strictEqual(selected.noteValue,"eighth");assert.strictEqual(selected.originalNoteValue,"whole");
  assert(events.filter(event => ids.includes(event.id)).every(event => event.beamGroupId === groupId));
  assert.strictEqual(JSON.stringify(measure),before);assert(model.isValidWorkshopMeasure({events}));
  process.stdout.write("✓ moving a shortened long-value note preserves a still meaningful beam\n");
}
process.stdout.write("Workshop explicit beam-value request tests passed.\n");
