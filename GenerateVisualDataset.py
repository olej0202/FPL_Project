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
    span = 15
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
    latest_ewm["Goal_Treat"]=latest_ewm["npxG_share_ewm"]*0.6+0.4*latest_ewm["shots_share_pct"]
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
    

def Generate_season_data(current_player_path, current_season_path):

    df=pd.read_csv(current_season_path).iloc[:,1:]
    players_current=pd.read_csv(current_player_path)


    name_map = {
        "Pedro_Porro Sauceda":          "Pedro_Porro",
        "Sávio_Moreira de Oliveira":    "Sávio_'Savinho' Moreira de Oliveira",
        "Daniel_Muñoz Mejía":           "Daniel_Muñoz",
        "Bernardo_Mota Veiga de Carvalho e Silva": "Bernardo_Veiga de Carvalho e Silva",
        "Ederson_Santana de Moraes":    "Ederson_Santana de Moraes",
        "Levi_Samuels Colwill":         "Levi_Colwill",
        "Marcos_Senesi Barón":          "Marcos_Senesi",
        "Raúl_Jiménez Rodríguez":       "Raúl_Jiménez",
        "Robert_Lynch Sánchez":         "Robert_Sánchez",
        "Rodrigo_'Rodri' Hernandez Cascante": "Rodrigo_Hernandez",
        "Rúben_dos Santos Gato Alves Dias":   "Rúben_Gato Alves Dias",
        "Kaoru_Mitoma":                 "Mitoma_Kaoru",
        "Matheus_Santos Carneiro da Cunha": "Matheus_Santos Carneiro Da Cunha",
        "David_Raya Martín":"David_Raya Martin",
        "Kepa_Arrizabalaga Revuelta": "Kepa_Arrizabalaga",
        "Idrissa_Gana Gueye": "Idrissa_Gueye",
        "Alisson_Becker": "Alisson_Ramses Becker",
        "Luis_Díaz Marulanda": "Luis_Díaz",
        "Matheus Luiz_Nunes":"Matheus_Nunes",
        "Alejandro_Garnacho Ferreyra":"Alejandro_Garnacho",
        "Francisco Evanilson_de Lima Barbosa":"Francisco_Evanilson de Lima Barbosa",
        "João Pedro_Junqueira de Jesus": "João_Pedro Junqueira de Jesus",
        "Igor Thiago_Nascimento Rodrigues":"Igor_Thiago Nascimento Rodrigues"
    }


    df["Full_Name"] = df["Full_Name"].apply(lambda n: name_map.get(n, n))
    merged = df.merge(players_current, left_on='Full_Name',right_on='name', how='left')
    columns=["expected_goals_x","total_points","position", "Full_Name", "web_name","round","goals_scored","minutes_x","assists","clean_sheets","goals_conceded","yellow_cards","saves","bonus","defensive_contribution_x","expected_assists","expected_goal_involvements","expected_goals_conceded","value","team_name"]
    merged=merged[columns]
    merged = merged.rename(columns=lambda c: c[:-2] if c.endswith("_x") else c)
    merged=merged[merged["minutes"]>0]
    merged["GW"]=merged["round"].astype(int)
    merged["GOALS-XG"]=merged["goals_scored"]-merged["expected_goals"]
    merged["Assist-XA"]=merged["assists"]-merged["expected_assists"]
    merged["GOALSCONCEEDED-XGOALSCONCEEDED"]=merged["goals_conceded"]-merged["expected_goals_conceded"]
    merged['defcon_hit'] = (
        ((merged['position'] == 'DEF') & (merged['defensive_contribution'] >= 10)) |
        ((merged['position'] != 'DEF') & (merged['defensive_contribution'] >= 12))
    ).astype(int)
    merged["Type"]="Players"
    merged = merged.replace([np.inf, -np.inf], np.nan)
    merged = merged.fillna(0)

    max_cols = ["clean_sheets", "expected_goals_conceded", "goals_conceded","GOALSCONCEEDED-XGOALSCONCEEDED"]

    # all numeric columns in merged (we'll sum these except the max_cols and GW which is a group key)
    numeric_cols = merged.select_dtypes(include=[np.number]).columns.tolist()

    # build aggregation dict: sum for numeric columns except the ones in max_cols and GW
    sum_cols = [c for c in numeric_cols if c not in set(max_cols + ["GW"])]
    agg_dict = {c: "sum" for c in sum_cols}
    for c in max_cols:
        if c in merged.columns:
            agg_dict[c] = "max"

    # If you want to keep any *non-numeric* derived numeric-like fields that might be strings,
    # add them explicitly here with 'sum' or 'max' as appropriate (usually not needed).

    # Perform aggregation per team_name and GW
    team_agg = (
        merged
        .groupby(["team_name", "GW"], as_index=False)
        .agg(agg_dict)
    )

    # Set identity/meta fields to match your player schema expectations
    team_agg["Full_Name"] = team_agg["team_name"]
    team_agg["position"] = 0
    team_agg["web_name"] = team_agg["Full_Name"]

    team_agg["Type"] = "Teams"

    # Make sure all columns expected by downstream code exist, with sane defaults,
    # and order columns to match `merged` so you can concat safely.
    cols_in_merged = list(merged.columns)
    for col in cols_in_merged:
        if col not in team_agg.columns:
            # default numeric -> 0, string/object -> ""
            team_agg[col] = 0 if col in numeric_cols else ""

    # Keep only the columns present in `merged` and in the same order
    team_agg = team_agg[cols_in_merged]
    team_agg["GOALSCONCEEDED-XGOALSCONCEEDED"]=team_agg["goals_conceded"]-team_agg["expected_goals_conceded"]


    # Optional: combine players + teams in one dataframe for export/analytics
    season_with_teams = pd.concat([merged[cols_in_merged], team_agg], ignore_index=True)

    season_with_teams.to_csv("Season_analysis.csv")


