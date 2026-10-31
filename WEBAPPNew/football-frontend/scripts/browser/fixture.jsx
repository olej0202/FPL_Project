import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '../../src/App';
import AppProviders from '../../src/app/AppProviders';
import { useUserData } from '../../src/Contexts/UserContext';
import { useMyteamData } from '../../src/Contexts/MyTeamContext';
import { useAdjustmentData } from '../../src/Contexts/AdjustmentsContext';

const samples = await (await fetch('api.json')).json();
window.__requests = [];
window.__savedOptimizations = [];
window.alert = message => { throw new Error(message); };
window.confirm = () => true;
localStorage.clear();
localStorage.setItem('fpl_auth_token_v1', 'local-guest.browser-test');
localStorage.setItem('fpl_auth_provider_v1', 'guest');
localStorage.setItem('fpl_guest_recent_team_ids_v1', JSON.stringify([2440, 46805]));

const json = payload => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.href);
  const endpoint = url.pathname.replace(/^\//, '');
  window.__requests.push({ endpoint, method: options.method || 'GET', body: options.body });
  if (endpoint.startsWith('analytics/')) return json({ ok: true });
  if (endpoint === 'auth/guest') return json({ token: 'local-guest.browser-test', provider: 'guest', user: { name: 'Guest', id: 'test' } });
  if (endpoint === 'auth/me') return json({ provider: 'guest', user: { name: 'Guest', id: 'test' }, recent_team_ids: [2440] });
  if (endpoint.startsWith('user/saved-optimizations')) {
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      window.__savedOptimizations = [{ id: payload.optimization_id, name: payload.name, snapshot: payload.snapshot }];
    }
    if (options.method === 'DELETE') window.__savedOptimizations = [];
    return json({ saved_optimizations: window.__savedOptimizations });
  }
  if (endpoint === 'user/recent-team-id') return json({ recent_team_ids: [2440] });
  if (endpoint === 'Player_picture') return new Response('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
  if (endpoint === 'Player') {
    const name = url.searchParams.get('player');
    return json(samples.Player.filter(row => !name || row.Name === name || row.name === name));
  }
  if (endpoint === 'Teams_Analysis') return json(samples.Teams_Analysis.filter(row => !url.searchParams.get('team') || row.name === url.searchParams.get('team')));
  if (endpoint === 'Matches') return json(samples.Matches.filter(row => Number(row.Fix_ID) === Number(url.searchParams.get('fix_id'))));
  if (endpoint === 'My_Team_Optimize') {
    const request = JSON.parse(options.body);
    const nodes = request.scenario_tree?.nodes || [];
    const byId = new Map(nodes.map(node => [node.id, node]));
    const leaves = nodes.filter(node => !nodes.some(child => child.parent_id === node.id));
    const rows = leaves.flatMap(leaf => {
      const path = []; let node = leaf;
      while (node) { path.unshift(node); node = byId.get(node.parent_id); }
      return path.filter(node => node.gw >= 9).flatMap(node => samples.Get_My_Team.map((player, index) => ({
        Name: player.name, web_name: player.web_name || player.name, position: player.position, GW: node.gw,
        Points: 5, Points_prediction: 5, value: 5, status: index < 11 ? 'playing' : 'benched', Is_captain: index === 9,
        solution: 1, tree_branch_id: leaf.id, tree_path_node_ids: path.map(item => item.id).join('>'),
        tree_branch_probability: 1 / leaves.length, tree_branch_expected_points: 60,
        tree_expected_points: 60, solution_base_objective: 60, solution_TotalExpectedPoints: 60,
      })));
    });
    const payload = `event: solution\ndata: ${JSON.stringify({ solution: 1, rows })}\n\nevent: done\ndata: {"solutions_found":1}\n\n`;
    return new Response(payload, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  if (Object.hasOwn(samples, endpoint)) return json(samples[endpoint]);
  throw new Error(`Browser check requested an unmocked endpoint: ${endpoint}`);
};

export function Harness() {
  const user = useUserData();
  const myTeam = useMyteamData();
  const adjustments = useAdjustmentData();
  useEffect(() => { window.__frontend = { user, myTeam, adjustments }; });
  return <App />;
}

createRoot(document.getElementById('root')).render(<HashRouter><AppProviders><Harness /></AppProviders></HashRouter>);
