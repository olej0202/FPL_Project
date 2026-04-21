import json
import math
import warnings
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LinearRegression, LogisticRegression, PoissonRegressor
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    log_loss,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    import xgboost as xgb

    HAS_XGBOOST = True
except Exception:
    HAS_XGBOOST = False
    xgb = None

warnings.filterwarnings("ignore", category=ConvergenceWarning)


ENGINEERED_FEATURES = [
    "Attack_Matchup",
    "Defense_Matchup",
    "Attack_Edge",
    "Defense_Edge",
    "Form_Attack_Matchup",
    "Form_Defense_Matchup",
    "Form_Net_Edge",
    "Trend_Attack_Matchup",
    "Trend_Defense_Matchup",
    "Threat_Attack_Matchup",
    "Threat_Defense_Matchup",
    "Elo_Home_Interaction",
    "Elo_Ratio",
]


FEATURE_SETS = {
    "base": [
        "Own_XG",
        "Own_XGC",
        "Opposition_XG",
        "Opposition_XGC",
        "Own_Home",
        "Elo_Diff",
    ],
    "form": [
        "Own_XG",
        "Own_XGC",
        "Opposition_XG",
        "Opposition_XGC",
        "Own_XG_slope",
        "Own_XGC_slope",
        "Opponent_XG_slope",
        "Opponent_XGC_slope",
        "Own_XG_avg",
        "Own_XGC_avg",
        "Opposition_XG_avg",
        "Opposition_XGC_avg",
        "Own_Treat",
        "Own_TreatAgainst",
        "Opposition_Treat",
        "Opposition_TreatAgainst",
        "Own_Home",
        "Elo_Diff",
    ],
    "full": [
        "Own_XG",
        "Own_XGC",
        "Opposition_XG",
        "Opposition_XGC",
        "Own_XG_slope",
        "Own_XGC_slope",
        "Opponent_XG_slope",
        "Opponent_XGC_slope",
        "Own_XG_avg",
        "Own_XGC_avg",
        "Opposition_XG_avg",
        "Opposition_XGC_avg",
        "Own_Treat",
        "Own_TreatAgainst",
        "Opposition_Treat",
        "Opposition_TreatAgainst",
        "Own_Cluster",
        "Opposition_Cluster",
        "Own_Elo",
        "Opp_Elo",
        "Elo_Diff",
        "Own_Home",
    ],
    "enhanced_base": [
        "Own_XG",
        "Own_XGC",
        "Opposition_XG",
        "Opposition_XGC",
        "Own_Home",
        "Elo_Diff",
    ]
    + ENGINEERED_FEATURES,
    "enhanced_full": [
        "Own_XG",
        "Own_XGC",
        "Opposition_XG",
        "Opposition_XGC",
        "Own_XG_slope",
        "Own_XGC_slope",
        "Opponent_XG_slope",
        "Opponent_XGC_slope",
        "Own_XG_avg",
        "Own_XGC_avg",
        "Opposition_XG_avg",
        "Opposition_XGC_avg",
        "Own_Treat",
        "Own_TreatAgainst",
        "Opposition_Treat",
        "Opposition_TreatAgainst",
        "Own_Cluster",
        "Opposition_Cluster",
        "Own_Elo",
        "Opp_Elo",
        "Elo_Diff",
        "Own_Home",
    ]
    + ENGINEERED_FEATURES,
}


@dataclass
class ModelPack:
    name: str
    feature_set: str
    features: List[str]
    fill_values: Dict[str, float]
    model: object
    metric_name: str
    metric_value: float
    params: Optional[Dict[str, object]] = None


def _drop_unnamed(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in df.columns if not str(c).lower().startswith("unnamed")]
    return df[cols].copy()


def _as_bool_series(s: pd.Series) -> pd.Series:
    if s.dtype == bool:
        return s
    mapping = {"true": True, "false": False, "1": True, "0": False}
    return (
        s.astype(str)
        .str.strip()
        .str.lower()
        .map(mapping)
        .fillna(False)
        .astype(bool)
    )


def _first_existing(df: pd.DataFrame, cols: List[str], default=np.nan) -> pd.Series:
    out = pd.Series(default, index=df.index, dtype="float64")
    for c in cols:
        if c in df.columns:
            v = pd.to_numeric(df[c], errors="coerce")
            out = out.where(out.notna(), v)
    return out


def _add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    z = df.copy()

    def s(col: str) -> pd.Series:
        if col in z.columns:
            return pd.to_numeric(z[col], errors="coerce")
        return pd.Series(np.nan, index=z.index, dtype="float64")

    own_xg = s("Own_XG")
    own_xgc = s("Own_XGC")
    opp_xg = s("Opposition_XG")
    opp_xgc = s("Opposition_XGC")

    own_xg_avg = s("Own_XG_avg")
    own_xgc_avg = s("Own_XGC_avg")
    opp_xg_avg = s("Opposition_XG_avg")
    opp_xgc_avg = s("Opposition_XGC_avg")

    own_xg_slope = s("Own_XG_slope")
    own_xgc_slope = s("Own_XGC_slope")
    opp_xg_slope = s("Opponent_XG_slope")
    opp_xgc_slope = s("Opponent_XGC_slope")

    own_treat = s("Own_Treat")
    own_treat_against = s("Own_TreatAgainst")
    opp_treat = s("Opposition_Treat")
    opp_treat_against = s("Opposition_TreatAgainst")

    own_elo = s("Own_Elo")
    opp_elo = s("Opp_Elo")
    elo_diff = s("Elo_Diff")
    own_home = s("Own_Home")

    z["Attack_Matchup"] = own_xg * opp_xgc
    z["Defense_Matchup"] = own_xgc * opp_xg
    z["Attack_Edge"] = own_xg - opp_xg
    z["Defense_Edge"] = opp_xgc - own_xgc

    z["Form_Attack_Matchup"] = own_xg_avg * opp_xgc_avg
    z["Form_Defense_Matchup"] = own_xgc_avg * opp_xg_avg
    z["Form_Net_Edge"] = (own_xg_avg - own_xgc_avg) - (opp_xg_avg - opp_xgc_avg)

    z["Trend_Attack_Matchup"] = own_xg_slope + opp_xgc_slope
    z["Trend_Defense_Matchup"] = opp_xg_slope - own_xgc_slope

    z["Threat_Attack_Matchup"] = own_treat * opp_treat_against
    z["Threat_Defense_Matchup"] = own_treat_against * opp_treat

    z["Elo_Home_Interaction"] = elo_diff * own_home
    z["Elo_Ratio"] = own_elo / (opp_elo.abs() + 1e-6)
    return z


