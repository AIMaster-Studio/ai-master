# RAG · 记忆 · 能力运行时（本次新增）

核查日期：2026-09-14。本文记录本次新增的三块能力、它们的**设计依据**，以及**逐条的边界**。

设计参照对象是 [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)（Apache-2.0）。
下面每处「借鉴」都注明借鉴了什么，以及**本项目在哪些地方刻意没有照搬** ——
后者比前者重要：照搬一个依赖沙箱、依赖 Python 运行时的设计，会让本项目
「干净克隆后 `npm run verify` 无需 `npm install`」这条底线当场作废。

---

## 一、RAG：多引擎 + 版本化索引

### 借鉴了什么

DeepTutor 把检索当成**生态边界**而不是写死一个向量库，每个知识库绑定一个引擎，
引擎卡片显示 `Ready / Needs key / Needs setup / Not installed`。另外它重建索引时
写新的 `version-N` 目录并保留旧版本，所以「重建中永远不会毁掉一个可用的索引」。

### 本项目的实现

| 关注点 | 实现 | 文件 |
| --- | --- | --- |
| 引擎注册表 | `local-index`（可用）、`remote-embedding`（需配置）、`pageindex`/`graphrag`（**未实现，说明原因**） | `server/rag/engines.js` |
| 嵌入器 | 本机哈希嵌入（默认）／OpenAI 兼容 `/embeddings` | `server/rag/embedder.js` |
| 索引后端 | `sqlite-vec`（vec0 + KNN）／纯 JS 余弦扫描（兜底） | `server/rag/vector-store.js` |
| 切块 | 段落/句子感知 + 重叠 | `server/rag/chunker.js` |
| 文档解析 | 纯文本类格式；PDF/Office **明确报错并说明缺哪个引擎** | `server/rag/parser.js` |
| 知识库 | `version-N` 版本化，`chunks.jsonl` 为可读真源 | `server/rag/kb-store.js` |

### 刻意没有照搬的地方

- **未实现的引擎明确列出**。`pageindex` 与 `graphrag` 在状态里是 `not-implemented`，
  并说明原因（前者需要「阅读循环」而非向量索引；后者需要 Python 3.11–3.13）。
  列出来的意义是让抽象边界可见，不是凑数。
- **`sqlite-vec` 是 `optionalDependencies`**。它有平台相关的原生二进制，只覆盖五个平台。
  装不上时自动降级到纯 JS 余弦，并把降级原因写进索引清单。
  若把它设成硬依赖，「无需 `npm install` 即可 verify」这条承诺会当场作废。
- **不提供 PDF/Office 解析**。DeepTutor 集成了 MinerU、Docling、markitdown 等；
  本仓库没有，所以明确拒绝并说明缺哪个引擎，**不产出空文档** ——
  一个静默的空文档比一个明确的错误危险得多。

### 边界

- 默认嵌入是**词面重合**，不是语义检索。同义改写、跨语言提问会漏召回。
  这个事实通过 `embedder.semantic === false` 与索引清单里的 `notice` 对外暴露。
- 换嵌入模型后必须重建索引；服务端在检索时比对嵌入器 id，不一致**直接报错**，
  不会给出「看起来正常、其实跨向量空间」的结果。
- 课程库内容来自仓库自带的章节 JSON 与通关标准，**沿用原课程，未经本次审校**；
  原课程本身的审校队列见 `facts-and-limits.md`。
- 检索规模上限未做压测；纯 JS 余弦是线性扫描，语料变大后延迟会上升。

---

## 二、讲解复评：从「凭记忆判断」改为「对着课程原文判断」

### 要解决的问题

`README` 自述规则层是「完整性筛查，不是语义理解」，并明确写下
**「语义闸门必须放在服务端 AI 复评」**。但改动之前，复评只拿到一个 `module.summary`
字符串 —— 等于让模型凭记忆下判断，既无法核对，也无法追溯。

### 做法

1. 用仓库自带内容灌一个**课程知识库**（`server/rag/course-seed.js`，不引外部数据）。
2. 双查询检索（`server/grounding.js`）：用模块判定标准查「应该讲什么」，
   用学生讲解查「他实际讲了什么」，合并去重后给每段证据分配 `E1`、`E2`… 引用号。
