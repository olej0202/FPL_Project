import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const StatsDataContext = createContext();

export const useStatsData = () => useContext(StatsDataContext);

export function StatsDataProvider({ children }) {
  const PlayersRef = useRef(null);
  const TeamRef = useRef(null);
  const TeamThreatRef = useRef(null);
  const TeamLineupsRef = useRef(null);
  const inFlightRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [selected_team, setselected_team] = useState("Arsenal");
  const [analyses, setAnalyses] = useState([]);
  const addAnalysis = (analysis) => {
    setAnalyses((prev) => [...prev, analysis]);
  };
  const removeAnalysis = (id) => {
    setAnalyses((prev) => prev.filter((a) => a.id !== id));
  };

  const fetchIfNeeded = useCallback(async () => {
    if (PlayersRef.current && TeamRef.current && TeamThreatRef.current && TeamLineupsRef.current) return;
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const [PlayersRes, TeamRes, TeamThreat, TeamLineups] = await Promise.all([
          fetch("https://fpl-project-t5e9.onrender.com/Player_rankings").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Team_current").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Team_Threat").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Team_Lineups").then((res) => res.json()),
        ]);
        PlayersRef.current = PlayersRes;
        TeamRef.current = TeamRes;
        TeamThreatRef.current = TeamThreat;
        TeamLineupsRef.current = TeamLineups;
        setDataVersion((v) => v + 1);
      } catch (err) {
        console.error("Failed fetching AI team data:", err);
      } finally {
        inFlightRef.current = null;
        setLoading(false);
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

  return (
    <StatsDataContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        dataVersion,
        PlayersData: PlayersRef,
        TeamData: TeamRef,
        TeamThreatData: TeamThreatRef,
        TeamLineupsData:TeamLineupsRef,
        analyses,
        addAnalysis,
        removeAnalysis,
        selected_team,
        setselected_team,
      }}
    >
      {children}
    </StatsDataContext.Provider>
  );
}
