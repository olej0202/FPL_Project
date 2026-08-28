import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "./config/apiBase";

const MODE_OPTIONS = [
  { key: "all", label: "All movers" },
  { key: "risers", label: "Price risers" },
  { key: "fallers", label: "Price fallers" },
];

const SORTABLE_COLUMNS = {
  name: "Name",
  team_name: "Team",
  price_change_percent: "Price Change %",
  price_change_projections: "Projection",
  price: "Price",
  is_locked: "Locked",
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value.toFixed(digits)}%`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "£0.0";
  return `£${value.toFixed(1)}`;
}

function compareValues(left, right) {
  if (typeof left === "string" || typeof right === "string") {
    return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }
  return toNumber(left) - toNumber(right);
}

export default function PriceChanges() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("all");
  const [nameFilter, setNameFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("All");
  const [sortConfig, setSortConfig] = useState({
    key: "price_change_percent",
    direction: "desc",
  });
  const [updatedAt, setUpdatedAt] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/Price_Changes`);
      if (!response.ok) {
        throw new Error(`Price data request failed (${response.status}).`);
      }

      const payload = await response.json();
      const nextRows = Array.isArray(payload) ? payload : [];
      setRows(nextRows);
      setUpdatedAt(new Date().toLocaleString());
    } catch (fetchError) {
      setError(fetchError?.message || "Could not load price changes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const teamOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(rows.map((row) => row.team_name).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b))
      ),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const search = nameFilter.trim().toLowerCase();

    return rows.filter((row) => {
      const matchName = !search || String(row.name ?? "").toLowerCase().includes(search);
      const matchTeam = teamFilter === "All" || row.team_name === teamFilter;
      const projection = toNumber(row.price_change_projections);
      const matchMode =
        mode === "all" ||
        (mode === "risers" && projection > 0) ||
        (mode === "fallers" && projection < 0);

      return matchName && matchTeam && matchMode;
    });
  }, [rows, nameFilter, teamFilter, mode]);

  const sortedRows = useMemo(() => {
    const data = [...filteredRows];
    const { key, direction } = sortConfig;
    const dir = direction === "asc" ? 1 : -1;

    data.sort((a, b) => {
      const primary = compareValues(a[key], b[key]) * dir;
      if (primary !== 0) return primary;

      if (mode === "fallers") {
        const tieBreak = compareValues(a.price_change_projections, b.price_change_projections);
        if (tieBreak !== 0) return tieBreak;
      } else {
        const tieBreak = compareValues(b.price_change_projections, a.price_change_projections);
        if (tieBreak !== 0) return tieBreak;
      }

      return compareValues(a.name, b.name);
    });

    return data;
  }, [filteredRows, sortConfig, mode]);

  const summary = useMemo(() => {
    let risers = 0;
    let fallers = 0;
    let locked = 0;

    for (const row of rows) {
      const projection = toNumber(row.price_change_projections);
      if (projection > 0) risers += 1;
      if (projection < 0) fallers += 1;
      if (row.is_locked) locked += 1;
    }

    return { total: rows.length, risers, fallers, locked };
  }, [rows]);

  function requestSort(key) {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      if (key === "price_change_percent" || key === "price_change_projections") {
        return {
          key,
          direction: mode === "fallers" ? "asc" : "desc",
        };
      }

      return { key, direction: "asc" };
    });
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setSortConfig((current) => {
      if (current.key === "price_change_percent" || current.key === "price_change_projections") {
        return {
          ...current,
          direction: nextMode === "fallers" ? "asc" : "desc",
        };
      }
      return current;
    });
  }

  function openPlayer(row) {
    if (!row?.full_name) return;
    navigate("/Player_Analytics/Individual", {
      state: { selectedPlayer: row.full_name },
    });
  }

  function sortIcon(key) {
    if (sortConfig.key !== key) return <ArrowUpDown size={15} className="text-slate-400" />;
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={15} className="text-sky-700" />
    ) : (
      <ArrowDown size={15} className="text-sky-700" />
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-950 via-cyan-900 to-emerald-700 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1.7fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/80">
              Live FPL Watch
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Price Changes
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/88 sm:text-base">
              Current risers and fallers from FPL, with quick filtering by player and team and one-click
              navigation into the individual player page.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Players</p>
              <p className="mt-2 text-2xl font-bold">{summary.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/25 bg-emerald-400/15 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-50/85">Risers</p>
              <p className="mt-2 text-2xl font-bold">{summary.risers}</p>
            </div>
            <div className="rounded-2xl border border-rose-200/25 bg-rose-400/15 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-rose-50/85">Fallers</p>
              <p className="mt-2 text-2xl font-bold">{summary.fallers}</p>
            </div>
            <div className="rounded-2xl border border-amber-200/25 bg-amber-300/15 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-amber-50/85">Locked</p>
              <p className="mt-2 text-2xl font-bold">{summary.locked}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Search Name
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Type player name..."
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Team
              </span>
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
              >
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                View
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MODE_OPTIONS.map((option) => {
                  const active = mode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleModeChange(option.key)}
                      className={[
                        "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                        active
                          ? "border-sky-200 bg-sky-50 text-sky-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-xs text-slate-500">
              <div>{updatedAt ? `Updated ${updatedAt}` : "Waiting for data..."}</div>
              <div>{sortedRows.length} rows in current view</div>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {Object.entries(SORTABLE_COLUMNS).map(([key, label]) => (
                  <th key={key} className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => requestSort(key)}
                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:text-sky-700"
                    >
                      <span>{label}</span>
                      {sortIcon(key)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={Object.keys(SORTABLE_COLUMNS).length} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading latest FPL price changes...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={Object.keys(SORTABLE_COLUMNS).length} className="px-4 py-10 text-center">
                    <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                      {error}
                    </div>
                  </td>
                </tr>
              ) : sortedRows.length ? (
                sortedRows.map((row) => (
                  <tr key={row.id ?? `${row.name}_${row.team_name}`} className="transition hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => openPlayer(row)}
                        className="font-semibold text-sky-700 transition hover:text-sky-900 hover:underline"
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      {row.team_name}
                    </td>
                    <td
                      className={[
                        "whitespace-nowrap px-4 py-3 text-sm font-semibold",
                        toNumber(row.price_change_percent) > 0
                          ? "text-emerald-700"
                          : toNumber(row.price_change_percent) < 0
                            ? "text-rose-700"
                            : "text-slate-600",
                      ].join(" ")}
                    >
                      {formatPercent(toNumber(row.price_change_percent))}
                    </td>
                    <td
                      className={[
                        "whitespace-nowrap px-4 py-3 text-sm font-semibold",
                        toNumber(row.price_change_projections) > 0
                          ? "text-emerald-700"
                          : toNumber(row.price_change_projections) < 0
                            ? "text-rose-700"
                            : "text-slate-600",
                      ].join(" ")}
                    >
                      {toNumber(row.price_change_projections).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-700">
                      {formatPrice(toNumber(row.price))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        title={row.price_change_locked_until || ""}
                        className={[
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                          row.is_locked
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {row.is_locked ? "1" : "0"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={Object.keys(SORTABLE_COLUMNS).length} className="px-4 py-10 text-center text-sm text-slate-500">
                    No players match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
