(function () {
  "use strict";

  function initEvidenceWall() {
    const filterVerdictBtns = document.querySelectorAll("#filter-verdict-group .filter-btn");
    const filterModuleBtns = document.querySelectorAll("#filter-module-group .filter-btn");
    const cards = document.querySelectorAll(".case-card");
    const countDisplay = document.querySelector("#cases-visible-count");
    const matrixCells = document.querySelectorAll(".cell-matrix[data-filter-verdict]");
    const casesContainer = document.querySelector("#cases-container");
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let currentVerdict = "ALL";
    let currentModule = "ALL";

    function animateVisibleCards() {
      if (reduceMotion || !Element.prototype.animate) return;
      Array.from(cards).filter((card) => card.style.display !== "none").slice(0, 8).forEach((card) => {
        card.animate(
          [{ opacity: 0.72, transform: "translateY(2px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 140, easing: "ease-out" }
        );
      });
    }

    function updateFilters(animate = false) {
      let visible = 0;
      cards.forEach((card) => {
        const v = card.getAttribute("data-verdict");
        const m = card.getAttribute("data-module");

        const matchV = currentVerdict === "ALL" || v === currentVerdict;
        const matchM = currentModule === "ALL" || m === currentModule;

        if (matchV && matchM) {
          card.style.display = "";
          visible++;
        } else {
          card.style.display = "none";
        }
      });

      if (countDisplay) {
        countDisplay.textContent = `显示 ${visible} / ${cards.length} 例`;
      }
      if (animate) animateVisibleCards();
    }

    filterVerdictBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterVerdictBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentVerdict = btn.getAttribute("data-val") || "ALL";
        updateFilters(true);
      });
    });

    filterModuleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterModuleBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentModule = btn.getAttribute("data-val") || "ALL";
        updateFilters(true);
      });
    });

    matrixCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        const targetVerdict = cell.getAttribute("data-filter-verdict");
        if (!targetVerdict) return;

        filterVerdictBtns.forEach((b) => {
          if (b.getAttribute("data-val") === targetVerdict) {
            b.classList.add("active");
          } else {
            b.classList.remove("active");
          }
        });
        currentVerdict = targetVerdict;
        updateFilters(true);

        if (casesContainer) {
          casesContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    updateFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvidenceWall);
  } else {
    initEvidenceWall();
  }
})();
