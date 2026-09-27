import { STAGES } from "/ai-learning/data.js";

const API = "/api/knowledge-progress";
const FLOW_STYLE_ID = "knowledge-node-flow-styles";
const STATUS = {
  notStarted: "未开始", learning: "学习中", explain: "待讲解",
  explainRevision: "讲解待修改", quiz: "待测验", quizFailed: "测验未通过", done: "已通关"
};
let nodeProgress = {};
let aiConfigured = false;
let serverAvailable = false;
let userKey = "guest";
let loadPromise;
let indicatorsInitialized = false;

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const nodeKey = (stageId, number) => String(stageId) + "." + String(number);
const countForStage = stageId => STAGES.find(stage => stage.id === Number(stageId))?.lessons.length || 0;
const completedForStage = stageId => Object.entries(nodeProgress).filter(([id, progress]) =>
  id.startsWith(String(stageId) + ".") && Boolean(progress?.completedAt)
).length;
const localKey = id => "aimaster-knowledge-node-draft:" + userKey + ":" + id;
const progressLocalKey = () => "aimaster-knowledge-node-progress:" + userKey;

function statusFor(progress = {}) {
  if (progress.completedAt) return STATUS.done;
  if (progress.quiz && progress.quiz.passed === false) return STATUS.quizFailed;
  if (progress.explanation && !progress.explanation.accepted) return STATUS.explainRevision;
  if (progress.explanation?.accepted) return STATUS.quiz;
  if (progress.studyCompletedAt) return STATUS.explain;
  if (progress.startedAt) return STATUS.learning;
  return STATUS.notStarted;
}

