import React, { useEffect, useMemo, useState } from "react";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import teamLogos from "./utils/team_logos"; // adjust path as needed
import { useOtherData } from "./Contexts/OtherContext";

/**
 * Dynamic table view that replaces the chart.
 * Shows: Rank, Team (logo), one column per GW in the selected range, and Total.
 * Each GW cell shows: opponent_name, Home/Away, and the selected metric value.
 */

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
  const filtered = useMemo(() => {
    return rowsRaw.filter((d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]);
  }, [rowsRaw, GWRange]);

  // Compute list of GW columns in the range
  const gwColumns = useMemo(() => {
    const cols = [];
    for (let g = GWRange[0]; g <= GWRange[1]; g++) cols.push(g);
    return cols;
  }, [GWRange]);

  // Visible GW columns (max 3 on mobile)
  const visibleGwColumns = useMemo(() => {
    if (!isMobile) return gwColumns;
    const start = Math.min(gwWindowStart, Math.max(0, gwColumns.length - 1));
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
      if (!existing || Math.abs(metricVal) > Math.abs(existing.value || 0)) {
        entry.perGW[item.GW] = {
          opponent_name: item.Opponent_team?? item.Opponent ?? "",
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

  // Value formatting: show CS as %
  const formatCellValue = (val) => {
    if (!Number.isFinite(val)) return "-";
    if (selectedMetric === "CS") {
      const pct = val > 1 ? val : val * 100; // handle 0-1 or 0-100 inputs
      return `${pct.toFixed(0)}%`;
    }
    return val.toFixed(2);
  };

  const formatTotalValue = (val) => {
    if (!Number.isFinite(val)) return "-";
    
    return val.toFixed(2);
  };

  const maxGwWindowStart = Math.max(0, gwColumns.length - 3);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 px-2 space-y-8">
      <h1 className="text-3xl font-bold text-center text-white">
        {METRIC_LABELS[selectedMetric]}
      </h1>

      {/* Metric selector */}
      <div className="flex flex-wrap justify-center gap-1 sm:gap-1 mt-4">
        {Object.entries(METRIC_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`w-36 sm:w-40 text-sm sm:text-base font-bold px-3 py-2 rounded transition-all duration-200 ${
              selectedMetric === key
                ? "bg-royal-beige text-royal-gold underline underline-offset-4 hover:border-none border-none"
                : "bg-royal-beige text-black hover:text-royal-gold hover:border-none border-none"
            } focus:outline-none`}
            onClick={() => setSelectedMetric(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* GW Slider */}
      {minGW !== null && maxGW !== null && (
        <Box sx={{ width: 320, color: "white" }}>
          <Typography gutterBottom align="center" className="whitespace-pre-line">
            {`GW Range:`} {GWRange[0]} - {GWRange[1]}
          </Typography>
          <Slider
            value={GWRange}
            min={minGW}
            max={maxGW}
            onChange={(event, newValue) => {
              setGWRange(newValue);
              setGwWindowStart(0); // reset window when range changes
            }}
            valueLabelDisplay="auto"
            step={1}
            marks={[
              { value: minGW, label: `GW ${minGW}` },
              { value: maxGW, label: `GW ${maxGW}` },
            ]}
            sx={{
              color: "#B8860B",
              "& .MuiSlider-thumb": { backgroundColor: "#B8860B" },
            }}
          />
        </Box>
      )}

      {/* Mobile GW pager */}
      {isMobile && gwColumns.length > 2 && (
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1 rounded bg-royal-beige text-black disabled:opacity-40"
            onClick={() => setGwWindowStart((s) => Math.max(0, s - 1))}
            disabled={gwWindowStart <= 0}
          >
            ◀ Prev
          </button>
          <span className="text-sm text-neutral-300">
            Showing GW {visibleGwColumns[0]}–{visibleGwColumns[visibleGwColumns.length - 1]}
          </span>
          <button
            className="px-3 py-1 rounded bg-royal-beige text-black disabled:opacity-40"
            onClick={() => setGwWindowStart((s) => Math.min(maxGwWindowStart, s + 1))}
            disabled={gwWindowStart >= maxGwWindowStart}
          >
            Next ▶
          </button>
        </div>
      )}

      {/* Dynamic table */}
      <div className="w-full max-w-7xl overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-[#121212] text-sm sticky top-0">
              <th className="px-3 py-2 text-left border-b border-neutral-800">#</th>
              <th className="px-3 py-2 text-left border-b border-neutral-800">Team</th>
              {visibleGwColumns.map((gw) => (
                <th key={`h-gw-${gw}`} className="px-3 py-2 text-left border-b border-neutral-800">
                  GW {gw}
                </th>
              ))}
              <th className="px-3 py-2 text-left border-b border-neutral-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, idx) => {
              const logoSrc = teamLogos[row.team_name];
              const rank = idx + 1;
              return (
                <tr key={row.team_name} className="odd:bg-[#0a0a0a] even:bg-[#101010] hover:bg-[#171717]">
                  <td className="px-3 py-2 border-b border-neutral-900 align-top w-10">{rank}</td>
                  <td className="px-3 py-2 border-b border-neutral-900 align-top whitespace-nowrap">{row.team_name}{logoSrc ? (
                      <img src={logoSrc} alt={`${row.team_name} logo`} className="h-6 w-6 text-center" />
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}</td>
              
                  {visibleGwColumns.map((gw) => {
                    const cell = row.perGW[gw];
                    const opp = cell?.opponent_name || "";
                    const hav = formatHAV(cell?.Home);
                    const rawVal = Number.isFinite(cell?.value) ? cell.value : null;

                    // Background color per metric thresholds
                    let bg = "";
                    if (rawVal !== null) {
                      if (selectedMetric === "XG") {
                        bg = rawVal > 1.7 ? "bg-green-900/90" : rawVal < 1.1 ? "bg-red-900/90" : "bg-yellow-900/90";
                      } else if (selectedMetric === "Opposition_XGC") {
                        bg = rawVal > 1.6 ? "bg-green-900/90" : rawVal < 1.1 ? "bg-red-900/90" : "bg-yellow-900/90";
                      } 
                      else if (selectedMetric === "Opposition_XG") {
                        bg = rawVal < 1.1 ? "bg-green-900/90" : rawVal > 1.6 ? "bg-red-900/90" : "bg-yellow-900/90";
                      } 
                      else if (selectedMetric === "CS") {
                        const p = rawVal > 1 ? rawVal / 100 : rawVal; // normalize to 0-1
                        bg = p > 0.35 ? "bg-green-900/90" : p < 0.25 ? "bg-red-900/90" : "bg-yellow-900/90";
                      }
                    }

                    return (
                      <td key={`${row.team_name}-gw-${gw}`} className="px-1 sm:px-1 py-1 sm:py-2 border-b border-neutral-900 align-top text-center">
                        {cell ? (
                          <div className={`flex flex-col text-sm leading-tight rounded-md px-1 py-1 ${bg}`}>
                            <span className="font-medium truncate" title={opp}>{opp || "TBD"}</span>
                            <span className="text-xs text-neutral-300">({hav})</span>
                            <span className="text-xs">{rawVal !== null ? formatCellValue(rawVal) : "-"}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-600">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 border-b border-neutral-900 align-top font-semibold">
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
      <div className="text-xs text-neutral-400 max-w-7xl w-full">
        <p>
          On small screens, only Team, Logo, Total and up to three GW columns are shown. Use the pager to view more GWs.
        </p>
        <p>
          Ranking is by <span className="font-semibold">Total</span> across the selected GW range. Metrics marked as
          lower-is-better
        </p>
      </div>
    </div>
  );
}
