import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Smooth, no-extra-libs version (visual refresh only — logic preserved)
export default function Team_Predictions() {
  const [predictions, setPredictions] = useState([]);
  const [selectedGW, setSelectedGW] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false); // trigger enter animations

  const { fetchIfNeeded, ScorePredData } = useOtherData();

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchIfNeeded();
      const data = ScorePredData.current;
      if (Array.isArray(data)) {
        setPredictions(data);
        const earliestGW = Math.min(...data.map((d) => d.GW));
        setSelectedGW((prev) => prev ?? earliestGW);
      }
      setIsLoading(false);
      // start mount animation on first paint
      requestAnimationFrame(() => setMounted(true));
    };
    loadData();
  }, [fetchIfNeeded, ScorePredData]);

  const uniqueGWs = useMemo(() => {
    if (!predictions.length) return [];
    return [...new Set(predictions.map((p) => p.GW))].sort((a, b) => a - b);
  }, [predictions]);

  const filteredData = useMemo(() => {
    if (selectedGW == null) return [];
    return predictions.filter((p) => p.GW === selectedGW);
  }, [predictions, selectedGW]);

  const goPrev = () => {
    if (!uniqueGWs.length) return;
    setMounted(false);
    setSelectedGW((prev) => {
      const idx = uniqueGWs.indexOf(prev);
      const next = idx > 0 ? uniqueGWs[idx - 1] : prev;
      requestAnimationFrame(() => setMounted(true));
      return next;
    });
  };

  const goNext = () => {
    if (!uniqueGWs.length) return;
    setMounted(false);
    setSelectedGW((prev) => {
      const idx = uniqueGWs.indexOf(prev);
      const next = idx < uniqueGWs.length - 1 ? uniqueGWs[idx + 1] : prev;
      requestAnimationFrame(() => setMounted(true));
      return next;
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uniqueGWs]);

  // Touch swipe (mobile)
  const touchStartX = useRef(null);
  const onTouchStart = (e) => (touchStartX.current = e.changedTouches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const THRESH = 50; // px
    if (dx > THRESH) goPrev();
    else if (dx < -THRESH) goNext();
    touchStartX.current = null;
  };

  const isAtStart = uniqueGWs.indexOf(selectedGW) === 0;
  const isAtEnd = uniqueGWs.indexOf(selectedGW) === uniqueGWs.length - 1;

  const normalizeProb = (v) => {
    const num = Number(v);
    if (!Number.isFinite(num)) return NaN;
    const normalized = num > 1 ? num / 100 : num; // handles 0-1 or 0-100
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

  // NEW: Match outcome probabilities from dataset
  // Expects fields: Home_Win, Away_Win, Draw (can be 0..1 or 0..100)
  // Home = first team in match section (match.home_team)
  const getMatchOutcomeProbs = (match) => {
    const pHomeRaw = normalizeProb(match.Home_Win);
    const pAwayRaw = normalizeProb(match.Away_Win);
    const pDrawRaw = normalizeProb(match.Draw);

    const pHome = Number.isFinite(pHomeRaw) ? pHomeRaw : 0;
    const pAway = Number.isFinite(pAwayRaw) ? pAwayRaw : 0;
    const pDraw = Number.isFinite(pDrawRaw) ? pDrawRaw : 0;

    const sum = pHome + pAway + pDraw;

    if (sum <= 0) return { pHome: NaN, pAway: NaN, pDraw: NaN };

    // Renormalize in case the three don't sum to 1
    return {
      pHome: pHome / sum,
      pAway: pAway / sum,
      pDraw: pDraw / sum,
    };
  };

  // Highlight rules
  const scoreHighlightClass = (g) => {
    const val = Number(g);
    if (!Number.isFinite(val)) return "";
    if (val >= 1.8) return "text-emerald-300 font-semibold";
    if (val <= 0.99) return "text-red-300";
    return "text-royal-gold";
  };

  const csBadgeClass = (p) => {
    const prob = normalizeProb(p);
    if (!Number.isFinite(prob)) {
      return "bg-neutral-800 text-neutral-300 border-neutral-700";
    }
    if (prob >= 0.35) return "bg-emerald-900/80 text-emerald-200 border-emerald-500/60";
    if (prob <= 0.25) return "bg-red-900/80 text-red-200 border-red-500/60";
    return "bg-yellow-900/70 text-yellow-100 border-yellow-400/60";
  };

  const crest = (team) => {
    const src = teamLogos[team];
    return (
      <img
        src={src}
        alt={`${team} logo`}
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        className="h-9 w-9 sm:h-10 sm:w-10 object-contain transition-transform duration-200 group-hover:scale-105"
      />
    );
  };

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

          {/* Progress across GWs */}
          {uniqueGWs.length > 0 && selectedGW != null && (
            <div className="w-full max-w-md h-1.5 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-royal-gold transition-[width] duration-300"
                style={{
                  width: `${((uniqueGWs.indexOf(selectedGW) + 1) / uniqueGWs.length) * 100}%`,
                }}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(
                  ((uniqueGWs.indexOf(selectedGW) + 1) / uniqueGWs.length) * 100
                )}
                role="progressbar"
              />
            </div>
          )}
        </header>

        {/* GW Navigation */}
        <div className="flex items-center justify-center mb-6 gap-3 sm:gap-4">
          <button
            onClick={goPrev}
            disabled={isAtStart}
            className={`inline-flex items-center justify-center rounded-xl px-3 py-2 border shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-2 focus:ring-royal-gold/60 ${
              isAtStart
                ? "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                : "bg-royal-gold text-black border-yellow-400 hover:bg-yellow-300"
            }`}
            aria-label="Previous gameweek"
          >
            <ChevronLeft size={20} className="sm:mr-0" />
          </button>

          <span className="text-lg sm:text-2xl font-semibold select-none tracking-wide">
            GW {selectedGW ?? "—"}
          </span>

          <button
            onClick={goNext}
            disabled={isAtEnd}
            className={`inline-flex items-center justify-center rounded-xl px-3 py-2 border shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-2 focus:ring-royal-gold/60 ${
              isAtEnd
                ? "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                : "bg-royal-gold text-black border-yellow-400 hover:bg-yellow-300"
            }`}
            aria-label="Next gameweek"
          >
            <ChevronRight size={20} className="sm:ml-0" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          // Skeletons
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
                  {/* Header on sm+ only (for column labels) */}
                  <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-3 mb-2 text-[11px]">
                    <span className="uppercase tracking-wide text-neutral-400">Match</span>
                    <span className="uppercase tracking-wide text-neutral-400 text-right">Score</span>
                    <span className="uppercase tracking-wide text-neutral-400 text-right">CS odds</span>
                  </div>

                  {/* NEW: Win odds */}
                  <div className="mt-1 mb-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">
                      Win odds
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-neutral-400 truncate">
                          {match.home_team} (Home)
                        </span>
                        <span
  className={`text-sm tabular-nums ${winTextClass(pHome)}`}
>
  {formatPct(pHome)}
</span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-neutral-400">Draw</span>
                        <span
  className={`text-sm tabular-nums ${winTextClass(pDraw)}`}
>
  {formatPct(pDraw)}
</span>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-neutral-400 truncate">
                          {match.away_team} (Away)
                        </span>
                        <span
  className={`text-sm tabular-nums ${winTextClass(pAway)}`}
>
  {formatPct(pAway)}
</span>

                      </div>
                    </div>
                  </div>

                  {/* Home Team Row */}
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

                    {/* Score */}
                    <div className="flex items-center justify-end sm:justify-center gap-1">
                      <span
                        className={`text-base sm:text-xl font-semibold tabular-nums ${scoreHighlightClass(
                          homeGoals
                        )}`}
                      >
                        {Number.isFinite(homeGoals) ? homeGoals.toFixed(1) : "—"}
                      </span>
                    </div>

                    {/* CS Odds badge (sm+) */}
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

                  {/* CS badge on mobile (separate line for breathing room) */}
                  <div className="flex sm:hidden justify-end mb-1">
                    <span
                      className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-full border ${csBadgeClass(
                        homeCS
                      )}`}
                    >
                      CS: {formatPct(homeCS)}
                    </span>
                  </div>

                  {/* Away Team Row */}
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

                    {/* Score */}
                    <div className="flex items-center justify-end sm:justify-center gap-1">
                      <span
                        className={`text-base sm:text-xl font-semibold tabular-nums ${scoreHighlightClass(
                          awayGoals
                        )}`}
                      >
                        {Number.isFinite(awayGoals) ? awayGoals.toFixed(1) : "—"}
                      </span>
                    </div>

                    {/* CS Odds badge (sm+) */}
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

                  {/* CS badge on mobile */}
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
    </div>
  );
}
