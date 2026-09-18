import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  X,
  ArrowRight,
  Search,
  BookmarkPlus,
  Sparkles,
  Shield,
  Trophy,
  Brain,
  SlidersHorizontal,
  Save,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Users,
  Target,
  Wand2,
  PencilLine,
  RefreshCw,
  Ban,
  CheckCircle2,
  CircleDashed,
  Zap,
  Lock,
  GitBranch,
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
import pitch from "./assets/Pitch4.png";
import { useMyteamData } from "./Contexts/MyTeamContext";
import { BASE_SCENARIO_ID, useAdjustmentData } from "./Contexts/AdjustmentsContext";
import { useStatsData } from "./Contexts/StatsContext";
import teamShort from "./utils/team_short";

const PALETTE = {
  red: "#f8fafc",
  gold: "#5f8f7b",
  goldSoft: "#8fbca9",
  black: "#e2e8f0",
  beige: "#1e293b",
  panel: "rgba(255,255,255,0.95)",
  panelStrong: "rgba(248,250,252,0.98)",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
  success: "#16a34a",
  danger: "#ef4444",
  text: "#0f172a",
};

const isValidGW = (gw) =>
  Number.isInteger(gw) && gw >= 1 && gw <= 38;

const DEFAULT_TREE_NODES = [
  { id: "gw6", label: "GW6", gw: 6, parentId: null, probability: 100, chip: "none", scenarioId: BASE_SCENARIO_ID },
  { id: "gw7", label: "GW7", gw: 7, parentId: "gw6", probability: 100, chip: "none", scenarioId: "inherit" },
  { id: "gw8", label: "GW8", gw: 8, parentId: "gw7", probability: 100, chip: "none", scenarioId: "inherit" },
];
const TREE_NODE_WIDTH = 224;
const TREE_NODE_HEIGHT = 325;

const buildTreeChildrenMap = (nodes) => {
  const children = new Map();
  nodes.forEach((node) => {
    if (!children.has(node.id)) children.set(node.id, []);
  });
  nodes.forEach((node) => {
    if (!node.parentId) return;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  });
  return children;
};

const getTreeLeafIds = (nodeId, childrenByParent) => {
  const children = childrenByParent.get(nodeId) || [];
  if (!children.length) return [nodeId];
  return children.flatMap((child) => getTreeLeafIds(child.id, childrenByParent));
};

const syncTreeMasses = (nodes) => {
  const childrenByParent = buildTreeChildrenMap(nodes);
  const massById = new Map();
  const calculate = (node) => {
    const children = childrenByParent.get(node.id) || [];
    const mass = children.length
      ? children.reduce((sum, child) => sum + calculate(child), 0)
      : Math.max(0, Number(node.probability) || 0);
    massById.set(node.id, mass);
    return mass;
  };
  nodes.filter((node) => !node.parentId).forEach(calculate);
  return nodes.map((node) => ({
    ...node,
    probability: massById.get(node.id) ?? (Number(node.probability) || 0),
  }));
};

const buildVerticalTreeLayout = (nodes) => {
  const childrenByParent = buildTreeChildrenMap(nodes);
  const roots = nodes.filter((node) => !node.parentId);
  const positions = {};
  let leafIndex = 0;
  const horizontalGap = 290;
  const verticalGap = 375;

  const place = (node, depth) => {
    const children = childrenByParent.get(node.id) || [];
    let centerX;
    if (!children.length) {
      centerX = 150 + leafIndex * horizontalGap;
      leafIndex += 1;
    } else {
      const childCenters = children.map((child) => place(child, depth + 1));
      centerX = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length;
    }
    positions[node.id] = { x: centerX - TREE_NODE_WIDTH / 2, y: 50 + depth * verticalGap };
    return centerX;
  };

  roots.forEach((root) => place(root, 0));
  return {
    positions,
    width: Math.max(900, 300 + Math.max(1, leafIndex) * horizontalGap),
    height: Math.max(620, 170 + Math.max(1, ...Object.values(positions).map((position) => position.y)) + 180),
  };
};

const buildStatisticalPlayerPayload = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const uniqueByPlayerGw = new Map();
  rows.forEach((player) => {
    const gw = Number(player?.GW);
    const name = String(player?.name ?? player?.Name ?? "").trim();
    if (!name || !Number.isFinite(gw)) return;
    const points = Number.isFinite(Number(player?.calc_points))
      ? Number(player.calc_points)
      : Number.isFinite(Number(player?.Points))
      ? Number(player.Points)
      : 0;
    uniqueByPlayerGw.set(`${name}__${gw}`, {
      ...player,
      name,
      GW: gw,
      calc_points: points,
      Points: points,
    });
  });
  return Array.from(uniqueByPlayerGw.values());
};

const compareStatisticalPlayerPayloads = (baseRows, scenarioRows, fromGw = 1) => {
  const valuesByKey = (rows) => {
    const values = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const name = String(row?.name ?? row?.Name ?? "").trim();
      const gw = Number(row?.GW);
      const points = Number(row?.calc_points ?? row?.Points);
      if (!name || !Number.isFinite(gw) || gw < Number(fromGw) || !Number.isFinite(points)) return;
      values.set(`${name}__${gw}`, points);
    });
    return values;
  };

  const base = valuesByKey(baseRows);
  const scenario = valuesByKey(scenarioRows);
  const keys = new Set([...base.keys(), ...scenario.keys()]);
  let changedRows = 0;
  let signedDiff = 0;
  let absoluteDiff = 0;
  let maxAbsDiff = 0;
  keys.forEach((key) => {
    const difference = (scenario.get(key) || 0) - (base.get(key) || 0);
    const absolute = Math.abs(difference);
    if (absolute <= 1e-9) return;
    changedRows += 1;
    signedDiff += difference;
    absoluteDiff += absolute;
    maxAbsDiff = Math.max(maxAbsDiff, absolute);
  });
  return { changedRows, signedDiff, absoluteDiff, maxAbsDiff };
};

const normalizeTeamKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizePlayerKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeLoosePlayerKey = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getPlayerIdentityCandidates = (value) => {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? [text] : [];
  }

  return Array.from(
    new Set(
      [
        value?.Name,
        value?.name,
        value?.web_name,
        value?.player_name,
        value?.full_name,
        value?.id,
        value?.element,
      ]
        .filter((v) => v != null && String(v).trim() !== "")
        .map((v) => String(v))
    )
  );
};

const playerGwKey = (name, gw) => `${normalizePlayerKey(name)}__${Number(gw)}`;
const loosePlayerGwKey = (name, gw) => `${normalizeLoosePlayerKey(name)}__${Number(gw)}`;
const teamGwKey = (team, gw) => `${normalizeTeamKey(team)}__${Number(gw)}`;

const getTeamShort = (teamNameOrCode) => {
  if (!teamNameOrCode) return null;
  const raw = String(teamNameOrCode).trim();
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();
  if (teamShort?.[raw]) return String(teamShort[raw]).toUpperCase();

  const target = normalizeTeamKey(raw);
  const key = Object.keys(teamShort || {}).find((k) => normalizeTeamKey(k) === target);
  return key ? String(teamShort[key]).toUpperCase() : null;
};

const formatOpponent = (opponentValue) => {
  if (!opponentValue) return { opp1: "N/A", opp2: null, display: "N/A" };

  const parts = (
    Array.isArray(opponentValue)
      ? opponentValue
      : String(opponentValue).split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
  )
    .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
    .map((x) => String(x).trim())
    .filter(Boolean);

  const oppA = parts[0] ?? null;
  const oppB = parts[1] ?? null;
  const shortA = getTeamShort(oppA) || (oppA ? String(oppA) : "N/A");
  const shortB = oppB ? getTeamShort(oppB) || String(oppB) : null;

  return {
    opp1: shortA,
    opp2: shortB || null,
    display: shortB ? `${shortA}/${shortB}` : shortA,
  };
};

const toFiniteNumber = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const isUnknownOpponent = (value) => {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  return /^(n\/?a|na|none|null|unknown|-)$/i.test(s);
};
const cleanOpponentValue = (value) => (isUnknownOpponent(value) ? null : value);
const getRowPredictedPoints = (row) =>
  toFiniteNumber(
    row?.Points_prediction,
    row?.Point_prediction,
    row?.calc_points,
    row?.Points,
    row?.points_prediction,
    row?.point_prediction,
    row?.predicted_points,
    row?.Predicted_points,
    row?.Fantasy_pred,
    row?.Fantasy_Pred
  );
const getRowGoals = (row) =>
  toFiniteNumber(
    row?.Goal_pred,
    row?.calc_goals,
    row?.Goal_Scored,
    row?.Goals,
    row?.goals,
    row?.Goal,
    row?.goal,
    row?.Goal_prediction,
    row?.Goals_prediction,
    row?.goals_prediction,
    row?.goal_prediction,
    row?.expected_goals,
    row?.xG,
    row?.XG
  );
const getRowAssists = (row) =>
  toFiniteNumber(
    row?.Assist_pred,
    row?.calc_assists,
    row?.Assists,
    row?.assists,
    row?.Assist,
    row?.assist,
    row?.Assist_prediction,
    row?.Assists_prediction,
    row?.assists_prediction,
    row?.assist_prediction,
    row?.expected_assists,
    row?.xA,
    row?.XA
  );
const getRowDefcon = (row) =>
  toFiniteNumber(
    row?.CBI_pred,
    row?.calc_cbi,
    row?.CBI_Predictions,
    row?.CBI_Percent,
    row?.Defcon,
    row?.DefCon,
    row?.DEFCON,
    row?.defcon,
    row?.Defcon_prediction,
    row?.defcon_prediction,
    row?.Defcon_avg,
    row?.defcon_avg,
    row?.Share_of_Defcon,
    row?.defcon_adjusted,
    row?.defensive_contribution
  );
const MEASURE_OPTIONS = [
  { key: "points", label: "Pred points", short: "Pts", icon: Target },
  { key: "goals", label: "Goals", short: "G", icon: Trophy },
  { key: "assists", label: "Assists", short: "A", icon: Sparkles },
  { key: "defcon", label: "Defcon", short: "Def", icon: Shield },
];
const getRowMeasureValue = (row, measureKey) => {
  if (measureKey === "goals") return getRowGoals(row);
  if (measureKey === "assists") return getRowAssists(row);
  if (measureKey === "defcon") return getRowDefcon(row);
  return getRowPredictedPoints(row);
};
const formatMeasureValue = (value, measureKey = "points") => {
  if (!Number.isFinite(Number(value))) return "-";
  const digits = measureKey === "points" ? 1 : 2;
  return Number(value).toFixed(digits);
};
const getRowSelectedPercent = (row) => {
  const raw = toFiniteNumber(
    row?.selected_pct,
    row?.selected_by_percent,
    row?.ownership,
    row?.selected
  );
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
};
const getRowPrice = (row) => {
  const raw = toFiniteNumber(
    row?.price,
    row?.value,
    row?.now_cost,
    row?.cost,
    row?.Price
  );
  if (!Number.isFinite(raw)) return null;
  return raw > 20 ? raw / 10 : raw;
};

const FALLBACK_PLAYER_PHOTO =
  "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

const getPlayerDisplayName = (row) =>
  String(row?.web_name ?? row?.Web_Name ?? row?.second_name ?? row?.Name ?? row?.name ?? "Player");

const getPlayerCanonicalName = (row) =>
  String(row?.Name ?? row?.name ?? row?.Full_Name ?? row?.full_name ?? row?.web_name ?? row?.id ?? "").trim();

const normalizePosition = (pos) => {
  const raw = String(pos ?? "").trim().toUpperCase();
  if (raw === "GK") return "GKP";
  if (["GKP", "DEF", "MID", "FWD"].includes(raw)) return raw;
  const n = Number(pos);
  if (n === 1) return "GKP";
  if (n === 2) return "DEF";
  if (n === 3) return "MID";
  if (n === 4) return "FWD";
  return raw || "";
};

const getPlayerPhoto = (row) => {
  const code = row?.code ?? row?.player_code ?? row?.Code;
  if (row?.photo) return row.photo;
  if (code != null && String(code).trim() !== "") {
    return `https://resources.premierleague.com/premierleague25/photos/players/500x500/${code}.png`;
  }
  return FALLBACK_PLAYER_PHOTO;
};

const STARTER_LIMITS = {
  GKP: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};

const getPlayerStatus = (row) =>
  row?.status === "playing" || row?.status === "benched" ? row.status : "";