def _month_holdout_split(
    df: pd.DataFrame, date_col: str, test_months: int = 2
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    z = df.copy()
    z[date_col] = pd.to_datetime(z[date_col], errors="coerce")
    z = z.dropna(subset=[date_col]).copy()
    if z.empty:
        raise ValueError("No valid rows after parsing dates.")

    max_period = z[date_col].max().to_period("M")
    test_periods = {max_period - i for i in range(max(1, test_months))}
    month_series = z[date_col].dt.to_period("M")
    test_df = z[month_series.isin(test_periods)].copy()
    train_df = z[~month_series.isin(test_periods)].copy()

    if train_df.empty or test_df.empty:
        split_idx = int(0.8 * len(z))
        z = z.sort_values(date_col)
        train_df = z.iloc[:split_idx].copy()
        test_df = z.iloc[split_idx:].copy()
    return train_df, test_df


def _build_opponent_merged_frame(team_df: pd.DataFrame) -> pd.DataFrame:
    required = ["code", "opponent", "kickoff_time", "was_home"]
    missing = [c for c in required if c not in team_df.columns]
    if missing:
        raise ValueError(f"Team dataframe missing columns: {missing}")

    opp_cols = [
        "code",
        "kickoff_time",
        "XGA",
        "XGCA",
        "XGH",
        "XGCH",
        "XG_slope",
        "XGC_slope",
        "XG_avg",
        "XGC_avg",
        "Rolling_Threat",
        "Rolling_Threat_Against",
        "Elo_Rating",
        "Cluster",
        "name",
    ]
    available_opp = [c for c in opp_cols if c in team_df.columns]
    opp = team_df[available_opp].copy()

    merged = pd.merge(
        team_df,
        opp,
        left_on=["opponent", "kickoff_time"],
        right_on=["code", "kickoff_time"],
        how="left",
        suffixes=("_team", "_opp"),
    )
    return merged


def _build_model_frame(merged: pd.DataFrame) -> pd.DataFrame:
    z = merged.copy()
    z["kickoff_time"] = pd.to_datetime(z["kickoff_time"], errors="coerce")
    z = z.dropna(subset=["kickoff_time"]).copy()

    was_home = _as_bool_series(z["was_home_team"] if "was_home_team" in z.columns else z["was_home"])
    was_home_i = was_home.astype(int)

    out = pd.DataFrame(index=z.index)
    out["kickoff_time"] = z["kickoff_time"]
    out["team_name"] = z.get("name_team", z.get("name"))
    out["team_code"] = pd.to_numeric(z.get("code_team", z.get("code")), errors="coerce")
    out["opponent_code"] = pd.to_numeric(z.get("code_opp"), errors="coerce")
    out["was_home"] = was_home_i

    out["Own_XG"] = np.where(was_home, z.get("XGH_team"), z.get("XGA_team"))
    out["Own_XGC"] = np.where(was_home, z.get("XGCH_team"), z.get("XGCA_team"))
    out["Opposition_XG"] = np.where(was_home, z.get("XGA_opp"), z.get("XGH_opp"))
    out["Opposition_XGC"] = np.where(was_home, z.get("XGCA_opp"), z.get("XGCH_opp"))

    out["Own_XG_slope"] = z.get("XG_slope_team")
    out["Own_XGC_slope"] = z.get("XGC_slope_team")
    out["Opponent_XG_slope"] = z.get("XG_slope_opp")
    out["Opponent_XGC_slope"] = z.get("XGC_slope_opp")

    out["Own_XG_avg"] = z.get("XG_avg_team")
    out["Own_XGC_avg"] = z.get("XGC_avg_team")
    out["Opposition_XG_avg"] = z.get("XG_avg_opp")
    out["Opposition_XGC_avg"] = z.get("XGC_avg_opp")

    out["Own_Treat"] = z.get("Rolling_Threat_team")
    out["Own_TreatAgainst"] = z.get("Rolling_Threat_Against_team")
    out["Opposition_Treat"] = z.get("Rolling_Threat_opp")
    out["Opposition_TreatAgainst"] = z.get("Rolling_Threat_Against_opp")

    out["Own_Cluster"] = pd.to_numeric(z.get("Cluster_team"), errors="coerce")
    out["Opposition_Cluster"] = pd.to_numeric(z.get("Cluster_opp"), errors="coerce")

    out["Own_Elo"] = pd.to_numeric(z.get("Elo_Rating_team"), errors="coerce")
    out["Opp_Elo"] = pd.to_numeric(z.get("Elo_Rating_opp"), errors="coerce")
    out["Elo_Diff"] = out["Own_Elo"] - out["Opp_Elo"]
    out["Own_Home"] = was_home_i
    out = _add_engineered_features(out)

    out["Goals_For"] = _first_existing(
        z,
        [
            "Plain_GS_team",
            "Plain_GS",
            "Goals_Scored_team",
            "Goals_Scored",
            "team_h_score_team",
            "team_h_score",
            "XG_team",
            "XG",
        ],
    )
    out["Goals_Against"] = _first_existing(
        z,
        [
            "Plain_GC_team",
            "Plain_GC",
            "Goals_Conceded_team",
            "Goals_Conceded",
            "team_a_score_team",
            "team_a_score",
            "XGC_team",
            "XGC",
        ],
    )
    out["Clean_Sheet"] = _first_existing(
        z, ["Clean_Sheet_team", "Clean_Sheet", "CS_team", "CS"], default=np.nan
    )
    out["Clean_Sheet"] = out["Clean_Sheet"].where(out["Clean_Sheet"].notna(), (out["Goals_Against"] <= 0).astype(float))

    for c in out.columns:
        if c in {"kickoff_time", "team_name"}:
            continue
        out[c] = pd.to_numeric(out[c], errors="coerce")

    out = out.dropna(subset=["Goals_For", "Goals_Against", "Clean_Sheet"])
    out["Goals_For"] = out["Goals_For"].clip(lower=0)
    out["Goals_Against"] = out["Goals_Against"].clip(lower=0)
    out["Clean_Sheet"] = out["Clean_Sheet"].clip(lower=0, upper=1).round().astype(int)
    return out


def _prepare_features(
    df: pd.DataFrame, features: List[str], fill_values: Optional[Dict[str, float]] = None
) -> Tuple[pd.DataFrame, Dict[str, float]]:
    feats = [f for f in features if f in df.columns]
    X = df[feats].copy()
    for c in feats:
        X[c] = pd.to_numeric(X[c], errors="coerce")

    if fill_values is None:
        fill_values = {
            c: float(X[c].median()) if X[c].notna().any() else 0.0 for c in feats
        }
    for c in feats:
        X[c] = X[c].fillna(fill_values.get(c, 0.0))

    return X, fill_values


def _poisson_outcome_probs(lam_home: float, lam_away: float, max_goals: int = 8) -> Tuple[float, float, float]:
    grid = np.arange(0, max_goals + 1)
    ph = np.exp(-lam_home) * (lam_home ** grid) / np.array([math.factorial(int(k)) for k in grid])
    pa = np.exp(-lam_away) * (lam_away ** grid) / np.array([math.factorial(int(k)) for k in grid])
    mat = np.outer(ph, pa)
    home_win = np.tril(mat, -1).sum()
    draw = np.trace(mat)
    away_win = np.triu(mat, 1).sum()
    s = home_win + draw + away_win
    if s <= 0:
        return 1 / 3, 1 / 3, 1 / 3
    return home_win / s, draw / s, away_win / s

def _regression_models(random_state: int = 42) -> List[Tuple[str, object]]:
    models = [
        (
            "poisson_reg",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("model", PoissonRegressor(alpha=0.35, max_iter=1500)),
                ]
            ),
        ),
        (
            "linear_reg",
            Pipeline([("scaler", StandardScaler()), ("model", LinearRegression())]),
        ),
    ]
    if HAS_XGBOOST:
        models.append(
            (
                "xgb_reg",
                xgb.XGBRegressor(
                    objective="reg:squarederror",
                    n_estimators=450,
                    max_depth=4,
                    learning_rate=0.035,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    reg_lambda=2.0,
                    min_child_weight=3,
                    random_state=random_state,
                ),
            )
        )
    return models


