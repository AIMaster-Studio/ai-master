import { STAGES } from "/ai-learning/data.js";
import { bindRouteAccordions, escapeHTML, icon, renderHeader } from "/ai-learning/components.js?v=20260925-acc1";
import { initRouteDrawer } from "/assets/route-drawer.js?v=20260926-edge1";
import { clarifyKnowledgePage } from "/ai-learning/knowledge-ui.js";
import { initKnowledgeNodeFlow } from "/assets/knowledge-node-flow.js?v=20260926-node";
import { mountMindCanvasEntries } from "/assets/mind-canvas-entry.js?v=20260927";

const app = document.getElementById("app");
const route = location.pathname.match(/\/knowledge\/([123456])-([1-6])\/?$/);
const level = Number(route?.[1] || 1);
const number = Number(route?.[2] || 2);
const courseId = { 1: 1, 2: 3, 3: 5, 4: 4, 5: 10, 6: 9 }[level];
const stage = STAGES.find(function (item) { return item.id === level; });
const advanced = level >= 4;
const tooling = level === 3;
const pointCount = stage?.lessons.length || 6;
const chapterUrl = "/chapter/" + courseId + "/";
const asset = "/assets/knowledge-series-" + level + "-" + number;
const advancedAsset = "/assets/knowledge-advanced-" + level + "-" + number;
const diagrams = {
  "1-2": ["knowledge-series-1-2-capabilities.png", "knowledge-series-1-2-limitations.png"],
  "1-3": ["knowledge-series-1-3-bpe-flow.png"],
  "1-4": ["knowledge-series-1-4-training-flow.png"],
  "1-5": ["knowledge-series-1-5-scaling-flow.png"],
  "1-6": ["knowledge-series-1-6-rlhf-flow.png"]
};

function sectionsFrom(markup) {
  const readableMarkup = markup.replace(/<text>([\s\S]*?)<\/text>/gi, "&lt;text&gt;$1&lt;/text&gt;");
  const source = new DOMParser().parseFromString(readableMarkup, "text/html");
  const sections = [];
  let current = null;
  Array.from(source.body.childNodes).forEach(function (node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "H3") {
      current = { title: node.textContent.trim(), nodes: [] };
      sections.push(current);
    } else if (current && (node.nodeType !== Node.TEXT_NODE || node.textContent.trim())) {
      current.nodes.push(node);
    }
  });
  return sections;
}

function sectionHtml(section) {
  const box = document.createElement("div");
  section.nodes.forEach(function (node) { box.appendChild(node.cloneNode(true)); });
  return box.innerHTML;
}

function firstExcerpt(sections) {
  if (tooling) {
    for (const section of sections) {
      const box = document.createElement("div");
      section.nodes.forEach(function (node) { box.appendChild(node.cloneNode(true)); });
      const paragraph = box.querySelector("p")?.textContent.trim();
      if (paragraph) return paragraph;
    }
    return sections.slice(0, 3).map(function (section) { return section.title; }).join(" · ");
  }
  for (const section of sections) {
    for (const node of section.nodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return node.textContent.trim();
    }
    const box = document.createElement("div");
    section.nodes.forEach(function (node) { box.appendChild(node.cloneNode(true)); });
    const line = box.querySelector("p, li, pre")?.textContent.trim();
    if (line) return line;
  }
  return "";
}

function linkTo(index) {
  if (level === 4 && index === 5) return "/chapter/4/#kp-6";
  return "/knowledge/" + level + "-" + (index + 1) + "/";
}

function pointLinks(points, compact, stageId, selectedNumber) {
  const targetLevel = stageId || level;
  const activeNumber = selectedNumber || (targetLevel === level ? number : 0);
  return points.map(function (point, index) {
    const selected = index === activeNumber - 1;
    const status = compact ? '<span class="node-status-label" data-node-status-label>未开始</span>' : "";
    const href = targetLevel === level ? linkTo(index) : targetLevel === 4 && index === 5 ? "/chapter/4/#kp-6" : "/knowledge/" + targetLevel + "-" + (index + 1) + "/";
    const title = typeof point === "string" ? point : point.title;
    return '<a class="route-point' + (selected ? " is-current" : "") + '" data-knowledge-node="' + targetLevel + '.' + (index + 1) + '" href="' + href + '"' + (selected ? ' aria-current="page"' : "") + '><span class="route-point-state">' + (selected ? icon("play", 14) : '<span class="series-point-dot"></span>') + '</span><span class="route-point-copy"><small>' + targetLevel + "." + (index + 1) + '</small><strong>' + escapeHTML(title) + '</strong></span>' + status + '</a>';
  }).join("");
}

