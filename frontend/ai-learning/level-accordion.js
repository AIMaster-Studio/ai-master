// Scoped to the learning route's six Level groups. Keep their DOM intact so
// native transitions can reverse from the current frame without losing focus.
export function initLevelAccordion(nav, onSelect) {
  if (!nav || nav.dataset.levelAccordion) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const groups = Array.from(nav.querySelectorAll(".level-nav-group")).map(group => {
    const button = group.querySelector(".level-card");
    const list = group.querySelector(".level-lesson-list");
    const panel = document.createElement("div");
    const clip = document.createElement("div");
    const inner = document.createElement("div");
    panel.className = "level-accordion-panel";
    clip.className = "level-accordion-clip";
    inner.className = "level-accordion-inner";
    list.before(panel);
    panel.append(clip);
    clip.append(inner);
    inner.append(list);
    list.hidden = false;
    list.querySelectorAll(".level-lesson-link").forEach((link, index) => {
      link.style.setProperty("--level-item-delay", index * 30 + "ms");
    });
    const entry = { group, button, panel, index: Number(button.dataset.levelIndex), settleTimer: 0 };
    panel.addEventListener("transitionend", event => {
      if (event.target !== panel || event.propertyName !== "grid-template-rows") return;
      if (button.getAttribute("aria-expanded") === "false") {
        group.classList.remove("is-layout-expanded");
        window.clearTimeout(entry.settleTimer);
        entry.settleTimer = 0;
      }
    });
    return entry;
  });
  let settleFrame = 0;
  function settleCollapsedLayout() {
    if (settleFrame) return;
    settleFrame = window.requestAnimationFrame(() => {
      settleFrame = 0;
      // Two toggles within one frame can settle at 0fr without generating a
      // transitionend event. Release only already-collapsed, still-closed groups.
      const collapsed = groups.filter(entry => entry.button.getAttribute("aria-expanded") === "false" && entry.panel.getBoundingClientRect().height < .5);
      collapsed.forEach(entry => entry.group.classList.remove("is-layout-expanded"));
    });
  }

  function setExpanded(entry, expanded) {
    window.clearTimeout(entry.settleTimer);
    entry.settleTimer = 0;
    entry.button.setAttribute("aria-expanded", String(expanded));
    entry.group.classList.toggle("is-expanded", expanded);
    entry.panel.setAttribute("aria-hidden", String(!expanded));
    entry.panel.inert = !expanded;
    if (expanded) entry.group.classList.add("is-layout-expanded");
    else if (reducedMotion.matches) entry.group.classList.remove("is-layout-expanded");
    else {
      settleCollapsedLayout();
      // A transition canceled before its first rendered frame may emit neither
      // an end event nor a zero-height frame during the first layout check.
      entry.settleTimer = window.setTimeout(() => {
        entry.settleTimer = 0;
        if (entry.button.getAttribute("aria-expanded") === "false" && entry.panel.getBoundingClientRect().height < .5) entry.group.classList.remove("is-layout-expanded");
      }, 260);
    }
  }

  groups.forEach(entry => setExpanded(entry, entry.button.getAttribute("aria-expanded") === "true"));
  nav.dataset.levelAccordion = "true";
  nav.addEventListener("click", event => {
    const button = event.target.closest(".level-card[data-level-index]");
    const selected = groups.find(entry => entry.button === button);
    if (!selected) return;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    groups.forEach(entry => setExpanded(entry, expanded && entry === selected));
    if (!expanded) return;
    groups.forEach(entry => {
      const current = entry === selected;
      entry.button.classList.toggle("is-active", current);
      if (current) entry.button.setAttribute("aria-current", "step");
      else entry.button.removeAttribute("aria-current");
      const state = entry.button.querySelector(".level-state");
      if (state) state.textContent = current ? "●" : "·";
    });
    onSelect(selected.index);
  });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    groups.forEach(entry => {
      window.clearTimeout(entry.settleTimer);
      entry.settleTimer = 0;
      if (entry.button.getAttribute("aria-expanded") === "false") entry.group.classList.remove("is-layout-expanded");
    });
  });
}
