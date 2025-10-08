import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos"; // adjust path as needed
import { ChevronLeft, ChevronRight } from "lucide-react";

// Smooth, no-extra-libs version
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
      // re-arm animation after GW change
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

  const isAtStart= uniqueGWs.indexOf(selectedGW) == 0 ? true: false;
  const isAtEnd= uniqueGWs.indexOf(selectedGW) == uniqueGWs.length-1 ? true: false;

  const formatPct = (v) => {
    const num = Number(v);
    const normalized = num > 1 ? num / 100 : num; // handles 0-1 or 0-100
    return `${(Math.max(0, Math.min(1, normalized)) * 100).toFixed(1)}%`;
  };

  return (
    <div
      className="min-h-screen bg-black text-white p-4 sm:p-6"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col items-center gap-2 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Score Predictions</h1>
          {/* Progress across GWs */}
          {uniqueGWs.length > 0 && selectedGW != null && (
            <div className="w-full max-w-md h-1.5 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-royal-beige transition-[width] duration-300"
                style={{ width: `${((uniqueGWs.indexOf(selectedGW) + 1) / uniqueGWs.length) * 100}%` }}
              />
            </div>
          )}
        </header>

        {/* GW Navigation */}
        <div className="flex items-center justify-center mb-5 gap-4 text-royal-beige font-bold">
          <button
            onClick={goPrev}
            disabled={isAtStart}
            className={`p-2 rounded-xl hover:border-none outline-none${
              isAtStart ? "bg-red text-grey" : "bg-royal-beige  text-black"
            }`}
            aria-label="Previous gameweek"
          >
            <ChevronLeft size={28} />
          </button>

          <span className="text-xl sm:text-2xl text-royal-beige font-semibold select-none">
            Gameweek {selectedGW ?? "—"}
          </span>

          <button
            onClick={goNext}
            disabled={isAtEnd}
            className={`p-2 rounded-xl hover:border-none outline-none${
              isAtEnd ? "bg-red text-grey" : "bg-royal-beige  text-black"
            }`}
            aria-label="Next gameweek"
          >
            <ChevronRight size={28} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          // Skeletons
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#141414] border border-neutral-800 p-3 rounded animate-pulse">
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
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-opacity duration-300 ${
              mounted ? "opacity-100" : "opacity-0"
            }`}
          >
            {filteredData.map((match, idx) => (
              <div
                key={`${match.home_team}-${match.away_team}-${idx}`}
                style={{ transitionDelay: `${idx * 40}ms` }}
                className={`bg-royal-red/90 border border-royal-beige/60 p-3 rounded-2xl shadow-sm text-royal-beige backdrop-blur-sm transition-all duration-300 ease-out will-change-transform ${
                  mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.99]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-semibold">Match</span>
                  </div>
                  <span className="text-lg font-semibold">Score</span>
                  <span className="text-lg font-semibold">CS odds</span>
                </div>

                {/* Home Team Row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <img
                      src={teamLogos[match.home_team]}
                      alt={`${match.home_team} logo`}
                      className="h-10 w-10 object-contain transition-transform duration-200 hover:scale-105"
                    />
                  </div>
                  <span className="text-xl font-bold">{Number(match.home_goals).toFixed(1)}</span>
                  <span className="text-xl font-bold">{formatPct(Number(match.Clean_Sheet_home))}</span>
                </div>

                {/* Away Team Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <img
                      src={teamLogos[match.away_team]}
                      alt={`${match.away_team} logo`}
                      className="h-10 w-10 object-contain transition-transform duration-200 hover:scale-105"
                    />
                  </div>
                  <span className="text-xl font-bold">{Number(match.away_goals).toFixed(1)}</span>
                  <span className="text-xl font-bold">{formatPct(Number(match.Clean_Sheet_away))}</span>
                </div>
              </div>
            ))}

            {filteredData.length === 0 && (
              <div className="col-span-full text-center text-neutral-400 py-10">No matches for this gameweek.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