const isValidFplFormation = (rows) => {
  const starters = rows.filter((row) => getPlayerStatus(row) === "playing");
  if (starters.length !== 11) return false;

  const counts = starters.reduce((acc, row) => {
    const pos = normalizePosition(row?.position);
    acc[pos] = (acc[pos] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(STARTER_LIMITS).every(([pos, limit]) => {
    const n = counts[pos] || 0;
    return n >= limit.min && n <= limit.max;
  });
};

const canSwitchPlayerRows = (rows, sourceName, targetName) => {
  const sourceKey = normalizeLoosePlayerKey(sourceName);
  const targetKey = normalizeLoosePlayerKey(targetName);
  if (!sourceKey || !targetKey || sourceKey === targetKey) return false;

  const source = rows.find((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === sourceKey);
  const target = rows.find((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === targetKey);
  if (!source || !target) return false;

  const sourceStatus = getPlayerStatus(source);
  const targetStatus = getPlayerStatus(target);
  if (!sourceStatus || !targetStatus || sourceStatus === targetStatus) return false;

  const switched = rows.map((row) => {
    const key = normalizeLoosePlayerKey(getPlayerCanonicalName(row));
    if (key === sourceKey) return { ...row, status: targetStatus };
    if (key === targetKey) return { ...row, status: sourceStatus };
    return row;
  });

  return isValidFplFormation(switched);
};

const buildTransferPairs = (grp) => {
  const remainingIns = [...(grp?.in || [])];
  const remainingOuts = [...(grp?.out || [])];
  const pairs = [];

  remainingOuts
    .filter((outP) => outP?.Forced_transfer_id)
    .forEach((outP) => {
      const inIndex = remainingIns.findIndex(
        (inP) => inP?.Forced_transfer_id === outP.Forced_transfer_id
      );
      if (inIndex === -1) return;
      const outIndex = remainingOuts.indexOf(outP);
      const inP = remainingIns.splice(inIndex, 1)[0];
      remainingOuts.splice(outIndex, 1);
      pairs.push({ outP, inP });
    });

  remainingOuts.forEach((outP) => {
    const i = remainingIns.findIndex((inP) => normalizePosition(inP.position) === normalizePosition(outP.position));
    const inP = i !== -1 ? remainingIns.splice(i, 1)[0] : null;
    pairs.push({ outP, inP });
  });
  remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));
  return pairs.filter((x) => x.outP && x.inP);
};

const transferPairKey = (gw, outP, inP) =>
  `${Number(gw)}__${normalizeLoosePlayerKey(getPlayerCanonicalName(outP))}__${normalizeLoosePlayerKey(getPlayerCanonicalName(inP))}`;

const manualTransferMatchesPair = (manualTransfer, pair) =>
  normalizeLoosePlayerKey(manualTransfer?.outName) ===
    normalizeLoosePlayerKey(getPlayerCanonicalName(pair?.outP)) &&
  normalizeLoosePlayerKey(manualTransfer?.inName) ===
    normalizeLoosePlayerKey(getPlayerCanonicalName(pair?.inP));

const getTeamNameFromStrengthRow = (row) => {
  const raw = row?.name ?? row?.team_name ?? row?.Team ?? row?.team ?? row?.full_name;
  return raw ? String(raw).trim() : null;
};

const getRawTeamStrength = (row) => {
  const attack = toFiniteNumber(row?.XG_avg, row?.XG, row?.xg, row?.XGH, row?.attack_strength);
  const defense = toFiniteNumber(
    row?.XGC_avg,
    row?.XGC,
    row?.xgc,
    row?.XGCH,
    row?.defence_strength,
    row?.defense_strength
  );

  if (!Number.isFinite(attack) && !Number.isFinite(defense)) return null;
  const a = Number.isFinite(attack) ? attack : 1.25;
  const d = Number.isFinite(defense) ? defense : 1.25;
  return a - 0.45 * d;
};

const buildOpponentStrengthLookup = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();

  const grouped = new Map();
  rows.forEach((row) => {
    const teamName = getTeamNameFromStrengthRow(row);
    const rawStrength = getRawTeamStrength(row);
    if (!teamName || !Number.isFinite(rawStrength)) return;

    const key = normalizeTeamKey(teamName);
    const cur = grouped.get(key);
    if (!cur) grouped.set(key, { teamName, sum: rawStrength, count: 1 });
    else grouped.set(key, { teamName: cur.teamName, sum: cur.sum + rawStrength, count: cur.count + 1 });
  });

  if (!grouped.size) return new Map();

  const values = Array.from(grouped.values()).map((v) => v.sum / Math.max(1, v.count));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);

  const lookup = new Map();
  Array.from(grouped.values()).forEach((v) => {
    const strength = v.sum / Math.max(1, v.count);
    const normalized = (strength - min) / span;
    lookup.set(normalizeTeamKey(v.teamName), normalized);

    const shortCode = getTeamShort(v.teamName);
    if (shortCode) lookup.set(normalizeTeamKey(shortCode), normalized);
  });

  return lookup;
};

const splitOpponentParts = (value) =>
  String(value || "")
    .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
    .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
    .map((x) => x.trim())
    .filter(Boolean);

const lookupStrengthForOpponent = (lookup, opponentValue) => {
  if (!(lookup instanceof Map) || lookup.size === 0 || !opponentValue) return null;
  const candidates = splitOpponentParts(opponentValue);
  if (!candidates.length) candidates.push(String(opponentValue));

  const scores = candidates
    .map((cand) => {
      const key = normalizeTeamKey(cand);
      if (lookup.has(key)) return lookup.get(key);
      const short = getTeamShort(cand);
      if (short) {
        const shortKey = normalizeTeamKey(short);
        if (lookup.has(shortKey)) return lookup.get(shortKey);
      }
      return null;
    })
    .filter((v) => Number.isFinite(v));

  if (!scores.length) return null;
  return Math.max(...scores);
};

const opponentStrengthTone = (strength) => {
  if (!Number.isFinite(strength)) {
    return {
      label: "Unknown",
      badgeBg: "rgba(248,250,252,0.96)",
      badgeBorder: "rgba(148,163,184,0.45)",
      badgeText: "#334155",
      metaText: "#64748b",
    };
  }
  if (strength >= 0.67) {
    return {
      label: "Hard",
      badgeBg: "rgba(254,242,242,0.96)",
      badgeBorder: "rgba(248,113,113,0.5)",
      badgeText: "#b91c1c",
      metaText: "#991b1b",
    };
  }
  if (strength >= 0.4) {
    return {
      label: "Medium",
      badgeBg: "rgba(255,251,235,0.96)",
      badgeBorder: "rgba(245,158,11,0.45)",
      badgeText: "#92400e",
      metaText: "#a16207",
    };
  }
  return {
    label: "Favorable",
    badgeBg: "rgba(236,253,245,0.96)",
    badgeBorder: "rgba(52,211,153,0.5)",
    badgeText: "#166534",
    metaText: "#047857",
  };
};

export default function MyTeamOptimize() {
  const {
    teamId,
    setTeamId,
    bbRound,
    setBbRound,
    wildRound,
    setWildRound,
    bannedList,
    freehitROund,
    setfreehitROund,
    data,
    loading,
    optimizationProgress,
    fetchTeam,
    toggleBan,
    removeBan,
    has_changed,
    sethas_changed,
    bannedPlayersData,
    n_hits,
    setn_hits,
    risk,
    setRisk,
    valtrans,
    setValtrans,
    savedOptimizations = [],
    saveOptimization,
    deleteOptimization,
    loadOptimization,
    teamData,
    teamError,
    fetchMyTeam,
    teamLoading,
  } = useMyteamData();

  const {
    Playerdata,
    Teamdata,
    dataVersion: adjustmentDataVersion,
    fetchIfNeeded: fetchAdjustmentIfNeeded,
    scenarios: adjustmentScenarios,
    scenarioVersion,
    getScenarioPlayerData,
  } = useAdjustmentData();
  const { fetchIfNeeded: fetchStatsIfNeeded, TeamData, PlayersData, dataVersion: statsDataVersion } = useStatsData();
  const navigate = useNavigate();
  const location = useLocation();

  const [modelType, setModelType] = useState("ai");
  const [solverScenarioId, setSolverScenarioId] = useState(BASE_SCENARIO_ID);
  const [optParamsOpen, setOptParamsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveHint, setSaveHint] = useState("");
  const [activeSavedId, setActiveSavedId] = useState(null);
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
  const [showfreehitInput, setshowfreehitInput] = useState(!!freehitROund);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [chipPanelOpen, setChipPanelOpen] = useState(false);
  const [selectedGW, setSelectedGW] = useState(null);
  const [selectedSolution, setSelectedSolution] = useState(1);
  const [treeMode, setTreeMode] = useState(false);
  const [treeNodes, setTreeNodes] = useState(() => DEFAULT_TREE_NODES.map((node) => ({ ...node })));
  const [treeNodePositions, setTreeNodePositions] = useState({});
  const [draggingTreeNode, setDraggingTreeNode] = useState(null);
  const [selectedTreeBranchId, setSelectedTreeBranchId] = useState("");
  const [manualPlan, setManualPlan] = useState({});
  const [transferOutName, setTransferOutName] = useState("");
  const [transferInKey, setTransferInKey] = useState("");
  const [teamMeasure, setTeamMeasure] = useState("points");
  const [transferOutSearch, setTransferOutSearch] = useState("");
  const [transferOutPickerOpen, setTransferOutPickerOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  const [hiddenModelTransferKeys, setHiddenModelTransferKeys] = useState([]);
  const [planStorageReady, setPlanStorageReady] = useState(false);
  const [draggedPlayerName, setDraggedPlayerName] = useState("");
  const pitchSectionRef = useRef(null);
  const treeCanvasRef = useRef(null);
  const pendingTreePositionsRef = useRef(null);
  const preferredModelAppliedRef = useRef(false);
  const loadedPlanStorageKeyRef = useRef(null);
  const pendingSavedManualPlanRef = useRef(null);

  useEffect(() => {
    fetchStatsIfNeeded();
  }, [fetchStatsIfNeeded]);

  useEffect(() => {
    fetchAdjustmentIfNeeded();
  }, [fetchAdjustmentIfNeeded]);

  const selectedScenarioPlayers = useMemo(
    () => getScenarioPlayerData(solverScenarioId),
    [adjustmentDataVersion, getScenarioPlayerData, scenarioVersion, solverScenarioId]
  );
  const baseScenarioPlayers = useMemo(
    () => getScenarioPlayerData(BASE_SCENARIO_ID),
    [adjustmentDataVersion, getScenarioPlayerData, scenarioVersion]
  );

  const selectedSolverScenario = useMemo(
    () => adjustmentScenarios.find((scenario) => scenario.id === solverScenarioId)
      || adjustmentScenarios.find((scenario) => scenario.id === BASE_SCENARIO_ID),
    [adjustmentScenarios, solverScenarioId]
  );

  useEffect(() => {
    if (!adjustmentScenarios.some((scenario) => scenario.id === solverScenarioId)) {
      setSolverScenarioId(BASE_SCENARIO_ID);
    }
  }, [adjustmentScenarios, solverScenarioId]);

  const hasStatisticalData = useMemo(() => {
    const arr = treeMode ? baseScenarioPlayers : selectedScenarioPlayers;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some((p) => p && p.calc_points != null && Number.isFinite(Number(p.calc_points)));
  }, [baseScenarioPlayers, selectedScenarioPlayers, treeMode]);

  const statisticalPlayersPayload = useMemo(() => {
    if (!hasStatisticalData) return [];
    return buildStatisticalPlayerPayload(treeMode ? baseScenarioPlayers : selectedScenarioPlayers);
  }, [baseScenarioPlayers, selectedScenarioPlayers, hasStatisticalData, adjustmentDataVersion, treeMode]);

  const statisticalScenarioPlayerSets = useMemo(() => {
    if (!hasStatisticalData || !treeMode) return {};
    const usedScenarioIds = new Set([
      BASE_SCENARIO_ID,
      ...treeNodes
        .map((node) => String(node.scenarioId || "inherit"))
        .filter((scenarioId) => scenarioId !== "inherit"),
    ]);
    return Object.fromEntries(
      adjustmentScenarios.filter((scenario) => usedScenarioIds.has(scenario.id)).map((scenario) => [
        scenario.id,
        buildStatisticalPlayerPayload(getScenarioPlayerData(scenario.id)),
      ])
    );
  }, [adjustmentScenarios, getScenarioPlayerData, hasStatisticalData, scenarioVersion, treeMode, treeNodes]);

  const aiProjectionRows = useMemo(() => {
    const arr = PlayersData?.current;
    return Array.isArray(arr) ? arr : [];
  }, [PlayersData, statsDataVersion]);

  const manualPlanStorageKey = useMemo(
    () => `fpl_optimize_lab_plan_v1:${teamId || "guest"}`,
    [teamId]
  );

  useEffect(() => {
    setPlanStorageReady(false);
    loadedPlanStorageKeyRef.current = null;
    if (typeof window === "undefined") {
      loadedPlanStorageKeyRef.current = manualPlanStorageKey;
      setPlanStorageReady(true);
      return;
    }

    try {
      if (pendingSavedManualPlanRef.current !== null) {
        setManualPlan(pendingSavedManualPlanRef.current);
        pendingSavedManualPlanRef.current = null;
        setHiddenModelTransferKeys([]);
      } else {
        const raw = window.localStorage.getItem(manualPlanStorageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        setManualPlan(parsed?.manualPlan && typeof parsed.manualPlan === "object" ? parsed.manualPlan : {});
        setHiddenModelTransferKeys(Array.isArray(parsed?.hiddenModelTransferKeys) ? parsed.hiddenModelTransferKeys : []);
      }
    } catch (err) {
      console.warn("Failed loading optimize lab plan:", err);
      setManualPlan({});
      setHiddenModelTransferKeys([]);
    } finally {
      loadedPlanStorageKeyRef.current = manualPlanStorageKey;
      setPlanStorageReady(true);
    }
  }, [manualPlanStorageKey]);

  useEffect(() => {
    if (!planStorageReady || typeof window === "undefined") return;
    if (loadedPlanStorageKeyRef.current !== manualPlanStorageKey) return;
    try {
      window.localStorage.setItem(
        manualPlanStorageKey,
        JSON.stringify({ manualPlan, hiddenModelTransferKeys })
      );
    } catch (err) {
      console.warn("Failed saving optimize lab plan:", err);
    }
  }, [hiddenModelTransferKeys, manualPlan, manualPlanStorageKey, planStorageReady]);

  const clampRisk = (v) => Math.max(-1, Math.min(1, v));
  const clampValTrans = (v) => Math.max(0, Math.min(1, v));

  const opponentStrengthLookup = useMemo(() => {
    const rows = Array.isArray(TeamData?.current) ? TeamData.current : [];
    return buildOpponentStrengthLookup(rows);
  }, [TeamData, statsDataVersion]);

  const opponentByPlayerGw = useMemo(() => {
    const map = new Map();
    const addRows = (rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((r) => {
        const gw = Number(r?.GW);
        if (!Number.isFinite(gw)) return;

        const playerKeys = Array.from(
          new Set(
            [
              r?.name,
              r?.Name,
              r?.web_name,
              r?.player_name,
              r?.full_name,
              r?.id,
              r?.element,
            ]
              .filter((v) => v != null && String(v).trim() !== "")
              .map((v) => String(v))
          )
        );
        if (!playerKeys.length) return;

        const opp = cleanOpponentValue(
          r?.opponent_name ??
          r?.Opponent_team ??
          r?.opponent ??
          r?.Opponent ??
          r?.opponent_team
        );
        if (!opp) return;

        const parts = splitOpponentParts(opp);
        playerKeys.forEach((playerName) => {
          const key = playerGwKey(playerName, gw);
          const bucket = map.get(key) || new Set();
          if (parts.length) parts.forEach((p) => bucket.add(p));
          else bucket.add(String(opp));
          map.set(key, bucket);
        });
      });
    };

    addRows(Playerdata?.current);
    addRows(PlayersData?.current);
    addRows(data);

    const out = new Map();
    map.forEach((set, key) => {
      const values = Array.from(set).filter(Boolean);
      if (values.length) out.set(key, values.join(" / "));
    });

    return out;
  }, [Playerdata, PlayersData, data, adjustmentDataVersion, statsDataVersion]);

  const opponentByTeamGw = useMemo(() => {
    const out = new Map();
    const addRows = (rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((r) => {
        const gw = Number(r?.GW);
        if (!Number.isFinite(gw)) return;

        const teamName = r?.team_name ?? r?.Team ?? r?.team;
        const teamCode = r?.team_code ?? r?.team_id ?? r?.code;
        const opp = cleanOpponentValue(
          r?.Opponent_team ?? r?.opponent_team ?? r?.opponent ?? r?.Opponent
        );
        if ((!teamName && teamCode == null) || !opp) return;

        const candidates = [];
        if (teamName) {
          candidates.push(teamName);
          const short = getTeamShort(teamName);
          if (short) candidates.push(short);
        }
        if (teamCode != null) candidates.push(String(teamCode));

        candidates.forEach((cand) => {
          out.set(teamGwKey(cand, gw), String(opp));
        });
      });
    };

    addRows(Teamdata?.current);
    addRows(TeamData?.current);

    return out;
  }, [Teamdata, TeamData, adjustmentDataVersion, statsDataVersion]);

  const getOpponentMeta = useCallback(
    (row) => {
      const rawFromRow = cleanOpponentValue(
        row?.opponent_name ??
        row?.Opponent_team ??
        row?.opponent ??
        row?.Opponent ??
        row?.opp_team ??
        row?.fixture_opponent
      );

      const playerCandidates = [
        row?.Name,
        row?.name,
        row?.web_name,
        row?.player_name,
        row?.full_name,
        row?.id,
        row?.element,
      ]
        .filter((v) => v != null && String(v).trim() !== "")
        .map((v) => String(v));

      let fallbackFromPlayerGw = null;
      for (const playerCand of playerCandidates) {
        const hit = opponentByPlayerGw.get(playerGwKey(playerCand, row?.GW));
        if (hit) {
          fallbackFromPlayerGw = hit;
          break;
        }
      }

      const teamCandidates = [
        row?.Team,
        row?.team_name,
        row?.team_code,
        row?.team_id,
        row?.team,
        row?.code,
      ].filter((v) => v != null && String(v).trim() !== "");
      const shortTeam = getTeamShort(row?.team_name ?? row?.team ?? row?.Team);
      if (shortTeam) teamCandidates.push(shortTeam);

      let fallbackFromTeamGw = null;
      for (const teamCand of teamCandidates) {
        const hit = opponentByTeamGw.get(teamGwKey(teamCand, row?.GW));
        if (hit) {
          fallbackFromTeamGw = hit;
          break;
        }
      }

      const rawOpponent = rawFromRow || fallbackFromPlayerGw || fallbackFromTeamGw || "N/A";
      const formatted = formatOpponent(rawOpponent);
      const display = formatted.display || "N/A";
      const full = Array.isArray(rawOpponent)
        ? rawOpponent.join(" / ")
        : String(rawOpponent || display);

      const strength = lookupStrengthForOpponent(
        opponentStrengthLookup,
        full || display
      );

      return {
        display,
        full: full || display,
        tone: opponentStrengthTone(strength),
      };
    },
    [opponentStrengthLookup, opponentByPlayerGw, opponentByTeamGw]
  );

  const formatRiskLabel = (v) => {
    const n = Number(v);
    if (n <= -0.3) return "Low risk";
    if (n >= 0.3) return "High risk";
    return "Neutral";
  };

  const formatValTransLabel = (v) => {
    const n = Number(v);
    if (n <= 0.1) return "Low value";
    if (n >= 0.9) return "High value";
    return "Neutral";
  };

  useEffect(() => {
    if (modelType === "statistical" && !hasStatisticalData) {
      setModelType("ai");
    }
  }, [modelType, hasStatisticalData]);

  useEffect(() => {
    const shouldPreferStat = location.state?.preferModel === "statistical";
    if (!shouldPreferStat || preferredModelAppliedRef.current) return;

    if (hasStatisticalData) {
      setModelType("statistical");
      preferredModelAppliedRef.current = true;
    }
  }, [location.state, hasStatisticalData]);

  useEffect(() => {
    sethas_changed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, bbRound, wildRound, bannedList, freehitROund, n_hits, modelType, solverScenarioId, risk, valtrans, treeMode, treeNodes]);

  useEffect(() => {
    if (loading) {
      setLoadingPhase("fetch");
      setProgress(0);

      let rafId;
      let iv;
      const start = performance.now();
      const duration = 2600;

      const tick = (now) => {
        const elapsed = now - start;
        const pct = Math.min(42, (elapsed / duration) * 42);
        setProgress(pct);

        if (elapsed < duration && loading) {
          rafId = requestAnimationFrame(tick);
        } else if (loading) {
          setLoadingPhase("optimize");
          let p = Math.max(pct, 42);
          iv = setInterval(() => {
            if (!loading) return clearInterval(iv);
            p = Math.min(97, p + 1.1);
            setProgress(p);
            if (p >= 97) clearInterval(iv);
          }, 180);
        }
      };

      rafId = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(rafId);
        clearInterval(iv);
      };
    }

    setProgress(100);
    const t = setTimeout(() => setProgress(0), 320);
    setLoadingPhase("idle");
    return () => clearTimeout(t);
  }, [loading]);

  const treeBranches = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const byId = new Map();
    data.forEach((row) => {
      const id = String(row?.tree_branch_id || "").trim();
      if (!id || byId.has(id)) return;
      byId.set(id, {
        id,
        label: String(row?.tree_branch_label || id),
        probability: Number(row?.tree_branch_probability),
        objective: Number(row?.tree_branch_objective),
        expectedObjective: Number(row?.tree_expected_objective),
        points: Number(row?.tree_branch_expected_points),
        hits: Number(row?.tree_branch_hit_count),
        expectedPoints: Number(row?.tree_expected_points),
        expectedHits: Number(row?.tree_expected_hit_count),
        splitGw: Number(row?.tree_split_gw),
        scenarioId: String(row?.tree_scenario_id || BASE_SCENARIO_ID),
        scenarioPath: String(row?.tree_scenario_path || ""),
        projectionChangedRows: Number(row?.tree_projection_changed_rows),
        projectionSignedDiff: Number(row?.tree_projection_signed_diff),
        projectionAbsoluteDiff: Number(row?.tree_projection_absolute_diff),
        projectionMaxAbsDiff: Number(row?.tree_projection_max_abs_diff),
      });
    });
    return Array.from(byId.values());
  }, [data]);

  useEffect(() => {
    if (!treeBranches.length) {
      setSelectedTreeBranchId("");
      return;
    }
    setSelectedTreeBranchId((previous) =>
      treeBranches.some((branch) => branch.id === previous)
        ? previous
        : treeBranches[0].id
    );
  }, [treeBranches]);

  const branchScopedData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (!treeBranches.length) return data;
    const branchId = treeBranches.some((branch) => branch.id === selectedTreeBranchId)
      ? selectedTreeBranchId
      : treeBranches[0].id;
    return data.filter((row) => String(row?.tree_branch_id || "") === branchId);
  }, [data, selectedTreeBranchId, treeBranches]);

  const activeTreeBranch = treeBranches.find(
    (branch) => branch.id === selectedTreeBranchId
  ) || treeBranches[0] || null;

  const solutionNumbers = useMemo(() => {
    if (!branchScopedData.length) return [];
    return Array.from(
      new Set(
        branchScopedData
          .map((row) => Number(row?.solution || 1))
          .filter((n) => Number.isFinite(n))
      )
    ).sort((a, b) => a - b);
  }, [branchScopedData]);

  useEffect(() => {
    if (!solutionNumbers.length) {
      setSelectedSolution(1);
      return;
    }
    setSelectedSolution((prev) =>
      solutionNumbers.includes(prev) ? prev : solutionNumbers[0]
    );
  }, [solutionNumbers]);

  const expectedSolutions = Math.max(
    1,
    Number(optimizationProgress?.expectedSolutions) || 3
  );
  const solutionSlots = useMemo(
    () => Array.from({ length: expectedSolutions }, (_, idx) => idx + 1),
    [expectedSolutions]
  );

  const activeSolutionData = useMemo(() => {
    if (!branchScopedData.length) return [];
    const fallbackSolution = Number(branchScopedData?.[0]?.solution || 1);
    const targetSolution = solutionNumbers.includes(selectedSolution)
      ? selectedSolution
      : solutionNumbers[0] ?? fallbackSolution;
    return branchScopedData.filter(
      (row) => Number(row?.solution || 1) === Number(targetSolution)
    );
  }, [branchScopedData, selectedSolution, solutionNumbers]);

  const loadedTeamPitchRows = useMemo(() => {
    if (!Array.isArray(teamData) || teamData.length === 0) return [];

    const startGw = Number(teamData[0]?.gw ?? teamData[0]?.GW);
    if (!isValidGW(startGw)) return [];

    const loadedGws = Array.from(
      { length: Math.max(0, Math.min(38, startGw + 5) - startGw + 1) },
      (_, offset) => startGw + offset
    );

    return loadedGws.flatMap((gw) =>
      teamData.map((row, index) => {
        const squadPosition = toFiniteNumber(
          row?.squad_position,
          row?.pick_position,
          index + 1
        );
        const name = String(
          row?.name ?? row?.player_name ?? row?.Name ?? row?.web_name ?? ""
        ).trim();

        return {
          ...row,
          Name: name,
          name,
          web_name: row?.web_name ?? row?.player_name ?? name,
          position: normalizePosition(row?.position),
          GW: gw,
          status: Number(squadPosition) > 11 ? "benched" : "playing",
          Is_captain: Boolean(row?.is_captain),
          Is_vice_captain: Boolean(row?.is_vice_captain),
          photo: getPlayerPhoto(row),
          value: toFiniteNumber(row?.selling_price_m, row?.value),
          source: "loaded_team",
        };
      })
    ).filter((row) => row.Name);
  }, [teamData]);

  const pitchSourceData = activeSolutionData.length > 0
    ? activeSolutionData
    : loadedTeamPitchRows;

  const availableGWs = useMemo(() => {
    if (!Array.isArray(pitchSourceData) || pitchSourceData.length === 0) {
      return [];
    }

    return Array.from(
      new Set(
        pitchSourceData
          .map((p) => Number(p.GW))
          .filter((n) => isValidGW(n))
      )
    ).sort((a, b) => a - b);
  }, [pitchSourceData]);

  const projectionSourceBuckets = useMemo(() => {
    return modelType === "statistical"
      ? [statisticalPlayersPayload]
      : [aiProjectionRows];
  }, [modelType, statisticalPlayersPayload, aiProjectionRows]);

  const projectionRowLookup = useMemo(() => {
    const map = new Map();

    projectionSourceBuckets.forEach((rows, priority) => {
      if (!Array.isArray(rows)) return;

      rows.forEach((row) => {
        const gw = Number(row?.GW);
        if (!isValidGW(gw)) return;

        const candidates = getPlayerIdentityCandidates(row);
        if (!candidates.length) return;

        const hasPts = Number.isFinite(getRowPredictedPoints(row));
        candidates.forEach((candidate) => {
          const keys = [playerGwKey(candidate, gw), loosePlayerGwKey(candidate, gw)];

          keys.forEach((key) => {
            const prev = map.get(key);
            const shouldReplace =
              !prev ||
              priority < prev.priority ||
              (priority === prev.priority && !prev.hasPts && hasPts);

            if (shouldReplace) {
              map.set(key, { row, priority, hasPts });
            }
          });
        });
      });
    });

    return map;
  }, [projectionSourceBuckets]);

  const getProjectionRowForPlayer = useCallback(
    (playerLike, gw) => {
      const candidates = getPlayerIdentityCandidates(playerLike);
      for (const candidate of candidates) {
        const hit =
          projectionRowLookup.get(playerGwKey(candidate, gw)) ||
          projectionRowLookup.get(loosePlayerGwKey(candidate, gw));
        if (hit?.row) return hit.row;
      }
      return null;
    },
    [projectionRowLookup]
  );

  const buildTransferProjectionData = useCallback(
    (outP, inP, transferGW) => {
      if (!availableGWs.length) return [];

      const startGW = isValidGW(Number(transferGW)) ? Number(transferGW) : availableGWs[0];

      return availableGWs
        .filter((gw) => gw >= startGW)
        .map((gw) => {
          const outRow = getProjectionRowForPlayer(outP, gw);
          const inRow = getProjectionRowForPlayer(inP, gw);
          const outMeta = outRow ? getOpponentMeta(outRow) : null;
          const inMeta = inRow ? getOpponentMeta(inRow) : null;
          const outPoints = outRow ? getRowPredictedPoints(outRow) : null;
          const inPoints = inRow ? getRowPredictedPoints(inRow) : null;

          return {
            gw,
            label: `GW ${gw}`,
            outPoints: Number.isFinite(outPoints) ? Number(outPoints) : null,
            inPoints: Number.isFinite(inPoints) ? Number(inPoints) : null,
            outOpponent: outMeta?.full || "N/A",
            inOpponent: inMeta?.full || "N/A",
            outOpponentShort: outMeta?.display || "N/A",
            inOpponentShort: inMeta?.display || "N/A",
          };
        })
        .filter(
          (row) =>
            Number.isFinite(row.outPoints) ||
            Number.isFinite(row.inPoints) ||
            row.outOpponent !== "N/A" ||
            row.inOpponent !== "N/A"
        );
    },
    [availableGWs, getOpponentMeta, getProjectionRowForPlayer]
  );

  useEffect(() => {
    if (!availableGWs.length) {
      setSelectedGW(null);
      return;
    }

    setSelectedGW((prev) => {
      if (Number.isFinite(prev) && availableGWs.includes(prev)) return prev;
      return availableGWs[0];
    });
  }, [availableGWs]);

  const activeGW =
    Number.isFinite(selectedGW) && availableGWs.includes(selectedGW)
      ? selectedGW
      : availableGWs[0] ?? null;
  const activeGWIndex = availableGWs.indexOf(activeGW);
  const canGoPrevGW = activeGWIndex > 0;
  const canGoNextGW = activeGWIndex >= 0 && activeGWIndex < availableGWs.length - 1;
  const activePlanKey = Number.isFinite(Number(activeGW)) ? String(Number(activeGW)) : "";
  const activeManualPlan = activePlanKey ? manualPlan[activePlanKey] || {} : {};
  const manualTransfers = Array.isArray(activeManualPlan.transfers)
    ? activeManualPlan.transfers
    : [];
  const hasPendingManualTransfers = useMemo(
    () =>
      Object.values(manualPlan || {})
        .flatMap((plan) => (Array.isArray(plan?.transfers) ? plan.transfers : []))
        .some((transfer) => !transfer?.isLocked),
    [manualPlan]
  );
  const treeChildrenByParent = useMemo(() => buildTreeChildrenMap(treeNodes), [treeNodes]);
  const syncedTreeNodes = useMemo(() => syncTreeMasses(treeNodes), [treeNodes]);
  const treeMassById = useMemo(
    () => new Map(syncedTreeNodes.map((node) => [node.id, Number(node.probability) || 0])),
    [syncedTreeNodes]
  );
  const treeLeafNodes = useMemo(
    () => syncedTreeNodes.filter((node) => (treeChildrenByParent.get(node.id) || []).length === 0),
    [syncedTreeNodes, treeChildrenByParent]
  );
  const treeLeafProbabilityTotal = treeLeafNodes.reduce(
    (sum, node) => sum + Number(node.probability || 0),
    0
  );
  const treeEffectiveScenarioById = useMemo(() => {
    const nodeById = new Map(treeNodes.map((node) => [node.id, node]));
    const availableIds = new Set(adjustmentScenarios.map((scenario) => scenario.id));
    const effective = new Map();
    const resolve = (node) => {
      if (effective.has(node.id)) return effective.get(node.id);
      if (!node.parentId) {
        effective.set(node.id, BASE_SCENARIO_ID);
        return BASE_SCENARIO_ID;
      }
      const selected = String(node.scenarioId || "inherit");
      const scenarioId = selected !== "inherit" && availableIds.has(selected)
        ? selected
        : resolve(nodeById.get(node.parentId));
      effective.set(node.id, scenarioId);
      return scenarioId;
    };
    treeNodes.forEach(resolve);
    return effective;
  }, [adjustmentScenarios, treeNodes]);
  const treeScenarioDiagnosticsByNodeId = useMemo(() => {
    const diagnostics = new Map();
    const baseRows = statisticalScenarioPlayerSets?.[BASE_SCENARIO_ID] || [];
    treeNodes.forEach((node) => {
      const effectiveScenarioId = treeEffectiveScenarioById.get(node.id) || BASE_SCENARIO_ID;
      const scenarioRows = statisticalScenarioPlayerSets?.[effectiveScenarioId] || [];
      diagnostics.set(
        node.id,
        compareStatisticalPlayerPayloads(baseRows, scenarioRows, Number(node.gw) || 1)
      );
    });
    return diagnostics;
  }, [statisticalScenarioPlayerSets, treeEffectiveScenarioById, treeNodes]);
  const treeTopologyKey = treeNodes
    .map((node) => `${node.id}:${node.parentId || "root"}:${node.gw}`)
    .sort()
    .join("|");
  const treeAutoLayout = useMemo(
    () => buildVerticalTreeLayout(treeNodes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeTopologyKey]
  );

  useEffect(() => {
    if (pendingTreePositionsRef.current) {
      setTreeNodePositions(pendingTreePositionsRef.current);
      pendingTreePositionsRef.current = null;
      return;
    }
    setTreeNodePositions(treeAutoLayout.positions);
  }, [treeAutoLayout]);

  const treeConfigValid = Boolean(
    !treeMode ||
      (
        treeNodes.filter((node) => !node.parentId).length === 1 &&
        treeNodes.every((node) => {
          const parent = node.parentId
            ? treeNodes.find((candidate) => candidate.id === node.parentId)
            : null;
          return (
            isValidGW(Number(node.gw)) &&
            Number(node.probability) > 0 &&
            (!node.parentId || (parent && Number(node.gw) === Number(parent.gw) + 1))
          );
        }) &&
        Math.abs(treeLeafProbabilityTotal - 100) < 0.05
      )
  );

  const updateTreeNode = (nodeId, patch) => {
    setTreeNodes((previous) =>
      previous.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    );
  };

  const updateTreeSplitProbability = (nodeId, rawProbability) => {
    setTreeNodes((previous) => {
      const synced = syncTreeMasses(previous);
      const children = buildTreeChildrenMap(synced);
      const node = synced.find((candidate) => candidate.id === nodeId);
      if (!node?.parentId) return previous;
      const siblings = children.get(node.parentId) || [];
      if (siblings.length < 2) return previous;

      const parent = synced.find((candidate) => candidate.id === node.parentId);
      const parentMass = Number(parent?.probability) || 0;
      if (parentMass <= 0) return previous;

      const conditionalProbability = Math.min(99.9, Math.max(0.1, Number(rawProbability) || 0.1));
      const targetMass = parentMass * conditionalProbability / 100;
      const selectedLeafIds = new Set(getTreeLeafIds(nodeId, children));
      const siblingLeafIds = new Set(
        siblings
          .filter((sibling) => sibling.id !== nodeId)
          .flatMap((sibling) => getTreeLeafIds(sibling.id, children))
      );
      const selectedCurrentMass = Number(node.probability) || 0;
      const siblingCurrentMass = Math.max(0, parentMass - selectedCurrentMass);
      const remainingMass = Math.max(0, parentMass - targetMass);

      const next = synced.map((node) => {
        if (selectedLeafIds.has(node.id)) {
          return {
            ...node,
            probability: selectedCurrentMass > 0
              ? Number(node.probability || 0) * targetMass / selectedCurrentMass
              : targetMass / selectedLeafIds.size,
          };
        }
        if (siblingLeafIds.has(node.id)) {
          return {
            ...node,
            probability: siblingCurrentMass > 0
              ? Number(node.probability || 0) * remainingMass / siblingCurrentMass
              : remainingMass / siblingLeafIds.size,
          };
        }
        return node;
      });
      return syncTreeMasses(next);
    });
  };

  const addTreeChildren = (parentId, split = false) => {
    setTreeNodes((previous) => {
      const synced = syncTreeMasses(previous);
      const parent = synced.find((node) => node.id === parentId);
      if (!parent || Number(parent.gw) >= 38) return previous;
      const childrenMap = buildTreeChildrenMap(synced);
      const existing = childrenMap.get(parentId) || [];
      if (!split && existing.length > 0) return previous;

      const addCount = split && existing.length === 0 ? 2 : 1;
      const totalChildren = existing.length + addCount;
      const parentMass = Number(parent.probability) || 0;
      const targetMass = parentMass / totalChildren;
      const scaleByLeafId = new Map();
      existing.forEach((child) => {
        const leafIds = getTreeLeafIds(child.id, childrenMap);
        const currentMass = leafIds.reduce(
          (sum, leafId) => sum + Number(synced.find((node) => node.id === leafId)?.probability || 0),
          0
        );
        leafIds.forEach((leafId) => scaleByLeafId.set(leafId, currentMass > 0 ? targetMass / currentMass : 1));
      });
      const rebalanced = synced.map((node) =>
        scaleByLeafId.has(node.id)
          ? { ...node, probability: Number(node.probability || 0) * scaleByLeafId.get(node.id) }
          : node
      );
      const timestamp = Date.now();
      const additions = Array.from({ length: addCount }, (_, index) => ({
        id: `node_${timestamp}_${index}_${Math.random().toString(16).slice(2)}`,
        label: `Branch ${existing.length + index + 1}`,
        gw: Number(parent.gw) + 1,
        parentId,
        probability: targetMass,
        chip: "none",
        scenarioId: "inherit",
      }));
      return syncTreeMasses([...rebalanced, ...additions]);
    });
  };

  const removeTreeBranch = (nodeId) => {
    setTreeNodes((previous) => {
      const synced = syncTreeMasses(previous);
      const childrenMap = buildTreeChildrenMap(synced);
      const removedNode = synced.find((node) => node.id === nodeId);
      if (!removedNode?.parentId) return previous;
      const parentMass = Number(synced.find((node) => node.id === removedNode.parentId)?.probability || 0);
      const removeIds = new Set([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        synced.forEach((node) => {
          if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
            removeIds.add(node.id);
            changed = true;
          }
        });
      }
      let kept = synced.filter((node) => !removeIds.has(node.id));
      const siblings = kept.filter((node) => node.parentId === removedNode.parentId);
      if (!siblings.length) return syncTreeMasses(kept);
      const remainingLeafIds = siblings.flatMap((sibling) => getTreeLeafIds(sibling.id, childrenMap));
      const remainingMass = remainingLeafIds.reduce(
        (sum, leafId) => sum + Number(kept.find((node) => node.id === leafId)?.probability || 0),
        0
      );
      const scale = remainingMass > 0 ? parentMass / remainingMass : 1;
      kept = kept.map((node) =>
        remainingLeafIds.includes(node.id)
          ? { ...node, probability: Number(node.probability || 0) * scale }
          : node
      );
      return syncTreeMasses(kept);
    });
  };

  const startTreeNodeDrag = (event, nodeId) => {
    if (event.button !== 0) return;
    const position = treeNodePositions[nodeId] || treeAutoLayout.positions[nodeId] || { x: 0, y: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingTreeNode({
      nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
  };

  const moveTreeNode = (event) => {
    if (!draggingTreeNode || event.pointerId !== draggingTreeNode.pointerId) return;
    const x = Math.max(10, draggingTreeNode.originX + event.clientX - draggingTreeNode.startX);
    const y = Math.max(10, draggingTreeNode.originY + event.clientY - draggingTreeNode.startY);
    setTreeNodePositions((previous) => ({
      ...previous,
      [draggingTreeNode.nodeId]: { x, y },
    }));
  };

  const stopTreeNodeDrag = (event) => {
    if (!draggingTreeNode || event.pointerId !== draggingTreeNode.pointerId) return;
    setDraggingTreeNode(null);
  };
  const treeCanvasWidth = Math.max(
    treeAutoLayout.width,
    ...Object.values(treeNodePositions).map((position) => Number(position.x) + 320)
  );
  const treeCanvasHeight = Math.max(
    treeAutoLayout.height,
    ...Object.values(treeNodePositions).map((position) => Number(position.y) + 300)
  );
  const canOptimize = Boolean(
    teamId &&
      !optimizationProgress?.streaming &&
      treeConfigValid &&
      (has_changed || hasPendingManualTransfers)
  );
  const manualStatusOverrides = activeManualPlan.statusOverrides || {};
  const hiddenModelTransferSet = useMemo(
    () => new Set(hiddenModelTransferKeys),
    [hiddenModelTransferKeys]
  );
  const optimizerTransferGroups = useMemo(() => {
    if (!Array.isArray(activeSolutionData)) return [];
    const moves = activeSolutionData.filter((p) => {
      const gw = Number(p.GW);
      return ["transferred_in", "transferred_out"].includes(p.status) && isValidGW(gw);
    });
    return Object.values(
      moves.reduce((acc, curr) => {
        const gw = Number(curr.GW);
        if (!isValidGW(gw)) return acc;
        if (!acc[gw]) acc[gw] = { GW: gw, in: [], out: [] };
        acc[gw][curr.status === "transferred_in" ? "in" : "out"].push(curr);
        return acc;
      }, {})
    ).sort((a, b) => Number(a.GW) - Number(b.GW));
  }, [activeSolutionData]);
  const canceledModelTransferPairs = useMemo(() => {
    if (!Number.isFinite(Number(activeGW))) return [];
    return optimizerTransferGroups.flatMap((grp) =>
      buildTransferPairs(grp)
        .filter(({ outP, inP }) => hiddenModelTransferSet.has(transferPairKey(grp.GW, outP, inP)))
        .filter(() => Number(grp.GW) <= Number(activeGW))
        .map((pair) => ({ ...pair, gw: Number(grp.GW) }))
    );
  }, [activeGW, hiddenModelTransferSet, optimizerTransferGroups]);
  const appliedManualTransfers = useMemo(() => {
    if (!Number.isFinite(Number(activeGW))) return [];
    return Object.values(manualPlan || {})
      .flatMap((plan) => (Array.isArray(plan?.transfers) ? plan.transfers : []))
      .filter((tr) => {
        const transferGw = Number(tr?.gw);
        if (!Number.isFinite(transferGw) || transferGw > Number(activeGW)) return false;
        return !(Number(freehitROund) === transferGw && Number(activeGW) > transferGw);
      })
      .sort((a, b) => Number(a?.gw) - Number(b?.gw));
  }, [activeGW, freehitROund, manualPlan]);

  const updateManualPlanForGw = useCallback((gw, updater) => {
    const key = Number.isFinite(Number(gw)) ? String(Number(gw)) : "";
    if (!key) return;
    setManualPlan((prev) => {
      const current = prev[key] || { transfers: [], statusOverrides: {} };
      const next = typeof updater === "function" ? updater(current) : updater;
      return {
        ...prev,
        [key]: {
          transfers: Array.isArray(next?.transfers) ? next.transfers : [],
          statusOverrides: next?.statusOverrides || {},
        },
      };
    });
  }, []);

  const makeManualPlayerFromRow = useCallback((row, gw) => {
    const name = getPlayerCanonicalName(row) || getPlayerDisplayName(row);
    const display = getPlayerDisplayName(row);
    return {
      ...row,
      Name: name,
      name,
      web_name: display,
      position: normalizePosition(row?.position ?? row?.Position ?? row?.element_type),
      GW: Number(gw),
      status: "benched",
      photo: getPlayerPhoto(row),
      value: getRowPrice(row) ?? row?.value,
    };
  }, []);

  const getSolutionPlayerRowsForGw = useCallback(
    (gw) => {
      if (!Array.isArray(pitchSourceData) || !Number.isFinite(Number(gw))) return [];
      return pitchSourceData.filter((row) => {
        const status = row?.status;
        const name = String(row?.Name ?? row?.name ?? "").trim();
        return (
          Number(row?.GW) === Number(gw) &&
          (status === "playing" || status === "benched") &&
          name &&
          name !== "Obj Value" &&
          name !== "__TOTAL_OBJECTIVE__"
        );
      });
    },
    [pitchSourceData]
  );

  const buildDisplayRowsForGw = useCallback(
    (gw) => {
      const targetGw = Number(gw);
      if (!Number.isFinite(targetGw)) return [];

      let baseRows = [...getSolutionPlayerRowsForGw(targetGw)];
      const canceledPairsForGw = optimizerTransferGroups.flatMap((grp) =>
        buildTransferPairs(grp)
          .filter(({ outP, inP }) => hiddenModelTransferSet.has(transferPairKey(grp.GW, outP, inP)))
          .filter(() => Number(grp.GW) <= targetGw)
          .map((pair) => ({ ...pair, gw: Number(grp.GW) }))
      );

      canceledPairsForGw.forEach(({ outP, inP }) => {
        const inKey = normalizeLoosePlayerKey(getPlayerCanonicalName(inP));
        const outKey = normalizeLoosePlayerKey(getPlayerCanonicalName(outP));
        if (!inKey || !outKey) return;

        const incomingRow = baseRows.find(
          (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === inKey
        );
        const replacementStatus = getPlayerStatus(incomingRow) || "benched";
        baseRows = baseRows.filter(
          (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) !== inKey
        );

        const alreadyRestored = baseRows.some(
          (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === outKey
        );
        if (!alreadyRestored) {
          baseRows.push({
            ...outP,
            Name: getPlayerCanonicalName(outP),
            name: getPlayerCanonicalName(outP),
            web_name: getPlayerDisplayName(outP),
            position: normalizePosition(outP?.position),
            GW: targetGw,
            status: replacementStatus,
            photo: getPlayerPhoto(outP),
          });
        }
      });

      const appliedTransfersForGw = Object.values(manualPlan || {})
        .flatMap((plan) => (Array.isArray(plan?.transfers) ? plan.transfers : []))
        .filter((tr) => {
          const transferGw = Number(tr?.gw);
          if (!Number.isFinite(transferGw) || transferGw > targetGw) return false;
          if (tr?.isLocked && activeSolutionData.length > 0) return false;
          return !(Number(freehitROund) === transferGw && targetGw > transferGw);
        })
        .sort((a, b) => Number(a?.gw) - Number(b?.gw));

      const removedNames = new Set(
        appliedTransfersForGw.map((tr) => normalizeLoosePlayerKey(tr?.outName))
      );
      const manualIncomingRows = appliedTransfersForGw.map((tr) =>
        makeManualPlayerFromRow(tr.inPlayer, targetGw)
      );
      const statusOverrides = manualPlan[String(targetGw)]?.statusOverrides || {};

      const retainedBaseRows = baseRows.filter(
        (row) => !removedNames.has(normalizeLoosePlayerKey(getPlayerCanonicalName(row)))
      );
      const existingNames = new Set(
        retainedBaseRows.map((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)))
      );
      const uniqueManualIncomingRows = manualIncomingRows.filter((row) => {
        const key = normalizeLoosePlayerKey(getPlayerCanonicalName(row));
        if (!key || existingNames.has(key)) return false;
        existingNames.add(key);
        return true;
      });

      return [...retainedBaseRows, ...uniqueManualIncomingRows].map((row) => {
        const name = getPlayerCanonicalName(row);
        const override = statusOverrides[name];
        return override ? { ...row, status: override } : row;
      });
    },
    [
      activeSolutionData.length,
      freehitROund,
      getSolutionPlayerRowsForGw,
      hiddenModelTransferSet,
      makeManualPlayerFromRow,
      manualPlan,
      optimizerTransferGroups,
    ]
  );

  const currentGwPlayerRows = useMemo(() => {
    return getSolutionPlayerRowsForGw(activeGW);
  }, [activeGW, getSolutionPlayerRowsForGw]);

  const manualDisplayRowsForActiveGw = useMemo(() => {
    if (!Number.isFinite(Number(activeGW))) return currentGwPlayerRows;
    return buildDisplayRowsForGw(activeGW);
  }, [activeGW, buildDisplayRowsForGw, currentGwPlayerRows]);

  const currentSquadNames = useMemo(() => {
    const names = new Set();
    manualDisplayRowsForActiveGw.forEach((row) => {
      const name = getPlayerCanonicalName(row);
      if (name) names.add(normalizeLoosePlayerKey(name));
      const display = getPlayerDisplayName(row);
      if (display) names.add(normalizeLoosePlayerKey(display));
    });
    return names;
  }, [manualDisplayRowsForActiveGw]);

  const transferCandidateRows = useMemo(() => {
    const rows = modelType === "statistical" ? statisticalPlayersPayload : aiProjectionRows;
    if (!Array.isArray(rows) || !Number.isFinite(Number(activeGW))) return [];

    const byName = new Map();
    rows.forEach((row) => {
      if (Number(row?.GW) !== Number(activeGW)) return;
      const name = getPlayerCanonicalName(row);
      if (!name) return;
      const looseName = normalizeLoosePlayerKey(name);
      const display = getPlayerDisplayName(row);
      if (currentSquadNames.has(looseName) || currentSquadNames.has(normalizeLoosePlayerKey(display))) {
        return;
      }

      const position = normalizePosition(row?.position ?? row?.Position ?? row?.element_type);
      const points = getRowPredictedPoints(row);
      const measure = getRowMeasureValue(row, teamMeasure);
      const price = getRowPrice(row);
      const key = `${looseName}__${position || "ANY"}`;
      const next = {
        key,
        row,
        name,
        display,
        position,
        points,
        measure,
        price,
        team: row?.Team ?? row?.team_name ?? row?.team ?? "",
      };
      const existing = byName.get(key);
      if (!existing || (Number(points) || 0) > (Number(existing.points) || 0)) {
        byName.set(key, next);
      }
    });

    return Array.from(byName.values()).sort((a, b) => {
      const pos = String(a.position).localeCompare(String(b.position));
      if (pos !== 0) return pos;
      return String(a.display).localeCompare(String(b.display));
    });
  }, [
    activeGW,
    aiProjectionRows,
    currentSquadNames,
    modelType,
    statisticalPlayersPayload,
    teamMeasure,
  ]);

  const transferOutOptions = useMemo(() => {
    return manualDisplayRowsForActiveGw
      .map((row) => {
        const projection = getProjectionRowForPlayer(row, activeGW) || row;
        return {
          row,
          name: getPlayerCanonicalName(row),
          display: getPlayerDisplayName(row),
          position: normalizePosition(row?.position),
          points: getRowPredictedPoints(projection),
          measure: getRowMeasureValue(projection, teamMeasure),
          price: getRowPrice(projection) ?? getRowPrice(row),
          team: projection?.Team ?? projection?.team_name ?? projection?.team ?? row?.Team ?? row?.team_name ?? row?.team ?? "",
        };
      })
      .sort((a, b) => String(a.display).localeCompare(String(b.display)));
  }, [activeGW, getProjectionRowForPlayer, manualDisplayRowsForActiveGw, teamMeasure]);

  const searchedTransferOutOptions = useMemo(() => {
    const q = normalizeLoosePlayerKey(transferOutSearch);
    return transferOutOptions
      .filter((row) => {
        if (!q) return true;
        return (
          normalizeLoosePlayerKey(row.display).includes(q) ||
          normalizeLoosePlayerKey(row.name).includes(q) ||
          normalizeLoosePlayerKey(row.team).includes(q)
        );
      })
      .slice(0, 24);
  }, [transferOutOptions, transferOutSearch]);

  const selectedTransferOut = transferOutOptions.find((p) => p.name === transferOutName) || null;
  const eligibleTransferCandidates = useMemo(() => {
    if (!selectedTransferOut?.position) return transferCandidateRows;
    return transferCandidateRows
      .filter((row) => row.position === selectedTransferOut.position);
  }, [selectedTransferOut, transferCandidateRows]);
  const selectedTransferInCandidate =
    eligibleTransferCandidates.find((p) => p.key === transferInKey) ||
    transferCandidateRows.find((p) => p.key === transferInKey) ||
    null;

  const searchedTransferCandidates = useMemo(() => {
    const q = normalizeLoosePlayerKey(transferSearch);
    return eligibleTransferCandidates
      .filter((row) => {
        if (!q) return true;
        return (
          normalizeLoosePlayerKey(row.display).includes(q) ||
          normalizeLoosePlayerKey(row.name).includes(q) ||
          normalizeLoosePlayerKey(row.team).includes(q)
        );
      })
      .slice(0, 24);
  }, [eligibleTransferCandidates, transferSearch]);

  const addManualTransfer = useCallback(() => {
    if (
      optimizationProgress?.streaming ||
      !Number.isFinite(Number(activeGW)) ||
      !selectedTransferOut ||
      !transferInKey
    ) return;
    const candidate = transferCandidateRows.find((row) => row.key === transferInKey);
    if (!candidate) return;

    updateManualPlanForGw(activeGW, (prev) => ({
      ...prev,
      transfers: [
        ...(prev.transfers || []),
        {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          gw: Number(activeGW),
          outName: selectedTransferOut.name,
          outDisplay: selectedTransferOut.display,
          outPosition: selectedTransferOut.position,
          outPrice: selectedTransferOut.price,
          inName: candidate.name,
          inDisplay: candidate.display,
          inPosition: candidate.position,
          inPrice: candidate.price,
          inPlayer: candidate.row,
          isLocked: false,
        },
      ],
      statusOverrides: prev.statusOverrides || {},
    }));
    sethas_changed(true);
    setSaveHint("Manual transfer added. Run Optimize to lock it into the solver plan.");
    setTransferOutName("");
    setTransferInKey("");
    setTransferPickerOpen(false);
  }, [
    activeGW,
    selectedTransferOut,
    transferCandidateRows,
    transferInKey,
    optimizationProgress?.streaming,
    sethas_changed,
    updateManualPlanForGw,
  ]);

  const removeManualTransfer = useCallback(
    (transferOrId, transferGw = activeGW) => {
      const transferId = typeof transferOrId === "object" ? transferOrId?.id : transferOrId;
      const storedTransfer =
        typeof transferOrId === "object"
          ? transferOrId
          : manualPlan[String(transferGw)]?.transfers?.find((tr) => tr.id === transferId);

      if (storedTransfer?.isLocked) {
        const key = transferPairKey(
          transferGw,
          { Name: storedTransfer.outName },
          { Name: storedTransfer.inName }
        );
        setHiddenModelTransferKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      }

      updateManualPlanForGw(transferGw, (prev) => ({
        ...prev,
        transfers: (prev.transfers || []).filter((tr) => tr.id !== transferId),
        statusOverrides: prev.statusOverrides || {},
      }));
      sethas_changed(true);
    },
    [activeGW, manualPlan, sethas_changed, updateManualPlanForGw]
  );

  const switchManualPlayers = useCallback(
    (sourceName, targetName) => {
      if (!sourceName || !targetName || !Number.isFinite(Number(activeGW))) return;
      if (!canSwitchPlayerRows(manualDisplayRowsForActiveGw, sourceName, targetName)) return;

      const source = manualDisplayRowsForActiveGw.find(
        (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === normalizeLoosePlayerKey(sourceName)
      );
      const target = manualDisplayRowsForActiveGw.find(
        (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === normalizeLoosePlayerKey(targetName)
      );
      const sourceStatus = getPlayerStatus(source);
      const targetStatus = getPlayerStatus(target);
      if (!sourceStatus || !targetStatus) return;

      updateManualPlanForGw(activeGW, (prev) => ({
        ...prev,
        transfers: prev.transfers || [],
        statusOverrides: {
          ...(prev.statusOverrides || {}),
          [getPlayerCanonicalName(source)]: targetStatus,
          [getPlayerCanonicalName(target)]: sourceStatus,
        },
      }));
    },
    [activeGW, manualDisplayRowsForActiveGw, updateManualPlanForGw]
  );

  const autoSwitchPlayerStatus = useCallback(
    (playerName, nextStatus) => {
      const source = manualDisplayRowsForActiveGw.find(
        (row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === normalizeLoosePlayerKey(playerName)
      );
      if (!source || getPlayerStatus(source) === nextStatus) return;

      const candidates = manualDisplayRowsForActiveGw
        .filter((row) => getPlayerStatus(row) === nextStatus)
        .filter((row) => canSwitchPlayerRows(manualDisplayRowsForActiveGw, playerName, getPlayerCanonicalName(row)))
        .sort((a, b) => {
          const aPts = getRowPredictedPoints(getProjectionRowForPlayer(a, activeGW) || a) ?? 0;
          const bPts = getRowPredictedPoints(getProjectionRowForPlayer(b, activeGW) || b) ?? 0;
          return nextStatus === "playing" ? aPts - bPts : bPts - aPts;
        });

      const target = candidates[0];
      if (target) switchManualPlayers(playerName, getPlayerCanonicalName(target));
    },
    [activeGW, getProjectionRowForPlayer, manualDisplayRowsForActiveGw, switchManualPlayers]
  );

  const switchableTargetNames = useMemo(() => {
    if (!draggedPlayerName) return new Set();
    return new Set(
      manualDisplayRowsForActiveGw
        .filter((row) => canSwitchPlayerRows(manualDisplayRowsForActiveGw, draggedPlayerName, getPlayerCanonicalName(row)))
        .map((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)))
    );
  }, [draggedPlayerName, manualDisplayRowsForActiveGw]);

  const handlePlayerDropOnPlayer = useCallback(
    (sourceName, targetName) => {
      switchManualPlayers(sourceName, targetName);
      setDraggedPlayerName("");
    },
    [switchManualPlayers]
  );

  useEffect(() => {
    if (!transferInKey) return;
    if (eligibleTransferCandidates.some((row) => row.key === transferInKey)) return;
    setTransferInKey("");
  }, [eligibleTransferCandidates, transferInKey]);

  useEffect(() => {
    setTransferSearch("");
    setTransferOutSearch("");
    setTransferPickerOpen(false);
    setTransferOutPickerOpen(false);
  }, [transferOutName]);

  const selectedMeasureMeta =
    MEASURE_OPTIONS.find((option) => option.key === teamMeasure) || MEASURE_OPTIONS[0];

  const sumTeamMeasureForGw = useCallback(
    (rows, gw) => {
      const targetGw = Number(gw);
      if (!Array.isArray(rows) || !Number.isFinite(targetGw)) return null;

      const isPlayerRow = (row) => {
        const n = String(row?.Name ?? row?.name ?? "").trim();
        return n !== "Obj Value" && n !== "__TOTAL_OBJECTIVE__";
      };

      const scoringRows = rows.filter((row) => {
        if (!isPlayerRow(row)) return false;
        const status = getPlayerStatus(row);
        return status === "playing" || (Number(bbRound) === targetGw && status === "benched");
      });

      // Manual planner state used to be layered over a fresh optimization and
      // could leave the same player in the display twice. A player/GW may only
      // contribute once to the solver total.
      const uniqueScoringRows = Array.from(
        scoringRows.reduce((map, row) => {
          const key = normalizeLoosePlayerKey(getPlayerCanonicalName(row));
          if (key && !map.has(key)) map.set(key, row);
          return map;
        }, new Map()).values()
      );

      let sum = 0;
      let count = 0;
      uniqueScoringRows.forEach((row) => {
        const projection = getProjectionRowForPlayer(row, targetGw) || row;
        const value = getRowMeasureValue(projection, teamMeasure);
        if (Number.isFinite(value)) {
          const multiplier = teamMeasure === "points" && row?.Is_captain ? 2 : 1;
          sum += Number(value) * multiplier;
          count += 1;
        }
      });

      return count > 0 ? sum : null;
    },
    [bbRound, getProjectionRowForPlayer, teamMeasure]
  );

  const gwMeasureTotals = useMemo(() => {
    return availableGWs.reduce((acc, gw) => {
      acc[String(gw)] = sumTeamMeasureForGw(buildDisplayRowsForGw(gw), gw);
      return acc;
    }, {});
  }, [availableGWs, buildDisplayRowsForGw, sumTeamMeasureForGw]);

  const overallMeasureTotal = useMemo(() => {
    const values = Object.values(gwMeasureTotals).filter((v) => Number.isFinite(Number(v)));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + Number(value), 0);
  }, [gwMeasureTotals]);

  let minGW = 1;
  let maxGW = 38;
  let starters = [];
  let bench = [];
  let transfers = [];
  let gwData = [];

  if (pitchSourceData.length) {
    if (availableGWs.length) {
      minGW = availableGWs[0];
      maxGW = availableGWs[availableGWs.length - 1];
    }

    gwData = pitchSourceData.filter((p) => Number(p.GW) === activeGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");

    transfers = optimizerTransferGroups;
  }

  if (pitchSourceData.length && Number.isFinite(Number(activeGW))) {
    gwData = [
      ...gwData.filter((row) => row?.status !== "playing" && row?.status !== "benched"),
      ...manualDisplayRowsForActiveGw,
    ];

    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");
  }

  let totalPredPoints = null;
  if (activeSolutionData.length) {
    const objRow =
      activeSolutionData.find((p) => p.Name === "Obj Value") ||
      gwData.find((p) => p.Name === "Obj Value") ||
      activeSolutionData.find((p) => p.Name === "__TOTAL_OBJECTIVE__");

    if (objRow) {
      const asNum = objRow.objective != null ? Number(objRow.objective) : Number(objRow.status);
      totalPredPoints = Number.isFinite(asNum) ? asNum : null;
    }
  }

  const activeGwMeasureTotal = gwMeasureTotals[String(activeGW)] ?? null;

  const pitchPredictedLabel = Number.isFinite(activeGW)
    ? `${selectedMeasureMeta.label} GW ${activeGW}`
    : selectedMeasureMeta.label;
  const pitchPredictedValue =
    activeGwMeasureTotal != null
      ? formatMeasureValue(activeGwMeasureTotal, teamMeasure)
      : totalPredPoints != null
      ? formatMeasureValue(totalPredPoints, teamMeasure)
      : "-";

  const toNum = (v) => Number(v);
  let transfersWithFH = transfers;

  if (activeSolutionData.length && Number.isFinite(minGW) && Number.isFinite(maxGW)) {
    const fhGW = Number(freehitROund);
    const fhActive = isValidGW(fhGW) && fhGW >= minGW && fhGW <= maxGW;

    if (fhActive) {
      const out = [...transfers].sort((a, b) => toNum(a.GW) - toNum(b.GW));
      const idx = out.findIndex((g) => toNum(g.GW) === fhGW);

      if (idx !== -1) out[idx] = { ...out[idx], freehit: true };
      else {
        const insertAt = out.findIndex((g) => toNum(g.GW) > fhGW);
        const fhGroup = { GW: fhGW, in: [], out: [], freehit: true };
        if (insertAt === -1) out.push(fhGroup);
        else out.splice(insertAt, 0, fhGroup);
      }

      transfersWithFH = out;
    }
  }

  const visibleTransfersWithFH = useMemo(() => {
    return transfersWithFH
      .map((grp) => {
        const visiblePairs = buildTransferPairs(grp).filter(
          ({ outP, inP }) => !hiddenModelTransferSet.has(transferPairKey(grp.GW, outP, inP))
        );
        return {
          ...grp,
          pairs: visiblePairs,
          in: visiblePairs.map((pair) => pair.inP),
          out: visiblePairs.map((pair) => pair.outP),
        };
      })
      .filter((grp) => grp.freehit || grp.pairs.length > 0);
  }, [hiddenModelTransferSet, transfersWithFH]);

  const hideModelTransfer = useCallback((gw, outP, inP) => {
    const key = transferPairKey(gw, outP, inP);
    setHiddenModelTransferKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const restoreModelTransfersForGw = useCallback((gw) => {
    const prefix = `${Number(gw)}__`;
    setHiddenModelTransferKeys((prev) => prev.filter((key) => !key.startsWith(prefix)));
  }, []);

  const teamInfo = Array.isArray(teamData) ? teamData[0] || {} : {};
  const baseBank = toFiniteNumber(teamInfo?.money_in_bank_m, teamInfo?.bank_m, teamInfo?.bank) ?? 0;
  const baseFreeTransfers =
    toFiniteNumber(
      teamInfo?.free_transfers_available,
      teamInfo?.free_transfers,
      teamInfo?.saved_transfers != null ? Number(teamInfo.saved_transfers) + 1 : null
    ) ?? 1;

  const getTransferSpend = useCallback(
    (transferLike) => {
      const gw = Number(transferLike?.gw ?? transferLike?.GW ?? activeGW);
      const outP = transferLike?.outP ?? transferLike?.outPlayer;
      const inP = transferLike?.inP ?? transferLike?.inPlayer;
      const outProjection = outP ? getProjectionRowForPlayer(outP, gw) || outP : null;
      const inProjection = inP ? getProjectionRowForPlayer(inP, gw) || inP : null;
      const outPrice = toFiniteNumber(transferLike?.outPrice, getRowPrice(outProjection), getRowPrice(outP));
      const inPrice = toFiniteNumber(transferLike?.inPrice, getRowPrice(inProjection), getRowPrice(inP));
      if (!Number.isFinite(outPrice) || !Number.isFinite(inPrice)) return 0;
      return Number(inPrice) - Number(outPrice);
    },
    [activeGW, getProjectionRowForPlayer]
  );

  const transferAccountingByGw = useMemo(() => {
    const out = {};
    let availableAtStart = Math.max(1, Math.min(5, Number(baseFreeTransfers) || 1));
    let runningBank = Number(baseBank) || 0;

    availableGWs.forEach((gw) => {
      const modelGroup = visibleTransfersWithFH.find((grp) => Number(grp?.GW) === Number(gw));
      const manualPairs = Array.isArray(manualPlan[String(gw)]?.transfers)
        ? manualPlan[String(gw)].transfers.map((tr) => ({ ...tr, gw, source: "manual" }))
        : [];
      const modelPairs = buildTransferPairs(modelGroup)
        .filter((pair) => !manualPairs.some((manual) => manualTransferMatchesPair(manual, pair)))
        .map((pair) => ({ ...pair, gw, source: "model" }));
      const isWildcardGw = Number(wildRound) === Number(gw);
      const isFreeHitGw = Number(freehitROund) === Number(gw);
      const isChipTransferGw = isWildcardGw || isFreeHitGw;
      const used = isChipTransferGw ? 0 : modelPairs.length + manualPairs.length;
      const spend = isFreeHitGw
        ? 0
        : [...modelPairs, ...manualPairs].reduce((sum, tr) => sum + getTransferSpend(tr), 0);
      const freeEnd = isChipTransferGw
        ? Math.max(0, availableAtStart - 1)
        : Math.max(0, availableAtStart - used);

      runningBank -= spend;
      out[String(gw)] = {
        available: availableAtStart,
        used,
        bank: runningBank,
        after: freeEnd,
      };

      availableAtStart = Math.min(5, freeEnd + 1);
    });

    return out;
  }, [
    availableGWs,
    baseBank,
    baseFreeTransfers,
    freehitROund,
    getTransferSpend,
    manualPlan,
    visibleTransfersWithFH,
    wildRound,
  ]);

  const activeTransferAccounting = transferAccountingByGw[String(activeGW)] || {
    available: baseFreeTransfers,
    used: 0,
    bank: baseBank,
    after: baseFreeTransfers,
  };
  const activeTransferUsageLabel = `${activeTransferAccounting.used} / ${activeTransferAccounting.available}`;
  const activeBankLabel = `${activeTransferAccounting.bank >= 0 ? "" : "-"}£${Math.abs(activeTransferAccounting.bank).toFixed(1)}`;
  const manualFtLeft = activeTransferAccounting.after;
  const manualBank = activeTransferAccounting.bank;
  const manualHits = 0;

  const getGwNodeSummary = (gw) => {
    const optimizerGroup = visibleTransfersWithFH.find((grp) => Number(grp?.GW) === Number(gw));
    const manualPairs = Array.isArray(manualPlan[String(gw)]?.transfers)
      ? manualPlan[String(gw)].transfers
      : [];
    const optimizerPairs = buildTransferPairs(optimizerGroup).filter(
      (pair) => !manualPairs.some((manual) => manualTransferMatchesPair(manual, pair))
    );
    const optimizerMoves = optimizerPairs.length;
    const localMoves = manualPairs.length;
    const firstManual = manualPairs[0];
    const firstOptimizer = optimizerPairs[0];

    return {
      count: optimizerMoves + localMoves,
      label: firstManual
        ? `${firstManual.outDisplay || firstManual.outName} -> ${firstManual.inDisplay || firstManual.inName}`
        : firstOptimizer
        ? `${getPlayerDisplayName(firstOptimizer.outP)} -> ${getPlayerDisplayName(firstOptimizer.inP)}`
        : "No moves",
      hasManual: localMoves > 0,
      hasFreeHit: Boolean(optimizerGroup?.freehit),
      hasWildcard: Number(wildRound) === Number(gw),
      hasBenchBoost: Number(bbRound) === Number(gw),
      isChipTransferGw: Number(wildRound) === Number(gw) || Number(freehitROund) === Number(gw),
      optimizerPairs,
      manualPairs,
    };
  };

  const plannerPayload = useMemo(() => {
    if (!activeSolutionData.length || visibleTransfersWithFH.length === 0) return [];

    const realGroups = visibleTransfersWithFH.filter((g) => (g.in && g.in.length) || (g.out && g.out.length));

    return realGroups.flatMap((grp) => {
      const remainingIns = [...(grp.in || [])];
      const pairs = (grp.out || []).map((outP) => {
        const i = remainingIns.findIndex((inP) => inP.position === outP.position);
        const inP = i !== -1 ? remainingIns.splice(i, 1)[0] : null;
        return { outP, inP };
      });

      remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

      return pairs
        .filter((x) => x.outP && x.inP)
        .map(({ outP, inP }) => ({
          gw: Number(grp.GW),
          position: outP.position,
          fromName: outP.Name || outP.name,
          toName: inP.Name || inP.name,
          toWebName: inP.web_name,
          toTeamCode: inP.team_code,
          toPhoto: inP.photo,
        }));
    });
  }, [activeSolutionData, visibleTransfersWithFH]);

  const handleOptimizeClick = async () => {
    const useStatistical = modelType === "statistical" && hasStatisticalData;
    const playersPayload = useStatistical ? statisticalPlayersPayload : null;
    if (useStatistical && treeMode) {
      const ineffectiveScenarioNodes = syncedTreeNodes.filter((node) => {
        const selectedScenarioId = String(node.scenarioId || "inherit");
        if (!node.parentId || selectedScenarioId === "inherit" || selectedScenarioId === BASE_SCENARIO_ID) {
          return false;
        }
        return (treeScenarioDiagnosticsByNodeId.get(node.id)?.changedRows || 0) === 0;
      });
      if (ineffectiveScenarioNodes.length > 0) {
        const labels = ineffectiveScenarioNodes.map((node) => `${node.label} (GW${node.gw})`).join(", ");
        alert(
          `The selected scenario has no player-prediction differences from Base at or after: ${labels}. ` +
          "Save a player/team/fixture adjustment in that scenario before optimizing."
        );
        return;
      }
    }
    const submittedTransfers = Object.values(manualPlan || {})
      .flatMap((plan) => (Array.isArray(plan?.transfers) ? plan.transfers : []));
    const forcedTransfers = submittedTransfers
      .map((transfer) => ({
        gw: Number(transfer?.gw),
        out_name: String(transfer?.outName || "").trim(),
        in_name: String(transfer?.inName || "").trim(),
      }))
      .filter(
        (transfer) =>
          isValidGW(transfer.gw) && transfer.out_name && transfer.in_name
      );
    const submittedTransferIds = new Set(
      submittedTransfers.map((transfer) => transfer?.id).filter(Boolean)
    );
    setSelectedSolution(1);
    setSelectedTreeBranchId("");
    setHiddenModelTransferKeys([]);
    setTransferOutName("");
    setTransferInKey("");

    const optimizationResult = await fetchTeam({
      useStatisticalModel: useStatistical,
      playersData: playersPayload,
      forcedTransfers,
      scenarioPlayerSets: useStatistical && treeMode ? statisticalScenarioPlayerSets : null,
      scenarioTree: treeMode
        ? {
            max_prefix_candidates: 2,
            nodes: syncedTreeNodes.map((node) => {
              const parentMass = node.parentId ? treeMassById.get(node.parentId) : 100;
              return {
              id: node.id,
              label: node.label,
              gw: Number(node.gw),
              parent_id: node.parentId || null,
              probability: node.parentId && Number(parentMass) > 0
                ? Number(node.probability) / Number(parentMass)
                : 1,
              chip: node.chip || "none",
              scenario_id: !node.parentId
                ? BASE_SCENARIO_ID
                : String(node.scenarioId || "inherit"),
              };
            }),
          }
        : null,
    });
    const optimized = optimizationResult === true || optimizationResult?.ok === true;
    const resultRows = Array.isArray(optimizationResult?.rows)
      ? optimizationResult.rows.filter((row) => Number(row?.solution || 1) === 1)
      : [];
    const confirmedTransferIds = new Set();

    if (optimized) {
      submittedTransfers.forEach((transfer) => {
        const gw = Number(transfer?.gw);
        const outKey = normalizeLoosePlayerKey(transfer?.outName);
        const inKey = normalizeLoosePlayerKey(transfer?.inName);
        const findForcedRow = (status, playerKey) =>
          resultRows.find(
            (row) =>
              Number(row?.GW) === gw &&
              row?.status === status &&
              Boolean(row?.Is_forced_transfer) &&
              normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === playerKey
          );
        const outRow = findForcedRow("transferred_out", outKey);
        const inRow = findForcedRow("transferred_in", inKey);
        if (
          outRow &&
          inRow &&
          outRow.Forced_transfer_id &&
          outRow.Forced_transfer_id === inRow.Forced_transfer_id
        ) {
          confirmedTransferIds.add(transfer.id);
        }
      });
    }

    if (optimized) {
      setManualPlan((prev) =>
        Object.fromEntries(
          Object.entries(prev || {}).map(([gw, plan]) => [
            gw,
            {
              transfers: (plan?.transfers || []).map((transfer) =>
                submittedTransferIds.has(transfer?.id) && confirmedTransferIds.has(transfer?.id)
                  ? { ...transfer, isLocked: true }
                  : submittedTransferIds.has(transfer?.id)
                  ? { ...transfer, isLocked: false }
                  : transfer
              ),
              statusOverrides: {},
            },
          ])
        )
      );
      const unconfirmedCount = submittedTransferIds.size - confirmedTransferIds.size;
      sethas_changed(unconfirmedCount > 0);
      setSaveHint(
        confirmedTransferIds.size > 0
          ? `${confirmedTransferIds.size} manual transfer${confirmedTransferIds.size === 1 ? "" : "s"} confirmed and locked by the solver.`
          : ""
      );
      setSaveError(
        unconfirmedCount > 0
          ? `${unconfirmedCount} manual transfer restriction${unconfirmedCount === 1 ? " was" : "s were"} not confirmed in the solver result. It remains pending; restart the API if it is still running older code.`
          : ""
      );
    } else {
      sethas_changed(true);
      setSaveError("Optimization failed. Manual transfers remain pending and were not removed.");
    }
  };

  const handleLoadTeam = useCallback(async () => {
    const loaded = await fetchMyTeam();
    if (!loaded) return;

    // A freshly loaded FPL squad is the untouched baseline. Remove all local
    // planner overlays so only a later Optimize action can alter the team.
    setManualPlan({});
    setHiddenModelTransferKeys([]);
    setTransferOutName("");
    setTransferInKey("");
    setSelectedSolution(1);
    setActiveSavedId(null);
    setSaveError("");
    setSaveHint("Team loaded. Run Optimize when you want to apply a solver plan.");
  }, [fetchMyTeam]);

  const canSave = !!data && Array.isArray(data) && data.length > 0 && typeof saveOptimization === "function";

  const normalizeName = (s) =>
    (s || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);

  const handleSaveOptimization = () => {
    setSaveError("");
    setSaveHint("");

    if (!canSave) {
      setSaveError("Run an optimization first.");
      return;
    }

    const trimmed = normalizeName(saveName);
    if (!trimmed) {
      setSaveError("Add a name like ‘Low risk · FH GW29’.");
      return;
    }

    const payload = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: trimmed,
      createdAt: Date.now(),
      snapshot: {
        params: {
          teamId: String(teamId || ""),
          bbRound: bbRound || "",
          wildRound: wildRound || "",
          freehitROund: freehitROund || "",
          bannedList: Array.isArray(bannedList) ? bannedList : [],
          n_hits: Number(n_hits || 0),
          risk: Number(risk || 0),
          valtrans: Number(valtrans || 0.5),
          modelType,
          scenarioId: modelType === "statistical" ? solverScenarioId : null,
          scenarioName: modelType === "statistical" ? selectedSolverScenario?.name || "Base scenario" : null,
          selectedSolution: Number(selectedSolution || 1),
          treeMode,
          treeNodes: syncedTreeNodes,
          treeNodePositions,
          selectedTreeBranchId,
        },
        result: {
          data,
          bannedPlayersData: Array.isArray(bannedPlayersData) ? bannedPlayersData : [],
          manualPlan,
        },
      },
    };

    saveOptimization(payload);
    setActiveSavedId(payload.id);
    setSaveName("");
    setSaveHint("Saved successfully.");
    setTimeout(() => setSaveHint(""), 1500);
  };

  const runLabel = (opt) => {
    const created = opt?.createdAt ? new Date(opt.createdAt) : null;
    const ts = created
      ? created.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const isStatistical = opt?.snapshot?.params?.modelType === "statistical";
    const savedScenarioName = opt?.snapshot?.params?.scenarioName;
    const mt = isStatistical
      ? `Statistical${savedScenarioName ? ` · ${savedScenarioName}` : ""}`
      : "AI";
    return `${mt}${ts ? ` · ${ts}` : ""}`;
  };

  const activeChipsCount = (bbRound ? 1 : 0) + (wildRound ? 1 : 0) + (freehitROund ? 1 : 0);
  const totalTransfers = plannerPayload.length;

  useEffect(() => {
    if (!loading && Array.isArray(data) && data.length > 0 && typeof window !== "undefined" && window.innerWidth < 640) {
      const t = setTimeout(() => {
        pitchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="w-full max-w-md rounded-[28px] p-6 shadow-2xl"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,255,255,0.95))",
            boxShadow: "0 25px 50px rgba(15,23,42,0.12)",
          }}
        >
          <div className="flex items-center justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse"
              style={{
                background: "rgba(95,143,123,0.12)",
                border: `1px solid rgba(95,143,123,0.45)`,
              }}
            >
              <RefreshCw size={24} className="lucide-icon animate-spin" style={{ color: PALETTE.gold }} />
            </div>
          </div>

          <div className="mb-2 text-center text-sm font-medium" style={{ color: PALETTE.muted }}>
            {loadingPhase === "fetch" ? "Fetching your team data" : "Building the optimal plan"}
          </div>
          <div className="mb-4 text-center text-xs" style={{ color: PALETTE.muted }}>
            Evaluating chips, transfers, and projected outcomes.
          </div>

          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full transition-[width] duration-200 ease-out rounded-full"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`,
              }}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              role="progressbar"
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px]" style={{ color: PALETTE.muted }}>
            <span>{loadingPhase === "fetch" ? "Step 1 of 2" : "Step 2 of 2"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 52%, #cbd5e1 100%)`,
        color: PALETTE.beige,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        .lucide-icon {
          stroke: currentColor !important;
          fill: none !important;
          display: block;
          flex-shrink: 0;
        }
        @media (max-width: 640px) {
          input, select, textarea {
            font-size: 16px !important;
          }
        }
        summary::-webkit-details-marker { display: none; }
        .glass-card {
          border: 1px solid ${PALETTE.border};
          background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95));
          box-shadow: 0 18px 40px rgba(15,23,42,0.1);
          backdrop-filter: blur(12px);
        }
        .gold-ring:focus-visible {
          outline: 2px solid ${PALETTE.gold};
          outline-offset: 2px;
        }
        .opt-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: ${PALETTE.gold};
          border: 2px solid #e2e8f0;
          box-shadow: 0 0 0 2px rgba(95,143,123,0.35);
          transition: transform .15s ease;
        }
        .opt-range::-webkit-slider-thumb:hover { transform: scale(1.08); }
        .opt-range::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: ${PALETTE.gold};
          border: 2px solid #e2e8f0;
          box-shadow: 0 0 0 2px rgba(95,143,123,0.35);
        }
        .opt-range::-moz-range-track {
          height: 6px;
          background: #cbd5e1;
          border-radius: 999px;
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 text-[11px] uppercase tracking-[0.18em]"
              style={{
                color: PALETTE.gold,
                border: `1px solid rgba(95,143,123,0.35)`,
                background: "rgba(95,143,123,0.08)",
              }}
            >
              <Sparkles size={14} className="lucide-icon" />
              Optimization Workspace
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: PALETTE.text }}>
              Optimize My Team
            </h1>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: PALETTE.muted }}>
              Build a cleaner transfer plan, compare AI vs statistical logic, and move the best recommendations straight into your planner.
            </p>
          </div>
          <div className="w-full sm:w-[280px] glass-card rounded-2xl p-3">
            <FieldShell label="Team ID" icon={Users}>
              <div className="flex gap-2">
                <input
                  id="team-id-top"
                  type="number"
                  inputMode="numeric"
                  placeholder="Required"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !teamLoading) {
                      event.preventDefault();
                      handleLoadTeam();
                    }
                  }}
                  className="gold-ring min-w-0 flex-1 h-12 px-3 rounded-2xl text-base sm:text-sm outline-none"
                  style={{
                    fontSize: 16,
                    border: `1px solid ${PALETTE.border}`,
                    backgroundColor: "rgba(248,250,252,0.92)",
                    color: PALETTE.beige,
                  }}
                />
                <button
                  type="button"
                  onClick={handleLoadTeam}
                  disabled={teamLoading || !String(teamId || "").trim()}
                  className="gold-ring rounded-2xl px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ border: `1px solid ${PALETTE.border}`, color: PALETTE.gold }}
                >
                  {teamLoading ? "Loading" : "Load"}
                </button>
              </div>
              {teamError ? (
                <p className="mt-2 text-xs text-rose-600" role="alert">{teamError}</p>
              ) : null}
            </FieldShell>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-6">
          <div className="glass-card rounded-[28px] p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setControlsOpen((v) => !v)}
              className="gold-ring w-full flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between text-left rounded-2xl px-3 py-3" style={{ background: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.border}` }}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                  <SlidersHorizontal size={16} className="lucide-icon" />
                  Optimization controls
                </div>
                <p className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Tune your team ID, chips, model, and optimization profile.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start sm:self-center" style={{ color: PALETTE.muted }}>
                <span className="text-xs">{controlsOpen ? "Minimize" : "Expand"}</span>
                {controlsOpen ? <ChevronDown size={18} className="lucide-icon" /> : <ChevronRight size={18} className="lucide-icon" />}
              </div>
            </button>

            {controlsOpen && (
              <>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-start">
              <FieldShell label="Model" icon={Brain} className="min-w-0 md:col-span-2 xl:col-span-10">
                <div className="grid grid-cols-2 gap-2">
                  <ModelButton active={modelType === "ai"} onClick={() => setModelType("ai")} icon={Sparkles}>
                    AI model
                  </ModelButton>
                  <ModelButton
                    active={modelType === "statistical"}
                    onClick={() => hasStatisticalData && setModelType("statistical")}
                    disabled={!hasStatisticalData}
                    icon={Trophy}
                  >
                    Statistical
                  </ModelButton>
                </div>
                {modelType === "statistical" && (
                  <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: PALETTE.border, background: "rgba(248,250,252,0.82)" }}>
                    {treeMode ? (
                      <p className="text-[11px]" style={{ color: PALETTE.muted }}>
                        The tree starts with Base scenario. Select a different statistical scenario on any child node to switch that branch from that GW onward.
                      </p>
                    ) : (
                      <>
                        <label htmlFor="solver-scenario" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                          Prediction scenario
                        </label>
                        <select
                          id="solver-scenario"
                          value={solverScenarioId}
                          onChange={(event) => setSolverScenarioId(event.target.value)}
                          className="h-10 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none"
                          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                        >
                          {adjustmentScenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                          Independent of the scenario currently open in Adjustment Analytics.
                        </p>
                      </>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/Adjustment_Analysis/Adjustment_Player")}
                  className="gold-ring mt-2 text-[11px] inline-flex items-center gap-2 underline decoration-dotted"
                  style={{ color: PALETTE.gold, alignSelf: "flex-start" }}
                >
                  <PencilLine size={13} className="lucide-icon" />
                  Edit player stats
                  {!hasStatisticalData && <span style={{ color: "#fbbf24" }}>(required to enable)</span>}
                </button>
              </FieldShell>
            </div>
            {false && (
              <FieldShell label="Force Hits" icon={Shield} className="min-w-0 md:col-span-1 xl:col-span-2 mt-3">
                <div
                  className="h-12 min-w-0 rounded-2xl flex items-center justify-between px-2 gap-2"
                  style={{ backgroundColor: "rgba(248,250,252,0.95)", border: `1px solid ${PALETTE.border}` }}
                >
                  <IconButton ariaLabel="Decrease hits" onClick={() => setn_hits(Math.max(0, Number(n_hits || 0) - 1))} label="−" />
                  <div className="flex flex-col items-center leading-none select-none">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Count</span>
                    <span className="text-sm font-semibold">{Number(n_hits || 0)}</span>
                  </div>
                  <IconButton ariaLabel="Increase hits" onClick={() => setn_hits(Number(n_hits || 0) + 1)} label="+" />
                </div>
              </FieldShell>
            )}

            <div
              className="mt-4 rounded-[24px] p-4"
              style={{ border: `1px solid ${treeMode ? PALETTE.gold : PALETTE.border}`, background: "rgba(248,250,252,0.88)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                    <GitBranch size={16} className="lucide-icon" />
                    Decision tree
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                    Build GW nodes, split any path, and attach chips to individual nodes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTreeMode((enabled) => !enabled)}
                  className="gold-ring rounded-full px-3 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: `1px solid ${treeMode ? PALETTE.gold : PALETTE.border}`,
                    background: treeMode ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "white",
                    color: treeMode ? "#0f172a" : PALETTE.muted,
                  }}
                >
                  {treeMode ? "Tree enabled" : "Enable tree"}
                </button>
              </div>

              {treeMode && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px]" style={{ color: PALETTE.muted }}>
                      Every leaf has its own total probability. Splitting a leaf divides that leaf's probability 50/50 by default.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const resetNodes = DEFAULT_TREE_NODES.map((node) => ({ ...node }));
                        setTreeNodes(resetNodes);
                        setTreeNodePositions(buildVerticalTreeLayout(resetNodes).positions);
                      }}
                      className="gold-ring shrink-0 rounded-full border bg-white px-3 py-1.5 text-[11px] font-semibold"
                      style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                    >
                      Reset tree
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px]" style={{ color: PALETTE.muted }}>
                    <span>Drag nodes to arrange the canvas. Use + on a connection to branch that next GW.</span>
                    <button
                      type="button"
                      onClick={() => setTreeNodePositions(treeAutoLayout.positions)}
                      className="gold-ring shrink-0 rounded-full border bg-white px-3 py-1.5 font-semibold"
                      style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                    >
                      Auto layout
                    </button>
                  </div>

                  <div
                    ref={treeCanvasRef}
                    className="mt-3 max-h-[760px] overflow-auto rounded-2xl border"
                    style={{ borderColor: PALETTE.border, background: "radial-gradient(circle, rgba(148,163,184,0.32) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                  >
                    <div
                      className="relative select-none"
                      style={{ width: treeCanvasWidth, height: treeCanvasHeight, minWidth: "100%" }}
                      onPointerMove={moveTreeNode}
                      onPointerUp={stopTreeNodeDrag}
                      onPointerCancel={stopTreeNodeDrag}
                    >
                      <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
                        {treeNodes.filter((node) => node.parentId).map((node) => {
                          const parentPosition = treeNodePositions[node.parentId] || treeAutoLayout.positions[node.parentId];
                          const nodePosition = treeNodePositions[node.id] || treeAutoLayout.positions[node.id];
                          if (!parentPosition || !nodePosition) return null;
                          const startX = parentPosition.x + TREE_NODE_WIDTH / 2;
                          const startY = parentPosition.y + TREE_NODE_HEIGHT;
                          const endX = nodePosition.x + TREE_NODE_WIDTH / 2;
                          const endY = nodePosition.y;
                          const controlY = (startY + endY) / 2;
                          return (
                            <path
                              key={`${node.parentId}-${node.id}`}
                              d={`M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`}
                              fill="none"
                              stroke="rgba(95,143,123,0.78)"
                              strokeWidth="2.5"
                            />
                          );
                        })}
                      </svg>

                      {treeNodes.filter((node) => node.parentId).map((node) => {
                        const parentPosition = treeNodePositions[node.parentId] || treeAutoLayout.positions[node.parentId];
                        const nodePosition = treeNodePositions[node.id] || treeAutoLayout.positions[node.id];
                        if (!parentPosition || !nodePosition) return null;
                        const x = (parentPosition.x + nodePosition.x) / 2 + TREE_NODE_WIDTH / 2;
                        const y = (parentPosition.y + TREE_NODE_HEIGHT + nodePosition.y) / 2;
                        return (
                          <button
                            key={`split-${node.parentId}-${node.id}`}
                            type="button"
                            onClick={() => addTreeChildren(node.parentId, true)}
                            className="gold-ring absolute z-20 flex h-7 w-7 items-center justify-center rounded-full border bg-white text-base font-black shadow-md transition hover:scale-110"
                            style={{ left: x - 14, top: y - 14, borderColor: PALETTE.gold, color: PALETTE.gold }}
                            title={`Add another GW${node.gw} branch`}
                          >
                            +
                          </button>
                        );
                      })}

                      {syncedTreeNodes.map((node) => {
                        const children = treeChildrenByParent.get(node.id) || [];
                        const position = treeNodePositions[node.id] || treeAutoLayout.positions[node.id] || { x: 0, y: 0 };
                        const isLeaf = children.length === 0;
                        const siblingNodes = node.parentId ? treeChildrenByParent.get(node.parentId) || [] : [];
                        const parentMass = node.parentId ? Number(treeMassById.get(node.parentId)) || 0 : 100;
                        const splitProbability = parentMass > 0
                          ? Number(node.probability || 0) / parentMass * 100
                          : 0;
                        const hasSplitProbability = siblingNodes.length > 1;
                        const isDragging = draggingTreeNode?.nodeId === node.id;
                        const effectiveScenarioId = treeEffectiveScenarioById.get(node.id) || BASE_SCENARIO_ID;
                        const scenarioDiagnostics = treeScenarioDiagnosticsByNodeId.get(node.id);
                        return (
                          <div
                            key={node.id}
                            className="absolute z-10 w-56 overflow-hidden rounded-2xl border bg-white shadow-lg"
                            style={{
                              left: position.x,
                              top: position.y,
                              height: TREE_NODE_HEIGHT,
                              borderColor: node.chip !== "none" ? PALETTE.gold : PALETTE.border,
                              boxShadow: isDragging ? "0 20px 40px rgba(15,23,42,0.24)" : "0 10px 24px rgba(15,23,42,0.12)",
                              transition: isDragging ? "none" : "box-shadow 160ms ease, border-color 160ms ease",
                            }}
                          >
                            <div
                              className="flex h-9 touch-none cursor-grab items-center justify-between px-3 active:cursor-grabbing"
                              style={{ background: node.chip !== "none" ? "rgba(95,143,123,0.14)" : "rgba(241,245,249,0.92)" }}
                              onPointerDown={(event) => startTreeNodeDrag(event, node.id)}
                            >
                              <span className="inline-flex items-center gap-1.5 text-xs font-black" style={{ color: PALETTE.gold }}>
                                <GripVertical size={13} /> GW{node.gw}
                              </span>
                              <span className="text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                {Number(node.probability || 0).toFixed(1)}% subtree
                              </span>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center gap-2">
                                <input
                                  value={node.label}
                                  onChange={(event) => updateTreeNode(node.id, { label: event.target.value })}
                                  className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs font-semibold outline-none"
                                  style={{ borderColor: PALETTE.border }}
                                  aria-label={`Name for GW${node.gw} node`}
                                />
                                {node.parentId && (
                                  <button
                                    type="button"
                                    onClick={() => removeTreeBranch(node.id)}
                                    className="gold-ring rounded-full p-1"
                                    style={{ color: PALETTE.danger }}
                                    title="Remove this branch and all nodes after it"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>

                              {hasSplitProbability && (
                                <label className="mt-2 block text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>Split probability</span>
                                    <span className="rounded-full px-2 py-0.5 font-black" style={{ background: "rgba(95,143,123,0.12)", color: PALETTE.gold }}>
                                      {splitProbability.toFixed(1)}%
                                    </span>
                                  </span>
                                  <input
                                    type="range"
                                    min="0.1"
                                    max="99.9"
                                    step="0.1"
                                    value={splitProbability}
                                    onChange={(event) => updateTreeSplitProbability(node.id, event.target.value)}
                                    className="mt-2 h-2 w-full cursor-pointer"
                                    style={{ accentColor: PALETTE.gold }}
                                    aria-label={`Conditional split probability for ${node.label}`}
                                  />
                                </label>
                              )}

                              {isLeaf && (
                                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                  <span>Implied leaf probability</span>
                                  <span className="font-black" style={{ color: PALETTE.gold }}>
                                    {Number(node.probability || 0).toFixed(1)}%
                                  </span>
                                </div>
                              )}

                              <label className="mt-2 block text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                Chip at this node
                                <select
                                  value={node.chip}
                                  onChange={(event) => updateTreeNode(node.id, { chip: event.target.value })}
                                  className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none"
                                  style={{ borderColor: PALETTE.border }}
                                >
                                  <option value="none">No chip</option>
                                  <option value="wildcard">Wildcard</option>
                                  <option value="freehit">Free Hit</option>
                                  <option value="bench_boost">Bench Boost</option>
                                </select>
                              </label>

                              {modelType === "statistical" && (
                                <div className="mt-2">
                                  <label className="block text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                    Statistical scenario
                                    {node.parentId ? (
                                      <select
                                        value={String(node.scenarioId || "inherit")}
                                        onChange={(event) => updateTreeNode(node.id, { scenarioId: event.target.value })}
                                        className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none"
                                        style={{ borderColor: PALETTE.border }}
                                      >
                                        <option value="inherit">
                                          Inherit ({adjustmentScenarios.find((scenario) => scenario.id === treeEffectiveScenarioById.get(node.parentId))?.name || "Base scenario"})
                                        </option>
                                        {adjustmentScenarios.map((scenario) => (
                                          <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <div className="mt-1 flex h-8 items-center rounded-lg border bg-slate-50 px-2 text-xs" style={{ borderColor: PALETTE.border }}>
                                        Base scenario
                                      </div>
                                    )}
                                  </label>
                                  {node.parentId && effectiveScenarioId !== BASE_SCENARIO_ID && scenarioDiagnostics && (
                                    <p
                                      className="mt-1 text-[9px] font-semibold leading-tight"
                                      style={{ color: scenarioDiagnostics.changedRows > 0 ? PALETTE.gold : PALETTE.danger }}
                                    >
                                      {scenarioDiagnostics.changedRows > 0
                                        ? `${scenarioDiagnostics.changedRows} predictions differ from Base from GW${node.gw} (max ${scenarioDiagnostics.maxAbsDiff.toFixed(2)} pts)`
                                        : `Warning: this scenario has the same predictions as Base from GW${node.gw}`}
                                    </p>
                                  )}
                                </div>
                              )}

                              {isLeaf && Number(node.gw) < 38 && (
                                <button
                                  type="button"
                                  onClick={() => addTreeChildren(node.id, false)}
                                  className="gold-ring mt-3 w-full rounded-xl border px-2 py-1.5 text-[10px] font-semibold"
                                  style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                                >
                                  Continue to GW{Number(node.gw) + 1}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {!treeConfigValid && (
                    <p className="mt-2 text-xs text-rose-600">
                      The tree needs one connected root, consecutive GWs, and valid split probabilities.
                    </p>
                  )}
                  <p className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
                    The optimizer locks all transfers shared before each split, then optimizes every child path using its probability. Standard chip controls below are ignored while tree mode is enabled.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <details
                open={chipsOpen}
                onToggle={(e) => setChipsOpen(e.currentTarget.open)}
                className="rounded-[24px] overflow-hidden min-w-0"
                style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)" }}
              >
                <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <CalendarRange size={16} className="lucide-icon" />
                    <span className="font-semibold">Chip strategy</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: PALETTE.muted }}>
                    <span>{activeChipsCount} active</span>
                    {chipsOpen ? <ChevronDown size={14} className="lucide-icon" /> : <ChevronRight size={14} className="lucide-icon" />}
                  </div>
                </summary>

                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                  <ChipSelect
                    label="Bench Boost GW"
                    show={showBbInput}
                    onShow={() => {
                      setShowBbInput(true);
                      if (minGW != null) setBbRound(minGW);
                    }}
                    onHide={() => {
                      setShowBbInput(false);
                      setBbRound("");
                    }}
                    value={bbRound}
                    onChange={(v) => setBbRound(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Bench Boost"
                    icon={Shield}
                  />

                  <ChipSelect
                    label="Wildcard GW"
                    show={showWildInput}
                    onShow={() => {
                      setShowWildInput(true);
                      if (minGW != null) setWildRound(minGW);
                    }}
                    onHide={() => {
                      setShowWildInput(false);
                      setWildRound("");
                    }}
                    value={wildRound}
                    onChange={(v) => setWildRound(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Wildcard"
                    icon={RefreshCw}
                  />

                  <ChipSelect
                    label="Free Hit GW"
                    show={showfreehitInput}
                    onShow={() => {
                      setshowfreehitInput(true);
                      if (minGW != null) setfreehitROund(minGW);
                    }}
                    onHide={() => {
                      setshowfreehitInput(false);
                      setfreehitROund("");
                    }}
                    value={freehitROund}
                    onChange={(v) => setfreehitROund(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Free Hit"
                    icon={Zap}
                  />
                </div>
              </details>

              <details
                open={optParamsOpen}
                onToggle={(e) => setOptParamsOpen(e.currentTarget.open)}
                className="rounded-[24px] overflow-hidden min-w-0"
                style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)" }}
              >
                <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <SlidersHorizontal size={16} className="lucide-icon" />
                    <span className="font-semibold">Optimization settings</span>
                  </div>
    
                </summary>

                <div className="px-4 pb-4 grid grid-cols-1 gap-4">
                  <PreferenceSlider
                    title="Risk preference"
                    icon={Shield}
                    value={risk}
                    setValue={setRisk}
                    min={-1}
                    max={1}
                    step={0.2}
                    clamp={clampRisk}
                    presets={[
                      { label: "Low", value: -0.6 },
                      { label: "Neutral", value: 0 },
                      { label: "High", value: 0.6 },
                    ]}
                    description="Low risk prefers stable picks. High risk rewards differentials."
                    fillPercent={((Number(risk) + 1) / 2) * 100}
                  />

                  <PreferenceSlider
                    title="Transfer value"
                    icon={Lock}
                    value={valtrans}
                    setValue={setValtrans}
                    min={0}
                    max={1}
                    step={0.25}
                    clamp={clampValTrans}
                    presets={[
                      { label: "Low", value: 0 },
                      { label: "Neutral", value: 0.5 },
                      { label: "High", value: 1 },
                    ]}
                    description="Higher value preserves transfers more."
                    fillPercent={Number(valtrans) * 100}
                  />
                </div>
              </details>
            </div>
            </>
            )}
          </div>

          <div className="glass-card rounded-[28px] p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setSavedOpen((v) => !v)}
              className="gold-ring w-full flex items-start justify-between gap-3 text-left rounded-2xl px-3 py-3" style={{ background: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.border}` }}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                  <Save size={16} className="lucide-icon" />
                  Saved optimizations
                </div>
                <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Save strong runs and reload them instantly.
                </div>
              </div>
              <div className="inline-flex items-center gap-2 self-start sm:self-center" style={{ color: PALETTE.muted }}>
                <span className="text-xs">{savedOpen ? "Minimize" : "Expand"}</span>
                {savedOpen ? <ChevronDown size={18} className="lucide-icon" /> : <ChevronRight size={18} className="lucide-icon" />}
              </div>
            </button>

            {savedOpen && (
            <>
            <div className="mt-4 rounded-[24px] p-4" style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.9)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                    Save this run
                  </div>
                  <div className="text-sm font-semibold">Optimization name</div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveOptimization}
                  disabled={!canSave}
                  className="gold-ring inline-flex items-center gap-2 px-3 py-2 rounded-full font-semibold transition"
                  style={{
                    border: `1px solid ${canSave ? PALETTE.gold : "#cbd5e1"}`,
                    background: canSave ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.9)",
                    color: canSave ? "#0f172a" : PALETTE.muted,
                    cursor: canSave ? "pointer" : "not-allowed",
                  }}
                >
                  <BookmarkPlus size={16} className="lucide-icon" />
                  Save
                </button>
              </div>

              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={canSave ? "e.g. Low risk · FH GW29" : "Run optimization to enable saving"}
                disabled={!canSave}
                className="gold-ring mt-3 h-12 w-full px-3 rounded-2xl text-sm outline-none"
                style={{
                  fontSize: 16,
                  border: `1px solid ${saveError ? "rgba(248,113,113,0.6)" : PALETTE.border}`,
                  backgroundColor: !canSave ? "rgba(248,250,252,0.84)" : "rgba(248,250,252,0.94)",
                  color: PALETTE.beige,
                }}
              />

              {(saveError || saveHint) && (
                <div className="mt-2 text-xs inline-flex items-center gap-2" style={{ color: saveError ? "#fbbf24" : PALETTE.success }}>
                  {saveError ? <CircleDashed size={14} className="lucide-icon" /> : <CheckCircle2 size={14} className="lucide-icon" />}
                  {saveError || saveHint}
                </div>
              )}
            </div>

            <div className="mt-4">
              {typeof loadOptimization !== "function" || typeof deleteOptimization !== "function" ? (
                <div className="text-xs rounded-2xl p-4" style={{ color: "#fbbf24", border: `1px solid rgba(251,191,36,0.25)`, background: "rgba(251,191,36,0.06)" }}>
                  Missing context functions: <span className="font-semibold">loadOptimization</span> and/or <span className="font-semibold">deleteOptimization</span>.
                </div>
              ) : savedOptimizations.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ border: `1px dashed ${PALETTE.border}`, background: "rgba(248,250,252,0.76)" }}>
                  <Save size={24} className="lucide-icon mx-auto mb-2" style={{ color: PALETTE.gold }} />
                  <div className="text-sm font-semibold">No saved optimizations yet</div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Run an optimization and save it for quick comparisons.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {savedOptimizations
                    .slice()
                    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
                    .map((opt) => {
                      const isActive = opt.id === activeSavedId;
                      return (
                        <div
                          key={opt.id}
                          className="rounded-2xl p-3 flex items-center justify-between gap-3 transition"
                          style={{
                            border: isActive ? `1px solid ${PALETTE.gold}` : `1px solid ${PALETTE.border}`,
                            background: isActive ? "rgba(95,143,123,0.10)" : "rgba(248,250,252,0.8)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const savedParams = opt?.snapshot?.params || {};
                              const savedManualPlan = opt?.snapshot?.result?.manualPlan;
                              const restoredManualPlan =
                                savedManualPlan && typeof savedManualPlan === "object"
                                  ? savedManualPlan
                                  : {};
                              pendingSavedManualPlanRef.current =
                                String(savedParams.teamId ?? "") !== String(teamId ?? "")
                                  ? restoredManualPlan
                                  : null;
                              setManualPlan(restoredManualPlan);
                              setHiddenModelTransferKeys([]);
                              loadOptimization(opt.id);
                              const savedModel = savedParams.modelType === "statistical" ? "statistical" : "ai";
                              setModelType(savedModel);
                              if (savedModel === "statistical") {
                                const scenarioExists = adjustmentScenarios.some(
                                  (scenario) => scenario.id === savedParams.scenarioId
                                );
                                setSolverScenarioId(
                                  scenarioExists ? savedParams.scenarioId : BASE_SCENARIO_ID
                                );
                              }
                              setTreeMode(Boolean(savedParams.treeMode));
                              setTreeNodes(
                                Array.isArray(savedParams.treeNodes) && savedParams.treeNodes.length > 0
                                  ? savedParams.treeNodes
                                  : DEFAULT_TREE_NODES.map((node) => ({ ...node }))
                              );
                              const savedTreePositions =
                                savedParams.treeNodePositions && typeof savedParams.treeNodePositions === "object"
                                  ? savedParams.treeNodePositions
                                  : {};
                              pendingTreePositionsRef.current = savedTreePositions;
                              setTreeNodePositions(savedTreePositions);
                              setSelectedTreeBranchId(String(savedParams.selectedTreeBranchId || ""));
                              setActiveSavedId(opt.id);
                              setSaveError("");
                              setSaveHint("");
                            }}
                            className="gold-ring text-left flex-1"
                            title="Load this optimization"
                            style={{ color: PALETTE.beige }}
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.goldSoft }}>
                              <Sparkles size={14} className="lucide-icon" />
                              {opt.name}
                            </div>
                            <div className="text-[11px] mt-1" style={{ color: PALETTE.muted }}>
                              {runLabel(opt)}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              deleteOptimization(opt.id);
                              if (activeSavedId === opt.id) setActiveSavedId(null);
                            }}
                            className="gold-ring inline-flex items-center justify-center w-9 h-9 rounded-full transition"
                            style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)", color: PALETTE.danger }}
                            aria-label={`Delete ${opt.name}`}
                            title="Delete"
                          >
                            <X size={16} className="lucide-icon" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </section>

        {bannedPlayersData.length > 0 && (
          <section className="mb-6 glass-card rounded-[28px] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Ban size={18} className="lucide-icon" style={{ color: PALETTE.gold }} />
                  Unwanted players
                </h2>
                <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Players marked here are excluded from incoming recommendations.
                </div>
              </div>
              <div className="text-[11px] px-3 py-1 rounded-full" style={{ color: PALETTE.gold, border: `1px solid rgba(95,143,123,0.35)`, background: "rgba(95,143,123,0.08)" }}>
                {bannedPlayersData.length} blocked
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {bannedPlayersData.map((player) => (
                <div
                  key={player.Name}
                  className="relative flex items-center gap-2 px-2 py-2 rounded-full text-sm transition"
                  style={{ backgroundColor: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", color: "#b91c1c" }}
                >
                  <img
                    src={player.photo}
                    alt={player.web_name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
                    }}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="truncate max-w-[8rem]">{player.web_name}</span>
                  <button
                    onClick={() => removeBan(player.Name)}
                    className="gold-ring absolute -top-1 -right-1 rounded-full p-1"
                    style={{ backgroundColor: "rgba(248,250,252,0.94)", color: PALETTE.beige }}
                    aria-label={`Remove ${player.web_name} from unwanted`}
                  >
                    <X size={12} className="lucide-icon" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {pitchSourceData.length > 0 && (
          <section ref={pitchSectionRef} className="mb-6 grid grid-cols-1 gap-6 items-start">
            <div className="glass-card flex flex-col rounded-[28px] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <Trophy size={16} className="lucide-icon" />
                    {activeSolutionData.length > 0
                      ? `Optimized XI - Solution ${selectedSolution}`
                      : "Loaded FPL team"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    {activeSolutionData.length > 0
                      ? "Tap a player to open analytics. Use X to ban or add a manual transfer for a specific GW."
                      : "This is the untouched squad from the Team ID. Run Optimize to apply a solver plan."}
                  </div>
                </div>
                <div
                  className="shrink-0 rounded-2xl px-3 py-2 text-right text-xs font-black tabular-nums"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "rgba(15,23,42,0.92)",
                    color: "#fff",
                  }}
                >
                  <div className="text-[9px] uppercase tracking-wide" style={{ color: "#cbd5e1" }}>
                    Total {selectedMeasureMeta.short}
                  </div>
                  <div className="text-lg leading-tight">
                    {formatMeasureValue(overallMeasureTotal, teamMeasure)}
                  </div>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                {MEASURE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = teamMeasure === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setTeamMeasure(option.key)}
                      className="gold-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition"
                      style={{
                        border: `1px solid ${active ? PALETTE.gold : PALETTE.border}`,
                        background: active
                          ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                          : "rgba(248,250,252,0.9)",
                        color: active ? "#0f172a" : PALETTE.beige,
                      }}
                    >
                      <Icon size={13} className="lucide-icon" />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {treeBranches.length > 0 && (
                <div className="mb-4 rounded-2xl p-3" style={{ border: `1px solid ${PALETTE.gold}`, background: "rgba(95,143,123,0.08)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: PALETTE.gold }}>
                        <GitBranch size={14} className="lucide-icon" />
                        {treeBranches.length > 1
                          ? `Optimized tree paths · first split after GW${activeTreeBranch?.splitGw}`
                          : "Optimized tree path"}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                        Expected points: {Number.isFinite(activeTreeBranch?.expectedPoints) ? activeTreeBranch.expectedPoints.toFixed(2) : "-"}
                        {Number.isFinite(activeTreeBranch?.expectedHits) ? ` · expected hits ${activeTreeBranch.expectedHits.toFixed(2)}` : ""}
                        {Number.isFinite(activeTreeBranch?.expectedObjective) ? ` · penalized objective ${activeTreeBranch.expectedObjective.toFixed(2)}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {treeBranches.map((branch) => {
                        const active = branch.id === activeTreeBranch?.id;
                        return (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => setSelectedTreeBranchId(branch.id)}
                            className="gold-ring rounded-xl px-3 py-2 text-left text-xs transition"
                            style={{
                              border: `1px solid ${active ? PALETTE.gold : PALETTE.border}`,
                              background: active ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "white",
                              color: active ? "#0f172a" : PALETTE.text,
                            }}
                          >
                            <span className="block font-semibold">{branch.label}</span>
                            <span className="block text-[10px] opacity-75">
                              {Number.isFinite(branch.probability) ? `${Math.round(branch.probability * 100)}%` : "-"}
                              {Number.isFinite(branch.points) ? ` · ${branch.points.toFixed(2)} pts` : ""}
                              {Number.isFinite(branch.hits) && branch.hits > 0 ? ` · ${branch.hits.toFixed(0)} hit` : ""}
                            </span>
                            {modelType === "statistical" && (
                              <span className="mt-0.5 block text-[9px] opacity-70">
                                {adjustmentScenarios.find((scenario) => scenario.id === branch.scenarioId)?.name || "Base scenario"}
                                {branch.scenarioId !== BASE_SCENARIO_ID && Number.isFinite(branch.projectionChangedRows)
                                  ? branch.projectionChangedRows > 0
                                    ? ` · ${branch.projectionChangedRows} changed predictions · max ${branch.projectionMaxAbsDiff.toFixed(2)} pts`
                                    : " · no prediction differences from Base"
                                  : ""}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {(activeSolutionData.length > 0 || optimizationProgress?.streaming) && (
              <div className="mb-4 rounded-2xl p-3" style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.82)" }}>
                <div className="flex flex-col items-center justify-center gap-1 text-center">
                  <div className="text-xs font-semibold" style={{ color: PALETTE.gold }}>
                    Solution set
                  </div>
                  <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                    {optimizationProgress?.streaming
                      ? `Loading ${solutionNumbers.length}/${expectedSolutions}`
                      : `${solutionNumbers.length}/${expectedSolutions} ready`}
                  </div>
                </div>
                <div className="mt-2 flex justify-center gap-2 overflow-x-auto pb-1">
                  {solutionSlots.map((sol) => {
                    const ready = solutionNumbers.includes(sol);
                    const active = selectedSolution === sol;
                    return (
                      <button
                        key={sol}
                        type="button"
                        onClick={() => ready && setSelectedSolution(sol)}
                        disabled={!ready}
                        className="gold-ring shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300"
                        style={{
                          border: `1px solid ${active ? PALETTE.gold : PALETTE.border}`,
                          background: active
                            ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                            : ready
                            ? "rgba(248,250,252,0.92)"
                            : "rgba(226,232,240,0.65)",
                          color: active ? "#0f172a" : ready ? PALETTE.beige : PALETTE.muted,
                          cursor: ready ? "pointer" : "not-allowed",
                          transform: ready ? "translateY(0)" : "translateY(1px)",
                          opacity: ready ? 1 : 0.7,
                        }}
                      >
                        Solution {sol}{ready ? "" : " ..."}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {availableGWs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => canGoPrevGW && setSelectedGW(availableGWs[activeGWIndex - 1])}
                      disabled={!canGoPrevGW}
                      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        border: `1px solid ${canGoPrevGW ? PALETTE.gold : PALETTE.border}`,
                        backgroundColor: canGoPrevGW ? "rgba(118,175,160,0.14)" : "rgba(248,250,252,0.75)",
                        color: canGoPrevGW ? PALETTE.gold : PALETTE.muted,
                        cursor: canGoPrevGW ? "pointer" : "not-allowed",
                      }}
                      aria-label="Previous gameweek"
                    >
                      <ChevronLeft size={15} className="lucide-icon" />
                    </button>

                    <div
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{ border: `1px solid ${PALETTE.border}`, color: PALETTE.beige, background: "rgba(248,250,252,0.75)" }}
                    >
                      GW {activeGW ?? minGW}
                    </div>

                    <button
                      type="button"
                      onClick={() => canGoNextGW && setSelectedGW(availableGWs[activeGWIndex + 1])}
                      disabled={!canGoNextGW}
                      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        border: `1px solid ${canGoNextGW ? PALETTE.gold : PALETTE.border}`,
                        backgroundColor: canGoNextGW ? "rgba(118,175,160,0.14)" : "rgba(248,250,252,0.75)",
                        color: canGoNextGW ? PALETTE.gold : PALETTE.muted,
                        cursor: canGoNextGW ? "pointer" : "not-allowed",
                      }}
                      aria-label="Next gameweek"
                    >
                      <ChevronRight size={15} className="lucide-icon" />
                    </button>
                  </div>

                  <div className="mt-3 flex justify-start sm:justify-center gap-3 overflow-x-auto pb-2 px-1">
                    {availableGWs.map((gw) => {
                      const isActive = gw === activeGW;
                      const nodeSummary = getGwNodeSummary(gw);
                      const nodeChips = [
                        nodeSummary.hasBenchBoost ? { key: "bb", label: "BB", icon: Shield } : null,
                        nodeSummary.hasWildcard ? { key: "wc", label: "WC", icon: RefreshCw } : null,
                        nodeSummary.hasFreeHit ? { key: "fh", label: "FH", icon: Zap } : null,
                      ].filter(Boolean);
                      const transferChipLabel = nodeSummary.hasWildcard
                        ? "WC"
                        : nodeSummary.hasFreeHit
                        ? "FH"
                        : `${nodeSummary.count} moves`;
                      const nodeMeasureTotal = gwMeasureTotals[String(gw)];
                      return (
                        <div
                          key={gw}
                          onClick={() => {
                            setSelectedGW(gw);
                            if (gw !== activeGW) setChipPanelOpen(false);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              setSelectedGW(gw);
                              if (gw !== activeGW) setChipPanelOpen(false);
                            }
                          }}
                          className="gold-ring relative mt-5 shrink-0 min-w-[170px] max-w-[220px] rounded-[22px] px-3 py-3 text-left text-xs font-semibold transition hover:-translate-y-0.5"
                          style={{
                            border: `1px solid ${isActive ? PALETTE.gold : PALETTE.border}`,
                            background: isActive
                              ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                              : nodeSummary.hasManual
                              ? "linear-gradient(135deg, rgba(95,143,123,0.16), rgba(248,250,252,0.9))"
                              : "rgba(248,250,252,0.82)",
                            color: isActive ? "#0f172a" : PALETTE.beige,
                            boxShadow: isActive
                              ? "0 14px 26px rgba(95,143,123,0.28)"
                              : "0 10px 20px rgba(15,23,42,0.08)",
                          }}
                          >
                          <div
                            className="absolute right-2 top-0 z-10 -translate-y-1/2 rounded-full px-2 py-1 text-[10px] font-black tabular-nums shadow"
                            style={{
                              border: `1px solid ${isActive ? "rgba(15,23,42,0.18)" : PALETTE.border}`,
                              background: isActive ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.98)",
                              color: isActive ? "#fff" : PALETTE.gold,
                            }}
                            title={`${selectedMeasureMeta.label} GW ${gw}`}
                          >
                            {selectedMeasureMeta.short} {formatMeasureValue(nodeMeasureTotal, teamMeasure)}
                          </div>
                          {isActive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChipPanelOpen(true);
                              }}
                              className="gold-ring absolute left-1/2 top-0 z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black shadow-lg"
                              style={{
                                border: `1px solid ${PALETTE.gold}`,
                                background: "rgba(248,250,252,0.98)",
                                color: PALETTE.gold,
                              }}
                            >
                              <span className="text-sm leading-none">+</span>
                              Add chip
                            </button>
                          )}
                          {nodeChips.length > 0 && (
                            <div className="-mt-1 mb-2 flex flex-wrap gap-1">
                              {nodeChips.map((chip) => {
                                const ChipIcon = chip.icon;
                                return (
                                  <span
                                    key={chip.key}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black"
                                    style={{ background: "rgba(15,23,42,0.88)", color: "#fff" }}
                                  >
                                    <ChipIcon size={10} className="lucide-icon" />
                                    {chip.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          <span className="flex items-center justify-between gap-2">
                            <span>GW {gw}</span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px]"
                              style={{
                                background: isActive ? "rgba(15,23,42,0.12)" : "rgba(15,23,42,0.08)",
                                color: isActive ? "#0f172a" : PALETTE.gold,
                              }}
                            >
                              {transferChipLabel}
                            </span>
                          </span>
                          <div className="mt-2 space-y-1">
                            {nodeSummary.isChipTransferGw ? (
                              <div
                                className="flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[10px] font-black"
                                style={{ background: "rgba(15,23,42,0.1)" }}
                              >
                                {nodeSummary.hasWildcard ? (
                                  <>
                                    <RefreshCw size={12} className="lucide-icon" />
                                    Wildcard active
                                  </>
                                ) : (
                                  <>
                                    <Zap size={12} className="lucide-icon" />
                                    Free Hit active
                                  </>
                                )}
                              </div>
                            ) : nodeSummary.optimizerPairs.length === 0 && nodeSummary.manualPairs.length === 0 ? (
                              <span className="block truncate text-[10px] font-medium opacity-70">No moves</span>
                            ) : null}
                            {!nodeSummary.isChipTransferGw && nodeSummary.optimizerPairs.map(({ outP, inP }) => (
                              <div
                                key={transferPairKey(gw, outP, inP)}
                                className="flex items-center gap-1 rounded-full px-1.5 py-1 text-[9px]"
                                style={{ background: "rgba(15,23,42,0.08)" }}
                              >
                                <img src={getPlayerPhoto(outP)} alt="" className="h-5 w-5 rounded-full object-cover" />
                                <span className="min-w-0 flex-1 truncate">
                                  {getPlayerDisplayName(outP)}{" -> "}{getPlayerDisplayName(inP)}
                                </span>
                                <img src={getPlayerPhoto(inP)} alt="" className="h-5 w-5 rounded-full object-cover" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    hideModelTransfer(gw, outP, inP);
                                  }}
                                  className="rounded-full p-0.5"
                                  style={{ color: PALETTE.danger, background: "rgba(255,255,255,0.65)" }}
                                  aria-label="Cancel suggested transfer"
                                  title="Cancel suggested transfer"
                                >
                                  <X size={10} className="lucide-icon" />
                                </button>
                              </div>
                            ))}
                            {nodeSummary.manualPairs.map((tr) => (
                              <div
                                key={tr.id}
                                className="flex items-center gap-1 rounded-full px-1.5 py-1 text-[9px]"
                                style={{ background: "rgba(22,163,74,0.12)", color: isActive ? "#0f172a" : PALETTE.gold }}
                              >
                                <Lock size={10} className="lucide-icon shrink-0" />
                                <span className="min-w-0 flex-1 truncate">
                                  {tr.isLocked ? "Locked" : "Pending lock"}: {tr.outDisplay || tr.outName}{" -> "}{tr.inDisplay || tr.inName}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeManualTransfer(tr, gw);
                                  }}
                                  className="rounded-full p-0.5"
                                  style={{ color: PALETTE.danger, background: "rgba(255,255,255,0.65)" }}
                                  aria-label="Remove locked transfer"
                                  title="Remove locked transfer"
                                >
                                  <X size={10} className="lucide-icon" />
                                </button>
                              </div>
                            ))}
                          </div>
                          {!nodeSummary.isChipTransferGw && hiddenModelTransferKeys.some((key) => key.startsWith(`${Number(gw)}__`)) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                restoreModelTransfersForGw(gw);
                              }}
                              className="mt-2 rounded-full px-2 py-1 text-[9px] font-bold"
                              style={{ border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.62)" }}
                            >
                              Restore model moves
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {chipPanelOpen && (
                    <div
                      className="mx-auto mt-3 w-full max-w-[680px] rounded-[22px] p-3"
                      style={{
                        border: `1px solid ${PALETTE.border}`,
                        background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95))",
                        boxShadow: "0 18px 38px rgba(15,23,42,0.14)",
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 text-xs font-bold" style={{ color: PALETTE.gold }}>
                          <CalendarRange size={14} className="lucide-icon" />
                          Select chip for GW {activeGW ?? "-"}
                        </div>
                        <button
                          type="button"
                          onClick={() => setChipPanelOpen(false)}
                          className="gold-ring rounded-full p-1"
                          style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.92)", color: PALETTE.muted }}
                          aria-label="Close chip picker"
                        >
                          <X size={13} className="lucide-icon" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <ChipSelect
                          label="Bench Boost GW"
                          show={showBbInput}
                          onShow={() => {
                            setShowBbInput(true);
                            if (activeGW != null) setBbRound(activeGW);
                          }}
                          onHide={() => {
                            setShowBbInput(false);
                            setBbRound("");
                          }}
                          value={bbRound}
                          onChange={(v) => setBbRound(Number(v))}
                          minGW={minGW}
                          maxGW={maxGW}
                          addLabel="Bench Boost"
                          icon={Shield}
                        />
                        <ChipSelect
                          label="Wildcard GW"
                          show={showWildInput}
                          onShow={() => {
                            setShowWildInput(true);
                            if (activeGW != null) setWildRound(activeGW);
                          }}
                          onHide={() => {
                            setShowWildInput(false);
                            setWildRound("");
                          }}
                          value={wildRound}
                          onChange={(v) => setWildRound(Number(v))}
                          minGW={minGW}
                          maxGW={maxGW}
                          addLabel="Wildcard"
                          icon={RefreshCw}
                        />
                        <ChipSelect
                          label="Free Hit GW"
                          show={showfreehitInput}
                          onShow={() => {
                            setshowfreehitInput(true);
                            if (activeGW != null) setfreehitROund(activeGW);
                          }}
                          onHide={() => {
                            setshowfreehitInput(false);
                            setfreehitROund("");
                          }}
                          value={freehitROund}
                          onChange={(v) => setfreehitROund(Number(v))}
                          minGW={minGW}
                          maxGW={maxGW}
                          addLabel="Free Hit"
                          icon={Zap}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="hidden">
                <TopStat icon={Target} label={pitchPredictedLabel} value={pitchPredictedValue} />
                <TopStat icon={CalendarRange} label="Window" value={`GW ${minGW}-${maxGW}`} />
              </div>

              <div
                className="hidden"
                style={{
                  border: `1px solid ${PALETTE.border}`,
                  background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(248,250,252,0.9))",
                  boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: PALETTE.gold }}>
                      <PencilLine size={16} className="lucide-icon" />
                      Manual testcase planner
                    </div>
                    <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                      Drag players between pitch and bench, or add your own transfer for GW {activeGW ?? "-"}.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
                    <TopStat icon={Target} label="XI points" value={pitchPredictedValue} />
                    <TopStat icon={ArrowRight} label="FT left" value={teamLoading ? "..." : manualFtLeft} />
                    <TopStat
                      icon={Trophy}
                      label="Bank"
                      value={teamLoading ? "..." : `${manualBank >= 0 ? "" : "-"}£${Math.abs(manualBank).toFixed(1)}`}
                    />
                    <TopStat icon={Zap} label="Hits" value={manualHits ? `-${manualHits * 4}` : "0"} />
                  </div>
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-[0.8fr_1.2fr_auto]">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                      Transfer out
                    </span>
                    <select
                      value={transferOutName}
                      onChange={(e) => setTransferOutName(e.target.value)}
                      className="w-full rounded-2xl px-3 py-2 text-sm font-semibold outline-none"
                      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)", color: PALETTE.beige }}
                    >
                      <option value="">Choose player</option>
                      {transferOutOptions.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.display} - {p.position} {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                      Transfer in
                    </span>
                    <div
                      className="rounded-2xl p-2"
                      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)" }}
                    >
                      <div className="relative">
                        <Search size={13} className="lucide-icon absolute left-3 top-1/2 -translate-y-1/2" style={{ color: PALETTE.muted }} />
                        <input
                          value={transferSearch}
                          onChange={(e) => setTransferSearch(e.target.value)}
                          disabled={!selectedTransferOut}
                          placeholder={selectedTransferOut ? "Search replacement" : "Pick transfer out first"}
                          className="w-full rounded-xl py-2 pl-8 pr-3 text-xs font-semibold outline-none"
                          style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(255,255,255,0.9)", color: PALETTE.beige }}
                        />
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                        {!selectedTransferOut && (
                          <div className="rounded-xl px-3 py-2 text-xs" style={{ color: PALETTE.muted }}>
                            Choose a player out first.
                          </div>
                        )}
                        {selectedTransferOut && searchedTransferCandidates.length === 0 && (
                          <div className="rounded-xl px-3 py-2 text-xs" style={{ color: PALETTE.muted }}>
                            No matching replacements.
                          </div>
                        )}
                        {searchedTransferCandidates.map((p) => {
                          const active = transferInKey === p.key;
                          return (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => setTransferInKey(p.key)}
                              className="gold-ring flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition"
                              style={{
                                border: `1px solid ${active ? PALETTE.gold : "transparent"}`,
                                background: active ? "rgba(95,143,123,0.14)" : "rgba(255,255,255,0.62)",
                                color: PALETTE.beige,
                              }}
                            >
                              <img src={getPlayerPhoto(p.row)} alt="" className="h-8 w-8 rounded-full object-cover" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-bold">{p.display}</span>
                                <span className="block truncate text-[10px]" style={{ color: PALETTE.muted }}>
                                  {p.team || "Team"} - {p.position}
                                </span>
                              </span>
                              <span className="text-right text-[10px] font-bold tabular-nums" style={{ color: PALETTE.gold }}>
                                {Number.isFinite(p.points) ? `${p.points.toFixed(1)} pts` : "-"}
                                <br />
                                {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <label className="hidden">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                      Transfer in
                    </span>
                    <select
                      value={transferInKey}
                      onChange={(e) => setTransferInKey(e.target.value)}
                      className="w-full rounded-2xl px-3 py-2 text-sm font-semibold outline-none"
                      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)", color: PALETTE.beige }}
                      disabled={!selectedTransferOut}
                    >
                      <option value="">
                        {selectedTransferOut ? "Choose replacement" : "Pick transfer out first"}
                      </option>
                      {eligibleTransferCandidates.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.display} - {p.position} {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""} {Number.isFinite(p.points) ? `(${p.points.toFixed(1)} pts)` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={addManualTransfer}
                    disabled={optimizationProgress?.streaming || !selectedTransferOut || !transferInKey}
                    className="gold-ring rounded-2xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 lg:self-end"
                    style={{
                      border: `1px solid ${selectedTransferOut && transferInKey ? PALETTE.gold : PALETTE.border}`,
                      background: selectedTransferOut && transferInKey
                        ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                        : "rgba(226,232,240,0.7)",
                      color: selectedTransferOut && transferInKey ? "#0f172a" : PALETTE.muted,
                    }}
                  >
                    Add transfer
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                    Local only: optimizer results stay unchanged, and edits can be cleared per GW.
                  </div>
                  <button
                    type="button"
                    onClick={() => updateManualPlanForGw(activeGW, { transfers: [], statusOverrides: {} })}
                    className="gold-ring rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.92)", color: PALETTE.gold }}
                  >
                    Clear GW edits
                  </button>
                </div>

                {manualTransfers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {manualTransfers.map((tr) => (
                      <div
                        key={tr.id}
                        className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.94)", color: PALETTE.beige }}
                      >
                        <span className="truncate">
                          {tr.outDisplay || tr.outName}{" -> "}{tr.inDisplay || tr.inName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeManualTransfer(tr)}
                          className="rounded-full p-1"
                          style={{ color: PALETTE.danger }}
                          aria-label="Remove manual transfer"
                        >
                          <X size={12} className="lucide-icon" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

      <div
  className="mt-4 w-full max-w-none mx-auto bg-no-repeat bg-[length:100%_100%] bg-center rounded-[24px] px-1 sm:px-2 py-1 relative overflow-hidden min-h-[760px] sm:min-h-[900px] lg:min-h-[calc(100vh-7rem)]"
  style={{
    order: 2,
    backgroundImage: `url(${pitch})`,
    border: `1px solid ${PALETTE.border}`,
    boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
  }}
>
  <div className="absolute inset-0 bg-gradient-to-b from-slate-100/40 via-transparent to-slate-200/50 pointer-events-none" />
  <div className="absolute left-3 top-3 z-20 rounded-2xl px-3 py-2 shadow-lg backdrop-blur"
    style={{ border: `1px solid ${PALETTE.gold}`, background: "rgba(15,23,42,0.88)", color: "#fff" }}
  >
    <div className="text-[9px] uppercase tracking-wide opacity-70">Transfers</div>
    <div className="text-sm font-black tabular-nums">{activeTransferUsageLabel}</div>
  </div>
  <div className="absolute right-3 top-3 z-20 rounded-2xl px-3 py-2 text-right shadow-lg backdrop-blur"
    style={{ border: `1px solid ${PALETTE.gold}`, background: "rgba(15,23,42,0.88)", color: "#fff" }}
  >
    <div className="text-[9px] uppercase tracking-wide opacity-70">Bank</div>
    <div className="text-sm font-black tabular-nums">{teamLoading ? "..." : activeBankLabel}</div>
  </div>

  <div className="relative h-full min-h-[740px] sm:min-h-[880px] lg:min-h-[940px] w-full px-1 sm:px-2 pt-2 pb-2">
    <div
      className="grid h-full"
      style={{
        gridTemplateRows: bench.length > 0 ? "1fr auto" : "1fr",
        rowGap: "clamp(10px, 2vh, 20px)",
      }}
    >
      <div
        className="grid content-between"
        style={{
          gridTemplateRows: "repeat(4, minmax(0, 1fr))",
          rowGap: "clamp(18px, 3vh, 34px)",
        }}
      >
        <div className="flex items-center justify-center min-h-[112px] sm:min-h-[132px]">
          <PlayerRow
            players={starters.filter((p) => p.position === "GKP")}
            toggleBan={toggleBan}
            bannedList={bannedList}
            navigate={navigate}
            getOpponentMeta={getOpponentMeta}
            activeGW={activeGW}
            getProjectionRowForPlayer={getProjectionRowForPlayer}
            teamMeasure={teamMeasure}
            selectedMeasureMeta={selectedMeasureMeta}
            draggedPlayerName={draggedPlayerName}
            switchableTargetNames={switchableTargetNames}
            onDropOnPlayer={handlePlayerDropOnPlayer}
            onDragStateChange={setDraggedPlayerName}
          />
        </div>
        <div className="flex items-center justify-center min-h-[112px] sm:min-h-[132px]">
          <PlayerRow
            players={starters.filter((p) => p.position === "DEF")}
            toggleBan={toggleBan}
            bannedList={bannedList}
            navigate={navigate}
            getOpponentMeta={getOpponentMeta}
            activeGW={activeGW}
            getProjectionRowForPlayer={getProjectionRowForPlayer}
            teamMeasure={teamMeasure}
            selectedMeasureMeta={selectedMeasureMeta}
            draggedPlayerName={draggedPlayerName}
            switchableTargetNames={switchableTargetNames}
            onDropOnPlayer={handlePlayerDropOnPlayer}
            onDragStateChange={setDraggedPlayerName}
          />
        </div>
        <div className="flex items-center justify-center min-h-[112px] sm:min-h-[132px]">
          <PlayerRow
            players={starters.filter((p) => p.position === "MID")}
            toggleBan={toggleBan}
            bannedList={bannedList}
            navigate={navigate}
            getOpponentMeta={getOpponentMeta}
            activeGW={activeGW}
            getProjectionRowForPlayer={getProjectionRowForPlayer}
            teamMeasure={teamMeasure}
            selectedMeasureMeta={selectedMeasureMeta}
            draggedPlayerName={draggedPlayerName}
            switchableTargetNames={switchableTargetNames}
            onDropOnPlayer={handlePlayerDropOnPlayer}
            onDragStateChange={setDraggedPlayerName}
          />
        </div>
        <div className="flex items-center justify-center min-h-[112px] sm:min-h-[132px]">
          <PlayerRow
            players={starters.filter((p) => p.position === "FWD")}
            toggleBan={toggleBan}
            bannedList={bannedList}
            navigate={navigate}
            getOpponentMeta={getOpponentMeta}
            activeGW={activeGW}
            getProjectionRowForPlayer={getProjectionRowForPlayer}
            teamMeasure={teamMeasure}
            selectedMeasureMeta={selectedMeasureMeta}
            draggedPlayerName={draggedPlayerName}
            switchableTargetNames={switchableTargetNames}
            onDropOnPlayer={handlePlayerDropOnPlayer}
            onDragStateChange={setDraggedPlayerName}
          />
        </div>
      </div>

      {bench.length > 0 && (
        <div className="border-t border-slate-300/20 pt-20 pb-1 min-h-[100px] sm:min-h-[146px] bg-white/1 rounded-xl mt-20">
          <PlayerRow
            players={bench}
            isBench
            toggleBan={toggleBan}
            bannedList={bannedList}
            navigate={navigate}
            getOpponentMeta={getOpponentMeta}
            activeGW={activeGW}
            getProjectionRowForPlayer={getProjectionRowForPlayer}
            teamMeasure={teamMeasure}
            selectedMeasureMeta={selectedMeasureMeta}
            draggedPlayerName={draggedPlayerName}
            switchableTargetNames={switchableTargetNames}
            onDropOnPlayer={handlePlayerDropOnPlayer}
            onDragStateChange={setDraggedPlayerName}
          />
        </div>
      )}
    </div>
  </div>
</div>
              <div
                className="mt-4 rounded-[26px] p-3 sm:p-4"
                style={{
                  order: 1,
                  border: `1px solid ${PALETTE.border}`,
                  background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(248,250,252,0.9))",
                  boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: PALETTE.gold }}>
                      <PencilLine size={16} className="lucide-icon" />
                      Transfers GW {activeGW ?? "-"}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                      Used / available FT this round: <strong>{activeTransferUsageLabel}</strong>
                    </div>
                  </div>
                  <div className="rounded-2xl px-3 py-2 text-xs font-bold tabular-nums"
                    style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(15,23,42,0.9)", color: "#fff" }}
                  >
                    Bank {teamLoading ? "..." : activeBankLabel}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-[0.8fr_1.2fr_auto]">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                      Transfer out
                    </span>
                    <div className="rounded-2xl p-2" style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)" }}>
                      <button
                        type="button"
                        onClick={() => setTransferOutPickerOpen((v) => !v)}
                        className="gold-ring flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold"
                        style={{
                          border: `1px solid ${PALETTE.border}`,
                          background: "rgba(255,255,255,0.9)",
                          color: PALETTE.beige,
                        }}
                      >
                        <span className="truncate">
                          {selectedTransferOut ? selectedTransferOut.display : "Choose player"}
                        </span>
                        <ChevronDown size={14} className={`lucide-icon transition ${transferOutPickerOpen ? "rotate-180" : ""}`} />
                      </button>

                      {transferOutPickerOpen && (
                        <div className="mt-2">
                          <div className="relative">
                            <Search size={13} className="lucide-icon absolute left-3 top-1/2 -translate-y-1/2" style={{ color: PALETTE.muted }} />
                            <input
                              value={transferOutSearch}
                              onChange={(e) => setTransferOutSearch(e.target.value)}
                              placeholder="Search your squad"
                              className="w-full rounded-xl py-2 pl-8 pr-3 text-xs font-semibold outline-none"
                              style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(255,255,255,0.9)", color: PALETTE.beige }}
                            />
                          </div>
                          <div className="mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                            {searchedTransferOutOptions.length === 0 && (
                              <div className="rounded-xl px-3 py-2 text-xs" style={{ color: PALETTE.muted }}>
                                No matching squad players.
                              </div>
                            )}
                            {searchedTransferOutOptions.map((p) => {
                              const active = transferOutName === p.name;
                              return (
                                <button
                                  key={p.name}
                                  type="button"
                                  onClick={() => {
                                    setTransferOutName(p.name);
                                    setTransferInKey("");
                                    setTransferOutPickerOpen(false);
                                    setTransferPickerOpen(false);
                                  }}
                                  className="gold-ring flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition"
                                  style={{
                                    border: `1px solid ${active ? PALETTE.gold : "transparent"}`,
                                    background: active ? "rgba(95,143,123,0.14)" : "rgba(255,255,255,0.62)",
                                    color: PALETTE.beige,
                                  }}
                                >
                                  <img src={getPlayerPhoto(p.row)} alt="" className="h-8 w-8 rounded-full object-cover" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold">{p.display}</span>
                                    <span className="block truncate text-[10px]" style={{ color: PALETTE.muted }}>
                                      {p.team || "Team"} - {p.position}
                                    </span>
                                  </span>
                                  <span className="text-right text-[10px] font-bold tabular-nums" style={{ color: PALETTE.gold }}>
                                    {formatMeasureValue(p.measure, teamMeasure)} {selectedMeasureMeta.short}
                                    <br />
                                    {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <select
                      value={transferOutName}
                      onChange={(e) => {
                        setTransferOutName(e.target.value);
                        setTransferPickerOpen(false);
                      }}
                      className="hidden w-full rounded-2xl px-3 py-2 text-sm font-semibold outline-none"
                      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)", color: PALETTE.beige }}
                    >
                      <option value="">Choose player</option>
                      {transferOutOptions.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.display} - {p.position} {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                      Transfer in
                    </span>
                    <div className="rounded-2xl p-2" style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.96)" }}>
                      <button
                        type="button"
                        onClick={() => selectedTransferOut && setTransferPickerOpen((v) => !v)}
                        disabled={!selectedTransferOut}
                        className="gold-ring flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold"
                        style={{
                          border: `1px solid ${PALETTE.border}`,
                          background: selectedTransferOut ? "rgba(255,255,255,0.9)" : "rgba(226,232,240,0.65)",
                          color: selectedTransferOut ? PALETTE.beige : PALETTE.muted,
                        }}
                      >
                        <span className="truncate">
                          {transferInKey
                            ? selectedTransferInCandidate?.display || "Replacement selected"
                            : selectedTransferOut
                            ? "Choose replacement"
                            : "Pick transfer out first"}
                        </span>
                        <ChevronDown size={14} className={`lucide-icon transition ${transferPickerOpen ? "rotate-180" : ""}`} />
                      </button>

                      {transferPickerOpen && (
                        <div className="mt-2">
                          <div className="relative">
                            <Search size={13} className="lucide-icon absolute left-3 top-1/2 -translate-y-1/2" style={{ color: PALETTE.muted }} />
                            <input
                              value={transferSearch}
                              onChange={(e) => setTransferSearch(e.target.value)}
                              placeholder="Search replacement"
                              className="w-full rounded-xl py-2 pl-8 pr-3 text-xs font-semibold outline-none"
                              style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(255,255,255,0.9)", color: PALETTE.beige }}
                            />
                          </div>
                          <div className="mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                            {searchedTransferCandidates.length === 0 && (
                              <div className="rounded-xl px-3 py-2 text-xs" style={{ color: PALETTE.muted }}>
                                No matching replacements.
                              </div>
                            )}
                            {searchedTransferCandidates.map((p) => {
                              const active = transferInKey === p.key;
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => {
                                    setTransferInKey(p.key);
                                    setTransferPickerOpen(false);
                                  }}
                                  className="gold-ring flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition"
                                  style={{
                                    border: `1px solid ${active ? PALETTE.gold : "transparent"}`,
                                    background: active ? "rgba(95,143,123,0.14)" : "rgba(255,255,255,0.62)",
                                    color: PALETTE.beige,
                                  }}
                                >
                                  <img src={getPlayerPhoto(p.row)} alt="" className="h-8 w-8 rounded-full object-cover" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold">{p.display}</span>
                                    <span className="block truncate text-[10px]" style={{ color: PALETTE.muted }}>
                                      {p.team || "Team"} - {p.position}
                                    </span>
                                  </span>
                                  <span className="text-right text-[10px] font-bold tabular-nums" style={{ color: PALETTE.gold }}>
                                    {formatMeasureValue(p.measure, teamMeasure)} {selectedMeasureMeta.short}
                                    <br />
                                    {Number.isFinite(p.price) ? `£${p.price.toFixed(1)}` : ""}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addManualTransfer}
                    disabled={optimizationProgress?.streaming || !selectedTransferOut || !transferInKey}
                    className="gold-ring rounded-2xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 lg:self-end"
                    style={{
                      border: `1px solid ${selectedTransferOut && transferInKey ? PALETTE.gold : PALETTE.border}`,
                      background: selectedTransferOut && transferInKey
                        ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                        : "rgba(226,232,240,0.7)",
                      color: selectedTransferOut && transferInKey ? "#0f172a" : PALETTE.muted,
                    }}
                  >
                    Add transfer
                  </button>
                </div>

                {manualTransfers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {manualTransfers.map((tr) => (
                      <div
                        key={tr.id}
                        className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.94)", color: PALETTE.beige }}
                      >
                        <span className="truncate">
                          {tr.outDisplay || tr.outName}{" -> "}{tr.inDisplay || tr.inName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeManualTransfer(tr)}
                          className="rounded-full p-1"
                          style={{ color: PALETTE.danger }}
                          aria-label="Remove manual transfer"
                        >
                          <X size={12} className="lucide-icon" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden">
              <div className="flex items-end justify-between mb-4 gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold inline-flex items-center gap-2">
                    <ArrowRight size={20} className="lucide-icon" style={{ color: PALETTE.gold }} />
                    Transfer plan
                  </h2>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Recommended moves across your optimization window.
                  </div>
                </div>
                <div className="text-[11px] px-3 py-1 rounded-full" style={{ color: PALETTE.gold, border: `1px solid rgba(95,143,123,0.35)`, background: "rgba(95,143,123,0.08)" }}>
                  GW {minGW}–{maxGW}
                </div>
              </div>

              {transfersWithFH.length > 0 ? (
                <div className="space-y-4">
                  {transfersWithFH.map((grp) => {
                    const remainingIns = [...(grp.in || [])];
                    const pairs = (grp.out || []).map((outP) => {
                      const i = remainingIns.findIndex((inP) => inP.position === outP.position);
                      return i !== -1 ? { outP, inP: remainingIns.splice(i, 1)[0] } : { outP, inP: null };
                    });
                    remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

                    const realPairs = pairs.filter((x) => x.outP && x.inP);
                    if (realPairs.length === 0 && !grp.freehit) return null;

                    return (
                      <div
                        key={grp.GW}
                        className="rounded-[24px] overflow-hidden"
                        style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.82)", boxShadow: "0 14px 30px rgba(15,23,42,0.1)" }}
                      >
                        <div
                          className="px-4 py-3 flex items-center justify-between"
                          style={{ borderBottom: `1px solid ${PALETTE.border}`, background: "linear-gradient(135deg, rgba(95,143,123,0.14), rgba(248,250,252,0.84))" }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold"
                              style={{ backgroundColor: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.gold}`, color: PALETTE.gold }}
                            >
                              {grp.GW}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">Gameweek {grp.GW}</div>
                              <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                                {realPairs.length} transfer{realPairs.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </div>

                          {grp.freehit && (
                            <span className="text-[11px] px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1.5"
                              style={{ border: `1px solid ${PALETTE.gold}`, color: PALETTE.gold, backgroundColor: "rgba(248,250,252,0.86)" }}
                            >
                              <Zap size={12} className="lucide-icon" />
                              Free Hit
                            </span>
                          )}
                        </div>

                        <div className="divide-y" style={{ borderColor: PALETTE.border }}>
                          {realPairs.map(({ outP, inP }, idx) => (
                            <TransferRow
                              key={`${grp.GW}_${idx}`}
                              outP={outP}
                              inP={inP}
                              PALETTE={PALETTE}
                              navigate={navigate}
                              toggleBan={toggleBan}
                              bannedList={bannedList}
                              transferGW={grp.GW}
                              buildTransferProjectionData={buildTransferProjectionData}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[24px] p-8 text-center" style={{ border: `1px dashed ${PALETTE.border}`, background: "rgba(248,250,252,0.72)" }}>
                  <ArrowRight size={26} className="lucide-icon mx-auto mb-2" style={{ color: PALETTE.gold }} />
                  <div className="text-sm font-semibold">No transfer plan yet</div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Run the optimizer to generate a recommended transfer timeline.
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {pitchSourceData.length === 0 && (
          <section className="glass-card rounded-[28px] p-8 text-center">
            <Sparkles size={28} className="lucide-icon mx-auto mb-3" style={{ color: PALETTE.gold }} />
            <div className="text-lg font-semibold">Ready to optimize</div>
            <div className="text-sm mt-2 max-w-xl mx-auto" style={{ color: PALETTE.muted }}>
              Enter your Team ID and press Load to inspect the unchanged squad, then run the optimizer when ready.
            </div>
          </section>
        )}

        <div className="sticky bottom-24 sm:bottom-28 z-[120] mt-6 flex justify-end">
          <button
            onClick={handleOptimizeClick}
            disabled={!canOptimize}
            className="green-ring inline-flex items-center justify-center gap-2 font-semibold px-4 py-3 rounded-2xl transition-all"
            style={{
              border: `1px solid ${canOptimize ? PALETTE.gold : PALETTE.border}`,
              background: canOptimize
                ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                : "rgba(248,250,252,0.95)",
              color: canOptimize ? "#0f172a" : PALETTE.muted,
              cursor: canOptimize ? "pointer" : "not-allowed",
              boxShadow: canOptimize ? "0 12px 24px rgba(15,23,42,0.18)" : "none",
            }}
          >
            <Wand2 size={17} className="lucide-icon" />
            Optimize now
          </button>
        </div>
      </div>
    </div>
  );
}

function TopStat({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.82)" }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        <Icon size={14} className="lucide-icon" />
        {label}
      </div>
      <div className="text-lg font-bold mt-1" style={{ color: PALETTE.gold }}>{value}</div>
    </div>
  );
}

function FieldShell({ label, icon: Icon, className = "", children }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 w-full ${className}`}>
      <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
        <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
        {label}
      </label>
      {children}
    </div>
  );
}

function ModelButton({ active, disabled, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gold-ring min-w-0 w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs sm:text-sm border transition text-center leading-tight whitespace-normal"
      style={{
        border: disabled ? `1px solid ${PALETTE.border}` : active ? `1px solid ${PALETTE.gold}` : `1px solid ${PALETTE.border}`,
        background: disabled ? "rgba(248,250,252,0.84)" : active ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.92)",
        color: disabled ? "#6b7280" : active ? "#0f172a" : PALETTE.beige,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon size={15} className="lucide-icon" />
      {children}
    </button>
  );
}

function ChipSelect({ label, show, onShow, onHide, value, onChange, minGW, maxGW, addLabel, icon: Icon }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
        <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
        {label}
      </label>

      {show ? (
        <div className="relative">
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            style={{
              colorScheme: "dark",
              border: `1px solid ${PALETTE.border}`,
              backgroundColor: "rgba(248,250,252,0.94)",
              color: PALETTE.beige,
            }}
            className="gold-ring w-full h-12 pl-3 pr-10 rounded-2xl text-sm outline-none"
            aria-label={label}
          >
            <option value="" disabled>{label}</option>
            {Array.from({ length: maxGW - minGW + 1 }, (_, i) => minGW + i).map((gw) => (
              <option key={gw} value={gw}>GW {gw}</option>
            ))}
          </select>

          <button
            onClick={onHide}
            className="gold-ring absolute inset-y-0 right-0 px-3 flex items-center rounded-r-2xl border-l border-slate-300 bg-slate-200/85 hover:bg-slate-300/85 transition-colors"
            style={{ color: PALETTE.danger }}
            aria-label={`Clear ${label}`}
            type="button"
          >
            <X size={16} className="lucide-icon" />
          </button>
        </div>
      ) : (
        <button
          onClick={onShow}
          type="button"
          className="gold-ring min-w-0 h-auto min-h-[48px] w-full inline-flex items-center justify-center gap-2 rounded-2xl text-sm text-center leading-tight whitespace-normal px-3 py-2"
          style={{ border: `1px dashed ${PALETTE.gold}`, backgroundColor: "rgba(248,250,252,0.95)", color: PALETTE.gold }}
        >
          <Icon size={15} className="lucide-icon" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

function PreferenceSlider({ title, icon: Icon, value, setValue, min, max, step, clamp, presets, description, fillPercent }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl p-3 min-w-0 w-full overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${PALETTE.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
          <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
          {title}
        </label>

      </div>

      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {presets.map((preset) => (
          <MiniPill key={preset.label} active={Number(value) === preset.value} onClick={() => setValue(preset.value)}>
            {preset.label}
          </MiniPill>
        ))}
      </div>

      <div className="h-12 rounded-xl px-3 flex items-center" style={{ backgroundColor: "rgba(248,250,252,0.95)", border: `1px solid ${PALETTE.border}` }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(Number(value))}
          onChange={(e) => setValue(clamp(Number(e.target.value)))}
          aria-label={title}
          className="opt-range w-full appearance-none bg-transparent cursor-pointer"
          style={{
            WebkitAppearance: "none",
            height: 6,
            background: `linear-gradient(to right, ${PALETTE.gold} 0%, ${PALETTE.gold} ${fillPercent}%, #cbd5e1 ${fillPercent}%, #cbd5e1 100%)`,
            borderRadius: 999,
          }}
        />
      </div>

      <p className="text-[11px]" style={{ color: PALETTE.muted }}>{description}</p>
    </div>
  );
}

function IconButton({ ariaLabel, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full text-sm leading-none"
      style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.95)", color: PALETTE.gold }}
    >
      {label}
    </button>
  );
}

function MiniPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gold-ring max-w-full px-3 py-2 text-[11px] font-semibold transition rounded-full whitespace-normal break-words text-center leading-tight"
      style={{
        border: `1px solid ${PALETTE.gold}`,
        background: active ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.88)",
        color: active ? "#0f172a" : PALETTE.gold,
      }}
    >
      {children}
    </button>
  );
}

function PlayerRow({
  players,
  isBench = false,
  toggleBan,
  bannedList,
  navigate,
  getOpponentMeta,
  activeGW,
  getProjectionRowForPlayer,
  teamMeasure = "points",
  selectedMeasureMeta = MEASURE_OPTIONS[0],
  draggedPlayerName,
  switchableTargetNames,
  onDropOnPlayer,
  onDragStateChange,
  onTogglePlayerStatus,
}) {
  const positionOrder = ["GKP", "DEF", "MID", "FWD"];
  const sortedPlayers = isBench
    ? [...players].sort((a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position))
    : players;
  const dynamicGap = isBench
    ? "clamp(2px, 1vw, 16px)"
    : sortedPlayers.length >= 5
    ? "clamp(2px, 1.2vw, 18px)"
    : "clamp(4px, 1.6vw, 24px)";

  return (
    <div className="w-full min-w-0 px-0.5">
      <div
        className="grid items-start justify-items-center"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, sortedPlayers.length)}, minmax(0, 1fr))`,
          columnGap: dynamicGap,
        }}
      >
        {sortedPlayers.map((p) => {
          const playerName = getPlayerCanonicalName(p);
          const looseName = normalizeLoosePlayerKey(playerName);
          const isDraggingThis = normalizeLoosePlayerKey(draggedPlayerName) === looseName;
          const isDraggingAny = Boolean(draggedPlayerName);
          const canReceiveDrop = Boolean(switchableTargetNames?.has(looseName));
          const oppMeta =
            typeof getOpponentMeta === "function"
              ? getOpponentMeta(p)
              : { display: "N/A", full: "N/A", tone: opponentStrengthTone(null) };
          const projectionRow =
            typeof getProjectionRowForPlayer === "function" && Number.isFinite(Number(activeGW))
              ? getProjectionRowForPlayer(p, Number(activeGW))
              : null;
          const selectedMeasureValue = getRowMeasureValue(projectionRow || p, teamMeasure);
          const hasSelectedMeasureValue = Number.isFinite(selectedMeasureValue);
          const selectedPercent = getRowSelectedPercent(projectionRow || p);
          const hasSelectedPercent = Number.isFinite(selectedPercent);
          const cardWidthClass = isBench
            ? "w-[60px] sm:w-[72px] lg:w-[96px] xl:w-[112px]"
            : "w-[64px] sm:w-[78px] lg:w-[110px] xl:w-[128px]";

          return (
            <div
              key={p.Name}
              className={`group relative min-w-0 w-full flex flex-col items-center rounded-2xl transition-all duration-150 ${
                isBench
                  ? "max-w-[62px] sm:max-w-[74px] lg:max-w-[100px] xl:max-w-[116px]"
                  : "max-w-[68px] sm:max-w-[82px] lg:max-w-[114px] xl:max-w-[132px]"
              }`}
              draggable={Boolean(onDropOnPlayer)}
              onDragStart={(e) => {
                if (!playerName) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", playerName);
                onDragStateChange?.(playerName);
              }}
              onDragEnd={() => onDragStateChange?.("")}
              onDragOver={(e) => {
                if (!canReceiveDrop) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                if (!canReceiveDrop) return;
                e.preventDefault();
                e.stopPropagation();
                const sourceName = e.dataTransfer.getData("text/plain");
                onDropOnPlayer?.(sourceName, playerName);
              }}
              style={{
                outline: canReceiveDrop ? `2px solid ${PALETTE.success}` : "2px solid transparent",
                outlineOffset: "3px",
                background: canReceiveDrop ? "rgba(22,163,74,0.12)" : "transparent",
                opacity: isDraggingAny && !canReceiveDrop && !isDraggingThis ? 0.45 : 1,
                transform: canReceiveDrop ? "translateY(-2px) scale(1.03)" : "none",
              }}
            >
              {p.Is_captain && (
                <div className="absolute top-[12px] left-[2px] bg-emerald-700 text-white font-bold text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center shadow z-10">
                  C
                </div>
              )}

              <div className="relative">
                <div
                  className="pointer-events-none absolute -left-2 top-2 z-20 rounded-full p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  style={{
                    background: "rgba(15,23,42,0.88)",
                    color: "#fff",
                    border: `1px solid ${PALETTE.gold}`,
                  }}
                  title="Drag to switch"
                >
                  <GripVertical size={10} className="lucide-icon" />
                </div>

                <img
                  src={p.photo}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_PLAYER_PHOTO;
                  }}
                  className={`object-contain drop-shadow cursor-pointer transition-transform hover:scale-[1.07] ${
                    isBench
                      ? "w-[46px] h-[48px] sm:w-[56px] sm:h-[58px] lg:w-[76px] lg:h-[80px] xl:w-[88px] xl:h-[92px]"
                      : "w-[50px] h-[58px] sm:w-[64px] sm:h-[70px] lg:w-[88px] lg:h-[96px] xl:w-[104px] xl:h-[112px]"
                  }`}
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 0 100%)" }}
                  onClick={() =>
                    navigate("/Player_Analytics/Individual", {
                      state: { selectedPlayer: p.Name },
                    })
                  }
                  alt={p.web_name}
                  role="button"
                />

                {hasSelectedMeasureValue && (
                  <div
                    className={`absolute rounded-full px-1.5 py-[2px] font-bold shadow-sm backdrop-blur ${
                      isBench
                        ? "bottom-[-3px] text-[8px] lg:text-[10px] xl:text-[11px]"
                        : "bottom-[-4px] text-[9px] lg:text-[11px] xl:text-xs"
                    }`}
                    style={{
                      left: "58%",
                      transform: "translateX(-50%)",
                      background: "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.82))",
                      border: `1px solid ${PALETTE.gold}`,
                      color: "#fef3c7",
                    }}
                    title={`${selectedMeasureMeta.label} GW ${activeGW}`}
                  >
                    {formatMeasureValue(selectedMeasureValue, teamMeasure)}
                  </div>
                )}

                <button
                  onClick={() => toggleBan(p.Name)}
                  className="gold-ring absolute top-0 right-0 bg-white p-[3px] rounded-full border border-slate-200 hover:bg-slate-50"
                  aria-label={`Toggle unwanted for ${p.web_name}`}
                >
                  <X
                    size={8}
                    className="lucide-icon"
                    style={{ color: bannedList.includes(p.Name) ? "#fb7185" : PALETTE.gold }}
                  />
                </button>
              </div>

              <div
                className={`mt-1 truncate rounded-full bg-gray-100/90 text-slate-800 mx-auto text-center ${
                  isBench
                    ? `${cardWidthClass} text-[9px] sm:text-[10px] lg:text-xs xl:text-sm px-1 py-[3px] lg:py-1`
                    : `${cardWidthClass} text-[9px] sm:text-[11px] lg:text-sm xl:text-[15px] px-1.5 py-[3px] lg:py-1`
                }`}
              >
                {p.web_name}
              </div>

              <div
                className={`mt-0.5 mx-auto flex items-center justify-between gap-1 rounded-full border px-1 py-[1px] font-semibold ${cardWidthClass} ${
                  isBench
                    ? "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-[11px]"
                    : "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-xs"
                }`}
                style={{
                  background: oppMeta.tone.badgeBg,
                  borderColor: oppMeta.tone.badgeBorder,
                  color: oppMeta.tone.badgeText,
                }}
                title={`${oppMeta.full}${hasSelectedPercent ? ` | Selected ${selectedPercent.toFixed(1)}%` : ""}`}
              >
                <span className="min-w-0 flex-1 truncate text-center">{oppMeta.display}</span>
                {hasSelectedPercent && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-[1px] tabular-nums"
                    style={{ background: "rgba(15,23,42,0.94)", color: "#ffffff" }}
                  >
                    {`${selectedPercent.toFixed(selectedPercent >= 10 ? 0 : 1)}%`}
                  </span>
                )}
              </div>

              {typeof onTogglePlayerStatus === "function" && (
                <button
                  type="button"
                  onClick={() => onTogglePlayerStatus(playerName, isBench ? "playing" : "benched")}
                  className={`mt-1 rounded-full border px-2 py-[2px] font-bold shadow-sm ${
                    isBench
                      ? "text-[7px] sm:text-[8px] lg:text-[10px]"
                      : "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-[11px]"
                  }`}
                  style={{
                    borderColor: "rgba(95,143,123,0.35)",
                    background: "rgba(248,250,252,0.92)",
                    color: PALETTE.gold,
                  }}
                >
                  {isBench ? "Start" : "Bench"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PosPill({ pos }) {
  const map = { GKP: { label: "GK" }, DEF: { label: "DEF" }, MID: { label: "MID" }, FWD: { label: "FWD" } };
  const t = map[pos] || { label: pos || "-" };

  return (
    <span
      className="text-[10px] font-bold px-2 py-1 rounded-full"
      style={{ border: `1px solid rgba(148,163,184,0.35)`, backgroundColor: "rgba(248,250,252,0.9)", color: PALETTE.gold, letterSpacing: "0.08em" }}
    >
      {t.label}
    </span>
  );
}

function PlayerChip({ p, side, navigate, toggleBan, bannedList }) {
  const isIn = side === "in";
  const isBanned = bannedList?.includes(p?.Name);

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative">
        <img
          src={p.photo}
          alt={p.web_name}
          className="w-11 h-11 rounded-xl object-cover cursor-pointer"
          style={{ border: "1px solid rgba(148,163,184,0.35)" }}
          onClick={() => navigate("/Player_Analytics/Individual", { state: { selectedPlayer: p.Name } })}
          role="button"
        />
        {isIn && (
          <button
            type="button"
            onClick={() => toggleBan(p.Name)}
            className="gold-ring absolute -top-2 -right-2 rounded-full p-1"
            style={{ backgroundColor: "rgba(248,250,252,0.92)", border: "1px solid rgba(148,163,184,0.35)" }}
            aria-label={`Toggle unwanted for ${p.web_name}`}
            title="Toggle unwanted"
          >
            <X size={12} className="lucide-icon" style={{ color: isBanned ? "#fb7185" : PALETTE.gold }} />
          </button>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{p.web_name}</div>
        <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>
          {p.Team ? String(p.Team) : ""}
        </div>
      </div>
    </div>
  );
}

function TransferRow({
  outP,
  inP,
  navigate,
  toggleBan,
  bannedList,
  transferGW,
  buildTransferProjectionData,
}) {
  const [expanded, setExpanded] = useState(false);
  const chartData = useMemo(
    () => (typeof buildTransferProjectionData === "function" ? buildTransferProjectionData(outP, inP, transferGW) : []),
    [buildTransferProjectionData, outP, inP, transferGW]
  );
  const hasChartData = chartData.some(
    (row) => Number.isFinite(row.inPoints) || Number.isFinite(row.outPoints)
  );
  const totalIn = chartData.reduce(
    (sum, row) => sum + (Number.isFinite(row.inPoints) ? row.inPoints : 0),
    0
  );
  const totalOut = chartData.reduce(
    (sum, row) => sum + (Number.isFinite(row.outPoints) ? row.outPoints : 0),
    0
  );
  const swing = totalIn - totalOut;

  return (
    <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="grid grid-cols-12 items-center gap-3">
        <div className="col-span-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Out</div>
            <PosPill pos={outP.position} />
          </div>
          <div className="mt-1">
            <PlayerChip p={outP} side="out" navigate={navigate} toggleBan={toggleBan} bannedList={bannedList} />
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(248,250,252,0.8)", border: `1px solid rgba(95,143,123,0.35)`, color: PALETTE.gold }}
          >
            <ArrowRight size={18} className="lucide-icon" />
          </div>
        </div>

        <div className="col-span-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>In</div>
            <PosPill pos={inP.position} />
          </div>
          <div className="mt-1">
            <PlayerChip p={inP} side="in" navigate={navigate} toggleBan={toggleBan} bannedList={bannedList} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[11px]" style={{ color: PALETTE.muted }}>
          From GW {transferGW}
          {hasChartData ? (
            <span style={{ color: swing >= 0 ? PALETTE.success : PALETTE.danger }}>
              {` · swing ${swing >= 0 ? "+" : ""}${swing.toFixed(2)} pts`}
            </span>
          ) : (
            " · chart unavailable"
          )}
        </div>

        <button
          type="button"
          onClick={() => hasChartData && setExpanded((v) => !v)}
          disabled={!hasChartData}
          className="gold-ring inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
          style={{
            border: `1px solid ${hasChartData ? PALETTE.gold : PALETTE.border}`,
            background: hasChartData ? "rgba(95,143,123,0.08)" : "rgba(248,250,252,0.8)",
            color: hasChartData ? PALETTE.gold : PALETTE.muted,
            cursor: hasChartData ? "pointer" : "not-allowed",
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide chart" : "Show chart"}
          <ChevronDown
            size={14}
            className="lucide-icon"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}
          />
        </button>
      </div>

      {expanded && hasChartData && (
        <div
          className="mt-3 rounded-[20px] p-3 sm:p-4"
          style={{
            border: `1px solid ${PALETTE.border}`,
            background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(241,245,249,0.9))",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: PALETTE.muted }}>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "rgba(34,197,94,0.08)", color: PALETTE.success }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.success }} />
              {inP.web_name}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "rgba(239,68,68,0.08)", color: PALETTE.danger }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.danger }} />
              {outP.web_name}
            </span>
          </div>

          <div className="h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.24)" />
                <XAxis
                  dataKey="gw"
                  tick={{ fill: PALETTE.muted, fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  tickLine={{ stroke: "rgba(148,163,184,0.32)" }}
                />
                <YAxis
                  tick={{ fill: PALETTE.muted, fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  tickLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  width={34}
                />
                <Tooltip content={<TransferChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="inPoints"
                  name={inP.web_name}
                  stroke={PALETTE.success}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="outPoints"
                  name={outP.web_name}
                  stroke={PALETTE.danger}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function TransferChartTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      className="rounded-2xl px-3 py-2 text-xs shadow-xl"
      style={{
        background: "rgba(255,255,255,0.98)",
        border: `1px solid ${PALETTE.border}`,
        color: PALETTE.text,
      }}
    >
      <div className="font-semibold mb-1">GW {label}</div>
      <div className="flex items-start gap-2" style={{ color: PALETTE.success }}>
        <span className="mt-[5px] inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.success }} />
        <div>
          <div>{payload.find((x) => x.dataKey === "inPoints")?.name}: {Number.isFinite(row.inPoints) ? row.inPoints.toFixed(2) : "-"}</div>
          <div style={{ color: PALETTE.muted }}>Opposition: {row.inOpponent || "N/A"}</div>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-2" style={{ color: PALETTE.danger }}>
        <span className="mt-[5px] inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.danger }} />
        <div>
          <div>{payload.find((x) => x.dataKey === "outPoints")?.name}: {Number.isFinite(row.outPoints) ? row.outPoints.toFixed(2) : "-"}</div>
          <div style={{ color: PALETTE.muted }}>Opposition: {row.outOpponent || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}





