const test = require('node:test');
const assert = require('node:assert/strict');
const nodes = ['a','b'].map(id => ({id, chapter:1,index:0,evidenceBlocks:[{id:'b1',text:'The exact original evidence.',hash:'h'}]}));
function candidate() { return {id:'7535d5a733566a084c66a2706c17f6a6658027218dbc83efa30d95f14aca44af',source:'a',target:'b',type:'related',directed:false,rationale:'The shared mechanism is explicit.',evidence:nodes.map(n=>({nodeId:n.id,blockId:'b1',quote:'exact original evidence'})),sourceSnapshot:'s',generator:'gpt-6-sol',generatedAt:'2026-09-27T00:00:00Z'}; }
function review() { return {candidateId:candidate().id,decision:'approve',explanation:'Supported by both passages.',model:'gpt-6-astra',reviewedAt:'2026-09-27T00:01:00Z',sourceSnapshot:'s',evidenceSupported:true,relationSupported:true}; }
test('only structurally evidenced independently reviewed current-snapshot edges publish', async()=>{
  const {publishApproved,validateCandidate} = await import('../scripts/mind-canvas/relations.mjs');
  assert.equal(validateCandidate(candidate(),nodes).ok,true);
  const graph = publishApproved(nodes,[candidate()],[review()],'s');
  assert.equal(graph.edges.length,1); assert.equal(graph.edges[0].status,'ai-reviewed');
  assert.ok(!('evidenceBlocks' in graph.nodes[0]));
  const tainted=nodes.map(n=>({...n,apiKey:'SECRET',token:'SECRET'}));
  assert.ok(!JSON.stringify(publishApproved(tainted,[candidate()],[review()],'s')).includes('SECRET'));
  assert.equal(publishApproved(nodes,[candidate(),candidate()],[review()],'s').edges.length,1);
  for(const patch of [{decision:'reject'},{decision:'uncertain'},{evidenceSupported:false},{relationSupported:false},{sourceSnapshot:'old'},{model:' GPT-6-SOL '},{reviewedAt:''}]) assert.equal(publishApproved(nodes,[candidate()],[{...review(),...patch}],'s').edges.length,0);
  for(const patch of [{source:'unknown'},{target:'a'},{rationale:''},{rationale:'Tampered reason'},{type:'contrast'},{type:'invented'},{directed:true},{sourceSnapshot:'old'},{evidence:[]},{evidence:[{nodeId:'a',blockId:'b1',quote:'exact original'},candidate().evidence[1]]},{evidence:[{nodeId:'a',blockId:'b1',quote:'fabricated'},candidate().evidence[1]]}]) assert.equal(publishApproved(nodes,[{...candidate(),...patch}],[review()],'s').edges.length,0);
  assert.equal(publishApproved(nodes,[],[],'s').reviewState,'not-run');
  assert.equal(publishApproved(nodes,[candidate()],[],'s').reviewState,'partial');
  assert.equal(publishApproved(nodes,[candidate(),{...candidate(),type:'contrast'}],[review()],'s').edges.length,0);
  assert.equal(publishApproved(nodes,[candidate()],[review(),{...review(),decision:'reject'}],'s').edges.length,0);
});
test('external review import requires real agent provenance, correct model roles and snapshot',async()=>{
  const {validateAgentBatch} = await import('../scripts/mind-canvas/relations.mjs');
  const batch={schemaVersion:'1.0.0',execution:'codex-agents',sourceSnapshot:'s',generator:{model:'gpt-6-sol',agentId:'actual-generator'},reviewer:{model:'gpt-6-astra',agentId:'actual-reviewer'},candidates:[candidate()],reviews:[review()]};
  assert.equal(validateAgentBatch(batch,nodes,'s').ok,true);
  for(const patch of [{execution:'fixture'},{sourceSnapshot:'old'},{reviewer:{model:'gpt-6-sol',agentId:'actual-reviewer'}},{reviewer:{model:'gpt-6-astra',agentId:'actual-generator'}}]) assert.equal(validateAgentBatch({...batch,...patch},nodes,'s').ok,false);
});
