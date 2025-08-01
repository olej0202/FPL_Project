
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_squared_error
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
from datetime import datetime, timedelta
from sklearn.preprocessing import LabelEncoder
import pytz
import torch.nn as nn
import torch
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import load_model
from tensorflow.keras.models import load_model
from tensorflow.keras.losses import MeanSquaredError
from sklearn.svm import SVR
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

criterion = nn.L1Loss()
df=pd.read_csv("testML4.csv").iloc[:,1:]
max_t=df['time'].max()
names= df['name'].unique()
time_df=pd.DataFrame()
for i in range(len(names)):
    name=names[i]
    first_filtered= df[df['name'] == name]
    times=[]
    filtered = first_filtered[first_filtered["minutes"] > 0]
    for g in range(len(filtered)):
        times.append(max_t-g)
    times.reverse()
    filtered["time"]=times

    time_df=pd.concat([time_df, filtered], axis=0, ignore_index=True)

time_df.to_csv("ML_training2.csv")
def Stat_preds(is_pred, pred_variable,column_list,horizon):
    horizon=horizon
    data=pd.read_csv("Player_Prediction_set.csv").iloc[:,1:]
    team_data=pd.read_csv("Team_prediction.csv").iloc[:,1:]
    opp_xg = data.apply(lambda row: row[22] if row[18] else row[20], axis=1)
    opp_xgc = data.apply(lambda row: row[23] if row[18] else row[21], axis=1)
    data["opposition_xg"]=data["played_XG"].values
    data["opposition_xgc"]=data["played_XGC"].values
    data['rolling_Threat'] = data['rolling_Threat'].fillna(10)
    data['rolling_key_passes'] = data['rolling_key_passes'].fillna(0.5)
    data['rolling_ICT'] = data['rolling_ICT'].fillna(5)
    data['Rolling_creativity'] = data['Rolling_creativity'].fillna(10)
    
    players=data["name"].unique()
    all_preds=[]
    MSE=[]
    for i in range(len(players)):
        preds=[]
        val_preds=[]
        val_real=[]
        df=data[data["name"]==players[i]]
        df=df.sort_values(by='GW')
        team=df['Team'].values[-1]

        
        for h in range(len(df)):
            player_preds=[]
            player_preds.append(players[i])
            GW=df["GW"].values[h]
            player_preds.append(GW)
            team_stats=team_data[(team_data["team_code"]==team) & (team_data["GW"]==GW)].copy()

            if(len(team_stats)<1):
                continue
            team_xg=team_stats["XG"].values[0]
            team_xgc=team_stats["XGC"].values[0]
            team_CS=team_stats["CS"].values[0]

            xggc=df["opposition_xgc"].values[h]

            attacking_factor=(df["opposition_xgc"].values[h]+team_xg)*0.5
            defensive_factor=(team_CS)
            if(pred_variable=="GOALS"):
               player_preds.append((df['Rolling_adjusted_XG'].values[h])*(attacking_factor))
               real_variable="expected_goals" 
            if(pred_variable=="Assist"):
               player_preds.append((df['Rolling_adjusted_XA'].values[h])*(attacking_factor))             
               real_variable="expected_assists"            
            if(pred_variable=="GC"):
                real_variable="expected_goals_conceded"
                if(df["position"].values[0] in ["FWD"]):
                    continue
                player_preds.append(defensive_factor)
            
            if(pred_variable=="bps"):
               real_variable="bonus" 
               player_preds.append(df['Rolling_adjusted_BPS'].values[h]*0.04)
               
            if(pred_variable=="CBI"):
               real_variable="cbi" 
               player_preds.append(df['CBI'].values[h])
        
            if(pred_variable=="Fantasy"):
               real_variable="total_points"
               player_preds.append(df['Rolling_adjusted_Fantasy'].values[h]*0.04)
            player_preds.append(df["position"].values[0])
            player_preds.append(xggc)
            all_preds.append(player_preds)
            
        
    columns=["Name", "GW", "pred", "position", "opp_stat"]
    data_f=pd.DataFrame(all_preds, columns=columns)
    data_f.to_csv(f"STAT_{pred_variable}.csv", index=False)
