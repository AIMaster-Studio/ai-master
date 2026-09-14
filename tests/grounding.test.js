'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { createApp } = require('../server');
const { retrieveEvidence, validateCitations } = require('../server/grounding');
const { reviewExplanation } = require('../server/ai-review');
const { buildCourseDocuments, stripHtml } = require('../server/rag/course-seed');
const { createRagService } = require('../server/rag');
const core = require('../frontend/static/js/learning-core');
const catalog = require('../frontend/data/learning-curriculum.json');

const explanation = '大模型先把输入文本转成 token，再根据上下文预测后续片段，通过反复预测组成回答。这样的训练让它学习语言模式，但不能保证内容符合真实世界。比如我请它查询学校今年的奖学金截止日期，它可能根据旧资料生成流畅的回答，甚至编造一个日期。因此我会找到学校官方网站的最新通知，核验日期和适用年级；如果没有可靠证据，就说明目前无法确定，避免把幻觉当成已经证实的事实。';
const moduleUnderTest = catalog.modules[0];
const HERMETIC_SECURITY = { allowRemote: false, allowedHosts: [], configToken: '' };

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-ground-'));
}

// 可编程的 mock provider：content 既可以是对象（会被 JSON.stringify），也可以是原始字符串。
function provider(content, ok = true, status = 200) {
  return async () => ({
    ok,
    status,
    json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] })
  });
}
const aiConfig = { baseUrl: 'https://provider.example/v1', model: 'm', apiKey: 'k' };

test('no course knowledge base means no evidence, and that is stated rather than hidden', async () => {
  const rag = createRagService({ dataRoot: tempRoot(), config: () => ({}) });
  const result = await retrieveEvidence({ rag, kbId: null, module: moduleUnderTest, studentText: explanation });
  assert.equal(result.available, false);
  assert.deepEqual(result.evidence, []);
  assert.match(result.reason, /未建立课程知识库/);
});

test('course seeding produces documents drawn from the repo content only', () => {
  const documents = buildCourseDocuments({});
  assert.ok(documents.length > 20, '章节知识点与通关标准都应入库，实际 ' + documents.length);
  assert.ok(documents.some(d => d.source.startsWith('chapter_')), '应包含章节内容');
  assert.ok(documents.some(d => d.source.startsWith('learning-curriculum.json#')), '应包含通关标准');
  assert.ok(documents.every(d => d.text && d.text.trim().length > 0));
  for (const document of documents) assert.ok(document.source.length > 0);
});

test('chapter HTML is stripped so evidence text is prose, not markup', () => {
  // 章节 JSON 的 content 里确实带 HTML；标记混进证据会占用上下文，也会被模型当成正文引用。
  const raw = require('../frontend/data/chapter_01.json');
  assert.ok(raw.knowledge_points.some(p => /<[a-z][^>]*>/i.test(p.content)), '前置：源数据里应有 HTML，否则本用例无意义');

  const documents = buildCourseDocuments({});
  for (const document of documents) {
    assert.equal(/<\/?(p|div|li|h[1-6]|strong|em|ul|ol|br|span|table|tr|td)\b[^>]*>/i.test(document.text), false,
      '证据文本不应残留 HTML 标签：' + document.title);
    assert.equal(document.text.includes('&nbsp;'), false, '不应残留 &nbsp; 实体：' + document.title);
    assert.equal(document.text.includes('&lt;'), false, '实体应已还原：' + document.title);
  }
});

test('stripHtml preserves literal angle brackets written as entities', () => {
  assert.equal(stripHtml('<p>正文</p>'), '正文');
  assert.equal(stripHtml('a<br>b'), 'a\nb');
  assert.equal(stripHtml('<li>一</li><li>二</li>'), '一\n二');
  assert.equal(stripHtml('<script>bad()</script>保留'), '保留');
  assert.equal(stripHtml('&lt;div&gt; 是标签'), '<div> 是标签', '实体还原应在标签剥离之后');
  assert.equal(stripHtml('A &amp; B'), 'A & B');
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml(null), '');
});

