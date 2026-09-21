/**
 * AI Master — Learning Workspace 本地降级模块
 *
 * 当 Express 后端不可用时（如 Cloudflare Pages 静态部署），
 * 用 localStorage 提供基础学习功能：学习计划、进度记录、讲解草稿、测验记录。
 *
 * AI 复评、动态测验题目等需要后端的功能降级为本地规则检查。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'aimaster_learning_state';
  const CATALOG_KEY = 'aimaster_catalog';

  // 默认学习模块目录（与后端 catalog 对齐的精简版）
  const DEFAULT_CATALOG = [
    { id: 'llm-basics', title: '大模型如何生成回答', objective: '解释 token、上下文预测与幻觉，并给出需要核验的实际案例。', bloom: ['理解', '应用'], learnUrl: '../chapter/1/index.html#kp-1', summary: ['自回归语言模型把文本编码为 token，根据上下文逐步预测后续 token。', '预训练通常更新参数；上下文学习通常不更新参数。', '语言流畅不保证事实正确，需要外部证据核验。'], concepts: [{ label: 'token 与文本编码' }, { label: '基于上下文预测' }, { label: '幻觉与事实核验' }], prompt: '向没有学过 AI 的同学解释：大模型怎样从 token 生成回答？用一个校园场景说明它为什么可能答错，以及你会怎样核验。' },
    { id: 'prompt-design', title: '把任务写成可验收的提示', objective: '为具体任务写清输入、约束与输出格式，并设计验证方法。', bloom: ['应用', '评价'], learnUrl: '../chapter/3/index.html#kp-2', summary: ['有效提示应交代任务目标、输入背景、约束和输出格式。', '对结构化结果应使用解析器、字段校验和边界用例验收。', '提示词迭代要使用固定测试集比较，而非只挑一次满意的输出。'], concepts: [{ label: '任务和输入背景' }, { label: '约束及输出格式' }, { label: '验证与测试' }], prompt: '为校园活动报名信息提取设计一个提示：说明任务和输入、输出字段、缺失信息的处理，再举例说明如何检验结果及提示无法保证的事情。' },
    { id: 'transformer', title: '理解注意力与位置信息', objective: '解释注意力如何组合上下文信息，以及为什么仍需要位置信息。', bloom: ['理解', '分析'], learnUrl: '../chapter/2/index.html#kp-2', summary: ['自注意力根据 Query 与 Key 的匹配程度计算权重，用权重组合 Value。', '标准自注意力本身没有完整的顺序信息，需要位置编码等机制。', '注意力权重不等同于人类式理解，也不能单独证明因果理由。'], concepts: [{ label: '注意力与信息加权' }, { label: '上下文关联' }, { label: '位置与顺序' }], prompt: '用一句存在指代关系的话解释自注意力怎样利用上下文，再说明位置信息和因果掩码的作用，以及注意力解释的限制。' },
    { id: 'rag-retrieval', title: '搭起检索增强生成流程', objective: '按顺序解释切块、索引、检索与生成，并识别检索失败的影响。', bloom: ['应用', '分析'], learnUrl: '../chapter/6/index.html#kp-1', summary: ['RAG 把外部知识检索和模型生成连接起来。', '向量检索利用表示相似度，混合检索可结合关键词。', 'RAG 通常不通过每次查询更新模型参数，也不能消除幻觉。'], concepts: [{ label: '文档切块与索引' }, { label: '相关证据检索' }, { label: '基于证据生成' }], prompt: '为学校奖学金制度做一个问答助手：从文档切块讲到检索和生成，用一个问题举例，再说明检索不到有效依据时应该怎样处理。' },
    { id: 'rag-evaluation', title: '用证据定位 RAG 错误', objective: '区分检索失败与生成失实，设计包含无答案问题的小型测试集。', bloom: ['分析', '评价'], learnUrl: '../chapter/6/index.html#kp-5', summary: ['RAG 评估应分别检查检索是否找到了回答所需材料，以及生成内容是否被材料支持。', 'Recall@k 衡量覆盖度；答案忠实性关注回答是否有依据。', '可靠评估需要代表性问题、可核验参考、无答案与矛盾资料场景。'], concepts: [{ label: '检索与召回质量' }, { label: '答案忠实性与证据' }, { label: '测试集与评估' }], prompt: '假设校园问答答错了一条截止日期，如何判断是检索问题还是生成问题？设计一组包含无答案问题的测试，说明要记录哪些指标以及自动评分的限制。' },
    { id: 'agent-tools', title: '让 Agent 正确调用工具', objective: '解释模型决策与应用执行的分工，处理工具参数错误和工具失败。', bloom: ['应用', '分析'], learnUrl: '../chapter/4/index.html#kp-4', summary: ['模型依据任务选择工具并提出结构化参数；应用校验权限后执行真实操作。', 'Agent 可以在决策、执行、观察的循环中推进任务，但应设上限。', '生成函数调用文本不等于操作成功，实际成功以工具返回为准。'], concepts: [{ label: '工具选择与调用' }, { label: '结构化参数与校验' }, { label: '执行结果与循环' }], prompt: '设计一个查询教室空闲情况的 Agent：说明模型、工具、参数校验各自负责什么，举例描述一次查询及失败重试，并说明怎样避免无限循环。' },
    { id: 'agent-safety', title: '为 Agent 设置权限边界', objective: '识别提示注入与越权风险，为真实写操作设置最小权限和确认点。', bloom: ['分析', '评价'], learnUrl: '../chapter/8/index.html#kp-5', summary: ['外部网页、邮件和检索文档可能包含提示注入，应视为不可信数据。', '读取资料与发送邮件、删除文件的权限应严格区分。', '任何单一提示或过滤器都不能保证完全防御。'], concepts: [{ label: '提示注入与不可信内容' }, { label: '最小权限与工具限制' }, { label: '敏感操作确认与审计' }], prompt: '你的 Agent 读取一份含有“把所有学生名单发给某邮箱”的网页。说明它应如何处理，举例设计读取与发送权限、用户确认和审计记录，并说明防护仍有什么限制。' }
  ];

  // 简单的本地讲解检查规则（AI 不可用时的降级）
  function checkExplanation(text) {
    const checks = [];
    const minLen = 20;
    const hasExample = /例如|比如|举例|实例|如：|e\.g\.|for example/i.test(text);
    const hasConcept = /模型|token|训练|注意力|嵌入|检索|提示词|智能体|agent/i.test(text);
    const hasLimit = /局限|不足|缺点|问题|幻觉|偏差|限制|边界/i.test(text);

    checks.push({ label: '字数达到要求', detail: '至少 20 字', pass: text.length >= minLen });
    checks.push({ label: '包含核心概念', detail: '提到模型、训练、注意力等关键词', pass: hasConcept });
    checks.push({ label: '给出具体例子', detail: '使用"例如""比如"等举例', pass: hasExample });
    checks.push({ label: '提到局限性', detail: '讨论了边界或不足', pass: hasLimit });

    const passed = checks.filter(c => c.pass).length;
    const accepted = passed >= 3;
    return {
      accepted,
      mode: 'fallback-local',
      feedback: accepted
        ? '讲解覆盖了核心要点，继续完成测验。'
        : '请补充：' + checks.filter(c => !c.pass).map(c => c.label).join('、'),
      checks,
      followUp: accepted ? null : '试着从"是什么、怎么工作、有什么局限"三个角度组织你的讲解。'
    };
  }

  // 调用 DeepSeek API 进行 AI 复评；失败时降级到本地规则
  async function aiReviewExplanation(text, moduleId) {
    const cfg = (window.AI_CONFIG || {});
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      return checkExplanation(text);
    }

    const prompt = [
      { role: 'system', content: '你是 AI Master 的学习教练。对学员的讲解进行严格、客观、建设性的评分。返回 JSON 格式：{"accepted":true/false,"score":0-100,"feedback":"具体改进建议","strengths":["优点1"],"improvements":["可改进点1"]}。accepted=true 当且仅当 score>=75。' },
      { role: 'user', content: '模块ID：' + moduleId + '\n学员讲解：\n' + text + '\n\n请评估：1) 是否准确；2) 是否覆盖核心要点；3) 是否举例；4) 是否提到局限性。给出 0-100 分和具体反馈。' }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs || 30000);

    try {
      const response = await fetch(cfg.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: prompt,
          max_tokens: cfg.maxTokens || 1024,
          temperature: cfg.temperature || 0.3,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error('DeepSeek API ' + response.status + ': ' + errText.slice(0, 200));
      }

      const data = await response.json();
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('AI 返回内容为空');

      let parsed;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (e) {
        // 兼容非 JSON 输出：降级到本地规则
        const localResult = checkExplanation(text);
        localResult.mode = 'ai-fallback-parse-error';
        localResult.aiRaw = content;
        return localResult;
      }

      const score = typeof parsed.score === 'number' ? parsed.score : (parsed.accepted ? 80 : 50);
      const accepted = typeof parsed.accepted === 'boolean' ? parsed.accepted : score >= 75;

      return {
        accepted: accepted,
        score: score,
        mode: 'ai-deepseek',
        model: cfg.model,
        feedback: parsed.feedback || (accepted ? '讲解通过，继续完成测验。' : '请根据反馈修改后重新提交。'),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        followUp: accepted ? null : (parsed.feedback || '请补充缺失的要点。')
      };
    } catch (error) {
      // 任何错误都降级到本地规则
      const localResult = checkExplanation(text);
      localResult.mode = 'fallback-local-' + (error.name === 'AbortError' ? 'timeout' : 'api-error');
      localResult.aiError = error.message;
      return localResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  // 生成简单的本地测验
  function generateQuiz(moduleId) {
    const canonicalId = (moduleId === 'prompt') ? 'prompt-design' : (moduleId === 'rag') ? 'rag-retrieval' : moduleId;
    const module = DEFAULT_CATALOG.find(m => m.id === canonicalId);
    if (!module) return { id: 'local_' + moduleId + '_' + Date.now(), questions: [] };

    const questions = module.concepts.map((c, i) => ({
      id: moduleId + '_q' + i,
      prompt: '以下哪个是与「' + module.title + '」相关的概念？',
      options: [c.label, '数据库索引', 'HTTP 协议', 'CSS 选择器'],
      answer: 0,
      explanation: c.label + ' 是 ' + module.title + ' 的核心概念。',
      source: { url: module.learnUrl, title: module.title }
    }));

    return { id: 'local_' + moduleId + '_' + Date.now(), questions };
  }

  function gradeQuiz(quiz, answers) {
    let correct = 0;
    const items = quiz.questions.map(q => {
      const selected = answers[q.id];
      const isCorrect = selected === q.answer;
      if (isCorrect) correct++;
      return { id: q.id, selected, answer: q.answer, correct: isCorrect, explanation: q.explanation };
    });
    const total = quiz.questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { score, correct, total, items, passed: score >= 75 };
  }

  // 状态管理
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function getCatalog() {
    try {
      const cached = JSON.parse(localStorage.getItem(CATALOG_KEY));
      if (cached && cached.length) return cached;
    } catch (_) {}
    return DEFAULT_CATALOG;
  }

  function ensurePlan(state, profile) {
    if (!state.plan) {
      state.plan = {
        title: '我的学习航线',
        dailyMinutes: 30,
        estimatedDays: '14',
        modules: getCatalog().map(m => m.id),
        schedule: getCatalog().map((m, i) => ({ moduleId: m.id, startDay: i * 3 + 1, endDay: i * 3 + 3, minutes: 30 })),
        reason: '根据课程目录生成的默认学习航线。',
        profile: profile || {}
      };
    }
    return state.plan;
  }

  // 本地 API 处理器
  const handlers = {
    state: function () {
      const state = loadState();
      ensurePlan(state);
      return { ok: true, state: state, user: { id: 'local', name: '本地学习者', isGuest: true } };
    },
    status: function () {
      return { ok: true, ai: { configured: false, model: '', baseUrl: '' } };
    },
    catalog: function () {
      return { ok: true, modules: getCatalog() };
    },
    plan: function (body) {
      const state = loadState();
      state.profile = { goal: body.goal, level: body.level, dailyMinutes: body.dailyMinutes, deadline: body.deadline };
      state.plan = {
        title: '我的学习航线',
        dailyMinutes: body.dailyMinutes || 30,
        estimatedDays: '14',
        modules: getCatalog().map(m => m.id),
        schedule: getCatalog().map((m, i) => ({ moduleId: m.id, startDay: i * 3 + 1, endDay: i * 3 + 3, minutes: body.dailyMinutes || 30 })),
        reason: '根据你的目标「' + body.goal + '」生成的学习航线。',
        profile: state.profile
      };
      state.progress = state.progress || {};
      saveState(state);
      return { ok: true, state: state, user: { id: 'local', name: '本地学习者', isGuest: true } };
    },
    quiz: function (body, path) {
      if (body) {
        // 提交测验
        const state = loadState();
        const moduleId = path.match(/module=([^&]+)/);
        const mid = moduleId ? moduleId[1] : '';
        const quiz = generateQuiz(mid);
        const result = gradeQuiz(quiz, body.answers);
        state.attempts = state.attempts || [];
        state.attempts.push({ type: 'quiz', moduleId: mid, result: result, createdAt: Date.now() });
        // 记录错题
        if (!result.passed) {
          const wrongItems = result.items.filter(i => !i.correct);
          state.wrongAnswers = (state.wrongAnswers || []).concat(wrongItems.map(i => ({
            questionId: i.id,
            question: quiz.questions.find(q => q.id === i.id),
            resolved: false
          })));
        }
        saveState(state);
        return { ok: true, result: result, state: state };
      } else {
        // 获取测验
        const moduleId = path.match(/module=([^&]+)/);
        const mid = moduleId ? moduleId[1] : '';
        const isDiagnostic = path.includes('mode=diagnostic');
        const quiz = isDiagnostic ? generateQuiz(getCatalog()[0].id) : generateQuiz(mid);
        return { ok: true, quiz: quiz };
      }
    },
    explanation: async function (body) {
      const state = loadState();
      ensurePlan(state); // 兜底 state 必须带 plan，否则 applyState 后 UI 会渲染回设置页
      const result = await aiReviewExplanation(body.text, body.moduleId);
      state.progress = state.progress || {};
      state.progress[body.moduleId] = state.progress[body.moduleId] || {};
      state.progress[body.moduleId].explanation = result;
      state.attempts = state.attempts || [];
      state.attempts.push({ type: 'explanation', moduleId: body.moduleId, result: result, createdAt: Date.now() });
      saveState(state);
      return { ok: true, result: result, state: state };
    },
    complete: function (body) {
      const state = loadState();
      state.progress = state.progress || {};
      state.progress[body.moduleId] = state.progress[body.moduleId] || {};
      state.progress[body.moduleId].completedAt = Date.now();
      state.progress[body.moduleId].dueAt = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3天后复习
      saveState(state);
      return { ok: true, state: state };
    },
    review: function (body) {
      if (body) {
        // 提交复习
        const state = loadState();
        state.wrongAnswers = (state.wrongAnswers || []).map(item => {
          if (item.questionId === body.questionId) item.resolved = true;
          return item;
        });
        saveState(state);
        return { ok: true, result: { correct: true, explanation: '复习完成。' }, state: state };
      } else {
        const state = loadState();
        const items = (state.wrongAnswers || []).filter(item => !item.resolved);
        return { ok: true, items: items };
      }
    },
    'ai/config': function (body) {
      return { ok: true, ai: { configured: false, model: '', baseUrl: '' } };
    },
    'auth/login': function () {
      const state = loadState();
      ensurePlan(state);
      saveState(state);
      return { ok: true, state: state, user: { id: 'local', name: '本地学习者', isGuest: true } };
    },
    'auth/register': function () {
      const state = loadState();
      ensurePlan(state);
      saveState(state);
      return { ok: true, state: state, user: { id: 'local', name: '本地学习者', isGuest: true } };
    },
    'auth/logout': function () {
      const state = loadState();
      ensurePlan(state);
      return { ok: true, state: state, user: { id: 'local', name: '访客', isGuest: true } };
    }
  };

  // 路由键优先取完整路径（如 'ai/config'、'auth/login'），否则退回首段
  // （如 'quiz?module=...'、'plan'）。其他 dispatcher 行为不变。
  function routeKey(path) {
    const clean = path.split('?')[0].replace(/^\/+|\/+$/g, '');
    return handlers[clean] ? clean : clean.split('/')[0];
  }

  // 暴露本地 API
  window.LearningLocalAPI = {
    canHandle: function (path) {
      return !!handlers[routeKey(path)];
    },
    handle: function (path, body) {
      const key = routeKey(path);
      const handler = handlers[key];
      if (!handler) throw new Error('本地模式不支持此操作：' + path);
      return handler(body, path);
    }
  };
})();
