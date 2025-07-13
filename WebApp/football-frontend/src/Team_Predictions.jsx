import React, { useEffect, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos"; // adjust path as needed
export default function Team_Predictions() {

const [predictions, setPredictions] = useState([]);
const [selectedGW, setSelectedGW] = useState(null);
const [filteredData, setFilteredData] = useState([]);

const { fetchIfNeeded, ScorePredData } = useOtherData();

useEffect(() => {
  const loadData = async () => {
    await fetchIfNeeded(); // ensures data is fetched once
    const data = ScorePredData.current;

    if (!data || !Array.isArray(data)) return;

    setPredictions(data);
    const latestGW = Math.max(...data.map((d) => d.GW));
    setSelectedGW(latestGW);
  };

  loadData();
}, [fetchIfNeeded, ScorePredData]);

  useEffect(() => {
    if (selectedGW !== null) {
      const filtered = predictions.filter((p) => p.GW === selectedGW);
      setFilteredData(filtered);
    }
  }, [selectedGW, predictions]);

  const uniqueGWs = [...new Set(predictions.map((p) => p.GW))].sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-bold text-center text-white mb-6">
        Score Predictions
      </h1>
      <h1 className="text-4xl font-bold text-center text-white mb-6">
        GW {selectedGW}
      </h1>

      <div className="mb-6 text-center">
        <label className="text-lg mr-2">Select Gameweek:</label>
        <select
          value={selectedGW || ""}
          onChange={(e) => setSelectedGW(Number(e.target.value))}
          className="bg-royal-beige border-royal-gold  text-royal-red p-2 rounded"
        >
          {uniqueGWs.map((gw) => (
            <option key={gw} value={gw}>
              GW {gw}
            </option>
          ))}
        </select>
      </div>

     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {filteredData.map((match, idx) => (
    <div
      key={idx}
      className="bg-royal-red border border-royal-beige border-3 p-6 rounded shadow text-royal-beige" 
    >
      <h2 className="text-lg font-bold text-center mb-4">GW {match.GW}</h2>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">

          <span className="text-lg font-semibold">{"Team"}</span>
        </div>
        <span className="text-lg font-semibold">{"Score"}</span>
        <span className="text-lg font-semibold">{"CS odds"}</span>
      </div>

      {/* Home Team Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <img
            src={teamLogos[match.home_team]}
            alt={`${match.home_team} logo`}
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-xl font-bold">{match.home_goals.toFixed(1)}</span>
        <span className="text-xl font-bold">{(match.Clean_Sheet_home*100).toFixed(1)}{"%"}</span> 
      </div>

      {/* Away Team Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img
            src={teamLogos[match.away_team]}
            alt={`${match.away_team} logo`}
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-xl font-bold">{match.away_goals.toFixed(1)}</span>
        <span className="text-xl font-bold">{(match.Clean_Sheet_away*100).toFixed(1)}{"%"}</span>
      </div>
    </div>
  ))}
</div>

    </div>
  );
}
