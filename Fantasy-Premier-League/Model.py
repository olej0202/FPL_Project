    
    
    
import sys
import os

package_path="C:\\Users\OleJacobSimensen\\OneDrive - twoday\\Documents\\Python_test\\pytorch-forecasting"

# Check if the directory exists
if os.path.exists(package_path):
    # Add the package path to sys.path
    sys.path.append(package_path)
import numpy as np
import xgboost as xgb
import pandas as pd
from pytorch_forecasting.data.encoders import NaNLabelEncoder
import lightning.pytorch as pl
from pytorch_forecasting import Baseline, TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data import GroupNormalizer,TorchNormalizer
from pytorch_forecasting.metrics import MAE, SMAPE, PoissonLoss, QuantileLoss,MultiHorizonMetric,RMSE
from pytorch_forecasting.models.temporal_fusion_transformer.tuning import optimize_hyperparameters
from lightning.pytorch.callbacks import EarlyStopping, LearningRateMonitor
from lightning.pytorch.loggers import TensorBoardLogger
from lightning.pytorch import Trainer, seed_everything
from sklearn.preprocessing import StandardScaler
import torch
import torch.nn as nn
import torch.nn as nn
from datetime import datetime, timedelta
import pytz
criterion = nn.L1Loss()
df=pd.read_csv("testML.csv").iloc[:,1:]
max_t=df['time'].max()
print(max_t)
names= df['name'].unique()
print(names)
time_df=pd.DataFrame()
for i in range(len(names)):
    name=names[i]
    first_filtered= df[df['name'] == name]
    unique_teamvals= first_filtered['Team'].unique()
    for t in range(len(unique_teamvals)):
        team=unique_teamvals[t]
        new_filtered= first_filtered[first_filtered['Team'] == team]
        unique_pos=new_filtered['position'].unique()
        for u in range(len(unique_pos)):
            times=[]
            pos=unique_pos[u]
            pos_filter=new_filtered[new_filtered['position'] == pos]
            filtered = pos_filter[pos_filter["minutes"] > 0]
            for g in range(len(filtered)):
                times.append(max_t-g)
            times.reverse()
            filtered["time"]=times
            if(len(unique_teamvals)>1):
                filtered['name']=filtered['name'].values[0]+str(t)
            time_df=pd.concat([time_df, filtered], axis=0, ignore_index=True)
time_df.to_csv("ML_training2.csv")


