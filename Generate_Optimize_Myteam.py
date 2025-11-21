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


def get_transfers(team_id: int):
    transfers_url = f"https://fantasy.premierleague.com/api/entry/{team_id}/transfers/"
    response_transfers = requests.get(transfers_url)
    print(response_transfers)

    if response_transfers.status_code != 200:
        print(f"Error fetching transfers (Status Code: {response_transfers.status_code})")
        return None

    return response_transfers.json()


def played_free_hit(team_id: int) -> int:
    url = f"https://fantasy.premierleague.com/api/entry/{team_id}/history/"
    resp = requests.get(url)
    if resp.status_code == 200:
        chip_data = resp.json()
        chips = chip_data.get("chips", [])
        freehit = next((c for c in chips if c.get("name") == "freehit"), None)
        if freehit:
            return freehit.get("event")
        return 39
    # fallback
    return 39


def initial_transfers(df: pd.DataFrame, max_event: int) -> int:
    """
    df: DataFrame with columns ['event', 'count'] where each row is the number of transfers made in that GW.
    max_event: last completed GW (e.g., 16 means we've just processed GW16).
    Returns the saved-transfers bank after simulating up through max_event.
    """
    transfers1 = df
    saved_transfers = 0
    last_event = 0

    for _ in range(max_event):
        new_event = last_event + 1

        # Apply weekly effect
        if new_event in transfers1["event"].values:
            transfers_made = int(
                transfers1.loc[transfers1["event"] == new_event, "count"].iloc[0]
            )
            saved_transfers = max(0, saved_transfers - transfers_made)
        else:
            saved_transfers += 1

        # Bump occurs *after GW16*, i.e. at the transition into GW17
        if new_event == 16:
            saved_transfers = 5

        # FPL cap each week
        saved_transfers = min(saved_transfers, 5)

        last_event = new_event

    return saved_transfers


def get_my_team(team_id: int = 46805, Last_GW: int = 4):
    team_transfers = get_transfers(team_id)
    df = pd.DataFrame(team_transfers)
    hit = 0

    free_hit_gw_played = played_free_hit(team_id)
    print("free_hit_gw_played:", free_hit_gw_played)

    try:
        df = df[df["event"] != free_hit_gw_played]
        transfers1 = df.groupby("event").size().reset_index(name="count")

        max_event = Last_GW
        saved_transfers = initial_transfers(transfers1, max_event)
        initial_saved = saved_transfers + hit

        active = []
        for i in range(len(df["element_in"])):
            element_in = df["element_in"].values[-i - 1]
            out_list = df["element_out"].values[0 : -i - 1]
            active.append(0 if (element_in in out_list) else 1)
        df["Active"] = list(reversed(active))

        df = df[df["Active"] == 1]
        df = df[["element_in", "element_in_cost"]]

        if Last_GW == free_hit_gw_played:
            gameweek = Last_GW - 1
            initial_saved -= 1
        else:
            gameweek = Last_GW
    except Exception:
        df = pd.DataFrame()
        # Approximate bank if we couldn't fetch history:
        if Last_GW >= 16:
            approx_bank = 5
        else:
            approx_bank = min(5, Last_GW)
        saved_transfers = max(
            0, approx_bank - 1
        )  # bank at t=0 will be for the *upcoming* GW
        gameweek = Last_GW
        initial_saved = saved_transfers + hit

    url = f"https://fantasy.premierleague.com/api/entry/{team_id}/event/{gameweek}/picks/"
    response = requests.get(url)

    if response.status_code == 200:
        team_selection = response.json()
        picks = team_selection.get("picks")  # View the JSON response
        pick_df = pd.DataFrame(picks)
        print(pick_df)
    else:
        print(
            f"Error fetching team selection (Status Code: {response.status_code})"
        )
        pick_df = pd.DataFrame()

    # Merge picks into df
    for g in range(len(pick_df)):
        element = pick_df["element"].values[g]
        if len(df) > 0:
            if element not in df["element_in"].values:
                new_row = pd.DataFrame(
                    {"element_in": [element], "element_in_cost": [np.nan]},
                    index=[len(df)],
                )
                df = pd.concat([df, new_row], ignore_index=True)
        else:
            new_row = pd.DataFrame(
                {"element_in": [element], "element_in_cost": [np.nan]},
                index=[len(df)],
            )
            df = pd.concat([df, new_row], ignore_index=True)

    print(df)

    data = pd.read_csv("Raw_Data_25/current_players.csv")
    data = data[["name", "id", "now_cost"]].rename(
        columns={"name": "Full_Name", "now_cost": "value"}
    )

    team_df = pd.merge(df, data, left_on="element_in", right_on="id", how="left")

    team_df["element_in_cost"] = team_df["element_in_cost"].fillna(team_df["value"])
    team_df["selling_price_value"] = np.floor(
        (team_df["value"] - team_df["element_in_cost"]) / 2
    ).clip(lower=0)
    team_df["selling_price"] = (
        team_df[["value", "element_in_cost"]].min(axis=1)
        + team_df["selling_price_value"]
    ) / 10

    team_df = team_df[team_df["element_in_cost"] > 30]

    return initial_saved, team_df


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
    if is_first:
        initial_saved = 1
        squad = pd.read_csv("Free_hit_team.csv")
        squad["Full_Name"] = squad["Name"].values
        money_in_bank_init = 0  # TODO: adjust if needed
    else:
        initial_saved, squad = get_my_team(team_id, Last_GW=Last_GW)
        print("SAVED:", initial_saved)

        url = f"https://fantasy.premierleague.com/api/entry/{team_id}/"
        response = requests.get(url)
        if response.status_code == 200:
            response_data = response.json()
        else:
            print(f"Error fetching data (Status Code: {response.status_code})")
            response_data = {}

        money_in_bank_init = response_data.get("last_deadline_bank", 0) / 10
        print("money_in_bank_init:", money_in_bank_init)

    players = data["name"].tolist()
    costs = data["value"].tolist()

    initial_squad = []
    for t in range(len(squad)):
        name = squad["Full_Name"].values[t]
        initial_squad.append(players.index(name))
    print("initial_squad indices:", initial_squad)
    print(squad)

    list1 = costs.copy()

    if is_first:
        budget_amount = 100  # TODO: adjust if needed
    else:
        selling_cost = squad["selling_price"].values
        budget_amount = sum(selling_cost) + money_in_bank_init

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
    selected = data["selected"].tolist()

    predicted_points = data[GW_list].values

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
            if abs_gw_num.get(t) == 17:
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
                        "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png",
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
                        "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png",
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
                    "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png",
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
