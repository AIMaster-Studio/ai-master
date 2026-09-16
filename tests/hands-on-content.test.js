'use strict';

// 新手动手实践内容合同。
//
// 这里把知识星海（57 个权威节点）、实践任务与最终静态页面连成一条可执行链路：
// 一个知识点若没有可抵达、真实存在的实践任务，学习者在课程页上就无法完成
// 「读到概念 → 动手验证」的闭环。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = file => JSON.parse(read(file));
const HANDS_ON_PREFIX = /(?:^|\.{0,2}\/|\.\.\/\.\.\/)hands-on\/#(ch\d+-t\d+)/g;
const REQUIRED_TOOLS = ['豆包', 'ChatGPT', '文心千帆', '扣子', '阿里云百炼', 'AI Master'];
const TOOL_CARD_FIELDS = ['适用场景', '核心功能', '三步上手', '门槛', '入口状态', '不适用情况'];

function sources() {
  const universe = readJson('frontend/data/knowledge-universe.json');
  const handsOn = readJson('frontend/data/hands-on-tasks.json');
  const authority = new Map();

  for (const galaxy of universe.galaxies) {
    for (const star of galaxy.stars) authority.set(`${star.chapter}::${star.title}`, star);
  }

  return { universe, handsOn, authority };
}

function chapterPages() {
  return Array.from({ length: 10 }, (_, index) => ({
    chapterId: index + 1,
    file: `frontend/chapter/${index + 1}/index.html`,
    html: read(`frontend/chapter/${index + 1}/index.html`)
  }));
}

function linksToTasks(html) {
  return Array.from(html.matchAll(HANDS_ON_PREFIX), match => match[1]);
}

