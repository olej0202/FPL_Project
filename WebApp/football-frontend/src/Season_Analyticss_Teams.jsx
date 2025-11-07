import React, { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from "recharts";
import { useOtherData } from "./Contexts/OtherContext";

/**
 * TeamMeasureAveragesChart (JS/JSX)
 * - Colors points based on "good/bad" thresholds for BOTH measures
 * - Draws threshold guide lines on X and Y axes
 * - Aggregation: Average | Total over selected GW range
 * - In Total mode, thresholds are multiplied by the number of selected GWs
 */

/* -------------------------- Config/options -------------------------- */

const MEASURE_OPTIONS = [
  { key: "total_points", label: "Total FPL Points" },
  { key: "expected_goals", label: "Expected Goals" },
  { key: "goals_scored", label: "Goals Scored" },
  { key: "expected_goals_conceded", label: "Expected Goals Conceded" },
  { key: "goals_conceded", label: "Goals Conceded" },
  { key: "GOALSCONCEEDED-XGOALSCONCEEDED", label: "Goals Conceded - XGC" },
  { key: "defcon_hit", label: "Defcon Hit" },
  { key: "GOALS-XG", label: "GOALS - XG" },
  { key: "saves", label: "Saves" },
  { key: "yellow_cards", label: "Yellow Cards" },
  { key: "clean_sheets", label: "Clean Sheets" },
];

// Metrics where "lower is better"
const LOW_IS_GOOD = new Set([
  "expected_goals_conceded",
  "goals_conceded",
  "GOALSCONCEEDED-XGOALSCONCEEDED",
  "yellow_cards",
]);

// Manual thresholds; if missing, auto-derive from quartiles
const THRESHOLDS = {
  // High is good
  expected_goals: { direction: "high", good: 1.7, bad: 0.9 }, // per-GW example
  goals_scored: { direction: "high", good: 1.7, bad: 0.91 },
  total_points: { direction: "high", good: 50.0, bad: 30.0 },
  saves: { direction: "high", good: 3.3, bad: 2.0 },
  clean_sheets: { direction: "high", good: 0.51, bad: 0.2 },
  defcon_hit: { direction: "high", good: 2, bad: 1 },
  "GOALS-XG": { direction: "low", good: -0.3, bad: 0.3 },

  // Low is good
  expected_goals_conceded: { direction: "low", good: 0.95, bad: 1.6 },
  goals_conceded: { direction: "low", good: 0.95, bad: 1.6 },
  "GOALSCONCEEDED-XGOALSCONCEEDED": { direction: "high", good: 0.3, bad: -0.3 },
  yellow_cards: { direction: "low", good: 1.3, bad: 2.3 },

  // Fallbacks (used internally)
  defaultHigh: { direction: "high", good: null, bad: null },
  defaultLow: { direction: "low", good: null, bad: null },
};

const COLORS = {
  bothGood: "#22c55e", // green
  bothBad: "#ef4444", // red
  mixed: "#f59e0b", // amber
  neutral: "#60a5fa", // blue
};

/* ---------------------------- Utilities ---------------------------- */

// Derive per-GW thresholds (manual first, otherwise quartiles)
function deriveThresholds(key, rows, valueSelector) {
  const dir = LOW_IS_GOOD.has(key) ? "low" : "high";
  const manual =
    THRESHOLDS[key] ?? (dir === "low" ? THRESHOLDS.defaultLow : THRESHOLDS.defaultHigh);

  if (manual.good != null && manual.bad != null) return manual;

  const vals = rows
    .map((r) => valueSelector(r))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!vals.length) return manual;

  const q = (p) => {
    const idx = (vals.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
  };

  // 75th/25th percentiles as auto thresholds
  return dir === "high"
    ? { direction: "high", good: q(0.75), bad: q(0.25) }
    : { direction: "low", good: q(0.25), bad: q(0.75) };
}

function zoneOf(val, t) {
  if (!t) return "neutral";
  if (!Number.isFinite(val) || t.good == null || t.bad == null) return "neutral";
  if (t.direction === "high") {
    if (val >= t.good) return "good";
    if (val <= t.bad) return "bad";
    return "neutral";
  } else {
    if (val <= t.good) return "good";
    if (val >= t.bad) return "bad";
    return "neutral";
  }
}

const labelOf = (key) => MEASURE_OPTIONS.find((m) => m.key === key)?.label || key;

// Scale per-GW thresholds by GW count in Total mode
function scaleThreshold(t, factor, isTotalMode) {
  if (!t) return t;
  if (!isTotalMode) return t;
  return {
    ...t,
    good: t.good == null ? null : t.good * factor,
    bad: t.bad == null ? null : t.bad * factor,
  };
}

/* ---------------------------- Component ---------------------------- */

const PlayerMeasureAveragesChart_TEAMS = () => {
  const { fetchIfNeeded, SeasonData } = useOtherData() || {};

  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMeasure, setSelectedMeasure] = useState(MEASURE_OPTIONS[0].key);
  const [selectedMeasure2, setSelectedMeasure2] = useState(""); // empty = disabled

  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);

  const [topX, setTopX] = useState(20);
  const [mode, setMode] = useState("average"); // 'average' | 'total'
  const [posFilter, setPosFilter] = useState(new Set());

  const [rankDirection, setRankDirection] = useState("top");
  const bottomEligibleKeys = new Set(["GOALS-XG", "GOALSCONCEEDED-XGOALSCONCEEDED"]);
  const bottomEligible = bottomEligibleKeys.has(selectedMeasure);

  useEffect(() => {
    if (!bottomEligible) setRankDirection("top");
  }, [bottomEligible]);

  // Load data
  useEffect(() => {
    (async () => {
      await fetchIfNeeded?.();
      const data = SeasonData?.current ?? [];
      if (!Array.isArray(data)) return;

      setRowsRaw(data);
      const gws = data.map((d) => Number(d.GW)).filter(Number.isFinite);
      if (gws.length) {
        const min = Math.min(...gws);
        const max = Math.max(...gws);
        setMinGW(min);
        setMaxGW(max);
        setGWRange([min, max]);
      }
    })();
  }, [fetchIfNeeded, SeasonData]);

  // GW count in current range
  const gwCount = useMemo(() => {
    if (
      Array.isArray(GWRange) &&
      Number.isFinite(GWRange[0]) &&
      Number.isFinite(GWRange[1])
    ) {
      return Math.max(0, GWRange[1] - GWRange[0] + 1);
    }
    return 1;
  }, [GWRange]);

  // Distinct positions (not shown for teams usually, but kept from original)
  const allPositions = useMemo(() => {
    const s = new Set();
    for (const r of rowsRaw) {
      const p = r?.position ?? r?.Position;
      if (p !== undefined && p !== null && String(p) !== "") s.add(String(p));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rowsRaw]);

  const togglePos = (p) => {
    setPosFilter((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  };

  // Filter: teams only + GW + position
  const filtered = useMemo(() => {
    const [gmin, gmax] = GWRange;
    return rowsRaw.filter((r) => {
      const type = String((r?.Type ?? r?.type) ?? "").toLowerCase();
      if (type !== "teams") return false;

      const gw = Number(r?.GW);
      if (!Number.isFinite(gw)) return false;
      if (gw < gmin || gw > gmax) return false;

      if (posFilter.size > 0) {
        const p = String((r?.position ?? r?.Position) ?? "");
        if (!posFilter.has(p)) return false;
      }
      return true;
    });
  }, [rowsRaw, GWRange, posFilter]);

  // Aggregate helper
  const aggregateByTeam = React.useCallback(
    (metricKey) => {
      const acc = new Map();

      for (const r of filtered) {
        const fullName = String(
          (r?.Full_Name ?? r?.full_name ?? r?.name ?? r?.team_name ?? "")
        ).trim();
        if (!fullName) continue;

        const val = Number(r?.[metricKey]);
        if (!Number.isFinite(val)) continue;

        if (!acc.has(fullName)) {
          acc.set(fullName, {
            id: fullName,
            name:
              typeof r?.web_name === "string" && r.web_name !== "0"
                ? r.web_name
                : fullName,
            sum: 0,
            samples: 0,
          });
        }
        const e = acc.get(fullName);
        e.sum += val;
        e.samples += 1;
      }

      const out = [];
      for (const e of acc.values()) {
        if (e.samples <= 0) continue;
        const avg = e.sum / e.samples;
        out.push({
          id: e.id,
          name: e.name,
          avg,
          total: e.sum,
          samples: e.samples,
        });
      }

      out.sort((a, b) => {
        const va = mode === "average" ? a.avg : a.total;
        const vb = mode === "average" ? b.avg : b.total;
        return vb - va || a.name.localeCompare(b.name);
      });

      return out;
    },
    [filtered, mode]
  );

  // Aggregation for primary measure (A)
  const groupedA = useMemo(
    () => aggregateByTeam(selectedMeasure),
    [aggregateByTeam, selectedMeasure]
  );

  // Rank & trim A
  const rankedRows = useMemo(() => {
    const n = Math.max(1, Math.min(200, Number(topX) || 10));
    if (bottomEligible && rankDirection === "bottom") {
      const asc = [...groupedA].reverse(); // lowest first
      return asc.slice(0, n);
    }
    return groupedA.slice(0, n);
  }, [groupedA, topX, bottomEligible, rankDirection]);

  // Bar data (single measure)
  const chartData = useMemo(
    () =>
      rankedRows.map((r) => ({
        name: r.name,
        Value: Number((mode === "average" ? r.avg : r.total).toFixed(3)),
      })),
    [rankedRows, mode]
  );

  // Double measure enabled?
  const isDoubleMeasure = !!selectedMeasure2 && selectedMeasure2 !== selectedMeasure;

  // Aggregation for second measure (B)
  const groupedB = useMemo(
    () => (isDoubleMeasure ? aggregateByTeam(selectedMeasure2) : []),
    [aggregateByTeam, selectedMeasure2, isDoubleMeasure]
  );

  const mapB = useMemo(() => {
    const m = new Map();
    for (const r of groupedB) m.set(r.id, r);
    return m;
  }, [groupedB]);

  const valueForMode = (row) => (mode === "average" ? row.avg : row.total);

  // Scatter data + thresholds + colors (with total-mode scaling)
  const scatterData = useMemo(() => {
    if (!isDoubleMeasure) return [];

    // 1) derive per-GW thresholds
    const txBase = deriveThresholds(selectedMeasure, rankedRows, (a) =>
      Number(valueForMode(a))
    );
    const tyBase = deriveThresholds(
      selectedMeasure2,
      Array.from(mapB.values()),
      (b) => Number(valueForMode(b))
    );

    // 2) scale to totals if needed
    const tx = scaleThreshold(txBase, gwCount, mode === "total");
    const ty = scaleThreshold(tyBase, gwCount, mode === "total");
    

    const data = [];
    for (const a of rankedRows) {
      const b = mapB.get(a.id);
      if (!b) continue;

      const x = Number(valueForMode(a));
      const y = Number(valueForMode(b));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const zx = zoneOf(x, tx);
      const zy = zoneOf(y, ty);

      let fill = COLORS.neutral;
      if (zx === "good" && zy === "good") fill = COLORS.bothGood;
      else if (zx === "bad" && zy === "bad") fill = COLORS.bothBad;
      else if (
        (zx === "good" && zy === "bad") ||
        (zx === "bad" && zy === "good")
      )
        fill = COLORS.mixed;

      data.push({ id: a.id, name: a.name, x, y, fill, zx, zy });
    }

    // keep thresholds for lines/caption
    return Object.assign(data, { _tx: tx, _ty: ty });
  }, [
    isDoubleMeasure,
    rankedRows,
    mapB,
    selectedMeasure,
    selectedMeasure2,
    mode,
    gwCount,
  ]);

  // pull thresholds for rendering
  const tX = scatterData?._tx || null;
  const tY = scatterData?._ty || null;

  const NameLabel = ({ x, y, value }) => {
    if (typeof x !== "number" || typeof y !== "number" || typeof value !== "string") return null;
    return (
      <text
        x={x}
        y={y - 6}
        fontSize={11}
        fill="#fff"
        textAnchor="middle"
        style={{ pointerEvents: "none" }}
      >
        {value}
      </text>
    );
  };
  // Axis domains: fit to data (+ thresholds) with a small pad
const { xDomain, yDomain } = useMemo(() => {
  if (!Array.isArray(scatterData) || scatterData.length === 0) {
    return { xDomain: ["auto", "auto"], yDomain: ["auto", "auto"] };
  }

  // collect values
  const xs = scatterData.map(d => Number(d.x)).filter(Number.isFinite);
  const ys = scatterData.map(d => Number(d.y)).filter(Number.isFinite);

  // include thresholds if present
  if (tX && Number.isFinite(Number(tX.good))) xs.push(Number(tX.good));
  if (tX && Number.isFinite(Number(tX.bad)))  xs.push(Number(tX.bad));
  if (tY && Number.isFinite(Number(tY.good))) ys.push(Number(tY.good));
  if (tY && Number.isFinite(Number(tY.bad)))  ys.push(Number(tY.bad));

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  // add 5% padding (fallback to small absolute pad if range is tiny)
  const padX = Math.max((maxX - minX) * 0.05, 0.05);
  const padY = Math.max((maxY - minY) * 0.05, 0.05);

  // handle flat ranges
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0; maxX = 1;
  } else if (maxX === minX) {
    minX -= 0.5; maxX += 0.5;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = 0; maxY = 1;
  } else if (maxY === minY) {
    minY -= 0.5; maxY += 0.5;
  }

  return {
    xDomain: [minX - padX, maxX + padX],
    yDomain: [minY - padY, maxY + padY],
  };
}, [scatterData, tX, tY]);


  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Current Season Team Analysis
          </h1>
        </header>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          {/* Measure A */}
          <div className="col-span-1">
            <label className="block uppercase tracking-wide text-neutral-400 mb-1 text-[clamp(0.75rem,0.6vw+0.6rem,1rem)]">
              Measure A
            </label>
            <select
              value={selectedMeasure}
              onChange={(e) => setSelectedMeasure(e.target.value)}
              className="w-full rounded-md border border-royal-gold bg-black/70 text-neutral-100 px-3 outline-royal-gold focus:outline-none ring-royal-gold/60 focus:ring-2 text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] h-[clamp(2.5rem,1vw+2.2rem,3rem)]"
              style={{ colorScheme: "dark" }}
            >
              {MEASURE_OPTIONS.map((m) => (
                <option key={m.key} value={m.key} className="bg-black text-neutral-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Measure B */}
          <div className="col-span-1">
            <label className="block uppercase tracking-wide text-neutral-400 mb-1 text-[clamp(0.75rem,0.6vw+0.6rem,1rem)]">
              Second Measure
            </label>
            <select
              value={selectedMeasure2}
              onChange={(e) => setSelectedMeasure2(e.target.value)}
              className="w-full rounded-md border border-royal-gold bg-black/70 text-neutral-100 px-3 outline-royal-gold focus:outline-none ring-royal-gold/60 focus:ring-2 text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] h-[clamp(2.5rem,1vw+2.2rem,3rem)]"
            >
              <option value="">— None —</option>
              {MEASURE_OPTIONS.map((m) => (
                <option key={m.key} value={m.key} className="bg-black text-neutral-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Aggregation */}
          <div className="col-span-1">
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Aggregation
            </label>
            <div className="flex h-10 rounded-md overflow-hidden border border-royal-gold">
              <button
                type="button"
                onClick={() => setMode("average")}
                className={`flex-1 text-sm px-3 ${
                  mode === "average"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "bg-black/70 text-neutral-200 hover:bg-white/10"
                }`}
              >
                Average
              </button>
              <button
                type="button"
                onClick={() => setMode("total")}
                className={`flex-1 text-sm px-3 ${
                  mode === "total"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "bg-black/70 text-neutral-200 hover:bg-white/10"
                }`}
              >
                Total
              </button>
            </div>
          </div>

          {/* Top/Bottom X */}
          <div className="col-span-1">
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              {bottomEligible && rankDirection === "bottom" ? "Bottom X" : "Top X"}
            </label>
            <TextField
              type="number"
              size="small"
              inputProps={{ min: 1, max: 200 }}
              value={topX}
              onChange={(e) => setTopX(e.target.value)}
              fullWidth
              sx={{ input: { color: "#eee" } }}
            />
            {bottomEligible && (
              <div className="mt-2 flex rounded-md overflow-hidden border border-royal-gold">
                <button
                  type="button"
                  onClick={() => setRankDirection("top")}
                  className={`flex-1 text-xs px-2 py-1 ${
                    rankDirection === "top"
                      ? "bg-emerald-600/20 text-emerald-200"
                      : "bg-black/70 text-neutral-200 hover:bg-white/10"
                  }`}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => setRankDirection("bottom")}
                  className={`flex-1 text-xs px-2 py-1 ${
                    rankDirection === "bottom"
                      ? "bg-emerald-600/20 text-emerald-200"
                      : "bg-black/70 text-neutral-200 hover:bg-white/10"
                  }`}
                >
                  Bottom
                </button>
              </div>
            )}
          </div>

          {/* GW Slider */}
          <div className="col-span-2">
            {minGW !== null && maxGW !== null && (
              <Box sx={{ width: "100%" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wide text-neutral-400">
                    GW Range
                  </span>
                  <span className="text-xs text-neutral-300">
                    {GWRange[0]} – {GWRange[1]}
                  </span>
                </div>
                <Slider
                  value={GWRange}
                  min={minGW}
                  max={maxGW}
                  onChange={(_, v) => setGWRange(v)}
                  valueLabelDisplay="auto"
                  step={1}
                  sx={{ color: "#B8860B" }}
                />
              </Box>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          {/* Single-measure BarChart */}
          {!isDoubleMeasure && chartData.length > 0 && (
            <div style={{ width: "100%", height: Math.max(200, rankedRows.length * 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: "#fff" }} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#fff" }} />
                  <Tooltip
                    formatter={(v) => Number(v).toFixed(3)}
                    labelFormatter={(l) => l}
                    contentStyle={{ backgroundColor: "#111", border: "1px solid #333", color: "#eee" }}
                  />
                  <Bar dataKey="Value" fill="#b8870bc9">
                    <LabelList dataKey="Value" position="right" formatter={(v) => Number(v).toFixed(1)} fill="#fff" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Double-measure Scatter with threshold coloring */}
          {isDoubleMeasure && scatterData.length > 0 && (
            <div style={{ width: "100%", height: 520 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid stroke="#333" strokeDasharray="3 3" />

                  <XAxis
  dataKey="x"
  type="number"
  name={labelOf(selectedMeasure)}
  domain={xDomain}
  allowDataOverflow
  tick={{ fill: "#fff" }}
  tickFormatter={(v) => Number(v).toFixed(1)}
  label={{ value: labelOf(selectedMeasure), position: "insideBottom", offset: -10, fill: "#bbb" }}
/>

<YAxis
  dataKey="y"
  type="number"
  name={labelOf(selectedMeasure2)}
  domain={yDomain}
  allowDataOverflow
  tick={{ fill: "#fff" }}
  tickFormatter={(v) => Number(v).toFixed(1)}
  label={{ value: labelOf(selectedMeasure2), angle: -90, position: "insideLeft", fill: "#bbb" }}
/>


                  {/* Threshold lines (already scaled in Total mode) */}
                  {tX && Number.isFinite(Number(tX.good)) && (
                    <ReferenceLine
                      x={Number(tX.good)}
                      stroke="#16a34a"
                      strokeDasharray="4 2"
                      label={{  fill: "#16a34a", position: "top" }}
                    />
                  )}
                  {tX && Number.isFinite(Number(tX.bad)) && (
                    <ReferenceLine
                      x={Number(tX.bad)}
                      stroke="#dc2626"
                      strokeDasharray="4 2"
                      label={{ fill: "#dc2626", position: "top" }}
                    />
                  )}
                  {tY && Number.isFinite(Number(tY.good)) && (
                    <ReferenceLine
                      y={Number(tY.good)}
                      stroke="#16a34a"
                      strokeDasharray="4 2"
                      label={{  fill: "#16a34a", position: "left" }}
                    />
                  )}
                  {tY && Number.isFinite(Number(tY.bad)) && (
                    <ReferenceLine
                      y={Number(tY.bad)}
                      stroke="#dc2626"
                      strokeDasharray="4 2"
                      label={{  fill: "#dc2626", position: "left" }}
                    />
                  )}

                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }}
                    labelStyle={{ color: "#fff" }}
                    itemStyle={{ color: "#fff" }}
                    formatter={(v, n) => [Number(v).toFixed(3), n]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                  />

                  {/* Each point uses its datum's `fill` */}
                  <Scatter data={scatterData}>
                    <LabelList dataKey="name" content={<NameLabel />} />
                    <ZAxis dataKey={null} range={[80, 80]} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>

              

              
            </div>
          )}

          {/* Empty state */}
          {((!isDoubleMeasure && chartData.length === 0) ||
            (isDoubleMeasure && scatterData.length === 0)) && (
            <div className="text-center text-neutral-400 py-10">No data after filters.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerMeasureAveragesChart_TEAMS;
