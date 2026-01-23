import pandas as pd
import joblib
import numpy as np
from datetime import datetime

from GenerateConfig import Manual_Player_Risk,Manual_team_offensive_adjustments, Manual_team_defensive_adjustments,Manual_NewPlayer_Adjustments,Manual_Player_Adjustments,NEW_TEAMS,fixtures_config

def Xmins(current_players):
    xmins=pd.read_csv("GenerateXmins.csv").iloc[:,1:]
    df=pd.read_csv(current_players)[["name"]]


    xmins = pd.read_csv("GenerateXmins.csv")
    if xmins.columns[0].startswith("Unnamed"):
        xmins = xmins.iloc[:, 1:]

    df = pd.read_csv(r"Raw_Data_25\current_players.csv")[["name"]]

    existing_names = set(xmins["name"])
    current_names  = set(df["name"])
    missing_names  = current_names - existing_names

    if missing_names:
        missing_df = pd.DataFrame({
            "name": list(missing_names),
            "minutes": 0})
        xmins_updated = pd.concat([xmins, missing_df], ignore_index=True)
        xmins_updated.to_csv("GenerateXmins.csv", index=False)
        
def next_opp(team, n_future, fixtures,kmeans,team_code,current_teams):
    fixtures=fixtures.copy()
    print(n_future)
    current_teams=current_teams.copy()
    filtered_fix = fixtures[(fixtures['team_a'] == team) | (fixtures['team_h'] == team)]
    filtered_fix = filtered_fix[
    filtered_fix["event"].astype(int).isin([int(x) for x in n_future])
]
    print(filtered_fix)
    fix_ids=filtered_fix["code"].values
    fix_percent=filtered_fix["probability"].values
    teams_dataset=pd.read_csv("Team_data_newest3.csv")

    GW_now=filtered_fix["event"].values[0]

    
    clusters=[]
    XGH=[]
    XGCH=[]
    XGA=[]
    XGCA=[]
    home=[]
    XGC_DEF=[]
    XGC_MID=[]
    XGC_FWD=[]
    own_XG=[]
    n_matches=[]
    played_XGC=[]
    played_XG=[]
    GW=[]
    opp_code=[]
    defcons=[]
    kl=0
    for k in range(len(filtered_fix)):
        
        GW_now=filtered_fix["event"].values[k]
        team_a=filtered_fix["team_a"].values[k]
        team_h=filtered_fix["team_h"].values[k]
        GW.append(GW_now)

        if(team_a==team):
            nxt_opp=team_h
            home.append(False)
        else:
            nxt_opp=team_a
            home.append(True)
        nxt_opp=int(nxt_opp)
        nxt_opp_code=current_teams[current_teams["id"]==nxt_opp]["code"].values[0]
        opp_code.append(nxt_opp_code)
            
            
        next_opp_data=teams_dataset[teams_dataset["code"]==nxt_opp_code]
        next_opp_newest_row = next_opp_data.sort_values(by="kickoff_time", ascending=False).iloc[0]
        nxt_oppstat=[next_opp_newest_row["XGH"],next_opp_newest_row["XGCH"],next_opp_newest_row["XGA"],next_opp_newest_row["XGCA"]]
        own_data=teams_dataset[teams_dataset["code"]==team_code]
        own_data_newest_row = own_data.sort_values(by="kickoff_time", ascending=False).iloc[0]
        if(team_a==team):
            own_XG.append(own_data_newest_row["XGA"])
            played_XGC.append(next_opp_newest_row["XGCH"])
            played_XG.append(next_opp_newest_row["XGH"])
        else:
            own_XG.append(own_data_newest_row["XGH"])
            played_XGC.append(next_opp_newest_row["XGCA"])
            played_XG.append(next_opp_newest_row["XGA"])
            
        cluster=kmeans.predict([nxt_oppstat])[0]
        clusters.append(cluster)
        XGH.append(next_opp_newest_row["XGH"])
        XGCH.append(next_opp_newest_row["XGCH"])
        XGA.append(next_opp_newest_row["XGA"])
        XGCA.append(next_opp_newest_row["XGCA"])
        XGC_DEF.append(next_opp_newest_row["XG_DEF"])
        XGC_FWD.append(next_opp_newest_row["XG_FORWARD"])
        XGC_MID.append(next_opp_newest_row["XG_MID"])
        defcons.append(next_opp_newest_row["Rolling_Defcon_against"])
        kl+=1

    return clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code,defcons,fix_ids,fix_percent

