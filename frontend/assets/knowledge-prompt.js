import { STAGES } from "/ai-learning/data.js";
import { bindRouteAccordions, escapeHTML, icon, renderHeader } from "/ai-learning/components.js?v=20260925-acc1";
import { initRouteDrawer } from "/assets/route-drawer.js?v=20260926-edge1";
import { clarifyKnowledgePage } from "/ai-learning/knowledge-ui.js";
import { initKnowledgeNodeFlow } from "/assets/knowledge-node-flow.js?v=20260926-node";
import { mountMindCanvasEntries } from "/assets/mind-canvas-entry.js?v=20260927";

const app = document.getElementById("app");
const pointRoute = "/knowledge/2-1/";
const chapterRoute = "/chapter/3/";
const fallbackPoints = [
  "什么是提示词工程？", "提示词编写核心原则", "角色扮演提示法",
  "Zero-shot / Few-shot / Many-shot", "Prompt 模式系统性分类", "复杂约束工程与输出控制"
];

function parseCourseSections(markup) {
  const documentFragment = new DOMParser().parseFromString(markup, "text/html");
  const sections = [];
  let current;
  Array.from(documentFragment.body.children).forEach(function (node) {
    if (node.tagName === "H3") {
      current = { title: node.textContent.trim(), nodes: [] };
      sections.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
  });
  return sections;
}

function renderPointLink(title, index, compact, stageId, currentNumber) {
  const active = currentNumber > 0 && index === currentNumber - 1;
  const href = stageId === 4 && index === 5 ? "/chapter/4/#kp-6" : "/knowledge/" + stageId + "-" + (index + 1) + "/";
  const status = compact ? '<span class="node-status-label" data-node-status-label>未开始</span>' : "";
  return '<a class="route-point' + (active ? " is-current" : "") + '" data-knowledge-node="' + stageId + '.' + (index + 1) + '" href="' + href + '"' + (active ? ' aria-current="page"' : "") + '><span class="route-point-state' + (active ? "" : " state-idle") + '">' + (active ? icon("play", 14) : "") + '</span><span class="route-point-copy"><small>' + stageId + '.' + (index + 1) + '</small><strong>' + escapeHTML(title) + '</strong></span>' + status + '</a>';
}

function renderRouteSidebar(points) {
  const levelRows = STAGES.map(function (stage) {
    const isCurrent = stage.id === 2;
    const expanded = isCurrent;
    const stageNumber = String(stage.id).padStart(2, "0");
    const contentId = "route-level-content-" + stage.id;
    const lessons = isCurrent ? points : stage.lessons;
    const headerClass = isCurrent ? "active-level-heading" : "route-level";
    const itemClass = "route-accordion-item" + (isCurrent ? " active-level prompt-active-level is-expanded" : "");
    const isPrevious = stage.id < 2;
    const count = '<span data-node-stage-progress="' + stage.id + '">0/' + lessons.length + ' 已通关</span>';
    const pointMarkup = lessons.map(function (point, index) {
      const title = typeof point === "string" ? point : point.title;
      return renderPointLink(title, index, true, stage.id, isCurrent ? 1 : 0);
    }).join("");
    const pointsClass = "route-points prompt-route-points" + (isCurrent ? "" : " prompt-collapsed-points");
    return '<section class="' + itemClass + '"><button class="' + headerClass + ' route-accordion-trigger' + (isPrevious ? " is-previous" : "") + '" type="button" data-route-accordion-trigger aria-expanded="' + expanded + '" aria-controls="' + contentId + '"' + (isCurrent ? ' aria-current="step"' : "") + '><span class="' + (isCurrent ? "active-level-number" : "route-level-index") + '">' + stageNumber + '</span><span class="route-level-copy"><small>LEVEL ' + stageNumber + '</small><strong>' + escapeHTML(stage.title) + '</strong></span><span class="' + (isCurrent ? "active-level-count" : "route-level-count") + '">' + count + '<span class="route-accordion-caret" aria-hidden="true"></span></span></button><nav class="' + pointsClass + '" id="' + contentId + '" aria-label="LEVEL ' + stageNumber + ' 知识点"' + (expanded ? "" : " hidden") + '>' + pointMarkup + '</nav></section>';
  }).join("");
  return '<aside class="route-panel prompt-route-panel" aria-label="AI 学习路线"><div class="route-panel-heading"><span class="route-heading-icon">' + icon("route", 20) + '</span><div><small>YOUR LEARNING PATH</small><h2>学习路线</h2></div><button class="route-collapse" id="route-collapse" type="button" aria-expanded="true" aria-controls="route-body">收起</button></div><div class="route-body" id="route-body"><nav class="prompt-level-list route-accordion-group" aria-label="学习阶段">' + levelRows + '</nav><a class="route-back-link" href="/learning-path/?stage=2">查看阶段总览 ' + icon("arrow", 15) + '</a><div class="prompt-sidebar-scenery" aria-hidden="true"></div></div></aside>';
}

function renderModuleHeading(index, eyebrow, title) {
  return '<header class="module-heading"><span>' + String(index).padStart(2, "0") + '</span><div><small>' + eyebrow + '</small><h3>' + title + '</h3></div></header>';
}

function renderWorkflow() {
  const steps = [
    { label: "用户目标", note: "明确要完成的事", icon: "users" },
    { label: "Prompt", note: "组织输入信息", icon: "message" },
    { label: "LLM", note: "理解并生成", icon: "brain" },
    { label: "输出", note: "得到模型回复", icon: "note" }
  ];
  return '<div class="prompt-flow" role="img" aria-label="用户目标经过 Prompt 输入给 LLM，得到输出后进行评估并迭代 Prompt。">' + steps.map(function (step, index) {
    return '<div class="prompt-flow-step flow-step-' + (index + 1) + '"><span>' + icon(step.icon, 20) + '</span><strong>' + step.label + '</strong><small>' + step.note + '</small></div>' + (index < steps.length - 1 ? '<span class="prompt-flow-arrow" aria-hidden="true">' + icon("arrow", 17) + '</span>' : "");
  }).join("") + '</div><div class="prompt-iteration"><span class="iteration-loop">' + icon("workflow", 16) + '</span><span><strong>评估输出</strong><small>对照任务目标检查结果</small></span><span class="iteration-arrow">' + icon("arrow", 15) + '</span><span><strong>迭代 Prompt</strong><small>根据需要调整输入</small></span></div>';
}

function renderImportance(section) {
  const list = section.nodes.find(function (node) { return node.tagName === "UL"; });
  if (!list) return "";
  const reasonIcons = ["message", "chart", "settings", "sparkles"];
  return '<div class="prompt-importance-grid">' + Array.from(list.children).map(function (item, index) {
    return '<article class="prompt-importance-item"><span class="importance-icon importance-' + (index + 1) + '">' + icon(reasonIcons[index] || "sparkles", 17) + '</span><p>' + item.innerHTML + '</p></article>';
  }).join("") + '</div>';
}

function renderComposition(section) {
  const codeNode = section.nodes.find(function (node) { return node.tagName === "PRE"; });
  const source = codeNode?.querySelector("code")?.textContent || "";
  const fields = [
    { title: "角色设定（Persona）", example: '“你是一位资深的 Python 后端工程师...”', tone: "cyan" },
    { title: "任务描述（Task）", example: '“请帮我 review 以下代码的性能问题...”', tone: "blue" },
    { title: "上下文信息（Context）", example: '“这段代码运行在 Django 4.2 环境下...”', tone: "purple" },
    { title: "输出格式（Format）", example: '“请用 Markdown 表格列出问题和改进建议”', tone: "teal" },
    { title: "示例（Examples）", example: '可选但推荐：问题 | 严重程度 | 改进方案', tone: "amber" }
  ];
  return '<div class="prompt-composition-grid">' + fields.map(function (field, index) {
    return '<article class="prompt-composition-item tone-' + field.tone + '"><span class="composition-index">0' + (index + 1) + '</span><div><strong>' + field.title + '</strong><code>' + escapeHTML(field.example) + '</code></div></article>';
  }).join("") + '</div>' + (source ? '<details class="source-code-details"><summary>查看课程原文示例</summary><pre><code>' + escapeHTML(source) + '</code></pre></details>' : "");
}

function renderCoreModules(sections) {
  const definition = sections[0];
  const importance = sections[1];
  const composition = sections[2];
  const definitionBody = definition ? definition.nodes.map(function (node) { return node.outerHTML; }).join("") : "";
  return '<section class="knowledge-panel prompt-core-panel" aria-labelledby="core-title"><header class="knowledge-panel-heading"><span class="section-icon">' + icon("book", 21) + '</span><div><span class="section-kicker">CORE KNOWLEDGE</span><h2 id="core-title">核心内容</h2></div><span class="content-source-label">课程 · 提示词工程基础</span></header><div class="prompt-core-grid">' +
    '<article class="knowledge-module prompt-core-card prompt-definition">' + renderModuleHeading(1, "CONCEPT", definition?.title || "定义") + '<div class="module-body">' + definitionBody + '</div></article>' +
    '<article class="knowledge-module prompt-core-card prompt-workflow">' + renderModuleHeading(2, "WORKFLOW", "提示词如何连接任务与模型") + renderWorkflow() + '</article>' +
    '<article class="knowledge-module prompt-core-card prompt-composition" id="prompt-anatomy">' + renderModuleHeading(3, "PROMPT COMPONENTS", composition?.title || "提示词的组成部分") + renderComposition(composition || { nodes: [] }) + '</article>' +
    '<article class="knowledge-module prompt-core-card prompt-importance">' + renderModuleHeading(4, "WHY IT MATTERS", importance?.title || "为什么重要？") + renderImportance(importance || { nodes: [] }) + '</article>' +
    '</div></section>';
}

function renderLearningPage(course, point) {
  const points = course.knowledge_points.map(function (item) { return item.title; });
  const sections = parseCourseSections(point.content);
  const definitionParagraph = sections[0]?.nodes.find(function (node) { return node.tagName === "P"; });
  const intro = definitionParagraph?.textContent || "提示词工程是设计和优化输入给 LLM 的提示文本，以引导模型生成期望输出的系统性方法。";
  const stage = STAGES.find(function (item) { return item.chapterIds.includes(course.id); });
  const currentNumber = course.knowledge_points.indexOf(point) + 1;
  const pointLinks = points.map(function (title, index) { return renderPointLink(title, index, true, stage.id, currentNumber); }).join("");
  document.title = "2.1 " + point.title + " · AI Master";
  app.innerHTML = renderHeader("learning-path") + '<a class="lesson-skip" href="#lesson-content">跳到本节内容</a><main class="knowledge-layout prompt-knowledge-layout">' + renderRouteSidebar(points) +
    '<article class="lesson-main prompt-lesson-main" id="lesson-content"><nav class="lesson-breadcrumb" aria-label="当前位置"><a href="/learning-path/">学习路线</a><span>/</span><a href="/learning-path/?stage=2">LEVEL 02</a><span>/</span><span>Prompt Engineering</span><span>/</span><span aria-current="page">2.1</span></nav>' +
    '<header class="lesson-hero prompt-lesson-hero"><div class="lesson-hero-copy"><p class="lesson-kicker"><span>KNOWLEDGE POINT</span><i></i><span>LEVEL 02</span></p><h1><span class="lesson-number-large">2.1</span><span id="lesson-title">' + escapeHTML(point.title) + '</span></h1><p class="lesson-intro" id="lesson-intro">' + escapeHTML(intro) + '</p><div class="lesson-hero-foot"><span>' + icon("message", 16) + ' ' + escapeHTML(course.title) + '</span><span class="lesson-dot"></span><span>从提示开始，理解如何引导 AI 输出</span></div></div><div class="prompt-hero-scene" aria-hidden="true"><img src="/assets/knowledge-prompt-space.png" alt=""></div><section class="lesson-metrics prompt-lesson-metrics" aria-label="本节信息"><div class="lesson-metric"><span class="metric-icon">' + icon("clock", 17) + '</span><div><small>学习时长</small><strong>19 <em>分钟</em></strong></div></div><div class="lesson-metric"><span class="metric-icon">' + icon("chart", 17) + '</span><div><small>难度</small><strong>入门</strong></div></div><div class="lesson-metric metric-state"><span class="metric-icon">' + icon("play", 16) + '</span><div><small>当前状态</small><strong data-current-node-status>正在学习</strong></div></div><div class="lesson-metric"><span class="metric-icon">' + icon("book", 17) + '</span><div><small>章节通关</small><strong data-node-stage-progress="2">0/6 已通关</strong></div></div></section></header>' +
    '<section class="objectives-panel prompt-objectives-panel" aria-labelledby="objectives-title"><div class="compact-section-heading"><span class="section-kicker">LEARNING OBJECTIVES</span><h2 id="objectives-title">本节学习目标</h2></div><div class="objective-grid"><article class="objective-card"><span class="objective-icon">' + icon("sparkles", 23) + '</span><p>理解提示词工程的定义，知道它如何引导 LLM 生成期望输出。</p></article><article class="objective-card"><span class="objective-icon objective-icon-blue">' + icon("chart", 23) + '</span><p>说出角色、任务、上下文、输出格式四项基本要素。</p></article><article class="objective-card"><span class="objective-icon objective-icon-purple">' + icon("cube", 23) + '</span><p>区分提示词对结果的影响与它不能保证的结果。</p></article></div></section>' + renderCoreModules(sections) +
    '<section class="summary-panel prompt-summary-panel" id="summary"><div class="compact-section-heading"><span class="section-kicker">KEY TAKEAWAYS</span><h2>学习小结</h2></div><ol class="summary-list"><li><span>01</span><p>提示词工程是设计和优化输入给 LLM 的提示文本，以引导模型生成期望输出。</p></li><li><span>02</span><p>常见组成包括角色、任务、上下文和输出格式；示例可选但推荐。</p></li><li><span>03</span><p>提示词会影响具体任务的表现，但效果受任务、评分口径与模型版本影响，没有通用倍数或绝对保证。</p></li></ol></section>' +
    '<section class="quick-check prompt-quick-check" id="quick-check" aria-labelledby="quick-check-title"><div class="quick-check-heading"><span class="section-icon">' + icon("checklist", 20) + '</span><div><span class="section-kicker">QUICK CHECK</span><h2 id="quick-check-title">快速检查</h2></div><span class="quick-check-time">约 20 秒</span></div><p class="quick-check-question">课程列出的提示词组成要素中，哪一项是“可选但推荐”的？</p><div class="quick-check-options" role="group" aria-label="选择一个答案"><button type="button" data-answer="a">A <span>角色设定</span></button><button type="button" data-answer="b">B <span>上下文信息</span></button><button type="button" data-answer="c">C <span>示例（Examples）</span></button><button type="button" data-answer="d">D <span>输出格式</span></button></div><p class="quick-check-feedback" id="quick-check-feedback" role="status" aria-live="polite" hidden></p></section>' +
    '<nav class="lesson-pagination prompt-lesson-pagination" aria-label="知识点导航"><div class="pagination-side pagination-previous" aria-disabled="true"><span class="pagination-arrow">←</span><div><small>上一节</small><strong>本章第一个知识点</strong></div></div><a class="pagination-side pagination-next" href="' + "/knowledge/2-2/" + '"><div><small>下一节 · 2.2</small><strong>' + escapeHTML(points[1] || "提示词编写核心原则") + '</strong></div><span class="pagination-arrow">→</span></a></nav></article>' +
    '<aside class="assistant-rail prompt-assistant-rail" aria-label="学习辅助工具"><section class="rail-panel progress-panel prompt-progress-panel"><div class="rail-panel-heading"><span class="rail-icon">' + icon("chart", 18) + '</span><div><small>YOUR PROGRESS</small><h2>学习进度</h2></div></div><div class="progress-summary prompt-progress-summary"><div class="progress-ring" data-node-stage-ring="2" role="img" aria-label="Prompt Engineering 章节通关进度"><span><strong>0</strong><i>/ 6</i></span></div><div><strong>本章已通关</strong><small data-node-stage-progress="2">0/6 已通关</small></div></div><nav class="progress-point-list" aria-label="本章知识点进度">' + pointLinks + '</nav></section>' +
    '<section class="rail-panel resources-panel prompt-resources-panel"><div class="rail-panel-heading"><span class="rail-icon">' + icon("folder", 18) + '</span><div><small>LESSON RESOURCES</small><h2>本节资源</h2></div></div><div class="resource-list"><a class="resource-row" id="lecture-resource" href="' + escapeHTML(course.ppt_url || "/chapter/3/") + '" target="_blank" rel="noopener noreferrer"><span class="resource-icon">' + icon("book", 17) + '</span><span><strong>课程讲义</strong><small>提示词工程基础 ↗</small></span></a><a class="resource-row" href="#prompt-anatomy"><span class="resource-icon">' + icon("code", 17) + '</span><span><strong>示例 Prompt</strong><small>五项组成要素</small></span></a><a class="resource-row" href="#quick-check"><span class="resource-icon">' + icon("checklist", 17) + '</span><span><strong>随堂练习</strong><small>1 道快速检查</small></span></a><a class="resource-row" href="#summary"><span class="resource-icon">' + icon("note", 17) + '</span><span><strong>学习小结</strong><small>回顾三个要点</small></span></a></div></section>' +
    '<section class="rail-panel assistant-panel prompt-assistant-panel"><span class="assistant-mark">' + icon("sparkles", 21) + '</span><div class="prompt-assistant-copy"><h2>AI 学习助手</h2><p>有什么不懂的？我可以帮你解释概念、举例说明、优化 Prompt，一起探索更好的学习方式！</p></div><span class="prompt-assistant-art" aria-hidden="true"></span><a class="assistant-link" href="/playground/">向 AI 助手提问 ' + icon("arrow", 15) + '</a></section></aside></main>';
  document.body.classList.add("learning-platform-body", "knowledge-lesson-body", "prompt-knowledge-body");
}

function bindHeader() {
  const navButton = document.getElementById("mobile-menu-button");
  const nav = document.getElementById("site-nav");
  const searchButton = document.getElementById("search-toggle");
  const searchForm = document.getElementById("site-search");
  navButton?.addEventListener("click", function () {
    const open = navButton.getAttribute("aria-expanded") !== "true";
    navButton.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("is-open", open);
  });
  nav?.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      nav.classList.remove("is-open");
      navButton?.setAttribute("aria-expanded", "false");
    }
  });
  searchButton?.addEventListener("click", function () {
    const open = searchButton.getAttribute("aria-expanded") !== "true";
    searchButton.setAttribute("aria-expanded", String(open));
    if (searchForm) searchForm.hidden = !open;
    if (open) searchForm?.querySelector("input")?.focus();
  });
  searchForm?.addEventListener("submit", function (event) {
    event.preventDefault();
    const query = searchForm.querySelector("input")?.value.trim();
    if (query) window.location.href = "/courses/?q=" + encodeURIComponent(query);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (nav?.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      navButton?.setAttribute("aria-expanded", "false");
      navButton?.focus();
    }
    if (searchForm && !searchForm.hidden) {
      searchForm.hidden = true;
      searchButton?.setAttribute("aria-expanded", "false");
      searchButton?.focus();
    }
  });
}

