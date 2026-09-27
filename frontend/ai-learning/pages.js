import {
  COURSES, DEMO_METRICS, FACTS, FEATURES, LEARNING_LOOP, LEARNING_PROGRESS,
  PLAYGROUND_INITIAL_PROMPT, PLAYGROUND_INITIAL_RESPONSE, STAGES,
  UPGRADE_SUGGESTIONS
} from "./data.js";
import {
  escapeHTML, icon, renderFeatureCard, renderMetricCard, renderProgressRow,
  renderSkillRadar, renderStageCard, renderLevelNav, stageContent
} from "./components.js";

function sectionHeading(kicker, title, description, link) {
  return '<div class="section-heading"><div><span class="eyebrow">' + kicker + '</span><h2>' + title + '</h2><p>' + description + '</p></div>' + (link || "") + '</div>';
}

function renderStats() {
  return '<div class="hero-stats" aria-label="AI Master 学习内容"><div class="stats-grid">' +
    FACTS.map(function (fact) {
      return '<div class="stat-item"><strong>' + fact.value + '</strong><span>' + fact.label + '</span></div>';
    }).join("") + '</div></div>';
}

function renderHeroRoute() {
  return '<div class="hero-visual" aria-hidden="true"><img src="/assets/learning-hero-visual.webp" alt="" width="1448" height="1086" loading="eager" fetchpriority="high" decoding="async"><div class="route-chip route-chip-prompt"><span></span>Prompt</div><div class="route-chip route-chip-tools"><span></span>AI 工具</div><div class="route-chip route-chip-engineering"><span></span>AI 工程</div><div class="route-chip route-chip-agent"><span></span>AI Agent</div><span class="route-end-label">真实项目</span></div>';
}

const REVIEW_STEPS = [
  { title: "课程总览", code: "STEP 01 · 学习进度", description: "查看真实章节目录与本机保存的学习进度。首次进入时，未完成的模块保持 0/7。", href: "/course-progress/", action: "查看实际进度" },
  { title: "交互实验", code: "STEP 02 · 动手探索", description: "进入 12 个可操作实验，观察分词、Transformer、RAG 与智能体工具协同。", href: "/experiments/", action: "打开 12 个实验" },
  { title: "评测证据", code: "STEP 03 · 核对方法", description: "检查 21 例内部评测记录、混淆矩阵与尚未采集的指标边界。", href: "/ai-review/", action: "查看证据墙" },
  { title: "讲解通关", code: "STEP 04 · 亲自解释", description: "用自己的话讲清 AI 概念，再通过练习和复习巩固理解。", href: "/learning-center/", action: "进入讲解通关" }
];

function renderReviewPath() {
  return '<section class="review-path-section"><div class="section-heading"><div><span class="eyebrow">JUDGE REVIEW · 3 MINUTES</span><h2>三分钟看懂 AI Master</h2><p>沿着现有课程、实验和证据入口，快速体验产品的学习闭环。</p></div><a class="text-link" href="/ai-review/">评测口径 ' + icon("arrow", 16) + '</a></div><div class="review-path-card"><div class="review-step-tabs" role="tablist" aria-label="三分钟演示步骤">' +
    REVIEW_STEPS.map(function (step, index) {
      return '<button type="button" class="review-step-tab' + (index === 0 ? ' is-active' : '') + '" id="review-tab-' + (index + 1) + '" role="tab" aria-controls="review-panel-' + (index + 1) + '" aria-selected="' + (index === 0) + '" tabindex="' + (index === 0 ? "0" : "-1") + '" data-review-index="' + index + '"><span>' + String(index + 1).padStart(2, "0") + '</span>' + step.title + '</button>';
    }).join("") +
    '</div><div class="review-panels">' + REVIEW_STEPS.map(function (step, index) {
      return '<article class="review-step-panel" id="review-panel-' + (index + 1) + '" role="tabpanel" aria-labelledby="review-tab-' + (index + 1) + '"' + (index ? ' hidden' : '') + '><span class="eyebrow">' + step.code + '</span><h3>' + step.title + '</h3><p>' + step.description + '</p><a class="button button-outline" href="' + step.href + '">' + step.action + ' ' + icon("arrow", 16) + '</a></article>';
    }).join("") + '</div><div class="review-step-controls"><button type="button" id="review-prev" disabled>← 上一步</button><span id="review-position" aria-live="polite">1 / 4</span><button type="button" id="review-next">下一步 →</button></div></div></section>';
}

