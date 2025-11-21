

def Generate_Understat_dataset(current_players,run_player_pos):

    import pandas as pd
    import numpy as np
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
        out_col="Matched_Pos"
        for name, g in us.groupby(player_col, sort=False):
            def pick_from_last(n):
                last = g.tail(n)
                pos = last[pos_col].astype(str).str.strip()
                non_sub = pos[~pos.str.upper().eq("SUB")]
                if non_sub.empty:
                    return None
                vc = non_sub.value_counts()
                top = set(vc[vc == vc.max()].index)
                # pick the most recent among the tied top positions
                return next((p for p in reversed(non_sub.tolist()) if p in top), None)

            pick = pick_from_last(5)
            if pick is None:
                pick = pick_from_last(15)
            if pick is None:
                pick = "SUB"

            rows.append({player_col: name, out_col: pick})

        return pd.DataFrame(rows)

# ---------- integrated function ----------
    def attach_fpl_names_to_understat(df_understat: pd.DataFrame,
                                  current_players_csv: str = "Raw_Data_25/current_players.csv",
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

        # Understat name universe
        us_names = (df_understat["player_name"]
                    .dropna().astype(str).str.strip().unique().tolist())
        us_norm_to_orig = { _normalize(u): u for u in us_names }
        us_choices = list(us_norm_to_orig.keys())

        # Build FPL → Understat mapping (keep ALL FPL players)
        rows = []
        for _, r in cp.iterrows():
            fpl_name = str(r["name"])
            fpl_web  = str(r["web_name"])

            q1 = aliases.get(_normalize(fpl_name), _normalize(fpl_name))
            q2 = aliases.get(_normalize(fpl_web),  _normalize(fpl_web))

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

            out_row = {
                "fpl_name": fpl_name,
                "fpl_web_name": fpl_web,
                "understat_player_name": picked,
                "match_score": score,
                "matched_on": matched_on
            }


            rows.append(out_row)

        match_table = pd.DataFrame(rows)

        # ---- FPL-centric view (keep all FPL players) ----
        # Compute last-10 position mode per Understat player and attach
        pos_table = _last10_pos_mode_excl_sub(df_understat, player_col="player_name",
                                              pos_col="pos_group", date_col="date", window=10)
        print(pos_table)

        fpl_view = match_table.merge(
            pos_table, left_on="understat_player_name", right_on="player_name", how="left"
        )
        # fill position for unmatched or no history
        fpl_view["Matched_Pos"] = fpl_view["Matched_Pos"].fillna("SUB")
        fpl_view["Test"] = 1
        fpl_view.to_csv("Generate_Player_Matches.csv")


    def player_positions(df, current_players):
        currentplayers=pd.read_csv("Raw_Data_25/current_players.csv")
        understat_names=df["player_name"].unique()
        names=currentplayers["web_name"].unique()
        webnames=currentplayers["name"].unique()
        all=[]
        for i in range(len(names)):
            player_row=[]
            name=names[i]
            player_row.append(name)
            webname=webnames[i]

    # ---- helpers ----
    def _add_parsed_dt_col(df, candidates=("date", "kickoff_utc", "datetime")):
        """Find a date-like column, parse to datetime, return (copy_of_df, dt_col_name)."""
        col = next((c for c in candidates if c in df.columns), None)
        if col is None:
            raise ValueError(f"No date-like column found (looked for {candidates}). Columns: {list(df.columns)}")
        out = df.copy()
        # try ISO first, then dayfirst (handles e.g. '01.08.2022')
        dt = pd.to_datetime(out[col], errors="coerce", utc=False, infer_datetime_format=True)
        if dt.isna().all():
            dt = pd.to_datetime(out[col], errors="coerce", utc=False, dayfirst=True, infer_datetime_format=True)
        # drop timezone if present
        try:
            if dt.dt.tz is not None:
                dt = dt.dt.tz_localize(None)
        except Exception:
            pass
        out["_dt"] = dt
        return out, "_dt"

    def filter_by_window(df, start, end):
        """Filter df to start<=date<=end using best-guess date column."""
        tmp, dtcol = _add_parsed_dt_col(df)
        mask = (tmp[dtcol] >= pd.Timestamp(start)) & (tmp[dtcol] <= pd.Timestamp(end))
        return tmp.loc[mask].drop(columns=[dtcol])

    # ---- load your data ----
    df1 = pd.read_csv("Raw_Data_22/Understat_data.csv")      # season "22" -> 2022/23
    df2 = pd.read_csv("Raw_Data_23/Understat_data.csv")     # season "23" -> 2023/24
    df3 = pd.read_csv("Raw_Data_24/Understat_data.csv")     # season "24" -> 2024/25
    df4 = pd.read_csv("Raw_Data_25/Understat_data.csv")     # season "25" -> 2025/26

    # ---- define season windows ----
    windows = {
        "22": ("2022-08-01", "2023-05-30"),
        "23": ("2023-08-01", "2024-05-30"),
        "24": ("2024-08-01", "2025-05-30"),
        "25": ("2025-08-01", "2026-05-30"),
    }

    # ---- filter and tag ----
    f1 = filter_by_window(df1, *windows["22"]); f1["season"] = "22"
    f2 = filter_by_window(df2, *windows["23"]); f2["season"] = "23"
    f3 = filter_by_window(df3, *windows["24"]); f3["season"] = "24"
    f4 = filter_by_window(df4, *windows["25"]); f4["season"] = "25"

    # ---- concat (columns will union; missing fields become NaN) ----
    final = pd.concat([f1, f2, f3, f4], ignore_index=True, sort=False)


    # --- find home/away columns present in your df ---
    def _find_team_cols(df):
        home_candidates = ["home_team", "h_team", "h_title"]
        away_candidates = ["away_team", "a_team", "a_title"]
        home_col = next((c for c in home_candidates if c in df.columns), None)
        away_col = next((c for c in away_candidates if c in df.columns), None)
        if not home_col or not away_col:
            raise ValueError(f"Could not find home/away team columns. Tried {home_candidates} / {away_candidates}")
        return home_col, away_col

    home_col, away_col = _find_team_cols(final)

    # --- (re)build player_team EXACT from team_title vs home/away ---
    final["player_team"] = final.apply(
        lambda r: next(
            (v for v in map(str.strip, str(r.get("team_title","")).split(","))
             if v.lower() in {
                 str(r.get(home_col, "")).strip().lower(),
                 str(r.get(away_col, "")).strip().lower()
             }),
            np.nan
        ),
        axis=1
    )

    # --- build opponent from home/away (vectorized, case-insensitive) ---
    pt_lc  = final["player_team"].astype(str).str.strip().str.casefold()
    home_lc = final[home_col].astype(str).str.strip().str.casefold()
    away_lc = final[away_col].astype(str).str.strip().str.casefold()

    final["opponent"] = np.where(pt_lc.eq(home_lc), final[away_col],
                          np.where(pt_lc.eq(away_lc), final[home_col], np.nan))
    priority_map = {
        # group 1: centre-backs
        "DC": "CB",
        # group 2: right mids & wings
        "MR": "RW", "AMR": "RW", "FWR": "RW",
        # group 3: defensive mids
        "DMC": "DM", 
        
        "DML": "DL", "DMR": "DR",
        # group 4: offensive mids (AMR is already caught by RW above)
        "ML": "LW","AML":"LW","FWL":"LW"
    }

    def to_group(p):
        p = str(p).upper().strip()
        return priority_map.get(p, p)   # fallback: keep original for others (DL, DR, ML, FWL, FW, MC, GK, Sub)

    final["pos_group"] = final['position'].apply(to_group)

    import pandas as pd

    df = final.copy()  # or whichever df you want to aggregate

    # 1) Ensure we have a 'date' column (as date, not datetime)
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    elif "kickoff_utc" in df.columns:
        df["date"] = pd.to_datetime(df["kickoff_utc"], errors="coerce").dt.date
    elif "datetime" in df.columns:
        df["date"] = pd.to_datetime(df["datetime"], errors="coerce").dt.date
    else:
        raise ValueError("No date-like column found (tried 'date', 'kickoff_utc', 'datetime').")

    # 2) Make sure we have a 'position' column (rename if needed)
    if "pos_group" not in df.columns:
        for alt in ("pos", "player_position"):
            if alt in df.columns:
                df = df.rename(columns={alt: "position"})
                break
    if "pos_group" not in df.columns:
        raise ValueError("No 'position' (or 'pos' / 'player_position') column found.")

    # 3) Ensure player_team exists (from your previous step)
    if "player_team" not in df.columns:
        raise ValueError("Expected 'player_team' column is missing.")

    # 4) Coerce metrics to numeric and fill NaN with 0
    metrics = ["npg", "npxG", "key_passes", "shots","goals","xG","xA","assists","xGChain","xGBuildup"]
    for c in metrics:
        if c not in df.columns:
            df[c] = 0
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    # Optional: drop rows where team didn't resolve
    df = df.dropna(subset=["player_team"])
    def most_common(s):
        s = s.dropna().astype(str).str.strip()
        return s.value_counts().idxmax() if not s.empty else np.nan


    mapping = {
            "Manchester City": "Man City",
            "Manchester United": "Man Utd",
            "Newcastle United": "Newcastle",
            "Nottingham Forest": "Nott'm Forest",
            "Sheffield United": "Sheffield Utd",
            "Tottenham": "Spurs",                 # if your data has "Tottenham Hotspur", map that too:
            "Tottenham Hotspur": "Spurs",
            "Wolverhampton Wanderers": "Wolves",
        }

        # tidy whitespace then map
    df["player_team"] = df["player_team"].astype(str).str.strip().replace(mapping)# agg_df.to_csv("grouped_by_pos_date_team.csv", index=False)
    df["opponent"] = df["opponent"].astype(str).str.strip().replace(mapping)# agg_df.to_csv("grouped_by_pos_date_team.csv", index=False)

    if(run_player_pos==1):
        attach_fpl_names_to_understat(df, current_players)

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

    # 3) rolling mean over last 30 matches per team (proportion of matches with a penalty)
    df_penalty["penalty_roll30_mean"] = (
        df_penalty.groupby("player_team")["penalty_sum"]
                  .rolling(window=40, min_periods=1)   # use min_periods=30 if you only want values after 30 games
                  .mean()
                  .reset_index(level=0, drop=True)
    )

    # 4) cap at 0.25
    df_penalty["Penalty"] = (
        df_penalty["penalty_roll30_mean"].fillna(0.10).clip(0.10, 0.2)
    )
    
    team_dataset_newest = pd.read_csv(
    "Team_data_newest2.csv",
    usecols=["name", "code"]
    )
    

    latest_penalty_df = (
        df_penalty.drop_duplicates(subset=["player_team"], keep="last")
          .sort_values(["player_team"])
          .reset_index(drop=True)
    )
    
    latest_penalty_df = latest_penalty_df.merge(
        team_dataset_newest, left_on="player_team",right_on= "name",how="left"
    )


    latest_penalty_df.to_csv("Team_Penalties.csv")



    agg_ops = {c: "mean" for c in ["npg","npxG","key_passes","shots","goals","xG","xA","assists","xGChain","xGBuildup"]}
    agg_ops["opponent"] = most_common   # <- add the opponent “mode”
    df.to_csv("Understat_transformed.csv")

    agg_df = (
        df.groupby(["pos_group","date","player_team"])
          .agg({
              "npg":"mean","key_passes":"mean","shots":"mean","goals":"mean","xG":"mean",
              "xA":["mean","sum"],              # mean + sum
              "npxG":["mean","sum"],            # mean + sum
              "assists":"mean","xGChain":"mean","xGBuildup":"mean",
              "opponent": most_common
          })
          .reset_index()
    )
    def _rename(col):
        if not isinstance(col, tuple):     # non-multi cols (e.g., group keys)
            return col
        base, func = col
        if func in (None, "", "mean"):
            return base     
        if func in (None, "", "most_common"):
            return base  # no postfix for mean
        if func == "sum":
            return f"{base}_sum"           # postfix only for sum
        return f"{base}_{func}"

    agg_df.columns = [_rename(c) for c in agg_df.columns]

    team_tot_xg = agg_df.groupby(["date","player_team"])["npxG_sum"].transform("sum")
    team_tot_xa = agg_df.groupby(["date","player_team"])["xA"].transform("sum")

    agg_df["npxG_share"] = (agg_df["npxG_sum"] / team_tot_xg).replace([np.inf, -np.inf], np.nan).fillna(0)
    agg_df["xA_share"] = (agg_df["xA_sum"] / team_tot_xa).replace([np.inf, -np.inf], np.nan).fillna(0)

    print(agg_df)

    positions = (agg_df["pos_group"]
                 .dropna()
                 .astype(str)
                 .str.strip()
                 .replace({"": None})
                 .dropna()
                 .unique())

    # if you want them sorted:
    agg_df.to_csv("Team_AggTest.csv")
    team_dataset=pd.read_csv("Team_data_transformed2.csv")

    agg_df["date"] = pd.to_datetime(agg_df["date"], errors="coerce").dt.date

    team_dataset["date"] = pd.to_datetime(team_dataset["kickoff_time"], errors="coerce").dt.date

    needed_for = ["date", "name", "XG_avg", "Rolling_Threat","code"]
    needed_against = ["date", "name", "XGC_avg", "Rolling_Threat_Against"]

    for col in needed_for + needed_against:
        if col not in team_dataset.columns:
            team_dataset[col] = pd.NA  # tolerate missing columns

    # If there are multiple rows per (date,name), reduce to a single row (mean)
    team_for = (
        team_dataset[needed_for]
        .groupby(["date", "name"], as_index=False)
        .mean(numeric_only=True)
        .rename(columns={
            "name": "player_team",
            "XG_avg": "team_XG_avg",
            "Rolling_Threat": "team_Rolling_Threat",
            "code":"Team_code"
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

    # 4) Merge onto agg_df
    agg_enriched = agg_df.merge(
        team_for, on=["date", "player_team"], how="left"
    ).merge(
        team_against, on=["date", "opponent"], how="left"
    )

    agg_enriched["Team_code"]=agg_enriched["Team_code"].astype("int")
    agg_enriched["xA2"]=agg_enriched["xA"]*0.7+agg_enriched["assists"]*0.3
    agg_enriched["Adjusted_XG"]=agg_enriched["npxG"]/(agg_enriched["opp_Rolling_Threat_Against"]*0.5+agg_enriched["opp_XGC_avg"]*0.5)

    agg_enriched["Adjusted_XA"]=agg_enriched["xA2"]/(agg_enriched["opp_Rolling_Threat_Against"]*0.5+agg_enriched["opp_XGC_avg"]*0.5)
    agg_enriched["date"] = pd.to_datetime(agg_enriched["date"], errors="coerce")
    agg_enriched = agg_enriched.sort_values(["player_team", "pos_group", "date"])

    # EWM(15) for xG per team & position group
    agg_enriched["Rolling_Adjusted_XG"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["Adjusted_XG"]
              .transform(lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean())
    )
    agg_enriched["Rolling_Adjusted_XA"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["assists"]
              .transform(lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean())
    )

    agg_enriched["Rolling_XG_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["npxG_share"]
          .transform(lambda s: s.rolling(window=15, min_periods=1).mean())
    )

    agg_enriched["Rolling_XA_Share"] = (
        agg_enriched.groupby(["player_team", "pos_group"])["xA_share"]
          .transform(lambda s: s.rolling(window=15, min_periods=1).mean())
    )

    def adjust_measure_safe(g: pd.DataFrame, measure_name: str,
                            w_threat: float = 0.5, w_xgc: float = 0.5,
                            smoothing: float = 0.08, min_std_mult: float = 1.2,
                            start_from: str = "mean") -> pd.Series:
        """Stateful smoother per group; returns a Series aligned to g.index."""
        # ensure expected columns exist
        for c in [measure_name, "opp_Rolling_Threat_Against", "opp_XGC_avg"]:
            if c not in g.columns:
                # create zeros if missing
                g = g.copy()
                g[c] = 0.0

        # numeric arrays
        y = pd.to_numeric(g[measure_name], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        threat = pd.to_numeric(g["opp_Rolling_Threat_Against"], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        xgc    = pd.to_numeric(g["opp_XGC_avg"], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
        opp_fac = w_threat * threat + w_xgc * xgc

        n = len(y)
        out = np.empty(n, dtype="float64")

        # scalars only below
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
            # decay offset (scalar)
            offset = 1

            # predicted = current * opp_fac[i] (guard NaN)
            fac_i = opp_fac[i] if np.isfinite(opp_fac[i]) else 1.0
            pred = current * fac_i
            diff = float(y[i] - pred)

            # outlier tracking (all scalars)
            if abs(diff) > min_val:
                in_row += 1
            else:
                in_row = 0
                in_row_fac = 1.0
            if in_row >= 2:
                in_row_fac = 1.5

            # clamp adj and update
            adj = diff
            if adj >  min_val: adj =  min_val
            if adj < -min_val: adj = -min_val

            current = current + in_row_fac * offset * smoothing * adj
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


    agg_enriched["XGIndex"]= agg_enriched["Rolling_Adjusted_XG2"]*0.3+agg_enriched["Rolling_Adjusted_XG"]*0.7
    agg_enriched["XAIndex"]= agg_enriched["Rolling_Adjusted_XA2"]*0.3+agg_enriched["Rolling_Adjusted_XA"]*0.7


    # 5) (Optional) save
    agg_enriched.to_csv("Team_Positions_transformed.csv", index=False)

    df = agg_enriched.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["player_team", "pos_group", "date"])

    # 2) sort so the newest date is last within each group
    # (add extra tie-breakers if you have e.g. 'kickoff_utc' or 'match_id')
    df = df.sort_values(["player_team", "pos_group", "date"])

    # 3) keep the last row per (team, position) = newest date
    latest = (
        df.drop_duplicates(subset=["player_team", "pos_group"], keep="last")
          .sort_values(["player_team", "pos_group"])
          .reset_index(drop=True)
    )

    # 4) write to file
    latest.to_csv("Team_Positions_transformed_Newest.csv", index=False)
