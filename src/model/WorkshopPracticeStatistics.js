// Device-local practice history. Deliberately outside workshopLibrary and the
// registered backup keys, so music exports and backups never contain it.
export const WORKSHOP_PRACTICE_STATISTICS_KEY = 'workshopPracticeStatistics';
export const WORKSHOP_PRACTICE_COUNT_FIELDS = ['correct','early','late','wrong','missed'];

export function emptyWorkshopPracticeStatistics() { return {version:1,pieces:[]}; }
export function emptyWorkshopPracticeCounts() {
  return {correct:0,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:[]};
}
function validKey(key) { return typeof key === 'string' && key.length > 0 && key.length <= 1024; }
function validCounts(value) {
  return value && WORKSHOP_PRACTICE_COUNT_FIELDS.every(field=>Number.isSafeInteger(value[field]) && value[field] >= 0)
    && Array.isArray(value.learnedNoteKeys) && value.learnedNoteKeys.every(validKey)
    && new Set(value.learnedNoteKeys).size === value.learnedNoteKeys.length;
}
function validateStatistics(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.pieces)
    || !data.pieces.every(piece=>validKey(piece.pieceId) && validCounts(piece))
    || new Set(data.pieces.map(piece=>piece.pieceId)).size !== data.pieces.length) throw new Error('invalid-practice-statistics');
  return data;
}
export function readWorkshopPracticeStatistics(storage=localStorage) {
  const raw=storage.getItem(WORKSHOP_PRACTICE_STATISTICS_KEY);
  return raw === null ? emptyWorkshopPracticeStatistics() : validateStatistics(JSON.parse(raw));
}
export function workshopPracticeStatisticsFor(data,pieceId) {
  return data.pieces.find(piece=>piece.pieceId === pieceId) || emptyWorkshopPracticeCounts();
}
export function mergeWorkshopPracticeAssessments(first,second) {
  if (!validCounts(first) || !validCounts(second)) throw new Error('invalid-practice-assessment');
  const result={learnedNoteKeys:Array.from(new Set(first.learnedNoteKeys.concat(second.learnedNoteKeys)))};
  WORKSHOP_PRACTICE_COUNT_FIELDS.forEach(field=>{
    result[field]=first[field]+second[field];
    if (!Number.isSafeInteger(result[field])) throw new Error('practice-count-overflow');
  });
  return result;
}
export function applyWorkshopPracticeAssessment(data,pieceId,assessment) {
  validateStatistics(data);
  if (!validKey(pieceId)) throw new Error('invalid-practice-piece');
  const next=mergeWorkshopPracticeAssessments(workshopPracticeStatisticsFor(data,pieceId),assessment);
  const pieces=data.pieces.filter(piece=>piece.pieceId !== pieceId);
  pieces.push(Object.assign({pieceId},next));
  return {version:1,pieces};
}
function writeStatistics(data,previous,storage) {
  const serialized=JSON.stringify(validateStatistics(data));
  try {
    storage.setItem(WORKSHOP_PRACTICE_STATISTICS_KEY,serialized);
    if (storage.getItem(WORKSHOP_PRACTICE_STATISTICS_KEY) !== serialized) throw new Error('practice-save-verification-failed');
  } catch (error) {
    if (storage.getItem(WORKSHOP_PRACTICE_STATISTICS_KEY) !== previous) {
      if (previous === null) storage.removeItem(WORKSHOP_PRACTICE_STATISTICS_KEY);
      else storage.setItem(WORKSHOP_PRACTICE_STATISTICS_KEY,previous);
    }
    throw error;
  }
}
export function storeWorkshopPracticeAssessments(assessments,storage=localStorage) {
  const previous=storage.getItem(WORKSHOP_PRACTICE_STATISTICS_KEY);
  let data=readWorkshopPracticeStatistics(storage);
  assessments.forEach(item=>{data=applyWorkshopPracticeAssessment(data,item.pieceId,item.assessment);});
  writeStatistics(data,previous,storage);
  return data;
}
export function removeWorkshopPracticeStatistics(pieceId,storage=localStorage) {
  const previous=storage.getItem(WORKSHOP_PRACTICE_STATISTICS_KEY);
  const current=readWorkshopPracticeStatistics(storage);
  const data={version:1,pieces:current.pieces.filter(piece=>piece.pieceId !== pieceId)};
  if (data.pieces.length !== current.pieces.length) writeStatistics(data,previous,storage);
  return data;
}
export function workshopPracticeProgress(statistics,totalNoteKeys) {
  const total=new Set(totalNoteKeys || []);
  if (!total.size) return 0;
  const learned=new Set(statistics.learnedNoteKeys);
  let correct=0;
  total.forEach(key=>{if(learned.has(key))correct++;});
  // Never report a completed piece while any current note is still unlearned.
  return correct === total.size ? 100 : Math.floor(100*correct/total.size);
}
