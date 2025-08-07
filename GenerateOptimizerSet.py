import pandas as pd
import numpy as np
def process_news(text):
    if pd.isna(text) or text.strip() == "":  # Blank check
        return 1
    elif "%" in text:
        # Extract number before %
        import re
        match = re.search(r"(\d+)%", text)
        if match:
            return int(match.group(1))/100  # Return the number before %
    return 0  # Default to 0 if no %
    
def GenerateOptimizeSet(Current_data_path):
    data_df=pd.read_csv(Current_data_path).iloc[:,1:]
    result = (
        data_df
          .groupby("name")[["now_cost","team_code","news","selected_by_percent","web_name"]]
          .first()                   # take the first row in each group
          .reset_index()             # turn the group key back into a column
    )    
    result = result.rename(columns={
        "name": "Name2",
        "now_cost": "value",
        "selected_by_percent": "selected"
    })
    prediction_data=pd.read_csv("Model_Predictions.csv").iloc[:,1:]
    
    merge_cols = ['Name2', 'value', 'team_code', 'news', 'selected',"web_name"]
    result = result[merge_cols]

    merged_df = prediction_data.merge(result, how='left', left_on='name', right_on='Name2')

    merged_df.drop(columns=['Name2'], inplace=True)
    
    visual_df=merged_df.copy()
    visual_df['offset'] = visual_df['news'].apply(process_news)
    visual_df["selected"] = visual_df["selected"]/100
    visual_df["value"] = visual_df["value"]/10
    visual_df["minutes_multiplier"] = np.minimum(1, visual_df['average_minutes'] / 85)
    visual_df["selected"] = visual_df["selected"].clip(lower=0.01)
    visual_df["minutes_multiplier"] = visual_df["minutes_multiplier"].clip(lower=0.01)
    visual_df["news"] = visual_df["news"].fillna("No news")
    visual_df["web_name"] = visual_df["web_name"].fillna("Ukjent")

    
    cols_to_offset=["Goal_pred","Assist_pred","Points_prediction"]
    for col in cols_to_offset:
        visual_df[col] = np.where(visual_df["offset"] < 1, visual_df[col] * visual_df["offset"], visual_df[col] * visual_df["minutes_multiplier"])
    

    
    
    player_points = (
    visual_df.groupby(['name', 'value','position'])['Points_prediction']
    .sum()
    .reset_index()
    )
    names=[]
    positions=merged_df["position"].unique()
    for r in range(len(positions)):
        position=[positions[r]]
        top_players_by_pos = (
            player_points[player_points['position'].isin(position)]
            .sort_values(['value', 'Points_prediction'], ascending=[True, False])
            .groupby('value')
            .head(40)
            .reset_index(drop=True)
        )
        names.extend(top_players_by_pos["name"].tolist())
        
    # Define float values from 4.1 to 6.0 (step 0.1)
    value_range = np.arange(38, 60, 1).round(1)
    
    for u in range(len(value_range)):
        value=[value_range[u]]

        top_players_by_value = (
            player_points[player_points['value'].isin(value)]
            .sort_values(['value', 'Points_prediction'], ascending=[True, False])
            .groupby('value')
            .head(2)
            .reset_index(drop=True)
        )
        names.extend(top_players_by_value["name"].tolist())
    # View result



    optimized_player_set=merged_df[merged_df["name"].isin(names)]
    
    visual_df=visual_df[visual_df["name"].isin(names)]
    visual_df.to_csv("Model_Predictions_visual.csv")

    

    optimized_player_set['offset'] = optimized_player_set['news'].apply(process_news)
    optimized_player_set["selected"] = optimized_player_set["selected"]/100
    optimized_player_set["value"] = optimized_player_set["value"]/10
    optimized_player_set["minutes_multiplier"] = np.minimum(1, optimized_player_set['average_minutes'] / 80)
    optimized_player_set["0"] = 0
    
    optimized_player_set["Points_prediction"] = np.where(
    optimized_player_set["position"] == "GKP",
    optimized_player_set["Points_prediction"] * 0.8,
    optimized_player_set["Points_prediction"]
)
    

    constant_cols = ["name", "position","value", 'team_code','selected','web_name','offset', 'minutes_multiplier','0']
    

    pivoted_df = optimized_player_set.pivot_table(
    index=constant_cols,             # Each player is one row
    columns="GW",             # One column per Game Week (GW)
    values="Points_prediction",    # Values to pivot
    aggfunc="first"           # In case of duplicates, take the first
    ).reset_index()

    pivoted_df.to_csv("Model_Optimizer.csv")
        
    


if __name__ == "__main__":
    GenerateOptimizeSet("Raw_Data_25\Fantasy_season_2025_data.csv")
