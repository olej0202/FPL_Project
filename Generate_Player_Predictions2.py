import numpy as np
import pandas as pd
import joblib

try:
    from xgboost import XGBRegressor, XGBClassifier
except Exception:  # pragma: no cover
    XGBRegressor = None
    XGBClassifier = None


METRICS = ["GOALS", "Assist", "GC", "bps", "Fantasy", "CBI", "cards", "Saves"]

# Relative weights from old model, restricted to STAT + XGB.
MEASURE_WEIGHTS = {
    "GOALS": {"stat": 0.5, "xgb": 0.2, "sim": 0.3},
    "Assist": {"stat": 0.5, "xgb": 0.2, "sim": 0.3},
    "bps": {"stat": 0.8, "xgb": 0.2, "sim": 0.0},
    "Fantasy": {"stat": 0.0, "xgb": 1.0, "sim": 0.0},
    "GC": {"stat": 1.0, "xgb": 0.0, "sim": 0.0},
    "CBI": {"stat": 0.7, "xgb": 0.3, "sim": 0.0},
    "cards": {"stat": 1.0, "xgb": 0.0, "sim": 0.0},
    "Saves": {"stat": 1.0, "xgb": 0.0, "sim": 0.0},
}

# Point-system config for goal/assist by position.
POSITION_POINTS_CONFIG = {
    "FWD": {"base_points": 2.0, "goal_points": 5.2, "assist_points": 3.4},
    "MID": {"base_points": 2.0, "goal_points": 5.5, "assist_points": 3.4},
    "DEF": {"base_points": 1.0, "goal_points": 6.5, "assist_points": 3.4},
    "GKP": {"base_points": 2.0, "goal_points": 0.0, "assist_points": 0.0},
}


def _load_player_prediction_set() -> pd.DataFrame:
    candidates = ["Player_prediction_set.csv", "Player_Prediction_set.csv"]
    last_err = None
    for path in candidates:
        try:
            df = pd.read_csv(path)
            if "Unnamed: 0" in df.columns:
                df = df.drop(columns=["Unnamed: 0"])
            return df
        except Exception as e:  # pragma: no cover - best effort
            last_err = e
            continue
    raise FileNotFoundError(f"Could not read player prediction set from {candidates}. Last error: {last_err}")


def _setup_dataset_local() -> None:
    """
    Local equivalent of legacy setup_dataset():
    builds ML_training2.csv from testML4.csv if needed.
    """
    try:
        source = pd.read_csv("testML4.csv")
    except Exception:
        return
    if "Unnamed: 0" in source.columns:
        source = source.drop(columns=["Unnamed: 0"])
    if "name" not in source.columns or "time" not in source.columns or "minutes" not in source.columns:
        return

    max_t = pd.to_numeric(source["time"], errors="coerce").max()
    if pd.isna(max_t):
        return

    chunks = []
    for name, grp in source.groupby("name", sort=False):
        filtered = grp[pd.to_numeric(grp["minutes"], errors="coerce").fillna(0) > 0].copy()
        if filtered.empty:
            continue
        times = list(range(int(max_t - len(filtered) + 1), int(max_t + 1)))
        filtered["time"] = times
        chunks.append(filtered)

    if chunks:
        out = pd.concat(chunks, ignore_index=True)
        out.to_csv("ML_training2.csv", index=False)


def _safe_read_csv(path: str, required_cols=None) -> pd.DataFrame:
    required_cols = required_cols or []
    try:
        df = pd.read_csv(path)
    except Exception:
        return pd.DataFrame(columns=required_cols)
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])
    for c in required_cols:
        if c not in df.columns:
            df[c] = np.nan
    return df


def _prepare_base_prediction_frame(players: pd.DataFrame) -> pd.DataFrame:
    base_cols = [
        "name",
        "GW",
        "fix_id",
        "position",
        "played_XGC",
        "Average_Overscore",
        "Average_OverAssist",
    ]
    out = players[base_cols].copy()
    out = out.rename(columns={"name": "Name", "played_XGC": "opp_stat"})
    out["GW"] = pd.to_numeric(out["GW"], errors="coerce").astype("Int64")
    out["fix_id"] = pd.to_numeric(out["fix_id"], errors="coerce").astype("Int64")
    out["Average_Overscore"] = pd.to_numeric(out["Average_Overscore"], errors="coerce").fillna(1.0).clip(0.9, 1.1)
    out["Average_OverAssist"] = pd.to_numeric(out["Average_OverAssist"], errors="coerce").fillna(1.0).clip(0.9, 1.1)
    return out