3. 复评时要求模型回报 `citations`，服务端逐个复核引用号是否真实存在。

### 边界（这一节最需要读）

- **引用复核只能验证「引用号真实存在」，不能验证「引用内容支持该结论」。**
  这是可确定验证的部分；语义是否真的被支撑，仍需人读。`evidenceIntegrity: 'ok'`
  的含义仅限前者。
- 模型编造引用号、或完全不引用时，本次判定为**不通过**（`accepted: false`）。
  理由与既有「AI 复评失败不自动通关」一致：此时「有据可依」这个前提本身已不成立。
- 这仍然**不能**杜绝背题、代答或证明长期掌握 —— 与改动之前一样做不到。
- 证据质量受嵌入器限制：用本机哈希嵌入时，学生用同义改写提问可能检索不到对应证据。

---

## 三、记忆：三层，但**不是** LLM 摘要

### 借鉴了什么

DeepTutor 的 L1/L2/L3 分层与「可审计、不做黑盒向量库」的取向。

### 本项目的实现

| 层 | 存放 | 内容 |
| --- | --- | --- |
| L1 | `trace/<surface>/<date>.jsonl` | append-only 事件轨迹，唯一真源 |
| L2 | `L2/<surface>.md` | 由 L1 **确定性聚合**，文件头写明「依据 N 条 L1 事件」 |
| L3 | `L3/profile\|recent\|scope.md` | 由 L2 综合，写明贡献来源面 |
| 偏好 | `L3/preferences.md` | **只由显式写入产生**，`synthesize` 既不生成也不覆盖 |

### 刻意没有照搬的地方

DeepTutor 的 L2/L3 由 LLM 摘要产出。本项目的 L2/L3 是**确定性聚合**（计数、比例、去重）。
这个取舍是明确的：

- 好处：不存在「模型编造了一条关于你的记忆」这类风险，每条结论都能回溯到 L1 事件数。
- 代价：**没有语义归纳能力**。不会出现「你偏好类比式讲解」这种推断，因为那是模型判断。

生成方式通过 `inspect().mode === 'deterministic'` 与每个文件的头部显式暴露，不靠读者猜。

### 边界

- 记忆按用户隔离（各自 `dataRoot` 子目录），但**不跨设备同步**：本机文件即全部。
- L2/L3 不含讲解正文，只含统计与判定；正文留在 L1 轨迹与学习记录里。
- 该面 0 条事件时，比例（`acceptedRate`／`passRate`／`correctRate`／`hitRate`）在 JSON 里是 `null`、
  在文件里写作「无数据」——**不写成 0%**。「没有数据」与「全错（真实的 0%）」必须可区分，
  否则零事件的 L3 会被读成「学得不好」，而真实情况是「还没开始」。
- 记忆写入失败**不会中断学习流程**：轨迹是旁路记录，不是通关判定的必要条件。
- 轨迹无自动过期策略，只有粗粒度上限；长期使用需要另行设计归档。

---

## 四、能力运行时与技能包

### 借鉴了什么

- **多能力共享一套运行时与会话上下文**，而不是每个功能各写一套。
- 工具按「**谁决定它可用**」分三组：`user` 用户可配置 / `context` 自动挂载 / `governed` 需授权。
- `ask_user` 是**中断**而非普通工具：暂停回合、问一个结构化问题、拿到答案后从原处继续。
- 回合终止条件只有一条：模型发出**不含工具调用**的消息。
- `SKILL.md`（YAML frontmatter + Markdown）作为声明式技能包格式。

### 本项目的实现

- `server/agent/tools.js`：工具注册表，服务端在**执行前**按 JSON Schema 校验参数。
- `server/agent/loop.js`：agent 循环，含 `ask_user` 中断与续跑。
- `server/capabilities/registry.js`：能力注册表（`explain` / `quiz` / `research`）。
- `server/skills/registry.js`：SKILL.md 加载、注册与导入安全门。
- `server/agent-routes.js`：会话落盘，按用户校验归属。

### 刻意没有照搬的地方