def Make_TFT_Train(position,pred, pred_length, position_dict,position2):
    print(position)
    offset=0
    if pred:
        lb1=10+offset
        lb2=5+offset
        lb3=0+offset
    else:
        print('training')
        lb1=15
        lb2=10
        lb3=5
                 
    df=pd.read_csv("ML_training2.csv").iloc[:,1:]
    opp_xg = df.apply(lambda row: row[22] if row[18] else row[20], axis=1)
    opp_xgc = df.apply(lambda row: row[23] if row[18] else row[21], axis=1)
    df["opposition_xg"]=opp_xg
    df["opposition_xgc"]=opp_xgc
    df["Team"]=df["Team"].astype(str)
    df["element"]=df["element"].astype(str)
    df["Cluster"]=df["Cluster"].astype(str)
    df["was_home"]=df["was_home"].astype(str)
    df["gamepos"]=df["gamepos"].astype(str)
    df["season"]=df["season"].astype(str)
    df.replace([np.inf, -np.inf], 1, inplace=True)
    df["Own_cluster"]=df["Own_cluster"].astype(str)
    df['Capped_Average_Overscore'] = np.clip(df['Average_Overscore'], None, 1.5)
    df['Future_XG'] = df['Rolling_adjusted_XG2']*df['opposition_xgc']*df['Capped_Average_Overscore']
    df['Future_XGC'] = df['Rolling_adjusted_XGC2']*df['opposition_xg']
    df['Future_XGA'] = df['Rolling_adjusted_XA2']*df['opposition_xgc']
    
    unknown=["assists", "bps","clean_sheets", "expected_assists","expected_goals","expected_goals_conceded","total_points","minutes","expected_goals","rolling_form" ]
    knowncat=["Cluster","was_home","gamepos","season"]
    knowncont=["opposition_xg","opposition_xgc",]
    static=["name","Own_cluster"]
    if(position=="GOALS"):
        unknown=["expected_goals","Rolling_adjusted_XG","rolling_GS_historic","rolling_XG_historic","rolling_GS","rolling_shots"]
        #unknown=["expected_goals","Rolling_adjusted_XG","rolling_XG_historic","rolling_XG"]
        knowncat=["Cluster","was_home"]
        knowncont=["opposition_xgc","Future_XG","minutes","Own_Attacking_form"]
        static=["Own_cluster","position"]
        static_reals=[]
        pred_variable="expected_goals"

    if(position=="Assist"):
        unknown=["expected_assists","Rolling_adjusted_XA","rolling_XA_historic","rolling_Assist_historic","rolling_Assist","rolling_key_passes"]
        #unknown=["expected_assists","Rolling_adjusted_XA","rolling_XA_historic","rolling_XA"]
        knowncat=["Cluster","was_home"]
        knowncont=["opposition_xgc","Future_XGA","minutes","Own_Attacking_form"]
        static=["Own_cluster","position"]
        static_reals=[]
        pred_variable="expected_assists"

    if(position=="GC"):
        unknown=["expected_goals_conceded","Rolling_adjusted_XGC","rolling_XGC_historic","rolling_GC_historic","rolling_GC"]
        #unknown=["expected_goals_conceded","Rolling_adjusted_XGC","rolling_XGC_historic"]
        knowncat=["Cluster","was_home"]
        knowncont=["opposition_xg","Future_XGC","minutes"]
        static=["Own_cluster"]
        static_reals=[]
        pred_variable="expected_goals_conceded"
        df=df[df['position'] == "DEF"]
        
    if(position=="bps"):
        unknown=["rolling_bps_historic","rolling_bonus_historic","rolling_bonus","rolling_bps","bonus"]
        knowncat=["Cluster","was_home"]
        knowncont=["opposition_xg","opposition_xgc","minutes","Future_XGC","Future_XG","Future_XGA","Own_Attacking_form"]
        static=["Own_cluster","position"]
        static_reals=[]
        pred_variable="bonus"

        
    df['Overscore'] = df['Overscore'].fillna(0.8)
    df['Average_Overscore'] = df['Average_Overscore'].fillna(0.8)
    df['Rolling_adjusted_XGC2'] = df['Rolling_adjusted_XGC2'].fillna(1)
    df['Rolling_adjusted_XGC'] = df['Rolling_adjusted_XGC'].fillna(1.3)
    df['Rolling_adjusted_XG2'] = df['Rolling_adjusted_XG2'].fillna(0.3)
    df['Rolling_adjusted_XG'] = df['Rolling_adjusted_XG'].fillna(0.2)
    df['Rolling_adjusted_XA'] = df['Rolling_adjusted_XA'].fillna(0.2)
    df['rolling_shots'] = df['rolling_shots'].fillna(2)
    df['rolling_key_passes'] = df['rolling_key_passes'].fillna(0.1)
    df['Future_XG'] = df['Future_XG'].fillna(0)
    df['Future_XGC'] = df['Future_XGC'].fillna(0)
    df['Future_XGA'] = df['Future_XGA'].fillna(0)
    df['Own_Attacking_form'] = df['Own_Attacking_form'].fillna(1.3)
    X_train=pd.DataFrame()
    names= df['name'].unique()
    """ENDRING"""
    #df=df[df['position'] == position2]
    for i in range(len(names)):
        name=names[i]
        filtered= df[df['name'] == name]
        training_cutoff = filtered["time"].max() - lb1

        name_df=filtered[lambda x: x.time <= training_cutoff]
        X_train=pd.concat([X_train, name_df], axis=0, ignore_index=True)
        
    scalers = {}    
    for feature in unknown:
        if feature != pred_variable:
            scaler = StandardScaler()
            X_train[feature] = scaler.fit_transform(X_train[[feature]])
            scalers[feature] = scaler
    
    for feature in knowncont:
        scaler = StandardScaler()
        X_train[feature] = scaler.fit_transform(X_train[[feature]])
        scalers[feature] = scaler 
    full=['Kai_Havertz1','Ollie_Watkins','Antoine_Semenyo','Bryan_Mbeumo','João Pedro_Junqueira de Jesus','Danny_Welbeck','Nicolas_Jackson','Jean-Philippe_Mateta','Dominic_Calvert-Lewin','Diogo_Teixeira da Silva'
      ,'Erling_Haaland','Alexander_Isak','Chris_Wood','Matheus_Santos Carneiro Da Cunha','Dominic_Solanke','Gabriel_dos Santos Magalhães','William_Saliba','Lucas_Digne','Ezri_Konsa Ngoyo','Lewis_Dunk','Levi_Colwill0','Antonee_Robinson','Trent_Alexander-Arnold','Andrew_Robertson',
      'Joško_Gvardiol','Rico_Lewis','Diogo_Dalot Teixeira','Dan_Burn','Pedro_Porro','Rayan_Aït-Nouri','Kai_Havertz0','Gabriel_Martinelli Silva','Bukayo_Saka','Martin_Ødegaard','Morgan_Rogers','Antoine_Semenyo','Marcus_Tavernier','Bryan_Mbeumo','Noni_Madueke',
      'Cole_Palmer0','Eberechi_Eze','Dwight_McNeil','Diogo_Teixeira da Silva','Luis_Díaz','Mohamed_Salah','Phil_Foden','Bruno_Borges Fernandes','Marcus_Rashford','Harvey_Barnes1','Anthony_Gordon0',
      'Morgan_Gibbs-White0','Brennan_Johnson0','Dejan_Kulusevski','James_Maddison1','Jarrod_Bowen']
    extra=X_train[X_train['name'].isin(full)]
    extra['name']=extra['name']+'r'
    X_train=pd.concat([X_train, extra], axis=0, ignore_index=True)
    
    X_test=pd.DataFrame()
    for i in range(len(names)):
        name=names[i]
        filtered= df[df['name'] == name]
        training_cutoff = filtered["time"].max() - lb2
        name_df=filtered[lambda x: x.time <= training_cutoff]
        X_test=pd.concat([X_test, name_df], axis=0, ignore_index=True)
        
    for feature, scaler in scalers.items():
        X_test[feature] = scaler.transform(X_test[[feature]])
        
    df2=pd.DataFrame()
    for i in range(len(names)):
        name=names[i]
        filtered= df[df['name'] == name]
        training_cutoff = filtered["time"].max() - lb3
        name_df=filtered[lambda x: x.time <= training_cutoff]
        df2=pd.concat([df2, name_df], axis=0, ignore_index=True)
    for feature, scaler in scalers.items():
        df2[feature] = scaler.transform(df2[[feature]])
    max_prediction_length = pred_length
    max_encoder_length = position_dict["lookb"]

    training = TimeSeriesDataSet(
        X_train,
        time_idx="time",
        target=pred_variable,
        group_ids=["name"],  # keep encoder length long (as it is in the validation set)
        max_encoder_length=max_encoder_length,
        min_encoder_length=max_encoder_length,
        static_categoricals=static,
        static_reals=static_reals,
        allow_missing_timesteps=True,
        min_prediction_length=1,
        max_prediction_length=max_prediction_length,
        time_varying_known_categoricals=knowncat,
        time_varying_known_reals=knowncont,
        time_varying_unknown_reals=unknown,
        target_normalizer=TorchNormalizer(),
        categorical_encoders={
            "gamepos": NaNLabelEncoder(add_nan=True),  # Handle unknown categories
            "name" : NaNLabelEncoder(add_nan=True)
        },
        add_relative_time_idx=True,
        #add_target_scales=True,
        #add_encoder_length=True,
    )

    validation = TimeSeriesDataSet.from_dataset(training, X_test, predict=True, stop_randomization=True)

    batch_size = 64 # set this between 32 to 128
    train_dataloader = training.to_dataloader(train=True, batch_size=batch_size, num_workers=10,persistent_workers=True)
    val_dataloader = validation.to_dataloader(train=False, batch_size=8, num_workers=10,persistent_workers=True)
    return train_dataloader, val_dataloader,df2,training,static,knowncat,knowncont,unknown,static_reals,pred_variable    
