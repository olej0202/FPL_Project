import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
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
  Hand,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";
import teamColors from "./utils/team_colors";

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  goldSoft: "#A7D0C4",
  black: "#e2e8f0",
  beige: "#1e293b",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
  success: "#86efac",
  danger: "#f87171",
};

const FILTERS_STORAGE_KEY = "player_adjustments_filters_v7";
const MIN_MINUTES = 0;
const MAX_MINUTES = 90;

const MEASURE_LABELS = {
  Points: "Predicted Points",
  Goal_Scored: "Predicted Goals",
  Assists: "Predicted Assists",
  Avg_Minutes: "Predicted Minutes",
  CBI_Predictions: "Predicted Defcon",
  Save_Pred: "Predicted Saves",
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
    case "Save_Pred":
      return { label: MEASURE_LABELS.Save_Pred, icon: Hand, short: "Saves", emoji: "🧤" };
    default:
      return { label: measure, icon: Activity, short: measure, emoji: "•" };
  }
}

function useDebouncedValue(value, delay = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

function GlassCard({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-[28px] border ${className}`}
      style={{
        borderColor: PALETTE.border,
        background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))",
        boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)" }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        {icon ? React.createElement(icon, { size: 14 }) : null}
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
        border: `1px solid rgba(95,143,123,0.35)`,
        background: "rgba(95,143,123,0.08)",
        color: PALETTE.gold,
      }}
    >
      <MousePointerClick size={13} />
      Click a player row
    </div>
  );
}

function FilterCard({ icon, label, children }) {
  return (
    <div
      className="rounded-2xl p-4 overflow-visible min-w-0"
      style={{
        border: `1px solid ${PALETTE.border}`,
        background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(236,253,245,0.85))",
      }}
    >
      <label
        className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "#475569" }}
      >
        {icon ? React.createElement(icon, { size: 13, style: { color: PALETTE.gold } }) : null}
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
          ? `linear-gradient(135deg, ${PALETTE.gold}, #8FBCA9)`
          : "#f8fafc",
        color: active ? "#1e293b" : PALETTE.beige,
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
  const [isMobile, setIsMobile] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const filteredOptions = useMemo(() => {
    const term = search.toLowerCase();
    return options.filter((opt) => {
      const labelStr = (opt.label ?? "").toString().toLowerCase();
      const valueStr = (opt.value ?? "").toString().toLowerCase();
      return labelStr.includes(term) || valueStr.includes(term);
    });
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleValue = useCallback(
    (value) => {
      if (selectedSet.has(value)) {
        onChange(selectedValues.filter((v) => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    },
    [onChange, selectedSet, selectedValues]
  );

  const handleSelectAll = useCallback(() => onChange(options.map((o) => o.value)), [onChange, options]);
  const handleClearAll = useCallback(() => onChange([]), [onChange]);

  const selectedLabel =
    selectedValues.length === 0 ? "All" : `${selectedValues.length} selected`;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;

    if (isMobile) {
      const viewportPadding = 12;
      const top = rect.bottom + gap;
      const availableHeight = window.innerHeight - top - viewportPadding;

      setPanelStyle({
        position: "fixed",
        left: `${viewportPadding}px`,
        right: `${viewportPadding}px`,
        top: `${Math.max(viewportPadding, top)}px`,
        width: "auto",
        maxHeight: `${Math.max(160, Math.min(320, availableHeight))}px`,
        zIndex: 120,
      });
    } else {
      setPanelStyle({
        position: "absolute",
        left: "0px",
        top: `calc(100% + ${gap}px)`,
        width: `${rect.width}px`,
        maxHeight: "280px",
        zIndex: 120,
      });
    }

    setPanelReady(true);
  }, [isMobile]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelReady(false);
      return;
    }

    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportChange = () => updatePosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePosition]);

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
        onClick={() => {
          if (!isOpen) setPanelReady(false);
          setIsOpen((p) => !p);
        }}
        className="w-full rounded-2xl px-3 py-3 text-left text-sm transition-all duration-200"
        style={{
          border: `1px solid ${isOpen ? PALETTE.gold : PALETTE.border}`,
          background: "#f8fafc",
          color: PALETTE.beige,
          boxShadow: isOpen ? "0 0 0 1px rgba(95,143,123,0.18)" : "none",
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

      {isOpen && (
        <div
          ref={panelRef}
          className="overflow-hidden rounded-2xl"
          style={{
            ...panelStyle,
            visibility: panelReady ? "visible" : "hidden",
            opacity: panelReady ? 1 : 0,
            transform: panelReady ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity 160ms ease, transform 160ms ease",
            border: `1px solid ${PALETTE.gold}`,
            background: "#ffffff",
            boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
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
                  background: "#ffffff",
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
                  background: "rgba(95,143,123,0.08)",
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
                  background: "#f8fafc",
                  color: "#475569",
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
                const checked = selectedSet.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors"
                    style={{
                      background: checked ? "rgba(95,143,123,0.14)" : "transparent",
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
      )}
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

const PlayerRow = React.memo(function PlayerRow({
  row,
  idx,
  allGWs,
  onOpen,
}) {
  return (
    <tr
      onClick={() => onOpen(row.nameKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row.nameKey);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open player adjustments for ${row.displayName}`}
      className="group cursor-pointer transition-all duration-150 focus:outline-none"
      style={{
        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
      }}
    >
      <td
        className="sticky left-0 z-[1] px-4 py-3 font-semibold"
        style={{
          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
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
              border: `1px solid rgba(95,143,123,0.28)`,
              background: "rgba(95,143,123,0.08)",
              color: PALETTE.gold,
              transform: "translateX(-4px)",
            }}
          >
            <ChevronRight size={16} />
          </div>
        </div>
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.position}
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="inline-flex items-center gap-2">
          <TeamColorDot teamName={row.teamName} />
          <span>{row.teamName}</span>
        </div>
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.value != null && !Number.isNaN(row.value) ? row.value.toFixed(1) : "-"}
      </td>

      {allGWs.map((gw) => {
        const cell = row.gwMeasures[gw];
        const displayValue = cell ? cell[row.selectedMeasure] : 0;
        return (
          <td key={gw} className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
            {displayValue != null && !Number.isNaN(displayValue)
              ? Number(displayValue).toFixed(2)
              : "0.00"}
          </td>
        );
      })}

      <td
        className="px-4 py-3 text-right font-semibold"
        style={{ borderBottom: "1px solid #e2e8f0", color: PALETTE.gold }}
      >
        {row.totalMeasure != null && !Number.isNaN(row.totalMeasure)
          ? row.totalMeasure.toFixed(2)
          : "0.00"}
      </td>
    </tr>
  );
});

function playersNeedCalcSync(currentRows, nextRows) {
  if (!Array.isArray(currentRows) || !Array.isArray(nextRows)) return true;
  if (currentRows.length !== nextRows.length) return true;

  for (let i = 0; i < nextRows.length; i++) {
    const a = currentRows[i];
    const b = nextRows[i];
    if (!a || !b) return true;

    if (
      Number(a.calc_points) !== Number(b.calc_points) ||
      Number(a.calc_goals) !== Number(b.calc_goals) ||
      Number(a.calc_assists) !== Number(b.calc_assists) ||
      Number(a.calc_minutes) !== Number(b.calc_minutes) ||
      Number(a.calc_cbi) !== Number(b.calc_cbi) ||
      Number(a.calc_saves) !== Number(b.calc_saves)
    ) {
      return true;
    }
  }

  return false;
}
export default function PlayerAdjustmentsPage() {
  const navigate = useNavigate();
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
  const [playerImageUrl, setPlayerImageUrl] = useState("");

  const [selectedMeasure, setSelectedMeasure] = useState("Points");
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const debouncedPlayerNameFilter = useDebouncedValue(playerNameFilter, 180);

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
  const [modalChartMetric, setModalChartMetric] = useState("points");
  const [comparisonSearch, setComparisonSearch] = useState("");
  const [comparisonPlayerKey, setComparisonPlayerKey] = useState(null);

  const [pendingGoalShare, setPendingGoalShare] = useState(null);
  const [pendingAssistShare, setPendingAssistShare] = useState(null);
  const [minutesDraft, setMinutesDraft] = useState({});

  const [defconAdjust01, setDefconAdjust01] = useState(0.5);
  const [defconMean01, setDefconMean01] = useState(0);
  const [modalBaselineRows, setModalBaselineRows] = useState([]);

  const svgRefMinutes = useRef(null);
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

  const getPlayerKey = useCallback(
    (p) => p.name || `${p.web_name || "unknown"}_${p.Team || "NA"}`,
    []
  );

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  useEffect(() => {
    if (!loading && Array.isArray(Teamdata?.current)) {
      setTeamsState([...Teamdata.current]);
    }
  }, [Teamdata, teamVersion, loading]);

  useEffect(() => {
    if (!loading && Array.isArray(Playerdata?.current)) {
      setPlayersState([...Playerdata.current]);
    }
  }, [Playerdata, dataVersion, loading]);

  const isDataReady =
    !loading &&
    Array.isArray(playersState) &&
    Array.isArray(teamsState);

const computeMeasures = useCallback((playerRow, teamRow, cbi01Override = null) => {
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
  const avgMin = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, avgMinRaw));

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

  const assists =
    ((assistShare * 0.9 + 0.1 * oppAssistThreat) * xg) * minutesAdj;

  const rawCbi01 = clamp01(Number(playerRow.CBI_Percent) || 0);

  const cbi01 =
    (typeof cbi01Override === "number" && Number.isFinite(cbi01Override)
      ? clamp01(cbi01Override)
      : rawCbi01) * minutesAdj;

  const defconPointsTerm = cbi01 * minutesAdj * matchCount * 2;

  // new
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
      savePred/3
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
}, []);

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
    playersState.forEach((p) => set.add(Number(p.GW)));
    return Array.from(set).sort((a, b) => a - b);
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

  const playersByKey = useMemo(() => {
    const map = new Map();
    for (const row of playersState || []) {
      const key = getPlayerKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    for (const [, rows] of map) {
      rows.sort((a, b) => Number(a.GW) - Number(b.GW));
    }
    return map;
  }, [playersState, getPlayerKey]);

  const playersWithCalcs = useMemo(() => {
    if (!playersState?.length) return [];

    const meanByPlayer = new Map();
    const adjByPlayer = new Map();

    for (const [nameKey, rowsForPlayer] of playersByKey.entries()) {
      let rawSum = 0;
      let rawCount = 0;

      for (const row of rowsForPlayer) {
        const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);
        const base = computeMeasures(row, teamRow);
        const raw01 = clamp01(Number(base._CBI01_Raw));
        rawSum += raw01;
        rawCount += 1;
      }

      const meanRaw = rawCount ? rawSum / rawCount : 0;
      meanByPlayer.set(nameKey, meanRaw);

      const first = rowsForPlayer[0];
      const storedAdj = Number(first?.defcon_adjust_01);
      adjByPlayer.set(
        nameKey,
        Number.isFinite(storedAdj) ? clamp01(storedAdj) : clamp01(meanRaw)
      );
    }

    return playersState.map((row) => {
      const key = getPlayerKey(row);
      const teamRow = teamLookup.get(`${String(row.Team)}_${Number(row.GW)}`);
      const meanRaw = meanByPlayer.get(key) ?? 0;
      const newAdj = adjByPlayer.get(key) ?? clamp01(meanRaw);

      const mRaw = computeMeasures(row, teamRow);
      const raw01 = clamp01(Number(mRaw._CBI01_Raw));
      const adjustedCbi01 = clamp01(raw01 - meanRaw + newAdj);
      const measures = computeMeasures(row, teamRow, adjustedCbi01);

      return {
  ...row,
  calc_points: measures.Points,
  calc_goals: measures.Goal_Scored,
  calc_assists: measures.Assists,
  calc_saves: measures.Save_Pred,
  calc_minutes: measures.Avg_Minutes,
  calc_cbi: measures.CBI_Predictions,
};
    });
  }, [playersState, playersByKey, teamLookup, computeMeasures, getPlayerKey]);

  useEffect(() => {
    if (!isDataReady) return;
    if (!Array.isArray(playersWithCalcs)) return;
    if (!playersNeedCalcSync(Playerdata?.current, playersWithCalcs)) return;

    updatePlayerData(() => playersWithCalcs);
  }, [isDataReady, playersWithCalcs, Playerdata, updatePlayerData]);

  const {
    playerTableRowsBase,
    globalMinValue,
    globalMaxValue,
    allTeamOptions,
    playerOptions,
  } = useMemo(() => {
    if (!playersWithCalcs || !teamsState) {
      return {
        playerTableRowsBase: [],
        globalMinValue: 0,
        globalMaxValue: 150,
        allTeamOptions: [],
        playerOptions: [],
      };
    }

    const grouped = new Map();

    for (const row of playersWithCalcs) {
      const key = getPlayerKey(row);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const rows = [];
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const [nameKey, rowsForPlayer] of grouped.entries()) {
      const first = rowsForPlayer[0];
      if (!first) continue;

      const teamCode = String(first.Team);
      const teamName = teamNamesByCode.get(teamCode) || "";
      const displayName = first.web_name || first.name || nameKey;
      const value = Number(first.value) || 0;

      if (!Number.isNaN(value)) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }

      const gwMeasures = {};
      for (const row of rowsForPlayer) {
        const gw = Number(row.GW);
        gwMeasures[gw] = {
  Points: Number(row.calc_points) || 0,
  Goal_Scored: Number(row.calc_goals) || 0,
  Assists: Number(row.calc_assists) || 0,
  Save_Pred: Number(row.calc_saves) || 0,
  Avg_Minutes: Number(row.calc_minutes) || 0,
  CBI_Predictions: Number(row.calc_cbi) || 0,
};
      }

      rows.push({
        nameKey,
        displayName,
        name: first.name,
        web_name: first.web_name,
        position: first.position,
        teamCode,
        teamName,
        value,
        gwMeasures,
        defcon_adjust_01: Number(first.defcon_adjust_01),
      });
    }

    if (minValue === Infinity) minValue = 0;
    if (maxValue === -Infinity) maxValue = 150;

    const teamOptions = Array.from(teamNamesByCode.entries()).map(([code, name]) => ({
      code,
      name,
    }));

    const playerOptionsSorted = rows
      .map((row) => ({
        value: row.nameKey,
        label: row.displayName || row.web_name || row.nameKey,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      playerTableRowsBase: rows,
      globalMinValue: minValue,
      globalMaxValue: maxValue,
      allTeamOptions: teamOptions,
      playerOptions: playerOptionsSorted,
    };
  }, [playersWithCalcs, teamsState, getPlayerKey, teamNamesByCode]);

  const playerSummaryByKey = useMemo(() => {
    const map = new Map();
    for (const row of playerTableRowsBase) {
      map.set(row.nameKey, row);
    }
    return map;
  }, [playerTableRowsBase]);

  const comparisonSearchResults = useMemo(() => {
    if (!isModalOpen) return [];
    const term = comparisonSearch.trim().toLowerCase();
    if (!term) return [];

    return playerTableRowsBase
      .filter((row) => {
        if (!row?.nameKey || row.nameKey === activePlayerKey) return false;
        const display = String(row.displayName || "").toLowerCase();
        const web = String(row.web_name || "").toLowerCase();
        const full = String(row.name || "").toLowerCase();
        return display.includes(term) || web.includes(term) || full.includes(term);
      })
      .slice(0, 8);
  }, [isModalOpen, comparisonSearch, playerTableRowsBase, activePlayerKey]);

  const comparisonSummary = useMemo(() => {
    if (!comparisonPlayerKey) return null;
    return playerSummaryByKey.get(comparisonPlayerKey) || null;
  }, [comparisonPlayerKey, playerSummaryByKey]);

  const comparisonBaselineRows = useMemo(() => {
    if (!isModalOpen || !comparisonPlayerKey) return [];
    return (playersByKey.get(comparisonPlayerKey) || []).map((r) => ({ ...r }));
  }, [isModalOpen, comparisonPlayerKey, playersByKey]);

  const comparisonChartDataMinutes = useMemo(() => {
    if (!comparisonBaselineRows.length) return [];
    return comparisonBaselineRows.map((row) => ({
      GW: row.GW,
      minutes: Math.max(
        MIN_MINUTES,
        Math.min(MAX_MINUTES, Number(row.average_minutes) || 0)
      ),
    }));
  }, [comparisonBaselineRows]);

  const comparisonDefconAdjust01 = useMemo(() => {
    if (!comparisonBaselineRows.length) return null;

    const stored = Number(comparisonBaselineRows[0]?.defcon_adjust_01);
    if (Number.isFinite(stored)) return clamp01(stored);

    const rawVals = comparisonBaselineRows.map((row) => {
      const teamRow = teamLookup.get(`${String(row.Team)}_${row.GW}`);
      const m = computeMeasures(row, teamRow);
      return clamp01(Number(m._CBI01_Raw));
    });

    if (!rawVals.length) return null;
    return rawVals.reduce((sum, v) => sum + v, 0) / rawVals.length;
  }, [comparisonBaselineRows, teamLookup, computeMeasures]);

  const comparisonChartDataPoints = useMemo(() => {
    if (!comparisonBaselineRows.length) return [];

    const rawSeries = comparisonBaselineRows.map((row) => {
      const teamRow = teamLookup.get(`${String(row.Team)}_${row.GW}`);
      const measures = computeMeasures(row, teamRow);
      const raw01 = clamp01(Number(measures._CBI01_Raw));
      return { GW: row.GW, raw01, teamRow, row };
    });

    const meanRaw = rawSeries.length
      ? rawSeries.reduce((sum, entry) => sum + entry.raw01, 0) / rawSeries.length
      : 0;

    const targetAdj = comparisonDefconAdjust01 != null
      ? clamp01(comparisonDefconAdjust01)
      : clamp01(meanRaw);

    return rawSeries.map(({ GW, raw01, teamRow, row }) => {
      const adjusted01 = clamp01(raw01 - meanRaw + targetAdj);
      const measures = computeMeasures(row, teamRow, adjusted01);
      return {
        GW,
        points: measures.Points,
        goals: measures.Goal_Scored,
        assists: measures.Assists,
        saves: measures.Save_Pred,
        defcon: measures.CBI_Predictions,
      };
    });
  }, [comparisonBaselineRows, teamLookup, computeMeasures, comparisonDefconAdjust01]);

  const comparisonMinutesByGw = useMemo(() => {
    const map = new Map();
    comparisonChartDataMinutes.forEach((row) => {
      map.set(Number(row.GW), Number(row.minutes) || 0);
    });
    return map;
  }, [comparisonChartDataMinutes]);

  const comparisonPointsByGw = useMemo(() => {
    const map = new Map();
    comparisonChartDataPoints.forEach((row) => {
      map.set(Number(row.GW), Number(row[modalChartMetric]) || 0);
    });
    return map;
  }, [comparisonChartDataPoints, modalChartMetric]);

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
      // ignore
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

    let rows = playerTableRowsBase.map((row) => {
      let totalMeasure = 0;
      for (const gw of allGWs) {
        if (gw < horizonMin || gw > horizonMax) continue;
        const measures = row.gwMeasures[gw];
        const value = measures ? measures[selectedMeasure] : 0;
        if (typeof value === "number" && !Number.isNaN(value)) totalMeasure += value;
      }
      return {
        ...row,
        totalMeasure,
        selectedMeasure,
      };
    });

    const term = debouncedPlayerNameFilter.trim().toLowerCase();
    if (term) {
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
      const gwKey = Number(sortConfig.gw);
      const dir = sortConfig.direction;
      rows = [...rows].sort((a, b) => {
        const va = a.gwMeasures[gwKey]?.[selectedMeasure] ?? -Infinity;
        const vb = b.gwMeasures[gwKey]?.[selectedMeasure] ?? -Infinity;
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
    playerTableRowsBase,
    allGWs,
    selectedMeasure,
    debouncedPlayerNameFilter,
    selectedPlayerNames,
    selectedTeamCodes,
    selectedPositions,
    valueThreshold,
    globalMaxValue,
    sortConfig,
    selectedGwStart,
    selectedGwEnd,
  ]);

  const handleSortByGW = useCallback((gw) => {
    setSortConfig((prev) => {
      if (prev.type === "gw" && prev.gw === gw) {
        return { type: "gw", gw, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { type: "gw", gw, direction: "desc" };
    });
  }, []);

  const handleSortByTotal = useCallback(() => {
    setSortConfig((prev) => {
      if (prev.type === "total") {
        return { type: "total", gw: null, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { type: "total", gw: null, direction: "desc" };
    });
  }, []);

  const handleResetData = async () => {
    if (Teamdata) Teamdata.current = null;
    if (Playerdata) Playerdata.current = null;

    setTeamsState(null);
    setPlayersState(null);
    setSortConfig({ type: null, gw: null, direction: "desc" });
    updateChanges([]);

    await fetchIfNeeded();
  };

  const handleOpenStatisticalOptimizer = useCallback(async () => {
    await fetchIfNeeded();
    navigate("/My_Team", { state: { preferModel: "statistical" } });
  }, [fetchIfNeeded, navigate]);

  const openPlayerModal = useCallback((nameKey) => {
    setActivePlayerKey(nameKey);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setActivePlayerKey(null);
    setModalChartMetric("points");
    setComparisonSearch("");
    setComparisonPlayerKey(null);
    setDraggingGW(null);
    dragGWRef.current = null;
    setPendingGoalShare(null);
    setPendingAssistShare(null);
    setMinutesDraft({});
    setModalBaselineRows([]);
    setDefconAdjust01(0.5);
    setDefconMean01(0);
  }, []);

  const activePlayerFirstRow = modalBaselineRows.length > 0 ? modalBaselineRows[0] : null;
  const comparisonFirstRow = comparisonBaselineRows.length > 0 ? comparisonBaselineRows[0] : null;

  useEffect(() => {
    if (!isModalOpen || !activePlayerKey) {
      setModalBaselineRows([]);
      setModalChartMetric("points");
      setComparisonSearch("");
      setComparisonPlayerKey(null);
      setPendingGoalShare(null);
      setPendingAssistShare(null);
      setMinutesDraft({});
      setDefconAdjust01(0.5);
      setDefconMean01(0);
      return;
    }

    const rows = (playersByKey.get(activePlayerKey) || []).map((r) => ({ ...r }));
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
  }, [isModalOpen, activePlayerKey, playersByKey, teamLookup, computeMeasures]);

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
        goals: measures.Goal_Scored,
        assists: measures.Assists,
        saves: measures.Save_Pred,
        minutes: measures.Avg_Minutes,
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

  const modalMetricMeta = useMemo(() => {
    switch (modalChartMetric) {
      case "goals":
        return {
          label: "Goals",
          emptyText: "No goal data for this player.",
          helper: "Projected goals update live as you change minutes and shares.",
          format: (v) => Number(v).toFixed(2),
        };
      case "assists":
        return {
          label: "Assists",
          emptyText: "No assist data for this player.",
          helper: "Projected assists update live as you change minutes and shares.",
          format: (v) => Number(v).toFixed(2),
        };
      case "saves":
        return {
          label: "Saves",
          emptyText: "No save data for this player.",
          helper: "Projected saves update live as you change minutes and shares.",
          format: (v) => Number(v).toFixed(2),
        };
      case "defcon":
        return {
          label: "Defcon",
          emptyText: "No Defcon data for this player.",
          helper: "Projected Defcon updates live as you change minutes and shares.",
          format: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
        };
      case "points":
      default:
        return {
          label: "Points",
          emptyText: "No point data for this player.",
          helper: "Projected points update live as you change minutes and shares.",
          format: (v) => Number(v).toFixed(2),
        };
    }
  }, [modalChartMetric]);

  const logAdjustment = useCallback((entry) => {
    updateChanges((prev) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        ...entry,
      },
      ...(prev || []),
    ]);
  }, [updateChanges]);

  const formatAdjustmentValue = useCallback((a, field) => {
    const v = a[field];
    if (typeof v !== "number") return v;
    if (a.type === "Minutes") return v.toFixed(0);
    return v.toFixed(2);
  }, []);

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

  const handleSavePlayerChanges = useCallback(() => {
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

    const nextPlayers = playersState.map((p) => {
      if (getPlayerKey(p) !== activePlayerKey) return p;

      const gw = p.GW;
      const updated = { ...p };

      updated.Goal_share = newGoal;
      updated.Assist_share = newAssist;

      if (minutesDraft[gw] != null) updated.average_minutes = minutesDraft[gw];
      updated.defcon_adjust_01 = newDA;

      return updated;
    });

    setPlayersState(nextPlayers);
    updatePlayerData(() => nextPlayers);
    adjustmentsToLog.forEach(logAdjustment);
  }, [
    activePlayerKey,
    playersState,
    activePlayerFirstRow,
    hasPlayerChanges,
    modalBaselineRows,
    pendingGoalShare,
    pendingAssistShare,
    minutesDraft,
    defconAdjust01,
    defconMean01,
    getPlayerKey,
    updatePlayerData,
    logAdjustment,
  ]);

  const handleSaveAndClose = useCallback(() => {
    handleSavePlayerChanges();
    closeModal();
  }, [handleSavePlayerChanges, closeModal]);

  const scheduleGoalShareChange = useCallback((value) => {
    if (shareFrameRef.current) cancelAnimationFrame(shareFrameRef.current);
    shareFrameRef.current = requestAnimationFrame(() => setPendingGoalShare(value));
  }, []);

  const scheduleAssistShareChange = useCallback((value) => {
    if (assistFrameRef.current) cancelAnimationFrame(assistFrameRef.current);
    assistFrameRef.current = requestAnimationFrame(() => setPendingAssistShare(value));
  }, []);

  const scheduleDefconChange = useCallback((value) => {
    if (defconFrameRef.current) cancelAnimationFrame(defconFrameRef.current);
    defconFrameRef.current = requestAnimationFrame(() =>
      setDefconAdjust01(clamp01(value))
    );
  }, []);

  const updateMinutesFromClientY = useCallback((clientY) => {
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
  }, [activePlayerKey, draggingGW]);

  const handleCircleMouseDown = useCallback((gw, e) => {
    e.preventDefault();
    setDraggingGW(gw);
    dragGWRef.current = gw;
  }, []);

  const handleCircleTouchStart = useCallback((gw, e) => {
    setDraggingGW(gw);
    dragGWRef.current = gw;
    if (e.touches?.[0]) updateMinutesFromClientY(e.touches[0].clientY);
  }, [updateMinutesFromClientY]);

  useEffect(() => {
    return () => {
      if (shareFrameRef.current) cancelAnimationFrame(shareFrameRef.current);
      if (assistFrameRef.current) cancelAnimationFrame(assistFrameRef.current);
      if (defconFrameRef.current) cancelAnimationFrame(defconFrameRef.current);
      if (minutesFrameRef.current) cancelAnimationFrame(minutesFrameRef.current);
    };
  }, []);

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
                background: "rgba(95,143,123,0.12)",
                border: `1px solid rgba(95,143,123,0.35)`,
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
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #e2e8f0 100%)`,
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
                border: `1px solid rgba(95,143,123,0.35)`,
                background: "rgba(95,143,123,0.08)",
              }}
            >
              <Sparkles size={14} />
              Player Adjustment
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Player Adjustment Tool
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "#64748b" }}>
              Filter your player pool, inspect projected outputs by gameweek, and fine-tune
              shares, minutes, and Defcon with a cleaner workflow.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 w-full lg:w-auto">
            <StatCard icon={Users} label="Players" value={String(filteredPlayerRows.length)} />
            <StatCard
              icon={currentMeasureMeta.icon}
              label="Measure"
              value={currentMeasureMeta.short}
            />
            <StatCard icon={PencilLine} label="Changes" value={String(displayAdjustments.length)} />
            <button
              type="button"
              onClick={handleOpenStatisticalOptimizer}
              className="rounded-2xl px-4 py-3 text-left transition"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background: "linear-gradient(145deg, rgba(236,253,245,0.95), rgba(248,250,252,0.95))",
                color: PALETTE.beige,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: "#475569" }}>
                <Target size={14} />
                Optimizer
              </div>
              <div className="mt-1 text-sm font-semibold">Use Statistical Model</div>
            </button>
            <button
              type="button"
              onClick={handleResetData}
              className="rounded-2xl px-4 py-3 text-left transition"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background: "linear-gradient(145deg, rgba(236,253,245,0.95), rgba(248,250,252,0.95))",
                color: PALETTE.beige,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: "#475569" }}>
                <RotateCcw size={14} />
                Reset
              </div>
              <div className="mt-1 text-sm font-semibold">Reload model data</div>
            </button>
          </div>
        </header>

<div className="mb-6">
  <details
    open={showFilters}
    onToggle={(e) => setShowFilters(e.currentTarget.open)}
    className="overflow-visible rounded-[28px]"
    style={{
      position: "relative",
      zIndex: 30,
      border: `1px solid ${PALETTE.border}`,
      background: "#ffffff",
      boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
      backdropFilter: "blur(12px)",
    }}
  >
    <summary
      className="flex cursor-pointer list-none items-center justify-between px-4 py-4 sm:px-5 lg:px-6 text-left"
      style={{ outline: "none" }}
    >
      <div className="flex flex-col gap-1">
        <div
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: PALETTE.gold }}
        >
          <Filter size={16} />
          Filters and controls
        </div>
        <div className="text-xs" style={{ color: PALETTE.muted }}>
          Filter players by player, team, position, value, and gameweek horizon.
        </div>
      </div>

      <div
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"
        style={{
          border: `1px solid ${PALETTE.gold}`,
          background: "rgba(248,250,252,0.95)",
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
    </summary>

    <div className="px-4 pb-4 sm:px-5 sm:pb-5 lg:px-6 lg:pb-6 overflow-visible">
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
              background: "rgba(248,250,252,0.95)",
              color: "#64748b",
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
                background: "#f8fafc",
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
                background: "#f8fafc",
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
              background: "rgba(248,250,252,0.95)",
              color: "#64748b",
            }}
          >
            Total uses GW{" "}
            {Math.min(selectedGwStart ?? allGWs[0], selectedGwEnd ?? allGWs[allGWs.length - 1])}
            –{Math.max(selectedGwStart ?? allGWs[0], selectedGwEnd ?? allGWs[allGWs.length - 1])}
          </div>
        </FilterCard>
      </div>
    </div>
  </details>
</div>

        <div className="mb-6">
          <details
            className="overflow-visible rounded-[24px]"
            style={{
              border: `1px solid ${PALETTE.border}`,
              background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))",
              boxShadow: "0 12px 24px rgba(15,23,42,0.12)",
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <PencilLine size={16} style={{ color: PALETTE.gold }} />
                Changes made
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: "rgba(95,143,123,0.08)", color: PALETTE.gold }}
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
                      <div className="mt-1 text-sm" style={{ color: "#475569" }}>
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
                    background: "#f8fafc",
                    height: "36px",
                  }}
                >
                  <CurrentMeasureIcon size={14} style={{ color: PALETTE.gold }} />
                  <select
  value={selectedMeasure}
  onChange={(e) => setSelectedMeasure(e.target.value)}
  className="rounded-xl text-xs font-semibold outline-none"
  style={{
    background: "#ffffff",
    color: PALETTE.gold,
    border: "none",
    height: "32px",
    minWidth: "120px",
  }}
>
  <option value="Points"> Points</option>
  <option value="Goal_Scored">Goals</option>
  <option value="Assists"> Assists</option>
  <option value="Save_Pred"> Saves</option>
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
                      background: "#f8fafc",
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
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span>Name</span>
                    </div>
                  </th>

                  <th
                    className="px-4 py-3 text-left"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Position
                  </th>

                  <th
                    className="px-4 py-3 text-left"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Team
                  </th>

                  <th
                    className="px-4 py-3 text-right"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
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
                          background: "#ffffff",
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
                      background: "#ffffff",
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
                  <PlayerRow
                    key={row.nameKey}
                    row={row}
                    idx={idx}
                    allGWs={allGWs}
                    onOpen={openPlayerModal}
                  />
                ))}

                {filteredPlayerRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6 + allGWs.length}
                      className="px-4 py-8 text-center"
                      style={{ color: "#64748b" }}
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
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-700/85 p-4"
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
                      style={{ color: "#64748b" }}
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
                    background: "rgba(248,250,252,0.95)",
                    color: PALETTE.beige,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div
                className="mb-5 rounded-2xl p-4"
                style={{
                  border: `1px solid ${PALETTE.border}`,
                  background: "rgba(255,255,255,0.96)",
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: PALETTE.gold }}
                    >
                      Comparison Player
                    </div>
                    <div className="text-xs" style={{ color: PALETTE.muted }}>
                      Search and add one read-only player. Grey overlays show comparison values.
                    </div>
                  </div>

                  {comparisonSummary ? (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonPlayerKey(null);
                        setComparisonSearch("");
                      }}
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        border: `1px solid ${PALETTE.border}`,
                        background: "#f8fafc",
                        color: PALETTE.beige,
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: PALETTE.muted }}
                  />
                  <input
                    type="text"
                    value={comparisonSearch}
                    onChange={(e) => setComparisonSearch(e.target.value)}
                    placeholder={
                      comparisonSummary
                        ? "Search to replace comparison..."
                        : "Search player to compare..."
                    }
                    className="w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "#f8fafc",
                      color: PALETTE.beige,
                    }}
                  />

                  {comparisonSearch.trim().length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-56 overflow-y-auto rounded-xl"
                      style={{
                        border: `1px solid ${PALETTE.border}`,
                        background: "#ffffff",
                        boxShadow: "0 12px 24px rgba(15,23,42,0.12)",
                      }}
                    >
                      {comparisonSearchResults.length === 0 ? (
                        <div className="px-3 py-2 text-sm" style={{ color: PALETTE.muted }}>
                          No matching players.
                        </div>
                      ) : (
                        comparisonSearchResults.map((option) => (
                          <button
                            key={option.nameKey}
                            type="button"
                            onClick={() => {
                              setComparisonPlayerKey(option.nameKey);
                              setComparisonSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                            style={{
                              borderBottom: `1px solid ${PALETTE.border}`,
                              color: PALETTE.beige,
                              background: "#ffffff",
                            }}
                          >
                            <span className="truncate">{option.displayName}</span>
                            <span
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: PALETTE.muted }}
                            >
                              <TeamColorDot teamName={option.teamName} />
                              {option.teamName}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {comparisonSummary ? (
                  <div
                    className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(148,163,184,0.12)",
                      color: "#475569",
                    }}
                  >
                    <TeamColorDot teamName={comparisonSummary.teamName || ""} />
                    Comparing with {comparisonSummary.displayName}
                  </div>
                ) : null}
              </div>

              <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <FilterCard icon={CircleDot} label="Goal Share">
                  <div className="relative">
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
                    {comparisonFirstRow ? (
                      <div
                        className="pointer-events-none absolute top-[46%] h-4 w-4 -translate-y-1/2 rounded-full border-2"
                        style={{
                          left: `calc(${Math.max(
                            0,
                            Math.min(100, (Number(comparisonFirstRow.Goal_share) || 0) * 100)
                          )}% - 8px)`,
                          background: "#cbd5e1",
                          borderColor: "#64748b",
                        }}
                        title="Comparison player"
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm" style={{ color: "#64748b" }}>
                    <span>{Math.round((pendingGoalShare ?? 0) * 100)}%</span>
                    {comparisonFirstRow ? (
                      <span style={{ color: "#94a3b8" }}>
                        Compare {Math.round((Number(comparisonFirstRow.Goal_share) || 0) * 100)}%
                      </span>
                    ) : null}
                  </div>
                </FilterCard>

                <FilterCard icon={Footprints} label="Assist Share">
                  <div className="relative">
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
                    {comparisonFirstRow ? (
                      <div
                        className="pointer-events-none absolute top-[46%] h-4 w-4 -translate-y-1/2 rounded-full border-2"
                        style={{
                          left: `calc(${Math.max(
                            0,
                            Math.min(100, (Number(comparisonFirstRow.Assist_share) || 0) * 100)
                          )}% - 8px)`,
                          background: "#cbd5e1",
                          borderColor: "#64748b",
                        }}
                        title="Comparison player"
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm" style={{ color: "#64748b" }}>
                    <span>{Math.round((pendingAssistShare ?? 0) * 100)}%</span>
                    {comparisonFirstRow ? (
                      <span style={{ color: "#94a3b8" }}>
                        Compare {Math.round((Number(comparisonFirstRow.Assist_share) || 0) * 100)}%
                      </span>
                    ) : null}
                  </div>
                </FilterCard>

                <FilterCard icon={Shield} label="Defcon %">
                  <div className="relative">
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
                    {comparisonDefconAdjust01 != null ? (
                      <div
                        className="pointer-events-none absolute top-[46%] h-4 w-4 -translate-y-1/2 rounded-full border-2"
                        style={{
                          left: `calc(${Math.max(
                            0,
                            Math.min(100, clamp01(comparisonDefconAdjust01) * 100)
                          )}% - 8px)`,
                          background: "#cbd5e1",
                          borderColor: "#64748b",
                        }}
                        title="Comparison player"
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm" style={{ color: "#64748b" }}>
                    <span>{Math.round(clamp01(defconAdjust01) * 100)}%</span>
                    {comparisonDefconAdjust01 != null ? (
                      <span style={{ color: "#94a3b8" }}>
                        Compare {Math.round(clamp01(comparisonDefconAdjust01) * 100)}%
                      </span>
                    ) : null}
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
                      ? `linear-gradient(135deg, ${PALETTE.gold}, #8FBCA9)`
                      : "#e2e8f0",
                    color: hasPlayerChanges ? "#1e293b" : PALETTE.muted,
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
                        background: "#ffffff",
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

                        const comparisonPoints = points
                          .map((p) => {
                            const compareMinutes = comparisonMinutesByGw.get(Number(p.gw));
                            if (!Number.isFinite(compareMinutes)) return null;
                            const ratio =
                              (compareMinutes - MIN_MINUTES) /
                              (MAX_MINUTES - MIN_MINUTES || 1);
                            const y = height - padding - ratio * (height - 2 * padding);
                            return { ...p, compareMinutes, y };
                          })
                          .filter(Boolean);

                        return (
                          <>
                            {comparisonPoints.length > 0 ? (
                              <polyline
                                points={comparisonPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="2"
                                strokeDasharray="5 4"
                                opacity="0.8"
                              />
                            ) : null}
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
                                  fill="#64748b"
                                >
                                  {p.gw}
                                </text>
                                {Number.isFinite(comparisonMinutesByGw.get(Number(p.gw))) ? (
                                  <circle
                                    cx={p.x}
                                    cy={
                                      height -
                                      padding -
                                      ((comparisonMinutesByGw.get(Number(p.gw)) - MIN_MINUTES) /
                                        (MAX_MINUTES - MIN_MINUTES || 1)) *
                                        (height - 2 * padding)
                                    }
                                    r={7}
                                    fill="#cbd5e1"
                                    stroke="#94a3b8"
                                    strokeWidth="1.5"
                                  />
                                ) : null}
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
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">
                      Calculated {modalMetricMeta.label}
                    </h3>
                    <select
                      value={modalChartMetric}
                      onChange={(e) => setModalChartMetric(e.target.value)}
                      className="rounded-xl px-2 py-1 text-xs font-semibold outline-none"
                      style={{
                        border: `1px solid ${PALETTE.border}`,
                        background: "#f8fafc",
                        color: PALETTE.beige,
                      }}
                    >
                      <option value="points">Points</option>
                      <option value="goals">Goals</option>
                      <option value="assists">Assists</option>
                      <option value="saves">Saves</option>
                      <option value="defcon">Defcon</option>
                    </select>
                  </div>
                  <div className="mb-2 text-xs" style={{ color: PALETTE.muted }}>
                    {modalMetricMeta.helper}
                  </div>
                  {chartDataPoints.length === 0 ? (
                    <div className="text-sm">{modalMetricMeta.emptyText}</div>
                  ) : (
                    <svg
                      width="100%"
                      height="280"
                      viewBox="0 0 600 280"
                      preserveAspectRatio="none"
                      className="rounded-2xl"
                      style={{
                        border: `1px solid ${PALETTE.gold}`,
                        background: "#ffffff",
                      }}
                    >
                      {(() => {
                        const padding = 20;
                        const width = 600;
                        const height = 280;
                        const n = chartDataPoints.length;
                        const innerWidth = width - 2 * padding;
                        const vals = [
                          ...chartDataPoints.map((d) => Number(d[modalChartMetric]) || 0),
                          ...comparisonChartDataPoints.map((d) => Number(d[modalChartMetric]) || 0),
                        ];
                        const minP = vals.length > 0 ? Math.min(...vals) : 0;
                        const maxP = vals.length > 0 ? Math.max(...vals) : 1;
                        const range = maxP - minP || 1;
                        const yFromValue = (value) => {
                          const ratio = ((Number(value) || 0) - minP) / range;
                          return height - padding - ratio * (height - 2 * padding);
                        };
                        const zeroY = yFromValue(0);
                        const hasComparisonSeries = comparisonChartDataPoints.length > 0;
                        const slotWidth = n > 0 ? innerWidth / n : innerWidth;
                        const groupWidth = slotWidth * 0.74;
                        const barGap = hasComparisonSeries ? groupWidth * 0.12 : 0;
                        const barWidth = hasComparisonSeries
                          ? (groupWidth - barGap) / 2
                          : groupWidth * 0.72;

                        const bars = chartDataPoints.map((d, i) => {
                          const gw = Number(d.GW);
                          const value = Number(d[modalChartMetric]) || 0;
                          const compareValue = Number(comparisonPointsByGw.get(gw));
                          const hasCompare = Number.isFinite(compareValue);
                          const groupX = padding + i * slotWidth + (slotWidth - groupWidth) / 2;

                          const mainTopY = Math.min(yFromValue(value), zeroY);
                          const mainBottomY = Math.max(yFromValue(value), zeroY);
                          const mainX = hasComparisonSeries
                            ? groupX
                            : groupX + (groupWidth - barWidth) / 2;

                          const compareTopY = hasCompare
                            ? Math.min(yFromValue(compareValue), zeroY)
                            : null;
                          const compareBottomY = hasCompare
                            ? Math.max(yFromValue(compareValue), zeroY)
                            : null;
                          const compareX = groupX + barWidth + barGap;

                          return {
                            gw,
                            value,
                            xLabel: groupX + groupWidth / 2,
                            main: {
                              x: mainX,
                              y: mainTopY,
                              height: Math.max(1, mainBottomY - mainTopY),
                            },
                            compare: hasCompare
                              ? {
                                  value: compareValue,
                                  x: compareX,
                                  y: compareTopY,
                                  height: Math.max(1, compareBottomY - compareTopY),
                                }
                              : null,
                          };
                        });

                        return (
                          <>
                            {minP < 0 && maxP > 0 ? (
                              <line
                                x1={padding}
                                y1={zeroY}
                                x2={width - padding}
                                y2={zeroY}
                                stroke="#cbd5e1"
                                strokeWidth="1"
                                strokeDasharray="4 3"
                              />
                            ) : null}
                            {bars.map((b) => (
                              <g key={b.gw}>
                                {b.compare ? (
                                  <rect
                                    x={b.compare.x}
                                    y={b.compare.y}
                                    width={barWidth}
                                    height={b.compare.height}
                                    rx={3}
                                    fill="#cbd5e1"
                                    stroke="#94a3b8"
                                    strokeWidth="1"
                                  />
                                ) : null}
                                <rect
                                  x={b.main.x}
                                  y={b.main.y}
                                  width={barWidth}
                                  height={b.main.height}
                                  rx={3}
                                  fill={PALETTE.gold}
                                  stroke={PALETTE.black}
                                  strokeWidth="1"
                                />
                                <line
                                  x1={b.xLabel}
                                  y1={height - padding}
                                  x2={b.xLabel}
                                  y2={height - padding + 4}
                                  stroke="#555"
                                  strokeWidth="1"
                                />
                                <text
                                  x={b.xLabel}
                                  y={height - 5}
                                  fontSize="9"
                                  textAnchor="middle"
                                  fill="#64748b"
                                >
                                  {b.gw}
                                </text>
                                {b.compare ? (
                                  <text
                                    x={b.compare.x + barWidth / 2}
                                    y={b.compare.value >= 0 ? b.compare.y - 6 : b.compare.y + b.compare.height + 10}
                                    fontSize="9"
                                    textAnchor="middle"
                                    fill="#64748b"
                                  >
                                    {modalMetricMeta.format(b.compare.value)}
                                  </text>
                                ) : null}
                                <text
                                  x={b.main.x + barWidth / 2}
                                  y={b.value >= 0 ? b.main.y - 6 : b.main.y + b.main.height + 10}
                                  fontSize="9"
                                  textAnchor="middle"
                                  fill={PALETTE.beige}
                                >
                                  {modalMetricMeta.format(b.value)}
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



