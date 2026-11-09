r"""Standalone simulator implementing Generate_sim_rules.md.

Run: .\venv\Scripts\python.exe Generate_StatFullSimulator.py --n-sims 600 --seed 20261106
Inputs/outputs default to this script's directory; override with --input-dir /
--output-dir. Only the two points tables are imported from GenerateConfig.

Interpretations where the recipe needs a choice:
* Goal_scored contains NON-penalty goals; Total_goals includes penalties.
* GC deduction is floor(goals_conceded * minute_fraction_80 / 2).
* All listed players use the recipe's formulas, including zero predicted minutes;
  no additional appearance/minutes model or eligibility filter is introduced.
* Zero total scorer weight falls back to uniform among positive-minute players
  (all players if none); zero eligible assist weight means no assist.
* Missing numeric player features become zero. Missing saves become zero.
* Identical penalty rows are deduplicated; latest dated rate wins per team.
  Conflicting rates on the same latest date are rejected.
* DEFCON shares are the stated blend, without extra normalization; weighted
  categorical goal/assist/penalty draws normalize their own weights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from GenerateConfig import POINTS_RULES, POSITION_EVENT_BONUS


# FORMULAS AND PARAMETERS -- all tunable calculations are collected here.
ASSIST_PROBABILITY = 0.8
PENALTY_TAKER_PROBABILITY = 0.8
DEFCON_DF, DEFCON_LOCATION, DEFCON_SCALE = 5.44524, -0.02299, 2.33875
OUTPUTS = (
    "Stat_simulator_Teams2.csv", "Stat_simulator_Teams_Avg2.csv",
    "Stat_simulator_Players2.csv", "Stat_simulator_Players_Avg2.csv",
)
PLAYER_FEATURES = (
    "average_minutes", "Goal_Weight_Share", "Opp_Goal_Threat_Pos",
    "Assist_Weight_Share", "Opp_Assist_Threat_Pos", "Defcon_Weight_Share",
    "Share_of_Defcon", "Share_of_Defcon_Short", "Rolling_adjusted_BPS_2",
    "Rolling_adjusted_BPS", "Pen_Number", "Rolling_cards", "Defcon_Index",
)


def player_formulas(g: pd.DataFrame, team_defcon: float) -> dict:
    """Deterministic weights, minutes probabilities and means from Calculations."""
    a = {c: g[c].to_numpy(float) for c in PLAYER_FEATURES}
    minutes = a["average_minutes"].clip(0, 90)
    f80 = np.minimum(80, minutes) / 80
    nonnegative = lambda x: np.maximum(0, x)
    defcon_share = (
        0.7 * nonnegative(a["Defcon_Weight_Share"])
        + 0.3 * (0.7 * nonnegative(a["Share_of_Defcon"])
                 + 0.3 * nonnegative(a["Share_of_Defcon_Short"]))
    )
    return {
        "minutes": minutes, "f80": f80,
        "pen_w": nonnegative(a["Pen_Number"]) * f80,
        "goal_w": 0.8 * nonnegative(a["Goal_Weight_Share"])
                  + 0.2 * nonnegative(a["Opp_Goal_Threat_Pos"]) * f80,
        "assist_w": 0.8 * nonnegative(a["Assist_Weight_Share"])
                    + 0.2 * nonnegative(a["Opp_Assist_Threat_Pos"]) * f80,
        "defcon_mean": 0.6 * defcon_share * team_defcon
                       + 0.4 * a["Defcon_Index"],
        "ground_bps": (0.7 * a["Rolling_adjusted_BPS_2"]
                       + 0.3 * a["Rolling_adjusted_BPS"]) * f80,
        "card_probability": (a["Rolling_cards"] * f80).clip(0, 1),
        "L60": 1 / (1 + np.exp(-(-3.045855 + 0.056203 * minutes))),
        "L0": 1 / (1 + np.exp(-(-1.855427 + 0.056741 * minutes))),
    }


def event_and_fantasy(g, f, goals, penalties, assists, cs, conceded,
                      defcon, cards, saves, save_points, ground):
    """Event BPS and fantasy points before cross-team bonus allocation."""
    positions = g["position"].to_numpy()
    rates = lambda table, key: np.array([table[p][key] for p in positions])
    defending = np.isin(positions, ["DEF", "GKP"])
    hit = ((positions == "DEF") & (defcon >= 10)) | (
        np.isin(positions, ["MID", "FWD"]) & (defcon >= 12))
    event = (
        goals * rates(POSITION_EVENT_BONUS, "goal")
        + assists * rates(POSITION_EVENT_BONUS, "assist")
        + cs * rates(POSITION_EVENT_BONUS, "cs") * f["L60"]
        - 3 * cards + 12 * penalties + 2.3 * saves
        + 3 * f["L60"] + 3 * f["L0"]
        - 4 * conceded * f["f80"] * defending
    )
    gc_penalty = np.floor(conceded * f["f80"] / 2) * defending
    fantasy = (
        (goals + penalties) * rates(POINTS_RULES, "goal")
        + assists * rates(POINTS_RULES, "assist")
        + cs * rates(POINTS_RULES, "cs") * f["L60"]
        + f["L60"] + f["L0"] - cards + 2 * hit - gc_penalty + save_points
    )
    return event, ground + event, fantasy, hit, gc_penalty


def allocate_bonus(bps: np.ndarray) -> np.ndarray:
    """Apply the recipe's integer-BPS tie rules across both teams, row by row."""
    values = np.trunc(np.nan_to_num(bps, nan=0.0)).astype(np.int64)
    result = np.zeros(values.shape, dtype=np.int8)
    for row, out in zip(values, result):
        levels = np.unique(row)[::-1]
        first = row == levels[0]
        out[first] = 3
        if first.sum() >= 3 or len(levels) == 1:
            continue
        second = row == levels[1]
        out[second] = 2
        if first.sum() == 2 or second.sum() >= 2 or len(levels) == 2:
            continue
        out[row == levels[2]] = 1
    return result


