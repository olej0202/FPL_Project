import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";

const METRICS = {
  Points_prediction: "Points Predicted",
  Goal_pred: "Goals Predicted",
  Assist_pred: "Assists Predicted",
  Rolling_adjusted_XG: "Goal Index",
  Rolling_adjusted_XA: "Assist Index",
  Rolling_adjusted_BPS: "Bonus Index",
};

const SUM_METRICS = ["Points_prediction", "Goal_pred"];

export default function Player_analytics_rankings() {
  const [rawData, setRawData] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("Points_prediction");
  const [selectedPos, setSelectedPos] = useState("ALL");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);
  const [valueRange, setValueRange] = useState([0, 15]);
  const [minValuePrice, setMinValuePrice] = useState(0);
  const [maxValuePrice, setMaxValuePrice] = useState(15);

  const navigate = useNavigate();
  const { fetchIfNeeded, loading, PlayersData } = useStatsData();

  useEffect(() => {
    const loadData = async () => {
      await fetchIfNeeded();
      if (PlayersData.current && PlayersData.current.length > 0) {
        const data = PlayersData.current;
        setRawData(data);

        const GWs = data.map((d) => d.GW);
        const prices = data.map((d) => d.value || 0);

        const minGWVal = Math.min(...GWs);
        const maxGWVal = Math.max(...GWs);
        const minPrice = Math.floor(Math.min(...prices));
        const maxPrice = Math.ceil(Math.max(...prices));

        setMinGW(minGWVal);
        setMaxGW(maxGWVal);
        setGWRange([minGWVal, maxGWVal]);
        setMinValuePrice(minPrice);
        setMaxValuePrice(maxPrice);
        setValueRange([minPrice, maxPrice]);
      }
    };
    loadData();
  }, [fetchIfNeeded, PlayersData]);

  useEffect(() => {
    let data = [...rawData];

    if (selectedPos !== "ALL") {
      data = data.filter((d) => d.position === selectedPos);
    }

    data = data.filter(
      (d) => d.value >= valueRange[0] && d.value <= valueRange[1]
    );

    let aggregated;

    if (SUM_METRICS.includes(selectedMetric)) {
      const filteredByGW = data.filter(
        (d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]
      );

      aggregated = Object.values(
        filteredByGW.reduce((acc, curr) => {
          if (!acc[curr.name]) acc[curr.name] = { name: curr.name, value: 0 };
          acc[curr.name].value += parseFloat(curr[selectedMetric] || 0);
          return acc;
        }, {})
      );
    } else {
      const latestGW = Math.max(...data.map((d) => d.GW));
      const latestData = data.filter((d) => d.GW === latestGW);

      aggregated = latestData.map((d) => ({
        name: d.name,
        value: parseFloat(d[selectedMetric] || 0),
      }));
    }

    setFiltered(aggregated.sort((a, b) => b.value - a.value).slice(0, 15));
  }, [rawData, selectedMetric, GWRange, selectedPos, valueRange]);

  if (loading) return <div className="text-white">Loading...</div>;

  const minValue = Math.min(...filtered.map((d) => d.value));
  const maxValue = Math.max(...filtered.map((d) => d.value));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-6">
      <h2 className="text-2xl font-bold text-center text-white">
        {METRICS[selectedMetric]}
      </h2>

      <div className="w-full max-w-xs mx-auto mt-4">
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="w-full px-4 py-3 rounded bg-royal-beige text-black font-semibold focus:outline-none"
        >
          {Object.entries(METRICS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Typography gutterBottom className="text-white text-center">
        Positions
      </Typography>
      <div className="flex justify-center gap-1">
        {["ALL", "GKP", "DEF", "MID", "FWD"].map((pos) => (
          <button
            key={pos}
            onClick={() => setSelectedPos(pos)}
            className={`px-3 py-1 rounded border ${
              selectedPos === pos
                ? "underline underline-offset-4 text-royal-gold bg-royal-beige hover:border-none"
                : "text-black hover:text-royal-gold bg-royal-beige hover:border-none"
            } focus:outline-none`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* GW Slider */}
      {SUM_METRICS.includes(selectedMetric) &&
        minGW !== null &&
        maxGW !== null && (
          <Box sx={{ width: 300, mx: "auto", mt: 2 }}>
            <Typography gutterBottom className="text-white text-center">
              GW Range: {GWRange[0]} - {GWRange[1]}
            </Typography>
            <Slider
              value={GWRange}
              min={minGW}
              max={maxGW}
              onChange={(e, newVal) => setGWRange(newVal)}
              valueLabelDisplay="auto"
              step={1}
              sx={{ color: "#B8860B" }}
            />
          </Box>
        )}

      {/* Price Slider */}
      {minValuePrice !== null && maxValuePrice !== null && (
        <Box sx={{ width: 300, mx: "auto", mt: 4 }}>
          <Typography gutterBottom className="text-white text-center">
            Filter by Price: {valueRange[0]}M – {valueRange[1]}M
          </Typography>
          <Slider
            value={valueRange}
            min={minValuePrice}
            max={maxValuePrice}
            onChange={(e, newVal) => setValueRange(newVal)}
            valueLabelDisplay="auto"
            step={0.1}
            sx={{ color: "#B8860B" }}
          />
        </Box>
      )}

      {/* Ranking List */}
      <ul className="w-full max-w-2xl divide-y divide-gray-700">
        {filtered.map((player, idx) => {
          const percentage =
            maxValue === minValue
              ? 100
              : ((player.value - minValue) / (maxValue - minValue)) * 100;

          return (
            <li
              key={player.name}
              className="relative py-3 px-4 cursor-pointer hover:bg-royal-red transition"
              onClick={() =>
                navigate("/Player_Analytics/Individual", {
                  state: { selectedPlayer: player.name },
                })
              }
            >
              <div
                className="absolute top-0 left-0 h-full bg-royal-gold opacity-30 rounded-r"
                style={{ width: `${percentage}%` }}
              ></div>

              <div className="relative z-10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-royal-gold font-bold w-6 text-right">
                    {idx + 1}.
                  </span>
                  <span className="text-white">{player.name}</span>
                </div>
                <span className="text-royal-gold font-semibold">
                  {player.value.toFixed(2)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
