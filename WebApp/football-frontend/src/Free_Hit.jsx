import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/pitch.png";
import Navbar from "./components/team_navigation"; // Optional team nav
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAITeamData } from "./Contexts/AITeamsContext";

export default function FreeHitTeam() {
  const { fetchIfNeeded, freeHitData, loading } = useAITeamData();
  const [playingPlayers, setPlayingPlayers] = useState([]);
  const [benchPlayers, setBenchPlayers] = useState([]);
  const [minGW, setMinGW] = useState(null);
  const fallbackUrl = "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

  const navigate = useNavigate();

   useEffect(() => {
    fetchIfNeeded().then(() => {
      const data = freeHitData.current || [];
      setPlayingPlayers(data.filter(p => p.status === "Playing"));
      setBenchPlayers(data.filter(p => p.status === "Bench"));
      const gwList = data.map(p => Number(p.GW)).filter(gw => !isNaN(gw));
      setMinGW(Math.min(...gwList));
    });
  }, []);
   if (loading) return <div className="text-white">Loading...</div>;

  const getPlayersByPosition = (pos) =>
    playingPlayers.filter((p) => p.position === pos);

  return (
    <>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-0 space-y-10">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">

            
          AI Optimized Free-Hit Team GW {minGW }
        </h1>

        <div
          className="w-full max-w-[500px] aspect-[3/5] bg-no-repeat bg-cover bg-center border border-white rounded-lg px-2 py-3 relative"
          style={{ backgroundImage: `url(${pitch})` }}
        >
          <div className="flex flex-col justify-between h-[700px] pt-1 space-y-1">
            <PlayerRow players={getPlayersByPosition("GKP")} navigate={navigate} fallbackUrl={fallbackUrl}/>
            <PlayerRow players={getPlayersByPosition("DEF")} navigate={navigate} fallbackUrl={fallbackUrl}/>
            <PlayerRow players={getPlayersByPosition("MID")} navigate={navigate} fallbackUrl={fallbackUrl}/>
            <PlayerRow players={getPlayersByPosition("FWD")} navigate={navigate} fallbackUrl={fallbackUrl} />
            <div className="h-[115px]"/>


          </div>

          {benchPlayers.length > 0 && (
            <div className="absolute bottom-[-6px] left-0 right-0 px-2">
              <PlayerRow players={benchPlayers} isBench navigate={navigate} fallbackUrl={fallbackUrl}/>
            </div>
          )}
        </div>
      </div>
    </>
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
            className={`flex flex-col items-center cursor-pointer hover:scale-105 transition-transform ${
              isBench ? "text-black opacity-90" : "text-white"
            }`}
          >
            <img
                src={player.photo}
                alt={player.Name}
                onError={(e) => {
            e.currentTarget.onerror = null;       // prevent loop
            e.currentTarget.src = fallbackUrl;    // use fallback
          }}
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
