const test = require('node:test');
const assert = require('node:assert/strict');
test('configuration rejects missing, unsafe endpoints and same normalized models',async()=>{
  const {readModelConfigs} = await import('../scripts/mind-canvas/provider.mjs');
  const env={}; for(const role of ['GENERATOR','REVIEWER']){env['MIND_CANVAS_'+role+'_BASE_URL']='https://example.test/v1';env['MIND_CANVAS_'+role+'_MODEL']=role;env['MIND_CANVAS_'+role+'_API_KEY']='SECRET';}
  assert.throws(()=>readModelConfigs({}),/CONFIG/);
  assert.ok(readModelConfigs(env).generator);
  assert.throws(()=>readModelConfigs({...env,MIND_CANVAS_REVIEWER_MODEL:' generator '}),/SAME_MODEL/);
  assert.throws(()=>readModelConfigs({...env,MIND_CANVAS_REVIEWER_BASE_URL:'http://public.test'}),/URL/);
});
test('request retries only network, 429, 5xx and never exposes secrets or upstream body',async()=>{
  const {requestJson} = await import('../scripts/mind-canvas/provider.mjs');
  const cfg={baseUrl:'https://example.test/v1',model:'g',apiKey:'SECRET'};
  let count=0; const stats={};
  const good=()=>new Response(JSON.stringify({choices:[{message:{content:'[]'}}]}),{status:200});
  const result=await requestJson(cfg,[],undefined,{fetchImpl:async()=>++count===1?new Response('SECRET',{status:503}):good(),stats});
  assert.deepEqual(result,[]);assert.equal(count,2);assert.equal(stats.retries,1);
  for(const [status,expected] of [[401,1],[429,2],[500,2]]){ count=0;await assert.rejects(requestJson(cfg,[],undefined,{fetchImpl:async()=>{count++;return new Response('SECRET',{status});}}),e=>!e.message.includes('SECRET'));assert.equal(count,expected); }
  count=0;await assert.rejects(requestJson(cfg,[],undefined,{fetchImpl:async()=>{count++;return new Response('{bad',{status:200});}}),/INVALID_JSON/);assert.equal(count,1);
  await assert.rejects(requestJson(cfg,[],undefined,{timeoutMs:5,fetchImpl:(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('SECRET'))))}),/TIMEOUT/);
});
test('candidate contexts are bounded, contain full evidence and preserve cross chapter options',async()=>{
  const {selectCandidateContexts,proposeRelations} = await import('../scripts/mind-canvas/provider.mjs');
  const source={id:'1_0',chapter:1,index:0,title:'token',evidenceBlocks:[{id:'b',text:'token original full block'}]};
  const pool=[source,...Array.from({length:10},(_,i)=>({id:`${i<7?1:2}_${i+1}`,chapter:i<7?1:2,index:i+1,title:'token',evidenceBlocks:[{id:'b',text:'token target full block'}]}))];
  const selected=selectCandidateContexts(source,pool,[],6);assert.equal(selected.length,6);assert.ok(selected.some(n=>n.chapter===2));
  let prompt=''; await proposeRelations(source,selected,{baseUrl:'https://example.test',model:'g',apiKey:'SECRET'},undefined,{fetchImpl:async(_u,opts)=>{prompt=opts.body;return new Response(JSON.stringify({choices:[{message:{content:'[]'}}]}));},snapshot:'s'});
  assert.match(prompt,/token original full block/);assert.match(prompt,/token target full block/);assert.ok(!prompt.includes('SECRET'));
});
test('generation rejects unsupported quotes and review inspects both original endpoints',async()=>{
  const {proposeRelations,reviewRelation} = await import('../scripts/mind-canvas/provider.mjs');
  const {candidateId} = await import('../scripts/mind-canvas/relations.mjs');
  const nodes=['a','b'].map(id=>({id,title:id,evidenceBlocks:[{id:'block',text:id+' full original paragraph'}]}));
  const cfg={baseUrl:'https://example.test',model:'generator',apiKey:'SECRET'};
  let requests=0;const fetchImpl=async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify([{source:'a',target:'b',type:'related',directed:false,rationale:'Specific relation',evidence:[{nodeId:'a',blockId:'block',quote:'invented quote'},{nodeId:'b',blockId:'block',quote:'b full'}]}])}}]}));};
  await assert.rejects(proposeRelations(nodes[0],[nodes[1]],cfg,undefined,{snapshot:'s',fetchImpl}),/INVALID_EVIDENCE/);assert.equal(requests,1);
  await assert.rejects(proposeRelations(nodes[0],[nodes[1]],cfg,undefined,{snapshot:'s',fetchImpl,contextBudgetChars:10}),/CONTEXT_BUDGET/);assert.equal(requests,1);
  const c={id:'c',source:'a',target:'b',type:'related',directed:false,rationale:'Specific relation',evidence:nodes.map(n=>({nodeId:n.id,blockId:'block',quote:n.id+' full'})),sourceSnapshot:'s',generator:'generator',generatedAt:'2026-09-27T00:00:00Z'};
  c.id=candidateId(c,'s');
  let prompt='';const r=await reviewRelation(c,nodes,{...cfg,model:'reviewer'},undefined,{fetchImpl:async(_u,opts)=>{prompt=opts.body;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({decision:'uncertain',explanation:'Not enough causal support',evidenceSupported:true,relationSupported:false})}}]}));}});
  assert.match(prompt,/a full original paragraph/);assert.match(prompt,/b full original paragraph/);assert.equal(r.decision,'uncertain');assert.equal(r.model,'reviewer');
});
