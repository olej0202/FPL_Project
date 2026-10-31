import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDefinitions } from './routeDefinitions.js';
import { isNavigationActive, mainNavigation, matchesPath } from './navigation.js';

function routesAt(definitions, prefix = '') {
  return definitions.flatMap(route => {
    const path = route.path?.startsWith('/') ? route.path : `${prefix}/${route.path || ''}`.replace(/\/+$/, '') || '/';
    return [{ ...route, fullPath: path }, ...routesAt(route.children || [], path === '/' ? '' : path)];
  });
}

test('all existing bookmarks and legacy entry points remain reachable', () => {
  const paths = new Set(routesAt(routeDefinitions).map(route => route.fullPath));
  for (const path of [
    '/', '/My_Team', '/My_Team_Testcase', '/Chip_Team', '/Team_Overview', '/FreeHitTeam', '/Wildcard_Team',
    '/AI_Model/Players', '/AI_Model/Fixtures', '/AI_Model/Teams',
    '/Team_Analytics/Team_Rankings', '/Team_Analytics/Team_Individual', '/Team_Analytics/Team_Analysis',
    '/Player_Analytics/Rankings', '/Player_Analytics/Individual', '/Weekly_Review', '/Personal_Analysis',
    '/News', '/Price_Changes', '/Score_Predictions', '/Matches', '/TeamPredictionsFuture',
    '/Season_Analysis/Season_Players', '/Season_Analysis/Season_Teams', '/Season_Analysis/Season_Matches',
    '/Adjustment_Analysis/Adjustment_Player', '/Adjustment_Analysis/Adjustment_Teams',
    '/Adjustment_Analysis/Adjustment_Fixture', '/Adjustment_Analysis/Adjustment_Simulator',
  ]) assert.ok(paths.has(path), `Missing existing route: ${path}`);
});

test('every page still uses its availability flag', () => {
  for (const route of routesAt(routeDefinitions).filter(route => !route.redirect)) {
    assert.ok(route.component, route.fullPath);
    assert.ok(route.siteKey, `Missing availability flag on ${route.fullPath}`);
  }
});

test('navigation matches complete path segments and highlights optimizer subpages', () => {
  assert.ok(matchesPath('/AI_Model/Players', '/AI_Model'));
  assert.ok(!matchesPath('/AI_Model_Other', '/AI_Model'));
  const optimize = mainNavigation.find(item => item.to === '/My_Team');
  assert.ok(isNavigationActive(optimize, '/Chip_Team'));
  assert.ok(isNavigationActive(optimize, '/Team_Overview'));
  assert.ok(!isNavigationActive(optimize, '/Price_Changes'));
});
