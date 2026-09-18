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

  const findCourseKb = async () => (await rag.store.list()).find(kb => kb.name === COURSE_KB_NAME) || null;

  // 幂等：课程库不存在就建，存在就整体替换文档并重建索引（新开版本，旧版本保留）。
  async function seedCourse() {
    const documents = buildCourseDocuments(courseSeedOptions);
    if (rag.store.seedCourse) return rag.store.seedCourse(documents, COURSE_KB_NAME);
    let kb = await findCourseKb();
    const created = !kb;
    if (!kb) kb = await rag.store.create({ name: COURSE_KB_NAME, engine: 'local-index' });
    await rag.store.replaceDocuments(kb.id, documents);
    const manifest = await rag.store.buildIndex(kb.id);
    return { created, kbId: kb.id, manifest };
  }

  // 检索是**只读**操作，因此 GET 与 POST 接受同一套参数（kbId / query / limit）。
  // 原先只认 POST，是模块里唯一一处「只读却必须写请求体」的接口 —— 与同模块的
  // status / kbs / kb 三个 GET 接口自相矛盾，也让「直接拼 URL 试一下」的人撞到 405。
  //
  // GET 的边界（如实标注，不夸大）：
  //   - 参数走 URL，会被反向代理、隧道与访问日志记录下来；不想让查询词进日志就用 POST。
  //   - 受 URL 长度限制，超长查询用 POST。
  //   - 两种方法的检索结果完全一致，GET 不提供任何额外能力。
  // 参数（kbId / query / limit）与失败语义在 GET 与 POST 两条路径上完全共用，
  // 避免两条路径各写一份校验而慢慢漂移。fail 由调用方传入：它属于请求上下文，不是模块级状态。
  async function search({ kbId, query, limit }, fail) {
    const text = String(query || '').trim();
    // 空查询是调用方参数问题，不是服务端故障：必须 400 并说明缺什么，不能落到 500。
    if (!text) fail(400, '缺少 query（检索问题不能为空）。');
    // 不传 kbId 时回落到课程知识库 —— 与 rag_search 工具的行为保持一致，
    // 否则同一件事在工具里能用、在 HTTP 上必须显式指定，接口之间会自相矛盾。
    const requested = String(kbId || '');
    const course = requested ? null : await findCourseKb();
    if (!requested && !course) fail(400, '缺少 kbId，且尚未建立课程知识库。');
    return rag.store.search(requested || course.id, text, Number(limit) || undefined);
  }

  // 检索结果带降级标记时，除 JSON 里的 degraded/warnings 外再加一个响应头：
  // 只看状态码或只看头的监控、代理与脚本也能发现「这不是正常路径」，而不是把 200 当成一切正常。
  function sendSearch(res, send, result) {
    if (res && result.degraded) res.setHeader('X-AIMaster-Degraded', 'rag-backend');
    return send({ result, degraded: Boolean(result.degraded), warnings: result.warnings || [] });
  }

  return async function handleRag({ req, res, url, route, body, send, fail }) {
    const action = route.slice(4); // 去掉 'rag/'
    const isPost = req.method === 'POST';

    if (action === 'status' && !isPost) {
      const course = await findCourseKb();
      return send({ rag: { ...rag.capabilities(), dataRoot: rag.dataRoot }, courseKbId: course ? course.id : null });
    }
    if (action === 'kbs' && !isPost) {
      return send({ kbs: await rag.store.list() });
    }
    if (action === 'kb' && !isPost) {
      const kbId = url.searchParams.get('kbId');
      if (!kbId) fail(400, '缺少 kbId。');
      return send({ kb: await rag.store.info(kbId) });
    }
    if (!isPost) {
      if (action === 'search') {
        return sendSearch(res, send, await search({
          kbId: url.searchParams.get('kbId'),
          query: url.searchParams.get('query'),
          limit: url.searchParams.get('limit')
        }, fail));
      }
      fail(405, '该接口需要 POST。');
    }

    if (action === 'kb') {
      requireAdmin(req);
      const kb = await rag.store.create({ name: body.name, engine: body.engine });
      return send({ kb });
    }
    if (action === 'kb/remove') {
      requireAdmin(req);
      return send(await rag.store.remove(String(body.kbId || '')));
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
      return send(await rag.store.addDocuments(kbId, documents));
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
      return send(await rag.store.addDocuments(kbId, documents));
    }
    if (action === 'kb/index') {
      requireAdmin(req);
      return send({ manifest: await rag.store.buildIndex(String(body.kbId || '')) });
    }
    if (action === 'kb/activate') {
      requireAdmin(req);
      return send({ manifest: await rag.store.activate(String(body.kbId || ''), Number(body.version)) });
    }
    if (action === 'search') {
      return sendSearch(res, send, await search({ kbId: body.kbId, query: body.query, limit: body.limit }, fail));
    }
    if (action === 'course/seed') {
      requireAdmin(req);
      return send(await seedCourse());
    }
    fail(404, '接口不存在。');
  };
}

module.exports = { createRagRoutes, MAX_DOCUMENTS_PER_CALL, MAX_DOCUMENT_CHARS };
