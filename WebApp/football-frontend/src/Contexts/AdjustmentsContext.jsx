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
  const ChangesRef = useRef([]);

  const [loading, setLoading] = useState(false);

  // 🔥 global version for "data changed"
  const [dataVersion, setDataVersion] = useState(0);

  // separate version for changes (so consumers can cheaply re-render)
  const [changesVersion, setChangesVersion] = useState(0);

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

  // 🔹 Helper to update PLAYER data and bump dataVersion
  const updatePlayerData = useCallback((updater) => {
    if (typeof updater === "function") {
      PlayerRef.current = updater(PlayerRef.current || []);
    } else {
      PlayerRef.current = updater || [];
    }
    setDataVersion((v) => v + 1);
  }, []);

  // 🔹 Helper to update TEAM data and bump dataVersion (if needed later)
  const updateTeamData = useCallback((updater) => {
    if (typeof updater === "function") {
      TeamRef.current = updater(TeamRef.current || []);
    } else {
      TeamRef.current = updater || [];
    }
    setDataVersion((v) => v + 1);
  }, []);

  // 🔹 Changes list lives in context as well, with its own version,
  // and ALSO bumps dataVersion whenever changes change (per your request)
  const updateChanges = useCallback((updater) => {
    if (typeof updater === "function") {
      ChangesRef.current = updater(ChangesRef.current || []);
    } else {
      ChangesRef.current = updater || [];
    }
    setChangesVersion((v) => v + 1);
    setDataVersion((v) => v + 1); // also bump global dataVersion on change
  }, []);

  return (
    <AdjustmentContext.Provider
      value={{
        fetchIfNeeded,
        forceRefetch,
        loading,
        Teamdata: TeamRef,
        Playerdata: PlayerRef,
        dataVersion,
        // 🔹 changes API
        changes: ChangesRef,
        updateChanges,
        changesVersion,
        // 🔹 data update helpers
        updatePlayerData,
        updateTeamData,
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
