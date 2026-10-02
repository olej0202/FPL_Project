export const DEFAULT_TREE_SETTINGS = { modelType: "ai", risk: 0, valtrans: 0.5, n_hits: 0 };

// Sibling outcomes are unknown at their shared deadline. Editing the decision
// on one outcome therefore edits its peers, but never subsequent gameweeks.
export function shareDecisionPlanEdits(previous, next, nodes) {
  if (previous === next) return previous;
  const result = { ...next };
  nodes.forEach((node) => {
    if (!node.parentId || next[node.id] === previous[node.id] || !next[node.id]) return;
    const plan = next[node.id];
    if (!previous[node.id] && !plan.transfers?.length && !Object.keys(plan.statusOverrides || {}).length) return;
    nodes.filter((peer) => peer.parentId === node.parentId && peer.gw === node.gw).forEach((peer) => {
      result[peer.id] = { ...plan, transfers: (plan.transfers || []).map((move) => ({ ...move, nodeId: peer.id, gw: peer.gw })) };
    });
  });
  return result;
}

export function getNodePath(nodes, nodeId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = [];
  const seen = new Set();
  let node = byId.get(nodeId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node);
    node = byId.get(node.parentId);
  }
  return path;
}

export function getPlanningPath(nodes, rootId, selectedNodeId) {
  let path = getNodePath(nodes, selectedNodeId);
  if (path[0]?.id !== rootId) path = getNodePath(nodes, rootId);
  const seen = new Set(path.map((node) => node.id));
  let child = nodes.find((node) => node.parentId === path.at(-1)?.id);
  while (child && !seen.has(child.id)) {
    path.push(child);
    seen.add(child.id);
    child = nodes.find((node) => node.parentId === child.id);
  }
  return path.filter((node) => !node.isAnchor);
}

export function resolvePlanningPath(nodes, rootId, selectedNodeId, selectedBranchId) {
  const branch = getNodePath(nodes, selectedBranchId);
  const target = branch.some((node) => node.id === selectedNodeId) ? selectedBranchId : selectedNodeId;
  return getPlanningPath(nodes, rootId, target);
}

export function plansForPath(plans, path) {
  return Object.fromEntries(path.map((node) => [String(node.gw), plans[node.id] || {}]));
}

// Older saved plans used gameweeks as keys. Assign those moves to one path,
// never to every sibling at the same gameweek.
export function migrateNodePlans(plans, nodes, rootId) {
  const path = getPlanningPath(nodes, rootId, rootId);
  return Object.fromEntries(Object.entries(plans || {}).flatMap(([key, plan]) => {
    const node = nodes.find((candidate) => candidate.id === key)
      || path.find((candidate) => String(candidate.gw) === key);
    return node ? [[node.id, { ...plan, transfers: (plan.transfers || []).map((move) => ({ ...move, nodeId: node.id, gw: node.gw })) }]] : [];
  }));
}

// Every branch in one tree covers the same horizon; other trees keep theirs.
export function completeTreeHorizons(nodes, minimumGameweeks = 6) {
  const children = new Set(nodes.map((node) => node.parentId).filter(Boolean));
  const rootById = new Map(nodes.map((node) => [node.id, getNodePath(nodes, node.id)[0]?.id]));
  const lastGwByRoot = new Map();
  const firstGwByRoot = new Map();
  nodes.forEach((node) => {
    const root = rootById.get(node.id);
    lastGwByRoot.set(root, Math.max(lastGwByRoot.get(root) || 0, Number(node.gw)));
    if (!node.isAnchor) firstGwByRoot.set(root, Math.min(firstGwByRoot.get(root) ?? 38, Number(node.gw)));
  });
  const additions = [];
  nodes.filter((node) => !children.has(node.id)).forEach((leaf) => {
    let parentId = leaf.id;
    const root = rootById.get(leaf.id);
    const lastGw = Math.min(38, Math.max(lastGwByRoot.get(root), (firstGwByRoot.get(root) ?? Number(leaf.gw) + 1) + minimumGameweeks - 1));
    for (let gw = Number(leaf.gw) + 1; gw <= lastGw; gw += 1) {
      const id = `${leaf.id}_continue_gw${gw}`;
      additions.push({ id, parentId, gw, label: `GW${gw}`, probability: leaf.probability, chip: 'none', scenarioId: 'inherit', autoContinuation: true });
      parentId = id;
    }
  });
  return additions.length ? [...nodes, ...additions] : nodes;
}

// Old results identify the former leaf. Keep their later GW rows attached to
// automatically extended paths, without inventing results for a new split.
export function alignTreeResultPaths(rows, nodes) {
  const children = new Map();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  nodes.forEach((node) => {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  });
  const paths = new Map();
  return (rows || []).map((row) => {
    const branchId = String(row.tree_branch_id || '');
    if (!branchId) return row;
    if (!paths.has(branchId)) {
      const path = String(row.tree_path_node_ids || branchId).split('>').filter(Boolean);
      let next = children.get(path.at(-1)) || [];
      while (next.length === 1 && next[0].autoContinuation && !path.includes(next[0].id)) {
        path.push(next[0].id);
        next = children.get(path.at(-1)) || [];
      }
      paths.set(branchId, path);
    }
    const path = paths.get(branchId);
    return { ...row, tree_branch_id: path.at(-1), tree_path_node_ids: path.join('>'), tree_branch_label: path.map((id) => byId.get(id)?.label || id).join(' → ') };
  });
}

export function extendTreeToResultHorizon(nodes, rootId, rows) {
  const scoped = nodes.filter((node) => getNodePath(nodes, node.id)[0]?.id === rootId);
  const playable = scoped.filter((node) => !node.isAnchor);
  const resultGws = (rows || []).map((row) => Number(row.GW)).filter((gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38);
  if (!playable.length || !resultGws.length) return nodes;
  const firstGw = Math.min(...playable.map((node) => Number(node.gw)));
  const extended = completeTreeHorizons(scoped, Math.max(6, Math.max(...resultGws) - firstGw + 1));
  return extended.length === scoped.length ? nodes : [...nodes, ...extended.slice(scoped.length)];
}
