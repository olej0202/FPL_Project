import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw, Shield, Star, Users } from "lucide-react";
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
              <th className="px-4 py-3 text-right">Pts</th>
              <th className="px-4 py-3 text-right">{MEASURE_OPTIONS.find((opt) => opt.value === measure)?.label || measure}</th>
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
                <td className="px-4 py-3 text-right text-slate-600">{formatMeasure(row.total_points)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMeasure(row[measure])}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
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

export default function Matches() {
  const navigate = useNavigate();
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState("");
  const [selectedGw, setSelectedGw] = useState("All");
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
      const rows = Array.isArray(payload) ? payload : [];
      rows.sort((a, b) => toNumber(a.GW) - toNumber(b.GW) || toNumber(a.Fix_ID) - toNumber(b.Fix_ID));
      setFixtures(rows);
      if (rows.length > 0) {
        const gws = Array.from(new Set(rows.map((row) => toNumber(row.GW)).filter((gw) => gw > 0))).sort((a, b) => a - b);
        setSelectedGw((prev) => (prev === "All" ? (gws.at(-1) ?? "All") : prev));
      }
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
    if (selectedGw === "All") return fixtures;
    return fixtures.filter((row) => toNumber(row.GW) === toNumber(selectedGw));
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
      const unused = teamRows
        .filter((row) => toNumber(row.Started) !== 1 && toNumber(row.Sub) !== 1)
        .sort((a, b) => toNumber(b[selectedMeasure]) - toNumber(a[selectedMeasure]));

      return { teamName, starters, subs, unused };
    });
  }, [matchRows, matchTeams, selectedMeasure]);

  const topPlayers = useMemo(() => {
    if (matchRows.length === 0) return [];
    const sorted = [...matchRows].sort((a, b) => toNumber(b[selectedMeasure]) - toNumber(a[selectedMeasure]) || toNumber(b.total_points) - toNumber(a.total_points));
    const leaders = [];
    if (sorted[0]) {
      leaders.push({
        label: "Match leader",
        player: sorted[0],
      });
    }
    for (const teamName of matchTeams) {
      const teamLeader = sorted.find((row) => row.TeamName === teamName);
      if (teamLeader) {
        leaders.push({
          label: `${teamName} leader`,
          player: teamLeader,
        });
      }
    }
    return leaders;
  }, [matchRows, matchTeams, selectedMeasure]);

  const openPlayer = useCallback((row) => {
    const selectedPlayer = row?.Full_Name || row?.Name;
    if (!selectedPlayer) return;
    navigate("/Player_Analytics/Individual", {
      state: { selectedPlayer },
    });
  }, [navigate]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1.7fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/80">
              Match Centre
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Matches</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/88 sm:text-base">
              Browse every fixture by gameweek, open a match, and compare starters and subs by your chosen player measure.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Fixtures</p>
              <p className="mt-2 text-2xl font-bold">{fixtures.length}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Selected GW</p>
              <p className="mt-2 text-2xl font-bold">{selectedGw === "All" ? "All" : `GW ${selectedGw}`}</p>
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
              <button
                type="button"
                onClick={() => setSelectedGw("All")}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${selectedGw === "All" ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-sky-50 hover:text-sky-700"}`}
              >
                All
              </button>
              {gwOptions.map((gw) => (
                <button
                  key={gw}
                  type="button"
                  onClick={() => setSelectedGw(gw)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${toNumber(selectedGw) === gw ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-sky-50 hover:text-sky-700"}`}
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
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
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
                        className={`w-full rounded-3xl border p-4 text-left transition ${isActive ? "border-sky-300 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/50"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                              <TeamBadge name={fixture.HomeTeam} />
                              <span className="text-slate-400">vs</span>
                              <TeamBadge name={fixture.AwayTeam} />
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Fix {fixture.Fix_ID}
                              {fixture.kickoff_time ? ` • ${formatKickoff(fixture.kickoff_time)}` : ""}
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
                  {selectedMatch ? `Fix ${selectedMatch.Fix_ID} • GW ${selectedMatch.GW}` : "Select any fixture on the left to load player-by-player data."}
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
                <div className="grid gap-3 md:grid-cols-3">
                  {topPlayers.map((entry) => (
                    <div key={`${entry.label}-${entry.player?.Full_Name}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{entry.label}</div>
                      <div className="mt-2 text-lg font-bold text-slate-900">{entry.player?.Name || entry.player?.Full_Name}</div>
                      <div className="mt-1 text-sm text-slate-500">{entry.player?.TeamName}</div>
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-sky-700 shadow-sm">
                        <Star size={14} />
                        {formatMeasure(entry.player?.[selectedMeasure])} {MEASURE_OPTIONS.find((opt) => opt.value === selectedMeasure)?.label}
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

                    {section.unused.length > 0 ? (
                      <PlayerTable title="Did not play" rows={section.unused} measure={selectedMeasure} onOpenPlayer={openPlayer} />
                    ) : null}
                  </div>
                ))}

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
  );
}
