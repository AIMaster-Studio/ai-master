import { STAGES } from "/ai-learning/data.js";
import { bindRouteAccordions, escapeHTML, icon, renderHeader } from "/ai-learning/components.js?v=20260925-acc1";
import { initRouteDrawer } from "/assets/route-drawer.js?v=20260926-edge1";
import { clarifyKnowledgePage } from "/ai-learning/knowledge-ui.js";
import { initKnowledgeNodeFlow } from "/assets/knowledge-node-flow.js?v=20260926-node";
import { mountMindCanvasEntries } from "/assets/mind-canvas-entry.js?v=20260927";

const fallbackTitle = "什么是大语言模型（LLM）？";
const fallbackIntro = "大语言模型（Large Language Model, LLM）是一种基于深度学习的神经网络模型，通过在海量文本数据上进行自监督学习，掌握人类语言的统计规律、语法结构和语义关系。其核心思想是：给定上文，预测下文——即自回归语言建模（Autoregressive Language Modeling, ARLM）。";
const app = document.getElementById("app");

function renderStageLinks() {
  return STAGES.filter(function (stage) { return stage.id !== 1; }).map(function (stage) {
    const stageNumber = String(stage.id).padStart(2, "0");
    const contentId = "route-level-content-" + stage.id;
    const pointMarkup = stage.lessons.map(function (title, index) {
      const href = stage.id === 4 && index === 5 ? "/chapter/4/#kp-6" : "/knowledge/" + stage.id + "-" + (index + 1) + "/";
      return '<a class="route-point" data-knowledge-node="' + stage.id + '.' + (index + 1) + '" href="' + href + '"><span class="route-point-state"><span>' + String(index + 1).padStart(2, "0") + '</span></span><span class="route-point-copy"><small>' + stage.id + "." + (index + 1) + '</small><strong>' + escapeHTML(title) + '</strong></span><span class="node-status-label" data-node-status-label>未开始</span></a>';
    }).join("");
    return '<section class="route-accordion-item"><button class="route-level route-accordion-trigger" type="button" data-route-accordion-trigger aria-expanded="false" aria-controls="' + contentId + '"><span class="route-level-index">' + stageNumber + '</span><span class="route-level-copy"><small>LEVEL ' + stageNumber + '</small><strong>' + escapeHTML(stage.title) + '</strong></span><span class="route-level-count" data-node-stage-progress="' + stage.id + '">0/' + stage.lessons.length + ' 已通关<span class="route-accordion-caret" aria-hidden="true"></span></span></button><nav class="route-points" id="' + contentId + '" aria-label="LEVEL ' + stageNumber + ' 知识点" hidden>' + pointMarkup + '</nav></section>';
  }).join("");
}

function renderPointLinks(points) {
  const titles = points && points.length ? points : [fallbackTitle, "LLM 的核心能力与局限性", "Token 与 Tokenization 算法（BPE）", "预训练与微调", "缩放定律（Scaling Laws）", "RLHF 与人类对齐"];
  return titles.map(function (point, index) {
    const active = index === 0;
    const href = "/knowledge/1-" + (index + 1) + "/";
    return '<a class="route-point' + (active ? " is-current" : "") + '" data-knowledge-node="1.' + (index + 1) + '" href="' + href + '"' + (active ? ' aria-current="page"' : "") + '><span class="route-point-state">' + (active ? icon("play", 15) : '<span>' + String(index + 1).padStart(2, "0") + '</span>') + '</span><span class="route-point-copy"><small>1.' + (index + 1) + '</small><strong>' + escapeHTML(point) + '</strong></span><span class="node-status-label" data-node-status-label>未开始</span></a>';
  }).join("");
}

