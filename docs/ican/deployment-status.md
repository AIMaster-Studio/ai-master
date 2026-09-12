# 部署契约（可追溯版）— AI Master

> **用途**：`ACCEPTANCE.md` §1 的契约表是唯一真源，本文件是它的**可追溯副本**，
> 补齐 REVIEW.md R-004 要求的两列（**最后实测时间 / 实测人**），并显式化 R-005 的
> 自签证书验收条件。维护方：A（项目负责人）。
> **口径**：图片描述的是意图，本文件的「实测」列才是事实；两者冲突时以实测为准并开一条验收意见。
> 本文件随仓库公开（`docs/ican/**` 属于公开材料）；协作文件 `COLLAB.md` / `REVIEW.md` /
> `ACCEPTANCE.md` 不随仓库公开。文中 R-00x 为内部验收条目编号，仅作索引。
>
> ⚠️ **本文件是内部运维/部署文档，不属于答辩或巡展的评审材料，不应放入提交包。**
> 为符合 iCAN 双盲要求，文中已移除组织名、账号名等可识别标识（对应 R-107）。

---

## 0. 现行状态（2026-09-13 复核，**本节优先于以下各节**）

**后端上线方式已更换，旧备选端已废弃。** §1–§3 描述的是**旧方案（樱花隧道 + 自签证书 + Netlify 备选）**，
其中"命令行验收一律用 `curl -sk`"的做法**已被明令禁止**，请勿再照做。

| 项 | 旧方案（§1–§3） | **现行方案** |
| :--- | :--- | :--- |
| 公网出口 | 樱花隧道（frp） | **cloudflared 快速隧道**（Cloudflare Tunnel） |
| 证书 | **自签，不受信** ⇒ 浏览器 `ERR_CERT_AUTHORITY_INVALID` **永久拦截** | **受信** ⇒ 不加任何绕过开关即 HTTP 200 |
| 旧备选端（Netlify） | "唯一备选端" | ❌ **已废弃，不再引用**（见 §1 说明） |
| 验收口径 | `curl -sk` | **禁止 `-k` / `--insecure` / `-SkipCertificateCheck` / 浏览器忽略证书开关** |
| 演示可用性 | ❌ 评委浏览器打不开 | ✅ 浏览器级实测通过 |

**为什么禁止绕过开关**：`-k` 关掉了证书校验，于是"能取到字节"被误当成"评委能用"。
旧方案正是栽在这里 —— **脚本层 200，浏览器层被拦**。
**任何为了拿到结果而关掉的开关，其结果不得用于证明该开关所保护的性质。**

**现行验收（四条，缺一不可）**
```powershell
# ① 证书受信 + 连通（exit 60 = 不受信 = 不可用；-4 避免 IPv6 回退造成的假超时）
curl.exe -4 -s -o NUL -w '%{http_code}' <URL>/api/status
# ② 模型身份
curl.exe -4 -s <URL>/api/status            # ai.model 应为 deepseek-flash
# ③ 客户端是修复版：搜 API_TIMEOUT_MS = 60000 命中、搜 abort(),8000 不命中
# ④ 浏览器真答一题提交：6–10 秒内出 AI 评语，且表单不被清空（必须用浏览器，不能用 curl 代替）
```

**入口地址不写入仓库**：快速隧道 URL **每次重启都会变**，不作为固定地址分发。
现场演示当天用 `.orchestrator/scripts/start-public.ps1` 一键生成并当场验收。

**👉 现场执行见 `.orchestrator/deliverables/RUNBOOK-demo-day.md`**（开演前检查、兜底顺序、演示后必须轮换密钥）。

---

## 1. 部署契约表（**历史记录 —— 旧方案，见 §0**）

