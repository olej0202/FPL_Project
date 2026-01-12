import re
import numpy as np
import pandas as pd

# Try to import Prophet; fall back gracefully if unavailable

# minutes_bucket_xgb_with_gt0_column_no_change.py
# Keeps bucket predictions EXACTLY as before (trained + predicted on minutes>0 pipeline),
# and adds prob_gt0 from a separate model trained on full data including zeros.

import os
import warnings
from typing import Tuple, List, Dict


from xgboost import XGBClassifier
from sklearn.metrics import roc_auc_score, mean_squared_error

warnings.filterwarnings("ignore", category=UserWarning)


def _mse_prob(model: XGBClassifier, X_test: pd.DataFrame, y_test: pd.Series) -> float:
    p = model.predict_proba(X_test)[:, 1]
    return mean_squared_error(y_test, p)


def _safe_auc(model: XGBClassifier, X_test: pd.DataFrame, y_test: pd.Series) -> float:
    if y_test.nunique() < 2:
        return float("nan")
    p = model.predict_proba(X_test)[:, 1]
    return roc_auc_score(y_test, p)


def _feature_importance_df(
    model: XGBClassifier,
    feature_names: List[str],
    importance_type: str = "gain",
) -> pd.DataFrame:
    booster = model.get_booster()
    score = booster.get_score(importance_type=importance_type)
    if not score:
        return pd.DataFrame(columns=["feature", "importance"])

    rows = []
    for k, v in score.items():
        if k.startswith("f"):
            idx = int(k[1:])
            fname = feature_names[idx] if idx < len(feature_names) else k
        else:
            fname = k
        rows.append((fname, float(v)))

    return (
        pd.DataFrame(rows, columns=["feature", "importance"])
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )


