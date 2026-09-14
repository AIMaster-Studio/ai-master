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
    documents.push({
      title: label + ' · ' + (data.title || '章节概述'),
      source: file + '#description',
      kind: 'course',
      text: (data.title || '') + '\n\n' + data.description
    });
  }
  for (const point of data.knowledge_points || []) {
    if (!point || !point.content) continue;
    documents.push({
      title: label + ' · ' + (point.title || '知识点'),
      source: file + '#kp',
      kind: 'course',
      text: (point.title || '') + '\n\n' + point.content
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

module.exports = { buildCourseDocuments, loadChapters, moduleDocuments, COURSE_KB_NAME };
