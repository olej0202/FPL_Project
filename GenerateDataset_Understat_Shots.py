import pandas as pd
import numpy as np
import re
import unicodedata
from difflib import SequenceMatcher
from GenerateConfig import Understat_Team_MAP
# -------------------------
# Normalization utilities
# -------------------------



def _norm_name(s: str) -> str:
    _TRANSLIT = str.maketrans({
        "ø": "o", "Ø": "o",
        "å": "a", "Å": "a",
        "æ": "ae", "Æ": "ae",
        "ö": "o", "Ö": "o",
        "ä": "a", "Ä": "a",
        "ü": "u", "Ü": "u",
        "é": "e", "É": "e",
        "ñ": "n", "Ñ": "n",
        "ç": "c", "Ç": "c",
    })
    if s is None:
        return ""
    s = str(s).strip()
    s = s.translate(_TRANSLIT)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = s.replace("-", " ")
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def football_name_score(shot_name: str, cand_name: str) -> float:
    a = _norm_name(shot_name)
    b = _norm_name(cand_name)
    if not a or not b:
        return 0.0

    a_tokens = a.split()
    b_tokens = b.split()
    set_a = set(a_tokens)
    set_b = set(b_tokens)

    recall = len(set_a & set_b) / max(1, len(set_a))
    precision = len(set_a & set_b) / max(1, len(set_b))

    contains = 1.0 if (" " + a + " ") in (" " + b + " ") else 0.0
    starts = 1.0 if b.startswith(a) else 0.0

    ratio = SequenceMatcher(None, a, b).ratio()

    length_penalty = 1.0
    if len(b_tokens) - len(a_tokens) >= 3:
        length_penalty = 0.92

    score = (
        0.55 * recall +
        0.15 * precision +
        0.15 * ratio +
        0.10 * contains +
        0.05 * starts
    ) * length_penalty

    return float(score)

def best_candidate_score(shot_name: str, full_name: str, web_name: str):
    """
    Returns: (best_score, matched_from)
    matched_from ∈ {"full_name", "web_name"}
    """
    score_full = football_name_score(shot_name, full_name) if isinstance(full_name, str) and full_name.strip() else 0.0
    score_web  = football_name_score(shot_name, web_name)  if isinstance(web_name, str) and web_name.strip() else 0.0

    if score_web > score_full:
        return score_web, "web_name"
    return score_full, "full_name"


# -------------------------
# Load & prepare shots
# -------------------------

def ShotsData(shots_path):
    shots_df = pd.read_csv(shots_path).iloc[:, 1:]
    shots_df = shots_df[shots_df["situation"] != "Penalty"]


    mapping = Understat_Team_MAP


    for col in ["team_title", "a_team", "h_team"]:
        shots_df[col] = shots_df[col].astype(str).str.strip().replace(mapping)

    shots_df["own_team"] = np.where(shots_df["h_a"] == "h", shots_df["h_team"], shots_df["a_team"])
    shots_df["opponent_team"] = np.where(shots_df["h_a"] == "h", shots_df["a_team"], shots_df["h_team"])

    # Geometry
    goal_x, goal_y = 1.0, 0.5
    PITCH_LENGTH, PITCH_WIDTH = 105, 68

    shots_df["distance_m"] = np.sqrt(
        ((goal_x - shots_df["X"]) * PITCH_LENGTH) ** 2 +
        ((goal_y - shots_df["Y"]) * PITCH_WIDTH) ** 2
    )

    GOAL_WIDTH = 7.32
    goal_half_width_y = (GOAL_WIDTH / PITCH_WIDTH) / 2
    left_post_y, right_post_y = 0.5 - goal_half_width_y, 0.5 + goal_half_width_y

    shots_df["angle"] = (
        np.arctan2(right_post_y - shots_df["Y"], goal_x - shots_df["X"]) -
        np.arctan2(left_post_y  - shots_df["Y"], goal_x - shots_df["X"])
    ).clip(lower=0)

    shots_df["big_chance"] = (shots_df["xG"] >= 0.3).astype(int)

    # Assist type
    shots_df["lastAction_clean"] = shots_df["lastAction"].astype(str).str.strip().str.lower()
    active_actions = {"cross", "throughball", "chipped", "headpass"}
    inactive_actions = {"pass", "standard", "balltouch", "aerial"}

    shots_df["Type_Assist"] = np.select(
        [
            shots_df["lastAction_clean"].isin(active_actions),
            shots_df["lastAction_clean"].isin(inactive_actions),
        ],
        ["active", "inactive"],
        default="no_assist",
    )

    # Shot conversion
    shots_df["result_clean"] = shots_df["result"].astype(str).str.strip()
    shots_df["Shot_conversion"] = np.select(
        [
            shots_df["result_clean"].isin(["Goal", "ShotOnPost"]),
            shots_df["result_clean"].eq("SavedShot"),
            shots_df["result_clean"].eq("MissedShots"),
        ],
        [
            1 - shots_df["xG"],
            0 - 0.7 * shots_df["xG"],
            0 - shots_df["xG"],
        ],
        default=np.nan,
    )

    # XG created (your rule)
    shots_df["XG_created"] = np.select(
        [shots_df["Type_Assist"].eq("active"), shots_df["Type_Assist"].eq("inactive")],
        [shots_df["xG"], 0.5 * shots_df["xG"]],
        default=0,
    )

    return shots_df


