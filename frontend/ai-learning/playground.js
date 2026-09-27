import { PLAYGROUND_INITIAL_PROMPT, PLAYGROUND_INITIAL_RESPONSE } from "./data.js";
import { escapeHTML, icon } from "./components.js";

const TEMPLATES = {
  education: "请帮我写一篇关于人工智能在教育领域应用的科普文章。\n\n要求：通俗易懂，结构清晰，包含实际案例和未来展望，适合中学生阅读。",
  concept: "请用通俗易懂的语言解释【概念名称】。\n\n请按以下结构回答：\n1. 一句话定义\n2. 一个生活中的类比\n3. 一个实际应用\n4. 一个常见误区",
  project: "请为【项目主题】设计一个可在两周内完成的 AI 项目方案。\n\n请说明：目标用户、核心场景、所需数据、系统流程、评估方法和主要风险。"
};
const HISTORY_KEY = "aimaster-prompt-demo-history";

function markdownHTML(text) {
  return String(text).split(/\n{2,}/).map(function (block) {
    const safe = escapeHTML(block).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (safe.startsWith("# ")) return "<h1>" + safe.slice(2) + "</h1>";
    if (safe.startsWith("## ")) return "<h2>" + safe.slice(3) + "</h2>";
    if (/^\d+\.\s/.test(safe)) {
      const items = safe.split("\n").map(function (line) { return "<li>" + line.replace(/^\d+\.\s/, "") + "</li>"; }).join("");
      return "<ol>" + items + "</ol>";
    }
    if (/^[-*]\s/.test(safe)) {
      return "<ul>" + safe.split("\n").map(function (line) { return "<li>" + line.replace(/^[-*]\s/, "") + "</li>"; }).join("") + "</ul>";
    }
    return "<p>" + safe.replace(/\n/g, "<br>") + "</p>";
  }).join("");
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 5) : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(prompt) {
  const current = readHistory().filter(function (entry) { return entry.prompt !== prompt; });
  current.unshift({ prompt: prompt, time: new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(current.slice(0, 5))); } catch (_) { /* storage may be disabled */ }
}

export function initPlayground() {
  const input = document.getElementById("prompt-input");
  const count = document.getElementById("prompt-count");
  const status = document.getElementById("prompt-status");
  const output = document.getElementById("response-content");
  const label = document.getElementById("response-label");
  const run = document.getElementById("run-prompt");
  const template = document.getElementById("prompt-template");
  const settingsButton = document.getElementById("playground-settings");
  const settings = document.getElementById("settings-popover");
  const historyDialog = document.getElementById("history-dialog");
  let response = PLAYGROUND_INITIAL_RESPONSE;
  let view = "markdown";

  function drawResponse() {
    output.innerHTML = markdownHTML(response);
    output.classList.toggle("is-preview", view === "preview");
    output.setAttribute("aria-labelledby", view === "preview" ? "tab-preview" : "tab-markdown");
  }
  function updateCount() {
    count.textContent = input.value.length + "/2000";
    count.classList.toggle("count-near-limit", input.value.length > 1800);
  }
  function setView(next) {
    view = next;
    document.getElementById("tab-markdown").classList.toggle("is-active", next === "markdown");
    document.getElementById("tab-markdown").setAttribute("aria-selected", String(next === "markdown"));
    document.getElementById("tab-preview").classList.toggle("is-active", next === "preview");
    document.getElementById("tab-preview").setAttribute("aria-selected", String(next === "preview"));
    drawResponse();
  }
  function closeHistory() {
    historyDialog.hidden = true;
    document.getElementById("prompt-history").focus();
  }
  function showHistory() {
    const list = document.getElementById("history-list");
    const history = readHistory();
    list.innerHTML = history.length ? history.map(function (entry, index) {
      return '<button type="button" class="history-entry" data-history-index="' + index + '"><span>' + escapeHTML(entry.prompt.slice(0, 110)) + '</span><small>' + escapeHTML(entry.time) + '</small></button>';
    }).join("") : '<div class="history-empty">' + icon("clock", 24) + '<span>还没有运行记录</span><small>运行一次演示后，Prompt 会保存在此浏览器。</small></div>';
    historyDialog.hidden = false;
    document.getElementById("close-history").focus();
  }

  input.addEventListener("input", updateCount);
  updateCount();
  drawResponse();

  template.addEventListener("change", function () {
    if (TEMPLATES[template.value]) {
      input.value = TEMPLATES[template.value];
      updateCount();
      input.focus();
    }
  });
  document.getElementById("clear-prompt").addEventListener("click", function () {
    input.value = "";
    updateCount();
    status.textContent = "Prompt 已清空。";
    input.focus();
  });
  run.addEventListener("click", function () {
    const prompt = input.value.trim();
    if (!prompt) {
      status.textContent = "先输入一段 Prompt，再运行演示。";
      input.focus();
      return;
    }
    status.textContent = "正在整理本地示例响应…";
    label.textContent = "正在准备示例";
    run.disabled = true;
    run.classList.add("is-loading");
    window.setTimeout(function () {
      response = PLAYGROUND_INITIAL_RESPONSE;
      label.textContent = "本地示例响应 · 未调用模型";
      status.textContent = "演示完成。此结果为固定示例，不是模型生成。";
      run.disabled = false;
      run.classList.remove("is-loading");
      saveHistory(prompt);
      drawResponse();
    }, 760);
  });
  document.getElementById("tab-markdown").addEventListener("click", function () { setView("markdown"); });
  document.getElementById("tab-preview").addEventListener("click", function () { setView("preview"); });
  document.getElementById("copy-output").addEventListener("click", async function (event) {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(response);
      button.innerHTML = icon("check", 17) + " 已复制";
      window.setTimeout(function () { button.innerHTML = icon("copy", 17) + " 复制"; }, 1500);
    } catch (_) {
      status.textContent = "浏览器未开放剪贴板权限，请手动选择并复制。";
    }
  });
  document.getElementById("export-output").addEventListener("click", function () {
    const file = new Blob([response], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ai-master-prompt-demo.md";
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = "示例 Markdown 已导出。";
  });
  document.getElementById("prompt-history").addEventListener("click", showHistory);
  document.getElementById("close-history").addEventListener("click", closeHistory);
  historyDialog.addEventListener("click", function (event) {
    if (event.target === historyDialog) closeHistory();
    const entry = event.target.closest("[data-history-index]");
    if (entry) {
      const item = readHistory()[Number(entry.dataset.historyIndex)];
      if (item) { input.value = item.prompt; updateCount(); }
      closeHistory();
      input.focus();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !historyDialog.hidden) closeHistory();
  });
  settingsButton.addEventListener("click", function () {
    const open = settingsButton.getAttribute("aria-expanded") !== "true";
    settingsButton.setAttribute("aria-expanded", String(open));
    settings.hidden = !open;
  });
  document.addEventListener("click", function (event) {
    if (!settings.hidden && !event.target.closest("#playground-settings") && !event.target.closest("#settings-popover")) {
      settings.hidden = true;
      settingsButton.setAttribute("aria-expanded", "false");
    }
  });
}
