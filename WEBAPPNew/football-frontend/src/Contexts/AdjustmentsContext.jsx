// src/Contexts/AdjustmentsContext.jsx
import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { API_BASE_URL } from "../config/apiBase";
import { useUserData } from "./UserContext";

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

const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));

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

const firstFinite = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const parseOptional01 = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? clamp01(n) : null;
};
const scaleRawCbiByAdjustedMean = (raw01, sourceMean01, adjustedMean01) => {
  const raw = clamp01(raw01);
  const sourceMean = clamp01(sourceMean01);
  const adjustedMean = clamp01(adjustedMean01);
  if (sourceMean > 1e-9) return clamp01(raw * (adjustedMean / sourceMean));
  return adjustedMean;
};

const teamGwKey = (teamCode, gw) => `${normalizeName(teamCode)}__${toNum(gw, -1)}`;

const buildTeamLookup = (teamRows) => {
  const map = new Map();

  for (const row of teamRows || []) {
    const gw = toNum(row?.GW, null);
    if (!Number.isFinite(gw)) continue;

    const teamCandidates = [
      row?.team,
      row?.Team,
      row?.team_code,
      row?.code,
      row?.team_name,
    ];

    const teamContext = {
      XG: firstFinite(row?.XG, row?.xg, 0) ?? 0,
      CS: firstFinite(row?.CS, row?.cs, 0) ?? 0,
      Matches: Math.max(0, firstFinite(row?.Matches, row?.matches, 0) ?? 0),
    };

    for (const teamCode of teamCandidates) {
      if (teamCode == null || String(teamCode).trim() === "") continue;
      map.set(teamGwKey(teamCode, gw), teamContext);
    }
  }

  return map;
};

const resolveTeamContext = (playerRow, teamLookup) => {
  const gw = toNum(playerRow?.GW, null);
  if (!Number.isFinite(gw)) return null;

  const teamCandidates = [
    playerRow?.Team,
    playerRow?.team,
    playerRow?.team_code,
    playerRow?.team_name,
  ];

  for (const teamCode of teamCandidates) {
    if (teamCode == null || String(teamCode).trim() === "") continue;
    const found = teamLookup.get(teamGwKey(teamCode, gw));
    if (found) return found;
  }

  return null;
};

const computeMeasuresForBootstrap = (playerRow, teamRow) => {
  const matchCount = Math.max(
    0,
    firstFinite(teamRow?.Matches, playerRow?.Matches, playerRow?.matches, 0) ?? 0
  );

  const avgMinRaw = firstFinite(
    playerRow?.average_minutes,
    playerRow?.Avg_Minutes,
    0
  ) ?? 0;
  const avgMin = Math.max(0, Math.min(90, avgMinRaw));

  const goalShare = firstFinite(playerRow?.Goal_share, 0) ?? 0;
  const assistShare = firstFinite(playerRow?.Assist_share, 0) ?? 0;
  const savePredRaw = firstFinite(playerRow?.Save_Pred, 0) ?? 0;

  const penData = firstFinite(playerRow?.Pen_data, 0) ?? 0;
  const oppGoalThreat = firstFinite(playerRow?.Pos_Goal_Threat, 0) ?? 0;
  const oppAssistThreat = firstFinite(playerRow?.Pos_Assist_Threat, 0) ?? 0;

  const bps = firstFinite(playerRow?.BPS, 0) ?? 0;
  const defaultPoints = firstFinite(
    playerRow?.default_points,
    playerRow?.Points_prediction,
    playerRow?.Points,
    playerRow?.points,
    0
  ) ?? 0;

  const goalFactor = firstFinite(playerRow?.Goal_factor, 0) ?? 0;
  const assistFactor = firstFinite(playerRow?.Assist_factor, 0) ?? 0;
  const csFactor = firstFinite(playerRow?.CS_factor, 0) ?? 0;

  const xg = firstFinite(teamRow?.XG, 0) ?? 0;
  const cs = firstFinite(teamRow?.CS, 0) ?? 0;

  const minutesAdj = avgMin ? Math.min(1, avgMin / 80) : 0;
  const csPerMatch = matchCount > 0 ? cs / matchCount : 0;
  const csNonlinear =
    csFactor > 1 ? ((30 - Math.min(30, csPerMatch * 100)) / -15) * matchCount : 0;

  const goalScored =
    ((goalShare * 0.9 + 0.1 * oppGoalThreat) * xg + penData * 0.5 * matchCount) *
    minutesAdj;
  const assists = ((assistShare * 0.9 + 0.1 * oppAssistThreat) * xg) * minutesAdj;

  const rawCbi01 = clamp01(firstFinite(playerRow?.CBI_Predictions, playerRow?.CBI_Percent, 0) ?? 0);
  const cbi01 = rawCbi01 * minutesAdj;
  const defconPointsTerm = cbi01 * minutesAdj * matchCount * 2;
  const savePred = savePredRaw * minutesAdj * matchCount;

  const basePoints =
    (defaultPoints + bps) * minutesAdj * matchCount + defconPointsTerm;

  const points = Math.max(
    0,
    basePoints +
      goalScored * goalFactor +
      assists * assistFactor +
      cs * csFactor * minutesAdj +
      csNonlinear +
      savePred / 3
  );

  return {
    Points: points,
    Goal_Scored: goalScored,
    Assists: assists,
    Save_Pred: savePred,
    Avg_Minutes: avgMin * matchCount,
    CBI_Predictions: cbi01,
  };
};

