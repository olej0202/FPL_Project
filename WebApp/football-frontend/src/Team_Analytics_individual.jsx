import React, { useEffect, useState } from "react";
import teamLogos from "./utils/team_logos";
import teamKits from "./utils/team_kits";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import { useLocation } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";
import pitch from "./assets/pitch_lineup.png";

export default function Team_Analytics_Individual() {
  const { fetchIfNeeded, TeamData,TeamThreatData,TeamLineupsData } = useStatsData();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";
  const [eloData, setEloData] = useState([]);
  const [offData, setoffData] = useState([]);
  const [defData, setdefData] = useState([]);
  const [data, setData] = useState([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [teams, setTeams] = useState([]);
  const [latestStats, setLatestStats] = useState({});
  const [showOffensive, setShowOffensive] = useState(true);
  const [chartType, setChartType] = useState("elo");     // ← 'elo'|'off'|'def'
  const [chartHeight, setChartHeight] = useState(300);
  const location = useLocation();

  useEffect(() => {
    const init = async () => {
      await fetchIfNeeded();
      const eloRes = await fetch(API_URL);
      const eloRaw = await eloRes.json();
      const latestPerTeam = eloRaw.reduce((acc, row) => {
        const team = row.name || row.Team;
        if (!acc[team] || new Date(row.kickoff_time) > new Date(acc[team].kickoff_time)) {
          acc[team] = row;
        }
        return acc;
      }, {});
      setEloData(Object.values(eloRaw).map(r => ({
        kickoff_time: r.kickoff_time,
        Elo_Rating: Number(parseFloat(r.Elo_Rating).toFixed(1)),
        name: r.name || r.Team
      })));
      setoffData(Object.values(eloRaw).map(r => ({
        kickoff_time: r.kickoff_time,
        XG_avg: Number(parseFloat(r.XG_avg).toFixed(1)),
        name: r.name || r.Team
      })));
      setdefData(Object.values(eloRaw).map(r => ({
        kickoff_time: r.kickoff_time,
        XGC_avg: Number(parseFloat(r.XGC_avg).toFixed(1)),
        name: r.name || r.Team
      })));
    };
    init();
  }, [fetchIfNeeded]);

  useEffect(() => {
    if (!TeamData?.current || TeamData.current.length === 0) return;
    const uniqueTeams = [...new Set(TeamData.current.map((d) => d.name || d.Team))]
      .filter(Boolean)
      .sort();
    setTeams(uniqueTeams);
    const passed = location.state?.selectedTeam;
    setTeamFilter(passed && uniqueTeams.includes(passed) ? passed : uniqueTeams[0]);
  }, [TeamData?.current?.length, location.state]);

  useEffect(() => {
    const handleResize = () => setChartHeight(window.innerWidth < 640 ? 400 : 300);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!teamFilter || !TeamData?.current) return;
    const teamHistory = TeamData.current
      .filter((r) => (r.name || r.Team) === teamFilter)
      .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    setData(teamHistory);
    const latest = teamHistory[teamHistory.length - 1];
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
        { title: "Defensive Form", value: latestStats.XGC_slope*-1 },
      ];

  // Filter for selected team Elo history
  const eloChartData = eloData.filter(d => d.name === teamFilter);

 const offChartData = offData.filter(d => d.name === teamFilter);


const defChartData = defData.filter(d => d.name === teamFilter);
// Threat list for the currently selected team
const threatRows = React.useMemo(() => {
  if (!teamFilter) return [];

  const src = Array.isArray(TeamThreatData?.current)
    ? TeamThreatData.current
    : Array.isArray(TeamThreatData)
    ? TeamThreatData
    : [];

  if (src.length === 0) return [];

  return src
    .filter(r => (r?.opponent ?? r?.Opponent) === teamFilter)
    .map(r => {
      const threat = Number(
        r?.Threat ?? r?.Treat ?? r?.threat ?? r?.treat ?? NaN
      );
      const pos = r?.pos_group ?? r?.position_group ?? r?.PosGroup ?? "Unknown";
      return { pos_group: pos, threat };
    })
    .filter(r => Number.isFinite(r.threat))
    .sort((a, b) => b.threat - a.threat);
}, [TeamThreatData, teamFilter]);

// Latest lineup — appearance % over last 5 dates (from TeamLineupsData)
const lineupLatestStats = React.useMemo(() => {
  if (!teamFilter) return [];

  // normalize source shape
  const src = Array.isArray(TeamLineupsData?.current)
    ? TeamLineupsData.current
    : Array.isArray(TeamLineupsData)
    ? TeamLineupsData
    : [];
  if (src.length === 0) return [];

  // map + filter by current team
  return src
    .map(r => ({
      player_name: r.player_name ?? r.Player ?? r.name ?? "",
      player_team: r.player_team ?? r.Team ?? r.team ?? "",
      pos_latest:  r.pos_latest  ?? r.pos_group ?? r.position_group ?? r.PosGroup ?? r.position ?? "UNK",
      start_percantage:  r.appear_pct_last5  ?? 0,
    }))
    .filter(r => r.player_team === teamFilter);
}, [TeamLineupsData, teamFilter]);

const teamCode = React.useMemo(() => {
  const src = Array.isArray(TeamData?.current) ? TeamData.current : [];
  const row = src
    .filter(r => (r.name || r.Team) === teamFilter)
    .sort((a,b) => new Date(a.kickoff_time) - new Date(b.kickoff_time))
    .at(-1); // latest entry for this team
  return row?.code ?? row?.team_code ?? row?.Code ?? null;
}, [TeamData, teamFilter]);

// anywhere in your JSX:
{teamCode != null && (
  <div className="text-sm text-royal-gold">FPL team code: {teamCode}</div>
)}


// Normalize various position labels into layout roles
// ── Role normalizer (keeps your mappings, adds a few aliases) ─────────────────
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
  return "CM"; // sensible default
};

// ── Base anchors (top=attack 0% → bottom 100%) ───────────────────────────────
const BASE = {
  GK: { x: 50, y: 92 },
  LB: { x: 14, y: 60 },
  CB: { x: 50, y: 73 },
  RB: { x: 88, y: 60 },
  DM: { x: 50, y: 55 },
  CM: { x: 50, y: 40 },
  AM: { x: 50, y: 25 },
  LW: { x: 14, y: 25 },
  RW: { x: 88, y: 25 },
  ST: { x: 50, y: 10 },
};

// ── Dynamic spacing config (wider for CM/FW, tighter for CB) ─────────────────
const ROLE_SPAN_MAX = {
  ST: 34, AM: 30, CM: 42, DM: 30, CB: 28, LB: 18, RB: 18, LW: 24, RW: 24, GK: 0,
};
const ROLE_MIN_GAP = {
  ST: 10, AM: 9,  CM: 12, DM: 10, CB: 9,  LB: 8,  RB: 8,  LW: 10, RW: 10, GK: 0,
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Spread multiple players across a row (role-aware)
const placeWithinRow = (base, i, n, role) => {
  if (n <= 1) return base;

  const maxSpan = ROLE_SPAN_MAX[role] ?? 26;
  const gap     = ROLE_MIN_GAP[role] ?? 9;

  // Span grows with count but is capped; give midfield 3 a guaranteed boost
  let totalSpan = Math.min(maxSpan, gap * (n - 1));
  if (role === "CM" && n >= 3) totalSpan = Math.max(totalSpan, 50);
  if (role === "CM" && n >= 2) totalSpan = Math.max(totalSpan, 32);
  if (role === "CB" && n >= 3) totalSpan = Math.max(totalSpan, 55);
  if (role === "CB" && n >= 2) totalSpan = Math.max(totalSpan, 32);
  if (role === "DM" && n >= 2) totalSpan = Math.max(totalSpan, 26);
  if (role === "ST" && n >= 2) totalSpan = Math.max(totalSpan, 32);
  if (role === "AM" && n >= 2) totalSpan = Math.max(totalSpan, 32);

  const step  = totalSpan / (n - 1);
  const start = base.x - totalSpan / 2;
  const x     = clamp(start + step * i, 5, 95); // keep inside pitch edges
  const y     = base.y;
  return { x, y };
};

// ── Build positioned lineup items ────────────────────────────────────────────
const lineupOnPitch = React.useMemo(() => {
  if (!Array.isArray(lineupLatestStats) || lineupLatestStats.length === 0) return [];

  // group by normalized role
  const groups = lineupLatestStats.reduce((acc, r) => {
    const role = normalizeRole(r.pos_latest ?? r.pos_group ?? r.position);
    (acc[role] ||= []).push(r);
    return acc;
  }, {});

  const rolesOrder = ["ST","LW","RW","AM","CM","DM","LB","CB","RB","GK"];
  const out = [];

  rolesOrder.forEach(role => {
    const arr  = groups[role] || [];
    const n    = arr.length;
    const base = BASE[role] || BASE.CM;

    // stable order: highest start % first, then name
    arr
      .slice()
      .sort((a, b) =>
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
          x, y,
          pct: (typeof pct === "number" && isFinite(pct)) ? pct : null,
        });
      });
  });

  return out;
}, [lineupLatestStats]);


  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-10">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Team Analytics</h1>

      <img src={teamLogos[teamFilter] || ""} alt={`${teamFilter} logo`} className="h-28 object-contain" />

      <select
        className="border border-royal-gold w-full max-w-sm text-black text-center py-2"
        value={teamFilter}
        onChange={(e) => setTeamFilter(e.target.value)}
      >
        {teams.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <div className="flex justify-center gap-6">
        <button onClick={() => setShowOffensive(true)} className={showOffensive ? " focus:outline-none underline text-royal-gold bg-transparent border-none" : "focus:outline-none text-royal-beige bg-transparent border-none"}>Offensive</button>
        <button onClick={() => setShowOffensive(false)} className={!showOffensive ? "focus:outline-none underline text-royal-gold bg-transparent border-none": " focus:outline-none text-royal-beige bg-transparent border-none"}>Defensive</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
        {statCards.map((stat) => {
          const val = parseFloat(stat.value);
          const disp = stat.title.includes("Form")
            ? ""
            : isNaN(val) ? "—" : val.toFixed(2);
          const arrow = stat.title.includes("Form")
            ? val >= 0.03 ? "↑↑" : val > 0 ? "↑" : val <= -0.03 ? "↓↓" : val < 0 ? "↓" : ""
            : "";
          return (
            <div key={stat.title} className="bg-royal-red text-royal-beige p-3 border border-royal-gold rounded-lg">
              <h2 className="font-semibold text-center">{stat.title}</h2>
              <p className="text-2xl text-center">{disp} {arrow}</p>
            </div>
          );
        })}
      </div>

       <h2 className="text-xl font-semibold mb-3 text-center text-royal-beige mb-2">
      Latest Lineup — 5-match Appearance % 
    </h2>
{/* Lineup on Pitch */}
{teamFilter && (
  <div
  className="w-full max-w-[480px] aspect-[1/2] bg-no-repeat bg-cover border border-royal-gold rounded-lg relative mt-4"
  style={{
    backgroundImage: `url(${pitch})`,
    backgroundPosition: "50% 50%",
  }}
>
 
    {lineupOnPitch.map(p => (
      <div
  key={p.key}
  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center"
  style={{ left: `${p.x}%`, top: `${p.y}%` }}
>
  <img
    src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.png`}
    alt=""
    width={50}
    height={50}
    className="block mx-auto w-[50px] h-[50px] object-contain mb-1 pointer-events-none select-none"
    onError={(e) => { e.currentTarget.style.display = "none"; }}
  />

  <div className="px-3 py-1 rounded-md bg-black/70 border border-royal-gold shadow">
    <div className="text-xs font-semibold text-white whitespace-nowrap">{(p.name ?? "").trim().split(/[,\s]+/).pop() || ""}</div>
    <div className="text-[12px] text-white">
      {Number.isFinite(p.pct) ? `${Math.round(p.pct)}%` : "—"}
    </div>
  </div>
</div>
    ))}
  </div>
)}
{/* Chart-type buttons */}
<div className="flex justify-center space-x-2 focus:outline-none focus:ring-0 active:outline-none active:ring-0  hover:outline-none hover:ring-0">
  {["elo","off","def"].map((type, i) => {
    const labels = { elo: "ELO", off: "Offensive", def: "Defensive" };
    const isSel = chartType === type;
    return (
      <button
        key={type}
        onClick={() => setChartType(type)}
        className={`
          px-2 py-1 bg-transparent focus:outline-none focus:ring-0 active:outline-none active:ring-0 border-none
          ${isSel ? "text-royal-gold underline" : "text-white"}
        `}
      >
        {labels[type]}
      </button>
    );
  })}
</div>

      {/* Line Chart */}
      <div className="bg-royal-red p-1 rounded shadow border border-royal-gold w-full max-w-6xl mt-8">
        <h2 className="text-xl font-semibold mb-4 text-center text-royal-beige capitalize">
          {chartType === "elo"
            ? "ELO Rating Over Time"
            : chartType === "off"
            ? "Off Rating Over Time"
            : "Def Rating Over Time"}
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={
              chartType === "elo"
                ? eloChartData
                : chartType === "off"
                ? offChartData
                : defChartData
            }
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >


            <XAxis
              dataKey="kickoff_time"
              tick={{ fontSize: 10 }}
              stroke="#fff"
            />
            <YAxis hide stroke="#fff" domain={["dataMin", "dataMax"]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#5A0000",
                color: "#FFD700",
                border: "1px solid #FFD700",
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
              stroke="#FFD700"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Positional Threat list */}
{/* Positional Threat — Bar Chart */}
{teamFilter && (
  <div className="bg-royal-red p-1 rounded shadow border border-royal-gold w-full max-w-6xl mt-8">
    <h2 className="text-xl font-semibold mb-4 text-center text-royal-beige">
      Positional Threat Against
    </h2>

    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={threatRows} margin={{ top: 20, right: 10, left: 5, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff40" />
        <XAxis dataKey="pos_group" stroke="#f7ead6" />
        <YAxis hide stroke="#d6ddf7ff" domain={[0, "dataMax"]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#5A0000",
            color: "#FFD700",
            border: "1px solid #FFD700",
          }}
          formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
        />
        <Bar dataKey="threat" fill="#B8860B" >
          <LabelList dataKey="threat" position="top" formatter={(v) => v.toFixed(2)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
)}




    </div>
  );
}



