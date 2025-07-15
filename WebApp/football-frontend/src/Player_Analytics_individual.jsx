import React, { useEffect, useState,useMemo } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";
import Slider from "@mui/material/Slider";
import { Table, BarChart2, Trash2 ,ChevronDown , Save } from "lucide-react";
import CustomTooltip from "./components/graphTooltip_player";
import NameModal from "./components/NameAnalysis";

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
  const { fetchIfNeeded, loading, PlayersData,addAnalysis,analyses,removeAnalysis } = useStatsData();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";

  const location = useLocation();
  const initialPlayer = location.state?.selectedPlayer || "";
  const [playerFilter, setPlayerFilter] = useState(initialPlayer);
  const [players, setPlayers] = useState([]);
  const [data, setData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("Expected Goals");
 const [dateRange, setDateRange] = useState([0, 0]); 
 const [bounds, setBounds] = useState([0, 0]); // [minTs, maxTs]
  const [playerImageUrl, setPlayerImageUrl] = useState("");
  const [comparePlayer, setComparePlayer] = useState("");
  const [latestStats, setLatestStats] = useState({});
  const [compareStats, setCompareStats] = useState({});
  const [compareImageUrl, setCompareImageUrl] = useState("");
  const [playerValue, setPlayerValue] = useState(null);
  const [playerNews, setPlayerNews] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState([]);
  const [opponentFilter, setOpponentFilter] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

     const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    });
  };




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
        setPlayerNews(latest.news || null);
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
      const sorted = raw.sort((a, b) => new Date(a["Kickoff time"]) - new Date(b["Kickoff time"]));
      setData(sorted);
    };
    fetchData();
  }, [playerFilter]);


   useEffect(() => {
    if (!data.length) return;
    const timestamps = data.map((d) => new Date(d["Kickoff time"]).getTime());
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    setBounds([minTs, maxTs]);
    // initialize the thumbs to cover the whole range
    setDateRange([minTs, maxTs]);
  }, [data]);

  //Season filter
    const seasonOptions = useMemo(() => {
    const uniq = Array.from(new Set(data.map(d => d.Season))).sort();
    return uniq.map(s => ({ value: s, label: s }));
  }, [data]);

  //Opponent filter
  const opponentOptions = useMemo(() => {
  const uniq = Array.from(new Set(data.map(d => d["Opponent Name"]))).sort();
  return uniq.map(o => ({ value: o, label: o }));
}, [data]);

  // filter whenever dateRange changes
    const filtered = useMemo(() => {
        const [low, high] = dateRange;
        // extract chosen season values:
        const chosen = seasonFilter.map(s => s.value);
        const chosenOpponents = opponentFilter.map(o => o.value);
        return data.filter(d => {
          const ts = new Date(d["Kickoff time"]).getTime();
          const inDateRange = ts >= low && ts <= high;
          const inSeason = chosen.length === 0 || chosen.includes(d.Season);
          const inOpponent   = !chosenOpponents.length || chosenOpponents.includes(d["Opponent Name"]);
          return inDateRange && inSeason && inOpponent;
        });
    }, [data, dateRange, seasonFilter,opponentFilter]);

  // MUI-style date label
  const valueLabelFormat = (ts) =>
    new Date(ts).toLocaleDateString();

  const handleSliderChange = (_, newValue) => {
    setDateRange(newValue);
  };

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


  const values = filtered.map((d) => parseFloat(d[selectedMetric])).filter((v) => !isNaN(v));
  const avgOfMetric = values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
  const TotalOfMetric = values.length ? values.reduce((acc, v) => acc + v, 0): 0;
  const stdDeviation = values.length > 1 ? Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avgOfMetric, 2), 0)) / (values.length - 1) : 0;
  const historyMetrics = [
    { value: "Expected Goals", label: "Expected Goals" },
    { value: "Expected Assists", label: "Expected Assists" },
    { value: "Goals Scored", label: "Goals Scored" },
    { value: "Assists", label: "Assists" },
    { value: "Bonus", label: "Bonus" },
    { value: "Adjusted XG", label: "Adjusted XG" },
    { value: "Adjusted XA", label: "Adjusted XA" },
    { value: "ICT", label: "ICT Index" },
  ];
      const handleAddAnalysis = (name) => {
    const id = name;
    addAnalysis({
      id,
      name,
      player: playerFilter,
      metric: selectedMetric,
      TotalOfMetric,
      avgOfMetric
    });
    setModalOpen(false);
  };


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
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-2 py-10 space-y-6">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Player Analytics</h1>

      <div className="w-full max-w-sm text-center">
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

      {playerNews && playerNews !== "No news" && (
  <div className="mt-2 bg-red-700 text-royale-beige font-bold px-3 py-1 rounded border border-royal-red text-center">
    {playerNews}
  </div>
)}

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

      <div className="w-full max-w-sm text-center">
        <Select
          options={playerOptions}
          onChange={(opt) => setComparePlayer(opt.value)}
          value={{ label: comparePlayer, value: comparePlayer }}
          styles={selectStyles}
          placeholder="Compare with..."
        />
        </div>
        {comparePlayer && (
  <div className="flex justify-center mt-4">
  <button
    onClick={() => {
      setComparePlayer("");
      setCompareStats({});
      setCompareImageUrl("");
    }}
    className="px-10 py-2 bg-red-700 text-white rounded border border-royal-gold hover:bg-red-800 transition"
  >
    Remove
  </button>
</div>
)}
      

      {playerFilter && comparePlayer && (
        <div className="w-full max-w-4xl h-[500px]">
        <ResponsiveContainer width="100%" height={400}>
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


<div className="w-full max-w-sm text-center">
    <h2 className="text-2xl text-royal-beige mb-4 text-center">
  Choose Metric
</h2>
        <Select
          options={historyMetrics}
          value={historyMetrics.find(m => m.value === selectedMetric)}
          onChange={o => setSelectedMetric(o.value)}
          placeholder="Metric..."
          styles={selectStyles}

        />
        
        </div>
    <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl text-royal-beige mb-4 text-center">
  Season
</h2>
        <Select
      options={seasonOptions}
      value={seasonFilter}
      onChange={opts => setSeasonFilter(opts || [])}
      isMulti
      isClearable
      placeholder="Select Season(s)..."
      styles={selectStyles}
    />
    </div>
    <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl text-royal-beige mb-4 text-center">
  Opponents
</h2>
        <Select
      options={opponentOptions}
      value={opponentFilter}
      onChange={opts => setOpponentFilter(opts || [])}
      isMulti
      isClearable
      placeholder="Select Season(s)..."
      styles={selectStyles}
    />
    </div>





      <div className="px-4 my-8">
      <h2 className="text-2xl text-royal-beige mb-4 text-center">
  Date Range:<br/>{' '}
  {dateRange[0] && dateRange[1]
    ? `${new Date(dateRange[0]).toLocaleDateString()} – ${new Date(dateRange[1]).toLocaleDateString()}`
    : ' Select a range'}
</h2>
    

      <Slider
        value={dateRange}
        onChange={handleSliderChange}
        valueLabelDisplay="auto"
        valueLabelFormat={valueLabelFormat}
        min={bounds[0]}
        max={bounds[1]}
        step={24 * 60 * 60 * 1000} // one-day steps
        marks={[
          { value: bounds[0], label: valueLabelFormat(bounds[0]) },
          { value: bounds[1], label: valueLabelFormat(bounds[1]) }
        ]}
        getAriaLabel={() => "Date range"}
        sx={{ color: "#B8860B" }}
      />

      {/* …now render your chart or table based on `filtered`… */}
    </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
  {/* Avg Box */}
  <div className="bg-royal-red text-royal-beige p-4 border border-royal-gold rounded-lg shadow text-center">
    
    <h2 className="text-1xl font-semibold mb-2 capitalize">Total {selectedMetric.replace("_", " ")}</h2>
    <p className="text-2xl font-bold mb-4">{TotalOfMetric.toFixed(2)}</p>
    <h2 className="text-1xl font-semibold mb-2 capitalize">Avg. {selectedMetric.replace("_", " ")}</h2>
    <p className="text-2xl font-bold mb-4">{avgOfMetric.toFixed(2)}</p>
        <h2 className="text-1xl font-semibold mb-2 capitalize">Std. Dev. {selectedMetric.replace("_", " ")}</h2>
    <p className="text-2xl font-bold">{stdDeviation.toFixed(2)}</p>

  </div>

</div>
<div className="flex justify-center my-4">
        <button
          onClick={() => setModalOpen(true)}
           className="flex items-center gap-2 px-4 py-2 border border-royal-gold text-royal-gold rounded hover:bg-royal-beige transition"
        >
            <Save size={18}/>
          Save Analysis 
          
        </button>
      </div>

     <NameModal
       isOpen={modalOpen}
       onConfirm={handleAddAnalysis}
       onCancel={() => setModalOpen(false)}
     />
     <button
          onClick={scrollToBottom}
          className="flex items-center gap-2 px-4 py-2 text-black hover:underline transition border-none"
        >
            <ChevronDown size={20} />
            See Saved
          <ChevronDown size={20} />
          
        </button>
<div className="flex items-center gap-6 mb-4">
      {/* Table icon */}
      <Table
        size={24}
        className={`
          cursor-pointer 
          ${showTable 
            ? "" 
            : "text-white hover:text-gray-300"
          }
        `}
        onClick={() => setShowTable(true)}
      />

      {/* Chart icon */}
      <BarChart2
        size={24}
        className={`
          cursor-pointer 
          ${!showTable 
            ? "underline text-royal-gold border-royal-gold" 
            : "text-white hover:text-gray-300"
          }
        `}
        onClick={() => setShowTable(false)}
      />
    </div>


      {showTable ? (
        <div className="overflow-auto bg-royal-red p-4 rounded shadow border border-royal-gold text-royal-beige">
  <table className="w-full table-auto border-collapse">
    <thead>
      <tr className="bg-royal-beige text-black">
        <th className="px-2 py-2 border border-royal-gold">Season</th>
        <th className="px-2 py-2 border border-royal-gold">Opponent Name</th>
        <th className="px-2 py-2 border border-royal-gold">Date</th>
        <th className="px-2 py-2 border border-royal-gold">
          {historyMetrics.find(m => m.value === selectedMetric)?.label}
        </th>
      </tr>
    </thead>
    <tbody>
      {filtered.map((row, i) => (
        <tr key={i} className="odd:bg-royal-red-dark hover:bg-royal-red-light">
          <td className="px-3 py-1 border border-royal-gold">{row.Season}</td>
          <td className="px-3 py-1 border border-royal-gold">{row["Opponent Name"]}</td>
          <td className="px-3 py-1 border border-royal-gold">{row["Kickoff time"]}</td>
          <td className="px-3 py-1 border border-royal-gold">{row[selectedMetric]}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

      ) : (
              <div className="bg-royal-red p-1 rounded shadow border border-royal-gold w-full max-w-6xl mt-8">
        <h2 className="text-xl font-semibold mb-4 text-center text-royal-beige capitalize">
          {selectedMetric.replace("_", " ")} Over Time
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#333" />
            <XAxis dataKey="Kickoff time" tick={{ fontSize: 10 }} stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip
              content={<CustomTooltip selectedMetric={selectedMetric} />}
            />
            <Line type="monotone" dataKey={selectedMetric} stroke="#FFD700" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      )}
      <div className="max-w-2xl mx-auto mt-6">
  <h2 className="text-xl text-royal-beige mb-2 text-center">Saved Analyses</h2>  
</div>
<div className="overflow-x-auto w-full max-w-4xl mx-auto mt-6">
  <table className="w-full table-auto bg-royal-red text-royal-beige rounded-lg shadow border border-royal-gold">
    <thead>
      <tr className="bg-royal-beige text-black">
        <th className="px-4 py-2 border border-royal-gold">Analysis Name</th>
        <th className="px-4 py-2 border border-royal-gold">Player</th>
        <th className="px-4 py-2 border border-royal-gold">Metric</th>
        <th className="px-4 py-2 border border-royal-gold">Total</th>
        <th className="px-4 py-2 border border-royal-gold">Average</th>
        <th className="px-4 py-2 border border-royal-gold">Remove</th>
      </tr>
    </thead>
    <tbody>
      {analyses.map((a) => (
        <tr key={a.id} className="odd:bg-royal-red-dark hover:bg-royal-red-light">
          <td className="px-4 py-2 border border-royal-gold">{a.id}</td>
          <td className="px-4 py-2 border border-royal-gold">{a.player}</td>
          <td className="px-4 py-2 border border-royal-gold">{a.metric}</td>
          <td className="px-4 py-2 border border-royal-gold">{a.TotalOfMetric.toFixed(2)}</td>
          <td className="px-4 py-2 border border-royal-gold">{a.avgOfMetric.toFixed(2)}</td>
          <td className="px-4 py-2 border border-royal-gold text-center">
                 <Trash2
                   size={18}
                   className="cursor-pointer text-royal-gold hover:text-red-500"
                   onClick={() => removeAnalysis(a.id)}
                 />
               </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

    </div>
  );
}
