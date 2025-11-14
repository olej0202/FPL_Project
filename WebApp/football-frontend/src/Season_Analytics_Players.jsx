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
  // Scatter view
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
  ReferenceLine,
} from "recharts";
import { useOtherData } from "./Contexts/OtherContext";

/**
 * PlayerMeasureAveragesChart (with Double Measure → Scatter)
 * Data source: SeasonData.current (array of per-GW player rows)
 * Filters: GW range, Position set
 * Aggregation: Average | Total
 */

const MEASURE_OPTIONS = [
  { key: "total_points", label: "Total Points" },
  { key: "expected_goals", label: "Expected Goals" },
  { key: "goals_scored", label: "Goals Scored" },
  { key: "assists", label: "Assists" },
  { key: "expected_assists", label: "Expected Assists" },
  { key: "defcon_hit", label: "Defcon Hit" },
  { key: "GOALS-XG", label: "GOALS-XG" },
  { key: "Assist-XA", label: "Assist-XA" },
  { key: "saves", label: "Saves" },
  { key: "yellow_cards", label: "Yellow Cards" },
  { key: "clean_sheets", label: "Clean Sheets" },
];

export default function PlayerMeasureAveragesChart_Player() {
  const { fetchIfNeeded, SeasonData } = useOtherData();

  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMeasure, setSelectedMeasure] = useState(MEASURE_OPTIONS[0].key);
  const [selectedMeasure2, setSelectedMeasure2] = useState(""); // empty = disabled

  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);

  const [topX, setTopX] = useState(10);
  const [mode, setMode] = useState("average"); // 'average' | 'total'
  const [posFilter, setPosFilter] = useState(new Set()); // empty = all

  // Top/Bottom switch (kept for your “delta” style metrics)
  const [rankDirection, setRankDirection] = useState("top"); // 'top' | 'bottom'
  const bottomEligibleKeys = new Set(["GOALS-XG", "Assist-XA"]);
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

  // Distinct positions
