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
import Typography from "@mui/material/Typography";

const METRICS = {
  XG_avg: "Offensive Strength (XG)",
  XGC_avg: "Defensive Strength (XGC)",
  Elo_Rating: "Elo Rating",
  "XGH-XGA": "Home Attack Effect",
};

export default function Team_Analytics_Rankings() {
  const [rawData, setRawData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("XG_avg");

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/Team_current")
      .then((res) => res.json())
      .then((data) => {
        setRawData(data);
      });
  }, []);

  const sortedData = [...rawData]
    .map((team) => ({
      name: team.name,
      value: parseFloat(team[selectedMetric] || 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20); // Top 20 teams

  const minValue = Math.min(...sortedData.map((d) => d.value));
  const maxValue = Math.max(...sortedData.map((d) => d.value));
  const domain = [minValue - minValue * 0.1, maxValue + maxValue * 0.1];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-6">
      <h2 className="text-2xl font-bold text-center text-white">
        {METRICS[selectedMetric]}
      </h2>

      {/* Metric Selection */}
      <div className="flex justify-center gap-2 flex-wrap">
        {Object.entries(METRICS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedMetric(key)}
            className={`px-4 py-2 rounded font-semibold transition-all ${
              selectedMetric === key
                ? "underline underline-offset-4 text-royal-gold bg-royal-beige"
                : "text-black hover:text-royal-gold bg-royal-beige"
            } focus:outline-none`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bar Chart */}
      <div className="w-full max-w-6xl h-[700px]">
        <ResponsiveContainer width="95%" height={sortedData.length * 40 || 400}>
          <BarChart
            layout="vertical"
            data={sortedData}
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
              tick={{ fontSize: 12 }}
            />
            <Tooltip formatter={(val) => val.toFixed(2)} />
            <Bar
              dataKey="value"
              fill="#5A0000"
              label={{ position: "right", fill: "#fff", fontSize: 10 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