def Train_TFT(Train_dataloader, val_dateloader, training, paramlist,position,position2):

    early_stop_callback = EarlyStopping(monitor="val_loss", min_delta=1e-6, patience=2, verbose=False, mode="min")
    lr_logger = LearningRateMonitor()  # log the learning rate
    logger = TensorBoardLogger("lightning_logs")  # logging results to a tensorboard
    #seed_everything(paramlist["Seed"], workers=True)
    
    q=[0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98]
    trainer = pl.Trainer(
        max_epochs=15,
        enable_model_summary=True,
        gradient_clip_val=0.1,
        callbacks=[early_stop_callback, lr_logger]  # Add callbacks here
    )

    tft = TemporalFusionTransformer.from_dataset(
        training,
        learning_rate=paramlist["LR"],
        hidden_size=paramlist["HS"],
        attention_head_size=paramlist["AH"],
        dropout=paramlist["DO"],
        hidden_continuous_size=paramlist["HCS"],
        loss=RMSE(),
        #log_interval=10,  # uncomment for learning rate finder and otherwise, e.g. to 10 for logging every 10 batches
        optimizer="Ranger",
        lstm_layers=1,
        reduce_on_plateau_patience=10,
    )
    print(position)
    trainer.fit(
        tft,
        train_dataloaders=Train_dataloader,
        val_dataloaders=val_dateloader)
    torch.save(tft.state_dict(), f'TFT_{position}_.pth')
    """if(position2=="FWD"):
        torch.save(tft.state_dict(), f'TFT_{position}_FWD.pth')
    if(position2=="DEF"):
        torch.save(tft.state_dict(), f'TFT_{position}_DEF.pth')
    if(position2=="MID"):
        torch.save(tft.state_dict(), f'TFT_{position}_MID.pth')"""
    """if(position=="Assist" or position=="GOALS" or position=="bps"):
        if(position2=="MID"):
            checkpoint = torch.load(f'TFT_{position}_MID.pth')
            tft.load_state_dict(checkpoint)
            tft.eval()

        if(position2=="FWD"):
            checkpoint = torch.load(f'TFT_{position}_FWD.pth')
            tft.load_state_dict(checkpoint)
            tft.eval()
        elif(position2=="DEF"):
            checkpoint = torch.load(f'TFT_{position}_DEF.pth')
            tft.load_state_dict(checkpoint)
            tft.eval()
    elif(position=="GC"):
        if(position2=="DEF"):
            trainer.fit(
            tft,
            train_dataloaders=Train_dataloader,
            val_dataloaders=val_dateloader)
            torch.save(tft.state_dict(), f'TFT_{position}_DEF.pth')
            
            #checkpoint = torch.load(f'TFT_{position}_DEF.pth')
            #tft.load_state_dict(checkpoint)
            #tft.eval()
    else:
        trainer.fit(
            tft,
            train_dataloaders=Train_dataloader,
            val_dataloaders=val_dateloader)"""
    """checkpoint = torch.load(f'TFT_{position}_.pth')
    tft.load_state_dict(checkpoint)
    tft.eval()"""
    
    return tft
    
