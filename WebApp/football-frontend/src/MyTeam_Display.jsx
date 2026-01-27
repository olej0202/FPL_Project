// src/pages/MyTeamOverview.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import teamShort from "./utils/team_short"; // adjust path if needed

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  ArrowLeftRight,
  MousePointerClick,
  Hand,
} from "lucide-react";
import { useMyteamData } from "./Contexts/MyTeamContext";
import { useStatsData } from "./Contexts/StatsContext";
import pitch from "./assets/pitch_lineup.png";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

// --- Opponent formatting helpers (teamShort mapping + DGW support) ---
const normalizeTeamKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getTeamShort = (teamNameOrCode) => {
  if (!teamNameOrCode) return null;

  // If it's already a short code like "ARS", keep it
  const raw = String(teamNameOrCode).trim();
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();

  // Direct match (common case)
  if (teamShort?.[raw]) return String(teamShort[raw]).toUpperCase();

  // Case-insensitive match against keys
  const target = normalizeTeamKey(raw);
  const key = Object.keys(teamShort || {}).find(
    (k) => normalizeTeamKey(k) === target
  );
  if (key) return String(teamShort[key]).toUpperCase();

  return null;
};

// Returns { opp1, opp2, display } where display is "OPP1" or "OPP1/OPP2"
const formatOpponent = (opponentValue) => {
  if (!opponentValue) return { opp1: "N/A", opp2: null, display: "N/A" };

  // If API ever gives an array for DGW
  const partsFromArray = Array.isArray(opponentValue)
    ? opponentValue
    : null;

  // Otherwise parse a string that might contain 2 opponents
  // Handles: "Team A / Team B", "Team A & Team B", "Team A, Team B", "Team A; Team B", "Team A and Team B"
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

// Compute default 11 starters given a squad and predictions
// respecting: exactly 1 GKP, at least 3 DEF, 2 MID, 1 FWD
function computeDefaultStartersIndices(squad, gw, playersData) {
  if (!Array.isArray(squad) || squad.length === 0) return [];

  const metadata = squad.map((player, idx) => {
    const prediction = playersData.find(
      (p) => p.name === player.name && Number(p.GW) === Number(gw)
    );
    const pts = prediction?.Points_prediction
      ? Number(prediction.Points_prediction)
      : 0;
    return { idx, pos: player.position, pts };
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

  // Minimum formation
  pickFrom(byPos.GKP, 1);
  pickFrom(byPos.DEF, 3);
  pickFrom(byPos.MID, 2);
  pickFrom(byPos.FWD, 1);

  // Count positions currently chosen
  let gkp = 0,
    def = 0,
    mid = 0,
    fwd = 0;

  chosen.forEach((idx) => {
    const pos = metadata.find((m) => m.idx === idx)?.pos;
    if (pos === "GKP") gkp++;
    else if (pos === "DEF") def++;
    else if (pos === "MID") mid++;
    else if (pos === "FWD") fwd++;
  });

  // Fill remaining by highest predicted points, but never >1 GKP
  const remaining = metadata
    .filter((m) => !chosen.has(m.idx))
    .sort((a, b) => b.pts - a.pts);

  for (const m of remaining) {
    if (chosen.size >= maxStarters) break;
    if (m.pos === "GKP" && gkp >= 1) continue; // only 1 GKP allowed
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
  const { fetchIfNeeded, PlayersData } = useStatsData();

  const [localTeamId, setLocalTeamId] = useState(teamId || "");
  const [showRankChart, setShowRankChart] = useState(false);
  const [showPredChart, setShowPredChart] = useState(false);
  const [currentGW, setCurrentGW] = useState(null);

  const [playersData, setPlayersData] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  // Per-GW 15-man squads
  const [gwSquads, setGwSquads] = useState({});
  // Per-GW starter indices
  const [gwStarters, setGwStarters] = useState({});

  // Transfer & money tracking
  const [bankByGw, setBankByGw] = useState({});
  const [freeTransfersByGw, setFreeTransfersByGw] = useState({});
  const [transferLog, setTransferLog] = useState([]);

  // Drag / tap state
  const [dragInfo, setDragInfo] = useState(null); // desktop drag
  const [selectedBenchIndex, setSelectedBenchIndex] = useState(null); // mobile tap

  // Player profile overlay
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [replacementMaxValue, setReplacementMaxValue] = useState(null);
  const [replacementSearch, setReplacementSearch] = useState("");

  // NEW: smoother comparison UX inside overlay
  const [compareCandidate, setCompareCandidate] = useState(null);

  // Keep localTeamId in sync with context teamId
  useEffect(() => {
    if (teamId) setLocalTeamId(teamId);
  }, [teamId]);

  // ---------- HYDRATE STATE FROM LOCALSTORAGE ----------
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
      if (
        parsed.freeTransfersByGw &&
        typeof parsed.freeTransfersByGw === "object"
      ) {
        setFreeTransfersByGw(parsed.freeTransfersByGw);
      }
      if (Array.isArray(parsed.transferLog)) {
        setTransferLog(parsed.transferLog);
      }
    } catch (err) {
      console.error("Failed to load planner state:", err);
    }
  }, [teamId]);

  // ---------- FETCH PLAYERS DATA ----------
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

  // ---------- FETCH TEAM DATA WHEN teamId CHANGES (NO LOOP) ----------
  useEffect(() => {
    if (teamId && !teamData) {
      fetchMyTeam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // ---------- AVAILABLE GWs & CURRENT GW ----------
  const availableGWs = useMemo(() => {
    if (!playersData || playersData.length === 0) return [];
    const gws = [
      ...new Set(
        playersData
          .map((p) => Number(p.GW))
          .filter((gw) => Number.isFinite(gw))
      ),
    ].sort((a, b) => a - b);
    return gws;
  }, [playersData]);

  const minAvailableGW = availableGWs.length > 0 ? availableGWs[0] : null;
  const maxAvailableGW =
    availableGWs.length > 0 ? availableGWs[availableGWs.length - 1] : null;

  useEffect(() => {
    if (availableGWs.length > 0 && currentGW === null) {
      setCurrentGW(availableGWs[0]);
    }
  }, [availableGWs, currentGW]);

  // Ensure base squad for current GW
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

  const getSquadForGw = (gw) => {
    if (gwSquads[gw]) return gwSquads[gw];
    if (teamData) return teamData;
    return [];
  };

  const getStarterIndicesForGw = (gw) => {
    const squad = getSquadForGw(gw);
    if (!squad.length) return [];
    if (!playersData.length) {
      return squad.slice(0, 11).map((_, idx) => idx);
    }
    const stored = gwStarters[gw];
    if (stored && stored.length) return stored;
    return computeDefaultStartersIndices(squad, gw, playersData);
  };

  // ---------- CURRENT SQUAD ----------
  const currentSquad = useMemo(() => {
    if (currentGW == null || !teamData) return [];
    return getSquadForGw(currentGW);
  }, [currentGW, gwSquads, teamData]);

  // To avoid suggested players already in squad
  const currentSquadNames = useMemo(
    () => new Set(currentSquad.map((p) => p.name)),
    [currentSquad]
  );

  // ---------- RANK PROGRESS CHART ----------
  const rankChartData = useMemo(() => {
    if (!teamData || !teamData[0]?.rank_progress) return [];
    return teamData[0].rank_progress.map((rank, index) => ({
      gw: index + 1,
      rank,
    }));
  }, [teamData]);

  // ---------- BASIC TEAM INFO ----------
  const teamInfo = teamData?.[0] || {};
  const baseMoneyInBank = teamInfo.money_in_bank_m ?? 0;
  const baseFreeTransfers = (teamInfo.saved_transfers ?? 0) + 1;

  const effectiveBankMoney =
    currentGW != null && bankByGw[currentGW] != null
      ? bankByGw[currentGW]
      : baseMoneyInBank;

  // Make sure free transfers for current GW exist following the rule:
  // FTs(gw0) = baseFreeTransfers
  // FTs(gw)  = max(1, FTs(prevGw) + 1)
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

  // ---------- MERGE SQUAD WITH PREDICTIONS (per GW) ----------
  const playersWithPredictions = useMemo(() => {
    if (
      !currentSquad ||
      currentSquad.length === 0 ||
      !playersData ||
      playersData.length === 0 ||
      currentGW === null
    ) {
      return [];
    }

    return currentSquad.map((player, squadIndex) => {
const rows = playersData.filter(
  (p) => p.name === player.name && Number(p.GW) === Number(currentGW)
);

// keep existing behavior for points (do NOT sum)
const prediction = rows[0];

// collect all opponents for DGW (unique, preserves order)
const oppList = Array.from(
  new Set(rows.map((r) => r.opponent_name).filter(Boolean))
);

const oppFmt = formatOpponent(oppList.length ? oppList : (prediction?.opponent_name || "N/A"));

let selectedPct = player.selected_pct;
if (selectedPct == null && prediction?.selected != null) {
  selectedPct = Number(prediction.selected) * 100;
}

const photo =
  prediction?.photo ?? prediction?.photo_url ?? player.photo ?? null;

return {
  ...player,
  squadIndex,
  photo,
  points_prediction: prediction?.Points_prediction
    ? Number(prediction.Points_prediction)
    : 0,

  opponent_raw: oppList.length ? oppList.join(" / ") : (prediction?.opponent_name || "N/A"),
  opponent_opp1: oppFmt.opp1,
  opponent_opp2: oppFmt.opp2,
  opponent_display: oppFmt.display,

  selected_pct: selectedPct,
  model_value: prediction?.value != null ? Number(prediction.value) : null,
};

    });
  }, [currentSquad, playersData, currentGW]);

  // ---------- PREDICTED POINTS (XI only, per GW) ----------
  const gwPointsMap = useMemo(() => {
    if (!teamData || !playersData || playersData.length === 0) return {};

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
        const prediction = playersData.find(
          (p) => p.name === player.name && Number(p.GW) === Number(gw)
        );
        if (prediction?.Points_prediction) {
          sum += Number(prediction.Points_prediction);
        }
      });

      map[gw] = sum;
    });

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableGWs, gwSquads, teamData, playersData, gwStarters]);

  const totalPredictedPoints = useMemo(
    () => Object.values(gwPointsMap).reduce((acc, val) => acc + (val || 0), 0),
    [gwPointsMap]
  );

  const predictedChartData = useMemo(() => {
    if (!availableGWs.length) return [];
    const futureGWs = availableGWs.filter((gw) => currentGW == null || gw >= currentGW);
    return futureGWs.map((gw) => ({
      gw,
      points: gwPointsMap[gw] || 0,
    }));
  }, [availableGWs, gwPointsMap, currentGW]);

  const currentGwPoints = currentGW != null ? gwPointsMap[currentGW] || 0 : null;

  // ---------- SWAP: BENCH -> FIELD (same team players) ----------
  const handleBenchToFieldSwap = useCallback(
    (gw, benchIndex, starterIndex) => {
      const squad = getSquadForGw(gw);
      if (!squad.length) return;

      const currentStarterIndices = getStarterIndicesForGw(gw);
      const starterSet = new Set(currentStarterIndices);

      if (!starterSet.has(starterIndex) || starterSet.has(benchIndex)) {
        return;
      }

      const newSet = new Set(starterSet);
      newSet.delete(starterIndex);
      newSet.add(benchIndex);

      // Check formation constraints: exactly 1 GKP, min 3 DEF, 2 MID, 1 FWD
      let gkp = 0,
        def = 0,
        mid = 0,
        fwd = 0;

      newSet.forEach((idx) => {
        const pos = squad[idx]?.position;
        if (pos === "GKP") gkp++;
        else if (pos === "DEF") def++;
        else if (pos === "MID") mid++;
        else if (pos === "FWD") fwd++;
      });

      if (gkp !== 1 || def < 3 || mid < 2 || fwd < 1) {
        return;
      }

      setGwStarters((prev) => ({
        ...prev,
        [gw]: Array.from(newSet),
      }));
    },
    // We intentionally depend on stable accessors; these are safe to include broadly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gwSquads, gwStarters, teamData, playersData]
  );

  // ---------- HELPER: RECOMPUTE STATE FROM TRANSFER LOG ----------
  const recomputeFromTransfers = (transfers) => {
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

    // Start squads from original teamData for all GWs
    const squads = {};
    availableGWs.forEach((gw) => {
      squads[gw] = teamData.map((p) => ({ ...p }));
    });

    // Apply transfers to squads + derive free transfers
    sortedTransfers.forEach((t) => {
      availableGWs.forEach((gw) => {
        if (gw < t.gw) return;
        const base = squads[gw];
        if (!base || !base[t.squadIndex]) return;

        const template = base[t.squadIndex];

        const incomingPrice = t.incomingPrice;
        const newRow = {
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

        base[t.squadIndex] = newRow;
      });
    });

    // Free transfers per GW following rule and subtracting transfers
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

    // Bank per GW: baseMoneyInBank + sum of deltas up to that GW
    const bankByGwNew = {};
    let runningBank = baseMoneyInBank;
    availableGWs.forEach((gw) => {
      const transfersInGw = sortedTransfers.filter((t) => t.gw === gw);
      transfersInGw.forEach((t) => {
        runningBank += t.sellingPrice - t.incomingPrice;
      });
      bankByGwNew[gw] = runningBank;
    });

    return { squads, bankByGw: bankByGwNew, freeTransfers };
  };

  // ---------- REPLACE WITH SUGGESTED PLAYER (PlayersData) ----------
  const handleReplaceWithSuggested = (suggestion) => {
    if (!profilePlayer || currentGW == null || !teamData) return;
    if (!availableGWs.length) return;

    const squadIndex = profilePlayer.squadIndex;
    if (squadIndex == null) return;

    // Determine outgoing player row from current GW snapshot
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
      id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
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
    const { squads, bankByGw: newBankByGw, freeTransfers } =
      recomputeFromTransfers(updatedTransfers);

    setTransferLog(updatedTransfers);
    setGwSquads(squads);
    setBankByGw(newBankByGw);
    setFreeTransfersByGw(freeTransfers);
    setProfilePlayer(null);
    setCompareCandidate(null);
  };

  // ---------- UNDO TRANSFER ----------
  const handleUndoTransfer = (id) => {
    const updatedTransfers = transferLog.filter((t) => t.id !== id);
    const { squads, bankByGw: newBankByGw, freeTransfers } =
      recomputeFromTransfers(updatedTransfers);

    setTransferLog(updatedTransfers);
    setGwSquads(squads);
    setBankByGw(newBankByGw);
    setFreeTransfersByGw(freeTransfers);
  };

  // ---------- PERSIST STATE TO LOCALSTORAGE ----------
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

  // ---------- NAV + TEAM ID ----------
  const handleSetTeamId = () => {
    if (!localTeamId) {
      alert("Please enter a Team ID");
      return;
    }

    // reset local GW state when switching / reloading team
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

    if (localTeamId !== teamId) {
      // new team id → clear any cached planner state for that team
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`myteam_planner_state_${localTeamId}`);
        } catch (err) {
          console.error("Failed to clear planner state:", err);
        }
      }
      // effect will trigger fetch
      setTeamId(localTeamId);
    } else {
      // same team id → manual refetch without touching teamId
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

  // ---------- PROFILE META: total predicted points from currentGW → maxGW ----------
  const profileMeta = useMemo(() => {
    if (!profilePlayer || !playersData.length || currentGW == null || maxAvailableGW == null)
      return null;

    const selFromPlayer = profilePlayer.selected_pct;
    let selFromData = null;

    const gwSet = new Set(
      availableGWs.filter((gw) => gw >= currentGW && gw <= maxAvailableGW)
    );

    let totalPred = 0;
    playersData.forEach((p) => {
      if (p.name !== profilePlayer.name) return;
      const gwNum = Number(p.GW);
      if (!gwSet.has(gwNum)) return;

      const pts = Number(p.Points_prediction) || 0;
      totalPred += pts;

      if (selFromData == null && p.selected != null) {
        selFromData = Number(p.selected) * 100;
      }
    });

    const selPct =
      selFromPlayer != null
        ? selFromPlayer
        : selFromData != null
        ? selFromData
        : null;

    const nowCost =
      profilePlayer.now_cost != null ? Number(profilePlayer.now_cost) / 10 : null;

    return { selPct, nowCost, totalPred };
  }, [profilePlayer, playersData, availableGWs, currentGW, maxAvailableGW]);


  // --- Pred points per GW for a player (do NOT sum multiple rows in same GW) ---
const getGwPointsForPlayer = useCallback(
  (playerName) => {
    const map = {};
    if (!playerName || !playersData.length) return map;

    availableGWs.forEach((gw) => {
      const rows = playersData.filter(
        (p) => p.name === playerName && Number(p.GW) === Number(gw)
      );

      const first = rows[0]; // IMPORTANT: do not sum
      map[gw] = first?.Points_prediction ? Number(first.Points_prediction) : 0;
    });

    return map;
  },
  [playersData, availableGWs]
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
    candidate: candMap ? (candMap[gw] ?? 0) : null,
  }));
}, [
  profilePlayer,
  compareCandidate,
  availableGWs,
  currentGW,
  maxAvailableGW,
  getGwPointsForPlayer,
]);


  // ---------- REPLACEMENTS ----------
  const replacementsMeta = useMemo(() => {
    if (!profilePlayer || !playersData.length || currentGW == null || maxAvailableGW == null) {
      return { minVal: 0, maxVal: 0, threshold: 0, list: [] };
    }

    const horizonGwSet = new Set(
      availableGWs.filter((gw) => gw >= currentGW && gw <= maxAvailableGW)
    );

    const samePosRows = playersData.filter((p) => p.position === profilePlayer.position);
    if (!samePosRows.length) {
      return { minVal: 0, maxVal: 0, threshold: 0, list: [] };
    }

    const map = {};
    samePosRows.forEach((p) => {
      if (currentSquadNames.has(p.name) && p.name !== profilePlayer.name) return;

      const gwNum = Number(p.GW);
      if (!horizonGwSet.has(gwNum)) return;

      const price = Number(p.value ?? p.price) || 0;
      const pts = Number(p.Points_prediction) || 0;
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
    if (!aggregated.length) return { minVal: 0, maxVal: 0, threshold: 0, list: [] };

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
  ]);

  // Initialize slider + reset search + compare when profilePlayer changes
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

  // Derived: list actually shown in UI
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

  // ✅ NEW: Swap-mode hooks MUST be before early returns
  const selectedBenchPlayer = useMemo(() => {
    if (selectedBenchIndex == null) return null;
    return (
      playersWithPredictions.find((p) => p.squadIndex === selectedBenchIndex) ||
      null
    );
  }, [selectedBenchIndex, playersWithPredictions]);

  const swapHintText = useMemo(() => {
    if (dragInfo && dragInfo.type === "bench")
      return "Dragging bench player… drop on a starter to swap";
    if (selectedBenchPlayer)
      return `Swap mode: tap a starter to swap with ${selectedBenchPlayer.web_name}`;
    return null;
  }, [dragInfo, selectedBenchPlayer]);

  const swapModeActive = !!swapHintText;

  const clearSwapMode = useCallback(() => {
    setSelectedBenchIndex(null);
    setDragInfo(null);
  }, []);

  // ---------- EARLY RETURNS ----------
  if (!teamId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
          color: PALETTE.beige,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-5 shadow-2xl"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
          }}
        >
          <h1 className="text-xl sm:text-2xl font-bold mb-3 text-center">
            Enter Your Team ID
          </h1>
          <input
            type="number"
            value={localTeamId}
            onChange={(e) => setLocalTeamId(e.target.value)}
            placeholder="Team ID"
            className="w-full h-10 px-3 rounded-md text-sm mb-3"
            style={{
              border: "1px solid rgba(248, 250, 252, 0.18)",
              backgroundColor: "rgba(0,0,0,0.75)",
              color: PALETTE.beige,
            }}
          />
          <button
            onClick={handleSetTeamId}
            className="w-full h-10 rounded-full font-semibold text-sm transition"
            style={{
              border: `1px solid ${PALETTE.gold}`,
              background: `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`,
              color: "#000000",
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
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-5 shadow-2xl text-center text-sm"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
          }}
        >
          Loading team and player predictions…
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
        }}
      >
        <div className="text-xl text-center">No team data available</div>
      </div>
    );
  }

  // ---------- SPLIT STARTERS / BENCH FOR CURRENT GW ----------
  const startersIdx = currentGW != null ? getStarterIndicesForGw(currentGW) : [];
  const startersIdxSet = new Set(startersIdx);

  const starters = playersWithPredictions.filter((p) =>
    startersIdxSet.has(p.squadIndex)
  );
  const bench = playersWithPredictions.filter((p) => !startersIdxSet.has(p.squadIndex));

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

  // ---------- MAIN LAYOUT ----------
  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              My Team Planner
            </h1>
            <p className="text-xs sm:text-sm mt-1" style={{ color: "#d1c3a9" }}>
              Swap bench ↔ starters (drag on desktop, tap-tap on mobile). Open
              player profiles for replacements and quick compare.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label
                className="text-[11px] uppercase tracking-wide"
                style={{ color: "#e5e7eb" }}
              >
                Team ID
              </label>
              <input
                type="number"
                value={localTeamId}
                onChange={(e) => setLocalTeamId(e.target.value)}
                className="flex-1 sm:flex-none h-9 px-3 rounded-md text-xs"
                style={{
                  border: "1px solid rgba(248, 250, 252, 0.18)",
                  backgroundColor: "rgba(0,0,0,0.75)",
                  color: PALETTE.beige,
                  minWidth: "120px",
                }}
              />
            </div>
            <button
              onClick={handleSetTeamId}
              className="inline-flex items-center justify-center px-3 h-9 rounded-full text-xs font-semibold"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background:
                  "linear-gradient(135deg, rgba(184,134,11,0.9), #facc15)",
                color: "#000000",
              }}
            >
              Load Team
            </button>
          </div>
        </header>

        {/* Top stats + charts */}
        <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Team Stats */}
          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{
              border: `1px solid ${PALETTE.gold}`,
              background:
                "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
              boxShadow: "0 18px 40px rgba(0,0,0,0.9)",
            }}
          >
            <h2 className="text-lg sm:text-xl font-semibold mb-4">
              Team Stats
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-lg p-3 sm:p-4 bg-black/40 border border-emerald-500/40">
                <div className="text-[11px] uppercase tracking-wide text-gray-300 mb-1">
                  Money in Bank
                </div>
                <div
                  className="text-xl sm:text-2xl font-bold"
                  style={{
                    color:
                      effectiveBankMoney < 0 ? "#f87171" : "#34d399",
                  }}
                >
                  £{effectiveBankMoney.toFixed(1)}m
                </div>
              </div>
              <div className="rounded-lg p-3 sm:p-4 bg-black/40 border border-blue-500/40">
                <div className="text-[11px] uppercase tracking-wide text-gray-300 mb-1">
                  Free Transfers (GW {currentGW ?? "-"})
                </div>
                <div className="text-xl sm:text-2xl font-bold text-blue-400">
                  {currentFreeTransfers}
                </div>
              </div>
              <div className="rounded-lg p-3 sm:p-4 bg-black/40 border border-purple-500/40 col-span-2 sm:col-span-1">
                <div className="text-[11px] uppercase tracking-wide text-gray-300 mb-1">
                  Total Predicted Points
                </div>
                <div className="text-xl sm:text-2xl font-bold text-purple-300">
                  {totalPredictedPoints.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg p-3 sm:p-4 bg-black/40 border border-amber-500/40">
                <div className="text-[11px] uppercase tracking-wide text-gray-300 mb-1">
                  GW Predicted Points
                </div>
                <div className="text-xl sm:text-2xl font-bold text-amber-300">
                  {currentGwPoints != null ? currentGwPoints.toFixed(1) : "-"}
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="flex flex-col gap-4">
            {/* Rank history */}
            <div
              className="rounded-2xl p-4 sm:p-5"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background:
                  "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
              }}
            >
              <button
                onClick={() => setShowRankChart(!showRankChart)}
                className="flex items-center justify-between w-full text-left rounded-md px-2 py-1"
                style={{
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  border: "1px solid rgba(148,163,184,0.4)",
                }}
              >
                <h2 className="text-sm sm:text-base font-semibold">
                  Season Rank History
                </h2>
                {showRankChart ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </button>

              {showRankChart && rankChartData.length > 0 && (
                <div className="mt-4" style={{ height: "220px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rankChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="gw" />
                      <YAxis reversed />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="rank"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {showRankChart && rankChartData.length === 0 && (
                <div className="mt-3 text-xs text-gray-400">
                  No rank history available yet.
                </div>
              )}
            </div>

            {/* Predicted points by GW */}
            <div
              className="rounded-2xl p-4 sm:p-5"
              style={{
                border: `1px solid ${PALETTE.gold}`,
                background:
                  "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
              }}
            >
              <button
                onClick={() => setShowPredChart(!showPredChart)}
                className="flex items-center justify-between w-full text-left rounded-md px-2 py-1"
                style={{
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  border: "1px solid rgba(148,163,184,0.4)",
                }}
              >
                <h2 className="text-sm sm:text-base font-semibold">
                  Predicted Points by GW
                </h2>
                {showPredChart ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </button>

              {showPredChart && predictedChartData.length > 0 && (
                <div className="mt-4" style={{ height: "220px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={predictedChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="gw" />
                      <YAxis domain={[40, "auto"]} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="points"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {showPredChart && predictedChartData.length === 0 && (
                <div className="mt-3 text-xs text-gray-400">
                  No prediction data available yet.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* GW Navigation + Pitch + Bench + Transfers */}
        <section
          className="rounded-2xl p-4 sm:p-5 mb-10"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.9)",
          }}
        >
          {/* GW nav */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">
                Squad for GW {currentGW ?? "-"}
              </h2>

              {/* NEW: inline “how to swap” cards */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 bg-black/55 p-2.5 text-[11px] text-gray-200">
                  <div className="flex items-center gap-2">
                    <Hand size={14} className="text-amber-300" />
                    <span className="font-semibold">Mobile</span>
                  </div>
                  <div className="text-gray-300 mt-0.5">
                    Tap a <span className="text-amber-200 font-semibold">bench</span> player, then tap a{" "}
                    <span className="text-amber-200 font-semibold">starter</span> to swap.
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/55 p-2.5 text-[11px] text-gray-200">
                  <div className="flex items-center gap-2">
                    <MousePointerClick size={14} className="text-amber-300" />
                    <span className="font-semibold">Desktop</span>
                  </div>
                  <div className="text-gray-300 mt-0.5">
                    Drag a bench player and <span className="text-amber-200 font-semibold">drop on a starter</span> to swap.
                  </div>
                </div>
              </div>

              <p className="text-[11px] mt-2" style={{ color: "#d1c3a9" }}>
                Use the{" "}
                <span className="inline-flex items-center gap-1">
                  <Info size={12} /> icon
                </span>{" "}
                to open profile & compare replacements (hover a suggestion to compare, click to transfer).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevGW}
                disabled={currentGW === null || availableGWs.indexOf(currentGW) === 0}
                className="p-2 rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  border: `1px solid ${PALETTE.gold}`,
                  backgroundColor: "rgba(0,0,0,0.8)",
                  color: PALETTE.gold,
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs sm:text-sm font-medium text-gray-200">
                {currentGW ? `Gameweek ${currentGW}` : "No GW selected"}
              </span>
              <button
                onClick={handleNextGW}
                disabled={
                  currentGW === null ||
                  availableGWs.indexOf(currentGW) === availableGWs.length - 1
                }
                className="p-2 rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  border: `1px solid ${PALETTE.gold}`,
                  backgroundColor: "rgba(0,0,0,0.8)",
                  color: PALETTE.gold,
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* ✅ NEW: Swap mode banner */}
          {swapHintText && (
            <div className="mb-4">
              <div
                className="rounded-xl border border-amber-400/40 bg-black/65 px-3 py-2 flex items-center justify-between gap-3"
                style={{ boxShadow: "0 10px 24px rgba(0,0,0,0.55)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowLeftRight size={16} className="text-amber-300" />
                  <div className="text-[12px] text-gray-100 truncate">
                    <span className="font-semibold">Swap</span>{" "}
                    <span className="text-gray-300">{swapHintText}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSwapMode}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-white/15 bg-black/70 hover:bg-black/90"
                >
                  <X size={12} className="text-gray-300" />
                  <span className="text-gray-200">Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Pitch + Bench */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch">
            {/* Pitch */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className="w-full max-w-[430px] mx-auto aspect-[9/15] sm:aspect-[2/3.1] bg-no-repeat bg-cover bg-center border border-white/40 rounded-xl px-2 py-2"
                style={{ backgroundImage: `url(${pitch})` }}
              >
                <div className="flex flex-col h-full pt-1 pb-2 gap-1 justify-start">
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
                        handleBenchToFieldSwap(currentGW, selectedBenchIndex, starterIdx);
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
                        handleBenchToFieldSwap(currentGW, selectedBenchIndex, starterIdx);
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
                        handleBenchToFieldSwap(currentGW, selectedBenchIndex, starterIdx);
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
                        handleBenchToFieldSwap(currentGW, selectedBenchIndex, starterIdx);
                        setSelectedBenchIndex(null);
                      }
                    }}
                    openProfile={handleOpenProfile}
                  />
                </div>
              </div>
            </div>

            {/* Bench */}
            <div className="w-full lg:w-[260px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Bench</h3>
                {selectedBenchIndex != null && (
                  <button
                    type="button"
                    onClick={() => setSelectedBenchIndex(null)}
                    className="text-[11px] px-2 py-1 rounded-full border border-white/15 bg-black/60 hover:bg-black/80"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {bench.length === 0 ? (
                <div className="text-xs text-gray-300">No bench players for this GW.</div>
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

                    const isSelected = selectedBenchIndex === player.squadIndex;

                    return (
                      <div
                        key={player.name + player.squadIndex}
                        className={`relative flex items-center gap-3 p-2.5 rounded-lg border transition
                          ${
                            isSelected
                              ? "border-amber-400 bg-black/85"
                              : "border-white/15 bg-black/60 hover:bg-black/70"
                          }`}
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
                          <div className="absolute inset-0 rounded-lg pointer-events-none ring-2 ring-amber-400/50" />
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProfile(player);
                          }}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-black/90"
                          title="Open profile"
                        >
                          <Info size={12} className="text-amber-300" />
                        </button>

                        {hasPhoto ? (
                          <img
                            src={player.photo}
                            alt={player.web_name}
                            className="w-10 h-10 rounded-full object-cover bg-gray-700 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = "";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0" />
                        )}

                        <div className="flex-1 min-w-0 pr-5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs truncate">
                              {player.web_name}
                            </span>
                            <span className="text-[11px] text-gray-300 whitespace-nowrap">
  {player.opponent_display || "N/A"}
</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 mt-0.5">
                            <span>
                              {(player.team || player.team_code || "")} •{" "}
                              {player.position}
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
                          <div className="text-[10px] text-gray-400">Pred</div>
                          <div className="text-sm font-bold text-purple-300">
                            {player.points_prediction.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-gray-300 mt-1">
                    Tip: selecting a bench player highlights starters on the pitch.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Transfer tracker under pitch */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
              Planned Transfers
              <span className="text-[10px] text-gray-300">(click ✕ to undo)</span>
            </h3>
            {sortedTransferLog.length === 0 ? (
              <div className="text-xs text-gray-300">No planned transfers yet.</div>
            ) : (
              <div className="space-y-1 text-xs">
                {sortedTransferLog.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border border-white/15 bg-black/70 px-2 py-1.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="font-semibold text-amber-200">GW {t.gw}</span>
                      <span className="text-gray-100">
                        {t.fromName} <span className="text-gray-400">→</span>{" "}
                        {t.toName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Bank Δ: {(t.sellingPrice - t.incomingPrice).toFixed(1)}m
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUndoTransfer(t.id)}
                      className="ml-2 p-1 rounded-full hover:bg-black/80"
                      aria-label="Undo transfer"
                    >
                      <X size={12} className="text-gray-300" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* PLAYER PROFILE OVERLAY */}
      {profilePlayer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={handleCloseProfile} />
          <div
            className="relative w-full max-w-4xl rounded-2xl p-4 sm:p-5 shadow-2xl"
            style={{
              border: `1px solid ${PALETTE.gold}`,
              background:
                "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.92))",
            }}
          >
            <button
              className="absolute top-2 right-2 p-1 rounded-full bg-black/70 hover:bg-black/90"
              onClick={handleCloseProfile}
            >
              <X size={14} className="text-gray-200" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              {profilePlayer.photo ? (
                <img
                  src={profilePlayer.photo}
                  alt={profilePlayer.web_name}
                  className="w-12 h-12 rounded-full object-cover bg-gray-800"
                  onError={(e) => {
                    e.currentTarget.src = "";
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">
                  {profilePlayer.web_name?.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm uppercase tracking-wide text-gray-400">
                  {profilePlayer.position}
                </div>
                <div className="text-lg font-bold truncate">
                  {profilePlayer.web_name}
                </div>
                <div className="text-xs text-gray-400">
                  {profilePlayer.team || profilePlayer.team_code || ""} • GW{" "}
                  {currentGW}
                </div>
              </div>
            </div>

            {/* Player stats */}
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              <div className="rounded-lg bg-black/70 border border-white/10 p-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">
                  Selected
                </div>
                <div className="text-sm font-semibold">
                  {profileMeta?.selPct != null
                    ? `${profileMeta.selPct.toFixed(1)}%`
                    : "–"}
                </div>
              </div>
              <div className="rounded-lg bg-black/70 border border-white/10 p-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">
                  Team Price
                </div>
                <div className="text-sm font-semibold">
                  {profileMeta?.nowCost != null
                    ? `£${profileMeta.nowCost.toFixed(1)}m`
                    : "–"}
                </div>
              </div>
              <div className="rounded-lg bg-black/70 border border-white/10 p-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">
                  Total Pred Pts
                </div>
                <div className="text-sm font-semibold">
                  {profileMeta ? profileMeta.totalPred.toFixed(1) : "–"}
                </div>
                <div className="text-[9px] text-gray-500">
                  GW {currentGW ?? "-"}–{maxAvailableGW ?? "-"}
                </div>
              </div>
            </div>

            {/* Compare panel */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wide text-gray-300">
                  Compare
                </span>
                <span className="text-[11px] text-gray-400">
                  Hover a suggestion to compare
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/60 p-2">
                <div className="grid grid-cols-2 gap-2">
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
                    placeholder="Hover a replacement"
                  />
                  {/* Per-GW predicted points comparison chart */}
<div className="mt-3 rounded-xl border border-white/10 bg-black/60 p-3">
  <div className="flex items-center justify-between mb-2">
    <span className="text-[11px] uppercase tracking-wide text-gray-300">
      Predicted points per GW
    </span>
    <span className="text-[11px] text-gray-400">
      GW {currentGW ?? "-"}–{maxAvailableGW ?? "-"}
    </span>
  </div>

  {compareChartData.length === 0 ? (
    <div className="text-xs text-gray-400">No chart data available.</div>
  ) : (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={compareChartData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="gw" />
  <YAxis tickFormatter={(v) => Number(v).toFixed(1)} />
  <Tooltip
  labelFormatter={(label) => `GW ${label}`}
  formatter={(value, name) => [Number(value).toFixed(1), name]}
/>

  <Legend />

  <Line
    type="monotone"
    dataKey="current"
    name={profilePlayer?.web_name || "Current"}
    stroke="#f59e0b"
    strokeWidth={2}
    dot={{ r: 2 }}
  />

  {compareCandidate && (
    <Line
      type="monotone"
      dataKey="candidate"
      name={compareCandidate?.web_name || "Candidate"}
      stroke="#10b981"
      strokeWidth={2}
      dot={{ r: 2 }}
    />
  )}
</LineChart>
      </ResponsiveContainer>
    </div>
  )}

  {!compareCandidate && (
    <div className="mt-2 text-[11px] text-gray-400">
      Click a replacement below to compare.
    </div>
  )}
</div>

                </div>

                {compareCandidate && (
                  <button
                    type="button"
                    onClick={() => handleReplaceWithSuggested(compareCandidate)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full text-xs font-semibold"
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

            {/* Slider + search + replacements */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wide text-gray-300">
                  Best replacements (same position)
                </span>
                {replacementsMeta.maxVal > replacementsMeta.minVal && (
                  <span className="text-[11px] text-gray-300">
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
                    onChange={(e) => setReplacementMaxValue(Number(e.target.value))}
                    className="w-full mb-2"
                  />
                  <input
                    type="text"
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder="Search name (e.g. Haaland, Salah...)"
                    className="w-full text-xs px-2 py-1 rounded-md bg-black/60 border border-white/10 text-gray-100 placeholder:text-gray-500"
                  />
                </>
              ) : (
                <div className="text-[11px] text-gray-400 mb-1">
                  No price data for this position.
                </div>
              )}
            </div>

            <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-black/60">
              {displayReplacements.length === 0 ? (
                <div className="p-3 text-xs text-gray-400">
                  No replacement suggestions found within the selected value range or search.
                </div>
              ) : (
                <ul className="divide-y divide-white/5 text-xs">
                  {displayReplacements.map((p) => {
                    const oppShort = formatOpponent(p.opponent).display;

                    const isCompared = compareCandidate?.name === p.name;

                    return (
                      <li
                        key={p.id + p.name}
                        className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition ${
                          isCompared ? "bg-emerald-500/10" : "hover:bg-white/5"
                        }`}
                        onClick={() => setCompareCandidate(p)}
          title="Click to compare"

                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {p.photo ? (
                            <img
                              src={p.photo}
                              alt={p.web_name}
                              className="w-8 h-8 rounded-full object-cover bg-gray-700 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = "";
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">
                              {p.web_name?.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold truncate max-w-[140px] flex items-center gap-2">
                              <span className="truncate">{p.web_name}</span>
                              {isCompared && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-400/40 bg-black/50 text-emerald-200">
                                  comparing
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              £{p.price.toFixed(1)}m • {oppShort}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400">Total Pts</div>
                          <div className="text-sm font-bold text-amber-300">
                            {p.totalPoints.toFixed(1)}
                          </div>
                          <div className="text-[10px] text-gray-400">
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

            <div className="mt-2 text-[11px] text-gray-400">
              Click a row to compare. Transfer using the button above.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Pitch row (GKP / DEF / MID / FWD) ----------
function PitchRow({ players, label, dragInfo, swapModeActive, onDrop, onClickSwap, openProfile }) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3 px-1">
      {players.map((player) => {
        const hasPhoto = !!player.photo;

        const selectedText =
          player.selected_pct != null ? `${player.selected_pct.toFixed(1)}%` : "–";

        const costRaw = player.now_cost != null ? Number(player.now_cost) : null;
        const costDisplay =
          costRaw != null && Number.isFinite(costRaw) ? (costRaw / 10).toFixed(1) : null;

        const oppShort = player.opponent_display || "N/A";


        const droppable = dragInfo && dragInfo.type === "bench";
        const highlightAsTarget = swapModeActive || droppable;

        return (
          <div
            key={player.name + player.squadIndex}
            className="relative group flex flex-col items-center text-center text-[10px] sm:text-xs w-[68px] sm:w-[80px]"
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
            {/* Target highlight ring */}
            {highlightAsTarget && (
              <div
                className="absolute inset-x-1 -top-1 bottom-0 rounded-xl pointer-events-none"
                style={{
                  border: "1px dashed rgba(251,191,36,0.45)",
                  boxShadow: "0 0 0 2px rgba(251,191,36,0.12)",
                }}
              />
            )}

            {/* Drop hint */}
            {droppable && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-black/80 border border-amber-300/30 text-amber-200">
                Drop to swap
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openProfile && openProfile(player);
              }}
              className="absolute -top-1 right-0 p-1 rounded-full bg-black/70 hover:bg-black/90"
              title="Open profile"
            >
              <Info size={11} className="text-amber-300" />
            </button>

            {/* Hover tooltip (desktop) */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-20 hidden group-hover:flex flex-col items-center px-2 py-1 rounded-md bg-black/80 border border-white/20 shadow-lg">
              <div className="text-[9px] text-gray-200">
                {label} • Sel {selectedText}
              </div>
              {costDisplay && (
                <div className="text-[9px] text-gray-200">£{costDisplay}m</div>
              )}
            </div>

            {/* Avatar */}
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

            {/* Main visible info */}
            <div className="mt-1 font-semibold truncate max-w-[80px]">
              {player.web_name}
            </div>

            <div className="mt-0.5 flex flex-col items-center gap-0.5">
              <div className="px-1.5 py-0.5 rounded-full bg-gray-800/85 text-[9px] text-gray-100">
                {oppShort}
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

// ---------- Compare Card ----------
function CompareCard({ title, player, accent = "amber", placeholder = "—" }) {
  const ring = accent === "emerald" ? "border-emerald-400/30" : "border-amber-400/30";
  const titleColor = accent === "emerald" ? "text-emerald-200" : "text-amber-200";

  return (
    <div className={`rounded-xl border ${ring} bg-black/55 p-2 min-w-0`}>
      <div className={`text-[10px] uppercase tracking-wide ${titleColor} mb-1`}>
        {title}
      </div>

      {!player ? (
        <div className="text-[11px] text-gray-400 py-5 text-center">{placeholder}</div>
      ) : (
        <div className="flex items-center gap-2">
          {player.photo ? (
            <img
              src={player.photo}
              alt={player.web_name}
              className="w-9 h-9 rounded-full object-cover bg-gray-800"
              onError={(e) => {
                e.currentTarget.src = "";
              }}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-800" />
          )}

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{player.web_name}</div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-gray-300">
              <div className="rounded-md bg-black/60 border border-white/10 px-1.5 py-1">
                <div className="text-[9px] text-gray-400">Price</div>
                <div className="font-semibold">
                  {player.price != null ? `£${Number(player.price).toFixed(1)}m` : "–"}
                </div>
              </div>
              <div className="rounded-md bg-black/60 border border-white/10 px-1.5 py-1">
                <div className="text-[9px] text-gray-400">Sel</div>
                <div className="font-semibold">
                  {player.selected_pct != null
                    ? `${Number(player.selected_pct).toFixed(1)}%`
                    : "–"}
                </div>
              </div>
              <div className="rounded-md bg-black/60 border border-white/10 px-1.5 py-1">
                <div className="text-[9px] text-gray-400">Pts</div>
                <div className="font-semibold">
                  {player.totalPoints != null ? Number(player.totalPoints).toFixed(1) : "–"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