def XGB_Make_dataset(position,position2):
    df=pd.read_csv("ML_training2.csv").iloc[:,1:]

    if(position in['Assist','GOALS']):
        df = df.dropna(subset=['XG_Mean_difference', 'XA_Mean_difference'])
    opp_xg = df.apply(lambda row: row[22] if row[18] else row[20], axis=1)
    opp_xgc = df.apply(lambda row: row[23] if row[18] else row[21], axis=1)

    df["opposition_xg"]=opp_xg
    df["opposition_xgc"]=opp_xgc

    trainingdf=df[["Rolling_adjusted_XG_form","Rolling_adjusted_XA_form","Cluster_XG","Cluster_XA","Threat_slope","XA_slope","XG_slope","minutes","season","opposition_xg","Average_Overscore","opposition_xgc", "rolling_form","rolling_XG","Team","name","position","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GS","rolling_GC","rolling_XA","time","gamepos","rolling_ICT","Overscore","XGC_DEF","XGC_FWD","XGC_MID"
                   ,"Rolling_adjusted_XG2","Rolling_adjusted_XGC2","Rolling_adjusted_XA2","rolling_GS_historic","rolling_XG_historic","goals_scored","expected_goals"
                  ,"assists","rolling_Assist_historic","rolling_Assist","rolling_XA_historic","expected_assists","rolling_GC_historic","rolling_XGC_historic","clean_sheets",
                   "expected_goals_conceded", "rolling_bps","rolling_bps_historic","rolling_bonus_historic","rolling_bonus","bonus","rolling_key_passes","rolling_shots","Own_Attacking_form","Rolling_BPS_per_90"
                  ,"XG_Mean_difference","XA_Mean_difference","Shot_Mean_difference","Adjusted_XG_Mean_difference","Threat_Mean_difference","rolling_Threat","XG_Mean","Rolling_creativity"]]
    
    
    names= df['name'].unique()
    time_df=pd.DataFrame()
    for i in range(len(names)):
        times=[]
        name=names[i]
        filtered= trainingdf[trainingdf['name'] == name].copy()
        filtered['rolling_XG'] = filtered['rolling_XG'].shift(1)
        filtered['rolling_GC'] = filtered['rolling_GC'].shift(1)
        filtered['rolling_XA'] = filtered['rolling_XA'].shift(1)
        filtered['rolling_GS_historic'] = filtered['rolling_GS_historic'].shift(1)
        filtered['rolling_XG_historic'] = filtered['rolling_XG_historic'].shift(1)
        filtered['rolling_XA_historic'] = filtered['rolling_XA_historic'].shift(1)
        filtered['rolling_Assist'] = filtered['rolling_Assist'].shift(1)
        filtered['rolling_Assist_historic'] = filtered['rolling_Assist_historic'].shift(1)
        filtered['rolling_bps'] = filtered['rolling_bps'].shift(1)
        #filtered['Rolling_adjusted_XGC'] = filtered['Rolling_adjusted_XGC'].shift(1)
        #filtered['Rolling_adjusted_XG'] = filtered['Rolling_adjusted_XG'].shift(1)
        filtered['Overscore'] = filtered['Overscore'].shift(1)
        filtered['Capped_Average_Overscore'] = np.clip(df['Average_Overscore'], None, 1.5)
        filtered['Future_XG'] = filtered['Rolling_adjusted_XG2']*filtered['opposition_xgc']
        filtered['Future_XG2'] = filtered['Rolling_adjusted_XG2']*(filtered['opposition_xgc']*0.8+0.1*filtered['Own_Attacking_form']**2)
        
        filtered['Future_XGC'] = filtered['Rolling_adjusted_XGC2']*filtered['opposition_xg']
        filtered['Future_XGA'] = filtered['Rolling_adjusted_XA2']*filtered['opposition_xgc']
        filtered['XG_diff'] = filtered["rolling_XG"]-filtered['rolling_XG_historic']
        filtered['XA_diff'] = filtered["rolling_XA"]-filtered['rolling_XA_historic']
        filtered['opposition_xgc_bucket'] = pd.cut(filtered['opposition_xgc'],bins=[0, 0.8, 1, 1.2,1.3 ,1.4,1.5 ,1.6, 1.8, 2, 3],labels=[0.4, 0.9, 1.1, 1.2,1.3, 1.5,1.6, 1.7, 1.9, 2.5],include_lowest=True)
        filtered['opposition_xg_bucket'] = pd.cut(filtered['opposition_xg'],bins=[0, 0.8, 1, 1.2,1.3 ,1.4,1.5 ,1.6, 1.8, 2, 3],labels=[0.4, 0.9, 1.1, 1.2,1.3, 1.5,1.6, 1.7, 1.9, 2.5],include_lowest=True)

        filtered['Own_Attacking_form_bucket'] = pd.cut(filtered['Own_Attacking_form'],bins=[0, 0.8, 1, 1.2,1.3 ,1.4,1.5 ,1.6, 1.8, 2, 3],labels=[0.4, 0.9, 1.1, 1.2,1.3, 1.5,1.6, 1.7, 1.9, 2.5],include_lowest=True)
        # Convert to numeric (this removes the categorical dtype)
   
        time_df=pd.concat([time_df, filtered], axis=0, ignore_index=True)
    trainingdf=time_df
    trainingdf['Team'] = trainingdf['Team'].astype('category')
    trainingdf['name'] = trainingdf['name'].astype('category')
    trainingdf['opposition_xgc_bucket'] = trainingdf['opposition_xgc_bucket'].astype(float)
    trainingdf['Own_Attacking_form_bucket'] = trainingdf['Own_Attacking_form_bucket'].astype(float)
    trainingdf['opposition_xg_bucket'] = trainingdf['opposition_xg_bucket'].astype(float)
    trainingdf['position'] = trainingdf['position'].astype('category')
    trainingdf['gamepos'] = trainingdf['gamepos'].astype('category')
    trainingdf['Shot_Mean_difference'] = trainingdf['Shot_Mean_difference'].fillna(0)
    trainingdf['Threat_Mean_difference'] = trainingdf['Threat_Mean_difference'].fillna(0)
    trainingdf['Adjusted_XG_Mean_difference'] = trainingdf['Adjusted_XG_Mean_difference'].fillna(0)
    trainingdf['XG_Mean_difference'] = trainingdf['XG_Mean_difference'].clip(lower=-1, upper=2)
    trainingdf['XA_Mean_difference'] = trainingdf['XA_Mean_difference'].clip(lower=-1, upper=3)
    trainingdf.replace([np.inf, -np.inf], 1, inplace=True)

    if(position=='GOALS'):
        trainingdf=trainingdf[trainingdf['position'].isin(["FWD", "DEF", "MID"])]
        trainingdf=trainingdf[["expected_goals","opposition_xgc","Own_Attacking_form","XG_slope","rolling_shots",
                               "Team","name","time","minutes","season","rolling_Threat","position","rolling_XG_historic","Rolling_adjusted_XG_form"]]
        test_columns=["expected_goals","played_XGC","Own_Attacking_form","XG_slope","rolling_shots",
                               "Team","name","time","minutes","season","rolling_Threat","position","rolling_XG_historic","Rolling_adjusted_XG_form"]
        target_value="expected_goals"
        
    elif(position=='Assist2'):
        trainingdf=trainingdf[trainingdf['position'].isin(["FWD", "DEF", "MID"])]
        trainingdf=trainingdf[["XA_diff","position","opposition_xgc","Own_Attacking_form","Team","name","Own_cluster","Cluster"
                   ,"time","minutes","rolling_XA_historic","XA_Mean_difference","season","rolling_key_passes","XA_slope"]]
        test_columns=["XA_diff","position","played_XGC","Own_Attacking_form","Team","name","Own_cluster","Cluster"
                   ,"time","minutes","rolling_XA_historic","XA_Mean_difference","season","rolling_key_passes","XA_slope"]
        target_value="XA_Mean_difference"
        
    elif(position=='GC'):
        trainingdf=trainingdf[trainingdf['position'] == "DEF"]
        trainingdf=trainingdf[["position","opposition_xg","Rolling_adjusted_XGC2","Team","name","Own_cluster","Cluster"
                   ,"was_home","rolling_GC","time","minutes","Future_XGC","rolling_GC_historic","rolling_XGC_historic","expected_goals_conceded","season"]]
        test_columns=["position","played_XG","Rolling_adjusted_XGC","Team","name","Own_cluster","Cluster"
                   ,"was_home","rolling_GC","time","minutes","Future_XGC","rolling_GC_historic","rolling_XGC_historic","expected_goals_conceded","season"]
        target_value="expected_goals_conceded"
        
    elif(position=='bps'):
        trainingdf=trainingdf[["opposition_xgc","position","opposition_xg","Own_Attacking_form","rolling_bonus_historic","rolling_bonus","bonus","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","season","Future_XG","Future_XGA","Future_XGC","Rolling_BPS_per_90"]]
        test_columns=["played_XGC","position","played_XG","Own_Attacking_form","rolling_bonus_historic","rolling_bonus","bonus","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","season","Future_XG","Future_XGA","Future_XGC","Rolling_BPS_per_90"]
        target_value="bonus"
        
    elif(position=='Fantasy'):
        trainingdf=trainingdf[["total_points","opposition_xg","opposition_xgc","position","Own_Attacking_form","rolling_bonus","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","season","Future_XG","Future_XGA","Future_XGC","Rolling_adjusted_XA2","rolling_key_passes","rolling_Assist","Rolling_adjusted_XG2"
                    ,"rolling_GS","rolling_GS_historic","Rolling_adjusted_XGC2","rolling_GC","rolling_form","Rolling_BPS_per_90"]]
        test_columns=["total_points","played_XG","played_XGC","position","Own_Attacking_form","rolling_bonus","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","season","Future_XG","Future_XGA","Future_XGC","Rolling_adjusted_XA","rolling_key_passes","rolling_Assist","Rolling_adjusted_XG"
                    ,"rolling_GS","rolling_GS_historic","Rolling_adjusted_XGC","rolling_GC","rolling_form","Rolling_BPS_per_90"]
        target_value="total_points"

    elif(position=='Assist'):
        trainingdf=trainingdf[trainingdf['position'].isin(["FWD", "DEF", "MID"])]
        trainingdf=trainingdf[["expected_assists","opposition_xgc","Own_Attacking_form","XA_slope","rolling_key_passes",
                               "Team","name","time","minutes","season","Rolling_creativity","position","rolling_XA_historic","Cluster","Rolling_adjusted_XA2","Rolling_adjusted_XA_form"]]
        test_columns=["expected_assists","played_XGC","Own_Attacking_form","XA_slope","rolling_key_passes",
                               "Team","name","time","minutes","season","Rolling_creativity","position","rolling_XA_historic","Cluster","Rolling_adjusted_XA","Rolling_adjusted_XA_form"]
        target_value="expected_assists"
             

    else:
        trainingdf=trainingdf[["opposition_xg","opposition_xgc", "rolling_form","rolling_XG","Team","name","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GS","rolling_XA","time","gamepos",'Future_XG',"Future_XGA"]]
        test_columns=["played_XG","played_XGC", "rolling_form","rolling_XG","Team","name","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GS","rolling_XA","time","gamepos",'Future_XG',"Future_XGA"]
    trainingdf.to_csv("xgb_test_data.csv")
    return trainingdf,target_value,test_columns
    
