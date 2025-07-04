import React, { useEffect, useState } from "react";

export default function Team_Predictions() {
  const [predictions, setPredictions] = useState([]);
  const [selectedGW, setSelectedGW] = useState(null);
  const [filteredData, setFilteredData] = useState([]);
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
  "Aston Villa": "https://brandlogo.org/wp-content/uploads/2024/09/Aston-Villa-Logo.png",
  "Everton": "https://logodownload.org/wp-content/uploads/2019/04/everton-logo-escudo.png",
  "Brentford": "https://logodownload.org/wp-content/uploads/2022/09/brentford-fc-logo.png",
  "West Ham": "https://logodownload.org/wp-content/uploads/2019/05/west-ham-united-logo-0-300x300.png",
  "Crystal Palace": "https://logodownload.org/wp-content/uploads/2019/05/crystal-palace-logo.png",
  "Fulham": "https://logodownload.org/wp-content/uploads/2022/09/fulham-fc-logo-0.png",
  "Ipswich": "https://cdn.freebiesupply.com/logos/large/2x/ipswich-logo-png-transparent.png",
  "Spurs": "https://www.pngplay.com/wp-content/uploads/13/Tottenham-Hotspur-F.C-Transparent-PNG.png",
};

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions")
      .then((res) => res.json())
      .then((data) => {
        setPredictions(data);
        const latestGW = Math.max(...data.map((d) => d.GW));
        setSelectedGW(latestGW);
      })
      .catch((err) => console.error("Failed to fetch predictions:", err));
  }, []);

  useEffect(() => {
    if (selectedGW !== null) {
      const filtered = predictions.filter((p) => p.GW === selectedGW);
      setFilteredData(filtered);
    }
  }, [selectedGW, predictions]);

  const uniqueGWs = [...new Set(predictions.map((p) => p.GW))].sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-bold text-center text-royal-gold mb-6">
        Team Score Predictions
      </h1>

      <div className="mb-6 text-center">
        <label className="text-lg mr-2">Select Gameweek:</label>
        <select
          value={selectedGW || ""}
          onChange={(e) => setSelectedGW(Number(e.target.value))}
          className="bg-black border border-royal-gold text-royal-gold p-2 rounded"
        >
          {uniqueGWs.map((gw) => (
            <option key={gw} value={gw}>
              GW {gw}
            </option>
          ))}
        </select>
      </div>

     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
  {filteredData.map((match, idx) => (
    <div
      key={idx}
      className="bg-royal-red border border-royal-gold p-4 rounded shadow text-royal-gold" 
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
