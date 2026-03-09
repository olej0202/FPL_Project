import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Users,
  Shield,
  DollarSign,
  Filter,
  ChevronDown,
  ChevronRight,
  Sparkles,
  PencilLine,
  X,
  Save,
  Target,
  Clock3,
  Activity,
  ArrowUpDown,
  Star,
  CircleDot,
  Footprints,
  Eye,
  EyeOff,
  CalendarRange,
  MousePointerClick,
} from "lucide-react";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";
import teamColors from "./utils/team_colors";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  goldSoft: "#D4A72C",
  black: "#000000",
  beige: "#f7ead6",
  border: "rgba(248, 250, 252, 0.14)",
  muted: "#9ca3af",
  success: "#86efac",
  danger: "#f87171",
};

const FILTERS_STORAGE_KEY = "player_adjustments_filters_v4";

const MEASURE_LABELS = {
  Points: "Predicted Points",
  Goal_Scored: "Predicted Goals",
  Assists: "Predicted Assists",
  Avg_Minutes: "Predicted Minutes",
  CBI_Predictions: "Predicted Defcon",
};

const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

function getMeasureMeta(measure) {
  switch (measure) {
    case "Points":
      return { label: MEASURE_LABELS.Points, icon: Star, short: "Points", emoji: "⭐" };
    case "Goal_Scored":
      return { label: MEASURE_LABELS.Goal_Scored, icon: CircleDot, short: "Goals", emoji: "⚽" };
    case "Assists":
      return { label: MEASURE_LABELS.Assists, icon: Footprints, short: "Assists", emoji: "🥾" };
    case "Avg_Minutes":
      return { label: MEASURE_LABELS.Avg_Minutes, icon: Clock3, short: "Minutes", emoji: "🕒" };
    case "CBI_Predictions":
      return { label: MEASURE_LABELS.CBI_Predictions, icon: Shield, short: "Defcon", emoji: "🛡️" };
    default:
      return { label: measure, icon: Activity, short: measure, emoji: "•" };
  }
}

