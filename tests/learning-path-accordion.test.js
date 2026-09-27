"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const modules = Promise.all([
  import("../frontend/ai-learning/data.js"),
  import("../frontend/ai-learning/components.js")
]).then(function ([data, components]) {
  return { STAGES: data.STAGES, renderLevelNav: components.renderLevelNav, knowledgeLessonHref: components.knowledgeLessonHref };
});

test("learning path renders each stage as an accessible expandable lesson list", async () => {
  const { STAGES, renderLevelNav, knowledgeLessonHref } = await modules;
  const html = renderLevelNav(1);

  assert.match(html, /data-level-index="1"[^>]*aria-current="step"/);
  assert.doesNotMatch(html, /aria-pressed=/, "Stage controls should remain disclosure buttons, not checkbox toggles");

  for (const [stageIndex, stage] of STAGES.entries()) {
    const expanded = stage.id === 2;
    assert.ok(
      html.includes('data-level-index="' + stageIndex + '"') &&
        html.includes('aria-controls="level-lessons-' + stage.id + '"') &&
        html.includes('aria-expanded="' + expanded + '"'),
      "Level " + stage.id + " should expose its expanded state"
    );
    assert.ok(html.includes('id="level-lessons-' + stage.id + '"'), "Level " + stage.id + " should have a controlled lesson list");
    if (!expanded) assert.match(html, new RegExp('id="level-lessons-' + stage.id + '"[^>]*hidden'));

    stage.lessons.forEach(function (title, lessonIndex) {
      const href = knowledgeLessonHref(stage.id, lessonIndex);
      assert.ok(html.includes('href="' + href + '"'), "Missing Level " + stage.id + " lesson link: " + title);
      assert.ok(html.includes(stage.id + "." + (lessonIndex + 1)), "Missing numbered lesson " + stage.id + "." + (lessonIndex + 1));
      const file = href.startsWith("/knowledge/")
        ? path.join(ROOT, "frontend", href.replace(/^\//, ""), "index.html")
        : path.join(ROOT, "frontend", "chapter", "4", "index.html");
      assert.ok(fs.existsSync(file), "Lesson link should resolve to a page: " + href);
    });
  }
});

test("learning path can start with every lesson list collapsed", async () => {
  const { STAGES, renderLevelNav } = await modules;
  const html = renderLevelNav(1, null);

  for (const stage of STAGES) {
    assert.ok(html.includes('aria-expanded="false" aria-controls="level-lessons-' + stage.id + '"'));
    assert.match(html, new RegExp('id="level-lessons-' + stage.id + '"[^>]*hidden'));
  }
});
