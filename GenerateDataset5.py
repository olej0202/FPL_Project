import pandas as pd
import os
import numpy as np
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
import glob
import requests
from scipy.stats import mode
import xgboost as xgb
from sklearn.svm import SVR
import joblib

def make_Kmeans():
    seasons=['2022-23', '2023-24']

    teams23=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2022-23/teams2.csv")[["code","name", "XGH","XGCH","XGA","XGCA"]]
    teams24=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2023-24/teams2.csv")[["code","name", "XGH","XGCH","XGA","XGCA"]]
    teams25=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2024-25/teams2.csv")[["code","name", "XGH","XGCH","XGA","XGCA"]]

    a=pd.concat([teams23,teams24,teams25],
                  axis = 0)
    cluster_data=a.iloc[:,2:].values


    kmeans = KMeans(n_clusters=4, random_state=32)
    kmeans.fit(cluster_data)
    joblib.dump(kmeans, 'kmeans_Groundmodel.pkl')

    a["predict"]=kmeans.predict(cluster_data)
    a.to_csv("team_clusters.csv")
    return kmeans





def prepare_elements_df(json_data):
    players24=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2023-24/gws/merged_gw.csv")[["name","position","team"]]
    players24[['first_name', 'second_name']] = players24['name'].str.split(' ', n=1, expand=True)
    team_ids_2024 = pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2023-24/teams.csv")
    players24 = players24.drop_duplicates()
    players24_with_codes = players24.merge(team_ids_2024[['name','code']], left_on='team', right_on='name', how='left')
    players24=players24_with_codes[['first_name', 'second_name', 'position', 'code']]
    
    players23=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2022-23/gws/merged_gw.csv")[["name","position","team"]]
    players23[['first_name', 'second_name']] = players23['name'].str.split(' ', n=1, expand=True)
    team_ids_2023 = pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2022-23/teams.csv")
    players23 = players23.drop_duplicates()
    players23_with_codes = players23.merge(team_ids_2023[['name','code']], left_on='team', right_on='name', how='left')
    players23=players23_with_codes[['first_name', 'second_name', 'position', 'code']]
    
    old_players=pd.concat([players23, players24], axis=0, ignore_index=True)
    old_players = old_players.drop_duplicates()
    
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    elements_types_df = pd.DataFrame(json_data['element_types'])
    teams_df = pd.DataFrame(json_data['teams'])
        
    slim_elements_df = elements_df[['id','first_name','second_name','team_code','element_type','team']]
        
    slim_elements_df['position'] = slim_elements_df.element_type.map(elements_types_df.set_index('id').singular_name)
    slim_elements_df['team'] = slim_elements_df.team.map(teams_df.set_index('id').name)
    slim_elements_df=slim_elements_df[['first_name','second_name','position','team_code']]
    position_mapping = {
        'Forward': 'FWD',
        'Midfielder': 'MID',
        'Goalkeeper': 'GK',
        'Defender':'DEF'}

    slim_elements_df['position'] = slim_elements_df['position'].map(position_mapping).fillna(slim_elements_df['position'])
    slim_elements_df=pd.concat([slim_elements_df, old_players], axis=0, ignore_index=True)
    slim_elements_df=slim_elements_df.drop_duplicates()
    slim_elements_df.rename(columns={'code': 'team_code'}, inplace=True)
    
    return slim_elements_df


def process_player_data(player_df, team, team_id2,kmeans):
    df=player_df[['assists', 'bonus', 'bps', 'clean_sheets', 'element', 'expected_assists', 
                                 'expected_goal_involvements', 'expected_goals', "kickoff_time", 
                                 'expected_goals_conceded', 'fixture', 'goals_conceded', 'goals_scored', 'minutes', 
                                 'opponent_team', 'saves', 'total_points', 'value', 'was_home']]
             
    opp_cluster = []
    XGH = []
    XGCH = []
    XGA = []
    XGCA = []
    dfXG=[]
    forXG=[]
    midXG=[]
    own_att_stat=[]
    own_cluster = []
    own_team_xgs=[]
    own_team_xas=[]
    teams_dataset=pd.read_csv("Team_data_transformed2.csv")
    player_df['kickoff_time'] = pd.to_datetime(player_df['kickoff_time'])
    player_df['kickoff_time'] = player_df['kickoff_time'].dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    prev_kickoff=0
    for i in range(len(df)):
        
        opponent = player_df["opponent_code"].values[i]
        kickoff_time=player_df["kickoff_time"].values[i]
        opp_row = teams_dataset[(teams_dataset["kickoff_time"] == kickoff_time) & (teams_dataset["code"] == opponent)]
        own_row = teams_dataset[(teams_dataset["kickoff_time"] == kickoff_time) & (teams_dataset["code"] == player_df["team_code2"].values[i])]
        if(len(own_row)<1):
            kickoff_time = pd.to_datetime(kickoff_time)
            teams_dataset['kickoff_time'] = pd.to_datetime(teams_dataset['kickoff_time'], errors='coerce')
            own_row = (teams_dataset[(teams_dataset['kickoff_time'].dt.month == kickoff_time.month) & (teams_dataset['kickoff_time'].dt.year == kickoff_time.year) & 
        (teams_dataset['code'] == player_df["team_code2"].values[i])].sort_values(by='kickoff_time', ascending=False).head(1))

      
        own_stat = [[own_row["XGH"].values[0],own_row["XGCH"].values[0],own_row["XGA"].values[0],own_row["XGCA"].values[0]]]
        new_opp_stat=[[opp_row["XGH"].values[0],opp_row["XGCH"].values[0],opp_row["XGA"].values[0],opp_row["XGCA"].values[0]]]
        
        if(df["was_home"].values[i]==1):
            own_att_stat.append(own_row["XGH"].values[0])
        else:
            own_att_stat.append(own_row["XGA"].values[0])
 
        XGH.append(opp_row["XGH"].values[0])
        XGCH.append(opp_row["XGCH"].values[0])
        XGA.append(opp_row["XGA"].values[0])
        XGCA.append(opp_row["XGCA"].values[0])
        dfXG.append(opp_row["XG_DEF"].values[0])
        forXG.append(opp_row["XG_FORWARD"].values[0])
        midXG.append(opp_row["XG_MID"].values[0])

        cluster = kmeans.predict(new_opp_stat)[0]
        opp_cluster.append(cluster)
        o_cluster = kmeans.predict(own_stat)[0]
        own_cluster.append(o_cluster)
        own_team_xgs.append(own_row["Round_XG"].values[0])
        own_team_xas.append(own_row["Round_XA"].values[0])

    df["Cluster"] = opp_cluster
    df["XGH"] = XGH
    df["XGCH"] = XGCH
    df["XGA"] = XGA
    df["XGCA"] = XGCA
    df["Own_cluster"] = own_cluster
    
    df["ICT"]=player_df['ict_index'].values
    df["Threat"]=player_df['threat'].values
    df["creativity"]=player_df['creativity'].values
    df["influence"]=player_df["influence"].values
    df["defcon"]=player_df["defensive_contribution"].values
    df["season"]=player_df['season'].values

    df["XGC_DEF"]=dfXG
    df["XGC_FWD"]=forXG
    df["XGC_MID"]=midXG
    df['Own_Attacking_form'] = own_att_stat
    df['opponent_code'] = player_df['opponent_code'].values
    df["Team_XG"]=own_team_xgs
    df["Team_XA"]=own_team_xas

    return df

def next_opp(team, n_future,kmeans):
    fixtures=pd.read_csv("Raw_Data_24\Fantasy_season_2024_Fixtures.csv")
    fixtures=fixtures[(fixtures['finished']==False)].iloc[0:,:]
    #fixtures=fixtures[(fixtures['event']>34)].iloc[0:,:]
    
    filtered_fix = fixtures[(fixtures['team_a'] == team) | (fixtures['team_h'] == team)]
    filtered_fix=filtered_fix[filtered_fix["provisional_start_time"]==False]
    filtered_fix=filtered_fix[filtered_fix["finished_provisional"]==False]
    teams_dataset=pd.read_csv("Team_data_newest2.csv")
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
    kl=0
    for j in range(n_future):
        GW_now=filtered_fix["event"].values[0]
        nxt_GW=filtered_fix[(filtered_fix['event']==GW_now+kl)]
    
            
        if len(nxt_GW)==0:
            kl+=1
            nxt_GW=filtered_fix[(filtered_fix['event']==GW_now+kl)]
        if(len(clusters)==n_future):
            continue
        n_matches.append(len(nxt_GW))
    
        for k in range(len(nxt_GW)):
            if(nxt_GW["team_a"].values[k]==team):
                nxt_opp=nxt_GW["team_h"].values[k]
                home.append(False)
            else:
                nxt_opp=nxt_GW["team_a"].values[k]
                home.append(True)
            nxt_opp=int(nxt_opp)
            next_opp_data=teams_dataset[teams_dataset["id"]==nxt_opp]
            next_opp_newest_row = next_opp_data.sort_values(by="kickoff_time", ascending=False).iloc[0]
            nxt_oppstat=[next_opp_newest_row["XGH"],next_opp_newest_row["XGCH"],next_opp_newest_row["XGA"],next_opp_newest_row["XGCA"]]
            own_data=teams_dataset[teams_dataset["id"]==team]
            own_data_newest_row = own_data.sort_values(by="kickoff_time", ascending=False).iloc[0]
            if(nxt_GW["team_a"].values[k]==team):
                own_XG.append(own_data_newest_row["XGA"])
            else:
                own_XG.append(own_data_newest_row["XGH"])
            
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
    return clusters,home,n_matches,XGH,XGCH,XGA,XGCA,XGC_DEF,XGC_FWD,XGC_MID,own_XG
