'use strict';

const { randomUUID, randomInt } = require('node:crypto');
const quizBank = require('../data/quiz-bank.json');
const { retrieveEvidence } = require('../grounding');
const { reviewExplanation, publicConfig } = require('../ai-review');

const DAY = 86400000;
const PASS_SCORE = 75;
const STAGE_SOURCE = {
  1: { chapter: 1, category: '大模型基础原理' },
  2: { chapter: 3, category: '提示词工程' },
  3: { chapter: 5, category: 'Claude Code' },
  4: { chapter: 4, category: 'LLM 框架与 Agent' },
  5: { chapter: 10, category: 'LLM 框架与 Agent' },
  6: { chapter: 9, category: '大模型应用与部署' }
};
const NODE_CATEGORIES = {
  '6.1': 'RAG 技术', '6.2': 'LLM 框架与 Agent', '6.3': 'LLM 框架与 Agent',
  '6.4': 'RAG 技术', '6.5': '大模型应用与部署', '6.6': '大模型应用与部署'
};
const CHAPTERS = {
  1: require('../../frontend/data/chapter_01.json'),
  3: require('../../frontend/data/chapter_03.json'),
  4: require('../../frontend/data/chapter_04.json'),
  5: require('../../frontend/data/chapter_05.json'),
  9: require('../../frontend/data/chapter_09.json'),
  10: require('../../frontend/data/chapter_10.json')
};

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/[\t\r ]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}

function termsFor(label) {
  const value = plainText(label).replace(/^[\d.\s、:：]+/, '').trim();
  const terms = new Set([value]);
  for (const match of value.matchAll(/[A-Za-z][A-Za-z0-9_-]{1,}/g)) terms.add(match[0]);
  for (const part of value.split(/[：:，,、；;（）()《》「」\s—–-]+/)) {
    if (part.length >= 2 && part.length <= 14) terms.add(part);
  }
  return [...terms].filter(Boolean).slice(0, 10);
}

function nodeFor(id, fail) {
  const match = /^(\d)\.(\d)$/.exec(String(id || ''));
  if (!match) fail(400, '知识节点编号不正确。');
  const stageId = Number(match[1]);
  const number = Number(match[2]);
  const source = STAGE_SOURCE[stageId];
  const chapter = source && CHAPTERS[source.chapter];
  const point = chapter && chapter.knowledge_points && chapter.knowledge_points[number - 1];
  if (!point) fail(404, '未找到这个知识节点。');
  const markup = String(point.content || '');
  const headings = [...markup.matchAll(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi)]
    .map(item => plainText(item[1])).filter(Boolean);
  const labels = [...new Set([point.title, ...headings])].slice(0, 8);
  return {
    id: stageId + '.' + number, stageId, number, chapterId: source.chapter,
    title: point.title,
    objective: '用自己的话说明「' + point.title + '」的核心概念、工作机制、实际例子与适用边界。',
    prompt: '请讲清「' + point.title + '」：它解决什么问题、关键过程如何发生、给出一个具体应用例子，并说明一个局限或风险。',
    concepts: labels.map(label => ({ label, terms: termsFor(label) })),
    summary: plainText(markup).slice(0, 4000),
    misconceptions: [],
    followUp: '请回到本节内容复习关键概念，再补充机制、例子或适用边界。'
  };
}

function titleTerms(title) {
  const stop = new Set(['什么是', '核心', '基本', '原理', '详解', '实践', '系统性', '与', '和', '的', '如何', '主要', '工程', '方法', '机制', '理论']);
  const clean = String(title || '').replace(/[（(].*?[）)]/g, ' ').replace(/[？?！!：:，,。；;、/—–-]/g, ' ');
  const tokens = new Set([...clean.matchAll(/[A-Za-z][A-Za-z0-9_-]{1,}|[\u3400-\u9fff]{2,}/g)].map(item => item[0].toLowerCase()));
  const result = new Set();
  for (const token of tokens) {
    if (stop.has(token)) continue;
    if (/^[a-z]/i.test(token)) result.add(token);
    else for (let size = 2; size <= Math.min(4, token.length); size++) {
      for (let index = 0; index + size <= token.length; index++) {
        const part = token.slice(index, index + size);
        if (!stop.has(part)) result.add(part);
      }
    }
  }
  return [...result];
}

