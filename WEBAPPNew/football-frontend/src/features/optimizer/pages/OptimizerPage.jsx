import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ArrowRight, Search, BookmarkPlus, Sparkles, Shield, Trophy, Brain, SlidersHorizontal, Save, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Users, Target, Wand2, PencilLine, RefreshCw, Ban, CheckCircle2, CircleDashed, Zap, Lock, GitBranch, ZoomIn, ZoomOut } from "lucide-react";
import { useMyteamData } from "../../../Contexts/MyTeamContext.jsx";
import { BASE_SCENARIO_ID, useAdjustmentData } from "../../../Contexts/AdjustmentsContext.jsx";
import { useOptimizationModel } from "../../../Contexts/OptimizationModelContext.jsx";
import { useStatsData } from "../../../Contexts/StatsContext.jsx";
import ScenarioSelect, { ScenarioColorDot } from "../../../components/ScenarioSelect.jsx";
import { DEFAULT_TREE_SETTINGS, shareDecisionPlanEdits, getNodePath, resolvePlanningPath, plansForPath, migrateNodePlans, completeTreeHorizons, alignTreeResultPaths, extendTreeToResultHorizon } from "../../../utils/treeWorkspace.js";
import useCanvasPan from "../../../hooks/useCanvasPan.js";
import TreeNodePitch from "../../../components/TreeNodePitch.jsx";
import { accountTransfers, transferPenaltyPoints } from "../../../utils/transferAccounting.js";
import usePlanningGameweeks from "../hooks/usePlanningGameweeks";
import { advancePlanningTrees } from "../../../utils/planningGameweeks.js";
import { PALETTE } from '../theme.js';
import { isValidGW, buildNewTreeNodes, TREE_NODE_WIDTH, TREE_NODE_HEIGHT, TREE_COMPACT_NODE_HEIGHT, TREE_ZOOM_MIN, TREE_ZOOM_MAX, TREE_ZOOM_STEP, TREE_COMPACT_ZOOM, buildTreeChildrenMap, getTreeLeafIds, ensureTreeStartAnchor, TREE_WORKSPACE_STORAGE_KEY, readStoredTreeWorkspace, syncTreeMasses, buildVerticalTreeLayout, buildStatisticalPlayerPayload, compareStatisticalPlayerPayloads, normalizeLoosePlayerKey, getPlayerIdentityCandidates, playerGwKey, loosePlayerGwKey, teamGwKey, getTeamShort, formatOpponent, toFiniteNumber, cleanOpponentValue, getFixtureVenue, getRowPredictedPoints, MEASURE_OPTIONS, getRowMeasureValue, formatMeasureValue, getRowPrice, getPlayerDisplayName, getPlayerCanonicalName, normalizePosition, getPlayerPhoto, getPlayerStatus, canSwitchPlayerRows, buildTransferPairs, transferPairKey, manualTransferMatchesPair, buildOpponentStrengthLookup, splitOpponentParts, lookupStrengthForOpponent, opponentStrengthTone } from '../utils/workspaceHelpers.js';
import { TopStat, FieldShell, ModelButton, PreferenceSlider } from '../components/OptimizerControls.jsx';
import { TreeTransferRow, TransferRow } from '../components/SquadPresentation.jsx';
import '../optimizer.css';
import OptimizerWorkspaceLayout, { SquadPitchLayout } from '../components/OptimizerWorkspaceLayout';
import PitchGameweekNavigation from '../components/PitchGameweekNavigation';