import pandas as pd
from datetime import datetime

def team_data(
    current_teams,
    off_factors=None,        # e.g. {13: 1.10, 90: 0.95}
    def_factors=None,        # e.g. {40: 0.90, 102: 1.05}
    offense_cols=None,       # columns to scale for offense
    defense_cols=None,       # columns to scale for defense
):
    off_factors = Manual_team_offensive_adjustments
    def_factors = Manual_team_defensive_adjustments

    if offense_cols is None:
        offense_cols = [
            "XGH","XGA","XG_avg",
            "Rolling_Threat", "roll10_deep","XG","Rolling_XG"
        ]
    if defense_cols is None:
        defense_cols = [
            "XGCH","XGCA","XGC_avg",
            "Rolling_Threat_Against","XGC","Rolling_XGC"
        ]

    current_teams = pd.read_csv(current_teams)
    teams_dataset = pd.read_csv("Team_data_newest2.csv")

    # make sure numeric cols are numeric
    for col in set(offense_cols + defense_cols):
        if col in teams_dataset.columns:
            teams_dataset[col] = pd.to_numeric(teams_dataset[col], errors="coerce")

    # fill any missing codes with averages from representative teams (as you had)
    codes = current_teams["code"].unique()
    existing_codes = teams_dataset["code"].unique()
    missing_codes = [c for c in codes if c not in existing_codes]

    average_team_codes = [13, 90, 102, 40, 49]
    average_df = teams_dataset[teams_dataset["code"].isin(average_team_codes)]
    numeric_cols = [
            "XG","XGC","was_home","opponent","Clean_Sheet","Result",
            "Threat","Threat_against","XG_DEF","XG_MID","XG_FORWARD",
            "XGA","XGCA","XGH","XGCH","XG_avg","XGC_avg",
            "Rolling_Threat","Rolling_Threat_Against","XG_slope","XGC_slope","Elo_Rating","Rolling_XG","Rolling_XGC",
            
        ]
    
    if missing_codes:
        
        col_means = average_df[numeric_cols].mean(numeric_only=True)

        synthetic_rows = []
        for code in missing_codes:
            row_info = current_teams.loc[current_teams["code"] == code].iloc[0]
            synthetic = {
                "name":         row_info["name"],
                "code":         code,
                "id":           row_info["id"],
                "kickoff_time": datetime.today(),
            }
            for col in numeric_cols:
                if col in col_means:
                    synthetic[col] = col_means[col]
            synthetic_rows.append(synthetic)
    

        teams_dataset = pd.concat([teams_dataset, pd.DataFrame(synthetic_rows)], ignore_index=True)
    if NEW_TEAMS:
        # 1) Normalize key types so .isin works
        new_codes = {str(c) for c in NEW_TEAMS}
        codes = teams_dataset["code"].astype(str)
        mask = codes.isin(new_codes)

        if not mask.any():
            print("No matching team codes in teams_dataset")
        else:
            # 2) Use only columns present in BOTH frames
            cols = [c for c in numeric_cols if c in average_df.columns and c in teams_dataset.columns]

            # 3) Coerce to numeric before taking means (avoids all-NaN means)
            avg_num = average_df[cols].apply(pd.to_numeric, errors="coerce")
            col_means = avg_num.mean()               # index = cols
            col_means = col_means.reindex(cols)      # keep order
            col_means = col_means.fillna(0)          # or choose another fallback

            # 4) Assign (broadcast to all masked rows)
            teams_dataset.loc[mask, cols] = col_means.values*0.3+teams_dataset.loc[mask, cols].values*0.7

    # ---- APPLY TEAM-SPECIFIC MULTIPLIERS ----
    def _apply_factors(df, factors, cols,is_offensive):
        cols = [c for c in cols if c in df.columns]  # only existing cols
        if not cols or not factors:
            return df
        mask = df["code"].isin(factors.keys())
        # per-row multiplier vector
        mult = df.loc[mask, "code"].map(factors)
        df.loc[mask, cols] = df.loc[mask, cols].mul(mult.values, axis=0)
        other_cols=["roll10_xpts"]
        if(is_offensive==1):
            mult2=mult
            
            df.loc[mask, other_cols] = df.loc[mask, other_cols].mul(mult2.values, axis=0)
        else:
            mult2=1/mult
            df.loc[mask, other_cols] = df.loc[mask, other_cols].mul(mult2.values, axis=0)
        return df

    teams_dataset = _apply_factors(teams_dataset, off_factors, offense_cols,1)
    teams_dataset = _apply_factors(teams_dataset, def_factors, defense_cols,0)

    teams_dataset.to_csv("Team_data_newest3.csv", index=False)
    return teams_dataset