def Generate_Team_Adjustments():
    df = pd.read_csv("Team_prediction.csv").iloc[:, 2:]

    team_data_home = pd.read_csv("Team_data_newest3.csv").iloc[:, 1:][[
        "name", "code", "XG_avg", "XGC_avg", "XGH", "XGA", "XGCH", "XGCA"
    ]]

    # Create home metrics
    team_data_home["H_Att_E"] = (team_data_home["XGH"] - team_data_home["XGA"])/2
    team_data_home["H_def_E"] = (team_data_home["XGCH"] - team_data_home["XGCA"])/2
    team_data_home = team_data_home[["name", "code", "XG_avg", "XGC_avg", "H_Att_E", "H_def_E"]]

    # Away uses the same base table (same numbers), just joined on name instead of code
    team_data_away = team_data_home.copy()

    # ---------- HOME MERGE (own_ prefix) ----------
    home_merge = team_data_home[["code", "XG_avg", "XGC_avg", "H_Att_E", "H_def_E"]].rename(
        columns={
            "XG_avg": "own_XG_avg",
            "XGC_avg": "own_XGC_avg",
            "H_Att_E": "own_H_Att_E",
            "H_def_E": "own_H_def_E",
        }
    )

    df = df.merge(
        home_merge,
        how="left",
        left_on="team_code",
        right_on="code",
    )

    # If you don’t need the extra 'code' column from the merge:
    df = df.drop(columns=["code"])

    # ---------- AWAY MERGE (opponent_ prefix) ----------
    away_merge = team_data_away[["name", "XG_avg", "XGC_avg", "H_Att_E", "H_def_E"]].rename(
        columns={
            "XG_avg": "opponent_XG_avg",
            "XGC_avg": "opponent_XGC_avg",
            "H_Att_E": "opponent_H_Att_E",
            "H_def_E": "opponent_H_def_E",
        }
    )

    df = df.merge(
        away_merge,
        how="left",
        left_on="Opponent_team",
        right_on="name",
    )

    # If you don’t need the extra 'name' column from the merge:
    df = df.drop(columns=["name"])

    df["GW"] = pd.to_numeric(df["GW"], errors="coerce")

    # Define limits
    min_gw = df["GW"].min()
    max_gw = min_gw + 4

    # Filter DF to only include those GWs
    df_filtered = df[(df["GW"] >= min_gw) & (df["GW"] <= max_gw)]

    df_filtered.to_csv("Visual_adjust_Team_results.csv")

