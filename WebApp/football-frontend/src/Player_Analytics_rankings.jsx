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
  DefCon: "DefCon Index",
};

const SUM_METRICS = ["Points_prediction", "Goal_pred", "Assist_pred"];

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

        const GWs = data.map((d) => d.GW).filter((n) => Number.isFinite(n));
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

    data = data.filter((d) => d.value >= valueRange[0] && d.value <= valueRange[1]);

    if (selectedMetric === "DefCon") {
      data = data.filter((d) => {
        const v = Number(d.DefCon);
        return Number.isFinite(v) && v <= 14;
      });
    }

    let aggregated;

    if (SUM_METRICS.includes(selectedMetric)) {
      const filteredByGW = data.filter((d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]);

      aggregated = Object.values(
        filteredByGW.reduce((acc, curr) => {
          if (!acc[curr.name]) {
            acc[curr.name] = {
              id: curr.name,
              web_name: curr.web_name,
              value: 0,
            };
          }
          acc[curr.name].value += parseFloat(curr[selectedMetric] || 0);
          return acc;
        }, {})
      );
    } else {
      const latestGW = Math.max(...data.map((d) => d.GW));
      const latestData = data.filter((d) => d.GW === latestGW);

      aggregated = latestData.map((d) => ({
        id: d.name,
        web_name: d.web_name,
        value: parseFloat(d[selectedMetric] || 0),
      }));
    }

    setFiltered(
      aggregated
        .sort((a, b) => b.value - a.value)
        .slice(0, 20)
    );
  }, [rawData, selectedMetric, GWRange, selectedPos, valueRange]);

  const minValue = filtered.length ? Math.min(...filtered.map((d) => d.value)) : 0;
  const maxValue = filtered.length ? Math.max(...filtered.map((d) => d.value)) : 1;

  // Skeleton row for loading state
  const SkeletonRow = ({ i }) => (
    <li className="relative py-3 px-4">
      <div className="h-6 w-1/2 bg-neutral-800 rounded mb-2 animate-pulse" />
      <div className="h-4 w-1/3 bg-neutral-800 rounded animate-pulse" />
    </li>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Player Rankings</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">Rank top performers by predicted output or form indexes. Refine by position, price, and gameweeks.</p>
        </header>

        {/* Controls */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Metric select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-neutral-400">Metric</label>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-black/60 px-3 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-royal-gold/60"
                aria-label="Select ranking metric"
              >
                {Object.entries(METRICS).map(([key, label]) => (
                  <option key={key} value={key} className="bg-black text-neutral-100">
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Positions */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-neutral-400">Positions</label>
              <div className="flex flex-wrap gap-2">
                {["ALL", "GKP", "DEF", "MID", "FWD"].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setSelectedPos(pos)}
                    className={`h-10 px-3 rounded-md border text-sm transition focus:outline-none focus:ring-2 focus:ring-royal-gold/60 ${
                      selectedPos === pos
                        ? "bg-royal-gold text-black border-yellow-400"
                        : "bg-black/60 text-neutral-200 border-white/10 hover:bg-white/10"
                    }`}
                    aria-pressed={selectedPos === pos}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Price slider */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-neutral-400">Price Range</label>
              <Box sx={{ width: "100%" }}>
                <Typography gutterBottom className="!text-xs !text-neutral-300 !mb-1">
                  {valueRange[0]}M – {valueRange[1]}M
                </Typography>
                <Slider
                  value={valueRange}
                  min={minValuePrice}
                  max={maxValuePrice}
                  onChange={(e, newVal) => setValueRange(newVal)}
                  valueLabelDisplay="auto"
                  step={0.1}
                  sx={{ color: "#B8860B" }}
                  aria-label="Filter by price range"
                />
              </Box>
            </div>
          </div>

          {/* GW slider (only for sum metrics) */}
          {SUM_METRICS.includes(selectedMetric) && minGW != null && maxGW != null && (
            <div className="mt-4">
              <label className="text-xs uppercase tracking-wide text-neutral-400">GW Range</label>
              <Box sx={{ width: "100%" }}>
                <Typography gutterBottom className="!text-xs !text-neutral-300 !mb-1">
                  {GWRange[0]} – {GWRange[1]}
                </Typography>
                <Slider
                  value={GWRange}
                  min={minGW}
                  max={maxGW}
                  onChange={(e, newVal) => setGWRange(newVal)}
                  valueLabelDisplay="auto"
                  step={1}
                  sx={{ color: "#B8860B" }}
                  aria-label="Filter by gameweek range"
                />
              </Box>
            </div>
          )}
        </section>

        {/* Rankings */}
        <section>
          {loading ? (
            <ul className="w-full max-w-3xl mx-auto divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} i={i} />
              ))}
            </ul>
          ) : (
            <ul className="w-full max-w-3xl mx-auto divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {filtered.map((player, idx) => {
                const percentage = maxValue === minValue ? 100 : ((player.value - minValue) / (maxValue - minValue)) * 100;
                const displayName = player.web_name;
                return (
                  <li
                    key={player.id}
                    className="relative py-3 px-4 cursor-pointer group"
                    onClick={() =>
                      navigate("/Player_Analytics/Individual", {
                        state: { selectedPlayer: player.id },
                      })
                    }
                    title={`View ${displayName}`}
                  >
                    {/* background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-royal-gold/25 rounded-r transition-[width] duration-300"
                      style={{ width: `${percentage}%` }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-royal-gold font-bold w-6 text-right tabular-nums">{idx + 1}.</span>
                        <span className="truncate">{displayName}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-royal-gold">{player.value.toFixed(2)}</span>
                    </div>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="py-6 text-center text-neutral-400">No players match your filters.</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