def XGB_Train(rounds, eta,max_depth,gamma,min_c,dtrain,target_value,train,Y_train  ):
    if(target_value=='bonus'):
        params = {
            'objective': 'multi:softprob',
            'max_depth': max_depth,
            'eta': eta,
            'eval_metric': 'mlogloss',
            'tree_method': 'hist',
            'grow_policy': 'lossguide',
            'lambda': 2,
            'gamma': gamma,
            'min_child_weight': min_c,
            'num_class': 4
        }

        # Train using xgboost.train
        num_rounds = rounds
        xgb_model = xgb.train(params, dtrain, num_rounds)
        return xgb_model

    else:
        params = {
            'max_depth': max_depth,
            'eta': eta,
            'objective': 'reg:squarederror',  # Use 'reg:squarederror' for regression
            'eval_metric': 'rmse',             # Use 'rmse' (root mean squared error) for evaluation
            'tree_method':'hist',
            'grow_policy': 'lossguide',
            'lambda': 2, 
            'gamma':gamma,
            'min_child_weight': min_c
        }

        num_rounds = rounds
        xgb_model = xgb.train(params, dtrain, num_rounds)
        return xgb_model


def XGB_Make_Pred(trainingdf,target_value,position2,column_list,predlength,position,test_columns):
    X_train=pd.DataFrame()
    names= trainingdf['name'].unique()


    for i in range(len(names)):
        name=names[i]
        filtered= trainingdf[trainingdf['name'] == name]
        training_cutoff = filtered["time"].max() - 10
        name_df=filtered[lambda x: x.time <= training_cutoff]
        X_train=pd.concat([X_train, name_df], axis=0, ignore_index=True)
        
    full=['Mohamed_Salah','Kai_Havertz','Ollie_Watkins','Antoine_Semenyo','Bryan_Mbeumo','João Pedro_Junqueira de Jesus','Danny_Welbeck','Nicolas_Jackson','Jean-Philippe_Mateta','Dominic_Calvert-Lewin','Diogo_Teixeira da Silva'
      ,'Erling_Haaland','Alexander_Isak','Chris_Wood','Matheus_Santos Carneiro Da Cunha','Dominic_Solanke','Gabriel_dos Santos Magalhães','William_Saliba','Lucas_Digne','Ezri_Konsa Ngoyo','Lewis_Dunk','Levi_Colwill','Antonee_Robinson','Trent_Alexander-Arnold','Andrew_Robertson',
      'Joško_Gvardiol','Rico_Lewis','Diogo_Dalot Teixeira','Dan_Burn','Pedro_Porro','Rayan_Aït-Nouri','Kai_Havertz0','Gabriel_Martinelli Silva','Bukayo_Saka','Martin_Ødegaard','Morgan_Rogers','Antoine_Semenyo','Marcus_Tavernier','Bryan_Mbeumo','Noni_Madueke',
      'Cole_Palmer','Eberechi_Eze','Dwight_McNeil','Diogo_Teixeira da Silva','Luis_Díaz','Mohamed_Salah','Phil_Foden','Bruno_Borges Fernandes','Marcus_Rashford','Harvey_Barnes','Anthony_Gordon',
      'Morgan_Gibbs-White','Brennan_Johnson','Dejan_Kulusevski','James_Maddison','Jarrod_Bowen']
    
    extra=X_train[X_train['name'].isin(full)]
    extra['name'] = extra['name'].astype(str) + 'r'
    extra['name'] = extra['name'].astype('category')
    X_train=pd.concat([X_train, extra], axis=0, ignore_index=True)

    full=['Mohamed_Salah']
    extra=X_train[X_train['name'].isin(full)]
    extra['name'] = extra['name'].astype(str) + 'r2'
    extra['name'] = extra['name'].astype('category')
    X_train=pd.concat([X_train, extra], axis=0, ignore_index=True)
    
    Pred_data=pd.read_csv("Player_Prediction_set.csv").iloc[:,1:]
    

    Pred_data['Future_XG'] = Pred_data['Rolling_adjusted_XG']*Pred_data['played_XGC']
        
    Pred_data['Future_XGC'] = Pred_data['Rolling_adjusted_XGC']*Pred_data['played_XG']
    Pred_data['Future_XGA'] = Pred_data['Rolling_adjusted_XA']*Pred_data['played_XGC']
    Pred_data['XG_diff'] = Pred_data["rolling_XG"]-Pred_data['rolling_XG_historic']
    Pred_data['XA_diff'] = Pred_data["rolling_XA"]-Pred_data['rolling_XA_historic']
    Pred_data['Team'] = Pred_data['Team'].astype('category')
    Pred_data['name'] = Pred_data['name'].astype('category')
    Pred_data['position'] = Pred_data['position'].astype('category')
    Pred_data['gamepos'] = Pred_data['gamepos'].astype('category')
    Pred_data['Shot_Mean_difference'] = Pred_data['Shot_Mean_difference'].fillna(0)
    Pred_data['Threat_Mean_difference'] = Pred_data['Threat_Mean_difference'].fillna(0)
    Pred_data['Adjusted_XG_Mean_difference'] = Pred_data['Adjusted_XG_Mean_difference'].fillna(0)
    Pred_data['XG_Mean_difference'] = Pred_data['XG_Mean_difference'].clip(lower=-1, upper=2)
    Pred_data['XA_Mean_difference'] = Pred_data['XA_Mean_difference'].clip(lower=-1, upper=3)
    Pred_data.replace([np.inf, -np.inf], 1, inplace=True)

    X_test=Pred_data[test_columns].copy()

    X_test.columns = X_train.columns

    total=[]
    
    Y_train=X_train[[target_value]]
    Y_test=X_test[[target_value]]

    train = X_train.drop(columns=[target_value,'time',"name","Team","season"])
    test = X_test.drop(columns=['time'])

    dtrain = xgb.DMatrix(train, label=Y_train,enable_categorical=True)

    dtest = xgb.DMatrix(test, label=Y_test,enable_categorical=True)



    preds_list=test['name'].unique()
    train.to_csv("Debugg2.csv")
    model=XGB_Train(60,0.1,5,0.1,6,dtrain,target_value,train,Y_train )
    model2=SVR(kernel='rbf', C=0.5, epsilon=0.1,gamma=0.1)
    #model2=xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.01, max_depth=5,min_child_weight=6)


    svr_train=train.drop(columns=['position'])
    svr_train=svr_train.fillna(0)
    scaler = StandardScaler()
    svr_train_scaled = scaler.fit_transform(svr_train)
    model2.fit(svr_train_scaled,Y_train)
    row2=[]
    actuals=[]
    df2=pd.read_csv("ML_training2.csv").iloc[:,1:]
    for i in range(len(preds_list)):
        player=[]
        player.append(preds_list[i])
        filtered_df = test[test['name'].isin(player)]
        Pred_data_filtered=Pred_data[Pred_data['name'].isin(player)]
        gws=Pred_data_filtered["GW"].values

        filtered_df = filtered_df.drop(columns=[target_value,'name',"Team","season"])

        for y in range(len(gws)):
            row_pred=[]
            row_pred.append(preds_list[i])
            gw=gws[y]
            row=filtered_df.iloc[[y]] 
            dtest = xgb.DMatrix(row, label=[y],enable_categorical=True)
        
            if(position in ["GOALS","Assist"]):
                svr_test=row.drop(columns=['position'])
                svr_test=svr_test.fillna(0)
                svr_test_scaled = scaler.transform(svr_test) 
                y_pred = model2.predict(svr_test_scaled)
            
            else:
                y_pred = model.predict(dtest)

            if(target_value=="bonus"):
                row_pred.append(y_pred[0][0]*0+y_pred[0][1]*1+y_pred[0][2]*2+y_pred[0][3]*3)
            else:
                row_pred.append(y_pred[0])
            row_pred.append(filtered_df["position"].values[0])
            row_pred.append(gw)
            row_pred.append(row["opposition_xgc"].values[0])


            total.append(row_pred)

    column_list = ["Name", "pred", "position", "GW","opp_stat" ]

    data_f=pd.DataFrame(total, columns=column_list)
    data_f.to_csv(f"XGB_{position}.csv", index=False)
    return data_f
    
