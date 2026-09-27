const test = require('node:test');
const assert = require('node:assert/strict');

const graph = {
  nodes: [
    { id: 'a', chapter: 1, index: 1 }, { id: 'b', chapter: 1, index: 0 },
    { id: 'c', chapter: 2, index: 0 }, { id: 'd', chapter: 1, index: 2 },
    { id: 'e', chapter: 3, index: 0 }, { id: 'f', chapter: 4, index: 0 },
  ],
  edges: [
    { id: 'ba', source: 'b', target: 'a', type: 'prerequisite', status: 'ai-reviewed' },
    { id: 'ac', source: 'a', target: 'c', type: 'related', status: 'ai-reviewed' },
    { id: 'ce', source: 'c', target: 'e', type: 'application', status: 'ai-reviewed' },
    { id: 'ae', source: 'a', target: 'e', type: 'related', status: 'candidate' },
    { id: 'af', source: 'a', target: 'f', type: 'sequence', status: 'ai-reviewed' },
    { id: 'az', source: 'a', target: 'missing', type: 'related', status: 'ai-reviewed' },
  ],
};
const model = import('../frontend/canvas/graph-model.js');

test('visible edges reject unreviewed, non-relation, dangling and out-of-scope links', async () => {
  const { visibleEdges } = await model;
  assert.deepEqual(visibleEdges(graph, ['a', 'b', 'c', 'e', 'f']).map(e => e.id), ['ba', 'ac', 'ce']);
  assert.deepEqual(visibleEdges(graph, ['a', 'b']).map(e => e.id), ['ba']);
});
test('local and neighbor scopes use only one reviewed hop; chapter and course retain real IDs', async () => {
  const { visibleNodes } = await model;
  assert.deepEqual(visibleNodes(graph, { view: 'local', anchorId: 'a', scope: 'course' }), ['b', 'a', 'c']);
  assert.deepEqual(visibleNodes(graph, { view: 'network', anchorId: 'a', scope: 'chapter' }), ['b', 'a', 'd']);
  assert.deepEqual(visibleNodes(graph, { view: 'network', anchorId: 'a', scope: 'course' }), ['b', 'a', 'd', 'c', 'e', 'f']);
  assert.deepEqual(visibleNodes(graph, { view: 'network', anchorId: null, scope: 'course' }), []);
  assert.deepEqual(visibleNodes(graph, { view: 'network', anchorId: 'f', scope: 'neighbors' }), ['f']);
});
test('URL state validates identities and enums without inventing an anchor', async () => {
  const { readCanvasState } = await model;
  assert.deepEqual(readCanvasState(new URL('https://example.test/canvas/?node=missing&view=bad&scope=bad&target=https://evil.test'), graph), {
    view: 'network', anchorId: null, selectedId: null, scope: 'neighbors', targetId: null,
  });
  assert.deepEqual(readCanvasState(new URL('https://example.test/canvas/?view=local&node=a&scope=course&selected=b'), graph), {
    view: 'local', anchorId: 'a', selectedId: 'b', scope: 'neighbors', targetId: null,
  });
});
test('network target expands to the smallest scope that includes it', async () => {
  const { readCanvasState } = await model;
  assert.equal(readCanvasState(new URL('https://example.test/?node=a&target=d'), graph).scope, 'chapter');
  assert.equal(readCanvasState(new URL('https://example.test/?node=a&target=e'), graph).scope, 'course');
  assert.equal(readCanvasState(new URL('https://example.test/?node=a&target=c'), graph).scope, 'neighbors');
});
test('shortest target path cannot use unreviewed shortcuts or sequence metadata', async () => {
  const { recommendPath } = await model;
  assert.deepEqual(recommendPath(graph, 'a', 'e'), ['a', 'c', 'e']);
  assert.deepEqual(recommendPath(graph, 'e', 'b'), ['e', 'c', 'a', 'b']);
  assert.deepEqual(recommendPath(graph, 'a', 'f'), []);
  assert.deepEqual(recommendPath(graph, 'a', 'a'), ['a']);
  assert.deepEqual(recommendPath(graph, 'a', 'missing'), []);
});
test('default suggestion prioritizes foundation, then related, then application without claiming non-edges', async () => {
  const { recommendPath } = await model;
  assert.deepEqual(recommendPath(graph, 'a', null), ['a', 'b']);
  assert.deepEqual(recommendPath(graph, 'c', null), ['c', 'a', 'b']);
  const cycle = { nodes: Array.from({ length: 7 }, (_, i) => ({ id: String(i), chapter: 1, index: i })),
    edges: Array.from({ length: 7 }, (_, i) => ({ source: String(i), target: String((i + 1) % 7), type: 'related', status: 'ai-reviewed' })) };
  assert.deepEqual(recommendPath(cycle, '0', null), ['0', '1', '2', '3', '4']);
});
test('empty graph and empty relations never fabricate a relation path', async () => {
  const { recommendPath, visibleEdges, visibleNodes } = await model;
  assert.deepEqual(recommendPath({ nodes: graph.nodes, edges: [] }, 'a', null), []);
  assert.deepEqual(recommendPath({ nodes: [], edges: [] }, 'a', 'b'), []);
  assert.deepEqual(visibleEdges({ nodes: [], edges: [] }, []), []);
  assert.deepEqual(visibleNodes({ nodes: [], edges: [] }, { anchorId: 'a' }), []);
});

