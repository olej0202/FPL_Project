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
    
def Generate_Player_Rankings(current_teams):
    df=pd.read_csv("Player_prediction_set.csv")
    teams=pd.read_csv(current_teams)[["code", "name"]]
    teams = teams.rename(columns={"name": "opponent_name"})
    df = df.merge(
        teams,
        left_on="opp_code",
        right_on="code",
        how="left"   # use 'inner' if you only want rows with a match
    )

    # 5) Drop the no-longer-needed code columns
    df = df.drop(columns=["code", "opponent_code"])
    df=df[["name", "GW","opponent_name" ]]
    df = df.rename(columns={"name": "name2","GW": "GW2"})


    df2=pd.read_csv("Model_Predictions_visual.csv").iloc[:,1:]
    df3 = df2.merge(
        df,
        left_on=["name","GW"],
        right_on=["name2","GW2"],
        how="left"   # use 'inner' if you only want rows with a match
    )
    df3 = df3.drop(columns=["name2", "GW2"])
    df3.to_csv("Model_Predictions_visual2.csv")
def Generate_ALL_datasets(current_teams):
    Generate_Player_Historical()
    Generate_Player_Rankings(current_teams)

if __name__ == "__main__":
    Generate_ALL_datasets()