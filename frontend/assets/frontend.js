(() => {
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
