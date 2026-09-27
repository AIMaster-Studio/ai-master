import { ROUTES, STAGES } from "./data.js";

const ICONS = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h8"/>',
  brain: '<path d="M12 18V5"/><path d="M15.5 8a3.5 3.5 0 0 0-7 0 4 4 0 0 0-2 7.46A3.5 3.5 0 0 0 12 18a3.5 3.5 0 0 0 5.5-2.54A4 4 0 0 0 15.5 8Z"/><path d="M8 11h1m6-1h1M9 15h1m5-1h1"/>',
  code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-5 3 2-14"/>',
  flask: '<path d="M9 3h6m-5 0v6l-5.7 9.4A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.5-2.6L14 9V3"/><path d="M8 15h8"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h4a4 4 0 0 0 4-4V9m-4-3h-1a4 4 0 0 0-4 4v2"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8 11h8m-8 4h5"/>',
  wrench: '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3z"/>',
  workflow: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4a2 2 0 0 1 2 2v5.5M6.5 10v4a2 2 0 0 0 2 2H14"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4m-4 5h.01M16 12h.01M9 16h6M2 12h2m16 0h2"/>',
  cube: '<path d="m12 3 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8m-9 5v9"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  play: '<path d="m8 5 12 7-12 7z"/>',
  chart: '<path d="M4 19V5m0 14h17"/><path d="m7 15 4-4 3 2 6-7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.9a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
  checklist: '<path d="m9 11 2 2 4-4M9 18l2 2 4-4"/><path d="M5 4h14v17H5zM9 4V2h6v2"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-2-1-3-3-3-5-4 4-4 7-4 9a7 7 0 0 0 7 7Z"/><path d="M12 22a3 3 0 0 0 3-3c0-2-2-3-3-5-1 2-3 3-3 5a3 3 0 0 0 3 3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  graduation: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 3 9 3 12 0v-5m4-2v7"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6-.2.1a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.7l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6c.5-.3 1-.6 1.6-.7l.3-1.8h2.8l.3 1.8c.6.1 1.1.4 1.6.7l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.5Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 4 2 2 4-4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  note: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>'
};

export function icon(name, size) {
  const d = ICONS[name] || ICONS.sparkles;
  const px = size || 22;
  return '<svg class="icon" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}

export function escapeHTML(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function knowledgeLevelHref(stageId) {
  return "/knowledge/" + stageId + "-1/";
}

export function bindRouteAccordions(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-route-accordion-trigger]").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      const group = trigger.closest(".route-accordion-group");
      if (!group) return;
      const shouldExpand = trigger.getAttribute("aria-expanded") !== "true";
      group.querySelectorAll("[data-route-accordion-trigger]").forEach(function (item) {
        const expanded = item === trigger && shouldExpand;
        item.setAttribute("aria-expanded", String(expanded));
        const panel = document.getElementById(item.getAttribute("aria-controls"));
        if (panel) panel.hidden = !expanded;
        item.closest(".route-accordion-item")?.classList.toggle("is-expanded", expanded);
      });
    });
  });
}

function routeLink(item, active) {
  const current = item.key === active ? ' aria-current="page"' : "";
  return '<a class="top-link' + (item.key === active ? " is-active" : "") + '" href="' + item.href + '"' + current + '>' + item.label + '</a>';
}

export function renderHeader(active) {
  return '<header class="site-header"><div class="header-inner"><a class="site-brand" href="/" aria-label="AI Master 首页"><span class="brand-ai">AI</span><span class="brand-master">Master</span></a><button class="icon-button mobile-menu-button" id="mobile-menu-button" type="button" aria-label="打开导航菜单" aria-expanded="false" aria-controls="site-nav">' + icon("menu", 23) + '</button><nav class="site-nav" id="site-nav" aria-label="主导航">' + ROUTES.map(function (item) { return routeLink(item, active); }).join("") + '</nav><div class="header-actions"><button class="icon-button search-toggle" id="search-toggle" type="button" aria-label="搜索课程" aria-expanded="false">' + icon("search", 20) + '</button><span class="header-divider" aria-hidden="true"></span><a class="button button-primary button-login" href="/learning-center/">讲解通关</a></div><form class="site-search" id="site-search" role="search" hidden><label class="sr-only" for="site-search-input">搜索课程或知识点</label><input id="site-search-input" type="search" placeholder="搜索课程、知识点…"><button type="submit" aria-label="提交搜索">' + icon("arrow", 18) + '</button></form></div></header>';
}

