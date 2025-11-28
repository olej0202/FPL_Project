// src/Team_Analytics_Individual.jsx
import React, { useEffect, useMemo, useState } from "react";
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

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

export default function Team_Analytics_Individual() {
  const {
    fetchIfNeeded,
    TeamData,
    TeamThreatData,
    TeamLineupsData,
    selected_team,
    setselected_team,
  } = useStatsData();

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

  // ---------- Init & fetch ---------- //
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
    setTeamFilter(
      passed && uniqueTeams.includes(passed) ? passed : selected_team
    );
  }, [TeamData?.current?.length, location.state, selected_team]);

  // Current team history + latest stats
  useEffect(() => {
    if (!teamFilter || !TeamData?.current) return;
    const teamHistory = TeamData.current
      .filter((r) => (r.name || r.Team) === teamFilter)
      .sort(
        (a, b) =>
          new Date(a.kickoff_time).getTime() -
          new Date(b.kickoff_time).getTime()
      );
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

  // ---------- Derived data ---------- //
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

  const eloChartData = useMemo(
    () => eloData.filter((d) => d.name === teamFilter),
    [eloData, teamFilter]
  );
  const offChartData = useMemo(
    () => offData.filter((d) => d.name === teamFilter),
    [offData, teamFilter]
  );
  const defChartData = useMemo(
    () => defData.filter((d) => d.name === teamFilter),
    [defData, teamFilter]
  );

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
        pos_group:
          r?.pos_group ?? r?.position_group ?? r?.PosGroup ?? "Unknown",
        threat: Number(
          r?.Threat ?? r?.Treat ?? r?.threat ?? r?.treat ?? NaN
        ),
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
        pos_latest:
          r.pos_latest ??
          r.pos_group ??
          r.position_group ??
          r.PosGroup ??
          r.position ??
          "UNK",
        start_percantage: r.appear_pct_last5 ?? 0,
      }))
      .filter((r) => r.player_team === teamFilter);
  }, [TeamLineupsData, teamFilter]);

  // For shirt images
  const teamCode = useMemo(() => {
    const src = Array.isArray(TeamData?.current) ? TeamData.current : [];
    const row = src
      .filter((r) => (r.name || r.Team) === teamFilter)
      .sort(
        (a, b) =>
          new Date(a.kickoff_time).getTime() -
          new Date(b.kickoff_time).getTime()
      )
      .at(-1);
    return row?.code ?? row?.team_code ?? row?.Code ?? null;
  }, [TeamData, teamFilter]);

  // ---------- Helpers: role placement on pitch ---------- //
  const normalizeRole = (pos_latest = "") => {
    const p = String(pos_latest).toLowerCase();
    if (p.includes("gk")) return "GK";
    if (p.includes("lw")) return "LW";
    if (p.includes("rw")) return "RW";
    if (p.includes("lb") || p.includes("dl") || p.includes("lwb")) return "LB";
    if (p.includes("rb") || p.includes("dr") || p.includes("rwb")) return "RB";
    if (p.includes("cb") || (p.includes("def") && !p.includes("wb")))
      return "CB";
    if (p.includes("cdm") || p.includes("dm")) return "DM";
    if (p.includes("cam") || p.includes("am")) return "AM";
    if (p.includes("cm") || p.includes("mc") || p.includes("mid")) return "CM";
    if (
      p.includes("st") ||
      p.includes("cf") ||
      p.includes("fw") ||
      p.includes("fwd") ||
      p.includes("striker")
    )
      return "ST";
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

  const ROLE_SPAN_MAX = {
    ST: 34,
    AM: 30,
    CM: 42,
    DM: 30,
    CB: 28,
    LB: 18,
    RB: 18,
    LW: 24,
    RW: 24,
    GK: 0,
  };
  const ROLE_MIN_GAP = {
    ST: 10,
    AM: 9,
    CM: 12,
    DM: 10,
    CB: 9,
    LB: 8,
    RB: 8,
    LW: 10,
    RW: 10,
    GK: 0,
  };

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
    if (!Array.isArray(lineupLatestStats) || lineupLatestStats.length === 0)
      return [];
    const groups = lineupLatestStats.reduce((acc, r) => {
      const role = normalizeRole(r.pos_latest ?? r.pos_group ?? r.position);
      (acc[role] ||= []).push(r);
      return acc;
    }, {});
    const rolesOrder = [
      "ST",
      "LW",
      "RW",
      "AM",
      "CM",
      "DM",
      "LB",
      "CB",
      "RB",
      "GK",
    ];
    const out = [];
    rolesOrder.forEach((role) => {
      const arr = groups[role] || [];
      const n = arr.length;
      const base = BASE[role] || BASE.CM;
      arr
        .slice()
        .sort(
          (a, b) =>
            (b.start_percantage ?? 0) - (a.start_percantage ?? 0) ||
            String(a.player_name).localeCompare(String(b.player_name))
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

  // ---------- UI ---------- //
  const renderFormArrow = (val) => {
    if (!Number.isFinite(val)) return "";
    if (val >= 0.03) return "↑↑";
    if (val > 0) return "↑";
    if (val <= -0.03) return "↓↓";
    if (val < 0) return "↓";
    return "";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <header
          style={{
            marginBottom: "1.75rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.9rem",
              fontWeight: 700,
            }}
          >
            Team Analytics
          </h1>
          <p
            style={{
              marginTop: "0.4rem",
              fontSize: "0.85rem",
              color: "#d1c3a9",
              maxWidth: "40rem",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Switch teams, view recent form, lineups, and where they’re most
            vulnerable.
          </p>
        </header>

        {/* Team selector */}
        <section
          style={{
            marginBottom: "1.5rem",
            borderRadius: "1rem",
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.8)",
            padding: "1rem 1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                minWidth: 0,
              }}
            >
              {teamFilter && teamLogos[teamFilter] && (
                <img
                  src={teamLogos[teamFilter]}
                  alt={`${teamFilter} logo`}
                  style={{
                    height: "3rem",
                    width: "3rem",
                    objectFit: "contain",
                    filter: "drop-shadow(0 0 8px rgba(0,0,0,0.8))",
                  }}
                />
              )}
              <div>
                <div
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {teamFilter || "Select a team"}
                </div>
                {teamCode != null && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: PALETTE.gold,
                      opacity: 0.85,
                    }}
                  >
                    Team code: {teamCode}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                minWidth: "10rem",
                width: "100%",
                maxWidth: "16rem",
              }}
            >
              <select
                value={teamFilter || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setTeamFilter(val);
                  if (typeof setselected_team === "function")
                    setselected_team(val);
                }}
                aria-label="Select team"
                style={{
                  height: "2.4rem",
                  width: "100%",
                  borderRadius: "0.6rem",
                  border: `1px solid ${PALETTE.gold}`,
                  backgroundColor: "rgba(0,0,0,0.9)",
                  color: PALETTE.beige,
                  padding: "0 0.75rem",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              >
                {teams.map((t) => (
                  <option
                    key={t}
                    value={t}
                    style={{
                      backgroundColor: "#000000",
                      color: PALETTE.beige,
                    }}
                  >
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Off/Def toggle & stat cards */}
        <section
          style={{
            marginBottom: "1.75rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "0.75rem",
              marginBottom: "0.9rem",
            }}
          >
            <button
              type="button"
              onClick={() => setShowOffensive(true)}
              style={{
                height: "2.2rem",
                padding: "0 1.1rem",
                borderRadius: "999px",
                border: `1px solid ${
                  showOffensive ? PALETTE.gold : "rgba(148,163,184,0.4)"
                }`,
                backgroundColor: showOffensive
                  ? PALETTE.gold
                  : "rgba(0,0,0,0.7)",
                color: showOffensive ? PALETTE.black : PALETTE.beige,
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Offensive
            </button>
            <button
              type="button"
              onClick={() => setShowOffensive(false)}
              style={{
                height: "2.2rem",
                padding: "0 1.1rem",
                borderRadius: "999px",
                border: `1px solid ${
                  !showOffensive ? PALETTE.gold : "rgba(148,163,184,0.4)"
                }`,
                backgroundColor: !showOffensive
                  ? PALETTE.gold
                  : "rgba(0,0,0,0.7)",
                color: !showOffensive ? PALETTE.black : PALETTE.beige,
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Defensive
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {statCards.map((stat) => {
              const val = Number(stat.value);
              const isForm = /Form/i.test(stat.title);
              const disp = isForm
                ? null
                : Number.isFinite(val)
                ? val.toFixed(2)
                : "—";
              const arrow = isForm ? renderFormArrow(val) : "";
              return (
                <div
                  key={stat.title}
                  style={{
                    borderRadius: "0.9rem",
                    border: `1px solid ${PALETTE.gold}`,
                    background:
                      "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
                    padding: "0.75rem 0.8rem",
                    textAlign: "center",
                    boxShadow: "0 16px 32px rgba(0,0,0,0.9)",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#d1c3a9",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {stat.title}
                  </h3>
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: 600,
                      color: PALETTE.gold,
                      minHeight: "1.8rem",
                    }}
                  >
                    {disp ?? ""} {arrow}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Latest Lineup on Pitch (layout kept the same) */}
        {teamFilter && (
          <section
            style={{
              marginBottom: "1.75rem",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                textAlign: "center",
                marginBottom: "0.75rem",
              }}
            >
              Latest Lineup — % Starts last 5 matches
            </h2>
            <div
              style={{
                margin: "0 auto",
                width: "100%",
                maxWidth: "520px",
                aspectRatio: "1 / 1.6",
                backgroundImage: `url(${pitch})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "50% 50%",
                borderRadius: "1.1rem",
                border: `1px solid rgba(255,255,255,0.35)`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
                position: "relative",
              }}
            >
              {lineupOnPitch.map((p) => (
                <div
                  key={p.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
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
                  <div
                    style={{
                      padding: "0.15rem 0.35rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "rgba(0,0,0,0.75)",
                      border: "1px solid rgba(248,250,252,0.15)",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.8)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "#f9fafb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(p.name ?? "")
                        .trim()
                        .split(/[\,\s;]+/)
                        .pop() || ""}
                    </div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "#e5e7eb",
                      }}
                    >
                      {Number.isFinite(p.pct)
                        ? `${Math.round(p.pct)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Threat by Opposition Position (mirrored pitch, layout kept) */}
        {teamFilter && (
          <section
            style={{
              marginBottom: "1.75rem",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                textAlign: "center",
                marginBottom: "0.75rem",
              }}
            >
              Threat by Opposition Position
            </h2>
            <div
              style={{
                margin: "0 auto",
                width: "100%",
                maxWidth: "520px",
                aspectRatio: "1 / 1.6",
                backgroundImage: `url(${pitch})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "50% 50%",
                borderRadius: "1.1rem",
                border: `1px solid rgba(255,255,255,0.35)`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
                position: "relative",
              }}
            >
              {threatsOnPitch.map((t) => {
                const alpha =
                  maxT > minT
                    ? 0.35 + 0.5 * ((t.threat - minT) / (maxT - minT))
                    : 0.5;
                return (
                  <div
                    key={t.role}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-center flex flex-col items-center"
                    style={{ left: `${t.x}%`, top: `${t.y}%` }}
                  >
                    <div
                      style={{
                        padding: "0.15rem 0.4rem",
                        borderRadius: "0.6rem",
                        border: "1px solid rgba(248,250,252,0.2)",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.85)",
                        backgroundColor: `rgba(185,28,28,${alpha})`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: PALETTE.gold,
                        }}
                      >
                        {t.role}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#f9fafb",
                        }}
                      >
                        {Number.isFinite(t.threat)
                          ? t.threat.toFixed(2)
                          : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Chart type toggle */}
        <h2
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            textAlign: "center",
            marginBottom: "0.75rem",
          }}
        >
          Team Historical Development
        </h2>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.6rem",
            marginBottom: "0.85rem",
          }}
        >
          {["elo", "off", "def"].map((type) => {
            const labels = {
              elo: "ELO Rating",
              off: "Offensive Index",
              def: "Defensive Index",
            };
            const isSel = chartType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setChartType(type)}
                aria-pressed={isSel}
                style={{
                  height: "2.2rem",
                  padding: "0 1rem",
                  borderRadius: "999px",
                  border: `1px solid ${
                    isSel ? PALETTE.gold : "rgba(148,163,184,0.4)"
                  }`,
                  backgroundColor: isSel
                    ? PALETTE.gold
                    : "rgba(0,0,0,0.7)",
                  color: isSel ? PALETTE.black : PALETTE.beige,
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {labels[type]}
              </button>
            );
          })}
        </div>

        {/* Line chart card */}
        <section
          style={{
            marginBottom: "1.75rem",
          }}
        >
          <div
            style={{
              borderRadius: "1rem",
              border: `1px solid ${PALETTE.gold}`,
              background:
                "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
              boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
              padding: "0.8rem 0.9rem 1rem",
            }}
          >
            <h3
              style={{
                textAlign: "center",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#d1c3a9",
                marginBottom: "0.4rem",
              }}
            >
              {chartType === "elo"
                ? "ELO Rating Over Time"
                : chartType === "off"
                ? "Offensive Rating Over Time"
                : "Defensive Rating Over Time"}
            </h3>
            <div style={{ height: "18rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={
                    chartType === "elo"
                      ? eloChartData
                      : chartType === "off"
                      ? offChartData
                      : defChartData
                  }
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#333" />
                  <XAxis
                    dataKey="kickoff_time"
                    tick={{ fontSize: 10, fill: "#e5e7eb" }}
                    stroke="#e5e7eb"
                  />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      borderColor: PALETTE.gold,
                      color: "#f9fafb",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={
                      chartType === "elo"
                        ? "Elo_Rating"
                        : chartType === "off"
                        ? "XG_avg"
                        : "XGC_avg"
                    }
                    stroke={PALETTE.gold}
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
