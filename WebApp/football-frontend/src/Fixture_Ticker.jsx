import React, { useEffect, useMemo, useState } from "react";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import teamLogos from "./utils/team_logos";
import { useOtherData } from "./Contexts/OtherContext";

const METRIC_LABELS = {
  XG: "Predicted Goals Scored",
  CS: "Predicted Clean Sheets",
  Opposition_XGC: "Top Attacking Fixtures",
  Opposition_XG: "Top Defensive Fixtures",
};

const ASCENDING_METRICS = ["Opposition_XG"]; // lower is better

function formatHAV(Home) {
  if (Home === true || Home === "Home" || Home === "H") return "H";
  if (Home === false || Home === "Away" || Home === "A") return "A";
  return "-";
}

export default function TeamPredictionRankingsTable() {
  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("XG");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);

  // Mobile handling: show max 3 GW columns with internal pager
  const [isMobile, setIsMobile] = useState(false);
  const [gwWindowStart, setGwWindowStart] = useState(0);

  const { fetchIfNeeded, FixtureData } = useOtherData();

  useEffect(() => {
    const load = async () => {
      await fetchIfNeeded();
      const data = FixtureData.current;
      if (!Array.isArray(data)) return;

      setRowsRaw(data);
      const GWs = data.map((d) => d.GW).filter((x) => Number.isFinite(x));
      if (GWs.length) {
        const min = Math.min(...GWs);
        const max = Math.max(...GWs);
        setMinGW(min);
        setMaxGW(max);
        setGWRange([min, max]);
      }
    };
    load();
  }, [fetchIfNeeded, FixtureData]);

  // Detect mobile (Tailwind sm breakpoint ~640px)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  // Filter to current range
  const filtered = useMemo(() => rowsRaw.filter((d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]), [rowsRaw, GWRange]);

  // Compute list of GW columns in the range
  const gwColumns = useMemo(() => {
    const cols = [];
    for (let g = GWRange[0]; g <= GWRange[1]; g++) cols.push(g);
    return cols;
  }, [GWRange]);

  // Visible GW columns (max 3 on mobile)
  const visibleGwColumns = useMemo(() => {
    if (!isMobile) return gwColumns;
    const maxStart = Math.max(0, gwColumns.length - 3);
    const start = Math.min(gwWindowStart, maxStart);
    return gwColumns.slice(start, start + 3);
  }, [gwColumns, isMobile, gwWindowStart]);

  // Build table model: one row per team with per-GW cells and a total
  const tableData = useMemo(() => {
    const acc = new Map();

    for (const item of filtered) {
      const team = item.team_name || item.team || "";
      if (!team) continue;
      const metricVal = parseFloat(item?.[selectedMetric] ?? 0) || 0;
      if (!acc.has(team)) acc.set(team, { team_name: team, perGW: {}, total: 0 });
      const entry = acc.get(team);
      const existing = entry.perGW[item.GW];
      // keep the instance with larger absolute magnitude for this GW
      if (!existing || Math.abs(metricVal) > Math.abs(existing.value || 0)) {
        entry.perGW[item.GW] = {
          opponent_name: item.opponent_name ?? item.Opponent_team ?? item.Opponent ?? "",
          Home: item.Home ?? item.home ?? item.Venue,
          value: metricVal,
        };
      }
    }

    for (const entry of acc.values()) {
      let total = 0;
      for (const gw of gwColumns) {
        const cell = entry.perGW[gw];
        total += parseFloat(cell?.value ?? 0) || 0;
      }
      entry.total = total;
    }

    const arr = Array.from(acc.values());
    arr.sort((a, b) => {
      const dir = ASCENDING_METRICS.includes(selectedMetric) ? 1 : -1; // 1 = ascending, -1 = descending
      if (a.total === b.total) return a.team_name.localeCompare(b.team_name);
      return dir * (a.total - b.total);
    });
    return arr;
  }, [filtered, selectedMetric, gwColumns]);

  // Value formatting
  const formatCellValue = (val) => {
    if (!Number.isFinite(val)) return "-";
    if (selectedMetric === "CS") {
      const pct = val > 1 ? val : val * 100; // handle 0-1 or 0-100 inputs
      return `${pct.toFixed(0)}%`;
    }
    return val.toFixed(2);
  };

  const formatTotalValue = (val) => (Number.isFinite(val) ? val.toFixed(2) : "-");

  const maxGwWindowStart = Math.max(0, gwColumns.length - 3);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{METRIC_LABELS[selectedMetric]}</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">Rank fixtures by predicted output across your chosen gameweek range.</p>
        </header>

        {/* Metric selector (segmented) */}
        <section className="mb-6">
  <div className="max-w-xs mx-auto w-full border-royal-gold">
    <label
      htmlFor="metric"
      className="block text-xs uppercase tracking-wide text-neutral-400 mb-1"
    >
      Metric
    </label>

    <select
      id="metric"
      value={selectedMetric}
      onChange={(e) => setSelectedMetric(e.target.value)}
      style={{ colorScheme: "dark" }}  // better dark popover in most browsers
      className="
        w-full h-10 rounded-md
        border border-royal-gold
        bg-black/70 text-neutral-100 text-sm
        px-3
        outline-royal-gold focus:outline-none
        ring-royal-gold/60
        focus:ring-2 focus-visible:ring-2 focus-visible:ring-royal-gold/60
        
      "
      aria-label="Select ranking metric"
    >
      {Object.entries(METRIC_LABELS).map(([key, label]) => (
        <option key={key} value={key} className="bg-black text-neutral-100">
          {label}
        </option>
      ))}
    </select>
  </div>
