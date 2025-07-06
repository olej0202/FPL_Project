import pandas as pd
import joblib
import numpy as np

def next_opp(team, n_future, fixtures,kmeans,team_code,current_teams):
    fixtures=fixtures.copy()
    fixtures=fixtures[(fixtures['finished']==False)].iloc[0:,:]
    current_teams=current_teams.copy()
    filtered_fix = fixtures[(fixtures['team_a'] == team) | (fixtures['team_h'] == team)]
    filtered_fix=filtered_fix[filtered_fix["provisional_start_time"]==False]
    filtered_fix=filtered_fix[filtered_fix["finished_provisional"]==False]
    teams_dataset=pd.read_csv("Team_data_newest2.csv")

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
    
def GeneratePlayerData(Future, fixture_path,current_player_path, current_teams_path):
    current_data=pd.read_csv("Player_future.csv").iloc[:,1:]
    fixture_data=pd.read_csv(fixture_path).iloc[:,1:]
    current_players=pd.read_csv(current_player_path).iloc[:,1:]
    current_teams=pd.read_csv(current_teams_path).iloc[:,1:]
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


        if len(player_row)<1:
            element_type=player_row2["element_type"].values[0]
            if(element_type==1):
                position='GKP'
            elif(element_type==2):
                position='DEF'
            elif(element_type==5):
                continue
            elif(element_type==3):
                position='MID'
            else:
                position='FWD'
                
            player_cluster = current_data[
                    (current_data["position"] == position) & 
                        (current_data["Team"] == team_code)
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

            own_new_row[columns_to_average] = player_cluster[columns_to_average].mean()
            
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


GeneratePlayerData(2, "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25/current_players.csv","Raw_Data_24\current_teams.csv")