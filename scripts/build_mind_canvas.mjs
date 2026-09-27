import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadSourceCatalogue,loadSeedPool} from './mind-canvas/sources.mjs';
import {publishApproved,validateAgentBatch,relationKey} from './mind-canvas/relations.mjs';
import {readModelConfigs,selectCandidateContexts,proposeRelations,reviewRelation} from './mind-canvas/provider.mjs';

export async function atomicJson(file,value) {
  await mkdir(path.dirname(file),{recursive:true});const temp=file+`.tmp-${process.pid}-${crypto.randomUUID()}`;
  try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function readOptional(file) {try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function runBuild({root=process.cwd(),stage,importAgentBatch,env=process.env,providerOptions={}}) {
  if(!['catalogue','review','publish'].includes(stage))throw new Error('INVALID_STAGE');
  const catalogue=await loadSourceCatalogue(root);const {nodes,snapshot}=catalogue;
  const privateRoot=path.join(root,'.local/mind-canvas');const auditRoot=path.join(privateRoot,snapshot);const publicFile=path.join(root,'frontend/data/mind-canvas.json');
  await atomicJson(path.join(privateRoot,'catalogue.json'),{...catalogue,sourceSnapshot:snapshot});
  await atomicJson(path.join(auditRoot,'catalogue.json'),{...catalogue,sourceSnapshot:snapshot});
  const seeds=await loadSeedPool(root);await atomicJson(path.join(privateRoot,'seeds.json'),seeds);
  if(stage==='catalogue'){const existing=await readOptional(publicFile);if(existing?.sourceSnapshot===snapshot&&existing?.reviewState!=='not-run')return existing;const graph=publishApproved(nodes,[],[],snapshot);await atomicJson(publicFile,graph);return graph;}
  let candidates=await readOptional(path.join(auditRoot,'candidates.json'))||[];let reviews=await readOptional(path.join(auditRoot,'reviews.json'))||[];
  let metadata=await readOptional(path.join(auditRoot,'run.json'));
  if(stage==='review') {
    const configs=readModelConfigs(env);
    // Calling environments must explicitly confirm different underlying model identities.
    if(env.MIND_CANVAS_MODELS_VERIFIED!=='1')throw new Error('MODEL_IDENTITIES_UNVERIFIED');
    if(metadata&&(metadata.generator!==configs.generator.model||metadata.reviewer!==configs.reviewer.model))throw new Error('RESUME_MODEL_MISMATCH');
    metadata ||= {execution:'http-provider',sourceSnapshot:snapshot,generator:configs.generator.model,reviewer:configs.reviewer.model,generatedNodes:[],failures:[],stats:{requests:0,retries:0}};
    const save=async()=>{await atomicJson(path.join(auditRoot,'candidates.json'),candidates);await atomicJson(path.join(auditRoot,'reviews.json'),reviews);await atomicJson(path.join(auditRoot,'run.json'),metadata);};
    const seen=new Set(candidates.map(relationKey));
    for(const node of nodes){if(metadata.generatedNodes.includes(node.id))continue;
      const seedIds=seeds.filter(s=>s.source===node.id||s.target===node.id).map(s=>s.source===node.id?s.target:s.source);
      const targets=selectCandidateContexts(node,nodes,seedIds);let generated=[];let failed=false;
      // Whole blocks are never cut to meet a budget: split selected target batches instead.
      async function generate(batch){try{return await proposeRelations(node,batch,configs.generator,undefined,{...providerOptions,snapshot,stats:metadata.stats});}catch(e){if(e.message==='CONTEXT_BUDGET'&&batch.length>1){const half=Math.ceil(batch.length/2);return [...await generate(batch.slice(0,half)),...await generate(batch.slice(half))];}throw e;}}
      try{generated=await generate(targets);}catch(e){failed=true;metadata.failures.push({nodeId:node.id,stage:'generate',code:e.message});}
      for(const c of generated.slice(0,3)){if(!seen.has(relationKey(c))){seen.add(relationKey(c));candidates.push(c);}}
      if(!failed)metadata.generatedNodes.push(node.id);
      await save();
    }
    for(const candidate of candidates){if(reviews.some(r=>r.candidateId===candidate.id))continue;try{reviews.push(await reviewRelation(candidate,nodes,configs.reviewer,undefined,{...providerOptions,stats:metadata.stats}));}catch(e){metadata.failures.push({candidateId:candidate.id,stage:'review',code:e.message});}await save();}
    return {sourceSnapshot:snapshot,candidates:candidates.length,reviews:reviews.length,failures:metadata.failures.length,stats:metadata.stats};
  }
  if(importAgentBatch){const batch=JSON.parse(await readFile(path.resolve(root,importAgentBatch),'utf8'));const checked=validateAgentBatch(batch,nodes,snapshot);if(!checked.ok)throw new Error('INVALID_AGENT_BATCH:'+checked.errors.join(','));
    candidates=batch.candidates;reviews=batch.reviews;metadata={execution:batch.execution,sourceSnapshot:snapshot,generator:batch.generator,reviewer:batch.reviewer,importedAt:new Date().toISOString()};
    await atomicJson(path.join(auditRoot,'agent-batch.json'),batch);await atomicJson(path.join(auditRoot,'candidates.json'),candidates);await atomicJson(path.join(auditRoot,'reviews.json'),reviews);await atomicJson(path.join(auditRoot,'run.json'),metadata);
  }
  // Stored loose/mock records alone are not proof of a real reviewed run.
  if((candidates.length||reviews.length)&&(!metadata||metadata.sourceSnapshot!==snapshot||!['codex-agents','http-provider'].includes(metadata.execution)))throw new Error('UNVERIFIED_AUDIT');
  if(metadata?.execution==='codex-agents'){const batch=await readOptional(path.join(auditRoot,'agent-batch.json'));if(!validateAgentBatch(batch,nodes,snapshot).ok)throw new Error('INVALID_AGENT_BATCH');candidates=batch.candidates;reviews=batch.reviews;}
  const latest=await loadSourceCatalogue(root);if(latest.snapshot!==snapshot)throw new Error('SOURCE_CHANGED');
  const graph=publishApproved(nodes,candidates,reviews,snapshot);
  if(metadata?.execution==='http-provider')graph.reviewState=metadata.generatedNodes.length===nodes.length&&candidates.every(c=>reviews.some(r=>r.candidateId===c.id))?'complete':'partial';
  if(metadata?.execution==='codex-agents'&&candidates.length===0)graph.reviewState='complete';
  await atomicJson(publicFile,graph);return graph;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];
  try{const result=await runBuild({stage:option('--stage'),importAgentBatch:args.includes('--import-agent-batch')?option('--import-agent-batch'):undefined});console.log(JSON.stringify({sourceSnapshot:result.sourceSnapshot,nodes:result.nodes?.length,edges:result.edges?.length,reviewState:result.reviewState,stats:result.stats,failures:result.failures}));}catch(e){console.error(e.message);process.exitCode=1;}
}
