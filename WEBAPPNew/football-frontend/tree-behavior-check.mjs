// Offline browser regression fixture using the real page and MyTeam provider.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../diagnostics/tree-behavior-check/', import.meta.url);
await mkdir(output, { recursive: true });
const mocks = {
  UserContext: `const value = { authHeaders: {}, recordRecentTeamId: async () => {}, guestTrackingId: 'test', hasSession: false }; export const useUserData = () => value;`,
  OptimizationModelContext: `export const useOptimizationModel = () => ({ modelType: 'ai' });`,
  StatsContext: `const value = { fetchIfNeeded: async () => {}, TeamData: { current: [] }, PlayersData: { current: [] } }; export const useStatsData = () => value;`,
  AdjustmentsContext: `export const BASE_SCENARIO_ID = 'base'; export const DEFAULT_SCENARIO_COLOR = '#888'; const value = { fetchIfNeeded: async () => {}, scenarios: [{ id: 'base', name: 'Base' }], getScenarioPlayerData: () => [], Playerdata: { current: [] }, Teamdata: { current: [] } }; export const useAdjustmentData = () => value;`,
};
const fixture = `
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Page from './src/features/optimizer/pages/OptimizerPage.jsx';
import { MyTeamDataContextProvider, useMyteamData } from './src/Contexts/MyTeamContext.jsx';
const key = 'fpl_optimizer_tree_workspace_v1';
localStorage.clear();
localStorage.setItem(key, JSON.stringify({ treeEditorOpen: true, activeTreeRootId: 'root', nodes: [
  { id:'root', gw:5, isAnchor:true, label:'Start', probability:100, chip:'none', treeName:'First tree' },
  { id:'shared', parentId:'root', gw:6, label:'Shared', probability:100, chip:'none' },
  { id:'left', parentId:'shared', gw:7, label:'Left', probability:50, chip:'none' },
  { id:'right', parentId:'shared', gw:7, label:'Right', probability:50, chip:'none' },
  { id:'root-two', gw:5, isAnchor:true, label:'Start', probability:100, chip:'none', treeName:'Second tree' },
  { id:'other', parentId:'root-two', gw:6, label:'Other', probability:100, chip:'none' },
] }));
const squad = ['GKP','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD','GKP','DEF','MID','FWD'].map((position,i) => ({ name:'Player '+i, web_name:'P'+i, position, gw:6, squad_position:i+1, Points:5, value:5 }));
const requests = [];
window.alert = (message) => { throw new Error(message); };
window.fetch = async (url, options) => {
  if (String(url).includes('Planning_Events')) return { ok:true, json:async()=>[{id:6,finished:false,deadline_time:new Date(Date.now()+86400000).toISOString()}] };
  if (String(url).includes('Get_My_Team')) return { ok:true, json:async()=>squad };
  if (String(url).includes('My_Team_Optimize')) return new Promise(resolve => requests.push({body:JSON.parse(options.body),resolve}));
  throw new Error('Unexpected request: '+url);
};
function Harness() {
  const context = useMyteamData();
  const [visible,setVisible] = useState(true);
  useEffect(() => { window.context=context; window.setPageVisible=setVisible; });
  return <MemoryRouter>{visible ? <Page/> : <div>Other page</div>}</MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<MyTeamDataContextProvider><Harness/></MyTeamDataContextProvider>);
const tick = () => new Promise(resolve=>setTimeout(resolve,40));
const assert = (condition,message) => { if(!condition) throw new Error(message); };
async function until(predicate,label) { for(let i=0;i<150;i++){if(predicate())return;await tick();} throw new Error('Timed out: '+label); }
const stored = () => JSON.parse(localStorage.getItem(key));
const chip = id => stored().nodes.find(n=>n.id===id)?.chip;
function rootCircle(name) { return [...document.querySelectorAll('[title="Click to select this decision tree"],[title="Selected decision tree"]')].find(el=>el.textContent.includes(name)); }
function options(rootId) {
  const nodes=stored().nodes;
  const belongs = node => node.id===rootId || (node.parentId && belongs(nodes.find(n=>n.id===node.parentId)));
  return { scenarioTree:{ nodes:nodes.filter(belongs).map(n=>({...n,parent_id:n.parentId||null})) } };
}
function rowsFor(request,tag) {
  const nodes=request.body.scenario_tree.nodes;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const leaves=nodes.filter(n=>!nodes.some(child=>child.parent_id===n.id));
  return leaves.flatMap(leaf=>{
    const path=[];let node=leaf;while(node){path.unshift(node);node=byId.get(node.parent_id);}
    return path.filter(n=>!n.isAnchor).flatMap(n=>squad.map((p,i)=>({Name:p.name,web_name:p.web_name,position:p.position,GW:n.gw,Points:9,value:5,status:i<11?'playing':'benched',solution:1,tree_branch_id:leaf.id,tree_path_node_ids:path.map(x=>x.id).join('>'),tree_branch_probability:1/leaves.length,tree_branch_expected_points:99,tree_expected_points:99,testRun:tag})));
  });
}
function finish(request,tag,stream=true) {
  const rows=rowsFor(request,tag);
  if(!stream){request.resolve({ok:true,body:null,json:async()=>rows});return;}
  const payload='event: solution\\ndata: '+JSON.stringify({solution:1,rows})+'\\n\\nevent: done\\ndata: {"solutions_found":1}\\n\\n';
  request.resolve(new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(payload));controller.close();}})));
}
const passed=[];
async function tests() {
  await until(()=>window.context && document.querySelector('[data-tree-node="left"]'),'page mounted');
  window.context.setTeamId('1');await tick();await window.context.fetchMyTeam();await tick();
  const select=document.querySelector('[data-tree-node="left"] select');
  select.value='wildcard';select.dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>chip('left')==='wildcard','selected chip saved');
  assert(chip('right')==='none' && chip('other')==='none','chip leaked to another branch/tree');
  passed.push('Chip affects only the selected branch');
  document.querySelector('[title="Add another GW7 branch"]').click();
  await until(()=>stored().nodes.filter(n=>n.parentId==='shared').length===3,'new branch created');
  assert(stored().nodes.filter(n=>n.parentId==='shared' && n.id!=='left').every(n=>n.chip==='none'),'new branch copied sibling chip');
  passed.push('New branches start without a sibling chip');
  const optimize=document.querySelector('[title="Optimize the selected decision tree"]');
  assert(!optimize.disabled,'Optimize is unexpectedly disabled');optimize.click();
  await until(()=>requests.length===1,'tree request submitted');
  assert(requests[0].body.scenario_tree.nodes.find(n=>n.id==='left').chip==='wildcard','selected chip missing from request');
  assert(requests[0].body.scenario_tree.nodes.find(n=>n.id==='right').chip==='none','sibling chip changed in request');
  const firstOptions=options('root'),secondOptions=options('root-two');
  window.setPageVisible(false);await tick();finish(requests[0],'first');
  await until(()=>window.context.treeOptimizationResults.root?.rows[0]?.testRun==='first','results cached while page unmounted');
  window.setPageVisible(true);await until(()=>document.body.textContent.includes('Optimized squad'),'optimized squad restored');
  passed.push('Streamed results survive navigating away during the run and returning');
  let pending=window.context.fetchTeam(secondOptions);await until(()=>requests.length===2,'second tree request');
  finish(requests[1],'second',false);await pending;await tick();
  assert(window.context.treeOptimizationResults.root.rows[0].testRun==='first','second tree replaced first results');
  assert(window.context.treeOptimizationResults['root-two'].rows[0].testRun==='second','second tree result not cached');
  window.setPageVisible(false);await tick();window.setPageVisible(true);await tick();
  assert(Object.keys(window.context.treeOptimizationResults).length===2,'cached trees lost after remount');
  passed.push('Independent tree results survive leaving and returning');
  pending=window.context.fetchTeam(firstOptions);await until(()=>requests.length===3,'replacement run');await tick();
  assert(!window.context.treeOptimizationResults.root,'new run did not clear its old results');
  assert(window.context.treeOptimizationResults['root-two'],'new run cleared another tree');
  finish(requests[2],'replacement');await pending;await tick();
  passed.push('A new run clears/replaces only its own tree');
  const stale=window.context.fetchTeam(firstOptions);await until(()=>requests.length===4,'old overlapping request');
  const latest=window.context.fetchTeam(firstOptions);await until(()=>requests.length===5,'new overlapping request');
  finish(requests[4],'latest');await latest;finish(requests[3],'stale');await stale;await tick();
  assert(window.context.treeOptimizationResults.root.rows[0].testRun==='latest','older run overwrote newer cache');
  passed.push('An older request cannot overwrite a newer run');
  rootCircle('Second tree').click();await tick();
  document.querySelector('[aria-label="Delete selected decision tree"]').click();await tick();
  assert(!window.context.treeOptimizationResults['root-two'],'deleted tree retained cached results');
  assert(window.context.treeOptimizationResults.root,'deleting another tree cleared first results');
  assert(!stored().nodes.some(n=>n.id==='root-two'),'tree was not deleted');
  passed.push('Deleting a tree clears its cache only');
  pending=window.context.fetchTeam(firstOptions);await until(()=>requests.length===6,'pending deleted run');
  window.context.clearTreeOptimization('root');finish(requests[5],'deleted');await pending;await tick();
  assert(!window.context.treeOptimizationResults.root,'deleted run restored cached results');
  passed.push('Late results cannot recreate an invalidated cache');
  pending=window.context.fetchTeam(firstOptions);await until(()=>requests.length===7,'final base run');
  finish(requests[6],'base');await pending;await tick();
  document.querySelector('[aria-label="Delete selected decision tree"]').click();await tick();
  assert(!window.context.treeOptimizationResults.root,'resetting base tree retained results');
  assert(stored().nodes.filter(n=>!n.parentId).length===1,'base reset did not preserve a tree');
  passed.push('Resetting the base tree clears its results');
  window.testResult={passed};
}
tests().catch(error=>{window.testResult={passed,error:error.stack};console.error(error);});
`;
await build({ jsx: 'automatic',
  stdin: { contents: fixture, sourcefile: 'tree-behavior-fixture.jsx', resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, outfile: fileURLToPath(new URL('fixture.js', output)),
  format: 'iife', platform: 'browser', loader: { '.png': 'dataurl' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'offline-contexts', setup(builder) {
    builder.onResolve({ filter: /(?:Contexts\/|^\.\/)(UserContext|OptimizationModelContext|StatsContext|AdjustmentsContext)(?:\.jsx)?$/ }, (args) => {
      const name=args.path.split('/').at(-1).replace(/\.jsx$/, '');
      return { path:name, namespace:'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace:'fixture' }, (args) => ({ contents:mocks[args.path], loader:'js' }));
  } }],
});
await writeFile(new URL('index.html', output), '<!doctype html><html><body><div id="root"></div><script src="fixture.js"></script></body></html>');
console.log('Offline tree behavior fixture built in diagnostics/tree-behavior-check.');
