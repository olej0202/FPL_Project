from GenerateOptimizers import generate_optimizers #Lager optimert wildcard og freehit lag
from FullLoad import main_Extract,current_players,current_teams #Henter data fra fantasy-APIet
from GenerateDataset5 import main_Transform #Hovedtransform av all historisk data, lag og spillere
from GeneratePlayerData import GeneratePlayerData,team_data #Lager dataset for prediksjonene
from FullLoad_Understat import main_Extract_Understat #Henter data fra understat
from Generate_Team_Predictions import GenerateTeamPredictions #Prediksjoner for kamper
from Generate_Player_Predictions import Make_Predictions,Generate_point_predictions #Lager prediksjoner og setter det sammen til et datatset
from GenerateOptimizerSet import GenerateOptimizeSet #Lager dataset klart til å optimeres på
from GenerateVisualDataset import Generate_ALL_datasets
from chatgpt import main_GPT_News

import pandas as pd
import torch
import torch.nn as nn
from datetime import datetime

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
    main_Extract(season, is_new_season, has_been_error)
    current_players(season)
    current_teams(season)
    main_Extract_Understat(season)


def Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list):
    main_Transform()
    team_data(current_team_path)
    GeneratePlayerData(time_list, current_fixture_path,current_player_path,current_team_path)

    
def Data_Predictions(current_fixture_path,current_team_path, n_points_in_future):
    GenerateTeamPredictions( current_fixture_path,current_team_path, n_points_in_future)
    Make_Predictions()
    Generate_point_predictions()
    
   
def Data_Generation(current_raw_data_path,ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path ):
    GenerateOptimizeSet(current_player_path)
    generate_optimizers(ownership=ownership,budget=budget,GW_list_wildcard=GW_list_wildcard,GW_list_freehit=GW_list_freehit  )
    Generate_ALL_datasets(current_team_path)
    #main_GPT_News()

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
    return next_n["event"].astype(str).values
    
def Main_Orchestration():
    season=25
    is_new_season=0
    has_been_error=1
    n_points_in_future=8
    budget=100
    ownership=0.9
    
    current_fixture_path="Raw_Data_25\Fantasy_season_2025_Fixtures.csv"
    current_player_path="Raw_Data_25/current_players.csv"
    current_team_path="Raw_Data_25\current_teams.csv"
    current_raw_data_path="Raw_Data_24\Fantasy_season_2024_data.csv"
    time_list=Get_times(current_fixture_path,n_points_in_future)
    
    GW_list_wildcard=time_list
    GW_list_freehit=[time_list[0]]
    
    
    #EXTARCT DATA
    #Data_Extraction(season,is_new_season,has_been_error)
    
    
    #Transform data
    Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list)
    
    #Predict data
    Data_Predictions(current_fixture_path,current_team_path, n_points_in_future)
    
    Data_Generation(current_raw_data_path,ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path )
    
if __name__ == "__main__":
    Main_Orchestration()