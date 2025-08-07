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
} from "recharts";
import { useLocation } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";

export default function Team_Analytics_Individual() {
  const { fetchIfNeeded, TeamData } = useStatsData();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";
  const [eloData, setEloData] = useState([]);
  const [history, setHistory] = useState([]);
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
        XG_avg: Number(parseFloat(r.XG_avg).toFixed(1)),
        XGC_avg: Number(parseFloat(r.XGC_avg).toFixed(1)),
        name: r.name || r.Team
      })));
      setHistory(Object.values(eloRaw).map(r => ({
        kickoff_time: r.kickoff_time,
        XG_avg: Number(parseFloat(r.XG_avg).toFixed(1)),
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
  const eloChartData = eloData.filter((d) => d.name === teamFilter);

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
      <div className="flex justify-center gap-6">
        <button
          onClick={() => setChartType("elo")}
          className={`px-4 py-2 rounded ${
            chartType === "elo"
              ? "underline text-royal-gold"
              : "text-royal-beige"
          }`}
        >
          ELO
        </button>
        <button
          onClick={() => setChartType("off")}
          className={`px-4 py-2 rounded ${
            chartType === "off"
              ? "underline text-royal-gold"
              : "text-royal-beige"
          }`}
        >
          Offensive
        </button>
        <button
          onClick={() => setChartType("def")}
          className={`px-4 py-2 rounded ${
            chartType === "def"
              ? "underline text-royal-gold"
              : "text-royal-beige"
          }`}
        >
          Defensive
        </button>
      </div>

      {/* Line Chart */}
      <div className="bg-royal-red p-4 rounded shadow border border-royal-gold w-full max-w-6xl">
        <h2 className="text-xl font-semibold text-center text-royal-gold mb-2">
          {chartType === "elo"
            ? "ELO Rating Over Time"
            : chartType === "off"
            ? "Average XG Over Time"
            : "Average XGC Over Time"}
        </h2>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={
              chartType === "elo"
                ? eloData.Elo_Rating
                : chartType === "off"
                ? eloData.XG_avg
                : eloData.XGC_avg
            }
          >

            <XAxis
              dataKey="kickoff_time"
              tick={{ fontSize: 10 }}
              stroke="#fff"
            />
            <YAxis stroke="#fff" domain={["dataMin", "dataMax"]} />
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
                  ? "avg_xg"
                  : "avg_xgc"
              }
              stroke="#FFD700"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}