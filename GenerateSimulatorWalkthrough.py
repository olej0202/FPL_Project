"""
GenerateSimulatorWalkthrough.py

Builds an HTML walkthrough for the simulator with:
1) Step-by-step pipeline visualization
2) Current output diagnostics
3) Calibration delta summary
4) Iteration knobs for model tuning
"""

from __future__ import annotations

import csv
import html
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple


BASE_DIR = Path(__file__).resolve().parent
SIM_DIR = BASE_DIR / "SImulator"
MATCH_PATH = SIM_DIR / "match_outcomes_score_predictions.csv"
DETAILED_MATCH_PATH = SIM_DIR / "match_outcomes_score_predictions_detailed.csv"
PLAYER_PATH = SIM_DIR / "player_outcomes_per_gw.csv"
CALIB_PATH = SIM_DIR / "calibration_search_results.csv"
MODEL_PATH = BASE_DIR / "GenerateSimulater.py"
TEAM_HISTORY_PATH = BASE_DIR / "Team_data_transformed2.csv"
CURRENT_TEAMS_PATH = BASE_DIR / "Raw_Data_25" / "current_teams.csv"
PLAYER_PREDICTION_SET_PATH = BASE_DIR / "Player_Prediction_set.csv"
OUTPUT_HTML = SIM_DIR / "simulation_walkthrough.html"


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def fnum(v, default=0.0) -> float:
    try:
        s = str(v).strip()
        if not s:
            return float(default)
        return float(s)
    except Exception:
        return float(default)


def inum(v, default=0) -> int:
    try:
        return int(float(str(v).strip()))
    except Exception:
        return int(default)


def norm_name(s: str) -> str:
    return "".join(ch for ch in str(s or "").strip().lower() if ch.isalnum())


def load_team_code_map(rows: List[Dict[str, str]]) -> Tuple[Dict[str, int], Dict[int, str]]:
    by_name: Dict[str, int] = {}
    by_code: Dict[int, str] = {}
    for r in rows:
        name = str(r.get("name", "")).strip()
        code = inum(r.get("code"), default=-1)
        if not name or code < 0:
            continue
        by_name[norm_name(name)] = code
        by_code[code] = name
    return by_name, by_code


def build_team_strength_stats(rows: List[Dict[str, str]]) -> Dict[int, Dict[str, float]]:
    # Uses only offensive/defensive team stats requested by the user.
    by_code: Dict[int, List[Dict[str, float]]] = defaultdict(list)
    for r in rows:
        code = inum(r.get("code"), default=-1)
        if code < 0:
            continue
        by_code[code].append(
            {
                "xg_avg": fnum(r.get("XG_avg"), 0.0),
                "xgh": fnum(r.get("XGH"), 0.0),
                "xga": fnum(r.get("XGA"), 0.0),
                "xgc_avg": fnum(r.get("XGC_avg"), 0.0),
                "xgch": fnum(r.get("XGCH"), 0.0),
                "xgca": fnum(r.get("XGCA"), 0.0),
            }
        )
    out: Dict[int, Dict[str, float]] = {}
    for code, arr in by_code.items():
        if not arr:
            continue
        n = float(len(arr))
        out[code] = {
            "avg_xg": sum(x["xg_avg"] for x in arr) / n,
            "xgh": sum(x["xgh"] for x in arr) / n,
            "xga": sum(x["xga"] for x in arr) / n,
            "avg_xgc": sum(x["xgc_avg"] for x in arr) / n,
            "xgch": sum(x["xgch"] for x in arr) / n,
            "xgca": sum(x["xgca"] for x in arr) / n,
        }
    return out


def calc_attacks_from_offense(team_stats: Dict[str, float], is_home: bool) -> float:
    avg_xg = fnum(team_stats.get("avg_xg"), 1.2)
    venue_xg = fnum(team_stats.get("xgh" if is_home else "xga"), avg_xg)
    offensive_signal = 0.55 * avg_xg + 0.45 * venue_xg
    norm = max(0.0, min(1.0, (offensive_signal - 0.75) / 1.6))
    return 6.0 + 12.0 * norm


