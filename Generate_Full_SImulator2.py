from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from collections import defaultdict

# =========================
# CONFIG
# =========================

MATCH_MINUTES = 90
N_SCENARIOS = 1000
EPS = 1e-9
_BETA_CACHE: Dict[str, np.ndarray] = {}
_ETA_FORMULA_CACHE: Dict[str, np.ndarray] = {}
ICT_MEASURE_MIN = 29.0
ICT_MEASURE_MAX = 162.0

# Hardcoded Poisson lambda formula coefficients.
LAMBDA_POISSON_INTERCEPT = -0.9830
LAMBDA_POISSON_OWN_OFF_COEF = 0.5209
LAMBDA_POISSON_OPP_DEF_COEF = 0.5805
LAMBDA_POISSON_INTERACTION_COEF = -0.1277
LAMBDA_POISSON_ICT_DIFF_COEF = 0.8811

# Bonus model settings (used only for top-3 bonus point allocation ranking).
# Values are BPS-like weights by position for in-match contributions.
POSITION_EVENT_BONUS = {
    "GK": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "DEF": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "MID": {"goal": 18.0, "assist": 9.0, "cs": 0.0},
    "FWD": {"goal": 24.0, "assist": 9.0, "cs": 0.0},
}


@dataclass(frozen=True)
class DataPaths:
    team_stats_candidates: Tuple[Path, ...] = (
        Path("team_stats.csv"),
        Path("Team_data_newest3.csv"),
        Path("Team_data_transformed2.csv"),
    )
    player_stats_candidates: Tuple[Path, ...] = (
        Path("player_stats.csv"),
        Path("Player_Prediction_set.csv"),
        Path("ML_training2.csv"),
    )
    fixtures_candidates: Tuple[Path, ...] = (
        Path("fixtures.csv"),
        Path("Fantasy_season_Fixtures_EXPANDED.csv"),
    )
    current_teams_path: Path = Path("Raw_Data_25/current_teams.csv")
    team_history_candidates: Tuple[Path, ...] = (
        Path("Team_data_transformed2.csv"),
        Path("Team_data_newest3.csv"),
        Path("Team_data_newest.csv"),
    )


class DataValidationError(ValueError):
    pass


def _first_existing(candidates: Iterable[Path], kind: str) -> Path:
    for p in candidates:
        if p.exists():
            return p
    raise DataValidationError(
        f"Fant ingen {kind}-fil. Sjekket: {[str(x) for x in candidates]}"
    )


