# understat_pipeline_locf_shares.py
# ------------------------------------------------------------
# Full script version of your pipeline with ONE consistent fix:
# Every "share" (npxG_share, xA_share, shots_share, key_passes_share,
# Rolling_XG_Share2, Rolling_XA_Share2) is computed using LOCF totals:
#   - totals are NOT "sum of rows on that date"
#   - totals ARE "sum of latest known value per position for that team"
#
# This fixes teams like Man City where some pos_group rows are missing on a date.
# ------------------------------------------------------------

import numpy as np
import pandas as pd

from GenerateConfig import NEW_TEAMS_NAME,Understat_Team_MAP
# from Generate_Fetch_Myteam import build_team_dataframe  # (not used here)
# from GenerateConfig import ... (your other imports)


# ============================================================
# Helper: LOCF shares for any value columns
# ============================================================
def canonicalize_team_name(value):
    if pd.isna(value):
        return value
    text = str(value).strip()
    if not text:
        return text
    return Understat_Team_MAP.get(text, text)


def add_locf_shares(
    df: pd.DataFrame,
    team_col: str,
    date_col: str,
    pos_col: str,
    value_cols: list[str],
    share_names: dict[str, str] | None = None,   # map value_col -> output share col name
    pos_universe: list[str] | None = None,
    exclude_pos: set[str] = {"SUB", "GK", "GKP"},
    keep_grid: bool = False,  # debug option: return the full grid too
) -> pd.DataFrame:
    """
    Compute shares using LOCF (last-observation-carried-forward) totals.

    For each team and date:
      total(value_col) = sum over pos_group of latest known value for that pos_group <= date
      share = value / total

    This avoids spikes when some pos_groups are missing on that date.
    """

    out = df.copy()

    # ensure datetime
    out[date_col] = pd.to_datetime(out[date_col], errors="coerce")
    out = out.dropna(subset=[team_col, pos_col, date_col]).copy()

    # normalize pos
    out[pos_col] = out[pos_col].astype(str).str.strip()
    pos_upper = out[pos_col].str.upper().str.strip()

    # only positions that count toward totals
    valid_mask = ~pos_upper.isin(exclude_pos)
    base = out.loc[valid_mask, [team_col, date_col, pos_col] + value_cols].copy()

    # numeric
    for c in value_cols:
        base[c] = pd.to_numeric(base[c], errors="coerce")

    # choose universe of pos_group for the grid
    if pos_universe is None:
        pos_universe = (
            base[pos_col]
            .dropna()
            .astype(str)
            .str.strip()
            .unique()
            .tolist()
        )

    teams = base[team_col].dropna().unique()
    dates = np.sort(base[date_col].dropna().unique())

    # build complete grid: team x date x pos
    grid = pd.MultiIndex.from_product(
        [teams, dates, pos_universe],
        names=[team_col, date_col, pos_col],
    ).to_frame(index=False)

    full = grid.merge(base, on=[team_col, date_col, pos_col], how="left")
    full = full.sort_values([team_col, pos_col, date_col])

    # LOCF per (team, pos)
    full[value_cols] = (
        full.groupby([team_col, pos_col])[value_cols]
            .ffill()
            .fillna(0.0)
    )

    # compute shares
    if share_names is None:
        share_names = {c: f"{c}_share" for c in value_cols}

    for c in value_cols:
        tot_col = f"__tot_{c}"
        full[tot_col] = full.groupby([team_col, date_col])[c].transform("sum")

        share_col = share_names.get(c, f"{c}_share")
        full[share_col] = (full[c] / full[tot_col]).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    share_cols = [share_names[c] for c in value_cols]

    # merge shares back to original rows (all positions, including excluded ones will get NaN -> fill 0)
    out = out.merge(
        full[[team_col, date_col, pos_col] + share_cols],
        on=[team_col, date_col, pos_col],
        how="left",
        suffixes=("", "_locf"),
    )

    for sc in share_cols:
        out[sc] = out[sc].fillna(0.0)

    if keep_grid:
        return out, full
    return out