test('intro skip paths always restore visible, accessible shell even with denied storage or late module', async () => {
  const { readFileSync } = require('node:fs');
  const source = readFileSync(require('node:path').join(__dirname, '../frontend/canvas/intro.js'), 'utf8');
  const { playIntroOnce } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const originalWindow = global.window;
  const originalDocument = global.document;
  try {
    for (const mode of ['reduced', 'storage-denied', 'already-played', 'late-module']) {
      const classes = new Set(mode === 'late-module' ? [] : ['mc-intro-pending']);
      const attributes = new Map([['inert', ''], ['aria-hidden', 'true']]);
      const shell = { style: { clipPath: 'circle(0px at 50% 50%)' }, inert: true,
        removeAttribute: name => attributes.delete(name) };
      const particles = { style: {}, width: 1, height: 1 };
      global.document = { documentElement: { classList: { contains: name => classes.has(name), remove: name => classes.delete(name) } } };
      global.window = { sessionStorage: { getItem() {
        if (mode === 'storage-denied') throw new Error('Denied');
        return mode === 'already-played' ? '1' : null;
      }, setItem() {} } };
      await playIntroOnce({ shell, particles, reduced: mode === 'reduced' });
      assert.equal(shell.inert, false, mode);
      assert.equal(shell.style.clipPath, 'none', mode);
      assert.equal(attributes.has('aria-hidden'), false, mode);
      assert.equal(classes.has('mc-intro-pending'), false, mode);
    }
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
  }
});

test('intro reveals from the center, skips with Escape, and ignores callbacks after finishing', async () => {
  const { readFileSync } = require('node:fs');
  const source = readFileSync(require('node:path').join(__dirname, '../frontend/canvas/intro.js'), 'utf8');
  const { playIntroOnce } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const originalWindow = global.window;
  const originalDocument = global.document;
  const classes = new Set(['mc-intro-pending']);
  const attributes = new Map();
  const callbacks = new Map();
  const events = new Map();
  const records = new Map();
  let sequence = 0;
  const eventTarget = { addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); } };
  const shell = { style: {}, inert: false, setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name) };
  const particles = { style: {}, getContext: () => null };
  try {
    global.document = { ...eventTarget, hidden: false,
      documentElement: { classList: { contains: name => classes.has(name), remove: name => classes.delete(name) } } };
    global.window = { ...eventTarget, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
      sessionStorage: { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) },
      matchMedia: () => ({ ...eventTarget, matches: false }), performance: { now: () => 0 },
      requestAnimationFrame: callback => { callbacks.set(++sequence, callback); return sequence; },
      cancelAnimationFrame: id => callbacks.delete(id), setTimeout: () => 100, clearTimeout() {} };
    const result = playIntroOnce({ shell, particles, reduced: false });
    assert.equal(shell.inert, true);
    assert.equal(attributes.get('aria-hidden'), 'true');
    assert.equal(shell.style.clipPath, 'circle(0px at 50% 50%)');
    let callback = callbacks.values().next().value;
    callbacks.clear();
    callback(199);
    assert.match(shell.style.clipPath, /^circle\(0\.00px at 50% 50%\)$/);
    callback = callbacks.values().next().value;
    callbacks.clear();
    callback(800);
    const revealedRadius = Number(shell.style.clipPath.match(/circle\(([\d.]+)px/)[1]);
    assert.ok(revealedRadius > 500 && revealedRadius < 754);
    const lateCallback = callbacks.values().next().value;
    events.get('keydown')({ key: 'Escape' });
    await result;
    assert.equal(shell.inert, false);
    assert.equal(shell.style.clipPath, 'none');
    assert.equal(records.get('aimaster:mind-canvas:intro:v1'), '1');
    lateCallback(1000);
    assert.equal(shell.style.clipPath, 'none');
    assert.equal(events.size, 0);
    assert.equal(callbacks.size, 0);
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
  }
});

test('renderer without Three.js reports unavailable and returns a safe disposable view', async () => {
  const { createGraphView } = await import('../frontend/canvas/graph-view.js');
  let unavailable = 0;
  const view = createGraphView({ canvas: {}, graph, onSelect() {}, onUnavailable() { unavailable++; } });
  view.setState({ anchorId: 'a' });
  view.dispose();
  view.dispose();
  assert.equal(unavailable, 1);
});