function renderShell() {
  app.innerHTML = renderHeader("learning-path") + '<a class="lesson-skip" href="#lesson-content">跳到本节内容</a><main class="knowledge-layout"><aside class="route-panel" aria-label="AI 学习路线"><div class="route-panel-heading"><span class="route-heading-icon">' + icon("route", 20) + '</span><div><small>YOUR LEARNING PATH</small><h2>学习路线</h2></div><button class="route-collapse" id="route-collapse" type="button" aria-expanded="true" aria-controls="route-body">收起</button></div><div class="route-body route-accordion-group" id="route-body"><section class="active-level route-accordion-item is-expanded"><button class="active-level-heading route-accordion-trigger" type="button" data-route-accordion-trigger aria-expanded="true" aria-controls="route-points" aria-current="step"><span class="active-level-number">01</span><span class="route-level-copy"><small>LEVEL 01</small><strong>AI 基础认知</strong></span><span class="active-level-count"><span data-node-stage-progress="1">0/6 已通关</span><span class="route-accordion-caret" aria-hidden="true"></span></span></button><nav class="route-points" id="route-points" aria-label="AI 基础认知知识点">' + renderPointLinks() + '</nav></section><nav class="route-levels" aria-label="其他学习阶段">' + renderStageLinks() + '</nav><a class="route-back-link" href="/learning-path/?stage=1">查看阶段总览 ' + icon("arrow", 15) + '</a></div></aside><article class="lesson-main" id="lesson-content"><nav class="lesson-breadcrumb" aria-label="当前位置"><a href="/learning-path/">学习路线</a><span>/</span><a href="/learning-path/?stage=1">LEVEL 01</a><span>/</span><span>AI 基础认知</span><span>/</span><span aria-current="page">1.1</span></nav><header class="lesson-hero"><div class="lesson-hero-copy"><p class="lesson-kicker"><span>KNOWLEDGE POINT</span><i></i><span>LEVEL 01</span></p><h1><span class="lesson-number-large">1.1</span><span id="lesson-title">' + fallbackTitle + '</span></h1><p class="lesson-intro" id="lesson-intro">' + fallbackIntro + '</p><div class="lesson-hero-foot"><span>' + icon("book", 16) + ' 大模型基础原理</span><span class="lesson-dot"></span><span>知识点详情</span></div></div><div class="lesson-hero-art" aria-hidden="true"><img src="/assets/knowledge-llm-hero.png" alt="" fetchpriority="high"></div></header><section class="lesson-metrics" aria-label="本节信息"><div class="lesson-metric"><span class="metric-icon">' + icon("clock", 17) + '</span><div><small>学习时长</small><strong>19 <em>分钟</em></strong></div></div><div class="lesson-metric"><span class="metric-icon">' + icon("brain", 17) + '</span><div><small>难度</small><strong>入门</strong></div></div><div class="lesson-metric metric-state"><span class="metric-icon">' + icon("play", 16) + '</span><div><small>学习状态</small><strong>正在学习</strong></div></div><div class="lesson-metric"><span class="metric-icon">' + icon("route", 17) + '</span><div><small>章节通关</small><strong data-node-stage-progress="1">0/6 已通关</strong></div></div></section><section class="objectives-panel" aria-labelledby="objectives-title"><div class="compact-section-heading"><span class="section-kicker">LEARNING OBJECTIVES</span><h2 id="objectives-title">本节学习目标</h2></div><div class="objective-grid"><article class="objective-card"><span>01</span><p>理解大语言模型的基本概念和定义</p></article><article class="objective-card"><span>02</span><p>了解大语言模型的工作原理和核心特点</p></article><article class="objective-card"><span>03</span><p>认识大语言模型的典型应用场景</p></article></div></section><section class="knowledge-panel" aria-labelledby="core-title"><header class="knowledge-panel-heading"><span class="section-icon">' + icon("book", 21) + '</span><div><span class="section-kicker">CORE KNOWLEDGE</span><h2 id="core-title">核心内容</h2></div><span class="content-source-label">来自课程 · 大模型基础原理</span></header><div class="knowledge-modules" id="knowledge-modules" aria-live="polite"><p class="source-loading">正在载入课程内容…</p></div></section><section class="application-panel" id="applications"><div class="application-copy"><span class="section-kicker">FROM ONE MODEL TO MANY TASKS</span><h2>同一个模型，可以处理多种任务</h2><p>单一模型无需微调即可处理翻译、摘要、编程、推理、创意写作等多种任务，这是与以往专用小模型的本质区别。</p></div><div class="application-tags"><span>' + icon("message", 18) + '翻译</span><span>' + icon("note", 18) + '摘要</span><span>' + icon("code", 18) + '编程</span><span>' + icon("brain", 18) + '推理</span><span>' + icon("sparkles", 18) + '创意写作</span></div></section><section class="concept-panel" id="concept-flow" aria-labelledby="concept-title"><div class="compact-section-heading"><span class="section-kicker">CONCEPT DIAGRAM</span><h2 id="concept-title">一句话如何逐步生成？</h2><p>给定上文，模型预测下一个 token，再把新 token 放回上下文。</p></div><div class="sequence-example"><div class="sequence-step"><small>输入上文</small><strong>今天天气</strong></div><span class="sequence-arrow">' + icon("arrow", 18) + '</span><div class="sequence-step sequence-prediction"><small>预测下一个 token</small><strong>真</strong></div><span class="sequence-arrow">' + icon("arrow", 18) + '</span><div class="sequence-step"><small>更新上下文</small><strong>今天天气真</strong></div><span class="sequence-arrow">' + icon("arrow", 18) + '</span><div class="sequence-step sequence-prediction"><small>继续预测</small><strong>好</strong></div><span class="sequence-arrow">' + icon("arrow", 18) + '</span><div class="sequence-step sequence-output"><small>生成结果</small><strong>今天天气真好！</strong></div></div></section><section class="terms-panel" id="key-terms"><div class="compact-section-heading"><span class="section-kicker">KEY TERMS</span><h2>核心术语</h2></div><dl class="term-list"><div><dt>LLM</dt><dd>大语言模型（Large Language Model）</dd></div><div><dt>自监督学习</dt><dd>在海量文本数据上学习语言规律的训练方式。</dd></div><div><dt>自回归语言建模</dt><dd>给定上文，预测下文。</dd></div><div><dt>条件概率链式法则</dt><dd>将文本概率表示为逐步条件概率的乘积。</dd></div></dl></section><section class="summary-panel"><div class="compact-section-heading"><span class="section-kicker">KEY TAKEAWAYS</span><h2>学习小结</h2></div><ol class="summary-list"><li><span>01</span><p>LLM 是通过海量文本数据进行自监督学习的深度学习神经网络模型。</p></li><li><span>02</span><p>它学习语言的统计规律、语法结构和语义关系，并以预测下文为核心机制。</p></li><li><span>03</span><p>单一模型可以处理翻译、摘要、编程、推理和创意写作等多种任务。</p></li></ol></section><section class="quick-check" id="quick-check" aria-labelledby="quick-check-title"><div class="quick-check-heading"><span class="section-icon">' + icon("checklist", 20) + '</span><div><span class="section-kicker">QUICK CHECK</span><h2 id="quick-check-title">快速检查</h2></div><span class="quick-check-time">约 20 秒</span></div><p class="quick-check-question">LLM 生成文本时最核心的机制是什么？</p><div class="quick-check-options" role="group" aria-label="选择一个答案"><button type="button" data-answer="a">A <span>从数据库直接复制答案</span></button><button type="button" data-answer="b">B <span>根据上文预测下一个 token</span></button><button type="button" data-answer="c">C <span>随机产生文字</span></button><button type="button" data-answer="d">D <span>读取互联网实时内容</span></button></div><p class="quick-check-feedback" id="quick-check-feedback" role="status" aria-live="polite" hidden></p></section><nav class="lesson-pagination" aria-label="知识点导航"><div class="pagination-side pagination-previous"><span class="pagination-arrow">←</span><div><small>上一节</small><strong>已是第一个知识点</strong></div></div><a class="pagination-side pagination-next" href="/knowledge/1-2/"><div><small>下一节 · 1.2</small><strong>LLM 的核心能力与局限性</strong></div><span class="pagination-arrow">→</span></a></nav></article><aside class="assistant-rail" aria-label="学习辅助工具"><section class="rail-panel progress-panel"><div class="rail-panel-heading"><span class="rail-icon">' + icon("chart", 18) + '</span><div><small>YOUR PROGRESS</small><h2>学习进度</h2></div></div><div class="progress-summary"><div class="progress-ring" data-node-stage-ring="1" aria-label="AI 基础认知章节进度"><span><strong>0</strong><i>/ 6</i></span></div><div><strong>AI 基础认知</strong><small>当前学习点 · 1.1</small></div></div><nav class="progress-point-list" aria-label="本章进度目录">' + renderPointLinks() + '</nav></section><section class="rail-panel resources-panel"><div class="rail-panel-heading"><span class="rail-icon">' + icon("folder", 18) + '</span><div><small>LESSON RESOURCES</small><h2>本节资源</h2></div></div><div class="resource-list"><a class="resource-row" id="lecture-resource" href="https://feishu.doubao.com/slides/WqhSsdj0sliQIFdl9sacvjuznlh" target="_blank" rel="noopener noreferrer"><span class="resource-icon">' + icon("book", 17) + '</span><span><strong>课程讲义</strong><small>大模型基础原理 ↗</small></span></a><a class="resource-row" href="#concept-flow"><span class="resource-icon">' + icon("workflow", 17) + '</span><span><strong>概念图解</strong><small>自回归生成过程</small></span></a><a class="resource-row" href="#key-terms"><span class="resource-icon">' + icon("note", 17) + '</span><span><strong>核心术语</strong><small>4 个学习关键词</small></span></a><a class="resource-row" href="#quick-check"><span class="resource-icon">' + icon("checklist", 17) + '</span><span><strong>随堂快测</strong><small>1 道快速检查</small></span></a></div></section><section class="rail-panel assistant-panel"><span class="assistant-mark">' + icon("brain", 21) + '</span><div><small>AI LEARNING ASSISTANT</small><h2>需要换种方式理解？</h2><p>带着这一节的问题，去 Playground 继续探索。</p></div><a class="assistant-link" href="/playground/">打开 Playground ' + icon("arrow", 15) + '</a></section></aside></main>';
  document.body.classList.add("learning-platform-body", "knowledge-lesson-body");
}

