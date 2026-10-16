import { completeTreeHorizons, getNodePath } from "./treeWorkspace.js";

export function nextPlanningGameweek(events, now = Date.now()) {
  const upcoming = (events || []).filter((event) => {
    const gw = Number(event.id);
    return Number.isInteger(gw) && gw >= 1 && gw <= 38
      && !event.finished && Date.parse(event.deadline_time) > now;
  });
  return upcoming.length ? Math.min(...upcoming.map((event) => Number(event.id))) : null;
}

export function buildPlanningTree(treeKey, firstFutureGw) {
  const first = Number(firstFutureGw);
  if (!Number.isInteger(first) || first < 1 || first > 38) return [];
  const anchorId = `${treeKey}_start`;
  const nodes = [{
    id: anchorId, label: first === 1 ? "Season start" : `GW${first - 1} complete`, gw: first - 1,
    parentId: null, probability: 100, chip: "none", scenarioId: "base", isAnchor: true,
  }];
  let parentId = anchorId;
  for (let gw = first; gw <= Math.min(38, first + 5); gw += 1) {
    const id = `${treeKey}_gw${gw}`;
    nodes.push({ id, label: `GW${gw}`, gw, parentId, probability: 100, chip: "none", scenarioId: "inherit" });
    parentId = id;
  }
  return nodes;
}

// Advance each stored tree independently, preserving its branches and custom labels.
export function advancePlanningTrees(nodes, firstFutureGw) {
  if (!Number.isInteger(firstFutureGw) || firstFutureGw < 1 || firstFutureGw > 38) return nodes;
  const rootById = new Map(nodes.map((node) => [node.id, getNodePath(nodes, node.id)[0]?.id]));
  const firstByRoot = new Map();
  nodes.filter((node) => !node.isAnchor).forEach((node) => {
    const root = rootById.get(node.id);
    firstByRoot.set(root, Math.min(firstByRoot.get(root) ?? 39, Number(node.gw)));
  });
  let changed = false;
  const next = nodes.flatMap((node) => {
    const offset = firstFutureGw - firstByRoot.get(rootById.get(node.id));
    if (!Number.isFinite(offset) || offset === 0) return [node];
    changed = true;
    const gw = Number(node.gw) + offset;
    if (gw > 38) return [];
    const label = node.isAnchor ? (gw === 0 ? "Season start" : `GW${gw} complete`) : /^GW\d+$/.test(node.label) ? `GW${gw}` : node.label;
    return [{ ...node, gw, label }];
  });
  return changed ? completeTreeHorizons(next) : nodes;
}