</section>




        {/* GW Slider */}
        {minGW !== null && maxGW !== null && (
          <section className="mb-4">
            <Box sx={{ width: 360, maxWidth: "100%", margin: "0 auto" }}>
              <Typography gutterBottom align="center" className="!text-xs !text-neutral-300 !mb-1">
                GW Range: {GWRange[0]} – {GWRange[1]}
              </Typography>
              <Slider
                value={GWRange}
                min={minGW}
                max={maxGW}
                onChange={(event, newValue) => {
                  setGWRange(newValue);
                  setGwWindowStart(0);
                }}
                valueLabelDisplay="auto"
                step={1}
                marks={[
                  { value: minGW, label: `GW ${minGW}` },
                  { value: maxGW, label: `GW ${maxGW}` },
                ]}
                sx={{ color: "#B8860B" }}
                aria-label="Filter by gameweek range"
              />
            </Box>
          </section>
        )}

        {/* Mobile GW pager */}
        {isMobile && gwColumns.length > 3 && (
  <div className="flex items-center justify-center gap-3 mb-4">
    <button
      className="
        h-9 w-24
        inline-flex items-center justify-center text-center
        rounded-md border bg-white/5 text-neutral-200 border-white/10
        hover:bg-white/10 disabled:opacity-40
      "
      onClick={() => setGwWindowStart((s) => Math.max(0, s - 1))}
      disabled={gwWindowStart <= 0}
      aria-label="Previous gameweeks"
    >
      ◀ Prev
    </button>

    <span className="text-xs text-neutral-400">
      Showing GW {visibleGwColumns[0]}–{visibleGwColumns[visibleGwColumns.length - 1]}
    </span>

    <button
      className="
        h-9 w-24
        inline-flex items-center justify-center text-center
        rounded-md border bg-white/5 text-neutral-200 border-white/10
        hover:bg-white/10 disabled:opacity-40
      "
      onClick={() => setGwWindowStart((s) => Math.min(maxGwWindowStart, s + 1))}
      disabled={gwWindowStart >= maxGwWindowStart}
      aria-label="Next gameweeks"
    >
      Next ▶
    </button>
  </div>
)}


        {/* Table */}
        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-2 border-collapse table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="text-[13px]">
                <th className="px-3 py-2 text-left border-b border-white/10 bg-black/60 w-10">#</th>
                <th className="px-3 py-2 text-left border-b border-white/10 bg-black/60 min-w-[160px]">Team</th>
                {visibleGwColumns.map((gw) => (
                  <th key={`h-gw-${gw}`} className="px-3 py-2 text-left border-b border-white/10 bg-black/60 min-w-[96px] w-[96px]">
                    GW {gw}
                  </th>
                ))}
                <th className="px-3 py-2 text-left border-b border-white/10 bg-black/60 min-w-[96px] w-[96px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => {
                const logoSrc = teamLogos[row.team_name];
                const rank = idx + 1;
                return (
                  <tr key={row.team_name} className="odd:bg-black/20 even:bg-black/10 hover:bg-black/30">
                    <td className="px-3 py-2 border-b border-white/5 align-top w-5 tabular-nums">{rank}</td>
                    <td className="px-3 py-2 border-b border-white/5 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-0">
                        {logoSrc ? (
                          <img src={logoSrc} alt={`${row.team_name} logo`} className="h-6 w-6 object-contain" />
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                        <span className="truncate">{row.team_name}</span>
                      </div>
                    </td>

                    {visibleGwColumns.map((gw) => {
                      const cell = row.perGW[gw];
                      const opp = cell?.opponent_name || "";
                      const hav = formatHAV(cell?.Home);
                      const rawVal = Number.isFinite(cell?.value) ? cell.value : null;

                      let bg = "";
                      if (rawVal !== null) {
                        if (selectedMetric === "XG") {
                          bg = rawVal > 1.7 ? "bg-green-900/90" : rawVal < 1.1 ? "bg-red-900/90" : "bg-yellow-900/90";
                        } else if (selectedMetric === "Opposition_XGC") {
                          bg = rawVal > 1.6 ? "bg-green-900/90" : rawVal < 1.1 ? "bg-red-900/90" : "bg-yellow-900/90";
                        } else if (selectedMetric === "Opposition_XG") {
                          bg = rawVal < 1.1 ? "bg-green-900/90" : rawVal > 1.6 ? "bg-red-900/90" : "bg-yellow-900/90";
                        } else if (selectedMetric === "CS") {
                          const p = rawVal > 1 ? rawVal / 100 : rawVal; // normalize to 0-1
                          bg = p > 0.35 ? "bg-green-900/90" : p < 0.25 ? "bg-red-900/90" : "bg-yellow-900/90";
                        }
                      }

                      return (
                        <td key={`${row.team_name}-gw-${gw}`} className="px-1 sm:px-2 py-1 sm:py-2 border-b border-white/5 align-top text-center min-w-[96px] w-[96px]">
                          {cell ? (
                            <div className={`flex flex-col text-[13px] leading-tight rounded-md px-1 py-1 ${bg}`}>
                              <span className="font-medium truncate" title={opp}>
                                {opp || "TBD"}
                              </span>
                              <span className="text-[11px] text-neutral-300">({hav})</span>
                              <span className="text-[11px]">{rawVal !== null ? formatCellValue(rawVal) : "-"}</span>
                            </div>
                          ) : (
                            <span className="text-neutral-600">–</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-3 py-2 border-b border-white/5 align-top font-semibold min-w-[96px] w-[96px] tabular-nums">
                      {formatTotalValue(row.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {tableData.length === 0 && (
            <div className="text-center text-neutral-400 py-10">No data in this range.</div>
          )}
        </div>

        {/* Legend / helper text */}
        <p className="text-xs text-neutral-400 mt-3 text-center">
          On small screens, up to three GW columns are shown. Use the pager to view more GWs.
        </p>
      </div>
    </div>
  );
}
