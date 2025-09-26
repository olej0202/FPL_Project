import pandas as pd
import joblib
import numpy as np

def Generate_Team_threats():
    df = pd.read_csv("Team_AggTest.csv")
    team_df = df[["opponent", "pos_group", "date", "shots", "npxG_share", "xA_share", "key_passes"]].copy()

    # ensure proper dtypes
    team_df["date"] = pd.to_datetime(team_df["date"], errors="coerce")
    metrics = ["shots", "npxG_share", "xA_share", "key_passes"]
    team_df[metrics] = team_df[metrics].apply(pd.to_numeric, errors="coerce")

    # sort by time within each group
    team_df = team_df.sort_values(["opponent", "pos_group", "date"])

    # EWM per team × pos_group (span=20)
    span = 25
    ewm_cols = [f"{c}_ewm" for c in metrics]
    team_df[ewm_cols] = (
        team_df
          .groupby(["opponent", "pos_group"])[metrics]
          .transform(lambda s: s.ewm(span=span, adjust=False).mean())
    )

    # --- examples of how to use the result ---

    # 1) get Crystal Palace rows (with EWM columns)
    cp = team_df.loc[team_df["opponent"] == "Aston Villa"]

    # 2) latest EWM per team × pos_group (i.e., last date per group)
    latest_ewm = (
        team_df
          .sort_values("date")
          .groupby(["opponent", "pos_group"], as_index=False)
          .tail(1)[["opponent", "pos_group"] + ewm_cols]
    )
    team_totals = latest_ewm.groupby("opponent")["shots_ewm"].transform("sum")
    latest_ewm["shots_share_pct"] = (latest_ewm["shots_ewm"] / team_totals)
    latest_ewm["shots_share_pct"] = latest_ewm["shots_share_pct"].fillna(0.0)

    team_totals_pass = latest_ewm.groupby("opponent")["key_passes_ewm"].transform("sum")
    latest_ewm["pass_share_pct"] = (latest_ewm["key_passes_ewm"] / team_totals)
    latest_ewm["pass_share_pct"] = latest_ewm["pass_share_pct"].fillna(0.0)
    latest_ewm["Goal_Treat"]=latest_ewm["npxG_share_ewm"]*0.7+0.3*latest_ewm["shots_share_pct"]
    latest_ewm["Assist_Treat"]=latest_ewm["xA_share_ewm"]*0.7+0.3*latest_ewm["pass_share_pct"]
    latest_ewm["Treat"]=latest_ewm["Goal_Treat"]*0.7+0.3*latest_ewm["Assist_Treat"]

    latest_ewm=latest_ewm[["opponent","pos_group","Treat"]]
    pg = latest_ewm["pos_group"].str.upper().str.strip()
    latest_ewm = latest_ewm.loc[
        ~pg.isin(["SUB", "GK", "GKP"]),
        ["opponent", "pos_group", "Treat"]
    ]
    latest_ewm.to_csv("Team_threat.csv")
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
    df=df[["name", "GW","opponent_name","rolling_ICT","was_home","CBI"]]
    df = df.rename(columns={"name": "name2","GW": "GW2"})


    df2=pd.read_csv("Model_Predictions_visual.csv").iloc[:,1:]
    df3 = df2.merge(
        df,
        left_on=["name","GW"],
        right_on=["name2","GW2"],
        how="left"   # use 'inner' if you only want rows with a match
    )
    df3 = df3.drop(columns=["name2", "GW2"])
    df3["DefCon"]=df3["CBI"].values
    df3.to_csv("Model_Predictions_visual2.csv")
def Generate_ALL_datasets(current_teams):
    Generate_Player_Historical()
    Generate_Player_Rankings(current_teams)
    Generate_Team_threats()

if __name__ == "__main__":
    Generate_ALL_datasets()