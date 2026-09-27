const sessionKey = 'aimaster:mind-canvas:intro:v1';
const running = new WeakMap();

// Head owns the initial pending class and its independent 1800ms fail-safe.
// A module arriving after that timer must never hide the page again.
export function playIntroOnce({ shell, particles, reduced = false }) {
  if (running.has(shell)) return running.get(shell);
  const result = new Promise(resolve => {
    const root = document.documentElement;
    let done = false;
    let frame = 0;
    let safetyTimer = 0;
    let media;
    let context;
    let storage;
    let began = 0;
    let radius = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dots = [];
    const cleanups = [];
    function finish() {
      if (done) return;
      done = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (safetyTimer) window.clearTimeout(safetyTimer);
      cleanups.forEach(cleanup => cleanup());
      root.classList.remove('mc-intro-pending');
      shell.style.clipPath = 'none';
      shell.style.webkitClipPath = 'none';
      shell.inert = false;
      shell.removeAttribute('inert');
      shell.removeAttribute('aria-hidden');
      if (particles) {
        particles.style.opacity = '0';
        particles.style.visibility = 'hidden';
        context?.clearRect(0, 0, particles.width, particles.height);
      }
      try { storage?.setItem(sessionKey, '1'); } catch { /* Access is optional. */ }
      resolve();
    }
    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      cleanups.push(() => target.removeEventListener(event, handler));
    };
    try {
      storage = window.sessionStorage;
      if (storage.getItem(sessionKey) || reduced || !root.classList.contains('mc-intro-pending')) {
        finish();
        return;
      }
      // Reserve this session before hiding: readable storage can still reject
      // writes (quota/privacy settings). A rejected write means direct display.
      storage.setItem(sessionKey, '1');
    } catch {
      // Storage denial means directly visible, never a repeatedly blocked intro.
      finish();
      return;
    }
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (media.matches) { finish(); return; }
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
      shell.style.clipPath = 'circle(0px at 50% 50%)';
      context = particles?.getContext('2d');
      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        radius = Math.hypot(width, height) / 2 + 32;
        dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2);
        if (particles) {
          particles.width = Math.round(width * dpr);
          particles.height = Math.round(height * dpr);
        }
      }
      resize();
      dots = Array.from({ length: width < 640 ? 18 : 48 }, (_, index) => {
        const angle = index * 2.399963;
        return { angle, speed: 28 + (index % 7) * 11, size: .55 + (index % 3) * .35, phase: (index % 5) * .06 };
      });
      if (particles) { particles.style.visibility = 'visible'; particles.style.opacity = '1'; }
      began = window.performance.now();
      // This matches cubic-bezier(.16,1,.3,1) by solving x(t) for elapsed progress.
      const ease = progress => {
        if (progress <= 0) return 0;
        if (progress >= 1) return 1;
        let low = 0, high = 1, t = progress;
        for (let index = 0; index < 12; index++) {
          t = (low + high) / 2;
          const x = 3 * (1 - t) ** 2 * t * .16 + 3 * (1 - t) * t ** 2 * .3 + t ** 3;
          if (x < progress) low = t; else high = t;
        }
        return 1 - (1 - t) ** 3;
      };
      function draw(time) {
        frame = 0;
        if (done) return;
        if (!root.classList.contains('mc-intro-pending') || media.matches) { finish(); return; }
        const age = time - began;
        if (age >= 1300) { finish(); return; }
        const progress = Math.max(0, Math.min(1, (age - 200) / 1100));
        shell.style.clipPath = `circle(${(ease(progress) * radius).toFixed(2)}px at 50% 50%)`;
        if (context && !document.hidden) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, width, height);
          const fade = Math.min(1, progress * 6) * Math.max(0, 1 - Math.max(0, progress - .65) / .35);
          for (const dot of dots) {
            const ageSeconds = Math.max(0, (age - 200) / 1000 - dot.phase);
            const distance = dot.speed * ageSeconds;
            const x = width / 2 + Math.cos(dot.angle) * distance;
            const y = height / 2 + Math.sin(dot.angle) * distance * .8;
            context.globalAlpha = fade * .32;
            context.fillStyle = '#70e5db';
            context.beginPath();
            context.arc(x, y, dot.size, 0, Math.PI * 2);
            context.fill();
          }
          context.globalAlpha = 1;
        }
        frame = window.requestAnimationFrame(draw);
      }
      listen(window, 'keydown', event => { if (event.key === 'Escape') finish(); });
      listen(window, 'resize', resize);
      listen(window, 'pagehide', finish);
      listen(media, 'change', () => { if (media.matches) finish(); });
      listen(document, 'visibilitychange', () => {
        if (document.hidden) {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
        } else if (!done) frame = window.requestAnimationFrame(draw);
      });
      safetyTimer = window.setTimeout(finish, 1800);
      frame = window.requestAnimationFrame(draw);
    } catch {
      finish();
    }
  });
  running.set(shell, result);
  return result;
}
