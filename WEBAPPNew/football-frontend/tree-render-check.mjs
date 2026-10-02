import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const output = new URL('./.tree-render-check.mjs', import.meta.url);
const mocks = {
  MyTeamContext: `export const useMyteamData = () => ({ teamId: '1', bannedList: [], bannedPlayersData: [], teamData: globalThis.__renderTeam || [], data: [], optimizationProgress: {}, savedOptimizations: [] });`,
  OptimizationModelContext: `export const useOptimizationModel = () => ({ modelType: 'ai' });`,
  StatsContext: `export const useStatsData = () => ({ TeamData: { current: [] }, PlayersData: { current: [] } });`,
  AdjustmentsContext: `export const BASE_SCENARIO_ID = 'base'; export const DEFAULT_SCENARIO_COLOR = '#888'; export const useAdjustmentData = () => ({ scenarios: [{ id: 'base', name: 'Base scenario' }, { id: 'alternate', name: 'Alternate scenario' }], getScenarioPlayerData: () => [], Playerdata: { current: [] }, Teamdata: { current: [] } });`,
};
const result = await build({
  entryPoints: ['src/My_team_Testcase.jsx'], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
  loader: { '.png': 'dataurl' },
  plugins: [{ name: 'context-fixtures', setup(builder) {
    builder.onResolve({ filter: /Contexts\/(MyTeamContext|OptimizationModelContext|StatsContext|AdjustmentsContext)$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
await writeFile(output, result.outputFiles[0].text);
try {
  const { default: Page } = await import(output.href);
  globalThis.__renderTeam = ['GKP', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'GKP', 'DEF', 'MID', 'FWD'].map((position, index) => ({ name: `Player ${index + 1}`, web_name: `P${index + 1}`, position, gw: 6, squad_position: index + 1, Points: 5 }));
  globalThis.window = { localStorage: { getItem: () => JSON.stringify({
    enabled: false, controlsOpen: false, activeTreeRootId: 'start',
    nodes: [
      { id: 'start', gw: 5, label: 'GW5 complete', isAnchor: true, probability: 100, chip: 'none', treeName: 'My branches', optimization: { modelType: 'ai', risk: 0.6, valtrans: 0 } },
      { id: 'shared', parentId: 'start', gw: 6, label: 'Shared', probability: 100, chip: 'none' },
      { id: 'left', parentId: 'shared', gw: 7, label: 'Left path', probability: 50, chip: 'wildcard' },
      { id: 'right', parentId: 'shared', gw: 7, label: 'Right path', probability: 50, chip: 'none' },
      { id: 'last', parentId: 'right', gw: 8, label: 'Last gameweek', probability: 50, chip: 'none' },
    ],
  }) } };
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Page)));
  assert.ok(html.includes('Decision tree'));
  assert.ok(html.includes('aria-label="Transfers for Shared, GW6"'));
  assert.ok(!html.includes('Click a top circle'));
  assert.ok(!html.includes('Compact view shows only'));
  assert.ok(html.includes('aria-label="Reset selected tree"'));
  assert.ok(!html.includes('Horizontal transfer tree'));
  assert.ok(!html.includes('Optimization controls'));
  assert.ok(html.indexOf('AI model') < html.indexOf('Decision tree'));
  assert.ok(html.includes('Statistical'));
  assert.ok(html.indexOf('aria-label="Selected node transfers"') < html.indexOf('aria-label="Pitch GW6"'));
  assert.equal((html.match(/aria-label="Pitch GW6"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Pitch GW/g) || []).length, 1);
  assert.ok(html.includes('aria-label="Branch to follow"'));
  assert.ok(html.includes('Previous GW'));
  assert.ok(html.includes('Next GW'));
  assert.ok(html.includes('GW11'));
  assert.ok(html.includes('alt="P1"'));
  assert.ok(!html.includes('Solution set'));
  assert.ok(!html.includes('Player view node'));
  assert.ok(!html.includes('Chip strategy'));
  const stored = JSON.parse(globalThis.window.localStorage.getItem());
  globalThis.window.localStorage.getItem = () => JSON.stringify({ ...stored, treeEditorOpen: false });
  const collapsed = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Page)));
  assert.ok(!collapsed.includes('id="tree-editor-canvas"'));
  assert.ok(!collapsed.includes('aria-label="Horizontal transfer tree"'));
  assert.ok(collapsed.includes('AI model'));
  assert.ok(collapsed.includes('aria-label="Pitch GW6"'));
  assert.equal((collapsed.match(/aria-label="Pitch GW/g) || []).length, 1);
  for (const [chip, label] of [['wildcard', 'Wildcard'], ['freehit', 'Free Hit']]) {
    globalThis.window.localStorage.getItem = () => JSON.stringify({ ...stored, nodes: stored.nodes.map((node) => node.id === 'shared' ? { ...node, chip } : node) });
    const chipHtml = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Page)));
    const transferSection = chipHtml.split('aria-label="Selected node transfers"')[1].split('aria-label="Pitch GW6"')[0];
    assert.ok(transferSection.includes(label));
    assert.ok(!transferSection.includes('No transfers'));
    assert.ok(!transferSection.includes('Forced transfer'));
    assert.ok(!transferSection.includes('Optimized transfer'));
  }
  globalThis.window.localStorage.getItem = () => JSON.stringify({ ...stored, treeEditorOpen: false, nodes: stored.nodes.map((node) => node.id === 'start' ? { ...node, optimization: { ...node.optimization, modelType: 'statistical' } } : node.id === 'shared' ? { ...node, scenarioId: 'alternate' } : node) });
  const scenarioHtml = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Page)));
  assert.ok(!scenarioHtml.includes('id="tree-editor-canvas"'));
  assert.ok(scenarioHtml.includes('aria-label="Scenario for selected branch node"'));
  assert.ok(scenarioHtml.includes('Alternate scenario'));
  assert.ok(scenarioHtml.indexOf('aria-label="Scenario for selected branch node"') < scenarioHtml.indexOf('aria-label="Pitch GW6"'));
  console.log('Render check passed: persistent model selection, branch navigation and scenario selection above one pitch, transfer photos area, chip-only Wildcard/Free Hit display, and a collapsible tree editor.');
} finally {
  delete globalThis.window;
  delete globalThis.__renderTeam;
  await unlink(output);
}
