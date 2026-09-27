import {sha256} from './sources.mjs';
export const normalizeModel = model => String(model||'').trim().toLowerCase();
const nonempty = value => typeof value==='string' && value.trim().length>0;
const timestamp = value => nonempty(value) && Number.isFinite(Date.parse(value));
export function relationKey(c) { return JSON.stringify([c.type,c.directed,c.directed?[c.source,c.target]:[c.source,c.target].sort()]); }
export function candidateId(c,snapshot) {
  const evidence=(Array.isArray(c.evidence)?c.evidence:[]).map(e=>({nodeId:e?.nodeId,blockId:e?.blockId,quote:e?.quote})).sort((a,b)=>String(a.nodeId).localeCompare(String(b.nodeId))||String(a.blockId).localeCompare(String(b.blockId))||String(a.quote).localeCompare(String(b.quote)));
  return sha256(JSON.stringify({snapshot,relation:relationKey(c),rationale:c.rationale,evidence}));
}
export function validateCandidate(c,nodes) {
  const errors=[];const by=new Map(nodes.map(n=>[n.id,n]));
  if(!c||!by.has(c.source)||!by.has(c.target)||c.source===c.target) errors.push('ENDPOINTS');
  if(!['related','prerequisite','application','contrast'].includes(c?.type)) errors.push('TYPE');
  if(c?.directed!==['prerequisite','application'].includes(c?.type)) errors.push('DIRECTION');
  for(const key of ['id','rationale','sourceSnapshot','generator']) if(!nonempty(c?.[key])) errors.push(key.toUpperCase());
  if(c&&c.id!==candidateId(c,c.sourceSnapshot))errors.push('CONTENT_ID_MISMATCH');
  if(!timestamp(c?.generatedAt)) errors.push('GENERATED_AT');
  if(!Array.isArray(c?.evidence)||c.evidence.length!==2) errors.push('EVIDENCE');
  else for(const endpoint of [c.source,c.target]){
    const evidence=c.evidence.filter(e=>e?.nodeId===endpoint);const block=by.get(endpoint)?.evidenceBlocks.find(b=>b.id===evidence[0]?.blockId);
    if(evidence.length!==1||!block||!nonempty(evidence[0]?.quote)||!block.text.includes(evidence[0].quote))errors.push('QUOTE');
  }
  return {ok:errors.length===0,errors};
}
export function publishApproved(nodes,candidates,reviews,snapshot) {
  const edges=[];const seen=new Set(); const by=new Map();const conflicts=new Set();
  const candidateRecords=new Map();
  for(const c of candidates){const record=JSON.stringify(c);if(candidateRecords.has(c.id)&&candidateRecords.get(c.id)!==record)conflicts.add(c.id);else candidateRecords.set(c.id,record);}
  for(const r of reviews){if(by.has(r.candidateId))conflicts.add(r.candidateId);else by.set(r.candidateId,r);}
  for(const c of candidates){const r=by.get(c.id);const key=relationKey(c);
    if(!seen.has(key)&&!conflicts.has(c.id)&&validateCandidate(c,nodes).ok&&c.sourceSnapshot===snapshot&&r?.sourceSnapshot===snapshot&&r.decision==='approve'&&r.evidenceSupported===true&&r.relationSupported===true&&nonempty(r.explanation)&&timestamp(r.reviewedAt)&&nonempty(r.model)&&normalizeModel(c.generator)!==normalizeModel(r.model)){
      seen.add(key);
      // Explicit projection prevents raw model responses or configuration leaking through extra fields.
      edges.push({id:c.id,source:c.source,target:c.target,type:c.type,directed:c.directed,rationale:c.rationale,evidence:c.evidence.map(e=>({nodeId:e.nodeId,blockId:e.blockId,quote:e.quote})),sourceSnapshot:c.sourceSnapshot,generator:c.generator,generatedAt:c.generatedAt,status:'ai-reviewed',reviewer:r.model,reviewedAt:r.reviewedAt});
    }
  }
  return {schemaVersion:'1.0.0',sourceSnapshot:snapshot,reviewState:candidates.length===0&&reviews.length===0?'not-run':candidates.length>0&&candidates.every(c=>by.has(c.id)&&!conflicts.has(c.id))?'complete':'partial',nodes:nodes.map(n=>({id:n.id,chapter:n.chapter,index:n.index,curriculumId:n.curriculumId,chapterTitle:n.chapterTitle,title:n.title,summary:n.summary,href:n.href,sourceFile:n.sourceFile,sourceHash:n.sourceHash})),edges:edges.sort((a,b)=>a.id.localeCompare(b.id))};
}
export function validateAgentBatch(batch,nodes,snapshot) {
  const errors=[];
  if(batch?.schemaVersion!=='1.0.0'||batch?.execution!=='codex-agents'||batch?.sourceSnapshot!==snapshot)errors.push('BATCH_PROVENANCE');
  if(normalizeModel(batch?.generator?.model)!=='gpt-6-sol'||normalizeModel(batch?.reviewer?.model)!=='gpt-6-astra')errors.push('MODEL_ROLES');
  if(!nonempty(batch?.generator?.agentId)||!nonempty(batch?.reviewer?.agentId)||batch.generator.agentId===batch.reviewer.agentId) errors.push('AGENT_IDENTITIES');
  if(!Array.isArray(batch?.candidates)||!Array.isArray(batch?.reviews))errors.push('BATCH_RECORDS');
  else {
    const ids=new Set();const counts=new Map();
    for(const c of batch.candidates){counts.set(c.source,(counts.get(c.source)||0)+1);if(ids.has(c.id)||!validateCandidate(c,nodes).ok||c.sourceSnapshot!==snapshot||normalizeModel(c.generator)!==normalizeModel(batch.generator.model))errors.push('CANDIDATE');ids.add(c.id);}
    if(batch.candidates.length>171||[...counts.values()].some(n=>n>3))errors.push('CANDIDATE_LIMIT');
    const reviewed=new Set();
    for(const r of batch.reviews){if(!ids.has(r.candidateId)||reviewed.has(r.candidateId)||r.sourceSnapshot!==snapshot||normalizeModel(r.model)!==normalizeModel(batch.reviewer.model)||!['approve','reject','uncertain'].includes(r.decision)||!timestamp(r.reviewedAt)||!nonempty(r.explanation)||typeof r.evidenceSupported!=='boolean'||typeof r.relationSupported!=='boolean')errors.push('REVIEW');reviewed.add(r.candidateId);}
  }
  return {ok:errors.length===0,errors};
}
