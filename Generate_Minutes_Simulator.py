from GenerateConfig import Understat_Team_MAP
import os
import numpy as np

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from xgboost import XGBClassifier,XGBRegressor
import pandas as pd




from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error

def Make_Dataset():
    INPUT_FILE = "Understat_All_shots_data.csv"
    INPUT_FILE_TEAM = "Team_data_transformed2.csv"
    OUTPUT_FILE = "Understat_All_shots_data_with_current_team.csv"
    UNDERSTAT_TEAM_MAP=Understat_Team_MAP
    Momentum_window=5
    # Read the complete CSV without restricting columns.
    df = pd.read_csv(INPUT_FILE, low_memory=False)
    required_columns = {
        "team_title",
        "player_id",
        "h_team",
        "a_team",
    }

    missing_columns = required_columns.difference(df.columns)

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {sorted(missing_columns)}"
        )
    def split_team_title(value):
        """
        Convert:
            "Chelsea,Everton"
        into:
            ["Chelsea", "Everton"]

        Missing values become an empty list.
        """
        if pd.isna(value):
            return []

        return [
            team.strip()
            for team in str(value).split(",")
            if team.strip()
        ]
    df["team_title_list"] = df["team_title"].apply(split_team_title)
    home_team_rows = (
        df.loc[
            df["player_id"].notna() & df["h_team"].notna(),
            ["player_id", "h_team"],
        ]
        .rename(columns={"h_team": "team"})
    )

    away_team_rows = (
        df.loc[
            df["player_id"].notna() & df["a_team"].notna(),
            ["player_id", "a_team"],
        ]
        .rename(columns={"a_team": "team"})
    )
    player_team_rows = pd.concat(
    [home_team_rows, away_team_rows],
    ignore_index=True,
    )
    player_team_counts = (
        player_team_rows
        .groupby(["player_id", "team"])
        .size()
        .to_dict()
    )
    
    
    def determine_current_team(row):
        """
        Determine current_team using this order:

        1. If h_team is in team_title_list, return h_team.
        2. Otherwise, if a_team is in team_title_list, return a_team.
        3. Otherwise, count how often the player's h_team and a_team
           occur across all rows for that player.
        4. Return the candidate with the highest count.
        5. Return pd.NA when there is a tie or insufficient information.
        """
        player_id = row["player_id"]
        home_team = row["h_team"]
        away_team = row["a_team"]
        team_list = row["team_title_list"]

        # First use the direct team_title match.
        if pd.notna(home_team) and home_team in team_list:
            return home_team

        if pd.notna(away_team) and away_team in team_list:
            return away_team

        # A player ID is required for the count-based fallback.
        if pd.isna(player_id):
            return pd.NA

        home_count = 0
        away_count = 0

        if pd.notna(home_team):
            home_count = player_team_counts.get(
                (player_id, home_team),
                0,
            )

        if pd.notna(away_team):
            away_count = player_team_counts.get(
                (player_id, away_team),
                0,
            )

        if home_count > away_count:
            return home_team

        if away_count > home_count:
            return away_team

        # No clear result when the counts are equal.
        return pd.NA
    df["current_team"] = df.apply(
    determine_current_team,
    axis=1,
    )
    # Apply mapping to all team columns
    for col in ["h_team", "a_team", "current_team"]:
        df[col] = df[col].replace(UNDERSTAT_TEAM_MAP)


    # Binary goal indicator
    df["is_goal"] = (df["result"] == "Goal").astype(int)

    df = df[df["current_team"].notna()].copy()

    df["season"] = pd.to_numeric(df["season"], errors="coerce")

    # Sort so the highest season comes first for each id
    df = df.sort_values(["id", "season"], ascending=[True, False])

    # Keep the row with the highest season for each id
    df = df.drop_duplicates(subset="id", keep="first").reset_index(drop=True)

    # Ensure XG is numeric.
    df["XG"] = pd.to_numeric(df["xG"], errors="coerce").fillna(0)

    # Ensure is_goal exists and is numeric.
    # This also handles the possible capitalization difference: Is_goal.
    if "is_goal" not in df.columns:
        if "Is_goal" in df.columns:
            df["is_goal"] = pd.to_numeric(
                df["Is_goal"],
                errors="coerce",
            ).fillna(0).astype(int)
        else:
            df["is_goal"] = (
                df["result"].astype(str).str.strip().eq("Goal")
            ).astype(int)

    # Convert minute to numeric so sorting is chronological.
    df["minute"] = pd.to_numeric(
        df["minute"],
        errors="coerce",
    )
    # Save the original row order so it can be restored afterward.
    df["_original_order"] = range(len(df))

    # Sort every match chronologically.
    # _original_order gives stable ordering when multiple shots have the same minute.
    df = df.sort_values(
        by=["match_id", "minute", "_original_order"],
        kind="stable",
    ).copy()

    # Identify whether each shot belongs to the home or away team.
    is_home_shot = df["current_team"].eq(df["h_team"])
    is_away_shot = df["current_team"].eq(df["a_team"])

    # Assign the row's goal and XG values to the correct side.
    # Shots that match neither side receive zero for both teams.
    df["is_home_shot"] = is_home_shot.astype(int)
    df["is_away_shot"] = is_away_shot.astype(int)
    df["goal_h"] = df["is_goal"].where(is_home_shot, 0).astype(int)
    df["goal_a"] = df["is_goal"].where(is_away_shot, 0).astype(int)

    df["xg_h"] = df["XG"].where(is_home_shot, 0.0)
    df["xg_a"] = df["XG"].where(is_away_shot, 0.0)

    # Accumulated values within each match
    df["goal_acc_h"] = (
        df.groupby("match_id", sort=False)["goal_h"]
          .cumsum()
    )

    df["goal_acc_a"] = (
        df.groupby("match_id", sort=False)["goal_a"]
          .cumsum()
    )

    df["XG_acc_h"] = (
        df.groupby("match_id", sort=False)["xg_h"]
          .cumsum()
          .round(4)
    )

    df["XG_acc_a"] = (
        df.groupby("match_id", sort=False)["xg_a"]
          .cumsum()
          .round(4)
    )

    # Optional: round accumulated XG values.
    df["XG_acc_h"] = df["XG_acc_h"].round(4)
    df["XG_acc_a"] = df["XG_acc_a"].round(4)

    is_home_shot = (
        df["current_team"].notna()
        & df["h_team"].notna()
        & df["current_team"].astype(str).eq(df["h_team"].astype(str))
    )

    is_away_shot = (
        df["current_team"].notna()
        & df["a_team"].notna()
        & df["current_team"].astype(str).eq(df["a_team"].astype(str))
    )

    # One attack for the team that owns the row.
    df["_attack_h"] = is_home_shot.astype(int)
    df["_attack_a"] = is_away_shot.astype(int)

    # Rolling last-five-row momentum within each match.
    # The current row is included.
    df["momentum_attacks_h"] = (
        df.groupby("match_id", sort=False)["_attack_h"]
          .transform(lambda values: values.rolling(window=Momentum_window, min_periods=1).sum())
          .astype(int)
    )

    df["momentum_attacks_a"] = (
        df.groupby("match_id", sort=False)["_attack_a"]
          .transform(lambda values: values.rolling(window=Momentum_window, min_periods=1).sum())
          .astype(int)
    )

    df["momentum_xg_h"] = (
        df.groupby("match_id", sort=False)["xg_h"]
          .transform(lambda values: values.rolling(window=Momentum_window, min_periods=1).sum())
          .round(4)
    )

    df["momentum_xg_a"] = (
        df.groupby("match_id", sort=False)["xg_a"]
          .transform(lambda values: values.rolling(window=Momentum_window, min_periods=1).sum())
          .round(4)
    )

    # Remove temporary columns.
    df = df.drop(columns=["_attack_h", "_attack_a"])
    # Restore the original dataframe row order.
    # Remove these two lines if you want the final output sorted by match and minute.
    df = df.sort_values("_original_order").drop(
        columns="_original_order"
    )
    
        # --------------------------------------------------------------
    # Join team-level data for the away and home teams
    # --------------------------------------------------------------
    team_df = pd.read_csv(INPUT_FILE_TEAM, low_memory=False)

    required_team_columns = {
        "kickoff_time",
        "name",
        "code",
        "Offensive_Index",
        "Defensive_Index",
        "XGA",
        "XGCA",
        "XGH",
        "XGCH",
        "XG_avg",
        "XGC_avg",
    }

    missing_team_columns = required_team_columns.difference(team_df.columns)

    if missing_team_columns:
        raise ValueError(
            f"Missing columns in {INPUT_FILE_TEAM}: "
            f"{sorted(missing_team_columns)}"
        )

    if "date" not in df.columns:
        raise ValueError("The shot dataframe is missing the 'date' column.")

    # Convert both datetime columns to date-only values.
    df["_join_date"] = pd.to_datetime(
        df["date"],
        errors="coerce",
    ).dt.date

    team_df["_join_date"] = pd.to_datetime(
        team_df["kickoff_time"],
        errors="coerce",
    ).dt.date

    # Clean team names to avoid mismatches caused by spaces.
    df["a_team"] = df["a_team"].astype("string").str.strip()
    df["h_team"] = df["h_team"].astype("string").str.strip()
    team_df["name"] = team_df["name"].astype("string").str.strip()

    # Apply the same team mapping to the team data.
    team_df["name"] = team_df["name"].replace(UNDERSTAT_TEAM_MAP)

    # Check for duplicate team/date combinations.
    duplicate_team_dates = team_df.duplicated(
        subset=["_join_date", "name"],
        keep=False,
    )

    if duplicate_team_dates.any():
        duplicate_values = (
            team_df.loc[
                duplicate_team_dates,
                ["_join_date", "name"],
            ]
            .drop_duplicates()
            .head(20)
        )

        raise ValueError(
            "Team data contains multiple rows for the same date and team:\n"
            f"{duplicate_values.to_string(index=False)}"
        )

    # --------------------------------------------------------------
    # Away-team join
    # Away-specific expected-goal columns use XGA and XGCA.
    # --------------------------------------------------------------
    away_team_columns = [
        "_join_date",
        "name",
        "code",
        "Offensive_Index",
        "Defensive_Index",
        "XGA",
        "XGCA",
        "XG_avg",
        "XGC_avg",
    ]

    away_team_df = team_df[away_team_columns].rename(
        columns={
            "name": "a_team",
            "code": "a_team_code",
            "Offensive_Index": "a_team_Offensive_Index",
            "Defensive_Index": "a_team_Defensive_Index",
            "XGA": "a_team_XGA",
            "XGCA": "a_team_XGCA",
            "XG_avg": "a_team_XG_avg",
            "XGC_avg": "a_team_XGC_avg",
        }
    )



    # --------------------------------------------------------------
    # Home-team join
    # Home-specific expected-goal columns use XGH and XGCH.
    # --------------------------------------------------------------
    home_team_columns = [
        "_join_date",
        "name",
        "code",
        "Offensive_Index",
        "Defensive_Index",
        "XGH",
        "XGCH",
        "XG_avg",
        "XGC_avg",
    ]

    home_team_df = team_df[home_team_columns].rename(
        columns={
            "name": "h_team",
            "code": "h_team_code",
            "Offensive_Index": "h_team_Offensive_Index",
            "Defensive_Index": "h_team_Defensive_Index",
            "XGH": "h_team_XGH",
            "XGCH": "h_team_XGCH",
            "XG_avg": "h_team_XG_avg",
            "XGC_avg": "h_team_XGC_avg",
        }
    )
    # --------------------------------------------------------------
    # Away-team join
    # --------------------------------------------------------------
    df = df.merge(
        away_team_df,
        how="left",
        on=["_join_date", "a_team"],
        validate="many_to_one",
        indicator="_away_team_match",
    )

    # Convert the merge result into a simple match flag.
    df["_away_team_matched"] = (
        df["_away_team_match"].eq("both")
    )

    df = df.drop(columns="_away_team_match")

    # --------------------------------------------------------------
    # Home-team join
    # --------------------------------------------------------------
    df = df.merge(
        home_team_df,
        how="left",
        on=["_join_date", "h_team"],
        validate="many_to_one",
        indicator="_home_team_match",
    )

    # Convert the merge result into a simple match flag.
    df["_home_team_matched"] = (
        df["_home_team_match"].eq("both")
    )

    df = df.drop(columns="_home_team_match")

    # A row is valid only when both team joins succeeded.
    df["_both_teams_matched"] = (
        df["_away_team_matched"]
        & df["_home_team_matched"]
    )

    # --------------------------------------------------------------
    # Debug unmatched rows after August 2022
    # --------------------------------------------------------------
    debug_cutoff = pd.Timestamp("2022-08-31")

    unmatched_after_august_2022 = (
        df["_join_date"].notna()
        & (
            pd.to_datetime(df["_join_date"], errors="coerce")
            > debug_cutoff
        )
        & ~df["_both_teams_matched"]
    )

    debug_columns = [
        column
        for column in [
            "id",
            "match_id",
            "date",
            "_join_date",
            "h_team",
            "a_team",
            "_home_team_matched",
            "_away_team_matched",
        ]
        if column in df.columns
    ]

    debug_df = df.loc[
        unmatched_after_august_2022,
        debug_columns,
    ].copy()

    debug_df.to_csv(
        "debug_team_match.csv",
        index=False,
    )

    print(
        "Unmatched rows after August 2022 written to "
        f"debug_team_match.csv: {len(debug_df):,}"
    )

    # --------------------------------------------------------------
    # Remove all rows where either team did not match
    # --------------------------------------------------------------
    rows_before_filter = len(df)

    df = df.loc[df["_both_teams_matched"]].copy()

    rows_removed = rows_before_filter - len(df)

    print(
        f"Rows removed because team data did not match: "
        f"{rows_removed:,}"
    )

    # Remove temporary join and match columns.
    df = df.drop(
        columns=[
            "_join_date",
            "_away_team_matched",
            "_home_team_matched",
            "_both_teams_matched",
        ]
    )
    for col in ["a_team_code", "h_team_code"]:
        df[col] = pd.to_numeric(df[col], errors="raise").astype(int)
    df["Away_Team_Off"]=(df["a_team_Offensive_Index"]+df["a_team_XG_avg"])*0.5*0.6+0.4*df["a_team_XGA"]
    df["Away_Team_Def"]=(df["a_team_Defensive_Index"]+df["a_team_XGC_avg"])*0.5*0.6+0.4*df["a_team_XGCA"]
    df["Home_Team_Off"]=(df["h_team_Offensive_Index"]+df["h_team_XG_avg"])*0.5*0.6+0.4*df["h_team_XGH"]
    df["Home_Team_Def"]=(df["h_team_Defensive_Index"]+df["h_team_XGC_avg"])*0.5*0.6+0.4*df["h_team_XGCH"]

    # Save the completed dataset.
    df.to_csv(OUTPUT_FILE, index=False)

    print(f"Rows saved: {len(df):,}")
    print(f"Output saved to: {OUTPUT_FILE}")

    return df
 

    
