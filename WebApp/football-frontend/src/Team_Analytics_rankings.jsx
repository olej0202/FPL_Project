import React, { useEffect, useMemo, useState } from "react";
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
  XG_avg:
    "Offensive rating over time based on Goals and XG, adjusted for difficulty of opposition.",
  XGC_avg:
    "Defensive rating over time based on Goals conceded and XGC, adjusted for difficulty of opposition.",
  Elo_Rating:
    "Absolute rating over time based on result, adjusted for difficulty of opposition.",
  "XGH-XGA":
    "Difference in attacking index at home and away. Positive values indicate better attack at home.",
  "XGCH-XGCA":
    "Difference in defensive index at home and away. Positive values indicate better defence at home.",
};

const ASCENDING_METRICS = ["XGC_avg"]; // lower is better for conceded

export default function TeamAnalyticsList() {
  const { fetchIfNeeded, loading, TeamData, setselected_team } = useStatsData();
  const [selectedMetric, setSelectedMetric] = useState("XG_avg");
  const [rankingData, setRankingData] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      await fetchIfNeeded();
    };
    loadData();
  }, [fetchIfNeeded]);

  useEffect(() => {
    if (!TeamData?.current || TeamData.current.length === 0) return;

    let data = TeamData.current
      .map((team) => {
        let value;
        if (selectedMetric === "XGH-XGA") {
          value = parseFloat(team.XGH || 0) - parseFloat(team.XGA || 0);
        } else if (selectedMetric === "XGCH-XGCA") {
          value = -1*(parseFloat(team.XGCH || 0) - parseFloat(team.XGCA || 0));
        } else {
          value = parseFloat(team[selectedMetric] || 0);
        }
        const name = team.name || team.Team || "";
        return { name, value: Number.isFinite(value) ? Number(value.toFixed(2)) : 0 };
      })
      .filter((d) => d.name && !Number.isNaN(d.value));

    const sortFn = ASCENDING_METRICS.includes(selectedMetric)
      ? (a, b) => a.value - b.value
      : (a, b) => b.value - a.value;

    setRankingData(data.sort(sortFn));
  }, [TeamData?.current, selectedMetric]);

  // Safe min/max for percentage bands
  const { minValue, maxValue } = useMemo(() => {
    if (!rankingData.length) return { minValue: 0, maxValue: 1 };
    const vals = rankingData.map((d) => d.value);
    return { minValue: Math.min(...vals), maxValue: Math.max(...vals) };
  }, [rankingData]);

  const SkeletonRow = () => (
    <li className="relative py-3 px-4">
      <div className="h-6 w-1/2 bg-neutral-800 rounded mb-2 animate-pulse" />
      <div className="h-4 w-1/3 bg-neutral-800 rounded animate-pulse" />
    </li>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team Rankings</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            {METRIC_DESCRIPTIONS[selectedMetric]}
          </p>
        </header>

        {/* Controls */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="max-w-xs mx-auto">
            <label htmlFor="metric" className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Metric
            </label>
            <select
              id="metric"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-black/60 px-3 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-royal-gold/60 text-center"
              aria-label="Select ranking metric"
            >
              {Object.entries(METRICS).map(([key, label]) => (
                <option key={key} value={key} className="bg-black text-neutral-100">
                  {label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Rankings */}
        <section>
          {loading ? (
            <ul className="w-full max-w-3xl mx-auto divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </ul>
          ) : (
            <ul className="w-full max-w-3xl mx-auto divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {rankingData.map((team, idx) => {
                const denom = maxValue - minValue;
                const pct = denom <= 0 ? 100 : ((team.value - minValue) / denom) * 100;
                return (
                  <li
                    key={team.name}
                    className="relative py-3 px-4 cursor-pointer group"
                    onClick={() => {
                      if (typeof setselected_team === "function") setselected_team(team.name);
                      navigate("/Team_Analytics/Team_Individual", { state: { selectedTeam: team.name } });
                    }}
                    title={`View ${team.name}`}
                  >
                    {/* background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-royal-gold/25 rounded-r transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-royal-gold font-bold w-6 text-right tabular-nums">{idx + 1}.</span>
                        <span className="truncate">{team.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-royal-gold">{team.value.toFixed(2)}</span>
                    </div>
                  </li>
                );
              })}
              {rankingData.length === 0 && (
                <li className="py-6 text-center text-neutral-400">No teams available.</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