const allPositions = useMemo(() => {
  const s = new Set();
  for (const r of rowsRaw) {
    const p = r?.position ?? r?.Position;
    const str = String(p);
    if (p != null && str !== "0" && str !== "") {
      s.add(str);
    }
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

  // Apply GW + position filters
 const filtered = useMemo(() => {
  const [gmin, gmax] = GWRange;
  return rowsRaw.filter((r) => {
    // keep only player rows
    const type = String(r?.Type ?? r?.type ?? "").toLowerCase();
    if (type !== "players") return false;

    const gw = Number(r?.GW);
    if (!Number.isFinite(gw)) return false;
    if (gw < gmin || gw > gmax) return false;

    if (posFilter.size > 0) {
      const p = String(r?.position ?? r?.Position ?? "");
      if (!posFilter.has(p)) return false;
    }
    return true;
  });
}, [rowsRaw, GWRange, posFilter]);

  // Aggregate helper (for any metric key) over filtered rows
  const aggregateByPlayer = React.useCallback(
    (metricKey) => {
      const acc = new Map();
      for (const r of filtered) {
        const fullName = String(
          r?.Full_Name ?? r?.full_name ?? r?.name ?? ""
        ).trim();
        if (!fullName) continue;

        const val = Number(r?.[metricKey]);
        if (!Number.isFinite(val)) continue;

        if (!acc.has(fullName)) {
          acc.set(fullName, {
            id: fullName,
            name: r?.web_name && r?.web_name !== "0" ? r.web_name : fullName,
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

      // Sort desc by chosen aggregation
      out.sort((a, b) => {
        const va = mode === "average" ? a.avg : a.total;
        const vb = mode === "average" ? b.avg : b.total;
        return vb - va || a.name.localeCompare(b.name);
      });
      return out;
    },
    [filtered, mode]
  );

  // Aggregation for primary measure
  const groupedA = useMemo(
    () => aggregateByPlayer(selectedMeasure),
    [aggregateByPlayer, selectedMeasure]
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

  // Bar chart data (single measure)
  const chartData = useMemo(
    () =>
      rankedRows.map((r) => ({
        name: r.name,
        Value: Number((mode === "average" ? r.avg : r.total).toFixed(3)),
      })),
    [rankedRows, mode]
  );

  // Double measure?
  const isDoubleMeasure =
    !!selectedMeasure2 && selectedMeasure2 !== selectedMeasure;

  // Aggregation for second measure (only when needed)
  const groupedB = useMemo(
    () => (isDoubleMeasure ? aggregateByPlayer(selectedMeasure2) : []),
    [aggregateByPlayer, selectedMeasure2, isDoubleMeasure]
  );

  const mapB = useMemo(() => {
    const m = new Map();
    for (const r of groupedB) m.set(r.id, r);
    return m;
  }, [groupedB]);

  const valueForMode = (row) => (mode === "average" ? row.avg : row.total);

  // Scatter data joins rankedRows (A) with aggregated B by id
  const scatterData = useMemo(() => {
    if (!isDoubleMeasure) return [];
    const out = [];
    for (const a of rankedRows) {
      const b = mapB.get(a.id);
      if (!b) continue;
      out.push({
        id: a.id,
        name: a.name,
        x: Number(valueForMode(a)),
        y: Number(valueForMode(b)),
      });
    }
    return out;
  }, [isDoubleMeasure, rankedRows, mapB]);

  const labelOf = (key) =>
    MEASURE_OPTIONS.find((m) => m.key === key)?.label || key;

  const NameLabel = ({ x, y, value }) => (
  <text
    x={x}
    y={y - 6}           // nudge above the dot
    fontSize={11}       // ← set your size here
    fill="#fff"
    textAnchor="middle"
    style={{ pointerEvents: "none" }}
  >
    {value}
  </text>
);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Current Season Player Analysis
          </h1>
        </header>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          {/* Measure A */}
          <div className="col-span-1">
            <label className="block uppercase tracking-wide text-neutral-400 mb-1
                  text-[clamp(0.75rem,0.6vw+0.6rem,1rem)]">
              Measure A
            </label>
            <select
              value={selectedMeasure}
              onChange={(e) => setSelectedMeasure(e.target.value)}
              className="w-full rounded-md border border-royal-gold bg-black/70 text-neutral-100 px-3
             outline-royal-gold focus:outline-none ring-royal-gold/60 focus:ring-2
             text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] h-[clamp(2.5rem,1vw+2.2rem,3rem)]"
              style={{ colorScheme: "dark" }}
            >
              {MEASURE_OPTIONS.map((m) => (
                <option key={m.key} value={m.key} className="bg-black text-neutral-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Measure B (optional) */}
          <div className="col-span-1">
            <label className="block uppercase tracking-wide text-neutral-400 mb-1
                  text-[clamp(0.75rem,0.6vw+0.6rem,1rem)]">
              Second Measure
            </label>
            <select
              value={selectedMeasure2}
              onChange={(e) => setSelectedMeasure2(e.target.value)}
              className="w-full rounded-md border border-royal-gold bg-black/70 text-neutral-100 px-3
             outline-royal-gold focus:outline-none ring-royal-gold/60 focus:ring-2
             text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] h-[clamp(2.5rem,1vw+2.2rem,3rem)]"
            >
              <option value="">— None —</option>
              {MEASURE_OPTIONS.map((m) => (
                <option key={m.key} value={m.key} className="bg-black text-neutral-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Aggregation toggle */}
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

          {/* Top/Bottom X + rank direction */}
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

        {/* Position filter */}
        <div className="mb-6">
          <div className="border border-white/10 rounded-2xl p-3 bg-white/5">
            <div className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Filter — Position
            </div>
            <div className="flex flex-wrap gap-2">
              {allPositions.map((p) => {
                const active = posFilter.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePos(p)}
                    className={`px-3 py-1 rounded-full hover:border-none text-sm transition-colors  ${
                      active
                        ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-200"
                        : "bg-black/40 border-white/10 text-neutral-300 hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              {allPositions.length === 0 && (
                <span className="text-neutral-400 text-sm">No positions found.</span>
              )}
            </div>
            {posFilter.size > 0 && (
              <button
                onClick={() => setPosFilter(new Set())}
                className="mt-3 text-xs text-neutral-700 underline hover:text-neutral-500"
              >
                Clear position filter
              </button>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          {/* Single-measure BarChart */}
          {!isDoubleMeasure && chartData.length > 0 && (
            <div
              style={{
                width: "100%",
                height: Math.max(200, rankedRows.length * 50),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 10, right: 0, left: 0, bottom: 10 }}
                >
                  <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12, fill: "#fff" }}
                  />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#fff" }} />
                  <Tooltip
                    formatter={(v) => Number(v).toFixed(3)}
                    labelFormatter={(l) => l}
                    contentStyle={{
                      backgroundColor: "#111",
                      border: "1px solid #333",
                      color: "#eee",
                    }}
                  />
                  <Bar dataKey="Value" fill="#b8870bc9">
                    <LabelList
                      dataKey="Value"
                      position="inside"
                      formatter={(v) => Number(v).toFixed(1)}
                      fill="#fff"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {isDoubleMeasure && scatterData.length > 0 && (
  <div style={{ width: "100%", height: 480 }}>
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
        <CartesianGrid stroke="#333" strokeDasharray="3 3" />

        <XAxis
          dataKey="x"
          type="number"
          name={labelOf(selectedMeasure)}
          tick={{ fill: "#fff" }}
          label={{
            value: labelOf(selectedMeasure),
            position: "insideBottom",
            offset: -10,
            fill: "#bbb",
          }}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={labelOf(selectedMeasure2)}
          tick={{ fill: "#fff" }}
          label={{
            value: labelOf(selectedMeasure2),
            angle: -90,
            position: "insideLeft",
            fill: "#bbb",
          }}
        />

        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{
            backgroundColor: "#111",
            border: "1px solid #333",
          }}
          // make tooltip text white
          labelStyle={{ color: "#fff" }}
          itemStyle={{ color: "#fff" }}
          formatter={(v, n) => [Number(v).toFixed(3), n]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
        />

        {/* Removed <Legend /> */}

        <ReferenceLine x={0} stroke="#666" />
        <ReferenceLine y={0} stroke="#666" />

        <Scatter data={scatterData} fill="#b8870bc9">
          {/* Add labels (player names) above each point */}
          <LabelList dataKey="name" content={<NameLabel />} />
          {/* constant point size */}
          <ZAxis dataKey={null} range={[80, 80]} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  </div>
)}


          {/* Empty state */}
          {((!isDoubleMeasure && chartData.length === 0) ||
            (isDoubleMeasure && scatterData.length === 0)) && (
            <div className="text-center text-neutral-400 py-10">
              No data after filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
