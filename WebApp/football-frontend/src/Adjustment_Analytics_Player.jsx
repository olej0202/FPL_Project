import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
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
      return (
        labelStr.includes(term) ||
        valueStr.includes(term)
      );
    });
  }, [options, search]);

  const toggleValue = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const selectedLabel =
    selectedValues.length === 0
      ? "All"
      : `${selectedValues.length} selected`;

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
 * New page component using AdjustmentDataProvider
 */
export default function PlayerAdjustmentsPage() {
  const { fetchIfNeeded, loading, Teamdata, Playerdata } =
    useAdjustmentData();

  const [playersState, setPlayersState] = useState(null); // editable copy of Playerdata
  const [teamsState, setTeamsState] = useState(null); // copy of Teamdata

  const [selectedMeasure, setSelectedMeasure] =
    useState("Points"); // "Goal_Scored" | "Assists" | "Points" | "Avg_Minutes" | "CBI_Predictions"

  const [selectedPlayerNames, setSelectedPlayerNames] = useState(
    []
  ); // web_name[]
  const [selectedTeamCodes, setSelectedTeamCodes] = useState([]); // team_code[]
  const [selectedPositions, setSelectedPositions] = useState([]); // position[]
  const [valueThreshold, setValueThreshold] = useState(null); // min value for 'value' filter

  // Sorting state (by GW columns)
  const [sortConfig, setSortConfig] = useState({
    gw: null,
    direction: "desc", // "asc" | "desc"
  });

  // Modal state
  const [activePlayerName, setActivePlayerName] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // For line-chart drag
  const svgRef = useRef(null);
  const [draggingGW, setDraggingGW] = useState(null);

  // Fetch data when needed
  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  // Initialize editable copies once data is available
  useEffect(() => {
    if (Teamdata?.current && !teamsState) {
      setTeamsState([...Teamdata.current]);
    }
    if (Playerdata?.current && !playersState) {
      setPlayersState([...Playerdata.current]);
    }
  }, [Teamdata, Playerdata, teamsState, playersState]);

  const isDataReady = !!playersState && !!teamsState && !loading;

  // Build team lookups
  const { teamLookup, teamNamesByCode } = useMemo(() => {
    const lookup = new Map(); // key: `${team_code}_${GW}` -> teamRow
    const names = new Map(); // team_code -> team_name

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

  // All GWs available in player data
  const allGWs = useMemo(() => {
    if (!playersState) return [];
    const set = new Set();
    playersState.forEach((p) => set.add(p.GW));
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [playersState]);

  // All distinct positions
  const allPositions = useMemo(() => {
    if (!playersState) return [];
    const set = new Set();
    playersState.forEach((p) => set.add(p.position));
    return Array.from(set);
  }, [playersState]);

  // Helper: compute measures for a single player row & matching team row
  function computeMeasures(playerRow, teamRow) {
    const avgMin = Number(playerRow.average_minutes) || 0;
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

    // New formulas using minutesAdj
    const goalScored = (goalShare * xg + penData) * minutesAdj;
    const assists = assistShare * xg * minutesAdj;
    const points =
      defaultPoints +
      goalScored * goalFactor +
      assists * assistFactor +
      cs * csFactor * minutesAdj +
      bps * minutesAdj +
      cbi * 2;

    const avgMinutes = avgMin;

    // CBI Predictions as its own measure (scaled with minutesAdj)
    const cbiPredictions = cbi * minutesAdj;

    return {
      Goal_Scored: goalScored,
      Assists: assists,
      Points: points,
      Avg_Minutes: avgMinutes,
      CBI_Predictions: cbiPredictions,
    };
  }

  /**
   * Pivot playersState by web_name, compute measures per GW and
   * compute global min/max for the value-filter.
   */
  const {
    playerTableRows,
    globalMinValue,
    globalMaxValue,
    allPlayerNames,
    allTeamOptions,
  } = useMemo(() => {
    if (!playersState || !teamsState) {
      return {
        playerTableRows: [],
        globalMinValue: 0,
        globalMaxValue: 0,
        allPlayerNames: [],
        allTeamOptions: [],
      };
    }

    const playerMap = new Map(); // web_name -> { ...info, rowsByGW: Map }

    playersState.forEach((p) => {
      const web = p.web_name;
      if (!web) return;

      const teamCode = String(p.Team);
      const teamName = teamNamesByCode.get(teamCode) || "";

      if (!playerMap.has(web)) {
        playerMap.set(web, {
          web_name: web,
          name: p.name,
          position: p.position,
          teamCode,
          teamName,
          value: Number(p.value) || 0,
          rowsByGW: new Map(),
        });
      }
      const entry = playerMap.get(web);
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
    if (maxValue === -Infinity) maxValue = 0;

    const playerNames = Array.from(playerMap.keys()).sort();
    const teamOptions = Array.from(teamNamesByCode.entries()).map(
      ([code, name]) => ({ code, name })
    );

    return {
      playerTableRows: tableRows,
      globalMinValue: minValue,
      globalMaxValue: maxValue,
      allPlayerNames: playerNames,
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

  // Initialize valueThreshold from global min once
  useEffect(() => {
    if (
      globalMinValue != null &&
      globalMaxValue != null &&
      valueThreshold === null
    ) {
      setValueThreshold(globalMinValue);
    }
  }, [globalMinValue, globalMaxValue, valueThreshold]);

  // Filtering + sorting
  const filteredPlayerRows = useMemo(() => {
    let rows = playerTableRows;

    if (selectedPlayerNames.length > 0) {
      const set = new Set(selectedPlayerNames);
      rows = rows.filter((r) => set.has(r.web_name));
    }

    if (selectedTeamCodes.length > 0) {
      const set = new Set(selectedTeamCodes);
      rows = rows.filter((r) => set.has(r.teamCode));
    }

    if (selectedPositions.length > 0) {
      const set = new Set(selectedPositions);
      rows = rows.filter((r) => set.has(r.position));
    }

    // Filter on 'value' (price) now
    const threshold =
      valueThreshold != null ? valueThreshold : globalMinValue;
    if (threshold != null && !Number.isNaN(threshold)) {
      rows = rows.filter((r) => r.value >= threshold);
    }

    // Sort by selected GW column if set
    if (sortConfig.gw != null) {
      const gwKey = sortConfig.gw;
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va =
          typeof a.gwValues[gwKey] === "number"
            ? a.gwValues[gwKey]
            : -Infinity;
        const vb =
          typeof b.gwValues[gwKey] === "number"
            ? b.gwValues[gwKey]
            : -Infinity;
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
    globalMinValue,
    sortConfig,
  ]);

  // Sorting handler
  const handleSortByGW = (gw) => {
    setSortConfig((prev) => {
      if (prev.gw === gw) {
        return {
          gw,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { gw, direction: "desc" };
    });
  };

  // Reset handler: clear local state and refetch context data
  const handleResetData = async () => {
    if (Teamdata) Teamdata.current = null;
    if (Playerdata) Playerdata.current = null;

    setTeamsState(null);
    setPlayersState(null);
    setSelectedPlayerNames([]);
    setSelectedTeamCodes([]);
    setSelectedPositions([]);
    setValueThreshold(null);
    setSortConfig({ gw: null, direction: "desc" });

    await fetchIfNeeded();

    if (Teamdata?.current) {
      setTeamsState([...Teamdata.current]);
    }
    if (Playerdata?.current) {
      setPlayersState([...Playerdata.current]);
    }
  };

  // Modal-related helpers
  const openPlayerModal = (webName) => {
    setActivePlayerName(webName);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActivePlayerName(null);
    setDraggingGW(null);
  };

  // Get data for active player (for modal)
  const activePlayerRowsByGW = useMemo(() => {
    if (!playersState || !activePlayerName) return [];
    return playersState
      .filter((p) => p.web_name === activePlayerName)
      .sort((a, b) => Number(a.GW) - Number(b.GW));
  }, [playersState, activePlayerName]);

  const activePlayerFirstRow =
    activePlayerRowsByGW.length > 0
      ? activePlayerRowsByGW[0]
      : null;

  // Derived chart data for active player
  const chartData = useMemo(() => {
    if (!activePlayerRowsByGW || activePlayerRowsByGW.length === 0) {
      return [];
    }
    return activePlayerRowsByGW.map((row) => ({
      GW: row.GW,
      minutes: Number(row.average_minutes) || 0,
    }));
  }, [activePlayerRowsByGW]);

  const MIN_MINUTES = 0;
  const MAX_MINUTES = 120;

  // Update all Goal_share values for active player (and context)
  const handleGoalShareChange = (e) => {
    const newVal = Number(e.target.value);
    if (!activePlayerName || Number.isNaN(newVal)) return;

    setPlayersState((prev) => {
      const updated = prev.map((p) =>
        p.web_name === activePlayerName
          ? { ...p, Goal_share: newVal }
          : p
      );
      if (Playerdata) {
        Playerdata.current = updated;
      }
      return updated;
    });
  };

  // Update all Assist_share values for active player (and context)
  const handleAssistShareChange = (e) => {
    const newVal = Number(e.target.value);
    if (!activePlayerName || Number.isNaN(newVal)) return;

    setPlayersState((prev) => {
      const updated = prev.map((p) =>
        p.web_name === activePlayerName
          ? { ...p, Assist_share: newVal }
          : p
      );
      if (Playerdata) {
        Playerdata.current = updated;
      }
      return updated;
    });
  };

  // Dragging handlers for line chart (minutes) – also update context
  const handleCircleMouseDown = (gw, e) => {
    e.preventDefault();
    setDraggingGW(gw);
  };

  const handleSvgMouseMove = (e) => {
    if (!draggingGW || !svgRef.current || !activePlayerName) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const height = svgRect.height;
    const padding = 20;

    const y = e.clientY - svgRect.top;
    const clampedY = Math.max(
      padding,
      Math.min(height - padding, y)
    );
    const ratio =
      (height - padding - clampedY) /
      (height - 2 * padding || 1);
    const minutes =
      MIN_MINUTES + ratio * (MAX_MINUTES - MIN_MINUTES);
    const rounded = Math.round(minutes);

    setPlayersState((prev) => {
      const updated = prev.map((p) =>
        p.web_name === activePlayerName && p.GW === draggingGW
          ? { ...p, average_minutes: rounded }
          : p
      );
      if (Playerdata) {
        Playerdata.current = updated;
      }
      return updated;
    });
  };

  const handleSvgMouseUp = () => {
    setDraggingGW(null);
  };

  if (!isDataReady) {
    return (
      <div
        style={{
          padding: "2rem",
          minHeight: "100vh",
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {loading ? "Loading data..." : "No data available."}
      </div>
    );
  }

  const playerOptions = allPlayerNames.map((name) => ({
    value: name,
    label: name,
  }));

  const teamOptions = allTeamOptions.map((t) => ({
    value: String(t.code),
    label: t.name,
  }));

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
            Player Adjustment Dashboard
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "#d1c3a9",
            }}
          >
            Tune shares & minutes, compare projections across
            gameweeks, and recalculate on the fly.
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
          <span>Reset & Refetch</span>
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(230px, 1fr))",
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
            <option value="Goal_Scored">Goal_Scored</option>
            <option value="Assists">Assists</option>
            <option value="Points">Points</option>
            <option value="Avg_Minutes">Avg_Minutes</option>
            <option value="CBI_Predictions">CBI Predictions</option>
          </select>
        </div>

        {/* Player multi-select (searchable) */}
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

        {/* Team multi-select (searchable) */}
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

        {/* Value slider (filter on 'value') */}
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
            Min value filter
          </label>
          <input
            type="range"
            min={globalMinValue}
            max={
              globalMaxValue > globalMinValue
                ? globalMaxValue
                : globalMinValue + 1
            }
            step={(globalMaxValue - globalMinValue) / 100 || 1}
            value={
              valueThreshold != null
                ? valueThreshold
                : globalMinValue
            }
            onChange={(e) =>
              setValueThreshold(Number(e.target.value))
            }
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
              : globalMinValue.toFixed(1)}{" "}
            (range {globalMinValue.toFixed(1)} –{" "}
            {globalMaxValue.toFixed(1)})
          </div>
        </div>
      </div>

      {/* Data table */}
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
                Price
              </th>
              {allGWs.map((gw) => {
                const isSorted = sortConfig.gw === gw;
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
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "0.5rem",
                  backgroundColor: "#111111",
                  textAlign: "right",
                  fontWeight: 600,
                }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayerRows.map((row, idx) => (
              <tr
                key={row.web_name}
                onClick={() => openPlayerModal(row.web_name)}
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
                  {row.web_name}
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

      {/* Modal for player details */}
      {isModalOpen && activePlayerFirstRow && (
        <div
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
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
                  {activePlayerFirstRow.position} ·{" "}
                  {activePlayerFirstRow.Team}
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
                gridTemplateColumns: "1fr 1fr",
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
                  Goal_share (first GW)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={
                    Number(activePlayerFirstRow.Goal_share) || 0
                  }
                  onChange={handleGoalShareChange}
                  style={{ width: "100%" }}
                />
                <div
                  style={{
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                    color: "#d1c3a9",
                  }}
                >
                  {(
                    Number(activePlayerFirstRow.Goal_share) || 0
                  ).toFixed(3)}
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
                  Assist_share (first GW)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={
                    Number(activePlayerFirstRow.Assist_share) || 0
                  }
                  onChange={handleAssistShareChange}
                  style={{ width: "100%" }}
                />
                <div
                  style={{
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                    color: "#d1c3a9",
                  }}
                >
                  {(
                    Number(activePlayerFirstRow.Assist_share) || 0
                  ).toFixed(3)}
                </div>
              </div>
            </div>

            {/* Line chart of average_minutes */}
            <div>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.4rem",
                  fontSize: "0.95rem",
                }}
              >
                Average minutes per GW (drag dots to adjust)
              </h3>
              {chartData.length === 0 ? (
                <div style={{ fontSize: "0.85rem" }}>
                  No minute data for this player.
                </div>
              ) : (
                <svg
                  ref={svgRef}
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
                    const width = svgRef.current
                      ? svgRef.current.getBoundingClientRect()
                          .width
                      : 600;
                    const height = 250;

                    const n = chartData.length;
                    const points = chartData.map((d, i) => {
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
                        {/* Axes labels */}
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

                        {/* vertical GW markers */}
                        {points.map((p, idx) => (
                          <g key={`tick-${p.gw}-${idx}`}>
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

                        {/* line */}
                        <polyline
                          points={polyPoints}
                          fill="none"
                          stroke={PALETTE.gold}
                          strokeWidth="2"
                        />

                        {/* draggable circles */}
                        {points.map((p) => (
                          <g key={`pt-${p.gw}`}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={6}
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
                            />
                            <text
                              x={p.x}
                              y={p.y - 10}
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
          </div>
        </div>
      )}
    </div>
  );
}
