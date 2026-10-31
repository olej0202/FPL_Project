import { Sparkles, Shield, Trophy, Target } from "lucide-react";
import { BASE_SCENARIO_ID } from "../../../Contexts/AdjustmentsContext.jsx";
import teamShort from "../../../utils/team_short.js";
import { getNodePath } from "../../../utils/treeWorkspace.js";
import { buildPlanningTree } from "../../../utils/planningGameweeks.js";

export const isValidGW = (gw) =>
  Number.isInteger(gw) && gw >= 1 && gw <= 38;

export const buildNewTreeNodes = buildPlanningTree;

export const TREE_NODE_WIDTH = 224;

export const TREE_NODE_HEIGHT = 420;

export const TREE_COMPACT_NODE_HEIGHT = 158;

export const TREE_ZOOM_MIN = 0.4;

export const TREE_ZOOM_MAX = 1.3;

export const TREE_ZOOM_STEP = 0.1;

export const TREE_COMPACT_ZOOM = 0.85;

export const buildTreeChildrenMap = (nodes) => {
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

export const getTreeLeafIds = (nodeId, childrenByParent) => {
  const children = childrenByParent.get(nodeId) || [];
  if (!children.length) return [nodeId];
  return children.flatMap((child) => getTreeLeafIds(child.id, childrenByParent));
};

export const ensureTreeStartAnchor = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  if (nodes.some((node) => node?.isAnchor)) return nodes.map((node) => ({ ...node }));
  const roots = nodes.filter((node) => !node.parentId);
  if (roots.length !== 1 || Number(roots[0].gw) <= 1) return nodes.map((node) => ({ ...node }));
  const root = roots[0];
  const anchorId = `tree_start_${root.gw - 1}`;
  return [
    {
      id: anchorId,
      label: `GW${Number(root.gw) - 1} complete`,
      gw: Number(root.gw) - 1,
      parentId: null,
      probability: 100,
      chip: "none",
      scenarioId: BASE_SCENARIO_ID,
      isAnchor: true,
    },
    ...nodes.map((node) =>
      node.id === root.id
        ? { ...node, parentId: anchorId, scenarioId: node.scenarioId === BASE_SCENARIO_ID ? "inherit" : node.scenarioId }
        : { ...node }
    ),
  ];
};

export const TREE_WORKSPACE_STORAGE_KEY = "fpl_optimizer_tree_workspace_v1";

export const readStoredTreeWorkspace = (firstFutureGw) => {
  const defaultNodes = buildNewTreeNodes("tree", firstFutureGw);
  const fallback = {
    enabled: false,
    treeEditorOpen: true,
    nodes: defaultNodes,
    positions: {},
    zoom: 1,
    activeTreeRootId: defaultNodes[0]?.id || "",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TREE_WORKSPACE_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    const nodes = ensureTreeStartAnchor(parsed.nodes);
    if (!nodes.length) return fallback;
    const rootIds = nodes.filter((node) => !node.parentId).map((node) => node.id);
    return {
      enabled: Boolean(parsed.enabled),
      treeEditorOpen: parsed.treeEditorOpen !== false,
      nodes,
      positions: parsed.positions && typeof parsed.positions === "object" ? parsed.positions : {},
      zoom: Math.min(
        TREE_ZOOM_MAX,
        Math.max(TREE_ZOOM_MIN, Number(parsed.zoom) || 1)
      ),
      activeTreeRootId: rootIds.includes(parsed.activeTreeRootId)
        ? parsed.activeTreeRootId
        : rootIds[0] || fallback.activeTreeRootId,
    };
  } catch {
    return fallback;
  }
};

export const syncTreeMasses = (nodes) => {
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

export const buildVerticalTreeLayout = (nodes, heights = {}) => {
  const childrenByParent = buildTreeChildrenMap(nodes);
  const roots = nodes.filter((node) => !node.parentId);
  const positions = {};
  let leafIndex = 0;
  let treeOffset = 0;
  const horizontalGap = 290;
  const treeGap = 160;
  const maxDepth = Math.max(0, ...nodes.map((node) => getNodePath(nodes, node.id).length - 1));
  const levelY = [50];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const levelHeight = Math.max(80, ...nodes.filter((node) => getNodePath(nodes, node.id).length - 1 === depth)
      .map((node) => node.isAnchor ? 80 : heights[node.id] || TREE_NODE_HEIGHT));
    levelY.push(levelY[depth] + levelHeight + 55);
  }

  const place = (node, depth) => {
    const children = childrenByParent.get(node.id) || [];
    let centerX;
    if (!children.length) {
      centerX = 150 + leafIndex * horizontalGap + treeOffset;
      leafIndex += 1;
    } else {
      const childCenters = children.map((child) => place(child, depth + 1));
      centerX = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length;
    }
    positions[node.id] = { x: centerX - TREE_NODE_WIDTH / 2, y: levelY[depth] };
    return centerX;
  };

  roots.forEach((root, index) => {
    if (index > 0) treeOffset += treeGap;
    place(root, 0);
  });
  return {
    positions,
    width: Math.max(900, 300 + Math.max(1, leafIndex) * horizontalGap + treeOffset),
    height: Math.max(620, ...nodes.map((node) => positions[node.id].y + (heights[node.id] || TREE_NODE_HEIGHT) + 80)),
  };
};