def _pick_col(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    cols_lower = {str(c).lower(): c for c in df.columns}
    for cand in candidates:
        hit = cols_lower.get(cand.lower())
        if hit is not None:
            return hit
    return None


def _to_num(s: pd.Series, default: float = np.nan) -> pd.Series:
    out = pd.to_numeric(s, errors="coerce")
    if np.isnan(default):
        return out
    return out.fillna(default)


def _col_or_zero(df: pd.DataFrame, col: str) -> pd.Series:
    if col in df.columns:
        return _to_num(df[col], 0.0)
    return pd.Series(np.zeros(len(df), dtype=float), index=df.index)


def _normalize_minmax_01(s: pd.Series) -> pd.Series:
    x = _to_num(s, np.nan)
    mn = x.min(skipna=True)
    mx = x.max(skipna=True)
    if not np.isfinite(mn) or not np.isfinite(mx) or mx <= mn:
        return pd.Series(np.zeros(len(x), dtype=float), index=x.index)
    return ((x - mn) / (mx - mn)).clip(lower=0.0, upper=1.0)


def _parse_bool(v) -> bool:
    s = str(v).strip().lower()
    if s in {"1", "true", "yes"}:
        return True
    if s in {"0", "false", "no"}:
        return False
    return False


def _normalize_position(v) -> str:
    s = str(v).strip().upper()
    if s in {"1", "GK", "GKP", "GOALKEEPER"}:
        return "GK"
    if s in {"2", "DEF", "D", "DEFENDER"}:
        return "DEF"
    if s in {"3", "MID", "M", "MIDFIELDER"}:
        return "MID"
    if s in {"4", "FWD", "FW", "ST", "STRIKER", "FORWARD"}:
        return "FWD"
    return "MID"


def _pos_bonus(pos: str, event: str) -> float:
    p = _normalize_position(pos)
    return float(POSITION_EVENT_BONUS.get(p, POSITION_EVENT_BONUS["MID"]).get(event, 0.0))


def _validate_required(df: pd.DataFrame, required: List[str], filename: str) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise DataValidationError(
            f"Mangler kolonner i {filename}: {missing}. "
            f"Gi meg riktig fil/kolonner eller historisk datagrunnlag."
        )


def _load_team_stats(path: Path) -> pd.DataFrame:
    teams = pd.read_csv(path)

    if path.name.lower() == "team_stats.csv":
        _validate_required(
            teams,
            ["team_id", "attack_rating", "defence_rating", "elo_rating"],
            path.name,
        )
        out = teams[["team_id", "attack_rating", "defence_rating", "elo_rating"]].copy()
        out["team_id"] = _to_num(out["team_id"]).astype("Int64")
        out["attack_rating"] = _to_num(out["attack_rating"])
        out["defence_rating"] = _to_num(out["defence_rating"])
        out["elo_rating"] = _to_num(out["elo_rating"])
        out["attack_rating_home"] = out["attack_rating"]
        out["attack_rating_away"] = out["attack_rating"]
        out["defence_rating_home"] = out["defence_rating"]
        out["defence_rating_away"] = out["defence_rating"]
        # Optional context columns for direct xG lambda expression.
        opt_cols = [
            "xgh", "xga", "xg_avg", "xgch", "xgca", "xgc_avg",
            "xg_pred_rolling_error", "xgc_pred_rolling_error",
            "rolling_ict_index", "rolling_ict_against",
        ]
        for c in opt_cols:
            if c == "rolling_ict_index":
                src = _pick_col(teams, ["rolling_ict_index", "Rolling_ict_index", "Rolling_ICT_Index"])
            elif c == "rolling_ict_against":
                src = _pick_col(teams, ["rolling_ict_against", "Rolling_ICT_Against", "Rolling_ict_against"])
            else:
                src = _pick_col(teams, [c, c.upper(), c.capitalize()])
            out[c] = _to_num(teams[src], np.nan) if src is not None else np.nan
        return out.dropna(subset=["team_id", "attack_rating", "defence_rating"]).reset_index(drop=True)

    team_id_col = _pick_col(teams, ["code", "team_id", "team_code", "id"])
    xg_avg_col = _pick_col(teams, ["xg_avg"])
    xgc_avg_col = _pick_col(teams, ["xgc_avg"])
    xgh_col = _pick_col(teams, ["xgh"])
    xga_col = _pick_col(teams, ["xga"])
    xgch_col = _pick_col(teams, ["xgch"])
    xgca_col = _pick_col(teams, ["xgca"])
    elo_col = _pick_col(teams, ["elo_rating", "elo"])

    missing = []
    if team_id_col is None:
        missing.append("team id (code/team_id/team_code/id)")
    if xg_avg_col is None:
        missing.append("XG_avg")
    if xgc_avg_col is None:
        missing.append("XGC_avg")
    if xgh_col is None:
        missing.append("XGH")
    if xga_col is None:
        missing.append("XGA")
    if xgch_col is None:
        missing.append("XGCH")
    if xgca_col is None:
        missing.append("XGCA")
    if missing:
        raise DataValidationError(
            f"Mangler historisk team-grunnlag i {path.name}: {missing}. "
            "Gi meg fil/kolonner med disse feltene."
        )

    out = teams.copy()
    kickoff_col = _pick_col(out, ["kickoff_time", "date", "kickoff_date"])
    if kickoff_col is not None:
        out[kickoff_col] = pd.to_datetime(out[kickoff_col], errors="coerce", utc=True)
        out = out.sort_values([team_id_col, kickoff_col], na_position="last")
    out = out.groupby(team_id_col, as_index=False).tail(1).reset_index(drop=True)

    # Requested logic:
    # attack = 0.7*XG_avg + 0.3*(XGH if home else XGA)
    # defence = 0.7*XGC_avg + 0.3*(XGCH if home else XGCA)
    xg_avg = _to_num(out[xg_avg_col], 0.0)
    xgc_avg = _to_num(out[xgc_avg_col], 0.0)
    xgh = _to_num(out[xgh_col], 0.0)
    xga = _to_num(out[xga_col], 0.0)
    xgch = _to_num(out[xgch_col], 0.0)
    xgca = _to_num(out[xgca_col], 0.0)

    attack_home_raw = 0.4 * xg_avg + 0.6 * xgh
    attack_away_raw = 0.4 * xg_avg + 0.6 * xga
    defence_home_raw = 0.4 * xgc_avg + 0.6 * xgch
    defence_away_raw = 0.4 * xgc_avg + 0.6 * xgca

    attack_ref = float(pd.concat([attack_home_raw, attack_away_raw], axis=0).mean())
    defence_ref = float(pd.concat([defence_home_raw, defence_away_raw], axis=0).mean())
    if not np.isfinite(attack_ref) or attack_ref <= 0:
        raise DataValidationError(f"Kan ikke beregne attack_rating fra {path.name} (XG_avg/XGH/XGA)")
    if not np.isfinite(defence_ref) or defence_ref <= 0:
        raise DataValidationError(f"Kan ikke beregne defence_rating fra {path.name} (XGC_avg/XGCH/XGCA)")

    mapped = pd.DataFrame(
        {
            "team_id": _to_num(out[team_id_col]).astype("Int64"),
            "attack_rating_home": (attack_home_raw / attack_ref).clip(lower=0.65, upper=2.5),
            "attack_rating_away": (attack_away_raw / attack_ref).clip(lower=0.65, upper=2.5),
            "defence_rating_home": (defence_home_raw / defence_ref).clip(lower=0.6, upper=2.2),
            "defence_rating_away": (defence_away_raw / defence_ref).clip(lower=0.6, upper=2.2),
            "elo_rating": _to_num(out[elo_col], default=1500.0) if elo_col else 1500.0,
            "xgh": _to_num(out[xgh_col], np.nan),
            "xga": _to_num(out[xga_col], np.nan),
            "xg_avg": _to_num(out[xg_avg_col], np.nan),
            "xgch": _to_num(out[xgch_col], np.nan),
            "xgca": _to_num(out[xgca_col], np.nan),
            "xgc_avg": _to_num(out[xgc_avg_col], np.nan),
            "xg_pred_rolling_error": _to_num(out[_pick_col(out, ["xg_pred_rolling_error"])], 0.0) if _pick_col(out, ["xg_pred_rolling_error"]) is not None else 0.0,
            "xgc_pred_rolling_error": _to_num(out[_pick_col(out, ["xgc_pred_rolling_error"])], 0.0) if _pick_col(out, ["xgc_pred_rolling_error"]) is not None else 0.0,
            "rolling_ict_index": _to_num(out[_pick_col(out, ["rolling_ict_index", "Rolling_ict_index", "Rolling_ICT_Index"])], np.nan)
            if _pick_col(out, ["rolling_ict_index", "Rolling_ict_index", "Rolling_ICT_Index"]) is not None
            else np.nan,
            "rolling_ict_against": _to_num(out[_pick_col(out, ["rolling_ict_against", "Rolling_ICT_Against", "Rolling_ict_against"])], np.nan)
            if _pick_col(out, ["rolling_ict_against", "Rolling_ICT_Against", "Rolling_ict_against"]) is not None
            else np.nan,
        }
    )
    mapped["attack_rating"] = (mapped["attack_rating_home"] + mapped["attack_rating_away"]) / 2.0
    mapped["defence_rating"] = (mapped["defence_rating_home"] + mapped["defence_rating_away"]) / 2.0

    return mapped.dropna(subset=["team_id", "attack_rating", "defence_rating"]).drop_duplicates("team_id").reset_index(drop=True)


def _load_player_stats(path: Path) -> pd.DataFrame:
    players = pd.read_csv(path)

    if path.name.lower() == "player_stats.csv":
        _validate_required(
            players,
            ["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes"],
            path.name,
        )
        out = players.copy()
        out["player_id"] = _to_num(out["player_id"]).astype("Int64")
        out["team_id"] = _to_num(out["team_id"]).astype("Int64")
        out["goal_index"] = _to_num(out["goal_index"], 0.0).clip(lower=0.0)
        out["assist_index"] = _to_num(out["assist_index"], 0.0).clip(lower=0.0)
        out["adjusted_minutes"] = _to_num(out["adjusted_minutes"], 0.0).clip(lower=0, upper=90)
        out["name"] = out["player_id"].astype(str)
        out["kickoff_time"] = pd.NaT
        out["_team_code"] = out["team_id"].astype("Int64")
        out["_source_mode"] = "simple"
        pos_col_simple = _pick_col(out, ["position", "element_type", "gamepos", "pos"])
        out["position"] = out[pos_col_simple].map(_normalize_position) if pos_col_simple is not None else "MID"
        out["Rolling_adjusted_BPS"] = _to_num(out[_pick_col(out, ["Rolling_adjusted_BPS", "rolling_adjusted_bps"])], 0.0) if _pick_col(out, ["Rolling_adjusted_BPS", "rolling_adjusted_bps"]) is not None else 0.0
        out["Rolling_adjusted_BPS_2"] = _to_num(out[_pick_col(out, ["Rolling_adjusted_BPS_2", "rolling_adjusted_bps_2"])], 0.0) if _pick_col(out, ["Rolling_adjusted_BPS_2", "rolling_adjusted_bps_2"]) is not None else 0.0
        out["pred_minutes"] = out["adjusted_minutes"]
        return out.reset_index(drop=True)

    player_id_col = _pick_col(players, ["player_id", "player_code", "element", "id"])
    team_col = _pick_col(players, ["team_id", "team", "team_code", "code"])
    name_col = _pick_col(players, ["name", "player_name"])

    missing = []
    if team_col is None:
        missing.append("team_id/Team/team_code")
    if missing:
        raise DataValidationError(
            f"Mangler spillerkolonner i {path.name}: {missing}. "
            "Gi meg historiske spillerdata med disse feltene."
        )

    out = players.copy()
    kick_col = _pick_col(out, ["kickoff_time", "date"])
    if kick_col is not None:
        out[kick_col] = pd.to_datetime(out[kick_col], errors="coerce", utc=True)
        sort_cols = [c for c in [team_col, name_col, player_id_col, kick_col] if c is not None]
        out = out.sort_values(sort_cols, na_position="last")

    if player_id_col is None:
        if name_col is None:
            raise DataValidationError(
                f"Mangler baade player_id og navn i {path.name}; kan ikke bygge stabile player_id."
            )
        key = out[name_col].astype(str) + "_" + _to_num(out[team_col], default=-1).astype(str)
        out["__player_id"] = pd.factorize(key)[0] + 1
        player_id_col = "__player_id"

    out["player_id"] = _to_num(out[player_id_col]).astype("Int64")
    out["team_id"] = _to_num(out[team_col]).astype("Int64")
    out["name"] = out[name_col].astype(str) if name_col is not None else out["player_id"].astype(str)
    out["_team_code"] = out["team_id"].astype("Int64")
    pos_col = _pick_col(out, ["position", "element_type", "gamepos", "pos"])
    out["position"] = out[pos_col].map(_normalize_position) if pos_col is not None else "MID"

    has_new = all(
        c in out.columns
        for c in [
            "Goal_Statistics_share",
            "Assist_Statistics_share",
            "average_minutes",
        ]
    )
    has_histo = all(
        c in out.columns
        for c in [
            "Goal_Statistics",
            "Assist_Statistics",
            "minutes",
        ]
    )
    if has_new:
        out["_source_mode"] = "new"
    elif has_histo:
        out["_source_mode"] = "histo"
    else:
        out["_source_mode"] = "simple"
        out["goal_index"] = _col_or_zero(out, "Goal_Index")
        out["assist_index"] = _col_or_zero(out, "Assist_Index")
        minute_col = _pick_col(out, ["average_minutes", "minutes"])
        if minute_col is not None:
            out["adjusted_minutes"] = _to_num(out[minute_col], 0.0).clip(lower=0.0, upper=90.0)
        else:
            out["adjusted_minutes"] = 0.0

    bps1_col = _pick_col(out, ["Rolling_adjusted_BPS", "rolling_adjusted_bps"])
    bps2_col = _pick_col(out, ["Rolling_adjusted_BPS_2", "rolling_adjusted_bps_2"])
    out["Rolling_adjusted_BPS"] = _to_num(out[bps1_col], 0.0) if bps1_col is not None else 0.0
    out["Rolling_adjusted_BPS_2"] = _to_num(out[bps2_col], 0.0) if bps2_col is not None else 0.0
    pred_minutes_col = _pick_col(out, ["pred_minutes", "Pred_minutes"])
    if pred_minutes_col is not None:
        out["pred_minutes"] = _to_num(out[pred_minutes_col], 0.0).clip(lower=0.0, upper=120.0)
    else:
        minute_col = _pick_col(out, ["average_minutes", "adjusted_minutes", "minutes"])
        if minute_col is not None:
            out["pred_minutes"] = _to_num(out[minute_col], 0.0).clip(lower=0.0, upper=120.0)
        else:
            out["pred_minutes"] = 0.0

    return out.reset_index(drop=True)


def _build_player_pool_from_loaded(
    player_df: pd.DataFrame,
    team_code: int,
    mode_norm: str,
    max_date: Optional[pd.Timestamp] = None,
) -> pd.DataFrame:
    pool = player_df[player_df["_team_code"] == int(team_code)].copy()
    if mode_norm == "histo" and max_date is not None and "kickoff_time" in pool.columns:
        mx = pd.to_datetime(max_date, errors="coerce", utc=True)
        if pd.notna(mx):
            pool = pool[pd.to_datetime(pool["kickoff_time"], errors="coerce", utc=True) <= mx].copy()

    sort_cols = [c for c in ["name", "kickoff_time"] if c in pool.columns]
    if sort_cols:
        pool = pool.sort_values(sort_cols, na_position="last")
    if "name" in pool.columns:
        pool = pool.groupby("name", as_index=False, group_keys=False).tail(1).reset_index(drop=True)
    elif "player_id" in pool.columns:
        pool = pool.groupby("player_id", as_index=False, group_keys=False).tail(1).reset_index(drop=True)

    if mode_norm == "histo":
        risk_adj_minutes_factor = np.minimum(1.0, (_col_or_zero(pool, "minutes") + 0.01) / 90.0)
        pool["risk_adj_minutes_factor"] = risk_adj_minutes_factor
        pool["XG_Index"] = (
            _col_or_zero(pool, "Goal_Statistics") * 0.4
            + _col_or_zero(pool, "Share_of_XG") * 0.4
            + _col_or_zero(pool, "Share_of_XG_Short") * 0.2
        )
        pool["XG_Index"] = pool["XG_Index"] * risk_adj_minutes_factor
        pool["XA_Index"] = (
            _col_or_zero(pool, "Assist_Statistics") * 0.4
            + _col_or_zero(pool, "Share_of_XA") * 0.4
            + _col_or_zero(pool, "Share_of_XA_Short") * 0.2
        )
        pool["XA_Index"] = pool["XA_Index"] * risk_adj_minutes_factor
        pool["adjusted_minutes"] = _col_or_zero(pool, "minutes").clip(lower=0.0, upper=90.0)
    elif mode_norm == "new":
        risk_adj_minutes_factor = np.minimum(1.0, (_col_or_zero(pool, "average_minutes") + 0.01) / 90.0)
        pool["risk_adj_minutes_factor"] = risk_adj_minutes_factor
        pool["XG_Index"] = (
            _col_or_zero(pool, "Goal_Statistics_share") * 0.3
            + _col_or_zero(pool, "Rolling_adjusted_Threat_per90_share") * 0.2
            + _col_or_zero(pool, "Rolling_adjusted_XG") * 0.1 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Big_Chances") * 0.1 * 0.33 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Share_of_XG") * 0.3 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Share_of_XG_Short") * 0.0 * risk_adj_minutes_factor
        )
        pool["XG_Index"] = pool["XG_Index"] * 0.7 + 0.3 * _col_or_zero(pool, "Opp_Goal_Threat_Pos") * risk_adj_minutes_factor
        pool["XA_Index"] = (
            _col_or_zero(pool, "Assist_Statistics_share") * 0.4
            + _col_or_zero(pool, "Rolling_adjusted_XA") * 0.1 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Big_Chances_Created") * 0.5 * 0.2 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Share_of_XA") * 0.2 * risk_adj_minutes_factor
            + _col_or_zero(pool, "Share_of_XA_Short") * 0.1 * risk_adj_minutes_factor
        )
        pool["XA_Index"] = pool["XA_Index"] * 0.7 + 0.3 * _col_or_zero(pool, "Opp_Assist_Threat_Pos") * risk_adj_minutes_factor
        pool["adjusted_minutes"] = _col_or_zero(pool, "average_minutes").clip(lower=0.0, upper=90.0)
    else:
        pool["risk_adj_minutes_factor"] = np.minimum(1.0, (_col_or_zero(pool, "adjusted_minutes") + 0.01) / 90.0)
        pool["XG_Index"] = _col_or_zero(pool, "goal_index").clip(lower=0.0)
        pool["XA_Index"] = _col_or_zero(pool, "assist_index").clip(lower=0.0)
        pool["adjusted_minutes"] = _col_or_zero(pool, "adjusted_minutes").clip(lower=0.0, upper=90.0)

    # Requested goal-index formula:
    # Goal_Statistics*0.3 + Share_of_XG*0.15 + Share_of_XG_Short*0.1
    # + Understat_POSXG_Share*0.3 + Opp_Goal_Threat_Pos*0.15
    goal_stats = _col_or_zero(pool, "Goal_Statistics")
    goal_stats_share = _col_or_zero(pool, "Goal_Statistics_share")
    goal_stats_use = goal_stats.where(goal_stats.abs() > EPS, goal_stats_share)

    pool["opp_goal_threat_pos"] = _col_or_zero(pool, "Opp_Goal_Threat_Pos")
    pool["opp_assist_threat_pos"] = _col_or_zero(pool, "Opp_Assist_Threat_Pos")
    pool["understat_posxg_share"] = _col_or_zero(pool, "Understat_POSXG_Share")
    pool["understat_posxa_share"] = _col_or_zero(pool, "Understat_POSXA_Share")
    assist_stats = _col_or_zero(pool, "Assist_Statistics")
    assist_stats_share = _col_or_zero(pool, "Assist_Statistics_share")
    assist_stats_use = assist_stats.where(assist_stats.abs() > EPS, assist_stats_share)

    pool["xa_index_base"] = (
        assist_stats_use * 0.3
        + _col_or_zero(pool, "Share_of_XA") * 0.15
        + _col_or_zero(pool, "Share_of_XA_Short") * 0.1
        + pool["understat_posxa_share"] * 0.3
    )
    pool["xg_index_base"] = (
        goal_stats_use * 0.3
        + _col_or_zero(pool, "Share_of_XG") * 0.15
        + _col_or_zero(pool, "Share_of_XG_Short") * 0.1
        + pool["understat_posxg_share"] * 0.3
    )

    pool["XG_Index"] = (
        pool["xg_index_base"]
        + pool["opp_goal_threat_pos"] * 0.15
    )
    pool["XA_Index"] = (
        pool["xa_index_base"]
        + pool["opp_assist_threat_pos"] * 0.15
    )

    pool["goal_index"] = _to_num(pool["XG_Index"], 0.0).clip(lower=0.0)
    pool["assist_index"] = _to_num(pool["XA_Index"], 0.0).clip(lower=0.0)
    if "pred_minutes" in pool.columns:
        pool["pred_minutes"] = _to_num(pool["pred_minutes"], 0.0).clip(lower=0.0, upper=120.0)
    else:
        if "average_minutes" in pool.columns:
            pool["pred_minutes"] = _to_num(pool["average_minutes"], 0.0).clip(lower=0.0, upper=120.0)
        else:
            pool["pred_minutes"] = _to_num(pool["adjusted_minutes"], 0.0).clip(lower=0.0, upper=120.0)
    if "position" in pool.columns:
        pool["position"] = pool["position"].map(_normalize_position)
    else:
        pool["position"] = "MID"
    pool["Rolling_adjusted_BPS"] = _col_or_zero(pool, "Rolling_adjusted_BPS")
    pool["Rolling_adjusted_BPS_2"] = _col_or_zero(pool, "Rolling_adjusted_BPS_2")
    pool["team_id"] = _to_num(pool["_team_code"]).astype("Int64")
    pool["player_id"] = _to_num(pool["player_id"]).astype("Int64")
    return pool

