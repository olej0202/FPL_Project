import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowUpDown, CalendarRange, ChevronDown, DollarSign, Eye, EyeOff, Filter, Search, Shield, SlidersHorizontal, Sparkles, Target, Users, RotateCcw, X } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStatsData } from "../../../Contexts/StatsContext.jsx";
import { useOtherData } from "../../../Contexts/OtherContext.jsx";
import teamLogos from "../../../utils/team_logos.js";
import {
  PALETTE,
  POSITION_ORDER,
  STACK_MEASURE_SERIES,
  STACK_TOTAL_SERIES,
  MEASURE_OPTIONS,
  firstFinite,
  firstText,
  norm,
  clampRange,
  getMeasureMeta,
  getPlayerKey,
  getMeasureValue,
  buildPointBreakdownRow,
  ownershipPercent,
  formatPrice,
  getRowTeamName,
  buildFixtureMetaById,
  resolveFixtureDetail,
  getBarRange
} from '../utils/playerRankings.js';
import { TeamColorDot, PlayerRow } from '../components/PlayerRankingComponents.jsx';
import { GlassCard, FilterCard, PillButton, SearchableMultiSelect } from '../../../components/filters/FilterControls';

export default function Player_analytics_rankings({ embedded = false }) {
  const Heading = embedded ? 'h2' : 'h1';
  const { fetchIfNeeded, loading, PlayersData, TeamData, PriceChangesData, dataVersion } = useStatsData();
  const { fetchIfNeeded: fetchOtherIfNeeded, FixtureData, dataVersion: otherVersion } = useOtherData();

  const [showFilters, setShowFilters] = useState(false);
  const [selectedMeasure, setSelectedMeasure] = useState("Points_prediction");
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState([]);
  const [selectedTeamCodes, setSelectedTeamCodes] = useState([]);
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [valueRange, setValueRange] = useState([0, 15.5]);
  const valueRangeInitializedRef = useRef(false);
  const [selectedRange, setSelectedRange] = useState([0, 100]);
  const [selectedGwStart, setSelectedGwStart] = useState(null);
  const [selectedGwEnd, setSelectedGwEnd] = useState(null);
  const [sortConfig, setSortConfig] = useState({ type: "total", gw: null, direction: "desc" });
  const [activePlayerKey, setActivePlayerKey] = useState(null);
  const [activeChartMeasure, setActiveChartMeasure] = useState("Points_prediction");
  const [activeChartView, setActiveChartView] = useState("line");
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

  const priceChangeRows = useMemo(
    () => (Array.isArray(PriceChangesData?.current) ? PriceChangesData.current : []),
    [PriceChangesData, dataVersion]
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

  const priceChangesByFullName = useMemo(() => {
    const lookup = new Map();
    for (const row of priceChangeRows) {
      const fullName = norm(row?.full_name);
      if (fullName && !lookup.has(fullName)) {
        lookup.set(fullName, row);
      }
    }
    return lookup;
  }, [priceChangeRows]);

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
      const priceChangeRow =
        priceChangesByFullName.get(norm(latest?.name)) ||
        priceChangesByFullName.get(norm(latest?.Name)) ||
        null;

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
        priceChangePercent: firstFinite(priceChangeRow?.price_change_percent),
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
      globalMaxValue: maxValue === -Infinity ? 15.5 : maxValue,
      globalMinSelected: minSelected === Infinity ? 0 : minSelected,
      globalMaxSelected: maxSelected === -Infinity ? 100 : maxSelected,
    };
  }, [playerRows, priceChangesByFullName, teamNamesByCode]);

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
    if (!playerTableRowsBase.length) return;
    if (!valueRangeInitializedRef.current) {
      valueRangeInitializedRef.current = true;
      setValueRange([globalMinValue, globalMaxValue]);
      return;
    }
    setValueRange((prev) => clampRange(prev, globalMinValue, globalMaxValue));
  }, [globalMinValue, globalMaxValue, playerTableRowsBase.length]);

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

  const pointBarRanges = useMemo(() => {
    const gwValues = [];

    for (const row of filteredPlayerRows) {
      for (const gw of displayedGWs) {
        gwValues.push(row.gwMeasures[gw]?.[selectedMeasure] ?? 0);
      }
    }

    return {
      gw: getBarRange(gwValues),
    };
  }, [displayedGWs, filteredPlayerRows, selectedMeasure]);

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

  const activeStackedChartData = useMemo(() => {
    if (!activePlayerSummary) return [];

    const sourceGws = displayedGWs.length
      ? displayedGWs
      : Object.keys(activePlayerSummary.gwDetails)
          .map((gw) => Number(gw))
          .filter((gw) => Number.isFinite(gw))
          .sort((a, b) => a - b);

    return sourceGws.map((gw) => {
      const gwDetail = activePlayerSummary.gwDetails[gw] || null;
      const representativeRow =
        gwDetail?.rawRows?.[0] ||
        activePlayerSummary.seriesRows?.find((row) => Number(row?.GW) === gw) ||
        null;
      const fixtureDetail = representativeRow
        ? resolveFixtureDetail(representativeRow, gwDetail, fixtureMetaById, teamNamesByCode)
        : { opponent: "", venue: "", fixId: "-", teamName: activePlayerSummary.teamName };

      return buildPointBreakdownRow(
        gwDetail?.rawRows || [],
        gw,
        fixtureDetail,
        activePlayerSummary.teamName
      );
    });
  }, [activePlayerSummary, displayedGWs, fixtureMetaById, teamNamesByCode]);

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
        className={embedded ? 'p-3' : 'min-h-screen p-6'}
        style={{
          background: embedded ? 'transparent' : `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
        }}
      >
        <div className={`mx-auto flex ${embedded ? 'min-h-64' : 'min-h-[70vh]'} max-w-md items-center justify-center`}>
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
      className={embedded ? 'min-w-0' : 'min-h-screen'}
      style={{
        background: embedded ? 'transparent' : `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #e2e8f0 100%)`,
        color: PALETTE.beige,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className={embedded ? 'ai-predictions-embedded' : 'mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10'}>
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
              AI Model
            </div>
            <Heading className="text-3xl font-bold tracking-tight sm:text-4xl">
              {embedded ? 'AI player predictions' : 'AI Model'}
            </Heading>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "#64748b" }}>
              Compare player projections from the AI model.
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
                    className="mt-3 rounded-xl px-3 py-2 text-sm leading-snug break-words"
                    style={{
                      border: `1px solid ${PALETTE.border}`,
                      background: "rgba(248,250,252,0.95)",
                      color: "#64748b",
                    }}
                  >
                    Visible GW range: {normalizedGwRange.start}-{normalizedGwRange.end}
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
                  className="flex w-full max-w-full items-center gap-2 overflow-x-auto rounded-xl px-2 sm:w-auto"
                  style={{
                    border: `1px solid ${PALETTE.border}`,
                    background: "#f8fafc",
                    height: "36px",
                  }}
                >
                  <CurrentMeasureIcon
                    size={14}
                    className="shrink-0"
                    style={{ color: PALETTE.gold }}
                  />
                  <select
                    value={selectedMeasure}
                    onChange={(e) => setSelectedMeasure(e.target.value)}
                    className="min-w-[140px] shrink-0 rounded-xl text-xs font-semibold outline-none"
                    style={{
                      background: "#ffffff",
                      color: PALETTE.gold,
                      border: "none",
                      height: "32px",
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

                  <th
                    className="px-4 py-3 text-right"
                    style={{ background: "#ffffff", borderBottom: `1px solid ${PALETTE.gold}` }}
                  >
                    Price Change %
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
                    pointBarRanges={pointBarRanges}
                  />
                ))}

                {filteredPlayerRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7 + displayedGWs.length}
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

          <div
            className="border-t px-4 py-3 text-xs leading-snug sm:px-5"
            style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
          >
            Showing {currentMeasureMeta.description} for GW {normalizedGwRange.start}-{normalizedGwRange.end}.
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
                          Player prediction chart
                        </div>
                        <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                          Switch between single-measure trend and full point breakdown across the visible GW horizon.
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                        <div
                          className="inline-flex overflow-hidden rounded-xl"
                          style={{
                            border: `1px solid ${PALETTE.border}`,
                            background: "#f8fafc",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveChartView("line")}
                            className="px-3 py-2 text-xs font-semibold"
                            style={{
                              background: activeChartView === "line" ? PALETTE.gold : "transparent",
                              color: activeChartView === "line" ? "#ffffff" : PALETTE.beige,
                            }}
                          >
                            Measure trend
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveChartView("stacked")}
                            className="px-3 py-2 text-xs font-semibold"
                            style={{
                              background: activeChartView === "stacked" ? PALETTE.gold : "transparent",
                              color: activeChartView === "stacked" ? "#ffffff" : PALETTE.beige,
                            }}
                          >
                            Point breakdown
                          </button>
                        </div>

                        {activeChartView === "line" ? (
                          <div
                            className="flex w-full max-w-full items-center gap-2 overflow-x-auto rounded-xl px-2 sm:w-auto"
                            style={{
                              border: `1px solid ${PALETTE.border}`,
                              background: "#f8fafc",
                              height: "36px",
                            }}
                          >
                            {React.createElement(getMeasureMeta(activeChartMeasure).icon, {
                              size: 14,
                              className: "shrink-0",
                              style: { color: PALETTE.gold },
                            })}
                            <select
                              value={activeChartMeasure}
                              onChange={(e) => setActiveChartMeasure(e.target.value)}
                              className="min-w-[140px] shrink-0 rounded-xl text-xs font-semibold outline-none"
                              style={{
                                background: "#ffffff",
                                color: PALETTE.gold,
                                border: "none",
                                height: "32px",
                              }}
                            >
                              {MEASURE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="text-xs text-right" style={{ color: PALETTE.muted }}>
                            Base reflects the 0/60-minute likelihood model, with the other point components split by position.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {activeChartView === "line" ? (
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
                        ) : (
                          <ComposedChart data={activeStackedChartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.24)" />
                            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip
                              formatter={(value, name) => {
                                const label =
                                  STACK_MEASURE_SERIES.find((series) => series.key === name)?.label ||
                                  (name === STACK_TOTAL_SERIES.key ? STACK_TOTAL_SERIES.label : name);
                                return [`${(Number(value) || 0).toFixed(2)} pts`, label];
                              }}
                              labelFormatter={(label, payload) => {
                                const point = payload?.[0]?.payload;
                                if (!point) return label;
                                const venueText = point.venue ? ` (${point.venue})` : "";
                                return `${label} · vs ${point.opponent || ""}${venueText}`;
                              }}
                              contentStyle={{
                                borderRadius: "16px",
                                border: `1px solid ${PALETTE.border}`,
                                boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                              }}
                            />
                            <Legend
                              verticalAlign="bottom"
                              formatter={(value) =>
                                STACK_MEASURE_SERIES.find((series) => series.key === value)?.label ||
                                (value === STACK_TOTAL_SERIES.key ? STACK_TOTAL_SERIES.label : value)
                              }
                            />
                            <ReferenceLine y={0} stroke="rgba(15,23,42,0.35)" />
                            {STACK_MEASURE_SERIES.map((series) => (
                              <Bar
                                key={series.key}
                                dataKey={series.key}
                                name={series.key}
                                stackId="points"
                                fill={series.color}
                                stroke="rgba(15,23,42,0.18)"
                                strokeWidth={1}
                              />
                            ))}
                            <Line
                              type="monotone"
                              dataKey={STACK_TOTAL_SERIES.key}
                              name={STACK_TOTAL_SERIES.key}
                              stroke={STACK_TOTAL_SERIES.color}
                              strokeWidth={3}
                              dot={{ r: 4, fill: STACK_TOTAL_SERIES.color, stroke: "#ffffff", strokeWidth: 1.5 }}
                              activeDot={{ r: 6, fill: STACK_TOTAL_SERIES.color, stroke: "#ffffff", strokeWidth: 1.5 }}
                            />
                          </ComposedChart>
                        )}
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
