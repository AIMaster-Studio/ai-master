const { test }=require('node:test');
const assert=require('node:assert/strict');
const {createRemoteEmbedder}=require('../server/rag/embedder');
const {evaluate}=require('../scripts/evaluate-evidence');
const config={baseUrl:'https://example.com/v1',model:'test'};
const provider=rows=>async()=>({ok:true,json:async()=>({data:rows})});
test('remote embeddings respect provider index rather than response order',async()=>{
 const e=createRemoteEmbedder(config,provider([{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]));
 const v=await e.embed(['first','second']);assert.deepEqual([...v[0]],[1,0]);assert.deepEqual([...v[1]],[0,1]);
});
test('embedding validation rejects mixed dimensions, zero vectors, nonfinite numbers and duplicate indices',async()=>{
 for(const rows of [[{embedding:[1,0]},{embedding:[1]}],[{embedding:[0,0]}],[{embedding:[NaN,1]}],[{embedding:['1',0]}],[{index:0,embedding:[1,0]},{index:0,embedding:[1,0]}]]) {
  const e=createRemoteEmbedder(config,provider(rows));await assert.rejects(e.embed(rows.map(()=> 'x')));
 }
});
const metadata={model:'test',promptVersion:'test',datasetVersion:'unit-fixtures',commit:'test'};
test('evaluation refuses missing evidence and unadjudicated disagreement',()=>{
 assert.throws(()=>evaluate({kind:'review',metadata,rows:[]}),/no real/);
 assert.throws(()=>evaluate({kind:'review',metadata,rows:[{id:'1',latencyMs:1,accepted:true,raterA:true,raterB:false}]}),/disagreement/);
});
test('review evaluation computes false positives without replacing undefined metrics by zero',()=>{
 const r=evaluate({kind:'review',metadata,rows:[{id:'1',latencyMs:20,accepted:true,raterA:false,raterB:false}]});
 assert.equal(r.falsePositiveRate,1);assert.equal(r.recall,null);assert.equal(r.exploratory,true);assert.equal(r.fp,1);
});
test('retrieval recall counts relevant documents rather than hits alone',()=>{
 const r=evaluate({kind:'retrieval',metadata,rows:[{id:'1',latencyMs:10,relevant:['a','b'],ranked:['x','a','b']}]});
 assert.equal(r.recallAt1,0);assert.equal(r.recallAt3,1);assert.equal(r.mrr,.5);assert.equal(r.wrongTop1Rate,1);
});
