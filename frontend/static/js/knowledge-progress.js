(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIMasterKnowledgeProgress = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mergeProgress(universe, catalog, state) {
    const linked = new Map();
    for (const module of catalog.modules || []) {
      const completedAt = state.progress?.[module.id]?.completedAt;
      const completed = typeof completedAt === 'string' && Number.isFinite(Date.parse(completedAt));
      for (const nodeId of new Set(module.nodeIds || [])) {
        if (!linked.has(nodeId)) linked.set(nodeId, []);
        linked.get(nodeId).push({ id: module.id, title: module.title, completed });
      }
    }
    const stageChapters = { 1: 1, 2: 3, 3: 5, 4: 4, 5: 10, 6: 9 };
    const stageTitles = { 1: 'AI 基础认知', 2: 'Prompt Engineering', 3: 'AI 工具', 4: 'AI 工作流', 5: 'AI Agent', 6: 'AI 项目' };
    for (const [nodeKey, progress] of Object.entries(state.nodeProgress || {})) {
      const match = /^(\d)\.(\d)$/.exec(nodeKey);
      const completedAt = progress && progress.completedAt;
      if (!match || typeof completedAt !== 'string' || !Number.isFinite(Date.parse(completedAt))) continue;
      const stageId = Number(match[1]);
      const chapterId = stageChapters[stageId];
      if (!chapterId) continue;
      const sourceNodeId = `chapter-${chapterId}-kp-${Number(match[2])}`;
      if (!linked.has(sourceNodeId)) linked.set(sourceNodeId, []);
      linked.get(sourceNodeId).push({
        id: `knowledge-node-${nodeKey}`,
        title: stageTitles[stageId] + ' · ' + nodeKey,
        completed: true,
      });
    }
    let completedCount = 0;
    let starCount = 0;
    const galaxies = universe.galaxies.map((galaxy) => {
      let galaxyCompleted = 0;
      const stars = galaxy.stars.map((star) => {
        const nodeId = `chapter-${star.chapter}-kp-${star.index + 1}`;
        const linkedModules = linked.get(nodeId) || [];
        const completedModules = linkedModules.filter((module) => module.completed);
        const completed = completedModules.length > 0;
        if (completed) galaxyCompleted += 1;
        return {
          ...star, linkedModules, completedModules,
          status: completed ? 'completed' : star.status === 'completed' ? 'available' : star.status,
        };
      });
      completedCount += galaxyCompleted;
      starCount += stars.length;
      return { ...galaxy, stars, progress: stars.length ? Math.round(galaxyCompleted / stars.length * 100) : 0 };
    });
    return {
      ...universe, galaxies, progressSource: 'local-profile',
      summary: { ...universe.summary, galaxies: galaxies.length, stars: starCount, completed: completedCount },
    };
  }

  return { mergeProgress };
});