# -------------------------
# Load current players + teams
# -------------------------

def load_current_players_with_team(
    players_path="Raw_Data_26/current_players.csv",
    teams_path="Raw_Data_26/current_teams.csv",
):
    players = pd.read_csv(players_path)
    teams = pd.read_csv(teams_path)

    players = players.merge(
        teams[["code", "name"]].rename(columns={"code": "team_code", "name": "team_name"}),
        on="team_code",
        how="left",
    )

    players["full_name"] = (players["first_name"].fillna("") + " " + players["second_name"].fillna("")).str.strip()

    if "web_name" not in players.columns:
        players["web_name"] = ""

    players["full_name_norm"] = players["full_name"].map(_norm_name)
    players["web_name_norm"] = players["web_name"].map(_norm_name)
    players["team_name_norm"] = players["team_name"].map(_norm_name)

    return players


# -------------------------
# Matching via match table (team constrained), using full_name then web_name for scoring
# IMPORTANT: matched_name stored is ALWAYS the full_name of the best candidate.
# -------------------------

def build_player_match_table(
    shots_df: pd.DataFrame,
    mapping: dict,
    min_score: float = 0.70,
    prefer_recall: bool = True,
    player_path: str="Raw_Data_26/current_players.csv",
    team_path:str="Raw_Data_26/current_teams.csv"
) -> pd.DataFrame:


    players = load_current_players_with_team(player_path,team_path)

    players["team_name_norm"] = (
        players["team_name"].astype(str).str.strip()
        .replace(mapping)
        .map(_norm_name)
    )

    shots = shots_df.copy()
    shots["team_norm"] = shots["own_team"].map(_norm_name)
    shots["player_norm"] = shots["player"].map(_norm_name)

    match_rows = []

    for team_norm, players_team in players.groupby("team_name_norm", dropna=True):
        shots_team = shots[shots["team_norm"] == team_norm]
        if shots_team.empty:
            continue

        cand = players_team[["code", "full_name", "web_name"]].copy()

        for shot_player_norm, grp in shots_team.groupby("player_norm", dropna=True):
            if not shot_player_norm:
                continue

            understat_player = grp["player"].iloc[0]
            shot_player_ids = grp["player_id"].unique()
            shot_tokens = set(shot_player_norm.split())

            best_code = np.nan
            best_score = -1.0
            best_from = None
            best_full_name = np.nan  # <-- FIX: store the winner's full_name

            for _, crow in cand.iterrows():
                sc, from_field = best_candidate_score(
                    shot_name=understat_player,
                    full_name=crow["full_name"],
                    web_name=crow["web_name"],
                )

                if prefer_recall:
                    name_for_recall = crow["full_name"] if from_field == "full_name" else crow["web_name"]
                    cand_tokens = set(_norm_name(name_for_recall).split())
                    recall = len(shot_tokens & cand_tokens) / max(1, len(shot_tokens))
                    if recall == 1.0:
                        sc += 0.03

                if sc > best_score:
                    best_score = sc
                    best_code = crow["code"]
                    best_from = from_field
                    best_full_name = crow["full_name"]  # <-- FIX: capture correct full name

            if best_score >= min_score:
                for pid in shot_player_ids:
                    match_rows.append({
                        "player_id": pid,
                        "understat_player": understat_player,
                        "player_code": best_code,
                        "match_score": float(best_score),
                        "matched_name": best_full_name,    # <-- FIX: correct name for code
                        "matched_from": best_from,
                        "team_norm": team_norm,
                    })

    return pd.DataFrame(match_rows)