def _tune_xgb_goal_regressor(
    Xtr: pd.DataFrame,
    ytr: pd.Series,
    random_state: int = 42,
    n_trials: int = 40,
) -> Tuple[object, Dict[str, object], float, List[Dict[str, object]]]:
    if not HAS_XGBOOST:
        raise RuntimeError("XGBoost is not available for goal model tuning.")

    # Keep chronological order for validation split.
    split_idx = int(0.8 * len(Xtr))
    split_idx = max(24, split_idx)
    split_idx = min(split_idx, len(Xtr) - 1)
    if split_idx <= 0 or split_idx >= len(Xtr):
        split_idx = max(1, len(Xtr) - 1)

    X_fit = Xtr.iloc[:split_idx]
    y_fit = ytr.iloc[:split_idx]
    X_val = Xtr.iloc[split_idx:]
    y_val = ytr.iloc[split_idx:]

    param_space = {
        "n_estimators": [250, 350, 450, 600, 800],
        "max_depth": [3, 4, 5, 6],
        "learning_rate": [0.015, 0.025, 0.035, 0.05, 0.07],
        "subsample": [0.75, 0.85, 0.95, 1.0],
        "colsample_bytree": [0.7, 0.8, 0.9, 1.0],
        "reg_lambda": [0.5, 1.0, 2.0, 4.0, 6.0],
        "min_child_weight": [1, 2, 3, 5, 7],
        "gamma": [0.0, 0.05, 0.1, 0.2],
    }

    seed_candidates = [
        {
            "n_estimators": 500,
            "max_depth": 4,
            "learning_rate": 0.035,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
            "reg_lambda": 2.0,
            "min_child_weight": 3,
            "gamma": 0.0,
        },
        {
            "n_estimators": 700,
            "max_depth": 5,
            "learning_rate": 0.025,
            "subsample": 0.85,
            "colsample_bytree": 0.8,
            "reg_lambda": 4.0,
            "min_child_weight": 2,
            "gamma": 0.05,
        },
    ]

    rng = np.random.default_rng(random_state)
    sampled: List[Dict[str, object]] = []
    seen = set()
    for p in seed_candidates:
        key = tuple(sorted(p.items()))
        seen.add(key)
        sampled.append(p)

    max_random = max(0, int(n_trials) - len(sampled))
    tries = 0
    while len(sampled) < len(seed_candidates) + max_random and tries < (max_random * 30 + 200):
        p = {k: rng.choice(v).item() if hasattr(rng.choice(v), "item") else rng.choice(v) for k, v in param_space.items()}
        key = tuple(sorted(p.items()))
        if key not in seen:
            seen.add(key)
            sampled.append(p)
        tries += 1

    trial_rows: List[Dict[str, object]] = []
    best_model = None
    best_params: Dict[str, object] = {}
    best_rmse = float("inf")

    for i, params in enumerate(sampled, start=1):
        model = xgb.XGBRegressor(
            objective="reg:squarederror",
            eval_metric="rmse",
            tree_method="hist",
            random_state=random_state,
            n_jobs=0,
            **params,
        )
        model.fit(X_fit, y_fit)
        pred = np.asarray(model.predict(X_val), dtype=float).clip(min=0.0)
        rmse = float(np.sqrt(mean_squared_error(y_val, pred)))
        mae = float(mean_absolute_error(y_val, pred))
        trial_rows.append(
            {
                "trial": i,
                **params,
                "val_rmse": rmse,
                "val_mae": mae,
            }
        )
        if rmse < best_rmse:
            best_rmse = rmse
            best_params = dict(params)
            best_model = model

    if best_model is None:
        raise RuntimeError("XGBoost tuning failed to produce a valid model.")

    # Refit best params on full feature-set training sample.
    final_model = xgb.XGBRegressor(
        objective="reg:squarederror",
        eval_metric="rmse",
        tree_method="hist",
        random_state=random_state,
        n_jobs=0,
        **best_params,
    )
    final_model.fit(Xtr, ytr)
    return final_model, best_params, best_rmse, trial_rows


def _classification_models(random_state: int = 42) -> List[Tuple[str, object]]:
    models = [
        (
            "logistic_reg",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("model", LogisticRegression(max_iter=2000, C=1.2)),
                ]
            ),
        )
    ]
    if HAS_XGBOOST:
        models.append(
            (
                "xgb_cls",
                xgb.XGBClassifier(
                    objective="binary:logistic",
                    eval_metric="logloss",
                    n_estimators=450,
                    max_depth=4,
                    learning_rate=0.04,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    reg_lambda=2.0,
                    min_child_weight=3,
                    random_state=random_state,
                ),
            )
        )
    return models


def _evaluate_goal_models(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    target_col: str,
    random_state: int = 42,
) -> Tuple[ModelPack, List[Dict[str, float]], List[Dict[str, object]]]:
    rows: List[Dict[str, float]] = []
    tuning_rows: List[Dict[str, object]] = []
    best_pack: Optional[ModelPack] = None

    y_train = pd.to_numeric(train_df[target_col], errors="coerce").clip(lower=0)
    y_test = pd.to_numeric(test_df[target_col], errors="coerce").clip(lower=0)

    for feature_set_name, feature_set in FEATURE_SETS.items():
        X_train, fill_values = _prepare_features(train_df, feature_set, None)
        X_test, _ = _prepare_features(test_df, list(X_train.columns), fill_values)
        if X_train.shape[1] < 3:
            continue

        idx_train = y_train.index.intersection(X_train.index)
        idx_test = y_test.index.intersection(X_test.index)
        Xtr = X_train.loc[idx_train]
        Xte = X_test.loc[idx_test]
        ytr = y_train.loc[idx_train]
        yte = y_test.loc[idx_test]

        if HAS_XGBOOST:
            try:
                train_time = pd.to_datetime(train_df.loc[idx_train, "kickoff_time"], errors="coerce")
                ordered_idx = train_time.sort_values().index
                Xtr_ord = Xtr.loc[ordered_idx]
                ytr_ord = ytr.loc[ordered_idx]

                tuned_model, tuned_params, val_rmse, trials = _tune_xgb_goal_regressor(
                    Xtr_ord,
                    ytr_ord,
                    random_state=random_state,
                    n_trials=30,
                )
                for tr in trials:
                    tuning_rows.append(
                        {
                            "task": target_col,
                            "feature_set": feature_set_name,
                            **tr,
                        }
                    )

                pred = np.asarray(tuned_model.predict(Xte), dtype=float).clip(min=0.0)
                rmse = float(np.sqrt(mean_squared_error(yte, pred)))
                mae = float(mean_absolute_error(yte, pred))
                r2 = float(r2_score(yte, pred))
                rows.append(
                    {
                        "task": target_col,
                        "model": "xgb_reg_tuned",
                        "feature_set": feature_set_name,
                        "n_features": int(Xtr.shape[1]),
                        "rmse": rmse,
                        "mae": mae,
                        "r2": r2,
                        "inner_val_rmse": val_rmse,
                        "best_params": json.dumps(tuned_params),
                    }
                )

                if best_pack is None or rmse < best_pack.metric_value:
                    best_pack = ModelPack(
                        name="xgb_reg_tuned",
                        feature_set=feature_set_name,
                        features=list(Xtr.columns),
                        fill_values=fill_values,
                        model=tuned_model,
                        metric_name="rmse",
                        metric_value=rmse,
                        params=tuned_params,
                    )
            except Exception as exc:
                rows.append(
                    {
                        "task": target_col,
                        "model": "xgb_reg_tuned",
                        "feature_set": feature_set_name,
                        "n_features": int(Xtr.shape[1]),
                        "rmse": np.nan,
                        "mae": np.nan,
                        "r2": np.nan,
                        "error": str(exc),
                    }
                )
        else:
            for model_name, model in _regression_models(random_state=random_state):
                try:
                    model.fit(Xtr, ytr)
                    pred = np.asarray(model.predict(Xte), dtype=float).clip(min=0.0)

                    rmse = float(np.sqrt(mean_squared_error(yte, pred)))
                    mae = float(mean_absolute_error(yte, pred))
                    r2 = float(r2_score(yte, pred))
                    rows.append(
                        {
                            "task": target_col,
                            "model": model_name,
                            "feature_set": feature_set_name,
                            "n_features": int(Xtr.shape[1]),
                            "rmse": rmse,
                            "mae": mae,
                            "r2": r2,
                        }
                    )

                    if best_pack is None or rmse < best_pack.metric_value:
                        best_pack = ModelPack(
                            name=model_name,
                            feature_set=feature_set_name,
                            features=list(Xtr.columns),
                            fill_values=fill_values,
                            model=model,
                            metric_name="rmse",
                            metric_value=rmse,
                        )
                except Exception as exc:
                    rows.append(
                        {
                            "task": target_col,
                            "model": model_name,
                            "feature_set": feature_set_name,
                            "n_features": int(Xtr.shape[1]),
                            "rmse": np.nan,
                            "mae": np.nan,
                            "r2": np.nan,
                            "error": str(exc),
                        }
                    )

    if best_pack is None:
        raise RuntimeError(f"No valid model could be trained for {target_col}.")
    return best_pack, rows, tuning_rows


