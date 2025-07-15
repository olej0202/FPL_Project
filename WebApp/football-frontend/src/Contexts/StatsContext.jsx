import React, { createContext, useContext, useRef, useState } from "react";

const StatsDataContext = createContext();

export const useStatsData = () => useContext(StatsDataContext);

export function StatsDataProvider({ children }) {
  const PlayersRef = useRef(null);
  const TeamRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [analyses, setAnalyses] = useState([]);
  const addAnalysis = (analysis) => {
  setAnalyses((prev) => [...prev, analysis]);
};
const removeAnalysis = (id) => {
  setAnalyses(prev => prev.filter(a => a.id !== id));
};

  const fetchIfNeeded = async () => {
    if (PlayersRef.current && TeamRef.current) return;

    setLoading(true);
    try {
      const [PlayersRes, TeamRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/Player_rankings").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Team_current").then(res => res.json()),
      ]);
      PlayersRef.current = PlayersRes;
      TeamRef.current = TeamRes;
    } catch (err) {
      console.error("Failed fetching AI team data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <StatsDataContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        PlayersData: PlayersRef,
        TeamData: TeamRef,
        analyses,
        addAnalysis,
        removeAnalysis,
      }}
    >
      {children}
    </StatsDataContext.Provider>
  );
}
