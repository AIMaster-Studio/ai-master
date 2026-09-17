'use strict';

// 领域模块的抛错出口：把「这是谁的错」编码进错误对象。
//
// 为什么需要它（2026-09-15 实测）：HTTP 层（server/index.js 的 handleRequest）只认 error.status，
// 没有 status 的一律兜成 **500「服务暂时出错，请重试。」**。于是「kbId 传错」「surface 名字写错」
// 「技能名不合法」这类**由调用方输入决定、重试永远无效**的错误被伪装成服务端故障：
//   - 用户按提示重试，永远好不了，而且不知道自己该改什么；
//   - index.js 的 onError 只记录无 status 的错误，真正的服务端故障反被这些输入错误淹没。
// 实测当时的比例：10 个纯调用方错误里 7 个返回 500。
//
// 分类判据只有一条：**调用方改一下请求就能消除这个错误吗？**
//   - 能 → 4xx，并在消息里说清要改什么（本项目一贯的「挡住你的同时告诉你该做什么」）。
//   - 不能，且重试或运维介入可能有用 → 503。
//   - 不能，属于服务端自身的数据损坏或编程错误 → **故意不加 status**，保持 500 并进 onError 日志。
//     例：createKbStore 缺 dataRoot、索引清单缺失。这类才应该出现在「服务端出错」的告警里。
//
// 只加 status，不改消息：消息文案是对外契约的一部分，测试按消息断言，改文案是另一件事。

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const badRequest = message => httpError(400, message); // 参数缺失或非法，调用方自己就能改
const notFound = message => httpError(404, message); // 调用方指定的资源不存在
const conflict = message => httpError(409, message); // 参数合法，但与当前状态冲突（缺前置步骤）
const unsupported = message => httpError(415, message); // 格式或类型本仓库不支持
const unavailable = message => httpError(503, message); // 服务端能力未就绪，需运维配置而非改请求

module.exports = { httpError, badRequest, notFound, conflict, unsupported, unavailable };
