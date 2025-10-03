import pandas as pd
import joblib
import numpy as np



def Visual_Teams_history(path="Team_Data_FUll.csv"):
    # 1) Load + keep only needed columns
    df = pd.read_csv(path).iloc[:, 1:]
    cols = ["name", "code", "kickoff_time",
            "Plain_XG", "Plain_XGC", "Plain_GS", "Plain_GC","Clean_Sheet",
            "Threat", "Threat_against", "was_home", "opponent"]
    teams_df = df[cols].copy()

    # 2) Make sure code/opponent are numeric (so join works reliably)
    teams_df["code"] = pd.to_numeric(teams_df["code"], errors="coerce").astype("Int64")
    teams_df["opponent"] = pd.to_numeric(teams_df["opponent"], errors="coerce").astype("Int64")

    # 3) Build unique team lookup (code → name)
    unique_teams = (
        teams_df[["name", "code"]]
        .drop_duplicates()
        .dropna(subset=["code"])        # only rows with a code
        .rename(columns={"name": "opponent_name", "code": "opponent"})   # rename to join on 'opponent'
    )

    # 4) Merge opponent name into teams_df
    teams_df = teams_df.merge(
        unique_teams[["opponent", "opponent_name"]],
        on="opponent",
        how="left"
    )

    # 5) Parse kickoff_time and create Season:
    #    If month <= 6 → Season = year, else Season = year + 1
    teams_df["kickoff_time"] = pd.to_datetime(teams_df["kickoff_time"], errors="coerce")

    transformed_teams=pd.read_csv("Team_data_transformed2.csv").iloc[:,1:][["code","kickoff_time", "XGC_avg","XG_avg" ]].rename(columns={"code": "opponent_code","kickoff_time":"kickoff2"})   # rename to join on 'opponent'
    transformed_teams["kickoff2"] = pd.to_datetime(transformed_teams["kickoff2"], errors="coerce")
    
    teams_df=teams_df.merge(transformed_teams, right_on=["opponent_code","kickoff2"], left_on=["opponent","kickoff_time"], how="left")


    print(teams_df)

    teams_df["Season"] = np.where(
        teams_df["kickoff_time"].dt.month <= 6,
        teams_df["kickoff_time"].dt.year,
        teams_df["kickoff_time"].dt.year + 1
    )

    # (Optional) Pretty season label like "2023/24"
    teams_df["Season_Label"] = teams_df["Season"].astype("Int64").apply(
        lambda y: f"{y-1}/{str(y%100).zfill(2)}" if pd.notna(y) else pd.NA
    )

    teams_df["Goals-XG"] = teams_df["Plain_GS"]- teams_df["Plain_XG"]
    teams_df["Goals Conceeded-XGC"] = teams_df["Plain_GC"]- teams_df["Plain_XGC"]
    teams_df["Expected Goals Adjusted"] = teams_df["Plain_XG"]/teams_df["XGC_avg"]
    teams_df["Expected Goals Conceeded Adjusted"] = teams_df["Plain_XGC"]/teams_df["XG_avg"]
    cutoff = pd.Timestamp("2023-12-01", tz="UTC")
    teams_df = teams_df.loc[teams_df["kickoff_time"] >= cutoff].copy()
    teams_df = teams_df.rename(columns={
    "Plain_XG":  "Expected Goals",
    "Plain_XGC": "Expected Goals Conceeded",
    "Plain_GS":  "Goals Scored",
    "Plain_GC":  "Goals Conceeded",
    "Clean_Sheet": "Clean Sheets"
    })

    
    teams_df.to_csv("Teams_Visual_Analysis.csv")

Visual_Teams_history()
    
def Generate_Lineups():

    # ── Load & prep ────────────────────────────────────────────────────────────────
    df = pd.read_csv("Understat_transformed.csv")
    df = df[["player_name","player_team","opponent","pos_group","date"]].copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    
    # ── Latest lineup per team (drop SUB) ─────────────────────────────────────────
    df_non_sub = df.loc[~df["pos_group"].str.upper().eq("SUB")].copy()
    df_non_sub["latest_team_date"] = df_non_sub.groupby("player_team")["date"].transform("max")
    out = (
        df_non_sub.loc[df_non_sub["date"].eq(df_non_sub["latest_team_date"])]
                  .drop(columns="latest_team_date")
                  .sort_values(["player_team","date","player_name"])
                  .reset_index(drop=True)
    )
    
    # ── % appearances over last 5 distinct team dates (non-SUB) ──────────────────
    last5_dates = (
        df_non_sub[["player_team","date"]].drop_duplicates()
                 .sort_values(["player_team","date"], ascending=[True, False])
                 .groupby("player_team")
                 .head(5)
    )
    denom = last5_dates.groupby("player_team")["date"].nunique().rename("n_dates").reset_index()
    
    appearances = (
        df_non_sub.merge(last5_dates, on=["player_team","date"], how="inner")
                  .drop_duplicates(["player_team","player_name","date"])
                  .groupby(["player_team","player_name"])["date"].nunique()
                  .rename("appearances_last5")
                  .reset_index()
    )
    
    # ── Include position from the last date ───────────────────────────────────────
    pos_latest = out[["player_team","player_name","pos_group"]].rename(columns={"pos_group":"pos_latest"})
    
    result = (out[["player_team","player_name"]]            # players from latest lineup
              .merge(pos_latest, on=["player_team","player_name"], how="left")
              .merge(appearances, on=["player_team","player_name"], how="left")
              .merge(denom, on="player_team", how="left"))
    
    result["appearances_last5"] = result["appearances_last5"].fillna(0).astype(int)
    result["appear_pct_last5"] = (result["appearances_last5"] / result["n_dates"] * 100).round(1)
    
    # Final columns
    result = result[["player_team","player_name","pos_latest","appearances_last5","n_dates","appear_pct_last5"]]
    print("HEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEER")
    
    result.to_csv("Team_lineups.csv")

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
    span = 20
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
    latest_ewm["Assist_Treat"]=latest_ewm["xA_share_ewm"]*0.6+0.4*latest_ewm["pass_share_pct"]
    latest_ewm["Treat"]=latest_ewm["Goal_Treat"]*0.6+0.4*latest_ewm["Assist_Treat"]

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
    Cols_to_include=["name", "position", "kickoff_time", "opponent_code", "season", "assists", "bonus", "expected_assists", "expected_goals", "goals_scored", "minutes", "total_points", "ICT", "Adjusted_XG", "Adjusted_XA","defcon_hit_rate"]
    filtered_data=filtered_data[Cols_to_include]
    merged_df = filtered_data.merge(team_code, how='left', left_on='opponent_code', right_on='code')

    merged_df.drop(columns=['opponent_code','code' ], inplace=True)
    
    merged_df.columns = ['Name', 'Position', 'Kickoff time', 'Season','Assists','Bonus',"Expected Assists", "Expected Goals", "Goals Scored", "Minutes", "Fantasy Points", "ICT", "Adjusted XG", "Adjusted XA",'Defcon Hit','Opponent Name']
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
    Generate_Lineups()
    Visual_Teams_history()

if __name__ == "__main__":
    Generate_ALL_datasets()