function sidebar(points) {
  const levelRows = STAGES.map(function (item) {
    const isCurrent = item.id === level;
    const expanded = isCurrent;
    const contentId = "route-level-content-" + item.id;
    const pointsForStage = isCurrent ? points : item.lessons;
    const headingClass = isCurrent ? "active-level-heading" : "route-level";
    const itemClass = "route-accordion-item" + (isCurrent ? " active-level series-active-level is-expanded" : "");
    const count = '<span data-node-stage-progress="' + item.id + '">0/' + item.lessons.length + ' 已通关</span>';
    const pointMarkup = pointLinks(pointsForStage, true, item.id, isCurrent ? number : 0);
    const pointClass = "route-points" + (isCurrent ? "" : " series-collapsed-points");
    return '<section class="' + itemClass + '"><button class="' + headingClass + ' route-accordion-trigger" type="button" data-route-accordion-trigger aria-expanded="' + expanded + '" aria-controls="' + contentId + '"' + (isCurrent ? ' aria-current="step"' : "") + '><span class="' + (isCurrent ? "active-level-number" : "route-level-index") + '">' + String(item.id).padStart(2, "0") + '</span><span class="route-level-copy"><small>LEVEL ' + String(item.id).padStart(2, "0") + '</small><strong>' + escapeHTML(item.title) + '</strong></span><span class="' + (isCurrent ? "active-level-count" : "route-level-count") + '">' + count + '<span class="route-accordion-caret" aria-hidden="true"></span></span></button><nav class="' + pointClass + '" id="' + contentId + '" aria-label="LEVEL ' + String(item.id).padStart(2, "0") + ' 知识点"' + (expanded ? "" : " hidden") + '>' + pointMarkup + '</nav></section>';
  }).join("");
  return '<aside class="route-panel series-route-panel" aria-label="AI 学习路线"><div class="route-panel-heading"><span class="route-heading-icon">' + icon("route", 20) + '</span><div><small>YOUR LEARNING PATH</small><h2>学习路线</h2></div><button class="route-collapse" id="route-collapse" type="button" aria-expanded="true" aria-controls="route-body">收起</button></div><div class="route-body" id="route-body"><nav class="series-level-list route-accordion-group" aria-label="学习阶段">' + levelRows + '</nav><a class="route-back-link" href="/learning-path/?stage=' + level + '">查看阶段总览 ' + icon("arrow", 15) + '</a>' + (level === 2 ? '<span class="series-sidebar-space" aria-hidden="true"></span>' : "") + '</div></aside>';
}

