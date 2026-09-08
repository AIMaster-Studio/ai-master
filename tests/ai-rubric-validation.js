'use strict';

// AI 复评 rubric 双盲验证脚本
// 目的：验证 score >= 75 && factualCorrect 的阈值能否区分正确讲解和错误讲解
// 用法：node tests/ai-rubric-validation.js
// 需要 .env 中配置 DEEPSEEK_API_KEY

const fs = require('node:fs');
const path = require('node:path');

// 加载 .env
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
} catch (_) {}

const { reviewExplanation } = require('../server/ai-review');
const core = require('../frontend/static/js/learning-core');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend/data/learning-curriculum.json'), 'utf8'));
const modules = new Map(catalog.modules.map(m => [m.id, m]));

// 20 组双盲测试样本：10 正确 + 10 错误
// 每组标注 groundTruth: true（正确讲解）/ false（错误讲解）
const TEST_CASES = [
  // ===== llm-basics 模块 =====
  {
    moduleId: 'llm-basics',
    groundTruth: true,
    explanation: `大模型生成回答的过程是自回归的：首先把输入文本通过分词器切成 token，token 是处理单位，不一定等于一个字或词。然后模型根据前面的 token 计算下一个 token 的概率分布，选概率最高的（或采样）输出，再把输出加入上下文，重复这个过程。比如我问"今天食堂的菜好吃吗"，模型会根据"今天""食堂"等上下文预测下一个词可能是"好吃"或"一般"。为什么可能答错？因为模型只是在预测下一个 token，不保证事实正确。比如它可能编造一篇不存在的论文引用，因为语言流畅不等于事实可靠。我会怎样核验：对于论文引用，我会去知网或 Google Scholar 搜题名和作者，确认论文真实存在且论点相符；对于食堂评价，我会去问实际吃过的同学或看评价系统。`
  },
  {
    moduleId: 'llm-basics',
    groundTruth: false,
    explanation: `大模型生成回答就是把所有汉字存进数据库，每次提问时直接检索匹配的答案。token 就是一个汉字，每个汉字固定对应一个 token。大模型永远正确，因为它训练数据包含了所有知识。比如问食堂好不好吃，模型会直接从数据库调出标准答案，不会出错。few-shot 就是把示例永久写入模型权重，之后模型就永远记住了。`
  },
  {
    moduleId: 'llm-basics',
    groundTruth: true,
    explanation: `token 是分词器产生的处理单位，它的粒度取决于具体的分词器实现，可能是一个字、一个词的一部分，或者几个字。大模型的工作方式是自回归：给定已有上下文，预测下一个 token 的概率分布，然后选一个输出，再把输出放回上下文继续预测。比如写校园通知，模型会根据"请全体同学于"预测下一个词可能是"周一"或"周三"。语言流畅不代表事实正确，模型可能产生幻觉，比如编造一个不存在的会议时间。核验方法是去官方通知系统确认，而不是相信模型的回答。在提示里给几个示例属于上下文学习，通常不更新模型参数，只是在推理时利用示例。`
  },
  {
    moduleId: 'llm-basics',
    groundTruth: false,
    explanation: `大模型通过关键词匹配来生成回答。用户输入关键词，模型在互联网上搜索包含这些关键词的网页，然后把网页内容拼起来就是回答。token 等于一个完整的英文单词，中文每个字是一个 token。大模型的回答总是准确的，因为它用了深度学习。`
  },

  // ===== transformer 模块 =====
  {
    moduleId: 'transformer',
    groundTruth: true,
    explanation: `自注意力机制让每个位置的 token 都能关注上下文中的其他 token。具体来说，每个 token 会被投影成 Query、Key、Value 三个向量。某个位置的 Query 和所有位置的 Key 做点积，得到的分数经过 softmax 变成权重，再用这些权重对所有 Value 加权求和，就得到这个位置包含上下文信息的新表示。比如句子"小明把书借给了小红，他很感谢"，"他"这个位置会通过高权重关注"小红"，从而理解指代关系。但是标准自注意力本身只看内容匹配，不自带顺序信息，所以需要位置编码来告诉模型 token 的先后顺序。自回归解码时还用因果掩码，防止当前位置看到未来的 token（训练时不能让模型偷看答案）。注意，注意力权重高不代表模型像人一样理解了，它只是描述计算中信息的加权组合。`
  },
  {
    moduleId: 'transformer',
    groundTruth: false,
    explanation: `Transformer 的注意力机制就是让模型直接记住所有训练数据的位置。位置编码是多余的，因为注意力本身就能处理顺序。因果掩码的作用是删除不重要的 token，让模型跑得更快。`
  },
  {
    moduleId: 'transformer',
    groundTruth: true,
    explanation: `自注意力的核心是 Q、K、V 的计算：每个 token 生成 Query、Key、Value 向量。用 Q 和所有 K 算匹配分数，softmax 后得到权重，加权组合 V。这样每个位置的输出都融合了上下文信息。多头注意力就是用多组不同的 Q/K/V 投影并行计算，每个头学不同的关系。位置编码是必须的，因为纯内容匹配不知道顺序。因果掩码保证自回归生成时第 t 个位置只能看到前 t 个 token。注意力权重不能直接当因果解释，因为那只是一次计算中的信息组合方式。`
  },
  {
    moduleId: 'transformer',
    groundTruth: false,
    explanation: `注意力机制就是计算两个词的编辑距离，距离越近权重越高。位置编码用随机数就行，不影响结果。因果掩码是用来屏蔽脏话的。`
  },

  // ===== rag-retrieval 模块 =====
  {
    moduleId: 'rag-retrieval',
    groundTruth: true,
    explanation: `做奖学金问答助手的 RAG 流程：第一步整理文档，把奖学金制度文件切块（比如按段落或固定长度切，注意不要把金额和条件拆到不同块里）；第二步把每个块用 embedding 模型编码成向量，建向量索引；第三步用户提问时，把问题也编码成向量，检索最相似的 k 个片段；第四步把问题和检索到的证据一起交给大模型生成回答，并附上引用来源。比如学生问"一等奖学金金额是多少"，系统检索到"一等奖学金每人每年5000元"的片段，模型基于此回答。如果检索不到有效依据（比如问的是奖学金细则里没写的情况），助手应该说明现有资料不足，引导用户去学工处咨询，而不是猜测。RAG 不更新模型参数，也不能完全消除幻觉。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: false,
    explanation: `RAG 就是每次提问都重新训练模型，把文档内容直接写进权重。这样模型就永远记住了所有文档，不会产生幻觉。检索时直接返回最相似的文档原文给用户就行，不需要生成。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: true,
    explanation: `RAG 的流程是：文档切块→向量化建索引→查询时检索相关片段→把证据和问题交给模型生成。切块大小要权衡，太小会把上下文拆散（比如把"一等奖学金5000元"切成"一等奖学金"和"5000元"两块），太大会引入噪声。检索用向量相似度找相关片段，然后把证据喂给模型生成。比如问"助学金怎么申请"，检索到申请流程的片段，模型基于证据回答并引用来源。如果检索不到相关内容，应该告诉用户资料不足，而不是编造答案。RAG 每次查询不更新模型参数，也不能百分之百消除幻觉，证据质量很重要。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: false,
    explanation: `RAG 可以彻底消除幻觉，有了检索就不会有任何错误。切块越小越好，因为小块检索更精准。找不到证据时可以把其他学校的奖学金金额拿来用，反正差不多。`
  },

  // ===== 额外样本：凑关键词但无语义 =====
  {
    moduleId: 'llm-basics',
    groundTruth: false,
    explanation: `token 分词 上下文 预测 概率 幻觉 核验事实。因为 token 所以上下文，例如预测，但是局限，不能。`
  },
  {
    moduleId: 'transformer',
    groundTruth: false,
    explanation: `attention query key value 位置编码 因果掩码。因为注意力所以 query，例如 key，但是位置编码的局限。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: false,
    explanation: `切块 索引 检索 生成 向量 证据。因为切块所以索引，例如检索，但是生成的局限。`
  },

  // ===== 正确样本（补充） =====
  {
    moduleId: 'llm-basics',
    groundTruth: true,
    explanation: `大模型把文本切成 token 后，用自回归方式逐 token 生成。token 是分词器的输出单位，不固定等于字词。模型根据上下文预测下一个 token 的概率分布并采样输出。比如写请假条，模型根据"我因"预测"生病"或"有事"。但模型可能产生幻觉，比如编造医生证明。核验方式是看原始证明文件。提示中的 few-shot 示例不更新参数，只是在推理时提供模式参考。`
  },
  {
    moduleId: 'transformer',
    groundTruth: true,
    explanation: `自注意力中，每个 token 的 Query 和所有 token 的 Key 算相似度，softmax 得权重，加权求和 Value。多头并行学不同关系。位置编码补充顺序信息。因果掩码防止训练时看未来。注意力权重不等于人类理解。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: true,
    explanation: `RAG 把文档切块建向量索引，查询时检索相关片段，连同问题交给模型生成。例如问奖学金，检索到金额片段后回答。无证据时应拒答或引导咨询官方。RAG 不更新参数，不能完全消除幻觉，切块大小影响质量。`
  },
  {
    moduleId: 'llm-basics',
    groundTruth: false,
    explanation: `大模型就是搜索引擎，直接从网上找答案复制粘贴。它永远不会出错。token 就是单词，一个单词一个 token。`
  },
  {
    moduleId: 'transformer',
    groundTruth: true,
    explanation: `自注意力通过 QKᵀ 计算匹配分数，softmax 归一化后加权 V。多头注意力用多组投影并行。位置编码因为注意力本身无顺序感。因果掩码自回归时遮住未来位置。高权重不等于因果解释。`
  },
  {
    moduleId: 'rag-retrieval',
    groundTruth: false,
    explanation: `RAG 是一种微调方法，每次查询都更新模型参数。切块越小越好。没有检索结果时可以猜一个答案。`
  }
];

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('错误：需要在 .env 中配置 DEEPSEEK_API_KEY');
    process.exit(1);
  }

  const config = {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-pro',
    apiKey
  };

  console.log('AI 复评 rubric 双盲验证');
  console.log('='.repeat(80));
  console.log(`模型: ${config.model}`);
  console.log(`样本数: ${TEST_CASES.length} (正确 ${TEST_CASES.filter(t => t.groundTruth).length} / 错误 ${TEST_CASES.filter(t => !t.groundTruth).length})`);
  console.log(`阈值: score >= 75 && factualCorrect === true`);
  console.log('='.repeat(80));

  const results = [];
  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const module = modules.get(tc.moduleId);
    const local = core.screenExplanation(tc.explanation, module);
    // 绕过本地筛查，直接测试 AI rubric 的区分能力
    local.eligible = true;

    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await reviewExplanation(tc.explanation, module, local, config);
      if (result.mode === 'ai') break;
      // 限流/超时：等待后重试
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }

    results.push({ ...tc, score: result.score, accepted: result.accepted, mode: result.mode, feedback: result.feedback });
    console.log(`[${i + 1}/${TEST_CASES.length}] ${tc.moduleId} | GT=${tc.groundTruth ? '正确' : '错误'} | score=${result.score} | accepted=${result.accepted} | mode=${result.mode}`);
    if (result.mode === 'fallback-local') {
      console.log(`    fallback: ${result.feedback}`);
    }
    // 避免限流
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '='.repeat(80));
  console.log('阈值区分度分析');
  console.log('='.repeat(80));

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of results) {
    const predicted = r.accepted;
    if (r.groundTruth && predicted) tp++;
    else if (!r.groundTruth && predicted) fp++;
    else if (!r.groundTruth && !predicted) tn++;
    else if (r.groundTruth && !predicted) fn++;
  }

  console.log(`\n混淆矩阵:`);
  console.log(`  真阳性(正确讲解被接受): ${tp}`);
  console.log(`  假阳性(错误讲解被接受): ${fp}`);
  console.log(`  真阴性(错误讲解被拒绝): ${tn}`);
  console.log(`  假阴性(正确讲解被拒绝): ${fn}`);
  console.log(`\n准确率: ${((tp + tn) / TEST_CASES.length * 100).toFixed(1)}%`);
  console.log(`精确率(预测正确中实际正确): ${tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(1) : 'N/A'}%`);
  console.log(`召回率(实际正确中被预测正确): ${tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(1) : 'N/A'}%`);

  // 分数分布（仅统计成功调用 AI 的样本）
  const correctScores = results.filter(r => r.groundTruth && typeof r.score === 'number').map(r => r.score);
  const wrongScores = results.filter(r => !r.groundTruth && typeof r.score === 'number').map(r => r.score);
  const fallbackCount = results.filter(r => r.mode === 'fallback-local').length;
  console.log(`\nAI 调用成功: ${TEST_CASES.length - fallbackCount}/${TEST_CASES.length}, fallback: ${fallbackCount}`);
  if (correctScores.length) console.log(`正确讲解分数: ${correctScores.join(', ')} (平均 ${(correctScores.reduce((a, b) => a + b, 0) / correctScores.length).toFixed(1)})`);
  if (wrongScores.length) console.log(`错误讲解分数: ${wrongScores.join(', ')} (平均 ${(wrongScores.reduce((a, b) => a + b, 0) / wrongScores.length).toFixed(1)})`);

  // 检查是否有反转（错误讲解分数 > 正确讲解最低分）
  if (correctScores.length && wrongScores.length) {
    const minCorrect = Math.min(...correctScores);
    const maxWrong = Math.max(...wrongScores);
    console.log(`\n正确讲解最低分: ${minCorrect}`);
    console.log(`错误讲解最高分: ${maxWrong}`);
    console.log(`是否存在反转(错误讲解超过正确讲解最低分): ${maxWrong > minCorrect ? '是' : '否'}`);
  }

  if (fp > 0) {
    console.log(`\n⚠️  假阳性案例(错误讲解被接受):`);
    results.filter(r => !r.groundTruth && r.accepted).forEach(r => {
      console.log(`  - ${r.moduleId}: score=${r.score}`);
    });
  }
  if (fn > 0) {
    console.log(`\n⚠️  假阴性案例(正确讲解被拒绝):`);
    results.filter(r => r.groundTruth && !r.accepted).forEach(r => {
      console.log(`  - ${r.moduleId}: score=${r.score}, mode=${r.mode}`);
    });
  }

  // 保存完整结果到 JSON
  const outputPath = path.join(__dirname, 'ai-rubric-validation-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    model: config.model,
    threshold: 'score >= 75 && factualCorrect === true',
    testCases: results,
    confusionMatrix: { tp, fp, tn, fn },
    accuracy: (tp + tn) / TEST_CASES.length,
    precision: tp + fp > 0 ? tp / (tp + fp) : null,
    recall: tp + fn > 0 ? tp / (tp + fn) : null,
    generatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`\n完整结果已保存到: ${outputPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