function knowledgeCards(html) {
  return Array.from(html.matchAll(/<article\b[^>]*class=["'][^"']*\bknowledge\b[^"']*["'][^>]*>[\s\S]*?<\/article>/g));
}

function toolSection(html, name) {
  const heading = new RegExp(`<h3>\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/h3>`, 'g');
  const match = heading.exec(html);
  if (!match) return '';
  const next = /<h3>\s*(?:豆包|ChatGPT|文心千帆|扣子(?:（Coze）)?|阿里云百炼|AI Master)\s*<\/h3>/g;
  next.lastIndex = match.index + match[0].length;
  const boundary = next.exec(html);
  return html.slice(match.index, boundary ? boundary.index : html.length);
}

test('hands-on chapters are the ten unique authority chapters and task ids are globally unique', () => {
  const { universe, handsOn } = sources();
  const authorityChapters = universe.galaxies.map(galaxy => ({ chapterId: galaxy.chapter, title: galaxy.name }));

  assert.equal(handsOn.chapters.length, 10, '实践任务必须覆盖 10 章');
  assert.deepEqual(
    handsOn.chapters.map(({ chapterId, title }) => ({ chapterId, title })),
    authorityChapters,
    '实践章节编号或标题必须与知识星海权威章节一致'
  );
  assert.equal(new Set(handsOn.chapters.map(chapter => chapter.chapterId)).size, 10, '章节编号必须唯一');

  const taskIds = handsOn.chapters.flatMap(chapter => chapter.tasks.map(task => task.id));
  assert.equal(new Set(taskIds).size, taskIds.length, '实践任务 ID 必须全局唯一');
  for (const chapter of handsOn.chapters) {
    for (const task of chapter.tasks) {
      assert.match(task.id, new RegExp(`^ch${chapter.chapterId}-t\\d+$`), `任务 ID 不属于第 ${chapter.chapterId} 章：${task.id}`);
    }
  }
});

test('every hands-on task supplies the learner-facing completion contract', () => {
  const { handsOn } = sources();
  for (const chapter of handsOn.chapters) {
    for (const task of chapter.tasks) {
      const label = `${task.id}（第 ${chapter.chapterId} 章）`;
      for (const field of ['goal', 'whereToStart', 'expected', 'antiCheat', 'verifyState']) {
        assert.equal(typeof task[field], 'string', `${label} 缺少 ${field}`);
        assert.ok(task[field].trim(), `${label} 的 ${field} 不能为空`);
      }
      assert.ok(Array.isArray(task.steps) && task.steps.length >= 3, `${label} 至少需要 3 个步骤`);
      assert.ok(Array.isArray(task.tools) && task.tools.length > 0 && task.tools.every(tool => String(tool).trim()), `${label} 需要非空 tools`);
      assert.ok(Number.isInteger(task.minutes) && task.minutes > 0, `${label} 的 minutes 必须为正整数`);
      assert.ok(Array.isArray(task.knowledgePoints) && task.knowledgePoints.length > 0 && task.knowledgePoints.every(point => String(point).trim()), `${label} 需要非空 knowledgePoints`);
    }
  }
});

test('hands-on labels use same-chapter authority nodes and cover all 57 nodes', () => {
  const { handsOn, authority } = sources();
  const covered = new Set();
  const invalidLabels = [];

  for (const chapter of handsOn.chapters) {
    for (const task of chapter.tasks) {
      for (const title of task.knowledgePoints) {
        const key = `${chapter.chapterId}::${title}`;
        if (authority.has(key)) covered.add(key);
        else invalidLabels.push(`${task.id}: ${key}`);
      }
    }
  }

  assert.equal(covered.size, 57, `权威节点实践覆盖率必须为 57/57，实际为 ${covered.size}/57`);
  assert.deepEqual(invalidLabels, [], `实践标签必须属于同章权威节点：\n${invalidLabels.join('\n')}`);
  assert.deepEqual([...covered].sort(), [...authority.keys()].sort(), '每个权威节点都必须被至少一道同章实践任务覆盖');
});

test('beginner page gives every required tool a complete, original onboarding card', () => {
  const html = read('frontend/beginner/index.html');
  const sections = new Map(REQUIRED_TOOLS.map(tool => [tool, toolSection(html, tool)]));
  for (const tool of REQUIRED_TOOLS) {
    assert.ok(sections.get(tool), `新手页缺少 ${tool} 工具卡`);
  }
  for (const tool of REQUIRED_TOOLS) {
    const section = sections.get(tool);
    for (const field of TOOL_CARD_FIELDS) assert.match(section, new RegExp(field), `${tool} 工具卡缺少「${field}」`);
    const threeSteps = section.match(/<ol\b[^>]*>[\s\S]*?<\/ol>/);
    assert.ok(threeSteps && (threeSteps[0].match(/<li\b/g) || []).length >= 3, `${tool} 工具卡必须提供三步上手`);
    assert.match(section, /<svg\b[\s\S]*?<\/svg>/, `${tool} 工具卡必须含原创内联 SVG`);
  }
});

test('every rendered knowledge card links to a real same-chapter hands-on task', () => {
  const { handsOn } = sources();
  const taskIds = new Set(handsOn.chapters.flatMap(chapter => chapter.tasks.map(task => task.id)));

  for (const page of chapterPages()) {
    const cards = knowledgeCards(page.html);
    assert.ok(cards.length > 0, `${page.file} 未生成知识卡`);
    for (const card of cards) {
      const title = (card[0].match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '未命名知识卡';
      const taskLinks = linksToTasks(card[0]);
      assert.ok(taskLinks.length > 0, `${page.file} 的「${title}」缺少 /hands-on/#任务ID 实践链接`);
      for (const taskId of taskLinks) {
        assert.ok(taskIds.has(taskId), `${page.file} 的「${title}」链接到不存在的任务：${taskId}`);
        assert.match(taskId, new RegExp(`^ch${page.chapterId}-t\\d+$`), `${page.file} 的「${title}」必须链接本章实践任务：${taskId}`);
      }
    }
  }
});
