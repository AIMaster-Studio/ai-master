const relationTypes = new Set(['related', 'prerequisite', 'application', 'contrast']);
const nodeList = graph => Array.isArray(graph?.nodes) ? graph.nodes : [];
const compareNodes = (a, b) => (Number(a.chapter) - Number(b.chapter)) ||
  (Number(a.index) - Number(b.index)) || String(a.id).localeCompare(String(b.id));

export function visibleEdges(graph, ids) {
  const existing = new Set(nodeList(graph).map(node => node.id));
  const visible = new Set(ids);
  return (graph?.edges || []).filter(edge => edge.status === 'ai-reviewed' && relationTypes.has(edge.type) &&
    existing.has(edge.source) && existing.has(edge.target) && edge.source !== edge.target &&
    visible.has(edge.source) && visible.has(edge.target));
}

export function visibleNodes(graph, state) {
  const nodes = nodeList(graph);
  const anchor = nodes.find(node => node.id === state.anchorId);
  if (!anchor) return [];
  const scope = state.view === 'local' ? 'neighbors' : state.scope;
  let ids;
  if (scope === 'course') ids = new Set(nodes.map(node => node.id));
  else if (scope === 'chapter') ids = new Set(nodes.filter(node => node.chapter === anchor.chapter).map(node => node.id));
  else {
    ids = new Set([anchor.id]);
    for (const edge of visibleEdges(graph, nodes.map(node => node.id))) {
      if (edge.source === anchor.id) ids.add(edge.target);
      if (edge.target === anchor.id) ids.add(edge.source);
    }
  }
  return nodes.filter(node => ids.has(node.id)).sort(compareNodes).map(node => node.id);
}

export function readCanvasState(url, graph) {
  const params = url.searchParams;
  const nodes = nodeList(graph);
  const exists = id => nodes.some(node => node.id === id);
  const anchorId = exists(params.get('node')) ? params.get('node') : null;
  const view = params.get('view') === 'local' ? 'local' : 'network';
  const scope = view === 'local' ? 'neighbors' :
    (['neighbors', 'chapter', 'course'].includes(params.get('scope')) ? params.get('scope') : 'neighbors');
  const state = {
    view, anchorId, selectedId: anchorId ? (exists(params.get('selected')) ? params.get('selected') : anchorId) : null,
    scope, targetId: exists(params.get('target')) ? params.get('target') : null,
  };
  if (view === 'network' && anchorId && state.targetId && !visibleNodes(graph, state).includes(state.targetId)) {
    state.scope = nodes.find(node => node.id === anchorId).chapter === nodes.find(node => node.id === state.targetId).chapter
      ? 'chapter' : 'course';
  }
  return state;
}

function adjacency(graph) {
  const nodes = nodeList(graph);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const neighbors = new Map(nodes.map(node => [node.id, []]));
  for (const edge of visibleEdges(graph, [...byId.keys()])) {
    // Direction stays in the source record. Exploring it backwards is a review of foundations.
    neighbors.get(edge.source).push({ id: edge.target, edge, rank: edge.type === 'application' ? 2 : 1 });
    neighbors.get(edge.target).push({ id: edge.source, edge, rank: edge.type === 'prerequisite' ? 0 : 1 });
  }
  for (const list of neighbors.values()) list.sort((a, b) => a.rank - b.rank || compareNodes(byId.get(a.id), byId.get(b.id)));
  return neighbors;
}

export function recommendPath(graph, start, target = null) {
  const neighbors = adjacency(graph);
  if (!neighbors.has(start) || (target !== null && !neighbors.has(target))) return [];
  if (target === start) return [start];
  if (target !== null) {
    const parents = new Map([[start, null]]);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of neighbors.get(queue[cursor])) {
        if (parents.has(next.id)) continue;
        parents.set(next.id, queue[cursor]);
        if (next.id === target) {
          const path = [];
          for (let id = target; id !== null; id = parents.get(id)) path.unshift(id);
          return path;
        }
        queue.push(next.id);
      }
    }
    return [];
  }
  const path = [start];
  while (path.length < 5) {
    const next = neighbors.get(path.at(-1)).find(node => !path.includes(node.id));
    if (!next) break;
    path.push(next.id);
  }
  return path.length > 1 ? path : [];
}
