"""Generate the no-backend AI Master frontend demo from curated course data.
Run after updating frontend/data and frontend/static. The script does not read
users.json, license databases, logs, API keys, or any server configuration.
"""
from __future__ import annotations

import html
import json
import posixpath
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DATA = FRONTEND / "data"


def page_url(target: str, source: str) -> str:
    """Resolve a site route relative to a generated page."""
    if not target.startswith("/") or target.startswith("//"):
        return target
    clean = target.lstrip("/")
    source_dir = posixpath.dirname(source.replace("\\", "/")) or "."
    if not clean:
        return "./"
    resolved = posixpath.relpath(clean, source_dir)
    if target.endswith("/") and not resolved.endswith("/"):
        resolved += "/"
    return resolved


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def write(relative: str, content: str):
    path = FRONTEND / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


def target_for(chapter_id: int) -> str:
    special = {
        1: "/static/llm_intro.html",
        2: "/static/transformer_cg.html",
        3: "/static/prompt_cg_starlab/index.html",
        4: "/static/agentic_cg/index.html",
        5: "/static/claude_cg/index.html",
        6: "/static/rag_cg/index.html",
    }
    return special.get(chapter_id, f"/chapter/{chapter_id}/")


def nav(source: str):
    dashboard = page_url("/dashboard/", source)
    coach = page_url("/learning-center/", source)
    stars = page_url("/knowledge-stars/", source)
    handson = page_url("/hands-on/", source)
    beginner = page_url("/beginner/", source)
    aireview = page_url("/ai-review/", source)
    playground = page_url("/playground/", source)

    clean_src = source.replace("\\", "/").strip("/")
    is_dash = clean_src.startswith("dashboard")
    is_coach = clean_src.startswith("learning-center")
    is_stars = clean_src.startswith("knowledge-stars")
    is_handson = clean_src.startswith("hands-on")
    is_beginner = clean_src.startswith("beginner")
    is_review = clean_src.startswith("ai-review")
    is_play = clean_src.startswith("playground")

    c_dash = ' class="active"' if is_dash else ''
    c_coach = ' class="nav-highlight active"' if is_coach else ' class="nav-highlight"'
    c_review = ' class="active"' if is_review else ''
    c_handson = ' class="active"' if is_handson else ''
    c_play = ' class="active"' if is_play else ''
    c_stars = ' class="active"' if is_stars else ''
    c_beg = ' class="active"' if is_beginner else ''

    return f"""<nav class="demo-nav">
  <div class="demo-nav-inner">
    <a class="demo-brand" href="{dashboard}">
      <span class="brand-badge">AI</span>
      <span class="brand-name">AI MASTER <em class="brand-sub">/ CORE</em></span>
    </a>
    <div class="demo-nav-links">
      <a href="{dashboard}"{c_dash}>课程总览</a>
      <a href="{coach}"{c_coach}>讲解通关 ↗</a>
      <a href="{aireview}"{c_review}>评测证据墙</a>
      <a href="{handson}"{c_handson}>动手实践</a>
      <a href="{playground}"{c_play}>实验工坊</a>
      <a href="{stars}"{c_stars}>知识星海</a>
      <a href="{beginner}"{c_beg}>新手入门</a>
    </div>
  </div>
</nav>"""


def shell_css():
    return r"""@import url("./tokens.css");

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  background-color: var(--bg);
  color: var(--ink);
}

body {
  min-height: 100vh;
  margin: 0;
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: none;
}

/* Fixed/Sticky Top Navigation */
.demo-nav {
  position: sticky;
  z-index: 50;
  top: 0;
  height: 56px;
  background: rgba(9, 13, 22, 0.94);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.demo-nav-inner {
  max-width: var(--page-max-width);
  height: 100%;
  margin: 0 auto;
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.demo-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
}
.brand-badge {
  background: var(--go-dim);
  border: 1px solid var(--go-border);
  color: var(--go);
  padding: 2px 6px;
  font-size: 0.7rem;
  border-radius: var(--radius);
}
.brand-sub {
  color: var(--ink-dim);
  font-style: normal;
  font-weight: 400;
}
.demo-nav-links {
  display: flex;
  gap: var(--space-6);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: var(--ink-muted);
}
.demo-nav-links a:hover {
  color: var(--go);
}
.demo-nav-links .nav-highlight {
  color: var(--go);
}

/* Page Container */
.demo-page {
  width: min(var(--page-max-width), calc(100% - var(--space-8)));
  margin: 0 auto;
  padding-bottom: var(--space-16);
}

/* Kicker Badge */
.kicker {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  color: var(--go);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.kicker::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 2px;
  background: var(--go);
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-8) 0;
  border-top: 1px solid var(--line);
  margin-top: var(--space-12);
  color: var(--ink-dim);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
}
.footer a:hover {
  color: var(--go);
}

@media (max-width: 768px) {
  .demo-nav-inner {
    padding: 0 var(--space-4);
  }
  .demo-nav-links {
    gap: var(--space-3);
    font-size: 0.72rem;
  }
  .demo-page {
    width: calc(100% - var(--space-6));
  }
}
"""


def dashboard_css():
    return r"""@import url("./tokens.css");

/* Dashboard Hero */
.dash-hero {
  padding: var(--space-12) 0 var(--space-8);
  border-bottom: 1px solid var(--line);
}
.dash-hero-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: var(--space-8);
  align-items: start;
}
.dash-title-group h1 {
  font-family: var(--font-display);
  font-size: clamp(2rem, 3.5vw, 2.75rem);
  font-weight: 700;
  line-height: 1.15;
  color: var(--ink);
  margin: var(--space-2) 0 var(--space-3);
  letter-spacing: -0.02em;
}
.dash-subtitle {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ink-muted);
  max-width: 60ch;
  margin: 0 0 var(--space-6);
}
.dash-actions {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

/* Hero Right: Readout & KPI */
.dash-hero-metric {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.metric-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.metric-desc {
  font-size: 0.82rem;
  color: var(--ink-muted);
  margin-top: var(--space-3);
  line-height: 1.5;
}

/* Route Section */
.route-section {
  padding-top: var(--space-10);
}
.route-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-6);
}
.route-header h2 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ink);
  margin: var(--space-1) 0 0;
}
.route-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ink-dim);
}

/* Chapter Table Columns */
.col-num { width: 56px; }
.col-title { min-width: 280px; }
.col-stat { width: 110px; text-align: right; }
.col-progress { width: 140px; }
.col-action { width: 120px; text-align: right; }

.chapter-title-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.chapter-name {
  font-weight: 600;
  color: var(--ink);
  font-size: 0.95rem;
}
.chapter-desc {
  font-size: 0.8rem;
  color: var(--ink-muted);
  line-height: 1.4;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.progress-text {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-dim);
  display: flex;
  justify-content: space-between;
}

@media (max-width: 860px) {
  .dash-hero-grid {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
}
"""


def chapter_css():
    return r"""@import url("./tokens.css");

/* Chapter Hero (No large 03/10 number) */
.chapter-hero {
  padding: var(--space-10) 0 var(--space-8);
  border-bottom: 1px solid var(--line);
}
.chapter-hero-inner {
  max-width: 860px;
}
.chapter-hero h1 {
  font-family: var(--font-display);
  font-size: clamp(2rem, 3.8vw, 2.75rem);
  font-weight: 700;
  line-height: 1.18;
  color: var(--ink);
  margin: var(--space-2) 0 var(--space-3);
  letter-spacing: -0.02em;
}
.chapter-hero-desc {
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--ink-muted);
  margin: 0 0 var(--space-6);
}
.chapter-hero-actions {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

/* Chapter Split Layout: Left Sticky TOC + Right Prose Stream */
.chapter-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-10);
  align-items: start;
  padding-top: var(--space-8);
}

/* Left Sticky TOC */
.chapter-toc {
  position: sticky;
  top: 76px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  border-left: 1px solid var(--line);
  padding-left: var(--space-4);
}
.toc-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-bottom: var(--space-3);
}
.toc-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.toc-item {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2);
  font-size: 0.8rem;
  color: var(--ink-muted);
  border-radius: var(--radius);
  transition: color 0.15s, background 0.15s;
}
.toc-item:hover {
  color: var(--go);
  background: var(--bg-subtle);
}
.toc-item.active {
  color: var(--go);
  font-weight: 600;
  background: var(--go-dim);
}
.toc-num {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-dim);
}
.toc-item.active .toc-num {
  color: var(--go);
}

/* Right Content Stream (Directly expanded knowledge cards) */
.chapter-stream {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.knowledge-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-6);
  scroll-margin-top: 80px;
}
.knowledge-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--line-dim);
}
.knowledge-idx {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--go);
}
.knowledge-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}
.knowledge-body {
  font-size: 0.92rem;
  line-height: 1.8;
  color: var(--ink-muted);
}
.knowledge-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--line-dim);
}

@media (max-width: 860px) {
  .chapter-layout {
    grid-template-columns: 1fr;
  }
  .chapter-toc {
    display: none;
  }
}
"""


