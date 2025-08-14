import pandas as pd
import numpy as np
from pulp import LpMaximize, LpProblem, LpVariable, lpSum
import requests
import os



def get_transfers(team_id):
    transfers_url = f"https://fantasy.premierleague.com/api/entry/{team_id}/transfers/"
    response_transfers = requests.get(transfers_url)

    if response_transfers.status_code != 200:
        print(f"Error fetching transfers (Status Code: {response_transfers.status_code})")
        return None

    transfers_data = response_transfers.json()
    return transfers_data

def played_free_hit(team_id):
    url = f"https://fantasy.premierleague.com/api/entry/{team_id}/history/"
    resp = requests.get(url)
    if resp.status_code == 200:
        chip_data = resp.json()
        chips = chip_data.get("chips", [])
    # find the Free Hit chip
        freehit = next((c for c in chips if c.get("name") == "freehit"), None)
        if freehit:
            free_hit_gw_played = freehit.get("event")
        else:
            free_hit_gw_played=39
    return free_hit_gw_played

def initial_transfers(df,max_event):
    transfers1=df
    saved_transfers = 0
    last_event = 0

    for h in range(max_event):
        new_event = last_event + 1
        if new_event in transfers1["event"].values:
            ind = transfers1["event"].tolist().index(new_event)
            transfers_made = transfers1["count"].values[ind]
            saved_transfers = saved_transfers - transfers_made
            saved_transfers = max(0, saved_transfers)
        else:
            saved_transfers += 1
        last_event = new_event
    return saved_transfers
    

def get_my_team(team_id=1,Last_GW=0):
    team_id=team_id

    Last_GW=Last_GW
    hit=0

    team_transfers = get_transfers(team_id)

    df = pd.DataFrame(team_transfers)

    free_hit_gw_played=played_free_hit(team_id)


    df=df[df["event"]!=free_hit_gw_played]
    
    transfers1 = df.groupby('event').size().reset_index(name='count')

    max_event = Last_GW
    
    saved_transfers=initial_transfers(transfers1,max_event)

    initial_saved=saved_transfers+hit


    active=[]
    for i in range(len(df["element_in"])):
        element_in=df["element_in"].values[-i-1]
        out_list=df["element_out"].values[0:-i-1]

        if(element_in in out_list):
            active.append(0)
        else:
            active.append(1)
    df["Active"]= list(reversed(active))
    
    df=df[df["Active"]==1]
    

    df=df[["element_in", "element_in_cost"]]
    

    if(Last_GW==free_hit_gw_played):
        gameweek = Last_GW-1
        initial_saved-=1
    else:
        gameweek = Last_GW  # Replace with the desired gameweek

    url = f"https://fantasy.premierleague.com/api/entry/{team_id}/event/{gameweek}/picks/"

    response = requests.get(url)

    if response.status_code == 200:
        team_selection = response.json()
        picks=team_selection.get("picks")  # View the JSON response
        pick_df = pd.DataFrame(picks)
    
    else:
        print(f"Error fetching team selection (Status Code: {response.status_code})")

    for g in range(len(pick_df)):
        element=pick_df["element"].values[g]
        
        """if(element not in df["element_in"].values):
            new_row = pd.DataFrame({'element_in': [element], 'element_in_cost': [np.nan]}, index=[len(df)])
            print("NewRow")
            print(new_row)
            df = pd.concat([df, new_row], ignore_index=True)"""

    data=pd.read_csv("Raw_Data_24/Fantasy_season_2024_data.csv")
    data=data[["Full_Name","element", "value", "kickoff_time"]]
    data['kickoff_time'] = pd.to_datetime(data['kickoff_time'])
    result = data.loc[data.groupby('Full_Name')['kickoff_time'].idxmax(), ['Full_Name','element', 'value', 'kickoff_time']]

    team_df=pd.merge(df, result, left_on='element_in', right_on='element', how='left')

    team_df['element_in_cost'] = team_df['element_in_cost'].fillna(team_df['value'])
    team_df["selling_price_value"] = np.floor((team_df["value"] - team_df["element_in_cost"]) / 2).clip(lower=0)
    team_df["selling_price"] = (team_df[["value", "element_in_cost"]].min(axis=1)+team_df["selling_price_value"])/10
    team_df=team_df[team_df["element_in_cost"]>30]
    
    return initial_saved, team_df




def optimize_my_team(team_id=1,wildcard_round=40, bb_round=40,Last_GW=0,banned_list=[],GW_list=["0","1", "2","3","4","5","6","7","8"], current_player_path="Raw_Data_25/current_players.csv"):

    current_players = pd.read_csv(current_player_path)
    is_first=False
    if "1" in GW_list:
        is_first=True

    team_id=team_id

    wildcard_round = wildcard_round  # Gameweek 3 (Index t=2)
    if(is_first):
        wildcard_round = 1  # Gameweek 3 (Index t=2)
    bench_points_gw=bb_round
    Last_GW=Last_GW
    hit=0
    banned_list=banned_list