def TFT_predset(filtered_df,ki,static,knowncat,knowncont,unknown,static_reals,pred_variable):
    max_prediction_length = 5
    max_encoder_length = ki
    training = TimeSeriesDataSet(
        filtered_df,
        time_idx="time",
        target=pred_variable,
        group_ids=["name"],  # keep encoder length long (as it is in the validation set)
        max_encoder_length=max_encoder_length,
        min_encoder_length=5,
        static_categoricals=static,
        static_reals=static_reals,
        allow_missing_timesteps=True,
        time_varying_known_reals=knowncont,
        min_prediction_length=max_prediction_length,
        max_prediction_length=max_prediction_length,
        time_varying_known_categoricals=knowncat,
        time_varying_unknown_reals=unknown,
        categorical_encoders={
            "gamepos": NaNLabelEncoder(add_nan=True),  # Handle unknown categories
            "name" : NaNLabelEncoder(add_nan=True)
        },
        target_normalizer=TorchNormalizer(),
        #add_relative_time_idx=True,
        predict_mode=True,
        #add_target_scales=True,
        add_relative_time_idx=True,
    )

    validation = TimeSeriesDataSet.from_dataset(training, filtered_df, predict=True, stop_randomization=True)
    batch_size = 1 # set this between 32 to 128
    val_dataloader = validation.to_dataloader(train=False, batch_size=batch_size, num_workers=8,persistent_workers=True)
    return val_dataloader
    
    
        
