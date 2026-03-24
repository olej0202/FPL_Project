from typing import Optional, Dict, Any, List, Tuple
from collections import defaultdict, Counter

import numpy as np
import pandas as pd
import pyomo.environ as pyo

from Generate_Fetch_Myteam import build_team_dataframe


# ============================================================
# Helpers
# ============================================================

def apply_points_override_from_long(
    model_df: pd.DataFrame,
    df_long: pd.DataFrame,
    gw_list: list[str],
) -> pd.DataFrame:
    if df_long is None or df_long.empty:
        return model_df

    df_long = df_long.copy()

    name_col = None
    for cand in ["player", "name", "Name", "web_name"]:
        if cand in df_long.columns:
            name_col = cand
            break
    if name_col is None:
        raise ValueError("Override dataframe must have one of: player, name, Name, web_name")

    df_long = df_long.rename(columns={name_col: "name"})
    if "GW" not in df_long.columns or "Points" not in df_long.columns:
        raise ValueError("Override dataframe must have columns GW and Points")

    df_long["name"] = df_long["name"].astype(str)
    df_long["GW"] = pd.to_numeric(df_long["GW"], errors="coerce").fillna(-1).astype(int)
    df_long["Points"] = pd.to_numeric(df_long["Points"], errors="coerce").fillna(0.0)

    pivot = (
        df_long
        .pivot_table(index="name", columns="GW", values="Points", aggfunc="sum")
        .fillna(0.0)
    )

    if 0 not in pivot.columns:
        pivot[0] = 0.0

    gw_int_to_col = {}
    for gw_str in gw_list:
        try:
            gw_int_to_col[int(gw_str)] = gw_str
        except ValueError:
            pass

    out = model_df.copy()
    out["name"] = out["name"].astype(str)

    for player_name, row in pivot.iterrows():
        mask = out["name"] == player_name
        if not mask.any():
            continue
        for gw_int, gw_str in gw_int_to_col.items():
            if gw_int in row.index:
                out.loc[mask, gw_str] = row[gw_int]

    return out


def get_last_completed_gw(current_fixture_path: str) -> int:
    df = pd.read_csv(current_fixture_path)
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"])

    min_kicks = df.groupby("event", as_index=False)["kickoff_time"].min()

    if min_kicks["kickoff_time"].dt.tz is None:
        min_kicks["kickoff_time"] = min_kicks["kickoff_time"].dt.tz_localize("UTC")
    min_kicks["kickoff_time"] = min_kicks["kickoff_time"].dt.tz_convert("Europe/Oslo")

    now = pd.Timestamp.now(tz="Europe/Oslo")
    future = min_kicks[min_kicks["kickoff_time"] > now].sort_values("kickoff_time").head(1)

    if future.empty:
        return int(min_kicks["event"].max())

    return int(future["event"].astype(int).values[0] - 1)


def build_planning_gw_list(
    current_fixture_path: str = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv",
    horizon_weeks: int = 6,
) -> list[str]:
    last_gw = get_last_completed_gw(current_fixture_path)
    start = max(last_gw + 1, 1)
    cutoff = min(start + horizon_weeks - 1, 38)
    return ["0"] + [str(i) for i in range(start, cutoff + 1)]


def safe_value(x):
    try:
        v = x.value
        return 0.0 if v is None else float(v)
    except Exception:
        return 0.0


def safe_obj_value(obj):
    try:
        return float(pyo.value(obj))
    except Exception:
        return 0.0


def prefilter_players_by_horizon_points(
    data: pd.DataFrame,
    team_df: pd.DataFrame,
    gw_list: list[str],
    min_points_per_gw: float = 1.0,
) -> pd.DataFrame:
    """
    Keep all players in the initial squad.
    For all other players, keep only those with:
        sum(predicted points over horizon) >= len(horizon) * min_points_per_gw
    """
    df = data.copy()
    df["name"] = df["name"].astype(str)

    team_names = set(team_df["name"].astype(str).tolist())
    horizon_cols = [gw for gw in gw_list if gw != "0"]

    if len(horizon_cols) == 0:
        return df

    for col in horizon_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    horizon_threshold = len(horizon_cols) * float(min_points_per_gw)
    horizon_sum = df[horizon_cols].sum(axis=1)

    keep_mask = df["name"].isin(team_names) | (horizon_sum >= horizon_threshold)
    filtered = df.loc[keep_mask].copy()

    print(
        f"Prefilter: kept {len(filtered)} of {len(df)} players "
        f"(threshold={horizon_threshold:.2f} over {len(horizon_cols)} GWs)"
    )

    return filtered


def count_transferred_in_by_gw(
    df: pd.DataFrame,
    counts: dict[str, dict[str, int]],
) -> None:
    """
    Update nested dict:
    counts[gw][player_name] += 1
    for rows where status == 'transferred_in'
    """
    if df is None or df.empty:
        return

    transferred_in = df[df["status"] == "transferred_in"].copy()
    if transferred_in.empty:
        return

    transferred_in["GW"] = transferred_in["GW"].astype(str)
    transferred_in["Name"] = transferred_in["Name"].astype(str)

    for _, row in transferred_in.iterrows():
        gw = row["GW"]
        name = row["Name"]
        counts[gw][name] += 1


def summarize_chip_weeks(results_meta: List[Dict[str, Any]]) -> pd.DataFrame:
    rows = []
    fh_counter = Counter()
    wc_counter = Counter()
    bb_counter = Counter()
    tc_counter = Counter()

    for meta in results_meta:
        for gw in meta.get("free_hit_gws", []):
            fh_counter[str(gw)] += 1
        for gw in meta.get("wildcard_gws", []):
            wc_counter[str(gw)] += 1
        for gw in meta.get("bench_boost_gws", []):
            bb_counter[str(gw)] += 1
        for gw in meta.get("triple_captain_gws", []):
            tc_counter[str(gw)] += 1

    for gw, cnt in sorted(fh_counter.items(), key=lambda x: int(x[0])):
        rows.append({"chip": "free_hit", "GW": gw, "count": cnt})
    for gw, cnt in sorted(wc_counter.items(), key=lambda x: int(x[0])):
        rows.append({"chip": "wildcard", "GW": gw, "count": cnt})
    for gw, cnt in sorted(bb_counter.items(), key=lambda x: int(x[0])):
        rows.append({"chip": "bench_boost", "GW": gw, "count": cnt})
    for gw, cnt in sorted(tc_counter.items(), key=lambda x: int(x[0])):
        rows.append({"chip": "triple_captain", "GW": gw, "count": cnt})

    return pd.DataFrame(rows)


