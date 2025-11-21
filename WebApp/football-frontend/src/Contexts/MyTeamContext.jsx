// src/context/DataContext.jsx
import React, { createContext, useContext, useState } from "react";

const MyTeamDataContext = createContext();

export const useMyteamData = () => useContext(MyTeamDataContext);

export function MyTeamDataContextProvider({ children }) {
  const [teamId, setTeamId] = useState("");
  const [bbRound, setBbRound] = useState("");
  const [wildRound, setWildRound] = useState("");
  const [freehitROund, setfreehitROund] = useState("");
  const [bannedList, setBannedList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [has_changed, sethas_changed] = useState(false);
  const [bannedPlayersData, setBannedPlayersData] = useState([]);
  const [n_hits, setn_hits] = useState("");

  /**
   * fetchTeam can now optionally take:
   *  - useStatisticalModel: boolean
   *  - playersData: array of player rows (from AdjustmentData)
   *
   * Example: fetchTeam({ useStatisticalModel: true, playersData })
   */
const fetchTeam = async (options = {}) => {
  const { useStatisticalModel = false, playersData = null } = options;

  if (!teamId) return alert("Team ID is required");
  setLoading(true);

  try {
    // --------- AI model (unchanged): GET query params ---------
    if (!useStatisticalModel) {
      const params = new URLSearchParams({ team_id: teamId });

      if (bbRound) params.append("bb_round", bbRound);
      if (wildRound) params.append("wildcard_round", wildRound);
      if (freehitROund) params.append("freehit_round", freehitROund);
      bannedList.forEach((id) => params.append("banned_list", id));
      if (n_hits) params.append("n_hits", n_hits);

      const url = `https://fpl-project-t5e9.onrender.com/My_Team_Optimize?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setData(json);
      return;
    }

    // --------- Statistical model: POST JSON body ---------
    if (!Array.isArray(playersData) || playersData.length === 0) {
      alert("No player data available for statistical model.");
      return;
    }

    const slimPlayers = playersData.map((p) => ({
      // must match PlayerInput exactly
      name: p.name,
      web_name: p.web_name,
      Team: p.Team,
      GW: p.GW,
      position: p.position,
      value: p.value,
      Points: p.calc_points, // from PlayerAdjustmentsPage
    }));

    const body = {
      team_id: Number(teamId),
      banned_list: bannedList,
      bb_round: bbRound ? Number(bbRound) : 40,
      wildcard_round: wildRound ? Number(wildRound) : 40,
      freehit_round: freehitROund ? Number(freehitROund) : 40,
      n_hits: n_hits ? Number(n_hits) : 0,
      model_type: "statistical",
      players: slimPlayers,
    };

    const resp = await fetch("https://fpl-project-t5e9.onrender.com/My_Team_Optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(await resp.text());
    const json = await resp.json();
    setData(json);
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  } finally {
    setLoading(false);
  }
};


  const toggleBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
    const player = data?.find((p) => p.Name.toString() === sid);
    if (player) {
      const slim = {
        Name: player.Name,
        web_name: player.web_name,
        photo: player.photo,
      };
      setBannedPlayersData((prev) =>
        prev.find((p) => p.Name.toString() === sid) ? prev : [...prev, slim]
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
        sethas_changed,
        n_hits,
        setn_hits,
      }}
    >
      {children}
    </MyTeamDataContext.Provider>
  );
}