def X_P_hist(df,pos,clusters,home,n_matches):

    X_P=[]
    counter=0
    available=[]
    #saves,CS,Assist,Goal
    fordeling = {'Goalkeeper': [0.33,4,3,6], 'Defender': [0,4,3,6], 'Midfielder': [0,1,3,5], 'Forward':[0,0,3,4]}
    act_fordling=fordeling[pos]
    for q in range(len(n_matches)):
        xp=0
        matches=n_matches[q]
        av=False
        for l in range(matches):
            opponent=clusters[counter]
            home_nxt=home[counter]
            filtered_df=df[(df['Cluster']==opponent)&(df['minutes']>0)]

            if(len(filtered_df)>0):
                n=len(filtered_df)
                av=True
                xg=((filtered_df['expected_goals'].sum()+filtered_df['goals_scored'].sum())/2)/n
                xa=((filtered_df['expected_assists'].sum()+filtered_df['assists'].sum())/2)/n
                xc=((filtered_df['expected_goals_conceded'].sum()+filtered_df['goals_conceded'].sum())/2)/n
                saves=filtered_df['saves'].sum()/n
                bonus=filtered_df['bonus'].sum()/n
                xp+=xg*act_fordling[3]+xa*act_fordling[2]+(act_fordling[1])/(2*xc)+saves*act_fordling[0]+bonus
                
            else:
                xp+=0
        
            counter+=1
        
        X_P.append(xp)
        available.append(av)
    return(X_P,available)


def XP_new(df,home,n_matches):
    XP=[]
    for i in range(len(n_matches)):
        xp=0
        fordeling = {'Goalkeeper': [0.33,4,3,6], 'Defender': [0,4,3,6], 'Midfielder': [0,1,3,5], 'Forward':[0,0,3,4]}
        pos=df['position'].values[0]
        act_fordling=fordeling[pos]
        n=df['minutes'].sum()/90
        if n>0:
            
        
            xg=((float(df['expected_goals'].sum())+float(df['goals_scored'].sum()))/2)/n
           
            xa=((float(df['expected_assists'].sum())+float(df['assists'].sum()))/2)/n
         
            xc=((float(df['expected_goals_conceded'].sum())+float(df['goals_conceded'].sum()))/2)/n
            saves=float(df['saves'].sum())/n
            bonus=float(df['bonus'].sum())/n

            if n_matches[i]>1:
                xp+=2*(xg*act_fordling[3]+xa*act_fordling[2]+(act_fordling[1])/(2*xc)+saves*act_fordling[0]+bonus)
                
        
            else:
                xp+=xg*act_fordling[3]+xa*act_fordling[2]+(act_fordling[1])/(2*xc)+saves*act_fordling[0]+bonus
        XP.append(xp)

    return XP
def get_understat(player_df,Own_team_name,pos,element_list,season_list,position):
    
    directory_path25 = 'Raw_Data_25/Understat_data_with_element.csv'
    
    directory_path24 = 'Raw_Data_24/Understat_data_with_element.csv'

    directory_path23 = 'Raw_Data_23/Understat_data_with_element.csv'

    directory_path22 = 'Raw_Data_22/Understat_data_with_element.csv'


    new_df=pd.DataFrame()

    names=["G.Jesus","Martin_Ødegaard","Alex Moreno","Diego Carlos","Douglas Luiz","Estupiñan","O'Shea","B.Badiashile","T.Silva","Petrović","C.Doucouré",
          "Marc_Guéhi","De Cordova-Reid","J.Palhinha","Vinícius","A.Becker","Diogo J.","Kaboré","Ederson M.","Kovačić","Matheus N.",
          "B.Fernandes","R.Varane","Bruno G.","Niakhaté","Ahmedhodžić","Vini Souza","E.Royal","Perišić","N.Aguerd","P.Fornals","L.Paquetá","Souček",
          "Aït-Nouri","H.Bueno","Hee-chan_Hwang","N.Semedo","Lukić","Bruno_Borges Fernandes","Matheus_Santos Carneiro Da Cunha","Rayan_Aït-Nouri"
          ,"Joško_Gvardiol","Jérémy_Doku","Gabriel_Martinelli Silva","Gabriel_dos Santos Magalhães","Emile_Smith Rowe","Diogo_Dalot Teixeira","Diogo_Teixeira da Silva"
          ,"Darwin_Núñez Ribeiro","Benjamin_White","Bruno_Guimarães Rodriguez Moura","Olu_Aina"]
    map_name=["Gabriel_Jesus","Martin_Odegaard","Álex_Moreno","Diego_Carlos","Douglas_Luiz","Estupiñán","Shea_875","Benoit_Badiashile_Mukinayi_7240",
              "Thiago_Silva","Djordje_Petrovic_12032","Cheick_Oumar_Doucoure_8666","Marc_Guehi_7603","Bobby_Reid_6827","João_Palhinha_10715",
             "Carlos_Vinicius_7395","Alisson_1257","Diogo_Jota_6854","Issa_Kabore_9619","Ederson_6054","Mateo_Kovacic_2254","Matheus_Nunes_11000",
             "Bruno_Fernandes_1228","Raphael_Varane_2245","Bruno_Guimarães_8327","Moussa_Niakhate_5989","Anel_Ahmedhodzic_10386",
             "Vinicius_Souza_10872","Emerson_7430","Ivan_Perisic_448","Naif_Aguerd_6935","Pablo_Fornals_2335","Lucas_Paquetá_736","Tomas_Soucek_8288",
             "Rayan_Ait_Nouri_6674","Hugo_Bueno_10140","Hee-Chan_Hwang_8845","Nélson_Semedo_6163","Sasa_Lukic_153","Bruno_Fernandes_1228","Matheus_Cunha_7080","Rayan_Ait_Nouri_6674"
             ,"Josko_Gvardiol_9790","Jéremy_Doku_8981","Gabriel_Martinelli_7752","Gabriel_5613","Emile_Smith-Rowe_7230","Diogo_Dalot_7281","Diogo_Jota_6854","Darwin_Núñez_10720"
             ,"Ben_White_7298","Bruno_Guimarães_8327","Ola_Aina_725"]
    
    filtered_df=pd.DataFrame()
    try:
        season_df=player_df[player_df["season"]=='26']
        element=season_df["code_x"].values[0]
        data_25 = pd.read_csv(directory_path25)
        filtered_df=data_25[data_25["element"]==element]
    except:
        filtered_df=pd.DataFrame()
    
    if(len(filtered_df)<1):
        try:
            season_df=player_df[player_df["season"]=='25']
            element=season_df["element"].values[0]
            data_24 = pd.read_csv(directory_path24)
            filtered_df=data_24[data_24["element"]==element]
        except:
            filtered_df=pd.DataFrame()
    
    if(len(filtered_df)<1):
        try:
            season_df=player_df[player_df["season"]=='24']
            element=season_df["element"].values[0]
            data_23 = pd.read_csv(directory_path23)
            filtered_df=data_23[data_23["element"]==element]
        except:
            filtered_df=pd.DataFrame()
            
    if(len(filtered_df)<1):
        try:
            season_df=player_df[player_df["season"]=='23']
            element=season_df["element"].values[0]
            data_22 = pd.read_csv(directory_path22)
            filtered_df=data_22[data_22["element"]==element]
        except:
            filtered_df=pd.DataFrame()
    
        
    matching_files_df=filtered_df
    if(len(matching_files_df)<1):
        player_df["gamepos"]=[position]*len(player_df)
        player_df["xGChain"]=[0]*len(player_df)
        player_df["xGBuildup"]=[0]*len(player_df)
        player_df["shots"]=[2]*len(player_df)
        player_df["key_passes"]=[0.5]*len(player_df)
        return player_df, 'nan'

    under_df=matching_files_df[matching_files_df['season'] >=2022]
    most_common_value = under_df['position'].head(5).mode()[0]
    df_reversed=under_df.sort_values(by='date', ascending=True).reset_index(drop=True)
    df_minutes=player_df[player_df["minutes"]>0]
    
    df_minutes["kickoff_time"]=pd.to_datetime(df_minutes["kickoff_time"]).dt.strftime("%Y-%m-%d")
    
    if(len(df_minutes) < len(under_df)):
        oldnames=["Newcastle","Wolves","Spurs","Sheffield Utd","Nott'm Forest","Man Utd","Man City"]
        newnames=["Newcastle United","Wolverhampton Wanderers","Tottenham","Sheffield United","Nottingham Forest","Manchester United","Manchester City",
                 ]
        if(Own_team_name in oldnames):
            name_ind=oldnames.index(Own_team_name)
            Own_team_name=newnames[name_ind]
            

    if(len(df_minutes) != len(under_df)):
        df_reversed = df_reversed[(df_reversed['a_team'] == Own_team_name) | (df_reversed['h_team'] == Own_team_name)]
        df_reversed = df_reversed.drop_duplicates(subset=['date'])
        merged_df = pd.merge(df_minutes, df_reversed,left_on='kickoff_time', right_on='date', how='left')
        df_minutes['gamepos'] = merged_df['position_y'].values
        df_minutes['xGChain'] = merged_df['xGChain'].values
        df_minutes['xGBuildup'] = merged_df['xGBuildup'].values
        df_minutes["shots"]=merged_df["shots"].values
        df_minutes["key_passes"]=merged_df["key_passes"].values
        df_minutes['gamepos'] = df_minutes['gamepos'].ffill()
        df_minutes['xGChain'] = df_minutes['xGChain'].ffill()
        df_minutes['xGBuildup'] = df_minutes['xGBuildup'].ffill()
        df_minutes['shots'] = df_minutes['shots'].fillna(df_minutes['shots'].expanding().mean())
        df_minutes['key_passes'] = df_minutes['key_passes'].fillna(df_minutes['key_passes'].expanding().mean())
        df_minutes['shots'] = df_minutes['shots'].fillna(2)
        df_minutes['key_passes'] = df_minutes['key_passes'].fillna(0.5)

    else:
        df_minutes["gamepos"]=df_reversed["position"].values
        df_minutes["xGChain"]=df_reversed["xGChain"].values
        df_minutes["xGBuildup"]=df_reversed["xGBuildup"].values
        df_minutes["shots"]=df_reversed["shots"].values
        df_minutes["key_passes"]=df_reversed["key_passes"].values
    return df_minutes,most_common_value

