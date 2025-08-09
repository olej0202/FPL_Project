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
            if data == 'var teamsData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                teamData = json.loads(decoded_content)
            elif data == 'var playersData':
                content = re.findall(r'JSON\.parse\(\'(.*)\'\)',split_data[1])
                decoded_content = codecs.escape_decode(content[0], "hex")[0].decode('utf-8')
                playerData = json.loads(decoded_content)
                
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
    
def main_Extract_Understat(season):
    FullLoad(season)
    Add_index(season)
    
if __name__ == "__main__":
    main_Extract_Understat(25)       