const SIDEBAR_ITEMS = [
  { label: "学习中心", icon: "home", href: "/dashboard/", key: "dashboard" },
  { label: "学习路线", icon: "route", href: "/learning-path/", key: "learning-path" },
  { label: "我的课程", icon: "book", href: "/courses/", key: "courses" },
  { label: "项目实战", icon: "cube", href: "/projects/", key: "projects" },
  { label: "Playground", icon: "play", href: "/playground/", key: "playground" },
  { label: "学习社区", icon: "users", href: "/projects/#community", key: "community" }
];
const SIDEBAR_PERSONAL = [
  { label: "实际课程进度", icon: "chart", href: "/course-progress/" },
  { label: "学习计划", icon: "calendar", href: "/dashboard/#today-tasks" },
  { label: "收藏夹", icon: "star", href: "/learning-center/" },
  { label: "笔记", icon: "note", href: "/learning-center/" },
  { label: "我的项目", icon: "folder", href: "/projects/" },
  { label: "设置", icon: "settings", href: "/learning-center/" }
];

function sideItem(item, active) {
  const current = item.key === active ? ' aria-current="page"' : "";
  return '<a class="sidebar-link' + (item.key === active ? " is-active" : "") + '" href="' + item.href + '"' + current + '>' + icon(item.icon, 19) + '<span>' + item.label + '</span><span class="sidebar-chevron">›</span></a>';
}

export function renderSidebar(active) {
  return '<aside class="sidebar" id="site-sidebar" aria-label="学习中心导航"><a class="sidebar-brand" href="/dashboard/"><span class="brand-ai">AI</span><span><strong>学习平台</strong><small>AI MASTER</small></span></a><nav class="sidebar-menu" aria-label="学习导航">' +
    SIDEBAR_ITEMS.map(function (item) { return sideItem(item, active); }).join("") +
    '<details class="sidebar-more"><summary>更多工具</summary><div class="sidebar-secondary">' +
    SIDEBAR_PERSONAL.map(function (item) { return sideItem(item, active); }).join("") +
    '</div></details>' +
    '</nav><a class="sidebar-streak" href="/learning-path/"><span class="streak-copy"><strong>坚持学习</strong><small>让 AI 带你看见更大的世界</small></span><span class="streak-arrow">↗</span></a></aside>';
}

export function renderPageShell(content, active, options) {
  const cfg = options || {};
  if (cfg.fullscreen) {
    return renderHeader(active) + '<main class="course-atlas-shell">' + content + '</main><div class="drawer-scrim" id="drawer-scrim" hidden></div>';
  }
  return renderHeader(active) + (cfg.sidebar ? '<div class="workspace-shell">' + renderSidebar(active) + '<main class="workspace-main">' + content + '</main></div>' : '<main class="page-shell">' + content + '</main>') + '<footer class="site-footer"><a href="/" class="footer-brand">AI MASTER</a><span>学会 AI，要能亲自讲清楚。</span><nav aria-label="页脚导航"><a href="/courses/">课程目录</a><a href="/experiments/">算法实验</a><a href="/ai-review/">评测证据</a></nav></footer><div class="drawer-scrim" id="drawer-scrim" hidden></div>';
}

export function renderFeatureVisual(feature) {
  const visual = {
    steps: '<div class="mini-steps"><span>01</span><i></i><span>02</span><i></i><span>03</span><i></i><span>04</span></div><div class="mini-stairs"><b></b><b></b><b></b><b></b></div>',
    project: '<div class="mini-window"><span></span><span></span><span></span><div class="mini-code-lines"><i></i><i></i><i></i></div></div><div class="mini-cube">' + icon("cube", 34) + '</div>',
    mentor: '<div class="mini-robot">' + icon("bot", 46) + '</div><div class="mini-bubble">' + icon("message", 17) + ' 可以从这里开始…</div>',
    playground: '<div class="mini-editor"><span>Prompt</span><i></i><i></i><i></i><b>' + icon("play", 18) + '</b></div>',
    progress: '<div class="mini-donut"><span>75%</span></div><div class="mini-checks"><i>' + icon("check", 12) + '</i><i>' + icon("check", 12) + '</i><i>' + icon("check", 12) + '</i></div>',
    community: '<div class="mini-orbit"><i></i><i></i><i></i><i></i><b>' + icon("users", 30) + '</b></div>'
  };
  return '<div class="feature-art feature-art-' + feature.visual + '" aria-hidden="true">' + visual[feature.visual] + '</div>';
}

