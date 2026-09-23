(() => {
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

  function initDemoSeedControls() {
    const seedBtn = document.querySelector("#btn-seed-demo");
    const resetBtn = document.querySelector("#btn-reset-demo");
    if (seedBtn) {
      seedBtn.addEventListener("click", () => {
        const demoState = {
          version: "1.0.0",
          progress: {
            "llm-basics": { completed: true, score: 95, completedAt: Date.now() },
            "transformer": { completed: true, score: 92, completedAt: Date.now() },
            "prompt-design": { completed: true, score: 90, completedAt: Date.now() },
            "agent-tools": { completed: true, score: 88, completedAt: Date.now() },
            "rag-retrieval": { completed: true, score: 94, completedAt: Date.now() },
            "rag-evaluation": { completed: true, score: 91, completedAt: Date.now() },
            "agent-safety": { completed: true, score: 89, completedAt: Date.now() }
          }
        };
        try {
          localStorage.setItem("aimaster_learning_state", JSON.stringify(demoState));
        } catch (_) {}
        initDashboardProgress();
        window.dispatchEvent(new CustomEvent("aimaster:progress-updated", { detail: demoState }));
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        try {
          localStorage.removeItem("aimaster_learning_state");
        } catch (_) {}
        initDashboardProgress();
        window.dispatchEvent(new CustomEvent("aimaster:progress-updated", { detail: { progress: {} } }));
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initDashboardProgress();
    initTocScrollSpy();
    initDemoSeedControls();
  });
})();
