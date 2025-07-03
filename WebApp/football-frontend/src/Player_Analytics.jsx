import React, { useEffect, useState } from "react";
import Select from "react-select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend
} from "recharts";

export default function PlayerAnalytics() {
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";
  const [data, setData] = useState([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [players, setPlayers] = useState([]);
  const [latestStats, setLatestStats] = useState({});
  const [selectedMetric, setSelectedMetric] = useState("expected_goals");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playerImageUrl, setPlayerImageUrl] = useState("");
  const [comparePlayer, setComparePlayer] = useState("");
  const [compareStats, setCompareStats] = useState({});
  const [compareImageUrl, setCompareImageUrl] = useState("");

  const playerOptions = players.map((player) => ({ value: player, label: player }));

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

  const fetchLatestStats = async (player, setter) => {
    try {
      const res = await fetch(`${API_URL}?player=${encodeURIComponent(player)}`);
      const data = await res.json();
      const sorted = data.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
      const latest = sorted[sorted.length - 1];
      setter({
        Rolling_adjusted_XG2: latest.Rolling_adjusted_XG2 || 0,
        Rolling_adjusted_XA2: latest.Rolling_adjusted_XA2 || 0,
        Rolling_adjusted_BPS2: latest.Rolling_adjusted_BPS2 || 0,
        Overcore: latest.Average_Overscore || 0
      });
    } catch (e) {
      console.error("Error fetching player data:", e);
    }
  };

  useEffect(() => {
    if (playerFilter) {
      fetchLatestStats(playerFilter, setLatestStats);
      fetch(`https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(playerFilter)}`)
        .then((res) => res.text())
        .then((url) => setPlayerImageUrl(url.trim()))
        .catch(() => setPlayerImageUrl(""));
    }
  }, [playerFilter]);

  useEffect(() => {
    if (comparePlayer) {
      fetchLatestStats(comparePlayer, setCompareStats);
      fetch(`https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(comparePlayer)}`)
        .then((res) => res.text())
        .then((url) => setCompareImageUrl(url.trim()))
        .catch(() => setCompareImageUrl(""));
    }
  }, [comparePlayer]);

  useEffect(() => {
    if (!playerFilter) return;
    const fetchData = async () => {
      const res = await fetch(`${API_URL}?player=${encodeURIComponent(playerFilter)}`);
      const raw = await res.json();
      const sorted = raw.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
      setData(sorted);
    };
    fetchData();
  }, [playerFilter]);

  const filteredChartData = data.filter((d) => {
    const date = new Date(d.kickoff_time);
    const afterStart = !startDate || date >= new Date(startDate);
    const beforeEnd = !endDate || date <= new Date(endDate);
    return afterStart && beforeEnd;
  });

  const statCards = [
    { title: "XG Index", value: latestStats.Rolling_adjusted_XG2 },
    { title: "XA Index", value: latestStats.Rolling_adjusted_XA2 },
    { title: "BPS Index", value: latestStats.Rolling_adjusted_BPS2 },
    { title: "Goals over XG", value: latestStats.Overcore }
  ];

  const rawStats = [
    { key: "Rolling_adjusted_XG2", label: "XG Index" },
    { key: "Rolling_adjusted_XA2", label: "XA Index" },
    { key: "Rolling_adjusted_BPS2", label: "BPS Index" },
    { key: "Overcore", label: "Goals over XG" }
  ];

  const maxValues = {};
  rawStats.forEach(({ key }) => {
    const p1 = parseFloat(latestStats[key] || 0);
    const p2 = parseFloat(compareStats[key] || 0);
    maxValues[key] = Math.max(p1, p2, 1);
  });

  const scaleValue = (key, value) => {
    if (key === "Rolling_adjusted_BPS2") return value / 10;
    if (key === "Overcore") return (value * 1.5) / 10;
    return value;
  };

  const comparisonData = rawStats.map(({ key, label }) => ({
    metric: label,
    [playerFilter]: ((scaleValue(key, latestStats[key]) || 0) / maxValues[key]) * 100,
    [comparePlayer]: ((scaleValue(key, compareStats[key]) || 0) / maxValues[key]) * 100
  }));

  const values = filteredChartData.map((d) => parseFloat(d[selectedMetric])).filter((v) => !isNaN(v));
  const avgOfMetric = values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: "#F5F5DC",
      color: "black",
      borderColor: "#FFD700"
    }),
    singleValue: (base) => ({
      ...base,
      color: "black"
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? "#FFD700" : state.isFocused ? "#333333" : "#1a1a1a",
      color: state.isSelected ? "#000" : "#fff",
      cursor: "pointer"
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "#1a1a1a"
    })
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-10 py-10 space-y-6">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Player Analytics</h1>

      <div className="w-full max-w-sm">
        <Select
          options={playerOptions}
          onChange={(option) => setPlayerFilter(option.value)}
          value={{ label: playerFilter, value: playerFilter }}
          styles={selectStyles}
          placeholder="Select or search player..."
        />
      </div>

      <div className="flex gap-10 justify-center mt-6">
        {playerFilter && playerImageUrl && (
          <img src={playerImageUrl} alt={playerFilter} className="max-w-[140px] rounded shadow-lg" />
        )}
    
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="bg-royal-red text-royal-gold p-4 border border-royal-gold rounded-lg shadow text-center"
          >
            <h2 className="text-lg font-semibold mb-2">{stat.title}</h2>
            <p className="text-3xl font-bold">{parseFloat(stat.value).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <h1 className="text-3xl font-bold text-royal-beige mt-10">Compare Players</h1>
      <div className="flex gap-10 justify-center mt-6">
      {comparePlayer && compareImageUrl && (
          <img src={compareImageUrl} alt={comparePlayer} className="max-w-[140px] rounded shadow-lg" />
        )}
      </div>

      <div className="w-64">
        <Select
          options={playerOptions}
          onChange={(opt) => setComparePlayer(opt.value)}
          value={{ label: comparePlayer, value: comparePlayer }}
          styles={selectStyles}
          placeholder="Compare with..."
        />
      </div>

      {playerFilter && comparePlayer && (
        <div className="w-full max-w-4xl h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={comparisonData}>
              <PolarGrid stroke="#ccc" />
              <PolarAngleAxis dataKey="metric" stroke="#FFD700" />
              <Radar name={playerFilter} dataKey={playerFilter} stroke="#FFD700" fill="#FFD700" fillOpacity={0.5} />
              <Radar name={comparePlayer} dataKey={comparePlayer} stroke="#FF6347" fill="#FF6347" fillOpacity={0.5} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h1 className="text-4xl font-bold text-center text-royal-beige mt-10">Historical Analysis</h1>

      <div className="flex flex-wrap justify-center gap-4 mt-10">
        {["expected_goals", "expected_assists", "total_points", "goals_scored", "assists"].map((metric) => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`px-4 py-2 rounded font-bold border ${
              selectedMetric === metric
                ? "bg-royal-gold text-black border-royal-gold"
                : "bg-royal-red text-royal-gold border-royal-gold"
            }`}
          >
            {metric.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-6 text-black">
        <div>
          <label className="text-white block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="p-2 rounded border border-royal-gold"
          />
        </div>
        <div>
          <label className="text-white block mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="p-2 rounded border border-royal-gold"
          />
        </div>
      </div>

      <div className="bg-royal-red text-royal-gold p-4 border border-royal-gold rounded-lg shadow text-center w-full max-w-sm mt-4">
        <h2 className="text-lg font-semibold mb-2 capitalize">Avg. {selectedMetric.replace("_", " ")}</h2>
        <p className="text-3xl font-bold">{avgOfMetric.toFixed(2)}</p>
      </div>

      <div className="bg-royal-red p-4 rounded shadow border border-royal-gold w-full max-w-6xl mt-8">
        <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold capitalize">
          {selectedMetric.replace("_", " ")} Over Time
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={filteredChartData}>
            <CartesianGrid stroke="#333" />
            <XAxis dataKey="kickoff_time" tick={{ fontSize: 10 }} stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#5A0000",
                color: "#FFD700",
                border: "1px solid #FFD700"
              }}
            />
            <Line type="monotone" dataKey={selectedMetric} stroke="#FFD700" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
