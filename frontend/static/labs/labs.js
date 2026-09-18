/* 动手实践工作台 · 题目配置
 * 每个工作台 = 题目 id + 分区（sections，对应题目步骤）+ 产物（artifact）+ 形式自检（checks，对应预期成果 / 反作弊）
 * 字段类型：text | textarea | select | rows | derived
 * 自检只做形式核对，不判断内容对错。
 */
(function () {
  'use strict';
  var HOLLOW = /(帮我(做好|弄好|搞定|处理一下)|随便|尽量好|越好越好|你看着办)/;
  var VAGUE = /^(效果(不)?好|不太?准|准确|正确|合理|通顺|感觉(不)?对|可能不准确)[。.！!]?$/;
  var SECRET = /(sk-[A-Za-z0-9]{8,}|api[_-]?key\s*[=:]\s*\S{8,}|token\s*[=:]\s*\S{12,}|Bearer\s+[A-Za-z0-9._-]{16,})/i;

  function T(v) { return String(v == null ? '' : v).trim(); }
  function L(v) { return T(v).length; }
  function rows(s, key) { return Array.isArray(s[key]) ? s[key] : []; }
  /* 行数必须恰好为 n 且每行满足 fn：空表单一律不通过 */
  function allRows(s, key, n, fn) { var r = rows(s, key); return r.length === n && r.every(fn); }
  function filled(r, cols) { return cols.every(function (c) { return L(r[c]) > 0; }); }
  function distinct(arr) { var seen = {}; return arr.length > 0 && arr.every(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }); }
  /* a 是否引用了 b 里的内容：按 b 的双字片段在 a 中查找（中文无空格，不能按词切） */
  function overlap(a, b) {
    var A = T(a), B = T(b).replace(/[\s，。；：、,.;:()（）「」“”"'\-—/？?！!]+/g, ' ');
    if (!A || !B) return false;
    var hits = 0, seen = {};
    B.split(' ').forEach(function (seg) {
      for (var i = 0; i + 2 <= seg.length; i++) {
        var g = seg.substr(i, 2);
        if (seen[g] || /^(的|是|在|了|和|与|或|有|个|这|那|什么|哪些|如何|怎么|要求|可以|需要|一个|进行)/.test(g)) continue;
        seen[g] = 1;
        if (A.indexOf(g) >= 0) hits++;
      }
    });
    return hits >= 2;
  }
  function orNA(v) { return T(v) || '（待填写）'; }

  /* ---------------- ch3-t3 助手 ---------------- */
  var BRACKET = { task: '任务', ctx: '背景', cons: '约束', fmt: '输出格式' };
  function promptText(s, esc, dropKey) {
    return ['task', 'ctx', 'cons', 'fmt'].map(function (k) {
      var v = T(s['p_' + k]);
      if (!v) return '<b>[' + BRACKET[k] + ']</b> <i>（待填写）</i>';
      if (dropKey === k) return '<s>[' + BRACKET[k] + '] ' + esc(v) + '</s>';
      return '<b>[' + BRACKET[k] + ']</b> ' + esc(v);
    }).join('\n');
  }
  function dropKeyOf(s) {
    return Object.keys(BRACKET).filter(function (x) { return BRACKET[x] === s.drop; })[0] || null;
  }

  /* ---------------- ch4-t3 助手 ---------------- */
  function tplVars(s) { return (String(s.tpl || '').match(/\{[^{}]+\}/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }); }
  function parseKV(str) {
    var out = {};
    T(str).split(/[；;\n]+/).forEach(function (p) {
      var m = p.match(/^\s*\{?([^=：:{}]+)\}?\s*[=：:]\s*([\s\S]*)$/);
      if (m) out['{' + T(m[1]) + '}'] = T(m[2]);
    });
    return out;
  }
  function fillTpl(s, i, esc) {
    var tpl = String(s.tpl || '');
    if (!T(tpl)) return '<i>（先写模板）</i>';
    var kv = parseKV((rows(s, 'fill')[i] || {}).values);
    return esc(tpl).replace(/\{[^{}]+\}/g, function (v) {
      var raw = v.replace(/&amp;/g, '&');
      return kv[raw] ? '<em>' + esc(kv[raw]) + '</em>' : '<s>' + v + '</s>';
    });
  }

  window.LABS = [
    /* ================= 第 2 章 ================= */
    {
      id: 'ch2-t3', chapter: 2, minutes: 15,
      title: '在架构图上标出一次文本从输入到输出的路径',
      short: '架构路径标注',
      intro: '选一个短句，沿 Transformer 的数据流按顺序写出至少 4 个编号说明；遮住图复述后再回到图上校正一处遗漏。动画页负责给你图，这里负责把你自己的说明留下来。',
      source: { label: '先看动画 ▸ transformer_cg.html', href: '../transformer_cg.html' },
      sections: [
        { title: '选一个输入短句', fields: [
          { key: 'sent', type: 'text', label: '输入短句', placeholder: '例如：今天的天气很好' } ] },
        { title: '沿箭头写编号说明', hint: '每一行对应数据流的一个模块，说明「这一步传递的是什么」。至少填 4 行，顺序从输入开始、终于输出。', fields: [
          { key: 'path', type: 'rows', count: 5, label: '路径编号表', rowLabels: ['01', '02', '03', '04', '05'],
            cols: [ { key: 'module', type: 'select', label: '模块', options: ['输入表示', '注意力层', '前馈层', '输出位置', '其他（在说明里写明）'] },
                    { key: 'note', label: '这一步传递的是什么（用自己的话）' } ] } ] },
        { title: '遮图复述与校正', fields: [
          { key: 'recall', type: 'textarea', label: '遮住图后的复述（4 步）', rows: 4, min: 40 },
          { key: 'fix', type: 'textarea', label: '打开图后校正的一处遗漏', rows: 2, min: 10, placeholder: '例如：漏掉了位置信息是在输入表示阶段加进去的' } ] }
      ],
      artifact: { label: '路径图（文本版）', render: function (s, esc) {
        var r = rows(s, 'path').filter(function (x) { return L(x.module) || L(x.note); });
        if (!r.length) return '<i>（填写路径表后在此生成）</i>';
        return '<b>' + esc(orNA(s.sent)) + '</b>\n' + r.map(function (x, i) { return '  ' + (i + 1) + '. <b>' + esc(x.module || '?') + '</b> → ' + esc(x.note || '…'); }).join('\n');
      } },
      checks: [
        { text: '至少 4 行编号，每行有模块和说明', test: function (s) { return rows(s, 'path').filter(function (r) { return filled(r, ['module', 'note']); }).length >= 4; } },
        { text: '第一行是「输入表示」，最后一个有效行是「输出位置」', why: '对应预期成果：编号顺序从输入开始并终于输出', test: function (s) {
          var r = rows(s, 'path').filter(function (x) { return filled(x, ['module', 'note']); });
          return r.length >= 4 && r[0].module === '输入表示' && r[r.length - 1].module === '输出位置'; } },
        { text: '中间出现了注意力层和前馈层，没有跳过', test: function (s) { var m = rows(s, 'path').map(function (r) { return r.module; }); return m.indexOf('注意力层') >= 0 && m.indexOf('前馈层') >= 0; } },
        { text: '每行说明都是自己的话（不少于 6 字，且各行不重复）', why: '对应反作弊：每个编号须包含你自己的流程说明', test: function (s) {
          var n = rows(s, 'path').map(function (r) { return T(r.note); }).filter(Boolean);
          return n.length >= 4 && n.every(function (x) { return x.length >= 6; }) && distinct(n); } },
        { text: '复述与一处校正都已写下', test: function (s) { return L(s.recall) >= 40 && L(s.fix) >= 10; } }
      ]
    },

    /* ================= 第 3 章 ================= */
    {
      id: 'ch3-t3', chapter: 3, minutes: 12,
      title: '把一条需求拆成提示词的任务、背景与输出格式',
      short: '提示词四要素拆解',
      intro: '写一版带标注的提示词，删掉一个要素预测模型会缺什么，再补一条可观察的验收条件。页面只做形式自检，不调用任何模型。',
      source: { label: '先看动画 ▸ prompt_cg.html', href: '../prompt_cg.html' },
      sections: [
        { title: '选一个小需求', hint: '从自己的学习或工作里选，例如「整理一段会议纪要」。', fields: [
          { key: 'need', type: 'text', label: '一句话需求', placeholder: '例如：把上周小组讨论的录音文字稿整理成纪要' } ] },
        { title: '写第一版提示词，按四要素分段', hint: '每个方括号里都要有实际文本，不能只写标签。右栏会实时拼出完整提示词。', fields: [
          { key: 'p_task', type: 'textarea', label: '[任务] 要模型做什么', min: 10, placeholder: '把下面的讨论文字稿整理成一份会议纪要' },
          { key: 'p_ctx', type: 'textarea', label: '[背景] 模型需要知道的前提', min: 10, placeholder: '这是一次 5 人的课程小组讨论，主题是期末项目分工' },
          { key: 'p_cons', type: 'textarea', label: '[约束] 不能做什么、范围与限制', min: 10, placeholder: '不要补充文字稿里没有的决定；不超过 300 字' },
          { key: 'p_fmt', type: 'textarea', label: '[输出格式] 结果长什么样', min: 10, placeholder: '三个小节：议题 / 结论 / 待办（含负责人）' } ] },
        { title: '删掉一个要素，预测会缺什么', hint: '选择要删除的要素后，下方显示删掉后的版本；预测必须对应被删的那一段。', fields: [
          { key: 'drop', type: 'select', label: '删掉哪一个要素', options: ['任务', '背景', '约束', '输出格式'] },
          { key: 'dropped', type: 'derived', label: '删掉后的提示词', render: function (s, esc) { return promptText(s, esc, dropKeyOf(s)); } },
          { key: 'predict', type: 'textarea', label: '预测：模型的输出可能缺什么或出什么错', min: 15, placeholder: '例如：删掉[约束]后，模型可能补写文字稿里没有的决定，篇幅也不受限' } ] },
        { title: '恢复后写一条可观察的验收条件', hint: '「可观察」= 拿到输出后能直接检查真假，例如「待办里每一项都有负责人」。', fields: [
          { key: 'accept', type: 'textarea', label: '验收条件', min: 10, placeholder: '输出包含议题 / 结论 / 待办三个小节，且待办每项都写了负责人' } ] }
      ],
      artifact: { label: '拼合后的提示词（带标注，可直接复制去用）', render: function (s, esc) { return promptText(s, esc, null); } },
      checks: [
        { text: '四类要素都有实际文本（各不少于 10 字）', why: '对应预期成果：每个标注段都有实际文本，不是只写标签',
          test: function (s) { return ['p_task', 'p_ctx', 'p_cons', 'p_fmt'].every(function (k) { return L(s[k]) >= 10; }); } },
        { text: '任务段没有出现「帮我做好」一类空泛句', why: '对应反作弊：不能用空泛句代替四类要素',
          test: function (s) { return L(s.p_task) > 0 && !HOLLOW.test(T(s.p_task)); } },
        { text: '已选择要删除的要素，并写了预测', test: function (s) { return !!s.drop && L(s.predict) >= 15; } },
        { text: '预测里提到了被删要素的名称或其内容里的词', why: '对应反作弊：删减预测必须对应被删的具体部分',
          test: function (s) { var k = dropKeyOf(s); if (!k) return false; return T(s.predict).indexOf(s.drop) >= 0 || overlap(s.predict, s['p_' + k]); } },
        { text: '验收条件已填写，且不只是「效果好」「准确」这类不可观察的词', test: function (s) { return L(s.accept) >= 10 && !VAGUE.test(T(s.accept)); } }
      ]
    },

    /* ================= 第 4 章 ================= */
    {
      id: 'ch4-t2', chapter: 4, minutes: 15,
      title: '在自己搭的智能体上，标出「感知—决策—执行」三步各发生在哪',
      short: '三段循环标注',
      intro: '把 ch4-t1 那次真实对话逐条回看，把感知 / 决策 / 执行三步落到具体消息上；某一步在你的智能体上不存在，也要明确写出来。截图另存即可，这里只留文字证据。',
      source: { label: '先看动画 ▸ agentic_cg', href: '../agentic_cg/index.html' },
      external: '前置：ch4-t1 的真实对话',
      sections: [
        { title: '抄下动画里对三段循环的定义', fields: [
          { key: 'def', type: 'textarea', label: '原始定义（照抄，后面要对照）', rows: 3, min: 20 } ] },
        { title: '贴入 ch4-t1 那次对话，并给每条消息编号', hint: '每行一条消息，格式随意；只要后面标注时能指到「第几条」。', fields: [
          { key: 'dialog', type: 'textarea', label: '对话记录（你自己那次）', rows: 8, min: 60, placeholder: '1 我：帮我查一下明天北京的天气\n2 智能体：正在调用天气插件…\n3 智能体：明天北京多云，最高 26 度' } ] },
        { title: '把三步分别落到具体消息上', hint: '「落在哪」要写第几条消息或引用那句话；若这一步不存在，选「缺失」并在依据里写为什么。', fields: [
          { key: 'loop', type: 'rows', count: 3, label: '三步标注', rowLabels: ['感知', '决策', '执行'],
            cols: [ { key: 'status', type: 'select', label: '状态', options: ['存在', '缺失'] }, { key: 'where', label: '落在第几条消息 / 哪句话' }, { key: 'evidence', label: '依据（它读到 / 判断 / 做了什么）' } ] } ] },
        { title: '缺失说明或关闭插件对照', hint: '卡住了怎么办：把插件关掉再问同样的问题，两次现象的差异就是「执行」那一步的位置。', fields: [
          { key: 'note', type: 'textarea', label: '若某步缺失：为什么；或关闭插件后两次现象的差异', rows: 3 } ] }
      ],
      artifact: { label: '循环图（文本版）', render: function (s, esc) {
        var r = rows(s, 'loop'); var names = ['感知', '决策', '执行'];
        return names.map(function (n, i) { var x = r[i] || {}; return '<b>' + n + '</b> ' + (x.status === '缺失' ? '<s>缺失</s>' : '') + ' → ' + esc(orNA(x.where)); }).join('\n');
      } },
      checks: [
        { text: '已抄下原始定义并贴入自己的对话（不少于 40 字）', test: function (s) { return L(s.def) >= 20 && L(s.dialog) >= 40; } },
        { text: '三步都有状态，「存在」的行写了位置和依据', why: '对应预期成果：标注落到了具体消息上，而不是画在空白处', test: function (s) {
          return allRows(s, 'loop', 3, function (r) { return r.status === '缺失' ? L(r.evidence) >= 6 : (r.status === '存在' && L(r.where) >= 2 && L(r.evidence) >= 6); }); } },
        { text: '「落在哪」引用了对话里出现过的词或编号', why: '对应反作弊：标注必须落在你自己那次真实对话上', test: function (s) {
          var d = T(s.dialog), ex = rows(s, 'loop').filter(function (r) { return r.status === '存在'; });
          return ex.length > 0 && ex.every(function (r) { return /\d/.test(T(r.where)) || overlap(d, r.where); }); } },
        { text: '三步状态都已选择；若有缺失步，已在第 4 区写明为什么', test: function (s) { var r = rows(s, 'loop'); if (r.length !== 3 || !r.every(function (x) { return !!x.status; })) return false; var miss = r.some(function (x) { return x.status === '缺失'; }); return !miss || L(s.note) >= 10; } }
      ]
    },
    {
      id: 'ch4-t3', chapter: 4, minutes: 12,
      title: '把一个重复提问填进可复用的 Prompt 模板',
      short: '模板与两次填充',
      intro: '写一个含 {材料}、{受众} 等变量槽位的模板，填两组不同变量；页面自动替换生成两条完整提示，高亮变化部分，未替换的槽位划线提示。',
      source: { label: '先看动画 ▸ agentic_cg', href: '../agentic_cg/index.html' },
      sections: [
        { title: '选一个会反复问的任务', fields: [ { key: 'task', type: 'text', label: '任务描述', placeholder: '例如：把材料概括成三个要点' } ] },
        { title: '写模板', hint: '固定指令写死，可变部分用花括号 {变量名} 表示。至少 2 个变量。', fields: [
          { key: 'tpl', type: 'textarea', label: '模板正文', rows: 4, placeholder: '把下面的{材料}概括成三个要点，面向{受众}，每点不超过 30 字。' },
          { key: 'vars', type: 'derived', label: '识别到的变量槽位', render: function (s, esc) { var v = tplVars(s); return v.length ? v.map(function (x) { return '<b>' + esc(x) + '</b>'; }).join('  ') : '<i>（尚未识别到 {变量}）</i>'; } } ] },
        { title: '两次填充', hint: '每行按「变量名=值；变量名=值」填写，例如：材料=第三章课堂笔记；受众=没上课的同学', fields: [
          { key: 'fill', type: 'rows', count: 2, label: '变量取值', rowLabels: ['A', 'B'], cols: [ { key: 'values', label: '变量名=值；变量名=值' } ] },
          { key: 'outA', type: 'derived', label: '完整提示 A（自动替换）', render: function (s, esc) { return fillTpl(s, 0, esc); } },
          { key: 'outB', type: 'derived', label: '完整提示 B（自动替换）', render: function (s, esc) { return fillTpl(s, 1, esc); } } ] },
        { title: '为什么适合复用', fields: [ { key: 'why', type: 'textarea', label: '圈出不变部分后，写一句它为什么适合复用', rows: 2, min: 12 } ] }
      ],
      artifact: { label: '模板 + 变量', render: function (s, esc) { return (T(s.tpl) ? esc(s.tpl).replace(/\{[^{}]+\}/g, '<b>$&</b>') : '<i>（待填写）</i>'); } },
      checks: [
        { text: '模板含至少 2 个不同的 {变量} 槽位', test: function (s) { return tplVars(s).length >= 2; } },
        { text: '两次填充都给全部变量赋了值，且两组取值不同', why: '对应预期成果：两次结果使用同一固定指令，只有变量值不同', test: function (s) {
          var v = tplVars(s); if (v.length < 2) return false;
          var a = parseKV((rows(s, 'fill')[0] || {}).values), b = parseKV((rows(s, 'fill')[1] || {}).values);
          var full = v.every(function (k) { return a[k] && b[k]; });
          return full && v.some(function (k) { return a[k] !== b[k]; }); } },
        { text: '模板正文本身仍保留槽位（没有被填充值覆盖）', why: '对应反作弊：必须保留原始变量槽位版本', test: function (s) { return tplVars(s).length >= 2 && /\{/.test(String(s.tpl || '')); } },
        { text: '写了一句复用理由', test: function (s) { return L(s.why) >= 12; } }
      ]
    },
    {
      id: 'ch4-t4', chapter: 4, minutes: 15,
      title: '把一份材料画成接入、索引、提问三段数据链路',
      short: '三段链路与失败信号',
      intro: '用自己的一段短材料走一遍「接入 → 切分/索引 → 提问/取回」，为每段写一个可见失败信号和一条排查顺序。不需要真的建索引。',
      source: { label: '先看动画 ▸ rag_cg', href: '../rag_cg/index.html' },
      sections: [
        { title: '材料与问题', hint: '问题必须是材料里能回答的；自检会检查问题与材料是否有共同词。', fields: [
          { key: 'material', type: 'textarea', label: '自拟材料（150 字以内）', rows: 5, min: 30, max: 150 },
          { key: 'question', type: 'text', label: '材料内能回答的一个问题' } ] },
        { title: '三段链路', fields: [
          { key: 'chain', type: 'rows', count: 3, label: '每段的输入 / 输出 / 失败信号', rowLabels: ['接入', '切分/索引', '提问/取回'],
            cols: [ { key: 'io', label: '这一段输入什么、输出什么' }, { key: 'fail', label: '一个可见失败信号', placeholder: '例如：文件读不到 / 内容找不到 / 回答无依据' } ] } ] },
        { title: '排查顺序', fields: [
          { key: 'pick', type: 'select', label: '针对哪一段的失败信号', options: ['接入', '切分/索引', '提问/取回'] },
          { key: 'order', type: 'textarea', label: '先检查哪一步，再检查哪一步', rows: 3, min: 15 } ] }
      ],
      artifact: { label: '数据链路图（文本版）', render: function (s, esc) {
        var r = rows(s, 'chain'); var n = ['接入', '切分/索引', '提问/取回'];
        return n.map(function (x, i) { var c = r[i] || {}; return '<b>' + x + '</b>  ' + esc(orNA(c.io)) + '\n   失败信号：' + esc(orNA(c.fail)); }).join('\n   ↓\n');
      } },
      checks: [
        { text: '材料 30 至 150 字，且问题与材料有共同词', why: '对应预期成果：问题与材料内容相对应，不能用无关问题充数', test: function (s) { return L(s.material) >= 30 && L(s.material) <= 150 && L(s.question) >= 4 && overlap(s.material, s.question); } },
        { text: '三段都写了输入/输出和失败信号', test: function (s) { return allRows(s, 'chain', 3, function (r) { return filled(r, ['io', 'fail']); }); } },
        { text: '三个失败信号互不相同', test: function (s) { return distinct(rows(s, 'chain').map(function (r) { return T(r.fail); })); } },
        { text: '排查顺序已选定对象且写了先后', test: function (s) { return !!s.pick && L(s.order) >= 15 && /(先|再|然后|之后|最后)/.test(T(s.order)); } }
      ]
    },

    /* ================= 第 5 章 ================= */
    {
      id: 'ch5-t1', chapter: 5, minutes: 30,
      title: '装一次，并在自己新建的空目录里让它真做一件事',
      short: '安装与首次真实调用记录',
      intro: '这题必须在本机终端完成；工作台只负责把「目录路径 / 终端回显 / 目录文件列表 / 卡点」按格式记下来。装不上也是有效记录。',
      source: { label: '先看动画 ▸ claude_cg', href: '../claude_cg/index.html' },
      external: '需本机安装工具 · 以官方文档为准',
      sections: [
        { title: '目录与工具', fields: [
          { key: 'dir', type: 'text', label: '你新建的空目录路径（自己起的名字）', placeholder: '例如 D:\\cc-lab 或 ~/cc-lab' },
          { key: 'tool', type: 'text', label: '使用的工具与版本号', placeholder: '例如：Claude Code 1.x（以你终端 --version 输出为准）' } ] },
        { title: '证据', warn: '粘贴前请自查：不含 API Key、Token 或任何凭据。自检会做粗略扫描，但最终责任在你。', fields: [
          { key: 'echo', type: 'textarea', label: '终端回显（读取文件并总结那一步）', rows: 6, min: 40 },
          { key: 'ls', type: 'textarea', label: '目录文件列表（它新建文件之后）', rows: 4, min: 10, placeholder: 'ls -la 或 dir 的输出' },
          { key: 'notmine', type: 'textarea', label: '指出「这一步是它做的，不是我手打的」', rows: 2, min: 10 } ] },
        { title: '卡点（如有）', fields: [
          { key: 'outcome', type: 'select', label: '结果', options: ['跑通了：它读了文件也新建了文件', '装上了但卡在额度 / 登录', '安装失败'] },
          { key: 'stuck', type: 'textarea', label: '失败信息原文与卡在哪一步（跑通了可留空）', rows: 3 } ] }
      ],
      artifact: { label: '记录摘要', render: function (s, esc) { return '<b>目录</b> ' + esc(orNA(s.dir)) + '\n<b>工具</b> ' + esc(orNA(s.tool)) + '\n<b>结果</b> ' + esc(orNA(s.outcome)); } },
      checks: [
        { text: '目录路径是自定义的，不是项目目录', why: '对应反作弊：使用项目目录或别人的路径无法证明是你亲自做的', test: function (s) { var d = T(s.dir); return d.length >= 3 && !/ai-master|github-upload|node_modules|Program Files|System32/i.test(d); } },
        { text: '已写工具与版本', test: function (s) { return L(s.tool) >= 3; } },
        { text: '结果已选择；跑通的有回显 + 文件列表 + 「它做的」说明，未跑通的有失败原文', why: '对应预期成果：能指出「这一步是它做的，不是我手打的」', test: function (s) {
          if (!s.outcome) return false;
          if (/跑通/.test(s.outcome)) return L(s.echo) >= 40 && L(s.ls) >= 10 && L(s.notmine) >= 10;
          return L(s.stuck) >= 15; } },
        { text: '粘贴内容未检出疑似密钥（粗扫）', why: '题目要求：API 凭据只放在本机环境变量里', test: function (s) { var all = [s.echo, s.ls, s.stuck].join('\n'); return L(all) > 0 && !SECRET.test(all); } }
      ]
    },
    {
      id: 'ch5-t2', chapter: 5, minutes: 12,
      title: '把「指令 / 技能 / 钩子」三者的触发时机排成一张表',
      short: '三类扩展对照表',
      intro: '先抄原始定义，再逐行填「何时触发 / 由谁触发 / 典型用途」，最后用自己的话写钩子与指令的本质区别。自检会比对你那一句和定义原文是否雷同。',
      source: { label: '先看动画 ▸ claude_cg', href: '../claude_cg/index.html' },
      sections: [
        { title: '原始定义', fields: [ { key: 'defs', type: 'textarea', label: '从 claude_cg 页面或官方文档抄下的定义（注明出处）', rows: 4, min: 30 } ] },
        { title: '三行三列表', fields: [
          { key: 'table', type: 'rows', count: 3, label: '对照表', rowLabels: ['斜杠指令', '技能', '钩子'],
            cols: [ { key: 'when', label: '什么时候被触发' }, { key: 'who', type: 'select', label: '由谁触发', options: ['人', '系统', '两者皆可'] }, { key: 'use', label: '典型用途' } ] } ] },
        { title: '本质区别', hint: '卡住了怎么办：找一个日常场景类比，例如「打电话」——谁先开口、谁自动发生。', fields: [
          { key: 'diff', type: 'textarea', label: '用自己的话：钩子与指令最本质的区别', rows: 2, min: 15 } ] }
      ],
      artifact: { label: '对照表', render: function (s, esc) {
        var r = rows(s, 'table'); var n = ['斜杠指令', '技能', '钩子'];
        return n.map(function (x, i) { var c = r[i] || {}; return '<b>' + x + '</b>\n   触发：' + esc(orNA(c.when)) + '\n   由谁：' + esc(orNA(c.who)) + '\n   用途：' + esc(orNA(c.use)); }).join('\n');
      } },
      checks: [
        { text: '已抄下原始定义', test: function (s) { return L(s.defs) >= 30; } },
        { text: '三行三列全部填满', test: function (s) { return allRows(s, 'table', 3, function (r) { return filled(r, ['when', 'who', 'use']); }); } },
        { text: '钩子与指令的「由谁触发」不同', why: '题目要点：哪个是人主动按下去的，哪个是系统在事件上自动跑的', test: function (s) { var r = rows(s, 'table'); return r.length === 3 && r[0].who && r[2].who && r[0].who !== r[2].who; } },
        { text: '最后一句是自己的话，不是定义原文的连续片段', why: '对应反作弊：直接抄页面定义原文只算完成了抄写', test: function (s) {
          var d = T(s.diff), src = T(s.defs); if (d.length < 15) return false;
          for (var i = 0; i + 12 <= d.length; i++) { if (src.indexOf(d.substr(i, 12)) >= 0) return false; }
          return true; } }
      ]
    },

    /* ================= 第 6 章 ================= */
    {
      id: 'ch6-t2', chapter: 6, minutes: 20,
      title: '手工制造一次「检索失败」，并把它归因到具体环节',
      short: '检索失败归因',
      intro: '在 rag_starlab 做一次入库 + 检索并故意制造失败，把现象、归类、依据和先改哪一环记录下来。「卡在入库」本身也是一条有效归因。',
      source: { label: '去操作 ▸ rag_starlab', href: '../rag_starlab/index.html' },
      external: '前置：在 rag_starlab 跑一次',
      sections: [
        { title: '入库与原问法', fields: [
          { key: 'doc', type: 'textarea', label: '你入库的材料（贴关键段落即可）', rows: 3, min: 20 },
          { key: 'q0', type: 'text', label: '正常问法（应该能命中的）' } ] },
        { title: '制造失败', hint: '例如：问一个语义相近但用词完全不同的说法。', fields: [
          { key: 'q1', type: 'text', label: '改写过用词的问法' },
          { key: 'recalled', type: 'textarea', label: '实际召回的段落原文（贴出来；没召回就写「无」）', rows: 4, min: 1 } ] },
        { title: '归因', fields: [
          { key: 'kind', type: 'select', label: '属于哪一类失败', options: ['没入库', '检索没命中', '召回了但没用上', '卡在某一步没跑通'] },
          { key: 'basis', type: 'textarea', label: '判断依据（指向具体现象）', rows: 3, min: 20 },
          { key: 'fix', type: 'select', label: '要修好它，先动哪一环', options: ['切分', '入库', '召回', '重排', '生成'] },
          { key: 'fixwhy', type: 'text', label: '一句话：为什么先动这一环' } ] }
      ],
      artifact: { label: '失败记录', render: function (s, esc) { return '<b>现象</b> 问「' + esc(orNA(s.q1)) + '」→ 召回：' + esc(T(s.recalled).slice(0, 60) || '（待填写）') + '\n<b>归类</b> ' + esc(orNA(s.kind)) + '\n<b>先改</b> ' + esc(orNA(s.fix)); } },
      checks: [
        { text: '入库材料、正常问法、改写问法都已填写，且两种问法不同', test: function (s) { return L(s.doc) >= 20 && L(s.q0) >= 3 && L(s.q1) >= 3 && T(s.q0) !== T(s.q1); } },
        { text: '贴出了召回结果原文（或明确写「无」）', why: '对应反作弊：现象具体到可复核，例如贴出召回的那段文字', test: function (s) { return L(s.recalled) >= 1; } },
        { text: '已归类，且依据不是「效果不好」这类笼统词', test: function (s) { return !!s.kind && L(s.basis) >= 20 && !VAGUE.test(T(s.basis)); } },
        { text: '依据里引用了召回结果或材料里的词', why: '对应预期成果：依据指的是具体现象，而不是「感觉不准」', test: function (s) { return overlap(s.basis, s.recalled) || overlap(s.basis, s.doc) || /无|没有召回|空/.test(T(s.recalled)); } },
        { text: '写了先动哪一环及理由', test: function (s) { return !!s.fix && L(s.fixwhy) >= 8; } }
      ]
    },
    {
      id: 'ch6-t3', chapter: 6, minutes: 12,
      title: '为一个难问题选择检索增强、改写或拒答路线',
      short: '三问题路由表',
      intro: '自拟三个覆盖度不同的问题，各选一条路线并说明依据；三种路线至少各出现一次，每行必须解释而不是只填术语。',
      source: { label: '先看动画 ▸ rag_cg', href: '../rag_cg/index.html' },
      sections: [
        { title: '材料范围', fields: [ { key: 'scope', type: 'text', label: '假设你的材料是什么（一句话）', placeholder: '例如：本学期《操作系统》课程的 8 份课件' } ] },
        { title: '路由表', fields: [
          { key: 'route', type: 'rows', count: 3, label: '三个问题', rowLabels: ['明确包含', '措辞不同', '明显没有'],
            cols: [ { key: 'q', label: '问题' }, { key: 'path', type: 'select', label: '路线', options: ['直接检索', '先改写再检索', '明确拒答'] }, { key: 'basis', type: 'select', label: '依据类型', options: ['材料覆盖', '措辞差异', '知识边界'] }, { key: 'why', label: '解释（不能只填术语）' } ] } ] },
        { title: '二次处理', fields: [
          { key: 'pick', type: 'select', label: '任选一题', options: ['明确包含', '措辞不同', '明显没有'] },
          { key: 'second', type: 'textarea', label: '第一次检索失败后增加的第二步', rows: 2, min: 12 } ] }
      ],
      artifact: { label: '路由表', render: function (s, esc) {
        var r = rows(s, 'route'); var n = ['明确包含', '措辞不同', '明显没有'];
        return n.map(function (x, i) { var c = r[i] || {}; return '<b>' + x + '</b> ' + esc(orNA(c.q)) + '\n   → ' + esc(orNA(c.path)) + '（' + esc(orNA(c.basis)) + '）'; }).join('\n');
      } },
      checks: [
        { text: '三个问题都已写出，且互不相同', test: function (s) { var q = rows(s, 'route').map(function (r) { return T(r.q); }); return q.length === 3 && q.every(function (x) { return x.length >= 4; }) && distinct(q); } },
        { text: '三种路线各出现一次', why: '对应反作弊：不能把所有问题都选同一路线', test: function (s) { var p = rows(s, 'route').map(function (r) { return r.path; }); return p.length === 3 && distinct(p); } },
        { text: '每行有依据类型和不少于 10 字的解释', why: '对应反作弊：每行必须解释选择，而非只填术语', test: function (s) { return allRows(s, 'route', 3, function (r) { return !!r.basis && L(r.why) >= 10 && !/^(材料覆盖|措辞差异|知识边界)$/.test(T(r.why)); }); } },
        { text: '二次处理已选题并写了第二步', test: function (s) { return !!s.pick && L(s.second) >= 12; } }
      ]
    },
    {
      id: 'ch6-t4', chapter: 6, minutes: 12,
      title: '为一个 RAG 回答写出「不能保证」清单',
      short: '不能保证清单',
      intro: '从材料完整、材料时效、检索命中、生成忠实四个角度各写一条边界与缓解动作，再把一句过度承诺改成带条件表述。四条边界必须对应不同失败来源。',
      source: { label: '先看动画 ▸ rag_cg', href: '../rag_cg/index.html' },
      sections: [
        { title: '被评估的回答', fields: [ { key: 'claim', type: 'textarea', label: '选 ch6-t1 或 ch6-t2 的一次回答：它声称回答了什么', rows: 2, min: 10 } ] },
        { title: '四条边界', fields: [
          { key: 'limits', type: 'rows', count: 4, label: '不能保证 / 缓解动作', rowLabels: ['材料完整', '材料时效', '检索命中', '生成忠实'],
            cols: [ { key: 'limit', label: '不能保证什么（写清来自哪个环节）' }, { key: 'action', label: '学习者能执行的缓解动作' } ] } ] },
        { title: '改写一句过度承诺', fields: [
          { key: 'before', type: 'text', label: '原来的过度承诺', placeholder: '例如：这个回答一定是对的' },
          { key: 'after', type: 'text', label: '改成带条件的表述', placeholder: '例如：在材料包含 X 且检索命中的前提下，回答与材料一致' } ] }
      ],
      artifact: { label: '不能保证清单', render: function (s, esc) {
        var r = rows(s, 'limits'); var n = ['材料完整', '材料时效', '检索命中', '生成忠实'];
        return n.map(function (x, i) { var c = r[i] || {}; return '<b>' + x + '</b> 不能保证：' + esc(orNA(c.limit)) + '\n   缓解：' + esc(orNA(c.action)); }).join('\n');
      } },
      checks: [
        { text: '写下了被评估回答的声称', test: function (s) { return L(s.claim) >= 10; } },
        { text: '四条边界与缓解动作全部填写', test: function (s) { return allRows(s, 'limits', 4, function (r) { return filled(r, ['limit', 'action']); }); } },
        { text: '四条边界互不相同，且没有一条只是「可能不准确」', why: '对应反作弊：必须说明不准确来自哪个环节', test: function (s) { var l = rows(s, 'limits').map(function (r) { return T(r.limit); }); return l.length === 4 && distinct(l) && l.every(function (x) { return x.length >= 8 && !VAGUE.test(x); }); } },
        { text: '改写后的句子含条件词（如果 / 在…前提下 / 当 / 仅当 / 除非）', test: function (s) { return L(s.before) >= 4 && L(s.after) >= 8 && T(s.before) !== T(s.after) && /(如果|前提|当|仅当|除非|只有|若|在.+下)/.test(T(s.after)); } }
      ]
    },

    /* ================= 第 8 章 ================= */
    {
      id: 'ch8-t3', chapter: 8, minutes: 15,
      title: '把四段自拟材料切块并手工找出最相关片段',
      short: '手工切块与排序',
      intro: '写四段材料、一个问题，按相关性排序并圈出支撑原句；答案写成「结论 + 片段编号」。自检会核对你圈出的原句确实出现在第一名片段里。',
      source: { label: '先看动画 ▸ rag_cg', href: '../rag_cg/index.html' },
      sections: [
        { title: '四段材料', hint: '每段 40 至 80 字，右侧字数实时显示。', fields: [
          { key: 'chunks', type: 'rows', count: 4, label: '材料片段', rowLabels: ['P1', 'P2', 'P3', 'P4'], cols: [ { key: 'body', label: '正文（40 至 80 字）' } ] } ] },
        { title: '问题与排序', fields: [
          { key: 'q', type: 'text', label: '只能由其中一段明确回答的问题' },
          { key: 'rank', type: 'rows', count: 4, label: '相关性排序', rowLabels: ['第 1', '第 2', '第 3', '第 4'], cols: [ { key: 'pid', type: 'select', label: '片段', options: ['P1', 'P2', 'P3', 'P4'] }, { key: 'why', label: '依据' } ] },
          { key: 'quote', type: 'textarea', label: '第 1 名里支撑答案的原句（原样复制）', rows: 2, min: 6 } ] },
        { title: '回答', fields: [
          { key: 'answer', type: 'text', label: '结论 + 片段编号', placeholder: '例如：…… （P2）' },
          { key: 'fallback', type: 'select', label: '若第 1 名不相关，先回查', options: ['切块', '问题表述'] } ] }
      ],
      artifact: { label: '排序表', render: function (s, esc) {
        var r = rows(s, 'rank');
        return r.map(function (c, i) { return (i + 1) + '. <b>' + esc(c.pid || '?') + '</b> ' + esc(orNA(c.why)); }).join('\n') + '\n<b>答</b> ' + esc(orNA(s.answer));
      } },
      checks: [
        { text: '四段材料各 40 至 80 字', test: function (s) { var c = rows(s, 'chunks'); return c.length === 4 && c.every(function (r) { var n = L(r.body); return n >= 40 && n <= 80; }); } },
        { text: '问题已写，且四个片段各出现一次于排序表', why: '对应反作弊：排序表保留全部 4 个候选', test: function (s) { return L(s.q) >= 4 && distinct(rows(s, 'rank').map(function (r) { return r.pid; })) && rows(s, 'rank').length === 4; } },
        { text: '每一名都有依据', test: function (s) { return allRows(s, 'rank', 4, function (r) { return L(r.why) >= 4; }); } },
        { text: '圈出的原句确实出现在第 1 名片段里', why: '对应预期成果：被引用的原句确实能支撑结论', test: function (s) {
          var top = (rows(s, 'rank')[0] || {}).pid; if (!top) return false;
          var body = T((rows(s, 'chunks')[Number(top.slice(1)) - 1] || {}).body);
          var qt = T(s.quote); return qt.length >= 6 && body.indexOf(qt) >= 0; } },
        { text: '回答里带了片段编号，并选了回查对象', test: function (s) { return /P[1-4]/.test(T(s.answer)) && L(s.answer) >= 6 && !!s.fallback; } }
      ]
    }
  ];
})();
