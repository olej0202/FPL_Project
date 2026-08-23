import requests
import pandas as pd
from typing import Optional, Dict, Any
from GenerateConfig import current_season

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


def try_get_entry_picks(entry_id: int, event_id: int):
    try:
        return get_entry_picks(entry_id, event_id)
    except requests.HTTPError as exc:
        response = getattr(exc, "response", None)
        if response is not None and response.status_code == 404:
            return None
        raise


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


def choose_planning_event(events):
    """
    Choose the GW the manager can currently make changes for.

    - If a next GW exists, that is the active planning target.
    - Otherwise fall back to the current GW.
    - As a final fallback, use the last listed event.
    """
    gw = next((e for e in events if e.get("is_next")), None)
    if gw is None:
        gw = next((e for e in events if e.get("is_current")), events[-1])
    return gw


def get_most_recent_finished_event_id(events, before_event_id: int) -> Optional[int]:
    finished_prior = [e["id"] for e in events if e["id"] < before_event_id and e.get("finished")]
    return max(finished_prior) if finished_prior else None


def resolve_squad_event_id(
    entry_id: int,
    event_id: int,
    events,
    include_freehit_team: bool,
    picks_data: Optional[Dict[str, Any]] = None,
) -> int:
    """
    If this GW is a Free Hit GW and include_freehit_team=False, return the last
    finished GW before it (the underlying squad). Otherwise return event_id.
    """
    if picks_data is None:
        picks_data = try_get_entry_picks(entry_id, event_id)
    if picks_data is None:
        current_event = next((e for e in events if e.get("is_current")), None)
        if current_event is not None:
            return int(current_event["id"])
        prev_finished = get_most_recent_finished_event_id(events, event_id)
        if prev_finished is not None:
            return prev_finished
        return max(1, int(event_id))

    active_chip = picks_data.get("active_chip")

    if active_chip == "freehit" and not include_freehit_team:
        current_event = next((e for e in events if e.get("is_current")), None)
        current_event_id = None if current_event is None else int(current_event["id"])

        # If the next GW is a Free Hit while the current GW is in progress,
        # the underlying squad to restore to is the current GW squad.
        if current_event_id is not None and int(event_id) > current_event_id:
            return current_event_id

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
) -> Dict[int, Dict[str, int]]:
    """
    Your requested rules:

    - event_start for the first played event is 1
    - For each round:
        free_end = min(
            5,
            free_start - 1                        if chip_name in (wildcard, freehit)
            else free_start - event_transfers
        )
      (and clamp to >= 0)
    - Next round:
        free_start[next] = min(5, free_end_prev + 1)

    - Optional: AFCON top-up event sets free_start = max_ft for that event (if provided).
      (kept because your function signature includes it)
    """
    history_sorted = sorted(history_current, key=lambda row: row["event"])
    result: Dict[int, Dict[str, int]] = {}

    if not history_sorted:
        return result

    first_event = int(history_sorted[0]["event"])

    prev_free_end = 0  # free_end from previous event

    for row in history_sorted:
        event_id = int(row["event"])
        event_transfers = int(row.get("event_transfers", 0) or 0)
        chip_name = chips_by_event.get(event_id)

        # --- free_start for this GW ---
        if event_id == first_event:
            free_start = 1
        else:
            free_start = min(max_ft, prev_free_end + 1)

        # AFCON top-up override (if you want it)
        if afcon_topup_event is not None and event_id == afcon_topup_event:
            free_start = max_ft

        # --- free_end for this GW ---
        if event_id == first_event:
            # Before the first deadline, transfers are free and do not create a
            # carried transfer for the following GW.
            free_end = 0
        elif chip_name in ("wildcard", "freehit"):
            free_end = free_start - 1
        else:
            free_end = free_start - event_transfers

        # clamp and cap
        free_end = max(0, min(max_ft, free_end))

        result[event_id] = {"free_start": int(free_start), "free_end": int(free_end)}

        prev_free_end = free_end

    return result


def count_confirmed_transfers_for_event(
    transfers,
    event_id: int,
) -> int:
    count = 0
    for tr in transfers:
        tr_event = tr.get("event")
        if tr_event is None:
            continue
        if int(tr_event) != int(event_id):
            continue
        if tr.get("chip") in ("wildcard", "freehit"):
            continue
        count += 1
    return count


