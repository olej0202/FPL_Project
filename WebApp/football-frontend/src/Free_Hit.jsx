import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/pitch.png";
import Navbar from "./components/team_navigation"; // Optional: your custom navbar

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
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-6">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">
        AI Optimized Free-Hit Team
      </h1>

      {/* Pitch Container with absolute positioning */}
      <div
        className="relative w-full max-w-[600px] aspect-[4/5] bg-no-repeat bg-cover bg-center border border-white rounded-lg"
        style={{ backgroundImage: `url(${pitch})` }}
      >
        {/* Fixed-position player rows */}
        <PlayerRow top="10%" players={getPlayersByPosition("FWD")} navigate={navigate} />
        <PlayerRow top="28%" players={getPlayersByPosition("MID")} navigate={navigate} />
        <PlayerRow top="46%" players={getPlayersByPosition("DEF")} navigate={navigate} />
        <PlayerRow top="64%" players={getPlayersByPosition("GK")} navigate={navigate} />
        <PlayerRow top="82%" players={benchPlayers} isBench navigate={navigate} />
      </div>
    </div>
  );
}

function PlayerRow({ players, top, isBench = false, navigate }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex justify-center gap-1 sm:gap-3"
      style={{ top }}
    >
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
            className={`${
              isBench
                ? "w-14 h-18 sm:w-16 sm:h-20 md:w-20 md:h-24"
                : "w-14 h-18 sm:w-16 sm:h-20 md:w-20 md:h-24"
            }`}
          />
          <span className="mt-0 text-center font-small text-xs sm:text-sm md:text-base leading-tight">
            {player.Name}
          </span>
          {isBench && (
            <span className="text-xs text-black-300">{player.position}</span>
          )}
        </div>
      ))}
    </div>
  );
}