const bootstrapPlayerCalcs = (rows, teamRows) => {
  if (!Array.isArray(rows)) return [];
  const teamLookup = buildTeamLookup(teamRows);

  return rows.map((row) => {
    const teamRow = resolveTeamContext(row, teamLookup);
    const measures = computeMeasuresForBootstrap(row, teamRow);

    const calc_points = firstFinite(
      row?.calc_points,
      measures.Points,
      row?.Points_prediction,
      row?.default_points,
      row?.Points,
      row?.points,
      0
    );
    const calc_goals = firstFinite(
      row?.calc_goals,
      measures.Goal_Scored,
      row?.Goal_pred,
      row?.Goal_Scored,
      0
    );
    const calc_assists = firstFinite(
      row?.calc_assists,
      measures.Assists,
      row?.Assist_pred,
      row?.Assists,
      0
    );
    const calc_saves = firstFinite(
      row?.calc_saves,
      measures.Save_Pred,
      row?.Save_Pred,
      0
    );
    const calc_minutes = firstFinite(row?.calc_minutes, measures.Avg_Minutes, 0);
    const cbiRaw = firstFinite(row?.CBI_Predictions, row?.CBI_Percent, 0);
    const calc_cbi = firstFinite(
      row?.calc_cbi,
      measures.CBI_Predictions,
      row?.CBI_Predictions,
      cbiRaw,
      0
    );
    const defcon_adjust_01 = parseOptional01(row?.defcon_adjust_01);

    return {
      ...row,
      calc_points,
      calc_goals,
      calc_assists,
      calc_saves,
      calc_minutes,
      calc_cbi,
      defcon_adjust_01,
    };
  });
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

// Keep one row per team perspective per fixture. Upstream aliases can share a
// team code and otherwise duplicate XG, CS and Matches in player projections.
// The generator emits the current canonical name after an older alias, so the
// last matching row is the correct one to retain.
const dedupeTeamPerspectiveRows = (teamRows) => {
  const byPerspective = new Map();
  for (const row of teamRows || []) {
    const fixtureIdentity = row?.fixture_code ?? fixtureIdFromRow(row);
    const teamIdentity = row?.team_code ?? row?.team ?? row?.Team ?? row?.team_name;
    const key = [fixtureIdentity, teamIdentity, row?.GW ?? "", row?.Home ?? ""].join("|");
    byPerspective.set(key, row);
  }
  return Array.from(byPerspective.values());
};

const playerGroupKey = (p) => p?.name || `${p?.web_name || "unknown"}_${p?.Team || "NA"}`;

const buildProjectedTeamLookup = (teamRows, fixtures) => {
  const lookup = new Map();
  const optionsById = new Map();

  for (const fx of fixtures || []) {
    optionsById.set(
      fx.id,
      (fx.options || []).map((o) => ({ gw: Number(o.gw), p: Number(o.p) }))
    );
  }

  const add = (teamCode, gw, xg, cs, matches) => {
    const key = `${String(teamCode)}_${Number(gw)}`;
    const prev = lookup.get(key);
    const prevXG = prev ? Number(prev.XG) || 0 : 0;
    const prevCS = prev ? Number(prev.CS) || 0 : 0;
    const prevM = prev ? Number(prev.Matches) || 0 : 0;

    lookup.set(key, {
      team_code: teamCode,
      GW: Number(gw),
      XG: prevXG + (Number(xg) || 0),
      CS: prevCS + (Number(cs) || 0),
      Matches: prevM + (Number(matches) || 0),
    });
  };

  for (const row of dedupeTeamPerspectiveRows(teamRows)) {
    const code = row?.team_code ?? row?.team ?? row?.Team;
    const gw0 = Number(row?.GW);
    if (code == null || !Number.isFinite(gw0)) continue;

    const rowXG = Number(row?.XG) || 0;
    const rowCS = Number(row?.CS) || 0;

    const id = fixtureIdFromRow({ ...row, Opponent_team: row?.Opponent_team });
    const dist =
      optionsById.get(id)?.length ? optionsById.get(id) : [{ gw: gw0, p: 1 }];

    for (const o of dist) {
      const gw = Number(o.gw);
      const p = Number(o.p);
      if (!Number.isFinite(gw) || !Number.isFinite(p) || p <= 0) continue;
      add(code, gw, p * rowXG, p * rowCS, p);
    }
  }

  return lookup;
};

const computeAlignedMeasures = (playerRow, teamRow, cbi01Override = null) => {
  if (!teamRow) {
    return {
      Goal_Scored: 0,
      Assists: 0,
      Save_Pred: 0,
      Points: 0,
      Avg_Minutes: 0,
      CBI_Predictions: 0,
      _CBI01_Raw: 0,
    };
  }

  const matchCount = Math.max(0, Number(teamRow.Matches) || 0);
  const avgMinRaw = Number(playerRow.average_minutes) || 0;
  const avgMin = Math.max(0, Math.min(90, avgMinRaw));

  const goalShare = Number(playerRow.Goal_share) || 0;
  const assistShare = Number(playerRow.Assist_share) || 0;
  const savePredRaw = Number(playerRow.Save_Pred) || 0;

  const penData = Number(playerRow.Pen_data) || 0;
  const oppGoalThreat = Number(playerRow.Pos_Goal_Threat) || 0;
  const oppAssistThreat = Number(playerRow.Pos_Assist_Threat) || 0;

  const bps = Number(playerRow.BPS) || 0;
  const defaultPoints = Number(playerRow.default_points) || 0;

  const goalFactor = Number(playerRow.Goal_factor) || 0;
  const assistFactor = Number(playerRow.Assist_factor) || 0;
  const csFactor = Number(playerRow.CS_factor) || 0;

  const xg = Number(teamRow.XG) || 0;
  const cs = Number(teamRow.CS) || 0;

  const minutesAdj = avgMin ? Math.min(1, avgMin / 80) : 0;
  const csPerMatch = matchCount > 0 ? cs / matchCount : 0;
  const csNonlinear =
    csFactor > 1 ? ((30 - Math.min(30, csPerMatch * 100)) / -15) * matchCount : 0;

  const goalScored =
    ((goalShare * 0.9 + 0.1 * oppGoalThreat) * xg + penData * 0.5 * matchCount) *
    minutesAdj;
  const assists = ((assistShare * 0.9 + 0.1 * oppAssistThreat) * xg) * minutesAdj;

  const rawCbi01 = clamp01(firstFinite(playerRow?.CBI_Predictions, playerRow?.CBI_Percent, 0) ?? 0);
  const cbi01 =
    (typeof cbi01Override === "number" && Number.isFinite(cbi01Override)
      ? clamp01(cbi01Override)
      : rawCbi01) * minutesAdj;

  const defconPointsTerm = cbi01 * minutesAdj * matchCount * 2;
  const savePred = savePredRaw * minutesAdj * matchCount;
  const basePoints =
    (defaultPoints + bps) * minutesAdj * matchCount + defconPointsTerm;

  const points = Math.max(
    0,
    basePoints +
      goalScored * goalFactor +
      assists * assistFactor +
      cs * csFactor * minutesAdj +
      csNonlinear +
      savePred / 3
  );

  return {
    Goal_Scored: goalScored,
    Assists: assists,
    Save_Pred: savePred,
    Points: points,
    Avg_Minutes: avgMin * matchCount,
    CBI_Predictions: cbi01,
    _CBI01_Raw: rawCbi01,
  };
};

const buildStablePlayerCalcs = (playerRows, teamRows, fixtures) => {
  if (!Array.isArray(playerRows)) return [];

  const teamLookup = buildProjectedTeamLookup(teamRows, fixtures);
  const grouped = new Map();

  for (const row of playerRows) {
    const key = playerGroupKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const meanByPlayer = new Map();
  const adjByPlayer = new Map();

  for (const [nameKey, rowsForPlayer] of grouped.entries()) {
    let rawSum = 0;
    let rawCount = 0;

    const baselineRows = rowsForPlayer.filter((row) => {
      const gw = Number(row?.GW);
      return Number.isFinite(gw) && gw >= 1 && gw <= 38;
    });
    const rowsForMean = baselineRows.length > 0 ? baselineRows : rowsForPlayer;

    for (const row of rowsForMean) {
      const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);
      const base = computeAlignedMeasures(row, teamRow);
      rawSum += clamp01(Number(base._CBI01_Raw));
      rawCount += 1;
    }

    const meanRaw = rawCount ? rawSum / rawCount : 0;
    meanByPlayer.set(nameKey, meanRaw);

    const first = rowsForPlayer[0];
    const storedAdj = parseOptional01(first?.defcon_adjust_01);
    adjByPlayer.set(
      nameKey,
      storedAdj != null ? storedAdj : clamp01(meanRaw)
    );
  }

  return playerRows.map((row) => {
    const key = playerGroupKey(row);
    const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);
    const meanRaw = meanByPlayer.get(key) ?? 0;
    const newAdj = adjByPlayer.get(key) ?? clamp01(meanRaw);

    const raw = computeAlignedMeasures(row, teamRow);
    const adjustedCbi01 = scaleRawCbiByAdjustedMean(
      clamp01(Number(raw._CBI01_Raw)),
      meanRaw,
      newAdj
    );
    const measures = computeAlignedMeasures(row, teamRow, adjustedCbi01);

    return {
      ...row,
      calc_points: measures.Points,
      calc_goals: measures.Goal_Scored,
      calc_assists: measures.Assists,
      calc_saves: measures.Save_Pred,
      calc_minutes: measures.Avg_Minutes,
      calc_cbi: measures.CBI_Predictions,
      defcon_adjust_01: newAdj,
    };
  });
};