function chooseQuestions(node, attemptNumber = 0) {
  const category = NODE_CATEGORIES[node.id] || STAGE_SOURCE[node.stageId].category;
  const candidates = quizBank.questions.filter(question => question.category === category);
  if (candidates.length < 4) return [];
  const terms = titleTerms(node.title + ' ' + node.concepts.map(concept => concept.label).join(' '));
  const ranked = candidates.map(question => {
    const copy = [question.question, ...(question.options || []), question.explanation].join(' ').toLowerCase();
    const score = terms.reduce((sum, term) => sum + (copy.includes(term) ? (term.length >= 4 ? 4 : term.length === 3 ? 2 : 1) : 0), 0);
    return { question, score };
  }).sort((a, b) => b.score - a.score);
  const relevant = ranked.filter(item => item.score > 0).map(item => item.question);
  const pool = relevant.length >= 4 ? relevant : ranked.map(item => item.question);
  const offset = pool.length ? (attemptNumber * 4) % pool.length : 0;
  const rotated = pool.slice(offset).concat(pool.slice(0, offset));
  const picked = rotated.slice(0, 4);
  return picked.map(question => {
    const source = quizBank.sources[question.source] || {};
    const { source: sourceId, ...rest } = question;
    return {
      ...rest,
      id: node.id + '::' + question.id,
      prompt: question.question,
      moduleId: node.id,
      source: source.url ? { title: source.name, url: source.url } : null
    };
  });
}

function shuffleQuestion(question) {
  const order = question.options.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [order[index], order[other]] = [order[other], order[index]];
  }
  return { ...question, options: order.map(index => question.options[index]), answer: order.indexOf(question.answer) };
}

const publicQuestion = ({ answer, explanation, ...question }) => question;