def require_columns(df, columns, source):
    missing = sorted(set(columns) - set(df.columns))
    if missing:
        raise ValueError(f"{source}: missing columns {missing}")


def unique_keys(df, keys, source):
    if df[keys].isna().any().any() or df.duplicated(keys).any():
        raise ValueError(f"{source}: missing or duplicate keys {keys}")


def finite_column(df, column, source, minimum=None, maximum=None):
    df[column] = pd.to_numeric(df[column], errors="coerce")
    a = df[column].to_numpy(float)
    if not np.isfinite(a).all() or (minimum is not None and (a < minimum).any()) \
            or (maximum is not None and (a > maximum).any()):
        raise ValueError(f"{source}: invalid values in {column}")


def load_inputs(input_dir: Path):
    teams = pd.read_csv(input_dir / "Team_prediction.csv")
    require_columns(teams, ["fixture_code", "GW", "team_name", "team_code", "XG"], "teams")
    teams = teams.rename(columns={"fixture_code": "fix_id"})
    for c in ["fix_id", "GW", "team_code", "XG"]:
        finite_column(teams, c, "teams", minimum=0)
    unique_keys(teams, ["fix_id", "team_code"], "teams")
    if not teams.groupby("fix_id").size().eq(2).all():
        raise ValueError("Every fixture must contain exactly two different teams")
    if not teams.groupby("fix_id")["GW"].nunique().eq(1).all():
        raise ValueError("Teams disagree on fixture GW")

    for filename, value, optional in [
        ("Defcon_preds.csv", "defcon_prediction", False),
        ("Saves_preds.csv", "saves_prediction", True),
    ]:
        predictions = pd.read_csv(input_dir / filename)
        require_columns(predictions, ["fix_id", "team_code", value], filename)
        predictions = predictions[predictions.fix_id.isin(teams.fix_id)].copy()
        unique_keys(predictions, ["fix_id", "team_code"], filename)
        predictions[value] = pd.to_numeric(predictions[value], errors="coerce")
        teams = teams.merge(predictions[["fix_id", "team_code", value]],
                            on=["fix_id", "team_code"], how="left", validate="one_to_one")
        if optional:
            teams[value] = teams[value].fillna(0).clip(lower=0)
        finite_column(teams, value, filename, minimum=0)

    penalties = pd.read_csv(input_dir / "Team_Penalties.csv").drop_duplicates()
    require_columns(penalties, ["date", "code", "Penalty"], "penalties")
    penalties["date"] = pd.to_datetime(penalties["date"], errors="raise")
    latest = penalties.groupby("code")["date"].transform("max")
    penalties = penalties.loc[penalties.date.eq(latest), ["code", "Penalty"]].drop_duplicates()
    unique_keys(penalties, ["code"], "latest penalties")
    teams = teams.merge(penalties.rename(columns={"code": "team_code"}),
                        on="team_code", how="left", validate="many_to_one")
    finite_column(teams, "Penalty", "penalties", minimum=0, maximum=1)

    path = input_dir / "Player_prediction_set.csv"
    header = pd.read_csv(path, nrows=0)
    team_column = "team_code" if "team_code" in header else "Team"
    columns = ["fix_id", "GW", "name", "position", team_column, *PLAYER_FEATURES]
    require_columns(header, columns, "players")
    players = pd.read_csv(path, usecols=columns).rename(columns={team_column: "team_code"})
    players = players.loc[players.fix_id.isin(teams.fix_id)].copy()
    players["position"] = players.position.str.strip().str.upper().replace({"GK": "GKP"})
    if not players.position.isin(POINTS_RULES).all():
        raise ValueError("Unknown player position")
    unique_keys(players, ["fix_id", "team_code", "name"], "players")
    for c in ["fix_id", "GW", "team_code"]:
        finite_column(players, c, "players", minimum=0)
    for c in PLAYER_FEATURES:
        players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0)
        finite_column(players, c, "players")
    if not players.average_minutes.between(0, 90).all():
        raise ValueError("Player average_minutes must be between 0 and 90")
    coverage = teams[["fix_id", "team_code", "GW"]].merge(
        players[["fix_id", "team_code", "GW"]].drop_duplicates(),
        on=["fix_id", "team_code", "GW"], how="outer", indicator=True)
    if not coverage._merge.eq("both").all():
        raise ValueError("Missing team/player coverage or mismatched GW")
    return teams, players


