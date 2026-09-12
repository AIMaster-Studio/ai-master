/**
 * AI Master — AI 复评配置文件（示例模板）
 *
 * ⚠️⚠️ 请先读完这一段再动手 ⚠️⚠️
 *
 * 1. `frontend/static/js/ai-config.js` **会被提交进 git 仓库，也会被部署到公网**。
 *    它受版本控制（`git ls-files` 能查到它），浏览器访问者可以直接读取。
 *    **所以：仓库里只保留 `apiKey: ""` 的空值占位，任何真实密钥都不要写进这个文件。**
 *
 * 2. 本文件（`*.example.js`）只是模板，**不要把它复制成 ai-config.js 再填密钥** ——
 *    那正是本项目历史上公网明文密钥泄漏的成因。
 *    需要真实模型时，请把密钥配在**本机 `server/**` 读取的环境变量**里（`.env` 已被 gitignore）。
 *
 * 3. 为什么空值占位也要入库：`scripts/verify_frontend_demo.py` 会校验页面引用的静态资源是否存在，
 *    该文件缺失时任何干净克隆都会在校验时失败（见 REVIEW.md R-001）。
 *
 * 获取 DeepSeek API Key：
 *   1. 注册 https://platform.deepseek.com/
 *   2. 在 API Keys 页面创建新密钥 —— **只配到本机环境变量，不要配到前端文件**
 *
 * 如果 apiKey 为空字符串，AI 复评将自动降级为本地规则检查（学习流程不中断）。
 */
window.AI_CONFIG = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  maxTokens: 1024,
  temperature: 0.3,
  timeoutMs: 30000
};
