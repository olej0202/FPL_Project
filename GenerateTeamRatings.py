"""Blend existing team ratings with the supplied recency-weighted Ridge model.

Call team_transformed3 once after team_transformed2 regenerates the old ratings.
Both CSVs retain their rows, order and other columns. Historical ratings are
pre-match; newest ratings include the team's last match. Calling this again on
already blended inputs would blend twice, so regenerate the old inputs first.
"""

from dataclasses import asdict, dataclass
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from threadpoolctl import threadpool_limits


RATING_COLUMNS = ["XG_avg", "XGH", "XGA", "XGC_avg", "XGCH", "XGCA"]
REQUIRED_COLUMNS = [
    "name", "code", "kickoff_time", "was_home", "opponent",
    "XG", "XGC", "Plain_GS", "Plain_GC",
]


@dataclass(frozen=True)
class RatingParameters:
    goals_weight: float = 0.0
    half_life_days: float = 730.0
    ridge_alpha: float = 15.0
    venue_ridge_multiplier: float = 2.0

    def validate(self):
        values = asdict(self)
        if not all(np.isfinite(v) for v in values.values()):
            raise ValueError("Rating parameters must be finite.")
        if self.goals_weight < 0 or any(
            values[k] <= 0 for k in values if k != "goals_weight"
        ):
            raise ValueError("Weights must be nonnegative; decay and penalties positive.")


