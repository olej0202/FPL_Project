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

import pandas as pd
import numpy as np

def apply_points_override_from_long(
    model_df: pd.DataFrame,
    df_long: pd.DataFrame,
    gw_list: list[str],
) -> pd.DataFrame:
    """
    model_df: your Model_Optimizer.csv dataframe with columns:
              ['name', 'position', 'team_code', 'value', '0', '5', '6', ...]
    df_long:  long-format override with columns like:
              name/player, GW, Points
    gw_list: list of GW columns used in optimization, e.g. ['0','5','6','7','8','9'].

    Returns a copy of model_df with the given GW columns replaced by the override Points
    where we have overrides; other players / GWs stay as in model_df.
    """
    if df_long is None or df_long.empty:
        return model_df

    df_long = df_long.copy()

    # 1) Detect the name column: 'player', 'name', 'Name', 'web_name'
    name_col = None
    for cand in ["player", "name", "Name", "web_name"]:
        if cand in df_long.columns:
            name_col = cand
            break

    if name_col is None:
        raise ValueError("Override dataframe must have one of columns: 'player', 'name', 'Name', 'web_name'.")

    # Normalise column names
    df_long = df_long.rename(columns={name_col: "name"})
    if "GW" not in df_long.columns or "Points" not in df_long.columns:
        raise ValueError("Override dataframe must have columns 'GW' and 'Points'.")

    # Ensure types
    df_long["name"] = df_long["name"].astype(str)
    df_long["GW"] = df_long["GW"].astype(int)
    df_long["Points"] = pd.to_numeric(df_long["Points"], errors="coerce").fillna(0.0)

    # 2) Pivot to wide: rows = name, cols = GW, values = Points
    pivot = (
        df_long
        .pivot_table(index="name", columns="GW", values="Points", aggfunc="sum")
        .fillna(0.0)
    )
    if 0 not in pivot.columns:
        pivot[0] = 0.0

    # 3) We'll overwrite only GW columns that exist in both gw_list and pivot
    gw_int_to_col = {}
    for gw_str in gw_list:
        try:
            gw_int = int(gw_str)
        except ValueError:
            continue
        gw_int_to_col[gw_int] = gw_str

    # 4) Copy model_df and override values
    out = model_df.copy()

    # Ensure we can look up by name quickly
    out["name"] = out["name"].astype(str)

    for player_name, row in pivot.iterrows():
        mask = out["name"] == player_name
        if not mask.any():
            # No such player in Model_Optimizer.csv – skip
            continue

        for gw_int, gw_str in gw_int_to_col.items():
            if gw_int in row.index:
                out.loc[mask, gw_str] = row[gw_int]

    return out


# =====================================================================
# Time / team helpers
# =====================================================================

def Get_times(current_fixture_path: str) -> int:
    df = pd.read_csv(current_fixture_path)
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"])

    min_kicks = (
        df.groupby("event", as_index=False)["kickoff_time"]
          .min()
    )
    min_kicks["kickoff_time"] = min_kicks["kickoff_time"].dt.tz_convert("Europe/Oslo")

    now = pd.Timestamp.now(tz="Europe/Oslo")
    future = min_kicks[min_kicks["kickoff_time"] > now]
    n = 1
    next_n = future.sort_values("kickoff_time").head(n)
    # Return last completed GW
    return next_n["event"].astype(int).values[0] - 1



# =====================================================================
# Main optimizer with statistical override support
# =====================================================================

