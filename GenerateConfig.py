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

PLAYER_NAME_MAP = {
        "Pedro_Porro Sauceda": "Pedro_Porro",
        "Sávio_Moreira de Oliveira": "Sávio_'Savinho' Moreira de Oliveira",
        "Daniel_Muñoz Mejía": "Daniel_Muñoz",
        "Bernardo_Mota Veiga de Carvalho e Silva": "Bernardo_Veiga de Carvalho e Silva",
        "Ederson_Santana de Moraes": "Ederson_Santana de Moraes",
        "Levi_Samuels Colwill": "Levi_Colwill",
        "Marcos_Senesi Barón": "Marcos_Senesi",
        "Raúl_Jiménez Rodríguez": "Raúl_Jiménez",
        "Robert_Lynch Sánchez": "Robert_Sánchez",
        "Rodrigo_'Rodri' Hernandez Cascante": "Rodrigo_Hernandez",
        "Rúben_dos Santos Gato Alves Dias": "Rúben_Gato Alves Dias",
        "Kaoru_Mitoma": "Mitoma_Kaoru",
        "Matheus_Santos Carneiro da Cunha": "Matheus_Santos Carneiro Da Cunha",
        "David_Raya Martín": "David_Raya Martin",
        "Kepa_Arrizabalaga Revuelta": "Kepa_Arrizabalaga",
        "Idrissa_Gana Gueye": "Idrissa_Gueye",
        "Alisson_Becker": "Alisson_Ramses Becker",
        "Luis_Díaz Marulanda": "Luis_Díaz",
        "Matheus Luiz_Nunes": "Matheus_Nunes",
        "Alejandro_Garnacho Ferreyra": "Alejandro_Garnacho",
    }
Understat_Team_MAP={
        "Manchester City": "Man City",
        "Manchester United": "Man Utd",
        "Newcastle United": "Newcastle",
        "Nottingham Forest": "Nott'm Forest",
        "Sheffield United": "Sheffield Utd",
        "Tottenham": "Spurs",
        "Tottenham Hotspur": "Spurs",
        "Wolverhampton Wanderers": "Wolves",
    }




def normalize_player_name(name):
    if name is None:
        return name
    return PLAYER_NAME_MAP.get(name, name)


Manual_team_offensive_adjustments = { 
        #example 90:1.1 bedre off,  90:0.95 dårligere off
}
    
    
    
Manual_team_defensive_adjustments = {
        #example 90:1.1 dårligere def,  90:0.95 bedre def
}


Manual_NewPlayer_Adjustments={

    }

Manual_Player_Adjustments={
    #exemple Alexander_Isak:["Tammy_Abraham","Yoane_Wissa" ]

        
}


Manual_Player_Risk={
        # exemple"Alexander_Isak":0.6,
       
}

Manual_min = [
    # GenerateXmins.py expects a list of dicts with:
    # - "name"  : exact player name used in the prediction files
    # - "type"  : one of "const", "adjust_from", "linear_from"
    # - "GW"    : pivot GW for "adjust_from" and "linear_from"
    # - "value" : target minutes (0 to 90)

    # {"name": "Mohamed_Salah", "type": "const", "value": 90},

    # 2. adjust_from
    # Keeps current prediction up to and including pivot GW,
    # then sets all later GWs to value.
    # {"name": "Son_Heung-min", "type": "adjust_from", "GW": "35", "value": 0},

    # 3. linear_from
    # Starts at the model prediction in pivot GW,
    # moves linearly toward value, reaches it after 3 GWs,
    # and then holds that level.
    # {"name": "Cole_Palmer", "type": "linear_from", "GW": "34", "value": 90},


]

#use code
NEW_TEAMS=[]
#use name
NEW_TEAMS_NAME=[]

fixtures_config = {
        

}

date_filter="2026-04-14"


POSITION_EVENT_BONUS = {
    "GKP": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "DEF": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "MID": {"goal": 18.0, "assist": 9.0, "cs": 0.0},
    "FWD": {"goal": 24.0, "assist": 9.0, "cs": 0.0},
}

POINTS_RULES = {
    "GKP": {"goal": 6, "assist": 3, "cs": 4, "start": 2},
    "DEF": {"goal": 6, "assist": 3, "cs": 4, "start": 1},
    "MID": {"goal": 5, "assist": 3, "cs": 0.8, "start": 2},
    "FWD": {"goal": 4, "assist": 3, "cs": 0, "start": 2},
}

min_id=46805

ai_id=7025308
