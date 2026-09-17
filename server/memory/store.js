'use strict';

// 三层可审计记忆（借鉴 DeepTutor 的 L1/L2/L3 分层，但**不照搬它的 LLM 摘要管线**）。
//
// 为什么要分层，而不是存一张表：
//   学习记录只有一条条事件时，「这个学生到底哪里弱」需要每次重新算；
//   而一旦把结论算出来存下来，又没人能核对它从哪来。分层的意义就是让两者同时成立：
//
//   L1 · 事件轨迹   trace/<surface>/<date>.jsonl   append-only，只追加、不修改。这是唯一的真源。
//   L2 · 各面事实   L2/<surface>.md                由 L1 聚合出的结论，**每条都标注依据的事件数**。
//   L3 · 跨面综合   L3/profile|recent|scope.md     由 L2 综合，**标注贡献来源面**。
//
// 与 DeepTutor 的关键差异（必须说清楚，不能含糊）：
//   它的 L2/L3 由 LLM 摘要产出；本模块的 L2/L3 是**确定性聚合**（计数、比例、去重），
//   因此没有「模型编造了一条关于你的记忆」这种风险，也**没有语义归纳能力**。
//   生成方式写在每个文件的头部与 inspect() 的 mode 字段里，不靠读者猜。

const fs = require('node:fs');
const path = require('node:path');
const { badRequest } = require('../errors');

const L2_DIR = 'L2';
const L3_DIR = 'L3';
const TRACE_DIR = 'trace';
const L3_SLOTS = ['profile', 'recent', 'scope'];
// preferences 与上面三个槽位刻意分开：它只由显式写入产生，synthesize 不会生成也不会覆盖它。
const L3_FILES = [...L3_SLOTS, 'preferences'];
const RECENT_DAYS = 7;
const MAX_EVENTS_READ = 5000;

// 与学习闭环一一对应的「面」。新增面必须在这里登记，避免出现没人读的孤儿轨迹目录。
const SURFACES = {
  plan: { label: '学习计划', describe: '目标、基础与每日时长，以及路线变更。' },
  explain: { label: '讲解提交', describe: '讲解文本的评审结果、判定来源与未通过的检查项。' },
  quiz: { label: '客观测验', describe: '测验得分、通关判定与错题。' },
  review: { label: '错题复习', describe: '错题重做与间隔复习结果。' },
  rag: { label: '知识库检索', describe: '检索问题与命中情况。' }
};

function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// 0 次事件时比例没有基数，必须返回 null（无数据），不能返回 0。
// 返回 0 会把「还没开始」写成「通过率 0%」，读起来像「学得不好」——
// 这是 docs/ican/walkthrough-2026-09-15.md 记下的同一类问题：把没有数据表达成 0 分。
// null 让「无数据」与「全错（真实的 0%）」在 JSON 与渲染里都可区分。
function pct(part, total) {
  return total ? Math.round((part / total) * 100) : null;
}

// 渲染用：null 表示没有可算的基数，必须写成「无数据」，不得写成 0%。
function rateText(rate) {
  return rate === null ? '无数据' : rate + '%';
}

