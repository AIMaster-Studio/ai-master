const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('canonical 57 identities retain complete original evidence and exact destinations', async () => {
  const { loadSourceCatalogue, resolveLessonHref } = await import('../scripts/mind-canvas/sources.mjs');
  const first = await loadSourceCatalogue(process.cwd());
  const second = await loadSourceCatalogue(process.cwd());
  assert.equal(first.nodes.length, 57);
  assert.equal(new Set(first.nodes.map(n => n.id)).size, 57);
  assert.equal(first.snapshot, second.snapshot);
  const by = Object.fromEntries(first.nodes.map(n => [n.id, n]));
  for (const [id, href] of Object.entries({'5_4':'/knowledge/3-5/','9_1':'/knowledge/6-2/','4_5':'/chapter/4/#kp-6','2_0':'/chapter/2/#kp-1'})) assert.equal(by[id].href, href);
  for (const n of first.nodes) {
    const chapter = JSON.parse(fs.readFileSync(n.sourceFile));
    assert.equal(n.title, chapter.knowledge_points[n.index].title);
    assert.equal(n.chapterTitle, chapter.title);
    assert.ok(n.evidenceBlocks.length > 2);
    assert.ok(n.evidenceBlocks.every(b => b.text.length && /^[a-f0-9]{64}$/.test(b.hash)));
    assert.ok(fs.existsSync('frontend' + n.href.split('#')[0] + 'index.html'));
  }
  assert.match(by['1_0'].summary, /^大语言模型/);
  assert.equal(by['2_0'].index, 0);
  assert.equal(by['2_0'].title, 'Transformer 整体架构');
  assert.throws(() => resolveLessonHref(process.cwd(), 1, 99), /INDEX/);
});
test('CLI catalogue is stable and untrusted or stale imports never overwrite public output',async()=>{
  const {runBuild} = await import('../scripts/build_mind_canvas.mjs');
  const os=require('node:os'),path=require('node:path');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mind-canvas-'));
  try {
    fs.mkdirSync(path.join(temp,'frontend/data'),{recursive:true});fs.mkdirSync(path.join(temp,'frontend/ai-learning'),{recursive:true});
    for(const file of fs.readdirSync('frontend/data').filter(f=>/^chapter_\d+\.json$/.test(f)||['knowledge-universe.json','knowledge-cognitive-map.json'].includes(f)))fs.copyFileSync('frontend/data/'+file,path.join(temp,'frontend/data',file));
    fs.copyFileSync('frontend/ai-learning/data.js',path.join(temp,'frontend/ai-learning/data.js'));
    await runBuild({root:temp,stage:'catalogue'});
    const publicPath=path.join(temp,'frontend/data/mind-canvas.json');const initial=fs.readFileSync(publicPath,'utf8');const graph=JSON.parse(initial);
    assert.equal(graph.nodes.length,57);assert.deepEqual(graph.edges,[]);assert.equal(graph.reviewState,'not-run');assert.ok(!initial.includes('evidenceBlocks'));
    await runBuild({root:temp,stage:'publish'});assert.equal(fs.readFileSync(publicPath,'utf8'),initial);
    const input=path.join(temp,'.local/mind-canvas/fake.json');fs.writeFileSync(input,JSON.stringify({execution:'fixture',sourceSnapshot:graph.sourceSnapshot,candidates:[],reviews:[]}));
    await assert.rejects(runBuild({root:temp,stage:'publish',importAgentBatch:input}),/INVALID_AGENT_BATCH/);assert.equal(fs.readFileSync(publicPath,'utf8'),initial);
    await assert.rejects(runBuild({root:temp,stage:'review',env:{}}),/CONFIG/);assert.ok(fs.existsSync(path.join(temp,'.local/mind-canvas/catalogue.json')));
    assert.equal(fs.readdirSync(path.dirname(publicPath)).some(n=>n.includes('.tmp-')),false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