function currentNodeFromLocation() {
  const match = location.pathname.match(/\/knowledge\/([1-6])-([1-6])\/?$/);
  if (match) return nodeKey(match[1], match[2]);
  if (/\/chapter\/4\/?$/.test(location.pathname)) {
    const chapter = location.hash.match(/^#kp-(\d+)$/);
    if (chapter) return nodeKey(4, chapter[1]);
  }
  return null;
}

function nodeFromLink(link) {
  if (link.dataset.knowledgeNode) return link.dataset.knowledgeNode;
  const url = new URL(link.getAttribute("href") || "", location.href);
  const match = url.pathname.match(/\/knowledge\/([1-6])-([1-6])\/?$/);
  if (match) return nodeKey(match[1], match[2]);
  if (/\/chapter\/4\/?$/.test(url.pathname)) {
    const chapter = url.hash.match(/^#kp-(\d+)$/);
    if (chapter) return nodeKey(4, chapter[1]);
  }
  return null;
}

function persistLocal() {
  try { localStorage.setItem(progressLocalKey(), JSON.stringify(nodeProgress)); } catch (_) {}
}

function ensureFlowStyles() {
  if (document.getElementById(FLOW_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = FLOW_STYLE_ID;
  link.rel = "stylesheet";
  link.href = "/assets/knowledge-node-flow.css?v=20260926-node";
  document.head.append(link);
}

function dispatchProgress() {
  persistLocal();
  updateNodeIndicators();
  window.dispatchEvent(new CustomEvent("aimaster-node-progress-changed", { detail: { nodes: nodeProgress } }));
}

function updateNodeIndicators() {
  const current = currentNodeFromLocation();
  document.querySelectorAll("[data-knowledge-node], a[href]").forEach(link => {
    const id = nodeFromLink(link);
    if (!id) return;
    const progress = nodeProgress[id] || {};
    const status = statusFor(progress);
    link.dataset.nodeStatus = status;
    link.classList.toggle("is-node-current", id === current);
    link.classList.toggle("is-node-completed", Boolean(progress.completedAt));
    const label = link.querySelector("[data-node-status-label], .lesson-status, .route-current-label, .series-point-idle");
    if (label) {
      label.textContent = status;
      label.classList.add("node-status-label");
    } else if (link.matches(".route-point, .level-lesson-link, .lesson-row, .toc-item")) {
      const statusLabel = document.createElement("span");
      statusLabel.className = "node-status-label";
      statusLabel.dataset.nodeStatusLabel = "";
      statusLabel.textContent = status;
      link.append(statusLabel);
    }
    const mark = link.querySelector("[data-node-status-mark]");
    if (mark) {
      mark.textContent = progress.completedAt ? "✓" : status === STATUS.learning ? "●" : "";
      mark.classList.toggle("is-completed", Boolean(progress.completedAt));
    }
    const currentMark = link.querySelector(".route-point-state, .lesson-state");
    if (progress.completedAt && currentMark) {
      currentMark.classList.add("is-completed");
      currentMark.setAttribute("aria-label", "已通关");
      currentMark.innerHTML = '<span class="node-status-mark" data-node-status-mark aria-hidden="true">✓</span>';
    } else if (currentMark && !progress.completedAt) {
      currentMark.classList.remove("is-completed");
      currentMark.removeAttribute("aria-label");
    }
    if (!link.dataset.baseAriaLabel) {
      const labelClone = link.cloneNode(true);
      labelClone.querySelectorAll(".node-status-label, .route-current-label, .series-point-idle, .lesson-status").forEach(label => label.remove());
      link.dataset.baseAriaLabel = link.getAttribute("aria-label") || labelClone.textContent.trim();
    }
    link.setAttribute("aria-label", link.dataset.baseAriaLabel + "；状态：" + status);
  });

  document.querySelectorAll("[data-node-stage-progress]").forEach(element => {
    const stageId = Number(element.dataset.nodeStageProgress);
    const done = completedForStage(stageId);
    const total = countForStage(stageId);
    element.textContent = done + "/" + total + " 已通关";
    element.setAttribute("aria-label", done + " / " + total + " 个知识节点已通关");
  });
  document.querySelectorAll("[data-node-stage-ring]").forEach(element => {
    const stageId = Number(element.dataset.nodeStageRing);
    const done = completedForStage(stageId);
    const total = countForStage(stageId);
    const percent = total ? Math.round(done / total * 100) : 0;
    element.style.setProperty("--pct", percent + "%");
    element.style.setProperty("--progress", percent + "%");
    element.setAttribute("aria-label", STAGES.find(stage => stage.id === stageId)?.title + "：" + done + " / " + total + " 个节点已通关");
    const value = element.querySelector("strong");
    const suffix = element.querySelector("i");
    if (value) value.textContent = String(done);
    if (suffix) suffix.textContent = "/ " + total;
  });
  if (current) {
    const currentStatus = statusFor(nodeProgress[current] || {});
    document.querySelectorAll("[data-current-node-status]").forEach(element => { element.textContent = currentStatus; });
  }
}

function readLocalNodes() {
  try {
    const value = JSON.parse(localStorage.getItem(progressLocalKey()) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (_) { return {}; }
}

function mergeLocalDrafts() {
  for (const stage of STAGES) for (let number = 1; number <= stage.lessons.length; number++) {
    const id = nodeKey(stage.id, number);
    if (nodeProgress[id]?.draft) continue;
    try {
      const local = JSON.parse(localStorage.getItem(localKey(id)) || "{}");
      if (typeof local.draft === "string" && local.draft) nodeProgress[id] = { ...(nodeProgress[id] || {}), draft: local.draft };
    } catch (_) {}
  }
}

async function loadProgress() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    nodeProgress = readLocalNodes();
    try {
      const response = await fetch(API, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data || !data.nodes) throw new Error(data?.error || "节点进度暂时无法载入。");
      userKey = String(data.userId || "guest");
      nodeProgress = data.nodes;
      aiConfigured = data.aiConfigured === true;
      serverAvailable = true;
      mergeLocalDrafts();
    } catch (_) {
      serverAvailable = false;
    }
    dispatchProgress();
    return nodeProgress;
  })();
  return loadPromise;
}

async function request(payload) {
  let response;
  try {
    response = await fetch(API, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(payload.aiReview ? 65000 : 15000)
    });
  } catch (error) {
    if (payload.aiReview && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error("AI 复评等待超时；你的讲解草稿已保留，可以重新提交。");
    }
    throw new Error("节点学习服务暂时无法连接；讲解草稿已保留，请检查网络后重试。");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) throw new Error(data?.error || "节点学习记录暂时无法保存，请稍后重试。");
  nodeProgress = data.nodes || nodeProgress;
  mergeLocalDrafts();
  serverAvailable = true;
  dispatchProgress();
  return data;
}

function stageIndex(progress) {
  if (progress.completedAt) return 4;
  if (progress.explanation?.accepted) return 3;
  if (progress.studyCompletedAt) return 2;
  return 1;
}

function stepperHTML(stageId, number, progress) {
  const current = stageIndex(progress);
  const steps = [
    { id: 1, label: "学习内容", done: Boolean(progress.studyCompletedAt) },
    { id: 2, label: "自己讲解", done: Boolean(progress.explanation?.accepted) },
    { id: 3, label: "知识测验", done: Boolean(progress.quiz?.passed) },
    { id: 4, label: "节点通关", done: Boolean(progress.completedAt) }
  ];
  return '<section class="node-flow-progress" aria-label="' + stageId + "." + number + ' 四阶段学习进度"><div class="node-flow-progress-heading"><div><span class="node-flow-kicker">NODE MASTERY · ' + stageId + "." + number + '</span><strong>' + escapeHTML(statusForHeading(progress)) + '</strong></div><span class="node-flow-progress-caption">学习内容 → 自己讲解 → 知识测验 → 节点通关</span></div><ol class="node-flow-steps">' + steps.map(step => {
    const locked = step.id > current && !step.done;
    return '<li class="node-flow-step' + (step.done ? ' is-done' : step.id === current ? ' is-current' : '') + (locked ? ' is-locked' : '') + '"' + (locked ? ' aria-disabled="true"' : '') + '><span class="node-flow-step-mark" aria-hidden="true">' + (step.done ? '✓' : String(step.id).padStart(2, '0')) + '</span><span class="node-flow-step-label">' + step.label + '</span></li>';
  }).join("") + '</ol></section>';
}


function statusForHeading(progress) {
  const status = statusFor(progress);
  return status === STATUS.done ? "已通关" : status;
}

function dateLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function explanationFormHTML(progress) {
  const saved = progress.draft || progress.explanation?.text || "";
  const accepted = Boolean(progress.explanation?.accepted);
  const actionLabel = accepted ? "重新检查讲解" : progress.explanation ? "重新提交讲解" : "提交讲解";
  return '<form class="node-explanation-form" data-node-form="explanation"><label for="node-explanation-text">用自己的话讲清本节内容</label><p class="node-flow-prompt">' + escapeHTML(progress.explanation?.followUp || "请说明概念、机制、应用例子与适用边界。") + '</p><textarea id="node-explanation-text" name="text" maxlength="6000" rows="7" required placeholder="写下你对当前知识点的理解…">' + escapeHTML(saved) + '</textarea><div class="node-flow-form-footer"><span class="node-draft-status" data-node-draft-status>' + saved.length + ' / 6000 字 · 草稿独立保存</span><button class="node-flow-primary" type="submit">' + actionLabel + ' →</button></div><p class="node-flow-muted">本地检查关注关键概念、解释过程、例子和边界；它不等同于语义判断或学习效果证明。</p></form>';
}

function feedbackHTML(result) {
  if (!result) return "";
  const passed = result.accepted === true;
  const checks = (result.checks || []).map(check => '<li class="node-check' + (check.pass ? ' is-pass' : ' is-fail') + '"><span aria-hidden="true">' + (check.pass ? '✓' : '•') + '</span><div><strong>' + escapeHTML(check.label) + '</strong><p>' + escapeHTML(check.detail) + '</p></div></li>').join("");
  const suggestion = Array.isArray(result.followUp) ? result.followUp.join("；") : result.followUp;
  return '<section class="node-feedback ' + (passed ? 'is-pass' : 'is-fail') + '" role="status"><header><strong>' + (passed ? '讲解通过' : '讲解待修改') + '</strong><span>' + escapeHTML(result.mode === 'ai' ? 'AI 复评' : '本地规则') + '</span></header><p>' + escapeHTML(result.feedback || (passed ? '讲解已通过，可以开始本节点测验。' : '请根据未通过项补充后重新提交。')) + '</p><ul>' + checks + '</ul>' + (!passed && suggestion ? '<div class="node-suggestion"><strong>修改建议</strong><p>' + escapeHTML(suggestion) + '</p></div>' : '') + '</section>';
}

function reviewCardsHTML(progress) {
  const questions = (progress.wrongQuestions || []).filter(question => !question.resolvedAt);
  if (!questions.length) return '';
  return '<section class="node-wrong-review" aria-labelledby="node-review-title"><header><div><span class="node-flow-kicker">REVIEW MISSED QUESTIONS</span><h3 id="node-review-title">错题复习</h3></div><span>' + questions.length + ' 道待巩固</span></header>' + questions.map((question, index) => '<form class="node-review-form" data-node-form="review" data-question-id="' + escapeHTML(question.questionId) + '"><fieldset><legend>' + (index + 1) + '. ' + escapeHTML(question.prompt) + '</legend>' + (question.options || []).map((option, optionIndex) => '<label><input type="radio" name="answer" value="' + optionIndex + '" required><span>' + String.fromCharCode(65 + optionIndex) + '. ' + escapeHTML(option) + '</span></label>').join('') + '<button type="submit" class="node-flow-secondary">提交复习答案</button>' + (question.reviewCount ? '<p class="node-review-history">已复习 ' + question.reviewCount + ' 次 · 最近 ' + dateLabel(question.lastReviewedAt) + '</p>' : '') + '</fieldset></form>').join('') + '</section>';
}

function reviewResultHTML(result) {
  if (!result) return "";
  return '<section class="node-review-result ' + (result.correct ? 'is-correct' : 'is-incorrect') + '" role="status"><strong>' + (result.correct ? '复习答对了' : '复习未通过') + '</strong><p>你的答案：' + escapeHTML(result.selectedAnswer || '') + ' · 正确答案：' + escapeHTML(result.correctAnswer || '') + '</p>' + (result.explanation ? '<p>' + escapeHTML(result.explanation) + '</p>' : '') + '</section>';
}

function quizQuestionsHTML(quiz) {
  return quiz.questions.map((question, index) => '<fieldset class="node-quiz-question"><legend>' + (index + 1) + '. ' + escapeHTML(question.prompt) + '</legend>' + (question.options || []).map((option, optionIndex) => '<label><input type="radio" name="q:' + escapeHTML(question.id) + '" value="' + optionIndex + '" required><span>' + String.fromCharCode(65 + optionIndex) + '. ' + escapeHTML(option) + '</span></label>').join('') + '</fieldset>').join('');
}

function nextNode(stageId, number) {
  const stage = STAGES.find(item => item.id === stageId);
  if (number < stage.lessons.length) return { id: nodeKey(stageId, number + 1), title: stage.lessons[number] };
  const nextStage = STAGES.find(item => item.id === stageId + 1);
  if (nextStage) return { id: nodeKey(nextStage.id, 1), title: nextStage.lessons[0] };
  return { href: "/learning-path/", title: "返回学习路线" };
}

function recommendationHTML(stageId, number) {
  const next = nextNode(stageId, number);
  const href = next.href || (next.id === "4.6" ? "/chapter/4/#kp-6" : "/knowledge/" + next.id.replace(".", "-") + "/");
  return '<a class="node-next-recommendation" href="' + href + '"><span class="node-next-mark" aria-hidden="true">→</span><span><small>下一节点推荐</small><strong>' + escapeHTML(next.id ? next.id + " · " + next.title : next.title) + '</strong></span><span aria-hidden="true">›</span></a>';
}

function currentStageHTML(stageId, number, progress, activeQuiz, reviewResult) {
  if (progress.completedAt) {
    const next = nextNode(stageId, number);
    const score = progress.quiz?.score;
    return '<section class="node-complete-card" aria-live="polite"><span class="node-complete-check" aria-hidden="true">✓</span><div><span class="node-flow-kicker">NODE MASTERED · ' + stageId + "." + number + '</span><h3>这个知识点，已经真正学会</h3><p>讲解已通过 · 测验 ' + escapeHTML(score ?? 0) + '% · 通关时间 ' + escapeHTML(dateLabel(progress.completedAt)) + '</p></div></section>' + (next.id || next.href ? recommendationHTML(stageId, number) : '') + reviewResultHTML(reviewResult) + reviewCardsHTML(progress);
  }
  if (!progress.studyCompletedAt) {
    return '<section class="node-gate-card"><div><span class="node-flow-kicker">STAGE 01 · 学习内容</span><h3>先完成当前知识点学习</h3><p>阅读本节课程内容后，再用自己的话讲解。后续阶段会在前一步完成后解锁。</p></div><a class="node-flow-text-link" href="#core-title">回到本节内容 ↑</a><button type="button" class="node-flow-primary" data-node-action="study-complete">我已完成学习内容，开始讲解 →</button></section>';
  }
  if (!progress.explanation?.accepted) {
    return '<section class="node-stage-card"><span class="node-flow-kicker">STAGE 02 · 自己讲解</span><h3>' + (progress.explanation ? '根据反馈补充，再提交一次' : '现在，换成自己的话讲一遍') + '</h3><p>先做本地规则检查；通过后可以继续，也可以选择 AI 复评。</p><p class="node-flow-error" data-node-error role="alert" hidden></p>' + explanationFormHTML(progress) + (progress.explanation ? feedbackHTML(progress.explanation) : '') + '<div class="node-recovery-links"><a href="#core-title">复习本节内容</a></div></section>';
  }
  if (activeQuiz) {
    return '<section class="node-stage-card"><span class="node-flow-kicker">STAGE 03 · 知识测验</span><h3>本节点小测验</h3><p>共 ' + activeQuiz.questions.length + ' 题，正确率达到 75% 即可通关。</p><form class="node-quiz-form" data-node-form="quiz"><div class="node-quiz-list">' + quizQuestionsHTML(activeQuiz) + '</div><div class="node-flow-form-footer"><span class="node-flow-muted">完成全部题目后提交</span><button class="node-flow-primary" type="submit">提交测验</button></div></form><p class="node-flow-error" data-node-error role="alert" hidden></p></section>' + reviewCardsHTML(progress);
  }
  if (progress.quiz && progress.quiz.passed === false) {
    const missed = (progress.quiz.items || []).filter(item => !item.correct).length;
    return '<section class="node-quiz-result is-fail" role="status"><span class="node-result-score">' + escapeHTML(progress.quiz.score) + '%</span><div><span class="node-flow-kicker">QUIZ NOT PASSED</span><h3>还差一步，复习后再试</h3><p>答对 ' + escapeHTML(progress.quiz.correct) + ' / ' + escapeHTML(progress.quiz.total) + ' 题；通过线为 75%。' + (missed ? '有 ' + missed + ' 道错题已记录。' : '') + '</p><a href="#core-title">回到课程内容复习 ↑</a><div class="node-suggestion"><strong>复习建议</strong><p>先复习课程对应内容并完成错题复习，再重新测验。</p></div></div><button type="button" class="node-flow-primary" data-node-action="quiz-start">重新测验 →</button></section><p class="node-flow-error" data-node-error role="alert" hidden></p>' + reviewResultHTML(reviewResult) + reviewCardsHTML(progress);
  }
  const aiAction = progress.explanation?.mode === "ai" ? '' : aiConfigured
    ? '<button type="button" class="node-flow-secondary" data-node-action="ai-review">AI 复评（可选）</button>'
    : '<p class="node-flow-muted">AI 复评暂未配置；本地规则已通过，可以继续测验。</p>';
  return '<section class="node-stage-card"><span class="node-flow-kicker">STAGE 03 · 知识测验</span><h3>讲解已通过，检验是否真正掌握</h3>' + feedbackHTML(progress.explanation) + '<p>本节点测验正确率达到 75% 后自动通关。</p><div class="node-flow-action-row">' + aiAction + '<button type="button" class="node-flow-primary" data-node-action="quiz-start">开始知识测验 →</button></div><p class="node-flow-error" data-node-error role="alert" hidden></p>' + reviewResultHTML(reviewResult) + reviewCardsHTML(progress) + '</section>';
}

function renderFlow(host, config, activeQuiz, reviewResult) {
  const id = nodeKey(config.stageId, config.number);
  const progress = nodeProgress[id] || {};
  const status = statusFor(progress);
  const lockedNext = !progress.completedAt;
  host.innerHTML = '<section class="node-workflow" data-node-workflow="' + id + '" aria-labelledby="node-workflow-title"><header class="node-workflow-heading"><div><span class="node-flow-kicker">YOUR MASTERY LOOP · ' + id + '</span><h2 id="node-workflow-title">从读懂，到能讲清、答正确</h2><p>本节点独立记录讲解、测验、错题和复习过程。</p></div><span class="node-current-status" data-status="' + escapeHTML(status) + '">' + escapeHTML(statusForHeading(progress)) + '</span></header><div class="node-flow-panel">' + currentStageHTML(config.stageId, config.number, progress, activeQuiz, reviewResult) + '</div><p class="node-flow-service-note"' + (serverAvailable ? ' hidden' : '') + '>节点服务暂时未连接。讲解草稿仍保存在当前浏览器，进度、测验和通关记录待服务恢复后同步。</p><div class="node-flow-next-lock"' + (lockedNext ? '' : ' hidden') + '>完成本节点通关后，才会推荐下一节点。</div></section>';
}

function insertStepper(stageId, number, main, hero) {
  if (main.querySelector(".node-flow-progress")) return main.querySelector(".node-flow-progress");
  const progress = nodeProgress[nodeKey(stageId, number)] || {};
  const template = document.createElement("template");
  template.innerHTML = stepperHTML(stageId, number, progress);
  const stepper = template.content.firstElementChild;
  hero.insertAdjacentElement("afterend", stepper);
  return stepper;
}

function lockPagination(main, completed) {
  const link = main.querySelector(".pagination-next");
  if (!link) return;
  if (completed) {
    if (link.dataset.nodeLocked === "true" && link.dataset.originalHref) {
      link.href = link.dataset.originalHref;
      link.removeAttribute("aria-disabled");
      link.classList.remove("is-locked");
      link.innerHTML = link.dataset.originalContent;
      delete link.dataset.nodeLocked;
    }
    return;
  }
  if (link.dataset.nodeLocked === "true") return;
  link.dataset.originalHref = link.getAttribute("href") || "";
  link.dataset.originalContent = link.innerHTML;
  link.dataset.nodeLocked = "true";
  link.removeAttribute("href");
  link.setAttribute("aria-disabled", "true");
  link.classList.add("is-locked");
  link.innerHTML = '<div><small>下一节点</small><strong>完成当前节点后解锁推荐</strong></div>';
}

function localizeWorkspaceLink(anchorId) {
  document.querySelectorAll('a[href]').forEach(link => {
    try {
      const target = new URL(link.getAttribute("href"), location.href);
      if (!/\/learning-center\/?$/.test(target.pathname)) return;
      link.href = "#" + anchorId;
      link.textContent = "本节点通关";
    } catch (_) {}
  });
}

export function initKnowledgeNodeProgressIndicators() {
  ensureFlowStyles();
  void loadProgress();
  if (indicatorsInitialized) return;
  indicatorsInitialized = true;
  window.addEventListener("aimaster-node-progress-changed", updateNodeIndicators);
  const route = document.querySelector(".path-layout");
  if (route && !route.dataset.nodeProgressObserver) {
    route.dataset.nodeProgressObserver = "true";
    const observerOptions = { childList: true, subtree: true };
    const observer = new MutationObserver(() => {
      // Progress rendering replaces text children too. Suspend observation while
      // writing those labels so our own updates cannot starve the browser loop.
      observer.disconnect();
      try { updateNodeIndicators(); }
      finally { observer.observe(route, observerOptions); }
    });
    observer.observe(route, observerOptions);
  }
}

export function initKnowledgeNodeFlow(config = {}) {
  ensureFlowStyles();
  const stageId = Number(config.stageId);
  const number = Number(config.number);
  const id = nodeKey(stageId, number);
  const main = config.main || document.querySelector(".lesson-main") || document.querySelector(".chapter-stream");
  if (!main || main.dataset.nodeFlowMounted === id) return;
  main.dataset.nodeFlowMounted = id;
  const hero = config.hero || main.querySelector(".lesson-hero") || main.querySelector("#kp-" + number);
  if (!hero) return;
  const host = document.createElement("div");
  host.className = "node-workflow-host";
  host.id = config.anchorId || "node-mastery";
  localizeWorkspaceLink(host.id);
  const insertionPoint = config.insertionPoint || main.querySelector(".lesson-pagination") || hero;
  insertionPoint.insertAdjacentElement(insertionPoint.classList.contains("lesson-pagination") ? "beforebegin" : "afterend", host);
  insertStepper(stageId, number, main, hero);
  let activeQuiz = null;
  let reviewResult = null;
  let busy = false;
  let saveTimer;

  const render = () => {
    renderFlow(host, { stageId, number }, activeQuiz, reviewResult);
    const currentStepper = main.querySelector(".node-flow-progress");
    if (currentStepper) currentStepper.outerHTML = stepperHTML(stageId, number, nodeProgress[id] || {});
    lockPagination(main, Boolean(nodeProgress[id]?.completedAt));
    updateNodeIndicators();
  };
  const setError = (message, success = false) => {
    let target = host.querySelector("[data-node-error]");
    if (!target) {
      target = document.createElement("p");
      target.className = "node-flow-error";
      target.setAttribute("role", "alert");
      host.querySelector(".node-flow-panel")?.append(target);
    }
    target.textContent = message;
    target.hidden = false;
    target.classList.toggle("is-success", success);
  };

  host.addEventListener("input", event => {
    if (event.target.id !== "node-explanation-text") return;
    const text = event.target.value;
    const progress = nodeProgress[id] || {};
    nodeProgress[id] = { ...progress, draft: text };
    try { localStorage.setItem(localKey(id), JSON.stringify({ draft: text })); } catch (_) {}
    const status = host.querySelector("[data-node-draft-status]");
    if (status) status.textContent = text.length + " / 6000 字 · 草稿已保存";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (serverAvailable) void request({ action: "draft", nodeId: id, text }).catch(() => {});
      dispatchProgress();
    }, 650);
  });

  host.addEventListener("click", async event => {
    const button = event.target.closest("[data-node-action]");
    if (!button || busy) return;
    const action = button.dataset.nodeAction;
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      if (action === "study-complete") {
        await request({ action: "study-complete", nodeId: id });
      } else if (action === "quiz-start") {
        const data = await request({ action: "quiz-start", nodeId: id });
        activeQuiz = data.quiz;
      } else if (action === "ai-review") {
        const text = nodeProgress[id]?.draft || nodeProgress[id]?.explanation?.text || "";
        if (!text.trim()) throw new Error("先填写你的讲解，再发起 AI 复评。");
        const data = await request({ action: "explanation", nodeId: id, text, aiReview: true });
        activeQuiz = null;
        reviewResult = null;
        if (!data.result?.accepted) setError(data.result?.feedback || "AI 复评建议修改讲解后重新提交。");
      }
      render();
    } catch (error) {
      setError(error.message || "操作没有完成，请检查网络后重试。");
    } finally {
      busy = false;
      if (button.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
  });

  host.addEventListener("submit", async event => {
    const form = event.target.closest("[data-node-form]");
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    if (submit) { submit.disabled = true; submit.setAttribute("aria-busy", "true"); }
    try {
      if (form.dataset.nodeForm === "explanation") {
        const text = String(new FormData(form).get("text") || "");
        const data = await request({ action: "explanation", nodeId: id, text, aiReview: false });
        activeQuiz = null;
        reviewResult = null;
        if (data.result?.accepted) {
          try { localStorage.removeItem(localKey(id)); } catch (_) {}
        }
      } else if (form.dataset.nodeForm === "quiz") {
        const values = new FormData(form);
        const answers = Object.fromEntries(activeQuiz.questions.map(question => [question.id, Number(values.get("q:" + question.id))]));
        await request({ action: "quiz-submit", nodeId: id, attemptId: activeQuiz.id, answers });
        activeQuiz = null;
        reviewResult = null;
      } else if (form.dataset.nodeForm === "review") {
        const values = new FormData(form);
        const data = await request({ action: "review", nodeId: id, questionId: form.dataset.questionId, answer: Number(values.get("answer")) });
        reviewResult = data.result;
      }
      render();
      if (reviewResult) setError(reviewResult.correct ? "复习答对了，这道错题已记入复习记录。" : "还没答对。再回顾一次课程内容后继续复习。", reviewResult.correct);
    } catch (error) {
      setError(error.message || "提交失败，请稍后重试。");
    } finally {
      busy = false;
      if (submit?.isConnected) { submit.disabled = false; submit.removeAttribute("aria-busy"); }
    }
  });

  initKnowledgeNodeProgressIndicators();
  void loadProgress().then(async () => {
    const localDraft = (() => { try { return JSON.parse(localStorage.getItem(localKey(id)) || "{}").draft || ""; } catch (_) { return ""; } })();
    if (!nodeProgress[id]?.draft && localDraft) nodeProgress[id] = { ...(nodeProgress[id] || {}), draft: localDraft };
    try {
      if (!nodeProgress[id]?.startedAt) await request({ action: "start", nodeId: id });
    } catch (_) { serverAvailable = false; }
    render();
  });
}