function createMemoryStore(options = {}) {
  if (!options.dataRoot) throw new Error('createMemoryStore 需要 dataRoot。');
  const root = options.dataRoot;
  fs.mkdirSync(root, { recursive: true });

  const traceFile = (surface, date) => path.join(root, TRACE_DIR, surface, date + '.jsonl');
  const l2File = surface => path.join(root, L2_DIR, surface + '.md');
  const l3File = slot => path.join(root, L3_DIR, slot + '.md');

  function requireSurface(surface) {
    if (!SURFACES[surface]) throw badRequest('未登记的记忆面：' + surface + '。可用的面：' + Object.keys(SURFACES).join('、'));
    return surface;
  }

  // ---------------- L1：只追加 ----------------
  function record(surface, event, now = Date.now()) {
    requireSurface(surface);
    if (!event || typeof event !== 'object') throw badRequest('事件必须是对象。');
    const date = today(now);
    const file = traceFile(surface, date);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const row = { at: new Date(now).toISOString(), ...event };
    fs.appendFileSync(file, JSON.stringify(row) + '\n');
    refreshL2(surface); // L2 是 L1 的纯函数，追加后立即重算，避免出现「L2 比 L1 旧」的窗口
    return row;
  }

  function l1Dates(surface) {
    const dir = path.join(root, TRACE_DIR, surface);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).map(name => name.slice(0, -6)).sort();
  }

  function l1(surface, options2 = {}) {
    requireSurface(surface);
    const dates = options2.date ? [options2.date] : l1Dates(surface);
    const selected = options2.limit ? dates.slice(-Math.ceil(options2.limit / 200)) : dates;
    const events = [];
    for (const date of selected) {
      const file = traceFile(surface, date);
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line) continue;
        try { events.push(JSON.parse(line)); } catch { /* 单行损坏不应让整条轨迹不可读 */ }
      }
    }
    return options2.limit ? events.slice(-options2.limit) : events.slice(-MAX_EVENTS_READ);
  }

  // ---------------- L2：由 L1 确定性聚合 ----------------
  function curate(surface, events) {
    const total = events.length;
    const base = { surface, total };
    if (surface === 'explain') {
      const accepted = events.filter(e => e.accepted).length;
      const modes = {};
      for (const event of events) modes[event.mode || 'unknown'] = (modes[event.mode || 'unknown'] || 0) + 1;
      const failedChecks = {};
      for (const event of events) {
        for (const check of event.checks || []) {
          if (check && check.pass === false) failedChecks[check.label] = (failedChecks[check.label] || 0) + 1;
        }
      }
      const grounded = events.filter(e => e.grounded === true).length;
      const fabricated = events.filter(e => e.evidenceIntegrity === 'fabricated-reference').length;
      return { ...base, accepted, acceptedRate: pct(accepted, total), modes, failedChecks, grounded, fabricated };
    }
    if (surface === 'quiz') {
      const passed = events.filter(e => e.passed).length;
      const byModule = {};
      for (const event of events) {
        if (!event.moduleId) continue;
        const bucket = byModule[event.moduleId] || (byModule[event.moduleId] = { attempts: 0, passed: 0, scores: [] });
        bucket.attempts++;
        if (event.passed) bucket.passed++;
        if (Number.isFinite(event.score)) bucket.scores.push(event.score);
      }
      for (const bucket of Object.values(byModule)) {
        bucket.average = bucket.scores.length ? Math.round(bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length) : 0;
        delete bucket.scores;
      }
      return { ...base, passed, passRate: pct(passed, total), byModule };
    }
    if (surface === 'review') {
      const correct = events.filter(e => e.correct === true).length;
      return { ...base, correct, correctRate: pct(correct, total) };
    }
    if (surface === 'plan') {
      const latest = events[events.length - 1] || null;
      return { ...base, latestGoal: latest ? latest.goal || '' : '', latestLevel: latest ? latest.level || '' : '', distinctGoals: [...new Set(events.map(e => e.goal).filter(Boolean))] };
    }
    if (surface === 'rag') {
      const hit = events.filter(e => Number(e.hits) > 0).length;
      return { ...base, withHits: hit, hitRate: pct(hit, total) };
    }
    return base;
  }

  function renderL2(surface, facts) {
    const lines = [
      '# L2 · ' + SURFACES[surface].label,
      '',
      '> 生成方式：由 L1 事件轨迹**确定性聚合**（计数与比例），非模型摘要，不含语义归纳。',
      '> 依据：' + facts.total + ' 条 L1 事件。真源见 `trace/' + surface + '/`。',
      '',
      SURFACES[surface].describe,
      ''
    ];
    if (surface === 'explain') {
      lines.push('## 讲解评审', '',
        '- 提交 ' + facts.total + ' 次，通过 ' + facts.accepted + ' 次（通过率 ' + rateText(facts.acceptedRate) + '）。',
        '- 判定来源分布：' + (Object.entries(facts.modes).map(([k, v]) => k + ' ' + v + ' 次').join('；') || '无') + '。',
        '- 带课程证据的评审 ' + facts.grounded + ' 次；其中引用编号造假的 ' + facts.fabricated + ' 次。', '');
      const failed = Object.entries(facts.failedChecks).sort((a, b) => b[1] - a[1]);
      lines.push('## 未通过的检查项（按次数）', '');
      if (!failed.length) lines.push('- 暂无未通过项。');
      for (const [label, count] of failed) lines.push('- ' + label + '：' + count + ' 次');
      lines.push('');
    } else if (surface === 'quiz') {
      lines.push('## 测验', '', '- 测验 ' + facts.total + ' 次，通过 ' + facts.passed + ' 次（通过率 ' + rateText(facts.passRate) + '）。', '');
      lines.push('## 分模块表现', '');
      const entries = Object.entries(facts.byModule);
      if (!entries.length) lines.push('- 暂无模块记录。');
      for (const [id, bucket] of entries) lines.push('- `' + id + '`：' + bucket.attempts + ' 次，通过 ' + bucket.passed + ' 次，平均分 ' + bucket.average + '。');
      lines.push('');
    } else if (surface === 'review') {
      lines.push('## 错题复习', '', '- 复习 ' + facts.total + ' 次，答对 ' + facts.correct + ' 次（正确率 ' + rateText(facts.correctRate) + '）。', '');
    } else if (surface === 'plan') {
      lines.push('## 学习计划', '', '- 生成计划 ' + facts.total + ' 次。',
        '- 最近一次目标：' + (facts.latestGoal || '（无）') + '；基础：' + (facts.latestLevel || '（无）') + '。',
        '- 历史目标：' + (facts.distinctGoals.join('；') || '（无）'), '');
    } else if (surface === 'rag') {
      lines.push('## 知识库检索', '', '- 检索 ' + facts.total + ' 次，有命中 ' + facts.withHits + ' 次（命中率 ' + rateText(facts.hitRate) + '）。', '');
    }
    return lines.join('\n');
  }

  function refreshL2(surface) {
    requireSurface(surface);
    const facts = curate(surface, l1(surface));
    const markdown = renderL2(surface, facts);
    fs.mkdirSync(path.join(root, L2_DIR), { recursive: true });
    fs.writeFileSync(l2File(surface), markdown);
    return { surface, facts, markdown };
  }

  function readL2(surface) {
    requireSurface(surface);
    const file = l2File(surface);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }

  // ---------------- L3：由 L2 综合 ----------------
  function synthesize(now = Date.now()) {
    const surfaces = Object.keys(SURFACES);
    const facts = {};
    for (const surface of surfaces) facts[surface] = curate(surface, l1(surface));

    const weakModules = Object.entries(facts.quiz.byModule)
      .filter(([, bucket]) => bucket.attempts > 0 && bucket.passed < bucket.attempts)
      .sort((a, b) => a[1].average - b[1].average)
      .map(([id, bucket]) => ({ id, average: bucket.average, attempts: bucket.attempts, passed: bucket.passed }));
    const failingChecks = Object.entries(facts.explain.failedChecks).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));

    const contributors = surfaces.filter(s => facts[s].total > 0);
    const profile = [
      '# L3 · 学习者画像', '',
      '> 生成方式：由 L2 各面事实**确定性综合**（跨面计数与比例），非模型摘要。',
      '> 贡献来源面：' + (contributors.length ? contributors.map(s => 'L2/' + s).join('、') + '（无贡献的面不参与）。'
        // 零事件时不能留下悬空的「贡献来源面：」——那读起来像句子没写完，
        // 而真实情况是「还没有任何依据」。absence 要写出来，不能留白。
        : '无 —— 还没有任何 L1 事件，本文件是按规则生成的空模板，不含任何学习结论。'), '',
      '## 当前状态', '',
      '- 讲解提交 ' + facts.explain.total + ' 次，通过率 ' + rateText(facts.explain.acceptedRate) + '。',
      '- 测验 ' + facts.quiz.total + ' 次，通过率 ' + rateText(facts.quiz.passRate) + '。',
      '- 错题复习 ' + facts.review.total + ' 次，正确率 ' + rateText(facts.review.correctRate) + '。',
      '- 最近学习目标：' + (facts.plan.latestGoal || '（未设定）') + '。', '',
      '## 待加强模块（按测验平均分升序）', ''
    ];
    profile.push(...(weakModules.length ? weakModules.map(item => '- `' + item.id + '`：平均 ' + item.average + ' 分，' + item.attempts + ' 次中通过 ' + item.passed + ' 次。') : ['- 暂无足够测验记录。']));
    profile.push('', '## 讲解中最常未通过的检查项', '');
    profile.push(...(failingChecks.length ? failingChecks.slice(0, 5).map(item => '- ' + item.label + '：' + item.count + ' 次') : ['- 暂无。']));
    profile.push('', '> 本文件是规则聚合结果，不是能力评估结论，也不能用于预测学习效果。', '');

    const cutoff = new Date(now - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
    const recentLines = ['# L3 · 近期活动', '', '> 生成方式：由 L1 事件按日期确定性聚合，窗口 ' + RECENT_DAYS + ' 天（' + cutoff + ' 起）。', ''];
    let recentTotal = 0;
    for (const surface of surfaces) {
      const byDate = {};
      for (const event of l1(surface)) {
        const date = String(event.at || '').slice(0, 10);
        if (date >= cutoff) byDate[date] = (byDate[date] || 0) + 1;
      }
      const entries = Object.entries(byDate).sort();
      recentTotal += entries.reduce((sum, [, n]) => sum + n, 0);
      if (!entries.length) continue;
      recentLines.push('## ' + SURFACES[surface].label, '');
      for (const [date, count] of entries) recentLines.push('- ' + date + '：' + count + ' 条');
      recentLines.push('');
    }
    if (!recentTotal) recentLines.push('窗口内没有活动记录。', '');

    const scope = ['# L3 · 记忆覆盖范围', '', '> 生成方式：由 L1/L2 的存在性确定性列出，非模型判断。', '', '| 面 | 含义 | L1 事件 | L2 文件 |', '| --- | --- | --- | --- |'];
    for (const surface of surfaces) {
      scope.push('| `' + surface + '` | ' + SURFACES[surface].label + ' | ' + facts[surface].total + ' | ' + (readL2(surface) ? '有' : '无') + ' |');
    }
    scope.push('', '## 明确不在记忆范围内', '',
      '- 不做语义归纳：L2/L3 只有计数与比例，没有「你偏好类比式讲解」这类模型推断。',
      '- 不跨设备同步：本机文件即全部，不存在云端副本。',
      '- 不记录讲解正文到 L2/L3：原文只存在于 L1 轨迹与学习记录中。', '');

    const l3 = { profile: profile.join('\n'), recent: recentLines.join('\n'), scope: scope.join('\n') };
    fs.mkdirSync(path.join(root, L3_DIR), { recursive: true });
    for (const slot of L3_SLOTS) fs.writeFileSync(l3File(slot), l3[slot]);
    return { generatedAt: new Date(now).toISOString(), facts, l3 };
  }

  function readL3(slot) {
    if (!L3_FILES.includes(slot)) throw badRequest('未知的 L3 槽位：' + slot + '。可选：' + L3_FILES.join('、'));
    const file = l3File(slot);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }

  // 偏好只能显式写入，不参与自动综合 —— 与 DeepTutor 的 preferences 只由 write_memory 写入同源。
  function writePreference(text, options = {}) {
    const operation = options.operation || 'append';
    if (!['append', 'replace', 'clear'].includes(operation)) throw badRequest('不支持的偏好操作。');
    if (operation === 'clear') {
      fs.rmSync(l3File('preferences'), { force: true });
      return '';
    }
    const value = String(text || '').trim();
    if (!value) throw badRequest('偏好内容不能为空。');
    if (value.length > 2000) throw badRequest('偏好最多 2000 字符。');
    fs.mkdirSync(path.join(root, L3_DIR), { recursive: true });
    const file = l3File('preferences');
    const header = '# L3 · 显式偏好\n\n> 本文件只由显式写入产生，不参与自动综合，也不会被 synthesize 覆盖。\n\n';
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : header;
    const body = operation === 'replace' ? '' : (existing.startsWith(header) ? existing.slice(header.length) : existing);
    const next = header + body + '- ' + new Date().toISOString() + '　' + value + '\n';
    if (next.length > 20000) throw badRequest('偏好记录已达上限，请替换或清除后再写入。');
    fs.writeFileSync(file, next);
    return next;
  }

  function inspect() {
    const surfaces = Object.keys(SURFACES).map(surface => {
      const events = l1(surface);
      const dates = l1Dates(surface);
      return { surface, label: SURFACES[surface].label, describe: SURFACES[surface].describe,
        events: events.length, dates: dates.length, firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null,
        facts: curate(surface, events), l2: readL2(surface) };
    });
    return {
      root, mode: 'deterministic', l1Total: surfaces.reduce((sum, item) => sum + item.events, 0), surfaces,
      l3: L3_SLOTS.map(slot => ({ slot, markdown: readL3(slot) })),
      preferences: readL3('preferences'),
      notice: 'L2/L3 由 L1 确定性聚合，不含模型语义归纳；本机文件即全部数据，不跨设备同步。'
    };
  }

  // 记忆图谱：L3 槽位 → L2 面 → L1 事件数。沿用 DeepTutor「结论要能连回依据」的取向。
  function graph() {
    const surfaces = Object.keys(SURFACES).map(surface => {
      const events = l1(surface);
      return { id: 'L2/' + surface, surface, label: SURFACES[surface].label, events: events.length, dates: l1Dates(surface).length };
    });
    const edges = surfaces.filter(node => node.events > 0).map(node => ({ from: 'L3', to: node.id, weight: node.events }));
    return { nodes: [{ id: 'L3', label: 'L3 综合', slots: L3_SLOTS, events: surfaces.reduce((sum, node) => sum + node.events, 0) }, ...surfaces], edges };
  }

  function clear(surface) {
    if (surface) {
      requireSurface(surface);
      fs.rmSync(path.join(root, TRACE_DIR, surface), { recursive: true, force: true });
      fs.rmSync(l2File(surface), { force: true });
      return { cleared: surface };
    }
    fs.rmSync(path.join(root, TRACE_DIR), { recursive: true, force: true });
    fs.rmSync(path.join(root, L2_DIR), { recursive: true, force: true });
    fs.rmSync(path.join(root, L3_DIR), { recursive: true, force: true });
    return { cleared: 'all' };
  }

  return { root, SURFACES, record, l1, l1Dates, refreshL2, readL2, synthesize, readL3, writePreference, inspect, graph, clear, curate, L3_SLOTS };
}

module.exports = { createMemoryStore, SURFACES, L3_SLOTS, L3_FILES };