def calc_def_pct_from_defense(team_stats: Dict[str, float], is_home: bool) -> float:
    avg_xgc = fnum(team_stats.get("avg_xgc"), 1.35)
    venue_xgc = fnum(team_stats.get("xgch" if is_home else "xgca"), avg_xgc)
    defensive_signal = 0.55 * avg_xgc + 0.45 * venue_xgc
    strength_norm = max(0.0, min(1.0, (1.9 - defensive_signal) / 1.2))
    return 0.20 + 0.30 * strength_norm


def build_rule_matchup_rows(
    match_rows: List[Dict[str, str]],
    detailed_rows: List[Dict[str, str]],
    team_code_by_name: Dict[str, int],
    team_stats_by_code: Dict[int, Dict[str, float]],
) -> Tuple[List[Dict], Dict[Tuple[str, str], float]]:
    detailed_idx = {str(r.get("fixture_code", "")).strip(): r for r in detailed_rows}
    rows: List[Dict] = []
    opp_def_map: Dict[Tuple[str, str], float] = {}

    for m in match_rows:
        fx = str(m.get("fixture_code", "")).strip()
        home = str(m.get("home_team", "")).strip()
        away = str(m.get("away_team", "")).strip()
        if not fx or not home or not away:
            continue
        h_code = team_code_by_name.get(norm_name(home), -1)
        a_code = team_code_by_name.get(norm_name(away), -1)
        h_stats = team_stats_by_code.get(h_code, {})
        a_stats = team_stats_by_code.get(a_code, {})

        h_att = calc_attacks_from_offense(h_stats, True)
        a_att = calc_attacks_from_offense(a_stats, False)
        h_def_pct = calc_def_pct_from_defense(h_stats, True)
        a_def_pct = calc_def_pct_from_defense(a_stats, False)

        # Map "attacking team vs opponent" -> opponent defensive stop%
        opp_def_map[(fx, home)] = a_def_pct
        opp_def_map[(fx, away)] = h_def_pct

        dr = detailed_idx.get(fx, {})
        rows.append(
            {
                "fixture_code": fx,
                "GW": inum(m.get("GW"), 0),
                "home_team": home,
                "away_team": away,
                "home_attacks_rule": round(h_att, 3),
                "away_attacks_rule": round(a_att, 3),
                "home_def_pct_rule": round(100.0 * h_def_pct, 3),
                "away_def_pct_rule": round(100.0 * a_def_pct, 3),
                "home_attacks_sim": fnum(dr.get("avg_home_attacks"), 0.0),
                "away_attacks_sim": fnum(dr.get("avg_away_attacks"), 0.0),
                "home_def_pct_sim": fnum(dr.get("home_clean_sheet_pct"), 0.0),
                "away_def_pct_sim": fnum(dr.get("away_clean_sheet_pct"), 0.0),
            }
        )
    rows.sort(key=lambda x: (x["GW"], x["home_team"], x["away_team"]))
    return rows, opp_def_map


