import pandas as pd
import numpy as np
from sklearn.svm import SVR
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.linear_model import LassoCV
from sklearn.feature_selection import SelectFromModel
import numpy as np
import xgboost as xgb
from datetime import datetime
from sklearn.metrics import mean_squared_error
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.metrics import recall_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (precision_recall_curve, average_precision_score,
                             log_loss, brier_score_loss, roc_auc_score, classification_report, confusion_matrix)
import tensorflow as tf
from tensorflow.keras import layers, regularizers, callbacks, Model, Input,Sequential,losses
import joblib
from sklearn.utils.class_weight import compute_class_weight

def GenerateTeamPredictions1(fixture_path, current_team_path,horizon):
    team_df = pd.read_csv("Team_data_transformed2.csv").iloc[:, 1:]

    team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
    team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

    cluster_data=team_df[["XG_avg","XGC_avg"]].values
    kmeans = KMeans(n_clusters=4, random_state=31)
    kmeans.fit(cluster_data)

    team_df["Cluster"]=kmeans.predict(team_df[["XG_avg","XGC_avg"]].values)

    opponent_df = team_df[["code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time", "XG_slope", "XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","roll10_deep_allowed","Elo_Rating"]].copy()

    pred_df = pd.merge(team_df, opponent_df, 
                   left_on=['opponent', 'kickoff_time'], 
                   right_on=['code', 'kickoff_time'], 
                   how='left', suffixes=('_team', '_opp'))
    


    new_pred_df=pd.DataFrame()
    teams=pred_df["code_team"].unique()
    latest_df=pd.DataFrame()
    for teams_code in teams:
        code_df=pred_df[pred_df["code_team"]==teams_code]
        code_df = code_df.sort_values(by='kickoff_time')
        code_df['Cluster_XG'] = (code_df.groupby('Cluster_opp')['XG'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_XG'] = code_df['Cluster_XG'].fillna(code_df['Cluster_XG'].mean())

        code_df['Cluster_XGC'] = (code_df.groupby('Cluster_opp')['XGC'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_XGC'] = code_df['Cluster_XGC'].fillna(code_df['Cluster_XGC'].mean())
        code_df['Cluster_CS'] = (code_df.groupby('Cluster_opp')['Clean_Sheet'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_CS'] = code_df['Cluster_CS'].fillna(code_df['Cluster_CS'].mean())
        code_df['kickoff_time'] = pd.to_datetime(code_df['kickoff_time'])
        latest_rows = code_df.loc[code_df.groupby('Cluster_opp')['kickoff_time'].idxmax()]
        latest_rows = latest_rows[['code_team','Cluster_opp', 'Cluster_XG','Cluster_XGC','Cluster_CS']]
        latest_df=pd.concat([latest_df, latest_rows], axis=0, ignore_index=True)

        new_pred_df=pd.concat([new_pred_df, code_df], axis=0, ignore_index=True)
    latest_df.to_csv("Team_cluster_data.csv")
    pred_df=new_pred_df.copy()
    
    # Start with key columns from the team data
    Model_pred = pred_df[["name", "kickoff_time", "was_home", "XG", "XGC","Clean_Sheet","Cluster_XG","Cluster_XGC"]].copy()


    Model_pred["Own_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGH_team"], pred_df["XGA_team"])
    Model_pred["Own_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCH_team"], pred_df["XGCA_team"])
    Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGA_opp"], pred_df["XGH_opp"])
    Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])
    Model_pred["Opposition_XG_avg"] = pred_df["XG_avg_opp"]
    Model_pred["Opposition_XGC_avg"] = pred_df["XGC_avg_opp"]
    Model_pred["Own_XG_avg"] = pred_df["XG_avg_team"]
    Model_pred["Own_XGC_avg"] = pred_df["XGC_avg_team"]
    Model_pred["Own_XPTS"] = pred_df["roll10_xpts_team"]
    Model_pred["Opposition_XPTS"] = pred_df["roll10_xpts_opp"]
    Model_pred["Own_DEEP"] = pred_df["roll10_deep_team"]
    Model_pred["Opposition_DEEP"] = pred_df["roll10_deep_opp"]
    Model_pred["Own_DEEP_allowed"] = pred_df["roll10_deep_allowed_team"]
    Model_pred["Opposition_DEEP_allowed"] = pred_df["roll10_deep_allowed_opp"]
    
    Model_pred["Opposition_Treat"] = pred_df["Rolling_Threat_opp"]
    Model_pred["Opposition_TreatAgainst"] = pred_df["Rolling_Threat_Against_opp"]
    Model_pred["Own_Treat"] = pred_df["Rolling_Threat_team"]
    Model_pred["Own_TreatAgainst"] = pred_df["Rolling_Threat_Against_team"]
    Model_pred["Own_Elo_Rating"] = pred_df["Elo_Rating_team"]
    Model_pred["Opposition_Elo_Rating"] = pred_df["Elo_Rating_opp"]


    Model_pred["Own_Cluster"] = pred_df["Cluster_team"]
    Model_pred["Opposition_Cluster"] = pred_df["Cluster_opp"]

    # Include slope features from each source
    Model_pred["Own_XG_slope"] = pred_df["XG_slope_team"]
    Model_pred["Own_XGC_slope"] = pred_df["XGC_slope_team"]
    Model_pred["Opponent_XG_slope"] = pred_df["XG_slope_opp"]
    Model_pred["Opponent_XGC_slope"] = pred_df["XGC_slope_opp"]
    Model_pred.to_csv("Team_data_preds.csv")


    Model_pred['kickoff_time'] = pd.to_datetime(Model_pred['kickoff_time'])

    # Get current year and month
    current_year = datetime.today().year
    current_month = datetime.today().month

    # Filter for current month
    test_df = Model_pred[(Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month)| 
                   (Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-1) ]
    train_df = Model_pred[(Model_pred['kickoff_time'].dt.year < current_year) | 
                     ((Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month < current_month-2))]
    train_df=train_df[train_df['kickoff_time']>'2022-12-31']



    # Define Features and Target
    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Own_Elo_Rating','Opposition_Elo_Rating']
    #features = ['Own_XG', 'Own_XGC', 'Opposition_XG', 'Opposition_XGC'] # Exclude target and date
    target = 'XG'

    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]

    params = {
        "objective": "reg:quantileerror",
        "quantile_alpha": 0.75,     # 0.25 or 0.75
        "eval_metric": "quantile",
        "tree_method": "hist",
        "grow_policy": "lossguide",
        "max_depth":4,
        "eta": 0.1,
        "lambda": 2,
        "gamma": 0.1,
        "min_child_weight": 6,
    }
    num_rounds = 200
    dtrain = xgb.DMatrix(X_train, label=y_train,enable_categorical=True)
    model_xg_75 = xgb.train(params, dtrain, num_rounds)
    
    params = {
        "objective": "reg:quantileerror",
        "quantile_alpha": 0.5,     # 0.25 or 0.75
        "eval_metric": "quantile",
        "tree_method": "hist",
        "grow_policy": "lossguide",
        "min_child_weight": 6,
    }
    num_rounds = 200
    dtrain = xgb.DMatrix(X_train, label=y_train,enable_categorical=True)
    model_xg_50= xgb.train(params, dtrain, num_rounds)
    #SVR
    model_xg=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model_xg.fit(X_train, y_train)
    #model_xg.fit(X_train_lasso, y_train)
    # Make Predictions
    dtest= xgb.DMatrix(X_test, label=y_test,enable_categorical=True)

    y_pred = model_xg.predict(X_test)
    #y_pred = model_xg.predict(X_test_lasso)

    # Evaluate Performance
    mse = mean_squared_error(y_test, y_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")



    # Define Features and Target
    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP",'Own_Elo_Rating','Opposition_Elo_Rating']
    #features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster']

    #features = ['Own_XG', 'Own_XGC', 'Opposition_XG', 'Opposition_XGC']# Exclude target and date
    target = 'XGC'
    cs_target='Clean_Sheet'
    
    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]
    
    y_CS_train=train_df[cs_target]
    y_CS_test=test_df[cs_target]
    
    # Initialize and Train XGBoost Model
    model_xgc = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.1, max_depth=4,min_child_weight=6,gamma=0.2)
    model_xgc.fit(X_train, y_train)
    
    #model_CS = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=50, learning_rate=0.1, max_depth=4,min_child_weight=8)
    model_CS = xgb.XGBClassifier(objective='binary:logistic',eval_metric='rmse', n_estimators=100, learning_rate=0.01, max_depth=4,min_child_weight=8)
    model_CS = LogisticRegression()
    #model_CS=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model_CS.fit(X_train, y_CS_train)

    model_xgc=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    dtrain = xgb.DMatrix(X_train, label=y_train,enable_categorical=True)
    model_xgc = xgb.train(params, dtrain, num_rounds)
    
    #SVR
    model_xgc=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model_xgc.fit(X_train, y_train)

    # Make Predictions
    dtest= xgb.DMatrix(X_test, label=y_test,enable_categorical=True)

    y_pred = model_xgc.predict(X_test)    
    y_pred_CS = model_CS.predict_proba(X_test)[:, 1]
    #y_pred_CS = model_CS.predict(X_test)
    # Evaluate Performance
    mse = mean_squared_error(y_test, y_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")

    mse = mean_squared_error(y_CS_test, y_pred_CS)
    print(f"Mean Squared Error on CS: {mse:.4f}")




    # Assuming your model predicted probabilities:
    y_pred_CS_binary = (y_pred_CS > 0.37).astype(int)

    # Recall = correctly predicted 1s / total actual 1s
    recall = recall_score(y_CS_test, y_pred_CS_binary, pos_label=1)
    print(f"Recall (actual clean sheets captured): {recall:.3f}")

    fixture_data = (
        pd.read_csv(fixture_path)[["code","event","team_a","team_h","finished"]].rename(columns={"code": "fixture_code"})
        )
    team_code_data=pd.read_csv(current_team_path)[["name","code","id"]]

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Elo_Rating"]]
    team_data["Cluster"]=kmeans.predict(team_data[["XG_avg","XGC_avg"]].values)
    cluster_data=pd.read_csv("Team_cluster_data.csv")[["code_team","Cluster_opp","Cluster_XG","Cluster_XGC","Cluster_CS"]]

    fixture_data=fixture_data[fixture_data["finished"]==False]
    #fixture_data=fixture_data[(fixture_data['event']>33)].iloc[0:,:]

    min_event=fixture_data["event"].min()
    """
    horizon=horizon 
    min_event_list=[]
    for i in range(horizon):
        min_event_list.append(min_event+i)

    fixture_data = fixture_data[fixture_data["event"].isin(min_event_list)]"""


    df_merged = fixture_data.merge(team_code_data, left_on='team_a', right_on='id', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_code_data, left_on='team_h', right_on='id', how='left')  # Left join to keep all rows from df2
    predict_data=df_merged[["fixture_code", "event"]].copy()
    predict_data["team_a"]=df_merged["code_x"].values
    predict_data["team_h"]=df_merged["code_y"].values
    predict_data["team_a_name"]=df_merged["name_x"].values
    predict_data["team_h_name"]=df_merged["name_y"].values

    df_merged = predict_data.merge(team_data[["code","XGA","XGCA","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Elo_Rating"]], left_on='team_a', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_data[["code","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Elo_Rating"]], left_on='team_h', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(cluster_data, left_on=['code_x', 'Cluster_y'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.rename(columns={
        'Cluster_XG': 'Cluster_XG_y',
        'Cluster_XGC': 'Cluster_XGC_y',
        'Cluster_CS': 'Cluster_CS_y'
    })
    df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)
    df_merged = df_merged.merge(cluster_data, left_on=['code_y', 'Cluster_x'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.rename(columns={
        'Cluster_XG': 'Cluster_XG_x',
        'Cluster_XGC': 'Cluster_XGC_x',
    
        'Cluster_CS': 'Cluster_CS_x'
    })
    df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)
    df_merged['Cluster_XG_y'] = df_merged['Cluster_XG_y'].fillna(0.9)
    df_merged['Cluster_XG_x'] = df_merged['Cluster_XG_x'].fillna(0.9)
    df_merged['Cluster_XGC_y'] = df_merged['Cluster_XGC_y'].fillna(1.9)
    df_merged['Cluster_XGC_x'] = df_merged['Cluster_XGC_x'].fillna(1.9)
    df_merged['Cluster_CS_y'] = df_merged['Cluster_CS_y'].fillna(0.1)
    df_merged['Cluster_CS_x'] = df_merged['Cluster_CS_x'].fillna(0.1)
    nan_rows = df_merged[df_merged.isna().any(axis=1)]





    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Own_Elo_Rating','Opposition_Elo_Rating']
    
    new_input_XG = pd.DataFrame()
    new_input_XG["Own_XG"]=df_merged["XGH"]
    new_input_XG["Opposition_XGC"]=df_merged["XGCA"]
    new_input_XG["Own_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XG["Opponent_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XG["Own_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XG["Opposition_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XG["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XG["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XG['Own_Treat']=df_merged["Rolling_Threat_y"]
    new_input_XG['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]
    new_input_XG['Own_Elo_Rating']=df_merged["Elo_Rating_y"]
    new_input_XG['Opposition_Elo_Rating']=df_merged["Elo_Rating_x"]
    
    


    

    new_input_XG2 = pd.DataFrame()
    new_input_XG2["Own_XG"]=df_merged["XGA"]
    new_input_XG2["Opposition_XGC"]=df_merged["XGCH"]
    new_input_XG2["Own_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XG2["Opponent_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XG2["Own_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XG2["Opposition_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XG2["Own_Cluster"] = df_merged["Cluster_x"]
    new_input_XG2["Opposition_Cluster"] = df_merged["Cluster_y"]
    new_input_XG2['Own_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XG2['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    new_input_XG2['Own_Elo_Rating']=df_merged["Elo_Rating_x"]
    new_input_XG2['Opposition_Elo_Rating']=df_merged["Elo_Rating_y"]


    new_input_XG.to_csv("teams_preds_test.csv")

    XG1= xgb.DMatrix(new_input_XG)
    XG2= xgb.DMatrix(new_input_XG2)

    xg = model_xg.predict(new_input_XG)
    xg2 = model_xg.predict(new_input_XG2)
    xg_25H=model_xg_50.predict(XG1)
    xg_25A=model_xg_50.predict(XG2)
    xg_75H=model_xg_75.predict(XG1)
    xg_75A=model_xg_75.predict(XG2)

    
    


    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP",'Own_Elo_Rating','Opposition_Elo_Rating']
    new_input_XGC = pd.DataFrame()
    new_input_XGC["Own_XGC"]=df_merged["XGCH"]
    new_input_XGC["Opposition_XG"]=df_merged["XGA"]
    new_input_XGC["Own_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XGC["Opponent_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XGC["Opposition_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XGC["Own_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XGC["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC['Opposition_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XGC['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    new_input_XGC['Opposition_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XGC['Opposition_DEEP']=df_merged["roll10_deep_x"]
    new_input_XGC['Own_Elo_Rating']=df_merged["Elo_Rating_y"]
    new_input_XGC['Opposition_Elo_Rating']=df_merged["Elo_Rating_x"]    
    

    new_input_XGC.to_csv("teams_preds_test2.csv")


    new_input_XGC2 = pd.DataFrame()
    new_input_XGC2["Own_XGC"]=df_merged["XGCA"]
    new_input_XGC2["Opposition_XG"]=df_merged["XGH"]
    new_input_XGC2["Own_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XGC2["Opponent_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XGC2["Opposition_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XGC2["Own_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XGC2["Own_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC2["Opposition_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC2['Opposition_Treat']=df_merged["Rolling_Threat_y"]
    new_input_XGC2['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]
    new_input_XGC2['Opposition_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XGC2['Opposition_DEEP']=df_merged["roll10_deep_y"]
    new_input_XGC2['Own_Elo_Rating']=df_merged["Elo_Rating_x"]
    new_input_XGC2['Opposition_Elo_Rating']=df_merged["Elo_Rating_y"] 

    XGC1= xgb.DMatrix(new_input_XGC)
    XGC2= xgb.DMatrix(new_input_XGC2)

    xgc = model_xgc.predict(new_input_XGC)
    xgc2 = model_xgc.predict(new_input_XGC2)
    css1=model_CS.predict_proba(new_input_XGC)[:, 1]
    css2=model_CS.predict_proba(new_input_XGC2)[:, 1]
    #css1=model_CS.predict(new_input_XGC)
    #css2=model_CS.predict(new_input_XGC2)

    own_xg_cluster=df_merged["Cluster_XG_x"].values
    opp_xg_cluster=df_merged["Cluster_XG_y"].values
    own_xgc_cluster=df_merged["Cluster_XGC_x"].values
    opp_xgc_cluster=df_merged["Cluster_XGC_y"].values
    own_cluster_css=df_merged["Cluster_CS_x"].values
    opp_cluster_css=df_merged["Cluster_CS_y"].values
    
    stat_XG_HOME=df_merged["XGH"].values*df_merged["XGCA"].values*2/3
    stat_XG_AWAY=df_merged["XGA"].values*df_merged["XGCH"].values*2/3

    result_df=pd.DataFrame()
    result_df["GW"]=df_merged["event"]
    result_df["fixture_code"] = df_merged["fixture_code"]
    result_df["pred"]=df_merged["event"]-min_event+1
    result_df["home_team"]=df_merged["team_h_name"]
    result_df["away_team"]=df_merged["team_a_name"]
    result_df["home_code"]=df_merged["team_h"]
    result_df["away_code"]=df_merged["team_a"]
    result_df["home_goals"]=((xg+xgc2)/2)*0.3+0.7*xg_25H
    result_df["away_goals"]=((xgc+xg2)/2)*0.3+0.7*xg_25A
    result_df["Clean_Sheet_home"]=css1
    result_df["Clean_Sheet_away"]=css2
    result_df["test_XG"]=xg_25H
    result_df["test_cluster"]=xg_75H
    result_df["test_opp_XGC"]=xg_25A
    result_df.to_csv("Team_prediction_visual1.csv")

    home_df=result_df[["fixture_code", "GW", "pred"]].copy()
    home_df["team_name"]=result_df["home_team"]
    home_df["team_code"]=result_df["home_code"]
    home_df["XG"]=result_df["home_goals"]
    home_df["XGC"]=result_df["away_goals"]
    home_df["CS"]=result_df["Clean_Sheet_home"]
    home_df["Opposition_XG"]=df_merged["XGA"]
    home_df["Opposition_XGC"]=df_merged["XGCA"]
    home_df["Opponent_team"]=result_df["away_team"]
    home_df["Home"]='H'

    away_df=result_df[["fixture_code", "GW", "pred"]].copy()
    away_df["team_name"]=result_df["away_team"]
    away_df["team_code"]=result_df["away_code"]
    away_df["XG"]=result_df["away_goals"]
    away_df["XGC"]=result_df["home_goals"]
    away_df["CS"]=result_df["Clean_Sheet_away"]
    away_df["Opposition_XG"]=df_merged["XGH"]
    away_df["Opposition_XGC"]=df_merged["XGCH"]
    away_df["Opponent_team"]=result_df["home_team"]
    away_df["Home"]='A'

    ALL_pred=pd.concat([home_df, away_df], axis=0, ignore_index=True)
    ALL_pred.to_csv("Team_prediction1.csv")










def GenerateTeamPredictions2(fixture_path, current_team_path,horizon):
    team_df = pd.read_csv("Team_data_transformed2.csv").iloc[:, 1:]

    team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
    team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

    cluster_data=team_df[["XG_avg","XGC_avg"]].values
    kmeans = KMeans(n_clusters=4, random_state=31)
    kmeans.fit(cluster_data)

    team_df["Cluster"]=kmeans.predict(team_df[["XG_avg","XGC_avg"]].values)

    opponent_df = team_df[["code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time", "XG_slope", "XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","roll10_deep_allowed","Rolling_XG","Rolling_XGC"]].copy()        

    pred_df = pd.merge(team_df, opponent_df, 
                   left_on=['opponent', 'kickoff_time'], 
                   right_on=['code', 'kickoff_time'], 
                   how='left', suffixes=('_team', '_opp'))


    new_pred_df=pd.DataFrame()
    teams=pred_df["code_team"].unique()
    latest_df=pd.DataFrame()
    for teams_code in teams:
        code_df=pred_df[pred_df["code_team"]==teams_code]
        code_df = code_df.sort_values(by='kickoff_time')
        code_df['Cluster_XG'] = (code_df.groupby('Cluster_opp')['XG'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_XG'] = code_df['Cluster_XG'].fillna(code_df['Cluster_XG'].mean())

        code_df['Cluster_XGC'] = (code_df.groupby('Cluster_opp')['XGC'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_XGC'] = code_df['Cluster_XGC'].fillna(code_df['Cluster_XGC'].mean())
        code_df['Cluster_CS'] = (code_df.groupby('Cluster_opp')['Clean_Sheet'].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()))
        code_df['Cluster_CS'] = code_df['Cluster_CS'].fillna(code_df['Cluster_CS'].mean())
        code_df['kickoff_time'] = pd.to_datetime(code_df['kickoff_time'])
        latest_rows = code_df.loc[code_df.groupby('Cluster_opp')['kickoff_time'].idxmax()]
        latest_rows = latest_rows[['code_team','Cluster_opp', 'Cluster_XG','Cluster_XGC','Cluster_CS']]
        latest_df=pd.concat([latest_df, latest_rows], axis=0, ignore_index=True)

        new_pred_df=pd.concat([new_pred_df, code_df], axis=0, ignore_index=True)
    latest_df.to_csv("Team_cluster_data.csv")
    pred_df=new_pred_df.copy()
    
    # Start with key columns from the team data
    Model_pred = pred_df[["name", "kickoff_time", "was_home", "XG", "XGC","Clean_Sheet","Cluster_XG","Cluster_XGC"]].copy()


    Model_pred["Own_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGH_team"], pred_df["XGA_team"])
    Model_pred["Own_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCH_team"], pred_df["XGCA_team"])
    Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGA_opp"], pred_df["XGH_opp"])
    Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])
    Model_pred["Opposition_XG_avg"] = pred_df["XG_avg_opp"]
    Model_pred["Opposition_XGC_avg"] = pred_df["XGC_avg_opp"]
    Model_pred["Own_XG_avg"] = pred_df["XG_avg_team"]
    Model_pred["Own_XGC_avg"] = pred_df["XGC_avg_team"]
    Model_pred["Own_XPTS"] = pred_df["roll10_xpts_team"]
    Model_pred["Opposition_XPTS"] = pred_df["roll10_xpts_opp"]
    Model_pred["Own_DEEP"] = pred_df["roll10_deep_team"]
    Model_pred["Opposition_DEEP"] = pred_df["roll10_deep_opp"]
    Model_pred["Own_DEEP_allowed"] = pred_df["roll10_deep_allowed_team"]
    Model_pred["Opposition_DEEP_allowed"] = pred_df["roll10_deep_allowed_opp"]
    
    Model_pred["Opposition_Treat"] = pred_df["Rolling_Threat_opp"]
    Model_pred["Opposition_TreatAgainst"] = pred_df["Rolling_Threat_Against_opp"]
    Model_pred["Own_Treat"] = pred_df["Rolling_Threat_team"]
    Model_pred["Own_TreatAgainst"] = pred_df["Rolling_Threat_Against_team"]
    Model_pred["Own_RollingXG"] = pred_df["Rolling_XG_team"]
    Model_pred["Opposition_RollingXG"] = pred_df["Rolling_XG_opp"]
    Model_pred["Own_RollingXGC"] = pred_df["Rolling_XGC_team"]
    Model_pred["Opposition_RollingXGC"] = pred_df["Rolling_XGC_opp"]


    Model_pred["Own_Cluster"] = pred_df["Cluster_team"]
    Model_pred["Opposition_Cluster"] = pred_df["Cluster_opp"]

    # Include slope features from each source
    Model_pred["Own_XG_slope"] = pred_df["XG_slope_team"]
    Model_pred["Own_XGC_slope"] = pred_df["XGC_slope_team"]
    Model_pred["Opponent_XG_slope"] = pred_df["XG_slope_opp"]
    Model_pred["Opponent_XGC_slope"] = pred_df["XGC_slope_opp"]
    Model_pred["XG_Bucket"] = pd.cut(
        Model_pred["XG"],
        bins=[-np.inf, 0.9, 1.3, 1.7, np.inf],
        labels=[0,1, 2, 3],
        right=True,
        include_lowest=True # interval is [a, b)
    ).astype(int) 

    Model_pred["XGC_Bucket"] = pd.cut(
        Model_pred["XGC"],
        bins=[-np.inf, 0.9, 1.3, 1.7, np.inf],
        labels=[0,1, 2, 3],
        right=True,
        include_lowest=True # interval is [a, b)
    ).astype(int)
    
    Model_pred.to_csv("Team_data_preds.csv")


    Model_pred['kickoff_time'] = pd.to_datetime(Model_pred['kickoff_time'])

    # Get current year and month
    current_year = datetime.today().year
    current_month = datetime.today().month

    # Filter for current month
    test_df = Model_pred[(Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month)| 
                   (Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-2) ]
    train_df = Model_pred[(Model_pred['kickoff_time'].dt.year < current_year) | 
                     ((Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month < current_month-2))]
    train_df=train_df[train_df['kickoff_time']>'2022-12-31']


    
    # Define Features and Target
    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Opposition_RollingXGC','Own_RollingXG']
    #features = ['Own_XG', 'Own_XGC', 'Opposition_XG', 'Opposition_XGC'] # Exclude target and date
    target = 'XG_Bucket'

    X_train = train_df[features].astype(float)
    y_train = train_df[target].astype(int)
    X_test = test_df[features].astype(float)
    y_test = test_df['XG'].astype(float)

    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in X_train.columns:
            X_train[cat_col] = X_train[cat_col].astype('category')
            X_test[cat_col]  = X_test[cat_col].astype('category')


    model_xg = xgb.XGBClassifier(
        objective="multi:softprob",   # probabilities per class
        num_class=4,                  # buckets 1..4
        eval_metric="mlogloss",
        tree_method="hist",
        grow_policy="lossguide",
        max_depth=4,
        learning_rate=0.01,
        n_estimators=150,
        reg_lambda=1.0,
        min_child_weight=6,
        enable_categorical=True
    )

    model_xg.fit(X_train, y_train)

    proba = model_xg.predict_proba(X_test)
    weights = np.array([0.6, 1.2, 1.6, 2.4])        # same order as encoded classes
    custom_pred = proba @ weights
    
    # Evaluate Performance
    mse = mean_squared_error(y_test, custom_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")



    # Define Features and Target
    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_RollingXG','Own_RollingXGC']

    target = 'XGC_Bucket'
    cs_target='Clean_Sheet'
    
    X_train = train_df[features].astype(float)
    y_train = train_df[target].astype(int)
    X_test = test_df[features].astype(float)
    y_test = test_df['XGC'].astype(float)

    y_CS_train=train_df[cs_target].astype(int)
    y_CS_test=test_df[cs_target]

    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in X_train.columns:
            X_train[cat_col] = X_train[cat_col].astype('category')
            X_test[cat_col]  = X_test[cat_col].astype('category')

    
    
    model_xgc = xgb.XGBClassifier(
        objective="multi:softprob",   # probabilities per class
        num_class=4,                  # buckets 1..4
        eval_metric="mlogloss",
        tree_method="hist",
        grow_policy="lossguide",
        max_depth=4,
        learning_rate=0.01,
        n_estimators=150,
        reg_lambda=1.0,
        min_child_weight=6,
        enable_categorical=True
    )
    
    model_xgc.fit(X_train, y_train)
    proba = model_xgc.predict_proba(X_test)
    weights = np.array([0.6, 1.2, 1.6, 2.4])        # same order as encoded classes
    custom_pred = proba @ weights

    def upsample_positives(X_df, y, pos_ratio=0.30, random_state=42):

        rng = np.random.RandomState(random_state)

        X = X_df.reset_index(drop=True).copy()
        y = pd.Series(y, name="y").reset_index(drop=True)

        pos_idx = np.flatnonzero(y.values == 1)
        neg_idx = np.flatnonzero(y.values == 0)

        n_neg = len(neg_idx)
        n_pos_target = int((pos_ratio / (1 - pos_ratio)) * n_neg)

        if len(pos_idx) == 0 or len(neg_idx) == 0:
            # nothing to balance
            return X, y.values.astype(int)

        if len(pos_idx) >= n_pos_target:
            pos_keep = rng.choice(pos_idx, size=n_pos_target, replace=False)
        else:
            pos_keep = rng.choice(pos_idx, size=n_pos_target, replace=True)

        keep_idx = np.concatenate([neg_idx, pos_keep])
        rng.shuffle(keep_idx)

        X_bal = X.iloc[keep_idx].reset_index(drop=True)
        y_bal = y.values[keep_idx].astype(int)   # <- numpy, no index alignment
        return X_bal, y_bal



    cat_cols = [c for c in ['Own_Cluster','Opposition_Cluster'] if c in X_train.columns]
    num_cols = [c for c in X_train.columns if c not in cat_cols]

    classes = np.array([0, 1])
    w = compute_class_weight(class_weight="balanced", classes=classes, y=y_CS_train)
    class_weight = {0: w[0], 1: w[1]}   # e.g., {0:0.6, 1:1.4}


    # align columns
    scaler = StandardScaler()
    X_train_oh=X_train.copy()
    X_test_oh=X_test.copy()
    X_train_oh[num_cols] = scaler.fit_transform(X_train[num_cols].astype(float))
    X_test_oh[num_cols]  = scaler.transform(X_test[num_cols].astype(float))


    X_train_bal, y_train_bal = X_train_oh, y_CS_train
    y_smooth = 0.3/train_df['XGC'].astype(float) + 0.8 * y_train_bal  # if you're using smoothed labels

    input_dim = X_train_bal.shape[1]
    """model = Sequential([
        layers.Input(shape=(input_dim,)),
        layers.Dense(32, activation='relu', kernel_regularizer=regularizers.l2(1e-3)),
        layers.Dropout(0.1),
        layers.Dense(16, activation='relu', kernel_regularizer=regularizers.l2(1e-3)),
        layers.Dropout(0.1),
        layers.Dense(1, activation=None)])
    model.compile(optimizer='adam', loss=tf.keras.losses.Huber(delta=1.0) ,metrics=[tf.keras.metrics.MeanAbsoluteError()])

    history = model.fit(
        X_train_bal, y_smooth,
        epochs=100,
        batch_size=32,
        shuffle=True,
        verbose=0
    )"""
    model=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
    model.fit(X_train_bal, y_smooth)

    p_test = model.predict(X_test_oh)
    


    print(p_test)


    
    mse = mean_squared_error(y_test, custom_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")

    mse = mean_squared_error(y_CS_test, p_test)
    print(f"Mean Squared Error on CS: {mse:.4f}")




    # Assuming your model predicted probabilities:
    y_pred_CS_binary = (p_test > 0.37).astype(int)

    # Recall = correctly predicted 1s / total actual 1s
    recall = recall_score(y_CS_test, y_pred_CS_binary, pos_label=1)
    print(f"Recall (actual clean sheets captured): {recall:.3f}")

    fixture_data=pd.read_csv(fixture_path)[["event","team_a","team_h","finished"]]
    team_code_data=pd.read_csv(current_team_path)[["name","code","id"]]

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC","XG_pred_rolling_error","XGC_pred_rolling_error"]]
    team_data["Cluster"]=kmeans.predict(team_data[["XG_avg","XGC_avg"]].values)
    cluster_data=pd.read_csv("Team_cluster_data.csv")[["code_team","Cluster_opp","Cluster_XG","Cluster_XGC","Cluster_CS"]]

    fixture_data=fixture_data[fixture_data["finished"]==False]
    #fixture_data=fixture_data[(fixture_data['event']>33)].iloc[0:,:]

    min_event=fixture_data["event"].min()
    """
    horizon=horizon 
    min_event_list=[]
    for i in range(horizon):
        min_event_list.append(min_event+i)

    fixture_data = fixture_data[fixture_data["event"].isin(min_event_list)]"""


    df_merged = fixture_data.merge(team_code_data, left_on='team_a', right_on='id', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_code_data, left_on='team_h', right_on='id', how='left')  # Left join to keep all rows from df2
    predict_data=df_merged[["event"]]
    predict_data["team_a"]=df_merged["code_x"].values
    predict_data["team_h"]=df_merged["code_y"].values
    predict_data["team_a_name"]=df_merged["name_x"].values
    predict_data["team_h_name"]=df_merged["name_y"].values
    df_merged = predict_data.merge(team_data[["code","XGA","XGCA","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC","XG_pred_rolling_error","XGC_pred_rolling_error"]], left_on='team_a', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_data[["code","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC","XG_pred_rolling_error","XGC_pred_rolling_error"]], left_on='team_h', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(cluster_data, left_on=['code_x', 'Cluster_y'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.rename(columns={
        'Cluster_XG': 'Cluster_XG_y',
        'Cluster_XGC': 'Cluster_XGC_y',
        'Cluster_CS': 'Cluster_CS_y'
    })
    df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)
    df_merged = df_merged.merge(cluster_data, left_on=['code_y', 'Cluster_x'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.rename(columns={
        'Cluster_XG': 'Cluster_XG_x',
        'Cluster_XGC': 'Cluster_XGC_x',
    
        'Cluster_CS': 'Cluster_CS_x'
    })
    df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)
    df_merged['Cluster_XG_y'] = df_merged['Cluster_XG_y'].fillna(0.9)
    df_merged['Cluster_XG_x'] = df_merged['Cluster_XG_x'].fillna(0.9)
    df_merged['Cluster_XGC_y'] = df_merged['Cluster_XGC_y'].fillna(1.9)
    df_merged['Cluster_XGC_x'] = df_merged['Cluster_XGC_x'].fillna(1.9)
    df_merged['Cluster_CS_y'] = df_merged['Cluster_CS_y'].fillna(0.1)
    df_merged['Cluster_CS_x'] = df_merged['Cluster_CS_x'].fillna(0.1)
    nan_rows = df_merged[df_merged.isna().any(axis=1)]





    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Opposition_RollingXGC','Own_RollingXG']

    new_input_XG = pd.DataFrame()
    new_input_XG["Own_XG"]=df_merged["XGH"]
    new_input_XG["Opposition_XGC"]=df_merged["XGCA"]
    new_input_XG["Own_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XG["Opponent_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XG["Own_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XG["Opposition_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XG["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XG["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XG['Own_Treat']=df_merged["Rolling_Threat_y"]
    new_input_XG['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]
    #new_input_XG['Own_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XG['Opposition_RollingXGC']=df_merged["Rolling_XGC_x"]
    new_input_XG['Own_RollingXG']=df_merged["Rolling_XG_y"]



    new_input_XG2 = pd.DataFrame()
    new_input_XG2["Own_XG"]=df_merged["XGA"]
    new_input_XG2["Opposition_XGC"]=df_merged["XGCH"]
    new_input_XG2["Own_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XG2["Opponent_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XG2["Own_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XG2["Opposition_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XG2["Own_Cluster"] = df_merged["Cluster_x"]
    new_input_XG2["Opposition_Cluster"] = df_merged["Cluster_y"]
    new_input_XG2['Own_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XG2['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    #new_input_XG2['Own_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XG2['Opposition_RollingXGC']=df_merged["Rolling_XGC_y"]
    new_input_XG2['Own_RollingXG']=df_merged["Rolling_XG_x"]
    
    new_input_XG2.to_csv("team_preds_test_A_Goals.csv")

    new_input_XG = new_input_XG[features].astype(float)
    new_input_XG2 = new_input_XG2[features].astype(float)
    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in new_input_XG.columns:
            new_input_XG[cat_col] = new_input_XG[cat_col].astype('category')
            new_input_XG2[cat_col]  = new_input_XG2[cat_col].astype('category')



    proba1 = model_xg.predict_proba(new_input_XG)
    print(proba1)
    proba2 = model_xg.predict_proba(new_input_XG2)
    weights = np.array([0.4, 1.1, 1.45, 2.5])
    

    xg = proba1 @ weights
    
    new_input_XG["off_fac"]=new_input_XG["Own_XG"]*0.7+0.3*new_input_XG["Own_XG_avg"]-0.5*df_merged["XG_pred_rolling_error_y"]
    new_input_XG["def_fac"]=new_input_XG["Opposition_XGC"]*0.7+0.3*new_input_XG["Opposition_XGC_avg"]-0.5*df_merged["XGC_pred_rolling_error_x"]
    
         
    eta = (
    -3.15
    + 1.485 * new_input_XG["off_fac"]
    + 1.503 * new_input_XG["def_fac"]
    - 0.174 * new_input_XG["off_fac"] * new_input_XG["def_fac"]
    )


    xg_stat_h = np.exp(0.5 * eta)
    
    new_input_XG2["off_fac"]=new_input_XG2["Own_XG"]*0.7+0.3*new_input_XG2["Own_XG_avg"]-0.5*df_merged["XG_pred_rolling_error_x"]
    new_input_XG2["def_fac"]=new_input_XG2["Opposition_XGC"]*0.7+0.3*new_input_XG2["Opposition_XGC_avg"]-0.5*df_merged["XGC_pred_rolling_error_y"]
    eta2 = (-3.15
        + 1.485 * new_input_XG2["off_fac"]
        + 1.503 * new_input_XG2["def_fac"]
        - 0.174 * new_input_XG2["off_fac"] * new_input_XG2["def_fac"]
        )

    xg_stat_a = np.exp(0.5 * eta2)
    
    xg2 = proba2 @ weights    


    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_RollingXG','Own_RollingXGC']
    new_input_XGC = pd.DataFrame()
    new_input_XGC["Own_XGC"]=df_merged["XGCH"]
    new_input_XGC["Opposition_XG"]=df_merged["XGA"]
    new_input_XGC["Own_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XGC["Opponent_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XGC["Opposition_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XGC["Own_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XGC["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC['Opposition_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XGC['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    new_input_XGC['Opposition_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XGC['Opposition_DEEP']=df_merged["roll10_deep_x"]
    #new_input_XGC['Own_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XGC['Opposition_RollingXG']=df_merged["Rolling_XG_x"]
    new_input_XGC['Own_RollingXGC']=df_merged["Rolling_XGC_y"]
    new_input_XGC.to_csv("teams_preds_test2.csv")
    
    
         
    css_stat_home = np.exp(
        -np.exp(
            -1.56
            + 0.746 * (new_input_XGC["Own_XGC"]-0.5*df_merged["XGC_pred_rolling_error_y"])
            + 0.73 * (new_input_XGC["Opposition_XG"]+-0.5*df_merged["XG_pred_rolling_error_x"])
            - 0.079 * new_input_XGC["Own_XGC"] * new_input_XGC["Opposition_XG"]
        )
    )

    

    new_input_XGC2 = pd.DataFrame()
    new_input_XGC2["Own_XGC"]=df_merged["XGCA"]
    new_input_XGC2["Opposition_XG"]=df_merged["XGH"]
    new_input_XGC2["Own_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XGC2["Opponent_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XGC2["Opposition_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XGC2["Own_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XGC2["Own_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC2["Opposition_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC2['Opposition_Treat']=df_merged["Rolling_Threat_y"]
    new_input_XGC2['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]
    new_input_XGC2['Opposition_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XGC2['Opposition_DEEP']=df_merged["roll10_deep_y"]
    #new_input_XGC2['Own_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XGC2['Opposition_RollingXG']=df_merged["Rolling_XG_y"]
    new_input_XGC2['Own_RollingXGC']=df_merged["Rolling_XGC_x"]
    
    css_stat_away = np.exp(
        -np.exp(
            -1.56
            + 0.746 * new_input_XGC2["Own_XGC"]
            + 0.73 * new_input_XGC2["Opposition_XG"]
            - 0.079 * new_input_XGC2["Own_XGC"] * new_input_XGC2["Opposition_XG"]
        )
    )


    new_input_XGC = new_input_XGC[features].astype(float)
    new_input_XGC2 = new_input_XGC2[features].astype(float)
    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in new_input_XG.columns:
            new_input_XGC[cat_col] = new_input_XGC[cat_col].astype('category')
            new_input_XGC2[cat_col]  = new_input_XGC2[cat_col].astype('category')



    xgc_proba1 = model_xgc.predict_proba(new_input_XGC)
    print("XGC")
    print(xgc_proba1)
    xgc_proba2 = model_xgc.predict_proba(new_input_XGC2)
    weights = np.array([0.4, 1.1, 1.45, 2.5])

    xgc = xgc_proba1 @ weights
    xgc2 = xgc_proba2 @ weights    
    
    weights_test = np.array([0.8, 0.2, 0, 0])
    css_test=xgc_proba1 @ weights_test
    css_test2=xgc_proba2 @ weights_test




    cat_cols = [c for c in ['Own_Cluster','Opposition_Cluster'] if c in X_train.columns]
    num_cols = [c for c in X_train.columns if c not in cat_cols]
    
    new_input_XGC[num_cols]  = scaler.transform(new_input_XGC[num_cols].astype(float))
    new_input_XGC2[num_cols]  = scaler.transform(new_input_XGC2[num_cols].astype(float))
    
    
    css1=model.predict(new_input_XGC)

    css2=model.predict(new_input_XGC2)


    own_xg_cluster=df_merged["Cluster_XG_x"].values
    opp_xg_cluster=df_merged["Cluster_XG_y"].values
    own_xgc_cluster=df_merged["Cluster_XGC_x"].values
    opp_xgc_cluster=df_merged["Cluster_XGC_y"].values
    own_cluster_css=df_merged["Cluster_CS_x"].values
    opp_cluster_css=df_merged["Cluster_CS_y"].values



    result_df=pd.DataFrame()
    result_df["GW"]=df_merged["event"]
    result_df["pred"]=df_merged["event"]-min_event+1
    result_df["home_team"]=df_merged["team_h_name"]
    result_df["away_team"]=df_merged["team_a_name"]
    result_df["home_code"]=df_merged["team_h"]
    result_df["away_code"]=df_merged["team_a"]
    result_df["home_goals"]=(xg*0.3+0.7*xg_stat_h)
    result_df["away_goals"]=(xg2*0.3+0.7*xg_stat_a)
    result_df["Clean_Sheet_home"]=css_test*0.2+0.8*css_stat_home
    result_df["Clean_Sheet_away"]=css_test2*0.2+0.8*css_stat_away
    result_df["test_XG"]=xg
    result_df["test_cluster"]=xg2
    result_df["test_opp_XGC"]=css_test
    result_df.to_csv("Team_prediction_visual2.csv")

    home_df=result_df[["GW", "pred"]]
    home_df["team_name"]=result_df["home_team"]
    home_df["team_code"]=result_df["home_code"]
    home_df["XG"]=result_df["home_goals"]
    home_df["XGC"]=result_df["away_goals"]
    home_df["CS"]=result_df["Clean_Sheet_home"]
    home_df["Opposition_XG"]=df_merged["XGA"]
    home_df["Opposition_XGC"]=df_merged["XGCA"]
    home_df["Opponent_team"]=result_df["away_team"]
    home_df["Home"]='H'

    away_df=result_df[["GW", "pred"]]
    away_df["team_name"]=result_df["away_team"]
    away_df["team_code"]=result_df["away_code"]
    away_df["XG"]=result_df["away_goals"]
    away_df["XGC"]=result_df["home_goals"]
    away_df["CS"]=result_df["Clean_Sheet_away"]
    away_df["Opposition_XG"]=df_merged["XGH"]
    away_df["Opposition_XGC"]=df_merged["XGCH"]
    away_df["Opponent_team"]=result_df["home_team"]
    away_df["Home"]='A'

    ALL_pred=pd.concat([home_df, away_df], axis=0, ignore_index=True)
    ALL_pred.to_csv("Team_prediction2.csv")





import numpy as np
import pandas as pd
from datetime import datetime

from sklearn.metrics import log_loss, accuracy_score, confusion_matrix
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

import xgboost as xgb
from sklearn.model_selection import train_test_split

from sklearn.cluster import KMeans


def multiclass_brier(y_true, proba, classes=(0, 1, 2)):
    """
    Multi-class Brier score: mean over samples of sum_k (p_k - 1{y=k})^2
    """
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba)
    class_to_idx = {c: i for i, c in enumerate(classes)}
    y_onehot = np.zeros_like(proba)

    for i, y in enumerate(y_true):
        y_onehot[i, class_to_idx[int(y)]] = 1.0

    return float(np.mean(np.sum((proba - y_onehot) ** 2, axis=1)))


def _ensure_all_classes(proba, classes_present, all_classes=(0, 1, 2)):
    """
    If a model was trained on subset of classes (rare, but can happen),
    expand probability columns to always be [P0, P1, P2].
    """
    proba = np.asarray(proba)
    out = np.zeros((proba.shape[0], len(all_classes)), dtype=float)
    cls_to_idx_present = {c: i for i, c in enumerate(classes_present)}
    for j, c in enumerate(all_classes):
        if c in cls_to_idx_present:
            out[:, j] = proba[:, cls_to_idx_present[c]]
        else:
            out[:, j] = 0.0
    # normalize just in case
    s = out.sum(axis=1, keepdims=True)
    s[s == 0] = 1.0
    out = out / s
    return out


def GenerateTeamPredictions_Results(fixture_path, current_team_path, horizon):
    # =========================
    # Load and prep team history
    # =========================
    team_df = pd.read_csv("Team_data_transformed2.csv").iloc[:, 1:]

    team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
    team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

    # KMeans cluster on XG_avg/XGC_avg
    cluster_data = team_df[["XG_avg", "XGC_avg"]].values
    kmeans = KMeans(n_clusters=4, random_state=31)
    kmeans.fit(cluster_data)
    team_df["Cluster"] = kmeans.predict(team_df[["XG_avg", "XGC_avg"]].values)

    # Opponent view
    opponent_df = team_df[
        [
            "code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time",
            "XG_slope", "XGC_slope", "XG_avg", "XGC_avg", "Cluster",
            "Rolling_Threat", "Rolling_Threat_Against",
            "roll10_xpts", "roll10_deep", "roll10_deep_allowed",
            "Rolling_XG", "Rolling_XGC",
            # ---- Elo columns (already in dataset) ----
            # >>> ADJUST THIS IF YOUR ELO COL NAME DIFFERS <<<
            "Elo_Rating"
        ]
    ].copy()

    # Merge team/opponent on opponent+kickoff_time like you do
    pred_df = pd.merge(
        team_df,
        opponent_df,
        left_on=["opponent", "kickoff_time"],
        right_on=["code", "kickoff_time"],
        how="left",
        suffixes=("_team", "_opp"),
    )

    # =========================
    # Cluster rolling features (your logic)
    # =========================
    new_pred_df = pd.DataFrame()
    teams = pred_df["code_team"].unique()
    latest_df = pd.DataFrame()

    for teams_code in teams:
        code_df = pred_df[pred_df["code_team"] == teams_code].copy()
        code_df = code_df.sort_values(by="kickoff_time")

        code_df["Cluster_XG"] = (
            code_df.groupby("Cluster_opp")["XG"]
            .transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean())
        )
        code_df["Cluster_XG"] = code_df["Cluster_XG"].fillna(code_df["Cluster_XG"].mean())

        code_df["Cluster_XGC"] = (
            code_df.groupby("Cluster_opp")["XGC"]
            .transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean())
        )
        code_df["Cluster_XGC"] = code_df["Cluster_XGC"].fillna(code_df["Cluster_XGC"].mean())

        code_df["Cluster_CS"] = (
            code_df.groupby("Cluster_opp")["Clean_Sheet"]
            .transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean())
        )
        code_df["Cluster_CS"] = code_df["Cluster_CS"].fillna(code_df["Cluster_CS"].mean())

        code_df["kickoff_time"] = pd.to_datetime(code_df["kickoff_time"])
        latest_rows = code_df.loc[code_df.groupby("Cluster_opp")["kickoff_time"].idxmax()]
        latest_rows = latest_rows[["code_team", "Cluster_opp", "Cluster_XG", "Cluster_XGC", "Cluster_CS"]]
        latest_df = pd.concat([latest_df, latest_rows], axis=0, ignore_index=True)

        new_pred_df = pd.concat([new_pred_df, code_df], axis=0, ignore_index=True)

    latest_df.to_csv("Team_cluster_data.csv", index=False)
    pred_df = new_pred_df.copy()

    # =========================
    # Build Model_pred (training frame)
    # =========================
    Model_pred = pred_df[
        ["name", "kickoff_time", "was_home", "XG", "XGC", "Clean_Sheet", "Cluster_XG", "Cluster_XGC", "Result"]
    ].copy()

    # Own/Opp split
    Model_pred["Own_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGH_team"], pred_df["XGA_team"])
    Model_pred["Own_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCH_team"], pred_df["XGCA_team"])
    Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGA_opp"], pred_df["XGH_opp"])
    Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])

    Model_pred["Opposition_XG_avg"] = pred_df["XG_avg_opp"]
    Model_pred["Opposition_XGC_avg"] = pred_df["XGC_avg_opp"]
    Model_pred["Own_XG_avg"] = pred_df["XG_avg_team"]
    Model_pred["Own_XGC_avg"] = pred_df["XGC_avg_team"]

    Model_pred["Own_XPTS"] = pred_df["roll10_xpts_team"]
    Model_pred["Opposition_XPTS"] = pred_df["roll10_xpts_opp"]
    Model_pred["Own_DEEP"] = pred_df["roll10_deep_team"]
    Model_pred["Opposition_DEEP"] = pred_df["roll10_deep_opp"]
    Model_pred["Own_DEEP_allowed"] = pred_df["roll10_deep_allowed_team"]
    Model_pred["Opposition_DEEP_allowed"] = pred_df["roll10_deep_allowed_opp"]

    Model_pred["Opposition_Treat"] = pred_df["Rolling_Threat_opp"]
    Model_pred["Opposition_TreatAgainst"] = pred_df["Rolling_Threat_Against_opp"]
    Model_pred["Own_Treat"] = pred_df["Rolling_Threat_team"]
    Model_pred["Own_TreatAgainst"] = pred_df["Rolling_Threat_Against_team"]
    Model_pred["Own_RollingXG"] = pred_df["Rolling_XG_team"]
    Model_pred["Opposition_RollingXG"] = pred_df["Rolling_XG_opp"]
    Model_pred["Own_RollingXGC"] = pred_df["Rolling_XGC_team"]
    Model_pred["Opposition_RollingXGC"] = pred_df["Rolling_XGC_opp"]

    Model_pred["Own_Cluster"] = pred_df["Cluster_team"]
    Model_pred["Opposition_Cluster"] = pred_df["Cluster_opp"]

    Model_pred["Own_XG_slope"] = pred_df["XG_slope_team"]
    Model_pred["Own_XGC_slope"] = pred_df["XGC_slope_team"]
    Model_pred["Opponent_XG_slope"] = pred_df["XG_slope_opp"]
    Model_pred["Opponent_XGC_slope"] = pred_df["XGC_slope_opp"]

    # =========================
    # Elo features (already present in pred_df)
    # =========================
    # >>> ADJUST THESE TWO LINES IF YOUR MERGED ELO COLS ARE NAMED DIFFERENTLY <<<
    # common pattern after merge: Elo_Rating_team and Elo_Rating_opp
    if "Elo_Rating_team" in pred_df.columns and "Elo_Rating_opp" in pred_df.columns:
        Model_pred["Own_Elo"] = pred_df["Elo_Rating_team"]
        Model_pred["Opp_Elo"] = pred_df["Elo_Rating_opp"]
    elif "Elo_Rating" in team_df.columns:
        # fallback: if you only kept Elo_Rating and didn't suffix
        # this is less ideal; you should ensure both team and opp Elo exist
        Model_pred["Own_Elo"] = pred_df.get("Elo_Rating_team", np.nan)
        Model_pred["Opp_Elo"] = pred_df.get("Elo_Rating_opp", np.nan)
    else:
        raise ValueError("Could not find Elo columns. Ensure Elo_Rating exists and survives the merges.")

    Model_pred["Elo_diff"] = Model_pred["Own_Elo"] - Model_pred["Opp_Elo"]

    # =========================
    # Train/Test split by time (your logic)
    # =========================
    Model_pred["kickoff_time"] = pd.to_datetime(Model_pred["kickoff_time"])

    current_year = datetime.today().year
    current_month = datetime.today().month

    test_df = Model_pred[
        ((Model_pred["kickoff_time"].dt.year == current_year) & (Model_pred["kickoff_time"].dt.month == current_month))
        | ((Model_pred["kickoff_time"].dt.year == current_year) & (Model_pred["kickoff_time"].dt.month == current_month - 2))
    ].copy()

    train_df = Model_pred[
        (Model_pred["kickoff_time"].dt.year < current_year)
        | ((Model_pred["kickoff_time"].dt.year == current_year) & (Model_pred["kickoff_time"].dt.month < current_month - 2))
    ].copy()

    train_df = train_df[train_df["kickoff_time"] > "2022-12-31"].copy()

    # drop missing target
    train_df = train_df.dropna(subset=["Result"])
    test_df = test_df.dropna(subset=["Result"])

    # enforce classes
    train_df["Result"] = train_df["Result"].astype(int)
    test_df["Result"] = test_df["Result"].astype(int)

    # =========================
    # Features (add Elo_home & Elo_away via Own_Elo / Opp_Elo)
    # =========================
    features = [
        "Own_XG", "Own_XGC", "Opposition_XG", "Opposition_XGC",
        "Own_XG_slope", "Opponent_XGC_slope", "Own_XGC_slope", "Opponent_XG_slope",
        "Own_XG_avg", "Opposition_XGC_avg", "Opposition_XG_avg", "Own_XGC_avg",
        "Own_Cluster", "Opposition_Cluster",
        "Own_Treat", "Opposition_TreatAgainst", "Opposition_Treat", "Own_TreatAgainst",
        # Elo features
        "Own_Elo", "Opp_Elo", "Elo_diff"
    ]

    X_train = train_df[features].copy()
    y_train = train_df["Result"].copy()
    X_test = test_df[features].copy()
    y_test = test_df["Result"].copy()

    # mark categorical for xgboost
    for cat_col in ["Own_Cluster", "Opposition_Cluster"]:
        if cat_col in X_train.columns:
            X_train[cat_col] = X_train[cat_col].astype("category")
            X_test[cat_col] = X_test[cat_col].astype("category")

    # =========================
    # Model 1: XGBoost multiclass
    # =========================
    model_xgb = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        tree_method="hist",
        max_depth=4,
        learning_rate=0.01,
        n_estimators=100,
        min_child_weight=8,
        enable_categorical=True,
    )

    model_xgb.fit(X_train, y_train)

    # probabilities
    proba_train_xgb = _ensure_all_classes(model_xgb.predict_proba(X_train), model_xgb.classes_)
    proba_test_xgb = _ensure_all_classes(model_xgb.predict_proba(X_test), model_xgb.classes_)

    # =========================
    # Model 2: Statistical model = Multinomial Logistic Regression
    # - OneHot for clusters
    # - Standardize numeric
    # =========================
    cat_cols = ["Own_Cluster", "Opposition_Cluster"]
    num_cols = [c for c in features if c not in cat_cols]

    preproc = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("scaler", StandardScaler())]), num_cols),
            ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
        ],
        remainder="drop",
    )

    model_lr = Pipeline(
        steps=[
            ("prep", preproc),
            ("clf", LogisticRegression(
                multi_class="multinomial",
                max_iter=2000,
                C=1.0,
                solver="lbfgs",
                n_jobs=None
            )),
        ]
    )

    model_lr.fit(X_train, y_train)

    proba_train_lr = _ensure_all_classes(model_lr.predict_proba(X_train), model_lr.named_steps["clf"].classes_)
    proba_test_lr = _ensure_all_classes(model_lr.predict_proba(X_test), model_lr.named_steps["clf"].classes_)

    # =========================
    # Ensemble: average probabilities
    # Order: [P(Result=0 draw), P(Result=1 away win), P(Result=2 home win)]
    # =========================
    proba_train_avg = 0.5 * (proba_train_xgb + proba_train_lr)
    proba_test_avg = 0.5 * (proba_test_xgb + proba_test_lr)

    # =========================
    # Training/Test metrics
    # =========================
    def print_metrics(tag, y_true, proba):
        pred = np.argmax(proba, axis=1)
        ll = log_loss(y_true, proba, labels=[0, 1, 2])
        acc = accuracy_score(y_true, pred)
        brier = multiclass_brier(y_true, proba, classes=(0, 1, 2))
        cm = confusion_matrix(y_true, pred, labels=[0, 1, 2])
        print(f"\n[{tag}]")
        print(f"  LogLoss: {ll:.4f}")
        print(f"  Accuracy: {acc:.4f}")
        print(f"  Brier: {brier:.4f}")
        print("  Confusion Matrix (rows=true, cols=pred) for [0,1,2]:")
        print(cm)

    print_metrics("TRAIN (XGB)", y_train, proba_train_xgb)
    print_metrics("TEST  (XGB)", y_test, proba_test_xgb)

    print_metrics("TRAIN (LR )", y_train, proba_train_lr)
    print_metrics("TEST  (LR )", y_test, proba_test_lr)

    print_metrics("TRAIN (AVG)", y_train, proba_train_avg)
    print_metrics("TEST  (AVG)", y_test, proba_test_avg)

    # =========================
    # Future fixtures prediction build (your merge logic)
    # =========================
    fixture_data = pd.read_csv(fixture_path)[["event", "team_a", "team_h", "finished"]]
    team_code_data = pd.read_csv(current_team_path)[["name", "code", "id"]]

    team_data = pd.read_csv("Team_data_newest3.csv")[
        [
            "code", "XGA", "XGCA", "XGH", "XGCH",
            "XG_slope", "XGC_slope", "XG_avg", "XGC_avg",
            "Rolling_Threat", "Rolling_Threat_Against",
            "roll10_xpts", "roll10_deep", "roll10_deep_allowed",
            "Rolling_XG", "Rolling_XGC",
            # >>> Elo already present in dataset <<<
            # >>> ADJUST IF NAME DIFFERENT <<<
            "Elo_Rating"
        ]
    ].copy()

    team_data["Cluster"] = kmeans.predict(team_data[["XG_avg", "XGC_avg"]].values)
    cluster_data = pd.read_csv("Team_cluster_data.csv")[["code_team", "Cluster_opp", "Cluster_XG", "Cluster_XGC", "Cluster_CS"]]

    fixture_data = fixture_data[fixture_data["finished"] == False].copy()
    min_event = int(fixture_data["event"].min())

    # merge fixture teams to codes/names
    df_merged = fixture_data.merge(team_code_data, left_on="team_a", right_on="id", how="left")
    df_merged = df_merged.merge(team_code_data, left_on="team_h", right_on="id", how="left")

    predict_data = pd.DataFrame()
    predict_data["event"] = df_merged["event"]
    predict_data["team_a"] = df_merged["code_x"].values
    predict_data["team_h"] = df_merged["code_y"].values
    predict_data["team_a_name"] = df_merged["name_x"].values
    predict_data["team_h_name"] = df_merged["name_y"].values

    # Merge away team stats
    df_merged = predict_data.merge(
        team_data, left_on="team_a", right_on="code", how="left", suffixes=("", "_away")
    )
    # Merge home team stats (suffix _home)
    df_merged = df_merged.merge(
        team_data, left_on="team_h", right_on="code", how="left", suffixes=("_away", "_home")
    )

    # Cluster matchup stats (away vs home cluster)
    df_merged = df_merged.merge(
        cluster_data, left_on=["team_a", "Cluster_home"], right_on=["code_team", "Cluster_opp"], how="left"
    ).rename(columns={
        "Cluster_XG": "Cluster_XG_home",
        "Cluster_XGC": "Cluster_XGC_home",
        "Cluster_CS": "Cluster_CS_home"
    }).drop(["code_team", "Cluster_opp"], axis=1)

    # Cluster matchup stats (home vs away cluster)
    df_merged = df_merged.merge(
        cluster_data, left_on=["team_h", "Cluster_away"], right_on=["code_team", "Cluster_opp"], how="left"
    ).rename(columns={
        "Cluster_XG": "Cluster_XG_away",
        "Cluster_XGC": "Cluster_XGC_away",
        "Cluster_CS": "Cluster_CS_away"
    }).drop(["code_team", "Cluster_opp"], axis=1)

    # Fill cluster matchup fallbacks
    for c, fillv in [("Cluster_XG_home", 0.9), ("Cluster_XG_away", 0.9),
                     ("Cluster_XGC_home", 1.9), ("Cluster_XGC_away", 1.9),
                     ("Cluster_CS_home", 0.1), ("Cluster_CS_away", 0.1)]:
        if c in df_merged.columns:
            df_merged[c] = df_merged[c].fillna(fillv)

    # =========================
    # Build prediction feature frame (match training feature names)
    # Here we predict RESULT from HOME perspective:
    # Result=2 home win, 1 away win, 0 draw
    # =========================
    X_pred = pd.DataFrame()

    # "Own" = home team, "Opp" = away team
    X_pred["Own_XG"] = df_merged["XGH_home"]
    X_pred["Own_XGC"] = df_merged["XGCH_home"]
    X_pred["Opposition_XG"] = df_merged["XGA_away"]
    X_pred["Opposition_XGC"] = df_merged["XGCA_away"]

    X_pred["Own_XG_slope"] = df_merged["XG_slope_home"]
    X_pred["Own_XGC_slope"] = df_merged["XGC_slope_home"]
    X_pred["Opponent_XG_slope"] = df_merged["XG_slope_away"]
    X_pred["Opponent_XGC_slope"] = df_merged["XGC_slope_away"]

    X_pred["Own_XG_avg"] = df_merged["XG_avg_home"]
    X_pred["Own_XGC_avg"] = df_merged["XGC_avg_home"]
    X_pred["Opposition_XG_avg"] = df_merged["XG_avg_away"]
    X_pred["Opposition_XGC_avg"] = df_merged["XGC_avg_away"]

    X_pred["Own_Cluster"] = df_merged["Cluster_home"]
    X_pred["Opposition_Cluster"] = df_merged["Cluster_away"]

    X_pred["Own_Treat"] = df_merged["Rolling_Threat_home"]
    X_pred["Own_TreatAgainst"] = df_merged["Rolling_Threat_Against_home"]
    X_pred["Opposition_Treat"] = df_merged["Rolling_Threat_away"]
    X_pred["Opposition_TreatAgainst"] = df_merged["Rolling_Threat_Against_away"]

    # Elo: Own=home, Opp=away
    # >>> ADJUST IF YOUR ELO COLS NAMED DIFFERENTLY AFTER MERGE <<<
    X_pred["Own_Elo"] = df_merged["Elo_Rating_home"]
    X_pred["Opp_Elo"] = df_merged["Elo_Rating_away"]
    X_pred["Elo_diff"] = X_pred["Own_Elo"] - X_pred["Opp_Elo"]

    # Ensure dtypes match
    X_pred = X_pred[features].copy()
    X_pred["Own_Cluster"] = X_pred["Own_Cluster"].astype("category")
    X_pred["Opposition_Cluster"] = X_pred["Opposition_Cluster"].astype("category")

    # =========================
    # Predict probabilities (AVG ensemble)
    # =========================
    proba_pred_xgb = _ensure_all_classes(model_xgb.predict_proba(X_pred), model_xgb.classes_)
    proba_pred_lr = _ensure_all_classes(model_lr.predict_proba(X_pred), model_lr.named_steps["clf"].classes_)
    proba_pred_avg = (0.5*proba_pred_xgb + 0.5*proba_pred_lr)
    proba_pred_avg2 = (1*proba_pred_xgb + 0*proba_pred_lr)
    
    
    d = X_pred["Own_Elo"] - X_pred["Opp_Elo"] + 50

    # Binary home win probability
    p_home_raw = 1 / (1 + 10 ** (-d / 400))
    draw_base=0.4
    draw_decay=0.005

    # Draw probability decreases as |d| increases
    p_draw3 = draw_base * np.exp(-draw_decay * abs(d))

    # Remaining mass
    remaining = 1 - p_draw3

    p_home3 = remaining * p_home_raw
    p_away3 = remaining * (1 - p_home_raw)

    # Safety normalization
    total = p_home3 + p_draw3 + p_away3
    p_home3 /= total
    p_draw3 /= total
    p_away3 /= total

    # columns: [P0 draw, P1 away win, P2 home win]
    p_draw = proba_pred_avg[:, 1]
    p_away = proba_pred_avg[:, 0]
    p_home = proba_pred_avg[:, 2]
    
    """p_draw2 = proba_pred_avg2[:, 1]
    p_away2 = proba_pred_avg2[:, 0]
    p_home2 = proba_pred_avg2[:, 2]"""
    # =========================
    # Write Team_prediction_visual5.csv
    # =========================
    result_df = pd.DataFrame()
    result_df["GW"] = df_merged["event"].fillna(38).astype(int)
    result_df["pred"] = result_df["GW"] - min_event + 1
    result_df["home_team"] = df_merged["team_h_name"]
    result_df["away_team"] = df_merged["team_a_name"]
    result_df["home_code"] = df_merged["team_h"].astype(int)
    result_df["away_code"] = df_merged["team_a"].astype(int)

    # requested output columns
    result_df["Home_win_Percent"] = ((p_home*0.7+0.3*p_home3) * 100).round(2)
    result_df["Away_win_Percent"] = ((p_away*0.7+0.3*p_away3) * 100).round(2)
    result_df["Draw_percent"] = ((p_draw*0.7+0.3*p_draw3) * 100).round(2)
    result_df["Home_win_Percent2"] = (p_home3 * 100).round(2)
    result_df["Away_win_Percent2"] = (p_away3 * 100).round(2)
    result_df["Draw_percent2"] = (p_draw3 * 100).round(2)

    result_df.to_csv("Team_prediction_visual_results2.csv", index=False)

    # =========================
    # Build Team_prediction5.csv (home/away rows)
    # win% etc from that team's perspective
    # =========================
    home_df = result_df[["GW", "pred"]].copy()
    home_df["team_name"] = result_df["home_team"]
    home_df["team_code"] = result_df["home_code"]
    home_df["win_Percent"] = result_df["Home_win_Percent"]
    home_df["Draw_percent"] = result_df["Draw_percent"]
    home_df["Loss_percent"] = result_df["Away_win_Percent"]
    home_df["Opponent_team"] = result_df["away_team"]
    home_df["Home"] = "H"

    away_df = result_df[["GW", "pred"]].copy()
    away_df["team_name"] = result_df["away_team"]
    away_df["team_code"] = result_df["away_code"]
    away_df["win_Percent"] = result_df["Away_win_Percent"]
    away_df["Draw_percent"] = result_df["Draw_percent"]
    away_df["Loss_percent"] = result_df["Home_win_Percent"]
    away_df["Opponent_team"] = result_df["home_team"]
    away_df["Home"] = "A"

    ALL_pred = pd.concat([home_df, away_df], axis=0, ignore_index=True)
    ALL_pred.to_csv("Team_prediction_results2.csv", index=False)

    return result_df, ALL_pred


def build_current_table_from_fixtures(fixture_path, current_teams_path) -> pd.DataFrame:
    """
    Reads fixtures and current teams, returns a league table with:
    team_id, code, name, played, points, gf, ga, gd
    """
    # --- Fixtures ---
    df = pd.read_csv(fixture_path)

    if df["finished"].dtype != bool:
        df["finished"] = (
            df["finished"]
            .astype(str)
            .str.strip()
            .str.lower()
            .map({"true": True, "false": False, "1": True, "0": False})
            .fillna(False)
            .astype(bool)
        )

    fin = df.loc[df["finished"]].copy()

    fin["team_h_score"] = pd.to_numeric(fin["team_h_score"], errors="coerce")
    fin["team_a_score"] = pd.to_numeric(fin["team_a_score"], errors="coerce")
    fin = fin.dropna(subset=["team_h_score", "team_a_score"])

    fin["played"] = 1

    home_win = fin["team_h_score"] > fin["team_a_score"]
    away_win = fin["team_a_score"] > fin["team_h_score"]
    draw = fin["team_h_score"] == fin["team_a_score"]

    fin["home_pts"] = np.select([home_win, draw, away_win], [3, 1, 0], default=0)
    fin["away_pts"] = np.select([away_win, draw, home_win], [3, 1, 0], default=0)

    home_agg = fin.groupby("team_h", as_index=False).agg(
        played=("played", "sum"),
        points=("home_pts", "sum"),
        gf=("team_h_score", "sum"),
        ga=("team_a_score", "sum"),
    ).rename(columns={"team_h": "team_id"})

    away_agg = fin.groupby("team_a", as_index=False).agg(
        played=("played", "sum"),
        points=("away_pts", "sum"),
        gf=("team_a_score", "sum"),
        ga=("team_h_score", "sum"),
    ).rename(columns={"team_a": "team_id"})

    table = (
        pd.concat([home_agg, away_agg], ignore_index=True)
        .groupby("team_id", as_index=False)[["played", "points", "gf", "ga"]]
        .sum()
    )

    table["gd"] = table["gf"] - table["ga"]

    # --- Current teams ---
    teams = pd.read_csv(current_teams_path)[["id", "code", "name"]]

    # Join
    table = table.merge(
        teams,
        left_on="team_id",
        right_on="id",
        how="left"
    ).drop(columns="id")

    # Final sort
    table = table.sort_values(
        ["points", "gd", "gf", "team_id"],
        ascending=[False, False, False, True],
    ).reset_index(drop=True)

    table.to_csv("Current_Table_Standings.csv")

def build_predicted_table(
    table_df: pd.DataFrame,
    prediction_path: str,
    points_col_name: str = "predicted_points"
) -> pd.DataFrame:
    """
    Adds predicted points to an existing league table.

    Predicted points per fixture:
        3 * win_Percent + 1 * draw_Percent

    Aggregated per team_code and merged into table_df.
    """
    # Read predictions
    preds = pd.read_csv(prediction_path)

    # Ensure numeric
    preds["win_Percent"] = pd.to_numeric(preds["win_Percent"], errors="coerce").fillna(0)
    preds["Draw_percent"] = pd.to_numeric(preds["Draw_percent"], errors="coerce").fillna(0)

    # Per-row expected points
    preds["expected_points"] = (
        3 * preds["win_Percent"] +
        1 * preds["Draw_percent"]
    )/100

    # Sum per team
    team_pred_points = (
        preds.groupby("team_code", as_index=False)["expected_points"]
        .sum()
        .rename(columns={"expected_points": points_col_name,"team_code": "code"})
    )

    # Merge into table
    predicted_table = table_df.merge(
        team_pred_points,
        on="code",
        how="left"
    )

    predicted_table[points_col_name] = predicted_table[points_col_name].fillna(0)

    # Sort as predicted table
    predicted_table = predicted_table.sort_values(
        [points_col_name, "gd", "gf", "team_id"],
        ascending=[False, False, False, True],
    ).reset_index(drop=True)

    predicted_table[points_col_name]=predicted_table[points_col_name]+predicted_table["points"]

    final_table=predicted_table[["team_id", "code", "name", "played","points", "gf","ga","gd",points_col_name]]
    final_table = final_table.sort_values(
    by=points_col_name,
    ascending=False
    )
    final_table.to_csv("Final_Table_Prediction.csv")

    return final_table


import pandas as pd

import pandas as pd
import numpy as np

def build_predicted_table_with_gw(
    table_df: pd.DataFrame,
    prediction_path: str,
    points_col_name: str = "predicted_points",   # this will mean "predicted points THIS GW"
    gw_col: str = "GW",
) -> pd.DataFrame:
    preds = pd.read_csv(prediction_path)

    required = {"team_code", "win_Percent", "Draw_percent", gw_col}
    missing = required - set(preds.columns)
    if missing:
        raise ValueError(f"Missing required columns in predictions: {missing}")

    preds["win_Percent"] = pd.to_numeric(preds["win_Percent"], errors="coerce").fillna(0)
    preds["Draw_percent"] = pd.to_numeric(preds["Draw_percent"], errors="coerce").fillna(0)
    preds[gw_col] = pd.to_numeric(preds[gw_col], errors="coerce")
    preds = preds.dropna(subset=[gw_col])
    preds[gw_col] = preds[gw_col].astype(int)

    preds["expected_points"] = (3 * preds["win_Percent"] + 1 * preds["Draw_percent"]) / 100.0

    gws = sorted(preds[gw_col].unique())

    all_tables = []
    prev_positions = {}

    # running cumulative predicted points per team code
    cum_pred = {int(c): 0.0 for c in table_df["code"].astype(int).tolist()}

    for gw in gws:
        preds_gw = preds[preds[gw_col] == gw]

        team_pred_points = (
            preds_gw.groupby("team_code", as_index=False)["expected_points"]
            .sum()
            .rename(columns={"team_code": "code", "expected_points": points_col_name})
        )

        predicted_table = table_df.merge(team_pred_points, on="code", how="left")
        predicted_table[points_col_name] = predicted_table[points_col_name].fillna(0)

        # update cumulative predicted points
        for _, r in predicted_table[["code", points_col_name]].iterrows():
            code = int(r["code"])
            cum_pred[code] = float(cum_pred.get(code, 0.0)) + float(r[points_col_name])

        predicted_table["cum_predicted_points"] = predicted_table["code"].apply(
            lambda c: float(cum_pred.get(int(c), 0.0))
        )

        # ✅ cumulative total points up to this GW
        predicted_table["total_points"] = predicted_table["points"] + predicted_table["cum_predicted_points"]

        predicted_table = predicted_table.sort_values(
            ["total_points", "gd", "gf", "team_id"],
            ascending=[False, False, False, True],
        ).reset_index(drop=True)

        predicted_table["position"] = predicted_table.index + 1
        predicted_table["GW"] = gw

        def get_movement(code, pos):
            code = int(code)
            if code not in prev_positions:
                return "same"
            if pos < prev_positions[code]:
                return "up"
            if pos > prev_positions[code]:
                return "down"
            return "same"

        predicted_table["movement"] = predicted_table.apply(
            lambda r: get_movement(r["code"], r["position"]),
            axis=1
        )

        prev_positions = dict(zip(predicted_table["code"].astype(int), predicted_table["position"].astype(int)))

        final_cols = [
            "GW",
            "position",
            "movement",
            "team_id",
            "code",
            "name",
            "played",
            "points",
            "gf",
            "ga",
            "gd",
            points_col_name,           # predicted points THIS GW
            "cum_predicted_points",    # cumulative predicted points up to GW
            "total_points",            # points + cumulative predicted points
        ]

        all_tables.append(predicted_table[final_cols])

    final_table = pd.concat(all_tables, ignore_index=True)
    final_table.to_csv("Final_Table_Prediction_All_GW.csv", index=False)
    return final_table


def GenerateTeamPredictions(fixture_path, current_team_path,horizon):
    GenerateTeamPredictions1(fixture_path, current_team_path,horizon)
    GenerateTeamPredictions2(fixture_path, current_team_path,horizon)
    GenerateTeamPredictions_Results(fixture_path, current_team_path,horizon)
    
    
    team_pred1=pd.read_csv("Team_prediction1.csv")
    team_pred2=pd.read_csv("Team_prediction2.csv")
    team_results2=pd.read_csv("Team_prediction_results2.csv")

    # Prefer model-3 outputs when available (triggered from orchestration), else fall back to model-2.
    team_results_path = "Team_prediction_results2.csv"
    try:
        team_pred3 = pd.read_csv("Team_prediction3.csv")
        team_results = pd.read_csv("Team_prediction_results3.csv")
        team_results_path = "Team_prediction_results3.csv"
        print("[GenerateTeamPredictions] Using model-3 files for totals blend.")
    except Exception as e:
        team_pred3 = team_pred2.copy()
        team_results = team_results2.copy()
        print(f"[GenerateTeamPredictions] Model-3 files not used, fallback to model-2: {e}")

    if "win_Percent" not in team_results.columns and "Win_Percent" in team_results.columns:
        team_results["win_Percent"] = team_results["Win_Percent"]
    if "Win_Percent" not in team_results.columns and "win_Percent" in team_results.columns:
        team_results["Win_Percent"] = team_results["win_Percent"]

    pred_keys = ["GW", "pred", "team_code", "Opponent_team", "Home"]
    if all(k in team_pred1.columns for k in pred_keys) and all(k in team_pred3.columns for k in pred_keys):
        team_pred3_small = team_pred3[pred_keys + ["XG", "XGC", "CS"]].copy().rename(
            columns={"XG": "XG_m3", "XGC": "XGC_m3", "CS": "CS_m3"}
        )
        team_pred1 = team_pred1.merge(team_pred3_small, on=pred_keys, how="left")
        team_pred1["XG"] = team_pred2["XG"] * 0.3+team_pred1["XG"] * 0.2 + team_pred1["XG_m3"].fillna(team_pred1["XG"]) * 0.5
        team_pred1["XGC"] = team_pred1["XGC"] * 0.3 + team_pred1["XGC_m3"].fillna(team_pred1["XGC"]) * 0.7
        team_pred1["CS"] = team_pred2["CS"] * 0.4+team_pred1["CS"] * 0.2 + team_pred1["CS_m3"].fillna(team_pred1["CS"]) * 0.4
        team_pred1 = team_pred1.drop(columns=["XG_m3", "XGC_m3", "CS_m3"])
    else:
        team_pred1 = team_pred1.reset_index(drop=True)
        team_pred3 = team_pred3.reset_index(drop=True)
        min_len = min(len(team_pred1), len(team_pred3))
        team_pred1.loc[: min_len - 1, ["XG", "XGC"]] = (
            team_pred1.loc[: min_len - 1, ["XG", "XGC"]].values * 0.3
            + team_pred3.loc[: min_len - 1, ["XG", "XGC"]].values * 0.7
        )
        team_pred1.loc[: min_len - 1, ["CS"]] = (
            team_pred1.loc[: min_len - 1, ["CS"]].values * 0.4
            + team_pred3.loc[: min_len - 1, ["CS"]].values * 0.6
        )

    # Blend in simulator outcomes:
    # final = 0.7 * original_prediction + 0.3 * simulated_result for XG and CS.
    sim_path = "SImulator/match_outcomes_score_predictions.csv"
    sim_df = None
    try:
        sim_df = pd.read_csv(sim_path)
    except Exception as e:
        print(f"[GenerateTeamPredictions] Simulator file not used ({sim_path}): {e}")

    if all(k in team_pred1.columns for k in pred_keys) and all(k in team_results.columns for k in pred_keys):
        team_res_small = team_results[pred_keys + ["win_Percent", "Draw_percent", "Loss_percent"]].copy()
        team_pred1 = team_pred1.merge(team_res_small, on=pred_keys, how="left")
        team_pred1["Win_Percent"] = pd.to_numeric(team_pred1["win_Percent"], errors="coerce").fillna(0)
        team_pred1["Draw_percent"] = pd.to_numeric(team_pred1["Draw_percent"], errors="coerce").fillna(0)
        team_pred1["Loss_percent"] = pd.to_numeric(team_pred1["Loss_percent"], errors="coerce").fillna(0)
    else:
        team_pred1["Win_Percent"] = pd.to_numeric(team_results["win_Percent"], errors="coerce").fillna(0)
        team_pred1["Draw_percent"] = pd.to_numeric(team_results["Draw_percent"], errors="coerce").fillna(0)
        team_pred1["Loss_percent"] = pd.to_numeric(team_results["Loss_percent"], errors="coerce").fillna(0)
    team_pred1 = team_pred1.drop(columns=[c for c in ["win_Percent"] if c in team_pred1.columns])

    if sim_df is not None and not sim_df.empty:
        required_sim_cols = [
            "fixture_code",
            "avg_home_goals",
            "avg_away_goals",
            "home_clean_sheet_pct",
            "away_clean_sheet_pct",
            "home_win_pct",
            "draw_pct",
            "away_win_pct",
        ]
        if all(c in sim_df.columns for c in required_sim_cols):
            sim_use = sim_df[required_sim_cols].copy()
            sim_use = sim_use.rename(
                columns={
                    "avg_home_goals": "sim_home_goals",
                    "avg_away_goals": "sim_away_goals",
                    "home_clean_sheet_pct": "sim_home_cs_pct",
                    "away_clean_sheet_pct": "sim_away_cs_pct",
                    "home_win_pct": "sim_home_win_pct",
                    "draw_pct": "sim_draw_pct",
                    "away_win_pct": "sim_away_win_pct",
                }
            )
            sim_use["fixture_code"] = pd.to_numeric(sim_use["fixture_code"], errors="coerce")

            team_pred1["fixture_code"] = pd.to_numeric(team_pred1["fixture_code"], errors="coerce")
            team_pred1 = team_pred1.merge(sim_use, on="fixture_code", how="left")

            is_home = team_pred1["Home"].astype(str).str.upper().str[0].eq("H")
            sim_xg = pd.Series(
                np.where(is_home, team_pred1["sim_home_goals"], team_pred1["sim_away_goals"]),
                index=team_pred1.index,
            )
            sim_cs = pd.Series(
                np.where(is_home, team_pred1["sim_home_cs_pct"], team_pred1["sim_away_cs_pct"]),
                index=team_pred1.index,
            ) / 100.0

            xg_orig = pd.to_numeric(team_pred1["XG"], errors="coerce")
            cs_orig = pd.to_numeric(team_pred1["CS"], errors="coerce")

            team_pred1["XG"] = np.where(
                sim_xg.notna(),
                xg_orig * 0.7 + sim_xg * 0.3,
                xg_orig,
            )
            team_pred1["CS"] = np.where(
                sim_cs.notna(),
                cs_orig * 0.7 + sim_cs * 0.3,
                cs_orig,
            )

            sim_win = pd.Series(
                np.where(is_home, team_pred1["sim_home_win_pct"], team_pred1["sim_away_win_pct"]),
                index=team_pred1.index,
            )
            sim_draw = pd.to_numeric(team_pred1["sim_draw_pct"], errors="coerce")
            sim_loss = pd.Series(
                np.where(is_home, team_pred1["sim_away_win_pct"], team_pred1["sim_home_win_pct"]),
                index=team_pred1.index,
            )

            # Use already aligned totals columns on team_pred1.
            team_win = pd.to_numeric(team_pred1["Win_Percent"], errors="coerce")
            team_draw = pd.to_numeric(team_pred1["Draw_percent"], errors="coerce")
            team_loss = pd.to_numeric(team_pred1["Loss_percent"], errors="coerce")

            team_pred1["Win_Percent"] = np.where(sim_win.notna(), team_win * 0.7 + sim_win * 0.3, team_win)
            team_pred1["Draw_percent"] = np.where(sim_draw.notna(), team_draw * 0.7 + sim_draw * 0.3, team_draw)
            team_pred1["Loss_percent"] = np.where(sim_loss.notna(), team_loss * 0.7 + sim_loss * 0.3, team_loss)

            drop_cols = [
                "sim_home_goals",
                "sim_away_goals",
                "sim_home_cs_pct",
                "sim_away_cs_pct",
                "sim_home_win_pct",
                "sim_draw_pct",
                "sim_away_win_pct",
            ]
            team_pred1 = team_pred1.drop(columns=[c for c in drop_cols if c in team_pred1.columns])
        else:
            print(
                "[GenerateTeamPredictions] Simulator file found but missing required columns. "
                f"Expected: {required_sim_cols}"
            )

    
    team_pred1.to_csv("Team_prediction.csv")
    
    team_pred_visual1=pd.read_csv("Team_prediction_visual1.csv")
    team_pred_visual2=pd.read_csv("Team_prediction_visual2.csv")
    try:
        team_pred_visual3 = pd.read_csv("Team_prediction_visual3.csv")
        try:
            team_results_visual = pd.read_csv("Team_prediction_visual_results3.csv")
        except Exception:
            team_results_visual = pd.DataFrame(
                {
                    "GW": team_pred_visual3["GW"],
                    "pred": team_pred_visual3["pred"],
                    "home_team": team_pred_visual3["home_team"],
                    "away_team": team_pred_visual3["away_team"],
                    "home_code": team_pred_visual3["home_code"],
                    "away_code": team_pred_visual3["away_code"],
                    "Home_win_Percent": team_pred_visual3["Home_Win"],
                    "Away_win_Percent": team_pred_visual3["Away_Win"],
                    "Draw_percent": team_pred_visual3["Draw"],
                }
            )
        print("[GenerateTeamPredictions] Using model-3 visual files for totals blend.")
    except Exception as e:
        team_pred_visual3 = team_pred_visual2.copy()
        team_results_visual = pd.read_csv("Team_prediction_visual_results2.csv")
        print(f"[GenerateTeamPredictions] Model-3 visual files not used, fallback to model-2: {e}")

    vis_keys = ["GW", "pred", "home_code", "away_code", "home_team", "away_team"]
    if all(k in team_pred_visual1.columns for k in vis_keys) and all(k in team_pred_visual3.columns for k in vis_keys):
        v3_small = team_pred_visual3[
            vis_keys + ["home_goals", "away_goals", "Clean_Sheet_home", "Clean_Sheet_away"]
        ].copy().rename(
            columns={
                "home_goals": "home_goals_m3",
                "away_goals": "away_goals_m3",
                "Clean_Sheet_home": "Clean_Sheet_home_m3",
                "Clean_Sheet_away": "Clean_Sheet_away_m3",
            }
        )
        team_pred_visual1 = team_pred_visual1.merge(v3_small, on=vis_keys, how="left")
        team_pred_visual1["home_goals"] = (
            team_pred_visual1["home_goals"] * 0.3
            + team_pred_visual1["home_goals_m3"].fillna(team_pred_visual1["home_goals"]) * 0.7
        )
        team_pred_visual1["away_goals"] = (
            team_pred_visual1["away_goals"] * 0.3
            + team_pred_visual1["away_goals_m3"].fillna(team_pred_visual1["away_goals"]) * 0.7
        )
        team_pred_visual1["Clean_Sheet_home"] = (
            team_pred_visual1["Clean_Sheet_home"] * 0.4
            + team_pred_visual1["Clean_Sheet_home_m3"].fillna(team_pred_visual1["Clean_Sheet_home"]) * 0.6
        )
        team_pred_visual1["Clean_Sheet_away"] = (
            team_pred_visual1["Clean_Sheet_away"] * 0.4
            + team_pred_visual1["Clean_Sheet_away_m3"].fillna(team_pred_visual1["Clean_Sheet_away"]) * 0.6
        )
        team_pred_visual1 = team_pred_visual1.drop(
            columns=["home_goals_m3", "away_goals_m3", "Clean_Sheet_home_m3", "Clean_Sheet_away_m3"]
        )
    else:
        team_pred_visual1 = team_pred_visual1.reset_index(drop=True)
        team_pred_visual3 = team_pred_visual3.reset_index(drop=True)
        min_len = min(len(team_pred_visual1), len(team_pred_visual3))
        team_pred_visual1.loc[: min_len - 1, ["home_goals", "away_goals"]] = (
            team_pred_visual1.loc[: min_len - 1, ["home_goals", "away_goals"]].values * 0.3
            + team_pred_visual3.loc[: min_len - 1, ["home_goals", "away_goals"]].values * 0.7
        )
        team_pred_visual1.loc[: min_len - 1, ["Clean_Sheet_home", "Clean_Sheet_away"]] = (
            team_pred_visual1.loc[: min_len - 1, ["Clean_Sheet_home", "Clean_Sheet_away"]].values * 0.4
            + team_pred_visual3.loc[: min_len - 1, ["Clean_Sheet_home", "Clean_Sheet_away"]].values * 0.6
        )

    if all(k in team_pred_visual1.columns for k in vis_keys) and all(k in team_results_visual.columns for k in vis_keys):
        rv_small = team_results_visual[vis_keys + ["Home_win_Percent", "Away_win_Percent", "Draw_percent"]].copy()
        team_pred_visual1 = team_pred_visual1.merge(rv_small, on=vis_keys, how="left")
        team_pred_visual1["Home_Win"] = pd.to_numeric(team_pred_visual1["Home_win_Percent"], errors="coerce").fillna(0)
        team_pred_visual1["Away_Win"] = pd.to_numeric(team_pred_visual1["Away_win_Percent"], errors="coerce").fillna(0)
        team_pred_visual1["Draw"] = pd.to_numeric(team_pred_visual1["Draw_percent"], errors="coerce").fillna(0)
    else:
        team_pred_visual1["Home_Win"] = pd.to_numeric(team_results_visual["Home_win_Percent"], errors="coerce").fillna(0)
        team_pred_visual1["Away_Win"] = pd.to_numeric(team_results_visual["Away_win_Percent"], errors="coerce").fillna(0)
        team_pred_visual1["Draw"] = pd.to_numeric(team_results_visual["Draw_percent"], errors="coerce").fillna(0)
    team_pred_visual1 = team_pred_visual1.drop(
        columns=[
            c
            for c in [
                "Home_win_Percent",
                "Away_win_Percent",
                "Draw_percent",
                "Home_win_Percent2",
                "Away_win_Percent2",
                "Draw_percent2",
            ]
            if c in team_pred_visual1.columns
        ]
    )

    # Apply the same 0.7/0.3 blend with simulator match outcomes for visual outputs.
    if sim_df is not None and not sim_df.empty:
        required_sim_cols = [
            "fixture_code",
            "avg_home_goals",
            "avg_away_goals",
            "home_clean_sheet_pct",
            "away_clean_sheet_pct",
            "home_win_pct",
            "draw_pct",
            "away_win_pct",
        ]
        if all(c in sim_df.columns for c in required_sim_cols):
            sim_use = sim_df[required_sim_cols].copy()
            sim_use = sim_use.rename(
                columns={
                    "avg_home_goals": "sim_home_goals",
                    "avg_away_goals": "sim_away_goals",
                    "home_clean_sheet_pct": "sim_home_cs_pct",
                    "away_clean_sheet_pct": "sim_away_cs_pct",
                    "home_win_pct": "sim_home_win_pct",
                    "draw_pct": "sim_draw_pct",
                    "away_win_pct": "sim_away_win_pct",
                }
            )
            sim_use["fixture_code"] = pd.to_numeric(sim_use["fixture_code"], errors="coerce")
            team_pred_visual1["fixture_code"] = pd.to_numeric(team_pred_visual1["fixture_code"], errors="coerce")
            team_pred_visual1 = team_pred_visual1.merge(sim_use, on="fixture_code", how="left")

            hg = pd.to_numeric(team_pred_visual1["home_goals"], errors="coerce")
            ag = pd.to_numeric(team_pred_visual1["away_goals"], errors="coerce")
            hcs = pd.to_numeric(team_pred_visual1["Clean_Sheet_home"], errors="coerce")
            acs = pd.to_numeric(team_pred_visual1["Clean_Sheet_away"], errors="coerce")
            sim_hg = pd.to_numeric(team_pred_visual1["sim_home_goals"], errors="coerce")
            sim_ag = pd.to_numeric(team_pred_visual1["sim_away_goals"], errors="coerce")
            sim_hcs = pd.to_numeric(team_pred_visual1["sim_home_cs_pct"], errors="coerce") / 100.0
            sim_acs = pd.to_numeric(team_pred_visual1["sim_away_cs_pct"], errors="coerce") / 100.0

            team_pred_visual1["home_goals"] = np.where(sim_hg.notna(), hg * 0.8 + sim_hg * 0.2, hg)
            team_pred_visual1["away_goals"] = np.where(sim_ag.notna(), ag * 0.8 + sim_ag * 0.2, ag)
            team_pred_visual1["Clean_Sheet_home"] = np.where(sim_hcs.notna(), hcs * 0.8+ sim_hcs * 0.2, hcs)
            team_pred_visual1["Clean_Sheet_away"] = np.where(sim_acs.notna(), acs * 0.8 + sim_acs * 0.2, acs)

            hw = pd.to_numeric(team_pred_visual1["Home_Win"], errors="coerce")
            aw = pd.to_numeric(team_pred_visual1["Away_Win"], errors="coerce")
            dw = pd.to_numeric(team_pred_visual1["Draw"], errors="coerce")
            sim_hw = pd.to_numeric(team_pred_visual1["sim_home_win_pct"], errors="coerce")
            sim_aw = pd.to_numeric(team_pred_visual1["sim_away_win_pct"], errors="coerce")
            sim_dw = pd.to_numeric(team_pred_visual1["sim_draw_pct"], errors="coerce")

            team_pred_visual1["Home_Win"] = np.where(sim_hw.notna(), hw * 0.7 + sim_hw * 0.3, hw)
            team_pred_visual1["Away_Win"] = np.where(sim_aw.notna(), aw * 0.7 + sim_aw * 0.3, aw)
            team_pred_visual1["Draw"] = np.where(sim_dw.notna(), dw * 0.7 + sim_dw * 0.3, dw)

            drop_cols = [
                "sim_home_goals",
                "sim_away_goals",
                "sim_home_cs_pct",
                "sim_away_cs_pct",
                "sim_home_win_pct",
                "sim_draw_pct",
                "sim_away_win_pct",
            ]
            team_pred_visual1 = team_pred_visual1.drop(columns=[c for c in drop_cols if c in team_pred_visual1.columns])
    team_pred_visual1.to_csv("Team_prediction_visual.csv")
    
    build_current_table_from_fixtures(fixture_path, current_team_path)
    predicted_table = build_predicted_table(
        table_df=pd.read_csv("Current_Table_Standings.csv"),
        prediction_path=team_results_path
    )
    build_predicted_table_with_gw(
        table_df=pd.read_csv("Current_Table_Standings.csv"),
        prediction_path=team_results_path
    )
    
#d

if __name__ == "__main__":
    pass

"""
import warnings
from typing import Tuple, Dict, Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.cluster import KMeans

warnings.filterwarnings("ignore")


# =========================================================
# Utility helpers
# =========================================================
def safe_month_split(
    df: pd.DataFrame,
    date_col: str,
    months_test: int = 2
) -> Tuple[pd.DataFrame, pd.DataFrame]:

    out = df.copy()
    out[date_col] = pd.to_datetime(out[date_col], errors="coerce")
    out = out.dropna(subset=[date_col]).copy()

    if out.empty:
        raise ValueError(f"No valid rows after parsing {date_col}.")

    max_date = out[date_col].max()
    max_period = max_date.to_period("M")
    test_periods = [max_period - i for i in range(months_test)]
    test_periods = set(test_periods)

    month_period = out[date_col].dt.to_period("M")
    test_df = out[month_period.isin(test_periods)].copy()
    train_df = out[~month_period.isin(test_periods)].copy()

    if test_df.empty:
        raise ValueError("Test split is empty. Check your dates and months_test.")

    if train_df.empty:
        raise ValueError("Train split is empty. Check your dates and months_test.")

    return train_df, test_df


def require_columns(df: pd.DataFrame, cols: list, df_name: str = "DataFrame"):
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")


def add_constant_if_needed(X: pd.DataFrame) -> pd.DataFrame:
    if "const" not in X.columns:
        X = sm.add_constant(X, has_constant="add")
    return X


# =========================================================
# Feature builders
# =========================================================
def build_features_concede(df: pd.DataFrame) -> pd.DataFrame:

    require_columns(df, ["Own_XGC", "Opposition_XG"], "build_features_concede input")

    X = pd.DataFrame(index=df.index)
    X["Own_XGC"] = pd.to_numeric(df["Own_XGC"], errors="coerce")
    X["Opposition_XG"] = pd.to_numeric(df["Opposition_XG"], errors="coerce")
    X["Interaction"] = X["Own_XGC"] * X["Opposition_XG"]

    X = add_constant_if_needed(X)
    X = X.replace([np.inf, -np.inf], np.nan).dropna()
    return X


def build_features_for(df: pd.DataFrame) -> pd.DataFrame:

    require_columns(df, ["Own_XG", "Opposition_XGC"], "build_features_for input")

    X = pd.DataFrame(index=df.index)
    X["Own_XG"] = pd.to_numeric(df["Own_XG"], errors="coerce")
    X["Opposition_XGC"] = pd.to_numeric(df["Opposition_XGC"], errors="coerce")
    X["Interaction_for"] = X["Own_XG"] * X["Opposition_XGC"]

    X = add_constant_if_needed(X)
    X = X.replace([np.inf, -np.inf], np.nan).dropna()
    return X


# =========================================================
# NB2 fitting
# =========================================================
def fit_nb2_discrete(
    y: pd.Series,
    X: pd.DataFrame
) -> Tuple[Any, pd.Series, float]:

    aligned = pd.concat([y.rename("target"), X], axis=1).dropna().copy()
    y_aligned = aligned["target"]
    X_aligned = aligned.drop(columns=["target"])

    if len(aligned) < 20:
        raise ValueError("Too few rows to fit model after dropping missing values.")

    model = sm.NegativeBinomial(y_aligned, X_aligned).fit(disp=False)
    params = model.params.copy()

    if "alpha" in params.index:
        alpha = float(params["alpha"])
        beta = params.drop("alpha")
        return model, beta, alpha

    alpha_candidates = [c for c in params.index if "alpha" in c.lower()]
    if not alpha_candidates:
        raise RuntimeError(f"Could not find alpha-like parameter in {list(params.index)}")

    alpha_name = alpha_candidates[0]
    alpha_raw = float(params[alpha_name])

    if "ln" in alpha_name.lower() or "log" in alpha_name.lower():
        alpha = float(np.exp(alpha_raw))
    else:
        alpha = alpha_raw

    beta = params.drop(alpha_name)
    return model, beta, alpha


# =========================================================
# Prediction helpers
# =========================================================
def predict_mu(beta: pd.Series, X: pd.DataFrame) -> np.ndarray:

    X2 = X[beta.index].copy()
    eta = X2.values @ beta.values
    return np.exp(eta)


def cs_prob_poisson(mu_concede: np.ndarray) -> np.ndarray:

    return np.exp(-mu_concede)


def cs_prob_nb2(mu_concede: np.ndarray, alpha: float) -> np.ndarray:

    if alpha < 1e-8:
        return cs_prob_poisson(mu_concede)
    return (1.0 / (1.0 + alpha * mu_concede)) ** (1.0 / alpha)


# =========================================================
# Formula printers
# =========================================================
def print_formula_concede(beta: pd.Series, alpha: float, use_nb2: bool = True):
    b0 = float(beta.get("const", np.nan))
    b1 = float(beta.get("Own_XGC", np.nan))
    b2 = float(beta.get("Opposition_XG", np.nan))
    b3 = float(beta.get("Interaction", np.nan))

    print("\n" + "=" * 100)
    print("FORMULA A: PREDICTED GOALS CONCEDED (mu_concede) + CLEAN SHEET PROBABILITY/Odds")
    print("=" * 100)

    print("\n1) Interaction:")
    print("   Interaction = Own_XGC * Opposition_XG")

    print("\n2) Linear predictor (eta_concede):")
    print(f"   eta_concede = {b0:.10f} + ({b1:.10f})*Own_XGC + ({b2:.10f})*Opposition_XG + ({b3:.10f})*Interaction")

    print("\n3) Predicted mean goals conceded:")
    print("   mu_concede = exp(eta_concede)")

    print("\n4) Clean sheet probability:")
    if use_nb2:
        print(f"   alpha = {alpha:.10f}")
        print("   P(CS=1) = (1 / (1 + alpha*mu_concede))^(1/alpha)")
        if alpha < 1e-8:
            print("   NOTE: alpha ~ 0 => NB2 ~ Poisson => P(CS=1) ~ exp(-mu_concede)")
    else:
        print("   P(CS=1) = exp(-mu_concede)")

    print("\n5) Clean sheet odds:")
    print("   odds = P(CS=1) / (1 - P(CS=1))")
    print("   decimal_odds = 1 / P(CS=1)")
    print("=" * 100 + "\n")


def print_formula_for(beta: pd.Series, alpha: float):
    g0 = float(beta.get("const", np.nan))
    g1 = float(beta.get("Own_XG", np.nan))
    g2 = float(beta.get("Opposition_XGC", np.nan))
    g3 = float(beta.get("Interaction_for", np.nan))

    print("\n" + "=" * 100)
    print("FORMULA B: PREDICTED GOALS FOR / XG (mu_for)")
    print("=" * 100)

    print("\n1) Interaction:")
    print("   Interaction_for = Own_XG * Opposition_XGC")

    print("\n2) Linear predictor (eta_for):")
    print(f"   eta_for = {g0:.10f} + ({g1:.10f})*Own_XG + ({g2:.10f})*Opposition_XGC + ({g3:.10f})*Interaction_for")

    print("\n3) Predicted mean goals for / XG:")
    print("   mu_for = exp(eta_for)")

    print("\n(If you fit NB2 here too, alpha is printed for completeness.)")
    print(f"   alpha_for = {alpha:.10f}")

    print("=" * 100 + "\n")


# =========================================================
# Main pipeline
# =========================================================
def GenerateTeamPredictions1(
    csv_path: str = "Team_data_transformed2.csv",
    months_test: int = 2,
    goals_conceded_col: str = "Goals_Conceded",
    goals_scored_col: str = "Goals_Scored",
    allow_xg_proxy_if_missing: bool = True,
    clamp_low: float = 0.1,
    clamp_high: float = 0.99,
    output_csv_path: str = "nb2_test_predictions.csv",
) -> Dict[str, Any]:
    # -----------------------------------------------------
    # Load
    # -----------------------------------------------------
    raw_df = pd.read_csv(csv_path)
    team_df = raw_df.iloc[:, 1:].copy() if raw_df.shape[1] > 1 else raw_df.copy()

    required_base_cols = [
        "name", "code", "opponent", "kickoff_time", "was_home",
        "XG", "XGC", "Clean_Sheet",
        "XGA", "XGCA", "XGH", "XGCH",
        "XG_slope", "XGC_slope", "XG_avg", "XGC_avg",
        "Rolling_Threat", "Rolling_Threat_Against",
        "roll10_xpts", "roll10_deep", "roll10_deep_allowed"
    ]
    require_columns(team_df, required_base_cols, "Input CSV")

    # -----------------------------------------------------
    # Fill slope NAs
    # -----------------------------------------------------
    team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
    team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

    # -----------------------------------------------------
    # KMeans clusters
    # -----------------------------------------------------
    cluster_data = team_df[["XG_avg", "XGC_avg"]].copy()
    cluster_data = cluster_data.fillna(cluster_data.median())

    kmeans = KMeans(n_clusters=4, random_state=31, n_init=10)
    kmeans.fit(cluster_data.values)
    team_df["Cluster"] = kmeans.predict(cluster_data.values)

    # -----------------------------------------------------
    # Opponent table
    # -----------------------------------------------------
    opponent_df = team_df[[
        "code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time",
        "XG_slope", "XGC_slope", "XG_avg", "XGC_avg", "Cluster",
        "Rolling_Threat", "Rolling_Threat_Against",
        "roll10_xpts", "roll10_deep", "roll10_deep_allowed"
    ]].copy()

    pred_df = pd.merge(
        team_df,
        opponent_df,
        left_on=["opponent", "kickoff_time"],
        right_on=["code", "kickoff_time"],
        how="left",
        suffixes=("_team", "_opp")
    )

    # -----------------------------------------------------
    # Rolling cluster features
    # -----------------------------------------------------
    new_pred_df = pd.DataFrame()
    latest_df = pd.DataFrame()

    pred_df["kickoff_time"] = pd.to_datetime(pred_df["kickoff_time"], errors="coerce")
    pred_df = pred_df.dropna(subset=["kickoff_time"]).copy()

    for team_code in pred_df["code_team"].dropna().unique():
        code_df = pred_df[pred_df["code_team"] == team_code].copy()
        code_df = code_df.sort_values(by="kickoff_time")

        code_df["Cluster_XG"] = code_df.groupby("Cluster_opp")["XG"].transform(
            lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()
        )
        code_df["Cluster_XGC"] = code_df.groupby("Cluster_opp")["XGC"].transform(
            lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()
        )
        code_df["Cluster_CS"] = code_df.groupby("Cluster_opp")["Clean_Sheet"].transform(
            lambda x: x.shift(1).rolling(window=6, min_periods=1).mean()
        )

        code_df["Cluster_XG"] = code_df["Cluster_XG"].fillna(code_df["Cluster_XG"].mean())
        code_df["Cluster_XGC"] = code_df["Cluster_XGC"].fillna(code_df["Cluster_XGC"].mean())
        code_df["Cluster_CS"] = code_df["Cluster_CS"].fillna(code_df["Cluster_CS"].mean())

        latest_rows = code_df.loc[
            code_df.groupby("Cluster_opp")["kickoff_time"].idxmax(),
            ["code_team", "Cluster_opp", "Cluster_XG", "Cluster_XGC", "Cluster_CS"]
        ]

        latest_df = pd.concat([latest_df, latest_rows], ignore_index=True)
        new_pred_df = pd.concat([new_pred_df, code_df], ignore_index=True)

    latest_df.to_csv("Team_cluster_data.csv", index=False)
    pred_df = new_pred_df.copy()

    # -----------------------------------------------------
    # Base model dataframe
    # -----------------------------------------------------
    Model_pred = pred_df[[
        "name", "kickoff_time", "was_home", "XG", "XGC", "Clean_Sheet"
    ]].copy()

    Model_pred["kickoff_time"] = pd.to_datetime(Model_pred["kickoff_time"], errors="coerce")
    Model_pred = Model_pred.dropna(subset=["kickoff_time"]).copy()

    Model_pred["Own_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGH_team"], pred_df["XGA_team"])
    Model_pred["Own_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCH_team"], pred_df["XGCA_team"])
    Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGA_opp"], pred_df["XGH_opp"])
    Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])

    # -----------------------------------------------------
    # Target selection
    # -----------------------------------------------------
    if goals_conceded_col in pred_df.columns:
        Model_pred[goals_conceded_col] = pred_df[goals_conceded_col].values
        y_concede_col = goals_conceded_col
        print(f"Using real concede target column: {y_concede_col}")
    else:
        if not allow_xg_proxy_if_missing:
            raise ValueError(
                f"Missing '{goals_conceded_col}' and allow_xg_proxy_if_missing=False."
            )
        y_concede_col = "XGC"
        Model_pred[y_concede_col] = pd.to_numeric(Model_pred["XGC"], errors="coerce")
        print("Goals_Conceded column not found, using XGC as proxy target.")

    if goals_scored_col in pred_df.columns:
        Model_pred[goals_scored_col] = pred_df[goals_scored_col].values
        y_for_col = goals_scored_col
        print(f"Using real scoring target column: {y_for_col}")
    else:
        if not allow_xg_proxy_if_missing:
            raise ValueError(
                f"Missing '{goals_scored_col}' and allow_xg_proxy_if_missing=False."
            )
        y_for_col = "XG"
        Model_pred[y_for_col] = pd.to_numeric(Model_pred["XG"], errors="coerce")
        print("Goals_Scored column not found, using XG as proxy target.")

    # -----------------------------------------------------
    # Split
    # -----------------------------------------------------
    train_df, test_df = safe_month_split(Model_pred, "kickoff_time", months_test=months_test)
    train_df = train_df[train_df["kickoff_time"] > "2022-12-31"].copy()

    if train_df.empty:
        raise ValueError("No training data after filtering kickoff_time > 2022-12-31.")

    # -----------------------------------------------------
    # Fit concede model
    # -----------------------------------------------------
    Xc_train = build_features_concede(train_df)
    yc_train = train_df.loc[Xc_train.index, y_concede_col].copy()

    if y_concede_col != "XGC":
        yc_train = pd.to_numeric(yc_train, errors="coerce").fillna(0).astype(int).clip(lower=0)
    else:
        yc_train = pd.to_numeric(yc_train, errors="coerce")

    nb_concede_model, beta_concede, alpha_concede = fit_nb2_discrete(yc_train, Xc_train)

    # -----------------------------------------------------
    # Fit for / XG model
    # -----------------------------------------------------
    Xf_train = build_features_for(train_df)
    yf_train = train_df.loc[Xf_train.index, y_for_col].copy()

    if y_for_col != "XG":
        yf_train = pd.to_numeric(yf_train, errors="coerce").fillna(0).astype(int).clip(lower=0)
    else:
        yf_train = pd.to_numeric(yf_train, errors="coerce")

    nb_for_model, beta_for, alpha_for = fit_nb2_discrete(yf_train, Xf_train)

    # -----------------------------------------------------
    # Print formulas
    # -----------------------------------------------------
    print_formula_concede(beta_concede, alpha_concede, use_nb2=True)
    print_formula_for(beta_for, alpha_for)

    # -----------------------------------------------------
    # Predict on test
    # -----------------------------------------------------
    Xc_test = build_features_concede(test_df)
    test_aligned = test_df.loc[Xc_test.index].copy()

    mu_concede = predict_mu(beta_concede, Xc_test)
    p_cs = cs_prob_nb2(mu_concede, alpha_concede)

    Xf_test = build_features_for(test_aligned)
    common_idx = Xf_test.index.intersection(test_aligned.index)

    test_aligned = test_aligned.loc[common_idx].copy()
    Xc_test = Xc_test.loc[common_idx].copy()
    Xf_test = Xf_test.loc[common_idx].copy()

    mu_concede = predict_mu(beta_concede, Xc_test)
    p_cs = cs_prob_nb2(mu_concede, alpha_concede)
    mu_for = predict_mu(beta_for, Xf_test)

    # -----------------------------------------------------
    # Output frame
    # -----------------------------------------------------
    out = test_aligned.copy()
    out["Pred_Goals_Conceded_mu"] = mu_concede
    out["Pred_XG_mu"] = mu_for
    out["CS_prob_raw"] = p_cs
    out["CS_prob"] = out["CS_prob_raw"].clip(clamp_low, clamp_high)
    out["CS_odds"] = out["CS_prob"] / (1.0 - out["CS_prob"])
    out["CS_decimal_odds"] = 1.0 / out["CS_prob"]

    out.to_csv(output_csv_path, index=False)

    show_cols = [
        "name", "kickoff_time", "was_home",
        "Own_XG", "Own_XGC", "Opposition_XG", "Opposition_XGC",
        "Pred_XG_mu", "Pred_Goals_Conceded_mu",
        "CS_prob", "CS_decimal_odds"
    ]
    show_cols = [c for c in show_cols if c in out.columns]

    print("\nPreview of predictions:")
    print(out[show_cols].head(30))
    print(f"\nSaved predictions to: {output_csv_path}")

    return {
        "nb_concede_model": nb_concede_model,
        "beta_concede": beta_concede,
        "alpha_concede": alpha_concede,
        "nb_for_model": nb_for_model,
        "beta_for": beta_for,
        "alpha_for": alpha_for,
        "train_df": train_df,
        "test_df_predictions": out,
        "y_concede_col_used": y_concede_col,
        "y_for_col_used": y_for_col,
        "kmeans_model": kmeans,
    }


# =========================================================
# Run
# =========================================================
if __name__ == "__main__":
    results = GenerateTeamPredictions1(
        csv_path="Team_data_transformed2.csv",
        months_test=2,
        goals_conceded_col="Goals_Conceded",   # change if your real column name differs
        goals_scored_col="Goals_Scored",       # change if your real column name differs
        allow_xg_proxy_if_missing=True,
        clamp_low=0.1,
        clamp_high=0.99,
        output_csv_path="nb2_test_predictions.csv",
    )

    print("\nConcede betas:")
    print(results["beta_concede"])
    print("Concede alpha:", results["alpha_concede"])

    print("\nFor/XG betas:")
    print(results["beta_for"])
    print("For/XG alpha:", results["alpha_for"])
"""
