import React, { useEffect, useState } from "react";
import Select from "react-select";
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
  const [selectedMetric, setSelectedMetric] = useState("expected_goals");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playerImageUrl, setPlayerImageUrl] = useState("");

  const playerOptions = players.map((player) => ({
    value: player,
    label: player
  }));

  const PlayerLogos = {
    "Cole_Palmer0": "https://sportrenders.com/wp-content/uploads/2023/12/Cole-Palmer-Render-Png-Chelsea-Free-Image-Transaparent-Download.png",
    "Erling_Haaland": "https://sportrenders.com/wp-content/uploads/2024/02/Erling-Haaland-Football-PNG-Manchester-City-Render-Sport-Renders.png",
    "Alexander_Isak": "https://media.futbolfantasy.com/thumb/400x400/v202209261651/uploads/images/jugadores/ficha/3720.png",
    "Bryan_Mbeumo":"https://www.thesportsdb.com/images/media/player/cutout/ox162o1631443956.png",
    "Mohamed_Salah":"https://www.pngmart.com/files/22/Mo-Salah-PNG-Photo.png",
    "Yoane_Wissa": "https://res.cloudinary.com/brentford-fc/image/upload/f_auto,q_auto:best,f_auto,c_fill,g_north,ar_1:1,h_800/wissa_2230_x_3000_tlibsm.png",
    "Ismaïla_Sarr": "https://www.zerozero.pt/img/jogadores/new/29/04/522904_ismaila_sarr_20240818121031.png",
    "Eberechi_Eze":"https://resources.premierleague.com/premierleague/photos/players/250x250/p232413.png",
    "Jean-Philippe_Mateta":"https://static.sky.it/images/skysport/it/calcio/serie-a/probabili-formazioni/superscudetto/512/231747.png",
    "Daniel_Muñoz":"https://cdn.futwiz.com/assets/img/fc25/faces/237646.png?25",
    "Jarrod_Bowen":"https://www.thewesthamway.com/wp-content/uploads/2020/10/Bowen-Jarrod-900_0.png",
    "Antoine_Semenyo":"https://resources.premierleague.com/premierleague/photos/players/110x140/p437730.png",
    "Justin_Kluivert":"https://resources.premierleague.com/premierleague/photos/players/110x140/p222683.png"
  };

  // Fetch player list
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

      // Add alias for expected assists
      const withAlias = sorted.map((d) => ({
        ...d
      }));

      setData(withAlias);

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        setLatestStats({
          Rolling_adjusted_XG2: latest.Rolling_adjusted_XG2 || 0,
          Rolling_adjusted_XA2: latest.Rolling_adjusted_XA2 || 0,
          Rolling_adjusted_BPS2: latest.Rolling_adjusted_BPS2 || 0,
          Overcore: latest.Average_Overscore || 0
        });
      }
    };
    fetchData();
  }, [playerFilter]);

  useEffect(() => {
  if (!playerFilter) return;

  const fetchPlayerImage = async () => {
    try {
      const response = await fetch(`https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(playerFilter)}`);
      const imageUrl = await response.text(); // assuming plain string response
      setPlayerImageUrl(imageUrl);
    } catch (error) {
      console.error("Failed to fetch player image:", error);
      setPlayerImageUrl(""); // fallback or leave blank
    }
  };

  fetchPlayerImage();
}, [playerFilter]);

  // Filter data based on date range
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

  const values = filteredChartData.map((d) => parseFloat(d[selectedMetric])).filter((v) => !isNaN(v));
  const avgOfMetric = values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;


  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-10 py-10 space-y-6">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Player Analytics</h1>


      {/* Player Selector */}
      <div className="w-full max-w-sm">
        <Select
          options={playerOptions}
          onChange={(option) => setPlayerFilter(option.value)}
          value={{ label: playerFilter, value: playerFilter }}
          placeholder="Select or search player..."
          styles={{
            control: (base) => ({
              ...base,
              backgroundColor: "#F5F5DC",
              color: "black",
              borderColor: "#FFD700",
              boxShadow: "none",
              "&:hover": {
                borderColor: "#FFD700"
              }
            }),
            menu: (base) => ({
              ...base,
              backgroundColor: "#1a1a1a",
              zIndex: 9999
            }),
            option: (base, state) => ({
              ...base,
              backgroundColor: state.isSelected
                ? "#FFD700"
                : state.isFocused
                ? "#333333"
                : "#1a1a1a",
              color: state.isSelected ? "#000" : "#fff",
              borderBottom: "1px solid #333",
              cursor: "pointer"
            }),
            singleValue: (base) => ({
              ...base,
              color: "black"
            })
          }}
        />
      </div>

      {/* Player Logo */}
      <div className="flex flex-col items-center justify-center mb-6">
        {playerFilter && playerImageUrl && (
  <img
    src={playerImageUrl}
    alt={`${playerFilter} portrait`}
    className="h-full w-full max-w-[140px] rounded shadow-lg border border-royal-gold"
  />
)}
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
      <div className="px-10 py-10 space-y-6"></div>
      <h1 className="text-4xl font-bold text-center text-royal-beige">Historical Analysis</h1>

      {/* Metric Selector */}
      <div className="flex flex-wrap justify-center gap-4 mt-10">
        {[
          { key: "expected_goals", label: "Expected Goals" },
          { key: "expected_assists", label: "Expected Assists" },
          { key: "total_points", label: "Total Points" },
          { key: "goals_scored", label: "Goals Scored" },
          { key: "assists", label: "Assists" },
          
        ].map((metric) => (
          <button
            key={metric.key}
            onClick={() => setSelectedMetric(metric.key)}
            className={`px-4 py-2 rounded font-bold border ${
              selectedMetric === metric.key
                ? "bg-royal-gold text-black border-royal-gold"
                : "bg-royal-red text-royal-gold border-royal-gold"
            }`}
          >
            {metric.label}
          </button>
        ))}
      </div>

      {/* Date Slicer */}
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
  <h2 className="text-lg font-semibold mb-2 capitalize">
    Avg. {selectedMetric.replace("_", " ")}
  </h2>
  <p className="text-3xl font-bold">
    {avgOfMetric.toFixed(2)}
  </p>
</div>


      {/* Dynamic Line Chart */}
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
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke="#FFD700"
              name={selectedMetric.replace("_", " ").toUpperCase()}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