def reduce_match_table(match_df: pd.DataFrame) -> pd.DataFrame:
    if match_df.empty:
        return match_df

    idx = match_df.groupby("player_id")["match_score"].idxmax()
    best = match_df.loc[idx].copy().sort_values("match_score", ascending=False)

    return best[
        ["player_id", "understat_player", "player_code", "match_score",
         "matched_name", "matched_from", "team_norm"]
    ]


def attach_codes_via_match_table(shots_df: pd.DataFrame, match_best: pd.DataFrame) -> pd.DataFrame:
    """
    1) Left join on shots_df.player_id -> match_best.player_id
       - player_code   -> Shot_player_code
       - matched_name  -> Shot Player name

    2) Left join on shots_df.player_assisted -> match_best.understat_player
       - player_code   -> Assist_player_code
       - matched_name  -> Assist Player name
    """
    # --- Join 1: shooter (by player_id) ---
    shooter_cols = match_best[["player_id", "player_code", "matched_name"]].rename(columns={
        "player_code": "Shot_player_code",
        "matched_name": "Shot_Player_name",
    })

    out = shots_df.merge(shooter_cols, on="player_id", how="left")

    # --- Join 2: assister (by understat_player name) ---
    assist_cols = match_best[["understat_player", "player_code", "matched_name","player_id"]].drop_duplicates("understat_player")
    assist_cols = assist_cols.rename(columns={
        "understat_player": "player_assisted",  # align key name for merge
        "player_code": "Assist_player_code",
        "matched_name": "Assist_Player_name",
        "player_id": "Assist_Player_id",
    })

    out = out.merge(assist_cols, on="player_assisted", how="left")
    out["Assist_Player_id"] = pd.to_numeric(
        out["Assist_Player_id"], errors="coerce"
    ).astype("Int64")
    out["Assist_player_code"] = pd.to_numeric(
        out["Assist_player_code"], errors="coerce"
    ).astype("Int64")
    out["Shot_player_code"] = pd.to_numeric(
        out["Shot_player_code"], errors="coerce"
    ).astype("Int64")


    return out


def apply_forced_to_match_best(
    match_best: pd.DataFrame,
    forced_map: dict,
    players_path="Raw_Data_26/current_players.csv",
    teams_path="Raw_Data_26/current_teams.csv",
) -> pd.DataFrame:
    """
    forced_map: { understat_player_id : current_players.code }

    - If player_id exists in match_best → override
    - If player_id does NOT exist → append new row
    """

    out = match_best.copy()

    # Ensure dtypes
    out["player_id"] = pd.to_numeric(out["player_id"], errors="coerce").astype("Int64")
    out["player_code"] = pd.to_numeric(out["player_code"], errors="coerce").astype("Int64")

    # Load players to resolve full_name
    players = load_current_players_with_team(
        players_path=players_path,
        teams_path=teams_path,
    )

    players["code"] = pd.to_numeric(players["code"], errors="coerce").astype("Int64")
    code_to_name = (
        players.dropna(subset=["code"])
        .set_index("code")["full_name"]
        .to_dict()
    )

    existing_ids = set(out["player_id"].dropna().astype(int))

    new_rows = []

    for pid, forced_code in forced_map.items():
        pid = int(pid)
        forced_code = int(forced_code)

        forced_name = code_to_name.get(forced_code, np.nan)

        if pid in existing_ids:
            # ---- override existing row ----
            mask = out["player_id"] == pid
            out.loc[mask, "player_code"] = forced_code
            out.loc[mask, "matched_name"] = forced_name
            out.loc[mask, "matched_from"] = "forced"
            out.loc[mask, "match_score"] = 1.0

        else:
            # ---- append new row ----
            new_rows.append({
                "player_id": pid,
                "understat_player": np.nan,   # unknown / not in shots at match time
                "player_code": forced_code,
                "match_score": 1.0,
                "matched_name": forced_name,
                "matched_from": "forced",
                "team_norm": np.nan,
            })

    if new_rows:
        out = pd.concat([out, pd.DataFrame(new_rows)], ignore_index=True)

    return out