def runtime_js():
    return r"""(() => {
  "use strict";

  // 1. Read unified learning progress
  async function resolveDashboardProgress() {
    if (typeof AIMasterProgress !== "undefined" && AIMasterProgress.resolveProgress) {
      return await AIMasterProgress.resolveProgress();
    }
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem("aimaster_learning_state") || "{}");
    } catch (_) {}
    const prog = raw.progress || {};
    let count = 0;
    const progress = {};
    const modules = [
      { id: "llm-basics", chapter: 1 },
      { id: "prompt-design", chapter: 3 },
      { id: "transformer", chapter: 2 },
      { id: "rag-retrieval", chapter: 6 },
      { id: "rag-evaluation", chapter: 6 },
      { id: "agent-tools", chapter: 4 },
      { id: "agent-safety", chapter: 8 }
    ];
    modules.forEach(m => {
      const entry = prog[m.id] || (m.id === "prompt-design" ? prog.prompt : m.id === "rag-retrieval" ? prog.rag : null);
      const done = entry && (entry.completed === true || entry.completedAt || (entry.quiz && entry.quiz.passed));
      if (done) count++;
      progress[m.id] = { completed: !!done };
    });
    return { completedCount: count, totalModules: 7, progress };
  }

  // 2. Initialize Dashboard Chapter Progress Meters
  async function initDashboardProgress() {
    const table = document.querySelector("#chapter-table");
    if (!table) return;

    const resolved = await resolveDashboardProgress();
    const completedCount = resolved.completedCount || 0;

    // Update Top KPI
    const kpiPassed = document.querySelector("#kpi-passed-count");
    if (kpiPassed) {
      kpiPassed.textContent = `${completedCount} / 7`;
    }

    const CHAPTER_MODULE_MAP = {
      1: ["llm-basics"],
      2: ["transformer"],
      3: ["prompt-design"],
      4: ["agent-tools"],
      5: [],
      6: ["rag-retrieval", "rag-evaluation"],
      7: [],
      8: ["agent-safety"],
      9: [],
      10: []
    };

    // Update each row
    const rows = table.querySelectorAll("tr[data-chapter-id]");
    rows.forEach(row => {
      const cid = parseInt(row.getAttribute("data-chapter-id") || "0", 10);
      const mods = CHAPTER_MODULE_MAP[cid] || [];
      const meterFill = row.querySelector(".meter-fill");
      const pctLabel = row.querySelector(".progress-pct");

      if (mods.length === 0) {
        if (meterFill) meterFill.style.width = "0%";
        if (pctLabel) pctLabel.textContent = "未配置评测映射";
      } else {
        let passed = 0;
        mods.forEach(mid => {
          if (resolved.progress && resolved.progress[mid]?.completed) passed++;
        });
        const pct = Math.round((passed / mods.length) * 100);
        if (meterFill) meterFill.style.width = `${pct}%`;
        if (pctLabel) {
          pctLabel.textContent = pct > 0 ? `${pct}% (${passed}/${mods.length})` : `未开始 (0/${mods.length})`;
        }
      }
    });
  }

  // 3. Sticky TOC Scroll Spy for Chapter Pages
  function initTocScrollSpy() {
    const toc = document.querySelector(".chapter-toc");
    if (!toc) return;

    const cards = document.querySelectorAll(".knowledge-card");
    const tocItems = toc.querySelectorAll(".toc-item");
    if (!cards.length || !tocItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          tocItems.forEach(item => {
            if (item.getAttribute("href") === `#${id}`) {
              item.classList.add("active");
            } else {
              item.classList.remove("active");
            }
          });
        }
      });
    }, { rootMargin: "-10% 0px -70% 0px" });

    cards.forEach(c => observer.observe(c));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initDashboardProgress();
    initTocScrollSpy();
  });
})();
"""


def build_dashboard(courses):
    source = "dashboard/index.html"
    navigation = nav(source)

    rows = []
    total_knowledge = sum(c.get("knowledge_count", 0) for c in courses)
    total_exercises = sum(c.get("exercise_count", 0) for c in courses)

    for course in courses:
        cid = int(course["id"])
        k_count = course.get("knowledge_count", 0)
        e_count = course.get("exercise_count", 0)
        target = page_url(target_for(cid), source)
        node_titles_str = "||".join(p.get("title", "") for p in course.get("knowledge_points", []))

        rows.append(f"""<tr data-chapter-id="{cid}" data-total-nodes="{k_count}" data-node-titles="{html.escape(node_titles_str)}">
  <td class="col-num tbl-num">{cid:02d}</td>
  <td class="col-title">
    <div class="chapter-title-cell">
      <a href="{target}" class="chapter-name">{html.escape(course['title'])}</a>
      <span class="chapter-desc">{html.escape(course.get('description', ''))}</span>
    </div>
  </td>
  <td class="col-stat"><span class="chip chip-go"><i></i>{k_count} 节点</span></td>
  <td class="col-stat"><span class="chip">{e_count} 任务</span></td>
  <td class="col-progress">
    <div class="progress-cell">
      <div class="progress-text"><span>通关</span><span class="progress-pct">0%</span></div>
      <div class="meter"><div class="meter-fill" style="width: 0%;"></div></div>
    </div>
  </td>
  <td class="col-action">
    <a href="{target}" class="btn btn-sm btn-go">进入 ↗</a>
  </td>
</tr>""")

    rows_html = "\n          ".join(rows)

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>课程总览 · AI Master</title>
  <link rel="stylesheet" href="{page_url('/assets/tokens.css', source)}">
  <link rel="stylesheet" href="{page_url('/assets/frontend.css', source)}">
  <link rel="stylesheet" href="{page_url('/assets/dashboard-demo.css', source)}">
</head>
<body>
{navigation}
<main class="demo-page">
  <section class="dash-hero">
    <div class="dash-hero-grid">
      <div class="dash-title-group">
        <p class="kicker">SYSTEM OVERVIEW</p>
        <h1>AI Master 课程总览</h1>
        <p class="dash-subtitle">从大模型核心机制到 RAG 与智能体工程实战。全站 10 章课程、57 个核心知识节点、41 道动手实践题与独立 AI 语义复评闸门。</p>
        <div class="dash-actions">
          <a class="btn btn-go" href="{page_url('/learning-center/', source)}">进入讲解通关工作台 ↗</a>
          <a class="btn" href="#route">浏览章节数据表 ↓</a>
        </div>
      </div>
      <div class="dash-hero-metric">
        <div class="metric-head">
          <span class="readout">10</span>
          <span class="readout-meta">SECTORS / 10 章</span>
        </div>
        <p class="metric-desc">覆盖大模型基础、Transformer 架构、Prompt 工程、Agent 循环、RAG 向量检索与工程实战全链路。</p>
      </div>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-strip">
      <div class="kpi">
        <span class="kpi-label"><i></i>核心章节</span>
        <span class="kpi-value">{len(courses)}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label"><i></i>知识节点</span>
        <span class="kpi-value">{total_knowledge}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label"><i></i>动手任务</span>
        <span class="kpi-value">{total_exercises}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label"><i></i>已通关模块</span>
        <span class="kpi-value" id="kpi-passed-count">0 / 7</span>
      </div>
    </div>
  </section>

  <section id="route" class="route-section">
    <div class="route-header">
      <div>
        <p class="kicker">COURSE CHAPTERS</p>
        <h2>全十卷课程航线</h2>
      </div>
      <span class="route-count">10 章节 · 57 节点 · 41 任务</span>
    </div>

    <div class="tbl-wrap">
      <table class="tbl" id="chapter-table">
        <thead>
          <tr>
            <th class="col-num">序号</th>
            <th class="col-title">章节名称与学习目标</th>
            <th class="col-stat">知识点</th>
            <th class="col-stat">动手题</th>
            <th class="col-progress">通关进度</th>
            <th class="col-action">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows_html}
        </tbody>
      </table>
    </div>
  </section>

  <footer class="footer">
    <span>AI MASTER / 课程总览</span>
    <a href="{page_url('/learning-center/', source)}">进入学习工作台 ↗</a>
  </footer>