def simulate_teams(teams, n_sims, rng):
    """One wide row per fixture/simulation; A is home when Home is available."""
    fixtures, rows = [], []
    for fix_id, pair in teams.groupby("fix_id", sort=True):
        pair = pair.copy()
        if "Home" in pair and set(pair.Home.astype(str).str.upper()) == {"H", "A"}:
            pair = pair.assign(_order=pair.Home.astype(str).str.upper().map({"H": 0, "A": 1}))
            pair = pair.sort_values("_order")
        else:
            pair = pair.sort_values("team_code")
        a, b = pair.iloc[0], pair.iloc[1]
        row = {"fix_id": np.full(n_sims, int(fix_id)),
               "GW": np.full(n_sims, int(a.GW)), "simulering": np.arange(1, n_sims + 1)}
        for label, team in [("A", a), ("B", b)]:
            goals = rng.poisson(float(team.XG), n_sims)
            row.update({
                f"Team_{label}_code": np.full(n_sims, int(team.team_code)),
                f"Team_{label}_name": np.full(n_sims, team.team_name),
                f"{label}_pred_goals": np.full(n_sims, float(team.XG)),
                f"{label}_pred_saves": np.full(n_sims, float(team.saves_prediction)),
                f"{label}_pred_defcon": np.full(n_sims, float(team.defcon_prediction)),
                f"{label}_pred_penalty": np.full(n_sims, float(team.Penalty)),
                f"{label}_goals": goals,
                f"{label}_saves": rng.poisson(float(team.saves_prediction), n_sims),
                f"{label}_defcon": np.full(n_sims, float(team.defcon_prediction)),
                f"{label}_penalty_goals": ((goals > 0) & (rng.random(n_sims) < team.Penalty)).astype(int),
            })
        row["A_clean_sheet"] = (row["B_goals"] == 0).astype(int)
        row["B_clean_sheet"] = (row["A_goals"] == 0).astype(int)
        draws = pd.DataFrame(row)
        fixtures.append((a, b, draws))
        rows.append(draws)
    return fixtures, pd.concat(rows, ignore_index=True)


def probabilities(weights):
    total = weights.sum()
    return weights / total if total > 0 else None