def Player_shots(Understat_data: str):
    shots_df2 = pd.read_csv("Bronze/Understat_shots.csv")
    understat_df = pd.read_csv(Understat_data)

    # ---- Parse dates ----
    shots_df2["date"] = pd.to_datetime(shots_df2["date"], errors="coerce")
    understat_df["date"] = pd.to_datetime(understat_df["date"], errors="coerce")

    # Common merge key (date only)
    shots_df2["match_date"] = shots_df2["date"].dt.normalize()
    understat_df["match_date"] = understat_df["date"].dt.normalize()

    # Ensure player code is nullable int
    shots_df2["Shot_player_code"] = pd.to_numeric(
        shots_df2["Shot_player_code"], errors="coerce"
    ).astype("Int64")

    # Ensure consistent player name column
    if "Shot Player name" in shots_df2.columns and "Shot_Player_name" not in shots_df2.columns:
        shots_df2 = shots_df2.rename(columns={"Shot Player name": "Shot_Player_name"})

    # Helpers
    def most_common(s: pd.Series):
        s = s.dropna()
        if s.empty:
            return np.nan
        m = s.mode()
        return m.iloc[0] if not m.empty else np.nan

    def most_common_last20(s: pd.Series):
        s = s.dropna()
        if s.empty:
            return np.nan
        last = s.iloc[-20:]  # last 20 rows in time order (after sorting below)
        m = last.mode()
        return m.iloc[0] if not m.empty else np.nan

    # ---- Aggregate per player_code per match_date ----
    Player_shot_df = (
        shots_df2
        .groupby(["Shot_player_code", "Shot_Player_name", "match_date"], dropna=False)
        .agg(
            opponent_team=("opponent_team", "min"),
            own_team=("own_team", "min"),
            avg_distance_m=("distance_m", "mean"),
            avg_angle=("angle", "mean"),
            big_chance_sum=("big_chance", "sum"),
            Shot_conversion_sum=("Shot_conversion", "sum"),
            number_of_shots=("xG", "size"),
            xG_non_penalty=("xG", lambda x: x[shots_df2.loc[x.index, "situation"].ne("Penalty")].sum()),
            most_common_shotType=("shotType", most_common),
        )
        .reset_index()
        .rename(columns={"match_date": "date"})
    )

    # Map (Shot_player_code, date) -> Understat player_id (representative)
    player_id_map = (
        shots_df2
        .groupby(["Shot_player_code", "match_date"], dropna=False)["player_id"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else s.iloc[0])
        .reset_index()
        .rename(columns={"match_date": "date", "player_id": "understat_player_id"})
    )

    Player_shot_df = Player_shot_df.merge(
        player_id_map,
        on=["Shot_player_code", "date"],
        how="left"
    )

    # Keep only needed understat columns
    wanted = ["player_id", "match_date", "time", "position"]
    understat_keep = [c for c in wanted if c in understat_df.columns]
    understat_small = understat_df[understat_keep].copy()

    # De-duplicate per (player_id, match_date)
    if "player_id" in understat_small.columns and "match_date" in understat_small.columns:
        understat_small = understat_small.drop_duplicates(["player_id", "match_date"])

    # Merge time/position using date-only key
    Player_shot_df = Player_shot_df.merge(
        understat_small,
        left_on=["understat_player_id", "date"],
        right_on=["player_id", "match_date"],
        how="left"
    )

    # Cleanup merge columns
    drop_cols = [c for c in ["player_id", "match_date"] if c in Player_shot_df.columns]
    if drop_cols:
        Player_shot_df = Player_shot_df.drop(columns=drop_cols)

    # Remove null player codes
    Player_shot_df = Player_shot_df[Player_shot_df["Shot_player_code"].notna()].copy()

    # ---- Add rolling/EWM features (per player, ordered by date) ----
    Player_shot_df = Player_shot_df.sort_values(["Shot_player_code", "date"]).reset_index(drop=True)

    Player_shot_df["time_safe"] = (
        pd.to_numeric(Player_shot_df["time"], errors="coerce")
        .replace(0, np.nan)
        .clip(lower=20)
    )

    g = Player_shot_df.groupby("Shot_player_code", group_keys=False)

    # Shot_conversion_sum clipped [-0.5, 0.6]
    Player_shot_df["Shot_conversion_sum_clip"] = (
        pd.to_numeric(Player_shot_df["Shot_conversion_sum"], errors="coerce")
        .clip(lower=-0.5, upper=0.6)
    )

    # big_chance_sum clipped upper 2.8 (keep lower as-is, but you can set lower=0 if you want)
    Player_shot_df["big_chance_sum_clip"] = (
        pd.to_numeric(Player_shot_df["big_chance_sum"], errors="coerce")
        .clip(upper=2.8)
    )

    # xG_non_penalty clipped upper 1.1
    Player_shot_df["xG_non_penalty_clip"] = (
        pd.to_numeric(Player_shot_df["xG_non_penalty"], errors="coerce")
        .clip(upper=1.1)
    )

    
    Player_shot_df["Shot_conversion_sum_ewm"] = g["Shot_conversion_sum_clip"].apply(
        lambda s: s.ewm(span=25, adjust=False, min_periods=1).mean()
    )
    Player_shot_df["Shot_conversion_sum_rm20"] = g["Shot_conversion_sum_clip"].apply(
        lambda s: s.rolling(25, min_periods=1).mean()
    )

    # ============================================================
    # 3) avg_distance_m, avg_angle rolling 20 mean (unchanged)
    # ============================================================
    
    Player_shot_df["avg_distance_m_rm20"] = g["avg_distance_m"].apply(
        lambda s: s.rolling(20, min_periods=1).mean()
    )
    Player_shot_df["avg_angle_rm20"] = g["avg_angle"].apply(
        lambda s: s.rolling(20, min_periods=1).mean()
    )
    
    # ============================================================
    # 4) Rates using ratio of rolling sums to avoid spikes
    #    Use CLIPPED numerators for big chances + xG_np
    # ============================================================
    
    # Rolling sums (20)
    Player_shot_df["time_rm20"] = g["time_safe"].apply(lambda s: s.rolling(20, min_periods=1).sum())
    
    Player_shot_df["big_chance_sum_rm20"] = g["big_chance_sum_clip"].apply(
        lambda s: s.rolling(20, min_periods=1).sum()
    )
    Player_shot_df["big_chance_rate_rm20"] = (Player_shot_df["big_chance_sum_rm20"] / Player_shot_df["time_rm20"]) * 90
    
    Player_shot_df["xG_np_sum_rm20"] = g["xG_non_penalty_clip"].apply(
        lambda s: s.rolling(20, min_periods=1).sum()
    )
    Player_shot_df["xG_np_rate_rm20"] = (Player_shot_df["xG_np_sum_rm20"] / Player_shot_df["time_rm20"]) * 90
    
    # EWM rates = ewm(numerator) / ewm(time)
    Player_shot_df["time_ewm"] = g["time_safe"].apply(lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean())
    
    Player_shot_df["big_chance_sum_ewm"] = g["big_chance_sum_clip"].apply(
        lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean()
    )
    Player_shot_df["big_chance_rate_ewm"] = (Player_shot_df["big_chance_sum_ewm"] / Player_shot_df["time_ewm"]) * 90
    
    Player_shot_df["xG_np_sum_ewm"] = g["xG_non_penalty_clip"].apply(
        lambda s: s.ewm(span=20, adjust=False, min_periods=1).mean()
    )
    Player_shot_df["xG_np_rate_ewm"] = (Player_shot_df["xG_np_sum_ewm"] / Player_shot_df["time_ewm"]) * 90
    
    # ============================================================
    # 5) shotType mode over last 20 rows (per player)
    # ============================================================
    
    Player_shot_df["shotType_mode_last20"] = g["most_common_shotType"].apply(most_common_last20)
    
    # Optional: drop helpers you don't want to keep
    Player_shot_df = Player_shot_df.drop(columns=["time_safe"])
    # (keep or drop the clipped columns depending on if you want them for debugging)
    # Player_shot_df = Player_shot_df.drop(columns=["Shot_conversion_sum_clip","big_chance_sum_clip","xG_non_penalty_clip"])

    Player_shot_df.to_csv("Bronze/Understat_Playershots.csv", index=False)
    return Player_shot_df