test('citation review is a deterministic check, not the model grading itself', () => {
  const evidence = [{ ref: 'E1' }, { ref: 'E2' }];
  assert.deepEqual(validateCitations(['E1'], evidence), { cited: ['E1'], invalid: [], integrity: 'ok', checkedAgainst: 2 });
  assert.deepEqual(validateCitations(['E1', 'E9'], evidence), { cited: ['E1'], invalid: ['E9'], integrity: 'fabricated-reference', checkedAgainst: 2 });
  assert.equal(validateCitations(['E9'], evidence).integrity, 'fabricated-reference');
  assert.equal(validateCitations(undefined, evidence).cited.length, 0);
  assert.equal(validateCitations(['E1', 'E1'], evidence).cited.length, 1, '重复引用应去重');
});

test('a review that invents its own evidence is not allowed to pass', async () => {
  const local = core.screenExplanation(explanation, moduleUnderTest);
  assert.equal(local.eligible, true, '前置：本地规则应放行，才能测到 AI 层');
  const evidence = [{ ref: 'E1', title: 't', source: 's', text: 'x', score: 0.9 }];
  const result = await reviewExplanation(explanation, moduleUnderTest, local, aiConfig, {
    fetchImpl: provider({ score: 95, factualCorrect: true, feedback: '很好', followUp: '追问', citations: ['E7'] }),
    evidence
  });
  assert.equal(result.accepted, false, '引用了不存在的证据编号时不得通关');
  assert.equal(result.evidenceIntegrity, 'fabricated-reference');
  assert.deepEqual(result.invalidCitations, ['E7']);
  assert.match(result.feedback, /不可采信/);
});

test('a review that cites nothing cannot claim to be evidence-grounded', async () => {
  const local = core.screenExplanation(explanation, moduleUnderTest);
  const evidence = [{ ref: 'E1', title: 't', source: 's', text: 'x', score: 0.9 }];
  const result = await reviewExplanation(explanation, moduleUnderTest, local, aiConfig, {
    fetchImpl: provider({ score: 95, factualCorrect: true, feedback: '很好', followUp: '追问' }),
    evidence
  });
  assert.equal(result.accepted, false);
  assert.match(result.feedback, /没有给出任何课程证据引用/);
});

test('a grounded review passes and records which evidence it relied on', async () => {
  const local = core.screenExplanation(explanation, moduleUnderTest);
  const evidence = [
    { ref: 'E1', title: 'token', source: 'chapter_01.json#kp', text: 'token 是分词器单位', score: 0.91 },
    { ref: 'E2', title: '幻觉', source: 'chapter_01.json#kp', text: '流畅不保证正确', score: 0.83 }
  ];
  const result = await reviewExplanation(explanation, moduleUnderTest, local, aiConfig, {
    fetchImpl: provider({ score: 88, factualCorrect: true, feedback: '机制与边界都讲到了。', followUp: '换个场景呢？', citations: ['E2', 'E1'], unsupportedClaims: ['长期记忆机制缺少证据'] }),
    evidence
  });
  assert.equal(result.accepted, true);
  assert.equal(result.grounded, true);
  assert.equal(result.mode, 'ai');
  assert.deepEqual(result.citations, ['E2', 'E1']);
  assert.equal(result.evidenceIntegrity, 'ok');
  assert.deepEqual(result.unsupportedClaims, ['长期记忆机制缺少证据']);
  assert.deepEqual(result.evidence.map(item => item.ref), ['E1', 'E2']);
  const check = result.checks.find(item => item.label === '证据引用复核');
  assert.equal(check.pass, true);
  assert.match(check.detail, /E2、E1/);
  assert.match(check.detail, /1 条结论缺少证据支撑/);
});

test('without evidence the review behaves exactly as before it existed', async () => {
  const local = core.screenExplanation(explanation, moduleUnderTest);
  const result = await reviewExplanation(explanation, moduleUnderTest, local, aiConfig, provider({ score: 91, factualCorrect: true, feedback: 'ok', followUp: 'f' }));
  assert.equal(result.accepted, true, '旧的第五个位置参数（直接传 fetchImpl）必须继续可用');
  assert.equal(result.mode, 'ai');
  assert.equal(result.grounded, false);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.checks.length, local.checks.length + 1, '无证据时不应多出证据复核项');
});