def compute_planning_transfer_state(
    history_current,
    chips_by_event,
    transfers,
    target_event_id: int,
    active_chip: Optional[str] = None,
    max_ft: int = 5,
    afcon_topup_event: Optional[int] = 16,
) -> Dict[str, Any]:
    ft_info = compute_free_transfers(
        history_current,
        chips_by_event,
        max_ft=max_ft,
        afcon_topup_event=afcon_topup_event,
    )

    target_event_id = int(target_event_id)
    history_events = sorted(int(row["event"]) for row in history_current)

    if target_event_id in ft_info:
        free_start = int(ft_info[target_event_id]["free_start"])
    elif history_events:
        previous_event = max((ev for ev in history_events if ev < target_event_id), default=None)
        if previous_event is None:
            free_start = 1
        else:
            free_start = min(max_ft, int(ft_info[previous_event]["free_end"]) + 1)
    else:
        free_start = 1

    if afcon_topup_event is not None and target_event_id == afcon_topup_event:
        free_start = max_ft

    chip_name = active_chip or chips_by_event.get(target_event_id)
    if chip_name in ("wildcard", "freehit"):
        pending_transfers = 0
        free_remaining = free_start
    else:
        pending_transfers = count_confirmed_transfers_for_event(transfers, target_event_id)
        free_remaining = max(0, free_start - pending_transfers)

    optimizer_saved_transfers = max(-1, min(4, free_remaining - 1))

    return {
        "free_start": int(free_start),
        "free_remaining": int(free_remaining),
        "pending_transfers": int(pending_transfers),
        "saved_transfers": int(optimizer_saved_transfers),
        "chip_name": chip_name,
        "ft_info": ft_info,
    }


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
    planning_gw = choose_planning_event(events)
    event_id = int(planning_gw["id"])
    current_event = next((e for e in events if e.get("is_current")), None)
    current_event_id = None if current_event is None else int(current_event["id"])
    fallback_event_id = current_event_id if current_event_id is not None else event_id

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

    transfers = get_entry_transfers(entry_id)
    planning_picks_data = try_get_entry_picks(entry_id, event_id)
    planning_picks_event_id = event_id
    if planning_picks_data is None and fallback_event_id != event_id:
        planning_picks_data = get_entry_picks(entry_id, fallback_event_id)
        planning_picks_event_id = fallback_event_id
    if planning_picks_data is None:
        raise RuntimeError(
            f"Could not fetch picks for planning event {event_id} or fallback event {fallback_event_id}."
        )
    active_chip = planning_picks_data.get("active_chip")
    if planning_picks_event_id != event_id:
        active_chip = chips_by_event.get(event_id)

    # Row for this GW, if it already exists in entry history.
    hist_row = next((h for h in history_current if h["event"] == event_id), None)
    planning_entry_history = planning_picks_data.get("entry_history") or {}
    if hist_row is not None:
        bank_tenths = hist_row["bank"]
    elif "bank" in planning_entry_history and planning_entry_history["bank"] is not None:
        bank_tenths = planning_entry_history["bank"]
    elif history_current:
        bank_tenths = sorted(history_current, key=lambda r: int(r["event"]))[-1]["bank"]
    else:
        raise RuntimeError(
            f"No history row or planning entry history found for event {event_id}."
        )
    bank_million = bank_tenths / 10.0

    transfer_state = compute_planning_transfer_state(
        history_current,
        chips_by_event,
        transfers,
        event_id,
        active_chip=active_chip,
        max_ft=5,
        afcon_topup_event=16,
    )
    print(transfer_state["ft_info"])
    saved_transfers = int(transfer_state["saved_transfers"])
    free_transfers_available = int(transfer_state["free_remaining"])
    pending_transfers = int(transfer_state["pending_transfers"])

    # Transfer history to reconstruct purchase prices (ignore FH transfers)
    team_purchase_prices = reconstruct_purchase_prices_for_season(
        entry_id,
        history_current,
        transfers,
        elements,
        freehit_gws=set(freehit_gws),
    )

    # Decide which picks to use (FH vs underlying)
    squad_event_id = resolve_squad_event_id(
        entry_id,
        event_id,
        events,
        include_freehit_team,
        picks_data=planning_picks_data if planning_picks_event_id == event_id else None,
    )

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
                "free_transfers_available": free_transfers_available,
                "pending_transfers": pending_transfers,
                "rank_progress": rank_progress,
                "wildcard_gws": wildcard_gws,
                "freehit_gws": freehit_gws,
                "benchboost_gws": benchboost_gws,
                "tc_gws": tc_gws,
                "active_chip_view_gw": active_chip,
            }
        )

    df = pd.DataFrame(rows)
    return enrich(df)



def enrich(df: pd.DataFrame) -> pd.DataFrame:
    enrich_df = pd.read_csv(f"Raw_Data_{current_season}/current_players.csv")[
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
