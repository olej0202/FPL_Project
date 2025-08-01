import pandas as pd
import os
import requests
import json
import pandas as pd

def fixtures(season):
    url = "https://fantasy.premierleague.com/api/fixtures/"
    response = requests.get(url)
    json_data = response.json()
    df=pd.DataFrame(json_data)
    df.to_csv(f"Raw_Data_{season}/Fantasy_season_20{season}_Fixtures.csv")

def Fulload(season):
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    print(elements_df.columns)
    data_points=elements_df[["id", "second_name", "team","first_name","code","news","element_type","team_code","web_name"]]
    ids=data_points["id"].unique()
    full_df=pd.DataFrame()
    for i in range(len(ids)):
        player_id=ids[i]
        id_df=data_points[data_points["id"]==player_id]
        base_url = "https://fantasy.premierleague.com/api/element-summary/"
        full_url = base_url + str(player_id) + "/"
        response = requests.get(full_url)
        data = json.loads(response.text)
        df=pd.DataFrame(data['history'])
        replicated_id_df = pd.concat([id_df] * len(df), ignore_index=True)
        df[["id", "second_name", "team","first_name","code","news","element_type","team_code"]]=replicated_id_df[["id", "second_name", "team","first_name","code","news","element_type","team_code"]]
        df["Full_Name"]=df["first_name"]+"_"+df["second_name"]
        full_df=pd.concat([full_df, df], axis=0, ignore_index=True)

    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    team_data = pd.DataFrame(json_data['teams'])
    elements_types_df = pd.DataFrame(json_data['element_types'])
    full_df = full_df.merge(
        team_data[['id', 'code', 'name']],  # Select necessary columns from team_data
        left_on='opponent_team',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'code_y': 'opponent_code', 'name': 'opponent_name'}, inplace=True)
    full_df.drop(columns=['id_y'], inplace=True)
    full_df = full_df.merge(
        team_data[['id', 'code', 'name']],  # Select necessary columns from team_data
        left_on='team',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'code': 'team_code2', 'name': 'team_name'}, inplace=True)
    full_df.drop(columns=['id'], inplace=True)
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    elements_types_df = pd.DataFrame(json_data['element_types'])
    full_df = full_df.merge(
        elements_types_df[['id', 'singular_name_short']],  # Select necessary columns from team_data
        left_on='element_type',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'singular_name_short': 'position'}, inplace=True)
    full_df.drop(columns=['id'], inplace=True)
    full_df["team_id"]=full_df["team"].values
    full_df["team"]=full_df["team_name"].values
    full_df.to_csv(f"Raw_Data_{season}/Fantasy_season_20{season}_data.csv")
    
    print(full_df)
    fixtures()
    
    
