// Build an offline interactive fixture, served by mobile-browser-check.py.
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const output = '.mobile-check';
await mkdir(output, { recursive: true });
const mocks = {
  MyTeamContext: `let value; export const useMyteamData = () => value ||= ({ teamId: '1', setTeamId: () => {}, sethas_changed: () => {}, toggleBan: () => {}, bannedList: [], bannedPlayersData: [], teamData: globalThis.__renderTeam || [], data: [], optimizationProgress: {}, savedOptimizations: [] });`,
  OptimizationModelContext: `export const useOptimizationModel = () => ({ modelType: 'ai' });`,
  StatsContext: `const value = { fetchIfNeeded: () => {}, TeamData: { current: [] }, PlayersData: { current: [] } }; export const useStatsData = () => value;`,
  AdjustmentsContext: `export const BASE_SCENARIO_ID = 'base'; export const DEFAULT_SCENARIO_COLOR = '#888'; const empty = []; const value = { fetchIfNeeded: () => {}, scenarios: [{ id: 'base', name: 'Base scenario' }], getScenarioPlayerData: () => empty, Playerdata: { current: [] }, Teamdata: { current: [] } }; export const useAdjustmentData = () => value;`,
};
await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom'; import Page from './src/My_team_Testcase.jsx';
    globalThis.__renderTeam = ['GKP','DEF','DEF','DEF','MID','MID','MID','MID','MID','FWD','FWD','GKP','DEF','MID','FWD'].map((position,index)=>({name:'Player '+(index+1),web_name:'Player '+(index+1),position,gw:6,squad_position:index+1,Points:5}));
    localStorage.setItem('fpl_optimizer_tree_workspace_v1', JSON.stringify({ zoom: 1, activeTreeRootId:'start', nodes:[
      {id:'start',gw:5,label:'GW5 complete',isAnchor:true,probability:100,chip:'none',treeName:'Mobile check'},
      {id:'shared',parentId:'start',gw:6,label:'Shared',probability:100,chip:'none'},
      {id:'left',parentId:'shared',gw:7,label:'Healthy',probability:50,chip:'none'},
      {id:'right',parentId:'shared',gw:7,label:'Injured',probability:50,chip:'none'} ]}));
    createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, {}, React.createElement(Page)));`, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, outfile: `${output}/fixture.js`, platform: 'browser', format: 'esm', loader: { '.png': 'dataurl' },
  plugins: [{ name: 'contexts', setup(builder) {
    builder.onResolve({ filter: /Contexts\/(MyTeamContext|OptimizationModelContext|StatsContext|AdjustmentsContext)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const css = (await readdir('.tree-build-check/assets')).find(name => name.endsWith('.css'));
await writeFile(`${output}/style.css`, await readFile(`.tree-build-check/assets/${css}`));
await writeFile(`${output}/index.html`, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>');
console.log('Mobile browser fixture built.');