def distribute_goals(goals, penalties, f, rng, diagnostics):
    """Allocate every goal once; assists use weights conditional on the scorer."""
    n, p = len(goals), len(f["minutes"])
    open_goals, penalty_goals, assists = [np.zeros((n, p), dtype=np.int16) for _ in range(3)]
    goal_p = probabilities(f["goal_w"])
    if goal_p is None:
        eligible = (f["minutes"] > 0).astype(float)
        goal_p = probabilities(eligible if eligible.any() else np.ones(p))
        diagnostics["uniform_scorer_fallback_team_fixtures"] += 1
    pen_p = probabilities(f["pen_w"])
    assist_p = []
    for scorer in range(p):
        w = f["assist_w"].copy()
        w[scorer] = 0
        assist_p.append(probabilities(w))
    for sim, count in enumerate(goals):
        for goal in range(int(count)):
            is_penalty = goal == 0 and penalties[sim] == 1
            weights = goal_p
            if is_penalty and rng.random() < PENALTY_TAKER_PROBABILITY and pen_p is not None:
                weights = pen_p
            scorer = rng.choice(p, p=weights)
            (penalty_goals if is_penalty else open_goals)[sim, scorer] += 1
            if rng.random() < ASSIST_PROBABILITY:
                if assist_p[scorer] is not None:
                    assists[sim, rng.choice(p, p=assist_p[scorer])] += 1
                else:
                    diagnostics["assists_skipped_zero_weight"] += 1
    if not np.array_equal((open_goals + penalty_goals).sum(axis=1), goals):
        raise AssertionError("Allocated player goals do not equal team goals")
    if not np.array_equal(penalty_goals.sum(axis=1), penalties):
        raise AssertionError("Allocated penalties do not equal team penalties")
    return open_goals, penalty_goals, assists


def simulate_players(g, team, opponent, draws, label, rng, diagnostics):
    n, p = len(draws), len(g)
    other = "B" if label == "A" else "A"
    f = player_formulas(g, float(team.defcon_prediction))
    goals, penalties, assists = distribute_goals(
        draws[f"{label}_goals"].to_numpy(), draws[f"{label}_penalty_goals"].to_numpy(),
        f, rng, diagnostics)
    repeat = lambda x: np.broadcast_to(np.asarray(x)[:, None], (n, p))
    conceded = repeat(draws[f"{other}_goals"])
    cs = repeat(draws[f"{label}_clean_sheet"])
    defcon = np.maximum(0, np.floor(f["defcon_mean"] + DEFCON_LOCATION
        + DEFCON_SCALE * rng.standard_t(DEFCON_DF, (n, p)) + 0.5)).astype(np.int32)
    cards = (rng.random((n, p)) < f["card_probability"]).astype(np.int8)
    ground = f["ground_bps"] + rng.uniform(-1.5, 1.5, (n, p))
    keeper_fraction = (g.position.to_numpy() == "GKP") * (f["minutes"] / 90).clip(0, 1)
    saves = repeat(draws[f"{label}_saves"]) * keeper_fraction
    save_points = repeat(np.floor(draws[f"{label}_saves"].to_numpy() / 3)) * keeper_fraction
    event, bps, fantasy, hit, gc_penalty = event_and_fantasy(
        g, f, goals, penalties, assists, cs, conceded, defcon, cards, saves, save_points, ground)
    values = {
        "Goal_scored": goals, "Penalty Scored": penalties, "Total_goals": goals + penalties,
        "Assist": assists, "Clean Sheet": cs, "Goals conceeded": conceded,
        "Defcon": defcon, "Card": cards, "Ground BPS": ground, "Event Bonus": event,
        "BPS": bps, "Fantasy_poeng": fantasy, "saves": saves, "save_points": save_points,
        "defcon hit": hit.astype(int), "Defcon_GE10": (defcon >= 10).astype(int),
        "Defcon_GE12": (defcon >= 12).astype(int), "GC_penalty": gc_penalty,
        "likelihood_of_60": np.broadcast_to(f["L60"], (n, p)),
        "likelihood_of_0": np.broadcast_to(f["L0"], (n, p)),
    }
    return values


def player_frame(g, values, fix_id, gw, n_sims):
    p = len(g)
    frame = pd.DataFrame({
        "name": np.tile(g.name.to_numpy(), n_sims),
        "team_code": np.tile(g.team_code.to_numpy(), n_sims),
        "simulering": np.repeat(np.arange(1, n_sims + 1), p),
        "fix_id": int(fix_id), "GW": int(gw),
        "position": np.tile(g.position.to_numpy(), n_sims),
        "average_minutes": np.tile(g.average_minutes.to_numpy(), n_sims),
    })
    for column, array in values.items():
        frame[column] = array.ravel()
    keys = ["name", "team_code", "fix_id", "GW", "position", "average_minutes"]
    metrics = list(values)
    summary = frame.groupby(keys, as_index=False, dropna=False)[metrics].mean()
    std = frame.groupby(keys, as_index=False, dropna=False).agg(
        STD_Fantasy_points=("Fantasy_poeng", "std"), n_simulations=("Fantasy_poeng", "size"))
    return frame, summary.merge(std, on=keys, validate="one_to_one")