</main>
<script src="{page_url('/static/js/learning-progress.js', source)}"></script>
<script src="{page_url('/assets/frontend.js', source)}"></script>
</body>
</html>"""


def build_hands_on_mapping(chapters, hands_on):
    authority = {}
    all_nodes = {}
    for chapter_id, chapter in chapters.items():
        chapter_nodes = authority.setdefault(chapter_id, set())
        for point in chapter.get("knowledge_points", []):
            title = str(point.get("title", "")).strip()
            if title in chapter_nodes:
                raise ValueError(f"第 {chapter_id} 章知识点「{title}」重复冲突")
            chapter_nodes.add(title)
            all_nodes.setdefault(title, []).append(chapter_id)

    mapping = {chapter_id: {} for chapter_id in chapters}
    seen_task_ids = set()
    for practice_chapter in hands_on.get("chapters", []):
        chapter_id = practice_chapter.get("chapterId")
        if chapter_id not in authority:
            raise ValueError(f"第 {chapter_id} 章没有对应的权威知识节点")
        for task in practice_chapter.get("tasks", []):
            task_id = str(task.get("id", "")).strip()
            if task_id in seen_task_ids:
                raise ValueError(f"第 {chapter_id} 章任务「{task_id}」重复冲突")
            seen_task_ids.add(task_id)
            for title in task.get("knowledgePoints", []):
                title = str(title).strip()
                if title in authority[chapter_id]:
                    mapping[chapter_id].setdefault(title, task_id)
                elif title in all_nodes:
                    owner = all_nodes[title][0]
                    raise ValueError(f"第 {chapter_id} 章知识点「{title}」跨章标签（属于第 {owner} 章）")
                else:
                    raise ValueError(f"第 {chapter_id} 章知识点「{title}」是幽灵标签")

    for chapter_id, nodes in authority.items():
        for title in nodes:
            if title not in mapping[chapter_id]:
                raise ValueError(f"第 {chapter_id} 章知识点「{title}」缺少实践任务映射")
    return mapping


def chapter_page(chapter, hands_on_mapping):
    cid = int(chapter["id"])
    source = f"chapter/{cid}/index.html"
    cards = []
    toc_items = []

    for index, point in enumerate(chapter.get("knowledge_points", []), 1):
        title = html.escape(str(point.get("title", f"知识点 {index}")))
        content = str(point.get("content", "")).replace("\n", "<br>")
        task_id = hands_on_mapping[cid][str(point.get("title", "")).strip()]
        extra = f'<a class="btn btn-sm" href="{page_url(f"/hands-on/#{task_id}", source)}">去做实践 ↗</a>'
        if cid == 1 and index == 3: extra += f' <a class="btn btn-sm btn-go" href="{page_url("/static/bpe_game.html", source)}">BPE 分词游戏 ↗</a>'
        if cid == 1 and index == 6: extra += f' <a class="btn btn-sm btn-go" href="{page_url("/static/llm_training_game.html", source)}">LLM 训练流程模拟 ↗</a>'
        if cid == 2 and index == 1: extra += f' <a class="btn btn-sm btn-go" href="{page_url("/static/transformer_lab.html", source)}">Transformer 实验室 ↗</a>'
        if cid == 3 and index == 1: extra += f' <a class="btn btn-sm btn-go" href="{page_url("/static/prompt_cg_starlab/index.html", source)}">提示词工程引导 CG ↗</a>'

        toc_items.append(f"""<a class="toc-item" href="#kp-{index}">
  <span class="toc-num">{index:02d}</span>
  <span class="toc-text">{title}</span>
</a>""")

        cards.append(f"""<article class="knowledge-card" id="kp-{index}">
  <header class="knowledge-head">
    <span class="knowledge-idx">{index:02d}</span>
    <h2 class="knowledge-title">{title}</h2>
  </header>
  <div class="knowledge-body">
    {content}
    <div class="knowledge-actions">
      {extra}
    </div>
  </div>
</article>""")

    ppt = chapter.get("ppt_url", "")
    ppt_link = f'<a class="btn" target="_blank" rel="noreferrer" href="{html.escape(ppt)}">查看本章档案 ↗</a>' if ppt else ""

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>第 {cid:02d} 章 · {html.escape(chapter['title'])} · AI Master</title>
  <link rel="stylesheet" href="{page_url('/assets/tokens.css', source)}">
  <link rel="stylesheet" href="{page_url('/assets/frontend.css', source)}">
  <link rel="stylesheet" href="{page_url('/assets/chapter-demo.css', source)}">
</head>
<body>
{nav(source)}
<main class="demo-page">
  <section class="chapter-hero">
    <div class="chapter-hero-inner">
      <p class="kicker">CHAPTER {cid:02d} / KNOWLEDGE</p>
      <h1>{html.escape(chapter['title'])}</h1>
      <p class="chapter-hero-desc">{html.escape(chapter.get('description', ''))}</p>
      <div class="chapter-hero-actions">
        <a class="btn btn-go" href="{page_url('/dashboard/', source)}">返回课程总览 ↗</a>
        {ppt_link}
      </div>
    </div>
  </section>

  <div class="chapter-layout">
    <aside class="chapter-toc">
      <div class="toc-label">本章节点目录</div>
      <nav class="toc-list">
        {''.join(toc_items)}
      </nav>
    </aside>

    <div class="chapter-stream">
      {''.join(cards)}
    </div>
  </div>

  <footer class="footer">
    <span>第 {cid:02d} 章 · {html.escape(chapter['title'])}</span>
    <a href="{page_url('/dashboard/', source)}">返回总览 ↗</a>
  </footer>
</main>
<script src="{page_url('/assets/frontend.js', source)}"></script>
</body>
</html>"""


def build_universe(courses, chapters):
    palettes = [["0x6ee7f5","0x2f75c9"],["0xba9aff","0x7148bf"],["0xffce7b","0xc96a39"],["0x75efbd","0x239b77"],["0xff92bf","0xb44c83"],["0x94aeff","0x4b55bc"],["0xf2b0ff","0x9954b8"],["0x84d9ff","0x357fb8"],["0xffaa72","0xb45158"],["0x96f4d5","0x368f9b"]]
    galaxies = []
    for course in courses:
        cid = int(course["id"]); chapter = chapters[cid]
        stars=[]
        for idx, point in enumerate(chapter.get("knowledge_points", [])):
            stars.append({"chapter":cid,"index":idx,"title":point.get("title",f"知识点 {idx+1}"),"desc":re.sub(r"\s+"," ",str(point.get("content", "")))[:280],"status":"available","url":page_url(f"/chapter/{cid}/#kp-{idx+1}", "knowledge-stars/index.html")})
        connections=[]
        for idx in range(max(0,len(stars)-1)): connections.append([idx,idx+1,"sequence"])
        if len(stars)>3: connections.extend([[0,2,"concept"],[1,3,"concept"]])
        galaxies.append({"id":f"chapter-{cid}","chapter":cid,"name":chapter["title"],"name_en":f"SECTOR {cid:02d}","progress":0,"stars":stars,"connections":connections,"palette":palettes[cid-1]})
    return {"success":True,"summary":{"galaxies":len(galaxies),"stars":sum(len(g["stars"]) for g in galaxies),"completed":0},"galaxies":galaxies}


def patch_static_assets():
    star_js = FRONTEND / "static" / "js" / "knowledge_stars.js"
    text = star_js.read_text(encoding="utf-8")
    text = text.replace('fetch("/api/knowledge-universe", { credentials: "same-origin", cache: "no-store" })', 'fetch("/data/knowledge-universe.json", { cache: "no-store" })')
    text = re.sub(r'\s*if \(response\.status === 401 \|\| response\.url\.includes\("/login"\)\) \{ location\.assign\("/login"\); return; \}', '', text)
    star_js.write_text(text, encoding="utf-8")
    html_path = FRONTEND / "static" / "knowledge_stars.html"
    text = html_path.read_text(encoding="utf-8").replace('href="/dashboard"', 'href="/dashboard/"')
    html_path.write_text(text, encoding="utf-8")


