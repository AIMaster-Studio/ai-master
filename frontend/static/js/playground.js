(function () {
  "use strict";

  function initPlayground() {
    const categoryBtns = document.querySelectorAll("#category-filters .category-btn");
    const searchInput = document.querySelector("#lab-search-input");
    const cards = document.querySelectorAll(".lab-card");
    const counter = document.querySelector("#lab-visible-counter");

    let currentCategory = "ALL";
    let searchQuery = "";

    function filterCards() {
      let visible = 0;
      const query = searchQuery.trim().toLowerCase();

      cards.forEach((card) => {
        const cat = card.getAttribute("data-category") || "";
        const tags = (card.getAttribute("data-tags") || "").toLowerCase();
        const title = (card.querySelector(".lab-title")?.textContent || "").toLowerCase();
        const desc = (card.querySelector(".lab-desc")?.textContent || "").toLowerCase();

        const matchCategory = currentCategory === "ALL" || cat === currentCategory;
        const matchSearch = !query || title.includes(query) || desc.includes(query) || tags.includes(query);

        if (matchCategory && matchSearch) {
          card.style.display = "";
          visible++;
        } else {
          card.style.display = "none";
        }
      });

      if (counter) {
        counter.textContent = `显示 ${visible} / ${cards.length} 个实验`;
      }
    }

    categoryBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        categoryBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.getAttribute("data-cat") || "ALL";
        filterCards();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        filterCards();
      });
    }

    filterCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlayground);
  } else {
    initPlayground();
  }
})();