def _evaluate_cs_models(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    random_state: int = 42,
) -> Tuple[ModelPack, List[Dict[str, float]]]:
    rows: List[Dict[str, float]] = []
    best_pack: Optional[ModelPack] = None

    y_train = pd.to_numeric(train_df["Clean_Sheet"], errors="coerce").fillna(0).clip(lower=0, upper=1).astype(int)
    y_test = pd.to_numeric(test_df["Clean_Sheet"], errors="coerce").fillna(0).clip(lower=0, upper=1).astype(int)

    for feature_set_name, feature_set in FEATURE_SETS.items():
        X_train, fill_values = _prepare_features(train_df, feature_set, None)
        X_test, _ = _prepare_features(test_df, list(X_train.columns), fill_values)
        if X_train.shape[1] < 3:
            continue

        idx_train = y_train.index.intersection(X_train.index)
        idx_test = y_test.index.intersection(X_test.index)
        Xtr = X_train.loc[idx_train]
        Xte = X_test.loc[idx_test]
        ytr = y_train.loc[idx_train]
        yte = y_test.loc[idx_test]

        if ytr.nunique() < 2:
            continue

        for model_name, model in _classification_models(random_state=random_state):
            try:
                model.fit(Xtr, ytr)
                proba = np.asarray(model.predict_proba(Xte)[:, 1], dtype=float)
                proba = np.clip(proba, 1e-6, 1 - 1e-6)
                pred_bin = (proba >= 0.5).astype(int)

                brier = float(brier_score_loss(yte, proba))
                ll = float(log_loss(yte, proba))
                acc = float(accuracy_score(yte, pred_bin))
                try:
                    auc = float(roc_auc_score(yte, proba))
                except Exception:
                    auc = np.nan

                rows.append(
                    {
                        "task": "Clean_Sheet",
                        "model": model_name,
                        "feature_set": feature_set_name,
                        "n_features": int(Xtr.shape[1]),
                        "brier": brier,
                        "logloss": ll,
                        "accuracy": acc,
                        "auc": auc,
                    }
                )

                if best_pack is None or brier < best_pack.metric_value:
                    best_pack = ModelPack(
                        name=model_name,
                        feature_set=feature_set_name,
                        features=list(Xtr.columns),
                        fill_values=fill_values,
                        model=model,
                        metric_name="brier",
                        metric_value=brier,
                    )
            except Exception as exc:
                rows.append(
                    {
                        "task": "Clean_Sheet",
                        "model": model_name,
                        "feature_set": feature_set_name,
                        "n_features": int(Xtr.shape[1]),
                        "brier": np.nan,
                        "logloss": np.nan,
                        "accuracy": np.nan,
                        "auc": np.nan,
                        "error": str(exc),
                    }
                )

    if best_pack is None:
        raise RuntimeError("No valid model could be trained for Clean_Sheet.")
    return best_pack, rows


def _predict_with_pack(pack: ModelPack, df: pd.DataFrame) -> np.ndarray:
    X, _ = _prepare_features(df, pack.features, pack.fill_values)
    return np.asarray(pack.model.predict(X), dtype=float)


def _predict_proba_with_pack(pack: ModelPack, df: pd.DataFrame) -> np.ndarray:
    X, _ = _prepare_features(df, pack.features, pack.fill_values)
    if hasattr(pack.model, "predict_proba"):
        proba = np.asarray(pack.model.predict_proba(X)[:, 1], dtype=float)
    else:
        raw = np.asarray(pack.model.predict(X), dtype=float)
        proba = 1.0 / (1.0 + np.exp(-raw))
    return np.clip(proba, 1e-6, 1 - 1e-6)


def _select_cs_blend_weight(
    cs_pack: ModelPack,
    goals_against_pack: ModelPack,
    test_df: pd.DataFrame,
) -> Tuple[float, float]:
    """Choose CS blend weight between classifier and Poisson on holdout."""
    y = (
        pd.to_numeric(test_df["Clean_Sheet"], errors="coerce")
        .fillna(0)
        .clip(lower=0, upper=1)
        .astype(int)
        .values
    )
    p_model = _predict_proba_with_pack(cs_pack, test_df)
    ga_pred = np.clip(_predict_with_pack(goals_against_pack, test_df), 0.01, None)
    p_pois = np.clip(np.exp(-ga_pred), 1e-6, 1 - 1e-6)

    best_w_model = 0.5
    best_brier = float("inf")
    for w_model in np.linspace(0.0, 1.0, 21):
        p = np.clip(w_model * p_model + (1.0 - w_model) * p_pois, 1e-6, 1 - 1e-6)
        brier = float(brier_score_loss(y, p))
        if brier < best_brier:
            best_brier = brier
            best_w_model = float(w_model)
    return best_w_model, best_brier


def _linear_feature_effect_rows(
    pack: ModelPack,
    feature_row_df: pd.DataFrame,
    row_meta: Dict[str, object],
    task_name: str,
) -> List[Dict[str, object]]:
    """Per-feature contributions for linear models in scaled feature space."""
    X, _ = _prepare_features(feature_row_df, pack.features, pack.fill_values)

    if not isinstance(pack.model, Pipeline):
        return []
    scaler = pack.model.named_steps.get("scaler")
    model = pack.model.named_steps.get("model")
    if scaler is None or model is None or not hasattr(model, "coef_"):
        return []

    x_vals = X.iloc[0].values.astype(float)
    z_vals = scaler.transform(X)[0].astype(float)
    coefs = np.ravel(model.coef_).astype(float)
    if len(coefs) != len(pack.features):
        return []

    rows: List[Dict[str, object]] = []
    for f, raw_v, z_v, c_v in zip(pack.features, x_vals, z_vals, coefs):
        log_c = float(z_v * c_v)
        rows.append(
            {
                **row_meta,
                "task": task_name,
                "model_name": pack.name,
                "feature_set": pack.feature_set,
                "feature": f,
                "feature_value": float(raw_v),
                "feature_zscore": float(z_v),
                "coefficient": float(c_v),
                "log_contribution": log_c,
                "multiplier": float(np.exp(np.clip(log_c, -10.0, 10.0))),
            }
        )
    return rows

def _load_team_snapshot(
    history_path: str,
    latest_path: str,
    cluster_model: KMeans,
) -> pd.DataFrame:
    hist = _drop_unnamed(pd.read_csv(history_path))
    latest = _drop_unnamed(pd.read_csv(latest_path))
    base = pd.concat([hist, latest], ignore_index=True, sort=False)
    base["kickoff_time"] = pd.to_datetime(base.get("kickoff_time"), errors="coerce")
    base = base.dropna(subset=["code"]).copy()
    base["code"] = pd.to_numeric(base["code"], errors="coerce")
    base = base.dropna(subset=["code"]).copy()

    if "Cluster" not in base.columns:
        base["Cluster"] = np.nan
    if "XG_avg" in base.columns and "XGC_avg" in base.columns:
        xs = base[["XG_avg", "XGC_avg"]].copy()
        xs = xs.apply(pd.to_numeric, errors="coerce")
        med = xs.median()
        xs = xs.fillna(med)
        base.loc[:, "Cluster"] = np.where(
            base["Cluster"].notna(),
            pd.to_numeric(base["Cluster"], errors="coerce"),
            cluster_model.predict(xs.values),
        )

    base = base.sort_values("kickoff_time")
    snap = base.groupby("code", as_index=False).tail(1).copy()
    snap["code"] = snap["code"].astype(int)
    return snap