- **不提供代码执行工具**（无 `exec`）。DeepTutor 的 `exec` 依赖 bubblewrap / 容器 /
  受限子进程；本机 Node 进程里做不到等价隔离。与其做一个「看起来能跑代码其实没有隔离」
  的工具，不如不提供。`/api/agent/tools` 的返回里可以核对这一点。
- **导入安全门比 DeepTutor 更保守**：可执行后缀（`.js`/`.sh`/`.ps1`/`.py`…）**一律阻断**，
  不做「警告后放行」。技能是纯声明式文本。
- frontmatter 里的 `always:` 在**落盘前剥离**（它是「无条件注入」开关，
  等价于把外部文本塞进每一次请求，导入时不能默认继承）。

### 边界

- 技能包**不执行任何代码**，也不提供沙箱。技能的作用仅限于把文本注入上下文。
- 越权话术检测是**启发式**（正则），只标记 `warn`，会漏也会误报；需显式确认才落盘，
  但「确认」不等于「已审阅」。
- `ask_user` 会话落盘在本机，重启可续；但只有粗粒度的数量上限，没有 TTL。
- agent 循环的轮次与工具调用次数有上限，超限返回 `max-rounds`，不会静默继续。

---

## 五、接口一览

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/api/rag/status` | 公开 |
| GET | `/api/rag/kbs`、`/api/rag/kb?kbId=` | 公开 |
| GET｜POST | `/api/rag/search` | 公开 |
| POST | `/api/rag/kb`、`/kb/documents`、`/kb/upload`、`/kb/index`、`/kb/activate`、`/kb/remove`、`/course/seed` | **管理** |
| GET | `/api/memory/inspect`、`/graph`、`/l1`、`/l2`、`/l3`、`/surfaces` | 公开（按用户隔离） |
| POST | `/api/memory/refresh`、`/synthesize`、`/preference` | 公开（按用户隔离） |
| POST | `/api/memory/clear` | **管理** |
| GET | `/api/agent/capabilities`、`/api/agent/tools` | 公开 |
| POST | `/api/agent/run` | 公开（会话按用户校验归属） |
| GET | `/api/skills`、`/api/skills/rules` | 公开 |
| POST | `/api/skills/install`、`/api/skills/remove` | **管理** |

**「管理」的含义**：与 `/api/ai/config` 同一道门 —— 服务未对外暴露时要求回环对端；
一旦暴露（隧道 / 公网），必须额外带 `AIMASTER_CONFIG_TOKEN`，否则一律 403。
未配置该令牌时，暴露模式下这些接口全部不可写（fail-closed）。

**`/api/rag/search` 为什么同时接受 GET 与 POST**：检索是只读操作，只认 POST 会让它成为
本模块唯一一处「只读却必须写请求体」的接口，与同模块的 `status` / `kbs` / `kb` 自相矛盾
（2026-09-15 走查记录：直接拼 URL 会拿到 405）。两条路径共用同一份参数校验与失败语义，
同参数下结果完全一致，由 `tests/grounding.test.js` 钉住。
**GET 的边界**：参数走 URL，会被反向代理、隧道与访问日志记录，且受 URL 长度限制 ——
不想让查询词进日志、或查询很长时用 POST。GET 不提供任何 POST 没有的能力。

---

## 六、本次新增的验证

`npm run verify` 当时执行 80 项 Node 测试 + 前端完整性检查（原为 34 项）。
此处是带日期的历史记录，因此不再写成现在时 —— 测试会继续增加，
「当前规模」只以 README 为准，避免同一事实在多处各写一份、各自腐烂。
新增测试覆盖：嵌入器确定性、切块边界、后端降级与两个后端排序一致性、
版本化索引与回切、派生索引缺失时就地重建、跨向量空间拒绝、证据检索与引用复核、
记忆三层聚合与用户隔离、工具参数校验、agent 循环与 `ask_user` 续跑、技能导入安全门。

**这些测试只支持「被测条件下的功能结论」。** 通过测试不等于检索质量可用、
不等于记忆有用、不等于复评准确 —— 见 `facts-and-limits.md` 的证据层级一节。
