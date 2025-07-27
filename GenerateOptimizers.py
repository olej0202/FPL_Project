import pandas as pd
import numpy as np
from pulp import LpMaximize, LpProblem, LpVariable, lpSum

import pandas as pd
import numpy as np
from pulp import LpMaximize, LpProblem, LpVariable, lpSum

def wildcard_optimize_team(sel_thresh, budget, columns, file_path="Model_Optimizer.csv", current_player_path="Raw_Data_25/current_players.csv"):
    # Load and preprocess data
    data = pd.read_csv(file_path)
    current_players=pd.read_csv(current_player_path)
    for col in columns:
        data[col] = np.where(
            data["offset"] < 1,
            data[col] * data["offset"],
            data[col] * data["minutes_multiplier"]
        )

    # Setup inputs
    players = data['name'].tolist()
    positions = data['position'].tolist()
    costs = data['value'].tolist()
    teams = data['team_code'].tolist()
    selected = data['selected'].tolist()
    predicted_points = data[columns].values

    GW_range = len(columns)
    gameweeks = range(GW_range)
    num_players = len(players)

    # Model setup
    model = LpProblem("Maximize_Predicted_Points", LpMaximize)

    # Variables
    x = {(i, t): LpVariable(cat='Binary', name=f"x_{i}_{t}") for i in range(num_players) for t in gameweeks}
    y = {(i, t): LpVariable(cat='Binary', name=f"y_{i}_{t}") for i in range(num_players) for t in gameweeks}
    bench = {(i, t): LpVariable(cat='Binary', name=f"bench_{i}_{t}") for i in range(num_players) for t in gameweeks}
    bench_gk = {t: LpVariable(cat='Binary', name=f"bench_gk_{t}") for t in gameweeks}
    transfer_in = {(i, t): LpVariable(cat='Binary', name=f"transfer_in_{i}_{t}") for i in range(num_players) for t in range(1, 8)}
    transfer_out = {(i, t): LpVariable(cat='Binary', name=f"transfer_out_{i}_{t}") for i in range(num_players) for t in range(1, 8)}
    saved_transfers = {t: LpVariable(cat='Integer', lowBound=0, upBound=3, name=f"saved_transfers_{t}") for t in range(8)}

    # Objective
    model += lpSum(y[i, t] * predicted_points[i][t] for i in range(num_players) for t in gameweeks)

    # Constraints
    for t in gameweeks:
        model += lpSum(y[i, t] for i in range(num_players) if positions[i] == 'DEF') == 3
        for i in range(num_players):
            model += y[i, t] <= x[i, t]
            model += y[i, t] <= 1 - bench[i, t]
            model += y[i, t] >= x[i, t] + (1 - bench[i, t]) - 1
            model += x[i, t] * selected[i] <= sel_thresh

        model += lpSum(x[i, t] * costs[i] for i in range(num_players)) <= budget
        for team in set(teams):
            model += lpSum(x[i, t] for i in range(num_players) if teams[i] == team) <= 3
        model += lpSum(x[i, t] for i in range(num_players)) == 15
        model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'DEF') == 5
        model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'GKP') == 2
        model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'MID') == 5
        model += lpSum(x[i, t] for i in range(num_players) if positions[i] == 'FWD') == 3

        model += lpSum(bench[i, t] for i in range(num_players) if positions[i] == 'GKP') == 1
        model += lpSum(bench[i, t] for i in range(num_players) if positions[i] != 'GKP') == 3
        for i in range(num_players):
            model += bench[i, t] <= x[i, t]

    # Transfers
    for t in range(1, GW_range):
        for i in range(num_players):
            model += transfer_in[i, t] >= x[i, t] - x[i, t - 1]
            model += transfer_out[i, t] >= x[i, t - 1] - x[i, t]
            model += transfer_out[i, t] <= x[i, t - 1]
        model += lpSum(transfer_in[i, t] for i in range(num_players)) <= 1 + saved_transfers[t - 1]
        model += saved_transfers[t] == saved_transfers[t - 1] + (1 - lpSum(transfer_in[i, t] for i in range(num_players)))
        model += saved_transfers[t] <= 3

    model += saved_transfers[0] == 0

    # Solve
    model.solve()
    records = []
    # Output
    print(f"Status: {model.status}")
    for t in gameweeks:
        print(f"\nGameweek {t+1} Squad:")
        for i in range(num_players):
            if x[i, t].varValue > 0.5:
                status = "Bench" if bench[i, t].varValue > 0.5 else "Playing"
                print(f"- {players[i]} ({positions[i]}) - {status}")

    for t in range(1, GW_range):
        for i in range(num_players):
            name = players[i]
            player_row_code = current_players[current_players["name"] == name]["code"].values[0]
            pos = positions[i]
            gw = columns[t]

            # transferred in
            if x[i, t].varValue > 0.5 and x[i, t-1].varValue < 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_in",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png",
                    "web_name": current_players[current_players["name"] == name]["web_name"].values[0]
                })

            # transferred out
            if x[i, t].varValue < 0.5 and x[i, t-1].varValue > 0.5:
                records.append({
                    "Name": name,
                    "status": "transferred_out",
                    "GW": gw,
                    "position": pos,
                    "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png",
                    "web_name": current_players[current_players["name"] == name]["web_name"].values[0]
                })


    for t in gameweeks:
        for i in range(num_players):
            name = players[i]
            player_row_code=current_players[current_players["name"]==name]["code"].values[0]
            pos = positions[i]
            gw =columns[ t] # Transfers affect upcoming GW

            if x[i, t].varValue > 0.5:
                if bench[i, t].varValue > 0.5:
                    status = "benched"
                else:
                    status = "playing"
                records.append({"Name": name, "status": status, "GW": gw, "position": pos, "photo":f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png"
                                ,"web_name": current_players[current_players["name"] == name]["web_name"].values[0]})
    """
    for t in range(1, GW_range):
        for i in range(num_players):
            name = players[i]
            player_row_code=current_players[current_players["name"]==name]["code"].values[0]
            pos = positions[i]
            gw =columns[ t] # Transfers affect upcoming GW

            if transfer_in[i, t].varValue > 0.5:
                records.append({"Name": name, "status": "transferred_in", "GW": gw, "position": pos, "photo":f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png"})
            if transfer_out[i, t].varValue > 0.5:
                records.append({"Name": name, "status": "transferred_out", "GW": gw, "position": pos, "photo":f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png"})"""

    # Final structured DataFrame
    status_df = pd.DataFrame(records)
    status_df.to_csv("Wildcard_team.csv")
    print(status_df)

    

    
