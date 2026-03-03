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


Manual_team_offensive_adjustments = {17:1.1,31:0.95,2:0.95,91:0.95}
    
    
    
Manual_team_defensive_adjustments = {}


Manual_NewPlayer_Adjustments={

    }

Manual_Player_Adjustments={

        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.6,
        "Yoane_Wissa":0.8,
        "Antoine_Semenyo":0.5,     
        "Tammy_Abraham":0.8,
        "Jørgen_Strand Larsen":0.7,        
}

Manual_min=[
        {"name": "Jean-Philippe_Mateta", "type": "const",   "GW": "any", "value": 0},
        #Afcon
        {"name": "Amad_Diallo", "type": "const",   "GW": "any", "value": 75},
        {"name": "Anthony_Gordon", "type": "const",   "GW": "any", "value": 75},
        {"name": "Viktor_Gyökeres", "type": "const",   "GW": "any", "value": 75},
        {"name": "Matheus_Santos Carneiro Da Cunha", "type": "const",   "GW": "any", "value": 75},
        
        {"name": "Tammy_Abraham", "type": "const",   "GW": "any", "value": 60},
        {"name": "Jørgen_Strand Larsen", "type": "const",   "GW": "any", "value": 80},
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 80},
        {"name": "Anton_Stach", "type": "const",   "GW": "any", "value": 90},
        {"name": "Dango_Ouattara", "type": "const",   "GW": "any", "value": 90},
        {"name": "Marcus_Tavernier", "type": "const",   "GW": "any", "value": 90},
    ]
        


NEW_TEAMS=[]
NEW_TEAMS_NAME=[]
fixtures_config = {
        "2562201": [
            {"gw": 38, "probability": 1},
            {"gw": 31, "probability": 0},
        ],
        "2562226":[
            {"gw": 34, "probability": 0.37},
            {"gw": 33, "probability": 0.63},
            
        ],
        "2562227":[
            {"gw": 34, "probability": 0.6},
            {"gw": 33, "probability": 0.4},
            
        ],
        "2562230":[
            {"gw": 34, "probability": 0.7},
            {"gw": 33, "probability": 0.3},
            
        ]


    }

min_id=46805

ai_id=7025308