def _load_fixtures(path: Path, current_teams_path: Path) -> pd.DataFrame:
    fixtures = pd.read_csv(path)

    if path.name.lower() == "fixtures.csv":
        _validate_required(
            fixtures,
            ["match_id", "gameweek", "home_team_id", "away_team_id"],
            path.name,
        )
        out = fixtures[["match_id", "gameweek", "home_team_id", "away_team_id"]].copy()
        out["match_id"] = _to_num(out["match_id"]).astype("Int64")
        out["fixture_code"] = out["match_id"].astype("Int64")
        out["gameweek"] = _to_num(out["gameweek"]).astype("Int64")
        out["home_team_id"] = _to_num(out["home_team_id"]).astype("Int64")
        out["away_team_id"] = _to_num(out["away_team_id"]).astype("Int64")
        out["kickoff_time"] = pd.NaT
        return out.dropna(subset=["match_id", "home_team_id", "away_team_id"]).reset_index(drop=True)

    match_col = _pick_col(fixtures, ["id", "match_id", "code"])
    fixture_code_col = _pick_col(fixtures, ["code", "fixture_code"])
    gw_col = _pick_col(fixtures, ["event", "gameweek", "gw"])
    home_col = _pick_col(fixtures, ["team_h", "home_team_id", "home_team"])
    away_col = _pick_col(fixtures, ["team_a", "away_team_id", "away_team"])
    finished_col = _pick_col(fixtures, ["finished"])
    kickoff_col = _pick_col(fixtures, ["kickoff_time", "date"])

    missing = []
    if gw_col is None:
        missing.append("event/gameweek")
    if home_col is None:
        missing.append("team_h/home_team_id")
    if away_col is None:
        missing.append("team_a/away_team_id")
    if missing:
        raise DataValidationError(
            f"Mangler fixture-kolonner i {path.name}: {missing}. "
            "Gi meg riktig fixture-fil med hjemmelag/bortelag/GW."
        )

    out = fixtures.copy()
    out["__match_id"] = _to_num(out[match_col]).astype("Int64") if match_col else pd.Series(np.arange(1, len(out) + 1), dtype="Int64")
    out["__fixture_code"] = _to_num(out[fixture_code_col]).astype("Int64") if fixture_code_col else out["__match_id"]
    out["__gameweek"] = _to_num(out[gw_col]).astype("Int64")
    out["__home_raw"] = _to_num(out[home_col]).astype("Int64")
    out["__away_raw"] = _to_num(out[away_col]).astype("Int64")
    out["__kickoff"] = pd.to_datetime(out[kickoff_col], errors="coerce", utc=True) if kickoff_col else pd.NaT

    out["finished_bool"] = out[finished_col].map(_parse_bool) if finished_col else False

    # Try to map fixture team ids (id) -> team code used by team/player tables.
    mapped_home = out["__home_raw"].copy()
    mapped_away = out["__away_raw"].copy()
    if current_teams_path.exists():
        teams = pd.read_csv(current_teams_path)
        id_col = _pick_col(teams, ["id"])
        code_col = _pick_col(teams, ["code"])
        if id_col and code_col:
            teams[id_col] = _to_num(teams[id_col]).astype("Int64")
            teams[code_col] = _to_num(teams[code_col]).astype("Int64")
            id_to_code = dict(zip(teams[id_col], teams[code_col]))
            h2 = out["__home_raw"].map(id_to_code)
            a2 = out["__away_raw"].map(id_to_code)
            if h2.notna().mean() > 0.8 and a2.notna().mean() > 0.8:
                mapped_home = h2.astype("Int64")
                mapped_away = a2.astype("Int64")

    result = pd.DataFrame(
        {
            "match_id": out["__match_id"],
            "fixture_code": out["__fixture_code"],
            "gameweek": out["__gameweek"],
            "home_team_id": mapped_home,
            "away_team_id": mapped_away,
            "finished_bool": out["finished_bool"],
            "kickoff_time": out["__kickoff"],
        }
    )

    result = result.dropna(subset=["match_id", "gameweek", "home_team_id", "away_team_id"])
    result = result.drop_duplicates(subset=["match_id", "gameweek", "home_team_id", "away_team_id"], keep="last")
    return result.reset_index(drop=True)


# =========================
# LOAD DATA
# =========================

