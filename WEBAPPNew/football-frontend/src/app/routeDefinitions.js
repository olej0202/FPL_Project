import { lazy } from 'react';

// Explicit imports let Vite build one entry per page. Paths and legacy redirects
// stay stable, including links saved in user plans and shared bookmarks.
const pages = {
  TeamAnalytics: lazy(() => import('../features/team-analytics/TeamAnalyticsLayout.jsx')),
  TeamRankings: lazy(() => import('../features/team-analytics/pages/TeamRankingsPage.jsx')),
  TeamIndividual: lazy(() => import('../features/team-analytics/pages/TeamIndividualPage.jsx')),
  TeamAnalysis: lazy(() => import('../features/team-analytics/pages/TeamAnalysisPage.jsx')),
  Scores: lazy(() => import('../features/fixtures/pages/ScorePredictionsPage.jsx')),
  Fixtures: lazy(() => import('../features/fixtures/pages/FixtureTickerPage.jsx')),
  Weekly: lazy(() => import('../features/reviews/pages/WeeklyReviewPage.jsx')),
  Personal: lazy(() => import('../features/reviews/pages/PersonalAnalysisPage.jsx')),
  Optimizer: lazy(() => import('../features/optimizer/OptimizerLayout.jsx')),
  Optimize: lazy(() => import('../features/optimizer/pages/OptimizerPage.jsx')),
  Overview: lazy(() => import('../features/optimizer/pages/TeamOverviewPage.jsx')),
  ChipTeam: lazy(() => import('../features/chip-team/pages/ChipTeamPage.jsx')),
  AIModel: lazy(() => import('../features/ai-model/AIModelLayout.jsx')),
  Rankings: lazy(() => import('../features/ai-model/pages/PlayerRankingsPage.jsx')),
  PlayerAnalytics: lazy(() => import('../features/player-analytics/PlayerAnalyticsLayout.jsx')),
  Player: lazy(() => import('../features/player-analytics/pages/PlayerIndividualPage.jsx')),
  News: lazy(() => import('../features/news/pages/NewsPage.jsx')),
  Prices: lazy(() => import('../features/prices/pages/PriceChangesPage.jsx')),
  Season: lazy(() => import('../features/season/SeasonLayout.jsx')),
  Matches: lazy(() => import('../features/season/pages/MatchesPage.jsx')),
  SeasonTeams: lazy(() => import('../features/season/pages/SeasonTeamsPage.jsx')),
  SeasonPlayers: lazy(() => import('../features/season/pages/SeasonPlayersPage.jsx')),
  Statistical: lazy(() => import('../features/statistical-model/StatisticalModelLayout.jsx')),
  AdjustTeams: lazy(() => import('../features/statistical-model/pages/TeamAdjustmentsPage.jsx')),
  AdjustPlayers: lazy(() => import('../features/statistical-model/pages/PlayerAdjustmentsPage.jsx')),
  AdjustFixtures: lazy(() => import('../features/statistical-model/pages/FixtureAdjustmentsPage.jsx')),
  Simulator: lazy(() => import('../features/statistical-model/pages/SimulatorPage.jsx')),
};

const page = (path, component, siteKey, title, children) => ({ path, component: pages[component], siteKey, title, children });
const redirect = (path, to) => path == null ? { index: true, redirect: to } : { path, redirect: to };

export const routeDefinitions = [
  page('/Team_Analytics', 'TeamAnalytics', 'teamAnalyticsShell', 'Team Analytics', [
    redirect(null, 'Team_Rankings'),
    page('Team_Rankings', 'TeamRankings', 'teamAnalyticsRankings', 'Team Analytics Rankings'),
    page('Team_Individual', 'TeamIndividual', 'teamAnalyticsIndividual', 'Team Analytics Individual'),
    page('Team_Analysis', 'TeamAnalysis', 'teamAnalyticsAnalysis', 'Team Analytics Analysis'),
  ]),
  page('/Score_Predictions', 'Scores', 'scorePredictions', 'Score Predictions'),
  page('/Weekly_Review', 'Weekly', 'weeklyReview', 'Weekly Review'),
  page('/Personal_Analysis', 'Personal', 'personalAnalysis', 'Personal Analysis'),
  page('/', 'Optimizer', 'aiTeamsShell', 'AI Teams', [
    redirect(null, '/My_Team'),
    redirect('FreeHitTeam', '/Chip_Team?mode=freehit'),
    redirect('Wildcard_Team', '/Chip_Team?mode=wildcard'),
    page('Team_Overview', 'Overview', 'aiTeamsOverview', 'Team Overview'),
    page('Chip_Team', 'ChipTeam', 'aiTeamsChip', 'AI Teams'),
    page('My_Team', 'Optimize', 'aiTeamsOptimize', 'Optimize'),
    redirect('My_Team_Testcase', '/My_Team'),
  ]),
  page('/AI_Model', 'AIModel', 'playerAnalyticsRankings', 'AI Model', [
    redirect(null, 'Players'),
    page('Players', 'Rankings', 'playerAnalyticsRankings', 'AI Model Players'),
    page('Fixtures', 'Fixtures', 'fixtureAnalytics', 'AI Model Fixtures'),
    redirect('Teams', '/AI_Model/Fixtures'),
  ]),
  page('/Player_Analytics', 'PlayerAnalytics', 'playerAnalyticsShell', 'Player Analytics', [
    redirect(null, 'Individual'),
    redirect('Rankings', '/AI_Model/Players'),
    page('Individual', 'Player', 'playerAnalyticsIndividual', 'Player Analytics Individual'),
  ]),
  page('/News', 'News', 'news', 'PL News'),
  page('/Price_Changes', 'Prices', 'priceChanges', 'Price Changes'),
  redirect('/Matches', '/Season_Analysis/Season_Matches'),
  page('/Season_Analysis', 'Season', 'seasonAnalyticsShell', 'Season Analysis', [
    redirect(null, 'Season_Players'),
    page('Season_Matches', 'Matches', 'matches', 'Season Analytics Matches'),
    page('Season_Teams', 'SeasonTeams', 'seasonAnalyticsTeams', 'Season Analytics Teams'),
    page('Season_Players', 'SeasonPlayers', 'seasonAnalyticsPlayers', 'Season Analytics Players'),
  ]),
  page('/Adjustment_Analysis', 'Statistical', 'statisticalModelShell', 'Statistical Model', [
    redirect(null, 'Adjustment_Player'),
    page('Adjustment_Teams', 'AdjustTeams', 'statisticalModelTeams', 'Statistical Model Team Adjustment'),
    page('Adjustment_Player', 'AdjustPlayers', 'statisticalModelPlayers', 'Statistical Model Player Adjustment'),
    page('Adjustment_Fixture', 'AdjustFixtures', 'statisticalModelFixtures', 'Statistical Model Fixture Adjustment'),
    page('Adjustment_Simulator', 'Simulator', 'statisticalModelSimulator', 'Statistical Model Simulator'),
  ]),
  page('/TeamPredictionsFuture', 'Fixtures', 'fixtureAnalytics', 'Fixture Analytics'),
];