function hero(point, sections, course) {
  const toolHeroAsset = { 2: "knowledge-tools-3-2-hero.png", 3: "knowledge-tools-3-3-hero.png", 4: "knowledge-tools-3-4-hero.png", 6: "knowledge-tools-3-6-hero.png" }[number];
  const artwork = tooling
    ? '<div class="tool-hero-art' + (toolHeroAsset ? " has-page-art" : " uses-space-art") + '" style="--tool-hero:url(/assets/' + (toolHeroAsset || "knowledge-tools-space.png") + ')" aria-hidden="true"></div>'
    : advanced
    ? '<div class="advanced-hero-art" style="--advanced-hero:url(' + advancedAsset + '-hero.png)" aria-hidden="true"></div>'
    : level === 1
    ? '<div class="series-planet" aria-hidden="true"><img src="/assets/knowledge-series-planet.png" alt=""><img src="/assets/knowledge-series-robot.png" alt=""></div>'
    : '<div class="series-space" aria-hidden="true"><img src="' + asset + '-space.png" alt=""></div>';
  const metrics = advanced || tooling
    ? '<div><span>' + icon("book", 16) + '</span><small>所属阶段</small><strong>' + escapeHTML(stage.title) + '</strong></div><div><span>' + icon("route", 16) + '</span><small>章节通关</small><strong data-node-stage-progress="' + level + '">0/' + pointCount + ' 已通关</strong></div><div><span>' + icon("brain", 16) + '</span><small>核心模块</small><strong>' + sections.length + ' 个</strong></div><div><span>' + icon("folder", 16) + '</span><small>原课程</small><strong>' + escapeHTML(course.title) + '</strong></div>'
    : '<div><span>' + icon("clock", 16) + '</span><small>学习时长</small><strong>' + ([19, 22, 22, 20, 25, 25][number - 1]) + ' 分钟</strong></div><div><span>' + icon("brain", 16) + '</span><small>难度</small><strong>' + (number < 4 ? "入门" : "进阶") + '</strong></div><div><span>' + icon("book", 16) + '</span><small>章节通关</small><strong data-node-stage-progress="' + level + '">0/' + pointCount + ' 已通关</strong></div><div><span>' + icon("chart", 16) + '</span><small>学习状态</small><strong>学习中</strong></div>';
  const heading = advanced || tooling
    ? '<nav class="advanced-hero-breadcrumb" aria-label="当前位置"><a href="/learning-path/">学习路线</a><span>›</span><a href="/learning-path/?stage=' + level + '">LEVEL ' + String(level).padStart(2, "0") + '</a><span>›</span><span>' + escapeHTML(stage.title) + '</span><span>›</span><span aria-current="page">' + level + '.' + number + '</span></nav>'
    : '<p class="lesson-kicker"><span>KNOWLEDGE POINT</span><i></i><span>LEVEL ' + String(level).padStart(2, "0") + '</span></p>';
  return '<header class="lesson-hero series-hero"><div class="lesson-hero-copy">' + heading + '<h1><span class="lesson-number-large">' + level + "." + number + '</span><span>' + escapeHTML(point.title) + '</span></h1><p class="lesson-intro">' + escapeHTML(firstExcerpt(sections)) + '</p><div class="lesson-hero-foot"><span>' + icon("book", 15) + ' ' + escapeHTML(stage.title) + '</span><span class="lesson-dot"></span><span>知识点详情</span></div></div>' + artwork + '<div class="series-hero-metrics">' + metrics + '</div></header>';
}

function objectives(sections, point) {
  let goals = sections.slice(0, 3).map(function (section, i) { return { title: section.title, section: i + 1 }; });
  if (goals.length < 3) {
    const box = document.createElement("div");
    sections[0].nodes.forEach(function (node) { box.appendChild(node.cloneNode(true)); });
    const nested = Array.from(box.querySelectorAll("li > strong")).slice(0, 3).map(function (node) {
      return { title: node.textContent.trim(), section: 1 };
    });
    if (nested.length === 3) goals = nested;
  }
  if (advanced && goals.length < 3 && !goals.some(function (goal) { return goal.title === point.title; })) {
    goals.push({ title: point.title, section: 1 });
  }
  return '<section class="objectives-panel series-objectives" aria-labelledby="objectives-title"><div class="compact-section-heading"><span class="section-kicker">LEARNING OBJECTIVES</span><h2 id="objectives-title">本节学习目标</h2></div><div class="objective-grid">' + goals.map(function (goal, i) {
    return '<a class="objective-card" href="#section-' + goal.section + '"><span class="series-objective-icon">' + icon(["brain", "book", "sparkles"][i], 20) + '</span><span class="series-objective-copy"><small>目标 0' + (i + 1) + '</small><strong>' + escapeHTML(goal.title) + '</strong></span></a>';
  }).join("") + '</div></section>';
}

function visual() {
  if (tooling) return toolVisual();
  const items = diagrams[level + "-" + number];
  if (!items) return "";
  return '<section class="series-visual-panel" aria-labelledby="visual-title"><div class="series-section-head"><span class="section-icon">' + icon("chart", 20) + '</span><div><span class="section-kicker">VISUAL GUIDE</span><h2 id="visual-title">知识图解</h2></div></div><div class="series-visual-grid' + (items.length === 2 ? ' is-paired' : '') + '">' + items.map(function (name, index) {
    const caption = number === 2 ? ["核心能力", "核心局限"][index] : "学习流程";
    const description = stage.lessons[number - 1] + " · " + caption + "图解";
    return '<figure><a class="series-image-open" href="/assets/' + name + '" aria-label="' + escapeHTML(description) + '，打开原图"><img src="/assets/' + name + '" alt="' + escapeHTML(description) + '" loading="lazy"></a><figcaption>' + caption + '</figcaption></figure>';
  }).join("") + '</div></section>';
}