def Player_assists(Understat_data: str):
    assist_df2 = pd.read_csv("Bronze/Understat_shots.csv")
    understat_df = pd.read_csv(Understat_data)

    # ---- Parse dates ----
    assist_df2["date"] = pd.to_datetime(assist_df2["date"], errors="coerce")
    understat_df["date"] = pd.to_datetime(understat_df["date"], errors="coerce")

    assist_df2["match_date"] = assist_df2["date"].dt.normalize()
    understat_df["match_date"] = understat_df["date"].dt.normalize()

    # Ensure assist player code nullable int
    assist_df2["Assist_player_code"] = pd.to_numeric(
        assist_df2["Assist_player_code"], errors="coerce"
    ).astype("Int64")

    # Ensure consistent player name column
    if "Assist Player name" in assist_df2.columns and "Assist_Player_name" not in assist_df2.columns:
        assist_df2 = assist_df2.rename(columns={"Assist Player name": "Assist_Player_name"})

    # ---- Aggregate per player per match_date ----
    Player_ass_df = (
        assist_df2
        .groupby(["Assist_player_code", "Assist_Player_name", "match_date"], dropna=False)
        .agg(
            opponent_team=("opponent_team", "min"),
            own_team=("own_team", "min"),
            xg_created=("XG_created", "sum"),
            big_chance_created=("big_chance", "sum"),
        )
        .reset_index()
        .rename(columns={"match_date": "date"})
    )

    # Map (Assist_player_code, date) -> Understat player_id
    player_id_map = (
        assist_df2
        .groupby(["Assist_player_code", "match_date"], dropna=False)["Assist_Player_id"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else s.iloc[0])
        .reset_index()
        .rename(columns={"match_date": "date", "Assist_Player_id": "understat_player_id"})
    )

    Player_ass_df = Player_ass_df.merge(
        player_id_map,
        on=["Assist_player_code", "date"],
        how="left"
    )

    # Pull minutes/time/position
    wanted = ["player_id", "match_date", "time", "position", "xA"]
    understat_keep = [c for c in wanted if c in understat_df.columns]
    understat_small = understat_df[understat_keep].copy()

    if "player_id" in understat_small.columns and "match_date" in understat_small.columns:
        understat_small = understat_small.drop_duplicates(["player_id", "match_date"])

    Player_ass_df = Player_ass_df.merge(
        understat_small,
        left_on=["understat_player_id", "date"],
        right_on=["player_id", "match_date"],
        how="left"
    )

    # Cleanup merge keys
    drop_cols = [c for c in ["player_id", "match_date"] if c in Player_ass_df.columns]
    if drop_cols:
        Player_ass_df = Player_ass_df.drop(columns=drop_cols)

    # Remove null assist codes
    Player_ass_df = Player_ass_df[Player_ass_df["Assist_player_code"].notna()].copy()

    # ---- Feature engineering (per player, ordered) ----
    Player_ass_df = Player_ass_df.sort_values(["Assist_player_code", "date"]).reset_index(drop=True)
    g = Player_ass_df.groupby("Assist_player_code", group_keys=False)

    # Minutes safe (clip lower 10)
    Player_ass_df["time_safe"] = (
        pd.to_numeric(Player_ass_df["time"], errors="coerce")
        .replace(0, np.nan)
        .clip(lower=20)
    )

    # Clip xg_created upper 1.1
    Player_ass_df["xg_created_clip"] = (
        pd.to_numeric(Player_ass_df["xg_created"], errors="coerce")
        .clip(upper=0.8)
    )
    Player_ass_df["bc_created_clip"] = (
        pd.to_numeric(Player_ass_df["big_chance_created"], errors="coerce")
        .clip(upper=2.8)
    )

    W = 30
    SPAN = 30

    # Rolling rate = sum(x)/sum(mins) over last 25
    Player_ass_df["xg_created_sum_rm25"] = g["xg_created_clip"].apply(
        lambda s: s.rolling(W, min_periods=1).sum()
    )
    Player_ass_df["bc_created_sum_rm25"] = g["bc_created_clip"].apply(
        lambda s: s.rolling(W, min_periods=1).sum()
    )
    Player_ass_df["time_sum_rm25"] = g["time_safe"].apply(
        lambda s: s.rolling(W, min_periods=1).sum()
    )
    Player_ass_df["xg_created_rm25"] = (Player_ass_df["xg_created_sum_rm25"] / Player_ass_df["time_sum_rm25"]) * 90
    Player_ass_df["bc_created_rm25"] = (Player_ass_df["bc_created_sum_rm25"] / Player_ass_df["time_sum_rm25"]) * 90

    # EWM rate = ewma(x)/ewma(mins)
    # (optionally use min_periods=10 to reduce early volatility)
    Player_ass_df["xg_created_mean_ewm25"] = g["xg_created_clip"].apply(
        lambda s: s.ewm(span=SPAN, adjust=False, min_periods=1).mean()
    )
    Player_ass_df["time_mean_ewm25"] = g["time_safe"].apply(
        lambda s: s.rolling(W, min_periods=1).mean()
    )
    Player_ass_df["xg_created_ewm25"] = (Player_ass_df["xg_created_mean_ewm25"] / Player_ass_df["time_mean_ewm25"]) * 90

    # ---- Drop noisy helper columns ----
    helper_cols = [
        "time_safe",
        "xg_created_clip",
        "xg_created_sum_rm25",
        "time_sum_rm25",
        "xg_created_mean_ewm25",
        "time_mean_ewm25",
        "bc_created_sum_rm25",
        "bc_created_clip"
    ]
    Player_ass_df = Player_ass_df.drop(columns=[c for c in helper_cols if c in Player_ass_df.columns])

    Player_ass_df.to_csv("Bronze/Understat_PlayerAssist.csv", index=False)
    return Player_ass_df


