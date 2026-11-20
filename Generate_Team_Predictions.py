"""Team predictions using XGBoost and the statistical XG formula.

Run from any directory: python Generate_Team_Predictions.py
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import skellam
from xgboost import XGBRegressor


ROOT = Path(__file__).resolve().parent
FEATURES = ["Own_XG", "Own_XGC", "Opposition_XG", "Opposition_XGC",
            "Own_XG_avg", "Own_XGC_avg", "Opposition_XG_avg", "Opposition_XGC_avg",
            "Own_XG_slope", "Own_XGC_slope", "Opposition_XG_slope", "Opposition_XGC_slope",
            "was_home"]


def match_features(own, opponent, home):
    """Use home/away ratings for both historical and upcoming fixtures."""
    home = np.asarray(home, dtype=bool)
    result = pd.DataFrame(index=own.index)
    for label, data, venue in [("Own", own, home), ("Opposition", opponent, ~home)]:
        result[f"{label}_XG"] = np.where(venue, data["XGH"], data["XGA"])
        result[f"{label}_XGC"] = np.where(venue, data["XGCH"], data["XGCA"])
        for col in ["XG_avg", "XGC_avg", "XG_slope", "XGC_slope"]:
            result[f"{label}_{col}"] = data[col].to_numpy()
    result["was_home"] = home.astype(int)
    return result[FEATURES].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)


def train_models(history):
    ratings = ["XGH", "XGA", "XGCH", "XGCA", "XG_avg", "XGC_avg", "XG_slope", "XGC_slope"]
    opponent = history[["code", "kickoff_time"] + ratings]
    paired = history.merge(opponent, left_on=["opponent", "kickoff_time"],
                           right_on=["code", "kickoff_time"], suffixes=("", "_opp"), validate="many_to_one")
    own = paired[ratings]
    other = paired[[f"{c}_opp" for c in ratings]].copy()
    other.columns = ratings
    features = match_features(own, other, paired["was_home"].astype(str).str.lower().isin(["true", "1"]))
    models = []
    for target in ["XG", "XGC"]:
        y = pd.to_numeric(paired[target], errors="coerce")
        valid = y.notna() & y.ge(0)
        model = XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.05,
                             objective="reg:squarederror", n_jobs=4, random_state=42)
        model.fit(features.loc[valid], y.loc[valid])
        models.append(model)
        print(f"Trained {target}: {valid.sum()} historical team matches")
    return models


def statistical_xg(features, own_error, opponent_error):
    """The Poisson mean formula used by Generate_Team_Predictions.py."""
    attack = 0.7 * features.Own_XG + 0.3 * features.Own_XG_avg - 0.5 * own_error
    defence = 0.7 * features.Opposition_XGC + 0.3 * features.Opposition_XGC_avg - 0.5 * opponent_error
    return np.exp(-1.807 + 0.848 * attack + 0.91 * defence - 0.128 * attack * defence)


def predict_fixtures(fixtures, teams, newest, models):
    upcoming = fixtures.loc[~fixtures.finished.astype(str).str.lower().isin(["true", "1"])].copy()
    upcoming = upcoming.dropna(subset=["event"])
    if upcoming.empty:
        raise ValueError("No unfinished fixtures with a gameweek found.")
    upcoming = upcoming.rename(columns={"code": "fixture_code"})
    upcoming = upcoming.merge(teams[["id", "code", "name"]].add_suffix("_home"), left_on="team_h", right_on="id_home", validate="many_to_one")
    upcoming = upcoming.merge(teams[["id", "code", "name"]].add_suffix("_away"), left_on="team_a", right_on="id_away", validate="many_to_one")
    newest = newest.sort_values("kickoff_time").drop_duplicates("code", keep="last").set_index("code")
    home = newest.reindex(upcoming.code_home).rename_axis("code").reset_index()
    away = newest.reindex(upcoming.code_away).rename_axis("code").reset_index()
    upcoming = upcoming.reset_index(drop=True)
    if home.name.isna().any() or away.name.isna().any():
        raise ValueError("Missing latest ratings for a team in the fixture list.")

    home_features = match_features(home, away, np.ones(len(home), dtype=bool))
    away_features = match_features(away, home, np.zeros(len(home), dtype=bool))
    if home_features.isna().any().any() or away_features.isna().any().any():
        raise ValueError("Missing latest team ratings required for predictions.")
    home_ml_xg, home_ml_xgc = [np.maximum(0, model.predict(home_features)) for model in models]
    away_ml_xg, away_ml_xgc = [np.maximum(0, model.predict(away_features)) for model in models]
    error = lambda df, col: pd.to_numeric(df[col], errors="coerce").fillna(0)
    home_stat = statistical_xg(home_features, error(home, "XG_pred_rolling_error"), error(away, "XGC_pred_rolling_error"))
    away_stat = statistical_xg(away_features, error(away, "XG_pred_rolling_error"), error(home, "XGC_pred_rolling_error"))

    # Both ML models describe the same goals: combine the attack and opposing defence.
    home_goals = 0.5 * ((home_ml_xg + away_ml_xgc) / 2) + 0.5 * home_stat
    away_goals = 0.5 * ((away_ml_xg + home_ml_xgc) / 2) + 0.5 * away_stat
    home_win = skellam.sf(0, home_goals, away_goals) * 100
    draw = skellam.pmf(0, home_goals, away_goals) * 100
    away_win = skellam.cdf(-1, home_goals, away_goals) * 100
    base = pd.DataFrame({"fixture_code": upcoming.fixture_code, "GW": upcoming.event,
                         "pred": upcoming.event - upcoming.event.min() + 1})
    sides = []
    for own, opp, own_features, goals, conceded, win, loss, venue in [
        (home, away, home_features, home_goals, away_goals, home_win, away_win, "H"),
        (away, home, away_features, away_goals, home_goals, away_win, home_win, "A")]:
        frame = base.copy()
        frame["team_name"], frame["team_code"] = own.name, own.code
        frame["XG"], frame["XGC"], frame["CS"] = goals, conceded, np.exp(-conceded)
        frame["Opposition_XG"] = own_features.Opposition_XG
        frame["Opposition_XGC"] = own_features.Opposition_XGC
        frame["Opponent_team"], frame["Home"] = opp.name, venue
        frame["Draw_percent"], frame["Loss_percent"], frame["Win_Percent"] = draw, loss, win
        sides.append(frame)
    return pd.concat(sides, ignore_index=True)


def write_tables(fixtures, teams, predictions):
    finished = fixtures[fixtures.finished.astype(str).str.lower().isin(["true", "1"])].dropna(subset=["team_h_score", "team_a_score"]).copy()
    home = finished[["team_h", "team_h_score", "team_a_score"]].copy()
    away = finished[["team_a", "team_a_score", "team_h_score"]].copy()
    home.columns = away.columns = ["team_id", "gf", "ga"]
    games = pd.concat([home, away], ignore_index=True)
    games["played"] = 1
    games["points"] = np.select([games.gf > games.ga, games.gf == games.ga], [3, 1], default=0)
    totals = games.groupby("team_id")[["played", "points", "gf", "ga"]].sum().reset_index()
    table = teams[["id", "code", "name"]].rename(columns={"id": "team_id"}).merge(totals, on="team_id", how="left")
    table[["played", "points", "gf", "ga"]] = table[["played", "points", "gf", "ga"]].fillna(0)
    table["gd"] = table.gf - table.ga
    table = table[["team_id", "played", "points", "gf", "ga", "gd", "code", "name"]]
    table = table.sort_values(["points", "gd", "gf", "team_id"], ascending=[False, False, False, True]).reset_index(drop=True)
    table.to_csv(ROOT / "Current_Table_Standings.csv", index=False)

    preds = predictions.copy()
    preds["expected_points"] = (3 * preds.Win_Percent + preds.Draw_percent) / 100
    expected = preds.groupby("team_code").expected_points.sum()
    final = table.copy()
    final["predicted_points"] = final.points + final.code.map(expected).fillna(0)
    final = final[["team_id", "code", "name", "played", "points", "gf", "ga", "gd", "predicted_points"]]
    final.sort_values(["predicted_points", "gd", "gf", "team_id"], ascending=[False, False, False, True]).to_csv(ROOT / "Final_Table_Prediction.csv")

    cumulative = pd.Series(0.0, index=table.code)
    previous = {}
    rounds = []
    for gw in sorted(preds.GW.unique()):
        week = preds[preds.GW == gw].groupby("team_code").expected_points.sum()
        current = table.copy()
        current["predicted_points"] = current.code.map(week).fillna(0)
        cumulative = cumulative.add(week, fill_value=0)
        current["cum_predicted_points"] = current.code.map(cumulative).fillna(0)
        current["total_points"] = current.points + current.cum_predicted_points
        current = current.sort_values(["total_points", "gd", "gf", "team_id"], ascending=[False, False, False, True]).reset_index(drop=True)
        current["position"] = current.index + 1
        current["movement"] = ["up" if p < previous.get(c, p) else "down" if p > previous.get(c, p) else "same" for c, p in zip(current.code, current.position)]
        previous = dict(zip(current.code, current.position))
        current["GW"] = gw
        rounds.append(current[["GW", "position", "movement", "team_id", "code", "name", "played", "points", "gf", "ga", "gd", "predicted_points", "cum_predicted_points", "total_points"]])
    pd.concat(rounds, ignore_index=True).to_csv(ROOT / "Final_Table_Prediction_All_GW.csv", index=False)


def GenerateTeamPredictions(fixture_path=ROOT / "Fantasy_season_Fixtures_EXPANDED.csv",
                            current_team_path=ROOT / "Raw_Data_26/current_teams.csv", horizon=None,
                            sim_full_weight=0.7, time_list=None, standings_fixture_path=None):
    history = pd.read_csv(ROOT / "Team_data_transformed2.csv")
    newest = pd.read_csv(ROOT / "Team_data_newest3.csv")
    fixtures = pd.read_csv(fixture_path)
    teams = pd.read_csv(current_team_path)
    predictions = predict_fixtures(fixtures, teams, newest, train_models(history))
    if time_list is not None:
        predictions = predictions[predictions.GW.isin(time_list)].copy()
        if predictions.empty:
            raise ValueError("No unfinished fixtures found in the requested gameweeks.")
    # The original CSV contains an extra index column from its intermediate file.
    output = predictions.copy()
    output.insert(0, "Unnamed: 0", output.index)
    output.to_csv(ROOT / "Team_prediction.csv")
    home = predictions[predictions.Home == "H"]
    away = predictions[predictions.Home == "A"]
    visual = home.merge(away, on=["fixture_code", "GW", "pred"], suffixes=("_home", "_away"), validate="one_to_one")
    visual = visual.rename(columns={"team_name_home": "home_team", "team_code_home": "home_code", "XG_home": "home_goals", "CS_home": "Clean_Sheet_home", "XGC_home": "home_XGC", "team_name_away": "away_team", "team_code_away": "away_code", "XG_away": "away_goals", "CS_away": "Clean_Sheet_away", "XGC_away": "away_XGC", "Win_Percent_home": "Home_Win", "Win_Percent_away": "Away_Win", "Draw_percent_home": "Draw"})
    visual = visual[["fixture_code", "GW", "pred", "home_team", "home_code", "home_goals", "Clean_Sheet_home", "home_XGC", "away_team", "away_code", "away_goals", "Clean_Sheet_away", "away_XGC", "Home_Win", "Away_Win", "Draw"]].sort_values(["GW", "fixture_code"])
    visual.to_csv(ROOT / "Team_prediction_visual.csv")
    standings_fixtures = pd.read_csv(standings_fixture_path) if standings_fixture_path else fixtures
    write_tables(standings_fixtures, teams, predictions)
    print(f"Wrote predictions for {len(visual)} fixtures and three table files")
    return predictions


if __name__ == "__main__":
    GenerateTeamPredictions()