export const buildStatisticalPlayerPayload = (rows) => {
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

export const compareStatisticalPlayerPayloads = (baseRows, scenarioRows, fromGw = 1) => {
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

export const normalizeTeamKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const normalizePlayerKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const normalizeLoosePlayerKey = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const getPlayerIdentityCandidates = (value) => {
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

export const playerGwKey = (name, gw) => `${normalizePlayerKey(name)}__${Number(gw)}`;

export const loosePlayerGwKey = (name, gw) => `${normalizeLoosePlayerKey(name)}__${Number(gw)}`;

export const teamGwKey = (team, gw) => `${normalizeTeamKey(team)}__${Number(gw)}`;

export const getTeamShort = (teamNameOrCode) => {
  if (!teamNameOrCode) return null;
  const raw = String(teamNameOrCode).trim();
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();
  if (teamShort?.[raw]) return String(teamShort[raw]).toUpperCase();

  const target = normalizeTeamKey(raw);
  const key = Object.keys(teamShort || {}).find((k) => normalizeTeamKey(k) === target);
  return key ? String(teamShort[key]).toUpperCase() : null;
};

export const formatOpponent = (opponentValue) => {
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

export const toFiniteNumber = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export const isUnknownOpponent = (value) => {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  return /^(n\/?a|na|none|null|unknown|-)$/i.test(s);
};

export const cleanOpponentValue = (value) => (isUnknownOpponent(value) ? null : value);

export const getFixtureVenue = (row) => {
  const raw =
    row?.Home ??
    row?.home ??
    row?.venue ??
    row?.was_home ??
    row?.is_home;
  if (raw === true || raw === 1) return "H";
  if (raw === false || raw === 0) return "A";
  const value = String(raw ?? "").trim().toUpperCase();
  if (["H", "HOME", "TRUE", "1"].includes(value)) return "H";
  if (["A", "AWAY", "FALSE", "0"].includes(value)) return "A";
  return null;
};

export const getRowPredictedPoints = (row) =>
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

export const getRowGoals = (row) =>
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

export const getRowAssists = (row) =>
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

export const getRowDefcon = (row) =>
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

export const MEASURE_OPTIONS = [
  { key: "points", label: "Pred points", short: "Pts", icon: Target },
  { key: "goals", label: "Goals", short: "G", icon: Trophy },
  { key: "assists", label: "Assists", short: "A", icon: Sparkles },
  { key: "defcon", label: "Defcon", short: "Def", icon: Shield },
];

export const getRowMeasureValue = (row, measureKey) => {
  if (measureKey === "goals") return getRowGoals(row);
  if (measureKey === "assists") return getRowAssists(row);
  if (measureKey === "defcon") return getRowDefcon(row);
  return getRowPredictedPoints(row);
};

export const formatMeasureValue = (value, measureKey = "points") => {
  if (!Number.isFinite(Number(value))) return "-";
  const digits = measureKey === "points" ? 1 : 2;
  return Number(value).toFixed(digits);
};

export const getRowSelectedPercent = (row) => {
  const raw = toFiniteNumber(
    row?.selected_pct,
    row?.selected_by_percent,
    row?.ownership,
    row?.selected
  );
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
};

export const getRowPrice = (row) => {
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

export const FALLBACK_PLAYER_PHOTO =
  "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

export const getPlayerDisplayName = (row) =>
  String(row?.web_name ?? row?.Web_Name ?? row?.second_name ?? row?.Name ?? row?.name ?? "Player");

export const getPlayerCanonicalName = (row) =>
  String(row?.Name ?? row?.name ?? row?.Full_Name ?? row?.full_name ?? row?.web_name ?? row?.id ?? "").trim();

export const normalizePosition = (pos) => {
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

export const getPlayerPhoto = (row) => {
  const code = row?.code ?? row?.player_code ?? row?.Code;
  if (row?.photo) return row.photo;
  if (code != null && String(code).trim() !== "") {
    return `https://resources.premierleague.com/premierleague25/photos/players/500x500/${code}.png`;
  }
  return FALLBACK_PLAYER_PHOTO;
};

export const STARTER_LIMITS = {
  GKP: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};

export const getPlayerStatus = (row) =>
  row?.status === "playing" || row?.status === "benched" ? row.status : "";

export const isValidFplFormation = (rows) => {
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

export const canSwitchPlayerRows = (rows, sourceName, targetName) => {
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

export const buildTransferPairs = (grp) => {
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

export const transferPairKey = (gw, outP, inP) =>
  `${Number(gw)}__${normalizeLoosePlayerKey(getPlayerCanonicalName(outP))}__${normalizeLoosePlayerKey(getPlayerCanonicalName(inP))}`;

export const manualTransferMatchesPair = (manualTransfer, pair) =>
  normalizeLoosePlayerKey(manualTransfer?.outName) ===
    normalizeLoosePlayerKey(getPlayerCanonicalName(pair?.outP)) &&
  normalizeLoosePlayerKey(manualTransfer?.inName) ===
    normalizeLoosePlayerKey(getPlayerCanonicalName(pair?.inP));

export const getTeamNameFromStrengthRow = (row) => {
  const raw = row?.name ?? row?.team_name ?? row?.Team ?? row?.team ?? row?.full_name;
  return raw ? String(raw).trim() : null;
};

export const getRawTeamStrength = (row) => {
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

export const buildOpponentStrengthLookup = (rows) => {
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

export const splitOpponentParts = (value) =>
  String(value || "")
    .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
    .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
    .map((x) => x.trim())
    .filter(Boolean);

export const lookupStrengthForOpponent = (lookup, opponentValue) => {
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

export const opponentStrengthTone = (strength) => {
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
