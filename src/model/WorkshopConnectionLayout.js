// Shared paths for within-staff and cross-staff connections.
export function workshopGlissandoPath(x1,y1,x2,y2,type='glissando',notationScale=1) {
  if (![x1,y1,x2,y2].every(Number.isFinite) || x2 <= x1) return '';
  if (type === 'slide') return `M ${x1} ${y1} L ${x2} ${y2}`;
  const dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy),segments=Math.max(2,Math.ceil(length/(5*notationScale)));
  let path=`M ${x1} ${y1}`;
  for (let index=1;index<segments;index++) {
    const progress=index/segments,offset=(index%2 ? 2.5 : -2.5)*notationScale;
    path+=` L ${x1+dx*progress-dy/length*offset} ${y1+dy*progress+dx/length*offset}`;
  }
  return path+` L ${x2} ${y2}`;
}

export function workshopTremoloConnectionPath(x1,y1,x2,y2,marks=3,notationScale=1) {
  if (![x1,y1,x2,y2].every(Number.isFinite) || x2 <= x1) return '';
  const inset=Math.min(6*notationScale,(x2-x1)/4),rise=(y2-y1)*inset/(x2-x1);
  return Array.from({length:Math.max(1,Math.min(4,marks))},(_,index) => {
    const top=y1+rise+index*6*notationScale,bottom=y2-rise+index*6*notationScale;
    return `M ${x1+inset} ${top} L ${x2-inset} ${bottom} V ${bottom+3*notationScale} L ${x1+inset} ${top+3*notationScale} Z`;
  }).join(' ');
}

export function layoutWorkshopCrossStaffConnections(events,glissandos=[],tremolos=[]) {
  const notes=new Map(events.filter(event=>event.kind === 'note').map(event=>[event.id,event])),curves=[],relationIds=[];
  function endpoints(edge) {
    const from=notes.get(edge.fromId),to=notes.get(edge.toId);
    return from && to && from.visualStaff !== to.visualStaff && to.x > from.x ? {from,to} : null;
  }
  glissandos.forEach(edge=>{
    const pair=endpoints(edge);if (!pair) return;
    const {from,to}=pair,id='glissando:'+edge.fromId+':'+edge.toId,scale=Math.max(from.notationScale || 1,to.notationScale || 1),inset=Math.min(10*scale,(to.x-from.x)/4);
    const path=workshopGlissandoPath(from.x+inset,from.y,to.x-inset,to.y,edge.type,scale);
    if (!path) return;curves.push({id,kind:'glissando',eventIds:[edge.fromId,edge.toId],path});relationIds.push(id);
  });
  tremolos.forEach(edge=>{
    const pair=endpoints(edge);if (!pair) return;
    const {from,to}=pair,id='tremolo:'+edge.fromId+':'+edge.toId;
    const path=workshopTremoloConnectionPath(from.stemX || from.x,(from.y+from.stemEndY)/2,to.stemX || to.x,(to.y+to.stemEndY)/2,edge.marks,Math.max(from.notationScale || 1,to.notationScale || 1));
    if (!path) return;curves.push({id,kind:'tremolo',eventIds:[edge.fromId,edge.toId],path});relationIds.push(id);
  });
  return {curves,relationIds};
}