def load_data(paths: Optional[DataPaths] = None, include_finished: bool = False):
    paths = paths or DataPaths()
    team_path = _first_existing(paths.team_stats_candidates, "team_stats")
    player_path = _first_existing(paths.player_stats_candidates, "player_stats")
    fixtures_path = _first_existing(paths.fixtures_candidates, "fixtures")

    teams = _load_team_stats(team_path)
    players = _load_player_stats(player_path)
    fixtures = _load_fixtures(fixtures_path, paths.current_teams_path)

    if not include_finished and "finished_bool" in fixtures.columns:
        fixtures = fixtures[~fixtures["finished_bool"]].copy()

    required_team_ids = set(pd.unique(fixtures[["home_team_id", "away_team_id"]].to_numpy().ravel()))
    present_team_ids = set(teams["team_id"].dropna().astype(int).tolist())
    missing_team_ids = sorted(int(x) for x in required_team_ids if pd.notna(x) and int(x) not in present_team_ids)
    if missing_team_ids:
        raise DataValidationError(
            f"Mangler team_stats for team_id: {missing_team_ids}. "
            "Trenger historisk teamdata for disse lagene."
        )

    lambda_needed = [
        "xgh",
        "xga",
        "xg_avg",
        "xgch",
        "xgca",
        "xgc_avg",
        "xg_pred_rolling_error",
        "xgc_pred_rolling_error",
    ]
    missing_lambda_cols = [c for c in lambda_needed if c not in teams.columns]
    if missing_lambda_cols:
        raise DataValidationError(
            f"Mangler team-kolonner for lambda-uttrykket: {missing_lambda_cols}. "
            "Gi teamdata med disse historiske feltene."
        )

    # Red card ICT feature:
    # Own_ICT_Measure = Rolling_ict_index + (100 - Rolling_ICT_Against)
    rolling_ict = _to_num(teams.get("rolling_ict_index", pd.Series(np.nan, index=teams.index)), np.nan)
    rolling_ict_against = _to_num(teams.get("rolling_ict_against", pd.Series(np.nan, index=teams.index)), np.nan)
    teams["ict_measure_raw"] = rolling_ict + (100.0 - rolling_ict_against)
    teams["ict_measure_norm"] = (
        (teams["ict_measure_raw"] - ICT_MEASURE_MIN) / (ICT_MEASURE_MAX - ICT_MEASURE_MIN)
    ).clip(lower=0.0, upper=1.0)

    return teams.reset_index(drop=True), players.reset_index(drop=True), fixtures.reset_index(drop=True)


def _team_row_for_side(team_row: pd.Series, is_home: bool) -> pd.Series:
    out = team_row.copy()
    if is_home:
        out["attack_rating"] = float(team_row.get("attack_rating_home", team_row.get("attack_rating", 1.0)))
        out["defence_rating"] = float(team_row.get("defence_rating_home", team_row.get("defence_rating", 1.0)))
    else:
        out["attack_rating"] = float(team_row.get("attack_rating_away", team_row.get("attack_rating", 1.0)))
        out["defence_rating"] = float(team_row.get("defence_rating_away", team_row.get("defence_rating", 1.0)))
    return out


def _resolve_player_mode(player_df: pd.DataFrame, include_finished_fixtures: bool) -> str:
    if "_source_mode" in player_df.columns and not player_df.empty:
        mode = str(player_df["_source_mode"].iloc[0]).strip().lower()
        if mode in {"new", "histo", "simple"}:
            return mode
    return "histo" if include_finished_fixtures else "new"


def _parse_was_home_series(s: pd.Series) -> pd.Series:
    return s.map(_parse_bool).astype(bool)


def _build_beta_training_frame(paths: DataPaths) -> pd.DataFrame:
    hist_path = _first_existing(paths.team_history_candidates, "team_history")
    df = pd.read_csv(hist_path)

    code_col = _pick_col(df, ["code", "team_code", "team_id"])
    opp_col = _pick_col(df, ["opponent", "opponent_code", "opp_code"])
    was_home_col = _pick_col(df, ["was_home", "was_home_bool"])
    kickoff_col = _pick_col(df, ["kickoff_time", "date", "kickoff_date"])
    xg_avg_col = _pick_col(df, ["xg_avg"])
    xgc_avg_col = _pick_col(df, ["xgc_avg"])
    xgh_col = _pick_col(df, ["xgh"])
    xga_col = _pick_col(df, ["xga"])
    xgch_col = _pick_col(df, ["xgch"])
    xgca_col = _pick_col(df, ["xgca"])
    elo_col = _pick_col(df, ["elo_rating", "elo"])
    xg_col = _pick_col(df, ["xg"])
    xgc_col = _pick_col(df, ["xgc"])

    missing = []
    if code_col is None:
        missing.append("code/team_code")
    if opp_col is None:
        missing.append("opponent")
    if was_home_col is None:
        missing.append("was_home")
    if kickoff_col is None:
        missing.append("kickoff_time/date")
    if xg_avg_col is None:
        missing.append("XG_avg")
    if xgc_avg_col is None:
        missing.append("XGC_avg")
    if xgh_col is None:
        missing.append("XGH")
    if xga_col is None:
        missing.append("XGA")
    if xgch_col is None:
        missing.append("XGCH")
    if xgca_col is None:
        missing.append("XGCA")
    if elo_col is None:
        missing.append("Elo_Rating")
    if xg_col is None:
        missing.append("XG")
    if xgc_col is None:
        missing.append("XGC")
    if missing:
        raise DataValidationError(
            f"Mangler historiske kolonner for beta-estimering i {hist_path.name}: {missing}"
        )

    h = df.copy()
    h["team_id"] = _to_num(h[code_col]).astype("Int64")
    h["opponent_id"] = _to_num(h[opp_col]).astype("Int64")
    h["kickoff_time"] = pd.to_datetime(h[kickoff_col], errors="coerce", utc=True)
    h["was_home_bool"] = _parse_was_home_series(h[was_home_col])
    h["xg_avg"] = _to_num(h[xg_avg_col], 0.0)
    h["xgc_avg"] = _to_num(h[xgc_avg_col], 0.0)
    h["xgh"] = _to_num(h[xgh_col], 0.0)
    h["xga"] = _to_num(h[xga_col], 0.0)
    h["xgch"] = _to_num(h[xgch_col], 0.0)
    h["xgca"] = _to_num(h[xgca_col], 0.0)
    h["elo"] = _to_num(h[elo_col], 1500.0)
    h["xg_obs"] = _to_num(h[xg_col], np.nan)
    h["xgc_obs"] = _to_num(h[xgc_col], np.nan)

    h = h.dropna(subset=["team_id", "opponent_id", "kickoff_time", "xg_obs"]).copy()
    h = h.sort_values(["team_id", "kickoff_time", "opponent_id"]).drop_duplicates(
        subset=["team_id", "opponent_id", "kickoff_time"], keep="last"
    )

    attack_raw = np.where(h["was_home_bool"], 0.4 * h["xg_avg"] + 0.6 * h["xgh"], 0.4 * h["xg_avg"] + 0.6 * h["xga"])
    defence_raw = np.where(h["was_home_bool"], 0.4 * h["xgc_avg"] + 0.6 * h["xgch"], 0.4 * h["xgc_avg"] + 0.6 * h["xgca"])
    attack_ref = float(np.mean(attack_raw))
    defence_ref = float(np.mean(defence_raw))
    if not np.isfinite(attack_ref) or attack_ref <= 0:
        raise DataValidationError("Kan ikke beregne attack_ref for beta-estimering.")
    if not np.isfinite(defence_ref) or defence_ref <= 0:
        raise DataValidationError("Kan ikke beregne defence_ref for beta-estimering.")

    h["attack_rating"] = np.clip(attack_raw / attack_ref, 0.65, 2.5)
    h["defence_rating"] = np.clip(defence_raw / defence_ref, 0.6, 2.2)

    opp = h[["team_id", "opponent_id", "kickoff_time", "defence_rating", "elo", "xgc_obs"]].rename(
        columns={
            "team_id": "opp_team_id",
            "opponent_id": "opp_opponent_id",
            "defence_rating": "defence_opp",
            "elo": "elo_opp",
            "xgc_obs": "xgc_opp_obs",
        }
    )
    m = h.merge(
        opp,
        left_on=["team_id", "opponent_id", "kickoff_time"],
        right_on=["opp_opponent_id", "opp_team_id", "kickoff_time"],
        how="left",
    )

    m["defence_opp"] = _to_num(m["defence_opp"], np.nan)
    m["elo_diff"] = _to_num(m["elo"], 1500.0) - _to_num(m["elo_opp"], 1500.0)
    m["xg_obs"] = _to_num(m["xg_obs"], np.nan)
    m["xgc_obs"] = _to_num(m["xgc_obs"], np.nan)
    m["xgc_opp_obs"] = _to_num(m["xgc_opp_obs"], np.nan)
    # Use XG and opposition XGC as predictor columns (instead of goals_scored columns).
    m["xg_pred_col"] = m["xg_obs"].clip(lower=0.0, upper=10.0)
    m["xgc_pred_col"] = m["xgc_opp_obs"].fillna(m["xgc_obs"]).clip(lower=0.0, upper=10.0)
    m["xg_target"] = m["xg_obs"].clip(lower=0.0, upper=10.0)
    m = m.dropna(subset=["xg_pred_col", "xgc_pred_col", "elo_diff", "xg_target"])
    return m


def _fit_poisson_irls(X: np.ndarray, y: np.ndarray, ridge: float = 1e-6, max_iter: int = 100, tol: float = 1e-8) -> np.ndarray:
    n, p = X.shape
    beta = np.zeros(p, dtype=float)
    beta[0] = float(np.log(max(float(np.mean(y)), 1e-3)))

    I = np.eye(p, dtype=float)
    I[0, 0] = 0.0

    for _ in range(max_iter):
        eta = np.clip(X @ beta, -20.0, 20.0)
        mu = np.exp(eta)
        mu = np.clip(mu, 1e-8, 1e8)
        z = eta + (y - mu) / mu
        W = mu

        XtW = X.T * W
        A = XtW @ X + ridge * I
        b = XtW @ z
        try:
            beta_new = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            beta_new = np.linalg.lstsq(A, b, rcond=None)[0]

        if float(np.max(np.abs(beta_new - beta))) < tol:
            beta = beta_new
            break
        beta = beta_new

    return beta


