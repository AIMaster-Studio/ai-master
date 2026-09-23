/* 动手实践工作台 · 渲染与状态引擎（零依赖，纯前端）
 * 数据：window.LABS（labs.js）
 * 存储：localStorage['ai-master-lab:<id>'] = JSON 表单状态
 * 路由：location.hash = '#<taskId>'
 * 布局：左栏题单 / 中栏按题目步骤分区填写 / 右栏常驻「产物 + 形式自检 + 导出」
 */
(function () {
  'use strict';
  var STORE_PREFIX = 'ai-master-lab:';
  var VERSION = 'labs v1 · 2026-09-18';
  var labs = Array.isArray(window.LABS) ? window.LABS : [];
  var current = null;
  var state = {};
  var saveTimer = null;
  var bound = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function byId(id) { return document.getElementById(id); }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function len(v) { return text(v).length; }
  function pad(n) { return String(n).padStart(2, '0'); }
  var util = { text: text, len: len, esc: esc };

  /* ---------- 存取 ---------- */
  function load(id) {
    try { return JSON.parse(localStorage.getItem(STORE_PREFIX + id) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function save() {
    if (!current) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var el = byId('savedAt');
      try {
        localStorage.setItem(STORE_PREFIX + current.id, JSON.stringify(state));
        if (el) el.textContent = '已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
      } catch (e) {
        if (el) el.textContent = '保存失败：浏览器拒绝写入 localStorage';
      }
    }, 250);
  }
  function rowsOf(key, n) {
    var arr = Array.isArray(state[key]) ? state[key] : [];
    while (arr.length < n) arr.push({});
    state[key] = arr;
    return arr;
  }

  /* ---------- 侧栏 ---------- */
  function renderList() {
    var host = byId('labList');
    var lastChap = null, html = '';
    labs.forEach(function (l) {
      if (l.chapter !== lastChap) {
        html += '<li class="chap">CH ' + pad(l.chapter) + '</li>';
        lastChap = l.chapter;
      }
      html += '<li><a href="#' + esc(l.id) + '"' + (current && current.id === l.id ? ' aria-current="page"' : '') + '>' +
        '<span class="tid">' + esc(l.id) + '</span>' + esc(l.short || l.title) + '</a></li>';
    });
    host.innerHTML = html;
  }

  /* ---------- 字段 ---------- */
  function fieldHtml(f) {
    var id = 'f-' + f.key;
    var head = '<label for="' + id + '">' + esc(f.label) + '</label>' +
      (f.sub ? '<div class="sub">' + esc(f.sub) + '</div>' : '');
    var val = state[f.key];
    if (f.type === 'textarea') {
      return '<div class="field">' + head +
        '<textarea id="' + id + '" data-key="' + esc(f.key) + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(val) + '</textarea>' +
        (f.min || f.max ? '<div class="count" data-count="' + esc(f.key) + '"></div>' : '') + '</div>';
    }
    if (f.type === 'select') {
      return '<div class="field">' + head +
        '<select id="' + id + '" data-key="' + esc(f.key) + '">' +
        '<option value="">— 请选择 —</option>' +
        (f.options || []).map(function (o) {
          return '<option value="' + esc(o) + '"' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select></div>';
    }
    if (f.type === 'rows') {
      var rows = rowsOf(f.key, f.count);
      var thead = '<tr><th>#</th>' + f.cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr>';
      var tbody = rows.map(function (r, i) {
        return '<tr><td>' + (f.rowLabels ? esc(f.rowLabels[i]) : pad(i + 1)) + '</td>' +
          f.cols.map(function (c) {
            var cid = id + '-' + i + '-' + c.key;
            var attrs = ' id="' + cid + '" data-key="' + esc(f.key) + '" data-row="' + i + '" data-col="' + esc(c.key) + '" aria-label="' + esc(c.label) + ' · ' + esc(f.rowLabels ? f.rowLabels[i] : '第 ' + (i + 1) + ' 行') + '"';
            if (c.type === 'select') {
              return '<td><select' + attrs + '><option value="">—</option>' + (c.options || []).map(function (o) {
                return '<option value="' + esc(o) + '"' + (r[c.key] === o ? ' selected' : '') + '>' + esc(o) + '</option>';
              }).join('') + '</select></td>';
            }
            if (c.type === 'text') {
              return '<td><input type="text"' + attrs + ' value="' + esc(r[c.key]) + '" placeholder="' + esc(c.placeholder || '') + '"></td>';
            }
            return '<td><textarea' + attrs + ' rows="2" placeholder="' + esc(c.placeholder || '') + '">' + esc(r[c.key]) + '</textarea></td>';
          }).join('') + '</tr>';
      }).join('');
      return '<div class="field"><div class="lbl">' + esc(f.label) + '</div>' +
        (f.sub ? '<div class="sub">' + esc(f.sub) + '</div>' : '') +
        '<table class="rows"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
    }
    if (f.type === 'derived') {
      return '<div class="field"><div class="lbl">' + esc(f.label) + '</div>' +
        (f.sub ? '<div class="sub">' + esc(f.sub) + '</div>' : '') +
        '<div class="derived" data-derived="' + esc(f.key) + '" aria-live="polite"></div></div>';
    }
    return '<div class="field">' + head +
      '<input type="text" id="' + id + '" data-key="' + esc(f.key) + '" value="' + esc(val) + '" placeholder="' + esc(f.placeholder || '') + '"></div>';
  }

  /* ---------- 主区 + 右栏 ---------- */
  function renderLab(lab) {
    current = lab;
    state = load(lab.id);
    var host = byId('labHost');
    var rail = byId('rail');

    var tags = '<div class="meta-row">' +
      '<a class="tag" href="../../hands-on/#' + esc(lab.id) + '">题目原文 ▸ hands-on/#' + esc(lab.id) + '</a>' +
      (lab.source ? '<a class="tag" href="' + esc(lab.source.href) + '">' + esc(lab.source.label) + '</a>' : '') +
      (lab.minutes ? '<span class="tag">约 ' + esc(lab.minutes) + ' 分钟</span>' : '') +
      '<span class="tag tag--ok">纯前端 · 不上传</span>' +
      (lab.external ? '<span class="tag tag--todo">' + esc(lab.external) + '</span>' : '') +
      '</div>';

    var sections = (lab.sections || []).map(function (s, i) {
      return '<section class="section" aria-labelledby="s' + i + '">' +
        '<div class="num" aria-hidden="true">' + pad(i + 1) + '</div>' +
        '<div class="body">' +
        '<h3 id="s' + i + '">' + esc(s.title) + '</h3>' +
        (s.hint ? '<p class="hint">' + esc(s.hint) + '</p>' : '') +
        (s.warn ? '<p class="warn-note"><strong>注意。</strong>' + esc(s.warn) + '</p>' : '') +
        (s.fields || []).map(fieldHtml).join('') +
        '</div></section>';
    }).join('');

    host.setAttribute('data-lab', '');
    host.innerHTML =
      '<p class="kicker">Hands-on Lab<b>CH ' + pad(lab.chapter) + ' · ' + esc(lab.id) + '</b></p>' +
      '<h1>' + esc(lab.title) + '</h1>' +
      '<p class="lead">' + esc(lab.intro) + '</p>' + tags +
      '<div class="sheet">' + sections + '</div>';
    host.setAttribute('data-lab', lab.id);

    rail.hidden = false;
    rail.innerHTML =
      '<h2>产物</h2>' +
      '<div class="score"><b id="scoreNum">0/0</b><span>项形式自检通过</span></div>' +
      (lab.artifact ? '<div class="rail-out"><span class="lbl">' + esc(lab.artifact.label) + '</span><div class="derived" data-derived="__artifact" aria-live="polite"></div></div>' : '') +
      '<h2>自检 · 对应「预期成果」与「反作弊检查」</h2>' +
      '<ul class="checks" id="checkList"></ul>' +
      '<p class="note">自检只做形式核对（是否填了、是否重复、是否对得上），不判断内容正确与否；内容对不对由你自己和同伴复核。</p>' +
      '<div class="actions">' +
        '<button type="button" class="primary" id="btnCopy">复制 Markdown 记录</button>' +
        '<button type="button" id="btnExport">显示 Markdown</button>' +
        '<button type="button" id="btnPrint">打印 / 存 PDF</button>' +
        '<button type="button" class="ghost" id="btnClear">清空本题</button>' +
        '<span class="saved" id="savedAt">未修改</span>' +
      '</div>' +
      '<div class="export" id="exportWrap" hidden><label class="sr-only" for="exportBox">导出的 Markdown</label><textarea id="exportBox" readonly></textarea></div>';

    if (!bound) {
      host.addEventListener('input', onInput);
      host.addEventListener('change', onInput);
      bound = true;
    }
    byId('btnExport').addEventListener('click', doExport);
    byId('btnCopy').addEventListener('click', doCopy);
    byId('btnPrint').addEventListener('click', function () { window.print(); });
    byId('btnClear').addEventListener('click', doClear);
    document.title = lab.id + ' ' + lab.title + ' · 动手实践工作台';
    refresh();
    renderList();
  }

  function onInput(e) {
    var el = e.target;
    var key = el.getAttribute('data-key');
    if (!key || !current) return;
    // 切换工作台时，被移除的聚焦元素可能补发 change：忽略不属于当前渲染的事件，避免串写状态
    if (byId('labHost').getAttribute('data-lab') !== current.id || !findField(key)) return;
    var row = el.getAttribute('data-row');
    if (row !== null) {
      var col = el.getAttribute('data-col');
      rowsOf(key, Number(row) + 1)[Number(row)][col] = el.value;
    } else {
      state[key] = el.value;
    }
    save();
    refresh();
  }

  /* ---------- 派生区 / 字数 / 自检 ---------- */
  function runCheck(c) {
    try { return !!c.test(state, util); } catch (err) { return false; }
  }
  function refresh() {
    if (!current) return;
    var nodes = document.querySelectorAll('[data-derived]');
    Array.prototype.forEach.call(nodes, function (n) {
      var key = n.getAttribute('data-derived');
      var f = key === '__artifact' ? current.artifact : findField(key);
      n.innerHTML = f && typeof f.render === 'function' ? f.render(state, esc) : '';
    });
    var counts = document.querySelectorAll('[data-count]');
    Array.prototype.forEach.call(counts, function (n) {
      var f = findField(n.getAttribute('data-count'));
      if (!f) return;
      var l = len(state[f.key]);
      var bad = (f.min && l < f.min) || (f.max && l > f.max);
      n.textContent = l + ' 字' + (f.min ? ' · 建议至少 ' + f.min + ' 字' : '') + (f.max ? ' · 上限 ' + f.max + ' 字' : '');
      n.className = 'count' + (bad ? ' bad' : '');
    });
    var checks = current.checks || [];
    var passed = 0;
    byId('checkList').innerHTML = checks.map(function (c) {
      var ok = runCheck(c);
      if (ok) passed++;
      return '<li class="' + (ok ? 'ok' : '') + '"><span class="st">' + (ok ? '通过' : '待完成') + '</span>' +
        '<span>' + esc(c.text) + (c.why ? '<span class="why">' + esc(c.why) + '</span>' : '') + '</span></li>';
    }).join('');
    var sc = byId('scoreNum');
    sc.textContent = passed + '/' + checks.length;
    sc.className = passed === checks.length && checks.length ? 'done' : '';
  }
  function findField(key) {
    var found = null;
    (current.sections || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) { if (f.key === key) found = f; });
    });
    return found;
  }

  /* ---------- 导出 ---------- */
  function plain(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent.trim();
  }
  function toMarkdown() {
    var lines = ['# ' + current.id + ' ' + current.title, '', '- 记录时间：' + new Date().toISOString(), '- 来源：AI Master 动手实践工作台（纯前端，未调用模型）', '- 题目原文：frontend/hands-on/#' + current.id, ''];
    (current.sections || []).forEach(function (s, i) {
      lines.push('## ' + pad(i + 1) + ' ' + s.title, '');
      (s.fields || []).forEach(function (f) {
        if (f.type === 'derived') {
          lines.push('### ' + f.label, '', '```', plain(f.render ? f.render(state, esc) : ''), '```', '');
        } else if (f.type === 'rows') {
          lines.push('### ' + f.label, '', '| # | ' + f.cols.map(function (c) { return c.label; }).join(' | ') + ' |', '|' + new Array(f.cols.length + 2).join('---|'));
          rowsOf(f.key, f.count).forEach(function (r, ri) {
            lines.push('| ' + (f.rowLabels ? f.rowLabels[ri] : ri + 1) + ' | ' + f.cols.map(function (c) { return text(r[c.key]).replace(/\|/g, '\\|').replace(/\n/g, ' ') || '—'; }).join(' | ') + ' |');
          });
          lines.push('');
        } else {
          lines.push('### ' + f.label, '', text(state[f.key]) || '（未填写）', '');
        }
      });
    });
    if (current.artifact) {
      lines.push('## 产物 · ' + current.artifact.label, '', '```', plain(current.artifact.render(state, esc)), '```', '');
    }
    var checks = current.checks || [];
    if (checks.length) {
      lines.push('## 形式自检', '');
      checks.forEach(function (c) { lines.push('- [' + (runCheck(c) ? 'x' : ' ') + '] ' + c.text); });
      lines.push('');
    }
    return lines.join('\n');
  }
  function doExport() {
    byId('exportBox').value = toMarkdown();
    byId('exportWrap').hidden = false;
  }
  function doCopy() {
    var md = toMarkdown();
    var done = function (ok) {
      byId('savedAt').textContent = ok ? '已复制 Markdown 到剪贴板' : '复制失败，请在下方文本框手动全选复制';
      if (!ok) doExport();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  }
  function doClear() {
    if (!window.confirm('清空本题在此浏览器中保存的全部填写内容？此操作不可撤销。')) return;
    localStorage.removeItem(STORE_PREFIX + current.id);
    renderLab(current);
    byId('savedAt').textContent = '已清空';
  }

  /* ---------- 路由 ---------- */
  function renderIndex(id) {
    current = null;
    renderList();
    byId('rail').hidden = true;
    var byChap = {};
    labs.forEach(function (l) { byChap[l.chapter] = (byChap[l.chapter] || 0) + 1; });
    byId('labHost').innerHTML =
      '<p class="kicker">Hands-on Labs</p><h1>动手实践工作台</h1>' +
      '<p class="lead">《动手实践操作题》里有一批题目的「从哪做」指向的是概念动画（prompt_cg、rag_cg 等）。动画负责讲概念，这里负责动手：按题目步骤把产物一项项填出来，右栏按「预期成果」和「反作弊检查」做形式自检，最后导出一份 Markdown 记录。</p>' +
      '<div class="intro-grid">' +
        '<div><b>' + labs.length + '</b><span>个工作台，对应 ' + Object.keys(byChap).length + ' 个章节</span></div>' +
        '<div><b>0</b><span>次网络请求：不上传、不调用模型、不需要账号</span></div>' +
        '<div><b>本机</b><span>填写内容存在浏览器 localStorage，换浏览器不会同步</span></div>' +
      '</div>' +
      (id ? '<div class="empty" style="margin-top:32px">未找到工作台「' + esc(id) + '」，请从左侧选择。</div>' : '');
    document.title = '动手实践工作台 · AI Master';
  }
  function route() {
    var id = location.hash.replace(/^#/, '');
    var lab = null;
    labs.forEach(function (l) { if (l.id === id) lab = l; });
    if (!lab) { renderIndex(id); return; }
    renderLab(lab);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  byId('version').textContent = VERSION;
  route();
})();