def rolling_mode(series):
    m = mode(series, nan_policy='omit')  # Ignore NaN values

    return  m.mode  # Return the first mode value

def Generate_team_data():
    df_26=pd.read_csv("Raw_Data_25/Fantasy_season_2025_data.csv")
    df_25=pd.read_csv("Raw_Data_24/Fantasy_season_2024_data.csv")
    df_24=pd.read_csv("Raw_Data_23/Fantasy_season_2023_data.csv")
    df_23=pd.read_csv("Raw_Data_22/Fantasy_season_2022_data.csv")
    
    team_26=pd.read_csv("Raw_Data_25/current_teams.csv")
    team_25=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2024-25/teams2.csv")
    team_24=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2023-24/teams2.csv")
    team_23=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2022-23/teams2.csv")

    XGAs=[]
    XGHS=[]
    XGCAs=[]
    XGCHs=[]
    full_team_data=pd.DataFrame()
    for i in range(4):
        if(i==0):
            data=df_23
            code_data=team_23
        elif(i==1):
            data=df_24
            code_data=team_24
        elif(i==2):
            data=df_25
            code_data=team_25
        else:
            data=df_26
            code_data=team_26
            
        teams=data["team"].unique()

        
        
        for j in range(len(teams)):
            team_name=teams[j]
            code=code_data[code_data["name"]==team_name]["code"].values[0]
            id=code_data[code_data["name"]==team_name]["id"].values[0]

            team_data=data[data["team"]==team_name]
            #XGC=team_data.groupby('kickoff_time')['expected_goals_conceded'].max()
            XGC=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['expected_goals_conceded'].max()
            #XG=team_data.groupby('kickoff_time')['expected_goals'].sum()
            XG=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['expected_goals'].sum()
            #GS=team_data.groupby('kickoff_time')['goals_scored'].sum()
            GS=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['goals_scored'].sum()
            #GC=team_data.groupby('kickoff_time')['goals_conceded'].max()
            GC=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['goals_conceded'].max()
            Threat=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['threat'].sum()
            
            XA=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['expected_assists'].sum()
            A=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['assists'].sum()
            
            XGCS=[]
            XGs=[]
            CSs=[]
            wons=[]
            XG2s=[]
            XAs=[]
            #washomes=team_data.groupby('kickoff_time')['was_home'].max().values
            washomes=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['was_home'].max().values
            opponents=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['opponent_code'].median().values

            kickoff_times=GC.index.tolist()
            for k in range(len(GC)):
                if(GC.values[k]==0):
                    CSs.append(1)
                else:
                    CSs.append(0)
                if(GS.values[k]>GC.values[k]):
                    wons.append(2)
                elif(GS.values[k]==GC.values[k]):
                    wons.append(1)
                else:
                    wons.append(0)
                    
                XGC1=XGC.values[k]
                XG1=XG.values[k]
                XA1=XA.values[k]
                if(XGC1==0):
                    XGCS.append(GC.values[k])
                else:
                    XGCS.append((GC.values[k]+XGC1)/2)
                if(XG1==0):
                    XGs.append(GS.values[k])
                else:
                    XGs.append((GS.values[k]+XG1)/2)
                    
                if(XG1==0):
                    XG2s.append(GS.values[k])
                else:
                    XG2s.append((XG1))
                if(XA1==0):
                    XAs.append(A.values[k])
                else:
                    XAs.append((XA1))
            Played_against_df=data[data["opponent_team"]==id]
            XGCaway = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                columns='position',             # Columns will be based on 'position'
                values='expected_goals',        # The values to aggregate will be 'expected_goals'
                aggfunc='sum'                   # Summing the 'expected_goals' for each group
            ).reset_index()
            
            GSCaway = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                columns='position',             # Columns will be based on 'position'
                values='goals_scored',        # The values to aggregate will be 'expected_goals'
                aggfunc='sum'                   # Summing the 'expected_goals' for each group
            ).reset_index()
            
            Threatagainst = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                values='threat',        # The values to aggregate will be 'expected_goals'
                aggfunc='sum'                   # Summing the 'expected_goals' for each group
            ).reset_index()
            
            New_team_df=pd.DataFrame()
            New_team_df["name"]=[team_name]*len(XGs)
            New_team_df["code"]=[code]*len(XGs)
            New_team_df["id"]=[id]*len(XGs)
            New_team_df["kickoff_time"]=kickoff_times
            New_team_df["XG"]=XGs
            New_team_df["Round_XG"]=XG2s
            New_team_df["Round_XA"]=XAs
            New_team_df["XGC"]=XGCS
            New_team_df["was_home"]=washomes
            New_team_df["opponent"]=opponents
            New_team_df["Clean_Sheet"]=CSs
            New_team_df["Result"]=wons
            New_team_df["Threat"]=Threat.values
            New_team_df["Threat_against"]=Threatagainst['threat'].values
            
            xg_def=XGCaway['DEF'].values
            xg_mid=XGCaway['MID'].values
            xg_for=XGCaway['FWD'].values
            for g in range(len(xg_for)):
                if(xg_for[g]==0):
                    xg_for[g]=GSCaway['FWD'].values[g]
                if(xg_mid[g]==0):
                    xg_mid[g]=GSCaway['MID'].values[g]
                if(xg_def[g]==0):
                    xg_def[g]=GSCaway['DEF'].values[g]
            New_team_df["XG_DEF"]=xg_def
            New_team_df["XG_MID"]=xg_mid
            New_team_df["XG_FORWARD"]=xg_for
            full_team_data=pd.concat([full_team_data, New_team_df], axis=0, ignore_index=True)

    full_team_data.to_csv("Team_Data_FUll.csv")
    full_team_data=pd.read_csv("Team_Data_FUll.csv").iloc[:,1:]
    teams=full_team_data["name"].unique()
    ALL_teams=pd.DataFrame()
    newest_data=pd.DataFrame()
    for i in range(len(teams)):
        team=teams[i]
        team_data=full_team_data[full_team_data["name"]==team]
        away_team=team_data[team_data["was_home"]==False]
        home_team=team_data[team_data["was_home"]==True]
        home_team['XGH']=np.clip(home_team['XG'], None, 3).rolling(window=8, min_periods=1).mean()
        home_team['XGCH']=np.clip(home_team['XGC'], None, 3).rolling(window=8, min_periods=1).mean()
        away_team['XGA']=np.clip(away_team['XG'], None, 3).rolling(window=8, min_periods=1).mean()
        away_team['XGCA']=np.clip(away_team['XGC'], None, 3).rolling(window=8, min_periods=1).mean()
        
        home_team["XG_DEF"]=home_team['XG_DEF'].ewm(span=8, adjust=False).mean()
        home_team["XG_MID"]=home_team['XG_MID'].ewm(span=8, adjust=False).mean()
        home_team["XG_FORWARD"]=home_team['XG_FORWARD'].ewm(span=8, adjust=False).mean()
        away_team["XG_DEF"]=away_team['XG_DEF'].ewm(span=8, adjust=False).mean()
        away_team["XG_MID"]=away_team['XG_MID'].ewm(span=8, adjust=False).mean()
        away_team["XG_FORWARD"]=away_team['XG_FORWARD'].ewm(span=8, adjust=False).mean()
        new_team=pd.concat([away_team, home_team], axis=0, ignore_index=True)
        new_team = new_team.sort_values(by='kickoff_time')
        new_team = new_team.reset_index(drop=True)
        columns_to_ffill = ['XGA', 'XGCA', 'XGH', 'XGCH']
        new_team[columns_to_ffill] = new_team[columns_to_ffill].ffill()
        new_team[columns_to_ffill] = new_team[columns_to_ffill].fillna(1.5)
        new_team['XGH']=new_team['XGH']*0.5+np.clip(new_team['XG'], None, 3.5).rolling(window=15, min_periods=1).mean()*0.5
        new_team['XGA']=new_team['XGA']*0.5+np.clip(new_team['XG'], None, 3.5).rolling(window=15, min_periods=1).mean()*0.5
        new_team['XGCH']=new_team['XGCH']*0.5+np.clip(new_team['XGC'], None, 3.5).rolling(window=15, min_periods=1).mean()*0.5
        new_team['XGCA']=new_team['XGCA']*0.5+np.clip(new_team['XGC'], None, 3.5).rolling(window=15, min_periods=1).mean()*0.5
        new_team['XG_avg']=new_team['XG'].rolling(window=10, min_periods=1).mean()
        new_team['XGC_avg']=new_team['XGC'].rolling(window=10, min_periods=1).mean()
        
        new_team['Rolling_Threat']=new_team['Threat'].ewm(span=15, adjust=False).mean()
        new_team['Rolling_Threat_Against']=new_team['Threat_against'].ewm(span=15, adjust=False).mean()
        
        new_team['XG_slope']=new_team['XG_avg'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        new_team['XGC_slope']=new_team['XGC_avg'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        new_team["Rolling_Threat"]=new_team["Rolling_Threat"]/100
        new_team["Rolling_Threat_Against"]=new_team["Rolling_Threat_Against"]/100
        new_team["Rolling_XG"]=new_team['XG'].ewm(span=15, adjust=False).mean()
        new_team["Rolling_XGC"]=new_team['XGC'].ewm(span=15, adjust=False).mean()
        
        newest_data = pd.concat([newest_data, new_team.iloc[[-1]]], axis=0, ignore_index=True)
        new_team["XGCH"]=new_team["XGCH"].shift(1, fill_value=1.5)
        new_team["XGH"]=new_team["XGH"].shift(1, fill_value=1.5)
        new_team["XGA"]=new_team["XGA"].shift(1, fill_value=1.5)
        new_team["XGCA"]=new_team["XGCA"].shift(1, fill_value=1.5)
        new_team["XG_avg"]=new_team["XG_avg"].shift(1, fill_value=0)
        new_team["XGC_avg"]=new_team["XGC_avg"].shift(1, fill_value=0)
        new_team["XG_slope"]=new_team["XG_slope"].shift(1, fill_value=0)
        new_team["XGC_slope"]=new_team["XGC_slope"].shift(1, fill_value=0)
        new_team["Rolling_Threat"]=new_team["Rolling_Threat"].shift(1, fill_value=1.5)
        new_team["Rolling_Threat_Against"]=new_team["Rolling_Threat_Against"].shift(1, fill_value=1.5)
        new_team["Rolling_XG"]=new_team["Rolling_XG"].shift(1, fill_value=1.5)
        new_team["Rolling_XGC"]=new_team["Rolling_XGC"].shift(1, fill_value=1.5)

        ALL_teams=pd.concat([ALL_teams, new_team], axis=0, ignore_index=True)
    ALL_teams.to_csv("Team_data_transformed.csv")
    newest_data.to_csv("Team_data_newest.csv")
    team_data=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2024-25/teams2.csv")[['code','draw','form','id','loss','name','played','points','position','short_name','strength','team_division','unavailable','win','XGH','XGCH','XGA','XGCA']]
    codes=team_data['code'].values
    XGHs=[]
    XGAs=[]
    XGCHs=[]
    XGCAs=[]
    for t in range(len(codes)):
        code=codes[t]
        team_g_data=ALL_teams[ALL_teams["code"]==code]
        next_opp_newest_row = team_g_data.sort_values(by="kickoff_time", ascending=False).iloc[0]
        XGHs.append(next_opp_newest_row["XGH"])
        XGAs.append(next_opp_newest_row["XGA"])
        XGCHs.append(next_opp_newest_row["XGCH"])
        XGCAs.append(next_opp_newest_row["XGCA"])
        
    team_data['XGH']=XGHs
    team_data['XGA']=XGAs
    team_data['XGCH']=XGCHs
    team_data['XGCA']=XGCAs
    team_data.to_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2024-25/teams2.csv")
    
def team_transformed2():
    team_df=pd.read_csv("Team_data_transformed.csv").iloc[:,1:][["XGC_avg","XG_avg","code", "kickoff_time", "XG", "XGC","was_home", "opponent","Clean_Sheet","Result"]]
    team_df['opponent'] = team_df['opponent'].astype(int)
    team_df['kickoff_time'] = pd.to_datetime(team_df['kickoff_time'])
    from sklearn.svm import SVR
    from sklearn.linear_model import SGDRegressor


    df=pd.read_csv("Team_data_transformed.csv").iloc[:,1:]
    codes=df['code'].unique()

    new_df=pd.DataFrame()
    for code in codes:
        team_df_train = df[df["code"] == code].copy()
        df_opponent = df[['code', 'kickoff_time', 'XGA', 'XGCA', 'XGH', 'XGCH','XG_avg','XGC_avg']].copy()

        merged = team_df_train.merge(df_opponent,
                        how='left',
                        left_on=['opponent', 'kickoff_time'],
                        right_on=['code', 'kickoff_time'],
                        suffixes=('', '_opp'))

        merged.drop(columns='code_opp', inplace=True, errors='ignore')
        own_xg=[]
        own_xgc=[]
        opp_xg=[]
        opp_xgc=[]
        own_avg_xg=[]
        own_avg_xgc=[]
        opp_avg_xg=[]
        opp_avg_xgc=[]
        for j in range(len(merged)):
            home=merged["was_home"].values[j]
            if home:
                own_xg.append(merged["XGH"].values[j])
                own_xgc.append(merged["XGCH"].values[j])
                opp_xg.append(merged["XGA_opp"].values[j])
                opp_xgc.append(merged["XGCA_opp"].values[j])
            else:
                own_xg.append(merged["XGA"].values[j])
                own_xgc.append(merged["XGCA"].values[j])
                opp_xg.append(merged["XGH_opp"].values[j])
                opp_xgc.append(merged["XGCH_opp"].values[j])

            own_avg_xg.append(merged["XG_avg"].values[j])
            own_avg_xgc.append(merged["XGC_avg"].values[j])
            opp_avg_xg.append(merged["XG_avg_opp"].values[j])
            opp_avg_xgc.append(merged["XGC_avg_opp"].values[j])

        train_df=pd.DataFrame()
        train_df["Own_XG"]=own_xg
        train_df["Own_XGC"]=own_xgc
        train_df["opp_XG"]=opp_xg
        train_df["opp_XGC"]=opp_xgc

        train_df["Own_avg_XG"]=own_avg_xg
        train_df["Own_avg_XGC"]=own_avg_xgc
        train_df["opp_avg_XG"]=opp_avg_xg
        train_df["opp_avg_XGC"]=opp_avg_xgc

        train_df["XG"]=merged["XG"].values
        train_df["XGC"]=merged["XGC"].values
        train_df[["Own_XG","Own_XGC","opp_XG","opp_XGC","XG","XGC","Own_avg_XG","Own_avg_XGC","opp_avg_XG","opp_avg_XGC"]] = train_df[["Own_XG","Own_XGC","opp_XG","opp_XGC","XG","XGC","Own_avg_XG","Own_avg_XGC","opp_avg_XG","opp_avg_XGC"]].round(1)
        train_df['XG'] = train_df['XG'].clip(lower=0.5, upper=3)
        train_df['XGC'] = train_df['XGC'].clip(lower=0.5, upper=3)
        new_df=pd.concat([new_df, train_df], axis=0, ignore_index=True)


    train_xg=new_df[["Own_avg_XG","opp_avg_XGC"]].values
    y_xg=new_df["XG"].values

    model_xg = SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model_xg.fit(train_xg, y_xg)

    train_xgc=new_df[["Own_avg_XGC","opp_avg_XG"]].values
    y_xgc=new_df["XGC"].values
    model_xgc = SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model_xgc.fit(train_xgc, y_xgc)


    team_avg_xg = team_df.groupby("code")["XG_avg"].mean()
    team_avg_xgc = team_df.groupby("code")["XGC_avg"].mean()

    # Get all teams (including opponents)
    teams = pd.unique(team_df['code'].tolist() + team_df['opponent'].tolist())

    # Initialize ratings using the per-team mean, fallback to global mean if team not found
    global_avg_xg = team_df["XG_avg"].mean()
    global_avg_xgc = team_df["XGC_avg"].mean()

    off_rating = {team: team_avg_xg.get(team, global_avg_xg) for team in teams}
    def_rating = {team: team_avg_xgc.get(team, global_avg_xgc) for team in teams}

    # Optional: initialize other rating dicts the same way
    off_rating_home = off_rating.copy()
    def_rating_home = def_rating.copy()
    off_rating_away = off_rating.copy()
    def_rating_away = def_rating.copy()

    off_rating_history = {team: [off_rating[team]] for team in teams}
    def_rating_history = {team: [def_rating[team]] for team in teams}

    off_rating_home_history = {team: [off_rating_home[team]] for team in teams}
    def_rating_home_history = {team: [def_rating_home[team]] for team in teams}
    off_rating_away_history = {team: [off_rating_away[team]] for team in teams}
    def_rating_away_history = {team: [def_rating_away[team]] for team in teams}
    
    elo_rating = {team: 1000 for team in teams}
    elo_history = {team: [1000] for team in teams}
    k_elo = 30  # ELO update factor

    team_df = team_df.sort_values('kickoff_time')

    error_xg=[]
    error_xgc=[]
    for _, row in team_df.iterrows():
        was_home=row['was_home']
        team = row['code']
        opponent = row['opponent']
        xg = min(2.5,max(0.5,row['XG']))
        xgc = min(2.5,max(0.5,row['XGC']))

        team_off = off_rating[team]
        team_def = def_rating[team]
        opp_off = off_rating[opponent]
        opp_def = def_rating[opponent]
        pred_weight=0.0
        team_weight=(1-pred_weight)/2


        gap=(team_off-opp_off)-(team_def-opp_def)
        if(gap>=1.7):
            team_weight=0.8
            pred_weight=0
        elif(gap>=1.2):
            team_weight=0.7
            pred_weight=0
        elif(gap<=-1.7):
             team_weight=0.2
             pred_weight=0
        elif(gap<=-1.2):
             pred_weight=0
             team_weight=0.3  
        opp_weight=1-team_weight



        k_def = 0.06
        k_off=0.06
        min_val=0.8

        actual_goals = xg
        if was_home==1:
            team_off_h = off_rating_home[team]
            opp_def_a = def_rating_away[opponent]
            team_def_h = def_rating_home[team]
            opp_off_a = off_rating_away[opponent]

            preds_xg=model_xg.predict([[team_off_h,opp_def_a]])[0]
            preds_xgc=model_xgc.predict([[opp_def_a,team_off_h]])[0]

            expected_goals = team_off_h*team_weight +pred_weight*(preds_xg)+opp_weight*opp_def_a
            expected_goals_conceeded=opp_def_a*opp_weight+preds_xgc*pred_weight+team_weight*team_off_h

            #model_xgc.partial_fit([[opp_def,team_off,opp_def_a,team_off_h]], [xg])

            #model_xg.partial_fit([[team_off,opp_def,team_off_h,opp_def_a]], [xg])
            delta_xg_h = k_off*min(min_val,max(-min_val,(actual_goals - expected_goals)))
            delta_xgc_h=k_off*min(min_val,max(-min_val,(actual_goals - expected_goals_conceeded)))
            New_off_rating_h=max(0.6, team_off_h+delta_xg_h)
            New_def_rating_a=max(0.6, opp_def_a+delta_xgc_h)

            off_rating_home[team] =New_off_rating_h
            def_rating_away[opponent] = New_def_rating_a

        else:
            team_off_a = off_rating_away[team]
            opp_def_h = def_rating_home[opponent]
            team_def_a = def_rating_away[team]
            opp_off_h = off_rating_home[opponent]

            preds_xg=model_xg.predict([[team_off_a,opp_def_h]])[0]
            preds_xgc=model_xgc.predict([[opp_def_h,team_off_a]])[0]

            expected_goals = team_off_a*team_weight + pred_weight*(preds_xg)+opp_weight*opp_def_h
            expected_goals_conceeded=opp_def_h*opp_weight+preds_xgc*pred_weight+team_weight*team_off_a

            #model_xgc.partial_fit([[opp_def,team_off,opp_def_h,team_off_a]], [xg])

            #model_xg.partial_fit([[team_off,opp_def,team_off_a,opp_def_h]], [xg])

            delta_xg_a = k_off*min(min_val,max(-min_val,(actual_goals - expected_goals)))
            delta_xgc_a=k_off*min(min_val,max(-min_val,(actual_goals - expected_goals_conceeded)))
            New_off_rating_a=max(0.6, team_off_a+delta_xg_a)
            New_def_rating_h=max(0.6, opp_def_h+delta_xgc_a)

            off_rating_away[team] =New_off_rating_a
            def_rating_home[opponent] = New_def_rating_h

        """

        expected_goals = team_off*0.3 + opp_def*0.2+0.4*(model_xg.predict([[team_off,opp_def]])[0]*1+model_xgc.predict([[opp_def,team_off]])[0]*0.0)
        model_xgc.partial_fit([[opp_def,team_off]], [xg])
        model_xg.partial_fit([[team_off,opp_def]], [xg])"""

        preds_xg=model_xg.predict([[team_off,opp_def]])[0]
        preds_xgc=model_xgc.predict([[opp_def,team_off]])[0]
        expected_goals = team_off*team_weight+pred_weight*preds_xg+opp_weight*opp_def
        expected_goals_conceeded= opp_def*opp_weight+pred_weight*(preds_xgc)+team_weight*team_off


        delta_xg = k_off*min(min_val,max(-min_val,(actual_goals - expected_goals)))

        delta_xgc = k_def*min(min_val,max(-min_val,(actual_goals - expected_goals_conceeded)))

        error_xg.append(abs(actual_goals - expected_goals))


        New_off_rating=max(0.6, team_off+delta_xg)
        New_def_rating=max(0.6, opp_def+delta_xgc)

        # Update ratings
        off_rating[team] =New_off_rating
        def_rating[opponent] = New_def_rating

        # Log history
        off_rating_history[team].append(off_rating[team])
        def_rating_history[opponent].append(def_rating[opponent])


        off_rating_home_history[team].append(off_rating_home[team])
        def_rating_home_history[opponent].append(def_rating_home[opponent])

        off_rating_away_history[team].append(off_rating_away[team])
        def_rating_away_history[opponent].append(def_rating_away[opponent])
        
        team_elo = elo_rating[team]
        opp_elo = elo_rating[opponent]

        # Calculate expected result
        expected_team = 1 / (1 + 10 ** ((opp_elo - team_elo) / 400))

        # Convert match result to outcome (1 win, 0.5 draw, 0 loss)
        if row['Result'] == 2:
            actual_result = 1.0
        elif row['Result'] == 1:
            actual_result = 0.5
        else:
            actual_result = 0.0

        new_factor=max(1,3-0.25*len(elo_history[team]))
        # Update ratings
        surprise_multiplier = abs(actual_result - expected_team) * 1.5  # tweakable
        delta_elo = new_factor*k_elo * (actual_result - expected_team)*surprise_multiplier
        elo_rating[team] += delta_elo
        # Store history
        elo_history[team].append(elo_rating[team])

    new_team_df=pd.read_csv("Team_data_transformed.csv").iloc[:,1:]
    new_team_df_newest=pd.read_csv("Team_data_newest.csv").iloc[:,1:]

    overall_weight=0.25

    team_transformed_df=pd.DataFrame()
    team_transformed_df_newest=pd.DataFrame()
    for t in range(len(teams)):
        team=teams[t]
        slope_df=pd.DataFrame()
        slope_df["XG"]=off_rating_history[team]
        slope_df["XG_slope"]=slope_df['XG'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        slope_df["XGC"]=def_rating_history[team]
        slope_df["XGC_slope"]=slope_df['XGC'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        selected_team_df=new_team_df[new_team_df["code"]==team].copy()
        selected_team_df["XGA"]=((1-overall_weight) * np.array(off_rating_away_history[team][:-1]) +overall_weight * selected_team_df["XGA"])
        selected_team_df["XGCA"]=((1-overall_weight)  * np.array(def_rating_away_history[team][:-1]) +overall_weight * selected_team_df["XGCA"])
        selected_team_df["XGH"]=((1-overall_weight)  * np.array(off_rating_home_history[team][:-1]) +overall_weight * selected_team_df["XGH"]) 
        selected_team_df["XGCH"]=((1-overall_weight)  * np.array(def_rating_home_history[team][:-1]) +overall_weight* selected_team_df["XGCH"])
        selected_team_df["XG_avg"]=selected_team_df["XGH"]*0.5+selected_team_df["XGA"]*0.5
        selected_team_df["XGC_avg"]=selected_team_df["XGCH"]*0.5+selected_team_df["XGCA"]*0.5
        #selected_team_df["XG_avg"]=((1-overall_weight)  * np.array(off_rating_history[team][:-1]) +overall_weight* selected_team_df["XG_avg"])
        #selected_team_df["XGC_avg"]=((1-overall_weight)  * np.array(def_rating_history[team][:-1]) +overall_weight* selected_team_df["XGC_avg"])
        selected_team_df['XG_slope']=slope_df["XG_slope"].values[:-1]
        selected_team_df['XGC_slope']=slope_df["XGC_slope"].values[:-1]
        selected_team_df["Elo_Rating"]=elo_history[team][:-1]
        team_transformed_df=pd.concat([team_transformed_df, selected_team_df], axis=0, ignore_index=True)

        newest_selected_team_df=new_team_df_newest[new_team_df_newest["code"]==team].copy()
        newest_selected_team_df["XGA"]=off_rating_away_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XGA"]
        newest_selected_team_df["XGCA"]=def_rating_away_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XGCA"]
        newest_selected_team_df["XGH"]=off_rating_home_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XGH"]
        newest_selected_team_df["XGCH"]=def_rating_home_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XGCH"]
        selected_team_df["XG_avg"]=selected_team_df["XGH"]*0.5+selected_team_df["XGA"]*0.5
        selected_team_df["XGC_avg"]=selected_team_df["XGCH"]*0.5+selected_team_df["XGCA"]*0.5
        #newest_selected_team_df["XG_avg"]=off_rating_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XG_avg"]
        #newest_selected_team_df["XGC_avg"]=def_rating_history[team][-1]*(1-overall_weight) +overall_weight * newest_selected_team_df["XGC_avg"]
        newest_selected_team_df['XG_slope']=slope_df["XG_slope"].values[-1]
        newest_selected_team_df['XGC_slope']=slope_df["XGC_slope"].values[-1]
        newest_selected_team_df["Elo_Rating"]=elo_history[team][-1]

        team_transformed_df_newest=pd.concat([team_transformed_df_newest, newest_selected_team_df], axis=0, ignore_index=True)

    team_transformed_df.to_csv("Team_data_transformed2.csv")
    team_transformed_df_newest.to_csv("Team_data_newest2.csv")
    
    
def Understat_teams():
    from sklearn.preprocessing import MinMaxScaler
    dfs = []

    for yr in range(22, 26):  # 22, 23, 24, 25
        folder = f"Raw_Data_{yr}"   # adjust case if needed
        csv_path = f"{folder}/Understat_Teams.csv"

        df = pd.read_csv(csv_path).iloc[:,1:]
        dfs.append(df)

    # union all
    columns=["title","date","h_a","deep","deep_allowed","xpts","ppda","ppda_allowed"]
    all_teams = pd.concat(dfs, ignore_index=True, sort=False)
    unioned_df=all_teams[columns]

    unioned_df = unioned_df.copy()
    unioned_df["date"] = pd.to_datetime(unioned_df["date"], errors="coerce")
    unioned_df = unioned_df.sort_values(["title", "date"])

    # 2) Numeric columns (ensure numbers, not strings/objects)
    num_cols = ["deep","deep_allowed","xpts","ppda","ppda_allowed"]
    unioned_df[num_cols] = unioned_df[num_cols].apply(pd.to_numeric, errors="coerce")

    g = unioned_df.groupby("title", sort=False)

    # 3a) Rolling mean INCLUDING current match (last 10)
    roll_inc = pd.DataFrame({
        c: g[c].transform(lambda s: s.ewm(span=12, adjust=False, min_periods=1).mean())
        for c in num_cols
    }).add_prefix("roll10_")  # e.g., roll10_deep

    # 3b) Rolling mean of PREVIOUS 10 (exclude current)  ← what you want
    roll_prev = pd.DataFrame({
        c: g[c].transform(lambda s: s.ewm(span=12, adjust=False, min_periods=1).mean())
        for c in num_cols
    }).add_prefix("roll10prev_")

    # 4) Attach (indexes already aligned via transform)
    unioned_df = pd.concat([unioned_df, roll_inc, roll_prev], axis=1)

    unioned_df = unioned_df.dropna().reset_index(drop=True)
    mapping = {
        "Manchester City": "Man City",
        "Manchester United": "Man Utd",
        "Newcastle United": "Newcastle",
        "Nottingham Forest": "Nott'm Forest",
        "Sheffield United": "Sheffield Utd",
        "Tottenham": "Spurs",                 # if your data has "Tottenham Hotspur", map that too:
        "Tottenham Hotspur": "Spurs",
        "Wolverhampton Wanderers": "Wolves",
    }

    # tidy whitespace then map
    unioned_df["title"] = unioned_df["title"].astype(str).str.strip().replace(mapping)


    #Add history DATA
    history=unioned_df[["title", "date", "roll10prev_deep", "roll10prev_deep_allowed", "roll10prev_xpts", "roll10prev_ppda", "roll10prev_ppda_allowed"]]

    history["date_only"] = pd.to_datetime(history["date"], errors="coerce").dt.date
    num_cols = history.select_dtypes(include="number").columns.tolist()

    team_data = pd.read_csv("Team_data_transformed2.csv").iloc[:, 1:].copy()
    team_data["kickoff_date"] = pd.to_datetime(team_data["kickoff_time"], errors="coerce").dt.date

    right = history[["title", "date_only"] + num_cols].rename(columns={"title": "name"})

    merged = team_data.merge(
        right,
        how="left",
        left_on=["name", "kickoff_date"],
        right_on=["name", "date_only"],
    )
    merged = merged.drop(columns=["date_only"])
    rows_any_nan = merged[merged.isna().any(axis=1)]
    History_merged = merged.fillna(merged.mean(numeric_only=True))

    rename_map = {
        "roll10prev_deep":"roll10_deep",
        "roll10prev_deep_allowed":"roll10_deep_allowed",
        "roll10prev_xpts":"roll10_xpts",
        "roll10prev_ppda":"roll10_ppda",
        "roll10prev_ppda_allowed":"roll10_ppda_allowed",
    }
    History_merged = History_merged.rename(columns=rename_map)
    print(History_merged)
    scale_cols=["roll10_deep","roll10_deep_allowed","roll10_xpts","roll10_ppda","roll10_ppda_allowed" ]
    scaler_prev = MinMaxScaler().fit(History_merged[scale_cols])
    History_merged[scale_cols] = scaler_prev.transform(History_merged[scale_cols])


    History_merged.to_csv("Team_data_transformed2.csv")
    #Add New data
    new_table=unioned_df[["title", "date", "roll10_deep", "roll10_deep_allowed", "roll10_xpts", "roll10_ppda", "roll10_ppda_allowed"]]
    new_table["date_only"] = pd.to_datetime(new_table["date"], errors="coerce").dt.date
    num_cols = new_table.select_dtypes(include="number").columns.tolist()

    team_data = pd.read_csv("Team_data_newest2.csv").iloc[:, 1:].copy()
    team_data["kickoff_date"] = pd.to_datetime(team_data["kickoff_time"], errors="coerce").dt.date

    right = new_table[["title", "date_only"] + num_cols].rename(columns={"title": "name"})

    merged = team_data.merge(
        right,
        how="left",
        left_on=["name", "kickoff_date"],
        right_on=["name", "date_only"],
    )
    merged = merged.drop(columns=["date_only"])
    rows_any_nan = merged[merged.isna().any(axis=1)]
    New_merged = merged.fillna(merged.mean(numeric_only=True))
    New_merged[scale_cols] = scaler_prev.transform(New_merged[scale_cols])


    New_merged.to_csv("Team_data_newest2.csv")


def main_Transform():
    kmeans=make_Kmeans()
    Generate_team_data()
    team_transformed2()
    Understat_teams()
    
    df_26=pd.read_csv("Raw_Data_25/Fantasy_season_2025_data.csv").iloc[:,1:]
    df_26["name"]=df_26["first_name"]+" "+df_26["second_name"]
    df_26["season"]='26'
    
    df_25=pd.read_csv("Raw_Data_24/Fantasy_season_2024_data.csv").iloc[:,1:]
    df_25["name"]=df_25["first_name"]+" "+df_25["second_name"]
    #df_25["name"]=df_25["first_name"]+" "+df_25["second_name"]
    df_25["season"]='25'
    df_24=pd.read_csv("Raw_Data_23/Fantasy_season_2023_data.csv").iloc[:,1:]
    df_24["season"]='24'
    df_23=pd.read_csv("Raw_Data_22/Fantasy_season_2022_data.csv").iloc[:,1:]
    df_23["season"]='23'

    df_all = pd.concat([df_26,df_25,df_24, df_23], ignore_index=True)
    df_all["name"] = df_all["name"].str.replace(" ", "_", n=1, regex=False)
    
    df_all.to_csv("Fantasy_Merged.csv")
    
    
    newest_df = pd.DataFrame()
    Future = 0
    training_df=pd.DataFrame()
    player_pred = []
    element_map = []
    unwanted_players=[]
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
    df_all["name"] = df_all["name"].apply(lambda n: name_map.get(n, n))
    unique_players = df_all[["name"]].drop_duplicates()

    for index, row in unique_players.iterrows():
        data = []
        elem = []
        name = row['name']
        name_string=name
        
        player_df=df_all[(df_all["name"]==name)]
        player_df["kickoff_time"] = pd.to_datetime(player_df["kickoff_time"])  # Convert to datetime
        player_df = player_df.sort_values(by="kickoff_time")  # Sort by datetime
        team = player_df['team_code2'].values[-1]
        team_id=player_df['team_id'].values[-1]
        pos = player_df['position'].values[-1]
        positions=player_df['position'].values

        Own_team_name=player_df['team_name'].values[0]
        element_list=player_df['element'].unique()
        season_list=player_df['season'].unique()
        teamlist=player_df['team_code2'].values

        clusters, home, n_matches, opp_off_a, opp_off_h, opp_def_h, opp_def_a,XGC_DEF,XGC_FWD,XGC_MID,own_XG = next_opp(team_id, Future,kmeans)
        if len(home) < Future:
            home.extend([True] * (Future - len(home)))
        lists = [clusters, home, n_matches, opp_off_a, opp_off_h, opp_def_h, opp_def_a,
         XGC_DEF, XGC_FWD, XGC_MID, own_XG]

        lists = [pad_to_length(lst, Future) for lst in lists]
        (clusters, home, n_matches, opp_off_a, opp_off_h,
        opp_def_h, opp_def_a, XGC_DEF, XGC_FWD, XGC_MID, own_XG) = lists

        player_df=process_player_data(player_df, team, team_id,kmeans)
        mid_table=pd.DataFrame()
        if (player_df["minutes"].sum() < 100):
            unwanted_players.append([name_string, len(player_df),player_df["minutes"].mean()])
        if (len(player_df) > (4)) and (player_df["minutes"].sum() > 100):
            lookback=12
            lb2=12
            poslist = [pos] * len(player_df)
            namelist = [name_string] * len(player_df)
            player_df["position"] = positions
            player_df["name"] = namelist
            player_df["Team"] = teamlist
            player_df["available"] = player_df['minutes'].apply(lambda x: 1 if x > 0 else 0)
            player_df["average_minutes"] = player_df['minutes'].ewm(span=5, adjust=False).mean()
            minutes=player_df["average_minutes"].values[-1]
            player_df, most_common = get_understat(player_df,Own_team_name,pos,element_list,season_list,pos)
            player_df=player_df[player_df['minutes'] > 0]
            player_df["rolling_form"] = player_df['total_points'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_XG"] = player_df['expected_goals'].clip(upper=1.8).ewm(span=lookback, adjust=False).mean()
            player_df["rolling_XA"] = player_df['expected_assists'].clip(upper=1.8).ewm(span=lookback, adjust=False).mean()
            player_df["rolling_GC"] = player_df['goals_conceded'].ewm(span=lb2, adjust=False).mean()
            player_df["rolling_bps"] = player_df['bps'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_GS"] = player_df['goals_scored'].clip(upper=2).ewm(span=lookback, adjust=False).mean()
            player_df["rolling_shots"] = player_df['shots'].ewm(span=lookback, adjust=False).mean()
            mid_table["XG_min"]=(player_df['expected_goals']/player_df['minutes']).copy()*90
            mid_table["XA_min"]=(player_df['expected_assists']/player_df['minutes']).copy()*90
            mid_table["Threat_min"]=(player_df['Threat']/player_df['minutes']).copy()*90
            mid_table["Creativity_min"]=(player_df['creativity']/player_df['minutes']).copy()*90
            
            player_df["rolling_key_passes"] = player_df['key_passes'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_XG_historic"] = player_df['expected_goals'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_XA_historic"] = player_df['expected_assists'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Threat_historic"] = mid_table['Threat_min'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Creativity_historic"] = mid_table['Creativity_min'].rolling(window=30, min_periods=1).mean()
            
            player_df["rolling_bps_historic"] = player_df['bps'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_bonus_historic"] = player_df['bonus'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_bonus"] = player_df['bonus'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_GS_historic"] = player_df['goals_scored'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Assist_historic"] = player_df['assists'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_GC_historic"] = player_df['goals_conceded'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_XGC_historic"] = player_df['expected_goals_conceded'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Assist"] = player_df['assists'].clip(upper=2).ewm(span=lookback, adjust=False).mean()
            player_df["BPS_per_90"] = player_df['bps']/player_df['minutes']
            player_df["Rolling_creativity"]=player_df['creativity'].ewm(span=lookback, adjust=False).mean()
            player_df["Rolling_influence"]=player_df["influence"].ewm(span=lookback, adjust=False).mean()
            player_df["Rolling_BPS_per_90"] =player_df['BPS_per_90'].ewm(span=lookback, adjust=False).mean()
            player_df["XG_Mean"] = player_df['expected_goals'].ewm(span=15, adjust=False).mean()
            player_df["XA_Mean"] = player_df['expected_assists'].ewm(span=15, adjust=False).mean()
            player_df["Shots_Mean"] = player_df['shots'].rolling(window=15, min_periods=1).mean()
            xg_mean_feature=player_df["XG_Mean"].values[-1]
            xa_mean_feature=player_df["XA_Mean"].values[-1]
            shots_mean_feature=player_df["Shots_Mean"].values[-1]
            
            
            if(len(player_df)<4):
                unwanted_players.append([name_string, len(player_df),player_df["minutes"].mean() ])
                continue
            player_df["time"] = range(1, len(player_df) + 1)
            player_df["rolling_Chain"] = player_df['xGChain'].rolling(window=10, min_periods=1).mean()
            player_df["Overscore"] = player_df["rolling_GS"]/player_df["rolling_XG"]
            #player_df["Average_Overscore"]=player_df["Overscore"].rolling(window=12, min_periods=1).mean()
            player_df["Average_Overscore"]=player_df['goals_scored'].rolling(window=30, min_periods=1).sum()/player_df['expected_goals'].rolling(window=30, min_periods=1).sum()
            player_df["rolling_ICT"] = player_df['ICT'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_ICT"] = adjust_measure(player_df, 'ICT')
            #player_df["rolling_Threat"] = player_df['Threat'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_Threat"]=adjust_measure(player_df, 'Threat')
            player_df["Threat_Mean"] = player_df['Threat'].ewm(span=15, adjust=False).mean()
            player_df["Influence_Mean"] = player_df['influence'].rolling(window=15, min_periods=1).mean()
            threat_mean_feature=player_df["Threat_Mean"].values[-1]
            player_df["Adjusted_XG"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["expected_goals"].clip(upper=1) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["expected_goals"].clip(upper=1) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_XG_form"]=player_df['Adjusted_XG'].ewm(span=15, adjust=False).var()
            player_df["Rolling_adjusted_XG"]=adjust_measure(player_df, 'expected_goals')
            player_df["Adjusted_XGC"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["expected_goals_conceded"].clip(upper=2.5) / player_df["XGA"],  # True: expected_goals / XGCA
                    player_df["expected_goals_conceded"].clip(upper=2.5) / player_df["XGH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_XGC"]=player_df['Adjusted_XGC'].rolling(window=8, min_periods=1).mean()
            player_df["Adjusted_XA"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["expected_assists"].clip(upper=1) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["expected_assists"].clip(upper=1) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_XA_form"]=player_df['Adjusted_XA'].ewm(span=15, adjust=False).var()
            player_df["Rolling_adjusted_XA"]=adjust_measure(player_df, 'expected_assists')
            player_df["Adjusted_BPS"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["bps"].clip(upper=50) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["bps"].clip(upper=50) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_BPS"]=player_df['Adjusted_BPS'].ewm(span=lookback, adjust=False).mean()
            player_df["Rolling_adjusted_BPS"]=adjust_measure(player_df, 'bps')
            player_df["Adjusted_Fantasy"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["total_points"].clip(upper=11) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["total_points"].clip(upper=11) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_Fantasy"]=player_df['Adjusted_Fantasy'].ewm(span=lookback, adjust=False).mean()
            
            player_df["OverAssist"] = player_df["rolling_Assist"]/player_df["rolling_XA"]
            player_df["Adjusted_XG_Mean"] = player_df['Adjusted_XG'].rolling(window=15, min_periods=1).mean()
            player_df['XG_slope'] = player_df['Rolling_adjusted_XG'].rolling(window=8, min_periods=1).apply(rolling_slope, raw=True)
            player_df['XA_slope'] = player_df['Rolling_adjusted_XA'].rolling(window=8, min_periods=1).apply(rolling_slope, raw=True)
            player_df['Threat_slope'] = player_df['rolling_Threat'].rolling(window=8, min_periods=1).apply(rolling_slope, raw=True)
            player_df['Influence_slope'] = player_df['Influence_Mean'].rolling(window=15, min_periods=1).apply(rolling_slope, raw=True)
            
            cluster_df = player_df.sort_values(['Cluster', 'time']).copy()
            cluster_df['expected_goals'] = cluster_df['expected_goals'].clip(upper=1)
            cluster_df['expected_assists'] = cluster_df['expected_assists'].clip(upper=1)
            cluster_df['Cluster_XG'] = (cluster_df.groupby('Cluster')['expected_goals'].transform(lambda x: x.shift(1).rolling(window=8, min_periods=1).mean()))
            cluster_df['Cluster_XA'] = (cluster_df.groupby('Cluster')['expected_assists'].transform(lambda x: x.shift(1).rolling(window=8, min_periods=1).mean()))
            
            cluster_df['kickoff_time'] = pd.to_datetime(cluster_df['kickoff_time'])
            latest_rows = cluster_df.loc[cluster_df.groupby('Cluster')['kickoff_time'].idxmax()]
            latest_rows_cluster = latest_rows[['name','Cluster','Cluster_XG','Cluster_XA']]
            
            cluster_df = cluster_df.sort_values('time')
            
            player_df['Cluster_XG']=cluster_df['Cluster_XG'].values
            player_df['Cluster_XA']=cluster_df['Cluster_XA'].values
            
            player_df["rolling_Adjusted_XG_historic"] = player_df['Adjusted_XG'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Adjusted_XA_historic"] = player_df['Adjusted_XA'].rolling(window=30, min_periods=1).mean()
            player_df["Share_of_XG"]=player_df['expected_goals'].rolling(window=20, min_periods=1).sum()/player_df["Team_XG"].rolling(window=20, min_periods=1).sum()
            player_df["Share_of_XA"]=player_df['expected_assists'].rolling(window=20, min_periods=1).sum()/player_df["Team_XA"].rolling(window=20, min_periods=1).sum()
            player_df['defcon_adjusted'] = np.where(player_df['position'].eq('DEF'),player_df['defcon'].clip(upper=13),player_df['defcon'].clip(upper=15))
            player_df['defcon_hit_rate'] = ((player_df['position'].eq('DEF') & player_df['defcon'].gt(10)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(12))).astype(int)
            player_df['defcon_avg'] = player_df['defcon_adjusted'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()
            player_df['defcon_avg_hit_rate'] = player_df['defcon_hit_rate'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()


            if(namelist[0]=="Mohamed_Salah"):
                latest_rows_cluster.to_csv("test_cluster.csv")
                cluster_df[['name','Cluster','Cluster_XG','Cluster_XA','expected_goals']].to_csv("test_cluster2.csv")


            adjusted_xg_mean_feature=player_df["Adjusted_XG_Mean"].values[-1]
            #player_df["Average_OverAssist"]=player_df["OverAssist"].rolling(window=12, min_periods=1).mean()
            player_df["Average_OverAssist"]=player_df['assists'].rolling(window=15, min_periods=1).sum()/player_df['expected_assists'].rolling(window=15, min_periods=1).sum()
            
            player_df["Clipped_XG"]=player_df['expected_goals'].clip(upper=0.8) 
            player_df["Clipped_XA"]=player_df['expected_assists'].clip(upper=0.8) 
            player_df["Clipped_PBS"]=player_df['bps'].clip(upper=35) 
            
            clusters=player_df["Cluster"].unique()
            for clust in clusters:
                col_name=f'XG_vs_{clust}'
                is_cluster=player_df["Cluster"]==clust
                player_df[col_name]=(
                    player_df[is_cluster].groupby('name')['Clipped_XG']  
                    .rolling(window=8, min_periods=1).mean()
                    .reset_index(level=0, drop=True)
                )
                player_df[col_name]=player_df[col_name].ffill()
                
            for clust in clusters:
                col_name=f'XA_vs_{clust}'
                is_cluster=player_df["Cluster"]==clust
                player_df[col_name]=(
                    player_df[is_cluster].groupby('name')['Clipped_XA']
                    .rolling(window=8, min_periods=1).mean()
                    .reset_index(level=0, drop=True)
                )
                player_df[col_name]=player_df[col_name].ffill()
                
            for clust in clusters:
                col_name=f'BPS_vs_{clust}'
                is_cluster=player_df["Cluster"]==clust
                player_df[col_name]=(
                    player_df[is_cluster].groupby('name')['Clipped_PBS'] 
                    .rolling(window=8, min_periods=1).mean()
                    .reset_index(level=0, drop=True)
                )
                player_df[col_name]=player_df[col_name].ffill()
                
            player_df = player_df.ffill()
            
            
            future = player_df.iloc[-1:, :].copy()
            future2=player_df.shift(1).iloc[-1:, :].copy()
            future["season"] = '30'
            future["minutes"]=90
            future["gamepos"] = most_common
            future["average_minutes"] = minutes
            future["XG_Mean"] = xg_mean_feature
            future["XA_Mean"]= xa_mean_feature
            future["XG_Mean_difference"]=(future["expected_goals"]-future["XG_Mean"])/future["XG_Mean"]
            future["XA_Mean_difference"]=(future["expected_assists"]-future["XA_Mean"])/future["XG_Mean"]
            future["Shot_Mean_difference"]=(future["rolling_shots"]-shots_mean_feature)/shots_mean_feature
            future["Threat_Mean_difference"]=(future["rolling_Threat"]-threat_mean_feature)/threat_mean_feature
            future["Adjusted_XG_Mean_difference"]=(future2["Rolling_adjusted_XG"]-adjusted_xg_mean_feature)/adjusted_xg_mean_feature
            newest_df=pd.concat([future, newest_df], axis=0, ignore_index=True)

                    
            player_df["Rolling_adjusted_XA2"]=player_df["Rolling_adjusted_XA"].shift(1)
            player_df["Rolling_adjusted_BPS2"]=player_df["Rolling_adjusted_BPS"].shift(1)
            player_df["Rolling_adjusted_Fantasy2"]=player_df["Rolling_adjusted_Fantasy"].shift(1)
            player_df["Rolling_creativity"]=player_df["Rolling_creativity"].shift(1)
            player_df["Rolling_influence"]=player_df["Rolling_influence"].shift(1)
            player_df["Rolling_adjusted_XG2"]=player_df["Rolling_adjusted_XG"].shift(1)
            player_df["Rolling_adjusted_XGC2"]=player_df["Rolling_adjusted_XGC"].shift(1)
            player_df["Rolling_BPS_per_90"]=player_df["Rolling_BPS_per_90"].shift(1)
            player_df["rolling_shots"]=player_df["rolling_shots"].shift(1)
            player_df["rolling_key_passes"]=player_df["rolling_key_passes"].shift(1)
            player_df["rolling_Threat"]=player_df["rolling_Threat"].shift(1)
            player_df["rolling_ICT"]=player_df["rolling_ICT"].shift(1)
            player_df["rolling_bonus"]=player_df["rolling_bonus"].shift(1)
            player_df["rolling_form"]=player_df["rolling_form"].shift(1)
            player_df["rolling_GS"]=player_df["rolling_GS"].shift(1)
            player_df["Rolling_adjusted_XG_form"]=player_df["Rolling_adjusted_XG_form"].shift(1)
            player_df["Rolling_adjusted_XA_form"]=player_df["Rolling_adjusted_XA_form"].shift(1)
            player_df["XG_Mean"]=player_df["XG_Mean"].shift(1)
            player_df["XA_Mean"]=player_df["XA_Mean"].shift(1)
            player_df["Shots_Mean"]=player_df["Shots_Mean"].shift(1)
            player_df["Threat_Mean"]=player_df["Threat_Mean"].shift(1)
            player_df["Adjusted_XG_Mean"]=player_df["Adjusted_XG_Mean"].shift(1)
            player_df["XG_Mean_difference"]=(player_df["expected_goals"]-player_df["XG_Mean"])/player_df["XG_Mean"]
            player_df["XA_Mean_difference"]=(player_df["expected_assists"]-player_df["XA_Mean"])/player_df["XA_Mean"]
            player_df["Shot_Mean_difference"]=(player_df["rolling_shots"]-player_df["Shots_Mean"])/player_df["Shots_Mean"]
            player_df["Threat_Mean_difference"]=(player_df["rolling_Threat"]-player_df["Threat_Mean"])/player_df["Threat_Mean"]
            player_df["Adjusted_XG_Mean_difference"]=(player_df["Rolling_adjusted_XG2"]-player_df["Adjusted_XG_Mean"])/player_df["Adjusted_XG_Mean"]


            """xg_cluster_list=[]
            xa_cluster_list=[]
            for u in range(Future):
                cluster1=clusters[u]
                xg_cluster=latest_rows_cluster[latest_rows_cluster["Cluster"]==cluster1]["Cluster_XG"]
                if not xg_cluster.empty:
                    xg_cluster_list.append(xg_cluster.values[0])
                else:
                    xg_cluster_list.append(future["rolling_XG"].values[-1])
                xa_cluster=latest_rows_cluster[latest_rows_cluster["Cluster"]==cluster1]["Cluster_XA"]
                if not xa_cluster.empty:
                    xa_cluster_list.append(xa_cluster.values[0])
                else:
                    xa_cluster_list.append(future["rolling_XA"].values[-1])
                
            future["Cluster_XG"]=xg_cluster_list
            future["Cluster_XA"]=xa_cluster_list"""
                    
                    
                    
            training_df=pd.concat([training_df, player_df], axis=0, ignore_index=True)
    float_cols = [col for col in training_df.select_dtypes(include=['float64']).columns if col not in ["XG_slope","XA_slope","Threat_slope"]]  
    float_cols2 = [col for col in newest_df.select_dtypes(include=['float64']).columns if col not in ["XG_slope","XA_slope","Threat_slope"]]  
    newest_df[float_cols2] = newest_df[float_cols2].round(2)
    training_df[float_cols] = training_df[float_cols].round(2)
    
    unwanted_df=pd.DataFrame(unwanted_players, columns=["Name", "N_games", "Average_minutes"])
    unwanted_df.to_csv("Unwanted_players.csv")
    training_df.to_csv("testML4.csv")
    newest_df.to_csv("Player_future.csv")
    
from scipy.stats import linregress

def rolling_slope(sub_df):
    if len(sub_df) < 1:  # Need at least 2 points for regression
        return np.nan
    x = np.arange(len(sub_df))  # Create a time index [0,1,2,...]
    y = sub_df  # Get values of the rolling window
    slope, _, _, _, _ = linregress(x, y)  # Compute regression slope
    return slope

def adjust_measure(df, measure_name):  
    player_df=df.copy()
    clipper_val=player_df[measure_name].max()
    std=player_df[measure_name].std()
    #player_df[measure_name] = player_df[measure_name].clip(lower=0.0, upper=1.5)
    n_matches=len(player_df)
    new_expected_goals=[]
    current_expected_goals_start_value=player_df[measure_name].mean()
    current_expected_goals=current_expected_goals_start_value
    smoothing_f=0.08
    min_val=std*1.5
    count=0
    in_row=0
    in_row_fac=1
    for i in range(len(player_df)):
        count+=1
        offset=max(1,2-count*0.05)
        home=player_df["was_home"].values[i]
        if home:
            pred_scored=current_expected_goals*player_df["XGCA"].values[i]*np.minimum(1, player_df['minutes'].values[i] / 60)
            if(abs(player_df[measure_name].values[i]-pred_scored)>min_val):
                in_row+=1   
            else:
                in_row=0
                in_row_fac=1
            if(in_row>2):
                in_row_fac=1.5

            new_expected_goals.append(min(clipper_val,current_expected_goals+in_row_fac*offset*smoothing_f*min(min_val,max(-min_val,player_df[measure_name].values[i]-pred_scored))))
            current_expected_goals=new_expected_goals[-1]
                
        else:
            pred_scored=current_expected_goals*player_df["XGCH"].values[i]*np.minimum(1, player_df['minutes'].values[i] / 60)
            if(abs(player_df[measure_name].values[i]-pred_scored)>min_val):
                in_row+=1   
            else:
                in_row=0
                in_row_fac=1
            if(in_row>=2):
                in_row_fac=1.5
            new_expected_goals.append(min(clipper_val,current_expected_goals+in_row_fac*offset*smoothing_f*min(min_val,max(-min_val,player_df[measure_name].values[i]-pred_scored))))
            current_expected_goals=new_expected_goals[-1]
    return new_expected_goals  
def pad_to_length(lst, length):
    if len(lst) < length:
        lst.extend([0] * (length - len(lst)))
    return lst  

if __name__ == "__main__":
    main_Transform()   
