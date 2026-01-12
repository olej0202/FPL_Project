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

// --- helpers ---
const normalizeName = (s) => String(s ?? "").trim().toLowerCase();

const fixtureIdFromTeams = (homeTeam, awayTeam) =>
  `${normalizeName(homeTeam)}__${normalizeName(awayTeam)}`;

// Your rows are "team perspective". Derive the actual home/away fixture identity.
export const fixtureIdFromRow = (row) => {
  const opp = row?.Opponent_team ?? row?.opponent_team; // fallback just in case
  const isHome = row?.Home === "H" || row?.Home === "Home" || row?.Home === true;

  const homeTeam = isHome ? row.team_name : opp;
  const awayTeam = isHome ? opp : row.team_name;

  const normalizeName = (s) => String(s ?? "").trim().toLowerCase();
  return `${normalizeName(homeTeam)}__${normalizeName(awayTeam)}`;
};

const buildFixturesFromTeamRows = (teamRows) => {
  const byId = new Map();

  for (const r of teamRows || []) {
    const opp = r?.Opponent_team ?? r?.opponent_team;
    const isHome = r?.Home === "H" || r?.Home === "Home" || r?.Home === true;
    const homeTeam = isHome ? r.team_name : opp;
    const awayTeam = isHome ? opp : r.team_name;

    const id = fixtureIdFromRow(r);
    const gw = Number(r.GW);

    if (!id || !homeTeam || !awayTeam || !Number.isFinite(gw)) continue;

    // IMPORTANT: initialize ONCE and ONLY ONCE per fixtureId
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        homeTeam,
        awayTeam,
        // start with exactly one option: current GW, 100%
        options: [{ gw, p: 1 }],
      });
    }
  }

  return Array.from(byId.values());
};

export function AdjustmentDataProvider({ children }) {
  const TeamRef = useRef(null);
  const PlayerRef = useRef(null);
  const ChangesRef = useRef([]);

  // NEW: fixtures ref
  const FixturesRef = useRef(null);

  const [loading, setLoading] = useState(false);

  // global versions
  const [dataVersion, setDataVersion] = useState(0);
  const [teamVersion, setTeamVersion] = useState(0);
  const [changesVersion, setChangesVersion] = useState(0);

  // NEW: fixtures version
  const [fixturesVersion, setFixturesVersion] = useState(0);

  const fetchIfNeeded = useCallback(async () => {
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

      // init fixtures if missing
      if (!FixturesRef.current) {
        FixturesRef.current = buildFixturesFromTeamRows(TeamRes);
        setFixturesVersion((v) => v + 1);
      }

      setDataVersion((v) => v + 1);
      setTeamVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed fetching adjustment data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const forceRefetch = useCallback(
    async () => {
      TeamRef.current = null;
      PlayerRef.current = null;
      FixturesRef.current = null;

      setDataVersion((v) => v + 1);
      setTeamVersion((v) => v + 1);
      setFixturesVersion((v) => v + 1);

      await fetchIfNeeded();
    },
    [fetchIfNeeded]
  );

  const updatePlayerData = useCallback((updater) => {
    if (typeof updater === "function") {
      PlayerRef.current = updater(PlayerRef.current || []);
    } else {
      PlayerRef.current = updater || [];
    }
    setDataVersion((v) => v + 1);
  }, []);

  const updateTeamData = useCallback((updater) => {
    if (typeof updater === "function") {
      TeamRef.current = updater(TeamRef.current || []);
    } else {
      TeamRef.current = updater || [];
    }

    // If fixtures haven't been initialized (or were reset), build them now.
    if (!FixturesRef.current) {
      FixturesRef.current = buildFixturesFromTeamRows(TeamRef.current);
      setFixturesVersion((v) => v + 1);
    }

    setDataVersion((v) => v + 1);
    setTeamVersion((v) => v + 1);
  }, []);

  const updateChanges = useCallback((updater) => {
    if (typeof updater === "function") {
      ChangesRef.current = updater(ChangesRef.current || []);
    } else {
      ChangesRef.current = updater || [];
    }
    setChangesVersion((v) => v + 1);
    setDataVersion((v) => v + 1);
  }, []);

  // -------------------------
  // NEW: fixtures API
  // -------------------------

  const setFixtures = useCallback((next) => {
    FixturesRef.current = next || [];
    setFixturesVersion((v) => v + 1);
    setDataVersion((v) => v + 1);
  }, []);

  const updateFixture = useCallback((fixtureId, updater) => {
    const prev = FixturesRef.current || [];
    const idx = prev.findIndex((f) => f.id === fixtureId);
    if (idx === -1) return;

    const clone = [...prev];
    const oldFx = clone[idx];
    const nextFx = typeof updater === "function" ? updater(oldFx) : updater;

    clone[idx] = nextFx;
    FixturesRef.current = clone;

    setFixturesVersion((v) => v + 1);
    setDataVersion((v) => v + 1);
  }, []);

  const normalizeFixtureProbabilities = useCallback((fixtureId) => {
    updateFixture(fixtureId, (fx) => {
      const options = (fx.options || []).map((o) => ({
        gw: Number(o.gw),
        p: Number(o.p),
      }));

      const sum = options.reduce((acc, o) => acc + (Number.isFinite(o.p) ? o.p : 0), 0);

      // If sum is 0, fall back to first option = 1
      if (sum <= 0) {
        return {
          ...fx,
          options: options.map((o, i) => ({ ...o, p: i === 0 ? 1 : 0 })),
        };
      }

      return {
        ...fx,
        options: options.map((o) => ({ ...o, p: o.p / sum })),
      };
    });
  }, [updateFixture]);

  return (
    <AdjustmentContext.Provider
      value={{
        fetchIfNeeded,
        forceRefetch,
        loading,

        // refs
        Teamdata: TeamRef,
        Playerdata: PlayerRef,
        Fixtures: FixturesRef, // NEW

        // versions
        dataVersion,
        teamVersion,
        changesVersion,
        fixturesVersion, // NEW

        // changes API
        changes: ChangesRef,
        updateChanges,

        // update helpers
        updatePlayerData,
        updateTeamData,

        // fixtures API
        setFixtures,
        updateFixture,
        normalizeFixtureProbabilities,
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
