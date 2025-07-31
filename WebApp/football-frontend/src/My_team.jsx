// src/pages/OptimizeTeam.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import pitch from "./assets/pitch.png";

export default function OptimizeTeam() {
  const [teamId, setTeamId] = useState("");
  const [bbRound, setBbRound] = useState("");
  const [wildcardRound, setWildcardRound] = useState("");
  const [bannedList, setBannedList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchOptimized = async () => {
    if (!teamId) return alert("Team ID is required");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("team_id", teamId);
      if (bbRound)       params.append("bb_round", bbRound);
      if (wildcardRound) params.append("wildcard_round", wildcardRound);
      bannedList.forEach((id) => params.append("banned_list", id));

      const resp = await fetch(`/My_Team_Optimize?${params.toString()}`);
      if (!resp.ok) throw new Error(await resp.text());
      setData(await resp.json());
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = (playerId) => {
    setBannedList((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const starters = data?.filter((p) => p.status === "playing") || [];
  const bench    = data?.filter((p) => p.status === "benched")  || [];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-8">
      <h1 className="text-3xl font-bold">Optimize Your Team</h1>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="number"
          placeholder="Team ID *"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="p-2 rounded border border-royal-gold bg-black text-white w-40"
        />
        <input
          type="number"
          placeholder="Bench Boost GW"
          value={bbRound}
          onChange={(e) => setBbRound(e.target.value)}
          className="p-2 rounded border border-royal-gold bg-black text-white w-40"
        />
        <input
          type="number"
          placeholder="Wildcard GW"
          value={wildcardRound}
          onChange={(e) => setWildcardRound(e.target.value)}
          className="p-2 rounded border border-royal-gold bg-black text-white w-40"
        />
        <button
          onClick={fetchOptimized}
          disabled={loading}
          className="relative bg-royal-gold text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-300 transition flex items-center justify-center"
        >
          {loading && (
            <div className="absolute left-3 w-5 h-5 border-2 border-t-transparent border-black rounded-full animate-spin"></div>
          )}
          <span className={loading ? "opacity-50" : ""}>
            {loading ? "Generating..." : "Generate"}
          </span>
        </button>
      </div>

      {/* Banned list */}
      {bannedList.length > 0 && (
        <div className="text-sm text-royal-beige">
          Banned IDs: {bannedList.join(", ")}
        </div>
      )}

      {/* Pitch */}
      {data && (
        <div
          className="w-full max-w-md aspect-[3/5] bg-no-repeat bg-cover bg-center rounded-lg relative"
          style={{ backgroundImage: `url(${pitch})` }}
        >
          <div className="flex flex-col justify-between h-full p-2">
            <PlayerRow players={starters.filter(p => p.position === "GKP")}    />
            <PlayerRow players={starters.filter(p => p.position === "DEF")}    />
            <PlayerRow players={starters.filter(p => p.position === "MID")}    />
            <PlayerRow players={starters.filter(p => p.position === "FWD")}    />
          </div>
          {bench.length > 0 && (
            <div className="absolute bottom-2 left-0 right-0">
              <PlayerRow players={bench} isBench />
            </div>
          )}
        </div>
      )}
    </div>
  );

  function PlayerRow({ players, isBench = false }) {
    return (
      <div className="flex justify-center gap-2 overflow-x-auto">
        {players.map((p) => (
          <div key={p.id} className="relative inline-block">
            <img
              src={p.photo}
              alt={p.Name}
              className={`object-cover rounded ${isBench ? "w-12 h-20" : "w-16 h-24"}`}
            />
            <button
              onClick={() => toggleBan(p.id)}
              className="absolute top-0 right-0 bg-black bg-opacity-50 rounded-full p-1"
            >
              <X
                size={16}
                className={bannedList.includes(p.id) ? "text-red-500" : "text-royal-gold"}
              />
            </button>
          </div>
        ))}
      </div>
    );
  }
}