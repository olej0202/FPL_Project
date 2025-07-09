import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/pitch.png";
import { useAITeamData } from "./Contexts/AITeamsContext";
import { ArrowRight } from "lucide-react";

export default function WildcardTeam() {
  const { fetchIfNeeded, wildcardData, loading } = useAITeamData();
  const [minGW, setMinGW] = useState(null);
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [benchPlayers, setBenchPlayers] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchIfNeeded().then(() => {
      const data = wildcardData.current || [];

      const gwList = data.map(p => Number(p.GW)).filter(gw => !isNaN(gw));
      const minGW = Math.min(...gwList);
      setMinGW(minGW);

      // Filter team players for minGW
      const team = data.filter(p => p.GW === minGW);
      setTeamPlayers(team.filter(p => p.status === "playing"));
      setBenchPlayers(team.filter(p => p.status === "benched"));

      // Group transfers by GW
      const transfers = data.filter(p => ["transferred_in", "transferred_out"].includes(p.status));
      const groupedTransfers = Object.values(
        transfers.reduce((acc, curr) => {
          const gw = curr.GW;
          const name = curr.Name;
          if (!acc[gw]) acc[gw] = { GW: gw, in: [], out: [] };
          acc[gw][curr.status === "transferred_in" ? "in" : "out"].push(curr);
          return acc;
        }, {})
      );
      setTransfers(groupedTransfers);
    });
  }, []);

  if (loading) return <div className="text-white">Loading...</div>;

  const getPlayersByPosition = (pos) => teamPlayers.filter(p => p.position === pos);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-10">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">
        AI Optimized Wildcard Team GW {minGW}
      </h1>

      {/* Team Pitch */}
      <div
        className="w-full max-w-[500px] aspect-[3/4] bg-no-repeat bg-cover bg-center border-2 border-white rounded-lg px-2 py-3 relative"
        style={{ backgroundImage: `url(${pitch})` }}
      >
        <div className="flex flex-col justify-between h-full pt-1 pb-24 space-y-1">
          <PlayerRow players={getPlayersByPosition("GKP")} navigate={navigate} />
          <PlayerRow players={getPlayersByPosition("DEF")} navigate={navigate} />
          <PlayerRow players={getPlayersByPosition("MID")} navigate={navigate} />
          <PlayerRow players={getPlayersByPosition("FWD")} navigate={navigate} />
        </div>

        {benchPlayers.length > 0 && (
          <div className="absolute bottom-[-10px] left-0 right-0 px-2">
            <PlayerRow players={benchPlayers} isBench navigate={navigate} />
          </div>
        )}
      </div>

      {/* Transfer History */}
      <div className="w-full max-w-2xl mt-10">
        <h2 className="text-2xl font-bold text-center mb-4">Transfers</h2>
        {transfers.sort((a, b) => a.GW - b.GW).map((t, idx) => (
          <div key={idx} className="mb-6">
            <h3 className="text-lg font-semibold mb-2 text-center">GW {t.GW}</h3>
            <div className="flex flex-wrap justify-center gap-10 items-center">
              {t.out.map((outPlayer, i) => {
                const inPlayer = t.in[i];
                return (
                  <div key={i} className="flex items-center gap-2">
                    <TransferCard player={outPlayer} label="Out" />
                    <ArrowRight className="text-royal-gold" />
                    {inPlayer ? <TransferCard player={inPlayer} label="In" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ players, isBench = false, navigate }) {
  return (
    <div className="flex justify-center gap-3 py-2 overflow-x-auto">
      {players.map((player, idx) => {
        const name = player.Name.match(/_([^ ]+)/)?.[1] || player.Name;
        return (
          <div
            key={idx}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: player.Name },
              })
            }
            className={`flex flex-col items-center cursor-pointer hover:scale-105 transition-transform ${
              isBench ? "text-black opacity-90" : "text-white"
            }`}
          >
            <img
              src={player.photo}
              alt={player.Name}
              className={`object-contain ${
                isBench
                  ? "w-[45px] h-[65px] sm:w-[55px] sm:h-[75px]"
                  : "w-[60px] h-[80px] sm:w-[70px] sm:h-[90px]"
              }`}
            />
            <span className="mt-1 text-center font-small text-xs sm:text-sm leading-tight">
              {name}
            </span>
            {isBench && (
              <span className="text-xs text-black/60">{player.position}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransferCard({ player, label }) {
  const name = player.Name.match(/_([^ ]+)/)?.[1] || player.Name;
  return (
    <div className="flex flex-col items-center">
      <img
        src={player.photo}
        alt={player.Name}
        className="w-[50px] h-[70px] sm:w-[60px] sm:h-[80px] object-contain border-2 border-none rounded"
      />
      <span className="text-xs mt-1">{name}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}
