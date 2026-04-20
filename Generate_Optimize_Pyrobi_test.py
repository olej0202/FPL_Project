from typing import Optional, Dict, Any, Callable
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
    min_kicks["kickoff_time"] = min_kicks["kickoff_time"].dt.tz_convert("Europe/Oslo")

    now = pd.Timestamp.now(tz="Europe/Oslo")
    future = min_kicks[min_kicks["kickoff_time"] > now].sort_values("kickoff_time").head(1)
    return int(future["event"].astype(int).values[0] - 1)


def safe_value(x):
    # Robust numeric getter for Pyomo vars/expressions.
    # Some binaries can remain uninitialized if they are not fully constrained.
    try:
        v = x.value if hasattr(x, "value") else pyo.value(x, exception=False)
    except Exception:
        v = None
    return 0.0 if v is None else float(v)


# ============================================================
# Main optimizer
# ============================================================
def prefilter_players_by_horizon_points(
    data: pd.DataFrame,
    team_df: pd.DataFrame,
    gw_list: list[str],
    min_points_per_gw: float = 1.0,
    forced_keep_names: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Keep all players in the initial squad.
    For all other players, keep only those with:
        sum(predicted points over horizon) >= len(horizon) * min_points_per_gw

    Notes:
    - Uses gw_list[1:] as the real future horizon, so GW '0' is excluded.
    - Assumes data has column 'name' and GW columns in gw_list.
    - Assumes team_df has column 'name'.
    """
    df = data.copy()
    df["name"] = df["name"].astype(str)

    team_names = set(team_df["name"].astype(str).tolist())
    forced_keep_names = forced_keep_names or []
    forced_keep_norm = {
        str(name).strip().lower()
        for name in forced_keep_names
        if str(name).strip()
    }
    name_norm = df["name"].astype(str).str.strip().str.lower()

    # Exclude GW "0" from horizon filtering
    horizon_cols = [gw for gw in gw_list if gw != "0"]

    if len(horizon_cols) == 0:
        return df

    # Make sure horizon cols are numeric
    for col in horizon_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    horizon_threshold = len(horizon_cols) * float(min_points_per_gw)
    horizon_sum = df[horizon_cols].sum(axis=1)

    keep_mask = (
        df["name"].isin(team_names)
        | name_norm.isin(forced_keep_norm)
        | (horizon_sum >= horizon_threshold)
    )

    filtered = df.loc[keep_mask].copy()

    print(
        f"Prefilter: kept {len(filtered)} of {len(df)} players "
        f"(threshold={horizon_threshold:.2f} over {len(horizon_cols)} GWs)"
    )

    removed = df.loc[~keep_mask, ["name"] + horizon_cols].copy()
    if not removed.empty:
        removed["horizon_sum"] = removed[horizon_cols].sum(axis=1)
        print(f"Prefilter removed {len(removed)} players")
    print(filtered)
    print(filtered.columns)

    return filtered

def optimize_my_team(
    team_id: int = 46805,
    wildcard_round: int = 40,
    bb_round: int = 40,
    free_hit_round: int = 40,
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
    n_solutions: int = 1,
    multi_solution_warmstart: bool = True,
    solution_decay: float = 0.92,
    min_solution_distance: int = 12,
    force_in_list: Optional[list[str]] = None,
    on_solution: Optional[Callable[[int, list[dict[str, Any]]], None]] = None,
) -> pd.DataFrame:

    if banned_list is None:
        banned_list = []
    if force_in_list is None:
        force_in_list = []
    if GW_list is None:
        GW_list = ["0", "8", "9", "10", "11", "12", "13", "14"]

    force_in_list = [str(name).strip() for name in force_in_list if str(name).strip()]
    banned_norm = {str(name).strip().lower() for name in banned_list if str(name).strip()}
    conflicting_force_ban = sorted(
        {name for name in force_in_list if name.lower() in banned_norm}
    )
    if conflicting_force_ban:
        raise ValueError(
            "Players cannot be both banned and forced in: "
            + ", ".join(conflicting_force_ban)
        )

    current_fixture_path = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv"
    Last_GW = get_last_completed_gw(current_fixture_path)

    start = max(Last_GW + 1, 1)
    cutoff = min(start + 5, 38)   # ensure we never go past GW38

    GW_list = ["0"] + [str(i) for i in range(start, cutoff + 1)]
    GW_list = [str(gw) for gw in GW_list]
    print("GW_list:", GW_list)

    current_players = pd.read_csv(current_player_path)

    is_first = "1" in GW_list
    team_id = int(team_id)

    def gw_index(gw_abs: Optional[int]) -> Optional[int]:
        if gw_abs is None:
            return None
        gw_str = str(int(gw_abs))
        return GW_list.index(gw_str) if gw_str in GW_list else None

    wildcard_round_rel = gw_index(wildcard_round)
    bench_points_gw = gw_index(bb_round)
    freehit_round_rel = gw_index(free_hit_round)

    optimize_range = len(GW_list)
    gameweeks = list(range(optimize_range))

    use_freehit = (freehit_round_rel is not None) and (freehit_round_rel >= 1)

    if wildcard_round_rel is not None and wildcard_round_rel < 1:
        wildcard_round_rel = 40
    if bench_points_gw is not None and bench_points_gw < 1:
        bench_points_gw = 40
    if is_first:
        wildcard_round_rel = 1

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
        forced_keep_names=force_in_list,
    )
    
    # Verify all team_df names are still present after filtering
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

    name_to_player_idx: dict[str, int] = {}
    for idx, player_name in enumerate(players):
        key = player_name.strip().lower()
        if key and key not in name_to_player_idx:
            name_to_player_idx[key] = idx

    forced_transfer_indices: list[int] = []
    missing_forced_players: list[str] = []
    seen_forced = set()
    for forced_name in force_in_list:
        key = forced_name.strip().lower()
        if not key or key in seen_forced:
            continue
        seen_forced.add(key)
        idx = name_to_player_idx.get(key)
        if idx is None:
            missing_forced_players.append(forced_name)
            continue
        forced_transfer_indices.append(idx)

    if missing_forced_players:
        raise ValueError(
            "Forced transfer-in player(s) not found in optimization set: "
            + ", ".join(missing_forced_players)
        )

    initial_squad = []
    for t in range(len(team_df)):
        name = str(team_df["name"].values[t])
        if name in players:
            initial_squad.append(players.index(name))

    list1 = costs.copy()

    if is_first:
        budget_amount = 100.0
    else:
        selling_cost = team_df["selling_price_m"].values.astype(float)
        budget_amount = float(np.sum(selling_cost) + money_in_bank_init + 0.01)
        for i, idx in enumerate(initial_squad):
            list1[idx] = float(selling_cost[i])

    initial_saved = initial_saved + n_hits

    positions = data["position"].tolist()
    teams = data["team_code"].tolist()
    selected = pd.to_numeric(data["selected"], errors="coerce").fillna(0.0).to_numpy()
    predicted_points = data[GW_list].to_numpy(dtype=float).copy()

    # ---------------- Risk adjustment ----------------
    risk_float = float(risk_factor) if risk_factor is not None else 0.0

    sel = np.clip(selected.astype(float), 0, 1)
    ownership_risk = 1 - sel

    points_std = pd.to_numeric(data["Point_STD"], errors="coerce")
    points_std = points_std.fillna(points_std.median()).to_numpy(dtype=float)

    points_risk = pd.to_numeric(data["Risk_share_avg"], errors="coerce")
    points_risk = points_risk.fillna(points_risk.median()).to_numpy(dtype=float)

    # fixed bug: clip points_risk, not points_std again
    points_risk = np.clip(points_risk, 0, 0.8)
    points_std = np.clip(points_std, 0, 3.5)

    std_min = float(np.nanpercentile(points_std, 5))
    std_max = float(np.nanpercentile(points_std, 95))
    points_std_scaled = (points_std - std_min) / (std_max - std_min + 1e-9)
    points_std_scaled = np.clip(points_std_scaled, 0, 1)

    w_own, w_std = 0.7, 0.3
    risk_score = w_own * ownership_risk + w_std * (points_std_scaled * 0.3 + 0.7 * points_risk)

    transfervalue = transval * 2
    risk_transfer_offset = 1.0

    HIT_PENALTY = 2.5
    HIT_MAX = 1

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
    m.BS = pyo.Set(initialize=[0, 1, 2, 3])  # bench slots: 0=GK2, 1/2/3=outfield bench order
    m.DEF = pyo.Set(initialize=def_indices)
    m.GK = pyo.Set(initialize=gk_indices)
    m.MID = pyo.Set(initialize=mid_indices)
    m.FWD = pyo.Set(initialize=fwd_indices)
    m.OUT = pyo.Set(initialize=outfield_indices)

    bench_slot_weights = {0: 0.04, 1: 0.10, 2: 0.05, 3: 0.02}
    bench_slot_bb_extra = {s: 1.0 - w for s, w in bench_slot_weights.items()}

    cost_dict = {i: float(costs[i]) for i in I}
    sell_dict = {i: float(list1[i]) for i in I}
    risk_dict = {i: float(risk_score[i]) for i in I}
    pred_dict = {(i, t): float(predicted_points[i][t]) for i in I for t in T}
    discount_dict = {t: float(discount_t[t]) for t in T}

    m.cost = pyo.Param(m.I, initialize=cost_dict)
    m.sell = pyo.Param(m.I, initialize=sell_dict)
    m.risk = pyo.Param(m.I, initialize=risk_dict)
    m.pred = pyo.Param(m.I, m.T, initialize=pred_dict)
    m.discount = pyo.Param(m.T, initialize=discount_dict)

    # Real squad vars
    m.x = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.bench = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.bench_slot = pyo.Var(m.I, m.T, m.BS, domain=pyo.Binary)
    m.c = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.y = pyo.Var(m.I, m.T, domain=pyo.Binary)

    m.hit = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, HIT_MAX))
    m.transfer_in = pyo.Var(m.I, m.T, domain=pyo.Binary)
    m.transfer_out = pyo.Var(m.I, m.T, domain=pyo.Binary)

    m.saved_transfers = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, 5))
    m.transfers_used = pyo.Var(m.T, domain=pyo.NonNegativeIntegers, bounds=(0, 5))
    m.money_in_bank = pyo.Var(m.T, domain=pyo.NonNegativeReals)

    fh_t = freehit_round_rel if use_freehit else None
    if use_freehit:
        m.fh_x = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_bench = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_bench_slot = pyo.Var(m.I, m.BS, domain=pyo.Binary)
        m.fh_y = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_c = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_in = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_out = pyo.Var(m.I, domain=pyo.Binary)
        m.fh_bank = pyo.Var(domain=pyo.NonNegativeReals)

    # ---------------- Initial squad ----------------
    m.init_con = pyo.ConstraintList()
    for i in I:
        m.init_con.add(m.x[i, 0] == (1 if i in initial_squad else 0))

    # ---------------- Objective ----------------
    points_expr = 0
    risk_expr = 0

    for t in T:
        if use_freehit and t == fh_t:
            points_expr += sum(
                (m.fh_y[i] + m.fh_c[i]) * m.pred[i, t]
                for i in I
            )
            points_expr += sum(
                bench_slot_weights[s] * m.fh_bench_slot[i, s] * m.pred[i, t]
                for i in I for s in m.BS
            )
            risk_expr += sum(m.fh_x[i] * m.risk[i] for i in I)
        else:
            points_expr += sum(
                (m.y[i, t] + m.c[i, t]) * m.pred[i, t]
                for i in I
            )
            points_expr += sum(
                bench_slot_weights[s] * m.bench_slot[i, t, s] * m.pred[i, t]
                for i in I for s in m.BS
            )
            risk_expr += sum(m.y[i, t] * m.risk[i] for i in I)

    transfer_penalty_expr = sum(
        m.discount[t] * (-1.5 * transfervalue * risk_transfer_offset) * m.transfers_used[t]
        for t in T
    )

    hit_penalty_expr = sum(-HIT_PENALTY * m.hit[t] for t in T)

    bench_boost_expr = 0
    if bench_points_gw in T:
        if use_freehit and bench_points_gw == fh_t:
            bench_boost_expr += sum(
                bench_slot_bb_extra[s] * m.fh_bench_slot[i, s] * m.pred[i, bench_points_gw]
                for i in I for s in m.BS
            )
        else:
            bench_boost_expr += sum(
                bench_slot_bb_extra[s] * m.bench_slot[i, bench_points_gw, s] * m.pred[i, bench_points_gw]
                for i in I for s in m.BS
            )

    base_obj_expr = points_expr + transfer_penalty_expr + hit_penalty_expr + bench_boost_expr

    # Two-stage setup:
    # 1) maximize base objective (no risk term)
    # 2) if risk_factor != 0, constrain base objective to stay close to stage-1
    #    and optimize risk (min if negative, max if positive).
    m.base_obj_expr = pyo.Expression(expr=base_obj_expr)
    m.risk_obj_expr = pyo.Expression(expr=risk_expr)

    m.obj_base = pyo.Objective(expr=m.base_obj_expr, sense=pyo.maximize)
    m.obj_risk = pyo.Objective(
        expr=m.risk_obj_expr,
        sense=(pyo.minimize if risk_float < 0 else pyo.maximize),
    )
    m.obj_risk.deactivate()

    m.obj_floor_rhs = pyo.Param(initialize=0.0, mutable=True)
    m.obj_floor_con = pyo.Constraint(expr=m.base_obj_expr >= m.obj_floor_rhs)
    m.obj_floor_con.deactivate()

    # ---------------- Squad composition ----------------
    m.squad_con = pyo.ConstraintList()
    for t in T:
        m.squad_con.add(sum(m.x[i, t] for i in I) == 15)
        m.squad_con.add(sum(m.x[i, t] for i in m.DEF) == 5)
        m.squad_con.add(sum(m.x[i, t] for i in m.GK) == 2)
        m.squad_con.add(sum(m.x[i, t] for i in m.MID) == 5)
        m.squad_con.add(sum(m.x[i, t] for i in m.FWD) == 3)

    # ---------------- Free hit ----------------
    if use_freehit:
        m.fh_con = pyo.ConstraintList()
        m.fh_con.add(sum(m.fh_x[i] for i in I) == 15)
        m.fh_con.add(sum(m.fh_x[i] for i in m.DEF) == 5)
        m.fh_con.add(sum(m.fh_x[i] for i in m.GK) == 2)
        m.fh_con.add(sum(m.fh_x[i] for i in m.MID) == 5)
        m.fh_con.add(sum(m.fh_x[i] for i in m.FWD) == 3)

        for team, indices in team_to_indices.items():
            m.fh_con.add(sum(m.fh_x[i] for i in indices) <= 3)

        prev_t = fh_t - 1

        for i in I:
            m.fh_con.add(m.fh_out[i] <= m.x[i, prev_t])
            m.fh_con.add(m.fh_in[i] <= 1 - m.x[i, prev_t])
            m.fh_con.add(m.fh_x[i] == m.x[i, prev_t] - m.fh_out[i] + m.fh_in[i])

        m.fh_con.add(
            m.fh_bank == (
                m.money_in_bank[prev_t]
                + sum(m.fh_out[i] * m.sell[i] for i in I)
                - sum(m.fh_in[i] * m.cost[i] for i in I)
            )
        )
        m.fh_con.add(m.fh_bank <= budget_amount)

    # ---------------- Starting XI / bench / captain ----------------
    m.lineup_con = pyo.ConstraintList()
    for t in T:
        if use_freehit and t == fh_t:
            m.lineup_con.add(sum(m.fh_y[i] for i in I) == 11)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.GK) == 1)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.DEF) >= 3)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.DEF) <= 5)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.MID) >= 2)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.MID) <= 5)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.FWD) >= 1)
            m.lineup_con.add(sum(m.fh_y[i] for i in m.FWD) <= 3)

            # Bench slots: 0 is GK2, 1/2/3 are outfield bench order.
            m.lineup_con.add(sum(m.fh_bench_slot[i, 0] for i in m.GK) == 1)
            m.lineup_con.add(sum(m.fh_bench_slot[i, 0] for i in m.OUT) == 0)
            for s in [1, 2, 3]:
                m.lineup_con.add(sum(m.fh_bench_slot[i, s] for i in m.OUT) == 1)
                m.lineup_con.add(sum(m.fh_bench_slot[i, s] for i in m.GK) == 0)

            for i in I:
                m.lineup_con.add(sum(m.fh_bench_slot[i, s] for s in m.BS) == m.fh_bench[i])
                m.lineup_con.add(m.fh_bench[i] <= m.fh_x[i])
                m.lineup_con.add(m.fh_y[i] <= m.fh_x[i])
                m.lineup_con.add(m.fh_y[i] <= 1 - m.fh_bench[i])
                m.lineup_con.add(m.fh_y[i] >= m.fh_x[i] - m.fh_bench[i])

            m.lineup_con.add(sum(m.fh_c[i] for i in I) == 1)
            for i in I:
                m.lineup_con.add(m.fh_c[i] <= m.fh_y[i])
            continue

        m.lineup_con.add(sum(m.y[i, t] for i in I) == 11)
        m.lineup_con.add(sum(m.y[i, t] for i in m.GK) == 1)
        m.lineup_con.add(sum(m.y[i, t] for i in m.DEF) >= 3)
        m.lineup_con.add(sum(m.y[i, t] for i in m.DEF) <= 5)
        m.lineup_con.add(sum(m.y[i, t] for i in m.MID) >= 2)
        m.lineup_con.add(sum(m.y[i, t] for i in m.MID) <= 5)
        m.lineup_con.add(sum(m.y[i, t] for i in m.FWD) >= 1)
        m.lineup_con.add(sum(m.y[i, t] for i in m.FWD) <= 3)

        # Bench slots: 0 is GK2, 1/2/3 are outfield bench order.
        m.lineup_con.add(sum(m.bench_slot[i, t, 0] for i in m.GK) == 1)
        m.lineup_con.add(sum(m.bench_slot[i, t, 0] for i in m.OUT) == 0)
        for s in [1, 2, 3]:
            m.lineup_con.add(sum(m.bench_slot[i, t, s] for i in m.OUT) == 1)
            m.lineup_con.add(sum(m.bench_slot[i, t, s] for i in m.GK) == 0)

        for i in I:
            m.lineup_con.add(sum(m.bench_slot[i, t, s] for s in m.BS) == m.bench[i, t])
            m.lineup_con.add(m.bench[i, t] <= m.x[i, t])
            m.lineup_con.add(m.y[i, t] <= m.x[i, t])
            m.lineup_con.add(m.y[i, t] <= 1 - m.bench[i, t])
            m.lineup_con.add(m.y[i, t] >= m.x[i, t] - m.bench[i, t])

        m.lineup_con.add(sum(m.c[i, t] for i in I) == 1)
        for i in I:
            m.lineup_con.add(m.c[i, t] <= m.y[i, t])

    # ---------------- Budget constraints ----------------
    m.bank_con = pyo.ConstraintList()

    for t in T[1:]:
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

    # ---------------- Transfers ----------------
    m.transfer_con = pyo.ConstraintList()

    for t in T[1:]:
        if use_freehit and t == fh_t:
            m.transfer_con.add(m.transfers_used[t] == 0)
            m.transfer_con.add(m.hit[t] == 0)
            for i in I:
                m.transfer_con.add(m.x[i, t] == m.x[i, t - 1])
                m.transfer_con.add(m.transfer_in[i, t] == 0)
                m.transfer_con.add(m.transfer_out[i, t] == 0)
            continue

        if t == wildcard_round_rel:
            for i in I:
                m.transfer_con.add(m.x[i, t] >= m.x[i, t - 1] - m.transfer_out[i, t])
                m.transfer_con.add(m.x[i, t] <= m.x[i, t - 1] + m.transfer_in[i, t])
            m.transfer_con.add(m.transfers_used[t] == 0)
            m.transfer_con.add(m.hit[t] == 0)
        else:
            for i in I:
                m.transfer_con.add(m.transfer_in[i, t] >= m.x[i, t] - m.x[i, t - 1])
                m.transfer_con.add(m.transfer_out[i, t] >= m.x[i, t - 1] - m.x[i, t])

            m.transfer_con.add(
                sum(m.transfer_in[i, t] for i in I) <= 1 + m.saved_transfers[t - 1] + m.hit[t]
            )
            m.transfer_con.add(
                m.transfers_used[t] == sum(m.transfer_in[i, t] for i in I)
            )

    m.transfer_con.add(m.transfers_used[0] == 0)
    m.transfer_con.add(m.hit[0] == 0)
    # Ensure t=0 transfer binaries are fixed and initialized.
    for i in I:
        m.transfer_con.add(m.transfer_in[i, 0] == 0)
        m.transfer_con.add(m.transfer_out[i, 0] == 0)

    # ---------------- Forced transfer-ins ----------------
    if forced_transfer_indices:
        live_gws = [t for t in T if t > 0]
        if not live_gws:
            raise ValueError("No future gameweeks available for forced transfer-ins.")
        first_live_t = min(live_gws)
        next_week_is_freehit = bool(use_freehit and fh_t == first_live_t)

        initial_squad_set = set(initial_squad)
        m.forced_transfer_in_con = pyo.ConstraintList()
        for i in forced_transfer_indices:
            if next_week_is_freehit:
                # If next GW is Free Hit, lock player into the free-hit squad for that GW.
                m.forced_transfer_in_con.add(
                    m.fh_x[i] == 1
                )
            else:
                # Otherwise, lock player into first live GW squad.
                m.forced_transfer_in_con.add(
                    m.x[i, first_live_t] == 1
                )
                # If not currently owned, force explicit transfer-in in first live GW.
                if i not in initial_squad_set:
                    m.forced_transfer_in_con.add(
                        m.transfer_in[i, first_live_t] == 1
                    )

    # ---------------- Saved transfers ----------------
    m.saved_con = pyo.ConstraintList()

    for t in T[1:]:
        if t == wildcard_round_rel:
            m.saved_con.add(m.saved_transfers[t] == m.saved_transfers[t - 1])
        else:
            if use_freehit and t == fh_t:
                m.saved_con.add(m.saved_transfers[t] == m.saved_transfers[t - 1])
            else:
                if abs_gw_num.get(t) == 40:
                    m.saved_con.add(m.saved_transfers[t] == 5)
                else:
                    m.saved_con.add(
                        m.saved_transfers[t]
                        == m.saved_transfers[t - 1] + 1 - m.transfers_used[t] + m.hit[t]
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
    # Solve with HiGHS (multi-solution via iterative no-good cuts)
    # ============================================================
    solver = pyo.SolverFactory("highs")

    if time_limit is not None:
        solver.options["time_limit"] = time_limit

    # HiGHS option naming can vary by interface/version; these are common:
    solver.options["mip_rel_gap"] = mip_gap

    m.no_good_cuts = pyo.ConstraintList()
    n_solutions = max(1, int(n_solutions))
    all_records: list[dict[str, Any]] = []

    player_meta = (
        current_players[["name", "code", "web_name"]]
        .drop_duplicates(subset=["name"])
        .set_index("name")
    )

    def get_player_meta(player_name: str) -> tuple[Optional[int], str]:
        if player_name in player_meta.index:
            row = player_meta.loc[player_name]
            return int(row["code"]), str(row["web_name"])
        return None, player_name

    def compute_points_only_objective() -> float:
        total = 0.0

        for t in T:
            if use_freehit and t == fh_t:
                for i in I:
                    pts = float(predicted_points[i][t])
                    total += safe_value(m.fh_y[i]) * pts
                    total += safe_value(m.fh_c[i]) * pts
                    for s in m.BS:
                        total += bench_slot_weights[int(s)] * safe_value(m.fh_bench_slot[i, s]) * pts

                    if bench_points_gw in T and t == bench_points_gw:
                        for s in m.BS:
                            total += bench_slot_bb_extra[int(s)] * safe_value(m.fh_bench_slot[i, s]) * pts
            else:
                for i in I:
                    pts = float(predicted_points[i][t])
                    total += safe_value(m.y[i, t]) * pts
                    total += safe_value(m.c[i, t]) * pts
                    for s in m.BS:
                        total += bench_slot_weights[int(s)] * safe_value(m.bench_slot[i, t, s]) * pts

                    if bench_points_gw in T and t == bench_points_gw:
                        for s in m.BS:
                            total += bench_slot_bb_extra[int(s)] * safe_value(m.bench_slot[i, t, s]) * pts

        return float(total - n_hits * 4 * 0.8)

    def compute_total_risk_score() -> float:
        total_risk = 0.0
        for t in T:
            if use_freehit and t == fh_t:
                total_risk += sum(safe_value(m.fh_x[i]) * float(risk_score[i]) for i in I)
            else:
                total_risk += sum(safe_value(m.y[i, t]) * float(risk_score[i]) for i in I)
        return float(total_risk)

    def extract_binary_pattern_terms() -> list[tuple[Any, int]]:
        terms: list[tuple[Any, int]] = []
        # Diversity cut based on playing XI plus transfer decisions.
        # We exclude t=0 since it is fixed/current state.
        for i in I:
            for t in T:
                if t == 0:
                    continue
                if use_freehit and t == fh_t:
                    terms.append((m.fh_y[i], int(round(safe_value(m.fh_y[i])))))
                else:
                    terms.append((m.y[i, t], int(round(safe_value(m.y[i, t])))))
                    terms.append((m.transfer_in[i, t], int(round(safe_value(m.transfer_in[i, t])))))
        return terms

    def compute_weighted_decay_expected_points() -> float:
        total = 0.0
        decay = float(solution_decay)

        # t=1 is first upcoming GW (weight=1.0), then decay per step.
        for t in T:
            if t == 0:
                continue
            weight = decay ** (t - 1)
            gw_points = 0.0

            if use_freehit and t == fh_t:
                for i in I:
                    pts = float(predicted_points[i][t])
                    gw_points += safe_value(m.fh_y[i]) * pts
                    gw_points += safe_value(m.fh_c[i]) * pts
                    for s in m.BS:
                        gw_points += bench_slot_weights[int(s)] * safe_value(m.fh_bench_slot[i, s]) * pts
                    if bench_points_gw in T and t == bench_points_gw:
                        for s in m.BS:
                            gw_points += bench_slot_bb_extra[int(s)] * safe_value(m.fh_bench_slot[i, s]) * pts
            else:
                for i in I:
                    pts = float(predicted_points[i][t])
                    gw_points += safe_value(m.y[i, t]) * pts
                    gw_points += safe_value(m.c[i, t]) * pts
                    for s in m.BS:
                        gw_points += bench_slot_weights[int(s)] * safe_value(m.bench_slot[i, t, s]) * pts
                    if bench_points_gw in T and t == bench_points_gw:
                        for s in m.BS:
                            gw_points += bench_slot_bb_extra[int(s)] * safe_value(m.bench_slot[i, t, s]) * pts

            total += weight * gw_points
        return float(total)

    def capture_solution_values() -> Dict[str, Dict[Any, int]]:
        sol: Dict[str, Dict[Any, int]] = {
            "x": {},
            "y": {},
            "bench": {},
            "bench_slot": {},
            "c": {},
            "transfer_in": {},
            "transfer_out": {},
        }
        for i in I:
            for t in T:
                sol["x"][(i, t)] = int(round(safe_value(m.x[i, t])))
                sol["y"][(i, t)] = int(round(safe_value(m.y[i, t])))
                sol["bench"][(i, t)] = int(round(safe_value(m.bench[i, t])))
                for s in m.BS:
                    sol["bench_slot"][(i, t, int(s))] = int(round(safe_value(m.bench_slot[i, t, s])))
                sol["c"][(i, t)] = int(round(safe_value(m.c[i, t])))
                sol["transfer_in"][(i, t)] = int(round(safe_value(m.transfer_in[i, t])))
                sol["transfer_out"][(i, t)] = int(round(safe_value(m.transfer_out[i, t])))

        if use_freehit:
            sol["fh_x"] = {}
            sol["fh_y"] = {}
            sol["fh_bench"] = {}
            sol["fh_bench_slot"] = {}
            sol["fh_c"] = {}
            sol["fh_in"] = {}
            sol["fh_out"] = {}
            for i in I:
                sol["fh_x"][i] = int(round(safe_value(m.fh_x[i])))
                sol["fh_y"][i] = int(round(safe_value(m.fh_y[i])))
                sol["fh_bench"][i] = int(round(safe_value(m.fh_bench[i])))
                for s in m.BS:
                    sol["fh_bench_slot"][(i, int(s))] = int(round(safe_value(m.fh_bench_slot[i, s])))
                sol["fh_c"][i] = int(round(safe_value(m.fh_c[i])))
                sol["fh_in"][i] = int(round(safe_value(m.fh_in[i])))
                sol["fh_out"][i] = int(round(safe_value(m.fh_out[i])))

        return sol

    def apply_solution_values_as_start(sol: Dict[str, Dict[Any, int]], force_difference: bool = False) -> bool:
        for (i, t), val in sol.get("x", {}).items():
            if i in I and t in T:
                m.x[i, t].value = val
        for (i, t), val in sol.get("y", {}).items():
            if i in I and t in T:
                m.y[i, t].value = val
        for (i, t), val in sol.get("bench", {}).items():
            if i in I and t in T:
                m.bench[i, t].value = val
        for (i, t, s), val in sol.get("bench_slot", {}).items():
            if i in I and t in T and s in m.BS:
                m.bench_slot[i, t, s].value = val
        for (i, t), val in sol.get("c", {}).items():
            if i in I and t in T:
                m.c[i, t].value = val
        for (i, t), val in sol.get("transfer_in", {}).items():
            if i in I and t in T:
                m.transfer_in[i, t].value = val
        for (i, t), val in sol.get("transfer_out", {}).items():
            if i in I and t in T:
                m.transfer_out[i, t].value = val

        if use_freehit:
            for i, val in sol.get("fh_x", {}).items():
                if i in I:
                    m.fh_x[i].value = val
            for i, val in sol.get("fh_y", {}).items():
                if i in I:
                    m.fh_y[i].value = val
            for i, val in sol.get("fh_bench", {}).items():
                if i in I:
                    m.fh_bench[i].value = val
            for (i, s), val in sol.get("fh_bench_slot", {}).items():
                if i in I and s in m.BS:
                    m.fh_bench_slot[i, s].value = val
            for i, val in sol.get("fh_c", {}).items():
                if i in I:
                    m.fh_c[i].value = val
            for i, val in sol.get("fh_in", {}).items():
                if i in I:
                    m.fh_in[i].value = val
            for i, val in sol.get("fh_out", {}).items():
                if i in I:
                    m.fh_out[i].value = val

        if not force_difference:
            return False

        # Make the warm-start seed differ from the previous incumbent.
        # Swap captain to another starter in earliest valid GW.
        for t in T:
            if t == 0:
                continue
            if use_freehit and t == fh_t:
                starters = [i for i in I if safe_value(m.fh_y[i]) > 0.5]
                old_caps = [i for i in I if safe_value(m.fh_c[i]) > 0.5]
                if old_caps and len(starters) >= 2:
                    old_cap = old_caps[0]
                    new_cap = next((i for i in starters if i != old_cap), None)
                    if new_cap is not None:
                        m.fh_c[old_cap].value = 0
                        m.fh_c[new_cap].value = 1
                        return True
            else:
                starters = [i for i in I if safe_value(m.y[i, t]) > 0.5]
                old_caps = [i for i in I if safe_value(m.c[i, t]) > 0.5]
                if old_caps and len(starters) >= 2:
                    old_cap = old_caps[0]
                    new_cap = next((i for i in starters if i != old_cap), None)
                    if new_cap is not None:
                        m.c[old_cap, t].value = 0
                        m.c[new_cap, t].value = 1
                        return True

        return False

    def append_solution_records(solution_no: int) -> None:
        solution_total_expected_points = compute_points_only_objective()
        solution_total_risk_score = compute_total_risk_score()
        solution_weighted_sum = compute_weighted_decay_expected_points()
        solution_rows: list[dict[str, Any]] = []

        # Debug squad per GW
        for t in range(1, optimize_range):
            print(f"\nSolution {solution_no} | Gameweek {t+1} Squad:")
            if use_freehit and t == fh_t:
                for i in I:
                    if safe_value(m.fh_x[i]) > 0.5:
                        status = "Bench" if safe_value(m.fh_bench[i]) > 0.5 else "Playing"
                        print(f"- {players[i]} ({positions[i]}) - {status} [FREE HIT]")
            else:
                for i in I:
                    if safe_value(m.x[i, t]) > 0.5:
                        status = "Bench" if safe_value(m.bench[i, t]) > 0.5 else "Playing"
                        print(f"- {players[i]} ({positions[i]}) - {status}")

        # Transfers in / out
        for t in range(1, optimize_range):
            for i in I:
                name = players[i]
                player_row_code, web_name = get_player_meta(name)
                if player_row_code is None:
                    continue

                pos = positions[i]
                gw = GW_list[t]

                if safe_value(m.x[i, t]) > 0.5 and safe_value(m.x[i, t - 1]) < 0.5:
                    solution_rows.append({
                        "Name": name,
                        "status": "transferred_in",
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                        "Is_captain": False,
                        "web_name": web_name,
                    })

                if safe_value(m.x[i, t]) < 0.5 and safe_value(m.x[i, t - 1]) > 0.5:
                    solution_rows.append({
                        "Name": name,
                        "status": "transferred_out",
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                        "Is_captain": False,
                        "web_name": web_name,
                    })

        # Playing / benched / captain
        for t in range(1, optimize_range - 1):
            gw = GW_list[t]
            if use_freehit and t == fh_t:
                for i in I:
                    if safe_value(m.fh_x[i]) > 0.5:
                        name = players[i]
                        player_row_code, web_name = get_player_meta(name)
                        if player_row_code is None:
                            continue
                        pos = positions[i]
                        status = "benched" if safe_value(m.fh_bench[i]) > 0.5 else "playing"
                        is_capt = bool(safe_value(m.fh_c[i]) > 0.5)
                        solution_rows.append({
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
                        player_row_code, web_name = get_player_meta(name)
                        if player_row_code is None:
                            continue
                        pos = positions[i]
                        status = "benched" if safe_value(m.bench[i, t]) > 0.5 else "playing"
                        is_capt = bool(safe_value(m.c[i, t]) > 0.5)
                        solution_rows.append({
                            "Name": name,
                            "status": status,
                            "GW": gw,
                            "position": pos,
                            "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                            "Is_captain": is_capt,
                            "web_name": web_name,
                        })

        solution_rows.append({
            "Name": "Obj Value",
            "status": solution_total_expected_points,
            "GW": 100,
            "position": "obj",
            "photo": "obj",
            "Is_captain": 0,
            "web_name": "obj",
        })

        for row in solution_rows:
            row["solution"] = solution_no
            row["solution_TotalExpectedPoints"] = solution_total_expected_points
            row["solution_total_risk_score"] = solution_total_risk_score
            row["solution_weighted_sum"] = solution_weighted_sum

        print(
            f"Solution {solution_no}: "
            f"TotalExpectedPoints={solution_total_expected_points:.3f}, "
            f"total_risk_score={solution_total_risk_score:.3f}, "
            f"weighted_sum={solution_weighted_sum:.3f}"
        )
        all_records.extend(solution_rows)
        if on_solution is not None:
            try:
                on_solution(solution_no, [dict(row) for row in solution_rows])
            except Exception as cb_exc:
                print(f"on_solution callback failed at solution {solution_no}: {cb_exc}")

    def solve_model_with_optional_warmstart() -> Any:
        solve_kwargs: Dict[str, Any] = {"tee": True}
        if multi_solution_warmstart:
            solve_kwargs["warmstart"] = True
        try:
            return solver.solve(m, **solve_kwargs)
        except TypeError as exc:
            # Some Pyomo HiGHS wrappers (LegacySolverWrapper) do not accept
            # the warmstart kwarg. We still keep incumbent variable values
            # as a seed and resolve without the explicit keyword.
            if multi_solution_warmstart and "warmstart" in str(exc).lower():
                print("Solver wrapper does not accept warmstart kwarg; retrying without it.")
                return solver.solve(m, tee=True)
            raise

    def is_good_termination(results: Any) -> bool:
        term = str(results.solver.termination_condition).lower()
        print(results.solver.status)
        print(results.solver.termination_condition)
        return term in {"optimal", "feasible"}

    last_incumbent: Optional[Dict[str, Dict[Any, int]]] = None

    for solution_no in range(1, n_solutions + 1):
        print(f"\n{'=' * 70}")
        print(f"Solving solution {solution_no}/{n_solutions}")
        print(f"{'=' * 70}")

        if (
            multi_solution_warmstart
            and solution_no > 1
            and last_incumbent is not None
        ):
            changed = apply_solution_values_as_start(last_incumbent, force_difference=True)
            print(f"Applied warm start from previous solution (forced difference={changed}).")

        # Stage 1: regular/base optimization (no risk in objective)
        m.obj_risk.deactivate()
        m.obj_floor_con.deactivate()
        m.obj_base.activate()

        print("Stage 1: maximize base objective")
        results_stage1 = solve_model_with_optional_warmstart()
        if not is_good_termination(results_stage1):
            term = str(results_stage1.solver.termination_condition).lower()
            print(f"Stopped at solution {solution_no} stage 1: termination={term}")
            break

        # Stage 2: risk optimization with objective floor if requested
        if abs(risk_float) > 0:
            stage1_obj = float(safe_value(m.base_obj_expr))
            allowed_drop = abs(risk_float) * 0.05 * stage1_obj
            floor_val = stage1_obj - allowed_drop

            m.obj_floor_rhs.value = floor_val
            m.obj_floor_con.activate()

            m.obj_base.deactivate()
            m.obj_risk.activate()

            direction = "minimize" if risk_float < 0 else "maximize"
            print(
                f"Stage 2: {direction} risk with base objective floor "
                f"{floor_val:.4f} (stage1={stage1_obj:.4f}, allowed_drop={allowed_drop:.4f})"
            )
            results_stage2 = solve_model_with_optional_warmstart()
            if not is_good_termination(results_stage2):
                term = str(results_stage2.solver.termination_condition).lower()
                print(f"Stopped at solution {solution_no} stage 2: termination={term}")
                break
        else:
            # Keep stage-1 solution as final if no risk re-optimization.
            m.obj_base.activate()
            m.obj_risk.deactivate()
            m.obj_floor_con.deactivate()

        append_solution_records(solution_no)
        last_incumbent = capture_solution_values()

        binary_terms = extract_binary_pattern_terms()
        min_distance_floor = 2 * max(1, len(GW_list) - 1)
        required_distance = max(1, int(min_solution_distance), min_distance_floor)
        print(
            "Applying diversity cut "
            f"(lineup + transfers): required_distance={required_distance}"
        )
        m.no_good_cuts.add(
            sum((1 - var) if val == 1 else var for var, val in binary_terms) >= required_distance
        )

        for t in range(1, optimize_range - 1):
            print("HIT", t, safe_value(m.hit[t]))

    return pd.DataFrame(all_records)

if __name__ == "__main__":
    TEAM_ID = 46805
    N_SOLUTIONS = 3
    OUTPUT_PATH = "_test_optimization.csv"

    out_df = optimize_my_team(
        team_id=TEAM_ID,
        n_solutions=N_SOLUTIONS,
        wildcard_round=32,
        risk_factor=0,
        bb_round=  33,
        free_hit_round= 34,
    )

    out_df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved: {OUTPUT_PATH} ({len(out_df)} rows)")