def _team_prediction_map() -> dict[tuple[int, int], dict]:
    team_df = _safe_read_csv("Team_prediction.csv")
    if team_df.empty:
        return {}
    for c in ["team_code", "fixture_code", "XG", "XGC", "CS"]:
        if c not in team_df.columns:
            team_df[c] = np.nan
    team_df["team_code"] = pd.to_numeric(team_df["team_code"], errors="coerce").astype("Int64")
    team_df["fixture_code"] = pd.to_numeric(team_df["fixture_code"], errors="coerce").astype("Int64")

    m = {}
    for _, r in team_df.iterrows():
        k = (int(r["team_code"]) if pd.notna(r["team_code"]) else -1, int(r["fixture_code"]) if pd.notna(r["fixture_code"]) else -1)
        m[k] = {
            "XG": float(pd.to_numeric(r["XG"], errors="coerce")) if pd.notna(r["XG"]) else np.nan,
            "XGC": float(pd.to_numeric(r["XGC"], errors="coerce")) if pd.notna(r["XGC"]) else np.nan,
            "CS": float(pd.to_numeric(r["CS"], errors="coerce")) if pd.notna(r["CS"]) else np.nan,
        }
    return m


def _series_val(row: pd.Series, col: str, default: float = 0.0) -> float:
    if col not in row.index:
        return default
    v = pd.to_numeric(pd.Series([row[col]]), errors="coerce").iloc[0]
    if pd.isna(v):
        return default
    return float(v)


def _generate_stat_predictions(metric: str, horizon: int = 2) -> pd.DataFrame:
    data = _load_player_prediction_set().copy()
    team_map = _team_prediction_map()

    rows = []
    for _, r in data.iterrows():
        name = r.get("name", "")
        gw = pd.to_numeric(pd.Series([r.get("GW", np.nan)]), errors="coerce").iloc[0]
        pos = r.get("position", "")
        team_code = pd.to_numeric(pd.Series([r.get("Team", np.nan)]), errors="coerce").iloc[0]
        fix_id = pd.to_numeric(pd.Series([r.get("fix_id", np.nan)]), errors="coerce").iloc[0]
        opp_stat = _series_val(r, "played_XGC", default=0.0)

        team_xg = _series_val(r, "played_XG", default=0.0)
        if pd.notna(team_code) and pd.notna(fix_id):
            tm = team_map.get((int(team_code), int(fix_id)))
            if tm and np.isfinite(tm.get("XG", np.nan)):
                team_xg = float(tm["XG"])

        player_risk = _series_val(r, "player_risiko", default=0.0)
        over_goal = np.clip(_series_val(r, "Average_Overscore", default=1.0), 0.9, 1.1)
        over_assist = np.clip(_series_val(r, "Average_OverAssist", default=1.0), 0.9, 1.1)

        pred = 0.0
        if metric == "GOALS":
            stat_share = (
                _series_val(r, "Goal_Statistics_share") * 0.3
                + _series_val(r, "Rolling_adjusted_Threat_per90_share") * 0.2
                + _series_val(r, "Rolling_adjusted_XG") * 0.1
                + _series_val(r, "Big_Chances") * 0.033
                + _series_val(r, "Share_of_XG") * 0.2
                + _series_val(r, "Share_of_XG_Short") * 0.1
            )
            team_data_xg = (_series_val(r, "Understat_POSXG_Share") * 0.65 + 0.35 * _series_val(r, "Opp_Goal_Threat_Pos")) * team_xg
            pred = ((1 - player_risk) * (stat_share * team_xg) + player_risk * team_data_xg + _series_val(r, "Team_Pen_Data") * _series_val(r, "Pen_Number") * 0.8) * over_goal
        elif metric == "Assist":
            stat_share = (
                _series_val(r, "Assist_Statistics_share") * 0.4
                + _series_val(r, "Rolling_adjusted_XA") * 0.1
                + (_series_val(r, "Big_Chances_Created") / 2.0) * 0.2
                + _series_val(r, "Share_of_XA") * 0.2
                + _series_val(r, "Share_of_XA_Short") * 0.1
            )
            team_data_xa = (_series_val(r, "Understat_POSXA_Share") * 0.65 + 0.35 * _series_val(r, "Opp_Assist_Threat_Pos")) * team_xg
            pred = ((1 - player_risk) * (stat_share * team_xg) + player_risk * team_data_xa) * over_assist
        elif metric == "GC":
            pred = _series_val(r, "played_XGC", default=0.0)
        elif metric == "bps":
            pred = max(_series_val(r, "Rolling_adjusted_BPS") * 0.4 + _series_val(r, "Rolling_adjusted_BPS_2") * 0.6, 5.0) * 0.015
        elif metric == "cards":
            pred = min(_series_val(r, "Rolling_cards", default=0.0), 0.3)
        elif metric == "Saves":
            pred = min(_series_val(r, "Team_Rolling_Saves") * (_series_val(r, "Opp_Saves_Against") / 2.7), 5.0)
        elif metric == "CBI":
            opp_defcon_fac = min(1.1, 1.0 + (_series_val(r, "Opp_defcon") - 79.0) / 30.0)
            z = (
                -7.784197
                + 0.25 * _series_val(r, "defcon_avg_hit_rate_T0")
                - 0.2 * _series_val(r, "defcon_avg_hit_rate_T1")
                + 2.697022 * _series_val(r, "defcon_avg_hit_rate_T2")
                - 0.110803 * _series_val(r, "defcon_avg_hit_rate_T3")
                + 1.65 * _series_val(r, "defcon_avg_hit_rate")
                + 0.056152 * _series_val(r, "Opp_defcon")
            )
            pred = (1.0 / (1.0 + np.exp(-z))) * opp_defcon_fac
        elif metric == "Fantasy":
            pred = _series_val(r, "Rolling_adjusted_Fantasy") * 0.04

        rows.append([name, gw, float(max(pred, 0.0)), pos, opp_stat])

    out = pd.DataFrame(rows, columns=["Name", "GW", "pred", "position", "opp_stat"])
    out["GW"] = pd.to_numeric(out["GW"], errors="coerce").astype("Int64")
    out.to_csv(f"STAT_{metric}.csv", index=False)
    return out


