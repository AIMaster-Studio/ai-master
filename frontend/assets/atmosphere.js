/* ==========================================================================
   AI MASTER — ATMOSPHERE MOTION
   The only job here is to let the space drift a few pixels when a real
   pointer moves and when the reader scrolls. No loop, no particles, no
   timeline library, no continuous animation: with the pointer still the page
   is completely static, and the browser can idle.

   Everything is written to CSS custom properties so the compositor does the
   work, and every pixel of movement is a transform on a plane that already
   sits behind the UI.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var mode = root.getAttribute("data-atmosphere");
  if (!mode) return;

  /* mouse   = deepest of the two moving planes, in CSS px
     scrollA = far plane travel across a full page of scrolling
     scrollB = mid plane travel (opposite sign reads as separation, not drift)
     fade    = how much the whole volume quiets as the page is read down */
  var PROFILES = {
    landing: { mouse: 9, scrollA: 24, scrollB: -10, fade: 0.38 },
    learning: { mouse: 4, scrollA: 0, scrollB: 0, fade: 0 },
    review: { mouse: 2, scrollA: 0, scrollB: 0, fade: 0 },
    lab: { mouse: 7, scrollA: 18, scrollB: -8, fade: 0.1 },
    dashboard: { mouse: 2, scrollA: 4, scrollB: -2, fade: 0.05 },
    training: { mouse: 2, scrollA: 0, scrollB: 0, fade: 0 },
    entry: { mouse: 2.5, scrollA: 0, scrollB: 0, fade: 0 },
    stars: { mouse: 0, scrollA: 0, scrollB: 0, fade: 0 }
  };

  var profile = PROFILES[mode];
  if (!profile) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var compact = window.matchMedia("(max-width: 768px)");
  var finePointer = window.matchMedia("(pointer: fine)");

  var frame = 0;
  var active = false;

  function setPx(name, value) {
    root.style.setProperty(name, value.toFixed(2) + "px");
  }

  function clear() {
    setPx("--atm-x-a", 0);
    setPx("--atm-y-a", 0);
    setPx("--atm-x-b", 0);
    setPx("--atm-y-b", 0);
    setPx("--atm-s-a", 0);
    setPx("--atm-s-b", 0);
    root.style.setProperty("--atm-live", compact.matches ? "0.92" : "1");
  }

  function onScroll() {
    if (!active) return;
    var travel = document.documentElement.scrollHeight - window.innerHeight;
    var progress = travel > 0 ? Math.min(Math.max(window.scrollY / travel, 0), 1) : 0;
    setPx("--atm-s-a", progress * profile.scrollA);
    setPx("--atm-s-b", progress * profile.scrollB);
    root.style.setProperty("--atm-live", String(1 - progress * profile.fade));
  }

  function onPointer(event) {
    if (!active || profile.mouse <= 0 || frame) return;
    var x = event.clientX;
    var y = event.clientY;
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      var nx = (x / Math.max(window.innerWidth, 1) - 0.5) * 2;
      var ny = (y / Math.max(window.innerHeight, 1) - 0.5) * 2;
      /* Far plane leads; the mid plane trails it at roughly half the throw so
         the two read as different distances rather than one sliding sheet. */
      setPx("--atm-x-a", nx * profile.mouse);
      setPx("--atm-y-a", ny * profile.mouse * 0.62);
      setPx("--atm-x-b", nx * profile.mouse * 0.55);
      setPx("--atm-y-b", ny * profile.mouse * 0.34);
    });
  }

  function sync() {
    /* A chamber only animates for a mouse user who asked for motion on a
       viewport with room to spare. Everyone else gets the static space. */
    active = !reduceMotion.matches && !compact.matches && finePointer.matches;
    if (!active) {
      clear();
      return;
    }
    onScroll();
  }

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  reduceMotion.addEventListener("change", sync);
  compact.addEventListener("change", sync);
  finePointer.addEventListener("change", sync);

  sync();
})();