test('320px long important labels are contained and do not overlap', async () => {
  const { arrangeLabelRects } = await import('../frontend/canvas/graph-view.js');
  assert.equal(typeof arrangeLabelRects, 'function');
  const items = Array.from({ length: 10 }, (_, index) => ({ id: String(index), x: index % 2 ? 319 : 1,
    y: 250, width: 144, height: 48, important: true }));
  const result = arrangeLabelRects(items, 320, 500);
  assert.equal(result.filter(item => item.show).length, 10);
  for (let index = 0; index < result.length; index++) {
    const item = result[index];
    assert.ok(item.left >= 8 && item.top >= 8 && item.right <= 312 && item.bottom <= 492);
    for (const other of result.slice(index + 1)) {
      assert.ok(item.right <= other.left || item.left >= other.right || item.bottom <= other.top || item.top >= other.bottom);
    }
  }
  const ordinary = arrangeLabelRects([{ id: 'anchor', x: 160, y: 250, width: 200, height: 40, important: true },
    { id: 'plain', x: 160, y: 250, width: 200, height: 40, important: false }], 320, 500);
  assert.equal(ordinary[0].show, true);
  assert.equal(ordinary[1].show, false);
});

test('intro readable but unwritable storage never starts the mask on reentry', async () => {
  const { readFileSync } = require('node:fs');
  const source = readFileSync(require('node:path').join(__dirname, '../frontend/canvas/intro.js'), 'utf8');
  const { playIntroOnce } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const originalWindow = global.window;
  const originalDocument = global.document;
  try {
    for (let visit = 0; visit < 2; visit++) {
      const classes = new Set(['mc-intro-pending']);
      let hiddenWrites = 0;
      const shell = { style: {}, removeAttribute() {}, setAttribute() {},
        set inert(value) { if (value) hiddenWrites++; } };
      global.document = { documentElement: { classList: { contains: name => classes.has(name), remove: name => classes.delete(name) } } };
      global.window = { sessionStorage: { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } },
        matchMedia: () => ({ matches: false }) };
      await playIntroOnce({ shell, particles: null });
      assert.equal(hiddenWrites, 0);
      assert.equal(shell.style.clipPath, 'none');
      assert.equal(classes.has('mc-intro-pending'), false);
    }
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
  }
});

test('static renderer hover reveals a collision-hidden label and hides it on exit without an animation loop', async () => {
  const { createGraphView } = await import('../frontend/canvas/graph-view.js');
  const { readFileSync } = require('node:fs');
  const vm = require('node:vm');
  const sandbox = {};
  vm.runInNewContext(readFileSync(require('node:path').join(__dirname, '../frontend/static/vendor/three.r128.min.js'), 'utf8'), sandbox);
  const saved = Object.fromEntries(['window', 'document', 'THREE', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, global[key]]));
  const elements = [];
  let scene;
  let hitId;
  let frames = 0;
  const makeTarget = () => {
    const handlers = new Map();
    return { handlers, style: {}, addEventListener: (name, fn) => handlers.set(name, fn),
      removeEventListener: name => handlers.delete(name) };
  };
  const layer = { append(element) { elements.push(element); } };
  const canvas = { ...makeTarget(), parentElement: { querySelector: () => layer },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 360 }) };
  let view;
  try {
    global.THREE = { ...sandbox.THREE,
      WebGLRenderer: class {
        setPixelRatio() {} setSize() {} dispose() {}
        render(value, camera) { scene = value; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
      },
      Raycaster: class {
        setFromCamera() {}
        intersectObjects(meshes) { const mesh = meshes.find(item => item.userData.id === hitId); return mesh ? [{ object: mesh }] : []; }
      } };
    global.window = { ...makeTarget(), devicePixelRatio: 1, matchMedia: () => ({ ...makeTarget(), matches: true }) };
    global.document = { ...makeTarget(), hidden: false,
      createElement(tag) { return tag === 'canvas' ? { getContext: () => null } : {
        ...makeTarget(), dataset: {}, setAttribute() {}, remove() {},
        getBoundingClientRect: () => ({ width: 144, height: 40 }),
      }; } };
    global.requestAnimationFrame = () => { frames++; return 1; };
    global.cancelAnimationFrame = () => {};
    const crowdedGraph = { nodes: Array.from({ length: 18 }, (_, index) => ({ id: String(index), chapter: 1, index,
      title: `这是第 ${index} 个完整课程名称` })), edges: [] };
    view = createGraphView({ canvas, graph: crowdedGraph, onSelect() {}, onUnavailable() { assert.fail('Unexpected renderer fallback'); } });
    view.setState({ view: 'network', scope: 'course', anchorId: '0', selectedId: '0', targetId: null });
    const hidden = elements.find(element => element.style.visibility === 'hidden');
    assert.ok(hidden, 'Crowded ordinary labels must be hidden by real layout');
    hitId = hidden.dataset.nodeId;
    assert.ok(scene.children[0].children.some(mesh => mesh.userData.id === hitId));
    canvas.handlers.get('pointermove')({ clientX: 160, clientY: 180 });
    assert.equal(hidden.style.visibility, 'visible');
    canvas.handlers.get('pointerleave')();
    assert.equal(hidden.style.visibility, 'hidden');
    assert.equal(frames, 0);
  } finally {
    view?.dispose();
    for (const [key, value] of Object.entries(saved)) global[key] = value;
  }
});
