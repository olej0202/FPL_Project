import React, { useEffect, useState } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";

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

export default function PlayerAnalyticsIndividual() {
  const { fetchIfNeeded, loading, PlayersData } = useStatsData();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";

  const location = useLocation();
  const initialPlayer = location.state?.selectedPlayer || "";
  const [playerFilter, setPlayerFilter] = useState(initialPlayer);
  const [players, setPlayers] = useState([]);
  const [data, setData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("expected_goals");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playerImageUrl, setPlayerImageUrl] = useState("");
  const [comparePlayer, setComparePlayer] = useState("");
  const [latestStats, setLatestStats] = useState({});
  const [compareStats, setCompareStats] = useState({});
  const [compareImageUrl, setCompareImageUrl] = useState("");
  const [playerValue, setPlayerValue] = useState(null);



    useEffect(() => {
  const init = async () => {
    if (!PlayersData.current || PlayersData.current.length === 0) {
      await fetchIfNeeded();
    }
  };
  init();
}, [fetchIfNeeded]);

useEffect(() => {
  if (Array.isArray(PlayersData.current) && PlayersData.current.length > 0) {
    const uniquePlayers = [...new Set(PlayersData.current.map((p) => p.name))].sort();
    setPlayers(uniquePlayers);

    if (!playerFilter && uniquePlayers.length > 0) {
      setPlayerFilter(uniquePlayers[0]);
    }

    if (playerFilter) {
      const playerData = PlayersData.current.filter((p) => p.name === playerFilter);
      if (playerData.length) {
        const latest = playerData[playerData.length - 1];

        setLatestStats({
          Rolling_adjusted_XG: latest.Rolling_adjusted_XG || 0,
          Rolling_adjusted_XA: latest.Rolling_adjusted_XA || 0,
          Rolling_adjusted_BPS: latest.Rolling_adjusted_BPS || 0,
          Overcore: latest.Average_Overscore || 0,
        });

        setPlayerValue(latest.value || null);
      }

      fetch(`https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(playerFilter)}`)
        .then((res) => res.text())
        .then((url) => setPlayerImageUrl(url.trim()))
        .catch(() => setPlayerImageUrl(""));
    }
  }
}, [PlayersData.current, playerFilter]);



  const playerOptions = players.map((player) => ({ value: player, label: player }));


  const getLatestStatsFromContext = async (player, setter) => {
    await fetchIfNeeded();
    const playerData = PlayersData.current.filter((p) => p.name === player);
    if (!playerData.length) return;
    const sorted = playerData.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    const latest = playerData[playerData.length - 1];
    setter({
      Rolling_adjusted_XG: latest.Rolling_adjusted_XG || 0,
      Rolling_adjusted_XA: latest.Rolling_adjusted_XA || 0,
      Rolling_adjusted_BPS: latest.Rolling_adjusted_BPS || 0,
      Overcore: latest.Average_Overscore || 0
    });
  };



  useEffect(() => {
    if (comparePlayer) {
      getLatestStatsFromContext(comparePlayer, setCompareStats);
      fetch(`https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(comparePlayer)}`)
        .then(res => res.text())
        .then(url => setCompareImageUrl(url.trim()))
        .catch(() => setCompareImageUrl(""));

    }
  }, [comparePlayer, PlayersData]);

  useEffect(() => {
    if (!playerFilter) return;
    const fetchData = async () => {
      await fetchIfNeeded();  
      const res = await fetch(`${API_URL}?player=${encodeURIComponent(playerFilter)}`);
      const raw = await res.json();
      const sorted = raw.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
      setData(sorted);
    };
    fetchData();
  }, [playerFilter]);

  const filteredChartData = data.filter((d) => {
    const date = new Date(d.kickoff_time);
    return (!startDate || date >= new Date(startDate)) && (!endDate || date <= new Date(endDate));
  });

  const statCards = [
    { title: "XG Index", value: latestStats.Rolling_adjusted_XG },
    { title: "XA Index", value: latestStats.Rolling_adjusted_XA },
    { title: "BPS Index", value: latestStats.Rolling_adjusted_BPS },
    { title: "Goals/XG", value: latestStats.Overcore }
  ];

  const rawStats = [
    { key: "Rolling_adjusted_XG", label: "XG Index" },
    { key: "Rolling_adjusted_XA", label: "XA Index" },
    { key: "Rolling_adjusted_BPS", label: "BPS Index" },
    { key: "Overcore", label: "Goals/XG" }
  ];

  const maxValues = {};
  rawStats.forEach(({ key }) => {
    const p1 = parseFloat(latestStats[key] || 0);
    const p2 = parseFloat(compareStats[key] || 0);
    maxValues[key] = Math.max(p1, p2, 1);
  });

  const scaleValue = (key, value) => {
  if (!value) return 0;

  switch (key) {
    case "Rolling_adjusted_XG":
        return value * 200; // assuming typical max ~4.0 → 100
    case "Rolling_adjusted_XA":
      return value * 230; // assuming typical max ~4.0 → 100
    case "Rolling_adjusted_BPS":
      return value *4; // typical max ~200 → 100
    case "Overcore":
      return value *30; 
    default:
      return value * 10;
  }
};

 const scaledComparisonData = rawStats.map(({ key, label }) => ({
  metric: label,
  [playerFilter]: scaleValue(key, latestStats[key]),
  [comparePlayer]: scaleValue(key, compareStats[key]),
  [`${playerFilter}_label`]: (latestStats[key] || 0).toFixed(2),
  [`${comparePlayer}_label`]: (compareStats[key] || 0).toFixed(2)
}));


  const values = filteredChartData.map((d) => parseFloat(d[selectedMetric])).filter((v) => !isNaN(v));
  const avgOfMetric = values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
  const stdDeviation = values.length > 1 ? Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avgOfMetric, 2), 0)) / (values.length - 1) : 0;

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

  const CustomRadarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const player1 = payload[0]?.name;
    const player2 = payload[1]?.name;
    const p1Label = payload[0]?.payload?.[`${player1}_label`];
    const p2Label = payload[1]?.payload?.[`${player2}_label`];


    return (
      <div className="bg-black p-3 border border-yellow-400 rounded text-white text-sm">
        <p className="font-bold mb-1">{label}</p>
        <p>{player1}: <span className="text-yellow-400">{p1Label}</span></p>
        <p>{player2}: <span className="text-red-400">{p2Label}</span></p>
      </div>
    );
  }
  return null;
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
      <div className="mt-2 bg-royal-beige text-black font-bold px-3 py-1 rounded border border-royal-gold">
        Fantasy Price: {playerValue}M
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="bg-royal-red text-royal-beige p-4 border border-royal-gold rounded-lg shadow text-center"
          >
            <h2 className="text-1xl font-semibold mb-2">{stat.title}</h2>
            <p className="text-2xl font-bold">{parseFloat(stat.value).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <h1 className="text-3xl font-bold text-royal-beige mt-10">Compare Player</h1>
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
        {comparePlayer && (
  <button
    onClick={() => {
      setComparePlayer("");
      setCompareStats({});
      setCompareImageUrl("");
    }}
    className="mt-5 ml-12 px-12 py-2 bg-red-700 text-white rounded border border-royal-gold hover:bg-red-800 transition"
  >
    Remove
  </button>
)}
      </div>

      {playerFilter && comparePlayer && (
        <div className="w-full max-w-4xl h-[400px]">
        <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="50%" data={scaledComparisonData}>
              <PolarGrid stroke="#666" />
              <PolarAngleAxis dataKey="metric" stroke="#FFD700" />
              <Radar
                name={playerFilter}
                dataKey={playerFilter}
                stroke="#FFD700"
                fill="#FFD700"
                fillOpacity={0.7}
              />
              <Radar
                name={comparePlayer}
                dataKey={comparePlayer}
                stroke="#FF6347"
                fill="#FF6347"
                fillOpacity={0.7}
              />
              <Tooltip content={<CustomRadarTooltip />} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>

        </div>
      )}

      <h1 className="text-4xl font-bold text-center text-royal-beige mt-10">Historical Analysis</h1>

      <div className="mt-10">
  <select
    value={selectedMetric}
    onChange={(e) => setSelectedMetric(e.target.value)}
    className="px-4 py-3 rounded font-bold bg-royal-beige text-black border border-royal-gold focus:outline-none focus:ring-2 focus:ring-royal-gold"
  >
    {["expected_goals", "expected_assists", "total_points", "goals_scored", "assists"].map((metric) => (
      <option key={metric} value={metric}>
        {metric
  .split("_")
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ")}


      </option>
    ))}
  </select>
</div>


      <div className="flex flex-col sm:flex-row gap-1 justify-center items-center mt-6 text-black">
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

      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
  {/* Avg Box */}
  <div className="bg-royal-red text-royal-beige p-4 border border-royal-gold rounded-lg shadow text-center w-full max-w-sm">
    <h2 className="text-lg font-semibold mb-2 capitalize">Avg. {selectedMetric.replace("_", " ")}</h2>
    <p className="text-3xl font-bold">{avgOfMetric.toFixed(2)}</p>
  </div>

  {/* Std Dev Box */}
  <div className="bg-royal-red text-royal-beige p-4 border border-royal-gold rounded-lg shadow text-center w-full max-w-sm">
    <h2 className="text-lg font-semibold mb-2 capitalize">Std. Dev. {selectedMetric.replace("_", " ")}</h2>
    <p className="text-3xl font-bold">{stdDeviation.toFixed(2)}</p>
  </div>
</div>


      <div className="bg-royal-red p-1 rounded shadow border border-royal-gold w-full max-w-6xl mt-8">
        <h2 className="text-xl font-semibold mb-4 text-center text-royal-gold capitalize">
          {selectedMetric.replace("_", " ")} Over Time
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={filteredChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
