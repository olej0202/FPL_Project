// src/pages/OptimizeTeam.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X,ArrowRight } from "lucide-react";
import pitch from "./assets/pitch.png";
import {useMyteamData} from "./Contexts/MyTeamContext";


export default function MyTeamOptimize() {
    const {
    teamId,
    setTeamId,
    bbRound,
    setBbRound,
    wildRound,
    setWildRound,
    bannedList,
    data,
    loading,
    fetchTeam,
    toggleBan,
    removeBan,has_changed,sethas_changed,bannedPlayersData} = useMyteamData();
  const navigate = useNavigate();
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
 const minG=1

  useEffect(() => {
   sethas_changed(true);
 }, [teamId, bbRound, wildRound, bannedList, sethas_changed]);





  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-royal-gold border-t-transparent"></div>
      </div>
    );
  }

  // once we have data, compute first GW and split squad
  let minGW, starters = [], bench = [], transfers = [];
  if (data) {
    const gws = data.map((p) => Number(p.GW)).filter((n) => !isNaN(n));
    minGW = Math.min(...gws);
    const gwData = data.filter((p) => Number(p.GW) === minGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench    = gwData.filter((p) => p.status === "benched");
    // group all transfers by GW
    const moves = data.filter((p) =>
      ["transferred_in", "transferred_out"].includes(p.status)
    );
    transfers = Object.values(
      moves.reduce((acc, curr) => {
        if (!acc[curr.GW]) acc[curr.GW] = { GW: curr.GW, in: [], out: [] };
        acc[curr.GW][curr.status === "transferred_in" ? "in" : "out"].push(curr);
        return acc;
      }, {})
    ).sort((a, b) => a.GW - b.GW);
  }

  return (
     <div className="min-h-screen bg-black text-white flex flex-col items-center px-0 py-4 space-y-8">
      <h1 className="text-3xl font-bold">Optimize My Team</h1>

      {/* Form */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          placeholder="Team ID *"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-40 p-2 bg-black border border-royal-gold rounded text-white text-center"
        />

        {/* Bench Boost Toggle with fixed container */}
        {showBbInput ? (
  <>
    {minG === null ? (
      // data not loaded yet
      <div className="w-40 p-2 text-center text-gray-400">Loading GWs…</div>
    ) : (
      <div className="relative w-40">
        <select
          value={bbRound || ""}
          onChange={(e) => setBbRound(Number(e.target.value))}
          className="w-full p-2 bg-black border border-royal-gold rounded text-white text-center"
        >
          {/* placeholder option */}
          <option value="" disabled>
            Bench Boost GW
          </option>
          {/* only render once minGW is known */}
          {Array.from({ length: 38 - minG + 1 }, (_, i) => minG + i).map(
            (gw) => (
              <option key={gw} value={gw}>
                GW {gw}
              </option>
            )
          )}
        </select>
        <button
          onClick={() => {
            setShowBbInput(false);
            setBbRound("");
          }}
          className="absolute top-2 -right-8 p-1 text-red-500 bg-black"
        >
          <X size={14} />
        </button>
      </div>
    )}
  </>
) : (
  <button
    onClick={() =>      {setShowBbInput(true); setBbRound(minGW);       }}
    className="w-40 p-2 bg-transparent border border-dashed border-royal-gold rounded text-royal-gold hover:bg-yellow-300 hover:text-black transition"
  >
     + Add Bench Boost
  </button>
)}

        {/* Wildcard Toggle with fixed container */}
{showWildInput ? (
  <>
    {minG === null ? (
      // data not loaded yet
      <div className="w-40 p-2 text-center text-gray-400">Loading GWs…</div>
    ) : (
      <div className="relative w-40">
        <select
          value={wildRound || ""}
          onChange={(e) => setWildRound(Number(e.target.value))}
          className="w-full p-2 bg-black border border-royal-gold rounded text-white text-center"
        >
          <option value="" disabled>
            Wildcard GW
          </option>
          {Array.from({ length: 38 - minG + 1 }, (_, i) => minG + i).map(
            (gw) => (
              <option key={gw} value={gw}>
                GW {gw}
              </option>
            )
          )}
        </select>
        <button
          onClick={() => {
            setShowWildInput(false);
            setWildRound("");
          }}
          className="absolute top-2 -right-8 p-1 text-red-500 bg-black"
        >
          <X size={14} />
        </button>
      </div>
    )}
  </>
) : (
  <button
    onClick={() =>      {setShowWildInput(true); setWildRound(minGW);       }}
    className="w-40 p-2 bg-transparent border border-dashed border-royal-gold rounded text-royal-gold hover:bg-yellow-300 hover:text-black transition"
  >
    + Add Wildcard
  </button>
        )}
               <button
          onClick={() => {
            fetchTeam();
            // once we’ve optimized, reset the flag
            sethas_changed(false);
          }}
          disabled={!has_changed}
          className={`
            font-semibold px-6 py-2 rounded transition
            ${has_changed
              ? "bg-royal-gold text-black hover:bg-yellow-300 cursor-pointer"
              : "bg-gray-600 text-gray-300 cursor-not-allowed"
            }
          `}
        >
          Optimize Team
        </button>
      </div>

      {/* Banned pills */}
      {/* Banned pills (click the X to un‐ban) */}
{bannedPlayersData.length > 0 && (
   <div className="flex flex-col items-center">
    {/* Header */}
    <h2 className="text-lg font-semibold text-white mb-2">
      Unwanted players
    </h2>
  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
    
    {bannedPlayersData.map((player) => (
     
      <div
        key={player.Name}
        className="relative flex items-center bg-royal-red text-white px-1 py-1 rounded-full text-sm"
      >
        <img
          src={player.photo}
          alt={player.web_name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src =
              "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
          }}
          className="w-7 h-7 rounded-full mr-1 object-cover"
        />
        <span>{player.web_name}</span>
        <button
          onClick={() => removeBan(player.Name)}
          className="absolute top-0 right-0 -mt-1 -mr-1 bg-black bg-opacity-50 rounded-full p-0.5"
        >
          <X size={12} className="text-white" />
        </button>
      </div>
      
    ))}
  </div>
  </div>
)}



      {/* Squad Pitch */}
      {data && (
        <div
          className="w-full max-w-[400px] aspect-[1/2] bg-no-repeat bg-cover bg-center border border-white rounded-lg px-2 py-1 relative"
          style={{ backgroundImage: `url(${pitch})` }}
        >
          <div className="flex flex-col justify-between h-[500px] pt-0 space-y-0 width-full">
            <PlayerRow
              players={starters.filter((p) => p.position === "GKP")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "DEF")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "MID")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "FWD")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
          </div>
          {bench.length > 0 && (
            <div className="absolute bottom-3 left-0 right-0">
              <PlayerRow
                players={bench}
                isBench
                toggleBan={toggleBan}
                bannedList={bannedList}
                navigate={navigate}
              />
            </div>
          )}
        </div>
      )}

