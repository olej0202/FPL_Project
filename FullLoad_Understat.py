import requests
import json
from bs4 import BeautifulSoup
import re
import codecs
import pandas as pd
import os
import csv
from rapidfuzz import process

def get_data(url):
    response = requests.get(url)
    if response.status_code != 200:
        raise Exception("Response was code " + str(response.status_code))
    html = response.text
    parsed_html = BeautifulSoup(html, 'html.parser')
    scripts = parsed_html.findAll('script')
    filtered_scripts = []
    for script in scripts:
        if len(script.contents) > 0:
            filtered_scripts += [script]
    return scripts
def get_player_data(id):
    scripts = get_data("https://understat.com/player/" + str(id))
    groupsData = {}
    matchesData = {}
    shotsData = {}
    for script in scripts:
        for c in script.contents:
            split_data = c.split('=')
            data = split_data[0].strip()
            if data == 'var matchesData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                matchesData = json.loads(decoded_content)
            """
            elif data == 'var shotsData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                shotsData = json.loads(decoded_content)
            elif data == 'var groupsData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                groupsData = json.loads(decoded_content)"""
    return matchesData

def FullLoad(season):
    scripts = get_data(f"https://understat.com/league/EPL/20{season}")
    teamData = {}
    playerData = {}
    for script in scripts:
        for c in script.contents:
            split_data = c.split('=')
            data = split_data[0].strip()
            print(c)
            if data == 'var teamsData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                teamData = json.loads(decoded_content)
            elif data == 'var playersData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                playerData = json.loads(decoded_content)
    print(playerData)            
                
    df=pd.DataFrame(playerData)[["id", "player_name","team_title"]]
    Unique_ids=df["id"].unique()
    All_data=pd.DataFrame()
    for k in range(len(Unique_ids)):
        player_id=Unique_ids[k]
        player_meta_data=df[df["id"]==player_id]
        player_data=get_player_data(player_id)
        player_data_df=pd.DataFrame(player_data)
        replicated_id_df = pd.concat([player_meta_data] * len(player_data_df), ignore_index=True)
        player_data_df["player_name"]=replicated_id_df["player_name"]
        player_data_df["team_title"]=replicated_id_df["team_title"]
        All_data=pd.concat([All_data, player_data_df], axis=0, ignore_index=True)
        print(player_data_df)
    
    All_data.to_csv(f"Raw_Data_{season}/Understat_data.csv")
def Add_index(season):
    Unique_Fantasy_data=pd.read_csv(f"Raw_Data_{season}\current_players.csv")[["code","first_name","second_name","name"]].drop_duplicates()
    
    Understat_df=pd.read_csv(f"Raw_Data_{season}/Understat_data.csv").iloc[:,1:]
    
    All_data=pd.DataFrame()
    for i in range(len(Unique_Fantasy_data.values)):
        first_name=Unique_Fantasy_data.values[i][1]
        second_name=Unique_Fantasy_data.values[i][2]
        id=Unique_Fantasy_data.values[i][0]
        full_name=first_name+" "+second_name
        old_names=["Gabriel Fernando de Jesus"]
        new_names=["Gabriel Jesus"]
        if(full_name in old_names):
            name_ind=old_names.index(full_name)
            full_name=new_names[name_ind]
        print(full_name)
        similarity_threshold = 95  
        closest_match = process.extractOne(full_name, Understat_df['player_name'])
        if closest_match and closest_match[1] >= similarity_threshold:
            filtered_df=Understat_df[Understat_df['player_name']==closest_match[0]]
            print(closest_match)
        else:
            filtered_df=pd.DataFrame()
            print("No match")
            
        if(len(filtered_df)<1):
            filtered_df = Understat_df[Understat_df['player_name'].str.contains(second_name, case=False, na=False)]
        
        if(len(filtered_df)<1):
            similarity_threshold = 85  
            print("FUZZYYYY")
            closest_match = process.extractOne(full_name, Understat_df['player_name'])
            if closest_match and closest_match[1] >= similarity_threshold:
                filtered_df=Understat_df[Understat_df['player_name']==closest_match[0]]
                print(closest_match)
            else:
                print("No match")
        if(len(filtered_df["player_name"].unique())>1):
            similarity_threshold = 70  
            print("FUZZYYYY_duo")
            closest_match = process.extractOne(full_name, Understat_df['player_name'])
            print(closest_match)
            if closest_match and closest_match[1] >= similarity_threshold:
                filtered_df=Understat_df[Understat_df['player_name']==closest_match[0]]
                print(closest_match)
            else:
                print("No match")
        filtered_df["element"]=[id]*len(filtered_df)
        filtered_df['element'] = filtered_df['element'].astype(str).str.split('.').str[0]
        All_data=pd.concat([All_data, filtered_df], axis=0, ignore_index=True)
        
    All_data.to_csv(f"Raw_Data_{season}/Understat_data_with_element.csv")
    

def teams_data(season):
    league="EPL"
    url = f"https://understat.com/league/{league}/20{season}"
    html = requests.get(url, timeout=30).text

    # Extract the JSON embedded in the page (teamsData)
    m = re.search(r"var\s+teamsData\s*=\s*JSON.parse\('([^']+)'\);", html)
    raw = m.group(1)
    decoded = json.loads(raw.encode('utf-8').decode('unicode_escape'))
    # decoded is a dict keyed by team id; values are dicts with xG/xGA totals & more
    df = pd.DataFrame.from_dict(decoded, orient="index").reset_index(drop=True)
    
    df['history'] = df['history'].apply(lambda x: x if isinstance(x, list) else [])

    # 2) Explode to one row per match
    tmp = df.explode('history', ignore_index=True)

    # 3) Flatten the match dicts (including nested ppda fields)
    hist_flat = pd.json_normalize(tmp['history'], sep='_')

    # 4) Combine with id/name and clean up
    out = pd.concat([tmp[['id', 'title']].reset_index(drop=True), hist_flat], axis=1)

    # 5) Optional: compute PPDA ratios and parse date
    if {'ppda_att','ppda_def'}.issubset(out.columns):
        out['ppda'] = out['ppda_att'] / out['ppda_def']
    if {'ppda_allowed_att','ppda_allowed_def'}.issubset(out.columns):
        out['ppda_allowed'] = out['ppda_allowed_att'] / out['ppda_allowed_def']

    if 'date' in out.columns:
        out['date'] = pd.to_datetime(out['date'], errors='coerce')
        
    out.to_csv(f"Raw_Data_{season}/Understat_Teams.csv")
    

    
def main_Extract_Understat(season):
    FullLoad(season)
    Add_index(season)
    teams_data(season)
if __name__ == "__main__":
    main_Extract_Understat(25)       
