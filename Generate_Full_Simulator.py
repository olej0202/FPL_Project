from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union, Dict, Tuple, Any

import numpy as np
import pandas as pd
import json


TeamArg = Union[int, str]
SourceOrDf = Union[str, pd.DataFrame]


@dataclass(frozen=True)
class StatFormulaConfig:
    # Same coefficients discussed in the current stat model.
    intercept: float = -3.15
    own_xg_coef: float = 1.485
    opp_xgc_coef: float = 1.503
    interaction_coef: float = -0.174
    exp_scale: float = 0.5
    prediction_min: float = 0.10
    prediction_max: float = 3.60


@dataclass(frozen=True)
class SimulatorTestConfig:
    team_history_path: Path = Path("Team_data_transformed2.csv")
    fixtures_path: Path = Path("Fantasy_season_Fixtures_EXPANDED.csv")
    current_teams_path: Path = Path("Raw_Data_25/current_teams.csv")
    player_prediction_path: Path = Path("Player_Prediction_set.csv")
    player_history_path: Path = Path("ML_training2.csv")
    rolling_window: int = 20
    test_teams_output_path: Path = Path("TestTeams.csv")
    csv_float_format: str = "%.6f"
    assist_credit_prob: float = 0.75


@dataclass(frozen=True)
class SimulationControlConfig:
    # Main run mode: "historical", "upcoming", or "both"
    source: str = "upcoming"

    # Core CSV paths
    team_history_path: Path = Path("Team_data_transformed2.csv")
    fixtures_path: Path = Path("Fantasy_season_Fixtures_EXPANDED.csv")
    current_teams_path: Path = Path("Raw_Data_25/current_teams.csv")
    player_prediction_path: Path = Path("Player_Prediction_set.csv")
    player_history_path: Path = Path("ML_training2.csv")

    # Base output table path (historical adjusted team table)
    test_teams_output_path: Path = Path("TestTeams.csv")

    # Simulation result output paths
    historical_team_results_output_path: Path = Path("SImulator/simtest_team_results_historical.csv")
    historical_player_results_output_path: Path = Path("SImulator/simtest_player_outcomes_historical.csv")
    upcoming_team_results_output_path: Path = Path("SImulator/simtest_team_results_upcoming.csv")
    upcoming_player_results_output_path: Path = Path("SImulator/simtest_player_outcomes_upcoming.csv")

    # Runtime settings
    n_last: int = 20
    n_upcoming: int = 8
    simulations_per_row: int = 200
    max_date_for_hist: Optional[str] = None
    random_seed: int = 42
    rolling_window: int = 20
    csv_float_format: str = "%.6f"
    write_outputs: bool = True
    assist_credit_prob: float = 0.75

    # Formula settings
    intercept: float = -3.15
    own_xg_coef: float = 1.485
    opp_xgc_coef: float = 1.503
    interaction_coef: float = -0.174
    exp_scale: float = 0.5
    prediction_min: float = 0.10
    prediction_max: float = 3.60

    # Tuning defaults (used in normal simulation runs)
    pass_scale: float = 0.77
    goal_scale: float = 0.4
    attack_base: float = 9.5
    defence_base: float = 0.35

    # Parameter optimization switch/settings
    run_parameter_optimization: int = 0
    optimization_output_path: Path = Path("SImulator/simtest_parameter_search.csv")
    optimization_best_output_path: Path = Path("SImulator/simtest_parameter_best.csv")
    optimization_n_last: int = 8
    optimization_simulations_per_row: int = 40


@dataclass(frozen=True)
class SimulatorTuningParams:
    # Layer-on-top tuning parameters for optimization
    pass_scale: float = 0.77          # multiplier in pass_percent
    goal_scale: float = 0.4          # multiplier in goal_percent
    attack_base: float = 9.5         # base multiplier in team_attacks
    defence_base: float = 0.35       # coefficient in team_defences


def _to_bool_was_home(v) -> bool:
    s = str(v).strip().lower()
    if s in {"true", "1", "yes"}:
        return True
    if s in {"false", "0", "no"}:
        return False
    try:
        return bool(int(float(s)))
    except Exception:
        return False


def _norm_name(s: str) -> str:
    return "".join(ch for ch in str(s or "").strip().lower() if ch.isalnum())