export default function MyTeamOptimize({ splitView = true }) {
  const {
    teamId,
    setTeamId,
    bannedList,
    data,
    treeOptimizationResults = {},
    setTreeOptimizationResults,
    optimizingTreeRootId = "",
    clearTreeOptimization,
    loading,
    optimizationProgress,
    fetchTeam,
    toggleBan,
    removeBan,
    has_changed,
    sethas_changed,
    bannedPlayersData,
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
  const { planningEvents, planningError, firstPlanningGw } = usePlanningGameweeks(
    Number(teamData?.[0]?.gw ?? teamData?.[0]?.GW)
  );
  const initialTreeWorkspaceRef = useRef(null);
  if (!initialTreeWorkspaceRef.current) {
    initialTreeWorkspaceRef.current = readStoredTreeWorkspace(firstPlanningGw);
  }

  const { modelType: initialModelType } = useOptimizationModel();
  const [solverScenarioId, setSolverScenarioId] = useState(BASE_SCENARIO_ID);
  const [optParamsOpen, setOptParamsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveHint, setSaveHint] = useState("");
  const [activeSavedId, setActiveSavedId] = useState(null);
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [treeEditorOpen, setTreeEditorOpen] = useState(initialTreeWorkspaceRef.current.treeEditorOpen);
  const [savedOpen, setSavedOpen] = useState(false);
  const treeMode = true;
  const [treeNodes, setRawTreeNodes] = useState(() => completeTreeHorizons(initialTreeWorkspaceRef.current.nodes.map((node, index) => node.parentId ? node : {
    ...node,
    treeName: node.treeName ?? `Tree ${initialTreeWorkspaceRef.current.nodes.slice(0, index + 1).filter((candidate) => !candidate.parentId).length}`,
    optimization: { ...DEFAULT_TREE_SETTINGS, modelType: initialModelType, ...node.optimization },
  })));
  const setTreeNodes = useCallback((updater) => setRawTreeNodes((previous) => {
    const next = typeof updater === "function" ? updater(previous) : updater;
    return completeTreeHorizons(next);
  }), []);
  const [treeNodePositions, setTreeNodePositions] = useState(initialTreeWorkspaceRef.current.positions);
  const [treeZoom, setTreeZoom] = useState(initialTreeWorkspaceRef.current.zoom);
  const [activeTreeRootId, setActiveTreeRootId] = useState(
    initialTreeWorkspaceRef.current.activeTreeRootId
  );
  const [expandedCompactTreeNodeId, setExpandedCompactTreeNodeId] = useState("");
  const [draggingTreeNode, setDraggingTreeNode] = useState(null);
  const [selectedTreeBranchId, setSelectedTreeBranchId] = useState("");
  const [nodePlans, setRawNodePlans] = useState({});
  const setNodePlans = useCallback((updater) => setRawNodePlans((previous) => {
    if (typeof updater !== "function") return updater;
    return shareDecisionPlanEdits(previous, updater(previous), treeNodes);
  }), [treeNodes]);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState("");
  const activeRoot = treeNodes.find((node) => node.id === activeTreeRootId);
  const treeName = activeRoot?.treeName ?? `Tree ${treeNodes.filter((node) => !node.parentId).findIndex((node) => node.id === activeTreeRootId) + 1}`;
  const settings = { ...DEFAULT_TREE_SETTINGS, modelType: initialModelType, ...activeRoot?.optimization };
  const { modelType, risk, valtrans, n_hits } = settings;
  const updateTreeSettings = useCallback((patch) => {
    setTreeNodes((previous) => previous.map((node) => node.id === activeTreeRootId
      ? { ...node, optimization: { ...DEFAULT_TREE_SETTINGS, modelType: initialModelType, ...node.optimization, ...patch } } : node));
  }, [activeTreeRootId, initialModelType, setTreeNodes]);
  const setModelType = useCallback((value) => updateTreeSettings({ modelType: value }), [updateTreeSettings]);
  const setRisk = (value) => updateTreeSettings({ risk: value });
  const setValtrans = (value) => updateTreeSettings({ valtrans: value });
  const planningPath = useMemo(() => resolvePlanningPath(treeNodes, activeTreeRootId, selectedTreeNodeId, selectedTreeBranchId), [treeNodes, activeTreeRootId, selectedTreeNodeId, selectedTreeBranchId]);
  const activeTreeNode = planningPath.find((node) => node.id === selectedTreeNodeId) || planningPath[0];
  const selectedGW = activeTreeNode?.gw ?? null;
  const manualPlan = useMemo(() => plansForPath(nodePlans, planningPath), [nodePlans, planningPath]);
  const setManualPlan = useCallback((updater) => {
    setNodePlans((previous) => {
      const scoped = plansForPath(previous, planningPath);
      const next = typeof updater === "function" ? updater(scoped) : updater;
      const result = { ...previous };
      planningPath.forEach((node) => {
        if (next[String(node.gw)]) result[node.id] = next[String(node.gw)];
        else delete result[node.id];
      });
      return result;
    });
  }, [planningPath, setNodePlans]);
  useEffect(() => {
    setNodePlans((previous) => {
      const ids = new Set(treeNodes.map((node) => node.id));
      const result = Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id)));
      let changed = Object.keys(result).length !== Object.keys(previous).length;
      treeNodes.forEach((node) => {
        if (!node.parentId || result[node.id]) return;
        const peer = treeNodes.find((other) => other.parentId === node.parentId && previous[other.id]);
        if (peer) { result[node.id] = previous[peer.id]; changed = true; }
      });
      return changed ? result : previous;
    });
  }, [treeNodes, setNodePlans]);
  const bbRound = planningPath.find((node) => node.chip === "bench_boost")?.gw;
  const wildRound = planningPath.find((node) => node.chip === "wildcard")?.gw;
  const freehitROund = planningPath.find((node) => node.chip === "freehit")?.gw;
  const [transferOutName, setTransferOutName] = useState("");
  const [transferInKey, setTransferInKey] = useState("");
  const [teamMeasure, setTeamMeasure] = useState("points");
  const [transferOutSearch, setTransferOutSearch] = useState("");
  const [transferOutPickerOpen, setTransferOutPickerOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  const [hiddenModelTransferKeys, setHiddenModelTransferKeys] = useState([]);
  const [planStorageReady, setPlanStorageReady] = useState(false);
  const pitchSectionRef = useRef(null);
  const transferEditorRef = useRef(null);
  const treeCanvasRef = useRef(null);
  const centeredMobileTreeRef = useRef("");
  const treeCanvasPan = useCanvasPan({ viewportRef: treeCanvasRef, zoom: treeZoom, onZoom: setTreeZoom, minZoom: TREE_ZOOM_MIN, maxZoom: TREE_ZOOM_MAX });
  const pendingTreePositionsRef = useRef(null);
  const restoredTreePositionsRef = useRef(
    Object.keys(initialTreeWorkspaceRef.current.positions || {}).length > 0
  );
  const preferredModelAppliedRef = useRef(false);
  const loadedPlanStorageKeyRef = useRef(null);
  const pendingSavedManualPlanRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TREE_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          enabled: treeMode,
          treeEditorOpen,
          nodes: treeNodes.map((node) => node.parentId ? node : { ...node, optimization: { ...DEFAULT_TREE_SETTINGS, modelType: initialModelType, ...node.optimization } }),
          positions: treeNodePositions,
          zoom: treeZoom,
          activeTreeRootId,
        })
      );
    } catch (error) {
      console.warn("Could not persist optimizer tree workspace:", error);
    }
  }, [activeTreeRootId, treeEditorOpen, treeMode, treeNodePositions, treeNodes, treeZoom, initialModelType]);

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
        setNodePlans(pendingSavedManualPlanRef.current);
        pendingSavedManualPlanRef.current = null;
        setHiddenModelTransferKeys([]);
      } else {
        const raw = window.localStorage.getItem(manualPlanStorageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        setNodePlans(migrateNodePlans(parsed?.nodePlans || parsed?.manualPlan || {}, treeNodes, activeTreeRootId));
        setHiddenModelTransferKeys(Array.isArray(parsed?.hiddenModelTransferKeys) ? parsed.hiddenModelTransferKeys : []);
      }
    } catch (err) {
      console.warn("Failed loading optimize lab plan:", err);
      setNodePlans({});
      setHiddenModelTransferKeys([]);
    } finally {
      loadedPlanStorageKeyRef.current = manualPlanStorageKey;
      setPlanStorageReady(true);
    }
    // Hydrate only when the team changes; node edits are persisted by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPlanStorageKey]);

  useEffect(() => {
    if (!planStorageReady || typeof window === "undefined") return;
    if (loadedPlanStorageKeyRef.current !== manualPlanStorageKey) return;
    try {
      window.localStorage.setItem(
        manualPlanStorageKey,
        JSON.stringify({ nodePlans, hiddenModelTransferKeys })
      );
    } catch (err) {
      console.warn("Failed saving optimize lab plan:", err);
    }
  }, [hiddenModelTransferKeys, nodePlans, manualPlanStorageKey, planStorageReady]);

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
        const venue = getFixtureVenue(r);
        playerKeys.forEach((playerName) => {
          const key = playerGwKey(playerName, gw);
          const bucket = map.get(key) || { opponents: new Set(), venues: new Set() };
          if (parts.length) parts.forEach((p) => bucket.opponents.add(p));
          else bucket.opponents.add(String(opp));
          if (venue) bucket.venues.add(venue);
          map.set(key, bucket);
        });
      });
    };

    addRows(Playerdata?.current);
    addRows(PlayersData?.current);
    addRows(data);

    const out = new Map();
    map.forEach((bucket, key) => {
      const values = Array.from(bucket.opponents).filter(Boolean);
      const venues = Array.from(bucket.venues).filter(Boolean);
      if (values.length) {
        out.set(key, {
          opponent: values.join(" / "),
          venue: venues.length ? venues.join("/") : null,
        });
      }
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

        const venue = getFixtureVenue(r);
        candidates.forEach((cand) => {
          out.set(teamGwKey(cand, gw), { opponent: String(opp), venue });
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
      let venueFromPlayerGw = null;
      for (const playerCand of playerCandidates) {
        const hit = opponentByPlayerGw.get(playerGwKey(playerCand, row?.GW));
        if (hit) {
          fallbackFromPlayerGw = hit.opponent;
          venueFromPlayerGw = hit.venue;
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
      let venueFromTeamGw = null;
      for (const teamCand of teamCandidates) {
        const hit = opponentByTeamGw.get(teamGwKey(teamCand, row?.GW));
        if (hit) {
          fallbackFromTeamGw = hit.opponent;
          venueFromTeamGw = hit.venue;
          break;
        }
      }

      const rawOpponent = rawFromRow || fallbackFromPlayerGw || fallbackFromTeamGw || "N/A";
      const venue = getFixtureVenue(row) || venueFromPlayerGw || venueFromTeamGw;
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
        venue,
        tone: opponentStrengthTone(strength),
      };
    },
    [opponentStrengthLookup, opponentByPlayerGw, opponentByTeamGw]
  );

  

  

  useEffect(() => {
    const shouldPreferStat = location.state?.preferModel === "statistical";
    if (!shouldPreferStat || preferredModelAppliedRef.current) return;

    if (hasStatisticalData) {
      setModelType("statistical");
      preferredModelAppliedRef.current = true;
    }
  }, [location.state, hasStatisticalData, setModelType]);

  useEffect(() => {
    sethas_changed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, bbRound, wildRound, bannedList, freehitROund, n_hits, modelType, solverScenarioId, risk, valtrans, treeMode, treeNodes, activeTreeRootId]);

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

  const optimizationDisplayData = useMemo(() => {
    if (!treeMode) return Array.isArray(data) ? data : [];
    if (optimizingTreeRootId === activeTreeRootId && optimizationProgress?.streaming) {
      return alignTreeResultPaths(Array.isArray(data) ? data : [], treeNodes);
    }
    const cachedRows = treeOptimizationResults[activeTreeRootId]?.rows;
    return alignTreeResultPaths(Array.isArray(cachedRows) ? cachedRows : [], treeNodes);
  }, [
    activeTreeRootId,
    data,
    optimizationProgress?.streaming,
    optimizingTreeRootId,
    treeMode,
    treeOptimizationResults,
    treeNodes,
  ]);

  useEffect(() => {
    setTreeNodes((previous) => {
      let next = previous;
      Object.entries(treeOptimizationResults).forEach(([rootId, result]) => {
        next = extendTreeToResultHorizon(next, rootId, result.rows);
      });
      if (optimizingTreeRootId && data?.some((row) => String(row.tree_path_node_ids || "").split(">").includes(optimizingTreeRootId))) {
        next = extendTreeToResultHorizon(next, optimizingTreeRootId, data);
      }
      return next;
    });
  }, [treeOptimizationResults, optimizingTreeRootId, data, setTreeNodes]);

  const treeBranches = useMemo(() => {
    if (!Array.isArray(optimizationDisplayData) || optimizationDisplayData.length === 0) return [];
    const byId = new Map();
    optimizationDisplayData.forEach((row) => {
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
        pathNodeIds: String(row?.tree_path_node_ids || "")
          .split(">")
          .map((nodeId) => nodeId.trim())
          .filter(Boolean),
      });
    });
    return Array.from(byId.values());
  }, [optimizationDisplayData]);

  const optimizedPointsByTreeNode = useMemo(() => {
    const totals = new Map();
    const rowsByTree = { ...treeOptimizationResults };
    if (optimizingTreeRootId && optimizationProgress?.streaming) {
      rowsByTree[optimizingTreeRootId] = { rows: Array.isArray(data) ? data : [] };
    }
    Object.entries(rowsByTree).forEach(([treeRootId, result]) => {
      const seenBranches = new Set();
      (Array.isArray(result?.rows) ? result.rows : []).forEach((row) => {
        const branchId = String(row?.tree_branch_id || "").trim();
        const branchKey = `${treeRootId}:${branchId}`;
        if (!branchId || seenBranches.has(branchKey)) return;
        seenBranches.add(branchKey);
        const points = Number(row?.tree_branch_expected_points);
        if (!Number.isFinite(points)) return;
        const rawProbability = Number(row?.tree_branch_probability);
        const probability = Number.isFinite(rawProbability) && rawProbability > 0
          ? rawProbability
          : 1;
        String(row?.tree_path_node_ids || "")
          .split(">")
          .map((nodeId) => nodeId.trim())
          .filter(Boolean)
          .forEach((nodeId) => {
            const current = totals.get(nodeId) || { weightedPoints: 0, probability: 0 };
            current.weightedPoints += probability * points;
            current.probability += probability;
            totals.set(nodeId, current);
          });
      });
    });
    return new Map(
      Array.from(totals.entries()).map(([nodeId, total]) => [
        nodeId,
        total.probability > 0 ? total.weightedPoints / total.probability : null,
      ])
    );
  }, [data, optimizationProgress?.streaming, optimizingTreeRootId, treeOptimizationResults]);

  const branchScopedData = useMemo(() => {
    if (!Array.isArray(optimizationDisplayData) || optimizationDisplayData.length === 0) return [];
    if (!treeBranches.length) return optimizationDisplayData;
    const branchId = treeBranches.some((branch) => branch.id === selectedTreeBranchId && branch.pathNodeIds.includes(activeTreeNode?.id))
      ? selectedTreeBranchId
      : treeBranches.find((branch) => branch.id === planningPath.at(-1)?.id)?.id;
    return optimizationDisplayData.filter((row) => String(row?.tree_branch_id || "") === branchId);
  }, [optimizationDisplayData, selectedTreeBranchId, treeBranches, activeTreeNode?.id, planningPath]);

  const activeSolutionData = useMemo(() => {
    const solution = Number(branchScopedData[0]?.solution || 1);
    return branchScopedData.filter((row) => Number(row?.solution || 1) === solution);
  }, [branchScopedData]);

  const loadedTeamPitchRows = useMemo(() => {
    if (!Array.isArray(teamData) || teamData.length === 0) return [];

    const startGw = firstPlanningGw;
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
  }, [teamData, firstPlanningGw]);

  const pitchSourceData = activeSolutionData.length > 0
    ? activeSolutionData
    : loadedTeamPitchRows;

  const availableGWs = useMemo(() => planningPath.map((node) => Number(node.gw)), [planningPath]);

  useEffect(() => {
    if (!isValidGW(firstPlanningGw)) return;
    setTreeNodes((previous) => {
      if (!previous.length) return buildNewTreeNodes("tree", firstPlanningGw);
      return advancePlanningTrees(previous, firstPlanningGw);
    });
  }, [firstPlanningGw, treeNodes, setTreeNodes]);

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
  const pathStatisticalPlayers = useMemo(() => planningPath.flatMap((node) =>
    buildStatisticalPlayerPayload(getScenarioPlayerData(treeEffectiveScenarioById.get(node.id) || BASE_SCENARIO_ID))
      .filter((row) => Number(row.GW) === Number(node.gw))
  ), [planningPath, treeEffectiveScenarioById, getScenarioPlayerData]);

  const projectionSourceBuckets = useMemo(() => {
    return modelType === "statistical"
      ? [pathStatisticalPlayers]
      : [aiProjectionRows];
  }, [modelType, pathStatisticalPlayers, aiProjectionRows]);

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


  const activeGW =
    Number.isFinite(selectedGW) && availableGWs.includes(selectedGW)
      ? selectedGW
      : availableGWs[0] ?? null;
  const activePlanKey = Number.isFinite(Number(activeGW)) ? String(Number(activeGW)) : "";
  const activeManualPlan = activePlanKey ? manualPlan[activePlanKey] || {} : {};
  const manualTransfers = Array.isArray(activeManualPlan.transfers)
    ? activeManualPlan.transfers
    : [];
  const hasPendingManualTransfers = useMemo(
    () =>
      treeNodes.filter((node) => getNodePath(treeNodes, node.id)[0]?.id === activeTreeRootId)
        .flatMap((node) => nodePlans[node.id]?.transfers || [])
        .some((transfer) => !transfer?.isLocked),
    [treeNodes, nodePlans, activeTreeRootId]
  );
  const treeChildrenByParent = useMemo(() => buildTreeChildrenMap(treeNodes), [treeNodes]);
  const selectedBranchStart = [...planningPath].reverse().find(
    (node) => (treeChildrenByParent.get(node.parentId) || []).length > 1
  );
  const syncedTreeNodes = useMemo(() => syncTreeMasses(treeNodes), [treeNodes]);
  const treeRootByNodeId = useMemo(() => {
    const nodeById = new Map(treeNodes.map((node) => [node.id, node]));
    const roots = new Map();
    const resolveRoot = (node) => {
      if (!node) return null;
      if (roots.has(node.id)) return roots.get(node.id);
      const rootId = node.parentId ? resolveRoot(nodeById.get(node.parentId)) : node.id;
      roots.set(node.id, rootId);
      return rootId;
    };
    treeNodes.forEach(resolveRoot);
    return roots;
  }, [treeNodes]);
  const treeRootIds = useMemo(
    () => treeNodes.filter((node) => !node.parentId).map((node) => node.id),
    [treeNodes]
  );
  const syncedActiveTreeNodes = useMemo(
    () => syncedTreeNodes.filter((node) => treeRootByNodeId.get(node.id) === activeTreeRootId),
    [activeTreeRootId, syncedTreeNodes, treeRootByNodeId]
  );
  useEffect(() => {
    if (!treeRootIds.includes(activeTreeRootId) && treeRootIds.length > 0) {
      setActiveTreeRootId(treeRootIds[0]);
    }
  }, [activeTreeRootId, treeRootIds]);
  const treeMassById = useMemo(
    () => new Map(syncedTreeNodes.map((node) => [node.id, Number(node.probability) || 0])),
    [syncedTreeNodes]
  );
  const treeLeafNodes = useMemo(
    () => syncedActiveTreeNodes.filter((node) => (treeChildrenByParent.get(node.id) || []).length === 0),
    [syncedActiveTreeNodes, treeChildrenByParent]
  );
  const activeTreePaths = useMemo(() => treeLeafNodes.map((leaf) => ({
    id: leaf.id,
    probability: Number(leaf.probability),
    nodes: getNodePath(treeNodes, leaf.id).filter((node) => !node.isAnchor),
  })), [treeLeafNodes, treeNodes]);
  const treeLeafProbabilityTotal = treeLeafNodes.reduce(
    (sum, node) => sum + Number(node.probability || 0),
    0
  );
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
  const treeTransferSummaries = useMemo(() => {
    const summaries = new Map();
    const hidden = new Set(hiddenModelTransferKeys);
    treeNodes.filter((node) => !node.isAnchor).forEach((node) => {
      const rootId = treeRootByNodeId.get(node.id);
      const source = rootId === activeTreeRootId ? optimizationDisplayData
        : alignTreeResultPaths(treeOptimizationResults[rootId]?.rows || [], treeNodes);
      const rows = source.filter((row) => Number(row.GW) === Number(node.gw) && Number(row.solution || 1) === 1
        && String(row.tree_path_node_ids || "").split(">").includes(node.id));
      const branchRows = rows.filter((row) => row.tree_branch_id === rows[0]?.tree_branch_id);
      const manualPairs = nodePlans[node.id]?.transfers || [];
      const optimizerPairs = buildTransferPairs({ in: branchRows.filter((row) => row.status === "transferred_in"), out: branchRows.filter((row) => row.status === "transferred_out") })
        .filter((pair) => !manualPairs.some((move) => manualTransferMatchesPair(move, pair)))
        .filter(({ outP, inP }) => !hidden.has(`${node.id}:${transferPairKey(node.gw, outP, inP)}`));
      summaries.set(node.id, { manualPairs, optimizerPairs });
    });
    return summaries;
  }, [treeNodes, treeRootByNodeId, activeTreeRootId, optimizationDisplayData, treeOptimizationResults, nodePlans, hiddenModelTransferKeys]);
  const treeExpandedNodeHeights = useMemo(() => Object.fromEntries([...treeTransferSummaries].map(([id, summary]) =>
    [id, TREE_NODE_HEIGHT + 40 + 64 * (summary.manualPairs.length + summary.optimizerPairs.length)])), [treeTransferSummaries]);
  const treeHeightKey = JSON.stringify(treeExpandedNodeHeights);
  const treeTopologyKey = treeNodes
    .map((node) => `${node.id}:${node.parentId || "root"}:${node.gw}`)
    .sort()
    .join("|");
  const treeAutoLayout = useMemo(
    () => buildVerticalTreeLayout(treeNodes, treeExpandedNodeHeights),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeTopologyKey, treeHeightKey]
  );
  const newTreeRootPosition = useMemo(() => {
    if (!isValidGW(firstPlanningGw)) return null;
    const previewNodes = buildNewTreeNodes(
      "__new_tree_preview__",
      firstPlanningGw
    );
    const previewLayout = buildVerticalTreeLayout([...treeNodes, ...previewNodes], treeExpandedNodeHeights);
    return previewLayout.positions[previewNodes[0].id] || null;
  }, [firstPlanningGw, treeNodes, treeExpandedNodeHeights]);

  useEffect(() => {
    if (pendingTreePositionsRef.current) {
      setTreeNodePositions(pendingTreePositionsRef.current);
      pendingTreePositionsRef.current = null;
      return;
    }
    if (restoredTreePositionsRef.current) {
      restoredTreePositionsRef.current = false;
      return;
    }
    setTreeNodePositions(treeAutoLayout.positions);
  }, [treeAutoLayout]);

  const treeConfigValid = Boolean(
    !treeMode ||
      (
        syncedActiveTreeNodes.filter((node) => !node.parentId).length === 1 &&
        syncedActiveTreeNodes.every((node) => {
          const parent = node.parentId
            ? treeNodes.find((candidate) => candidate.id === node.parentId)
            : null;
          const pathChips = getNodePath(treeNodes, node.id).map((ancestor) => ancestor.chip).filter((chip) => chip && chip !== "none");
          return (
            new Set(pathChips).size === pathChips.length &&
            (node.isAnchor ? Number.isInteger(Number(node.gw)) && Number(node.gw) >= 0 && Number(node.gw) < 38 : isValidGW(Number(node.gw))) &&
            Number(node.probability) > 0 &&
            (!node.parentId || (parent && Number(node.gw) === Number(parent.gw) + 1))
          );
        }) &&
        Math.abs(treeLeafProbabilityTotal - 100) < 0.05
      )
  );

  const updateTreeNode = (nodeId, patch) => {
    setTreeNodes((previous) => previous.map((node) => node.id === nodeId ? { ...node, ...patch } : node));
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

  const addNewTree = () => {
    if (!isValidGW(firstPlanningGw)) return;
    const treeKey = `tree_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const additions = buildNewTreeNodes(treeKey, firstPlanningGw);
    additions[0].treeName = `Tree ${treeRootIds.length + 1}`;
    additions[0].optimization = { ...DEFAULT_TREE_SETTINGS };
    setTreeNodes((previous) => [...previous, ...additions]);
    setSelectedTreeNodeId(additions[1]?.id || "");
    setActiveTreeRootId(additions[0].id);
  };

  const resetActiveTree = () => {
    if (!isValidGW(firstPlanningGw)) return;
    const resetRootId = activeTreeRootId;
    const treeKey = `tree_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const replacement = buildNewTreeNodes(
      treeKey,
      firstPlanningGw
    );
    replacement[0].treeName = treeName;
    replacement[0].optimization = { ...settings };
    const removedIds = new Set(
      treeNodes
        .filter((node) => treeRootByNodeId.get(node.id) === resetRootId)
        .map((node) => node.id)
    );
    setTreeNodes((previous) => {
      const insertionIndex = previous.findIndex((node) => removedIds.has(node.id));
      const kept = previous.filter((node) => !removedIds.has(node.id));
      kept.splice(Math.max(0, insertionIndex), 0, ...replacement);
      return kept;
    });
    setTreeNodePositions((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([nodeId]) => !removedIds.has(nodeId))
      )
    );
    clearTreeOptimization(resetRootId);
    setSelectedTreeBranchId("");
    setExpandedCompactTreeNodeId("");
    setActiveTreeRootId(replacement[0].id);
  };

  const deleteSelectedTree = () => {
    const selectedRootIndex = treeRootIds.indexOf(activeTreeRootId);
    if (selectedRootIndex < 0) return;

    // The first tree is the permanent base slot. Deleting it restores a
    // fresh default tree instead of leaving the workspace without a base.
    if (selectedRootIndex === 0) {
      resetActiveTree();
      return;
    }

    const removedRootId = activeTreeRootId;
    const removedIds = new Set(
      treeNodes
        .filter((node) => treeRootByNodeId.get(node.id) === removedRootId)
        .map((node) => node.id)
    );
    const nextActiveRootId = treeRootIds[selectedRootIndex - 1] || treeRootIds[0];

    setTreeNodes((previous) => previous.filter((node) => !removedIds.has(node.id)));
    setTreeNodePositions((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([nodeId]) => !removedIds.has(nodeId))
      )
    );
    clearTreeOptimization(removedRootId);
    setSelectedTreeBranchId("");
    setExpandedCompactTreeNodeId("");
    setActiveTreeRootId(nextActiveRootId);
  };

  const startTreeNodeDrag = (event, nodeId) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    event.stopPropagation();
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
    const x = Math.max(
      10,
      draggingTreeNode.originX + (event.clientX - draggingTreeNode.startX) / treeZoom
    );
    const y = Math.max(
      10,
      draggingTreeNode.originY + (event.clientY - draggingTreeNode.startY) / treeZoom
    );
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
    ...Object.values(treeNodePositions).map((position) => Number(position.x) + 440)
  );
  const treeCanvasHeight = Math.max(
    treeAutoLayout.height,
    ...Object.entries(treeNodePositions).map(([id, position]) => Number(position.y) + (treeExpandedNodeHeights[id] || TREE_NODE_HEIGHT) + 50)
  );
  useEffect(() => {
    if (!treeEditorOpen) { centeredMobileTreeRef.current = ""; return; }
    const pane = treeCanvasRef.current;
    const position = treeNodePositions[activeTreeRootId] || treeAutoLayout.positions[activeTreeRootId];
    if (!pane || !position) return;
    const centerTree = () => {
      if (!pane.clientWidth || !window.matchMedia('(max-width: 1023px)').matches || centeredMobileTreeRef.current === activeTreeRootId) return;
      pane.scrollLeft = (position.x + TREE_NODE_WIDTH / 2) * treeZoom - pane.clientWidth / 2;
      pane.scrollTop = Math.max(0, position.y * treeZoom - 24);
      centeredMobileTreeRef.current = activeTreeRootId;
    };
    centerTree();
    const observer = new ResizeObserver(centerTree);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [activeTreeRootId, treeEditorOpen, treeNodePositions, treeAutoLayout.positions, treeZoom]);
  const treeCompactView = treeZoom < TREE_COMPACT_ZOOM;
  const getRenderedTreeNodeHeight = (nodeId) =>
    treeCompactView && expandedCompactTreeNodeId !== nodeId
      ? TREE_COMPACT_NODE_HEIGHT
      : treeExpandedNodeHeights[nodeId] || TREE_NODE_HEIGHT;
  const changeTreeZoom = (delta) => {
    treeCanvasPan.zoomTo(Math.round((treeZoom + delta) * 10) / 10);
  };
  const handleTreeZoomWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeTreeZoom(event.deltaY > 0 ? -TREE_ZOOM_STEP : TREE_ZOOM_STEP);
  };
  const canOptimize = Boolean(
    teamId &&
      isValidGW(firstPlanningGw) &&
      availableGWs.length > 0 && availableGWs[0] >= firstPlanningGw &&
      !optimizationProgress?.streaming &&
      treeConfigValid &&
      (has_changed || hasPendingManualTransfers)
  );
  
  const nodeTransferPrefix = useCallback((gw) => `${planningPath.find((node) => Number(node.gw) === Number(gw))?.id || "unknown"}:`, [planningPath]);
  const nodeTransferPairKey = useCallback((gw, outP, inP) => `${nodeTransferPrefix(gw)}${transferPairKey(gw, outP, inP)}`, [nodeTransferPrefix]);
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
  }, [setManualPlan]);

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
      if (!baseRows.length && loadedTeamPitchRows.length) {
        baseRows = loadedTeamPitchRows.filter((row) => Number(row.GW) === Number(loadedTeamPitchRows[0].GW)).map((row) => ({ ...row, GW: targetGw }));
      }
      const canceledPairsForGw = optimizerTransferGroups.flatMap((grp) =>
        buildTransferPairs(grp)
          .filter(({ outP, inP }) => hiddenModelTransferSet.has(nodeTransferPairKey(grp.GW, outP, inP)))
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

      appliedTransfersForGw.forEach((transfer) => {
        const outKey = normalizeLoosePlayerKey(transfer.outName);
        const inKey = normalizeLoosePlayerKey(transfer.inName);
        const outgoing = baseRows.find((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === outKey);
        baseRows = baseRows.filter((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) !== outKey);
        if (!baseRows.some((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === inKey)) {
          baseRows.push({ ...makeManualPlayerFromRow(transfer.inPlayer, targetGw), status: outgoing?.status || "benched" });
        }
      });
      const statusOverrides = manualPlan[String(targetGw)]?.statusOverrides || {};
      return baseRows.map((row) => {
        const override = statusOverrides[getPlayerCanonicalName(row)];
        return override ? { ...row, status: override } : row;
      });
    },
    [
      activeSolutionData.length,
      freehitROund,
      loadedTeamPitchRows,
      getSolutionPlayerRowsForGw,
      hiddenModelTransferSet,
      makeManualPlayerFromRow,
      manualPlan,
      optimizerTransferGroups,
      nodeTransferPairKey,
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
    const rows = modelType === "statistical" ? pathStatisticalPlayers : aiProjectionRows;
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
    pathStatisticalPlayers,
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
          price: toFiniteNumber(row?.selling_price_m, getRowPrice(row), getRowPrice(projection)),
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
          nodeId: activeTreeNode?.id,
          outName: selectedTransferOut.name,
          outDisplay: selectedTransferOut.display,
          outPosition: selectedTransferOut.position,
          outPrice: selectedTransferOut.price,
          outPlayer: selectedTransferOut.row,
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
    activeTreeNode?.id,
    selectedTransferOut,
    transferCandidateRows,
    transferInKey,
    optimizationProgress?.streaming,
    sethas_changed,
    updateManualPlanForGw,
  ]);

  const removeManualTransfer = useCallback((transferOrId, transferGw = activeGW) => {
    const transferId = typeof transferOrId === "object" ? transferOrId.id : transferOrId;
    const nodeId = transferOrId?.nodeId || planningPath.find((node) => Number(node.gw) === Number(transferGw))?.id;
    if (!nodeId) return;
    const storedTransfer = nodePlans[nodeId]?.transfers?.find((move) => move.id === transferId);
    if (storedTransfer?.isLocked) {
      const key = `${nodeId}:${transferPairKey(transferGw, { Name: storedTransfer.outName }, { Name: storedTransfer.inName })}`;
      setHiddenModelTransferKeys((previous) => previous.includes(key) ? previous : [...previous, key]);
    }
    setNodePlans((previous) => ({ ...previous, [nodeId]: {
      ...previous[nodeId], transfers: (previous[nodeId]?.transfers || []).filter((move) => move.id !== transferId),
    } }));
    sethas_changed(true);
  }, [activeGW, planningPath, nodePlans, sethas_changed, setNodePlans]);

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

  const minGW = availableGWs[0] ?? firstPlanningGw ?? "–";
  const maxGW = availableGWs.at(-1) ?? (isValidGW(firstPlanningGw) ? Math.min(38, firstPlanningGw + 5) : "–");
  let transfers = [];
  let gwData = [];

  if (pitchSourceData.length) {
    gwData = pitchSourceData.filter((p) => Number(p.GW) === activeGW);

    transfers = optimizerTransferGroups;
  }

  if (pitchSourceData.length && Number.isFinite(Number(activeGW))) {
    gwData = [
      ...gwData.filter((row) => row?.status !== "playing" && row?.status !== "benched"),
      ...manualDisplayRowsForActiveGw,
    ];

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
          ({ outP, inP }) => !hiddenModelTransferSet.has(nodeTransferPairKey(grp.GW, outP, inP))
        );
        return {
          ...grp,
          pairs: visiblePairs,
          in: visiblePairs.map((pair) => pair.inP),
          out: visiblePairs.map((pair) => pair.outP),
        };
      })
      .filter((grp) => grp.freehit || grp.pairs.length > 0);
  }, [hiddenModelTransferSet, transfersWithFH, nodeTransferPairKey]);

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
      const outPrice = toFiniteNumber(transferLike?.outPrice, outP?.selling_price_m, getRowPrice(outProjection), getRowPrice(outP));
      const inPrice = toFiniteNumber(transferLike?.inPrice, getRowPrice(inP), getRowPrice(inProjection));
      if (!Number.isFinite(outPrice) || !Number.isFinite(inPrice)) return 0;
      return Number(inPrice) - Number(outPrice);
    },
    [activeGW, getProjectionRowForPlayer]
  );

  const transferAccountingByGw = useMemo(() => {
    const weeks = availableGWs.map((gw) => {
      const modelGroup = visibleTransfersWithFH.find((grp) => Number(grp?.GW) === Number(gw));
      const manualPairs = Array.isArray(manualPlan[String(gw)]?.transfers)
        ? manualPlan[String(gw)].transfers.map((tr) => ({ ...tr, gw, source: "manual" }))
        : [];
      const modelPairs = buildTransferPairs(modelGroup)
        .filter((pair) => !manualPairs.some((manual) => manualTransferMatchesPair(manual, pair)))
        .map((pair) => ({ ...pair, gw, source: "model" }));
      const isWildcardGw = Number(wildRound) === Number(gw);
      const isFreeHitGw = Number(freehitROund) === Number(gw);
      return {
        gw,
        chip: isFreeHitGw ? "freehit" : isWildcardGw ? "wildcard" : "none",
        count: modelPairs.length + manualPairs.length,
        spend: [...modelPairs, ...manualPairs].reduce((sum, tr) => sum + getTransferSpend(tr), 0),
      };
    });
    return accountTransfers(weeks, baseFreeTransfers, baseBank);
  }, [
    availableGWs,
    baseBank,
    baseFreeTransfers,
    freehitROund,
    wildRound,
    getTransferSpend,
    manualPlan,
    visibleTransfersWithFH,
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
  const manualHits = activeTransferAccounting.hits || 0;

  const getTreeNodeSummary = (node, leafId) => {
    const rows = optimizationDisplayData.filter((row) => String(row.tree_branch_id) === leafId && Number(row.GW) === Number(node.gw) && Number(row.solution || 1) === 1);
    const manualPairs = nodePlans[node.id]?.transfers || [];
    const optimizerPairs = buildTransferPairs({
      in: rows.filter((row) => row.status === "transferred_in"),
      out: rows.filter((row) => row.status === "transferred_out"),
    }).filter((pair) => !manualPairs.some((manual) => manualTransferMatchesPair(manual, pair))
      && !hiddenModelTransferSet.has(`${node.id}:${transferPairKey(node.gw, pair.outP, pair.inP)}`));
    const branchRows = optimizationDisplayData.filter((row) => String(row.tree_branch_id) === leafId && Number(row.solution || 1) === 1);
    let squad = rows.filter((row) => row.status === "playing" || row.status === "benched");
    if (!squad.length && loadedTeamPitchRows.length) squad = loadedTeamPitchRows.filter((row) => Number(row.GW) === Number(loadedTeamPitchRows[0].GW)).map((row) => ({ ...row, GW: Number(node.gw) }));
    squad = Array.from(new Map(squad.map((row) => [normalizeLoosePlayerKey(getPlayerCanonicalName(row)), row])).values());
    const path = getNodePath(treeNodes, node.id).filter((ancestor) => !ancestor.isAnchor);
    path.forEach((ancestor) => {
      if (ancestor.chip === "freehit" && Number(ancestor.gw) < Number(node.gw)) return;
      const movesAtGw = branchRows.filter((row) => Number(row.GW) === Number(ancestor.gw));
      const canceled = buildTransferPairs({ in: movesAtGw.filter((row) => row.status === "transferred_in"), out: movesAtGw.filter((row) => row.status === "transferred_out") })
        .filter(({ outP, inP }) => hiddenModelTransferSet.has(`${ancestor.id}:${transferPairKey(ancestor.gw, outP, inP)}`));
      const replacements = [
        ...canceled.map(({ outP, inP }) => ({ outName: getPlayerCanonicalName(inP), inPlayer: outP })),
        ...(nodePlans[ancestor.id]?.transfers || []).filter((move) => !(move.isLocked && rows.length)).map((move) => ({ outName: move.outName, inPlayer: move.inPlayer })),
      ];
      replacements.forEach(({ outName, inPlayer }) => {
        const outgoingKey = normalizeLoosePlayerKey(outName);
        const outgoing = squad.find((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === outgoingKey);
        squad = squad.filter((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) !== outgoingKey);
        const incomingKey = normalizeLoosePlayerKey(getPlayerCanonicalName(inPlayer));
        if (!squad.some((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === incomingKey)) {
          squad.push({ ...makeManualPlayerFromRow(inPlayer, node.gw), status: outgoing?.status || "benched" });
        }
      });
    });
    const predictionRows = (modelType === "statistical" ? statisticalScenarioPlayerSets[treeEffectiveScenarioById.get(node.id)] || [] : aiProjectionRows).filter((row) => Number(row.GW) === Number(node.gw));
    const predictionByName = new Map(predictionRows.map((row) => [normalizeLoosePlayerKey(getPlayerCanonicalName(row)), row]));
    squad = squad.map((row) => {
      const name = getPlayerCanonicalName(row);
      const prediction = predictionByName.get(normalizeLoosePlayerKey(name));
      return { ...row, ...(prediction || {}), Name: name, web_name: getPlayerDisplayName(row), GW: Number(node.gw),
        Points_prediction: getRowPredictedPoints(prediction || row),
        position: normalizePosition(row.position), status: nodePlans[node.id]?.statusOverrides?.[name] || row.status,
        Is_captain: row.Is_captain, photo: getPlayerPhoto(row),
      };
    });
    const scoringRows = squad.filter((row) => row.status === "playing" || (node.chip === "bench_boost" && row.status === "benched"));
    const measuredRows = scoringRows.map((row) => {
      const value = getRowMeasureValue(row, teamMeasure);
      return Number.isFinite(value) ? value * (teamMeasure === "points" && row.Is_captain ? 2 : 1) : null;
    }).filter((value) => value !== null);
    const measure = measuredRows.length ? measuredRows.reduce((sum, value) => sum + value, 0) : null;
    return { manualPairs, optimizerPairs, measure, squad };
  };

  const selectedPitchCard = activeTreeNode ? {
    node: activeTreeNode,
    summary: getTreeNodeSummary(activeTreeNode, planningPath.at(-1)?.id),
  } : null;
  const isSquadResetChip = ["wildcard", "freehit"].includes(activeTreeNode?.chip);
  const pitchNodeIndex = planningPath.findIndex((node) => node.id === activeTreeNode?.id);
  const selectPitchNode = (nodeId) => {
    if (!nodeId) return;
    setSelectedTreeNodeId(nodeId);
    setTransferOutName("");
    setTransferInKey("");
  };
  const resolveTransferPlayer = (name, storedPlayer) => storedPlayer ||
    [...loadedTeamPitchRows, ...aiProjectionRows, ...statisticalPlayersPayload].find((row) => normalizeLoosePlayerKey(getPlayerCanonicalName(row)) === normalizeLoosePlayerKey(name))
    || { Name: name, web_name: name };

  

  const handleOptimizeClick = async () => {
    if (!canOptimize) return;
    if (modelType === "statistical" && !hasStatisticalData) {
      alert("Statistical model data is still loading or unavailable. Please try again when it is ready.");
      return;
    }
    const useStatistical = modelType === "statistical";
    const playersPayload = useStatistical ? statisticalPlayersPayload : null;
    if (useStatistical && treeMode) {
      const ineffectiveScenarioNodes = syncedActiveTreeNodes.filter((node) => {
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
    const submittedTransfers = syncedActiveTreeNodes.flatMap((node) =>
      (nodePlans[node.id]?.transfers || []).map((transfer) => ({ ...transfer, nodeId: node.id, gw: Number(node.gw) }))
    );
    const submittedTransferIds = new Set(
      submittedTransfers.map((transfer) => transfer?.id).filter(Boolean)
    );
    setSelectedTreeBranchId("");
    setSelectedTreeNodeId(syncedActiveTreeNodes.find((node) => !node.isAnchor)?.id || "");
    setHiddenModelTransferKeys([]);
    setTransferOutName("");
    setTransferInKey("");
    const optimizationResult = await fetchTeam({
      useStatisticalModel: useStatistical,
      playersData: playersPayload,
      optimizationSettings: settings,
      scenarioPlayerSets: useStatistical && treeMode ? statisticalScenarioPlayerSets : null,
      scenarioTree: treeMode
        ? {
            max_prefix_candidates: 2,
            nodes: syncedActiveTreeNodes.map((node) => {
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
              forced_transfers: submittedTransfers.filter((move) => move.nodeId === node.id).map((move) => ({
                gw: Number(node.gw), out_name: move.outName, in_name: move.inName,
              })),
              scenario_id: !node.parentId
                ? BASE_SCENARIO_ID
                : String(node.scenarioId || "inherit"),
              };
            }),
          }
        : null,
    });
    const optimized = optimizationResult === true || optimizationResult?.ok === true;
    const allResultRows = Array.isArray(optimizationResult?.rows)
      ? optimizationResult.rows
      : [];
    const resultRows = allResultRows.length > 0
      ? allResultRows.filter((row) => Number(row?.solution || 1) === 1)
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
              String(row?.tree_path_node_ids || "").split(">").includes(transfer.nodeId) &&
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
      setNodePlans((prev) =>
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
              statusOverrides: plan.statusOverrides || {},
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
    setNodePlans({});
    clearTreeOptimization();
    setHiddenModelTransferKeys([]);
    setTransferOutName("");
    setTransferInKey("");
    setActiveSavedId(null);
    setSaveError("");
    setSaveHint("Team loaded. Run Optimize when you want to apply a solver plan.");
  }, [fetchMyTeam, setNodePlans, clearTreeOptimization]);

  const canSave = Array.isArray(optimizationDisplayData) && optimizationDisplayData.length > 0 && typeof saveOptimization === "function";

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
          valtrans: Number(valtrans ?? 0.5),
          modelType,
          scenarioId: modelType === "statistical" ? solverScenarioId : null,
          scenarioName: modelType === "statistical" ? selectedSolverScenario?.name || "Base scenario" : null,
          selectedSolution: 1,
          treeMode,
          treeNodes: syncedTreeNodes,
          treeNodePositions,
          activeTreeRootId,
          selectedTreeBranchId,
        },
        result: {
          data: optimizationDisplayData,
          bannedPlayersData: Array.isArray(bannedPlayersData) ? bannedPlayersData : [],
          nodePlans,
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

  

  useEffect(() => {
    if (!loading && Array.isArray(optimizationDisplayData) && optimizationDisplayData.length > 0 && typeof window !== "undefined" && window.innerWidth < 640) {
      const t = setTimeout(() => {
        pitchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);
      return () => clearTimeout(t);
    }
  }, [loading, optimizationDisplayData]);

  const loadingOverlay = loading ? (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-100/55 p-6 backdrop-blur-sm"
        style={{
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
  ) : null;

  const branchSelector = (
                      <div className="flex items-end gap-2">
                      <label className="block min-w-0 flex-1 text-xs font-semibold">Branch to follow
                        <select aria-label="Branch to follow" value={planningPath.at(-1)?.id || ""} className="gold-ring mt-1 w-full rounded-xl border bg-white p-2 text-sm"
                          onChange={(event) => {
                            const path = activeTreePaths.find((candidate) => candidate.id === event.target.value);
                            if (!path) return;
                            setSelectedTreeBranchId(path.id);
                            setSelectedTreeNodeId((path.nodes.find((node) => Number(node.gw) === Number(activeGW)) || path.nodes[0]).id);
                            setTransferOutName(""); setTransferInKey("");
                          }}>
                          {activeTreePaths.map((path, index) => <option key={path.id} value={path.id}>
                            {activeTreePaths.length === 1 ? "Main path" : `Branch ${index + 1}`} · {path.probability.toFixed(0)}% · {path.nodes.filter((node) => (treeChildrenByParent.get(node.parentId) || []).length > 1).map((node) => node.label).join(" → ") || `GW${path.nodes[0]?.gw}–${path.nodes.at(-1)?.gw}`}
                          </option>)}
                        </select>
                      </label>
                      {selectedBranchStart && (
                        <button type="button"
                          onClick={() => removeTreeBranch(selectedBranchStart.id)}
                          disabled={optimizingTreeRootId === activeTreeRootId && optimizationProgress?.streaming}
                          className="gold-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Remove selected branch"
                          title={`Remove ${selectedBranchStart.label} and all following nodes`}>
                          <X size={19} />
                        </button>
                      )}
                      </div>
  );

  return (
    <div
      className="team-workspace"
      style={{
        background: "transparent",
        color: PALETTE.beige,
        fontFamily: "inherit",
      }}
    >
      {loadingOverlay}
      

      <OptimizerWorkspaceLayout splitView={splitView}
        header={(<header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
        </header>)}
        optimization={(<section className="mb-6 grid grid-cols-1 gap-6">
          <div className="glass-card rounded-[28px] p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-start">
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
                        <ScenarioSelect
                          inputId="solver-scenario"
                          value={solverScenarioId}
                          onChange={setSolverScenarioId}
                          scenarios={adjustmentScenarios}
                          ariaLabel="Prediction scenario"
                        />
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
            <label className="mt-4 block text-xs font-semibold">Tree name
              <input aria-label="Tree name" className="gold-ring mt-1 block w-full rounded-xl border p-2" value={treeName}
                onChange={(event) => updateTreeNode(activeTreeRootId, { treeName: event.target.value })} />
            </label>
            <div
              className="mt-4 rounded-[24px] p-2 sm:p-4"
              style={{ border: `1px solid ${treeMode ? PALETTE.gold : PALETTE.border}`, background: "rgba(248,250,252,0.88)" }}
            >
              <button type="button" onClick={() => setTreeEditorOpen((open) => !open)} aria-expanded={treeEditorOpen} aria-controls="tree-editor-canvas"
                className="gold-ring flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl p-2 text-left transition"
              >
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                    <GitBranch size={16} className="lucide-icon" />
                    Decision tree
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                    Build GW nodes, split any path, and attach chips to individual nodes.
                  </p>
                  {!isValidGW(firstPlanningGw) && (
                    <p role="status" className="mt-2 text-xs" style={{ color: PALETTE.muted }}>
                      {planningError || (planningEvents === null ? "Loading current gameweeks…" : "No upcoming gameweeks this season.")}
                    </p>
                  )}
                </div>
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: `1px solid ${treeMode ? PALETTE.gold : PALETTE.border}`,
                    background: treeMode ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "white",
                    color: treeMode ? "#0f172a" : PALETTE.muted,
                  }}
                >
                  {treeName} · {treeEditorOpen ? "Minimize" : "Expand"}
                </span>
              </button>

              {treeEditorOpen && (
                <div id="tree-editor-canvas" className="mt-4">
                  <div className="tree-toolbar flex flex-wrap items-center justify-end gap-3 text-[11px]" style={{ color: PALETTE.muted }}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button type="button" onClick={resetActiveTree} aria-label="Reset selected tree" title="Reset selected tree"
                        className="gold-ring flex h-8 w-8 items-center justify-center rounded-full border bg-white" style={{ borderColor: PALETTE.border, color: PALETTE.gold }}>
                        <RefreshCw size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeTreeZoom(-TREE_ZOOM_STEP)}
                        disabled={treeZoom <= TREE_ZOOM_MIN}
                        className="gold-ring flex h-8 w-8 items-center justify-center rounded-full border bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                        aria-label="Zoom tree out"
                        title="Zoom out"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => treeCanvasPan.zoomTo(1)}
                        className="gold-ring min-w-12 rounded-full border bg-white px-2 py-1.5 font-semibold"
                        style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                        title="Reset zoom"
                      >
                        {Math.round(treeZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => changeTreeZoom(TREE_ZOOM_STEP)}
                        disabled={treeZoom >= TREE_ZOOM_MAX}
                        className="gold-ring flex h-8 w-8 items-center justify-center rounded-full border bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                        aria-label="Zoom tree in"
                        title="Zoom in"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTreeNodePositions(treeAutoLayout.positions)}
                        className="gold-ring ml-1 inline-flex items-center justify-center rounded-full border bg-white px-3 py-1.5 font-semibold"
                        style={{ borderColor: PALETTE.border, color: PALETTE.gold }}
                        aria-label="Auto layout"
                        title="Auto layout"
                      >
                        <Wand2 size={14} className="sm:hidden" /><span className="hidden sm:inline">Auto layout</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative mt-3">
                    <div
                      ref={treeCanvasRef}
                      {...treeCanvasPan.handlers}
                      onWheel={handleTreeZoomWheel}
                      className="tree-viewport max-h-[760px] overflow-auto rounded-2xl border"
                      style={{ borderColor: PALETTE.border, background: "radial-gradient(circle, rgba(148,163,184,0.32) 1px, transparent 1px)", backgroundSize: "20px 20px", touchAction: "none", cursor: treeCanvasPan.panning ? "grabbing" : "grab" }}
                    >
                    <div
                      style={{
                        width: treeCanvasWidth * treeZoom,
                        height: treeCanvasHeight * treeZoom,
                        minWidth: "100%",
                      }}
                    >
                    <div
                      className="relative select-none"
                      style={{
                        width: treeCanvasWidth,
                        height: treeCanvasHeight,
                        transform: `scale(${treeZoom})`,
                        transformOrigin: "top left",
                      }}
                      onPointerMove={moveTreeNode}
                      onPointerUp={stopTreeNodeDrag}
                      onPointerCancel={stopTreeNodeDrag}
                    >
                      <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
                        {treeNodes.filter((node) => node.parentId).map((node) => {
                          const parentNode = treeNodes.find((candidate) => candidate.id === node.parentId);
                          const parentPosition = treeNodePositions[node.parentId] || treeAutoLayout.positions[node.parentId];
                          const nodePosition = treeNodePositions[node.id] || treeAutoLayout.positions[node.id];
                          if (!parentPosition || !nodePosition) return null;
                          const startX = parentPosition.x + TREE_NODE_WIDTH / 2;
                           const startY = parentPosition.y + (
                             parentNode?.isAnchor ? 80 : getRenderedTreeNodeHeight(parentNode?.id)
                           );
                          const endX = nodePosition.x + TREE_NODE_WIDTH / 2;
                          const endY = nodePosition.y;
                          const controlY = (startY + endY) / 2;
                          const isActiveConnection = treeRootByNodeId.get(node.id) === activeTreeRootId;
                          return (
                            <path
                              key={`${node.parentId}-${node.id}`}
                              d={`M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`}
                              fill="none"
                              stroke={isActiveConnection ? "rgba(95,143,123,0.9)" : "rgba(148,163,184,0.45)"}
                              strokeWidth={isActiveConnection ? "3" : "2"}
                            />
                          );
                        })}
                      </svg>

                      {newTreeRootPosition && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            addNewTree();
                          }}
                          className="gold-ring absolute z-40 flex h-20 w-20 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-100 text-4xl font-light text-slate-400 shadow-lg transition-colors hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                          style={{
                            left: newTreeRootPosition.x + TREE_NODE_WIDTH / 2 - 40,
                            top: newTreeRootPosition.y,
                          }}
                          aria-label="Add a new decision tree"
                          title="Add a new decision tree"
                        >
                          +
                        </button>
                      )}

                      {treeNodes.filter(
                        (node) => node.parentId && treeRootByNodeId.get(node.id) === activeTreeRootId
                      ).map((node) => {
                        const parentNode = treeNodes.find((candidate) => candidate.id === node.parentId);
                        const parentPosition = treeNodePositions[node.parentId] || treeAutoLayout.positions[node.parentId];
                        const nodePosition = treeNodePositions[node.id] || treeAutoLayout.positions[node.id];
                        if (!parentPosition || !nodePosition) return null;
                        const x = (parentPosition.x + nodePosition.x) / 2 + TREE_NODE_WIDTH / 2;
                         const parentBottom = parentPosition.y + (
                           parentNode?.isAnchor ? 80 : getRenderedTreeNodeHeight(parentNode?.id)
                         );
                        const y = (parentBottom + nodePosition.y) / 2;
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
                        const effectiveScenario = adjustmentScenarios.find(
                          (scenario) => scenario.id === effectiveScenarioId
                        );
                        const inheritedScenarioId = node.parentId
                          ? treeEffectiveScenarioById.get(node.parentId) || BASE_SCENARIO_ID
                          : BASE_SCENARIO_ID;
                        const inheritedScenario = adjustmentScenarios.find(
                          (scenario) => scenario.id === inheritedScenarioId
                        );
                        const scenarioDiagnostics = treeScenarioDiagnosticsByNodeId.get(node.id);
                        const nodeTreeRootId = treeRootByNodeId.get(node.id);
                        const nodeModelType = treeNodes.find((root) => root.id === nodeTreeRootId)?.optimization?.modelType || "ai";
                        const isActiveTree = nodeTreeRootId === activeTreeRootId;
                        const isExpandedCompactNode = treeCompactView && expandedCompactTreeNodeId === node.id;
                        const useCompactNode = treeCompactView && !isExpandedCompactNode;
                        const nodeTransfers = treeTransferSummaries.get(node.id) || { manualPairs: [], optimizerPairs: [] };
                        const nodePredictedPoints = optimizedPointsByTreeNode.get(node.id);
                        const predictedPointsBadge = Number.isFinite(nodePredictedPoints) ? (
                          <div
                            className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums shadow-md"
                            style={{
                              left: position.x + TREE_NODE_WIDTH / 2 - (node.isAnchor && isActiveTree ? 54 : 0),
                              top: position.y - (node.isAnchor && isActiveTree ? 36 : 28),
                              background: `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`,
                              color: "#0f172a",
                            }}
                          >
                            {nodePredictedPoints.toFixed(2)} pts total
                          </div>
                        ) : null;
                        if (node.isAnchor) {
                          return (
                            <React.Fragment key={node.id}>
                            {predictedPointsBadge}
                            {isActiveTree && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteSelectedTree();
                                }}
                                disabled={optimizingTreeRootId === node.id && optimizationProgress?.streaming}
                                className="gold-ring absolute z-50 flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-md transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                  left: position.x + TREE_NODE_WIDTH / 2 + 24,
                                  top: position.y - 8,
                                  borderColor: "rgba(248,113,113,0.65)",
                                  color: PALETTE.danger,
                                }}
                                aria-label="Delete selected decision tree"
                                title={treeRootIds[0] === node.id ? "Restore the default tree" : "Delete selected decision tree"}
                              >
                                <X size={14} />
                              </button>
                            )}
                            {isActiveTree && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOptimizeClick();
                                }}
                                disabled={!canOptimize}
                                className="green-ring absolute z-40 inline-flex h-7 items-center justify-center gap-1 rounded-full border px-3 text-[10px] font-black shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                  left: position.x + TREE_NODE_WIDTH / 2 + (Number.isFinite(nodePredictedPoints) ? 8 : 0),
                                  top: position.y - 36,
                                  transform: Number.isFinite(nodePredictedPoints) ? "none" : "translateX(-50%)",
                                  borderColor: canOptimize ? PALETTE.gold : PALETTE.border,
                                  background: canOptimize
                                    ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                                    : "rgba(248,250,252,0.96)",
                                  color: canOptimize ? "#0f172a" : PALETTE.muted,
                                }}
                                title="Optimize the selected decision tree"
                              >
                                <Wand2 size={11} />
                                {optimizingTreeRootId === node.id && optimizationProgress?.streaming
                                  ? "Optimizing..."
                                  : "Optimize"}
                              </button>
                            )}
                            <div
                              className="absolute z-20 flex h-20 w-20 touch-none cursor-pointer flex-col items-center justify-center rounded-full text-center shadow-lg transition active:cursor-grabbing"
                              style={{
                                left: position.x + TREE_NODE_WIDTH / 2 - 40,
                                top: position.y,
                                border: `${isActiveTree ? 4 : 2}px solid ${isActiveTree ? PALETTE.gold : "#94a3b8"}`,
                                background: "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))",
                                color: "#fff",
                                opacity: isActiveTree ? 1 : 0.68,
                                transform: isActiveTree ? "scale(1.06)" : "scale(1)",
                              }}
                              onPointerDown={(event) => startTreeNodeDrag(event, node.id)}
                              onClick={() => {
                                setExpandedCompactTreeNodeId("");
                                setActiveTreeRootId(node.id);
                                setSelectedTreeNodeId("");
                              }}
                              title={isActiveTree ? "Selected decision tree" : "Click to select this decision tree"}
                            >
                              <span className="text-sm font-black">GW{node.gw}</span>
                              <span className="text-[9px] uppercase tracking-wide text-slate-300">
                                {node.treeName || `Tree ${treeRootIds.indexOf(node.id) + 1}`}
                              </span>
                            </div>
                            </React.Fragment>
                          );
                        }
                        return (
                          <React.Fragment key={node.id}>
                          {predictedPointsBadge}
                          <div
                            data-tree-node={node.id}
                            className={`absolute z-10 w-56 overflow-hidden rounded-2xl border bg-white shadow-lg ${useCompactNode ? "cursor-pointer" : ""}`}
                            style={{
                              left: position.x,
                              top: position.y,
                              height: getRenderedTreeNodeHeight(node.id),
                              borderColor: node.chip !== "none" ? PALETTE.gold : PALETTE.border,
                              boxShadow: isDragging ? "0 20px 40px rgba(15,23,42,0.24)" : "0 10px 24px rgba(15,23,42,0.12)",
                              transition: isDragging ? "none" : "box-shadow 160ms ease, border-color 160ms ease",
                              opacity: isActiveTree ? 1 : 0.56,
                              outline: activeTreeNode?.id === node.id ? `3px solid ${PALETTE.gold}` : "none",
                            }}
                            onClick={(event) => {
                              if (event.target.closest("button, input, select, [role='button']")) return;
                              setActiveTreeRootId(nodeTreeRootId);
                              setSelectedTreeNodeId(node.id);
                              if (treeCompactView) setExpandedCompactTreeNodeId((current) => current === node.id ? "" : node.id);
                            }}
                          >
                            <button type="button" className="w-full px-2 py-1 text-[10px] font-bold text-emerald-800"
                              onClick={() => { setActiveTreeRootId(nodeTreeRootId); setSelectedTreeNodeId(node.id); pitchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                              {activeTreeNode?.id === node.id ? "Viewing squad" : "View squad"} · {nodePlans[node.id]?.transfers?.length || 0} forced moves
                            </button>
                            <div
                              className="flex h-9 touch-none cursor-grab items-center justify-between px-3 active:cursor-grabbing"
                              style={{ background: node.chip !== "none" ? "rgba(95,143,123,0.14)" : "rgba(241,245,249,0.92)" }}
                              onPointerDown={(event) => startTreeNodeDrag(event, node.id)}
                            >
                              <span className="inline-flex items-center gap-1.5 text-xs font-black" style={{ color: PALETTE.gold }}>
                                <GripVertical size={13} /> GW{node.gw}
                              </span>
                              <div className="flex items-center gap-1.5">
                              {!useCompactNode && (
                                <span className="text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                  {Number(node.probability || 0).toFixed(1)}% subtree
                                </span>
                              )}
                              {hasSplitProbability && (
                                <button
                                  type="button"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeTreeBranch(node.id);
                                  }}
                                  disabled={optimizingTreeRootId === nodeTreeRootId && optimizationProgress?.streaming}
                                  className="gold-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`Remove branch ${node.label} from GW${node.gw}`}
                                  title={`Remove ${node.label} and all following nodes`}
                                >
                                  <X size={17} />
                                </button>
                              )}
                              </div>
                            </div>
                            {useCompactNode ? (
                              <div className="space-y-2 px-3 py-2.5">
                                <div className="truncate text-sm font-bold" style={{ color: PALETTE.text }} title={node.label}>
                                  {node.label}
                                </div>
                                {nodeModelType === "statistical" && (
                                  <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold" style={{ color: PALETTE.muted }}>
                                    <ScenarioColorDot color={effectiveScenario?.color} />
                                    <span className="truncate">{effectiveScenario?.name || "Base scenario"}</span>
                                  </div>
                                )}
                                {node.chip !== "none" && (
                                  <div
                                    className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    style={{ background: "rgba(95,143,123,0.16)", color: PALETTE.gold }}
                                  >
                                    {{
                                      wildcard: "Wildcard",
                                      freehit: "Free Hit",
                                      bench_boost: "Bench Boost",
                                    }[node.chip] || node.chip}
                                  </div>
                                )}
                                <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.gold }}>
                                  Click to expand
                                </div>
                              </div>
                            ) : (
                            <div className="p-3">
                              <div className="flex items-center gap-2">
                                <input
                                  value={node.label}
                                  onChange={(event) => updateTreeNode(node.id, { label: event.target.value })}
                                  className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs font-semibold outline-none"
                                  style={{ borderColor: PALETTE.border }}
                                  aria-label={`Name for GW${node.gw} node`}
                                />
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

                              {nodeModelType === "statistical" && (
                                <div className="mt-2" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                                  <div className="block text-[10px] font-semibold" style={{ color: PALETTE.muted }}>
                                    Statistical scenario
                                    {node.parentId ? (
                                      <ScenarioSelect
                                        value={String(node.scenarioId || "inherit")}
                                        onChange={(scenarioId) => updateTreeNode(node.id, { scenarioId })}
                                        scenarios={adjustmentScenarios}
                                        extraOptions={[{
                                          value: "inherit",
                                          label: `Inherit (${inheritedScenario?.name || "Base scenario"})`,
                                          color: inheritedScenario?.color,
                                        }]}
                                        compact
                                        className="mt-1"
                                        ariaLabel={`Statistical scenario for ${node.label}`}
                                      />
                                    ) : (
                                      <div className="mt-1 flex h-8 items-center gap-2 rounded-lg border bg-slate-50 px-2 text-xs" style={{ borderColor: PALETTE.border }}>
                                        <ScenarioColorDot color={effectiveScenario?.color} />
                                        {effectiveScenario?.name || "Base scenario"}
                                      </div>
                                    )}
                                  </div>
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

                              <div className="mt-3 border-t pt-2" aria-label={`Transfers for ${node.label}, GW${node.gw}`}>
                                <div className="text-[10px] font-bold text-slate-500">Transfers</div>
                                {!nodeTransfers.manualPairs.length && !nodeTransfers.optimizerPairs.length && <div className="mt-1 text-[10px] text-slate-500">No transfers</div>}
                                {nodeTransfers.manualPairs.map((move) => <TreeTransferRow key={move.id}
                                  outPlayer={resolveTransferPlayer(move.outName, move.outPlayer)} inPlayer={resolveTransferPlayer(move.inName, move.inPlayer)}
                                  caption={move.isLocked ? "Locked transfer" : "Forced transfer"} />)}
                                {nodeTransfers.optimizerPairs.map(({ outP, inP }) => <TreeTransferRow key={transferPairKey(node.gw, outP, inP)}
                                  outPlayer={outP} inPlayer={inP} caption="Optimized transfer" />)}
                              </div>

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
                            )}
                          </div>
                          </React.Fragment>
                        );
                      })}
                      </div>
                    </div>
                    </div>
                  </div>
                  {!treeConfigValid && (
                    <p className="mt-2 text-xs text-rose-600">
                      The tree needs one connected root, consecutive GWs, valid split probabilities, and each chip used at most once per path.
                    </p>
                  )}
                  <p className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
                    The optimizer locks all transfers shared before each split, then optimizes every child path using its probability. Select a node to edit its squad, forced transfers, chip, and scenario.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <details
                open={optParamsOpen}
                onToggle={(e) => setOptParamsOpen(e.currentTarget.open)}
                className="rounded-[24px] overflow-hidden min-w-0"
                style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)" }}
              >
                <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <SlidersHorizontal size={16} className="lucide-icon" />
                    <span className="font-semibold">Optimization settings · {treeName}</span>
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
                    description={`${transferPenaltyPoints(valtrans).toFixed(2)} points per ordinary transfer, including free transfers. No penalty on Wildcard or Free Hit; reduced near season end.`}
                    fillPercent={Number(valtrans) * 100}
                  />
                </div>
              </details>
            </div>
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
                              const savedManualPlan = opt?.snapshot?.result?.nodePlans || opt?.snapshot?.result?.manualPlan;
                              const restoredManualPlan =
                                savedManualPlan && typeof savedManualPlan === "object"
                                  ? savedManualPlan
                                  : {};
                              pendingSavedManualPlanRef.current =
                                String(savedParams.teamId ?? "") !== String(teamId ?? "")
                                  ? restoredManualPlan
                                  : null;

                              setHiddenModelTransferKeys([]);
                              loadOptimization(opt.id);
                              const savedModel = savedParams.modelType === "statistical" ? "statistical" : "ai";
                              if (savedModel === "statistical") {
                                const scenarioExists = adjustmentScenarios.some(
                                  (scenario) => scenario.id === savedParams.scenarioId
                                );
                                setSolverScenarioId(
                                  scenarioExists ? savedParams.scenarioId : BASE_SCENARIO_ID
                                );
                              }
                              const restoredTreeNodes =
                                Array.isArray(savedParams.treeNodes) && savedParams.treeNodes.length > 0
                                  ? ensureTreeStartAnchor(savedParams.treeNodes)
                                  : buildNewTreeNodes("tree", firstPlanningGw);
                              const restoredRootIds = restoredTreeNodes
                                .filter((node) => !node.parentId)
                                .map((node) => node.id);
                              const restoredActiveRootId = restoredRootIds.includes(savedParams.activeTreeRootId)
                                ? savedParams.activeTreeRootId
                                : restoredRootIds[0];
                              const restoredPlans = migrateNodePlans(restoredManualPlan, restoredTreeNodes, restoredActiveRootId);
                              setNodePlans(restoredPlans);
                              pendingSavedManualPlanRef.current = String(savedParams.teamId ?? "") !== String(teamId ?? "") ? restoredPlans : null;
                              setSelectedTreeNodeId("");
                              setTreeNodes(restoredTreeNodes.map((node) => node.id === restoredActiveRootId && !node.optimization
                                ? { ...node, optimization: { modelType: savedModel, risk: savedParams.risk ?? 0, valtrans: savedParams.valtrans ?? 0.5, n_hits: savedParams.n_hits ?? 0 } } : node));
                              setActiveTreeRootId(restoredActiveRootId);
                              const restoredOptimizationRows = opt?.snapshot?.result?.data;
                              if (
                                savedParams.treeMode &&
                                restoredActiveRootId &&
                                Array.isArray(restoredOptimizationRows)
                              ) {
                                setTreeOptimizationResults((previous) => ({
                                  ...previous,
                                  [restoredActiveRootId]: {
                                    rows: restoredOptimizationRows,
                                    optimizedAt: Number(opt?.createdAt) || Date.now(),
                                  },
                                }));
                              }
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
        </section>)}
        squad={(<>
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

          <section ref={pitchSectionRef} className="mb-6 grid grid-cols-1 gap-6 items-start">
            <div className="glass-card flex min-w-0 flex-col rounded-[28px] p-2 sm:p-5">
              <div className="pitch-squad-header mb-4 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap sm:gap-0">
                <div>
                  <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <Trophy size={16} className="lucide-icon" />
                    {activeSolutionData.length > 0
                      ? `Optimized squad · ${activeTreeNode?.label || treeName}`
                      : teamData?.length ? "Squad preview" : "Tree squad"}
                  </div>
                  <div className="pitch-squad-description text-xs mt-1" style={{ color: PALETTE.muted }}>
                    {activeSolutionData.length > 0
                      ? "Select a node below to edit its squad, transfers, and chip. Tap a player to open analytics."
                      : "Every branch shows its full gameweek path. Load your team to plan transfers at any node."}
                  </div>
                  {splitView && branchSelector}
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
                    Selected path {selectedMeasureMeta.short}
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

                {selectedPitchCard && (
                  <div className={splitView ? "pitch-view" : "mt-4"} aria-label="Selected branch squad">
                    <SquadPitchLayout splitView={splitView}
                      navigation={(<div className="pitch-navigation rounded-2xl border p-3" style={{ borderColor: PALETTE.border, background: "rgba(248,250,252,0.95)" }}>
                      {branchSelector}
                      <div className="gw-navigation mt-3 flex items-center justify-between gap-3">
                        <button type="button" disabled={pitchNodeIndex <= 0} className="gold-ring flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                          onClick={() => selectPitchNode(planningPath[pitchNodeIndex - 1]?.id)}><ChevronLeft size={15} />Previous GW</button>
                        <span className="text-center text-sm font-bold">GW {activeGW} · {activeTreeNode?.label}</span>
                        <button type="button" disabled={pitchNodeIndex >= planningPath.length - 1} className="gold-ring flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                          onClick={() => selectPitchNode(planningPath[pitchNodeIndex + 1]?.id)}>Next GW<ChevronRight size={15} /></button>
                      </div>
                      <div className="gw-list mt-3 flex flex-wrap justify-center gap-2" aria-label="Gameweeks in selected branch">
                        {planningPath.map((node) => <button key={node.id} type="button" aria-pressed={node.id === activeTreeNode?.id} onClick={() => selectPitchNode(node.id)}
                          className="gold-ring rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ background: node.id === activeTreeNode?.id ? PALETTE.gold : "white", color: node.id === activeTreeNode?.id ? "white" : PALETTE.text }}>GW{node.gw}</button>)}
                      </div>
                    </div>)}
                      allTransfers={(<details open={!splitView} className="group mt-3 rounded-2xl border p-3" aria-label="All transfers" style={{ borderColor: PALETTE.border }}>
                      <summary className="gold-ring flex cursor-pointer list-none items-center justify-between rounded-lg text-sm font-semibold [&::-webkit-details-marker]:hidden">
                        All transfers
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {planningPath.map((node) => {
                          const summary = treeTransferSummaries.get(node.id) || { manualPairs: [], optimizerPairs: [] };
                          const chipLabel = { wildcard: "Wildcard", freehit: "Free Hit", bench_boost: "Bench Boost" }[node.chip];
                          const hideMoves = node.chip === "wildcard" || node.chip === "freehit";
                          return (
                            <div key={node.id} className="min-w-0 rounded-xl border p-2 text-center" style={{ borderColor: node.id === activeTreeNode.id ? PALETTE.gold : PALETTE.border }}>
                              <button type="button" className="gold-ring rounded-full px-3 py-1 text-xs font-bold" onClick={() => selectPitchNode(node.id)}>GW{node.gw}</button>
                              {chipLabel && <div className="mt-1 text-xs font-semibold" style={{ color: PALETTE.gold }}>{chipLabel}</div>}
                              {!hideMoves && <>
                                {!summary.manualPairs.length && !summary.optimizerPairs.length && <p className="mt-2 text-xs" style={{ color: PALETTE.muted }}>No transfers</p>}
                                {summary.manualPairs.map((move) => <TreeTransferRow key={move.id}
                                  outPlayer={resolveTransferPlayer(move.outName, move.outPlayer)} inPlayer={resolveTransferPlayer(move.inName, move.inPlayer)}
                                  caption={move.isLocked ? "Locked transfer" : "Forced transfer"} />)}
                                {summary.optimizerPairs.map(({ outP, inP }) => <TreeTransferRow key={transferPairKey(node.gw, outP, inP)}
                                  outPlayer={outP} inPlayer={inP} caption="Optimized transfer" />)}
                              </>}
                            </div>
                          );
                        })}
                      </div>
                    </details>)}
                      settings={(<>{modelType === "statistical" && (
                      <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: PALETTE.border }}>
                        <div className="mb-1 text-xs font-semibold">Scenario from GW{activeGW}</div>
                        <ScenarioSelect
                          value={String(activeTreeNode.scenarioId || "inherit")}
                          onChange={(scenarioId) => updateTreeNode(activeTreeNode.id, { scenarioId })}
                          scenarios={adjustmentScenarios}
                          extraOptions={[{
                            value: "inherit",
                            label: `Inherit (${adjustmentScenarios.find((scenario) => scenario.id === treeEffectiveScenarioById.get(activeTreeNode.parentId))?.name || "Base scenario"})`,
                            color: adjustmentScenarios.find((scenario) => scenario.id === treeEffectiveScenarioById.get(activeTreeNode.parentId))?.color,
                          }]}
                          ariaLabel="Scenario for selected branch node"
                        />
                        <p className="mt-1 text-xs" style={{ color: PALETTE.muted }}>Applies from this node onward until a later node selects another scenario.</p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                      <span>Transfers {activeTransferUsageLabel} · Bank {activeBankLabel}</span>
                      <select aria-label="Chip for selected gameweek" value={activeTreeNode.chip || "none"} className="rounded-lg border p-2" onChange={(event) => updateTreeNode(activeTreeNode.id, { chip: event.target.value })}>
                        <option value="none">No chip</option><option value="wildcard">Wildcard</option><option value="freehit">Free Hit</option><option value="bench_boost">Bench Boost</option>
                      </select>
                    </div></>)}
                      selectedTransfers={(<div className="my-3 rounded-2xl border p-3" aria-label="Selected node transfers" style={{ borderColor: PALETTE.border }}>
                      {isSquadResetChip ? (
                        <div className="text-center text-sm font-semibold" style={{ color: PALETTE.gold }}>
                          {activeTreeNode.chip === "wildcard" ? "Wildcard" : "Free Hit"}
                        </div>
                      ) : (
                        <>
                          <div className="text-center text-xs font-semibold">Transfers · GW{activeGW}</div>
                          {selectedPitchCard.summary.manualPairs.length === 0 && selectedPitchCard.summary.optimizerPairs.length === 0 && <p className="mt-1 text-center text-xs" style={{ color: PALETTE.muted }}>No transfers</p>}
                          {selectedPitchCard.summary.manualPairs.map((move) => (
                            <TreeTransferRow key={move.id}
                              outPlayer={resolveTransferPlayer(move.outName, move.outPlayer)}
                              inPlayer={resolveTransferPlayer(move.inName, move.inPlayer)}
                              caption={move.isLocked ? "Locked transfer" : "Forced transfer"}
                              onRemove={() => removeManualTransfer({ ...move, nodeId: activeTreeNode.id }, activeGW)} />
                          ))}
                          {selectedPitchCard.summary.optimizerPairs.map(({ outP, inP }) => (
                            <TreeTransferRow key={transferPairKey(activeGW, outP, inP)} outPlayer={outP} inPlayer={inP} caption="Optimized transfer"
                              onRemove={() => {
                                const key = `${activeTreeNode.id}:${transferPairKey(activeGW, outP, inP)}`;
                                setHiddenModelTransferKeys((previous) => previous.includes(key) ? previous : [...previous, key]);
                              }} />
                          ))}
                          {hiddenModelTransferKeys.some((key) => key.startsWith(`${activeTreeNode.id}:`)) && <button type="button" className="mt-2 text-xs underline"
                            onClick={() => setHiddenModelTransferKeys((previous) => previous.filter((key) => !key.startsWith(`${activeTreeNode.id}:`)))}>Restore model moves</button>}
                        </>
                      )}
                    </div>)}
                      pitch={(<TreeNodePitch navigation={splitView ? <PitchGameweekNavigation gameweek={activeGW}
                      previousDisabled={pitchNodeIndex <= 0} nextDisabled={pitchNodeIndex >= planningPath.length - 1}
                      onPrevious={() => selectPitchNode(planningPath[pitchNodeIndex - 1]?.id)}
                      onNext={() => selectPitchNode(planningPath[pitchNodeIndex + 1]?.id)} /> : null} expanded key={activeTreeNode.id} rows={selectedPitchCard.summary.squad} gw={activeGW} onSelect={() => {}}
                      onLoadTeam={handleLoadTeam} teamLoading={teamLoading} teamError={teamError} hasTeamId={Boolean(String(teamId || "").trim())}
                      getPhoto={getPlayerPhoto} getName={getPlayerCanonicalName} getDisplayName={getPlayerDisplayName}
                      getValue={(player) => getRowMeasureValue(player, teamMeasure)} formatValue={(value) => formatMeasureValue(value, teamMeasure)} getOpponent={getOpponentMeta}
                      onPlayerDetails={(player) => navigate("/Player_Analytics/Individual", { state: { selectedPlayer: getPlayerCanonicalName(player) } })}
                      onBan={toggleBan} bannedList={bannedList} canSwap={canSwitchPlayerRows}
                      onTransfer={(player) => { setTransferOutName(getPlayerCanonicalName(player)); transferEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      onSwap={(sourceName, targetName) => {
                        const squad = selectedPitchCard.summary.squad;
                        if (!canSwitchPlayerRows(squad, sourceName, targetName)) return;
                        const source = squad.find((player) => getPlayerCanonicalName(player) === sourceName);
                        const target = squad.find((player) => getPlayerCanonicalName(player) === targetName);
                        const nodeId = activeTreeNode.id;
                        setNodePlans((previous) => ({ ...previous, [nodeId]: { ...previous[nodeId], statusOverrides: {
                          ...(previous[nodeId]?.statusOverrides || {}), [sourceName]: target.status, [targetName]: source.status,
                        } } }));
                      }} />)}
                    />
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

                {!isSquadResetChip && manualTransfers.length > 0 && (
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

              <div ref={transferEditorRef}
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

                {!isSquadResetChip && manualTransfers.length > 0 && (
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

        {pitchSourceData.length === 0 && (
          <section className="glass-card rounded-[28px] p-8 text-center">
            <Sparkles size={28} className="lucide-icon mx-auto mb-3" style={{ color: PALETTE.gold }} />
            <div className="text-lg font-semibold">Ready to optimize</div>
            <div className="text-sm mt-2 max-w-xl mx-auto" style={{ color: PALETTE.muted }}>
              Enter your Team ID and press Load to inspect the unchanged squad, then run the optimizer when ready.
            </div>
          </section>
        )}

        </>)}
        action={(<div className="sticky bottom-24 sm:bottom-28 z-[120] mt-6 flex justify-end">
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
        </div>)}
      />
    </div>
  );
}
