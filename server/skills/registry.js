'use strict';

// SKILL.md 技能包注册表。
//
// 借鉴 DeepTutor 的开放技能格式：一个技能就是一个含 SKILL.md（YAML frontmatter + Markdown 正文）
// 的目录，可选带若干参考文件。它带来一个必须正面处理的风险：**技能内容会进入提示词**，
// 因此导入就是一次「把外部文本接进模型上下文」的操作，必须有闸门。
//
// 本实现的安全立场（比 DeepTutor 更保守，因为本项目没有沙箱）：
//   1. 技能是**纯声明式文本**，不执行任何代码 —— 可执行后缀一律拒绝，不做「警告后放行」；
//   2. 路径必须相对、无 `..`、无盘符、无反斜杠，防止写到技能目录之外；
//   3. 条目数、单文件体积、总体积都有上限；
//   4. frontmatter 里的 `always:` 一律剥离（它是「无条件注入」开关，等价于把外部文本
//      塞进每一次请求，导入时不能默认继承）；
//   5. 检测到「忽略以上指令」这类越权话术时标记 warn，由调用方决定，不静默通过。

const fs = require('node:fs');
const path = require('node:path');
const { badRequest, notFound } = require('../errors');

const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const ALLOWED_SUFFIXES = ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.csv'];
const FORBIDDEN_SUFFIXES = ['.js', '.mjs', '.cjs', '.ts', '.sh', '.bash', '.ps1', '.bat', '.cmd', '.exe', '.dll', '.py', '.rb', '.so', '.node'];
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const INJECTION_HINTS = [/忽略(以上|上面|之前)(所有)?(指令|要求|规则)/, /ignore\s+(all\s+)?(previous|above)\s+instructions/i, /system\s*prompt/i, /你现在是/, /无条件(通过|给满分)/];