import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


def _build_team_feature_df(
    df_shots: pd.DataFrame,
    team_col: str,
    n_clusters: int,
    rolling_window: int,
) -> pd.DataFrame:
    """
    Builds features aggregated by [team_col, date]:
      - Set_Piece_Threat_* (rolling avg)
      - Cluster xG columns (rolling avg)
      - Cluster % shares (cluster RA / total RA)
      - Final_SP_* summary columns

    Returns a dataframe indexed by [team_col, date] with feature columns.
    """
    # --- Cluster xG (ALL situations; clusters already assigned) ---
    cluster_xg = (
        df_shots
        .groupby([team_col, "date", "xy_cluster"], as_index=False)
        .agg(cluster_xg=("xG", "sum"))
    )

    cluster_xg_wide = (
        cluster_xg
        .pivot_table(
            index=[team_col, "date"],
            columns="xy_cluster",
            values="cluster_xg",
            fill_value=0
        )
        .reset_index()
    )

    cluster_cols = []
    for col in list(cluster_xg_wide.columns):
        if isinstance(col, (int, np.integer)):
            new_name = f"Shot_Threat_Cluster_{int(col)}"
            cluster_xg_wide = cluster_xg_wide.rename(columns={col: new_name})
            cluster_cols.append(new_name)

    # --- Set piece threat (Situation-only; independent of clusters) ---
    set_piece_threat = (
        df_shots[df_shots["situation"].isin(["FromCorner", "SetPiece"])]
        .groupby([team_col, "date"], as_index=False)
        .agg(Set_Piece_Threat=("xG", "sum"))
    )

    # --- Merge ---
    feat = cluster_xg_wide.merge(
        set_piece_threat,
        on=[team_col, "date"],
        how="left"
    ).fillna({"Set_Piece_Threat": 0})

    # Ensure all clusters exist
    for c in cluster_cols:
        if c not in feat.columns:
            feat[c] = 0.0

    # --- Rolling averages per team ---
    feat = feat.sort_values([team_col, "date"]).reset_index(drop=True)

    roll_base_cols = ["Set_Piece_Threat"] + cluster_cols
    ra_cols = []
    for c in roll_base_cols:
        ra = f"{c}_RA{rolling_window}"
        feat[ra] = feat.groupby(team_col)[c].transform(
            lambda s: s.rolling(rolling_window, min_periods=1).mean()
        )
        ra_cols.append(ra)

    # --- Total cluster threat + rolling ---
    feat["Total_Shot_Threat"] = feat[cluster_cols].sum(axis=1)
    total_ra = f"Total_Shot_Threat_RA{rolling_window}"
    feat[total_ra] = feat.groupby(team_col)["Total_Shot_Threat"].transform(
        lambda s: s.rolling(rolling_window, min_periods=1).mean()
    )

    # --- Percent shares (IMPORTANT: cluster % are comparable with each other; set-piece % is a subset share) ---
    den = feat[total_ra].replace(0, np.nan)

    # Cluster shares (sum to ~1)
    for c in cluster_cols:
        ra = f"{c}_RA{rolling_window}"
        feat[f"{ra}_pct"] = feat[ra] / den

    # Set-piece share of total (independent)
    sp_ra = f"Set_Piece_Threat_RA{rolling_window}"
    feat[f"{sp_ra}_pct"] = feat[sp_ra] / den

    # --- Your final SP features (using RA and its share) ---
    feat["Final_SP_Threat"] = feat[sp_ra] * 0.5 + 0.5 * feat[f"{sp_ra}_pct"].fillna(0)
    feat["Final_SP"] = 1 + ((feat["Final_SP_Threat"] - 0.25) / 0.25)

    # Keep a tidy set of output columns
    out_cols = [team_col, "date", sp_ra, f"{sp_ra}_pct", "Final_SP_Threat", "Final_SP", total_ra]
    out_cols += [f"Shot_Threat_Cluster_{i}_RA{rolling_window}" for i in range(n_clusters)]
    out_cols += [f"Shot_Threat_Cluster_{i}_RA{rolling_window}_pct" for i in range(n_clusters)]

    # Some clusters might not appear; ensure the columns exist
    for col in out_cols:
        if col not in feat.columns:
            feat[col] = 0.0

    return feat[out_cols]


