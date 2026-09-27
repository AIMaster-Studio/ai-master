import { STAGES } from "./data.js";
import { renderDashboard, renderCourses, renderHome, renderLearningPath, renderPlayground, renderProjects } from "./pages.js";
import { renderPageShell, stageContent } from "./components.js";
import { initPlayground } from "./playground.js";
import { initLevelAccordion } from "./level-accordion.js";
import { initRouteDrawer } from "/assets/route-drawer.js?v=20260926-edge1";
import { initKnowledgeNodeProgressIndicators } from "/assets/knowledge-node-flow.js?v=20260926-node";

const route = (window.location.pathname.replace(/\/+$/, "") || "/");
const routeTable = {
  "/": { key: "home", title: "从零开始，系统学会 AI · AI Master", render: renderHome },
  "/dashboard": { key: "dashboard", title: "学习中心 · AI Master", render: renderDashboard, sidebar: true },
  "/learning-path": { key: "learning-path", title: "AI 学习路线 · AI Master", render: renderLearningPath, sidebar: true },
  "/courses": { key: "courses", title: "课程目录 · AI Master", render: renderCourses },
  "/projects": { key: "projects", title: "项目实战 · AI Master", render: renderProjects },
  "/playground": { key: "playground", title: "Prompt Playground · AI Master", render: renderPlayground }
};
const page = routeTable[route] || routeTable["/"];
const app = document.getElementById("app");
document.title = page.title;
document.body.classList.add("learning-platform-body");
if (page.key === "home") document.body.classList.add("page-home");
const courseAtlasMode = page.key === "courses" && !new URLSearchParams(window.location.search).has("q");
if (courseAtlasMode) document.body.classList.add("page-courses-atlas");
let selectedStage = 1;
if (page.key === "learning-path") {
  const requested = Number(new URLSearchParams(window.location.search).get("stage"));
  const found = STAGES.findIndex(function (stage) { return stage.id === requested; });
  if (found >= 0) selectedStage = found;
}
app.innerHTML = renderPageShell(page.render(selectedStage), page.key, { sidebar: page.sidebar, fullscreen: courseAtlasMode });

function initGlobalNavigation() {
  const header = document.querySelector(".site-header");
  if (header) {
    const syncHeaderScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 18); };
    syncHeaderScroll();
    window.addEventListener("scroll", syncHeaderScroll, { passive: true });
  }
  const navButton = document.getElementById("mobile-menu-button");
  const nav = document.getElementById("site-nav");
  const searchButton = document.getElementById("search-toggle");
  const searchForm = document.getElementById("site-search");
  const sidebarButton = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("site-sidebar");
  const scrim = document.getElementById("drawer-scrim");
  const closeSidebar = function () {
    document.body.classList.remove("sidebar-open");
    if (sidebarButton) sidebarButton.setAttribute("aria-expanded", "false");
    if (scrim) scrim.hidden = true;
  };
  if (navButton && nav) {
    navButton.addEventListener("click", function () {
      const open = navButton.getAttribute("aria-expanded") !== "true";
      navButton.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      if (open) nav.querySelector("a")?.focus();
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        navButton.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      }
    });
  }
  if (searchButton && searchForm) {
    searchButton.addEventListener("click", function () {
      const open = searchButton.getAttribute("aria-expanded") !== "true";
      searchButton.setAttribute("aria-expanded", String(open));
      searchForm.hidden = !open;
      if (open) searchForm.querySelector("input").focus();
    });
    searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const query = searchForm.querySelector("input").value.trim();
      if (query) window.location.href = "/courses/?q=" + encodeURIComponent(query);
    });
  }
  if (sidebarButton && sidebar && scrim) {
    sidebarButton.addEventListener("click", function () {
      const open = !document.body.classList.contains("sidebar-open");
      document.body.classList.toggle("sidebar-open", open);
      sidebarButton.setAttribute("aria-expanded", String(open));
      scrim.hidden = !open;
      if (open) sidebar.querySelector("a")?.focus();
    });
    scrim.addEventListener("click", closeSidebar);
    sidebar.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeSidebar();
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (nav && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      navButton.setAttribute("aria-expanded", "false");
      navButton.focus();
    }
    if (searchForm && !searchForm.hidden) {
      searchForm.hidden = true;
      searchButton.setAttribute("aria-expanded", "false");
      searchButton.focus();
    }
    if (document.body.classList.contains("sidebar-open")) {
      closeSidebar();
      sidebarButton.focus();
    }
  });
}