def _to_float_series(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _ensure_decimal_xg_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "XG" in out.columns:
        out["XG"] = pd.to_numeric(out["XG"], errors="coerce").astype(float)
    if "Plain_XG" in out.columns:
        out["Plain_XG"] = pd.to_numeric(out["Plain_XG"], errors="coerce").astype(float)
    return out


def _cast_id_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in ["fixture_code", "event", "code", "opponent"]:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce").astype("Int64")
    return out


def _limit_upcoming_to_n_gws(df: pd.DataFrame, n_gws: Optional[int]) -> pd.DataFrame:
    """
    Limit upcoming rows by GW horizon (events), not by number of matches.
    Keeps all fixtures that fall inside the first n_gws future events globally.
    """
    if n_gws is None or int(n_gws) <= 0:
        return df

    out = df.copy()
    out["event_num"] = pd.to_numeric(out.get("event"), errors="coerce")
    gw_list = sorted(v for v in out["event_num"].dropna().unique().tolist())
    if not gw_list:
        return out.drop(columns=["event_num"], errors="ignore").reset_index(drop=True)

    keep_gws = set(gw_list[: int(n_gws)])
    out = out[out["event_num"].isin(keep_gws)].copy()
    out = out.drop(columns=["event_num"], errors="ignore")
    out = out.sort_values(["code", "event", "kickoff_time"]).reset_index(drop=True)
    return out


def read_team_history_df(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    needed = {
        "name",
        "code",
        "kickoff_time",
        "opponent",
        "was_home",
        "XG",
        "Plain_XG",
        "XGH",
        "XGA",
        "XG_avg",
        "XGCH",
        "XGCA",
        "XGC_avg",
    }
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in {path}: {missing}")

    df = df.copy()
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], errors="coerce")
    df["was_home_bool"] = df["was_home"].map(_to_bool_was_home)
    for c in [
        "code",
        "opponent",
        "XG",
        "Plain_XG",
        "XGH",
        "XGA",
        "XG_avg",
        "XGCH",
        "XGCA",
        "XGC_avg",
        "Rolling_XG",
        "Rolling_XGC",
    ]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def read_fixtures_df(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    needed = {"code", "event", "finished", "kickoff_time", "team_h", "team_a"}
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in {path}: {missing}")
    out = df.copy()
    out["kickoff_time"] = pd.to_datetime(out["kickoff_time"], errors="coerce", utc=True)
    out["event"] = pd.to_numeric(out["event"], errors="coerce")
    out["code"] = pd.to_numeric(out["code"], errors="coerce")
    out["team_h"] = pd.to_numeric(out["team_h"], errors="coerce")
    out["team_a"] = pd.to_numeric(out["team_a"], errors="coerce")
    out["finished_bool"] = out["finished"].map(_to_bool_was_home)
    # Some fixture exports contain duplicate rows for the same fixture in the same GW.
    # Keep one row per (fixture_id, event, home, away), but allow the same fixture_id
    # across multiple GWs (e.g., reschedules/reprojections).
    fixture_id_col = "id" if "id" in out.columns else "code"
    dedupe_keys = [fixture_id_col, "event", "team_h", "team_a"]
    out = out.sort_values(dedupe_keys + ["kickoff_time", "code"], na_position="last")
    dup_n = int(out.duplicated(subset=dedupe_keys, keep="last").sum())
    if dup_n > 0:
        print(f"read_fixtures_df: dropping {dup_n} duplicate fixture rows by {dedupe_keys}.")
    out = out.drop_duplicates(subset=dedupe_keys, keep="last").reset_index(drop=True)
    return out


def read_current_teams_df(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    needed = {"id", "code", "name"}
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in {path}: {missing}")
    out = df.copy()
    out["id"] = pd.to_numeric(out["id"], errors="coerce")
    out["code"] = pd.to_numeric(out["code"], errors="coerce")
    out["name"] = out["name"].astype(str)
    return out[["id", "code", "name"]]


def _resolve_team_code(df: pd.DataFrame, team: TeamArg) -> int:
    if isinstance(team, int):
        return int(team)

    s = str(team).strip()
    if s.isdigit():
        return int(s)

    target = _norm_name(s)
    names = (
        df[["name", "code"]]
        .dropna(subset=["name", "code"])
        .drop_duplicates()
        .assign(name_norm=lambda x: x["name"].map(_norm_name))
    )
    exact = names[names["name_norm"] == target]
    if exact.empty:
        raise ValueError(f"Team '{team}' not found in historical dataset.")
    return int(exact.iloc[0]["code"])


def _add_context_and_fixture_side_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["own_xg_context"] = np.where(out["was_home_bool"], out["XGH"], out["XGA"])
    out["own_xgc_context"] = np.where(out["was_home_bool"], out["XGCH"], out["XGCA"])
    out["opp_xgc_context"] = np.where(out["was_home_bool"], out["opp_xgca"], out["opp_xgch"])

    # Required fixture-side columns for all rows.
    out["home_team_xg"] = np.where(out["was_home_bool"], out["own_xg_context"], out["opp_xgh"])
    out["away_team_xg"] = np.where(out["was_home_bool"], out["opp_xga"], out["own_xg_context"])
    out["home_team_xgc"] = np.where(out["was_home_bool"], out["own_xgc_context"], out["opp_xgch"])
    out["away_team_xgc"] = np.where(out["was_home_bool"], out["opp_xgca"], out["own_xgc_context"])

    own_rolling_xg = (
        pd.to_numeric(out["Rolling_XG"], errors="coerce")
        if "Rolling_XG" in out.columns
        else pd.Series(np.nan, index=out.index, dtype=float)
    )
    own_rolling_xg = own_rolling_xg.fillna(pd.to_numeric(out["XG_avg"], errors="coerce"))

    own_rolling_xgc = (
        pd.to_numeric(out["Rolling_XGC"], errors="coerce")
        if "Rolling_XGC" in out.columns
        else pd.Series(np.nan, index=out.index, dtype=float)
    )
    own_rolling_xgc = own_rolling_xgc.fillna(pd.to_numeric(out["XGC_avg"], errors="coerce"))

    opp_rolling_xgc = (
        pd.to_numeric(out["opp_rolling_xgc"], errors="coerce")
        if "opp_rolling_xgc" in out.columns
        else pd.Series(np.nan, index=out.index, dtype=float)
    )
    opp_rolling_xgc = opp_rolling_xgc.fillna(pd.to_numeric(out["opp_xgc_avg"], errors="coerce"))

    out["xg_metric"] = 0.4 * out["own_xg_context"] + 0.35 * out["XG_avg"] + 0.25 * own_rolling_xg
    # Own team defensive metric (used for team defense modelling/output).
    out["xgc_metric"] = 0.4 * out["own_xgc_context"] + 0.35 * out["XGC_avg"] + 0.25 * own_rolling_xgc
    # Opponent defensive metric (used for predicting this team's XG).
    out["opp_xgc_metric"] = 0.4 * out["opp_xgc_context"] + 0.35 * out["opp_xgc_avg"] + 0.25 * opp_rolling_xgc
    return out


def build_historical_base_all_teams(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    opp_lookup_cols = ["kickoff_time", "code", "XGCH", "XGCA", "XGC_avg", "XGH", "XGA", "name"]
    if "Rolling_XGC" in df.columns:
        opp_lookup_cols.append("Rolling_XGC")

    opp_lookup = df[opp_lookup_cols].rename(
        columns={
            "code": "opponent",
            "XGCH": "opp_xgch",
            "XGCA": "opp_xgca",
            "XGC_avg": "opp_xgc_avg",
            "XGH": "opp_xgh",
            "XGA": "opp_xga",
            "name": "opponent_name",
            "Rolling_XGC": "opp_rolling_xgc",
        }
    )
    out = out.merge(opp_lookup, on=["kickoff_time", "opponent"], how="left")
    out = _add_context_and_fixture_side_columns(out)
    return out


def add_league_normalized_metrics(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    lg_xg = float(pd.to_numeric(out["xg_metric"], errors="coerce").mean())
    lg_xgc = float(pd.to_numeric(out["xgc_metric"], errors="coerce").mean())
    lg_xg = max(lg_xg, 1e-9)
    lg_xgc = max(lg_xgc, 1e-9)
    out["xg_metric_norm"] = out["xg_metric"] / lg_xg
    out["xgc_metric_norm"] = out["xgc_metric"] / lg_xgc
    if "opp_xgc_metric" in out.columns:
        out["opp_xgc_metric_norm"] = out["opp_xgc_metric"] / lg_xgc
    out["league_avg_xg_metric"] = lg_xg
    out["league_avg_xgc_metric"] = lg_xgc
    return out


def add_stat_predicted_xg(df: pd.DataFrame, cfg: StatFormulaConfig) -> pd.DataFrame:
    out = df.copy()
    # Prediction should use raw xg_metric/xgc_metric, not normalized metrics.
    xgc_for_pred = out["opp_xgc_metric"] if "opp_xgc_metric" in out.columns else out["xgc_metric"]
    eta = (
        cfg.intercept
        + cfg.own_xg_coef * out["xg_metric"]
        + cfg.opp_xgc_coef * xgc_for_pred
        + cfg.interaction_coef * out["xg_metric"] * xgc_for_pred
    )
    out["predicted_xg_stat"] = np.exp(cfg.exp_scale * eta)
    out["predicted_xg_stat"] = out["predicted_xg_stat"].clip(lower=cfg.prediction_min, upper=cfg.prediction_max)
    out["xg_error"] = out["XG"] - out["predicted_xg_stat"]
    return out


def add_error_rollups(df: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    out = df.sort_values(["code", "kickoff_time"]).copy()
    prev_err = out.groupby("code")["xg_error"].shift(1)
    out["xg_error_avg_last20"] = (
        prev_err.groupby(out["code"]).transform(lambda s: s.rolling(window=window, min_periods=1).mean()).fillna(0.0)
    )
    out["xg_error_std_last20"] = (
        prev_err.groupby(out["code"]).transform(lambda s: s.rolling(window=window, min_periods=2).std()).fillna(0.0)
    )
    return out


def _common_keep_cols() -> list[str]:
    return [
        "source_type",
        "fixture_code",
        "event",
        "kickoff_time",
        "name",
        "code",
        "opponent",
        "opponent_name",
        "was_home_bool",
        "own_xg_context",
        "XG_avg",
        "own_xgc_context",
        "XGC_avg",
        "opp_xgh",
        "opp_xga",
        "opp_xgch",
        "opp_xgca",
        "opp_xgc_avg",
        "XG",
        "Plain_XG",
        "xg_metric",
        "xgc_metric",
        "opp_xgc_metric",
        "xg_metric_norm",
        "xgc_metric_norm",
        "opp_xgc_metric_norm",
        "home_team_xg",
        "away_team_xg",
        "home_team_xgc",
        "away_team_xgc",
        "predicted_xg_stat",
        "xg_error",
        "xg_error_avg_last20",
        "xg_error_std_last20",
    ]


def build_historical_adjustments_all_teams(
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
    write_csv: bool = True,
) -> pd.DataFrame:
    cfg = cfg or SimulatorTestConfig()
    formula_cfg = formula_cfg or StatFormulaConfig()

    hist = read_team_history_df(cfg.team_history_path)
    out = build_historical_base_all_teams(hist)
    out["source_type"] = "historical"
    out["fixture_code"] = np.nan
    out["event"] = np.nan
    out = _ensure_decimal_xg_columns(out)
    out = add_league_normalized_metrics(out)
    out = add_stat_predicted_xg(out, cfg=formula_cfg)
    out = add_error_rollups(out, window=cfg.rolling_window)

    keep_cols = [c for c in _common_keep_cols() if c in out.columns]
    out = out[keep_cols].sort_values(["code", "kickoff_time"]).reset_index(drop=True)
    out = _cast_id_columns(out)
    if write_csv:
        out.to_csv(cfg.test_teams_output_path, index=False, float_format=cfg.csv_float_format)
    return out


def _build_latest_team_profiles(team_hist: pd.DataFrame) -> pd.DataFrame:
    cols = ["code", "name", "XGH", "XGA", "XG_avg", "XGCH", "XGCA", "XGC_avg", "Rolling_XG", "Rolling_XGC", "kickoff_time"]
    cols = [c for c in cols if c in team_hist.columns]
    latest = (
        team_hist[cols]
        .sort_values(["code", "kickoff_time"])
        .groupby("code", as_index=False)
        .tail(1)
        .reset_index(drop=True)
    )
    if "Rolling_XG" not in latest.columns:
        latest["Rolling_XG"] = pd.to_numeric(latest.get("XG_avg"), errors="coerce")
    if "Rolling_XGC" not in latest.columns:
        latest["Rolling_XGC"] = pd.to_numeric(latest.get("XGC_avg"), errors="coerce")
    return latest


def build_upcoming_adjustments_all_teams(
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
) -> pd.DataFrame:
    cfg = cfg or SimulatorTestConfig()
    formula_cfg = formula_cfg or StatFormulaConfig()

    hist_raw = read_team_history_df(cfg.team_history_path)
    hist_full = build_historical_adjustments_all_teams(cfg=cfg, formula_cfg=formula_cfg, write_csv=True)
    hist_roll = (
        hist_full.sort_values(["code", "kickoff_time"])
        .groupby("code", as_index=False)
        .tail(1)[["code", "xg_error_avg_last20", "xg_error_std_last20"]]
        .rename(
            columns={
                "xg_error_avg_last20": "hist_xg_error_avg_last20",
                "xg_error_std_last20": "hist_xg_error_std_last20",
            }
        )
    )

    latest = _build_latest_team_profiles(hist_raw).rename(
        columns={
            "name": "team_name",
            "XGH": "team_xgh",
            "XGA": "team_xga",
            "XG_avg": "team_xg_avg",
            "XGCH": "team_xgch",
            "XGCA": "team_xgca",
            "XGC_avg": "team_xgc_avg",
            "Rolling_XG": "team_rolling_xg",
            "Rolling_XGC": "team_rolling_xgc",
        }
    )
    latest = latest.merge(hist_roll, on="code", how="left")
    teams = read_current_teams_df(cfg.current_teams_path)
    fixtures = read_fixtures_df(cfg.fixtures_path)
    future = fixtures[~fixtures["finished_bool"]].copy()
    future = future.sort_values(["event", "kickoff_time", "code"], na_position="last")

    team_by_id = teams.rename(columns={"id": "team_id", "code": "team_code", "name": "team_name"})

    fx = (
        future.merge(team_by_id, left_on="team_h", right_on="team_id", how="left")
        .rename(columns={"team_code": "home_code", "team_name": "home_name"})
        .drop(columns=["team_id"])
        .merge(team_by_id, left_on="team_a", right_on="team_id", how="left")
        .rename(columns={"team_code": "away_code", "team_name": "away_name"})
        .drop(columns=["team_id"])
    )
    fx = fx.dropna(subset=["home_code", "away_code"])
    fx["home_code"] = _to_float_series(fx["home_code"]).astype(int)
    fx["away_code"] = _to_float_series(fx["away_code"]).astype(int)
    # Safety de-dup before we expand each fixture into home/away rows.
    fixture_id_col = "id" if "id" in fx.columns else "code"
    fx = (
        fx.sort_values([fixture_id_col, "event", "team_h", "team_a", "kickoff_time", "code"], na_position="last")
        .drop_duplicates(subset=[fixture_id_col, "event", "team_h", "team_a"], keep="last")
        .reset_index(drop=True)
    )

    latest_home = latest.rename(
        columns={
            "code": "home_code",
            "team_xgh": "home_xgh",
            "team_xga": "home_xga",
            "team_xg_avg": "home_xg_avg",
            "team_xgch": "home_xgch",
            "team_xgca": "home_xgca",
            "team_xgc_avg": "home_xgc_avg",
            "team_rolling_xg": "home_rolling_xg",
            "team_rolling_xgc": "home_rolling_xgc",
            "xg_error_avg_last20": "home_hist_xg_error_avg_last20",
            "xg_error_std_last20": "home_hist_xg_error_std_last20",
            "hist_xg_error_avg_last20": "home_hist_xg_error_avg_last20",
            "hist_xg_error_std_last20": "home_hist_xg_error_std_last20",
            "latest_kickoff": "home_latest_kickoff",
        }
    )
    latest_away = latest.rename(
        columns={
            "code": "away_code",
            "team_xgh": "away_xgh",
            "team_xga": "away_xga",
            "team_xg_avg": "away_xg_avg",
            "team_xgch": "away_xgch",
            "team_xgca": "away_xgca",
            "team_xgc_avg": "away_xgc_avg",
            "team_rolling_xg": "away_rolling_xg",
            "team_rolling_xgc": "away_rolling_xgc",
            "xg_error_avg_last20": "away_hist_xg_error_avg_last20",
            "xg_error_std_last20": "away_hist_xg_error_std_last20",
            "hist_xg_error_avg_last20": "away_hist_xg_error_avg_last20",
            "hist_xg_error_std_last20": "away_hist_xg_error_std_last20",
            "latest_kickoff": "away_latest_kickoff",
        }
    )
    fx = fx.merge(latest_home, on=["home_code"], how="left")
    fx = fx.merge(latest_away, on=["away_code"], how="left")

    common_cols = ["code", "event", "kickoff_time", "home_name", "away_name", "home_code", "away_code"]
    home_rows = fx[common_cols + ["home_xgh", "home_xga", "home_xg_avg", "home_xgch", "home_xgca", "home_xgc_avg", "home_rolling_xg", "home_rolling_xgc", "away_xgh", "away_xga", "away_xg_avg", "away_xgch", "away_xgca", "away_xgc_avg", "away_rolling_xg", "away_rolling_xgc", "home_hist_xg_error_avg_last20", "home_hist_xg_error_std_last20", "away_hist_xg_error_avg_last20", "away_hist_xg_error_std_last20"]].copy()
    home_rows["fixture_code"] = home_rows["code"]
    home_rows["name"] = home_rows["home_name"]
    home_rows["code"] = home_rows["home_code"]
    home_rows["opponent"] = home_rows["away_code"]
    home_rows["opponent_name"] = home_rows["away_name"]
    home_rows["was_home_bool"] = True
    home_rows["XGH"] = home_rows["home_xgh"]
    home_rows["XGA"] = home_rows["home_xga"]
    home_rows["XG_avg"] = home_rows["home_xg_avg"]
    home_rows["XGCH"] = home_rows["home_xgch"]
    home_rows["XGCA"] = home_rows["home_xgca"]
    home_rows["XGC_avg"] = home_rows["home_xgc_avg"]
    home_rows["Rolling_XG"] = home_rows["home_rolling_xg"]
    home_rows["Rolling_XGC"] = home_rows["home_rolling_xgc"]
    home_rows["opp_xgh"] = home_rows["away_xgh"]
    home_rows["opp_xga"] = home_rows["away_xga"]
    home_rows["opp_xgch"] = home_rows["away_xgch"]
    home_rows["opp_xgca"] = home_rows["away_xgca"]
    home_rows["opp_xgc_avg"] = home_rows["away_xgc_avg"]
    home_rows["opp_rolling_xgc"] = home_rows["away_rolling_xgc"]
    home_rows["hist_xg_error_avg_last20"] = home_rows["home_hist_xg_error_avg_last20"]
    home_rows["hist_xg_error_std_last20"] = home_rows["home_hist_xg_error_std_last20"]
    home_rows["opp_hist_xg_error_avg_last20"] = home_rows["away_hist_xg_error_avg_last20"]
    home_rows["opp_hist_xg_error_std_last20"] = home_rows["away_hist_xg_error_std_last20"]

    away_rows = fx[common_cols + ["home_xgh", "home_xga", "home_xg_avg", "home_xgch", "home_xgca", "home_xgc_avg", "home_rolling_xg", "home_rolling_xgc", "away_xgh", "away_xga", "away_xg_avg", "away_xgch", "away_xgca", "away_xgc_avg", "away_rolling_xg", "away_rolling_xgc", "home_hist_xg_error_avg_last20", "home_hist_xg_error_std_last20", "away_hist_xg_error_avg_last20", "away_hist_xg_error_std_last20"]].copy()
    away_rows["fixture_code"] = away_rows["code"]
    away_rows["name"] = away_rows["away_name"]
    away_rows["code"] = away_rows["away_code"]
    away_rows["opponent"] = away_rows["home_code"]
    away_rows["opponent_name"] = away_rows["home_name"]
    away_rows["was_home_bool"] = False
    away_rows["XGH"] = away_rows["away_xgh"]
    away_rows["XGA"] = away_rows["away_xga"]
    away_rows["XG_avg"] = away_rows["away_xg_avg"]
    away_rows["XGCH"] = away_rows["away_xgch"]
    away_rows["XGCA"] = away_rows["away_xgca"]
    away_rows["XGC_avg"] = away_rows["away_xgc_avg"]
    away_rows["Rolling_XG"] = away_rows["away_rolling_xg"]
    away_rows["Rolling_XGC"] = away_rows["away_rolling_xgc"]
    away_rows["opp_xgh"] = away_rows["home_xgh"]
    away_rows["opp_xga"] = away_rows["home_xga"]
    away_rows["opp_xgch"] = away_rows["home_xgch"]
    away_rows["opp_xgca"] = away_rows["home_xgca"]
    away_rows["opp_xgc_avg"] = away_rows["home_xgc_avg"]
    away_rows["opp_rolling_xgc"] = away_rows["home_rolling_xgc"]
    away_rows["hist_xg_error_avg_last20"] = away_rows["away_hist_xg_error_avg_last20"]
    away_rows["hist_xg_error_std_last20"] = away_rows["away_hist_xg_error_std_last20"]
    away_rows["opp_hist_xg_error_avg_last20"] = away_rows["home_hist_xg_error_avg_last20"]
    away_rows["opp_hist_xg_error_std_last20"] = away_rows["home_hist_xg_error_std_last20"]

    out = pd.concat([home_rows, away_rows], axis=0, ignore_index=True)
    out["fixture_code"] = _to_float_series(out["fixture_code"]).astype("Int64")
    # Final guard: keep exactly one row per team/opponent side for each fixture+GW.
    out = (
        out.sort_values(["fixture_code", "event", "kickoff_time", "code", "opponent", "was_home_bool"], na_position="last")
        .drop_duplicates(subset=["fixture_code", "event", "code", "opponent", "was_home_bool"], keep="last")
        .reset_index(drop=True)
    )
    out["source_type"] = "upcoming"
    out["XG"] = np.nan
    out["Plain_XG"] = np.nan
    out = _ensure_decimal_xg_columns(out)

    out = _add_context_and_fixture_side_columns(out)
    out = add_league_normalized_metrics(out)
    out = add_stat_predicted_xg(out, cfg=formula_cfg)
    out["xg_error"] = np.nan

    if "hist_xg_error_avg_last20" not in out.columns or "hist_xg_error_std_last20" not in out.columns:
        out = out.merge(hist_roll, on="code", how="left")

    avg_col = next(
        (
            c
            for c in [
                "hist_xg_error_avg_last20",
                "hist_xg_error_avg_last20_x",
                "hist_xg_error_avg_last20_y",
                "xg_error_avg_last20",
            ]
            if c in out.columns
        ),
        None,
    )
    std_col = next(
        (
            c
            for c in [
                "hist_xg_error_std_last20",
                "hist_xg_error_std_last20_x",
                "hist_xg_error_std_last20_y",
                "xg_error_std_last20",
            ]
            if c in out.columns
        ),
        None,
    )

    out["xg_error_avg_last20"] = (
        pd.to_numeric(out[avg_col], errors="coerce").fillna(0.0)
        if avg_col is not None
        else 0.0
    )
    out["xg_error_std_last20"] = (
        pd.to_numeric(out[std_col], errors="coerce").fillna(0.0)
        if std_col is not None
        else 0.0
    )
    out = out.drop(
        columns=[
            "hist_xg_error_avg_last20",
            "hist_xg_error_std_last20",
            "hist_xg_error_avg_last20_x",
            "hist_xg_error_std_last20_x",
            "hist_xg_error_avg_last20_y",
            "hist_xg_error_std_last20_y",
        ],
        errors="ignore",
    )

    keep_cols = [c for c in _common_keep_cols() if c in out.columns]
    out = out[keep_cols].sort_values(["code", "event", "kickoff_time"]).reset_index(drop=True)
    out = _cast_id_columns(out)
    return out


def get_sim_data(
    source: str,
    n_last: Optional[int] = 20,
    n_upcoming: Optional[int] = 8,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
) -> pd.DataFrame:
    cfg = cfg or SimulatorTestConfig()
    formula_cfg = formula_cfg or StatFormulaConfig()
    src = str(source).strip().lower()

    if src in {"historical", "history", "hist"}:
        df = build_historical_adjustments_all_teams(cfg=cfg, formula_cfg=formula_cfg, write_csv=True)
        if n_last is not None and n_last > 0:
            df = (
                df.sort_values(["code", "kickoff_time"])
                .groupby("code", as_index=False, group_keys=False)
                .tail(int(n_last))
                .reset_index(drop=True)
            )
        return df

    if src in {"upcoming", "future", "new"}:
        df = build_upcoming_adjustments_all_teams(cfg=cfg, formula_cfg=formula_cfg)
        # n_upcoming is treated as number of GWs (events), not matches.
        df = _limit_upcoming_to_n_gws(df, n_upcoming)
        return df

    raise ValueError("source must be one of: historical/history/hist or upcoming/future/new")


def _read_player_source(mode: str, cfg: SimulatorTestConfig) -> pd.DataFrame:
    m = str(mode).strip().lower()
    if m in {"new", "future", "fut"}:
        df = pd.read_csv(cfg.player_prediction_path)
        source_mode = "new"
    elif m in {"historical", "history", "hist", "histo"}:
        df = pd.read_csv(cfg.player_history_path)
        source_mode = "histo"
    else:
        raise ValueError("mode must be one of: new/future/fut or historical/history/hist/histo")

    if "kickoff_time" in df.columns:
        df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], errors="coerce", utc=True)
    else:
        df["kickoff_time"] = pd.NaT

    if "name" not in df.columns:
        raise ValueError("Player dataset must include a 'name' column.")

    team_col = None
    for c in ["Team", "team_code"]:
        if c in df.columns:
            team_col = c
            break
    if team_col is None:
        raise ValueError("Could not find a team-code column (expected one of Team/team_code/team/code).")

    df["_team_code"] = pd.to_numeric(df[team_col], errors="coerce").astype("Int64")
    df["_source_mode"] = source_mode
    return df


def _normalize_player_mode(mode: str) -> str:
    m = str(mode).strip().lower()
    if m in {"new", "future", "fut"}:
        return "new"
    if m in {"historical", "history", "hist", "histo"}:
        return "histo"
    raise ValueError("mode must be one of: new/future/fut or historical/history/hist/histo")


def _build_player_pool_from_loaded(
    player_df: pd.DataFrame,
    team_code: int,
    mode_norm: str,
    max_date: Optional[Union[str, pd.Timestamp]] = None,
) -> pd.DataFrame:
    pool = player_df[player_df["_team_code"] == int(team_code)].copy()
    if mode_norm == "histo" and max_date is not None:
        mx = pd.to_datetime(max_date, errors="coerce", utc=True)
        if pd.notna(mx):
            pool = pool[pool["kickoff_time"] <= mx].copy()

    pool = pool.sort_values(["name", "kickoff_time"], na_position="last")
    pool = pool.groupby("name", as_index=False, group_keys=False).tail(1).reset_index(drop=True)
    
    if mode_norm == "histo":
        risk_adj_minutes_factor = np.minimum(1,(pool["minutes"]+0.01)/90)
        pool["XG_Index"] =pool['Goal_Statistics']*0.4+pool['Share_of_XG']*0.4+pool['Share_of_XG_Short']*0.2
        pool["XG_Index"]=pool["XG_Index"]*risk_adj_minutes_factor
        pool["XA_Index"] = pool['Assist_Statistics']*0.4+pool['Share_of_XA']*0.4+pool['Share_of_XA_Short']*0.2
        pool["XA_Index"]=pool["XA_Index"]*risk_adj_minutes_factor
    else:
        risk_adj_minutes_factor = np.minimum(1,(pool["average_minutes"]+0.01)/90)
        pool["XG_Index"] =pool['Goal_Statistics_share']*0.3*+pool["Rolling_adjusted_Threat_per90_share"]*0.2+pool['Rolling_adjusted_XG']*0.1*risk_adj_minutes_factor+pool['Big_Chances']*0.1*0.33*risk_adj_minutes_factor+pool['Share_of_XG']*0.3*risk_adj_minutes_factor+pool['Share_of_XG_Short']*0.0*risk_adj_minutes_factor
        pool["XG_Index"]=pool["XG_Index"]*0.7+0.3*pool["Opp_Goal_Threat_Pos"]*risk_adj_minutes_factor
        pool["XA_Index"] = pool['Assist_Statistics_share']*0.4+pool['Rolling_adjusted_XA']*0.1*risk_adj_minutes_factor+pool["Big_Chances_Created"]*0.5 * 0.2*risk_adj_minutes_factor+pool['Share_of_XA']*0.2*risk_adj_minutes_factor+pool['Share_of_XA_Short']*0.1*risk_adj_minutes_factor
        pool["XA_Index"]=pool["XA_Index"]*0.7+0.3*pool["Opp_Assist_Threat_Pos"]*risk_adj_minutes_factor
    return pool


def build_player_pool(
    team_code: int,
    mode: str,
    max_date: Optional[Union[str, pd.Timestamp]] = None,
    cfg: Optional[SimulatorTestConfig] = None,
) -> pd.DataFrame:
    """
    Build latest player rows for a team after filters.
    - mode: new/histo
    - max_date: only used for historical mode
    """
    cfg = cfg or SimulatorTestConfig()
    df = _read_player_source(mode=mode, cfg=cfg)
    mode_norm = _normalize_player_mode(mode)
    return _build_player_pool_from_loaded(df, team_code=int(team_code), mode_norm=mode_norm, max_date=max_date)


def get_player(
    team_code: int,
    mode: str,
    target: str,
    max_date: Optional[Union[str, pd.Timestamp]] = None,
    random_state: Optional[int] = None,
    cfg: Optional[SimulatorTestConfig] = None,
) -> pd.DataFrame:
    """
    Return one random player row from filtered latest player pool.
    Randomness is weighted by:
    - target='goal'  -> XG_Index
    - target='assist' -> XA_Index
    """
    cfg = cfg or SimulatorTestConfig()
    pool = build_player_pool(team_code=team_code, mode=mode, max_date=max_date, cfg=cfg)
    if pool.empty:
        return pool

    t = str(target).strip().lower()
    if t in {"goal", "goals", "xg"}:
        weight_col = "XG_Index"
    elif t in {"assist", "assists", "xa"}:
        weight_col = "XA_Index"
    else:
        raise ValueError("target must be one of: goal/goals/xg or assist/assists/xa")

    weights = pd.to_numeric(pool[weight_col], errors="coerce").fillna(0.0).clip(lower=0.0)
    if float(weights.sum()) <= 0:
        weights = pd.Series(np.ones(len(pool), dtype=float), index=pool.index)

    chosen = pool.sample(n=1, weights=weights, random_state=random_state).copy().reset_index(drop=True)
    chosen["selected_by"] = weight_col
    chosen["pool_size"] = int(len(pool))
    return chosen


def _get_opponent_def_stat(team_row: pd.Series) -> float:
    was_home = bool(team_row.get("was_home_bool", False))
    if was_home:
        opp_def = pd.to_numeric(pd.Series([team_row.get("away_team_defences", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    else:
        opp_def = pd.to_numeric(pd.Series([team_row.get("home_team_defences", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    return float(np.clip(opp_def, 0.0, 1.0))


def pass_percent(
    team_row: pd.Series,
    player_row: pd.Series,
    tuning: Optional[SimulatorTuningParams] = None,
) -> float:
    """
    Pass success percent from opponent defense and player over-assist.
    Formula basis requested: opponent_defensive_stat * (1 - Average_OverAssist).
    """
    tuning = tuning or SimulatorTuningParams()
    # Convert opponent defensive stop level to "space to complete pass".
    opp_space = np.clip(1 - _get_opponent_def_stat(team_row), 0.5, 0.8)
    over_assist = np.clip(float(
        pd.to_numeric(pd.Series([player_row.get("Average_OverAssist", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    ),0.85,1.2)
    creativity = np.clip(0.75+0.017*float(
        pd.to_numeric(pd.Series([player_row.get("Rolling_adjusted_creativity_per90", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    ),0.75,1.25)
    pass_success_prob = np.clip(opp_space * (over_assist*0.6+0.4*creativity), 0.0, 1.0) * float(tuning.pass_scale)
    return float(np.clip(pass_success_prob, 0.0, 1.0))


def goal_percent(
    team_row: pd.Series,
    player_row: pd.Series,
    tuning: Optional[SimulatorTuningParams] = None,
) -> float:
    """
    Goal scoring percent from opponent defense and player over-score.
    Formula basis requested: opponent_defensive_stat * (1 - Average_Overscore).
    """
    tuning = tuning or SimulatorTuningParams()
    # Convert opponent defensive stop level to "space to finish shot".
    opp_space = np.clip(1 - _get_opponent_def_stat(team_row), 0.5, 0.8)
    over_score = np.clip(float(
        pd.to_numeric(pd.Series([player_row.get("Average_Overscore", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    ),0.85,1.15)
    
    threat = np.clip(0.75+0.017*float(
        pd.to_numeric(pd.Series([player_row.get("Rolling_adjusted_Threat_per90", 1.0)]), errors="coerce").fillna(1.0).iloc[0]
    ),0.75,1.25)
    goal_success_prob = np.clip(opp_space * (over_score*0.6+0.4*threat), 0.0, 1.0) * float(tuning.goal_scale)
    return float(np.clip(goal_success_prob, 0.0, 1.0))


def _weights_or_uniform(s: pd.Series) -> np.ndarray:
    w = pd.to_numeric(s, errors="coerce").fillna(0.0).clip(lower=0.0).to_numpy(dtype=float)
    if w.size == 0:
        return w
    tot = float(w.sum())
    if tot <= 0:
        return np.ones_like(w, dtype=float) / float(len(w))
    return w / tot


def _attacks_for_row(team_row: pd.Series) -> int:
    was_home = bool(team_row.get("was_home_bool", False))
    val = team_row.get("home_team_attacks", 1.0) if was_home else team_row.get("away_team_attacks", 1.0)
    n_attacks = int(round(float(pd.to_numeric(pd.Series([val]), errors="coerce").fillna(1.0).iloc[0])))
    return max(0, n_attacks)


def _attach_opponent_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    required_cols = {
        "opp_name",
        "opp_actual_xg",
        "opp_xg_metric",
        "opp_xgc_metric",
        "opp_xg_metric_norm",
        "opp_xgc_metric_norm",
        "opp_predicted_xg_stat",
        "opp_xg_error_avg_last20",
        "opp_xg_error_std_last20",
    }
    if required_cols.issubset(set(out.columns)):
        return out

    if not {"kickoff_time", "code", "opponent"}.issubset(set(out.columns)):
        return out

    # Ensure no merge collisions when some opponent-derived columns already exist.
    out = out.drop(
        columns=[
            "opp_name",
            "opp_actual_xg",
            "opp_xg_metric",
            "opp_xgc_metric",
            "opp_xg_metric_norm",
            "opp_xgc_metric_norm",
            "opp_predicted_xg_stat",
            "opp_xg_error_avg_last20",
            "opp_xg_error_std_last20",
        ],
        errors="ignore",
    )

    right_cols = [
        "kickoff_time",
        "code",
        "opponent",
        "name",
        "XG",
        "xg_metric",
        "xgc_metric",
        "xg_metric_norm",
        "xgc_metric_norm",
        "predicted_xg_stat",
        "xg_error_avg_last20",
        "xg_error_std_last20",
    ]
    right_cols = [c for c in right_cols if c in out.columns]
    right = out[right_cols].rename(
        columns={
            "code": "opp_code_key",
            "opponent": "opp_of_opp_key",
            "name": "opp_name",
            "XG": "opp_actual_xg",
            "xg_metric": "opp_xg_metric",
            "xgc_metric": "opp_xgc_metric",
            "xg_metric_norm": "opp_xg_metric_norm",
            "xgc_metric_norm": "opp_xgc_metric_norm",
            "predicted_xg_stat": "opp_predicted_xg_stat",
            "xg_error_avg_last20": "opp_xg_error_avg_last20",
            "xg_error_std_last20": "opp_xg_error_std_last20",
        }
    )
    # Prevent many-to-many merge explosions if source rows are duplicated.
    right = (
        right.sort_values(["kickoff_time", "opp_of_opp_key", "opp_code_key"], na_position="last")
        .drop_duplicates(subset=["kickoff_time", "opp_of_opp_key", "opp_code_key"], keep="last")
        .reset_index(drop=True)
    )
    out = out.merge(
        right,
        left_on=["kickoff_time", "code", "opponent"],
        right_on=["kickoff_time", "opp_of_opp_key", "opp_code_key"],
        how="left",
    )
    out = out.drop(columns=["opp_code_key", "opp_of_opp_key"], errors="ignore")
    return out


def run_team_row_simulations(
    team_rows: pd.DataFrame,
    player_mode: str,
    simulations_per_row: int = 200,
    max_date_for_hist: Optional[Union[str, pd.Timestamp]] = None,
    random_seed: int = 42,
    cfg: Optional[SimulatorTestConfig] = None,
    tuning: Optional[SimulatorTuningParams] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run attack simulations for each team row.
    Returns:
    - team_results dataframe
    - player_outcomes dataframe
    """
    cfg = cfg or SimulatorTestConfig()
    tuning = tuning or SimulatorTuningParams()
    mode_norm = _normalize_player_mode(player_mode)
    player_source_df = _read_player_source(mode_norm, cfg)
    assist_credit_prob = float(np.clip(getattr(cfg, "assist_credit_prob", 0.75), 0.0, 1.0))

    rng = np.random.default_rng(random_seed)
    team_out_rows = []
    player_out_rows = []

    def _num(r: pd.Series, key: str, default=np.nan) -> float:
        v = r.get(key, default)
        return pd.to_numeric(pd.Series([v]), errors="coerce").iloc[0]

    for _, row in team_rows.iterrows():
        team_code = int(pd.to_numeric(pd.Series([row.get("code")]), errors="coerce").fillna(-1).iloc[0])
        if team_code < 0:
            continue

        was_home = bool(row.get("was_home_bool", False))
        opp_code = int(pd.to_numeric(pd.Series([row.get("opponent")]), errors="coerce").fillna(-1).iloc[0])
        team_name = str(row.get("name", ""))
        opp_name = str(row.get("opponent_name", row.get("opp_name", "")))

        own_xg_metric = _num(row, "xg_metric")
        own_xgc_metric = _num(row, "xgc_metric")
        own_xg_norm = _num(row, "xg_metric_norm")
        own_xgc_norm = _num(row, "xgc_metric_norm")
        own_pred_xg = _num(row, "predicted_xg_stat")
        own_actual_xg = _num(row, "XG")
        own_err_avg = _num(row, "xg_error_avg_last20", 0.0)
        own_err_std = _num(row, "xg_error_std_last20", 0.0)

        opp_xg_metric = _num(row, "opp_xg_metric")
        opp_xgc_metric = _num(row, "opp_xgc_metric")
        opp_xg_norm = _num(row, "opp_xg_metric_norm")
        opp_xgc_norm = _num(row, "opp_xgc_metric_norm")
        opp_pred_xg = _num(row, "opp_predicted_xg_stat")
        opp_actual_xg = _num(row, "opp_actual_xg")
        opp_err_avg = _num(row, "opp_xg_error_avg_last20", np.nan)
        opp_err_std = _num(row, "opp_xg_error_std_last20", np.nan)
        if pd.isna(opp_err_avg):
            opp_err_avg = _num(row, "opp_hist_xg_error_avg_last20", 0.0)
        if pd.isna(opp_err_std):
            opp_err_std = _num(row, "opp_hist_xg_error_std_last20", 0.0)

        if was_home:
            home_code, away_code = team_code, opp_code
            home_name, away_name = team_name, opp_name
            home_xg_metric, away_xg_metric = own_xg_metric, opp_xg_metric
            home_xgc_metric, away_xgc_metric = own_xgc_metric, opp_xgc_metric
            home_xg_norm, away_xg_norm = own_xg_norm, opp_xg_norm
            home_xgc_norm, away_xgc_norm = own_xgc_norm, opp_xgc_norm
            home_pred_xg, away_pred_xg = own_pred_xg, opp_pred_xg
            actual_home_xg, actual_away_xg = own_actual_xg, opp_actual_xg
            home_err_avg, away_err_avg = own_err_avg, opp_err_avg
            home_err_std, away_err_std = own_err_std, opp_err_std
        else:
            home_code, away_code = opp_code, team_code
            home_name, away_name = opp_name, team_name
            home_xg_metric, away_xg_metric = opp_xg_metric, own_xg_metric
            home_xgc_metric, away_xgc_metric = opp_xgc_metric, own_xgc_metric
            home_xg_norm, away_xg_norm = opp_xg_norm, own_xg_norm
            home_xgc_norm, away_xgc_norm = opp_xgc_norm, own_xgc_norm
            home_pred_xg, away_pred_xg = opp_pred_xg, own_pred_xg
            actual_home_xg, actual_away_xg = opp_actual_xg, own_actual_xg
            home_err_avg, away_err_avg = opp_err_avg, own_err_avg
            home_err_std, away_err_std = opp_err_std, own_err_std

        row_max_date = None
        if mode_norm == "histo":
            row_max_date = row.get("kickoff_time", max_date_for_hist)
            if max_date_for_hist is not None:
                row_max_date = min(pd.to_datetime(row_max_date, errors="coerce", utc=True), pd.to_datetime(max_date_for_hist, errors="coerce", utc=True))

        pool = _build_player_pool_from_loaded(
            player_df=player_source_df,
            team_code=team_code,
            mode_norm=mode_norm,
            max_date=row_max_date,
        )
        if pool.empty:
            team_out_rows.append(
                {
                    "source_type": row.get("source_type"),
                    "fixture_code": row.get("fixture_code"),
                    "event": row.get("event"),
                    "kickoff_time": row.get("kickoff_time"),
                    "team_code": team_code,
                    "team_name": team_name,
                    "opponent_code": opp_code,
                    "opponent_name": opp_name,
                    "home_code": home_code,
                    "away_code": away_code,
                    "home_name": home_name,
                    "away_name": away_name,
                    "was_home_bool": was_home,
                    "home_xg_metric": home_xg_metric,
                    "away_xg_metric": away_xg_metric,
                    "home_xgc_metric": home_xgc_metric,
                    "away_xgc_metric": away_xgc_metric,
                    "home_xg_metric_norm": home_xg_norm,
                    "away_xg_metric_norm": away_xg_norm,
                    "home_xgc_metric_norm": home_xgc_norm,
                    "away_xgc_metric_norm": away_xgc_norm,
                    "home_predicted_xg_stat": home_pred_xg,
                    "away_predicted_xg_stat": away_pred_xg,
                    "home_xg_error_avg_last20": home_err_avg,
                    "away_xg_error_avg_last20": away_err_avg,
                    "home_xg_error_std_last20": home_err_std,
                    "away_xg_error_std_last20": away_err_std,
                    "home_team_attacks": _num(row, "home_team_attacks", 1.0),
                    "away_team_attacks": _num(row, "away_team_attacks", 1.0),
                    "home_team_defences": _num(row, "home_team_defences", 1.0),
                    "away_team_defences": _num(row, "away_team_defences", 1.0),
                    "n_attacks": _attacks_for_row(row),
                    "sim_xg": 0.0,
                    "actual_xg": own_actual_xg,
                    "actual_home_xg": actual_home_xg,
                    "actual_away_xg": actual_away_xg,
                    "team_score_zero_pct": 100.0,
                    "goal_pmf_json": json.dumps({"0": 1.0}),
                    "mse_component": np.nan,
                    "simulations": int(simulations_per_row),
                    "pool_size": 0,
                }
            )
            continue

        assist_w = _weights_or_uniform(pool["XA_Index"])
        goal_w = _weights_or_uniform(pool["XG_Index"])
        n_attacks = _attacks_for_row(row)

        total_goals = 0
        goals_per_sim = []
        row_player_counts: Dict[str, Dict[str, float]] = {
            str(n): {"goals": 0.0, "assists": 0.0, "assister_picks": 0.0, "scorer_picks": 0.0}
            for n in pool["name"].astype(str).tolist()
        }

        for _sim in range(int(simulations_per_row)):
            sim_goals = 0
            for _a in range(n_attacks):
                assister_idx = int(rng.choice(len(pool), p=assist_w))
                assister = pool.iloc[assister_idx]
                assister_name = str(assister.get("name", ""))
                row_player_counts[assister_name]["assister_picks"] += 1.0

                p_pass = pass_percent(row, assister, tuning=tuning)
                if float(rng.random()) > p_pass:
                    # Intercepted
                    continue

                scorer_idx = int(rng.choice(len(pool), p=goal_w))
                scorer = pool.iloc[scorer_idx]
                scorer_name = str(scorer.get("name", ""))
                row_player_counts[scorer_name]["scorer_picks"] += 1.0

                p_goal = goal_percent(row, scorer, tuning=tuning)
                if float(rng.random()) < p_goal:
                    total_goals += 1
                    sim_goals += 1
                    row_player_counts[scorer_name]["goals"] += 1.0
                    if float(rng.random()) < assist_credit_prob:
                        row_player_counts[assister_name]["assists"] += 1.0
            goals_per_sim.append(int(sim_goals))

        sim_xg = float(total_goals) / float(max(1, simulations_per_row))
        goal_counts: Dict[int, int] = {}
        for g in goals_per_sim:
            goal_counts[int(g)] = goal_counts.get(int(g), 0) + 1
        goal_pmf = {str(k): float(v) / float(max(1, simulations_per_row)) for k, v in sorted(goal_counts.items())}
        team_score_zero_pct = 100.0 * goal_pmf.get("0", 0.0)
        actual_xg = pd.to_numeric(pd.Series([row.get("XG")]), errors="coerce").iloc[0]
        mse_component = float((actual_xg - sim_xg) ** 2) if pd.notna(actual_xg) else np.nan

        team_out_rows.append(
            {
                "source_type": row.get("source_type"),
                "fixture_code": row.get("fixture_code"),
                "event": row.get("event"),
                "kickoff_time": row.get("kickoff_time"),
                "team_code": team_code,
                "team_name": team_name,
                "opponent_code": opp_code,
                "opponent_name": opp_name,
                "home_code": home_code,
                "away_code": away_code,
                "home_name": home_name,
                "away_name": away_name,
                "was_home_bool": was_home,
                "home_xg_metric": home_xg_metric,
                "away_xg_metric": away_xg_metric,
                "home_xgc_metric": home_xgc_metric,
                "away_xgc_metric": away_xgc_metric,
                "home_xg_metric_norm": home_xg_norm,
                "away_xg_metric_norm": away_xg_norm,
                "home_xgc_metric_norm": home_xgc_norm,
                "away_xgc_metric_norm": away_xgc_norm,
                "home_predicted_xg_stat": home_pred_xg,
                "away_predicted_xg_stat": away_pred_xg,
                "home_xg_error_avg_last20": home_err_avg,
                "away_xg_error_avg_last20": away_err_avg,
                "home_xg_error_std_last20": home_err_std,
                "away_xg_error_std_last20": away_err_std,
                "home_team_attacks": _num(row, "home_team_attacks", 1.0),
                "away_team_attacks": _num(row, "away_team_attacks", 1.0),
                "home_team_defences": _num(row, "home_team_defences", 1.0),
                "away_team_defences": _num(row, "away_team_defences", 1.0),
                "n_attacks": n_attacks,
                "sim_xg": sim_xg,
                "actual_xg": own_actual_xg,
                "actual_home_xg": actual_home_xg,
                "actual_away_xg": actual_away_xg,
                "team_score_zero_pct": team_score_zero_pct,
                "goal_pmf_json": json.dumps(goal_pmf),
                "mse_component": mse_component,
                "simulations": int(simulations_per_row),
                "pool_size": int(len(pool)),
            }
        )

        for pname, d in row_player_counts.items():
            player_out_rows.append(
                {
                    "source_type": row.get("source_type"),
                    "fixture_code": row.get("fixture_code"),
                    "event": row.get("event"),
                    "kickoff_time": row.get("kickoff_time"),
                    "team_code": team_code,
                    "team_name": row.get("name"),
                    "player_name": pname,
                    "sim_goals_total": float(d["goals"]),
                    "sim_assists_total": float(d["assists"]),
                    "expected_goals": float(d["goals"]) / float(max(1, simulations_per_row)),
                    "expected_assists": float(d["assists"]) / float(max(1, simulations_per_row)),
                    "assister_picks_total": float(d["assister_picks"]),
                    "scorer_picks_total": float(d["scorer_picks"]),
                    "simulations": int(simulations_per_row),
                }
            )

    team_results = pd.DataFrame(team_out_rows)
    player_outcomes = pd.DataFrame(player_out_rows)

    if not team_results.empty:
        # Build fixture-level win/draw/clean-sheet odds from simulated score distributions.
        team_results = _add_fixture_outcome_metrics(team_results)
        mask = team_results["actual_xg"].notna()
        hist_mse = float(team_results.loc[mask, "mse_component"].mean()) if mask.any() else np.nan
        team_results["historical_mse"] = hist_mse

    return team_results, player_outcomes


def _parse_goal_pmf(x) -> Dict[int, float]:
    if isinstance(x, dict):
        return {int(k): float(v) for k, v in x.items()}
    if isinstance(x, str):
        try:
            d = json.loads(x)
            if isinstance(d, dict):
                return {int(k): float(v) for k, v in d.items()}
        except Exception:
            return {}
    return {}


def _add_fixture_outcome_metrics(team_results: pd.DataFrame) -> pd.DataFrame:
    out = team_results.copy()
    numeric_cols = [
        "home_win_pct",
        "draw_pct",
        "away_win_pct",
        "home_clean_sheet_pct",
        "away_clean_sheet_pct",
        "team_win_pct",
        "team_draw_pct",
        "team_loss_pct",
        "team_clean_sheet_pct",
        "avg_home_goals_sim",
        "avg_away_goals_sim",
        "most_likely_scoreline_pct",
    ]
    for c in numeric_cols:
        if c not in out.columns:
            out[c] = np.nan
    if "most_likely_scoreline" not in out.columns:
        out["most_likely_scoreline"] = ""

    key_cols = ["fixture_code", "event", "kickoff_time", "home_code", "away_code"]
    for _, grp in out.groupby(key_cols, dropna=False):
        home_rows = grp[grp["was_home_bool"] == True]
        away_rows = grp[grp["was_home_bool"] == False]
        if home_rows.empty or away_rows.empty:
            continue

        h_idx = home_rows.index[0]
        a_idx = away_rows.index[0]

        home_pmf = _parse_goal_pmf(out.at[h_idx, "goal_pmf_json"]) if "goal_pmf_json" in out.columns else {}
        away_pmf = _parse_goal_pmf(out.at[a_idx, "goal_pmf_json"]) if "goal_pmf_json" in out.columns else {}
        if not home_pmf or not away_pmf:
            continue

        home_win = 0.0
        draw = 0.0
        away_win = 0.0
        home_cs = 0.0
        away_cs = 0.0
        avg_home = 0.0
        avg_away = 0.0
        score_probs: Dict[Tuple[int, int], float] = {}

        for hg, ph in home_pmf.items():
            avg_home += float(hg) * float(ph)
            for ag, pa in away_pmf.items():
                p = float(ph) * float(pa)
                avg_away += float(ag) * p
                score_probs[(int(hg), int(ag))] = score_probs.get((int(hg), int(ag)), 0.0) + p
                if hg > ag:
                    home_win += p
                elif hg == ag:
                    draw += p
                else:
                    away_win += p
                if ag == 0:
                    home_cs += p
                if hg == 0:
                    away_cs += p

        if score_probs:
            best_score = max(score_probs.items(), key=lambda kv: kv[1])[0]
            best_scoreline = f"{best_score[0]}-{best_score[1]}"
            best_score_pct = 100.0 * score_probs[best_score]
        else:
            best_scoreline = ""
            best_score_pct = np.nan

        idxs = list(grp.index)
        out.loc[idxs, "home_win_pct"] = 100.0 * home_win
        out.loc[idxs, "draw_pct"] = 100.0 * draw
        out.loc[idxs, "away_win_pct"] = 100.0 * away_win
        out.loc[idxs, "home_clean_sheet_pct"] = 100.0 * home_cs
        out.loc[idxs, "away_clean_sheet_pct"] = 100.0 * away_cs
        out.loc[idxs, "avg_home_goals_sim"] = avg_home
        out.loc[idxs, "avg_away_goals_sim"] = avg_away
        out.loc[idxs, "most_likely_scoreline"] = best_scoreline
        out.loc[idxs, "most_likely_scoreline_pct"] = best_score_pct

        for ridx in idxs:
            was_home = bool(out.at[ridx, "was_home_bool"])
            if was_home:
                out.at[ridx, "team_win_pct"] = 100.0 * home_win
                out.at[ridx, "team_draw_pct"] = 100.0 * draw
                out.at[ridx, "team_loss_pct"] = 100.0 * away_win
                out.at[ridx, "team_clean_sheet_pct"] = 100.0 * home_cs
            else:
                out.at[ridx, "team_win_pct"] = 100.0 * away_win
                out.at[ridx, "team_draw_pct"] = 100.0 * draw
                out.at[ridx, "team_loss_pct"] = 100.0 * home_win
                out.at[ridx, "team_clean_sheet_pct"] = 100.0 * away_cs

    return out


def _resolve_source_for_rows(source: str) -> str:
    s = str(source).strip().lower()
    if s in {"historical", "history", "hist", "histo"}:
        return "historical"
    if s in {"upcoming", "future", "fut", "new"}:
        return "upcoming"
    raise ValueError("source must be historical/history/hist/histo or upcoming/future/fut/new")


def get_simulated_team_results(
    source: str,
    n_last: Optional[int] = 20,
    n_upcoming: Optional[int] = 8,
    simulations_per_row: int = 200,
    max_date_for_hist: Optional[Union[str, pd.Timestamp]] = None,
    random_seed: int = 42,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
    tuning: Optional[SimulatorTuningParams] = None,
) -> pd.DataFrame:
    src = _resolve_source_for_rows(source)
    if src == "historical":
        base = get_sim_data("historical", n_last=None, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
        base = team_attacks(base, tuning=tuning)
        base = team_defences(base, tuning=tuning)
        if n_last is not None and n_last > 0:
            base = (
                base.sort_values(["code", "kickoff_time"])
                .groupby("code", as_index=False, group_keys=False)
                .tail(int(n_last))
                .reset_index(drop=True)
            )
    else:
        base = get_sim_data(src, n_last=n_last, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
        base = team_attacks(base, tuning=tuning)
        base = team_defences(base, tuning=tuning)
    player_mode = "histo" if src == "historical" else "new"
    team_results, _ = run_team_row_simulations(
        team_rows=base,
        player_mode=player_mode,
        simulations_per_row=simulations_per_row,
        max_date_for_hist=max_date_for_hist,
        random_seed=random_seed,
        cfg=cfg,
        tuning=tuning,
    )
    return team_results


def get_simulated_player_outcomes(
    source: str,
    n_last: Optional[int] = 20,
    n_upcoming: Optional[int] = 8,
    simulations_per_row: int = 200,
    max_date_for_hist: Optional[Union[str, pd.Timestamp]] = None,
    random_seed: int = 42,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
    tuning: Optional[SimulatorTuningParams] = None,
) -> pd.DataFrame:
    src = _resolve_source_for_rows(source)
    if src == "historical":
        base = get_sim_data("historical", n_last=None, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
        base = team_attacks(base, tuning=tuning)
        base = team_defences(base, tuning=tuning)
        if n_last is not None and n_last > 0:
            base = (
                base.sort_values(["code", "kickoff_time"])
                .groupby("code", as_index=False, group_keys=False)
                .tail(int(n_last))
                .reset_index(drop=True)
            )
    else:
        base = get_sim_data(src, n_last=n_last, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
        base = team_attacks(base, tuning=tuning)
        base = team_defences(base, tuning=tuning)
    player_mode = "histo" if src == "historical" else "new"
    _, player_outcomes = run_team_row_simulations(
        team_rows=base,
        player_mode=player_mode,
        simulations_per_row=simulations_per_row,
        max_date_for_hist=max_date_for_hist,
        random_seed=random_seed,
        cfg=cfg,
        tuning=tuning,
    )
    return player_outcomes


def team_attacks(
    hist_or_fut: SourceOrDf,
    n_last: Optional[int] = 20,
    n_upcoming: Optional[int] = 8,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
    tuning: Optional[SimulatorTuningParams] = None,
) -> pd.DataFrame:
    """
    Add team-attack columns.
    Input can be:
    - source string: "hist"/"historical" or "fut"/"future"/"upcoming"
    - an existing dataframe
    """
    if isinstance(hist_or_fut, pd.DataFrame):
        out = hist_or_fut.copy()
    else:
        src = str(hist_or_fut).strip().lower()
        if src in {"fut", "future"}:
            src = "upcoming"
        elif src in {"hist"}:
            src = "historical"
        out = get_sim_data(src, n_last=n_last, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
    tuning = tuning or SimulatorTuningParams()

    out = out.copy()
    out = _attach_opponent_features(out)
    out["xg_metric_norm"] = pd.to_numeric(out.get("xg_metric_norm"), errors="coerce")
    out["xgc_metric_norm"] = pd.to_numeric(out.get("xgc_metric_norm"), errors="coerce")
    out["predicted_xg_stat"] = pd.to_numeric(out.get("predicted_xg_stat"), errors="coerce")

    has_opp_cols = all(c in out.columns for c in ["opp_xg_metric_norm", "opp_xgc_metric_norm", "opp_predicted_xg_stat", "opp_xg_error_avg_last20"])
    if not has_opp_cols and {"kickoff_time", "code", "opponent"}.issubset(set(out.columns)):
        out = out.drop(columns=["opp_xg_metric_norm", "opp_xgc_metric_norm", "opp_predicted_xg_stat", "opp_xg_error_avg_last20", "opp_xg_error_std_last20"], errors="ignore")
        pair_cols = ["kickoff_time", "code", "opponent", "xg_metric_norm", "xgc_metric_norm", "predicted_xg_stat", "xg_error_avg_last20", "xg_error_std_last20"]
        pair_cols = [c for c in pair_cols if c in out.columns]
        right = out[pair_cols].rename(
            columns={
                "code": "opp_code_key",
                "opponent": "opp_of_opp_key",
                "xg_metric_norm": "opp_xg_metric_norm",
                "xgc_metric_norm": "opp_xgc_metric_norm",
                "predicted_xg_stat": "opp_predicted_xg_stat",
                "xg_error_avg_last20": "opp_xg_error_avg_last20",
                "xg_error_std_last20": "opp_xg_error_std_last20",
            }
        )
        right = (
            right.sort_values(["kickoff_time", "opp_of_opp_key", "opp_code_key"], na_position="last")
            .drop_duplicates(subset=["kickoff_time", "opp_of_opp_key", "opp_code_key"], keep="last")
            .reset_index(drop=True)
        )
        out = out.merge(
            right,
            left_on=["kickoff_time", "code", "opponent"],
            right_on=["kickoff_time", "opp_of_opp_key", "opp_code_key"],
            how="left",
        )

    own_xg_norm = pd.to_numeric(out["xg_metric_norm"], errors="coerce").fillna(0.0)
    own_pred_xg = pd.to_numeric(out["predicted_xg_stat"], errors="coerce").fillna(0.0)
    if "xg_error_avg_last20" in out.columns:
        own_hist_err = pd.to_numeric(out["xg_error_avg_last20"], errors="coerce").fillna(0.0)
    else:
        own_hist_err = pd.Series(0.0, index=out.index, dtype=float)
    own_pred_xg = own_pred_xg + 0.5 * own_hist_err
    if "opp_xg_metric_norm" in out.columns:
        opp_xg_norm = pd.to_numeric(out["opp_xg_metric_norm"], errors="coerce").fillna(own_xg_norm)
    else:
        opp_xg_norm = own_xg_norm.copy()
    if "opp_predicted_xg_stat" in out.columns:
        opp_pred_xg = pd.to_numeric(out["opp_predicted_xg_stat"], errors="coerce").fillna(own_pred_xg)
    else:
        opp_pred_xg = own_pred_xg.copy()
    if "opp_xg_error_avg_last20" in out.columns:
        opp_hist_err = pd.to_numeric(out["opp_xg_error_avg_last20"], errors="coerce").fillna(0.0)
    else:
        opp_hist_err = pd.Series(0.0, index=out.index, dtype=float)
    opp_pred_xg = opp_pred_xg + 0.5 * opp_hist_err

    own_attack = float(tuning.attack_base) * (
        0.5 * np.clip(own_xg_norm, 0.75, 1.35) + 0.5 * np.clip((own_pred_xg / 1.3), 0.75, 1.3)
    )
    opp_attack = float(tuning.attack_base) * (
        0.5 * np.clip(opp_xg_norm, 0.75, 1.35) + 0.5 * np.clip((opp_pred_xg / 1.3), 0.75, 1.3)
    )

    was_home = out["was_home_bool"].astype(bool) if "was_home_bool" in out.columns else pd.Series(False, index=out.index)
    out["home_team_attacks"] = np.where(was_home, own_attack, opp_attack)
    out["away_team_attacks"] = np.where(was_home, opp_attack, own_attack)

    out = out.drop(columns=["opp_code_key", "opp_of_opp_key"], errors="ignore")
    return out


def team_defences(
    hist_or_fut: SourceOrDf,
    n_last: Optional[int] = 20,
    n_upcoming: Optional[int] = 8,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
    tuning: Optional[SimulatorTuningParams] = None,
) -> pd.DataFrame:
    """
    Add team-defence columns.
    Input can be:
    - source string: "hist"/"historical" or "fut"/"future"/"upcoming"
    - an existing dataframe
    """
    if isinstance(hist_or_fut, pd.DataFrame):
        out = hist_or_fut.copy()
    else:
        src = str(hist_or_fut).strip().lower()
        if src in {"fut", "future"}:
            src = "upcoming"
        elif src in {"hist"}:
            src = "historical"
        out = get_sim_data(src, n_last=n_last, n_upcoming=n_upcoming, cfg=cfg, formula_cfg=formula_cfg)
    tuning = tuning or SimulatorTuningParams()

    out = out.copy()
    out = _attach_opponent_features(out)
    out["xgc_metric_norm"] = pd.to_numeric(out.get("xgc_metric_norm"), errors="coerce")
    out["predicted_xg_stat"] = pd.to_numeric(out.get("predicted_xg_stat"), errors="coerce")

    has_opp_cols = all(c in out.columns for c in ["opp_xg_metric_norm", "opp_xgc_metric_norm", "opp_predicted_xg_stat"])
    if not has_opp_cols and {"kickoff_time", "code", "opponent"}.issubset(set(out.columns)):
        out = out.drop(columns=["opp_xg_metric_norm", "opp_xgc_metric_norm", "opp_predicted_xg_stat"], errors="ignore")
        pair_cols = ["kickoff_time", "code", "opponent", "xg_metric_norm", "xgc_metric_norm", "predicted_xg_stat"]
        pair_cols = [c for c in pair_cols if c in out.columns]
        right = out[pair_cols].rename(
            columns={
                "code": "opp_code_key",
                "opponent": "opp_of_opp_key",
                "xg_metric_norm": "opp_xg_metric_norm",
                "xgc_metric_norm": "opp_xgc_metric_norm",
                "predicted_xg_stat": "opp_predicted_xg_stat",
            }
        )
        right = (
            right.sort_values(["kickoff_time", "opp_of_opp_key", "opp_code_key"], na_position="last")
            .drop_duplicates(subset=["kickoff_time", "opp_of_opp_key", "opp_code_key"], keep="last")
            .reset_index(drop=True)
        )
        out = out.merge(
            right,
            left_on=["kickoff_time", "code", "opponent"],
            right_on=["kickoff_time", "opp_of_opp_key", "opp_code_key"],
            how="left",
        )

    own_xgc_norm = pd.to_numeric(out["xgc_metric_norm"], errors="coerce").fillna(0.0)
    own_pred_xg = pd.to_numeric(out["predicted_xg_stat"], errors="coerce").fillna(0.0)
    if "opp_xgc_metric_norm" in out.columns:
        opp_xgc_norm = pd.to_numeric(out["opp_xgc_metric_norm"], errors="coerce").fillna(own_xgc_norm)
    else:
        opp_xgc_norm = own_xgc_norm.copy()
    if "opp_predicted_xg_stat" in out.columns:
        opp_pred_xg = pd.to_numeric(out["opp_predicted_xg_stat"], errors="coerce").fillna(own_pred_xg)
    else:
        opp_pred_xg = own_pred_xg.copy()

    own_def = float(tuning.defence_base) * (
        np.clip((1 / own_xgc_norm), 0.7, 1.3) * 0.7+ 0.3 * np.clip(2.0 - (opp_pred_xg / 1.4), 0.65, 1.3))
    opp_def = float(tuning.defence_base) * (
        np.clip((1 / opp_xgc_norm), 0.7, 1.3) * 0.7+ 0.3 * np.clip(2.0 - (own_pred_xg / 1.4), 0.65, 1.3))
    
    was_home = out["was_home_bool"].astype(bool) if "was_home_bool" in out.columns else pd.Series(False, index=out.index)
    out["home_team_defences"] = np.where(was_home, own_def, opp_def)
    out["away_team_defences"] = np.where(was_home, opp_def, own_def)

    out = out.drop(columns=["opp_code_key", "opp_of_opp_key"], errors="ignore")
    return out


def get_team_historical_for_sim(
    team: TeamArg,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
) -> pd.DataFrame:
    cfg = cfg or SimulatorTestConfig()
    formula_cfg = formula_cfg or StatFormulaConfig()
    all_hist = build_historical_adjustments_all_teams(cfg=cfg, formula_cfg=formula_cfg, write_csv=True)
    code = _resolve_team_code(read_team_history_df(cfg.team_history_path), team)
    return all_hist[all_hist["code"] == code].sort_values("kickoff_time").reset_index(drop=True)


def get_newest_row_with_history_calcs(
    team: TeamArg,
    cfg: Optional[SimulatorTestConfig] = None,
    formula_cfg: Optional[StatFormulaConfig] = None,
) -> pd.DataFrame:
    cfg = cfg or SimulatorTestConfig()
    formula_cfg = formula_cfg or StatFormulaConfig()

    hist = get_team_historical_for_sim(team=team, cfg=cfg, formula_cfg=formula_cfg)
    if hist.empty:
        return hist

    newest = hist.sort_values("kickoff_time").tail(1).copy().reset_index(drop=True)
    newest["predicted_xg_stat_bias_adjusted"] = (
        newest["predicted_xg_stat"] + newest["xg_error_avg_last20"]
    ).clip(lower=formula_cfg.prediction_min, upper=formula_cfg.prediction_max)
    newest["predicted_xg_stat_low"] = (
        newest["predicted_xg_stat_bias_adjusted"] - newest["xg_error_std_last20"]
    ).clip(lower=formula_cfg.prediction_min, upper=formula_cfg.prediction_max)
    newest["predicted_xg_stat_high"] = (
        newest["predicted_xg_stat_bias_adjusted"] + newest["xg_error_std_last20"]
    ).clip(lower=formula_cfg.prediction_min, upper=formula_cfg.prediction_max)
    return newest


def _build_configs_from_control(
    control_cfg: SimulationControlConfig,
) -> Tuple[SimulatorTestConfig, StatFormulaConfig, SimulatorTuningParams]:
    sim_cfg = SimulatorTestConfig(
        team_history_path=control_cfg.team_history_path,
        fixtures_path=control_cfg.fixtures_path,
        current_teams_path=control_cfg.current_teams_path,
        player_prediction_path=control_cfg.player_prediction_path,
        player_history_path=control_cfg.player_history_path,
        rolling_window=control_cfg.rolling_window,
        test_teams_output_path=control_cfg.test_teams_output_path,
        csv_float_format=control_cfg.csv_float_format,
        assist_credit_prob=control_cfg.assist_credit_prob,
    )
    formula_cfg = StatFormulaConfig(
        intercept=control_cfg.intercept,
        own_xg_coef=control_cfg.own_xg_coef,
        opp_xgc_coef=control_cfg.opp_xgc_coef,
        interaction_coef=control_cfg.interaction_coef,
        exp_scale=control_cfg.exp_scale,
        prediction_min=control_cfg.prediction_min,
        prediction_max=control_cfg.prediction_max,
    )
    tuning = SimulatorTuningParams(
        pass_scale=control_cfg.pass_scale,
        goal_scale=control_cfg.goal_scale,
        attack_base=control_cfg.attack_base,
        defence_base=control_cfg.defence_base,
    )
    return sim_cfg, formula_cfg, tuning


def _write_df(path: Path, df: pd.DataFrame, float_format: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, float_format=float_format)


def run_simulator_control(control_cfg: Optional[SimulationControlConfig] = None) -> Dict[str, Any]:
    """
    One control function where all configs and all CSV paths are set.
    Runs historical/upcoming (or both) simulation pipelines and writes outputs.
    """
    control_cfg = control_cfg or SimulationControlConfig()
    sim_cfg, formula_cfg, tuning = _build_configs_from_control(control_cfg)
    src = str(control_cfg.source).strip().lower()

    valid = {"historical", "history", "hist", "histo", "upcoming", "future", "new", "fut", "both"}
    if src not in valid:
        raise ValueError("source must be one of: historical/history/hist/histo, upcoming/future/new/fut, or both")

    outputs: Dict[str, Any] = {}

    if src in {"historical", "history", "hist", "histo", "both"}:
        base_hist = get_sim_data(
            source="historical",
            n_last=None,
            n_upcoming=control_cfg.n_upcoming,
            cfg=sim_cfg,
            formula_cfg=formula_cfg,
        )
        base_hist = team_attacks(base_hist, tuning=tuning)
        base_hist = team_defences(base_hist, tuning=tuning)
        if control_cfg.n_last is not None and control_cfg.n_last > 0:
            base_hist = (
                base_hist.sort_values(["code", "kickoff_time"])
                .groupby("code", as_index=False, group_keys=False)
                .tail(int(control_cfg.n_last))
                .reset_index(drop=True)
            )
        team_hist, player_hist = run_team_row_simulations(
            team_rows=base_hist,
            player_mode="histo",
            simulations_per_row=control_cfg.simulations_per_row,
            max_date_for_hist=control_cfg.max_date_for_hist,
            random_seed=control_cfg.random_seed,
            cfg=sim_cfg,
            tuning=tuning,
        )
        outputs["historical_base"] = base_hist
        outputs["historical_team_results"] = team_hist
        outputs["historical_player_outcomes"] = player_hist

        if control_cfg.write_outputs:
            _write_df(control_cfg.historical_team_results_output_path, team_hist, control_cfg.csv_float_format)
            _write_df(control_cfg.historical_player_results_output_path, player_hist, control_cfg.csv_float_format)

    if src in {"upcoming", "future", "new", "fut", "both"}:
        base_fut = get_sim_data(
            source="upcoming",
            n_last=control_cfg.n_last,
            n_upcoming=control_cfg.n_upcoming,
            cfg=sim_cfg,
            formula_cfg=formula_cfg,
        )
        base_fut = team_attacks(base_fut, tuning=tuning)
        base_fut = team_defences(base_fut, tuning=tuning)
        team_fut, player_fut = run_team_row_simulations(
            team_rows=base_fut,
            player_mode="new",
            simulations_per_row=control_cfg.simulations_per_row,
            max_date_for_hist=None,
            random_seed=control_cfg.random_seed,
            cfg=sim_cfg,
            tuning=tuning,
        )
        outputs["upcoming_base"] = base_fut
        outputs["upcoming_team_results"] = team_fut
        outputs["upcoming_player_outcomes"] = player_fut

        if control_cfg.write_outputs:
            _write_df(control_cfg.upcoming_team_results_output_path, team_fut, control_cfg.csv_float_format)
            _write_df(control_cfg.upcoming_player_results_output_path, player_fut, control_cfg.csv_float_format)

    outputs["control_cfg"] = control_cfg
    return outputs


def optimize_simulator_parameters(
    control_cfg: Optional[SimulationControlConfig] = None,
) -> Dict[str, pd.DataFrame]:
    """
    Grid-search optimization on historical MSE for requested tuning parameters.
    """
    control_cfg = control_cfg or SimulationControlConfig()
    sim_cfg, formula_cfg, _ = _build_configs_from_control(control_cfg)

    pass_grid = [0.77]
    goal_grid = [0.4]
    attack_grid = [round(float(x), 2) for x in np.arange(9.0, 10.5 + 1e-9, 0.1)]
    # User asked 0.38 -> 0.30 around 0.33; using 0.01 step to include 0.33.
    defence_grid = [round(float(x), 2) for x in np.arange(0.37, 0.30 - 1e-9, -0.01)]
    cap_actual_xg_min = 0.4
    cap_actual_xg_max = 3.2

    total = len(pass_grid) * len(goal_grid) * len(attack_grid) * len(defence_grid)
    rows = []
    idx = 0

    control_cfg.optimization_output_path.parent.mkdir(parents=True, exist_ok=True)
    # Start fresh for this run; snapshots will be appended during optimization.
    with open(control_cfg.optimization_output_path, "w", encoding="utf-8") as _f:
        _f.write("")
    snapshot_header_written = False

    for pass_scale in pass_grid:
        for goal_scale in goal_grid:
            for attack_base in attack_grid:
                for defence_base in defence_grid:
                    idx += 1
                    tuning = SimulatorTuningParams(
                        pass_scale=pass_scale,
                        goal_scale=goal_scale,
                        attack_base=attack_base,
                        defence_base=defence_base,
                    )
                    team_res = get_simulated_team_results(
                        source="historical",
                        n_last=control_cfg.optimization_n_last,
                        n_upcoming=control_cfg.n_upcoming,
                        simulations_per_row=control_cfg.optimization_simulations_per_row,
                        max_date_for_hist=control_cfg.max_date_for_hist,
                        random_seed=control_cfg.random_seed,
                        cfg=sim_cfg,
                        formula_cfg=formula_cfg,
                        tuning=tuning,
                    )
                    sim_xg = pd.to_numeric(team_res.get("sim_xg"), errors="coerce")
                    actual_xg = pd.to_numeric(team_res.get("actual_xg"), errors="coerce")
                    actual_xg_capped = actual_xg.clip(lower=cap_actual_xg_min, upper=cap_actual_xg_max)
                    mse = float(((actual_xg_capped - sim_xg) ** 2).dropna().mean())
                    rows.append(
                        {
                            "iter": idx,
                            "total_iters": total,
                            "pass_scale": pass_scale,
                            "goal_scale": goal_scale,
                            "attack_base": attack_base,
                            "defence_base": defence_base,
                            "actual_xg_cap_min": cap_actual_xg_min,
                            "actual_xg_cap_max": cap_actual_xg_max,
                            "historical_mse": mse,
                        }
                    )
                    if idx % 10 == 0 or idx == total:
                        snapshot_df = (
                            pd.DataFrame(rows)
                            .sort_values("historical_mse", ascending=True)
                            .reset_index(drop=True)
                        )
                        snapshot_df["rank"] = np.arange(1, len(snapshot_df) + 1)
                        snapshot_df["snapshot_iter"] = int(idx)
                        snapshot_df["snapshot_total_iters"] = int(total)
                        snapshot_df = snapshot_df[
                            ["snapshot_iter", "snapshot_total_iters", "rank"]
                            + [c for c in snapshot_df.columns if c not in {"snapshot_iter", "snapshot_total_iters", "rank"}]
                        ]
                        snapshot_df.to_csv(
                            control_cfg.optimization_output_path,
                            mode="a",
                            header=(not snapshot_header_written),
                            index=False,
                            float_format=control_cfg.csv_float_format,
                        )
                        snapshot_header_written = True
                        print(
                            f"[optimize] {idx}/{total} done. Latest MSE={mse:.6f}. "
                            f"Snapshot appended to {control_cfg.optimization_output_path}"
                        )

    search_df = pd.DataFrame(rows).sort_values("historical_mse", ascending=True).reset_index(drop=True)
    best_df = search_df.head(1).copy()

    best_df.to_csv(control_cfg.optimization_best_output_path, index=False, float_format=control_cfg.csv_float_format)

    return {"search": search_df, "best": best_df}


# Skeleton hooks for next modules you will provide.
def module_player_pool_skeleton(*args, **kwargs):
    raise NotImplementedError("Skeleton only - waiting for your next function spec.")


def module_simulation_engine_skeleton(*args, **kwargs):
    raise NotImplementedError("Skeleton only - waiting for your next function spec.")


def module_output_writer_skeleton(*args, **kwargs):
    raise NotImplementedError("Skeleton only - waiting for your next function spec.")


if __name__ == "__main__":
    # Toggle to run parameter optimization from main.
    RUN_PARAMETER_OPTIMIZATION = 0
    # Main run mode: "historical", "upcoming", or "both"

    control = SimulationControlConfig(
        source="upcoming",
        run_parameter_optimization=RUN_PARAMETER_OPTIMIZATION,
    )

    if RUN_PARAMETER_OPTIMIZATION == 1:
        control = SimulationControlConfig(
        source="both",
        run_parameter_optimization=RUN_PARAMETER_OPTIMIZATION,
        )
        opt = optimize_simulator_parameters(control)
        print("Best parameter row:")
        print(opt["best"].to_string(index=False))
    else:
        out = run_simulator_control(control)
        if "historical_team_results" in out:
            print(out["historical_team_results"].head(3).to_string(index=False))
        if "upcoming_team_results" in out:
            print(out["upcoming_team_results"].head(3).to_string(index=False))