{/* Transfers under pitch */}
{transfers.length > 0 && (
  <div className="w-full max-w-2xl">
    <h2 className="text-2xl font-bold text-center mb-3">Transfers</h2>

    {transfers.map((grp) => {
      // 1) make a mutable copy of the incoming list
      const remainingIns = [...grp.in];

      // 2) for each out, find & remove the first in of the same position
      const pairs = grp.out.map((outP) => {
        const matchIdx = remainingIns.findIndex(
          (inP) => inP.position === outP.position
        );
        if (matchIdx !== -1) {
          const [matchedIn] = remainingIns.splice(matchIdx, 1);
          return { outP, inP: matchedIn };
        } else {
          // no in of same position
          return { outP, inP: null };
        }
      });

      // 3) any ins left over get rendered on their own
      remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

      return (
        <div key={grp.GW} className="mb-6">
          <h3 className="text-lg font-semibold text-center mb-4">
            GW {grp.GW}
          </h3>
          <div className="flex flex-wrap justify-center items-center gap-6">
            {pairs.map(({ outP, inP }, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {/* Out if present */}
                {outP && (
                  <TransferCard
                    player={outP}
                    label="Out"
                    toggleBan={toggleBan}
                    bannedList={bannedList}
                    navigate={navigate}
                  />
                )}

                {/* Show arrow only when both sides exist */}
                {outP && inP && (
                  <ArrowRight className="text-royal-gold" />
                )}

                {/* In if present */}
                {inP && (
                  <TransferCard
                    player={inP}
                    label="In"
                    toggleBan={toggleBan}
                    bannedList={bannedList}
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
)}
    </div>
  );
}

function PlayerRow({ players, isBench = false, toggleBan, bannedList, navigate }) {
  const fallback =
    "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
  return (
    <div className="flex justify-center gap-2 px-2 overflow-x-auto text-center w-full ">
      {players.map((p) => (
        <div key={p.Name} className="relative" >
          {p.Is_captain && (
              <div
                className="
                  absolute top-12 -left-2
                  bg-black text-white font-bold
                  text-xs rounded-full
                  w-5 h-5 flex items-center justify-center
                "
              >
                C
              </div>
            )}
          <img
            src={p.photo}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallback;
            }}
            className={`object-contain ${
                isBench
                  ? "w-[45] h-[60px] sm:w-[55px] sm:h-[75px]"
                  : "w-[60px] h-[80px] sm:w-[55px] sm:h-[75px]"
              }`}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: p.Name },
              })
            }
          />
          <button
            onClick={() => toggleBan(p.Name)}
            className="absolute top-0 -right-2 bg-black bg-opacity-50 p-1 rounded-full"
          >
            <X
              size={10}
              className={
                bannedList.includes(p.Name)
                  ? "text-red-500"
                  : "text-royal-gold"
              }
            />
          </button>
          <span className=
            {`mt-1 text-center font-small text-xs sm:text-sm leading-tight ${
              isBench ? "text-black" : "text-white"
            }`}>
              {p.web_name}
            </span>
        </div>
      ))}
    </div>
  );
}

function TransferCard({ player, label, toggleBan, bannedList, navigate  }) {
  const fallback =
    "https://cdn.nba.com/headshots/nba/latest/1040x760/1709.png";
  return (
    <div className="flex flex-col items-center text-white">
    <div className="relative">
      <img
        src={player.photo}
        alt={player.Name}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = fallback;
        
        }}
        className="w-12 h-16 rounded object-cover"
      onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: player.Name },
              })
            }
      />
      {label === "In" && (
           <button
        onClick={() => toggleBan(player.Name)}
        className="absolute -top-2 -right-5  bg-black bg-opacity-50 p-1 rounded-full border-white mt-2"
      >
        
        <X
          size={16}
          className={
            bannedList.includes(player.Name)
              ? "text-red-500"
              : "text-royal-gold"
          }
        />
      </button>
      )}
      
      

      
    </div>
    <span className="text-xs mt-1">{player.web_name}</span>
    <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}