function bindInteractions() {
  initRouteDrawer();
  bindRouteAccordions();
  document.querySelectorAll("[data-answer]").forEach(function (button) {
    button.addEventListener("click", function () {
      const correct = button.dataset.answer === "c";
      const feedback = document.getElementById("quick-check-feedback");
      document.querySelectorAll("[data-answer]").forEach(function (option) {
        option.disabled = true;
        if (option.dataset.answer === "c") option.classList.add("is-correct");
        else if (option === button && !correct) option.classList.add("is-incorrect");
      });
      if (!feedback) return;
      feedback.hidden = false;
      feedback.className = "quick-check-feedback " + (correct ? "is-correct" : "is-incorrect");
      feedback.textContent = correct ? "回答正确。课程将示例（Examples）列为“可选但推荐”。" : "再看一下提示词组成：课程把示例（Examples）列为“可选但推荐”。";
    });
  });
  const header = document.querySelector(".site-header");
  const updateHeader = function () { header?.classList.toggle("is-scrolled", window.scrollY > 18); };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
  bindHeader();
}

async function loadLesson() {
  try {
    const response = await fetch("/data/chapter_03.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("课程内容暂时不可用");
    const course = await response.json();
    const point = course.knowledge_points?.[0];
    if (!point) throw new Error("没有找到 2.1 的课程内容");
    renderLearningPage(course, point);
    clarifyKnowledgePage(STAGES.find(function (item) { return item.chapterIds.includes(course.id); }).id, 1);
    bindInteractions();
    app.setAttribute("aria-busy", "false");
    mountMindCanvasEntries(document.getElementById("lesson-content"), { chapter: 3, index: 0 });
    initKnowledgeNodeFlow({ stageId: 2, number: 1 });
  } catch (error) {
    app.innerHTML = renderHeader("learning-path") + '<main class="prompt-load-error"><h1>课程内容暂时无法载入</h1><p>请刷新页面后重试。</p><a href="/learning-path/?stage=2">返回 Prompt Engineering 学习路线</a></main>';
    app.setAttribute("aria-busy", "false");
  }
}

loadLesson();
