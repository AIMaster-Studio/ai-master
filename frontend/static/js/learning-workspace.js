(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const icon = name => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
  const renderIcons = () => {
    document.querySelectorAll('a[download]').forEach(link => {
      if (link.querySelector('[data-lucide],svg')) return;
      const label = link.textContent.trim();
      link.innerHTML = icon('download') + esc(label.startsWith('↓ ') ? label.slice(2) : label);
    });
    document.querySelectorAll('.icon-button[data-action="refresh-review"]').forEach(button => {
      if (!button.querySelector('[data-lucide],svg')) button.innerHTML = icon('refresh-cw');
    });
    if (window.lucide) window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = {state:{},user:{},catalog:[],status:{},view:'learn',moduleId:null,stage:'study',quiz:null,quizResult:null,diagnosticQuiz:null,diagnosticResult:null,reviews:[],reviewResults:{},busy:false,authMode:'login',memory:null,memoryError:'',rag:null,ragError:'',ragQuery:'',ragResults:null,ragKbId:'',research:null,researchResult:null,researchError:''};
  const main = $('#main-content');
  const dialog = $('#workspace-dialog');
  let toastTimer;

  // 客户端超时预算：不得早于服务端自己的预算，否则会在服务端仍在处理时先掐断连接，
  // 把「还在处理」误判成「后端不可用」。
  // 依据 server/ai-review.js:49 `AbortSignal.timeout(Number(process.env.AI_REVIEW_TIMEOUT_MS) || 60000)`：
  //   · 本机服务端预算默认 60000ms；
  //   · 公网 Netlify 端服务端在 25s 主动降级并返回 200，仍 < 60000ms；
  //   · 平台 30.00s 硬杀由服务端自己承担，客户端不应对其提前设限。
  // D-001 实测：原值 8000ms 让任何 >8s 的真实 AI 复评在浏览器端 100% 被 AbortError 掐断。
  const API_TIMEOUT_MS = 60000;
  // 只有「后端确实不可达」才允许降级到本地练习模式。超时与 HTTP 真实错误应答都不算——
  // 本地兜底状态里没有服务端的学习计划，一旦拿它整体重渲染，
  // 正在等待的讲解、学习航线与用户输入都会从界面上消失（D-001 P0）。
  async function api(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),API_TIMEOUT_MS);
    try {
      const response = await fetch('/api/' + path,{method:body === undefined ? 'GET' : 'POST',credentials:'same-origin',headers:body === undefined ? {} : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body),signal:controller.signal});
      // 后端正常应答时一律返回 JSON；拿不到 JSON 说明这个源没有可用的 API
      // （例如静态托管把 /api/* 当普通路径返回 HTML），这种情形才允许走本地模式。
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') throw Object.assign(new Error('当前无法连接学习服务，请检查网络后重试。'),{noApi:true});
      if (!response.ok || !data.ok) throw new Error(typeof data.error === 'string' ? data.error : '请求未完成，请稍后重试。');
      return data;
    } catch (error) {
      // 客户端超时：服务端可能仍在处理。明确提示并保留当前视图与用户输入，绝不降级。
      if (error && error.name === 'AbortError') throw new Error('等待模型复评超时，你的讲解已保留，可以再次提交。');
      // 连接被拒 / 断网（fetch 抛 TypeError）或该源没有可用 API 时，才降级到本地练习模式。
      const unreachable = error && (error.name === 'TypeError' || error.noApi === true);
      if (unreachable && window.LearningLocalAPI && window.LearningLocalAPI.canHandle(path)) {
        return window.LearningLocalAPI.handle(path, body);
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function toast(message, isError = false) {
    const element = $('#toast'); element.textContent = message; element.classList.toggle('error',isError); element.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; },isError ? 7500 : 4200);
  }
  function pet(state,message) {
    window.dispatchEvent(new CustomEvent('aimaster-pet-state',{detail:{state}}));
    if (message) $('#companion-message').textContent = message;
  }
  async function task(button,action) {
    if (app.busy) return;
    app.busy = true;
    const label = button && button.innerHTML;
    const replaceLabel = button && !button.dataset.view && !button.classList.contains('icon-button');
    if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); if (replaceLabel) button.textContent = '处理中…'; }
    try { await action(); }
    catch (error) {
      toast(error.message || '暂时未能完成，请重试。',true);
      const target = dialog.open ? $('.dialog-error',dialog) : null;
      if (target) target.textContent = error.message;
    } finally {
      app.busy = false;
      if (button && button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); if (replaceLabel) button.innerHTML = label; }
    }
  }
  const modules = () => app.state.plan && Array.isArray(app.state.plan.modules) ? app.state.plan.modules : [];
  const moduleById = id => app.catalog.find(item => item.id === id);
  const progress = id => (app.state.progress || {})[id] || {};
  const current = () => moduleById(app.moduleId);
  const date = value => value ? new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '—';
  const modeLabel = mode => mode === 'ai' ? 'AI 复评' : mode === 'fallback-local' || mode === 'fallback' ? '本地反馈 · AI 暂不可用' : '本地练习';
  const draftKey = id => 'aimaster-learning-draft:' + (app.user.id || 'guest') + ':' + id;
  function readDraft(id) { try { return localStorage.getItem(draftKey(id)) || ''; } catch (_) { return ''; } }
  function saveDraft(id,value) { try { localStorage.setItem(draftKey(id),value); } catch (_) {} }
  function applyState(data) {
    if (data.state) app.state = data.state;
    if (data.user) app.user = data.user;
    if (!modules().includes(app.moduleId) && !progress(app.moduleId).completedAt) app.moduleId = modules().find(id => !progress(id).completedAt) || modules()[0] || null;
  }
  function safeUrl(value,fallback = '#') {
    try { const url = new URL(value,location.href); return ['http:','https:'].includes(url.protocol) ? url.href : fallback; } catch (_) { return fallback; }
  }
  function renderChrome() {
    const ai = app.status.ai || {};
    $('#ai-status').innerHTML = '<span class="status-dot"></span><span>' + (ai.configured ? 'AI 复评已配置' : '本地练习') + '</span>';
    $('#ai-status').classList.toggle('ai',!!ai.configured);
    $('#ai-status').title = ai.configured ? '模型：' + (ai.model || '已配置') : '配置模型复评';
    $('#account-button').textContent = app.user.isGuest !== false ? '访客档案' : app.user.name || '我的档案';
    const storage = app.status.storage;
    const storageLabel = storage ? (storage.learningPersistent ? '服务端学习记录' : '临时记录 · 可能丢失') : (app.status.mode === 'local' ? '本地练习记录' : '存储方式待核验');
    $('#storage-status').textContent = (app.user.isGuest !== false ? '访客' : app.user.name || '账号') + ' · ' + storageLabel;
    $('#storage-status').title = storage && storage.warning || '请导出重要学习记录；登录状态不等于持久化保障。';
    const done = modules().filter(id => progress(id).completedAt).length;
    $('#route-progress').textContent = done + ' / ' + modules().length;
    $('#route-progress-bar').max = modules().length || 1; $('#route-progress-bar').value = done;
    const wrong = app.state.wrongAnswers || [];
    $('#review-count').textContent = Array.isArray(wrong) ? wrong.filter(item => !item.resolved && !item.resolvedAt).length : Object.keys(wrong).length;
    document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('selected',button.dataset.view === app.view); button.setAttribute('aria-current',button.dataset.view === app.view ? 'page' : 'false'); });
    $('#route-list').innerHTML = modules().length ? modules().map((id,index) => {
      const item = moduleById(id); if (!item) return '';
      const p = progress(id);
      const locked = !p.completedAt && modules().slice(0,index).some(key => !progress(key).completedAt);
      return '<button type="button" class="route-item' + (app.moduleId === id ? ' active' : '') + (p.completedAt ? ' done' : '') + '" data-module="' + esc(id) + '"' + (locked ? ' disabled title="完成前一节后解锁"' : '') + '><span class="route-index">' + (p.completedAt ? '✓' : String(index+1).padStart(2,'0')) + '</span><span>' + esc(item.title) + '<small>' + (p.completedAt ? '已通关' : locked ? '待解锁' : p.explanation ? '继续练习' : '待学习') + '</small></span></button>';
    }).join('') : '<p class="muted small">尚未建立学习计划</p>';
  }
  function planForm(inDialog = false) {
    const p = app.state.profile || {};
    const option = (value,label,selected) => '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
    return '<form id="' + (inDialog ? 'plan-dialog-form' : 'plan-form') + '"><div class="form-grid"><label class="field full">学习目标<input name="goal" maxlength="180" required value="' + esc(p.goal || '掌握 RAG，做一个有依据的知识问答助手') + '" placeholder="例如：理解大模型，完成一个 RAG 知识助手"></label><label class="field">当前基础<select name="level">' + option('beginner','刚开始学习 AI',p.level || 'beginner') + option('basic','了解基础概念',p.level) + option('experienced','有开发或项目经验',p.level) + '</select></label><label class="field">每天投入<select name="dailyMinutes">' + [30,45,60,90].map(n => option(n,n + ' 分钟',p.dailyMinutes || 30)).join('') + '</select></label><label class="field full">目标日期（选填）<input type="date" name="deadline" value="' + esc(p.deadline || '') + '"></label></div><div class="form-footer"><span class="muted">' + (inDialog ? '已完成的学习记录将保留。' : '档案保存在当前电脑。') + '</span><button type="submit" class="primary">' + (app.state.plan ? '更新学习计划' : '建立学习计划') + ' →</button></div><p class="dialog-error" role="alert"></p></form>';
  }
  function renderSetup() {
    main.innerHTML = '<div class="setup-intro"><p class="eyebrow">你的第一条学习航线</p><h1>开始讲解通关</h1><p>学习目标：能用自己的话解释 AI 概念，并完成实际情境中的判断。</p></div><div class="setup-diagnostic"><div><h3>基础诊断</h3><p>' + (app.state.diagnostic ? '已完成诊断，结果将用于安排学习航线。' : '先确认起点，找到当前需要补齐的概念。') + '</p></div><button type="button" data-action="diagnostic">' + (app.state.diagnostic ? '重新诊断' : '开始诊断') + '</button></div>' + planForm();
  }
  function render() {
    renderChrome();
    try {
    if (app.view === 'review') return renderReviews();
    if (app.view === 'records') return renderRecords();
    if (app.view === 'memory') return renderMemory();
    if (app.view === 'rag') return renderRag();
    if (app.view === 'research') return renderResearch();
    if (!app.state.plan || !current()) return renderSetup();
    renderLesson();
    } finally { renderIcons(); }
  }
  function renderLesson() {
    const item = current(); if (!item) return renderSetup();
    const p = progress(item.id);
    const lessonLabel = modules().includes(item.id) ? '今日学习 / ' + String(modules().indexOf(item.id)+1).padStart(2,'0') + ' · ' + String(modules().length).padStart(2,'0') : '历史课程复习';
    main.innerHTML = '<header class="page-heading"><div><p class="eyebrow">' + lessonLabel + '</p><h1>' + esc(item.title) + '</h1><p>' + esc(app.state.plan.title || '我的学习航线') + ' · 每天 ' + esc(app.state.plan.dailyMinutes) + ' 分钟</p></div><div class="heading-actions"><button type="button" data-action="plan" title="调整学习计划">调整计划</button><button type="button" data-action="diagnostic">基础诊断</button></div></header><div class="module-meta"><span class="badge">' + esc(Array.isArray(item.bloom) ? item.bloom.join(' · ') : item.bloom || '理解与应用') + '</span>' + (p.completedAt ? '<span class="badge green">已通关</span>' : '<span class="badge amber">学习中</span>') + '</div><p class="objective">' + esc(item.objective) + '</p><div class="stage-tabs" role="tablist" aria-label="学习步骤">' + [['study','阅读学习'],['explain','自己讲解'],['quiz','测验通关']].map(([id,label],n) => '<button type="button" role="tab" aria-selected="' + (app.stage === id) + '" class="' + (app.stage === id ? 'selected' : '') + '" data-stage="' + id + '"><span class="step-circle">' + (id === 'explain' && p.explanation && p.explanation.accepted || id === 'quiz' && p.quiz && p.quiz.passed ? '✓' : n+1) + '</span>' + label + '</button>').join('') + '</div><section class="stage-panel" id="stage-panel" role="tabpanel">' + (app.stage === 'study' ? studyPanel(item) : app.stage === 'explain' ? explainPanel(item,p) : quizPanel(item,p)) + '</section>';
  }
  function planSummary(item) {
    const plan = app.state.plan || {};
    const session = (plan.schedule || []).find(entry => entry.moduleId === item.id);
    return '<div class="plan-summary"><span>预计 ' + esc(plan.estimatedDays || '—') + ' 天完成</span>' + (session ? '<span>本节约 ' + esc(session.minutes) + ' 分钟</span><span>第 ' + esc(session.startDay) + (session.endDay !== session.startDay ? '–' + esc(session.endDay) : '') + ' 天</span>' + (session.reinforcementMinutes ? '<span class="reinforcement">诊断补习 +' + esc(session.reinforcementMinutes) + ' 分钟</span>' : '') : '') + '</div><details class="plan-reason"><summary>本次航线安排</summary><p>' + esc(plan.reason || '') + '</p></details>';
  }
  function studyPanel(item) {
    const summary = Array.isArray(item.summary) ? item.summary.join('\n\n') : item.summary || '';
    return planSummary(item) + '<h2>本节要点</h2><div class="summary">' + esc(summary) + '</div><ul class="concepts">' + (item.concepts || []).map(c => '<li>' + esc(c.label) + '</li>').join('') + '</ul><a class="study-link" href="' + esc(safeUrl(item.learnUrl)) + '" target="_blank" rel="noopener">进入完整课程 ↗</a><div class="section-band" style="margin-top:24px"><h3>讲解任务</h3><p class="explanation-prompt">' + esc(item.prompt) + '</p><button type="button" class="primary" data-stage="explain">开始自己的讲解 →</button></div>';
  }
  function explainPanel(item,p) {
    const saved = readDraft(item.id) || (p.explanation && p.explanation.text) || '';
    return '<h2>换成自己的话，说清楚</h2><p class="explanation-prompt">' + esc(item.prompt) + '</p><form id="explanation-form"><label class="field" for="explanation-text">我的讲解<textarea id="explanation-text" name="text" required minlength="20" maxlength="6000" placeholder="从概念开始，说明它为什么这样工作，再给出一个具体例子和它的局限。">' + esc(saved) + '</textarea></label><div class="form-footer"><span class="muted" id="draft-status">' + saved.length + ' / 6000 字 · 草稿保存在此浏览器</span><button type="submit" class="primary">提交讲解</button></div></form>' + (!(app.status.ai || {}).configured ? '<p class="notice">当前为本地练习，检查表达覆盖与基础规则，不代表模型已理解你的讲解。通关还需通过客观测验。</p>' : '') + (p.quiz ? '<p class="small muted" style="margin-top:12px">重新提交讲解后，需要重新测验。</p>' : '') + (p.explanation ? feedbackPanel(p.explanation) : '');
  }
  // 把「这次评审依据了哪些课程原文」显式展示出来 —— 这是证据驱动复评唯一对学习者可见的产出。
  // 刻意区分三种状态（无证据 / 引用复核失败 / 有证据），避免把「没证据」显示得像「有证据」。
  function evidencePanel(result) {
    const grounding = result.grounding || {};
    const evidence = Array.isArray(result.evidence) ? result.evidence : [];
    const cited = new Set(Array.isArray(result.citations) ? result.citations : []);
    if (result.evidenceIntegrity === 'fabricated-reference') {
      return '<div class="evidence evidence-warn"><strong>证据引用复核未通过</strong><p class="small">模型引用了本次检索中不存在的编号，这次评审结果不可采信，未计入通过。</p></div>';
    }
    // 未走模型时（模型未配置，或本地规则直接没放行），证据根本不会被使用。
    // 这时**不能**显示成「没有证据」—— 课程库可能好端端地检索到了一堆证据，只是这次判定没走模型。
    // 把两种情况混为一谈，会让读者以为课程库是空的，从而去修一个并不存在的问题。
    if (result.mode === 'local') {
      return '<div class="evidence evidence-none"><strong>本次判定来自本地规则，未使用课程证据</strong>'
        + '<p class="small">本地规则是完整性筛查，不做语义判断，因此不引用证据。'
        + (grounding.evidenceCount ? '本次实际检索到 ' + esc(grounding.evidenceCount) + ' 条课程证据，但没有送入模型。' : '')
        + '</p></div>';
    }
    if (!evidence.length) {
      return '<div class="evidence evidence-none"><strong>本次没有可引用的课程证据</strong><p class="small">' + esc(grounding.reason || '课程知识库尚未建立，或本模块没有检索到相关内容。') + '本次判定基于模型自身知识，依据强度低于有证据的评审。</p></div>';
    }
    return '<div class="evidence"><strong>依据的课程证据</strong><ul class="evidence-list">' + evidence.map(item => '<li' + (cited.has(item.ref) ? ' class="cited"' : '') + '><span class="evidence-ref">' + esc(item.ref) + (cited.has(item.ref) ? ' · 已引用' : '') + '</span><span class="evidence-title">' + esc(item.title || '') + '</span><span class="evidence-path">' + esc(item.source || '') + '</span></li>').join('') + '</ul><p class="small muted">引用复核只能确认编号真实存在，不能确认结论被证据支持。</p></div>';
  }

  function feedbackPanel(result) {
    const feedback = Array.isArray(result.feedback) ? result.feedback.join('；') : result.feedback;
    return '<div class="feedback"><div class="feedback-title"><strong>' + (result.accepted ? '讲解练习已通过' : result.mode === 'fallback-local' || result.mode === 'fallback' ? 'AI 复评暂未完成' : '再完善一下讲解') + '</strong><span class="badge ' + (result.accepted ? 'green' : 'amber') + '">' + esc(modeLabel(result.mode)) + '</span></div><p class="small">' + esc(feedback || (result.accepted ? '继续完成测验。' : '请依据下方反馈修订。')) + '</p><ul class="checks">' + (result.checks || []).map(c => '<li class="check' + (c.pass ? ' pass' : '') + '"><strong>' + (c.pass ? '✓ ' : '○ ') + esc(c.label) + '</strong><span>' + esc(c.detail) + '</span></li>').join('') + '</ul>' + (result.followUp ? '<div class="follow-up"><strong>再想一层</strong><br>' + esc(Array.isArray(result.followUp) ? result.followUp.join('；') : result.followUp) + '</div>' : '') + evidencePanel(result) + (result.accepted ? '<div class="button-row" style="margin-top:18px"><button type="button" class="primary" data-stage="quiz">进入测验 →</button></div>' : '') + '</div>';
  }
  function questionsHtml(quiz,result) {
    return quiz.questions.map((q,index) => {
      const answer = result && (result.items || []).find(item => item.id === q.id);
      return '<fieldset class="quiz-question"><legend>' + (index+1) + '. ' + esc(q.prompt || q.question) + '</legend><div class="quiz-options">' + (q.options || []).map((option,i) => '<label class="quiz-option"><input type="radio" name="q:' + esc(q.id) + '" value="' + i + '" required' + (answer && answer.selected === i ? ' checked' : '') + (result ? ' disabled' : '') + '><span>' + String.fromCharCode(65+i) + '. ' + esc(option) + '</span></label>').join('') + '</div>' + (answer ? '<div class="answer-detail' + (answer.correct ? ' correct' : '') + '"><strong>' + (answer.correct ? '✓ 回答正确' : '正确答案：' + String.fromCharCode(65+Number(answer.answer))) + '</strong>' + esc(answer.explanation) + '</div>' : '') + (q.source && q.source.url ? '<a class="quiz-source" href="' + esc(safeUrl(q.source.url)) + '" target="_blank" rel="noopener">参考：' + esc(q.source.title || '课程资料') + ' ↗</a>' : '') + '</fieldset>';
    }).join('');
  }
  function quizPanel(item,p) {
    const accepted = p.explanation && p.explanation.accepted;
    const passed = p.quiz && p.quiz.passed;
    let html = '<div class="section-header"><h2>情境测验</h2><span class="badge">通过线 75%</span></div>';
    if (!accepted && !p.completedAt) return html + '<p class="muted small">先完成本节讲解，再开始通关测验。</p><button type="button" class="primary" data-stage="explain">返回讲解 →</button>';
    if (app.quiz && app.quiz.moduleId === item.id) {
      html += '<form id="quiz-form">' + questionsHtml(app.quiz,app.quizResult) + '<div class="form-footer">' + (app.quizResult ? '<div><span class="result-score">' + esc(app.quizResult.score) + '%</span><span class="muted small"> · ' + esc(app.quizResult.correct) + ' / ' + esc(app.quizResult.total) + ' 题正确</span></div><button type="button" data-action="start-quiz">重新测验</button>' : '<span class="muted">' + (Number.isInteger(app.quiz.attemptsRemaining) ? '今日还可开始测验 ' + esc(app.quiz.attemptsRemaining) + ' 次。' : '所有题目作答后提交。') + '</span><button type="submit" class="primary">提交测验</button>') + '</div></form>';
    } else html += '<p class="small muted">' + (p.quiz ? '上次测验：' + esc(p.quiz.score) + '%。' : '用具体情境检验刚刚学到的概念。') + '</p><button type="button" class="primary" data-action="start-quiz">' + (p.quiz ? '重新测验' : '开始测验') + '</button>';
    html += '<section class="section-band" style="margin-top:26px"><h2>本节通关</h2><ul class="requirements"><li><span>讲解练习</span><span>' + (accepted ? '✓ 已通过' : '待通过') + '</span></li><li><span>客观测验 ≥ 75%</span><span>' + (passed ? '✓ 已通过' : '待通过') + '</span></li></ul>';
    if (p.completedAt) html += '<div class="completion-summary"><span class="completion-icon" aria-hidden="true">✓</span><div><h3>这一个概念，已留下你的理解</h3><p>通关于 ' + date(p.completedAt) + (p.dueAt ? ' · 复习时间 ' + date(p.dueAt) : '') + '</p></div></div><button type="button" class="primary" data-action="next-module">继续下一节 →</button>';
    else html += '<button type="button" class="success" data-action="complete"' + (!(accepted && passed) ? ' disabled' : '') + '>完成本节通关 ✓</button>';
    return html + '</section>';
  }
  function renderRecords() {
    const attempts = Array.isArray(app.state.attempts) ? app.state.attempts : [];
    const done = Object.values(app.state.progress || {}).filter(item => item.completedAt).length;
    const quizzes = attempts.filter(item => item.type === 'quiz' || item.kind === 'quiz' || item.result && item.result.total);
    main.innerHTML = '<header class="page-heading"><div><p class="eyebrow">留下真实的学习过程</p><h1>学习记录</h1><p>' + esc(app.user.isGuest !== false ? '访客档案' : app.user.name) + ' · 本机保存</p></div></header><div class="metric-grid"><div class="metric"><strong>' + done + '</strong><span>已通关模块</span></div><div class="metric"><strong>' + attempts.length + '</strong><span>累计练习记录</span></div><div class="metric"><strong>' + quizzes.length + '</strong><span>客观测验记录</span></div></div><h2>记录导出</h2><div class="export-links"><button type="button" class="button-link" data-action="export-json">↓ 学习档案 JSON</button></div><p class="small muted" style="margin-top:10px">只包含当前档案的实际作答与反馈。</p><section class="section-band"><h2>最近练习</h2>' + (attempts.length ? '<div class="table-wrap"><table class="record-table"><thead><tr><th>学习内容</th><th>练习</th><th>结果</th><th>时间</th></tr></thead><tbody>' + attempts.slice().reverse().slice(0,40).map(a => {
      const r = a.result || a; const kind = a.type || a.kind || (r.total ? 'quiz' : 'explanation'); const item = moduleById(a.moduleId); const isQuiz = kind === 'quiz' || kind === 'diagnostic' || r.total;
      return '<tr><td>' + esc(item ? item.title : kind === 'diagnostic' || a.mode === 'diagnostic' ? '基础诊断' : kind === 'plan' ? a.goal || '学习航线' : '学习练习') + '</td><td>' + (kind === 'plan' ? '计划调整' : kind === 'complete' ? '通关' : kind === 'review' ? '错题复习' : isQuiz ? '客观测验' : '讲解') + '</td><td>' + (kind === 'plan' ? '已保存' : kind === 'complete' ? '✓ 已完成' : isQuiz ? esc(r.score == null ? '—' : r.score + '%') : esc(modeLabel(r.mode))) + '</td><td>' + date(a.createdAt || a.at || a.timestamp) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty-state"><p>还没有练习记录。</p><button type="button" data-view="learn">开始学习</button></div>') + '</section>';
  }
  function renderReviews() {
    const due = Object.entries(app.state.progress || {}).filter(([,p]) => p.completedAt && p.dueAt && new Date(p.dueAt).getTime() <= Date.now());
    main.innerHTML = '<header class="page-heading"><div><p class="eyebrow">把薄弱处，变成下一次的把握</p><h1>错题与复习</h1><p>' + app.reviews.length + ' 道待巩固题目 · ' + due.length + ' 节到期复习</p></div><button type="button" class="icon-button" title="刷新复习列表" aria-label="刷新复习列表" data-action="refresh-review">↻</button></header>' + (due.length ? '<section class="section-band"><h2>到期复习</h2>' + due.map(([id]) => '<div class="section-header"><span>' + esc((moduleById(id) || {}).title || id) + '</span><button type="button" data-module="' + esc(id) + '">重温与测验</button></div>').join('') + '</section>' : '') + '<section class="section-band"><h2>错题巩固</h2>' + (app.reviews.length ? app.reviews.map((entry,index) => {
      const q = entry.question && typeof entry.question === 'object' ? entry.question : entry; const id = q.id || entry.questionId; const r = app.reviewResults[id];
      return '<form class="review-item" data-review-form="' + esc(id) + '"><h3>' + (index+1) + '. ' + esc(q.prompt || q.question || entry.prompt) + '</h3><div class="quiz-options">' + (q.options || entry.options || []).map((option,i) => '<label class="quiz-option"><input type="radio" name="answer" value="' + i + '" required' + (r ? ' disabled' : '') + '><span>' + esc(option) + '</span></label>').join('') + '</div>' + (r ? '<p class="notice ' + (r.correct ? 'success' : '') + '">' + (r.correct ? '✓ 回答正确。' : '再巩固一次。') + esc(r.explanation || r.feedback || '') + '</p><button type="button" data-action="refresh-review">继续复习</button>' : '<button type="submit">提交复习</button>') + '</form>';
    }).join('') : '<div class="empty-state"><h3>暂时没有待巩固错题</h3><p>完成测验后，答错的题目会出现在这里。</p><button type="button" data-view="learn">返回学习</button></div>') + '</section>';
  }
  // 学习记忆视图。
  // 这个页面的设计要点是**不能让人以为它比实际更聪明**，所以两件事写在正文而不是脚注里：
  //   ① L2/L3 是确定性聚合（计数与比例），不是模型摘要，没有语义归纳能力；
  //   ② 数据只在这台电脑，不跨设备同步。
  // 另外 L3 是**按需生成**的，不是自动跑 —— 页面上必须让人看见「还没生成」这个状态，
  // 否则空白会被误读成「你的记忆是空的」。
  async function loadMemory() {
    try { app.memory = await api('memory/inspect'); app.memoryError = ''; }
    catch (error) { app.memory = null; app.memoryError = (error && error.message) || '记忆读取失败。'; }
  }
  // 记忆图谱：L3 综合 → 各 L2 记忆面，连线粗细 = 该面的事件数。
  //
  // 两点刻意的选择：
  //   ① 用内联 SVG 而不是引图表库 —— 前端没有构建步骤，为一张十来节点的图加依赖不划算；
  //   ② **没有事件的面照样画出来（灰显）**，而不是隐藏。隐藏会让「这个面还没数据」
  //      和「这个面不存在」看起来一样；灰显本身是信息。
  // 线宽用 log2 缩放：事件数从 1 到 100 跨度很大，线性会让 1 条的线细到看不见。
  function memoryGraphHtml(graph) {
    const nodes = (graph && graph.nodes) || [];
    const root = nodes.find(node => node.id === 'L3');
    const surfaces = nodes.filter(node => node.id !== 'L3');
    if (!root || !surfaces.length) return '';
    if (!root.events) return '<p class="muted">还没有事件轨迹，暂无可视化的记忆图谱。完成一次讲解或测验后，这里会出现。</p>';

    const weights = new Map((graph.edges || []).map(edge => [edge.to, edge.weight]));
    const W = 640;
    const pad = 14;
    const gap = 10;
    const rootW = 200;
    const rootH = 44;
    const boxH = 52;
    const topY = 12;
    const rowY = topY + rootH + 44;
    const H = rowY + boxH + 14;
    const boxW = (W - pad * 2 - gap * (surfaces.length - 1)) / surfaces.length;
    const centerX = W / 2;

    let svg = '<svg class="memory-graph" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" '
      + 'aria-label="记忆图谱：L3 综合由各 L2 记忆面汇总，连线粗细表示事件数">';
    surfaces.forEach((surface, index) => {
      const weight = weights.get(surface.id) || 0;
      if (!weight) return;
      const x = pad + index * (boxW + gap) + boxW / 2;
      const width = Math.max(1, Math.min(4, 1 + Math.log2(weight + 1)));
      svg += '<line x1="' + centerX + '" y1="' + (topY + rootH) + '" x2="' + x.toFixed(1) + '" y2="' + rowY + '" '
        + 'stroke="#8bafda" stroke-width="' + width.toFixed(2) + '" opacity="0.6"/>';
    });
    svg += '<rect x="' + (centerX - rootW / 2) + '" y="' + topY + '" width="' + rootW + '" height="' + rootH + '" rx="7" fill="#eef4fc" stroke="#b9d0e8" stroke-width="0.5"/>'
      + '<text x="' + centerX + '" y="' + (topY + 18) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#1f5abb">L3 综合</text>'
      + '<text x="' + centerX + '" y="' + (topY + 33) + '" text-anchor="middle" font-size="10" fill="#6b7d8c">' + esc(root.events) + ' 条事件汇总</text>';
    surfaces.forEach((surface, index) => {
      const weight = weights.get(surface.id) || 0;
      const x = pad + index * (boxW + gap);
      const dim = weight ? '' : ' opacity="0.55"';
      svg += '<g' + dim + '><rect x="' + x.toFixed(1) + '" y="' + rowY + '" width="' + boxW.toFixed(1) + '" height="' + boxH + '" rx="6" fill="'
        + (weight ? '#ffffff' : '#f4f6f8') + '" stroke="' + (weight ? '#b9d0e8' : '#dde3e8') + '" stroke-width="0.5"/>'
        + '<text x="' + (x + boxW / 2).toFixed(1) + '" y="' + (rowY + 20) + '" text-anchor="middle" font-size="11" fill="' + (weight ? '#33475a' : '#8b969f') + '">'
        + esc(surface.label) + '</text>'
        + '<text x="' + (x + boxW / 2).toFixed(1) + '" y="' + (rowY + 36) + '" text-anchor="middle" font-size="10" fill="#8b969f">'
        + (weight ? esc(weight) + ' 条 · ' + esc(surface.dates) + ' 天' : '暂无数据') + '</text></g>';
    });
    svg += '</svg>';
    return svg + '<p class="small muted">连线粗细按事件数取对数缩放。灰显的记忆面表示尚无数据 —— 不是不存在。</p>';
  }
  function renderMemory() {
    const head = '<header class="page-heading"><div><p class="eyebrow">学习记忆与显式偏好</p><h1>学习记忆</h1>';
    if (app.memoryError) {
      main.innerHTML = head + '</div></header><div class="notice error">' + esc(app.memoryError) + '<br>记忆由本机后端提供；静态模式（没有后端）下不可用，这不影响学习流程。</div>';
      return;
    }
    if (!app.memory) { main.innerHTML = '<div class="loading-state"><span class="loading-spinner"></span><p>正在读取学习记忆…</p></div>'; return; }
    const memory = app.memory.memory || {};
    const surfaces = memory.surfaces || [];
    const l3 = (memory.l3 || []).filter(item => item && item.markdown);
    // 「有没有事件」是这一页唯一的空判据，且必须用 l1Total，不能用 surfaces.length：
    // surfaces 是**全部已登记的记忆面**（无活动时 events 为 0），长度恒等于面数、永不为 0。
    // 原先的空分支写成 surfaces.length 的反面，因此永远不会出现 —— 走查看到的「5 个面全空」
    // 才是真实渲染结果，而那一屏没有任何指向「去做什么会产生记录」的入口（2026-09-15 走查待办 3）。
    const hasEvents = Number(memory.l1Total || 0) > 0;
    const noActivityHtml = '<div class="empty-state"><p>还没有任何学习活动记录。L2 事实与 L3 综合都从 L1 事件派生 —— 没有事件，就没有可聚合的依据。</p>'
      + '<button type="button" class="primary" data-view="learn">去完成一次讲解</button></div>';
    main.innerHTML = head + '<p>' + esc(memory.l1Total || 0) + ' 条事件轨迹 · ' + esc(surfaces.length) + ' 个记忆面</p></div>' +
      '<button type="button" class="icon-button" title="刷新记忆" aria-label="刷新记忆" data-action="refresh-memory">↻</button></header>' +
      '<div class="notice">' + esc(memory.notice || '') +
        '<br>L2/L3 由事件轨迹<strong>确定性聚合</strong>（计数与比例），不是模型摘要，也没有语义归纳能力 —— 它不会得出「你偏好类比式讲解」这类结论。' +
        '<br>' + esc(app.status.storage && app.status.storage.warning || '记忆保存位置由后端决定，尚未核验跨实例持久化。') + '；清空全部学习记忆仍需管理权限。</div>' +
      '<section class="section-band"><h2>记忆图谱</h2>' + memoryGraphHtml(app.memory.graph) + '</section>' +
      '<section class="section-band"><h2>记忆面（L1 → L2）</h2>' + surfaces.map(item =>
        '<div class="memory-surface"><div class="memory-surface-head"><strong>' + esc(item.label) + '</strong>' +
        '<span class="muted small">' + esc(item.events) + ' 条事件' + (item.dates ? ' · 覆盖 ' + esc(item.dates) + ' 天' : '') + '</span></div>' +
        '<p class="small muted">' + esc(item.describe || '') + '</p>' +
        (item.l2 ? '<details><summary>查看 L2 事实</summary><pre class="memory-md">' + esc(item.l2) + '</pre></details>'
                 : '<p class="small muted">还没有 L2 事实 —— 该面尚无活动记录。</p>') + '</div>').join('')
        + (hasEvents ? '' : noActivityHtml) + '</section>' +
      '<section class="section-band"><h2>跨面综合（L3）</h2>' + (l3.length ? l3.map(item =>
        '<details class="memory-l3"><summary>' + esc(item.slot) + '</summary><pre class="memory-md">' + esc(item.markdown) + '</pre></details>').join('')
        : hasEvents
          ? '<p class="muted">还没有生成 L3 综合。L3 <strong>按需生成</strong>，不会自动运行 —— 空白不代表你没有学习记录。</p><button type="button" class="primary" data-action="synthesize-memory">按当前 L2 事实生成</button>'
          // 零事件时不给生成按钮：在零事件上生成的综合是一份「0 次、通过率 0%」的文件，
          // 容易被读成「学得不好」，而实际情况是「还没开始」。这里给出的是下一步，不是一步无效操作。
          : '<p class="muted">还没有 L1 事件，L3 没有可汇总的依据，因此这里不提供生成按钮 —— 在零事件上生成的综合只会是一份全 0 的空文件，容易被误读成学习结果不佳。先完成一次讲解或测验。</p>') + '</section>' +
      '<section class="section-band"><h2>显式偏好</h2>' + (memory.preferences
        ? '<pre class="memory-md">' + esc(memory.preferences) + '</pre>'
        : '<p class="muted">尚未写入偏好。偏好只能显式写入，既不参与自动综合，也不会被 L3 生成覆盖。</p>') +
        '<label for="preference-text">填写新的学习偏好（保存后替换上方记录，最多 2000 字符）</label>' +
        '<textarea id="preference-text" maxlength="2000" rows="4" placeholder="例如：先给生活类比，再解释公式。不要填写密码、手机号或其他敏感信息。" style="display:block;width:100%;margin:12px 0;padding:12px;font:inherit"></textarea>' +
        '<button type="button" class="primary" data-action="save-preference">保存偏好</button> <button type="button" data-action="clear-preference">清除我的偏好</button>' +
        '<p class="small muted">这里只管理你明确填写的偏好，不代表系统会自动推断偏好，也不保证所有功能都会采用。</p></section>';
  }
  // 知识库视图。
  // 关键设计：**把「本集嵌入是不是语义检索」放在最显眼处**。
  // 默认用的是本机哈希嵌入，只做词面重合；不写清楚的话，检索不到同义改写的结果
  // 会被当成「课程里没有这个内容」，而不是「检索方式本身的局限」。
  async function loadRag() {
    try {
      const status = await api('rag/status');
      app.rag = status; app.ragError = '';
      if (!app.ragKbId) app.ragKbId = status.courseKbId || ((status.kbs || [])[0] || {}).id || '';
      const list = await api('rag/kbs');
      app.rag.kbs = list.kbs || [];
      if (!app.ragKbId && app.rag.kbs.length) app.ragKbId = app.rag.kbs[0].id;
    } catch (error) { app.rag = null; app.ragError = (error && error.message) || '知识库状态读取失败。'; }
  }
  function renderRag() {
    const head = '<header class="page-heading"><div><p class="eyebrow">本机知识库</p><h1>知识库与检索</h1>';
    if (app.ragError) {
      main.innerHTML = head + '</div></header><div class="notice error">' + esc(app.ragError) + '<br>知识库由本机后端提供；静态模式下不可用，这不影响学习流程。</div>';
      return;
    }
    if (!app.rag) { main.innerHTML = '<div class="loading-state"><span class="loading-spinner"></span><p>正在读取知识库状态…</p></div>'; return; }
    const rag = app.rag.rag || {};
    const engines = rag.engines || [];
    const backends = rag.backends || [];
    const kbs = app.rag.kbs || [];
    const current = rag.currentEmbedder || {};
    const statusBadge = status => '<span class="badge ' + (status === 'ready' ? 'green' : status === 'needs-config' ? 'amber' : '') + '">' + esc(status) + '</span>';
    const courseKb = app.rag.courseKbId;
    main.innerHTML = head + '<p>' + esc(kbs.length) + ' 个知识库 · 当前嵌入：' + esc(current.label || '未知') + '</p></div>' +
      '<button type="button" class="icon-button" title="刷新" aria-label="刷新知识库状态" data-action="refresh-rag">↻</button></header>' +
      '<div class="notice ' + (current.semantic ? 'success' : '') + '">' + esc(current.note || '') +
        (current.semantic ? '' : '<br><strong>因此：同义改写、换个说法提问会检索不到</strong> —— 这是检索方式的局限，不代表课程里没有这个内容。') + '</div>' +
      '<section class="section-band"><h2>检索引擎</h2>' + engines.map(engine =>
        '<div class="memory-surface"><div class="memory-surface-head"><strong>' + esc(engine.label) + '</strong>' + statusBadge(engine.status) + '</div>' +
        '<p class="small muted">' + esc(engine.summary || '') + (engine.reason ? ' · ' + esc(engine.reason) : '') + '</p></div>').join('') + '</section>' +
      '<section class="section-band"><h2>索引后端</h2>' + backends.map(backend =>
        '<div class="memory-surface"><div class="memory-surface-head"><strong>' + esc(backend.label) + '</strong>' + statusBadge(backend.available ? 'ready' : 'not-installed') + '</div>' +
        '<p class="small muted">' + (backend.available ? '可用' + (backend.version ? ' · ' + esc(backend.version) : '') : esc(backend.reason || '') + (backend.install ? '（' + esc(backend.install) + '）' : '')) + '</p></div>').join('') + '</section>' +
      '<section class="section-band"><h2>知识库</h2>' + (kbs.length ? kbs.map(kb =>
        '<div class="memory-surface"><div class="memory-surface-head"><strong>' + esc(kb.name) + '</strong><span class="muted small">' + esc(kb.documentCount) + ' 篇文档 · ' + esc((kb.versions || []).length) + ' 个索引版本 · 当前 v' + esc(kb.activeVersion || '—') + '</span></div>' +
        (kb.activeManifest ? '<p class="small muted">' + esc(kb.activeManifest.chunkCount) + ' 个可引用块 · 引擎 ' + esc(kb.activeManifest.engine) + ' · 嵌入 ' + esc(kb.activeManifest.embedder.id) + (kb.activeManifest.backend.degraded ? ' · <strong>索引后端已降级</strong>：' + esc(kb.activeManifest.backend.degradeReason) : '') + '</p>' +
          '<p class="small muted">' + esc(kb.activeManifest.notice || '') + '</p>' : '<p class="small muted">尚未建立索引。</p>') + '</div>').join('')
        : '<p class="muted">还没有知识库。</p><button type="button" class="primary" data-action="seed-course">用仓库自带课程内容建立课程知识库</button>') +
        (kbs.length && !courseKb ? '<p style="margin-top:12px"><button type="button" data-action="seed-course">建立课程知识库</button></p>' : '') + '</section>' +
      '<section class="section-band"><h2>检索试一下</h2>' +
        '<form id="rag-search-form"><label class="field">知识库<select name="kbId">' + kbs.map(kb => '<option value="' + esc(kb.id) + '"' + (kb.id === app.ragKbId ? ' selected' : '') + '>' + esc(kb.name) + '</option>').join('') + '</select></label>' +
        '<label class="field">问题<input name="query" required maxlength="200" value="' + esc(app.ragQuery) + '" placeholder="例如：token 是什么"></label>' +
        '<div class="form-footer"><span class="muted">检索在本机完成，不发送到外部服务。</span><button type="submit" class="primary">检索</button></div></form>' +
        (app.ragResults ? '<div class="rag-results"><h3>命中 ' + esc(app.ragResults.hits.length) + ' 条（索引 v' + esc(app.ragResults.version) + '）</h3>' +
          (app.ragResults.hits.length ? app.ragResults.hits.map(hit => '<div class="rag-hit"><div class="rag-hit-head"><strong>' + esc(hit.title) + '</strong><span class="muted small">' + esc(hit.source) + ' · 相似度 ' + esc(hit.score) + '</span></div><p class="small">' + esc(hit.text) + '</p></div>').join('')
            : '<p class="muted small">没有命中。注意：默认嵌入只做词面重合，换个更贴近原文的说法再试。</p>') +
          (app.ragResults.rebuilt ? '<p class="small muted">索引文件缺失，本次已从可读真源（chunks.jsonl）就地重建。</p>' : '') + '</div>' : '') + '</section>';
  }
  // 「深度研究」视图：agent 循环能力的界面。
  // 界面上必须让人看见两件在别处看不到的事：
  //   ① 工具调用轨迹（toolTrace）—— 模型查了什么、有没有失败，是可核对的；
  //   ② ask_user 是**暂停**而不是失败 —— 回合停在提问处，带 sessionId 续跑，不重跑已完成的调用。
  // 少了第 ② 点的说明，用户会以为卡住了并重新提问，那样会开一个新会话、丢掉已有轨迹。
  async function loadResearch() {
    try { app.research = await api('agent/capabilities'); app.researchError = ''; }
    catch (error) { app.research = null; app.researchError = (error && error.message) || '能力状态读取失败。'; }
  }
  function renderResearch() {
    const head = '<header class="page-heading"><div><p class="eyebrow">多轮检索与工具调用</p><h1>深度研究</h1>';
    if (app.researchError) {
      main.innerHTML = head + '</div></header><div class="notice error">' + esc(app.researchError) + '</div>';
      return;
    }
    if (!app.research) { main.innerHTML = '<div class="loading-state"><span class="loading-spinner"></span><p>正在读取能力状态…</p></div>'; return; }
    const capability = (app.research.capabilities || []).find(item => item.id === 'research') || {};
    const ready = app.research.modelReady;
    const r = app.researchResult;
    const tools = (capability.toolDetails || []).map(item => '<li><code>' + esc(item.name) + '</code> <span class="muted small">' + esc(item.group) + '</span></li>').join('');
    main.innerHTML = head + '<p>能力状态：' + (ready ? '<span class="badge green">ready</span>' : '<span class="badge amber">needs-config</span>') + '</p></div></header>' +
      (ready ? '' : '<div class="notice">模型未配置，无法运行。请先在右上角「连接中 / 模型」处配置模型服务。本页不会因为未配置而假装可用。</div>') +
      '<section class="section-band"><h2>可用工具</h2><ul class="tool-list">' + tools + '</ul>' +
        '<p class="small muted">本仓库没有沙箱，因此<strong>不提供代码执行工具</strong>（无 exec）。与其做一个看起来能跑代码其实没有隔离的工具，不如不提供。</p></section>' +
      '<section class="section-band"><h2>提问</h2><form id="research-form"><label class="field">你想研究什么<input name="message" required maxlength="4000" placeholder="例如：RAG 里召回质量差会有什么后果？" value="' + esc(app.researchQuestion || '') + '"></label><div class="form-footer"><span class="muted">研究在本机编排；模型调用会发往你配置的服务。</span><button type="submit" class="primary"' + (ready ? '' : ' disabled') + '>开始研究</button></div></form></section>' +
      (r ? '<section class="section-band"><h2>结果</h2>' + researchResultHtml(r) + '</section>' : '');
  }
  function researchResultHtml(r) {
    const trace = (r.toolTrace || []).map((item,index) => '<li class="' + (item.ok ? '' : 'failed') + '"><span class="trace-index">' + (index+1) + '</span><code>' + esc(item.name) + '</code>' + (item.ok ? '' : '<span class="small">失败：' + esc(item.error || '') + '</span>') + (item.pending ? '<span class="small">（在此暂停等待你的回答）</span>' : '') + '</li>').join('');
    const traceBlock = trace ? '<h3>工具调用轨迹（' + (r.toolTrace || []).length + ' 次）</h3><ul class="trace-list">' + trace + '</ul>' : '';
    if (r.status === 'needs-user') {
      const q = r.pendingQuestion || {};
      return '<div class="notice">模型暂停了这一轮，需要你先回答下面的问题 —— <strong>这是暂停，不是失败</strong>。回答后会带着已有轨迹继续，不会重跑已经完成的调用。</div>' +
        '<h3>' + esc(q.question) + '</h3>' + (q.reason ? '<p class="small muted">' + esc(q.reason) + '</p>' : '') +
        '<form id="research-answer-form"><input type="hidden" name="sessionId" value="' + esc(r.sessionId) + '">' +
        (q.options && q.options.length ? '<div class="button-row">' + q.options.map((option,i) => '<button type="button" data-research-answer="' + esc(option) + '">' + esc(option) + '</button>').join('') + '</div><p class="small muted">或自行填写：</p>' : '') +
        '<label class="field">你的回答<input name="answer" required maxlength="2000"></label>' +
        '<div class="form-footer"><span class="muted">会话 ' + esc(String(r.sessionId).slice(0,8)) + '… 保存在本机</span><button type="submit" class="primary">继续</button></div></form>' + traceBlock;
    }
    if (r.status === 'failed') {
      return '<div class="notice error">研究未完成（' + esc(r.errorCode || 'unknown') + '）：' + esc(r.error || '') + '</div>' + traceBlock;
    }
    if (r.status === 'max-rounds') {
      return '<div class="notice">达到工具调用轮次上限，未给出最终答复。这不会静默继续 —— 你可以把问题拆细后重试。</div>' + traceBlock;
    }
    return '<div class="research-answer">' + esc(r.answer || '') + '</div>' + traceBlock;
  }
  function showDialog(title,html) {
    $('#dialog-content').innerHTML = '<div class="dialog-heading"><h2 id="dialog-title">' + esc(title) + '</h2><button type="button" class="icon-button" aria-label="关闭" title="关闭" data-action="close-dialog">' + icon('x') + '</button></div>' + html;
    renderIcons();
    if (!dialog.open) dialog.showModal();
  }
  function settingsDialog() {
    const ai = app.status.ai || {};
    showDialog('模型复评设置','<p class="dialog-subtitle">讲解内容将发送给你配置的模型服务。未配置时使用本地练习规则。</p><form id="settings-form"><label class="field">接口地址<input type="url" name="baseUrl" required value="' + esc(ai.baseUrl || 'https://api.deepseek.com/v1') + '"></label><label class="field">模型名称<input name="model" required value="' + esc(ai.model || 'deepseek-chat') + '" maxlength="120"></label><label class="field">API Key<input type="password" name="apiKey" autocomplete="off" placeholder="' + (ai.configured ? '留空保留当前密钥' : '输入模型服务密钥') + '"><small>保存在本机，不在学习记录中导出。</small></label><div class="form-footer">' + (ai.configured ? '<button type="button" data-action="clear-ai">关闭 AI 复评</button>' : '<span class="muted">当前：未配置</span>') + '<button type="submit" class="primary">保存设置</button></div><p class="dialog-error" role="alert"></p></form>');
  }
  function accountDialog() {
    if (app.user.isGuest === false) return showDialog('我的学习档案','<h3>' + esc(app.user.name) + '</h3><p class="dialog-subtitle">当前账号的学习记录保存在这台电脑。</p><div class="button-row"><button type="button" class="button-link" data-action="export-json">↓ 导出档案</button><button type="button" data-action="logout">退出账号</button></div><p class="dialog-error" role="alert"></p>');
    showDialog('本机学习档案','<div class="dialog-tabs"><button type="button" data-auth-mode="login" class="' + (app.authMode === 'login' ? 'selected' : '') + '">登录</button><button type="button" data-auth-mode="register" class="' + (app.authMode === 'register' ? 'selected' : '') + '">创建账号</button></div><p class="dialog-subtitle">' + (app.authMode === 'register' ? '为这台电脑上的学习档案设置账号。' : '登录这台电脑上已有的学习账号。') + '</p><form id="account-form"><label class="field">名称<input name="name" autocomplete="username" required minlength="2" maxlength="40"></label><label class="field">密码<input type="password" name="password" autocomplete="' + (app.authMode === 'register' ? 'new-password' : 'current-password') + '" required minlength="8" maxlength="128"><small>至少 8 位</small></label><div class="form-footer"><button type="button" data-action="close-dialog">继续使用访客档案</button><button type="submit" class="primary">' + (app.authMode === 'register' ? '创建账号' : '登录') + '</button></div><p class="dialog-error" role="alert"></p></form>');
  }
  function diagnosticDialog() {
    const r = app.diagnosticResult;
    showDialog('基础诊断','<p class="dialog-subtitle">依据当前理解作答，诊断结果用于安排起点。</p><form id="diagnostic-form">' + questionsHtml(app.diagnosticQuiz,r) + '<div class="form-footer">' + (r ? '<div><strong class="result-score">' + esc(r.score) + '%</strong><span class="small muted"> · ' + esc(r.correct) + ' / ' + esc(r.total) + ' 题正确</span></div><button type="button" class="primary" data-action="diagnostic-done">' + (app.state.plan ? '更新学习航线' : '设置学习计划') + '</button>' : '<span class="muted">按真实理解作答</span><button type="submit" class="primary">完成诊断</button>') + '</div><p class="dialog-error" role="alert"></p></form>');
  }
  async function loadReviews() { const data = await api('review'); app.reviews = (data.items || []).filter(item => !item.resolved || item.due); app.reviewResults = {}; }
  function readAnswers(form,quiz) { const values = new FormData(form); return Object.fromEntries(quiz.questions.map(q => [q.id,Number(values.get('q:' + q.id))])); }
  function selectModule(id) {
    if (!moduleById(id)) return;
    app.moduleId = id; setLearnView(); resetQuiz(); render(); main.focus({preventScroll:true});
  }
  async function startQuiz() {
    if (!current()) { toast('先建立学习计划。'); return; }
    app.view = 'learn'; app.stage = 'quiz';
    if (!progress(app.moduleId).completedAt && !(progress(app.moduleId).explanation || {}).accepted) { render(); return; }
    const data = await api('quiz?module=' + encodeURIComponent(app.moduleId)); app.quiz = data.quiz; app.quizResult = null; render();
  }
  function resetQuiz() { app.quiz = null; app.quizResult = null; }
  function setLearnView(stage = 'study') { app.view = 'learn'; app.stage = stage; }
  document.addEventListener('input',event => {
    if (event.target.id === 'explanation-text') { saveDraft(app.moduleId,event.target.value); $('#draft-status').textContent = event.target.value.length + ' / 6000 字 · 草稿已保存'; }
  });
  document.addEventListener('click',event => {
    const button = event.target.closest('button'); if (!button) return;
    // 表单内的提交按钮交给 submit 事件处理器处理，避免在此处禁用按钮导致 submit 事件无法触发。
    if (button.type === 'submit' && button.closest('form')) return;
    if (button.dataset.companion) { window.dispatchEvent(new CustomEvent('aimaster-companion-action',{detail:{action:button.dataset.companion}})); return; }
    if (button.dataset.stage) { if (app.busy) return; app.stage = button.dataset.stage; render(); return; }
    if (button.dataset.module) { if (!app.busy) selectModule(button.dataset.module); return; }
    if (button.dataset.authMode) { if (!app.busy) { app.authMode = button.dataset.authMode; accountDialog(); } return; }
    if (button.dataset.view) return void task(button,async () => { await openView(button.dataset.view); });
    const action = button.dataset.action;
    if (action === 'close-dialog') return dialog.close();
    if (app.busy) return;
    if (action === 'settings') return settingsDialog();
    if (action === 'account') return accountDialog();
    if (action === 'plan') return showDialog('调整学习计划',planForm(true));
    if (action === 'diagnostic-done') return showDialog('设置学习计划',planForm(true));
    if (action === 'next-module') { const next = modules().find(id => !progress(id).completedAt); if (next) selectModule(next); else { app.view = 'records'; render(); toast('当前学习航线已完成，记得按期复习。'); } return; }
    if (action === 'export-json') { try { const blob = new Blob([JSON.stringify(app.state,null,2)],{type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aimaster-learning-' + Date.now() + '.json'; a.click(); URL.revokeObjectURL(a.href); toast('学习档案已导出。'); } catch(e) { toast('导出失败。',true); } return; }
    if (action === 'save-preference') return void task(button,async () => {
      const text = $('#preference-text').value.trim();
      if (!text) throw new Error('请先填写偏好。');
      await api('memory/preference',{text,operation:'replace'});
      await loadMemory(); render(); toast('偏好已提交；保存期限以当前存储提示为准。');
    });
    if (action === 'clear-preference') {
      if (!window.confirm('只清除你显式填写的偏好，不删除学习轨迹。是否继续？')) return;
      return void task(button,async () => { await api('memory/preference',{operation:'clear'}); await loadMemory(); render(); toast('显式偏好已清除。'); });
    }
    if (action === 'refresh-memory') return void task(button,async () => { await loadMemory(); render(); });
    if (action === 'synthesize-memory') return void task(button,async () => { await api('memory/synthesize',{}); await loadMemory(); render(); toast('L3 综合已按 L2 事实生成。'); });
    if (button.dataset.researchAnswer !== undefined) return void task(button,async () => {
      const form = button.closest('form'); const sessionId = form ? new FormData(form).get('sessionId') : null;
      app.researchResult = await api('agent/run',{capability:'research',sessionId,answer:button.dataset.researchAnswer});
      render();
    });
    if (action === 'refresh-rag') return void task(button,async () => { await loadRag(); render(); });
    if (action === 'seed-course') return void task(button,async () => {
      const result = await api('rag/course/seed',{});
      app.ragKbId = result.kbId; app.ragResults = null; await loadRag(); render();
      toast('课程知识库已建立（v' + result.manifest.version + '，' + result.manifest.chunkCount + ' 个可引用块）。');
    });
    task(button,async () => {
      if (action === 'diagnostic') { const data = await api('quiz?mode=diagnostic'); app.diagnosticQuiz = data.quiz; app.diagnosticResult = null; diagnosticDialog(); }
      if (action === 'start-quiz') await startQuiz();
      if (action === 'complete') { applyState(await api('complete',{moduleId:app.moduleId})); pet('celebrate','这一节已通关，继续下一段航线。'); render(); toast('通关记录已保存，复习已安排。'); }
      if (action === 'refresh-review') { await loadReviews(); render(); }
      if (action === 'clear-ai') { const data = await api('ai/config',{clear:true}); app.status.ai = data.ai; dialog.close(); render(); toast('已切换为本地练习。'); }
      if (action === 'logout') { applyState(await api('auth/logout',{})); resetQuiz(); setLearnView(); dialog.close(); render(); toast('已退出账号。'); }
      if (action === 'retry-connect') await initialize();
    });
  });
  document.addEventListener('submit',event => {
    const form = event.target;
    if (!['plan-form','plan-dialog-form','explanation-form','quiz-form','diagnostic-form','settings-form','account-form','rag-search-form','research-form','research-answer-form'].includes(form.id) && !form.dataset.reviewForm) return;
    event.preventDefault();
    task($('button[type="submit"]',form),async () => {
      const values = new FormData(form);
      if (form.id === 'rag-search-form') {
        app.ragKbId = String(values.get('kbId') || ''); app.ragQuery = String(values.get('query') || '');
        const data = await api('rag/search',{kbId:app.ragKbId,query:app.ragQuery,limit:5});
        app.ragResults = data.result; render();
        return;
      }
      if (form.id === 'research-form') {
        app.researchQuestion = String(values.get('message') || '');
        app.researchResult = await api('agent/run',{capability:'research',message:app.researchQuestion});
        render();
        return;
      }
      if (form.id === 'research-answer-form') {
        // 续跑同一个会话：必须带 sessionId，否则会开新会话、丢掉已完成的工具调用。
        app.researchResult = await api('agent/run',{capability:'research',sessionId:String(values.get('sessionId')),answer:String(values.get('answer') || '')});
        render();
        return;
      }
      if (form.id === 'plan-form' || form.id === 'plan-dialog-form') {
        applyState(await api('plan',{goal:String(values.get('goal')).trim(),level:values.get('level'),dailyMinutes:Number(values.get('dailyMinutes')),deadline:values.get('deadline') || undefined}));
        setLearnView(); resetQuiz(); dialog.close(); render(); toast('学习计划已保存。');
      }
      if (form.id === 'explanation-form') {
        const id = app.moduleId; const text = String(values.get('text')).trim(); saveDraft(id,text); pet('thinking','我在看你的讲解，稍等一下。');
        const data = await api('explanation',{moduleId:id,text}); applyState(data); resetQuiz();
        if (data.result && !progress(id).explanation) { app.state.progress = app.state.progress || {}; app.state.progress[id] = {...progress(id),explanation:data.result}; }
        pet(data.result.accepted ? 'correct' : 'wrong',data.result.accepted ? '讲解已通过，再用测验检验一次。' : '看一看反馈，再补上缺少的部分。'); render();
      }
      if (form.id === 'quiz-form' || form.id === 'diagnostic-form') {
        const diagnostic = form.id === 'diagnostic-form'; const quiz = diagnostic ? app.diagnosticQuiz : app.quiz;
        const data = await api('quiz',{attemptId:quiz.id,answers:readAnswers(form,quiz)}); applyState(data);
        pet(data.result.passed ? 'correct' : 'wrong',data.result.passed ? '测验通过了，继续保持。' : '错题已经记下，再理解一次。');
        if (diagnostic) { app.diagnosticResult = data.result; render(); diagnosticDialog(); } else { app.quizResult = data.result; render(); }
      }
      if (form.id === 'settings-form') {
        const data = await api('ai/config',{baseUrl:String(values.get('baseUrl')).trim(),model:String(values.get('model')).trim(),apiKey:String(values.get('apiKey')).trim()});
        app.status.ai = data.ai || (await api('status')).ai; dialog.close(); render(); toast('模型设置已保存。');
      }
      if (form.id === 'account-form') {
        applyState(await api('auth/' + app.authMode,{name:String(values.get('name')).trim(),password:values.get('password')})); resetQuiz(); setLearnView(); dialog.close(); render(); toast('已进入你的学习档案。');
      }
      if (form.dataset.reviewForm) {
        const id = form.dataset.reviewForm; const data = await api('review',{questionId:id,answer:Number(values.get('answer'))}); applyState(data);
        const itemResult = data.result.items && data.result.items[0];
        app.reviewResults[id] = {...data.result,correct:!!data.result.correct,explanation:itemResult ? itemResult.explanation : data.result.explanation}; pet(data.result.correct ? 'correct' : 'wrong'); render();
      }
    });
  });
  window.addEventListener('aimaster-companion-quiz',() => task(null,startQuiz));
  dialog.addEventListener('click',event => {
    if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); }
  });
  // 视图切换集中在一处，并同步到 URL hash。
  // 此前只有「点侧栏按钮」一条路径：刷新会回到默认视图，也没法把某个视图直接发给别人。
  // 加上 hash 之后，`#memory` / `#rag` / `#research` 可以直接打开 —— 顺带也让无头浏览器能截图。
  const VIEWS = ['learn','review','records','memory','rag','research'];
  async function openView(view, options = {}) {
    if (!VIEWS.includes(view)) return;
    app.view = view;
    if (options.syncHash !== false && location.hash.slice(1) !== view) {
      try { history.replaceState(null, '', '#' + view); } catch (_) { location.hash = view; }
    }
    if (view === 'review') await loadReviews();
    if (view === 'memory') { app.memory = null; render(); await loadMemory(); }
    if (view === 'rag') { app.rag = null; render(); await loadRag(); }
    if (view === 'research') { app.research = null; render(); await loadResearch(); }
    render();
  }
  window.addEventListener('hashchange', () => {
    const view = location.hash.slice(1) || 'learn';
    if (VIEWS.includes(view) && view !== app.view) void openView(view, { syncHash: false });
  });
  async function initialize() {
    try {
      // Establish the session before independent reads so first-visit cookies cannot race.
      const data = await api('state');
      const [status,catalog] = await Promise.all([api('status'),api('catalog')]); app.status = status; app.catalog = catalog.modules || []; applyState(data);
      const initialView = location.hash.slice(1);
      if (VIEWS.includes(initialView) && initialView !== 'learn') await openView(initialView, { syncHash: false });
      else render();
    } catch (error) {
      main.innerHTML = '<div class="empty-state"><p class="eyebrow">学习服务未连接</p><h1>当前无法读取学习档案</h1><p>' + esc(error.message) + '</p><div class="button-row"><button type="button" class="primary" data-action="retry-connect">重新连接</button><a class="button-link" href="../dashboard/">先浏览课程</a></div></div>';
      $('#ai-status').innerHTML = '<span class="status-dot"></span><span>服务未连接</span>';
    }
  }
  initialize();
})();