def clean_history(frame):
    missing = set(REQUIRED_COLUMNS) - set(frame.columns)
    if missing:
        raise ValueError(f"Missing team history columns: {sorted(missing)}")
    out = frame[REQUIRED_COLUMNS].copy()
    out["kickoff_time"] = pd.to_datetime(out["kickoff_time"], errors="coerce", utc=True)
    numeric = ["code", "opponent", "XG", "XGC", "Plain_GS", "Plain_GC"]
    for col in numeric:
        out[col] = pd.to_numeric(out[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
    out["was_home"] = out["was_home"].astype(str).str.strip().str.lower().map({
        "true": True, "false": False, "1": True, "0": False,
        "1.0": True, "0.0": False, "yes": True, "no": False,
        "home": True, "away": False, "h": True, "a": False,
    })
    out = out.dropna(subset=REQUIRED_COLUMNS)
    for col in ["code", "opponent"]:
        if (out[col] % 1 != 0).any():
            raise ValueError(f"{col} must contain integer team codes.")
        out[col] = out[col].astype(int)
    if out.duplicated(["code", "kickoff_time"]).any():
        raise ValueError("Duplicate team/kickoff rows in the training history.")
    if out.empty:
        raise ValueError("No valid completed team observations available.")
    return out.sort_values(["kickoff_time", "code"]).reset_index(drop=True)


class TeamRatingModel:
    def __init__(self, frame):
        self.codes = sorted(set(frame["code"]) | set(frame["opponent"]))
        self.index = {code: i for i, code in enumerate(self.codes)}
        self.n = len(self.codes)

    def design(self, frame):
        team = frame["code"].map(self.index).to_numpy(dtype=int)
        opponent = frame["opponent"].map(self.index).to_numpy(dtype=int)
        home = frame["was_home"].to_numpy(dtype=bool)
        rows = np.arange(len(frame))
        x = np.zeros((len(frame), 6 * self.n))
        x[rows, team] = 1
        x[rows, self.n + opponent] = 1
        x[rows, np.where(home, 2, 3) * self.n + team] = 1
        x[rows, np.where(home, 5, 4) * self.n + opponent] = 1
        return x

    def fit(self, frame, x, parameters):
        parameters.validate()
        age = (frame["kickoff_time"].max() - frame["kickoff_time"]).dt.total_seconds() / 86400
        weights = np.maximum(np.power(0.5, age.to_numpy() / parameters.half_life_days), 0.02)
        y = frame["XG"].to_numpy(dtype=float)
        if parameters.goals_weight > 0:
            # Estimate this only from the fit window, never validation/future rows.
            goal_scale = y.mean() / max(frame["Plain_GS"].mean(), 1e-8)
            y = np.concatenate([y, frame["Plain_GS"].to_numpy() * goal_scale])
            x = np.vstack([x, x])
            weights = np.concatenate([weights, weights * parameters.goals_weight])
        scales = np.ones(6 * self.n)
        scales[2 * self.n:] = np.sqrt(parameters.venue_ridge_multiplier)
        ridge = Ridge(alpha=parameters.ridge_alpha, fit_intercept=True)
        ridge.fit(x / scales, y, sample_weight=weights)
        coef = (ridge.coef_ / scales).reshape(6, self.n)
        means = coef.mean(axis=1)
        intercept = float(ridge.intercept_ + means[0] + means[1])
        coef = coef - means[:, None]
        return intercept, coef

    def predict(self, fit, x):
        intercept, coef = fit
        return np.clip(intercept + x @ coef.ravel(), 0.05, 5.0)

    def ratings(self, fit, frame):
        intercept, (attack, defence, home_attack, away_attack, home_defence, away_defence) = fit
        ti = frame["code"].map(self.index).to_numpy(dtype=int)
        oi = frame["opponent"].map(self.index).to_numpy(dtype=int)
        residual = frame["XG"].to_numpy() - (intercept + attack[ti] + defence[oi])
        home = frame["was_home"].to_numpy(dtype=bool)
        league_home = float(residual[home].mean()) if home.any() else 0.0
        league_away = float(residual[~home].mean()) if (~home).any() else 0.0
        xg, xgc = intercept + attack, intercept + defence
        return pd.DataFrame({
            "XG_avg": xg,
            "XGH": xg + league_home + home_attack,
            "XGA": xg + league_away + away_attack,
            "XGC_avg": xgc,
            "XGCH": xgc + league_away + home_defence,
            "XGCA": xgc + league_home + away_defence,
        }, index=pd.Index(self.codes, name="code"))


def _metrics(actual, predicted):
    residual = np.asarray(actual) - predicted
    return {"mae": float(np.abs(residual).mean()),
            "rmse": float(np.sqrt(np.square(residual).mean()))}


def select_parameters(frame, model, x):
    """The attachment's 144 configurations, 70/15/15 timestamp split."""
    dates = frame["kickoff_time"].drop_duplicates().to_numpy()
    if len(dates) < 3:
        raise ValueError("At least three kickoff timestamps are required for tuning.")
    train_end = max(1, int(len(dates) * 0.70))
    validation_end = min(max(train_end + 1, int(len(dates) * 0.85)), len(dates) - 1)
    train_n = int((frame["kickoff_time"] <= dates[train_end - 1]).sum())
    validation_n = int((frame["kickoff_time"] <= dates[validation_end - 1]).sum())
    results = []
    for values in product([0.0, 0.1, 0.25, 0.5], [180, 365, 730], [1, 5, 15, 40], [2, 5, 10]):
        parameters = RatingParameters(*values)
        fit = model.fit(frame.iloc[:train_n], x[:train_n], parameters)
        scores = _metrics(frame["XG"].iloc[train_n:validation_n],
                          model.predict(fit, x[train_n:validation_n]))
        results.append({**asdict(parameters), **scores})
    results = pd.DataFrame(results).sort_values(["mae", "rmse"], kind="stable")
    best = results.iloc[0]
    parameters = RatingParameters(**{key: float(best[key]) for key in asdict(RatingParameters())})
    fit = model.fit(frame.iloc[:validation_n], x[:validation_n], parameters)
    test = _metrics(frame["XG"].iloc[validation_n:], model.predict(fit, x[validation_n:]))
    return parameters, {"configurations": len(results), "validation_mae": float(best.mae),
                        "validation_rmse": float(best.rmse), "test": test}


def build_rating_history(frame, parameters):
    """Use prior observations for history and post-match ratings for newest.

    Parameters are fixed for this reconstruction (selected on validation when
    omitted by the caller); it is not a nested historical hyperparameter search.
    """
    model = TeamRatingModel(frame)
    x = model.design(frame)
    report = {}
    if parameters is None:
        parameters, report = select_parameters(frame, model, x)
    parameters.validate()
    pre_rows, post_rows = [], []
    previous_ratings = None
    seen = set()
    for kickoff, group in frame.groupby("kickoff_time", sort=True):
        active = group["code"].tolist()
        if previous_ratings is not None:
            eligible = [code for code in active if code in seen]
            before = previous_ratings.loc[eligible].reset_index()
            before["kickoff_time"] = kickoff
            pre_rows.append(before)
        end = int(group.index[-1]) + 1
        seen.update(active)
        if end < max(10, model.n):
            continue
        prefix = frame.iloc[:end]
        fit = model.fit(prefix, x[:end], parameters)
        previous_ratings = model.ratings(fit, prefix)
        after = previous_ratings.loc[active].reset_index()
        after["kickoff_time"] = kickoff
        post_rows.append(after)
    columns = ["code", "kickoff_time", *RATING_COLUMNS]
    pre = pd.concat(pre_rows, ignore_index=True) if pre_rows else pd.DataFrame(columns=columns)
    post = pd.concat(post_rows, ignore_index=True) if post_rows else pd.DataFrame(columns=columns)
    return pre, post, {**report, "parameters": asdict(parameters)}


def blend_ratings(original, ratings, *, newest=False):
    """Key-based alignment preserves duplicate newest rows and original ordering."""
    required = ["code", "kickoff_time", *RATING_COLUMNS]
    missing = set(required) - set(original.columns)
    if missing:
        raise ValueError(f"Missing blend columns: {sorted(missing)}")
    out = original.copy()
    if ratings.empty:
        return out, 0
    keys = pd.DataFrame({
        "code": pd.to_numeric(original["code"], errors="coerce").to_numpy(),
        "kickoff_time": pd.to_datetime(original["kickoff_time"], errors="coerce", utc=True).to_numpy(),
        "_row": np.arange(len(original)),
    }).dropna()
    keys["code"] = keys["code"].astype(ratings["code"].dtype)
    if newest:
        # Latest post-match snapshot at/before this row, including relegated teams.
        aligned = pd.merge_asof(keys.sort_values("kickoff_time"),
                                ratings.sort_values("kickoff_time"),
                                on="kickoff_time", by="code", direction="backward")
    else:
        aligned = keys.merge(ratings, on=["code", "kickoff_time"], how="left", validate="many_to_one")
    valid = np.isfinite(aligned[RATING_COLUMNS].to_numpy(dtype=float)).all(axis=1)
    rows = aligned.loc[valid, "_row"].to_numpy(dtype=int)
    for col in RATING_COLUMNS:
        values = pd.to_numeric(out[col], errors="raise").to_numpy(dtype=float, copy=True)
        values[rows] = 0.5 * values[rows] + 0.5 * aligned.loc[valid, col].to_numpy()
        out[col] = values
    return out, len(rows)


def team_transformed3(
    history_path="Team_data_transformed2.csv",
    newest_path="Team_data_newest2.csv",
    *, parameters=None, write_outputs=True,
):
    """Read, fit and blend six ratings 50/50; overwrite the two input CSVs.

    Pass RatingParameters to skip the experiment, or leave None for the full
    144-configuration validation search. write_outputs=False is a dry run.
    Returns the historical frame, newest frame and fit/coverage report.
    """
    history_path, newest_path = Path(history_path), Path(newest_path)
    if history_path.resolve() == newest_path.resolve():
        raise ValueError("History and newest must be separate files.")
    history, newest = pd.read_csv(history_path), pd.read_csv(newest_path)
    frame = clean_history(history)
    # Small dense regressions run faster without a large BLAS thread pool.
    with threadpool_limits(limits=1, user_api="blas"):
        pre, post, report = build_rating_history(frame, parameters)
    history, history_count = blend_ratings(history, pre)
    newest, newest_count = blend_ratings(newest, post, newest=True)
    report.update(history_rows_blended=history_count, newest_rows_blended=newest_count,
                  history_rows_kept=len(history) - history_count,
                  newest_rows_kept=len(newest) - newest_count)
    if write_outputs:
        history.to_csv(history_path, index=False)
        newest.to_csv(newest_path, index=False)
    print(f"team_transformed3: {report}")
    return history, newest, report


if __name__ == "__main__":
    team_transformed3()