def _load_upcoming_fixtures(
    fixture_path: str,
    current_team_path: str,
    horizon: int,
) -> pd.DataFrame:
    fixtures = _drop_unnamed(pd.read_csv(fixture_path))
    teams = _drop_unnamed(pd.read_csv(current_team_path))

    if "finished" in fixtures.columns:
        fixtures["finished"] = _as_bool_series(fixtures["finished"])
        fixtures = fixtures[~fixtures["finished"]].copy()
    elif "team_h_score" in fixtures.columns:
        fixtures = fixtures[fixtures["team_h_score"].isna()].copy()

    fixtures["event"] = pd.to_numeric(fixtures.get("event"), errors="coerce")
    fixtures = fixtures.dropna(subset=["event", "team_h", "team_a"]).copy()
    fixtures["event"] = fixtures["event"].astype(int)

    if fixtures.empty:
        return fixtures

    min_event = int(fixtures["event"].min())
    if horizon and horizon > 0:
        max_event = min_event + int(horizon) - 1
        fixtures = fixtures[fixtures["event"].between(min_event, max_event)].copy()

    teams["id"] = pd.to_numeric(teams.get("id"), errors="coerce")
    teams["code"] = pd.to_numeric(teams.get("code"), errors="coerce")
    teams = teams.dropna(subset=["id", "code"]).copy()
    teams["id"] = teams["id"].astype(int)
    teams["code"] = teams["code"].astype(int)

    fixtures["team_h"] = pd.to_numeric(fixtures["team_h"], errors="coerce").astype(int)
    fixtures["team_a"] = pd.to_numeric(fixtures["team_a"], errors="coerce").astype(int)

    home_lookup = teams[["id", "code", "name"]].rename(
        columns={"id": "team_h", "code": "home_code", "name": "home_team"}
    )
    away_lookup = teams[["id", "code", "name"]].rename(
        columns={"id": "team_a", "code": "away_code", "name": "away_team"}
    )
    fixtures = fixtures.merge(home_lookup, on="team_h", how="left")
    fixtures = fixtures.merge(away_lookup, on="team_a", how="left")

    fixture_code = (
        fixtures.get("code")
        if "code" in fixtures.columns
        else fixtures.get("fixture_code", fixtures.get("id"))
    )
    fixtures["fixture_code"] = pd.to_numeric(fixture_code, errors="coerce")
    fallback_codes = pd.Series(fixtures.index + 1, index=fixtures.index, dtype="float64")
    fixtures["fixture_code"] = fixtures["fixture_code"].fillna(fallback_codes).astype(int)

    fixtures = fixtures.dropna(subset=["home_code", "away_code"]).copy()
    fixtures["home_code"] = fixtures["home_code"].astype(int)
    fixtures["away_code"] = fixtures["away_code"].astype(int)

    min_event = int(fixtures["event"].min()) if not fixtures.empty else 0
    fixtures["pred"] = fixtures["event"] - min_event + 1
    return fixtures


def _build_one_side_features(team_row: pd.Series, opp_row: pd.Series, is_home: bool) -> Dict[str, float]:
    own_xg = team_row.get("XGH") if is_home else team_row.get("XGA")
    own_xgc = team_row.get("XGCH") if is_home else team_row.get("XGCA")
    opp_xg = opp_row.get("XGA") if is_home else opp_row.get("XGH")
    opp_xgc = opp_row.get("XGCA") if is_home else opp_row.get("XGCH")

    own_elo = team_row.get("Elo_Rating")
    opp_elo = opp_row.get("Elo_Rating")

    base_feats = {
        "Own_XG": own_xg,
        "Own_XGC": own_xgc,
        "Opposition_XG": opp_xg,
        "Opposition_XGC": opp_xgc,
        "Own_XG_slope": team_row.get("XG_slope"),
        "Own_XGC_slope": team_row.get("XGC_slope"),
        "Opponent_XG_slope": opp_row.get("XG_slope"),
        "Opponent_XGC_slope": opp_row.get("XGC_slope"),
        "Own_XG_avg": team_row.get("XG_avg"),
        "Own_XGC_avg": team_row.get("XGC_avg"),
        "Opposition_XG_avg": opp_row.get("XG_avg"),
        "Opposition_XGC_avg": opp_row.get("XGC_avg"),
        "Own_Treat": team_row.get("Rolling_Threat"),
        "Own_TreatAgainst": team_row.get("Rolling_Threat_Against"),
        "Opposition_Treat": opp_row.get("Rolling_Threat"),
        "Opposition_TreatAgainst": opp_row.get("Rolling_Threat_Against"),
        "Own_Cluster": team_row.get("Cluster"),
        "Opposition_Cluster": opp_row.get("Cluster"),
        "Own_Elo": own_elo,
        "Opp_Elo": opp_elo,
        "Elo_Diff": (pd.to_numeric(own_elo, errors="coerce") - pd.to_numeric(opp_elo, errors="coerce")),
        "Own_Home": 1 if is_home else 0,
    }
    enriched = _add_engineered_features(pd.DataFrame([base_feats]))
    return enriched.iloc[0].to_dict()


def _is_close(a, b, tol: float = 1e-9) -> bool:
    try:
        af = float(a)
        bf = float(b)
    except Exception:
        return False
    if np.isnan(af) and np.isnan(bf):
        return True
    if np.isnan(af) or np.isnan(bf):
        return False
    return abs(af - bf) <= tol


def _blend_goals_with_source_prior(
    model_goals: float,
    source_anchor_goals: float,
    elo_diff: float,
) -> float:
    """Blend conservative model output with source xG/xGC matchup prior.

    This lifts obvious elite-vs-weak mismatches without overriding the model in
    balanced fixtures.
    """
    mg = float(pd.to_numeric(model_goals, errors="coerce"))
    if np.isnan(mg):
        mg = 1.2
    mg = max(0.01, mg)

    anchor = float(pd.to_numeric(source_anchor_goals, errors="coerce"))
    if np.isnan(anchor):
        anchor = mg
    anchor = max(0.01, anchor)
    elo = float(pd.to_numeric(elo_diff, errors="coerce"))
    if np.isnan(elo):
        elo = 0.0

    # Base trust in source prior, then increase it when:
    # 1) team is materially stronger by Elo, and
    # 2) source prior is above model output.
    w = 0.18
    w += 0.24 * max(0.0, elo) / 400.0
    w += 0.25 * max(0.0, anchor - mg)
    w = float(np.clip(w, 0.12, 0.56))
    return (1.0 - w) * mg + w * anchor


def _build_historical_distribution_frame(
    model_df: pd.DataFrame,
    best_for: ModelPack,
    best_against: ModelPack,
    best_cs: ModelPack,
    cs_blend_w_model: float,
) -> pd.DataFrame:
    """Historical calibration frame linking predicted profile to observed outcomes."""
    hist = model_df.copy()
    if hist.empty:
        return pd.DataFrame(columns=["pred_xg", "pred_cs_prob", "Plain_GS", "Clean_Sheet"])

    gf_model = np.clip(_predict_with_pack(best_for, hist), 0.01, None)
    ga_model = np.clip(_predict_with_pack(best_against, hist), 0.01, None)

    anchor = 0.5 * (
        pd.to_numeric(hist.get("Own_XG"), errors="coerce").fillna(1.2).values
        + pd.to_numeric(hist.get("Opposition_XGC"), errors="coerce").fillna(1.2).values
    )
    elo_diff = pd.to_numeric(hist.get("Elo_Diff"), errors="coerce").fillna(0.0).values
    pred_xg = np.array(
        [_blend_goals_with_source_prior(mg, ag, ed) for mg, ag, ed in zip(gf_model, anchor, elo_diff)],
        dtype=float,
    )

    cs_model = _predict_proba_with_pack(best_cs, hist)
    cs_pois = np.exp(-ga_model)
    pred_cs_prob = np.clip(cs_blend_w_model * cs_model + (1.0 - cs_blend_w_model) * cs_pois, 0.01, 0.99)

    out = pd.DataFrame(
        {
            "pred_xg": pred_xg,
            "pred_cs_prob": pred_cs_prob,
            "Plain_GS": pd.to_numeric(hist.get("Goals_For"), errors="coerce"),
            "Clean_Sheet": pd.to_numeric(hist.get("Clean_Sheet"), errors="coerce"),
        }
    )
    out = out.dropna(subset=["pred_xg", "pred_cs_prob", "Plain_GS", "Clean_Sheet"]).copy()
    out["Plain_GS"] = out["Plain_GS"].clip(lower=0)
    out["Clean_Sheet"] = out["Clean_Sheet"].clip(lower=0, upper=1)
    return out


