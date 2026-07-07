import React, { useEffect, useMemo, useState } from "react";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import teamLogos from "./utils/team_logos";
import { useOtherData } from "./Contexts/OtherContext";

const METRIC_LABELS = {
  XG: "Predicted Goals Scored",
  CS: "Predicted Clean Sheets",
  Opposition_XGC: "Top Attacking Fixtures",
  Opposition_XG: "Top Defensive Fixtures",
};
const METRIC_KEYS = Object.keys(METRIC_LABELS);

const ASCENDING_METRICS = ["Opposition_XG"]; // lower is better

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
};

function formatHAV(Home) {
  if (Home === true || Home === "Home" || Home === "H") return "H";
  if (Home === false || Home === "Away" || Home === "A") return "A";
  return "-";
}

function isSumMetric(metric) {
  return metric === "XG" || metric === "CS" || metric === "Opposition_XGC";
}

function aggregateFixturesForMetric(fixtures, metric) {
  if (!fixtures || fixtures.length === 0) return null;

  const values = fixtures
    .map((f) => (Number.isFinite(f?.value) ? f.value : null))
    .filter((v) => v !== null);

  if (values.length === 0) {
    return {
      opponents: fixtures.map((f) => f.opponent_name || "TBD"),
      havs: fixtures.map((f) => formatHAV(f.Home)),
      value: null,
    };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  return {
    opponents: fixtures.map((f) => f.opponent_name || "TBD"),
    havs: fixtures.map((f) => formatHAV(f.Home)),
    value: isSumMetric(metric) ? sum : avg,
  };
}

function buildTeamTableData(rows, gwColumns, metric) {
  const acc = new Map();

  for (const item of rows) {
    const team = item.team_name || item.team || "";
    if (!team) continue;

    const metricVal = parseFloat(item?.[metric] ?? 0);
    const value = Number.isFinite(metricVal) ? metricVal : 0;

    if (!acc.has(team)) acc.set(team, { team_name: team, perGW: {}, total: 0 });

    const entry = acc.get(team);
    const gw = item.GW;
    if (!Number.isFinite(gw)) continue;

    if (!entry.perGW[gw]) entry.perGW[gw] = [];
    entry.perGW[gw].push({
      opponent_name:
        item.opponent_name ?? item.Opponent_team ?? item.Opponent ?? "",
      Home: item.Home ?? item.home ?? item.Venue,
      value,
    });
  }

  for (const entry of acc.values()) {
    let total = 0;
    for (const gw of gwColumns) {
      const fixtures = entry.perGW[gw];
      const agg = aggregateFixturesForMetric(fixtures, metric);
      total += Number.isFinite(agg?.value) ? agg.value : 0;
    }
    entry.total = total;
  }

  const arr = Array.from(acc.values());
  arr.sort((a, b) => {
    const dir = ASCENDING_METRICS.includes(metric) ? 1 : -1;
    if (a.total === b.total) return a.team_name.localeCompare(b.team_name);
    return dir * (a.total - b.total);
  });

  return arr.map((row) => ({
    ...row,
    _aggregateFixtures: (fixtures) => aggregateFixturesForMetric(fixtures, metric),
  }));
}

export default function TeamPredictionRankingsTable() {
  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("XG");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);
  const [activeTeamName, setActiveTeamName] = useState(null);
  const [comparisonTeamName, setComparisonTeamName] = useState("");
  const [activeModalMetric, setActiveModalMetric] = useState("XG");

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
    mq.addEventListener
      ? mq.addEventListener("change", onChange)
      : mq.addListener(onChange);
    return () => {
      mq.removeEventListener
        ? mq.removeEventListener("change", onChange)
        : mq.removeListener(onChange);
    };
  }, []);

  // Filter to current range
  const filtered = useMemo(
    () => rowsRaw.filter((d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]),
    [rowsRaw, GWRange]
  );

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

  // Build table model: one row per team with per-GW arrays, plus an aggregated total
  const tableData = useMemo(
    () => buildTeamTableData(filtered, gwColumns, selectedMetric),
    [filtered, gwColumns, selectedMetric]
  );

  const modalTableData = useMemo(
    () => buildTeamTableData(filtered, gwColumns, activeModalMetric),
    [activeModalMetric, filtered, gwColumns]
  );


  // Value formatting
  const formatCellValue = (val, metric = selectedMetric) => {
    if (!Number.isFinite(val)) return "-";
    if (metric === "CS") {
      const pct = val > 1 ? val : val * 100; // handle 0-1 or 0-100 inputs
      return `${pct.toFixed(0)}%`;
    }
    return val.toFixed(2);
  };

  const formatTotalValue = (val) =>
    Number.isFinite(val) ? val.toFixed(2) : "-";

  const maxGwWindowStart = Math.max(0, gwColumns.length - 3);
  const selectedMetricIndex = METRIC_KEYS.indexOf(selectedMetric);
  const activeModalMetricIndex = METRIC_KEYS.indexOf(activeModalMetric);

  const handleMetricStep = (direction) => {
    const nextIndex =
      (selectedMetricIndex + direction + METRIC_KEYS.length) % METRIC_KEYS.length;
    setSelectedMetric(METRIC_KEYS[nextIndex]);
  };

  const handleModalMetricStep = (direction) => {
    const nextIndex =
      (activeModalMetricIndex + direction + METRIC_KEYS.length) % METRIC_KEYS.length;
    setActiveModalMetric(METRIC_KEYS[nextIndex]);
  };

  const activeTeamRow = useMemo(
    () => modalTableData.find((row) => row.team_name === activeTeamName) || null,
    [activeTeamName, modalTableData]
  );

  const comparisonTeamRow = useMemo(
    () => modalTableData.find((row) => row.team_name === comparisonTeamName) || null,
    [comparisonTeamName, modalTableData]
  );

  const chartData = useMemo(() => {
    if (!activeTeamRow) return [];

    return gwColumns.map((gw) => {
      const primaryAgg = activeTeamRow._aggregateFixtures(activeTeamRow.perGW[gw]);
      const compareAgg = comparisonTeamRow?._aggregateFixtures(comparisonTeamRow.perGW[gw]);
      return {
        gw,
        label: `GW ${gw}`,
        value: Number.isFinite(primaryAgg?.value) ? primaryAgg.value : null,
        compareValue: Number.isFinite(compareAgg?.value) ? compareAgg.value : null,
        opponent: primaryAgg?.opponents?.length ? primaryAgg.opponents.join(" / ") : "No fixture",
      };
    });
  }, [activeTeamRow, comparisonTeamRow, gwColumns]);

  useEffect(() => {
    if (!activeTeamName) {
      setComparisonTeamName("");
      return;
    }

    if (comparisonTeamName === activeTeamName) {
      setComparisonTeamName("");
    }
  }, [activeTeamName, comparisonTeamName]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: `radial-gradient(circle at top, #f8fafc 0, #eef2ff 55%, #e2e8f0 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {METRIC_LABELS[selectedMetric]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Rank fixtures by predicted output across your chosen gameweek
            range.
          </p>
        </header>

        {/* Metric selector card */}
        <section className="mb-6">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl px-4 py-3">
            <div className="mb-2 block text-xs uppercase tracking-wide text-slate-600">
              Metric
            </div>

            <div
              className="flex items-center gap-2 sm:gap-3"
              aria-label="Select ranking metric"
            >
              <button
                type="button"
                onClick={() => handleMetricStep(-1)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-white"
                aria-label="Previous metric"
              >
                {"<"}
              </button>

              <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {METRIC_LABELS[selectedMetric]}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleMetricStep(1)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-white"
                aria-label="Next metric"
              >
                {">"}
              </button>
            </div>
          </div>
        </section>
        {/* GW Slider card */}
        {minGW !== null && maxGW !== null && (
          <section className="mb-5">
            <div className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-xl px-4 py-3">
              <Box sx={{ width: "100%" }}>
                <div className="mb-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    GW range
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-snug break-words text-slate-700">
                    GW {GWRange[0]} - GW {GWRange[1]}
                  </div>
                </div>
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
                  sx={{ color: PALETTE.gold }}
                  aria-label="Filter by gameweek range"
                />
                <div className="mt-1 flex items-center justify-between px-2 text-[11px] font-medium text-slate-500">
                  <span>{`GW ${minGW}`}</span>
                  <span>{`GW ${maxGW}`}</span>
                </div>
              </Box>
            </div>
          </section>
        )}
        {/* Mobile GW pager */}
        {isMobile && gwColumns.length > 3 && (
          <div className="mb-4 flex items-center justify-center gap-3">
            <button
              className="
                h-9 w-24
                inline-flex items-center justify-center text-center
                rounded-md border border-slate-300
                bg-slate-50 text-slate-700
                hover:bg-white disabled:opacity-40
              "
              onClick={() =>
                setGwWindowStart((s) => Math.max(0, s - 1))
              }
              disabled={gwWindowStart <= 0}
              aria-label="Previous gameweeks"
            >
              {"< Prev"}
            </button>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs leading-snug text-slate-600">
              Showing GW {visibleGwColumns[0]}-{visibleGwColumns[visibleGwColumns.length - 1]}
            </span>

            <button
              className="
                h-9 w-24
                inline-flex items-center justify-center text-center
                rounded-md border border-slate-300
                bg-slate-50 text-slate-700
                hover:bg-white disabled:opacity-40
              "
              onClick={() =>
                setGwWindowStart((s) =>
                  Math.min(maxGwWindowStart, s + 1)
                )
              }
              disabled={gwWindowStart >= maxGwWindowStart}
              aria-label="Next gameweeks"
            >
              {"Next >"}
            </button>
          </div>
        )}

        {/* Table card */}
        <section
          className="
            w-full mt-2
            rounded-2xl border border-slate-200
            bg-white shadow-2xl
            overflow-hidden
          "
        >
          <div className="w-full overflow-x-auto">
            <table className="min-w-2 border-collapse table-fixed">
              <thead className="sticky top-0 z-10">
                <tr className="text-[13px]">
                  <th className="px-3 py-2 text-left border-b border-slate-200 bg-white w-10">
                    #
                  </th>
                  <th className="px-3 py-2 text-left border-b border-slate-200 bg-white min-w-[160px]">
                    Team
                  </th>
                  {visibleGwColumns.map((gw) => (
                    <th
                      key={`h-gw-${gw}`}
                      className="px-3 py-2 text-left border-b border-slate-200 bg-white min-w-[96px] w-[96px]"
                    >
                      GW {gw}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left border-b border-slate-200 bg-white min-w-[96px] w-[96px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => {
                  const logoSrc = teamLogos[row.team_name];
                  const rank = idx + 1;
                  return (
                    <tr
                      key={row.team_name}
                      className="cursor-pointer odd:bg-slate-100 even:bg-slate-50 hover:bg-slate-100 transition-colors"
                      onClick={() => {
                        setActiveTeamName(row.team_name);
                        setActiveModalMetric(selectedMetric);
                        setComparisonTeamName("");
                      }}
                    >
                      <td className="px-3 py-2 border-b border-slate-200 align-top w-5 tabular-nums">
                        {rank}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2 min-w-0">
                          {logoSrc ? (
                            <img
                              src={logoSrc}
                              alt={`${row.team_name} logo`}
                              className="h-6 w-6 object-contain"
                            />
                          ) : (
                            <span className="text-neutral-500">
                              —
                            </span>
                          )}
                          <span className="truncate">
                            {row.team_name}
                          </span>
                        </div>
                      </td>

                      {visibleGwColumns.map((gw) => {
                        const fixtures = row.perGW[gw]; // now ARRAY
const agg = row._aggregateFixtures(fixtures);

const oppText = agg?.opponents?.length ? agg.opponents.join(" / ") : "";
const havText = agg?.havs?.length ? agg.havs.join("/") : "";
const rawVal = Number.isFinite(agg?.value) ? agg.value : null;

// same background logic, but based on aggregated rawVal
let bg = "";
if (rawVal !== null) {
  if (selectedMetric === "XG") {
    bg =
      rawVal > 1.7 ? "bg-emerald-100" :
      rawVal < 1.1 ? "bg-rose-100" :
      "bg-amber-100";
  } else if (selectedMetric === "Opposition_XGC") {
    bg =
      rawVal > 1.6 ? "bg-emerald-100" :
      rawVal < 1.1 ? "bg-rose-100" :
      "bg-amber-100";
  } else if (selectedMetric === "Opposition_XG") {
    bg =
      rawVal < 1.1 ? "bg-emerald-100" :
      rawVal > 1.6 ? "bg-rose-100" :
      "bg-amber-100";
  } else if (selectedMetric === "CS") {
    const p = rawVal > 1 ? rawVal / 100 : rawVal;
    bg =
      p > 0.35 ? "bg-emerald-100" :
      p < 0.25 ? "bg-rose-100" :
      "bg-amber-100";
  }
}

return (
  <td
    key={`${row.team_name}-gw-${gw}`}
    className="px-1 sm:px-2 py-1 sm:py-2 border-b border-slate-200 align-top text-center min-w-[96px] w-[96px]"
  >
    {fixtures && fixtures.length > 0 ? (
      <div className={`flex flex-col text-[13px] leading-tight rounded-md px-1 py-1 ${bg}`}>
        <span className="font-medium truncate" title={oppText}>
          {oppText || "TBD"}
        </span>
        <span className="text-[11px] text-slate-700">
          ({havText || "-"})
        </span>
        <span className="text-[11px]">
          {rawVal !== null ? formatCellValue(rawVal) : "-"}
        </span>
      </div>
    ) : (
      <span className="text-neutral-600">-</span>
    )}
  </td>
);

                      })}

                      <td className="px-3 py-2 border-b border-slate-200 align-top font-semibold min-w-[96px] w-[96px] tabular-nums text-right">
                        {formatTotalValue(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {tableData.length === 0 && (
              <div className="text-center text-slate-500 py-10">
                No data in this range.
              </div>
            )}
          </div>
        </section>

        {/* Legend / helper text */}
        <p className="text-xs text-slate-600 mt-3 text-center">
          On small screens, up to three GW columns are shown. Use the pager
          above to view more gameweeks.
        </p>

        {activeTeamRow ? (
          <div
            className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-3 sm:items-center sm:p-4"
            onClick={() => setActiveTeamName(null)}
          >
            <div
              className="my-3 w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:my-0 sm:max-h-[92vh]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Team detail
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {teamLogos[activeTeamRow.team_name] ? (
                        <img
                          src={teamLogos[activeTeamRow.team_name]}
                          alt={`${activeTeamRow.team_name} logo`}
                          className="h-10 w-10 object-contain"
                        />
                      ) : null}
                      <div>
                        <h2 className="text-2xl font-bold text-slate-800">
                          {activeTeamRow.team_name}
                        </h2>
                        <div className="mt-1 text-sm text-slate-600">
                          {METRIC_LABELS[activeModalMetric]} total: {formatCellValue(activeTeamRow.total, activeModalMetric)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTeamName(null)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-4 py-4 sm:max-h-[calc(92vh-96px)] sm:px-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Measure
                      </div>
                      <div className="mt-3 flex items-center gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => handleModalMetricStep(-1)}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:bg-slate-50"
                          aria-label="Previous modal metric"
                        >
                          {"<"}
                        </button>

                        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {METRIC_LABELS[activeModalMetric]}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleModalMetricStep(1)}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:bg-slate-50"
                          aria-label="Next modal metric"
                        >
                          {">"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Compare team
                      </div>
                      <select
                        value={comparisonTeamName}
                        onChange={(event) => setComparisonTeamName(event.target.value)}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none"
                      >
                        <option value="">None</option>
                        {tableData
                          .filter((row) => row.team_name !== activeTeamRow.team_name)
                          .map((row) => (
                            <option key={row.team_name} value={row.team_name}>
                              {row.team_name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Current range
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        GW {GWRange[0]} - GW {GWRange[1]}
                      </div>
                      <div className="mt-3 text-xs leading-snug text-slate-600">
                        This measure is local to the modal and does not change the main fixture table.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                    <div className="mb-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {METRIC_LABELS[activeModalMetric]} by GW
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {comparisonTeamRow
                          ? `${activeTeamRow.team_name} vs ${comparisonTeamRow.team_name}`
                          : activeTeamRow.team_name}
                      </div>
                    </div>

                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                          <Tooltip
                            formatter={(value, name) => [
                              formatCellValue(Number(value), activeModalMetric),
                              name,
                            ]}
                            labelFormatter={(label, payload) => {
                              const point = payload?.[0]?.payload;
                              if (!point) return label;
                              return `${label} - ${point.opponent}`;
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="value"
                            name={activeTeamRow.team_name}
                            stroke={PALETTE.gold}
                            strokeWidth={3}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                          {comparisonTeamRow ? (
                            <Line
                              type="monotone"
                              dataKey="compareValue"
                              name={comparisonTeamRow.team_name}
                              stroke="#64748b"
                              strokeWidth={2}
                              strokeDasharray="6 4"
                              dot={{ r: 2 }}
                              activeDot={{ r: 4 }}
                              connectNulls={false}
                            />
                          ) : null}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}



