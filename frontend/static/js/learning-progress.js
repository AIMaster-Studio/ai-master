/**
 * AI Master — Unified Learning Progress Contract
 * Single progress authority: state.progress[moduleId]
 *
 * Source priority:
 * 1. GET /api/state
 * 2. localStorage["aimaster_learning_state"]
 * 3. Honest empty state
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AIMasterProgress = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // 7 authoritative curriculum modules
  const MODULES = [
    { id: "llm-basics", title: "大模型如何生成回答", chapter: 1 },
    { id: "prompt-design", title: "把任务写成可验收的提示", chapter: 3 },
    { id: "transformer", title: "理解注意力与位置信息", chapter: 2 },
    { id: "rag-retrieval", title: "搭起检索增强生成流程", chapter: 6 },
    { id: "rag-evaluation", title: "用证据定位 RAG 错误", chapter: 6 },
    { id: "agent-tools", title: "让 Agent 正确调用工具", chapter: 4 },
    { id: "agent-safety", title: "为 Agent 设置权限边界", chapter: 8 }
  ];

  const MODULE_IDS = MODULES.map((m) => m.id);

  // Mapping from chapter id to curriculum module ids
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

  // Legacy ID alias mapping
  const LEGACY_ALIASES = {
    "prompt": "prompt-design",
    "rag": "rag-retrieval"
  };

  function normalizeModuleId(id) {
    if (!id) return "";
    const clean = String(id).trim();
    return LEGACY_ALIASES[clean] || clean;
  }

  function isCompleted(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (typeof entry.completedAt === "string") {
      return Number.isFinite(Date.parse(entry.completedAt));
    }
    if (typeof entry.completedAt === "number") {
      return Number.isFinite(entry.completedAt) && entry.completedAt > 0;
    }
    if (entry.completed === true) return true;
    if (entry.passed === true) return true;
    if (entry.quiz && (entry.quiz.passed === true || (typeof entry.quiz.score === "number" && entry.quiz.score >= 75))) {
      if (entry.completedAt) return true;
    }
    return false;
  }

  function normalizeProgress(rawState) {
    const state = rawState && typeof rawState === "object" ? rawState : {};
    const rawProgress = state.progress && typeof state.progress === "object" ? state.progress : {};

    const workingProgress = { ...rawProgress };

    // Resolve legacy aliases
    for (const [legacyId, canonicalId] of Object.entries(LEGACY_ALIASES)) {
      if (workingProgress[legacyId] && !workingProgress[canonicalId]) {
        workingProgress[canonicalId] = workingProgress[legacyId];
      }
    }

    const progress = {};
    let completedCount = 0;

    for (const mod of MODULES) {
      const entry = workingProgress[mod.id] || null;
      const completed = isCompleted(entry);
      if (completed) completedCount++;

      progress[mod.id] = {
        id: mod.id,
        title: mod.title,
        chapter: mod.chapter,
        completed,
        completedAt: entry?.completedAt || (completed ? (entry?.updatedAt || new Date().toISOString()) : null),
        score: typeof entry?.score === "number" ? entry.score : (typeof entry?.quiz?.score === "number" ? entry.quiz.score : null),
        quiz: entry?.quiz || null,
        explanation: entry?.explanation || null,
        raw: entry
      };
    }

    const total = MODULES.length;
    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    const normalizedState = { ...state, progress: workingProgress };

    return {
      progress,
      modules: MODULES,
      completedCount,
      totalModules: total,
      percent,
      isCleanEmpty: completedCount === 0 && Object.keys(rawProgress).length === 0,
      state: normalizedState
    };
  }

  function getEmptyProgress() {
    return normalizeProgress({ progress: {} });
  }

  async function resolveProgress(options = {}) {
    const fetchFn = options.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const storage = options.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
    const timeoutMs = options.timeoutMs || 2000;

    // 1. Priority 1: GET /api/state
    if (fetchFn) {
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const res = await fetchFn("/api/state", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller?.signal
        });
        if (timer) clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.ok || data.state)) {
            const raw = data.state || data;
            const normalized = normalizeProgress(raw);
            normalized.source = "api";
            return normalized;
          }
        }
      } catch (_) {
        // Fall through to localStorage
      }
    }

    // 2. Priority 2: localStorage["aimaster_learning_state"]
    if (storage) {
      try {
        const raw = storage.getItem("aimaster_learning_state");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            const normalized = normalizeProgress(parsed);
            normalized.source = "localStorage";
            return normalized;
          }
        }
      } catch (_) {
        // Fall through to empty
      }
    }

    // 3. Priority 3: Honest empty state
    const empty = getEmptyProgress();
    empty.source = "empty";
    return empty;
  }

  return {
    MODULES,
    MODULE_IDS,
    CHAPTER_MODULE_MAP,
    LEGACY_ALIASES,
    normalizeModuleId,
    normalizeProgress,
    getEmptyProgress,
    resolveProgress,
    isCompleted
  };
});
