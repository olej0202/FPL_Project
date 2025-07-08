
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


const METRICS = {
  Points_prediction: "Points Predicted",
  Goal_pred: "Goals Predicted",
  Assist_pred:"Assists Predicted",
  Rolling_adjusted_XG: "Goal Index",
  Rolling_adjusted_XA: "Assist Index",
  
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
  const navigate = useNavigate();
  const minValue = Math.min(...filtered.map((d) => d.value));
const maxValue = Math.max(...filtered.map((d) => d.value));

const domain = [
  minValue - minValue * 0.1,  // dataMin - 10%
  maxValue + maxValue * 0.1   // dataMax + 10%
];


  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/Player_rankings")
      .then((res) => res.json())
      .then((data) => {
        setRawData(data);
        const GWs = data.map((d) => d.GW);
        setMinGW(Math.min(...GWs));
        setMaxGW(Math.max(...GWs));
        setGWRange([Math.min(...GWs), Math.max(...GWs)]);
      });
  }, []);

  useEffect(() => {
    let data = [...rawData];

    if (selectedPos !== "ALL") {
      data = data.filter((d) => d.position === selectedPos);
    }

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
      // Use latest GW only
      const latestGW = Math.max(...data.map((d) => d.GW));
      const latestData = data.filter((d) => d.GW === latestGW);

      aggregated = latestData.map((d) => ({
        name: d.name,
        value: parseFloat(d[selectedMetric] || 0),
      }));
    }

    // Sort descending
    setFiltered(aggregated.sort((a, b) => b.value - a.value).slice(0, 15));

  }, [rawData, selectedMetric, GWRange, selectedPos]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-6">
      <h2 className="text-2xl font-bold text-center text-white">
        {METRICS[selectedMetric]}
      </h2>

      {/* Metric Buttons */}
      <div className="flex justify-center gap-2 flex-wrap">
        {Object.entries(METRICS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedMetric(key)}
            className={`px-4 py-2 rounded font-semibold transition-all ${
              selectedMetric === key
                ? "underline underline-offset-4 text-royal-gold bg-royal-beige border-none"
                : "text-black hover:text-royal-gold bg-royal-beige border-none"
            } focus:outline-none` }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Position Filter */}
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

      {/* GW Range */}
      {SUM_METRICS.includes(selectedMetric) && minGW !== null && maxGW !== null && (
        <Box sx={{ width: 300, mx: "auto" }}>
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
            sx={{ color: "#FFD700" }}
          />
        </Box>
      )}

      {/* Bar Chart */}
      <div className="w-full max-w-6xl h-[600px] sm:h-[600px] md:h-[700px]">
      <ResponsiveContainer width="95%" height={filtered.length * 40 || 400}>
        <BarChart
          layout="vertical"
          data={filtered}
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid stroke="#333" />
          <XAxis
            type="number"
            tick={false}
            axisLine={false}
            tickLine={false}
            domain={domain} 
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke="#fff"
            tick={{ fontSize: 10 }}
          />
          <Tooltip formatter={(val) => val.toFixed(2)} />

          <Bar
  dataKey="value"
  shape={({ x, y, width, height, index }) => {
    const player = filtered[index];
    const handleClick = () => {
      navigate("/Player_Analytics/Individual", {
        state: { selectedPlayer: player.name },
      });
    };

    return (
      <g onClick={handleClick} style={{ cursor: "pointer" }}>
        <rect x={x} y={y} width={width} height={height} fill="#5A0000" />
        <text
          x={x + width + 5}
          y={y + height / 2}
          alignmentBaseline="middle"
          fill="#fff"
          fontSize="10"
        >
          {player.value.toFixed(2)}
        </text>
      </g>
    );
  }}
/>

        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