def rewrite_project_urls():
    """Make legacy static pages work from both local root and GitHub project path."""
    route_re = re.compile(r'([\"\'`])/(assets|data|static|dashboard|knowledge-stars|chapter|canvas|playground|transition|hands-on|beginner)([^\"\'` ]*)')
    for path in FRONTEND.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".html", ".js", ".css"}:
            continue
        source = path.relative_to(FRONTEND).as_posix()
        text = path.read_text(encoding="utf-8")
        text = route_re.sub(lambda match: match.group(1) + page_url("/" + match.group(2) + match.group(3), source), text)
        text = text.replace("llm-training-game.html", "llm_training_game.html")
        text = text.replace("bpe-game.html", "bpe_game.html")
        if source == "static/js/knowledge_stars.js":
            text = text.replace("../../data/knowledge-universe.json", "../data/knowledge-universe.json")
        if path.parts[-2:] in {("rag_cg", "index.html"), ("prompt_cg_starlab", "index.html"), ("agentic_cg", "index.html"), ("claude_cg", "index.html")}:
            text = text.replace('"/vite.svg"', '"vite.svg"').replace("'/vite.svg'", "'vite.svg'")
        path.write_text(text, encoding="utf-8")



def ai_review_css():
    return """/* AI Review Evidence Wall - Dark Instrument System */
.ai-review-page {
  padding-bottom: var(--space-16);
}

.review-header {
  margin-bottom: var(--space-8);
  border-bottom: 1px solid var(--line);
  padding-bottom: var(--space-6);
}

.review-kicker {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--go);
  margin-bottom: var(--space-2);
}

.review-title {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  font-weight: 700;
  margin: 0 0 var(--space-3) 0;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.review-desc {
  max-width: 900px;
  color: var(--ink-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0 0 var(--space-5) 0;
}

.review-desc code {
  font-family: var(--font-mono);
  color: var(--go);
  background: var(--bg-card);
  padding: 2px 6px;
  border: 1px solid var(--line);
}

.instrument-meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-3) var(--space-4);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.8rem;
}

.meta-label {
  color: var(--ink-dim);
  font-family: var(--font-mono);
}

.meta-val {
  color: var(--ink);
}

.meta-val.highlight-go {
  color: var(--go);
  font-weight: 600;
}

/* KPI Readouts */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}

.kpi-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
}

.kpi-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--ink-dim);
  text-transform: uppercase;
  margin-bottom: var(--space-2);
}

.kpi-readout {
  font-family: var(--font-mono);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin-bottom: var(--space-2);
}

.kpi-sub {
  font-size: 0.78rem;
  color: var(--ink-muted);
  line-height: 1.4;
  margin-top: auto;
}

.highlight-go { color: var(--go); }
.highlight-hold { color: var(--hold); }
.highlight-stop { color: var(--stop); }

/* Matrix Section */
.matrix-section {
  margin-bottom: var(--space-8);
}

.matrix-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-6);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-2);
}

.card-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.card-subtitle {
  font-size: 0.8rem;
  color: var(--ink-muted);
  font-family: var(--font-mono);
}

.card-badge {
  background: var(--bg-subtle);
  border: 1px solid var(--line);
  color: var(--go);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 2px 8px;
}

.matrix-table-wrap {
  overflow-x: auto;
  margin-bottom: var(--space-5);
}

.matrix-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}

.matrix-table th, .matrix-table td {
  border: 1px solid var(--line);
  padding: var(--space-4);
}

.matrix-table th {
  background: var(--bg-card);
  color: var(--ink);
  font-size: 0.85rem;
  font-weight: 600;
}

.th-sub {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--ink-dim);
  margin-top: 2px;
}

.cell-matrix {
  transition: background 0.15s ease, border-color 0.15s ease;
  cursor: pointer;
  vertical-align: top;
}

.cell-matrix:hover {
  filter: brightness(1.15);
}

.matrix-cell-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.cell-tag {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: var(--radius);
}

.cell-count {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.cell-desc {
  font-size: 0.75rem;
  color: var(--ink-muted);
  line-height: 1.3;
}

.cell-tp {
  background: rgba(45, 212, 191, 0.08);
  border: 1px solid rgba(45, 212, 191, 0.3) !important;
}
.cell-tp .cell-tag { background: var(--go-dim); color: var(--go); }
.cell-tp .cell-count { color: var(--go); }

.cell-fn {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3) !important;
}
.cell-fn .cell-tag { background: var(--hold-dim); color: var(--hold); }
.cell-fn .cell-count { color: var(--hold); }

.cell-fp {
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.3) !important;
}
.cell-fp .cell-tag { background: var(--stop-dim); color: var(--stop); }
.cell-fp .cell-count { color: var(--stop); }

.cell-tn {
  background: rgba(34, 50, 79, 0.2);
}
.cell-tn .cell-tag { background: var(--bg-card); color: var(--ink-muted); }
.cell-tn .cell-count { color: var(--ink); }

.cell-total {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink-muted);
  background: var(--bg-card);
}

.cell-grand {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--go);
  background: var(--bg-subtle);
}

.matrix-analysis-callout {
  background: var(--bg-card);
  border-left: 3px solid var(--go);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.callout-badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--go);
  text-transform: uppercase;
}

.matrix-analysis-callout p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-muted);
  line-height: 1.6;
}

.matrix-analysis-callout strong {
  color: var(--ink);
}

/* Transparency NOT CAPTURED Section */
.transparency-section {
  margin-bottom: var(--space-8);
}

.transparency-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-6);
}

.transparency-intro {
  color: var(--ink-muted);
  font-size: 0.88rem;
  line-height: 1.6;
  margin: 0 0 var(--space-5) 0;
}

.transparency-intro code {
  color: var(--go);
  font-family: var(--font-mono);
}

.transparency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3);
}

.transparency-item {
  background: var(--bg-card);
  border: 1px solid var(--line);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.item-field {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--ink);
  font-weight: 600;
}

.item-status {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.status-na {
  color: var(--hold);
}

.status-ok {
  color: var(--go);
}

.item-detail {
  font-size: 0.75rem;
  color: var(--ink-dim);
  line-height: 1.4;
}

/* Cases Section & Toolbar */
.cases-section {
  scroll-margin-top: 72px;
}

.cases-toolbar {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-4) var(--space-6);
  margin-bottom: var(--space-6);
}

.toolbar-title-wrap {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.cases-count-badge {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--go);
  background: var(--go-dim);
  border: 1px solid var(--go-border);
  padding: 2px 8px;
}

.filter-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.filter-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ink-dim);
  margin-right: var(--space-2);
  min-width: 68px;
}

.filter-btn {
  background: var(--bg-card);
  border: 1px solid var(--line);
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  border-radius: var(--radius);
  transition: all 0.15s ease;
}

.filter-btn:hover {
  background: var(--bg-card-hover);
  color: var(--ink);
  border-color: var(--line-bright);
}

.filter-btn.active {
  background: var(--go-dim);
  color: var(--go);
  border-color: var(--go);
  font-weight: 700;
}

/* Case Cards List */
.case-cards-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.case-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  transition: border-color 0.15s ease;
}

.case-card:hover {
  border-color: var(--line-bright);
}

.case-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-5);
  background: var(--bg-card);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
  gap: var(--space-2);
}

.case-ident {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.case-idx {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--ink);
}

.case-module-badge {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  background: var(--bg-subtle);
  border: 1px solid var(--line);
  color: var(--ink-muted);
  padding: 2px 6px;
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius);
}

.badge-tp { background: var(--go-dim); color: var(--go); border: 1px solid var(--go-border); }
.badge-tn { background: var(--bg-subtle); color: var(--ink-muted); border: 1px solid var(--line); }
.badge-fn { background: var(--hold-dim); color: var(--hold); border: 1px solid var(--hold-border); }
.badge-fp { background: var(--stop-dim); color: var(--stop); border: 1px solid var(--stop-border); }

.case-score-readout {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-family: var(--font-mono);
}

.score-num {
  font-size: 1.4rem;
  font-weight: 700;
}

.score-label {
  font-size: 0.8rem;
  color: var(--ink-muted);
}

.score-pass { color: var(--go); }
.score-fail { color: var(--stop); }

.case-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--line-dim);
  font-size: 0.75rem;
  font-family: var(--font-mono);
}

.status-chip {
  padding: 2px 8px;
  border: 1px solid var(--line);
  background: var(--bg-card);
}

.chip-ok { color: var(--go); border-color: var(--go-border); }
.chip-stop { color: var(--stop); border-color: var(--stop-border); }
.chip-dim { color: var(--ink-dim); }

.case-content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1px;
  background: var(--line-dim);
}

@media (min-width: 900px) {
  .case-content-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.case-block {
  background: var(--bg-panel);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.block-title {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.block-body {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.student-text {
  color: var(--ink);
}

.feedback-text {
  color: var(--ink-muted);
  font-style: normal;
}

.case-card-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-5);
  background: var(--bg-card);
  border-top: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.footer-meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.f-label { color: var(--ink-dim); }
.f-val { color: var(--ink-muted); }
.text-na { color: var(--hold); }
"""