def optimize_my_team(
    team_id: int = 7025308,
    wildcard_round: int = 8,
    bb_round: int = 10,
    free_hit_round: int = 40,
    Last_GW: int = 7,
    banned_list: Optional[list[str]] = None,
    GW_list: list[str] = None,
    n_hits: int = 0,
    current_player_path: str = "Raw_Data_25/current_players.csv",
    # long format override: columns [player, GW, Points]
    players_override: Optional[pd.DataFrame] = None,
    risk_factor: str = "med",   # <--- NEW
) -> pd.DataFrame:

    if banned_list is None:
        banned_list = []
    if GW_list is None:
        GW_list = ["0", "8", "9", "10", "11", "12", "13", "14"]

    current_fixture_path = "Raw_Data_25/Fantasy_season_2025_Fixtures.csv"
    Last_GW = Get_times(current_fixture_path)

    # Build final GW_list based on current time
    start = max(Last_GW + 1, 1)  # avoid duplicating '0' if n < 0
    cutoff = start + 4
    GW_list = ["0"] + [str(i) for i in range(start, cutoff + 1)]
    GW_list = [str(gw) for gw in GW_list]  # normalize to string
    print("GW_list:", GW_list)

    current_players = pd.read_csv(current_player_path)
    free_hit_values = pd.read_csv("Free_hit_values.csv")

    is_first = "1" in GW_list
    team_id = int(team_id)

    # Adjust chip rounds to relative indices
    wildcard_round_rel = None if wildcard_round is None else int(wildcard_round) - Last_GW
    bench_points_gw = None if bb_round is None else int(bb_round) - Last_GW
    freehit_round_rel = None if free_hit_round is None else int(free_hit_round) - Last_GW

    # Free hit adjustment
    if str(free_hit_round) in GW_list:
        free_hit_val = free_hit_values.values[freehit_round_rel - 1][-1]
        week_to_remove_transfer = int(free_hit_round) + 1 - Last_GW
        GW_list.remove(str(free_hit_round))
    else:
        free_hit_val = 0
        week_to_remove_transfer = 40

    if wildcard_round_rel is not None and wildcard_round_rel < 1:
        wildcard_round_rel = 40
    if bench_points_gw is not None and bench_points_gw < 1:
        bench_points_gw = 40
    if is_first:
        wildcard_round_rel = 1  # Gameweek index for free hit start
    if (
        freehit_round_rel is not None
        and wildcard_round_rel is not None
        and freehit_round_rel < wildcard_round_rel
    ):
        wildcard_round_rel -= 1

    hit = n_hits

    # ---------------- Load base data ----------------
    data = pd.read_csv("Model_Optimizer.csv")

    # Make sure all GW columns exist (so override can safely fill them)
    for gw in GW_list:
        if gw not in data.columns:
            data[gw] = 0.0

    # ------------- Apply override (if provided) -------------
    if players_override is not None and not players_override.empty:

        override_long = players_override[["name", "GW", "Points"]].copy()
        data = apply_points_override_from_long(data, override_long, GW_list)
        print(data)

    # ------------- Apply banned list (zero out GW columns) -------------
    banned_mask = data["name"].isin(banned_list)
    for col in GW_list:
        data[col] = np.where(
            banned_mask,
            0.0,
            data[col],
        )

    # --------------------------------------------------
    # Squad / budget setup
    # --------------------------------------------------
    # Squad / budget setup
    # --------------------------------------------------
    if is_first:
        initial_saved = 1
        squad = pd.read_csv("Free_hit_team.csv")
        squad["Full_Name"] = squad["Name"].values
        money_in_bank_init = 0  # TODO: adjust if needed
    else:
        team_df = build_team_dataframe(team_id)
        print(team_df)
        initial_saved=team_df["saved_transfers"].values[0]
        
        money_in_bank_init = team_df["money_in_bank_m"].values[0]
        print("money_in_bank_init:", money_in_bank_init)

    players = data["name"].tolist()
    costs = data["value"].tolist()

    initial_squad = []
    for t in range(len(team_df)):
        name = team_df["name"].values[t]
        initial_squad.append(players.index(name))
    print("initial_squad indices:", initial_squad)

    list1 = costs.copy()

    if is_first:
        budget_amount = 100  # TODO: adjust if needed
    else:
        selling_cost = team_df["selling_price_m"].values
        budget_amount = sum(selling_cost) + money_in_bank_init+0.01

        for i, idx in enumerate(initial_squad):
            list1[idx] = selling_cost[i]


    print("budget_amount:", budget_amount)
    print()

    initial_saved = initial_saved + n_hits
    print("HITS:", n_hits)
    print("initial_saved:", initial_saved)

    positions = data["position"].tolist()
    costs = data["value"].tolist()
    teams = data["team_code"].tolist()
    selected = pd.to_numeric(data["selected"], errors="coerce").fillna(0.0).to_numpy()
    point_std = pd.to_numeric(data["Point_STD"], errors="coerce").fillna(0.0).to_numpy()

    # make sure we have a plain numpy array for points
    predicted_points = data[GW_list].to_numpy(dtype=float)

    # ---------- Risk factor adjustment ----------
    # raw risk: higher std + lower ownership = riskier
    risk_raw = ((1 - selected) ** 2) * (1 + point_std)


    # clamp negatives so we don't reward ultra-template players as "negative risk"
    risk_raw = np.maximum(risk_raw, 0.0)

    # normalise risk to [0, 1] to make scaling stable
    if risk_raw.max() > 0:
        risk_norm = risk_raw 
    else:
        risk_norm = risk_raw  # all zero

    risk_factor_clean = (risk_factor or "med").strip().lower()

    if risk_factor_clean == "low":
        # risk-averse: DOWN-weight risky players
        mult = np.clip(1/(risk_norm), 0.45, 1.5)
    elif risk_factor_clean == "high":
        # risk-seeking: UP-weight risky players
        mult = np.clip(risk_norm, 0.9, 2.0)
    else:
        # "med": no risk adjustment
        mult = np.ones_like(risk_norm)

    # convert to 2D for broadcasting: (num_players, 1)
    mult_2d = mult[:, np.newaxis]

    # Apply risk multiplier per player across all GWs
    predicted_points = predicted_points * mult_2d