def _attach_distribution_columns(
    pred_df: pd.DataFrame,
    hist_dist_df: pd.DataFrame,
    knn_sample_size: int = 220,
) -> pd.DataFrame:
    """Attach P25/P50/P75 distribution columns for Plain_GS and Clean_Sheet."""
    def _weighted_quantile(values: np.ndarray, weights: np.ndarray, qs: List[float]) -> np.ndarray:
        values = np.asarray(values, dtype=float)
        weights = np.asarray(weights, dtype=float)
        qs_arr = np.asarray(qs, dtype=float)
        if values.size == 0:
            return np.full_like(qs_arr, np.nan, dtype=float)
        order = np.argsort(values)
        v = values[order]
        w = np.clip(weights[order], 1e-12, None)
        ws = np.cumsum(w)
        total = ws[-1]
        if total <= 0:
            return np.quantile(v, qs_arr)
        cdf = ws / total
        return np.interp(qs_arr, cdf, v)

    def _weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
        v = np.asarray(values, dtype=float)
        w = np.asarray(weights, dtype=float)
        denom = np.sum(w)
        if denom <= 0:
            return float(np.nanmean(v))
        return float(np.sum(v * w) / denom)

    out = pred_df.copy()
    if out.empty or hist_dist_df.empty:
        for c in [
            "Plain_GS_Mean",
            "Plain_GS_Avg_Lower25",
            "Plain_GS_Avg_Upper75",
            "Plain_GS_P25",
            "Plain_GS_P50",
            "Plain_GS_P75",
            "Clean_Sheet_Mean",
            "Clean_Sheet_P25",
            "Clean_Sheet_P50",
            "Clean_Sheet_P75",
            "Distribution_Sample_N",
        ]:
            out[c] = np.nan
        return out

    hxg = pd.to_numeric(hist_dist_df["pred_xg"], errors="coerce").values.astype(float)
    hcs = pd.to_numeric(hist_dist_df["pred_cs_prob"], errors="coerce").values.astype(float)
    hgs = pd.to_numeric(hist_dist_df["Plain_GS"], errors="coerce").values.astype(float)
    hcs_obs = pd.to_numeric(hist_dist_df["Clean_Sheet"], errors="coerce").values.astype(float)

    sxg = float(np.nanstd(hxg)) + 1e-6
    scs = float(np.nanstd(hcs)) + 1e-6

    pxg_all = pd.to_numeric(out.get("XG"), errors="coerce").fillna(np.nanmedian(hxg)).values.astype(float)
    pcs_all = pd.to_numeric(out.get("CS"), errors="coerce").fillna(np.nanmedian(hcs)).values.astype(float)

    n_hist = len(hist_dist_df)
    k = int(max(40, min(knn_sample_size, n_hist)))

    pgs_mean, pgs_l25_avg, pgs_u75_avg = [], [], []
    pgs25, pgs50, pgs75 = [], [], []
    pcs_mean = []
    pcs25, pcs50, pcs75 = [], [], []
    ns = []

    for pxg, pcs in zip(pxg_all, pcs_all):
        d = ((hxg - pxg) / sxg) ** 2 + ((hcs - pcs) / scs) ** 2
        if k < n_hist:
            idx = np.argpartition(d, k)[:k]
        else:
            idx = np.arange(n_hist)

        s_gs = hgs[idx].astype(float)
        s_cs = hcs_obs[idx].astype(float)
        s_d = d[idx].astype(float)

        # Kernel weights (closer historical rows get more influence).
        bw = float(np.quantile(s_d, 0.5)) + 1e-6
        w = np.exp(-0.5 * s_d / bw)
        w = np.clip(w, 1e-12, None)
        w = w / np.sum(w)

        q_gs = _weighted_quantile(s_gs, w, [0.25, 0.50, 0.75])
        q_cs = _weighted_quantile(s_cs, w, [0.25, 0.50, 0.75])

        gs_mean = _weighted_mean(s_gs, w)
        cs_mean = _weighted_mean(s_cs, w)

        l25_mask = s_gs <= q_gs[0]
        u75_mask = s_gs >= q_gs[2]
        if np.any(l25_mask):
            l25_avg = _weighted_mean(s_gs[l25_mask], w[l25_mask])
        else:
            l25_avg = float(q_gs[0])
        if np.any(u75_mask):
            u75_avg = _weighted_mean(s_gs[u75_mask], w[u75_mask])
        else:
            u75_avg = float(q_gs[2])

        pgs_mean.append(float(gs_mean))
        pgs_l25_avg.append(float(l25_avg))
        pgs_u75_avg.append(float(u75_avg))
        pgs25.append(float(q_gs[0]))
        pgs50.append(float(q_gs[1]))
        pgs75.append(float(q_gs[2]))
        pcs_mean.append(float(cs_mean))
        pcs25.append(float(q_cs[0]))
        pcs50.append(float(q_cs[1]))
        pcs75.append(float(q_cs[2]))
        ns.append(int(len(idx)))

    out["Plain_GS_Mean"] = pgs_mean
    out["Plain_GS_Avg_Lower25"] = pgs_l25_avg
    out["Plain_GS_Avg_Upper75"] = pgs_u75_avg
    out["Plain_GS_P25"] = pgs25
    out["Plain_GS_P50"] = pgs50
    out["Plain_GS_P75"] = pgs75
    out["Clean_Sheet_Mean"] = pcs_mean
    out["Clean_Sheet_P25"] = pcs25
    out["Clean_Sheet_P50"] = pcs50
    out["Clean_Sheet_P75"] = pcs75
    out["Distribution_Sample_N"] = ns
    return out


def _suffix_token(output_tag: str) -> str:
    tag = str(output_tag).strip()
    if not tag:
        tag = "newtest"
    if tag.isdigit():
        return tag
    return tag if tag.startswith("_") else f"_{tag}"


def _build_output_paths(output_tag: str) -> Dict[str, str]:
    token = _suffix_token(output_tag)
    return {
        "model_experiments": f"Team_model_experiments{token}.csv",
        "xgb_tuning_goals": f"Team_xgb_tuning_goals{token}.csv",
        "model_selection": f"Team_model_selection{token}.json",
        "prediction_visual": f"Team_prediction_visual{token}.csv",
        "prediction": f"Team_prediction{token}.csv",
        "prediction_results": f"Team_prediction_results{token}.csv",
        "prediction_visual_results": f"Team_prediction_visual_results{token}.csv",
        "feature_alignment": f"Team_feature_alignment{token}.csv",
        "feature_effects": f"Team_feature_effects{token}.csv",
    }