# Load Data
    data = pd.read_csv("Model_Optimizer.csv")
    #data = data[~data["name"].isin(banned_list)]
    cols = GW_list
    for col in cols:
        data[col] = np.where(data["offset"] < 1, data[col] * data["offset"], data[col] * data["minutes_multiplier"])
        
    banned_mask = data["name"].isin(banned_list)
    for col in cols:
        data[col] = np.where(
            banned_mask,
            0,
            np.where(
                data["offset"] < 1,
                data[col] * data["offset"],
                data[col] * data["minutes_multiplier"]
            )
        )
    
    
    """**********************************************************"""
    if(is_first):
        initial_saved=1
        squad=pd.read_csv("Free_hit_team.csv")
        squad["Full_Name"]=squad["Name"].values
        money_in_bank_init=0 ## Fjern
        
        
    else:
        initial_saved,squad=get_my_team(team_id,Last_GW=Last_GW)
        url = f"https://fantasy.premierleague.com/api/entry/{team_id}/"
        response = requests.get(url)
        if response.status_code == 200:
            resonsep_data = response.json()
    
        else:
            print(f"Error fetching data (Status Code: {response.status_code})")

        money_in_bank_init = resonsep_data.get("last_deadline_bank", 0)/10

    


    players = data['name'].tolist()
    costs = data['value'].tolist()
    initial_squad=[]
    for t in range (len(squad)):
        name=squad["Full_Name"].values[t]
        initial_squad.append(players.index(name))

    
    list1 = costs.copy()
    
    if( is_first):
        budget_amount=100 ##Fjern
        
    else:
        selling_cost = squad["selling_price"].values
        budget_amount=sum(selling_cost)+money_in_bank_init


        for i in range(len(initial_squad)):
            list1[initial_squad[i]] = selling_cost[i]
        

    positions = data['position'].tolist()
    costs = data['value'].tolist()
    teams = data['team_code'].tolist()
    selected = data['selected'].tolist() 
    predicted_points = data[GW_list].values

    optimize_range = len(GW_list) # Number of gameweeks to optimize
    gameweeks = range(optimize_range)
    num_players = len(players)

    def_indices   = [i for i, pos in enumerate(positions) if pos == 'DEF']
    gk_indices    = [i for i, pos in enumerate(positions) if pos == 'GKP']
    
    for i in gk_indices:
        for t in range(optimize_range):
            predicted_points[i][t] *= 0.8
            
    mid_indices   = [i for i, pos in enumerate(positions) if pos == 'MID']
    fwd_indices   = [i for i, pos in enumerate(positions) if pos == 'FWD']
    outfield_indices = [i for i, pos in enumerate(positions) if pos != 'GKP']

    teams_set = set(teams)
    team_to_indices = {team: [i for i, t in enumerate(teams) if t == team] for team in teams_set}

    model = LpProblem("Maximize_Predicted_Points", LpMaximize)

    x            = {(i, t): LpVariable(f"x_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    bench        = {(i, t): LpVariable(f"bench_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    c            = {(i, t): LpVariable(f"captain_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    y            = {(i, t): LpVariable(f"y_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    transfer_in  = {(i, t): LpVariable(f"transfer_in_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    transfer_out = {(i, t): LpVariable(f"transfer_out_{i}_{t}", cat='Binary') for i in range(num_players) for t in gameweeks}
    saved_transfers   = {t: LpVariable(f"saved_transfers_{t}", lowBound=0, upBound=5, cat='Integer') for t in gameweeks}
    money_in_bank_var = {t: LpVariable(f"money_in_bank_{t}", lowBound=0, cat='Continuous') for t in gameweeks}

    for i in range(num_players):
        model += x[i, 0] == (1 if i in initial_squad else 0)

    # --- Objective Function ---
    # (Bench points term is added only if bench_points_gw is in the gameweek range)
    obj = lpSum((y[i, t] + c[i, t]+bench[i, t] * 0.05) * predicted_points[i][t] 
                for i in range(num_players) for t in gameweeks)+ lpSum(
        0.2 * saved_transfers[t]
        for t in gameweeks
    )
    if bench_points_gw in gameweeks:
        obj += lpSum(bench[i, bench_points_gw] * predicted_points[i][bench_points_gw] 
                     for i in range(num_players))
    model += obj

    # --- Position Constraints ---
    for t in gameweeks:
        model += lpSum(x[i, t] for i in range(num_players)) == 15
        model += lpSum(x[i, t] for i in def_indices) == 5
        model += lpSum(x[i, t] for i in gk_indices) == 2
        model += lpSum(x[i, t] for i in mid_indices) == 5
        model += lpSum(x[i, t] for i in fwd_indices) == 3

    
    #No imidiate transfers        
    for t in range(1, optimize_range-1):
        for i in range(num_players):
            # if they come in at t, they cannot go out at t+1
            model += transfer_in[i, t] + transfer_out[i, t+1] <= 1
            
    # --- Bench Constraints ---
    for t in gameweeks:
        model += lpSum(bench[i, t] for i in gk_indices) == 1
        model += lpSum(bench[i, t] for i in outfield_indices) == 3
        for i in range(num_players):
            model += bench[i, t] <= x[i, t]

    # --- Playing Status Constraints ---
    for t in gameweeks:
        # Ensure at least 3 defenders are in the starting XI
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
    # Update money in bank for t >= 1
    for t in gameweeks[1:]:
        model += money_in_bank_var[t] == money_in_bank_var[t-1] + \
                 lpSum(transfer_out[i, t] * list1[i] for i in range(num_players)) - \
                 lpSum(transfer_in[i, t] * costs[i] for i in range(num_players))
    # For each gameweek, squad value (using list1) plus money in bank equals available funds.
    for t in gameweeks:
        model += lpSum(x[i, t] * list1[i] for i in range(num_players)) + money_in_bank_var[t] <= budget_amount ##Endre til ==

    # --- Maximum 3 Players per Team ---
    for t in gameweeks:
        for team, indices in team_to_indices.items():
            model += lpSum(x[i, t] for i in indices) <= 3

    # --- Transfer Constraints ---
    for t in gameweeks[1:]:
        if t == wildcard_round:
            # Wildcard round: unlimited transfers
            for i in range(num_players):
                model += x[i, t] >= x[i, t-1] - transfer_out[i, t]
                model += x[i, t] <= x[i, t-1] + transfer_in[i, t]
        else:
            # Normal transfer constraints
            for i in range(num_players):
                model += transfer_in[i, t] >= x[i, t] - x[i, t-1]
                model += transfer_out[i, t] >= x[i, t-1] - x[i, t]
                model += transfer_out[i, t] <= x[i, t-1]
            model += lpSum(transfer_in[i, t] for i in range(num_players)) <= 1 + saved_transfers[t-1]

    for t in gameweeks[1:]:
        if t == wildcard_round:
            model += saved_transfers[t] == hit # Reset after wildcard
        else:
            model += saved_transfers[t] == saved_transfers[t-1] + (1 - lpSum(transfer_in[i, t] for i in range(num_players)))
            model += saved_transfers[t] <= 5

    # --- Initial Transfers & Bank ---
    model += saved_transfers[0] == initial_saved
    model += money_in_bank_var[0] == money_in_bank_init

    # --- Solve the Model ---
    #model.solve(PULP_CBC_CMD(msg=True, timeLimit=400))
    model.solve()
    records = []
    # Output
    print(f"Status: {model.status}")
    if(model.status==-1):
        return pd.DataFrame()
        
    for t in range(1, optimize_range):
        print(f"\nGameweek {t+1} Squad:")
        for i in range(num_players):
            if x[i, t].varValue > 0.5:
                status = "Bench" if bench[i, t].varValue > 0.5 else "Playing"
                print(f"- {players[i]} ({positions[i]}) - {status}")

    for t in range(1, optimize_range):
        for i in range(num_players):
            name = players[i]
            player_row_code = current_players[current_players["name"] == name]["code"].values[0]
            web_name = current_players[current_players["name"] == name]["web_name"].values[0]
            pos = positions[i]
            gw = GW_list[t]

            # transferred in
            if(gw !=str(wildcard_round)):
                if x[i, t].varValue > 0.5 and x[i, t-1].varValue < 0.5:
                    records.append({
                        "Name": name,
                        "status": "transferred_in",
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png", 
                        "Is_captain":  False,
                        "web_name":web_name
                    })

                # transferred out
                if x[i, t].varValue < 0.5 and x[i, t-1].varValue > 0.5:
                    records.append({
                        "Name": name,
                        "status": "transferred_out",
                        "GW": gw,
                        "position": pos,
                        "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png", 
                        "Is_captain":  False,
                        "web_name":web_name
                    })


    for t in(1, optimize_range-1):
        for i in range(num_players):
            name = players[i]
            player_row_code=current_players[current_players["name"]==name]["code"].values[0]
            pos = positions[i]
            gw =GW_list[ t] # Transfers affect upcoming GW
            is_capt   = c[i, t].varValue > 0.5
            web_name = current_players[current_players["name"] == name]["web_name"].values[0]

            if x[i, t].varValue > 0.5:
                if bench[i, t].varValue > 0.5:
                    status = "benched"
                else:
                    status = "playing"
                records.append({"Name": name
                                , "status": status
                                , "GW": gw
                                , "position": pos
                                , "photo":f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{player_row_code}.png"
                                , "Is_captain":  bool(is_capt)
                                ,"web_name":web_name})

    # Final structured DataFrame
    status_df = pd.DataFrame(records)
    return status_df
    
    
if __name__ == "__main__":
    optimize_my_team()