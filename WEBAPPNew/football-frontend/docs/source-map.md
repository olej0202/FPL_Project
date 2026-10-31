# Source mapping

The public URLs are unchanged. Page implementation files now live under their feature.

| Previous source | Current source |
| --- | --- |
| `src/Team_Analytics.jsx` | [`src/features/team-analytics/TeamAnalyticsLayout.jsx`](../src/features/team-analytics/TeamAnalyticsLayout.jsx) |
| `src/Team_Analytics_rankings.jsx` | [`src/features/team-analytics/pages/TeamRankingsPage.jsx`](../src/features/team-analytics/pages/TeamRankingsPage.jsx) |
| `src/Team_Analytics_individual.jsx` | [`src/features/team-analytics/pages/TeamIndividualPage.jsx`](../src/features/team-analytics/pages/TeamIndividualPage.jsx) |
| `src/Team_Analytics_Analysis.jsx` | [`src/features/team-analytics/pages/TeamAnalysisPage.jsx`](../src/features/team-analytics/pages/TeamAnalysisPage.jsx) |
| `src/Team_Predictions.jsx` | [`src/features/fixtures/pages/ScorePredictionsPage.jsx`](../src/features/fixtures/pages/ScorePredictionsPage.jsx) |
| `src/Fixture_Ticker.jsx` | [`src/features/fixtures/pages/FixtureTickerPage.jsx`](../src/features/fixtures/pages/FixtureTickerPage.jsx) |
| `src/Player_Analytics.jsx` | [`src/features/player-analytics/PlayerAnalyticsLayout.jsx`](../src/features/player-analytics/PlayerAnalyticsLayout.jsx) |
| `src/Player_Analytics_rankings.jsx` | [`src/features/ai-model/pages/PlayerRankingsPage.jsx`](../src/features/ai-model/pages/PlayerRankingsPage.jsx) |
| `src/Player_Analytics_individual.jsx` | [`src/features/player-analytics/pages/PlayerIndividualPage.jsx`](../src/features/player-analytics/pages/PlayerIndividualPage.jsx) |
| `src/AI_Model.jsx` | [`src/features/ai-model/AIModelLayout.jsx`](../src/features/ai-model/AIModelLayout.jsx) |
| `src/Adjustment_Analytics.jsx` | [`src/features/statistical-model/StatisticalModelLayout.jsx`](../src/features/statistical-model/StatisticalModelLayout.jsx) |
| `src/Adjustment_Analytics_Player.jsx` | [`src/features/statistical-model/pages/PlayerAdjustmentsPage.jsx`](../src/features/statistical-model/pages/PlayerAdjustmentsPage.jsx) |
| `src/Adjustment_Analytics_Team.jsx` | [`src/features/statistical-model/pages/TeamAdjustmentsPage.jsx`](../src/features/statistical-model/pages/TeamAdjustmentsPage.jsx) |
| `src/Adjustment_Analytics_Simulator.jsx` | [`src/features/statistical-model/pages/SimulatorPage.jsx`](../src/features/statistical-model/pages/SimulatorPage.jsx) |
| `src/Adjustement_Analytics_Fixtures.jsx` | [`src/features/statistical-model/pages/FixtureAdjustmentsPage.jsx`](../src/features/statistical-model/pages/FixtureAdjustmentsPage.jsx) |
| `src/SeasonAnalysis.jsx` | [`src/features/season/SeasonLayout.jsx`](../src/features/season/SeasonLayout.jsx) |
| `src/Season_Analytics_Players.jsx` | [`src/features/season/pages/SeasonPlayersPage.jsx`](../src/features/season/pages/SeasonPlayersPage.jsx) |
| `src/Season_Analyticss_Teams.jsx` | [`src/features/season/pages/SeasonTeamsPage.jsx`](../src/features/season/pages/SeasonTeamsPage.jsx) |
| `src/Matches.jsx` | [`src/features/season/pages/MatchesPage.jsx`](../src/features/season/pages/MatchesPage.jsx) |
| `src/Weekly_Review.jsx` | [`src/features/reviews/pages/WeeklyReviewPage.jsx`](../src/features/reviews/pages/WeeklyReviewPage.jsx) |
| `src/Personal_Analysis.jsx` | [`src/features/reviews/pages/PersonalAnalysisPage.jsx`](../src/features/reviews/pages/PersonalAnalysisPage.jsx) |
| `src/News.jsx` | [`src/features/news/pages/NewsPage.jsx`](../src/features/news/pages/NewsPage.jsx) |
| `src/Price_Changes.jsx` | [`src/features/prices/pages/PriceChangesPage.jsx`](../src/features/prices/pages/PriceChangesPage.jsx) |
| `src/AITeams.jsx` | [`src/features/optimizer/OptimizerLayout.jsx`](../src/features/optimizer/OptimizerLayout.jsx) |
| `src/My_team_Testcase.jsx` | [`src/features/optimizer/pages/OptimizerPage.jsx`](../src/features/optimizer/pages/OptimizerPage.jsx) |
| `src/MyTeam_Display.jsx` | [`src/features/optimizer/pages/TeamOverviewPage.jsx`](../src/features/optimizer/pages/TeamOverviewPage.jsx) |
| `src/My_team.jsx` | [`src/features/optimizer/legacy/MyTeamLegacy.jsx`](../src/features/optimizer/legacy/MyTeamLegacy.jsx) |
| `src/AI_Chip_Team.jsx` | [`src/features/chip-team/pages/ChipTeamPage.jsx`](../src/features/chip-team/pages/ChipTeamPage.jsx) |
| `src/AI_Chip_Team.css` | [`src/features/chip-team/pages/ChipTeamPage.css`](../src/features/chip-team/pages/ChipTeamPage.css) |
| `src/Free_Hit.jsx` | [`src/features/chip-team/legacy/FreeHitLegacy.jsx`](../src/features/chip-team/legacy/FreeHitLegacy.jsx) |
| `src/Wildcard_team.jsx` | [`src/features/chip-team/legacy/WildcardLegacy.jsx`](../src/features/chip-team/legacy/WildcardLegacy.jsx) |
| `src/Test1.jsx` | [`src/features/legacy/TestPage.jsx`](../src/features/legacy/TestPage.jsx) |

Shared composition now lives in `src/app/`; shared presentation lives in
`src/components/layout`, `src/components/ui` and `src/components/filters`.
The optimization page also has separate controls, squad presentation, planning
hooks and workspace helpers in `src/features/optimizer/`.