def GenerateTeamShots(
    csv_path="Bronze/Understat_shots.csv",
    n_clusters=5,
    rolling_window=20,
    random_state=42,
):
    # -----------------------------
    # Load + select columns
    # -----------------------------
    shots_data = pd.read_csv(csv_path)

    columns = [
        "player_name", "result", "X", "Y", "xG", "h_a", "situation", "shotType",
        "h_team", "a_team", "h_goals", "a_goals", "date", "lastAction",
        "team_title", "own_team", "opponent_team", "distance_m", "angle", "big_chance"
    ]
    shots_data = shots_data[columns].copy()

    # Keep only rows where team_title matches own_team OR opponent_team (row-wise consistency)
    filtered = shots_data[
        (shots_data["team_title"] == shots_data["own_team"]) |
        (shots_data["team_title"] == shots_data["opponent_team"])
    ].copy()

    # Ensure numeric types for clustering features and xG
    for c in ["distance_m", "angle", "xG"]:
        filtered[c] = pd.to_numeric(filtered[c], errors="coerce")

    # Ensure date is datetime
    filtered["date"] = pd.to_datetime(filtered["date"], errors="coerce")

    # Drop rows missing essentials
    filtered = filtered.dropna(subset=["own_team", "opponent_team", "date", "distance_m", "angle", "xG"]).copy()

    # -----------------------------
    # Train clusters ONCE (ALL shots)
    # -----------------------------
    XY = filtered[["distance_m", "angle"]].values
    scaler = StandardScaler()
    XY_scaled = scaler.fit_transform(XY)

    kmeans = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=20)
    filtered["xy_cluster"] = kmeans.fit_predict(XY_scaled)

    # Cluster centers (original scale)
    centers = scaler.inverse_transform(kmeans.cluster_centers_)
    centers_df = pd.DataFrame(centers, columns=["distance_center", "angle_center"])
    centers_df["cluster"] = centers_df.index

    # -----------------------------
    # Build features for BOTH perspectives
    #   - Against: aggregate by opponent_team (shots conceded)
    #   - For:     aggregate by own_team (shots taken)
    # -----------------------------
    against_df = _build_team_feature_df(
        df_shots=filtered,
        team_col="opponent_team",
        n_clusters=n_clusters,
        rolling_window=rolling_window,
    )

    for_df = _build_team_feature_df(
        df_shots=filtered,
        team_col="own_team",
        n_clusters=n_clusters,
        rolling_window=rolling_window,
    )

    # Rename key so we can merge to one row per team/date
    against_df = against_df.rename(columns={"opponent_team": "team"}).copy()
    for_df = for_df.rename(columns={"own_team": "team"}).copy()

    # Prefix feature columns to avoid collisions
    key_cols = {"team", "date"}
    against_df = against_df.rename(columns={c: f"AGAINST_{c}" for c in against_df.columns if c not in key_cols})
    for_df = for_df.rename(columns={c: f"FOR_{c}" for c in for_df.columns if c not in key_cols})

    # Merge: one row has both FOR_ and AGAINST_ features
    merged = (
        for_df
        .merge(against_df, on=["team", "date"], how="outer")
        .sort_values(["team", "date"])
        .reset_index(drop=True)
        .fillna(0)
    )

    return merged, filtered, centers_df, kmeans, scaler




