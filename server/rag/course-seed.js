'use strict';

// 把仓库里已有的课程内容（章节 JSON + 通关标准）灌成一份**课程知识库**。
//
// 为什么需要这一步：讲解复评现在只能拿着一个 `module.summary` 字符串凭空判断，
// 学生写对写错都无从核对。灌库之后，复评可以先检索到本模块对应的课程原文，
// 再要求模型**引用具体证据**作答 —— 引用是否真实存在还可以在服务端复核。
//
// 内容来源是仓库自带 JSON，不引入任何外部数据，也不改写原文。

const fs = require('node:fs');
const path = require('node:path');

const CHAPTER_PATTERN = /^chapter_(\d+)\.json$/;

// 章节 JSON 的 content 字段里带 HTML 标记（<h3>/<p>/<strong>/<li>…）。
// 直接入库有两个真实危害：① 标记混进证据文本、白白占用上下文；
// ② 模型会把标记当成正文的一部分去引用。
// 这里做保守的标签剥离 + 常见实体还原。课程内容是我们自己的、结构可控，
// 不需要通用 HTML 解析器，也就不为此引依赖。
function stripHtml(text) {
  return String(text == null ? '' : text)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // 实体还原必须放在标签剥离**之后**：否则 &lt;div&gt; 会先变成 <div> 再被当成标签删掉。
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadChapters(dataDir) {
  return fs.readdirSync(dataDir)
    .map(name => ({ name, match: CHAPTER_PATTERN.exec(name) }))
    .filter(item => item.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map(item => {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, item.name), 'utf8'));
      return { file: item.name, order: Number(item.match[1]), data };
    });
}

function chapterDocuments(chapter) {
  const { data, order, file } = chapter;
  const label = '第' + order + '章';
  const documents = [];

  if (data.description) {
    const description = stripHtml(data.description);
    if (description) {
      documents.push({
        title: label + ' · ' + (data.title || '章节概述'),
        source: file + '#description',
        kind: 'course',
        text: stripHtml(data.title || '') + '\n\n' + description
      });
    }
  }
  for (const point of data.knowledge_points || []) {
    const content = stripHtml(point && point.content);
    if (!content) continue;
    documents.push({
      title: label + ' · ' + (point.title || '知识点'),
      source: file + '#kp',
      kind: 'course',
      text: stripHtml(point.title || '') + '\n\n' + content
    });
  }
  return documents;
}

// 每个通关模块单独成文：目标、标准答案摘要、关键概念、常见误区。
// 复评时「判定标准」本身也应当是可引用的证据，而不是只存在于 prompt 里的隐形规则。
function moduleDocuments(curriculum) {
  return (curriculum.modules || []).map(module => {
    const lines = ['学习任务：' + module.title, '目标：' + (module.objective || ''), '标准摘要：' + (module.summary || '')];
    for (const concept of module.concepts || []) {
      lines.push('关键概念 · ' + concept.label + '：' + (concept.terms || []).join('、'));
    }
    for (const item of module.misconceptions || []) {
      lines.push('常见误区：' + item.feedback);
    }
    return {
      title: '通关标准 · ' + module.title,
      source: 'learning-curriculum.json#' + module.id,
      kind: 'rubric',
      text: lines.join('\n')
    };
  });
}

function buildCourseDocuments(options = {}) {
  // 只使用公开模块元数据（title/objective/summary/concepts/misconceptions），
  // 因此读公开投影即可；答案键不参与灌库。
  const dataDir = options.dataDir || path.resolve(__dirname, '../../frontend/data');
  const curriculum = options.curriculum || JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-curriculum.json'), 'utf8'));
  const documents = [];
  for (const chapter of loadChapters(dataDir)) documents.push(...chapterDocuments(chapter));
  documents.push(...moduleDocuments(curriculum));
  if (!documents.length) throw new Error('没有找到可灌库的课程内容。');
  return documents;
}

// 课程库的固定标识：内容更新后重建同一个库，靠版本号区分，不新建库堆垃圾。
const COURSE_KB_NAME = 'AI Master 课程库';

module.exports = { buildCourseDocuments, loadChapters, moduleDocuments, stripHtml, COURSE_KB_NAME };
