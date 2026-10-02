import test from 'node:test';
import assert from 'node:assert/strict';
import { shareDecisionPlanEdits, getPlanningPath, resolvePlanningPath, plansForPath, migrateNodePlans, completeTreeHorizons, alignTreeResultPaths, extendTreeToResultHorizon } from './treeWorkspace.js';

const nodes = [
  { id: 'root', gw: 5, isAnchor: true },
  { id: 'shared', parentId: 'root', gw: 6 },
  { id: 'left', parentId: 'shared', gw: 7 },
  { id: 'right', parentId: 'shared', gw: 7 },
  { id: 'right-next', parentId: 'right', gw: 8 },
  { id: 'other-root', gw: 5, isAnchor: true },
  { id: 'other', parentId: 'other-root', gw: 6 },
];

test('editing a split decision shares transfers and lineup with siblings only', () => {
  const previous = { 'right-next': { transfers: [{ id: 'later' }] }, other: { transfers: [{ id: 'other' }] } };
  const next = { ...previous, left: { transfers: [{ id: 'shared-move', nodeId: 'left' }], statusOverrides: { A: 'benched' } } };
  const result = shareDecisionPlanEdits(previous, next, nodes);
  assert.equal(result.right.transfers[0].nodeId, 'right');
  assert.equal(result.right.transfers[0].id, 'shared-move');
  assert.equal(result.right.transfers[0].gw, 7);
  assert.deepEqual(result.right.statusOverrides, { A: 'benched' });
  assert.equal(result['right-next'], previous['right-next']);
  assert.equal(result.other, previous.other);
});

test('removing the last forced move clears all outcomes at that deadline', () => {
  const previous = { left: { transfers: [{ id: 'move' }] }, right: { transfers: [{ id: 'move' }] } };
  const result = shareDecisionPlanEdits(previous, { ...previous, right: { transfers: [] } }, nodes);
  assert.deepEqual(result.left.transfers, []);
  assert.deepEqual(result.right.transfers, []);
});

test('sibling paths inherit shared plans without leaking sibling or other-tree moves', () => {
  const plans = { shared: { transfers: ['shared'] }, left: { transfers: ['left'] }, right: { transfers: ['right'] }, other: { transfers: ['other'] } };
  const path = getPlanningPath(nodes, 'root', 'right');
  assert.deepEqual(path.map((node) => node.id), ['shared', 'right', 'right-next']);
  assert.deepEqual(plansForPath(plans, path), { 6: { transfers: ['shared'] }, 7: { transfers: ['right'] }, 8: {} });
  assert.deepEqual(getPlanningPath(nodes, 'other-root', 'right').map((node) => node.id), ['other']);
});

test('legacy gameweek plans migrate onto one path, preserving explicit node plans', () => {
  const plans = migrateNodePlans({ 7: { transfers: [{ id: 'legacy' }] }, right: { transfers: [{ id: 'existing' }] } }, nodes, 'root');
  assert.equal(plans.left.transfers[0].nodeId, 'left');
  assert.equal(plans.right.transfers[0].id, 'existing');
  assert.equal(plans.right.transfers[0].gw, 7);
  assert.equal(plans.other, undefined);
});

test('deleted selections fall back to a valid path', () => {
  assert.deepEqual(getPlanningPath(nodes, 'root', 'deleted').map((node) => node.id), ['shared', 'left']);
});

test('branch navigation follows the chosen fork when viewing a shared ancestor', () => {
  assert.deepEqual(resolvePlanningPath(nodes, 'root', 'shared', 'right-next').map((node) => node.id), ['shared', 'right', 'right-next']);
  assert.deepEqual(resolvePlanningPath(nodes, 'root', 'right', 'right-next').map((node) => node.id), ['shared', 'right', 'right-next']);
  assert.deepEqual(resolvePlanningPath(nodes, 'root', 'left', 'right-next').map((node) => node.id), ['shared', 'left']);
});

test('short branches extend to the longest horizon in their own tree', () => {
  const complete = completeTreeHorizons(nodes);
  const leftPath = getPlanningPath(complete, 'root', 'left');
  assert.deepEqual(leftPath.map((node) => node.gw), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(getPlanningPath(complete, 'root', 'right').map((node) => node.gw), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(getPlanningPath(complete, 'other-root', 'other').map((node) => node.gw), [6, 7, 8, 9, 10, 11]);
  assert.equal(leftPath.at(-1).scenarioId, 'inherit');
  assert.equal(leftPath.at(-1).chip, 'none');
  assert.equal(completeTreeHorizons(complete), complete);
});

test('later solver rows remain attached after extending a legacy branch', () => {
  const complete = completeTreeHorizons(nodes);
  const rows = [{ GW: 12, tree_branch_id: 'left', tree_path_node_ids: 'root>shared>left', Name: 'Player' }];
  const extended = extendTreeToResultHorizon(complete, 'root', rows);
  assert.equal(getPlanningPath(extended, 'root', 'left').at(-1).gw, 12);
  assert.equal(getPlanningPath(extended, 'other-root', 'other').at(-1).gw, 11);
  const aligned = alignTreeResultPaths(rows, extended);
  assert.equal(aligned[0].GW, 12);
  assert.equal(aligned[0].Name, 'Player');
  assert.equal(aligned[0].tree_branch_id, getPlanningPath(extended, 'root', 'left').at(-1).id);
  assert.equal(aligned[0].tree_path_node_ids.split('>').length, 8);
});

test('the six-gameweek horizon stops at GW38', () => {
  const complete = completeTreeHorizons([{ id: 'anchor', gw: 36, isAnchor: true }, { id: 'gw37', parentId: 'anchor', gw: 37 }]);
  assert.deepEqual(getPlanningPath(complete, 'anchor', 'gw37').map((node) => node.gw), [37, 38]);
});
