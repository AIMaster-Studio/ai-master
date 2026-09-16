# AI Master 新手引导与全节点实践实施计划

> **实施说明：** 按 `writing-plans` 拆分；执行阶段使用 `executing-plans`，每项先写失败测试，再写最小实现。

**目标：** 让 10 章 57 个权威知识节点全部拥有可执行、可验收、可深链的实践任务，并补齐六类 AI 工具的新手图解入口。

**架构：** `frontend/data/knowledge-universe.json` 是课程节点权威源，`frontend/data/hands-on-tasks.json` 是实践权威源。构建脚本在生成章节页时建立“章节 + 节点标题 → 任务 ID”映射，缺失或幽灵映射立即失败；静态页面只负责呈现数据与稳定深链接。内容测试负责结构和覆盖，Python 验证器负责整站产物与链接回归。

**技术栈：** Node.js 内置测试、Python 3 标准库、原生 HTML/CSS/JavaScript、内联 SVG、Git。

**设计规格：** `docs/superpowers/specs/2026-09-16-beginner-hands-on-v2-design.md`

**全局约束：** 保留原有 20 道综合实践；新增内容独立创作，不复制外部仓库文案、代码、图片或布局；不引入前端依赖；不修复本轮无关的 `package-lock.json`；开发和验收优先在隔离工作区完成；所有提交禁用仓库钩子；不强推、不部署。

---

## 任务 1：建立实践内容合同测试

**文件：**

- 新建：`tests/hands-on-content.test.js`
- 读取：`frontend/data/knowledge-universe.json`
- 读取：`frontend/data/hands-on-tasks.json`
- 读取：`frontend/beginner/index.html`
- 读取：`frontend/chapter/{1..10}/index.html`

**步骤：**

1. 写测试辅助函数，读取两份 JSON，并把 57 个权威节点标准化为 `chapterId::title`。
2. 写失败测试，要求 10 章编号唯一、标题与权威源一致，任务 ID 符合 `chN-tN` 且全局唯一。
3. 写失败测试，要求每道任务包含 `goal`、`whereToStart`、不少于 3 步的 `steps`、`expected`、`antiCheat`、非空 `tools`、正整数 `minutes`、非空 `knowledgePoints`、`verifyState`。
4. 写失败测试，要求所有实践标签均为同章权威节点，且权威节点覆盖率严格为 57/57。
5. 写失败测试，要求新手页出现豆包、ChatGPT、文心千帆、扣子、阿里云百炼、AI Master；每类工具卡带适用场景、核心功能、三步上手、门槛、入口状态、不适用情况以及原创内联 SVG。
6. 写失败测试，要求生成后的每个知识卡包含一个 `/hands-on/#任务ID` 链接，并验证目标任务真实存在。
7. 运行 `node --test tests/hands-on-content.test.js`，确认失败原因分别落在 38/57 覆盖、新手工具缺失或章节实践链接缺失，而不是测试语法错误。
8. 提交：`test: define hands-on learning content contract`。

## 任务 2：补齐 57 个节点的实践数据

**文件：**

- 修改：`frontend/data/hands-on-tasks.json`
- 测试：`tests/hands-on-content.test.js`

**步骤：**

1. 将第一版 4 个非权威标签替换为 `knowledge-universe.json` 中同章的精确标题。
2. 为剩余 19 个未覆盖节点逐项增加轻量任务；每题仍填写完整字段、至少 3 步、正整数用时和明确验收信号。
3. 任务 ID 延续各章编号并保持稳定；标题使用可观察动作，不用“了解”“熟悉”。
4. 对需要外部平台的任务明确登录、费用、网络、密钥风险和核实日期；无法本地验证的事实标记为待核实。
5. 运行 `node --test tests/hands-on-content.test.js`，确认数据结构与 57/57 覆盖测试通过；页面类测试仍应失败。
6. 提交：`feat: cover all 57 knowledge nodes with practice tasks`。

## 任务 3：把实践映射接入章节生成器

**文件：**

- 修改：`scripts/build_frontend_demo.py`
- 生成：`frontend/chapter/1/index.html`
- 生成：`frontend/chapter/2/index.html`
- 生成：`frontend/chapter/3/index.html`
- 生成：`frontend/chapter/4/index.html`
- 生成：`frontend/chapter/5/index.html`
- 生成：`frontend/chapter/6/index.html`
- 生成：`frontend/chapter/7/index.html`
- 生成：`frontend/chapter/8/index.html`
- 生成：`frontend/chapter/9/index.html`
- 生成：`frontend/chapter/10/index.html`
- 测试：`tests/hands-on-content.test.js`

**步骤：**

