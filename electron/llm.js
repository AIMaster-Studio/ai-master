// AIMaster 真实大模型接入（OpenAI 兼容接口，如 DeepSeek / OpenAI / 阿里云等）
const fs = require('fs');
const path = require('path');

// 内置默认配置：未在用户配置文件中覆盖时使用，使桌面端开箱即用。
const BUILTIN_LLM_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-6c8055436eda7b9835a9e51fe42d90d94794f7888a8f342d7eff199c6906a06a',
  model: 'deepseek-chat'
};

function createLlm(configFile) {
  const store = {
    filePath: configFile,
    data: null,
    load() {
      try {
        if (fs.existsSync(this.filePath)) {
          this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        }
      } catch (e) {
        console.error('[llm] 读取配置失败', e.message);
      }
      if (!this.data || typeof this.data !== 'object') {
        this.data = { ...BUILTIN_LLM_CONFIG };
      }
      // 字段缺失时回填内置默认，避免旧配置文件缺少 baseUrl/model/apiKey。
      this.data.baseUrl = this.data.baseUrl || BUILTIN_LLM_CONFIG.baseUrl;
      this.data.model = this.data.model || BUILTIN_LLM_CONFIG.model;
      this.data.apiKey = this.data.apiKey || BUILTIN_LLM_CONFIG.apiKey;
      return this.data;
    },
    save(cfg) {
      this.data = {
        baseUrl: (cfg && cfg.baseUrl) || BUILTIN_LLM_CONFIG.baseUrl,
        apiKey: (cfg && cfg.apiKey) || BUILTIN_LLM_CONFIG.apiKey,
        model: (cfg && cfg.model) || BUILTIN_LLM_CONFIG.model
      };
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
      return this.data;
    },
    getPublicConfig() {
      this.load();
      return { baseUrl: this.data.baseUrl, model: this.data.model, hasKey: !!this.data.apiKey };
    },
    async chat(messages) {
      this.load();
      if (!this.data.apiKey) throw new Error('未配置 API Key');
      const base = this.data.baseUrl.replace(/\/+$/, '');
      const urls = [];
      if (/\/v1$/.test(base)) {
        urls.push(base + '/chat/completions');
      } else {
        urls.push(base + '/chat/completions');
        urls.push(base + '/v1/chat/completions');
      }
      let lastError = null;
      for (const url of urls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + this.data.apiKey
            },
            body: JSON.stringify({
              model: this.data.model,
              messages: messages,
              temperature: 0.7
            }),
            signal: controller.signal
          });
          if (!res.ok) {
            const text = await res.text();
            lastError = new Error('LLM 请求失败 ' + res.status + ': ' + text.slice(0, 200));
            continue;
          }
          const data = await res.json();
          const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          if (!content) throw new Error('LLM 返回内容为空');
          return { ok: true, content };
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError || new Error('LLM 请求失败');
    }
  };
  store.load();
  return store;
}

module.exports = { createLlm, BUILTIN_LLM_CONFIG };
