import pandas as pd
import os
import numpy as np
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from collections import defaultdict
import glob
import requests
from scipy.stats import mode
import xgboost as xgb
from sklearn.svm import SVR
import joblib
from GenerateConfig import normalize_player_name
from GenerateConfig import Understat_Team_MAP

def make_Kmeans():

    teams=pd.read_csv("Team_data_transformed2.csv")[["code","name", "XGH","XGCH","XGA","XGCA"]]

    cluster_data=teams.iloc[:,2:].values


    kmeans = KMeans(n_clusters=4, random_state=32)
    kmeans.fit(cluster_data)
    joblib.dump(kmeans, 'kmeans_Groundmodel.pkl')

    teams["predict"]=kmeans.predict(cluster_data)
    teams.to_csv("team_clusters.csv")
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
    own_saves=[]
    opp_saves=[]
    opp_defcon=[]
    team_defcon=[]
    rolling_team_defcon=[]
    teams_dataset=pd.read_csv("Team_data_transformed2.csv")
    teams_dataset["kickoff_time_dt"] = pd.to_datetime(teams_dataset["kickoff_time"], errors="coerce", utc=True)
    teams_dataset["code"] = pd.to_numeric(teams_dataset["code"], errors="coerce").astype("Int64")

    player_df = player_df.copy()
    player_df["kickoff_time_dt"] = pd.to_datetime(player_df["kickoff_time"], errors="coerce", utc=True)
    player_df["kickoff_time"] = player_df["kickoff_time_dt"].dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    player_df["opponent_code"] = pd.to_numeric(player_df["opponent_code"], errors="coerce").astype("Int64")
    player_df["team_code2"] = pd.to_numeric(player_df["team_code2"], errors="coerce").astype("Int64")

    required_cols = [
        "XGH", "XGCH", "XGA", "XGCA",
        "XG_DEF", "XG_FORWARD", "XG_MID",
        "Round_XG", "Round_XA", "Rolling_Saves", "Rolling_Defcon_against","defensive_contribution"
    ]
    fallback_vals = {}
    for c in required_cols:
        fallback_vals[c] = float(pd.to_numeric(teams_dataset.get(c, pd.Series(dtype=float)), errors="coerce").mean())
        if not np.isfinite(fallback_vals[c]):
            fallback_vals[c] = 0.0

    def _find_team_row(ts: pd.Timestamp, code: int):
        if pd.isna(code):
            return pd.DataFrame()

        code_rows = teams_dataset[teams_dataset["code"] == int(code)].copy()
        if code_rows.empty and "id" in teams_dataset.columns:
            team_id_num = pd.to_numeric(teams_dataset["id"], errors="coerce")
            code_rows = teams_dataset[team_id_num == int(code)].copy()
        if code_rows.empty:
            return pd.DataFrame()

        # 1) exact kickoff match
        if pd.notna(ts):
            ts = pd.Timestamp(ts)
            if ts.tzinfo is None:
                ts = ts.tz_localize("UTC")
            else:
                ts = ts.tz_convert("UTC")

            exact = code_rows[code_rows["kickoff_time_dt"] == ts]
            if not exact.empty:
                return exact.sort_values(by="kickoff_time_dt", ascending=False).head(1)

            # 2) latest row at or before kickoff in same season timeline
            prev_rows = code_rows[code_rows["kickoff_time_dt"] <= ts]
            if not prev_rows.empty:
                return prev_rows.sort_values(by="kickoff_time_dt", ascending=False).head(1)

            # 3) month-year fallback
            month_rows = code_rows[
                (code_rows["kickoff_time_dt"].dt.month == ts.month) &
                (code_rows["kickoff_time_dt"].dt.year == ts.year)
            ]
            if not month_rows.empty:
                return month_rows.sort_values(by="kickoff_time_dt", ascending=False).head(1)

        # 4) final fallback: latest available row for the team
        return code_rows.sort_values(by="kickoff_time_dt", ascending=False).head(1)

    def _row_val(row_df: pd.DataFrame, col: str) -> float:
        if row_df.empty or col not in row_df.columns:
            return fallback_vals.get(col, 0.0)
        val = pd.to_numeric(row_df[col], errors="coerce")
        if len(val) == 0 or pd.isna(val.values[0]):
            return fallback_vals.get(col, 0.0)
        return float(val.values[0])

    for i in range(len(df)):
        opponent = player_df["opponent_code"].values[i]
        own_code = player_df["team_code2"].values[i]
        kickoff_dt = player_df["kickoff_time_dt"].iloc[i]
        if pd.notna(kickoff_dt):
            kickoff_dt = pd.Timestamp(kickoff_dt)
            if kickoff_dt.tzinfo is None:
                kickoff_dt = kickoff_dt.tz_localize("UTC")
            else:
                kickoff_dt = kickoff_dt.tz_convert("UTC")
        else:
            kickoff_dt = pd.NaT

        opp_row = _find_team_row(kickoff_dt, opponent)
        own_row = _find_team_row(kickoff_dt, own_code)

        own_xgh = _row_val(own_row, "XGH")
        own_xgch = _row_val(own_row, "XGCH")
        own_xga = _row_val(own_row, "XGA")
        own_xgca = _row_val(own_row, "XGCA")

        opp_xgh = _row_val(opp_row, "XGH")
        opp_xgch = _row_val(opp_row, "XGCH")
        opp_xga = _row_val(opp_row, "XGA")
        opp_xgca = _row_val(opp_row, "XGCA")

        own_stat = [[own_xgh, own_xgch, own_xga, own_xgca]]
        new_opp_stat = [[opp_xgh, opp_xgch, opp_xga, opp_xgca]]
        
        if(df["was_home"].values[i]==1):
            own_att_stat.append(own_xgh)
        else:
            own_att_stat.append(own_xga)
 
        XGH.append(opp_xgh)
        XGCH.append(opp_xgch)
        XGA.append(opp_xga)
        XGCA.append(opp_xgca)
        dfXG.append(_row_val(opp_row, "XG_DEF"))
        forXG.append(_row_val(opp_row, "XG_FORWARD"))
        midXG.append(_row_val(opp_row, "XG_MID"))

        cluster = kmeans.predict(new_opp_stat)[0]
        opp_cluster.append(cluster)
        o_cluster = kmeans.predict(own_stat)[0]
        own_cluster.append(o_cluster)
        own_team_xgs.append(_row_val(own_row, "Round_XG"))
        own_team_xas.append(_row_val(own_row, "Round_XA"))
        own_saves.append(_row_val(own_row, "Rolling_Saves"))
        opp_saves.append(_row_val(opp_row, "Rolling_Saves_Against"))
        opp_defcon.append(_row_val(opp_row, "Rolling_Defcon_against"))
        team_defcon.append(_row_val(own_row, "defensive_contribution"))
        rolling_team_defcon.append(_row_val(own_row, "Rolling_Defcon_for"))
        

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
    df["Team_Rolling_Saves"]=own_saves
    df["Opponent_Saves_against"]=opp_saves
    df["Opponent_defcon"]=opp_defcon
    df["Rolling_Defcon_For"]=rolling_team_defcon
    df["Team_defcon"]=team_defcon
    df["yellow_cards"]=player_df['yellow_cards'].values
    df["red_cards"]=player_df['red_cards'].values

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
            
            saves=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['saves'].sum()
            ict_index=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['ict_index'].sum()
            
            XA=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['expected_assists'].sum()
            A=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['assists'].sum()
            red_cards=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['red_cards'].sum()
            team_data["defensive_contribution"] = team_data.get("defensive_contribution",0)
            defensive_contribution=team_data.groupby('kickoff_time').filter(lambda x: len(x) >= 5).groupby('kickoff_time')['defensive_contribution'].sum()
            
            
 
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
                Threats1=Threat.values[k]
                if(XGC1==0):
                    XGCS.append(GC.values[k])
                else:
                    XGCS.append((GC.values[k]*0.3+XGC1*0.7))
                if(XG1==0):
                    XGs.append(GS.values[k])
                else:
                    XGs.append((GS.values[k]*0.25+XG1*0.55+0.002*Threat.values[k]))
                    
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
            
            Played_against_df["defensive_contribution"] = Played_against_df.get("defensive_contribution", 0)
            Defconagainst = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                values='defensive_contribution',        # The values to aggregate will be 'expected_goals'
                aggfunc='sum'                   # Summing the 'expected_goals' for each group
            ).reset_index()
            
            Savesagainst = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                values='saves',        # The values to aggregate will be 'expected_goals'
                aggfunc='sum'                   # Summing the 'expected_goals' for each group
            ).reset_index()
            
            
            ict_indexagainst = Played_against_df.pivot_table(
                index='kickoff_time',           # Rows will be based on 'kickoff_time'
                values='ict_index',        # The values to aggregate will be 'expected_goals'
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
            New_team_df["saves"]=saves.values
            New_team_df["ict_index"]=ict_index.values
            New_team_df["red_cards"]=red_cards.values
            New_team_df["defensive_contribution"]=defensive_contribution.values
            
            New_team_df["Threat_against"]=Threatagainst['threat'].values
            New_team_df["XGC"]=New_team_df["XGC"]*0.8+0.002*New_team_df["Threat_against"]
            New_team_df["Defcon_against"]=Defconagainst['defensive_contribution'].values
            New_team_df["Defcon_against"]=New_team_df['Defcon_against'].clip(lower=0, upper=115)
            New_team_df["Saves_against"]=Savesagainst['saves'].values
            New_team_df["ICT_against"]=ict_indexagainst['ict_index'].values
            
            New_team_df["Plain_XG"]=XG.values
            New_team_df["Plain_XGC"]=XGC.values
            New_team_df["Plain_GS"]=GS.values
            New_team_df["Plain_GC"]=GC.values
            
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
    full_team_data["kickoff_time"] = pd.to_datetime(full_team_data["kickoff_time"], errors="coerce")
    full_team_data = full_team_data.sort_values(["code", "kickoff_time"]).reset_index(drop=True)

    SHORT = 8
    MEDIUM = 18
    LONG = 30
    HORIZONS = [SHORT, MEDIUM, LONG]
    cap_lower = 0.5
    cap_upper = 3.5

    rolling_cols = ['Plain_GS', 'Plain_GC', 'Plain_XGC', 'Plain_XG','Threat','Threat_against']

    for col in rolling_cols:
        capped_col = f'{col}_capped'
        if(col in ['Threat','Threat_against'] ):
            full_team_data[capped_col] = full_team_data[col].clip(lower=40, upper=300)
        else:
            full_team_data[capped_col] = full_team_data[col].clip(lower=cap_lower, upper=cap_upper)

        for horizon in HORIZONS:
            full_team_data[f'{col}_roll{horizon}'] = (
                full_team_data
                .groupby('code')[capped_col]
                .transform(
                    lambda s: s.rolling(
                        window=horizon,
                        min_periods=1
                    ).mean()
                )
            )

    full_team_data['Offensive_Index'] = (
        0.2 * (0.5 * full_team_data[f'Plain_XG_roll{SHORT}'] + 0.3 * full_team_data[f'Plain_GS_roll{SHORT}']+ 0.2 *0.01* full_team_data[f'Threat_roll{SHORT}'])
        +
        0.3 * (0.5 * full_team_data[f'Plain_XG_roll{MEDIUM}'] + 0.3 * full_team_data[f'Plain_GS_roll{MEDIUM}']+ 0.2 *0.01*  full_team_data[f'Threat_roll{MEDIUM}'])
        +
        0.5 * (0.5 * full_team_data[f'Plain_XG_roll{LONG}'] + 0.3 * full_team_data[f'Plain_GS_roll{LONG}']+ 0.2 *0.01*  full_team_data[f'Threat_roll{LONG}'])
    )

    full_team_data['Defensive_Index'] = (
        0.2 * (0.5 * full_team_data[f'Plain_XGC_roll{SHORT}'] + 0.3 * full_team_data[f'Plain_GC_roll{SHORT}']+ 0.2 *0.01*  full_team_data[f'Threat_against_roll{SHORT}'])
        +
        0.3 * (0.5 * full_team_data[f'Plain_XGC_roll{MEDIUM}'] + 0.3 * full_team_data[f'Plain_GC_roll{MEDIUM}']+ 0.2 *0.01*  full_team_data[f'Threat_against_roll{MEDIUM}'])
        +
        0.5 * (0.5 * full_team_data[f'Plain_XGC_roll{LONG}'] + 0.3 * full_team_data[f'Plain_GC_roll{LONG}']+ 0.2 *0.01* full_team_data[f'Threat_against_roll{LONG}'])
    )

    teams=full_team_data["name"].unique()
    ALL_teams=pd.DataFrame()
    newest_data=pd.DataFrame()
    clip_val=3.5
    for i in range(len(teams)):
        team=teams[i]
        team_data=full_team_data[full_team_data["name"]==team]
        away_team=team_data[team_data["was_home"]==False]
        home_team=team_data[team_data["was_home"]==True]
        home_team['XGH']=np.clip(home_team['XG'], None, clip_val).rolling(window=15, min_periods=1).mean()
        home_team['XGCH']=np.clip(home_team['XGC'], None, clip_val).rolling(window=15, min_periods=1).mean()
        away_team['XGA']=np.clip(away_team['XG'], None, clip_val).rolling(window=15, min_periods=1).mean()
        away_team['XGCA']=np.clip(away_team['XGC'], None, clip_val).rolling(window=15, min_periods=1).mean()
        
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
        new_team['XGH']=new_team['XGH']*0.5+np.clip(new_team['XG'], None, clip_val).rolling(window=20, min_periods=1).mean()*0.5
        new_team['XGA']=new_team['XGA']*0.5+np.clip(new_team['XG'], None, clip_val).rolling(window=20, min_periods=1).mean()*0.5
        new_team['XGCH']=new_team['XGCH']*0.5+np.clip(new_team['XGC'], None, clip_val).rolling(window=20, min_periods=1).mean()*0.5
        new_team['XGCA']=new_team['XGCA']*0.5+np.clip(new_team['XGC'], None, clip_val).rolling(window=20, min_periods=1).mean()*0.5
        new_team['XG_avg']=new_team['XG'].rolling(window=20, min_periods=1).mean()
        new_team['XGC_avg']=new_team['XGC'].rolling(window=20, min_periods=1).mean()
        
        new_team['Rolling_Threat']=new_team['Threat'].rolling(window=20, min_periods=1).mean()
        new_team['Rolling_Saves']=new_team['saves'].rolling(window=20, min_periods=1).mean()
        new_team['Rolling_ict_index']=new_team['ict_index'].rolling(window=20, min_periods=1).mean()
        new_team['Rolling_Defcon_for']=new_team['defensive_contribution'].where(new_team['defensive_contribution'] > 0).rolling(25, min_periods=1).mean()
        new_team['Rolling_Threat_Against']=new_team['Threat_against'].rolling(window=20, min_periods=1).mean()
        new_team['Rolling_Defcon_against']=new_team['Defcon_against'].where(new_team['Defcon_against'] > 0).rolling(25, min_periods=1).mean()
        
        new_team['Rolling_ICT_Against']=new_team['ICT_against'].rolling(window=20, min_periods=1).mean()
        new_team['Rolling_Saves_Against']=new_team['Saves_against'].rolling(window=20, min_periods=1).mean()
        
        new_team['XG_slope']=new_team['XG_avg'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        new_team['XGC_slope']=new_team['XGC_avg'].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        new_team["Rolling_Threat"]=new_team["Rolling_Threat"]/100
        new_team["Rolling_Threat_Against"]=new_team["Rolling_Threat_Against"]/100
        new_team["Rolling_XG"]=new_team['XG'].ewm(span=20, adjust=False).mean()
        new_team["Rolling_XGC"]=new_team['XGC'].ewm(span=20, adjust=False).mean()
        
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
        new_team["Rolling_Defcon_for"]=new_team["Rolling_Defcon_for"].shift(1, fill_value=77)
        new_team["Rolling_ict_index"]=new_team["Rolling_ict_index"].shift(1, fill_value=60)

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
import math
import numpy as np
import pandas as pd


import math
import numpy as np
import pandas as pd

def predict_xg_from_indices(A: float, B: float) -> float:
    z = -1.807 + 0.848 * A + 0.91 * B - 0.128 * A * B
    return math.exp( z)


def rolling_slope(x: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    n = len(x)
    if n < 2:
        return 0.0
    t = np.arange(n, dtype=float)
    t_mean = t.mean()
    x_mean = x.mean()
    denom = np.sum((t - t_mean) ** 2)
    if denom == 0:
        return 0.0
    return float(np.sum((t - t_mean) * (x - x_mean)) / denom)


def _run_one_pass(
    team_df: pd.DataFrame,
    teams,
    team_avg_xg,
    team_avg_xgc,
    global_avg_xg,
    global_avg_xgc,
    k_off: float,
    k_def: float,
    min_val: float,
    OBS_LO: float = 0.5,
    OBS_HI: float = 3.2,
    use_squared_updates: bool = True,
    error_split: float = 0.5,
    debug_print: bool = True,
    debug_max_rows: int | None = None,
):
    # priors
    off_rating = {t: float(team_avg_xg.get(t, global_avg_xg)) for t in teams}
    def_rating = {t: float(team_avg_xgc.get(t, global_avg_xgc)) for t in teams}

    # home/away split components
    off_rating_home = off_rating.copy()
    def_rating_home = def_rating.copy()
    off_rating_away = off_rating.copy()
    def_rating_away = def_rating.copy()

    # NEW: neutral components (no home/away accounting)
    off_rating_neutral = off_rating.copy()
    def_rating_neutral = def_rating.copy()

    off_rating_history = {t: [off_rating[t]] for t in teams}
    def_rating_history = {t: [def_rating[t]] for t in teams}
    off_rating_home_history = {t: [off_rating_home[t]] for t in teams}
    def_rating_home_history = {t: [def_rating_home[t]] for t in teams}
    off_rating_away_history = {t: [off_rating_away[t]] for t in teams}
    def_rating_away_history = {t: [def_rating_away[t]] for t in teams}

    # NEW: neutral histories
    off_rating_neutral_history = {t: [off_rating_neutral[t]] for t in teams}
    def_rating_neutral_history = {t: [def_rating_neutral[t]] for t in teams}
    
    xg_pred_history = {t: [off_rating_neutral[t]] for t in teams}
    xgc_pred_history= {t: [off_rating_neutral[t]] for t in teams}

    # ELO
    elo_rating = {t: 1000.0 for t in teams}
    elo_history = {t: [1000.0] for t in teams}
    elo_debug_rows = []
    k_elo = 30.0

    error_xg = []
    error_xgc = []

    def signed_sq(err: float) -> float:
        return err * abs(err)

    w_off = float(np.clip(error_split, 0.0, 1.0))
    w_def = float(np.clip(1.0 - error_split, 0.0, 1.0))

    # ELO margin knobs
    xgcap = 1.0
    beta = 0.6

    for i, (_, row) in enumerate(team_df.iterrows(), start=1):
        if debug_max_rows is not None and i > debug_max_rows:
            break

        was_home = int(row["was_home"])
        team = int(row["code"])
        opponent = int(row["opponent"])

        actual_xg = float(np.clip(row["XG"], OBS_LO, OBS_HI))
        actual_xgc = float(np.clip(row["XGC"], OBS_LO, OBS_HI))

        # global component
        team_off = off_rating[team]
        team_def = def_rating[team]
        opp_off = off_rating[opponent]
        opp_def = def_rating[opponent]

        expected_goals = predict_xg_from_indices(A=team_off, B=opp_def)
        expected_goals_conceded = predict_xg_from_indices(A=opp_off, B=team_def)

        # errors
        err_xg = actual_xg - expected_goals
        err_xgc = actual_xgc - expected_goals_conceded

        # update signal
        if use_squared_updates:
            upd_xg = signed_sq(err_xg)
            upd_xgc = signed_sq(err_xgc)
        else:
            upd_xg = err_xg
            upd_xgc = err_xgc

        applied_term_off_preclip = w_off * upd_xg
        applied_term_def_preclip = w_def * upd_xgc

        clipped_off = float(np.clip(applied_term_off_preclip, -min_val, min_val))
        clipped_def = float(np.clip(applied_term_def_preclip, -min_val, min_val))

        delta_off = float(k_off * clipped_off)
        delta_def = float(k_def * clipped_def)

        if debug_print:
            kt = row.get("kickoff_time", "")
            print(
                f"[{i}] team={team} opp={opponent} home={was_home} time={kt}\n"
                f"    XG:  actual={actual_xg:.3f} expected={expected_goals:.3f} err={err_xg:.3f} "
                f"w_off={w_off:.2f} upd_signal={upd_xg:.3f} applied={applied_term_off_preclip:.3f} "
                f"clipped={clipped_off:.3f} delta={delta_off:.4f}\n"
                f"    XGC: actual={actual_xgc:.3f} expected={expected_goals_conceded:.3f} err={err_xgc:.3f} "
                f"w_def={w_def:.2f} upd_signal={upd_xgc:.3f} applied={applied_term_def_preclip:.3f} "
                f"clipped={clipped_def:.3f} delta={delta_def:.4f}"
            )

        # apply global updates
        off_rating[team] = max(0.5, team_off + delta_off)
        def_rating[team] = max(0.5, team_def + delta_def)

        error_xg.append(err_xg**2 if use_squared_updates else abs(err_xg))
        error_xgc.append(err_xgc**2 if use_squared_updates else abs(err_xgc))

        off_rating_history[team].append(off_rating[team])
        def_rating_history[team].append(def_rating[team])

        # NEW: update neutral (venue-agnostic) component every game
        team_off_n = off_rating_neutral[team]
        team_def_n = def_rating_neutral[team]
        opp_off_n = off_rating_neutral[opponent]
        opp_def_n = def_rating_neutral[opponent]

        exp_xg_n = predict_xg_from_indices(A=team_off_n, B=opp_def_n)
        exp_xgc_n = predict_xg_from_indices(A=opp_off_n, B=team_def_n)

        err_xg_n = actual_xg - exp_xg_n
        err_xgc_n = actual_xgc - exp_xgc_n

        upd_xg_n = signed_sq(err_xg_n) if use_squared_updates else err_xg_n
        upd_xgc_n = signed_sq(err_xgc_n) if use_squared_updates else err_xgc_n

        off_rating_neutral[team] = max(
            0.5,
            team_off_n + k_off * w_off * np.clip(upd_xg_n, -min_val, min_val)
        )
        def_rating_neutral[team] = max(
            0.5,
            team_def_n + k_def * w_def * np.clip(upd_xgc_n, -min_val, min_val)
        )

        off_rating_neutral_history[team].append(off_rating_neutral[team])
        def_rating_neutral_history[team].append(def_rating_neutral[team])
        
        xg_pred_history[team].append(exp_xg_n)
        xgc_pred_history[team].append(exp_xgc_n)
        # split updates (home/away)
        if was_home == 1:
            team_off_h = off_rating_home[team]
            team_def_h = def_rating_home[team]
            opp_off_a = off_rating_away[opponent]
            opp_def_a = def_rating_away[opponent]

            exp_xg_h = predict_xg_from_indices(A=team_off_h, B=opp_def_a)
            exp_xgc_h = predict_xg_from_indices(A=opp_off_a, B=team_def_h)

            err_xg_h = actual_xg - exp_xg_h
            err_xgc_h = actual_xgc - exp_xgc_h

            upd_xg_h = signed_sq(err_xg_h) if use_squared_updates else err_xg_h
            upd_xgc_h = signed_sq(err_xgc_h) if use_squared_updates else err_xgc_h

            off_rating_home[team] = max(
                0.5,
                team_off_h + k_off * w_off * np.clip(upd_xg_h, -min_val, min_val)
            )
            def_rating_home[team] = max(
                0.5,
                team_def_h + k_def * w_def * np.clip(upd_xgc_h, -min_val, min_val)
            )
        else:
            team_off_a = off_rating_away[team]
            team_def_a = def_rating_away[team]
            opp_off_h = off_rating_home[opponent]
            opp_def_h = def_rating_home[opponent]

            exp_xg_a = predict_xg_from_indices(A=team_off_a, B=opp_def_h)
            exp_xgc_a = predict_xg_from_indices(A=opp_off_h, B=team_def_a)

            err_xg_a = actual_xg - exp_xg_a
            err_xgc_a = actual_xgc - exp_xgc_a

            upd_xg_a = signed_sq(err_xg_a) if use_squared_updates else err_xg_a
            upd_xgc_a = signed_sq(err_xgc_a) if use_squared_updates else err_xgc_a

            off_rating_away[team] = max(
                0.5,
                team_off_a + k_off * w_off * np.clip(upd_xg_a, -min_val, min_val)
            )
            def_rating_away[team] = max(
                0.5,
                team_def_a + k_def * w_def * np.clip(upd_xgc_a, -min_val, min_val)
            )

        off_rating_home_history[team].append(off_rating_home[team])
        def_rating_home_history[team].append(def_rating_home[team])
        off_rating_away_history[team].append(off_rating_away[team])
        def_rating_away_history[team].append(def_rating_away[team])

        # xG margin relative to expectation
        xg_diff_actual = actual_xg - actual_xgc
        xg_diff_expected = expected_goals - expected_goals_conceded
        xg_margin = xg_diff_actual - xg_diff_expected

        team_elo = elo_rating[team]
        opp_elo = elo_rating[opponent]
        expected_team = 1 / (1 + 10 ** ((opp_elo - team_elo) / 400))

        m = float(np.tanh(xg_margin / max(1e-6, xgcap)))

        if row["Result"] == 2:
            actual_result = 1.0
        elif row["Result"] == 1:
            actual_result = 0.5
        else:
            actual_result = 0.0

        if actual_result == 1.0:
            agree = m
        elif actual_result == 0.0:
            agree = -m
        else:
            agree = m

        draw_scale = 0.35
        expectation_caution = 1.0 - 2.0 * abs(expected_team - 0.5)
        expectation_caution = float(np.clip(expectation_caution, 0.0, 1.0))

        scale = 0.8
        if actual_result == 0.5:
            scale = draw_scale * expectation_caution

        margin_mult = 1.0 + beta * scale * agree
        margin_mult = float(np.clip(margin_mult, 1.0 - beta * scale, 1.0 + beta * scale))

        new_factor = max(1.0, 3.0 - 0.25 * len(elo_history[team]))
        actual_result = actual_result * 0.4 + 0.6 * ((xg_diff_actual + 1.5) / 3)
        surprise_multiplier = 1.0 + 0.2 * abs(actual_result - expected_team)

        delta_elo = (
            new_factor
            * k_elo
            * (actual_result - expected_team)
            * surprise_multiplier
        )

        old_elo = float(elo_rating[team])
        new_elo = float(old_elo + delta_elo)
        res_label = "W" if actual_result == 1.0 else ("D" if actual_result == 0.5 else "L")

        elo_debug_rows.append({
            "i": i,
            "kickoff_time": row.get("kickoff_time", None),
            "team": team,
            "opponent": opponent,
            "home": was_home,
            "Result": res_label,
            "S_actual": actual_result,
            "E_expected": float(expected_team),
            "old_elo": old_elo,
            "delta_elo": float(delta_elo),
            "new_elo": new_elo,
            "k_elo": float(k_elo),
            "new_factor": float(new_factor),
            "surprise_mult": float(surprise_multiplier),
            "margin_mult": float(margin_mult),
            "actual_xg": float(actual_xg),
            "actual_xgc": float(actual_xgc),
            "exp_xg": float(expected_goals),
            "exp_xgc": float(expected_goals_conceded),
            "xg_diff_actual": float(xg_diff_actual),
            "xg_diff_expected": float(xg_diff_expected),
            "xg_margin": float(xg_margin),
            
        })

        if debug_print:
            print(
                f"    ELO {res_label}: old={old_elo:.1f}  E={expected_team:.3f}  S={actual_result:.1f}  "
                f"new_factor={new_factor:.3f}  k={k_elo:.1f}  surprise={surprise_multiplier:.3f}  "
                f"margin={margin_mult:.3f}  Δ={delta_elo:+.2f}  new={new_elo:.1f}"
            )

        elo_rating[team] += delta_elo
        elo_history[team].append(elo_rating[team])

    return {
        "off_hist": off_rating_history,
        "def_hist": def_rating_history,
        "off_home_hist": off_rating_home_history,
        "def_home_hist": def_rating_home_history,
        "off_away_hist": off_rating_away_history,
        "def_away_hist": def_rating_away_history,
        "off_neutral_hist": off_rating_neutral_history,   # NEW
        "def_neutral_hist": def_rating_neutral_history,   # NEW
        "elo_hist": elo_history,
        "elo_debug": elo_debug_rows,
        "err_xg": error_xg,
        "err_xgc": error_xgc,
        "xg_preds": xg_pred_history,
        "xgc_preds":xgc_pred_history
    }


def _avg_histories(h1: dict, h2: dict, teams):
    out = {}
    for t in teams:
        a = np.asarray(h1[t], dtype=float)
        b = np.asarray(h2[t], dtype=float)
        if len(a) != len(b):
            raise ValueError(f"History length mismatch for team={t}: {len(a)} vs {len(b)}")
        out[t] = ((a + b) / 2.0).tolist()
    return out


def _safe_numeric_mean(series: pd.Series, fallback: float = 1.0) -> float:
    s = pd.to_numeric(series, errors="coerce").dropna()
    if len(s) == 0:
        return float(fallback)
    return float(s.mean())


def _add_cluster_history_features(
    team_transformed_df: pd.DataFrame,
    team_transformed_df_newest: pd.DataFrame,
    n_clusters: int = 4,
    lookback_matches: int = 15,
    min_cluster_support: int = 8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Adds:
    - cluster (team's current cluster from XGA/XGCA/XGH/XGCH)
    - XG_vs_cluster_{0..n_clusters-1}
    - XGC_vs_cluster_{0..n_clusters-1}

    Historical rows use only prior matches for each team (no leakage).
    If cluster sample size < min_cluster_support, blend:
      own_cluster_data * min(n, min_support)/min_support
      + global_cluster_average * max(0, min_support-n)/min_support
    """
    required = ["XGA", "XGCA", "XGH", "XGCH", "code", "opponent", "kickoff_time", "XG", "XGC"]
    missing_hist = [c for c in required if c not in team_transformed_df.columns]
    missing_new = [c for c in ["XGA", "XGCA", "XGH", "XGCH", "code", "opponent", "kickoff_time"] if c not in team_transformed_df_newest.columns]
    if missing_hist:
        raise ValueError(f"Missing required columns in transformed df for cluster features: {missing_hist}")
    if missing_new:
        raise ValueError(f"Missing required columns in newest df for cluster features: {missing_new}")

    hist = team_transformed_df.copy()
    newest = team_transformed_df_newest.copy()

    hist["kickoff_time"] = pd.to_datetime(hist["kickoff_time"], errors="coerce")
    newest["kickoff_time"] = pd.to_datetime(newest["kickoff_time"], errors="coerce")

    hist = hist.sort_values(["kickoff_time", "code"]).reset_index(drop=True)
    newest = newest.sort_values(["kickoff_time", "code"]).reset_index(drop=True)

    feat_cols = ["XGA", "XGCA", "XGH", "XGCH"]
    hist_feat = hist[feat_cols].apply(pd.to_numeric, errors="coerce")
    newest_feat = newest[feat_cols].apply(pd.to_numeric, errors="coerce")

    fill_values = {c: _safe_numeric_mean(hist_feat[c], fallback=1.0) for c in feat_cols}
    for c in feat_cols:
        hist_feat[c] = hist_feat[c].fillna(fill_values[c])
        newest_feat[c] = newest_feat[c].fillna(fill_values[c])

    kmeans = KMeans(n_clusters=n_clusters, random_state=32, n_init=20)
    hist["cluster"] = kmeans.fit_predict(hist_feat.values).astype(int)
    newest["cluster"] = kmeans.predict(newest_feat.values).astype(int)

    # Map (kickoff_time, team_code) -> cluster to resolve opponent cluster per row.
    key_to_cluster = {}
    for _, r in hist[["kickoff_time", "code", "cluster"]].iterrows():
        key_to_cluster[(r["kickoff_time"], int(r["code"]))] = int(r["cluster"])

    # Build opponent cluster for each historical row (at that point in time).
    opp_cluster = []
    for _, r in hist[["kickoff_time", "opponent"]].iterrows():
        key = (r["kickoff_time"], int(r["opponent"]))
        opp_cluster.append(key_to_cluster.get(key, -1))
    hist["opp_cluster"] = np.asarray(opp_cluster, dtype=int)

    # Pre-create columns.
    xg_cols = [f"XG_vs_cluster_{c}" for c in range(n_clusters)]
    xgc_cols = [f"XGC_vs_cluster_{c}" for c in range(n_clusters)]
    for col in xg_cols + xgc_cols:
        hist[col] = np.nan
        newest[col] = np.nan

    # Global running stats (all teams) by opponent-cluster from prior rows.
    global_sum_xg = np.zeros(n_clusters, dtype=float)
    global_sum_xgc = np.zeros(n_clusters, dtype=float)
    global_cnt = np.zeros(n_clusters, dtype=float)

    overall_sum_xg = 0.0
    overall_sum_xgc = 0.0
    overall_cnt = 0.0

    # Team history: last matches as (opp_cluster, xg, xgc)
    team_hist = defaultdict(list)

    for idx, r in hist.iterrows():
        team = int(r["code"])
        xg_val = float(pd.to_numeric(r["XG"], errors="coerce")) if pd.notna(r["XG"]) else np.nan
        xgc_val = float(pd.to_numeric(r["XGC"], errors="coerce")) if pd.notna(r["XGC"]) else np.nan

        recent = team_hist[team][-lookback_matches:]

        for c in range(n_clusters):
            rec_c = [(xg_i, xgc_i) for oc, xg_i, xgc_i in recent if oc == c and np.isfinite(xg_i) and np.isfinite(xgc_i)]
            n = len(rec_c)

            if n > 0:
                own_xg = float(np.mean([p[0] for p in rec_c]))
                own_xgc = float(np.mean([p[1] for p in rec_c]))
            else:
                own_xg = np.nan
                own_xgc = np.nan

            if global_cnt[c] > 0:
                glob_xg = float(global_sum_xg[c] / global_cnt[c])
                glob_xgc = float(global_sum_xgc[c] / global_cnt[c])
            elif overall_cnt > 0:
                glob_xg = float(overall_sum_xg / overall_cnt)
                glob_xgc = float(overall_sum_xgc / overall_cnt)
            else:
                # hard fallback if this is one of the first rows
                glob_xg = _safe_numeric_mean(hist["XG"], fallback=1.3)
                glob_xgc = _safe_numeric_mean(hist["XGC"], fallback=1.3)

            own_w = min(n, min_cluster_support) / float(min_cluster_support)
            glob_w = max(0, min_cluster_support - n) / float(min_cluster_support)

            if np.isnan(own_xg):
                blend_xg = glob_xg
            else:
                blend_xg = own_xg * own_w + glob_xg * glob_w

            if np.isnan(own_xgc):
                blend_xgc = glob_xgc
            else:
                blend_xgc = own_xgc * own_w + glob_xgc * glob_w

            hist.at[idx, f"XG_vs_cluster_{c}"] = blend_xg
            hist.at[idx, f"XGC_vs_cluster_{c}"] = blend_xgc

        oc = int(r["opp_cluster"])
        if 0 <= oc < n_clusters and np.isfinite(xg_val) and np.isfinite(xgc_val):
            global_sum_xg[oc] += xg_val
            global_sum_xgc[oc] += xgc_val
            global_cnt[oc] += 1.0

            overall_sum_xg += xg_val
            overall_sum_xgc += xgc_val
            overall_cnt += 1.0

            team_hist[team].append((oc, xg_val, xgc_val))

    # Final global fallback values from all historical data.
    final_glob_xg = np.zeros(n_clusters, dtype=float)
    final_glob_xgc = np.zeros(n_clusters, dtype=float)
    overall_xg = float(overall_sum_xg / overall_cnt) if overall_cnt > 0 else _safe_numeric_mean(hist["XG"], fallback=1.3)
    overall_xgc = float(overall_sum_xgc / overall_cnt) if overall_cnt > 0 else _safe_numeric_mean(hist["XGC"], fallback=1.3)
    for c in range(n_clusters):
        if global_cnt[c] > 0:
            final_glob_xg[c] = global_sum_xg[c] / global_cnt[c]
            final_glob_xgc[c] = global_sum_xgc[c] / global_cnt[c]
        else:
            final_glob_xg[c] = overall_xg
            final_glob_xgc[c] = overall_xgc

    # Newest rows: same logic, using last lookback historical matches for each team.
    hist_by_team = hist.sort_values(["kickoff_time"]).groupby("code", sort=False)
    for idx, r in newest.iterrows():
        team = int(r["code"])
        team_hist_rows = hist_by_team.get_group(team) if team in hist_by_team.groups else pd.DataFrame(columns=hist.columns)
        team_hist_rows = team_hist_rows.tail(lookback_matches)

        for c in range(n_clusters):
            sub = team_hist_rows[team_hist_rows["opp_cluster"] == c]
            n = len(sub)

            if n > 0:
                own_xg = float(pd.to_numeric(sub["XG"], errors="coerce").mean())
                own_xgc = float(pd.to_numeric(sub["XGC"], errors="coerce").mean())
            else:
                own_xg = np.nan
                own_xgc = np.nan

            glob_xg = float(final_glob_xg[c])
            glob_xgc = float(final_glob_xgc[c])

            own_w = min(n, min_cluster_support) / float(min_cluster_support)
            glob_w = max(0, min_cluster_support - n) / float(min_cluster_support)

            if np.isnan(own_xg):
                blend_xg = glob_xg
            else:
                blend_xg = own_xg * own_w + glob_xg * glob_w

            if np.isnan(own_xgc):
                blend_xgc = glob_xgc
            else:
                blend_xgc = own_xgc * own_w + glob_xgc * glob_w

            newest.at[idx, f"XG_vs_cluster_{c}"] = blend_xg
            newest.at[idx, f"XGC_vs_cluster_{c}"] = blend_xgc

    # Keep extra helper off output; requested output asks for "cluster" + 8 cols.
    hist = hist.drop(columns=["opp_cluster"])

    # Column order: append new columns at the end.
    keep_hist_cols = [c for c in team_transformed_df.columns if c in hist.columns]
    keep_new_cols = [c for c in team_transformed_df_newest.columns if c in newest.columns]
    hist = hist[keep_hist_cols + ["cluster"] + xg_cols + xgc_cols]
    newest = newest[keep_new_cols + ["cluster"] + xg_cols + xgc_cols]

    return hist, newest


def team_transformed2():
    team_df = pd.read_csv("Team_data_transformed.csv").iloc[:, 1:][
        ["XGC_avg", "XG_avg", "code", "kickoff_time", "XG", "XGC", "was_home",
         "opponent", "Clean_Sheet", "Result"]
    ].copy()

    team_df["opponent"] = team_df["opponent"].astype(int)
    team_df["code"] = team_df["code"].astype(int)
    team_df["kickoff_time"] = pd.to_datetime(team_df["kickoff_time"], errors="coerce")
    team_df = team_df.dropna(subset=["kickoff_time"])
    team_df = team_df.sort_values("kickoff_time")

    team_avg_xg = team_df.groupby("code")["XG_avg"].mean()
    team_avg_xgc = team_df.groupby("code")["XGC_avg"].mean()
    teams = pd.unique(team_df["code"].tolist() + team_df["opponent"].tolist())
    global_avg_xg = float(team_df["XG_avg"].mean())
    global_avg_xgc = float(team_df["XGC_avg"].mean())

    # params
    k_off_1, k_def_1 = 0.08, 0.08
    k_off_2, k_def_2 = 0.15, 0.15
    min_val = 0.8
    OBS_LO, OBS_HI = 0.5, 3.5
    error_split = 0.5

    run1 = _run_one_pass(
        team_df, teams, team_avg_xg, team_avg_xgc, global_avg_xg, global_avg_xgc,
        k_off_1, k_def_1, min_val, OBS_LO, OBS_HI,
        use_squared_updates=False,
        error_split=error_split,
        debug_print=False,
        debug_max_rows=None,
    )

    run2 = _run_one_pass(
        team_df, teams, team_avg_xg, team_avg_xgc, global_avg_xg, global_avg_xgc,
        k_off_2, k_def_2, min_val, OBS_LO, OBS_HI,
        use_squared_updates=False,
        error_split=error_split,
        debug_print=False,
    )

    off_hist = _avg_histories(run1["off_hist"], run2["off_hist"], teams)
    def_hist = _avg_histories(run1["def_hist"], run2["def_hist"], teams)
    off_home_hist = _avg_histories(run1["off_home_hist"], run2["off_home_hist"], teams)
    def_home_hist = _avg_histories(run1["def_home_hist"], run2["def_home_hist"], teams)
    off_away_hist = _avg_histories(run1["off_away_hist"], run2["off_away_hist"], teams)
    def_away_hist = _avg_histories(run1["def_away_hist"], run2["def_away_hist"], teams)

    # NEW
    off_neutral_hist = _avg_histories(run1["off_neutral_hist"], run2["off_neutral_hist"], teams)
    def_neutral_hist = _avg_histories(run1["def_neutral_hist"], run2["def_neutral_hist"], teams)
    
    xg_preds=_avg_histories(run1["xg_preds"], run2["xg_preds"], teams)
    xgc_preds=_avg_histories(run1["xgc_preds"], run2["xgc_preds"], teams)

    elo_hist = _avg_histories(run1["elo_hist"], run2["elo_hist"], teams)

    elo_dbg = pd.DataFrame(run1["elo_debug"])
    elo_dbg.to_csv("elo_debug_log.csv", index=False)
    print("\nWrote: elo_debug_log.csv (first 10 rows)")
    print(elo_dbg.head(10).to_string(index=False))

    new_team_df = pd.read_csv("Team_data_transformed.csv").iloc[:, 1:].copy()
    new_team_df_newest = pd.read_csv("Team_data_newest.csv").iloc[:, 1:].copy()
    overall_weight = 0.25

    team_transformed_df = pd.DataFrame()
    team_transformed_df_newest = pd.DataFrame()

    for team in teams:
        slope_df = pd.DataFrame({
            "XG": off_hist[team],
            "XGC": def_hist[team],
            "XG_neutral": off_neutral_hist[team],   # NEW
            "XGC_neutral": def_neutral_hist[team],  # NEW
        })

        slope_df["XG_slope"] = slope_df["XG"].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        slope_df["XGC_slope"] = slope_df["XGC"].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        slope_df["XG_neutral_slope"] = slope_df["XG_neutral"].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)
        slope_df["XGC_neutral_slope"] = slope_df["XGC_neutral"].rolling(window=6, min_periods=1).apply(rolling_slope, raw=True)

        selected_team_df = new_team_df[new_team_df["code"] == team].copy()

        selected_team_df["XGA"] = ((
            (1 - overall_weight) * np.array(off_away_hist[team][:-1]) +
            overall_weight * selected_team_df["XGA"]
        ) * 0.9 + 0.1 * selected_team_df["Rolling_Threat"])*0.99+0*np.array(off_neutral_hist[team][:-1])

        selected_team_df["XGCA"] = ((
            (1 - overall_weight) * np.array(def_away_hist[team][:-1]) +
            overall_weight * selected_team_df["XGCA"]
        ) * 0.9 + 0.1 * selected_team_df["Rolling_Threat_Against"])*0.99+0*np.array(def_neutral_hist[team][:-1])

        selected_team_df["XGH"] = ((
            (1 - overall_weight) * np.array(off_home_hist[team][:-1]) +
            overall_weight * selected_team_df["XGH"]
        ) * 0.9 + 0.1 * selected_team_df["Rolling_Threat"])*0.99+0*np.array(off_neutral_hist[team][:-1])

        selected_team_df["XGCH"] = ((
            (1 - overall_weight) * np.array(def_home_hist[team][:-1]) +
            overall_weight * selected_team_df["XGCH"]
        ) * 0.9 + 0.1 * selected_team_df["Rolling_Threat_Against"])*0.99+0*np.array(def_neutral_hist[team][:-1])


        selected_team_df["XG_avg"] = (selected_team_df["XGH"] * 0.5 + selected_team_df["XGA"] * 0.5)*0.65+0.35*selected_team_df["Offensive_Index"] 
        selected_team_df["XGC_avg"] = (selected_team_df["XGCH"] * 0.5 + selected_team_df["XGCA"] * 0.5)*0.65+0.35*selected_team_df["Defensive_Index"] 

        selected_team_df["XG_slope"] = slope_df["XG_slope"].values[:-1]
        selected_team_df["XGC_slope"] = slope_df["XGC_slope"].values[:-1]
        selected_team_df["XG_neutral_slope"] = slope_df["XG_neutral_slope"].values[:-1]     # NEW
        selected_team_df["XGC_neutral_slope"] = slope_df["XGC_neutral_slope"].values[:-1]   # NEW
        selected_team_df["Elo_Rating"] = elo_hist[team][:-1]
        selected_team_df["XG_pred"]=xg_preds[team][:-1]
        selected_team_df["XG_pred_rolling_error"] = ((selected_team_df["XG_pred"] - selected_team_df["XG"]).clip(lower=-0.5, upper=0.5).rolling(20, min_periods=10).mean().fillna(0))
        selected_team_df["XGC_pred"]=xgc_preds[team][:-1]
        selected_team_df["XGC_pred_rolling_error"] = ((selected_team_df["XGC_pred"] - selected_team_df["XGC"]).clip(lower=-0.5, upper=0.5).rolling(20, min_periods=10).mean().fillna(0))
        

        team_transformed_df = pd.concat([team_transformed_df, selected_team_df], ignore_index=True)

        newest_selected_team_df = new_team_df_newest[new_team_df_newest["code"] == team].copy()

        newest_selected_team_df["XGA"] = ((
            off_away_hist[team][-1] * (1 - overall_weight) +
            overall_weight * newest_selected_team_df["XGA"]
        ) * 0.9 + 0.1 * newest_selected_team_df["Rolling_Threat"])*0.99+0*off_neutral_hist[team][-1] 

        newest_selected_team_df["XGCA"] = ((
            def_away_hist[team][-1] * (1 - overall_weight) +
            overall_weight * newest_selected_team_df["XGCA"]
        ) * 0.9 + 0.1 * newest_selected_team_df["Rolling_Threat_Against"])*0.99+0.0*def_neutral_hist[team][-1] 

        newest_selected_team_df["XGH"] = ((
            off_home_hist[team][-1] * (1 - overall_weight) +
            overall_weight * newest_selected_team_df["XGH"]
        ) * 0.9 + 0.1 * newest_selected_team_df["Rolling_Threat"])*0.99+0.0*off_neutral_hist[team][-1] 

        newest_selected_team_df["XGCH"] = ((
            def_home_hist[team][-1] * (1 - overall_weight) +
            overall_weight * newest_selected_team_df["XGCH"]
        ) * 0.9 + 0.1 * newest_selected_team_df["Rolling_Threat_Against"])*0.99+0*def_neutral_hist[team][-1] 


        newest_selected_team_df["XG_avg"] = (newest_selected_team_df["XGH"] * 0.5 + newest_selected_team_df["XGA"] * 0.5)*0.65+0.35*newest_selected_team_df["Offensive_Index"] 
        newest_selected_team_df["XGC_avg"] = (newest_selected_team_df["XGCH"] * 0.5 + newest_selected_team_df["XGCA"] * 0.5)*0.65+0.35*newest_selected_team_df["Defensive_Index"] 

        newest_selected_team_df["XG_slope"] = slope_df["XG_slope"].values[-1]
        newest_selected_team_df["XGC_slope"] = slope_df["XGC_slope"].values[-1]
        newest_selected_team_df["XG_neutral_slope"] = slope_df["XG_neutral_slope"].values[-1]     # NEW
        newest_selected_team_df["XGC_neutral_slope"] = slope_df["XGC_neutral_slope"].values[-1]   # NEW
        newest_selected_team_df["Elo_Rating"] = elo_hist[team][-1]
        newest_selected_team_df["XG_pred_rolling_error"] = selected_team_df["XG_pred_rolling_error"].iloc[-1]
        newest_selected_team_df["XGC_pred_rolling_error"] = selected_team_df["XGC_pred_rolling_error"].iloc[-1]

        team_transformed_df_newest = pd.concat([team_transformed_df_newest, newest_selected_team_df], ignore_index=True)

    team_transformed_df, team_transformed_df_newest = _add_cluster_history_features(
        team_transformed_df=team_transformed_df,
        team_transformed_df_newest=team_transformed_df_newest,
        n_clusters=4,
        lookback_matches=15,
        min_cluster_support=8,
    )

    team_transformed_df.to_csv("Team_data_transformed2.csv", index=False)
    team_transformed_df_newest.to_csv("Team_data_newest2.csv", index=False)





    
    
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
    mapping = Understat_Team_MAP

    # tidy whitespace then map
    unioned_df["title"] = unioned_df["title"].astype(str).str.strip().replace(mapping)


    #Add history DATA
    history=unioned_df[["title", "date", "roll10prev_deep", "roll10prev_deep_allowed", "roll10prev_xpts", "roll10prev_ppda", "roll10prev_ppda_allowed"]]

    history["date_only"] = pd.to_datetime(history["date"], errors="coerce").dt.date
    num_cols = history.select_dtypes(include="number").columns.tolist()

    team_data = pd.read_csv("Team_data_transformed2.csv").copy()
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

    team_data = pd.read_csv("Team_data_newest2.csv").copy()
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
    
    
    
    
    newest_df = pd.DataFrame()
    Future = 0
    training_df=pd.DataFrame()
    player_pred = []
    element_map = []
    unwanted_players=[]
    df_all["name"] = df_all["name"].apply(normalize_player_name)
    unique_players = df_all[["name"]].drop_duplicates()
    
    df_all.to_csv("Fantasy_Merged.csv")

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
            lookback=15
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
            player_df["rolling_XG"] = player_df['expected_goals'].clip(upper=0.9).rolling(window=10, min_periods=1).mean()
            player_df["rolling_XA"] = player_df['expected_assists'].clip(upper=0.9).rolling(window=10, min_periods=1).mean()
            player_df["rolling_GC"] = player_df['goals_conceded'].ewm(span=lb2, adjust=False).mean()
            player_df["rolling_bps"] = player_df['bps'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_GS"] = player_df['goals_scored'].clip(upper=2).ewm(span=lookback, adjust=False).mean()
            player_df["rolling_shots"] = player_df['shots'].ewm(span=lookback, adjust=False).mean()
            player_df["XG_min"]=(player_df['expected_goals']/player_df["minutes"].clip(lower=20))*90
            player_df["XA_min"]=(player_df['expected_assists']/player_df["minutes"].clip(lower=20))*90
            player_df["Threat_min"]=(player_df['Threat']/player_df["minutes"].clip(lower=20))*90
            player_df["Creativity_min"]=(player_df['creativity']/player_df["minutes"].clip(lower=20))*90
            player_df["Goal_min"]=(player_df['goals_scored'].clip(upper=1.5)/player_df["minutes"].clip(lower=10))*90
            

            player_df["rolling_Goal_min"] = (
                player_df["goals_scored"]
                    .clip(upper=1.7)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90
            
            player_df["rolling_Assist_min"] = (
                player_df["assists"]
                    .clip(upper=1.7)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90
                        
            player_df["rolling_Goal_min"] =player_df["rolling_Goal_min"].rolling(window=10, min_periods=1).mean()    
            player_df["rolling_Assist_min"]=player_df["rolling_Assist_min"].rolling(window=10, min_periods=1).mean()   
                        
            player_df["rolling_key_passes"] = player_df['key_passes'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_XG_historic"] = player_df['expected_goals'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_XA_historic"] = player_df['expected_assists'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Threat_historic"] = player_df['Threat_min'].rolling(window=30, min_periods=1).mean()
            player_df["rolling_Creativity_historic"] = player_df['Creativity_min'].rolling(window=30, min_periods=1).mean()
            
            
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
            #Yellow
            player_df["Rolling_cards"] = (
                player_df["yellow_cards"] + player_df["red_cards"]
            ).rolling(window=40, min_periods=1).mean()
            

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
            player_df["Average_Overscore"]=player_df['goals_scored'].rolling(window=50, min_periods=1).sum()/player_df['expected_goals'].rolling(window=50, min_periods=1).sum()
            player_df["rolling_ICT"] = player_df['ICT'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_ICT"] = adjust_measure(player_df, 'ICT')
            #player_df["rolling_Threat"] = player_df['Threat'].ewm(span=lookback, adjust=False).mean()
            player_df["rolling_Threat"]=adjust_measure(player_df, 'Threat')
            player_df["Threat_Mean"] = player_df['Threat'].ewm(span=20, adjust=False).mean()*0.5+player_df["rolling_Threat_historic"]*0.5
            player_df["Creativity_Mean"]=player_df['creativity'].ewm(span=20, adjust=False).mean()*0.5+0.5*player_df["rolling_Creativity_historic"]
            player_df["Influence_Mean"] = player_df['influence'].rolling(window=15, min_periods=1).mean()
            threat_mean_feature=player_df["Threat_Mean"].values[-1]
            player_df["Adjusted_XG"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["expected_goals"].clip(upper=1.5) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["expected_goals"].clip(upper=1.5) / player_df["XGCH"]  # False: expected_goals / XGCh
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
                    player_df["expected_assists"].clip(upper=1.5) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["expected_assists"].clip(upper=1.5) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Adjusted_Threat"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["Threat"].clip(upper=150) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["Threat"].clip(upper=150) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Adjusted_Creativity"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["creativity"].clip(upper=150) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["creativity"].clip(upper=150) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            player_df["Rolling_adjusted_XA_form"]=player_df['Adjusted_XA'].ewm(span=15, adjust=False).var()
            player_df["Rolling_adjusted_XA"]=adjust_measure(player_df, 'expected_assists')

            player_df["Rolling_adjusted_XA_per90"] = (
                player_df["Adjusted_XA"]
                    .clip(upper=1)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90
            player_df["Rolling_adjusted_XG_per90"] = (
                player_df["Adjusted_XG"]
                    .clip(upper=1.2)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90
            
            player_df["Rolling_adjusted_XG_per90_short"] = (
                player_df["Adjusted_XG"]
                    .clip(upper=1.2)
                    .rolling(window=10, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=10, min_periods=1)
                    .sum()
            ) * 90
            
            player_df["Rolling_adjusted_XA_per90_short"] = (
                player_df["Adjusted_XA"]
                    .clip(upper=1.2)
                    .rolling(window=10, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=10, min_periods=1)
                    .sum()
            ) * 90
            
            player_df["Rolling_adjusted_XA_per90_both"]=player_df["Rolling_adjusted_XA_per90_short"]*0.3+0.7*player_df["Rolling_adjusted_XA_per90"]
            player_df["Rolling_adjusted_XG_per90_both"]=player_df["Rolling_adjusted_XG_per90_short"]*0.3+0.7*player_df["Rolling_adjusted_XG_per90"]
               
            player_df["Rolling_adjusted_Threat_per90"] = (
                player_df["Adjusted_Threat"]
                    .clip(upper=150)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90     
            player_df["Rolling_adjusted_creativity_per90"] = (
                player_df["Adjusted_Creativity"]
                    .clip(upper=150)
                    .rolling(window=30, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=30, min_periods=1)
                    .sum()
            ) * 90   
            
            player_df["Rolling_adjusted_Threat_per90_Short"] = (
                player_df["Adjusted_Threat"]
                    .clip(upper=150)
                    .rolling(window=10, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=10, min_periods=1)
                    .sum()
            ) * 90     
            player_df["Rolling_adjusted_creativity_per90_Short"] = (
                player_df["Adjusted_Creativity"]
                    .clip(upper=150)
                    .rolling(window=10, min_periods=1)
                    .sum()
                /
                player_df["minutes"]
                    .clip(lower=10)
                    .rolling(window=10, min_periods=1)
                    .sum()
            ) * 90   
            
            player_df["Goal_Statistics"]=player_df["Rolling_adjusted_XG_per90_both"]*0.6+0.0025*(player_df["Rolling_adjusted_Threat_per90"]*0.7+0.3*player_df["Rolling_adjusted_Threat_per90_Short"])+0.15*player_df["rolling_Goal_min"]
            player_df["Assist_Statistics"]=player_df["Rolling_adjusted_XA_per90_both"]*0.65+0.0015*(player_df["Rolling_adjusted_creativity_per90"]*0.7+0.3*player_df["Rolling_adjusted_creativity_per90_Short"])+0.2*player_df["rolling_Assist_min"]
               
            
            
            player_df["Adjusted_BPS"] = np.where(
                    player_df["was_home"] == 1,  # Condition: if was_home is 1
                    player_df["bps"].clip(upper=50) / player_df["XGCA"],  # True: expected_goals / XGCA
                    player_df["bps"].clip(upper=50) / player_df["XGCH"]  # False: expected_goals / XGCh
                    )
            
            FACTS = {
                "GKP": (12, 9, 12),
                "DEF": (12,  9.0, 12),
                "MID": (18,  9.0, 0.0),
                "FWD": (24,  9.0, 0.0),
            }
            

            DEFAULT = (0.0, 0.0, 0.0)

            # Optional: normalize position labels to match keys
            # player_df["position"] = player_df["position"].str.upper().str[:3]  # example

            f1_map = {k: v[0] for k, v in FACTS.items()}
            f2_map = {k: v[1] for k, v in FACTS.items()}
            f3_map = {k: v[2] for k, v in FACTS.items()}

            f1 = player_df["position"].map(f1_map).fillna(DEFAULT[0]).to_numpy()
            f2 = player_df["position"].map(f2_map).fillna(DEFAULT[1]).to_numpy()
            f3 = player_df["position"].map(f3_map).fillna(DEFAULT[2]).to_numpy()

            cs_flag = (
                (player_df["goals_conceded"] < 1) &
                (player_df["minutes"] > 60)
            ).to_numpy().astype(int)

            player_df["Adjusted_BPS"] = (
                player_df["bps"].to_numpy()
                - f1 * player_df["goals_scored"].to_numpy()
                - f2 * player_df["assists"].to_numpy()
                - f3 * cs_flag
            )
            mask = (
                    (pd.to_datetime(player_df["kickoff_time"]) < "2026-07-30") &
                    (player_df["defcon"].notna())
            )

            player_df.loc[mask, "Adjusted_BPS"] -= (
                    player_df.loc[mask, "defcon"] * 0.17
            )

            player_df["Rolling_adjusted_BPS"]=(player_df['Adjusted_BPS'].rolling(window=15, min_periods=1).sum()/player_df["minutes"].clip(lower=10).rolling(window=15, min_periods=1).sum()) * 90    
            player_df["rolling_bps_historic"] = player_df['Adjusted_BPS'].rolling(window=30, min_periods=1).mean()
            player_df["Rolling_adjusted_BPS_2"]=(player_df['Adjusted_BPS'].rolling(window=30, min_periods=1).sum()/player_df["minutes"].clip(lower=10).rolling(window=30, min_periods=1).sum()) * 90    
            #player_df["Rolling_adjusted_BPS"]=adjust_measure(player_df, 'bps')
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
            
            player_df["rolling_Adjusted_XG_historic"] = player_df['Adjusted_XG'].rolling(window=25, min_periods=1).mean()
            player_df["rolling_Adjusted_XA_historic"] = player_df['Adjusted_XA'].rolling(window=25, min_periods=1).mean()
            
            window_size = 20
            rolling_games = player_df["expected_goals"].rolling(window=window_size, min_periods=1).count()

            player_df["Share_of_XG"] = (
                    ((player_df["expected_goals"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XG"]))
                    .clip(upper=0.5).rolling(window=window_size, min_periods=1).mean())
            
            player_df["Share_of_XA"] = (
                    ((player_df["expected_assists"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XA"]))
                    .clip(upper=0.5).rolling(window=window_size, min_periods=1).mean())
            
            player_df["Share_of_XG_Measure"] = ((player_df["expected_goals"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XG"])).clip(upper=0.5)
            player_df["Share_of_XA_Measure"] = ((player_df["expected_assists"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XA"])).clip(upper=0.5)
            short_size = 8
            rolling_games_short = player_df["expected_goals"].rolling(window=short_size, min_periods=1).count()
            
            player_df["Share_of_XG_Short"] = (
                    ((player_df["expected_goals"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XG"] ))
                    .clip(upper=0.5).rolling(window=short_size, min_periods=1).mean())
            
            player_df["Share_of_XA_Short"] = (
                    ((player_df["expected_assists"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_XA"]))
                    .clip(upper=0.5).rolling(window=short_size, min_periods=1).mean())
            
            
            player_df['defcon_adjusted'] = np.where(player_df['position'].eq('DEF'),player_df['defcon'].clip(upper=14),player_df['defcon'].clip(upper=16))
            player_df["defcon_adjusted_min"] = (player_df["defcon_adjusted"] / player_df["minutes"].clip(lower=10)) * 90

            player_df['defcon_hit_rate'] = ((player_df['position'].eq('DEF') & player_df['defcon_adjusted_min'].gt(9)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(11))).astype(int)
            player_df['defcon_hit_rate_T0'] = ((player_df['position'].eq('DEF') & player_df['defcon_adjusted_min'].gt(8)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(10))).astype(int)
            player_df['defcon_hit_rate_T1'] = ((player_df['position'].eq('DEF') & player_df['defcon_adjusted_min'].gt(7)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(9))).astype(int)
            player_df['defcon_hit_rate_T2'] = ((player_df['position'].eq('DEF') & player_df['defcon_adjusted_min'].gt(5)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(7))).astype(int)
            player_df['defcon_hit_rate_T3'] = ((player_df['position'].eq('DEF') & player_df['defcon_adjusted_min'].gt(11)) |(~player_df['position'].eq('DEF') & player_df['defcon'].gt(13))).astype(int)
            player_df['defcon_avg'] = player_df['defcon_adjusted'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()
            player_df['defcon_avg_min'] = player_df['defcon_adjusted_min'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()
            player_df['defcon_avg_hit_rate'] = player_df['defcon_hit_rate'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()
            player_df['defcon_avg_hit_rate_T1'] = player_df['defcon_hit_rate_T1'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()*0.5+0.5*player_df['defcon_hit_rate_T1'].where(player_df['defcon'] > 0).rolling(10, min_periods=1).mean()
            player_df['defcon_avg_hit_rate_T2'] = player_df['defcon_hit_rate_T2'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()*0.5+0.5*player_df['defcon_hit_rate_T2'].where(player_df['defcon'] > 0).rolling(10, min_periods=1).mean()
            player_df['defcon_avg_hit_rate_T0'] = player_df['defcon_hit_rate_T0'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()*0.5+0.5*player_df['defcon_hit_rate_T0'].where(player_df['defcon'] > 0).rolling(10, min_periods=1).mean()
            player_df['defcon_avg_hit_rate_T3'] = player_df['defcon_hit_rate_T3'].where(player_df['defcon'] > 0).rolling(30, min_periods=1).mean()*0.5+0.5*player_df['defcon_hit_rate_T3'].where(player_df['defcon'] > 0).rolling(10, min_periods=1).mean()
            
            player_df["Share_of_Defcon"] = (
                    ((player_df["defcon"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_defcon"]))
                    .clip(upper=0.2).where(player_df['Team_defcon'] > 0).rolling(window=window_size, min_periods=1).mean())
            
            player_df["Share_of_Defcon_Short"] = (
                    ((player_df["defcon"] / player_df["minutes"].clip(lower=10) * 90)/(player_df["Team_defcon"]))
                    .clip(upper=0.2).where(player_df['Team_defcon'] > 0).rolling(window=8, min_periods=1).mean())

            mask = player_df["defcon"].gt(0)

            # avg defcon over the rows where defcon > 0
            defcon_mean = player_df["defcon_adjusted"].where(mask).rolling(20, min_periods=1).sum()

            minutes_mean = player_df["minutes"].where(mask).clip(lower=10).rolling(20, min_periods=1).sum()

            # minutes-adjusted avg_defcon per 90
            player_df["defcon_avg"] = (defcon_mean / minutes_mean) * 90
            
            player_df['TP_std_20'] = (player_df['Adjusted_Fantasy'].rolling(window=25, min_periods=1).std())


            if(namelist[0]=="Mohamed_Salah"):
                latest_rows_cluster.to_csv("test_cluster.csv")
                cluster_df[['name','Cluster','Cluster_XG','Cluster_XA','expected_goals']].to_csv("test_cluster2.csv")


            adjusted_xg_mean_feature=player_df["Adjusted_XG_Mean"].values[-1]
            #player_df["Average_OverAssist"]=player_df["OverAssist"].rolling(window=12, min_periods=1).mean()
            player_df["Average_OverAssist"]=player_df['assists'].rolling(window=50, min_periods=1).sum()/player_df['expected_assists'].rolling(window=50, min_periods=1).sum()
            #player_df["Average_OverAssist"] = (player_df["assists"].fillna(0).expanding(min_periods=1).sum()/ player_df["expected_assists"].fillna(0).expanding(min_periods=1).sum()).replace([np.inf, -np.inf], 0)
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
            player_df["Rolling_creativity2"]=player_df["Rolling_creativity"].shift(1)
            player_df["Rolling_influence"]=player_df["Rolling_influence"].shift(1)
            player_df["Rolling_adjusted_XG2"]=player_df["Rolling_adjusted_XG"].shift(1)
            player_df["Rolling_adjusted_XGC2"]=player_df["Rolling_adjusted_XGC"].shift(1)
            player_df["Rolling_BPS_per_90"]=player_df["Rolling_BPS_per_90"].shift(1)
            player_df["rolling_shots"]=player_df["rolling_shots"].shift(1)
            player_df["rolling_key_passes"]=player_df["rolling_key_passes"].shift(1)
            player_df["rolling_Threat2"]=player_df["rolling_Threat"].shift(1)
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
    if(measure_name=="expected_goals"):
        min_val=0.4
    elif(measure_name=="threat"):
        min_val=40
    elif(measure_name=="creativity"):
        min_val=35
    elif(measure_name=="expected_assists"):
        min_val=0.35
    else:
        min_val=std
    if(n_matches>10):
        current_expected_goals_start_value=player_df[measure_name].mean()*0.8
    else:
        current_expected_goals_start_value=player_df[measure_name].mean()*0.8
    current_expected_goals=current_expected_goals_start_value
    smoothing_f=0.08
    
    count=0
    in_row=0
    in_row_fac=1
    for i in range(len(player_df)):
        count+=1
        offset=max(1,1.5-count*0.05)
        home=player_df["was_home"].values[i]
        if home:
            pred_scored=current_expected_goals*(player_df["XGCA"].values[i]*0.7+player_df["XGCH"].values[i]*0.3)*np.minimum(1, player_df['minutes'].values[i] / 60)
            if(abs(player_df[measure_name].values[i]-pred_scored)>min_val*0.5):
                in_row+=1   
            else:
                in_row=0
                in_row_fac=1
            if(in_row>2):
                in_row_fac=1.2

            new_expected_goals.append(min(clipper_val,current_expected_goals+in_row_fac*offset*smoothing_f*min(min_val,max(-min_val,player_df[measure_name].values[i]-pred_scored))))
            current_expected_goals=new_expected_goals[-1]
                
        else:
            pred_scored=current_expected_goals*(player_df["XGCA"].values[i]*0.3+player_df["XGCH"].values[i]*0.7)*np.minimum(1, player_df['minutes'].values[i] / 60)
            if(abs(player_df[measure_name].values[i]-pred_scored)>min_val*0.5):
                in_row+=1   
            else:
                in_row=0
                in_row_fac=1
            if(in_row>2):
                in_row_fac=1.2
            new_expected_goals.append(min(clipper_val,current_expected_goals+in_row_fac*offset*smoothing_f*min(min_val,max(-min_val,player_df[measure_name].values[i]-pred_scored))))
            current_expected_goals=new_expected_goals[-1]
    return new_expected_goals  
def pad_to_length(lst, length):
    if len(lst) < length:
        lst.extend([0] * (length - len(lst)))
    return lst  

if __name__ == "__main__":
    main_Transform()   
