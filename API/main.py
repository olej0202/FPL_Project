from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
from fastapi.responses import StreamingResponse
import gzip
import io
import json
from fastapi import Request, Query
import numpy as np
from fastapi import HTTPException
from fastapi.responses import PlainTextResponse
from Generate_Optimize_Myteam import optimize_my_team
from typing import List, Optional

app = FastAPI()

# Allow frontend to access backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or use your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load and combine the 4 CSV files
def load_and_transform(endpoint):
    current_dir = os.path.dirname(__file__)
    parent_dir = os.path.abspath(os.path.join(current_dir, ".."))

    if endpoint == "Predictions":
        csv_path = os.path.join(parent_dir, "All_Predictions.csv")
    elif endpoint == "Team_Predictions":
        csv_path = os.path.join(parent_dir, "Team_prediction_visual.csv")
    elif endpoint == "ALL_Data":
        csv_path = os.path.join(parent_dir, "player_history.csv")
    elif endpoint == "Player_rankings":
        csv_path = os.path.join(parent_dir, "Model_Predictions_visual2.csv")
    elif endpoint == "Teams":
        csv_path = os.path.join(parent_dir, "Team_data_transformed2.csv")
    elif endpoint == "Current_players":
        csv_path = os.path.join(parent_dir, "Raw_Data_25", "current_players.csv")
    elif endpoint == "free-hit":
        csv_path = os.path.join(parent_dir, "Free_hit_team.csv")
    elif endpoint == "wildcard":
        csv_path = os.path.join(parent_dir, "Wildcard_team.csv")
    elif endpoint == "News":
        csv_path = os.path.join(parent_dir, "PL_news.csv")
    elif endpoint == "Team_Predictions_Future":
        csv_path = os.path.join(parent_dir, "Team_prediction.csv")
    elif endpoint == "Team_current":
        csv_path = os.path.join(parent_dir, "Team_data_newest3.csv")    
    else:
        raise ValueError(f"Unknown endpoint: {endpoint}")
        
    # Load the CSV
    df = pd.read_csv(csv_path).iloc[:,1:]
    
    
    return df

@app.get("/Predictions")
def get_data():
    df = load_and_transform("Predictions")
    return df.to_dict(orient="records")

@app.get("/News")
def get_data():
    df = load_and_transform("News")
    return df.to_dict(orient="records")

@app.get("/Team_Predictions")
def get_data():
    df = load_and_transform("Team_Predictions")
    return df.to_dict(orient="records")

@app.get("/Team_Predictions_Future")
def get_data():
    df = load_and_transform("Team_Predictions_Future")
    return df.to_dict(orient="records")


@app.get("/My_Team_Optimize")
def get_my_team_optimize(
    team_id: int,
    banned_list: Optional[List[str]]        = Query(None, title="Player IDs to ban", alias="banned_list"),
    bb_round:     Optional[int]             = Query(40, title="Bench Boost round"),
    wildcard_round: Optional[int]           = Query(40, title="Wildcard round"),
    freehit_round: Optional[int]           = Query(40, title="freehit round"),
    n_hits:Optional[int]           = Query(0, title="hits"),
):
    """
    Optimize a team given:
    - team_id (required)
    - banned_list (optional list of player IDs)
    - bb_round (optional Bench Boost round)
    - wildcard_round (optional Wildcard round)
    - Last_GW (optional last Gameweek to include)
    - GW_list (optional list of Gameweeks)
    - current_player_path (optional path override)
    """
    try:
        df = optimize_my_team(
            team_id=team_id,
            banned_list=banned_list or [],
            bb_round=bb_round,
            wildcard_round=wildcard_round,
            free_hit_round=freehit_round,
            Last_GW=4,
            GW_list=["0","5","6","7","8","9"],
            n_hits=n_hits,
            current_player_path="Raw_Data_25/current_players.csv"
        )
    except ValueError as e:
        # e.g. if team_id not found or invalid params
        raise HTTPException(status_code=400, detail=str("Team not found"))

    return df.to_dict(orient="records")



@app.get("/Player_rankings")
def get_player_rankings():
    df = load_and_transform("Player_rankings")

    # 1) Replace ±Inf with NaN
    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    # 2) Fill all NaNs with 0 (or another sentinel)
    df.fillna(0, inplace=True)

    # 3) Now dump to gzipped JSON
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="w") as gz:
        gz.write(json.dumps(df.to_dict(orient="records")).encode("utf-8"))
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Access-Control-Allow-Origin": "*",
        },
    )
@app.get("/Team_current")
def get_data():
    df = load_and_transform("Team_current")
    df=df.fillna(0)
    return df.to_dict(orient="records")


@app.get("/free-hit")
def get_data():
    df = load_and_transform("free-hit")
    return df.to_dict(orient="records")

@app.get("/wildcard")
def get_data():
    df = load_and_transform("wildcard")
    return df.to_dict(orient="records")

@app.get("/ALL_Data")
def get_all_data():
    df = load_and_transform("ALL_Data")

    # Convert to JSON and compress
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="w") as gz:
        gz.write(json.dumps(df.to_dict(orient="records")).encode('utf-8'))
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Access-Control-Allow-Origin": "*"
        }
    )
    
@app.get("/Teams")
def get_team_data(team: str = Query(None)):
    df = load_and_transform("Teams")

    if team:
        df = df[df["name"] == team]

    # Replace non-JSON-compliant values
    df = df.replace([np.inf, -np.inf], np.nan)
    df=df.dropna()

    # Convert to dict
    records = df.to_dict(orient="records")

    # Use allow_nan=False to force clean JSON
    try:
        return json.loads(json.dumps(records, allow_nan=False))
    except ValueError as e:
        # Optional: Log or return an error if still invalid
        print("JSON serialization error:", e)
        print(df[df.isin([np.nan, np.inf, -np.inf]).any(axis=1)])
        return {"error": "Data contains values that cannot be serialized to JSON."}

@app.get("/Teams_unique")
def get_team_data_unique():
    df = load_and_transform("Teams")
    # Filter by team if provided
    unique_teams = df["name"].dropna().unique().tolist()
    return sorted(unique_teams)

@app.get("/Player_picture", response_class=PlainTextResponse)
def get_team_data_unique(player: str = Query(None)):
    df = load_and_transform("Current_players")
    player_df = df[df["name"] == player]
    
    if player_df.empty:
        raise HTTPException(status_code=404, detail="Player not found")

    picture = player_df["code"].values[0]
    return f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{picture}.png"

@app.get("/Player_unique")
def get_team_data_unique():
    df = load_and_transform("ALL_Data")
    max_season=df["season"].max()
    df=df[(df['season'] == max_season)]
    # Filter by team if provided
    unique_teams = df["name"].dropna().unique().tolist()
    return sorted(unique_teams)

@app.get("/Player")
def get_team_data(player: str = Query(None)):
    df = load_and_transform("ALL_Data")

    if player:
        df = df[df["Name"] == player]

    # Replace non-JSON-compliant values
    df = df.replace([np.inf, -np.inf], np.nan)
    df=df.dropna()

    # Convert to dict
    records = df.to_dict(orient="records")

    # Use allow_nan=False to force clean JSON
    try:
        return json.loads(json.dumps(records, allow_nan=False))
    except ValueError as e:
        # Optional: Log or return an error if still invalid
        print("JSON serialization error:", e)
        print(df[df.isin([np.nan, np.inf, -np.inf]).any(axis=1)])
        return {"error": "Data contains values that cannot be serialized to JSON."}
    
@app.get("/")
def root():
    return {"status": "API is up"}
