import React, { createContext, useContext, useRef, useState } from "react";

const AdjustmentContext = createContext();

export const useAdjustmentData = () => useContext(AdjustmentContext);

export function AdjustmentDataProvider({ children }) {
  const TeamRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const fetchIfNeeded = async () => {
    if (TeamRef.current) return;

    setLoading(true);
    try {
      const [TeamRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/Team_result_adjust").then(res => res.json()),
      ]);
      TeamRef.current = TeamRes;

    } catch (err) {
      console.error("Failed fetching AI team data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdjustmentContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        Teamdata: TeamRef,
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
