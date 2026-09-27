import { visibleNodes, visibleEdges, recommendPath } from './graph-model.js';

function seedFor(value) {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return (seed >>> 0) / 4294967296;
}

// Measured DOM boxes, ordered by importance. Only ordinary labels may be hidden
// because their preferred position is occupied; important labels find free space.
export function arrangeLabelRects(items, width, height) {
  const margin = 8;
  const gap = 6;
  const placed = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const overlaps = box => placed.some(other => box.left < other.right + gap && box.right > other.left - gap &&
    box.top < other.bottom + gap && box.bottom > other.top - gap);
  return items.map(item => {
    const w = item.width;
    const h = item.height;
    const left = clamp(Math.round(item.x - w / 2), margin, width - margin - w);
    const top = clamp(Math.round(item.y), margin, height - margin - h);
    const rect = (x, y) => ({ id: item.id, left: x, top: y, right: x + w, bottom: y + h });
    const fits = box => box.left >= margin && box.top >= margin && box.right <= width - margin && box.bottom <= height - margin;
    let box = rect(left, top);
    if (item.important && overlaps(box)) {
      // Obstacle edges are sufficient candidate boundaries for axis-aligned boxes.
      const xs = [...new Set([left, margin, width - margin - w,
        ...placed.flatMap(other => [other.right + gap, other.left - gap - w])])];
      const ys = [...new Set([top, margin, height - margin - h,
        ...placed.flatMap(other => [other.bottom + gap, other.top - gap - h])])];
      const candidates = xs.flatMap(x => ys.map(y => rect(x, y)))
        .filter(candidate => fits(candidate) && !overlaps(candidate))
        .sort((a, b) => Math.hypot(a.left - left, a.top - top) - Math.hypot(b.left - left, b.top - top));
      if (candidates.length) box = candidates[0];
    }
    const show = item.inBounds !== false && fits(box) && !overlaps(box);
    if (show) placed.push(box);
    return { ...box, show };
  });
}

