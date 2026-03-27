export const SITE_AVAILABILITY = {
  teamAnalyticsShell: true,
  teamAnalyticsRankings: true,
  teamAnalyticsIndividual: true,
  teamAnalyticsAnalysis: true,

  scorePredictions: true,
  weeklyReview: true,
  personalAnalysis: true,
  fixtureAnalytics: true,

  aiTeamsShell: true,
  aiTeamsChip: true,
  aiTeamsOverview: true,
  aiTeamsOptimize: true,

  playerAnalyticsShell: true,
  playerAnalyticsRankings: true,
  playerAnalyticsIndividual: true,

  seasonAnalyticsShell: true,
  seasonAnalyticsTeams: true,
  seasonAnalyticsPlayers: true,

  statisticalModelShell: true,
  statisticalModelTeams: true,
  statisticalModelPlayers: true,
  statisticalModelFixtures: true,

  news: true,
};

export const isSiteAvailable = (siteKey) => SITE_AVAILABILITY[siteKey] !== false;
