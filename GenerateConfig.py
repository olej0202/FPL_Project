"""
Southampton,20,
Bournemouth,91,
Chelsea,8,
Newcastle,4,
Leicester,13
Nott'm Forest,17,
Crystal Palace,31,
Wolves,39,
Brentford,94,
Spurs,6
,West Ham,21
,Liverpool,14
,Leeds,2,
,Fulham,54,
,Brighton,36,
,Man City,43
,Man Utd,1
,Aston Villa,7
,Everton,11,
,Arsenal,3,
,Sheffield Utd,49
,Burnley,90,
,Luton,102,
,Ipswich,40"""


Manual_team_offensive_adjustments = {17:1.1,1:1.1,36:0.9,11:1.1,94:0.9 }
    
    
    
Manual_team_defensive_adjustments = {94:1.1,31:1.1,4:1.1}


Manual_NewPlayer_Adjustments={
        "Benjamin_Sesko":["Kai_Havertz","Rasmus_Højlund","Marcus_Rashford"], 
        "Hugo_Ekitiké":["Kai_Havertz","Alexander_Isak" ],
    }

Manual_Player_Adjustments={
        "Mohamed_Salah":["Florian_Wirtz"]
        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.7,
        "Yoane_Wissa":0.8,        
}

Manual_min=[
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 90},
        {"name": "Hugo_Ekitiké", "type": "const",   "GW": "any", "value": 80},
        {"name": "Karl_Darlow", "type": "const",   "GW": "any", "value": 0},
        {"name": "Alisson_Ramses Becker", "type": "const",   "GW": "any", "value": 90},
        {"name": "Tijjani_Reijnders", "type": "const",   "GW": "any", "value": 75},
        {"name": "Callum_Wilson", "type": "const",   "GW": "any", "value": 75},
        {"name": "Nico_O'Reilly", "type": "const",   "GW": "any", "value": 75},
        {"name": "Mohamed_Salah", "type": "const",   "GW": "any", "value": 0},
        {"name": "Ismaïla_Sarr", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Mohammed_Kudus", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Bryan_Mbeumo", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Amad_Diallo", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Iliman_Ndiaye", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Dango_Ouattara", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Alex_Iwobi", "type": "adjust_from",   "GW": "16", "value": 0},
        {"name": "Cole_Palmer", "type": "adjust_from",   "GW": "16", "value": 80},
        {"name": "Anthony_Gordon", "type": "adjust_from",   "GW": "15", "value": 80},
        {"name": "Cody_Gakpo", "type": "const",   "GW": "any", "value": 0},
    ]
        


NEW_TEAMS=[56]
NEW_TEAMS_NAME=["Sunderland"]


min_id=46805

ai_id=7025308