function hooksFlowVisual() {
  const stages = [
    { icon: "sparkles", title: "事件触发", summary: "Claude Code 生命周期发出信号", tags: ["PreToolUse", "PostToolUse", "UserPromptSubmit", "PreCompact"], tone: "violet" },
    { icon: "search", title: "条件匹配", summary: "matcher 筛选工具或操作", tags: ["Bash", "Write"], tone: "blue" },
    { icon: "code", title: "运行 Hook", summary: "执行脚本命令或注入 Prompt", tags: ["command", "prompt"], tone: "cyan" },
    { icon: "checklist", title: "反馈到流程", summary: "检查、拦截或自动处理", tags: ["安全检查", "自动格式化"], tone: "green" }
  ];
  const examples = [
    { event: "PreToolUse · Bash", action: "安全检查", detail: "执行前识别并拦截危险命令" },
    { event: "PostToolUse · Write", action: "自动格式化", detail: "文件写入后运行格式化脚本" },
    { event: "PreCompact", action: "上下文备份", detail: "压缩前保存对话历史" }
  ];
  return '<div class="hooks-visual-body"><ol class="hooks-flow-stages" aria-label="Hooks 工作过程">' + stages.map(function (stage, index) {
    return '<li class="hooks-flow-stage tone-' + stage.tone + '"><div class="hooks-stage-head"><span class="hooks-stage-icon">' + icon(stage.icon, 21) + '</span><small>STEP 0' + (index + 1) + '</small></div><h3>' + escapeHTML(stage.title) + '</h3><p>' + escapeHTML(stage.summary) + '</p><div class="hooks-stage-tags">' + stage.tags.map(function (tag) { return '<code>' + escapeHTML(tag) + '</code>'; }).join("") + '</div></li>';
  }).join("") + '</ol><div class="hooks-examples"><div class="hooks-examples-heading"><span>HOOK EXAMPLES</span><strong>课程中的自动化场景</strong></div><div class="hooks-example-grid">' + examples.map(function (item) {
    return '<article><code>' + escapeHTML(item.event) + '</code><strong>' + escapeHTML(item.action) + '</strong><span>' + escapeHTML(item.detail) + '</span></article>';
  }).join("") + '</div></div></div>';
}

function projectFlowVisual() {
  const stages = [
    { icon: "search", title: "需求分析", detail: "拆解目标，梳理技术方案", output: "技术方案文档", tone: "amber" },
    { icon: "workflow", title: "架构设计", detail: "规划模块结构与数据流", output: "架构图 · 接口定义", tone: "blue" },
    { icon: "code", title: "编码实现", detail: "实现功能并编写测试", output: "代码 · 测试", tone: "violet" },
    { icon: "checklist", title: "代码审查", detail: "用 /review 检查改动", output: "审查报告", tone: "green" },
    { icon: "note", title: "文档生成", detail: "更新 README 与 API 文档", output: "项目文档", tone: "purple" },
    { icon: "cube", title: "部署交付", detail: "编写 Dockerfile 与部署脚本", output: "部署配置", tone: "orange" }
  ];
  return '<ol class="tool-project-flow" aria-label="Claude Code 项目实战六阶段">' + stages.map(function (stage, index) {
    return '<li class="tool-project-step tone-' + stage.tone + '"><div class="tool-project-step-head"><span class="tool-project-step-icon">' + icon(stage.icon, 23) + '</span><small>PHASE ' + String(index + 1).padStart(2, "0") + '</small></div><h3>' + escapeHTML(stage.title) + '</h3><p>' + escapeHTML(stage.detail) + '</p><div class="tool-project-output"><small>阶段产出</small><strong>' + escapeHTML(stage.output) + '</strong></div></li>';
  }).join("") + '</ol><div class="tool-project-flow-note"><span>END-TO-END WORKFLOW</span><strong>从需求方案到可部署交付，逐阶段完成 Claude Code 项目实战</strong></div>';
}