def estimate_beta_from_history(paths: Optional[DataPaths] = None) -> np.ndarray:
    paths = paths or DataPaths()
    cache_key = "|".join(str(p) for p in paths.team_history_candidates)
    if cache_key in _BETA_CACHE:
        return _BETA_CACHE[cache_key].copy()

    train = _build_beta_training_frame(paths)
    if len(train) < 100:
        raise DataValidationError(
            f"For lite historisk datagrunnlag for beta-estimering: {len(train)} rader."
        )

    X = np.column_stack(
        [
            np.ones(len(train), dtype=float),
            train["xg_pred_col"].to_numpy(dtype=float),
            train["xgc_pred_col"].to_numpy(dtype=float),
            train["elo_diff"].to_numpy(dtype=float),
        ]
    )
    y = train["xg_target"].to_numpy(dtype=float)
    beta = _fit_poisson_irls(X, y)
    _BETA_CACHE[cache_key] = beta.copy()
    return beta


def _build_eta_training_frame(paths: DataPaths) -> pd.DataFrame:
    hist_path = _first_existing(paths.team_history_candidates, "team_history")
    df = pd.read_csv(hist_path)

    code_col = _pick_col(df, ["code", "team_code", "team_id"])
    opp_col = _pick_col(df, ["opponent", "opponent_code", "opp_code"])
    was_home_col = _pick_col(df, ["was_home", "was_home_bool"])
    kickoff_col = _pick_col(df, ["kickoff_time", "date", "kickoff_date"])
    xg_avg_col = _pick_col(df, ["xg_avg"])
    xgc_avg_col = _pick_col(df, ["xgc_avg"])
    xgh_col = _pick_col(df, ["xgh"])
    xga_col = _pick_col(df, ["xga"])
    xgch_col = _pick_col(df, ["xgch"])
    xgca_col = _pick_col(df, ["xgca"])
    elo_col = _pick_col(df, ["elo_rating", "elo"])
    xg_col = _pick_col(df, ["xg"])
    xg_pred_err_col = _pick_col(df, ["xg_pred_rolling_error"])
    xgc_pred_err_col = _pick_col(df, ["xgc_pred_rolling_error"])

    missing = []
    if code_col is None:
        missing.append("code/team_code")
    if opp_col is None:
        missing.append("opponent")
    if was_home_col is None:
        missing.append("was_home")
    if kickoff_col is None:
        missing.append("kickoff_time/date")
    if xg_avg_col is None:
        missing.append("XG_avg")
    if xgc_avg_col is None:
        missing.append("XGC_avg")
    if xgh_col is None:
        missing.append("XGH")
    if xga_col is None:
        missing.append("XGA")
    if xgch_col is None:
        missing.append("XGCH")
    if xgca_col is None:
        missing.append("XGCA")
    if elo_col is None:
        missing.append("Elo_Rating")
    if xg_col is None:
        missing.append("XG")
    if missing:
        raise DataValidationError(
            f"Mangler historiske kolonner for eta-estimering i {hist_path.name}: {missing}"
        )

    h = df.copy()
    h["team_id"] = _to_num(h[code_col]).astype("Int64")
    h["opponent_id"] = _to_num(h[opp_col]).astype("Int64")
    h["kickoff_time"] = pd.to_datetime(h[kickoff_col], errors="coerce", utc=True)
    h["was_home_bool"] = _parse_was_home_series(h[was_home_col])
    h["xg_avg"] = _to_num(h[xg_avg_col], 0.0)
    h["xgc_avg"] = _to_num(h[xgc_avg_col], 0.0)
    h["xgh"] = _to_num(h[xgh_col], 0.0)
    h["xga"] = _to_num(h[xga_col], 0.0)
    h["xgch"] = _to_num(h[xgch_col], 0.0)
    h["xgca"] = _to_num(h[xgca_col], 0.0)
    h["elo"] = _to_num(h[elo_col], 1500.0)
    h["xg_obs"] = _to_num(h[xg_col], np.nan)
    h["xg_pred_err"] = _to_num(h[xg_pred_err_col], 0.0) if xg_pred_err_col is not None else 0.0
    h["xgc_pred_err"] = _to_num(h[xgc_pred_err_col], 0.0) if xgc_pred_err_col is not None else 0.0

    h = h.dropna(subset=["team_id", "opponent_id", "kickoff_time", "xg_obs"]).copy()
    h = h.sort_values(["team_id", "kickoff_time", "opponent_id"]).drop_duplicates(
        subset=["team_id", "opponent_id", "kickoff_time"], keep="last"
    )

    opp = h[
        ["team_id", "opponent_id", "kickoff_time", "xgch", "xgca", "xgc_avg", "xgc_pred_err", "elo"]
    ].rename(
        columns={
            "team_id": "opp_team_id",
            "opponent_id": "opp_opponent_id",
            "xgch": "opp_xgch",
            "xgca": "opp_xgca",
            "xgc_avg": "opp_xgc_avg",
            "xgc_pred_err": "opp_xgc_pred_err",
            "elo": "elo_opp",
        }
    )
    m = h.merge(
        opp,
        left_on=["team_id", "opponent_id", "kickoff_time"],
        right_on=["opp_opponent_id", "opp_team_id", "kickoff_time"],
        how="left",
    )

    m["own_xg_side"] = np.where(m["was_home_bool"], m["xgh"], m["xga"])
    m["opp_xgc_side"] = np.where(m["was_home_bool"], m["opp_xgca"], m["opp_xgch"])
    m["opp_xgc_avg"] = _to_num(m["opp_xgc_avg"], np.nan).fillna(_to_num(m["xgc_avg"], 0.0))
    m["opp_xgc_pred_err"] = _to_num(m["opp_xgc_pred_err"], 0.0)
    m["elo_diff"] = _to_num(m["elo"], 1500.0) - _to_num(m["elo_opp"], 1500.0)

    m["off_fac"] = (
        _to_num(m["own_xg_side"], 0.0) * 0.4
        + _to_num(m["xg_avg"], 0.0) * 0.6
        - _to_num(m["xg_pred_err"], 0.0) * 0.5
    )
    m["def_fac"] = (
        _to_num(m["opp_xgc_side"], 0.0) * 0.4
        + _to_num(m["opp_xgc_avg"], 0.0) * 0.6
        - _to_num(m["opp_xgc_pred_err"], 0.0) * 0.5
    )
    m["interaction"] = m["off_fac"] * m["def_fac"]
    m["xg_target"] = _to_num(m["xg_obs"], np.nan).clip(lower=0.0, upper=10.0)

    m = m.dropna(subset=["off_fac", "def_fac", "interaction", "elo_diff", "xg_target"]).copy()
    m["off_fac"] = m["off_fac"].clip(lower=0.0, upper=10.0)
    m["def_fac"] = m["def_fac"].clip(lower=0.0, upper=10.0)
    m["interaction"] = m["interaction"].clip(lower=0.0, upper=100.0)
    return m


def estimate_eta_formula_from_history(paths: Optional[DataPaths] = None) -> np.ndarray:
    paths = paths or DataPaths()
    cache_key = "eta|" + "|".join(str(p) for p in paths.team_history_candidates)
    if cache_key in _ETA_FORMULA_CACHE:
        return _ETA_FORMULA_CACHE[cache_key].copy()

    train = _build_eta_training_frame(paths)
    if len(train) < 100:
        raise DataValidationError(
            f"For lite historisk datagrunnlag for eta-estimering: {len(train)} rader."
        )

    X = np.column_stack(
        [
            np.ones(len(train), dtype=float),
            train["off_fac"].to_numpy(dtype=float),
            train["def_fac"].to_numpy(dtype=float),
            train["interaction"].to_numpy(dtype=float),
            train["elo_diff"].to_numpy(dtype=float),
        ]
    )
    y = train["xg_target"].to_numpy(dtype=float)
    eta_params = _fit_poisson_irls(X, y)
    _ETA_FORMULA_CACHE[cache_key] = eta_params.copy()
    return eta_params


# =========================
# TEAM BASELINE INTENSITY
# =========================

def _row_num(row: pd.Series, col: str, default: float = 0.0) -> float:
    return float(pd.to_numeric(pd.Series([row.get(col, default)]), errors="coerce").fillna(default).iloc[0])


