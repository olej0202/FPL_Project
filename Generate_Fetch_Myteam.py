import requests
import pandas as pd
from typing import Optional

BASE_URL = "https://fantasy.premierleague.com/api"


# ---------- Simple helpers ----------

def fetch_json(url: str):
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


def get_bootstrap():
    return fetch_json(f"{BASE_URL}/bootstrap-static/")


def get_entry_history(entry_id: int):
    return fetch_json(f"{BASE_URL}/entry/{entry_id}/history/")


def get_entry_transfers(entry_id: int):
    return fetch_json(f"{BASE_URL}/entry/{entry_id}/transfers/")


def get_entry_picks(entry_id: int, event_id: int):
    return fetch_json(f"{BASE_URL}/entry/{entry_id}/event/{event_id}/picks/")


def get_element_summary(element_id: int):
    return fetch_json(f"{BASE_URL}/element-summary/{element_id}/")


# ---------- Lookups & helpers ----------

def build_lookups(bootstrap):
    elements = {e["id"]: e for e in bootstrap["elements"]}
    teams = {t["id"]: t["name"] for t in bootstrap["teams"]}
    positions = {p["id"]: p["singular_name_short"] for p in bootstrap["element_types"]}
    events = bootstrap["events"]
    events_by_id = {e["id"]: e for e in events}
    return elements, teams, positions, events, events_by_id


def choose_event(events):
    """
    Prefer current GW, fall back to next, else last.
    """
    gw = next((e for e in events if e.get("is_current")), None)
    if gw is None:
        gw = next((e for e in events if e.get("is_next")), events[-1])
    return gw


def get_most_recent_finished_event_id(events, before_event_id: int) -> Optional[int]:
    finished_prior = [e["id"] for e in events if e["id"] < before_event_id and e.get("finished")]
    return max(finished_prior) if finished_prior else None


def resolve_squad_event_id(entry_id: int, event_id: int, events, include_freehit_team: bool) -> int:
    """
    If this GW is a Free Hit GW and include_freehit_team=False, return the last
    finished GW before it (the underlying squad). Otherwise return event_id.
    """
    picks_data = get_entry_picks(entry_id, event_id)
    active_chip = picks_data.get("active_chip")

    if active_chip == "freehit" and not include_freehit_team:
        prev_finished = get_most_recent_finished_event_id(events, event_id)
        if prev_finished is not None:
            return prev_finished
        return max(1, event_id )

    return event_id


def compute_free_transfers(
    history_current,
    chips_by_event,
    max_ft: int = 5,
    afcon_topup_event: Optional[int] = 16,
):
    """
    Reconstruct free transfers per GW using the 2025/26 rules.

    (Kept as you wrote, just organized and returned as before.)
    """
    history_sorted = sorted(history_current, key=lambda row: row["event"])
    result: dict[int, dict[str, int]] = {}

    if not history_sorted:
        return result

    first_event = history_sorted[0]["event"]
    prev_end_ft = 0
    prev_chip_name: Optional[str] = None

    for row in history_sorted:
        event_id = row["event"]
        event_transfers = row["event_transfers"]
        chip_name = chips_by_event.get(event_id)

        # --- 1) Determine free_start for this GW ---
        if event_id == first_event:
            if afcon_topup_event is not None and event_id == afcon_topup_event:
                free_start = max_ft
            else:
                free_start = 1
        else:
            if prev_chip_name is not None:
                base_start = prev_end_ft      # no +1 after chip GW
            else:
                base_start = prev_end_ft + 1  # standard +1

            free_start = min(max_ft, base_start)

            if afcon_topup_event is not None and event_id == afcon_topup_event:
                free_start = max_ft

        # --- 2) Determine free_end for this GW ---
        if chip_name is not None:
            free_end = free_start
        elif afcon_topup_event is not None and event_id == afcon_topup_event:
            free_end = max_ft
        else:
            free_used = min(event_transfers, free_start)
            free_end = free_start - free_used

        result[event_id] = {"free_start": free_start, "free_end": free_end}

        prev_end_ft = free_end
        prev_chip_name = chip_name

    return result


def reconstruct_purchase_prices_for_season(
    entry_id: int,
    history_current,
    transfers,
    elements,
    freehit_gws: Optional[set[int]] = None,
):
    """
    Return {element_id: purchase_price_tenths} for the current underlying squad.

    Key adjustment:
    - Ignore transfers made in Free Hit GWs, because they are temporary.
    """
    freehit_gws = freehit_gws or set()

    first_event_id = min(row["event"] for row in history_current)

    # Initial squad at that time
    initial_picks = get_entry_picks(entry_id, first_event_id)["picks"]

    team_purchase: dict[int, int] = {}

    for pick in initial_picks:
        elem_id = pick["element"]
        es = get_element_summary(elem_id)
        hist = es.get("history", [])
        price_row = next((h for h in hist if h["round"] == first_event_id), None)
        if price_row is not None:
            cost_tenths = price_row["value"]
        else:
            cost_tenths = elements[elem_id]["now_cost"]
        team_purchase[elem_id] = cost_tenths

    transfers_sorted = sorted(transfers, key=lambda t: (t.get("event", 0), t.get("time", "")))

    for tr in transfers_sorted:
        ev = tr.get("event")
        if ev is None or ev < first_event_id:
            continue

        # Ignore temporary FH transfers (some seasons/endpoints include them)
        if ev in freehit_gws:
            continue
        if tr.get("chip") == "freehit":  # extra safety if present
            continue

        element_in = tr["element_in"]
        element_out = tr["element_out"]
        in_cost = tr["element_in_cost"]

        if element_out in team_purchase:
            del team_purchase[element_out]

        team_purchase[element_in] = in_cost

    return team_purchase