function toolVisual() {
  const titles = { 1: "首次启动", 2: "终端交互示例", 3: "Hooks 工作原理", 4: "Skills 的组成", 5: "MCP 如何连接工具与数据", 6: "Claude Code 项目实战流程" };
  const config = {
    2: { images: ["knowledge-tools-3-2-terminal.png"], captions: ["在项目目录启动 Claude Code"] },
    4: { images: ["knowledge-tools-3-4-structure.png"], captions: ["把专业经验、工作流程和最佳实践封装为可复用能力"] }
  }[number];
  const heading = '<div class="series-section-head"><span class="section-icon">' + icon("workflow", 20) + '</span><div><span class="section-kicker">VISUAL GUIDE</span><h2 id="visual-title">' + escapeHTML(titles[number]) + '</h2></div></div>';
  if (number === 1) {
    const startFigure = '<figure><div class="tool-start-terminal" role="img" aria-label="Claude Code 终端启动示意"><div class="tool-start-terminal-bar"><span aria-hidden="true"><i></i><i></i><i></i></span><b>Terminal</b></div><div class="tool-start-terminal-body"><svg class="tool-start-claude-mark" viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3"><path d="M24 5v9M24 34v9M5 24h9M34 24h9M10.6 10.6l6.4 6.4M31 31l6.4 6.4M37.4 10.6 31 17M17 31l-6.4 6.4"/></g><circle cx="24" cy="24" r="4" fill="currentColor"/></svg><strong>claude</strong><code><span aria-hidden="true">›</span> claude</code><small>AI coding assistant</small></div></div><figcaption>Claude Code</figcaption></figure>';
    const startSteps = ['<article><small>STEP 01 · INSTALL</small><strong>安装 CLI</strong><code>irm https://claude.ai/install.ps1 | iex</code></article>', '<article><small>STEP 02 · SIGN IN</small><strong>完成认证</strong><code>claude login</code></article>', '<article><small>STEP 03 · VERIFY</small><strong>验证安装</strong><code>claude --version</code></article>'].join("");
    return '<section class="series-visual-panel tool-visual-panel" aria-labelledby="visual-title">' + heading + '<div class="tool-start-flow">' + startFigure + startSteps + '</div></section>';
  }
  if (number === 5) {
    return '<section class="series-visual-panel tool-visual-panel" aria-labelledby="visual-title">' + heading + '<div class="mcp-architecture"><div class="mcp-endpoint"><small>HOST</small><strong>Claude Code</strong></div><div class="mcp-bridge"><span>JSON-RPC</span><b>↔</b></div><div class="mcp-endpoint mcp-server"><small>SERVER</small><strong>MCP Server</strong><span>数据库 · API</span></div></div><div class="mcp-capabilities"><article><strong>Resources</strong><span>暴露数据</span></article><article><strong>Tools</strong><span>暴露可执行功能</span></article><article><strong>Prompts</strong><span>预定义提示模板</span></article></div></section>';
  }
  if (number === 3) return '<section class="series-visual-panel tool-visual-panel hooks-visual-panel" aria-labelledby="visual-title">' + heading + hooksFlowVisual() + '</section>';
  if (number === 6) return '<section class="series-visual-panel tool-visual-panel project-flow-panel" aria-labelledby="visual-title">' + heading + projectFlowVisual() + '</section>';
  return '<section class="series-visual-panel tool-visual-panel" aria-labelledby="visual-title">' + heading + '<div class="tool-visual-grid">' + config.images.map(function (image, index) {
    const caption = config.captions[index] || "";
    const description = titles[number] + (caption ? " · " + caption : "");
    return '<figure><a class="series-image-open" href="/assets/' + image + '" aria-label="' + escapeHTML(description) + '，打开原图"><img src="/assets/' + image + '" alt="' + escapeHTML(description) + '" loading="lazy"></a>' + (caption ? '<figcaption>' + escapeHTML(caption) + '</figcaption>' : "") + '</figure>';
  }).join("") + '</div></section>';
}

