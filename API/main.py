from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os

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
def load_and_transform():
    current_dir = os.path.dirname(__file__)
    
    # Go one directory up
    parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
    
    # Build the full path to the CSV file in the parent folder
    csv_path = os.path.join(parent_dir, "All_Predictions.csv")

    # Load the CSV
    df = pd.read_csv(csv_path).iloc[:,1:]
    
    
    return df

@app.get("/Predictions")
def get_data():
    df = load_and_transform()
    return df.to_dict(orient="records")