def _team_lambda_components(
    own_team: pd.Series,
    opp_team: pd.Series,
    is_home: bool,
    eta_params: Optional[np.ndarray] = None,
    paths: Optional[DataPaths] = None,
) -> Dict[str, float]:
    # Own XG side: XGH if home, XGA if away
    own_xg = _row_num(own_team, "xgh" if is_home else "xga", 0.0)
    own_xg_avg = _row_num(own_team, "xg_avg", 0.0)
    own_xg_err = _row_num(own_team, "xg_pred_rolling_error", 0.0)

    # Opposition XGC side: opponent XGCA if they are away, XGCH if they are home
    opp_xgc = _row_num(opp_team, "xgca" if is_home else "xgch", 0.0)
    opp_xgc_avg = _row_num(opp_team, "xgc_avg", 0.0)
    opp_xgc_err = _row_num(opp_team, "xgc_pred_rolling_error", 0.0)
    elo_diff = _row_num(own_team, "elo_rating", 1500.0) - _row_num(opp_team, "elo_rating", 1500.0)
    ict_diff = _row_num(own_team, "ict_measure_norm", 0.0) - _row_num(opp_team, "ict_measure_norm", 0.0)
    off_fac = own_xg * 0.4 + 0.6 * own_xg_avg - 0.5 * own_xg_err
    def_fac = opp_xgc * 0.4 + 0.6 * opp_xgc_avg - 0.5 * opp_xgc_err
    interaction = off_fac * def_fac

    b0 = float(LAMBDA_POISSON_INTERCEPT)
    b_off = float(LAMBDA_POISSON_OWN_OFF_COEF)
    b_def = float(LAMBDA_POISSON_OPP_DEF_COEF)
    b_int = float(LAMBDA_POISSON_INTERACTION_COEF)
    b_ict = float(LAMBDA_POISSON_ICT_DIFF_COEF)

    eta = (
        b0
        + b_off * off_fac
        + b_def * def_fac
        + b_int * interaction
        + b_ict * ict_diff
    )
    lambda0 = float(np.exp(np.clip(eta, -20.0, 20.0)))
    return {
        "own_xg_side": float(own_xg),
        "own_xg_avg": float(own_xg_avg),
        "own_xg_pred_rolling_error": float(own_xg_err),
        "opp_xgc_side": float(opp_xgc),
        "opp_xgc_avg": float(opp_xgc_avg),
        "opp_xgc_pred_rolling_error": float(opp_xgc_err),
        "elo_diff": float(elo_diff),
        "ict_diff": float(ict_diff),
        "off_fac": float(off_fac),
        "def_fac": float(def_fac),
        "interaction": float(interaction),
        "eta": float(eta),
        "lambda0": float(lambda0),
        "eta_intercept": float(b0),
        "eta_off_coef": float(b_off),
        "eta_def_coef": float(b_def),
        "eta_interaction_coef": float(b_int),
        "eta_elo_coef": 0.0,
        "eta_ict_coef": float(b_ict),
        "eta_scale": 1.0,
    }


def baseline_lambda(
    own_team: pd.Series,
    opp_team: pd.Series,
    is_home: bool,
    eta_params: Optional[np.ndarray] = None,
    paths: Optional[DataPaths] = None,
) -> float:
    return _team_lambda_components(own_team, opp_team, is_home, eta_params=eta_params, paths=paths)["lambda0"]


# =========================
# DYNAMIC INTENSITIES
# =========================

def goal_intensity(lambda_0, score_diff, red_diff, t, gamma):
    g1, g2, g3, g4 = gamma
    return (lambda_0 / MATCH_MINUTES) * np.exp(
        g1 * score_diff
        + g2 * red_diff
        + g3 * (t >= 45)
        + g4 * t
    )


def red_card_intensity(t, theta, ict_diff: float = 0.0):
    t0, t1 = theta
    return np.exp(t0 + t1 * np.log(max(t, 1.0)) - 0.08 * float(ict_diff))


# =========================
# STOPPAGE TIME
# =========================

def stoppage_time(goals, red_cards, close_game, delta):
    d0, d1, d2, d3 = delta
    pi = np.exp(
        d0
        + d1 * goals
        + d2 * red_cards
        + d3 * int(close_game)
    )
    return np.random.poisson(pi)


# =========================
# PLAYER ALLOCATION
# =========================

def prepare_players(players_df):
    df = players_df.copy()
    df["g_adj"] = df["goal_index"] * df["adjusted_minutes"] / 90.0
    df["a_adj"] = df["assist_index"] * df["adjusted_minutes"] / 90.0
    return df


def sample_player(df, col):
    weights = df[col].values
    if weights.sum() < EPS:
        return None
    probs = weights / weights.sum()
    return np.random.choice(df["player_id"].values, p=probs)


# =========================
# MATCH SIMULATION
# =========================

def simulate_match(
    home_team,
    away_team,
    home_players,
    away_players,
    params,
    eta_params: Optional[np.ndarray] = None,
    paths: Optional[DataPaths] = None,
):
    gamma, theta, delta = params

    score_h = 0
    score_a = 0
    red_h = 0
    red_a = 0

    events = []

    # baseline lambdas
    lambda_h0 = baseline_lambda(home_team, away_team, is_home=True, eta_params=eta_params, paths=paths)
    lambda_a0 = baseline_lambda(away_team, home_team, is_home=False, eta_params=eta_params, paths=paths)
    home_ict = _row_num(home_team, "ict_measure_norm", 0.0)
    away_ict = _row_num(away_team, "ict_measure_norm", 0.0)
    ict_diff_home = home_ict - away_ict
    ict_diff_away = away_ict - home_ict

    t = 0.0

    while t < MATCH_MINUTES:
        score_diff = score_h - score_a
        red_diff = red_a - red_h

        l_h = goal_intensity(lambda_h0, score_diff, red_diff, t, gamma)
        l_a = goal_intensity(lambda_a0, -score_diff, -red_diff, t, gamma)
        l_h = float(np.clip(l_h, 0.0, 0.08))
        l_a = float(np.clip(l_a, 0.0, 0.08))

        l_rh = red_card_intensity(t, theta, ict_diff=ict_diff_home)
        l_ra = red_card_intensity(t, theta, ict_diff=ict_diff_away)

        l_total = l_h + l_a + l_rh + l_ra

        if l_total < EPS:
            break

        # next event time
        dt = np.random.exponential(1 / l_total)
        t += dt
        if t >= MATCH_MINUTES:
            break

        u = np.random.rand() * l_total

        if u < l_h:
            score_h += 1
            scorer = sample_player(home_players, "g_adj")
            assist = sample_player(home_players, "a_adj")
            events.append(("goal_home", t, scorer, assist))

        elif u < l_h + l_a:
            score_a += 1
            scorer = sample_player(away_players, "g_adj")
            assist = sample_player(away_players, "a_adj")
            events.append(("goal_away", t, scorer, assist))

        elif u < l_h + l_a + l_rh:
            red_h += 1
            events.append(("red_home", t, None, None))

        else:
            red_a += 1
            events.append(("red_away", t, None, None))

    # stoppage time
    close_game = abs(score_h - score_a) <= 1
    extra = stoppage_time(score_h + score_a, red_h + red_a, close_game, delta)

    return {
        "score_home": score_h,
        "score_away": score_a,
        "red_home": red_h,
        "red_away": red_a,
        "events": events,
        "stoppage": extra,
    }


# =========================
# FPL SCORING
# =========================

def fpl_points(goals, assists, clean_sheet, minutes):
    pts = 0
    pts += goals * 4
    pts += assists * 3
    if clean_sheet and minutes >= 60:
        pts += 4
    return pts


# =========================
# MONTE CARLO
# =========================

def run_simulation(
    n_scenarios: int = N_SCENARIOS,
    include_finished_fixtures: bool = False,
    paths: Optional[DataPaths] = None,
):
    teams, players, fixtures = load_data(paths=paths, include_finished=include_finished_fixtures)
    paths = paths or DataPaths()
    player_mode = _resolve_player_mode(players, include_finished_fixtures=include_finished_fixtures)
    eta_params = estimate_eta_formula_from_history(paths=paths)

    gamma = np.array([-0.10, 0.35, 0.18, 0.0])
    theta = np.array([-13.0, 1.5])
    delta = np.array([1.2, 0.05, 0.10, 0.25])

    params = (gamma, theta, delta)

    all_results = []

    for _, fx in fixtures.iterrows():
        home = teams.loc[teams.team_id == int(fx.home_team_id)]
        away = teams.loc[teams.team_id == int(fx.away_team_id)]
        if home.empty or away.empty:
            continue
        home = _team_row_for_side(home.iloc[0], is_home=True)
        away = _team_row_for_side(away.iloc[0], is_home=False)

        max_date = fx.get("kickoff_time")
        hp = _build_player_pool_from_loaded(
            players,
            team_code=int(fx.home_team_id),
            mode_norm=player_mode,
            max_date=max_date,
        )
        ap = _build_player_pool_from_loaded(
            players,
            team_code=int(fx.away_team_id),
            mode_norm=player_mode,
            max_date=max_date,
        )
        hp = prepare_players(hp[["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes"]]) if not hp.empty else pd.DataFrame(columns=["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes", "g_adj", "a_adj"])
        ap = prepare_players(ap[["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes"]]) if not ap.empty else pd.DataFrame(columns=["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes", "g_adj", "a_adj"])

        for scenario in range(int(n_scenarios)):
            res = simulate_match(
                home,
                away,
                hp,
                ap,
                params,
                eta_params=eta_params,
                paths=paths,
            )
            all_results.append(
                {
                    "match_id": int(fx.match_id),
                    "gameweek": int(fx.gameweek),
                    "home_team_id": int(fx.home_team_id),
                    "away_team_id": int(fx.away_team_id),
                    "scenario": scenario,
                    **res,
                }
            )

    return all_results


