/**
 * AI Master — AI 复评配置（无密钥占位版 · 随仓库入库）
 *
 * 本文件是**可直接入库的无密钥占位**：apiKey 为空时，AI 复评自动降级为本地
 * 规则检查，学习流程不中断（与 README「未配置时降级为本地规则」一致）。
 *
 * 约定：仓库只保留无密钥占位；真实密钥只写在本地、不提交。
 * 需要接入真实模型时，把下方 apiKey 填成自己的密钥即可（仅本地修改，不要提交）。
 *
 * 模板与说明见同目录 ai-config.example.js。
 * 为什么入库：`scripts/verify_frontend_demo.py` 会校验页面引用的静态资源是否存在，
 * 该文件被排除时，任何干净克隆都会在校验时失败（见 REVIEW.md R-001）。
 */
window.AI_CONFIG = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  maxTokens: 1024,
  temperature: 0.3,
  timeoutMs: 30000
};
