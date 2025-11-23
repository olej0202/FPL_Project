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

  // 🔥 specific version for TEAM changes
  const [teamVersion, setTeamVersion] = useState(0);

  // (optional) you could also add playerVersion similarly if needed later
  // const [playerVersion, setPlayerVersion] = useState(0);

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
        fetch(
          "https://fpl-project-t5e9.onrender.com/Player_result_adjust"
        ).then((res) => res.json()),
      ]);

      TeamRef.current = TeamRes;
      PlayerRef.current = PlayerRes;

      // bump versions so pages can react
      setDataVersion((v) => v + 1);
      setTeamVersion((v) => v + 1); // ⬅ initial team data loaded
    } catch (err) {
      console.error("Failed fetching adjustment data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Optional: a helper to force refetch, if you want a "Reset & Refetch" button
  const forceRefetch = useCallback(
    async () => {
      TeamRef.current = null;
      PlayerRef.current = null;

      // notify that data is now empty / will be refetched
      setDataVersion((v) => v + 1);
      setTeamVersion((v) => v + 1);

      await fetchIfNeeded(); // will fetch and bump again
    },
    [fetchIfNeeded]
  );

  // 🔹 Helper to update PLAYER data and bump dataVersion
  const updatePlayerData = useCallback((updater) => {
    if (typeof updater === "function") {
      PlayerRef.current = updater(PlayerRef.current || []);
    } else {
      PlayerRef.current = updater || [];
    }
    setDataVersion((v) => v + 1);
    // if you ever want a separate playerVersion:
    // setPlayerVersion((v) => v + 1);
  }, []);

  // 🔹 Helper to update TEAM data and bump BOTH dataVersion & teamVersion
  const updateTeamData = useCallback((updater) => {
    if (typeof updater === "function") {
      TeamRef.current = updater(TeamRef.current || []);
    } else {
      TeamRef.current = updater || [];
    }
    setDataVersion((v) => v + 1);
    setTeamVersion((v) => v + 1); // ⬅ important: consumers can watch this
  }, []);

  // 🔹 Changes list
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

        // refs
        Teamdata: TeamRef,
        Playerdata: PlayerRef,

        // versions
        dataVersion,
        teamVersion,
        // playerVersion, // if you add it later
        changesVersion,

        // changes API
        changes: ChangesRef,
        updateChanges,

        // update helpers
        updatePlayerData,
        updateTeamData,
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
