import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const AITeamDataContext = createContext();

export const useAITeamData = () => useContext(AITeamDataContext);

export function AITeamDataProvider({ children }) {
  const freeHitRef = useRef(null);
  const wildcardRef = useRef(null);
  const inFlightRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const fetchIfNeeded = useCallback(async () => {
    if (freeHitRef.current && wildcardRef.current) return;
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const [freeHitRes, wildcardRes] = await Promise.all([
          fetch("https://fpl-project-t5e9.onrender.com/free-hit").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/wildcard").then((res) => res.json()),
        ]);
        freeHitRef.current = freeHitRes;
        wildcardRef.current = wildcardRes;
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
    <AITeamDataContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        dataVersion,
        freeHitData: freeHitRef,
        wildcardData: wildcardRef,
      }}
    >
      {children}
    </AITeamDataContext.Provider>
  );
}
