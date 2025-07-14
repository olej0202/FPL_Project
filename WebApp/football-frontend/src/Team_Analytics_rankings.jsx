import React, { useEffect, useState } from "react";
import { useStatsData } from "./Contexts/StatsContext";
import { useNavigate } from "react-router-dom";

const METRICS = {
  XG_avg: "Offensive Index",
  XGC_avg: "Defensive Index",
  Elo_Rating: "ELO Rating",
  "XGH-XGA": "Home Attacking Effect",
  "XGCH-XGCA": "Home Defensive Effect",
};

const METRIC_DESCRIPTIONS = {
  XG_avg: "Offensive rating over time based on Goals and XG, adjusted for difficulty of opposition",
  XGC_avg: "Defensive rating over time based on Goals conceded and XGC, adjusted for difficulty of opposition",
  Elo_Rating: "Absolute rating over time based on result, adjusted for difficulty of opposition",
  "XGH-XGA": "Difference in Attacking index at home and away. Positive values indicate better attack at home",
  "XGCH-XGCA": "Difference in Defensive index at home and away. Positive values indicate better defence at home",
};

const ASCENDING_METRICS = ["XGC_avg"];

export default function TeamAnalyticsList() {
  const { fetchIfNeeded, loading, TeamData } = useStatsData();
  const [selectedMetric, setSelectedMetric] = useState("XG_avg");
  const [rankingData, setRankingData] = useState([]);
  const navigate = useNavigate();
  const minValue = Math.min(...rankingData.map((d) => d.value));
  const maxValue = Math.max(...rankingData.map((d) => d.value));

  useEffect(() => {
    const loadData = async () => {
      await fetchIfNeeded();
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!TeamData?.current || TeamData.current.length === 0) return;

    let data = TeamData.current.map((team) => {
      let value;
      if (selectedMetric === "XGH-XGA") {
        value = parseFloat(team.XGH || 0) - parseFloat(team.XGA || 0);
      } else if (selectedMetric === "XGCH-XGCA") {
        value = parseFloat(team.XGCA || 0) - parseFloat(team.XGCH || 0);
      } else {
        value = parseFloat(team[selectedMetric] || 0);
      }

      return {
        name: team.name,
        value: Number(value.toFixed(2)),
      };
    }).filter((d) => !isNaN(d.value));

    const sortFn = ASCENDING_METRICS.includes(selectedMetric)
      ? (a, b) => a.value - b.value
      : (a, b) => b.value - a.value;

    setRankingData(data.sort(sortFn));
  }, [TeamData?.current, selectedMetric]);

  if (loading) return <div className="text-white">Loading team stats...</div>;

  return (
    <div className="min-h-screen bg-black text-white py-10 px-4 space-y-6 flex flex-col items-center">
      <h2 className="text-2xl font-bold text-center">{METRICS[selectedMetric]}</h2>
      <p className="text-sm text-center text-gray-400 max-w-xl">{METRIC_DESCRIPTIONS[selectedMetric]}</p>

      {/* Metric Selector */}
      <div className="w-full max-w-xs mx-auto mt-4">
  <select
    value={selectedMetric}
    onChange={(e) => setSelectedMetric(e.target.value)}
    className="w-full px-4 py-3 rounded bg-royal-beige text-black font-semibold focus:outline-none text-center"
  >
    {Object.entries(METRICS).map(([key, label]) => (
      <option key={key} value={key}>
        {label}
      </option>
    ))}
  </select>
</div>

      {/* Ranking List */}
      

<ul className="w-full max-w-2xl divide-y divide-gray-700">
  {rankingData.map((team, idx) => {
    const percentage = ((team.value - minValue) / (maxValue - minValue)) * 100;

    return (
      <li
        key={team.name}
        className="relative py-3 px-4 cursor-pointer hover:bg-royal-red transition"
        onClick={() =>
          navigate("/Team_Analytics/Team_Individual", {
            state: { selectedTeam: team.name },
          })
        }
      >
        {/* Background bar */}
        <div
          className="absolute top-0 left-0 h-full bg-royal-gold opacity-30 rounded-r"
          style={{ width: `${percentage}%` }}
        ></div>

        {/* Content */}
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-royal-gold font-bold w-6 text-right">{idx + 1}.</span>
            <span className="text-white">{team.name}</span>
          </div>
          <span className="text-royal-gold font-semibold">{team.value.toFixed(2)}</span>
        </div>
      </li>
    );
  })}
</ul>


    </div>
  );
}