export function renderFeatureCard(feature) {
  return '<article class="feature-card tone-' + feature.tone + '"><div class="feature-heading"><span class="feature-icon">' + icon(feature.icon, 22) + '</span><span class="feature-corner" aria-hidden="true">↗</span></div><h3>' + feature.title + '</h3><p>' + feature.description + '</p>' + renderFeatureVisual(feature) + '<div class="feature-tags">' + feature.tags.map(function (tag) { return '<span>' + tag + '</span>'; }).join("") + '</div></article>';
}

export function renderStageCard(stage) {
  return '<a class="stage-card tone-' + stage.tone + '" href="/learning-path/?stage=' + stage.id + '"><span class="stage-number">' + String(stage.id).padStart(2, "0") + '</span><span class="stage-title">' + stage.title + '</span><span class="stage-description">' + stage.description + '</span><span class="stage-art">' + icon(stage.icon, 46) + '</span><span class="stage-bottom" aria-hidden="true"></span></a>';
}

export function renderMetricCard(metric) {
  return '<article class="metric-card tone-' + metric.tone + '"><div class="metric-top"><span class="metric-icon">' + icon(metric.icon, 22) + '</span><span class="sample-tag">演示</span></div><strong class="metric-value">' + metric.value + '<small>' + (metric.suffix || "") + '</small></strong><span class="metric-label">' + metric.label + '</span><div class="metric-track"><i style="--progress:' + metric.progress + '%"></i></div></article>';
}

export function renderProgressRow(item) {
  return '<div class="progress-row tone-' + item.tone + '"><span class="progress-icon">' + icon(item.icon, 21) + '</span><div class="progress-detail"><div class="progress-heading"><strong>' + item.label + ' <small class="sample-tag">演示</small></strong><span>' + item.value + '%</span></div><div class="progress-track" role="img" aria-label="' + item.label + '演示进度 ' + item.value + '%"><i style="--progress:' + item.value + '%"></i></div></div></div>';
}

export function renderLessonRow(lesson, index, activeIndex, stageId) {
  const selected = index === activeIndex;
  const rowClass = 'lesson-row lesson-active' + (selected ? ' selected' : '');
  const body = '<span class="lesson-state">' + icon(selected ? "play" : "book", 18) + '</span><span class="lesson-number">' + stageId + '.' + (index + 1) + '</span><strong class="lesson-title">' + lesson.title + '</strong><span class="lesson-time">' + lesson.minutes + ' 分钟</span><span class="lesson-status node-status-label" data-node-status-label>未开始</span>';
  const href = knowledgeLessonHref(stageId, index);
  return '<a class="' + rowClass + '" data-knowledge-node="' + stageId + '.' + (index + 1) + '" href="' + href + '" aria-label="进入知识点 ' + stageId + '.' + (index + 1) + '：' + lesson.title + '">' + body + '</a>';
}

export function knowledgeLessonHref(stageId, lessonIndex) {
  if (stageId === 4 && lessonIndex === 5) return "/chapter/4/#kp-6";
  return "/knowledge/" + stageId + "-" + (lessonIndex + 1) + "/";
}

export function renderLevelNav(selected, expandedStageId) {
  const expanded = arguments.length < 2 ? STAGES[selected]?.id : expandedStageId;
  return '<nav class="level-list" aria-label="选择学习阶段">' + STAGES.map(function (stage, index) {
    const current = index === selected;
    const isExpanded = stage.id === expanded;
    const state = '<span class="level-state">' + (current ? "●" : "·") + '</span>';
    const amount = '<span data-node-stage-progress="' + stage.id + '">0/' + stage.lessons.length + ' 已通关</span>';
    const lessonLinks = stage.lessons.map(function (title, lessonIndex) {
      return '<a class="level-lesson-link" data-knowledge-node="' + stage.id + '.' + (lessonIndex + 1) + '" href="' + knowledgeLessonHref(stage.id, lessonIndex) + '"><span class="level-lesson-number">' + stage.id + '.' + (lessonIndex + 1) + '</span><span class="level-lesson-title">' + escapeHTML(title) + '</span><span class="level-lesson-arrow" aria-hidden="true">›</span><span class="node-status-label" data-node-status-label>未开始</span></a>';
    }).join("");
    return '<div class="level-nav-group' + (isExpanded ? ' is-expanded' : '') + '"><button type="button" class="level-card tone-' + stage.tone + (current ? ' is-active' : '') + '" data-level-index="' + index + '"' + (current ? ' aria-current="step"' : '') + ' aria-expanded="' + isExpanded + '" aria-controls="level-lessons-' + stage.id + '"><span class="level-marker">' + icon(stage.icon, 22) + '</span><span class="level-copy"><small>LEVEL ' + String(stage.id).padStart(2, "0") + '</small><strong>' + stage.title + '</strong><span class="level-progress">' + amount + '</span></span>' + state + '<span class="level-chevron" aria-hidden="true">⌄</span></button><nav class="level-lesson-list" id="level-lessons-' + stage.id + '" aria-label="LEVEL ' + String(stage.id).padStart(2, "0") + ' 知识点"' + (isExpanded ? '' : ' hidden') + '>' + lessonLinks + '</nav></div>';
  }).join("") + '</nav>';
}

