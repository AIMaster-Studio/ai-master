# AI Master

面向大学生 AI 通识与 RAG 入门的学习原型。保留原有星际课程、知识星海与鲸鱼娘交互，本次增加"讲解通关"工作台：学习者自己解释概念，再完成独立客观测验，保存尝试、错题和复习记录。

这是**纯静态前端**部署的原型：课程页面、学习工作台与本地降级规则打包到 Cloudflare Pages，不需要后端服务器。可选启用 Firebase Realtime Database 做跨设备同步、调用 DeepSeek API 做 AI 讲解复评；两者未配置时自动降级为浏览器 localStorage + 本地规则检查，仍可正常学习。

当前仓库不证明存在此前文档提及的私有 Flask 完整版，也不包含真实学生数据、生产服务凭据或商业效果证明。

## 在线部署

**当前生产部署**：https://ai-master-aw5.pages.dev/  （Cloudflare Pages）

学习教练入口：https://ai-master-aw5.pages.dev/learning-center/

### Cloudflare Pages（当前方案，免费、无需信用卡）

使用 `wrangler` CLI 直接上传 `frontend/` 目录：

```bash
# 1. 安装 wrangler（Node.js 22+）
npx wrangler --version

# 2. 登录或设置 API Token
#    在 https://dash.cloudflare.com/profile/api-tokens 创建 Token
#    使用 "Edit Cloudflare Workers" 模板（包含 Pages 部署权限）
$env:CLOUDFLARE_API_TOKEN = "<your-token>"   # PowerShell
# export CLOUDFLARE_API_TOKEN=<your-token>   # bash

# 3. 部署到生产分支
npx wrangler pages deploy ./frontend --project-name=ai-master --branch=main --commit-dirty=true
```

首次部署会自动创建 `ai-master` 项目，分配 `ai-master-xxxx.pages.dev` 子域名。后续部署增量上传。

**单文件大小限制 25 MiB**：超过会被 wrangler 拒绝。`frontend/static/bgm.mp3` 原始 37 MB，已用 `ffmpeg -b:a 64k -ac 1` 压缩到 14.5 MB。

### 配置文件

| 文件 | 作用 | 是否必填 |
|------|------|------|
| `frontend/_redirects` | Cloudflare Pages 路由：根路径重定向到学习中心 | ✅ 已内置 |
| `frontend/_headers` | 安全头 + 静态资源缓存策略 | ✅ 已内置 |
| `frontend/static/js/firebase-config.js` | Firebase SDK 配置（占位符时自动降级） | ❌ 占位符即可 |
| `frontend/static/js/ai-config.js` | DeepSeek API 密钥与模型配置 | ❌ 空时降级本地规则 |

### Firebase Realtime Database（可选，跨设备同步）

1. 在 [Firebase Console](https://console.firebase.google.com/) 创建项目
2. 启用 Realtime Database（测试模式即可）
3. 项目设置 → 常规 → 添加 Web 应用，复制配置
4. 替换 `frontend/static/js/firebase-config.js` 中的占位符
5. 重新部署 `npx wrangler pages deploy ./frontend --project-name=ai-master --branch=main --commit-dirty=true`

**未配置（保持占位符）时**：前端自动降级为 localStorage 本地模式，网站仍可正常浏览与学习，只是数据不跨设备同步。

### DeepSeek AI 复评（可选）

1. 在 [DeepSeek Platform](https://platform.deepseek.com/) 获取 API Key
2. 编辑 `frontend/static/js/ai-config.js`，填入 `apiKey`、`baseUrl`、`model`
3. 重新部署

**未配置（`apiKey` 为空）时**：讲解评价降级为本地规则检查（字数、关键词、举例、局限性四项命中三项即通过）。

> ⚠️ **安全风险**：纯静态部署无法用环境变量隐藏密钥。写入 `ai-config.js` 的 API Key 会被任何访问者从浏览器开发者工具读取。仅使用低配额密钥；如需隐藏密钥，应改为 Cloudflare Worker 代理方案（未在本原型实现）。

## 启动学习工作台

### 在线（推荐）

直接访问 https://ai-master-aw5.pages.dev/learning-center/

### 本地预览（不调用 AI、不写 Firebase）

只浏览静态课程时，在仓库根目录运行：

```bash
python -m http.server 8080
```

打开 [http://127.0.0.1:8080/frontend/](http://127.0.0.1:8080/frontend/)。也可双击 `frontend/start-demo.bat` 使用已有静态入口。不要以 `file://` 打开依赖 JSON 请求的页面。

本地预览模式下：
- 讲解评价使用本地规则（不调用 DeepSeek）
- 数据保存到浏览器 localStorage（不写入 Firebase）
- 访客模式进入，不区分账号

已有 Electron 桌面入口在安装依赖后通过 `npm start` 启动；`npm run pack` 为 Windows 打包命令。浏览器本机服务是本次学习流程验收入口，桌面分发应单独核查资源、许可与服务能力。

## 通关规则与范围

- 讲解满足当前检查条件，且客观测验至少达到 75%，才记录该模块通关。客观题由预设标答判分，不由语言模型决定。
- 未配置 AI 时明确使用本地练习规则；配置后调用 DeepSeek 返回 JSON 评分（`accepted`、`score`、`feedback`、`strengths`、`improvements`），调用失败明确降级到本地规则且不自动判定通过，可重试。启用远程模型时相关讲解与上下文会发送给 DeepSeek。
- 当前重点覆盖 7 个核心模块，见 [模块与题库](frontend/data/learning-curriculum.json)。这不等于 57 个原有节点都已有独立通关题库。
- 原有 10 章、57 个课程节点保留。第七章首节点正文缺失，部分历史内容与工具配置待事实审校，见 [事实边界](docs/ican/facts-and-limits.md)。
- [57 节点认知教学设计](frontend/data/knowledge-cognitive-map.json) 给出逐节点任务、证据与建议先修，属于团队设计建议，尚无教育效果验证。

## 检查与材料

```bash
python scripts/verify_frontend_demo.py
```

检查静态演示完整性。命令列出不代表已在所有设备通过；结果以实际测试记录为准。

- [项目说明](项目说明.md)：架构、数据与能力边界。
- [创新赛道材料](docs/ican/README.md)：五分钟答辩稿、七方向问答、商业假设与研究计划。
- [版权与资产核查](docs/ican/third-party-notices.md)：来源、许可限制与授权事项。

## 许可

项目代码见 [MIT LICENSE](LICENSE)。鲸鱼娘与动作来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，保留原形象、全部已有动作与署名。**上游 README 区分代码 MIT 与素材禁止商用，不能把 MIT 扩大为全部角色动画的商用许可。** 商业化前需核清权利并获得适用授权。字体、音频、图像及外部课程也不能仅因随仓库存在就视为团队原创。