function initCourseSearch() {
  const input = document.getElementById("course-search");
  const grid = document.getElementById("course-grid");
  const empty = document.getElementById("catalog-empty");
  if (!input || !grid) return;
  const params = new URLSearchParams(window.location.search);
  input.value = params.get("q") || "";
  function filter() {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    grid.querySelectorAll(".course-card").forEach(function (card) {
      const match = !query || card.dataset.courseSearch.includes(query);
      card.hidden = !match;
      if (match) shown += 1;
    });
    empty.hidden = shown > 0;
  }
  input.addEventListener("input", filter);
  filter();
}

function initPathSelection() {
  const nav = document.querySelector(".level-list");
  const area = document.getElementById("path-course-area");
  if (!nav || !area) return;
  let activeIndex = selectedStage;
  let activeLesson = 0;
  function showStage(index, updateAddress) {
    activeIndex = index;
    activeLesson = 0;
    const stage = STAGES[index];
    area.innerHTML = stageContent(stage, activeLesson);
    if (updateAddress) history.replaceState(null, "", "/learning-path/?stage=" + stage.id);
  }
  initLevelAccordion(nav, index => showStage(index, true));
  area.addEventListener("click", function (event) {
    const row = event.target.closest("[data-lesson-index]");
    if (!row) return;
    activeLesson = Number(row.dataset.lessonIndex);
    area.innerHTML = stageContent(STAGES[activeIndex], activeLesson);
  });
}

function initHomeReviewStepper() {
  const tabs = Array.from(document.querySelectorAll("[data-review-index]"));
  const panels = Array.from(document.querySelectorAll(".review-step-panel"));
  const previous = document.getElementById("review-prev");
  const next = document.getElementById("review-next");
  const position = document.getElementById("review-position");
  if (!tabs.length || !panels.length) return;
  let active = 0;
  function select(index, moveFocus) {
    active = Math.max(0, Math.min(tabs.length - 1, index));
    tabs.forEach(function (tab, i) {
      const current = i === active;
      tab.classList.toggle("is-active", current);
      tab.setAttribute("aria-selected", String(current));
      tab.tabIndex = current ? 0 : -1;
      panels[i].hidden = !current;
    });
    previous.disabled = active === 0;
    next.disabled = active === tabs.length - 1;
    position.textContent = (active + 1) + " / " + tabs.length;
    if (moveFocus) tabs[active].focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { select(index, false); });
    tab.addEventListener("keydown", function (event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") select(0, true);
      else if (event.key === "End") select(tabs.length - 1, true);
      else select(active + (event.key === "ArrowRight" ? 1 : -1), true);
    });
  });
  previous.addEventListener("click", function () { select(active - 1, true); });
  next.addEventListener("click", function () { select(active + 1, true); });
}

function initHomeAtmosphere() {
  const visual = document.querySelector(".page-home .hero-visual img");
  if (!visual || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 700px)").matches) return;
  let frame = 0;
  const update = function () {
    frame = 0;
    const shift = Math.min(18, Math.max(0, window.scrollY * .035));
    visual.style.setProperty("--hero-scroll-shift", shift.toFixed(1) + "px");
  };
  window.addEventListener("scroll", function () {
    if (!frame) frame = window.requestAnimationFrame(update);
  }, { passive: true });
}

initGlobalNavigation();
initCourseSearch();
initPathSelection();
if (page.key === "learning-path") initRouteDrawer();
initHomeReviewStepper();
initHomeAtmosphere();
if (page.key === "learning-path") initKnowledgeNodeProgressIndicators();
if (page.key === "playground") initPlayground();
