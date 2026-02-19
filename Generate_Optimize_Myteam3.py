import os
import requests
from typing import Optional

import numpy as np
import pandas as pd
from pulp import (
    LpMaximize,
    LpProblem,
    LpVariable,
    lpSum,
    value,
)

from Generate_Fetch_Myteam import build_team_dataframe


# =====================================================================
# Helper: pivot long (player, GW, Points) → wide GW columns + GW 0 = 0
# =====================================================================

def apply_points_override_from_long(
    model_df: pd.DataFrame,
    df_long: pd.DataFrame,
    gw_list: list[str],
) -> pd.DataFrame:
    """
    model_df: Model_Optimizer.csv dataframe with columns:
              ['name', 'position', 'team_code', 'value', '0', '5', '6', ...]
    df_long:  long-format override with columns like:
              name/player, GW, Points
    gw_list: list of GW columns used in optimization, e.g. ['0','5','6','7','8','9'].
    """
    if df_long is None or df_long.empty:
        return model_df

    df_long = df_long.copy()

    # detect the name column
    name_col = None
    for cand in ["player", "name", "Name", "web_name"]:
        if cand in df_long.columns:
            name_col = cand
            break
    if name_col is None:
        raise ValueError("Override dataframe must have one of columns: 'player', 'name', 'Name', 'web_name'.")

    df_long = df_long.rename(columns={name_col: "name"})
    if "GW" not in df_long.columns or "Points" not in df_long.columns:
        raise ValueError("Override dataframe must have columns 'GW' and 'Points'.")

    df_long["name"] = df_long["name"].astype(str)
    df_long["GW"] = df_long["GW"].astype(int)
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
            continue

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


# =====================================================================
# Time helper
# =====================================================================

def Get_times(current_fixture_path: str) -> int:
    df = pd.read_csv(current_fixture_path)
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"])

    min_kicks = df.groupby("event", as_index=False)["kickoff_time"].min()
    min_kicks["kickoff_time"] = min_kicks["kickoff_time"].dt.tz_convert("Europe/Oslo")

    now = pd.Timestamp.now(tz="Europe/Oslo")
    future = min_kicks[min_kicks["kickoff_time"] > now]
    next_n = future.sort_values("kickoff_time").head(1)

    # Return last completed GW
    return int(next_n["event"].astype(int).values[0] - 1)


# =====================================================================
# Main optimizer with statistical override support + Free Hit proper logic
# =====================================================================