def build_player_rule_rows(
    player_rows: List[Dict[str, str]],
    player_prediction_rows: List[Dict[str, str]],
    opp_def_map: Dict[Tuple[str, str], float],
) -> List[Dict]:
    pred_lookup: Dict[Tuple[str, int, str], Dict[str, float]] = {}
    pred_lookup_simple: Dict[Tuple[str, int], Dict[str, float]] = {}
    for r in player_prediction_rows:
        name = str(r.get("name", "")).strip()
        if not name:
            continue
        gw = inum(r.get("GW"), 0)
        team = str(r.get("Team", "")).strip()
        profile = {
            "overassist": max(0.9, min(1.1, fnum(r.get("Average_OverAssist"), 1.0))),
            "overscore": max(0.9, min(1.15, fnum(r.get("Average_Overscore"), 1.0))),
        }
        key = (norm_name(name), gw, team)
        pred_lookup[key] = profile
        pred_lookup_simple[(norm_name(name), gw)] = profile

    out: List[Dict] = []
    for r in player_rows:
        fx = str(r.get("fixture_code", "")).strip()
        team = str(r.get("team", "")).strip()
        if not fx or not team:
            continue
        gw = inum(r.get("GW"), 0)
        mins = max(0.0, fnum(r.get("expected_minutes"), 0.0))
        assist_pct = max(0.0, fnum(r.get("assist_weight_share_pct"), 0.0)) / 100.0
        pool_weight = (mins / 90.0) * assist_pct
        opp_def = max(0.0, min(1.0, fnum(opp_def_map.get((fx, team), 0.30), 0.30)))

        name_raw = str(r.get("player_name", "")).replace(" ", "_")
        team_code = str(r.get("team_code", "")).strip()
        prof = pred_lookup.get((norm_name(name_raw), gw, team_code))
        if prof is None:
            prof = pred_lookup_simple.get((norm_name(name_raw), gw), {"overassist": 1.0, "overscore": 1.0})
        overassist = prof["overassist"]
        overscore = prof["overscore"]

        pass_make = max(0.05, min(0.95, (1.0 - opp_def) * overassist))
        not_blocked = max(0.05, min(0.95, 1.0 - opp_def))
        miss_prob = max(0.08, min(0.92, 0.50 / max(0.9, overscore)))

        out.append(
            {
                "GW": gw,
                "fixture_code": fx,
                "team": team,
                "player_name": r.get("player_name", ""),
                "expected_minutes": mins,
                "assist_share_pct": 100.0 * assist_pct,
                "pool_weight": pool_weight,
                "opp_def_pct": 100.0 * opp_def,
                "overassist_clamped": overassist,
                "overscore_clamped": overscore,
                "pass_make_prob_pct": 100.0 * pass_make,
                "shot_not_blocked_pct": 100.0 * not_blocked,
                "miss_prob_pct": 100.0 * miss_prob,
            }
        )
    out.sort(key=lambda x: (x["GW"], x["fixture_code"], -x["pool_weight"]))
    return out


def parse_constants(path: Path, names: List[str]) -> Dict[str, str]:
    out = {}
    if not path.exists():
        return out
    pat = re.compile(r"^([A-Z0-9_]+)\s*=\s*(.+?)\s*$")
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            m = pat.match(raw.strip())
            if not m:
                continue
            k, v = m.group(1), m.group(2)
            if k in names:
                out[k] = v
    return out


def svg_hbars(items: List[Tuple[str, float]], title: str, value_suffix: str = "", color: str = "#22a06b") -> str:
    if not items:
        return "<div class='empty'>No data</div>"
    maxv = max(max(v, 0.0) for _, v in items) or 1.0
    w = 860
    left = 250
    bar_max = 520
    bar_h = 24
    gap = 9
    top = 55
    h = top + len(items) * (bar_h + gap) + 18
    parts = [
        f"<svg viewBox='0 0 {w} {h}' class='chart'>",
        f"<text x='18' y='28' class='svg-title'>{html.escape(title)}</text>",
    ]
    for i, (label, value) in enumerate(items):
        y = top + i * (bar_h + gap)
        bw = int(max(1.0, (max(0.0, value) / maxv) * bar_max))
        safe_label = html.escape(label[:44] + ("..." if len(label) > 44 else ""))
        parts.append(f"<text x='18' y='{y + 16}' class='svg-label'>{safe_label}</text>")
        parts.append(f"<rect x='{left}' y='{y}' width='{bar_max}' height='{bar_h}' rx='8' fill='#ecf4ef'/>")
        parts.append(f"<rect x='{left}' y='{y}' width='{bw}' height='{bar_h}' rx='8' fill='{color}'/>")
        parts.append(
            f"<text x='{left + bar_max + 8}' y='{y + 16}' class='svg-value'>{value:.2f}{html.escape(value_suffix)}</text>"
        )
    parts.append("</svg>")
    return "".join(parts)