const SCENARIO_STORAGE_KEY = "fpl_adjustment_scenarios_v1";
export const BASE_SCENARIO_ID = "base";
const PLAYER_OVERRIDE_FIELDS = [
  "Goal_share",
  "Assist_share",
  "average_minutes",
  "defcon_adjust_01",
];
const TEAM_OVERRIDE_FIELDS = [
  "own_XG_avg",
  "own_XGC_avg",
  "opponent_XG_avg",
  "opponent_XGC_avg",
  "base_own_XG_avg",
  "base_own_XGC_avg",
  "XG",
  "CS",
];

const emptyBaseScenario = () => ({
  id: BASE_SCENARIO_ID,
  name: "Base scenario",
  createdAt: 0,
  updatedAt: Date.now(),
  playerOverrides: {},
  teamOverrides: {},
  fixtureOverrides: {},
});

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const playerRowKey = (row, index) =>
  [
    row?.element ?? row?.id ?? row?.Player_code ?? row?.name ?? row?.web_name ?? index,
    row?.Team ?? row?.team ?? row?.team_code ?? "",
    row?.GW ?? "",
    row?.fixture_code ?? row?.fixture ?? "",
  ].join("|");
const teamRowKey = (row, index) =>
  [
    row?.fixture_code ?? row?.fixture ?? "",
    row?.team_code ?? row?.team ?? row?.team_name ?? index,
    row?.GW ?? "",
    row?.Home ?? "",
    row?.Opponent_team ?? row?.opponent_team ?? "",
  ].join("|");