function createKnowledgeNodeRoutes(options) {
  const { store, core, learning, rag, courseKbId, fetchImpl } = options;
  const { limited, reserveQuizAttempt, addAttempt, checkAnswers, gradeWithContext } = learning;

  return async function handleKnowledgeNode(ctx) {
    const { req, url, body, send, fail, user } = ctx;
    let state = ctx.state;
    state.nodeProgress ||= {};
    const save = () => store.save(user.id, state);
    const nodeState = id => state.nodeProgress[id] ||= {
      startedAt: null, studyCompletedAt: null, draft: '', explanation: null,
      quiz: null, quizHistory: [], wrongQuestions: [], reviewRecords: [],
      completedAt: null, dueAt: null
    };

    if (req.method === 'GET') {
      const ai = publicConfig(await store.config());
      return send({ nodes: state.nodeProgress, aiConfigured: ai.configured === true, userId: user.id });
    }

    const node = nodeFor(body.nodeId, fail);
    const progress = nodeState(node.id);
    const at = () => new Date().toISOString();
    const record = async (type, detail) => {
      addAttempt(state, { type: 'knowledge-' + type, nodeId: node.id, ...detail });
      await save();
      return send({ nodes: state.nodeProgress, ...detail });
    };

    if (body.action === 'start') {
      progress.startedAt ||= at();
      await save();
      return send({ nodes: state.nodeProgress });
    }
    if (body.action === 'study-complete') {
      progress.startedAt ||= at();
      progress.studyCompletedAt ||= at();
      return record('study', { nodeId: node.id, completedAt: progress.studyCompletedAt });
    }
    if (body.action === 'draft') {
      if (typeof body.text !== 'string' || body.text.length > 6000) fail(400, '讲解草稿需为文本，最多 6000 字。');
      progress.draft = body.text;
      await save();
      return send({ nodes: state.nodeProgress });
    }
    if (body.action === 'explanation') {
      if (!progress.studyCompletedAt) fail(409, '请先完成当前知识点学习。');
      if (progress.completedAt) fail(409, '本节点已经通关，复习记录不会改变通关状态。');
      if (typeof body.text !== 'string' || body.text.length > 6000) fail(400, '讲解内容需为文本，最多 6000 字。');
      limited('knowledge-expl-ip:' + String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''), 20, 60000);
      limited('knowledge-explanation:' + user.id, 12, 60000);
      const local = core.screenExplanation(body.text, node);
      let result = local;
      if (body.aiReview === true && local.eligible) {
        limited('knowledge-expl-budget:' + new Date().toISOString().slice(0, 10), 5000, DAY);
        let grounding = { available: false, reason: '未建立课程知识库。', evidence: [], queries: [] };
        try {
          grounding = await retrieveEvidence({ rag, kbId: courseKbId(), module: node, studentText: body.text });
        } catch (error) {
          grounding = { available: false, reason: '证据检索失败：' + error.message, evidence: [], queries: [] };
        }
        result = await reviewExplanation(body.text, node, local, await store.config(), { fetchImpl, evidence: grounding.evidence });
        result.grounding = {
          available: grounding.available, reason: grounding.reason || '', kbId: grounding.kbId || null,
          version: grounding.version || null, evidenceCount: grounding.evidence.length, queries: grounding.queries || []
        };
      }
      const revision = randomUUID();
      progress.draft = body.text;
      progress.explanation = { ...result, text: body.text, at: at(), revision };
      progress.quiz = null;
      progress.activeQuizId = null;
      addAttempt(state, { type: 'knowledge-explanation', nodeId: node.id, revision, mode: result.mode, accepted: result.accepted === true, score: result.score || null });
      await save();
      return send({ nodes: state.nodeProgress, result });
    }
    if (body.action === 'quiz-start') {
      if (!progress.explanation?.accepted) fail(409, '讲解通过后才能开始本节点测验。');
      limited('knowledge-quiz:' + user.id, 60, 60000);
      const attemptsRemaining = reserveQuizAttempt(state, 'knowledge:' + node.id);
      const selected = chooseQuestions(node, progress.quizHistory.length);
      if (selected.length !== 4) fail(503, '本节点测验暂不可用，请稍后重试。');
      const questions = selected.map(shuffleQuestion);
      const quiz = {
        id: randomUUID(), nodeId: node.id, mode: 'knowledge-node',
        revision: progress.explanation.revision || null, questions,
        planRevision: null, startedAt: at()
      };
      await store.putQuiz(quiz.id, user.id, quiz);
      progress.activeQuizId = quiz.id;
      await save();
      return send({ quiz: { id: quiz.id, nodeId: node.id, attemptsRemaining, questions: questions.map(publicQuestion) }, nodes: state.nodeProgress });
    }
    if (body.action === 'quiz-submit') {
      const quiz = await store.quiz(String(body.attemptId || ''), user.id);
      if (!quiz || quiz.mode !== 'knowledge-node' || quiz.nodeId !== node.id) fail(404, '这次测验已过期，请重新开始。');
      if (quiz.result) fail(409, '这次测验已提交，请开始新一轮练习。');
      if (!progress.explanation?.accepted || quiz.revision !== progress.explanation.revision) fail(409, '讲解已更新，请重新开始测验。');
      checkAnswers(quiz.questions, body.answers);
      const graded = gradeWithContext(quiz.questions, body.answers);
      const result = { ...graded, passed: graded.score >= PASS_SCORE };
      const submittedAt = at();
      const attempt = { ...result, at: submittedAt, revision: quiz.revision, attemptId: quiz.id };
      progress.quiz = attempt;
      progress.quizHistory.push(attempt);
      progress.quizHistory = progress.quizHistory.slice(-50);
      progress.activeQuizId = null;
      for (const answer of result.items) {
        const existing = progress.wrongQuestions.find(item => item.questionId === answer.id);
        if (answer.correct) {
          if (existing && !existing.resolvedAt) {
            existing.resolvedAt = submittedAt;
            existing.lastReviewedAt = submittedAt;
            existing.reviewCount = (existing.reviewCount || 0) + 1;
            progress.reviewRecords.push({ questionId: existing.questionId, at: submittedAt, correct: true, source: 'quiz-retry' });
          }
          continue;
        }
        const question = quiz.questions.find(item => item.id === answer.id);
        const wrong = {
          questionId: answer.id, prompt: question.prompt || question.question,
          options: [...question.options], selected: answer.selected, correctAnswer: answer.answer,
          explanation: answer.explanation, source: question.source || null,
          mistakes: (existing?.mistakes || 0) + 1, reviewCount: existing?.reviewCount || 0,
          resolvedAt: null, lastReviewedAt: existing?.lastReviewedAt || null
        };
        if (existing) Object.assign(existing, wrong); else progress.wrongQuestions.push(wrong);
      }
      if (result.passed) {
        progress.completedAt ||= submittedAt;
        progress.dueAt ||= new Date(Date.now() + DAY).toISOString();
      }
      addAttempt(state, { type: 'knowledge-quiz', nodeId: node.id, ...result });
      await store.transaction(async () => {
        await store.save(user.id, state);
        await store.putQuiz(quiz.id, user.id, { ...quiz, result, submittedAt });
      });
      return send({ result, nodes: state.nodeProgress, completedAt: progress.completedAt || null });
    }
    if (body.action === 'review') {
      const wrong = progress.wrongQuestions.find(item => item.questionId === body.questionId);
      if (!wrong) fail(404, '没有找到这道错题。');
      if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer >= wrong.options.length) fail(400, '请选择一个答案后提交。');
      const correct = body.answer === wrong.correctAnswer;
      const reviewedAt = at();
      wrong.reviewCount = (wrong.reviewCount || 0) + 1;
      wrong.lastReviewedAt = reviewedAt;
      wrong.resolvedAt = correct ? reviewedAt : null;
      progress.reviewRecords.push({ questionId: wrong.questionId, at: reviewedAt, correct });
      progress.reviewRecords = progress.reviewRecords.slice(-200);
      const result = {
        correct, prompt: wrong.prompt, selectedAnswer: wrong.options[body.answer],
        correctAnswer: wrong.options[wrong.correctAnswer], explanation: wrong.explanation,
        source: wrong.source || null, reviewedAt
      };
      addAttempt(state, { type: 'knowledge-review', nodeId: node.id, questionId: wrong.questionId, correct });
      await save();
      return send({ result, nodes: state.nodeProgress });
    }
    fail(404, '节点学习操作不存在。');
  };
}

module.exports = { createKnowledgeNodeRoutes, PASS_SCORE, nodeFor };