def optimize_my_team(
    team_id: int = 46805,
    wildcard_round: int = 40,
    bb_round: int = 40,
    free_hit_round: int = 40,
    Last_GW: int = 24,
    banned_list: Optional[list[str]] = None,
    GW_list: list[str] = None,
    n_hits: int = 0,
    current_player_path: str = "Raw_Data_25/current_players.csv",
    players_override: Optional[pd.DataFrame] = None,  # long format: [name, GW, Points]
    risk_factor: float = 0.0,
    transval:float=0.5,
) -> pd.DataFrame:

    if banned_list is None:
        banned_list = []
    if GW_list is None:
        GW_list = ["0", "8", "9", "10", "11", "12", "13", "14"]

    current_fixture_path = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv"
    Last_GW = Get_times(current_fixture_path)

    # Build final GW_list based on current time
    start = max(Last_GW + 1, 1)
    cutoff = start + 4
    GW_list = ["0"] + [str(i) for i in range(start, cutoff + 1)]
    GW_list = [str(gw) for gw in GW_list]
    print("GW_list:", GW_list)

    current_players = pd.read_csv(current_player_path)

    is_first = "1" in GW_list
    team_id = int(team_id)

    # --- Chip indices: map absolute GW -> index in GW_list (robust) ---
    def gw_index(gw_abs: Optional[int]) -> Optional[int]:
        if gw_abs is None:
            return None
        gw_str = str(int(gw_abs))
        return GW_list.index(gw_str) if gw_str in GW_list else None

    wildcard_round_rel = gw_index(wildcard_round)
    bench_points_gw = gw_index(bb_round)
    freehit_round_rel = gw_index(free_hit_round)

    optimize_range = len(GW_list)
    gameweeks = range(optimize_range)

    # Free Hit only makes sense if it lands on an actual GW in horizon (not "0")
    use_freehit = (freehit_round_rel is not None) and (freehit_round_rel >= 1)

    if wildcard_round_rel is not None and wildcard_round_rel < 1:
        wildcard_round_rel = 40
    if bench_points_gw is not None and bench_points_gw < 1:
        bench_points_gw = 40
    if is_first:
        wildcard_round_rel = 1

    # ---------------- Load base data ----------------
    data = pd.read_csv("Model_Optimizer.csv")

    # Ensure all GW columns exist
    for gw in GW_list:
        if gw not in data.columns:
            data[gw] = 0.0

    # ------------- Apply override (if provided) -------------
    if players_override is not None and not players_override.empty:
        override_long = players_override[["name", "GW", "Points"]].copy()
        data = apply_points_override_from_long(data, override_long, GW_list)

    # ------------- Apply banned list (zero out GW columns) -------------
    banned_mask = data["name"].isin(banned_list)
    for col in GW_list:
        data[col] = np.where(banned_mask, 0.0, data[col])

    # --------------------------------------------------
    # Squad / budget setup
    # --------------------------------------------------
    if is_first:
        initial_saved = 1
        team_df = pd.read_csv("Free_hit_team.csv")
        team_df["Full_Name"] = team_df["Name"].values
        money_in_bank_init = 0.0
    else:
        team_df = build_team_dataframe(team_id)
        print(team_df)
        initial_saved = int(team_df["saved_transfers"].values[0])
        money_in_bank_init = float(team_df["money_in_bank_m"].values[0])
        print("money_in_bank_init:", money_in_bank_init)

    players = data["name"].astype(str).tolist()
    costs = data["value"].tolist()

    # initial squad indices from team_df
    initial_squad = []
    for t in range(len(team_df)):
        name = str(team_df["name"].values[t])
        if name in players:
            initial_squad.append(players.index(name))
    print("initial_squad indices:", initial_squad)

    # list1 = "sell value" vector (defaults to buy cost unless we set selling prices)
    list1 = costs.copy()

    if is_first:
        budget_amount = 100.0
    else:
        selling_cost = team_df["selling_price_m"].values.astype(float)
        budget_amount = float(np.sum(selling_cost) + money_in_bank_init + 0.01)
        for i, idx in enumerate(initial_squad):
            list1[idx] = float(selling_cost[i])

    print("budget_amount:", budget_amount)
    print()

    initial_saved = initial_saved + n_hits
    print("HITS:", n_hits)
    print("initial_saved:", initial_saved)

    positions = data["position"].tolist()
    teams = data["team_code"].tolist()
    selected = pd.to_numeric(data["selected"], errors="coerce").fillna(0.0).to_numpy()

    predicted_points = data[GW_list].to_numpy(dtype=float)

    # ---------- Risk adjustment (risk is an int: -10..+10, step=1 => 0.1) ----------
    # Example: risk=-10 => -1.0 (very low-risk), risk=0 => neutral, risk=+10 => +1.0 (very high-risk)

    risk_float = float(risk_factor) if risk_factor is not None else 0.0

    # map -1..1 → -10..10 (preserve 0.1 steps)
    risk_int = float(risk_float *5)

    risk_int = float(np.clip(risk_int, -5, 5))
    risk_value = risk_int / 20.0  # -1..1

    # ownership selected is already ~0..0.8, keep it clipped
    sel = np.clip(selected.astype(float), 0, 1)
    ownership_risk = 1 - sel  # higher => more differential

    # Points STD (your ranges: ~0.5..3)
    points_std = pd.to_numeric(data["Point_STD"], errors="coerce")
    points_std = points_std.fillna(points_std.median()).to_numpy(dtype=float)
    points_risk = pd.to_numeric(data["Risk_share_avg"], errors="coerce")
    points_risk = points_risk.fillna(points_risk.median()).to_numpy(dtype=float)
    points_risk = np.clip(points_std, 0, 0.8)
    points_std = np.clip(points_std, 0, 3.5)

    # robust scale std to 0..1
    std_min = float(np.nanpercentile(points_std, 5))
    std_max = float(np.nanpercentile(points_std, 95))
    points_std_scaled = (points_std - std_min) / (std_max - std_min + 1e-9)
    points_std_scaled = np.clip(points_std_scaled, 0, 1)

    # combine into a single risk score (0..1-ish)
    w_own, w_std = 0.7, 0.3
    risk_score = w_own * ownership_risk + w_std * (points_std_scaled*0.3+0.7*points_risk)

    # direction:
    #  risk_value < 0 => low risk => penalize risky players
    #  risk_value > 0 => high risk => reward risky players
    offset=1
    if risk_value < 0:
        sign = -1
    elif risk_value > 0:
        sign = +1
        offset=1
    else:
        sign = 0

    # lambda: starts at 3, +1 per 0.1 step away from zero
    # if risk_int=0 => lam doesn't matter because sign=0 (no risk term)
    lam = 1.3 + abs(risk_int)*offset    
    
    transfervalue=transval*2



    abs_gw_num = {t: (int(GW_list[t]) if str(GW_list[t]).isdigit() else None) for t in gameweeks}
    num_players = len(players)

    def_indices = [i for i, pos in enumerate(positions) if pos == "DEF"]
    gk_indices = [i for i, pos in enumerate(positions) if pos == "GKP"]
    mid_indices = [i for i, pos in enumerate(positions) if pos == "MID"]
    fwd_indices = [i for i, pos in enumerate(positions) if pos == "FWD"]
    outfield_indices = [i for i, pos in enumerate(positions) if pos != "GKP"]
    
    risk_score[gk_indices] = 0.0

    # Slightly penalize GK points
    for i in gk_indices:
        for t in range(optimize_range):
            predicted_points[i][t] *= 0.8

    teams_set = set(teams)
    team_to_indices = {team: [i for i, tcode in enumerate(teams) if tcode == team] for team in teams_set}

    model = LpProblem("Maximize_Predicted_Points", LpMaximize)

    # --- Variables (real squad) ---
    x = {(i, t): LpVariable(f"x_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}
    bench = {(i, t): LpVariable(f"bench_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}
    c = {(i, t): LpVariable(f"captain_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}
    y = {(i, t): LpVariable(f"y_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}

    transfer_in = {(i, t): LpVariable(f"transfer_in_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}
    transfer_out = {(i, t): LpVariable(f"transfer_out_{i}_{t}", cat="Binary") for i in range(num_players) for t in gameweeks}

    saved_transfers = {t: LpVariable(f"saved_transfers_{t}", lowBound=0, upBound=5, cat="Integer") for t in gameweeks}
    transfers_used = {t: LpVariable(f"transfers_used_{t}", lowBound=0, upBound=5, cat="Integer")for t in gameweeks}

    money_in_bank_var = {t: LpVariable(f"money_in_bank_{t}", lowBound=0, cat="Continuous") for t in gameweeks}

    # --- Free Hit temporary squad vars (one GW only) + FH transfer/bank vars ---
    if use_freehit:
        fh_t = freehit_round_rel
        fh_x = {i: LpVariable(f"fh_x_{i}", cat="Binary") for i in range(num_players)}
        fh_bench = {i: LpVariable(f"fh_bench_{i}", cat="Binary") for i in range(num_players)}
        fh_y = {i: LpVariable(f"fh_y_{i}", cat="Binary") for i in range(num_players)}
        fh_c = {i: LpVariable(f"fh_c_{i}", cat="Binary") for i in range(num_players)}

        # New: model FH budget correctly via transfers from real squad at (fh_t-1)
        fh_in = {i: LpVariable(f"fh_in_{i}", cat="Binary") for i in range(num_players)}
        fh_out = {i: LpVariable(f"fh_out_{i}", cat="Binary") for i in range(num_players)}
        fh_bank = LpVariable("fh_bank", lowBound=0, cat="Continuous")
    else:
        fh_t = None
        fh_x = fh_bench = fh_y = fh_c = None
        fh_in = fh_out = None
        fh_bank = None

    # Initial squad at t=0
    for i in range(num_players):
        model += x[i, 0] == (1 if i in initial_squad else 0)

    # --- Objective Function (branch on Free Hit GW) ---
    obj_terms = []
    risk_terms = []

    for t in gameweeks:
        if use_freehit and t == fh_t:
            obj_terms.append(lpSum(
                (fh_y[i] + fh_c[i] + fh_bench[i] * 0.05) * predicted_points[i][t]
                for i in range(num_players)
            ))
            if lam > 0:
                risk_terms.append(lpSum(
                    fh_x[i] * risk_score[i] for i in range(num_players)
                ))
        else:
            obj_terms.append(lpSum(
                (y[i, t] + c[i, t] + bench[i, t] * 0.1) * predicted_points[i][t]
                for i in range(num_players)
            ))
            if lam > 0:
                risk_terms.append(lpSum(
                    y[i, t] * risk_score[i] for i in range(num_players)
                ))

    # base points objective
    obj = lpSum(obj_terms)

    # your existing "in-horizon" saved transfer value
    obj += lpSum(-0.35 * transfervalue * transfers_used[t] for t in gameweeks)



    # add risk adjustment without touching points
    if lam > 0 and sign != 0:
        obj += sign * lam * lpSum(risk_terms)

    # Bench boost
    if bench_points_gw in gameweeks:
        if use_freehit and bench_points_gw == fh_t:
            obj += lpSum(fh_bench[i] * predicted_points[i][bench_points_gw] for i in range(num_players))
        else:
            obj += lpSum(bench[i, bench_points_gw] * predicted_points[i][bench_points_gw] for i in range(num_players))

    model += obj

    # --- Real squad composition constraints ---
    for t in gameweeks:
        model += lpSum(x[i, t] for i in range(num_players)) == 15
        model += lpSum(x[i, t] for i in def_indices) == 5
        model += lpSum(x[i, t] for i in gk_indices) == 2
        model += lpSum(x[i, t] for i in mid_indices) == 5
        model += lpSum(x[i, t] for i in fwd_indices) == 3

    # --- Free Hit squad composition constraints + proper FH budget linking ---
    if use_freehit:
        model += lpSum(fh_x[i] for i in range(num_players)) == 15
        model += lpSum(fh_x[i] for i in def_indices) == 5
        model += lpSum(fh_x[i] for i in gk_indices) == 2
        model += lpSum(fh_x[i] for i in mid_indices) == 5
        model += lpSum(fh_x[i] for i in fwd_indices) == 3

        # Max 3 per team on FH squad
        for team, indices in team_to_indices.items():
            model += lpSum(fh_x[i] for i in indices) <= 3

        # --- FH budget: start from real squad at prev_t, apply FH transfers to reach fh_x ---
        prev_t = fh_t - 1  # fh_t >= 1 by construction

        # can only transfer out owned players (from real squad prev week)
        for i in range(num_players):
            model += fh_out[i] <= x[i, prev_t]

        # (optional) can only transfer in players not already owned
        for i in range(num_players):
            model += fh_in[i] <= 1 - x[i, prev_t]

        # link FH squad to previous real squad + FH transfers
        for i in range(num_players):
            model += fh_x[i] == x[i, prev_t] - fh_out[i] + fh_in[i]

        # bank evolution during FH (uses sell prices list1 and buy prices costs)
        model += fh_bank == (
            money_in_bank_var[prev_t]
            + lpSum(fh_out[i] * list1[i] for i in range(num_players))
            - lpSum(fh_in[i] * costs[i] for i in range(num_players))
        )

        # bank must remain non-negative (lowBound already) and within overall cap
        model += fh_bank <= budget_amount

    # --- Starting XI + bench + captain constraints (branch on FH week) ---
    for t in gameweeks:
        if use_freehit and t == fh_t:
            # Starting XI
            model += lpSum(fh_y[i] for i in range(num_players)) == 11
            model += lpSum(fh_y[i] for i in gk_indices) == 1
            model += lpSum(fh_y[i] for i in def_indices) >= 3
            model += lpSum(fh_y[i] for i in def_indices) <= 5
            model += lpSum(fh_y[i] for i in mid_indices) >= 2
            model += lpSum(fh_y[i] for i in mid_indices) <= 5
            model += lpSum(fh_y[i] for i in fwd_indices) >= 1
            model += lpSum(fh_y[i] for i in fwd_indices) <= 3

            # Bench
            model += lpSum(fh_bench[i] for i in gk_indices) == 1
            model += lpSum(fh_bench[i] for i in outfield_indices) == 3
            for i in range(num_players):
                model += fh_bench[i] <= fh_x[i]

            # Link
            for i in range(num_players):
                model += fh_y[i] <= fh_x[i]
                model += fh_y[i] <= 1 - fh_bench[i]
                model += fh_y[i] >= fh_x[i] - fh_bench[i]

            # Captain
            model += lpSum(fh_c[i] for i in range(num_players)) == 1
            for i in range(num_players):
                model += fh_c[i] <= fh_y[i]

            continue

        # --- normal week ---
        model += lpSum(y[i, t] for i in range(num_players)) == 11
        model += lpSum(y[i, t] for i in gk_indices) == 1
        model += lpSum(y[i, t] for i in def_indices) >= 3
        model += lpSum(y[i, t] for i in def_indices) <= 5
        model += lpSum(y[i, t] for i in mid_indices) >= 2
        model += lpSum(y[i, t] for i in mid_indices) <= 5
        model += lpSum(y[i, t] for i in fwd_indices) >= 1
        model += lpSum(y[i, t] for i in fwd_indices) <= 3

        model += lpSum(bench[i, t] for i in gk_indices) == 1
        model += lpSum(bench[i, t] for i in outfield_indices) == 3

        for i in range(num_players):
            model += bench[i, t] <= x[i, t]
            model += y[i, t] <= x[i, t]
            model += y[i, t] <= 1 - bench[i, t]
            model += y[i, t] >= x[i, t] - bench[i, t]

        model += lpSum(c[i, t] for i in range(num_players)) == 1
        for i in range(num_players):
            model += c[i, t] <= y[i, t]

    # No immediate back-to-back transfers (keep your original logic)
    for t in range(1, optimize_range - 1):
        for i in range(num_players):
            model += transfer_in[i, t] + transfer_out[i, t + 1] <= 1

    # --- Budget Constraints (real squad) ---
    for t in gameweeks[1:]:
        model += (
            money_in_bank_var[t]
            == money_in_bank_var[t - 1]
            + lpSum(transfer_out[i, t] * list1[i] for i in range(num_players))
            - lpSum(transfer_in[i, t] * costs[i] for i in range(num_players))
        )

    for t in gameweeks:
        model += lpSum(x[i, t] * list1[i] for i in range(num_players)) + money_in_bank_var[t] <= budget_amount

    # --- Max 3 players per team (real squad) ---
    initial_team_count = {team: 0 for team in teams_set}
    for i in initial_squad:
        initial_team_count[teams[i]] += 1

    for team, indices in team_to_indices.items():
        model += lpSum(x[i, 0] for i in indices) <= max(3, initial_team_count[team])
        for t in gameweeks[1:]:
            model += lpSum(x[i, t] for i in indices) <= 3

    # --- Transfer Constraints (real squad evolution) ---
    for t in gameweeks[1:]:
        # Free Hit week: real squad does NOT change
        if use_freehit and t == fh_t:
            model += transfers_used[t]==1
            for i in range(num_players):
                model += x[i, t] == x[i, t - 1]
                model += transfer_in[i, t] == 0
                model += transfer_out[i, t] == 0
            continue

        if t == wildcard_round_rel:
            for i in range(num_players):
                model += x[i, t] >= x[i, t - 1] - transfer_out[i, t]
                model += x[i, t] <= x[i, t - 1] + transfer_in[i, t]
            model += transfers_used[t]==1
        else:
            for i in range(num_players):
                model += transfer_in[i, t] >= x[i, t] - x[i, t - 1]
                model += transfer_out[i, t] >= x[i, t - 1] - x[i, t]
                model += transfer_out[i, t] <= x[i, t - 1]
            model += lpSum(transfer_in[i, t] for i in range(num_players)) <= 1 + saved_transfers[t - 1]
            model += transfers_used[t] == lpSum(transfer_in[i, t] for i in range(num_players))
    model += transfers_used[0] == 0
    # --- Saved transfer evolution ---
    for t in gameweeks[1:]:
        if t == wildcard_round_rel:
            model += saved_transfers[t] == saved_transfers[t - 1]
        else:
            if use_freehit and t == fh_t:
                # Treat FH week as "1 transfer used" -> no +1 saved gained
                model += saved_transfers[t] == saved_transfers[t - 1]
            else:
                if abs_gw_num.get(t) == 40:  # AFCON special rule in your code
                    model += saved_transfers[t] == 5
                else:
                    model += saved_transfers[t] == saved_transfers[t - 1] + (
                        1 - lpSum(transfer_in[i, t] for i in range(num_players))
                    )
        model += saved_transfers[t] <= 5

    # --- Initial Transfers & Bank ---
    model += saved_transfers[0] == initial_saved
    model += money_in_bank_var[0] == money_in_bank_init

    # --- Solve ---
    model.solve()
    records = []
    
    def compute_points_only_objective():
        total = 0.0

        # same weight you used in objective: starter + captain + 0.05*bench
        for t in gameweeks:
            if use_freehit and t == fh_t:
                for i in range(num_players):
                    total += float((fh_y[i].varValue or 0)) * float(predicted_points[i][t])
                    total += float((fh_c[i].varValue or 0)) * float(predicted_points[i][t])
                    total += float((fh_bench[i].varValue or 0)) * 0.05 * float(predicted_points[i][t])
            else:
                for i in range(num_players):
                    total += float((y[i, t].varValue or 0)) * float(predicted_points[i][t])
                    total += float((c[i, t].varValue or 0)) * float(predicted_points[i][t])
                    total += float((bench[i, t].varValue or 0)) * 0.05 * float(predicted_points[i][t])

        # saved transfers bonus (also independent of risk)
        for t in gameweeks:
            total += 0.2 * float(saved_transfers[t].varValue or 0)

        return total


    print(f"Status: {model.status}")
    if model.status == -1:
        return pd.DataFrame()

    # Debug: squad per GW
    for t in range(1, optimize_range):
        print(f"\nGameweek {t+1} Squad:")
        if use_freehit and t == fh_t:
            for i in range(num_players):
                if fh_x[i].varValue and fh_x[i].varValue > 0.5:
                    status = "Bench" if (fh_bench[i].varValue and fh_bench[i].varValue > 0.5) else "Playing"
                    print(f"- {players[i]} ({positions[i]}) - {status} [FREE HIT]")
        else:
            for i in range(num_players):
                if x[i, t].varValue and x[i, t].varValue > 0.5:
                    status = "Bench" if (bench[i, t].varValue and bench[i, t].varValue > 0.5) else "Playing"
                    print(f"- {players[i]} ({positions[i]}) - {status}")

    # Transfers in / out (real squad only; FH week produces none because x is fixed)
    for t in range(1, optimize_range):
        for i in range(num_players):
            name = players[i]
            player_row_code = current_players[current_players["name"] == name]["code"].values[0]
            web_name = current_players[current_players["name"] == name]["web_name"].values[0]
            pos = positions[i]
            gw = GW_list[t]

            if x[i, t].varValue > 0.5 and x[i, t - 1].varValue < 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_in",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": False,
                    "web_name": web_name,
                })

            if x[i, t].varValue < 0.5 and x[i, t - 1].varValue > 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_out",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": False,
                    "web_name": web_name,
                })

    # Playing / benched / captain (branch on FH week)
    for t in range(1, optimize_range - 1):
        gw = GW_list[t]
        if use_freehit and t == fh_t:
            for i in range(num_players):
                if fh_x[i].varValue and fh_x[i].varValue > 0.5:
                    name = players[i]
                    player_row_code = current_players[current_players["name"] == name]["code"].values[0]
                    web_name = current_players[current_players["name"] == name]["web_name"].values[0]
                    pos = positions[i]
                    status = "benched" if (fh_bench[i].varValue and fh_bench[i].varValue > 0.5) else "playing"
                    is_capt = bool(fh_c[i].varValue and fh_c[i].varValue > 0.5)
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
            for i in range(num_players):
                if x[i, t].varValue and x[i, t].varValue > 0.5:
                    name = players[i]
                    player_row_code = current_players[current_players["name"] == name]["code"].values[0]
                    web_name = current_players[current_players["name"] == name]["web_name"].values[0]
                    pos = positions[i]
                    status = "benched" if (bench[i, t].varValue and bench[i, t].varValue > 0.5) else "playing"
                    is_capt = bool(c[i, t].varValue and c[i, t].varValue > 0.5)
                    records.append({
                        "Name": name,
                        "status": status,
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                        "Is_captain": is_capt,
                        "web_name": web_name,
                    })

    # Final structured DataFrame with objective value
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

    return pd.DataFrame(records)


if __name__ == "__main__":
    optimize_my_team(wildcard_round=32)
    
    
