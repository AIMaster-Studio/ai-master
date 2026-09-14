'use strict';

// 证据检索：为一次讲解复评准备**可引用、可复核**的课程证据。
//
// 两条查询并行：
//   ① 用模块的判定标准查 —— 找到「这次应该讲什么」的课程原文；
//   ② 用学生自己的讲解查 —— 找到「他实际讲的是哪一块」，用于识别跑题。
// 合并去重后给每段证据分配一个短引用号（E1、E2…），模型只被允许引用这些号，
// 服务端再逐个复核引用号是否真实存在 —— 编造引用会被明确记录，而不是当成正常输出。

const DEFAULT_K = 4;
const MAX_EVIDENCE_TEXT = 700;

function clip(text, max) {
  const value = String(text || '').trim();
  return value.length > max ? value.slice(0, max) + '…' : value;
}

function moduleQuery(module) {
  const parts = [module.title, module.objective, module.summary];
  for (const concept of module.concepts || []) parts.push(concept.label, (concept.terms || []).join(' '));
  return parts.filter(Boolean).join(' ');
}

/**
 * @returns {{available:boolean, reason?:string, evidence:Array, queries:Array}}
 */
async function retrieveEvidence(options = {}) {
  const { rag, kbId, module } = options;
  const k = Number.isInteger(options.k) && options.k > 0 ? options.k : DEFAULT_K;
  if (!rag || !kbId) {
    return { available: false, reason: '未建立课程知识库，本次复评没有可引用的课程证据。', evidence: [], queries: [] };
  }

  const queries = [{ kind: 'rubric', text: moduleQuery(module) }];
  const studentText = String(options.studentText || '').trim();
  if (studentText) queries.push({ kind: 'explanation', text: studentText.slice(0, 1500) });

  const collected = new Map();
  const performed = [];
  let meta = {};
  for (const query of queries) {
    if (!query.text) continue;
    let result;
    try {
      result = await rag.store.search(kbId, query.text, k);
    } catch (error) {
      // 检索失败不阻断复评流程：本次没有证据，但要如实上报，不能让上层以为有证据。
      performed.push({ kind: query.kind, hits: 0, error: error.message });
      continue;
    }
    meta = { version: result.version, embedder: result.embedder, backend: result.backend };
    performed.push({ kind: query.kind, hits: result.hits.length });
    for (const hit of result.hits) {
      const existing = collected.get(hit.chunkId);
      if (existing) {
        existing.score = Math.max(existing.score, hit.score);
        existing.matchedBy.push(query.kind);
      } else {
        collected.set(hit.chunkId, {
          chunkId: hit.chunkId, title: hit.title, source: hit.source,
          text: clip(hit.text, MAX_EVIDENCE_TEXT), score: hit.score, matchedBy: [query.kind]
        });
      }
    }
  }

  const ranked = [...collected.values()].sort((a, b) => b.score - a.score).slice(0, k * 2);
  const evidence = ranked.map((item, index) => ({ ref: 'E' + (index + 1), ...item }));
  return {
    available: evidence.length > 0,
    reason: evidence.length ? '' : '课程知识库中没有检索到与本模块相关的证据。',
    evidence,
    queries: performed,
    kbId,
    version: meta.version || null,
    embedder: meta.embedder || null,
    backend: meta.backend || null
  };
}

/**
 * 复核模型给出的引用号。
 * 这一步不依赖模型自述：引用号在不在证据集里是**可确定验证**的事实。
 */
function validateCitations(citations, evidence) {
  const allowed = new Set((evidence || []).map(item => item.ref));
  const list = Array.isArray(citations) ? citations.map(item => String(item).trim()).filter(Boolean) : [];
  const unique = [...new Set(list)];
  const invalid = unique.filter(ref => !allowed.has(ref));
  return {
    cited: unique.filter(ref => allowed.has(ref)),
    invalid,
    // integrity 只说明「引用号真实存在」，不代表引用内容与结论相符 —— 后者需要人读。
    integrity: invalid.length === 0 ? 'ok' : 'fabricated-reference',
    checkedAgainst: allowed.size
  };
}

module.exports = { retrieveEvidence, validateCitations, DEFAULT_K, moduleQuery };