function getSections(markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const sections = [];
  let current = null;
  Array.from(parsed.body.children).forEach(function (node) {
    if (node.tagName === "H3") {
      current = { title: node.textContent.trim(), nodes: [] };
      sections.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
  });
  return sections;
}

function renderSequenceDiagram() {
  return '<div class="autoregressive-demo" aria-label="自回归生成示例"><div><small>给定上文</small><strong>今天天气</strong></div><span>' + icon("arrow", 17) + '</span><div class="predicted-token"><small>预测下一个 token</small><strong>真</strong></div><span>' + icon("arrow", 17) + '</span><div><small>更新上下文</small><strong>今天天气真</strong></div><span>' + icon("arrow", 17) + '</span><div class="predicted-token"><small>继续预测</small><strong>好</strong></div><span>' + icon("arrow", 17) + '</span><div class="generated-token"><small>生成结果</small><strong>今天天气真好！</strong></div></div>';
}

function renderFeatureCards(list) {
  const items = Array.from(list.querySelectorAll(":scope > li"));
  const featureIcons = ["chart", "book", "note", "workflow"];
  return '<div class="feature-grid">' + items.map(function (item, index) {
    const strong = item.querySelector("strong");
    const title = strong ? strong.textContent.trim() : "核心特点";
    const text = item.textContent.replace(title, "").replace(/^[：:\s]+/, "").trim();
    const shortText = text.length > 148 ? text.slice(0, 145).replace(/[，、；：]$/, "") + "…" : text;
    return '<article class="feature-card"><span class="feature-icon">' + icon(featureIcons[index % featureIcons.length], 19) + '</span><h4>' + escapeHTML(title) + '</h4><p>' + escapeHTML(shortText) + '</p><details><summary>查看课程原文</summary><p>' + item.innerHTML + '</p></details></article>';
  }).join("") + '</div>';
}

function renderSourceModules(markup) {
  const sections = getSections(markup);
  return sections.map(function (section, index) {
    const isFeatures = section.title.includes("核心特征");
    const body = section.nodes.map(function (node) {
      if (isFeatures && node.tagName === "UL") return renderFeatureCards(node);
      return node.outerHTML;
    }).join("") + (section.title.includes("自回归生成原理") ? renderSequenceDiagram() : "");
    return '<section class="knowledge-module module-' + (index + 1) + '"><header class="module-heading"><span>' + String(index + 1).padStart(2, "0") + '</span><div><small>AI 基础认知 · 1.1</small><h3>' + escapeHTML(section.title) + '</h3></div></header><div class="module-body">' + body + '</div></section>';
  }).join("");
}

function bindHeader() {
  const navButton = document.getElementById("mobile-menu-button");
  const nav = document.getElementById("site-nav");
  const searchButton = document.getElementById("search-toggle");
  const searchForm = document.getElementById("site-search");
  if (navButton && nav) {
    navButton.addEventListener("click", function () {
      const open = navButton.getAttribute("aria-expanded") !== "true";
      navButton.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        nav.classList.remove("is-open");
        navButton.setAttribute("aria-expanded", "false");
      }
    });
  }
  if (searchButton && searchForm) {
    searchButton.addEventListener("click", function () {
      const open = searchButton.getAttribute("aria-expanded") !== "true";
      searchButton.setAttribute("aria-expanded", String(open));
      searchForm.hidden = !open;
      if (open) searchForm.querySelector("input")?.focus();
    });
    searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const query = searchForm.querySelector("input")?.value.trim();
      if (query) window.location.href = "/courses/?q=" + encodeURIComponent(query);
    });
  }
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
      const correct = button.dataset.answer === "b";
      const feedback = document.getElementById("quick-check-feedback");
      document.querySelectorAll("[data-answer]").forEach(function (option) {
        option.disabled = true;
        if (option.dataset.answer === "b") option.classList.add("is-correct");
        else if (option === button && !correct) option.classList.add("is-incorrect");
      });
      feedback.hidden = false;
      feedback.className = "quick-check-feedback " + (correct ? "is-correct" : "is-incorrect");
      feedback.textContent = correct ? "回答正确。LLM 的核心思想是给定上文，预测下文。" : "再回想一下：LLM 会根据已有上下文预测下一个 token。";
    });
  });
  const header = document.querySelector(".site-header");
  if (header) {
    const updateHeader = function () { header.classList.toggle("is-scrolled", window.scrollY > 18); };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }
  bindHeader();
}

