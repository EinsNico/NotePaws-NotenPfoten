const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(sourceRoot))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const model=require('../src/model/Workshop'),io=require('../src/model/WorkshopMusicXml'),parser=require('../src/model/WorkshopMusicXmlParser');
const storageModel=require('../src/model/WorkshopStorage'),backup=require('../src/model/SaveDataBackup'),imports=require('../src/model/SaveDataImport');
Module._extensions['.js']=original;
function storage(){const data=new Map();return {get length(){return data.size;},key(index){return Array.from(data.keys())[index]||null;},getItem(key){return data.has(key)?data.get(key):null;},setItem(key,value){data.set(key,String(value));},removeItem(key){data.delete(key);}};}
function withoutNative(source){const root=parser.parseWorkshopMusicXmlDocument(source),misc=parser.musicXmlChild(parser.musicXmlChild(root,'identification'),'miscellaneous'),field=parser.musicXmlChildren(misc,'miscellaneous-field').find(item=>item.attrs.name==='notenpfoten-editor-score-v1');return field?source.slice(0,field.start)+source.slice(field.end):source;}
const metadata={title:'La Candeur (Tenderness), Op. 100 Nr. 1',composer:'Friedrich Burgmüller (1806–1874)',
  copyright:'Das Stück bzw. die zugrunde liegende Mutopia-Vorlage ist im Mutopia Project als „Public Domain“ gekennzeichnet. Die MusicXML-Datei wird von Pianodemy als aus der Mutopia-MIDI-Datei erstellt beschrieben. Dieser Hinweis bezieht sich auf das Stück und die genannte Vorlage, nicht auf die App oder deren Programmcode.',
  license:'Public Domain (gemeinfrei laut Mutopia Project)',sources:[
    {label:'Mutopia Project – La Candeur, Mutopia-ID 202',url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=202'},
    {label:'Pianodemy – Stück- und Dateiquelle',url:'https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/'},
    {label:'MusicXML-Datei',url:'https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/burgmuller-tenderness-op-100-no-1.musicxml'}]};
function score(){return model.setWorkshopMetadata(model.createWorkshopDraft(metadata.title,1).score,metadata);}
async function test(name,run){await run();process.stdout.write('✓ Workshop source metadata: '+name+'\n');}
async function run(){
  await test('optional separated fields keep old scores valid and reject unsafe or excessive links',()=>{
    const old=model.createWorkshopDraft('User piece').score;old.metadata={composer:'A user',copyright:'Own notice'};assert(model.isValidWorkshopScore(old));
    const amended=model.setWorkshopMetadata(old,metadata);assert(model.isValidWorkshopScore(amended));assert.deepStrictEqual(old.metadata,{composer:'A user',copyright:'Own notice'});
    for(const url of ['javascript:alert(1)','data:text/html,unsafe','file:///tmp/score','//example.com','https://user:secret@example.com','https://example.com/\nunsafe','https://','https://example.com/'+ 'x'.repeat(2048)]) {
      assert.strictEqual(model.isValidWorkshopSourceUrl(url),false,url);assert.strictEqual(model.setWorkshopMetadata(old,{sources:[{label:'Unsafe',url}]}),null);
    }
    assert(model.isValidWorkshopSourceUrl('https://example.com/a?b=1&c=2#score'));assert(model.isValidWorkshopSourceUrl('http://example.com/'));
    assert.strictEqual(model.setWorkshopMetadata(old,{sources:Array.from({length:17},()=>({label:'More',url:'https://example.com/'}))}),null);
    assert.strictEqual(model.setWorkshopMetadata(old,{sources:[{label:'x'.repeat(257),url:'https://example.com/'}]}),null);
    assert.strictEqual(model.setWorkshopMetadata(old,{sources:[{label:'More',url:'https://example.com/',extra:true}]}),null);
    assert.strictEqual(model.setWorkshopMetadata(old,{license:'x'.repeat(2049)}),null);
  });
  await test('saving, renaming and reopening retain every metadata field without overwriting a user piece',()=>{
    const store=storage(),user=model.createWorkshopDraft('Existing user piece',1);user.score.metadata={copyright:'User rights',sources:[{label:'User source',url:'https://example.com/user'}]};
    const before=storageModel.storeWorkshopDraft(user,store),savedUser=JSON.stringify(before.piece);
    const demo=model.createWorkshopDraft(metadata.title,1);demo.score=score();const saved=storageModel.storeWorkshopDraft(demo,store);
    let reopened=model.openWorkshopPiece(storageModel.readWorkshopLibrary(store).pieces.find(piece=>piece.id===saved.piece.id));assert.strictEqual(reopened.title,metadata.title);assert.deepStrictEqual(reopened.score.metadata,metadata);
    reopened.title='My editable demo';reopened.score=model.setWorkshopMetadata(reopened.score,Object.assign({},reopened.score.metadata,{title:reopened.title,composer:'My credit',license:'My amended status'}));
    const edited=storageModel.storeWorkshopDraft(reopened,store),again=model.openWorkshopPiece(storageModel.readWorkshopLibrary(store).pieces.find(piece=>piece.id===edited.piece.id));
    assert.strictEqual(again.title,'My editable demo');assert.strictEqual(again.score.metadata.composer,'My credit');assert.strictEqual(again.score.metadata.license,'My amended status');assert.strictEqual(again.score.metadata.copyright,metadata.copyright);assert.deepStrictEqual(again.score.metadata.sources,metadata.sources);
    assert.strictEqual(JSON.stringify(storageModel.readWorkshopLibrary(store).pieces.find(piece=>piece.id===before.piece.id)),savedUser);
    const document=backup.createSaveDataBackup(store,{createdAt:'2026-10-05T08:00:00.000Z'});assert(backup.validateSaveDataBackup(document).valid);const parsed=backup.parseSaveDataBackup(JSON.stringify(document));assert(parsed.valid);
    assert.strictEqual(parsed.backup.data.workshopLibrary,undefined);const target=storage();target.setItem(model.WORKSHOP_STORAGE_KEY,store.getItem(model.WORKSHOP_STORAGE_KEY));imports.importSaveData(target,parsed.backup,'replace');
    const restored=model.openWorkshopPiece(storageModel.readWorkshopLibrary(target).pieces.find(piece=>piece.id===edited.piece.id));assert.deepStrictEqual(restored,again);
  });
  await test('native XML, standard identification fields without native data and MXL retain rights, status and source labels',async()=>{
    const originalScore=score(),xml=io.exportWorkshopMusicXmlText(originalScore,{title:metadata.title}).data;
    assert(xml.includes('<rights>'));assert(xml.includes('<source>'));assert(xml.includes('name="notenpfoten-license"'));assert(!xml.includes('CC0'));assert(!xml.includes('AGPL'));
    assert.deepStrictEqual(io.importWorkshopMusicXmlText(xml).score.metadata,metadata);
    assert.deepStrictEqual(io.importWorkshopMusicXmlText(withoutNative(xml)).score.metadata,metadata);
    const zipped=await io.exportWorkshopMusicXml(originalScore,{title:metadata.title,compressed:true});assert.deepStrictEqual((await io.importWorkshopMusicXml(zipped.data)).score.metadata,metadata);
    const changed=xml.replace('Public Domain (gemeinfrei laut Mutopia Project)','Manually amended source status');
    assert.strictEqual(io.importWorkshopMusicXmlText(changed).score.metadata.license,'Manually amended source status');
  });
  await test('external source text only exposes safe links, and invalid structured metadata cannot create unsafe anchors',()=>{
    const base=withoutNative(io.exportWorkshopMusicXmlText(model.createWorkshopDraft('Source test',1).score).data).replace('<miscellaneous></miscellaneous>','');
    const identification='<source>https://example.com/score\njavascript:alert(1)\nhttps://example.com/score</source><miscellaneous><miscellaneous-field name="notenpfoten-sources-v1">[{"label":"Bad","url":"javascript:alert(1)"}]</miscellaneous-field></miscellaneous>';
    const imported=io.importWorkshopMusicXmlText(base.replace('</identification>',identification+'</identification>'));
    assert.deepStrictEqual(imported.score.metadata.sources,[{label:'',url:'https://example.com/score'}]);assert(imported.warnings.includes('unsupported-notation'));
    const removed=model.setWorkshopMetadata(score(),Object.assign({},metadata,{license:'',sources:[]}));const roundtrip=io.importWorkshopMusicXmlText(withoutNative(io.exportWorkshopMusicXmlText(removed).data));assert.strictEqual(roundtrip.score.metadata.license,'');assert.deepStrictEqual(roundtrip.score.metadata.sources,[]);
  });
  await test('a voice moving between piano staves keeps its rests on the written staff, including split rest values',()=>{
    const source='<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>12</divisions><staves>2</staves><time><beats>6</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>48</duration><voice>2</voice><type>whole</type><staff>2</staff></note></measure><measure number="2"><note><rest/><duration>66</duration><voice>2</voice><staff>1</staff></note></measure></part></score-partwise>';
    const imported=io.importWorkshopMusicXmlText(source),rests=imported.score.parts[1].measures[1].events;
    assert(model.isValidWorkshopScore(imported.score));assert.strictEqual(rests.length,2);assert(rests.every(event=>event.kind==='rest'&&event.displayStaff===0));assert.strictEqual(rests.reduce((sum,event)=>sum+model.workshopEventUnits(event),0),11);
    const native=io.importWorkshopMusicXmlText(io.exportWorkshopMusicXmlText(imported.score,{title:'Cross-staff edited'}).data);assert.deepStrictEqual(native.score.parts[1].measures[1].events,rests);
    const standard=io.importWorkshopMusicXmlText(withoutNative(io.exportWorkshopMusicXmlText(imported.score,{title:'Cross-staff edited'}).data));assert(standard.score.parts[1].measures[1].events.every(event=>event.kind==='rest'&&event.displayStaff===0));
    const invalid=model.cloneWorkshop(imported.score);invalid.parts[1].measures[1].events[0].displayStaff=2;assert.strictEqual(model.isValidWorkshopScore(invalid),false);
  });
}
run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
