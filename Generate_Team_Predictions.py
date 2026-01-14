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
    
         
    xg_stat_h=-0.17+(new_input_XG["off_fac"]*new_input_XG["def_fac"])*0.275+(new_input_XG["off_fac"]*0.37+0.37*new_input_XG["def_fac"])
    
    new_input_XG2["off_fac"]=new_input_XG2["Own_XG"]*0.7+0.3*new_input_XG2["Own_XG_avg"]
    new_input_XG2["def_fac"]=new_input_XG2["Opposition_XGC"]*0.7+0.3*new_input_XG2["Opposition_XGC_avg"]
    xg_stat_a=-0.17+(new_input_XG2["off_fac"]*new_input_XG2["def_fac"])*0.275+(new_input_XG2["off_fac"]*0.37+0.37*new_input_XG2["def_fac"])
    
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
    
    
         
    css_stat_home=0.4/(new_input_XGC["Own_XGC"]*0.6+0.4*new_input_XGC["Opposition_XG"])

    

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
    
    css_stat_away=0.4/(new_input_XGC2["Own_XGC"]*0.6+0.4*new_input_XGC2["Opposition_XG"])


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
    result_df["home_goals"]=(xg*0.7+0.3*xg_stat_h)
    result_df["away_goals"]=(xg2*0.7+0.3*xg_stat_a)
    result_df["Clean_Sheet_home"]=css_test*0.7+0.3*css_stat_home
    result_df["Clean_Sheet_away"]=css_test2*0.7+0.3*css_stat_away
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
    
    team_pred1[["XG","XGC"]]=team_pred1[["XG","XGC"]]*0.5+team_pred2[["XG","XGC"]]*0.5
    team_pred1[["CS"]]=team_pred1[["CS"]]*0.5+team_pred2[["CS"]]*0.5

    
    team_pred1.to_csv("Team_prediction.csv")
    
    team_pred_visual1=pd.read_csv("Team_prediction_visual1.csv")
    team_pred_visual2=pd.read_csv("Team_prediction_visual2.csv")
    
    team_pred_visual1[["home_goals","away_goals"]]=team_pred_visual1[["home_goals","away_goals"]]*0.5+team_pred_visual2[["home_goals","away_goals"]]*0.5
    team_pred_visual1[["Clean_Sheet_home","Clean_Sheet_away"]]=team_pred_visual1[["Clean_Sheet_home","Clean_Sheet_away"]]*0.5+team_pred_visual2[["Clean_Sheet_home","Clean_Sheet_away"]]*0.5

    team_pred_visual1.to_csv("Team_prediction_visual.csv")
    

if __name__ == "__main__":
    pass