def XGB(position,position2,column_list,predlength):
    if(position in ["GC","CBI"]):
        return 0
    data,target_value,test_columns=XGB_Make_dataset(position,position2)
    pred=XGB_Make_Pred(data,target_value,position2,column_list,predlength,position,test_columns)
    return pred
def Generate_LSTM_preds(pred,column_list,predlength):
    if(pred in ["GC","Fantasy","bps","CBI"]):
        return 0
    data=pd.read_csv("Player_Prediction_set.csv").iloc[:,1:]
    data2=pd.read_csv("ML_training2.csv").iloc[:,1:]
    data2["opposition_xg"] = data2.apply(lambda row: row[22] if row[18] else row[20], axis=1)
    data2["opposition_xgc"] = data2.apply(lambda row: row[23] if row[18] else row[21], axis=1)
    data["opposition_xg"]=data["played_XG"].values
    data["opposition_xgc"]=data["played_XGC"].values

    if(pred=="GOALS"):
        features=["opposition_xgc","Own_Attacking_form","XG_slope","rolling_shots",
              "minutes","rolling_Threat","rolling_XG_historic","Rolling_adjusted_XG2","Rolling_adjusted_XG_form","Cluster_XG"]
        features_test=["opposition_xgc","Own_Attacking_form","XG_slope","rolling_shots",
              "minutes","rolling_Threat","rolling_XG_historic","Rolling_adjusted_XG","Rolling_adjusted_XG_form","Cluster_XG"]
        target="expected_goals"
        model_path="DNN_XG.pt"
        
    if(pred=="Assist"):
        features=["opposition_xgc",
               "Own_Attacking_form","Rolling_creativity", "Rolling_adjusted_XA2","Cluster",
               "rolling_XA_historic","minutes","rolling_key_passes","XA_slope"]
        features_test=["opposition_xgc",
               "Own_Attacking_form","Rolling_creativity", "Rolling_adjusted_XA","Cluster",
               "rolling_XA_historic","minutes","rolling_key_passes","XA_slope"]
        target="expected_assists"
        model_path="DNN_XA.pt"

    scaler_data=data2[features]
    scaler = StandardScaler()
    train_df_scaled = scaler.fit_transform(scaler_data)
    
    
    unique_players=data["name"].unique()
    
    column_list = ["Name", "pred", "position", "GW","opp_stat" ]


    """model = DeepNN(input_dim)
    model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))  # use 'cuda' if on GPU
    model.eval()"""
    try:
        model = torch.load(model_path, map_location=torch.device('cpu'))
    except:
        input_dim = len(features)  # or features_test if needed
        model = DeepNN(input_dim)
        model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
    model.eval()
    total_preds=[]

    for k in range(len(unique_players)):
        pred_player_df=[]
        player_name=unique_players[k]
        df=data[data["name"]==unique_players[k]]
        test_data=df[features_test].copy()
        test_data.columns = scaler_data.columns

        for g in range(len(test_data)):
            preds=[]
            row=test_data.iloc[[g]]
            row2=df.iloc[[g]]
            preds.append(player_name)
            position=row2["position"].values[0]
            gw=row2["GW"].values[0]
            val_series_scaled = scaler.transform(row)
            X_val_tensor = torch.tensor(val_series_scaled, dtype=torch.float32)
            with torch.no_grad():
                predictions = model(X_val_tensor).numpy().flatten()
            preds.append(predictions[0])
            preds.append(position)
            preds.append(gw)
            preds.append(row2["played_XGC"].values[0])

            total_preds.append(preds)
            
    pred_all_players=pd.DataFrame(total_preds,columns=column_list)

    pred_all_players.to_csv(f"DNN_{pred}.csv") 
    
