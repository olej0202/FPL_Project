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
        <button id="save-btn" class="primary" disabled>Save Changes</button>
      </div>
    </section>

    <div class="statusbar">
      <span id="status-text">Loading...</span>
      <span id="dirty-count">0 pending edits</span>
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
    };

    function setStatus(message) {
      document.getElementById("status-text").textContent = message;
    }

    function updateDirtyCount() {
      const count = state.dirty.size;
      document.getElementById("dirty-count").textContent = `${count} pending edit${count === 1 ? "" : "s"}`;
      document.getElementById("save-btn").disabled = count === 0;
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
      setStatus(`Loaded team ${state.currentTeam}.`);
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
        nameTd.textContent = row.name;
        tr.appendChild(nameTd);

        for (const gw of state.gws) {
          const td = document.createElement("td");
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
          td.appendChild(input);
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


def build_meta(df: pd.DataFrame) -> dict[str, Any]:
    grouped = (
        df.dropna(subset=["GW"])
        .groupby("team_code", as_index=False)["name"]
        .nunique()
        .rename(columns={"name": "players"})
        .sort_values("team_code")
    )
    return {
        "teams": grouped.to_dict(orient="records"),
    }


def build_pivot(df: pd.DataFrame, team_code: str) -> dict[str, Any]:
    filtered = df[df["team_code"] == str(team_code)].copy()
    filtered = filtered.dropna(subset=["GW"]).copy()
    filtered["GW"] = filtered["GW"].astype(int)

    if filtered.empty:
        return {"team_code": str(team_code), "gws": [], "rows": []}

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
        for gw in gws:
            val = row.get(gw)
            values[str(gw)] = None if pd.isna(val) else round(float(val), 6)
        rows.append({"name": str(player_name), "values": values})

    return {
        "team_code": str(team_code),
        "gws": [str(gw) for gw in gws],
        "rows": rows,
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
