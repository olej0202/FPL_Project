from typing import Optional, Dict, Any
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
    v = pyo.value(x)
    return 0.0 if v is None else float(v)


# ============================================================
# Main optimizer
# ============================================================

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
) -> pd.DataFrame:

    if banned_list is None:
        banned_list = []
    if GW_list is None:
        GW_list = ["0", "8", "9", "10", "11", "12", "13", "14"]

    current_fixture_path = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv"
    Last_GW = get_last_completed_gw(current_fixture_path)

    start = max(Last_GW + 1, 1)
    cutoff = start + 4
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

    players = data["name"].astype(str).tolist()
    costs = data["value"].astype(float).tolist()

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
    predicted_points = data[GW_list].to_numpy(dtype=float)

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

    # fixed bug: clip points_risk, not points_std again
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

    # keep your GK penalty
    for i in gk_indices:
        for t in range(optimize_range):
            predicted_points[i][t] *= 0.8

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
    m.DEF = pyo.Set(initialize=def_indices)
    m.GK = pyo.Set(initialize=gk_indices)
    m.MID = pyo.Set(initialize=mid_indices)
    m.FWD = pyo.Set(initialize=fwd_indices)
    m.OUT = pyo.Set(initialize=outfield_indices)

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
                (m.fh_y[i] + m.fh_c[i] + 0.1 * m.fh_bench[i]) * m.pred[i, t]
                for i in I
            )
            risk_expr += sum(m.fh_x[i] * m.risk[i] for i in I)
        else:
            points_expr += sum(
                (m.y[i, t] + m.c[i, t] + 0.1 * m.bench[i, t]) * m.pred[i, t]
                for i in I
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
            bench_boost_expr += sum(m.fh_bench[i] * m.pred[i, bench_points_gw] for i in I)
        else:
            bench_boost_expr += sum(m.bench[i, bench_points_gw] * m.pred[i, bench_points_gw] for i in I)

    total_obj = points_expr + transfer_penalty_expr + hit_penalty_expr + bench_boost_expr
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

            m.lineup_con.add(sum(m.fh_bench[i] for i in m.GK) == 1)
            m.lineup_con.add(sum(m.fh_bench[i] for i in m.OUT) == 3)

            for i in I:
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

        m.lineup_con.add(sum(m.bench[i, t] for i in m.GK) == 1)
        m.lineup_con.add(sum(m.bench[i, t] for i in m.OUT) == 3)

        for i in I:
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
    # Solve with HiGHS
    # ============================================================
    solver = pyo.SolverFactory("highs")

    if time_limit is not None:
        solver.options["time_limit"] = time_limit

    # HiGHS option naming can vary by interface/version; these are common:
    solver.options["mip_rel_gap"] = mip_gap

    results = solver.solve(m, tee=True)

    term = str(results.solver.termination_condition).lower()
    print(results.solver.status)
    print(results.solver.termination_condition)

    if term not in {"optimal", "feasible"}:
        return pd.DataFrame()

    # ============================================================
    # Extract solution
    # ============================================================
    records = []

    def compute_points_only_objective():
        total = 0.0
        for t in T:
            if use_freehit and t == fh_t:
                for i in I:
                    total += safe_value(m.fh_y[i]) * float(predicted_points[i][t])
                    total += safe_value(m.fh_c[i]) * float(predicted_points[i][t])
                    total += safe_value(m.fh_bench[i]) * 0.1 * float(predicted_points[i][t])
            else:
                for i in I:
                    total += safe_value(m.y[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.c[i, t]) * float(predicted_points[i][t])
                    total += safe_value(m.bench[i, t]) * 0.1 * float(predicted_points[i][t])
        return total

    # Debug squad per GW
    for t in range(1, optimize_range):
        print(f"\nGameweek {t+1} Squad:")
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
            row = current_players[current_players["name"] == name]
            if row.empty:
                continue

            player_row_code = row["code"].values[0]
            web_name = row["web_name"].values[0]
            pos = positions[i]
            gw = GW_list[t]

            if safe_value(m.x[i, t]) > 0.5 and safe_value(m.x[i, t - 1]) < 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_in",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": False,
                    "web_name": web_name,
                })

            if safe_value(m.x[i, t]) < 0.5 and safe_value(m.x[i, t - 1]) > 0.5:
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
    for t in range(1, optimize_range - 1):
        gw = GW_list[t]
        if use_freehit and t == fh_t:
            for i in I:
                if safe_value(m.fh_x[i]) > 0.5:
                    name = players[i]
                    row = current_players[current_players["name"] == name]
                    if row.empty:
                        continue
                    player_row_code = row["code"].values[0]
                    web_name = row["web_name"].values[0]
                    pos = positions[i]
                    status = "benched" if safe_value(m.fh_bench[i]) > 0.5 else "playing"
                    is_capt = bool(safe_value(m.fh_c[i]) > 0.5)
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

    obj_val = compute_points_only_objective() - n_hits * 4 * 0.8

    records.append({
        "Name": "Obj Value",
        "status": obj_val,
        "GW": 100,
        "position": "obj",
        "photo": "obj",
        "Is_captain": 0,
        "web_name": "obj",
    })

    print("Objective record:", records[-1])
    for t in range(1, optimize_range - 1):
        print("HIT", t, safe_value(m.hit[t]))

    return pd.DataFrame(records)




from collections import defaultdict


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
        
if __name__ == "__main__":

    all_results = []
    failed_team_ids = []
    
    for team_id in range(1, 150):
        print(f"\n{'=' * 80}")
        print(f"Running optimization for team_id={team_id}")
        print(f"{'=' * 80}")

        try:
            result_df = optimize_my_team(
                team_id=team_id,
            )

            if result_df is not None and not result_df.empty:

                temp = result_df.copy()

                # keep only transfer rows
                temp = temp[temp["status"].isin(["transferred_in","transferred_out"])]

                # pivot transfers per GW
                for gw in temp["GW"].unique():

                    gw_df = temp[temp["GW"] == gw]

                    ins = gw_df[gw_df["status"] == "transferred_in"]
                    outs = gw_df[gw_df["status"] == "transferred_out"]

                    n = max(len(ins), len(outs))

                    for i in range(n):

                        in_row = ins.iloc[i] if i < len(ins) else None
                        out_row = outs.iloc[i] if i < len(outs) else None

                        all_results.append({
                            "team_id": team_id,
                            "GW": gw,
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

    # build dataframe
    transfer_df = pd.DataFrame(all_results)

    if not transfer_df.empty:
        transfer_df = transfer_df.sort_values(
            by=["GW","team_id"],
            ascending=[True,True]
        )

    transfer_df.to_csv("Optimizedtransfer.csv", index=False)

    print("\nSaved: Optimizedtransfer.csv")