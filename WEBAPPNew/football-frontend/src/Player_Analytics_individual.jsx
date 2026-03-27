import React, { useEffect, useState, useMemo } from "react";
import Select from "react-select";
import { useLocation, useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";
import Slider from "@mui/material/Slider";
import {
  Table,
  BarChart2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Filter as FilterIcon,
  Save,
  X,
} from "lucide-react";
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
  Legend,
} from "recharts";

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
};

export default function PlayerAnalyticsIndividual() {
  const {
    fetchIfNeeded,
    loading,
    PlayersData,
    addAnalysis,
    analyses,
    removeAnalysis,
  } = useStatsData();
  const navigate = useNavigate();
  const API_URL = "https://fpl-project-t5e9.onrender.com/Player";
  const fallbackUrl =
    "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

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
      behavior: "smooth",
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
        const playerData = PlayersData.current.filter(
          (p) => p.name === playerFilter
        );
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
          setplayerSelected(latest.selected.toFixed(3) * 100 || null);
        }

        fetch(
          `https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(
            playerFilter
          )}`
        )
          .then((res) => res.text())
          .then((url) => setPlayerImageUrl(url.trim()))
          .catch(() => setPlayerImageUrl(""));
      }
    }
  }, [PlayersData.current, playerFilter]);

  const playerOptions = players.map((player) => ({
    value: player,
    label: player,
  }));

  const getLatestStatsFromContext = async (player, setter) => {
    await fetchIfNeeded();
    const playerData = PlayersData.current.filter((p) => p.name === player);
    if (!playerData.length) return;
    const totalPredictions = playerData.reduce(
      (sum, row) => sum + row.Points_prediction,
      0
    );
    const sorted = playerData.sort(
      (a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time)
    );
    const latest = playerData[playerData.length - 1];

    setter({
      Rolling_adjusted_XG: latest.Rolling_adjusted_XG || 0,
      Rolling_adjusted_XA: latest.Rolling_adjusted_XA || 0,
      Rolling_adjusted_BPS: latest.Rolling_adjusted_BPS || 0,
      Overcore: latest.Average_Overscore || 0,
      DefCon: latest.DefCon || 0,
      points_predictions: totalPredictions || 0,
    });
  };

  useEffect(() => {
    if (comparePlayer) {
      getLatestStatsFromContext(comparePlayer, setCompareStats);
      fetch(
        `https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(
          comparePlayer
        )}`
      )
        .then((res) => res.text())
        .then((url) => setCompareImageUrl(url.trim()))
        .catch(() => setCompareImageUrl(""));
    }
  }, [comparePlayer, PlayersData]);

  useEffect(() => {
    if (!playerFilter) return;
    const fetchData = async () => {
      await fetchIfNeeded();
      const res = await fetch(
        `${API_URL}?player=${encodeURIComponent(playerFilter)}`
      );
      const raw = await res.json();
      const sorted = raw.sort(
        (a, b) =>
          new Date(a["Kickoff time"]) - new Date(b["Kickoff time"])
      );
      setData(sorted);
    };
    fetchData();
  }, [playerFilter]);

  useEffect(() => {
    if (!data.length) return;
    const timestamps = data.map((d) =>
      new Date(d["Kickoff time"]).getTime()
    );
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    setBounds([minTs, maxTs]);
    setDateRange([minTs, maxTs]);
  }, [data]);

  // Season filter
  const seasonOptions = useMemo(() => {
    const uniq = Array.from(new Set(data.map((d) => d.Season))).sort();
    return uniq.map((s) => ({ value: s, label: s }));
  }, [data]);

  // Opponent filter
  const opponentOptions = useMemo(() => {
    const uniq = Array.from(
      new Set(data.map((d) => d["Opponent Name"]))
    ).sort();
    return uniq.map((o) => ({ value: o, label: o }));
  }, [data]);

  const filtered = useMemo(() => {
    const [low, high] = dateRange;
    const chosen = seasonFilter.map((s) => s.value);
    const chosenOpponents = opponentFilter.map((o) => o.value);

    return data.filter((d) => {
      const ts = new Date(d["Kickoff time"]).getTime();
      const inDateRange = ts >= low && ts <= high;
      const inSeason =
        chosen.length === 0 || chosen.includes(d.Season);
      const inOpponent =
        !chosenOpponents.length ||
        chosenOpponents.includes(d["Opponent Name"]);
      return inDateRange && inSeason && inOpponent;
    });
  }, [data, dateRange, seasonFilter, opponentFilter]);

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
    { title: "XPoints", value: latestStats.points_predictions },
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
        return value * 200;
      case "Rolling_adjusted_XA":
        return value * 230;
      case "Rolling_adjusted_BPS":
        return value * 4;
      case "DefCon":
        return value * 5;
      case "Overcore":
        return value * 30;
      case "points_predictions":
        return value;
      default:
        return value * 10;
    }
  };

  const scaledComparisonData = rawStats.map(({ key, label }) => ({
    metric: label,
    [playerFilter]: scaleValue(key, latestStats[key]),
    [comparePlayer]: scaleValue(key, compareStats[key]),
    [`${playerFilter}_label`]: (latestStats[key] || 0).toFixed(2),
    [`${comparePlayer}_label`]: (compareStats[key] || 0).toFixed(2),
  }));

  const values = filtered
    .map((d) => parseFloat(d[selectedMetric]))
    .filter((v) => !isNaN(v));
  const avgOfMetric = values.length
    ? values.reduce((acc, v) => acc + v, 0) / values.length
    : 0;
  const TotalOfMetric = values.length
    ? values.reduce((acc, v) => acc + v, 0)
    : 0;
  const stdDeviation =
    values.length > 1
      ? Math.sqrt(
          values.reduce(
            (acc, v) => acc + Math.pow(v - avgOfMetric, 2),
            0
          )
        ) /
        (values.length - 1)
      : 0;

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
      Type: "Player",
    });
    setModalOpen(false);
  };

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: "#ffffff",
      color: "#1e293b",
      borderColor: "#cbd5e1",
      minHeight: "2.5rem",
    }),
    singleValue: (base) => ({
      ...base,
      color: "#1e293b",
    }),
    placeholder: (base) => ({
      ...base,
      color: "#64748b",
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#d1fae5"
        : state.isFocused
        ? "#f1f5f9"
        : "#ffffff",
      color: "#1e293b",
      cursor: "pointer",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "#ffffff",
      border: "1px solid #cbd5e1",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
  };

  const selectPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  // Fixtures from context
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
        <div className="bg-white p-3 border border-emerald-200 rounded text-slate-800 text-sm">
          <p className="font-bold mb-1">{label}</p>
          <p>
            {player1}:{" "}
            <span className="text-emerald-700">{p1Label}</span>
          </p>
          <p>
            {player2}:{" "}
            <span className="text-red-400">{p2Label}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const minValue = filtered.length
    ? Math.min(...filtered.map((d) => d.value || 0))
    : 0;
  const maxValue = filtered.length
    ? Math.max(...filtered.map((d) => d.value || 1))
    : 1;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: `radial-gradient(circle at top, #f8fafc 0, #eef2ff 55%, #e2e8f0 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: "72rem", margin: "0 auto" }}>
        {/* Header */}
        <header
          style={{
            marginBottom: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.9rem",
              fontWeight: 700,
            }}
          >
            Player Analytics
          </h1>
          <p
            style={{
              marginTop: "0.35rem",
              fontSize: "0.85rem",
              color: "#64748b",
            }}
          >
            Inspect player form, compare with others, and dig into historical
            performance.
          </p>
        </header>

        {/* Player header card */}
        <section
          style={{
            borderRadius: "1rem",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
            padding: "1rem 1.25rem 1.1rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Player selector */}
          <div className="w-full max-w-sm mx-auto text-center mb-4">
            <Select
              options={playerOptions}
              getOptionLabel={(opt) =>
                String(opt.label ?? opt.value).replace(/_/g, " ")
              }
              getOptionValue={(opt) => String(opt.value ?? opt.label)}
              onChange={(opt) => setPlayerFilter(opt?.value ?? "")}
              value={
                playerOptions.find((o) => o.value === playerFilter) ||
                null
              }
              styles={selectStyles}
              menuPortalTarget={selectPortalTarget}
              menuPosition="fixed"
              placeholder="Select or search player..."
            />
          </div>

          {/* Player image + badges */}
          <div className="flex gap-10 justify-center mt-2">
            {playerFilter && playerImageUrl && (
              <div className="relative inline-block">
                <img
                  src={playerImageUrl}
                  alt={playerFilter}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackUrl;
                  }}
                  className="max-w-[140px] rounded shadow-lg"
                />
                <div className="absolute top-1 -right-14 bg-white text-slate-700 text-xs font-bold px-1 py-1 rounded text-center">
                  <span>Selected</span>
                  <br />
                  <span>
                    {parseFloat(playerSelected ?? 0).toFixed(1)}%
                  </span>
                </div>
                <div className="absolute top-1 -left-14 bg-white text-slate-700 text-xs font-bold px-4 py-1 rounded text-center">
                  <span>Price</span>
                  <br />
                  <span>£{playerValue}</span>
                </div>
              </div>
            )}
          </div>

          {playerNews && playerNews !== "No news" && (
            <div className="mt-3 mx-auto max-w-md bg-rose-50 text-rose-700 font-semibold px-3 py-1.5 rounded border border-rose-200 text-center text-sm">
              {playerNews}
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
            {statCards.map((stat, idx) => (
              <div
                key={idx}
                className="bg-slate-50 text-slate-700 px-3 py-2 border border-slate-300 rounded-lg shadow text-center"
              >
                <h2 className="text-[11px] font-semibold mb-1">
                  {stat.title}
                </h2>
                <p className="text-base font-bold">
                  {parseFloat(stat.value ?? 0).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Fixtures (main player) */}
        <section
          style={{
            borderRadius: "1rem",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
            padding: "0.9rem 1rem 1rem",
            marginBottom: "1.3rem",
          }}
        >
          <div className="w-full max-w-6xl mx-auto text-center">
            <h3 className="text-lg font-semibold mb-2">
              Fixtures next {playerFixtures.length} GWs
            </h3>
            <div className="flex flex-row overflow-x-auto sm:flex-wrap sm:justify-center justify-start space-x-1 sm:space-x-4 px-2 py-2">
              {playerFixtures.map((row, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    navigate("/Team_Analytics/Team_Individual", {
                      state: { selectedTeam: row.opponent_name },
                    })
                  }
                  className="flex-shrink-0 flex flex-col items-center bg-emerald-50 border border-emerald-100 text-slate-700 p-2 rounded shadow-sm w-16 sm:w-auto cursor-pointer"
                >
                  <span className="text-xs font-semibold">
                    GW {row.GW}
                  </span>
                  {teamLogos[row.opponent_name] ? (
                    <img
                      src={teamLogos[row.opponent_name]}
                      alt={row.opponent_name}
                      className="h-10 w-11 object-contain"
                    />
                  ) : (
                    <span className="text-sm truncate">
                      {row.opponent_name}
                    </span>
                  )}
                  <span className="text-xs font-semibold mt-0">
                    {row.was_home ? "(H)" : "(A)"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Predicted points line chart */}
        <section
          style={{
            borderRadius: "1rem",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
            padding: "0.9rem 1rem 1rem",
            marginBottom: "1.6rem",
          }}
        >
          <h3 className="text-lg font-semibold mb-2 text-center">
            Predicted Points
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={fixtureData}
                margin={{ top: 0, right: 5, left: 0, bottom: 5 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="GW"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  domain={["auto", "auto"]}
                  stroke="#94a3b8"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#cbd5e1",
                    color: "#1e293b",
                  }}
                  itemStyle={{ color: "#1e293b" }}
                  labelStyle={{ color: "#1e293b" }}
                  formatter={(v) =>
                    v != null ? v.toFixed(1) : "-"
                  }
                  labelFormatter={(l) => `GW ${l}`}
                />
                <Legend verticalAlign="bottom" align="right" />
                <Line
                  type="monotone"
                  dataKey={playerFilter}
                  name={playerFilter.replace(/_/g, " ")}
                  stroke="#1e293b"
                  dot={false}
                />
                {comparePlayer && (
                  <Line
                    type="monotone"
                    dataKey={comparePlayer}
                    name={comparePlayer.replace(/_/g, " ")}
                    stroke={PALETTE.gold}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Compare player block */}
        <section
          style={{
            borderRadius: "1rem",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
            padding: "1rem 1.25rem 1.2rem",
            marginBottom: "1.5rem",
          }}
        >
          <h1 className="text-2xl font-bold text-center mb-3">
            Compare Player
          </h1>

          {/* Compare image */}
          <div className="flex justify-center mt-2">
            {comparePlayer && (
              <div className="relative inline-block">
                <img
                  src={compareImageUrl}
                  alt={comparePlayer}
                  className="max-w-[140px] rounded shadow-lg"
                />
                <button
                  onClick={() => {
                    setComparePlayer("");
                    setCompareStats({});
                    setCompareImageUrl("");
                  }}
                  className="absolute -top-1 -right-14 bg-slate-100 p-1 rounded-full hover:bg-white"
                >
                  <X
                    size={40}
                    className="text-red-700 hover:text-red-500"
                  />
                </button>
              </div>
            )}
          </div>

          {/* Compare selector */}
          <div className="w-full max-w-sm mx-auto mt-4 text-center">
            <Select
              options={playerOptions}
              getOptionLabel={(opt) =>
                String(opt.label ?? opt.value).replace(/_/g, " ")
              }
              getOptionValue={(opt) => String(opt.value ?? opt.label)}
              onChange={(opt) => setComparePlayer(opt?.value ?? "")}
              value={
                playerOptions.find(
                  (o) => o.value === comparePlayer
                ) || null
              }
              styles={selectStyles}
              menuPortalTarget={selectPortalTarget}
              menuPosition="fixed"
              placeholder="Compare with..."
            />
          </div>

          {/* Compare fixtures */}
          {comparePlayer && compareFixtures.length > 0 && (
            <div className="w-full max-w-6xl mx-auto mt-6 text-center">
              <h3 className="text-lg font-semibold mb-2">
                Fixtures next {compareFixtures.length} GWs
              </h3>
              <div className="flex flex-row overflow-x-auto sm:flex-wrap sm:justify-center justify-start space-x-1 sm:space-x-4 px-2 py-2">
                {compareFixtures.map((row, idx) => (
                  <div
                    key={idx}
                    onClick={() =>
                      navigate("/Team_Analytics/Team_Individual", {
                        state: { selectedTeam: row.opponent_name },
                      })
                    }
                    className="flex-shrink-0 flex flex-col items-center bg-emerald-50 border border-emerald-100 text-slate-700 p-2 rounded shadow-sm w-16 sm:w-auto cursor-pointer"
                  >
                    <span className="text-xs font-semibold">
                      GW {row.GW}
                    </span>
                    {teamLogos[row.opponent_name] ? (
                      <img
                        src={teamLogos[row.opponent_name]}
                        alt={row.opponent_name}
                        className="h-10 w-11 object-contain"
                      />
                    ) : (
                      <span className="text-sm truncate">
                        {row.opponent_name}
                      </span>
                    )}
                    <span className="text-xs font-semibold mt-0">
                      {row.was_home ? "(H)" : "(A)"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radar comparison */}
          {playerFilter && comparePlayer && (
            <div className="w-full max-w-4xl mx-auto mt-6">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart
                  cx="50%"
                  cy="40%"
                  outerRadius="60%"
                  data={scaledComparisonData}
                >
                  <PolarGrid stroke="#666" />
                  <PolarAngleAxis
                    dataKey="metric"
                    stroke={PALETTE.gold}
                  />
                  <Radar
                    name={playerFilter}
                    dataKey={playerFilter}
                    stroke={PALETTE.gold}
                    fill={PALETTE.gold}
                    fillOpacity={0.6}
                  />
                  <Radar
                    name={comparePlayer}
                    dataKey={comparePlayer}
                    stroke="#FF6347"
                    fill="#FF6347"
                    fillOpacity={0.6}
                  />
                  <Tooltip content={<CustomRadarTooltip />} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Historical analysis section */}
        <h1 className="text-3xl font-bold text-center text-slate-700 mt-6 mb-3">
          Historical Analysis
        </h1>

        {/* Filters card (collapsible) */}
        <div
          className="w-full max-w-6xl mx-auto"
          style={{
            borderRadius: "1rem",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
            overflow: "visible",
          }}
        >
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-100"
          >
            <div className="flex items-center gap-2">
              {!filtersOpen ? <FilterIcon size={18} /> : null}
              <span className="text-sm font-semibold tracking-wide text-slate-700">
                Filters
              </span>
            </div>
            {filtersOpen ? (
              <ChevronUp size={18} className="text-emerald-700" />
            ) : (
              <ChevronDown size={18} className="text-emerald-700" />
            )}
          </button>

          {filtersOpen && (
            <div className="p-4 border-t border-slate-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="w-full">
                  <h2 className="text-sm text-slate-700 mb-2 font-semibold">
                    Metric
                  </h2>
                  <Select
                    options={historyMetrics}
                    value={historyMetrics.find(
                      (m) => m.value === selectedMetric
                    )}
                    onChange={(o) => setSelectedMetric(o.value)}
                    placeholder="Metric..."
                    styles={selectStyles}
                    menuPortalTarget={selectPortalTarget}
                    menuPosition="fixed"
                  />
                </div>
                <div className="w-full">
                  <h2 className="text-sm text-slate-700 mb-2 font-semibold">
                    Season
                  </h2>
                  <Select
                    options={seasonOptions}
                    value={seasonFilter}
                    onChange={(opts) => setSeasonFilter(opts || [])}
                    isMulti
                    isClearable
                    placeholder="Select Season(s)..."
                    styles={selectStyles}
                    menuPortalTarget={selectPortalTarget}
                    menuPosition="fixed"
                  />
                </div>
                <div className="w-full">
                  <h2 className="text-sm text-slate-700 mb-2 font-semibold">
                    Opponents
                  </h2>
                  <Select
                    options={opponentOptions}
                    value={opponentFilter}
                    onChange={(opts) =>
                      setOpponentFilter(opts || [])
                    }
                    isMulti
                    isClearable
                    placeholder="Select Opponent(s)..."
                    styles={selectStyles}
                    menuPortalTarget={selectPortalTarget}
                    menuPosition="fixed"
                  />
                </div>
              </div>

              {/* Date range slider */}
              <div className="mt-6">
                <h2 className="text-sm text-slate-700 mb-3 text-center font-semibold">
                  Date Range:
                  <br />
                  {dateRange[0] && dateRange[1]
                    ? `${new Date(
                        dateRange[0]
                      ).toLocaleDateString()} – ${new Date(
                        dateRange[1]
                      ).toLocaleDateString()}`
                    : " Select a range"}
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
                    {
                      value: bounds[0],
                      label: valueLabelFormat(bounds[0]),
                    },
                    {
                      value: bounds[1],
                      label: valueLabelFormat(bounds[1]),
                    },
                  ]}
                  getAriaLabel={() => "Date range"}
                  sx={{ color: PALETTE.gold }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Summary stats + save analysis */}
        <div className="flex flex-col items-center mt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <div className="bg-white text-slate-700 p-4 border border-slate-200 rounded-lg shadow text-center min-w-[220px]">
              <h2 className="text-sm font-semibold mb-2 capitalize">
                Total {selectedMetric.replace("_", " ")}
              </h2>
              <p className="text-2xl font-bold mb-3">
                {TotalOfMetric.toFixed(2)}
              </p>
              <h2 className="text-sm font-semibold mb-2 capitalize">
                Avg. {selectedMetric.replace("_", " ")}
              </h2>
              <p className="text-2xl font-bold mb-3">
                {avgOfMetric.toFixed(2)}
              </p>
              <h2 className="text-sm font-semibold mb-2 capitalize">
                Std. Dev. {selectedMetric.replace("_", " ")}
              </h2>
              <p className="text-2xl font-bold">
                {stdDeviation.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 mt-4">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50 transition"
            >
              <Save size={18} />
              Save Analysis
            </button>

            <button
              onClick={scrollToBottom}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:underline transition"
            >
              <ChevronDown size={20} />
              See Saved
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        <NameModal
          isOpen={modalOpen}
          onConfirm={handleAddAnalysis}
          onCancel={() => setModalOpen(false)}
        />

        {/* Toggle between table and chart */}
        <div className="flex items-center gap-6 mb-4 justify-center mt-6">
          <Table
            size={24}
            className={`cursor-pointer ${
              showTable
                ? "underline text-emerald-700"
                : "text-slate-800 hover:text-slate-600"
            }`}
            onClick={() => setShowTable(true)}
          />
          <BarChart2
            size={24}
            className={`cursor-pointer ${
              !showTable
                ? "underline text-emerald-700"
                : "text-slate-800 hover:text-slate-600"
            }`}
            onClick={() => setShowTable(false)}
          />
        </div>

        {/* Table or chart */}
        {showTable ? (
          <div className="overflow-auto bg-white p-4 rounded shadow border border-slate-200 text-slate-700 max-w-6xl mx-auto">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="px-2 py-2 border border-slate-200">
                    Season
                  </th>
                  <th className="px-2 py-2 border border-slate-200">
                    Opponent
                  </th>
                  <th className="px-2 py-2 border border-slate-200">
                    Date
                  </th>
                  <th className="px-2 py-2 border border-slate-200">
                    {
                      historyMetrics.find(
                        (m) => m.value === selectedMetric
                      )?.label
                    }
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={i}
                    className="odd:bg-slate-50 hover:bg-slate-100"
                  >
                    <td className="px-3 py-1 border border-slate-200">
                      {row.Season}
                    </td>
                    <td className="px-3 py-1 border border-slate-200">
                      {row["Opponent Name"]}
                    </td>
                    <td className="px-3 py-1 border border-slate-200">
                      {row["Kickoff time"]}
                    </td>
                    <td className="px-3 py-1 border border-slate-200">
                      {row[selectedMetric]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white p-3 rounded shadow border border-slate-200 w-full max-w-6xl mx-auto mt-4">
            <h2 className="text-xl font-semibold mb-3 text-center text-slate-700 capitalize">
              {selectedMetric.replace("_", " ")} Over Time
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={filtered}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e2e8f0" />
                  <XAxis
                    dataKey="Kickoff time"
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                  />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    content={
                      <CustomTooltip selectedMetric={selectedMetric} />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey={selectedMetric}
                    stroke={PALETTE.gold}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Saved analyses */}
        <div className="max-w-2xl mx-auto mt-8">
          <h2 className="text-xl text-slate-700 mb-2 text-center">
            Saved Analyses
          </h2>
        </div>
        <div className="overflow-x-auto w-full max-w-4xl mx-auto mt-4 text-center">
          <table className="w-full table-auto bg-white text-slate-700 rounded-lg shadow border border-slate-200">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="px-4 py-2 border border-slate-200">
                  Analysis Name
                </th>
                <th className="px-4 py-2 border border-slate-200">
                  Player
                </th>
                <th className="px-4 py-2 border border-slate-200">
                  Metric
                </th>
                <th className="px-4 py-2 border border-slate-200">
                  Total
                </th>
                <th className="px-4 py-2 border border-slate-200">
                  Average
                </th>
                <th className="px-4 py-2 border border-slate-200"></th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr
                  key={a.id}
                  className="odd:bg-slate-50 hover:bg-slate-100"
                >
                  <td className="px-4 py-2 border border-slate-200">
                    {a.id}
                  </td>
                  <td className="px-4 py-2 border border-slate-200">
                    {a.player}
                  </td>
                  <td className="px-4 py-2 border border-slate-200">
                    {a.metric}
                  </td>
                  <td className="px-4 py-2 border border-slate-200">
                    {a.TotalOfMetric.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 border border-slate-200">
                    {a.avgOfMetric.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 border border-slate-200">
                    <Trash2
                      size={22}
                      className="cursor-pointer text-emerald-700 hover:text-red-500"
                      onClick={() => removeAnalysis(a.id)}
                    />
                  </td>
                </tr>
              ))}
              {analyses.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-3 border border-slate-200 text-center text-sm text-slate-700/80"
                  >
                    No saved analyses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}





