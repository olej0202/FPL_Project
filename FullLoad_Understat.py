import requests
import json
from bs4 import BeautifulSoup
import re
import codecs
import pandas as pd
import os
import csv
from rapidfuzz import process
import time
from typing import Any, Dict

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
    

    
  




# -------------------------
# Constants / config
# -------------------------



# -------------------------
# Helper: parse Understat responses
# -------------------------

def encode_teams(teams_dict,season):
    df = pd.DataFrame.from_dict(teams_dict, orient="index").reset_index(drop=True)
    
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
    
def parse_understat_response(text: str) -> Any:
    """Parse either pure JSON or JSON wrapped in JSON.parse('...')."""
    # Try plain JSON first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback format
    m = re.search(r"JSON\.parse\('(.+?)'\)", text)
    if not m:
        raise ValueError("Could not parse Understat response")

    raw = m.group(1)
    json_str = codecs.getdecoder("unicode_escape")(raw)[0]
    return json.loads(json_str)


# -------------------------
# Helper: fetch per-player data
# -------------------------
def fetch_player_data(player_id: int, session: requests.Session = None,BASE_URL:str="https://understat.com",SESSION_HEADERS:dict={
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",  # mimic AJAX
    }) -> Dict:
    if session is None:
        session = requests.Session()

    url = f"{BASE_URL}/getPlayerData/{player_id}"
    headers = SESSION_HEADERS.copy()
    headers["Referer"] = f"{BASE_URL}/player/{player_id}"

    resp = session.get(url, headers=headers)
    resp.raise_for_status()

    return parse_understat_response(resp.text)


# -------------------------
# Main logic
# -------------------------
def get_league_and_player_data(
    league: str = "EPL",
    season: int = 2025,
    sleep_seconds: float = 0.3,
):
    BASE_URL = "https://understat.com"

    SESSION_HEADERS = {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",  # mimic AJAX
    }
    # ---- 1) Fetch league dataset ----
    league_url = f"{BASE_URL}/getLeagueData/{league}/20{season}"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": f"{BASE_URL}/league/{league}/20{season}",
        "X-Requested-With": "XMLHttpRequest",
    }

    r = requests.get(league_url, headers=headers)
    r.raise_for_status()
    league_data = parse_understat_response(r.text)

    players = league_data["players"]     # list
    teams =  json.loads(r.text)["teams"]       # dict
    
    encode_teams(teams,season)

    # ---- 2) Build players_df ----
    players_df = pd.DataFrame(players)

    # Convert numeric fields
    numeric_cols = [
        "id", "games", "time", "goals", "xG", "assists", "xA",
        "shots", "key_passes", "yellow_cards", "red_cards",
        "npg", "npxG", "xGChain", "xGBuildup",
    ]
    for col in numeric_cols:
        if col in players_df.columns:
            players_df[col] = pd.to_numeric(players_df[col], errors="coerce")

    # Ensure IDs are int
    players_df["id"] = players_df["id"].astype(int)

    # Extract relevant metadata for merging later
    player_meta = players_df[["id", "player_name", "team_title"]].copy()
    player_meta.rename(columns={"id": "player_id"}, inplace=True)

    player_ids = player_meta["player_id"].unique()

    # ---- 3) Fetch player-level detailed data ----
    session = requests.Session()
    all_match_rows = []
    all_shot_rows = []

    for i, pid in enumerate(player_ids, start=1):
        try:
            pdata = fetch_player_data(pid, session=session,BASE_URL=BASE_URL,SESSION_HEADERS=SESSION_HEADERS)
        except Exception as e:
            print(f"Error fetching player {pid}: {e}")
            continue

        matches = pdata.get("matches", [])
        shots = pdata.get("shots", [])

        # Convert dict → list if needed
        if isinstance(matches, dict):
            matches = list(matches.values())
        if isinstance(shots, dict):
            shots = list(shots.values())

        # Add player_id field
        for m in matches:
            row = m.copy()
            row["player_id"] = pid
            all_match_rows.append(row)

        for s in shots:
            row = s.copy()
            row["player_id"] = pid
            all_shot_rows.append(row)

        time.sleep(sleep_seconds)

        if i % 25 == 0:
            print(f"Fetched {i} players")

    # ---- 4) Assemble DataFrames ----
    matches_df = pd.DataFrame(all_match_rows)
    shots_df = pd.DataFrame(all_shot_rows)

    # ---- 5) MERGE player_name + team_title into both ----
    matches_df = matches_df.merge(player_meta, on="player_id", how="left")
    shots_df = shots_df.merge(player_meta, on="player_id", how="left")
    
    matches_df.to_csv(f"Raw_Data_{season}/Understat_data.csv")
    shots_df.to_csv(f"Raw_Data_{season}/Understat_data_shots.csv")


def main_Extract_Understat(season):
    #FullLoad(season)
    get_league_and_player_data("EPL", season)
    Add_index(season)
if __name__ == "__main__":
    main_Extract_Understat(25)     