def freeHit_optimize_team(sel_thresh, budget, columns, file_path="Model_Optimizer.csv", current_player_path="Raw_Data_25/current_players.csv"):

    data = pd.read_csv(file_path)
    cols = columns
    for col in cols:
        data[col] = np.where(data["offset"] < 1, data[col] * data["offset"], data[col] * data["minutes_multiplier"])
    budget = budget
    sel_tresh = sel_thresh
    players = data['name'].tolist()
    positions = data['position'].tolist()
    costs = data['value'].tolist()
    teams = data['team_code'].tolist() 
    selected = data['selected'].tolist() 
    predicted_points = data[cols].values.flatten()  # Only use 'p1' for Gameweek 1

    not_sel_list=[]

    num_players = len(players)

    # Define Model
    model = LpProblem("Maximize_Predicted_Points_One_Round", LpMaximize)

    # Decision Variables
    x = {i: LpVariable(cat='Binary', name=f"x_{i}") for i in range(num_players)}  # Selected players
    bench = {i: LpVariable(cat='Binary', name=f"bench_{i}") for i in range(num_players)}  # Bench players
    y = {i: LpVariable(cat='Binary', name=f"y_{i}") for i in range(num_players)}  # Playing players

    # Objective: Maximize Total Points for Gameweek 1
    model += lpSum(y[i] * predicted_points[i] for i in range(num_players))

    # Ensure y is 1 only when player is in the squad and not benched
    for i in range(num_players):
        model += y[i] <= x[i]               # Can only play if selected in squad
        model += y[i] <= 1 - bench[i]        # Can't play if benched
        model += y[i] >= x[i] + (1 - bench[i]) - 1  # Consistency


    for i in range(num_players):
            model += x[i] * selected[i] <= sel_tresh


    model += lpSum(y[i] for i in range(num_players) if positions[i] == 'DEF') == 3

    # Budget Constraint
    model += lpSum(x[i] * costs[i] for i in range(num_players)) <= budget

    # Max 3 Players per Team Constraint
    for team in set(teams):
        model += lpSum(x[i] for i in range(num_players) if teams[i] == team) <= 3

    # Total Players Constraint (15 players in squad)
    model += lpSum(x[i] for i in range(num_players)) == 15

    # Position Constraints
    model += lpSum(x[i] for i in range(num_players) if positions[i] == 'DEF') == 5  # 5 Defenders
    model += lpSum(x[i] for i in range(num_players) if positions[i] == 'GKP') == 2   # 2 Goalkeepers
    model += lpSum(x[i] for i in range(num_players) if positions[i] == 'MID') == 5  # 5 Midfielders
    model += lpSum(x[i] for i in range(num_players) if positions[i] == 'FWD') == 3  # 3 Attackers

    # Bench Constraints
    model += lpSum(bench[i] for i in range(num_players) if positions[i] == 'GKP') == 1  # Exactly 1 GK on bench
    model += lpSum(bench[i] for i in range(num_players) if positions[i] != 'GKP') == 3  # Exactly 3 outfield players on bench

    # A player can only be benched if they are in the squad
    for i in range(num_players):
        model += bench[i] <= x[i]

    # Solve the Model
    model.solve()

    # Check the status of the solution
    print(f"Status: {model.status}")

    # Display selected players
    result_set=[]
    print("\nGameweek 1 Squad:")
    current_players=pd.read_csv("Raw_Data_25/current_players.csv")
    for i in range(num_players):
        player_set=[]
        if x[i].varValue > 0.5:
            try:
                player_row=current_players[current_players["name"]==players[i]]["code"].values[0]
            except:
                player_row=current_players[current_players["name"]==players[i][:-1]]["code"].values[0]
            status = "Bench" if bench[i].varValue > 0.5 else "Playing"
            print(f"- {players[i]} ({positions[i]}) - {status}")
            player_set.append(players[i])
            player_set.append(positions[i])
            player_set.append(status)
            player_set.append(f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row}.png")
            player_set.append(columns[0])
            player_set.append(current_players[current_players["name"]==players[i]]["code"].values[0])
            result_set.append(player_set)
            
    columns=["Name", "position", "status","photo", "GW","web_name"]

    result_df=pd.DataFrame(result_set,columns=columns)
    result_df.to_csv("Free_hit_team.csv")
    print(result_df)


def generate_optimizers(ownership, budget, GW_list_wildcard, GW_list_freehit):
    wildcard_optimize_team(ownership, budget, GW_list_wildcard)
    freeHit_optimize_team(ownership, budget, GW_list_freehit)
    
    
if __name__ == "__main__":
    generate_optimizers(0.9,102,['37','38'],['37'] )