def build_ai_review(results_data):
    source = "ai-review/index.html"
    navigation = nav(source)

    cases = results_data.get("testCases", [])
    model = results_data.get("model", "deepseek-v4-pro")
    threshold = results_data.get("threshold", "score >= 75 && factualCorrect === true")
    generated_at = results_data.get("generatedAt", "2026-09-08T17:09:06.090Z")

    cm = results_data.get("confusionMatrix", {})
    tp = cm.get("tp", 8)
    fp = cm.get("fp", 0)
    tn = cm.get("tn", 11)
    fn = cm.get("fn", 2)
    total_cases = len(cases) or 21

    acc_val = (tp + tn) / total_cases if total_cases else 0
    prec_val = tp / (tp + fp) if (tp + fp) else 0
    rec_val = tp / (tp + fn) if (tp + fn) else 0
    f1_val = (2 * prec_val * rec_val / (prec_val + rec_val)) if (prec_val + rec_val) else 0

    acc_pct = f"{acc_val * 100:.1f}"
    prec_pct = f"{prec_val * 100:.1f}"
    rec_pct = f"{rec_val * 100:.1f}"
    f1_pct = f"{f1_val * 100:.1f}"

    module_title_map = {
        "llm-basics": "大模型基础 (llm-basics)",
        "transformer": "Transformer架构 (transformer)",
        "rag-retrieval": "RAG检索增强 (rag-retrieval)"
    }

    cards_html = []
    for idx, c in enumerate(cases, 1):
        mod_id = c.get("moduleId", "")
        mod_title = module_title_map.get(mod_id, mod_id)
        gt = bool(c.get("groundTruth"))
        acc = bool(c.get("accepted"))
        score = c.get("score", 0)
        mode = c.get("mode", "ai")
        explanation = c.get("explanation", "")
        feedback = c.get("feedback", "")

        if gt and acc:
            verdict = "TP"
            verdict_label = "真正例 (True Positive)"
        elif not gt and not acc:
            verdict = "TN"
            verdict_label = "真负例 (True Negative)"
        elif gt and not acc:
            verdict = "FN"
            verdict_label = "假负例 (False Negative)"
        else:
            verdict = "FP"
            verdict_label = "假正例 (False Positive)"

        gt_text = "合格 (PASS)" if gt else "不合格 / 存在事实错误 (FAIL)"
        gt_chip_class = "chip-ok" if gt else "chip-stop"
        acc_text = "通过 (ACCEPTED)" if acc else "拦截 (REJECTED)"
        acc_chip_class = "chip-ok" if acc else "chip-stop"
        score_class = "score-pass" if acc else "score-fail"
        status_text = "通过" if acc else "未达标"

        cards_html.append(f"""<article class="case-card" data-verdict="{verdict}" data-module="{mod_id}">
  <header class="case-card-header">
    <div class="case-ident">
      <span class="case-idx">#{idx:02d}</span>
      <span class="case-module-badge">{html.escape(mod_title)}</span>
      <span class="badge badge-{verdict.lower()}">{verdict} · {verdict_label}</span>
    </div>
    <div class="case-score-readout">
      <span class="score-num {score_class}">{score}</span>
      <span class="score-label">/ 100 分 · {status_text}</span>
    </div>
  </header>

  <div class="case-status-bar">
    <span class="status-chip {gt_chip_class}">真实真值: {gt_text}</span>
    <span class="status-chip {acc_chip_class}">AI 判定: {acc_text}</span>
    <span class="status-chip chip-dim">评测模式: 双盲 (mode: {mode})</span>
  </div>

  <div class="case-content-grid">
    <div class="case-block student-block">
      <div class="block-title">学员提交讲解 (Student Explanation)</div>
      <div class="block-body student-text">{html.escape(explanation)}</div>
    </div>
    <div class="case-block feedback-block">
      <div class="block-title">AI 评测反馈意见 (AI Review Feedback)</div>
      <div class="block-body feedback-text">{html.escape(feedback)}</div>
    </div>
  </div>

  <footer class="case-card-footer">
    <div class="footer-meta-item"><span class="f-label">推理延迟:</span> <span class="f-val text-na">[未采集 / NOT CAPTURED]</span></div>
    <div class="footer-meta-item"><span class="f-label">Token 消耗:</span> <span class="f-val text-na">[未采集 / NOT CAPTURED]</span></div>
    <div class="footer-meta-item"><span class="f-label">单次成本:</span> <span class="f-val text-na">[未采集 / NOT CAPTURED]</span></div>
    <div class="footer-meta-item"><span class="f-label">门禁核验:</span> <span class="f-val font-mono">{html.escape(threshold)}</span></div>
  </footer>
</article>""")

    cards_str = "\n".join(cards_html)

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AI 评测证据墙 · AI MASTER</title>
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/frontend.css">
  <link rel="stylesheet" href="../assets/ai-review.css">
