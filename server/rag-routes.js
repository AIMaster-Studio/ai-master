'use strict';

// RAG 的 HTTP 路由。从 server/index.js 拆出来，避免主文件继续膨胀。
//
// 权限模型沿用项目既有约定：
//   - 读（status / kbs / search）对外开放，方便公网演示；
//   - 写（建库、入库、重建索引、删库）属于管理操作，与 /api/ai/config 同一道门：
//     未暴露时要求回环对端；暴露后必须额外带 AIMASTER_CONFIG_TOKEN。
//   理由一样：这些操作会改动服务端持久状态，不能让任意访客触发。

const { buildCourseDocuments, COURSE_KB_NAME } = require('./rag/course-seed');

const MAX_DOCUMENTS_PER_CALL = 20;
const MAX_DOCUMENT_CHARS = 400000;

function createRagRoutes(options) {
  const rag = options.rag;
  const requireAdmin = options.requireAdmin || (() => {});
  const courseSeedOptions = { dataDir: options.dataDir, curriculum: options.curriculum };

  const findCourseKb = () => rag.store.list().find(kb => kb.name === COURSE_KB_NAME) || null;

  // 幂等：课程库不存在就建，存在就整体替换文档并重建索引（新开版本，旧版本保留）。
  async function seedCourse() {
    const documents = buildCourseDocuments(courseSeedOptions);
    let kb = findCourseKb();
    const created = !kb;
    if (!kb) kb = rag.store.create({ name: COURSE_KB_NAME, engine: 'local-index' });
    rag.store.replaceDocuments(kb.id, documents);
    const manifest = await rag.store.buildIndex(kb.id);
    return { created, kbId: kb.id, manifest };
  }

  return async function handleRag({ req, url, route, body, send, fail }) {
    const action = route.slice(4); // 去掉 'rag/'
    const isPost = req.method === 'POST';

    if (action === 'status' && !isPost) {
      return send({ rag: { ...rag.capabilities(), dataRoot: rag.dataRoot }, courseKbId: findCourseKb() ? findCourseKb().id : null });
    }
    if (action === 'kbs' && !isPost) {
      return send({ kbs: rag.store.list() });
    }
    if (action === 'kb' && !isPost) {
      const kbId = url.searchParams.get('kbId');
      if (!kbId) fail(400, '缺少 kbId。');
      return send({ kb: rag.store.info(kbId) });
    }
    if (!isPost) fail(405, '该接口需要 POST。');

    if (action === 'kb') {
      requireAdmin(req);
      const kb = rag.store.create({ name: body.name, engine: body.engine });
      return send({ kb });
    }
    if (action === 'kb/remove') {
      requireAdmin(req);
      return send(rag.store.remove(String(body.kbId || '')));
    }
    if (action === 'kb/documents') {
      requireAdmin(req);
      const kbId = String(body.kbId || '');
      const incoming = Array.isArray(body.documents) ? body.documents : [];
      if (!incoming.length) fail(400, '没有提供文档。');
      if (incoming.length > MAX_DOCUMENTS_PER_CALL) fail(413, '单次最多入库 ' + MAX_DOCUMENTS_PER_CALL + ' 篇文档。');
      const documents = incoming.map(item => {
        const text = String(item.text || '');
        if (!text.trim()) fail(400, '文档「' + String(item.title || '未命名') + '」内容为空，未入库。');
        if (text.length > MAX_DOCUMENT_CHARS) fail(413, '单篇文档不得超过 ' + MAX_DOCUMENT_CHARS + ' 字符。');
        return { title: item.title, source: item.source, kind: item.kind || 'text', text };
      });
      return send(rag.store.addDocuments(kbId, documents));
    }
    // 客户端读文件后按文本提交；格式判定与拒绝都在服务端做，不信任前端自报的类型。
    if (action === 'kb/upload') {
      requireAdmin(req);
      const kbId = String(body.kbId || '');
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) fail(400, '没有提供文件。');
      const documents = files.map(file => {
        const parsed = rag.parseDocument(String(file.filename || ''), String(file.text || ''));
        return { title: parsed.title, source: parsed.title, kind: parsed.kind, text: parsed.text };
      });
      return send(rag.store.addDocuments(kbId, documents));
    }
    if (action === 'kb/index') {
      requireAdmin(req);
      return send({ manifest: await rag.store.buildIndex(String(body.kbId || '')) });
    }
    if (action === 'kb/activate') {
      requireAdmin(req);
      return send({ manifest: rag.store.activate(String(body.kbId || ''), Number(body.version)) });
    }
    if (action === 'search') {
      const result = await rag.store.search(String(body.kbId || ''), body.query, Number(body.limit) || undefined);
      return send({ result });
    }
    if (action === 'course/seed') {
      requireAdmin(req);
      return send(await seedCourse());
    }
    fail(404, '接口不存在。');
  };
}

module.exports = { createRagRoutes, MAX_DOCUMENTS_PER_CALL, MAX_DOCUMENT_CHARS };