| 层 | 平台 | 地址 | 契约状态 | 最后实测时间 | 实测人 | 本轮实测结果 | 契约规则 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **前端（主）** | GitHub Pages | `https://aimaster-studio.github.io/ai-master/` | ✅ 在线 | 2026-09-12 14:29 | A | HTTP **200** / 760ms | **唯一前端真源。** push `master` 触发 `.github/workflows/pages.yml` 自动部署 `frontend/`。 |
| **前端（备用）** | Cloudflare Pages | `https://ai-master-aw5.pages.dev/` | ✅ 在线（冻结） | 2026-09-12 14:29 | A | HTTP **200** / 3092ms | **冻结，只读回滚点。** 不主动更新，不做"顺手也部署"。 |
| **后端（主）** | 本机 8787 + **cloudflared 快速隧道** | **不写入仓库**（URL 每次重启会变；当天用 `.orchestrator/scripts/start-public.ps1` 生成） | ✅ 在用 | 2026-09-13 | 队长 | 证书**受信**（不带任何绕过开关即 HTTP 200）；`ai.model = deepseek-flash`；`POST /api/explanation` → **`mode:"ai"`**、`aiErrorCode` 空、墙钟 5.9–10.2s；浏览器级 3/3 无重置 | 真源 = 本机 `node server/index.js`（**绑 `127.0.0.1`，绝不设 `PORT`**）。**隧道只是出口，隧道挂了等于后端挂了。** ⚠️ 旧行的"樱花隧道 + 自签证书 + `curl -sk`"**已作废，见 §0**。 |
| **后端（备选）** | ~~Netlify Functions~~ **已废弃** | ~~`effervescent-gingersnap-d27d31.netlify.app`~~ **不再引用** | ❌ **不作为演示入口** | 2026-09-13 | 队长 | 落地页唯一入口 `openmaic-ext/warp-gate.html` → **404**（评委走不到产品）；产品页本身 200；线上客户端仍为**修前构建**（含 `abort(),8000`、无 `API_TIMEOUT_MS`）；`ai.model` 仍为 `deepseek-v4-pro` | **该站点无法重新部署**（无 token、无仓库写权限、无 `.netlify` 目录），且 `netlify.toml` 的 `[build.environment]` 对函数运行时不可见 ⇒ **"不重新部署还能稳定换模型"这条路不存在**。**已从演示材料中撤下该 URL。** 若将来要重启该端，须先在站点级变量（Functions scope）设 `DEEPSEEK_MODEL=deepseek-flash` 并重新部署，部署后以 `/api/status.ai.model` 验收。 |

> 判据：**`/api/status` 200 ≠ 后端可用**（只说明配置项存在）。AI 链路通过的唯一标准是
> `POST /api/explanation` 返回 `mode:"ai"`（`ACCEPTANCE.md` §1.1 第 3 条）。

---

## 2. 自签证书端点的验收条件（R-005 显式化）

主后端走自签证书，不同客户端结论可能完全不同。验收统一口径：

1. **命令行验收一律用 `curl -sk`**（`-k` = 忽略证书校验）。Node 侧等价做法：
   `node scripts/check-connectivity.mjs --insecure`（会打印关闭 TLS 校验的警告）。
2. **浏览器访问**：首次会弹「不是私密连接 / NET::ERR_CERT_AUTHORITY_INVALID」，
   需手动选择「继续前往」。**现场演示前必须先在演示机上点过一次**，避免现场停顿。
3. **不要把"能打开"当成"证书正常"**：自签证书下 `-k` 通过 ≠ 浏览器默认信任。
   若中期需要长期对外，应换成受信任证书，或直接用平台 HTTPS 域名，而不是自签隧道。
4. **移动端（评委手机 / 微信内置浏览器）**：对自签证书更严格，可能直接拦截且无"继续"入口。
   现场演示建议用演示机浏览器或命令行，不要让评委用自己手机直连该端点。

---

## 3. 连通测试怎么跑（一条命令）

