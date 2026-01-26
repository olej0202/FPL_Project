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

    opponent_df = team_df[["code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time", "XG_slope", "XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","roll10_deep_allowed"]].copy()

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
    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Opposition_XPTS',"Own_DEEP",'Own_XPTS']
    #features = ['Own_XG', 'Own_XGC', 'Opposition_XG', 'Opposition_XGC'] # Exclude target and date
    target = 'XG'

    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]


    
    params = {
            'max_depth': 5,
            'eta': 0.1,
            'objective': 'reg:squarederror',  # Use 'reg:squarederror' for regression
            'eval_metric': 'rmse',             # Use 'rmse' (root mean squared error) for evaluation
            'tree_method':'hist',
            'grow_policy': 'lossguide',
            'lambda': 2, 
            'gamma':0.1,
            'min_child_weight': 6
        }

    num_rounds = 60
    dtrain = xgb.DMatrix(X_train, label=y_train,enable_categorical=True)
    model_xg = xgb.train(params, dtrain, num_rounds)
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
    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP"]
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

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep"]]
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
    df_merged = predict_data.merge(team_data[["code","XGA","XGCA","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep"]], left_on='team_a', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_data[["code","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep"]], left_on='team_h', right_on='code', how='left')  # Left join to keep all rows from df2
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





    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Own_Treat','Opposition_TreatAgainst','Opposition_XPTS',"Own_DEEP",'Own_XPTS']

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
    new_input_XG['Opposition_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XG['Own_DEEP']=df_merged["roll10_deep_y"]
    new_input_XG['Own_XPTS']=df_merged["roll10_xpts_y"]
    


    

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
    new_input_XG2['Opposition_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XG2['Own_DEEP']=df_merged["roll10_deep_x"]
    new_input_XG2['Own_XPTS']=df_merged["roll10_xpts_x"]



    new_input_XG.to_csv("teams_preds_test.csv")

    XG1= xgb.DMatrix(new_input_XG)
    XG2= xgb.DMatrix(new_input_XG2)

    xg = model_xg.predict(new_input_XG)
    xg2 = model_xg.predict(new_input_XG2)

    
    


    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP"]
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
    result_df["home_goals"]=((xg+xgc2)/2)*0.7+0.3*stat_XG_HOME
    result_df["away_goals"]=((xgc+xg2)/2)*0.7+0.3*stat_XG_AWAY
    result_df["Clean_Sheet_home"]=css1
    result_df["Clean_Sheet_away"]=css2
    result_df["test_XG"]=stat_XG_HOME
    result_df["test_cluster"]=stat_XG_AWAY
    result_df["test_opp_XGC"]=css2
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
        max_depth=5,
        learning_rate=0.01,
        n_estimators=200,
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
        max_depth=5,
        learning_rate=0.01,
        n_estimators=200,
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

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC"]]
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
    df_merged = predict_data.merge(team_data[["code","XGA","XGCA","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC"]], left_on='team_a', right_on='code', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_data[["code","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep","Rolling_XG","Rolling_XGC"]], left_on='team_h', right_on='code', how='left')  # Left join to keep all rows from df2
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
    
    new_input_XG["off_fac"]=new_input_XG["Own_XG"]*0.7+0.3*new_input_XG["Own_XG_avg"]
    new_input_XG["def_fac"]=new_input_XG["Opposition_XGC"]*0.7+0.3*new_input_XG["Opposition_XGC_avg"]
    
         
    eta = (
    -2.76
    + 1.29 * new_input_XG["off_fac"]
    + 1.39 * new_input_XG["def_fac"]
    - 0.13 * new_input_XG["off_fac"] * new_input_XG["def_fac"]
    )

    xg_stat_h = np.exp(0.5 * eta)
    
    new_input_XG2["off_fac"]=new_input_XG2["Own_XG"]*0.7+0.3*new_input_XG2["Own_XG_avg"]
    new_input_XG2["def_fac"]=new_input_XG2["Opposition_XGC"]*0.7+0.3*new_input_XG2["Opposition_XGC_avg"]
    eta2 = (-2.76
        + 1.29 * new_input_XG2["off_fac"]
        + 1.39 * new_input_XG2["def_fac"]
        - 0.13 * new_input_XG2["off_fac"] * new_input_XG2["def_fac"]
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
            -1.3552097488
            + 0.6777300426 * new_input_XGC["Own_XGC"]
            + 0.62156006874 * new_input_XGC["Opposition_XG"]
            - 0.0503581036 * new_input_XGC["Own_XGC"] * new_input_XGC["Opposition_XG"]
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
            -1.3552097488
            + 0.6777300426 * new_input_XGC2["Own_XGC"]
            + 0.62156006874 * new_input_XGC2["Opposition_XG"]
            - 0.0503581036 * new_input_XGC2["Own_XGC"] * new_input_XGC2["Opposition_XG"]
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
    result_df["test_XG"]=xg_stat_h
    result_df["test_cluster"]=xg_stat_a
    result_df["test_opp_XGC"]=xg2
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






def GenerateTeamPredictions(fixture_path, current_team_path,horizon):
    GenerateTeamPredictions1(fixture_path, current_team_path,horizon)
    GenerateTeamPredictions2(fixture_path, current_team_path,horizon)
    
    
    team_pred1=pd.read_csv("Team_prediction1.csv")
    team_pred2=pd.read_csv("Team_prediction2.csv")
    
    team_pred1[["XG","XGC"]]=team_pred1[["XG","XGC"]]*0.3+team_pred2[["XG","XGC"]]*0.7
    team_pred1[["CS"]]=team_pred1[["CS"]]*0.4+team_pred2[["CS"]]*0.6

    
    team_pred1.to_csv("Team_prediction.csv")
    
    team_pred_visual1=pd.read_csv("Team_prediction_visual1.csv")
    team_pred_visual2=pd.read_csv("Team_prediction_visual2.csv")
    
    team_pred_visual1[["home_goals","away_goals"]]=team_pred_visual1[["home_goals","away_goals"]]*0.5+team_pred_visual2[["home_goals","away_goals"]]*0.5
    team_pred_visual1[["Clean_Sheet_home","Clean_Sheet_away"]]=team_pred_visual1[["Clean_Sheet_home","Clean_Sheet_away"]]*0.5+team_pred_visual2[["Clean_Sheet_home","Clean_Sheet_away"]]*0.5

    team_pred_visual1.to_csv("Team_prediction_visual.csv")
    

if __name__ == "__main__":
    pass


"""
    Fits statsmodels.discrete.NegativeBinomial to estimate beta and alpha.
    Returns (model, beta_series, alpha_float).

    IMPORTANT:
    - For true NB2, y should be a nonnegative integer count.
    - If y is continuous (e.g. XG), this is pragmatic but not statistically pure.
    model = sm.NegativeBinomial(y, X).fit(disp=False)
    params = model.params.copy()

    # Alpha extraction robustly
    if "alpha" in params.index:
        alpha = float(params["alpha"])
        beta = params.drop("alpha")
        return model, beta, alpha

    # Otherwise alpha might be logged under some name
    alpha_candidates = [c for c in params.index if "alpha" in c.lower()]
    if not alpha_candidates:
        raise RuntimeError(f"Could not find alpha-like parameter in {list(params.index)}")

    alpha_name = alpha_candidates[0]
    alpha_raw = float(params[alpha_name])
    # If the name suggests log/ln, exponentiate
    if "ln" in alpha_name.lower() or "log" in alpha_name.lower():
        alpha = float(np.exp(alpha_raw))
    else:
        alpha = alpha_raw

    beta = params.drop(alpha_name)
    return model, beta, alpha


# -------------------------
# Predict mu and CS probability
# -------------------------
def predict_mu(beta: pd.Series, X: pd.DataFrame) -> np.ndarray:
    # mu = exp(X beta)
    eta = X.values @ beta.values
    return np.exp(eta)


def cs_prob_poisson(mu_concede: np.ndarray) -> np.ndarray:
    # Poisson P(Y=0) = exp(-mu)
    return np.exp(-mu_concede)


def cs_prob_nb2(mu_concede: np.ndarray, alpha: float) -> np.ndarray:
    # NB2 P(Y=0) = (1 / (1 + alpha*mu))^(1/alpha)
    # Numerically stable even when alpha is small-ish, but if alpha ~ 0 use Poisson.
    if alpha < 1e-8:
        return cs_prob_poisson(mu_concede)
    return (1.0 / (1.0 + alpha * mu_concede)) ** (1.0 / alpha)


# -------------------------
# Print explicit deployable formulas
# -------------------------
def print_formula_concede(beta: pd.Series, alpha: float, use_nb2: bool = True):
    b0 = float(beta.get("const", np.nan))
    b1 = float(beta.get("Own_XGC", np.nan))
    b2 = float(beta.get("Opposition_XG", np.nan))
    b3 = float(beta.get("Interaction", np.nan))

    print("\n" + "=" * 100)
    print("FORMULA A: PREDICTED GOALS CONCEDED (mu_concede) + CLEAN SHEET PROBABILITY/Odds")
    print("=" * 100)

    print("\n1) Interaction:")
    print("   interaction = Own_XGC * Opposition_XG")

    print("\n2) Linear predictor (eta_concede):")
    print(f"   eta_concede = {b0:.10f} + ({b1:.10f})*Own_XGC + ({b2:.10f})*Opposition_XG + ({b3:.10f})*interaction")

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
    print("   interaction_for = Own_XG * Opposition_XGC")

    print("\n2) Linear predictor (eta_for):")
    print(f"   eta_for = {g0:.10f} + ({g1:.10f})*Own_XG + ({g2:.10f})*Opposition_XGC + ({g3:.10f})*interaction_for")

    print("\n3) Predicted mean goals for / XG:")
    print("   mu_for = exp(eta_for)")

    print("\n(If you fit NB2 here too, alpha is printed for completeness.)")
    print(f"   alpha_for = {alpha:.10f}")

    print("=" * 100 + "\n")


# -------------------------
# Main pipeline (your data prep + fitting + prediction)
# -------------------------
def GenerateTeamPredictions1(
    csv_path: str = "Team_data_transformed2.csv",
    months_test: int = 2,
    # Provide real count columns if you have them, otherwise fall back to XGC/XG:
    goals_conceded_col: str = "Goals_Conceded",
    goals_scored_col: str = "Goals_Scored",
    allow_xg_proxy_if_missing: bool = True,
    clamp_low: float = 0.1,
    clamp_high: float = 0.99,
):
    # ---- Load
    team_df = pd.read_csv(csv_path).iloc[:, 1:].copy()

    # ---- Fill slopes
    team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
    team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

    # ---- KMeans clusters
    cluster_data = team_df[["XG_avg", "XGC_avg"]].values
    kmeans = KMeans(n_clusters=4, random_state=31)
    kmeans.fit(cluster_data)
    team_df["Cluster"] = kmeans.predict(cluster_data)

    # ---- Opponent table
    opponent_df = team_df[[
        "code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time",
        "XG_slope", "XGC_slope", "XG_avg", "XGC_avg", "Cluster",
        "Rolling_Threat", "Rolling_Threat_Against",
        "roll10_xpts", "roll10_deep", "roll10_deep_allowed"
    ]].copy()

    pred_df = pd.merge(
        team_df, opponent_df,
        left_on=["opponent", "kickoff_time"],
        right_on=["code", "kickoff_time"],
        how="left",
        suffixes=("_team", "_opp")
    )

    # ---- Your per-team rolling cluster features
    new_pred_df = pd.DataFrame()
    latest_df = pd.DataFrame()

    for team_code in pred_df["code_team"].unique():
        code_df = pred_df[pred_df["code_team"] == team_code].copy()
        code_df = code_df.sort_values(by="kickoff_time")
        code_df["kickoff_time"] = pd.to_datetime(code_df["kickoff_time"])

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

    # ---- Base model dataframe (extend here if you have score columns!)
    Model_pred = pred_df[["name", "kickoff_time", "was_home", "XG", "XGC", "Clean_Sheet"]].copy()
    Model_pred["kickoff_time"] = pd.to_datetime(Model_pred["kickoff_time"])

    Model_pred["Own_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGH_team"], pred_df["XGA_team"])
    Model_pred["Own_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCH_team"], pred_df["XGCA_team"])
    Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"] == 1, pred_df["XGA_opp"], pred_df["XGH_opp"])
    Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"] == 1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])

    # ---- Count targets (preferred) else proxy
    # Goals Conceded
    if goals_conceded_col in pred_df.columns:
        Model_pred[goals_conceded_col] = pred_df[goals_conceded_col].values
        y_concede_col = goals_conceded_col
    else:
        if not allow_xg_proxy_if_missing:
            raise ValueError(f"Missing '{goals_conceded_col}' and allow_xg_proxy_if_missing=False.")
        y_concede_col = "XGC"  # fallback proxy
        Model_pred[y_concede_col] = Model_pred["XGC"].astype(float)

    # Goals Scored
    if goals_scored_col in pred_df.columns:
        Model_pred[goals_scored_col] = pred_df[goals_scored_col].values
        y_for_col = goals_scored_col
    else:
        if not allow_xg_proxy_if_missing:
            raise ValueError(f"Missing '{goals_scored_col}' and allow_xg_proxy_if_missing=False.")
        y_for_col = "XG"  # fallback proxy
        Model_pred[y_for_col] = Model_pred["XG"].astype(float)

    # ---- Train/test split (last N months test)
    train_df, test_df = safe_month_split(Model_pred, "kickoff_time", months_test=months_test)
    train_df = train_df[train_df["kickoff_time"] > "2022-12-31"].copy()

    # ---- Fit model A (concede)
    Xc_train = build_features_concede(train_df)
    yc_train = train_df[y_concede_col].copy()

    # If it's meant to be count, enforce nonneg int
    if y_concede_col != "XGC":
        yc_train = yc_train.astype(int).clip(lower=0)

    nb_concede_model, beta_concede, alpha_concede = fit_nb2_discrete(yc_train, Xc_train)

    # ---- Fit model B (for / XG)
    Xf_train = build_features_for(train_df)
    yf_train = train_df[y_for_col].copy()

    if y_for_col not in ["XG"]:
        yf_train = yf_train.astype(int).clip(lower=0)

    nb_for_model, beta_for, alpha_for = fit_nb2_discrete(yf_train, Xf_train)

    # ---- Print explicit formulas with fitted parameters
    print_formula_concede(beta_concede, alpha_concede, use_nb2=True)
    print_formula_for(beta_for, alpha_for)

    # ---- Predict on test (concede)
    Xc_test = build_features_concede(test_df)
    mu_concede = predict_mu(beta_concede, Xc_test)

    # Clean sheet probability
    p_cs = cs_prob_nb2(mu_concede, alpha_concede)

    # ---- Predict on test (for / XG)
    Xf_test = build_features_for(test_df)
    mu_for = predict_mu(beta_for, Xf_test)

    # ---- Assemble outputs
    out = test_df.copy()
    out["Pred_Goals_Conceded_mu"] = mu_concede
    out["Pred_XG_mu"] = mu_for  # "goals for mean" if trained on goals; "xG mean" if trained on XG proxy
    out["CS_prob_raw"] = p_cs

    # Clamp predictions only (not labels)
    out["CS_prob"] = out["CS_prob_raw"].clip(clamp_low, clamp_high)

    out["CS_odds"] = out["CS_prob"] / (1.0 - out["CS_prob"])
    out["CS_decimal_odds"] = 1.0 / out["CS_prob"]

    # ---- Preview
    show_cols = [
        "name", "kickoff_time", "was_home",
        "Own_XG", "Own_XGC", "Opposition_XG", "Opposition_XGC",
        "Pred_XG_mu", "Pred_Goals_Conceded_mu",
        "CS_prob", "CS_decimal_odds"
    ]
    show_cols = [c for c in show_cols if c in out.columns]
    print(out[show_cols].head(30))

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
    }


# -------------------------
# Run
# -------------------------
if __name__ == "__main__":
    results = GenerateTeamPredictions1(
        csv_path="Team_data_transformed2.csv",
        months_test=2,
        goals_conceded_col="Goals_Conceded",  # <-- CHANGE to your real column if present
        goals_scored_col="Goals_Scored",      # <-- CHANGE to your real column if present
        allow_xg_proxy_if_missing=True,       # fallback to XGC/XG if goals columns aren't present
        clamp_low=0.1,
        clamp_high=0.99,
    )

    # If you want to access fitted coefficients directly:
    print("\nConcede betas:\n", results["beta_concede"])
    print("Concede alpha:", results["alpha_concede"])

    print("\nFor/XG betas:\n", results["beta_for"])
    print("For/XG alpha:", results["alpha_for"])
"""