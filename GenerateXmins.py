import re
import numpy as np
import pandas as pd

# Try to import Prophet; fall back gracefully if unavailable



def GetXmins(current_players, n_future, scenarios=None, position_slots=None):
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
    for _, r in df_current.iterrows():
        code = r["code"]
        name = r.get("name", code)
        news = r.get("news", "")
        chance = 100

        # History for modeling (non-zero)
        pdf = hist.loc[hist[code_col] == code, ["kickoff_time", "minutes"]].copy()

        base_est, mult, ispercent = baseline_minutes_from(pdf, news, chance)
        prophet_vec, prophet_reason = prophet_minutes_from(pdf, periods=len(future_gws), min_points=3)

        last5_avg = last5_avg_including_zeros(code)

        for j, gw in enumerate(future_gws):
            m_base = float(base_est)
            m_prophet = float(prophet_vec[j]) if np.isfinite(prophet_vec[j]) else np.nan
            m_final = (m_base) if np.isfinite(m_prophet) else m_base
            minutes_prophet = 0 if not np.isfinite(m_prophet) else round(m_prophet, 2)
            multiplier = min(1.0, round(mult + (j * 0.1 * ispercent), 2))
            final_minutes = ((m_final + minutes_prophet) / 2) * multiplier
            if (final_minutes - last5_avg) >= 45:
                final_minutes = (final_minutes + last5_avg) / 2
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
        n = len(orig_series)
        if n == 0:
            return orig_series.copy()
        gws_norm = [str(x) for x in gws]
        pivot_str = str(pivot_gw)
        if pivot_str not in gws_norm:
            return orig_series.copy()
        k = gws_norm.index(pivot_str)
        orig = orig_series.astype(float).copy()
        tgt = float(target_value)
        new_vals = orig.copy()
        start_val = float(orig[0])
        def lerp(a, b, f): return a + f * (b - a)

        if mode in ("up_down", "growing"):
            if k > 0:
                for i in range(0, k + 1):
                    frac = i / k if k != 0 else 1.0
                    new_vals[i] = lerp(start_val, tgt, frac)
            else:
                new_vals[0] = tgt
            tail_len = (n - 1 - k)
            if tail_len > 0:
                for i in range(k, n):
                    frac = (i - k) / tail_len if tail_len != 0 else 1.0
                    new_vals[i] = lerp(tgt, orig[i], frac)
        elif mode == "down_up":
            if k > 0:
                for i in range(0, k + 1):
                    frac = i / k if k != 0 else 1.0
                    new_vals[i] = lerp(start_val, tgt, frac)
            else:
                new_vals[0] = tgt
            tail_len = (n - 1 - k)
            if tail_len > 0:
                for i in range(k, n):
                    frac = (i - k) / tail_len if tail_len != 0 else 1.0
                    new_vals[i] = lerp(tgt, orig[i], frac)
        else:
            return orig
        return np.clip(new_vals, 0.0, 90.0)

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
                if tp == "const":
                    out.loc[mask_p, "minutes_scenario"] = np.clip(val, 0.0, 90.0)
                    continue
                if gw_pivot is None:
                    continue
                orig_series = out.loc[mask_p, "minutes_scenario"].to_numpy(dtype=float)
                shaped = _apply_shape_to_series(orig_series, gws_horizon, gw_pivot, val, tp)
                out.loc[mask_p, "minutes_scenario"] = shaped
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

            if delta <= 1e-9:
                break
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



