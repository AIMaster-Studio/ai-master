# 部署契约（可追溯版）— AI Master

> **用途**：`ACCEPTANCE.md` §1 的契约表是唯一真源，本文件是它的**可追溯副本**，
> 补齐 REVIEW.md R-004 要求的两列（**最后实测时间 / 实测人**），并显式化 R-005 的
> 自签证书验收条件。维护方：A（项目负责人）。
> **口径**：图片描述的是意图，本文件的「实测」列才是事实；两者冲突时以实测为准并开一条验收意见。
> 本文件随仓库公开（`docs/ican/**` 属于公开材料）；协作文件 `COLLAB.md` / `REVIEW.md` /
> `ACCEPTANCE.md` 不随仓库公开。文中 R-00x 为内部验收条目编号，仅作索引。

---

## 1. 部署契约表（含最后实测时间 / 实测人）

| 层 | 平台 | 地址 | 契约状态 | 最后实测时间 | 实测人 | 本轮实测结果 | 契约规则 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **前端（主）** | GitHub Pages | `https://aimaster-studio.github.io/ai-master/` | ✅ 在线 | 2026-09-12 14:29 | A | HTTP **200** / 760ms | **唯一前端真源。** push `master` 触发 `.github/workflows/pages.yml` 自动部署 `frontend/`。 |
| **前端（备用）** | Cloudflare Pages | `https://ai-master-aw5.pages.dev/` | ✅ 在线（冻结） | 2026-09-12 14:29 | A | HTTP **200** / 3092ms | **冻结，只读回滚点。** 不主动更新，不做"顺手也部署"。 |
| **后端（主）** | 本机 8787 + 樱花隧道 | `https://frp-end.com:45695`（自签证书，需 `curl -sk`） | ✅ 在用 | 2026-09-12 14:29 | A | `/api/status` **200** / 558ms；`POST /api/explanation` → **`mode:"ai"`**（31.6s） | 真源 = 本机 `node server/index.js`（8787）。**隧道只是出口，隧道挂了等于后端挂了。** 一键启动见 `scripts/start-backend.ps1`。 |
| **后端（备选）** | Netlify Functions | `effervescent-gingersnap-d27d31.netlify.app` | ⚠️ 配置就绪、**AI 链路未通** | 2026-09-12 14:29 | A | `/api/status` **200**；`POST /api/explanation` → **`mode:"fallback-local"`**（1.5s，快速失败） | **在 AI 复评修好前，不得作为任何验收依据。** 见 R-003。 |

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

### 4.2 关于 R-003 的排查进展（未闭环，如实记录）

- 实测：Netlify `/api/explanation` **1.5s 内**返回 `mode:"fallback-local"`，属**快速失败**
  （不是超时）；同一份讲解在本机 + 隧道链路返回 `mode:"ai"`。
- 已落地的诊断能力：降级响应新增 `aiErrorCode` 字段，输出失败**类别**而非上游正文或密钥
  （`provider-status-401/403/429`、`network`、`timeout`、`invalid-output`、`invalid-schema`）。
  下一步在 Netlify 上复跑即可从该字段读出根因类别（Key 失效 / 出网受限 / 其他）。
- **根因尚未定位，未做任何"删调试代码"动作。**

---

## 5. 已知阻断项状态

| 编号 | 阻断项 | 严重度 | 状态 |
| :--- | :--- | :--- | :--- |
| R-001 | `verify_frontend_demo.py` 在干净仓库必然失败 | P0 | **已修复**（补无密钥 `ai-config.js` 占位并入库） |
| R-002 | 本地后端 + 樱花隧道不通、无自愈 | P0 | **已修复**（一键启动 + 探活脚本；根因 = 本机服务未起） |
| R-003 | Netlify AI 复评不可用，根因未定位 | P1 | **部分**：诊断字段已加，根因待 Netlify 侧复跑确认 |
| R-004 | 契约表缺"最后实测时间 / 实测人" | P1 | **已修复**（本文件 §1 两列齐备） |
| R-005 | 自签证书端点验收条件未显式化 | P2 | **已修复**（本文件 §2） |
| R-006 | 前端双端无版本标记 | P2 | **已修复**（页脚 build 标记 + 部署时自动盖 SHA） |
