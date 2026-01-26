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

  return fixtureIdFromTeams(homeTeam, awayTeam);
};

const toNum = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeOptions01 = (options01) => {
  const cleaned = (options01 || [])
    .map((o) => ({ gw: toNum(o.gw, null), p: toNum(o.p, 0) }))
    .filter((o) => Number.isFinite(o.gw));

  if (cleaned.length === 0) return null;

  const sum = cleaned.reduce((a, o) => a + (Number.isFinite(o.p) ? o.p : 0), 0);

  if (sum <= 0) {
    return cleaned.map((o, i) => ({ ...o, p: i === 0 ? 1 : 0 }));
  }

  return cleaned.map((o) => ({ ...o, p: o.p / sum }));
};

// fixturesConfig format: { [fixture_code: string]: [{gw, probability}] }
const optionsFromConfig = (fixturesConfig, fixtureCode) => {
  const arr = fixturesConfig?.[String(fixtureCode)];
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const options01 = arr.map((x) => ({
    gw: toNum(x.gw, null),
    p: toNum(x.probability, 0),
  }));

  return normalizeOptions01(options01);
};

const buildFixturesFromTeamRows = (teamRows, fixturesConfig) => {
  const byId = new Map();

  for (const r of teamRows || []) {
    const opp = r?.Opponent_team ?? r?.opponent_team;
    const isHome = r?.Home === "H" || r?.Home === "Home" || r?.Home === true;

    const homeTeam = isHome ? r.team_name : opp;
    const awayTeam = isHome ? opp : r.team_name;

    const id = fixtureIdFromRow(r); // UI identity (home__away)
    const gw = toNum(r.GW, null);

    // IMPORTANT: this matches your fixtures_config keys
    const fixtureCode = r?.fixture_code;

    if (!id || !homeTeam || !awayTeam || !Number.isFinite(gw)) continue;

    // IMPORTANT: initialize ONCE and ONLY ONCE per fixtureId
    if (!byId.has(id)) {
      // default = current GW, 100%
      let options = [{ gw, p: 1 }];

      // override from config if present (keyed by fixture_code)
      const cfg = optionsFromConfig(fixturesConfig, fixtureCode);
      if (cfg) options = cfg;

      byId.set(id, {
        id,
        homeTeam,
        awayTeam,
        fixtureCode: fixtureCode ?? null, // optional: useful for debugging
        options,
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

  // NEW: fixtures_config ref (from API)
  const FixturesConfigRef = useRef(null);

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
      const [TeamRes, PlayerRes, FixturesConfigRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/Team_result_adjust").then(
          (res) => res.json()
        ),
        fetch("https://fpl-project-t5e9.onrender.com/Player_result_adjust").then(
          (res) => res.json()
        ),
        fetch("https://fpl-project-t5e9.onrender.com/fixtures_config").then(
          (res) => res.json()
        ),
      ]);

      TeamRef.current = TeamRes;
      PlayerRef.current = PlayerRes;
      FixturesConfigRef.current = FixturesConfigRes;

      // init fixtures if missing
      if (!FixturesRef.current) {
        FixturesRef.current = buildFixturesFromTeamRows(
          TeamRes,
          FixturesConfigRef.current
        );
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

  const forceRefetch = useCallback(async () => {
    TeamRef.current = null;
    PlayerRef.current = null;
    FixturesRef.current = null;
    FixturesConfigRef.current = null;

    setDataVersion((v) => v + 1);
    setTeamVersion((v) => v + 1);
    setFixturesVersion((v) => v + 1);

    await fetchIfNeeded();
  }, [fetchIfNeeded]);

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
      FixturesRef.current = buildFixturesFromTeamRows(
        TeamRef.current,
        FixturesConfigRef.current
      );
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

  const normalizeFixtureProbabilities = useCallback(
    (fixtureId) => {
      updateFixture(fixtureId, (fx) => {
        const options = (fx.options || []).map((o) => ({
          gw: Number(o.gw),
          p: Number(o.p),
        }));

        const sum = options.reduce(
          (acc, o) => acc + (Number.isFinite(o.p) ? o.p : 0),
          0
        );

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
    },
    [updateFixture]
  );

  return (
    <AdjustmentContext.Provider
      value={{
        fetchIfNeeded,
        forceRefetch,
        loading,

        // refs
        Teamdata: TeamRef,
        Playerdata: PlayerRef,
        Fixtures: FixturesRef,

        // versions
        dataVersion,
        teamVersion,
        changesVersion,
        fixturesVersion,

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