const valuesEqual = (a, b) => {
  if (a == null && b == null) return true;
  const an = Number(a);
  const bn = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(an) && Number.isFinite(bn)) {
    return Math.abs(an - bn) < 1e-10;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

const collectOverrides = (rows, sourceRows, fields, keyFn) => {
  const sourceByKey = new Map(
    (sourceRows || []).map((row, index) => [keyFn(row, index), row])
  );
  const overrides = {};
  (rows || []).forEach((row, index) => {
    const key = keyFn(row, index);
    const source = sourceByKey.get(key) || sourceRows?.[index] || {};
    const values = {};
    fields.forEach((field) => {
      if (!valuesEqual(row?.[field], source?.[field])) values[field] = row?.[field] ?? null;
    });
    if (Object.keys(values).length) overrides[key] = { index, values };
  });
  return overrides;
};

const applyOverrides = (sourceRows, overrides, keyFn) =>
  (sourceRows || []).map((row, index) => {
    const patch = overrides?.[keyFn(row, index)];
    return patch ? { ...row, ...patch.values } : { ...row };
  });

const readScenarioStore = () => {
  const fallback = { activeScenarioId: BASE_SCENARIO_ID, scenarios: [emptyBaseScenario()] };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_STORAGE_KEY) || "null");
    const incoming = Array.isArray(parsed?.scenarios) ? parsed.scenarios : [];
    const base = incoming.find((scenario) => scenario?.id === BASE_SCENARIO_ID);
    const scenarios = [
      { ...emptyBaseScenario(), ...(base || {}) },
      ...incoming.filter((scenario) => scenario?.id && scenario.id !== BASE_SCENARIO_ID),
    ];
    const activeScenarioId = scenarios.some((scenario) => scenario.id === parsed?.activeScenarioId)
      ? parsed.activeScenarioId
      : BASE_SCENARIO_ID;
    return { activeScenarioId, scenarios };
  } catch {
    return fallback;
  }
};