def _train_xgb_regressor(train_x: pd.DataFrame, train_y: pd.Series):
    if XGBRegressor is None:
        return None
    model = XGBRegressor(
        objective="reg:squarederror",
        n_estimators=180,
        learning_rate=0.05,
        max_depth=5,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=4,
        random_state=42,
    )
    model.fit(train_x, train_y)
    return model


def _train_xgb_classifier_binary(train_x: pd.DataFrame, train_y: pd.Series):
    if XGBClassifier is None:
        return None
    model = XGBClassifier(
        objective="binary:logistic",
        n_estimators=220,
        learning_rate=0.05,
        max_depth=5,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=4,
        reg_lambda=2.0,
        random_state=42,
        eval_metric="logloss",
    )
    model.fit(train_x, train_y)
    return model


def _generate_xgb_predictions(metric: str, horizon: int = 2) -> pd.DataFrame:
    pred_df = _load_player_prediction_set().copy()
    train_df = _safe_read_csv("ML_training2.csv")
    if train_df.empty:
        _setup_dataset_local()
        train_df = _safe_read_csv("ML_training2.csv")

    for df in [pred_df, train_df]:
        for c in ["Team", "GW", "fix_id", "played_XG", "played_XGC"]:
            if c not in df.columns:
                df[c] = np.nan

    # GOALS and Assist use existing share models from disk (same family as legacy flow).
    if metric in ["GOALS", "Assist"]:
        model_file = "XGB_XG_SHARE_MODEL.joblib" if metric == "GOALS" else "XGB_XA_SHARE_MODEL.joblib"
        features = (
            ["Rolling_adjusted_XG_share", "rolling_Threat_share", "rolling_XG_share", "Rolling_adjusted_XG", "Rolling_adjusted_XG_per90", "Rolling_adjusted_Threat_per90", "played_XG"]
            if metric == "GOALS"
            else ["Rolling_adjusted_XA_share", "Rolling_creativity_share", "rolling_XA_share", "Rolling_adjusted_XA", "Rolling_adjusted_XA_per90", "Rolling_adjusted_creativity_per90", "played_XG"]
        )
        mdl = joblib.load(model_file)

        for c in features:
            if c not in pred_df.columns:
                pred_df[c] = 0.0
        Xp = pred_df[features].apply(pd.to_numeric, errors="coerce").fillna(0.0).values
        share_pred = mdl.predict(Xp)
        xgb_pred = np.maximum(0.0, pd.to_numeric(share_pred, errors="coerce")) * pd.to_numeric(pred_df["played_XG"], errors="coerce").fillna(0.0).values

        spread = np.maximum(0.08, 0.35 * xgb_pred)
        q25 = np.maximum(0.0, xgb_pred - 0.5 * spread)
        q75 = xgb_pred + 0.5 * spread

        out = pd.DataFrame(
            {
                "Name": pred_df["name"],
                "pred": xgb_pred,
                "position": pred_df["position"],
                "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                "25": q25,
                "75": q75,
            }
        )
        out.to_csv(f"XGB_{metric}.csv", index=False)
        return out

    # Dedicated CBI model: target defcon_hit_rate (binary), stats-like inputs,
    # use minutes in train and average_minutes at prediction time.
    if metric == "CBI":
        target = "defcon_hit_rate"
        if target not in train_df.columns:
            out = pd.DataFrame(
                {
                    "Name": pred_df["name"],
                    "pred": np.zeros(len(pred_df)),
                    "position": pred_df["position"],
                    "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                    "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                    "25": np.zeros(len(pred_df)),
                    "75": np.zeros(len(pred_df)),
                }
            )
            out.to_csv(f"XGB_{metric}.csv", index=False)
            return out

        cbi_train_feature_map = {
            "defcon_avg_hit_rate": "defcon_avg_hit_rate",
            "defcon_avg_hit_rate_T0": "defcon_avg_hit_rate_T0",
            "defcon_avg_hit_rate_T1": "defcon_avg_hit_rate_T1",
            "defcon_avg_hit_rate_T2": "defcon_avg_hit_rate_T2",
            "defcon_avg_hit_rate_T3": "defcon_avg_hit_rate_T3",
            "opp_defcon_feature": "Opponent_defcon",
            "minutes": "minutes",
        }
        cbi_pred_feature_map = {
            "defcon_avg_hit_rate": "defcon_avg_hit_rate",
            "defcon_avg_hit_rate_T0": "defcon_avg_hit_rate_T0",
            "defcon_avg_hit_rate_T1": "defcon_avg_hit_rate_T1",
            "defcon_avg_hit_rate_T2": "defcon_avg_hit_rate_T2",
            "defcon_avg_hit_rate_T3": "defcon_avg_hit_rate_T3",
            "opp_defcon_feature": "Opp_defcon",
            "minutes": "average_minutes",
        }

        for src_col in cbi_train_feature_map.values():
            if src_col not in train_df.columns:
                train_df[src_col] = np.nan
        for src_col in cbi_pred_feature_map.values():
            if src_col not in pred_df.columns:
                pred_df[src_col] = np.nan
        if "average_minutes" not in pred_df.columns:
            pred_df["average_minutes"] = np.nan

        tr = train_df.copy()
        tr[target] = pd.to_numeric(tr[target], errors="coerce")
        tr = tr.dropna(subset=[target])
        if tr.empty:
            out = pd.DataFrame(
                {
                    "Name": pred_df["name"],
                    "pred": np.zeros(len(pred_df)),
                    "position": pred_df["position"],
                    "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                    "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                    "25": np.zeros(len(pred_df)),
                    "75": np.zeros(len(pred_df)),
                }
            )
            out.to_csv(f"XGB_{metric}.csv", index=False)
            return out

        # Convert to binary labels.
        tr[target] = (tr[target] > 0.5).astype(int)
        if tr[target].nunique() < 2:
            base_prob = float(tr[target].mean()) if len(tr) > 0 else 0.0
            out = pd.DataFrame(
                {
                    "Name": pred_df["name"],
                    "pred": np.full(len(pred_df), base_prob, dtype=float),
                    "position": pred_df["position"],
                    "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                    "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                    "25": np.full(len(pred_df), max(0.0, base_prob - 0.15), dtype=float),
                    "75": np.full(len(pred_df), min(1.0, base_prob + 0.15), dtype=float),
                }
            )
            out.to_csv(f"XGB_{metric}.csv", index=False)
            return out

        X_train = pd.DataFrame(index=tr.index)
        for feat_name, src_col in cbi_train_feature_map.items():
            X_train[feat_name] = pd.to_numeric(tr[src_col], errors="coerce")
        X_train = X_train.fillna(0.0)
        y_train = tr[target].astype(int)
        model = _train_xgb_classifier_binary(X_train, y_train)

        X_pred = pd.DataFrame(index=pred_df.index)
        for feat_name, src_col in cbi_pred_feature_map.items():
            X_pred[feat_name] = pd.to_numeric(pred_df[src_col], errors="coerce")
        # fallback: if average_minutes is missing, use minutes from prediction set.
        X_pred["minutes"] = X_pred["minutes"].fillna(pd.to_numeric(pred_df.get("minutes", pd.Series(np.nan, index=pred_df.index)), errors="coerce"))
        X_pred = X_pred.fillna(0.0)

        if model is not None:
            yhat = model.predict_proba(X_pred)[:, 1]
        else:
            yhat = np.full(len(X_pred), y_train.mean())

        yhat = np.clip(pd.to_numeric(yhat, errors="coerce"), 0.0, 1.0)
        spread = 0.15
        q25 = np.clip(yhat - spread, 0.0, 1.0)
        q75 = np.clip(yhat + spread, 0.0, 1.0)

        out = pd.DataFrame(
            {
                "Name": pred_df["name"],
                "pred": yhat,
                "position": pred_df["position"],
                "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                "25": q25,
                "75": q75,
            }
        )
        out.to_csv(f"XGB_{metric}.csv", index=False)
        return out

    # For other metrics, train a local XGB regressor from ML_training2.
    target_map = {
        "bps": "bonus",
        "Fantasy": "total_points",
        "GC": "expected_goals_conceded",
        "cards": "yellow_cards",
        "Saves": "saves",
    }
    target = target_map.get(metric)
    if target is None or target not in train_df.columns:
        out = pd.DataFrame(
            {
                "Name": pred_df["name"],
                "pred": np.zeros(len(pred_df)),
                "position": pred_df["position"],
                "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                "25": np.zeros(len(pred_df)),
                "75": np.zeros(len(pred_df)),
            }
        )
        out.to_csv(f"XGB_{metric}.csv", index=False)
        return out

    feature_pool = [
        "played_XG", "played_XGC", "Rolling_adjusted_XG", "Rolling_adjusted_XA",
        "Rolling_adjusted_BPS", "rolling_Threat", "rolling_key_passes", "rolling_shots",
        "average_minutes", "Own_Attacking_form", "Cluster", "Own_cluster", "XG_slope", "XA_slope",
        "Threat_slope", "Rolling_cards", "Team_Rolling_Saves", "Opp_Saves_Against", "Opp_defcon",
    ]
    feature_cols = [c for c in feature_pool if c in train_df.columns and c in pred_df.columns]
    if len(feature_cols) < 3:
        feature_cols = [c for c in ["played_XG", "played_XGC", "average_minutes"] if c in train_df.columns and c in pred_df.columns]

    tr = train_df.copy()
    tr[target] = pd.to_numeric(tr[target], errors="coerce")
    tr = tr.dropna(subset=[target])
    if tr.empty or len(feature_cols) == 0:
        out = pd.DataFrame(
            {
                "Name": pred_df["name"],
                "pred": np.zeros(len(pred_df)),
                "position": pred_df["position"],
                "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
                "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
                "25": np.zeros(len(pred_df)),
                "75": np.zeros(len(pred_df)),
            }
        )
        out.to_csv(f"XGB_{metric}.csv", index=False)
        return out

    X_train = tr[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    y_train = tr[target].astype(float)
    model = _train_xgb_regressor(X_train, y_train)

    X_pred = pred_df[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    if model is not None:
        yhat = model.predict(X_pred)
    else:
        yhat = np.full(len(X_pred), y_train.mean())

    yhat = np.maximum(0.0, pd.to_numeric(yhat, errors="coerce"))
    resid = np.abs(y_train - np.median(y_train))
    mad = float(np.nanmedian(resid)) if len(resid) else 0.1
    spread = np.maximum(0.05, 0.8 * mad)
    q25 = np.maximum(0.0, yhat - spread)
    q75 = yhat + spread

    out = pd.DataFrame(
        {
            "Name": pred_df["name"],
            "pred": yhat,
            "position": pred_df["position"],
            "GW": pd.to_numeric(pred_df["GW"], errors="coerce").astype("Int64"),
            "opp_stat": pd.to_numeric(pred_df["played_XGC"], errors="coerce").fillna(0.0),
            "25": q25,
            "75": q75,
        }
    )
    out.to_csv(f"XGB_{metric}.csv", index=False)
    return out


def _load_simulation_player_outcomes() -> pd.DataFrame:
    paths = [
        "SImulator/simtest_player_outcomes_upcoming.csv",
        "SImulator\\simtest_player_outcomes_upcoming.csv",
    ]
    sim = pd.DataFrame()
    for p in paths:
        sim = _safe_read_csv(
            p,
            required_cols=["player_name", "event", "fixture_code", "expected_goals", "expected_assists"],
        )
        if not sim.empty:
            break
    if sim.empty:
        return pd.DataFrame(columns=["Name", "GW", "fix_id", "sim_expected_goals", "sim_expected_assists"])

    out = sim.rename(
        columns={
            "player_name": "Name",
            "event": "GW",
            "fixture_code": "fix_id",
            "expected_goals": "sim_expected_goals",
            "expected_assists": "sim_expected_assists",
        }
    ).copy()
    out["GW"] = pd.to_numeric(out["GW"], errors="coerce").astype("Int64")
    out["fix_id"] = pd.to_numeric(out["fix_id"], errors="coerce").astype("Int64")
    out["sim_expected_goals"] = pd.to_numeric(out["sim_expected_goals"], errors="coerce").fillna(0.0)
    out["sim_expected_assists"] = pd.to_numeric(out["sim_expected_assists"], errors="coerce").fillna(0.0)
    return out[["Name", "GW", "fix_id", "sim_expected_goals", "sim_expected_assists"]]


def generate_goal_predictions(horizon: int = 2) -> pd.DataFrame:
    return generate_measure_predictions("GOALS", horizon=horizon)


def generate_measure_predictions(metric: str, horizon: int = 2) -> pd.DataFrame:
    metric = str(metric)
    if metric not in METRICS:
        raise ValueError(f"Unknown metric: {metric}. Expected one of: {METRICS}")

    _generate_stat_predictions(metric, horizon=horizon)
    _generate_xgb_predictions(metric, horizon=horizon)

    players = _load_player_prediction_set()
    base = _prepare_base_prediction_frame(players)

    stat_df = _safe_read_csv(f"STAT_{metric}.csv", required_cols=["Name", "GW", "pred"])
    stat_df = stat_df.rename(columns={"pred": "stat_pred"})
    stat_df["GW"] = pd.to_numeric(stat_df["GW"], errors="coerce").astype("Int64")

    xgb_df = _safe_read_csv(f"XGB_{metric}.csv", required_cols=["Name", "GW", "pred", "25", "75"])
    xgb_df["GW"] = pd.to_numeric(xgb_df["GW"], errors="coerce").astype("Int64")
    xgb_df = xgb_df.rename(columns={"pred": "xgb_pred", "25": "xgb_q25", "75": "xgb_q75"})

    merged = base.merge(
        stat_df[["Name", "GW", "stat_pred"]],
        on=["Name", "GW"],
        how="left",
    )
    merged = merged.merge(
        xgb_df[["Name", "GW", "xgb_pred", "xgb_q25", "xgb_q75"]],
        on=["Name", "GW"],
        how="left",
    )
    sim_df = _load_simulation_player_outcomes()
    merged = merged.merge(
        sim_df,
        on=["Name", "GW", "fix_id"],
        how="left",
    )

    merged["stat_pred"] = pd.to_numeric(merged["stat_pred"], errors="coerce").fillna(0.0)
    merged["xgb_pred"] = pd.to_numeric(merged["xgb_pred"], errors="coerce")
    merged["xgb_q25"] = pd.to_numeric(merged["xgb_q25"], errors="coerce")
    merged["xgb_q75"] = pd.to_numeric(merged["xgb_q75"], errors="coerce")

    merged["xgb_quantile_blend"] = np.where(
        merged["xgb_q25"].notna() & merged["xgb_q75"].notna(),
        0.5 * merged["xgb_q25"] + 0.5 * merged["xgb_q75"],
        merged["xgb_pred"],
    )
    merged["xgb_quantile_blend"] = pd.to_numeric(merged["xgb_quantile_blend"], errors="coerce").fillna(0.0)
    merged["sim_expected_goals"] = pd.to_numeric(merged.get("sim_expected_goals", 0.0), errors="coerce").fillna(0.0)
    merged["sim_expected_assists"] = pd.to_numeric(merged.get("sim_expected_assists", 0.0), errors="coerce").fillna(0.0)

    stat_w = MEASURE_WEIGHTS[metric]["stat"]
    xgb_w = MEASURE_WEIGHTS[metric]["xgb"]
    sim_w = MEASURE_WEIGHTS[metric].get("sim", 0.0)
    merged["weight_stat"] = stat_w
    merged["weight_xgb"] = xgb_w
    merged["weight_sim"] = sim_w

    if metric == "GOALS":
        merged["sim_pred"] = merged["sim_expected_goals"]
    elif metric == "Assist":
        merged["sim_pred"] = merged["sim_expected_assists"]
    else:
        merged["sim_pred"] = 0.0

    merged["final_pred"] = (
        merged["stat_pred"] * stat_w
        + merged["xgb_quantile_blend"] * xgb_w
        + merged["sim_pred"] * sim_w
    )

    if metric == "GOALS":
        merged["final_pred"] = merged["final_pred"] * merged["Average_Overscore"]
    elif metric == "Assist":
        merged["final_pred"] = merged["final_pred"] * merged["Average_OverAssist"]
    elif metric == "bps":
        merged["final_pred"] = np.maximum(0.1, merged["final_pred"])

    merged["metric"] = metric

    out_cols = [
        "Name",
        "GW",
        "fix_id",
        "position",
        "opp_stat",
        "metric",
        "stat_pred",
        "xgb_pred",
        "xgb_q25",
        "xgb_q75",
        "xgb_quantile_blend",
        "sim_pred",
        "weight_stat",
        "weight_xgb",
        "weight_sim",
        "final_pred",
    ]
    out = merged[out_cols].copy()
    out.to_csv(f"DATASET_{metric}.csv", index=False)
    return out


def generate_all_measure_datasets(horizon: int = 2) -> dict[str, pd.DataFrame]:
    _setup_dataset_local()

    out = {}
    for metric in METRICS:
        out[metric] = generate_measure_predictions(metric=metric, horizon=horizon)
    return out


def normalize_player_gws(
    df: pd.DataFrame,
    gws,
    summed_metrics,
    first_metrics=None,
    key_cols=("name", "GW"),
):
    df = df.copy()
    df["GW"] = pd.to_numeric(df["GW"], errors="coerce").astype("Int64")
    gws = list(map(int, list(gws)))

    if first_metrics is None:
        first_metrics = [c for c in df.columns if c not in set(key_cols) | set(summed_metrics)]

    agg = {c: "sum" for c in summed_metrics}
    agg.update({c: "first" for c in first_metrics})

    collapsed = df.groupby(list(key_cols), as_index=False, dropna=False).agg(agg)
    names = collapsed["name"].unique()
    full_index = pd.MultiIndex.from_product([names, gws], names=["name", "GW"])
    expanded = collapsed.set_index(["name", "GW"]).reindex(full_index).reset_index()

    for c in summed_metrics:
        expanded[c] = expanded[c].fillna(0)
    for c in first_metrics:
        expanded[c] = expanded.groupby("name")[c].ffill().bfill()
    return expanded


def combine_measure_datasets_to_model_predictions(gw_list=None) -> pd.DataFrame:
    players = _load_player_prediction_set()
    players = players.copy()
    players["GW"] = pd.to_numeric(players["GW"], errors="coerce").astype("Int64")
    players["fix_id"] = pd.to_numeric(players["fix_id"], errors="coerce").astype("Int64")

    metric_to_col = {
        "GOALS": "Goal_pred",
        "Assist": "Assist_pred",
        "bps": "Bonus_pred",
        "GC": "GC_pred",
        "Fantasy": "Fantasy_pred",
        "CBI": "CBI_pred",
        "cards": "Card_pred",
        "Saves": "Save_pred",
    }

    core_cols = ["name", "position", "GW", "fix_id", "Rolling_adjusted_BPS", "Rolling_adjusted_XG", "Rolling_adjusted_XA", "played_XGC", "average_minutes", "fix_percentage"]
    combined = players[core_cols].copy()

    for metric, pred_col in metric_to_col.items():
        ds = _safe_read_csv(f"DATASET_{metric}.csv", required_cols=["Name", "GW", "fix_id", "final_pred"])
        ds["GW"] = pd.to_numeric(ds["GW"], errors="coerce").astype("Int64")
        ds["fix_id"] = pd.to_numeric(ds["fix_id"], errors="coerce").astype("Int64")
        ds = ds.rename(columns={"Name": "name", "final_pred": pred_col})
        ds = ds[["name", "GW", "fix_id", pred_col]]
        combined = combined.merge(ds, on=["name", "GW", "fix_id"], how="left")
        combined[pred_col] = pd.to_numeric(combined[pred_col], errors="coerce").fillna(0.0)

    grouped_cols = ["name", "position", "GW", "Rolling_adjusted_BPS", "Rolling_adjusted_XG", "Rolling_adjusted_XA", "played_XGC", "average_minutes", "fix_percentage"]
    pred_cols = list(metric_to_col.values())
    summary = combined.groupby(grouped_cols, as_index=False)[pred_cols].sum()

    overscore = players.groupby("name", as_index=False)["Average_Overscore"].first()
    pstd = players.groupby("name", as_index=False)["TP_std_20"].first()
    summary = summary.merge(overscore, on="name", how="left")
    summary = summary.merge(pstd, on="name", how="left")
    summary["Average_Overscore"] = pd.to_numeric(summary["Average_Overscore"], errors="coerce").fillna(1.0)
    summary["Point_STD"] = pd.to_numeric(summary["TP_std_20"], errors="coerce").fillna(0.0)
    summary = summary.drop(columns=["TP_std_20"])

    summary["Points_prediction"] = 0.0
    summary["Risk_share"] = 0.0

    for pos in ["FWD", "MID", "GKP", "DEF"]:
        mask = summary["position"] == pos
        cfg = POSITION_POINTS_CONFIG.get(pos, POSITION_POINTS_CONFIG["MID"])
        goal_pts = float(cfg["goal_points"])
        assist_pts = float(cfg["assist_points"])
        base_pts = float(cfg["base_points"])

        if pos == "FWD":
            points = (base_pts + summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts + summary.loc[mask, "Bonus_pred"] - summary.loc[mask, "Card_pred"]) * 0.9 + 0.1 * summary.loc[mask, "Fantasy_pred"] + summary.loc[mask, "CBI_pred"] * 1.4
            risk = (summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts) / np.maximum(points, 1e-9)
        elif pos == "MID":
            points = (base_pts + summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts + summary.loc[mask, "Bonus_pred"] + summary.loc[mask, "GC_pred"] * 0.8 - summary.loc[mask, "Card_pred"]) * 0.9 + 0.1 * summary.loc[mask, "Fantasy_pred"] + summary.loc[mask, "CBI_pred"] * 2.0
            risk = (summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts + summary.loc[mask, "GC_pred"] * 0.8) / np.maximum(points, 1e-9)
        elif pos == "GKP":
            points = base_pts + summary.loc[mask, "Save_pred"] / 4 + (30 - np.minimum(30, summary.loc[mask, "GC_pred"] * 100)) / -15 + summary.loc[mask, "GC_pred"] * 5
            risk = (summary.loc[mask, "GC_pred"] * 5) / np.maximum(points, 1e-9)
        else:  # DEF
            points = (base_pts + summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts + summary.loc[mask, "Bonus_pred"] + summary.loc[mask, "GC_pred"] * 5 + (30 - np.minimum(30, summary.loc[mask, "GC_pred"] * 100)) / -15 - summary.loc[mask, "Card_pred"]) * 0.9 + 0.1 * summary.loc[mask, "Fantasy_pred"] + summary.loc[mask, "CBI_pred"] * 2.0
            risk = (summary.loc[mask, "Goal_pred"] * goal_pts + summary.loc[mask, "Assist_pred"] * assist_pts + summary.loc[mask, "GC_pred"] * 3.5) / np.maximum(points, 1e-9)

        summary.loc[mask, "Points_prediction"] = points
        summary.loc[mask, "Risk_share"] = risk

    summed_metrics = ["Goal_pred", "Assist_pred", "Bonus_pred", "GC_pred", "Fantasy_pred", "CBI_pred", "Card_pred", "Points_prediction"]
    summary["fix_percentage"] = pd.to_numeric(summary["fix_percentage"], errors="coerce").fillna(1.0)
    summary[summed_metrics] = summary[summed_metrics].mul(summary["fix_percentage"], axis=0)

    if gw_list is None:
        gw_list = sorted([int(x) for x in summary["GW"].dropna().unique().tolist()])

    df_out = normalize_player_gws(summary, gw_list, summed_metrics)
    df_out.to_csv("Model_Predictions.csv", index=False)
    return df_out


def make_predictions2(horizon: int = 2, gw_list=None) -> pd.DataFrame:
    generate_all_measure_datasets(horizon=horizon)
    return combine_measure_datasets_to_model_predictions(gw_list=gw_list)


if __name__ == "__main__":
    make_predictions2(horizon=2)
