"""
3,0,,1,0,Arsenal,0,0,0,ARS,,,False,0,,4,5,0,0,0,0,1
7,0,,2,0,Aston Villa,0,0,0,AVL,,,False,0,,3,4,0,0,0,0,2
91,0,,3,0,Bournemouth,0,0,0,BOU,,,False,0,,3,3,0,0,0,0,127
94,0,,4,0,Brentford,0,0,0,BRE,,,False,0,,3,3,0,0,0,0,130
36,0,,5,0,Brighton,0,0,0,BHA,,,False,0,,2,3,0,0,0,0,131
8,0,,6,0,Chelsea,0,0,0,CHE,,,False,0,,4,4,0,0,0,0,4
9,0,,7,0,Coventry City,0,0,0,COV,,,False,0,,2,2,0,0,0,0,5
31,0,,8,0,Crystal Palace,0,0,0,CRY,,,False,0,,3,3,0,0,0,0,6
11,0,,9,0,Everton,0,0,0,EVE,,,False,0,,3,3,0,0,0,0,7
54,0,,10,0,Fulham,0,0,0,FUL,,,False,0,,2,3,0,0,0,0,34
88,0,,11,0,Hull City,0,0,0,HUL,,,False,0,,2,2,0,0,0,0,41
40,0,,12,0,Ipswich Town,0,0,0,IPS,,,False,0,,2,2,0,0,0,0,8
2,0,,13,0,Leeds,0,0,0,LEE,,,False,0,,2,3,0,0,0,0,9
14,0,,14,0,Liverpool,0,0,0,LIV,,,False,0,,4,4,0,0,0,0,10
43,0,,15,0,Man City,0,0,0,MCI,,,False,0,,4,5,0,0,0,0,11
1,0,,16,0,Man Utd,0,0,0,MUN,,,False,0,,4,4,0,0,0,0,12
4,0,,17,0,Newcastle,0,0,0,NEW,,,False,0,,2,3,0,0,0,0,23
17,0,,18,0,Nott'm Forest,0,0,0,NFO,,,False,0,,3,3,0,0,0,0,15
6,0,,19,0,Spurs,0,0,0,TOT,,,False,0,,3,3,0,0,0,0,21
56,0,,20,0,Sunderland,0,0,0,SUN,,,False,0,,2,3,0,0,0,0,29"""

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
        "Francisco Evanilson_de Lima Barbosa":"Francisco_Evanilson de Lima Barbosa",
        "João Pedro_Junqueira de Jesus": "João_Pedro Junqueira de Jesus",
        "Igor Thiago_Nascimento Rodrigues":"Igor_Thiago Nascimento Rodrigues"
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

Player_picture_url="https://resources.premierleague.com/premierleague25/photos/players/500x500/"
current_season="26"



def normalize_player_name(name):
    if name is None:
        return name
    return PLAYER_NAME_MAP.get(name, name)


Manual_team_offensive_adjustments = { 
        #example 90:1.1 bedre off,  90:0.95 dårligere off
        8:1.1,6:1.15,88:0.9
}
    
    
    
Manual_team_defensive_adjustments = {
        #example 90:1.1 dårligere def,  90:0.95 bedre def
        8:0.9,88:1.1
}


Manual_NewPlayer_Adjustments={

    }

Manual_Player_Adjustments={
    #exemple Alexander_Isak:["Tammy_Abraham","Yoane_Wissa" ]
    "Elliot_Anderson":["Rodrigo_Hernandez"],
    "Milan_van Ewijk":["Lucas_Digne"],
    "Liam_Kitching":["Jaydee_Canvot"],
    "Bobby_Thomas":["Jaydee_Canvot"],
    
    
    
        
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
import pandas as pd
generated = pd.read_csv("GenerateStartofSeasonMins.csv")

# Keep only the fields GenerateXmins.py expects
Manual_min = generated[
    ["name", "type", "value"]
].to_dict(orient="records")
Manual_min.extend([
    #{"name": "Mohamed_Salah", "type": "const", "value": 90},

])

#use code
NEW_TEAMS=[9,40,88]
#use name
NEW_TEAMS_NAME=["Coventry City","Hull City","Ipswich Town"]

fixtures_config = {
        

}

date_filter=None


POSITION_EVENT_BONUS = {
    "GKP": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "DEF": {"goal": 12.0, "assist": 9.0, "cs": 12.0},
    "MID": {"goal": 18.0, "assist": 9.0, "cs": 0.0},
    "FWD": {"goal": 24.0, "assist": 9.0, "cs": 0.0},
}

POINTS_RULES = {
    "GKP": {"goal": 6, "assist": 3, "cs": 4, "start": 2},
    "DEF": {"goal": 6, "assist": 3, "cs": 4, "start": 1},
    "MID": {"goal": 5, "assist": 3, "cs": 1, "start": 2},
    "FWD": {"goal": 4, "assist": 3, "cs": 0, "start": 2},
}

min_id=2440

ai_id=14177