export function renderSkillRadar(values) {
  const labels = ["AI 基础认知", "Prompt Engineering", "AI 工具", "AI 工作流", "AI Agent", "AI 项目"];
  const cx = 150, cy = 132, radius = 88;
  function point(index, scale) {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return (cx + Math.cos(angle) * radius * scale).toFixed(1) + "," + (cy + Math.sin(angle) * radius * scale).toFixed(1);
  }
  const grids = [1, 0.75, 0.5, 0.25].map(function (scale) { return labels.map(function (_, i) { return point(i, scale); }).join(" "); }).map(function (points) { return '<polygon points="' + points + '"/>'; }).join("");
  const axes = labels.map(function (_, i) { const end = point(i, 1).split(","); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + end[0] + '" y2="' + end[1] + '"/>'; }).join("");
  const data = labels.map(function (_, i) { return point(i, (values[i] || 0) / 100); }).join(" ");
  const dots = labels.map(function (_, i) { return '<circle cx="' + point(i, (values[i] || 0) / 100).replace(",", '" cy="') + '" r="4"/>'; }).join("");
  const labelPos = [
    { x: 150, y: 17, anchor: "middle" },
    { x: 252, y: 62, anchor: "start" },
    { x: 252, y: 211, anchor: "start" },
    { x: 150, y: 253, anchor: "middle" },
    { x: 48, y: 211, anchor: "end" },
    { x: 48, y: 62, anchor: "end" }
  ];
  const text = labels.map(function (label, i) { return '<text x="' + labelPos[i].x + '" y="' + labelPos[i].y + '" text-anchor="' + labelPos[i].anchor + '">' + label + '<tspan x="' + labelPos[i].x + '" dy="16">' + (values[i] || 0) + '</tspan></text>'; }).join("");
  return '<svg class="skill-radar-svg" viewBox="0 0 300 270" role="img" aria-label="六项 AI 能力图谱：' + labels.map(function (label, i) { return label + " " + (values[i] || 0); }).join("，") + '"><g class="radar-grid">' + grids + axes + '</g><polygon class="radar-area" points="' + data + '"/><g class="radar-dots">' + dots + '</g><g class="radar-labels">' + text + '</g></svg>';
}

export function stageContent(stage, activeLesson) {
  const lessons = stage.lessons.map(function (title, index) {
    return { title: title, minutes: [19, 22, 22, 20, 25, 25][index % 6] };
  });
  return '<section class="path-course-panel"><header class="path-course-head"><div><span class="eyebrow">LEVEL ' + String(stage.id).padStart(2, "0") + '</span><h2>' + stage.title + '</h2><p>' + stage.description + '</p></div><div class="course-progress"><span>章节进度</span><strong data-node-stage-progress="' + stage.id + '">0/' + lessons.length + ' 已通关</strong><a href="/course-progress/">查看其他通关记录 →</a></div></header><div class="lesson-list">' + lessons.map(function (lesson, index) { return renderLessonRow(lesson, index, activeLesson, stage.id); }).join("") + '</div><div class="path-course-foot"><span class="data-note">节点通关后自动计入章节进度</span><a class="text-link" href="' + (stage.chapterIds[0] ? "/chapter/" + stage.chapterIds[0] + "/" : "/courses/") + '">打开对应课程 ' + icon("arrow", 16) + '</a></div></section>';
}
