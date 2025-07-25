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

import torch
import torch.nn as nn
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
    #main_Extract_Understat(season)


def Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path):
    #main_Transform()
    team_data(current_team_path)
    GeneratePlayerData(n_points_in_future, current_fixture_path,current_player_path,current_team_path)

    
def Data_Predictions(current_fixture_path,current_team_path, n_points_in_future):
    GenerateTeamPredictions( current_fixture_path,current_team_path, n_points_in_future)
    Make_Predictions()
    Generate_point_predictions()
    
   
def Data_Generation(current_raw_data_path,ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path ):
    GenerateOptimizeSet(current_player_path)
    generate_optimizers(ownership=ownership,budget=budget,GW_list_wildcard=GW_list_wildcard,GW_list_freehit=GW_list_freehit  )
    Generate_ALL_datasets(current_team_path)
    #main_GPT_News()


def Main_Orchestration():
    season=25
    is_new_season=1
    has_been_error=0
    n_points_in_future=7
    budget=100
    ownership=0.9
    GW_list_wildcard=['1', '2','3', '4','5','6','7']
    GW_list_freehit=['1'] 
    
    current_fixture_path="Raw_Data_25\Fantasy_season_2025_Fixtures.csv"
    current_player_path="Raw_Data_25/current_players.csv"
    current_team_path="Raw_Data_25\current_teams.csv"
    current_raw_data_path="Raw_Data_24\Fantasy_season_2024_data.csv"
    
    #EXTARCT DATA
    #Data_Extraction(season,is_new_season,has_been_error)
    
    
    #Transform data
    Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path)
    
    #Predict data
    Data_Predictions(current_fixture_path,current_team_path, n_points_in_future)
    
    Data_Generation(current_raw_data_path,ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path )
    
if __name__ == "__main__":
    Main_Orchestration()