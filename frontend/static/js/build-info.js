/**
 * AI Master — 构建标记（build marker）
 *
 * 目的（REVIEW.md R-006）：前端主端（GitHub Pages，push master 自动更新）与备用端
 * （Cloudflare，已冻结）会随时间分叉，但从外部无法判断"我现在看的是哪一版"。
 * 本脚本在页脚渲染一个 build 标记（commit short SHA + 构建时间）：
 *   - 主端每次 push 由 .github/workflows/pages.yml 改写下方第一行，标记会变化；
 *   - 冻结的备用端会一直停在旧值，一眼可辨分叉。
 *
 * 下方第一行的赋值格式被 workflow 以行为单位改写，请勿改动它的结构。
 */
window.AIMASTER_BUILD = { sha: "dev-local", builtAt: "" };

(function () {
  'use strict';
  function render() {
    if (!document.body || document.getElementById('aimaster-build-marker')) return;
    var info = window.AIMASTER_BUILD || {};
    var sha = info.sha || 'unknown';
    var el = document.createElement('div');
    el.id = 'aimaster-build-marker';
    el.setAttribute('data-build-sha', sha);
    el.setAttribute('data-build-at', info.builtAt || '');
    el.textContent = 'build ' + sha + (info.builtAt ? ' · ' + info.builtAt : '');
    el.style.cssText = [
      'position:fixed', 'right:10px', 'bottom:8px', 'z-index:2147483646',
      'padding:2px 8px', 'border-radius:999px',
      'font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#5b6472', 'background:rgba(255,255,255,.72)',
      'border:1px solid rgba(91,100,114,.25)', 'pointer-events:none', 'opacity:.75'
    ].join(';');
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
