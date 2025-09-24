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


Manual_team_offensive_adjustments = {94:0.9,4:0.9 }
    
    
    
Manual_team_defensive_adjustments = {94:1.1,6:0.8 }


Manual_NewPlayer_Adjustments={
        "Viktor_Gyökeres":["Alexander_Isak","Kai_Havertz","Yoane_Wissa"],
        "Florian_Wirtz":["Mohamed_Salah","Cole_Palmer","Dominik_Szoboszlai","Alexis_Mac Allister", "Luis_Díaz"],
        "Tijjani_Reijnders":["İlkay_Gündoğan","Phil_Foden"],
        "Rayan_Cherki":["İlkay_Gündoğan","Phil_Foden"],
        "El_Hadji Malick Diouf":["Aaron_Wan-Bissaka", "Lucas_Digne"], 
        "Jeremie_Frimpong":["Andrew_Robertson","Pedro_Porro","Lucas_Digne"],
        "Benjamin_Sesko":["Kai_Havertz","Rasmus_Højlund","Marcus_Rashford"], 
        "Hugo_Ekitiké":["Kai_Havertz","Alexander_Isak" ]    
    }

Manual_Player_Adjustments={
        "Anthony_Gordon":["Alexander_Isak","Harvey_Barnes"],   
        "Igor_Thiago Nascimento Rodrigues":["Yoane_Wissa","Bryan_Mbeumo"],
        "Lucas_Tolentino Coelho de Lima":["Jarrod_Bowen"],
        "Mohamed_Salah":["Luis_Díaz","Mohamed_Salah" ]        }


Manual_Player_Risk={
        "Alexander_Isak":0.8,
        "Igor_Thiago Nascimento Rodrigues":0.7,
        "Jack_Grealish":0.7,
        "Yoane_Wissa":0.7,
        "Bryan_Mbeumo":0.5,
        "Matheus_Santos Carneiro Da Cunha":0.5,
        "Mohammed_Kudus":0.5,
        "Florian_Wirtz":0.5,
        "Viktor_Gyökeres":0.5,
        "Tijjani_Reijnders":0.5,
        "El_Hadji Malick Diouf":0.5,
        "Benjamin_Sesko":0.7,
        "Hugo_Ekitiké":0.5
        
}

NEW_TEAMS=[56]


min_id=46805

ai_id=7025308