# ============================================================
# Team threats (your existing function, unchanged)
# ============================================================
def Generate_Team_threats():
    df = pd.read_csv("Team_AggTest.csv")
    team_df = df[["opponent", "pos_group", "date", "shots_share", "npxG_share", "xA_share", "key_passes_share"]].copy()
    team_df["npxG"] = pd.to_numeric(
        df["npxG_sum"] if "npxG_sum" in df.columns else df.get("npxG", 0.0),
        errors="coerce"
    )
    team_df["xA"] = pd.to_numeric(
        df["xA_sum"] if "xA_sum" in df.columns else df.get("xA", 0.0),
        errors="coerce"
    )

    team_df["date"] = pd.to_datetime(team_df["date"], errors="coerce")
    share_metrics = ["shots_share", "npxG_share", "xA_share", "key_passes_share"]
    volume_metrics = ["npxG", "xA"]
    metrics = share_metrics + volume_metrics
    team_df[metrics] = team_df[metrics].apply(pd.to_numeric, errors="coerce")

    team_df = team_df.sort_values(["opponent", "pos_group", "date"])

    span = 20
    min_share_val = 0.05
    max_share_val = 0.9

    ewm_cols = [f"{c}_ewm" for c in metrics]

    share_ewm_cols = [f"{c}_ewm" for c in share_metrics]
    team_df[share_ewm_cols] = (
        team_df
        .groupby(["opponent", "pos_group"])[share_metrics]
        .transform(lambda s: s.clip(lower=min_share_val, upper=max_share_val).ewm(span=span, adjust=False).mean())
    )
    volume_ewm_cols = [f"{c}_ewm" for c in volume_metrics]
    team_df[volume_ewm_cols] = (
        team_df
        .groupby(["opponent", "pos_group"])[volume_metrics]
        .transform(lambda s: s.clip(lower=0.0).ewm(span=span, adjust=False).mean())
    )

    latest_ewm = (
        team_df.sort_values("date")
        .groupby(["opponent", "pos_group"], as_index=False)
        .tail(1)[["opponent", "pos_group"] + ewm_cols]
    )

    latest_ewm["Goal_Threat"] = latest_ewm["npxG_share_ewm"] * 0.8 + 0.2 * latest_ewm["shots_share_ewm"]
    latest_ewm["Assist_Threat"] = latest_ewm["xA_share_ewm"] * 0.8 + 0.2 * latest_ewm["key_passes_share_ewm"]
    latest_ewm["Threat"] = latest_ewm["Goal_Threat"] * 0.7 + 0.3 * latest_ewm["npxG_ewm"]

    pg = latest_ewm["pos_group"].str.upper().str.strip()
    latest_ewm = latest_ewm.loc[~pg.isin(["SUB", "GK", "GKP"]),
                                ["opponent", "pos_group", "Threat", "Goal_Threat", "Assist_Threat","npxG_ewm","xA_ewm"]]

    latest_ewm.to_csv("Team_threat.csv", index=False)


