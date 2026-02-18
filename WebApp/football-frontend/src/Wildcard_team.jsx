import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/Pitch2.png";
import { useAITeamData } from "./Contexts/AITeamsContext";
import { ArrowRight } from "lucide-react";


export default function WildcardTeam() {
  const { fetchIfNeeded, wildcardData, loading } = useAITeamData();
  const [minGW, setMinGW] = useState(null);
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [benchPlayers, setBenchPlayers] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const navigate = useNavigate();
  const fallbackUrl = "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";


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
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-4 px-1 space-y-3">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">
        AI Optimized Wildcard Team GW {minGW}
      </h1>
      <span className="mt-0 text-center font-small text-xs sm:text-sm leading-tight">
              Click on players to get stats
            </span>

      {/* Team Pitch */}
      <div
                className="w-full max-w-[500px] aspect-[3/5] bg-no-repeat bg-cover bg-center border border-white rounded-lg px-2 py-1 relative"
                style={{ backgroundImage: `url(${pitch})` }}
              >
                <div className="flex flex-col justify-between h-[700px] pt-1 space-y-1">
                  <PlayerRow players={getPlayersByPosition("GKP")} navigate={navigate} fallbackUrl={fallbackUrl} />
                  <PlayerRow players={getPlayersByPosition("DEF")} navigate={navigate} fallbackUrl={fallbackUrl} />
                  <PlayerRow players={getPlayersByPosition("MID")} navigate={navigate} fallbackUrl={fallbackUrl} />
                  <PlayerRow players={getPlayersByPosition("FWD")} navigate={navigate} fallbackUrl={fallbackUrl} />
                  <div className="h-[115px]"/>
      
      
                </div>
      
                {benchPlayers.length > 0 && (
                  <div className="absolute bottom-[-6px] left-0 right-0 px-2">
                    <PlayerRow players={benchPlayers} isBench navigate={navigate} fallbackUrl={fallbackUrl} />
                  </div>
                )}
              </div>

              

      {/* Transfer History */}
{/* Transfer History */}
<div className="w-full max-w-2xl mt-10">
  <h2 className="text-2xl font-bold text-center mb-4">Transfers</h2>

  {transfers
    .sort((a, b) => a.GW - b.GW)
    .map((t) => {
      // 1) clone the in-list so we can remove matches
      const remainingIns = [...t.in];

      // 2) pair outs with same-position ins
      const pairs = t.out.map((outPlayer) => {
        const matchIdx = remainingIns.findIndex(
          (inPlayer) => inPlayer.position === outPlayer.position
        );
        if (matchIdx !== -1) {
          // remove and return matched tuple
          const [matchedIn] = remainingIns.splice(matchIdx, 1);
          return { outPlayer, inPlayer: matchedIn };
        } else {
          // no matching in; still render the out alone
          return { outPlayer, inPlayer: null };
        }
      });

      // 3) render any leftover ins with no matching out
      remainingIns.forEach((inPlayer) => {
        pairs.push({ outPlayer: null, inPlayer });
      });

      return (
        <div key={t.GW} className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-center">
            GW {t.GW}
          </h3>
          <div className="flex flex-wrap justify-center gap-10 items-center">
            {pairs.map(({ outPlayer, inPlayer }, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* Out card if present */}
                {outPlayer && (
                  <TransferCard
                    player={outPlayer}
                    label="Out"
                    navigate={navigate}
                  />
                )}

                {/* Arrow only when both exist */}
                {outPlayer && inPlayer && (
                  <ArrowRight className="text-royal-gold" />
                )}

                {/* In card if present */}
                {inPlayer && (
                  <TransferCard
                    player={inPlayer}
                    label="In"
                    navigate={navigate}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    })}
</div>
    </div>
  );
}

function PlayerRow({ players, isBench = false, navigate,fallbackUrl }) {
  return (
    <div className="flex justify-center gap-3 py-2 overflow-x-auto">
      {players.map((player, idx) => {
        const name = player.web_name
        return (
          <div
            key={idx}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: player.Name },
              })
            }
            className={`relative flex flex-col items-center cursor-pointer hover:scale-105 transition-transform ${
              isBench ? "text-black opacity-90" : "text-white"
            }`}
          >
            
            {player.Is_captain && (
              <div
                className="
                  absolute top-2 -left-2
                  bg-black text-white font-bold
                  text-xs rounded-full
                  w-5 h-5 flex items-center justify-center
                "
              >
                C
              </div>
            )}
            <img
              src={player.photo}
              alt={player.Name}
              onError={(e) => {
            e.currentTarget.onerror = null;       // prevent loop
            e.currentTarget.src = fallbackUrl;    // use fallback
          }}
              className={`object-contain ${
                isBench
                  ? "w-[60px] h-[80px] sm:w-[70px] sm:h-[90px]"
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

function TransferCard({ player, label, navigate,fallbackUrl }) {
  const name = player.web_name
  return (
    <div className="flex flex-col items-center" onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: player.Name },
              })
            }>

              
      <img
        src={player.photo}
        alt={name}
        onError={(e) => {
            e.currentTarget.onerror = null;       // prevent loop
            e.currentTarget.src = fallbackUrl;    // use fallback
          }}
        className="w-[50px] h-[70px] sm:w-[60px] sm:h-[80px] object-contain border-2 border-none rounded"
      />
      <span className="text-xs mt-1">{name}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}
