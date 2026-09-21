const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const ASSETS = path.join(FRONTEND, "assets");
const WORKSPACE_CSS = path.join(FRONTEND, "static", "css", "learning-workspace.css");
const STATIC_UTILITY_PAGES = ["hands-on/index.html", "beginner/index.html"];

test("ui-polish: tokens.css declares zero radius, 4px grid and signal tokens", () => {
  const tokensCss = fs.readFileSync(path.join(ASSETS, "tokens.css"), "utf-8");
  
  assert.match(tokensCss, /--radius:\s*0px;/, "Must declare --radius: 0px");
  assert.match(tokensCss, /--space-1:\s*4px;/, "Must declare 4px grid base");
  assert.match(tokensCss, /--space-2:\s*8px;/, "Must declare 8px grid token");
  assert.match(tokensCss, /--space-4:\s*16px;/, "Must declare 16px grid token");
  assert.match(tokensCss, /--go:\s*#2dd4bf;/, "Must declare --go signal token");
  assert.match(tokensCss, /--hold:\s*#f59e0b;/, "Must declare --hold signal token");
  assert.match(tokensCss, /--stop:\s*#f43f5e;/, "Must declare --stop signal token");
  assert.match(tokensCss, /--font-mono:/, "Must declare monospace stack");
  assert.match(tokensCss, /tabular-nums/, "Must declare tabular numbers for precision instruments");
});

test("ui-polish: tokens.css declares accessibility focus and reduced-motion contracts", () => {
  const tokensCss = fs.readFileSync(path.join(ASSETS, "tokens.css"), "utf-8");
  
  assert.match(tokensCss, /:focus-visible/, "Must declare :focus-visible rules for keyboard navigation");
  assert.match(tokensCss, /\.sr-only/, "Must declare .sr-only utility for screen readers");
  assert.match(tokensCss, /\.skip-link/, "Must declare .skip-link utility for accessibility skip");
  assert.match(tokensCss, /prefers-reduced-motion/, "Must respect prefers-reduced-motion");
});

test("ui-polish: strictly zero blur / glassmorphism across all core stylesheets", () => {
  const stylesheets = [
    "tokens.css",
    "frontend.css",
    "landing.css",
    "playground.css",
    "dashboard-demo.css",
    "chapter-demo.css",
    "ai-review.css"
  ];

  for (const sheet of stylesheets) {
    const filePath = path.join(ASSETS, sheet);
    assert.ok(fs.existsSync(filePath), `Stylesheet must exist: ${sheet}`);
    const content = fs.readFileSync(filePath, "utf-8");
    assert.doesNotMatch(content, /blur\(/, `Stylesheet ${sheet} must not contain blur()`);
  }

  const workspaceCss = fs.readFileSync(WORKSPACE_CSS, "utf-8");
  assert.doesNotMatch(workspaceCss, /blur\(/, "Learning workspace must not contain blur()");
});

test("ui-polish: strictly zero purple/pink AI gradients in core stylesheets and chapter pages", () => {
  const forbiddenColors = ["#ec4899", "#8b5cf6", "#a855f7", "#d946ef"];
  
  const stylesheets = [
    "tokens.css",
    "frontend.css",
    "landing.css",
    "playground.css",
    "dashboard-demo.css",
    "chapter-demo.css",
    "ai-review.css"
  ];

  for (const sheet of stylesheets) {
    const content = fs.readFileSync(path.join(ASSETS, sheet), "utf-8").toLowerCase();
    for (const color of forbiddenColors) {
      assert.ok(!content.includes(color), `Stylesheet ${sheet} contains forbidden color ${color}`);
    }
  }

  // Check chapter pages
  for (let i = 1; i <= 10; i++) {
    const chapterPath = path.join(FRONTEND, "chapter", String(i), "index.html");
    if (fs.existsSync(chapterPath)) {
      const content = fs.readFileSync(chapterPath, "utf-8").toLowerCase();
      for (const color of forbiddenColors) {
        assert.ok(!content.includes(color), `Chapter ${i} page contains forbidden color ${color}`);
      }
    }
  }
});

test("ui-polish: responsive media queries exist across layout sheets", () => {
  const responsiveSheets = [
    "landing.css",
    "playground.css",
    "dashboard-demo.css",
    "frontend.css"
  ];

  for (const sheet of responsiveSheets) {
    const content = fs.readFileSync(path.join(ASSETS, sheet), "utf-8");
    assert.match(content, /@media\s*\(/, `Stylesheet ${sheet} must declare responsive @media queries`);
  }

  const workspaceCss = fs.readFileSync(WORKSPACE_CSS, "utf-8");
  assert.match(workspaceCss, /@media\s*\(max-width:\s*900px\)/, "Learning workspace must collapse desktop rails on small screens");
  assert.match(workspaceCss, /grid-template-areas:[\s\S]*?"main"[\s\S]*?"navigation"[\s\S]*?"companion"/, "Mobile learning workspace must keep main content first");
});

test("ui-polish: mobile navigation stays horizontally readable instead of squeezing links", () => {
  const frontendCss = fs.readFileSync(path.join(ASSETS, "frontend.css"), "utf-8");
  assert.match(frontendCss, /\.demo-nav-links a\s*\{[\s\S]*?flex:\s*0 0 auto/, "Shared nav links must not shrink into vertical labels");
  assert.match(frontendCss, /\.demo-nav-links\s*\{[\s\S]*?overflow-x:\s*auto/, "Shared nav must allow horizontal navigation on small screens");
  assert.match(frontendCss, /\.demo-nav-links a\.active\s*\{[\s\S]*?border-bottom-color:\s*var\(--go\)/, "Active route must remain visible in the shared nav");
});

test("ui-polish: evidence and lab pages retain competition density on tablet and mobile", () => {
  const reviewCss = fs.readFileSync(path.join(ASSETS, "ai-review.css"), "utf-8");
  const playgroundCss = fs.readFileSync(path.join(ASSETS, "playground.css"), "utf-8");
  assert.match(reviewCss, /@media\s*\(min-width:\s*700px\)[\s\S]*?\.case-content-grid[\s\S]*?grid-template-columns:\s*1fr 1fr/, "AI review evidence should use two columns from tablet width");
  assert.match(reviewCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.kpi-grid[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/, "AI review KPIs should stay dense on mobile");
  assert.match(playgroundCss, /minmax\(300px,\s*1fr\)/, "Lab grid should support two compact columns on tablet");
  assert.doesNotMatch(playgroundCss.toLowerCase(), /#a78bfa/, "Lab status badges must stay inside the three-signal palette");
});

test("ui-polish: hands-on and beginner pages use the shared instrument system", () => {
  const forbidden = /blur\(|backdrop-filter\s*:|(?:linear|radial)-gradient\(|#aaa0ff|#bfb4ff|#a78bfa|border-radius:\s*(?:20|24|999)px/i;
  for (const relPage of STATIC_UTILITY_PAGES) {
    const html = fs.readFileSync(path.join(FRONTEND, relPage), "utf-8");
    assert.match(html, /assets\/tokens\.css/, `${relPage} must load the shared tokens`);
    assert.doesNotMatch(html, forbidden, `${relPage} must not regress to rounded, blurred or purple SaaS styling`);
  }
});

test("ui-polish: core sprint HTML pages have valid doctype and link tokens.css", () => {
  const pages = [
    "index.html",
    "dashboard/index.html",
    "playground/index.html",
    "ai-review/index.html",
    "chapter/1/index.html",
    "hands-on/index.html",
    "beginner/index.html"
  ];

  for (const relPage of pages) {
    const fullPath = path.join(FRONTEND, relPage);
    assert.ok(fs.existsSync(fullPath), `Page must exist: ${relPage}`);
    const html = fs.readFileSync(fullPath, "utf-8");
    assert.match(html, /<!doctype html>/i, `Page ${relPage} must have standard <!DOCTYPE html>`);
    assert.match(html, /tokens\.css/, `Page ${relPage} must import tokens.css`);
    assert.match(html, /viewport/, `Page ${relPage} must have viewport meta tag`);
  }
});
