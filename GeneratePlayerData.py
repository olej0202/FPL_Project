import pandas as pd
import joblib
import numpy as np
from datetime import datetime

from GenerateConfig import Manual_Player_Risk,Manual_team_offensive_adjustments, Manual_team_defensive_adjustments,Manual_NewPlayer_Adjustments,Manual_Player_Adjustments,NEW_TEAMS

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
        kl+=1

    return clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code

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
            "Rolling_Threat","Rolling_Threat_Against","XG_slope","XGC_slope","Elo_Rating","Rolling_XG","Rolling_XGC"
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
            teams_dataset.loc[mask, cols] = col_means.values*0.5+teams_dataset.loc[mask, cols].values*0.5

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



def add_team_share_per90(
    minutes_col: str = "average_minutes",
    team_col: str = "Team",
    name_col: str = "name",
    per: int = 90,
    share_suffix: str = "_share",
    add_percent: bool = False,
    percent_suffix: str = "_share_pct",
    round_pct: int = 2,
) -> pd.DataFrame:
    df = pd.read_csv("Player_Prediction_set.csv")
    metrics=["Rolling_adjusted_XG","rolling_Threat","Rolling_adjusted_XA","Rolling_creativity","Rolling_adjusted_BPS","rolling_XG", "rolling_XA"]
    
    # 0) Precompute minutes per (team, name) once
    player_mins = (
        df.groupby([team_col, name_col], as_index=True)[minutes_col]
          .sum()
          .rename("mins_sum")
    )

    # Work on a copy to avoid mutating caller's DataFrame unexpectedly
    out = df.copy()

    for metric in metrics:
        # 1) Player-level metric sum
        player_metric = (
            df.groupby([team_col, name_col], as_index=True)[metric]
              .sum()
              .rename("metric_sum")
        )

        # 2) Combine minutes + metric; compute per-<per> rate
        player_agg = pd.concat([player_mins, player_metric], axis=1)
        player_agg["per_val"] = (
            player_agg["metric_sum"]*player_agg["mins_sum"]/ per)

        # 3) Team total of that same per-<per> metric
        team_total = (
            player_agg.groupby(level=0)["per_val"]
                      .sum()
                      .rename("team_per_total")
        )

        # 4) Join team totals and compute share; guard against divide-by-zero
        player_agg = player_agg.join(team_total, on=team_col)
        share_col = f"{metric}{share_suffix}"
        player_agg[share_col] = (
            player_agg["per_val"] / player_agg["team_per_total"]
        ).fillna(0.0)

        # 5) Attach back to every original row for that (team, name)
        out = out.join(player_agg[[share_col]], on=[team_col, name_col])

        # 6) Optional percent column
        if add_percent:
            pct_col = f"{metric}{percent_suffix}"
            out[pct_col] = (out[share_col] * 100).round(round_pct)

    out.to_csv("Player_Prediction_set.csv", index=False)






    
def GeneratePlayerData(time_list, fixture_path,current_player_path, current_teams_path):
    Xmins(current_player_path)
    current_data=pd.read_csv("Player_future.csv").iloc[:,1:]
    fixture_data=pd.read_csv(fixture_path).iloc[:,1:]
    current_players=pd.read_csv(current_player_path).iloc[:,1:]
    current_teams=pd.read_csv(current_teams_path)
    season_data=pd.read_csv("Unwanted_players.csv").iloc[:,1:]
    cbi_data=pd.read_csv("GenerateCBI2.csv")
    understat_pos=pd.read_csv("Generate_Player_Matches.csv")
    understat_team=pd.read_csv("Team_Positions_transformed_Newest.csv")
    team_pen_data=pd.read_csv("Team_Penalties.csv")
    pen_takers=pd.read_csv("GeneratePenTakers.csv")
    kmeans = joblib.load('kmeans_Groundmodel.pkl')
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

    xmins=pd.read_csv("GenerateXmins.csv")
    xmins["name"] = xmins["name"].apply(lambda n: name_map.get(n, n))
    cbi_data["name"] = cbi_data["name"].apply(lambda n: name_map.get(n, n))
    current_players["name"] = current_players["name"].apply(lambda n: name_map.get(n, n))

    names=relevant_players["name"].unique()
    Future_dataframe=pd.DataFrame()
    missing_player=[]
    for name in names:
        player_risiko=0.4
        player_row = current_data[
            current_data["name"].str.lower() == name.lower()
        ]        
        player_row2=current_players[current_players["name"]==name]
        player_pen_takers=pen_takers[pen_takers["name"]==name]
        if(len(player_pen_takers)==0):
            pen_number=0
        else:
            pen_number=player_pen_takers["Is_taker"].values[0]
        playerMins=xmins[xmins["name"]==name]
        playerCBI=cbi_data[cbi_data["name"]==name]
        minutes=playerMins["minutes"].values[0]
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
            cbi_ind=((playerCBI["CBI"].values[0]/90)*minutes)
            
            last = player_row["defcon_avg"].iloc[-1] if not player_row["defcon_avg"].empty else np.nan
            cbi_hist = cbi_ind if pd.isna(last) else last
            player_row["CBI"]=cbi_ind*0.7+0.3*cbi_hist
        else:
            last = player_row["defcon_avg"].iloc[-1] if not player_row["defcon_avg"].empty else np.nan
            player_row["CBI"]=last
            

                
        clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code=next_opp(team_id, time_list, fixture_data,kmeans,team_code,current_teams)
        
        
        #if endre stats for nye spillere på et lag
        exclude_columns=["kickoff_time", "season", "position","Team","name","gamepos","CBI"]
        overscore=player_row["Average_Overscore"].values[0]
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
        if len(player_row)<7:
            player_risiko=0.6
        if(name in Manual_Player_Risk):
                player_risiko = Manual_Player_Risk[name]
        
        print(player_understat_team)
        player_row["Understat_pos"]=player_understat_pos
        player_row["Understat_POSXG"]=player_understat_team["XGIndex"].values[0]
        player_row["Understat_POSXG_Share"]=player_understat_team["Rolling_XG_Share"].values[0]
        player_row["Understat_POSXA"]=player_understat_team["XAIndex"].values[0]
        player_row["Understat_POSXA_Share"]=player_understat_team["Rolling_XA_Share"].values[0]
        player_row["Team_Pen_Data"]=player_team_pen_data
        player_row["Pen_Number"]=pen_number
        player_row["player_risiko"]=player_risiko
        player_row["Goal_Index"]=player_row["Understat_POSXG"]*0.5+0.5*player_row["Rolling_adjusted_XG"]
        player_row["Assist_Index"]=player_row["Understat_POSXA"]*0.5+0.5*player_row["Rolling_adjusted_XA"]
        
        if(len(clusters)<2):
            break
        for i in range(len(clusters)):
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
                player_row["average_minutes"] = minutes
                player_row["Team"]=team_code
                player_row["Average_Overscore"]=overscore
                player_row["Average_OverAssist"]=overassist
                
        
                
            

                Future_dataframe=pd.concat([Future_dataframe, player_row], axis=0, ignore_index=True)
    Future_dataframe.to_csv("Player_Prediction_set.csv")
    add_team_share_per90()
    missing_names = [name for name in names if name not in Future_dataframe["name"].values]
    print("Missing players:", missing_names)
    print("Total missing:", len(missing_names))  

if __name__ == "__main__":
    GeneratePlayerData(2, "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25/current_players.csv","Raw_Data_24\current_teams.csv")