function GlassCard({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-[28px] border ${className}`}
      style={{
        borderColor: PALETTE.border,
        background: "linear-gradient(145deg, rgba(0,0,0,0.9), rgba(17,17,17,0.72))",
        boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(0,0,0,0.45)" }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold" style={{ color: PALETTE.gold }}>
        {value}
      </div>
    </div>
  );
}

function ClickHintPill() {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
      style={{
        border: `1px solid rgba(184,134,11,0.35)`,
        background: "rgba(184,134,11,0.08)",
        color: PALETTE.gold,
      }}
    >
      <MousePointerClick size={13} />
      Click a player row
    </div>
  );
}

function FilterCard({ icon: Icon, label, children }) {
  return (
    <div
      className="rounded-2xl p-4 overflow-visible min-w-0"
      style={{
        border: `1px solid ${PALETTE.border}`,
        background: "linear-gradient(145deg, rgba(0,0,0,0.94), rgba(90,0,0,0.18))",
      }}
    >
      <label
        className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "#e5e7eb" }}
      >
        <Icon size={13} style={{ color: PALETTE.gold }} />
        {label}
      </label>
      {children}
    </div>
  );
}

function PillButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-2 text-xs font-semibold transition"
      style={{
        border: `1px solid ${active ? PALETTE.gold : PALETTE.border}`,
        background: active
          ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
          : "rgba(0,0,0,0.72)",
        color: active ? "#000" : PALETTE.beige,
      }}
    >
      {children}
    </button>
  );
}

function SearchableMultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

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

  const handleSelectAll = () => onChange(options.map((o) => o.value));
  const handleClearAll = () => onChange([]);

  const selectedLabel =
    selectedValues.length === 0 ? "All" : `${selectedValues.length} selected`;

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const isSmall = window.innerWidth < 768;

      if (isSmall) {
        const left = 12;
        const right = 12;
        const top = rect.bottom + 8;
        const maxHeight = Math.min(320, window.innerHeight - top - 12);

        setPanelStyle({
          position: "fixed",
          left: `${left}px`,
          right: `${right}px`,
          top: `${top}px`,
          width: "auto",
          maxHeight: `${maxHeight}px`,
          zIndex: 9999,
        });
      } else {
        setPanelStyle({
          position: "absolute",
          left: "0px",
          right: "0px",
          top: "calc(100% + 8px)",
          width: "auto",
          maxHeight: "280px",
          zIndex: 200,
        });
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onClickOutside = (e) => {
      const insideTrigger = triggerRef.current?.contains(e.target);
      const insidePanel = panelRef.current?.contains(e.target);
      if (!insideTrigger && !insidePanel) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative min-w-0">
      <label className="mb-2 block text-sm font-semibold" style={{ color: PALETTE.beige }}>
        {label}
      </label>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="w-full rounded-2xl px-3 py-3 text-left text-sm transition-all duration-200"
        style={{
          border: `1px solid ${isOpen ? PALETTE.gold : PALETTE.border}`,
          background: "rgba(0,0,0,0.75)",
          color: PALETTE.beige,
          boxShadow: isOpen ? "0 0 0 1px rgba(184,134,11,0.18)" : "none",
        }}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            size={16}
            style={{
              color: PALETTE.gold,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 180ms ease",
            }}
          />
        </span>
      </button>

      <div
        ref={panelRef}
        className="overflow-hidden rounded-2xl transition-all duration-200 ease-out"
        style={{
          position: window.innerWidth < 768 ? "fixed" : "absolute",
          left: window.innerWidth < 768 ? "12px" : "0px",
          right: window.innerWidth < 768 ? "12px" : "0px",
          top: window.innerWidth < 768 ? "0px" : "calc(100% + 8px)",
          maxHeight: window.innerWidth < 768 ? "320px" : "280px",
          zIndex: window.innerWidth < 768 ? 9999 : 200,
          ...panelStyle,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateY(0)" : "translateY(-6px)",
          pointerEvents: isOpen ? "auto" : "none",
          border: `1px solid ${PALETTE.gold}`,
          background: "rgba(0,0,0,0.98)",
          boxShadow: isOpen ? "0 18px 40px rgba(0,0,0,0.7)" : "none",
        }}
      >
        <div className="p-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: PALETTE.muted }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none"
              style={{
                border: `1px solid ${PALETTE.border}`,
                background: "#050505",
                color: PALETTE.beige,
              }}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex-1 rounded-full px-3 py-2 text-xs font-semibold"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background: "rgba(184,134,11,0.08)",
                color: PALETTE.beige,
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="flex-1 rounded-full px-3 py-2 text-xs font-semibold"
              style={{
                border: `1px solid ${PALETTE.border}`,
                background: "rgba(0,0,0,0.75)",
                color: "#e5e7eb",
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="max-h-[180px] overflow-auto px-2 pb-3 text-sm">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2" style={{ color: PALETTE.muted }}>
              No matches
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const checked = selectedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors"
                  style={{
                    background: checked ? "rgba(184,134,11,0.14)" : "transparent",
                    color: PALETTE.beige,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(opt.value)}
                    style={{ accentColor: PALETTE.gold }}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function TeamColorDot({ teamName }) {
  const color = teamColors?.[teamName] || "#6b7280";

  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.18), 0 0 10px ${color}33`,
      }}
    />
  );
}

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
    Fixtures,
    fixturesVersion,
  } = useAdjustmentData();

  const [playersState, setPlayersState] = useState(null);
  const [teamsState, setTeamsState] = useState(null);
  const [hasHydratedFromContext, setHasHydratedFromContext] = useState(false);
  const [playerImageUrl, setPlayerImageUrl] = useState("");

  const [selectedMeasure, setSelectedMeasure] = useState("Points");
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [selectedPlayerNames, setSelectedPlayerNames] = useState([]);
  const [selectedTeamCodes, setSelectedTeamCodes] = useState([]);
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [valueThreshold, setValueThreshold] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [selectedGwStart, setSelectedGwStart] = useState(null);
  const [selectedGwEnd, setSelectedGwEnd] = useState(null);

  const [sortConfig, setSortConfig] = useState({
    type: null,
    gw: null,
    direction: "desc",
  });

  const [activePlayerKey, setActivePlayerKey] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [pendingGoalShare, setPendingGoalShare] = useState(null);
  const [pendingAssistShare, setPendingAssistShare] = useState(null);
  const [minutesDraft, setMinutesDraft] = useState({});

  const [defconAdjust01, setDefconAdjust01] = useState(0.5);
  const [defconMean01, setDefconMean01] = useState(0);
  const [modalBaselineRows, setModalBaselineRows] = useState([]);

  const svgRefMinutes = useRef(null);
  const svgRefPoints = useRef(null);
  const [draggingGW, setDraggingGW] = useState(null);
  const dragGWRef = useRef(null);

  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const shareFrameRef = useRef(null);
  const assistFrameRef = useRef(null);
  const defconFrameRef = useRef(null);
  const minutesFrameRef = useRef(null);

  const adjustments = useMemo(
    () => (changes?.current ? changes.current : []),
    [changes, changesVersion]
  );

  const MIN_MINUTES = 0;
  const MAX_MINUTES = 90;

  const getPlayerKey = (p) => p.name || `${p.web_name || "unknown"}_${p.Team || "NA"}`;

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  useEffect(() => {
    if (hasHydratedFromContext) return;
    if (Teamdata?.current) setTeamsState([...Teamdata.current]);
    if (Playerdata?.current) setPlayersState([...Playerdata.current]);
    if (Teamdata?.current || Playerdata?.current) setHasHydratedFromContext(true);
  }, [Teamdata, Playerdata, dataVersion, hasHydratedFromContext]);

  useEffect(() => {
    if (!Teamdata?.current) return;
    setTeamsState([...Teamdata.current]);
  }, [teamVersion, Teamdata]);

  const isDataReady =
    hasHydratedFromContext &&
    Array.isArray(playersState) &&
    Array.isArray(teamsState) &&
    !loading;

  const { teamLookup, teamNamesByCode } = useMemo(() => {
    const names = new Map();
    const lookup = new Map();
    const teamsRows = teamsState || [];
    const fixtures = Fixtures?.current || [];
    const optionsById = new Map();

    for (const fx of fixtures) {
      optionsById.set(
        fx.id,
        (fx.options || []).map((o) => ({ gw: Number(o.gw), p: Number(o.p) }))
      );
    }

    const add = (team_code, gw, xg, cs, matches) => {
      const key = `${String(team_code)}_${Number(gw)}`;
      const prev = lookup.get(key);
      const prevXG = prev ? Number(prev.XG) || 0 : 0;
      const prevCS = prev ? Number(prev.CS) || 0 : 0;
      const prevM = prev ? Number(prev.Matches) || 0 : 0;

      lookup.set(key, {
        team_code,
        GW: Number(gw),
        XG: prevXG + (Number(xg) || 0),
        CS: prevCS + (Number(cs) || 0),
        Matches: prevM + (Number(matches) || 0),
      });
    };

    for (const r of teamsRows) {
      const code = r.team_code;
      const gw0 = Number(r.GW);

      if (!names.has(String(code)) && r.team_name) names.set(String(code), r.team_name);

      const rowXG = Number(r.XG) || 0;
      const rowCS = Number(r.CS) || 0;

      const id = fixtureIdFromRow({ ...r, Opponent_team: r.Opponent_team });
      const dist =
        optionsById.get(id)?.length ? optionsById.get(id) : [{ gw: gw0, p: 1 }];

      for (const o of dist) {
        const gw = Number(o.gw);
        const p = Number(o.p);
        if (!Number.isFinite(gw) || !Number.isFinite(p) || p <= 0) continue;
        add(code, gw, p * rowXG, p * rowCS, p);
      }
    }

    return { teamLookup: lookup, teamNamesByCode: names };
  }, [teamsState, Fixtures, fixturesVersion]);

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

  useEffect(() => {
    if (!allGWs.length) return;
    if (selectedGwStart == null) setSelectedGwStart(allGWs[0]);
    if (selectedGwEnd == null) setSelectedGwEnd(allGWs[allGWs.length - 1]);
  }, [allGWs, selectedGwStart, selectedGwEnd]);

  const computeMeasures = useCallback(
    (playerRow, teamRow, cbi01Override = null) => {
      if (!teamRow) {
        return {
          Goal_Scored: 0,
          Assists: 0,
          Points: 0,
          Avg_Minutes: 0,
          CBI_Predictions: 0,
          _CBI01_Raw: 0,
        };
      }

      const matchCount = Math.max(0, Number(teamRow.Matches) || 0);

      const avgMinRaw = Number(playerRow.average_minutes) || 0;
      const avgMin = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, avgMinRaw));

      const goalShare = Number(playerRow.Goal_share) || 0;
      const assistShare = Number(playerRow.Assist_share) || 0;

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
        csFactor > 1 ? ((30 - Math.min(30, csPerMatch * 100)) / -35) * matchCount : 0;

      const goalScored =
        ((goalShare * 0.9 + 0.1 * oppGoalThreat) * xg + penData * 0.8 * matchCount) *
        minutesAdj;

      const assists =
        ((assistShare * 0.9 + 0.1 * oppAssistThreat) * xg) * minutesAdj;

      const rawCbi01 = clamp01(Number(playerRow.CBI_Percent) || 0);

      const cbi01 =
        (typeof cbi01Override === "number" && Number.isFinite(cbi01Override)
          ? clamp01(cbi01Override)
          : rawCbi01) * minutesAdj;

      const defconPointsTerm = cbi01 * minutesAdj * matchCount * 1.8;
      const basePoints =
        (defaultPoints + bps) * minutesAdj * matchCount + defconPointsTerm;

      const points = Math.max(
        0,
        basePoints +
          goalScored * goalFactor +
          assists * assistFactor +
          cs * csFactor * minutesAdj +
          csNonlinear
      );

      return {
        Goal_Scored: goalScored,
        Assists: assists,
        Points: points,
        Avg_Minutes: avgMin * matchCount,
        CBI_Predictions: cbi01,
        _CBI01_Raw: rawCbi01,
      };
    },
    []
  );

  useEffect(() => {
    if (!isDataReady) return;
    if (!playersState) return;

    const timeoutId = setTimeout(() => {
      const groups = new Map();
      for (let i = 0; i < playersState.length; i++) {
        const row = playersState[i];
        const key = getPlayerKey(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(i);
      }

      const meanRawByKey = new Map();
      const adjByKey = new Map();

      groups.forEach((idxs, key) => {
        let sum = 0;
        let n = 0;

        for (const idx of idxs) {
          const row = playersState[idx];
          const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);
          const m = computeMeasures(row, teamRow);
          const raw01 = clamp01(Number(m._CBI01_Raw));
          sum += raw01;
          n += 1;
        }

        const meanRaw = n ? sum / n : 0;
        meanRawByKey.set(key, meanRaw);

        const firstRow = playersState[idxs[0]];
        const stored = Number(firstRow?.defcon_adjust_01);
        const adj = Number.isFinite(stored) ? clamp01(stored) : clamp01(meanRaw);
        adjByKey.set(key, adj);
      });

      const updated = playersState.map((row) => {
        const key = getPlayerKey(row);
        const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);

        const mRaw = computeMeasures(row, teamRow);
        const raw01 = clamp01(Number(mRaw._CBI01_Raw));

        const meanRaw = meanRawByKey.get(key) ?? 0;
        const newAdj = adjByKey.get(key) ?? clamp01(meanRaw);
        const adjustedCbi01 = clamp01(raw01 - meanRaw + newAdj);

        const measures = computeMeasures(row, teamRow, adjustedCbi01);

        return {
          ...row,
          calc_points: measures.Points,
          calc_goals: measures.Goal_Scored,
          calc_assists: measures.Assists,
          calc_minutes: measures.Avg_Minutes,
          calc_cbi: measures.CBI_Predictions,
        };
      });

      let changed = false;
      for (let i = 0; i < updated.length; i++) {
        const a = updated[i];
        const b = playersState[i];
        if (
          !b ||
          a.calc_points !== b.calc_points ||
          a.calc_goals !== b.calc_goals ||
          a.calc_assists !== b.calc_assists ||
          a.calc_minutes !== b.calc_minutes ||
          a.calc_cbi !== b.calc_cbi
        ) {
          changed = true;
          break;
        }
      }

      if (!changed) return;

      updatePlayerData(() => updated);
      setPlayersState(updated);
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [isDataReady, playersState, teamLookup, computeMeasures, updatePlayerData]);

  const {
    playerTableRows,
    globalMinValue,
    globalMaxValue,
    allTeamOptions,
    playerOptions,
  } = useMemo(() => {
    if (!playersState || !teamsState) {
      return {
        playerTableRows: [],
        globalMinValue: 0,
        globalMaxValue: 150,
        allTeamOptions: [],
        playerOptions: [],
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
          defcon_adjust_01: Number(p.defcon_adjust_01),
        });
      }

      const entry = playerMap.get(key);
      entry.rowsByGW.set(p.GW, p);

      const stored = Number(p.defcon_adjust_01);
      if (Number.isFinite(stored)) entry.defcon_adjust_01 = stored;
    });

    const tableRows = [];
    let minValue = Infinity;
    let maxValue = -Infinity;

    playerMap.forEach((entry) => {
      const gwValues = {};
      let totalMeasure = 0;

      const rawByGw = new Map();
      let sum = 0;
      let n = 0;

      allGWs.forEach((gw) => {
        const playerRow = entry.rowsByGW.get(gw);
        if (!playerRow) return;
        const teamRow = teamLookup.get(`${entry.teamCode}_${gw}`);
        const m = computeMeasures(playerRow, teamRow);
        const raw01 = clamp01(Number(m._CBI01_Raw));
        rawByGw.set(gw, raw01);
        sum += raw01;
        n += 1;
      });

      const meanRaw = n ? sum / n : 0;
      const storedAdj = Number(entry.defcon_adjust_01);
      const newAdj = Number.isFinite(storedAdj) ? clamp01(storedAdj) : clamp01(meanRaw);

      allGWs.forEach((gw) => {
        const playerRow = entry.rowsByGW.get(gw);
        if (!playerRow) {
          gwValues[gw] = null;
          return;
        }

        const teamRow = teamLookup.get(`${entry.teamCode}_${gw}`);
        const raw01 = rawByGw.get(gw) ?? 0;
        const adjustedCbi01 = clamp01(raw01 - meanRaw + newAdj);

        const measures = computeMeasures(playerRow, teamRow, adjustedCbi01);
        const v = measures[selectedMeasure];
        gwValues[gw] = v;

        if (typeof v === "number" && !Number.isNaN(v)) totalMeasure += v;
      });

      const value = entry.value;
      if (!Number.isNaN(value)) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }

      tableRows.push({ ...entry, gwValues, totalMeasure });
    });

    if (minValue === Infinity) minValue = 0;
    if (maxValue === -Infinity) maxValue = 150;

    const teamOptions = Array.from(teamNamesByCode.entries()).map(([code, name]) => ({
      code,
      name,
    }));

    const playerOptions = tableRows
      .map((row) => ({
        value: row.nameKey,
        label: row.displayName || row.web_name || row.nameKey,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      playerTableRows: tableRows,
      globalMinValue: minValue,
      globalMaxValue: maxValue,
      allTeamOptions: teamOptions,
      playerOptions,
    };
  }, [playersState, teamsState, allGWs, selectedMeasure, teamLookup, teamNamesByCode, computeMeasures]);

  useEffect(() => {
    if (globalMinValue != null && globalMaxValue != null && valueThreshold === null) {
      setValueThreshold(globalMaxValue);
    }
  }, [globalMinValue, globalMaxValue, valueThreshold]);

  useEffect(() => {
    if (!isDataReady || filtersHydrated) return;
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.selectedMeasure) setSelectedMeasure(parsed.selectedMeasure);
        if (typeof parsed.playerNameFilter === "string") setPlayerNameFilter(parsed.playerNameFilter);
        if (Array.isArray(parsed.selectedPlayerNames)) setSelectedPlayerNames(parsed.selectedPlayerNames);
        if (Array.isArray(parsed.selectedTeamCodes)) setSelectedTeamCodes(parsed.selectedTeamCodes);
        if (Array.isArray(parsed.selectedPositions)) setSelectedPositions(parsed.selectedPositions);
        if (typeof parsed.valueThreshold === "number" && !Number.isNaN(parsed.valueThreshold)) {
          setValueThreshold(parsed.valueThreshold);
        }
        if (typeof parsed.showFilters === "boolean") setShowFilters(parsed.showFilters);
        if (parsed.selectedGwStart != null) setSelectedGwStart(parsed.selectedGwStart);
        if (parsed.selectedGwEnd != null) setSelectedGwEnd(parsed.selectedGwEnd);
        if (parsed.sortConfig) setSortConfig(parsed.sortConfig);
      }
    } catch {
    } finally {
      setFiltersHydrated(true);
    }
  }, [isDataReady, filtersHydrated]);

  useEffect(() => {
    if (!isDataReady || !filtersHydrated) return;
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        selectedMeasure,
        playerNameFilter,
        selectedPlayerNames,
        selectedTeamCodes,
        selectedPositions,
        valueThreshold,
        showFilters,
        selectedGwStart,
        selectedGwEnd,
        sortConfig,
      })
    );
  }, [
    isDataReady,
    filtersHydrated,
    selectedMeasure,
    playerNameFilter,
    selectedPlayerNames,
    selectedTeamCodes,
    selectedPositions,
    valueThreshold,
    showFilters,
    selectedGwStart,
    selectedGwEnd,
    sortConfig,
  ]);

  const filteredPlayerRows = useMemo(() => {
    const horizonStart = selectedGwStart != null ? Number(selectedGwStart) : allGWs[0];
    const horizonEnd = selectedGwEnd != null ? Number(selectedGwEnd) : allGWs[allGWs.length - 1];
    const horizonMin = Math.min(horizonStart ?? 0, horizonEnd ?? 0);
    const horizonMax = Math.max(horizonStart ?? 0, horizonEnd ?? 0);

    let rows = playerTableRows.map((row) => {
      const totalMeasure = allGWs.reduce((sum, gw) => {
        if (Number(gw) < horizonMin || Number(gw) > horizonMax) return sum;
        const v = row.gwValues[gw];
        return typeof v === "number" && !Number.isNaN(v) ? sum + v : sum;
      }, 0);
      return { ...row, totalMeasure };
    });

    if (playerNameFilter.trim()) {
      const term = playerNameFilter.trim().toLowerCase();
      rows = rows.filter((r) => {
        const display = (r.displayName || "").toLowerCase();
        const web = (r.web_name || "").toLowerCase();
        const full = (r.name || "").toLowerCase();
        return display.includes(term) || web.includes(term) || full.includes(term);
      });
    }

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

    const threshold = valueThreshold != null ? valueThreshold : globalMaxValue;
    if (threshold != null && !Number.isNaN(threshold)) {
      rows = rows.filter((r) => r.value <= threshold);
    }

    if (sortConfig.type === "gw" && sortConfig.gw != null) {
      const gwKey = sortConfig.gw;
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va = typeof a.gwValues[gwKey] === "number" ? a.gwValues[gwKey] : -Infinity;
        const vb = typeof b.gwValues[gwKey] === "number" ? b.gwValues[gwKey] : -Infinity;
        return dir === "asc" ? va - vb : vb - va;
      });
    } else if (sortConfig.type === "total") {
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va = typeof a.totalMeasure === "number" ? a.totalMeasure : -Infinity;
        const vb = typeof b.totalMeasure === "number" ? b.totalMeasure : -Infinity;
        return dir === "asc" ? va - vb : vb - va;
      });
    }

    return rows;
  }, [
    playerTableRows,
    playerNameFilter,
    selectedPlayerNames,
    selectedTeamCodes,
    selectedPositions,
    valueThreshold,
    globalMaxValue,
    sortConfig,
    selectedGwStart,
    selectedGwEnd,
    allGWs,
  ]);

  const handleSortByGW = (gw) => {
    setSortConfig((prev) => {
      if (prev.type === "gw" && prev.gw === gw) {
        return { type: "gw", gw, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { type: "gw", gw, direction: "desc" };
    });
  };

  const handleSortByTotal = () => {
    setSortConfig((prev) => {
      if (prev.type === "total") {
        return { type: "total", gw: null, direction: prev.direction === "asc" ? "desc" : "asc" };
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
    setHasHydratedFromContext(false);

    await fetchIfNeeded();
  };

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
    setDefconAdjust01(0);
    setDefconMean01(0);
  };

  const activePlayerFirstRow = modalBaselineRows.length > 0 ? modalBaselineRows[0] : null;

  useEffect(() => {
    if (!isModalOpen || !activePlayerKey || !playersState) {
      setModalBaselineRows([]);
      setPendingGoalShare(null);
      setPendingAssistShare(null);
      setMinutesDraft({});
      setDefconAdjust01(0.5);
      setDefconMean01(0);
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

      const rawVals = rows.map((row) => {
        const teamRow = teamLookup.get(`${String(row.Team)}_${row.GW}`);
        const m = computeMeasures(row, teamRow);
        return clamp01(Number(m._CBI01_Raw));
      });
      const mean = rawVals.length ? rawVals.reduce((a, b) => a + b, 0) / rawVals.length : 0;
      setDefconMean01(mean);

      const stored = Number(first.defcon_adjust_01);
      setDefconAdjust01(Number.isFinite(stored) ? clamp01(stored) : clamp01(mean));
    }
  }, [isModalOpen, activePlayerKey, playersState, teamLookup, computeMeasures]);

  const chartDataMinutes = useMemo(() => {
    if (!modalBaselineRows || modalBaselineRows.length === 0) return [];
    return modalBaselineRows.map((row) => {
      const original = Math.max(
        MIN_MINUTES,
        Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
      );
      const minutes = minutesDraft[row.GW] ?? original;
      return { GW: row.GW, minutes };
    });
  }, [modalBaselineRows, minutesDraft]);

  const chartDataPoints = useMemo(() => {
    if (!modalBaselineRows || modalBaselineRows.length === 0) return [];

    const rawSeries = modalBaselineRows.map((row) => {
      const teamRow = teamLookup.get(`${String(row.Team)}_${row.GW}`);

      const effectiveRow = {
        ...row,
        average_minutes: minutesDraft[row.GW] ?? row.average_minutes,
        Goal_share: pendingGoalShare != null ? pendingGoalShare : row.Goal_share,
        Assist_share: pendingAssistShare != null ? pendingAssistShare : row.Assist_share,
      };

      const m = computeMeasures(effectiveRow, teamRow);
      const raw01 = clamp01(Number(m._CBI01_Raw));
      return { GW: row.GW, raw01, teamRow, effectiveRow };
    });

    const meanRaw = rawSeries.length
      ? rawSeries.reduce((s, x) => s + x.raw01, 0) / rawSeries.length
      : 0;

    const newAdj = clamp01(Number(defconAdjust01));

    return rawSeries.map(({ GW, raw01, teamRow, effectiveRow }) => {
      const adjusted01 = clamp01(raw01 - meanRaw + newAdj);
      const measures = computeMeasures(effectiveRow, teamRow, adjusted01);

      return {
        GW,
        points: measures.Points,
        defcon: measures.CBI_Predictions,
      };
    });
  }, [
    modalBaselineRows,
    teamLookup,
    minutesDraft,
    pendingGoalShare,
    pendingAssistShare,
    defconAdjust01,
    computeMeasures,
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
      if (!prev) map.set(key, a);
      else {
        const prevTime = new Date(prev.timestamp).getTime();
        const currTime = new Date(a.timestamp).getTime();
        if (currTime > prevTime) map.set(key, a);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
      if (minutesDraft[gw] != null && Number(minutesDraft[gw]) !== Number(oldMin)) {
        return true;
      }
    }

    const oldStored = Number(activePlayerFirstRow.defcon_adjust_01);
    const baseline = Number.isFinite(oldStored) ? clamp01(oldStored) : clamp01(defconMean01);
    if (clamp01(defconAdjust01) !== baseline) return true;

    return false;
  }, [
    activePlayerFirstRow,
    modalBaselineRows,
    pendingGoalShare,
    pendingAssistShare,
    minutesDraft,
    defconAdjust01,
    defconMean01,
  ]);

  const handleSavePlayerChanges = () => {
    if (!activePlayerKey || !playersState || !activePlayerFirstRow || !hasPlayerChanges) return;

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

    const oldDA = Number(activePlayerFirstRow.defcon_adjust_01);
    const baselineDA = Number.isFinite(oldDA) ? clamp01(oldDA) : clamp01(defconMean01);
    const newDA = clamp01(Number(defconAdjust01));
    if (newDA !== baselineDA) {
      adjustmentsToLog.push({
        type: "Defcon",
        playerKey: activePlayerKey,
        playerName: activePlayerFirstRow.name,
        webName: activePlayerFirstRow.web_name,
        oldValue: baselineDA,
        newValue: newDA,
      });
    }

    if (adjustmentsToLog.length === 0) return;

    const applyPlayerEdits = (prev) => {
      if (!prev) return prev;
      return prev.map((p) => {
        if (getPlayerKey(p) !== activePlayerKey) return p;

        const gw = p.GW;
        const updated = { ...p };

        updated.Goal_share = newGoal;
        updated.Assist_share = newAssist;

        if (minutesDraft[gw] != null) updated.average_minutes = minutesDraft[gw];
        updated.defcon_adjust_01 = newDA;

        return updated;
      });
    };

    setPlayersState(applyPlayerEdits);
    updatePlayerData(applyPlayerEdits);
    adjustmentsToLog.forEach(logAdjustment);
  };

  const handleSaveAndClose = () => {
    handleSavePlayerChanges();
    closeModal();
  };

  const scheduleGoalShareChange = (value) => {
    if (shareFrameRef.current) cancelAnimationFrame(shareFrameRef.current);
    shareFrameRef.current = requestAnimationFrame(() => setPendingGoalShare(value));
  };

  const scheduleAssistShareChange = (value) => {
    if (assistFrameRef.current) cancelAnimationFrame(assistFrameRef.current);
    assistFrameRef.current = requestAnimationFrame(() => setPendingAssistShare(value));
  };

  const scheduleDefconChange = (value) => {
    if (defconFrameRef.current) cancelAnimationFrame(defconFrameRef.current);
    defconFrameRef.current = requestAnimationFrame(() =>
      setDefconAdjust01(clamp01(value))
    );
  };

  const updateMinutesFromClientY = (clientY) => {
    if (!svgRefMinutes.current || !activePlayerKey || !draggingGW) return;

    const svgRect = svgRefMinutes.current.getBoundingClientRect();
    const height = svgRect.height;
    const padding = 20;

    const y = clientY - svgRect.top;
    const clampedY = Math.max(padding, Math.min(height - padding, y));
    const ratio = (height - padding - clampedY) / (height - 2 * padding || 1);
    const minutes = MIN_MINUTES + ratio * (MAX_MINUTES - MIN_MINUTES);
    const rounded = Math.round(minutes);

    if (minutesFrameRef.current) cancelAnimationFrame(minutesFrameRef.current);
    minutesFrameRef.current = requestAnimationFrame(() => {
      setMinutesDraft((prev) => ({ ...prev, [dragGWRef.current]: rounded }));
    });
  };

  const handleCircleMouseDown = (gw, e) => {
    e.preventDefault();
    setDraggingGW(gw);
    dragGWRef.current = gw;
  };

  useEffect(() => {
    if (!isModalOpen || !activePlayerFirstRow?.name) {
      setPlayerImageUrl("");
      return;
    }

    fetch(
      `https://fpl-project-t5e9.onrender.com/Player_picture?player=${encodeURIComponent(
        activePlayerFirstRow.name
      )}`
    )
      .then((res) => res.text())
      .then((url) => setPlayerImageUrl(url.trim()))
      .catch(() => setPlayerImageUrl(""));
  }, [isModalOpen, activePlayerFirstRow?.name]);

  const handleCircleTouchStart = (gw, e) => {
    setDraggingGW(gw);
    dragGWRef.current = gw;
    if (e.touches?.[0]) updateMinutesFromClientY(e.touches[0].clientY);
  };

  const teamOptions = useMemo(
    () => allTeamOptions.map((t) => ({ value: String(t.code), label: t.name })),
    [allTeamOptions]
  );

  const currentMeasureMeta = useMemo(() => getMeasureMeta(selectedMeasure), [selectedMeasure]);
  const CurrentMeasureIcon = currentMeasureMeta.icon;

  if (!isDataReady) {
    return (
      <div
        className="min-h-screen p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
        }}
      >
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <GlassCard className="w-full p-6 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(184,134,11,0.12)",
                border: `1px solid rgba(184,134,11,0.35)`,
              }}
            >
              <Sparkles size={24} style={{ color: PALETTE.gold }} />
            </div>
            <div className="text-lg font-semibold">Loading adjustment workspace</div>
            <div className="mt-2 text-sm" style={{ color: PALETTE.muted }}>
              Preparing player projections, fixtures, and saved adjustments.
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              style={{
                color: PALETTE.gold,
                border: `1px solid rgba(184,134,11,0.35)`,
                background: "rgba(184,134,11,0.08)",
              }}
            >
              <Sparkles size={14} />
              Player Adjustment
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Player Adjustment Tool
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "#d1c3a9" }}>
              Filter your player pool, inspect projected outputs by gameweek, and fine-tune
              shares, minutes, and Defcon with a cleaner workflow.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 w-full lg:w-auto">
            <StatCard icon={Users} label="Players" value={String(filteredPlayerRows.length)} />
            <StatCard
              icon={currentMeasureMeta.icon}
              label="Measure"
              value={currentMeasureMeta.short}
            />
            <StatCard icon={PencilLine} label="Changes" value={String(displayAdjustments.length)} />
            <button
              type="button"
              onClick={handleResetData}
              className="rounded-2xl px-4 py-3 text-left transition"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background: "linear-gradient(145deg, rgba(0,0,0,0.9), rgba(90,0,0,0.7))",
                color: PALETTE.beige,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                <RotateCcw size={14} />
                Reset
              </div>
              <div className="mt-1 text-sm font-semibold">Reload model data</div>
            </button>
          </div>
        </header>

        <GlassCard
          className="mb-6 p-4 sm:p-5 lg:p-6 overflow-visible"
          style={{
            position: "relative",
            zIndex: 30,
            background: "#000",
          }}
        >
          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className="w-full text-left"
            style={{
              background: "transparent",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:border-none">
              <div>
                <div
                  className="flex items-center gap-2 text-sm font-semibold hover:border-none"
                  style={{ color: PALETTE.gold }}
                >
                  <Filter size={16} />
                  Filters and controls
                </div>
                <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                  Filter players by player, team, position, value, and gameweek horizon.
                </div>
              </div>

              <div
                className="inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-semibold sm:self-center"
                style={{
                  border: `1px solid ${PALETTE.gold}`,
                  background: "rgba(0,0,0,0.45)",
                  color: PALETTE.beige,
                }}
              >
                {showFilters ? <EyeOff size={16} /> : <Eye size={16} />}
                {showFilters ? "Hide filters" : "Show filters"}
                <ChevronDown
                  size={16}
                  style={{
                    transform: showFilters ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 180ms ease",
                  }}
                />
              </div>
            </div>
          </button>

          <div
            className="transition-all duration-300 ease-in-out overflow-visible"
            style={{
              maxHeight: showFilters ? "1400px" : "0px",
              opacity: showFilters ? 1 : 0,
              marginTop: showFilters ? "1rem" : "0",
              pointerEvents: showFilters ? "auto" : "none",
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 overflow-visible">
              <FilterCard icon={Users} label="Players">
                <SearchableMultiSelect
                  label="Players"
                  options={playerOptions}
                  selectedValues={selectedPlayerNames}
                  onChange={setSelectedPlayerNames}
                  placeholder="Search players..."
                />
              </FilterCard>

              <FilterCard icon={Shield} label="Teams">
                <SearchableMultiSelect
                  label="Teams"
                  options={teamOptions}
                  selectedValues={selectedTeamCodes}
                  onChange={setSelectedTeamCodes}
                  placeholder="Search teams..."
                />
              </FilterCard>

              <FilterCard icon={SlidersHorizontal} label="Position">
                <div className="mb-3 flex flex-wrap gap-2">
                  <PillButton
                    active={selectedPositions.length === allPositions.length && allPositions.length > 0}
                    onClick={() => setSelectedPositions(allPositions)}
                  >
                    Select all
                  </PillButton>
                  <PillButton
                    active={selectedPositions.length === 0}
                    onClick={() => setSelectedPositions([])}
                  >
                    Clear
                  </PillButton>
                </div>

                <div className="flex flex-wrap gap-2">
                  {allPositions.map((pos) => (
                    <PillButton
                      key={pos}
                      active={selectedPositions.includes(pos)}
                      onClick={() =>
                        setSelectedPositions((prev) =>
                          prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
                        )
                      }
                    >
                      {pos}
                    </PillButton>
                  ))}
                </div>
              </FilterCard>

              <FilterCard icon={DollarSign} label="Max value filter">
                <input
                  type="range"
                  min={globalMinValue}
                  max={globalMaxValue || globalMinValue + 1}
                  step={(globalMaxValue - globalMinValue) / 100 || 1}
                  value={valueThreshold != null ? valueThreshold : globalMaxValue}
                  onChange={(e) => setValueThreshold(Number(e.target.value))}
                  className="w-full"
                />
                <div
                  className="mt-3 rounded-xl px-3 py-2 text-sm"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "rgba(0,0,0,0.58)",
                    color: "#d1c3a9",
                  }}
                >
                  {(valueThreshold != null ? valueThreshold : globalMaxValue).toFixed(1)} · range{" "}
                  {globalMinValue.toFixed(1)}–{globalMaxValue.toFixed(1)}
                </div>
              </FilterCard>

              <FilterCard icon={CalendarRange} label="GW horizon for total">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedGwStart ?? ""}
                    onChange={(e) => setSelectedGwStart(Number(e.target.value))}
                    className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(0,0,0,0.76)",
                      color: PALETTE.beige,
                    }}
                  >
                    {allGWs.map((gw) => (
                      <option key={`start_${gw}`} value={gw}>
                        From GW {gw}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedGwEnd ?? ""}
                    onChange={(e) => setSelectedGwEnd(Number(e.target.value))}
                    className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(0,0,0,0.76)",
                      color: PALETTE.beige,
                    }}
                  >
                    {allGWs.map((gw) => (
                      <option key={`end_${gw}`} value={gw}>
                        To GW {gw}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className="mt-3 rounded-xl px-3 py-2 text-sm"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "rgba(0,0,0,0.58)",
                    color: "#d1c3a9",
                  }}
                >
                  Total uses GW{" "}
                  {Math.min(selectedGwStart ?? allGWs[0], selectedGwEnd ?? allGWs[allGWs.length - 1])}
                  –{Math.max(selectedGwStart ?? allGWs[0], selectedGwEnd ?? allGWs[allGWs.length - 1])}
                </div>
              </FilterCard>
            </div>
          </div>
        </GlassCard>

        <div className="mb-6">
          <details
            className="overflow-visible rounded-[24px]"
            style={{
              border: `1px solid ${PALETTE.border}`,
              background: "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(0,0,0,0.82))",
              boxShadow: "0 14px 30px rgba(0,0,0,0.55)",
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <PencilLine size={16} style={{ color: PALETTE.gold }} />
                Changes made
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: "rgba(184,134,11,0.08)", color: PALETTE.gold }}
                >
                  {displayAdjustments.length}
                </span>
              </span>
              <ChevronDown size={16} style={{ color: PALETTE.gold }} />
            </summary>
            <div className="max-h-[280px] overflow-y-auto px-4 pb-4 text-sm">
              {displayAdjustments.length === 0 ? (
                <div style={{ color: PALETTE.muted }}>No manual adjustments yet.</div>
              ) : (
                <div className="space-y-2">
                  {displayAdjustments.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl p-3"
                      style={{
                        border: `1px solid ${PALETTE.border}`,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div className="font-semibold">
                        {a.playerName} ({a.webName})
                      </div>
                      <div className="mt-1 text-sm" style={{ color: "#e5e7eb" }}>
                        {a.type === "Goal_share"
                          ? "Goal share"
                          : a.type === "Assist_share"
                          ? "Assist share"
                          : a.type === "Minutes"
                          ? "Minutes"
                          : a.type === "Defcon"
                          ? "Defcon"
                          : a.type}
                        {a.gw != null ? ` · GW ${a.gw}` : ""}:{" "}
                        {formatAdjustmentValue(a, "oldValue")} →{" "}
                        <span style={{ color: PALETTE.gold }}>
                          {formatAdjustmentValue(a, "newValue")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>

        <GlassCard className="overflow-visible" style={{ position: "relative", zIndex: 10 }}>
          <div
            className="border-b px-4 py-4 sm:px-5"
            style={{ borderColor: PALETTE.border }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div
                  className="inline-flex items-center gap-2 text-sm font-semibold"
                  style={{ color: PALETTE.gold }}
                >
                  <Target size={16} />
                  Player projection table
                </div>
                <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                  Select any player row to open the adjustment drawer with minutes, shares, Defcon, and charts.
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                <div
                  className="flex items-center gap-2 rounded-xl px-2"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "rgba(0,0,0,0.78)",
                    height: "36px",
                  }}
                >
                  <CurrentMeasureIcon size={14} style={{ color: PALETTE.gold }} />
                  <select
                    value={selectedMeasure}
                    onChange={(e) => setSelectedMeasure(e.target.value)}
                    className="rounded-xl text-xs font-semibold outline-none"
                    style={{
                      background: "transparent",
                      color: PALETTE.gold,
                      border: "none",
                      height: "32px",
                      minWidth: "120px",
                    }}
                  >
                    <option value="Points"> Points</option>
                    <option value="Goal_Scored">Goals</option>
                    <option value="Assists"> Assists</option>
                    <option value="Avg_Minutes">Minutes</option>
                    <option value="CBI_Predictions"> Defcon %</option>
                  </select>
                </div>

                <div className="relative min-w-[220px]">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: PALETTE.muted }}
                  />
                  <input
                    type="text"
                    value={playerNameFilter}
                    onChange={(e) => setPlayerNameFilter(e.target.value)}
                    placeholder="Type player name..."
                    className="w-full rounded-xl py-2 pl-9 pr-3 text-xs outline-none"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(0,0,0,0.78)",
                      color: PALETTE.beige,
                      height: "36px",
                    }}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <ClickHintPill />
                  <div className="text-xs whitespace-nowrap" style={{ color: PALETTE.muted }}>
                    {filteredPlayerRows.length} visible rows
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-[2] px-4 py-3 text-left"
                    style={{ background: "#111", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span>Name</span>
                    </div>
                  </th>

                  <th
                    className="px-4 py-3 text-left"
                    style={{ background: "#111", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Position
                  </th>

                  <th
                    className="px-4 py-3 text-left"
                    style={{ background: "#111", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Team
                  </th>

                  <th
                    className="px-4 py-3 text-right"
                    style={{ background: "#111", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Value
                  </th>

                  {allGWs.map((gw) => {
                    const isSorted = sortConfig.type === "gw" && sortConfig.gw === gw;
                    return (
                      <th
                        key={gw}
                        onClick={() => handleSortByGW(gw)}
                        className="cursor-pointer px-4 py-3 text-right"
                        style={{
                          background: "#111",
                          borderBottom: `1px solid ${PALETTE.gold}`,
                          color: isSorted ? PALETTE.gold : PALETTE.beige,
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          GW {gw}
                          {isSorted ? (
                            sortConfig.direction === "asc" ? "▲" : "▼"
                          ) : (
                            <ArrowUpDown size={12} />
                          )}
                        </span>
                      </th>
                    );
                  })}

                  <th
                    onClick={handleSortByTotal}
                    className="cursor-pointer px-4 py-3 text-right"
                    style={{
                      background: "#111",
                      borderBottom: `1px solid ${PALETTE.gold}`,
                      color: sortConfig.type === "total" ? PALETTE.gold : PALETTE.beige,
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      Total{" "}
                      {sortConfig.type === "total" ? (
                        sortConfig.direction === "asc" ? "▲" : "▼"
                      ) : (
                        <ArrowUpDown size={12} />
                      )}
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredPlayerRows.map((row, idx) => (
                  <tr
                    key={row.nameKey}
                    onClick={() => openPlayerModal(row.nameKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPlayerModal(row.nameKey);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open player adjustments for ${row.displayName}`}
                    className="group cursor-pointer transition-all duration-150 focus:outline-none"
                    style={{
                      background: idx % 2 === 0 ? "#080808" : "#141414",
                    }}
                  >
                    <td
                      className="sticky left-0 z-[1] px-4 py-3 font-semibold"
                      style={{
                        background: idx % 2 === 0 ? "#080808" : "#141414",
                        borderBottom: "1px solid #222",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">{row.displayName}</div>
                          <div
                            className="mt-1 inline-flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
                            style={{ color: PALETTE.gold }}
                          >
                            <MousePointerClick size={11} />
                            Adjust Player
                          </div>
                        </div>

                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus:translate-x-0 group-focus:opacity-100"
                          style={{
                            border: `1px solid rgba(184,134,11,0.28)`,
                            background: "rgba(184,134,11,0.08)",
                            color: PALETTE.gold,
                            transform: "translateX(-4px)",
                          }}
                        >
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3" style={{ borderBottom: "1px solid #222" }}>
                      {row.position}
                    </td>

                    <td className="px-4 py-3" style={{ borderBottom: "1px solid #222" }}>
                      <div className="inline-flex items-center gap-2">
                        <TeamColorDot teamName={row.teamName} />
                        <span>{row.teamName}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #222" }}>
                      {row.value != null && !Number.isNaN(row.value) ? row.value.toFixed(1) : "-"}
                    </td>

                    {allGWs.map((gw) => (
                      <td key={gw} className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #222" }}>
                        {row.gwValues[gw] != null && !Number.isNaN(row.gwValues[gw])
                          ? row.gwValues[gw].toFixed(2)
                          : "0.00"}
                      </td>
                    ))}

                    <td
                      className="px-4 py-3 text-right font-semibold"
                      style={{ borderBottom: "1px solid #222", color: PALETTE.gold }}
                    >
                      {row.totalMeasure != null && !Number.isNaN(row.totalMeasure)
                        ? row.totalMeasure.toFixed(2)
                        : "0.00"}
                    </td>
                  </tr>
                ))}

                {filteredPlayerRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6 + allGWs.length}
                      className="px-4 py-8 text-center"
                      style={{ color: "#d1c3a9" }}
                    >
                      No players match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {isModalOpen && activePlayerFirstRow && (
          <div
            onMouseMove={(e) => draggingGW && updateMinutesFromClientY(e.clientY)}
            onMouseUp={() => {
              setDraggingGW(null);
              dragGWRef.current = null;
            }}
            onMouseLeave={() => {
              setDraggingGW(null);
              dragGWRef.current = null;
            }}
            onTouchMove={(e) =>
              draggingGW && e.touches?.[0] && updateMinutesFromClientY(e.touches[0].clientY)
            }
            onTouchEnd={() => {
              setDraggingGW(null);
              dragGWRef.current = null;
            }}
            onTouchCancel={() => {
              setDraggingGW(null);
              dragGWRef.current = null;
            }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 p-4"
          >
            <GlassCard
              className="max-h-[92vh] w-full max-w-5xl overflow-y-auto p-4 sm:p-6"
              style={{ background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black} 60%)` }}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={playerImageUrl}
                      alt={activePlayerFirstRow.web_name || activePlayerFirstRow.name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src =
                          "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3-110.webp";
                      }}
                      className="h-16 w-16 rounded-full object-cover border"
                      style={{
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    />
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-black"
                      style={{
                        backgroundColor: teamColors?.[
                          teamNamesByCode.get(String(activePlayerFirstRow.Team)) || ""
                        ] || "#6b7280",
                      }}
                    />
                  </div>

                  <div className="min-w-0">
                    <h2 className="m-0 text-xl font-semibold sm:text-2xl truncate">
                      {activePlayerFirstRow.name} ({activePlayerFirstRow.web_name})
                    </h2>
                    <div
                      className="mt-1 flex items-center gap-2 text-sm"
                      style={{ color: "#d1c3a9" }}
                    >
                      <span>{activePlayerFirstRow.position}</span>
                      <span style={{ color: "#6b7280" }}>•</span>
                      <TeamColorDot
                        teamName={teamNamesByCode.get(String(activePlayerFirstRow.Team)) || ""}
                      />
                      <span>
                        {teamNamesByCode.get(String(activePlayerFirstRow.Team)) || ""}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full p-2"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "rgba(0,0,0,0.45)",
                    color: PALETTE.beige,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <FilterCard icon={CircleDot} label="Goal Share">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pendingGoalShare ?? 0}
                    onChange={(e) => scheduleGoalShareChange(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: PALETTE.gold }}
                  />
                  <div className="mt-2 text-sm" style={{ color: "#d1c3a9" }}>
                    {(pendingGoalShare ?? 0).toFixed(2) * 100}%
                  </div>
                </FilterCard>

                <FilterCard icon={Footprints} label="Assist Share">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pendingAssistShare ?? 0}
                    onChange={(e) => scheduleAssistShareChange(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: PALETTE.gold }}
                  />
                  <div className="mt-2 text-sm" style={{ color: "#d1c3a9" }}>
                    {(pendingAssistShare ?? 0).toFixed(2) * 100}%
                  </div>
                </FilterCard>

                <FilterCard icon={Shield} label="Defcon %">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={clamp01(defconAdjust01)}
                    onChange={(e) => scheduleDefconChange(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: PALETTE.gold }}
                  />
                  <div className="mt-2 text-sm" style={{ color: "#d1c3a9" }}>
                    {Math.round(clamp01(defconAdjust01) * 100)}%
                  </div>
                </FilterCard>
              </div>

              <div className="mb-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={!hasPlayerChanges}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-3 font-semibold transition"
                  style={{
                    border: `1px solid ${PALETTE.gold}`,
                    background: hasPlayerChanges
                      ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
                      : "rgba(0,0,0,0.5)",
                    color: hasPlayerChanges ? "#000" : PALETTE.muted,
                    cursor: hasPlayerChanges ? "pointer" : "not-allowed",
                  }}
                >
                  <Save size={16} />
                  Save changes
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-base font-semibold">Predicted minutes per GW</h3>
                  <div className="mb-2 text-xs" style={{ color: PALETTE.muted }}>
                    Drag the dots vertically to update minutes.
                  </div>
                  {chartDataMinutes.length === 0 ? (
                    <div className="text-sm">No minute data for this player.</div>
                  ) : (
                    <svg
                      ref={svgRefMinutes}
                      width="100%"
                      height="280"
                      viewBox="0 0 600 280"
                      preserveAspectRatio="none"
                      className="rounded-2xl"
                      style={{
                        border: `1px solid ${PALETTE.gold}`,
                        background: "#000",
                        touchAction: "none",
                      }}
                    >
                      {(() => {
                        const padding = 20;
                        const width = 600;
                        const height = 280;
                        const n = chartDataMinutes.length;

                        const points = chartDataMinutes.map((d, i) => {
                          const x =
                            padding +
                            (n === 1
                              ? (width - 2 * padding) / 2
                              : (i / (n - 1)) * (width - 2 * padding));
                          const ratio = (d.minutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES || 1);
                          const y = height - padding - ratio * (height - 2 * padding);
                          return { x, y, gw: d.GW, minutes: d.minutes };
                        });

                        return (
                          <>
                            <polyline
                              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke={PALETTE.gold}
                              strokeWidth="2"
                            />
                            {points.map((p) => (
                              <g key={p.gw}>
                                <line
                                  x1={p.x}
                                  y1={height - padding}
                                  x2={p.x}
                                  y2={height - padding + 4}
                                  stroke="#555"
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
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={12}
                                  fill={draggingGW === p.gw ? PALETTE.red : PALETTE.gold}
                                  stroke={PALETTE.black}
                                  strokeWidth="2"
                                  style={{ cursor: "ns-resize" }}
                                  onMouseDown={(e) => handleCircleMouseDown(p.gw, e)}
                                  onTouchStart={(e) => handleCircleTouchStart(p.gw, e)}
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

                <div>
                  <h3 className="mb-3 text-base font-semibold">Calculated points</h3>
                  <div className="mb-2 text-xs" style={{ color: PALETTE.muted }}>
                    Projected points update live as you change minutes and shares.
                  </div>
                  {chartDataPoints.length === 0 ? (
                    <div className="text-sm">No point data for this player.</div>
                  ) : (
                    <svg
                      ref={svgRefPoints}
                      width="100%"
                      height="280"
                      viewBox="0 0 600 280"
                      preserveAspectRatio="none"
                      className="rounded-2xl"
                      style={{
                        border: `1px solid ${PALETTE.gold}`,
                        background: "#000",
                      }}
                    >
                      {(() => {
                        const padding = 20;
                        const width = 600;
                        const height = 280;
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
                              : (i / (n - 1)) * (width - 2 * padding));
                          const ratio = (d.points - minP) / range;
                          const y = height - padding - ratio * (height - 2 * padding);
                          return { x, y, gw: d.GW, points: d.points };
                        });

                        return (
                          <>
                            <polyline
                              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke={PALETTE.gold}
                              strokeWidth="2"
                            />
                            {points.map((p) => (
                              <g key={p.gw}>
                                <line
                                  x1={p.x}
                                  y1={height - padding}
                                  x2={p.x}
                                  y2={height - padding + 4}
                                  stroke="#555"
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
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}