function core(sections, course) {
  let overview = "";
  if (level === 2 && number === 2) {
    const box = document.createElement("div");
    sections[0].nodes.forEach(function (node) { box.appendChild(node.cloneNode(true)); });
    overview = '<div class="series-overview" aria-label="' + escapeHTML(sections[0].title) + '">' + Array.from(box.querySelectorAll("ol > li")).slice(0, 4).map(function (item, index) {
      const title = item.querySelector("strong")?.textContent.trim() || "";
      const copy = item.cloneNode(true);
      copy.querySelectorAll("pre, strong").forEach(function (node) { node.remove(); });
      const detail = copy.textContent.replace(/^[:：]\s*/, "").trim();
      return '<div class="series-overview-card"><span class="series-overview-icon">' + icon(["brain", "note", "settings", "sparkles"][index], 21) + '</span><small>0' + (index + 1) + '</small><strong>' + escapeHTML(title) + '</strong><p>' + escapeHTML(detail) + '</p></div>';
    }).join("") + '</div>';
  }
  const coreTitle = level === 2 && (number === 2 || number === 5) ? sections[0].title : "核心内容";
  return '<section class="knowledge-panel series-core" aria-labelledby="core-title"><header class="knowledge-panel-heading"><span class="section-icon">' + icon("book", 21) + '</span><div><span class="section-kicker">CORE KNOWLEDGE</span><h2 id="core-title">' + escapeHTML(coreTitle) + '</h2></div><span class="content-source-label">来自课程 · ' + escapeHTML(course.title) + '</span></header>' + overview + '<div class="series-module-grid">' + sections.map(function (section, index) {
    return '<section class="series-module" id="section-' + (index + 1) + '" aria-labelledby="section-title-' + (index + 1) + '"><header class="module-heading"><span>' + String(index + 1).padStart(2, "0") + '</span><div><small>KNOWLEDGE ' + String(index + 1).padStart(2, "0") + '</small><h3 id="section-title-' + (index + 1) + '">' + escapeHTML(section.title) + '</h3></div></header><div class="module-body">' + sectionHtml(section) + '</div></section>';
  }).join("") + '</div></section>';
}

function summary(sections) {
  return '<section class="summary-panel series-summary" id="summary"><div class="compact-section-heading"><span class="section-kicker">REVIEW THIS LESSON</span><h2>学习小结</h2></div><ol class="summary-list">' + sections.slice(0, 4).map(function (section, index) {
    return '<li><span>' + String(index + 1).padStart(2, "0") + '</span><p>' + escapeHTML(section.title) + '</p></li>';
  }).join("") + '</ol></section>';
}

function pagination(points) {
  const prev = number > 1
    ? '<a class="pagination-side pagination-previous" href="' + linkTo(number - 2) + '"><span class="pagination-arrow">←</span><div><small>上一节 · ' + level + "." + (number - 1) + '</small><strong>' + escapeHTML(points[number - 2].title) + '</strong></div></a>'
    : '<div class="pagination-side pagination-previous" aria-disabled="true"><span class="pagination-arrow">←</span><div><small>上一节</small><strong>本章第一个知识点</strong></div></div>';
  const next = number < pointCount
    ? '<a class="pagination-side pagination-next" href="' + linkTo(number) + '"><div><small>下一节 · ' + level + "." + (number + 1) + '</small><strong>' + escapeHTML(points[number].title) + '</strong></div><span class="pagination-arrow">→</span></a>'
    : '<a class="pagination-side pagination-next" href="' + (level === 6 ? '/learning-path/' : '/learning-path/?stage=' + (level + 1)) + '"><div><small>' + (level === 6 ? 'AI Master 学习路线' : '已到本章末尾') + '</small><strong>' + (level === 6 ? '返回学习路线' : '查看下一阶段') + '</strong></div><span class="pagination-arrow">→</span></a>';
  return '<nav class="lesson-pagination series-pagination" aria-label="知识点导航">' + prev + next + '</nav>';
}

function rail(points, course) {
  return '<aside class="assistant-rail series-rail" aria-label="学习辅助工具"><section class="rail-panel series-progress"><div class="rail-panel-heading"><span class="rail-icon">' + icon("chart", 18) + '</span><div><h2>学习进度</h2></div></div><div class="series-progress-overview"><span class="series-progress-ring" data-node-stage-ring="' + level + '" style="--pct:0%"><strong>0</strong><i>/ ' + pointCount + '</i></span><div><small>本阶段已通关</small><strong data-node-stage-progress="' + level + '">0/' + pointCount + ' 已通关</strong><span>' + escapeHTML(stage.title) + '</span></div></div><nav class="progress-point-list" aria-label="本章知识点目录">' + pointLinks(points, true) + '</nav></section><section class="rail-panel series-resources"><div class="rail-panel-heading"><span class="rail-icon">' + icon("folder", 18) + '</span><div><h2>本节资源</h2></div></div><div class="resource-list"><a class="resource-row" href="' + escapeHTML(course.ppt_url || chapterUrl) + '" target="_blank" rel="noopener noreferrer"><span class="resource-icon">' + icon("book", 17) + '</span><span><strong>课程讲义</strong><small>' + escapeHTML(course.title) + ' ↗</small></span></a><a class="resource-row" href="#core-title"><span class="resource-icon">' + icon("note", 17) + '</span><span><strong>核心内容</strong><small>查看原课程正文</small></span></a><a class="resource-row" href="#summary"><span class="resource-icon">' + icon("checklist", 17) + '</span><span><strong>学习小结</strong><small>回顾本节重点</small></span></a><a class="resource-row" href="' + chapterUrl + '#kp-' + number + '"><span class="resource-icon">' + icon("route", 17) + '</span><span><strong>课程原页</strong><small>查看对应知识点</small></span></a></div></section><section class="rail-panel series-assistant"><div><span class="assistant-mark">' + icon("sparkles", 20) + '</span><h2>AI 学习助手</h2><p>遇到不理解的概念？继续向 AI 助手提问。</p><a href="/playground/">向 AI 助手提问 ' + icon("arrow", 15) + '</a></div><img src="/assets/knowledge-series-robot.png" alt="" loading="lazy"></section></aside>';
}

