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


Manual_team_offensive_adjustments = {17:1.1,36:0.9,94:0.9,4:0.9,2:0.9}
    
    
    
Manual_team_defensive_adjustments = {94:1.1,31:1.1,4:1.1,39:1.05}


Manual_NewPlayer_Adjustments={
        "Benjamin_Sesko":["Kai_Havertz","Rasmus_Højlund","Marcus_Rashford"], 
        "Hugo_Ekitiké":["Kai_Havertz","Alexander_Isak" ],
    }

Manual_Player_Adjustments={
        "Mohamed_Salah":["Florian_Wirtz"],
        "Igor_Thiago Nascimento Rodrigues":["Liam_Delap"],
        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.6,
        "Yoane_Wissa":0.8,        
}

Manual_min=[
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 90},
        {"name": "Hugo_Ekitiké", "type": "const",   "GW": "any", "value": 90},
        {"name": "Karl_Darlow", "type": "const",   "GW": "any", "value": 0},
        {"name": "Alisson_Ramses Becker", "type": "const",   "GW": "any", "value": 90},
        {"name": "Tijjani_Reijnders", "type": "const",   "GW": "any", "value": 75},
        {"name": "Callum_Wilson", "type": "const",   "GW": "any", "value": 75},
        {"name": "Nico_O'Reilly", "type": "const",   "GW": "any", "value": 75},
        {"name": "Gabriel_dos Santos Magalhães", "type": "adjust_from",   "GW": "20", "value": 90},
        {"name": "Bruno_Borges Fernandes", "type": "linear_from",   "GW": "20", "value": 90},
        
        #Afcon
        {"name": "Mohamed_Salah", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Ismaïla_Sarr", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Mohammed_Kudus", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Bryan_Mbeumo", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Amad_Diallo", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Iliman_Ndiaye", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Dango_Ouattara", "type": "adjust_from",   "GW": "22", "value": 90},
        {"name": "Alex_Iwobi", "type": "adjust_from",   "GW": "22", "value": 90},
        
        {"name": "Cole_Palmer", "type": "const",   "GW": "any", "value": 90},
        {"name": "Anthony_Gordon", "type": "const",   "GW": "any", "value": 90},
        {"name": "Cody_Gakpo", "type": "const",   "GW": "any", "value": 0},
        {"name": "Viktor_Gyökeres", "type": "const",   "GW": "any", "value": 80},

    ]
        


NEW_TEAMS=[56]
NEW_TEAMS_NAME=["Sunderland"]


min_id=46805

ai_id=7025308