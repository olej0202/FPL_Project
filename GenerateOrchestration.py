from GenerateOptimizers import generate_optimizers #Lager optimert wildcard og freehit lag
from FullLoad import main_Extract,current_players,current_teams #Henter data fra fantasy-APIet
from GenerateDataset5 import main_Transform #Hovedtransform av all historisk data, lag og spillere
from GeneratePlayerData import GeneratePlayerData,team_data #Lager dataset for prediksjonene
from FullLoad_Understat import main_Extract_Understat #Henter data fra understat
from Generate_Team_Predictions import GenerateTeamPredictions #Prediksjoner for kamper
from Generate_Team_Predictions2 import GenerateTeamPredictions2 as GenerateTeamPredictions3Model
from Generate_Player_Predictions import Make_Predictions,Generate_point_predictions #Lager prediksjoner og setter det sammen til et datatset
from GenerateOptimizerSet import GenerateOptimizeSet #Lager dataset klart til å optimeres på
from GenerateVisualDataset import Generate_ALL_datasets
from GenerateDataset_Understat import Generate_Understat_dataset
from chatgpt import main_GPT_News
from Generate_Optimize_wildcardshocks import wildcard_optimize_team_shocks
from GenerateXmins import GetXmins
from GenerateConfig import Manual_min
from GenerateDataset_Understat_Shots import Generate_Shots_data
from GenerateSimulater import run_simulator as RunCoreSimulator
from GenerateMatchSimulations import run_detailed_simulator as RunDetailedMatchSimulator
from Generate_Full_Simulator import (
    SimulationControlConfig as FullSimulatorControlConfig,
    run_simulator_control as run_simulator_control,
)



import pandas as pd
import torch
import torch.nn as nn
from datetime import datetime
from pathlib import Path

from torch.utils.data import TensorDataset, DataLoader
class DeepNN(nn.Module):
        def __init__(self, input_dim):
            super(DeepNN, self).__init__()
            self.model = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 1)  # Output layer for regression
        )

        def forward(self, x):
            return self.model(x)


def Data_Extraction(season,is_new_season,has_been_error):
    #main_Extract(season, is_new_season, has_been_error)
    current_players(season)
    current_teams(season)
    #main_Extract_Understat(season)


def Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list,run_player_pos,Understat_path,Understat_shots_path):
    #main_Transform()
    Generate_Understat_dataset(current_player_path,run_player_pos)
    Generate_Shots_data(Understat_path,Understat_shots_path,current_player_path,current_team_path)
    team_data(current_team_path)
    GetXmins(current_player_path, time_list, scenarios=Manual_min)
    GeneratePlayerData(time_list, current_fixture_path,current_player_path,current_team_path)

    
def Data_Predictions(current_fixture_path,current_player_path,current_team_path, n_points_in_future,time_list):
    # Run both simulation engines first
    sim_output_dir = Path("SImulator")
    sim_output_dir.mkdir(parents=True, exist_ok=True)

    fixture_path = Path(current_fixture_path)
    team_path = Path(current_team_path)
    player_path = Path(current_player_path)
    team_history_path = Path("Team_data_transformed2.csv")
    player_prediction_path = Path("Player_Prediction_set.csv")
    player_history_path = Path("ML_training2.csv")

    # Trigger full simulator parameter optimization with all read paths passed in.
    full_sim_control = FullSimulatorControlConfig(
        team_history_path=team_history_path,
        fixtures_path="Fantasy_season_Fixtures_EXPANDED.csv",
        current_teams_path=team_path,
        player_prediction_path=player_prediction_path,
        player_history_path=player_history_path,
        optimization_output_path=sim_output_dir / "simtest_parameter_search.csv",
        optimization_best_output_path=sim_output_dir / "simtest_parameter_best.csv",
        write_outputs=True,
    )
    print("Running full simulator parameter optimization...")
    run_simulator_control(control_cfg=full_sim_control)

    print("Running core match/player simulator...")
    RunCoreSimulator(
        fixture_path=fixture_path,
        current_teams_path=team_path,
        current_players_path=player_path,
        team_history_path=team_history_path,
        player_prediction_path=player_prediction_path,
        player_history_path=player_history_path,
        output_match_path=sim_output_dir / "match_outcomes_score_predictions.csv",
        output_player_path=sim_output_dir / "player_outcomes_per_gw.csv",
        simulations=5000,
        seed=42,
        horizon_gws=n_points_in_future,
    )

    print("Running detailed attack-turn simulator...")
    RunDetailedMatchSimulator(
        fixture_path=fixture_path,
        current_teams_path=team_path,
        current_players_path=player_path,
        team_history_path=team_history_path,
        player_prediction_path=player_prediction_path,
        player_history_path=player_history_path,
        output_match_path=sim_output_dir / "match_outcomes_score_predictions_detailed.csv",
        output_player_path=sim_output_dir / "player_outcomes_per_gw_detailed.csv",
        sample_match_path=sim_output_dir / "sample_detailed_match.txt",
        simulations=3000,
        seed=42,
        horizon_gws=n_points_in_future,
    )

    # Trigger model 3 outputs (Team_prediction3 / visual3 / results3) for blend in total team predictions.
    GenerateTeamPredictions3Model(
        fixture_path=current_fixture_path,
        current_team_path=current_team_path,
        horizon=n_points_in_future,
        output_tag="3",
    )
    GenerateTeamPredictions( current_fixture_path,current_team_path, n_points_in_future)
    Make_Predictions()
    Generate_point_predictions(time_list)
    
   