def Generate_point_predictions():
    players=pd.read_csv("Player_prediction_set.csv").iloc[:,1:]
    unique_players=players["name"].unique()
    xgb_goals = Get_rows("XGB", "GOALS").sort_values(by=["GW", "opp_stat"])
    stat_goals = Get_rows("STAT", "GOALS").sort_values(by=["GW", "opp_stat"])
    DNN_goals = Get_rows("DNN", "GOALS").sort_values(by=["GW", "opp_stat"])

    xgb_assist = Get_rows("XGB", "Assist").sort_values(by=["GW", "opp_stat"])
    stat_assist = Get_rows("STAT", "Assist").sort_values(by=["GW", "opp_stat"])
    DNN_assist = Get_rows("DNN", "Assist").sort_values(by=["GW", "opp_stat"])

    xgb_bps = Get_rows("XGB", "bps").sort_values(by=["GW", "opp_stat"])
    stat_bps = Get_rows("STAT", "bps").sort_values(by=["GW", "opp_stat"])

    stat_GC = Get_rows("STAT", "GC").sort_values(by=["GW", "opp_stat"])

    xgb_fantasy= Get_rows("XGB", "Fantasy").sort_values(by=["GW", "opp_stat"])
    
    stat_cbi= Get_rows("STAT", "CBI").sort_values(by=["GW", "opp_stat"])




    
    full_df=pd.DataFrame()
    for j in range(len(unique_players)):
        player=unique_players[j]
        player_data=players[players["name"]==player].sort_values(by=["GW", "played_XGC"])
        position=player_data["position"].values[0]
        model_list=["STAT", "DNN", "XGB"]
        positions=["GOALS", "Assist","GC","bps","Fantasy"]
        
        xgb_goals_player = xgb_goals[xgb_goals["Name"]==player].sort_values(by=["GW", "opp_stat"])
        stat_goals_player = stat_goals[stat_goals["Name"]==player].sort_values(by=["GW", "opp_stat"])
        DNN_goals_player = DNN_goals[DNN_goals["Name"]==player].sort_values(by=["GW", "opp_stat"])

        xgb_assist_player = xgb_assist[xgb_assist["Name"]==player].sort_values(by=["GW", "opp_stat"])
        stat_assist_player = stat_assist[stat_assist["Name"]==player].sort_values(by=["GW", "opp_stat"])
        DNN_assist_player = DNN_assist[DNN_assist["Name"]==player].sort_values(by=["GW", "opp_stat"])

        xgb_bps_player = xgb_bps[xgb_bps["Name"]==player].sort_values(by=["GW", "opp_stat"])
        stat_bps_player = stat_bps[stat_bps["Name"]==player].sort_values(by=["GW", "opp_stat"])

        stat_GC_player = stat_GC[stat_GC["Name"]==player].sort_values(by=["GW", "opp_stat"])

        xgb_fantasy_player= xgb_fantasy[xgb_fantasy["Name"]==player].sort_values(by=["GW", "opp_stat"])
        
        stat_cbi_player= stat_cbi[stat_cbi["Name"]==player].sort_values(by=["GW", "opp_stat"])

        overscore=max(0.9,player_data["Average_Overscore"].values[0])
        overscore=min(1.4,overscore)

        overassist=max(0.9,player_data["Average_OverAssist"].values[0])
        overassist=min(1.7,overassist)
        
        historic_xg=player_data["rolling_XG_historic"].values[0]
        historic_xa=player_data["rolling_XA_historic"].values[0]


        goals=[]
        assist=[]
        bps=[]
        gc=[]
        fantasy=[]
        cbi=[]

        for i in range(len(player_data)):
            try:
                goals.append(((xgb_goals_player["pred"].values[i]*0.2
                         +stat_goals_player["pred"].values[i]*0.5
                         +DNN_goals_player["pred"].values[i]*0.3)*0.7+0.3*historic_xg)*overscore)
            except:
                goals.append(0)

            try:

                assist.append(((xgb_assist_player["pred"].values[i]*0.2
                                    +stat_assist_player["pred"].values[i]*0.5
                                    +DNN_assist_player["pred"].values[i]*0.3)*0.7+0.3*historic_xa)*overassist)
            except:
                assist.append(0)

            try:

                bps.append((xgb_bps_player["pred"].values[i]*0.2
                                   +stat_bps_player["pred"].values[i]*0.8)*0.8)
            except:
                bps.append(0)

            try:
                gc.append(stat_GC_player["pred"].values[i])
            except:
                gc.append(0)
                
            try:
                cbi.append(stat_cbi_player["pred"].values[i])
            except:
                cbi.append(0)
                
            try:

                fantasy.append(xgb_fantasy_player["pred"].values[i])
            except:
                fantasy.append(0)

        columns_to_include=["name","position", "GW","Rolling_adjusted_BPS", "Rolling_adjusted_XG", "Rolling_adjusted_XA","played_XGC","average_minutes"]
            
        New_dataset=player_data[columns_to_include]
        New_dataset["Goal_pred"]=goals
        
        New_dataset["Assist_pred"]=assist
        
        New_dataset["Bonus_pred"]=bps
        
        New_dataset["GC_pred"]=gc
        New_dataset["Fantasy_pred"]=fantasy
        New_dataset["CBI_pred"]=cbi
        

        summary_dataset = New_dataset.groupby(columns_to_include)[["Goal_pred", "Assist_pred", "Bonus_pred", "GC_pred", "Fantasy_pred", "CBI_pred"]].sum().reset_index()
        summary_dataset["Average_Overscore"]=player_data["Average_Overscore"].values[0]
        summary_dataset = summary_dataset.fillna(0)
        if(New_dataset["name"].values[0]=='Matheus_Santos Carneiro da Cunha'):
            summary_dataset.to_csv("debug2.csv")
            New_dataset.to_csv("debug1.csv")
        if(position=="FWD"):
            summary_dataset["Points_prediction"]=(2+summary_dataset["Goal_pred"]*5
                                                  +summary_dataset["Assist_pred"]*3
                                                  +summary_dataset["Bonus_pred"])*0.8+0.2*summary_dataset["Fantasy_pred"]+(summary_dataset["CBI_pred"]/12)*0.7*2
        elif(position=="MID"):
            summary_dataset["Points_prediction"]=(2+summary_dataset["Goal_pred"]*5.5
                                                  +summary_dataset["Assist_pred"]*3
                                                  +summary_dataset["Bonus_pred"]
                                                  +summary_dataset["GC_pred"])*0.8+0.2*summary_dataset["Fantasy_pred"]+(summary_dataset["CBI_pred"]/12)*0.7*2
            
        elif(position=="GKP"):
            summary_dataset["Points_prediction"]=(2
                                                  +summary_dataset["Bonus_pred"]
                                                  +summary_dataset["GC_pred"]*4.5)*0.8+0.2*summary_dataset["Fantasy_pred"]

        else:
            summary_dataset["Points_prediction"]=(1+summary_dataset["Goal_pred"]*6
                                                  +summary_dataset["Assist_pred"]*3
                                                  +summary_dataset["Bonus_pred"]
                                                  +summary_dataset["GC_pred"]*4.5)*0.8+0.2*summary_dataset["Fantasy_pred"]+(summary_dataset["CBI_pred"]/10)*0.7*2
        
        
        full_df=pd.concat([full_df, summary_dataset], axis=0, ignore_index=True)
    full_df.to_csv("Model_Predictions.csv")

def Get_rows(model, metric):
    string=model+"_"+metric+".csv"
    file=pd.read_csv(string)
    return file
   

def Make_Predictions ():
    predlength=2
    is_pred=1
    column_list = []
    column_list.append("Name")
    for k in range(predlength):
        column_list.append(f"p{k+1}")
    column_list.append("position")
    positions=["GOALS", "Assist","GC","bps","Fantasy","CBI"]
    for y in range(len(positions)):
        XGB_pred=pd.DataFrame()
        position_filter=positions[y]
        Stat_preds(is_pred, position_filter,column_list,predlength)

        pred2=XGB(position_filter,"FWD",column_list,predlength)        
        Generate_LSTM_preds(position_filter,column_list,predlength)






if __name__ == '__main__':
    Make_Predictions()
#0.0306
#0.0924