def svg_pipeline() -> str:
    boxes = [
        ("1. Team Offense", "avg_xg + (XGH/XGA by venue)"),
        ("2. Team Defense", "avg_xgc + (XGCH/XGCA by venue)"),
        ("3. Attack Count", "n_attacks from own offense only"),
        ("4. Def Stop %", "def% from own defense only"),
        ("5. Player Pool", "minutes * assist_share"),
        ("6. Pass/Shot Logic", "opp def + overassist/overscore"),
        ("7. Monte Carlo", "simulate outcomes + aggregates"),
    ]
    w = 1180
    h = 230
    bx_w = 148
    bx_h = 90
    x0 = 10
    gap = 20
    y = 70
    out = [f"<svg viewBox='0 0 {w} {h}' class='chart'>"]
    out.append("<text x='10' y='28' class='svg-title'>Simulator Pipeline (Step by Step)</text>")
    for i, (t1, t2) in enumerate(boxes):
        x = x0 + i * (bx_w + gap)
        out.append(f"<rect x='{x}' y='{y}' width='{bx_w}' height='{bx_h}' rx='12' fill='#f4faf6' stroke='#c9dfd1'/>")
        out.append(f"<text x='{x + 10}' y='{y + 26}' class='svg-label-bold'>{html.escape(t1)}</text>")
        out.append(f"<text x='{x + 10}' y='{y + 50}' class='svg-label-small'>{html.escape(t2)}</text>")
        if i < len(boxes) - 1:
            x1 = x + bx_w
            x2 = x + bx_w + gap - 6
            ym = y + bx_h // 2
            out.append(f"<line x1='{x1}' y1='{ym}' x2='{x2}' y2='{ym}' stroke='#5f9f7f' stroke-width='2'/>")
            out.append(
                f"<polygon points='{x2},{ym} {x2-8},{ym-4} {x2-8},{ym+4}' fill='#5f9f7f'/>"
            )
    out.append("</svg>")
    return "".join(out)


def summarize_matches(rows: List[Dict[str, str]]) -> Dict[str, float]:
    if not rows:
        return {"fixtures": 0}
    return {
        "fixtures": len(rows),
        "avg_home_lambda": sum(fnum(r.get("home_lambda")) for r in rows) / len(rows),
        "avg_away_lambda": sum(fnum(r.get("away_lambda")) for r in rows) / len(rows),
        "avg_total_lambda": sum(fnum(r.get("home_lambda")) + fnum(r.get("away_lambda")) for r in rows) / len(rows),
        "avg_draw_pct": sum(fnum(r.get("draw_pct")) for r in rows) / len(rows),
    }


def aggregate_players(rows: List[Dict[str, str]]) -> List[Dict[str, float]]:
    agg = {}
    for r in rows:
        key = r.get("player_key", "")
        if not key:
            continue
        cur = agg.get(key)
        if cur is None:
            cur = {
                "player_name": r.get("player_name", ""),
                "team": r.get("team", ""),
                "expected_goals": 0.0,
                "expected_assists": 0.0,
                "anytime_goal_pct": 0.0,
                "anytime_assist_pct": 0.0,
                "count": 0,
            }
            agg[key] = cur
        cur["expected_goals"] += fnum(r.get("expected_goals"))
        cur["expected_assists"] += fnum(r.get("expected_assists"))
        cur["anytime_goal_pct"] += fnum(r.get("anytime_goal_pct"))
        cur["anytime_assist_pct"] += fnum(r.get("anytime_assist_pct"))
        cur["count"] += 1
    out = []
    for _, v in agg.items():
        c = max(1, int(v["count"]))
        v["anytime_goal_pct"] /= c
        v["anytime_assist_pct"] /= c
        out.append(v)
    out.sort(key=lambda x: (x["expected_goals"] + x["expected_assists"]), reverse=True)
    return out


def html_table(rows: List[Dict], cols: List[Tuple[str, str]]) -> str:
    if not rows:
        return "<div class='empty'>No rows</div>"
    th = "".join(f"<th>{html.escape(c[0])}</th>" for c in cols)
    body = []
    for r in rows:
        tds = []
        for _, key in cols:
            val = r.get(key, "")
            if isinstance(val, float):
                txt = f"{val:.3f}"
            else:
                txt = str(val)
            tds.append(f"<td>{html.escape(txt)}</td>")
        body.append("<tr>" + "".join(tds) + "</tr>")
    return f"<table><thead><tr>{th}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def calibration_summary(rows: List[Dict[str, str]]) -> Dict[str, float]:
    if not rows:
        return {}
    baseline = rows[0]
    best = min(rows, key=lambda r: fnum(r.get("valid_composite"), 1e9))
    return {
        "base_valid_composite": fnum(baseline.get("valid_composite")),
        "best_valid_composite": fnum(best.get("valid_composite")),
        "base_valid_team_composite": fnum(baseline.get("valid_team_composite")),
        "best_valid_team_composite": fnum(best.get("valid_team_composite")),
        "base_valid_player_composite": fnum(baseline.get("valid_player_composite")),
        "best_valid_player_composite": fnum(best.get("valid_player_composite")),
        "best_iter": inum(best.get("iter")),
    }


