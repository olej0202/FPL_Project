// ✅ Changes needed:
// 1) Import movement icons from lucide-react
// 2) Build predictedTableRows for the SELECTED GW only
// 3) Render movement as: green ↑, red ↓, grey •
// 4) Show predicted points FOR THAT GW (not season total)

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

export default function Team_Predictions() {
  const [predictions, setPredictions] = useState([]);
  const [selectedGW, setSelectedGW] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [showPredTable, setShowPredTable] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const { fetchIfNeeded, ScorePredData, TableData, dataVersion } = useOtherData();

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

  // ✅ Movement icon renderer (green up, red down, grey dot)
  const movementIcon = (m) => {
    const mv = String(m || "").toLowerCase();
    if (mv === "up")
      return <ArrowUp size={16} className="text-emerald-300" aria-label="Up" />;
    if (mv === "down")
      return <ArrowDown size={16} className="text-red-300" aria-label="Down" />;
    return <Dot size={18} className="text-neutral-400" aria-label="Same" />;
  };

  // ===== Predicted Table (for SELECTED GW only) =====
  // Expect TableData.current rows like:
  // { GW, position, movement, code, name, predicted_points }  (predicted_points = points that GW)
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
        predicted_points: Number(r.predicted_points), // <- points THIS GW
      }))
      .filter(
        (r) =>
          Number(r.GW) === Number(selectedGW) &&
          r.name &&
          Number.isFinite(r.position) &&
          Number.isFinite(r.predicted_points)
      )
      .sort((a, b) => a.position - b.position);
  }, [TableData, dataVersion, selectedGW]);

  const tableIsEmpty = predictedTableRows.length === 0;
  const tableShowLoading = tableLoading || (showPredTable && tableIsEmpty);

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
        {/* ... keep your existing header/nav/match cards unchanged ... */}

        {/* GW Navigation + Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center mb-6 gap-3 sm:gap-4">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
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
              <ChevronLeft size={20} />
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
              <ChevronRight size={20} />
            </button>
          </div>

          <button
            onClick={() => setShowPredTable(true)}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 shadow-sm text-sm sm:text-base transition focus:outline-none focus:ring-2 focus:ring-royal-gold/60"
            aria-label="Show predicted table"
          >
            Show predicted table
          </button>
        </div>

        {/* ... keep your existing content rendering ... */}
      </div>

      {/* ✅ Predicted Table Overlay (PER SELECTED GW) */}
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
                  <span className="text-xs text-neutral-400">
                    Movement vs previous GW • Predicted points this GW
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
                  <div className="p-4 text-center text-neutral-400">
                    Loading predicted table…
                  </div>
                ) : predictedTableRows.length === 0 ? (
                  <div className="p-4 text-center text-neutral-400">
                    No predicted table data found for GW {selectedGW}.
                  </div>
                ) : (
                  <div className="p-2 sm:p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[34px_26px_minmax(0,1fr)_90px] text-[10px] uppercase tracking-wide text-neutral-400 px-2 pb-1">
                      <span>#</span>
                      <span aria-label="Movement"> </span>
                      <span>Team</span>
                      <span className="text-right">Pred pts</span>
                    </div>

                    <div className="space-y-1">
                      {predictedTableRows.map((t) => (
                        <div
                          key={`${t.GW}-${t.code}`}
                          className="group rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-2 py-2"
                        >
                          <div className="grid grid-cols-[34px_26px_minmax(0,1fr)_90px] items-center gap-2">
                            {/* position */}
                            <div className="text-sm font-semibold tabular-nums text-neutral-200">
                              {t.position}
                            </div>

                            {/* movement icon */}
                            <div className="flex items-center justify-center">
                              {movementIcon(t.movement)}
                            </div>

                            {/* team */}
                            <div className="flex items-center gap-2 min-w-0">
                              {crest(t.name, "sm")}
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate text-neutral-200">
                                  {t.name}
                                </div>
                              </div>
                            </div>

                            {/* predicted points this GW */}
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums text-royal-gold">
                                {Number.isFinite(t.predicted_points)
                                  ? t.predicted_points.toFixed(2)
                                  : "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
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
