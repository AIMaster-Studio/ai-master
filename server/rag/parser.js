'use strict';

// 文档解析：把上传的文件变成纯文本。
//
// 诚实边界（必须显式保留）：本模块**只处理纯文本类格式**。
// PDF / Office / 图片需要 MinerU、Docling、markitdown 这类解析引擎，本仓库**没有安装**。
// 因此对这些后缀明确抛错并说明原因，而不是「解析出一个空文档」让上层以为入库成功 ——
// 一个静默的空文档比一个明确的错误危险得多。
//
// 与 DeepTutor 的对应关系：它的「Settings → Document Parsing」会列出各引擎的
// 代价与是否需要下载本地模型，未安装的显示 Not installed。这里沿用同一原则：状态可见。

const path = require('node:path');
const { badRequest, unsupported } = require('../errors');

const TEXT_FORMATS = {
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.jsonl': 'jsonl',
  '.csv': 'csv',
  '.tsv': 'csv'
};

// 这些格式需要外部解析引擎，本仓库未安装 —— 列出它们是为了让「为什么不行」可回答。
const UNSUPPORTED_FORMATS = {
  '.pdf': 'MinerU / Docling / PyMuPDF4LLM 等 PDF 解析引擎',
  '.docx': 'Docling / markitdown 等 Office 解析引擎',
  '.doc': 'Docling / markitdown 等 Office 解析引擎',
  '.pptx': 'Docling / markitdown 等 Office 解析引擎',
  '.xlsx': 'Docling / markitdown 等 Office 解析引擎',
  '.png': 'MinerU 等多模态解析引擎',
  '.jpg': 'MinerU 等多模态解析引擎',
  '.jpeg': 'MinerU 等多模态解析引擎'
};

function flattenJson(value, prefix = '') {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenJson(item, prefix + '[' + index + ']'));
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => flattenJson(item, prefix ? prefix + '.' + key : key));
  return [prefix + '：' + String(value)];
}

function parseDocument(filename, buffer) {
  const name = String(filename || 'untitled');
  const extension = path.extname(name).toLowerCase();
  // 415：格式本仓库不支持，换个文件就能解决 —— 不是服务端故障。
  if (UNSUPPORTED_FORMATS[extension]) {
    throw unsupported('暂不支持 ' + extension + ' 格式：需要 ' + UNSUPPORTED_FORMATS[extension] + '，本仓库未安装。请先转换为纯文本或 Markdown 再入库。');
  }
  if (!TEXT_FORMATS[extension]) {
    throw unsupported('未知的文件格式：' + (extension || '(无后缀)') + '。当前只支持 ' + Object.keys(TEXT_FORMATS).join('、') + '。');
  }
  const raw = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer == null ? '' : buffer);
  const kind = TEXT_FORMATS[extension];
  let text = raw;

  if (kind === 'json') {
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { throw badRequest('JSON 解析失败：' + error.message); }
    text = flattenJson(parsed).join('\n');
  } else if (kind === 'jsonl') {
    text = raw.split(/\r?\n/).filter(Boolean).map(line => {
      try { return flattenJson(JSON.parse(line)).join('\n'); } catch { return line; }
    }).join('\n');
  } else if (kind === 'csv') {
    const delimiter = extension === '.tsv' ? '\t' : ',';
    text = raw.split(/\r?\n/).filter(Boolean)
      .map(line => line.split(delimiter).map(cell => cell.replace(/^"|"$/g, '')).join(' '))
      .join('\n');
  }

  if (!text.trim()) throw badRequest('文档解析后为空，未入库。');
  return { title: name, text, kind };
}

function supportedFormats() {
  return {
    supported: Object.keys(TEXT_FORMATS).map(extension => ({ extension, kind: TEXT_FORMATS[extension], status: 'ready' })),
    unsupported: Object.entries(UNSUPPORTED_FORMATS).map(([extension, engine]) => ({ extension, requires: engine, status: 'not-installed' }))
  };
}

module.exports = { parseDocument, supportedFormats, TEXT_FORMATS, UNSUPPORTED_FORMATS };