def run(input_dir: Path, output_dir: Path, n_sims: int = 600, seed: int = 20261106):
    if n_sims < 2:
        raise ValueError("n_sims must be >= 2 so sample standard deviation is defined")
    teams, players = load_inputs(input_dir)
    print(f"Validated {teams.fix_id.nunique()} fixtures; {len(players)} player/fixture rows; "
          f"{n_sims} simulations; seed={seed}.", flush=True)
    rng = np.random.default_rng(seed)
    fixtures, team_draws = simulate_teams(teams, n_sims, rng)
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = [output_dir / filename for filename in OUTPUTS if (output_dir / filename).exists()]
    if existing:
        backup = output_dir / "diagnostics" / "stat_full_simulator" / datetime.now().strftime("backup-%Y%m%d-%H%M%S-%f")
        backup.mkdir(parents=True)
        for path in existing:
            shutil.copy2(path, backup / path.name)
        print(f"Previous outputs backed up to {backup}", flush=True)
    team_draws.to_csv(output_dir / OUTPUTS[0], index=False)
    team_keys = ["fix_id", "GW", "Team_A_code", "Team_A_name", "Team_B_code", "Team_B_name"]
    team_avg = team_draws.drop(columns="simulering").groupby(team_keys, as_index=False).mean()
    team_avg["n_simulations"] = n_sims
    team_avg.to_csv(output_dir / OUTPUTS[1], index=False)
    groups = {key: g.reset_index(drop=True) for key, g in players.groupby(["fix_id", "team_code"])}
    diagnostics = {"uniform_scorer_fallback_team_fixtures": 0, "assists_skipped_zero_weight": 0}
    summaries, player_rows = [], 0
    for index, (a, b, draws) in enumerate(fixtures):
        ga, gb = groups[(a.fix_id, a.team_code)], groups[(b.fix_id, b.team_code)]
        va = simulate_players(ga, a, b, draws, "A", rng, diagnostics)
        vb = simulate_players(gb, b, a, draws, "B", rng, diagnostics)
        bonus = allocate_bonus(np.concatenate([va["BPS"], vb["BPS"]], axis=1))
        for g, values, allocated in [(ga, va, bonus[:, :len(ga)]), (gb, vb, bonus[:, len(ga):])]:
            values["Bonus"] = allocated
            values["Fantasy_poeng"] += allocated
            frame, avg = player_frame(g, values, a.fix_id, a.GW, n_sims)
            numeric = frame.select_dtypes(include="number").to_numpy()
            if not np.isfinite(numeric).all():
                raise AssertionError("Non-finite simulated player values")
            frame.to_csv(output_dir / OUTPUTS[2], index=False,
                         mode="w" if player_rows == 0 else "a", header=player_rows == 0)
            player_rows += len(frame)
            summaries.append(avg)
        if (index + 1) % 10 == 0 or index + 1 == len(fixtures):
            print(f"Fixtures {index + 1}/{len(fixtures)}; player rows written: {player_rows:,}", flush=True)
    player_avg = pd.concat(summaries, ignore_index=True).sort_values(["fix_id", "team_code", "name"])
    player_avg.to_csv(output_dir / OUTPUTS[3], index=False)
    recipe = Path(__file__).with_name("Generate_sim_rules.md")
    report = {
        "n_sims": n_sims, "seed": seed, "fixtures": len(fixtures),
        "team_rows": len(team_draws), "player_rows": player_rows,
        "player_average_rows": len(player_avg), "diagnostics": diagnostics,
        "recipe_sha256": hashlib.sha256(recipe.read_bytes()).hexdigest(),
        "interpretations": __doc__,
        "inputs": {name: str((input_dir / name).resolve()) for name in [
            "Team_prediction.csv", "Defcon_preds.csv", "Saves_preds.csv",
            "Team_Penalties.csv", "Player_prediction_set.csv"]},
        "outputs": {name: {"path": str((output_dir / name).resolve()),
                           "bytes": (output_dir / name).stat().st_size} for name in OUTPUTS},
        "validation": "All player goals and penalty goals reconcile with team draws; all numeric results finite.",
    }
    report_path = output_dir / "diagnostics" / "stat_full_simulator" / "run_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n-sims", type=int, default=600)
    parser.add_argument("--seed", type=int, default=20261106)
    parser.add_argument("--input-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    run(args.input_dir, args.output_dir, args.n_sims, args.seed)


if __name__ == "__main__":
    main()
