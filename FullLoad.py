import pandas as pd
import os
import requests
import json
import pandas as pd

def fixtures():
    url = "https://fantasy.premierleague.com/api/fixtures/"
    response = requests.get(url)
    json_data = response.json()
    df=pd.DataFrame(json_data)
    df.to_csv("Raw_Data_24/Fantasy_season_2024_Fixtures.csv")

def Fulload():
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
    full_df.to_csv("Raw_Data_24/Fantasy_season_2024_data.csv")
    print(full_df)
    fixtures()
    
    
def Incremental(Has_been_error):
    url = 'https://fantasy.premierleague.com/api/bootstrap-static/'
    response = requests.get(url)
    json_data = response.json()
    elements_df = pd.DataFrame(json_data['elements'])
    print(elements_df.columns)
    data_points=elements_df[["id", "second_name", "team","first_name","code","news","element_type","team_code","web_name"]]
    ids=data_points["id"].unique()
    data_prev=pd.read_csv("Raw_Data_24/Fantasy_season_2024_data.csv").iloc[:,1:]
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
    errors_df.to_csv("Raw_Data_24/Errors.csv")
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
    inc_data.to_csv("Raw_Data_24/Fantasy_season_2024_data.csv")
    fixtures()
    print(full_df)


def main():
    #Fulload()
    Has_been_error=0
    Incremental(Has_been_error)
      
a=main()