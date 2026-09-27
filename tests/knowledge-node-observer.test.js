"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Model the browser's relevant DOM behavior: setting textContent replaces its
// text child even when the string is unchanged, and observer delivery is deferred.
// Delivery is bounded here so a regression reports a failure instead of hanging.
async function mountProgressIndicators() {
  const { STAGES } = await import("../frontend/ai-learning/data.js");
  const observers = [];
  const listeners = new Map();
  const route = { dataset: {} };
  let visibleText = "0/6 已通关";
  const stageProgress = {
    dataset: { nodeStageProgress: "2" },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    get textContent() { return visibleText; },
    set textContent(value) {
      visibleText = String(value);
      for (const observer of observers) if (observer.active) {
        observer.pending.push({ type: "childList", target: stageProgress });
      }
    }
  };
  class DeferredMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      this.pending = [];
      this.deliveries = 0;
      observers.push(this);
    }
    observe(target) {
      assert.equal(target, route);
      this.active = true;
    }
    disconnect() {
      this.active = false;
      this.pending = [];
    }
  }
  const context = {
    STAGES,
    MutationObserver: DeferredMutationObserver,
    location: { pathname: "/learning-path/", href: "http://localhost/learning-path/?stage=2", hash: "" },
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      getElementById() { return {}; },
      querySelector(selector) { return selector === ".path-layout" ? route : null; },
      querySelectorAll(selector) { return selector === "[data-node-stage-progress]" ? [stageProgress] : []; }
    },
    window: {
      addEventListener(name, callback) { listeners.set(name, callback); },
      dispatchEvent(event) { listeners.get(event.type)?.(event); }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: async () => ({ ok: true, json: async () => ({ nodes: {}, userId: "regression", aiConfigured: false }) }),
    URL,
    setTimeout,
    clearTimeout,
    AbortSignal
  };
  const filename = path.join(__dirname, "../frontend/assets/knowledge-node-flow.js");
  const source = fs.readFileSync(filename, "utf8")
    .replace(/^import[^\n]+\n/, "")
    .replace(/^export function /gm, "function ");
  vm.runInNewContext(source + "\nglobalThis.mountIndicators = initKnowledgeNodeProgressIndicators;", context, { filename });
  context.mountIndicators();
  await new Promise(resolve => setImmediate(resolve));

  function flushMutations(limit = 20) {
    for (let round = 0; round < limit; round++) {
      const pending = observers.filter(observer => observer.pending.length);
      if (!pending.length) return true;
      for (const observer of pending) {
        const records = observer.pending.splice(0);
        observer.deliveries++;
        observer.callback(records, observer);
      }
    }
    return observers.every(observer => !observer.pending.length);
  }
  return { stageProgress, observers, flushMutations };
}

test("learning route progress refresh reaches idle instead of starving user interaction", async () => {
  const page = await mountProgressIndicators();
  assert.equal(page.flushMutations(), true, "Progress rendering must not continually retrigger its own observer");
  assert.ok(page.observers[0].deliveries <= 2, "A progress refresh should settle after a bounded number of deliveries");

  // A later stage render must still refresh its progress and then settle.
  page.stageProgress.textContent = "new stage awaiting progress";
  assert.equal(page.flushMutations(), true);
  assert.equal(page.stageProgress.textContent, "0/6 已通关");
  assert.equal(page.observers[0].active, true, "The observer must keep tracking subsequent stage changes");
});
