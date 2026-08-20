from GenerateOptimizers import generate_optimizers #Lager optimert wildcard og freehit lag
from FullLoad import main_Extract,current_players,current_teams,fixtures #Henter data fra fantasy-APIet
from GenerateDataset5 import main_Transform #Hovedtransform av all historisk data, lag og spillere
from GeneratePlayerData import GeneratePlayerData,team_data #Lager dataset for prediksjonene
from FullLoad_Understat import main_Extract_Understat #Henter data fra understat
from Generate_Team_Predictions import GenerateTeamPredictions #Prediksjoner for kamper
from Generate_Team_Predictions2 import GenerateTeamPredictions2 as GenerateTeamPredictions3Model
from Generate_Player_Predictions import Make_Predictions,Generate_point_predictions #Lager prediksjoner og setter det sammen til et datatset
from Generate_Player_Predictions2 import make_predictions2
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
from Generate_Full_SImulator2 import (
    DataPaths as FullSimulator2DataPaths,
    write_upcoming_prediction_files as write_full_simulator2_outputs,
)
from Generate_Minutes_Simulator import Generate_Minutes_Simulator
#erere

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


def _normalize_time_list(time_list):
    out = []
    if time_list is None:
        values = []
    else:
        try:
            values = list(time_list)
        except TypeError:
            values = [time_list]

    for v in values:
        try:
            out.append(int(float(v)))
        except Exception:
            continue
    # Stable unique preserving order.
    seen = set()
    uniq = []
    for gw in out:
        if gw not in seen:
            seen.add(gw)
            uniq.append(gw)
    return uniq


def _filter_fixtures_by_timelist(
    input_path: str,
    time_list,
    output_path: Path,
    force_unfinished: bool = False,
) -> Path:
    df = pd.read_csv(input_path)
    if "event" not in df.columns:
        raise ValueError(f"Fixture file {input_path} mangler kolonnen 'event'.")
    gws = _normalize_time_list(time_list)
    if not gws:
        raise ValueError("time_list er tom eller ugyldig; kan ikke filtrere fixtures.")
    out = df.copy()
    out["event"] = pd.to_numeric(out["event"], errors="coerce")
    out = out[out["event"].isin(gws)].copy()
    if force_unfinished and "finished" in out.columns:
        out["finished"] = False
    if out.empty:
        raise ValueError(
            f"Ingen fixtures etter filtrering av {input_path} med time_list={gws}."
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(output_path, index=False)
    return output_path


def Data_Extraction(season,is_new_season,has_been_error):
    #main_Extract(season, is_new_season, has_been_error)
    current_players(season)
    current_teams(season)
    fixtures(season)
    #main_Extract_Understat(season)


def Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list,run_player_pos,Understat_path,Understat_shots_path):
    main_Transform()
    #Generate_Understat_dataset(current_player_path,run_player_pos)
    #Generate_Shots_data(Understat_path,Understat_shots_path,current_player_path,current_team_path)
    #team_data(current_team_path)
    #GetXmins(current_player_path, time_list, scenarios=Manual_min)
    GeneratePlayerData(time_list, current_fixture_path,current_player_path,current_team_path)

    