// The layout and hit targets remain fixed; only light and the viewport move.
export function createGraphView({ canvas, graph, onSelect, onUnavailable }) {
  const THREE = globalThis.THREE;
  let renderer;
  try {
    if (!THREE) throw new Error('Three.js unavailable');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    onUnavailable?.();
    return { setState() {}, dispose() {} };
  }

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 350);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const labelLayer = canvas.parentElement?.querySelector('.canvas-node-labels');
  const nodesById = new Map((graph.nodes || []).map(node => [node.id, node]));
  const snapshot = typeof graph.sourceSnapshot === 'string' ? graph.sourceSnapshot : JSON.stringify(graph.sourceSnapshot || 'course');
  const chapterIds = [...new Set((graph.nodes || []).map(node => node.chapter))].sort((a, b) => a - b);
  const positions = new Map();
  const chapterPositions = new Map();
  const owned = new Set();
  const listeners = [];
  let state = null;
  let meshes = [];
  let labels = [];
  let signals = [];
  let frame = 0;
  let disposed = false;
  let elapsed = 0;
  let previous = 0;
  let hoveredId = null;
  let width = 1;
  let height = 1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let yaw = 0;
  let pitch = 0;
  let press = null;
  const touches = new Map();
  let pinchDistance = 0;
  const mobile = () => width < 640;
  const own = resource => (owned.add(resource), resource);
  const listen = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  };

  chapterIds.forEach((chapter, ordinal) => {
    const angle = ordinal / Math.max(1, chapterIds.length) * Math.PI * 2 - Math.PI / 2;
    chapterPositions.set(chapter, new THREE.Vector3(Math.cos(angle) * 25, Math.sin(angle) * 18, Math.sin(angle * 2) * 5));
    const chapterNodes = (graph.nodes || []).filter(node => node.chapter === chapter).sort((a, b) => a.index - b.index);
    chapterNodes.forEach((node, index) => {
      const seed = seedFor(snapshot + ':' + node.id);
      const localAngle = index / Math.max(1, chapterNodes.length) * Math.PI * 2 + seed * .35;
      const radius = 3.2 + seed * 2.4;
      positions.set(node.id, chapterPositions.get(chapter).clone().add(new THREE.Vector3(
        Math.cos(localAngle) * radius, Math.sin(localAngle) * radius, (seed - .5) * 5,
      )));
    });
  });

  const orbGeometry = own(new THREE.SphereGeometry(1, 14, 10));
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  if (glowContext) {
    const gradient = glowContext.createRadialGradient(32, 32, 1, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(111,244,239,.65)');
    gradient.addColorStop(.17, 'rgba(43,212,197,.2)');
    gradient.addColorStop(1, 'rgba(15,125,147,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 64, 64);
  }
  const glowTexture = own(new THREE.CanvasTexture(glowCanvas));

  function clearScene() {
    for (const object of [...group.children]) {
      group.remove(object);
      object.traverse(child => {
        if (child.geometry && child.geometry !== orbGeometry) child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.filter(Boolean).forEach(material => material.dispose());
      });
    }
    labels.forEach(item => item.element.remove());
    labels = [];
    meshes = [];
    signals = [];
  }

  function addNode(id, position, title, { anchor = false, selected = false, path = false, overview = false } = {}) {
    const mesh = new THREE.Mesh(orbGeometry, new THREE.MeshBasicMaterial({
      color: selected ? 0xcefdf7 : anchor ? 0x4cf3de : path ? 0x69c9d9 : 0x416778,
      transparent: true, opacity: selected || anchor ? 1 : path ? .86 : .68,
    }));
    const radius = overview ? .52 : selected || anchor ? .43 : path ? .31 : .23;
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    mesh.userData = { id, radius, selected, anchor, path };
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: 0x9af6f1, transparent: true,
      opacity: selected || anchor ? .62 : path || overview ? .22 : .045,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(5.5);
    mesh.add(glow);
    group.add(mesh);
    meshes.push(mesh);
    if (labelLayer) {
      const label = document.createElement('span');
      label.className = `canvas-node-label${anchor ? ' is-anchor' : ''}${selected ? ' is-selected' : ''}${path ? ' is-path' : ''}${overview ? ' is-chapter' : ''}`;
      label.textContent = title;
      label.title = title;
      label.dataset.nodeId = id;
      // The directory provides semantic keyboard controls. Labels are visual click equivalents.
      label.setAttribute('aria-hidden', 'true');
      label.style.position = 'absolute';
      label.style.left = '0';
      label.style.top = '0';
      label.style.whiteSpace = 'normal';
      label.style.overflowWrap = 'anywhere';
      label.style.boxSizing = 'border-box';
      label.style.lineHeight = '1.45';
      label.style.textAlign = 'center';
      label.style.overflow = 'auto';
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => onSelect?.(id));
      label.addEventListener('pointerenter', () => { hoveredId = id; render(); });
      label.addEventListener('pointerleave', () => { hoveredId = null; render(); });
      labelLayer.append(label);
      labels.push({ element: label, mesh, priority: overview || selected || anchor ? 0 : path ? 1 : 2 });
    }
  }

  function setState(next) {
    if (disposed) return;
    const reframe = !state || next.anchorId !== state.anchorId || next.view !== state.view || next.scope !== state.scope;
    state = next;
    clearScene();
    hoveredId = null;
    const ids = visibleNodes(graph, state);
    const anchorPosition = positions.get(state.anchorId) || new THREE.Vector3();
    const localPositions = new Map();
    const path = recommendPath(graph, state.anchorId, state.targetId);
    if (!state.anchorId) {
      for (const chapter of chapterIds) {
        const first = (graph.nodes || []).filter(node => node.chapter === chapter).sort((a, b) => a.index - b.index)[0];
        const chapterRecord = (graph.chapters || []).find(item => Number(item.chapter ?? item.id) === Number(chapter));
        const title = chapterRecord?.title || first?.chapterTitle || `第 ${chapter} 章`;
        if (first) addNode(first.id, chapterPositions.get(chapter), title, { overview: true });
      }
    } else {
      ids.forEach(id => {
        let position = positions.get(id).clone().sub(anchorPosition);
        if (state.view === 'local' || state.scope === 'neighbors') {
          if (id === state.anchorId) position.set(0, 0, 0);
          else {
            const others = ids.filter(value => value !== state.anchorId);
            const angle = others.indexOf(id) / Math.max(1, others.length) * Math.PI * 2 - Math.PI / 2;
            const seed = seedFor(snapshot + id);
            position.set(Math.cos(angle) * 13, Math.sin(angle) * 10, (seed - .5) * 7);
          }
        }
        localPositions.set(id, position);
        const node = nodesById.get(id);
        addNode(id, position, node.title || node.name || id, { anchor: id === state.anchorId,
          selected: id === state.selectedId, path: path.includes(id) });
      });
      const edges = visibleEdges(graph, ids);
      edges.forEach(edge => {
        const start = localPositions.get(edge.source);
        const end = localPositions.get(edge.target);
        const bend = seedFor(snapshot + (edge.id || `${edge.source}:${edge.target}:${edge.type}`));
        const middle = start.clone().lerp(end, .5);
        middle.z += 3 + bend * 4;
        middle.y += (bend - .5) * 4;
        const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
        const inPath = path.some((id, step) => step > 0 &&
          ((path[step - 1] === edge.source && id === edge.target) || (path[step - 1] === edge.target && id === edge.source)));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
          new THREE.LineBasicMaterial({ color: inPath ? 0x3dc5c4 : 0x285267, transparent: true,
            opacity: inPath ? .48 : .19, depthWrite: false }));
        line.userData.edgeId = edge.id || `${edge.source}:${edge.target}:${edge.type}`;
        group.add(line);
        if (signals.length < (mobile() ? 3 : 6)) {
          const signal = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0x72e8d6,
            transparent: true, opacity: .46, depthWrite: false, blending: THREE.AdditiveBlending }));
          signal.scale.setScalar(.95);
          group.add(signal);
          signals.push({ sprite: signal, curve, phase: bend, duration: 7 + bend * 6, edgeId: line.userData.edgeId });
        }
      });
    }
    if (reframe) {
      zoom = 1;
      yaw = pitch = panX = panY = 0;
    }
    fitCamera();
    schedule();
  }

  function fitCamera() {
    const box = new THREE.Box3();
    meshes.forEach(mesh => box.expandByPoint(mesh.position));
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(20, 16, 0) : box.getSize(new THREE.Vector3());
    const fov = Math.tan(camera.fov * Math.PI / 360);
    const distance = Math.max((size.y + 12) / (2 * fov), (size.x + 20) / (2 * fov * camera.aspect), 25);
    camera.position.set(center.x + panX, center.y + panY, (distance + size.z / 2) * zoom);
    camera.lookAt(center.x + panX, center.y + panY, 0);
    camera.updateMatrixWorld();
  }

  function projectLabels() {
    group.updateMatrixWorld(true);
    const sorted = [...labels].sort((a, b) => (a.mesh.userData.id === hoveredId ? -1 : a.priority) - (b.mesh.userData.id === hoveredId ? -1 : b.priority));
    const measured = sorted.map(item => {
      const point = item.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      const x = (point.x + 1) * width / 2;
      const y = (1 - point.y) * height / 2 + 12;
      item.element.style.maxWidth = `${Math.max(1, Math.min(180, width < 640 ? (width - 32) / 2 : width - 16))}px`;
      item.element.style.maxHeight = `${Math.max(1, height - 16)}px`;
      const rect = item.element.getBoundingClientRect();
      return { id: item.mesh.userData.id, x, y, width: rect.width || 80, height: rect.height || 20,
        important: item.priority < 2 || item.mesh.userData.id === hoveredId,
        inBounds: point.z > -1 && point.z < 1 };
    });
    const boxes = arrangeLabelRects(measured, width, height);
    sorted.forEach((item, index) => {
      item.element.style.visibility = boxes[index].show ? 'visible' : 'hidden';
      item.element.style.transform = `translate(${boxes[index].left}px, ${boxes[index].top}px)`;
    });
  }

  function render() {
    if (disposed || document.hidden) return;
    group.rotation.set(pitch, yaw, 0);
    signals.forEach((signal, index) => {
      const enabled = !media.matches && index < (mobile() ? 3 : 6);
      signal.sprite.visible = enabled;
      if (enabled) signal.sprite.position.copy(signal.curve.getPoint((elapsed / signal.duration + signal.phase) % 1));
    });
    try { renderer.render(scene, camera); }
    catch { dispose(); onUnavailable?.(); return; }
    projectLabels();
  }
  function tick(time) {
    frame = 0;
    if (disposed || document.hidden) return;
    if (previous) elapsed += Math.min((time - previous) / 1000, .05);
    previous = time;
    render();
    if (!media.matches && signals.length) frame = requestAnimationFrame(tick);
  }
  function schedule() {
    if (disposed || document.hidden) return;
    render();
    if (!frame && !media.matches && signals.length) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile() ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitCamera();
    schedule();
  }
  function hit(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(meshes, false);
    if (intersections.length) return intersections[0].object.userData.id;
    // Small physical orbs receive a stable 16px screen-space hit region.
    let nearest = null;
    let distance = 16;
    for (const mesh of meshes) {
      const point = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      if (point.z < -1 || point.z > 1) continue;
      const d = Math.hypot((point.x + 1) * width / 2 - (event.clientX - rect.left), (1 - point.y) * height / 2 - (event.clientY - rect.top));
      if (d < distance) { nearest = mesh.userData.id; distance = d; }
    }
    return nearest;
  }

  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    press = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, id: hit(event) };
    if (touches.size === 2) {
      const values = [...touches.values()];
      pinchDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      press.moved = true;
    }
  });
  listen(canvas, 'pointermove', event => {
    if (!press) {
      const nextHovered = hit(event);
      canvas.style.cursor = nextHovered ? 'pointer' : 'grab';
      if (nextHovered !== hoveredId) { hoveredId = nextHovered; render(); }
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const values = [...touches.values()];
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      if (distance > 0 && pinchDistance > 0) zoom = Math.max(.55, Math.min(2.8, zoom * pinchDistance / distance));
      pinchDistance = distance;
      press.moved = true;
      fitCamera();
    } else {
      const dx = event.clientX - press.lastX;
      const dy = event.clientY - press.lastY;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press.moved = true;
      if (press.moved) {
        yaw = Math.max(-.45, Math.min(.45, yaw + dx * .003));
        pitch = Math.max(-.3, Math.min(.3, pitch + dy * .003));
      }
      press.lastX = event.clientX;
      press.lastY = event.clientY;
    }
    schedule();
  });
  listen(canvas, 'pointerleave', () => {
    if (!press && hoveredId !== null) { hoveredId = null; canvas.style.cursor = 'grab'; render(); }
  });
  const release = event => {
    touches.delete(event.pointerId);
    if (press && !press.moved && press.id && event.type !== 'pointercancel') onSelect?.(press.id);
    press = null;
    pinchDistance = 0;
  };
  listen(canvas, 'pointerup', release);
  listen(canvas, 'pointercancel', release);
  listen(canvas, 'lostpointercapture', event => { touches.delete(event.pointerId); press = null; });
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    zoom = Math.max(.55, Math.min(2.8, zoom * Math.exp(event.deltaY * .001)));
    fitCamera();
    schedule();
  }, { passive: false });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); dispose(); onUnavailable?.(); });
  listen(document, 'visibilitychange', () => {
    cancelAnimationFrame(frame);
    frame = previous = 0;
    if (!document.hidden) schedule();
  });
  listen(media, 'change', () => { cancelAnimationFrame(frame); frame = previous = 0; schedule(); });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  if (!observer) listen(window, 'resize', resize);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    listeners.forEach(remove => remove());
    clearScene();
    owned.forEach(resource => resource.dispose());
    renderer.dispose();
    canvas.style.cursor = '';
  }
  resize();
  return { setState, dispose };
}
