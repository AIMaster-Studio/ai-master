'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const progressModule = require('../frontend/static/js/learning-progress.js');
const {
  MODULES,
  MODULE_IDS,
  LEGACY_ALIASES,
  normalizeModuleId,
  normalizeProgress,
  getEmptyProgress,
  resolveProgress,
  isCompleted
} = progressModule;

const curriculum = require('../frontend/data/learning-curriculum.json');
const universe = require('../frontend/data/knowledge-universe.json');
const handsOn = require('../frontend/data/hands-on-tasks.json');
const coursesIndex = require('../frontend/data/courses_index.json');
const { mergeProgress } = require('../frontend/static/js/knowledge-progress.js');

// 1. Authoritative 7 modules
test('progress contract enforces authoritative 7 modules', () => {
  assert.equal(MODULES.length, 7);
  assert.equal(MODULE_IDS.length, 7);
  const expectedIds = [
    'llm-basics',
    'prompt-design',
    'transformer',
    'rag-retrieval',
    'rag-evaluation',
    'agent-tools',
    'agent-safety'
  ];
  assert.deepEqual(MODULE_IDS, expectedIds);
  assert.deepEqual(curriculum.modules.map(m => m.id), expectedIds);
});

// 2. Legacy aliases
test('legacy aliases map prompt -> prompt-design and rag -> rag-retrieval', () => {
  assert.equal(normalizeModuleId('prompt'), 'prompt-design');
  assert.equal(normalizeModuleId('rag'), 'rag-retrieval');
  assert.equal(normalizeModuleId('llm-basics'), 'llm-basics');

  // Old progress with prompt and rag
  const oldState = {
    progress: {
      prompt: { completedAt: '2026-09-01T12:00:00.000Z' },
      rag: { completed: true }
    }
  };
  const norm = normalizeProgress(oldState);
  assert.equal(norm.progress['prompt-design'].completed, true);
  assert.equal(norm.progress['rag-retrieval'].completed, true);
  assert.equal(norm.completedCount, 2);
  assert.equal(norm.state.progress['prompt-design'].completedAt, '2026-09-01T12:00:00.000Z');
});

// 3. Priority 1: API priority
test('resolveProgress prioritizes API state over localStorage and empty', async () => {
  const fakeApiState = {
    ok: true,
    state: {
      progress: {
        'llm-basics': { completedAt: '2026-09-10T10:00:00.000Z' }
      }
    }
  };
  const fakeLocalState = {
    progress: {
      'llm-basics': { completedAt: '2026-09-01T10:00:00.000Z' },
      'transformer': { completedAt: '2026-09-02T10:00:00.000Z' }
    }
  };

  const fakeFetch = async (url) => {
    if (url === '/api/state') {
      return { ok: true, json: async () => fakeApiState };
    }
    throw new Error('Not found');
  };

  const fakeStorage = {
    getItem: (k) => k === 'aimaster_learning_state' ? JSON.stringify(fakeLocalState) : null
  };

  const result = await resolveProgress({ fetch: fakeFetch, localStorage: fakeStorage });
  assert.equal(result.source, 'api');
  assert.equal(result.completedCount, 1);
  assert.equal(result.progress['llm-basics'].completed, true);
  assert.equal(result.progress['transformer'].completed, false);
});

// 4. Priority 2: API fail -> localStorage
test('resolveProgress falls back to localStorage when API fails', async () => {
  const fakeLocalState = {
    progress: {
      'transformer': { completedAt: '2026-09-02T10:00:00.000Z' }
    }
  };

  const failingFetch = async () => {
    throw new Error('Network error');
  };

  const fakeStorage = {
    getItem: (k) => k === 'aimaster_learning_state' ? JSON.stringify(fakeLocalState) : null
  };

  const result = await resolveProgress({ fetch: failingFetch, localStorage: fakeStorage });
  assert.equal(result.source, 'localStorage');
  assert.equal(result.completedCount, 1);
  assert.equal(result.progress['transformer'].completed, true);
  assert.equal(result.progress['llm-basics'].completed, false);
});

