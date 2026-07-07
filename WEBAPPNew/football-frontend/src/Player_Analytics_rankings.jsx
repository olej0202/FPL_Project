import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowUpDown,
  CalendarRange,
  ChevronDown,
  Clock3,
  DollarSign,
  Eye,
  EyeOff,
  Filter,
  Footprints,
  Hand,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Users,
  CircleDot,
  RotateCcw,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStatsData } from "./Contexts/StatsContext";
import { useOtherData } from "./Contexts/OtherContext";
import teamColors from "./utils/team_colors";
import teamLogos from "./utils/team_logos";

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
};

const POSITION_ORDER = {
  GK: 0,
  GKP: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
  FOR: 3,
};

const MEASURE_OPTIONS = [
  {
    value: "Points_prediction",
    label: "Points",
    description: "Predicted Points",
    icon: Star,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Goal_pred",
    label: "Goals",
    description: "Predicted Goals",
    icon: CircleDot,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Assist_pred",
    label: "Assist",
    description: "Predicted Assists",
    icon: Footprints,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Bonus_pred",
    label: "Bonus",
    description: "Predicted Bonus",
    icon: Sparkles,
    format: (n) => n.toFixed(2),
  },
  {
    value: "GC_pred",
    label: "CS",
    description: "Predicted Clean Sheets",
    icon: Shield,
    format: (n) => n.toFixed(2),
  },
  {
    value: "CBI_pred",
    label: "Defcon %",
    description: "Predicted Defcon",
    icon: Activity,
    format: (n) => n.toFixed(2),
  },
  {
    value: "average_minutes",
    label: "Minutes",
    description: "Predicted Minutes",
    icon: Clock3,
    format: (n) => n.toFixed(1),
  },
  {
    value: "Save_pred",
    label: "Save Points",
    description: "Predicted Save Points",
    icon: Hand,
    format: (n) => n.toFixed(2),
  },
];

