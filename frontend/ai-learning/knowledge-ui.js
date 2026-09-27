import { STAGES } from "./data.js";

// Each visible knowledge node owns its explanation, quiz and completion loop.
export function clarifyKnowledgePage(level, number) {
  const root = document.querySelector(".knowledge-layout");
  if (!root) return;
  const stage = STAGES.find(function (item) { return item.id === level; });
  const total = stage?.lessons.length || 0;
  if (!total) return;

  root.querySelectorAll(".prompt-point-status, .series-point-idle").forEach(function (label) { label.remove(); });
  root.querySelectorAll(".lesson-metric small, .series-hero-metrics small").forEach(function (label) {
    if (label.textContent === "学习状态" || label.textContent === "当前状态") {
      label.textContent = "节点状态";
      const value = label.parentElement.querySelector("strong");
      if (value) value.dataset.currentNodeStatus = "";
    }
  });

  const rail = root.querySelector(".assistant-rail");
  if (rail) {
    const progress = rail.querySelector(".progress-panel, .series-progress");
    const title = progress?.querySelector(".rail-panel-heading h2");
    if (title) title.textContent = "学习进度";
    const positionLabel = progress?.querySelector(".prompt-progress-summary > div:last-child > strong, .series-progress-overview > div small");
    if (positionLabel && !positionLabel.matches("[data-node-stage-progress]")) positionLabel.textContent = "本阶段已通关";
    const ring = progress?.querySelector(".progress-ring, .series-progress-ring");
    if (ring) {
      ring.setAttribute("role", "img");
      ring.setAttribute("aria-label", STAGES.find(function (item) { return item.id === level; })?.title + "章节通关进度");
    }
    if (progress) {
      const note = document.createElement("p");
      note.className = "learning-status-note";
      note.textContent = "章节进度按已通关知识节点计算；每个节点分别保存讲解、测验与复习记录。";
      const overview = progress.querySelector(".progress-summary, .series-progress-overview");
      overview?.after(note);
    }
    foldRailList(rail.querySelector(".progress-point-list"), "查看本章目录");
    foldRailList(rail.querySelector(".resource-list"), "展开本节资源");
  }

  const quickCheck = root.querySelector(".quick-check");
  if (quickCheck) {
    const note = document.createElement("p");
    note.className = "quick-check-note";
    note.textContent = "这道快速检查只提供即时反馈，不计入讲解通关记录。";
    quickCheck.querySelector(".quick-check-options")?.after(note);
  }
  const pagination = root.querySelector(".lesson-pagination");
  if (pagination) {
    const next = document.createElement("section");
    next.className = "learning-next-step";
    next.setAttribute("aria-label", "本节点学习闭环");
    next.innerHTML = '<div><span>阅读 → 讲解 → 测验 → 节点通关</span><h2>在本页完成节点通关</h2><p>阅读和快速检查不会自动标记完成。读完本节内容后，点击节点闭环中的完成按钮，继续讲解和知识测验。</p></div><a href="#node-mastery">前往本节点通关 →</a>';
    pagination.before(next);
  }
}

function foldRailList(list, label) {
  if (!list) return;
  const details = document.createElement("details");
  details.className = "rail-fold";
  const summary = document.createElement("summary");
  summary.textContent = label;
  list.before(details);
  details.append(summary, list);
}