def Data_Generation(ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path,current_season_path ):
    GenerateOptimizeSet(current_player_path)
    generate_optimizers(ownership=ownership,budget=budget,GW_list_wildcard=GW_list_wildcard,GW_list_freehit=GW_list_freehit  )
    Generate_ALL_datasets(current_team_path,current_player_path,current_season_path)
    main_GPT_News()
    
def Specials(ownership,budget,GW_list_wildcard,current_player_path ):
    wildcard_optimize_team_shocks(ownership,budget,GW_list_wildcard,current_player_path=current_player_path,robust_trials=15,lock_from_freq=True,lock_counts={"FWD":2, "MID":3, "DEF":3},lock_scope="t0",lock_as_starters=False)


def Get_times(current_fixture_path,n_points_in_future):
    df=pd.read_csv(current_fixture_path)
    df['kickoff_time'] = pd.to_datetime(df['kickoff_time'])

    min_kicks = (
        df
        .groupby('event', as_index=False)['kickoff_time']
        .min()
    )
    min_kicks['kickoff_time'] = min_kicks['kickoff_time'].dt.tz_convert('Europe/Oslo')

    now = pd.Timestamp.now(tz='Europe/Oslo')
    future = min_kicks[min_kicks['kickoff_time'] > now]
    n = n_points_in_future
    next_n = future.sort_values('kickoff_time').head(n)
    return next_n["event"].astype(int).values
    #w
def Main_Orchestration():
    season=25
    is_new_season=0
    has_been_error=0
    n_points_in_future=8
    budget=101
    ownership=0.9
    
    current_fixture_path="Raw_Data_25\Fantasy_season_2025_Fixtures.csv"
    current_player_path="Raw_Data_25/current_players.csv"
    current_team_path="Raw_Data_25\current_teams.csv"
    current_season_path="Raw_Data_25\Fantasy_season_2025_data.csv"
    Understat_path="Raw_Data_25/Understat_data.csv"
    Understat_shots_path="Raw_Data_25/Understat_data_shots.csv"
    #current_raw_data_path="Raw_Data_24\Fantasy_season_2024_data.csv"
    time_list=Get_times(current_fixture_path,n_points_in_future)
    
    GW_list_wildcard=time_list
    GW_list_freehit=[time_list[0]]
    
    run_player_pos=0
    
    print(time_list)
    
    
    #EXTARCT DATA
    Data_Extraction(season,is_new_season,has_been_error)
    
    
    #Transform data
    Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list,run_player_pos,Understat_path,Understat_shots_path)
    
    #Predict data
    Data_Predictions(current_fixture_path,current_player_path,current_team_path, n_points_in_future,time_list)
    
    Data_Generation(ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path,current_season_path )
    
    #Specials(ownership,budget,GW_list_wildcard,current_player_path )
    
if __name__ == "__main__":
    Main_Orchestration()