# -------------------------------------------


    optimize_range = len(GW_list)  # Number of gameweeks to optimize
    gameweeks = range(optimize_range)
    abs_gw_num = {
        t: (int(GW_list[t]) if str(GW_list[t]).isdigit() else None)
        for t in gameweeks
    }

    num_players = len(players)

    def_indices = [i for i, pos in enumerate(positions) if pos == "DEF"]
    gk_indices = [i for i, pos in enumerate(positions) if pos == "GKP"]
    mid_indices = [i for i, pos in enumerate(positions) if pos == "MID"]
    fwd_indices = [i for i, pos in enumerate(positions) if pos == "FWD"]
    outfield_indices = [i for i, pos in enumerate(positions) if pos != "GKP"]

    # Slightly penalize GK points
    for i in gk_indices:
        for t in range(optimize_range):
            predicted_points[i][t] *= 0.8

    teams_set = set(teams)
    team_to_indices = {
        team: [i for i, tcode in enumerate(teams) if tcode == team]
        for team in teams_set
    }

    model = LpProblem("Maximize_Predicted_Points", LpMaximize)

    x = {(i, t): LpVariable(f"x_{i}_{t}", cat="Binary")
         for i in range(num_players) for t in gameweeks}
    bench = {(i, t): LpVariable(f"bench_{i}_{t}", cat="Binary")
             for i in range(num_players) for t in gameweeks}
    c = {(i, t): LpVariable(f"captain_{i}_{t}", cat="Binary")
         for i in range(num_players) for t in gameweeks}
    y = {(i, t): LpVariable(f"y_{i}_{t}", cat="Binary")
         for i in range(num_players) for t in gameweeks}
    transfer_in = {(i, t): LpVariable(f"transfer_in_{i}_{t}", cat="Binary")
                   for i in range(num_players) for t in gameweeks}
    transfer_out = {(i, t): LpVariable(f"transfer_out_{i}_{t}", cat="Binary")
                    for i in range(num_players) for t in gameweeks}
    saved_transfers = {
        t: LpVariable(f"saved_transfers_{t}", lowBound=0, upBound=5, cat="Integer")
        for t in gameweeks
    }
    money_in_bank_var = {
        t: LpVariable(f"money_in_bank_{t}", lowBound=0, cat="Continuous")
        for t in gameweeks
    }

    # Initial squad at t=0
    for i in range(num_players):
        model += x[i, 0] == (1 if i in initial_squad else 0)

    # --- Objective Function ---
    obj = lpSum(
        (y[i, t] + c[i, t] + bench[i, t] * 0.05) * predicted_points[i][t]
        for i in range(num_players)
        for t in gameweeks
    ) + lpSum(
        0.15 * saved_transfers[t] for t in gameweeks
    )

    if bench_points_gw in gameweeks:
        obj += lpSum(
            bench[i, bench_points_gw] * predicted_points[i][bench_points_gw]
            for i in range(num_players)
        )

    model += obj

    # --- Position Constraints ---
    for t in gameweeks:
        model += lpSum(x[i, t] for i in range(num_players)) == 15
        model += lpSum(x[i, t] for i in def_indices) == 5
        model += lpSum(x[i, t] for i in gk_indices) == 2
        model += lpSum(x[i, t] for i in mid_indices) == 5
        model += lpSum(x[i, t] for i in fwd_indices) == 3
    #--Playing const
    for t in gameweeks:
    # Exactly 11 players
        model += lpSum(y[i, t] for i in range(num_players)) == 11

        # Position-wise FPL rules on the *starting XI*
        model += lpSum(y[i, t] for i in gk_indices) == 1
        model += lpSum(y[i, t] for i in def_indices) >= 3
        model += lpSum(y[i, t] for i in def_indices) <= 5
        model += lpSum(y[i, t] for i in mid_indices) >= 2
        model += lpSum(y[i, t] for i in mid_indices) <= 5
        model += lpSum(y[i, t] for i in fwd_indices) >= 1
        model += lpSum(y[i, t] for i in fwd_indices) <= 3

        # Link y ↔ x & bench
        for i in range(num_players):
            model += y[i, t] <= x[i, t]
            model += y[i, t] <= 1 - bench[i, t]
            model += y[i, t] >= x[i, t] - bench[i, t]

    # No immediate back-to-back transfers
    for t in range(1, optimize_range - 1):
        for i in range(num_players):
            model += transfer_in[i, t] + transfer_out[i, t + 1] <= 1

    # --- Bench Constraints ---
    for t in gameweeks:
        model += lpSum(bench[i, t] for i in gk_indices) == 1
        model += lpSum(bench[i, t] for i in outfield_indices) == 3
        for i in range(num_players):
            model += bench[i, t] <= x[i, t]

    # --- Playing Status Constraints ---
    for t in gameweeks:
        model += lpSum(y[i, t] for i in def_indices) >= 3
        for i in range(num_players):
            model += y[i, t] <= x[i, t]
            model += y[i, t] <= 1 - bench[i, t]
            model += y[i, t] >= x[i, t] - bench[i, t]

    # --- Captain Selection ---
    for t in gameweeks:
        model += lpSum(c[i, t] for i in range(num_players)) == 1
        for i in range(num_players):
            model += c[i, t] <= y[i, t]

    # --- Budget Constraints ---
    for t in gameweeks[1:]:
        model += money_in_bank_var[t] == money_in_bank_var[t - 1] + \
            lpSum(transfer_out[i, t] * list1[i] for i in range(num_players)) - \
            lpSum(transfer_in[i, t] * costs[i] for i in range(num_players))

    for t in gameweeks:
        model += lpSum(x[i, t] * list1[i] for i in range(num_players)) + \
            money_in_bank_var[t] <= budget_amount  # could be == if you want exact

    # --- Max 3 players per team ---
    for t in gameweeks:
        for team, indices in team_to_indices.items():
            model += lpSum(x[i, t] for i in indices) <= 3

    # --- Transfer Constraints ---
    for t in gameweeks[1:]:
        if t == wildcard_round_rel:
            # Wildcard round: unlimited transfers
            for i in range(num_players):
                model += x[i, t] >= x[i, t - 1] - transfer_out[i, t]
                model += x[i, t] <= x[i, t - 1] + transfer_in[i, t]
        else:
            for i in range(num_players):
                model += transfer_in[i, t] >= x[i, t] - x[i, t - 1]
                model += transfer_out[i, t] >= x[i, t - 1] - x[i, t]
                model += transfer_out[i, t] <= x[i, t - 1]
            model += lpSum(transfer_in[i, t] for i in range(num_players)) <= \
                1 + saved_transfers[t - 1]

    for t in gameweeks[1:]:
        if t == wildcard_round_rel:
            model += saved_transfers[t] == 0
        else:
            if abs_gw_num.get(t) == 40:#AFCON
                model += saved_transfers[t] == 5
            else:
                if t == week_to_remove_transfer:
                    model += saved_transfers[t] == saved_transfers[t - 1] + \
                        (1 - lpSum(transfer_in[i, t]
                         for i in range(num_players))) - 1
                else:
                    model += saved_transfers[t] == saved_transfers[t - 1] + \
                        (1 - lpSum(transfer_in[i, t]
                         for i in range(num_players)))
        model += saved_transfers[t] <= 5

    # --- Initial Transfers & Bank ---
    model += saved_transfers[0] == initial_saved
    model += money_in_bank_var[0] == money_in_bank_init

    # --- Solve the Model ---
    model.solve()
    records = []

    print(f"Status: {model.status}")
    if model.status == -1:
        return pd.DataFrame()

    # Debug: squad per GW
    for t in range(1, optimize_range):
        print(f"\nGameweek {t+1} Squad:")
        for i in range(num_players):
            if x[i, t].varValue > 0.5:
                status = "Bench" if bench[i, t].varValue > 0.5 else "Playing"
                print(f"- {players[i]} ({positions[i]}) - {status}")

    # Transfers in / out
    for t in range(1, optimize_range):
        for i in range(num_players):
            name = players[i]
            player_row_code = current_players[current_players["name"]
                                              == name]["code"].values[0]
            web_name = current_players[current_players["name"]
                                       == name]["web_name"].values[0]
            pos = positions[i]
            gw = GW_list[t]

            if gw != str(wildcard_round_rel):
                # transferred in
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

                # transferred out
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

    # Playing / benched / captain
    for t in range(1, optimize_range - 1):
        for i in range(num_players):
            name = players[i]
            player_row_code = current_players[current_players["name"]
                                              == name]["code"].values[0]
            pos = positions[i]
            gw = GW_list[t]
            is_capt = c[i, t].varValue > 0.5
            web_name = current_players[current_players["name"]
                                       == name]["web_name"].values[0]

            if x[i, t].varValue > 0.5:
                status = "benched" if bench[i, t].varValue > 0.5 else "playing"
                records.append({
                    "Name": name,
                    "status": status,
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{player_row_code}.png",
                    "Is_captain": bool(is_capt),
                    "web_name": web_name,
                })

    # Final structured DataFrame with objective value
    obj_val = float(value(model.objective)) + free_hit_val - n_hits * 4 * 0.8
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

    status_df = pd.DataFrame(records)
    return status_df


if __name__ == "__main__":
    optimize_my_team()
