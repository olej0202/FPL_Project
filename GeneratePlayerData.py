import pandas as pd
import joblib
import numpy as np
from datetime import datetime
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
    off_factors = {94:0.9,2:0.9 }
    def_factors = {94:1.15,11:1.1, 31:1.1,8:1.1 }

    # sensible defaults; adjust to your schema
    if offense_cols is None:
        offense_cols = [
            "XGH","XGA","XG_avg","XG_slope",
            "Rolling_Threat"
        ]
    if defense_cols is None:
        defense_cols = [
            "XGCH","XGCA","XGC_avg","XGC_slope",
            "Rolling_Threat_Against"
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

    if missing_codes:
        numeric_cols = [
            "XG","XGC","was_home","opponent","Clean_Sheet","Result",
            "Threat","Threat_against","XG_DEF","XG_MID","XG_FORWARD",
            "XGA","XGCA","XGH","XGCH","XG_avg","XGC_avg",
            "Rolling_Threat","Rolling_Threat_Against","XG_slope","XGC_slope","Elo_Rating"
        ]
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

    # ---- APPLY TEAM-SPECIFIC MULTIPLIERS ----
    def _apply_factors(df, factors, cols):
        cols = [c for c in cols if c in df.columns]  # only existing cols
        if not cols or not factors:
            return df
        mask = df["code"].isin(factors.keys())
        # per-row multiplier vector
        mult = df.loc[mask, "code"].map(factors)
        df.loc[mask, cols] = df.loc[mask, cols].mul(mult.values, axis=0)
        return df

    teams_dataset = _apply_factors(teams_dataset, off_factors, offense_cols)
    teams_dataset = _apply_factors(teams_dataset, def_factors, defense_cols)

    teams_dataset.to_csv("Team_data_newest3.csv", index=False)
    return teams_dataset


    
    
def GeneratePlayerData(time_list, fixture_path,current_player_path, current_teams_path):
    Xmins(current_player_path)
    current_data=pd.read_csv("Player_future.csv").iloc[:,1:]
    fixture_data=pd.read_csv(fixture_path).iloc[:,1:]
    current_players=pd.read_csv(current_player_path).iloc[:,1:]
    current_teams=pd.read_csv(current_teams_path)
    season_data=pd.read_csv("Unwanted_players.csv").iloc[:,1:]
    cbi_data=pd.read_csv("GenerateCBI2.csv")
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
    
    new_players_cluster={
        "Viktor_Gyökeres":["Alexander_Isak","Kai_Havertz","Yoane_Wissa"],
        "Florian_Wirtz":["Mohamed_Salah","Cole_Palmer","Dominik_Szoboszlai","Alexis_Mac Allister", "Luis_Díaz"]
        
    }
    new_team_cluster={
        "Mohammed_Kudus":["Brennan_Johnson","Son_Heung-min","Dejan_Kulusevski"],
        "Matheus_Santos Carneiro Da Cunha":["Bruno_Borges Fernandes","Alejandro_Garnacho Ferreyra","Amad_Diallo"],
        "Bryan_Mbeumo":["Bruno_Borges Fernandes","Alejandro_Garnacho Ferreyra","Amad_Diallo"],
        "Cole_Palmer":["Mohamed_Salah","Bukayo_Saka"],
        "Ollie_Watkins":["Erling_Haaland","Yoane_Wissa"],
        "Anthony_Gordon":["Alexander_Isak","Jacob_Murphy","Harvey_Barnes"],   
        "Igor_Thiago Nascimento Rodrigues":["Yoane_Wissa","Bryan_Mbeumo"],
        "Lucas_Tolentino Coelho de Lima":["Jarrod_Bowen"],
        "Mohamed_Salah":["Cody_Gakpo","Luis_Díaz" ]      
    }
    
    relevant_players["name"] = relevant_players["name"].apply(lambda n: name_map.get(n, n))

    xmins=pd.read_csv("GenerateXmins.csv")
    xmins["name"] = xmins["name"].apply(lambda n: name_map.get(n, n))
    cbi_data["name"] = cbi_data["name"].apply(lambda n: name_map.get(n, n))
    current_players["name"] = current_players["name"].apply(lambda n: name_map.get(n, n))

    names=relevant_players["name"].unique()
    Future_dataframe=pd.DataFrame()
    missing_player=[]
    for name in names:
        player_row = current_data[
            current_data["name"].str.lower() == name.lower()
        ]        
        player_row2=current_players[current_players["name"]==name]
        playerMins=xmins[xmins["name"]==name]
        playerCBI=cbi_data[cbi_data["name"]==name]
        minutes=playerMins["minutes"].values[0]
        


        team_id=player_row2["team"].values[0]
        team_code=player_row2["team_code"].values[0]
        
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
            player_row["CBI"]=(playerCBI["CBI"].values[0]/90)*minutes

                
        clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code=next_opp(team_id, time_list, fixture_data,kmeans,team_code,current_teams)
        
        
        #if endre stats for nye spillere på et lag
        exclude_columns=["kickoff_time", "season", "position","Team","name","gamepos","CBI"]
        columns_to_average = [col for col in player_row.columns if col not in exclude_columns]
        if name in new_team_cluster:
            members = new_team_cluster[name]
            cluster_df = current_data[current_data["name"].isin(members)]
            cluster_means = cluster_df[columns_to_average].mean()
            player_row[columns_to_average] = 0.5 * player_row[columns_to_average] + 0.5 * cluster_means

        
        
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
        
                
            

                Future_dataframe=pd.concat([Future_dataframe, player_row], axis=0, ignore_index=True)
    Future_dataframe.to_csv("Player_Prediction_set.csv")
    missing_names = [name for name in names if name not in Future_dataframe["name"].values]
    print("Missing players:", missing_names)
    print("Total missing:", len(missing_names))  

if __name__ == "__main__":
    GeneratePlayerData(2, "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25/current_players.csv","Raw_Data_24\current_teams.csv")
