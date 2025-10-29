import React, { useEffect, useMemo, useState, useRef } from "react";
import teamLogos from "./utils/team_logos";
import pitch from "./assets/pitch_lineup.png";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useLocation } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";

export default function Team_Analytics_Individual() {
  const { fetchIfNeeded, TeamData, TeamThreatData, TeamLineupsData, selected_team, setselected_team } = useStatsData();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";

  const [eloData, setEloData] = useState([]);
  const [offData, setOffData] = useState([]);
  const [defData, setDefData] = useState([]);

  const [data, setData] = useState([]);
  const [teamFilter, setTeamFilter] = useState(selected_team);
  const [teams, setTeams] = useState([]);
  const [latestStats, setLatestStats] = useState({});
  const [showOffensive, setShowOffensive] = useState(true);
  const [chartType, setChartType] = useState("elo"); // 'elo'|'off'|'def'

  const location = useLocation();

  // ---------- Init & fetch ----------
  useEffect(() => {
    const init = async () => {
      await fetchIfNeeded();
      const res = await fetch(API_URL);
      const rows = await res.json();

      setEloData(
        rows.map((r) => ({
          kickoff_time: r.kickoff_time,
          Elo_Rating: Number(parseFloat(r.Elo_Rating).toFixed(1)),
          name: r.name || r.Team,
        }))
      );
      setOffData(
        rows.map((r) => ({
          kickoff_time: r.kickoff_time,
          XG_avg: Number(parseFloat(r.XG_avg).toFixed(3)),
          name: r.name || r.Team,
        }))
      );
      setDefData(
        rows.map((r) => ({
          kickoff_time: r.kickoff_time,
          XGC_avg: Number(parseFloat(r.XGC_avg).toFixed(3)),
          name: r.name || r.Team,
        }))
      );
    };
    init();
  }, [fetchIfNeeded]);

  // Teams list & initial selection
  useEffect(() => {
    if (!TeamData?.current || TeamData.current.length === 0) return;
    const uniqueTeams = [...new Set(TeamData.current.map((d) => d.name || d.Team))]
      .filter(Boolean)
      .sort();
    setTeams(uniqueTeams);
    const passed = location.state?.selectedTeam;
    setTeamFilter(passed && uniqueTeams.includes(passed) ? passed : selected_team);
  }, [TeamData?.current?.length, location.state, selected_team]);

  // Current team history + latest stats
  useEffect(() => {
    if (!teamFilter || !TeamData?.current) return;
    const teamHistory = TeamData.current
      .filter((r) => (r.name || r.Team) === teamFilter)
      .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    setData(teamHistory);
    const latest = teamHistory.at(-1);
    if (latest) {
      setLatestStats({
        XGA: latest.XGA || 0,
        XGH: latest.XGH || 0,
        XG_slope: latest.XG_slope || 0,
        XG_avg: latest.XG_avg || 0,
        XGCA: latest.XGCA || 0,
        XGCH: latest.XGCH || 0,
        XGC_slope: latest.XGC_slope || 0,
        XGC_avg: latest.XGC_avg || 0,
      });
    }
  }, [teamFilter, TeamData?.current]);

  // ---------- Derived data ----------
  const statCards = showOffensive
    ? [
        { title: "Away Attack Index", value: latestStats.XGA },
        { title: "Home Attack Index", value: latestStats.XGH },
        { title: "Overall Attack Index", value: latestStats.XG_avg },
        { title: "Attack Form", value: latestStats.XG_slope },
      ]
    : [
        { title: "Away Defence Index", value: latestStats.XGCA },
        { title: "Home Defence Index", value: latestStats.XGCH },
        { title: "Overall Defence Index", value: latestStats.XGC_avg },
        { title: "Defensive Form", value: (latestStats.XGC_slope ?? 0) * -1 },
      ];

  const eloChartData = useMemo(() => eloData.filter((d) => d.name === teamFilter), [eloData, teamFilter]);
  const offChartData = useMemo(() => offData.filter((d) => d.name === teamFilter), [offData, teamFilter]);
  const defChartData = useMemo(() => defData.filter((d) => d.name === teamFilter), [defData, teamFilter]);

  // Threat list (vs selected team) → aggregate per role and display on mirrored pitch
  const threatRows = useMemo(() => {
    const src = Array.isArray(TeamThreatData?.current)
      ? TeamThreatData.current
      : Array.isArray(TeamThreatData)
      ? TeamThreatData
      : [];
    return src
      .filter((r) => (r?.opponent ?? r?.Opponent) === teamFilter)
      .map((r) => ({
        pos_group: r?.pos_group ?? r?.position_group ?? r?.PosGroup ?? "Unknown",
        threat: Number(r?.Threat ?? r?.Treat ?? r?.threat ?? r?.treat ?? NaN),
      }))
      .filter((r) => Number.isFinite(r.threat))
      .sort((a, b) => b.threat - a.threat);
  }, [TeamThreatData, teamFilter]);

  // Latest lineup — appearance % over last 5 matches
  const lineupLatestStats = useMemo(() => {
    const src = Array.isArray(TeamLineupsData?.current)
      ? TeamLineupsData.current
      : Array.isArray(TeamLineupsData)
      ? TeamLineupsData
      : [];
    return src
      .map((r) => ({
        player_name: r.player_name ?? r.Player ?? r.name ?? "",
        player_team: r.player_team ?? r.Team ?? r.team ?? "",
        pos_latest: r.pos_latest ?? r.pos_group ?? r.position_group ?? r.PosGroup ?? r.position ?? "UNK",
        start_percantage: r.appear_pct_last5 ?? 0,
      }))
      .filter((r) => r.player_team === teamFilter);
  }, [TeamLineupsData, teamFilter]);

  // For shirt images
  const teamCode = useMemo(() => {
    const src = Array.isArray(TeamData?.current) ? TeamData.current : [];
    const row = src
      .filter((r) => (r.name || r.Team) === teamFilter)
      .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time))
      .at(-1);
    return row?.code ?? row?.team_code ?? row?.Code ?? null;
  }, [TeamData, teamFilter]);

  // ---------- Helpers: role placement on pitch ----------
  const normalizeRole = (pos_latest = "") => {
    const p = String(pos_latest).toLowerCase();
    if (p.includes("gk")) return "GK";
    if (p.includes("lw")) return "LW";
    if (p.includes("rw")) return "RW";
    if (p.includes("lb") || p.includes("dl") || p.includes("lwb")) return "LB";
    if (p.includes("rb") || p.includes("dr") || p.includes("rwb")) return "RB";
    if (p.includes("cb") || (p.includes("def") && !p.includes("wb"))) return "CB";
    if (p.includes("cdm") || p.includes("dm")) return "DM";
    if (p.includes("cam") || p.includes("am")) return "AM";
    if (p.includes("cm") || p.includes("mc") || p.includes("mid")) return "CM";
    if (p.includes("st") || p.includes("cf") || p.includes("fw") || p.includes("fwd") || p.includes("striker")) return "ST";
    return "CM";
  };

  const BASE = {
    GK: { x: 50, y: 92 },
    LB: { x: 14, y: 60 },
    CB: { x: 50, y: 73 },
    RB: { x: 88, y: 60 },
    DM: { x: 50, y: 55 },
    CM: { x: 50, y: 45 },
    AM: { x: 50, y: 29 },
    LW: { x: 14, y: 25 },
    RW: { x: 88, y: 25 },
    ST: { x: 50, y: 10 },
  };

  const ROLE_SPAN_MAX = { ST: 34, AM: 30, CM: 42, DM: 30, CB: 28, LB: 18, RB: 18, LW: 24, RW: 24, GK: 0 };
  const ROLE_MIN_GAP = { ST: 10, AM: 9, CM: 12, DM: 10, CB: 9, LB: 8, RB: 8, LW: 10, RW: 10, GK: 0 };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const placeWithinRow = (base, i, n, role) => {
    if (n <= 1) return base;
    const maxSpan = ROLE_SPAN_MAX[role] ?? 26;
    const gap = ROLE_MIN_GAP[role] ?? 9;
    let totalSpan = Math.min(maxSpan, gap * (n - 1));
    if (role === "CM" && n >= 3) totalSpan = Math.max(totalSpan, 50);
    if (role === "CM" && n >= 2) totalSpan = Math.max(totalSpan, 32);
    if (role === "CB" && n >= 3) totalSpan = Math.max(totalSpan, 55);
    if (role === "CB" && n >= 2) totalSpan = Math.max(totalSpan, 32);
    if (role === "DM" && n >= 2) totalSpan = Math.max(totalSpan, 26);
    if (role === "ST" && n >= 2) totalSpan = Math.max(totalSpan, 32);
    if (role === "AM" && n >= 2) totalSpan = Math.max(totalSpan, 32);
    const step = totalSpan / (n - 1);
    const start = base.x - totalSpan / 2;
    const x = clamp(start + step * i, 5, 95);
    const y = base.y;
    return { x, y };
  };

  const lineupOnPitch = useMemo(() => {
    if (!Array.isArray(lineupLatestStats) || lineupLatestStats.length === 0) return [];
    const groups = lineupLatestStats.reduce((acc, r) => {
      const role = normalizeRole(r.pos_latest ?? r.pos_group ?? r.position);
      (acc[role] ||= []).push(r);
      return acc;
    }, {});

    const rolesOrder = ["ST", "LW", "RW", "AM", "CM", "DM", "LB", "CB", "RB", "GK"];
    const out = [];
    rolesOrder.forEach((role) => {
      const arr = groups[role] || [];
      const n = arr.length;
      const base = BASE[role] || BASE.CM;
      arr
        .slice()
        .sort(
          (a, b) => (b.start_percantage ?? 0) - (a.start_percantage ?? 0) || String(a.player_name).localeCompare(String(b.player_name))
        )
        .forEach((player, i) => {
          const { x, y } = placeWithinRow(base, i, n, role);
          const pct = player.start_percantage ?? null;
          out.push({
            key: `${player.player_name}-${role}-${i}`,
            name: player.player_name ?? "",
            role,
            x,
            y,
            pct: typeof pct === "number" && isFinite(pct) ? pct : null,
          });
        });
    });
    return out;
  }, [lineupLatestStats]);

  const mirrorBase = ({ x, y }) => ({ x: 100 - x, y: 100 - y });

  const threatsOnPitch = useMemo(() => {
    if (!Array.isArray(threatRows) || threatRows.length === 0) return [];
    const byRole = threatRows.reduce((acc, r) => {
      const role = normalizeRole(r.pos_group);
      const val = Number(r.threat) || 0;
      acc[role] = (acc[role] ?? 0) + val;
      return acc;
    }, {});
    const out = Object.entries(byRole).map(([role, threat]) => {
      const base = BASE[role] || BASE.CM;
      const { x, y } = mirrorBase(base);
      return { role, threat, x, y };
    });
    out.sort((a, b) => b.threat - a.threat || a.role.localeCompare(b.role));
    return out;
  }, [threatRows]);

  const [minT, maxT] = useMemo(() => {
    if (!threatsOnPitch.length) return [0, 1];
    const vals = threatsOnPitch.map((d) => d.threat);
    return [Math.min(...vals), Math.max(...vals)];
  }, [threatsOnPitch]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Team Analytics</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">Switch teams, view recent form, lineups, and where they’re most vulnerable.</p>
        </header>

        {/* Team selector */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={teamLogos[teamFilter] || ""} alt={`${teamFilter} logo`} className="h-14 w-14 object-contain" />
              <div>
                <div className="text-lg font-semibold">{teamFilter || "Select a team"}</div>
                {teamCode != null && <div className="text-xs text-royal-gold"></div>}
              </div>
            </div>

            <select
              className="h-10 w-full sm:w-64 rounded-md border border-white/10 bg-black/60 px-3 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-royal-gold/60"
              value={teamFilter || ""}
              onChange={(e) => {
                const val = e.target.value;
                setTeamFilter(val);
                if (typeof setselected_team === "function") setselected_team(val);
              }}
              aria-label="Select team"
            >
              {teams.map((t) => (
                <option key={t} value={t} className="bg-black text-neutral-100">
                  {t}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Off/Def toggle & stat cards */}
        <section className="mb-8 text-center">
          <div className="flex items-center justify-center gap-4 mb-4 text-center">
            <button
              onClick={() => setShowOffensive(true)}
              className={`h-9 px-3 rounded-md border text-sm transition focus:outline-none focus:ring-0 focus:outline-none focus:ring-royal-gold/60 hover:border-none ${
                showOffensive ? "text-royal-gold bg-black" : "bg-black text-neutral-200  "
              }`}
            >
              Offensive
            </button>
            <button
              onClick={() => setShowOffensive(false)}
              className={`h-10 px-5 rounded-md border text-sm transition focus:outline-none focus:ring-0 focus:ring-royal-gold/60 hover:border-none ${
                !showOffensive ? "text-royal-gold bg-black" : "bg-black text-neutral-200 "
              }`}
            >
              Defensive
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            {statCards.map((stat) => {
              const val = Number(stat.value);
              const isForm = /Form/i.test(stat.title);
              const disp = isForm ? null : Number.isFinite(val) ? val.toFixed(2) : "—";
              const arrow = isForm
                ? val >= 0.03
                  ? "↑↑"
                  : val > 0
                  ? "↑"
                  : val <= -0.03
                  ? "↓↓"
                  : val < 0
                  ? "↓"
                  : ""
                : "";
              return (
                <div key={stat.title} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                  <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-1">{stat.title}</h3>
                  <div className="text-xl font-semibold text-royal-gold min-h-[28px]">{disp ?? ""} {arrow}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Latest Lineup on Pitch */}
        {teamFilter && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-center mb-3">Latest Lineup — % Starts last 5 matches</h2>
            <div
              className="mx-auto w-full max-w-[520px] aspect-[1/1.6] bg-no-repeat bg-cover rounded-2xl border border-white/10 shadow relative"
              style={{ backgroundImage: `url(${pitch})`, backgroundPosition: "50% 50%" }}
            >
              {lineupOnPitch.map((p) => (
                <div
                  key={p.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  {/* Shirt */}
                  {teamCode && (
                    <img
                      src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.png`}
                      alt=""
                      width={48}
                      height={48}
                      className="block mx-auto w-[48px] h-[48px] object-contain mb-1 pointer-events-none select-none"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}

                  {/* Label */}
                  <div className="px-2 py-1 rounded-md bg-black/70 border border-white/10 shadow">
                    <div className="text-[11px] font-semibold text-white whitespace-nowrap">
                      {(p.name ?? "").trim().split(/[\,\s;]+/).pop() || ""}
                    </div>
                    <div className="text-[10px] text-neutral-300">
                      {Number.isFinite(p.pct) ? `${Math.round(p.pct)}%` : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Threat by Opposition Position (mirrored) */}
        {teamFilter && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-center mb-3">Threat by Opposition Position</h2>
            <div
              className="mx-auto w-full max-w-[520px] aspect-[1/1.6] bg-no-repeat bg-cover rounded-2xl border border-white/10 shadow relative"
              style={{ backgroundImage: `url(${pitch})`, backgroundPosition: "50% 50%" }}
            >
              {threatsOnPitch.map((t) => {
                const alpha = maxT > minT ? 0.35 + 0.5 * ((t.threat - minT) / (maxT - minT)) : 0.5;
                return (
                  <div
                    key={t.role}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-center flex flex-col items-center"
                    style={{ left: `${t.x}%`, top: `${t.y}%` }}
                  >
                    <div className="px-2 py-1 rounded-md border border-white/10 shadow"
                      style={{ backgroundColor: `rgba(185,28,28,${alpha})` }}
                    >
                      <div className="text-[11px] font-semibold text-royal-gold">{t.role}</div>
                      <div className="text-xs font-bold text-white">{Number.isFinite(t.threat) ? t.threat.toFixed(2) : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <h2 className="text-lg font-semibold text-center mb-3">Team Historical Developement</h2>
        {/* Chart type toggle */}
        <div className="flex items-center justify-center gap-2 mb-4">
          
          {["elo", "off", "def"].map((type) => {
            const labels = { elo: "ELO", off: "Offensive", def: "Defensive" };
            const isSel = chartType === type;
            return (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`h-9 px-3 rounded-md border text-sm transition hover:border-none outline:border-none focus:outline-none focus:ring-2 focus:ring-royal-gold/60 ${
                  isSel ? "bg-royal-gold text-black border-yellow-400" : "bg-white/5 text-neutral-200 border-white/10 hover:bg-white/10"
                }`}
                aria-pressed={isSel}
              >
                {labels[type]}
              </button>
            );
          })}
        </div>

        {/* Line chart */}
        <section className="mb-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <h3 className="text-center text-sm uppercase tracking-wide text-neutral-400 mb-2">
              {chartType === "elo" ? "ELO Rating Over Time" : chartType === "off" ? "Off Rating Over Time" : "Def Rating Over Time"}
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartType === "elo" ? eloChartData : chartType === "off" ? offChartData : defChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#333" />
                  <XAxis dataKey="kickoff_time" tick={{ fontSize: 10, fill: "#e5e7eb" }} stroke="#fff" />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#FFD700", color: "#fff" }} />
                  <Line type="monotone" dataKey={chartType === "elo" ? "Elo_Rating" : chartType === "off" ? "XG_avg" : "XGC_avg"} stroke="#FFD700" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