def Incremental(Has_been_error,season):
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    print(elements_df.columns)
    data_points=elements_df[["id", "second_name", "team","first_name","code","news","element_type","team_code","web_name"]]
    ids=data_points["id"].unique()
    data_prev=pd.read_csv(f"Raw_Data_{season}/Fantasy_season_20{season}_data.csv").iloc[:,1:]
    max_gw=max(data_prev["round"].unique())+1-Has_been_error
    print(max_gw)
    full_df=pd.DataFrame()
    errors=[]
    for i in range(len(ids)):
        player_id=ids[i]
        id_df=data_points[data_points["id"]==player_id]
        print(id_df)
        base_url = "https://fantasy.premierleague.com/api/element-summary/"
        full_url = base_url + str(player_id) + "/"
        response = requests.get(full_url)
        data = json.loads(response.text)
        df=pd.DataFrame(data['history'])
        if(len(df)<1):
            continue
        if(max(df["round"].values)<max_gw):
            ere=data_prev[data_prev["element"]==player_id]
            errors.append(ere["Full_Name"].unique()[0])
        else:       
            replicated_id_df = pd.concat([id_df] * len(df), ignore_index=True)
            df[["id", "second_name", "team","first_name","code","news","element_type","team_code"]]=replicated_id_df[["id", "second_name", "team","first_name","code","news","element_type","team_code"]]
            df["Full_Name"]=df["first_name"]+"_"+df["second_name"]
            df=df[df["round"]==max_gw]
            print(df)
            full_df=pd.concat([full_df, df], axis=0, ignore_index=True)
    errors_df=pd.DataFrame(errors)
    errors_df.to_csv(f"Raw_Data_{season}/Errors.csv")

    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    team_data = pd.DataFrame(json_data['teams'])
    elements_types_df = pd.DataFrame(json_data['element_types'])
    full_df = full_df.merge(
        team_data[['id', 'code', 'name']],  # Select necessary columns from team_data
        left_on='opponent_team',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'code_y': 'opponent_code', 'name': 'opponent_name'}, inplace=True)
    full_df.drop(columns=['id_y'], inplace=True)
    full_df = full_df.merge(
        team_data[['id', 'code', 'name']],  # Select necessary columns from team_data
        left_on='team',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'code': 'team_code2', 'name': 'team_name'}, inplace=True)
    full_df.drop(columns=['id'], inplace=True)
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    elements_types_df = pd.DataFrame(json_data['element_types'])
    full_df = full_df.merge(
        elements_types_df[['id', 'singular_name_short']],  # Select necessary columns from team_data
        left_on='element_type',           # Column in season_data
        right_on='id',                     # Column in team_data
        how='left'                         # Use a left join to preserve all rows from season_data
    )
    full_df.rename(columns={'singular_name_short': 'position'}, inplace=True)
    print(full_df)
    full_df.drop(columns=['id'], inplace=True)
    full_df["team_id"]=full_df["team"].values
    full_df["team"]=full_df["team_name"].values
    old_data=data_prev[data_prev["round"]!=max_gw]
    inc_data=pd.concat([old_data, full_df], axis=0, ignore_index=True)
    inc_data.to_csv(f"Raw_Data_{season}/Fantasy_season_20{season}_data.csv")
    print(full_df)

def current_players(season):
    # Fetch data from the FPL API
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    response = requests.get(url)
    data = response.json()

    # Extract teams and players
    teams = data["teams"]
    players = data["elements"]

    team_mapping = {team["id"]: team["name"] for team in teams}
    players=pd.DataFrame(players)
    players_new=players[["code","element_type", "photo","team_code","team","opta_code","now_cost","selected_by_percent","expected_goals","web_name","news"]]
    players_new["name"]=players["first_name"]+" "+players["second_name"]
    players_new["name"]=players_new["name"].str.replace(" ", "_", n=1)
    players_new["chance_of_playing_this_round"]=players["chance_of_playing_this_round"]    
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
    "Rodrigo_'Rodri' Hernandez Cascante": "Rodrigo Hernandez",
    "Rúben_dos Santos Gato Alves Dias":   "Rúben_Gato Alves Dias",
    "Kaoru_Mitoma":                 "Mitoma_Kaoru",
    "Matheus_Santos Carneiro da Cunha": "Matheus_Santos Carneiro Da Cunha",
    "David_Raya Martín":"David_Raya Martin",
    "Kepa_Arrizabalaga Revuelta": "Kepa_Arrizabalaga",
    "Idrissa_Gana Gueye": "Idrissa_Gueye",
    "Alisson_Becker": "Alisson_Ramses Becker",
    "Luis_Díaz Marulanda": "Luis_Díaz",
    "Matheus Luiz_Nunes":"Matheus_Nunes",
    "Alejandro_Garnacho Ferreyra":"Alejandro_Garnacho"
}
    players_new["name"] = players_new["name"].apply(lambda n: name_map.get(n, n))

    players_new.to_csv(f"Raw_Data_{season}/current_players.csv")
def current_teams(season):
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    response = requests.get(url)
    data = response.json()
    

    # Extract teams and players
    teams = data["teams"]
    df_teams=pd.DataFrame(teams)
    df_teams.to_csv(f"Raw_Data_{season}/current_teams.csv")

def main_Extract(season, is_new_season, Has_been_error):
    season=season
    new_season=is_new_season
    Has_been_error=Has_been_error
    #innføre refresh tider
    """if new_season==1:
        Fulload(season)
    else:
        Incremental(Has_been_error,season)"""
    fixtures(season)
    current_players(season)

if __name__ == "__main__":
    main_Extract(26,1,0)  
