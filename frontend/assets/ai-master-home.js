const video = document.querySelector('.hero-video');
const videoToggle = document.querySelector('.video-toggle');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.querySelector('.waitlist-dialog');
const form = document.querySelector('#waitlist-form');
const feedback = document.querySelector('.form-feedback');
const triggers = [...document.querySelectorAll('.nav-trigger')];
const navigation = document.querySelector('.nav-links');
const menuToggle = document.querySelector('.menu-toggle');
const mobileViewport = window.matchMedia('(max-width: 767px)');

function getAiMasterHref(path) {
  const base = window.AI_MASTER_BASE_URL;
  if (typeof base !== 'string') throw new Error('AI_MASTER_BASE_URL must be explicitly configured.');
  if (base === '') {
    const mountPoint = new URL('.', location.href);
    return new URL(path.replace(/^\/+/, ''), mountPoint).href;
  }
  const target = new URL(base);
  const isLoopback = hostname => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\./.test(hostname);
  const localPreview = location.protocol === 'file:' || isLoopback(location.hostname);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('AI_MASTER_BASE_URL must be an HTTP(S) origin or an empty string for same-site deployment.');
  }
  if (!localPreview && (isLoopback(target.hostname) || target.protocol !== 'https:')) {
    throw new Error('Production navigation requires an explicitly configured HTTPS content-site origin.');
  }
  return new URL(path, target.origin).href;
}
for (const link of document.querySelectorAll('[data-ai-path]')) {
  link.href = getAiMasterHref(link.dataset.aiPath);
}

function syncVideoControl() {
  const paused = video.paused;
  const label = paused ? 'Play background video' : 'Pause background video';
  videoToggle.setAttribute('aria-label', label);
  videoToggle.title = label;
  videoToggle.querySelector('.pause-icon').hidden = paused;
  videoToggle.querySelector('.play-icon').hidden = !paused;
}

function applyMotionPreference() {
  if (motionPreference.matches) video.pause();
  else video.play().catch(syncVideoControl);
  syncVideoControl();
}
video.addEventListener('play', syncVideoControl);
video.addEventListener('pause', syncVideoControl);
video.addEventListener('loadeddata', () => { if (motionPreference.matches) video.pause(); });
motionPreference.addEventListener('change', applyMotionPreference);
videoToggle.addEventListener('click', () => {
  if (video.paused) video.play().catch(syncVideoControl);
  else video.pause();
});
applyMotionPreference();

function closeMenus() {
  for (const trigger of triggers) {
    trigger.setAttribute('aria-expanded', 'false');
    document.getElementById(trigger.getAttribute('aria-controls')).hidden = true;
  }
}
function closeMobileNavigation() {
  closeMenus();
  navigation.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  closeMenus();
  menuToggle.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('is-open', open);
});
mobileViewport.addEventListener('change', closeMobileNavigation);
for (const trigger of triggers) {
  trigger.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') === 'true';
    closeMenus();
    if (!open) {
      trigger.setAttribute('aria-expanded', 'true');
      document.getElementById(trigger.getAttribute('aria-controls')).hidden = false;
    }
  });
}
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-links, .menu-toggle')) closeMobileNavigation();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const openTrigger = triggers.find(trigger => trigger.getAttribute('aria-expanded') === 'true');
    if (openTrigger) { closeMenus(); openTrigger.focus(); }
    else if (menuToggle.getAttribute('aria-expanded') === 'true') { closeMobileNavigation(); menuToggle.focus(); }
  }
});
navigation.addEventListener('focusout', event => {
  if (event.relatedTarget && !navigation.contains(event.relatedTarget) && event.relatedTarget !== menuToggle) closeMobileNavigation();
});
window.addEventListener('pageshow', closeMobileNavigation);
for (const button of document.querySelectorAll('[data-waitlist]')) {
  button.addEventListener('click', () => {
    closeMobileNavigation();
    feedback.hidden = true;
    form.reset();
    dialog.showModal();
  });
}
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  feedback.hidden = false;
});
