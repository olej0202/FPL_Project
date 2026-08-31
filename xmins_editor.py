from __future__ import annotations

import json
import sys
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import pandas as pd
except ModuleNotFoundError as exc:
    if exc.name == "pandas":
        raise SystemExit(
            "This tool requires pandas. Run it with your project venv, for example:\n"
            r"venv\Scripts\python.exe xmins_editor.py"
        ) from exc
    raise


HOST = "127.0.0.1"
PORT = 8765
CSV_PATH = Path(__file__).resolve().parent / "GenerateXmins2.csv"
BACKUP_PATH = CSV_PATH.with_name(f"{CSV_PATH.stem}.backup{CSV_PATH.suffix}")
SNAPSHOT_PATH = CSV_PATH.with_name(f"{CSV_PATH.stem}.weekly_snapshot.json")
PREVIOUS_SNAPSHOT_PATH = CSV_PATH.with_name(f"{CSV_PATH.stem}.weekly_snapshot_prev.json")


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Xmins Editor</title>
  <style>
    :root {
      --bg: #f3efe6;
      --panel: #fffaf0;
      --line: #d7c9aa;
      --text: #2d261c;
      --muted: #7a6d57;
      --accent: #1f6f5f;
      --accent-2: #b4682d;
      --dirty: #fff0b8;
      --shadow: 0 18px 40px rgba(61, 44, 13, 0.12);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(180, 104, 45, 0.10), transparent 30%),
        linear-gradient(180deg, #f8f4ea 0%, var(--bg) 100%);
      color: var(--text);
    }

    .shell {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    .hero {
      background: linear-gradient(135deg, rgba(31,111,95,0.92), rgba(180,104,45,0.86));
      color: white;
      border-radius: 20px;
      padding: 24px 28px;
      box-shadow: var(--shadow);
    }

    .hero h1 {
      margin: 0 0 8px;
      font-size: 34px;
      line-height: 1.05;
    }

    .hero p {
      margin: 0;
      font-size: 16px;
      max-width: 900px;
      color: rgba(255,255,255,0.88);
    }

    .toolbar {
      margin-top: 20px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: end;
      box-shadow: var(--shadow);
    }

    .field {
      min-width: 180px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }

    select, button, input[type="search"] {
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      padding: 8px 12px;
      font-size: 15px;
    }

    button {
      cursor: pointer;
      font-weight: 700;
      transition: transform 0.12s ease, opacity 0.12s ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { cursor: not-allowed; opacity: 0.5; transform: none; }

    .primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    .secondary {
      background: white;
      color: var(--accent-2);
      border-color: var(--line);
    }

    .mini-btn {
      min-height: 30px;
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 999px;
    }

    .statusbar {
      margin-top: 16px;
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
    }

    .table-wrap {
      margin-top: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 12px;
      box-shadow: var(--shadow);
      overflow: auto;
      max-height: 72vh;
    }

    table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      min-width: 800px;
    }

    thead th {
      position: sticky;
      top: 0;
      background: #f5ead4;
      z-index: 2;
    }

    th, td {
      border-bottom: 1px solid #e7dcc5;
      padding: 10px 12px;
      text-align: center;
      font-size: 14px;
    }

    th:first-child, td:first-child {
      position: sticky;
      left: 0;
      text-align: left;
      background: #fffaf0;
      z-index: 1;
      min-width: 220px;
    }

    thead th:first-child {
      background: #f5ead4;
      z-index: 3;
    }

    tbody tr:hover td {
      background: rgba(180,104,45,0.05);
    }

    .cell-input {
      width: 92px;
      min-height: 36px;
      border-radius: 10px;
      border: 1px solid #dbcda8;
      background: white;
      text-align: right;
      padding: 6px 10px;
      font-size: 14px;
      color: var(--text);
    }

    .cell-input.dirty {
      background: var(--dirty);
      border-color: #d3a92f;
    }

    .cell-stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }

    .cell-meta {
      font-size: 11px;
      line-height: 1.2;
      color: var(--muted);
      min-height: 14px;
      white-space: nowrap;
    }

    .name-cell {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }

    .name-title {
      font-weight: 700;
    }

    .row-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .empty {
      padding: 32px;
      text-align: center;
      color: var(--muted);
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>GenerateXmins2 Editor</h1>
      <p>Filter by team code, review <code>Final_minutes_Adjusted</code> in a GW pivot, edit cells, and save directly back to <code>GenerateXmins2.csv</code>.</p>
    </section>

    <section class="toolbar">
      <div class="field">
        <label for="team-select">Team Code</label>
        <select id="team-select"></select>
      </div>

      <div class="field">
        <label for="name-filter">Name Filter</label>
        <input id="name-filter" type="search" placeholder="Filter players..." />
      </div>

      <div class="field">
        <button id="reload-btn" class="secondary">Reload CSV</button>
      </div>

      <div class="field">
        <button id="apply-current-team-btn" class="secondary">Use Current Team</button>
      </div>

      <div class="field">
        <button id="apply-last-team-btn" class="secondary">Use Last Week Team</button>
      </div>

      <div class="field">
        <button id="save-btn" class="primary" disabled>Save Changes</button>
      </div>
    </section>

    <div class="statusbar">
      <span id="status-text">Loading...</span>
      <span id="dirty-count">0 pending edits</span>
      <span id="snapshot-text">No saved weekly edit yet.</span>
    </div>

    <section class="table-wrap">
      <div id="table-container" class="empty">Loading table...</div>
    </section>
  </div>

  <script>
    const state = {
      meta: null,
      currentTeam: "",
      rows: [],
      gws: [],
      dirty: new Map(),
      nameFilter: "",
      snapshotLabel: "No saved weekly edit yet.",
    };

    function setStatus(message) {
      document.getElementById("status-text").textContent = message;
    }

    function updateDirtyCount() {
      const count = state.dirty.size;
      document.getElementById("dirty-count").textContent = `${count} pending edit${count === 1 ? "" : "s"}`;
      document.getElementById("save-btn").disabled = count === 0;
    }

    function updateSnapshotText() {
      document.getElementById("snapshot-text").textContent = state.snapshotLabel;
    }

    function updateTeamButtons() {
      const hasRows = state.rows.length > 0;
      const hasLastWeek = state.rows.some(row => row.last_week_available);
      document.getElementById("apply-current-team-btn").disabled = !hasRows;
      document.getElementById("apply-last-team-btn").disabled = !hasLastWeek;
    }

    async function fetchJson(url, options = {}) {
      const response = await fetch(url, options);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Request failed");
      }
      return payload;
    }

    async function loadMeta() {
      const meta = await fetchJson("/api/meta");
      state.meta = meta;
      state.snapshotLabel = meta.snapshot?.label || "No saved weekly edit yet.";
      updateSnapshotText();
      const teamSelect = document.getElementById("team-select");
      teamSelect.innerHTML = "";
      for (const team of meta.teams) {
        const option = document.createElement("option");
        option.value = team.team_code;
        option.textContent = `${team.team_code} (${team.players} players)`;
        teamSelect.appendChild(option);
      }
      state.currentTeam = meta.teams.length ? meta.teams[0].team_code : "";
      teamSelect.value = state.currentTeam;
    }

    async function loadTable() {
      if (!state.currentTeam) {
        document.getElementById("table-container").innerHTML = '<div class="empty">No team codes found.</div>';
        return;
      }
      setStatus(`Loading team ${state.currentTeam}...`);
      const payload = await fetchJson(`/api/pivot?team_code=${encodeURIComponent(state.currentTeam)}`);
      state.rows = payload.rows;
      state.gws = payload.gws;
      renderTable();
      updateTeamButtons();
      setStatus(`Loaded team ${state.currentTeam}.`);
    }

    function applyCellValue(row, gw, targetValue) {
      const key = `${state.currentTeam}||${row.name}||${gw}`;
      const baseValue = row.values[gw];
      if (targetValue === null || targetValue === undefined || targetValue === "" || Number(targetValue) === Number(baseValue)) {
        state.dirty.delete(key);
        return;
      }
      state.dirty.set(key, Number(targetValue));
    }

    function applyRowSource(row, source) {
      for (const gw of state.gws) {
        const key = `${state.currentTeam}||${row.name}||${gw}`;
        if (source === "current") {
          state.dirty.delete(key);
          continue;
        }

        const shiftedValue = row.last_week_values?.[gw];
        if (shiftedValue === null || shiftedValue === undefined) {
          state.dirty.delete(key);
          continue;
        }
        applyCellValue(row, gw, shiftedValue);
      }

      renderTable();
      setStatus(
        source === "current"
          ? `Kept current xmins values for ${row.name}.`
          : `Applied shifted last-week edit for ${row.name}.`
      );
    }

    function applyTeamSource(source) {
      for (const row of state.rows) {
        for (const gw of state.gws) {
          const key = `${state.currentTeam}||${row.name}||${gw}`;
          if (source === "current") {
            state.dirty.delete(key);
            continue;
          }

          const shiftedValue = row.last_week_values?.[gw];
          if (shiftedValue === null || shiftedValue === undefined) {
            state.dirty.delete(key);
            continue;
          }
          applyCellValue(row, gw, shiftedValue);
        }
      }

      renderTable();
      setStatus(
        source === "current"
          ? `Kept current xmins values for all players in team ${state.currentTeam}.`
          : `Applied shifted last-week edit for team ${state.currentTeam}.`
      );
    }

    function renderTable() {
      const container = document.getElementById("table-container");
      const filteredRows = state.rows.filter(row =>
        row.name.toLowerCase().includes(state.nameFilter.toLowerCase())
      );

      if (!filteredRows.length) {
        container.innerHTML = '<div class="empty">No rows match the current filter.</div>';
        return;
      }

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      const nameTh = document.createElement("th");
      nameTh.textContent = "Name";
      headRow.appendChild(nameTh);

      for (const gw of state.gws) {
        const th = document.createElement("th");
        th.textContent = `GW ${gw}`;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const row of filteredRows) {
        const tr = document.createElement("tr");

        const nameTd = document.createElement("td");
        const nameWrap = document.createElement("div");
        nameWrap.className = "name-cell";

        const nameTitle = document.createElement("div");
        nameTitle.className = "name-title";
        nameTitle.textContent = row.name;
        nameWrap.appendChild(nameTitle);

        const rowActions = document.createElement("div");
        rowActions.className = "row-actions";

        const currentBtn = document.createElement("button");
        currentBtn.type = "button";
        currentBtn.className = "secondary mini-btn";
        currentBtn.textContent = "Use current";
        currentBtn.addEventListener("click", () => applyRowSource(row, "current"));
        rowActions.appendChild(currentBtn);

        const lastWeekBtn = document.createElement("button");
        lastWeekBtn.type = "button";
        lastWeekBtn.className = "secondary mini-btn";
        lastWeekBtn.textContent = "Use last week";
        lastWeekBtn.disabled = !row.last_week_available;
        lastWeekBtn.addEventListener("click", () => applyRowSource(row, "lastWeek"));
        rowActions.appendChild(lastWeekBtn);

        nameWrap.appendChild(rowActions);
        nameTd.appendChild(nameWrap);
        tr.appendChild(nameTd);

        for (const gw of state.gws) {
          const td = document.createElement("td");
          const stack = document.createElement("div");
          stack.className = "cell-stack";
          const input = document.createElement("input");
          input.type = "number";
          input.step = "0.01";
          input.min = "0";
          input.max = "90";
          input.className = "cell-input";
          const key = `${state.currentTeam}||${row.name}||${gw}`;
          const currentValue = state.dirty.has(key) ? state.dirty.get(key) : row.values[gw];
          input.value = currentValue ?? "";
          if (state.dirty.has(key)) {
            input.classList.add("dirty");
          }
          input.addEventListener("input", () => {
            const normalized = input.value === "" ? "" : Number(input.value);
            if (normalized === row.values[gw] || input.value === "") {
              state.dirty.delete(key);
              input.classList.remove("dirty");
            } else {
              state.dirty.set(key, normalized);
              input.classList.add("dirty");
            }
            updateDirtyCount();
          });

          const meta = document.createElement("div");
          meta.className = "cell-meta";
          const lastWeekValue = row.last_week_values?.[gw];
          if (lastWeekValue !== null && lastWeekValue !== undefined) {
            meta.textContent = `Last: ${lastWeekValue}`;
          } else {
            meta.textContent = "";
          }

          stack.appendChild(input);
          stack.appendChild(meta);
          td.appendChild(stack);
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      container.innerHTML = "";
      container.appendChild(table);
      updateDirtyCount();
    }

    async function saveChanges() {
      if (!state.dirty.size) return;
      const changes = Array.from(state.dirty.entries()).map(([key, value]) => {
        const [team_code, name, gw] = key.split("||");
        return { team_code, name, gw, value };
      });

      setStatus(`Saving ${changes.length} change(s)...`);
      await fetchJson("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });

      state.dirty.clear();
      updateDirtyCount();
      await loadMeta();
      await loadTable();
      setStatus("Saved changes to GenerateXmins2.csv.");
    }

    async function initialize() {
      try {
        await loadMeta();
        await loadTable();
      } catch (error) {
        setStatus(error.message);
        document.getElementById("table-container").innerHTML = `<div class="empty">${error.message}</div>`;
      }
    }

    document.getElementById("team-select").addEventListener("change", async (event) => {
      state.currentTeam = event.target.value;
      state.dirty.clear();
      updateDirtyCount();
      await loadTable();
    });

    document.getElementById("name-filter").addEventListener("input", (event) => {
      state.nameFilter = event.target.value || "";
      renderTable();
    });

    document.getElementById("reload-btn").addEventListener("click", async () => {
      state.dirty.clear();
      updateDirtyCount();
      await initialize();
    });

    document.getElementById("save-btn").addEventListener("click", saveChanges);
    document.getElementById("apply-current-team-btn").addEventListener("click", () => applyTeamSource("current"));
    document.getElementById("apply-last-team-btn").addEventListener("click", () => applyTeamSource("lastWeek"));

    initialize();
  </script>
</body>
</html>
"""


def load_csv() -> pd.DataFrame:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    required = {"name", "GW", "team_code", "Final_minutes_Adjusted"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(
            f"{CSV_PATH.name} is missing required columns: {sorted(missing)}"
        )

    df["name"] = df["name"].astype(str)
    df["GW"] = pd.to_numeric(df["GW"], errors="coerce")
    df["team_code"] = df["team_code"].astype(str)
    df["Final_minutes_Adjusted"] = pd.to_numeric(
        df["Final_minutes_Adjusted"],
        errors="coerce",
    )
    return df


def save_weekly_snapshot(df: pd.DataFrame) -> None:
    snapshot_df = df[["team_code", "name", "GW", "Final_minutes_Adjusted"]].copy()
    snapshot_df = snapshot_df.dropna(subset=["GW"]).copy()
    snapshot_df["team_code"] = snapshot_df["team_code"].astype(str)
    snapshot_df["name"] = snapshot_df["name"].astype(str)
    snapshot_df["GW"] = pd.to_numeric(snapshot_df["GW"], errors="coerce")
    snapshot_df["Final_minutes_Adjusted"] = pd.to_numeric(
        snapshot_df["Final_minutes_Adjusted"],
        errors="coerce",
    )
    snapshot_df = snapshot_df.dropna(subset=["GW", "Final_minutes_Adjusted"]).copy()
    snapshot_df["GW"] = snapshot_df["GW"].astype(int)

    payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "csv_name": CSV_PATH.name,
        "rows": [
            {
                "team_code": row["team_code"],
                "name": row["name"],
                "GW": int(row["GW"]),
                "Final_minutes_Adjusted": round(float(row["Final_minutes_Adjusted"]), 6),
            }
            for _, row in snapshot_df.iterrows()
        ],
    }
    SNAPSHOT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_snapshot_payload(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _snapshot_gws(payload: dict[str, Any] | None) -> list[int]:
    if not payload:
        return []
    gws = pd.to_numeric(
        pd.Series([row.get("GW") for row in payload.get("rows", [])]),
        errors="coerce",
    ).dropna()
    if gws.empty:
        return []
    return sorted(gws.astype(int).unique().tolist())


def _shifted_snapshot_from_payload(
    payload: dict[str, Any] | None,
    source_name: str,
) -> tuple[dict[tuple[str, str, str], float], dict[str, Any] | None]:
    if not payload:
        return {}, None

    shifted: dict[tuple[str, str, str], float] = {}
    for row in payload.get("rows", []):
        gw = pd.to_numeric(row.get("GW"), errors="coerce")
        value = pd.to_numeric(row.get("Final_minutes_Adjusted"), errors="coerce")
        if pd.isna(gw) or pd.isna(value):
            continue

        shifted_key = (
            str(row.get("team_code", "")),
            str(row.get("name", "")),
            str(int(gw) + 1),
        )
        shifted[shifted_key] = round(float(value), 6)

    return shifted, {
        "generated_at": payload.get("generated_at"),
        "source_name": source_name,
        "source_gws": _snapshot_gws(payload),
        "label": (
            f"Last week edit loaded from {payload.get('generated_at')} ({source_name}) "
            f"and shifted +1 GW."
            if payload.get("generated_at")
            else f"Last week edit loaded from {source_name} and shifted +1 GW."
        ),
    }


def load_shifted_snapshot(current_gws: list[int] | None = None) -> tuple[dict[tuple[str, str, str], float], dict[str, Any] | None]:
    current_payload = _load_snapshot_payload(SNAPSHOT_PATH)
    previous_payload = _load_snapshot_payload(PREVIOUS_SNAPSHOT_PATH)

    candidates: list[tuple[dict[tuple[str, str, str], float], dict[str, Any] | None]] = []
    if previous_payload:
        candidates.append(_shifted_snapshot_from_payload(previous_payload, PREVIOUS_SNAPSHOT_PATH.name))
    if current_payload:
        candidates.append(_shifted_snapshot_from_payload(current_payload, SNAPSHOT_PATH.name))

    if not candidates:
        return {}, None

    if not current_gws:
        return candidates[-1]

    current_gw_set = {int(gw) for gw in current_gws}

    def overlap_score(candidate: tuple[dict[tuple[str, str, str], float], dict[str, Any] | None]) -> tuple[int, int]:
        _, meta = candidate
        source_gws = meta.get("source_gws", []) if meta else []
        shifted_gws = {int(gw) + 1 for gw in source_gws}
        overlap = len(current_gw_set.intersection(shifted_gws))
        source_len = len(source_gws)
        return overlap, source_len

    return max(candidates, key=overlap_score)


def maybe_archive_snapshot_for_new_week(df: pd.DataFrame) -> None:
    current_payload = _load_snapshot_payload(SNAPSHOT_PATH)
    if not current_payload:
        return

    existing_gws = _snapshot_gws(current_payload)
    current_gws = (
        pd.to_numeric(df["GW"], errors="coerce")
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )
    current_gws = sorted(current_gws)

    if existing_gws and current_gws and existing_gws != current_gws:
        PREVIOUS_SNAPSHOT_PATH.write_text(
            json.dumps(current_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def build_meta(df: pd.DataFrame) -> dict[str, Any]:
    grouped = (
        df.dropna(subset=["GW"])
        .groupby("team_code", as_index=False)["name"]
        .nunique()
        .rename(columns={"name": "players"})
        .sort_values("team_code")
    )
    current_gws = (
        pd.to_numeric(df["GW"], errors="coerce")
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )
    return {
        "teams": grouped.to_dict(orient="records"),
        "snapshot": load_shifted_snapshot(sorted(current_gws))[1],
    }


def build_pivot(df: pd.DataFrame, team_code: str) -> dict[str, Any]:
    filtered = df[df["team_code"] == str(team_code)].copy()
    filtered = filtered.dropna(subset=["GW"]).copy()
    filtered["GW"] = filtered["GW"].astype(int)
    current_gws = sorted(filtered["GW"].unique().tolist()) if not filtered.empty else []
    shifted_snapshot, snapshot_meta = load_shifted_snapshot(current_gws)

    if filtered.empty:
        return {
            "team_code": str(team_code),
            "gws": [],
            "rows": [],
            "snapshot": snapshot_meta,
        }

    gws = sorted(filtered["GW"].unique().tolist())
    pivot = (
        filtered.pivot_table(
            index="name",
            columns="GW",
            values="Final_minutes_Adjusted",
            aggfunc="last",
        )
        .reindex(columns=gws)
        .sort_index()
    )

    rows: list[dict[str, Any]] = []
    for player_name, row in pivot.iterrows():
        values = {}
        last_week_values = {}
        for gw in gws:
            val = row.get(gw)
            values[str(gw)] = None if pd.isna(val) else round(float(val), 6)
            last_week_values[str(gw)] = shifted_snapshot.get(
                (str(team_code), str(player_name), str(gw))
            )

        rows.append(
            {
                "name": str(player_name),
                "values": values,
                "last_week_values": last_week_values,
                "last_week_available": any(
                    value is not None for value in last_week_values.values()
                ),
            }
        )

    return {
        "team_code": str(team_code),
        "gws": [str(gw) for gw in gws],
        "rows": rows,
        "snapshot": snapshot_meta,
    }


def save_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    if not changes:
        return {"updated": 0}

    df = load_csv()
    df.to_csv(BACKUP_PATH, index=False)

    updated = 0
    for change in changes:
        team_code = str(change["team_code"])
        name = str(change["name"])
        gw = int(float(change["gw"]))
        value = float(change["value"])
        value = min(90.0, max(0.0, value))

        mask = (
            df["team_code"].eq(team_code)
            & df["name"].eq(name)
            & df["GW"].fillna(-1).astype(int).eq(gw)
        )

        if mask.any():
            df.loc[mask, "Final_minutes_Adjusted"] = value
            updated += int(mask.sum())

    df.to_csv(CSV_PATH, index=False)
    maybe_archive_snapshot_for_new_week(df)
    save_weekly_snapshot(df)

    removed_legacy_backups = 0
    for legacy_backup in CSV_PATH.parent.glob(f"{CSV_PATH.stem}.backup_*.csv"):
        legacy_backup.unlink(missing_ok=True)
        removed_legacy_backups += 1

    return {
        "updated": updated,
        "backup_path": str(BACKUP_PATH),
        "removed_legacy_backups": removed_legacy_backups,
    }


class XminsEditorHandler(BaseHTTPRequestHandler):
    def _send_text(self, payload: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/":
                self._send_text(HTML_PAGE)
                return

            if parsed.path == "/api/meta":
                df = load_csv()
                self._send_json(build_meta(df))
                return

            if parsed.path == "/api/pivot":
                team_code = parse_qs(parsed.query).get("team_code", [""])[0]
                df = load_csv()
                self._send_json(build_pivot(df, team_code))
                return

            self._send_json({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._send_json({"detail": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path != "/api/save":
                self._send_json({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length) or b"{}")
            changes = payload.get("changes", [])
            result = save_changes(changes)
            self._send_json(result)
        except Exception as exc:
            self._send_json({"detail": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    server = ThreadingHTTPServer((HOST, PORT), XminsEditorHandler)
    print(f"Xmins editor running at http://{HOST}:{PORT}")
    print(f"Editing file: {CSV_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
