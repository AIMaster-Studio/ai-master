const chapterSizes = Object.freeze({1:6,2:6,3:6,4:6,5:6,6:6,7:6,8:6,9:6,10:3});

export function nodeIdForLesson({chapter,index} = {}) {
  if (!Number.isInteger(chapter) || !Number.isInteger(index) || !chapterSizes[chapter] || index < 0 || index >= chapterSizes[chapter]) {
    throw new RangeError('Invalid course knowledge point.');
  }
  return `${chapter}_${index}`;
}

export function makeCanvasHref(view,node = null) {
  if (view !== 'local' && view !== 'network') throw new RangeError('Invalid canvas view.');
  const parameters = new URLSearchParams({view});
  if (node !== null) {
    const match = String(node).match(/^(\d+)_(\d+)$/);
    if (!match || nodeIdForLesson({chapter:Number(match[1]),index:Number(match[2])}) !== node) throw new RangeError('Invalid course knowledge point.');
    parameters.set('node',node);
  } else if (view === 'local') throw new RangeError('A local map requires a knowledge point.');
  return `/canvas/?${parameters}`;
}

function ensureEntryStyles() {
  if (document.getElementById('mind-canvas-entry-styles')) return;
  const stylesheet = document.createElement('link');
  stylesheet.id = 'mind-canvas-entry-styles';
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/assets/mind-canvas-entry.css?v=20260927';
  document.head.append(stylesheet);
}

export function mountMindCanvasEntries(container,context) {
  if (!container) return;
  const id = nodeIdForLesson(context);
  if (container.querySelector(`[data-mind-canvas-entry="${id}"]`)) return;
  ensureEntryStyles();
  const navigation = document.createElement('nav');
  navigation.className = 'mind-canvas-entry';
  navigation.dataset.mindCanvasEntry = id;
  navigation.setAttribute('aria-label','知识思维图入口');
  for (const [view,label,symbol] of [['local','查看思维图','canvas-book'],['network','全课程知识网','canvas-network']]) {
    const link = document.createElement('a');
    link.className = 'mc-entry-link';
    link.href = makeCanvasHref(view,id);
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href',`/canvas/icons.svg#${symbol}`);
    svg.append(use);
    const title = document.createElement('span');
    title.textContent = label;
    link.append(svg,title);
    navigation.append(link);
  }
  const header = container.querySelector(':scope > header, :scope > .lesson-hero, :scope > .series-hero, :scope > h3');
  if (header) header.insertAdjacentElement('afterend',navigation);
  else container.append(navigation);
}

export function mountChapterEntries() {
  const match = location.pathname.match(/^\/chapter\/(\d+)\/(?:index\.html)?$/);
  if (!match || !chapterSizes[Number(match[1])]) return;
  for (const section of document.querySelectorAll('[id^="kp-"]')) {
    const point = section.id.match(/^kp-(\d+)$/);
    if (!point) continue;
    const context = {chapter:Number(match[1]),index:Number(point[1])-1};
    if (context.index >= 0 && context.index < chapterSizes[context.chapter]) mountMindCanvasEntries(section,context);
  }
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mountChapterEntries,{once:true});
  else mountChapterEntries();
}