def Generate_Shots_data(Understat_data,shots_path,player_path,team_path):
    mapping = Understat_Team_MAP
    Understat_data=Understat_data

    shots_df = ShotsData(shots_path)

    match_df = build_player_match_table(
        shots_df,
        mapping=mapping,
        min_score=0.47,      # raise this if too many bad matches
        prefer_recall=True,
        player_path=player_path,
        team_path=team_path
    )



    match_best = reduce_match_table(match_df)
    extra_row = pd.DataFrame([{
        "player_id": 9024,
        "understat_player": "Yeremi Pino",
        "player_code": 488024,
        "match_score": 1.0,
        "matched_name": "Yéremy Pino Santos",
        "matched_from": "web_name",      # or "forced" (recommended)
        "team_norm": "crystal palace",   # normalized team name
    }])

    match_best = pd.concat([match_best, extra_row], ignore_index=True)
    shots_df2 = attach_codes_via_match_table(shots_df, match_best)

    shots_df2.to_csv("Bronze/Understat_shots.csv", index=False)
    match_best.to_csv("Bronze/Understat_Player_match_table_best.csv", index=False)
    Player_shots (Understat_data)
    Player_assists(Understat_data)
    
    merged_df, filtered, centers_df, kmeans, scaler = GenerateTeamShots(
        csv_path="Bronze/Understat_shots.csv",
        n_clusters=5,
        rolling_window=20
    )
    merged_df.to_csv("Bronze/Understat_Teamshots.csv")




