// src/context/DataContext.jsx
import React, { createContext, useContext, useRef, useState } from "react";


const MyTeamDataContext = createContext();

export const useMyteamData = () => useContext(MyTeamDataContext);

export function MyTeamDataContextProvider({ children }) {
  const [teamId, setTeamId] = useState('');
  const [bbRound, setBbRound] = useState('');
  const [wildRound, setWildRound] = useState('');
  const [bannedList, setBannedList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchTeam = async () => {
    if (!teamId) return alert('Team ID is required');
    setLoading(true);
    try {
      const params = new URLSearchParams({ team_id: teamId });
      if (bbRound)   params.append('bb_round', bbRound);
      if (wildRound) params.append('wildcard_round', wildRound);
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
  };

  const removeBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : prev
    );
  };

  return (
    <MyTeamDataContext.Provider
      value={{
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
        removeBan,
      }}
    >
      {children}
    </MyTeamDataContext.Provider>
  );
};