def TFT_Generate_predictions(df2,static,knowncat,knowncont,unknown, params, tft,static_reals,pred_variable,position2):
    player_list= df2['name'].unique()

    player_preds=[]
    MSE_preds=[]
    MSE_real=[]
    for i in range (len(player_list)):
        preds_list=[]
        player=player_list[i]
        print(player)
        preds_list.append(player)
        filtered_df = df[df['name'].isin(preds_list)]
        filtered_df=df2[df2["name"].isin(preds_list)]
        season_filter=filtered_df[(filtered_df['season'] == '25')]
        if(len(season_filter)<1):
            continue
        if(pred_variable=="expected_goals_conceded"):
            team=filtered_df['Team'].values[-1]
            time_filter = df2[(df2['season'] == '25')]
            team_filter=time_filter[time_filter["Team"]==team]
            if(len(team_filter)<1):
                continue
            else:
                player_with_most_minutes = team_filter.loc[team_filter['minutes'].idxmax(), 'name']
                print("Name")
                print(player_with_most_minutes)
                filtered_df=df2[df2["name"]==player_with_most_minutes]
        if(len(filtered_df)<10):
            continue
        lookb=params["lookb"]
        val_dataloader=TFT_predset(filtered_df,lookb,static,knowncat,knowncont,unknown,static_reals,pred_variable)
        raw_predictions =tft.predict(val_dataloader, mode="raw", return_x=True)
        idx=0
        if(len(raw_predictions[1]['decoder_time_idx'])>1 and raw_predictions[1]['decoder_time_idx'][0][0]<raw_predictions[1]['decoder_time_idx'][1][0] ):
            idx=1
        for t in range (len(raw_predictions[1]['decoder_target'][idx])):
            MSE_real.append(raw_predictions[1]['decoder_target'][idx][t])
        preds=raw_predictions[0][0][idx]
        for j in range(len(preds)):
            preds_list.append(preds[j][0].item())
            MSE_preds.append(preds[j][0].item())
        for k in range(len(preds)):
            preds_list.append(raw_predictions[1]['decoder_target'][idx][k].item())
        preds_list.append(filtered_df["position"].values[0])
        player_preds.append(preds_list)
        print(preds_list)
    print(criterion(torch.tensor(MSE_preds), torch.tensor(MSE_real)))
    columns=["Name","p1","p2","p3","p4","p5","top1","top2","top3","top4","top5","position"]
    data_f=pd.DataFrame(player_preds, columns=columns)
    return data_f,raw_predictions    
def Make_TFT_Predictions(position,pred_length, position_index,pred,position2):
    position_params={}
    paramslist=[[5,5,5,5], [1,1,1,1],[20,20,20,20], [4,4,4,4], [0.01, 0.01,0.01,0.01], [0.2,0.2,0.2,0.1],[33,33,32,33]]
    position_params["lookb"]=paramslist[0][position_index]
    position_params["AH"]=paramslist[1][position_index]
    position_params["HS"]=paramslist[2][position_index]
    position_params["HCS"]=paramslist[3][position_index]
    position_params["LR"]=paramslist[4][position_index]
    position_params["DO"]=paramslist[5][position_index]
    position_params["Seed"]=paramslist[6][position_index]
    cutoff=15
    Pred_df=pd.DataFrame
    for i in range(1):
        train_dataloader, val_dataloader,df2, training,static,knowncat,knowncont,unknown,static_reals,pred_variable=Make_TFT_Train(position,pred, pred_length, position_params,position2)
        tft=Train_TFT(train_dataloader, val_dataloader, training, position_params,position,position2)
        preds,raw_predictions=TFT_Generate_predictions(df2,static,knowncat,knowncont,unknown,position_params,tft,static_reals,pred_variable,position2)
        cutoff-=1
    interpretation = tft.interpret_output(raw_predictions.output, reduction="mean")
    tft.plot_interpretation(interpretation)
    return preds

