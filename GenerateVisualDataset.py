import pandas as pd
import joblib
import numpy as np

def Generate_Player_Historical():
    data=pd.read_csv("testML4.csv").iloc[:,1:]
    relevant_players=pd.read_csv("Player_Prediction_set.csv")
    teams=pd.read_csv("Team_data_transformed2.csv")
    team_code=teams[['name', 'code']].drop_duplicates().rename(columns={'name':'Opponent Name'}).reset_index(drop=True)
    unique_players=relevant_players["name"].unique()
    
    filtered_data=data[data["name"].isin(unique_players)]
    Cols_to_include=["name", "position", "kickoff_time", "opponent_code", "season", "assists", "bonus", "expected_assists", "expected_goals", "goals_scored", "minutes", "total_points", "ICT", "Adjusted_XG", "Adjusted_XA"]
    filtered_data=filtered_data[Cols_to_include]
    merged_df = filtered_data.merge(team_code, how='left', left_on='opponent_code', right_on='code')

    merged_df.drop(columns=['opponent_code','code' ], inplace=True)
    
    merged_df.columns = ['Name', 'Position', 'Kickoff time', 'Season','Assists','Bonus',"Expected Assists", "Expected Goals", "Goals Scored", "Minutes", "Fantasy Points", "ICT", "Adjusted XG", "Adjusted XA",'Opponent Name']
    merged_df.to_csv("player_history.csv")
    
def Generate_ALL_datasets():
    Generate_Player_Historical()

if __name__ == "__main__":
    Generate_ALL_datasets()