export function renderHome() {
  const learningLoop = LEARNING_LOOP.map(function (step, index) {
    const item = '<li class="learning-loop-step loop-' + step.tone + '"><a class="learning-loop-link" href="' + step.href + '"><span class="learning-loop-icon">' + icon(step.icon, 29) + '</span><span class="learning-loop-copy"><strong>' + step.title + '</strong><small>' + step.description + '</small></span></a></li>';
    return item + (index < LEARNING_LOOP.length - 1 ? '<li class="learning-loop-arrow" aria-hidden="true"><span>→</span></li>' : '');
  }).join("");
  return '<section class="hero-panel"><div class="hero-grid"><div class="hero-copy"><span class="hero-badge">AI Master <span aria-hidden="true">·</span> 交互式 AI 学习平台</span><h1>从零开始，<br>系统学会 <span>AI</span></h1><p class="hero-lede">面向初学者与进阶学习者的交互式 AI 学习平台，通过 <strong>学习路径</strong>、<strong>实战训练</strong> 与 <strong>AI 反馈</strong>，陪你从入门走向进阶。</p><div class="hero-actions"><a class="button button-primary button-large" href="/learning-path/">开始学习 ' + icon("arrow", 19) + '</a><a class="button button-outline button-large" href="/learning-path/">查看学习路径</a></div><p class="hero-proof">学习路径 <span>·</span> 实战训练 <span>·</span> AI 反馈</p></div>' + renderStats() + renderHeroRoute() + '</div></section>' +
    '<section class="learning-loop-section" aria-labelledby="learning-loop-heading"><div class="learning-loop-heading"><span class="eyebrow">AI MASTER · LEARNING LOOP</span><h2 id="learning-loop-heading">从了解 AI 到持续进阶</h2><p>沿着学习、实践与反馈，把每一步积累成自己的能力。</p></div><ol class="learning-loop-list">' + learningLoop + '</ol></section>' +
    '<section class="content-section features-section" id="features">' + sectionHeading("LEARN · BUILD · VERIFY", "为 AI 学习准备的完整工具", "从掌握概念，到完成实作，再到记录和检验自己的进步。", '<a class="text-link" href="/projects/">探索项目实战 ' + icon("arrow", 16) + '</a>') + '<div class="features-grid">' + FEATURES.map(renderFeatureCard).join("") + '</div></section>' +
    '<section class="content-section stages-section" id="learning-path">' + sectionHeading("A CLEAR LEARNING PATH", "六个阶段，逐步走进 AI", "沿着从基础认知到 AI 项目的路线，把新知识变成自己的能力。", '<a class="text-link" href="/learning-path/">查看完整路线 ' + icon("arrow", 16) + '</a>') + '<div class="stages-grid">' + STAGES.map(renderStageCard).join("") + '</div></section>' +
    renderReviewPath() +
    '<section class="home-cta"><div class="cta-orbit">' + icon("route", 34) + '</div><div><span class="eyebrow">START YOUR NEXT STEP</span><h2>选一门课程，开始动手</h2><p>浏览 10 章课程内容，或直接体验 12 个交互实验。</p></div><div class="cta-actions"><a class="button button-primary" href="/courses/">浏览课程 ' + icon("arrow", 17) + '</a><a class="button button-quiet" href="/playground/">打开 Playground</a></div></section>';
}

function dashboardIntro() {
  return '<section class="greeting-banner"><div class="greeting-copy"><span class="eyebrow">YOUR LEARNING CENTER</span><h1>早上好，林同学 ' + icon("sparkles", 22) + '</h1><p>今天也是学习 AI 的第 28 天，继续加油！</p><span class="sample-label">演示学员数据 · 不代表真实用户统计</span></div><div class="greeting-art" aria-hidden="true"><div class="greeting-route"><span>Prompt</span><i></i><span>AI 工具</span><i></i><span>AI Agent</span></div></div></section>';
}

function recommendationCard() {
  return '<section class="recommendation-card"><div class="recommendation-thumb"><div class="thumb-window"><span></span><span></span><span></span><i></i><b></b></div><span class="thumb-play">' + icon("play", 19) + '</span></div><div class="recommendation-copy"><span class="recommend-badge">课程推荐 · 演示</span><h2>第 3 章 让 AI 更好地理解你的需求</h2><p>Prompt Engineering · 提示词工程</p><div class="recommend-meta"><span>' + icon("play", 15) + ' 视频课程</span><span>' + icon("clock", 15) + ' 28 分钟</span><span>初级</span></div></div><a class="button button-primary recommendation-cta" href="/static/prompt_cg_starlab/index.html">开始学习 ' + icon("arrow", 17) + '</a></section>';
}

