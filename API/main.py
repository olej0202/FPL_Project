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
    
    # Go one directory up
    parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
    
    # Build the full path to the CSV file in the parent folder
    if(endpoint=="Predictions"):
        csv_path = os.path.join(parent_dir, "All_Predictions.csv")
    elif(endpoint=="Team_Predictions"):
        csv_path = os.path.join(parent_dir, "Team_prediction_visual.csv")
    elif(endpoint=="ALL_Data"):
        csv_path = os.path.join(parent_dir, "ML_training2.csv")
    elif(endpoint=="Teams"):
        csv_path = os.path.join(parent_dir, "Team_data_transformed2.csv")
        
    # Load the CSV
    df = pd.read_csv(csv_path).iloc[:,1:]
    
    
    return df

@app.get("/Predictions")
def get_data():
    df = load_and_transform("Predictions")
    return df.to_dict(orient="records")

@app.get("/Team_Predictions")
def get_data():
    df = load_and_transform("Team_Predictions")
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
        df = df[df["name"] == player]

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