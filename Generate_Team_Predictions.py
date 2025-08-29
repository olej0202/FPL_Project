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


def GenerateTeamPredictions1(fixture_path, current_team_path,horizon):
    team_df = pd.read_csv("Team_data_transformed4.csv").iloc[:, 1:]

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
    test_df = Model_pred[(Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-1)| 
                   (Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-3) ]
    train_df = Model_pred[(Model_pred['kickoff_time'].dt.year < current_year) | 
                     ((Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month < current_month-3))]
    train_df=train_df[train_df['kickoff_time']>'2022-12-31']



    # Define Features and Target
    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XG','Own_Treat','Opposition_TreatAgainst','Opposition_XPTS',"Own_DEEP",'Own_XPTS']
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
    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XGC','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP"]
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

    fixture_data=pd.read_csv(fixture_path)[["event","team_a","team_h","finished"]]
    team_code_data=pd.read_csv(current_team_path)[["name","code","id"]]

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep"]]
    team_data["Cluster"]=kmeans.predict(team_data[["XG_avg","XGC_avg"]].values)
    cluster_data=pd.read_csv("Team_cluster_data.csv")[["code_team","Cluster_opp","Cluster_XG","Cluster_XGC","Cluster_CS"]]

    fixture_data=fixture_data[fixture_data["finished"]==False]
    #fixture_data=fixture_data[(fixture_data['event']>33)].iloc[0:,:]

    min_event=fixture_data["event"].min()
    horizon=horizon 
    min_event_list=[]
    for i in range(horizon):
        min_event_list.append(min_event+i)

    fixture_data = fixture_data[fixture_data["event"].isin(min_event_list)]


    df_merged = fixture_data.merge(team_code_data, left_on='team_a', right_on='id', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_code_data, left_on='team_h', right_on='id', how='left')  # Left join to keep all rows from df2
    predict_data=df_merged[["event"]]
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





    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg',"Cluster","Own_Treat","Opposition_TreatAgainst",'Opposition_XPTS','Own_DEEP','Own_XPTS']

    new_input_XG = pd.DataFrame()
    new_input_XG["Own_XG"]=df_merged["XGH"]
    new_input_XG["Opposition_XGC"]=df_merged["XGCA"]
    new_input_XG["Own_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XG["Opponent_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XG["Own_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XG["Opposition_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XG["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XG["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XG['Cluster_XG']=df_merged["Cluster_XG_x"]
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
    new_input_XG2['Cluster_XG']=df_merged["Cluster_XG_y"]
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

    
    


    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Own_XGC_avg','Opposition_XG_avg','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS','Opposition_DEEP']
    new_input_XGC = pd.DataFrame()
    new_input_XGC["Own_XGC"]=df_merged["XGCH"]
    new_input_XGC["Opposition_XG"]=df_merged["XGA"]
    new_input_XGC["Own_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XGC["Opponent_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XGC["Opposition_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XGC["Own_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XGC["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC['Cluster_XGC']=df_merged["Cluster_XGC_x"]
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
    new_input_XGC2['Cluster_XGC']=df_merged["Cluster_XGC_y"]
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
    print(opp_cluster_css)
    print(css2)

    result_df=pd.DataFrame()
    result_df["GW"]=df_merged["event"]
    result_df["pred"]=df_merged["event"]-min_event+1
    result_df["home_team"]=df_merged["team_h_name"]
    result_df["away_team"]=df_merged["team_a_name"]
    result_df["home_code"]=df_merged["team_h"]
    result_df["away_code"]=df_merged["team_a"]
    result_df["home_goals"]=((xg+xgc2)/2)*0.7+0.15*(own_xg_cluster+opp_xgc_cluster)
    result_df["away_goals"]=((xgc+xg2)/2)*0.7+0.15*(opp_xg_cluster+own_xgc_cluster)
    result_df["Clean_Sheet_home"]=css1*0.7+0.3*own_cluster_css
    result_df["Clean_Sheet_away"]=css2*0.7+0.3*opp_cluster_css
    result_df["test_XG"]=xg
    result_df["test_cluster"]=own_xg_cluster
    result_df["test_opp_XGC"]=xgc2
    result_df.to_csv("Team_prediction_visual1.csv")

    home_df=result_df[["GW", "pred"]]
    home_df["team_name"]=result_df["home_team"]
    home_df["team_code"]=result_df["home_code"]
    home_df["XG"]=result_df["home_goals"]
    home_df["XGC"]=result_df["away_goals"]
    home_df["CS"]=result_df["Clean_Sheet_home"]
    home_df["Opposition_XG"]=df_merged["XGA"]
    home_df["Opposition_XGC"]=df_merged["XGCA"]

    away_df=result_df[["GW", "pred"]]
    away_df["team_name"]=result_df["away_team"]
    away_df["team_code"]=result_df["away_code"]
    away_df["XG"]=result_df["away_goals"]
    away_df["XGC"]=result_df["home_goals"]
    away_df["CS"]=result_df["Clean_Sheet_away"]
    away_df["Opposition_XG"]=df_merged["XGH"]
    away_df["Opposition_XGC"]=df_merged["XGCH"]

    ALL_pred=pd.concat([home_df, away_df], axis=0, ignore_index=True)
    ALL_pred.to_csv("Team_prediction1.csv")



def GenerateTeamPredictions2(fixture_path, current_team_path,horizon):
    team_df = pd.read_csv("Team_data_transformed4.csv").iloc[:, 1:]

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
    Model_pred["XG_Bucket"] = pd.cut(
        Model_pred["XG"],
        bins=[-np.inf, 0.6, 1.2, 1.8, np.inf],
        labels=[0,1, 2, 3],
        right=True,
        include_lowest=True # interval is [a, b)
    ).astype(int) 

    Model_pred["XGC_Bucket"] = pd.cut(
        Model_pred["XGC"],
        bins=[-np.inf, 0.6, 1.2, 1.8, np.inf],
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
    test_df = Model_pred[(Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-4)| 
                   (Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-3) ]
    train_df = Model_pred[(Model_pred['kickoff_time'].dt.year < current_year) | 
                     ((Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month < current_month-4))]
    train_df=train_df[train_df['kickoff_time']>'2022-12-31']


    
    # Define Features and Target
    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XG','Own_Treat','Opposition_TreatAgainst','Opposition_XPTS',"Own_DEEP",'Own_XPTS']
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
        max_depth=6,
        learning_rate=0.1,
        n_estimators=200,
        reg_lambda=2.0,
        gamma=0.1,
        min_child_weight=5,
        random_state=42,
        enable_categorical=True
    )

    model_xg.fit(X_train, y_train)

    proba = model_xg.predict_proba(X_test)
    weights = np.array([0.3, 0.9, 1.5, 2.2])        # same order as encoded classes
    custom_pred = proba @ weights
    
    # Evaluate Performance
    mse = mean_squared_error(y_test, custom_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")



    # Define Features and Target
    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XGC','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP",'Own_XPTS']

    target = 'XGC_Bucket'
    cs_target='Clean_Sheet'
    
    X_train = train_df[features].astype(float)
    y_train = train_df[target].astype(int)
    X_test = test_df[features].astype(float)
    y_test = test_df['XGC'].astype(float)

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
        max_depth=6,
        learning_rate=0.1,
        n_estimators=100,
        reg_lambda=2.0,
        gamma=0.1,
        min_child_weight=5,
        random_state=42,
        enable_categorical=True
    )
    
    model_xgc.fit(X_train, y_train)

    proba = model_xgc.predict_proba(X_test)
    weights = np.array([0.3, 0.9, 1.5, 2.2])        # same order as encoded classes
    custom_pred = proba @ weights

    CS_weights = np.array([1, 0.2, 0, 0])        # same order as encoded classes
    CS_custom_pred = proba @ CS_weights

    
    mse = mean_squared_error(y_test, custom_pred)
    print(f"Mean Squared Error on Test Set: {mse:.4f}")

    mse = mean_squared_error(y_CS_test, CS_custom_pred)
    print(f"Mean Squared Error on CS: {mse:.4f}")




    # Assuming your model predicted probabilities:
    y_pred_CS_binary = (CS_custom_pred > 0.37).astype(int)

    # Recall = correctly predicted 1s / total actual 1s
    recall = recall_score(y_CS_test, y_pred_CS_binary, pos_label=1)
    print(f"Recall (actual clean sheets captured): {recall:.3f}")

    fixture_data=pd.read_csv(fixture_path)[["event","team_a","team_h","finished"]]
    team_code_data=pd.read_csv(current_team_path)[["name","code","id"]]

    team_data=pd.read_csv("Team_data_newest3.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against","roll10_xpts","roll10_deep"]]
    team_data["Cluster"]=kmeans.predict(team_data[["XG_avg","XGC_avg"]].values)
    cluster_data=pd.read_csv("Team_cluster_data.csv")[["code_team","Cluster_opp","Cluster_XG","Cluster_XGC","Cluster_CS"]]

    fixture_data=fixture_data[fixture_data["finished"]==False]
    #fixture_data=fixture_data[(fixture_data['event']>33)].iloc[0:,:]

    min_event=fixture_data["event"].min()
    horizon=horizon 
    min_event_list=[]
    for i in range(horizon):
        min_event_list.append(min_event+i)

    fixture_data = fixture_data[fixture_data["event"].isin(min_event_list)]


    df_merged = fixture_data.merge(team_code_data, left_on='team_a', right_on='id', how='left')  # Left join to keep all rows from df2
    df_merged = df_merged.merge(team_code_data, left_on='team_h', right_on='id', how='left')  # Left join to keep all rows from df2
    predict_data=df_merged[["event"]]
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





    features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XG','Own_Treat','Opposition_TreatAgainst','Opposition_XPTS',"Own_DEEP",'Own_XPTS']

    new_input_XG = pd.DataFrame()
    new_input_XG["Own_XG"]=df_merged["XGH"]
    new_input_XG["Opposition_XGC"]=df_merged["XGCA"]
    new_input_XG["Own_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XG["Opponent_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XG["Own_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XG["Opposition_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XG["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XG["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XG['Cluster_XG']=df_merged["Cluster_XG_x"]
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
    new_input_XG2['Cluster_XG']=df_merged["Cluster_XG_y"]
    new_input_XG2['Own_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XG2['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    new_input_XG2['Opposition_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XG2['Own_DEEP']=df_merged["roll10_deep_x"]
    new_input_XG2['Own_XPTS']=df_merged["roll10_xpts_x"]

    new_input_XG = new_input_XG[features].astype(float)
    new_input_XG2 = new_input_XG2[features].astype(float)
    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in new_input_XG.columns:
            new_input_XG[cat_col] = new_input_XG[cat_col].astype('category')
            new_input_XG2[cat_col]  = new_input_XG2[cat_col].astype('category')



    proba1 = model_xg.predict_proba(new_input_XG)
    proba2 = model_xg.predict_proba(new_input_XG2)
    weights = np.array([0.3, 0.9, 1.5, 2.2])
    

    xg = proba1 @ weights
    xg2 = proba2 @ weights    


    features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XGC','Opposition_Treat','Own_TreatAgainst','Opposition_XPTS',"Opposition_DEEP",'Own_XPTS']
    new_input_XGC = pd.DataFrame()
    new_input_XGC["Own_XGC"]=df_merged["XGCH"]
    new_input_XGC["Opposition_XG"]=df_merged["XGA"]
    new_input_XGC["Own_XGC_slope"]=df_merged["XGC_slope_y"]
    new_input_XGC["Opponent_XG_slope"]=df_merged["XG_slope_x"]
    new_input_XGC["Opposition_XG_avg"]=df_merged["XG_avg_x"]
    new_input_XGC["Own_XGC_avg"]=df_merged["XGC_avg_y"]
    new_input_XGC["Own_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC["Opposition_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC['Cluster_XGC']=df_merged["Cluster_XGC_x"]
    new_input_XGC['Opposition_Treat']=df_merged["Rolling_Threat_x"]
    new_input_XGC['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_y"]
    new_input_XGC['Opposition_XPTS']=df_merged["roll10_xpts_x"]
    new_input_XGC['Opposition_DEEP']=df_merged["roll10_deep_x"]
    new_input_XGC['Own_XPTS']=df_merged["roll10_xpts_y"]
    

    new_input_XGC2 = pd.DataFrame()
    new_input_XGC2["Own_XGC"]=df_merged["XGCA"]
    new_input_XGC2["Opposition_XG"]=df_merged["XGH"]
    new_input_XGC2["Own_XGC_slope"]=df_merged["XGC_slope_x"]
    new_input_XGC2["Opponent_XG_slope"]=df_merged["XG_slope_y"]
    new_input_XGC2["Opposition_XG_avg"]=df_merged["XG_avg_y"]
    new_input_XGC2["Own_XGC_avg"]=df_merged["XGC_avg_x"]
    new_input_XGC2["Own_Cluster"] = df_merged["Cluster_x"]
    new_input_XGC2["Opposition_Cluster"] = df_merged["Cluster_y"]
    new_input_XGC2['Cluster_XGC']=df_merged["Cluster_XGC_y"]
    new_input_XGC2['Opposition_Treat']=df_merged["Rolling_Threat_y"]
    new_input_XGC2['Own_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]
    new_input_XGC2['Opposition_XPTS']=df_merged["roll10_xpts_y"]
    new_input_XGC2['Opposition_DEEP']=df_merged["roll10_deep_y"]
    new_input_XGC2['Own_XPTS']=df_merged["roll10_xpts_x"]

    new_input_XGC = new_input_XGC[features].astype(float)
    new_input_XGC2 = new_input_XGC2[features].astype(float)
    for cat_col in ['Own_Cluster','Opposition_Cluster']:
        if cat_col in new_input_XG.columns:
            new_input_XGC[cat_col] = new_input_XGC[cat_col].astype('category')
            new_input_XGC2[cat_col]  = new_input_XGC2[cat_col].astype('category')



    xgc_proba1 = model_xgc.predict_proba(new_input_XGC)
    xgc_proba2 = model_xgc.predict_proba(new_input_XGC2)
    weights = np.array([0.3, 0.9, 1.5, 2.2])

    xgc = xgc_proba1 @ weights
    xgc2 = xgc_proba2 @ weights    


    CS_weights = np.array([1, 0.2, 0, 0])        # same order as encoded classes
    CS_custom_pred = proba @ CS_weights

    css1=xgc_proba1 @ CS_weights
    css2=xgc_proba2 @ CS_weights

    css11=proba2 @ CS_weights
    css22=proba1 @ CS_weights

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
    result_df["home_goals"]=((xg+xgc2)/2)*0.7+0.15*(own_xg_cluster+opp_xgc_cluster)
    result_df["away_goals"]=((xgc+xg2)/2)*0.7+0.15*(opp_xg_cluster+own_xgc_cluster)
    result_df["Clean_Sheet_home"]=((css1+css11)/2)*0.7+0.3*own_cluster_css
    result_df["Clean_Sheet_away"]=((css2+css22)/2)*0.7+0.3*own_cluster_css
    result_df["test_XG"]=xg
    result_df["test_cluster"]=own_xg_cluster
    result_df["test_opp_XGC"]=xgc2
    result_df.to_csv("Team_prediction_visual2.csv")

    home_df=result_df[["GW", "pred"]]
    home_df["team_name"]=result_df["home_team"]
    home_df["team_code"]=result_df["home_code"]
    home_df["XG"]=result_df["home_goals"]
    home_df["XGC"]=result_df["away_goals"]
    home_df["CS"]=result_df["Clean_Sheet_home"]
    home_df["Opposition_XG"]=df_merged["XGA"]
    home_df["Opposition_XGC"]=df_merged["XGCA"]

    away_df=result_df[["GW", "pred"]]
    away_df["team_name"]=result_df["away_team"]
    away_df["team_code"]=result_df["away_code"]
    away_df["XG"]=result_df["away_goals"]
    away_df["XGC"]=result_df["home_goals"]
    away_df["CS"]=result_df["Clean_Sheet_away"]
    away_df["Opposition_XG"]=df_merged["XGH"]
    away_df["Opposition_XGC"]=df_merged["XGCH"]

    ALL_pred=pd.concat([home_df, away_df], axis=0, ignore_index=True)
    ALL_pred.to_csv("Team_prediction2.csv")





def GenerateTeamPredictions(fixture_path, current_team_path,horizon):
    GenerateTeamPredictions2(fixture_path, current_team_path,horizon)
    GenerateTeamPredictions1(fixture_path, current_team_path,horizon)
    
    team_pred1=pd.read_csv("Team_prediction1.csv")
    team_pred2=pd.read_csv("Team_prediction2.csv")
    
    team_pred1[["XG","XGC","CS"]]=team_pred1[["XG","XGC","CS"]]*0.5+team_pred2[["XG","XGC","CS"]]*0.5
    
    team_pred1.to_csv("Team_prediction.csv")
    
    team_pred_visual1=pd.read_csv("Team_prediction_visual1.csv")
    team_pred_visual2=pd.read_csv("Team_prediction_visual2.csv")
    
    team_pred_visual1[["home_goals","away_goals","Clean_Sheet_home","Clean_Sheet_away","test_XG"]]=team_pred_visual1[["home_goals","away_goals","Clean_Sheet_home","Clean_Sheet_away","test_XG"]]*0.5+team_pred_visual2[["home_goals","away_goals","Clean_Sheet_home","Clean_Sheet_away","test_XG"]]*0.5
    team_pred_visual1.to_csv("Team_prediction_visual.csv")
    


GenerateTeamPredictions( "Raw_Data_25\Fantasy_season_2025_Fixtures.csv","Raw_Data_25\current_teams.csv", 8)