async function loadLesson() {
  renderShell();
  bindInteractions();
  try {
    const response = await fetch("/data/chapter_01.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("课程数据暂时不可用");
    const course = await response.json();
    const point = course.knowledge_points?.[0];
    if (!point) throw new Error("没有找到 1.1 的课程内容");
    document.title = "1.1 " + point.title + " · AI Master";
    document.getElementById("lesson-title").textContent = point.title;
    const firstSection = getSections(point.content)[0];
    const firstParagraph = firstSection?.nodes.find(function (node) { return node.tagName === "P"; });
    if (firstParagraph) document.getElementById("lesson-intro").textContent = firstParagraph.textContent;
    document.getElementById("knowledge-modules").innerHTML = renderSourceModules(point.content);
    document.getElementById("route-points").innerHTML = renderPointLinks(course.knowledge_points.map(function (item) { return item.title; }));
    document.querySelector(".progress-point-list").innerHTML = renderPointLinks(course.knowledge_points.map(function (item) { return item.title; }));
    const lecture = document.getElementById("lecture-resource");
    if (course.ppt_url) lecture.href = course.ppt_url;
    clarifyKnowledgePage(1, 1);
    app.setAttribute("aria-busy", "false");
    mountMindCanvasEntries(document.getElementById("lesson-content"), { chapter: 1, index: 0 });
    initKnowledgeNodeFlow({ stageId: 1, number: 1 });
  } catch (error) {
    const content = document.getElementById("knowledge-modules");
    content.innerHTML = '<p class="source-error">课程内容载入失败。请刷新页面后重试。</p>';
    app.setAttribute("aria-busy", "false");
  }
}

loadLesson();
