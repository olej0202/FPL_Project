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


Manual_team_offensive_adjustments = {}
    
    
    
Manual_team_defensive_adjustments = {39:1.1}


Manual_NewPlayer_Adjustments={

    }

Manual_Player_Adjustments={

        
     }


Manual_Player_Risk={
        "Alexander_Isak":0.6,
        "Yoane_Wissa":0.8,
        "Tammy_Abraham":0.8,
        "Jørgen_Strand Larsen":0.6,        
}

Manual_min=[
        #Afcon
        {"name": "Amad_Diallo", "type": "const",   "GW": "any", "value": 75},
        {"name": "Viktor_Gyökeres", "type": "const",   "GW": "any", "value": 75},
        {"name": "Matheus_Santos Carneiro Da Cunha", "type": "const",   "GW": "any", "value": 75},
        {"name": "Melker_Ellborg", "type": "const",   "GW": "any", "value": 0},
        {"name": "Piero_Hincapié", "type": "const",   "GW": "any", "value": 70},
        {"name": "Mitoma_Kaoru", "type": "const",   "GW": "any", "value": 70},
        {"name": "Brian_Brobbey", "type": "const",   "GW": "any", "value": 80},
        {"name": "Bruno_Guimarães Rodriguez Moura", "type": "const",   "GW": "any", "value": 80},
        {"name": "Chris_Wood", "type": "const",   "GW": "any", "value": 70},
        {"name": "Walter_Benítez", "type": "const",   "GW": "any", "value": 0},
        {"name": "Daniel_Ballard", "type": "const",   "GW": "any", "value": 90},
        {"name": "Alexander_Isak", "type": "const",   "GW": "any", "value": 80},
        {"name": "Robin_Roefs", "type": "const",   "GW": "any", "value": 90},
        {"name": "Xavi_Simons", "type": "const",   "GW": "any", "value": 75},
        {"name": "Anton_Stach", "type": "const",   "GW": "any", "value": 90},
        {"name": "Bukayo_Saka", "type": "const",   "GW": "any", "value": 75},


    ]


NEW_TEAMS=[]
NEW_TEAMS_NAME=[]
fixtures_config = {
        
        "2562201":[
            {"gw": 36, "probability": 1},
            {"gw": 37, "probability": 0},
        ],
        "2562255":[
            {"gw": 36, "probability": 0},
            {"gw": 37, "probability": 1},
        ],
        "2562259":[
            {"gw": 37, "probability": 1},
        ]
    }


min_id=46805

ai_id=7025308