function render(course, point) {
  const points = course.knowledge_points;
  const sections = sectionsFrom(point.content);
  document.title = level + "." + number + " " + point.title + " · AI Master";
  app.innerHTML = renderHeader("learning-path") + '<a class="lesson-skip" href="#lesson-content">跳到本节内容</a><main class="knowledge-layout series-layout ' + (advanced ? "series-advanced" : tooling ? "series-tools" : level === 2 ? "series-prompt" : "series-foundation") + '" data-lesson="' + level + "-" + number + '"' + (advanced ? ' style="--advanced-canvas:url(' + advancedAsset + '-canvas.png)"' : tooling ? ' style="--tool-canvas:url(/assets/knowledge-tools-space.png)"' : '') + '>' + sidebar(points) + '<article class="lesson-main series-main" id="lesson-content"><nav class="lesson-breadcrumb" aria-label="当前位置"><a href="/learning-path/">学习路线</a><span>/</span><a href="/learning-path/?stage=' + level + '">LEVEL ' + String(level).padStart(2, "0") + '</a><span>/</span><span>' + escapeHTML(stage.title) + '</span><span>/</span><span aria-current="page">' + level + "." + number + '</span></nav>' + hero(point, sections, course) + objectives(sections, point) + visual() + core(sections, course) + summary(sections) + pagination(points) + '</article>' + rail(points, course) + '</main>';
  clarifyKnowledgePage(level, number);
  app.setAttribute("aria-busy", "false");
  bindEvents();
  mountMindCanvasEntries(document.getElementById("lesson-content"), { chapter: courseId, index: number - 1 });
  initKnowledgeNodeFlow({ stageId: level, number: number });
}

function bindEvents() {
  const menu = document.getElementById("mobile-menu-button");
  const nav = document.getElementById("site-nav");
  menu?.addEventListener("click", function () {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("is-open", open);
  });
  const search = document.getElementById("search-toggle");
  const form = document.getElementById("site-search");
  search?.addEventListener("click", function () {
    const open = search.getAttribute("aria-expanded") !== "true";
    search.setAttribute("aria-expanded", String(open));
    if (form) form.hidden = !open;
    if (open) form?.querySelector("input")?.focus();
  });
  form?.addEventListener("submit", function (event) {
    event.preventDefault();
    const query = form.querySelector("input")?.value.trim();
    if (query) location.href = "/courses/?q=" + encodeURIComponent(query);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      nav?.classList.remove("is-open");
      menu?.setAttribute("aria-expanded", "false");
      if (form) form.hidden = true;
      search?.setAttribute("aria-expanded", "false");
    }
  });
  initRouteDrawer();
  bindRouteAccordions();
}

async function start() {
  try {
    const response = await fetch("/data/chapter_" + String(courseId).padStart(2, "0") + ".json", { cache: "no-cache" });
    if (!response.ok) throw new Error("课程数据加载失败");
    const course = await response.json();
    const point = course.knowledge_points?.[number - 1];
    if (!point || !stage) throw new Error("未找到对应知识点");
    render(course, point);
  } catch (error) {
    app.innerHTML = renderHeader("learning-path") + '<main class="series-error"><h1>课程内容暂时无法载入</h1><p>请刷新页面后重试。</p><a href="/learning-path/?stage=' + level + '">返回学习路线</a></main>';
    app.setAttribute("aria-busy", "false");
    console.error(error);
  }
}
start();
