const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");

test("demo-path: landing page contains 3-minute review path and checkpoint links", () => {
  const landingHtml = fs.readFileSync(path.join(FRONTEND, "index.html"), "utf-8");
  
  assert.match(landingHtml, /href="dashboard\/"/, "Landing must link to dashboard");
  assert.match(landingHtml, /href="playground\/"/, "Landing must link to playground");
  assert.match(landingHtml, /href="ai-review\/"/, "Landing must link to ai-review");
  assert.match(landingHtml, /href="chapter\/1\/"/, "Landing must link to chapter 1");
  assert.match(landingHtml, /3-MINUTE (FLOW|COMPETITION DEMO PATH)/, "Landing must display demo path kicker");
});

test("demo-path: step 1 (dashboard) contains tour banner, seed controls and next link", () => {
  const dashHtml = fs.readFileSync(path.join(FRONTEND, "dashboard", "index.html"), "utf-8");
  
  assert.match(dashHtml, /DEMO TOUR 1\/4/, "Dashboard must display Demo Tour Step 1");
  assert.match(dashHtml, /id="btn-seed-demo"/, "Dashboard must have demo seed button");
  assert.match(dashHtml, /id="btn-reset-demo"/, "Dashboard must have demo reset button");
  assert.match(dashHtml, /href="\.\.\/playground\/"/, "Dashboard must link to step 2 playground");
});

test("demo-path: step 2 (playground) contains tour banner with prev and next links", () => {
  const playHtml = fs.readFileSync(path.join(FRONTEND, "playground", "index.html"), "utf-8");
  
  assert.match(playHtml, /DEMO TOUR 2\/4/, "Playground must display Demo Tour Step 2");
  assert.match(playHtml, /href="\.\.\/dashboard\/"/, "Playground must link back to dashboard");
  assert.match(playHtml, /href="\.\.\/ai-review\/"/, "Playground must link next to ai-review");
});

test("demo-path: step 3 (ai-review) contains tour banner with prev and next links", () => {
  const revHtml = fs.readFileSync(path.join(FRONTEND, "ai-review", "index.html"), "utf-8");
  
  assert.match(revHtml, /DEMO TOUR 3\/4/, "AI Review must display Demo Tour Step 3");
  assert.match(revHtml, /href="\.\.\/playground\/"/, "AI Review must link back to playground");
  assert.match(revHtml, /href="\.\.\/chapter\/1\/"/, "AI Review must link next to chapter 1");
});

test("demo-path: step 4 (chapter 1) contains tour banner completing loop to dashboard", () => {
  const ch1Html = fs.readFileSync(path.join(FRONTEND, "chapter", "1", "index.html"), "utf-8");
  
  assert.match(ch1Html, /DEMO TOUR 4\/4/, "Chapter 1 must display Demo Tour Step 4");
  assert.match(ch1Html, /href="\.\.\/\.\.\/ai-review\/"/, "Chapter 1 must link back to ai-review");
  assert.match(ch1Html, /href="\.\.\/\.\.\/dashboard\/"/, "Chapter 1 must complete loop back to dashboard");
});

test("demo-path: frontend runtime provides resilient seed and reset state management", () => {
  const runtimeJs = fs.readFileSync(path.join(FRONTEND, "assets", "frontend.js"), "utf-8");
  
  assert.match(runtimeJs, /initDemoSeedControls/, "Runtime must declare demo seed controls");
  assert.match(runtimeJs, /btn-seed-demo/, "Runtime must bind seed button");
  assert.match(runtimeJs, /btn-reset-demo/, "Runtime must bind reset button");
  assert.match(runtimeJs, /aimaster_learning_state/, "Runtime must manage aimaster_learning_state in localStorage");

  // Verify all 7 core modules are seeded
  const requiredModules = [
    "llm-basics",
    "transformer",
    "prompt-design",
    "agent-tools",
    "rag-retrieval",
    "rag-evaluation",
    "agent-safety"
  ];
  for (const modId of requiredModules) {
    assert.ok(runtimeJs.includes(modId), `Seed demo state must include module: ${modId}`);
  }
});