def build_upcoming_prediction_tables(
    n_scenarios: int = N_SCENARIOS,
    include_finished_fixtures: bool = False,
    paths: Optional[DataPaths] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    teams, players, fixtures = load_data(paths=paths, include_finished=include_finished_fixtures)
    paths = paths or DataPaths()
    eta_params = estimate_eta_formula_from_history(paths=paths)
    player_mode = _resolve_player_mode(players, include_finished_fixtures=include_finished_fixtures)

    team_name_map: Dict[int, str] = {}
    if paths.current_teams_path.exists():
        tdf = pd.read_csv(paths.current_teams_path)
        code_col = _pick_col(tdf, ["code"])
        id_col = _pick_col(tdf, ["id"])
        name_col = _pick_col(tdf, ["name"])
        if name_col is not None:
            if code_col is not None:
                for _, r in tdf.iterrows():
                    k = pd.to_numeric(pd.Series([r.get(code_col)]), errors="coerce").iloc[0]
                    if pd.notna(k):
                        team_name_map[int(k)] = str(r.get(name_col))
            if id_col is not None:
                for _, r in tdf.iterrows():
                    k = pd.to_numeric(pd.Series([r.get(id_col)]), errors="coerce").iloc[0]
                    if pd.notna(k) and int(k) not in team_name_map:
                        team_name_map[int(k)] = str(r.get(name_col))

    gamma = np.array([-0.10, 0.35, 0.18, 0.0])
    theta = np.array([-13.0, 1.5])
    delta = np.array([1.2, 0.05, 0.10, 0.25])
    params = (gamma, theta, delta)

    team_rows: List[Dict[str, object]] = []
    player_rows: List[Dict[str, object]] = []

    for _, fx in fixtures.iterrows():
        home_team_id = int(fx.home_team_id)
        away_team_id = int(fx.away_team_id)
        home_name = team_name_map.get(home_team_id, str(home_team_id))
        away_name = team_name_map.get(away_team_id, str(away_team_id))
        match_id = int(fx.match_id)
        fixture_code = int(fx.fixture_code) if pd.notna(fx.get("fixture_code")) else match_id
        gameweek = int(fx.gameweek)
        kickoff_time = fx.get("kickoff_time")

        home_base = teams.loc[teams.team_id == home_team_id]
        away_base = teams.loc[teams.team_id == away_team_id]
        if home_base.empty or away_base.empty:
            continue

        home = _team_row_for_side(home_base.iloc[0], is_home=True)
        away = _team_row_for_side(away_base.iloc[0], is_home=False)
        home_lambda = _team_lambda_components(home, away, is_home=True, eta_params=eta_params, paths=paths)
        away_lambda = _team_lambda_components(away, home, is_home=False, eta_params=eta_params, paths=paths)
        home_ict = _row_num(home, "ict_measure_norm", 0.0)
        away_ict = _row_num(away, "ict_measure_norm", 0.0)

        hp0 = _build_player_pool_from_loaded(
            players,
            team_code=home_team_id,
            mode_norm=player_mode,
            max_date=kickoff_time,
        )
        ap0 = _build_player_pool_from_loaded(
            players,
            team_code=away_team_id,
            mode_norm=player_mode,
            max_date=kickoff_time,
        )

        keep_cols = ["player_id", "team_id", "goal_index", "assist_index", "adjusted_minutes", "name"]
        hp = prepare_players(hp0[[c for c in keep_cols if c in hp0.columns]].copy()) if not hp0.empty else pd.DataFrame(columns=keep_cols + ["g_adj", "a_adj"])
        ap = prepare_players(ap0[[c for c in keep_cols if c in ap0.columns]].copy()) if not ap0.empty else pd.DataFrame(columns=keep_cols + ["g_adj", "a_adj"])

        home_goals = []
        away_goals = []
        home_reds = []
        away_reds = []

        player_agg: Dict[Tuple[int, int], Dict[str, float]] = defaultdict(lambda: {
            "goals": 0.0,
            "assists": 0.0,
            "clean_sheets": 0.0,
            "points": 0.0,
            "bonus_points": 0.0,
            "grunn_bonus": 0.0,
            "bps_score": 0.0,
            "adjusted_minutes": 0.0,
            "name": "",
        })

        home_param_cols = [
            "xg_index_base", "xa_index_base", "opp_goal_threat_pos", "opp_assist_threat_pos",
            "understat_posxg_share", "understat_posxa_share", "XG_Index", "XA_Index", "risk_adj_minutes_factor",
        ]
        away_param_cols = home_param_cols
        home_meta = {}
        away_meta = {}
        if not hp0.empty:
            for _, r in hp0.iterrows():
                pid = int(r.player_id)
                home_meta[pid] = {
                    "adjusted_minutes": float(r.get("adjusted_minutes", 0.0)),
                    "name": str(r.get("name", "")),
                    "position": _normalize_position(r.get("position", "MID")),
                    "pred_minutes": float(pd.to_numeric(pd.Series([r.get("pred_minutes", r.get("average_minutes", r.get("adjusted_minutes", 0.0)))]), errors="coerce").fillna(0.0).iloc[0]),
                    "rolling_adjusted_bps": float(pd.to_numeric(pd.Series([r.get("Rolling_adjusted_BPS", 0.0)]), errors="coerce").fillna(0.0).iloc[0]),
                    "rolling_adjusted_bps_2": float(pd.to_numeric(pd.Series([r.get("Rolling_adjusted_BPS_2", 0.0)]), errors="coerce").fillna(0.0).iloc[0]),
                    **{c: float(pd.to_numeric(pd.Series([r.get(c, 0.0)]), errors="coerce").fillna(0.0).iloc[0]) for c in home_param_cols},
                }
        if not ap0.empty:
            for _, r in ap0.iterrows():
                pid = int(r.player_id)
                away_meta[pid] = {
                    "adjusted_minutes": float(r.get("adjusted_minutes", 0.0)),
                    "name": str(r.get("name", "")),
                    "position": _normalize_position(r.get("position", "MID")),
                    "pred_minutes": float(pd.to_numeric(pd.Series([r.get("pred_minutes", r.get("average_minutes", r.get("adjusted_minutes", 0.0)))]), errors="coerce").fillna(0.0).iloc[0]),
                    "rolling_adjusted_bps": float(pd.to_numeric(pd.Series([r.get("Rolling_adjusted_BPS", 0.0)]), errors="coerce").fillna(0.0).iloc[0]),
                    "rolling_adjusted_bps_2": float(pd.to_numeric(pd.Series([r.get("Rolling_adjusted_BPS_2", 0.0)]), errors="coerce").fillna(0.0).iloc[0]),
                    **{c: float(pd.to_numeric(pd.Series([r.get(c, 0.0)]), errors="coerce").fillna(0.0).iloc[0]) for c in away_param_cols},
                }

        for _ in range(int(n_scenarios)):
            res = simulate_match(
                home,
                away,
                hp,
                ap,
                params,
                eta_params=eta_params,
                paths=paths,
            )
            sh = int(res["score_home"])
            sa = int(res["score_away"])
            rh = int(res["red_home"])
            ra = int(res["red_away"])
            home_goals.append(sh)
            away_goals.append(sa)
            home_reds.append(rh)
            away_reds.append(ra)

            g_scn = defaultdict(int)
            a_scn = defaultdict(int)

            for evt, _t, scorer, assist in res["events"]:
                if evt == "goal_home":
                    if scorer is not None:
                        g_scn[(home_team_id, int(scorer))] += 1
                    if assist is not None:
                        a_scn[(home_team_id, int(assist))] += 1
                elif evt == "goal_away":
                    if scorer is not None:
                        g_scn[(away_team_id, int(scorer))] += 1
                    if assist is not None:
                        a_scn[(away_team_id, int(assist))] += 1

            home_cs = sa == 0
            away_cs = sh == 0

            # Bonus score tracking for this scenario (both teams together).
            bonus_score_scn: Dict[Tuple[int, int], float] = {}
            for pid, pdata in home_meta.items():
                key = (home_team_id, pid)
                minute_factor = float(pdata.get("pred_minutes", 0.0)) / 90.0
                base_bonus = (0.4 * float(pdata.get("rolling_adjusted_bps", 0.0)) + 0.6 * float(pdata.get("rolling_adjusted_bps_2", 0.0))) * minute_factor
                bonus_score_scn[key] = float(base_bonus)
                player_agg[key]["grunn_bonus"] += float(base_bonus)
            for pid, pdata in away_meta.items():
                key = (away_team_id, pid)
                minute_factor = float(pdata.get("pred_minutes", 0.0)) / 90.0
                base_bonus = (0.4 * float(pdata.get("rolling_adjusted_bps", 0.0)) + 0.6 * float(pdata.get("rolling_adjusted_bps_2", 0.0))) * minute_factor
                bonus_score_scn[key] = float(base_bonus)
                player_agg[key]["grunn_bonus"] += float(base_bonus)

            for pid, pdata in home_meta.items():
                mins = float(pdata["adjusted_minutes"])
                pname = str(pdata["name"])
                pos = _normalize_position(pdata.get("position", "MID"))
                key = (home_team_id, pid)
                g = int(g_scn.get(key, 0))
                a = int(a_scn.get(key, 0))
                cs = 1 if home_cs else 0
                pts = fpl_points(g, a, bool(cs), mins)
                bonus_score_scn[key] = float(bonus_score_scn.get(key, 0.0)) + _pos_bonus(pos, "goal") * g + _pos_bonus(pos, "assist") * a + _pos_bonus(pos, "cs") * cs
                d = player_agg[key]
                d["goals"] += g
                d["assists"] += a
                d["clean_sheets"] += cs
                d["points"] += pts
                d["adjusted_minutes"] = mins
                d["name"] = pname

            for pid, pdata in away_meta.items():
                mins = float(pdata["adjusted_minutes"])
                pname = str(pdata["name"])
                pos = _normalize_position(pdata.get("position", "MID"))
                key = (away_team_id, pid)
                g = int(g_scn.get(key, 0))
                a = int(a_scn.get(key, 0))
                cs = 1 if away_cs else 0
                pts = fpl_points(g, a, bool(cs), mins)
                bonus_score_scn[key] = float(bonus_score_scn.get(key, 0.0)) + _pos_bonus(pos, "goal") * g + _pos_bonus(pos, "assist") * a + _pos_bonus(pos, "cs") * cs
                d = player_agg[key]
                d["goals"] += g
                d["assists"] += a
                d["clean_sheets"] += cs
                d["points"] += pts
                d["adjusted_minutes"] = mins
                d["name"] = pname

            # Allocate actual FPL bonus points 3/2/1 to top-3 bonus scores in the match.
            if bonus_score_scn:
                rank = sorted(bonus_score_scn.items(), key=lambda x: x[1], reverse=True)
                bonus_awards = [3.0, 2.0, 1.0]
                for i, award in enumerate(bonus_awards):
                    if i < len(rank):
                        key = rank[i][0]
                        player_agg[key]["bonus_points"] += float(award)
            for key, score in bonus_score_scn.items():
                player_agg[key]["bps_score"] += float(score)

        n = float(max(1, int(n_scenarios)))
        home_win_pct = 100.0 * float(np.mean(np.array(home_goals) > np.array(away_goals)))
        draw_pct = 100.0 * float(np.mean(np.array(home_goals) == np.array(away_goals)))
        away_win_pct = 100.0 * float(np.mean(np.array(home_goals) < np.array(away_goals)))

        team_rows.append(
            {
                "fixture_code": fixture_code,
                "match_id": match_id,
                "gameweek": gameweek,
                "kickoff_time": kickoff_time,
                "team_id": home_team_id,
                "team_name": home_name,
                "opponent_team_id": away_team_id,
                "opponent_team_name": away_name,
                "is_home": 1,
                "pred_goals_for": float(np.mean(home_goals)),
                "pred_goals_against": float(np.mean(away_goals)),
                "lambda0_base": float(home_lambda["lambda0"]),
                "eta_base": float(home_lambda["eta"]),
                "off_fac": float(home_lambda["off_fac"]),
                "def_fac": float(home_lambda["def_fac"]),
                "interaction": float(home_lambda["interaction"]),
                "elo_diff": float(home_lambda["elo_diff"]),
                "own_xg_side": float(home_lambda["own_xg_side"]),
                "own_xg_avg": float(home_lambda["own_xg_avg"]),
                "own_xg_pred_rolling_error": float(home_lambda["own_xg_pred_rolling_error"]),
                "opp_xgc_side": float(home_lambda["opp_xgc_side"]),
                "opp_xgc_avg": float(home_lambda["opp_xgc_avg"]),
                "opp_xgc_pred_rolling_error": float(home_lambda["opp_xgc_pred_rolling_error"]),
                "eta_intercept": float(home_lambda["eta_intercept"]),
                "eta_off_coef": float(home_lambda["eta_off_coef"]),
                "eta_def_coef": float(home_lambda["eta_def_coef"]),
                "eta_interaction_coef": float(home_lambda["eta_interaction_coef"]),
                "eta_elo_coef": float(home_lambda["eta_elo_coef"]),
                "eta_scale": float(home_lambda["eta_scale"]),
                "gamma1": float(gamma[0]),
                "gamma2": float(gamma[1]),
                "gamma3": float(gamma[2]),
                "gamma4": float(gamma[3]),
                "theta0": float(theta[0]),
                "theta1": float(theta[1]),
                "delta0": float(delta[0]),
                "delta1": float(delta[1]),
                "delta2": float(delta[2]),
                "delta3": float(delta[3]),
                "pred_red_cards": float(np.mean(home_reds)),
                "clean_sheet_pct": 100.0 * float(np.mean(np.array(away_goals) == 0)),
                "win_pct": home_win_pct,
                "draw_pct": draw_pct,
                "loss_pct": away_win_pct,
                "ict_measure_norm": float(home_ict),
                "opp_ict_measure_norm": float(away_ict),
                "ict_diff_redcard": float(home_ict - away_ict),
                "red_ict_coef": -0.08,
                "scenarios": int(n_scenarios),
            }
        )
        team_rows.append(
            {
                "fixture_code": fixture_code,
                "match_id": match_id,
                "gameweek": gameweek,
                "kickoff_time": kickoff_time,
                "team_id": away_team_id,
                "team_name": away_name,
                "opponent_team_id": home_team_id,
                "opponent_team_name": home_name,
                "is_home": 0,
                "pred_goals_for": float(np.mean(away_goals)),
                "pred_goals_against": float(np.mean(home_goals)),
                "lambda0_base": float(away_lambda["lambda0"]),
                "eta_base": float(away_lambda["eta"]),
                "off_fac": float(away_lambda["off_fac"]),
                "def_fac": float(away_lambda["def_fac"]),
                "interaction": float(away_lambda["interaction"]),
                "elo_diff": float(away_lambda["elo_diff"]),
                "own_xg_side": float(away_lambda["own_xg_side"]),
                "own_xg_avg": float(away_lambda["own_xg_avg"]),
                "own_xg_pred_rolling_error": float(away_lambda["own_xg_pred_rolling_error"]),
                "opp_xgc_side": float(away_lambda["opp_xgc_side"]),
                "opp_xgc_avg": float(away_lambda["opp_xgc_avg"]),
                "opp_xgc_pred_rolling_error": float(away_lambda["opp_xgc_pred_rolling_error"]),
                "eta_intercept": float(away_lambda["eta_intercept"]),
                "eta_off_coef": float(away_lambda["eta_off_coef"]),
                "eta_def_coef": float(away_lambda["eta_def_coef"]),
                "eta_interaction_coef": float(away_lambda["eta_interaction_coef"]),
                "eta_elo_coef": float(away_lambda["eta_elo_coef"]),
                "eta_scale": float(away_lambda["eta_scale"]),
                "gamma1": float(gamma[0]),
                "gamma2": float(gamma[1]),
                "gamma3": float(gamma[2]),
                "gamma4": float(gamma[3]),
                "theta0": float(theta[0]),
                "theta1": float(theta[1]),
                "delta0": float(delta[0]),
                "delta1": float(delta[1]),
                "delta2": float(delta[2]),
                "delta3": float(delta[3]),
                "pred_red_cards": float(np.mean(away_reds)),
                "clean_sheet_pct": 100.0 * float(np.mean(np.array(home_goals) == 0)),
                "win_pct": away_win_pct,
                "draw_pct": draw_pct,
                "loss_pct": home_win_pct,
                "ict_measure_norm": float(away_ict),
                "opp_ict_measure_norm": float(home_ict),
                "ict_diff_redcard": float(away_ict - home_ict),
                "red_ict_coef": -0.08,
                "scenarios": int(n_scenarios),
            }
        )

        for (team_id, player_id), d in player_agg.items():
            pmeta = home_meta.get(int(player_id)) if int(team_id) == home_team_id else away_meta.get(int(player_id))
            if pmeta is None:
                pmeta = {
                    "xg_index_base": 0.0,
                    "xa_index_base": 0.0,
                    "opp_goal_threat_pos": 0.0,
                    "opp_assist_threat_pos": 0.0,
                    "understat_posxg_share": 0.0,
                    "understat_posxa_share": 0.0,
                    "XG_Index": 0.0,
                    "XA_Index": 0.0,
                    "risk_adj_minutes_factor": 0.0,
                }
            player_rows.append(
                {
                    "fixture_code": fixture_code,
                    "match_id": match_id,
                    "gameweek": gameweek,
                    "kickoff_time": kickoff_time,
                    "team_id": int(team_id),
                    "team_name": home_name if int(team_id) == home_team_id else away_name,
                    "player_id": int(player_id),
                    "player_name": d["name"],
                    "adjusted_minutes": float(d["adjusted_minutes"]),
                    "pred_goals": float(d["goals"]) / n,
                    "pred_assists": float(d["assists"]) / n,
                    "pred_clean_sheets": float(d["clean_sheets"]) / n,
                    "pred_fpl_points": float(d["points"]) / n,
                    "pred_bonus_points": float(d["bonus_points"]) / n,
                    "pred_grunn_bonus": float(d["grunn_bonus"]) / n,
                    "pred_avg_bps": float(d["bps_score"]) / n,
                    "xg_index_base": float(pmeta["xg_index_base"]),
                    "xa_index_base": float(pmeta["xa_index_base"]),
                    "opp_goal_threat_pos": float(pmeta["opp_goal_threat_pos"]),
                    "opp_assist_threat_pos": float(pmeta["opp_assist_threat_pos"]),
                    "understat_posxg_share": float(pmeta["understat_posxg_share"]),
                    "understat_posxa_share": float(pmeta["understat_posxa_share"]),
                    "xg_index_final": float(pmeta["XG_Index"]),
                    "xa_index_final": float(pmeta["XA_Index"]),
                    "risk_adj_minutes_factor": float(pmeta["risk_adj_minutes_factor"]),
                    "xg_blend_weight_base": 0.65,
                    "xg_blend_weight_opp_goal_pos": 0.15,
                    "xg_blend_weight_understat_pos": 0.20,
                    "xa_blend_weight_base": 0.65,
                    "xa_blend_weight_opp_assist_pos": 0.15,
                    "xa_blend_weight_understat_pos": 0.20,
                    "scenarios": int(n_scenarios),
                }
            )

    team_df = pd.DataFrame(team_rows)
    player_df = pd.DataFrame(player_rows)
    return team_df, player_df


def write_upcoming_prediction_files(
    team_output_path: Path = Path("SImulator/Full_simulator_team.csv"),
    player_output_path: Path = Path("SImulator/Full_simulator_player.csv"),
    n_scenarios: int = N_SCENARIOS,
    include_finished_fixtures: bool = False,
    paths: Optional[DataPaths] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    team_df, player_df = build_upcoming_prediction_tables(
        n_scenarios=n_scenarios,
        include_finished_fixtures=include_finished_fixtures,
        paths=paths,
    )
    team_output_path.parent.mkdir(parents=True, exist_ok=True)
    player_output_path.parent.mkdir(parents=True, exist_ok=True)
    team_df.to_csv(team_output_path, index=False)
    player_df.to_csv(player_output_path, index=False)
    return team_df, player_df


if __name__ == "__main__":
    try:
        team_df, player_df = write_upcoming_prediction_files()
        print(f"Wrote team predictions: {len(team_df)} rows -> SImulator/Full_simulator_team.csv")
        print(f"Wrote player predictions: {len(player_df)} rows -> SImulator/Full_simulator_player.csv")
    except DataValidationError as exc:
        print(f"[DATA ERROR] {exc}")