def Data_Predictions(
    current_fixture_path,
    current_player_path,
    current_team_path,
    n_points_in_future,
    time_list,
    fixtures_expanded_path_25,
    team_history_path_25,
    player_prediction_path_25,
    player_history_path_25,
    full_simulator_team_output_path_25,
    full_simulator_player_output_path_25,
):
    
    # Run both simulation engines first
    sim_output_dir = Path("SImulator")
    sim_output_dir.mkdir(parents=True, exist_ok=True)
    upcoming_team_stats_path = Path("Team_data_newest3.csv")

    fixture_path = Path(current_fixture_path)
    team_path = Path(current_team_path)
    player_path = Path(current_player_path)
    team_history_path = Path(team_history_path_25)
    player_prediction_path = Path(player_prediction_path_25)
    player_history_path = Path(player_history_path_25)
    fixtures_expanded_path = Path(fixtures_expanded_path_25)
    gw_list = _normalize_time_list(time_list)

    if not gw_list:
        raise ValueError("time_list er tom/ugyldig i Data_Predictions.")

    filtered_fixture_path = _filter_fixtures_by_timelist(
        str(fixture_path),
        gw_list,
        sim_output_dir / "fixtures_filtered_by_timelist.csv",
        force_unfinished=True,
    )
    filtered_fixtures_expanded_path = _filter_fixtures_by_timelist(
        str(fixtures_expanded_path),
        gw_list,
        sim_output_dir / "fixtures_expanded_filtered_by_timelist.csv",
        force_unfinished=True,
    )
    """
    # Trigger full simulator parameter optimization with all read paths passed in.
    full_sim_control = FullSimulatorControlConfig(
        team_history_path=team_history_path,
        upcoming_team_stats_path=upcoming_team_stats_path,
        fixtures_path=filtered_fixtures_expanded_path,
        current_teams_path=team_path,
        player_prediction_path=player_prediction_path,
        player_history_path=player_history_path,
        n_upcoming=len(gw_list),
        optimization_output_path=sim_output_dir / "simtest_parameter_search.csv",
        optimization_best_output_path=sim_output_dir / "simtest_parameter_best.csv",
        write_outputs=True,
    )
    print("Running full simulator parameter optimization...")
    run_simulator_control(control_cfg=full_sim_control)

    print("Running core match/player simulator...")
    RunCoreSimulator(
        fixture_path=filtered_fixture_path,
        current_teams_path=team_path,
        current_players_path=player_path,
        team_history_path=team_history_path,
        player_prediction_path=player_prediction_path,
        player_history_path=player_history_path,
        output_match_path=sim_output_dir / "match_outcomes_score_predictions.csv",
        output_player_path=sim_output_dir / "player_outcomes_per_gw.csv",
        simulations=5000,
        seed=42,
        horizon_gws=len(gw_list),
    )

    print("Running detailed attack-turn simulator...")
    RunDetailedMatchSimulator(
        fixture_path=filtered_fixture_path,
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
        horizon_gws=len(gw_list),
    )

    print("Running full stochastic simulator v2 (team/player upcoming outputs)...")
    fs2_paths = FullSimulator2DataPaths(
        team_stats_candidates=(
            Path("Team_data_newest3.csv"),
            Path("team_stats.csv"),
            team_history_path,
            Path("Team_data_transformed2.csv"),
        ),
        player_stats_candidates=(
            Path("player_stats.csv"),
            player_prediction_path,
            player_path,
            Path("Player_Prediction_set.csv"),
            player_history_path,
            Path("ML_training2.csv"),
        ),
        fixtures_candidates=(
            Path("fixtures.csv"),
            filtered_fixtures_expanded_path,
            filtered_fixture_path,
            fixtures_expanded_path,
            fixture_path,
            Path("Fantasy_season_Fixtures_EXPANDED.csv"),
        ),
        current_teams_path=team_path,
        team_history_candidates=(
            team_history_path,
            Path("Team_data_newest3.csv"),
            Path("Team_data_transformed2.csv"),
            Path("Team_data_newest.csv"),
        ),
    )
    write_full_simulator2_outputs(
        team_output_path=Path(full_simulator_team_output_path_25),
        player_output_path=Path(full_simulator_player_output_path_25),
        n_scenarios=1000,
        include_finished_fixtures=False,
        paths=fs2_paths,
    )
    
    Generate_Minutes_Simulator(current_team_path,gw_list)"""
    

    GenerateTeamPredictions(
        str(filtered_fixture_path),
        current_team_path,
        len(gw_list),
        time_list=gw_list,
        standings_fixture_path=str(fixture_path),
    )
    Make_Predictions()
    Generate_point_predictions(time_list)
    #make_predictions2(horizon=len(time_list), gw_list=time_list)
    
   
def Data_Generation(ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path,current_season_path ):
    GenerateOptimizeSet(current_player_path)
    generate_optimizers(ownership=ownership,budget=budget,GW_list_wildcard=GW_list_wildcard,GW_list_freehit=GW_list_freehit,current_player_path=current_player_path )
    Generate_ALL_datasets(current_team_path,current_player_path,current_season_path)
    #main_GPT_News()
    
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
    season=26
    is_new_season=1
    has_been_error=0
    n_points_in_future=8
    budget=100
    ownership=0.9
    
    current_fixture_path="Raw_Data_26\Fantasy_season_2026_Fixtures.csv"
    current_player_path="Raw_Data_26/current_players.csv"
    current_team_path="Raw_Data_26\current_teams.csv"
    current_season_path="Raw_Data_26\Fantasy_season_2026_data.csv"
    Understat_path="Raw_Data_25/Understat_data.csv"
    Understat_shots_path="Raw_Data_25/Understat_data_shots.csv"
    fixtures_expanded_path_25="Fantasy_season_Fixtures_EXPANDED.csv"
    team_history_path_25="Team_data_transformed2.csv"
    player_prediction_path_25="Player_Prediction_set.csv"
    player_history_path_25="ML_training2.csv"
    full_simulator_team_output_path_25="SImulator/Full_simulator_team.csv"
    full_simulator_player_output_path_25="SImulator/Full_simulator_player.csv"
    #current_raw_data_path="Raw_Data_24\Fantasy_season_2024_data.csv"
    time_list=Get_times(current_fixture_path,n_points_in_future)
    GW_list_wildcard=time_list
    GW_list_freehit=[time_list[0]]
    
    run_player_pos=0
    
    print(time_list)
    
    
    #EXTARCT DATA
    #Data_Extraction(season,is_new_season,has_been_error)
    
    
    #Transform data
    #Data_Transformation(n_points_in_future, current_fixture_path,current_player_path,current_team_path,time_list,run_player_pos,Understat_path,Understat_shots_path)
    
    #Predict data
    Data_Predictions(
        fixtures_expanded_path_25,
        current_player_path,
        current_team_path,
        n_points_in_future,
        time_list,
        fixtures_expanded_path_25,
        team_history_path_25,
        player_prediction_path_25,
        player_history_path_25,
        full_simulator_team_output_path_25,
        full_simulator_player_output_path_25,
    )
    
    Data_Generation(ownership,budget,GW_list_wildcard,GW_list_freehit,current_player_path,current_team_path,current_season_path )
    
    #Specials(ownership,budget,GW_list_wildcard,current_player_path )
    
if __name__ == "__main__":
    Main_Orchestration()