def Player_adjustements(current_player_path):
    import numpy as np


    df = pd.read_csv("Player_Prediction_set.csv")

    # Base columns you want to keep
    columns = [
        "name","position", "GW", "Team",
        "Understat_POSXG_Share", "Understat_POSXA_Share",
        "Team_Pen_Data", "Pen_Number", "player_risiko",
        "Rolling_adjusted_XG_share", "average_minutes",
        "rolling_Threat_share", "Rolling_adjusted_XA_share",
        "Rolling_creativity_share", "rolling_Adjusted_XA_historic_share",
        "rolling_Adjusted_XG_historic_share", "Rolling_adjusted_BPS",
        "CBI", "Average_Overscore", "Average_OverAssist","defcon_avg_hit_rate", "Share_of_XG_share", "Share_of_XA_share","Threat_Mean_share"
        ,"rolling_XG_share","Creativity_Mean_share","Opp_defcon"
    ]

    # Goal & assist shares (blend model vs Understat, weighted by risk)
    risk_adj_minutes_factor = np.maximum(1, 75 / (df["average_minutes"]+0.01))
    # alternatively: df["average_minutes"].rdiv(75).clip(lower=1)

    df["Goal_share"] = (
        (
            df["Rolling_adjusted_XG_share"] * 0.25
            + df["rolling_Threat_share"] * 0.25
            + df["Threat_Mean_share"] * 0.25
            +df["rolling_XG_share"]*0.25
        )
        * (1 - df["player_risiko"])
        * risk_adj_minutes_factor
        + df["player_risiko"] * df["Understat_POSXG_Share"]
    )

    df["Assist_share"] = (
        (df["Rolling_adjusted_XA_share"] * 0.25
         + df["Rolling_creativity_share"] * 0.25
         + df["rolling_Adjusted_XA_historic_share"] * 0.25
         +df["Creativity_Mean_share"]*0.25)
        * (1 - df["player_risiko"])
        * risk_adj_minutes_factor
        + df["player_risiko"] * df["Understat_POSXA_Share"]
    )

    # Cap overscore/overassist factors per player in [0.9, 1.15]
    overscore_factor = df["Average_Overscore"].clip(0.9, 1.1)
    overassist_factor = df["Average_OverAssist"].clip(0.9, 1.15)

    df["Goal_share"] = df["Goal_share"] * overscore_factor
    df["Assist_share"] = df["Assist_share"] * overassist_factor
    # Penalty data
    df["Pen_data"] = df["Team_Pen_Data"] * df["Pen_Number"]
    divisor = np.where(df["position"] == "DEF", 10, 12)

    cbi_scaled = np.minimum(1, df["CBI"] / divisor) 
    cbi_opp=1+(df["Opp_defcon"]-75)/75

    df["CBI_Percent"] = (
        df["defcon_avg_hit_rate"] * 0.4
        + 0.6 * cbi_scaled
    )*cbi_opp

    bps_scaled = np.maximum(4, df["Rolling_adjusted_BPS"]) 
    df["BPS"]=bps_scaled*0.0377
    # Final columns (including the new ones)
    final_cols =["name","position", "GW", "Team","average_minutes","Goal_share", "Assist_share", "Pen_data","CBI_Percent","BPS"]
    df = df[final_cols]

    import numpy as np

    # ---- Goal Factor ----
    df["Goal_factor"] = np.select(
        [
            df["position"] == "FWD",
            df["position"] == "MID",
            df["position"] == "DEF",
        ],
        [
            6,  # FWD
            5.5,  # MID
            6.3,  # DEF
        ],
        default=0,
    )

    # ---- Assist Factor ----
    df["Assist_factor"] = np.select(
        [
            df["position"] == "FWD",
            df["position"] == "MID",
            df["position"] == "DEF",
        ],
        [
            3.5,   # FWD
            4,   # MID
            3.5,   # DEF
        ],
        default=0,
    )

    # ---- Clean Sheet Factor ----
    df["CS_factor"] = np.select(
        [
            df["position"] == "FWD",
            df["position"] == "MID",
            df["position"] == "DEF",
        ],
        [
            0.0,   # FWD
            0.8,   # MID
            5,   # DEF
        ],
        default=5.0,  # "else"
    )

    df["default_points"] = np.select(
        [
            df["position"] == "FWD",
            df["position"] == "MID",
            df["position"] == "DEF",
        ],
        [
            2,   # FWD
            2,   # MID
            1,   # DEF
        ],
        default=1,  # "else"
    )
    df["GW"] = pd.to_numeric(df["GW"], errors="coerce")

    # Define limits
    min_gw = df["GW"].min()
    max_gw = min_gw + 4

    # Filter DF to only include those GWs
    df_filtered = df[(df["GW"] >= min_gw) & (df["GW"] <= max_gw)]

    current_players=pd.read_csv(current_player_path)
    result = (
            current_players
              .groupby("name")[["now_cost","team_code","news","selected_by_percent","web_name","defensive_contribution_per_90"]]
              .first()                   # take the first row in each group
              .reset_index()             # turn the group key back into a column
        )

    result = result.rename(columns={
            "name": "Name2",
            "now_cost": "value",
            "selected_by_percent": "selected",
    })

    merge_cols = ['Name2', 'value','selected',"web_name"]
    result = result[merge_cols]

    merged_df = df_filtered.merge(result, how='left', left_on='name', right_on='Name2')

    merged_df.drop(columns=['Name2'], inplace=True)
    # MERGE med verdi og navn og selected
    merged_df.to_csv("Player_Adjusted_data.csv")


    



    
def Generate_ALL_datasets(current_teams,current_player_path,current_season_path):
    Generate_Player_Historical()
    Generate_Player_Rankings(current_teams)
    Generate_Team_threats()
    Generate_Lineups()
    Visual_Teams_history()
    Generate_season_data(current_player_path, current_season_path)
    Generate_Team_Adjustments()
    Player_adjustements(current_player_path)

if __name__ == "__main__":
    Generate_ALL_datasets()