function todayTasks() {
  return '<section class="panel today-panel" id="today-tasks"><div class="panel-heading"><div><span class="eyebrow">TODAY · 演示任务</span><h2>今日任务</h2></div><a class="text-link" href="/learning-center/">学习计划 ' + icon("arrow", 15) + '</a></div><div class="today-task-list"><a href="/static/prompt_cg_starlab/index.html"><span class="task-check">' + icon("check", 15) + '</span><span><strong>复习提示词编写原则</strong><small>课程 · 约 15 分钟</small></span><em>已完成</em></a><a href="/hands-on/"><span class="task-check"></span><span><strong>完成一个 Prompt 实践任务</strong><small>动手实践 · 约 20 分钟</small></span><em>进行中</em></a><a href="/static/agentic_cg/index.html"><span class="task-check"></span><span><strong>认识 AI Agent 的执行循环</strong><small>课程 · 约 18 分钟</small></span><em>待开始</em></a></div><div class="task-progress-line"><span>3 / 5 项已完成 · 演示</span><div class="progress-track"><i style="--progress:60%"></i></div></div></section>';
}

function dashboardLearning() {
  const values = LEARNING_PROGRESS.map(function (item) { return item.value; });
  return '<div class="dashboard-lower-grid"><section class="panel progress-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR JOURNEY · 演示</span><h2>学习进度</h2></div><a class="text-link" href="/course-progress/">查看实际通关记录 ' + icon("arrow", 15) + '</a></div><div class="progress-list">' + LEARNING_PROGRESS.map(renderProgressRow).join("") + '</div></section><div class="dashboard-right-stack"><section class="panel radar-panel"><div class="panel-heading"><div><span class="eyebrow">SKILL MAP · 演示</span><h2>' + icon("brain", 20) + ' AI 能力图谱</h2></div><a class="text-link" href="/learning-path/">详细分析 ' + icon("arrow", 15) + '</a></div>' + renderSkillRadar(values) + '<span class="data-note">能力分布为演示数据</span></section><section class="panel suggestions-panel"><div class="panel-heading"><div><span class="eyebrow">NEXT STEPS · 演示</span><h2>' + icon("sparkles", 19) + ' 提升建议</h2></div></div><ol>' + UPGRADE_SUGGESTIONS.map(function (suggestion, i) { return '<li><span>' + (i + 1) + '</span><p>' + suggestion + '</p></li>'; }).join("") + '</ol></section></div></div>';
}

export function renderDashboard() {
  return '<div class="workspace-toolbar"><button class="icon-button sidebar-toggle" id="sidebar-toggle" type="button" aria-label="打开学习导航" aria-expanded="false">' + icon("menu", 21) + '</button><div class="breadcrumb">学习中心 <span>/</span> Dashboard</div><span class="demo-chip">演示界面</span></div>' +
    dashboardIntro() +
    '<section class="metric-section"><div class="subsection-heading"><div><span class="eyebrow">LEARNING SUMMARY</span><h2>你的学习概览</h2></div><span class="sample-note">样例数据</span></div><div class="metric-grid">' + DEMO_METRICS.map(renderMetricCard).join("") + '</div></section>' +
    '<div class="dashboard-main-grid">' + todayTasks() + recommendationCard() + '</div>' +
    dashboardLearning();
}

function renderCourseContent(stage, activeIndex) {
  return stageContent(stage, activeIndex);
}

export function renderLearningPath(selectedIndex) {
  const selected = Math.max(0, Math.min(STAGES.length - 1, selectedIndex === undefined ? 1 : selectedIndex));
  const stage = STAGES[selected];
  return '<div class="workspace-toolbar"><button class="icon-button sidebar-toggle" id="sidebar-toggle" type="button" aria-label="打开学习导航" aria-expanded="false">' + icon("menu", 21) + '</button><div class="breadcrumb">学习中心 <span>/</span> 学习路线</div><span class="demo-chip">课程目录</span></div><section class="page-intro path-intro"><span class="eyebrow">YOUR AI LEARNING PATH</span><h1>AI 学习路线</h1><p>把 10 章课程整理为 6 个能力阶段，逐步完成从认知到应用的学习闭环。</p></section><div class="path-layout"><div class="path-level-column"><div class="level-heading"><h2>学习阶段</h2><span>6 LEVELS</span></div>' + renderLevelNav(selected) + '</div><div class="path-course-area" id="path-course-area">' + renderCourseContent(stage, 0) + '</div></div>';
}