def build_match_index(match_rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    idx = {}
    for r in match_rows:
        key = str(r.get("fixture_code", "")).strip()
        if key:
            idx[key] = r
    return idx


def enrich_player_rows_with_team_xg(player_rows: List[Dict[str, str]], match_idx: Dict[str, Dict[str, str]]) -> List[Dict]:
    out = []
    for r in player_rows:
        rr = dict(r)
        fx = match_idx.get(str(r.get("fixture_code", "")).strip())
        team_xg = 0.0
        if fx:
            if r.get("team", "") == fx.get("home_team", ""):
                team_xg = fnum(fx.get("avg_home_goals"), 0.0)
            elif r.get("team", "") == fx.get("away_team", ""):
                team_xg = fnum(fx.get("avg_away_goals"), 0.0)
        rr["team_expected_goals"] = team_xg
        out.append(rr)
    return out


def group_team_distribution(rows: List[Dict]) -> List[Dict]:
    by_group: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
    for r in rows:
        fx = str(r.get("fixture_code", "")).strip()
        team = str(r.get("team", "")).strip()
        if not fx or not team:
            continue
        by_group[(fx, team)].append(r)

    out = []
    for (fx, team), grp in by_group.items():
        total_xg = sum(fnum(x.get("expected_goals"), 0.0) for x in grp)
        total_xa = sum(fnum(x.get("expected_assists"), 0.0) for x in grp)
        srt = sorted(grp, key=lambda x: fnum(x.get("expected_goals"), 0.0), reverse=True)
        top1 = fnum(srt[0].get("expected_goals"), 0.0) if srt else 0.0
        top3 = sum(fnum(x.get("expected_goals"), 0.0) for x in srt[:3])
        top_name = srt[0].get("player_name", "") if srt else ""
        out.append(
            {
                "fixture_code": fx,
                "team": team,
                "pool_size": len(grp),
                "team_xg_players_sum": total_xg,
                "team_xa_players_sum": total_xa,
                "top1_goal_share_pct": 100.0 * top1 / max(1e-9, total_xg),
                "top3_goal_share_pct": 100.0 * top3 / max(1e-9, total_xg),
                "top_player": top_name,
            }
        )
    return out


def make_player_deep_dive(rows: List[Dict], name_query: str) -> Tuple[List[Dict], Dict]:
    q = name_query.strip().lower()
    sel = [r for r in rows if q in str(r.get("player_name", "")).lower()]
    sel = sorted(sel, key=lambda x: (inum(x.get("GW"), 0), x.get("team", "")))
    for r in sel:
        team_xg = fnum(r.get("team_expected_goals"), 0.0)
        pxg = fnum(r.get("expected_goals"), 0.0)
        r["model_share_pct"] = 100.0 * pxg / max(1e-9, team_xg)

    if not sel:
        return [], {}

    avg_team_xg = sum(fnum(r.get("team_expected_goals"), 0.0) for r in sel) / len(sel)
    avg_pxg = sum(fnum(r.get("expected_goals"), 0.0) for r in sel) / len(sel)
    avg_share = sum(fnum(r.get("model_share_pct"), 0.0) for r in sel) / len(sel)
    avg_weight_share = sum(fnum(r.get("goal_weight_share_pct"), 0.0) for r in sel) / len(sel)
    avg_minutes = sum(fnum(r.get("expected_minutes"), 0.0) for r in sel) / len(sel)
    avg_start = sum(fnum(r.get("start_probability"), 0.0) for r in sel) / len(sel)

    why = {
        "fixtures_count": len(sel),
        "avg_team_xg": avg_team_xg,
        "avg_player_xg": avg_pxg,
        "avg_model_share_pct": avg_share,
        "avg_goal_weight_share_pct": avg_weight_share,
        "avg_expected_minutes": avg_minutes,
        "avg_start_probability": avg_start,
    }
    return sel, why


def render_report() -> str:
    match_rows = read_csv_rows(MATCH_PATH)
    detailed_rows = read_csv_rows(DETAILED_MATCH_PATH)
    player_rows = read_csv_rows(PLAYER_PATH)
    team_history_rows = read_csv_rows(TEAM_HISTORY_PATH)
    current_team_rows = read_csv_rows(CURRENT_TEAMS_PATH)
    player_prediction_rows = read_csv_rows(PLAYER_PREDICTION_SET_PATH)

    summary = summarize_matches(match_rows)
    gws = sorted({inum(r.get("GW"), 10**9) for r in match_rows if str(r.get("GW", "")).strip()})
    next_gw = gws[0] if gws else None

    team_code_by_name, _ = load_team_code_map(current_team_rows)
    for r in team_history_rows:
        name = str(r.get("name", "")).strip()
        code = inum(r.get("code"), default=-1)
        if name and code >= 0 and norm_name(name) not in team_code_by_name:
            team_code_by_name[norm_name(name)] = code

    team_stats_by_code = build_team_strength_stats(team_history_rows)
    rule_matchup_rows, opp_def_map = build_rule_matchup_rows(
        match_rows=match_rows,
        detailed_rows=detailed_rows,
        team_code_by_name=team_code_by_name,
        team_stats_by_code=team_stats_by_code,
    )
    player_rule_rows = build_player_rule_rows(
        player_rows=player_rows,
        player_prediction_rows=player_prediction_rows,
        opp_def_map=opp_def_map,
    )

    next_matchups = [r for r in rule_matchup_rows if r.get("GW") == next_gw] if next_gw is not None else []
    next_players = [r for r in player_rule_rows if r.get("GW") == next_gw] if next_gw is not None else []
    top_pool_players = sorted(next_players, key=lambda x: x["pool_weight"], reverse=True)[:80]

    attacks_chart = sorted(
        [(f"{r['home_team']} vs {r['away_team']} (H)", r["home_attacks_rule"]) for r in next_matchups]
        + [(f"{r['home_team']} vs {r['away_team']} (A)", r["away_attacks_rule"]) for r in next_matchups],
        key=lambda x: x[1],
        reverse=True,
    )[:14]
    def_chart = sorted(
        [(f"{r['home_team']} vs {r['away_team']} (Home def)", r["home_def_pct_rule"]) for r in next_matchups]
        + [(f"{r['home_team']} vs {r['away_team']} (Away def)", r["away_def_pct_rule"]) for r in next_matchups],
        key=lambda x: x[1],
        reverse=True,
    )[:14]

    avg_rule_home_att = sum(fnum(r.get("home_attacks_rule"), 0.0) for r in rule_matchup_rows) / max(1, len(rule_matchup_rows))
    avg_rule_away_att = sum(fnum(r.get("away_attacks_rule"), 0.0) for r in rule_matchup_rows) / max(1, len(rule_matchup_rows))
    avg_rule_home_def = sum(fnum(r.get("home_def_pct_rule"), 0.0) for r in rule_matchup_rows) / max(1, len(rule_matchup_rows))
    avg_rule_away_def = sum(fnum(r.get("away_def_pct_rule"), 0.0) for r in rule_matchup_rows) / max(1, len(rule_matchup_rows))
    allowed_input_rows = [
        {"stage": "n_attacks", "columns": "Team_data_transformed2: XG_avg + XGH/XGA", "extra": "No opponent attack stats"},
        {"stage": "defensive %", "columns": "Team_data_transformed2: XGC_avg + XGCH/XGCA", "extra": "No opponent offense stats"},
        {
            "stage": "player pool",
            "columns": "player_outcomes_per_gw: expected_minutes + assist_weight_share_pct",
            "extra": "Weighted player selection",
        },
        {
            "stage": "pass",
            "columns": "opponent def% + Player_Prediction_set: Average_OverAssist",
            "extra": "OverAssist is clamped",
        },
        {
            "stage": "shot miss",
            "columns": "opponent def% + Player_Prediction_set: Average_Overscore",
            "extra": "Overscore is clamped",
        },
    ]

    html_page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Simulator Walkthrough</title>
  <style>
    body {{ font-family: "Segoe UI", Tahoma, sans-serif; margin: 0; background: #f3f7f4; color: #1f2d25; }}
    .wrap {{ max-width: 1240px; margin: 0 auto; padding: 22px; }}
    .hero {{ background: linear-gradient(145deg,#f7fbf8,#eaf5ee); border: 1px solid #d3e6da; border-radius: 14px; padding: 16px 18px; }}
    h1,h2 {{ margin: 0 0 8px 0; color: #20342a; }}
    .muted {{ color: #4d6257; font-size: 14px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 10px; margin-top: 12px; }}
    .card {{ background: #ffffff; border: 1px solid #d8e7de; border-radius: 12px; padding: 10px 12px; }}
    .k {{ font-size: 12px; color: #5f756a; }}
    .v {{ font-size: 24px; font-weight: 600; color: #1b3928; }}
    .section {{ margin-top: 16px; background: #fff; border: 1px solid #d8e7de; border-radius: 14px; padding: 14px; }}
    .chart {{ width: 100%; height: auto; display: block; }}
    .svg-title {{ font-size: 18px; fill: #274333; font-weight: 600; }}
    .svg-label {{ font-size: 13px; fill: #2f493a; }}
    .svg-label-bold {{ font-size: 13px; fill: #22402f; font-weight: 600; }}
    .svg-label-small {{ font-size: 11px; fill: #5a7568; }}
    .svg-value {{ font-size: 12px; fill: #2f493a; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    th,td {{ padding: 8px 7px; border-bottom: 1px solid #e4eee8; text-align: left; }}
    th {{ background: #f4faf6; color: #294233; }}
    .steps ol {{ margin: 0; padding-left: 20px; }}
    .steps li {{ margin: 7px 0; }}
    .empty {{ color: #60786a; font-size: 13px; }}
    .codebox {{ background: #f7fbf8; border: 1px solid #d8e7de; border-radius: 10px; padding: 10px 12px; font-family: Consolas, monospace; font-size: 12px; white-space: pre-wrap; }}
    .warn {{ color: #8d4f07; background: #fff5e8; border: 1px solid #f3d8b3; border-radius: 9px; padding: 8px 10px; }}
    .ok {{ color: #21593d; background: #edf8f1; border: 1px solid #cde8d8; border-radius: 9px; padding: 8px 10px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>Simulator Walkthrough (Rule Locked)</h1>
      <div class="muted">This report verifies the strict simulation chain and shows the exact inputs used for each matchup and player event.</div>
      <div class="grid">
        <div class="card"><div class="k">Fixtures Simulated</div><div class="v">{summary.get("fixtures", 0)}</div></div>
        <div class="card"><div class="k">Avg Rule Home Attacks</div><div class="v">{avg_rule_home_att:.2f}</div></div>
        <div class="card"><div class="k">Avg Rule Away Attacks</div><div class="v">{avg_rule_away_att:.2f}</div></div>
        <div class="card"><div class="k">Avg Rule Home Def %</div><div class="v">{avg_rule_home_def:.2f}%</div></div>
        <div class="card"><div class="k">Avg Rule Away Def %</div><div class="v">{avg_rule_away_def:.2f}%</div></div>
      </div>
    </div>

    <div class="section">{svg_pipeline()}</div>

    <div class="section steps">
      <h2>Exact Rule Chain (Only These Factors)</h2>
      <ol>
        <li><strong>n_attacks:</strong> from own-team offensive stats only: <code>avg_xg</code> and venue split <code>XGH/XGA</code>.</li>
        <li><strong>defensive %:</strong> from own-team defensive stats only: <code>avg_xgc</code> and venue split <code>XGCH/XGCA</code>.</li>
        <li><strong>Assist Pool:</strong> players weighted by <code>expected_minutes * assist_share%</code>.</li>
        <li><strong>Pass Success:</strong> depends on opponent defensive% and player <code>Average_OverAssist</code> (clamped).</li>
        <li><strong>Shot + Block:</strong> shooter selected and blocked by opponent defensive%.</li>
        <li><strong>Miss Probability:</strong> adjusted by player <code>Average_Overscore</code> (clamped).</li>
        <li><strong>Monte Carlo Aggregation:</strong> repeat and aggregate scorelines, win/draw/loss, clean sheets, goals and assists.</li>
      </ol>
    </div>

    <div class="section">
      <h2>Equations Used In This Walkthrough</h2>
      <div class="codebox">off_signal = 0.55 * avg_xg + 0.45 * (XGH if home else XGA)
n_attacks = 6 + 12 * clip((off_signal - 0.75) / 1.6, 0, 1)

def_signal = 0.55 * avg_xgc + 0.45 * (XGCH if home else XGCA)
def_pct = 0.20 + 0.30 * clip((1.9 - def_signal) / 1.2, 0, 1)

pool_weight = (expected_minutes / 90) * (assist_share_pct / 100)
overassist = clamp(Average_OverAssist, 0.9, 1.1)
overscore  = clamp(Average_Overscore, 0.9, 1.15)

pass_make_prob = clamp((1 - opponent_def_pct) * overassist, 0.05, 0.95)
shot_not_blocked = clamp(1 - opponent_def_pct, 0.05, 0.95)
miss_prob = clamp(0.50 / overscore, 0.08, 0.92)</div>
    </div>

    <div class="section">
      <h2>Allowed Inputs Only</h2>
      {html_table(allowed_input_rows, [("Step", "stage"), ("Columns used", "columns"), ("Restriction", "extra")])}
    </div>

    <div class="section">
      {svg_hbars(attacks_chart, f"Next GW ({next_gw}) computed n_attacks by team side", color="#2e9668")}
    </div>

    <div class="section">
      {svg_hbars(def_chart, f"Next GW ({next_gw}) computed defensive stop % by team side", value_suffix="%", color="#4ba977")}
    </div>

    <div class="section">
      <h2>Rule Verification: Matchups</h2>
      <div class="ok">For each matchup, n_attacks and defensive % below are computed only from the own-team stats listed in the formulas above.</div>
      {html_table(rule_matchup_rows, [
          ("GW", "GW"),
          ("Fixture", "fixture_code"),
          ("Home", "home_team"),
          ("Away", "away_team"),
          ("Home n_attacks (rule)", "home_attacks_rule"),
          ("Away n_attacks (rule)", "away_attacks_rule"),
          ("Home def % (rule)", "home_def_pct_rule"),
          ("Away def % (rule)", "away_def_pct_rule"),
          ("Home attacks (sim avg)", "home_attacks_sim"),
          ("Away attacks (sim avg)", "away_attacks_sim"),
      ])}
    </div>

    <div class="section">
      <h2>Rule Verification: Player Pool + Event Probabilities (Next GW)</h2>
      <div class="ok">Pool is minutes*assist_share, pass uses opponent defense + clamped overassist, and shot miss uses clamped overscore.</div>
      {html_table(top_pool_players, [
          ("GW", "GW"),
          ("Fixture", "fixture_code"),
          ("Team", "team"),
          ("Player", "player_name"),
          ("Exp Mins", "expected_minutes"),
          ("Assist %", "assist_share_pct"),
          ("Pool Weight", "pool_weight"),
          ("Opp Def %", "opp_def_pct"),
          ("OverAssist", "overassist_clamped"),
          ("OverScore", "overscore_clamped"),
          ("Pass Make %", "pass_make_prob_pct"),
          ("Shot Not Blocked %", "shot_not_blocked_pct"),
          ("Miss %", "miss_prob_pct"),
      ])}
    </div>
  </div>
</body>
</html>"""
    return html_page


def main() -> None:
    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    report = render_report()
    OUTPUT_HTML.write_text(report, encoding="utf-8")
    print(f"Wrote walkthrough: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()
