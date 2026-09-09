/**
 * AI Master — AI 复评配置文件（示例模板）
 *
 * 实际使用时复制本文件为 ai-config.js 并填入真实密钥：
 *   cp frontend/static/js/ai-config.example.js frontend/static/js/ai-config.js
 *
 * ⚠️ ai-config.js 已加入 .gitignore，不会被提交到 git 仓库。
 *
 * 获取 DeepSeek API Key：
 *   1. 注册 https://platform.deepseek.com/
 *   2. 在 API Keys 页面创建新密钥
 *
 * 如果 apiKey 为空字符串，AI 复评将自动降级为本地规则检查。
 */
window.AI_CONFIG = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  maxTokens: 1024,
  temperature: 0.3,
  timeoutMs: 30000
};