```bash
# 四端点 + 隧道 AI 链路（必过项）；--insecure 对应 curl -sk
node scripts/check-connectivity.mjs --insecure

# 额外验证本机 8787 与 Netlify 备选的 AI 链路
node scripts/check-connectivity.mjs --insecure --local-chain --netlify-chain
```

退出码：`0` = 必过项全通过；`1` = 有必过项失败。

启动后端（本机服务 + 探活隧道）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1
# 退出码：0 成功 / 1 本机未就绪 / 2 隧道未就绪
```

---

## 4. 本轮实测记录（2026-09-12，执行人：A）

| 项目 | 命令 | 实测结果 | 判定 |
| :--- | :--- | :--- | :--- |
| 前端主端 | `curl -L` GH Pages | HTTP 200 / 760ms | ✅ |
| 前端备用 | `curl -L` Cloudflare | HTTP 200 / 3092ms | ✅ |
| 后端主端 status | `curl -sk .../api/status` | HTTP 200 / 558ms | ✅ |
| 后端主端 AI | `POST /api/plan` → `POST /api/explanation` | **`mode:"ai"`** / 31.6s | ✅ |
| 后端主端探活 | `curl -sk ".../api/status?probe=1"` | `aiReachable:true` / 581ms | ✅ |
| 后端备选 status | `curl` Netlify `/api/status` | HTTP 200 / 1906ms | ⚠️ 配置就绪 |
| 后端备选 AI | `POST /api/plan` → `POST /api/explanation` | **`mode:"fallback-local"`** / 1.5s | ❌ 链路未通（R-003） |
| 本机真源 | `curl .../api/status` | HTTP 200 / 4ms | ✅ |
| 单元/集成测试 | `node --test tests/*.test.js` | **pass 33 / fail 0** | ✅ |
| 前端静态校验 | `python scripts/verify_frontend_demo.py` | 退出码 **0**（28 页 / 337 链接 / 10 星域 / 57 节点） | ✅ |

### 4.1 关于 R-002 的根因（实测）

- 2026-09-12 14:20 实测：隧道端点返回 **HTTP 502**，响应体
  `dial tcp [::1]:8787: connectex: No connection could be made because the target machine actively refused it.`
  → **隧道进程 `frpc.exe`（SakuraFrpLauncher）一直在跑，是本机 8787 没有监听**。
- 启动 `node server/index.js` 后，隧道端点立即恢复 200，AI 链路返回 `mode:"ai"`。
- 结论：**该端"掉线"的主因是本地服务没起，不是隧道挂**。隧道由外部工具
  `SakuraFrpLauncher` 管理（配置不在仓库内），本仓库负责的是**本机服务 + 探活**。

### 4.2 R-003 根因（已定性）

- **根因：Netlify 侧 `DEEPSEEK_API_KEY` 被上游拒绝（401 Unauthorized）** —— Key 失效 / 过期 / 被截断，
  或与本地那把不是同一把。**不是出网受限、也不是超时**（否则 `aiErrorCode` 会是 `network` / `timeout`）。
- 定性依据（两次独立复现，结果一致，2026-09-12 16:18）：
  - `POST /api/explanation` → `mode:"fallback-local"` + **`aiErrorCode: "provider-status-401"`**（1.22s / 1.42s 快速失败）
  - `GET /api/status?probe=1` → **`aiReachable: false`**
  - 对照（本机 + 樱花隧道，同一份代码同一条链路）：`?probe=1` → **`aiReachable: true`**；`POST /api/explanation` → **`mode:"ai"`**
- 诊断能力：降级响应带 `aiErrorCode`（只输出失败**类别**，不含密钥与上游正文）。
- **修复动作（人类侧，一步）**：Netlify `站点配置 → 环境变量`，把 `DEEPSEEK_API_KEY` 换成一把有效 Key
  （可直接用本地那把——本地实测 `mode:"ai"`），保存后重新部署即可。
- 未做任何"删调试代码"动作。

---

## 5. 已知阻断项状态

| 编号 | 阻断项 | 严重度 | 状态 |
| :--- | :--- | :--- | :--- |
| R-001 | `verify_frontend_demo.py` 在干净仓库必然失败 | P0 | **已修复并上线**（`master` = `b76d370`；线上 `static/js/ai-config.js` → HTTP 200） |
| R-002 | 本地后端 + 樱花隧道不通、无自愈 | P0 | **已修复（验收口径 = 提供一键启动 + 探活）**：`scripts/start-backend.ps1` + `scripts/check-connectivity.mjs`；根因 = 本机服务未起。**注意：需人工启动，掉线不会自动恢复（非自愈）**；现场兜底见 `docs/ican/demo-fallback.md` |
| R-003 | Netlify AI 复评不可用，根因未定位 | P1 | **根因已定性**：Netlify 侧 `DEEPSEEK_API_KEY` 返回 **401**（见 §4.2）；待换 Key |
| R-004 | 契约表缺"最后实测时间 / 实测人" | P1 | **已修复**（本文件 §1 两列齐备） |
| R-005 | 自签证书端点验收条件未显式化 | P2 | **已修复**（本文件 §2） |
| R-006 | 前端双端无版本标记 | P2 | **已修复并上线**（线上 `static/js/build-info.js` 实测 `sha:"b76d370"`） |

### 5.1 上线后的线上复核（2026-09-12 15:12，执行人：A）

| 项目 | 命令 | 实测结果 | 判定 |
| :--- | :--- | :--- | :--- |
| 前端主端 AI 配置 | `curl https://aimaster-studio.github.io/ai-master/static/js/ai-config.js` | HTTP **200** | ✅ R-001 生效 |
| 前端主端 build 标记 | `curl .../static/js/build-info.js` | `window.AIMASTER_BUILD = { sha: "6ac6763", builtAt: "2026-09-12T07:12:08Z" }` | ✅ R-006 生效（CI 盖章步骤跑通） |
| 前端主端入口页 | `curl .../learning-center/` | 页面已含 `build-info.js` | ✅ |

> 推送前已在干净克隆内复跑 G1（pass 33 / fail 0）与前端校验（退出码 0）。

### 5.2 合并 + Netlify 改绑后的复核（2026-09-12 16:18，执行人：A）

**背景**：Netlify 站点原绑错仓库（绑到了一个私有分叉仓库，内容停在 9/8）；已改绑为主仓库
`master`、发布目录 `.`。

| 项目 | 命令 | 实测结果 | 判定 |
| :--- | :--- | :--- | :--- |
| 前端主端 build 标记 | `curl .../static/js/build-info.js`（GH Pages） | `sha:"b76d370"` | ✅ R-006（标记随 push 变化） |
| 前端备用（Cloudflare） | `curl .../static/js/build-info.js` | 文件不存在 → 无标记 | ✅ 分叉可辨（符合契约） |
| Netlify 静态服务 | `curl /index.html`、`/frontend/learning-center/` | HTTP **200** | ✅ 改绑后恢复 |
| Netlify 新代码到位 | `curl /frontend/static/js/ai-config.js`、`build-info.js` | HTTP **200** | ✅ 跑上 `b76d370` |
| Netlify `/api/status` | `curl` | HTTP **200**，`model: deepseek-v4-pro` | ✅ |
| **Netlify AI 链路** | `POST /api/plan` → `POST /api/explanation`（×2） | `mode:"fallback-local"` + **`aiErrorCode:"provider-status-401"`** | ❌ **Key 401（根因）** |
| Netlify 真探活 | `curl "/api/status?probe=1"` | **`aiReachable:false`** | ❌ 与 401 一致 |
| 对照：隧道真探活 | `curl -sk ".../api/status?probe=1"` | **`aiReachable:true`** | ✅ Key 正常 |
| 对照：隧道 AI 链路 | `POST /api/explanation` | **`mode:"ai"`** | ✅ |
