import React, { createContext, useContext, useRef, useState } from "react";

const AITeamDataContext = createContext();

export const useAITeamData = () => useContext(AITeamDataContext);

export function AITeamDataProvider({ children }) {
  const freeHitRef = useRef(null);
  const wildcardRef = useRef(null);
  const myTeamRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const fetchIfNeeded = async () => {
    if (freeHitRef.current) return;

    setLoading(true);
    try {
      const [freeHitRes, wildcardRes, myTeamRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/free-hit").then(res => res.json()),
      ]);
      freeHitRef.current = freeHitRes;
      wildcardRef.current = wildcardRes;
      myTeamRef.current = myTeamRes;
    } catch (err) {
      console.error("Failed fetching AI team data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AITeamDataContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        freeHitData: freeHitRef,
      }}
    >
      {children}
    </AITeamDataContext.Provider>
  );
}
