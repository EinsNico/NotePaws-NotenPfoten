const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const {importWorkshopMusicXmlText}=require('../src/model/WorkshopMusicXml');
const {workshopBeamStemDirections,layoutWorkshopBeams}=require('../src/model/WorkshopBeamLayout');
const {layoutWorkshopChords}=require('../src/model/WorkshopChordLayout');
const score=importWorkshopMusicXmlText(fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bar-10.musicxml'),'utf8')).score;
const events=score.parts[0].measures[0].events.filter(e=>e.kind==='note');
assert.strictEqual(events.length,14);
const geometry=events.map(e=>Object.assign({},e,{x:100+e.startSlot*25,y:e.pitch.octave===3?160:100}));
const before=JSON.stringify(geometry),directions=workshopBeamStemDirections(geometry);
for(const e of geometry)assert.strictEqual(directions.get(e.id),e.stem==='down'?-1:1);
const rendered=layoutWorkshopBeams(layoutWorkshopChords(geometry,directions));
for(const e of rendered.events.filter(e=>e.kind==='note'))assert.strictEqual(e.stemDirection,e.stem==='down'?-1:1);
assert.strictEqual(JSON.stringify(geometry),before);
// A single explicit direction also controls a group whose other members omit it.
const sparse=geometry.map(e=>Object.assign({},e));
for(const id of new Set(sparse.map(e=>e.beamGroupId))){const notes=sparse.filter(e=>e.beamGroupId===id);notes.slice(1).forEach(e=>delete e.stem);}
const sparseDirections=workshopBeamStemDirections(sparse);
for(const e of geometry)assert.strictEqual(sparseDirections.get(e.id),e.stem==='down'?-1:1);
// With no imported direction the previous voice-based fallback remains available.
const automatic=geometry.map(e=>{const n=Object.assign({},e);delete n.stem;return n;});
const fallback=workshopBeamStemDirections(automatic);
for(const e of automatic)assert.strictEqual(fallback.get(e.id),(e.voice||1)%2===1?1:-1);
console.log('Moonlight bar 10 preserves explicit beam directions in both layout passes; sparse directions and automatic fallback passed.');
