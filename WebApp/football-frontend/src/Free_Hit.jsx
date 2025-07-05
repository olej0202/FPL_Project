import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/pitch.png";
import Navbar from "./components/team_navigation";

export default function FreeHitTeam() {
  const [playingPlayers, setPlayingPlayers] = useState([]);
  const [benchPlayers, setBenchPlayers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/free-hit")
      .then((res) => res.json())
      .then((data) => {
        setPlayingPlayers(data.filter((p) => p.status === "Playing"));
        setBenchPlayers(data.filter((p) => p.status === "Bench"));
      })
      .catch((err) => console.error("Failed to fetch free hit players:", err));
  }, []);

  const getPlayersByPosition = (pos) =>
    playingPlayers.filter((p) => p.position === pos);

  return (
    <>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-5">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">
          AI Optimized Free-Hit Team
        </h1>

        <div
          className="w-full max-w-[600px] aspect-[3/3] bg-no-repeat bg-cover bg-center border border-white rounded-lg px-1 py-2"
          style={{ backgroundImage: `url(${pitch})` }}
        >
          <div className="flex flex-col justify-between h-full">
            <PlayerRow players={getPlayersByPosition("FWD")} navigate={navigate} />
            <PlayerRow players={getPlayersByPosition("MID")} navigate={navigate} />
            <PlayerRow players={getPlayersByPosition("DEF")} navigate={navigate} />
            <PlayerRow players={getPlayersByPosition("GK")} navigate={navigate} />
            {benchPlayers.length > 0 && (
              <div>
                <PlayerRow players={benchPlayers} isBench navigate={navigate}/>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function PlayerRow({ players, isBench = false, navigate }) {
  return (
    <div className="flex justify-center gap-1 sm:gap-1 md:gap-4 py-1 overflow-x-auto whitespace-nowrap">
      {players.map((player, idx) => (
        <div
          key={idx}
          onClick={() =>
            navigate("/Player_Analytics", {
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
            className={` ${
              isBench
                ? "w-14 h-18 sm:w-16 sm:h-20 md:w-20 md:h-24"
                : "w-14 h-18 sm:w-16 sm:h-20 md:w-20 md:h-24"
            }`}
          />
          <span className="mt-1 text-center font-medium text-xs sm:text-sm md:text-base leading-tight">

          </span>
          {isBench && (
            <span className="text-xs text-black-300">{player.position}</span>
          )}
        </div>
      ))}
    </div>
  );
}