export function AdjustmentDataProvider({ children }) {
  const { authHeaders, guestTrackingId } = useUserData();
  const initialStoreRef = useRef(null);
  if (!initialStoreRef.current) initialStoreRef.current = readScenarioStore();

  const TeamRef = useRef(null);
  const PlayerRef = useRef(null);
  const FixturesRef = useRef(null);
  const ChangesRef = useRef([]);
  const SourceTeamRef = useRef(null);
  const SourcePlayerRef = useRef(null);
  const SourceFixturesRef = useRef(null);
  const FixturesConfigRef = useRef(null);
  const fetchInFlightRef = useRef(null);
  const scenariosRef = useRef(initialStoreRef.current.scenarios);
  const activeScenarioIdRef = useRef(initialStoreRef.current.activeScenarioId);

  const [loading, setLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [teamVersion, setTeamVersion] = useState(0);
  const [changesVersion, setChangesVersion] = useState(0);
  const [fixturesVersion, setFixturesVersion] = useState(0);
  const [scenarioVersion, setScenarioVersion] = useState(0);
  const [scenarios, setScenarios] = useState(initialStoreRef.current.scenarios);
  const [activeScenarioId, setActiveScenarioId] = useState(initialStoreRef.current.activeScenarioId);

  const persistScenarioStore = useCallback((nextScenarios, nextActiveId) => {
    scenariosRef.current = nextScenarios;
    activeScenarioIdRef.current = nextActiveId;
    setScenarios(nextScenarios);
    setActiveScenarioId(nextActiveId);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          SCENARIO_STORAGE_KEY,
          JSON.stringify({ scenarios: nextScenarios, activeScenarioId: nextActiveId })
        );
      } catch (error) {
        console.warn("Could not save adjustment scenarios in this browser:", error);
      }
    }
    setScenarioVersion((version) => version + 1);
  }, []);

  const scenarioById = useCallback(
    (id) => scenariosRef.current.find((scenario) => scenario.id === id) || scenariosRef.current[0],
    []
  );

  const materializeScenario = useCallback((id) => {
    if (!SourceTeamRef.current || !SourcePlayerRef.current || !SourceFixturesRef.current) return null;
    const scenario = scenarioById(id);
    const teams = applyOverrides(SourceTeamRef.current, scenario?.teamOverrides, teamRowKey);
    const fixtures = SourceFixturesRef.current.map((fixture) => {
      const patch = scenario?.fixtureOverrides?.[fixture.id];
      return patch ? { ...fixture, options: cloneJson(patch.options || []) } : cloneJson(fixture);
    });
    const players = applyOverrides(SourcePlayerRef.current, scenario?.playerOverrides, playerRowKey);
    return { teams, fixtures, players: buildStablePlayerCalcs(players, teams, fixtures) };
  }, [scenarioById]);

  const applyMaterializedScenario = useCallback((snapshot) => {
    if (!snapshot) return;
    TeamRef.current = snapshot.teams;
    FixturesRef.current = snapshot.fixtures;
    PlayerRef.current = snapshot.players;
    ChangesRef.current = [];
    setDataVersion((version) => version + 1);
    setTeamVersion((version) => version + 1);
    setFixturesVersion((version) => version + 1);
    setChangesVersion((version) => version + 1);
  }, []);

  const replaceScenario = useCallback((id, patch) => {
    const next = scenariosRef.current.map((scenario) =>
      scenario.id === id ? { ...scenario, ...patch, updatedAt: Date.now() } : scenario
    );
    persistScenarioStore(next, activeScenarioIdRef.current);
  }, [persistScenarioStore]);

  const fetchIfNeeded = useCallback(async () => {
    if (TeamRef.current && PlayerRef.current && FixturesRef.current) return;
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const [teamResult, playerResult, fixturesConfigResult] = await Promise.all([
          fetch(`${API_BASE_URL}/Team_result_adjust`, { headers: { ...authHeaders } }).then((res) => res.json()),
          fetch(`${API_BASE_URL}/Player_result_adjust`, { headers: { ...authHeaders } }).then((res) => res.json()),
          fetch(`${API_BASE_URL}/fixtures_config`, { headers: { ...authHeaders } }).then((res) => res.json()),
        ]);
        const dedupedTeamResult = dedupeTeamPerspectiveRows(teamResult);
        const sourceFixtures = buildFixturesFromTeamRows(dedupedTeamResult, fixturesConfigResult);
        SourceTeamRef.current = cloneJson(dedupedTeamResult);
        SourceFixturesRef.current = cloneJson(sourceFixtures);
        SourcePlayerRef.current = buildStablePlayerCalcs(playerResult, dedupedTeamResult, sourceFixtures);
        FixturesConfigRef.current = fixturesConfigResult;
        applyMaterializedScenario(materializeScenario(activeScenarioIdRef.current));
      } catch (err) {
        console.error("Failed fetching adjustment data:", err);
      } finally {
        fetchInFlightRef.current = null;
        setLoading(false);
      }
    })();
    fetchInFlightRef.current = request;
    return request;
  }, [applyMaterializedScenario, authHeaders, materializeScenario]);

  const forceRefetch = useCallback(async () => {
    TeamRef.current = null;
    PlayerRef.current = null;
    FixturesRef.current = null;
    SourceTeamRef.current = null;
    SourcePlayerRef.current = null;
    SourceFixturesRef.current = null;
    FixturesConfigRef.current = null;
    fetchInFlightRef.current = null;
    await fetchIfNeeded();
  }, [fetchIfNeeded]);

  const updatePlayerData = useCallback((updater) => {
    const nextPlayers = typeof updater === "function"
      ? updater(PlayerRef.current || [])
      : updater || [];
    PlayerRef.current = nextPlayers;
    if (SourcePlayerRef.current) {
      replaceScenario(activeScenarioIdRef.current, {
        playerOverrides: collectOverrides(nextPlayers, SourcePlayerRef.current, PLAYER_OVERRIDE_FIELDS, playerRowKey),
      });
    }
    setDataVersion((version) => version + 1);
  }, [replaceScenario]);

  const updateTeamData = useCallback((updater) => {
    const nextTeams = typeof updater === "function"
      ? updater(TeamRef.current || [])
      : updater || [];
    TeamRef.current = nextTeams;
    if (!FixturesRef.current) {
      FixturesRef.current = buildFixturesFromTeamRows(nextTeams, FixturesConfigRef.current);
      setFixturesVersion((version) => version + 1);
    }
    if (SourceTeamRef.current) {
      replaceScenario(activeScenarioIdRef.current, {
        teamOverrides: collectOverrides(nextTeams, SourceTeamRef.current, TEAM_OVERRIDE_FIELDS, teamRowKey),
      });
    }
    PlayerRef.current = buildStablePlayerCalcs(PlayerRef.current || [], nextTeams, FixturesRef.current || []);
    setDataVersion((version) => version + 1);
    setTeamVersion((version) => version + 1);
  }, [replaceScenario]);

  const updateChanges = useCallback((updater) => {
    ChangesRef.current = typeof updater === "function" ? updater(ChangesRef.current || []) : updater || [];
    setChangesVersion((version) => version + 1);
    setDataVersion((version) => version + 1);
  }, []);

  const persistFixtureOverrides = useCallback((fixtures) => {
    const sourceById = new Map((SourceFixturesRef.current || []).map((fixture) => [fixture.id, fixture]));
    const fixtureOverrides = {};
    (fixtures || []).forEach((fixture) => {
      const source = sourceById.get(fixture.id);
      if (!source || !valuesEqual(fixture.options, source.options)) {
        fixtureOverrides[fixture.id] = { options: cloneJson(fixture.options || []) };
      }
    });
    replaceScenario(activeScenarioIdRef.current, { fixtureOverrides });
  }, [replaceScenario]);

  const setFixtures = useCallback((next) => {
    const fixtures = next || [];
    FixturesRef.current = fixtures;
    persistFixtureOverrides(fixtures);
    PlayerRef.current = buildStablePlayerCalcs(PlayerRef.current || [], TeamRef.current || [], fixtures);
    setFixturesVersion((version) => version + 1);
    setDataVersion((version) => version + 1);
  }, [persistFixtureOverrides]);

  const updateFixture = useCallback((fixtureId, updater) => {
    const prev = FixturesRef.current || [];
    const idx = prev.findIndex((fixture) => fixture.id === fixtureId);
    if (idx === -1) return;
    const clone = [...prev];
    clone[idx] = typeof updater === "function" ? updater(clone[idx]) : updater;
    FixturesRef.current = clone;
    persistFixtureOverrides(clone);
    PlayerRef.current = buildStablePlayerCalcs(PlayerRef.current || [], TeamRef.current || [], clone);
    setFixturesVersion((version) => version + 1);
    setDataVersion((version) => version + 1);
  }, [persistFixtureOverrides]);

  const normalizeFixtureProbabilities = useCallback((fixtureId) => {
    updateFixture(fixtureId, (fixture) => {
      const options = (fixture.options || []).map((option) => ({ gw: Number(option.gw), p: Number(option.p) }));
      const sum = options.reduce((acc, option) => acc + (Number.isFinite(option.p) ? option.p : 0), 0);
      return {
        ...fixture,
        options: sum <= 0
          ? options.map((option, index) => ({ ...option, p: index === 0 ? 1 : 0 }))
          : options.map((option) => ({ ...option, p: option.p / sum })),
      };
    });
  }, [updateFixture]);

  const switchScenario = useCallback((id) => {
    if (!scenariosRef.current.some((scenario) => scenario.id === id)) return false;
    const snapshot = materializeScenario(id);
    persistScenarioStore(scenariosRef.current, id);
    applyMaterializedScenario(snapshot);
    return true;
  }, [applyMaterializedScenario, materializeScenario, persistScenarioStore]);

  const createScenario = useCallback((name) => {
    const id = `scenario_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const base = scenarioById(BASE_SCENARIO_ID) || emptyBaseScenario();
    const nextScenario = {
      ...cloneJson(base),
      id,
      name: String(name || "").trim().slice(0, 60) || `Scenario ${scenariosRef.current.length}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...scenariosRef.current, nextScenario];
    persistScenarioStore(next, id);
    applyMaterializedScenario(materializeScenario(id));
    return id;
  }, [applyMaterializedScenario, materializeScenario, persistScenarioStore, scenarioById]);

  const renameScenario = useCallback((id, name) => {
    const cleanName = String(name || "").trim().slice(0, 60);
    if (!cleanName || id === BASE_SCENARIO_ID) return false;
    replaceScenario(id, { name: cleanName });
    return true;
  }, [replaceScenario]);

  const deleteScenario = useCallback((id) => {
    if (id === BASE_SCENARIO_ID) return false;
    const wasActive = activeScenarioIdRef.current === id;
    const next = scenariosRef.current.filter((scenario) => scenario.id !== id);
    const nextActive = wasActive ? BASE_SCENARIO_ID : activeScenarioIdRef.current;
    persistScenarioStore(next, nextActive);
    if (wasActive) {
      applyMaterializedScenario(materializeScenario(nextActive));
    }
    return true;
  }, [applyMaterializedScenario, materializeScenario, persistScenarioStore]);

  const resetActiveScenario = useCallback(() => {
    replaceScenario(activeScenarioIdRef.current, {
      playerOverrides: {},
      teamOverrides: {},
      fixtureOverrides: {},
    });
    applyMaterializedScenario(materializeScenario(activeScenarioIdRef.current));
  }, [applyMaterializedScenario, materializeScenario, replaceScenario]);

  const getScenarioPlayerData = useCallback((id) => materializeScenario(id)?.players || [], [materializeScenario]);

  const trackAdjustmentChanges = useCallback(
    async (source, changes) => {
      if (!Array.isArray(changes) || changes.length === 0) return false;
      try {
        const headers = { "Content-Type": "application/json", ...authHeaders };
        const resp = await fetch(`${API_BASE_URL}/analytics/adjustment-change`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            source,
            changes,
            guest_id: guestTrackingId || undefined,
          }),
          keepalive: true,
        });
        return Boolean(resp?.ok);
      } catch {
        return false;
      }
    },
    [authHeaders, guestTrackingId]
  );

  // Keep statistical model available without requiring a manual first navigation.
  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

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
        scenarioVersion,

        // browser-local scenarios
        scenarios,
        activeScenarioId,
        switchScenario,
        createScenario,
        renameScenario,
        deleteScenario,
        resetActiveScenario,
        getScenarioPlayerData,

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
        trackAdjustmentChanges,
      }}
    >
      {children}
    </AdjustmentContext.Provider>
  );
}