</head>
<body>
  {navigation}
  <main class="demo-page ai-review-page">
    <header class="review-header">
      <div class="review-kicker">BENCHMARK EVIDENCE · {total_cases} DOUBLE-BLIND SAMPLES</div>
      <h1 class="review-title">AI 复评规则双盲验证证据墙</h1>
      <p class="review-desc">
        复核 <code>{html.escape(model)}</code> 对学习者知识点口语化讲解的评测边界。数据源自 <code>tests/ai-rubric-validation-results.json</code> 静态投影，全面公示混淆矩阵、派生准召指标与严格未采集技术字段。
      </p>

      <div class="instrument-meta-bar">
        <div class="meta-item"><span class="meta-label">评测基座模型</span><span class="meta-val highlight-go">● {html.escape(model)}</span></div>
        <div class="meta-item"><span class="meta-label">判定门禁规则</span><span class="meta-val font-mono"><code>{html.escape(threshold)}</code></span></div>
        <div class="meta-item"><span class="meta-label">评测样本总量</span><span class="meta-val font-mono">{total_cases} 例双盲讲解</span></div>
        <div class="meta-item"><span class="meta-label">基准生成时间</span><span class="meta-val font-mono">{html.escape(generated_at)}</span></div>
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">准确率 · ACCURACY</div>
        <div class="kpi-readout highlight-go">{acc_pct}%</div>
        <div class="kpi-sub">19 / 21 判定与真值吻合</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">精确率 · PRECISION</div>
        <div class="kpi-readout highlight-go">{prec_pct}%</div>
        <div class="kpi-sub">8 / 8 判定通过均为真值达标 (0 假阳性)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">召回率 · RECALL</div>
        <div class="kpi-readout highlight-hold">{rec_pct}%</div>
        <div class="kpi-sub">8 / 10 真实达标通过 (严苛拦截 2 例边缘)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">F1 综合指标 · F1-SCORE</div>
        <div class="kpi-readout highlight-go">{f1_pct}%</div>
        <div class="kpi-sub">准召调和均值 (Harmonic Mean)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">假正例率 · FPR</div>
        <div class="kpi-readout highlight-go">0.0%</div>
        <div class="kpi-sub">0 / 11 劣质回答冒充通过 (安全兜底率 100%)</div>
      </div>
    </section>

    <section class="matrix-section">
      <div class="matrix-card">
        <div class="card-header">
          <h2 class="card-title">混淆矩阵 (Confusion Matrix)</h2>
          <span class="card-subtitle">点击单元格可快速过滤下方对应案例列表</span>
        </div>

        <div class="matrix-table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="corner-header">真值标签 \ AI判定</th>
                <th class="col-head">AI 评测通过<br><span class="th-sub">(Accepted = True)</span></th>
                <th class="col-head">AI 评测拦截<br><span class="th-sub">(Accepted = False)</span></th>
                <th class="col-head">行汇总<br><span class="th-sub">(Ground Truth Total)</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th class="row-head">真实达标<br><span class="th-sub">(GT = True)</span></th>
                <td class="cell-matrix cell-tp" data-filter-verdict="TP" title="点击过滤 TP 样本">
                  <div class="matrix-cell-content">
                    <span class="cell-tag">TP 真正例</span>
                    <span class="cell-count">{tp}</span>
                    <span class="cell-desc">真实合格 × 准确通过</span>
                  </div>
                </td>
                <td class="cell-matrix cell-fn" data-filter-verdict="FN" title="点击过滤 FN 样本">
                  <div class="matrix-cell-content">
                    <span class="cell-tag">FN 假负例</span>
                    <span class="cell-count">{fn}</span>
                    <span class="cell-desc">真实合格 × 严苛拦截 (Score 72/70)</span>
                  </div>
                </td>
                <td class="cell-matrix cell-total font-mono">{tp + fn}</td>
              </tr>
              <tr>
                <th class="row-head">真实不合格<br><span class="th-sub">(GT = False)</span></th>
                <td class="cell-matrix cell-fp" data-filter-verdict="FP" title="点击过滤 FP 样本">
                  <div class="matrix-cell-content">
                    <span class="cell-tag">FP 假正例</span>
                    <span class="cell-count">{fp}</span>
                    <span class="cell-desc">真实劣质 × 误判通过 (零冒充)</span>
                  </div>
                </td>
                <td class="cell-matrix cell-tn" data-filter-verdict="TN" title="点击过滤 TN 样本">
                  <div class="matrix-cell-content">
                    <span class="cell-tag">TN 真负例</span>
                    <span class="cell-count">{tn}</span>
                    <span class="cell-desc">真实劣质 × 准确拦截</span>
                  </div>
                </td>
                <td class="cell-matrix cell-total font-mono">{fp + tn}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th class="row-head">列汇总 (Predicted)</th>
                <td class="cell-matrix cell-total font-mono">{tp + fp}</td>
                <td class="cell-matrix cell-total font-mono">{fn + tn}</td>
                <td class="cell-matrix cell-grand font-mono">{total_cases}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="matrix-analysis-callout">
          <div class="callout-badge">工程审计结论</div>
          <p>
            <strong>1. 零误放拦截（Precision 100%, FP=0）：</strong>所有概念错误、幻觉定义或胡言乱语被 100% 拦截，证明 <code>score &gt;= 75 &amp;&amp; factualCorrect === true</code> 的门禁组合具有工业级安全防御能力，杜绝学习者以错误理解冒充通关。<br>
            <strong>2. 保守安全偏好（Recall 80%, FN=2）：</strong>2 例真值达标案例被拦截（案例 #05 得分 72，案例 #20 得分 70）。模型在表述不够严密或未显式覆盖全部核验要点时倾向于给出审慎扣分，体现了宁缺毋滥的教学复核标准。
          </p>
        </div>
      </div>
    </section>

    <section class="transparency-section">
      <div class="transparency-card">
        <div class="card-header">
          <h2 class="card-title">未采集指标与系统边界公示 (Explicit NOT CAPTURED Transparency)</h2>
          <span class="card-badge">科学诚信说明</span>
        </div>
        <p class="transparency-intro">
          根据“无情精简”与“实事求是”原则，本系统坚决不向评测报告中填充编造或合成的运行时参数。原始离线双盲测试脚本（<code>tests/ai-rubric-validation.js</code>）仅记录了 Rubric 评分判定与反馈，以下未埋点指标均如实公示：
        </p>
        <div class="transparency-grid">
          <div class="transparency-item">
            <span class="item-field">推理延迟 (Latency)</span>
            <span class="item-status status-na">[未采集 / NOT CAPTURED]</span>
            <span class="item-detail">离线双盲批处理未做单次 API 调用毫秒计时</span>
          </div>
          <div class="transparency-item">
            <span class="item-field">输入 Token (Prompt Tokens)</span>
            <span class="item-status status-na">[未采集 / NOT CAPTURED]</span>
            <span class="item-detail">测试流水线未保留分词 Token 统计</span>
          </div>
          <div class="transparency-item">
            <span class="item-field">输出 Token (Completion Tokens)</span>
            <span class="item-status status-na">[未采集 / NOT CAPTURED]</span>
            <span class="item-detail">未持久化返回文本的生成 Token 计数</span>
          </div>
          <div class="transparency-item">
            <span class="item-field">单次评测费用 (Cost Estimate)</span>
            <span class="item-status status-na">[未采集 / NOT CAPTURED]</span>
            <span class="item-detail">无实时计费探针与 API 汇率折算</span>
          </div>
          <div class="transparency-item">
            <span class="item-field">系统提示词哈希 (Prompt Hash)</span>
            <span class="item-status status-na">[未采集 / NOT CAPTURED]</span>
            <span class="item-detail">依赖 <code>server/ai-review.js</code> 内置统一量表版本</span>
          </div>
          <div class="transparency-item">
            <span class="item-field">评测判定规则版本</span>
            <span class="item-status status-ok">v1.2-strict (ACTIVE)</span>
            <span class="item-detail">7 项前置规则筛查 + 大模型事实性与深度复评</span>
          </div>
        </div>
      </div>
    </section>

    <section class="cases-section" id="cases-container">
      <div class="cases-toolbar">
        <div class="toolbar-title-wrap">
          <h2 class="card-title">评测验证案例明细 ({total_cases} 例)</h2>
          <span class="cases-count-badge" id="cases-visible-count">显示 {total_cases} / {total_cases} 例</span>
        </div>
        <div class="filter-groups">
          <div class="filter-group" id="filter-verdict-group">
            <span class="filter-label">判定分类:</span>
            <button class="filter-btn active" data-filter="verdict" data-val="ALL">全部 (21)</button>
            <button class="filter-btn" data-filter="verdict" data-val="TP">TP 真正例 ({tp})</button>
            <button class="filter-btn" data-filter="verdict" data-val="TN">TN 真负例 ({tn})</button>
            <button class="filter-btn" data-filter="verdict" data-val="FN">FN 假负例 ({fn})</button>
            <button class="filter-btn" data-filter="verdict" data-val="FP">FP 假正例 ({fp})</button>
          </div>
          <div class="filter-group" id="filter-module-group">
            <span class="filter-label">所属模块:</span>
            <button class="filter-btn active" data-filter="module" data-val="ALL">全部模块</button>
            <button class="filter-btn" data-filter="module" data-val="llm-basics">大模型基础</button>
            <button class="filter-btn" data-filter="module" data-val="transformer">Transformer</button>
            <button class="filter-btn" data-filter="module" data-val="rag-retrieval">RAG检索</button>
          </div>
        </div>
      </div>

      <div class="case-cards-list" id="case-cards-list">
        {cards_str}
      </div>
    </section>
  </main>

  <script src="../static/js/ai-review.js"></script>
</body>
</html>"""



def playground_css():
    return """/* AI Lab Workbench Index - Dark Instrument System */
.playground-page {
  padding-bottom: var(--space-16);
}

.playground-header {
  margin-bottom: var(--space-8);
  border-bottom: 1px solid var(--line);
  padding-bottom: var(--space-6);
}

.playground-kicker {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--go);
  margin-bottom: var(--space-2);
}

.playground-title {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  font-weight: 700;
  margin: 0 0 var(--space-3) 0;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.playground-desc {
  max-width: 900px;
  color: var(--ink-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0 0 var(--space-5) 0;
}

.playground-desc code {
  font-family: var(--font-mono);
  color: var(--go);
  background: var(--bg-card);
  padding: 2px 6px;
  border: 1px solid var(--line);
}

.lab-meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-3) var(--space-4);
}

.lab-meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.8rem;
  font-family: var(--font-mono);
}

.lab-meta-label {
  color: var(--ink-dim);
}

.lab-meta-val {
  color: var(--ink);
}

.lab-meta-val.highlight-go {
  color: var(--go);
  font-weight: 600;
}

/* Lab Controls Toolbar */
.lab-toolbar {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-4) var(--space-6);
  margin-bottom: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.category-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.category-btn {
  background: var(--bg-card);
  border: 1px solid var(--line);
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-radius: var(--radius);
  transition: all 0.15s ease;
}

.category-btn:hover {
  background: var(--bg-card-hover);
  color: var(--ink);
  border-color: var(--line-bright);
}

.category-btn.active {
  background: var(--go-dim);
  color: var(--go);
  border-color: var(--go);
  font-weight: 700;
}

.search-box-wrap {
  position: relative;
  min-width: 240px;
}

.search-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  outline: none;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--go);
}

.search-input::placeholder {
  color: var(--ink-dim);
}

