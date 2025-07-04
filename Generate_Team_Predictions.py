import pandas as pd
import numpy as np
from sklearn.svm import SVR
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.linear_model import LassoCV
from sklearn.feature_selection import SelectFromModel



team_df = pd.read_csv("Team_data_transformed2.csv").iloc[:, 1:]

# Fill missing slope values – here we use the median rather than zero
team_df["XG_slope"] = team_df["XG_slope"].fillna(team_df["XG_slope"].median())
team_df["XGC_slope"] = team_df["XGC_slope"].fillna(team_df["XGC_slope"].median())

cluster_data=team_df[["XG_avg","XGC_avg"]].values
kmeans = KMeans(n_clusters=4, random_state=31)
kmeans.fit(cluster_data)

team_df["Cluster"]=kmeans.predict(team_df[["XG_avg","XGC_avg"]].values)

# Create opponent dataframe with selected columns
opponent_df = team_df[["code", "XGA", "XGCA", "XGH", "XGCH", "kickoff_time", "XG_slope", "XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against"]].copy()

# Merge team and opponent data on opponent code and kickoff time
# Suffixes indicate which data comes from team_df and which from opponent_df
pred_df = pd.merge(team_df, opponent_df, 
                   left_on=['opponent', 'kickoff_time'], 
                   right_on=['code', 'kickoff_time'], 
                   how='left', suffixes=('_team', '_opp'))

# --- 2. Construct Prediction Dataset with Clear Feature Assignment ---
print(pred_df)

new_pred_df=pd.DataFrame()
teams=pred_df["code_team"].unique()
latest_df=pd.DataFrame()
for teams_code in teams:
    code_df=pred_df[pred_df["code_team"]==teams_code]
    code_df = code_df.sort_values(by='kickoff_time')
    code_df['Cluster_XG'] = (code_df.groupby('Cluster_opp')['XG']
    .transform(lambda x: x.shift(1).rolling(window=8, min_periods=1).mean()))
    code_df['Cluster_XG'] = code_df['Cluster_XG'].fillna(code_df['Cluster_XG'].mean())

    code_df['Cluster_XGC'] = (code_df.groupby('Cluster_opp')['XGC']
    .transform(lambda x: x.shift(1).rolling(window=8, min_periods=1).mean()))
    code_df['Cluster_XGC'] = code_df['Cluster_XGC'].fillna(code_df['Cluster_XGC'].mean())
    code_df['kickoff_time'] = pd.to_datetime(code_df['kickoff_time'])
    latest_rows = code_df.loc[code_df.groupby('Cluster_opp')['kickoff_time'].idxmax()]
    latest_rows = latest_rows[['code_team','Cluster_opp', 'Cluster_XG','Cluster_XGC']]
    latest_df=pd.concat([latest_df, latest_rows], axis=0, ignore_index=True)

    new_pred_df=pd.concat([new_pred_df, code_df], axis=0, ignore_index=True)
latest_df.to_csv("Team_cluster_data.csv")
pred_df=new_pred_df.copy()
print(new_pred_df)

    
# Start with key columns from the team data
Model_pred = pred_df[["name", "kickoff_time", "was_home", "XG", "XGC","Clean_Sheet","Cluster_XG","Cluster_XGC"]].copy()

# Use vectorized operations to assign attacking and defensive stats.
# The assumption is:
# - For a home game: use home expected stats from opponent data (XGH and XGCH)
# - For an away game: use away expected stats (XGA and XGCA)
Model_pred["Own_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGH_team"], pred_df["XGA_team"])
Model_pred["Own_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCH_team"], pred_df["XGCA_team"])
Model_pred["Opposition_XG"] = np.where(Model_pred["was_home"]==1, pred_df["XGA_opp"], pred_df["XGH_opp"])
Model_pred["Opposition_XGC"] = np.where(Model_pred["was_home"]==1, pred_df["XGCA_opp"], pred_df["XGCH_opp"])
Model_pred["Opposition_XG_avg"] = pred_df["XG_avg_opp"]
Model_pred["Opposition_XGC_avg"] = pred_df["XGC_avg_opp"]
Model_pred["Own_XG_avg"] = pred_df["XG_avg_team"]
Model_pred["Own_XGC_avg"] = pred_df["XGC_avg_team"]

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

