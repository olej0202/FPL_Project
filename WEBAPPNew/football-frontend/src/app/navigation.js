import { ArrowUpDown, BarChart2, Brain, LayoutDashboard, Search, Trophy } from 'lucide-react';

export const analysisNavigation = [
  { to: '/Team_Analytics', label: 'Team Analytics' },
  { to: '/Player_Analytics', label: 'Player Analytics' },
  { to: '/Season_Analysis', label: 'Season Analytics' },
  { to: '/Weekly_Review', label: 'Weekly Review' },
  { to: '/Personal_Analysis', label: 'Personal Analysis' },
  { to: '/News', label: 'PL News' },
];

export const mainNavigation = [
  { to: '/My_Team', icon: Brain, label: 'Optimize', activePaths: ['/My_Team_Test', '/Chip_Team', '/Team_Overview'] },
  { to: '/AI_Model', icon: LayoutDashboard, label: 'AI Model' },
  { to: '/Adjustment_Analysis', icon: BarChart2, label: 'Statistical Model' },
  { icon: Search, label: 'Analysis', children: analysisNavigation },
  { to: '/Score_Predictions', icon: Trophy, label: 'Score Predictions' },
  { to: '/Price_Changes', icon: ArrowUpDown, label: 'Price Changes' },
];

export function matchesPath(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isNavigationActive(item, pathname) {
  return [item.to, ...(item.activePaths || []), ...(item.children || []).map(child => child.to)]
    .filter(Boolean).some(path => matchesPath(pathname, path));
}

export function navigationTitle(pathname) {
  const all = mainNavigation.flatMap(item => item.children || [item]);
  return all.find(item => matchesPath(pathname, item.to))?.label || 'FPL Analytics';
}