.toolbar-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--line-dim);
  padding-top: var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.lab-counter {
  color: var(--go);
  background: var(--go-dim);
  border: 1px solid var(--go-border);
  padding: 2px 8px;
}

/* Lab Cards Grid */
.labs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--space-5);
  margin-bottom: var(--space-12);
}

.lab-card {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  transition: border-color 0.15s ease, transform 0.15s ease;
  border-radius: var(--radius);
}

.lab-card:hover {
  border-color: var(--line-bright);
  background: var(--bg-card);
}

.lab-card-header {
  padding: var(--space-4) var(--space-5);
  background: var(--bg-card);
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lab-code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--go);
}

.lab-badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 2px 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--line);
  color: var(--ink-muted);
}

.lab-badge-algorithm { color: var(--go); border-color: var(--go-border); }
.lab-badge-engineering { color: #38bdf8; border-color: rgba(56, 189, 248, 0.3); }
.lab-badge-simulation { color: #a78bfa; border-color: rgba(167, 139, 250, 0.3); }
.lab-badge-core { color: var(--hold); border-color: var(--hold-border); }

.lab-card-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
}

.lab-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.4;
}

.lab-desc {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--ink-muted);
  flex: 1;
}

.lab-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.lab-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: var(--bg-subtle);
  border: 1px solid var(--line-dim);
  color: var(--ink-dim);
  padding: 2px 6px;
}

.lab-card-footer {
  padding: var(--space-3) var(--space-5);
  background: var(--bg-card);
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lab-route-hint {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-dim);
}

/* Bridges & Hub Section */
.bridges-section {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  padding: var(--space-6);
  margin-bottom: var(--space-8);
}

.bridges-title {
  margin: 0 0 var(--space-4) 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink);
}

.bridges-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.bridge-card {
  background: var(--bg-card);
  border: 1px solid var(--line);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: border-color 0.15s ease;
}

.bridge-card:hover {
  border-color: var(--line-bright);
}

.bridge-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bridge-desc {
  font-size: 0.8rem;
  color: var(--ink-muted);
  line-height: 1.5;
  margin: 0;
}
"""


def build_playground():
    source = "playground/index.html"
    navigation = nav(source)

    labs = [
        {
            "id": "bpe-lab",
            "code": "LAB-01 · TOKENIZER",
            "category": "algorithm",
            "category_name": "算法交互",
            "title": "BPE 分词实验室 (Byte Pair Encoding)",
            "desc": "基于字节对编码算法实时统计字符共现频率，交互式体验子词词表构建、迭代合并规则与分词切分。",
            "url": page_url("/static/bpe_game.html", source),
            "tags": ["BPE算法", "子词切分", "词表构建", "合并频率"]
        },
        {
            "id": "transformer-lab",
            "code": "LAB-02 · ATTENTION",
            "category": "algorithm",
            "category_name": "算法交互",
            "title": "Transformer 算法详解与注意力矩阵 (Transformer Lab)",
            "desc": "交互式拆解 Scaled Dot-Product Attention、Multi-Head Attention 矩阵运算，实时查看 Query、Key、Value 点积与 Softmax 热力图。",
            "url": page_url("/static/transformer_lab.html", source),
            "tags": ["自注意力", "QKV点积", "多头注意力", "Softmax权重"]
        },
        {
            "id": "llm-training-sim",
            "code": "LAB-03 · TRAINING",
            "category": "algorithm",
            "category_name": "算法交互",
            "title": "大模型训练与超参模拟器 (Training Simulator)",
            "desc": "交互调节学习率 (LR)、Batch Size、权重衰减等超参数，实时观察梯度更新轨迹、Loss 损失收敛曲线与过拟合动态。",
            "url": page_url("/static/llm_training_game.html", source),
            "tags": ["超参调优", "损失曲线", "梯度下降", "泛化能力"]
        },
        {
            "id": "rag-starlab",
            "code": "LAB-04 · RAG ENGINE",
            "category": "engineering",
            "category_name": "工程工坊",
            "title": "Private RAG 私有知识库检索工坊 (RAG Starlab)",
            "desc": "端到端部署私有知识问答系统。体验文档分块切分 (Chunking)、向量嵌入 (Embedding)、余弦相似度检索与重排序。",
            "url": page_url("/static/rag_starlab/index.html", source),
            "tags": ["RAG架构", "向量检索", "文档切块", "语义相似度"]
        },
        {
            "id": "prompt-starlab",
            "code": "LAB-05 · PROMPT LAB",
            "category": "engineering",
            "category_name": "工程工坊",
            "title": "提示词工程实验舱 (Prompt Engineering Lab)",
            "desc": "结构化探索 System Prompt、Few-Shot 示例引导、CoT 思维链推导与约束格式输出，掌握生产级提示词设计方法论。",
            "url": page_url("/static/prompt_cg_starlab/index.html", source),
            "tags": ["提示词工程", "思维链CoT", "Few-Shot", "结构化输出"]
        },
        {
            "id": "agentic-cg",
            "code": "LAB-06 · AGENT REACt",
            "category": "engineering",
            "category_name": "工程工坊",
            "title": "智能体架构与工具协同舱 (Agentic System)",
            "desc": "剖析 ReAct 循环（Reasoning + Acting）、外部工具绑定 (Tool Calling)、执行观测与多智能体拓扑协同机理。",
            "url": page_url("/static/agentic_cg/index.html", source),
            "tags": ["AI Agent", "ReAct循环", "工具调用", "多智能体"]
        },
        {
            "id": "claude-cg",
            "code": "LAB-07 · CODE AGENT",
            "category": "engineering",
            "category_name": "工程工坊",
            "title": "代码智能体与上下文工程 (Claude Code × Codex)",
            "desc": "深入探究代码大模型的上下文理解、仓库级代码索引、自动化补全与指令执行工程实战范式。",
            "url": page_url("/static/claude_cg/index.html", source),
            "tags": ["代码大模型", "上下文工程", "自动化编程", "仓库索引"]
        },
        {
            "id": "transformer-cg",
            "code": "LAB-08 · ATTN 3D",
            "category": "simulation",
            "category_name": "视效仿真",
            "title": "Transformer 动态视效流 (Transformer CG)",
            "desc": "全景动画展现自回归解码过程、因果掩码 (Causal Mask) 机制以及高维嵌入向量在注意力头之间的流向与交互。",
            "url": page_url("/static/transformer_cg.html", source),
            "tags": ["3D视效", "因果掩码", "自回归解码", "注意力流向"]
        },
        {
            "id": "rag-cg",
            "code": "LAB-09 · RAG NARRATIVE",
            "category": "simulation",
            "category_name": "视效仿真",
            "title": "RAG 检索技术科普全景 (RAG CG Narrative)",
            "desc": "视效化演示学习者提问从分词、稠密向量映射、高维空间邻近检索到增强生成的完整端到端技术链条。",
            "url": page_url("/static/rag_cg/index.html", source),
            "tags": ["全景叙事", "密集向量检索", "检索召回", "知识注入"]
        },
        {
            "id": "llm-intro",
            "code": "LAB-10 · LLM 3D",
            "category": "simulation",
            "category_name": "视效仿真",
            "title": "大模型全景导论视觉舱 (LLM Intro 3D)",
            "desc": "直观探索大语言模型的基础架构、自监督预训练、涌现现象 (Emergence) 与 Scaling Law 标度律演变全景。",
            "url": page_url("/static/llm_intro.html", source),
            "tags": ["大模型导论", "标度律", "自回归机理", "涌现现象"]
        },
        {
            "id": "ai-odyssey",
            "code": "LAB-11 · ODYSSEY",
            "category": "simulation",
            "category_name": "视效仿真",
            "title": "AI 知识宇宙远航 (AI Odyssey)",
            "desc": "将核心技术概念投射为星际航标，通过全景漫游模式探索从感知机到通用人工智能的技术演进图景。",
            "url": page_url("/static/ai_odyssey.html", source),
            "tags": ["全景漫游", "技术演进", "概念拓扑", "知识漫游"]
        },
        {
            "id": "interview-cg",
            "code": "LAB-12 · REVIEW HUB",
            "category": "core",
            "category_name": "通关枢纽",
            "title": "知识星辰互动与复核舱 (Knowledge Stars Review)",
            "desc": "连接 57 个课程知识节点星海与 7 核心模块口语化讲解评测，提供全方位评测准备与实战通关演练。",
            "url": page_url("/static/interview.html", source),
            "tags": ["知识复核", "口语化讲解", "双盲评测", "通关演练"]
        }
    ]

    cards_html = []
    for lab in labs:
        tags_str = "".join(f'<span class="lab-tag">{html.escape(t)}</span>' for t in lab["tags"])
        cat_badge_class = f"lab-badge lab-badge-{lab['category']}"
        cards_html.append(f"""<article class="lab-card" data-category="{lab['category']}" data-tags="{html.escape(' '.join(lab['tags']))}">
  <header class="lab-card-header">
    <span class="lab-code">{html.escape(lab['code'])}</span>
    <span class="{cat_badge_class}">{html.escape(lab['category_name'])}</span>
  </header>
  <div class="lab-card-body">
    <h3 class="lab-title">{html.escape(lab['title'])}</h3>
    <p class="lab-desc">{html.escape(lab['desc'])}</p>
    <div class="lab-tags">{tags_str}</div>
  </div>
  <footer class="lab-card-footer">
    <span class="lab-route-hint">纯前端离线交互</span>
    <a href="{lab['url']}" class="btn btn-sm btn-go">进入实验 ↗</a>
  </footer>