import pandas as pd
import numpy as np

def add_team_share_per90(
    minutes_col: str = "average_minutes",
    team_col: str = "Team",
    name_col: str = "name",
    gw_col: str = "GW",
    per: int = 75,
    share_suffix: str = "_share",
    add_percent: bool = False,
    percent_suffix: str = "_share_pct",
    round_pct: int = 2,
    metric_is_per90: bool = True,   # set False if your metrics are raw (not per-90)
) -> pd.DataFrame:
    """
    Compute team share per metric **per GW** so that varying minutes per player per GW are respected.

    If metric_is_per90=True (default):
        row_contrib = metric_value * (minutes / per)
      (e.g., a per-90 rate scaled by that row's minutes)

    If metric_is_per90=False (raw metric per row):
        row_contrib = metric_value
      (you can change this to (metric/minutes)*per * (minutes/per) = metric if needed)

    The team share for a player's row is:
        player_contrib(team, name, GW) / sum_contrib(team, GW)

    The share is attached back to every original row.
    """
    df = pd.read_csv("Player_Prediction_set.csv")

    # Ensure the GW column exists and is string (helps with joins/pivots)
    if gw_col not in df.columns:
        raise ValueError(f"Column '{gw_col}' not found in Player_Prediction_set.csv")
    df[gw_col] = df[gw_col].astype(str)

    # Metrics to process
    metrics = [
        "Rolling_adjusted_XG","rolling_Threat","Rolling_adjusted_XA",
        "Rolling_creativity","Rolling_adjusted_BPS","rolling_XG","rolling_XA","Share_of_XG","Share_of_XA", "rolling_Adjusted_XG_historic","rolling_Adjusted_XA_historic"
        ,"Threat_Mean","Creativity_Mean","rolling_Goal_min","rolling_Assist_min","Rolling_adjusted_XG_per90","Rolling_adjusted_XA_per90"
        ,"Rolling_adjusted_Threat_per90","Rolling_adjusted_creativity_per90","Big_Chances","Big_Chances_Created"
    ]
    for m in metrics:
        if m not in df.columns:
            raise ValueError(f"Metric column '{m}' not found in Player_Prediction_set.csv")

    # Work on a copy
    out = df.copy()

    # Minutes sanity
    out[minutes_col] = pd.to_numeric(out[minutes_col], errors="coerce").fillna(0.0)
    # Avoid divide-by-zero
    safe_minutes = out[minutes_col].replace(0, np.nan)

    for metric in metrics:
        # Per-row contribution for this metric
        if metric_is_per90:
            # metric is per-90, scale by minutes/per
            contrib = out[metric].astype(float) * (out[minutes_col].astype(float) / float(per)).clip(upper=1.0) 
        else:
            # metric is already a raw amount per row (not per-90)
            contrib = out[metric].astype(float)

        contrib_col = f"{metric}_contrib"
        out[contrib_col] = contrib.fillna(0.0)

        # Aggregate to (team, GW, player)
        player_gw_contrib = (
            out.groupby([team_col, gw_col, name_col], as_index=False)[contrib_col]
               .sum()
               .rename(columns={contrib_col: "player_contrib"})
        )

        # Team total per (team, GW)
        team_gw_total = (
            player_gw_contrib.groupby([team_col, gw_col], as_index=False)["player_contrib"]
                             .sum()
                             .rename(columns={"player_contrib": "team_total"})
        )

        # Join team totals back to player_gw
        player_gw_contrib = player_gw_contrib.merge(team_gw_total, on=[team_col, gw_col], how="left")

        # Compute share (guard against zero)
        share_col = f"{metric}{share_suffix}"
        player_gw_contrib[share_col] = np.where(
            player_gw_contrib["team_total"] > 0,
            player_gw_contrib["player_contrib"] / (player_gw_contrib["team_total"]*0.9),
            0.0
        )

        # Attach share back to every original row matching (team, GW, player)
        out = out.merge(
            player_gw_contrib[[team_col, gw_col, name_col, share_col]],
            on=[team_col, gw_col, name_col],
            how="left"
        )

        # Optional percent column
        if add_percent:
            pct_col = f"{metric}{percent_suffix}"
            out[pct_col] = (out[share_col].fillna(0.0) * 100.0).round(round_pct)

        # Clean scratch cols for next loop
        out.drop(columns=[contrib_col], inplace=True)

    # Save & return
    out.to_csv("Player_Prediction_set.csv", index=False)
    return out

