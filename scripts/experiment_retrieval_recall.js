'use strict';

/**
 * 实验：本机哈希嵌入的召回代价有多大？
 *
 * 动机 —— 这是本项目对外**主动声称**的一条边界：
 *   「默认嵌入是词面重合、不是语义检索，同义改写与跨语言提问会漏召回。」
 * 但在此之前，这条边界只有定性描述，没有量。学习者读到「会漏召回」无法判断
 * 到底是「偶尔漏一个」还是「基本用不了」。本实验把它量化。
 *
 * 设计：
 *   - 语料：用仓库自带课程内容灌成的课程知识库（74 篇文档 → 约 93 个块）。
 *   - 自变量：查询的表述方式。每道题准备两个版本：
 *       A 原词版：直接使用课程原文里的词（token / 分词器 / 注意力 …）
 *       B 改写版：换成同义说法，刻意避开原文用词
 *   - 因变量：Top-3 命中里是否出现「期望章节」的块（用 source 字段判定）。
 *   - 控制：同一知识库、同一索引版本、同一 k、同一次运行内完成。
 *
 * 为什么这个实验值得做：它验证的是一条**对外承诺**，而不是实现细节。
 * 如果改写版命中率也接近 100%，说明我们对自己的边界描述过于保守（同样是错）；
 * 如果接近 0，说明「能用」这个印象是误导。
 *
 * 运行：node scripts/experiment_retrieval_recall.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRagService } = require('../server/rag');
const { buildCourseDocuments } = require('../server/rag/course-seed');

// 每道题：期望命中的章节（source 前缀）+ 原词版 + 改写版。
// 改写版刻意不使用原词版里的任何关键词，模拟「学习者用自己的话说」。
const CASES = [
  { id: 'E1', expect: 'chapter_01', verbatim: 'token 分词器 整数序列', paraphrase: '文字是怎么被切碎了喂进模型的' },
  { id: 'E2', expect: 'chapter_01', verbatim: '缩放定律 参数量 数据量 幂律', paraphrase: '模型越大就一定越聪明吗 有没有规律' },
  { id: 'E3', expect: 'chapter_01', verbatim: '幻觉 事实核验', paraphrase: '它一本正经地胡说八道该怎么办' },
  { id: 'E4', expect: 'chapter_02', verbatim: '注意力机制 多头注意力', paraphrase: '模型在读一句话时怎么决定该看哪个词' },
  { id: 'E5', expect: 'chapter_03', verbatim: '提示词工程 角色设定', paraphrase: '怎么问才能让它答得更好' },
  { id: 'E6', expect: 'chapter_05', verbatim: 'Claude Code 安装', paraphrase: '命令行里的编程助手怎么装' },
  { id: 'E7', expect: 'chapter_08', verbatim: '量化 INT8 显存', paraphrase: '怎么让模型跑在更小的显卡上' },
  { id: 'E8', expect: 'chapter_10', verbatim: '智能体 工具调用', paraphrase: '让模型自己去查资料再回答 怎么做' }
];

const K = 3;

function hitsExpected(result, expect) {
  return result.hits.some(hit => String(hit.source || '').startsWith(expect));
}

function top1Expected(result, expect) {
  return result.hits.length > 0 && String(result.hits[0].source || '').startsWith(expect);
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-exp-recall-'));
  const rag = createRagService({ dataRoot, config: () => ({}) });

  const documents = buildCourseDocuments({});
  const kb = rag.store.create({ name: '实验课程库' });
  rag.store.addDocuments(kb.id, documents);
  const manifest = await rag.store.buildIndex(kb.id);

  console.log('语料：' + manifest.documentCount + ' 篇文档 → ' + manifest.chunkCount + ' 个可引用块');
  console.log('嵌入器：' + manifest.embedder.id + '（semantic=' + manifest.embedder.semantic + '）');
  console.log('索引后端：' + manifest.backend.id + (manifest.backend.degraded ? '（已降级）' : ''));
  console.log('k = ' + K + '，判定标准：Top-' + K + ' 中出现期望章节的块即为命中\n');

  const rows = [];
  for (const testCase of CASES) {
    const verbatim = await rag.store.search(kb.id, testCase.verbatim, K);
    const paraphrase = await rag.store.search(kb.id, testCase.paraphrase, K);
    rows.push({
      id: testCase.id,
      expect: testCase.expect,
      verbatimHit: hitsExpected(verbatim, testCase.expect),
      verbatimTop1: top1Expected(verbatim, testCase.expect),
      paraphraseHit: hitsExpected(paraphrase, testCase.expect),
      paraphraseTop1: top1Expected(paraphrase, testCase.expect),
      paraphraseTop: paraphrase.hits.length ? paraphrase.hits[0].source : '(无命中)'
    });
  }

  const pad = (text, width) => String(text).padEnd(width, ' ');
  console.log(pad('题', 5) + pad('期望章节', 12) + pad('原词 Top' + K, 12) + pad('改写 Top' + K, 12) + '改写版实际 Top-1');
  console.log('-'.repeat(78));
  for (const row of rows) {
    console.log(pad(row.id, 5) + pad(row.expect, 12)
      + pad(row.verbatimHit ? '命中' : '未命中', 12)
      + pad(row.paraphraseHit ? '命中' : '未命中', 12)
      + row.paraphraseTop);
  }

  const sum = key => rows.filter(row => row[key]).length;
  const total = rows.length;
  console.log('\n=== 汇总 ===');
  console.log('原词版  Top-' + K + ' 命中率：' + sum('verbatimHit') + '/' + total + '（' + Math.round(sum('verbatimHit') / total * 100) + '%）');
  console.log('改写版  Top-' + K + ' 命中率：' + sum('paraphraseHit') + '/' + total + '（' + Math.round(sum('paraphraseHit') / total * 100) + '%）');
  console.log('原词版  Top-1 命中率：' + sum('verbatimTop1') + '/' + total);
  console.log('改写版  Top-1 命中率：' + sum('paraphraseTop1') + '/' + total);

  const out = {
    ranAt: new Date().toISOString(),
    embedder: manifest.embedder, backend: manifest.backend,
    documents: manifest.documentCount, chunks: manifest.chunkCount, k: K,
    cases: rows,
    summary: {
      verbatimHit: sum('verbatimHit'), paraphraseHit: sum('paraphraseHit'),
      verbatimTop1: sum('verbatimTop1'), paraphraseTop1: sum('paraphraseTop1'), total
    }
  };
  const outFile = path.join(__dirname, 'experiment_retrieval_recall.results.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log('\n原始结果已写入 ' + path.relative(path.resolve(__dirname, '..'), outFile));

  fs.rmSync(dataRoot, { recursive: true, force: true });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
