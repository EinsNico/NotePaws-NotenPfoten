const PREFIX = 'WORKSHOP_PRACTICE_TIP_';
const FIELDS = ['correct','early','late','wrong','missed'];

/** A modest next step for this round, never a diagnosis of the whole piece. */
export function workshopPracticeFeedback(result) {
  const source=result && result.counts;
  if(!source || typeof source!=='object' || Array.isArray(source))return PREFIX+'EMPTY';
  const counts={};
  for(const field of FIELDS) {
    const value=source[field] === undefined ? 0 : source[field];
    if(!Number.isSafeInteger(value) || value<0)return PREFIX+'EMPTY';
    counts[field]=value;
  }
  const entered=counts.correct+counts.early+counts.late+counts.wrong,total=entered+counts.missed;
  if(!Number.isSafeInteger(total) || entered===0)return PREFIX+'EMPTY';
  // Missed targets are useful context, but cannot turn a handful of actual
  // inputs or an interrupted start into a reliable performance pattern.
  if(entered<5)return PREFIX+'SHORT';
  if(counts.wrong>=total*.4 && counts.wrong>=Math.max(counts.correct,counts.early,counts.late,counts.missed))return PREFIX+'PITCH';
  const continuous=result.behavior==='continuous';
  if(!continuous && counts.late>=entered*.2)return PREFIX+'WAIT';
  if(counts.correct>=total*.8)return PREFIX+'GOOD';
  if(continuous && (counts.wrong+counts.missed>=total*.25 || counts.early+counts.late>=total*.6))return PREFIX+'SLOW';
  if(counts.early>=entered*.25 && counts.early>=counts.late*2)return PREFIX+'EARLY';
  if(counts.late>=entered*.25 && counts.late>=counts.early*2)return PREFIX+'LATE';
  return PREFIX+'RHYTHM';
}