"""team_df=pd.read_csv("Team_data_transformed.csv").iloc[:,1:]
team_df["XG_slope"] = team_df["XG_slope"].fillna(0)
team_df["XGC_slope"] = team_df["XGC_slope"].fillna(0)
opponent_df=team_df[["code", "XGA", "XGCA", "XGH", "XGCH","kickoff_time","XG_slope","XGC_slope"]]

pred_df = pd.merge(team_df, opponent_df, left_on=['opponent', 'kickoff_time'], right_on=['code', 'kickoff_time'], how='left')
print(pred_df)

Model_pred=pred_df[["name","kickoff_time","was_home","XG","XGC"]]
Model_pred["Own_XG"]=pred_df.apply(lambda row: row[13] if row[6] else row[11], axis=1)
Model_pred["Own_XGC"]=pred_df.apply(lambda row: row[14] if row[6] else row[12], axis=1)
Model_pred["Opposition_XG"]=pred_df.apply(lambda row: row[16] if row[6] else row[18], axis=1)
Model_pred["Opposition_XGC"]=pred_df.apply(lambda row: row[17] if row[6] else row[19], axis=1)

Model_pred["Own_XG_slope"]=pred_df["XG_slope_x"].values
Model_pred["Own_XGC_slope"]=pred_df["XGC_slope_x"].values
Model_pred["Opponent_XG_slope"]=pred_df["XG_slope_y"].values
Model_pred["Opponent_XGC_slope"]=pred_df["XGC_slope_y"].values
Model_pred.to_csv("Team_data_preds.csv")"""
import numpy as np
import xgboost as xgb
from datetime import datetime

Model_pred['kickoff_time'] = pd.to_datetime(Model_pred['kickoff_time'])

# Get current year and month
current_year = datetime.today().year
current_month = datetime.today().month

# Filter for current month
test_df = Model_pred[(Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-1)| 
               (Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month == current_month-2) ]
train_df = Model_pred[(Model_pred['kickoff_time'].dt.year < current_year) | 
                 ((Model_pred['kickoff_time'].dt.year == current_year) & (Model_pred['kickoff_time'].dt.month < current_month-2))]
train_df=train_df[train_df['kickoff_time']>'2022-12-31']

import xgboost as xgb
import pandas as pd
import numpy as np
from sklearn.metrics import mean_squared_error

# Define Features and Target
features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XG','Own_Treat','Opposition_TreatAgainst']
#features = ['Own_XG', 'Own_XGC', 'Opposition_XG', 'Opposition_XGC'] # Exclude target and date
target = 'XG'

X_train = train_df[features]
y_train = train_df[target]
X_test = test_df[features]
y_test = test_df[target]

# Initialize and Train XGBoost Model
#model_xg = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.05, max_depth=5,min_child_weight=10)
#model_xg.fit(X_train, y_train)
"""
lasso = LassoCV(cv=4, random_state=1).fit(X_train, y_train)

# Select features based on the coefficients
model = SelectFromModel(lasso, prefit=True)
X_train_lasso = model.transform(X_train)
X_test_lasso = model.transform(X_test)

# Check selected features
selected_features = X_train.columns[model.get_support()]
print("Selected Features:", selected_features)
"""
model_xg=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
model_xg.fit(X_train, y_train)
#model_xg.fit(X_train_lasso, y_train)
# Make Predictions
y_pred = model_xg.predict(X_test)
#y_pred = model_xg.predict(X_test_lasso)

# Evaluate Performance
mse = mean_squared_error(y_test, y_pred)
print(f"Mean Squared Error on Test Set: {mse:.4f}")


import xgboost as xgb
import pandas as pd
import numpy as np
from sklearn.metrics import mean_squared_error

# Define Features and Target
features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Opposition_XG_avg','Own_XGC_avg','Own_Cluster','Opposition_Cluster','Cluster_XGC','Opposition_Treat','Own_TreatAgainst']
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
"""feature_importance = pd.Series(model_CS.feature_importances_, index=X_train.columns)
feature_importance = feature_importance.sort_values(ascending=False)
xgb.plot_importance(model_CS, importance_type='gain')
plt.show()"""
model_xgc=SVR(kernel='rbf', C=0.1, epsilon=0.1,gamma=0.1)
model_xgc.fit(X_train, y_train)

# Make Predictions
y_pred = model_xgc.predict(X_test)
y_pred_CS = model_CS.predict_proba(X_test)[:, 1]
#y_pred_CS = model_CS.predict(X_test)
# Evaluate Performance
mse = mean_squared_error(y_test, y_pred)
print(f"Mean Squared Error on Test Set: {mse:.4f}")

mse = mean_squared_error(y_CS_test, y_pred_CS)
print(f"Mean Squared Error on CS: {mse:.4f}")
from sklearn.metrics import roc_auc_score, accuracy_score

print("ROC AUC:", roc_auc_score(y_CS_test, y_pred_CS))
print("Accuracy:", accuracy_score(y_CS_test, y_pred_CS > 0.37))
from sklearn.metrics import recall_score

# Assuming your model predicted probabilities:
y_pred_CS_binary = (y_pred_CS > 0.37).astype(int)

# Recall = correctly predicted 1s / total actual 1s
recall = recall_score(y_CS_test, y_pred_CS_binary, pos_label=1)
print(f"Recall (actual clean sheets captured): {recall:.3f}")