def Fixture_Config(fixture_path):
    import re
    # --- 1) Config (the "first" format you asked for) ---
    

    # --- 2) Load CSV ---
    path = fixture_path
    df = pd.read_csv(path)

    # --- 3) Find the fixture-id column automatically (so it works even if name differs) ---
    possible_id_cols = ["code"]
    fixture_col = next((c for c in possible_id_cols if c in df.columns), None)
    if fixture_col is None:
        raise ValueError(
            f"Could not find a fixture id column. Tried {possible_id_cols}. "
            f"Available columns: {list(df.columns)}"
        )

    # Ensure consistent type for matching (strings)
    df[fixture_col] = df[fixture_col].astype(str)

    # --- 4) Ensure probability column exists; default 1 for all rows ---
    PROB_COL = "probability"
    if PROB_COL not in df.columns:
        df[PROB_COL] = 1.0
    else:
        df[PROB_COL] = df[PROB_COL].fillna(1.0)

    # --- 5) Expand affected fixtures into multiple rows (one per GW) ---
    expanded_rows = []
    affected_ids = set(fixtures_config.keys())

    # Split df into affected and unaffected
    affected_mask = df[fixture_col].isin(affected_ids)
    df_unaffected = df.loc[~affected_mask].copy()
    df_unaffected[PROB_COL] = 1.0  # explicitly set to 1 for unaffected

    df_affected = df.loc[affected_mask].copy()

    def gw_to_event(gw_str: str):
        """
        Convert 'GW22' / 'GW 22' -> 22 (int).
        If no digits found, returns original string.
        """
        m = re.search(r"(\d+)", str(gw_str))
        return int(m.group(1)) if m else gw_str

    # For each affected fixture row in the CSV, create new rows per config GW
    for _, row in df_affected.iterrows():
        fix_id = row[fixture_col]
        options = fixtures_config.get(fix_id, [])

        for opt in options:
            new_row = row.copy()
            new_row["event"] = gw_to_event(opt["gw"])   # set event to the GW number
            new_row[PROB_COL] = float(opt["probability"])
            expanded_rows.append(new_row)

    # Build final df: unaffected + expanded
    df_final = pd.concat([df_unaffected, pd.DataFrame(expanded_rows)], ignore_index=True)

    # --- 6) (Optional but recommended) sanity-check: probabilities per fixture sum to ~1 for affected fixtures ---
    # You can comment this out if you don’t want it.
    prob_sums = df_final[df_final[fixture_col].isin(affected_ids)].groupby(fixture_col)[PROB_COL].sum()
    bad = prob_sums[(prob_sums - 1.0).abs() > 1e-6]
    if len(bad) > 0:
        raise ValueError(f"Probabilities do not sum to 1 for: {bad.to_dict()}")
    df_final = df_final.sort_values(by="code", ascending=True)
    # --- 7) Save result ---
    out_path = r"Fantasy_season_Fixtures_EXPANDED.csv"
    df_final.to_csv(out_path, index=False)






    
