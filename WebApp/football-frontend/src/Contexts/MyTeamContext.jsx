// src/context/DataContext.jsx
import React, { createContext, useContext, useRef, useState } from "react";


const MyTeamDataContext = createContext();

export const useMyteamData = () => useContext(MyTeamDataContext);

export function MyTeamDataContextProvider({ children }) {
  const [teamId, setTeamId] = useState('');
  const [bbRound, setBbRound] = useState('');
  const [wildRound, setWildRound] = useState('');
  const [freehitROund, setfreehitROund] = useState('');
  const [bannedList, setBannedList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [has_changed, sethas_changed] = useState(false);
  const [bannedPlayersData, setBannedPlayersData] = useState([]);

  const fetchTeam = async () => {
    if (!teamId) return alert('Team ID is required');
    setLoading(true);
    try {
      const params = new URLSearchParams({ team_id: teamId });
      if (bbRound)   params.append('bb_round', bbRound);
      if (wildRound) params.append('wildcard_round', wildRound);
      if (freehitROund) params.append('freehit_round', freehitROund);
      bannedList.forEach((id) => params.append('banned_list', id));

      const resp = await fetch(
        `https://fpl-project-t5e9.onrender.com/My_Team_Optimize?${params}`
      );
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setData(json);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) =>
      prev.includes(sid) ? prev : [...prev, sid]
    );
    const player = data?.find((p) => p.Name.toString() === sid);
    if (player) {
      const slim = {
        Name:      player.Name,
        web_name:  player.web_name,
        photo:     player.photo,
      };
      setBannedPlayersData((prev) =>
        prev.find((p) => p.Name.toString() === sid)
          ? prev
          : [...prev, slim]
      );
    }
  };

  const removeBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : prev
    );
       setBannedPlayersData((prev) =>
     prev.filter((p) => p.Name.toString() !== sid)
   );

  };

  return (
    <MyTeamDataContext.Provider
      value={{
        teamId,
        bannedPlayersData,
        setTeamId,
        bbRound,
        setBbRound,
        wildRound,
        setWildRound,
        freehitROund, 
        setfreehitROund,
        bannedList,
        data,
        loading,
        fetchTeam,
        toggleBan,
        removeBan,
        has_changed,
        sethas_changed
      }}
    >
      {children}
    </MyTeamDataContext.Provider>
  );
};