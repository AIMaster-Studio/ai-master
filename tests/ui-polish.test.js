const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const ASSETS = path.join(FRONTEND, "assets");

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
});

test("ui-polish: core sprint HTML pages have valid doctype and link tokens.css", () => {
  const pages = [
    "index.html",
    "dashboard/index.html",
    "playground/index.html",
    "ai-review/index.html",
    "chapter/1/index.html"
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
