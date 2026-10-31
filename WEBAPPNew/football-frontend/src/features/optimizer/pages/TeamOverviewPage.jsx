// src/pages/MyTeamOverview.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronLeft, ChevronRight, CircleArrowRight, X, ArrowLeftRight, MousePointerClick, DollarSign, Sparkles } from "lucide-react";
import { useAdjustmentData } from "../../../Contexts/AdjustmentsContext.jsx";
import { useMyteamData } from "../../../Contexts/MyTeamContext.jsx";
import { useStatsData } from "../../../Contexts/StatsContext.jsx";
import pitch from "../../../assets/Pitch3.png";
import {
  PALETTE,
  pageBg,
  glassCard,
  softCard,
  inputStyle,
  formatOpponent,
  buildOpponentStrengthLookup,
  opponentStrengthTone,
  lookupStrengthForOpponent,
  computeDefaultStartersIndices
} from '../utils/teamOverview.js';
import {
  ChartCard,
  SquadMetricCard,
  PitchRow,
  CompareCard
} from '../components/TeamOverviewComponents.jsx';

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
    } catch { /* Private browsing may make local storage unavailable. */ }

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