async function start(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ragDataRoot: tempRoot(), ...HERMETIC_SECURITY, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  let cookie = '';
  return async (route, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
}

test('rag endpoints expose honest capability status, and writes are admin-gated', async t => {
  const request = await start(t);
  const status = await request('/api/rag/status');
  assert.equal(status.status, 200);
  assert.ok(status.data.rag.engines.some(engine => engine.id === 'local-index' && engine.status === 'ready'));
  assert.ok(status.data.rag.engines.some(engine => engine.id === 'graphrag' && engine.status === 'not-implemented'));
  assert.ok(status.data.rag.backends.some(backend => backend.id === 'js-cosine' && backend.available === true));
  assert.ok(status.data.rag.formats.unsupported.some(item => item.extension === '.pdf'));
  assert.equal(status.data.courseKbId, null, '尚未灌库时应为 null');

  const exposed = await start(t, { allowRemote: true, configToken: 'secret' });
  assert.equal((await exposed('/api/rag/kb', { name: 'x' })).status, 403, '暴露模式下无令牌不得建库');
  assert.equal((await exposed('/api/rag/kb', { name: 'x' })).status, 403, '令牌错误同样 403');
});

test('seeding the course base then reviewing an explanation produces cited, grounded feedback', async t => {
  const request = await start(t, {
    fetchImpl: provider({ score: 90, factualCorrect: true, feedback: '讲解有依据。', followUp: '换个例子？', citations: ['E1'] })
  });

  const seeded = await request('/api/rag/course/seed', {});
  assert.equal(seeded.status, 200);
  assert.equal(seeded.data.created, true);
  assert.ok(seeded.data.manifest.chunkCount > 20, '课程库应切出足够多的块');

  const status = await request('/api/rag/status');
  assert.equal(status.data.courseKbId, seeded.data.kbId);

  const search = await request('/api/rag/search', { kbId: seeded.data.kbId, query: 'token 与上下文预测', limit: 3 });
  assert.equal(search.status, 200);
  assert.ok(search.data.result.hits.length > 0);
  assert.ok(search.data.result.hits[0].source.length > 0);
  assert.equal(search.data.result.embedder.semantic, false, '默认嵌入必须自述为非语义');

  await request('/api/plan', { goal: 'RAG 知识库', level: 'basic', dailyMinutes: 45 });
  // 复评要走 AI 通道必须先配置模型；未配置时会明确停在本地规则（mode:"local"），这不是本用例要测的路径。
  const configured = await request('/api/ai/config', { baseUrl: 'https://provider.example/v1', model: 'm', apiKey: 'k' });
  assert.equal(configured.status, 200);
  const reviewed = await request('/api/explanation', { moduleId: 'llm-basics', text: explanation });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.result.mode, 'ai', '前置：应走 AI 复评通道');
  assert.equal(reviewed.data.result.grounded, true, '灌库后复评应带证据');
  assert.equal(reviewed.data.result.grounding.available, true);
  assert.ok(reviewed.data.result.grounding.evidenceCount > 0);
  assert.ok(reviewed.data.result.grounding.version >= 1);
  assert.equal(reviewed.data.result.evidenceIntegrity, 'ok');
});

test('re-seeding the course base replaces documents instead of piling them up', async t => {
  const request = await start(t, { fetchImpl: provider({ score: 90, factualCorrect: true, feedback: 'ok', followUp: 'f', citations: ['E1'] }) });
  const first = await request('/api/rag/course/seed', {});
  const second = await request('/api/rag/course/seed', {});
  assert.equal(second.data.created, false, '第二次灌库应复用同一个课程库');
  assert.equal(second.data.kbId, first.data.kbId);
  assert.equal(second.data.manifest.documentCount, first.data.manifest.documentCount, '文档数不得因重复灌库而增长');
  assert.equal(second.data.manifest.version, 2, '重建应开新版本');
  const kb = await request('/api/rag/kb?kbId=' + first.data.kbId);
  assert.deepEqual(kb.data.kb.versions.map(v => v.version), [1, 2], '旧版本必须保留');
});
