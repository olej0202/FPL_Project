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


Manual_team_offensive_adjustments = {94:0.9,1:1.2,31:0.9 }
    
    
    
Manual_team_defensive_adjustments = {94:1.15,11:1.1, 31:1.1,6:0.85, 17:0.9 }


Manual_NewPlayer_Adjustments={
        "Viktor_Gyökeres":["Alexander_Isak","Kai_Havertz","Yoane_Wissa"],
        "Florian_Wirtz":["Mohamed_Salah","Cole_Palmer","Dominik_Szoboszlai","Alexis_Mac Allister", "Luis_Díaz"],
        "Tijjani_Reijnders":["İlkay_Gündoğan","Phil_Foden"],
        "Rayan_Cherki":["İlkay_Gündoğan","Phil_Foden"],
        "El_Hadji Malick Diouf":["Aaron_Wan-Bissaka", "Lucas_Digne"], 
        "Jeremie_Frimpong":["Andrew_Robertson","Pedro_Porro","Lucas_Digne"],
        "Benjamin_Sesko":["Kai_Havertz","Rasmus_Højlund","Marcus_Rashford"], 
        "Hugo_Ekitiké":["Kai_Havertz","Yoane_Wissa","Luis_Díaz" ]    
    }

Manual_Player_Adjustments={
        "Mohammed_Kudus":["Brennan_Johnson","Son_Heung-min"],
        "Matheus_Santos Carneiro Da Cunha":["Bruno_Borges Fernandes","Alejandro_Garnacho Ferreyra","Amad_Diallo"],
        "Bryan_Mbeumo":["Bruno_Borges Fernandes","Alejandro_Garnacho Ferreyra","Amad_Diallo"],
        "Cole_Palmer":["Mohamed_Salah","Bukayo_Saka"],
        "Ollie_Watkins":["Erling_Haaland","Yoane_Wissa"],
        "Anthony_Gordon":["Alexander_Isak","Jacob_Murphy","Harvey_Barnes"],   
        "Igor_Thiago Nascimento Rodrigues":["Yoane_Wissa","Bryan_Mbeumo"],
        "Lucas_Tolentino Coelho de Lima":["Jarrod_Bowen"],
        "Mohamed_Salah":["Luis_Díaz","Mohamed_Salah" ],
        }

NEW_TEAMS=[56]


min_id=46805

ai_id=7025308