def XGB_Make_dataset(position,position2):
    df=pd.read_csv("ML_training2.csv").iloc[:,1:]
    #df=df[df['position'] == position2]


    opp_xg = df.apply(lambda row: row[22] if row[18] else row[20], axis=1)
    opp_xgc = df.apply(lambda row: row[23] if row[18] else row[21], axis=1)

    df["opposition_xg"]=opp_xg
    df["opposition_xgc"]=opp_xgc

    trainingdf=df[["minutes","season","opposition_xg","Average_Overscore","opposition_xgc", "rolling_form","rolling_XG","Team","name","position","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GS","rolling_GC","rolling_XA","time","gamepos","rolling_ICT","Overscore","XGC_DEF","XGC_FWD","XGC_MID"
                   ,"Rolling_adjusted_XG2","Rolling_adjusted_XGC2","Rolling_adjusted_XA2","rolling_GS_historic","rolling_XG_historic","goals_scored","expected_goals"
                  ,"assists","rolling_Assist_historic","rolling_Assist","rolling_XA_historic","expected_assists","rolling_GC_historic","rolling_XGC_historic","clean_sheets",
                   "expected_goals_conceded", "rolling_bps","rolling_bps_historic","rolling_bonus_historic","rolling_bonus","bonus","rolling_key_passes","rolling_shots","Own_Attacking_form"]]
    
        
    names= df['name'].unique()
    time_df=pd.DataFrame()
    for i in range(len(names)):
        times=[]
        name=names[i]
        filtered= trainingdf[trainingdf['name'] == name]
        filtered['rolling_form'] = filtered['rolling_form'].shift(1)
        filtered['rolling_XG'] = filtered['rolling_XG'].shift(1)
        filtered['rolling_GS'] = filtered['rolling_GS'].shift(1)
        filtered['rolling_GC'] = filtered['rolling_GC'].shift(1)
        filtered['rolling_XA'] = filtered['rolling_XA'].shift(1)
        filtered['rolling_ICT'] = filtered['rolling_ICT'].shift(1)
        filtered['rolling_GS_historic'] = filtered['rolling_GS_historic'].shift(1)
        filtered['rolling_XG_historic'] = filtered['rolling_XG_historic'].shift(1)
        filtered['rolling_XA_historic'] = filtered['rolling_XA_historic'].shift(1)
        filtered['rolling_Assist'] = filtered['rolling_Assist'].shift(1)
        filtered['rolling_Assist_historic'] = filtered['rolling_Assist_historic'].shift(1)
        filtered['rolling_key_passes'] = filtered['rolling_key_passes'].shift(1)
        filtered['rolling_shots'] = filtered['rolling_shots'].shift(1)
        filtered['rolling_bonus'] = filtered['rolling_bonus'].shift(1)
        filtered['rolling_bps'] = filtered['rolling_bps'].shift(1)
        #filtered['Rolling_adjusted_XGC'] = filtered['Rolling_adjusted_XGC'].shift(1)
        #filtered['Rolling_adjusted_XG'] = filtered['Rolling_adjusted_XG'].shift(1)
        filtered['Overscore'] = filtered['Overscore'].shift(1)
        filtered['Capped_Average_Overscore'] = np.clip(df['Average_Overscore'], None, 1.5)
        filtered['Future_XG'] = filtered['Rolling_adjusted_XG2']*filtered['opposition_xgc']*filtered['Capped_Average_Overscore']
        filtered['Future_XGC'] = filtered['Rolling_adjusted_XGC2']*filtered['opposition_xg']
        filtered['Future_XGA'] = filtered['Rolling_adjusted_XA2']*filtered['opposition_xgc']

        time_df=pd.concat([time_df, filtered], axis=0, ignore_index=True)
    
    
    trainingdf=time_df

    trainingdf['Team'] = trainingdf['Team'].astype('category')
    trainingdf['name'] = trainingdf['name'].astype('category')
    trainingdf['position'] = trainingdf['position'].astype('category')
    trainingdf['gamepos'] = trainingdf['gamepos'].astype('category')
    trainingdf.replace([np.inf, -np.inf], 1, inplace=True)
    if(position=='GOALS'):
        trainingdf=trainingdf[["position","opposition_xgc","Own_Attacking_form","Rolling_adjusted_XG2","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","Future_XG","rolling_XG_historic","expected_goals","season","rolling_shots","rolling_GS","rolling_GS_historic"]]
        target_value="expected_goals"
        
    elif(position=='Assist'):
        trainingdf=trainingdf[["position","opposition_xgc","Own_Attacking_form","Rolling_adjusted_XA2","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","Future_XGA","rolling_XA_historic","expected_assists","season","rolling_key_passes","rolling_Assist_historic","rolling_Assist"]]
        target_value="expected_assists"
        
    elif(position=='GC'):
        trainingdf=trainingdf[trainingdf['position'] == "DEF"]
        trainingdf=trainingdf[["position","opposition_xg","Rolling_adjusted_XGC2","Team","name","Own_cluster","Cluster"
                   ,"was_home","rolling_GC","time","minutes","Future_XGC","rolling_GC_historic","rolling_XGC_historic","expected_goals_conceded","season"]]
        target_value="expected_goals_conceded"
        
    elif(position=='bps'):
        trainingdf=trainingdf[["position","opposition_xg","Own_Attacking_form","rolling_bps","rolling_bps_historic","rolling_bonus_historic","rolling_bonus","bonus","Team","name","Own_cluster","Cluster"
                   ,"was_home","time","minutes","season","Future_XG","Future_XGA","Future_XGC"]]
        target_value="bonus"
    elif(position=='GK'):
        trainingdf=trainingdf[["opposition_xg","Team","name","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GC","time","gamepos"]]
    else:
        trainingdf=trainingdf[["opposition_xgc", "rolling_form","rolling_XG","Team","name","Own_cluster","Cluster"
                   ,"was_home","total_points","rolling_GS","rolling_XA","time","gamepos",'Future_XG',"Future_XGA"]]
    trainingdf.to_csv("xgb_test_data.csv")
    print(target_value)
    return trainingdf,target_value