def Generate_which_attack_model(df):
    OUTPUT_FILE = "Understat_All_shots_data_by_minute.csv"
    df["minute"] = pd.to_numeric(
        df["minute"],
        errors="coerce",
    )
    df = df[
        df["match_id"].notna()
        & df["minute"].notna()
    ].copy()
    if "XG" in df.columns:
        df["XG"] = pd.to_numeric(
            df["XG"],
            errors="coerce",
        )
        # Remove very-low-quality real shot events before creating
        # the minute-by-minute no-shot rows.
        df = df[
            df["XG"].ge(0.012)
        ].copy()
    df["minute"] = df["minute"].astype(int)
    df["_original_order"] = range(len(df))

    df = df.sort_values(
        ["match_id", "minute", "_original_order"],
        kind="stable",
    ).copy()
    # These values must be zero on newly generated rows.
    zero_columns = [
        "is_goal",
        "is_home_shot",
        "is_away_shot",
        "xg_h",
        "xg_a",
        "xG",
        "goal_a",
        "goal_h"
    ]
    if "XG" in df.columns:
        zero_columns.append("XG")
    # Accumulated columns should retain their previous values.
    accumulated_columns = [
        column
        for column in [
            "goal_acc_h",
            "goal_acc_a",
            "XG_acc_h",
            "XG_acc_a",
        ]
        if column in df.columns
    ]

    # Momentum columns should also retain their previous values.
    momentum_columns = [
        column
        for column in [
            "momentum_attacks_h",
            "momentum_attacks_a",
            "momentum_xg_h",
            "momentum_xg_a",
        ]
        if column in df.columns
    ]

    generated_matches = []

    for match_id, match_df in df.groupby(
        "match_id",
        sort=False,
    ):
        match_df = match_df.sort_values(
            ["minute", "_original_order"],
            kind="stable",
        ).copy()

        existing_minutes = set(match_df["minute"])

        generated_rows = []

        for minute in range(1, 96):
            # Do not add a row when at least one existing event
            # already occurs during this minute.
            if minute in existing_minutes:
                continue

            # Find the latest existing row before this minute.
            previous_rows = match_df[
                match_df["minute"] < minute
            ]

            if not previous_rows.empty:
                source_row = previous_rows.iloc[-1].copy()
                has_previous_event = True
            else:
                # Before the first event, use the first match row
                # for static match/team information.
                source_row = match_df.iloc[0].copy()
                has_previous_event = False

            source_row["minute"] = minute
            source_row["result"] = "Nothing"
            source_row["xG"] = 0
            source_row["is_goal"] = 0
            source_row["is_home_shot"] = 0
            source_row["is_away_shot"] = 0
            source_row["is_no_shot"] = 1
            source_row["xg_h"] = 0
            source_row["xg_a"] = 0

            if "XG" in source_row.index:
                source_row["XG"] = 0

            # No accumulated events exist before the first shot.
            if not has_previous_event:
                for column in accumulated_columns:
                    source_row[column] = 0

                for column in momentum_columns:
                    source_row[column] = 0

            # Generated rows are sorted after genuine rows if
            # they somehow share a minute.
            source_row["_original_order"] = float("inf")

            generated_rows.append(source_row)

        if generated_rows:
            generated_df = pd.DataFrame(generated_rows)

            match_df = pd.concat(
                [match_df, generated_df],
                ignore_index=True,
            )

        match_df = match_df.sort_values(
            ["minute", "is_no_shot", "_original_order"],
            ascending=[True, True, True],
            kind="stable",
        )

        generated_matches.append(match_df)

    result_df = pd.concat(
        generated_matches,
        ignore_index=True,
    )

    result_df = result_df.drop(
        columns="_original_order",
        errors="ignore",
    )

    # Ensure indicator columns are integers.
    integer_columns = [
        "minute",
        "is_goal",
        "is_home_shot",
        "is_away_shot",
        "is_no_shot",
        "goal_h",
        "goal_a",
        "goal_acc_h",
        "goal_acc_a",
    ]

    for column in integer_columns:
        if column in result_df.columns:
            result_df[column] = pd.to_numeric(
                result_df[column],
                errors="coerce",
            ).fillna(0).astype(int)
    

    # Drop intermediate columns
    result_df = result_df.drop(
        columns=[
            "a_team_Offensive_Index",
            "a_team_Defensive_Index",
            "a_team_XGA",
            "a_team_XGCA",
            "a_team_XG_avg",
            "a_team_XGC_avg",
            "h_team_Offensive_Index",
            "h_team_Defensive_Index",
            "h_team_XGH",
            "h_team_XGCH",
            "h_team_XG_avg",
            "h_team_XGC_avg",
        ],
        errors="ignore",
    )
    result_df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    # ==============================================================
    # Train attack-type models
    # ==============================================================

    feature_columns = [
        "Away_Team_Off",
        "Away_Team_Def",
        "Home_Team_Off",
        "Home_Team_Def",
        "minute",
        "goal_acc_a",
        "goal_acc_h",
        "XG_acc_h",
        "XG_acc_a",
        #"momentum_attacks_a",
        #"momentum_attacks_h",
        #"momentum_xg_a",
        #"momentum_xg_h",
    ]

    # These columns contain information accumulated during the match.
    # Shift them by one row within each match so the model only sees
    # information available before the row it is trying to predict.
    state_columns = [
        "goal_acc_a",
        "goal_acc_h",
        "XG_acc_h",
        "XG_acc_a",
        #"momentum_attacks_a",
        #"momentum_attacks_h",
        #"momentum_xg_a",
        #"momentum_xg_h",
    ]

    required_model_columns = set(
        feature_columns
        + [
            "match_id",
            "is_home_shot",
            "is_away_shot",
            "is_no_shot",
        ]
    )

    missing_model_columns = required_model_columns.difference(
        result_df.columns
    )

    if missing_model_columns:
        raise ValueError(
            "Missing model-training columns: "
            f"{sorted(missing_model_columns)}"
        )

    # Sort chronologically before shifting.
    result_df["_model_order"] = range(len(result_df))

    result_df = result_df.sort_values(
        ["match_id", "minute", "_model_order"],
        kind="stable",
    ).copy()

    # Convert all model features to numeric.
    for column in feature_columns:
        result_df[column] = pd.to_numeric(
            result_df[column],
            errors="coerce",
        )

    # Shift match-state features one row backwards.
    #
    # Example:
    # The features used to predict minute 20 contain accumulated
    # information from the latest row before minute 20.
    result_df[state_columns] = (
        result_df.groupby(
            "match_id",
            sort=False,
        )[state_columns]
        .shift(1)
        .fillna(0)
    )

    # Static team features and minute should not be shifted.
    static_feature_columns = [
        "Away_Team_Off",
        "Away_Team_Def",
        "Home_Team_Off",
        "Home_Team_Def",
        "minute",
    ]

    result_df[static_feature_columns] = (
        result_df[static_feature_columns]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0)
    )

    result_df[state_columns] = (
        result_df[state_columns]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0)
    )

    # --------------------------------------------------------------
    # Build one multiclass target
    # --------------------------------------------------------------
    #
    # Class 0 = no shot
    # Class 1 = away-team shot
    # Class 2 = home-team shot
    #
    class_names = {
        0: "no_shot",
        1: "away_shot",
        2: "home_shot",
    }

    indicator_columns = [
        "is_no_shot",
        "is_away_shot",
        "is_home_shot",
    ]

    for column in indicator_columns:
        result_df[column] = pd.to_numeric(
            result_df[column],
            errors="coerce",
        ).fillna(0).astype(int)

    # Validate that each row belongs to exactly one category.
    indicator_sum = result_df[indicator_columns].sum(axis=1)

    invalid_target_rows = indicator_sum.ne(1)

    if invalid_target_rows.any():
        invalid_count = int(invalid_target_rows.sum())

        invalid_preview_columns = [
            column
            for column in [
                "match_id",
                "minute",
                "is_no_shot",
                "is_away_shot",
                "is_home_shot",
            ]
            if column in result_df.columns
        ]

        invalid_preview = result_df.loc[
            invalid_target_rows,
            invalid_preview_columns,
        ].head(20)

        raise ValueError(
            f"{invalid_count:,} rows do not have exactly one target "
            "category.\n"
            f"{invalid_preview.to_string(index=False)}"
        )

    result_df["attack_target"] = np.select(
        [
            result_df["is_away_shot"].eq(1),
            result_df["is_home_shot"].eq(1),
        ],
        [
            1,
            2,
        ],
        default=0,
    ).astype(int)

    # --------------------------------------------------------------
    # Prepare model data
    # --------------------------------------------------------------
    X = result_df[feature_columns].copy()
    y = result_df["attack_target"].copy()
    groups = result_df["match_id"].copy()

    valid_rows = (
        groups.notna()
        & y.isin([0, 1, 2])
    )

    X = X.loc[valid_rows].copy()
    y = y.loc[valid_rows].copy()
    groups = groups.loc[valid_rows].copy()

    if groups.nunique() < 2:
        raise ValueError(
            "At least two unique match_id values are required "
            "for train/test splitting."
        )

    if y.nunique() < 3:
        raise ValueError(
            "The training data must contain all three classes: "
            "no shot, away shot, and home shot."
        )

    # Split by match_id, not by individual rows.
    # This prevents rows from the same match appearing in both
    # the training and testing datasets.
    group_splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.05,
        random_state=42,
    )

    train_indices, test_indices = next(
        group_splitter.split(
            X,
            y,
            groups=groups,
        )
    )

    X_train = X.iloc[train_indices].copy()
    X_test = X.iloc[test_indices].copy()

    y_train = y.iloc[train_indices].copy()
    y_test = y.iloc[test_indices].copy()

    train_groups = groups.iloc[train_indices]
    test_groups = groups.iloc[test_indices]

    # Safety check for match leakage.
    overlapping_matches = set(train_groups).intersection(
        set(test_groups)
    )

    if overlapping_matches:
        raise RuntimeError(
            "Train/test leakage detected: some match IDs appear "
            "in both datasets."
        )

    print()
    print("Training-data class distribution:")
    print(
        y_train.map(class_names)
        .value_counts()
        .to_string()
    )

    print()
    print(f"Training matches: {train_groups.nunique():,}")
    print(f"Testing matches: {test_groups.nunique():,}")
    print(f"Training rows: {len(X_train):,}")
    print(f"Testing rows: {len(X_test):,}")

    # ==============================================================
    # Model 1: Statistical multinomial logistic regression
    # ==============================================================

    statistical_model = Pipeline(
        steps=[
            (
                "preprocessor",
                ColumnTransformer(
                    transformers=[
                        (
                            "numeric",
                            Pipeline(
                                steps=[
                                    (
                                        "imputer",
                                        SimpleImputer(
                                            strategy="constant",
                                            fill_value=0,
                                        ),
                                    ),
                                    (
                                        "scaler",
                                        StandardScaler(),
                                    ),
                                ]
                            ),
                            feature_columns,
                        ),
                    ],
                    remainder="drop",
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    solver="lbfgs",
                    max_iter=1000,
                    class_weight=None,
                    random_state=42,
                ),
            ),
        ]
    )

    statistical_model.fit(
        X_train,
        y_train,
    )

    # ==============================================================
    # Model 2: XGBoost multiclass classifier
    # ==============================================================



    xgboost_model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=300,
        learning_rate=0.01,
        max_depth=4,
        eval_metric="mlogloss",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )

    xgboost_model.fit(
        X_train,
        y_train,
    )
    
    print("\nXGBoost Feature Importance")
    print("-" * 40)

    feature_importance = (
        pd.Series(
            xgboost_model.feature_importances_,
            index=feature_columns,
        )
        .sort_values(ascending=False)
    )

    print(feature_importance)

    print("\nFeature Importance (%)")
    print("-" * 40)

    print((100 * feature_importance).round(2).astype(str) + "%")

    # ==============================================================
    # Evaluate both models
    # ==============================================================

    statistical_probabilities = statistical_model.predict_proba(
        X_test
    )

    xgboost_probabilities = xgboost_model.predict_proba(
        X_test
    )

    statistical_predictions = np.argmax(
        statistical_probabilities,
        axis=1,
    )

    xgboost_predictions = np.argmax(
        xgboost_probabilities,
        axis=1,
    )

    statistical_log_loss = log_loss(
        y_test,
        statistical_probabilities,
        labels=[0, 1, 2],
    )

    xgboost_log_loss = log_loss(
        y_test,
        xgboost_probabilities,
        labels=[0, 1, 2],
    )

    statistical_accuracy = accuracy_score(
        y_test,
        statistical_predictions,
    )

    xgboost_accuracy = accuracy_score(
        y_test,
        xgboost_predictions,
    )

    print()
    print("Statistical model:")
    print(f"  Log loss: {statistical_log_loss:.6f}")
    print(f"  Accuracy: {statistical_accuracy:.4%}")

    print()
    print("XGBoost model:")
    print(f"  Log loss: {xgboost_log_loss:.6f}")
    print(f"  Accuracy: {xgboost_accuracy:.4%}")

    # Add useful metadata to the fitted models.
    statistical_model.attack_feature_columns = feature_columns
    statistical_model.attack_class_names = class_names

    xgboost_model.attack_feature_columns = feature_columns
    xgboost_model.attack_class_names = class_names

    # Restore the dataframe's original order.
    result_df = (
        result_df
        .sort_values("_model_order")
        .drop(columns="_model_order")
        .reset_index(drop=True)
    )

    # Save the shifted features and target used for modelling.
    result_df.to_csv(
        "Which_attack_training_model.csv",
        index=False,
    )
    # ==============================================================
    # Generate row-by-row predictions for one match
    # ==============================================================

    TEST_MATCH_ID = 22117
    MATCH_OUTPUT_FILE = "match_simulator_test.csv"

    # Match IDs may have been loaded as integers, floats, or strings.
    match_mask = (
        result_df["match_id"]
        .astype(str)
        .str.replace(r"\.0$", "", regex=True)
        .eq(str(TEST_MATCH_ID))
    )

    match_prediction_df = result_df.loc[match_mask].copy()

    if match_prediction_df.empty:
        raise ValueError(
            f"No rows found for match_id {TEST_MATCH_ID}."
        )

    # Sort the selected match chronologically.
    match_prediction_df["_prediction_order"] = range(
        len(match_prediction_df)
    )

    match_prediction_df = match_prediction_df.sort_values(
        ["minute", "_prediction_order"],
        kind="stable",
    ).copy()

    # Use exactly the same features as during model training.
    match_X = match_prediction_df[feature_columns].copy()

    for column in feature_columns:
        match_X[column] = pd.to_numeric(
            match_X[column],
            errors="coerce",
        )

    match_X = (
        match_X
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0)
    )

    # --------------------------------------------------------------
    # Statistical-model probabilities
    # --------------------------------------------------------------
    statistical_match_probabilities = (
        statistical_model.predict_proba(match_X)
    )

    statistical_classes = (
        statistical_model
        .named_steps["classifier"]
        .classes_
    )

    # Create a lookup because predict_proba column order follows classes_.
    statistical_probability_lookup = {
        class_id: statistical_match_probabilities[:, index]
        for index, class_id in enumerate(statistical_classes)
    }

    match_prediction_df["stat_prob_no_shot"] = (
        statistical_probability_lookup.get(
            0,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["stat_prob_away_shot"] = (
        statistical_probability_lookup.get(
            1,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["stat_prob_home_shot"] = (
        statistical_probability_lookup.get(
            2,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["stat_predicted_class"] = (
        statistical_model.predict(match_X)
    )

    match_prediction_df["stat_predicted_label"] = (
        match_prediction_df["stat_predicted_class"]
        .map(class_names)
    )

    # --------------------------------------------------------------
    # XGBoost-model probabilities
    # --------------------------------------------------------------
    xgboost_match_probabilities = (
        xgboost_model.predict_proba(match_X)
    )

    xgboost_classes = xgboost_model.classes_

    xgboost_probability_lookup = {
        class_id: xgboost_match_probabilities[:, index]
        for index, class_id in enumerate(xgboost_classes)
    }

    match_prediction_df["xgb_prob_no_shot"] = (
        xgboost_probability_lookup.get(
            0,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["xgb_prob_away_shot"] = (
        xgboost_probability_lookup.get(
            1,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["xgb_prob_home_shot"] = (
        xgboost_probability_lookup.get(
            2,
            np.zeros(len(match_prediction_df)),
        )
    )

    match_prediction_df["xgb_predicted_class"] = (
        xgboost_model.predict(match_X)
        .astype(int)
    )

    match_prediction_df["xgb_predicted_label"] = (
        match_prediction_df["xgb_predicted_class"]
        .map(class_names)
    )

    # Add the real outcome as a readable label for comparison.
    if "attack_target" in match_prediction_df.columns:
        match_prediction_df["actual_attack_label"] = (
            match_prediction_df["attack_target"]
            .map(class_names)
        )

    # Round probabilities for a cleaner output file.
    probability_columns = [
        "stat_prob_no_shot",
        "stat_prob_away_shot",
        "stat_prob_home_shot",
        "xgb_prob_no_shot",
        "xgb_prob_away_shot",
        "xgb_prob_home_shot",
    ]

    match_prediction_df[probability_columns] = (
        match_prediction_df[probability_columns]
        .round(6)
    )

    match_prediction_df = (
        match_prediction_df
        .drop(columns="_prediction_order")
        .reset_index(drop=True)
    )

    match_prediction_df.to_csv(
        MATCH_OUTPUT_FILE,
        index=False,
    )

    print()
    print(
        f"Predictions generated for match_id "
        f"{TEST_MATCH_ID}: {len(match_prediction_df):,} rows"
    )
    print(
        f"Match predictions saved to: "
        f"{MATCH_OUTPUT_FILE}"
    )

    return statistical_model, xgboost_model






def Generate_XG_models(team_df):
    """
    Train two models that predict shot xG:

    1. Statistical model: Ridge regression
    2. Machine-learning model: XGBoost regression

    Expected input columns in team_df:
        h_a
        match_id
        xG
        date
        minute
        goal_acc_h
        goal_acc_a
        XG_acc_h
        XG_acc_a
        Away_Team_Off
        Away_Team_Def
        Home_Team_Off
        Home_Team_Def

    Model input columns, in this exact order:
        minute
        own_goal_acc
        opp_goal_acc
        own_XG_acc
        opp_XG_acc
        Own_Team_Off
        Own_Team_Def
        Opp_Team_Off
        Opp_Team_Def

    Target:
        xG
    """

    DEBUG_MATCH_ID = 22117
    OUTPUT_FILE = "XG_model_debug.csv"
    TRAINING_START_DATE = pd.Timestamp("2022-11-01")

    df = team_df.copy()

    # ==============================================================
    # Validate input columns
    # ==============================================================

    required_columns = [
        "h_a",
        "match_id",
        "xG",
        "date",
        "minute",
        "goal_acc_h",
        "goal_acc_a",
        "XG_acc_h",
        "XG_acc_a",
        "Away_Team_Off",
        "Away_Team_Def",
        "Home_Team_Off",
        "Home_Team_Def",
    ]

    missing_columns = sorted(
        set(required_columns).difference(df.columns)
    )

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    # ==============================================================
    # Clean and sort source data
    # ==============================================================

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce",
    )

    numeric_columns = [
        "minute",
        "xG",
        "goal_acc_h",
        "goal_acc_a",
        "XG_acc_h",
        "XG_acc_a",
        "Away_Team_Off",
        "Away_Team_Def",
        "Home_Team_Off",
        "Home_Team_Def",
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    df["h_a"] = (
        df["h_a"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    # Only rows belonging to a home or away attacking team.
    df = df[
        df["h_a"].isin(["h", "a"])
        & df["match_id"].notna()
        & df["minute"].notna()
        & df["date"].notna()
        & df["xG"].notna()
    ].copy()

    if df.empty:
        raise ValueError(
            "No valid rows remain after cleaning the dataset."
        )

    df["_original_order"] = np.arange(len(df))

    df = df.sort_values(
        [
            "match_id",
            "minute",
            "_original_order",
        ],
        kind="stable",
    ).copy()

    # ==============================================================
    # Shift accumulated match-state features
    # ==============================================================

    # These columns may include information from the current shot.
    # Shift by one event within each match so each row only sees
    # information that existed before the shot being predicted.
    state_columns = [
        "goal_acc_h",
        "goal_acc_a",
        "XG_acc_h",
        "XG_acc_a",
    ]

    shifted_state_columns = [
        "previous_goal_acc_h",
        "previous_goal_acc_a",
        "previous_XG_acc_h",
        "previous_XG_acc_a",
    ]

    for source_column, shifted_column in zip(
        state_columns,
        shifted_state_columns,
    ):
        df[shifted_column] = (
            df.groupby(
                "match_id",
                sort=False,
            )[source_column]
            .shift(1)
            .fillna(0)
        )

    # ==============================================================
    # Convert each row to the attacking team's perspective
    # ==============================================================

    is_away = df["h_a"].eq("a")
    is_home = df["h_a"].eq("h")

    # Goals accumulated before the current shot.
    df["own_goal_acc"] = np.select(
        [is_away, is_home],
        [
            df["previous_goal_acc_a"],
            df["previous_goal_acc_h"],
        ],
        default=np.nan,
    )

    df["opp_goal_acc"] = np.select(
        [is_away, is_home],
        [
            df["previous_goal_acc_h"],
            df["previous_goal_acc_a"],
        ],
        default=np.nan,
    )

    # Accumulated xG before the current shot.
    df["own_XG_acc"] = np.select(
        [is_away, is_home],
        [
            df["previous_XG_acc_a"],
            df["previous_XG_acc_h"],
        ],
        default=np.nan,
    )

    df["opp_XG_acc"] = np.select(
        [is_away, is_home],
        [
            df["previous_XG_acc_h"],
            df["previous_XG_acc_a"],
        ],
        default=np.nan,
    )

    # Offensive strength from the attacking team's perspective.
    df["Own_Team_Off"] = np.select(
        [is_away, is_home],
        [
            df["Away_Team_Off"],
            df["Home_Team_Off"],
        ],
        default=np.nan,
    )

    df["Opp_Team_Off"] = np.select(
        [is_away, is_home],
        [
            df["Home_Team_Off"],
            df["Away_Team_Off"],
        ],
        default=np.nan,
    )

    # Defensive strength from the attacking team's perspective.
    df["Own_Team_Def"] = np.select(
        [is_away, is_home],
        [
            df["Away_Team_Def"],
            df["Home_Team_Def"],
        ],
        default=np.nan,
    )

    df["Opp_Team_Def"] = np.select(
        [is_away, is_home],
        [
            df["Home_Team_Def"],
            df["Away_Team_Def"],
        ],
        default=np.nan,
    )

    # ==============================================================
    # Model features
    # ==============================================================

    feature_columns = [
        "minute",
        "own_goal_acc",
        "opp_goal_acc",
        "own_XG_acc",
        "opp_XG_acc",
        "Own_Team_Off",
        "Own_Team_Def",
        "Opp_Team_Off",
        "Opp_Team_Def",
    ]

    target_column = "xG"

    for column in feature_columns + [target_column]:
        df[column] = (
            pd.to_numeric(
                df[column],
                errors="coerce",
            )
            .replace([np.inf, -np.inf], np.nan)
        )

    # The first shifted row of each match is already zero.
    # Fill any remaining invalid feature values with zero.
    df[feature_columns] = df[feature_columns].fillna(0)

    # xG should be nonnegative.
    df[target_column] = df[target_column].clip(lower=0)

    # ==============================================================
    # Extract debug match before filtering training data
    # ==============================================================

    normalized_match_id = (
        df["match_id"]
        .astype(str)
        .str.replace(r"\.0$", "", regex=True)
    )

    debug_mask = normalized_match_id.eq(str(DEBUG_MATCH_ID))

    debug_df = df.loc[debug_mask].copy()

    if debug_df.empty:
        raise ValueError(
            f"No rows found for debug match_id {DEBUG_MATCH_ID}."
        )

    # ==============================================================
    # Training data
    # ==============================================================

    training_df = df[
        df["date"].ge(TRAINING_START_DATE)
        & ~debug_mask
    ].copy()

    if training_df.empty:
        raise ValueError(
            "No training rows exist on or after November 1, 2022 "
            f"after excluding match_id {DEBUG_MATCH_ID}."
        )

    if training_df["match_id"].nunique() < 2:
        raise ValueError(
            "At least two training matches are required."
        )

    X = training_df[feature_columns].copy()
    y = training_df[target_column].copy()
    groups = training_df["match_id"].copy()

    # ==============================================================
    # Match-level train/test split
    # ==============================================================

    # Keep all rows from the same match in the same split.
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.05,
        random_state=42,
    )

    train_indices, test_indices = next(
        splitter.split(
            X,
            y,
            groups=groups,
        )
    )

    X_train = X.iloc[train_indices].copy()
    X_test = X.iloc[test_indices].copy()

    y_train = y.iloc[train_indices].copy()
    y_test = y.iloc[test_indices].copy()

    train_match_ids = set(
        groups.iloc[train_indices]
    )

    test_match_ids = set(
        groups.iloc[test_indices]
    )

    overlap = train_match_ids.intersection(test_match_ids)

    if overlap:
        raise RuntimeError(
            "Match leakage detected between training and test data."
        )

    print()
    print("xG model training data")
    print("-" * 50)
    print(
        f"Training date range: "
        f"{training_df['date'].min().date()} to "
        f"{training_df['date'].max().date()}"
    )
    print(
        f"Training matches: {len(train_match_ids):,}"
    )
    print(
        f"Validation matches: {len(test_match_ids):,}"
    )
    print(
        f"Training rows: {len(X_train):,}"
    )
    print(
        f"Validation rows: {len(X_test):,}"
    )

    # ==============================================================
    # Model 1: statistical Ridge regression
    # ==============================================================

    statistical_model = Pipeline(
        steps=[
            (
                "preprocessor",
                ColumnTransformer(
                    transformers=[
                        (
                            "numeric",
                            Pipeline(
                                steps=[
                                    (
                                        "imputer",
                                        SimpleImputer(
                                            strategy="constant",
                                            fill_value=0,
                                        ),
                                    ),
                                    (
                                        "scaler",
                                        StandardScaler(),
                                    ),
                                ]
                            ),
                            feature_columns,
                        )
                    ],
                    remainder="drop",
                ),
            ),
            (
                "regressor",
                Ridge(
                    alpha=1.0,
                ),
            ),
        ]
    )

    statistical_model.fit(
        X_train,
        y_train,
    )

    # ==============================================================
    # Model 2: XGBoost regression
    # ==============================================================

    xgboost_model = XGBRegressor(
        objective="reg:squarederror",
        n_estimators=300,
        learning_rate=0.01,
        max_depth=4,
        eval_metric="rmse",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )

    xgboost_model.fit(
        X_train,
        y_train,
    )

    # ==============================================================
    # Validation metrics
    # ==============================================================

    statistical_test_prediction = (
        statistical_model.predict(X_test)
    )

    xgboost_test_prediction = (
        xgboost_model.predict(X_test)
    )

    # xG cannot be negative.
    statistical_test_prediction = np.clip(
        statistical_test_prediction,
        0,
        1,
    )

    xgboost_test_prediction = np.clip(
        xgboost_test_prediction,
        0,
        1,
    )

    statistical_mae = mean_absolute_error(
        y_test,
        statistical_test_prediction,
    )

    statistical_rmse = np.sqrt(
        mean_squared_error(
            y_test,
            statistical_test_prediction,
        )
    )

    xgboost_mae = mean_absolute_error(
        y_test,
        xgboost_test_prediction,
    )

    xgboost_rmse = np.sqrt(
        mean_squared_error(
            y_test,
            xgboost_test_prediction,
        )
    )

    print()
    print("Statistical Ridge model")
    print("-" * 50)
    print(f"MAE:  {statistical_mae:.6f}")
    print(f"RMSE: {statistical_rmse:.6f}")

    print()
    print("XGBoost model")
    print("-" * 50)
    print(f"MAE:  {xgboost_mae:.6f}")
    print(f"RMSE: {xgboost_rmse:.6f}")

    # ==============================================================
    # XGBoost feature importance
    # ==============================================================

    booster = xgboost_model.get_booster()

    gain_scores = booster.get_score(
        importance_type="gain",
    )

    xgboost_feature_importance = (
        pd.Series(
            {
                feature: gain_scores.get(feature, 0.0)
                for feature in feature_columns
            },
            name="gain",
        )
        .sort_values(ascending=False)
    )

    total_gain = xgboost_feature_importance.sum()

    if total_gain > 0:
        importance_percent = (
            xgboost_feature_importance
            / total_gain
            * 100
        )
    else:
        importance_percent = (
            xgboost_feature_importance.copy()
        )

    feature_importance_df = pd.DataFrame(
        {
            "gain": xgboost_feature_importance,
            "importance_percent": importance_percent,
        }
    )

    print()
    print("XGBoost feature importance by gain")
    print("-" * 50)
    print(
        feature_importance_df
        .round(
            {
                "gain": 6,
                "importance_percent": 2,
            }
        )
        .to_string()
    )

    # ==============================================================
    # Predictions for match_id 29155
    # ==============================================================

    debug_df = debug_df.sort_values(
        [
            "minute",
            "_original_order",
        ],
        kind="stable",
    ).copy()

    debug_X = debug_df[feature_columns].copy()

    statistical_debug_prediction = (
        statistical_model.predict(debug_X)
    )

    xgboost_debug_prediction = (
        xgboost_model.predict(debug_X)
    )

    # Keep predictions in a valid xG range.
    debug_df["statistical_predicted_xG"] = np.clip(
        statistical_debug_prediction,
        0,
        1,
    )

    debug_df["xgboost_predicted_xG"] = np.clip(
        xgboost_debug_prediction,
        0,
        1,
    )

    debug_df["statistical_xG_error"] = (
        debug_df["statistical_predicted_xG"]
        - debug_df["xG"]
    )

    debug_df["xgboost_xG_error"] = (
        debug_df["xgboost_predicted_xG"]
        - debug_df["xG"]
    )

    # Put the most relevant debug columns first.
    debug_first_columns = [
        "match_id",
        "date",
        "minute",
        "h_a",
        "xG",
        "statistical_predicted_xG",
        "xgboost_predicted_xG",
        "statistical_xG_error",
        "xgboost_xG_error",
    ] + feature_columns

    remaining_debug_columns = [
        column
        for column in debug_df.columns
        if column not in debug_first_columns
        and column != "_original_order"
    ]

    debug_df = debug_df[
        debug_first_columns
        + remaining_debug_columns
    ].copy()

    prediction_columns = [
        "xG",
        "statistical_predicted_xG",
        "xgboost_predicted_xG",
        "statistical_xG_error",
        "xgboost_xG_error",
    ]

    debug_df[prediction_columns] = (
        debug_df[prediction_columns]
        .round(6)
    )

    debug_df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print()
    print(
        f"Debug predictions for match_id {DEBUG_MATCH_ID}: "
        f"{len(debug_df):,} rows"
    )
    print(f"Saved to: {OUTPUT_FILE}")

    # ==============================================================
    # Record the expected input schema on both fitted models
    # ==============================================================

    statistical_model.expected_feature_columns = (
        feature_columns.copy()
    )

    xgboost_model.expected_feature_columns = (
        feature_columns.copy()
    )

    statistical_model.target_column = target_column
    xgboost_model.target_column = target_column

    print()
    print("Columns expected by both models:")
    for position, column in enumerate(
        feature_columns,
        start=1,
    ):
        print(f"  {position}. {column}")

    return statistical_model, xgboost_model
    

import numpy as np
import pandas as pd


import numpy as np
import pandas as pd


def Generate_simulator(
    stat_model_bol,
    xgb_model_bol,
    stat_model_xg,
    xgb_model_xg,
    current_teams,
    GW_list,
    match_id=None,
    n_simulations=400,
    random_seed=42,
    parallel_workers=1,
):
    """
    Simulate fixtures minute by minute.

    Parameters
    ----------
    stat_model_bol:
        Statistical classification model predicting:
            0 = no shot
            1 = away shot
            2 = home shot

    xgb_model_bol:
        XGBoost classification model predicting:
            0 = no shot
            1 = away shot
            2 = home shot

    stat_model_xg:
        Statistical regression model predicting shot xG.

    xgb_model_xg:
        XGBoost regression model predicting shot xG.

    current_teams:
        DataFrame or CSV file path containing:
            id, code, name

    GW_list:
        List of gameweeks to simulate.

    match_id:
        Optional fixture code. When None, all fixtures in GW_list
        are simulated.

    n_simulations:
        Number of Monte Carlo simulations per fixture.

    random_seed:
        Random seed for reproducible simulations.

    parallel_workers:
        Number of fixtures to simulate in parallel. Use 1 to keep
        serial execution. Values above 1 use deterministic
        per-fixture random streams.

    Returns
    -------
    fixture_summary_df:
        One row per fixture, including average clean-sheet
        probabilities.

    simulation_details_df:
        One row per fixture simulation.

    player_prediction_df:
        Average player predictions per fixture.
    """

    # ==========================================================
    # Configuration
    # ==========================================================

    FIXTURE_FILE = "Fantasy_season_Fixtures_EXPANDED.csv"
    TEAM_DATA_FILE = "Team_data_newest3.csv"
    PLAYER_FILE = "Player_Prediction_set.csv"

    SUMMARY_OUTPUT_FILE = "SImulator\MinutesSimulator_team_predictions.csv"
    DETAILS_OUTPUT_FILE = "SImulator\MinutesSimulator_simulation_details.csv"
    PLAYER_OUTPUT_FILE = "SImulator\MinutesSimulator_player_predictions.csv"

    # ==========================================================
    # Read current teams
    # ==========================================================

    if isinstance(current_teams, str):
        current_teams = pd.read_csv(current_teams)

    elif isinstance(current_teams, pd.DataFrame):
        current_teams = current_teams.copy()

    else:
        raise TypeError(
            "current_teams must be a pandas DataFrame "
            "or a CSV file path."
        )

    # ==========================================================
    # Read input files
    # ==========================================================

    upcoming_fixtures = pd.read_csv(FIXTURE_FILE)
    upcoming_team_data = pd.read_csv(TEAM_DATA_FILE)
    player_df = pd.read_csv(PLAYER_FILE)

    # ==========================================================
    # Validate columns
    # ==========================================================

    def validate_columns(
        dataframe,
        required_columns,
        dataframe_name,
    ):
        missing_columns = sorted(
            set(required_columns).difference(
                dataframe.columns
            )
        )

        if missing_columns:
            raise ValueError(
                f"{dataframe_name} is missing columns: "
                f"{missing_columns}"
            )

    validate_columns(
        upcoming_fixtures,
        [
            "event",
            "code",
            "team_a",
            "team_h",
        ],
        "Fantasy_season_Fixtures_EXPANDED.csv",
    )

    validate_columns(
        upcoming_team_data,
        [
            "code",
            "Offensive_Index",
            "Defensive_Index",
            "XG_avg",
            "XGC_avg",
            "XGH",
            "XGCH",
            "XGA",
            "XGCA",
        ],
        "Team_data_newest3.csv",
    )

    validate_columns(
        current_teams,
        [
            "id",
            "code",
            "name",
        ],
        "current_teams",
    )

    validate_columns(
        player_df,
        [
            "name",
            "Team",
            "Goal_Index",
            "Assist_Index",
            "average_minutes",
            "Average_Overscore",
            "Rolling_adjusted_BPS_2",
            "Rolling_adjusted_BPS",
            "position",
        ],
        "Player_Prediction_set.csv",
    )

    player_event_column = None
    for candidate_column in [
        "GW",
        "event",
        "gameweek",
    ]:
        if candidate_column in player_df.columns:
            player_event_column = candidate_column
            break

    if player_event_column is None:
        raise ValueError(
            "Player_Prediction_set.csv must contain one of "
            "the following columns: GW, event, gameweek."
        )

    # ==========================================================
    # Normalize identifiers
    # ==========================================================

    def normalize_identifier(series):
        return (
            series.astype(str)
            .str.strip()
            .str.replace(
                r"\.0$",
                "",
                regex=True,
            )
        )

    upcoming_fixtures["_fixture_code"] = (
        normalize_identifier(
            upcoming_fixtures["code"]
        )
    )

    upcoming_fixtures["_team_h_id"] = (
        normalize_identifier(
            upcoming_fixtures["team_h"]
        )
    )

    upcoming_fixtures["_team_a_id"] = (
        normalize_identifier(
            upcoming_fixtures["team_a"]
        )
    )

    upcoming_team_data["_team_code"] = (
        normalize_identifier(
            upcoming_team_data["code"]
        )
    )

    current_teams["_team_id"] = (
        normalize_identifier(
            current_teams["id"]
        )
    )

    current_teams["_team_code"] = (
        normalize_identifier(
            current_teams["code"]
        )
    )

    player_df["_team_code"] = (
        normalize_identifier(
            player_df["Team"]
        )
    )

    player_df["_player_event"] = pd.to_numeric(
        player_df[player_event_column],
        errors="coerce",
    )

    name_key = normalize_identifier(
        player_df["name"]
    )
    player_df["_player_key"] = name_key

    # ==========================================================
    # Convert player data to numeric
    # ==========================================================

    numeric_player_columns = [
        "Goal_Index",
        "Assist_Index",
        "average_minutes",
        "Average_Overscore",
        "Rolling_adjusted_BPS_2",
        "Rolling_adjusted_BPS",
    ]

    for column in numeric_player_columns:
        player_df[column] = pd.to_numeric(
            player_df[column],
            errors="coerce",
        )

    player_df["Goal_Index"] = (
        player_df["Goal_Index"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
        .clip(lower=0.0)
    )

    player_df["Assist_Index"] = (
        player_df["Assist_Index"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
        .clip(lower=0.0)
    )

    player_df["average_minutes"] = (
        player_df["average_minutes"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
        .clip(
            lower=0.0,
            upper=90.0,
        )
    )

    player_df["Average_Overscore"] = (
        player_df["Average_Overscore"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(1.0)
        .clip(
            lower=0.97,
            upper=1.03,
        )
    )

    player_df["Rolling_adjusted_BPS_2"] = (
        player_df["Rolling_adjusted_BPS_2"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
    )

    player_df["Rolling_adjusted_BPS"] = (
        player_df["Rolling_adjusted_BPS"]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
    )

    player_df["position"] = (
        player_df["position"]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    # Normalize common goalkeeper position names.
    player_df["position"] = (
        player_df["position"]
        .replace(
            {
                "GK": "GKP",
                "GOALKEEPER": "GKP",
                "DEFENDER": "DEF",
                "MIDFIELDER": "MID",
                "FORWARD": "FWD",
            }
        )
    )

    # ==========================================================
    # Player weights and base BPS
    # ==========================================================

    player_df["_minutes_factor"] = (
        player_df["average_minutes"] / 90.0
    )

    # Probability weight for choosing a shooter.
    player_df["_goal_weight"] = (
        player_df["Goal_Index"]
        * player_df["_minutes_factor"]
    )

    # Probability weight for choosing an assister.
    player_df["_assist_weight"] = (
        player_df["Assist_Index"]
        * player_df["_minutes_factor"]
    )

    # Ground/base BPS used in each simulation.
    player_df["_base_bps"] = (
        player_df["Rolling_adjusted_BPS_2"] * 0.5
        + player_df["Rolling_adjusted_BPS"] * 0.5
    )

    current_team_lookup = {}
    for _, team_row in current_teams.iterrows():
        current_team_lookup[
            str(team_row["_team_id"])
        ] = {
            "id": str(team_row["_team_id"]),
            "code": str(team_row["_team_code"]),
            "name": team_row["name"],
        }

    team_stats_lookup = {}
    for _, team_row in upcoming_team_data.iterrows():
        team_stats_lookup[
            str(team_row["_team_code"])
        ] = team_row

    team_player_lookup = {
        (
            str(team_code),
            int(player_event),
        ): team_players.copy()
        for (team_code, player_event), team_players in player_df[
            player_df["_player_event"].notna()
        ].groupby(
            [
                "_team_code",
                "_player_event",
            ],
            sort=False,
        )
    }

    # ==========================================================
    # Filter fixtures
    # ==========================================================

    upcoming_fixtures["event"] = pd.to_numeric(
        upcoming_fixtures["event"],
        errors="coerce",
    )

    normalized_gameweeks = {
        int(gameweek)
        for gameweek in GW_list
    }

    upcoming_fixtures = upcoming_fixtures[
        upcoming_fixtures["event"].isin(
            normalized_gameweeks
        )
    ].copy()

    if match_id is not None:
        normalized_match_id = (
            str(match_id)
            .strip()
            .replace(".0", "")
        )

        upcoming_fixtures = upcoming_fixtures[
            upcoming_fixtures[
                "_fixture_code"
            ].eq(normalized_match_id)
        ].copy()

    if upcoming_fixtures.empty:
        raise ValueError(
            "No fixtures were found for GW_list="
            f"{GW_list} and match_id={match_id}."
        )

    # ==========================================================
    # Model features in the exact expected order
    # ==========================================================

    attack_feature_columns = [
        "Away_Team_Off",
        "Away_Team_Def",
        "Home_Team_Off",
        "Home_Team_Def",
        "minute",
        "goal_acc_a",
        "goal_acc_h",
        "XG_acc_h",
        "XG_acc_a",
    ]

    # These must match the feature names used when the xG models
    # were trained.
    xg_feature_columns = [
        "minute",
        "own_goal_acc",
        "opp_goal_acc",
        "own_XG_acc",
        "opp_XG_acc",
        "Own_Team_Off",
        "Own_Team_Def",
        "Opp_Team_Off",
        "Opp_Team_Def",
    ]

    # ==========================================================
    # BPS rules
    # ==========================================================

    BPS_RULES = {
        "GKP": {
            "goal": 12.0,
            "assist": 9.0,
            "cs": 12.0,
        },
        "DEF": {
            "goal": 12.0,
            "assist": 9.0,
            "cs": 12.0,
        },
        "MID": {
            "goal": 18.0,
            "assist": 9.0,
            "cs": 0.0,
        },
        "FWD": {
            "goal": 24.0,
            "assist": 9.0,
            "cs": 0.0,
        },
    }

    # ==========================================================
    # Helper functions
    # ==========================================================

    def safe_float(
        value,
        default=0.0,
    ):
        try:
            numeric_value = float(value)

            if np.isfinite(numeric_value):
                return numeric_value

        except (TypeError, ValueError):
            pass

        return float(default)

    def get_current_team(team_id):
        normalized_team_id = (
            str(team_id)
            .strip()
            .replace(".0", "")
        )

        team_info = current_team_lookup.get(
            normalized_team_id
        )

        if team_info is None:
            raise ValueError(
                f"Team id {team_id} was not found "
                "in current_teams."
            )

        return team_info

    def get_team_stats(team_code):
        normalized_team_code = (
            str(team_code)
            .strip()
            .replace(".0", "")
        )

        team_stats = team_stats_lookup.get(
            normalized_team_code
        )

        if team_stats is None:
            raise ValueError(
                f"No team statistics found for "
                f"team code {team_code}."
            )

        return team_stats

    def get_team_players(
        team_code,
        event,
    ):
        normalized_team_code = (
            str(team_code)
            .strip()
            .replace(".0", "")
        )

        normalized_event = int(event)

        matching_players = team_player_lookup.get(
            (
                normalized_team_code,
                normalized_event,
            )
        )

        if matching_players is None or matching_players.empty:
            raise ValueError(
                f"No players found for team code "
                f"{team_code} and event {normalized_event} "
                f"in {PLAYER_FILE}."
            )

        return matching_players.copy()

    def normalize_choice_probabilities(
        primary_weights,
        fallback_minutes,
    ):
        weights = np.asarray(
            primary_weights,
            dtype=float,
        ).copy()

        weights = np.where(
            np.isfinite(weights),
            weights,
            0.0,
        )
        weights = np.clip(
            weights,
            0.0,
            None,
        )

        if weights.sum() <= 0:
            weights = np.asarray(
                fallback_minutes,
                dtype=float,
            ).copy()
            weights = np.where(
                np.isfinite(weights),
                weights,
                0.0,
            )
            weights = np.clip(
                weights,
                0.0,
                None,
            )

        if weights.sum() <= 0:
            weights = np.ones(
                len(weights),
                dtype=float,
            )

        return weights / weights.sum()

    def build_player_pool(players):
        players = players.reset_index(
            drop=True
        ).copy()

        duplicate_keys = players[
            "_player_key"
        ].duplicated(keep=False)
        if duplicate_keys.any():
            duplicate_preview = players.loc[
                duplicate_keys,
                [
                    c
                    for c in [
                        "name",
                        "Team",
                        "GW",
                        "_player_key",
                        "Player_code",
                        "id",
                        "element",
                    ]
                    if c in players.columns
                ],
            ].head(20)
            raise ValueError(
                "Duplicate _player_key values detected in player pool:\n"
                f"{duplicate_preview.to_string(index=False)}"
            )

        player_records = []
        player_key_to_index = {}

        for index, player in enumerate(
            players.to_dict("records")
        ):
            player_key = str(
                player["_player_key"]
            )

            player_records.append(
                {
                    "player_key": player_key,
                    "name": player["name"],
                    "Team": str(
                        player["_team_code"]
                    ),
                    "position": player["position"],
                    "base_bps": safe_float(
                        player["_base_bps"]
                    ),
                    "overscore": safe_float(
                        player["Average_Overscore"],
                        default=1.0,
                    ),
                }
            )
            player_key_to_index[player_key] = index

        minutes_array = (
            players["average_minutes"]
            .fillna(0.0)
            .clip(lower=0.0)
            .to_numpy(dtype=float)
        )

        goal_probabilities = (
            normalize_choice_probabilities(
                players["_goal_weight"].to_numpy(
                    dtype=float
                ),
                minutes_array,
            )
        )

        assist_base_weights = players[
            "_assist_weight"
        ].to_numpy(dtype=float)

        assist_probability_lookup = {}
        all_indices = np.arange(
            len(players),
            dtype=int,
        )

        for player_key, excluded_index in (
            player_key_to_index.items()
        ):
            included_indices = all_indices[
                all_indices != excluded_index
            ]

            if len(included_indices) == 0:
                assist_probability_lookup[
                    player_key
                ] = None
                continue

            assist_probability_lookup[
                player_key
            ] = (
                included_indices,
                normalize_choice_probabilities(
                    assist_base_weights[
                        included_indices
                    ],
                    minutes_array[
                        included_indices
                    ],
                ),
            )

        return {
            "players": players,
            "player_records": player_records,
            "player_keys": [
                record["player_key"]
                for record in player_records
            ],
            "player_key_to_index": player_key_to_index,
            "goal_probabilities": goal_probabilities,
            "assist_probability_lookup": assist_probability_lookup,
        }

    def weighted_player_choice(
        player_pool,
        weight_kind,
        rng,
        excluded_player_key=None,
    ):
        if weight_kind == "goal":
            selected_index = int(
                rng.choice(
                    np.arange(
                        len(
                            player_pool[
                                "player_records"
                            ]
                        )
                    ),
                    p=player_pool[
                        "goal_probabilities"
                    ],
                )
            )
            return player_pool["player_records"][
                selected_index
            ]

        if excluded_player_key is None:
            raise ValueError(
                "excluded_player_key is required "
                "for assist selection."
            )

        assist_lookup = player_pool[
            "assist_probability_lookup"
        ].get(str(excluded_player_key))

        if assist_lookup is None:
            return None

        candidate_indices, probabilities = (
            assist_lookup
        )
        selected_position = int(
            rng.choice(
                np.arange(
                    len(candidate_indices)
                ),
                p=probabilities,
            )
        )

        selected_index = int(
            candidate_indices[
                selected_position
            ]
        )

        return player_pool["player_records"][
            selected_index
        ]

    def get_model_classes(model):
        """
        Get classification classes from either a Pipeline
        or a direct classifier.
        """

        if hasattr(model, "named_steps"):
            if "classifier" in model.named_steps:
                return (
                    model
                    .named_steps["classifier"]
                    .classes_
                )

        if hasattr(model, "classes_"):
            return model.classes_

        raise AttributeError(
            "Classification model does not expose classes_."
        )

    def predict_attack_probabilities(model_input):
        """
        Predict:
            0 = no shot
            1 = away shot
            2 = home shot

        The statistical and XGBoost probabilities are averaged.
        """

        statistical_raw = stat_model_bol.predict_proba(
            model_input
        )

        xgboost_raw = xgb_model_bol.predict_proba(
            model_input
        )

        n_rows = len(model_input)

        statistical_probabilities = np.zeros(
            (n_rows, 3),
            dtype=float,
        )
        xgboost_probabilities = np.zeros(
            (n_rows, 3),
            dtype=float,
        )

        for index, class_id in enumerate(
            statistical_attack_classes
        ):
            class_position = int(class_id)
            if 0 <= class_position <= 2:
                statistical_probabilities[
                    :,
                    class_position,
                ] = statistical_raw[:, index]

        for index, class_id in enumerate(
            xgboost_attack_classes
        ):
            class_position = int(class_id)
            if 0 <= class_position <= 2:
                xgboost_probabilities[
                    :,
                    class_position,
                ] = xgboost_raw[:, index]

        combined_probabilities = (
            statistical_probabilities*0.5
            + xgboost_probabilities*0.5
        )

        combined_probabilities = np.clip(
            combined_probabilities,
            0.0,
            None,
        )

        probability_sums = (
            combined_probabilities.sum(
                axis=1,
                keepdims=True,
            )
        )

        zero_sum_mask = (
            probability_sums[:, 0] <= 0
        )

        if zero_sum_mask.any():
            combined_probabilities[
                zero_sum_mask
            ] = np.array(
                [1.0, 0.0, 0.0],
                dtype=float,
            )
            probability_sums[
                zero_sum_mask
            ] = 1.0

        return (
            combined_probabilities
            / probability_sums
        )

    def predict_shot_xg(model_input):
        """
        Predict shot xG using the mean of the two xG models.
        """

        statistical_xg = np.asarray(
            stat_model_xg.predict(
                model_input
            ),
            dtype=float,
        )

        xgboost_xg = np.asarray(
            xgb_model_xg.predict(
                model_input
            ),
            dtype=float,
        )

        statistical_xg = np.where(
            np.isfinite(statistical_xg),
            statistical_xg,
            0.0,
        )
        xgboost_xg = np.where(
            np.isfinite(xgboost_xg),
            xgboost_xg,
            0.0,
        )

        combined_xg = (
            statistical_xg*0.5 + xgboost_xg*0.5
        )

        return np.clip(
            combined_xg,
            0.0,
            1.0,
        )

    def create_player_state(
        fixture_player_records,
    ):
        """
        Create player results for one simulation.
        """

        simulation_player_state = {}

        for player in fixture_player_records:
            player_key = player["player_key"]

            simulation_player_state[player_key] = {
                "player_key": player_key,
                "name": player["name"],
                "Team": player["Team"],
                "position": player["position"],
                "base_bps": player["base_bps"],
                "xg": 0.0,
                "goals": 0,
                "assists": 0,
                "clean_sheet": 0,
                "bps": 0.0,
                "bonus": 0.0,
            }

        return simulation_player_state

    statistical_attack_classes = np.asarray(
        get_model_classes(stat_model_bol)
    )
    xgboost_attack_classes = np.asarray(
        get_model_classes(xgb_model_bol)
    )

    def allocate_bonus_points(
        simulation_player_state,
    ):
        """
        Award 3, 2 and 1 bonus points based on BPS.

        Ties share the points for the positions occupied.

        Examples
        --------
        Two players tied first:
            (3 + 2) / 2 = 2.5 each

        Three players tied first:
            (3 + 2 + 1) / 3 = 2 each

        Two players tied second:
            (2 + 1) / 2 = 1.5 each
        """

        for player in simulation_player_state.values():
            player["bonus"] = 0.0

        sorted_players = sorted(
            simulation_player_state.values(),
            key=lambda player: player["bps"],
            reverse=True,
        )

        bonus_values = [
            3.0,
            2.0,
            1.0,
        ]

        player_index = 0
        ranking_position = 0

        while (
            player_index < len(sorted_players)
            and ranking_position < 3
        ):
            current_bps = sorted_players[
                player_index
            ]["bps"]

            tied_players = []

            while (
                player_index < len(sorted_players)
                and np.isclose(
                    sorted_players[
                        player_index
                    ]["bps"],
                    current_bps,
                    rtol=1e-9,
                    atol=1e-9,
                )
            ):
                tied_players.append(
                    sorted_players[player_index]
                )

                player_index += 1

            occupied_positions = len(
                tied_players
            )

            available_bonus_values = (
                bonus_values[
                    ranking_position:
                    ranking_position
                    + occupied_positions
                ]
            )

            if not available_bonus_values:
                break

            shared_bonus = (
                sum(available_bonus_values)
                / len(tied_players)
            )

            for player in tied_players:
                player["bonus"] = shared_bonus

            ranking_position += occupied_positions

        return simulation_player_state

    # ==========================================================
    # Output containers
    # ==========================================================

    fixture_summaries = []
    simulation_details = []
    all_player_predictions = []

    attack_choice_values = np.array(
        [
            0,
            1,
            2,
        ],
        dtype=int,
    )

    if parallel_workers is None:
        parallel_workers = min(
            4,
            max(
                1,
                os.cpu_count() or 1,
            ),
        )

    parallel_workers = int(parallel_workers)

    if parallel_workers < 1:
        raise ValueError(
            "parallel_workers must be at least 1."
        )

    fixture_jobs = []

    for fixture_index, fixture in enumerate(
        upcoming_fixtures.to_dict("records")
    ):
        event = int(fixture["event"])
        fixture_id = fixture["_fixture_code"]

        home_team = get_current_team(
            fixture["_team_h_id"]
        )
        away_team = get_current_team(
            fixture["_team_a_id"]
        )

        home_code = home_team["code"]
        away_code = away_team["code"]

        home_name = home_team["name"]
        away_name = away_team["name"]

        home_stats = get_team_stats(
            home_code
        )
        away_stats = get_team_stats(
            away_code
        )

        home_players = get_team_players(
            home_code,
            event,
        )
        away_players = get_team_players(
            away_code,
            event,
        )

        home_player_pool = build_player_pool(
            home_players
        )
        away_player_pool = build_player_pool(
            away_players
        )

        fixture_player_records = (
            home_player_pool[
                "player_records"
            ]
            + away_player_pool[
                "player_records"
            ]
        )

        home_off = (
            (
                safe_float(
                    home_stats["Offensive_Index"]
                )
                + safe_float(
                    home_stats["XG_avg"]
                )
            )
            * 0.5
            * 0.6
            + 0.4
            * safe_float(
                home_stats["XGH"]
            )
        )

        home_def = (
            (
                safe_float(
                    home_stats["Defensive_Index"]
                )
                + safe_float(
                    home_stats["XGC_avg"]
                )
            )
            * 0.5
            * 0.6
            + 0.4
            * safe_float(
                home_stats["XGCH"]
            )
        )

        away_off = (
            (
                safe_float(
                    away_stats["Offensive_Index"]
                )
                + safe_float(
                    away_stats["XG_avg"]
                )
            )
            * 0.5
            * 0.6
            + 0.4
            * safe_float(
                away_stats["XGA"]
            )
        )

        away_def = (
            (
                safe_float(
                    away_stats["Defensive_Index"]
                )
                + safe_float(
                    away_stats["XGC_avg"]
                )
            )
            * 0.5
            * 0.6
            + 0.4
            * safe_float(
                away_stats["XGCA"]
            )
        )

        fixture_jobs.append(
            {
                "fixture_index": fixture_index,
                "event": event,
                "fixture_id": fixture_id,
                "home_code": home_code,
                "away_code": away_code,
                "home_name": home_name,
                "away_name": away_name,
                "home_off": home_off,
                "home_def": home_def,
                "away_off": away_off,
                "away_def": away_def,
                "home_player_pool": home_player_pool,
                "away_player_pool": away_player_pool,
                "fixture_player_records": fixture_player_records,
                "home_player_keys": home_player_pool[
                    "player_keys"
                ],
                "away_player_keys": away_player_pool[
                    "player_keys"
                ],
            }
        )

    fixture_seed_sequence = np.random.SeedSequence(
        random_seed
    )
    fixture_seeds = fixture_seed_sequence.spawn(
        len(fixture_jobs)
    )
    for fixture_job, fixture_seed in zip(
        fixture_jobs,
        fixture_seeds,
    ):
        fixture_job["rng"] = np.random.default_rng(
            fixture_seed
        )
        fixture_job["home_goal_results"] = []
        fixture_job["away_goal_results"] = []
        fixture_job["home_xg_results"] = []
        fixture_job["away_xg_results"] = []
        fixture_job["home_shot_results"] = []
        fixture_job["away_shot_results"] = []
        fixture_job["home_clean_sheet_results"] = []
        fixture_job["away_clean_sheet_results"] = []
        fixture_job["fixture_simulation_details"] = []
        fixture_job["player_totals"] = {}

        for player in fixture_job[
            "fixture_player_records"
        ]:
            player_key = player["player_key"]
            fixture_job["player_totals"][
                player_key
            ] = {
                "name": player["name"],
                "Team": player["Team"],
                "fix_id": fixture_job[
                    "fixture_id"
                ],
                "event": fixture_job["event"],
                "xg": 0.0,
                "goals": 0.0,
                "assists": 0.0,
                "clean_sheets": 0.0,
                "bonus": 0.0,
                "bps": 0.0,
            }

    for simulation_number in range(
        1,
        n_simulations + 1,
    ):
        simulation_states = []

        for fixture_job in fixture_jobs:
            simulation_states.append(
                {
                    "goal_acc_h": 0,
                    "goal_acc_a": 0,
                    "XG_acc_h": 0.0,
                    "XG_acc_a": 0.0,
                    "home_shots": 0,
                    "away_shots": 0,
                    "simulation_player_state": (
                        create_player_state(
                            fixture_job[
                                "fixture_player_records"
                            ]
                        )
                    ),
                }
            )

        for minute in range(1, 90):
            attack_rows = []

            for fixture_job, simulation_state in zip(
                fixture_jobs,
                simulation_states,
            ):
                attack_rows.append(
                    [
                        fixture_job["away_off"],
                        fixture_job["away_def"],
                        fixture_job["home_off"],
                        fixture_job["home_def"],
                        minute,
                        simulation_state[
                            "goal_acc_a"
                        ],
                        simulation_state[
                            "goal_acc_h"
                        ],
                        simulation_state[
                            "XG_acc_h"
                        ],
                        simulation_state[
                            "XG_acc_a"
                        ],
                    ]
                )

            attack_model_input = pd.DataFrame(
                attack_rows,
                columns=attack_feature_columns,
            )
            attack_probability_matrix = (
                predict_attack_probabilities(
                    attack_model_input
                )
            )

            xg_rows = []
            shot_events = []

            for fixture_position, (
                fixture_job,
                simulation_state,
                attack_probabilities,
            ) in enumerate(
                zip(
                    fixture_jobs,
                    simulation_states,
                    attack_probability_matrix,
                )
            ):
                rng = fixture_job["rng"]
                selected_attack_class = int(
                    rng.choice(
                        attack_choice_values,
                        p=attack_probabilities,
                    )
                )

                if selected_attack_class == 0:
                    continue

                if selected_attack_class == 1:
                    shooting_team = "away"
                    shooting_player_pool = (
                        fixture_job[
                            "away_player_pool"
                        ]
                    )
                    own_goal_acc = simulation_state[
                        "goal_acc_a"
                    ]
                    opponent_goal_acc = (
                        simulation_state[
                            "goal_acc_h"
                        ]
                    )
                    own_xg_acc = simulation_state[
                        "XG_acc_a"
                    ]
                    opponent_xg_acc = (
                        simulation_state[
                            "XG_acc_h"
                        ]
                    )
                    own_team_off = fixture_job[
                        "away_off"
                    ]
                    own_team_def = fixture_job[
                        "away_def"
                    ]
                    opponent_team_off = (
                        fixture_job["home_off"]
                    )
                    opponent_team_def = (
                        fixture_job["home_def"]
                    )
                else:
                    shooting_team = "home"
                    shooting_player_pool = (
                        fixture_job[
                            "home_player_pool"
                        ]
                    )
                    own_goal_acc = simulation_state[
                        "goal_acc_h"
                    ]
                    opponent_goal_acc = (
                        simulation_state[
                            "goal_acc_a"
                        ]
                    )
                    own_xg_acc = simulation_state[
                        "XG_acc_h"
                    ]
                    opponent_xg_acc = (
                        simulation_state[
                            "XG_acc_a"
                        ]
                    )
                    own_team_off = fixture_job[
                        "home_off"
                    ]
                    own_team_def = fixture_job[
                        "home_def"
                    ]
                    opponent_team_off = (
                        fixture_job["away_off"]
                    )
                    opponent_team_def = (
                        fixture_job["away_def"]
                    )

                shooter = weighted_player_choice(
                    player_pool=shooting_player_pool,
                    weight_kind="goal",
                    rng=rng,
                )

                if shooter is None:
                    continue

                xg_rows.append(
                    [
                        minute,
                        own_goal_acc,
                        opponent_goal_acc,
                        own_xg_acc,
                        opponent_xg_acc,
                        own_team_off,
                        own_team_def,
                        opponent_team_off,
                        opponent_team_def,
                    ]
                )
                shot_events.append(
                    {
                        "fixture_position": (
                            fixture_position
                        ),
                        "shooting_team": (
                            shooting_team
                        ),
                        "shooting_player_pool": (
                            shooting_player_pool
                        ),
                        "shooter_key": shooter[
                            "player_key"
                        ],
                        "player_overscore": (
                            shooter["overscore"]
                        ),
                    }
                )

            if xg_rows:
                xg_model_input = pd.DataFrame(
                    xg_rows,
                    columns=xg_feature_columns,
                )
                team_shot_xgs = predict_shot_xg(
                    xg_model_input
                )

                for shot_event, team_shot_xg in zip(
                    shot_events,
                    team_shot_xgs,
                ):
                    fixture_position = shot_event[
                        "fixture_position"
                    ]
                    fixture_job = fixture_jobs[
                        fixture_position
                    ]
                    simulation_state = (
                        simulation_states[
                            fixture_position
                        ]
                    )
                    simulation_player_state = (
                        simulation_state[
                            "simulation_player_state"
                        ]
                    )
                    shooter_key = shot_event[
                        "shooter_key"
                    ]

                    player_shot_xg = float(
                        np.clip(
                            float(team_shot_xg)
                            * shot_event[
                                "player_overscore"
                            ],
                            0.0,
                            1.0,
                        )
                    )

                    simulation_player_state[
                        shooter_key
                    ]["xg"] += player_shot_xg

                    if (
                        shot_event["shooting_team"]
                        == "home"
                    ):
                        simulation_state[
                            "home_shots"
                        ] += 1
                        simulation_state[
                            "XG_acc_h"
                        ] += player_shot_xg
                    else:
                        simulation_state[
                            "away_shots"
                        ] += 1
                        simulation_state[
                            "XG_acc_a"
                        ] += player_shot_xg

                    rng = fixture_job["rng"]
                    is_goal = int(
                        rng.random()
                        < player_shot_xg
                    )

                    if is_goal == 0:
                        continue

                    simulation_player_state[
                        shooter_key
                    ]["goals"] += 1

                    if (
                        shot_event["shooting_team"]
                        == "home"
                    ):
                        simulation_state[
                            "goal_acc_h"
                        ] += 1
                    else:
                        simulation_state[
                            "goal_acc_a"
                        ] += 1

                    if rng.random() < 0.80:
                        assister = weighted_player_choice(
                            player_pool=shot_event[
                                "shooting_player_pool"
                            ],
                            weight_kind="assist",
                            rng=rng,
                            excluded_player_key=shooter_key,
                        )

                        if assister is not None:
                            assister_key = (
                                assister[
                                    "player_key"
                                ]
                            )
                            simulation_player_state[
                                assister_key
                            ]["assists"] += 1

        for fixture_job, simulation_state in zip(
            fixture_jobs,
            simulation_states,
        ):
            goal_acc_h = simulation_state[
                "goal_acc_h"
            ]
            goal_acc_a = simulation_state[
                "goal_acc_a"
            ]
            XG_acc_h = simulation_state["XG_acc_h"]
            XG_acc_a = simulation_state["XG_acc_a"]
            home_shots = simulation_state[
                "home_shots"
            ]
            away_shots = simulation_state[
                "away_shots"
            ]
            simulation_player_state = (
                simulation_state[
                    "simulation_player_state"
                ]
            )

            home_clean_sheet = int(
                goal_acc_a == 0
            )
            away_clean_sheet = int(
                goal_acc_h == 0
            )

            fixture_job[
                "home_clean_sheet_results"
            ].append(home_clean_sheet)
            fixture_job[
                "away_clean_sheet_results"
            ].append(away_clean_sheet)

            if home_clean_sheet == 1:
                for player_key in fixture_job[
                    "home_player_keys"
                ]:
                    simulation_player_state[
                        player_key
                    ]["clean_sheet"] = 1

            if away_clean_sheet == 1:
                for player_key in fixture_job[
                    "away_player_keys"
                ]:
                    simulation_player_state[
                        player_key
                    ]["clean_sheet"] = 1

            for player in (
                simulation_player_state.values()
            ):
                position = player["position"]
                position_rules = BPS_RULES.get(
                    position,
                    {
                        "goal": 0.0,
                        "assist": 9.0,
                        "cs": 0.0,
                    },
                )

                player["bps"] = (
                    player["base_bps"]
                    + player["goals"]
                    * position_rules["goal"]
                    + player["assists"]
                    * position_rules["assist"]
                    + player["clean_sheet"]
                    * position_rules["cs"]
                )

            simulation_player_state = (
                allocate_bonus_points(
                    simulation_player_state
                )
            )

            for (
                player_key,
                player_result,
            ) in simulation_player_state.items():
                fixture_job["player_totals"][
                    player_key
                ]["xg"] += player_result["xg"]
                fixture_job["player_totals"][
                    player_key
                ]["goals"] += player_result[
                    "goals"
                ]
                fixture_job["player_totals"][
                    player_key
                ]["assists"] += player_result[
                    "assists"
                ]
                fixture_job["player_totals"][
                    player_key
                ][
                    "clean_sheets"
                ] += player_result[
                    "clean_sheet"
                ]
                fixture_job["player_totals"][
                    player_key
                ]["bonus"] += player_result[
                    "bonus"
                ]
                fixture_job["player_totals"][
                    player_key
                ]["bps"] += player_result["bps"]

            fixture_job["home_goal_results"].append(
                goal_acc_h
            )
            fixture_job["away_goal_results"].append(
                goal_acc_a
            )
            fixture_job["home_xg_results"].append(
                XG_acc_h
            )
            fixture_job["away_xg_results"].append(
                XG_acc_a
            )
            fixture_job["home_shot_results"].append(
                home_shots
            )
            fixture_job["away_shot_results"].append(
                away_shots
            )
            fixture_job[
                "fixture_simulation_details"
            ].append(
                {
                    "fix_id": fixture_job[
                        "fixture_id"
                    ],
                    "event": fixture_job["event"],
                    "simulation_number": (
                        simulation_number
                    ),
                    "home_team_code": fixture_job[
                        "home_code"
                    ],
                    "home_team_name": fixture_job[
                        "home_name"
                    ],
                    "away_team_code": fixture_job[
                        "away_code"
                    ],
                    "away_team_name": fixture_job[
                        "away_name"
                    ],
                    "home_goals": goal_acc_h,
                    "away_goals": goal_acc_a,
                    "home_xg": XG_acc_h,
                    "away_xg": XG_acc_a,
                    "home_shots": home_shots,
                    "away_shots": away_shots,
                    "home_clean_sheet": (
                        home_clean_sheet
                    ),
                    "away_clean_sheet": (
                        away_clean_sheet
                    ),
                }
            )

    for fixture_job in fixture_jobs:
        home_goals_array = np.asarray(
            fixture_job["home_goal_results"],
            dtype=float,
        )
        away_goals_array = np.asarray(
            fixture_job["away_goal_results"],
            dtype=float,
        )

        home_clean_sheet_probability = float(
            np.mean(
                fixture_job[
                    "home_clean_sheet_results"
                ]
            )
        )
        away_clean_sheet_probability = float(
            np.mean(
                fixture_job[
                    "away_clean_sheet_results"
                ]
            )
        )

        for player_result in fixture_job[
            "player_totals"
        ].values():
            all_player_predictions.append(
                {
                    "name": player_result["name"],
                    "Team": player_result["Team"],
                    "fix_id": player_result["fix_id"],
                    "avg_xg": (
                        player_result["xg"]
                        / n_simulations
                    ),
                    "avg_goal": (
                        player_result["goals"]
                        / n_simulations
                    ),
                    "avg_assist": (
                        player_result["assists"]
                        / n_simulations
                    ),
                    "avg_clean_sheet": (
                        player_result[
                            "clean_sheets"
                        ]
                        / n_simulations
                    ),
                    "avg_bonus_points": (
                        player_result["bonus"]
                        / n_simulations
                    ),
                    "avg_bps": (
                        player_result["bps"]
                        / n_simulations
                    ),
                    "event": player_result["event"],
                }
            )

        fixture_summaries.append(
            {
                "fix_id": fixture_job["fixture_id"],
                "event": fixture_job["event"],
                "home_team_code": fixture_job[
                    "home_code"
                ],
                "home_team_name": fixture_job[
                    "home_name"
                ],
                "away_team_code": fixture_job[
                    "away_code"
                ],
                "away_team_name": fixture_job[
                    "away_name"
                ],
                "n_simulations": n_simulations,
                "home_team_off": fixture_job[
                    "home_off"
                ],
                "home_team_def": fixture_job[
                    "home_def"
                ],
                "away_team_off": fixture_job[
                    "away_off"
                ],
                "away_team_def": fixture_job[
                    "away_def"
                ],
                "average_home_goals": float(
                    np.mean(
                        fixture_job[
                            "home_goal_results"
                        ]
                    )
                ),
                "average_away_goals": float(
                    np.mean(
                        fixture_job[
                            "away_goal_results"
                        ]
                    )
                ),
                "average_home_xg": float(
                    np.mean(
                        fixture_job[
                            "home_xg_results"
                        ]
                    )
                ),
                "average_away_xg": float(
                    np.mean(
                        fixture_job[
                            "away_xg_results"
                        ]
                    )
                ),
                "average_home_shots": float(
                    np.mean(
                        fixture_job[
                            "home_shot_results"
                        ]
                    )
                ),
                "average_away_shots": float(
                    np.mean(
                        fixture_job[
                            "away_shot_results"
                        ]
                    )
                ),
                "home_clean_sheet_probability": (
                    home_clean_sheet_probability
                ),
                "away_clean_sheet_probability": (
                    away_clean_sheet_probability
                ),
                "home_clean_sheet_percent": (
                    home_clean_sheet_probability
                    * 100.0
                ),
                "away_clean_sheet_percent": (
                    away_clean_sheet_probability
                    * 100.0
                ),
                "home_win_probability": float(
                    np.mean(
                        home_goals_array
                        > away_goals_array
                    )
                ),
                "draw_probability": float(
                    np.mean(
                        home_goals_array
                        == away_goals_array
                    )
                ),
                "away_win_probability": float(
                    np.mean(
                        away_goals_array
                        > home_goals_array
                    )
                ),
            }
        )

        simulation_details.extend(
            fixture_job[
                "fixture_simulation_details"
            ]
        )

        print()
        print(
            f"Simulated {fixture_job['home_name']} vs "
            f"{fixture_job['away_name']}"
        )
        print(
            f"Average goals: "
            f"{np.mean(fixture_job['home_goal_results']):.2f} - "
            f"{np.mean(fixture_job['away_goal_results']):.2f}"
        )
        print(
            f"Average xG: "
            f"{np.mean(fixture_job['home_xg_results']):.2f} - "
            f"{np.mean(fixture_job['away_xg_results']):.2f}"
        )
        print(
            f"Clean-sheet probability: "
            f"{fixture_job['home_name']} "
            f"{home_clean_sheet_probability:.1%}, "
            f"{fixture_job['away_name']} "
            f"{away_clean_sheet_probability:.1%}"
        )

    # ==========================================================
    # Create output DataFrames
    # ==========================================================

    fixture_summary_df = pd.DataFrame(
        fixture_summaries
    )

    simulation_details_df = pd.DataFrame(
        simulation_details
    )

    player_prediction_df = pd.DataFrame(
        all_player_predictions
    )

    # ==========================================================
    # Arrange player columns
    # ==========================================================

    player_output_columns = [
        "name",
        "Team",
        "fix_id",
        "avg_xg",
        "avg_goal",
        "avg_assist",
        "avg_clean_sheet",
        "avg_bonus_points",
        "avg_bps",
        "event",
    ]

    player_prediction_df = (
        player_prediction_df[
            player_output_columns
        ]
        .sort_values(
            [
                "fix_id",
                "Team",
                "avg_bps",
            ],
            ascending=[
                True,
                True,
                False,
            ],
        )
        .reset_index(drop=True)
    )

    # ==========================================================
    # Round outputs
    # ==========================================================

    player_numeric_columns = [
        "avg_xg",
        "avg_goal",
        "avg_assist",
        "avg_clean_sheet",
        "avg_bonus_points",
        "avg_bps",
    ]

    player_prediction_df[
        player_numeric_columns
    ] = (
        player_prediction_df[
            player_numeric_columns
        ]
        .round(6)
    )

    fixture_numeric_columns = [
        "home_team_off",
        "home_team_def",
        "away_team_off",
        "away_team_def",
        "average_home_goals",
        "average_away_goals",
        "average_home_xg",
        "average_away_xg",
        "average_home_shots",
        "average_away_shots",
        "home_clean_sheet_probability",
        "away_clean_sheet_probability",
        "home_clean_sheet_percent",
        "away_clean_sheet_percent",
        "home_win_probability",
        "draw_probability",
        "away_win_probability",
    ]

    existing_fixture_numeric_columns = [
        column
        for column in fixture_numeric_columns
        if column in fixture_summary_df.columns
    ]

    fixture_summary_df[
        existing_fixture_numeric_columns
    ] = (
        fixture_summary_df[
            existing_fixture_numeric_columns
        ]
        .round(6)
    )

    simulation_numeric_columns = [
        "home_xg",
        "away_xg",
    ]

    simulation_details_df[
        simulation_numeric_columns
    ] = (
        simulation_details_df[
            simulation_numeric_columns
        ]
        .round(6)
    )

    # ==========================================================
    # Save output files
    # ==========================================================

    fixture_summary_df.to_csv(
        SUMMARY_OUTPUT_FILE,
        index=False,
    )

    simulation_details_df.to_csv(
        DETAILS_OUTPUT_FILE,
        index=False,
    )

    player_prediction_df.to_csv(
        PLAYER_OUTPUT_FILE,
        index=False,
    )

    print()
    print(
        f"Fixture summary saved to: "
        f"{SUMMARY_OUTPUT_FILE}"
    )

    print(
        f"Simulation details saved to: "
        f"{DETAILS_OUTPUT_FILE}"
    )

    print(
        f"Player predictions saved to: "
        f"{PLAYER_OUTPUT_FILE}"
    )

    return (
        fixture_summary_df,
        simulation_details_df,
        player_prediction_df,
    )

def Generate_Minutes_Simulator(current_teams,GW_list):
    team_df=Make_Dataset()
    statistical_model_which_attack, xgboost_model_which_attack=Generate_which_attack_model(team_df)
    statistical_model, xgboost_model= Generate_XG_models(team_df)
    parallel_workers = min(
        4,
        max(1, os.cpu_count() or 1),
    )
    Generate_simulator(
        statistical_model_which_attack,
        xgboost_model_which_attack,
        statistical_model,
        xgboost_model,
        current_teams,
        GW_list,
        parallel_workers=parallel_workers,
    )
    
if __name__ == '__main__':
    Generate_Minutes_Simulator("Raw_Data_26\\current_teams.csv",[1,2,3,4])
