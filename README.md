# AI Master

面向大学生的 AI 通识与 RAG 入门学习原型。核心主张是**「讲解通关」**：学习者先用自己的话把概念讲一遍，再完成一次独立客观测验，两者都通过才记通关，尝试、错题与复习记录留在本机。

> **当前定位**：可运行、可演示的原型。**没有**真实用户留存数据、教育效果提升数据或商业验证结论 —— 能力边界逐条写在 [docs/ican/facts-and-limits.md](docs/ican/facts-and-limits.md)。

---

## 目录

- [它做什么](#它做什么)
- [快速开始](#快速开始)
- [部署](#部署cloudflare-pages--_workerjs-代理)
- [🔐 密钥红线](#-密钥红线必读)
- [架构与数据](#架构与数据)
- [验证与测试](#验证与测试)
- [项目状态与已知边界](#项目状态与已知边界)
- [材料索引](#材料索引)
- [许可与资产](#许可与资产)

---

## 它做什么

| 能力 | 说明 |
| :--- | :--- |
| 讲解通关 | 学习者自己解释概念 → 系统给出**有来源标注**的反馈 → 客观测验 ≥75% → 记录通关 |
| 反馈来源透明 | 明确显示本次评分来自**本地规则**还是**模型复评**；模型调用失败**明确降级**，且**不自动判定通过** |
| 独立客观判题 | 客观题由**服务端预设标答**判分，**不由语言模型决定** |
| 本机记录 | 尝试、错题、复习安排存在本机 SQLite（后端模式）或 localStorage（静态模式），不声称云同步 |
| 已有交互资产 | 星际课程、知识星海（10 章 57 节点）、鲸鱼娘陪伴等原有交互全部保留 |

**讲解检查的 7 项**（`frontend/static/js/learning-core.js`，与"字数/关键词/举例"三项的老描述不同）：

`有效内容` · `非重复表达` · `关键概念` · `机制与因果` · `具体应用` · `适用边界` · `常见误区`

> 规则层是**完整性筛查**，不是语义理解。对抗性审计（`naiveBot 0/140` 全被拦、`grammarBot 140/140` 可被文法背穿）说明**语义闸门必须放在服务端 AI 复评**，见 [对抗性审计数据](docs/ican/evidence/rule-abuse-bench-results.json)。

---

## 快速开始

### 在线体验

- 主站：https://ai-master-aw5.pages.dev/ 　（这是 **URL / 子域**，不是项目名；项目名见[部署](#部署cloudflare-pages--_workerjs-代理)一节）
- 学习教练入口：https://ai-master-aw5.pages.dev/learning-center/

### 本地：只浏览页面（零依赖、不调用 AI）

```bash
python -m http.server 8080
# 打开 http://127.0.0.1:8080/frontend/
```

此模式下讲解评价走本地规则、数据存 localStorage。**不要用 `file://` 打开** —— 依赖 JSON 请求的页面会失败。

### 本地：完整工作台（带后端，推荐）

```bash
npm run dev          # = node server/index.js，默认监听 127.0.0.1:8787
# 打开 http://127.0.0.1:8787/
```

- 需要 **Node.js ≥ 24**（见 `package.json` 的 `engines`）。
- 后端**始终绑定 `127.0.0.1`**，默认不对外暴露。Windows 上也可用 `scripts/start-backend.ps1` 一键起服务并探活。
- 可选配置见 `frontend/static/js/ai-config.example.js` 与 `firebase-config.example.js`；**两者都留空时自动降级**，学习流程不中断。

### 桌面入口（Electron，单独验收）

```bash
npm install
npm start            # 开发运行
npm run pack         # Windows x64 打包
```

桌面分发的资源、许可与服务能力**需单独核查**，不要把它当作浏览器端的等价物。

---

## 部署（Cloudflare Pages + `_worker.js` 代理）

### ⚠️ `/api/*` 是靠 `frontend/_worker.js` 实现的 —— 别搞错机制

本仓库**用 `wrangler pages deploy`（Direct Upload）部署**。这个命令**没有 `--functions` 开关**，而 Cloudflare 官方明确：

> **When using a `_worker.js` file, the entire `/functions` directory is ignored**, including its routing and middleware characteristics.
> —— [Advanced mode · Cloudflare Pages](https://developers.cloudflare.com/pages/functions/advanced-mode/)

| 机制 | 放哪 | 在本项目是否生效 |
| :--- | :--- | :--- |
| **`_worker.js`（Advanced mode）** | **`frontend/`**（资产根，**必须随发布产物上传**） | ✅ **真正生效的就是它** |
| `_routes.json` | `frontend/`（资产根） | 控制哪些路径触发 worker |
| `.dev.vars` | **仓库根**（cwd 侧，**已 gitignore**） | 仅本地把 `TUNNEL_ORIGIN` 注入 worker |
| `functions/` | 仓库根 | ❌ **Direct Upload 推不上去；且存在 `_worker.js` 时整片被忽略** |

**为什么必须写清楚**：`_worker.js` 在 Advanced mode 下接管**全部**请求，所以它**必须**自己把静态资源兜住 ——

```js
if (!url.pathname.startsWith('/api/')) {
  return env.ASSETS.fetch(request);   // ← 漏了这行，全站静态资源都会坏
}
```

> 判据：线上 `/api/status` 的响应头应含 **`x-aimaster-proxied-by`**。**没有这个头 ⇒ 代理没生效。**
> ⚠️ **但它不会报错**（本站有 SPA 兜底，没代理时 `/api/*` 照样返回 200，只是体是兜底 HTML）—— 所以只验状态码会得到"看起来正常、其实没代理"的部署。

线上资产根是 **`frontend/`**，不是仓库根 —— 所以线上是 `/learning-center/`，不是 `/frontend/learning-center/`。
判据：`wrangler pages dev ./frontend` 应打印 `Parsed 1 valid redirect rule.` 与 `Parsed N valid header rules.`，那说明它读到了 `frontend/_redirects` 与 `frontend/_headers`。

### 凭据

```powershell
# Cloudflare 控制台 → My Profile → API Tokens → Create Token
# 用【Custom Token】，权限三格选：
#   Account → Cloudflare Pages → Edit
# ⚠️ 不要用 "Edit Cloudflare Workers" 模板 —— 那是 Workers 权限，Pages 直传按官方文档要用上面这条
$env:CLOUDFLARE_API_TOKEN  = "<token>"
$env:CLOUDFLARE_ACCOUNT_ID = "<account-id>"     # 控制台 URL 里那串 32 位十六进制
```

### 部署命令

```bash
npx wrangler pages deploy ./frontend --project-name=ai-master --branch=main --commit-dirty=true
```

- 项目名是 **`ai-master`**；`ai-master-aw5.pages.dev` 是它被分配到的**子域**，不是项目名。
- **单文件上限 25 MiB**，超了 wrangler 直接拒绝。当前 `frontend/` 共 **56.1 MB / 152 个文件**，最大的是 `static/trae_intro.mp4`（**20.23 MB**）—— **只剩约 4.8 MB 余量，往里塞素材会先炸在这里**。

### 部署后必须验的四条

**每一条都要看响应体，不能只看状态码** —— 本站有 SPA 兜底，**不存在的路径也返回 200**（体是兜底 HTML），只看状态码会把"没通"判成"通了"。

```bash
curl.exe -4 -s https://ai-master-aw5.pages.dev/api/status
#   ① 期望：能解析出 JSON，且 ai.model == "deepseek-flash"
curl.exe -4 -s https://ai-master-aw5.pages.dev/static/js/learning-workspace.js | findstr API_TIMEOUT_MS
#   ② 期望：命中（且不应命中 abort(),8000）
curl.exe -4 -s https://ai-master-aw5.pages.dev/static/js/ai-config.js | findstr "sk-"
#   ③ 期望：0 命中
curl.exe -4 -sI https://ai-master-aw5.pages.dev/api/status | findstr /i x-aimaster-proxied-by
#   ④ 期望：有该响应头 ⇒ 代理 worker 真的在跑
```

**④ 为什么不用 `build-info.js` 的 SHA 当判据**：那个 SHA 是 **GitHub Pages 的 workflow** 在部署前改写的，**`wrangler pages deploy` 不会改它**（本地值一直是 `sha:"dev-local"`）。用它当"这次构建上线了吗"的判据，会得到**一条永远失败的检查** —— 而恒假的检查会被当噪音忽略，并连带把前三条也一起忽略掉（见 R25/R33）。

**判断"这次部署真的上去了"，请用同一构建的另一产物对账 —— 但必须按归一化后的值比。**

⚠️ **不要直接比字节数。** 本仓库工作树是 **CRLF**、git 里与线上是 **LF**，同一份文件会算出**两个体积**，差值恰好等于 CRLF 行数（`learning-workspace.js` 本地就有 304 个 CRLF ⇒ 一次**完美**的部署也会报"差 304"）。**这会把一条恒假的检查换成一条会假失败的检查，比原来更糟。**

```powershell
# 线上取回，把 \r 去掉后算 sha1，再与本地同法算的值比 —— 两个哈希必须一致
curl.exe -4 -s -o $env:TEMP\dep.js https://ai-master-aw5.pages.dev/static/js/learning-workspace.js
$remote = (Get-Content $env:TEMP\dep.js -Raw) -replace "`r", ""
$local  = (Get-Content frontend/static/js/learning-workspace.js -Raw) -replace "`r", ""
"remote : $(([System.BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($remote)))) -replace '-','')"
"local  : $(([System.BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($local)))) -replace '-','')"
```

（若嫌麻烦，**只留上面第 ④ 条的 `x-aimaster-proxied-by` 响应头也行** —— 它已经能回答"本次部署的代理层在不在跑"，而且没有行尾陷阱。）

> `/api/*` 由 **`frontend/_worker.js`**（Advanced mode）**代理到本机隧道**，所以**它依赖本机后端在线**。上游不通时它返回**明确的 502 与中文说明，不会伪装成"降级仍可用"**。

---

## 🔐 密钥红线（必读）

**`frontend/static/js/ai-config.js` 会被提交进 git，也会被部署到公网。** 它随仓库入库（`.gitignore` 里对它没有豁免），任何访问者都能从浏览器直接读取。

- ❌ **不要把任何真实 API Key 写进这个文件。** 仓库里只保留 `apiKey: ""` 的空值占位。
- ✅ 需要真实模型时，**只在本机 `.env` / 环境变量里配**（本项目后端从环境变量读），或改造成服务端代理。
- 服务端相关文件（`server/**`）需要读取 `DEEPSEEK_API_KEY` 之类的变量时，**一律走环境变量**，不要落进任何会被提交的文件。

> 这不是理论风险：本项目曾因为这个文件里的一段明文密钥在公网裸奔数日。**一旦泄漏，删文件不等于失效 —— 必须去平台吊销那把 key。**

**同样不能进仓库的还有**：

| 文件 | 状态 | 说明 |
| :--- | :--- | :--- |
| `.env` / `.env.*` | 已 gitignore | 本机后端读取的密钥 |
| **`.dev.vars`** | 已 gitignore | Cloudflare 本地开发变量，本项目里存的是 `TUNNEL_ORIGIN`（**真实隧道入口**）—— 与 `.env` 名字长得像，但**不受 `.env.*` 规则覆盖**，必须单独忽略 |
| `.wrangler/` | 已 gitignore | wrangler 本地状态（含 sqlite 缓存） |
| `frontend/static/js/ai-config.js` | **随仓库入库**（勿写密钥） | 见上；仓库只保留 `apiKey: ""` |

---

## 架构与数据

| 层 | 现在是什么 | 边界 |
| :--- | :--- | :--- |
| 页面 | 原生 HTML / CSS / JS | 沿用既有课程与交互页面 |
| 3D | 本地 Three.js r128 | 浏览器支持与实际性能需实测 |
| 内容 | JSON 章节与题库（7 个核心模块有独立通关题库） | 原课程**待审校**，不自动作为标答 |
| 学习服务 | Node.js 内置 HTTP（`server/index.js`），默认 `127.0.0.1:8787` | **本机服务，不是互联网生产部署** |
| 记录 | SQLite（本机）／ localStorage（静态模式） | 本机访客档案，**不声称云同步** |
| 讲解评价 | 本地规则（7 项筛查）＋ 可选模型复评；复评前先检索课程证据，并要求模型回报引用号，服务端逐个复核 | 显示来源；失败明确降级；引用复核只能确认「引用真实存在」，不能确认结论被证据支持 |
| 客观判题 | 服务端预设标答 | 不由模型决定答案 |
| 知识库（RAG） | 多引擎注册表 + `version-N` 版本化索引；`sqlite-vec` 为首选、纯 JS 余弦兜底 | 默认嵌入是**词面重合而非语义检索**；PDF/Office 解析未安装，明确报错 |
| 记忆 | 三层：L1 事件轨迹 / L2 各面事实 / L3 跨面综合 | L2/L3 是**确定性聚合而非 LLM 摘要**，无语义归纳能力；本机文件，不跨设备同步 |
| 能力运行时 | `explain` / `quiz` / `research` 共享工具注册表与会话上下文，含 `ask_user` 中断续跑 | **无沙箱，故不提供代码执行工具** |
| 技能包 | SKILL.md 声明式文本 + 导入安全门 | 不执行代码；可执行后缀一律阻断；越权话术检测是启发式 |
| 公网出口 | cloudflared 隧道（URL 每次重启变化）｜ Cloudflare Pages `_worker.js` 代理 | 隧道挂了等于后端挂了 |

---

## 验证与测试

**一条命令跑完自带验收**（干净克隆后直接执行，**不需要先 `npm install`**）：

```bash
npm run verify
```

它顺序执行两项，**任一项失败则整体退出码非 0**：

| # | 实际执行 | 验什么 |
| :- | :--- | :--- |
| ① | `node --test tests/*.test.js` | 后端与学习核心的单元/集成测试（当前 97 项） |
| ② | `python scripts/verify_frontend_demo.py` | 静态前端完整性：页面、资源、内部链接、知识星海 |

**最近一次实测**（干净 Git 克隆，非工作树、非 `git archive`）：

| 项 | 值 |
| :--- | :--- |
| 实测日期 | 2026-09-14 |
| 克隆 URL | `https://github.com/AIMaster-Studio/ai-master.git` |
| 克隆时的 HEAD short SHA | `a5bce44` |
| 结果 | **退出码 0**；① 80 tests / 80 pass / 0 fail；② `28 pages, 7 assets, 339 internal links, 10 galaxies, 57 knowledge nodes` |
| 该次克隆是否含 `node_modules` | **否** —— 本次新增的 `sqlite-vec` 是 optionalDependency，装不上时 RAG 索引自动降级到纯 JS 余弦，`verify` 不受影响 |

```bash
git clone --depth 1 https://github.com/AIMaster-Studio/ai-master.git
cd ai-master
npm run verify          # 无需 npm install，无需 .env 或 .local/
```

**依赖边界**：本命令**不读取任何被 `.gitignore` 排除的文件**（`.env`、`.local/`、`node_modules/`），
也不要求预先安装依赖 —— 上述实测就是在没有 `node_modules` 的克隆上跑出来的。
唯一的外部前提是机器上同时有 **Node.js ≥24** 与 **Python 3**。

> 关于 HEAD SHA：上行记录的是**最后一次实测时的 commit**。本节自身的改动被提交后 SHA 会前进一位，
> 届时以最新一次实测记录为准 —— 请勿把它当作"当前 HEAD"，判据是**该次实测的退出码**。

---

## 项目状态与已知边界

**已完成**：静态课程与知识星海、本机后端服务、7 模块题库、讲解通关工作台、Electron 入口、认知教学设计文档。

**进行中**：课程内容审校、真实用户试点、可用性测试。

**明确没有的**（写在这里，避免被误读为已达成）：
- 真实用户留存 / 教育效果提升数据；
- 讲解检查杜绝背题、代答或证明长期掌握 —— **它做不到**；
- 本机服务 ≠ 互联网生产部署，≠ 多租户云同步；
- 素材授权与商业化前需核清权利。

完整清单见 [docs/ican/facts-and-limits.md](docs/ican/facts-and-limits.md) 与 [部署契约](docs/ican/deployment-status.md)。

---

## 材料索引

| 文件 | 内容 |
| :--- | :--- |
| [项目说明.md](项目说明.md) | 架构、数据与能力边界 |
| [docs/ican/README.md](docs/ican/README.md) | 赛道材料总览：答辩稿、问答、商业假设与研究计划 |
| [docs/ican/defense-script.md](docs/ican/defense-script.md) | 答辩讲稿 |
| [docs/ican/judges-qa.md](docs/ican/judges-qa.md) | 评委可能追问的方向与回答 |
| [docs/ican/facts-and-limits.md](docs/ican/facts-and-limits.md) | 事实与能力边界（逐条） |
| [docs/ican/deployment-status.md](docs/ican/deployment-status.md) | 部署契约与各端实测状态 |
| [docs/ican/demo-fallback.md](docs/ican/demo-fallback.md) | 演示兜底顺序 |
| [docs/ican/third-party-notices.md](docs/ican/third-party-notices.md) | 版权、来源与授权限制 |
| [docs/ican/education-study-plan.md](docs/ican/education-study-plan.md) | 教育效果研究计划 |
| [docs/ican/rag-memory-agent.md](docs/ican/rag-memory-agent.md) | RAG / 记忆 / 能力运行时的设计依据、刻意未照搬之处与逐条边界 |
| [docs/ican/deeptutor-comparison.md](docs/ican/deeptutor-comparison.md) | 与 DeepTutor 的逐项能力对照：借了什么、没借什么、为什么 |

---

## 许可与资产

项目代码见 [MIT LICENSE](LICENSE)。

鲸鱼娘与动作来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，保留原形象、全部已有动作与署名。

> ⚠️ **上游 README 区分「代码 MIT」与「素材禁止商用」—— 不能把 MIT 扩大为全部角色动画的商用许可。** 字体、音频、图像及外部课程也**不能仅因随仓库存在就视为团队原创**。商业化前需核清权利并获得适用授权，详见 [third-party-notices.md](docs/ican/third-party-notices.md)。
