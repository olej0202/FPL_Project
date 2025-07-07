import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const METRIC_LABELS = {
  XG: "Predicted Goals Scored",
  XGC: "Predicted Goals Conceded",
  Opposition_XG: "Top Defensive Fixtures",
  Opposition_XGC: "Top Attacking Fixtures",
};

const getGradientColor = (index, total) => {
  const ratio = index / (total - 1); // 0 (top) to 1 (bottom)

  const r = Math.floor(255 * ratio);             // Red increases
  const g = Math.floor(240 * (1 - ratio));       // Green decreases
  return `rgb(${r}, ${g}, 0)`;                   // Blue is 0 (green → yellow → red)
};

const CustomYAxisTick = ({ x, y, payload }) => {
  const logo = teamLogos[payload.value];
  return (
    <g transform={`translate(${x},${y})`}>
      {logo ? (
        <image
          href={logo}
          width={24}
          height={24}
          x={-30}
          y={-12}
        />
      ) : (
        <text x={0} y={0} dy={4} textAnchor="end" fill="#fff">
          {payload.value}
        </text>
      )}
    </g>
  );
};


const teamLogos = {
  "Man City": "https://logodetimes.com/times/manchester-city/logo-manchester-city-4096.png",
  "Arsenal": "https://pluspng.com/img-png/arsenal-png-arsenal-fc-icon-png-50-px-1600.png",
  "Chelsea": "https://pluspng.com/img-png/chelsea-logo-png-chelsea-fc-logo-png-and-vector-logo-img-4096x4096.png",
  "Nott'm Forest": "https://cdn.freebiesupply.com/logos/large/2x/nottingham-forest-fc-logo-png-transparent.png",
  "Leicester": "https://logodownload.org/wp-content/uploads/2019/05/leicester-city-logo.png",
  "Man Utd": "https://pngimg.com/uploads/manchester_united/manchester_united_PNG9.png",
  "Brighton": "https://logodownload.org/wp-content/uploads/2019/10/brighton-hove-albion-logo.png",
  "Newcastle": "https://cdn.freebiesupply.com/logos/large/2x/newcastle-united-logo-png-transparent.png",
  "Southampton": "https://logodownload.org/wp-content/uploads/2019/10/southampton-fc-logo-0.png",
  "Wolves": "https://logodownload.org/wp-content/uploads/2019/04/wolverhampton-logo-escudo.png",
  "Bournemouth": "https://logodownload.org/wp-content/uploads/2019/10/bournemouth-fc-logo-0.png",
  "Liverpool": "https://img.icons8.com/color/1600/liverpool-fc.png",
  "Aston Villa": "https://logosmarcas.net/wp-content/uploads/2020/11/Aston-Villa-Logo.png",
  "Everton": "https://logodownload.org/wp-content/uploads/2019/04/everton-logo-escudo.png",
  "Brentford": "https://logodownload.org/wp-content/uploads/2022/09/brentford-fc-logo.png",
  "West Ham": "https://logodownload.org/wp-content/uploads/2019/05/west-ham-united-logo-0-300x300.png",
  "Crystal Palace": "https://logodownload.org/wp-content/uploads/2019/05/crystal-palace-logo.png",
  "Fulham": "https://logodownload.org/wp-content/uploads/2022/09/fulham-fc-logo-0.png",
  "Ipswich": "https://cdn.freebiesupply.com/logos/large/2x/ipswich-logo-png-transparent.png",
  "Spurs": "https://www.pngplay.com/wp-content/uploads/13/Tottenham-Hotspur-F.C-Transparent-PNG.png",
};
const ASCENDING_METRICS = ["XGC", "Opposition_XG"];

export default function TeamPredictionRankings() {
  const [teamData, setTeamData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("XG");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions_Future")
      .then((res) => res.json())
      .then((data) => {
        setTeamData(data);
        const GWs = data.map((d) => d.GW);
        const min = Math.min(...GWs);
        const max = Math.max(...GWs);
        setMinGW(min);
        setMaxGW(max);
        setGWRange([min, max]);
      })
      .catch((err) => console.error("Error fetching team predictions:", err));
  }, []);

  const filteredData = teamData.filter(
    (d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]
  );

  const aggregatedData = Object.values(
    filteredData.reduce((acc, curr) => {
      const team = curr.team_name;
      if (!acc[team]) acc[team] = { team_name: team, value: 0 };
      acc[team].value += parseFloat(curr[selectedMetric] || 0);
      return acc;
    }, {})
  ).sort((a, b) =>
    ASCENDING_METRICS.includes(selectedMetric)
      ? a.value - b.value
      : b.value - a.value
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-6">
      <h1 className="text-3xl font-bold text-center text-white">
        {METRIC_LABELS[selectedMetric]} GW {GWRange[0]} - {GWRange[1]}
      </h1>

      {/* Tile-Based Metric Selector */}
      <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mt-4">
        {Object.entries(METRIC_LABELS).map(([metricKey, label]) => (
          <button
            key={metricKey}
            className={`text-sm sm:text-base font-bold px-4 py-2 rounded transition-all duration-200
        ${
          selectedMetric === metricKey
            ? "bg-royal-beige text-royal-red underline underline-offset-4 hover:border-none"
            : "bg-royal-beige text-royal-red hover:bg-royal-gold hover:text-black hover:border-none"
        }
        focus:outline-none`}
  
            onClick={() => setSelectedMetric(metricKey)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* GW Slider */}
      {minGW !== null && maxGW !== null && (
        <Box sx={{ width: 300, color: "white" }}>
          <Typography gutterBottom>
            GW Range: From GW {GWRange[0]} to GW {GWRange[1]}
          </Typography>
          <Slider
            value={GWRange}
            min={minGW}
            max={maxGW}
            onChange={(event, newValue) => setGWRange(newValue)}
            valueLabelDisplay="auto"
            step={1}
            marks={[
              { value: minGW, label: `GW ${minGW}` },
              { value: maxGW, label: `GW ${maxGW}` },
            ]}
            sx={{
              color: "#5A0000",
              "& .MuiSlider-thumb": {
                backgroundColor: "#5A0000",
              },
            }}
          />
        </Box>
      )}

      {/* Bar Chart */}
      <div className="w-full max-w-6xl h-[600px] sm:h-[600px] md:h-[700px]">
      <ResponsiveContainer width="90%" height={aggregatedData.length * 30 || 300}>
        <BarChart
          data={aggregatedData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
        >
          <CartesianGrid stroke="#333" />
          <XAxis 
  type="number"
  tick={false}        // Hides numbers (tick labels)
  axisLine={false}    // Hides the axis line
  tickLine={false}    // Hides the small tick marks
  domain={["dataMin - 0.5", "dataMax + 0.5"]}
/>
          <YAxis
  dataKey="team_name"
  type="category"
  stroke="#fff"
  width={60}
  interval={0}
  tick={<CustomYAxisTick />}
/>

          <Tooltip
  formatter={(value, name) => [`${value.toFixed(2)}`, METRIC_LABELS[selectedMetric]]}
  labelFormatter={(label) => `Team: ${label}`}
/>
          <Bar
  dataKey="value"
  isAnimationActive={false}
  shape={({ x, y, width, height, index }) => {
    const color = getGradientColor(index, aggregatedData.length);
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={color} />
        <text
          x={x + width + 5}
          y={y + height / 2}
          alignmentBaseline="middle"
          fill="#fff"
          fontSize="10"
        >
          {aggregatedData[index].value.toFixed(2)}
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
