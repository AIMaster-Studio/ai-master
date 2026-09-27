// Drawer visibility is independent of the existing chapter accordions.
export function initRouteDrawer(panel = document.querySelector(".route-panel, .path-level-column")) {
  if (!panel || panel.dataset.routeDrawer) return;
  panel.dataset.routeDrawer = "true";
  const content = document.createElement("div");
  content.className = "route-drawer-content";
  content.id = "route-drawer-content";
  content.append(...panel.childNodes);
  panel.append(content);
  const routeBody = content.querySelector(".route-body");
  if (routeBody) routeBody.hidden = false;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "route-edge-trigger";
  trigger.setAttribute("aria-controls", content.id);
  trigger.innerHTML = '<span class="route-edge-number"></span><span class="route-edge-arrow" aria-hidden="true">›</span>';
  panel.prepend(trigger);
  let pin = content.querySelector(".route-collapse");
  if (!pin) {
    pin = document.createElement("button");
    pin.type = "button";
    content.querySelector(".level-heading").append(pin);
  }
  pin.className = "route-pin";
  pin.removeAttribute("aria-expanded");
  pin.removeAttribute("aria-controls");
  pin.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v6"/></svg><span>Auto</span>';

  let sidebarExpanded = false;
  let pinned = false;
  let pointerInside = false;
  let keyboardInside = false;
  let closeTimer = 0;
  try { pinned = sessionStorage.getItem("ai-master-route-pinned") === "true"; } catch {}

  function cancelClose() {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
  }
  function setExpanded(expanded) {
    cancelClose();
    sidebarExpanded = expanded;
    panel.classList.toggle("is-drawer-expanded", expanded);
    content.inert = !expanded;
    content.setAttribute("aria-hidden", String(!expanded));
    trigger.setAttribute("aria-expanded", String(expanded));
    trigger.setAttribute("aria-label", (expanded ? "收起" : "展开") + "学习路线");
  }
  function syncPin() {
    panel.classList.toggle("is-drawer-pinned", pinned);
    pin.setAttribute("aria-pressed", String(pinned));
    pin.setAttribute("aria-label", pinned ? "取消固定学习路线，恢复自动收起" : "固定学习路线");
    pin.title = pinned ? "取消固定 · 恢复自动收起" : "固定侧栏";
    pin.querySelector("span").textContent = pinned ? "Pinned" : "Auto";
  }
  function scheduleClose() {
    cancelClose();
    if (pinned || pointerInside || keyboardInside) return;
    closeTimer = window.setTimeout(() => setExpanded(false), 400);
  }
  function syncChapter() {
    const current = content.querySelector('[aria-current="step"]');
    const number = current?.querySelector(".active-level-number, .route-level-index")?.textContent.trim()
      || String(Number(current?.dataset.levelIndex || 0) + 1).padStart(2, "0");
    trigger.querySelector(".route-edge-number").textContent = number;
    trigger.title = "学习路线 · 当前阶段 " + number;
  }
  syncChapter();
  syncPin();
  setExpanded(pinned);

  panel.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    pointerInside = true;
    setExpanded(true);
  });
  panel.addEventListener("pointerleave", event => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    pointerInside = false;
    scheduleClose();
  });
  trigger.addEventListener("focus", () => {
    keyboardInside = trigger.matches(":focus-visible");
    if (keyboardInside) setExpanded(true);
  });
  trigger.addEventListener("click", event => {
    // Hover has already opened the drawer for mouse users; touch and keyboard toggle it.
    if (event.pointerType === "mouse" && pointerInside) return;
    if (!pinned) setExpanded(!sidebarExpanded);
  });
  panel.addEventListener("focusin", event => {
    if (event.target === trigger && !trigger.matches(":focus-visible")) return;
    if (event.target.matches(":focus-visible")) keyboardInside = true;
    setExpanded(true);
  });
  panel.addEventListener("focusout", event => {
    if (panel.contains(event.relatedTarget)) return;
    keyboardInside = false;
    scheduleClose();
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Tab") keyboardInside = true;
  });
  document.addEventListener("pointerdown", event => {
    keyboardInside = false;
    if (!panel.contains(event.target) && !pinned) setExpanded(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !sidebarExpanded || pinned) return;
    if (panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    keyboardInside = false;
    setExpanded(false);
  });
  pin.addEventListener("click", () => {
    pinned = !pinned;
    try { sessionStorage.setItem("ai-master-route-pinned", String(pinned)); } catch {}
    syncPin();
    if (pinned) setExpanded(true);
    else scheduleClose();
  });
  // Stage selection updates the current number without touching accordion state.
  content.addEventListener("click", syncChapter);
}
