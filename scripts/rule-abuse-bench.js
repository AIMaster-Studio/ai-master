'use strict';
/**
 * 规则背穿对抗测试（adversarial audit）
 *
 * 目的：用一台"零理解、只对规则"的作弊 bot 去刷 learning-core 的讲解通关，
 * 实测本地 7 项检查能被优化到什么程度。这不是通关教程，而是把"能被背穿"
 * 从口头争论变成可复现的数字：
 *   - naiveBot：术语堆砌 + 通用模板（模拟最笨的作弊者）
 *   - grammarBot：显式满足 7 项检查的范畴语法模板（模拟看过规则的作弊者）
 *
 * 结论口径见 docs/ican/evidence/rule-abuse-bench-results.json 顶部 summary。
 */
const fs = require('node:fs');
const path = require('node:path');
const core = require('../frontend/static/js/learning-core');
const catalog = require('../frontend/data/learning-curriculum.json');

const MODULES = catalog.modules;
const N = 20; // 每个模块每个 bot 生成 20 个变体

function pickTerms(module) {
  return module.concepts.map(c => String(c.terms[0]).toLowerCase());
}

// naiveBot：只有关键词和重复填充，没有真实机制/例子/边界
function naiveBot(module) {
  const terms = pickTerms(module);
  const sentence = '这里讲的是关于' + module.title + '的内容，包括' + terms.join('、') + '这些概念。';
  const padding = sentence.repeat(6); // 触发重复检测的故意填充
  return '大模型相关，' + sentence + padding;
}

function makeGrammarTemplate(module, exampleIdx) {
  const terms = pickTerms(module);
  const examples = [
    '在校园里，例如学生自治会的报名收集工作，如果一人缺席就可能导致流程延迟',
    '例如图书馆座位预约系统，假设高峰时段并发很高，就会触发排队等待',
    '比如班级群通知的自动整理，如果格式不统一，就可能出现漏读',
    '例如校医院档案查询，遇到同名记录，就需要额外的人工确认',
    '在社团经费审批场景，比如队长代报，就需要二次核验'
  ];
  const boundaries = [
    '但是这不保证每次结果都正确，仍需对关键结论进行核验。',
    '然而它不能覆盖所有失败情形，必要时应人工检查。',
    '不过该方法存在局限，对超出资料范围的问题需要额外确认。'
  ];
  const example = examples[exampleIdx % examples.length];
  const boundary = boundaries[(exampleIdx * 7) % boundaries.length];
  // 机制句：覆盖【有效内容】【机制与因果】；概念句覆盖【关键概念】
  const mech = '整个流程先接收输入，再经过中间处理，然后根据上下文逐步输出，从而形成完整结果。';
  const conceptSent = terms.map((t, i) => {
    const cues = ['在这个任务里', '进一步地', '具体地', '与之相关', '从实现上看'];
    return cues[i % cues.length] + '，' + t + ' 起到关键作用，它和前后步骤互相依赖。';
  }).join('');
  const exampleSent = '举一个具体任务来说明：' + example + '。';
  const limitSent = '以上只适用于已经定义清楚的场景' + boundary;
  // 顺序打乱一点，降低逐字重复风险
  return [mech, conceptSent, exampleSent, limitSent].join('');
}

function run(module, builder) {
  const passes = [];
  for (let i = 0; i < N; i++) {
    const text = builder(module, i);
    const r = core.screenExplanation(text, module);
    passes.push(r.eligible);
  }
  return { passCount: passes.filter(Boolean).length, total: N };
}

const rows = MODULES.map(m => {
  const naive = run(m, naiveBot);
  const grammar = run(m, (mod, i) => makeGrammarTemplate(mod, i));
  return {
    moduleId: m.id,
    title: m.title,
    concepts: m.concepts.length,
    naiveBot: { ...naive, passRate: +(naive.passCount / naive.total).toFixed(2) },
    grammarBot: { ...grammar, passRate: +(grammar.passCount / grammar.total).toFixed(2) }
  };
});

const agg = (key) => {
  const sum = rows.reduce((s, r) => s + r[key].passCount, 0);
  const total = rows.reduce((s, r) => s + r[key].total, 0);
  return { passCount: sum, total, passRate: +(sum / total).toFixed(2) };
};

const summary = {
  engine: 'frontend/static/js/learning-core.js screenExplanation(7 checks)',
  variantsPerModule: N,
  naiveBot: agg('naiveBot'),
  grammarBot: agg('grammarBot'),
  takeaway: 'naiveBot 全部被拦截（无机制/例子/边界），说明关卡不是空壳；' +
    'grammarBot 用范畴模板显式命中 7 项检查后是否放行，衡量的是"文法层面背穿"的现实程度。' +
    '规则判定器定位是"完整性筛查"而非"语义理解"，语义闸门依赖服务端 AI 复评；' +
    '此数据用于对抗性审计，不作为通关方法传播。'
};

const result = { generatedAt: new Date().toISOString(), summary, rows };
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'ican', 'evidence', 'rule-abuse-bench-results.json'), JSON.stringify(result, null, 2), 'utf8');

console.log('== naiveBot（术语堆砌+重复填充） ==');
rows.forEach(r => console.log(`  ${r.moduleId}: ${r.naiveBot.passCount}/${r.naiveBot.total}`));
console.log('== grammarBot（显式命中 7 项的模板） ==');
rows.forEach(r => console.log(`  ${r.moduleId}: ${r.grammarBot.passCount}/${r.grammarBot.total}`));
console.log('== 汇总 ==');
console.log('naiveBot  passRate =', summary.naiveBot.passRate);
console.log('grammarBot passRate =', summary.grammarBot.passRate);
console.log('results -> docs/ican/evidence/rule-abuse-bench-results.json');