def GeneratePlayerData(time_list, fixture_path,current_player_path, current_teams_path):
    Xmins(current_player_path)
    Fixture_Config(fixture_path)
    current_data=pd.read_csv("Player_future.csv").iloc[:,1:]
    fixture_data=pd.read_csv("Fantasy_season_Fixtures_EXPANDED.csv").iloc[:,1:]
    current_players=pd.read_csv(current_player_path).iloc[:,1:]
    current_teams=pd.read_csv(current_teams_path)
    season_data=pd.read_csv("Unwanted_players.csv").iloc[:,1:]
    cbi_data=pd.read_csv("GenerateCBI2.csv")
    understat_pos=pd.read_csv("Generate_Player_Matches.csv")
    understat_team=pd.read_csv("Team_Positions_transformed_Newest.csv")
    team_pen_data=pd.read_csv("Team_Penalties.csv")
    pen_takers=pd.read_csv("GeneratePenTakers.csv")
    player_shots=pd.read_csv("Bronze/Understat_Playershots.csv")
    player_assists=pd.read_csv("Bronze/Understat_PlayerAssist.csv")
    kmeans = joblib.load('kmeans_Groundmodel.pkl')
    history_data=pd.read_csv("testML4.csv").iloc[:,1:]
    relevant_players = current_players.copy()
    name_map = {
    "Pedro_Porro Sauceda":          "Pedro_Porro",
    "Sávio_Moreira de Oliveira":    "Sávio_'Savinho' Moreira de Oliveira",
    "Daniel_Muñoz Mejía":           "Daniel_Muñoz",
    "Bernardo_Mota Veiga de Carvalho e Silva": "Bernardo_Veiga de Carvalho e Silva",
    "Ederson_Santana de Moraes":    "Ederson_Santana de Moraes",
    "Levi_Samuels Colwill":         "Levi_Colwill",
    "Marcos_Senesi Barón":          "Marcos_Senesi",
    "Raúl_Jiménez Rodríguez":       "Raúl_Jiménez",
    "Robert_Lynch Sánchez":         "Robert_Sánchez",
    "Rodrigo_'Rodri' Hernandez Cascante": "Rodrigo_Hernandez",
    "Rúben_dos Santos Gato Alves Dias":   "Rúben_Gato Alves Dias",
    "Kaoru_Mitoma":                 "Mitoma_Kaoru",
    "Matheus_Santos Carneiro da Cunha": "Matheus_Santos Carneiro Da Cunha",
    "David_Raya Martín":"David_Raya Martin",
    "Kepa_Arrizabalaga Revuelta": "Kepa_Arrizabalaga",
    "Idrissa_Gana Gueye": "Idrissa_Gueye",
    "Alisson_Becker": "Alisson_Ramses Becker",
    "Luis_Díaz Marulanda": "Luis_Díaz",
    "Matheus Luiz_Nunes":"Matheus_Nunes",
    "Alejandro_Garnacho Ferreyra":"Alejandro_Garnacho",
}
    
    new_players_cluster=Manual_NewPlayer_Adjustments
    new_team_cluster=Manual_Player_Adjustments
    
    relevant_players["name"] = relevant_players["name"].apply(lambda n: name_map.get(n, n))

    xmins=pd.read_csv("GenerateXmins2.csv")
    xmins["name"] = xmins["name"].apply(lambda n: name_map.get(n, n))
    xmins["GW"] = xmins["GW"].astype(int)
    cbi_data["name"] = cbi_data["name"].apply(lambda n: name_map.get(n, n))
    
    current_players["name"] = current_players["name"].apply(lambda n: name_map.get(n, n))

    names=relevant_players["name"].unique()
    Future_dataframe=pd.DataFrame()
    missing_player=[]
    for name in names:
        player_risiko=0.3
        player_row = current_data[
            current_data["name"].str.lower() == name.lower()
        ] 
        rel_player_player=relevant_players[
            relevant_players["name"]==name
        ]  
        player_code=rel_player_player["code"].values[0] 
        #Shot_data
        shot_data = player_shots[player_shots["Shot_player_code"] == player_code].copy()
        assist_data=player_assists[player_assists["Assist_player_code"] == player_code].copy()
        
        if assist_data.empty:
            big_chances_created = 0.1
        else:
            newest_row_ass = assist_data.sort_values("date").tail(1).iloc[0]

            bcc_rm = newest_row_ass.get("bc_created_rm25", np.nan)

            if pd.isna(bcc_rm):
                big_chances_created = 0.1
            else:
                big_chances_created=bcc_rm

        if shot_data.empty:
            big_chances = 0.1
            goal_conv = 1
        else:
            newest_row = shot_data.sort_values("date").tail(1).iloc[0]

            bc_rm20 = newest_row.get("big_chance_rate_rm20", np.nan)
            bc_ewm  = newest_row.get("big_chance_rate_ewm", np.nan)

            if pd.isna(bc_rm20) and pd.isna(bc_ewm):
                big_chances = 0.1
            elif pd.isna(bc_rm20):
                big_chances = bc_ewm
            elif pd.isna(bc_ewm):
                big_chances = bc_rm20
            else:
                big_chances = 0.5 * bc_rm20 + 0.5 * bc_ewm

            goal_conv = 1+newest_row.get("Shot_conversion_sum_rm20", 1)
            if pd.isna(goal_conv):
                goal_conv = 1

        player_row2=current_players[current_players["name"]==name]
        player_pen_takers=pen_takers[pen_takers["name"]==name]
        history_player=history_data[history_data["name"]==name]
        if(len(player_pen_takers)==0):
            pen_number=0
        else:
            pen_number=player_pen_takers["Is_taker"].values[0]
        playerMins=xmins[xmins["name"]==name]
        mins_lookup = (
            playerMins[["name", "GW", "Final_minutes_Adjusted"]]
            .rename(columns={"Final_minutes_Adjusted": "average_minutes"})
            .set_index(["name", "GW"])
            )
        playerCBI=cbi_data[cbi_data["name"]==name]
        minutes=playerMins["Final_minutes_Adjusted"].values
        print(name)
        player_understat_pos=understat_pos[understat_pos["fpl_name"]==name]["Matched_Pos"].values[0]      


        team_id=player_row2["team"].values[0]
        team_code=player_row2["team_code"].values[0]
        
        
        print(player_understat_pos)
        player_understat_team=understat_team[understat_team["Team_code"]==team_code]
        print(player_understat_team)
        player_understat_team=player_understat_team[player_understat_team["pos_group"]==player_understat_pos]
        player_team_pen_data=team_pen_data[team_pen_data["code"]==team_code]["Penalty"].values[0]
        
        

        element_type=player_row2["element_type"].values[0]
        if(element_type==1):
            position='GKP'
        elif(element_type==2):
            position='DEF'
            
        elif(element_type==3):
            position='MID'
        else:
            position='FWD'
                
        if(element_type==5):
                continue
        player_row["position"]=position
        


        if len(player_row)<1:
            player_risiko=0.8
            missing_player.append(name)
            current_player_season=season_data[season_data["Name"]==name]
            has_history=0
            if(len(current_player_season)>4):
                average_minutes =current_player_season["Average_minutes"].values[0]
                has_history=1

            element_type=player_row2["element_type"].values[0]
            if(element_type==1):
                position='GKP'
            elif(element_type==2):
                position='DEF'
            
            elif(element_type==3):
                position='MID'
            else:
                position='FWD'
                
            player_cluster = current_data[
                    (current_data["position"] == position) & 
                        (current_data["Team"] == team_code)&
                        (current_data["minutes"].sum() >= 1000)
                    ]
            if(name in new_players_cluster):
                members = new_players_cluster[name]
                player_cluster = current_data[current_data["name"].isin(members)]
            if(len(player_cluster)==0):
                player_cluster = current_data[
                    (current_data["position"] == position) & 
                        (current_data["Team"].isin([40, 20, 13, 102, 90, 49]))
                    ]
            player_cluster = player_cluster.replace([np.inf, -np.inf], 0).fillna(0)
            exclude_columns=["kickoff_time", "season", "position","Team","name","gamepos"]
            own_new_row=player_cluster.iloc[0,:].copy()
            own_new_row["name"]=name
            own_new_row["Team"]=team_code
            own_new_row["position"]=position

            columns_to_average = [col for col in player_cluster.columns if col not in exclude_columns]

            own_new_row[columns_to_average] = player_cluster[columns_to_average].mean()*1
            own_new_row["Average_Overscore"]=1
            own_new_row["Average_OverAssist"]=1
            own_new_row["TP_std_20"]=3
            if has_history==1:
                own_new_row["average_minutes"]=average_minutes
            else:
                if(player_row2["now_cost"].values[0]>65):
                    own_new_row["average_minutes"]=90
                else:   
                    own_new_row["average_minutes"]=40
            
            player_row = pd.DataFrame([own_new_row])

        pd.DataFrame(missing_player).to_csv("MIssing_players.csv")
        if (position=='GKP'):
            player_row["CBI"]=0
            
        elif (position=='DEF'):
            player_row["CBI"]=3.8
            
        elif (position=='MID'):
            player_row["CBI"]=0
            
        elif (position=='FWD'):
            player_row["CBI"]=0
            
        if(len(playerCBI)>0):
            print(minutes)
            cbi_ind=((playerCBI["CBI"].values[0]/90)*minutes[0])
            
            last = player_row["defcon_avg"].iloc[-1] if not player_row["defcon_avg"].empty else np.nan
            cbi_hist = cbi_ind if pd.isna(last) else last
            player_row["CBI"]=cbi_ind*0.0+1*cbi_hist
        else:
            last = player_row["defcon_avg"].iloc[-1] if not player_row["defcon_avg"].empty else np.nan
            player_row["CBI"]=last
            

                
        clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code,defcons,fix_ids,fix_percent=next_opp(team_id, time_list, fixture_data,kmeans,team_code,current_teams)
        
        
        #if endre stats for nye spillere på et lag
        exclude_columns=["kickoff_time", "season", "position","Team","name","gamepos","CBI"]
        overscore=goal_conv
        overassist=player_row["Average_OverAssist"].values[0]

        columns_to_average = [col for col in player_row.columns if col not in exclude_columns]
        if name in new_team_cluster:
            members = new_team_cluster[name]
            cluster_df = current_data[current_data["name"].isin(members)]
            cluster_means = cluster_df[columns_to_average].mean()
            player_row[columns_to_average] = 0.5 * player_row[columns_to_average] + 0.5 * cluster_means

        print(player_understat_pos)
        print(team_code)
        print(name)
        if len(history_player)<=6:
            player_risiko=0.8
            overscore=1
            overassist=1
        if len(history_player)<=15:
            player_risiko=0.6
            overscore=1
            overassist=1
        if(name in Manual_Player_Risk):
                player_risiko = Manual_Player_Risk[name]
        
        print(player_understat_team)
        player_row["Understat_pos"]=player_understat_pos
        player_row["Understat_POSXG"]=player_understat_team["XGIndex"].values[0]
        player_row["Understat_POSXG_Share"]=player_understat_team["Rolling_XG_Share"].values[0]*0.5+0.5*player_understat_team["Rolling_Shots_Share"].values[0]
        player_row["Understat_POSXA"]=player_understat_team["XAIndex"].values[0]
        player_row["Understat_POSXA_Share"]=player_understat_team["Rolling_XA_Share"].values[0]*0.5+0.5*player_understat_team["Rolling_KeyPasses_Share"].values[0]
        player_row["Team_Pen_Data"]=player_team_pen_data
        player_row["Pen_Number"]=pen_number
        player_row["player_risiko"]=player_risiko
        player_row["Goal_Index"]=player_row["Understat_POSXG"]*player_risiko+(1-player_risiko)*player_row["Rolling_adjusted_XG"]
        player_row["Assist_Index"]=player_row["Understat_POSXA"]*player_risiko+(1-player_risiko)*player_row["Rolling_adjusted_XA"]
        player_row["Player_code"]=player_code
        
        
        if(len(clusters)<2):
            break
        
        for i in range(len(clusters)):
                gw_i = int(GW[i])
                player_row["Cluster"] = clusters[i]
                player_row["XGH"] = XGH[i]
                player_row["XGCH"] = XGCH[i]
                player_row["XGA"] = XGA[i]
                player_row["XGCA"] = XGCA[i]
                player_row["Own_Attacking_form"] = own_XG[i]
                player_row["XGC_DEF"]= XGC_DEF[i]
                player_row["XGC_FWD"]= XGC_FWD[i]
                player_row["XGC_MID"]= XGC_MID[i]
                player_row["was_home"] = home[i]
                player_row["GW"] = GW[i]
                player_row["played_XGC"] = played_XGC[i]
                player_row["played_XG"] = played_XG[i]
                player_row["opp_code"] = opp_code[i]
                player_row["Team"]=team_code
                player_row["Average_Overscore"]=overscore
                player_row["Average_OverAssist"]=overassist
                player_row["average_minutes"] = float(mins_lookup.loc[(name, gw_i), "average_minutes"]) if (name, gw_i) in mins_lookup.index else 1.0
                player_row["Opp_defcon"] = defcons[i]
                player_row["fix_id"] = fix_ids[i]
                player_row["fix_percentage"] = fix_percent[i]
                player_row["Big_Chances"] = big_chances
                player_row["Big_Chances_Created"] = big_chances_created
                
        
                
            

                Future_dataframe=pd.concat([Future_dataframe, player_row], axis=0, ignore_index=True)
    Future_dataframe.to_csv("Player_Prediction_set.csv")
    add_team_share_per90()
    missing_names = [name for name in names if name not in Future_dataframe["name"].values]
    print("Missing players:", missing_names)
    print("Total missing:", len(missing_names))  

if __name__ == "__main__":
    GeneratePlayerData(2, "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25/current_players.csv","Raw_Data_24\current_teams.csv")
