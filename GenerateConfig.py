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


Manual_team_offensive_adjustments = {2:0.95,91:0.95}
    
    
    
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
        {"name": "Viktor_Gyökeres", "type": "const",   "GW": "any", "value": 75},
        {"name": "Matheus_Santos Carneiro Da Cunha", "type": "const",   "GW": "any", "value": 75},
        {"name": "Florian_Wirtz", "type": "const",   "GW": "any", "value": 75},
        {"name": "Joachim_Andersen", "type": "const",   "GW": "any", "value": 80},
        {"name": "Melker_Ellborg", "type": "adjust_from",   "GW": "34", "value": 0},
        {"name": "Robert_Sánchez", "type": "const",   "GW": "any", "value": 70},
        {"name": "Piero_Hincapié", "type": "const",   "GW": "any", "value": 70},
        {"name": "Jurriën_Timber", "type": "const",   "GW": "any", "value": 90},
        {"name": "Gabriel_dos Santos Magalhães", "type": "const",   "GW": "any", "value": 90},
        {"name": "Anton_Stach", "type": "const",   "GW": "any", "value": 70},
    ]


NEW_TEAMS=[]
NEW_TEAMS_NAME=[]
fixtures_config = {
        
        "2562226":[
            {"gw": 34, "probability": 1.0},
            {"gw": 33, "probability": 0.0},
            
        ],
        "2562227":[
            {"gw": 34, "probability": 0},
            {"gw": 33, "probability": 1},
            
        ],

        "2562228":[
            {"gw": 34, "probability": 0},
            {"gw": 33, "probability": 1},
        ],
        "2562201":[
            {"gw": 36, "probability": 0.8},
            {"gw": 38, "probability": 0.2},
        ],
        "2562225":[
            {"gw": 34, "probability": 0},
            {"gw": 33, "probability": 1},
        ]
    }

min_id=46805

ai_id=7025308