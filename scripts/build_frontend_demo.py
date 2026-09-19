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
    return f"""<nav class="demo-nav">
  <div class="demo-nav-inner">
    <a class="demo-brand" href="{dashboard}">
      <span class="brand-badge">AI</span>
      <span class="brand-name">AI MASTER <em class="brand-sub">/ CORE</em></span>
    </a>
    <div class="demo-nav-links">
      <a href="{dashboard}">课程总览</a>
      <a href="{coach}" class="nav-highlight">讲解通关 ↗</a>
      <a href="{handson}">动手实践</a>
      <a href="{beginner}">新手入门</a>
      <a href="{stars}">知识星海</a>
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

  // 1. Read real localStorage learning progress
  function getCompletionStats() {
    let completedPoints = {};
    try {
      completedPoints = JSON.parse(localStorage.getItem("aimaster_completed") || "{}");
    } catch (_) {}

    let localWorkspace = {};
    try {
      localWorkspace = JSON.parse(localStorage.getItem("aimaster_local_workspace_v1") || "{}");
    } catch (_) {}

    return { completedPoints, localWorkspace };
  }

  // 2. Initialize Dashboard Chapter Progress Meters
  function initDashboardProgress() {
    const table = document.querySelector("#chapter-table");
    if (!table) return;

    const { completedPoints } = getCompletionStats();
    const completedCount = Object.keys(completedPoints).length;

    // Update Top KPI
    const kpiPassed = document.querySelector("#kpi-passed-count");
    if (kpiPassed) {
      kpiPassed.textContent = completedCount;
    }

    // Update each row
    const rows = table.querySelectorAll("tr[data-chapter-id]");
    rows.forEach(row => {
      const cid = row.getAttribute("data-chapter-id");
      const totalNodes = parseInt(row.getAttribute("data-total-nodes") || "0", 10);
      const nodeTitles = (row.getAttribute("data-node-titles") || "").split("||");
      
      let passInChapter = 0;
      nodeTitles.forEach(t => {
        if (t && completedPoints[t]) passInChapter++;
      });

      const pct = totalNodes > 0 ? Math.round((passInChapter / totalNodes) * 100) : 0;
      const meterFill = row.querySelector(".meter-fill");
      const pctLabel = row.querySelector(".progress-pct");
      if (meterFill) meterFill.style.width = `${pct}%`;
      if (pctLabel) pctLabel.textContent = `${pct}% (${passInChapter}/${totalNodes})`;
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
        <span class="kpi-label"><i></i>动手实验</span>
        <span class="kpi-value">{total_exercises}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label"><i></i>已通过节点</span>
        <span class="kpi-value" id="kpi-passed-count">0</span>
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


def main():
    courses = load("courses_index.json")
    chapters = {i: load(f"chapter_{i:02d}.json") for i in range(1, 11)}
    hands_on_mapping = build_hands_on_mapping(chapters, load("hands-on-tasks.json"))
    write("assets/frontend.css", shell_css())
    write("assets/dashboard-demo.css", dashboard_css())
    write("assets/chapter-demo.css", chapter_css())
    write("assets/frontend.js", runtime_js())
    write("index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=learning-center/"><title>AI Master 讲解通关</title></head><body><p>正在进入 <a href="learning-center/">AI Master 讲解通关</a>...</p></body></html>')
    write("dashboard/index.html", build_dashboard(courses))
    for cid, chapter in chapters.items(): write(f"chapter/{cid}/index.html", chapter_page(chapter, hands_on_mapping))
    write("data/knowledge-universe.json", json.dumps(build_universe(courses, chapters), ensure_ascii=False, indent=2))
    atlas = (FRONTEND / "static" / "knowledge_stars.html").read_text(encoding="utf-8")
    atlas = re.sub(r'href="css/knowledge_stars\.css([^"]*)"', r'href="../static/css/knowledge_stars.css\1"', atlas)
    atlas = atlas.replace('src="bgm.mp3"', 'src="../static/bgm.mp3"')
    atlas = atlas.replace('src="vendor/three.r128.min.js"', 'src="../static/vendor/three.r128.min.js"')
    atlas = re.sub(r'src="js/knowledge_stars\.js([^"]*)"', r'src="../static/js/knowledge_stars.js\1"', atlas)
    write("knowledge-stars/index.html", atlas)
    write("canvas/index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../assets/tokens.css"><link rel="stylesheet" href="../assets/frontend.css"><title>AI Master - 思维画布</title></head><body>' + nav("canvas/index.html") + '<main class="demo-page"><section class="chapter-hero"><p class="kicker">KNOWLEDGE CANVAS</p><h1>思维画布</h1><p class="chapter-hero-desc">前端复现版保留知识导航与互动页面。完整的云端保存、AI 辅助生成与个人数据同步需要后端服务。</p><a class="btn btn-go" href="../dashboard/">返回总览 ↗</a></section></main></body></html>')
    write("playground/index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../assets/tokens.css"><link rel="stylesheet" href="../assets/frontend.css"><link rel="stylesheet" href="../assets/chapter-demo.css"><title>AI Master - 训练舱</title></head><body>' + nav("playground/index.html") + '<main class="demo-page"><section class="chapter-hero"><p class="kicker">PRACTICE BAY</p><h1>训练舱</h1><p class="chapter-hero-desc">选择任一章节进入知识节点和实验页面。所有课程导航、交互实验与高级页面均可直接打开。</p><a class="btn btn-go" href="../dashboard/#route">选择学习章节 ↗</a></section></main></body></html>')
    write("transition/index.html", '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../dashboard/"><title>AI Master</title></head><body></body></html>')
    write("start-demo.bat", '@echo off\nsetlocal\ncd /d "%~dp0"\necho AI Master frontend demo: http://127.0.0.1:8080/dashboard/\nstart "" http://127.0.0.1:8080/dashboard/\npython -m http.server 8080\n')
    patch_static_assets()
    rewrite_project_urls()
    print("Generated static frontend routes and data successfully.")


if __name__ == "__main__":
    main()
