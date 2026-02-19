import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUp,
  ArrowDown,
  Dot,
} from "lucide-react";

// ✅ Full script:
// - Keeps your score cards (unchanged logic)
// - Predicted table modal per selected GW
// - Movement icons (green up / red down / grey dot)
// - Shows predicted_points + total_points per team
// - Shows totals in modal header (sum predicted_points, sum total_points)

export default function Team_Predictions() {
  const [predictions, setPredictions] = useState([]);
  const [selectedGW, setSelectedGW] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [showPredTable, setShowPredTable] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const { fetchIfNeeded, ScorePredData, TableData, dataVersion } = useOtherData();

  // Load match predictions (existing)
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchIfNeeded();

      const data = ScorePredData.current;
      if (Array.isArray(data)) {
        setPredictions(data);
        const earliestGW = Math.min(...data.map((d) => Number(d.GW)));
        setSelectedGW((prev) => (prev ?? earliestGW));
      }

      setIsLoading(false);
      requestAnimationFrame(() => setMounted(true));
    };
    loadData();
  }, [fetchIfNeeded, ScorePredData, TableData]);

  // Close modal on Escape + GW nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setShowPredTable(false);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch table when opening modal (fix occasional empty after navigation)
  useEffect(() => {
    const ensureTable = async () => {
      if (!showPredTable) return;
      setTableLoading(true);
      try {
        await fetchIfNeeded();
      } finally {
        setTableLoading(false);
      }
    };
    ensureTable();
  }, [showPredTable, fetchIfNeeded]);

  const uniqueGWs = useMemo(() => {
    if (!predictions.length) return [];
    return [...new Set(predictions.map((p) => Number(p.GW)))].sort((a, b) => a - b);
  }, [predictions]);

  const filteredData = useMemo(() => {
    if (selectedGW == null) return [];
    return predictions.filter((p) => Number(p.GW) === Number(selectedGW));
  }, [predictions, selectedGW]);

  const goPrev = () => {
    if (!uniqueGWs.length) return;
    setMounted(false);
    setSelectedGW((prev) => {
      const idx = uniqueGWs.indexOf(Number(prev));
      const next = idx > 0 ? uniqueGWs[idx - 1] : prev;
      requestAnimationFrame(() => setMounted(true));
      return next;
    });
  };

  const goNext = () => {
    if (!uniqueGWs.length) return;
    setMounted(false);
    setSelectedGW((prev) => {
      const idx = uniqueGWs.indexOf(Number(prev));
      const next = idx < uniqueGWs.length - 1 ? uniqueGWs[idx + 1] : prev;
      requestAnimationFrame(() => setMounted(true));
      return next;
    });
  };

  // Touch swipe (mobile)
  const touchStartX = useRef(null);
  const onTouchStart = (e) => (touchStartX.current = e.changedTouches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const THRESH = 50;
    if (dx > THRESH) goPrev();
    else if (dx < -THRESH) goNext();
    touchStartX.current = null;
  };

  const isAtStart = uniqueGWs.indexOf(Number(selectedGW)) === 0;
  const isAtEnd = uniqueGWs.indexOf(Number(selectedGW)) === uniqueGWs.length - 1;

  const normalizeProb = (v) => {
    const num = Number(v);
    if (!Number.isFinite(num)) return NaN;
    const normalized = num > 1 ? num / 100 : num; // 0..1 or 0..100
    return Math.max(0, Math.min(1, normalized));
  };

  const formatPct = (v) => {
    const p = normalizeProb(v);
    if (!Number.isFinite(p)) return "—";
    return `${(p * 100).toFixed(1)}%`;
  };

  const winTextClass = (p) => {
    const prob = normalizeProb(p);
    if (!Number.isFinite(prob)) return "";
    return prob >= 0.4 ? "text-emerald-300 font-semibold" : "";
  };

  // Match outcome probabilities
  const getMatchOutcomeProbs = (match) => {
    const pHomeRaw = normalizeProb(match.Home_Win);
    const pAwayRaw = normalizeProb(match.Away_Win);
    const pDrawRaw = normalizeProb(match.Draw);

    const pHome = Number.isFinite(pHomeRaw) ? pHomeRaw : 0;
    const pAway = Number.isFinite(pAwayRaw) ? pAwayRaw : 0;
    const pDraw = Number.isFinite(pDrawRaw) ? pDrawRaw : 0;

    const sum = pHome + pAway + pDraw;
    if (sum <= 0) return { pHome: NaN, pAway: NaN, pDraw: NaN };

    return { pHome: pHome / sum, pAway: pAway / sum, pDraw: pDraw / sum };
  };

  const scoreHighlightClass = (g) => {
    const val = Number(g);
    if (!Number.isFinite(val)) return "";
    if (val >= 1.8) return "text-emerald-300 font-semibold";
    if (val <= 0.99) return "text-red-300";
    return "text-royal-gold";
  };

  const csBadgeClass = (p) => {
    const prob = normalizeProb(p);
    if (!Number.isFinite(prob)) return "bg-neutral-800 text-neutral-300 border-neutral-700";
    if (prob >= 0.35) return "bg-emerald-900/80 text-emerald-200 border-emerald-500/60";
    if (prob <= 0.25) return "bg-red-900/80 text-red-200 border-red-500/60";
    return "bg-yellow-900/70 text-yellow-100 border-yellow-400/60";
  };

  const crest = (teamName, size = "md") => {
    const src = teamLogos[teamName];
    const cls = size === "sm" ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10";
    return (
      <img
        src={src}
        alt={`${teamName} logo`}
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        className={`${cls} object-contain transition-transform duration-200 group-hover:scale-105`}
      />
    );
  };

  // Movement icon
  const movementIcon = (m) => {
    const mv = String(m || "same").toLowerCase();
    if (mv === "up") return <ArrowUp size={16} className="text-emerald-300" />;
    if (mv === "down") return <ArrowDown size={16} className="text-red-300" />;
    return <Dot size={18} className="text-neutral-400" />;
  };

  // ===== Predicted Table rows (for SELECTED GW only) =====
  const predictedTableRows = useMemo(() => {
    const rows = TableData?.current;
    if (!Array.isArray(rows) || selectedGW == null) return [];

    return rows
      .map((r) => ({
        GW: Number(r.GW),
        position: Number(r.position),
        movement: String(r.movement ?? "same"),
        team_id: Number(r.team_id),
        code: Number(r.code),
        name: String(r.name ?? ""),
        predicted_points: Number(r.predicted_points),
        total_points: Number(r.total_points),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.GW) &&
          Number(r.GW) === Number(selectedGW) &&
          r.name &&
          Number.isFinite(r.position) &&
          Number.isFinite(r.predicted_points) &&
          Number.isFinite(r.total_points)
      )
      .sort((a, b) => a.position - b.position);
  }, [TableData, dataVersion, selectedGW]);

  // Totals for the selected GW (modal header)
  const totalPredictedPointsGW = useMemo(() => {
    return predictedTableRows.reduce((sum, r) => sum + (r.predicted_points || 0), 0);
  }, [predictedTableRows]);

  const totalTotalPointsGW = useMemo(() => {
    return predictedTableRows.reduce((sum, r) => sum + (r.total_points || 0), 0);
  }, [predictedTableRows]);

  const tableIsEmpty = predictedTableRows.length === 0;
  const tableShowLoading = tableLoading || (showPredTable && tableIsEmpty);


    const rowStyleByRank = (rank, totalTeams) => {
    // top 4
    if (rank === 1) return "bg-emerald-500/25 border-emerald-500/40"; // darkest
    if (rank === 2) return "bg-emerald-500/20 border-emerald-500/35";
    if (rank === 3) return "bg-emerald-500/15 border-emerald-500/30";
    if (rank === 4) return "bg-emerald-500/10 border-emerald-500/25";

    // 5th orange
    if (rank === 5) return "bg-orange-500/15 border-orange-500/35";

    // bottom 3 red
    if (rank >= Math.max(1, totalTeams - 2)) return "bg-red-500/15 border-red-500/35";

    // neutral
    return "bg-white/5 border-white/10";
  };

    const totalTeams = predictedTableRows.length;
return (
    <div
      className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
            Score Predictions
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl">
            Swipe or use the arrows to move between gameweeks and see predicted scores,
            clean-sheet odds, and match win probabilities.
          </p>

          {uniqueGWs.length > 0 && selectedGW != null && (
            <div className="w-full max-w-md h-1.5 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-royal-gold transition-[width] duration-300"
                style={{
                  width: `${((uniqueGWs.indexOf(Number(selectedGW)) + 1) / uniqueGWs.length) * 100}%`,
                }}
                role="progressbar"
              />
            </div>
          )}
        </header>

        {/* GW Navigation + Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center mb-6 gap-3 sm:gap-4">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={goPrev}
              disabled={isAtStart}
              className={`inline-flex items-center justify-center rounded-xl px-3 py-2 border shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-0 ${
                isAtStart
                  ? "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                  : "bg-royal-gold text-black border-yellow-400 hover:bg-yellow-300"
              }`}
              aria-label="Previous gameweek"
            >
              <ChevronLeft size={20} />
            </button>

            <span className="text-lg sm:text-2xl font-semibold select-none tracking-wide">
              GW {selectedGW ?? "—"}
            </span>

            <button
              onClick={goNext}
              disabled={isAtEnd}
              className={`inline-flex items-center justify-center rounded-xl px-3 py-2 border shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-0 ${
                isAtEnd
                  ? "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                  : "bg-royal-gold text-black border-yellow-400 hover:bg-yellow-300"
              }`}
              aria-label="Next gameweek"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* ✅ No blue hover/outline: remove ring + use neutral hover only */}
          <button
            onClick={() => setShowPredTable(true)}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-0 active:scale-[0.99]"
            aria-label="Show predicted table"
          >
            Show predicted table
          </button>
        </div>

        {/* Score cards (UNCHANGED) */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse"
              >
                <div className="h-5 w-2/3 bg-neutral-700 rounded mb-4" />
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 bg-neutral-700 rounded" />
                  <div className="h-6 w-16 bg-neutral-700 rounded" />
                  <div className="h-6 w-16 bg-neutral-700 rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 bg-neutral-700 rounded" />
                  <div className="h-6 w-16 bg-neutral-700 rounded" />
                  <div className="h-6 w-16 bg-neutral-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            key={selectedGW}
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 transition-opacity duration-300 ${
              mounted ? "opacity-100" : "opacity-0"
            }`}
          >
            {filteredData.map((match, idx) => {
              const homeGoals = Number(match.home_goals);
              const awayGoals = Number(match.away_goals);
              const homeCS = normalizeProb(match.Clean_Sheet_home);
              const awayCS = normalizeProb(match.Clean_Sheet_away);

              const { pHome, pAway, pDraw } = getMatchOutcomeProbs(match);

              return (
                <div
                  key={`${match.home_team}-${match.away_team}-${idx}`}
                  style={{ transitionDelay: `${idx * 40}ms` }}
                  className={`group rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 ease-out will-change-transform ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                  }`}
                >
                  <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-3 mb-2 text-[11px]">
                    <span className="uppercase tracking-wide text-neutral-400">Match</span>
                    <span className="uppercase tracking-wide text-neutral-400 text-right">
                      Score
                    </span>
                    <span className="uppercase tracking-wide text-neutral-400 text-right">
                      CS odds
                    </span>
                  </div>

                  <div className="mt-1 mb-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">
                      Win odds
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-neutral-400 truncate">
                          {match.home_team} (Home)
                        </span>
                        <span className={`text-sm tabular-nums ${winTextClass(pHome)}`}>
                          {formatPct(pHome)}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-neutral-400">Draw</span>
                        <span className={`text-sm tabular-nums ${winTextClass(pDraw)}`}>
                          {formatPct(pDraw)}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-neutral-400 truncate">
                          {match.away_team} (Away)
                        </span>
                        <span className={`text-sm tabular-nums ${winTextClass(pAway)}`}>
                          {formatPct(pAway)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Home */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-2 sm:gap-3 mb-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {crest(match.home_team)}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm sm:text-base font-medium truncate">
                          {match.home_team}
                        </span>
                        <span className="text-[10px] text-neutral-400 sm:hidden">
                          Score · CS odds
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end sm:justify-center gap-1">
                      <span
                        className={`text-base sm:text-xl font-semibold tabular-nums ${scoreHighlightClass(
                          homeGoals
                        )}`}
                      >
                        {Number.isFinite(homeGoals) ? homeGoals.toFixed(1) : "—"}
                      </span>
                    </div>

                    <div className="hidden sm:flex justify-end">
                      <span
                        className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-full border ${csBadgeClass(
                          homeCS
                        )}`}
                      >
                        {formatPct(homeCS)}
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:hidden justify-end mb-1">
                    <span
                      className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-full border ${csBadgeClass(
                        homeCS
                      )}`}
                    >
                      CS: {formatPct(homeCS)}
                    </span>
                  </div>

                  {/* Away */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {crest(match.away_team)}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm sm:text-base font-medium truncate">
                          {match.away_team}
                        </span>
                        <span className="text-[10px] text-neutral-400 sm:hidden">
                          Score · CS odds
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end sm:justify-center gap-1">
                      <span
                        className={`text-base sm:text-xl font-semibold tabular-nums ${scoreHighlightClass(
                          awayGoals
                        )}`}
                      >
                        {Number.isFinite(awayGoals) ? awayGoals.toFixed(1) : "—"}
                      </span>
                    </div>

                    <div className="hidden sm:flex justify-end">
                      <span
                        className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-full border ${csBadgeClass(
                          awayCS
                        )}`}
                      >
                        {formatPct(awayCS)}
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:hidden justify-end mt-1">
                    <span
                      className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-full border ${csBadgeClass(
                        awayCS
                      )}`}
                    >
                      CS: {formatPct(awayCS)}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredData.length === 0 && (
              <div className="col-span-full text-center text-neutral-400 py-10">
                No matches for this gameweek.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Predicted Table Overlay */}
      {showPredTable && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Predicted table"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowPredTable(false);
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <div className="relative mx-auto w-full max-w-xl px-3 sm:px-6 pt-20 pb-10">
            <div className="rounded-2xl border border-white/10 bg-neutral-950/95 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="flex flex-col">
                  <span className="text-base sm:text-lg font-semibold">
                    Predicted table — GW {selectedGW ?? "—"}
                  </span>
                </div>

                <button
                  onClick={() => setShowPredTable(false)}
                  className="inline-flex items-center justify-center rounded-xl p-1.5 border border-white/10 bg-white/5 hover:bg-white/10 transition"
                  aria-label="Close predicted table"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
                {tableShowLoading ? (
                  <div className="p-4 text-center text-neutral-400">Loading predicted table…</div>
                ) : predictedTableRows.length === 0 ? (
                  <div className="p-4 text-center text-neutral-400">
                    No predicted table data found for GW {selectedGW}.
                  </div>
                ) : (
                  <div className="p-2 sm:p-3">
                    <div className="grid grid-cols-[34px_26px_minmax(0,1fr)_88px_88px] text-[10px] uppercase tracking-wide text-neutral-400 px-2 pb-1">
                      <span>#</span>
                      <span />
                      <span>Team</span>
                      <span className="text-right">GW Predicted</span>
                      <span className="text-right">Total Predicted</span>
                    </div>

                    <div className="space-y-1">
                      {predictedTableRows.map((t) => {
                        const rank = t.position; // 1-based
                        const cls = rowStyleByRank(rank, totalTeams);

                        return (
                          <div
                            key={`${t.GW}-${t.code}`}
                            className={`group rounded-xl border transition px-2 py-2 ${cls}`}
                          >
                            <div className="grid grid-cols-[34px_26px_minmax(0,1fr)_88px_88px] items-center gap-2">
                              <div className="text-sm font-semibold tabular-nums text-neutral-100">
                                {t.position}
                              </div>

                              <div className="flex items-center justify-center">
                                {movementIcon(t.movement)}
                              </div>

                              <div className="flex items-center gap-2 min-w-0">
                                {crest(t.name, "sm")}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate text-neutral-100">
                                    {t.name}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-sm font-semibold tabular-nums text-royal-gold">
                                  {Number.isFinite(t.predicted_points)
                                    ? t.predicted_points.toFixed(2)
                                    : "—"}
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-sm font-semibold tabular-nums text-neutral-100">
                                  {Number.isFinite(t.total_points)
                                    ? t.total_points.toFixed(0)
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 border-t border-white/10 text-xs text-neutral-500">
                Tip: Press <span className="text-neutral-300">Esc</span> to close.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}