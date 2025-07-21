import pandas as pd
import joblib
import numpy as np
from datetime import datetime

def next_opp(team, n_future, fixtures,kmeans,team_code,current_teams):
    fixtures=fixtures.copy()
    fixtures=fixtures[(fixtures['finished']==False)].iloc[0:,:]
    current_teams=current_teams.copy()
    filtered_fix = fixtures[(fixtures['team_a'] == team) | (fixtures['team_h'] == team)]
    filtered_fix=filtered_fix[filtered_fix["provisional_start_time"]==False]
    filtered_fix=filtered_fix[filtered_fix["finished_provisional"]==False]
    teams_dataset=pd.read_csv("Team_data_newest3.csv")

    GW_now=filtered_fix["event"].values[0]
    max_gw=GW_now+n_future-1
    

    filtered_fix=filtered_fix[filtered_fix["event"]<=max_gw]
    
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
    print(GW)
    print(XGH)
    return clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code


def team_data(current_teams):
    current_teams=pd.read_csv(current_teams)
    # 1) load your “real” dataset
    teams_dataset = pd.read_csv("Team_data_newest2.csv")

    # 2) find which codes are present in your input but missing from the dataset
    codes          = current_teams["code"].unique()
    existing_codes = teams_dataset["code"].unique()
    print(codes)
    print(existing_codes)
    missing_codes  = [c for c in codes if c not in existing_codes]
    
    average_team_codes=[13, 90, 102, 40,49]
    average_df=teams_dataset[teams_dataset["code"].isin(average_team_codes)]

    if not missing_codes:
        print(missing_codes)
        print("ikke")
        return teams_dataset

    # 3) decide which columns to average
    #    we’ll average every numeric column except the ID/code fields
    numeric_cols = ["XG","XGC","was_home","opponent","Clean_Sheet","Result","Threat","Threat_against","XG_DEF","XG_MID","XG_FORWARD","XGA","XGCA","XGH","XGCH","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","XG_slope","XGC_slope","Elo_Rating"]
    col_means = average_df[numeric_cols].mean()

    # 4) build one synthetic row per missing code
    synthetic_rows = []
    for code in missing_codes:
        print(code)
        # pick up the name/id from your current_teams input
        row_info = current_teams.loc[current_teams["code"] == code].iloc[0]
        synthetic = {
            "name":          row_info["name"],
            "code":          code,
            "id":            row_info["id"],
            "kickoff_time":  datetime.today(),   # today’s date/time
        }
        # fill in each numeric column with its global mean
        for col in numeric_cols:
            synthetic[col] = col_means[col]

        synthetic_rows.append(synthetic)

    # 5) append them and return the combined DataFrame
    missing_df = pd.DataFrame(synthetic_rows)
    full_df    = pd.concat([teams_dataset, missing_df], ignore_index=True)
    full_df.to_csv("Team_data_newest3.csv")

    return full_df

    
    
def GeneratePlayerData(Future, fixture_path,current_player_path, current_teams_path):
    current_data=pd.read_csv("Player_future.csv").iloc[:,1:]
    fixture_data=pd.read_csv(fixture_path).iloc[:,1:]
    current_players=pd.read_csv(current_player_path).iloc[:,1:]
    current_teams=pd.read_csv(current_teams_path)
    season_data=pd.read_csv("Unwanted_players.csv").iloc[:,1:]
    kmeans = joblib.load('kmeans_Groundmodel.pkl')
    relevant_players = current_players.copy()
    names=relevant_players["name"].unique()
    Future_dataframe=pd.DataFrame()
    for name in names:
        player_row=current_data[current_data["name"]==name]
        player_row2=current_players[current_players["name"]==name]
        print(player_row2)
        print(player_row)

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
            current_player_season=season_data[season_data["Name"]==name]
            has_history=0
            if(len(current_player_season)>1):
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
                        (current_data["minutes"].sum() >= 500)
                    ]
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

            own_new_row[columns_to_average] = player_cluster[columns_to_average].mean()*0.9
            if has_history==1:
                own_new_row["average_minutes"]=average_minutes
            else:
                if(player_row2["now_cost"].values[0]>70):
                    own_new_row["average_minutes"]=90
                else:   
                    own_new_row["average_minutes"]=40
            
            player_row = pd.DataFrame([own_new_row])


        print(player_row2)
        clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG,GW,played_XGC,played_XG,opp_code=next_opp(team_id, Future, fixture_data,kmeans,team_code,current_teams)
        if(len(clusters)<2):
            print("mindre")
            print(XGH)
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
            

                Future_dataframe=pd.concat([Future_dataframe, player_row], axis=0, ignore_index=True)
    print(Future_dataframe)
    Future_dataframe.to_csv("Player_Prediction_set.csv")
    missing_names = [name for name in names if name not in Future_dataframe["name"].values]
    print("Missing players:", missing_names)
    print("Total missing:", len(missing_names))  

if __name__ == "__main__":
    GeneratePlayerData(2, "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25/current_players.csv","Raw_Data_24\current_teams.csv")