# -----------------------------
# Two readers (KEY FIX)
# -----------------------------
def _read_and_clean_all(history_path: str) -> pd.DataFrame:
    """Read and clean, KEEP zero-minute rows."""
    df = pd.read_csv(history_path)

    required = ["name", "kickoff_time", "minutes", "total_points", "ict_index", "value", "selected"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"{history_path} missing required columns: {missing}")

    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], errors="coerce")
    if pd.api.types.is_datetime64_any_dtype(df["kickoff_time"]):
        try:
            df["kickoff_time"] = df["kickoff_time"].dt.tz_localize(None)
        except Exception:
            pass

    for c in ["minutes", "total_points", "ict_index", "value", "selected"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    if "Full_Name" not in df.columns:
        df["Full_Name"] = df["name"]

    return df.sort_values(["name", "kickoff_time"]).reset_index(drop=True)


def _read_and_clean_pos(history_path: str) -> pd.DataFrame:
    """Read and clean, then FILTER minutes>0 (this matches your original bucket logic)."""
    df = _read_and_clean_all(history_path)
    df = df[df["minutes"] > 0].copy()
    return df.sort_values(["name", "kickoff_time"]).reset_index(drop=True)


def _add_rolling_features(
    df: pd.DataFrame,
    windows: Tuple[int, ...] = (3, 5, 10),
    roll_cols: Tuple[str, ...] = ("minutes", "ict_index"),
    id_col: str = "name",
) -> pd.DataFrame:
    df = df.sort_values([id_col, "kickoff_time"]).copy()

    for col in roll_cols:
        for w in windows:
            feat = f"{col}_roll{w}"
            df[feat] = (
                df.groupby(id_col)[col]
                .shift(1)
                .rolling(window=w, min_periods=1)
                .median()
                .reset_index(level=0, drop=True)
            )

    df["Median_min"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .rolling(window=4, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    df["Median_min_8"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .rolling(window=8, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    lookback = 15

    df["pct_ge80_l20"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .ge(74)
        .rolling(window=lookback, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    df["pct_ge80_5"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .ge(74)
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    df["pct_ge60_5"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .ge(60)
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    df["pct_ge60_l20"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .ge(60)
        .rolling(window=lookback, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    df["pct_ge30_l20"] = (
        df.groupby(id_col)["minutes"]
        .shift(1)
        .ge(30)
        .rolling(window=lookback, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    short_w, long_w = 3, 8
    df["minutes_momentum_3v8"] = (
        df.groupby(id_col)["minutes"].shift(1).rolling(short_w, min_periods=1).median().reset_index(level=0, drop=True)
        -
        df.groupby(id_col)["minutes"].shift(1).rolling(long_w, min_periods=1).median().reset_index(level=0, drop=True)
    )

    return df


def _make_bucket_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["target_80"] = (df["minutes"] >= 75).astype(int)
    df["target_60"] = (df["minutes"] >= 60).astype(int)
    df["target_30"] = (df["minutes"] >= 30).astype(int)
    return df


def _make_gt0_target(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["target_gt0"] = (df["minutes"] > 0).astype(int)
    return df


def _feature_list(
    windows: Tuple[int, ...] = (3, 5, 10),
    roll_cols: Tuple[str, ...] = ("minutes", "ict_index"),
) -> List[str]:
    base = [f"{c}_roll{w}" for c in roll_cols for w in windows] + ["Median_min", "Median_min_8", "value", "selected"]
    new_rates = ["pct_ge80_l20", "pct_ge60_l20", "pct_ge30_l20", "pct_ge80_5", "pct_ge60_5", "minutes_momentum_3v8"]
    return base + new_rates


def _time_split_masks(df: pd.DataFrame, time_col: str = "kickoff_time", quantile: float = 0.80):
    split_point = df[time_col].quantile(quantile)
    train_mask = (df[time_col] <= split_point).to_numpy()
    test_mask = (df[time_col] > split_point).to_numpy()
    return train_mask, test_mask


def _train_xgb_binary(X_train: pd.DataFrame, y_train: pd.Series) -> XGBClassifier:
    model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def _latest_per_player(df: pd.DataFrame, id_col: str = "name", time_col: str = "kickoff_time") -> pd.DataFrame:
    return (
        df.sort_values(time_col)
        .groupby(id_col, as_index=False)
        .tail(1)
        .reset_index(drop=True)
    )


def train_minutes_bucket_models(
    history_path: str = "Fantasy_Merged.csv",
    current_players_path: str = "Raw_Data_25/current_players.csv",
    out_predictions_path: str = "minutes_bucket_predictions.csv",
    split_quantile: float = 0.80,
    windows: Tuple[int, ...] = (3, 5, 10),
) -> Dict[str, object]:
    FEATURES = _feature_list(windows=windows)

    # =========================================================
    # (A) BUCKET MODELS PIPELINE (UNCHANGED): minutes>0 BEFORE FE
    # =========================================================
    df_pos = _read_and_clean_pos(history_path)          # <-- same as your original filtering
    df_pos = _add_rolling_features(df_pos, windows=windows)
    df_pos = _make_bucket_targets(df_pos)

    df_pos_model = df_pos.dropna(subset=FEATURES + ["target_80", "target_60", "target_30"]).copy()

    train_mask_pos, test_mask_pos = _time_split_masks(df_pos_model, quantile=split_quantile)

    X_pos = df_pos_model[FEATURES]
    X_train_pos, X_test_pos = X_pos.loc[train_mask_pos], X_pos.loc[test_mask_pos]

    bucket_models: Dict[str, XGBClassifier] = {}
    bucket_aucs: Dict[str, float] = {}
    bucket_mses: Dict[str, float] = {}

    for key, target_col in [("80", "target_80"), ("60", "target_60"), ("30", "target_30")]:
        y = df_pos_model[target_col]
        y_train, y_test = y.loc[train_mask_pos], y.loc[test_mask_pos]

        m = _train_xgb_binary(X_train_pos, y_train)
        bucket_models[key] = m
        bucket_aucs[key] = _safe_auc(m, X_test_pos, y_test)
        bucket_mses[key] = _mse_prob(m, X_test_pos, y_test)

    # Bucket predictions (latest rows from the SAME bucket df -> identical behavior)
    latest_pos = _latest_per_player(df_pos_model)
    X_latest_pos = latest_pos[FEATURES]

    latest_pos["prob_80"] = bucket_models["80"].predict_proba(X_latest_pos)[:, 1]
    latest_pos["prob_60"] = bucket_models["60"].predict_proba(X_latest_pos)[:, 1]
    latest_pos["prob_30"] = bucket_models["30"].predict_proba(X_latest_pos)[:, 1]

    preds = latest_pos[["name", "Full_Name", "prob_80", "prob_60", "prob_30"]].copy()

    preds["Predicted_minutes"] = (
        preds["prob_30"] * 30
        + preds["prob_60"] * 30
        + preds["prob_80"] * 40
    ).clip(upper=90)

    # =========================================================
    # (B) NEW GT0 MODEL PIPELINE: FULL DATA INCLUDING ZEROS
    # =========================================================
    df_all = _read_and_clean_all(history_path)          # <-- includes 0-min rows
    df_all = _add_rolling_features(df_all, windows=windows)
    df_all = _make_gt0_target(df_all)

    df_all_model = df_all.dropna(subset=FEATURES + ["target_gt0"]).copy()

    train_mask_all, test_mask_all = _time_split_masks(df_all_model, quantile=split_quantile)

    X_all = df_all_model[FEATURES]
    y_all = df_all_model["target_gt0"]

    X_train_all, X_test_all = X_all.loc[train_mask_all], X_all.loc[test_mask_all]
    y_train_all, y_test_all = y_all.loc[train_mask_all], y_all.loc[test_mask_all]

    model_gt0 = _train_xgb_binary(X_train_all, y_train_all)
    auc_gt0 = _safe_auc(model_gt0, X_test_all, y_test_all)
    mse_gt0 = _mse_prob(model_gt0, X_test_all, y_test_all)

    # Predict prob_gt0 on latest rows from FULL dataset
    latest_all = _latest_per_player(df_all_model)
    X_latest_all = latest_all[FEATURES]
    latest_all["prob_gt0"] = model_gt0.predict_proba(X_latest_all)[:, 1]

    # Merge prob_gt0 into preds WITHOUT changing bucket probs
    preds = preds.merge(
        latest_all[["name", "prob_gt0"]],
        on="name",
        how="left",
    )

    # Optional filter to current players (same as your original)
    if current_players_path and os.path.exists(current_players_path):
        cur = pd.read_csv(current_players_path)

        candidate_cols = [c for c in ["name", "web_name", "Full_Name", "full_name"] if c in cur.columns]
        if not candidate_cols:
            raise ValueError("current_players file must contain a name column")

        name_col = candidate_cols[0]

        # --- Build lookup with name + code ---
        keep_cols = [name_col]
        if "code" in cur.columns:
            keep_cols.append("code")

        cur_lookup = cur[keep_cols].copy()
        cur_lookup["name"] = cur_lookup[name_col].astype(str).str.strip()

        if "code" not in cur_lookup.columns:
            cur_lookup["code"] = np.nan  # safety

        cur_lookup = cur_lookup[["name", "code"]].drop_duplicates()

        # Normalize preds names
        preds["name"] = preds["name"].astype(str).str.strip()

        # LEFT JOIN: keep all current players, bring code along
        preds = cur_lookup.merge(preds, on="name", how="left")

        # Fill missing prediction columns with 0
        pred_cols = [c for c in preds.columns if c.startswith("prob_") or c in ["Predicted_minutes", "Final_pred"]]
        preds[pred_cols] = preds[pred_cols].fillna(0.0)

    

    preds = preds.sort_values("prob_80", ascending=False).reset_index(drop=True)
    preds["Final_pred"] = np.where(
        preds["prob_gt0"] < 0.51,
        preds["Predicted_minutes"] * preds["prob_gt0"],
        preds["Predicted_minutes"],
    )
    preds.to_csv(out_predictions_path, index=False)

    # -------------------------
    # Evaluation prints
    # -------------------------


    return {
        "bucket_models": bucket_models,
        "model_gt0": model_gt0,
        "bucket_aucs": bucket_aucs,
        "bucket_mses": bucket_mses,
        "auc_gt0": auc_gt0,
        "mse_gt0": mse_gt0,
        "predictions": preds,
        "features": FEATURES,
    }






def GetXmins(current_players, n_future, scenarios=None, position_slots=None):
    train_minutes_bucket_models()
    try:
        from prophet import Prophet
        _HAVE_PROPHET = True
    except Exception:
        _HAVE_PROPHET = False
    """
    Build minutes predictions per player for the requested gameweeks.

    Adds:
      - last5_avg_incl_zeros: average of last 5 matches including zeros
      - scenario engine via `scenarios` (list of dicts: name, type, GW, value)
      - (optional) team×position balancing (left as a placeholder in this base)
      - complement finder (HISTORICAL): for each player, pick 2 teammates with the
        lowest average overlap |(mi + mj) - 90| using historical matches (incl. zeros)
      - final adjustment: if minutes_multiplier < 1, add the reduced minutes
        to comp2_name_hist, then comp1_name_hist, capped at 90.

    Overlap score (for complements, historical):
        mean_gw | (minutes_i(gw) + minutes_j(gw)) - 90 |
    Lower is better (closer to perfectly complementary).
    """
    # Load data
    df_current = pd.read_csv(current_players)
    hist_raw = pd.read_csv("Fantasy_Merged.csv")  # keep zeros for stats

    # Identify player code column
    code_col = "code_x" if "code_x" in hist_raw.columns else ("code" if "code" in hist_raw.columns else None)
    if code_col is None:
        raise ValueError("Fantasy_Merged.csv must include 'code_x' or 'code' to match players.")
    if "kickoff_time" not in hist_raw.columns or "minutes" not in hist_raw.columns:
        raise ValueError("Fantasy_Merged.csv must include 'kickoff_time' and 'minutes'.")

    # Clean raw history (INCLUDE zeros)
    hist_raw["kickoff_time"] = pd.to_datetime(hist_raw["kickoff_time"], errors="coerce")
    hist_raw["minutes"] = pd.to_numeric(hist_raw["minutes"], errors="coerce").fillna(0)
    if pd.api.types.is_datetime64_any_dtype(hist_raw["kickoff_time"]):
        try:
            hist_raw["kickoff_time"] = hist_raw["kickoff_time"].dt.tz_localize(None)
        except Exception:
            pass
    hist_raw = hist_raw.sort_values("kickoff_time")

    # Forecasting history (EXCLUDE zeros as in your original)
    hist = hist_raw[hist_raw["minutes"] > 0].copy()

    future_gws = [str(g) for g in n_future]  # ensure string labels

    # -------- Helpers --------
    def news_multiplier(news_text, chance_val):
        text = (str(news_text) or "").lower()
        zero_keys = ["has joined", "has departed", "on loan", "on load", "unknown return", "expected back"]
        if any(k in text for k in zero_keys):
            return 0.0, 0.0
        m = re.search(r"(\d{1,3})\s*%", text)
        if m:
            pct = int(m.group(1)); pct = max(0, min(100, pct))
            return min(1, pct / 100.0), 1.0
        
        
        try:
            if chance_val is not None and not pd.isna(chance_val):
                return min(1, float(chance_val) / 100.0), 1.0
        except Exception:
            pass
        return 1.0, 1.0

    def baseline_minutes_from(pdf, news_text, chance_val):
        if pdf.empty:
            return 0.0, 0.0, 0.0
        last6 = pdf["minutes"].tail(6).to_numpy()
        if len(last6) >= 6 and np.all(last6[-2:] >= 69):
            k = 3
            vals = last6[-k:]
            halflife = 1.0
            w = np.exp(-np.log(2) * np.arange(k-1, -1, -1) / halflife)
            base_minutes = float(np.dot(w, vals) / w.sum())
        elif len(last6) > 0:
            w = np.arange(1, len(last6) + 1, dtype=float)
            base_minutes = float(np.dot(w, last6) / w.sum())
        else:
            base_minutes = 0.0
        mult, ispercent = news_multiplier(news_text, chance_val)
        return base_minutes, mult, ispercent

    def prophet_minutes_from(pdf, periods, min_points=3):
        if not _HAVE_PROPHET:
            return np.full(periods, np.nan), "prophet_not_installed"
        if pdf is None or pdf.empty:
            return np.full(periods, np.nan), "no_history"
        dfp = pdf.rename(columns={"kickoff_time": "ds", "minutes": "y"})[["ds", "y"]].copy()
        dfp["ds"] = pd.to_datetime(dfp["ds"], errors="coerce").dt.tz_localize(None)
        dfp["y"] = pd.to_numeric(dfp["y"], errors="coerce")
        dfp = dfp.dropna(subset=["ds", "y"])
        dfp = dfp[dfp["y"] >= 0]
        if dfp.empty:
            return np.full(periods, np.nan), "cleaned_history_empty"
        dfp = dfp.groupby("ds", as_index=False)["y"].mean().sort_values("ds")
        if dfp["y"].std(ddof=0) < 1e-6:
            const_val = float(np.clip(dfp["y"].iloc[-1], 0.0, 90.0))
            return np.full(periods, const_val), None
        if dfp.shape[0] < min_points:
            return np.full(periods, np.nan), f"insufficient_points_{dfp.shape[0]}"
        if dfp.shape[0] >= 2:
            d = dfp["ds"].diff().dropna().dt.total_seconds() / 86400.0
            step_days = float(np.median(d)) if len(d) else 7.0
        else:
            step_days = 7.0
        step_days = max(1.0, min(step_days, 14.0))
        step_days_int = int(round(step_days))
        try:
            m = Prophet(weekly_seasonality=False, daily_seasonality=False, yearly_seasonality=False,
                        changepoint_prior_scale=0.1, seasonality_mode="additive")
            m.fit(dfp)
            start_date = dfp["ds"].max() + pd.Timedelta(days=step_days_int)
            future_dates = pd.date_range(start=start_date, periods=periods, freq=pd.DateOffset(days=step_days_int))
            future = pd.DataFrame({"ds": future_dates})
            fcst = m.predict(future)
            yhat = fcst["yhat"].to_numpy(dtype=float)
            yhat = np.clip(yhat, 0.0, 90.0)
            return yhat, None
        except Exception as e:
            return np.full(periods, np.nan), f"prophet_exception:{type(e).__name__}"

    def last5_avg_including_zeros(player_code):
        pdf0 = hist_raw.loc[hist_raw[code_col] == player_code, ["kickoff_time", "minutes"]].sort_values("kickoff_time")
        if pdf0.empty:
            return 0.0
        vals = pdf0["minutes"].tail(5).to_numpy()  # includes zeros
        return float(np.mean(vals)) if len(vals) else 0.0

    # -------- Build predictions --------
    out_rows = []
    minutes_calc=pd.read_csv("minutes_bucket_predictions.csv")
    for _, r in df_current.iterrows():
        code = r["code"]
        name = r.get("name", code)
        news = r.get("news", "")
        chance = 100
        
        is_suspended = "suspended" in str(news).lower()

        # History for modeling (non-zero)
        pdf = hist.loc[hist[code_col] == code, ["kickoff_time", "minutes"]].copy()
        player_mins = minutes_calc.loc[minutes_calc["code"] == code, ["Final_pred","name"]].copy()
        pred_mins=player_mins["Final_pred"].values[0]
        print(player_mins)
        base_est, mult, ispercent = baseline_minutes_from(pdf, news, chance)
        prophet_vec, prophet_reason = prophet_minutes_from(pdf, periods=len(future_gws), min_points=3)
        

        last5_avg = last5_avg_including_zeros(code)

        for j, gw in enumerate(future_gws):
            m_base = float(base_est)
            m_prophet = float(prophet_vec[j]) if np.isfinite(prophet_vec[j]) else np.nan
            m_final = (m_base) if np.isfinite(m_prophet) else m_base
            minutes_prophet = 0 if not np.isfinite(m_prophet) else round(m_prophet, 2)
            multiplier = min(1.0, round(mult + (j * 0.1 * ispercent), 2))
            final_minutes = ((pred_mins*0.7 + minutes_prophet*0.3)) * multiplier

            if is_suspended and j == 0:
                final_minutes = 0.0
            out_rows.append({
                "name": name,
                "GW": str(gw),
                "minutes_multiplier": multiplier,
                "minutes_prophet": minutes_prophet,
                "minutes": round(m_final, 2),
                "prophet_reason": prophet_reason,
                "Final minutes": final_minutes,
                "last5_avg_incl_zeros": round(last5_avg, 2),
            })
    out = pd.DataFrame(out_rows)

    # ======================== SCENARIO ENGINE ========================
    out["minutes_scenario"] = out["Final minutes"].astype(float)

    def _apply_shape_to_series(orig_series, gws, pivot_gw, target_value, mode):
        """
        Supported modes:
          - 'const'       : set all GWs to target_value
          - 'adjust_from' : set all GWs strictly AFTER pivot_gw to target_value
          - 'linear_from' : from pivot_gw, linearly move toward target_value,
                            reach it after 3 GWs (pivot+3); hold target thereafter
        """
        import numpy as np

        orig = np.asarray(orig_series, dtype=float).copy()
        n = len(orig)
        if n == 0:
            return orig

        gws_norm = [str(x) for x in gws]
        pivot_str = str(pivot_gw)
        tgt = float(target_value)

        # const: ignore pivot; apply to whole horizon
        if mode == "const":
            return np.clip(np.full(n, tgt, dtype=float), 0.0, 90.0)

        # For the other modes we need the pivot inside the horizon
        if pivot_str not in gws_norm:
            return np.clip(orig, 0.0, 90.0)

        k = gws_norm.index(pivot_str)

        if mode == "adjust_from":
            new_vals = orig.copy()
            # strictly AFTER the pivot GW
            if k + 1 < n:
                new_vals[k+1:] = tgt
            return np.clip(new_vals, 0.0, 90.0)

        if mode == "linear_from":
            new_vals = orig.copy()
            # reach target at pivot+3 (or end of horizon if shorter)
            end_idx = min(k + 3, n - 1)
            start_val = float(orig[k])
            span = max(1, end_idx - k)
            for i in range(k, end_idx + 1):
                f = (i - k) / span
                new_vals[i] = start_val + f * (tgt - start_val)
            # hold target after reaching it
            if end_idx + 1 < n:
                new_vals[end_idx + 1:] = tgt
            return np.clip(new_vals, 0.0, 90.0)

        # Fallback
        return np.clip(orig, 0.0, 90.0)

    if scenarios:
        out["GW"] = out["GW"].astype(str)
        gws_horizon = future_gws[:]
        for sc in scenarios:
            try:
                nm = sc["name"]
                tp = str(sc["type"]).lower()
                gw_pivot = sc.get("GW", None)
                val = float(sc.get("value", 0))
                mask_p = out["name"].eq(nm)
                if not mask_p.any():
                    continue

                # const ignores pivot
                if tp == "const":
                    shaped = _apply_shape_to_series(
                        out.loc[mask_p, "minutes_scenario"].to_numpy(dtype=float),
                        gws_horizon, gw_pivot, val, "const"
                    )
                    out.loc[mask_p, "minutes_scenario"] = shaped
                    continue

                # adjust_from / linear_from require a pivot
                if gw_pivot is None:
                    continue

                orig_series = out.loc[mask_p, "minutes_scenario"].to_numpy(dtype=float)
                if tp in ("adjust_from", "linear_from"):
                    shaped = _apply_shape_to_series(orig_series, gws_horizon, gw_pivot, val, tp)
                    out.loc[mask_p, "minutes_scenario"] = shaped
                # silently ignore unknown types
            except Exception:
                continue

    # ======================== COMPLEMENT FINDER (HISTORICAL) ========================
    required_hist_cols = {code_col, "kickoff_time", "team_code", "minutes"}
    if not required_hist_cols.issubset(set(hist_raw.columns)):
        out["comp1_name_hist"] = None
        out["comp1_hist_overlap"] = np.nan
        out["comp2_name_hist"] = None
        out["comp2_hist_overlap"] = np.nan
    else:
        h = hist_raw[[code_col, "kickoff_time", "team_code", "minutes"]].copy()
        h["kickoff_time"] = pd.to_datetime(h["kickoff_time"], errors="coerce")
        h["minutes"] = pd.to_numeric(h["minutes"], errors="coerce").fillna(0)
        h = h.dropna(subset=["kickoff_time", "team_code"])

        sum_gap = {}
        cnt_gap = {}

        for (_, _team), g in h.groupby(["kickoff_time", "team_code"], sort=False):
            mins = g.groupby(code_col)["minutes"].mean().to_dict()
            if len(mins) < 2:
                continue
            for i_code, mi in mins.items():
                if not (0.0 < float(mi) < 90.0):
                    continue
                if i_code not in sum_gap:
                    sum_gap[i_code] = {}
                    cnt_gap[i_code] = {}
                for j_code, mj in mins.items():
                    if j_code == i_code:
                        continue
                    gap = abs((float(mi) + float(mj)) - 90.0)
                    sum_gap[i_code][j_code] = sum_gap[i_code].get(j_code, 0.0) + gap
                    cnt_gap[i_code][j_code] = cnt_gap[i_code].get(j_code, 0) + 1

        code_to_name_cur = df_current.set_index("code")["name"].to_dict()
        comp1_by_name, comp2_by_name = {}, {}
        for code_i, sums in sum_gap.items():
            counts = cnt_gap.get(code_i, {})
            if not sums:
                continue
            items = []
            for code_j, total in sums.items():
                c = counts.get(code_j, 0)
                if c > 0:
                    items.append((code_j, float(total) / float(c)))
            if not items:
                continue
            items.sort(key=lambda x: (x[1], code_to_name_cur.get(x[0], str(x[0]))))
            best1 = items[0]
            best2 = items[1] if len(items) > 1 else (None, np.nan)

            name_i = code_to_name_cur.get(code_i)
            name_j1 = code_to_name_cur.get(best1[0], None) if best1[0] is not None else None
            name_j2 = code_to_name_cur.get(best2[0], None) if best2[0] is not None else None
            if name_i is not None:
                comp1_by_name[name_i] = (name_j1, best1[1])
                comp2_by_name[name_i] = (name_j2, best2[1])

        out["comp1_name_hist"] = out["name"].map(lambda nm: comp1_by_name.get(nm, (None, np.nan))[0])
        out["comp1_hist_overlap"] = out["name"].map(lambda nm: comp1_by_name.get(nm, (None, np.nan))[1])
        out["comp2_name_hist"] = out["name"].map(lambda nm: comp2_by_name.get(nm, (None, np.nan))[0])
        out["comp2_hist_overlap"] = out["name"].map(lambda nm: comp2_by_name.get(nm, (None, np.nan))[1])

    # ======================== FINAL REDISTRIBUTION TO COMPLEMENTS ========================
    # Start from minutes_scenario and produce an adjusted column.
    out["minutes_scenario_adj"] = out["minutes_scenario"].astype(float)

    # Normalize types for keys
    out["GW"] = out["GW"].astype(str)
    out["name"] = out["name"].astype(str)
    out["comp1_name_hist"] = out["comp1_name_hist"].astype(str).where(out["comp1_name_hist"].notna(), None)
    out["comp2_name_hist"] = out["comp2_name_hist"].astype(str).where(out["comp2_name_hist"].notna(), None)

    # Fast lookup for (GW, name) -> row index
    key_index = { (gw, nm): idx
                  for idx, gw, nm in out[["GW","name"]].itertuples(index=True, name=None) }

    # Accumulate additions to avoid order effects
    additions = {}  # (GW, name) -> total minutes to add

    for idx, row in out.iterrows():
        mult = float(row["minutes_multiplier"])
        if mult >= 1.0:
            continue

        # >>> Delta is based on last5_avg_incl_zeros, as requested
        base_last5 = float(row["last5_avg_incl_zeros"])
        delta = max(0.0, (1.0 - mult) * base_last5)
        if delta <= 0:
            continue

        gw = row["GW"]

        # Add to comp2 first, then comp1
        for comp_col in ["comp2_name_hist", "comp1_name_hist"]:
            comp_name = row[comp_col]
            if comp_name in [None, "None", "", np.nan]:
                continue
            key = (gw, str(comp_name))
            if key not in key_index:
                continue

            recv_idx = key_index[key]
            recv_curr = float(out.at[recv_idx, "minutes_scenario_adj"])
            headroom = max(0.0, 90.0 - recv_curr)
            if headroom <= 0:
                continue

            add = min(delta, headroom)
            if add > 0:
                additions[key] = additions.get(key, 0.0) + add
                delta -= add


        # any leftover delta is dropped (no eligible complements with headroom)

    # Apply additions
    for (gw, nm), add in additions.items():
        idx = key_index[(gw, nm)]
        out.at[idx, "minutes_scenario_adj"] = min(90.0, float(out.at[idx, "minutes_scenario_adj"]) + add)

    # (optional) expose how much was added per row
    out["comp_minutes_added"] = out.apply(lambda r: additions.get((r["GW"], r["name"]), 0.0), axis=1)
    out["Final_minutes_Adjusted"] = (
        out["minutes_scenario"].astype(float) + out["comp_minutes_added"].fillna(0).astype(float)
    ).clip(upper=90.0)
    
   

    # Save & return
    out.to_csv("GenerateXmins2.csv", index=False)
