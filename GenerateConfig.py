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


Manual_team_offensive_adjustments = {4:0.9,17:1.15,94:0.85,36:0.9,54:1.1 }
    
    
    
Manual_team_defensive_adjustments = {94:1.1,7:1.15,31:1.1 }


Manual_NewPlayer_Adjustments={
        "Benjamin_Sesko":["Kai_Havertz","Rasmus_Højlund","Marcus_Rashford"], 
        "Hugo_Ekitiké":["Kai_Havertz","Alexander_Isak" ],
    }

Manual_Player_Adjustments={
        "Nordi_Mukiele":["Vitalii_Mykolenko"]
        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.7,
        "Yoane_Wissa":0.8,        
}

Manual_min=[
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 90},
        {"name": "Hugo_Ekitiké", "type": "const",   "GW": "any", "value": 70},
        {"name": "Eli_Junior Kroupi", "type": "const",   "GW": "any", "value": 60},
        {"name": "Karl_Darlow", "type": "const",   "GW": "any", "value": 60},
        {"name": "Giorgi_Mamardashvili", "type": "const",   "GW": "any", "value": 60},
        {"name": "Tijjani_Reijnders", "type": "const",   "GW": "any", "value": 75},
        {"name": "Callum_Wilson", "type": "const",   "GW": "any", "value": 75},
        {"name": "Iliman_Ndiaye", "type": "const",   "GW": "any", "value": 80},
    ]
        


NEW_TEAMS=[56]


min_id=46805

ai_id=7025308