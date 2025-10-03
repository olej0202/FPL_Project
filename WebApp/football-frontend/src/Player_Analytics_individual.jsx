import React, { useEffect, useState,useMemo } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";
import Slider from "@mui/material/Slider";
import { Table, BarChart2, Trash2, ChevronDown, ChevronUp, Filter as FilterIcon, Save, X } from "lucide-react";
import CustomTooltip from "./components/graphTooltip_player";
import NameModal from "./components/NameAnalysis";
import teamLogos from "./utils/team_logos";


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
  const navigate = useNavigate();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";
  const fallbackUrl = "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

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
  const [playerSelected, setplayerSelected] = useState(null);
  const [playerNews, setPlayerNews] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState([]);
  const [opponentFilter, setOpponentFilter] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        const totalPredictions = playerData.reduce(
    (sum, row) => sum + (parseFloat(row.Points_prediction) || 0),
      0
      );
        const latest = playerData[playerData.length - 1];

        setLatestStats({
          Rolling_adjusted_XG: latest.Rolling_adjusted_XG || 0,
          Rolling_adjusted_XA: latest.Rolling_adjusted_XA || 0,
          Rolling_adjusted_BPS: latest.Rolling_adjusted_BPS || 0,
          Overcore: latest.Average_Overscore || 0,
          DefCon: latest.DefCon || 0,
          points_predictions: totalPredictions || 0,
          
        });

        setPlayerValue(latest.value || null);
        setPlayerNews(latest.news || null);
        setplayerSelected(latest.selected.toFixed(3)*100 || null);
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
    const totalPredictions = playerData.reduce(
    (sum, row) => sum + (row.Points_prediction),
      0
      );
    const sorted = playerData.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    const latest = playerData[playerData.length - 1];
    
    setter({
      Rolling_adjusted_XG: latest.Rolling_adjusted_XG || 0,
      Rolling_adjusted_XA: latest.Rolling_adjusted_XA || 0,
      Rolling_adjusted_BPS: latest.Rolling_adjusted_BPS || 0,
      Overcore: latest.Average_Overscore || 0,
      DefCon:latest.DefCon || 0,
      points_predictions: totalPredictions || 0,
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
    { title: "DefCon", value: latestStats.DefCon },
    { title: "Goals/XG", value: latestStats.Overcore },
    {title: "XPoints", value: latestStats.points_predictions }
  ];

  const rawStats = [
    { key: "Rolling_adjusted_XG", label: "XG Index" },
    { key: "Rolling_adjusted_XA", label: "XA Index" },
    { key: "Rolling_adjusted_BPS", label: "BPS Index" },
    { key: "DefCon", label: "DefCon" },
    { key: "Overcore", label: "Goals/XG" },
    { key: "points_predictions", label: "XPoints" },
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
    case "DefCon":
      return value *5; // typical max ~200 → 100
    case "Overcore":
      return value *30; 
    case "points_predictions":
      return value ; 
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
    { value: "Fantasy Points", label: "Fantasy Points" },
    { value: "Bonus", label: "Bonus" },
    { value: "Adjusted XG", label: "Adjusted XG" },
    { value: "Adjusted XA", label: "Adjusted XA" },
    { value: "Defcon Hit", label: "Defcon Hit" },

  ];
      const handleAddAnalysis = (name) => {
    const id = name;
    addAnalysis({
      id,
      name,
      player: playerFilter,
      metric: selectedMetric,
      TotalOfMetric,
      avgOfMetric,
      Type:"Player"
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
  // inside PlayerAnalyticsIndividual, before `return (`
// 1) compute once for the current player
const playerFixtures = useMemo(() => {
  if (!Array.isArray(PlayersData.current)) return [];
  return PlayersData.current
    .filter((d) => d.name === playerFilter)
    .sort((a, b) => a.GW - b.GW);
}, [PlayersData.current, playerFilter]);

const compareFixtures = useMemo(() => {
  if (!comparePlayer || !Array.isArray(PlayersData.current)) return [];
  return PlayersData.current
    .filter((d) => d.name === comparePlayer)
    .sort((a, b) => a.GW - b.GW);
}, [PlayersData.current, comparePlayer]);

const fixtureData = useMemo(() => {
  // get all GWs
  const allGWs = Array.from(
    new Set([
      ...playerFixtures.map((d) => d.GW),
      ...compareFixtures.map((d) => d.GW),
    ])
  ).sort((a, b) => a - b);

  return allGWs.map((gw) => {
    const p1 = playerFixtures.find((d) => d.GW === gw);
    const p2 = compareFixtures.find((d) => d.GW === gw);
    return {
      GW: gw,
      [playerFilter]: p1 ? p1.Points_prediction : null,
      [comparePlayer]: p2 ? p2.Points_prediction : null,
    };
  });
}, [playerFixtures, compareFixtures, playerFilter, comparePlayer]);




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
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-0 py-0 space-y-3">

<div className="w-full max-w-sm text-center">
  <Select
    options={playerOptions}
    getOptionLabel={(opt) => String(opt.label ?? opt.value).replace(/_/g, " ")}
    getOptionValue={(opt) => String(opt.value ?? opt.label)}
    onChange={(opt) => setPlayerFilter(opt?.value ?? "")}
    value={playerOptions.find(o => o.value === playerFilter) || null}
    styles={selectStyles}
    placeholder="Select or search player..."
  />
</div>
<div className="flex gap-10 justify-center mt-2">
  {playerFilter && playerImageUrl && (
    <div className="relative inline-block">
      {/* Player headshot */}
      <img
        src={playerImageUrl}
        alt={playerFilter}
        onError={(e) => {
            e.currentTarget.onerror = null;       // prevent loop
            e.currentTarget.src = fallbackUrl;    // use fallback
          }}
        className="max-w-[140px] rounded shadow-lg"
      />

      {/* Price badge in top‑right */}
      <div className="absolute top-1 -right-14 bg-black text-royal-beige text-xs font-bold px-1 py-1 rounded text-center">
        <span>Selected</span><br/>
    <span>{parseFloat(playerSelected).toFixed(1)}%</span>       
      </div>
      <div className="absolute top-1 -left-14 bg-black text-royal-beige text-xs font-bold px-4 py-1 rounded text-center">
        <span>Price</span><br/>
    <span>${playerValue}</span>       
      </div>

    </div>
  )}
</div>

      {playerNews && playerNews !== "No news" && (
  <div className="mt-2 bg-red-700 text-royale-beige font-bold px-3 py-1 rounded border border-royal-red text-center">
    {playerNews}
  </div>
)}

      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-3 gap-1 w-1xl mr-0">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="bg-royal-red text-royal-beige px-3 py-2 border border-royal-gold rounded-lg shadow text-center mr-1 mt-1"
          >
            <h2 className="text-1xl font-semibold mb-0">{stat.title}</h2>
            <p className="text-1xl font-bold">{parseFloat(stat.value).toFixed(2)}</p>
          </div>
        ))}
      </div>
<div className="w-full max-w-6xl mx-auto mt-6 text-center">
      <h3 className="text-lg font-semibold mb-2">Fixtures next {playerFixtures.length} GWs</h3>

      {/* Scrollable on xs, wrap & center on sm+ */}
      <div
        className="
          flex flex-row 
          overflow-x-auto    /* scroll on mobile */
          sm:flex-wrap        /* wrap to new lines on sm+ */
          sm:justify-center   /* center on sm+ */
          justify-start       /* align left on mobile */
          space-x-1 
          sm:space-x-4 
          px-2 py-2
        "
      >
        {playerFixtures.map((row, idx) => (
          <div
            key={idx}

            onClick={() =>
          navigate("/Team_Analytics/Team_Individual", {
            state: { selectedTeam: row.opponent_name },
          })
        }

            className="
              flex-shrink-0 
              flex flex-col items-center
              bg-royal-beige text-black 
              p-2 rounded shadow-md 
              w-15 sm:w-auto
            "
          >
            <span className="text-xs font-semibold">GW {row.GW}</span>
            {teamLogos[row.opponent_name] ? (
              <img
                src={teamLogos[row.opponent_name]}
                alt={row.opponent_name}
                className="h-10 w-11 object-contain"
              />
            ) : (
              <span className="text-sm truncate">{row.opponent_name}</span>
            )}
             <span className="text-xs font-semibold mt-0">
        {row.was_home ? "(H)" : "(A)"}
      </span>
          </div>
        ))}
      </div>
    </div>



    {/* Predicted Points*/}
 {/* ─── Predicted Points Over Upcoming GWs ─── */}
 <h3 className="text-lg font-semibold mb-2 text-center">Predicted Points</h3>
<div className="w-full max-w-6xl mx-auto mt-6 border border-royal-gold">
  
  <div className="h-52 bg-royal-red rounded shadow-md p-1">
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={fixtureData} margin={{ top: 0, right: 5, left: 0, bottom: 5 }}>
    <CartesianGrid stroke="#444" strokeDasharray="3 3" />
    <XAxis dataKey="GW" tick={{ fill: "#fff" }} />
    <YAxis tick={{ fill: "#fff" }} domain={["auto", "auto"]} />
    <Tooltip
      contentStyle={{ backgroundColor: "#222", borderColor: "#FFD700" }}
      itemStyle={{ color: "#fff" }}
      labelStyle={{ color: "#fff" }}
      formatter={(v) => (v != null ? v.toFixed(1) : "-")}
      labelFormatter={(l) => `GW ${l}`}
    />
    <Legend verticalAlign="bottom" align="right" />
    <Line
      type="monotone"
      dataKey={playerFilter}
      name={playerFilter.replace(/_/g, " ")}
      stroke="#fff"
    />
    {comparePlayer && (
      <Line
        type="monotone"
        dataKey={comparePlayer}
        name={comparePlayer.replace(/_/g, " ")}

        stroke="#FFD700"
      />
    )}
  </LineChart>
</ResponsiveContainer>


    
  </div>
</div>

      <h1 className="text-3xl font-bold text-royal-beige mt-10">Compare Player</h1>
      <div className="flex gap-10 justify-center mt-6">
      {comparePlayer && (
  <div className="flex justify-center mt-4">
    <div className="relative inline-block">
      {/* the player’s portrait */}
      <img
        src={compareImageUrl}
        alt={comparePlayer}
        className="max-w-[140px] rounded shadow-lg"
      />

      {/* the little “X” button in the corner */}
      <button
        onClick={() => {
          setComparePlayer("");
          setCompareStats({});
          setCompareImageUrl("");
        }}
        className="
          absolute -top-1 -right-14
          bg-black bg-opacity-50 
          p-1 rounded-full 
          hover:bg-opacity-50
        "
      >
        <X size={40} className="text-red-700 hover:text-red-500" />
      </button>
    </div>
  </div>
)}
      </div>

      <div className="w-full max-w-sm text-center">
  <Select
    options={playerOptions}
    getOptionLabel={(opt) => String(opt.label ?? opt.value).replace(/_/g, " ")}
    getOptionValue={(opt) => String(opt.value ?? opt.label)}
    onChange={(opt) => setComparePlayer(opt?.value ?? "")}
    value={playerOptions.find((o) => o.value === comparePlayer) || null}
    styles={selectStyles}
    placeholder="Compare with..."
  />
</div>

{comparePlayer && compareFixtures.length > 0 && (
  <div className="w-full max-w-6xl mx-auto mt-6 text-center">
    <h3 className="text-lg font-semibold mb-2">
      Fixtures next {compareFixtures.length} GWs
    </h3>
    <div
      className="
        flex flex-row overflow-x-auto sm:flex-wrap sm:justify-center 
        justify-start space-x-1 sm:space-x-4 px-2 py-2
      "
    >
      {compareFixtures.map((row, idx) => (
        <div
          key={idx}
          onClick={() =>
            navigate("/Team_Analytics/Team_Individual", {
              state: { selectedTeam: row.opponent_name },
            })
          }
          className="
            flex-shrink-0 flex flex-col items-center
            bg-royal-beige text-black p-2 rounded shadow-md w-15 sm:w-auto
          "
        >
          <span className="text-xs font-semibold">GW {row.GW}</span>
          {teamLogos[row.opponent_name] ? (
            <img
              src={teamLogos[row.opponent_name]}
              alt={row.opponent_name}
              className="h-10 w-11 object-contain"
            />
          ) : (
            <span className="text-sm truncate">{row.opponent_name}</span>
          )}
          <span className="text-xs font-semibold mt-0">
            {row.was_home ? "(H)" : "(A)"}
          </span>
        </div>
      ))}
    </div>
      </div>
)}
      

      {playerFilter && comparePlayer && (
        <div className="w-full max-w-4xl">
        <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="40%" outerRadius="60%" data={scaledComparisonData}>
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

<h1 className="text-4xl font-bold text-center text-royal-beige mt-10 py-5">
  Historical Analysis
</h1>

{/* Collapsible Filters */}
<div className="w-full max-w-6xl mx-auto border border-royal-gold rounded overflow-hidden bg-black/30 hover:border-none">
  {/* Header */}
  <button
    type="button"
    aria-expanded={filtersOpen}
    onClick={() => setFiltersOpen(v => !v)}
    className="
      w-full flex items-center justify-between px-4 py-3
      bg-black/40 hover:bg-black/50
      outline-none focus:outline-none focus:ring-0
      focus-visible:outline-none focus-visible:ring-0 hover:border-none
    "
    title={filtersOpen ? 'Collapse filters' : 'Expand filters'}
  >
    <div className="flex items-center gap-2">
      {!filtersOpen ? <FilterIcon size={18} /> : null}
      <span className="text-sm font-semibold tracking-wide text-royal-beige">
        Filters
      </span>
    </div>
    {filtersOpen ? (
      <ChevronUp size={18} className="text-royal-gold" />
    ) : (
      <ChevronDown size={18} className="text-royal-gold" />
    )}
  </button>

  {/* Body */}
  {filtersOpen && (
    <div className="p-4 border-t border-royal-gold/40">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric */}
        <div className="w-full">
          <h2 className="text-2xl text-royal-beige mb-2 text-center md:text-left">Choose Metric</h2>
          <Select
            options={historyMetrics}
            value={historyMetrics.find(m => m.value === selectedMetric)}
            onChange={o => setSelectedMetric(o.value)}
            placeholder="Metric..."
            styles={selectStyles}
          />
        </div>

        {/* Season */}
        <div className="w-full">
          <h2 className="text-2xl text-royal-beige mb-2 text-center md:text-left">Season</h2>
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

        {/* Opponents */}
        <div className="w-full">
          <h2 className="text-2xl text-royal-beige mb-2 text-center md:text-left">Opponents</h2>
          <Select
            options={opponentOptions}
            value={opponentFilter}
            onChange={opts => setOpponentFilter(opts || [])}
            isMulti
            isClearable
            placeholder="Select Opponent(s)..."
            styles={selectStyles}
          />
        </div>
      </div>

      {/* Date Range */}
      <div className="px-1 mt-6">
        <h2 className="text-2xl text-royal-beige mb-3 text-center">
          Date Range:<br />
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
          step={24 * 60 * 60 * 1000}
          marks={[
            { value: bounds[0], label: valueLabelFormat(bounds[0]) },
            { value: bounds[1], label: valueLabelFormat(bounds[1]) }
          ]}
          getAriaLabel={() => "Date range"}
          sx={{ color: "#B8860B" }}
        />
      </div>
    </div>
  )}
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
            ? "underline text-royal-gold border-royal-gold" 
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
<div className="overflow-x-auto w-full max-w-4xl mx-auto mt-6 text-center">
  <table className="w-full table-auto bg-royal-red text-royal-beige rounded-lg shadow border border-royal-gold">
    <thead>
      <tr className="bg-royal-beige text-black">
        <th className="px-4 py-2 border border-royal-gold">Analysis Name</th>
        <th className="px-4 py-2 border border-royal-gold">Player</th>
        <th className="px-4 py-2 border border-royal-gold">Metric</th>
        <th className="px-4 py-2 border border-royal-gold">Total</th>
        <th className="px-4 py-2 border border-royal-gold">Average</th>
        <th className="px-4 py-2 border border-royal-gold"></th>
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
          <td className="px-4 py-2 border border-royal-gold">
                 <Trash2
                   size={25}
                   className="ml-0 px cursor-pointer text-royal-gold hover:text-red-500 text-center"
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