1. 在构建入口读取 `hands-on-tasks.json`，建立 `{chapterId: {knowledgePoint: taskId}}` 映射。
2. 对幽灵标签、跨章标签、重复冲突和缺失节点抛出包含章节与节点名的明确错误。
3. 扩展 `chapter_page()` 参数，为每张知识卡渲染 `去做实践` 链接，目标为 `/hands-on/#task-id`；保留已有实验链接。
4. 将 `hands-on`、`beginner` 加入项目 URL 改写规则，确保 file/http 两种入口都能工作。
5. 运行 `python scripts/build_frontend_demo.py` 重新生成十章页面。
6. 运行 `node --test tests/hands-on-content.test.js`，确认章节链接测试通过；新手页测试仍应失败。
7. 提交：`feat: link every chapter node to hands-on practice`。

## 任务 4：重做六类工具新手图解页

**文件：**

- 修改：`frontend/beginner/index.html`
- 测试：`tests/hands-on-content.test.js`

**步骤：**

1. 在顶部增加五条按目标选择的最短路径：先问清楚、先写出来、先搭助手、先调 API、先验证自己是否真的懂。
2. 制作豆包、ChatGPT、文心千帆、扣子、阿里云百炼、AI Master 六张工具卡。
3. 每张卡使用自行绘制的内联 SVG 流程图，并包含适用场景、核心功能、三步上手、登录/费用/网络/密钥门槛、官方入口与核实状态、不适用情况。
4. 外部链接统一 `target="_blank" rel="noopener noreferrer"`，对当前网络无法核实的 ChatGPT 明确标注状态，不把网络结果写成平台能力结论。
5. 增加 390px 响应式规则、键盘焦点和跳转锚点。
6. 运行 `node --test tests/hands-on-content.test.js`，确认全部内容合同测试通过。
7. 提交：`feat: add illustrated beginner guide for six AI tools`。

## 任务 5：升级实践页与整站验证器

**文件：**

- 修改：`frontend/hands-on/index.html`
- 修改：`scripts/verify_frontend_demo.py`
- 测试：`tests/hands-on-content.test.js`

**步骤：**

1. 实践页顶部从章节统计升级为实时显示“57/57 节点、任务总数、10 章”。
2. 为章节和任务渲染稳定锚点 `#chN`、`#task-id`，并完整展示入口、步骤、产物、用时、验收、反作弊和核实状态。
3. 外部入口增加离站提示与安全属性；JSON 加载失败时显示文件路径、启动本地服务器命令和重试建议。
4. Python 验证器加入两页与 JSON 静态资产检查，复用权威节点集合验证 57/57，并输出实践任务总数。
5. 运行 `python scripts/verify_frontend_demo.py`，确认输出包含 10 章、57 节点、实践任务总数且无错误。
6. 提交：`feat: strengthen hands-on page and frontend verification`。

## 任务 6：本地全量验收与远端交付

**文件：**

- 更新：`C:/Users/10974/.codex/memory/MEMORY.md`
- 新建或更新：`C:/Users/10974/.codex/memory/ai-master-prompt-architect.md`

**步骤：**

1. 运行 `npm run verify`，要求全部 Node 测试和 Python 前端验证通过，且原 118 项不减少。
2. 运行 `git diff --check`，要求无空白错误。
3. 启动 `python -m http.server 8080`，在约 1440px 与 390px 检查新手页、实践页以及至少第 1、10 章：布局、键盘焦点、深链接、外部链接和错误态均可用。
4. 核对 `git status --short` 与变更范围，确保没有原工作区用户文件或无关生成物进入提交。
5. 把“场景 + 最终目的 → 通用版 + 高阶版提示词”的长期协作规则写入记忆索引；不得把公钥、令牌或其他凭据写入记忆。
6. 使用 `git fetch origin` 后比较远端：若功能分支或 `master` 有新提交，先非破坏性整合并重跑验证。
7. 推送 `codex/beginner-hands-on-v2`；确认远端引用一致后，仅在可快进时将 `origin/master` 推到同一提交，不强推。
8. 最终报告本地验证结果、远端提交哈希、已知限制与未部署说明。

## 计划自检

- 规格覆盖：57/57、任务完整字段、章节直达、新手六工具、原创 SVG、实践页错误态、全量验证、记忆沉淀、远端快进均有对应任务。
- TDD 顺序：任务 1 先建立失败合同；任务 2–5 每步只消除对应失败，不跳过红灯验证。
- 类型一致：章节 ID 始终为整数，节点键始终为 `chapterId::title`，任务链接始终为 `/hands-on/#task-id`。
- 无占位符：实施项均指向现有或明确新增文件；外部事实以核实状态而非虚构内容收口。
- 范围控制：不改锁文件、不部署、不复制第三方资产、不触碰原工作区的用户变更。