function firstFinite(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function toNum(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function teamKeyVariants(value) {
  const base = String(value ?? "").trim();
  if (!base) return [];
  const variants = new Set([norm(base)]);
  const asNum = Number(base);
  if (Number.isFinite(asNum)) {
    variants.add(norm(String(asNum)));
    variants.add(norm(String(Math.trunc(asNum))));
  }
  return Array.from(variants).filter(Boolean);
}

function clampRange(range, min, max) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const low = Number(range?.[0]);
  const high = Number(range?.[1]);
  const start = Number.isFinite(low) ? Math.max(safeMin, Math.min(safeMax, low)) : safeMin;
  const end = Number.isFinite(high) ? Math.max(safeMin, Math.min(safeMax, high)) : safeMax;
  return [Math.min(start, end), Math.max(start, end)];
}

function getMeasureMeta(measure) {
  return MEASURE_OPTIONS.find((option) => option.value === measure) || MEASURE_OPTIONS[0];
}

function getPlayerKey(row) {
  const id = row?.id ?? row?.element ?? row?.code ?? row?.name ?? row?.web_name;
  const teamCode = row?.team_code ?? row?.Team ?? "";
  return `${String(id)}__${String(teamCode)}`;
}

function getMeasureValue(row, measure) {
  switch (measure) {
    case "Points_prediction":
      return firstFinite(row?.Points_prediction, row?.Point_prediction);
    case "Goal_pred":
      return firstFinite(row?.Goal_pred);
    case "Assist_pred":
      return firstFinite(row?.Assist_pred);
    case "Bonus_pred":
      return firstFinite(row?.Bonus_pred, row?.Bonus_pred2);
    case "GC_pred":
      return firstFinite(row?.GC_pred);
    case "CBI_pred":
      return firstFinite(row?.CBI_pred, row?.DefCon);
    case "average_minutes":
      return firstFinite(row?.average_minutes);
    case "Save_pred":
      return firstFinite(row?.Save_pred);
    default:
      return 0;
  }
}

function ownershipPercent(row) {
  const raw = firstFinite(
    row?.selected_pct,
    row?.selected_by_percent,
    row?.ownership,
    row?.selected
  );
  if (!Number.isFinite(raw)) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

function formatHAV(home) {
  if (home === true || home === "Home" || home === "H") return "H";
  if (home === false || home === "Away" || home === "A") return "A";
  return "-";
}

function formatPrice(value) {
  return `\u00A3${Number(value || 0).toFixed(1)}`;
}

function getRowTeamName(row, teamNamesByCode) {
  const code = row?.team_code ?? row?.Team ?? row?.team_id ?? row?.code;
  return firstText(
    row?.team_name,
    row?.team,
    row?.Team,
    code != null ? teamNamesByCode.get(String(code)) : "",
    code
  );
}

function getTeamCandidates(row, teamName = "") {
  const values = [
    teamName,
    row?.team_name,
    row?.team,
    row?.Team,
    row?.team_code,
    row?.team_id,
    row?.code,
  ];
  const set = new Set();
  for (const value of values) {
    for (const variant of teamKeyVariants(value)) {
      set.add(variant);
    }
  }
  return set;
}

function buildFixtureMetaById(fixtures) {
  const map = new Map();

  for (const row of fixtures || []) {
    const fixId = firstText(row?.fix_id, row?.fixture_id, row?.id);
    if (!fixId) continue;

    const key = String(fixId);
    if (!map.has(key)) {
      map.set(key, { rows: [], teams: [] });
    }

    const entry = map.get(key);
    entry.rows.push(row);

    const teamName = firstText(row?.team_name, row?.name, row?.Team, row?.team);
    const teamCode = firstText(row?.team_code, row?.team_id, row?.code);
    const opponent = firstText(
      row?.opponent_name,
      row?.Opponent_team,
      row?.opponent_team,
      row?.Opponent,
      row?.opponent
    );

    const teamEntry = {
      name: teamName,
      code: teamCode,
      opponent,
      venue: formatHAV(row?.Home ?? row?.home ?? row?.Venue),
    };

    const existing = entry.teams.find(
      (item) => norm(item.name) === norm(teamEntry.name) && norm(item.code) === norm(teamEntry.code)
    );
    if (!existing) {
      entry.teams.push(teamEntry);
    }
  }

  return map;
}

function resolveFixtureDetail(playerRow, gwDetail, fixtureMetaById, teamNamesByCode) {
  const rows = Array.isArray(gwDetail?.rawRows) && gwDetail.rawRows.length ? gwDetail.rawRows : [playerRow];
  const teamName = getRowTeamName(playerRow, teamNamesByCode);
  const details = [];

  for (const row of rows) {
    if (!row) continue;

    const fixPercentage = toNum(row?.fix_percentage, null);
    if (fixPercentage === 0) continue;

    const fixId = firstText(row?.fix_id, row?.fixture_id, gwDetail?.fixId, playerRow?.fix_id, playerRow?.fixture_id);
    const meta = fixId ? fixtureMetaById.get(String(fixId)) : null;
    const rowTeamName = getRowTeamName(row, teamNamesByCode) || teamName;
    const playerCandidates = getTeamCandidates(row, rowTeamName);

    let opponent = firstText(
      row?.opponent_name,
      row?.Opponent_team,
      row?.opponent_team,
      row?.Opponent,
      row?.opponent
    );
    let venue = formatHAV(row?.Home ?? row?.home ?? row?.Venue);

    if (meta?.teams?.length) {
      const matchingTeam = meta.teams.find((team) => {
        const candidates = new Set([
          ...teamKeyVariants(team?.name),
          ...teamKeyVariants(team?.code),
        ]);
        return Array.from(candidates).some((candidate) => playerCandidates.has(candidate));
      });

      const otherTeam = meta.teams.find((team) => {
        const candidates = new Set([
          ...teamKeyVariants(team?.name),
          ...teamKeyVariants(team?.code),
        ]);
        return !Array.from(candidates).some((candidate) => playerCandidates.has(candidate));
      });

      if (matchingTeam) {
        opponent = firstText(matchingTeam.opponent, otherTeam?.name, otherTeam?.code, opponent);
        venue = matchingTeam.venue || venue;
      } else if (otherTeam) {
        opponent = firstText(otherTeam.name, otherTeam.code, opponent);
      }
    }

    details.push({
      fixId: fixId || "-",
      opponent: opponent || "",
      venue: venue || "",
      teamName: rowTeamName || teamName || "-",
    });
  }

  const unique = [];
  for (const detail of details) {
    const key = `${detail.fixId}__${detail.opponent}__${detail.venue}`;
    if (!unique.some((item) => `${item.fixId}__${item.opponent}__${item.venue}` === key)) {
      unique.push(detail);
    }
  }

  return {
    fixId: unique.map((item) => item.fixId).filter(Boolean).join(" / ") || "-",
    teamName: unique[0]?.teamName || teamName || "-",
    opponent: unique.map((item) => item.opponent).filter(Boolean).join(" / "),
    venue: unique.map((item) => item.venue).filter(Boolean).join(" / "),
  };
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

function FilterCard({ icon, label, children }) {
  return (
    <div
      className="min-w-0 rounded-2xl p-4"
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
        background: active ? `linear-gradient(135deg, ${PALETTE.gold}, #8FBCA9)` : "#f8fafc",
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
        zIndex: 30,
      });
    } else {
      setPanelStyle({
        position: "absolute",
        left: "0px",
        top: `calc(100% + ${gap}px)`,
        width: `${rect.width}px`,
        maxHeight: "280px",
        zIndex: 30,
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
    if (!isOpen) return undefined;

    const handleViewportChange = () => updatePosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onClickOutside = (event) => {
      const insideTrigger = triggerRef.current?.contains(event.target);
      const insidePanel = panelRef.current?.contains(event.target);
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
          setIsOpen((prev) => !prev);
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
                className="w-full rounded-xl py-2 pl-9 pr-3 text-[16px] outline-none md:text-sm"
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
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
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
  displayedGWs,
  selectedMeasure,
  formatter,
  onOpen,
}) {
  return (
    <tr
      onClick={() => onOpen(row.nameKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(row.nameKey);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open player details for ${row.displayName}`}
      className="cursor-pointer transition-all duration-150 focus:outline-none"
      style={{
        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
      }}
    >
      <td
        className="sticky left-0 z-[1] w-[140px] max-w-[140px] px-3 py-3 font-semibold sm:w-[220px] sm:max-w-[220px] sm:px-4"
        style={{
          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div className="truncate text-[13px] sm:text-sm" title={row.displayName}>
          {row.displayName}
        </div>
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.position || "-"}
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="inline-flex items-center gap-2">
          <TeamColorDot teamName={row.teamName} />
          <span>{row.teamName || row.teamCode || "-"}</span>
        </div>
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {Number.isFinite(row.value) ? formatPrice(row.value) : "-"}
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {Number.isFinite(row.selected) ? `${row.selected.toFixed(1)}%` : "-"}
      </td>

      {displayedGWs.map((gw) => {
        const cell = row.gwMeasures[gw]?.[selectedMeasure] ?? 0;
        return (
          <td key={gw} className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
            {formatter(cell)}
          </td>
        );
      })}

      <td
        className="px-4 py-3 text-right font-semibold"
        style={{ borderBottom: "1px solid #e2e8f0", color: PALETTE.gold }}
      >
        {formatter(row.totalMeasure)}
      </td>
    </tr>
  );
});

export default function Player_analytics_rankings() {
  const { fetchIfNeeded, loading, PlayersData, TeamData, dataVersion } = useStatsData();
  const { fetchIfNeeded: fetchOtherIfNeeded, FixtureData, dataVersion: otherVersion } = useOtherData();

  const [showFilters, setShowFilters] = useState(true);
  const [selectedMeasure, setSelectedMeasure] = useState("Points_prediction");
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState([]);
  const [selectedTeamCodes, setSelectedTeamCodes] = useState([]);
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [valueRange, setValueRange] = useState([0, 15]);
  const [selectedRange, setSelectedRange] = useState([0, 100]);
  const [selectedGwStart, setSelectedGwStart] = useState(null);
  const [selectedGwEnd, setSelectedGwEnd] = useState(null);
  const [sortConfig, setSortConfig] = useState({ type: "total", gw: null, direction: "desc" });
  const [activePlayerKey, setActivePlayerKey] = useState(null);
  const [activeChartMeasure, setActiveChartMeasure] = useState("Points_prediction");
  const [activeDetailGw, setActiveDetailGw] = useState(null);
  const [comparisonSearch, setComparisonSearch] = useState("");
  const [comparisonPlayerKey, setComparisonPlayerKey] = useState(null);

  useEffect(() => {
    fetchIfNeeded();
    fetchOtherIfNeeded();
  }, [fetchIfNeeded, fetchOtherIfNeeded]);

  const playerRows = useMemo(
    () => (Array.isArray(PlayersData?.current) ? PlayersData.current : []),
    [PlayersData, dataVersion]
  );

  const teamRows = useMemo(
    () => (Array.isArray(TeamData?.current) ? TeamData.current : []),
    [TeamData, dataVersion]
  );

  const fixtureRows = useMemo(
    () => (Array.isArray(FixtureData?.current) ? FixtureData.current : []),
    [FixtureData, otherVersion]
  );

  const allGWs = useMemo(() => {
    const set = new Set();
    for (const row of playerRows) {
      const gw = Number(row?.GW);
      if (Number.isFinite(gw)) set.add(gw);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [playerRows]);

  const teamNamesByCode = useMemo(() => {
    const lookup = new Map();

    for (const row of teamRows) {
      const code = row?.team_code ?? row?.code ?? row?.Code ?? row?.team_id ?? row?.id;
      const name = row?.team_name ?? row?.name ?? row?.Team ?? row?.team;
      if (code != null && name) lookup.set(String(code), String(name));
    }

    for (const row of playerRows) {
      const code = row?.team_code ?? row?.Team;
      const name = row?.team_name ?? row?.team;
      if (code != null && name && !lookup.has(String(code))) {
        lookup.set(String(code), String(name));
      }
    }

    return lookup;
  }, [playerRows, teamRows]);

  const fixtureMetaById = useMemo(() => buildFixtureMetaById(fixtureRows), [fixtureRows]);

  const {
    playerTableRowsBase,
    playerOptions,
    teamOptions,
    allPositions,
    globalMinValue,
    globalMaxValue,
    globalMinSelected,
    globalMaxSelected,
  } = useMemo(() => {
    const grouped = new Map();

    for (const row of playerRows) {
      const key = getPlayerKey(row);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const rows = [];
    const positions = new Set();
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minSelected = Infinity;
    let maxSelected = -Infinity;

    for (const [nameKey, rowsForPlayer] of grouped.entries()) {
      const sortedRows = [...rowsForPlayer].sort((a, b) => Number(a?.GW) - Number(b?.GW));
      const latest = sortedRows.at(-1);
      if (!latest) continue;

      const teamCode = String(latest?.team_code ?? latest?.Team ?? "");
      const teamName = getRowTeamName(latest, teamNamesByCode) || teamCode;
      const value = firstFinite(latest?.value);
      const selected = ownershipPercent(latest);
      const position = latest?.position ? String(latest.position) : "";
      const displayName = latest?.web_name || latest?.name || "Unknown";
      const playerId = firstText(latest?.id, latest?.element, latest?.code, latest?.nameKey, nameKey);

      positions.add(position);
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
      minSelected = Math.min(minSelected, selected);
      maxSelected = Math.max(maxSelected, selected);

      const gwMeasures = {};
      const gwDetails = {};
      for (const row of sortedRows) {
        const gw = Number(row?.GW);
        if (!Number.isFinite(gw)) continue;
        const bucket = gwMeasures[gw] || {
          Points_prediction: 0,
          Goal_pred: 0,
          Assist_pred: 0,
          Bonus_pred: 0,
          GC_pred: 0,
          CBI_pred: 0,
          average_minutes: 0,
          Save_pred: 0,
        };

        bucket.Points_prediction += getMeasureValue(row, "Points_prediction");
        bucket.Goal_pred += getMeasureValue(row, "Goal_pred");
        bucket.Assist_pred += getMeasureValue(row, "Assist_pred");
        bucket.Bonus_pred += getMeasureValue(row, "Bonus_pred");
        bucket.GC_pred += getMeasureValue(row, "GC_pred");
        bucket.CBI_pred += getMeasureValue(row, "CBI_pred");
        bucket.average_minutes += getMeasureValue(row, "average_minutes");
        bucket.Save_pred += getMeasureValue(row, "Save_pred");

        gwMeasures[gw] = bucket;

        if (!gwDetails[gw]) {
          gwDetails[gw] = {
            gw,
            rawRows: [],
            fixId: firstText(row?.fix_id, row?.fixture_id),
            minutes: 0,
          };
        }

        gwDetails[gw].rawRows.push(row);
        gwDetails[gw].minutes += getMeasureValue(row, "average_minutes");
        if (!gwDetails[gw].fixId) {
          gwDetails[gw].fixId = firstText(row?.fix_id, row?.fixture_id);
        }
      }

      rows.push({
        nameKey,
        playerId,
        displayName,
        name: latest?.name || displayName,
        web_name: latest?.web_name || displayName,
        position,
        teamCode,
        teamName,
        value,
        selected,
        gwMeasures,
        gwDetails,
        seriesRows: sortedRows,
      });
    }

    const sortedRows = rows.sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || "")
    );

    const sortedPositions = Array.from(positions)
      .filter(Boolean)
      .sort((a, b) => {
        const aOrder = POSITION_ORDER[a] ?? 99;
        const bOrder = POSITION_ORDER[b] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.localeCompare(b);
      });

    return {
      playerTableRowsBase: sortedRows,
      playerOptions: sortedRows.map((row) => ({
        value: row.nameKey,
        label: row.displayName,
      })),
      teamOptions: Array.from(teamNamesByCode.entries())
        .map(([code, name]) => ({ value: String(code), label: String(name) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      allPositions: sortedPositions,
      globalMinValue: minValue === Infinity ? 0 : minValue,
      globalMaxValue: maxValue === -Infinity ? 15 : maxValue,
      globalMinSelected: minSelected === Infinity ? 0 : minSelected,
      globalMaxSelected: maxSelected === -Infinity ? 100 : maxSelected,
    };
  }, [playerRows, teamNamesByCode]);

  useEffect(() => {
    if (!allGWs.length) return;

    const minGW = allGWs[0];
    const maxGW = allGWs[allGWs.length - 1];

    setSelectedGwStart((prev) => {
      if (!Number.isFinite(prev) || prev < minGW || prev > maxGW) return minGW;
      return prev;
    });
    setSelectedGwEnd((prev) => {
      if (!Number.isFinite(prev) || prev < minGW || prev > maxGW) return maxGW;
      return prev;
    });
  }, [allGWs]);

  useEffect(() => {
    setValueRange((prev) => clampRange(prev, globalMinValue, globalMaxValue));
  }, [globalMinValue, globalMaxValue]);

  useEffect(() => {
    setSelectedRange((prev) => clampRange(prev, globalMinSelected, globalMaxSelected));
  }, [globalMinSelected, globalMaxSelected]);

  const normalizedGwRange = useMemo(() => {
    if (!allGWs.length) {
      return { start: 1, end: 38, min: 1, max: 38 };
    }

    const min = allGWs[0];
    const max = allGWs[allGWs.length - 1];
    const start = Number.isFinite(Number(selectedGwStart)) ? Number(selectedGwStart) : min;
    const end = Number.isFinite(Number(selectedGwEnd)) ? Number(selectedGwEnd) : max;

    return {
      start: Math.max(min, Math.min(max, Math.min(start, end))),
      end: Math.max(min, Math.min(max, Math.max(start, end))),
      min,
      max,
    };
  }, [allGWs, selectedGwEnd, selectedGwStart]);

  const displayedGWs = useMemo(() => {
    return allGWs.filter((gw) => gw >= normalizedGwRange.start && gw <= normalizedGwRange.end);
  }, [allGWs, normalizedGwRange.end, normalizedGwRange.start]);

  useEffect(() => {
    if (sortConfig.type !== "gw") return;
    if (!displayedGWs.includes(Number(sortConfig.gw))) {
      setSortConfig({ type: "total", gw: null, direction: "desc" });
    }
  }, [displayedGWs, sortConfig]);

  const filteredPlayerRows = useMemo(() => {
    const nameSearch = playerNameFilter.trim().toLowerCase();
    const playerSet = selectedPlayerKeys.length ? new Set(selectedPlayerKeys) : null;
    const teamSet = selectedTeamCodes.length ? new Set(selectedTeamCodes) : null;
    const positionSet = selectedPositions.length ? new Set(selectedPositions) : null;

    let rows = playerTableRowsBase
      .filter((row) => {
        if (selectedMeasure === "Save_pred" && !["GK", "GKP"].includes(row.position)) return false;
        if (playerSet && !playerSet.has(row.nameKey)) return false;
        if (teamSet && !teamSet.has(row.teamCode)) return false;
        if (positionSet && !positionSet.has(row.position)) return false;
        if (row.value < valueRange[0] || row.value > valueRange[1]) return false;
        if (row.selected < selectedRange[0] || row.selected > selectedRange[1]) return false;
        if (!nameSearch) return true;

        const display = String(row.displayName || "").toLowerCase();
        const fullName = String(row.name || "").toLowerCase();
        return display.includes(nameSearch) || fullName.includes(nameSearch);
      })
      .map((row) => {
        let totalMeasure = 0;
        for (const gw of displayedGWs) {
          totalMeasure += row.gwMeasures[gw]?.[selectedMeasure] ?? 0;
        }
        return {
          ...row,
          totalMeasure,
        };
      });

    rows.sort((a, b) => {
      const directionFactor = sortConfig.direction === "asc" ? 1 : -1;
      let left = 0;
      let right = 0;

      if (sortConfig.type === "gw" && sortConfig.gw != null) {
        left = a.gwMeasures[sortConfig.gw]?.[selectedMeasure] ?? 0;
        right = b.gwMeasures[sortConfig.gw]?.[selectedMeasure] ?? 0;
      } else {
        left = a.totalMeasure;
        right = b.totalMeasure;
      }

      if (left !== right) return (left - right) * directionFactor;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

    return rows;
  }, [
    displayedGWs,
    playerNameFilter,
    playerTableRowsBase,
    selectedMeasure,
    selectedPlayerKeys,
    selectedPositions,
    selectedRange,
    selectedTeamCodes,
    sortConfig,
    valueRange,
  ]);

  const activePlayerSummary = useMemo(
    () => playerTableRowsBase.find((row) => row.nameKey === activePlayerKey) || null,
    [activePlayerKey, playerTableRowsBase]
  );

  const comparisonSearchResults = useMemo(() => {
    const term = comparisonSearch.trim().toLowerCase();
    if (!term || !activePlayerKey) return [];

    return playerTableRowsBase
      .filter((row) => row.nameKey !== activePlayerKey)
      .filter((row) => {
        const display = String(row.displayName || "").toLowerCase();
        const fullName = String(row.name || "").toLowerCase();
        const teamName = String(row.teamName || "").toLowerCase();
        return display.includes(term) || fullName.includes(term) || teamName.includes(term);
      })
      .slice(0, 8);
  }, [activePlayerKey, comparisonSearch, playerTableRowsBase]);

  const comparisonSummary = useMemo(
    () => playerTableRowsBase.find((row) => row.nameKey === comparisonPlayerKey) || null,
    [comparisonPlayerKey, playerTableRowsBase]
  );

  useEffect(() => {
    if (!activePlayerSummary) return;
    setActiveChartMeasure(selectedMeasure);
  }, [activePlayerSummary, selectedMeasure]);

  useEffect(() => {
    if (!activePlayerSummary) {
      setActiveDetailGw(null);
      return;
    }

    const preferred = displayedGWs.find((gw) => activePlayerSummary.gwDetails[gw]);
    const firstAvailable = Object.keys(activePlayerSummary.gwDetails)
      .map((gw) => Number(gw))
      .filter((gw) => Number.isFinite(gw))
      .sort((a, b) => a - b)[0];

    setActiveDetailGw((prev) => {
      if (Number.isFinite(prev) && activePlayerSummary.gwDetails[prev]) return prev;
      return preferred ?? firstAvailable ?? null;
    });
  }, [activePlayerSummary, displayedGWs]);

  const activeChartData = useMemo(() => {
    if (!activePlayerSummary) return [];

    const sourceGws = displayedGWs.length
      ? displayedGWs
      : Object.keys(activePlayerSummary.gwMeasures)
          .map((gw) => Number(gw))
          .filter((gw) => Number.isFinite(gw))
          .sort((a, b) => a - b);

    return sourceGws.map((gw) => {
      const gwDetail = activePlayerSummary.gwDetails[gw] || null;
      const representativeRow = gwDetail?.rawRows?.[0] || activePlayerSummary.seriesRows?.find((row) => Number(row?.GW) === gw) || null;
      const fixtureDetail = representativeRow
        ? resolveFixtureDetail(representativeRow, gwDetail, fixtureMetaById, teamNamesByCode)
        : { opponent: "", venue: "", fixId: "-", teamName: activePlayerSummary.teamName };

      return {
        gw,
        label: `GW ${gw}`,
        value: activePlayerSummary.gwMeasures[gw]?.[activeChartMeasure] ?? 0,
        compareValue: comparisonSummary?.gwMeasures?.[gw]?.[activeChartMeasure] ?? null,
        minutes: activePlayerSummary.gwMeasures[gw]?.average_minutes ?? 0,
        opponent: fixtureDetail.opponent,
        venue: fixtureDetail.venue,
        fixId: fixtureDetail.fixId,
      };
    });
  }, [activeChartMeasure, activePlayerSummary, comparisonSummary, displayedGWs, fixtureMetaById, teamNamesByCode]);

  const activeDetail = useMemo(() => {
    if (!activePlayerSummary || !Number.isFinite(activeDetailGw)) return null;

    const gwDetail = activePlayerSummary.gwDetails[activeDetailGw];
    if (!gwDetail) return null;

    const representativeRow = gwDetail.rawRows?.[0] || null;
    const fixtureDetail = representativeRow
      ? resolveFixtureDetail(representativeRow, gwDetail, fixtureMetaById, teamNamesByCode)
      : { opponent: "", venue: "", fixId: gwDetail.fixId || "-", teamName: activePlayerSummary.teamName };

    return {
      gw: activeDetailGw,
      fixId: fixtureDetail.fixId,
      teamName: fixtureDetail.teamName,
      opponent: fixtureDetail.opponent,
      venue: fixtureDetail.venue,
      minutes: activePlayerSummary.gwMeasures[activeDetailGw]?.average_minutes ?? gwDetail.minutes ?? 0,
      measureValue: activePlayerSummary.gwMeasures[activeDetailGw]?.[activeChartMeasure] ?? 0,
    };
  }, [activeChartMeasure, activeDetailGw, activePlayerSummary, fixtureMetaById, teamNamesByCode]);

  const currentMeasureMeta = useMemo(() => getMeasureMeta(selectedMeasure), [selectedMeasure]);
  const CurrentMeasureIcon = currentMeasureMeta.icon;

  const handleSortByGW = useCallback((gw) => {
    setSortConfig((prev) => {
      if (prev.type === "gw" && prev.gw === gw) {
        return {
          type: "gw",
          gw,
          direction: prev.direction === "desc" ? "asc" : "desc",
        };
      }
      return { type: "gw", gw, direction: "desc" };
    });
  }, []);

  const handleSortByTotal = useCallback(() => {
    setSortConfig((prev) => {
      if (prev.type === "total") {
        return {
          type: "total",
          gw: null,
          direction: prev.direction === "desc" ? "asc" : "desc",
        };
      }
      return { type: "total", gw: null, direction: "desc" };
    });
  }, []);

  const handleOpenPlayerCard = useCallback(
    (playerKey) => {
      setActivePlayerKey(playerKey);
      setActiveChartMeasure(selectedMeasure);
      setComparisonSearch("");
      setComparisonPlayerKey(null);
    },
    [selectedMeasure]
  );

  const handleClosePlayerCard = useCallback(() => {
    setActivePlayerKey(null);
    setActiveDetailGw(null);
    setComparisonSearch("");
    setComparisonPlayerKey(null);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSelectedMeasure("Points_prediction");
    setSelectedPlayerKeys([]);
    setSelectedTeamCodes([]);
    setSelectedPositions([]);
    setPlayerNameFilter("");
    setValueRange([globalMinValue, globalMaxValue]);
    setSelectedRange([globalMinSelected, globalMaxSelected]);
    setSelectedGwStart(allGWs[0] ?? null);
    setSelectedGwEnd(allGWs[allGWs.length - 1] ?? null);
    setSortConfig({ type: "total", gw: null, direction: "desc" });
    setActivePlayerKey(null);
    setActiveDetailGw(null);
    setComparisonSearch("");
    setComparisonPlayerKey(null);
  }, [allGWs, globalMaxSelected, globalMaxValue, globalMinSelected, globalMinValue]);

  const isDataReady = playerRows.length > 0;

  if (!isDataReady && loading) {
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
                border: "1px solid rgba(95,143,123,0.35)",
              }}
            >
              <Sparkles size={24} style={{ color: PALETTE.gold }} />
            </div>
            <div className="text-lg font-semibold">Loading player rankings</div>
            <div className="mt-2 text-sm" style={{ color: PALETTE.muted }}>
              Preparing player projections and team lookups.
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
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              style={{
                color: PALETTE.gold,
                border: "1px solid rgba(95,143,123,0.35)",
                background: "rgba(95,143,123,0.08)",
              }}
            >
              <Sparkles size={14} />
              AI-Model
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              AI-Model
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "#64748b" }}>
              AI-model player predictions not adjustable
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="w-full rounded-2xl px-4 py-3 text-left transition sm:w-[240px]"
            style={{
              border: `1px solid ${PALETTE.gold}`,
              background: "linear-gradient(145deg, rgba(236,253,245,0.95), rgba(248,250,252,0.95))",
              color: PALETTE.beige,
            }}
          >
            <div
              className="flex items-center gap-2 text-[11px] uppercase tracking-wide"
              style={{ color: "#475569" }}
            >
              <RotateCcw size={14} />
              Reset
            </div>
            <div className="mt-1 text-sm font-semibold">Reset filters and sorting</div>
          </button>
        </header>

        <div className="mb-6">
          <details
            open={showFilters}
            onToggle={(e) => setShowFilters(e.currentTarget.open)}
            className="overflow-visible rounded-[28px] transition-all duration-300"
            style={{
              position: "relative",
              zIndex: 1,
              border: `1px solid ${PALETTE.border}`,
              background: "#ffffff",
              boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
              backdropFilter: "blur(12px)",
            }}
          >
            <summary
              className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-left sm:px-5 lg:px-6"
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
                  Filter players by name, team, position, price, selected percentage, and gameweek horizon.
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

            <div className="overflow-visible px-4 pb-4 sm:px-5 sm:pb-5 lg:px-6 lg:pb-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FilterCard icon={Users} label="Players">
                  <SearchableMultiSelect
                    label="Players"
                    options={playerOptions}
                    selectedValues={selectedPlayerKeys}
                    onChange={setSelectedPlayerKeys}
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
                    <PillButton active={selectedPositions.length === 0} onClick={() => setSelectedPositions([])}>
                      Clear
                    </PillButton>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {allPositions.map((position) => (
                      <PillButton
                        key={position}
                        active={selectedPositions.includes(position)}
                        onClick={() =>
                          setSelectedPositions((prev) =>
                            prev.includes(position)
                              ? prev.filter((item) => item !== position)
                              : [...prev, position]
                          )
                        }
                      >
                        {position}
                      </PillButton>
                    ))}
                  </div>
                </FilterCard>

                <FilterCard icon={DollarSign} label="£ range">
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                        Min £ {valueRange[0].toFixed(1)}
                      </div>
                      <input
                        type="range"
                        min={globalMinValue}
                        max={globalMaxValue}
                        step={0.1}
                        value={valueRange[0]}
                        onChange={(e) =>
                          setValueRange(([_, max]) =>
                            clampRange([Number(e.target.value), max], globalMinValue, globalMaxValue)
                          )
                        }
                        className="w-full"
                        style={{ accentColor: PALETTE.gold }}
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                        Max £ {valueRange[1].toFixed(1)}
                      </div>
                      <input
                        type="range"
                        min={globalMinValue}
                        max={globalMaxValue}
                        step={0.1}
                        value={valueRange[1]}
                        onChange={(e) =>
                          setValueRange(([min]) =>
                            clampRange([min, Number(e.target.value)], globalMinValue, globalMaxValue)
                          )
                        }
                        className="w-full"
                        style={{ accentColor: PALETTE.gold }}
                      />
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl px-3 py-2 text-sm"
                    style={{
                      border: "1px solid rgba(118,175,160,0.38)",
                      background: "rgba(118,175,160,0.10)",
                      color: PALETTE.gold,
                    }}
                  >
                    £{valueRange[0].toFixed(1)} - £{valueRange[1].toFixed(1)}
                  </div>
                </FilterCard>

                <FilterCard icon={Activity} label="Selected % range">
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                        Min selected {selectedRange[0].toFixed(1)}%
                      </div>
                      <input
                        type="range"
                        min={globalMinSelected}
                        max={globalMaxSelected}
                        step={0.1}
                        value={selectedRange[0]}
                        onChange={(e) =>
                          setSelectedRange(([_, max]) =>
                            clampRange([Number(e.target.value), max], globalMinSelected, globalMaxSelected)
                          )
                        }
                        className="w-full"
                        style={{ accentColor: PALETTE.gold }}
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                        Max selected {selectedRange[1].toFixed(1)}%
                      </div>
                      <input
                        type="range"
                        min={globalMinSelected}
                        max={globalMaxSelected}
                        step={0.1}
                        value={selectedRange[1]}
                        onChange={(e) =>
                          setSelectedRange(([min]) =>
                            clampRange([min, Number(e.target.value)], globalMinSelected, globalMaxSelected)
                          )
                        }
                        className="w-full"
                        style={{ accentColor: PALETTE.gold }}
                      />
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl px-3 py-2 text-sm"
                    style={{
                      border: "1px solid rgba(118,175,160,0.38)",
                      background: "rgba(118,175,160,0.10)",
                      color: PALETTE.gold,
                    }}
                  >
                    {selectedRange[0].toFixed(1)}% - {selectedRange[1].toFixed(1)}%
                  </div>
                </FilterCard>

                <FilterCard icon={CalendarRange} label="GW horizon">
                  {allGWs.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                          From GW {normalizedGwRange.start}
                        </div>
                        <input
                          type="range"
                          min={normalizedGwRange.min}
                          max={normalizedGwRange.max}
                          step={1}
                          value={normalizedGwRange.start}
                          onChange={(e) => setSelectedGwStart(Number(e.target.value))}
                          className="w-full"
                          style={{ accentColor: PALETTE.gold }}
                        />
                      </div>

                      <div>
                        <div className="mb-1 text-xs font-medium" style={{ color: "#64748b" }}>
                          To GW {normalizedGwRange.end}
                        </div>
                        <input
                          type="range"
                          min={normalizedGwRange.min}
                          max={normalizedGwRange.max}
                          step={1}
                          value={normalizedGwRange.end}
                          onChange={(e) => setSelectedGwEnd(Number(e.target.value))}
                          className="w-full"
                          style={{ accentColor: PALETTE.gold }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: PALETTE.muted }}>
                      No GW data available.
                    </div>
                  )}

                  <div
                    className="mt-3 rounded-xl px-3 py-2 text-sm"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(248,250,252,0.95)",
                      color: "#64748b",
                    }}
                  >
                    Visible GW columns use {normalizedGwRange.start}-{normalizedGwRange.end}
                  </div>
                </FilterCard>
              </div>
            </div>
          </details>
        </div>

        <GlassCard className="overflow-visible" style={{ position: "relative", zIndex: 10 }}>
          <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: PALETTE.border }}>
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
                  Measure columns are shown per gameweek and sorted by visible total by default.
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
                      minWidth: "130px",
                    }}
                  >
                    {MEASURE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
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
                    className="w-full rounded-xl py-2 pl-9 pr-3 text-[16px] outline-none md:text-xs"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "#f8fafc",
                      color: PALETTE.beige,
                      height: "36px",
                    }}
                  />
                </div>

                <div className="text-xs whitespace-nowrap" style={{ color: PALETTE.muted }}>
                  {filteredPlayerRows.length} visible rows
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm sm:min-w-[1040px]">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-[2] w-[140px] max-w-[140px] px-3 py-3 text-left sm:w-[220px] sm:max-w-[220px] sm:px-4"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Name
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
                    £
                  </th>

                  <th
                    className="px-4 py-3 text-right"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Selected %
                  </th>

                  {displayedGWs.map((gw) => {
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
                            sortConfig.direction === "asc" ? "\u25B2" : "\u25BC"
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
                      Total
                      {sortConfig.type === "total" ? (
                        sortConfig.direction === "asc" ? "\u25B2" : "\u25BC"
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
                    displayedGWs={displayedGWs}
                    selectedMeasure={selectedMeasure}
                    formatter={currentMeasureMeta.format}
                    onOpen={handleOpenPlayerCard}
                  />
                ))}

                {filteredPlayerRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6 + displayedGWs.length}
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

          <div className="border-t px-4 py-3 text-xs sm:px-5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>
            Showing {currentMeasureMeta.description} by GW {normalizedGwRange.start}-{normalizedGwRange.end}.
          </div>
        </GlassCard>

      </div>

      {activePlayerSummary && (
        <div
          className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-3 sm:items-center sm:p-4"
          onClick={handleClosePlayerCard}
        >
          <GlassCard
            className="my-3 w-full max-w-6xl overflow-hidden sm:my-0 sm:max-h-[92vh]"
            style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.99), rgba(241,245,249,0.97))" }}
          >
            <div onClick={(event) => event.stopPropagation()}>
              <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: PALETTE.border }}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div
                      className="inline-flex items-center gap-2 text-sm font-semibold"
                      style={{ color: PALETTE.gold }}
                    >
                      <Target size={16} />
                      Player detail card
                    </div>
                    <h2 className="mt-2 text-2xl font-bold">
                      {activePlayerSummary.displayName}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm" style={{ color: "#475569" }}>
                      <span>{activePlayerSummary.name}</span>
                      <span>{activePlayerSummary.position || "-"}</span>
                      <span className="inline-flex items-center gap-2">
                        <TeamColorDot teamName={activePlayerSummary.teamName} />
                        {activePlayerSummary.teamName || activePlayerSummary.teamCode || "-"}
                      </span>
                      <span>{formatPrice(activePlayerSummary.value)}</span>
                      <span>Selected {activePlayerSummary.selected.toFixed(1)}%</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClosePlayerCard}
                    className="inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-semibold transition"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "#f8fafc",
                      color: PALETTE.beige,
                    }}
                  >
                    <X size={14} />
                    Close
                  </button>
                </div>
              </div>

              <div className="overflow-visible sm:max-h-[calc(92vh-96px)] sm:overflow-y-auto">
                <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <FilterCard icon={Users} label="Compare player">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs" style={{ color: PALETTE.muted }}>
                          Add one player to compare on the chart.
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
                          className="w-full rounded-xl py-2 pl-9 pr-3 text-[16px] outline-none md:text-sm"
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
                    </FilterCard>

                    <FilterCard icon={CalendarRange} label="GW detail">
                      {activeChartData.length > 0 ? (
                        <>
                          <label className="mb-2 block text-sm font-semibold" style={{ color: PALETTE.beige }}>
                            Select GW
                          </label>
                          <select
                            value={activeDetailGw ?? ""}
                            onChange={(e) => setActiveDetailGw(Number(e.target.value))}
                            className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                            style={{
                              border: `1px solid ${PALETTE.border}`,
                              background: "#f8fafc",
                              color: PALETTE.beige,
                            }}
                          >
                            {activeChartData.map((point) => (
                              <option key={point.gw} value={point.gw}>
                                GW {point.gw}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <div className="text-sm" style={{ color: PALETTE.muted }}>
                          No GW detail available.
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                        <div className="rounded-2xl px-3 py-3" style={{ border: `1px solid ${PALETTE.border}`, background: "#f8fafc" }}>
                          <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                            Opponent
                          </div>
                          <div className="mt-1 inline-flex items-center gap-2 font-semibold">
                            {String(activeDetail?.opponent || "")
                              .split(" / ")
                              .filter(Boolean)
                              .map((opponentName) =>
                                teamLogos[opponentName] ? (
                                  <img
                                    key={opponentName}
                                    src={teamLogos[opponentName]}
                                    alt={opponentName}
                                    className="h-5 w-5 object-contain"
                                  />
                                ) : null
                              )}
                            <span>
                              {activeDetail?.opponent || ""} {activeDetail?.venue ? `(${activeDetail.venue})` : ""}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-2xl px-3 py-3" style={{ border: `1px solid ${PALETTE.border}`, background: "#f8fafc" }}>
                          <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                            Predicted minutes
                          </div>
                          <div className="mt-1 font-semibold">
                            {Number.isFinite(activeDetail?.minutes) ? activeDetail.minutes.toFixed(1) : "-"}
                          </div>
                        </div>

                        <div className="rounded-2xl px-3 py-3" style={{ border: `1px solid ${PALETTE.border}`, background: "#f8fafc" }}>
                          <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                            {getMeasureMeta(activeChartMeasure).description}
                          </div>
                          <div className="mt-1 font-semibold">
                            {Number.isFinite(activeDetail?.measureValue)
                              ? getMeasureMeta(activeChartMeasure).format(activeDetail.measureValue)
                              : "-"}
                          </div>
                        </div>
                      </div>
                    </FilterCard>
                  </div>

                  <div className="rounded-[24px] border p-4" style={{ borderColor: PALETTE.border, background: "rgba(255,255,255,0.7)" }}>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: PALETTE.gold }}>
                          Player line chart
                        </div>
                        <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                          Track the clicked player across the visible GW horizon.
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2 rounded-xl px-2"
                        style={{
                          border: `1px solid ${PALETTE.border}`,
                          background: "#f8fafc",
                          height: "36px",
                        }}
                      >
                        {React.createElement(getMeasureMeta(activeChartMeasure).icon, {
                          size: 14,
                          style: { color: PALETTE.gold },
                        })}
                        <select
                          value={activeChartMeasure}
                          onChange={(e) => setActiveChartMeasure(e.target.value)}
                          className="rounded-xl text-xs font-semibold outline-none"
                          style={{
                            background: "#ffffff",
                            color: PALETTE.gold,
                            border: "none",
                            height: "32px",
                            minWidth: "130px",
                          }}
                        >
                          {MEASURE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeChartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.24)" />
                          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(value, name) => [
                              getMeasureMeta(activeChartMeasure).format(Number(value) || 0),
                              name,
                            ]}
                            labelFormatter={(label, payload) => {
                              const point = payload?.[0]?.payload;
                              if (!point) return label;
                              if (!point.opponent && !point.venue) return label;
                              const venueText = point.venue ? ` (${point.venue})` : "";
                              return `${label} · vs ${point.opponent || ""}${venueText}`;
                            }}
                            contentStyle={{
                              borderRadius: "16px",
                              border: `1px solid ${PALETTE.border}`,
                              boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            name={activePlayerSummary.displayName}
                            stroke={PALETTE.gold}
                            strokeWidth={3}
                            dot={{ r: 4, fill: PALETTE.gold }}
                            activeDot={{ r: 6 }}
                          />
                          {comparisonSummary ? (
                            <Line
                              type="monotone"
                              dataKey="compareValue"
                              name={comparisonSummary.displayName}
                              stroke="#94a3b8"
                              strokeWidth={2.5}
                              strokeDasharray="6 4"
                              dot={{ r: 3, fill: "#94a3b8" }}
                              activeDot={{ r: 5 }}
                              connectNulls={false}
                            />
                          ) : null}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
