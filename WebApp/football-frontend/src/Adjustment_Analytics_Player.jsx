import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

const FILTERS_STORAGE_KEY = "player_adjustments_filters_v2";

const MEASURE_LABELS = {
  Points: "Predicted Points",
  Goal_Scored: "Predicted Goals",
  Assists: "Predicted Assists",
  Avg_Minutes: "Predicted Minutes",
  CBI_Predictions: "Predicted CBI",
};

/** Simple reusable searchable multi-select dropdown */
function SearchableMultiSelect({
  label,
  options, // [{ value, label }]
  selectedValues,
  onChange,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const term = search.toLowerCase();
    return options.filter((opt) => {
      const labelStr = (opt.label ?? "").toString().toLowerCase();
      const valueStr = (opt.value ?? "").toString().toLowerCase();
      return labelStr.includes(term) || valueStr.includes(term);
    });
  }, [options, search]);

  const toggleValue = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleSelectAll = () => {
    onChange(options.map((o) => o.value));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedLabel =
    selectedValues.length === 0 ? "All" : `${selectedValues.length} selected`;

  return (
    <div style={{ position: "relative" }}>
      <label
        style={{
          display: "block",
          fontWeight: 600,
          marginBottom: "0.25rem",
          color: PALETTE.beige,
        }}
      >
        {label}
      </label>
      <div
        onClick={() => setIsOpen((p) => !p)}
        style={{
          padding: "0.4rem 0.6rem",
          borderRadius: "0.375rem",
          border: `1px solid ${PALETTE.gold}`,
          background:
            "linear-gradient(135deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
          color: PALETTE.beige,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          fontSize: "0.875rem",
        }}
      >
        <span>{selectedLabel}</span>
        <span style={{ opacity: 0.9 }}>▾</span>
      </div>
      {isOpen && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: "0.25rem",
            width: "100%",
            maxHeight: "260px",
            overflow: "auto",
            borderRadius: "0.5rem",
            border: `1px solid ${PALETTE.gold}`,
            backgroundColor: PALETTE.black,
            boxShadow: "0 14px 30px rgba(0,0,0,0.9)",
          }}
        >
          <div style={{ padding: "0.4rem 0.6rem" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%",
                padding: "0.35rem 0.5rem",
                borderRadius: "0.375rem",
                border: `1px solid ${PALETTE.gold}`,
                backgroundColor: PALETTE.black,
                color: PALETTE.beige,
                fontSize: "0.8rem",
              }}
            />
            <div
              style={{
                marginTop: "0.35rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.35rem",
                fontSize: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  flex: 1,
                  padding: "0.2rem 0.35rem",
                  borderRadius: "999px",
                  border: `1px solid ${PALETTE.gold}`,
                  background: "rgba(0,0,0,0.9)",
                  color: PALETTE.beige,
                  cursor: "pointer",
                }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  flex: 1,
                  padding: "0.2rem 0.35rem",
                  borderRadius: "999px",
                  border: "1px solid #4b5563",
                  background: "rgba(0,0,0,0.9)",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div
            style={{
              padding: "0.25rem 0.35rem 0.4rem",
              fontSize: "0.8rem",
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: "0.3rem 0.4rem",
                  color: "#9ca3af",
                }}
              >
                No matches
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const value = opt.value;
                const checked = selectedValues.includes(value);
                return (
                  <label
                    key={value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.25rem 0.4rem",
                      cursor: "pointer",
                      borderRadius: "0.375rem",
                      color: PALETTE.beige,
                      backgroundColor: checked
                        ? "rgba(184,134,11,0.25)"
                        : "transparent",
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(value)}
                      style={{
                        margin: 0,
                        accentColor: PALETTE.gold,
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Page using AdjustmentDataProvider
 */
export default function PlayerAdjustmentsPage() {
  const {
    fetchIfNeeded,
    loading,
    Teamdata,
    Playerdata,
    dataVersion,
    teamVersion, 
    changes,
    updateChanges,
    changesVersion,
    updatePlayerData,
  } = useAdjustmentData();

  const [playersState, setPlayersState] = useState(null); // saved copy
  const [teamsState, setTeamsState] = useState(null);
  const [hasHydratedFromContext, setHasHydratedFromContext] =
    useState(false);
  const [hasInitialContextSync, setHasInitialContextSync] = useState(false);


  const [selectedMeasure, setSelectedMeasure] =
    useState("Points"); // default: Predicted Points

  const [selectedPlayerNames, setSelectedPlayerNames] = useState([]);
  const [selectedTeamCodes, setSelectedTeamCodes] = useState([]);
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [valueThreshold, setValueThreshold] = useState(null);

  const [sortConfig, setSortConfig] = useState({
    type: null, // "gw" | "total" | null
    gw: null,
    direction: "desc",
  });

  // Modal state
  const [activePlayerKey, setActivePlayerKey] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local unsaved draft for shares (per active player)
  const [pendingGoalShare, setPendingGoalShare] = useState(null);
  const [pendingAssistShare, setPendingAssistShare] = useState(null);

  // Local unsaved draft for minutes (per active player, per GW)
  const [minutesDraft, setMinutesDraft] = useState({}); // { [gw]: minutes }

  // Baseline snapshot of active player rows (for modal only)
  const [modalBaselineRows, setModalBaselineRows] = useState([]);

  // For line-chart drag (minutes)
  const svgRefMinutes = useRef(null);
  const svgRefPoints = useRef(null);
  const [draggingGW, setDraggingGW] = useState(null);
  const dragGWRef = useRef(null);

  const [filtersHydrated, setFiltersHydrated] = useState(false);

  const adjustments = useMemo(
    () => (changes?.current ? changes.current : []),
    [changes, changesVersion]
  );

  const MIN_MINUTES = 0;
  const MAX_MINUTES = 90;

  const getPlayerKey = (p) =>
    p.name || `${p.web_name || "unknown"}_${p.Team || "NA"}`;

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  // 🔁 Hydrate from context ONCE per load/reset (prevents constant overwrites)
  useEffect(() => {
    if (hasHydratedFromContext) return;

    if (Teamdata?.current) {
      setTeamsState([...Teamdata.current]);
    }
    if (Playerdata?.current) {
      setPlayersState([...Playerdata.current]);
    }

    if (Teamdata?.current || Playerdata?.current) {
      setHasHydratedFromContext(true);
    }
  }, [Teamdata, Playerdata, dataVersion, hasHydratedFromContext]);

  useEffect(() => {
  if (!Teamdata?.current) return;
  // don’t touch playersState (we don't want to blow away pending share changes)
  setTeamsState([...Teamdata.current]);
}, [teamVersion, Teamdata]);

  const isDataReady =
    hasHydratedFromContext &&
    Array.isArray(playersState) &&
    Array.isArray(teamsState) &&
    !loading;

  // Build team lookups
  const { teamLookup, teamNamesByCode } = useMemo(() => {
    const lookup = new Map();
    const names = new Map();

    if (teamsState) {
      teamsState.forEach((t) => {
        const code = String(t.team_code);
        const key = `${code}_${t.GW}`;
        lookup.set(key, t);
        if (!names.has(code)) {
          names.set(code, t.team_name);
        }
      });
    }
    return { teamLookup: lookup, teamNamesByCode: names };
  }, [teamsState]);

  const allGWs = useMemo(() => {
    if (!playersState) return [];
    const set = new Set();
    playersState.forEach((p) => set.add(p.GW));
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [playersState]);

  const allPositions = useMemo(() => {
    if (!playersState) return [];
    const set = new Set();
    playersState.forEach((p) => set.add(p.position));
    return Array.from(set);
  }, [playersState]);

  function computeMeasures(playerRow, teamRow) {
    const avgMinRaw = Number(playerRow.average_minutes) || 0;
    const avgMin = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, avgMinRaw));

    const goalShare = Number(playerRow.Goal_share) || 0;
    const assistShare = Number(playerRow.Assist_share) || 0;
    const penData = Number(playerRow.Pen_data) || 0;
    const cbi = Number(playerRow.CBI_Percent) || 0;
    const bps = Number(playerRow.BPS) || 0;
    const goalFactor = Number(playerRow.Goal_factor) || 0;
    const assistFactor = Number(playerRow.Assist_factor) || 0;
    const csFactor = Number(playerRow.CS_factor) || 0;
    const defaultPoints = Number(playerRow.default_points) || 0;

    const xg = teamRow ? Number(teamRow.XG) || 0 : 0;
    const cs = teamRow ? Number(teamRow.CS) || 0 : 0;

    const minutesAdj = avgMin ? Math.min(1, avgMin / 80) : 0;

    const goalScored = (goalShare * xg * 1.1 + penData*0.7) * minutesAdj;
    const assists = assistShare * xg * 1.1 * minutesAdj;
    const points =
      defaultPoints * minutesAdj +
      goalScored * goalFactor +
      assists * assistFactor +
      cs * csFactor * minutesAdj +
      bps * minutesAdj +
      cbi * 1.5 * minutesAdj;

    const avgMinutes = avgMin;
    const cbiPredictions = cbi * minutesAdj;

    return {
      Goal_Scored: goalScored,
      Assists: assists,
      Points: points,
      Avg_Minutes: avgMinutes,
      CBI_Predictions: cbiPredictions,
    };
  }
useEffect(() => {
  if (!isDataReady) return;
  if (!playersState || !teamsState) return;
  if (hasInitialContextSync) return;

  // Wait 1 animation frame so React finishes painting the table
  requestAnimationFrame(() => {
    // Build local team lookup
    const localTeamLookup = new Map();
    teamsState.forEach((t) => {
      const code = String(t.team_code);
      const key = `${code}_${t.GW}`;
      localTeamLookup.set(key, t);
    });

    // Recalculate points BEFORE loading into context
    const updated = playersState.map((row) => {
      const teamCode = String(row.Team);
      const key = `${teamCode}_${row.GW}`;
      const teamRow = localTeamLookup.get(key);
      const measures = computeMeasures(row, teamRow);
      return { ...row, calc_points: measures.Points };
    });

    updatePlayerData(() => updated);
    setHasInitialContextSync(true);
  });
}, [isDataReady, playersState, teamsState, computeMeasures, updatePlayerData, hasInitialContextSync]);
  // 🔁 Sync into context only when saved data changes
  useEffect(() => {
    if (!playersState || !teamsState) return;

    const timeoutId = setTimeout(() => {
      const teamLookupLocal = new Map();
      teamsState.forEach((t) => {
        const code = String(t.team_code);
        const key = `${code}_${t.GW}`;
        teamLookupLocal.set(key, t);
      });

      const updated = playersState.map((row) => {
        const teamCode = String(row.Team);
        const key = `${teamCode}_${row.GW}`;
        const teamRow = teamLookupLocal.get(key);
        const measures = computeMeasures(row, teamRow);
        return { ...row, calc_points: measures.Points };
      });

      updatePlayerData(() => updated);
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [playersState, teamsState, updatePlayerData]);

  /**
 * Sync the recalculated playersState back into context *once*
 * AFTER:
 *   - Data has hydrated
 *   - computeMeasures has run
 *   - The table has rendered at least once
 */



  // Pivot + table data (uses saved playersState)
  const {
    playerTableRows,
    globalMinValue,
    globalMaxValue,
    allTeamOptions,
  } = useMemo(() => {
    if (!playersState || !teamsState) {
      return {
        playerTableRows: [],
        globalMinValue: 0,
        globalMaxValue: 150,
        allTeamOptions: [],
      };
    }

    const playerMap = new Map();

    playersState.forEach((p) => {
      const key = getPlayerKey(p);
      if (!key) return;

      const teamCode = String(p.Team);
      const teamName = teamNamesByCode.get(teamCode) || "";
      const displayName = p.web_name || p.name || key;

      if (!playerMap.has(key)) {
        playerMap.set(key, {
          nameKey: key,
          displayName,
          name: p.name,
          web_name: p.web_name,
          position: p.position,
          teamCode,
          teamName,
          value: Number(p.value) || 0,
          rowsByGW: new Map(),
        });
      }
      const entry = playerMap.get(key);
      entry.rowsByGW.set(p.GW, p);
    });

    const tableRows = [];
    let minValue = Infinity;
    let maxValue = -Infinity;

    playerMap.forEach((entry) => {
      const gwValues = {};
      let totalMeasure = 0;

      allGWs.forEach((gw) => {
        const playerRow = entry.rowsByGW.get(gw);
        if (!playerRow) {
          gwValues[gw] = null;
          return;
        }
        const teamRow = teamLookup.get(`${entry.teamCode}_${gw}`);
        const measures = computeMeasures(playerRow, teamRow);
        const v = measures[selectedMeasure];
        gwValues[gw] = v;
        if (typeof v === "number" && !Number.isNaN(v)) {
          totalMeasure += v;
        }
      });

      const value = entry.value;
      if (!Number.isNaN(value)) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }

      tableRows.push({
        ...entry,
        gwValues,
        totalMeasure,
      });
    });

    if (minValue === Infinity) minValue = 0;
    if (maxValue === -Infinity) maxValue = 150;

    const teamOptions = Array.from(teamNamesByCode.entries()).map(
      ([code, name]) => ({ code, name })
    );

    return {
      playerTableRows: tableRows,
      globalMinValue: minValue,
      globalMaxValue: maxValue,
      allTeamOptions: teamOptions,
    };
  }, [
    playersState,
    teamsState,
    allGWs,
    selectedMeasure,
    teamLookup,
    teamNamesByCode,
  ]);

  // Init value slider
  useEffect(() => {
    if (
      globalMinValue != null &&
      globalMaxValue != null &&
      valueThreshold === null
    ) {
      setValueThreshold(globalMaxValue);
    }
  }, [globalMinValue, globalMaxValue, valueThreshold]);

  // Hydrate filters from localStorage
  useEffect(() => {
    if (!isDataReady || filtersHydrated) return;
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.selectedMeasure) {
          setSelectedMeasure(parsed.selectedMeasure);
        }
        if (Array.isArray(parsed.selectedPlayerNames)) {
          setSelectedPlayerNames(parsed.selectedPlayerNames);
        }
        if (Array.isArray(parsed.selectedTeamCodes)) {
          setSelectedTeamCodes(parsed.selectedTeamCodes);
        }
        if (Array.isArray(parsed.selectedPositions)) {
          setSelectedPositions(parsed.selectedPositions);
        }
        if (
          typeof parsed.valueThreshold === "number" &&
          !Number.isNaN(parsed.valueThreshold)
        ) {
          setValueThreshold(parsed.valueThreshold);
        }
        if (parsed.sortConfig) {
          setSortConfig(parsed.sortConfig);
        }
      }
    } catch {
      // ignore
    } finally {
      setFiltersHydrated(true);
    }
  }, [isDataReady, filtersHydrated]);

  // Persist filters
  useEffect(() => {
    if (!isDataReady || !filtersHydrated) return;
    if (typeof window === "undefined") return;

    const payload = {
      selectedMeasure,
      selectedPlayerNames,
      selectedTeamCodes,
      selectedPositions,
      valueThreshold,
      sortConfig,
    };
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    isDataReady,
    filtersHydrated,
    selectedMeasure,
    selectedPlayerNames,
    selectedTeamCodes,
    selectedPositions,
    valueThreshold,
    sortConfig,
  ]);

  // Filtering + sorting
  const filteredPlayerRows = useMemo(() => {
    let rows = playerTableRows;

    if (selectedPlayerNames.length > 0) {
      const set = new Set(selectedPlayerNames);
      rows = rows.filter((r) => set.has(r.nameKey));
    }

    if (selectedTeamCodes.length > 0) {
      const set = new Set(selectedTeamCodes);
      rows = rows.filter((r) => set.has(r.teamCode));
    }

    if (selectedPositions.length > 0) {
      const set = new Set(selectedPositions);
      rows = rows.filter((r) => set.has(r.position));
    }

    const threshold =
      valueThreshold != null ? valueThreshold : globalMaxValue;
    if (threshold != null && !Number.isNaN(threshold)) {
      rows = rows.filter((r) => r.value <= threshold);
    }

    if (sortConfig.type === "gw" && sortConfig.gw != null) {
      const gwKey = sortConfig.gw;
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va =
          typeof a.gwValues[gwKey] === "number" ? a.gwValues[gwKey] : -Infinity;
        const vb =
          typeof b.gwValues[gwKey] === "number" ? b.gwValues[gwKey] : -Infinity;
        if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
        if (Number.isNaN(va)) return 1;
        if (Number.isNaN(vb)) return -1;
        if (dir === "asc") return va - vb;
        return vb - va;
      });
    } else if (sortConfig.type === "total") {
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va =
          typeof a.totalMeasure === "number" ? a.totalMeasure : -Infinity;
        const vb =
          typeof b.totalMeasure === "number" ? b.totalMeasure : -Infinity;
        if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
        if (Number.isNaN(va)) return 1;
        if (Number.isNaN(vb)) return -1;
        if (dir === "asc") return va - vb;
        return vb - va;
      });
    }

    return rows;
  }, [
    playerTableRows,
    selectedPlayerNames,
    selectedTeamCodes,
    selectedPositions,
    valueThreshold,
    globalMaxValue,
    sortConfig,
  ]);

  const handleSortByGW = (gw) => {
    setSortConfig((prev) => {
      if (prev.type === "gw" && prev.gw === gw) {
        return {
          type: "gw",
          gw,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { type: "gw", gw, direction: "desc" };
    });
  };

  const handleSortByTotal = () => {
    setSortConfig((prev) => {
      if (prev.type === "total") {
        return {
          type: "total",
          gw: null,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { type: "total", gw: null, direction: "desc" };
    });
  };

  const handleResetData = async () => {
    if (Teamdata) Teamdata.current = null;
    if (Playerdata) Playerdata.current = null;

    setTeamsState(null);
    setPlayersState(null);
    setSortConfig({ type: null, gw: null, direction: "desc" });
    updateChanges([]);
    setHasHydratedFromContext(false); // allow fresh hydrate

    await fetchIfNeeded();
  };

  // Modal helpers
  const openPlayerModal = (nameKey) => {
    setActivePlayerKey(nameKey);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActivePlayerKey(null);
    setDraggingGW(null);
    dragGWRef.current = null;
    setPendingGoalShare(null);
    setPendingAssistShare(null);
    setMinutesDraft({});
    setModalBaselineRows([]);
  };

  // Derived: first row from modal baseline
  const activePlayerFirstRow =
    modalBaselineRows.length > 0 ? modalBaselineRows[0] : null;

  // Snapshot baseline rows when modal opens (once per open)
  useEffect(() => {
    if (!isModalOpen || !activePlayerKey || !playersState) {
      setModalBaselineRows([]);
      setPendingGoalShare(null);
      setPendingAssistShare(null);
      setMinutesDraft({});
      return;
    }

    const rows = playersState
      .filter((p) => getPlayerKey(p) === activePlayerKey)
      .sort((a, b) => Number(a.GW) - Number(b.GW))
      .map((r) => ({ ...r }));

    setModalBaselineRows(rows);

    const first = rows[0];
    if (first) {
      setPendingGoalShare(Number(first.Goal_share) || 0);
      setPendingAssistShare(Number(first.Assist_share) || 0);

      const draft = {};
      rows.forEach((row) => {
        draft[row.GW] = Math.max(
          MIN_MINUTES,
          Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
        );
      });
      setMinutesDraft(draft);
    } else {
      setPendingGoalShare(null);
      setPendingAssistShare(null);
      setMinutesDraft({});
    }
  }, [isModalOpen, activePlayerKey, playersState]);

  // Minutes chart data (local)
  const chartDataMinutes = useMemo(() => {
    if (!modalBaselineRows || modalBaselineRows.length === 0) {
      return [];
    }
    return modalBaselineRows.map((row) => {
      const original = Math.max(
        MIN_MINUTES,
        Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
      );
      const minutes = minutesDraft[row.GW] ?? original;
      return {
        GW: row.GW,
        minutes,
      };
    });
  }, [modalBaselineRows, minutesDraft]);

  // Points chart data (local predicted)
  const chartDataPoints = useMemo(() => {
    if (!modalBaselineRows || modalBaselineRows.length === 0) {
      return [];
    }

    return modalBaselineRows.map((row) => {
      const teamCode = String(row.Team);
      const teamRow = teamLookup.get(`${teamCode}_${row.GW}`);

      const overrideMinutes = minutesDraft[row.GW];

      const effectiveRow = {
        ...row,
        average_minutes:
          overrideMinutes != null ? overrideMinutes : row.average_minutes,
        Goal_share:
          pendingGoalShare != null ? pendingGoalShare : row.Goal_share,
        Assist_share:
          pendingAssistShare != null ? pendingAssistShare : row.Assist_share,
      };

      const measures = computeMeasures(effectiveRow, teamRow);
      return { GW: row.GW, points: measures.Points };
    });
  }, [
    modalBaselineRows,
    teamLookup,
    minutesDraft,
    pendingGoalShare,
    pendingAssistShare,
  ]);

  const logAdjustment = (entry) => {
    updateChanges((prev) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        ...entry,
      },
      ...(prev || []),
    ]);
  };

  const formatAdjustmentValue = (a, field) => {
    const v = a[field];
    if (typeof v !== "number") return v;
    if (a.type === "Minutes") return v.toFixed(0);
    return v.toFixed(2);
  };

  const displayAdjustments = useMemo(() => {
    const map = new Map();
    (adjustments || []).forEach((a) => {
      const playerKey = a.playerKey || a.webName || a.playerName;
      const type = a.type || "Unknown";
      const key = `${playerKey}__${type}__${a.gw ?? "all"}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, a);
      } else {
        const prevTime = new Date(prev.timestamp).getTime();
        const currTime = new Date(a.timestamp).getTime();
        if (currTime > prevTime) {
          map.set(key, a);
        }
      }
    });
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [adjustments]);

  const hasPlayerChanges = useMemo(() => {
    if (!activePlayerFirstRow || !modalBaselineRows.length) return false;

    const oldGoal = Number(activePlayerFirstRow.Goal_share) || 0;
    const oldAssist = Number(activePlayerFirstRow.Assist_share) || 0;

    const newGoal = Number(pendingGoalShare ?? oldGoal);
    const newAssist = Number(pendingAssistShare ?? oldAssist);

    if (newGoal !== oldGoal) return true;
    if (newAssist !== oldAssist) return true;

    for (const row of modalBaselineRows) {
      const gw = row.GW;
      const oldMin = Math.max(
        MIN_MINUTES,
        Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
      );
      if (
        minutesDraft[gw] != null &&
        Number(minutesDraft[gw]) !== Number(oldMin)
      ) {
        return true;
      }
    }

    return false;
  }, [
    activePlayerFirstRow,
    modalBaselineRows,
    pendingGoalShare,
    pendingAssistShare,
    minutesDraft,
  ]);

  const handleSavePlayerChanges = () => {
    if (
      !activePlayerKey ||
      !playersState ||
      !activePlayerFirstRow ||
      !hasPlayerChanges
    )
      return;

    const baselineRows = modalBaselineRows;

    const oldGoal = Number(activePlayerFirstRow.Goal_share) || 0;
    const oldAssist = Number(activePlayerFirstRow.Assist_share) || 0;

    const newGoal = Number(pendingGoalShare ?? oldGoal);
    const newAssist = Number(pendingAssistShare ?? oldAssist);

    const adjustmentsToLog = [];

    if (newGoal !== oldGoal) {
      adjustmentsToLog.push({
        type: "Goal_share",
        playerKey: activePlayerKey,
        playerName: activePlayerFirstRow.name,
        webName: activePlayerFirstRow.web_name,
        oldValue: oldGoal,
        newValue: newGoal,
      });
    }

    if (newAssist !== oldAssist) {
      adjustmentsToLog.push({
        type: "Assist_share",
        playerKey: activePlayerKey,
        playerName: activePlayerFirstRow.name,
        webName: activePlayerFirstRow.web_name,
        oldValue: oldAssist,
        newValue: newAssist,
      });
    }

    baselineRows.forEach((row) => {
      const gw = row.GW;
      const oldMin = Math.max(
        MIN_MINUTES,
        Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
      );
      const draftVal = minutesDraft[gw];
      if (draftVal != null && Number(draftVal) !== Number(oldMin)) {
        adjustmentsToLog.push({
          type: "Minutes",
          playerKey: activePlayerKey,
          playerName: row.name,
          webName: row.web_name,
          gw,
          oldValue: oldMin,
          newValue: draftVal,
        });
      }
    });

    if (adjustmentsToLog.length === 0) return;

    setPlayersState((prev) => {
      if (!prev) return prev;
      return prev.map((p) => {
        if (getPlayerKey(p) !== activePlayerKey) return p;
        const gw = p.GW;
        const updated = { ...p };
        updated.Goal_share = newGoal;
        updated.Assist_share = newAssist;
        if (minutesDraft[gw] != null) {
          updated.average_minutes = minutesDraft[gw];
        }
        return updated;
      });
    });

    adjustmentsToLog.forEach(logAdjustment);
  };

  const handleSaveAndClose = () => {
    handleSavePlayerChanges();
    closeModal();
  };

  // Pointer / touch helpers for minutes drag (only minutesDraft)
  const updateMinutesFromClientY = (clientY) => {
    if (!svgRefMinutes.current || !activePlayerKey || !draggingGW) return;

    const svgRect = svgRefMinutes.current.getBoundingClientRect();
    const height = svgRect.height;
    const padding = 20;

    const y = clientY - svgRect.top;
    const clampedY = Math.max(padding, Math.min(height - padding, y));
    const ratio =
      (height - padding - clampedY) / (height - 2 * padding || 1);
    const minutes = MIN_MINUTES + ratio * (MAX_MINUTES - MIN_MINUTES);
    const rounded = Math.round(minutes);

    setMinutesDraft((prev) => ({
      ...prev,
      [dragGWRef.current]: rounded,
    }));
  };

  const handleCircleMouseDown = (gw, e) => {
    e.preventDefault();
    setDraggingGW(gw);
    dragGWRef.current = gw;
  };

  const handleCircleTouchStart = (gw, e) => {
    setDraggingGW(gw);
    dragGWRef.current = gw;
    if (e.touches && e.touches[0]) {
      updateMinutesFromClientY(e.touches[0].clientY);
    }
  };

  const handleSvgMouseMove = (e) => {
    if (!draggingGW) return;
    updateMinutesFromClientY(e.clientY);
  };

  const handleSvgTouchMove = (e) => {
    if (!draggingGW) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    updateMinutesFromClientY(touch.clientY);
  };

  const handleSvgMouseUp = () => {
    setDraggingGW(null);
    dragGWRef.current = null;
  };

  const handleSvgTouchEnd = () => {
    setDraggingGW(null);
    dragGWRef.current = null;
  };

  // Player options for filter
  const playerDisplayByKey = useMemo(() => {
    const m = new Map();
    playerTableRows.forEach((r) => {
      if (!m.has(r.nameKey)) {
        m.set(r.nameKey, r.displayName || r.web_name || r.nameKey);
      }
    });
    return m;
  }, [playerTableRows]);

  const playerOptions = useMemo(
    () =>
      Array.from(playerDisplayByKey.entries()).map(([key, label]) => ({
        value: key,
        label,
      })),
    [playerDisplayByKey]
  );

  const teamOptions = useMemo(
    () =>
      allTeamOptions.map((t) => ({
        value: String(t.code),
        label: t.name,
      })),
    [allTeamOptions]
  );

  const handleSelectAllPositions = () => {
    setSelectedPositions(allPositions);
  };

  const handleClearPositions = () => {
    setSelectedPositions([]);
  };

  if (!isDataReady) {
    return (
      <div
        style={{
          padding: "2rem",
          minHeight: "100vh",
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
        }}
      >
        Loading data…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        minHeight: "100vh",
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
            }}
          >
            Player Adjustment Tool
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "#d1c3a9",
            }}
          >
            Integrated with team predictions. Click a player and adjust
            minutes, Goal and Assist shares
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetData}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "999px",
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(135deg, rgba(0,0,0,0.9), rgba(90,0,0,0.95))",
            color: PALETTE.beige,
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <span>⟳</span>
          <span>Reset</span>
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Measure selector */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
            border: `1px solid ${PALETTE.gold}`,
          }}
        >
          <label
            style={{
              display: "block",
              fontWeight: 600,
              marginBottom: "0.25rem",
              fontSize: "0.85rem",
            }}
          >
            Measure
          </label>
          <select
            value={selectedMeasure}
            onChange={(e) => setSelectedMeasure(e.target.value)}
            style={{
              width: "100%",
              padding: "0.4rem 0.6rem",
              borderRadius: "0.5rem",
              border: `1px solid ${PALETTE.gold}`,
              backgroundColor: PALETTE.black,
              color: PALETTE.beige,
              fontSize: "0.9rem",
            }}
          >
            <option value="Points">{MEASURE_LABELS["Points"]}</option>
            <option value="Goal_Scored">{MEASURE_LABELS["Goal_Scored"]}</option>
            <option value="Assists">{MEASURE_LABELS["Assists"]}</option>
            <option value="Avg_Minutes">
              {MEASURE_LABELS["Avg_Minutes"]}
            </option>
            <option value="CBI_Predictions">
              {MEASURE_LABELS["CBI_Predictions"]}
            </option>
          </select>
        </div>

        {/* Player multi-select */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
            border: `1px solid ${PALETTE.gold}`,
          }}
        >
          <SearchableMultiSelect
            label="Players"
            options={playerOptions}
            selectedValues={selectedPlayerNames}
            onChange={setSelectedPlayerNames}
            placeholder="Search players..."
          />
        </div>

        {/* Team multi-select */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
            border: `1px solid ${PALETTE.gold}`,
          }}
        >
          <SearchableMultiSelect
            label="Teams"
            options={teamOptions}
            selectedValues={selectedTeamCodes}
            onChange={setSelectedTeamCodes}
            placeholder="Search teams..."
          />
        </div>

        {/* Position tiles */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
            border: `1px solid ${PALETTE.gold}`,
          }}
        >
          <label
            style={{
              display: "block",
              fontWeight: 600,
              marginBottom: "0.25rem",
              fontSize: "0.85rem",
            }}
          >
            Position
          </label>
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              marginTop: "0.25rem",
              marginBottom: "0.4rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleSelectAllPositions}
              style={{
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                border: `1px solid ${PALETTE.gold}`,
                background: "rgba(0,0,0,0.9)",
                color: PALETTE.beige,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClearPositions}
              style={{
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                border: "1px solid #4b5563",
                background: "rgba(0,0,0,0.9)",
                color: "#e5e7eb",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem",
              marginTop: "0.25rem",
            }}
          >
            {allPositions.map((pos) => {
              const active = selectedPositions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => {
                    setSelectedPositions((prev) =>
                      prev.includes(pos)
                        ? prev.filter((p) => p !== pos)
                        : [...prev, pos]
                    );
                  }}
                  style={{
                    padding: "0.25rem 0.6rem",
                    borderRadius: "999px",
                    border: `1px solid ${PALETTE.gold}`,
                    backgroundColor: active
                      ? PALETTE.gold
                      : "rgba(0,0,0,0.9)",
                    color: active ? PALETTE.black : PALETTE.beige,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {pos}
                </button>
              );
            })}
          </div>
        </div>

        {/* Value slider */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
            border: `1px solid ${PALETTE.gold}`,
          }}
        >
          <label
            style={{
              display: "block",
              fontWeight: 600,
              marginBottom: "0.25rem",
              fontSize: "0.85rem",
            }}
          >
            Max value filter
          </label>
          <input
            type="range"
            min={globalMinValue}
            max={globalMaxValue || globalMinValue + 1}
            step={(globalMaxValue - globalMinValue) / 100 || 1}
            value={
              valueThreshold != null ? valueThreshold : globalMaxValue
            }
            onChange={(e) => setValueThreshold(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div
            style={{
              fontSize: "0.8rem",
              marginTop: "0.25rem",
              color: "#d1c3a9",
            }}
          >
            {valueThreshold != null
              ? valueThreshold.toFixed(1)
              : globalMaxValue.toFixed(1)}{" "}
            (range {globalMinValue.toFixed(1)} –{" "}
            {globalMaxValue.toFixed(1)})
          </div>
        </div>
      </div>

      {/* Changes made dropdown */}
      <div style={{ marginBottom: "1.5rem" }}>
        <details
          style={{
            borderRadius: "0.75rem",
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
            boxShadow: "0 14px 30px rgba(0,0,0,0.9)",
          }}
        >
          <summary
            style={{
              listStyle: "none",
              padding: "0.6rem 0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            <span>
              Changes made{" "}
              <span
                style={{
                  marginLeft: "0.3rem",
                  fontWeight: 400,
                  fontSize: "0.8rem",
                  color: "#e5e7eb",
                }}
              >
                ({displayAdjustments.length})
              </span>
            </span>
            <span
              style={{
                fontSize: "1rem",
                opacity: 0.9,
              }}
            >
              ▾
            </span>
          </summary>
          <div
            style={{
              padding: "0.6rem 0.9rem 0.8rem",
              fontSize: "0.8rem",
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {displayAdjustments.length === 0 ? (
              <div style={{ color: "#9ca3af" }}>
                No manual adjustments yet.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {displayAdjustments.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      padding: "0.35rem 0.45rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "#111827",
                      border: "1px solid #1f2937",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: "0.1rem",
                      }}
                    >
                      {a.playerName} ({a.webName})
                    </div>
                    <div>
                      <span style={{ color: "#e5e7eb" }}>
                        {a.type === "Goal_share"
                          ? "Goal share"
                          : a.type === "Assist_share"
                          ? "Assist share"
                          : "Minutes"}
                        {a.gw != null ? ` · GW ${a.gw}` : ""}:{" "}
                      </span>
                      <span>
                        {formatAdjustmentValue(a, "oldValue")} →{" "}
                        <span style={{ color: PALETTE.gold }}>
                          {formatAdjustmentValue(a, "newValue")}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      {/* Data table (saved state only) */}
      <div
        style={{
          overflowX: "auto",
          borderRadius: "0.75rem",
          border: `1px solid ${PALETTE.gold}`,
          background:
            "linear-gradient(155deg, rgba(0,0,0,0.98), rgba(0,0,0,0.9))",
          boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: "750px",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  position: "sticky",
                  left: 0,
                  backgroundColor: "#111111",
                  zIndex: 2,
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Name
              </th>
              <th
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  backgroundColor: "#111111",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Position
              </th>
              <th
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  backgroundColor: "#111111",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Team
              </th>
              <th
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  backgroundColor: "#111111",
                  textAlign: "right",
                  fontWeight: 600,
                }}
              >
                Value
              </th>
              {allGWs.map((gw) => {
                const isSorted =
                  sortConfig.type === "gw" && sortConfig.gw === gw;
                const arrow =
                  isSorted && sortConfig.direction === "asc"
                    ? "▲"
                    : isSorted
                    ? "▼"
                    : "";
                return (
                  <th
                    key={gw}
                    onClick={() => handleSortByGW(gw)}
                    style={{
                      borderBottom: `1px solid ${PALETTE.gold}`,
                      padding: "0.5rem",
                      backgroundColor: "#111111",
                      textAlign: "right",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      color: isSorted ? PALETTE.gold : PALETTE.beige,
                    }}
                  >
                    GW {gw} {arrow && <span>{arrow}</span>}
                  </th>
                );
              })}
              <th
                onClick={handleSortByTotal}
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  backgroundColor: "#111111",
                  textAlign: "right",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  color:
                    sortConfig.type === "total"
                      ? PALETTE.gold
                      : PALETTE.beige,
                }}
              >
                Total{" "}
                {sortConfig.type === "total" &&
                  (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayerRows.map((row, idx) => (
              <tr
                key={row.nameKey}
                onClick={() => openPlayerModal(row.nameKey)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    idx % 2 === 0 ? "#080808" : "#151515",
                }}
              >
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "0.5rem",
                    position: "sticky",
                    left: 0,
                    backgroundColor:
                      idx % 2 === 0 ? "#080808" : "#151515",
                    zIndex: 1,
                    fontWeight: 600,
                  }}
                >
                  {row.displayName}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "0.5rem",
                  }}
                >
                  {row.position}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "0.5rem",
                  }}
                >
                  {row.teamName}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "0.5rem",
                    textAlign: "right",
                  }}
                >
                  {row.value != null && !Number.isNaN(row.value)
                    ? row.value.toFixed(1)
                    : "-"}
                </td>
                {allGWs.map((gw) => (
                  <td
                    key={gw}
                    style={{
                      borderBottom: "1px solid #222222",
                      padding: "0.5rem",
                      textAlign: "right",
                    }}
                  >
                    {row.gwValues[gw] != null &&
                    !Number.isNaN(row.gwValues[gw])
                      ? row.gwValues[gw].toFixed(2)
                      : "-"}
                  </td>
                ))}
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "0.5rem",
                    textAlign: "right",
                    fontWeight: 600,
                    color: PALETTE.gold,
                  }}
                >
                  {row.totalMeasure != null &&
                  !Number.isNaN(row.totalMeasure)
                    ? row.totalMeasure.toFixed(2)
                    : "-"}
                </td>
              </tr>
            ))}
            {filteredPlayerRows.length === 0 && (
              <tr>
                <td
                  colSpan={4 + allGWs.length}
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    color: "#d1c3a9",
                  }}
                >
                  No players match current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && activePlayerFirstRow && (
        <div
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onTouchMove={handleSvgTouchMove}
          onTouchEnd={handleSvgTouchEnd}
          onTouchCancel={handleSvgTouchEnd}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black} 60%)`,
              padding: "1rem 1.2rem",
              borderRadius: "0.9rem",
              width: "min(800px, 95vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              color: PALETTE.beige,
              border: `1px solid ${PALETTE.gold}`,
              boxShadow: "0 22px 50px rgba(0,0,0,0.95)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    fontWeight: 600,
                  }}
                >
                  {activePlayerFirstRow.name} (
                  {activePlayerFirstRow.web_name})
                </h2>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#d1c3a9",
                    marginTop: "0.1rem",
                  }}
                >
                  {activePlayerFirstRow.position}
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  color: PALETTE.beige,
                }}
              >
                ✕
              </button>
            </div>

            {/* Shares sliders */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(0, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  padding: "0.6rem 0.75rem",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: `1px solid ${PALETTE.gold}`,
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                    fontSize: "0.85rem",
                  }}
                >
                  Goal Share
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pendingGoalShare ?? 0}
                  onChange={(e) =>
                    setPendingGoalShare(Number(e.target.value))
                  }
                  style={{
                    width: "100%",
                    touchAction: "pan-y",
                  }}
                />
                <div
                  style={{
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                    color: "#d1c3a9",
                  }}
                >
                  {(pendingGoalShare ?? 0).toFixed(2)}
                </div>
              </div>
              <div
                style={{
                  padding: "0.6rem 0.75rem",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: `1px solid ${PALETTE.gold}`,
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                    fontSize: "0.85rem",
                  }}
                >
                  Assist Share
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pendingAssistShare ?? 0}
                  onChange={(e) =>
                    setPendingAssistShare(Number(e.target.value))
                  }
                  style={{
                    width: "100%",
                    touchAction: "pan-y",
                  }}
                />
                <div
                  style={{
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                    color: "#d1c3a9",
                  }}
                >
                  {(pendingAssistShare ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Save button */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={!hasPlayerChanges}
                style={{
                  padding: "0.4rem 0.9rem",
                  borderRadius: "999px",
                  border: `1px solid ${PALETTE.gold}`,
                  background:
                    "linear-gradient(135deg, rgba(0,0,0,0.9), rgba(90,0,0,0.95))",
                  color: PALETTE.beige,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  cursor: hasPlayerChanges ? "pointer" : "not-allowed",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
                  opacity: hasPlayerChanges ? 1 : 0.5,
                }}
              >
                Save changes
              </button>
            </div>

            {/* Minutes chart */}
            <div style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.4rem",
                  fontSize: "0.95rem",
                }}
              >
                Predicted minutes per GW (drag dots to adjust)
              </h3>
              {chartDataMinutes.length === 0 ? (
                <div style={{ fontSize: "0.85rem" }}>
                  No minute data for this player.
                </div>
              ) : (
                <svg
                  ref={svgRefMinutes}
                  width="100%"
                  height="280"
                  style={{
                    border: `1px solid ${PALETTE.gold}`,
                    borderRadius: "0.75rem",
                    background: "#000000",
                    touchAction: "none",
                  }}
                >
                  {(() => {
                    const padding = 20;
                    const width = svgRefMinutes.current
                      ? svgRefMinutes.current.getBoundingClientRect()
                          .width
                      : 600;
                    const height = 280;

                    const n = chartDataMinutes.length;
                    const points = chartDataMinutes.map((d, i) => {
                      const x =
                        padding +
                        (n === 1
                          ? (width - 2 * padding) / 2
                          : (i / (n - 1)) *
                            (width - 2 * padding));
                      const ratio =
                        (d.minutes - MIN_MINUTES) /
                        (MAX_MINUTES - MIN_MINUTES || 1);
                      const y =
                        height -
                        padding -
                        ratio * (height - 2 * padding);
                      return { x, y, gw: d.GW, minutes: d.minutes };
                    });

                    const polyPoints = points
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ");

                    return (
                      <>
                        <text
                          x={padding}
                          y={12}
                          fontSize="10"
                          fill="#d1c3a9"
                        >
                          Minutes
                        </text>
                        <text
                          x={width - padding}
                          y={height - 5}
                          textAnchor="end"
                          fontSize="10"
                          fill="#d1c3a9"
                        >
                          GW
                        </text>

                        {points.map((p, idx) => (
                          <g key={`tick-min-${p.gw}-${idx}`}>
                            <line
                              x1={p.x}
                              y1={height - padding}
                              x2={p.x}
                              y2={height - padding + 4}
                              stroke="#555555"
                              strokeWidth="1"
                            />
                            <text
                              x={p.x}
                              y={height - 5}
                              fontSize="9"
                              textAnchor="middle"
                              fill="#d1c3a9"
                            >
                              {p.gw}
                            </text>
                          </g>
                        ))}

                        <polyline
                          points={polyPoints}
                          fill="none"
                          stroke={PALETTE.gold}
                          strokeWidth="2"
                        />

                        {points.map((p) => (
                          <g key={`pt-min-${p.gw}`}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={12}
                              fill={
                                draggingGW === p.gw
                                  ? PALETTE.red
                                  : PALETTE.gold
                              }
                              stroke={PALETTE.black}
                              strokeWidth="2"
                              style={{ cursor: "ns-resize" }}
                              onMouseDown={(e) =>
                                handleCircleMouseDown(p.gw, e)
                              }
                              onTouchStart={(e) =>
                                handleCircleTouchStart(p.gw, e)
                              }
                            />
                            <text
                              x={p.x}
                              y={p.y - 12}
                              fontSize="9"
                              textAnchor="middle"
                              fill={PALETTE.beige}
                            >
                              {Number(p.minutes).toFixed(0)}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>

            {/* Points chart */}
            <div>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.4rem",
                  fontSize: "0.95rem",
                }}
              >
                Calculated Points
              </h3>
              {chartDataPoints.length === 0 ? (
                <div style={{ fontSize: "0.85rem" }}>
                  No point data for this player.
                </div>
              ) : (
                <svg
                  ref={svgRefPoints}
                  width="100%"
                  height="250"
                  style={{
                    border: `1px solid ${PALETTE.gold}`,
                    borderRadius: "0.75rem",
                    background: "#000000",
                  }}
                >
                  {(() => {
                    const padding = 20;
                    const width = svgRefPoints.current
                      ? svgRefPoints.current.getBoundingClientRect()
                          .width
                      : 600;
                    const height = 250;

                    const n = chartDataPoints.length;
                    const vals = chartDataPoints.map((d) => d.points);
                    const minP = vals.length > 0 ? Math.min(...vals) : 0;
                    const maxP = vals.length > 0 ? Math.max(...vals) : 1;
                    const range = maxP - minP || 1;

                    const points = chartDataPoints.map((d, i) => {
                      const x =
                        padding +
                        (n === 1
                          ? (width - 2 * padding) / 2
                          : (i / (n - 1)) *
                            (width - 2 * padding));
                      const ratio = (d.points - minP) / range;
                      const y =
                        height -
                        padding -
                        ratio * (height - 2 * padding);
                      return { x, y, gw: d.GW, points: d.points };
                    });

                    const polyPoints = points
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ");

                    return (
                      <>
                        <text
                          x={padding}
                          y={12}
                          fontSize="10"
                          fill="#d1c3a9"
                        >
                          Points
                        </text>
                        <text
                          x={width - padding}
                          y={height - 5}
                          textAnchor="end"
                          fontSize="10"
                          fill="#d1c3a9"
                        >
                          GW
                        </text>

                        {points.map((p, idx) => (
                          <g key={`tick-pts-${p.gw}-${idx}`}>
                            <line
                              x1={p.x}
                              y1={height - padding}
                              x2={p.x}
                              y2={height - padding + 4}
                              stroke="#555555"
                              strokeWidth="1"
                            />
                            <text
                              x={p.x}
                              y={height - 5}
                              fontSize="9"
                              textAnchor="middle"
                              fill="#d1c3a9"
                            >
                              {p.gw}
                            </text>
                          </g>
                        ))}

                        <polyline
                          points={polyPoints}
                          fill="none"
                          stroke={PALETTE.gold}
                          strokeWidth="2"
                        />

                        {points.map((p) => (
                          <g key={`pt-pts-${p.gw}`}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={6}
                              fill={PALETTE.gold}
                              stroke={PALETTE.black}
                              strokeWidth="2"
                            />
                            <text
                              x={p.x}
                              y={p.y - 10}
                              fontSize="9"
                              textAnchor="middle"
                              fill={PALETTE.beige}
                            >
                              {Number(p.points).toFixed(2)}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