def XGB_Train(rounds, eta,max_depth,gamma,min_c,dtrain ):
    params = {
        'max_depth': max_depth,
        'eta': eta,
        'objective': 'reg:squarederror',  # Use 'reg:squarederror' for regression
        'eval_metric': 'rmse',             # Use 'rmse' (root mean squared error) for evaluation
        'tree_method':'hist',
        'grow_policy': 'lossguide',
        'gamma':gamma,
        'min_child_weight': min_c
    }

    num_rounds = rounds
    xgb_model = xgb.train(params, dtrain, num_rounds)
    return xgb_model
def XGB_Make_Pred(trainingdf,target_value,position2):
    X_train=pd.DataFrame()
    names= trainingdf['name'].unique()


    for i in range(len(names)):
        name=names[i]
        filtered= trainingdf[trainingdf['name'] == name]
        training_cutoff = filtered["time"].max() - 10

        name_df=filtered[lambda x: x.time <= training_cutoff]
        X_train=pd.concat([X_train, name_df], axis=0, ignore_index=True)
           
      full=['Kai_Havertz1','Ollie_Watkins','Antoine_Semenyo','Bryan_Mbeumo','João Pedro_Junqueira de Jesus','Danny_Welbeck','Nicolas_Jackson','Jean-Philippe_Mateta','Dominic_Calvert-Lewin','Diogo_Teixeira da Silva'
      ,'Erling_Haaland','Alexander_Isak','Chris_Wood','Matheus_Santos Carneiro Da Cunha','Dominic_Solanke','Gabriel_dos Santos Magalhães','William_Saliba','Lucas_Digne','Ezri_Konsa Ngoyo','Lewis_Dunk','Levi_Colwill0','Antonee_Robinson','Trent_Alexander-Arnold','Andrew_Robertson',
      'Joško_Gvardiol','Rico_Lewis','Diogo_Dalot Teixeira','Dan_Burn','Pedro_Porro','Rayan_Aït-Nouri','Kai_Havertz0','Gabriel_Martinelli Silva','Bukayo_Saka','Martin_Ødegaard','Morgan_Rogers','Antoine_Semenyo','Marcus_Tavernier','Bryan_Mbeumo','Noni_Madueke',
      'Cole_Palmer0','Eberechi_Eze','Dwight_McNeil','Diogo_Teixeira da Silva','Luis_Díaz','Mohamed_Salah','Phil_Foden','Bruno_Borges Fernandes','Marcus_Rashford','Harvey_Barnes1','Anthony_Gordon0',
      'Morgan_Gibbs-White0','Brennan_Johnson0','Dejan_Kulusevski','James_Maddison1','Jarrod_Bowen']
    
    extra=X_train[X_train['name'].isin(full)]
    extra['name'] = extra['name'].astype(str) + 'r'
    extra['name'] = extra['name'].astype('category')
    X_train=pd.concat([X_train, extra], axis=0, ignore_index=True)
    
    X_test=pd.DataFrame()
    
    for i in range(len(names)):
        name=names[i]
        filtered= trainingdf[trainingdf['name'] == name]
        training_cutoff = filtered["time"].max() - 5
        training_cutoff2 = filtered["time"].max() - 0
        name_df=filtered[lambda x: x.time > training_cutoff]
        name_df=name_df[lambda x: x.time <= training_cutoff2]
        X_test=pd.concat([X_test, name_df], axis=0, ignore_index=True)

    total=[]
    
    Y_train=X_train[[target_value]]
    Y_test=X_test[[target_value]]

    train = X_train.drop(columns=[target_value,'time',"name","Team","season"])
    test = X_test.drop(columns=['time'])

    dtrain = xgb.DMatrix(train, label=Y_train,enable_categorical=True)

    dtest = xgb.DMatrix(test, label=Y_test,enable_categorical=True)



    preds_list=test['name'].unique()

    model=XGB_Train(70,0.1,5,0.01,8,dtrain )
    row2=[]
    actuals=[]  
    for i in range(len(preds_list)):
        row=[]
        player=[]
        player.append(preds_list[i])
        row.append(preds_list[i])
        filtered_df = test[test['name'].isin(player)]
        if(target_value=="expected_goals_conceded"):
            team=filtered_df['Team'].values[-1]
            
            team_filter=X_train[X_train["Team"]==team]
            time_filter = team_filter[team_filter['season'] == '25']
            if(len(time_filter)<1):
                continue
            else:
                player_with_most_minutes = time_filter.loc[time_filter['minutes'].idxmax(), 'name']
                print(player_with_most_minutes)
                filtered=test[test["name"]==player_with_most_minutes]
        filtered.drop(columns=['time'])
        y=filtered_df[[target_value]]
        filtered_df = filtered_df.drop(columns=[target_value,'name',"Team","season"])
        dtest = xgb.DMatrix(filtered_df, label=y,enable_categorical=True)
        y_pred = model.predict(dtest)
        for g in range(len(y_pred)):
            row.append(y_pred[g])
            row2.append(y_pred[g])
        for t in range(len(y_pred)):
            row.append(y.values[t][0])
            actuals.append(y.values[t][0])
        row.append(filtered_df["position"].values[0])
        total.append(row)
    from xgboost import plot_importance
    import matplotlib.pyplot as plt

    # Plot feature importance
    plot_importance(model, importance_type='weight')
    plt.show()
        
    print(criterion(torch.tensor(row2), torch.tensor(actuals)))
    columns=["Name","p1","p2","p3","p4","p5","y1","y2","y3","y4","y5","position"]
    data_f=pd.DataFrame(total, columns=columns)
    return data_f
