'use strict';

// 学习闭环的领域规则：路线校验、测验配额、判分、错题登记、限流。
//
// 为什么单独成模块：这些函数是「学习规则」本身，与 HTTP 无关 ——
// 它们不碰 req/res，只操作 state 与 catalog。抽出来之后有两点实际好处：
//   ① 规则可以脱离服务器直接测（例如「没通关的模块不能跳着做」这类判断，
//      不必先起一个 HTTP 服务、走完整登录流程才能验证）；
//   ② 改学习规则时不必在几百行的路由文件里翻找。
//
// 依赖（fail / randomUUID / stamp）由调用方注入。模块**不自己 require 服务器内部件**，
// 否则又会绕回循环依赖 —— index.js 需要本模块，本模块又需要 index.js。
//
// 注意：本模块的函数会**就地修改**传入的 state（progress / quizAttempts / attempts /
// wrongAnswers 都是 state 的一部分）。这是既有语义，刻意保留：调用方随后会 save() 落盘。
// 不要改成返回新对象，否则所有调用点都要跟着改，且容易漏掉某处导致进度不落盘。

const DEFAULT_DAILY_QUIZ_LIMIT = 3;
const DEFAULT_MAX_ATTEMPTS = 2000;
const REVIEW_SCHEDULE_DAYS = [1, 3, 7, 14, 30];

// 间隔复习：连续答对次数越多，下次复习越晚。
// 表长即上限 —— 超出后一直停留在最后一档，不会无限延长。
function reviewDelayDays(correctStreak) {
  const index = Math.min(Math.max(Number(correctStreak || 1) - 1, 0), REVIEW_SCHEDULE_DAYS.length - 1);
  return REVIEW_SCHEDULE_DAYS[index];
}

function createLearningDomain(options = {}) {
  const { core, catalog, fail } = options;
  if (!core || !catalog || typeof fail !== 'function') throw new Error('createLearningDomain 需要 core、catalog 与 fail。');
  const randomUUID = options.randomUUID;
  const stamp = options.stamp;
  const dailyQuizLimit = options.dailyQuizLimit || DEFAULT_DAILY_QUIZ_LIMIT;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;

  const modules = new Map(catalog.modules.map(module => [module.id, module]));
  const questions = new Map(catalog.modules.flatMap(module => module.questions.map(question => [question.id, { ...question, moduleId: module.id }])));

  // 进程内滑动窗口限流。超时条目按需清理，避免 Map 无界增长。
  const rate = new Map();
  function limited(key, count, windowMs) {
    const now = Date.now();
    if (rate.size > 2000) for (const [k, v] of rate) if (v.until < now) rate.delete(k);
    const item = rate.get(key);
    if (!item || item.until < now) return rate.set(key, { count: 1, until: now + windowMs });
    if (item.count >= count) fail(429, '操作过于频繁，请稍后再试。');
    item.count++;
  }

  // 取模块并校验它现在是否可做：已通关的随时可重做；未通关的必须在当前路线里、且前面的都已完成。
  function moduleFor(state, id) {
    const module = modules.get(id);
    if (!module) fail(404, '未找到这个学习任务。');
    if (state.progress[id]?.completedAt) return module;
    if (!state.plan?.modules.includes(id)) fail(409, '请先生成包含这个任务的学习计划。');
    const earlier = state.plan.modules.slice(0, state.plan.modules.indexOf(id));
    if (earlier.some(key => !state.progress[key]?.completedAt)) fail(409, '请先完成路线中前面的任务。');
    return module;
  }

  function progressFor(state, id) {
    return state.progress[id] ||= { explanation: null, quiz: null, completedAt: null, dueAt: null, reviewCount: 0 };
  }

  function quizDay() {
    return new Date().toISOString().slice(0, 10);
  }

  // 正式测验按「天 × 模块」计次；诊断测验不占额度（调用方不调用本函数）。
  // 顺带清理非当天的计数，避免 state 里堆积历史日期。
  function reserveQuizAttempt(state, moduleId) {
    const day = quizDay();
    state.quizAttempts ||= {};
    state.quizAttempts[day] ||= {};
    const used = Number(state.quizAttempts[day][moduleId] || 0);
    if (used >= dailyQuizLimit) fail(429, '本模块今日正式测验最多 ' + dailyQuizLimit + ' 次，请明天再试。');
    state.quizAttempts[day][moduleId] = used + 1;
    for (const key of Object.keys(state.quizAttempts)) if (key !== day) delete state.quizAttempts[key];
    return dailyQuizLimit - used - 1;
  }

  function addAttempt(state, item) {
    state.attempts.push({ id: randomUUID(), at: stamp(), ...item });
    // 每个档案只保留最近若干次交互，避免 state 无限增长。
    state.attempts = state.attempts.slice(-maxAttempts);
  }

  // 提交完整性校验：必须每道题都给一个合法的选项下标。
  // 这里刻意不「容错补默认值」——漏答就是漏答，不能当成答错静默计分。
  function checkAnswers(list, answers) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || list.some(q => !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length)) {
      fail(400, '请完成所有题目后提交。');
    }
  }

  // 判分委托给 learning-core（客观题由服务端标答判定，不由模型决定），
  // 这里只补上「这道题当时是长什么样」的展示信息，便于前端渲染与复盘。
  function gradeWithContext(list, answers) {
    const result = core.gradeQuiz(list, answers);
    const presented = new Map(list.map(question => [question.id, question]));
    return { ...result, items: result.items.map(item => {
      const question = presented.get(item.id);
      return { ...item, prompt: question.prompt, options: [...question.options],
        selectedText: item.selected === null ? null : question.options[item.selected],
        answerText: question.options[question.answer], source: question.source };
    }) };
  }

  // 错题登记：已存在则累计错误次数并把连续答对清零（回到「今天就要复习」）。
  function recordWrongAnswers(state, result, at) {
    for (const item of result.items) {
      if (item.correct) continue;
      const question = questions.get(item.id);
      const previous = state.wrongAnswers.find(w => w.questionId === item.id);
      if (previous) {
        previous.mistakes++;
        previous.correctStreak = 0;
        previous.resolved = false;
        previous.dueAt = at;
      } else {
        state.wrongAnswers.push({ questionId: item.id, moduleId: question.moduleId, mistakes: 1, reviewCount: 0, resolved: false, dueAt: at });
      }
    }
  }

  return {
    modules, questions, limited, moduleFor, progressFor, quizDay,
    reserveQuizAttempt, addAttempt, checkAnswers, gradeWithContext, recordWrongAnswers,
    dailyQuizLimit, maxAttempts, reviewDelayDays
  };
}

module.exports = { createLearningDomain, reviewDelayDays, REVIEW_SCHEDULE_DAYS, DEFAULT_DAILY_QUIZ_LIMIT, DEFAULT_MAX_ATTEMPTS };
