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


Manual_team_offensive_adjustments = {17:1.1,94:0.9,4:0.9}
    
    
    
Manual_team_defensive_adjustments = {31:1.1,4:1.1,39:1.05,56:1.15}


Manual_NewPlayer_Adjustments={

    }

Manual_Player_Adjustments={
        "Mohamed_Salah":["Florian_Wirtz"],
        "Igor_Thiago Nascimento Rodrigues":["Liam_Delap"],
        "Rayan_Cherki":["Tijjani_Reijnders"],
        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.6,
        "Yoane_Wissa":0.8,
        "Antoine_Semenyo":0.8,     
        "Marc_Guéhi":0.8        
}

Manual_min=[
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 90},
        {"name": "Hugo_Ekitiké", "type": "const",   "GW": "any", "value": 80},
        {"name": "Alisson_Ramses Becker", "type": "const",   "GW": "any", "value": 90},
        {"name": "Gabriel_dos Santos Magalhães", "type": "const",   "GW": "any", "value": 90},
        {"name": "Bruno_Borges Fernandes", "type": "const",   "GW": "any", "value": 90},
        {"name": "Rayan_Aït-Nouri", "type": "const",   "GW": "any", "value": 1},
        {"name": "Antoine_Semenyo", "type": "const",   "GW": "any", "value": 60},
        {"name": "Rayan_Cherki", "type": "const",   "GW": "any", "value": 65},
        #Afcon
        {"name": "Mohamed_Salah", "type": "adjust_from",   "GW": "23", "value": 90},
        {"name": "Ismaïla_Sarr", "type": "adjust_from",   "GW": "23", "value": 90},
        {"name": "Bryan_Mbeumo", "type": "const",   "GW": "any", "value": 90},
        {"name": "Amad_Diallo", "type": "const",   "GW": "any", "value": 90},
        {"name": "Iliman_Ndiaye", "type": "const",   "GW": "any", "value": 90},
        {"name": "Dango_Ouattara", "type": "adjust_from",   "GW": "23", "value": 90},
        {"name": "Alex_Iwobi", "type": "adjust_from",   "GW": "23", "value": 90},
        
        {"name": "Cole_Palmer", "type": "const",   "GW": "any", "value": 90},
        {"name": "Anthony_Gordon", "type": "const",   "GW": "any", "value": 75},
        {"name": "Viktor_Gyökeres", "type": "const",   "GW": "any", "value": 80},

    ]
        


NEW_TEAMS=[]
NEW_TEAMS_NAME=[]
fixtures_config = {
        "2562204": [
            {"gw": 26, "probability": 0.5},
            {"gw": 31, "probability": 0.5},
        ]

    }

min_id=46805

ai_id=7025308