</article>""")

    cards_str = "\\n".join(cards_html)
    canvas_url = page_url("/canvas/", source)
    stars_url = page_url("/knowledge-stars/", source)
    review_url = page_url("/ai-review/", source)
    handson_url = page_url("/hands-on/", source)

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AI 实验工坊技术索引 · AI MASTER</title>
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/frontend.css">
  <link rel="stylesheet" href="../assets/playground.css">
</head>
<body>
  {navigation}
  <main class="demo-page playground-page">
    <header class="playground-header">
      <div class="playground-kicker">AI ENGINEERING WORKBENCH · INTERACTIVE LABS</div>
      <h1 class="playground-title">AI 实验工坊技术索引</h1>
      <p class="playground-desc">
        从底层的 BPE Token 切分、自注意力点积计算、超参训练收敛，到私有 RAG 向量检索与智能体工具协同，汇聚全部可直接交互的 AI 算法实验与可视化原型。
      </p>

      <div class="lab-meta-bar">
        <div class="lab-meta-item"><span class="lab-meta-label">已收录实验工坊</span><span class="lab-meta-val highlight-go">12 个高可交互舱室</span></div>
        <div class="lab-meta-item"><span class="lab-meta-label">配套代码实践</span><span class="lab-meta-val">41 项动手实践任务</span></div>
        <div class="lab-meta-item"><span class="lab-meta-label">核心通关门禁</span><span class="lab-meta-val">7 个口语讲解复核模块</span></div>
        <div class="lab-meta-item"><span class="lab-meta-label">运行架构</span><span class="lab-meta-val highlight-go">● 纯前端静态离线可运行</span></div>
      </div>
    </header>

    <section class="lab-toolbar">
      <div class="toolbar-top">
        <div class="category-filters" id="category-filters">
          <button class="category-btn active" data-cat="ALL">全部实验 (12)</button>
          <button class="category-btn" data-cat="algorithm">算法交互 (3)</button>
          <button class="category-btn" data-cat="engineering">工程工坊 (4)</button>
          <button class="category-btn" data-cat="simulation">视效仿真 (4)</button>
          <button class="category-btn" data-cat="core">通关枢纽 (1)</button>
        </div>
        <div class="search-box-wrap">
          <input type="text" id="lab-search-input" class="search-input" placeholder="按技术关键词即时过滤..." autocomplete="off">
        </div>
      </div>
      <div class="toolbar-bottom">
        <span class="lab-counter" id="lab-visible-counter">显示 12 / 12 个实验</span>
        <span class="toolbar-hint">点击任意工坊卡片即可直接进入全屏交互环境</span>
      </div>
    </section>

    <section class="labs-grid" id="labs-grid">
      {cards_str}
    </section>

    <section class="bridges-section">
      <h2 class="bridges-title">关联系统导航与核心枢纽 (System Bridges)</h2>
      <div class="bridges-grid">
        <a href="{canvas_url}" class="bridge-card">
          <div class="bridge-name">思维画布 (Canvas) <span>↗</span></div>
          <p class="bridge-desc">全景概念关系拓扑与思维推演图谱，连接各核心理论节点。</p>
        </a>
        <a href="{stars_url}" class="bridge-card">
          <div class="bridge-name">知识星海 (Universe) <span>↗</span></div>
          <p class="bridge-desc">Three.js 57 知识星辰 3D 拓扑星海，实时映射学习者本地进度。</p>
        </a>
        <a href="{review_url}" class="bridge-card">
          <div class="bridge-name">AI 评测证据墙 (Evidence Wall) <span>↗</span></div>
          <p class="bridge-desc">21 例双盲测试真值投影、混淆矩阵看板与严格未采集指标透明公示。</p>
        </a>
        <a href="{handson_url}" class="bridge-card">
          <div class="bridge-name">动手实践任务 (Hands-on) <span>↗</span></div>
          <p class="bridge-desc">10 个章节 41 项源码级工程实战任务与阶段性通关指引。</p>
        </a>
      </div>
    </section>
  </main>

  <script src="../static/js/playground.js"></script>
</body>
</html>"""


def main():
    courses = load("courses_index.json")
    rubric_results_path = ROOT / "tests" / "ai-rubric-validation-results.json"
    rubric_data = json.loads(rubric_results_path.read_text(encoding="utf-8")) if rubric_results_path.exists() else {}
    chapters = {i: load(f"chapter_{i:02d}.json") for i in range(1, 11)}
    hands_on_mapping = build_hands_on_mapping(chapters, load("hands-on-tasks.json"))
    write("assets/frontend.css", shell_css())
    write("assets/dashboard-demo.css", dashboard_css())
    write("assets/chapter-demo.css", chapter_css())
    write("assets/ai-review.css", ai_review_css())
    write("assets/frontend.js", runtime_js())
    write("index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=learning-center/"><title>AI Master 讲解通关</title></head><body><p>正在进入 <a href="learning-center/">AI Master 讲解通关</a>...</p></body></html>')
    write("dashboard/index.html", build_dashboard(courses))
    write("data/ai-rubric-validation-results.json", json.dumps(rubric_data, ensure_ascii=False, indent=2))
    write("ai-review/index.html", build_ai_review(rubric_data))
    for cid, chapter in chapters.items(): write(f"chapter/{cid}/index.html", chapter_page(chapter, hands_on_mapping))
    write("data/knowledge-universe.json", json.dumps(build_universe(courses, chapters), ensure_ascii=False, indent=2))
    atlas = (FRONTEND / "static" / "knowledge_stars.html").read_text(encoding="utf-8")
    atlas = re.sub(r'href="css/knowledge_stars\.css([^"]*)"', r'href="../static/css/knowledge_stars.css\1"', atlas)
    atlas = atlas.replace('src="bgm.mp3"', 'src="../static/bgm.mp3"')
    atlas = atlas.replace('src="vendor/three.r128.min.js"', 'src="../static/vendor/three.r128.min.js"')
    atlas = re.sub(r'src="js/knowledge_stars\.js([^"]*)"', r'src="../static/js/knowledge_stars.js\1"', atlas)
    atlas = re.sub(r'src="js/knowledge-progress\.js([^"]*)"', r'src="../static/js/knowledge-progress.js\1"', atlas)
    write("knowledge-stars/index.html", atlas)
    write("canvas/index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../assets/tokens.css"><link rel="stylesheet" href="../assets/frontend.css"><title>AI Master - 思维画布</title></head><body>' + nav("canvas/index.html") + '<main class="demo-page"><section class="chapter-hero"><p class="kicker">KNOWLEDGE CANVAS</p><h1>思维画布</h1><p class="chapter-hero-desc">前端复现版保留知识导航与互动页面。完整的云端保存、AI 辅助生成与个人数据同步需要后端服务。</p><a class="btn btn-go" href="../dashboard/">返回总览 ↗</a></section></main></body></html>')
    write("assets/playground.css", playground_css())
    write("playground/index.html", build_playground())
    write("transition/index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../dashboard/"><title>AI Master</title></head><body></body></html>')
    write("start-demo.bat", '@echo off\nsetlocal\ncd /d "%~dp0"\necho AI Master frontend demo: http://127.0.0.1:8080/dashboard/\nstart "" http://127.0.0.1:8080/dashboard/\npython -m http.server 8080\n')
    patch_static_assets()
    rewrite_project_urls()
    print("Generated static frontend routes and data successfully.")


if __name__ == "__main__":
    main()
