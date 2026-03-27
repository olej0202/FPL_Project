// src/pages/MyTeamOverview.jsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useLocation } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
  X,
  ArrowLeftRight,
  MousePointerClick,
  Hand,
  DollarSign,
  Sparkles,
} from "lucide-react";

import teamShort from "./utils/team_short";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";
import { useMyteamData } from "./Contexts/MyTeamContext";
import { useStatsData } from "./Contexts/StatsContext";
import pitch from "./assets/Pitch3.png";

const PALETTE = {
  red: "#f8fafc",
  gold: "#5f8f7b",
  goldSoft: "#8fbca9",
  black: "#e2e8f0",
  beige: "#1e293b",
  card: "rgba(255,255,255,0.95)",
  cardSoft: "rgba(241,245,249,0.94)",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
};

const pageBg = {
  background: `radial-gradient(circle at top, ${PALETTE.red} 0%, ${PALETTE.black} 58%, #cbd5e1 100%)`,
  color: PALETTE.beige,
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const glassCard = {
  border: `1px solid ${PALETTE.border}`,
  background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))",
  boxShadow: "0 14px 30px rgba(15,23,42,0.1)",
  backdropFilter: "blur(12px)",
};

const softCard = {
  border: `1px solid ${PALETTE.border}`,
  background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
};

const inputStyle = {
  border: `1px solid ${PALETTE.border}`,
  backgroundColor: "rgba(255,255,255,0.98)",
  color: PALETTE.beige,
};

const normalizeTeamKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getTeamShort = (teamNameOrCode) => {
  if (!teamNameOrCode) return null;

  const raw = String(teamNameOrCode).trim();
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();

  if (teamShort?.[raw]) return String(teamShort[raw]).toUpperCase();

  const target = normalizeTeamKey(raw);
  const key = Object.keys(teamShort || {}).find(
    (k) => normalizeTeamKey(k) === target
  );

  if (key) return String(teamShort[key]).toUpperCase();
  return null;
};

const formatOpponent = (opponentValue) => {
  if (!opponentValue) {
    return { opp1: "N/A", opp2: null, display: "N/A" };
  }

  const partsFromArray = Array.isArray(opponentValue) ? opponentValue : null;

  const partsFromString =
    partsFromArray ||
    String(opponentValue)
      .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
      .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
      .map((x) => x.trim())
      .filter(Boolean);

  const oppA = partsFromString?.[0] ?? null;
  const oppB = partsFromString?.[1] ?? null;

  const shortA = getTeamShort(oppA) || "N/A";
  const shortB = oppB ? getTeamShort(oppB) : null;

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

const getTeamNameFromStrengthRow = (row) => {
  const raw = row?.name ?? row?.team_name ?? row?.Team ?? row?.team ?? row?.full_name;
  return raw ? String(raw).trim() : null;
};

const getRawTeamStrength = (row) => {
  const attack = toFiniteNumber(
    row?.XG_avg,
    row?.XG,
    row?.xg,
    row?.XGH,
    row?.attack_strength
  );
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
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { teamName, sum: rawStrength, count: 1 });
      return;
    }

    grouped.set(key, {
      teamName: current.teamName,
      sum: current.sum + rawStrength,
      count: current.count + 1,
    });
  });

  if (!grouped.size) return new Map();

  const averages = Array.from(grouped.values()).map((v) => ({
    teamName: v.teamName,
    strength: v.sum / Math.max(1, v.count),
  }));

  const values = averages.map((v) => v.strength);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);

  const lookup = new Map();
  averages.forEach(({ teamName, strength }) => {
    const normalized = (strength - min) / span; // 0 = weakest, 1 = strongest
    const nameKey = normalizeTeamKey(teamName);
    lookup.set(nameKey, normalized);

    const shortCode = getTeamShort(teamName);
    if (shortCode) lookup.set(normalizeTeamKey(shortCode), normalized);
  });

  return lookup;
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

function computeDefaultStartersIndices(squad, gw, playersData) {
  if (!Array.isArray(squad) || squad.length === 0) return [];

  const metadata = squad.map((player, idx) => {
    const prediction = playersData.find(
      (p) => p.name === player.name && Number(p.GW) === Number(gw)
    );
    const pts = prediction?.Points_prediction
      ? Number(prediction.Points_prediction)
      : 0;

    return {
      idx,
      pos: player.position,
      pts,
    };
  });

  const byPos = { GKP: [], DEF: [], MID: [], FWD: [] };
  metadata.forEach((m) => {
    if (byPos[m.pos]) byPos[m.pos].push(m);
  });

  Object.values(byPos).forEach((arr) => arr.sort((a, b) => b.pts - a.pts));

  const chosen = new Set();
  const maxStarters = Math.min(11, squad.length);

  const pickFrom = (arr, n) => {
    for (let i = 0; i < arr.length && chosen.size < maxStarters && n > 0; i++) {
      if (!chosen.has(arr[i].idx)) {
        chosen.add(arr[i].idx);
        n--;
      }
    }
  };

  pickFrom(byPos.GKP, 1);
  pickFrom(byPos.DEF, 3);
  pickFrom(byPos.MID, 2);
  pickFrom(byPos.FWD, 1);

  let gkp = 0;
  let def = 0;
  let mid = 0;
  let fwd = 0;

  chosen.forEach((idx) => {
    const pos = metadata.find((m) => m.idx === idx)?.pos;
    if (pos === "GKP") gkp++;
    else if (pos === "DEF") def++;
    else if (pos === "MID") mid++;
    else if (pos === "FWD") fwd++;
  });

  const remaining = metadata
    .filter((m) => !chosen.has(m.idx))
    .sort((a, b) => b.pts - a.pts);

  for (const m of remaining) {
    if (chosen.size >= maxStarters) break;
    if (m.pos === "GKP" && gkp >= 1) continue;

    chosen.add(m.idx);
    if (m.pos === "GKP") gkp++;
    else if (m.pos === "DEF") def++;
    else if (m.pos === "MID") mid++;
    else if (m.pos === "FWD") fwd++;
  }

  return Array.from(chosen);
}