def GenerateTeamPredictions2(
    fixture_path: str = "Fantasy_season_Fixtures_EXPANDED.csv",
    current_team_path: str = "Raw_Data_25/current_teams.csv",
    horizon: int = 6,
    history_path: str = "Team_data_transformed2.csv",
    latest_team_path: str = "Team_data_newest3.csv",
    test_months: int = 2,
    random_state: int = 42,
    output_tag: str = "newtest",
) -> Dict[str, object]:
    output_paths = _build_output_paths(output_tag)
    history_df = _drop_unnamed(pd.read_csv(history_path))
    history_df["kickoff_time"] = pd.to_datetime(history_df.get("kickoff_time"), errors="coerce")
    history_df = history_df.dropna(subset=["kickoff_time"]).copy()

    cluster_source = history_df[["XG_avg", "XGC_avg"]].apply(pd.to_numeric, errors="coerce")
    cluster_source = cluster_source.fillna(cluster_source.median())
    kmeans = KMeans(n_clusters=4, random_state=random_state, n_init=10)
    history_df["Cluster"] = kmeans.fit_predict(cluster_source.values)

    merged_hist = _build_opponent_merged_frame(history_df)
    model_df = _build_model_frame(merged_hist)

    train_df, test_df = _month_holdout_split(model_df, "kickoff_time", test_months=test_months)
    train_df = train_df[train_df["kickoff_time"] > "2022-12-31"].copy()
    if train_df.empty:
        train_df = model_df.sort_values("kickoff_time").iloc[: int(0.8 * len(model_df))].copy()
        test_df = model_df.sort_values("kickoff_time").iloc[int(0.8 * len(model_df)) :].copy()

    best_for, eval_for, tune_for = _evaluate_goal_models(
        train_df,
        test_df,
        target_col="Goals_For",
        random_state=random_state,
    )
    best_against, eval_against, tune_against = _evaluate_goal_models(
        train_df, test_df, target_col="Goals_Against", random_state=random_state
    )
    best_cs, eval_cs = _evaluate_cs_models(train_df, test_df, random_state=random_state)
    cs_blend_w_model, cs_blend_brier = _select_cs_blend_weight(best_cs, best_against, test_df)
    hist_dist_df = _build_historical_distribution_frame(
        model_df=model_df,
        best_for=best_for,
        best_against=best_against,
        best_cs=best_cs,
        cs_blend_w_model=cs_blend_w_model,
    )

    all_eval = pd.DataFrame(eval_for + eval_against + eval_cs)
    all_eval.to_csv(output_paths["model_experiments"], index=False)
    pd.DataFrame(tune_for + tune_against).to_csv(output_paths["xgb_tuning_goals"], index=False)

    selection = {
        "best_goals_for": {
            "model": best_for.name,
            "feature_set": best_for.feature_set,
            "metric": best_for.metric_name,
            "value": best_for.metric_value,
            "params": best_for.params,
        },
        "best_goals_against": {
            "model": best_against.name,
            "feature_set": best_against.feature_set,
            "metric": best_against.metric_name,
            "value": best_against.metric_value,
            "params": best_against.params,
        },
        "best_clean_sheet": {
            "model": best_cs.name,
            "feature_set": best_cs.feature_set,
            "metric": best_cs.metric_name,
            "value": best_cs.metric_value,
        },
        "cs_blend_weight_model": cs_blend_w_model,
        "cs_blend_weight_pois": (1.0 - cs_blend_w_model),
        "cs_blend_brier": cs_blend_brier,
        "distribution_method": "weighted_knn_xg_cs",
        "distribution_knn_sample_size": 220,
        "distribution_historical_rows": int(len(hist_dist_df)),
        "selected_features": {
            "goals_for": list(best_for.features),
            "goals_against": list(best_against.features),
            "clean_sheet": list(best_cs.features),
        },
        "xgboost_available": HAS_XGBOOST,
    }
    with open(output_paths["model_selection"], "w", encoding="utf-8") as f:
        json.dump(selection, f, indent=2)

    snapshot = _load_team_snapshot(history_path, latest_team_path, kmeans)
    snapshot_map = {int(r["code"]): r for _, r in snapshot.iterrows()}
    fixtures = _load_upcoming_fixtures(fixture_path, current_team_path, horizon=horizon)

    fixture_rows = []
    team_rows = []
    alignment_rows = []
    feature_effect_rows: List[Dict[str, object]] = []

    for _, fx in fixtures.iterrows():
        home_code = int(fx["home_code"])
        away_code = int(fx["away_code"])
        home = snapshot_map.get(home_code)
        away = snapshot_map.get(away_code)
        if home is None or away is None:
            continue

        feat_home = pd.DataFrame([_build_one_side_features(home, away, is_home=True)])
        feat_away = pd.DataFrame([_build_one_side_features(away, home, is_home=False)])
        fh = feat_home.iloc[0]
        fa = feat_away.iloc[0]

        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_for,
                feat_home,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "H",
                    "team_name": fx["home_team"],
                    "opp_name": fx["away_team"],
                },
                task_name="Goals_For",
            )
        )
        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_for,
                feat_away,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "A",
                    "team_name": fx["away_team"],
                    "opp_name": fx["home_team"],
                },
                task_name="Goals_For",
            )
        )
        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_against,
                feat_home,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "H",
                    "team_name": fx["home_team"],
                    "opp_name": fx["away_team"],
                },
                task_name="Goals_Against",
            )
        )
        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_against,
                feat_away,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "A",
                    "team_name": fx["away_team"],
                    "opp_name": fx["home_team"],
                },
                task_name="Goals_Against",
            )
        )
        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_cs,
                feat_home,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "H",
                    "team_name": fx["home_team"],
                    "opp_name": fx["away_team"],
                },
                task_name="Clean_Sheet",
            )
        )
        feature_effect_rows.extend(
            _linear_feature_effect_rows(
                best_cs,
                feat_away,
                {
                    "fixture_code": int(fx["fixture_code"]),
                    "GW": int(fx["event"]),
                    "side": "A",
                    "team_name": fx["away_team"],
                    "opp_name": fx["home_team"],
                },
                task_name="Clean_Sheet",
            )
        )

        hg_for = float(_predict_with_pack(best_for, feat_home)[0])
        ag_for = float(_predict_with_pack(best_for, feat_away)[0])
        hg_against = float(_predict_with_pack(best_against, feat_home)[0])
        ag_against = float(_predict_with_pack(best_against, feat_away)[0])

        home_model_goals = max(0.01, (hg_for + ag_against) / 2.0)
        away_model_goals = max(0.01, (ag_for + hg_against) / 2.0)

        # Source-driven matchup priors:
        # Home attack anchor uses home home-xG and away away-xGC.
        # Away attack anchor uses away away-xG and home home-xGC.
        home_anchor = 0.5 * (
            float(pd.to_numeric(fh.get("Own_XG"), errors="coerce"))
            + float(pd.to_numeric(fh.get("Opposition_XGC"), errors="coerce"))
        )
        away_anchor = 0.5 * (
            float(pd.to_numeric(fa.get("Own_XG"), errors="coerce"))
            + float(pd.to_numeric(fa.get("Opposition_XGC"), errors="coerce"))
        )

        home_goals = _blend_goals_with_source_prior(
            model_goals=home_model_goals,
            source_anchor_goals=home_anchor,
            elo_diff=fh.get("Elo_Diff"),
        )
        away_goals = _blend_goals_with_source_prior(
            model_goals=away_model_goals,
            source_anchor_goals=away_anchor,
            elo_diff=fa.get("Elo_Diff"),
        )

        p_cs_home_model = float(_predict_proba_with_pack(best_cs, feat_home)[0])
        p_cs_away_model = float(_predict_proba_with_pack(best_cs, feat_away)[0])
        p_cs_home_pois = float(np.exp(-away_goals))
        p_cs_away_pois = float(np.exp(-home_goals))

        p_cs_home = float(
            np.clip(cs_blend_w_model * p_cs_home_model + (1.0 - cs_blend_w_model) * p_cs_home_pois, 0.01, 0.99)
        )
        p_cs_away = float(
            np.clip(cs_blend_w_model * p_cs_away_model + (1.0 - cs_blend_w_model) * p_cs_away_pois, 0.01, 0.99)
        )
        cs_odds_home = p_cs_home / (1.0 - p_cs_home)
        cs_odds_away = p_cs_away / (1.0 - p_cs_away)

        p_home, p_draw, p_away = _poisson_outcome_probs(home_goals, away_goals, max_goals=8)

        alignment_rows.append(
            {
                "fixture_code": int(fx["fixture_code"]),
                "GW": int(fx["event"]),
                "side": "H",
                "team_name": fx["home_team"],
                "opp_name": fx["away_team"],
                "feature_Own_XG": fh["Own_XG"],
                "feature_Own_XGC": fh["Own_XGC"],
                "feature_Opposition_XG": fh["Opposition_XG"],
                "feature_Opposition_XGC": fh["Opposition_XGC"],
                "source_expected_Own_XG": home.get("XGH"),
                "source_expected_Own_XGC": home.get("XGCH"),
                "source_expected_Opposition_XG": away.get("XGA"),
                "source_expected_Opposition_XGC": away.get("XGCA"),
                "own_xg_ok": _is_close(fh["Own_XG"], home.get("XGH")),
                "own_xgc_ok": _is_close(fh["Own_XGC"], home.get("XGCH")),
                "opp_xg_ok": _is_close(fh["Opposition_XG"], away.get("XGA")),
                "opp_xgc_ok": _is_close(fh["Opposition_XGC"], away.get("XGCA")),
                "goals_for_model": hg_for,
                "opp_concede_model": ag_against,
                "model_goals_pre_blend": home_model_goals,
                "source_anchor_goals": home_anchor,
                "final_goals": home_goals,
            }
        )
        alignment_rows.append(
            {
                "fixture_code": int(fx["fixture_code"]),
                "GW": int(fx["event"]),
                "side": "A",
                "team_name": fx["away_team"],
                "opp_name": fx["home_team"],
                "feature_Own_XG": fa["Own_XG"],
                "feature_Own_XGC": fa["Own_XGC"],
                "feature_Opposition_XG": fa["Opposition_XG"],
                "feature_Opposition_XGC": fa["Opposition_XGC"],
                "source_expected_Own_XG": away.get("XGA"),
                "source_expected_Own_XGC": away.get("XGCA"),
                "source_expected_Opposition_XG": home.get("XGH"),
                "source_expected_Opposition_XGC": home.get("XGCH"),
                "own_xg_ok": _is_close(fa["Own_XG"], away.get("XGA")),
                "own_xgc_ok": _is_close(fa["Own_XGC"], away.get("XGCA")),
                "opp_xg_ok": _is_close(fa["Opposition_XG"], home.get("XGH")),
                "opp_xgc_ok": _is_close(fa["Opposition_XGC"], home.get("XGCH")),
                "goals_for_model": ag_for,
                "opp_concede_model": hg_against,
                "model_goals_pre_blend": away_model_goals,
                "source_anchor_goals": away_anchor,
                "final_goals": away_goals,
            }
        )

        fixture_rows.append(
            {
                "GW": int(fx["event"]),
                "fixture_code": int(fx["fixture_code"]),
                "pred": int(fx["pred"]),
                "home_team": fx["home_team"],
                "away_team": fx["away_team"],
                "home_code": home_code,
                "away_code": away_code,
                "home_goals": home_goals,
                "away_goals": away_goals,
                "Clean_Sheet_home": p_cs_home,
                "Clean_Sheet_away": p_cs_away,
                "CS_odds_home": cs_odds_home,
                "CS_odds_away": cs_odds_away,
                "Home_Win": 100.0 * p_home,
                "Away_Win": 100.0 * p_away,
                "Draw": 100.0 * p_draw,
            }
        )

        team_rows.append(
            {
                "fixture_code": int(fx["fixture_code"]),
                "GW": int(fx["event"]),
                "pred": int(fx["pred"]),
                "team_name": fx["home_team"],
                "team_code": home_code,
                "XG": home_goals,
                "XGC": away_goals,
                "CS": p_cs_home,
                "CS_odds": cs_odds_home,
                "Opposition_XG": away_goals,
                "Opposition_XGC": home_goals,
                "Opponent_team": fx["away_team"],
                "Home": "H",
                "Win_Percent": 100.0 * p_home,
                "Draw_percent": 100.0 * p_draw,
                "Loss_percent": 100.0 * p_away,
            }
        )
        team_rows.append(
            {
                "fixture_code": int(fx["fixture_code"]),
                "GW": int(fx["event"]),
                "pred": int(fx["pred"]),
                "team_name": fx["away_team"],
                "team_code": away_code,
                "XG": away_goals,
                "XGC": home_goals,
                "CS": p_cs_away,
                "CS_odds": cs_odds_away,
                "Opposition_XG": home_goals,
                "Opposition_XGC": away_goals,
                "Opponent_team": fx["home_team"],
                "Home": "A",
                "Win_Percent": 100.0 * p_away,
                "Draw_percent": 100.0 * p_draw,
                "Loss_percent": 100.0 * p_home,
            }
        )

    visual_df = pd.DataFrame(fixture_rows)
    pred_df = pd.DataFrame(team_rows)
    alignment_df = pd.DataFrame(alignment_rows)
    feature_effect_df = pd.DataFrame(feature_effect_rows)
    pred_df = _attach_distribution_columns(pred_df, hist_dist_df, knn_sample_size=220)

    visual_df.to_csv(output_paths["prediction_visual"], index=False)
    pred_df.to_csv(output_paths["prediction"], index=False)
    alignment_df.to_csv(output_paths["feature_alignment"], index=False)
    feature_effect_df.to_csv(output_paths["feature_effects"], index=False)

    results_df = pred_df[
        [
            "GW",
            "pred",
            "team_name",
            "team_code",
            "Win_Percent",
            "Draw_percent",
            "Loss_percent",
            "Opponent_team",
            "Home",
        ]
    ].copy()
    results_df = results_df.rename(columns={"Win_Percent": "win_Percent"})
    results_df["Win_Percent"] = results_df["win_Percent"]
    results_df.to_csv(output_paths["prediction_results"], index=False)

    visual_results_df = visual_df[
        ["GW", "pred", "home_team", "away_team", "home_code", "away_code"]
    ].copy()
    visual_results_df["Home_win_Percent"] = pd.to_numeric(visual_df["Home_Win"], errors="coerce")
    visual_results_df["Away_win_Percent"] = pd.to_numeric(visual_df["Away_Win"], errors="coerce")
    visual_results_df["Draw_percent"] = pd.to_numeric(visual_df["Draw"], errors="coerce")
    visual_results_df["Home_win_Percent2"] = visual_results_df["Home_win_Percent"]
    visual_results_df["Away_win_Percent2"] = visual_results_df["Away_win_Percent"]
    visual_results_df["Draw_percent2"] = visual_results_df["Draw_percent"]
    visual_results_df.to_csv(output_paths["prediction_visual_results"], index=False)

    return {
        "model_selection": selection,
        "n_historical_rows": int(len(model_df)),
        "n_train_rows": int(len(train_df)),
        "n_test_rows": int(len(test_df)),
        "n_upcoming_fixtures": int(len(visual_df)),
        "files_written": [
            output_paths["model_experiments"],
            output_paths["xgb_tuning_goals"],
            output_paths["model_selection"],
            output_paths["prediction_visual"],
            output_paths["prediction"],
            output_paths["prediction_results"],
            output_paths["prediction_visual_results"],
            output_paths["feature_alignment"],
            output_paths["feature_effects"],
        ],
    }


if __name__ == "__main__":
    result = GenerateTeamPredictions2()
    print(json.dumps(result, indent=2))