# ============================================================
# Main Understat dataset function (your full pipeline, with LOCF shares everywhere)
# ============================================================
def Generate_Understat_dataset(current_players, run_player_pos):
    import re, unicodedata
    from rapidfuzz import process, fuzz

    def _normalize(s: str) -> str:
        s = str(s)
        s = unicodedata.normalize("NFKD", s)
        s = "".join(ch for ch in s if not unicodedata.combining(ch))
        s = s.lower().strip()
        s = re.sub(r"[^a-z0-9\s]", " ", s)
        s = re.sub(r"\s+", " ", s)
        return s

    def _last10_pos_mode_excl_sub(df_understat: pd.DataFrame,
                                  player_col="player_name",
                                  pos_col="pos_group",
                                  date_col="date",
                                  window=15) -> pd.DataFrame:

        us = df_understat[[player_col, pos_col, date_col]].copy()
        us[date_col] = pd.to_datetime(us[date_col], errors="coerce")
        us = us.dropna(subset=[player_col, date_col]).sort_values([player_col, date_col])

        rows = []
        out_col = "Matched_Pos"
        for name, g in us.groupby(player_col, sort=False):
            def pick_from_last(n):
                last = g.tail(n)
                pos = last[pos_col].astype(str).str.strip()
                non_sub = pos[~pos.str.upper().eq("SUB")]
                if non_sub.empty:
                    return None
                vc = non_sub.value_counts()
                top = set(vc[vc == vc.max()].index)
                return next((p for p in reversed(non_sub.tolist()) if p in top), None)

            pick = pick_from_last(5) or pick_from_last(15) or "SUB"
            rows.append({player_col: name, out_col: pick})

        return pd.DataFrame(rows)
    
    
    def _lastN_pos_distribution_excl_sub(
            df_understat: pd.DataFrame,
            player_col="player_name",
            pos_col="pos_group",
            date_col="date",
            window=10
        ) -> pd.DataFrame:

        us = df_understat[[player_col, pos_col, date_col]].copy()
        us[date_col] = pd.to_datetime(us[date_col], errors="coerce")
        us = us.dropna(subset=[player_col, date_col]).sort_values([player_col, date_col])

        rows = []
        for name, g in us.groupby(player_col, sort=False):
            last = g.tail(window)
            pos = last[pos_col].astype(str).str.strip()

            # exclude SUB
            non_sub = pos[~pos.str.upper().eq("SUB")]

            if non_sub.empty:
                rows.append({
                    player_col: name,
                    "Matched_Pos_List": ["SUB"],
                    "Matched_Pos_Pct_List": [1.0],
                })
                continue

            # counts and percentages
            vc = non_sub.value_counts()  # by default sorts by count desc
            total = float(vc.sum())

            # Stable ordering choice:
            # - primary: higher % first (value_counts already does this)
            # - tie-break: by recency in the last window (more recent first)
            last_pos_list = non_sub.tolist()
            last_index = {}
            for i, p in enumerate(last_pos_list):
                last_index[p] = i  # last occurrence index
            ordered_positions = sorted(vc.index, key=lambda p: (-vc[p], -last_index.get(p, -1)))

            pct_list = [float(vc[p] / total) for p in ordered_positions]

            rows.append({
                player_col: name,
                "Matched_Pos_List": ordered_positions,
                "Matched_Pos_Pct_List": pct_list,
            })

        return pd.DataFrame(rows)

    def attach_fpl_names_to_understat(df_understat: pd.DataFrame,
                                     current_players_csv: str = "Raw_Data_26/current_players.csv",
                                     strict: int = 95,
                                     relaxed: int = 90,
                                     aliases: dict | None = None):

        cp = pd.read_csv(current_players_csv)
        needed_cols = ["name", "web_name"]
        for c in needed_cols:
            if c not in cp.columns:
                raise ValueError(f"{current_players_csv} missing required column '{c}'")

        aliases = aliases or {
            "gabriel fernando de jesus": "gabriel jesus",
            "heung-min son": "son heung-min",
            "heung min son": "son heung min",
        }

        us_names = (df_understat["player_name"].dropna().astype(str).str.strip().unique().tolist())
        us_norm_to_orig = {_normalize(u): u for u in us_names}
        us_choices = list(us_norm_to_orig.keys())

        rows = []
        for _, r in cp.iterrows():
            fpl_name = str(r["name"])
            fpl_web = str(r["web_name"])

            q1 = aliases.get(_normalize(fpl_name), _normalize(fpl_name))
            q2 = aliases.get(_normalize(fpl_web), _normalize(fpl_web))

            picked, score, matched_on = None, np.nan, "no-match"

            b = process.extractOne(q1, us_choices, scorer=fuzz.WRatio)
            if b and b[1] >= strict:
                picked, score, matched_on = us_norm_to_orig[b[0]], float(b[1]), "name-strict"
            elif b and b[1] >= relaxed:
                picked, score, matched_on = us_norm_to_orig[b[0]], float(b[1]), "name-relaxed"
            else:
                b2 = process.extractOne(q2, us_choices, scorer=fuzz.WRatio)
                if b2 and b2[1] >= strict:
                    picked, score, matched_on = us_norm_to_orig[b2[0]], float(b2[1]), "web_name-strict"
                elif b2 and b2[1] >= relaxed:
                    picked, score, matched_on = us_norm_to_orig[b2[0]], float(b2[1]), "web_name-relaxed"

            if picked is None:
                picked = "Unknown for understat"

            rows.append({
                "fpl_name": fpl_name,
                "fpl_web_name": fpl_web,
                "understat_player_name": picked,
                "match_score": score,
                "matched_on": matched_on,
            })

        match_table = pd.DataFrame(rows)

        pos_table = _lastN_pos_distribution_excl_sub(
            df_understat,
            player_col="player_name",
            pos_col="pos_group",
            date_col="date",
            window=10
        )

        fpl_view = match_table.merge(
            pos_table, left_on="understat_player_name", right_on="player_name", how="left"
        )
        # Fill missing (no Understat match etc.)
        fpl_view["Matched_Pos_List"] = fpl_view["Matched_Pos_List"].apply(
            lambda x: x if isinstance(x, list) else ["SUB"]
        )
        fpl_view["Matched_Pos_Pct_List"] = fpl_view["Matched_Pos_Pct_List"].apply(
            lambda x: x if isinstance(x, list) else [1.0])
        fpl_view["Test"] = 1
        fpl_view.to_csv("Generate_Player_Matches.csv", index=False)

    # ---- helpers for season filtering ----
    def _add_parsed_dt_col(df, candidates=("date", "kickoff_utc", "datetime")):
        col = next((c for c in candidates if c in df.columns), None)
        if col is None:
            raise ValueError(f"No date-like column found (looked for {candidates}). Columns: {list(df.columns)}")
        out = df.copy()
        dt = pd.to_datetime(out[col], errors="coerce", utc=False, infer_datetime_format=True)
        if dt.isna().all():
            dt = pd.to_datetime(out[col], errors="coerce", utc=False, dayfirst=True, infer_datetime_format=True)
        try:
            if dt.dt.tz is not None:
                dt = dt.dt.tz_localize(None)
        except Exception:
            pass
        out["_dt"] = dt
        return out, "_dt"

    def filter_by_window(df, start, end):
        tmp, dtcol = _add_parsed_dt_col(df)
        mask = (tmp[dtcol] >= pd.Timestamp(start)) & (tmp[dtcol] <= pd.Timestamp(end))
        return tmp.loc[mask].drop(columns=[dtcol])

    from pathlib import Path

    start_season = 22
    season = start_season
    filtered_dfs = []

    while True:
        file_path = Path(f"Raw_Data_{season}/Understat_data.csv")

        if not file_path.exists():
            print(f"File not found: {file_path}. Stopping.")
            break

        df = pd.read_csv(file_path)

        start_year = 2000 + season
        end_year = start_year + 1

        start_date = f"{start_year}-08-01"
        end_date = f"{end_year}-05-30"

        filtered_df = filter_by_window(df, start_date, end_date).copy()
        filtered_df["season"] = str(season)

        filtered_dfs.append(filtered_df)

        season += 1

    if filtered_dfs:
        final = pd.concat(
            filtered_dfs,
            ignore_index=True,
            sort=False
        )
    else:
        final = pd.DataFrame()

    # ---- find home/away team cols ----
    def _find_team_cols(df):
        home_candidates = ["home_team", "h_team", "h_title"]
        away_candidates = ["away_team", "a_team", "a_title"]
        home_col = next((c for c in home_candidates if c in df.columns), None)
        away_col = next((c for c in away_candidates if c in df.columns), None)
        if not home_col or not away_col:
            raise ValueError(f"Could not find home/away team columns. Tried {home_candidates} / {away_candidates}")
        return home_col, away_col

    home_col, away_col = _find_team_cols(final)

    # ---- player_team from team_title vs home/away ----
    final["player_team"] = final.apply(
        lambda r: next(
            (v for v in map(str.strip, str(r.get("team_title", "")).split(","))
             if v.lower() in {
                 str(r.get(home_col, "")).strip().lower(),
                 str(r.get(away_col, "")).strip().lower()
             }),
            np.nan
        ),
        axis=1
    )

    pt_lc = final["player_team"].astype(str).str.strip().str.casefold()
    home_lc = final[home_col].astype(str).str.strip().str.casefold()
    away_lc = final[away_col].astype(str).str.strip().str.casefold()

    final["opponent"] = np.where(pt_lc.eq(home_lc), final[away_col],
                          np.where(pt_lc.eq(away_lc), final[home_col], np.nan))

    priority_map = {
        "DC": "CB",
        "MR": "RW", "AMR": "RW", "FWR": "RW",
        "DMC": "DM",
        "DML": "DL", "DMR": "DR",
        "ML": "LW", "AML": "LW", "FWL": "LW",
    }

    def to_group(p):
        p = str(p).upper().strip()
        return priority_map.get(p, p)

    final["pos_group"] = final["position"].apply(to_group)

    df = final.copy()

    # Ensure date as date (not datetime) early, then later convert as needed
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    elif "kickoff_utc" in df.columns:
        df["date"] = pd.to_datetime(df["kickoff_utc"], errors="coerce").dt.date
    elif "datetime" in df.columns:
        df["date"] = pd.to_datetime(df["datetime"], errors="coerce").dt.date
    else:
        raise ValueError("No date-like column found (tried 'date', 'kickoff_utc', 'datetime').")

    # metrics
    metrics = ["npg", "npxG", "key_passes", "shots", "goals", "xG", "xA", "assists", "xGChain", "xGBuildup"]
    for c in metrics:
        if c not in df.columns:
            df[c] = 0
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    df = df.dropna(subset=["player_team"])

    # name mapping
    df["player_team"] = df["player_team"].apply(canonicalize_team_name)
    df["opponent"] = df["opponent"].apply(canonicalize_team_name)

    if run_player_pos == 1:
        attach_fpl_names_to_understat(df, current_players)

    # penalty model (unchanged)
    df["Penalty"] = np.where((df["xG"] - df["npxG"]) > 0, 1, 0)

    df_penalty = (
        df.groupby(["date", "player_team"], as_index=False)["Penalty"]
          .sum()
          .rename(columns={"Penalty": "penalty_sum"})
          .sort_values(["date", "player_team"])
          .reset_index(drop=True)
    )
    df_penalty["date"] = pd.to_datetime(df_penalty["date"], errors="coerce")
    df_penalty = df_penalty.sort_values(["player_team", "date"])

    df_penalty["penalty_roll30_mean"] = (
        df_penalty.groupby("player_team")["penalty_sum"]
                  .rolling(window=40, min_periods=1)
                  .mean()
                  .reset_index(level=0, drop=True)
    )

    df_penalty["Penalty"] = df_penalty["penalty_roll30_mean"].fillna(0.07).clip(0.07, 0.2)
    games_per_team = df_penalty.groupby("player_team")["date"].transform("count")

    df_penalty.loc[games_per_team < 16, "Penalty"] = 0.07

    team_dataset_newest = pd.read_csv("Team_data_newest2.csv", usecols=["name", "code"])
    team_dataset_newest["name"] = team_dataset_newest["name"].apply(canonicalize_team_name)
    latest_penalty_df = (
        df_penalty.drop_duplicates(subset=["player_team"], keep="last")
          .sort_values(["player_team"])
          .reset_index(drop=True)
    )
    latest_penalty_df = latest_penalty_df.merge(team_dataset_newest, left_on="player_team", right_on="name", how="left")
    latest_penalty_df.to_csv("Team_Penalties.csv", index=False)

    # save transformed base
    df.to_csv("Understat_transformed.csv", index=False)

    # =========================
    # Aggregate by pos/date/team
    # =========================
    def most_common(s):
        s = s.dropna().astype(str).str.strip()
        return s.value_counts().idxmax() if not s.empty else np.nan

    agg_df = (
        df.groupby(["pos_group", "date", "player_team"])
          .agg({
              "npg": "mean",
              "key_passes": ["mean", "sum"],
              "shots": ["mean", "sum"],
              "goals": "mean",
              "xG": "mean",
              "xA": ["mean", "sum"],
              "npxG": ["mean", "sum"],
              "assists": "mean",
              "xGChain": "mean",
              "xGBuildup": "mean",
              "opponent": most_common,
          })
          .reset_index()
    )

    def _rename(col):
        if not isinstance(col, tuple):
            return col
        base, func = col
        if func in (None, "", "mean", "most_common"):
            return base
        if func == "sum":
            return f"{base}_sum"
        return f"{base}_{func}"

    agg_df.columns = [_rename(c) for c in agg_df.columns]

    # make date datetime for locf logic
    agg_df["date"] = pd.to_datetime(agg_df["date"], errors="coerce")

    # ------------------------------------------------------------
    # LOCF SHARES (fixes your npxG_share/xA_share/shots_share/kp_share)
    # IMPORTANT: use SUM columns for the "team-total" logic
    # ------------------------------------------------------------
    # Ensure *_sum exist
    if "shots_sum" not in agg_df.columns:
        agg_df["shots_sum"] = pd.to_numeric(agg_df.get("shots", 0), errors="coerce").fillna(0.0)
    if "key_passes_sum" not in agg_df.columns:
        agg_df["key_passes_sum"] = pd.to_numeric(agg_df.get("key_passes", 0), errors="coerce").fillna(0.0)
    if "npxG_sum" not in agg_df.columns:
        agg_df["npxG_sum"] = pd.to_numeric(agg_df.get("npxG", 0), errors="coerce").fillna(0.0)
    if "xA_sum" not in agg_df.columns:
        agg_df["xA_sum"] = pd.to_numeric(agg_df.get("xA", 0), errors="coerce").fillna(0.0)

    agg_df = add_locf_shares(
        agg_df,
        team_col="player_team",
        date_col="date",
        pos_col="pos_group",
        value_cols=["npxG_sum", "xA_sum", "shots_sum", "key_passes_sum"],
        share_names={
            "npxG_sum": "npxG_share",
            "xA_sum": "xA_share",
            "shots_sum": "shots_share",
            "key_passes_sum": "key_passes_share",
        },
        pos_universe=None,
        exclude_pos={"SUB", "GK", "GKP"},
    )

    # your caps
    agg_df["npxG_share"] = agg_df["npxG_share"].clip(upper=0.6)
    agg_df["xA_share"] = agg_df["xA_share"].clip(upper=0.6)
    agg_df["shots_share"] = agg_df["shots_share"].clip(upper=0.6)
    agg_df["key_passes_share"] = agg_df["key_passes_share"].clip(upper=0.6)

    agg_df.to_csv("Team_AggTest.csv", index=False)

    # =========================
    # Enrich with team dataset
    # =========================
    team_dataset = pd.read_csv("Team_data_transformed2.csv")

    agg_df["date"] = pd.to_datetime(agg_df["date"], errors="coerce").dt.date
    team_dataset["date"] = pd.to_datetime(team_dataset["kickoff_time"], errors="coerce").dt.date

    needed_for = ["date", "name", "XG_avg", "Rolling_Threat", "code"]
    needed_against = ["date", "name", "XGC_avg", "Rolling_Threat_Against"]

    team_dataset["name"] = team_dataset["name"].apply(canonicalize_team_name)

    for col in needed_for + needed_against:
        if col not in team_dataset.columns:
            team_dataset[col] = pd.NA

    team_for = (
        team_dataset[needed_for]
        .groupby(["date", "name"], as_index=False)
        .mean(numeric_only=True)
        .rename(columns={
            "name": "player_team",
            "XG_avg": "team_XG_avg",
            "Rolling_Threat": "team_Rolling_Threat",
            "code": "Team_code",
        })
    )

    team_against = (
        team_dataset[needed_against]
        .groupby(["date", "name"], as_index=False)
        .mean(numeric_only=True)
        .rename(columns={
            "name": "opponent",
            "XGC_avg": "opp_XGC_avg",
            "Rolling_Threat_Against": "opp_Rolling_Threat_Against",
        })
    )

    agg_enriched = agg_df.merge(team_for, on=["date", "player_team"], how="left") \
                        .merge(team_against, on=["date", "opponent"], how="left")

    agg_enriched["Team_code"] = pd.to_numeric(agg_enriched["Team_code"], errors="coerce").fillna(0).astype(int)

    agg_enriched["xA2"] = agg_enriched["xA"] * 1 + agg_enriched["assists"] * 0
    agg_enriched["Adjusted_XG"] = agg_enriched["npxG"] / (agg_enriched["opp_Rolling_Threat_Against"] * 0.5 + agg_enriched["opp_XGC_avg"] * 0.5)
    agg_enriched["Adjusted_XG"] = agg_enriched["Adjusted_XG"].clip(upper=1)

    agg_enriched["Adjusted_XA"] = agg_enriched["xA2"] / (agg_enriched["opp_Rolling_Threat_Against"] * 0.5 + agg_enriched["opp_XGC_avg"] * 0.5)
    agg_enriched["Adjusted_XA"] = agg_enriched["Adjusted_XA"].clip(upper=1)

    agg_enriched["date"] = pd.to_datetime(agg_enriched["date"], errors="coerce")
    agg_enriched = agg_enriched.sort_values(["player_team", "pos_group", "date"])

    # EWM / rolling
    agg_enriched["Rolling_Adjusted_XG"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["Adjusted_XG"]
                    .transform(lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean())
    )
    agg_enriched["Rolling_Adjusted_XA"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["Adjusted_XA"]
                    .transform(lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean())
    )

    agg_enriched["Rolling_XG_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["npxG_share"]
                    .transform(lambda s: s.rolling(window=20, min_periods=1).mean())
    )
    agg_enriched["Rolling_XA_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["xA_share"]
                    .transform(lambda s: s.rolling(window=20, min_periods=1).mean())
    )
    agg_enriched["Rolling_Shots_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["shots_share"]
                    .transform(lambda s: s.rolling(window=20, min_periods=1).mean())
    )
    agg_enriched["Rolling_KeyPasses_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["key_passes_share"]
                    .transform(lambda s: s.rolling(window=20, min_periods=1).mean())
    )

    # ---- your adjust_measure_safe (unchanged) ----
    def adjust_measure_safe(g: pd.DataFrame, measure_name: str,
                            w_threat: float = 0.5, w_xgc: float = 0.5,
                            smoothing: float = 0.06, min_std_mult: float = 1,
                            start_from: str = "mean") -> pd.Series:

        for c in [measure_name, "opp_Rolling_Threat_Against", "opp_XGC_avg"]:
            if c not in g.columns:
                g = g.copy()
                g[c] = 0.0

        y = pd.to_numeric(g[measure_name], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        threat = pd.to_numeric(g["opp_Rolling_Threat_Against"], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        xgc = pd.to_numeric(g["opp_XGC_avg"], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        opp_fac = w_threat * threat + w_xgc * xgc

        n = len(y)
        out = np.empty(n, dtype="float64")

        clip_upper = float(np.nanmax(y)) if np.isfinite(np.nanmax(y)) else 0.0
        std = float(np.nanstd(y, ddof=1)) if np.isfinite(np.nanstd(y, ddof=1)) else 0.0
        min_val = max(1e-9, std * min_std_mult)

        if start_from == "first" and n > 0 and np.isfinite(y[0]):
            current = float(y[0])
        else:
            m = float(np.nanmean(y)) if np.isfinite(np.nanmean(y)) else 0.0
            current = m

        in_row = 0
        in_row_fac = 1.0

        for i in range(n):
            fac_i = opp_fac[i] if np.isfinite(opp_fac[i]) else 1.0
            pred = current * fac_i
            diff = float(y[i] - pred)

            if abs(diff) > min_val:
                in_row += 1
            else:
                in_row = 0
                in_row_fac = 1.0
            if in_row >= 2:
                in_row_fac = 1.5

            adj = diff
            if adj > min_val: adj = min_val
            if adj < -min_val: adj = -min_val

            current = current + in_row_fac * smoothing * adj
            if current > clip_upper:
                current = clip_upper

            out[i] = current

        return pd.Series(out, index=g.index, name=f"{measure_name}_adj")

    agg_enriched["Rolling_Adjusted_XG2"] = (
        agg_enriched.groupby(["player_team", "pos_group"], group_keys=False)
                    .apply(lambda g: adjust_measure_safe(g, "Adjusted_XG"))
    )
    agg_enriched["Rolling_Adjusted_XA2"] = (
        agg_enriched.groupby(["player_team", "pos_group"], group_keys=False)
                    .apply(lambda g: adjust_measure_safe(g, "Adjusted_XA"))
    )

    agg_enriched["XGIndex"] = agg_enriched["Rolling_Adjusted_XG2"] * 0.3 + agg_enriched["Rolling_Adjusted_XG"] * 0.7
    agg_enriched["XAIndex"] = agg_enriched["Rolling_Adjusted_XA2"] * 0.3 + agg_enriched["Rolling_Adjusted_XA"] * 0.7

    # ------------------------------------------------------------
    # LOCF SHARES AGAIN (fixes Rolling_XG_Share2 / Rolling_XA_Share2)
    # ------------------------------------------------------------
    agg_enriched = add_locf_shares(
        agg_enriched,
        team_col="player_team",
        date_col="date",
        pos_col="pos_group",
        value_cols=["XGIndex", "XAIndex"],
        share_names={
            "XGIndex": "Rolling_XG_Share2",
            "XAIndex": "Rolling_XA_Share2",
        },
        pos_universe=None,
        exclude_pos={"SUB", "GK", "GKP"},
    )

    # save full enriched dataset
    agg_enriched.to_csv("Team_Positions_transformed.csv", index=False)

    # =========================
    # Latest row per team/pos
    # =========================
    df_latest = agg_enriched.copy()
    df_latest["date"] = pd.to_datetime(df_latest["date"], errors="coerce")
    df_latest = df_latest.dropna(subset=["player_team", "pos_group", "date"])
    df_latest = df_latest.sort_values(["player_team", "pos_group", "date"])

    latest = (
        df_latest.drop_duplicates(subset=["player_team", "pos_group"], keep="last")
                 .sort_values(["player_team", "pos_group"])
                 .reset_index(drop=True)
    )

    cols_to_avg = [
        "XGIndex", "XAIndex",
        "Rolling_XG_Share", "Rolling_XA_Share",
        "Rolling_XG_Share2", "Rolling_XA_Share2",
        "Rolling_Shots_Share", "Rolling_KeyPasses_Share",
    ]

    history_counts = (
        agg_enriched
        .dropna(subset=["player_team", "pos_group", "date"])
        .groupby(["player_team", "pos_group"])
        .size()
        .rename("history_len")
        .reset_index()
    )
    latest = latest.merge(history_counts, on=["player_team", "pos_group"], how="left")
    latest["history_len"] = pd.to_numeric(latest["history_len"], errors="coerce").fillna(0.0)
    latest["_own_weight"] = (latest["history_len"] / 10.0).clip(lower=0.0, upper=1.0)

    for col in cols_to_avg:
        latest[col] = pd.to_numeric(latest[col], errors="coerce")

    for pos_group_value in latest["pos_group"].dropna().unique():
        pos_mask = latest["pos_group"] == pos_group_value
        pos_rows = latest.loc[pos_mask].copy()
        if pos_rows.empty:
            continue

        league_pos_mean = pos_rows[cols_to_avg].mean(numeric_only=True)

        for idx, row in pos_rows.iterrows():
            own_weight = float(row["_own_weight"])
            other_rows = pos_rows[pos_rows["player_team"] != row["player_team"]]
            other_mean = other_rows[cols_to_avg].mean(numeric_only=True) if not other_rows.empty else league_pos_mean
            blend_target = other_mean.where(other_mean.notna(), league_pos_mean)
            own_values = pd.to_numeric(row[cols_to_avg], errors="coerce")
            latest.loc[idx, cols_to_avg] = (
                own_weight * own_values
                + (1.0 - own_weight) * blend_target
            ).values

    latest = latest.drop(columns=["history_len", "_own_weight"])

    latest.to_csv("Team_Positions_transformed_Newest.csv", index=False)

    # regenerate team threats from Team_AggTest.csv (now fixed shares)
    Generate_Team_threats()


# ============================================================
# Run
# ============================================================
if __name__ == "__main__":
    # You pass these in your environment; keeping your signature
    # current_players is used only if run_player_pos==1
    current_players = "Raw_Data_26/current_players.csv"
    run_player_pos = 0
    Generate_Understat_dataset(current_players, run_player_pos)