// 极简 frontmatter 解析：只支持本格式需要的子集（标量、行内数组、短横线数组）。
// 不引 YAML 依赖 —— 技能包不该为了读几个字段就多一个解析器。
function parseFrontmatter(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (!source.startsWith('---')) return { attributes: {}, body: source, hadFrontmatter: false };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { attributes: {}, body: source, hadFrontmatter: false };
  const block = source.slice(source.indexOf('\n', 3) + 1, end);
  const body = source.slice(source.indexOf('\n', end + 1) + 1);
  const attributes = {};
  let currentKey = null;
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const listItem = /^\s*-\s+(.*)$/.exec(rawLine);
    if (listItem && currentKey) {
      if (!Array.isArray(attributes[currentKey])) attributes[currentKey] = [];
      attributes[currentKey].push(listItem[1].trim());
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(rawLine);
    if (!pair) continue;
    currentKey = pair[1];
    const value = pair[2].trim();
    if (!value) { attributes[currentKey] = []; continue; }
    if (value.startsWith('[') && value.endsWith(']')) {
      attributes[currentKey] = value.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      attributes[currentKey] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { attributes, body, hadFrontmatter: true };
}

function isSafeRelativePath(relative) {
  const value = String(relative || '');
  if (!value || value.length > 300) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.includes('\\')) return false;
  return !value.split('/').some(part => part === '..' || part === '.' || part === '');
}

function validateBundle(files) {
  const findings = [];
  const push = (level, code, message) => findings.push({ level, code, message });
  if (!Array.isArray(files) || !files.length) {
    return { verdict: 'block', findings: [{ level: 'block', code: 'empty-bundle', message: '技能包为空。' }] };
  }
  if (files.length > MAX_ENTRIES) push('block', 'too-many-entries', '技能包条目数 ' + files.length + ' 超过上限 ' + MAX_ENTRIES + '。');

  let totalBytes = 0;
  let sawSkillFile = false;
  for (const file of files) {
    const relative = String((file && file.path) || '');
    const content = String((file && file.content) || '');
    if (!isSafeRelativePath(relative)) {
      push('block', 'unsafe-path', '不安全的路径：' + JSON.stringify(relative) + '（必须是无 .. 与盘符的相对路径）。');
      continue;
    }
    const suffix = path.extname(relative).toLowerCase();
    if (FORBIDDEN_SUFFIXES.includes(suffix)) {
      push('block', 'executable-suffix', '技能包不接受可执行文件：' + relative + '。技能是声明式文本，不执行代码。');
      continue;
    }
    if (!ALLOWED_SUFFIXES.includes(suffix)) {
      push('block', 'unsupported-suffix', '不支持的文件类型：' + relative + '。允许：' + ALLOWED_SUFFIXES.join('、') + '。');
      continue;
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;
    if (bytes > MAX_FILE_BYTES) push('block', 'file-too-large', relative + ' 超过单文件上限。');
    if (relative === 'SKILL.md') {
      sawSkillFile = true;
      const parsed = parseFrontmatter(content);
      if (!parsed.hadFrontmatter) push('warn', 'missing-frontmatter', 'SKILL.md 缺少 frontmatter，name 与 description 无法校验。');
      if (parsed.attributes.always !== undefined) {
        push('warn', 'always-stripped', 'frontmatter 中的 `always:` 已被剥离：无条件注入等于把外部文本塞进每一次请求，导入时不继承。');
      }
      if (!parsed.body.trim()) push('block', 'empty-body', 'SKILL.md 正文为空。');
    }
    for (const hint of INJECTION_HINTS) {
      if (hint.test(content)) { push('warn', 'injection-hint', relative + ' 含有疑似越权话术（匹配 ' + hint + '），请人工确认。'); break; }
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) push('block', 'bundle-too-large', '技能包总体积超过上限。');
  if (!sawSkillFile) push('block', 'missing-skill-file', '技能包必须包含 SKILL.md。');

  const verdict = findings.some(item => item.level === 'block') ? 'block' : (findings.length ? 'warn' : 'ok');
  return { verdict, findings, totalBytes, entries: files.length };
}

function createSkillRegistry(options = {}) {
  if (!options.root) throw new Error('createSkillRegistry 需要 root。');
  const root = options.root;
  fs.mkdirSync(root, { recursive: true });
  const skillDir = name => path.join(root, name);

  function readSkill(name) {
    if (!NAME_PATTERN.test(String(name || ''))) return null;
    const file = path.join(skillDir(name), 'SKILL.md');
    if (!fs.existsSync(file)) return null;
    const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const files = [];
    const walk = (dir, prefix = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue; // 符号链接一律忽略，避免越过技能目录
        const relative = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
        else files.push(relative);
      }
    };
    walk(skillDir(name));
    return {
      name, attributes: parsed.attributes, body: parsed.body,
      description: String(parsed.attributes.description || '').slice(0, 300),
      files, installedAt: fs.statSync(file).mtime.toISOString(),
      always: false // 显式固定为 false：导入时已剥离，注册表也不把它读回来
    };
  }

  function list() {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => readSkill(entry.name))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function install(source = {}) {
    const files = Array.isArray(source.files) ? source.files : [];
    const report = validateBundle(files);
    const skillFile = files.find(file => file.path === 'SKILL.md') || {};
    const declared = String(source.name || '').trim() || String(parseFrontmatter(skillFile.content || '').attributes.name || '');
    const name = declared.toLowerCase();

    // 名字校验必须在「警告确认」之前：否则一个非法名字会被缺 frontmatter 之类的警告挡在前面，
    // 调用方只会看到「需要确认」，拿到确认后仍然装不上，错误信息也指不到真正的问题。
    if (!NAME_PATTERN.test(name)) {
      return {
        installed: false,
        report: {
          ...report, verdict: 'block',
          findings: [...report.findings, { level: 'block', code: 'bad-name', message: '技能名需为小写字母、数字与短横线，长度 2–41：' + JSON.stringify(declared) }]
        }
      };
    }
    if (report.verdict === 'block') return { installed: false, report };
    if (source.acceptWarnings !== true && report.verdict === 'warn') {
      return { installed: false, report, needsConfirmation: true };
    }

    const dir = skillDir(name);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const file of files) {
      const relative = String(file.path);
      const target = path.resolve(dir, relative);
      // 双保险：校验已挡住 ..，这里再确认落点确实在技能目录内。
      if (!target.startsWith(path.resolve(dir) + path.sep)) {
        return { installed: false, report: { ...report, verdict: 'block', findings: [...report.findings, { level: 'block', code: 'escape', message: '路径越出技能目录：' + relative }] } };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const content = relative === 'SKILL.md'
        ? stripAlways(String(file.content)) // 落盘前剥离 always，而不是只在报告里提一句
        : String(file.content);
      fs.writeFileSync(target, content);
    }
    return { installed: true, skill: readSkill(name), report };
  }

  function stripAlways(text) {
    return String(text).replace(/^(\s*)always\s*:.*$/gm, '$1# always 已由导入安全门剥离');
  }

  function remove(name) {
    if (!NAME_PATTERN.test(String(name || ''))) throw badRequest('技能名不合法。');
    const dir = skillDir(name);
    if (!fs.existsSync(dir)) throw notFound('未安装该技能：' + name);
    fs.rmSync(dir, { recursive: true, force: true });
    return { removed: name };
  }

  return { root, list, get: readSkill, install, remove, validateBundle, parseFrontmatter };
}

module.exports = {
  createSkillRegistry, validateBundle, parseFrontmatter, stripAlways: undefined,
  MAX_ENTRIES, MAX_TOTAL_BYTES, MAX_FILE_BYTES, ALLOWED_SUFFIXES, FORBIDDEN_SUFFIXES, NAME_PATTERN
};
