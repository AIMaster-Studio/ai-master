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
    { id: 'llm-basics', title: '大模型基础原理', objective: '理解 LLM 的定义、训练流程与核心能力', bloom: ['理解'], learnUrl: '../chapter/1/', summary: ['LLM 是基于深度学习的语言模型', '通过自回归方式预测下一个 token', '预训练 + 对齐训练两阶段'], concepts: [{ label: '自回归语言建模' }, { label: '涌现能力' }, { label: '预训练与微调' }], prompt: '用自己的话解释：什么是大语言模型？它如何生成文本？举一个例子说明它的局限性。' },
    { id: 'transformer', title: 'Transformer 架构详解', objective: '掌握自注意力机制与 Transformer 结构', bloom: ['理解', '应用'], learnUrl: '../static/transformer_cg.html', summary: ['自注意力机制让模型关注全局', '多头注意力捕获不同语义关系', '位置编码补充顺序信息'], concepts: [{ label: '自注意力' }, { label: '多头注意力' }, { label: '位置编码' }], prompt: '解释 Transformer 的自注意力机制：Q、K、V 是什么？为什么需要多头注意力？' },
    { id: 'prompt', title: '提示词工程基础', objective: '掌握提示词编写原则与主流范式', bloom: ['应用'], learnUrl: '../static/prompt_cg.html', summary: ['提示词是引导模型输出的指令', '清晰、具体、有上下文的提示词更有效', 'Few-shot、Chain-of-Thought 等范式'], concepts: [{ label: 'Few-shot' }, { label: '思维链' }, { label: '角色设定' }], prompt: '什么是好的提示词？列举两种提示词工程范式并说明适用场景。' },
    { id: 'rag', title: 'RAG 技术详解', objective: '理解检索增强生成的原理与工程实践', bloom: ['理解', '应用'], learnUrl: '../static/rag_cg/index.html', summary: ['RAG = 检索 + 生成', '向量数据库存储文档嵌入', '减少幻觉，提供可溯源答案'], concepts: [{ label: '向量检索' }, { label: '上下文拼接' }, { label: '引用溯源' }], prompt: '解释 RAG 的工作流程：从用户提问到生成回答，经过哪些步骤？RAG 如何减少幻觉？' }
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
    const module = DEFAULT_CATALOG.find(m => m.id === moduleId);
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
    quiz: function (query, body) {
      if (body) {
        // 提交测验
        const state = loadState();
        const moduleId = query.match(/module=([^&]+)/);
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
        const moduleId = query.match(/module=([^&]+)/);
        const mid = moduleId ? moduleId[1] : '';
        const isDiagnostic = query.includes('mode=diagnostic');
        const quiz = isDiagnostic ? generateQuiz(getCatalog()[0].id) : generateQuiz(mid);
        return { ok: true, quiz: quiz };
      }
    },
    explanation: async function (body) {
      const state = loadState();
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

  // 暴露本地 API
  window.LearningLocalAPI = {
    canHandle: function (path) {
      const key = path.split('?')[0].split('/')[0];
      return !!handlers[key];
    },
    handle: function (path, body) {
      const key = path.split('?')[0].split('/')[0];
      const handler = handlers[key];
      if (!handler) throw new Error('本地模式不支持此操作：' + path);
      return handler(body, path);
    }
  };
})();
