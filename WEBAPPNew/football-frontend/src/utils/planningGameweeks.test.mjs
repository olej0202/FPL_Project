import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPlanningGameweek, buildPlanningTree, advancePlanningTrees } from './planningGameweeks.js';
import { getPlanningPath, completeTreeHorizons } from './treeWorkspace.js';

const now = Date.parse('2026-10-16T12:00:00Z');
test('finished and deadline-locked rounds are excluded even with stale prediction data', () => {
  assert.equal(nextPlanningGameweek([
    { id: 6, finished: true, deadline_time: '2026-10-20T12:00:00Z' },
    { id: 7, finished: false, deadline_time: '2026-10-16T12:00:00Z' },
    { id: 9, finished: false, deadline_time: '2026-10-30T12:00:00Z' },
    { id: 8, finished: false, deadline_time: '2026-10-23T12:00:00Z' },
  ], now), 8);
});

test('new plans cover six gameweeks and allow GW1 with a GW0 anchor', () => {
  for (const first of [1, 7, 33, 37, 38]) {
    const nodes = buildPlanningTree('tree', first);
    const path = getPlanningPath(nodes, nodes[0].id, nodes[0].id);
    assert.equal(nodes[0].gw, first - 1);
    assert.equal(path[0].gw, first);
    assert.equal(path.at(-1).gw, Math.min(first + 5, 38));
  }
  assert.deepEqual(buildPlanningTree('tree', null), []);
});

test('expired stored trees advance independently with labels and branches intact', () => {
  const nodes = [
    ...buildPlanningTree('one', 6),
    ...buildPlanningTree('two', 5),
    { id: 'fork', gw: 7, parentId: 'one_gw6', label: 'Custom outcome', probability: 50, chip: 'wildcard' },
  ];
  const advanced = advancePlanningTrees(nodes, 7);
  assert.equal(advanced.find((node) => node.id === 'one_gw6').label, 'GW7');
  assert.equal(advanced.find((node) => node.id === 'two_gw5').gw, 7);
  assert.equal(advanced.find((node) => node.id === 'fork').gw, 8);
  assert.equal(advanced.find((node) => node.id === 'fork').label, 'Custom outcome');
  assert.equal(advanced.find((node) => node.id === 'fork').chip, 'wildcard');
  assert.equal(advanced.find((node) => node.id === 'one_start').label, 'GW6 complete');
  assert.equal(advancePlanningTrees(advanced, 7), advanced);
});

test('advancing near season end trims every branch at GW38 instead of keeping an expired start', () => {
  const nodes = completeTreeHorizons([
    ...buildPlanningTree('tree', 6),
    { id: 'fork', gw: 7, parentId: 'tree_gw6', label: 'Alternative' },
  ]);
  const advanced = advancePlanningTrees(nodes, 37);
  assert.ok(advanced.every((node) => node.gw <= 38));
  assert.deepEqual(getPlanningPath(advanced, 'tree_start', 'tree_start').map((node) => node.gw), [37, 38]);
  assert.deepEqual(getPlanningPath(advanced, 'tree_start', 'fork').map((node) => node.gw), [37, 38]);
});

test('completed seasons and missing event data do not fall back to GW6', () => {
  assert.equal(nextPlanningGameweek([{ id: 38, finished: true, deadline_time: '2026-10-01T12:00:00Z' }], now), null);
  assert.equal(nextPlanningGameweek([], now), null);
  assert.equal(nextPlanningGameweek([{ id: 7 }], now), null);
});

test('a stored late-season tree resets to the correct range for a new season', () => {
  const nodes = advancePlanningTrees(buildPlanningTree('tree', 37), 1);
  assert.equal(nodes[0].gw, 0);
  assert.equal(nodes[0].label, 'Season start');
  assert.deepEqual(getPlanningPath(nodes, 'tree_start', 'tree_start').map((node) => node.gw), [1, 2, 3, 4, 5, 6]);
});
