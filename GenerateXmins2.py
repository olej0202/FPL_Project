"""Two-stage NN/XGBoost minutes forecasts for current players x future GWs.

Run with the project's environment::

    venv\\Scripts\\python.exe GenerateXmins2.py --gws 6 7 8 --output GenerateXmins3.csv
    venv\\Scripts\\python.exe GenerateXmins2.py --write-config xmins_config.json
    venv\\Scripts\\python.exe GenerateXmins2.py --config xmins_config.json

All settings below can be overridden in JSON or with Config(...). Relative paths
are resolved from data_dir (the script directory by default). GetXmins accepts
the existing current_players, n_future, scenarios calling convention.

Each head blends 50% NN and 50% XGBoost by default. Expected minutes are the
blended P(minutes > 0) times blended minutes conditional on playing.
NNs are trained here; XGBoost loads the winners from the supplied experiment.
Histories retain real zeroes; only the conditional model's TARGETS exclude zero.
Like the supplied model, each player's last two matches are validation/test;
this is a per-player holdout, not a global chronological backtest. Future GWs
share the latest observed baseline (predictions are not fed back as observations).
Minutes are per match, 0..90, including in blank/double GWs; this is not a fixture
count multiplier. Flags recover per requested GW, matching GenerateXmins.py.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, replace
import importlib
import json
from pathlib import Path
import re
import warnings

import numpy as np
import pandas as pd


@dataclass
class Config:
    data_dir: str = str(Path(__file__).resolve().parent)
    history_path: str = "Fantasy_Merged.csv"
    current_players_path: str = "Raw_Data_26/current_players.csv"
    fixtures_path: str = "Raw_Data_26/Fantasy_season_2026_Fixtures.csv"
    output_path: str = "GenerateXmins3.csv"
    test_output_path: str | None = None
    gameweeks: tuple[int, ...] | None = None
    n_future: int = 8
    as_of: str | None = None  # UTC now; also excludes future history rows
    history_length: int = 8
    nn_features_per_match: int = 2  # [minutes, days_ago]; 1 retains minute-only inputs.
    nn_days_scale: float = 30.0
    nn_days_clip_max: float | None = 12.0
    padding_value: float = -1.0
    max_minutes: float = 90.0
    min_historical_minutes: float = 60.0
    min_observations: int = 4
    seed: int = 42
    play_units: tuple[int, ...] = (16, 16)
    minutes_units: tuple[int, ...] = (32, 16)
    hidden_activation: str = "relu"
    play_dropout: float = 0.05
    minutes_dropout: float = 0.05
    play_negative_weight: float = 1.0
    play_positive_weight: float = 3.0
    minutes_output_activation: str = "sigmoid"
    learning_rate: float = 0.001
    minutes_loss: str = "huber"
    minutes_huber_delta: float = 0.2
    play_epochs: int = 600
    minutes_epochs: int = 1000
    batch_size: int = 64
    shuffle: bool = True
    early_stopping_patience: int = 50
    early_stopping_min_delta: float = 0.0001
    lr_factor: float = 0.5
    lr_patience: int = 15
    min_learning_rate: float = 0.00001
    training_verbose: int = 0
    neural_weight: float = 0.5  # Applied separately to probability and conditional minutes.
    xgb_play_model_path: str = "best_xgb_play_model.json"
    xgb_minutes_model_path: str = "best_xgb_minutes_model.json"
    xgb_history_length: int = 8
    xgb_days_scale: float = 30.0
    xgb_days_clip_max: float | None = 12.0
    no_history_minutes: float = 0.0
    no_history_prob_play: float = 0.0  # fraction, not percent
    last_average_window: int = 5
    apply_flags: bool = True
    chance_column: str = "chance_of_playing_this_round"
    chance_fallback_column: str = "chance_of_playing_next_round"
    default_chance: float = 100.0
    recovery_per_gw: float = 0.10
    suspension_gws: int = 1
    zero_news_keywords: tuple[str, ...] = (
        "has joined", "has departed", "on loan", "on load",
        "unknown return", "expected back",
    )
    zero_statuses: tuple[str, ...] = ("i", "u", "n")
    # Explicit supplied scenarios override this module; [] disables scenarios.
    scenarios_module: str | None = "GenerateConfig"
    scenarios_attribute: str = "Manual_min"
    scenarios_path: str | None = None  # JSON list or CSV with name/type/GW/value
    scenario_ramp_gws: int = 3
    # Existing code calculated complement additions but did not apply them.
    redistribute_complements: bool = False
    complement_order: tuple[int, ...] = (2, 1)
    apply_team_adjustment: bool = True
    team_minutes_target: float = 1050.0
    adjustment_min_minutes: float = 10.0
    adjustment_max_minutes: float = 75.0
    adjustment_minutes_floor: float = 30.0
    adjustment_minutes_power: float = 1.2
    adjustment_uncertainty_floor: float = 12.0
    adjustment_uncertainty_power: float = 1.3
    adjustment_minutes_share: float = 0.5
    adjustment_cap: float = 30.0
    output_decimals: int = 4

    def path(self, value):
        path = Path(value)
        return path if path.is_absolute() else Path(self.data_dir) / path

    def validate(self):
        for key in ("history_length", "n_future", "play_epochs", "minutes_epochs",
                    "batch_size", "last_average_window", "scenario_ramp_gws", "xgb_history_length"):
            value = getattr(self, key)
            if not isinstance(value, int) or value <= 0:
                raise ValueError(f"{key} must be a positive integer")
        if self.min_observations < 4 or self.min_historical_minutes < 0:
            raise ValueError("min_observations must be >= 4; historical minutes >= 0")
        if self.nn_features_per_match not in (1, 2):
            raise ValueError("nn_features_per_match must be 1 (minutes) or 2 (minutes and days)")
        for key in ("play_negative_weight", "play_positive_weight", "minutes_huber_delta", "nn_days_scale"):
            if not np.isfinite(getattr(self, key)) or getattr(self, key) <= 0:
                raise ValueError(f"{key} must be finite and positive")
        if self.nn_days_clip_max is not None and (not np.isfinite(self.nn_days_clip_max) or self.nn_days_clip_max <= 0):
            raise ValueError("nn_days_clip_max must be None or finite and positive")
        if self.minutes_output_activation not in ("sigmoid", "linear"):
            raise ValueError("minutes_output_activation must be sigmoid or linear")
        if self.max_minutes <= 0 or self.padding_value >= 0:
            raise ValueError("max_minutes must be positive and padding_value negative")
        for key in ("play_dropout", "minutes_dropout"):
            if not 0 <= getattr(self, key) < 1:
                raise ValueError(f"{key} must be in [0, 1)")
        for key in ("no_history_prob_play", "adjustment_minutes_share", "neural_weight"):
            if not 0 <= getattr(self, key) <= 1:
                raise ValueError(f"{key} must be in [0, 1]")
        if not 0 <= self.no_history_minutes <= self.max_minutes:
            raise ValueError("no_history_minutes must be within the minutes bounds")
        if not 0 <= self.default_chance <= 100 or self.recovery_per_gw < 0:
            raise ValueError("Invalid default_chance or recovery_per_gw")
        if self.suspension_gws < 0 or self.adjustment_cap < 0:
            raise ValueError("suspension_gws and adjustment_cap must be nonnegative")
        if not 0 <= self.adjustment_min_minutes <= self.adjustment_max_minutes <= self.max_minutes:
            raise ValueError("Invalid adjustment eligibility bounds")
        if self.learning_rate <= 0 or not 0 < self.lr_factor < 1:
            raise ValueError("Invalid learning_rate or lr_factor")
        if any(i not in (1, 2) for i in self.complement_order):
            raise ValueError("complement_order may contain only 1 and 2")
        if not np.isfinite(self.xgb_days_scale) or self.xgb_days_scale <= 0:
            raise ValueError("xgb_days_scale must be finite and positive")
        if self.xgb_days_clip_max is not None and (not np.isfinite(self.xgb_days_clip_max) or self.xgb_days_clip_max <= 0):
            raise ValueError("xgb_days_clip_max must be None or finite and positive")


def require_columns(frame, columns, source):
    missing = set(columns) - set(frame.columns)
    if missing:
        raise ValueError(f"{source} missing columns: {sorted(missing)}")


def code_keys(series):
    """CSV codes often arrive as 154561.0; use the same identity on both sides."""
    return series.astype("string").str.strip().str.replace(r"\.0+$", "", regex=True)


def load_data(cfg):
    current = pd.read_csv(cfg.path(cfg.current_players_path))
    require_columns(current, ["code", "name", "team_code"], "current_players")
    current["_player"] = code_keys(current["code"])
    if current.empty or current[["code", "name", "team_code"]].isna().any().any():
        raise ValueError("current_players must contain non-null player identities and teams")
    if current["_player"].duplicated().any() or current["name"].duplicated().any():
        raise ValueError("current_players must have unique codes and names")
    columns = pd.read_csv(cfg.path(cfg.history_path), nrows=0).columns
    wanted = [c for c in ("name", "kickoff_time", "minutes", "team_code", "code_x", "code") if c in columns]
    history = pd.read_csv(cfg.path(cfg.history_path), usecols=wanted)
    require_columns(history, ["name", "kickoff_time", "minutes", "team_code"], "history")
    code_col = next((c for c in ("code_x", "code") if c in history), None)
    if code_col:
        history["_player"] = code_keys(history[code_col])
        # Rows without a code still retain their own name-based histories.
        history["_player"] = history["_player"].fillna("name:" + history["name"].astype("string"))
    else:
        history["_player"] = "name:" + history["name"].astype("string")
        current["_player"] = "name:" + current["name"].astype("string")
    history["kickoff_time"] = pd.to_datetime(history["kickoff_time"], errors="coerce", utc=True)
    history["minutes"] = pd.to_numeric(history["minutes"], errors="coerce")
    history = history.dropna(subset=["_player", "kickoff_time", "minutes"])
    history = history.loc[history["kickoff_time"] <= as_of_time(cfg)].copy()
    history["minutes"] = history["minutes"].clip(0, cfg.max_minutes)
    # Repeated ingestion of the same match must not become extra observations.
    history = history.drop_duplicates(["_player", "kickoff_time"], keep="last")
    return current, history.sort_values(["_player", "kickoff_time"]).reset_index(drop=True)


def as_of_time(cfg):
    return pd.to_datetime(cfg.as_of, utc=True) if cfg.as_of else pd.Timestamp.now(tz="UTC")


def gameweeks(cfg):
    if cfg.gameweeks is not None:
        values = list(cfg.gameweeks)
    else:
        fixtures = pd.read_csv(cfg.path(cfg.fixtures_path))
        require_columns(fixtures, ["event", "kickoff_time"], "fixtures")
        fixtures["kickoff_time"] = pd.to_datetime(fixtures["kickoff_time"], errors="coerce", utc=True)
        starts = fixtures.groupby("event")["kickoff_time"].min()
        values = starts[starts > as_of_time(cfg)].sort_values().head(cfg.n_future).index.tolist()
    if not values or any(not np.isfinite(float(v)) or float(v) != int(float(v)) or int(float(v)) <= 0 for v in values):
        raise ValueError("Supply positive integer gameweeks with --gws, or check fixtures/as_of")
    result = sorted(int(float(v)) for v in values)
    if len(set(result)) != len(result):
        raise ValueError("Gameweeks must be unique")
    return result


def create_history(values, position, cfg, kickoff_times=None, reference_date=None):
    start = max(0, position - cfg.history_length)
    observed = np.asarray(values[start:position], dtype=np.float32)
    if cfg.nn_features_per_match == 2:
        if kickoff_times is None or reference_date is None:
            raise ValueError("NN minutes-and-days inputs require kickoff_times and reference_date")
        result = np.full((cfg.history_length, 2), cfg.padding_value, dtype=np.float32)
        if len(observed):
            dates = pd.DatetimeIndex(pd.to_datetime(kickoff_times, utc=True))[start:position]
            reference = pd.to_datetime(reference_date, utc=True)
            result[-len(observed):, 0] = observed
            result[-len(observed):, 1] = np.maximum(0, (reference - dates).total_seconds() / 86400)
        return result
    return np.pad(observed, (cfg.history_length - len(observed), 0), constant_values=cfg.padding_value)


def scale_inputs(values, cfg):
    if cfg.nn_features_per_match == 2:
        return scale_minutes_days(values, cfg.history_length, cfg.max_minutes, cfg.padding_value,
                                  cfg.nn_days_scale, cfg.nn_days_clip_max)
    result = np.array(values, dtype=np.float32, copy=True)
    result[result != cfg.padding_value] /= cfg.max_minutes
    return result


def create_xgb_history(values, kickoff_times, reference_date, cfg):
    """Match the experiment: oldest-to-newest [minutes, days ago], left padded.

    Strictly earlier timestamps prevent target/future leakage in holdout rows.
    Future forecasts use as_of, never invented future match observations.
    """
    dates = pd.DatetimeIndex(pd.to_datetime(kickoff_times, utc=True))
    reference = pd.to_datetime(reference_date, utc=True)
    observed = np.flatnonzero(dates < reference)[-cfg.xgb_history_length:]
    result = np.full((cfg.xgb_history_length, 2), cfg.padding_value, dtype=np.float32)
    if len(observed):
        result[-len(observed):, 0] = np.asarray(values)[observed]
        result[-len(observed):, 1] = np.maximum(0, (reference - dates[observed]).total_seconds() / 86400)
    return result


def scale_xgb_inputs(histories, cfg):
    return scale_minutes_days(histories, cfg.xgb_history_length, cfg.max_minutes, cfg.padding_value,
                              cfg.xgb_days_scale, cfg.xgb_days_clip_max)


def scale_minutes_days(histories, history_length, max_minutes, padding_value, days_scale, days_clip_max):
    values = np.array(histories, dtype=np.float32, copy=True)
    if values.ndim != 3 or values.shape[1:] != (history_length, 2):
        raise ValueError(f"Minutes-and-days histories must have shape (rows, {history_length}, 2)")
    minutes, days = values[:, :, 0], values[:, :, 1]
    minutes[minutes != padding_value] /= max_minutes
    observed_days = days != padding_value
    days[observed_days] /= days_scale
    if days_clip_max is not None:
        days[observed_days] = np.clip(days[observed_days], 0, days_clip_max)
    return values.reshape(len(values), history_length * 2)


def xgb_histories_for_rows(history, targets, cfg, reference_date=None):
    groups = {key: group.sort_values("kickoff_time") for key, group in history.groupby("_player", sort=False)}
    histories = []
    for row in targets.to_dict("records"):
        player = groups.get(row["_player"], history.iloc[:0])
        histories.append(create_xgb_history(player["minutes"].to_numpy(), player["kickoff_time"],
            reference_date if reference_date is not None else row["kickoff_time"], cfg))
    return np.asarray(histories, dtype=np.float32).reshape(-1, cfg.xgb_history_length, 2)


def load_xgb_models(cfg):
    # Do not silently switch to a different blend when either artifact is absent.
    if cfg.neural_weight == 1:
        return None
    from xgboost import XGBClassifier, XGBRegressor

    models = []
    for model_type, filename in ((XGBClassifier, cfg.xgb_play_model_path), (XGBRegressor, cfg.xgb_minutes_model_path)):
        path = cfg.path(filename)
        if not path.is_file():
            raise FileNotFoundError(f"Missing XGBoost model: {path}. Run the XGBoost experiment or set its model path in Config.")
        model = model_type()
        model.load_model(path)
        if model.n_features_in_ != cfg.xgb_history_length * 2:
            raise ValueError(f"{path.name} expects {model.n_features_in_} features, but configured XGBoost history produces {cfg.xgb_history_length * 2}")
        models.append(model)
    return tuple(models)


def build_datasets(history, cfg):
    rows = {key: [] for key in ("train", "validation", "test")}
    for _, player in history.groupby("_player", sort=False):
        values = player["minutes"].to_numpy(dtype=float)
        dates = player["kickoff_time"].to_numpy() if cfg.nn_features_per_match == 2 else None
        n = len(values)
        if n < cfg.min_observations:
            continue
        totals = np.cumsum(values)
        for i in range(1, n):
            if totals[i - 1] < cfg.min_historical_minutes:
                continue
            split = "test" if i == n - 1 else "validation" if i == n - 2 else "train"
            rows[split].append((create_history(values, i, cfg, dates, dates[i] if dates is not None else None), values[i], player.iloc[i]))
    datasets = {}
    for split, records in rows.items():
        shape = (-1, cfg.history_length, 2) if cfg.nn_features_per_match == 2 else (-1, cfg.history_length)
        x = np.asarray([r[0] for r in records], dtype=np.float32).reshape(shape)
        y = np.asarray([r[1] for r in records], dtype=np.float32)
        metadata = pd.DataFrame([r[2] for r in records]).reset_index(drop=True)
        datasets[split] = (x, y, metadata)
    return datasets


def train_models(datasets, cfg):
    # Keep TensorFlow initialization local to training.
    import tensorflow as tf

    np.random.seed(cfg.seed)
    tf.keras.utils.set_random_seed(cfg.seed)
    x, y, _ = datasets["train"]
    vx, vy, _ = datasets["validation"]
    if not len(y) or not len(vy) or not (y > 0).any() or not (vy > 0).any():
        raise ValueError("Need training/validation rows and positive targets; check history and minimum minutes")
    print(f"Training rows: {len(y)}; validation: {len(vy)}; test: {len(datasets['test'][1])}", flush=True)

    def fit(conditional):
        units = cfg.minutes_units if conditional else cfg.play_units
        if not units or any(int(u) <= 0 for u in units):
            raise ValueError("Model units must be positive")
        inputs = tf.keras.Input(shape=(cfg.history_length * cfg.nn_features_per_match,))
        hidden = inputs
        for i, width in enumerate(units):
            hidden = tf.keras.layers.Dense(width, activation=cfg.hidden_activation)(hidden)
            if i == 0:
                hidden = tf.keras.layers.Dropout(cfg.minutes_dropout if conditional else cfg.play_dropout)(hidden)
        output = tf.keras.layers.Dense(1, activation=cfg.minutes_output_activation if conditional else "sigmoid")(hidden)
        model = tf.keras.Model(inputs, output)
        minutes_loss = tf.keras.losses.Huber(delta=cfg.minutes_huber_delta) if cfg.minutes_loss == "huber" else cfg.minutes_loss
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=cfg.learning_rate),
                      loss=minutes_loss if conditional else "binary_crossentropy",
                      metrics=["mae"] if conditional else [tf.keras.metrics.AUC(name="auc"), "accuracy"])
        mask = y > 0 if conditional else np.ones(len(y), dtype=bool)
        vmask = vy > 0 if conditional else np.ones(len(vy), dtype=bool)
        targets = y[mask] / cfg.max_minutes if conditional else (y > 0).astype(np.float32)
        vtargets = vy[vmask] / cfg.max_minutes if conditional else (vy > 0).astype(np.float32)
        callbacks = [
            tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=cfg.early_stopping_patience,
                                            min_delta=cfg.early_stopping_min_delta, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=cfg.lr_factor,
                                               patience=cfg.lr_patience, min_lr=cfg.min_learning_rate),
        ]
        label = "Conditional minutes" if conditional else "Play probability"
        print(f"Training {label}...", flush=True)
        fitted = model.fit(scale_inputs(x[mask], cfg), targets,
                           validation_data=(scale_inputs(vx[vmask], cfg), vtargets),
                           epochs=cfg.minutes_epochs if conditional else cfg.play_epochs,
                           batch_size=cfg.batch_size, shuffle=cfg.shuffle,
                           class_weight=None if conditional else {0: cfg.play_negative_weight, 1: cfg.play_positive_weight},
                           callbacks=callbacks, verbose=cfg.training_verbose)
        print(f"{label}: {len(fitted.history['loss'])} epochs", flush=True)
        return model

    play_model, minutes_model = fit(False), fit(True)
    return play_model, minutes_model


def predict(models, histories, cfg):
    x = scale_inputs(histories, cfg)
    p = np.clip(models[0].predict(x, batch_size=cfg.batch_size, verbose=0).ravel(), 0, 1)
    m = np.clip(models[1].predict(x, batch_size=cfg.batch_size, verbose=0).ravel() * cfg.max_minutes, 0, cfg.max_minutes)
    if not np.isfinite(p).all() or not np.isfinite(m).all():
        raise ValueError("Model produced non-finite predictions")
    return p, m


def predict_combined(models, xgb_models, histories, xgb_histories, cfg):
    nn_p, nn_m = predict(models, histories, cfg)
    components = {"nn_prob_play_over_0": nn_p * 100, "nn_minutes_if_playing": nn_m}
    if cfg.neural_weight == 1:
        return nn_p, nn_m, components
    if xgb_models is None or xgb_histories is None:
        raise ValueError("Both XGBoost models and their histories are required for the configured blend")
    x = scale_xgb_inputs(xgb_histories, cfg)
    xgb_p = np.asarray(xgb_models[0].predict_proba(x))[:, 1]
    # Unlike the NN target, the experiment regressor target is raw minutes.
    xgb_m = np.asarray(xgb_models[1].predict(x)).reshape(-1)
    if xgb_p.shape != nn_p.shape or xgb_m.shape != nn_m.shape:
        raise ValueError("NN and XGBoost predictions must describe the same rows")
    if not np.isfinite(xgb_p).all() or not np.isfinite(xgb_m).all():
        raise ValueError("XGBoost produced non-finite predictions")
    xgb_p = np.clip(xgb_p, 0, 1)
    xgb_m = np.clip(xgb_m, 0, cfg.max_minutes)
    components.update(xgb_prob_play_over_0=xgb_p * 100, xgb_minutes_if_playing=xgb_m)
    weight = cfg.neural_weight
    return weight * nn_p + (1 - weight) * xgb_p, weight * nn_m + (1 - weight) * xgb_m, components


def evaluate(models, datasets, cfg, xgb_models=None, xgb_histories=None):
    from sklearn.metrics import log_loss, roc_auc_score

    x, y, meta = datasets["test"]
    if not len(y):
        warnings.warn("No eligible test rows")
        return
    p, m, components = predict_combined(models, xgb_models, x, xgb_histories, cfg)
    actual_play = (y > 0).astype(int)
    metrics = {"expected_minutes_mae": float(np.mean(np.abs(y - p * m))),
               "expected_minutes_rmse": float(np.sqrt(np.mean((y - p * m) ** 2))),
               "play_log_loss": float(log_loss(actual_play, p, labels=[0, 1]))}
    if len(np.unique(actual_play)) == 2:
        metrics["play_auc"] = float(roc_auc_score(actual_play, p))
    if (y > 0).any():
        metrics["conditional_minutes_mae"] = float(np.mean(np.abs(y[y > 0] - m[y > 0])))
    print("Holdout metrics:", json.dumps(metrics, indent=2), flush=True)
    if cfg.test_output_path:
        result = meta[["name", "team_code", "kickoff_time"]].copy()
        result["actual_minutes"], result["prob_play_over_0"] = y, p * 100
        result["minutes_if_playing"], result["expected_minutes"] = m, p * m
        for column, values in components.items():
            result[column] = values
        save_csv(result, cfg.path(cfg.test_output_path), cfg)


def neural_predictions(current, history, cfg):
    """Build the combined baseline before availability/scenario adjustments."""
    groups = dict(tuple(history.groupby("_player", sort=False)))
    histories, summaries = [], []
    nn_reference_date = as_of_time(cfg).normalize()
    for row in current.to_dict("records"):
        player = groups.get(row["_player"], history.iloc[:0])
        values = player["minutes"].to_numpy(dtype=float)
        histories.append(create_history(values, len(values), cfg, player["kickoff_time"], nn_reference_date))
        summaries.append({"last_known_date": player["kickoff_time"].max(),
                          "total_known_minutes": values.sum(), "history_matches": len(values),
                          "last5_avg_incl_zeros": float(values[-cfg.last_average_window:].mean()) if len(values) else 0.0})
    base = pd.concat([current.reset_index(drop=True), pd.DataFrame(summaries)], axis=1)
    x = np.asarray(histories, dtype=np.float32)
    datasets = build_datasets(history, cfg)
    # Validate/load saved models before spending time training neural networks.
    xgb_models = load_xgb_models(cfg)
    xgb_current = xgb_validation = xgb_test = None
    if xgb_models is not None:
        xgb_current = xgb_histories_for_rows(history, current, cfg, as_of_time(cfg))
        xgb_validation = xgb_histories_for_rows(history, datasets["validation"][2], cfg)
        xgb_test = xgb_histories_for_rows(history, datasets["test"][2], cfg)
    models = train_models(datasets, cfg)
    evaluate(models, datasets, cfg, xgb_models, xgb_test)
    p, m, components = predict_combined(models, xgb_models, x, xgb_current, cfg)
    vx, vy, _ = datasets["validation"]
    _, vm, _ = predict_combined(models, xgb_models, vx[vy > 0],
        xgb_validation[vy > 0] if xgb_validation is not None else None, cfg)
    residual_variance = float(np.mean((vy[vy > 0] - vm) ** 2))
    base["prediction_source"] = "neural_models" if cfg.neural_weight == 1 else "nn_xgboost_ensemble"
    fallback = base["history_matches"].eq(0).to_numpy()
    p[fallback], m[fallback] = cfg.no_history_prob_play, cfg.no_history_minutes
    base.loc[fallback, "prediction_source"] = "no_history_fallback"
    base["prob_play_over_0"] = p * 100
    base["minutes_if_playing"] = m
    base["expected_minutes"] = p * m
    for column, values in components.items():
        base[column] = values
    base["neural_weight"] = cfg.neural_weight
    base["xgboost_weight"] = 1 - cfg.neural_weight
    # Mixture variance: P(play)*conditional variance + P(play)*(1-P(play))*mean^2.
    # No bucket probabilities are invented for the new model. Bound conditional
    # variance for minutes supported on [0, max_minutes].
    conditional_variance = np.minimum(residual_variance, m * (cfg.max_minutes - m))
    base["prediction_uncertainty_minutes"] = np.sqrt(p * conditional_variance + p * (1 - p) * m ** 2)
    for j in range(cfg.history_length):
        base[f"minutes_t-{cfg.history_length - j}"] = x[:, j, 0] if cfg.nn_features_per_match == 2 else x[:, j]
        if cfg.nn_features_per_match == 2:
            base[f"days_t-{cfg.history_length - j}"] = x[:, j, 1]
    return base


def availability(row, horizon_index, cfg):
    if not cfg.apply_flags:
        return 1.0, "flags_disabled"
    news = str(row.get("news", "")).lower()
    status = str(row.get("status", "")).lower()
    # Suspension wins over injury news such as 'expected back'.
    if "suspended" in news or status == "s":
        return (0.0, "suspended") if horizon_index < cfg.suspension_gws else (1.0, "suspension_served")
    if any(key.lower() in news for key in cfg.zero_news_keywords):
        return 0.0, "unavailable_news"
    match = re.search(r"(\d{1,3})\s*%", news)
    chance = float(match.group(1)) if match else np.nan
    if not np.isfinite(chance):
        for column in (cfg.chance_column, cfg.chance_fallback_column):
            value = pd.to_numeric(row.get(column), errors="coerce")
            if pd.notna(value) and np.isfinite(value):
                chance = float(value)
                break
    if not np.isfinite(chance):
        if status in cfg.zero_statuses:
            return 0.0, "unavailable_status"
        chance = cfg.default_chance
    multiplier = float(np.clip(chance / 100 + horizon_index * cfg.recovery_per_gw, 0, 1))
    return multiplier, "chance" if multiplier < 1 else "available"


def load_scenarios(cfg, scenarios):
    if scenarios is not None:
        return scenarios
    if cfg.scenarios_path:
        path = cfg.path(cfg.scenarios_path)
        return pd.read_csv(path).to_dict("records") if path.suffix.lower() == ".csv" else json.loads(path.read_text(encoding="utf-8"))
    if cfg.scenarios_module:
        return getattr(importlib.import_module(cfg.scenarios_module), cfg.scenarios_attribute)
    return []


def apply_scenarios(out, scenarios, cfg):
    out["minutes_scenario"] = out["Final minutes"].copy()
    for scenario in scenarios:
        name, mode, target = scenario["name"], scenario["type"].lower(), float(scenario["value"])
        if mode not in ("const", "adjust_from", "linear_from") or not np.isfinite(target):
            raise ValueError(f"Invalid scenario: {scenario}")
        mask = out["name"].eq(name)
        if not mask.any():
            warnings.warn(f"Scenario player is not current: {name}")
            continue
        original = out.loc[mask, "minutes_scenario"].to_numpy(copy=True)
        if mode == "const":
            original[:] = target
        else:
            pivot = int(scenario["GW"])
            gws = out.loc[mask, "GW"].to_numpy(dtype=int)
            indices = np.flatnonzero(gws == pivot)
            if not len(indices):
                continue  # retain the existing pivot-in-horizon rule
            k = indices[0]
            if mode == "adjust_from":
                original[k + 1:] = target
            else:
                end = min(k + cfg.scenario_ramp_gws, len(original) - 1)
                original[k:end + 1] = np.linspace(original[k], target, end - k + 1)
                original[end + 1:] = target
        out.loc[mask, "minutes_scenario"] = np.clip(original, 0, cfg.max_minutes)
    # Manual scenarios may override reduced forecasts but never unavailability.
    out.loc[out["minutes_multiplier"].eq(0), "minutes_scenario"] = 0.0
    return out


def redistribute(out, current, history, cfg):
    for rank in (1, 2):
        out[f"comp{rank}_name_hist"] = None
        out[f"comp{rank}_hist_overlap"] = np.nan
    out["comp_minutes_added"] = 0.0
    out["minutes_scenario_adj"] = out["minutes_scenario"].copy()
    if not cfg.redistribute_complements:
        return out
    roster = current.set_index("_player")
    teams = code_keys(roster["team_code"]).to_dict()
    h = history.loc[history["_player"].isin(roster.index)].copy()
    # Candidates must still play on the same current team.
    h = h.loc[code_keys(h["team_code"]).eq(h["_player"].map(teams))]
    gaps = {}
    for _, match in h.groupby(["kickoff_time", "team_code"], sort=False):
        mins = match.set_index("_player")["minutes"].to_dict()
        for source, mi in mins.items():
            if not 0 < mi < cfg.max_minutes:
                continue
            for recipient, mj in mins.items():
                if recipient != source:
                    pair = (source, recipient)
                    total, count = gaps.get(pair, (0.0, 0))
                    gaps[pair] = (total + abs(mi + mj - cfg.max_minutes), count + 1)
    choices = {}
    for (source, recipient), (total, count) in gaps.items():
        choices.setdefault(source, []).append((total / count, recipient))
    for source, candidates in choices.items():
        for rank, (score, recipient) in enumerate(sorted(candidates)[:2], start=1):
            mask = out["_player"].eq(source)
            out.loc[mask, f"comp{rank}_name_hist"] = roster.at[recipient, "name"]
            out.loc[mask, f"comp{rank}_hist_overlap"] = score
    lookup = {(r["GW"], r["name"]): i for i, r in out.iterrows()}
    for _, row in out.sort_values(["GW", "name"]).iterrows():
        delta = max(0, (1 - row["minutes_multiplier"]) * row["last5_avg_incl_zeros"])
        for rank in cfg.complement_order:
            idx = lookup.get((row["GW"], row[f"comp{rank}_name_hist"]))
            if idx is None or out.at[idx, "minutes_multiplier"] < 1:
                continue
            headroom = cfg.max_minutes - out.at[idx, "minutes_scenario_adj"]
            addition = min(delta, max(0, headroom))
            out.at[idx, "minutes_scenario_adj"] += addition
            out.at[idx, "comp_minutes_added"] += addition
            delta -= addition
    return out


def adjust_team_minutes(out, cfg):
    minutes = out["minutes_scenario_adj"].clip(0, cfg.max_minutes)
    out["Final_minutes_Adjusted"] = minutes
    out["GW_team_Final_minutes_Adjusted_sum"] = out.groupby(["GW", "team_code"])["Final_minutes_Adjusted"].transform("sum")
    eligible = minutes.between(cfg.adjustment_min_minutes, cfg.adjustment_max_minutes) & out["minutes_multiplier"].gt(0)
    weights = (cfg.adjustment_minutes_share * np.maximum(0, cfg.adjustment_max_minutes - np.maximum(cfg.adjustment_minutes_floor, minutes)) ** cfg.adjustment_minutes_power
               + (1 - cfg.adjustment_minutes_share) * np.maximum(cfg.adjustment_uncertainty_floor, out["prediction_uncertainty_minutes"]) ** cfg.adjustment_uncertainty_power)
    out["Final_minutes_Adjusted_weight"] = np.where(eligible & cfg.apply_team_adjustment, weights, 0.0)
    totals = out.groupby(["GW", "team_code"])["Final_minutes_Adjusted_weight"].transform("sum")
    out["GW_adjustement_weight"] = out["Final_minutes_Adjusted_weight"].div(totals.where(totals > 0)).fillna(0)
    requested = ((cfg.team_minutes_target - out["GW_team_Final_minutes_Adjusted_sum"]) * out["GW_adjustement_weight"]).clip(-cfg.adjustment_cap, cfg.adjustment_cap)
    out["Final_minutes_Adjusted"] = (minutes + requested).clip(0, cfg.max_minutes)
    out.loc[out["minutes_multiplier"].eq(0), "Final_minutes_Adjusted"] = 0.0
    out["Adjustement"] = out["Final_minutes_Adjusted"] - minutes
    # The existing capped, single-pass adjustment need not hit the team target.
    out["team_minutes_after_adjustment"] = out.groupby(["GW", "team_code"])["Final_minutes_Adjusted"].transform("sum")
    return out


def save_csv(frame, path, cfg):
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.round(cfg.output_decimals).to_csv(path, index=False)


def GetXmins(current_players=None, n_future=None, scenarios=None, *,
             output_path=None, config=None, config_path=None):
    """Train NNs, blend with saved XGBoost models, adjust and save players x GWs.

    n_future is a sequence of GW numbers, as in the existing GetXmins API.
    config.n_future controls the count when gameweeks are inferred from fixtures.
    Supply either a Config object or config_path pointing to a JSON file.
    Explicit current_players, n_future and output_path override those settings.
    """
    if config is not None and config_path is not None:
        raise ValueError("Supply either config or config_path, not both")
    cfg = (Config(**json.loads(Path(config_path).read_text(encoding="utf-8-sig")))
           if config_path is not None else replace(config or Config()))
    if current_players is not None:
        cfg.current_players_path = str(current_players)
    if n_future is not None:
        cfg.gameweeks = tuple(n_future)
    if output_path is not None:
        cfg.output_path = str(output_path)
    cfg.validate()
    current, history = load_data(cfg)
    gws = gameweeks(cfg)
    scenarios = load_scenarios(cfg, scenarios)
    base = neural_predictions(current, history, cfg)
    out = base.merge(pd.DataFrame({"GW": gws, "_horizon": range(len(gws))}), how="cross")
    flags = [availability(row, row["_horizon"], cfg) for row in out.to_dict("records")]
    out["minutes_multiplier"] = [f[0] for f in flags]
    out["availability_reason"] = [f[1] for f in flags]
    out["minutes"] = out["expected_minutes"]
    out["Final minutes"] = out["expected_minutes"] * out["minutes_multiplier"]
    out["adjusted_prob_play_over_0"] = out["prob_play_over_0"] * out["minutes_multiplier"]
    out = apply_scenarios(out, scenarios, cfg)
    out = redistribute(out, current, history, cfg)
    out = adjust_team_minutes(out, cfg)
    # Keep useful audit fields, not the full raw player API payload.
    columns = ["name", "code", "GW", "team_code", "prediction_source", "last_known_date",
               "total_known_minutes", "history_matches", "prob_play_over_0", "minutes_if_playing",
               "expected_minutes", "minutes_multiplier", "availability_reason", "adjusted_prob_play_over_0",
               "minutes", "Final minutes", "last5_avg_incl_zeros", "prediction_uncertainty_minutes",
               "minutes_scenario", "comp1_name_hist", "comp1_hist_overlap", "comp2_name_hist",
               "comp2_hist_overlap", "minutes_scenario_adj", "comp_minutes_added", "Final_minutes_Adjusted",
               "GW_team_Final_minutes_Adjusted_sum", "Final_minutes_Adjusted_weight", "GW_adjustement_weight",
               "Adjustement", "team_minutes_after_adjustment"]
    columns += [f"minutes_t-{lag}" for lag in range(cfg.history_length, 0, -1)]
    if cfg.nn_features_per_match == 2:
        columns += [f"days_t-{lag}" for lag in range(cfg.history_length, 0, -1)]
    columns += [column for column in ("nn_prob_play_over_0", "nn_minutes_if_playing",
        "xgb_prob_play_over_0", "xgb_minutes_if_playing", "neural_weight", "xgboost_weight") if column in out]
    out = out[columns]
    if len(out) != len(current) * len(gws) or out.duplicated(["code", "GW"]).any():
        raise ValueError("Expected exactly one output row per current player/gameweek")
    save_csv(out, cfg.path(cfg.output_path), cfg)
    print(f"Saved {len(out)} rows: {len(current)} current players x {len(gws)} GWs to {cfg.path(cfg.output_path)}", flush=True)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", help="JSON object overriding any Config field")
    parser.add_argument("--write-config", help="Write all settings to JSON and exit")
    parser.add_argument("--gws", nargs="+", type=int, dest="gameweeks")
    for flag, dest in (("--output", "output_path"), ("--history", "history_path"),
                       ("--current-players", "current_players_path"), ("--fixtures", "fixtures_path"),
                       ("--scenarios", "scenarios_path"),
                       ("--as-of", "as_of"), ("--data-dir", "data_dir")):
        parser.add_argument(flag, dest=dest)
    parser.add_argument("--n-future", type=int)
    parser.add_argument("--play-epochs", type=int)
    parser.add_argument("--minutes-epochs", type=int)
    parser.add_argument("--no-scenarios", action="store_true")
    args = vars(parser.parse_args())
    config_path, write_path = args.pop("config"), args.pop("write_config")
    no_scenarios = args.pop("no_scenarios")
    settings = json.loads(Path(config_path).read_text(encoding="utf-8")) if config_path else {}
    settings.update({key: value for key, value in args.items() if value is not None})
    cfg = Config(**settings)
    cfg.validate()
    if write_path:
        Path(write_path).write_text(json.dumps(asdict(cfg), indent=2) + "\n", encoding="utf-8")
        return
    GetXmins(config=cfg, scenarios=[] if no_scenarios else None)


if __name__ == "__main__":
    main()
