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

export default function Team_Analytics_Individual() {
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";
  const [data, setData] = useState([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [teams, setTeams] = useState([]);
  const [latestStats, setLatestStats] = useState({});
  const [allTeamStats, setAllTeamStats] = useState([]);
  const [showOffensive, setShowOffensive] = useState(true);
  const location = useLocation();
  const [chartHeight, setChartHeight] = useState(300);


  // Fetch team list & determine initial teamFilter
  useEffect(() => {
    fetch(`${API_URL}_unique`)
      .then((res) => res.json())
      .then((raw) => {
        const uniqueTeams = [...new Set(raw)].filter(Boolean).sort();
        setTeams(uniqueTeams);

        const passedTeam = location.state?.selectedTeam;
        if (passedTeam && uniqueTeams.includes(passedTeam)) {
          setTeamFilter(passedTeam);
        } else if (!passedTeam && uniqueTeams.length > 0) {
          setTeamFilter(uniqueTeams[0]);
        }
      })
      .catch((err) => console.error("Failed to fetch teams:", err));
  }, [location.state]);

  useEffect(() => {
  const handleResize = () => {
    setChartHeight(window.innerWidth < 640 ? 400 : 300);
  };

  handleResize(); // Set on first render
  window.addEventListener("resize", handleResize);

  return () => window.removeEventListener("resize", handleResize);
}, []);


  // Fetch individual team data
  useEffect(() => {
    if (!teamFilter) return;
    const fetchData = async () => {
      const res = await fetch(`${API_URL}?team=${encodeURIComponent(teamFilter)}`);
      const raw = await res.json();
      const sorted = raw.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
      setData(sorted);

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        setLatestStats({
          XGA: latest.XGA || 0,
          XGH: latest.XGH || 0,
          XG_slope: latest.XG_slope || 0,
          XG_avg: latest.XG_avg || 0,
          XGCA: latest.XGCA || 0,
          XGCH: latest.XGCH || 0,
          XGC_slope: latest.XGC_slope || 0,
          XGC_avg: latest.XGC_avg || 0,
          Elo_Rating: latest.Elo_Rating || 0,
        });
      }
    };
    fetchData();
  }, [teamFilter]);

  // Fetch all teams' latest stats (not needed here, but kept if you want to use it)
  useEffect(() => {
    const fetchAllTeamStats = async () => {
      try {
        const res = await fetch(API_URL);
        const raw = await res.json();

        const latestPerTeam = raw.reduce((acc, row) => {
          const team = row.name || row.Team;
          if (!acc[team] || new Date(row.kickoff_time) > new Date(acc[team].kickoff_time)) {
            acc[team] = row;
          }
          return acc;
        }, {});

        const latestArray = Object.values(latestPerTeam)
          .map((row) => ({
            ...row,
            Elo_Rating: Number(parseFloat(row.Elo_Rating).toFixed(1)),
            XG_avg: parseFloat(row.XG_avg).toFixed(2),
            XGC_avg: parseFloat(row.XGC_avg).toFixed(2),
          }))
          .sort((a, b) => b.Elo_Rating - a.Elo_Rating);

        setAllTeamStats(latestArray);
      } catch (err) {
        console.error("Error fetching all team stats:", err);
      }
    };

    fetchAllTeamStats();
  }, []);

  const statCards = showOffensive
    ? [
        { title: "Away Attack Index", value: latestStats.XGA },
        { title: "Home Attack Index", value: latestStats.XGH },
        { title: "Overall Attack Index", value: latestStats.XG_avg },
        { title: "Attack    Form", value: latestStats.XG_slope },
      ]
    : [
        { title: "Away Defence Index", value: latestStats.XGCA },
        { title: "Home Defence Index", value: latestStats.XGCH },
        { title: "Overall Defence Index", value: latestStats.XGC_avg },
        { title: "Defensive Form", value: latestStats.XGC_slope },
      ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-10">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Team Analytics</h1>

      {/* Team Logo */}
      <div className="flex flex-col items-center justify-center mb-4 space-y-4">
        {teamFilter && teamLogos[teamFilter] && (
          <img
            src={teamLogos[teamFilter]}
            alt={`${teamFilter} logo`}
            className="h-28 w-auto object-contain"
          />
        )}
      </div>

      {/* Team Selector */}
      <div className="w-full max-w-sm">
        <select
          className="border border-royal-gold p-2 rounded w-full text-center bg-beige text-black"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </div>

      {/* Toggle Button */}
      {/* Toggle Switch Tabs */}
<div className="flex justify-center gap-6 mb-4">
  <button
    onClick={() => setShowOffensive(true)}
    className={`px-4 py-2 font-semibold bg-transparent focus:outline-none focus:ring-0 ${
      showOffensive
        ? "underline underline-offset-4 border-b-4 border-none text-royal-gold"
        : "text-royal-beige hover:text-royal-gold hover:border-none border-none"
    }`}
  >
    Offensive Stats
  </button>

  <button
    onClick={() => setShowOffensive(false)}
    className={`px-4 py-2 font-semibold bg-transparent focus:outline-none focus:ring-0 ${
      !showOffensive
        ? "underline underline-offset-4 border-b-4 border-none text-royal-gold"
        : "text-royal-beige hover:text-royal-gold hover:border-none border-none"
    }`}
  >
    Defensive Stats
  </button>
</div>






      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
        {statCards.map((stat, idx) => {
          const isSlopeCard = stat.title.includes("Form");
          const isDefensive = stat.title.includes("Defensive");

          let value = parseFloat(stat.value);
          let displayValue = isNaN(value) ? "—" : value.toFixed(2);
          let arrow = "";

          if (isSlopeCard) {
            if (isDefensive) value *= -1;

            if (value >= 0.03) arrow = "↑↑";
            else if (value > 0) arrow = "↑";
            else if (value <= -0.03) arrow = "↓↓";
            else if (value < 0) arrow = "↓";

            displayValue = "";
          }

          return (
            <div
              key={idx}
              className="bg-royal-red text-royal-beige p-3 border border-royal-gold rounded-lg shadow text-center"
            >
              <h2 className="text-1xl font-semibold mb-1">{stat.title}</h2>
              <p className="text-2xl font-bold">
                {displayValue} {arrow}
              </p>
            </div>
          );
        })}
      </div>

      {/* Line Charts */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-8 w-full max-w-6xl">
        {/*
        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold">
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold">
            {showOffensive ? "XG Over Time" : "XGC Over Time"}
          </h2>
          <ResponsiveContainer width="100%" height={chartHeight}>

            <LineChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="#333" />
              
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" padding={{ left: 0 }}/>
              <YAxis stroke="#fff" />
              <Tooltip contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }} />
              <Line
                type="monotone"
                dataKey={showOffensive ? "XG" : "XGC"}
                stroke="#FFD700"
                name={showOffensive ? "Expected Goals (XG)" : "Expected Goals Conceded (XGC)"}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div> */}

        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold">
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold">ELO Rating Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
              <YAxis domain={["dataMin", "dataMax"]} stroke="#fff" tick={false} />
              <Tooltip contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }} />
              <Line type="monotone" dataKey="Elo_Rating" stroke="#FFD700" name="ELO Rating" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
