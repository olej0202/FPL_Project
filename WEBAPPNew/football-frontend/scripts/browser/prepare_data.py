"""Prepare local API samples for browser checks; never contact production."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

import pandas as pd

workspace = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(workspace))
from GenerateConfig import fixtures_config
output = workspace / 'diagnostics' / 'frontend-rebuild'
output.mkdir(parents=True, exist_ok=True)
files = {
    'Player_rankings': ('Model_Predictions_visual2.csv', False, 700),
    'Team_current': ('Team_data_newest3.csv', True, 300),
    'Team_Threat': ('Team_threat.csv', False, 100),
    'Team_Lineups': ('Team_lineups.csv', True, 180),
    'Team_Predictions': ('Team_prediction_visual.csv', True, 200),
    'Team_Predictions_Future': ('Team_prediction.csv', True, 180),
    'Season_Analysis': ('Season_analysis.csv', True, 600),
    'Table_Prediction': ('Final_Table_Prediction_All_GW.csv', False, 180),
    'News': ('PL_news.csv', True, 35),
    'Team_result_adjust': ('Visual_adjust_Team_results.csv', True, 120),
    'Player_result_adjust': ('Player_Adjusted_data.csv', True, 700),
    'Teams': ('Team_data_transformed2.csv', True, 600),
    'Teams_Analysis': ('Teams_Visual_Analysis.csv', True, 600),
    'Player': ('player_history.csv', True, 900),
    'Matches': ('Matches.csv', False, 300),
    'Matches_Fixtures': ('Matches_Fixtures.csv', False, 100),
    'free-hit': ('Free_hit_team.csv', True, 120),
    'wildcard': ('Wildcard_team.csv', True, 120),
}
data = {}
for endpoint, (filename, skip_index, count) in files.items():
    frame = pd.read_csv(workspace / filename, nrows=count)
    if skip_index:
        frame = frame.iloc[:, 1:]
    data[endpoint] = json.loads(frame.to_json(orient='records'))
data['fixtures_config'] = fixtures_config
data['Planning_Events'] = [
    {'id': 8, 'finished': True, 'deadline_time': (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()},
    {'id': 9, 'finished': False, 'deadline_time': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()},
]
snapshot = workspace / 'diagnostics' / 'team_2440_wc6' / 'team_snapshot.json'
data['Get_My_Team'] = json.loads(snapshot.read_text(encoding='utf-8'))
for player in data['Get_My_Team']:
    player['gw'] = 9
data['Price_Changes'] = [
    {'id': 1, 'name': 'Haaland', 'full_name': 'Erling_Haaland', 'team_name': 'Man City',
     'price_change_percent': 92.5, 'projection_percent': 99.1, 'projection_likelihood': 4,
     'price': 14, 'is_locked': False},
    {'id': 2, 'name': 'Palmer', 'full_name': 'Cole_Palmer', 'team_name': 'Chelsea',
     'price_change_percent': -94, 'projection_percent': -101, 'projection_likelihood': -5,
     'price': 10.5, 'is_locked': False},
]
(output / 'api.json').write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf-8')
print(f'Prepared {len(data)} local API responses in {output}.')
