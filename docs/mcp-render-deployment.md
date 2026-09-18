# Render 固定后端部署准备

2026-09-17 · AI 辅助制作。当前状态：准备配置，尚未创建 Render 服务。

本地验收：npm run verify 退出码 0，142/142 测试通过；前端 30 页、368 内链、57/57 节点覆盖通过，git diff --check 无输出。首次回归发现 persistentDb 引用遗漏，修复后全量复跑通过。尚未在 Render 云端验证 Blueprint 和运行时。

## 本批改动

- `server/storage-paths.js`：增加 AIMASTER_DATA_ROOT 绝对路径配置，SQLite 与 RAG/记忆/技能/Agent 文件共用持久磁盘；显式 options 优先，临时测试实例不读取生产磁盘路径。
- `render.yaml`：Starter 常驻 Node 服务、1 GB 持久磁盘、Node 24、npm ci --omit=dev；部署 fix/ican-review-20260917 分支，关闭自动部署。
- 不再强制要求 Turso。新服务默认 SQLite 保存在挂载磁盘；如果已有 Turso 数据，不要直接切换，必须单独制定迁移方案。
- 现有电脑上的数据不会自动上传。需要迁移时先停止写入、备份并验证恢复，禁止直接覆盖云端数据库。

## 在 Render 控制台操作

1. 登录 https://dashboard.render.com/ ，New → Blueprint，授权 GitHub 仓库 AIMaster-Studio/ai-master。
2. 选择分支 fix/ican-review-20260917，配置文件 render.yaml。不要误选尚未包含本次修改的 master。
3. 核对 Starter 套餐、1 GB 磁盘、新加坡区域及控制台显示的费用。创建服务会产生费用，必须由账户所有者确认。
4. 在控制台填写 DEEPSEEK_API_KEY 和账号实际可用的 DEEPSEEK_MODEL；密钥不发送到聊天、不写 Git。AIMASTER_CONFIG_TOKEN 由平台生成。
5. 创建并部署后，把 Render 分配的 HTTPS 服务地址提供给助手。公开域名不是密钥。
6. 先直连 /api/status，再进行 AI 复评与存储持久化验收。状态接口 200 不证明模型、RAG 和记忆功能均已成功。
7. 后端验收通过后，再配置 Cloudflare Pages 的 BACKEND_ORIGIN 为该 HTTPS origin，并部署整改分支的 frontend/_worker.js。GitHub Pages 静态站不能自动获得同源 /api 代理。

## 安全及验收边界

- 不放宽现有管理接口：RAG 建库等管理操作仍要求回环对端及管理令牌。需要通过 Render Shell 在服务内部执行，不向所有公网用户开放管理接口。
- 持久磁盘适用于单实例；不要直接多实例共享 SQLite。数据库备份和恢复演练仍须安排，磁盘不等于备份。
- 记录 Render 部署 SHA、模型名、时间。验证讲解复评确实 mode=ai；模型失败不自动通过。
- 使用专用测试账户：创建学习记录、记忆和知识库；重启或重新部署后确认仍存在。
- 连续 30 次完整链路与 p95 统计尚未执行；真实模型调用可能收费，先确认再跑。
- 云端创建、账单授权、密钥配置、正式访问地址和 Cloudflare 更新均未完成，不能宣称已上线。
