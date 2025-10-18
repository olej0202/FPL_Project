import numpy as np
import pandas as pd
from pulp import *

def wildcard_optimize_team_shocks(
    sel_thresh,
    budget,
    columns,
    file_path="Model_Optimizer.csv",
    current_player_path="Raw_Data_25/current_players.csv",
    robust_trials=5,
    jitter_min=0.8,
    jitter_max=1.3,
    rng_seed=42,
    # NEW: lock by selection frequency (from robustness trials)
    lock_from_freq=True,
    lock_counts={"FWD": 2, "MID": 3, "DEF": 3},
    lock_scope="t0",                 # "t0" = only GW1, "all" = every GW
    lock_as_starters=False           # also force into XI for the lock_scope
):
    # ---------- Load & preprocess ----------
    data = pd.read_csv(file_path)
    current_players = pd.read_csv(current_player_path)

    for col in columns:
        data[col] = np.where(
            data["offset"] < 1,
            data[col] * data["offset"],
            data[col] * data["minutes_multiplier"]
        )

    players   = data['name'].tolist()
    positions = data['position'].tolist()
    costs     = data['value'].tolist()
    teams     = data['team_code'].tolist()
    selected  = data['selected'].tolist()

    GW_range = len(columns)
    gameweeks = range(GW_range)
    num_players = len(players)

    # baseline matrix (P x T)
    predicted_points_base = data[columns].values.astype(float)

    # >>> NEW: per-player std factor (P x 1), used only during robustness trials
    # Scales each player's random multiplier by (1 + Point_STD/2).
    # Missing/NaN std is treated as 0.
    if 'Point_STD' in data.columns:
        player_std = data['Point_STD'].fillna(0).astype(float).to_numpy()
    else:
        player_std = np.zeros(num_players, dtype=float)
    player_std_factor = np.maximum(player_std / 2.0,1)[:, None]  # shape (P, 1), broadcasts over GWs

    def solve_once(predicted_points, locked_idx=None):
        """Build and solve the model once for a given P x T predicted_points, honoring optional locks."""
        model = LpProblem("Maximize_Predicted_Points", LpMaximize)

        # Vars
        x = {(i, t): LpVariable(cat='Binary', name=f"x_{i}_{t}") for i in range(num_players) for t in gameweeks}
        y = {(i, t): LpVariable(cat='Binary', name=f"y_{i}_{t}") for i in range(num_players) for t in gameweeks}
        bench = {(i, t): LpVariable(cat='Binary', name=f"bench_{i}_{t}") for i in range(num_players) for t in gameweeks}
        bench_gk = {t: LpVariable(cat='Binary', name=f"bench_gk_{t}") for t in gameweeks}
        transfer_in = {(i, t): LpVariable(cat='Binary', name=f"transfer_in_{i}_{t}") for i in range(num_players) for t in range(1, 8)}
        transfer_out = {(i, t): LpVariable(cat='Binary', name=f"transfer_out_{i}_{t}") for i in range(num_players) for t in range(1, 8)}
        saved_transfers = {t: LpVariable(cat='Integer', lowBound=0, upBound=4, name=f"saved_transfers_{t}") for t in range(8)}
        capt = {(i, t): LpVariable(cat="Binary", name=f"capt_{i}_{t}") for i in range(num_players) for t in gameweeks}

        # Objective
        model += (
            lpSum(y[i, t] * predicted_points[i][t] for i in range(num_players) for t in gameweeks)
            + lpSum(bench[i, t] * 0.05 * predicted_points[i][t] for i in range(num_players) for t in gameweeks)
            + lpSum(0.15 * saved_transfers[t] for t in gameweeks)
            + lpSum(capt[i, t] * predicted_points[i][t] for i in range(num_players) for t in gameweeks)
        )

        # Constraints
        for t in gameweeks:
            model += lpSum(y[i, t] for i in range(num_players) if positions[i] == 'DEF') == 3
            model += lpSum(capt[i, t] for i in range(num_players)) == 1

            for i in range(num_players):
                model += y[i, t] <= x[i, t]
                model += y[i, t] <= 1 - bench[i, t]
                model += y[i, t] >= x[i, t] + (1 - bench[i, t]) - 1
                model += x[i, t] * selected[i] <= sel_thresh
                model += capt[i, t] <= y[i, t]

            model += lpSum(x[i, t] * costs[i] for i in range(num_players)) <= budget

            for team in set(teams):
                model += lpSum(x[i, t] for i in range(num_players) if teams[i] == team) <= 3
                model += lpSum(x[i, t] for i in range(num_players) if teams[i] == team and positions[i] in ("GKP", "DEF")) <= 2

            model += lpSum(x[i, t] for i in range(num_players)) == 15
            model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'DEF') == 5
            model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'GKP') == 2
            model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'MID') == 5
            model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'FWD') == 3

            model += lpSum(bench[i, t] for i in range(num_players) if positions[i] == 'GKP') == 1
            model += lpSum(bench[i, t] for i in range(num_players) if positions[i] != 'GKP') == 3

            for i in range(num_players):
                model += bench[i, t] <= x[i, t]

        # No immediate transfers
        for t in range(1, GW_range-1):
            for i in range(num_players):
                model += transfer_in[i, t] + transfer_out[i, t+1] <= 1

        # Transfers over time
        for t in range(1, GW_range):
            for i in range(num_players):
                model += transfer_in[i, t] >= x[i, t] - x[i, t - 1]
                model += transfer_out[i, t] >= x[i, t - 1] - x[i, t]
                model += transfer_out[i, t] <= x[i, t - 1]
            model += lpSum(transfer_in[i, t] for i in range(num_players)) <= 1 + saved_transfers[t - 1]
            model += saved_transfers[t] == saved_transfers[t - 1] + (1 - lpSum(transfer_in[i, t] for i in range(num_players)))
            model += saved_transfers[t] <= 3

        model += saved_transfers[0] == 0

        # ---- LOCKS from selected_freq (if provided) ----
        if locked_idx:
            lock_times = ([0] if lock_scope == "t0" else list(gameweeks))
            for i in locked_idx:
                for t in lock_times:
                    model += x[i, t] == 1
                    if lock_as_starters:
                        model += y[i, t] == 1

        # Solve
        model.solve(PULP_CBC_CMD(msg=False))

        # Collect basic outputs
        total_obj = value(model.objective)
        x_val = {(i, t): int(value(x[i, t]) > 0.5) for i in range(num_players) for t in gameweeks}
        bench_val = {(i, t): int(value(bench[i, t]) > 0.5) for i in range(num_players) for t in gameweeks}
        capt_val = {(i, t): int(value(capt[i, t]) > 0.5) for i in range(num_players) for t in gameweeks}

        return total_obj, x_val, bench_val, capt_val, model.status

    # ---------- Baseline run ----------
    baseline_obj, baseline_x, baseline_bench, baseline_capt, _ = solve_once(predicted_points_base)

    # ---------- Robustness trials to build freq_df ----------
    results = []
    sel_counts = np.zeros((num_players, GW_range), dtype=int)
    capt_counts = np.zeros((num_players, GW_range), dtype=int)
    freq_df = None

    if robust_trials and robust_trials > 0:
        rng = np.random.default_rng(rng_seed)
        for s in range(robust_trials):
            print(s)
            # Random jitter per player x GW
            multipliers = rng.uniform(jitter_min, jitter_max, size=(num_players, GW_range))
            # >>> apply per-player variance scaling
            predicted_points_sim = predicted_points_base *(1+((multipliers-1)*player_std_factor))

            total_obj, x_val, _, capt_val, _ = solve_once(predicted_points_sim)
            results.append(total_obj)

            for i in range(num_players):
                for t in range(GW_range):
                    sel_counts[i, t] += x_val[(i, t)]
                    capt_counts[i, t] += capt_val[(i, t)]

        freq_df = pd.DataFrame({
            "name": np.repeat(players, GW_range),
            "position": np.repeat(positions, GW_range),
            "gw": np.tile(columns, num_players),
            "selected_freq": sel_counts.flatten() / robust_trials,
            "captain_freq":  capt_counts.flatten() / robust_trials
        })
        freq_df.to_csv("robust_selection_frequencies.csv", index=False)

    # ---------- Build locks from freq_df (top by selected_freq) ----------
    locked_idx = []
    locked_table = None
    if lock_from_freq:
        if freq_df is None:
            raise ValueError("robust_trials must be > 0 to compute freq-based locks.")
        # average selection frequency across GWs per player
        agg = (
            freq_df.groupby(["name", "position"], as_index=False)["selected_freq"]
            .mean()
            .rename(columns={"selected_freq": "sel_freq_mean"})
        )

        # pick top K per position
        locked_rows = []
        for pos, k in lock_counts.items():
            sub = agg[agg["position"] == pos]
            if sub.empty:
                continue
            topk = sub.nlargest(k, "sel_freq_mean")
            locked_rows.append(topk)

        locked_table = pd.concat(locked_rows) if locked_rows else pd.DataFrame(columns=agg.columns)

        # map names -> indices
        name_to_idx = {n: i for i, n in enumerate(players)}
        locked_idx = [name_to_idx[n] for n in locked_table["name"].tolist() if n in name_to_idx]

    # ---------- Final optimization with locks applied ----------
    final_obj, final_x, final_bench, final_capt, final_status = solve_once(
        predicted_points_base, locked_idx=locked_idx if lock_from_freq else None
    )

    cp_map = current_players.set_index("name")[["code", "team_code", "web_name"]].to_dict("index")
    def get_meta(n, key, default=np.nan):
        rec = cp_map.get(n, None)
        return rec.get(key, default) if rec is not None else default

    records = []

    # Print GW squads
    for t in gameweeks:
        print(f"\nGameweek {t+1} Squad:")
        for i in range(num_players):
            if final_x[(i, t)] == 1:
                status = "Bench" if final_bench[(i, t)] == 1 else "Playing"
                print(f"- {players[i]} ({positions[i]}) - {status}")

    # Transfers in/out based on final_x transitions
    for t in range(1, GW_range):
        for i in range(num_players):
            name = players[i]
            pos = positions[i]
            gw = columns[t]
            teamCode = get_meta(name, "team_code")
            web_name = get_meta(name, "web_name")

            # transferred in
            if final_x[(i, t)] == 1 and final_x[(i, t-1)] == 0:
                records.append({
                    "Name": name,
                    "status": "transferred_in",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{teamCode}-110.png",
                    "web_name": web_name,
                    "Is_captain": False
                })

            # transferred out
            if final_x[(i, t)] == 0 and final_x[(i, t-1)] == 1:
                records.append({
                    "Name": name,
                    "status": "transferred_out",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{teamCode}-110.png",
                    "web_name": web_name,
                    "Is_captain": False
                })

    # Playing/benched + captain per GW (final plan)
    for t in gameweeks:
        for i in range(num_players):
            if final_x[(i, t)] == 1:
                name = players[i]
                pos = positions[i]
                gw = columns[t]
                teamCode = get_meta(name, "team_code")
                web_name = get_meta(name, "web_name")
                is_capt = final_capt[(i, t)] == 1

                status = "benched" if final_bench[(i, t)] == 1 else "playing"
                records.append({
                    "Name": name,
                    "status": status,
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{teamCode}-110.png",
                    "web_name": web_name,
                    "Is_captain": bool(is_capt)
                })

    # Final structured DataFrame for FINAL run
    final_status_df = pd.DataFrame(records)
    final_status_df.to_csv("Wildcard_team.csv", index=False)

    print(f"\nFinal solve status: {final_status} | Final objective: {final_obj:.2f}")

    # Return anything you need downstream:
    return {
        "baseline_obj": baseline_obj,
        "final_obj": final_obj,
        "final_status": final_status,
        "locked_table": locked_table,
        "freq_df": freq_df,
        "final_x": final_x,
        "final_bench": final_bench,
        "final_capt": final_capt,
        "players": players,
        "positions": positions,
        "columns": columns,
    }