# ============================================================
# Main optimizer with chip decision variables
# ============================================================

def optimize_my_team(
    team_id: int = 46805,
    Last_GW: int = 24,
    banned_list: Optional[list[str]] = None,
    GW_list: Optional[list[str]] = None,
    n_hits: int = 0,
    current_player_path: str = "Raw_Data_25/current_players.csv",
    players_override: Optional[pd.DataFrame] = None,
    risk_factor: float = 0.0,
    transval: float = 0.5,
    use_warmstart: bool = False,
    previous_solution: Optional[Dict[str, Any]] = None,
    time_limit: Optional[int] = 120,
    mip_gap: float = 0.01,
    return_meta: bool = False,
    horizon_weeks: int = 6,
    chip_cost_wildcard: float = 0.0,
    chip_cost_free_hit: float = 0.0,
    chip_cost_bench_boost: float = 0.0,
    chip_cost_triple_captain: float = 0.0,
    allow_wildcard: bool = True,
    allow_free_hit: bool = True,
    allow_bench_boost: bool = True,
    allow_triple_captain: bool = True,
    wildcard_preserves_saved_transfers: bool = True,
    wildcard_future_gw_value: float = 1.0,
    force_wildcard_gw: Optional[int] = None,
    force_free_hit_gw: Optional[int] = None,
    force_bench_boost_gw: Optional[int] = None,
    force_triple_captain_gw: Optional[int] = None,
) -> pd.DataFrame | tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Chip usage is endogenous:
      - wc_used[t]   : wildcard in GW t
      - fh_used[t]   : free hit in GW t
      - bb_used[t]   : bench boost in GW t
      - tc_used[t]   : triple captain in GW t

    Constraints:
      - At most one chip per week
      - Each chip can be used at most once over the horizon
      - Chips cannot be used in t=0
      - Free Hit uses a temporary squad and reverts next GW
      - Wildcard allows unlimited transfers in that week with zero transfer-use count/hit
      - Bench Boost gives the bench full points instead of 0.1 points for that week only
      - Triple Captain adds one extra captain copy (captain scores 3x instead of 2x)

    Additional wildcard horizon carry value:
      - If wildcard is played in GW w and (38 - w) > 4, award decaying value
        for post-horizon GWs only:
            w+1 -> 5
            w+2 -> 4
            w+3 -> 3
            w+4 -> 2
            w+5 -> 1
      - Only weeks not already inside the optimization horizon are counted.
      - Never count beyond GW 38.
      - Scaled by wildcard_future_gw_value.
    """

    if banned_list is None:
        banned_list = []

    current_fixture_path = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv"

    if GW_list is None:
        GW_list = build_planning_gw_list(
            current_fixture_path=current_fixture_path,
            horizon_weeks=horizon_weeks,
        )

    GW_list = [str(gw) for gw in GW_list]
    print("GW_list:", GW_list)

    current_players = pd.read_csv(current_player_path)
    is_first = "1" in GW_list
    team_id = int(team_id)

    optimize_range = len(GW_list)
    gameweeks = list(range(optimize_range))
    future_t = [t for t in gameweeks if t >= 1]
    
    def gw_to_t(force_gw: Optional[int], chip_name: str) -> Optional[int]:
        if force_gw is None:
            return None
        force_gw_str = str(int(force_gw))
        if force_gw_str not in GW_list:
            raise ValueError(
                f"{chip_name}: forced GW {force_gw} is not in GW_list={GW_list}"
            )
        t_val = GW_list.index(force_gw_str)
        if t_val == 0:
            raise ValueError(f"{chip_name}: cannot force a chip in GW_list[0]")
        return t_val

    force_wc_t = gw_to_t(force_wildcard_gw, "Wildcard")
    force_fh_t = gw_to_t(force_free_hit_gw, "Free Hit")
    force_bb_t = gw_to_t(force_bench_boost_gw, "Bench Boost")
    force_tc_t = gw_to_t(force_triple_captain_gw, "Triple Captain")
    
    
    forced_chip_map = {}
    for chip_name, chip_t in [
        ("wildcard", force_wc_t),
        ("free_hit", force_fh_t),
        ("bench_boost", force_bb_t),
        ("triple_captain", force_tc_t),
    ]:
        if chip_t is not None:
            if chip_t in forced_chip_map:
                raise ValueError(
                    f"Cannot force multiple chips in the same GW: "
                    f"{chip_name} and {forced_chip_map[chip_t]} both forced to GW {GW_list[chip_t]}"
                )
            forced_chip_map[chip_t] = chip_name

    # ---------------- Load data ----------------
    data = pd.read_csv("Model_Optimizer.csv")

    for gw in GW_list:
        if gw not in data.columns:
            data[gw] = 0.0

    if players_override is not None and not players_override.empty:
        override_long = players_override[["name", "GW", "Points"]].copy()
        data = apply_points_override_from_long(data, override_long, GW_list)

    banned_mask = data["name"].isin(banned_list)
    for col in GW_list:
        data[col] = np.where(banned_mask, 0.0, data[col])

    # ---------------- Team / budget ----------------
    if is_first:
        initial_saved = 1
        team_df = pd.read_csv("Free_hit_team.csv")
        team_df["Full_Name"] = team_df["Name"].values
        money_in_bank_init = 0.0
    else:
        team_df = build_team_dataframe(team_id)
        initial_saved = int(team_df["saved_transfers"].values[0])
        money_in_bank_init = float(team_df["money_in_bank_m"].values[0])

    data = prefilter_players_by_horizon_points(
        data=data,
        team_df=team_df,
        gw_list=GW_list,
        min_points_per_gw=1.0,
    )

    team_names = set(team_df["name"].astype(str).str.strip())
    filtered_names = set(data["name"].astype(str).str.strip())
    missing_names = sorted(team_names - filtered_names)

    if missing_names:
        print("ERROR: These team_df players are missing after filtering:")
        for name in missing_names:
            print(f" - {name}")
        raise ValueError(
            f"{len(missing_names)} initial squad players are missing after filtering: {missing_names}"
        )
    else:
        print("All team_df names are present in the filtered player list.")

    players = data["name"].astype(str).tolist()
    costs = data["value"].astype(float).tolist()

    initial_squad = []
    for t in range(len(team_df)):
        name = str(team_df["name"].values[t])
        if name in players:
            initial_squad.append(players.index(name))

    sell_values = costs.copy()

    if is_first:
        budget_amount = 100.0
    else:
        selling_cost = team_df["selling_price_m"].values.astype(float)
        budget_amount = float(np.sum(selling_cost) + money_in_bank_init + 0.01)
        for i, idx in enumerate(initial_squad):
            sell_values[idx] = float(selling_cost[i])

    initial_saved = initial_saved + n_hits

    positions = data["position"].tolist()
    teams = data["team_code"].tolist()
    selected = pd.to_numeric(data["selected"], errors="coerce").fillna(0.0).to_numpy()
    predicted_points = data[GW_list].to_numpy(dtype=float).copy()

    # ---------------- Risk adjustment ----------------
    risk_float = float(risk_factor) if risk_factor is not None else 0.0
    risk_int = float(np.clip(risk_float * 5, -5, 5))
    risk_value = risk_int / 20.0

    sel = np.clip(selected.astype(float), 0, 1)
    ownership_risk = 1 - sel

    points_std = pd.to_numeric(data["Point_STD"], errors="coerce")
    points_std = points_std.fillna(points_std.median()).to_numpy(dtype=float)

    points_risk = pd.to_numeric(data["Risk_share_avg"], errors="coerce")
    points_risk = points_risk.fillna(points_risk.median()).to_numpy(dtype=float)

    points_risk = np.clip(points_risk, 0, 0.8)
    points_std = np.clip(points_std, 0, 3.5)

    std_min = float(np.nanpercentile(points_std, 5))
    std_max = float(np.nanpercentile(points_std, 95))
    points_std_scaled = (points_std - std_min) / (std_max - std_min + 1e-9)
    points_std_scaled = np.clip(points_std_scaled, 0, 1)

    w_own, w_std = 0.7, 0.3
    risk_score = w_own * ownership_risk + w_std * (points_std_scaled * 0.3 + 0.7 * points_risk)

    if risk_value < 0:
        sign = -1
    elif risk_value > 0:
        sign = 1
    else:
        sign = 0

    lam = 1.3 + abs(risk_int)
    transfervalue = transval * 2
    risk_transfer_offset = 1 + abs(risk_float) / 2

    HIT_PENALTY = 2.5
    HIT_MAX = 1
    BIG_M_TRANSFERS = 15

    abs_gw_num = {t: (int(GW_list[t]) if str(GW_list[t]).isdigit() else None) for t in gameweeks}

    discount_t = {}
    for t in gameweeks:
        gw = abs_gw_num.get(t)
        if gw is None or gw == 0:
            discount_t[t] = 0.0
        else:
            gwagain = 38 - gw
            end = min(3, max(0, gwagain))
            discount_t[t] = end / 3.0

    # Wildcard carry value outside the optimization horizon
    horizon_abs_gws = {int(gw) for gw in GW_list if str(gw).isdigit() and int(gw) >= 1}

    wc_future_bonus_t = {}
    for t in gameweeks:
        gw = abs_gw_num.get(t)

        if gw is None or gw <= 0 or gw >= 38:
            wc_future_bonus_t[t] = 0.0
            continue

        if (38 - gw) <= 4:
            wc_future_bonus_t[t] = 0.0
            continue

        bonus = 0.0
        for future_gw in range(gw + 1, min(gw + 5, 38) + 1):
            if future_gw not in horizon_abs_gws:
                bonus += 6 - (future_gw - gw)  # +1->5, +2->4, ..., +5->1

        wc_future_bonus_t[t] = float(bonus)

    num_players = len(players)
    I = list(range(num_players))
    T = gameweeks

    def_indices = [i for i, pos in enumerate(positions) if pos == "DEF"]
    gk_indices = [i for i, pos in enumerate(positions) if pos == "GKP"]
    mid_indices = [i for i, pos in enumerate(positions) if pos == "MID"]
    fwd_indices = [i for i, pos in enumerate(positions) if pos == "FWD"]
    outfield_indices = [i for i, pos in enumerate(positions) if pos != "GKP"]

    risk_score[gk_indices] = 0.0

    teams_set = set(teams)
    team_to_indices = {
        team: [i for i, tcode in enumerate(teams) if tcode == team]
        for team in teams_set
    }

    # ============================================================
    # Model
    # ============================================================
    m = pyo.ConcreteModel()

    m.I = pyo.Set(initialize=I)
    m.T = pyo.Set(initialize=T)
    m.TF = pyo.Set(initialize=future_t)
    m.DEF = pyo.Set(initialize=def_indices)
    m.GK = pyo.Set(initialize=gk_indices)
    m.MID = pyo.Set(initialize=mid_indices)
    m.FWD = pyo.Set(initialize=fwd_indices)
    m.OUT = pyo.Set(initialize=outfield_indices)

    cost_dict = {i: float(costs[i]) for i in I}
    sell_dict = {i: float(sell_values[i]) for i in I}
    risk_dict = {i: float(risk_score[i]) for i in I}
    pred_dict = {(i, t): float(predicted_points[i][t]) for i in I for t in T}
    discount_dict = {t: float(discount_t[t]) for t in T}
    wc_future_bonus_dict = {t: float(wc_future_bonus_t[t]) for t in T}

    m.cost = pyo.Param(m.I, initialize=cost_dict)
    m.sell = pyo.Param(m.I, initialize=sell_dict)
    m.risk = pyo.Param(m.I, initialize=risk_dict)
    m.pred = pyo.Param(m.I, m.T, initialize=pred_dict)
    m.discount = pyo.Param(m.T, initialize=discount_dict)
    m.wc_future_bonus = pyo.Param(m.T, initialize=wc_future_bonus_dict)

    # ---------------- Main real-squad vars ----------------
    m.x = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.bench = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.c = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.y = pyo.Var(m.I, m.T, domain=pyo.Binary)

    m.hit = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, HIT_MAX))
    m.transfer_in = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.transfer_out = pyo.Var(m.I, m.T, domain=pyo.Binary)

    m.saved_transfers = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, 5))
    m.transfers_used = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, 15))
    m.money_in_bank = pyo.Var(m.T, domain=pyo.NonNegativeReals)

    # ---------------- Chip decision variables ----------------
    m.wc_used = pyo.Var(m.T, domain=pyo.Binary)
    m.fh_used = pyo.Var(m.T, domain=pyo.Binary)
    m.bb_used = pyo.Var(m.T, domain=pyo.Binary)
    m.tc_used = pyo.Var(m.T, domain=pyo.Binary)

    # Bench boost AND bench linearization
    m.bb_bench = pyo.Var(m.I, m.T, domain=pyo.Binary)

    # Triple captain AND captain linearization
    m.tc_c = pyo.Var(m.I, m.T, domain=pyo.Binary)

    # Free hit temporary squad vars for each GW
    m.fh_x = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_bench = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_y = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_c = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_in = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_out = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.fh_bank = pyo.Var(m.T, domain=pyo.NonNegativeReals)

    # ---------------- Initial squad ----------------
    m.init_con = pyo.ConstraintList()
    for i in I:
        m.init_con.add(m.x[i, 0] == (1 if i in initial_squad else 0))
        m.init_con.add(m.transfer_in[i, 0] == 0)
        m.init_con.add(m.transfer_out[i, 0] == 0)

    # Cannot use chips in GW 0
    m.init_con.add(m.wc_used[0] == 0)
    m.init_con.add(m.fh_used[0] == 0)
    m.init_con.add(m.bb_used[0] == 0)
    m.init_con.add(m.tc_used[0] == 0)

    # Optional chip availability
    if not allow_wildcard:
        for t in T:
            m.init_con.add(m.wc_used[t] == 0)
    if not allow_free_hit:
        for t in T:
            m.init_con.add(m.fh_used[t] == 0)
    if not allow_bench_boost:
        for t in T:
            m.init_con.add(m.bb_used[t] == 0)
    if not allow_triple_captain:
        for t in T:
            m.init_con.add(m.tc_used[t] == 0)

    # ---------------- Chip logic ----------------
    m.chip_con = pyo.ConstraintList()

    # At most one chip per week
    for t in T:
        m.chip_con.add(
            m.wc_used[t] + m.fh_used[t] + m.bb_used[t] + m.tc_used[t] <= 1
        )

    # Each chip at most once over horizon
    m.chip_con.add(sum(m.wc_used[t] for t in m.TF) <= 1)
    m.chip_con.add(sum(m.fh_used[t] for t in m.TF) <= 1)
    m.chip_con.add(sum(m.bb_used[t] for t in m.TF) <= 1)
    m.chip_con.add(sum(m.tc_used[t] for t in m.TF) <= 1)
    
        # ---------------- Forced chip weeks ----------------
    m.force_chip_con = pyo.ConstraintList()

    if force_wc_t is not None:
        m.force_chip_con.add(m.wc_used[force_wc_t] == 1)

    if force_fh_t is not None:
        m.force_chip_con.add(m.fh_used[force_fh_t] == 1)

    if force_bb_t is not None:
        m.force_chip_con.add(m.bb_used[force_bb_t] == 1)

    if force_tc_t is not None:
        m.force_chip_con.add(m.tc_used[force_tc_t] == 1)

    # ---------------- Objective ----------------
    points_expr = 0
    risk_expr = 0

    for t in T:
        # Regular lineup points
        points_expr += sum(
            (m.y[i, t] + m.c[i, t] + 0.1 * m.bench[i, t]) * m.pred[i, t]
            for i in I
        )

        # Bench boost adds remaining 0.9 x bench points for benched players in that week
        points_expr += sum(
            0.9 * m.bb_bench[i, t] * m.pred[i, t]
            for i in I
        )

        # Triple captain adds one extra captain copy
        points_expr += sum(
            m.tc_c[i, t] * m.pred[i, t]
            for i in I
        )

        # Free hit lineup points (only active when fh_used[t] = 1)
        points_expr += sum(
            (m.fh_y[i, t] + m.fh_c[i, t] + 0.1 * m.fh_bench[i, t]) * m.pred[i, t]
            for i in I
        )

        # Risk on whichever starting 11 is active
        risk_expr += sum(m.y[i, t] * m.risk[i] for i in I)
        risk_expr += sum(m.fh_y[i, t] * m.risk[i] for i in I)

    transfer_penalty_expr = sum(
        m.discount[t] * (-1.5 * transfervalue * risk_transfer_offset) * m.transfers_used[t]
        for t in T
    )

    hit_penalty_expr = sum(-HIT_PENALTY * m.hit[t] for t in T)

    chip_cost_expr = (
        -chip_cost_wildcard * sum(m.wc_used[t] for t in T)
        -chip_cost_free_hit * sum(m.fh_used[t] for t in T)
        -chip_cost_bench_boost * sum(m.bb_used[t] for t in T)
        -chip_cost_triple_captain * sum(m.tc_used[t] for t in T)
    )

    wildcard_future_value_expr = sum(
        wildcard_future_gw_value * m.wc_future_bonus[t] * m.wc_used[t]
        for t in T
    )

    total_obj = (
        points_expr
        + transfer_penalty_expr
        + hit_penalty_expr
        + chip_cost_expr
        + wildcard_future_value_expr
    )

    if lam > 0 and sign != 0:
        total_obj += sign * lam * risk_expr

    m.obj = pyo.Objective(expr=total_obj, sense=pyo.maximize)

    # ---------------- Squad composition ----------------
    m.squad_con = pyo.ConstraintList()
    for t in T:
        m.squad_con.add(sum(m.x[i, t] for i in I) == 15)
        m.squad_con.add(sum(m.x[i, t] for i in m.DEF) == 5)
        m.squad_con.add(sum(m.x[i, t] for i in m.GK) == 2)
        m.squad_con.add(sum(m.x[i, t] for i in m.MID) == 5)
        m.squad_con.add(sum(m.x[i, t] for i in m.FWD) == 3)

    # ---------------- Free hit temporary squad ----------------
    m.fh_con = pyo.ConstraintList()

    for t in T:
        # Temporary FH squad exists only if fh_used[t] = 1
        m.fh_con.add(sum(m.fh_x[i, t] for i in I) == 15 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_x[i, t] for i in m.DEF) == 5 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_x[i, t] for i in m.GK) == 2 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_x[i, t] for i in m.MID) == 5 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_x[i, t] for i in m.FWD) == 3 * m.fh_used[t])

        for team, indices in team_to_indices.items():
            m.fh_con.add(sum(m.fh_x[i, t] for i in indices) <= 3 * m.fh_used[t])

        # Lineup for FH squad only when active
        m.fh_con.add(sum(m.fh_y[i, t] for i in I) == 11 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.GK) == 1 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.DEF) >= 3 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.DEF) <= 5 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.MID) >= 2 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.MID) <= 5 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.FWD) >= 1 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_y[i, t] for i in m.FWD) <= 3 * m.fh_used[t])

        m.fh_con.add(sum(m.fh_bench[i, t] for i in m.GK) == 1 * m.fh_used[t])
        m.fh_con.add(sum(m.fh_bench[i, t] for i in m.OUT) == 3 * m.fh_used[t])

        m.fh_con.add(sum(m.fh_c[i, t] for i in I) == 1 * m.fh_used[t])

        for i in I:
            m.fh_con.add(m.fh_x[i, t] <= m.fh_used[t])
            m.fh_con.add(m.fh_y[i, t] <= m.fh_used[t])
            m.fh_con.add(m.fh_bench[i, t] <= m.fh_used[t])
            m.fh_con.add(m.fh_c[i, t] <= m.fh_used[t])
            m.fh_con.add(m.fh_in[i, t] <= m.fh_used[t])
            m.fh_con.add(m.fh_out[i, t] <= m.fh_used[t])

            m.fh_con.add(m.fh_bench[i, t] <= m.fh_x[i, t])
            m.fh_con.add(m.fh_y[i, t] <= m.fh_x[i, t])
            m.fh_con.add(m.fh_y[i, t] <= 1 - m.fh_bench[i, t])
            m.fh_con.add(m.fh_y[i, t] >= m.fh_x[i, t] - m.fh_bench[i, t] - (1 - m.fh_used[t]))
            m.fh_con.add(m.fh_c[i, t] <= m.fh_y[i, t])

        if t == 0:
            m.fh_con.add(m.fh_bank[t] == 0)
            for i in I:
                m.fh_con.add(m.fh_x[i, t] == 0)
                m.fh_con.add(m.fh_in[i, t] == 0)
                m.fh_con.add(m.fh_out[i, t] == 0)
        else:
            BIG_M_BANK = budget_amount + max(costs) * 15

            for i in I:
                m.fh_con.add(m.fh_out[i, t] <= m.x[i, t - 1])
                m.fh_con.add(m.fh_in[i, t] <= 1 - m.x[i, t - 1])

                rhs_fh = m.x[i, t - 1] - m.fh_out[i, t] + m.fh_in[i, t]

                # Only enforce equality when fh_used[t] = 1
                m.fh_con.add(m.fh_x[i, t] - rhs_fh <= 1 - m.fh_used[t])
                m.fh_con.add(rhs_fh - m.fh_x[i, t] <= 1 - m.fh_used[t])

            fh_bank_rhs = (
                m.money_in_bank[t - 1]
                + sum(m.fh_out[i, t] * m.sell[i] for i in I)
                - sum(m.fh_in[i, t] * m.cost[i] for i in I)
            )

            # Only enforce bank equality when fh_used[t] = 1
            m.fh_con.add(m.fh_bank[t] - fh_bank_rhs <= BIG_M_BANK * (1 - m.fh_used[t]))
            m.fh_con.add(fh_bank_rhs - m.fh_bank[t] <= BIG_M_BANK * (1 - m.fh_used[t]))

            # Force zero when not active
            m.fh_con.add(m.fh_bank[t] <= BIG_M_BANK * m.fh_used[t])

    # ---------------- Starting XI / bench / captain for regular squad ----------------
        # ---------------- Starting XI / bench / captain for regular squad ----------------
        m.lineup_con = pyo.ConstraintList()
        BIG_M_LINEUP = 15

        for t in T:
            # Regular lineup exists only when FH is NOT used
            m.lineup_con.add(sum(m.y[i, t] for i in I) == 11 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.GK) == 1 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.DEF) >= 3 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.DEF) <= 5 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.MID) >= 2 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.MID) <= 5 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.FWD) >= 1 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.y[i, t] for i in m.FWD) <= 3 * (1 - m.fh_used[t]))

            m.lineup_con.add(sum(m.bench[i, t] for i in m.GK) == 1 * (1 - m.fh_used[t]))
            m.lineup_con.add(sum(m.bench[i, t] for i in m.OUT) == 3 * (1 - m.fh_used[t]))

            m.lineup_con.add(sum(m.c[i, t] for i in I) == 1 * (1 - m.fh_used[t]))

            for i in I:
                # Regular vars are only allowed when FH is off
                m.lineup_con.add(m.y[i, t] <= 1 - m.fh_used[t])
                m.lineup_con.add(m.bench[i, t] <= 1 - m.fh_used[t])
                m.lineup_con.add(m.c[i, t] <= 1 - m.fh_used[t])

                # Standard squad logic
                m.lineup_con.add(m.bench[i, t] <= m.x[i, t])
                m.lineup_con.add(m.y[i, t] <= m.x[i, t])
                m.lineup_con.add(m.y[i, t] <= 1 - m.bench[i, t])

                # Only binding when FH is off
                m.lineup_con.add(
                    m.y[i, t] >= m.x[i, t] - m.bench[i, t] - BIG_M_LINEUP * m.fh_used[t]
                )

                m.lineup_con.add(m.c[i, t] <= m.y[i, t])

                # bb_bench = bench AND bb_used
                m.lineup_con.add(m.bb_bench[i, t] <= m.bench[i, t])
                m.lineup_con.add(m.bb_bench[i, t] <= m.bb_used[t])
                m.lineup_con.add(m.bb_bench[i, t] >= m.bench[i, t] + m.bb_used[t] - 1)

                # tc_c = captain AND tc_used
                m.lineup_con.add(m.tc_c[i, t] <= m.c[i, t])
                m.lineup_con.add(m.tc_c[i, t] <= m.tc_used[t])
                m.lineup_con.add(m.tc_c[i, t] >= m.c[i, t] + m.tc_used[t] - 1)

    # ---------------- Budget constraints ----------------
    m.bank_con = pyo.ConstraintList()

    for t in T[1:]:
        # Bank evolves only through real transfers, not FH temporary transfers
        m.bank_con.add(
            m.money_in_bank[t]
            == m.money_in_bank[t - 1]
            + sum(m.transfer_out[i, t] * m.sell[i] for i in I)
            - sum(m.transfer_in[i, t] * m.cost[i] for i in I)
        )

    for t in T:
        m.bank_con.add(
            sum(m.x[i, t] * m.sell[i] for i in I) + m.money_in_bank[t] <= budget_amount
        )

    # ---------------- Team cap ----------------
    initial_team_count = {team: 0 for team in teams_set}
    for i in initial_squad:
        initial_team_count[teams[i]] += 1

    m.team_cap_con = pyo.ConstraintList()
    for team, indices in team_to_indices.items():
        m.team_cap_con.add(sum(m.x[i, 0] for i in indices) <= max(3, initial_team_count[team]))
        for t in T[1:]:
            m.team_cap_con.add(sum(m.x[i, t] for i in indices) <= 3)

    # ---------------- Transfer dynamics ----------------
    m.transfer_con = pyo.ConstraintList()

    m.transfer_con.add(m.transfers_used[0] == 0)
    m.transfer_con.add(m.hit[0] == 0)

    for t in T[1:]:
        for i in I:
            # Exact real squad evolution through real transfers
            m.transfer_con.add(
                m.x[i, t] - m.x[i, t - 1] == m.transfer_in[i, t] - m.transfer_out[i, t]
            )
            m.transfer_con.add(m.transfer_in[i, t] + m.transfer_out[i, t] <= 1)

            # In FH week, real squad must not change
            m.transfer_con.add(m.transfer_in[i, t] <= 1 - m.fh_used[t])
            m.transfer_con.add(m.transfer_out[i, t] <= 1 - m.fh_used[t])

        total_in = sum(m.transfer_in[i, t] for i in I)

        m.transfer_con.add(m.transfers_used[t] <= total_in)
        m.transfer_con.add(m.transfers_used[t] >= total_in - BIG_M_TRANSFERS * m.wc_used[t])
        m.transfer_con.add(m.transfers_used[t] <= BIG_M_TRANSFERS * (1 - m.wc_used[t]))
        m.transfer_con.add(m.transfers_used[t] <= BIG_M_TRANSFERS * (1 - m.fh_used[t]))

        # Hits cannot be used in WC or FH week
        m.transfer_con.add(m.hit[t] <= HIT_MAX * (1 - m.wc_used[t]))
        m.transfer_con.add(m.hit[t] <= HIT_MAX * (1 - m.fh_used[t]))

        m.transfer_con.add(
            total_in <= 1 + m.saved_transfers[t - 1] + m.hit[t] + BIG_M_TRANSFERS * m.wc_used[t]
        )

    # ---------------- Saved transfers ----------------
    m.saved_con = pyo.ConstraintList()

    for t in T[1:]:
        if wildcard_preserves_saved_transfers:
            m.saved_con.add(
                m.saved_transfers[t]
                >= m.saved_transfers[t - 1] - BIG_M_TRANSFERS * (1 - m.wc_used[t])
            )
            m.saved_con.add(
                m.saved_transfers[t]
                <= m.saved_transfers[t - 1] + BIG_M_TRANSFERS * (1 - m.wc_used[t])
            )
        else:
            m.saved_con.add(
                m.saved_transfers[t]
                >= 1 - BIG_M_TRANSFERS * (1 - m.wc_used[t])
            )
            m.saved_con.add(
                m.saved_transfers[t]
                <= 1 + BIG_M_TRANSFERS * (1 - m.wc_used[t])
            )

        # Free hit preserves saved transfers
        m.saved_con.add(
            m.saved_transfers[t]
            >= m.saved_transfers[t - 1] - BIG_M_TRANSFERS * (1 - m.fh_used[t])
        )
        m.saved_con.add(
            m.saved_transfers[t]
            <= m.saved_transfers[t - 1] + BIG_M_TRANSFERS * (1 - m.fh_used[t])
        )

        # Normal update when no WC and no FH
        normal_saved_rhs = m.saved_transfers[t - 1] + 1 - m.transfers_used[t] + m.hit[t]

        m.saved_con.add(
            m.saved_transfers[t]
            >= normal_saved_rhs - BIG_M_TRANSFERS * (m.wc_used[t] + m.fh_used[t])
        )
        m.saved_con.add(
            m.saved_transfers[t]
            <= normal_saved_rhs + BIG_M_TRANSFERS * (m.wc_used[t] + m.fh_used[t])
        )

        m.saved_con.add(m.saved_transfers[t] <= 5)

    m.init_state_con = pyo.ConstraintList()
    m.init_state_con.add(m.saved_transfers[0] == initial_saved)
    m.init_state_con.add(m.money_in_bank[0] == money_in_bank_init)

    # ---------------- Warm start ----------------
    if use_warmstart and previous_solution is not None:
        for (i, t), val in previous_solution.get("x", {}).items():
            if i in I and t in T:
                m.x[i, t].value = val
        for (i, t), val in previous_solution.get("y", {}).items():
            if i in I and t in T:
                m.y[i, t].value = val
        for (i, t), val in previous_solution.get("bench", {}).items():
            if i in I and t in T:
                m.bench[i, t].value = val
        for (i, t), val in previous_solution.get("c", {}).items():
            if i in I and t in T:
                m.c[i, t].value = val

    # ============================================================
    # Solve with HiGHS
    # ============================================================
    solver = pyo.SolverFactory("highs")

    if time_limit is not None:
        solver.options["time_limit"] = time_limit
    solver.options["mip_rel_gap"] = mip_gap

    results = solver.solve(m, tee=True)

    term = str(results.solver.termination_condition).lower()
    print(results.solver.status)
    print(results.solver.termination_condition)

    if term not in {"optimal", "feasible"}:
        empty_df = pd.DataFrame()
        meta = {
            "team_id": team_id,
            "objective_points_only": -1e18,
            "objective_full": -1e18,
            "free_hit_gws": [],
            "wildcard_gws": [],
            "bench_boost_gws": [],
            "triple_captain_gws": [],
            "gw_list": GW_list,
            "termination_condition": term,
        }
        if return_meta:
            return empty_df, meta
        return empty_df

    # ============================================================
    # Extract solution
    # ============================================================
    records = []

    def compute_points_only_objective():
        total = 0.0
        for t in T:
            is_fh = safe_value(m.fh_used[t]) > 0.5
            is_bb = safe_value(m.bb_used[t]) > 0.5
            is_tc = safe_value(m.tc_used[t]) > 0.5

            for i in I:
                if is_fh:
                    total += safe_value(m.fh_y[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.fh_c[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.fh_bench[i, t]) * 0.1 * float(predicted_points[i][t])
                else:
                    total += safe_value(m.y[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.c[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.bench[i, t]) * 0.1 * float(predicted_points[i][t])
                    if is_bb:
                        total += safe_value(m.bench[i, t]) * 0.9 * float(predicted_points[i][t])
                    if is_tc:
                        total += safe_value(m.tc_c[i, t]) * float(predicted_points[i][t])

        total -= n_hits * 4 * 0.8
        total -= chip_cost_wildcard * sum(safe_value(m.wc_used[t]) for t in T)
        total -= chip_cost_free_hit * sum(safe_value(m.fh_used[t]) for t in T)
        total -= chip_cost_bench_boost * sum(safe_value(m.bb_used[t]) for t in T)
        total -= chip_cost_triple_captain * sum(safe_value(m.tc_used[t]) for t in T)
        total += wildcard_future_gw_value * sum(
            safe_value(m.wc_used[t]) * float(wc_future_bonus_t[t]) for t in T
        )
        return total

    chosen_wc_gws = [int(GW_list[t]) for t in future_t if safe_value(m.wc_used[t]) > 0.5]
    chosen_fh_gws = [int(GW_list[t]) for t in future_t if safe_value(m.fh_used[t]) > 0.5]
    chosen_bb_gws = [int(GW_list[t]) for t in future_t if safe_value(m.bb_used[t]) > 0.5]
    chosen_tc_gws = [int(GW_list[t]) for t in future_t if safe_value(m.tc_used[t]) > 0.5]

    print("\nChosen chips:")
    print("  Wildcard      :", chosen_wc_gws if chosen_wc_gws else "None")
    print("  Free Hit      :", chosen_fh_gws if chosen_fh_gws else "None")
    print("  Bench Boost   :", chosen_bb_gws if chosen_bb_gws else "None")
    print("  Triple Captain:", chosen_tc_gws if chosen_tc_gws else "None")

    print("\nWildcard future bonus by candidate week:")
    for t in future_t:
        print(
            f"GW {GW_list[t]} | "
            f"WC_bonus_out_of_horizon={wc_future_bonus_t[t]:.1f} | "
            f"WC_used={safe_value(m.wc_used[t]):.0f}"
        )

    # FH diagnostics
    print("\nFH candidate diagnostics:")
    for t in future_t:
        fh_points = sum(safe_value(m.fh_y[i, t]) * predicted_points[i][t] for i in I)
        fh_cap = sum(safe_value(m.fh_c[i, t]) * predicted_points[i][t] for i in I)
        reg_points = sum(safe_value(m.y[i, t]) * predicted_points[i][t] for i in I)
        reg_cap = sum(safe_value(m.c[i, t]) * predicted_points[i][t] for i in I)
        print(
            f"GW {GW_list[t]} | "
            f"FH_used={safe_value(m.fh_used[t]):.0f} | "
            f"RegXI+Cap={reg_points + reg_cap:.2f} | "
            f"FHXI+Cap={fh_points + fh_cap:.2f} | "
            f"FH_cost={chip_cost_free_hit:.2f}"
        )

    # Debug squad per GW
    for t in range(1, optimize_range):
        gw_abs = GW_list[t]
        chip_label = []
        if safe_value(m.wc_used[t]) > 0.5:
            chip_label.append("WILDCARD")
        if safe_value(m.fh_used[t]) > 0.5:
            chip_label.append("FREE_HIT")
        if safe_value(m.bb_used[t]) > 0.5:
            chip_label.append("BENCH_BOOST")
        if safe_value(m.tc_used[t]) > 0.5:
            chip_label.append("TRIPLE_CAPTAIN")
        chip_str = ", ".join(chip_label) if chip_label else "NO CHIP"

        print(f"\nGameweek {gw_abs} Squad [{chip_str}]:")

        if safe_value(m.fh_used[t]) > 0.5:
            for i in I:
                if safe_value(m.fh_x[i, t]) > 0.5:
                    status = "Bench" if safe_value(m.fh_bench[i, t]) > 0.5 else "Playing"
                    cap = " (C)" if safe_value(m.fh_c[i, t]) > 0.5 else ""
                    print(f"- {players[i]} ({positions[i]}) - {status}{cap} [FREE HIT]")
        else:
            for i in I:
                if safe_value(m.x[i, t]) > 0.5:
                    status = "Bench" if safe_value(m.bench[i, t]) > 0.5 else "Playing"
                    cap = " (C)" if safe_value(m.c[i, t]) > 0.5 else ""
                    tc = " (TC)" if safe_value(m.tc_c[i, t]) > 0.5 else ""
                    print(f"- {players[i]} ({positions[i]}) - {status}{cap}{tc}")

    # Chip usage records
    for t in future_t:
        gw = GW_list[t]
        if safe_value(m.wc_used[t]) > 0.5:
            records.append({
                "Name": "WILDCARD",
                "status": "chip_used",
                "GW": gw,
                "position": "chip",
                "photo": "chip",
                "Is_captain": False,
                "web_name": "wildcard",
            })
        if safe_value(m.fh_used[t]) > 0.5:
            records.append({
                "Name": "FREE_HIT",
                "status": "chip_used",
                "GW": gw,
                "position": "chip",
                "photo": "chip",
                "Is_captain": False,
                "web_name": "free_hit",
            })
        if safe_value(m.bb_used[t]) > 0.5:
            records.append({
                "Name": "BENCH_BOOST",
                "status": "chip_used",
                "GW": gw,
                "position": "chip",
                "photo": "chip",
                "Is_captain": False,
                "web_name": "bench_boost",
            })
        if safe_value(m.tc_used[t]) > 0.5:
            records.append({
                "Name": "TRIPLE_CAPTAIN",
                "status": "chip_used",
                "GW": gw,
                "position": "chip",
                "photo": "chip",
                "Is_captain": False,
                "web_name": "triple_captain",
            })

    # Transfers in / out
    for t in range(1, optimize_range):
        for i in I:
            name = players[i]
            row = current_players[current_players["name"] == name]
            if row.empty:
                continue

            player_row_code = row["code"].values[0]
            web_name = row["web_name"].values[0]
            pos = positions[i]
            gw = GW_list[t]

            if safe_value(m.transfer_in[i, t]) > 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_in",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": False,
                    "web_name": web_name,
                })

            if safe_value(m.transfer_out[i, t]) > 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_out",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": False,
                    "web_name": web_name,
                })

    # Playing / benched / captain
    for t in range(1, optimize_range):
        gw = GW_list[t]
        if safe_value(m.fh_used[t]) > 0.5:
            for i in I:
                if safe_value(m.fh_x[i, t]) > 0.5:
                    name = players[i]
                    row = current_players[current_players["name"] == name]
                    if row.empty:
                        continue
                    player_row_code = row["code"].values[0]
                    web_name = row["web_name"].values[0]
                    pos = positions[i]
                    status = "benched" if safe_value(m.fh_bench[i, t]) > 0.5 else "playing"
                    is_capt = bool(safe_value(m.fh_c[i, t]) > 0.5)
                    records.append({
                        "Name": name,
                        "status": status,
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                        "Is_captain": is_capt,
                        "web_name": web_name,
                    })
        else:
            for i in I:
                if safe_value(m.x[i, t]) > 0.5:
                    name = players[i]
                    row = current_players[current_players["name"] == name]
                    if row.empty:
                        continue
                    player_row_code = row["code"].values[0]
                    web_name = row["web_name"].values[0]
                    pos = positions[i]
                    status = "benched" if safe_value(m.bench[i, t]) > 0.5 else "playing"
                    is_capt = bool(safe_value(m.c[i, t]) > 0.5)
                    records.append({
                        "Name": name,
                        "status": status,
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                        "Is_captain": is_capt,
                        "web_name": web_name,
                    })

    obj_points_only = compute_points_only_objective()
    full_obj_val = safe_obj_value(m.obj)

    records.append({
        "Name": "Obj Value",
        "status": obj_points_only,
        "GW": 100,
        "position": "obj",
        "photo": "obj",
        "Is_captain": 0,
        "web_name": "obj",
    })

    for t in range(1, optimize_range):
        print(
            f"GW {GW_list[t]} | "
            f"HIT={safe_value(m.hit[t]):.0f} | "
            f"TransfersUsed={safe_value(m.transfers_used[t]):.0f} | "
            f"Saved={safe_value(m.saved_transfers[t]):.0f} | "
            f"Bank={safe_value(m.money_in_bank[t]):.2f} | "
            f"WC={safe_value(m.wc_used[t]):.0f} | "
            f"FH={safe_value(m.fh_used[t]):.0f} | "
            f"BB={safe_value(m.bb_used[t]):.0f} | "
            f"TC={safe_value(m.tc_used[t]):.0f}"
        )

    result_df = pd.DataFrame(records)

    meta = {
        "team_id": team_id,
        "objective_points_only": float(obj_points_only),
        "objective_full": float(full_obj_val),
        "free_hit_gws": chosen_fh_gws,
        "wildcard_gws": chosen_wc_gws,
        "bench_boost_gws": chosen_bb_gws,
        "triple_captain_gws": chosen_tc_gws,
        "gw_list": GW_list,
        "termination_condition": term,
        "wildcard_future_bonus_by_t": {int(GW_list[t]): float(wc_future_bonus_t[t]) for t in future_t},
    }

    if return_meta:
        return result_df, meta
    return result_df


# ============================================================
# Optional batch run across teams
# ============================================================

if __name__ == "__main__":
    all_results = []
    failed_team_ids = []
    all_meta = []

    transferred_in_counts = defaultdict(lambda: defaultdict(int))

    CHIP_COST_WILDCARD = 18.0
    CHIP_COST_FREE_HIT = 8.0
    CHIP_COST_BENCH_BOOST = 10.0
    CHIP_COST_TRIPLE_CAPTAIN = 8.0
    WILDCARD_FUTURE_GW_VALUE = 1.0

    for team_id in range(7025308, 7025309):
        print(f"\n{'=' * 80}")
        print(f"Running optimization for team_id={team_id}")
        print(f"{'=' * 80}")

        try:
            result_df, meta = optimize_my_team(
                team_id=team_id,
                return_meta=True,
                chip_cost_wildcard=CHIP_COST_WILDCARD,
                chip_cost_free_hit=CHIP_COST_FREE_HIT,
                chip_cost_bench_boost=CHIP_COST_BENCH_BOOST,
                chip_cost_triple_captain=CHIP_COST_TRIPLE_CAPTAIN,
                wildcard_future_gw_value=WILDCARD_FUTURE_GW_VALUE,
                time_limit=52000,
                mip_gap=0.01,
                horizon_weeks=7,
                force_wildcard_gw= None,
                force_free_hit_gw= None,
                force_bench_boost_gw= None,
                force_triple_captain_gw = None,
                allow_triple_captain=False
            )

            if result_df is not None and not result_df.empty:
                all_meta.append(meta)

                temp = result_df.copy()

                count_transferred_in_by_gw(temp, transferred_in_counts)

                temp = temp[temp["status"].isin(["transferred_in", "transferred_out", "chip_used"])]

                for gw in temp["GW"].unique():
                    gw_df = temp[temp["GW"] == gw].copy()

                    chip_rows = gw_df[gw_df["status"] == "chip_used"]
                    for _, chip_row in chip_rows.iterrows():
                        all_results.append({
                            "team_id": team_id,
                            "GW": gw,
                            "position": "chip",
                            "transfer_out_Player": None,
                            "transfer_out_web_name": None,
                            "transfer_in_Player": chip_row["Name"],
                            "transfer_in_web_name": chip_row["web_name"],
                        })

                    pos_gw_df = gw_df[gw_df["status"].isin(["transferred_in", "transferred_out"])]
                    positions_in_gw = sorted(pos_gw_df["position"].dropna().unique())

                    for pos in positions_in_gw:
                        pos_df = pos_gw_df[pos_gw_df["position"] == pos]

                        ins = pos_df[pos_df["status"] == "transferred_in"].reset_index(drop=True)
                        outs = pos_df[pos_df["status"] == "transferred_out"].reset_index(drop=True)

                        n = max(len(ins), len(outs))

                        for i in range(n):
                            in_row = ins.iloc[i] if i < len(ins) else None
                            out_row = outs.iloc[i] if i < len(outs) else None

                            all_results.append({
                                "team_id": team_id,
                                "GW": gw,
                                "position": pos,
                                "transfer_out_Player": None if out_row is None else out_row["Name"],
                                "transfer_out_web_name": None if out_row is None else out_row["web_name"],
                                "transfer_in_Player": None if in_row is None else in_row["Name"],
                                "transfer_in_web_name": None if in_row is None else in_row["web_name"],
                            })

            else:
                print(f"No feasible result for team_id={team_id}")
                failed_team_ids.append(team_id)

        except Exception as e:
            print(f"Failed for team_id={team_id}: {e}")
            failed_team_ids.append(team_id)

    transfer_df = pd.DataFrame(all_results)

    if not transfer_df.empty:
        transfer_df = transfer_df.sort_values(
            by=["GW", "team_id"],
            ascending=[True, True]
        )

    transfer_df.to_csv("Optimizedtransfer.csv", index=False)

    chip_summary_df = summarize_chip_weeks(all_meta)
    chip_summary_df.to_csv("ChosenChipWeeks.csv", index=False)

    meta_df = pd.DataFrame(all_meta)
    meta_df.to_csv("OptimizerMeta.csv", index=False)

    pd.DataFrame({"team_id": failed_team_ids}).to_csv("FailedTeamIDs.csv", index=False)

    transfer_in_rows = []
    for gw, player_dict in transferred_in_counts.items():
        for name, count in player_dict.items():
            transfer_in_rows.append({
                "GW": gw,
                "Name": name,
                "count_transferred_in": count,
            })
    pd.DataFrame(transfer_in_rows).to_csv("TransferredInCounts.csv", index=False)

    print("\nSaved: Optimizedtransfer.csv")
    print("Saved: ChosenChipWeeks.csv")
    print("Saved: OptimizerMeta.csv")
    print("Saved: FailedTeamIDs.csv")
    print("Saved: TransferredInCounts.csv")