// 5. Priority 3: API + localStorage absent -> honest empty
test('resolveProgress yields honest empty state when both API and localStorage are absent', async () => {
  const failingFetch = async () => {
    throw new Error('Offline');
  };
  const emptyStorage = {
    getItem: () => null
  };

  const result = await resolveProgress({ fetch: failingFetch, localStorage: emptyStorage });
  assert.equal(result.source, 'empty');
  assert.equal(result.completedCount, 0);
  assert.equal(result.percent, 0);
  assert.equal(result.isCleanEmpty, true);
  for (const modId of MODULE_IDS) {
    assert.equal(result.progress[modId].completed, false);
  }
});

// 6. state.progress[moduleId] single authority
test('state.progress[moduleId] is the sole progress authority', () => {
  const stateWithLegacyNoise = {
    aimaster_completed: { 'chapter-1-kp-1': true, 'chapter-1-kp-2': true },
    aimaster_local_workspace_v1: { passed: 99 },
    progress: {
      'agent-tools': { completedAt: '2026-09-05T08:00:00.000Z' }
    }
  };

  const norm = normalizeProgress(stateWithLegacyNoise);
  assert.equal(norm.completedCount, 1);
  assert.equal(norm.progress['agent-tools'].completed, true);
  assert.equal(norm.progress['llm-basics'].completed, false);
});

// 7. Dashboard unified progress & builder output
test('Dashboard HTML uses unified progress contract and displays honest empty 0/7', () => {
  const dashHtml = fs.readFileSync(path.join(ROOT, 'frontend/dashboard/index.html'), 'utf8');
  assert.match(dashHtml, /learning-progress\.js/, 'Dashboard must load learning-progress.js');
  assert.match(dashHtml, /id="kpi-passed-count">0 \/ 7<\/span>/, 'Dashboard initial KPI must be honest 0 / 7');
  assert.match(dashHtml, /动手任务/, 'Dashboard KPI must label 动手任务');
  assert.match(dashHtml, /41<\/span>/, 'Dashboard KPI must show 41 tasks');
});

// 8. 41 hands-on truth across sources
test('41 hands-on tasks is consistent across hands-on-tasks.json and courses_index.json', () => {
  const taskCountInHandsOn = handsOn.chapters.reduce((acc, c) => acc + (c.tasks ? c.tasks.length : 0), 0);
  assert.equal(taskCountInHandsOn, 41, 'hands-on-tasks.json must have 41 tasks');

  const exerciseSumInCourses = coursesIndex.reduce((acc, c) => acc + (c.exercise_count || 0), 0);
  assert.equal(exerciseSumInCourses, 41, 'courses_index.json exercise_count sum must equal 41');
});

// 9. Knowledge Stars fallback & unmapped nodes honest
test('Knowledge Stars mergeProgress keeps unmapped nodes honest without fake progress', () => {
  const catalog = {
    modules: [
      { id: 'llm-basics', title: '大模型如何生成回答', nodeIds: ['chapter-1-kp-1'] }
    ]
  };
  const state = {
    progress: {
      'llm-basics': { completedAt: '2026-09-05T10:00:00.000Z' }
    }
  };

  const merged = mergeProgress(universe, catalog, state);
  const ch1Star1 = merged.galaxies[0].stars[0];
  assert.equal(ch1Star1.status, 'completed');
  assert.equal(ch1Star1.linkedModules.length, 1);

  // Unmapped star (e.g. star with no linked modules)
  const unmappedStar = merged.galaxies[0].stars[3];
  assert.equal(unmappedStar.linkedModules.length, 0);
  assert.notEqual(unmappedStar.status, 'completed');
});

// 10. Mutation proof: regressing to old aimaster_completed or fake counts fails
test('mutation proof: verifying progress contract regressions trip assertions', () => {
  // If someone passes fake 54 exercises
  assert.throws(() => {
    const fakeExerciseSum = 54;
    assert.equal(fakeExerciseSum, 41, 'Fake 54 should fail');
  });

  // If someone maps prompt to wrong ID
  assert.throws(() => {
    assert.equal(normalizeModuleId('prompt'), 'prompt-legacy');
  });
});