function courseCard(course) {
  return '<article class="course-card" data-course-search="' + escapeHTML((course.title + " " + course.description + " " + course.stage).toLowerCase()) + '"><div class="course-card-top"><span class="course-number">' + String(course.id).padStart(2, "0") + '</span><span class="course-stage">' + course.stage + '</span></div><div class="course-symbol tone-' + (course.id % 2 ? "cyan" : "blue") + '">' + icon(course.id === 3 ? "message" : course.id === 10 ? "bot" : "book", 26) + '</div><h2>' + course.title + '</h2><p>' + course.description + '</p><div class="course-card-meta"><span>' + course.points + ' 个知识节点</span><a href="' + course.href + '">进入课程 ' + icon("arrow", 15) + '</a></div></article>';
}

export function renderCourses() {
  if (!new URLSearchParams(window.location.search).has("q")) {
    return '<iframe class="course-atlas-frame" title="可旋转的 AI 课程星海" src="/knowledge-stars/?embed=courses" loading="eager"></iframe>';
  }
  return '<section class="page-intro catalog-intro"><span class="eyebrow">COURSE CATALOG · 10 CHAPTERS</span><h1>我的课程</h1><p>从大模型基础、Transformer 与提示词工程，逐步学习 RAG、Agent 和应用实践。</p><div class="catalog-summary"><span><strong>10</strong> 章节</span><span><strong>57</strong> 知识节点</span><span><strong>41</strong> 动手任务</span></div></section><section class="course-catalog"><div class="catalog-toolbar"><div><h2>课程目录</h2><p>内容按项目中的课程章节整理</p></div><label class="course-search">' + icon("search", 19) + '<span class="sr-only">搜索课程</span><input id="course-search" type="search" placeholder="搜索课程…"></label></div><div class="course-grid" id="course-grid">' + COURSES.map(courseCard).join("") + '</div><p class="catalog-empty" id="catalog-empty" hidden>没有找到匹配的课程。</p></section>';
}

function projectCard(number, title, category, description, facts, href, iconName, tone) {
  return '<article class="project-card tone-' + tone + '"><div class="project-card-top"><span class="project-index">PROJECT ' + number + '</span><span class="project-category">' + category + '</span></div><span class="project-icon">' + icon(iconName, 27) + '</span><h2>' + title + '</h2><p>' + description + '</p><div class="project-facts">' + facts + '</div><a class="project-link" href="' + href + '">查看内容 ' + icon("arrow", 16) + '</a></article>';
}

export function renderProjects() {
  return '<section class="page-intro projects-intro"><span class="eyebrow">BUILD · TEST · EXPLAIN</span><h1>把 AI 知识做成项目</h1><p>从小型实践任务到交互实验，在真实操作里巩固课程中的关键概念。</p><div class="project-proof"><span>' + icon("check", 17) + ' 内容来自 AI Master 当前课程与实验</span><span>' + icon("check", 17) + ' 评测样本口径可查</span></div></section><section class="project-grid">' +
    projectCard("01", "动手实践任务", "实践工作台", "围绕课程知识点设计的 41 项操作任务，包含起步步骤、预期结果和检验方式。", "41 项任务 · 10 个章节", "/hands-on/", "code", "cyan") +
    projectCard("02", "交互式 AI 实验", "在线 Playground", "运行分词、注意力、RAG 等实验，观察输入变化如何影响中间结果。", "12 个实验 · 可直接体验", "/experiments/", "flask", "blue") +
    projectCard("03", "学习闭环演示", "讲解与复习", "从读课程、自己讲解到测验与错题复习，体验完整的学习流程。", "7 个通关模块 · 支持本地记录", "/learning-center/", "route", "purple") +
    projectCard("04", "评测证据墙", "方法与边界", "查看项目内部 21 例离线评测记录、计算口径与尚未采集的指标。", "准确率 90.5% · 内部小样本", "/ai-review/", "chart", "teal") +
    '</section><section class="project-integrity panel"><span class="integrity-icon">' + icon("note", 22) + '</span><div><h2>数据说明</h2><p>21 例评测记录属于项目内部小样本，不代表第三方评测或真实学习效果研究。新增样本和指标以可复核数据为准。</p></div><a href="/ai-review/" class="text-link">查看评测边界 ' + icon("arrow", 15) + '</a></section>';
}

