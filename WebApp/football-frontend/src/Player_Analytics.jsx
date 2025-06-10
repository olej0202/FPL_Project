import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function PlayerAnalytics() {
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";
  const [data, setData] = useState([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [players, setPlayers] = useState([]);
  const [latestStats, setLatestStats] = useState({});

  // Fetch unique player list
  useEffect(() => {
    fetch(`${API_URL}_unique`)
      .then((res) => res.json())
      .then((raw) => {
        const uniquePlayers = [...new Set(raw)].filter(Boolean).sort();
        setPlayers(uniquePlayers);
        if (!playerFilter && uniquePlayers.length > 0) {
          setPlayerFilter(uniquePlayers[0]);
        }
      })
      .catch((err) => console.error("Failed to fetch players:", err));
  }, []);

  // Fetch selected player data
  useEffect(() => {
    if (!playerFilter) return;
    const fetchData = async () => {
      const res = await fetch(`${API_URL}?player=${encodeURIComponent(playerFilter)}`);
      const raw = await res.json();
      const sorted = raw.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
      setData(sorted);

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        setLatestStats({
          Rolling_adjusted_XG2: latest.Rolling_adjusted_XG2 || 0,
          Rolling_adjusted_XA2: latest.Rolling_adjusted_XA2 || 0,
          Rolling_adjusted_BPS2: latest.Rolling_adjusted_BPS2 || 0,
          XG_slope: latest.XG_slope || 0
        });
      }
    };
    fetchData();
  }, [playerFilter]);

  const statCards = [
    { title: "Adj. Expected Goals", value: latestStats.Rolling_adjusted_XG2 },
    { title: "Adj. Expected Assists", value: latestStats.Rolling_adjusted_XA2 },
    { title: "Adj. Bonus Points", value: latestStats.Rolling_adjusted_BPS2 },
    { title: "Attack Form (XG Slope)", value: latestStats.XG_slope }
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-10">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Player Analytics</h1>

      {/* Player Selector */}
      <div className="w-full max-w-sm">
        <select
          className="border border-royal-gold p-2 rounded w-full text-center bg-beige text-black"
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
        >
          {players.map((player) => (
            <option key={player} value={player}>
              {player}
            </option>
          ))}
        </select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
        {statCards.map((stat, idx) => {
          const value = parseFloat(stat.value);
          const displayValue = isNaN(value) ? "—" : value.toFixed(2);

          let arrow = "";
          if (stat.title.includes("Form")) {
            if (value >= 0.03) arrow = "↑↑";
            else if (value > 0) arrow = "↑";
            else if (value <= -0.03) arrow = "↓↓";
            else if (value < 0) arrow = "↓";
          }

          return (
            <div
              key={idx}
              className="bg-royal-red text-royal-gold p-4 border border-royal-gold rounded-lg shadow text-center"
            >
              <h2 className="text-lg font-semibold mb-2">{stat.title}</h2>
              <p className="text-3xl font-bold">{displayValue} {arrow}</p>
            </div>
          );
        })}
      </div>

      {/* Line Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold">
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold">Expected Goals Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }} />
              <Line
                type="monotone"
                dataKey="expected_goals"
                stroke="#FFD700"
                name="Expected Goals"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-royal-red p-4 rounded shadow border border-royal-gold">
          <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold">Total Points Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }} />
              <Line
                type="monotone"
                dataKey="total_points"
                stroke="#FFD700"
                name="Total Points"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
