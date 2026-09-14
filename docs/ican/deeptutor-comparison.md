# ai-master 与 DeepTutor 的能力对照

核查日期：2026-09-15。对照对象：[HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)（Apache-2.0）。

## 为什么写这份文档

本次优化参照了 DeepTutor 的架构。但**参照不等于对齐** —— 它有的能力，本项目大部分**没有**，
而且其中一部分是**刻意不做**。如果不把这件事逐条写下来，读者会从「借鉴了 DeepTutor」
误推出「能力和 DeepTutor 差不多」，那是对本项目最不利的一种误读。

本文只回答三个问题：**借了什么、没借什么、为什么**。
设计细节与边界另见 [rag-memory-agent.md](rag-memory-agent.md)。

---

## 一、逐项对照

状态取值：**已实现** / **部分** / **未实现（已说明原因）** / **刻意不做**。

### 1. 运行时与编排

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 单一运行时 + 多能力 | 11 个 capability 共享会话上下文 | 3 个（`explain` / `quiz` / `research`） | **部分** | 结构照搬，规模小得多 |
| Agent 循环 | 思考 → 调工具 → 观察 → 无工具消息收尾 | 同 | **已实现** | `server/agent/loop.js` |
| `ask_user` 中断 | 暂停回合、结构化追问、恢复 | 同（会话落盘） | **已实现** | 续跑不重跑已完成调用 |
| 工具分组 | 按「谁决定」分 user / context / governed | 同 | **已实现** | `server/agent/tools.js` |
| 工具参数校验 | 由框架约束 | 服务端执行前按 JSON Schema 校验 | **已实现** | 不因为「模型说了」就信任参数 |
| 子代理（consult_subagent） | 可接入 Claude Code / Codex 等 9 种 | 无 | **未实现** | 需要外部 agent CLI 与凭据管理，不在本原型范围 |
| 定时任务（cron 工具） | 支持 at / every / cron 表达式 | 无 | **未实现** | 本机原型无后台调度需求 |
| 代码执行沙箱 | runner sidecar / bubblewrap / 受限子进程 | 无 | **刻意不做** | 见下文第二节 |

### 2. 检索（RAG）

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 检索引擎数量 | 8+（LlamaIndex / PageIndex / GraphRAG / LightRAG / WeKnora / IMA / MarginNote / Obsidian） | 2 可用（`local-index` / `remote-embedding`）+ 2 明确未实现 | **部分** | 未实现的引擎**列出并说明原因**，不假装存在 |
| 索引版本化 | `version-N` 目录，重建不毁在用索引 | 同 | **已实现** | 另加「派生索引缺失时从 `chunks.jsonl` 就地重建」 |
| 向量后端 | FAISS（exact-flat / HNSW） | `sqlite-vec`（首选）+ 纯 JS 余弦（兜底） | **部分** | 规模上限未压测 |
| 嵌入模型 | 可配 embedding provider | 本机哈希嵌入（默认）/ OpenAI 兼容 | **部分** | 默认**不是语义检索**，见边界 |
| 文档解析 | 7 种引擎（MinerU / Docling / Tika / markitdown / PyMuPDF4LLM / LiteParse / 纯文本） | 纯文本类格式 | **部分** | PDF/Office 明确报错并说明缺哪个引擎，不产出空文档 |
| GitHub / 网页源同步 | 支持 | 无 | **未实现** | — |
| Agentic 检索（PageIndex） | 有 | 无 | **未实现** | 需要「阅读循环」而非向量索引，接入形态不同 |

### 3. 记忆

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 三层结构 | L1 轨迹 / L2 各面 / L3 综合 | 同 | **已实现** | — |
| L2/L3 生成方式 | **LLM 摘要** | **确定性聚合**（计数与比例） | **刻意不同** | 见下文第二节 |
| 记忆图谱 | 有可视化 | 有 `graph()` 接口，**前端未接** | **部分** | — |
| 记忆可审计 | 每条结论可回溯 | 文件头写明「依据 N 条 L1 事件」 | **已实现** | — |
| 显式偏好 | 只由 `write_memory` 写入 | 同（不参与自动综合、不被覆盖） | **已实现** | — |
| 跨设备同步 | 多用户服务端 | 无 | **刻意不做** | 本机文件即全部 |

### 4. 扩展体系

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 技能包格式 | SKILL.md（frontmatter + Markdown） | 同 | **已实现** | 无 YAML 依赖，自写极简解析 |
| 技能注册表 | EduHub / ClawHub 远程注册表 | 仅本机注册表 | **未实现** | 未接远程分发 |
| 导入安全门 | 路径穿越 / 条目数 / 体积 / 压缩比 / 后缀 / 符号链接 + 安全判定 | 路径 / 后缀 / 条目数 / 体积 / `always` 剥离 / 越权话术检测 | **已实现（更保守）** | 可执行后缀**一律阻断**，不做「警告后放行」 |
| MCP 服务 | 支持 | 无 | **未实现** | — |
| CLI 应用（CLI-Anything） | 支持 | 无 | **未实现** | — |

