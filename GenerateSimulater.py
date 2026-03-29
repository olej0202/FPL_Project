"""
GenerateSimulater.py

Simulates upcoming fixtures (same unfinished fixtures scope as Generate_Team_Predictions.py)
and writes:
1) Match outcomes + score predictions
2) Player goals/assists outcomes per fixture and GW

Outputs are written to: ./SImulator/
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


# =============================
# Simulator parameters (edit)
# =============================
BASE_DIR = Path(__file__).resolve().parent

FIXTURE_PATH = BASE_DIR / "Raw_Data_25" / "Fantasy_season_2025_Fixtures.csv"
CURRENT_TEAMS_PATH = BASE_DIR / "Raw_Data_25" / "current_teams.csv"
CURRENT_PLAYERS_PATH = BASE_DIR / "Raw_Data_25" / "current_players.csv"
TEAM_HISTORY_PATH = BASE_DIR / "Team_data_transformed2.csv"
PLAYER_PREDICTION_PATH = BASE_DIR / "Player_Prediction_set.csv"
PLAYER_HISTORY_PATH = BASE_DIR / "ML_training2.csv"

OUTPUT_DIR = BASE_DIR / "SImulator"
MATCH_OUTPUT_PATH = OUTPUT_DIR / "match_outcomes_score_predictions.csv"
PLAYER_OUTPUT_PATH = OUTPUT_DIR / "player_outcomes_per_gw.csv"
CALIBRATION_SEARCH_OUTPUT_PATH = OUTPUT_DIR / "calibration_search_results.csv"
CALIBRATION_BEST_OUTPUT_PATH = OUTPUT_DIR / "calibration_best_params.csv"

SIMULATIONS_PER_MATCH = 5000
RANDOM_SEED = 42
SIMULATE_ALL_FUTURE_GWS = True
HORIZON_GWS: Optional[int] = None  # Used only when SIMULATE_ALL_FUTURE_GWS=False

RECENT_TEAM_MATCH_WINDOW = 24
RECENT_PLAYER_MATCH_WINDOW = 24

HOME_ADVANTAGE_MULTIPLIER = 1.102604
ELO_DIVISOR = 1002.808116
CURRENT_STRENGTH_BLEND = 0.119541
TEAM_RECENCY_DECAY = 0.90
PLAYER_RECENCY_DECAY = 0.90
MODEL_SHRINK_TO_LEAGUE = 0.367421
MAX_HOME_LAMBDA = 3.40
MAX_AWAY_LAMBDA = 3.10
HOME_LAMBDA_ADJUST = 0.915409
AWAY_LAMBDA_ADJUST = 1.054595
CLEAN_SHEET_SHRINK = 0.842227
BASELINE_CLEAN_SHEET_PCT = 32.687978

AUTO_CALIBRATE_ON_HISTORY = True
CALIBRATION_ITERS = 80
CALIBRATION_MAX_FIXTURES = 900

TEAM_STYLE_BLEND = 0.23322

PLAYER_BLEND_CURRENT = 0.419638
PLAYER_CONTRIB_BASE = 0.848407
PLAYER_CONTRIB_MULT = 0.796923
PLAYER_GOAL_SCALE = 0.840612
PLAYER_ASSIST_SCALE = 0.82437
PLAYER_MINUTES_EXP = 1.059566
PLAYER_GOAL_RATE_BASE = 0.088909
PLAYER_ASSIST_RATE_BASE = 0.150487
PLAYER_OBJECTIVE_WEIGHT = 0.90
CALIBRATION_MAX_PLAYER_ROWS = 18000

MIN_PLAYER_EXPECTED_MINUTES = 8.0
MAX_PLAYERS_PER_TEAM_PER_FIXTURE = 24
PLAYING_POOL_TARGET_EQUIV = 12.8
PLAYING_POOL_MIN_PLAYERS = 8
PLAYING_POOL_MAX_PLAYERS = 20
PLAYING_POOL_MINUTES_CAP = 80.0
UNAVAILABLE_PLAYER_PENALTY = 0.35
DEFAULT_ASSIST_RATIO = 0.60
PLAYER_HISTORY_FULL_MATCHES = 18
PLAYER_HISTORY_FULL_MINUTES = 1200.0
PLAYER_FEATURE_PRIOR_SHRINK = 0.12
MATCH_OUTCOME_TOTAL_REVERSION = 0.18
MATCH_OUTCOME_GAP_SHRINK = 0.12
MATCH_TEMPO_SHOCK_STD = 0.08
PLAYER_MINUTES_SHOCK_BASE = 0.10
PLAYER_FORM_SHOCK_BASE = 0.12
TEAM_SHOCK_STD_BASE = 0.046238
TEAM_SHOCK_STD_SCALE = 0.522318
TEAM_SHOCK_STD_MIN = 0.03
TEAM_SHOCK_STD_MAX = 0.32

# Statistical team model (aligned with Generate_Team_Predictions.py formulas)
TEAM_STAT_XG_BLEND = 0.51753
TEAM_STAT_CS_BLEND = 0.541793
STAT_XG_INTERCEPT = -3.15
STAT_XG_OFF_COEF = 1.485
STAT_XG_DEF_COEF = 1.503
STAT_XG_INTERACTION_COEF = -0.174
STAT_XG_EXP_SCALE = 0.5
STAT_CS_INTERCEPT = -1.56
STAT_CS_OWN_XGC_COEF = 0.746
STAT_CS_OPP_XG_COEF = 0.73
STAT_CS_INTERACTION_COEF = -0.079
CS_DEF_STRENGTH_BONUS = 0.48
CS_DEF_VULN_PENALTY = 0.18
NON_ELITE_ELO_CUTOFF = 1095.0
NON_ELITE_TOTAL_XG_CAP = 2.64
MAX_ASSIST_WEIGHT_SHARE = 0.28
UNDERFORM_ATTACK_TRIGGER = 0.95
UNDERFORM_ATTACK_DAMP = 0.16
STAT_GOAL_SHARE_BLEND = 0.42
STAT_ASSIST_SHARE_BLEND = 0.38
DEF_MAX_GOAL_SHARE = 0.08
CS_BONUS_ELO_CENTER = 1130.0
CS_BONUS_ELO_SPREAD = 140.0
CS_UPLIFT_MAX_WEAK_OPP = 3.0
CS_UPLIFT_MIN_ELITE_OPP = 0.5
GOAL_ALLOCATION_TOP_N = 10
ASSIST_ALLOCATION_TOP_N = 12
ALLOCATION_TAIL_SCALE = 0.10
GOAL_ALLOCATION_TOP_FRAC = 0.78
ASSIST_ALLOCATION_TOP_FRAC = 0.92
GOAL_ALLOCATION_MIN_TOP_N = 6
ASSIST_ALLOCATION_MIN_TOP_N = 7
GOAL_CONTRIBUTION_SHARPNESS = 1.18
ASSIST_CONTRIBUTION_SHARPNESS = 1.12

POSITION_GOAL_MULT = {
    "FWD": 1.34,
    "MID": 0.88,
    "DEF": 0.62,
    "GKP": 0.06,
    "UNK": 0.90,
}
POSITION_ASSIST_MULT = {
    "FWD": 0.98,
    "MID": 0.70,
    "DEF": 0.70,
    "GKP": 0.08,
    "UNK": 0.92,
}

PLAYER_FEATURE_COLUMNS = {
    "goal_stats": [
        "Goal_Statistics",
        "Goal_Statistics_share",
        "rolling_Goal_min_share",
        "rolling_Adjusted_XG_historic_share",
    ],
    "assist_stats": [
        "Assist_Statistics",
        "Assist_Statistics_share",
        "rolling_Assist_min_share",
        "rolling_Adjusted_XA_historic_share",
    ],
    "goal_share": ["Share_of_XG_share", "Share_of_XG"],
    "assist_share": ["Share_of_XA_share", "Share_of_XA"],
    "goal_share_short": ["Share_of_XG_Short"],
    "assist_share_short": ["Share_of_XA_Short"],
    "understat_xg_share": ["Understat_POSXG_Share"],
    "understat_xa_share": ["Understat_POSXA_Share"],
    "rolling_xg_signal": [
        "Rolling_adjusted_XG_per90_both_share",
        "Rolling_adjusted_XG_per90_share",
        "rolling_XG_share",
        "Rolling_adjusted_XG_per90_both",
        "Rolling_adjusted_XG_per90",
        "rolling_XG",
    ],
    "rolling_xa_signal": [
        "Rolling_adjusted_XA_per90_both_share",
        "Rolling_adjusted_XA_per90_share",
        "rolling_XA_share",
        "Rolling_adjusted_XA_per90_both",
        "Rolling_adjusted_XA_per90",
        "rolling_XA",
    ],
    "threat_signal": [
        "Rolling_adjusted_Threat_per90_share",
        "rolling_Threat_share",
        "Threat_Mean_share",
        "Rolling_adjusted_Threat_per90",
        "rolling_Threat",
        "Threat_Mean",
    ],
    "creativity_signal": [
        "Rolling_adjusted_creativity_per90_share",
        "Rolling_creativity_share",
        "Creativity_Mean_share",
        "Rolling_adjusted_creativity_per90",
        "Rolling_creativity",
        "Creativity_Mean",
    ],
    "xg_level": ["expected_goals", "Adjusted_XG", "Rolling_adjusted_XG", "rolling_XG"],
    "xa_level": ["expected_assists", "Adjusted_XA", "Rolling_adjusted_XA", "rolling_XA"],
    "big_chances": ["Big_Chances_share", "Big_Chances"],
    "big_created": ["Big_Chances_Created_share", "Big_Chances_Created"],
}


def parse_float(v, default=0.0) -> float:
    if v is None:
        return None if default is None else float(default)
    s = str(v).strip()
    if not s:
        return None if default is None else float(default)
    try:
        return float(s)
    except Exception:
        return None if default is None else float(default)


def parse_int(v, default=None) -> Optional[int]:
    if v is None:
        return default
    s = str(v).strip()
    if not s:
        return default
    try:
        return int(float(s))
    except Exception:
        return default


def parse_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    try:
        return float(s) > 0
    except Exception:
        pass
    return s in {"1", "true", "t", "yes", "y"}


def parse_dt(v) -> datetime:
    if v is None:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    s = str(v).strip()
    if not s:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)

    s2 = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    fmts = [
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S+00:00",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def safe_div(a: float, b: float, default: float = 0.0) -> float:
    if abs(b) < 1e-12:
        return default
    return a / b


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        out = []
        for r in reader:
            if "" in r:
                r.pop("", None)
            out.append(r)
    return out


def write_csv(path: Path, rows: List[Dict], fieldnames: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def recency_weights(n: int, decay: float) -> List[float]:
    if n <= 0:
        return []
    return [decay ** (n - i - 1) for i in range(n)]


def weighted_mean(values: Iterable[float], weights: Iterable[float], default: float = 0.0) -> float:
    num = 0.0
    den = 0.0
    for v, w in zip(values, weights):
        num += v * w
        den += w
    if den <= 0:
        return default
    return num / den


def weighted_std(values: Iterable[float], weights: Iterable[float], default: float = 0.0) -> float:
    vals = list(values)
    wts = list(weights)
    if not vals or not wts:
        return default
    mu = weighted_mean(vals, wts, default=default)
    den = sum(max(0.0, w) for w in wts)
    if den <= 0:
        return default
    var = 0.0
    for v, w in zip(vals, wts):
        ww = max(0.0, w)
        var += ww * (v - mu) ** 2
    var = var / den
    return math.sqrt(max(0.0, var))


def first_float(row: Dict[str, str], keys: List[str], default: float = 0.0) -> float:
    for k in keys:
        if k in row:
            v = parse_float(row.get(k), default=None)
            if v is not None:
                return float(v)
    return float(default)


def first_float_optional(row: Dict[str, str], keys: List[str]) -> Optional[float]:
    for k in keys:
        if k in row:
            v = parse_float(row.get(k), default=None)
            if v is not None:
                return float(v)
    return None


def normalize_player_name(name: str) -> str:
    s = str(name or "").strip().lower()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
    return "".join(out)


def bounded_unit(v: float, pivot: float = 1.0) -> float:
    x = max(0.0, float(v))
    p = max(1e-6, float(pivot))
    return 1.0 - math.exp(-x / p)


def quantile(values: List[float], q: float, default: float = 0.0) -> float:
    if not values:
        return default
    n = len(values)
    if n == 1:
        return values[0]
    idx = clamp(q, 0.0, 1.0) * (n - 1)
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    if lo == hi:
        return values[lo]
    frac = idx - lo
    return values[lo] * (1.0 - frac) + values[hi] * frac


def quantile_stats(values: List[float]) -> Dict[str, float]:
    if not values:
        return {"count": 0, "q10": 0.0, "q50": 0.0, "q90": 1.0}
    arr = sorted(values)
    q10 = quantile(arr, 0.10, arr[0])
    q50 = quantile(arr, 0.50, arr[len(arr) // 2])
    q90 = quantile(arr, 0.90, arr[-1])
    if q90 <= q10:
        q90 = q10 + max(1e-4, abs(q10) * 0.05 + 1e-4)
    return {"count": len(arr), "q10": q10, "q50": q50, "q90": q90}


def encode_from_stats(value: float, stats: Dict[str, float]) -> float:
    spread = max(1e-6, stats["q90"] - stats["q10"])
    # robust min-max encoding using 10th/90th percentiles to reduce outlier impact
    encoded = clamp((value - stats["q10"]) / spread, 0.0, 1.0)
    return encoded


def load_current_teams(path: Path) -> Tuple[Dict[int, Dict], Dict[int, Dict], List[Dict]]:
    rows = read_csv_rows(path)
    by_id = {}
    by_code = {}
    cleaned = []
    for r in rows:
        tid = parse_int(r.get("id"))
        code = parse_int(r.get("code"))
        name = str(r.get("name", "")).strip()
        if tid is None or code is None or not name:
            continue
        obj = {
            "id": tid,
            "code": code,
            "name": name,
            "strength_attack_home": parse_float(r.get("strength_attack_home"), 1100.0),
            "strength_attack_away": parse_float(r.get("strength_attack_away"), 1100.0),
            "strength_defence_home": parse_float(r.get("strength_defence_home"), 1100.0),
            "strength_defence_away": parse_float(r.get("strength_defence_away"), 1100.0),
            "strength_overall_home": parse_float(r.get("strength_overall_home"), 1100.0),
            "strength_overall_away": parse_float(r.get("strength_overall_away"), 1100.0),
        }
        by_id[tid] = obj
        by_code[code] = obj
        cleaned.append(obj)
    return by_id, by_code, cleaned


def load_current_player_availability(path: Path) -> Dict[int, float]:
    rows = read_csv_rows(path)
    chance_by_element = {}
    for r in rows:
        element = parse_int(r.get("id"))
        code = parse_int(r.get("code"))
        if element is None:
            continue
        chance = parse_float(r.get("chance_of_playing_this_round"), default=None)
        if chance is None:
            chance_by_element[element] = 1.0
        else:
            chance_by_element[element] = clamp(chance / 100.0, 0.0, 1.0)
        if code is not None:
            chance_by_element[code] = chance_by_element[element]
    return chance_by_element


def load_upcoming_fixtures(
    fixture_path: Path,
    team_by_id: Dict[int, Dict],
    horizon_gws: Optional[int],
) -> List[Dict]:
    rows = read_csv_rows(fixture_path)
    upcoming = []
    for r in rows:
        if parse_bool(r.get("finished")):
            continue
        event = parse_int(r.get("event"))
        home_id = parse_int(r.get("team_h"))
        away_id = parse_int(r.get("team_a"))
        if event is None or home_id is None or away_id is None:
            continue
        home_team = team_by_id.get(home_id)
        away_team = team_by_id.get(away_id)
        if not home_team or not away_team:
            continue
        fixture_code = parse_int(r.get("code"), default=parse_int(r.get("id"), default=-1))
        kickoff = parse_dt(r.get("kickoff_time"))
        upcoming.append(
            {
                "fixture_code": fixture_code,
                "GW": event,
                "kickoff_time": kickoff,
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_team_code": home_team["code"],
                "away_team_code": away_team["code"],
                "home_team": home_team["name"],
                "away_team": away_team["name"],
            }
        )

    if not upcoming:
        return []

    upcoming.sort(key=lambda x: (x["GW"], x["kickoff_time"]))
    if horizon_gws is not None and horizon_gws > 0:
        min_gw = min(x["GW"] for x in upcoming)
        max_gw = min_gw + horizon_gws - 1
        upcoming = [x for x in upcoming if x["GW"] <= max_gw]
    return upcoming


def load_historical_fixtures_from_team_history(
    team_history_rows: List[Dict],
    allowed_team_codes: Optional[set] = None,
) -> List[Dict]:
    fixtures = []
    seen = set()
    for r in team_history_rows:
        if not parse_bool(r.get("was_home")):
            continue
        home_code = parse_int(r.get("code"))
        away_code = parse_int(r.get("opponent"))
        if home_code is None or away_code is None:
            continue
        if allowed_team_codes is not None and (home_code not in allowed_team_codes or away_code not in allowed_team_codes):
            continue

        hg = parse_int(first_float(r, ["Plain_GS", "Round_GS", "goals_scored"], 0.0))
        ag = parse_int(first_float(r, ["Plain_GC", "Round_GC", "goals_conceded"], 0.0))
        if hg is None or ag is None:
            continue

        dt = parse_dt(r.get("kickoff_time") or r.get("kickoff_date"))
        season = parse_int(r.get("season"), default=0)
        key = (home_code, away_code, dt.isoformat(), hg, ag)
        if key in seen:
            continue
        seen.add(key)
        fixtures.append(
            {
                "home_code": home_code,
                "away_code": away_code,
                "hg": int(hg),
                "ag": int(ag),
                "dt": dt,
                "season": season,
            }
        )

    fixtures.sort(key=lambda x: x["dt"])
    return fixtures


def poisson_outcome_probs(lambda_home: float, lambda_away: float, max_goals: int = 10) -> Tuple[float, float, float]:
    lam_h = max(0.01, lambda_home)
    lam_a = max(0.01, lambda_away)
    ph = [math.exp(-lam_h)]
    pa = [math.exp(-lam_a)]
    for k in range(1, max_goals + 1):
        ph.append(ph[-1] * lam_h / k)
        pa.append(pa[-1] * lam_a / k)

    # absorb tail mass into last bin
    ph[-1] += max(0.0, 1.0 - sum(ph))
    pa[-1] += max(0.0, 1.0 - sum(pa))

    p_home = 0.0
    p_draw = 0.0
    for h in range(max_goals + 1):
        for a in range(max_goals + 1):
            p = ph[h] * pa[a]
            if h > a:
                p_home += p
            elif h == a:
                p_draw += p
    p_away = max(0.0, 1.0 - p_home - p_draw)
    return p_home, p_draw, p_away


def poisson_log_pmf(k: int, lmbda: float) -> float:
    lmbda = max(1e-9, float(lmbda))
    k = max(0, int(k))
    return -lmbda + k * math.log(lmbda) - math.lgamma(k + 1.0)


def statistical_xg_mu(
    own_xg: float,
    own_xg_avg: float,
    opp_xgc: float,
    opp_xgc_avg: float,
) -> float:
    off_fac = 0.7 * max(0.05, own_xg) + 0.3 * max(0.05, own_xg_avg)
    def_fac = 0.7 * max(0.05, opp_xgc) + 0.3 * max(0.05, opp_xgc_avg)
    eta = (
        STAT_XG_INTERCEPT
        + STAT_XG_OFF_COEF * off_fac
        + STAT_XG_DEF_COEF * def_fac
        + STAT_XG_INTERACTION_COEF * off_fac * def_fac
    )
    return clamp(math.exp(STAT_XG_EXP_SCALE * eta), 0.10, 3.60)


def statistical_cs_probability(own_xgc: float, opp_xg: float) -> float:
    inner = (
        STAT_CS_INTERCEPT
        + STAT_CS_OWN_XGC_COEF * max(0.05, own_xgc)
        + STAT_CS_OPP_XG_COEF * max(0.05, opp_xg)
        + STAT_CS_INTERACTION_COEF * max(0.05, own_xgc) * max(0.05, opp_xg)
    )
    p = math.exp(-math.exp(inner))
    return clamp(p, 0.02, 0.88)


def calibrate_clean_sheet_pct(raw_pct: float) -> float:
    return clamp(
        CLEAN_SHEET_SHRINK * raw_pct + (1.0 - CLEAN_SHEET_SHRINK) * BASELINE_CLEAN_SHEET_PCT,
        6.0,
        72.0,
    )


def team_defensive_cs_strength(team_profile: Dict, league: Dict, is_home: bool) -> float:
    if is_home:
        base_def = max(0.20, team_profile.get("defence_home", league["home_xgc"]))
        lg = max(0.20, league["home_xgc"])
    else:
        base_def = max(0.20, team_profile.get("defence_away", league["away_xgc"]))
        lg = max(0.20, league["away_xgc"])

    venue_strength = safe_div(lg, base_def, 1.0)
    form_strength = safe_div(1.0, max(0.70, team_profile.get("form_defence_ratio", 1.0)), 1.0)
    vuln_strength = safe_div(1.0, max(0.70, team_profile.get("defence_vulnerability_ratio", 1.0)), 1.0)

    strength = math.exp(
        0.58 * math.log(max(0.40, venue_strength))
        + 0.28 * math.log(max(0.55, form_strength))
        + 0.14 * math.log(max(0.55, vuln_strength))
    )
    return clamp(strength, 0.78, 1.34)


def adjust_clean_sheet_pct_for_team(
    raw_pct: float,
    team_profile: Dict,
    opponent_profile: Dict,
    league: Dict,
    is_home: bool,
) -> float:
    base = calibrate_clean_sheet_pct(raw_pct)
    strength = team_defensive_cs_strength(team_profile, league, is_home)
    vuln = clamp(team_profile.get("defence_vulnerability_ratio", 1.0), 0.70, 1.35)
    elo = float(team_profile.get("elo", 1000.0))
    elo_factor = clamp((elo - CS_BONUS_ELO_CENTER) / CS_BONUS_ELO_SPREAD + 0.50, 0.25, 1.00)
    mult = (1.0 + (CS_DEF_STRENGTH_BONUS * elo_factor) * (strength - 1.0)) * (1.0 - CS_DEF_VULN_PENALTY * (vuln - 1.0))
    if elo < 1120.0:
        mult *= clamp(1.0 - 0.05 * safe_div(1120.0 - elo, 170.0, 0.0), 0.95, 1.00)
    adjusted = base * mult

    # Cap defensive uplift against elite attacking opponents.
    if is_home:
        opp_attack_model = float(opponent_profile.get("attack_away", league["away_xg"]))
        opp_attack_current = float(opponent_profile.get("current_attack_away", opp_attack_model))
        opp_base = max(0.25, league["away_xg"])
    else:
        opp_attack_model = float(opponent_profile.get("attack_home", league["home_xg"]))
        opp_attack_current = float(opponent_profile.get("current_attack_home", opp_attack_model))
        opp_base = max(0.25, league["home_xg"])
    opp_attack = safe_div(max(opp_attack_model, opp_attack_current), opp_base, 1.0)
    opp_elo = max(float(opponent_profile.get("elo", 1000.0)), float(opponent_profile.get("current_elo", 1000.0)))
    opp_quality = clamp(
        0.62 * clamp((opp_attack - 0.95) / 0.45, 0.0, 1.5)
        + 0.38 * clamp((opp_elo - 1110.0) / 170.0, 0.0, 1.5),
        0.0,
        1.5,
    )
    max_uplift = clamp(CS_UPLIFT_MAX_WEAK_OPP - 2.2 * opp_quality, CS_UPLIFT_MIN_ELITE_OPP, CS_UPLIFT_MAX_WEAK_OPP)
    if not is_home:
        max_uplift *= 0.72
    adjusted = min(adjusted, raw_pct + max_uplift)

    # Extra away-side guardrail: very strong home attacks reduce away CS calibration.
    if not is_home:
        elite_attack = clamp((safe_div(opp_attack_current, opp_base, 1.0) - 1.00) / 0.22, 0.0, 1.0)
        elite_elo = clamp((float(opponent_profile.get("current_elo", 1000.0)) - 1200.0) / 120.0, 0.0, 1.0)
        elite_pressure = max(elite_attack, elite_elo)
        if elite_pressure > 0.0:
            adjusted = min(adjusted, raw_pct - (0.8 + 2.2 * elite_pressure))

    # Blend with statistical CS prior from Generate_Team_Predictions formula.
    if is_home:
        own_xgc = float(team_profile.get("defence_home", league["home_xgc"]))
        opp_xg = float(opponent_profile.get("attack_away", league["away_xg"]))
    else:
        own_xgc = float(team_profile.get("defence_away", league["away_xgc"]))
        opp_xg = float(opponent_profile.get("attack_home", league["home_xg"]))
    stat_cs_pct = 100.0 * statistical_cs_probability(own_xgc=own_xgc, opp_xg=opp_xg)
    adjusted = (1.0 - TEAM_STAT_CS_BLEND) * adjusted + TEAM_STAT_CS_BLEND * stat_cs_pct

    return clamp(adjusted, 5.0, 78.0)


def get_tunable_params() -> Dict[str, float]:
    return {
        "HOME_ADVANTAGE_MULTIPLIER": HOME_ADVANTAGE_MULTIPLIER,
        "ELO_DIVISOR": ELO_DIVISOR,
        "CURRENT_STRENGTH_BLEND": CURRENT_STRENGTH_BLEND,
        "MODEL_SHRINK_TO_LEAGUE": MODEL_SHRINK_TO_LEAGUE,
        "TEAM_STYLE_BLEND": TEAM_STYLE_BLEND,
        "HOME_LAMBDA_ADJUST": HOME_LAMBDA_ADJUST,
        "AWAY_LAMBDA_ADJUST": AWAY_LAMBDA_ADJUST,
        "CLEAN_SHEET_SHRINK": CLEAN_SHEET_SHRINK,
        "BASELINE_CLEAN_SHEET_PCT": BASELINE_CLEAN_SHEET_PCT,
        "PLAYER_BLEND_CURRENT": PLAYER_BLEND_CURRENT,
        "PLAYER_CONTRIB_BASE": PLAYER_CONTRIB_BASE,
        "PLAYER_CONTRIB_MULT": PLAYER_CONTRIB_MULT,
        "PLAYER_GOAL_SCALE": PLAYER_GOAL_SCALE,
        "PLAYER_ASSIST_SCALE": PLAYER_ASSIST_SCALE,
        "PLAYER_MINUTES_EXP": PLAYER_MINUTES_EXP,
        "PLAYER_GOAL_RATE_BASE": PLAYER_GOAL_RATE_BASE,
        "PLAYER_ASSIST_RATE_BASE": PLAYER_ASSIST_RATE_BASE,
        "TEAM_STAT_XG_BLEND": TEAM_STAT_XG_BLEND,
        "TEAM_STAT_CS_BLEND": TEAM_STAT_CS_BLEND,
        "TEAM_SHOCK_STD_BASE": TEAM_SHOCK_STD_BASE,
        "TEAM_SHOCK_STD_SCALE": TEAM_SHOCK_STD_SCALE,
    }


def apply_tunable_params(params: Dict[str, float]) -> None:
    global HOME_ADVANTAGE_MULTIPLIER
    global ELO_DIVISOR
    global CURRENT_STRENGTH_BLEND
    global MODEL_SHRINK_TO_LEAGUE
    global TEAM_STYLE_BLEND
    global HOME_LAMBDA_ADJUST
    global AWAY_LAMBDA_ADJUST
    global CLEAN_SHEET_SHRINK
    global BASELINE_CLEAN_SHEET_PCT
    global PLAYER_BLEND_CURRENT
    global PLAYER_CONTRIB_BASE
    global PLAYER_CONTRIB_MULT
    global PLAYER_GOAL_SCALE
    global PLAYER_ASSIST_SCALE
    global PLAYER_MINUTES_EXP
    global PLAYER_GOAL_RATE_BASE
    global PLAYER_ASSIST_RATE_BASE
    global TEAM_STAT_XG_BLEND
    global TEAM_STAT_CS_BLEND
    global TEAM_SHOCK_STD_BASE
    global TEAM_SHOCK_STD_SCALE

    HOME_ADVANTAGE_MULTIPLIER = float(params["HOME_ADVANTAGE_MULTIPLIER"])
    ELO_DIVISOR = float(params["ELO_DIVISOR"])
    CURRENT_STRENGTH_BLEND = float(params["CURRENT_STRENGTH_BLEND"])
    MODEL_SHRINK_TO_LEAGUE = float(params["MODEL_SHRINK_TO_LEAGUE"])
    TEAM_STYLE_BLEND = float(params["TEAM_STYLE_BLEND"])
    HOME_LAMBDA_ADJUST = float(params["HOME_LAMBDA_ADJUST"])
    AWAY_LAMBDA_ADJUST = float(params["AWAY_LAMBDA_ADJUST"])
    CLEAN_SHEET_SHRINK = float(params["CLEAN_SHEET_SHRINK"])
    BASELINE_CLEAN_SHEET_PCT = float(params["BASELINE_CLEAN_SHEET_PCT"])
    PLAYER_BLEND_CURRENT = float(params["PLAYER_BLEND_CURRENT"])
    PLAYER_CONTRIB_BASE = float(params["PLAYER_CONTRIB_BASE"])
    PLAYER_CONTRIB_MULT = float(params["PLAYER_CONTRIB_MULT"])
    PLAYER_GOAL_SCALE = float(params["PLAYER_GOAL_SCALE"])
    PLAYER_ASSIST_SCALE = float(params["PLAYER_ASSIST_SCALE"])
    PLAYER_MINUTES_EXP = float(params["PLAYER_MINUTES_EXP"])
    PLAYER_GOAL_RATE_BASE = float(params["PLAYER_GOAL_RATE_BASE"])
    PLAYER_ASSIST_RATE_BASE = float(params["PLAYER_ASSIST_RATE_BASE"])
    TEAM_STAT_XG_BLEND = float(params["TEAM_STAT_XG_BLEND"])
    TEAM_STAT_CS_BLEND = float(params["TEAM_STAT_CS_BLEND"])
    TEAM_SHOCK_STD_BASE = float(params["TEAM_SHOCK_STD_BASE"])
    TEAM_SHOCK_STD_SCALE = float(params["TEAM_SHOCK_STD_SCALE"])


# Remaining simulator implementation below


def build_team_profiles(team_history_rows: List[Dict], current_teams_by_code: Dict[int, Dict]) -> Tuple[Dict[int, Dict], Dict]:
    by_team = defaultdict(list)
    all_home_xg = []
    all_away_xg = []
    all_home_xgc = []
    all_away_xgc = []
    all_threat = []
    all_threat_against = []
    all_deep = []
    all_deep_allowed = []
    all_xpts = []
    all_ppda = []
    all_ppda_allowed = []

    for r in team_history_rows:
        code = parse_int(r.get("code"))
        if code is None:
            continue
        was_home = parse_bool(r.get("was_home"))
        xg = max(0.01, first_float(r, ["XG", "Plain_XG", "Round_XG"], 1.2))
        xgc = max(0.01, first_float(r, ["XGC", "Plain_XGC"], 1.2))
        cs = clamp(first_float(r, ["Clean_Sheet"], 0.30), 0.0, 1.0)
        elo = first_float(r, ["Elo_Rating"], 1000.0)
        xg_slope = first_float(r, ["XG_slope", "XG_neutral_slope"], 0.0)
        xgc_slope = first_float(r, ["XGC_slope", "XGC_neutral_slope"], 0.0)
        rolling_threat = max(0.01, first_float(r, ["Rolling_Threat"], 1.0))
        rolling_threat_against = max(0.01, first_float(r, ["Rolling_Threat_Against"], 1.0))
        roll10_deep = max(0.01, first_float(r, ["roll10_deep"], 0.1))
        roll10_deep_allowed = max(0.01, first_float(r, ["roll10_deep_allowed"], 0.1))
        roll10_xpts = max(0.05, first_float(r, ["roll10_xpts"], 1.0))
        roll10_ppda = max(0.01, first_float(r, ["roll10_ppda"], 0.1))
        roll10_ppda_allowed = max(0.01, first_float(r, ["roll10_ppda_allowed"], 0.1))
        dt = parse_dt(r.get("kickoff_time") or r.get("kickoff_date"))
        by_team[code].append(
            {
                "dt": dt,
                "was_home": was_home,
                "xg": xg,
                "xgc": xgc,
                "cs": cs,
                "elo": elo,
                "xg_slope": xg_slope,
                "xgc_slope": xgc_slope,
                "rolling_threat": rolling_threat,
                "rolling_threat_against": rolling_threat_against,
                "roll10_deep": roll10_deep,
                "roll10_deep_allowed": roll10_deep_allowed,
                "roll10_xpts": roll10_xpts,
                "roll10_ppda": roll10_ppda,
                "roll10_ppda_allowed": roll10_ppda_allowed,
            }
        )
        if was_home:
            all_home_xg.append(xg)
            all_home_xgc.append(xgc)
        else:
            all_away_xg.append(xg)
            all_away_xgc.append(xgc)
        all_threat.append(rolling_threat)
        all_threat_against.append(rolling_threat_against)
        all_deep.append(roll10_deep)
        all_deep_allowed.append(roll10_deep_allowed)
        all_xpts.append(roll10_xpts)
        all_ppda.append(roll10_ppda)
        all_ppda_allowed.append(roll10_ppda_allowed)

    league = {
        "home_xg": sum(all_home_xg) / max(1, len(all_home_xg)),
        "away_xg": sum(all_away_xg) / max(1, len(all_away_xg)),
        "home_xgc": sum(all_home_xgc) / max(1, len(all_home_xgc)),
        "away_xgc": sum(all_away_xgc) / max(1, len(all_away_xgc)),
        "rolling_threat": sum(all_threat) / max(1, len(all_threat)),
        "rolling_threat_against": sum(all_threat_against) / max(1, len(all_threat_against)),
        "roll10_deep": sum(all_deep) / max(1, len(all_deep)),
        "roll10_deep_allowed": sum(all_deep_allowed) / max(1, len(all_deep_allowed)),
        "roll10_xpts": sum(all_xpts) / max(1, len(all_xpts)),
        "roll10_ppda": sum(all_ppda) / max(1, len(all_ppda)),
        "roll10_ppda_allowed": sum(all_ppda_allowed) / max(1, len(all_ppda_allowed)),
    }
    league["home_xg"] = league["home_xg"] or 1.45
    league["away_xg"] = league["away_xg"] or 1.22
    league["home_xgc"] = league["home_xgc"] or 1.22
    league["away_xgc"] = league["away_xgc"] or 1.45
    league["rolling_threat"] = league["rolling_threat"] or 70.0
    league["rolling_threat_against"] = league["rolling_threat_against"] or 70.0
    league["roll10_deep"] = league["roll10_deep"] or 0.18
    league["roll10_deep_allowed"] = league["roll10_deep_allowed"] or 0.18
    league["roll10_xpts"] = league["roll10_xpts"] or 1.35
    league["roll10_ppda"] = league["roll10_ppda"] or 0.13
    league["roll10_ppda_allowed"] = league["roll10_ppda_allowed"] or 0.13

    profiles = {}

    def derive_from_current(row: Dict) -> Dict:
        ah = parse_float(row.get("strength_attack_home"), 1100.0)
        aa = parse_float(row.get("strength_attack_away"), 1100.0)
        dh = parse_float(row.get("strength_defence_home"), 1100.0)
        da = parse_float(row.get("strength_defence_away"), 1100.0)
        oh = parse_float(row.get("strength_overall_home"), 1100.0)
        oa = parse_float(row.get("strength_overall_away"), 1100.0)
        elo = (oh + oa) / 2.0
        return {
            "attack_home": league["home_xg"] * (ah / 1100.0),
            "attack_away": league["away_xg"] * (aa / 1100.0),
            "defence_home": league["home_xgc"] * (1100.0 / max(650.0, dh)),
            "defence_away": league["away_xgc"] * (1100.0 / max(650.0, da)),
            "attack_avg": 0.5 * (league["home_xg"] * (ah / 1100.0) + league["away_xg"] * (aa / 1100.0)),
            "defence_avg": 0.5 * (
                league["home_xgc"] * (1100.0 / max(650.0, dh))
                + league["away_xgc"] * (1100.0 / max(650.0, da))
            ),
            "form_attack_ratio": 1.0,
            "form_defence_ratio": 1.0,
            "xg_slope": 0.0,
            "xgc_slope": 0.0,
            "elo": elo,
            "sample_count": 0,
            "attack_style_ratio": 1.0,
            "defence_vulnerability_ratio": 1.0,
            "current_attack_home": league["home_xg"] * (ah / 1100.0),
            "current_attack_away": league["away_xg"] * (aa / 1100.0),
            "current_attack_avg": 0.5 * (league["home_xg"] * (ah / 1100.0) + league["away_xg"] * (aa / 1100.0)),
            "current_elo": elo,
            "attack_shock_std_home": TEAM_SHOCK_STD_BASE,
            "attack_shock_std_away": TEAM_SHOCK_STD_BASE,
        }

    for team_code, cur in current_teams_by_code.items():
        rows = sorted(by_team.get(team_code, []), key=lambda x: x["dt"])
        hist_profile = None
        if rows:
            recent = rows[-RECENT_TEAM_MATCH_WINDOW:]
            w = recency_weights(len(recent), TEAM_RECENCY_DECAY)

            def metric(key: str, home_flag: Optional[bool], fallback: float) -> float:
                vals = []
                ws = []
                for item, ww in zip(recent, w):
                    if home_flag is not None and item["was_home"] != home_flag:
                        continue
                    vals.append(item[key])
                    ws.append(ww)
                if not vals:
                    return fallback
                return weighted_mean(vals, ws, fallback)

            overall_attack = metric("xg", None, league["home_xg"])
            overall_defence = metric("xgc", None, league["away_xgc"])
            recent_attack = weighted_mean([x["xg"] for x in recent[-6:]], recency_weights(min(6, len(recent)), 0.9), overall_attack)
            recent_defence = weighted_mean([x["xgc"] for x in recent[-6:]], recency_weights(min(6, len(recent)), 0.9), overall_defence)
            latest = recent[-1]

            hist_profile = {
                "attack_home": metric("xg", True, overall_attack),
                "attack_away": metric("xg", False, overall_attack),
                "defence_home": metric("xgc", True, overall_defence),
                "defence_away": metric("xgc", False, overall_defence),
                "attack_avg": overall_attack,
                "defence_avg": overall_defence,
                "form_attack_ratio": clamp(safe_div(recent_attack, max(0.25, overall_attack), 1.0), 0.70, 1.35),
                "form_defence_ratio": clamp(safe_div(recent_defence, max(0.25, overall_defence), 1.0), 0.70, 1.35),
                "xg_slope": clamp(latest["xg_slope"], -0.6, 0.6),
                "xgc_slope": clamp(latest["xgc_slope"], -0.6, 0.6),
                "elo": latest["elo"],
                "sample_count": len(rows),
                "attack_style_ratio": clamp(
                    math.exp(
                        0.22 * math.log(max(0.15, metric("rolling_threat", None, league["rolling_threat"]) / max(0.15, league["rolling_threat"])))
                        + 0.16 * math.log(max(0.10, metric("roll10_deep", None, league["roll10_deep"]) / max(0.10, league["roll10_deep"])))
                        + 0.14 * math.log(max(0.20, metric("roll10_xpts", None, league["roll10_xpts"]) / max(0.20, league["roll10_xpts"])))
                    ),
                    0.82,
                    1.24,
                ),
                "defence_vulnerability_ratio": clamp(
                    math.exp(
                        0.22 * math.log(max(0.15, metric("rolling_threat_against", None, league["rolling_threat_against"]) / max(0.15, league["rolling_threat_against"])))
                        + 0.16 * math.log(max(0.10, metric("roll10_deep_allowed", None, league["roll10_deep_allowed"]) / max(0.10, league["roll10_deep_allowed"])))
                        + 0.10 * math.log(max(0.05, metric("roll10_ppda_allowed", None, league["roll10_ppda_allowed"]) / max(0.05, league["roll10_ppda_allowed"])))
                        - 0.08 * math.log(max(0.05, metric("roll10_ppda", None, league["roll10_ppda"]) / max(0.05, league["roll10_ppda"])))
                    ),
                    0.78,
                    1.30,
                ),
            }

        cur_profile = derive_from_current(cur)
        if hist_profile is None:
            profiles[team_code] = cur_profile
        else:
            b = CURRENT_STRENGTH_BLEND
            profiles[team_code] = {
                "attack_home": (1 - b) * hist_profile["attack_home"] + b * cur_profile["attack_home"],
                "attack_away": (1 - b) * hist_profile["attack_away"] + b * cur_profile["attack_away"],
                "defence_home": (1 - b) * hist_profile["defence_home"] + b * cur_profile["defence_home"],
                "defence_away": (1 - b) * hist_profile["defence_away"] + b * cur_profile["defence_away"],
                "attack_avg": (1 - b) * hist_profile["attack_avg"] + b * cur_profile["attack_avg"],
                "defence_avg": (1 - b) * hist_profile["defence_avg"] + b * cur_profile["defence_avg"],
                "form_attack_ratio": hist_profile["form_attack_ratio"],
                "form_defence_ratio": hist_profile["form_defence_ratio"],
                "xg_slope": hist_profile["xg_slope"],
                "xgc_slope": hist_profile["xgc_slope"],
                "elo": (1 - b) * hist_profile["elo"] + b * cur_profile["elo"],
                "sample_count": hist_profile["sample_count"],
                "attack_style_ratio": hist_profile["attack_style_ratio"],
                "defence_vulnerability_ratio": hist_profile["defence_vulnerability_ratio"],
                "current_attack_home": cur_profile["current_attack_home"],
                "current_attack_away": cur_profile["current_attack_away"],
                "current_attack_avg": cur_profile["current_attack_avg"],
                "current_elo": cur_profile["current_elo"],
                "attack_shock_std_home": TEAM_SHOCK_STD_BASE,
                "attack_shock_std_away": TEAM_SHOCK_STD_BASE,
            }

    return profiles, league


def attach_team_shock_stds_from_history(
    team_history_rows: List[Dict],
    team_profiles: Dict[int, Dict],
    league: Dict,
    allowed_team_codes: Optional[set] = None,
) -> None:
    fixtures_hist = load_historical_fixtures_from_team_history(
        team_history_rows,
        allowed_team_codes=allowed_team_codes,
    )
    if not fixtures_hist:
        return

    residual_home = defaultdict(list)
    residual_away = defaultdict(list)
    all_residuals = []

    for fx in fixtures_hist:
        hp = team_profiles.get(fx["home_code"])
        ap = team_profiles.get(fx["away_code"])
        if hp is None or ap is None:
            continue
        lh, la = estimate_match_lambdas(hp, ap, league)
        r_h = math.log(clamp(safe_div(fx["hg"] + 0.35, lh + 0.35, 1.0), 0.20, 4.80))
        r_a = math.log(clamp(safe_div(fx["ag"] + 0.35, la + 0.35, 1.0), 0.20, 4.80))
        residual_home[fx["home_code"]].append(r_h)
        residual_away[fx["away_code"]].append(r_a)
        all_residuals.append(r_h)
        all_residuals.append(r_a)

    if not all_residuals:
        return

    def std(vals: List[float], fallback: float) -> float:
        n = len(vals)
        if n <= 1:
            return fallback
        m = sum(vals) / n
        var = sum((x - m) ** 2 for x in vals) / max(1, n - 1)
        return math.sqrt(max(0.0, var))

    global_std = std(all_residuals, TEAM_SHOCK_STD_BASE)
    global_sigma = clamp(
        TEAM_SHOCK_STD_BASE + TEAM_SHOCK_STD_SCALE * global_std,
        TEAM_SHOCK_STD_MIN,
        TEAM_SHOCK_STD_MAX,
    )

    for code, profile in team_profiles.items():
        h_std = std(residual_home.get(code, []), global_std)
        a_std = std(residual_away.get(code, []), global_std)
        profile["attack_shock_std_home"] = clamp(
            TEAM_SHOCK_STD_BASE + TEAM_SHOCK_STD_SCALE * h_std,
            TEAM_SHOCK_STD_MIN,
            TEAM_SHOCK_STD_MAX,
        )
        profile["attack_shock_std_away"] = clamp(
            TEAM_SHOCK_STD_BASE + TEAM_SHOCK_STD_SCALE * a_std,
            TEAM_SHOCK_STD_MIN,
            TEAM_SHOCK_STD_MAX,
        )
        if not math.isfinite(profile["attack_shock_std_home"]):
            profile["attack_shock_std_home"] = global_sigma
        if not math.isfinite(profile["attack_shock_std_away"]):
            profile["attack_shock_std_away"] = global_sigma


def build_player_profiles(
    player_history_rows: List[Dict],
    current_players_chance: Dict[int, float],
    current_team_codes: set,
) -> Tuple[Dict[int, List[Dict]], Dict[int, float]]:
    by_player = defaultdict(list)
    team_goals = defaultdict(float)
    team_assists = defaultdict(float)

    for r in player_history_rows:
        element = parse_int(r.get("element"))
        name = str(r.get("name", "")).strip()
        team_code = parse_int(r.get("Team"), default=parse_int(r.get("team_code")))
        if not name or team_code is None:
            continue
        if team_code not in current_team_codes:
            continue
        if element is None:
            element = -abs(hash(name)) % (10**8)

        dt = parse_dt(r.get("kickoff_time"))
        minutes = max(0.0, first_float(r, ["minutes"], 0.0))
        goals = max(0.0, first_float(r, ["goals_scored"], 0.0))
        assists = max(0.0, first_float(r, ["assists"], 0.0))
        by_player[element].append(
            {
                "dt": dt,
                "row": r,
                "name": name,
                "team_code": team_code,
                "minutes": minutes,
                "goals": goals,
                "assists": assists,
                "position": str(r.get("position", "")).strip() or "UNK",
            }
        )
        team_goals[team_code] += goals
        team_assists[team_code] += assists

    team_assist_ratio = {}
    for team_code in current_team_codes:
        ratio = safe_div(team_assists.get(team_code, 0.0), max(0.5, team_goals.get(team_code, 0.0)), DEFAULT_ASSIST_RATIO)
        team_assist_ratio[team_code] = clamp(ratio, 0.40, 0.84)

    profiles_by_team = defaultdict(list)

    for element, rows in by_player.items():
        rows.sort(key=lambda x: x["dt"])
        latest = rows[-1]
        recent = rows[-RECENT_PLAYER_MATCH_WINDOW:]
        wr = recency_weights(len(recent), PLAYER_RECENCY_DECAY)

        minutes_values = [x["minutes"] for x in recent]
        recent_minutes = weighted_mean(minutes_values, wr, 0.0)
        minutes_total = sum(minutes_values)

        goals_total = sum(x["goals"] for x in recent)
        assists_total = sum(x["assists"] for x in recent)
        goal_rate90 = safe_div(goals_total * 90.0, max(1.0, minutes_total), 0.0)
        assist_rate90 = safe_div(assists_total * 90.0, max(1.0, minutes_total), 0.0)

        latest_row = latest["row"]
        avg_minutes = first_float(latest_row, ["average_minutes", "Avg_Minutes"], recent_minutes)
        expected_minutes_base = 0.65 * recent_minutes + 0.35 * avg_minutes

        available_flag = parse_bool(latest_row.get("available")) if "available" in latest_row else True
        chance_factor = current_players_chance.get(element, 1.0)
        availability_mult = (1.0 if available_flag else UNAVAILABLE_PLAYER_PENALTY) * chance_factor
        expected_minutes = clamp(expected_minutes_base * availability_mult, 0.0, 90.0)
        start_probability = clamp(safe_div(expected_minutes, 82.0, 0.03), 0.03, 0.99)

        if expected_minutes < MIN_PLAYER_EXPECTED_MINUTES:
            continue

        xg_rate = safe_div(
            sum(max(0.0, first_float(x["row"], ["expected_goals", "Adjusted_XG", "rolling_XG"], 0.0)) for x in recent) * 90.0,
            max(1.0, minutes_total),
            0.0,
        )
        xa_rate = safe_div(
            sum(max(0.0, first_float(x["row"], ["expected_assists", "Adjusted_XA", "rolling_XA"], 0.0)) for x in recent) * 90.0,
            max(1.0, minutes_total),
            0.0,
        )

        latest_share_xg = first_float(latest_row, ["Share_of_XG", "Share_of_XG_Short", "Share_of_XG_share"], 0.0)
        latest_share_xa = first_float(latest_row, ["Share_of_XA", "Share_of_XA_Short", "Share_of_XA_share"], 0.0)
        latest_goal_stats = first_float(
            latest_row,
            ["Goal_Statistics", "Goal_Statistics_share", "Rolling_adjusted_XG_per90_both", "Rolling_adjusted_XG_per90"],
            0.0,
        )
        latest_assist_stats = first_float(
            latest_row,
            ["Assist_Statistics", "Assist_Statistics_share", "Rolling_adjusted_XA_per90_both", "Rolling_adjusted_XA_per90"],
            0.0,
        )
        threat = first_float(latest_row, ["rolling_Threat", "Threat", "Threat_Mean"], 0.0)
        creativity = first_float(latest_row, ["rolling_creativity", "creativity", "Creativity_Mean"], 0.0)

        overscore = clamp(first_float(latest_row, ["Average_Overscore"], 1.0), 0.85, 1.20)
        overassist = clamp(first_float(latest_row, ["Average_OverAssist"], 1.0), 0.85, 1.15)

        goal_signal = (
            0.36 * goal_rate90
            + 0.20 * xg_rate
            + 0.14 * clamp(latest_goal_stats, 0.0, 2.5)
            + 0.14 * clamp(latest_share_xg, 0.0, 1.0)
            + 0.16 * clamp(threat / 100.0, 0.0, 1.8)
        ) * overscore

        assist_signal = (
            0.34 * assist_rate90
            + 0.22 * xa_rate
            + 0.16 * clamp(latest_assist_stats, 0.0, 2.5)
            + 0.14 * clamp(latest_share_xa, 0.0, 1.0)
            + 0.14 * clamp(creativity / 100.0, 0.0, 1.8)
        ) * overassist

        goal_weight = max(1e-5, goal_signal * (expected_minutes / 90.0) ** 1.12 * start_probability)
        assist_weight = max(1e-5, assist_signal * (expected_minutes / 90.0) ** 1.08 * start_probability)

        team_code = latest["team_code"]
        profile = {
            "player_key": f"{element}:{latest['name']}",
            "element": element,
            "name": latest["name"],
            "team_code": team_code,
            "position": latest["position"],
            "expected_minutes": round(expected_minutes, 2),
            "start_probability": round(start_probability, 4),
            "goal_weight": goal_weight,
            "assist_weight": assist_weight,
        }
        profiles_by_team[team_code].append(profile)

    for team_code, plist in profiles_by_team.items():
        plist.sort(key=lambda x: (x["goal_weight"] + x["assist_weight"]), reverse=True)
        profiles_by_team[team_code] = plist[:MAX_PLAYERS_PER_TEAM_PER_FIXTURE]

    return profiles_by_team, team_assist_ratio


def canonical_position(pos: str) -> str:
    p = str(pos or "").strip().upper()
    if p in {"GKP", "GK", "GOALKEEPER"}:
        return "GKP"
    if p in {"DEF", "D", "DEFENDER"}:
        return "DEF"
    if p in {"MID", "M", "MIDFIELDER"}:
        return "MID"
    if p in {"FWD", "FW", "ST", "STRIKER", "FORWARD"}:
        return "FWD"
    return "UNK"


def extract_player_feature_values(row: Dict) -> Dict[str, float]:
    feats = {}
    for feature, keys in PLAYER_FEATURE_COLUMNS.items():
        v = first_float_optional(row, keys)
        feats[feature] = max(0.0, v) if v is not None else 0.0

    feats["risk"] = clamp(first_float(row, ["player_risiko"], 0.0), 0.0, 1.0)
    feats["overscore"] = clamp(first_float(row, ["Average_Overscore"], 1.0), 0.85, 1.18)
    feats["overassist"] = clamp(first_float(row, ["Average_OverAssist"], 1.0), 0.85, 1.16)
    feats["pen_data"] = max(0.0, first_float(row, ["Team_Pen_Data"], 0.0) * first_float(row, ["Pen_Number"], 0.0))
    return feats


def build_player_feature_encoder(player_history_rows: List[Dict]) -> Dict:
    global_metric_values = defaultdict(list)
    pos_metric_values = defaultdict(lambda: defaultdict(list))

    for row in player_history_rows:
        name = str(row.get("name", "")).strip()
        if not name or name == "0":
            continue
        mins = max(0.0, first_float(row, ["minutes"], 0.0))
        if mins <= 0:
            continue
        pos = canonical_position(row.get("position", ""))
        feats = extract_player_feature_values(row)
        for metric in PLAYER_FEATURE_COLUMNS.keys():
            val = feats.get(metric, 0.0)
            global_metric_values[metric].append(val)
            pos_metric_values[pos][metric].append(val)

    global_stats = {metric: quantile_stats(vals) for metric, vals in global_metric_values.items()}
    pos_stats = {}
    for pos, metric_map in pos_metric_values.items():
        pos_stats[pos] = {metric: quantile_stats(vals) for metric, vals in metric_map.items()}

    return {"global": global_stats, "by_pos": pos_stats}


def encode_player_feature_map(feature_values: Dict[str, float], position: str, encoder: Dict) -> Dict[str, float]:
    out = {}
    pos = canonical_position(position)
    pos_map = encoder.get("by_pos", {}).get(pos, {})
    global_map = encoder.get("global", {})

    for metric, raw in feature_values.items():
        if metric not in PLAYER_FEATURE_COLUMNS:
            continue
        global_stats = global_map.get(metric)
        if global_stats is None:
            out[metric] = bounded_unit(raw, 1.0)
            continue

        pos_stats = pos_map.get(metric)
        enc_global = encode_from_stats(raw, global_stats)
        if pos_stats is None or pos_stats.get("count", 0) < 50:
            encoded = enc_global
        else:
            enc_pos = encode_from_stats(raw, pos_stats)
            pos_weight = clamp(safe_div(pos_stats["count"] - 50.0, 200.0, 0.0), 0.25, 0.80)
            encoded = pos_weight * enc_pos + (1.0 - pos_weight) * enc_global
        out[metric] = (1.0 - PLAYER_FEATURE_PRIOR_SHRINK) * encoded + PLAYER_FEATURE_PRIOR_SHRINK * 0.50

    return out


def normalize_nonnegative_shares(values: List[float]) -> List[float]:
    total = sum(max(0.0, v) for v in values)
    if total <= 0:
        return [0.0 for _ in values]
    return [max(0.0, v) / total for v in values]


def visual_goal_share_formula(
    goal_stats_share: float,
    threat_share: float,
    big_chances: float,
    rolling_adj_xg: float,
    share_xg: float,
    share_xg_short: float,
    risk: float,
    understat_pos_share: float,
    overscore_factor: float,
    minute_share: float,
) -> float:
    base_share = (
        (goal_stats_share * 0.35 + threat_share * 0.2)
        + 0.1 * bounded_unit(big_chances / 3.0, 0.50)
        + 0.1 * bounded_unit(rolling_adj_xg, 0.65)
        + 0.25 * (0.7 * share_xg + 0.3 * share_xg_short)
    )
    blended = base_share * (1.0 - risk) + risk * understat_pos_share
    return blended * overscore_factor * minute_share


def visual_assist_share_formula(
    assist_stats_share: float,
    creativity_share: float,
    big_created: float,
    rolling_adj_xa: float,
    share_xa: float,
    share_xa_short: float,
    risk: float,
    understat_pos_share: float,
    overassist_factor: float,
    minute_share: float,
) -> float:
    base_share = (
        (assist_stats_share * 0.4 + creativity_share * 0.15)
        + 0.1 * bounded_unit(big_created / 3.0, 0.50)
        + 0.1 * bounded_unit(rolling_adj_xa, 0.55)
        + 0.25 * (0.7 * share_xa + 0.3 * share_xa_short)
    )
    blended = base_share * (1.0 - risk) + risk * understat_pos_share
    return blended * overassist_factor * minute_share


def stat_goal_distribution_prior(row: Dict, position: str) -> float:
    expected_minutes = clamp(first_float(row, ["average_minutes", "Avg_Minutes", "minutes"], 0.0), 0.0, 95.0)
    minute_share = clamp(safe_div(expected_minutes, max(1.0, PLAYING_POOL_MINUTES_CAP), 0.0), 0.05, 1.0)
    risk = clamp(first_float(row, ["player_risiko", "player_risk"], 0.0), 0.0, 1.0)

    goal_stats_share = clamp(first_float(row, ["Goal_Statistics_share", "rolling_Goal_min_share"], 0.0), 0.0, 1.5)
    threat_share = clamp(first_float(row, ["Rolling_adjusted_Threat_per90_share", "rolling_Threat_share"], 0.0), 0.0, 1.5)
    share_xg = clamp(first_float(row, ["Share_of_XG", "Share_of_XG_share"], 0.0), 0.0, 1.5)
    share_xg_short = clamp(first_float(row, ["Share_of_XG_Short"], share_xg), 0.0, 1.5)
    big_chances = max(0.0, first_float(row, ["Big_Chances", "Big_Chances_share"], 0.0))
    rolling_adj_xg = max(0.0, first_float(row, ["Rolling_adjusted_XG", "rolling_Adjusted_XG_historic", "rolling_XG"], 0.0))
    understat_pos_share = clamp(first_float(row, ["Understat_POSXG_Share"], 0.0), 0.0, 1.5)
    overscore_factor = clamp(first_float(row, ["Average_Overscore"], 1.0), 0.9, 1.12)

    score = visual_goal_share_formula(
        goal_stats_share=goal_stats_share,
        threat_share=threat_share,
        big_chances=big_chances,
        rolling_adj_xg=rolling_adj_xg,
        share_xg=share_xg,
        share_xg_short=share_xg_short,
        risk=risk,
        understat_pos_share=understat_pos_share,
        overscore_factor=overscore_factor,
        minute_share=minute_share,
    )

    pos = canonical_position(position)
    pos_mult = {"FWD": 1.00, "MID": 0.86, "DEF": 0.42, "GKP": 0.03, "UNK": 0.80}.get(pos, 0.80)
    return max(1e-6, score * pos_mult)


def stat_assist_distribution_prior(row: Dict, position: str) -> float:
    expected_minutes = clamp(first_float(row, ["average_minutes", "Avg_Minutes", "minutes"], 0.0), 0.0, 95.0)
    minute_share = clamp(safe_div(expected_minutes, max(1.0, PLAYING_POOL_MINUTES_CAP), 0.0), 0.05, 1.0)
    risk = clamp(first_float(row, ["player_risiko", "player_risk"], 0.0), 0.0, 1.0)

    assist_stats_share = clamp(first_float(row, ["Assist_Statistics_share", "rolling_Assist_min_share"], 0.0), 0.0, 1.5)
    creativity_share = clamp(first_float(row, ["Rolling_adjusted_creativity_per90_share", "Rolling_creativity_share"], 0.0), 0.0, 1.5)
    share_xa = clamp(first_float(row, ["Share_of_XA", "Share_of_XA_share"], 0.0), 0.0, 1.5)
    share_xa_short = clamp(first_float(row, ["Share_of_XA_Short"], share_xa), 0.0, 1.5)
    big_created = max(0.0, first_float(row, ["Big_Chances_Created", "Big_Chances_Created_share"], 0.0))
    rolling_adj_xa = max(0.0, first_float(row, ["Rolling_adjusted_XA", "rolling_Adjusted_XA_historic", "rolling_XA"], 0.0))
    understat_pos_share = clamp(first_float(row, ["Understat_POSXA_Share"], 0.0), 0.0, 1.5)
    overassist_factor = clamp(first_float(row, ["Average_OverAssist"], 1.0), 0.9, 1.10)

    score = visual_assist_share_formula(
        assist_stats_share=assist_stats_share,
        creativity_share=creativity_share,
        big_created=big_created,
        rolling_adj_xa=rolling_adj_xa,
        share_xa=share_xa,
        share_xa_short=share_xa_short,
        risk=risk,
        understat_pos_share=understat_pos_share,
        overassist_factor=overassist_factor,
        minute_share=minute_share,
    )

    pos = canonical_position(position)
    pos_mult = {"FWD": 0.92, "MID": 1.00, "DEF": 0.66, "GKP": 0.05, "UNK": 0.86}.get(pos, 0.86)
    return max(1e-6, score * pos_mult)


def blend_with_stat_distribution(team_players: List[Dict]) -> None:
    if not team_players:
        return

    goal_total = sum(max(0.0, p.get("goal_weight", 0.0)) for p in team_players)
    assist_total = sum(max(0.0, p.get("assist_weight", 0.0)) for p in team_players)
    if goal_total <= 0 and assist_total <= 0:
        return

    goal_cur = normalize_nonnegative_shares([p.get("goal_weight", 0.0) for p in team_players])
    goal_stat = normalize_nonnegative_shares([p.get("goal_stat_prior", 0.0) for p in team_players])
    assist_cur = normalize_nonnegative_shares([p.get("assist_weight", 0.0) for p in team_players])
    assist_stat = normalize_nonnegative_shares([p.get("assist_stat_prior", 0.0) for p in team_players])

    goal_blend = []
    for i, p in enumerate(team_players):
        s = (1.0 - STAT_GOAL_SHARE_BLEND) * goal_cur[i] + STAT_GOAL_SHARE_BLEND * goal_stat[i]
        if canonical_position(p.get("position", "")) == "DEF":
            s = min(s, DEF_MAX_GOAL_SHARE)
        goal_blend.append(max(0.0, s))

    assist_blend = [
        max(0.0, (1.0 - STAT_ASSIST_SHARE_BLEND) * assist_cur[i] + STAT_ASSIST_SHARE_BLEND * assist_stat[i])
        for i in range(len(team_players))
    ]

    goal_blend = normalize_nonnegative_shares(goal_blend)
    assist_blend = normalize_nonnegative_shares(assist_blend)

    for i, p in enumerate(team_players):
        if goal_total > 0:
            p["goal_weight"] = max(1e-8, goal_blend[i] * goal_total)
        if assist_total > 0:
            p["assist_weight"] = max(1e-8, assist_blend[i] * assist_total)


def build_historical_player_ability(
    player_history_rows: List[Dict],
) -> Tuple[Dict[int, Dict], Dict[str, Dict], Dict]:
    feature_encoder = build_player_feature_encoder(player_history_rows)
    by_code = defaultdict(list)
    by_name = defaultdict(list)

    for row in player_history_rows:
        name = str(row.get("name", "")).strip()
        if not name or name == "0":
            continue

        code = parse_int(row.get("Player_code"), default=parse_int(row.get("element"), default=None))
        minutes = max(0.0, first_float(row, ["minutes"], 0.0))
        if minutes <= 0:
            continue
        dt = parse_dt(row.get("kickoff_time"))
        position = canonical_position(row.get("position", ""))

        goals = max(0.0, first_float(row, ["goals_scored"], 0.0))
        assists = max(0.0, first_float(row, ["assists"], 0.0))
        xg = max(0.0, first_float(row, ["expected_goals", "Adjusted_XG", "rolling_XG"], 0.0))
        xa = max(0.0, first_float(row, ["expected_assists", "Adjusted_XA", "rolling_XA"], 0.0))
        goal_stats = max(0.0, first_float(row, ["Goal_Statistics"], 0.0))
        assist_stats = max(0.0, first_float(row, ["Assist_Statistics"], 0.0))
        rolling_xg = max(0.0, first_float(row, ["rolling_XG", "Rolling_adjusted_XG"], 0.0))
        rolling_xa = max(0.0, first_float(row, ["rolling_XA", "Rolling_adjusted_XA"], 0.0))
        threat = max(0.0, first_float(row, ["rolling_Threat", "Threat"], 0.0))
        creativity = max(0.0, first_float(row, ["rolling_creativity", "creativity"], 0.0))

        rec = {
            "dt": dt,
            "minutes": minutes,
            "goals": goals,
            "assists": assists,
            "xg": xg,
            "xa": xa,
            "goal_stats": goal_stats,
            "assist_stats": assist_stats,
            "rolling_xg": rolling_xg,
            "rolling_xa": rolling_xa,
            "threat": threat,
            "creativity": creativity,
            "position": position,
            "features": extract_player_feature_values(row),
        }
        if code is not None:
            by_code[code].append(rec)
        by_name[normalize_player_name(name)].append(rec)

    def summarize(records: List[Dict]) -> Dict:
        # Use all historical rows with recency decay instead of fixed windows.
        records = sorted(records, key=lambda x: x["dt"])
        w = recency_weights(len(records), 0.975)

        minutes_w = weighted_mean([r["minutes"] for r in records], w, 0.0)
        g90_series = [safe_div(r["goals"] * 90.0, max(1.0, r["minutes"]), 0.0) for r in records]
        a90_series = [safe_div(r["assists"] * 90.0, max(1.0, r["minutes"]), 0.0) for r in records]
        xg90_series = [safe_div(r["xg"] * 90.0, max(1.0, r["minutes"]), 0.0) for r in records]
        xa90_series = [safe_div(r["xa"] * 90.0, max(1.0, r["minutes"]), 0.0) for r in records]
        g90 = weighted_mean(g90_series, w, 0.0)
        a90 = weighted_mean(a90_series, w, 0.0)
        xg90 = weighted_mean(xg90_series, w, 0.0)
        xa90 = weighted_mean(xa90_series, w, 0.0)
        goal_stats = weighted_mean([r["goal_stats"] for r in records], w, 0.0)
        assist_stats = weighted_mean([r["assist_stats"] for r in records], w, 0.0)
        rolling_xg = weighted_mean([r["rolling_xg"] for r in records], w, 0.0)
        rolling_xa = weighted_mean([r["rolling_xa"] for r in records], w, 0.0)
        threat = weighted_mean([r["threat"] for r in records], w, 0.0)
        creativity = weighted_mean([r["creativity"] for r in records], w, 0.0)
        hist_feature_values = {}
        for metric in PLAYER_FEATURE_COLUMNS.keys():
            hist_feature_values[metric] = weighted_mean([r["features"].get(metric, 0.0) for r in records], w, 0.0)
        position = records[-1]["position"] if records else "UNK"
        hist_feature_encoded = encode_player_feature_map(hist_feature_values, position, feature_encoder)
        minutes_total = sum(max(0.0, r["minutes"]) for r in records)
        hist_reliability = clamp(
            0.55 * safe_div(len(records), PLAYER_HISTORY_FULL_MATCHES, 0.0)
            + 0.45 * safe_div(minutes_total, PLAYER_HISTORY_FULL_MINUTES, 0.0),
            0.0,
            1.0,
        )
        minutes_volatility = clamp(safe_div(weighted_std([r["minutes"] for r in records], w, 0.0), 90.0, 0.0), 0.02, 0.60)
        goal_rate_volatility = clamp(weighted_std(g90_series, w, 0.0), 0.03, 1.20)
        assist_rate_volatility = clamp(weighted_std(a90_series, w, 0.0), 0.03, 1.00)

        goal_ability = (
            0.34 * bounded_unit(goal_stats, 1.0)
            + 0.22 * bounded_unit(g90, 0.30)
            + 0.18 * bounded_unit(xg90, 0.30)
            + 0.16 * bounded_unit(rolling_xg, 0.35)
            + 0.10 * bounded_unit(threat, 60.0)
        )
        assist_ability = (
            0.34 * bounded_unit(assist_stats, 1.0)
            + 0.22 * bounded_unit(a90, 0.22)
            + 0.18 * bounded_unit(xa90, 0.24)
            + 0.16 * bounded_unit(rolling_xa, 0.30)
            + 0.10 * bounded_unit(creativity, 60.0)
        )

        return {
            "hist_goal_stats": goal_stats,
            "hist_assist_stats": assist_stats,
            "hist_goal_ability": clamp(goal_ability, 0.0, 1.0),
            "hist_assist_ability": clamp(assist_ability, 0.0, 1.0),
            "hist_minutes": minutes_w,
            "hist_samples": len(records),
            "hist_reliability": hist_reliability,
            "hist_position": position,
            "hist_feature_values": hist_feature_values,
            "hist_feature_encoded": hist_feature_encoded,
            "hist_minutes_volatility": minutes_volatility,
            "hist_goal_rate_volatility": goal_rate_volatility,
            "hist_assist_rate_volatility": assist_rate_volatility,
            "has_history": True,
        }

    ability_by_code = {k: summarize(v) for k, v in by_code.items() if v}
    ability_by_name = {k: summarize(v) for k, v in by_name.items() if v}
    return ability_by_code, ability_by_name, feature_encoder


def resolve_historical_ability(
    row: Dict,
    ability_by_code: Dict[int, Dict],
    ability_by_name: Dict[str, Dict],
) -> Dict:
    code = parse_int(row.get("Player_code"), default=parse_int(row.get("element"), default=None))
    if code is not None and code in ability_by_code:
        return ability_by_code[code]
    nm = normalize_player_name(row.get("name", ""))
    if nm and nm in ability_by_name:
        return ability_by_name[nm]
    return {
        "hist_goal_stats": 0.0,
        "hist_assist_stats": 0.0,
        "hist_goal_ability": 0.0,
        "hist_assist_ability": 0.0,
        "hist_minutes": 0.0,
        "hist_samples": 0,
        "hist_reliability": 0.0,
        "hist_position": canonical_position(row.get("position", "")),
        "hist_feature_values": {},
        "hist_feature_encoded": {},
        "hist_minutes_volatility": 0.22,
        "hist_goal_rate_volatility": 0.28,
        "hist_assist_rate_volatility": 0.24,
        "has_history": False,
    }


def compute_player_components(row: Dict, hist: Dict, feature_encoder: Dict) -> Dict[str, float]:
    position = canonical_position(row.get("position", ""))
    current_features_raw = extract_player_feature_values(row)
    current_features_encoded = encode_player_feature_map(current_features_raw, position, feature_encoder)

    has_history = bool(hist.get("has_history", False))
    hist_reliability = clamp(float(hist.get("hist_reliability", 0.0)), 0.0, 1.0) if has_history else 0.0
    hist_features_encoded = hist.get("hist_feature_encoded", {}) if has_history else {}

    if has_history:
        current_weight = clamp(
            PLAYER_BLEND_CURRENT + 0.16 * (1.0 - hist_reliability) - 0.10 * hist_reliability,
            0.30,
            0.95,
        )
    else:
        # Required fallback: if no historical data, use the new projection-set stats as-is.
        current_weight = 1.0
    historical_weight = 1.0 - current_weight

    blended = {}
    for metric in PLAYER_FEATURE_COLUMNS.keys():
        cur = current_features_encoded.get(metric, 0.0)
        if has_history:
            hist_v = hist_features_encoded.get(metric, cur)
            blended[metric] = current_weight * cur + historical_weight * hist_v
        else:
            blended[metric] = cur

    risk = current_features_raw["risk"]
    overscore = current_features_raw["overscore"]
    overassist = current_features_raw["overassist"]
    pen_data = bounded_unit(current_features_raw["pen_data"], 0.12)

    share_xg = 0.70 * blended["goal_share"] + 0.30 * blended["goal_share_short"]
    share_xa = 0.70 * blended["assist_share"] + 0.30 * blended["assist_share_short"]

    goal_base = (
        0.29 * blended["goal_stats"]
        + 0.16 * blended["rolling_xg_signal"]
        + 0.14 * share_xg
        + 0.12 * blended["xg_level"]
        + 0.11 * blended["threat_signal"]
        + 0.09 * blended["understat_xg_share"]
        + 0.06 * blended["big_chances"]
        + 0.03 * pen_data
    )
    assist_base = (
        0.29 * blended["assist_stats"]
        + 0.16 * blended["rolling_xa_signal"]
        + 0.14 * share_xa
        + 0.12 * blended["xa_level"]
        + 0.11 * blended["creativity_signal"]
        + 0.09 * blended["understat_xa_share"]
        + 0.06 * blended["big_created"]
        + 0.03 * pen_data
    )

    goal_contribution_index = clamp(
        0.44 * blended["goal_stats"]
        + 0.22 * share_xg
        + 0.19 * blended["xg_level"]
        + 0.15 * blended["threat_signal"],
        0.02,
        1.0,
    )
    assist_contribution_index = clamp(
        0.44 * blended["assist_stats"]
        + 0.22 * share_xa
        + 0.19 * blended["xa_level"]
        + 0.15 * blended["creativity_signal"],
        0.02,
        1.0,
    )

    goal_signal = ((1.0 - risk) * goal_base + risk * blended["understat_xg_share"]) * overscore
    assist_signal = ((1.0 - risk) * assist_base + risk * blended["understat_xa_share"]) * overassist
    goal_signal *= PLAYER_CONTRIB_BASE + PLAYER_CONTRIB_MULT * goal_contribution_index
    assist_signal *= PLAYER_CONTRIB_BASE + PLAYER_CONTRIB_MULT * assist_contribution_index
    goal_signal *= PLAYER_GOAL_SCALE
    assist_signal *= PLAYER_ASSIST_SCALE

    goal_stats_current = current_features_encoded.get("goal_stats", 0.0)
    assist_stats_current = current_features_encoded.get("assist_stats", 0.0)
    goal_stats_historical = hist_features_encoded.get("goal_stats", goal_stats_current) if has_history else goal_stats_current
    assist_stats_historical = hist_features_encoded.get("assist_stats", assist_stats_current) if has_history else assist_stats_current

    return {
        "goal_signal": max(0.0, goal_signal),
        "assist_signal": max(0.0, assist_signal),
        "goal_contribution_index": goal_contribution_index,
        "assist_contribution_index": assist_contribution_index,
        "goal_stats_current": goal_stats_current,
        "assist_stats_current": assist_stats_current,
        "goal_stats_historical": goal_stats_historical,
        "assist_stats_historical": assist_stats_historical,
        "xg_level": blended["xg_level"],
        "xa_level": blended["xa_level"],
    }


def build_player_profiles_for_fixtures(
    player_projection_rows: List[Dict],
    current_players_chance: Dict[int, float],
    fixtures: List[Dict],
    ability_by_code: Dict[int, Dict],
    ability_by_name: Dict[str, Dict],
    feature_encoder: Dict,
) -> Tuple[Dict[int, Dict[int, List[Dict]]], Dict[int, Dict[int, float]]]:
    fixture_codes = {fx["fixture_code"] for fx in fixtures}
    fixture_idx = {}
    for fx in fixtures:
        fixture_idx[(fx["GW"], fx["home_team_code"], fx["away_team_code"])] = fx["fixture_code"]
        fixture_idx[(fx["GW"], fx["away_team_code"], fx["home_team_code"])] = fx["fixture_code"]

    player_agg = {}
    xg_sum = defaultdict(float)
    xa_sum = defaultdict(float)

    for row in player_projection_rows:
        gw = parse_int(row.get("GW"))
        team_code = parse_int(row.get("Team"), default=parse_int(row.get("team_code")))
        opp_code = parse_int(
            row.get("opp_code"),
            default=parse_int(row.get("opponent_code"), default=parse_int(row.get("opponent_team"))),
        )
        fixture_code = parse_int(row.get("fix_id"), default=parse_int(row.get("fixture")))

        if fixture_code not in fixture_codes and gw is not None and team_code is not None and opp_code is not None:
            fixture_code = fixture_idx.get((gw, team_code, opp_code))
        if fixture_code not in fixture_codes or team_code is None:
            continue

        name = str(row.get("name", "")).strip()
        if not name or name == "0":
            continue
        position = str(row.get("position", "")).strip() or "UNK"
        expected_minutes = clamp(
            first_float(row, ["average_minutes", "Avg_Minutes", "minutes"], 0.0),
            0.0,
            90.0,
        )
        if expected_minutes < MIN_PLAYER_EXPECTED_MINUTES:
            continue

        player_code = parse_int(row.get("Player_code"), default=parse_int(row.get("element"), default=0))
        chance = current_players_chance.get(player_code, 1.0)
        available_flag = parse_bool(row.get("available")) if "available" in row else True
        availability_mult = chance * (1.0 if available_flag else UNAVAILABLE_PLAYER_PENALTY)

        start_probability = clamp((expected_minutes / 82.0) * availability_mult, 0.01, 0.99)
        fixture_prob = clamp(first_float(row, ["fix_percentage"], 1.0), 0.05, 1.0)
        minutes_factor = (expected_minutes / 90.0) ** PLAYER_MINUTES_EXP
        minutes_share = pool_minutes_share(expected_minutes)
        hist = resolve_historical_ability(row, ability_by_code, ability_by_name)
        comps = compute_player_components(row, hist, feature_encoder)
        goal_signal = comps["goal_signal"]
        assist_signal = comps["assist_signal"]
        xg_level = comps["xg_level"]
        xa_level = comps["xa_level"]
        goal_contribution_index = comps["goal_contribution_index"]
        assist_contribution_index = comps["assist_contribution_index"]
        goal_stats_current = comps["goal_stats_current"]
        assist_stats_current = comps["assist_stats_current"]
        goal_stats_historical = comps["goal_stats_historical"]
        assist_stats_historical = comps["assist_stats_historical"]
        hist_reliability = clamp(hist.get("hist_reliability", 0.0), 0.0, 1.0)
        minutes_volatility = clamp(hist.get("hist_minutes_volatility", 0.22), 0.02, 0.60)
        goal_volatility = clamp(hist.get("hist_goal_rate_volatility", 0.28), 0.03, 1.20)
        assist_volatility = clamp(hist.get("hist_assist_rate_volatility", 0.24), 0.03, 1.00)
        goal_stat_prior = stat_goal_distribution_prior(row, position)
        assist_stat_prior = stat_assist_distribution_prior(row, position)

        pos_key = canonical_position(position)
        pos_goal_mult = POSITION_GOAL_MULT.get(pos_key, POSITION_GOAL_MULT["UNK"])
        pos_assist_mult = POSITION_ASSIST_MULT.get(pos_key, POSITION_ASSIST_MULT["UNK"])
        goal_focus_mult = (0.36 + 0.64 * goal_contribution_index) ** GOAL_CONTRIBUTION_SHARPNESS
        assist_focus_mult = (0.36 + 0.64 * assist_contribution_index) ** ASSIST_CONTRIBUTION_SHARPNESS

        goal_weight = max(
            1e-6,
            goal_signal * minutes_factor * minutes_share * fixture_prob * availability_mult * pos_goal_mult * goal_focus_mult,
        )
        assist_weight = max(
            1e-6,
            assist_signal * minutes_factor * minutes_share * fixture_prob * availability_mult * pos_assist_mult * assist_focus_mult,
        )
        if pos_key == "MID":
            # Reduce over-inflated assists for deeper/low-shot mids while preserving attacking mids.
            mid_attack_role = clamp((goal_contribution_index - 0.24) / 0.50, 0.0, 1.0)
            goal_weight *= 0.70 + 0.25 * mid_attack_role
            assist_weight *= 0.55 + 0.30 * mid_attack_role
        elif pos_key == "FWD":
            # Prevent poacher forwards from getting unrealistically high assist projections.
            poacher_bias = max(0.0, goal_contribution_index - assist_contribution_index)
            assist_weight *= clamp(
                0.76 + 0.20 * assist_contribution_index - 0.22 * poacher_bias,
                0.55,
                0.95,
            )
        elif pos_key == "DEF":
            def_attack_role = clamp((goal_contribution_index - 0.18) / 0.42, 0.0, 1.0)
            assist_weight *= 0.50 + 0.28 * def_attack_role
        if goal_weight <= 1e-6 and assist_weight <= 1e-6:
            continue

        agg_key = (fixture_code, team_code, player_code if player_code is not None else name)
        cur = player_agg.get(agg_key)
        if cur is None:
            player_agg[agg_key] = {
                "player_key": f"{player_code}:{name}" if player_code is not None else f"name:{name}",
                "name": name,
                "position": position,
                "expected_minutes": expected_minutes,  # explicit: use average_minutes as expected minutes
                "start_probability": start_probability,
                "goal_weight": goal_weight,
                "assist_weight": assist_weight,
                "goal_contribution_index": goal_contribution_index,
                "assist_contribution_index": assist_contribution_index,
                "goal_stats_current": goal_stats_current,
                "assist_stats_current": assist_stats_current,
                "goal_stats_historical": goal_stats_historical,
                "assist_stats_historical": assist_stats_historical,
                "history_reliability": hist_reliability,
                "minutes_volatility": minutes_volatility,
                "goal_volatility": goal_volatility,
                "assist_volatility": assist_volatility,
                "goal_stat_prior": goal_stat_prior,
                "assist_stat_prior": assist_stat_prior,
            }
        else:
            prev_goal_w = max(1e-9, cur["goal_weight"])
            prev_assist_w = max(1e-9, cur["assist_weight"])
            cur["expected_minutes"] = max(cur["expected_minutes"], expected_minutes)
            cur["start_probability"] = max(cur["start_probability"], start_probability)
            cur["goal_contribution_index"] = (
                cur["goal_contribution_index"] * prev_goal_w + goal_contribution_index * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["assist_contribution_index"] = (
                cur["assist_contribution_index"] * prev_assist_w + assist_contribution_index * assist_weight
            ) / max(1e-9, prev_assist_w + assist_weight)
            cur["goal_stats_current"] = (
                cur["goal_stats_current"] * prev_goal_w + goal_stats_current * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["assist_stats_current"] = (
                cur["assist_stats_current"] * prev_assist_w + assist_stats_current * assist_weight
            ) / max(1e-9, prev_assist_w + assist_weight)
            cur["goal_stats_historical"] = (
                cur["goal_stats_historical"] * prev_goal_w + goal_stats_historical * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["assist_stats_historical"] = (
                cur["assist_stats_historical"] * prev_assist_w + assist_stats_historical * assist_weight
            ) / max(1e-9, prev_assist_w + assist_weight)
            cur["history_reliability"] = max(cur.get("history_reliability", 0.0), hist_reliability)
            cur["minutes_volatility"] = (
                cur.get("minutes_volatility", 0.22) * prev_goal_w + minutes_volatility * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["goal_volatility"] = (
                cur.get("goal_volatility", 0.28) * prev_goal_w + goal_volatility * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["assist_volatility"] = (
                cur.get("assist_volatility", 0.24) * prev_assist_w + assist_volatility * assist_weight
            ) / max(1e-9, prev_assist_w + assist_weight)
            cur["goal_stat_prior"] = (
                cur.get("goal_stat_prior", 0.0) * prev_goal_w + goal_stat_prior * goal_weight
            ) / max(1e-9, prev_goal_w + goal_weight)
            cur["assist_stat_prior"] = (
                cur.get("assist_stat_prior", 0.0) * prev_assist_w + assist_stat_prior * assist_weight
            ) / max(1e-9, prev_assist_w + assist_weight)
            cur["goal_weight"] += goal_weight
            cur["assist_weight"] += assist_weight

        team_fix_key = (fixture_code, team_code)
        xg_sum[team_fix_key] += xg_level * fixture_prob
        xa_sum[team_fix_key] += xa_level * fixture_prob

    pools = defaultdict(lambda: defaultdict(list))
    for (fixture_code, team_code, _), data in player_agg.items():
        pools[fixture_code][team_code].append(data)

    for fixture_code in list(pools.keys()):
        for team_code in list(pools[fixture_code].keys()):
            lst = pools[fixture_code][team_code]
            blend_with_stat_distribution(lst)
            lst.sort(key=lambda x: (x["goal_weight"] + x["assist_weight"]), reverse=True)
            pools[fixture_code][team_code] = select_minutes_based_pool(lst)

    assist_ratios = defaultdict(dict)
    for fixture_code, team_map in pools.items():
        for team_code, lst in team_map.items():
            key = (fixture_code, team_code)
            gx = xg_sum.get(key, 0.0)
            ax = xa_sum.get(key, 0.0)
            if gx > 0:
                ratio = clamp(ax / max(0.35, gx), 0.40, 0.84)
            else:
                g_w = sum(p["goal_weight"] for p in lst)
                a_w = sum(p["assist_weight"] for p in lst)
                ratio = clamp(0.50 + 0.18 * safe_div(a_w, max(1e-6, g_w), 0.0), 0.40, 0.84)
            assist_ratios[fixture_code][team_code] = ratio

    return dict(pools), dict(assist_ratios)


def poisson_sample(lmbda: float, rng: random.Random) -> int:
    lmbda = max(0.01, lmbda)
    L = math.exp(-lmbda)
    k = 0
    p = 1.0
    while p > L and k < 35:
        k += 1
        p *= rng.random()
    return k - 1


def weighted_choice_index(weights: List[float], rng: random.Random, exclude: Optional[int] = None) -> Optional[int]:
    total = 0.0
    for i, w in enumerate(weights):
        if exclude is not None and i == exclude:
            continue
        total += max(0.0, w)
    if total <= 0:
        return None
    r = rng.random() * total
    running = 0.0
    for i, w in enumerate(weights):
        if exclude is not None and i == exclude:
            continue
        running += max(0.0, w)
        if running >= r:
            return i
    return None


def pool_minutes_share(expected_minutes: float) -> float:
    return clamp(safe_div(expected_minutes, max(1.0, PLAYING_POOL_MINUTES_CAP), 0.0), 0.02, 1.0)


def player_pool_equivalent(players: List[Dict]) -> float:
    return sum(pool_minutes_share(p.get("expected_minutes", 0.0)) for p in players)


def select_minutes_based_pool(players_sorted: List[Dict]) -> List[Dict]:
    if not players_sorted:
        return []

    selected = []
    pool_eq = 0.0
    for p in players_sorted[:MAX_PLAYERS_PER_TEAM_PER_FIXTURE]:
        selected.append(p)
        pool_eq += pool_minutes_share(p.get("expected_minutes", 0.0))
        if len(selected) >= PLAYING_POOL_MIN_PLAYERS and pool_eq >= PLAYING_POOL_TARGET_EQUIV:
            break

    if len(selected) > PLAYING_POOL_MAX_PLAYERS:
        selected = selected[:PLAYING_POOL_MAX_PLAYERS]
    return selected


def dynamic_top_n_from_pool(pool_equiv: float, frac: float, min_n: int, max_n: int) -> int:
    n = int(round(max(0.0, pool_equiv) * max(0.10, frac)))
    return int(clamp(n, max(1, min_n), max(1, max_n)))


def sparsify_weights(weights: List[float], top_n: int, tail_scale: float) -> List[float]:
    if len(weights) <= max(1, top_n):
        return [max(0.0, w) for w in weights]
    idx = sorted(range(len(weights)), key=lambda i: weights[i], reverse=True)
    keep = set(idx[: max(1, top_n)])
    t = clamp(tail_scale, 0.0, 1.0)
    out = []
    for i, w in enumerate(weights):
        ww = max(0.0, w)
        if i not in keep:
            ww *= t
        out.append(ww)
    return out


def cap_weight_shares(weights: List[float], max_share: float) -> List[float]:
    if not weights:
        return []
    total = sum(max(0.0, w) for w in weights)
    if total <= 0:
        return [0.0 for _ in weights]
    cap = clamp(max_share, 0.05, 0.95)
    probs = [max(0.0, w) / total for w in weights]
    if max(probs) <= cap + 1e-12:
        return [max(0.0, w) for w in weights]

    remaining = set(range(len(probs)))
    capped = [0.0] * len(probs)

    # Water-filling style cap: cap oversized shares and redistribute residual.
    while True:
        if not remaining:
            break
        rem_total = sum(probs[i] for i in remaining)
        if rem_total <= 0:
            break
        changed = False
        for i in list(remaining):
            p = probs[i]
            p_norm = p / rem_total
            if p_norm > cap:
                capped[i] = cap
                remaining.remove(i)
                changed = True
        if not changed:
            break

    used = sum(capped)
    free_mass = max(0.0, 1.0 - used)
    rem_base = sum(probs[i] for i in remaining)
    out_probs = capped[:]
    if remaining and rem_base > 0:
        for i in remaining:
            out_probs[i] = free_mass * probs[i] / rem_base
    elif remaining:
        even = free_mass / max(1, len(remaining))
        for i in remaining:
            out_probs[i] = even

    return out_probs


def sample_shocked_player_weights(
    players: List[Dict],
    rng: random.Random,
) -> Tuple[List[float], List[float], float]:
    if not players:
        return [], [], 1.0

    base_goal_total = max(1e-9, sum(max(0.0, p.get("goal_weight", 0.0)) for p in players))
    shocked_goal_weights: List[float] = []
    shocked_assist_weights: List[float] = []
    shocked_goal_total = 0.0

    for p in players:
        reliability = clamp(p.get("history_reliability", 0.0), 0.0, 1.0)
        minute_vol = clamp(p.get("minutes_volatility", 0.22), 0.02, 0.65)
        goal_vol = clamp(p.get("goal_volatility", 0.28), 0.03, 1.30)
        assist_vol = clamp(p.get("assist_volatility", 0.24), 0.03, 1.10)

        uncertainty_boost = 1.0 + 0.45 * (1.0 - reliability)
        minute_sigma = PLAYER_MINUTES_SHOCK_BASE + 0.55 * minute_vol
        minute_sigma *= uncertainty_boost
        goal_sigma = (PLAYER_FORM_SHOCK_BASE + 0.35 * goal_vol) * uncertainty_boost
        assist_sigma = (PLAYER_FORM_SHOCK_BASE + 0.35 * assist_vol) * uncertainty_boost

        minute_mult = clamp(rng.gauss(1.0, minute_sigma), 0.25, 1.35)
        goal_form_mult = clamp(math.exp(rng.gauss(0.0, goal_sigma)), 0.42, 2.05)
        assist_form_mult = clamp(math.exp(rng.gauss(0.0, assist_sigma)), 0.42, 2.05)

        gw = max(1e-8, p.get("goal_weight", 0.0) * minute_mult * goal_form_mult)
        aw = max(1e-8, p.get("assist_weight", 0.0) * minute_mult * assist_form_mult)
        shocked_goal_weights.append(gw)
        shocked_assist_weights.append(aw)
        shocked_goal_total += gw

    team_attack_mult = clamp(safe_div(shocked_goal_total, base_goal_total, 1.0), 0.70, 1.35)
    return shocked_goal_weights, shocked_assist_weights, team_attack_mult


def estimate_match_lambdas(home_profile: Dict, away_profile: Dict, league: Dict) -> Tuple[float, float]:
    h_off = safe_div(home_profile["attack_home"], max(0.25, league["home_xg"]), 1.0)
    a_off = safe_div(away_profile["attack_away"], max(0.25, league["away_xg"]), 1.0)
    h_def_opp = safe_div(away_profile["defence_away"], max(0.25, league["away_xgc"]), 1.0)
    a_def_opp = safe_div(home_profile["defence_home"], max(0.25, league["home_xgc"]), 1.0)

    form_h = clamp(
        math.exp(
            0.30 * math.log(max(0.55, home_profile["form_attack_ratio"]))
            + 0.15 * math.log(max(0.55, away_profile["form_defence_ratio"]))
        ),
        0.88,
        1.12,
    )
    form_a = clamp(
        math.exp(
            0.30 * math.log(max(0.55, away_profile["form_attack_ratio"]))
            + 0.15 * math.log(max(0.55, home_profile["form_defence_ratio"]))
        ),
        0.88,
        1.12,
    )

    trend_h = clamp(1.0 + 0.08 * home_profile["xg_slope"] + 0.05 * away_profile["xgc_slope"], 0.94, 1.06)
    trend_a = clamp(1.0 + 0.08 * away_profile["xg_slope"] + 0.05 * home_profile["xgc_slope"], 0.94, 1.06)

    # Log-space compression to reduce unrealistic extremes.
    compressed_h = math.exp(0.56 * math.log(max(0.25, h_off)) + 0.62 * math.log(max(0.25, h_def_opp)))
    compressed_a = math.exp(0.56 * math.log(max(0.25, a_off)) + 0.62 * math.log(max(0.25, a_def_opp)))

    elo_delta = home_profile["elo"] - away_profile["elo"]
    elo_h = clamp(math.exp((elo_delta / ELO_DIVISOR) * 0.38), 0.86, 1.17)
    elo_a = clamp(math.exp((-elo_delta / ELO_DIVISOR) * 0.38), 0.86, 1.17)

    base_home = league["home_xg"] * compressed_h * form_h * trend_h * HOME_ADVANTAGE_MULTIPLIER * elo_h
    base_away = league["away_xg"] * compressed_a * form_a * trend_a * (2.0 - HOME_ADVANTAGE_MULTIPLIER) * elo_a

    home_style = clamp(home_profile.get("attack_style_ratio", 1.0), 0.75, 1.30)
    away_style = clamp(away_profile.get("attack_style_ratio", 1.0), 0.75, 1.30)
    home_opp_vuln = clamp(away_profile.get("defence_vulnerability_ratio", 1.0), 0.70, 1.35)
    away_opp_vuln = clamp(home_profile.get("defence_vulnerability_ratio", 1.0), 0.70, 1.35)

    style_home_mult = clamp(math.sqrt(home_style * home_opp_vuln), 0.84, 1.20)
    style_away_mult = clamp(math.sqrt(away_style * away_opp_vuln), 0.84, 1.20)
    base_home *= 1.0 + TEAM_STYLE_BLEND * (style_home_mult - 1.0)
    base_away *= 1.0 + TEAM_STYLE_BLEND * (style_away_mult - 1.0)

    # Reliability shrink: if one team has little recent history, pull toward league means.
    reliability = clamp(
        min(home_profile.get("sample_count", 0), away_profile.get("sample_count", 0)) / 30.0,
        0.35,
        1.0,
    )
    shrink = MODEL_SHRINK_TO_LEAGUE + (1.0 - reliability) * 0.25
    lambda_home = (1.0 - shrink) * base_home + shrink * league["home_xg"]
    lambda_away = (1.0 - shrink) * base_away + shrink * league["away_xg"]

    # Additional suppression for low attacking quality teams.
    opp_def_quality_h = safe_div(league["away_xgc"], max(0.25, away_profile["defence_away"]), 1.0)
    opp_def_quality_a = safe_div(league["home_xgc"], max(0.25, home_profile["defence_home"]), 1.0)
    underdog_h = clamp((1.0 - 0.75 * max(0.0, 1.0 - h_off)) * (1.0 - 0.45 * max(0.0, opp_def_quality_h - 1.0)), 0.65, 1.05)
    underdog_a = clamp((1.0 - 0.75 * max(0.0, 1.0 - a_off)) * (1.0 - 0.45 * max(0.0, opp_def_quality_a - 1.0)), 0.65, 1.05)
    lambda_home *= underdog_h
    lambda_away *= underdog_a

    lambda_home *= HOME_LAMBDA_ADJUST
    lambda_away *= AWAY_LAMBDA_ADJUST

    league_total = max(0.35, league["home_xg"] + league["away_xg"])
    raw_total = max(0.20, lambda_home + lambda_away)
    raw_gap = lambda_home - lambda_away

    # Tighten extremes to stay closer to historically stable distributions.
    adj_total = (1.0 - MATCH_OUTCOME_TOTAL_REVERSION) * raw_total + MATCH_OUTCOME_TOTAL_REVERSION * league_total
    adj_gap = raw_gap * (1.0 - MATCH_OUTCOME_GAP_SHRINK)

    lambda_home = 0.5 * (adj_total + adj_gap)
    lambda_away = 0.5 * (adj_total - adj_gap)
    lambda_home = clamp(lambda_home, 0.15, MAX_HOME_LAMBDA)
    lambda_away = clamp(lambda_away, 0.16, MAX_AWAY_LAMBDA)

    # Extra damping for teams currently underperforming in attack.
    h_form = clamp(home_profile.get("form_attack_ratio", 1.0), 0.70, 1.35)
    a_form = clamp(away_profile.get("form_attack_ratio", 1.0), 0.70, 1.35)
    if h_form < UNDERFORM_ATTACK_TRIGGER:
        hd = 1.0 - UNDERFORM_ATTACK_DAMP * safe_div(UNDERFORM_ATTACK_TRIGGER - h_form, UNDERFORM_ATTACK_TRIGGER - 0.70, 0.0)
        lambda_home *= clamp(hd, 0.84, 1.0)
    if a_form < UNDERFORM_ATTACK_TRIGGER:
        ad = 1.0 - UNDERFORM_ATTACK_DAMP * safe_div(UNDERFORM_ATTACK_TRIGGER - a_form, UNDERFORM_ATTACK_TRIGGER - 0.70, 0.0)
        lambda_away *= clamp(ad, 0.84, 1.0)

    # Additional low-creativity damping for lower-elo sides.
    h_style = clamp(home_profile.get("attack_style_ratio", 1.0), 0.75, 1.30)
    a_style = clamp(away_profile.get("attack_style_ratio", 1.0), 0.75, 1.30)
    h_elo = float(home_profile.get("elo", 1000.0))
    a_elo = float(away_profile.get("elo", 1000.0))
    if h_style < 0.92 and h_elo < NON_ELITE_ELO_CUTOFF:
        sd = 1.0 - 0.10 * safe_div(0.92 - h_style, 0.22, 0.0)
        lambda_home *= clamp(sd, 0.90, 1.0)
    if a_style < 0.92 and a_elo < NON_ELITE_ELO_CUTOFF:
        sd = 1.0 - 0.10 * safe_div(0.92 - a_style, 0.22, 0.0)
        lambda_away *= clamp(sd, 0.90, 1.0)

    # Guardrail for non-elite matchups that otherwise drift too high on total xG.
    if max(home_profile.get("elo", 1000.0), away_profile.get("elo", 1000.0)) < NON_ELITE_ELO_CUTOFF:
        total = lambda_home + lambda_away
        if total > NON_ELITE_TOTAL_XG_CAP:
            sc = NON_ELITE_TOTAL_XG_CAP / max(1e-9, total)
            lambda_home = clamp(lambda_home * sc, 0.15, MAX_HOME_LAMBDA)
            lambda_away = clamp(lambda_away * sc, 0.16, MAX_AWAY_LAMBDA)

    # Statistical xG prior (Generate_Team_Predictions formulation), blended with model estimate.
    stat_home = statistical_xg_mu(
        own_xg=float(home_profile.get("attack_home", league["home_xg"])),
        own_xg_avg=float(home_profile.get("attack_avg", home_profile.get("attack_home", league["home_xg"]))),
        opp_xgc=float(away_profile.get("defence_away", league["away_xgc"])),
        opp_xgc_avg=float(away_profile.get("defence_avg", away_profile.get("defence_away", league["away_xgc"]))),
    )
    stat_away = statistical_xg_mu(
        own_xg=float(away_profile.get("attack_away", league["away_xg"])),
        own_xg_avg=float(away_profile.get("attack_avg", away_profile.get("attack_away", league["away_xg"]))),
        opp_xgc=float(home_profile.get("defence_home", league["home_xgc"])),
        opp_xgc_avg=float(home_profile.get("defence_avg", home_profile.get("defence_home", league["home_xgc"]))),
    )
    stat_blend = clamp(TEAM_STAT_XG_BLEND + 0.10 * (1.0 - reliability), 0.45, 0.88)
    lambda_home = (1.0 - stat_blend) * lambda_home + stat_blend * stat_home
    lambda_away = (1.0 - stat_blend) * lambda_away + stat_blend * stat_away
    lambda_home = clamp(lambda_home, 0.15, MAX_HOME_LAMBDA)
    lambda_away = clamp(lambda_away, 0.16, MAX_AWAY_LAMBDA)
    return lambda_home, lambda_away


def simulate_fixture(
    fixture: Dict,
    home_profile: Dict,
    away_profile: Dict,
    league: Dict,
    players_by_team: Dict[int, List[Dict]],
    team_assist_ratio: Dict[int, float],
    simulations: int,
    rng: random.Random,
) -> Tuple[Dict, List[Dict]]:
    home_code = fixture["home_team_code"]
    away_code = fixture["away_team_code"]

    home_players = players_by_team.get(home_code, [])
    away_players = players_by_team.get(away_code, [])

    lambda_home, lambda_away = estimate_match_lambdas(home_profile, away_profile, league)

    home_assist_prob = team_assist_ratio.get(home_code, DEFAULT_ASSIST_RATIO)
    away_assist_prob = team_assist_ratio.get(away_code, DEFAULT_ASSIST_RATIO)
    home_pool_equiv = player_pool_equivalent(home_players)
    away_pool_equiv = player_pool_equivalent(away_players)
    home_goal_top_n = dynamic_top_n_from_pool(
        home_pool_equiv, GOAL_ALLOCATION_TOP_FRAC, GOAL_ALLOCATION_MIN_TOP_N, GOAL_ALLOCATION_TOP_N
    )
    away_goal_top_n = dynamic_top_n_from_pool(
        away_pool_equiv, GOAL_ALLOCATION_TOP_FRAC, GOAL_ALLOCATION_MIN_TOP_N, GOAL_ALLOCATION_TOP_N
    )
    home_assist_top_n = dynamic_top_n_from_pool(
        home_pool_equiv, ASSIST_ALLOCATION_TOP_FRAC, ASSIST_ALLOCATION_MIN_TOP_N, ASSIST_ALLOCATION_TOP_N
    )
    away_assist_top_n = dynamic_top_n_from_pool(
        away_pool_equiv, ASSIST_ALLOCATION_TOP_FRAC, ASSIST_ALLOCATION_MIN_TOP_N, ASSIST_ALLOCATION_TOP_N
    )

    scoreline_counts = defaultdict(int)
    home_wins = draws = away_wins = 0
    btts = over25 = home_cs = away_cs = 0
    home_goals_sum = away_goals_sum = 0

    goal_total = defaultdict(float)
    assist_total = defaultdict(float)
    goal_any = defaultdict(int)
    assist_any = defaultdict(int)

    for _ in range(simulations):
        home_goal_weights, home_assist_weights, home_attack_mult = sample_shocked_player_weights(home_players, rng)
        away_goal_weights, away_assist_weights, away_attack_mult = sample_shocked_player_weights(away_players, rng)
        home_goal_weights = sparsify_weights(home_goal_weights, home_goal_top_n, ALLOCATION_TAIL_SCALE)
        away_goal_weights = sparsify_weights(away_goal_weights, away_goal_top_n, ALLOCATION_TAIL_SCALE)
        home_assist_weights = sparsify_weights(home_assist_weights, home_assist_top_n, ALLOCATION_TAIL_SCALE)
        away_assist_weights = sparsify_weights(away_assist_weights, away_assist_top_n, ALLOCATION_TAIL_SCALE)
        home_assist_weights = cap_weight_shares(home_assist_weights, MAX_ASSIST_WEIGHT_SHARE)
        away_assist_weights = cap_weight_shares(away_assist_weights, MAX_ASSIST_WEIGHT_SHARE)
        tempo_mult = clamp(math.exp(rng.gauss(0.0, MATCH_TEMPO_SHOCK_STD)), 0.82, 1.22)
        home_team_sigma = clamp(home_profile.get("attack_shock_std_home", TEAM_SHOCK_STD_BASE), TEAM_SHOCK_STD_MIN, TEAM_SHOCK_STD_MAX)
        away_team_sigma = clamp(away_profile.get("attack_shock_std_away", TEAM_SHOCK_STD_BASE), TEAM_SHOCK_STD_MIN, TEAM_SHOCK_STD_MAX)
        home_team_mult = clamp(math.exp(rng.gauss(-0.5 * home_team_sigma * home_team_sigma, home_team_sigma)), 0.62, 1.58)
        away_team_mult = clamp(math.exp(rng.gauss(-0.5 * away_team_sigma * away_team_sigma, away_team_sigma)), 0.62, 1.58)

        hg = poisson_sample(lambda_home * home_attack_mult * tempo_mult * home_team_mult, rng)
        ag = poisson_sample(lambda_away * away_attack_mult * tempo_mult * away_team_mult, rng)

        home_goals_sum += hg
        away_goals_sum += ag
        scoreline_counts[f"{hg}-{ag}"] += 1

        if hg > ag:
            home_wins += 1
        elif hg == ag:
            draws += 1
        else:
            away_wins += 1

        if hg + ag >= 3:
            over25 += 1
        if hg > 0 and ag > 0:
            btts += 1
        if ag == 0:
            home_cs += 1
        if hg == 0:
            away_cs += 1

        iter_goal_scorers = set()
        iter_assisters = set()

        for _g in range(hg):
            idx = weighted_choice_index(home_goal_weights, rng)
            if idx is not None:
                key = home_players[idx]["player_key"]
                goal_total[key] += 1
                iter_goal_scorers.add(key)
                if rng.random() < home_assist_prob and len(home_players) > 0:
                    aidx = weighted_choice_index(home_assist_weights, rng, exclude=idx if len(home_players) > 1 else None)
                    if aidx is not None:
                        akey = home_players[aidx]["player_key"]
                        assist_total[akey] += 1
                        iter_assisters.add(akey)

        for _g in range(ag):
            idx = weighted_choice_index(away_goal_weights, rng)
            if idx is not None:
                key = away_players[idx]["player_key"]
                goal_total[key] += 1
                iter_goal_scorers.add(key)
                if rng.random() < away_assist_prob and len(away_players) > 0:
                    aidx = weighted_choice_index(away_assist_weights, rng, exclude=idx if len(away_players) > 1 else None)
                    if aidx is not None:
                        akey = away_players[aidx]["player_key"]
                        assist_total[akey] += 1
                        iter_assisters.add(akey)

        for k in iter_goal_scorers:
            goal_any[k] += 1
        for k in iter_assisters:
            assist_any[k] += 1

    top_scoreline, top_count = max(scoreline_counts.items(), key=lambda x: x[1]) if scoreline_counts else ("0-0", 0)
    avg_h = home_goals_sum / max(1, simulations)
    avg_a = away_goals_sum / max(1, simulations)

    raw_home_cs_pct = 100.0 * home_cs / max(1, simulations)
    raw_away_cs_pct = 100.0 * away_cs / max(1, simulations)
    cal_home_cs_pct = adjust_clean_sheet_pct_for_team(raw_home_cs_pct, home_profile, away_profile, league, is_home=True)
    cal_away_cs_pct = adjust_clean_sheet_pct_for_team(raw_away_cs_pct, away_profile, home_profile, league, is_home=False)
    stat_home_lambda = statistical_xg_mu(
        own_xg=float(home_profile.get("attack_home", league["home_xg"])),
        own_xg_avg=float(home_profile.get("attack_avg", home_profile.get("attack_home", league["home_xg"]))),
        opp_xgc=float(away_profile.get("defence_away", league["away_xgc"])),
        opp_xgc_avg=float(away_profile.get("defence_avg", away_profile.get("defence_away", league["away_xgc"]))),
    )
    stat_away_lambda = statistical_xg_mu(
        own_xg=float(away_profile.get("attack_away", league["away_xg"])),
        own_xg_avg=float(away_profile.get("attack_avg", away_profile.get("attack_away", league["away_xg"]))),
        opp_xgc=float(home_profile.get("defence_home", league["home_xgc"])),
        opp_xgc_avg=float(home_profile.get("defence_avg", home_profile.get("defence_home", league["home_xgc"]))),
    )

    match_row = {
        "fixture_code": fixture["fixture_code"],
        "GW": fixture["GW"],
        "home_team": fixture["home_team"],
        "away_team": fixture["away_team"],
        "home_lambda": round(lambda_home, 4),
        "away_lambda": round(lambda_away, 4),
        "home_lambda_stat": round(stat_home_lambda, 4),
        "away_lambda_stat": round(stat_away_lambda, 4),
        "home_win_pct": round(100.0 * home_wins / max(1, simulations), 3),
        "draw_pct": round(100.0 * draws / max(1, simulations), 3),
        "away_win_pct": round(100.0 * away_wins / max(1, simulations), 3),
        "home_clean_sheet_pct": round(cal_home_cs_pct, 3),
        "away_clean_sheet_pct": round(cal_away_cs_pct, 3),
        "home_clean_sheet_raw_pct": round(raw_home_cs_pct, 3),
        "away_clean_sheet_raw_pct": round(raw_away_cs_pct, 3),
        "btts_pct": round(100.0 * btts / max(1, simulations), 3),
        "over_2_5_pct": round(100.0 * over25 / max(1, simulations), 3),
        "avg_home_goals": round(avg_h, 4),
        "avg_away_goals": round(avg_a, 4),
        "home_pool_equivalent": round(home_pool_equiv, 3),
        "away_pool_equivalent": round(away_pool_equiv, 3),
        "predicted_result": f"{round(avg_h)}-{round(avg_a)}",
        "most_likely_scoreline": top_scoreline,
        "most_likely_scoreline_pct": round(100.0 * top_count / max(1, simulations), 3),
        "simulations": simulations,
    }

    player_rows = []
    for side_players, team_name, opp_name, is_home in [
        (home_players, fixture["home_team"], fixture["away_team"], 1),
        (away_players, fixture["away_team"], fixture["home_team"], 0),
    ]:
        goal_weight_sum = max(1e-9, sum(p.get("goal_weight", 0.0) for p in side_players))
        assist_weight_sum = max(1e-9, sum(p.get("assist_weight", 0.0) for p in side_players))
        for p in side_players:
            k = p["player_key"]
            player_rows.append(
                {
                    "fixture_code": fixture["fixture_code"],
                    "GW": fixture["GW"],
                    "team": team_name,
                    "opponent": opp_name,
                    "was_home": is_home,
                    "player_name": p["name"],
                    "player_key": k,
                    "position": p["position"],
                    "start_probability": round(p["start_probability"], 4),
                    "expected_minutes": round(p["expected_minutes"], 2),
                    "expected_goals": round(goal_total[k] / max(1, simulations), 5),
                    "anytime_goal_pct": round(100.0 * goal_any[k] / max(1, simulations), 3),
                    "expected_assists": round(assist_total[k] / max(1, simulations), 5),
                    "anytime_assist_pct": round(100.0 * assist_any[k] / max(1, simulations), 3),
                    "goal_weight": round(p["goal_weight"], 6),
                    "assist_weight": round(p["assist_weight"], 6),
                    "goal_weight_share_pct": round(100.0 * p.get("goal_weight", 0.0) / goal_weight_sum, 3),
                    "assist_weight_share_pct": round(100.0 * p.get("assist_weight", 0.0) / assist_weight_sum, 3),
                    "goal_contribution_index": round(p.get("goal_contribution_index", 0.0), 5),
                    "assist_contribution_index": round(p.get("assist_contribution_index", 0.0), 5),
                    "goal_stats_current_score": round(p.get("goal_stats_current", 0.0), 5),
                    "assist_stats_current_score": round(p.get("assist_stats_current", 0.0), 5),
                    "goal_stats_historical_score": round(p.get("goal_stats_historical", 0.0), 5),
                    "assist_stats_historical_score": round(p.get("assist_stats_historical", 0.0), 5),
                    "history_reliability": round(p.get("history_reliability", 0.0), 5),
                    "minutes_volatility": round(p.get("minutes_volatility", 0.0), 5),
                    "goal_volatility": round(p.get("goal_volatility", 0.0), 5),
                    "assist_volatility": round(p.get("assist_volatility", 0.0), 5),
                    "team_pool_equivalent": round(player_pool_equivalent(side_players), 3),
                    "goal_allocation_top_n": home_goal_top_n if is_home else away_goal_top_n,
                    "assist_allocation_top_n": home_assist_top_n if is_home else away_assist_top_n,
                    "simulations": simulations,
                }
            )

    return match_row, player_rows


def evaluate_historical_accuracy(
    fixtures_hist: List[Dict],
    team_profiles: Dict[int, Dict],
    league: Dict,
) -> Dict[str, float]:
    if not fixtures_hist:
        return {
            "n": 0,
            "goals_mae": 999.0,
            "result_logloss": 999.0,
            "score_nll": 999.0,
            "cs_brier": 999.0,
            "goal_total_bias": 999.0,
            "cs_rate_bias": 999.0,
            "composite": 999.0,
        }

    eps = 1e-9
    n = 0
    sum_goals_mae = 0.0
    sum_ll = 0.0
    sum_score_nll = 0.0
    sum_cs_brier = 0.0
    sum_pred_total_goals = 0.0
    sum_actual_total_goals = 0.0
    sum_pred_cs = 0.0
    sum_actual_cs = 0.0

    for fx in fixtures_hist:
        hp = team_profiles.get(fx["home_code"])
        ap = team_profiles.get(fx["away_code"])
        if hp is None or ap is None:
            continue

        lh, la = estimate_match_lambdas(hp, ap, league)
        sum_goals_mae += 0.5 * (abs(fx["hg"] - lh) + abs(fx["ag"] - la))
        sum_pred_total_goals += lh + la
        sum_actual_total_goals += fx["hg"] + fx["ag"]
        sum_score_nll += -(poisson_log_pmf(fx["hg"], lh) + poisson_log_pmf(fx["ag"], la))

        p_home, p_draw, p_away = poisson_outcome_probs(lh, la, max_goals=10)
        if fx["hg"] > fx["ag"]:
            pr = p_home
        elif fx["hg"] == fx["ag"]:
            pr = p_draw
        else:
            pr = p_away
        sum_ll += -math.log(max(eps, pr))

        home_cs_pred = adjust_clean_sheet_pct_for_team(100.0 * math.exp(-la), hp, ap, league, is_home=True) / 100.0
        away_cs_pred = adjust_clean_sheet_pct_for_team(100.0 * math.exp(-lh), ap, hp, league, is_home=False) / 100.0
        home_cs_act = 1.0 if fx["ag"] == 0 else 0.0
        away_cs_act = 1.0 if fx["hg"] == 0 else 0.0
        sum_cs_brier += 0.5 * ((home_cs_pred - home_cs_act) ** 2 + (away_cs_pred - away_cs_act) ** 2)
        sum_pred_cs += 0.5 * (home_cs_pred + away_cs_pred)
        sum_actual_cs += 0.5 * (home_cs_act + away_cs_act)

        n += 1

    if n == 0:
        return {
            "n": 0,
            "goals_mae": 999.0,
            "result_logloss": 999.0,
            "score_nll": 999.0,
            "cs_brier": 999.0,
            "goal_total_bias": 999.0,
            "cs_rate_bias": 999.0,
            "composite": 999.0,
        }

    goals_mae = sum_goals_mae / n
    result_logloss = sum_ll / n
    score_nll = sum_score_nll / n
    cs_brier = sum_cs_brier / n
    goal_total_bias = abs((sum_pred_total_goals / n) - (sum_actual_total_goals / n))
    cs_rate_bias = abs((sum_pred_cs / n) - (sum_actual_cs / n))
    composite = (
        result_logloss
        + 0.42 * score_nll
        + 0.50 * goals_mae
        + 0.65 * cs_brier
        + 0.55 * goal_total_bias
        + 0.55 * cs_rate_bias
    )
    return {
        "n": n,
        "goals_mae": goals_mae,
        "result_logloss": result_logloss,
        "score_nll": score_nll,
        "cs_brier": cs_brier,
        "goal_total_bias": goal_total_bias,
        "cs_rate_bias": cs_rate_bias,
        "composite": composite,
    }


def prepare_player_calibration_samples(player_history_rows: List[Dict], max_rows: int) -> List[Dict]:
    rows = []
    for row in player_history_rows:
        mins = max(0.0, first_float(row, ["minutes"], 0.0))
        if mins <= 0:
            continue
        name = str(row.get("name", "")).strip()
        if not name or name == "0":
            continue
        rows.append(row)
    rows.sort(key=lambda r: parse_dt(r.get("kickoff_time")))
    if max_rows > 0 and len(rows) > max_rows:
        rows = rows[-max_rows:]
    return rows


def evaluate_player_historical_accuracy(
    player_rows: List[Dict],
    ability_by_code: Dict[int, Dict],
    ability_by_name: Dict[str, Dict],
    feature_encoder: Dict,
) -> Dict[str, float]:
    if not player_rows:
        return {
            "n": 0,
            "goals_mae": 999.0,
            "assists_mae": 999.0,
            "goal_brier": 999.0,
            "assist_brier": 999.0,
            "goal_bias": 999.0,
            "assist_bias": 999.0,
            "composite": 999.0,
        }

    n = 0
    sum_goal_mae = 0.0
    sum_assist_mae = 0.0
    sum_goal_brier = 0.0
    sum_assist_brier = 0.0
    sum_pred_g = 0.0
    sum_pred_a = 0.0
    sum_actual_g = 0.0
    sum_actual_a = 0.0

    for row in player_rows:
        hist = resolve_historical_ability(row, ability_by_code, ability_by_name)
        comps = compute_player_components(row, hist, feature_encoder)

        minutes = clamp(
            first_float(row, ["minutes", "average_minutes", "Avg_Minutes"], 0.0),
            0.0,
            120.0,
        )
        minutes_factor = (minutes / 90.0) ** PLAYER_MINUTES_EXP
        pred_goals = clamp(PLAYER_GOAL_RATE_BASE * comps["goal_signal"] * minutes_factor, 0.0, 3.5)
        pred_assists = clamp(PLAYER_ASSIST_RATE_BASE * comps["assist_signal"] * minutes_factor, 0.0, 3.0)

        actual_goals = max(0.0, first_float(row, ["goals_scored"], 0.0))
        actual_assists = max(0.0, first_float(row, ["assists"], 0.0))

        sum_goal_mae += abs(actual_goals - pred_goals)
        sum_assist_mae += abs(actual_assists - pred_assists)

        p_goal = 1.0 - math.exp(-pred_goals)
        p_assist = 1.0 - math.exp(-pred_assists)
        y_goal = 1.0 if actual_goals > 0 else 0.0
        y_assist = 1.0 if actual_assists > 0 else 0.0
        sum_goal_brier += (p_goal - y_goal) ** 2
        sum_assist_brier += (p_assist - y_assist) ** 2

        sum_pred_g += pred_goals
        sum_pred_a += pred_assists
        sum_actual_g += actual_goals
        sum_actual_a += actual_assists
        n += 1

    if n == 0:
        return {
            "n": 0,
            "goals_mae": 999.0,
            "assists_mae": 999.0,
            "goal_brier": 999.0,
            "assist_brier": 999.0,
            "goal_bias": 999.0,
            "assist_bias": 999.0,
            "composite": 999.0,
        }

    goals_mae = sum_goal_mae / n
    assists_mae = sum_assist_mae / n
    goal_brier = sum_goal_brier / n
    assist_brier = sum_assist_brier / n
    goal_bias = abs((sum_pred_g / n) - (sum_actual_g / n))
    assist_bias = abs((sum_pred_a / n) - (sum_actual_a / n))
    composite = (
        0.95 * goals_mae
        + 0.85 * assists_mae
        + 0.45 * goal_brier
        + 0.35 * assist_brier
        + 0.40 * goal_bias
        + 0.30 * assist_bias
    )

    return {
        "n": n,
        "goals_mae": goals_mae,
        "assists_mae": assists_mae,
        "goal_brier": goal_brier,
        "assist_brier": assist_brier,
        "goal_bias": goal_bias,
        "assist_bias": assist_bias,
        "composite": composite,
    }


def sample_candidate_params(rng: random.Random, center: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    c = center or get_tunable_params()
    return {
        "HOME_ADVANTAGE_MULTIPLIER": clamp(rng.uniform(1.01, 1.12) if center is None else rng.uniform(c["HOME_ADVANTAGE_MULTIPLIER"] - 0.025, c["HOME_ADVANTAGE_MULTIPLIER"] + 0.025), 1.00, 1.16),
        "ELO_DIVISOR": clamp(rng.uniform(700.0, 1300.0) if center is None else rng.uniform(c["ELO_DIVISOR"] - 160.0, c["ELO_DIVISOR"] + 160.0), 550.0, 1500.0),
        "CURRENT_STRENGTH_BLEND": clamp(rng.uniform(0.05, 0.28) if center is None else rng.uniform(c["CURRENT_STRENGTH_BLEND"] - 0.06, c["CURRENT_STRENGTH_BLEND"] + 0.06), 0.03, 0.35),
        "MODEL_SHRINK_TO_LEAGUE": clamp(rng.uniform(0.20, 0.55) if center is None else rng.uniform(c["MODEL_SHRINK_TO_LEAGUE"] - 0.08, c["MODEL_SHRINK_TO_LEAGUE"] + 0.08), 0.12, 0.62),
        "TEAM_STYLE_BLEND": clamp(rng.uniform(0.05, 0.38) if center is None else rng.uniform(c["TEAM_STYLE_BLEND"] - 0.06, c["TEAM_STYLE_BLEND"] + 0.06), 0.0, 0.45),
        "HOME_LAMBDA_ADJUST": clamp(rng.uniform(0.94, 1.08) if center is None else rng.uniform(c["HOME_LAMBDA_ADJUST"] - 0.03, c["HOME_LAMBDA_ADJUST"] + 0.03), 0.85, 1.15),
        "AWAY_LAMBDA_ADJUST": clamp(rng.uniform(0.96, 1.22) if center is None else rng.uniform(c["AWAY_LAMBDA_ADJUST"] - 0.04, c["AWAY_LAMBDA_ADJUST"] + 0.04), 0.86, 1.28),
        "CLEAN_SHEET_SHRINK": clamp(rng.uniform(0.72, 0.96) if center is None else rng.uniform(c["CLEAN_SHEET_SHRINK"] - 0.06, c["CLEAN_SHEET_SHRINK"] + 0.06), 0.55, 0.98),
        "BASELINE_CLEAN_SHEET_PCT": clamp(rng.uniform(23.0, 32.0) if center is None else rng.uniform(c["BASELINE_CLEAN_SHEET_PCT"] - 2.2, c["BASELINE_CLEAN_SHEET_PCT"] + 2.2), 18.0, 36.0),
        "PLAYER_BLEND_CURRENT": clamp(rng.uniform(0.45, 0.85) if center is None else rng.uniform(c["PLAYER_BLEND_CURRENT"] - 0.09, c["PLAYER_BLEND_CURRENT"] + 0.09), 0.25, 0.95),
        "PLAYER_CONTRIB_BASE": clamp(rng.uniform(0.55, 0.90) if center is None else rng.uniform(c["PLAYER_CONTRIB_BASE"] - 0.08, c["PLAYER_CONTRIB_BASE"] + 0.08), 0.35, 1.05),
        "PLAYER_CONTRIB_MULT": clamp(rng.uniform(0.45, 1.00) if center is None else rng.uniform(c["PLAYER_CONTRIB_MULT"] - 0.12, c["PLAYER_CONTRIB_MULT"] + 0.12), 0.20, 1.25),
        "PLAYER_GOAL_SCALE": clamp(rng.uniform(0.70, 1.45) if center is None else rng.uniform(c["PLAYER_GOAL_SCALE"] - 0.18, c["PLAYER_GOAL_SCALE"] + 0.18), 0.45, 1.75),
        "PLAYER_ASSIST_SCALE": clamp(rng.uniform(0.70, 1.45) if center is None else rng.uniform(c["PLAYER_ASSIST_SCALE"] - 0.18, c["PLAYER_ASSIST_SCALE"] + 0.18), 0.45, 1.75),
        "PLAYER_MINUTES_EXP": clamp(rng.uniform(0.90, 1.25) if center is None else rng.uniform(c["PLAYER_MINUTES_EXP"] - 0.08, c["PLAYER_MINUTES_EXP"] + 0.08), 0.75, 1.40),
        "PLAYER_GOAL_RATE_BASE": clamp(rng.uniform(0.16, 0.50) if center is None else rng.uniform(c["PLAYER_GOAL_RATE_BASE"] - 0.08, c["PLAYER_GOAL_RATE_BASE"] + 0.08), 0.08, 0.70),
        "PLAYER_ASSIST_RATE_BASE": clamp(rng.uniform(0.10, 0.40) if center is None else rng.uniform(c["PLAYER_ASSIST_RATE_BASE"] - 0.07, c["PLAYER_ASSIST_RATE_BASE"] + 0.07), 0.05, 0.60),
        "TEAM_STAT_XG_BLEND": clamp(rng.uniform(0.45, 0.82) if center is None else rng.uniform(c["TEAM_STAT_XG_BLEND"] - 0.09, c["TEAM_STAT_XG_BLEND"] + 0.09), 0.25, 0.92),
        "TEAM_STAT_CS_BLEND": clamp(rng.uniform(0.45, 0.86) if center is None else rng.uniform(c["TEAM_STAT_CS_BLEND"] - 0.10, c["TEAM_STAT_CS_BLEND"] + 0.10), 0.20, 0.95),
        "TEAM_SHOCK_STD_BASE": clamp(rng.uniform(0.03, 0.10) if center is None else rng.uniform(c["TEAM_SHOCK_STD_BASE"] - 0.02, c["TEAM_SHOCK_STD_BASE"] + 0.02), 0.01, 0.14),
        "TEAM_SHOCK_STD_SCALE": clamp(rng.uniform(0.25, 0.80) if center is None else rng.uniform(c["TEAM_SHOCK_STD_SCALE"] - 0.12, c["TEAM_SHOCK_STD_SCALE"] + 0.12), 0.10, 1.10),
    }


def calibrate_parameters_on_history(
    team_history_rows: List[Dict],
    player_history_rows: List[Dict],
    current_team_by_code: Dict[int, Dict],
    output_search_path: Path,
    output_best_path: Path,
    iterations: int,
    max_fixtures: int,
    max_player_rows: int,
    seed: int,
) -> Dict[str, float]:
    hist = load_historical_fixtures_from_team_history(
        team_history_rows,
        allowed_team_codes=set(current_team_by_code.keys()),
    )
    if len(hist) > max_fixtures > 0:
        hist = hist[-max_fixtures:]
    if len(hist) < 80:
        return get_tunable_params()

    split_idx = int(len(hist) * 0.8)
    train_fixtures = hist[:split_idx]
    valid_fixtures = hist[split_idx:]

    player_hist = prepare_player_calibration_samples(player_history_rows, max_player_rows)
    if len(player_hist) >= 200:
        p_split = int(len(player_hist) * 0.8)
        train_player_rows = player_hist[:p_split]
        valid_player_rows = player_hist[p_split:]
    else:
        train_player_rows = []
        valid_player_rows = []
    ability_by_code, ability_by_name, feature_encoder = build_historical_player_ability(player_history_rows)

    rng = random.Random(seed + 1307)
    best = None
    search_rows = []
    baseline_params = get_tunable_params()

    total_iters = max(12, int(iterations))
    for i in range(total_iters):
        if i == 0:
            candidate = dict(baseline_params)
        elif i < int(total_iters * 0.7):
            candidate = sample_candidate_params(rng, center=None)
        else:
            center = best["params"] if best is not None else baseline_params
            candidate = sample_candidate_params(rng, center=center)

        apply_tunable_params(candidate)
        team_profiles, league = build_team_profiles(team_history_rows, current_team_by_code)
        train_metrics = evaluate_historical_accuracy(train_fixtures, team_profiles, league)
        valid_metrics = evaluate_historical_accuracy(valid_fixtures, team_profiles, league)
        train_player_metrics = evaluate_player_historical_accuracy(
            train_player_rows, ability_by_code, ability_by_name, feature_encoder
        )
        valid_player_metrics = evaluate_player_historical_accuracy(
            valid_player_rows, ability_by_code, ability_by_name, feature_encoder
        )

        train_joint = train_metrics["composite"] + PLAYER_OBJECTIVE_WEIGHT * train_player_metrics["composite"]
        valid_joint = valid_metrics["composite"] + PLAYER_OBJECTIVE_WEIGHT * valid_player_metrics["composite"]

        row = {
            "iter": i,
            "train_n": train_metrics["n"],
            "valid_n": valid_metrics["n"],
            "train_player_n": train_player_metrics["n"],
            "valid_player_n": valid_player_metrics["n"],
            "train_goals_mae": round(train_metrics["goals_mae"], 6),
            "valid_goals_mae": round(valid_metrics["goals_mae"], 6),
            "train_result_logloss": round(train_metrics["result_logloss"], 6),
            "valid_result_logloss": round(valid_metrics["result_logloss"], 6),
            "train_score_nll": round(train_metrics["score_nll"], 6),
            "valid_score_nll": round(valid_metrics["score_nll"], 6),
            "train_cs_brier": round(train_metrics["cs_brier"], 6),
            "valid_cs_brier": round(valid_metrics["cs_brier"], 6),
            "train_goal_total_bias": round(train_metrics["goal_total_bias"], 6),
            "valid_goal_total_bias": round(valid_metrics["goal_total_bias"], 6),
            "train_cs_rate_bias": round(train_metrics["cs_rate_bias"], 6),
            "valid_cs_rate_bias": round(valid_metrics["cs_rate_bias"], 6),
            "train_player_goals_mae": round(train_player_metrics["goals_mae"], 6),
            "valid_player_goals_mae": round(valid_player_metrics["goals_mae"], 6),
            "train_player_assists_mae": round(train_player_metrics["assists_mae"], 6),
            "valid_player_assists_mae": round(valid_player_metrics["assists_mae"], 6),
            "train_player_goal_brier": round(train_player_metrics["goal_brier"], 6),
            "valid_player_goal_brier": round(valid_player_metrics["goal_brier"], 6),
            "train_player_assist_brier": round(train_player_metrics["assist_brier"], 6),
            "valid_player_assist_brier": round(valid_player_metrics["assist_brier"], 6),
            "train_player_goal_bias": round(train_player_metrics["goal_bias"], 6),
            "valid_player_goal_bias": round(valid_player_metrics["goal_bias"], 6),
            "train_player_assist_bias": round(train_player_metrics["assist_bias"], 6),
            "valid_player_assist_bias": round(valid_player_metrics["assist_bias"], 6),
            "valid_team_composite": round(valid_metrics["composite"], 6),
            "valid_player_composite": round(valid_player_metrics["composite"], 6),
            "valid_composite": round(valid_joint, 6),
        }
        row.update({k: round(float(v), 6) for k, v in candidate.items()})
        search_rows.append(row)

        if best is None or valid_joint < best["valid_composite"]:
            best = {
                "params": dict(candidate),
                "train": train_metrics,
                "train_player": train_player_metrics,
                "valid_composite": valid_joint,
                "valid": valid_metrics,
                "valid_player": valid_player_metrics,
            }

    if best is None:
        apply_tunable_params(baseline_params)
        return baseline_params

    apply_tunable_params(best["params"])

    search_fields = [
        "iter",
        "train_n",
        "valid_n",
        "train_player_n",
        "valid_player_n",
        "train_goals_mae",
        "valid_goals_mae",
        "train_result_logloss",
        "valid_result_logloss",
        "train_score_nll",
        "valid_score_nll",
        "train_cs_brier",
        "valid_cs_brier",
        "train_goal_total_bias",
        "valid_goal_total_bias",
        "train_cs_rate_bias",
        "valid_cs_rate_bias",
        "train_player_goals_mae",
        "valid_player_goals_mae",
        "train_player_assists_mae",
        "valid_player_assists_mae",
        "train_player_goal_brier",
        "valid_player_goal_brier",
        "train_player_assist_brier",
        "valid_player_assist_brier",
        "train_player_goal_bias",
        "valid_player_goal_bias",
        "train_player_assist_bias",
        "valid_player_assist_bias",
        "valid_team_composite",
        "valid_player_composite",
        "valid_composite",
        "HOME_ADVANTAGE_MULTIPLIER",
        "ELO_DIVISOR",
        "CURRENT_STRENGTH_BLEND",
        "MODEL_SHRINK_TO_LEAGUE",
        "TEAM_STYLE_BLEND",
        "HOME_LAMBDA_ADJUST",
        "AWAY_LAMBDA_ADJUST",
        "CLEAN_SHEET_SHRINK",
        "BASELINE_CLEAN_SHEET_PCT",
        "PLAYER_BLEND_CURRENT",
        "PLAYER_CONTRIB_BASE",
        "PLAYER_CONTRIB_MULT",
        "PLAYER_GOAL_SCALE",
        "PLAYER_ASSIST_SCALE",
        "PLAYER_MINUTES_EXP",
        "PLAYER_GOAL_RATE_BASE",
        "PLAYER_ASSIST_RATE_BASE",
        "TEAM_STAT_XG_BLEND",
        "TEAM_STAT_CS_BLEND",
        "TEAM_SHOCK_STD_BASE",
        "TEAM_SHOCK_STD_SCALE",
    ]
    write_csv(output_search_path, search_rows, search_fields)

    best_row = {
        **{k: round(float(v), 6) for k, v in best["params"].items()},
        "train_n": best["train"]["n"],
        "valid_n": best["valid"]["n"],
        "train_goals_mae": round(best["train"]["goals_mae"], 6),
        "valid_goals_mae": round(best["valid"]["goals_mae"], 6),
        "train_result_logloss": round(best["train"]["result_logloss"], 6),
        "valid_result_logloss": round(best["valid"]["result_logloss"], 6),
        "train_score_nll": round(best["train"]["score_nll"], 6),
        "valid_score_nll": round(best["valid"]["score_nll"], 6),
        "train_cs_brier": round(best["train"]["cs_brier"], 6),
        "valid_cs_brier": round(best["valid"]["cs_brier"], 6),
        "train_goal_total_bias": round(best["train"]["goal_total_bias"], 6),
        "valid_goal_total_bias": round(best["valid"]["goal_total_bias"], 6),
        "train_cs_rate_bias": round(best["train"]["cs_rate_bias"], 6),
        "valid_cs_rate_bias": round(best["valid"]["cs_rate_bias"], 6),
        "train_player_n": best["train_player"]["n"],
        "valid_player_n": best["valid_player"]["n"],
        "train_player_goals_mae": round(best["train_player"]["goals_mae"], 6),
        "valid_player_goals_mae": round(best["valid_player"]["goals_mae"], 6),
        "train_player_assists_mae": round(best["train_player"]["assists_mae"], 6),
        "valid_player_assists_mae": round(best["valid_player"]["assists_mae"], 6),
        "train_player_goal_brier": round(best["train_player"]["goal_brier"], 6),
        "valid_player_goal_brier": round(best["valid_player"]["goal_brier"], 6),
        "train_player_assist_brier": round(best["train_player"]["assist_brier"], 6),
        "valid_player_assist_brier": round(best["valid_player"]["assist_brier"], 6),
        "train_player_goal_bias": round(best["train_player"]["goal_bias"], 6),
        "valid_player_goal_bias": round(best["valid_player"]["goal_bias"], 6),
        "train_player_assist_bias": round(best["train_player"]["assist_bias"], 6),
        "valid_player_assist_bias": round(best["valid_player"]["assist_bias"], 6),
        "valid_team_composite": round(best["valid"]["composite"], 6),
        "valid_player_composite": round(best["valid_player"]["composite"], 6),
        "valid_composite": round(best["valid_composite"], 6),
        "history_fixtures_used": len(hist),
        "history_player_rows_used": len(player_hist),
    }
    write_csv(
        output_best_path,
        [best_row],
        [
            "HOME_ADVANTAGE_MULTIPLIER",
            "ELO_DIVISOR",
            "CURRENT_STRENGTH_BLEND",
            "MODEL_SHRINK_TO_LEAGUE",
            "TEAM_STYLE_BLEND",
            "HOME_LAMBDA_ADJUST",
            "AWAY_LAMBDA_ADJUST",
            "CLEAN_SHEET_SHRINK",
            "BASELINE_CLEAN_SHEET_PCT",
            "PLAYER_BLEND_CURRENT",
            "PLAYER_CONTRIB_BASE",
            "PLAYER_CONTRIB_MULT",
            "PLAYER_GOAL_SCALE",
            "PLAYER_ASSIST_SCALE",
            "PLAYER_MINUTES_EXP",
            "PLAYER_GOAL_RATE_BASE",
            "PLAYER_ASSIST_RATE_BASE",
            "TEAM_STAT_XG_BLEND",
            "TEAM_STAT_CS_BLEND",
            "TEAM_SHOCK_STD_BASE",
            "TEAM_SHOCK_STD_SCALE",
            "train_n",
            "valid_n",
            "train_player_n",
            "valid_player_n",
            "train_goals_mae",
            "valid_goals_mae",
            "train_result_logloss",
            "valid_result_logloss",
            "train_score_nll",
            "valid_score_nll",
            "train_cs_brier",
            "valid_cs_brier",
            "train_goal_total_bias",
            "valid_goal_total_bias",
            "train_cs_rate_bias",
            "valid_cs_rate_bias",
            "train_player_goals_mae",
            "valid_player_goals_mae",
            "train_player_assists_mae",
            "valid_player_assists_mae",
            "train_player_goal_brier",
            "valid_player_goal_brier",
            "train_player_assist_brier",
            "valid_player_assist_brier",
            "train_player_goal_bias",
            "valid_player_goal_bias",
            "train_player_assist_bias",
            "valid_player_assist_bias",
            "valid_team_composite",
            "valid_player_composite",
            "valid_composite",
            "history_fixtures_used",
            "history_player_rows_used",
        ],
    )
    return best["params"]


def run_simulator(
    fixture_path: Path,
    current_teams_path: Path,
    current_players_path: Path,
    team_history_path: Path,
    player_prediction_path: Path,
    player_history_path: Path,
    output_match_path: Path,
    output_player_path: Path,
    simulations: int,
    seed: int,
    horizon_gws: Optional[int],
) -> Tuple[List[Dict], List[Dict]]:
    team_by_id, team_by_code, _ = load_current_teams(current_teams_path)
    current_players_chance = load_current_player_availability(current_players_path)

    fixtures = load_upcoming_fixtures(fixture_path, team_by_id, horizon_gws)
    if not fixtures:
        raise RuntimeError("No unfinished fixtures found for simulation.")

    team_history_rows = read_csv_rows(team_history_path)
    player_prediction_rows = read_csv_rows(player_prediction_path)
    player_history_rows = read_csv_rows(player_history_path)

    team_profiles, league = build_team_profiles(team_history_rows, team_by_code)
    attach_team_shock_stds_from_history(
        team_history_rows=team_history_rows,
        team_profiles=team_profiles,
        league=league,
        allowed_team_codes=set(team_by_code.keys()),
    )
    ability_by_code, ability_by_name, feature_encoder = build_historical_player_ability(player_history_rows)
    player_profiles_by_fixture, team_assist_ratio_by_fixture = build_player_profiles_for_fixtures(
        player_prediction_rows,
        current_players_chance,
        fixtures=fixtures,
        ability_by_code=ability_by_code,
        ability_by_name=ability_by_name,
        feature_encoder=feature_encoder,
    )

    rng = random.Random(seed)
    match_rows: List[Dict] = []
    player_rows: List[Dict] = []

    for fx in fixtures:
        home_code = fx["home_team_code"]
        away_code = fx["away_team_code"]
        home_profile = team_profiles.get(home_code)
        away_profile = team_profiles.get(away_code)
        if home_profile is None or away_profile is None:
            continue

        players_for_fixture = player_profiles_by_fixture.get(fx["fixture_code"], {})
        assist_for_fixture = team_assist_ratio_by_fixture.get(fx["fixture_code"], {})

        mrow, prows = simulate_fixture(
            fixture=fx,
            home_profile=home_profile,
            away_profile=away_profile,
            league=league,
            players_by_team=players_for_fixture,
            team_assist_ratio=assist_for_fixture,
            simulations=simulations,
            rng=rng,
        )
        match_rows.append(mrow)
        player_rows.extend(prows)

    match_fields = [
        "fixture_code",
        "GW",
        "home_team",
        "away_team",
        "home_lambda",
        "away_lambda",
        "home_lambda_stat",
        "away_lambda_stat",
        "home_win_pct",
        "draw_pct",
        "away_win_pct",
        "home_clean_sheet_pct",
        "away_clean_sheet_pct",
        "home_clean_sheet_raw_pct",
        "away_clean_sheet_raw_pct",
        "btts_pct",
        "over_2_5_pct",
        "avg_home_goals",
        "avg_away_goals",
        "home_pool_equivalent",
        "away_pool_equivalent",
        "predicted_result",
        "most_likely_scoreline",
        "most_likely_scoreline_pct",
        "simulations",
    ]
    player_fields = [
        "fixture_code",
        "GW",
        "team",
        "opponent",
        "was_home",
        "player_name",
        "player_key",
        "position",
        "start_probability",
        "expected_minutes",
        "expected_goals",
        "anytime_goal_pct",
        "expected_assists",
        "anytime_assist_pct",
        "goal_weight",
        "assist_weight",
        "goal_weight_share_pct",
        "assist_weight_share_pct",
        "goal_contribution_index",
        "assist_contribution_index",
        "goal_stats_current_score",
        "assist_stats_current_score",
        "goal_stats_historical_score",
        "assist_stats_historical_score",
        "history_reliability",
        "minutes_volatility",
        "goal_volatility",
        "assist_volatility",
        "team_pool_equivalent",
        "goal_allocation_top_n",
        "assist_allocation_top_n",
        "simulations",
    ]

    write_csv(output_match_path, match_rows, match_fields)
    write_csv(output_player_path, player_rows, player_fields)
    return match_rows, player_rows


def build_cli() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Fixture and player simulation generator.")
    p.add_argument("--fixture-path", type=Path, default=FIXTURE_PATH)
    p.add_argument("--current-teams-path", type=Path, default=CURRENT_TEAMS_PATH)
    p.add_argument("--current-players-path", type=Path, default=CURRENT_PLAYERS_PATH)
    p.add_argument("--team-history-path", type=Path, default=TEAM_HISTORY_PATH)
    p.add_argument("--player-prediction-path", dest="player_prediction_path", type=Path, default=PLAYER_PREDICTION_PATH)
    p.add_argument("--player-history-path", dest="player_history_path", type=Path, default=PLAYER_HISTORY_PATH)
    p.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    p.add_argument("--simulations", type=int, default=SIMULATIONS_PER_MATCH)
    p.add_argument("--seed", type=int, default=RANDOM_SEED)
    p.add_argument("--horizon-gws", type=int, default=HORIZON_GWS)
    p.add_argument("--calibrate", dest="calibrate", action="store_true")
    p.add_argument("--no-calibrate", dest="calibrate", action="store_false")
    p.set_defaults(calibrate=AUTO_CALIBRATE_ON_HISTORY)
    p.add_argument("--calibration-iters", type=int, default=CALIBRATION_ITERS)
    p.add_argument("--calibration-max-fixtures", type=int, default=CALIBRATION_MAX_FIXTURES)
    p.add_argument("--calibration-max-player-rows", type=int, default=CALIBRATION_MAX_PLAYER_ROWS)
    return p


def main() -> None:
    args = build_cli().parse_args()
    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    output_match_path = output_dir / MATCH_OUTPUT_PATH.name
    output_player_path = output_dir / PLAYER_OUTPUT_PATH.name
    output_calibration_search_path = output_dir / CALIBRATION_SEARCH_OUTPUT_PATH.name
    output_calibration_best_path = output_dir / CALIBRATION_BEST_OUTPUT_PATH.name
    effective_horizon = None
    if not SIMULATE_ALL_FUTURE_GWS:
        effective_horizon = args.horizon_gws if args.horizon_gws is None or args.horizon_gws > 0 else None

    if args.calibrate:
        _, current_team_by_code, _ = load_current_teams(args.current_teams_path)
        team_history_rows = read_csv_rows(args.team_history_path)
        player_history_rows = read_csv_rows(args.player_history_path)
        best_params = calibrate_parameters_on_history(
            team_history_rows=team_history_rows,
            player_history_rows=player_history_rows,
            current_team_by_code=current_team_by_code,
            output_search_path=output_calibration_search_path,
            output_best_path=output_calibration_best_path,
            iterations=max(10, int(args.calibration_iters)),
            max_fixtures=max(120, int(args.calibration_max_fixtures)),
            max_player_rows=max(500, int(args.calibration_max_player_rows)),
            seed=int(args.seed),
        )
        apply_tunable_params(best_params)

    match_rows, player_rows = run_simulator(
        fixture_path=args.fixture_path,
        current_teams_path=args.current_teams_path,
        current_players_path=args.current_players_path,
        team_history_path=args.team_history_path,
        player_prediction_path=args.player_prediction_path,
        player_history_path=args.player_history_path,
        output_match_path=output_match_path,
        output_player_path=output_player_path,
        simulations=max(100, int(args.simulations)),
        seed=int(args.seed),
        horizon_gws=effective_horizon,
    )

    print(f"Simulated fixtures: {len(match_rows)}")
    print(f"Player outcome rows: {len(player_rows)}")
    print(f"Match output: {output_match_path}")
    print(f"Player output: {output_player_path}")
    if args.calibrate:
        print(f"Calibration search: {output_calibration_search_path}")
        print(f"Calibration best: {output_calibration_best_path}")


if __name__ == "__main__":
    main()
