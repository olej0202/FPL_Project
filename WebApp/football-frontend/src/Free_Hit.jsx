import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import pitch from "./assets/pitch.png"; // Make sure this is a clean pitch image

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
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-10 px-4 space-y-10">
      <h1 className="text-4xl font-bold mb-4">AI Optimized Free-Hit Team</h1>

      {/* Pitch */}
      <div
        className="relative w-full max-w-2xl h-[850px] bg-no-repeat bg-cover bg-center border-2 border-white rounded-lg"
        style={{ backgroundImage: `url(${pitch})` }}
      >
        {/* Forwards */}
        <PlayerRow players={getPlayersByPosition("FWD")} top="10%" navigate={navigate}/>

        {/* Midfielders */}
        <PlayerRow players={getPlayersByPosition("MID")} top="30%" navigate={navigate}/>

        {/* Defenders */}
        <PlayerRow players={getPlayersByPosition("DEF")} top="50%" navigate={navigate} />

        {/* Goalkeeper */}
        <PlayerRow players={getPlayersByPosition("GK")} top="70%" navigate={navigate}/>

        {/* Bench (on-pitch row below GK) */}
        {benchPlayers.length > 0 && (
          <PlayerRow players={benchPlayers} top="85%" isBench />
        )}
      </div>
    </div>
  );
}

function PlayerRow({ players, top, isBench = false, navigate }) {
  return (
    <div
      className="absolute left-1/2 transform -translate-x-1/2 flex gap-6"
      style={{ top }}
    >
      {players.map((player, idx) => (
        <div
          key={idx}
          onClick={() => navigate("/Player_Analytics", { state: { selectedPlayer: player.Name } })}
          className={`flex flex-col items-center ${
            isBench ? "text-black" : "text-white"
          }  cursor-pointer hover:scale-105 transition-transform ${
            isBench ? "w-[80px] opacity-80" : "w-[100px]"
          }`}
          
        >
          <img
            src={player.photo}
            alt={player.Name}
            className={`rounded-md border-1 ${
              isBench ? "w-18 h-20 border-gray-400" : "w-20 h-24 border-white"
            } shadow-lg`}
          />
          <span className="mt-2 text-center font-semibold text-sm">
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
