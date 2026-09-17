'use strict';

// 文档分块。目标不是「切得漂亮」，而是**让每个块能单独作为一条可引用的证据**：
// 检索命中的块要能连同来源一起展示给学习者，所以块必须自带可读的定位信息（第几段、原文区间）。

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 120;
const SENTENCE_BOUNDARY = /(?<=[。！？；!?;])|(?<=\.\s)/;

function splitParagraphs(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function splitSentences(paragraph) {
  return paragraph
    .split(SENTENCE_BOUNDARY)
    .map(part => part.trim())
    .filter(Boolean);
}

function hardSplit(text, maxChars) {
  const pieces = [];
  for (let i = 0; i < text.length; i += maxChars) pieces.push(text.slice(i, i + maxChars));
  return pieces;
}

// 把超长段落先按句子聚合到 maxChars 以内；单句仍超长时才硬切。
function packSentences(sentences, maxChars) {
  const packed = [];
  let buffer = '';
  for (const sentence of sentences) {
    const pieces = sentence.length > maxChars ? hardSplit(sentence, maxChars) : [sentence];
    for (const piece of pieces) {
      if (!buffer) buffer = piece;
      else if (buffer.length + piece.length <= maxChars) buffer += piece;
      else { packed.push(buffer); buffer = piece; }
    }
  }
  if (buffer) packed.push(buffer);
  return packed;
}

/**
 * 把文档切成可引用块。
 * @returns {{index:number, text:string, start:number, end:number, paragraph:number}[]}
 */
function chunkText(text, options = {}) {
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : DEFAULT_MAX_CHARS;
  const overlapChars = Number.isInteger(options.overlapChars) && options.overlapChars >= 0
    ? Math.min(options.overlapChars, Math.floor(maxChars / 2))
    : DEFAULT_OVERLAP_CHARS;
  const source = String(text || '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return [];

  const units = [];
  let cursor = 0;
  splitParagraphs(source).forEach((paragraph, paragraphIndex) => {
    const at = source.indexOf(paragraph, cursor);
    cursor = at < 0 ? cursor : at + paragraph.length;
    const sentences = splitSentences(paragraph);
    const parts = sentences.length > 1 ? packSentences(sentences, maxChars) : [paragraph];
    for (const part of parts) {
      if (part.length > maxChars) {
        for (const piece of hardSplit(part, maxChars)) units.push({ text: piece, paragraph: paragraphIndex });
      } else {
        units.push({ text: part, paragraph: paragraphIndex });
      }
    }
  });

  const chunks = [];
  let buffer = '';
  let bufferParagraph = 0;
  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) { buffer = ''; return; }
    const start = source.indexOf(trimmed, chunks.length ? chunks[chunks.length - 1].end : 0);
    const at = start < 0 ? 0 : start;
    chunks.push({ index: chunks.length, text: trimmed, start: at, end: at + trimmed.length, paragraph: bufferParagraph });
    buffer = '';
  };

  for (const unit of units) {
    if (!buffer) { buffer = unit.text; bufferParagraph = unit.paragraph; continue; }
    if (buffer.length + unit.text.length + 1 <= maxChars) {
      buffer += '\n' + unit.text;
      continue;
    }
    flush();
    // 重叠：把上一块尾部接到新块开头，避免边界处的答案被切断。
    const previous = chunks.length ? chunks[chunks.length - 1].text : '';
    buffer = overlapChars && previous ? previous.slice(-overlapChars) + '\n' + unit.text : unit.text;
    bufferParagraph = unit.paragraph;
    if (buffer.length > maxChars) buffer = buffer.slice(-maxChars);
  }
  flush();
  return chunks;
}

module.exports = { chunkText, DEFAULT_MAX_CHARS, DEFAULT_OVERLAP_CHARS };