export function renderPlayground() {
  return '<div class="playground-heading"><div class="playground-title-group"><span class="eyebrow">PROMPT ENGINEERING · INTERACTIVE DEMO</span><h1>Prompt Playground</h1><p>在这里试验你的 Prompt，实时查看 AI 输出示例，快速优化提示词。</p></div><div class="playground-controls"><label class="model-picker"><span class="sr-only">选择演示模型</span>' + icon("sparkles", 20) + '<select id="model-picker"><option>本地演示</option><option>DeepSeek（未连接）</option><option>GPT-4o（未连接）</option></select></label><button type="button" class="icon-button" id="playground-settings" aria-label="演示设置" aria-expanded="false">' + icon("settings", 21) + '</button><div class="settings-popover" id="settings-popover" hidden><strong>运行模式</strong><p>当前 Playground 使用本地演示输出，不会向模型发送 Prompt。</p><label><input type="checkbox" checked disabled> 显示演示提示</label></div></div></div><div class="playground-demo-notice"><span>' + icon("sparkles", 17) + ' 演示模式</span><p>运行按钮展示本地示例响应，不调用 AI 服务，也不代表真实模型输出。</p></div><div class="playground-layout"><section class="playground-panel prompt-panel"><div class="prompt-panel-heading"><div><span class="eyebrow">WRITE A PROMPT</span><h2>输入你的 Prompt</h2></div><label class="template-picker"><span class="sr-only">选择 Prompt 模板</span><select id="prompt-template"><option value="">Prompt 模板</option><option value="education">科普文章</option><option value="concept">概念解释</option><option value="project">项目方案</option></select></label></div><label class="sr-only" for="prompt-input">你的 Prompt</label><textarea id="prompt-input" maxlength="2000">' + escapeHTML(PLAYGROUND_INITIAL_PROMPT) + '</textarea><div class="prompt-count"><span id="prompt-count">0/2000</span></div><div class="prompt-actions"><button class="button button-primary run-button" id="run-prompt" type="button">' + icon("play", 19) + ' 运行</button><button class="button button-outline" id="clear-prompt" type="button">' + icon("close", 17) + ' 清空 Prompt</button><button class="button button-quiet" id="prompt-history" type="button">' + icon("clock", 17) + ' 历史记录</button></div><p class="prompt-status" id="prompt-status" role="status" aria-live="polite"></p></section><section class="playground-panel output-panel"><div class="output-toolbar"><div class="output-tabs" role="tablist" aria-label="输出格式"><button type="button" class="output-tab is-active" id="tab-markdown" role="tab" aria-selected="true" aria-controls="response-content">Markdown</button><button type="button" class="output-tab" id="tab-preview" role="tab" aria-selected="false" aria-controls="response-content">预览</button></div><button class="output-action" id="copy-output" type="button">' + icon("copy", 17) + ' 复制</button><button class="output-action" id="export-output" type="button">' + icon("download", 17) + ' 导出</button></div><div class="response-meta"><span class="response-dot"></span><span id="response-label">示例响应</span><span class="response-local">LOCAL DEMO</span></div><div class="response-content" id="response-content" role="tabpanel" aria-labelledby="tab-markdown" tabindex="0"></div></section></div><div class="history-dialog" id="history-dialog" hidden><div class="history-card" role="dialog" aria-modal="true" aria-labelledby="history-title"><div class="history-heading"><h2 id="history-title">最近使用的 Prompt</h2><button class="icon-button" id="close-history" aria-label="关闭历史记录">' + icon("close", 19) + '</button></div><p>记录只保存在此浏览器中。</p><div id="history-list" class="history-list"></div></div></div><section class="legacy-labs-link"><span class="legacy-labs-icon">' + icon("flask", 23) + '</span><div><strong>继续体验 AI 算法实验</strong><p>12 个交互实验仍保留在 AI Master 工坊中。</p></div><a class="button button-outline" href="/experiments/">进入实验工坊 ' + icon("arrow", 16) + '</a></section>';
}
