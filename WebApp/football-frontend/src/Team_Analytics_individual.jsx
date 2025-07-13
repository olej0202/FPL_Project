import React, { useEffect, useState } from "react";
import teamLogos from "./utils/team_logos"; // adjust path as needed
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList
} from "recharts";
export default function Team_Analytics_Individual() {
  // ... your component logic

const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";
  const [data, setData] = useState([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [teams, setTeams] = useState([]);
  const [latestStats, setLatestStats] = useState({});
  const [allTeamStats, setAllTeamStats] = useState([]);
  const [showOffensive, setShowOffensive] = useState(true);


  // Fetch team list
  useEffect(() => {
    fetch(`${API_URL}_unique`)
      .then((res) => res.json())
      .then((raw) => {
        const uniqueTeams = [...new Set(raw)].filter(Boolean).sort();
        setTeams(uniqueTeams);
        if (!teamFilter && uniqueTeams.length > 0) {
          setTeamFilter(uniqueTeams[0]);
        }
      })
      .catch((err) => console.error("Failed to fetch teams:", err));
  }, []);

  // Fetch single team data
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
          Elo_Rating: latest.Elo_Rating || 0
        });
      }
    };
    fetchData();
  }, [teamFilter]);

  // Fetch all teams' latest stats
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
            XGC_avg: parseFloat(row.XGC_avg).toFixed(2)
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
        { title: "Attack Form", value: latestStats.XG_slope }
      ]
    : [
        { title: "Away Defence Index", value: latestStats.XGCA },
        { title: "Home Defence Index", value: latestStats.XGCH },
        { title: "Overall Defence Index", value: latestStats.XGC_avg },
        { title: "Defensive Form", value: latestStats.XGC_slope }
        
      ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-10">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Team Analytics</h1>
      <div className="flex flex-col items-center justify-center mb-4 space-y-4">
  {teamFilter && teamLogos[teamFilter] && (
    <img
      src={teamLogos[teamFilter]}
      alt={`${teamFilter} logo`}
      className="h-28 w-auto object-contain" // ← increased height from h-16 to h-28
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
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setShowOffensive((prev) => !prev)}
          className="bg-royal-gold text-black px-4 py-1 rounded font-bold"
        >
          {showOffensive ? "Show defensive stats" : "Show attacking stats"}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
  {statCards.map((stat, idx) => {
    const isSlopeCard = stat.title.includes("Form");
    const isAttack = stat.title.includes("Defensive");
    let value = parseFloat(stat.value);
    let displayValue = isNaN(value) ? "—" : value.toFixed(2);

    // Arrow logic for slope stats
    let arrow = "";
    if (isSlopeCard) {
      if(isAttack){
      value=-1*value}
      if (value >= 0.03) arrow = "↑↑";  // double up
    else if (value > 0) arrow = "↑"; // single up
    else if (value <= -0.03) arrow = "↓↓"; // double down
    else if (value < 0) arrow = "↓"; // single down
      displayValue = ""; 
    
  }

    return (
      <div
        key={idx}
        className="bg-royal-red text-royal-gold p-4 border border-royal-gold rounded-lg shadow text-center"
      >
        <h2 className="text-lg font-semibold mb-2">{stat.title}</h2>
        <p className="text-3xl font-bold">
          {displayValue} {arrow}
        </p>
      </div>
    );
  })}
</div>

      {/* Line Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold" >
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold">
            {showOffensive ? "XG Over Time" : "XGC Over Time"}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
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
        </div>

        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold">
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold ">ELO Rating Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
              <YAxis domain={["dataMin", "dataMax"]} stroke="#fff" tick={false} />
              <Tooltip contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }} />
              <Line type="monotone" dataKey="Elo_Rating" stroke="#FFD700" name="ELO Rating" dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
{/* ELO Bar Chart */}
      <h2 className="text-3xl font-bold text-center text-royal-gold">ELO Rankings</h2>
      <div className="w-full max-w-6xl h-[600px] sm:h-[600px] md:h-[700px]">
        <ResponsiveContainer width="100%" height={Math.max(allTeamStats.length * 25, 300)}>
  <BarChart
    data={[...allTeamStats].sort((a, b) => b.Elo_Rating - a.Elo_Rating)}
    layout="vertical"
    margin={{ top: 5, right: 30, left: 0, bottom: 20 }}
    barSize={18} // 👈 adds fixed bar width
  >
    <CartesianGrid stroke="#333" />
    <XAxis
      type="number"
      stroke="#fff"
      domain={[
        (dataMin) => Math.floor(dataMin - 10),
        (dataMax) => Math.ceil(dataMax + 10),
      ]}
      tick={{ fontSize: 12 }}
    />
    <YAxis
      dataKey="name"
      type="category"
      stroke="#fff"
      tick={{ fontSize: 10 }}
      width={100}
      interval={0}
    />
    <Tooltip
      formatter={(value, name) => [`${value}`, name]}
      labelFormatter={(label) => `Team: ${label}`}
    />
    <Bar
      dataKey="Elo_Rating"
      fill="#5A0000"
      activeBar={{ fill: "#B8860B" }}
    >
      <LabelList dataKey="Elo_Rating" position="right" fill="#fff" />
    </Bar>
  </BarChart>
  
</ResponsiveContainer>

      </div>

      {/* Avg Attack or Defence Ranking */}
      <h2 className="text-3xl font-bold text-center text-royal-gold mt-8">
        {showOffensive ? "Attack Rankings (XG Avg)" : "Defence Rankings (Overall)"}
      </h2>
      <div className="w-full max-w-6xl h-[700px] sm:h-[600px] md:h-[700px]">
      <ResponsiveContainer width="100%" height={Math.max(allTeamStats.length * 30, 200)}>
        <BarChart
          data={[...allTeamStats].sort((a, b) =>
            showOffensive ? b.XG_avg - a.XG_avg : a.XGC_avg - b.XGC_avg
          )}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
        >
          <CartesianGrid stroke="#333" />
          <XAxis
  type="number"
  stroke="#fff"
  domain={['dataMin - 0.1', 'dataMax + 0.1']} // this is the key line
/>
<Tooltip
  formatter={(value, name, props) => [`${value}`, name]}
  labelFormatter={(label) => `Team: ${label}`}
/>
          <YAxis
            dataKey="name"
            type="category"
            stroke="#fff"
            tick={{ fontSize: 10 }}
            width={100}
            interval={0}
          />
          <Bar dataKey={showOffensive ? "XG_avg" : "XGC_avg"} fill="#5A0000" activeBar={{ fill: "#B8860B" }}>
            <LabelList dataKey={showOffensive ? "XG_avg" : "XGC_avg"} position="right" fill="#fff" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
