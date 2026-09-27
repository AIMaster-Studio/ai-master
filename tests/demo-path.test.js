const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");

test("demo-path: dynamic root links to real routes and the learning app retains its review flow", () => {
  const landingHtml = fs.readFileSync(path.join(FRONTEND, "index.html"), "utf-8");
  const app = fs.readFileSync(path.join(FRONTEND, "ai-learning", "pages.js"), "utf-8");

  assert.match(landingHtml, /assets\/ai-master-home\.js/, "Root must load the dynamic hero navigation");
  assert.match(app, /三分钟看懂 AI Master/, "The learning app must retain the 3-minute review flow");
  const routes = [
    "/beginner/",
    "/learning-path/?stage=1",
    "/knowledge/1-1/",
    "/knowledge/2-1/",
    "/knowledge/3-1/",
    "/knowledge/3-5/",
    "/knowledge/6-2/",
    "/learning-center/",
    "/hands-on/",
    "/playground/",
    "/course-progress/",
    "/courses/?q=",
    "/knowledge-stars/",
    "/experiments/"
  ];
  for (const route of routes) {
    assert.ok(landingHtml.includes(`href="${route}" data-ai-path="${route}"`), `Root menu must link to ${route}`);
  }
  assert.match(app, /role="tablist" aria-label="三分钟演示步骤"/, "Review stepper must expose accessible tab navigation");
  assert.match(app, /href: "\/course-progress\/"/, "Step 1 must link to the actual course progress page");
  assert.match(app, /href: "\/experiments\/"/, "Step 2 must link to the preserved experiments");
  assert.match(app, /href: "\/ai-review\/"/, "Step 3 must link to review evidence");
  assert.match(app, /href: "\/learning-center\/"/, "Step 4 must link to explain-and-review practice");
});

test("demo-path: step 1 (course progress) contains tour banner, seed controls and next link", () => {
  const progressHtml = fs.readFileSync(path.join(FRONTEND, "course-progress", "index.html"), "utf-8");

  assert.match(progressHtml, /DEMO TOUR 1\/4/, "Course progress must display Demo Tour Step 1");
  assert.match(progressHtml, /id="btn-seed-demo"/, "Course progress must have demo seed button");
  assert.match(progressHtml, /id="btn-reset-demo"/, "Course progress must have demo reset button");
  assert.match(progressHtml, /href="\.\.\/experiments\/"/, "Course progress must link to step 2 experiments");
});

test("demo-path: step 2 (experiments) links to progress and review evidence", () => {
  const experimentsHtml = fs.readFileSync(path.join(FRONTEND, "experiments", "index.html"), "utf-8");

  assert.match(experimentsHtml, /DEMO TOUR 2\/4/, "Experiments must display Demo Tour Step 2");
  assert.match(experimentsHtml, /href="\.\.\/course-progress\/"/, "Experiments must link back to course progress");
  assert.match(experimentsHtml, /href="\.\.\/ai-review\/"/, "Experiments must link next to review evidence");
});

test("demo-path: step 3 (AI review) links back to experiments and forward to chapter 1", () => {
  const reviewHtml = fs.readFileSync(path.join(FRONTEND, "ai-review", "index.html"), "utf-8");

  assert.match(reviewHtml, /DEMO TOUR 3\/4/, "AI Review must display Demo Tour Step 3");
  assert.match(reviewHtml, /href="\.\.\/experiments\/"/, "AI Review must link back to experiments");
  assert.match(reviewHtml, /href="\.\.\/chapter\/1\/"/, "AI Review must link next to chapter 1");
});

test("demo-path: step 4 (chapter 1) completes the loop to course progress", () => {
  const chapterHtml = fs.readFileSync(path.join(FRONTEND, "chapter", "1", "index.html"), "utf-8");

  assert.match(chapterHtml, /DEMO TOUR 4\/4/, "Chapter 1 must display Demo Tour Step 4");
  assert.match(chapterHtml, /href="\.\.\/\.\.\/ai-review\/"/, "Chapter 1 must link back to AI review");
  assert.match(chapterHtml, /href="\.\.\/\.\.\/course-progress\/"/, "Chapter 1 must complete loop to course progress");
});

test("demo-path: frontend runtime provides resilient seed and reset state management", () => {
  const runtimeJs = fs.readFileSync(path.join(FRONTEND, "assets", "frontend.js"), "utf-8");

  assert.match(runtimeJs, /initDemoSeedControls/, "Runtime must declare demo seed controls");
  assert.match(runtimeJs, /btn-seed-demo/, "Runtime must bind seed button");
  assert.match(runtimeJs, /btn-reset-demo/, "Runtime must bind reset button");
  assert.match(runtimeJs, /aimaster_learning_state/, "Runtime must manage aimaster_learning_state in localStorage");

  const requiredModules = ["llm-basics", "transformer", "prompt-design", "agent-tools", "rag-retrieval", "rag-evaluation", "agent-safety"];
  for (const moduleId of requiredModules) {
    assert.ok(runtimeJs.includes(moduleId), `Seed demo state must include module: ${moduleId}`);
  }
});