export default function MyTeamOverview() {
  const { teamId, setTeamId, teamData, fetchMyTeam, teamLoading } =
    useMyteamData();
  const { fetchIfNeeded, PlayersData, TeamData } = useStatsData();
  const { Playerdata, dataVersion } = useAdjustmentData();
  const location = useLocation();

  const [modelType, setModelType] = useState("ai");
  const appliedOptimizedRef = useRef(false);
  const lastApplyIdRef = useRef(null);
  const applyId = location.state?.applyId;

  const hasStatisticalData = useMemo(() => {
    const arr = Playerdata?.current;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some(
      (p) => p && p.calc_points != null && Number.isFinite(Number(p.calc_points))
    );
  }, [Playerdata, dataVersion]);

  useEffect(() => {
    if (modelType === "statistical" && !hasStatisticalData) {
      setModelType("ai");
    }
  }, [modelType, hasStatisticalData]);

  const [localTeamId, setLocalTeamId] = useState(teamId || "");
  const [showRankChart, setShowRankChart] = useState(false);
  const [showPredChart, setShowPredChart] = useState(false);
  const [currentGW, setCurrentGW] = useState(null);
  const [playersData, setPlayersData] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const [gwSquads, setGwSquads] = useState({});
  const [gwStarters, setGwStarters] = useState({});

  const [bankByGw, setBankByGw] = useState({});
  const [freeTransfersByGw, setFreeTransfersByGw] = useState({});
  const [transferLog, setTransferLog] = useState([]);

  const [dragInfo, setDragInfo] = useState(null);
  const [selectedBenchIndex, setSelectedBenchIndex] = useState(null);

  const [profilePlayer, setProfilePlayer] = useState(null);
  const [replacementMaxValue, setReplacementMaxValue] = useState(null);
  const [replacementSearch, setReplacementSearch] = useState("");
  const [compareCandidate, setCompareCandidate] = useState(null);

  useEffect(() => {
    if (teamId) setLocalTeamId(teamId);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(`myteam_planner_state_${teamId}`);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (parsed.gwSquads && typeof parsed.gwSquads === "object") {
        setGwSquads(parsed.gwSquads);
      }
      if (parsed.gwStarters && typeof parsed.gwStarters === "object") {
        setGwStarters(parsed.gwStarters);
      }
      if (parsed.currentGW != null) {
        setCurrentGW(parsed.currentGW);
      }
      if (parsed.bankByGw && typeof parsed.bankByGw === "object") {
        setBankByGw(parsed.bankByGw);
      }
      if (parsed.freeTransfersByGw && typeof parsed.freeTransfersByGw === "object") {
        setFreeTransfersByGw(parsed.freeTransfersByGw);
      }
      if (Array.isArray(parsed.transferLog)) {
        setTransferLog(parsed.transferLog);
      }
    } catch (err) {
      console.error("Failed to load planner state:", err);
    }
  }, [teamId]);

  useEffect(() => {
    const loadPlayers = async () => {
      setPlayersLoading(true);
      await fetchIfNeeded();

      if (PlayersData.current && PlayersData.current.length > 0) {
        setPlayersData(PlayersData.current);
      } else {
        setPlayersData([]);
      }

      setPlayersLoading(false);
    };

    loadPlayers();
  }, [fetchIfNeeded, PlayersData]);

  useEffect(() => {
    if (teamId && !teamData) {
      fetchMyTeam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const availableGWs = useMemo(() => {
    if (!playersData || playersData.length === 0) return [];
    return [
      ...new Set(
        playersData
          .map((p) => Number(p.GW))
          .filter((gw) => Number.isFinite(gw))
      ),
    ].sort((a, b) => a - b);
  }, [playersData]);

  const maxAvailableGW =
    availableGWs.length > 0 ? availableGWs[availableGWs.length - 1] : null;

  useEffect(() => {
    if (availableGWs.length > 0 && currentGW === null) {
      setCurrentGW(availableGWs[0]);
    }
  }, [availableGWs, currentGW]);

  useEffect(() => {
    if (!teamData || !Array.isArray(teamData)) return;
    if (currentGW == null) return;

    setGwSquads((prev) => {
      if (prev[currentGW]) return prev;
      return {
        ...prev,
        [currentGW]: teamData.map((p) => ({ ...p })),
      };
    });
  }, [currentGW, teamData]);

  const getSquadForGw = useCallback(
    (gw) => {
      if (gwSquads[gw]) return gwSquads[gw];
      if (teamData) return teamData;
      return [];
    },
    [gwSquads, teamData]
  );

  const getStarterIndicesForGw = useCallback(
    (gw) => {
      const squad = getSquadForGw(gw);
      if (!squad.length) return [];

      if (!playersData.length) {
        return squad.slice(0, 11).map((_, idx) => idx);
      }

      const stored = gwStarters[gw];
      if (stored && stored.length) return stored;

      return computeDefaultStartersIndices(squad, gw, playersData);
    },
    [getSquadForGw, playersData, gwStarters]
  );

  const getPlayerPrice = useCallback(
    (playerName, gw) => {
      const row = (playersData || []).find(
        (p) => p?.name === playerName && Number(p.GW) === Number(gw)
      );
      const price = row?.value ?? row?.price;
      const n = Number(price);
      return Number.isFinite(n) ? n : null;
    },
    [playersData]
  );

  const currentSquad = useMemo(() => {
    if (currentGW == null || !teamData) return [];
    return getSquadForGw(currentGW);
  }, [currentGW, getSquadForGw, teamData]);

  const currentSquadNames = useMemo(
    () => new Set(currentSquad.map((p) => p.name)),
    [currentSquad]
  );

  const rankChartData = useMemo(() => {
    if (!teamData || !teamData[0]?.rank_progress) return [];
    return teamData[0].rank_progress.map((rank, index) => ({
      gw: index + 1,
      rank,
    }));
  }, [teamData]);

  const teamInfo = teamData?.[0] || {};
  const baseMoneyInBank = teamInfo.money_in_bank_m ?? 0;
  const baseFreeTransfers = (teamInfo.saved_transfers ?? 0) + 1;

  const effectiveBankMoney =
    currentGW != null && bankByGw[currentGW] != null
      ? bankByGw[currentGW]
      : baseMoneyInBank;

  const getPredPoints = useCallback(
    (playerName, gw) => {
      if (!playerName || gw == null) return 0;

      if (modelType === "statistical" && hasStatisticalData) {
        const arr = Playerdata?.current;
        if (!Array.isArray(arr) || arr.length === 0) return 0;

        const rows = arr.filter(
          (p) => p?.name === playerName && Number(p.GW) === Number(gw)
        );
        const first = rows[0];
        const v = first?.calc_points;

        return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
      }

      const rows = playersData.filter(
        (p) => p?.name === playerName && Number(p.GW) === Number(gw)
      );
      const first = rows[0];
      const v = first?.Points_prediction;

      return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
    },
    [modelType, hasStatisticalData, Playerdata, playersData]
  );

  useEffect(() => {
    if (!teamData || currentGW == null || !availableGWs.length) return;

    setFreeTransfersByGw((prev) => {
      if (prev[currentGW] != null) return prev;

      const sorted = availableGWs;
      const idx = sorted.indexOf(currentGW);

      let val;
      if (idx <= 0) {
        val = baseFreeTransfers;
      } else {
        const prevGw = sorted[idx - 1];
        const prevVal = prev[prevGw] ?? baseFreeTransfers;
        val = Math.max(1, prevVal + 1);
      }

      return {
        ...prev,
        [currentGW]: val,
      };
    });
  }, [teamData, availableGWs, currentGW, baseFreeTransfers]);

  const currentFreeTransfers =
    currentGW != null
      ? freeTransfersByGw[currentGW] ?? baseFreeTransfers
      : baseFreeTransfers;

  const opponentStrengthLookup = useMemo(() => {
    const teamRows = Array.isArray(TeamData?.current) ? TeamData.current : [];
    return buildOpponentStrengthLookup(teamRows);
  }, [TeamData?.current]);

  const playersWithPredictions = useMemo(() => {
    if (!currentSquad || currentSquad.length === 0 || currentGW === null) return [];

    const hasAi = Array.isArray(playersData) && playersData.length > 0;
    const hasStat = modelType === "statistical" && hasStatisticalData;
    if (!hasAi && !hasStat) return [];

    return currentSquad.map((player, squadIndex) => {
      const rows = (playersData || []).filter(
        (p) => p.name === player.name && Number(p.GW) === Number(currentGW)
      );

      const prediction = rows[0];
      const oppList = Array.from(
        new Set(rows.map((r) => r.opponent_name).filter(Boolean))
      );
      const oppFmt = formatOpponent(
        oppList.length ? oppList : prediction?.opponent_name || "N/A"
      );
      const strengthCandidates = [
        ...oppList,
        prediction?.opponent_name,
        oppFmt.opp1,
        oppFmt.opp2,
      ].filter(Boolean);
      const strengthValues = strengthCandidates
        .map((cand) => lookupStrengthForOpponent(opponentStrengthLookup, cand))
        .filter((v) => Number.isFinite(v));
      const opponentStrength = strengthValues.length
        ? Math.max(...strengthValues)
        : null;
      const opponentTone = opponentStrengthTone(opponentStrength);

      let selectedPct = player.selected_pct;
      if (selectedPct == null && prediction?.selected != null) {
        selectedPct = Number(prediction.selected) * 100;
      }

      const photo = prediction?.photo ?? prediction?.photo_url ?? player.photo ?? null;

      return {
        ...player,
        squadIndex,
        photo,
        points_prediction: getPredPoints(player.name, currentGW),
        opponent_raw: oppList.length
          ? oppList.join(" / ")
          : prediction?.opponent_name || "N/A",
        opponent_opp1: oppFmt.opp1,
        opponent_opp2: oppFmt.opp2,
        opponent_display: oppFmt.display,
        opponent_strength: opponentStrength,
        opponent_tone: opponentTone,
        selected_pct: selectedPct,
        model_value:
          prediction?.value != null ? Number(prediction.value) : null,
      };
    });
  }, [
    currentSquad,
    playersData,
    currentGW,
    modelType,
    hasStatisticalData,
    getPredPoints,
    opponentStrengthLookup,
  ]);

  const gwPointsMap = useMemo(() => {
    if (!teamData || !availableGWs.length) return {};

    const map = {};
    availableGWs.forEach((gw) => {
      const squadForGw = getSquadForGw(gw);
      if (!squadForGw.length) {
        map[gw] = 0;
        return;
      }

      const startersIdx = getStarterIndicesForGw(gw);
      let sum = 0;

      startersIdx.forEach((idx) => {
        const player = squadForGw[idx];
        if (!player) return;
        sum += getPredPoints(player.name, gw);
      });

      map[gw] = sum;
    });

    return map;
  }, [
    availableGWs,
    getSquadForGw,
    getStarterIndicesForGw,
    teamData,
    getPredPoints,
  ]);

  const totalPredictedPoints = useMemo(
    () => Object.values(gwPointsMap).reduce((acc, val) => acc + (val || 0), 0),
    [gwPointsMap]
  );

  const predictedChartData = useMemo(() => {
    if (!availableGWs.length) return [];
    const futureGWs = availableGWs.filter(
      (gw) => currentGW == null || gw >= currentGW
    );
    return futureGWs.map((gw) => ({
      gw,
      points: gwPointsMap[gw] || 0,
    }));
  }, [availableGWs, gwPointsMap, currentGW]);

  const currentGwPoints =
    currentGW != null ? gwPointsMap[currentGW] || 0 : null;

  const transfersUsedThisGw = useMemo(() => {
    if (currentGW == null) return 0;
    return transferLog.filter((t) => Number(t.gw) === Number(currentGW)).length;
  }, [transferLog, currentGW]);

  const freeTransfersBeforeUse = currentFreeTransfers + transfersUsedThisGw;

  const handleBenchToFieldSwap = useCallback(
    (gw, benchIndex, starterIndex) => {
      const squad = getSquadForGw(gw);
      if (!squad.length) return;

      const currentStarterIndices = getStarterIndicesForGw(gw);
      const starterSet = new Set(currentStarterIndices);

      if (!starterSet.has(starterIndex) || starterSet.has(benchIndex)) return;

      const newSet = new Set(starterSet);
      newSet.delete(starterIndex);
      newSet.add(benchIndex);

      let gkp = 0;
      let def = 0;
      let mid = 0;
      let fwd = 0;

      newSet.forEach((idx) => {
        const pos = squad[idx]?.position;
        if (pos === "GKP") gkp++;
        else if (pos === "DEF") def++;
        else if (pos === "MID") mid++;
        else if (pos === "FWD") fwd++;
      });

      if (gkp !== 1 || def < 3 || mid < 2 || fwd < 1) return;

      setGwStarters((prev) => ({
        ...prev,
        [gw]: Array.from(newSet),
      }));
    },
    [getSquadForGw, getStarterIndicesForGw]
  );

  const recomputeFromTransfers = useCallback(
    (transfers) => {
      if (!teamData || !Array.isArray(teamData) || !availableGWs.length) {
        return {
          squads: { ...gwSquads },
          bankByGw: { ...bankByGw },
          freeTransfers: { ...freeTransfersByGw },
        };
      }

      const sortedTransfers = [...transfers].sort(
        (a, b) => a.gw - b.gw || a.createdAt - b.createdAt
      );

      const squads = {};
      availableGWs.forEach((gw) => {
        squads[gw] = teamData.map((p) => ({ ...p }));
      });

      sortedTransfers.forEach((t) => {
        availableGWs.forEach((gw) => {
          if (gw < t.gw) return;
          const base = squads[gw];
          if (!base || !base[t.squadIndex]) return;

          const template = base[t.squadIndex];
          const incomingPrice = t.incomingPrice;

          base[t.squadIndex] = {
            ...template,
            name: t.suggestion.name,
            web_name: t.suggestion.web_name,
            position: template.position,
            photo:
              t.suggestion.photo ??
              t.suggestion.photo_url ??
              template.photo ??
              null,
            now_cost:
              template.now_cost != null
                ? template.now_cost
                : Math.round(incomingPrice * 10),
            selected_pct:
              t.suggestion.selected_pct != null
                ? t.suggestion.selected_pct
                : template.selected_pct,
            team_code:
              t.suggestion.team_code != null
                ? t.suggestion.team_code
                : template.team_code,
            selling_price_m: incomingPrice,
          };
        });
      });

      const freeTransfers = {};
      availableGWs.forEach((gw, idx) => {
        const prevGw = idx > 0 ? availableGWs[idx - 1] : null;
        const baseFT =
          idx === 0
            ? baseFreeTransfers
            : Math.max(1, (freeTransfers[prevGw] ?? baseFreeTransfers) + 1);

        const transfersInGw = sortedTransfers.filter((t) => t.gw === gw).length;
        freeTransfers[gw] = Math.max(0, baseFT - transfersInGw);
      });

      const bankByGwNew = {};
      let runningBank = baseMoneyInBank;

      availableGWs.forEach((gw) => {
        const transfersInGw = sortedTransfers.filter((t) => t.gw === gw);
        transfersInGw.forEach((t) => {
          runningBank += t.sellingPrice - t.incomingPrice;
        });
        bankByGwNew[gw] = runningBank;
      });

      return {
        squads,
        bankByGw: bankByGwNew,
        freeTransfers,
      };
    },
    [
      teamData,
      availableGWs,
      gwSquads,
      bankByGw,
      freeTransfersByGw,
      baseFreeTransfers,
      baseMoneyInBank,
    ]
  );

  useEffect(() => {
    if (!teamId) return;
    if (!applyId) return;
    if (lastApplyIdRef.current === applyId) return;

    lastApplyIdRef.current = applyId;

    try {
      localStorage.removeItem(`myteam_planner_state_${teamId}`);
    } catch {}

    setGwSquads({});
    setGwStarters({});
    setBankByGw({});
    setFreeTransfersByGw({});
    setTransferLog([]);
    setCurrentGW(null);
    setSelectedBenchIndex(null);
    setProfilePlayer(null);
    setCompareCandidate(null);
    setReplacementSearch("");
    setReplacementMaxValue(null);

    appliedOptimizedRef.current = false;
    fetchMyTeam();
  }, [applyId, teamId, fetchMyTeam]);

  useEffect(() => {
    const incoming = location.state?.optimizedTransfers;

    if (!applyId) return;
    if (!incoming || !Array.isArray(incoming) || incoming.length === 0) return;
    if (!teamData || !Array.isArray(teamData) || teamData.length === 0) return;
    if (!playersData || playersData.length === 0) return;
    if (!availableGWs || availableGWs.length === 0) return;
    if (appliedOptimizedRef.current) return;

    appliedOptimizedRef.current = true;

    const newTransfers = [];

    incoming.forEach((t) => {
      const gw = Number(t.gw);
      if (!Number.isFinite(gw)) return;

      const squadForGw = getSquadForGw(gw);
      const idx = squadForGw.findIndex((p) => p?.name === t.fromName);
      if (idx === -1) return;

      const template = squadForGw[idx];
      const sellingPrice =
        template?.selling_price_m != null
          ? Number(template.selling_price_m)
          : template?.now_cost != null
          ? Number(template.now_cost) / 10
          : 0;

      const incomingPrice =
        (t.toPrice != null ? Number(t.toPrice) : null) ??
        getPlayerPrice(t.toName, gw) ??
        0;

      newTransfers.push({
        id: `${applyId}-${gw}-${idx}-${t.toName}`,
        gw,
        squadIndex: idx,
        fromName: template.web_name || template.name,
        toName: t.toWebName || t.toName,
        sellingPrice,
        incomingPrice,
        suggestion: {
          name: t.toName,
          web_name: t.toWebName || t.toName,
          team_code: t.toTeamCode ?? null,
          price: incomingPrice,
          value: incomingPrice,
          selected_pct: null,
          photo: t.toPhoto ?? null,
          photo_url: t.toPhoto ?? null,
        },
        createdAt: Date.now(),
      });
    });

    if (newTransfers.length === 0) return;

    setTransferLog((prev) => {
      const updatedTransfers = [...prev, ...newTransfers].sort(
        (a, b) => a.gw - b.gw || a.createdAt - b.createdAt
      );

      const {
        squads,
        bankByGw: newBankByGw,
        freeTransfers,
      } = recomputeFromTransfers(updatedTransfers);

      setGwSquads(squads);
      setBankByGw(newBankByGw);
      setFreeTransfersByGw(freeTransfers);

      const minGw = Math.min(...newTransfers.map((x) => x.gw));
      if (Number.isFinite(minGw)) setCurrentGW(minGw);

      return updatedTransfers;
    });
  }, [
    applyId,
    location.state?.optimizedTransfers,
    teamData,
    playersData,
    availableGWs,
    getSquadForGw,
    getPlayerPrice,
    recomputeFromTransfers,
  ]);

  const handleReplaceWithSuggested = (suggestion) => {
    if (!profilePlayer || currentGW == null || !teamData) return;
    if (!availableGWs.length) return;

    const squadIndex = profilePlayer.squadIndex;
    if (squadIndex == null) return;

    const currentBase = getSquadForGw(currentGW);
    const template =
      (currentBase && currentBase[squadIndex]) ||
      (teamData && teamData[squadIndex]) ||
      profilePlayer;

    const sellingPrice =
      template.selling_price_m != null
        ? Number(template.selling_price_m)
        : template.now_cost != null
        ? Number(template.now_cost) / 10
        : 0;

    const incomingPrice =
      suggestion.price != null
        ? Number(suggestion.price)
        : suggestion.value != null
        ? Number(suggestion.value)
        : template.now_cost != null
        ? Number(template.now_cost) / 10
        : 0;

    const newTransfer = {
      id: `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`,
      gw: currentGW,
      squadIndex,
      fromName: template.web_name || template.name,
      toName: suggestion.web_name || suggestion.name,
      sellingPrice,
      incomingPrice,
      suggestion: {
        name: suggestion.name,
        web_name: suggestion.web_name,
        team_code: suggestion.team_code,
        price: suggestion.price,
        value: suggestion.value,
        selected_pct: suggestion.selected_pct,
        photo: suggestion.photo,
        photo_url: suggestion.photo_url,
      },
      createdAt: Date.now(),
    };

    const updatedTransfers = [...transferLog, newTransfer];
    const {
      squads,
      bankByGw: newBankByGw,
      freeTransfers,
    } = recomputeFromTransfers(updatedTransfers);

    setTransferLog(updatedTransfers);
    setGwSquads(squads);
    setBankByGw(newBankByGw);
    setFreeTransfersByGw(freeTransfers);
    setProfilePlayer(null);
    setCompareCandidate(null);
  };

  const handleUndoTransfer = (id) => {
    const updatedTransfers = transferLog.filter((t) => t.id !== id);
    const {
      squads,
      bankByGw: newBankByGw,
      freeTransfers,
    } = recomputeFromTransfers(updatedTransfers);

    setTransferLog(updatedTransfers);
    setGwSquads(squads);
    setBankByGw(newBankByGw);
    setFreeTransfersByGw(freeTransfers);
  };

  useEffect(() => {
    if (!teamId) return;
    if (typeof window === "undefined") return;

    const payload = {
      gwSquads,
      gwStarters,
      currentGW,
      bankByGw,
      freeTransfersByGw,
      transferLog,
    };

    try {
      localStorage.setItem(
        `myteam_planner_state_${teamId}`,
        JSON.stringify(payload)
      );
    } catch (err) {
      console.error("Failed to save planner state:", err);
    }
  }, [
    teamId,
    gwSquads,
    gwStarters,
    currentGW,
    bankByGw,
    freeTransfersByGw,
    transferLog,
  ]);

  const handleSetTeamId = () => {
    if (!localTeamId) {
      alert("Please enter a Team ID");
      return;
    }

    setGwSquads({});
    setGwStarters({});
    setCurrentGW(null);
    setSelectedBenchIndex(null);
    setProfilePlayer(null);
    setCompareCandidate(null);
    setBankByGw({});
    setFreeTransfersByGw({});
    setTransferLog([]);
    setReplacementSearch("");
    setReplacementMaxValue(null);

    appliedOptimizedRef.current = false;
    lastApplyIdRef.current = null;

    if (localTeamId !== teamId) {
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`myteam_planner_state_${localTeamId}`);
        } catch (err) {
          console.error("Failed to clear planner state:", err);
        }
      }
      setTeamId(localTeamId);
    } else {
      fetchMyTeam();
    }
  };

  const handlePrevGW = () => {
    const currentIndex = availableGWs.indexOf(currentGW);
    if (currentIndex > 0) {
      setCurrentGW(availableGWs[currentIndex - 1]);
      setSelectedBenchIndex(null);
      setProfilePlayer(null);
      setCompareCandidate(null);
    }
  };

  const handleNextGW = () => {
    const currentIndex = availableGWs.indexOf(currentGW);
    if (currentIndex < availableGWs.length - 1) {
      setCurrentGW(availableGWs[currentIndex + 1]);
      setSelectedBenchIndex(null);
      setProfilePlayer(null);
      setCompareCandidate(null);
    }
  };

  const profileMeta = useMemo(() => {
    if (!profilePlayer || currentGW == null || maxAvailableGW == null) return null;

    const gwSet = new Set(
      availableGWs.filter((gw) => gw >= currentGW && gw <= maxAvailableGW)
    );

    let selFromData = null;
    let totalPred = 0;

    Array.from(gwSet).forEach((gw) => {
      totalPred += getPredPoints(profilePlayer.name, gw);
    });

    if (Array.isArray(playersData)) {
      for (const p of playersData) {
        if (p.name !== profilePlayer.name) continue;
        const gwNum = Number(p.GW);
        if (!gwSet.has(gwNum)) continue;
        if (selFromData == null && p.selected != null) {
          selFromData = Number(p.selected) * 100;
          break;
        }
      }
    }

    const selPct =
      profilePlayer.selected_pct != null
        ? profilePlayer.selected_pct
        : selFromData != null
        ? selFromData
        : null;

    const nowCost =
      profilePlayer.now_cost != null ? Number(profilePlayer.now_cost) / 10 : null;

    return {
      selPct,
      nowCost,
      totalPred,
    };
  }, [
    profilePlayer,
    playersData,
    availableGWs,
    currentGW,
    maxAvailableGW,
    getPredPoints,
  ]);

  const getGwPointsForPlayer = useCallback(
    (playerName) => {
      const map = {};
      if (!playerName) return map;
      availableGWs.forEach((gw) => {
        map[gw] = getPredPoints(playerName, gw);
      });
      return map;
    },
    [availableGWs, getPredPoints]
  );

  const compareChartData = useMemo(() => {
    if (!profilePlayer || currentGW == null || maxAvailableGW == null) return [];

    const horizon = availableGWs.filter(
      (gw) => gw >= currentGW && gw <= maxAvailableGW
    );
    const curMap = getGwPointsForPlayer(profilePlayer.name);
    const candMap = compareCandidate?.name
      ? getGwPointsForPlayer(compareCandidate.name)
      : null;

    return horizon.map((gw) => ({
      gw,
      current: curMap[gw] ?? 0,
      candidate: candMap ? candMap[gw] ?? 0 : null,
    }));
  }, [
    profilePlayer,
    compareCandidate,
    availableGWs,
    currentGW,
    maxAvailableGW,
    getGwPointsForPlayer,
  ]);

  const replacementsMeta = useMemo(() => {
    if (
      !profilePlayer ||
      !playersData.length ||
      currentGW == null ||
      maxAvailableGW == null
    ) {
      return { minVal: 0, maxVal: 0, threshold: 0, list: [] };
    }

    const horizonGwSet = new Set(
      availableGWs.filter((gw) => gw >= currentGW && gw <= maxAvailableGW)
    );

    const samePosRows = playersData.filter(
      (p) => p.position === profilePlayer.position
    );

    if (!samePosRows.length) {
      return { minVal: 0, maxVal: 0, threshold: 0, list: [] };
    }

    const map = {};

    samePosRows.forEach((p) => {
      if (currentSquadNames.has(p.name) && p.name !== profilePlayer.name) return;

      const gwNum = Number(p.GW);
      if (!horizonGwSet.has(gwNum)) return;

      const price = Number(p.value ?? p.price) || 0;
      const pts = getPredPoints(p.name, gwNum);
      const opp = p.opponent_name || "N/A";
      const selPct = p.selected != null ? Number(p.selected) * 100 : null;

      if (!map[p.name]) {
        map[p.name] = {
          id: p.id,
          name: p.name,
          web_name: p.web_name,
          team_code: p.team_code,
          price,
          totalPoints: 0,
          opponent: opp,
          selected_pct: selPct,
          photo: p.photo ?? p.photo_url ?? null,
        };
      }

      map[p.name].totalPoints += pts;
      map[p.name].price = price;
      map[p.name].opponent = opp;
      if (selPct != null) map[p.name].selected_pct = selPct;
      if (p.photo || p.photo_url) map[p.name].photo = p.photo ?? p.photo_url;
    });

    const aggregated = Object.values(map);
    if (!aggregated.length) {
      return { minVal: 0, maxVal: 0, threshold: 0, list: [] };
    }

    const prices = aggregated.map((a) => a.price || 0);
    const minVal = Math.floor(Math.min(...prices));
    const maxVal = Math.ceil(Math.max(...prices));
    const threshold = replacementMaxValue != null ? replacementMaxValue : maxVal;

    const list = aggregated
      .filter((a) => a.price <= threshold)
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return { minVal, maxVal, threshold, list };
  }, [
    profilePlayer,
    playersData,
    availableGWs,
    currentGW,
    maxAvailableGW,
    currentSquadNames,
    replacementMaxValue,
    getPredPoints,
  ]);

  useEffect(() => {
    if (
      !profilePlayer ||
      !playersData.length ||
      replacementsMeta.maxVal <= replacementsMeta.minVal
    ) {
      setReplacementMaxValue(null);
      setReplacementSearch("");
      setCompareCandidate(null);
      return;
    }

    setReplacementMaxValue(replacementsMeta.maxVal);
    setReplacementSearch("");
    setCompareCandidate(null);
  }, [profilePlayer, playersData, replacementsMeta.maxVal, replacementsMeta.minVal]);

  const displayReplacements = useMemo(() => {
    const base = replacementsMeta.list || [];
    if (!base.length) return [];

    const term = replacementSearch.trim().toLowerCase();
    let filtered = base;

    if (term) {
      filtered = base.filter((p) => {
        const w = (p.web_name || "").toLowerCase();
        const n = (p.name || "").toLowerCase();
        return w.includes(term) || n.includes(term);
      });
    }

    return filtered.slice(0, term ? 50 : 15);
  }, [replacementsMeta.list, replacementSearch]);

  const handleOpenProfile = (player) => {
    setProfilePlayer(player);
    setCompareCandidate(null);
  };

  const handleCloseProfile = () => {
    setProfilePlayer(null);
    setCompareCandidate(null);
  };

  const selectedBenchPlayer = useMemo(() => {
    if (selectedBenchIndex == null) return null;
    return (
      playersWithPredictions.find((p) => p.squadIndex === selectedBenchIndex) || null
    );
  }, [selectedBenchIndex, playersWithPredictions]);

  const swapHintText = useMemo(() => {
    if (dragInfo && dragInfo.type === "bench") {
      return "Dragging bench player… drop on a starter to swap";
    }
    if (selectedBenchPlayer) {
      return `Swap mode: tap a starter to swap with ${selectedBenchPlayer.web_name}`;
    }
    return null;
  }, [dragInfo, selectedBenchPlayer]);

  const swapModeActive = !!swapHintText;

  const clearSwapMode = useCallback(() => {
    setSelectedBenchIndex(null);
    setDragInfo(null);
  }, []);

  if (!teamId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={pageBg}>
        <div
          className="w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl"
          style={glassCard}
        >
          <h1 className="text-xl sm:text-2xl font-bold mb-3 text-center">
            Enter Your Team ID
          </h1>

          <input
            type="number"
            value={localTeamId}
            onChange={(e) => setLocalTeamId(e.target.value)}
            placeholder="Team ID"
            className="w-full h-11 px-3 rounded-xl text-sm mb-3"
            style={inputStyle}
          />

          <button
            onClick={handleSetTeamId}
            className="w-full h-11 rounded-full font-semibold text-sm transition"
            style={{
              border: `1px solid ${PALETTE.gold}`,
              background: `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`,
              color: "#0f172a",
              boxShadow: "0 10px 20px rgba(95,143,123,0.28)",
            }}
          >
            Load Team
          </button>
        </div>
      </div>
    );
  }

  if (teamLoading || playersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={pageBg}>
        <div
          className="w-full max-w-md rounded-3xl p-5 shadow-2xl text-center text-sm"
          style={glassCard}
        >
          Loading team and player predictions…
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={pageBg}>
        <div className="text-xl text-center">No team data available</div>
      </div>
    );
  }

  const startersIdx = currentGW != null ? getStarterIndicesForGw(currentGW) : [];
  const startersIdxSet = new Set(startersIdx);

  const starters = playersWithPredictions.filter((p) =>
    startersIdxSet.has(p.squadIndex)
  );
  const bench = playersWithPredictions.filter(
    (p) => !startersIdxSet.has(p.squadIndex)
  );

  const gkStarters = starters
    .filter((p) => p.position === "GKP")
    .sort((a, b) => a.squadIndex - b.squadIndex);

  const defStarters = starters
    .filter((p) => p.position === "DEF")
    .sort((a, b) => a.squadIndex - b.squadIndex);

  const midStarters = starters
    .filter((p) => p.position === "MID")
    .sort((a, b) => a.squadIndex - b.squadIndex);

  const fwdStarters = starters
    .filter((p) => p.position === "FWD")
    .sort((a, b) => a.squadIndex - b.squadIndex);

  const sortedTransferLog = [...transferLog].sort(
    (a, b) => a.gw - b.gw || a.createdAt - b.createdAt
  );

  return (
    <div className="min-h-screen" style={pageBg}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="mb-6 sm:mb-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 mb-3">
              <Sparkles size={14} className="text-amber-300" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-600">
                My Team Planner
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              My Team Overview
            </h1>

            <p className="text-sm mt-2 max-w-3xl" style={{ color: "#64748b" }}>
              Planning tool for your squad, make transfers, and see your squad each GW
            </p>
          </div>

          <div className="w-full xl:w-auto flex flex-col lg:flex-row items-stretch lg:items-end gap-3">
            <div className="flex flex-col gap-1 w-full sm:w-[320px]">
              <label
                className="text-[11px] uppercase tracking-wide"
                style={{ color: "#1e293b" }}
              >
                Predicted Points Model
              </label>

              <div className="flex items-center gap-2 h-10">
                <button
                  type="button"
                  onClick={() => setModelType("ai")}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs border transition"
                  style={{
                    border:
                      modelType === "ai"
                        ? `1px solid ${PALETTE.gold}`
                        : `1px solid ${PALETTE.border}`,
                    background:
                      modelType === "ai"
                        ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                        : "rgba(248,250,252,0.92)",
                    color: modelType === "ai" ? "#0f172a" : "#1e293b",
                  }}
                >
                  Default model
                </button>

                <button
                  type="button"
                  onClick={() =>
                    hasStatisticalData && setModelType("statistical")
                  }
                  disabled={!hasStatisticalData}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs border transition"
                  style={{
                    border: !hasStatisticalData
                      ? `1px solid ${PALETTE.border}`
                      : modelType === "statistical"
                      ? `1px solid ${PALETTE.gold}`
                      : `1px solid ${PALETTE.border}`,
                    background: !hasStatisticalData
                      ? "rgba(248,250,252,0.8)"
                      : modelType === "statistical"
                      ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                      : "rgba(248,250,252,0.92)",
                    color: !hasStatisticalData
                      ? "#6b7280"
                      : modelType === "statistical"
                      ? "#0f172a"
                      : "#1e293b",
                    cursor: !hasStatisticalData ? "not-allowed" : "pointer",
                  }}
                >
                  Statistical model
                </button>
              </div>

              {!hasStatisticalData && (
                <div className="text-[10px] mt-1" style={{ color: "#fbbf24" }}>
                  Statistical model needs your Adjustment data (calc_points).
                </div>
              )}
            </div>

            <div className="flex items-end gap-2 w-full lg:w-auto">
              <div className="flex-1 lg:flex-none">
                <label
                  className="text-[11px] uppercase tracking-wide block mb-1"
                  style={{ color: "#1e293b" }}
                >
                  Team ID
                </label>
                <input
                  type="number"
                  value={localTeamId}
                  onChange={(e) => setLocalTeamId(e.target.value)}
                  className="w-full lg:w-[140px] h-10 px-3 rounded-xl text-xs"
                  style={inputStyle}
                />
              </div>

              <button
                onClick={handleSetTeamId}
                className="inline-flex items-center justify-center px-4 h-10 rounded-full text-xs font-semibold"
                style={{
                  border: `1px solid ${PALETTE.gold}`,
                  background:
                    `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`,
                  color: "#0f172a",
                  boxShadow: "0 10px 20px rgba(95,143,123,0.25)",
                }}
              >
                Load Team
              </button>
            </div>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
          <ChartCard
            title="Season Rank History"
            open={showRankChart}
            onToggle={() => setShowRankChart((v) => !v)}
          >
            {showRankChart && rankChartData.length > 0 && (
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rankChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                    <XAxis dataKey="gw" stroke="#94a3b8" />
                    <YAxis reversed stroke="#94a3b8" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="rank"
                      stroke={PALETTE.gold}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {showRankChart && rankChartData.length === 0 && (
              <div className="mt-3 text-xs text-slate-500">
                No rank history available yet.
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Predicted Points by GW"
            open={showPredChart}
            onToggle={() => setShowPredChart((v) => !v)}
          >
            {showPredChart && predictedChartData.length > 0 && (
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={predictedChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                    <XAxis dataKey="gw" stroke="#94a3b8" />
                    <YAxis
                      domain={[40, "auto"]}
                      tickFormatter={(v) => Number(v).toFixed(1)}
                      stroke="#94a3b8"
                    />
                    <Tooltip
                      formatter={(value) => Number(value).toFixed(1)}
                      labelFormatter={(label) => `GW ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="points"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {showPredChart && predictedChartData.length === 0 && (
              <div className="mt-3 text-xs text-slate-500">
                No prediction data available yet.
              </div>
            )}
          </ChartCard>
        </section>

        <section
          className="rounded-3xl p-4 sm:p-5 lg:p-6 mb-10"
          style={glassCard}
        >
          <div className="flex flex-col gap-5 mb-5">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold">
                  Squad for GW {currentGW ?? "-"}
                </h2>
                <p className="text-xs sm:text-sm mt-1 text-slate-600 max-w-2xl">
                  Open player profiles for replacement
                  comparison and transfers.
                </p>
              </div>

              
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <SquadMetricCard
                icon={DollarSign}
                label="Money in Bank"
                value={`£${effectiveBankMoney.toFixed(1)}m`}
                tone={effectiveBankMoney < 0 ? "red" : "green"}
              />

              <SquadMetricCard
                icon={ArrowLeftRight}
                label="Transfers"
                value={`${transfersUsedThisGw} / ${freeTransfersBeforeUse}`}
                subValue="used this week / free transfers before use"
                tone="blue"
              />

              <SquadMetricCard
                icon={Sparkles}
                label="Predicted Points"
                value={currentGwPoints != null ? currentGwPoints.toFixed(1) : "-"}
                subValue={`GW ${currentGW ?? "-"}`}
                tone="purple"
              />


              <div
                className="rounded-2xl p-3 sm:p-4"
                style={{ ...softCard, background: "rgba(248,250,252,0.82)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MousePointerClick size={14} className="text-amber-300" />
                  <div className="text-[11px] uppercase tracking-wide text-slate-600">
                    Tip
                  </div>
                </div>
                <div className="text-xs text-slate-700">
                  Tap a bench player and switch with player on the pitch.
                </div>
              </div>
            </div>
          </div>
          

          {swapHintText && (
            <div className="mb-4">
              <div
                className="rounded-2xl border border-amber-400/35 bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-3"
                style={{ boxShadow: "0 10px 24px rgba(15,23,42,0.1)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowLeftRight size={16} className="text-amber-300" />
                  <div className="text-[12px] text-slate-700 truncate">
                    <span className="font-semibold">Swap</span>{" "}
                    <span className="text-slate-600">{swapHintText}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clearSwapMode}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-slate-200 bg-slate-100 hover:bg-white"
                >
                  <X size={12} className="text-slate-600" />
                  <span className="text-slate-700">Cancel</span>
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={handlePrevGW}
                  disabled={currentGW === null || availableGWs.indexOf(currentGW) === 0}
                  className="p-2.5 rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid rgba(95,143,123,0.45)`,
                    backgroundColor: "rgba(248,250,252,0.9)",
                    color: PALETTE.gold,
                  }}
                >
                  <ChevronLeft size={18} />
                </button>

                <span className="text-xs sm:text-sm font-medium text-slate-700 min-w-[96px] text-center">
                  {currentGW ? `Gameweek ${currentGW}` : "No GW selected"}
                </span>

                <button
                  onClick={handleNextGW}
                  disabled={
                    currentGW === null ||
                    availableGWs.indexOf(currentGW) === availableGWs.length - 1
                  }
                  className="p-2.5 rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid rgba(95,143,123,0.45)`,
                    backgroundColor: "rgba(248,250,252,0.9)",
                    color: PALETTE.gold,
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
          

          <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 items-stretch">
            
            <div className="flex-1 flex items-center justify-center min-w-0">
              <div
                className="w-full max-w-[470px] mx-auto aspect-[0.5/1] sm:aspect-[2/3.1] bg-no-repeat bg-cover bg-center border rounded-2xl px-2 py-2"
                style={{
                  backgroundImage: `url(${pitch})`,
                  borderColor: "rgba(148,163,184,0.45)",
                  boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.2)",
                }}
              >
                
                <div className="flex flex-col h-full pt-1 pb-2 gap-9 sm:gap-8 justify-start">
                  
                  <PitchRow
                    players={gkStarters}
                    label="GKP"
                    dragInfo={dragInfo}
                    swapModeActive={swapModeActive}
                    onDrop={(benchIdx, starterIdx) =>
                      handleBenchToFieldSwap(currentGW, benchIdx, starterIdx)
                    }
                    onClickSwap={(starterIdx) => {
                      if (selectedBenchIndex != null && currentGW != null) {
                        handleBenchToFieldSwap(
                          currentGW,
                          selectedBenchIndex,
                          starterIdx
                        );
                        setSelectedBenchIndex(null);
                      }
                    }}
                    openProfile={handleOpenProfile}
                  />

                  <PitchRow
                    players={defStarters}
                    label="DEF"
                    dragInfo={dragInfo}
                    swapModeActive={swapModeActive}
                    onDrop={(benchIdx, starterIdx) =>
                      handleBenchToFieldSwap(currentGW, benchIdx, starterIdx)
                    }
                    onClickSwap={(starterIdx) => {
                      if (selectedBenchIndex != null && currentGW != null) {
                        handleBenchToFieldSwap(
                          currentGW,
                          selectedBenchIndex,
                          starterIdx
                        );
                        setSelectedBenchIndex(null);
                      }
                    }}
                    openProfile={handleOpenProfile}
                  />

                  <PitchRow
                    players={midStarters}
                    label="MID"
                    dragInfo={dragInfo}
                    swapModeActive={swapModeActive}
                    onDrop={(benchIdx, starterIdx) =>
                      handleBenchToFieldSwap(currentGW, benchIdx, starterIdx)
                    }
                    onClickSwap={(starterIdx) => {
                      if (selectedBenchIndex != null && currentGW != null) {
                        handleBenchToFieldSwap(
                          currentGW,
                          selectedBenchIndex,
                          starterIdx
                        );
                        setSelectedBenchIndex(null);
                      }
                    }}
                    openProfile={handleOpenProfile}
                  />

                  <PitchRow
                    players={fwdStarters}
                    label="FWD"
                    dragInfo={dragInfo}
                    swapModeActive={swapModeActive}
                    onDrop={(benchIdx, starterIdx) =>
                      handleBenchToFieldSwap(currentGW, benchIdx, starterIdx)
                    }
                    onClickSwap={(starterIdx) => {
                      if (selectedBenchIndex != null && currentGW != null) {
                        handleBenchToFieldSwap(
                          currentGW,
                          selectedBenchIndex,
                          starterIdx
                        );
                        setSelectedBenchIndex(null);
                      }
                    }}
                    openProfile={handleOpenProfile}
                  />
                </div>
              </div>
            </div>

            <div className="w-full xl:w-[300px]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">Bench</h3>
                {selectedBenchIndex != null && (
                  <button
                    type="button"
                    onClick={() => setSelectedBenchIndex(null)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {bench.length === 0 ? (
                <div className="text-xs text-slate-600">No bench players for this GW.</div>
              ) : (
                <div className="space-y-2">
                  {bench.map((player) => {
                    const hasPhoto = !!player.photo;
                    const selectedText =
                      player.selected_pct != null
                        ? `${player.selected_pct.toFixed(1)}%`
                        : "–";
                    const costRaw =
                      player.now_cost != null ? Number(player.now_cost) : null;
                    const costDisplay =
                      costRaw != null && Number.isFinite(costRaw)
                        ? (costRaw / 10).toFixed(1)
                        : null;
                    const oppShort = player.opponent_display || "N/A";
                    const oppFull = player.opponent_raw || oppShort;
                    const oppTone =
                      player.opponent_tone || opponentStrengthTone(player.opponent_strength);
                    const isSelected = selectedBenchIndex === player.squadIndex;

                    return (
                      <div
                        key={`${player.name}-${player.squadIndex}`}
                        className={`relative flex items-center gap-3 p-3 rounded-2xl border transition ${
                          isSelected
                            ? "border-amber-400 bg-white"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                        style={{
                          boxShadow: isSelected
                            ? "0 10px 24px rgba(245,158,11,0.08)"
                            : "0 8px 18px rgba(15,23,42,0.06)",
                        }}
                        draggable
                        onDragStart={() =>
                          setDragInfo({
                            type: "bench",
                            squadIndex: player.squadIndex,
                          })
                        }
                        onDragEnd={() => setDragInfo(null)}
                        onClick={() =>
                          setSelectedBenchIndex((prev) =>
                            prev === player.squadIndex ? null : player.squadIndex
                          )
                        }
                      >
                        {isSelected && (
                          <div className="absolute inset-0 rounded-2xl pointer-events-none ring-2 ring-amber-400/40" />
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProfile(player);
                          }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-sm"
                          title="Open profile"
                        >
                          <CircleArrowRight size={14} className="text-emerald-700" />
                        </button>

                        {hasPhoto ? (
                          <img
                            src={player.photo}
                            alt={player.web_name}
                            className="w-11 h-11 rounded-full object-cover bg-gray-700 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = "";
                            }}
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0" />
                        )}

                        <div className="flex-1 min-w-0 pr-5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs truncate">
                              {player.web_name}
                            </span>
                            <span
                              className="text-[11px] font-semibold rounded-full px-2 py-0.5 max-w-[130px] truncate"
                              style={{
                                background: oppTone.badgeBg,
                                border: `1px solid ${oppTone.badgeBorder}`,
                                color: oppTone.badgeText,
                              }}
                              title={oppFull}
                            >
                              {oppFull}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-0.5">
                            <span>
                              {player.team || player.team_code || ""} • {player.position}
                            </span>
                            <span>Sel {selectedText}</span>
                            {costDisplay && <span>£{costDisplay}m</span>}
                          </div>

                          {isSelected && (
                            <div className="mt-1 text-[10px] text-amber-200 flex items-center gap-1">
                              <ArrowLeftRight size={12} />
                              Tap a starter to swap
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] text-slate-500">Pred</div>
                          <div className="text-sm font-bold text-purple-300">
                            {player.points_prediction.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <p className="text-[11px] text-slate-600 mt-1">
                    Tip: selecting a bench player highlights starters on the pitch.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-7">
            <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
              Planned Transfers
              <span className="text-[10px] text-slate-600">
                (click ✕ to undo)
              </span>
            </h3>

            {sortedTransferLog.length === 0 ? (
              <div className="text-xs text-slate-600">No planned transfers yet.</div>
            ) : (
              <div className="space-y-2 text-xs">
                {sortedTransferLog.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="font-semibold text-amber-200">
                        GW {t.gw}
                      </span>
                      <span className="text-slate-700">
                        {t.fromName} <span className="text-slate-500">→</span>{" "}
                        {t.toName}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Bank Δ: {(t.sellingPrice - t.incomingPrice).toFixed(1)}m
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUndoTransfer(t.id)}
                      className="ml-2 p-1 rounded-full hover:bg-slate-100"
                      aria-label="Undo transfer"
                    >
                      <X size={12} className="text-slate-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {profilePlayer && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-white/95 backdrop-blur-[2px]"
            onClick={handleCloseProfile}
          />

          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-start sm:items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
              <div
                className="relative w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden"
                style={{
                  ...glassCard,
                  maxHeight: "min(92vh, 980px)",
                }}
              >
                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 bg-white backdrop-blur-md">
                  <div className="flex items-center gap-3 min-w-0">
                    {profilePlayer.photo ? (
                      <img
                        src={profilePlayer.photo}
                        alt={profilePlayer.web_name}
                        className="w-11 h-11 rounded-full object-cover bg-gray-800"
                        onError={(e) => {
                          e.currentTarget.src = "";
                        }}
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">
                        {profilePlayer.web_name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {profilePlayer.position}
                      </div>
                      <div className="text-base sm:text-lg font-bold truncate">
                        {profilePlayer.web_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {profilePlayer.team || profilePlayer.team_code || ""} • GW{" "}
                        {currentGW}
                      </div>
                    </div>
                  </div>

                  <button
                    className="shrink-0 p-2 rounded-full bg-slate-100 hover:bg-white border border-slate-200"
                    onClick={handleCloseProfile}
                    aria-label="Close profile"
                  >
                    <X size={16} className="text-slate-700" />
                  </button>
                </div>

                <div className="overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 max-h-[calc(92vh-68px)]">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mb-4">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Selected
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {profileMeta?.selPct != null
                          ? `${profileMeta.selPct.toFixed(1)}%`
                          : "–"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Team Price
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {profileMeta?.nowCost != null
                          ? `£${profileMeta.nowCost.toFixed(1)}m`
                          : "–"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Total Pred Pts
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {profileMeta ? profileMeta.totalPred.toFixed(1) : "–"}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        GW {currentGW ?? "-"}–{maxAvailableGW ?? "-"}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-600">
                        Compare
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Click a suggestion to compare
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <CompareCard
                          title="Current"
                          player={{
                            web_name: profilePlayer.web_name,
                            photo: profilePlayer.photo,
                            price: profileMeta?.nowCost,
                            selected_pct: profileMeta?.selPct,
                            totalPoints: profileMeta?.totalPred,
                          }}
                          accent="amber"
                        />

                        <CompareCard
                          title="Candidate"
                          player={
                            compareCandidate
                              ? {
                                  web_name: compareCandidate.web_name,
                                  photo: compareCandidate.photo,
                                  price: compareCandidate.price,
                                  selected_pct: compareCandidate.selected_pct,
                                  totalPoints: compareCandidate.totalPoints,
                                }
                              : null
                          }
                          accent="emerald"
                          placeholder="Choose a replacement below"
                        />

                        <div className="md:col-span-2 mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] uppercase tracking-wide text-slate-600">
                              Predicted points per GW
                            </span>
                            <span className="text-[11px] text-slate-500">
                              GW {currentGW ?? "-"}–{maxAvailableGW ?? "-"}
                            </span>
                          </div>

                          {compareChartData.length === 0 ? (
                            <div className="text-xs text-slate-500">
                              No chart data available.
                            </div>
                          ) : (
                            <div style={{ height: 240 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={compareChartData}>
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(148,163,184,0.35)"
                                  />
                                  <XAxis dataKey="gw" stroke="#94a3b8" />
                                  <YAxis
                                    tickFormatter={(v) => Number(v).toFixed(1)}
                                    stroke="#94a3b8"
                                  />
                                  <Tooltip
                                    labelFormatter={(label) => `GW ${label}`}
                                    formatter={(value, name) => [
                                      Number(value).toFixed(1),
                                      name,
                                    ]}
                                  />
                                  <Legend />
                                  <Line
                                    type="monotone"
                                    dataKey="current"
                                    name={profilePlayer?.web_name || "Current"}
                                    stroke="#f59e0b"
                                    strokeWidth={2.5}
                                    dot={{ r: 2 }}
                                  />
                                  {compareCandidate && (
                                    <Line
                                      type="monotone"
                                      dataKey="candidate"
                                      name={
                                        compareCandidate?.web_name || "Candidate"
                                      }
                                      stroke="#10b981"
                                      strokeWidth={2.5}
                                      dot={{ r: 2 }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {!compareCandidate && (
                            <div className="mt-2 text-[11px] text-slate-500">
                              Select a replacement below to compare.
                            </div>
                          )}
                        </div>
                      </div>

                      {compareCandidate && (
                        <button
                          type="button"
                          onClick={() =>
                            handleReplaceWithSuggested(compareCandidate)
                          }
                          className="mt-3 w-full inline-flex items-center justify-center gap-2 h-10 rounded-full text-xs font-semibold"
                          style={{
                            border: "1px solid rgba(16,185,129,0.45)",
                            background:
                              "linear-gradient(135deg, rgba(16,185,129,0.95), rgba(52,211,153,0.85))",
                            color: "#04110b",
                          }}
                        >
                          <ArrowLeftRight size={14} />
                          Transfer in {compareCandidate.web_name}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] uppercase tracking-wide text-slate-600">
                        Best replacements (same position)
                      </span>

                      {replacementsMeta.maxVal > replacementsMeta.minVal && (
                        <span className="text-[11px] text-slate-600">
                          Max £{(replacementMaxValue || 0).toFixed(1)}m
                        </span>
                      )}
                    </div>

                    {replacementsMeta.maxVal > replacementsMeta.minVal ? (
                      <>
                        <input
                          type="range"
                          min={replacementsMeta.minVal}
                          max={replacementsMeta.maxVal}
                          step="0.1"
                          value={replacementMaxValue ?? replacementsMeta.maxVal}
                          onChange={(e) =>
                            setReplacementMaxValue(Number(e.target.value))
                          }
                          className="w-full mb-2"
                        />

                        <input
                          type="text"
                          value={replacementSearch}
                          onChange={(e) => setReplacementSearch(e.target.value)}
                          placeholder="Search name (e.g. Haaland, Salah...)"
                          className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 placeholder:text-gray-500"
                        />
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-500 mb-1">
                        No price data for this position.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                    {displayReplacements.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500">
                        No replacement suggestions found within the selected value
                        range or search.
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/5 text-xs">
                        {displayReplacements.map((p) => {
                          const oppShort = formatOpponent(p.opponent).display;
                          const isCompared = compareCandidate?.name === p.name;

                          return (
                            <li
                              key={`${p.id}-${p.name}`}
                              className={`px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition ${
                                isCompared
                                  ? "bg-teal-500/10"
                                  : "hover:bg-slate-100"
                              }`}
                              onClick={() => setCompareCandidate(p)}
                              title="Click to compare"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {p.photo ? (
                                  <img
                                    src={p.photo}
                                    alt={p.web_name}
                                    className="w-9 h-9 rounded-full object-cover bg-gray-700 flex-shrink-0"
                                    onError={(e) => {
                                      e.currentTarget.src = "";
                                    }}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-slate-500 flex-shrink-0">
                                    {p.web_name?.slice(0, 2).toUpperCase()}
                                  </div>
                                )}

                                <div className="min-w-0">
                                  <div className="font-semibold truncate max-w-[160px] flex items-center gap-2">
                                    <span className="truncate">{p.web_name}</span>
                                    {isCompared && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-teal-400/40 bg-slate-50 text-teal-200">
                                        comparing
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    £{p.price.toFixed(1)}m • {oppShort}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-[10px] text-slate-500">
                                  Total Pts
                                </div>
                                <div className="text-sm font-bold text-amber-300">
                                  {p.totalPoints.toFixed(1)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Sel{" "}
                                  {p.selected_pct != null
                                    ? `${p.selected_pct.toFixed(1)}%`
                                    : "–"}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    Tap a row to compare, then use the transfer button above.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, open, onToggle, children }) {
  return (
    <div className="rounded-3xl p-4 sm:p-5" style={glassCard}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left rounded-2xl px-3 py-2"
        style={{
          background: "rgba(15,23,42,0.64)",
          color: "#1e293b",
          border: "1px solid rgba(148,163,184,0.22)",
        }}
      >
        <h2 className="text-sm sm:text-base font-semibold">{title}</h2>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {children}
    </div>
  );
}

function SquadMetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone = "gold",
}) {
  const toneMap = {
    green: {
      border: "rgba(52,211,153,0.3)",
      value: "#34d399",
      iconBg: "rgba(52,211,153,0.12)",
    },
    red: {
      border: "rgba(248,113,113,0.3)",
      value: "#f87171",
      iconBg: "rgba(248,113,113,0.12)",
    },
    blue: {
      border: "rgba(96,165,250,0.3)",
      value: "#60a5fa",
      iconBg: "rgba(96,165,250,0.12)",
    },
    purple: {
      border: "rgba(196,181,253,0.3)",
      value: "#c4b5fd",
      iconBg: "rgba(196,181,253,0.12)",
    },
    gold: {
      border: "rgba(251,191,36,0.3)",
      value: "#fbbf24",
      iconBg: "rgba(251,191,36,0.12)",
    },
  };

  const colors = toneMap[tone] || toneMap.gold;

  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{
        ...softCard,
        border: `1px solid ${colors.border}`,
        background: "rgba(248,250,252,0.82)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-600 mb-1">
            {label}
          </div>
          <div className="text-lg sm:text-xl font-bold" style={{ color: colors.value }}>
            {value}
          </div>
          {subValue && <div className="text-[10px] text-slate-500 mt-1">{subValue}</div>}
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: colors.iconBg }}
        >
          <Icon size={16} style={{ color: colors.value }} />
        </div>
      </div>
    </div>
  );
}

function PitchRow({
  players,
  label,
  dragInfo,
  swapModeActive,
  onDrop,
  onClickSwap,
  openProfile,
}) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3 px-1">
      {players.map((player) => {
        const hasPhoto = !!player.photo;
        const selectedText =
          player.selected_pct != null ? `${player.selected_pct.toFixed(1)}%` : "–";
        const costRaw = player.now_cost != null ? Number(player.now_cost) : null;
        const costDisplay =
          costRaw != null && Number.isFinite(costRaw)
            ? (costRaw / 10).toFixed(1)
            : null;
        const oppShort = player.opponent_display || "N/A";
        const oppFull = player.opponent_raw || oppShort;
        const oppTone =
          player.opponent_tone || opponentStrengthTone(player.opponent_strength);
        const oppDisplay = oppFull || oppShort || "N/A";
        const droppable = dragInfo && dragInfo.type === "bench";
        const highlightAsTarget = swapModeActive || droppable;

        return (
          <div
            key={`${player.name}-${player.squadIndex}`}
            className="relative group flex flex-col items-center text-center text-[10px] sm:text-xs w-[76px] sm:w-[94px]"
            onClick={() => {
              if (onClickSwap) onClickSwap(player.squadIndex);
            }}
            onDragOver={(e) => {
              if (dragInfo && dragInfo.type === "bench") e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragInfo || dragInfo.type !== "bench") return;
              onDrop(dragInfo.squadIndex, player.squadIndex);
            }}
          >
            {highlightAsTarget && (
              <div
                className="absolute inset-x-1 -top-1 bottom-0 rounded-2xl pointer-events-none"
                style={{
                  border: "1px dashed rgba(251,191,36,0.4)",
                  boxShadow: "0 0 0 2px rgba(251,191,36,0.08)",
                }}
              />
            )}

            {droppable && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-amber-300/30 text-amber-200 whitespace-nowrap">
                Drop to swap
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openProfile && openProfile(player);
              }}
              className="absolute -top-1.5 right-0 p-1.5 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-sm"
              title="Open profile"
            >
              <CircleArrowRight size={14} className="text-emerald-700" />
            </button>

            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-20 hidden group-hover:flex flex-col items-center px-2 py-1 rounded-md bg-white border border-white/20 shadow-lg">
              <div className="text-[9px] text-slate-700">
                {label} • Sel {selectedText}
              </div>
              {costDisplay && (
                <div className="text-[9px] text-slate-700">£{costDisplay}m</div>
              )}
            </div>

            {hasPhoto ? (
              <img
                src={player.photo}
                alt={player.web_name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover bg-gray-700 shadow"
                onError={(e) => {
                  e.currentTarget.src = "";
                }}
              />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-800 shadow" />
            )}

            <div className="mt-1 font-semibold truncate max-w-[92px]">
              {player.web_name}
            </div>

            <div className="mt-0.5 flex flex-col items-center gap-0.5 w-full">
              <div
                className="px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-semibold leading-tight max-w-full"
                style={{
                  background: oppTone.badgeBg,
                  borderColor: oppTone.badgeBorder,
                  color: oppTone.badgeText,
                }}
                title={oppFull}
              >
                <span className="block truncate max-w-[70px] sm:max-w-[86px]">
                  {oppDisplay}
                </span>
              </div>
              <div className="px-1.5 py-0.5 rounded-full bg-gray-900/90 text-[9px] font-bold text-amber-300">
                {player.points_prediction.toFixed(1)} pts
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareCard({ title, player, accent = "amber", placeholder = "—" }) {
  const ring =
    accent === "emerald" ? "border-teal-400/30" : "border-amber-400/30";
  const titleColor =
    accent === "emerald" ? "text-teal-200" : "text-amber-200";

  return (
    <div className={`rounded-2xl border ${ring} bg-slate-50 p-3 min-w-0`}>
      <div className={`text-[10px] uppercase tracking-wide ${titleColor} mb-2`}>
        {title}
      </div>

      {!player ? (
        <div className="text-[11px] text-slate-500 py-5 text-center">
          {placeholder}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {player.photo ? (
            <img
              src={player.photo}
              alt={player.web_name}
              className="w-10 h-10 rounded-full object-cover bg-gray-800"
              onError={(e) => {
                e.currentTarget.src = "";
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-800" />
          )}

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{player.web_name}</div>

            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-600">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Price</div>
                <div className="font-semibold">
                  {player.price != null ? `£${Number(player.price).toFixed(1)}m` : "–"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Sel</div>
                <div className="font-semibold">
                  {player.selected_pct != null
                    ? `${Number(player.selected_pct).toFixed(1)}%`
                    : "–"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Pts</div>
                <div className="font-semibold">
                  {player.totalPoints != null
                    ? Number(player.totalPoints).toFixed(1)
                    : "–"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





