// src/Contexts/AdjustmentsContext.jsx
import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from "react";

const AdjustmentContext = createContext(null);

export const useAdjustmentData = () => useContext(AdjustmentContext);

export function AdjustmentDataProvider({ children }) {
  const TeamRef = useRef(null);
  const PlayerRef = useRef(null);

  const [loading, setLoading] = useState(false);

  // 🔥 This is what lets consumers know "data changed"
  const [dataVersion, setDataVersion] = useState(0);

  const fetchIfNeeded = useCallback(async () => {
    // if both already loaded, do nothing
    if (TeamRef.current && PlayerRef.current) return;

    setLoading(true);
    try {
      const [TeamRes, PlayerRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/Team_result_adjust").then(
          (res) => res.json()
        ),
        fetch("https://fpl-project-t5e9.onrender.com/Player_result_adjust").then(
          (res) => res.json()
        ),
      ]);

      TeamRef.current = TeamRes;
      PlayerRef.current = PlayerRes;

      // bump version so pages re-run effects that depend on dataVersion
      setDataVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed fetching adjustment data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Optional: a helper to force refetch, if you want a "Reset & Refetch" button
  const forceRefetch = useCallback(async () => {
    TeamRef.current = null;
    PlayerRef.current = null;
    setDataVersion((v) => v + 1); // notify that data is now empty

    await fetchIfNeeded(); // will fetch and bump version again
  }, [fetchIfNeeded]);

  return (
    <AdjustmentContext.Provider
      value={{
        fetchIfNeeded,
        forceRefetch,   // optional; use in your reset button if you like
        loading,
        Teamdata: TeamRef,
        Playerdata: PlayerRef,
        dataVersion,    // 👈 use this in PlayerAdjustmentsPage
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