def XGB(position,position2):
    data,target_value=XGB_Make_dataset(position,position2)
    pred=XGB_Make_Pred(data,target_value,position2)
    return pred
def Make_Predictions ():
    predlength=5
    is_pred=1
    positions=["GOALS", "Assist","GC","bps"]
    positions2=["FWD", "DEF","MID"]
    positions2=["FWD"]
    positions=["Assist","GC","bps"]
    for y in range(len(positions)):
        TFT_pred=pd.DataFrame()
        XGB_pred=pd.DataFrame()
        position_filter=positions[y]
        for i in range(len(positions2)):
            position2=positions2[i]
            """if(position_filter=="GC"):
                if(position2!="DEF"):
                    continue"""
                    
            #pred2=XGB(position_filter,position2)
            #XGB_pred=pd.concat([XGB_pred, pred2], axis=0, ignore_index=True)
            pred1=Make_TFT_Predictions(position_filter,predlength, i,is_pred,position2)
            TFT_pred=pd.concat([TFT_pred, pred1], axis=0, ignore_index=True)
        
        TFT_pred.to_csv(f"TFT_{position_filter}_preds2.csv", index=False)
        #XGB_pred.to_csv(f"XGB_{position_filter}_preds2.csv", index=False)

         
        
if __name__ == '__main__':
    Make_Predictions()