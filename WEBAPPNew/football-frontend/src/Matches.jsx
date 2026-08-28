import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw, Shield, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "./config/apiBase";
import teamLogos from "./utils/team_logos";
import teamColors from "./utils/team_colors";

const MEASURE_OPTIONS = [
  { value: "total_points", label: "Points" },
  { value: "minutes", label: "Minutes" },
  { value: "goals_scored", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "bonus", label: "Bonus" },
  { value: "bps", label: "BPS" },
  { value: "defensive_contribution", label: "Defcon" },
  { value: "expected_goals", label: "xG" },
  { value: "expected_assists", label: "xA" },
  { value: "saves", label: "Saves" },
];

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMeasure(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

function formatKickoff(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function teamLogo(name) {
  return teamLogos?.[name] || "";
}

function TeamBadge({ name }) {
  const logo = teamLogo(name);
  const color = teamColors?.[name] || "#cbd5e1";

  return (
    <div className="inline-flex items-center gap-2">
      {logo ? (
        <img src={logo} alt={name} className="h-7 w-7 rounded-full bg-white object-contain p-1 shadow-sm" />
      ) : (
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span>{name || "-"}</span>
    </div>
  );
}

function PlayerTable({ title, rows, measure, onOpenPlayer }) {
  const measureLabel = MEASURE_OPTIONS.find((opt) => opt.value === measure)?.label || measure;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500">{rows.length} players</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">{measureLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.Full_Name}-${row.TeamName}-${row.minutes}`} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenPlayer(row)}
                    className="text-left font-medium text-slate-800 transition hover:text-sky-700"
                  >
                    {row.Name || row.Full_Name}
                  </button>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{toNumber(row.minutes)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMeasure(row[measure])}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                  No players in this group.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopMeasureChart({ rows, measure }) {
  const rankedRows = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) =>
        toNumber(b?.[measure]) - toNumber(a?.[measure]) ||
        toNumber(b?.total_points) - toNumber(a?.total_points) ||
        toNumber(b?.minutes) - toNumber(a?.minutes)
    );
    return sorted.slice(0, 14);
  }, [measure, rows]);

  const maxValue = useMemo(
    () => Math.max(1, ...rankedRows.map((row) => toNumber(row?.[measure], 0))),
    [measure, rankedRows]
  );

  if (rankedRows.length === 0) return null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={16} className="text-sky-700" />
        <h3 className="text-sm font-semibold text-slate-900">
          Ranking by {MEASURE_OPTIONS.find((opt) => opt.value === measure)?.label || measure}
        </h3>
      </div>

      <div className="space-y-3">
        {rankedRows.map((row, index) => {
          const value = toNumber(row?.[measure], 0);
          const width = Math.max(0, Math.min(100, (value / maxValue) * 100));
          return (
            <div key={`${row.Full_Name}-${row.TeamName}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-900">
                    {index + 1}. {row.Name || row.Full_Name}
                  </span>
                  <span className="ml-2 text-slate-500">{row.TeamName}</span>
                </div>
                <span className="shrink-0 font-semibold text-sky-700">{formatMeasure(value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Matches() {
  const navigate = useNavigate();
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState("");
  const [selectedGw, setSelectedGw] = useState(null);
  const [selectedFixId, setSelectedFixId] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchRows, setMatchRows] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [selectedMeasure, setSelectedMeasure] = useState("total_points");

  const loadFixtures = useCallback(async () => {
    setFixturesLoading(true);
    setFixturesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/Matches_Fixtures`);
      if (!response.ok) {
        throw new Error(`Match fixtures request failed (${response.status})`);
      }
      const payload = await response.json();
      const rows = (Array.isArray(payload) ? payload : []).filter((row) => Boolean(row?.finished));
      rows.sort((a, b) => toNumber(a.GW) - toNumber(b.GW) || toNumber(a.Fix_ID) - toNumber(b.Fix_ID));
      setFixtures(rows);

      const gws = Array.from(new Set(rows.map((row) => toNumber(row.GW)).filter((gw) => gw > 0))).sort((a, b) => a - b);
      setSelectedGw((prev) => {
        if (Number.isFinite(prev) && gws.includes(prev)) return prev;
        return gws.at(-1) ?? null;
      });
    } catch (error) {
      setFixturesError(error?.message || "Could not load matches.");
    } finally {
      setFixturesLoading(false);
    }
  }, []);

  const loadMatch = useCallback(async (fixture) => {
    const fixId = toNumber(fixture?.Fix_ID, null);
    if (!Number.isFinite(fixId)) return;
    setSelectedFixId(fixId);
    setSelectedMatch(fixture);
    setMatchLoading(true);
    setMatchError("");
    try {
      const response = await fetch(`${API_BASE_URL}/Matches?fix_id=${fixId}`);
      if (!response.ok) {
        throw new Error(`Match details request failed (${response.status})`);
      }
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : [];
      rows.sort((a, b) => {
        const teamSort = String(a.TeamName || "").localeCompare(String(b.TeamName || ""));
        if (teamSort !== 0) return teamSort;
        const starterSort = toNumber(b.Started) - toNumber(a.Started);
        if (starterSort !== 0) return starterSort;
        const measureSort = toNumber(b[selectedMeasure]) - toNumber(a[selectedMeasure]);
        if (measureSort !== 0) return measureSort;
        return toNumber(b.minutes) - toNumber(a.minutes);
      });
      setMatchRows(rows);
    } catch (error) {
      setMatchRows([]);
      setMatchError(error?.message || "Could not load match details.");
    } finally {
      setMatchLoading(false);
    }
  }, [selectedMeasure]);

  useEffect(() => {
    loadFixtures();
  }, [loadFixtures]);

  const gwOptions = useMemo(
    () => Array.from(new Set(fixtures.map((row) => toNumber(row.GW)).filter((gw) => gw > 0))).sort((a, b) => a - b),
    [fixtures]
  );

  const visibleFixtures = useMemo(() => {
    if (!Number.isFinite(selectedGw)) return fixtures;
    return fixtures.filter((row) => toNumber(row.GW) === selectedGw);
  }, [fixtures, selectedGw]);

  const groupedFixtures = useMemo(() => {
    const grouped = new Map();
    for (const row of visibleFixtures) {
      const gw = toNumber(row.GW);
      if (!grouped.has(gw)) grouped.set(gw, []);
      grouped.get(gw).push(row);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [visibleFixtures]);

  const matchTeams = useMemo(() => {
    if (selectedMatch) {
      return [selectedMatch.HomeTeam, selectedMatch.AwayTeam].filter(Boolean);
    }
    return Array.from(new Set(matchRows.map((row) => row.TeamName).filter(Boolean)));
  }, [matchRows, selectedMatch]);

  const teamSections = useMemo(() => {
    return matchTeams.map((teamName) => {
      const teamRows = matchRows.filter((row) => row.TeamName === teamName);
      const starters = teamRows
        .filter((row) => toNumber(row.Started) === 1)
        .sort((a, b) => toNumber(b[selectedMeasure]) - toNumber(a[selectedMeasure]) || toNumber(b.minutes) - toNumber(a.minutes));
      const subs = teamRows
        .filter((row) => toNumber(row.Sub) === 1)
        .sort((a, b) => toNumber(b[selectedMeasure]) - toNumber(a[selectedMeasure]) || toNumber(b.minutes) - toNumber(a.minutes));

      return { teamName, starters, subs };
    });
  }, [matchRows, matchTeams, selectedMeasure]);

  const matchTotals = useMemo(() => {
    const totals = {};
    for (const row of matchRows) {
      const teamName = String(row?.TeamName || "").trim();
      if (!teamName) continue;
      if (!totals[teamName]) totals[teamName] = { xg: 0, goals: 0 };
      totals[teamName].xg += toNumber(row?.expected_goals, 0);
    }

    if (selectedMatch?.HomeTeam) {
      if (!totals[selectedMatch.HomeTeam]) totals[selectedMatch.HomeTeam] = { xg: 0, goals: 0 };
      totals[selectedMatch.HomeTeam].goals = toNumber(selectedMatch.team_h_score, 0);
    }
    if (selectedMatch?.AwayTeam) {
      if (!totals[selectedMatch.AwayTeam]) totals[selectedMatch.AwayTeam] = { xg: 0, goals: 0 };
      totals[selectedMatch.AwayTeam].goals = toNumber(selectedMatch.team_a_score, 0);
    }

    return totals;
  }, [matchRows, selectedMatch]);

  const openPlayer = useCallback((row) => {
    const selectedPlayer = row?.Full_Name || row?.Name;
    if (!selectedPlayer) return;
    navigate("/Player_Analytics/Individual", {
      state: { selectedPlayer },
    });
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: "radial-gradient(circle at top, #f8fafc 0, #eef2ff 55%, #e2e8f0 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl space-y-5 text-slate-800">
        <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Season Analytics
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Matches
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Browse finished fixtures by gameweek, open a match, and compare starters and subs by your chosen player measure.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Finished fixtures</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{fixtures.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Selected GW</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Number.isFinite(selectedGw) ? `GW ${selectedGw}` : "-"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Filter gameweek
              </div>
              <div className="flex flex-wrap gap-2">
                {gwOptions.map((gw) => (
                  <button
                    key={gw}
                    type="button"
                    onClick={() => setSelectedGw(gw)}
                    className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                      selectedGw === gw
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    }`}
                  >
                    GW {gw}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Player measure
                </div>
                <select
                  value={selectedMeasure}
                  onChange={(event) => setSelectedMeasure(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
                >
                  {MEASURE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={loadFixtures}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1.2fr]">
          <section className="space-y-4">
            {fixturesLoading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                Loading matches...
              </div>
            ) : fixturesError ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
                {fixturesError}
              </div>
            ) : groupedFixtures.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                No fixtures found for this view.
              </div>
            ) : (
              groupedFixtures.map(([gw, rows]) => (
                <div key={gw} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarRange size={18} className="text-sky-700" />
                    <h2 className="text-lg font-semibold text-slate-900">GW {gw}</h2>
                  </div>

                  <div className="space-y-3">
                    {rows.map((fixture) => {
                      const isActive = toNumber(selectedFixId) === toNumber(fixture.Fix_ID);
                      return (
                        <button
                          key={fixture.Fix_ID}
                          type="button"
                          onClick={() => loadMatch(fixture)}
                          className={`w-full rounded-3xl border p-4 text-left transition ${
                            isActive
                              ? "border-sky-200 bg-sky-50 shadow-sm"
                              : "border-slate-200 bg-slate-50 hover:border-sky-200 hover:bg-sky-50/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                                <TeamBadge name={fixture.HomeTeam} />
                                <span className="text-slate-400">vs</span>
                                <TeamBadge name={fixture.AwayTeam} />
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                {fixture.kickoff_time ? formatKickoff(fixture.kickoff_time) : ""}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold text-slate-900">
                                {fixture.finished && fixture.team_h_score !== "" && fixture.team_a_score !== ""
                                  ? `${toNumber(fixture.team_h_score)} - ${toNumber(fixture.team_a_score)}`
                                  : "Open"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {fixture.finished ? "Finished" : fixture.started ? "Live or started" : "Upcoming"}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    <Users size={14} />
                    Match detail
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    {selectedMatch ? `${selectedMatch.HomeTeam} vs ${selectedMatch.AwayTeam}` : "Choose a match"}
                  </h2>
                  <div className="mt-2 text-sm text-slate-500">
                    {selectedMatch ? `GW ${selectedMatch.GW}` : "Select any fixture on the left to load player-by-player data."}
                  </div>
                </div>

                {selectedMatch ? (
                  <div className="text-sm text-slate-500">
                    {selectedMatch.kickoff_time ? formatKickoff(selectedMatch.kickoff_time) : ""}
                  </div>
                ) : null}
              </div>

              {matchLoading ? (
                <div className="py-10 text-center text-slate-500">Loading match data...</div>
              ) : matchError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {matchError}
                </div>
              ) : selectedMatch == null ? (
                <div className="py-10 text-center text-slate-500">No match selected yet.</div>
              ) : (
                <div className="mt-4 space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    {[selectedMatch?.HomeTeam, selectedMatch?.AwayTeam].filter(Boolean).map((teamName) => (
                      <div key={teamName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-lg font-bold text-slate-900">
                            <TeamBadge name={teamName} />
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-slate-900">
                              {matchTotals?.[teamName]?.goals ?? 0}
                            </div>
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                              Goals
                            </div>
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Team xG</div>
                          <div className="mt-1 text-2xl font-bold text-sky-700">
                            {formatMeasure(matchTotals?.[teamName]?.xg ?? 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {teamSections.map((section) => (
                    <div key={section.teamName} className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-3 text-lg font-semibold text-slate-900">
                          <TeamBadge name={section.teamName} />
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Sorted by {MEASURE_OPTIONS.find((opt) => opt.value === selectedMeasure)?.label || selectedMeasure}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <PlayerTable title="Starters" rows={section.starters} measure={selectedMeasure} onOpenPlayer={openPlayer} />
                        <PlayerTable title="Subs" rows={section.subs} measure={selectedMeasure} onOpenPlayer={openPlayer} />
                      </div>
                    </div>
                  ))}

                  <TopMeasureChart rows={matchRows} measure={selectedMeasure} />

                  {teamSections.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      No player rows returned for this match.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