### 5. 学习形态与呈现

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 讲解通关闭环 | 无直接对应 | 7 项规则筛查 + 证据驱动复评 + 客观题 ≥75% | **ai-master 独有** | 这是本项目的核心主张 |
| 客观判题 | 由 capability 出题 | **服务端预设标答**判分 | **ai-master 更严格** | 不由模型决定答案 |
| 沉浸式视频学习 | YouTube 同步字幕、时间戳问答 | 无 | **未实现** | — |
| Co-Writer / Book | 有 | 无 | **未实现** | — |
| 可视化（Mermaid / Chart.js / Manim / GeoGebra） | 有 | 无 | **未实现** | — |
| IM 陪伴（Partner） | 13 种渠道 | 无 | **未实现** | 本项目有静态「鲸鱼娘」形象，不是 IM bot |
| 回合级输出沙箱 | `outputs/<capability>/<session>/<turn>/` | 无 | **刻意不做** | 本项目不产出文件 |

### 6. 工程与部署

| 能力 | DeepTutor | ai-master | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 技术栈 | Python 3.11+ / FastAPI + Next.js 16 | Node 原生 HTTP + 原生 HTML/CSS/JS | **刻意不同** | 见下文 |
| 依赖体量 | 重（RAG / 解析 / 渠道各自成 extras） | 极轻（2 个运行时依赖） | **刻意不同** | — |
| 克隆即可验证 | 需 `pip install` | **无需 `npm install`** 即可 `npm run verify` | **ai-master 更严格** | 新增依赖必须可选且有降级路径 |
| 多用户与角色 | auth 默认关，首用户为 admin，含 Learner / Guardian 角色 | 访客 + 注册/登录，无角色体系 | **部分** | — |
| 部署路径 | PyPI / 源码 / Docker / CLI 四条 | 本机 Node + Cloudflare Pages 代理 + Netlify + Render + Electron | **不同** | 本机服务，**不是互联网生产部署** |
| 测试规模 | — | 97 项 + 前端完整性检查 | — | 见 README |

---

## 二、三处刻意不照搬，及理由

### 1. 不做代码执行沙箱 ⇒ 不提供 `exec` 工具

DeepTutor 的 `exec` 依赖 runner sidecar（容器）、Linux `bubblewrap`，最差也有受限子进程兜底。
本项目的后端是**本机 Node 进程**，没有等价隔离手段。

一个「看起来能跑代码、其实没有隔离」的工具，比没有这个工具危险得多：它会让人以为有边界。
所以**不提供**，并在 `/api/agent/tools` 的返回里可以核对确实没有 `exec`。

### 2. 记忆的 L2/L3 用确定性聚合，不用 LLM 摘要

DeepTutor 的 L2/L3 由 LLM 摘要产出，能得出「你偏好类比式讲解」这类语义结论。
本项目改成计数与比例的确定性聚合。

- **换来**：不存在「模型编造了一条关于你的记忆」这类风险；每条结论都能回溯到 L1 事件数。
- **代价**：**没有语义归纳能力**。不会产生任何模型推断出的学习风格描述。

取舍是明确的，并且写在文件头与 `inspect().mode` 里，不靠读者猜。

### 3. 不引入 Python 运行时与重依赖

DeepTutor 的 GraphRAG、PageIndex 等引擎需要 Python 3.11–3.13。
本项目把「干净克隆后无需 `npm install` 即可 `npm run verify`」当作底线承诺
（README 有实测记录）。引入 Python 运行时会让这条承诺当场作废。

因此：未实现的引擎**明确列出并说明原因**，而不是接进来再让部署链变重。

---

## 三、可以直接接入 DeepTutor 吗

**不建议**，理由与上面第 3 条同源：

- 它是 Python 服务，本项目是 Node 单进程；并存意味着部署链从「一条命令」变成两套运行时。
- 它的能力面（IM 渠道、视频学习、Co-Writer、多用户角色）远超本原型所需，
  接进来会带来大量本项目**无法诚实声称已验证**的功能面。
- 本项目对外承诺的是「可运行、可演示的原型」，不是完整平台。能力面越大，越容易越界声称。

**可复用的部分是设计决策，不是代码**：单一运行时、`ask_user` 中断语义、
工具分组、`version-N` 索引、可审计记忆、技能包格式。这些已在 `server/` 下按本项目的
技术栈重新实现，并在 [rag-memory-agent.md](rag-memory-agent.md) 里逐条注明借鉴点与偏离点。

---

## 四、这份对照本身不能证明什么

- 它**不是**能力对齐度评估，只是一份差异清单；「已实现」只表示代码存在并通过测试，
  不表示效果可用（见 [facts-and-limits.md](facts-and-limits.md) 的证据层级一节）。
- 「未实现」不代表做不到，只代表**本次没有做，且已说明原因**。
- DeepTutor 的能力描述来自其 README 与官方文档（核查日期 2026-09-15），
  未逐行核对源码；其版本迭代较快，引用时应以它的当期文档为准。