fixture_data=pd.read_csv("Raw_Data_24/Fantasy_season_2024_Fixtures.csv")[["event","team_a","team_h","finished"]]
team_code_data=pd.read_csv("Fantasy-Premier-League/Fantasy-Premier-League/data/2024-25/teams2.csv")[["name","code","id"]]
team_data=pd.read_csv("Team_data_newest2.csv")[["code","XGA","XGCA","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Rolling_Threat","Rolling_Threat_Against"]]
team_data["Cluster"]=kmeans.predict(team_data[["XG_avg","XGC_avg"]].values)
cluster_data=pd.read_csv("Team_cluster_data.csv")[["code_team","Cluster_opp","Cluster_XG","Cluster_XGC"]]

fixture_data=fixture_data[fixture_data["finished"]==False]
#fixture_data=fixture_data[(fixture_data['event']>33)].iloc[0:,:]

min_event=fixture_data["event"].min()
horizon=9
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
df_merged = predict_data.merge(team_data[["code","XGA","XGCA","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against"]], left_on='team_a', right_on='code', how='left')  # Left join to keep all rows from df2
df_merged = df_merged.merge(team_data[["code","XGH","XGCH","XG_slope","XGC_slope","XG_avg","XGC_avg","Cluster","Rolling_Threat","Rolling_Threat_Against"]], left_on='team_h', right_on='code', how='left')  # Left join to keep all rows from df2
df_merged = df_merged.merge(cluster_data, left_on=['code_x', 'Cluster_y'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
df_merged = df_merged.rename(columns={
    'Cluster_XG': 'Cluster_XG_y',
    'Cluster_XGC': 'Cluster_XGC_y'
})
df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)
df_merged = df_merged.merge(cluster_data, left_on=['code_y', 'Cluster_x'], right_on=['code_team', 'Cluster_opp'], how='left')  # Left join to keep all rows from df2
df_merged = df_merged.rename(columns={
    'Cluster_XG': 'Cluster_XG_x',
    'Cluster_XGC': 'Cluster_XGC_x'
})
df_merged = df_merged.drop(['code_team', 'Cluster_opp'], axis=1)




features = ['Own_XG','Opposition_XGC','Own_XG_slope','Opponent_XGC_slope','Own_XG_avg','Opposition_XGC_avg',"Cluster","Own_Treat","Opposition_TreatAgainst"]

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
new_input_XG['Cluster_XG']=df_merged["Cluster_XG_x"]
new_input_XG['Own_Treat']=df_merged["Rolling_Threat_y"]
new_input_XG['Opposition_TreatAgainst']=df_merged["Rolling_Threat_Against_x"]



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
    
new_input_XG.to_csv("teams_preds_test.csv")


xg = model_xg.predict(new_input_XG)
xg2 = model_xg.predict(new_input_XG2)


features = ['Own_XGC', 'Opposition_XG','Own_XGC_slope','Opponent_XG_slope','Own_XGC_avg','Opposition_XG_avg','Opposition_Treat','Own_TreatAgainst']
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


xgc = model_xgc.predict(new_input_XGC)
xgc2 = model_xgc.predict(new_input_XGC2)
css1=model_CS.predict_proba(new_input_XGC)[:, 1]
css2=model_CS.predict_proba(new_input_XGC2)[:, 1]
#css1=model_CS.predict(new_input_XGC)
#css2=model_CS.predict(new_input_XGC2)

result_df=pd.DataFrame()
result_df["GW"]=df_merged["event"]
result_df["pred"]=df_merged["event"]-min_event+1
result_df["home_team"]=df_merged["team_h_name"]
result_df["away_team"]=df_merged["team_a_name"]
result_df["home_code"]=df_merged["team_h"]
result_df["away_code"]=df_merged["team_a"]
result_df["home_goals"]=(xg+xgc2)/2
result_df["away_goals"]=(xgc+xg2)/2
result_df["Clean_Sheet_home"]=css1
result_df["Clean_Sheet_away"]=css2
result_df.to_csv("Team_prediction_visual.csv")

home_df=result_df[["GW", "pred"]]
home_df["team_name"]=result_df["home_team"]
home_df["team_code"]=result_df["home_code"]
home_df["XG"]=result_df["home_goals"]
home_df["XGC"]=result_df["away_goals"]
home_df["CS"]=result_df["Clean_Sheet_home"]

away_df=result_df[["GW", "pred"]]
away_df["team_name"]=result_df["away_team"]
away_df["team_code"]=result_df["away_code"]
away_df["XG"]=result_df["away_goals"]
away_df["XGC"]=result_df["home_goals"]
away_df["CS"]=result_df["Clean_Sheet_away"]

ALL_pred=pd.concat([home_df, away_df], axis=0, ignore_index=True)
ALL_pred.to_csv("Team_prediction.csv")

#0.5101
#0.5434
#75
#0.281