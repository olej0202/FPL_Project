import React, { useEffect, useState } from "react";
import teamLogos from "./utils/team_logos";
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

export default function Team_Analytics_Individual() {
  const { fetchIfNeeded, TeamData,TeamThreatData } = useStatsData();
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
      <BarChart data={threatRows} margin={{ top: 20, right: 10, left: 30, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff40" />
        <XAxis dataKey="pos_group" stroke="#f7ead6" />
        <YAxis hide stroke="#f7ead6" domain={[0, "dataMax"]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#5A0000",
            color: "#FFD700",
            border: "1px solid #FFD700",
          }}
          formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
        />
        <Bar dataKey="threat" fill="#B8860B">
          <LabelList dataKey="threat" position="top" formatter={(v) => v.toFixed(2)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
)}


    </div>
  );
}