# ---------- Main: build DataFrame ----------

def build_team_dataframe(entry_id: int, include_freehit_team: bool = False) -> pd.DataFrame:
    """
    include_freehit_team:
      - False (default): if current/next GW is FH, return the underlying real squad
      - True: return FH squad for that GW
    """
    # Global data
    bootstrap = get_bootstrap()
    elements, teams, positions, events, events_by_id = build_lookups(bootstrap)
    current_gw = choose_event(events)
    event_id = current_gw["id"]

    # Entry history
    history = get_entry_history(entry_id)
    history_current = history["current"]
    chips_list = history.get("chips", [])
    chips_by_event = {c["event"]: c["name"] for c in chips_list}

    # Rank progress
    rank_progress = [
        row["overall_rank"]
        for row in sorted(history_current, key=lambda r: r["event"])
        if row.get("overall_rank") is not None
    ]

    # Chip GWs
    wildcard_gws = [c["event"] for c in chips_list if c["name"] == "wildcard"]
    freehit_gws = [c["event"] for c in chips_list if c["name"] == "freehit"]
    benchboost_gws = [c["event"] for c in chips_list if c["name"] == "bboost"]
    tc_gws = [c["event"] for c in chips_list if c["name"] == "3xc"]

    # Row for this GW
    hist_row = next((h for h in history_current if h["event"] == event_id), None)
    if hist_row is None:
        raise RuntimeError(
            f"No history row for event {event_id}. This can happen very early pre-season."
        )

    bank_tenths = hist_row["bank"]
    bank_million = bank_tenths / 10.0

    # Free transfers
    ft_info = compute_free_transfers(
        history_current,
        chips_by_event,
        max_ft=5,
        afcon_topup_event=15,
    )
    print(ft_info)
    this_ft = ft_info[event_id]

    # NOTE: your original code used free_end as "start". That looked inverted.
    # We'll use free_start as "FTs available at start of GW".
    free_start = this_ft["free_end"]

    # keep your original saved_transfers shape

    saved_transfers = min(max(free_start, 0), 4)
    
    if(free_start==0):
        saved_transfers=0
    elif(free_start==1):
        saved_transfers=1
    
    

    # Transfer history to reconstruct purchase prices (ignore FH transfers)
    transfers = get_entry_transfers(entry_id)
    team_purchase_prices = reconstruct_purchase_prices_for_season(
        entry_id,
        history_current,
        transfers,
        elements,
        freehit_gws=set(freehit_gws),
    )

    # Decide which picks to use (FH vs underlying)
    squad_event_id = resolve_squad_event_id(entry_id, event_id, events, include_freehit_team)

    picks_data = get_entry_picks(entry_id, squad_event_id)
    picks = picks_data["picks"]

    rows = []

    for pick in sorted(picks, key=lambda p: p["position"]):
        elem_id = pick["element"]
        player = elements[elem_id]

        player_name = f"{player['first_name']} {player['second_name']}"
        team_name = teams[player["team"]]
        pos_name = positions[player["element_type"]]

        purchase_tenths = team_purchase_prices.get(elem_id, player["now_cost"])
        now_tenths = player["now_cost"]

        # Official sell rule (half the profit, floored)
        if now_tenths > purchase_tenths:
            profit = now_tenths - purchase_tenths
            sell_tenths = purchase_tenths + profit // 2
        else:
            sell_tenths = now_tenths

        sell_price_m = sell_tenths / 10.0

        rows.append(
            {
                "player_name": player_name,
                "player_id": elem_id,
                "team": team_name,
                "position": pos_name,
                "selling_price_m": sell_price_m,
                "gw": event_id,                 # the GW you're "viewing"
                "squad_gw_used": squad_event_id, # the GW used for picks
                "money_in_bank_m": bank_million,
                "saved_transfers": saved_transfers,
                "rank_progress": rank_progress,
                "wildcard_gws": wildcard_gws,
                "freehit_gws": freehit_gws,
                "benchboost_gws": benchboost_gws,
                "tc_gws": tc_gws,
                "active_chip_view_gw": get_entry_picks(entry_id, event_id).get("active_chip"),
            }
        )

    df = pd.DataFrame(rows)
    return enrich(df)



def enrich(df: pd.DataFrame) -> pd.DataFrame:
    enrich_df = pd.read_csv("Raw_Data_25/current_players.csv")[
        ["id", "name", "code", "now_cost", "selected_by_percent", "web_name", "news"]
    ]

    merged_df = (
        df.merge(enrich_df, left_on="player_id", right_on="id", how="left")
          .drop(columns=["id"])
    )

    merged_df["photo"] = (
        "https://resources.premierleague.com/premierleague25/photos/players/500x500/"
        + merged_df["code"].astype(str)
        + ".png"
    )
    merged_df["news"] = merged_df["news"].fillna("NoNews")
    return merged_df


