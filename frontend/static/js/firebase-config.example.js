/**
 * AI Master — Firebase 配置文件（示例模板）
 *
 * 实际使用时复制本文件为 firebase-config.js 并填入真实配置：
 *   cp frontend/static/js/firebase-config.example.js frontend/static/js/firebase-config.js
 *
 * ⚠️ firebase-config.js 已加入 .gitignore，不会被提交到 git 仓库。
 *
 * 获取 Firebase 配置：
 *   1. 在 https://console.firebase.google.com/ 创建项目
 *   2. 项目设置 → 常规 → 添加 Web 应用
 *   3. 复制应用配置（apiKey、authDomain、databaseURL 等）
 *   4. 启用 Realtime Database（测试模式即可）
 *
 * 如果保持占位符（PLACEHOLDER），前端会自动降级为 localStorage 本地模式。
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSy_PLACEHOLDER_REPLACE_AFTER_FIREBASE_SETUP",
  authDomain: "ai-master-xxxxx.firebaseapp.com",
  databaseURL: "https://ai-master-xxxxx-default-rtdb.firebaseio.com",
  projectId: "ai-master-xxxxx",
  storageBucket: "ai-master-xxxxx.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};
