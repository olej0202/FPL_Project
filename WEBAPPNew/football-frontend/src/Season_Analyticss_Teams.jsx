import React, { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import { BarChart3, Grid2x2 } from "lucide-react";
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
  Cell,
} from "recharts";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos";

const MEASURE_OPTIONS = [
  { key: "total_points", label: "Total FPL Points" },
  { key: "expected_goals", label: "Expected Goals" },
  { key: "goals_scored", label: "Goals Scored" },
  { key: "expected_goals_conceded", label: "Expected Goals Conceded" },
  { key: "goals_conceded", label: "Goals Conceded" },
  { key: "GOALSCONCEEDED-XGOALSCONCEEDED", label: "Goals Conceded - XGC" },
  { key: "defensive_contribution", label: "Defcon" },
  { key: "defcon_hit", label: "Defcon Hit" },
  { key: "GOALS-XG", label: "Goals - XG" },
  { key: "saves", label: "Saves" },
  { key: "yellow_cards", label: "Yellow Cards" },
  { key: "clean_sheets", label: "Clean Sheets" },
];

const LOW_IS_GOOD = new Set([
  "expected_goals_conceded",
  "goals_conceded",
  "GOALSCONCEEDED-XGOALSCONCEEDED",
  "yellow_cards",
]);

const THRESHOLDS = {
  expected_goals: { direction: "high", good: 1.7, bad: 0.9 },
  goals_scored: { direction: "high", good: 1.7, bad: 0.91 },
  total_points: { direction: "high", good: 50.0, bad: 30.0 },
  saves: { direction: "high", good: 3.3, bad: 2.0 },
  clean_sheets: { direction: "high", good: 0.51, bad: 0.2 },
  defcon_hit: { direction: "high", good: 2, bad: 1 },
  "GOALS-XG": { direction: "low", good: -0.3, bad: 0.3 },
  expected_goals_conceded: { direction: "low", good: 0.95, bad: 1.6 },
  goals_conceded: { direction: "low", good: 0.95, bad: 1.6 },
  "GOALSCONCEEDED-XGOALSCONCEEDED": { direction: "high", good: 0.3, bad: -0.3 },
  yellow_cards: { direction: "low", good: 1.3, bad: 2.3 },
  defaultHigh: { direction: "high", good: null, bad: null },
  defaultLow: { direction: "low", good: null, bad: null },
};

const COLORS = {
  bothGood: "#76AFA0",
  bothBad: "#ef4444",
  mixed: "#f59e0b",
  neutral: "#60a5fa",
};

function deriveThresholds(key, rows, valueSelector) {
  const dir = LOW_IS_GOOD.has(key) ? "low" : "high";
  const manual =
    THRESHOLDS[key] ?? (dir === "low" ? THRESHOLDS.defaultLow : THRESHOLDS.defaultHigh);

  if (manual.good != null && manual.bad != null) return manual;

  const values = rows
    .map((row) => valueSelector(row))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!values.length) return manual;

  const q = (p) => {
    const idx = (values.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? values[lo] : values[lo] + (values[hi] - values[lo]) * (idx - lo);
  };

  return dir === "high"
    ? { direction: "high", good: q(0.75), bad: q(0.25) }
    : { direction: "low", good: q(0.25), bad: q(0.75) };
}

function zoneOf(value, threshold) {
  if (!threshold) return "neutral";
  if (!Number.isFinite(value) || threshold.good == null || threshold.bad == null) return "neutral";
  if (threshold.direction === "high") {
    if (value >= threshold.good) return "good";
    if (value <= threshold.bad) return "bad";
    return "neutral";
  }
  if (value <= threshold.good) return "good";
  if (value >= threshold.bad) return "bad";
  return "neutral";
}

function scaleThreshold(threshold, factor, isTotalMode) {
  if (!threshold || !isTotalMode) return threshold;
  return {
    ...threshold,
    good: threshold.good == null ? null : threshold.good * factor,
    bad: threshold.bad == null ? null : threshold.bad * factor,
  };
}

function labelOf(key) {
  return MEASURE_OPTIONS.find((measure) => measure.key === key)?.label || key;
}

function formatMetric(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (Math.abs(num) >= 10 || Number.isInteger(num)) return num.toFixed(1).replace(/\.0$/, "");
  return num.toFixed(2);
}

function getTeamKey(row) {
  return String(row?.Full_Name ?? row?.full_name ?? row?.name ?? row?.team_name ?? "").trim();
}

function getTeamDisplayName(row) {
  const candidates = [row?.web_name, row?.name, row?.team_name, row?.Full_Name];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "0") return value;
  }
  return getTeamKey(row);
}

function getTeamCellColor(value, minValue, maxValue) {
  if (!Number.isFinite(value)) return "rgba(248, 250, 252, 0.9)";
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || Math.abs(maxValue - minValue) < 1e-9) {
    return "hsl(55 92% 84%)";
  }
  const t = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  const hue = 6 + t * 114;
  const lightness = 93 - t * 20;
  return `hsl(${hue} 88% ${lightness}%)`;
}

function TeamIdentity({ row }) {
  const logo = teamLogos[row.name] || "";

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logo ? (
        <img
          src={logo}
          alt={row.name}
          className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1"
        />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-slate-100" />
      )}
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{row.name}</div>
      </div>
    </div>
  );
}

function BarChartNameTick({ x, y, payload, teamMetaMap }) {
  const value = String(payload?.value ?? "");
  const row = teamMetaMap.get(value);
  const logo = row ? teamLogos[row.name] || "" : "";

  return (
    <g transform={`translate(${x},${y})`}>
      {logo ? (
        <image
          href={logo}
          x={-108}
          y={-14}
          width={24}
          height={24}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
      <text
        x={logo ? -78 : -108}
        y={0}
        dy={4}
        textAnchor="start"
        fill="#334155"
        fontSize={12}
        fontWeight={600}
      >
        {value}
      </text>
    </g>
  );
}

function RankedTeamList({ rows, mode, selectedMeasure }) {
  if (!rows.length) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-[minmax(0,1.5fr)_110px_90px] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <div>Team</div>
        <div className="text-right">{mode === "average" ? "Average" : "Total"}</div>
        <div className="text-right">{labelOf(selectedMeasure)}</div>
      </div>
      <div className="divide-y divide-slate-100 bg-white">
        {rows.map((row) => {
          const metricValue = mode === "average" ? row.avg : row.total;
          return (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,1.5fr)_110px_90px] gap-3 px-4 py-3 text-sm"
            >
              <TeamIdentity row={row} />
              <div className="self-center text-right text-slate-600">{formatMetric(metricValue)}</div>
              <div className="self-center text-right font-semibold text-slate-900">{formatMetric(metricValue)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatrixTable({ rows, gws, selectedMeasure, mode }) {
  const heatRange = useMemo(() => {
    const values = rows
      .flatMap((row) => row.gwValues.map((value) => Number(value)))
      .filter(Number.isFinite);
    if (!values.length) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [rows]);

  if (!rows.length) {
    return <div className="py-10 text-center text-slate-500">No data after filters.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="sticky left-0 z-20 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">
              Team
            </th>
            <th className="border-b border-r border-slate-200 px-3 py-3 text-right">
              {mode === "average" ? "Avg" : "Total"}
            </th>
            {gws.map((gw) => (
              <th
                key={gw}
                className="min-w-[92px] border-b border-r border-slate-200 px-3 py-3 text-center"
              >
                GW {gw}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                <TeamIdentity row={row} />
              </td>
              <td className="border-r border-slate-200 px-3 py-3 text-right font-semibold text-slate-900">
                {formatMetric(mode === "average" ? row.avg : row.total)}
              </td>
              {row.gwValues.map((value, index) => (
                <td
                  key={`${row.id}-${gws[index]}`}
                  className="border-r border-slate-200 px-2 py-3 text-center font-semibold text-slate-800"
                  style={{
                    background: getTeamCellColor(
                      Number.isFinite(Number(value)) ? Number(value) : null,
                      heatRange.min,
                      heatRange.max
                    ),
                  }}
                  title={`GW ${gws[index]} ${labelOf(selectedMeasure)}: ${formatMetric(value)}`}
                >
                  {formatMetric(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SeasonAnalyticsTeams = () => {
  const { fetchIfNeeded, SeasonData } = useOtherData() || {};

  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMeasure, setSelectedMeasure] = useState(MEASURE_OPTIONS[0].key);
  const [selectedMeasure2, setSelectedMeasure2] = useState("");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);
  const [topX, setTopX] = useState(20);
  const [mode, setMode] = useState("average");
  const [singleView, setSingleView] = useState("chart");
  const [teamFilter, setTeamFilter] = useState(new Set());
  const [rankDirection, setRankDirection] = useState("top");

  const bottomEligibleKeys = new Set(["GOALS-XG", "GOALSCONCEEDED-XGOALSCONCEEDED"]);
  const bottomEligible = bottomEligibleKeys.has(selectedMeasure);
  const isDoubleMeasure = !!selectedMeasure2 && selectedMeasure2 !== selectedMeasure;

  useEffect(() => {
    if (!bottomEligible) setRankDirection("top");
  }, [bottomEligible]);

  useEffect(() => {
    if (isDoubleMeasure) {
      setSingleView("chart");
    }
  }, [isDoubleMeasure]);

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

  const allTeams = useMemo(() => {
    const teams = new Set();
    for (const row of rowsRaw) {
      const type = String((row?.Type ?? row?.type) ?? "").toLowerCase();
      if (type !== "teams") continue;
      const teamName = getTeamDisplayName(row);
      if (teamName) teams.add(teamName);
    }
    return Array.from(teams).sort((a, b) => a.localeCompare(b));
  }, [rowsRaw]);

  const toggleTeam = (teamName) => {
    setTeamFilter((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) next.delete(teamName);
      else next.add(teamName);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const [gmin, gmax] = GWRange;
    return rowsRaw.filter((row) => {
      const type = String((row?.Type ?? row?.type) ?? "").toLowerCase();
      if (type !== "teams") return false;

      const gw = Number(row?.GW);
      if (!Number.isFinite(gw) || gw < gmin || gw > gmax) return false;

      const teamName = getTeamDisplayName(row);
      if (teamFilter.size > 0 && !teamFilter.has(teamName)) return false;

      return true;
    });
  }, [rowsRaw, GWRange, teamFilter]);

  const aggregateByTeam = useCallback(
    (metricKey) => {
      const acc = new Map();

      for (const row of filtered) {
        const id = getTeamKey(row);
        if (!id) continue;

        const value = Number(row?.[metricKey]);
        if (!Number.isFinite(value)) continue;

        if (!acc.has(id)) {
          acc.set(id, {
            id,
            name: getTeamDisplayName(row),
            sum: 0,
            samples: 0,
          });
        }

        const current = acc.get(id);
        current.sum += value;
        current.samples += 1;
      }

      const out = [];
      for (const team of acc.values()) {
        if (team.samples <= 0) continue;
        out.push({
          ...team,
          avg: team.sum / team.samples,
          total: team.sum,
        });
      }

      out.sort((a, b) => {
        const aValue = mode === "average" ? a.avg : a.total;
        const bValue = mode === "average" ? b.avg : b.total;
        return bValue - aValue || a.name.localeCompare(b.name);
      });

      return out;
    },
    [filtered, mode]
  );

  const groupedA = useMemo(() => aggregateByTeam(selectedMeasure), [aggregateByTeam, selectedMeasure]);
  const groupedB = useMemo(
    () => (isDoubleMeasure ? aggregateByTeam(selectedMeasure2) : []),
    [aggregateByTeam, isDoubleMeasure, selectedMeasure2]
  );

  const rankedRows = useMemo(() => {
    const limit = Math.max(1, Math.min(200, Number(topX) || 10));
    if (bottomEligible && rankDirection === "bottom") {
      return [...groupedA].reverse().slice(0, limit);
    }
    return groupedA.slice(0, limit);
  }, [bottomEligible, groupedA, rankDirection, topX]);

  const chartData = useMemo(
    () =>
      rankedRows.map((row) => ({
        id: row.id,
        name: row.name,
        Value: Number((mode === "average" ? row.avg : row.total).toFixed(3)),
      })),
    [mode, rankedRows]
  );

  const teamMetaMap = useMemo(() => {
    const next = new Map();
    for (const row of rankedRows) {
      next.set(row.name, row);
    }
    return next;
  }, [rankedRows]);

  const mapB = useMemo(() => {
    const next = new Map();
    for (const row of groupedB) next.set(row.id, row);
    return next;
  }, [groupedB]);

  const valueForMode = (row) => (mode === "average" ? row.avg : row.total);

  const scatterData = useMemo(() => {
    if (!isDoubleMeasure) return [];

    const txBase = deriveThresholds(selectedMeasure, rankedRows, (row) => Number(valueForMode(row)));
    const tyBase = deriveThresholds(selectedMeasure2, Array.from(mapB.values()), (row) => Number(valueForMode(row)));
    const tx = scaleThreshold(txBase, gwCount, mode === "total");
    const ty = scaleThreshold(tyBase, gwCount, mode === "total");

    const data = [];
    for (const row of rankedRows) {
      const other = mapB.get(row.id);
      if (!other) continue;

      const x = Number(valueForMode(row));
      const y = Number(valueForMode(other));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const zx = zoneOf(x, tx);
      const zy = zoneOf(y, ty);

      let fill = COLORS.neutral;
      if (zx === "good" && zy === "good") fill = COLORS.bothGood;
      else if (zx === "bad" && zy === "bad") fill = COLORS.bothBad;
      else if ((zx === "good" && zy === "bad") || (zx === "bad" && zy === "good")) fill = COLORS.mixed;

      data.push({ id: row.id, name: row.name, x, y, fill });
    }

    return Object.assign(data, { _tx: tx, _ty: ty });
  }, [gwCount, isDoubleMeasure, mapB, mode, rankedRows, selectedMeasure, selectedMeasure2]);

  const tX = scatterData?._tx || null;
  const tY = scatterData?._ty || null;

  const { xDomain, yDomain } = useMemo(() => {
    if (!Array.isArray(scatterData) || scatterData.length === 0) {
      return { xDomain: ["auto", "auto"], yDomain: ["auto", "auto"] };
    }

    const xs = scatterData.map((d) => Number(d.x)).filter(Number.isFinite);
    const ys = scatterData.map((d) => Number(d.y)).filter(Number.isFinite);
    if (tX && Number.isFinite(Number(tX.good))) xs.push(Number(tX.good));
    if (tX && Number.isFinite(Number(tX.bad))) xs.push(Number(tX.bad));
    if (tY && Number.isFinite(Number(tY.good))) ys.push(Number(tY.good));
    if (tY && Number.isFinite(Number(tY.bad))) ys.push(Number(tY.bad));

    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    const padX = Math.max((maxX - minX) * 0.05, 0.05);
    const padY = Math.max((maxY - minY) * 0.05, 0.05);

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      minX = 0;
      maxX = 1;
    } else if (maxX === minX) {
      minX -= 0.5;
      maxX += 0.5;
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minY = 0;
      maxY = 1;
    } else if (maxY === minY) {
      minY -= 0.5;
      maxY += 0.5;
    }

    return {
      xDomain: [minX - padX, maxX + padX],
      yDomain: [minY - padY, maxY + padY],
    };
  }, [scatterData, tX, tY]);

  const gwColumns = useMemo(() => {
    return Array.from(
      new Set(filtered.map((row) => Number(row?.GW)).filter(Number.isFinite))
    ).sort((a, b) => a - b);
  }, [filtered]);

  const teamGwMeasureMap = useMemo(() => {
    const acc = new Map();

    for (const row of filtered) {
      const id = getTeamKey(row);
      const gw = Number(row?.GW);
      const value = Number(row?.[selectedMeasure]);
      if (!id || !Number.isFinite(gw) || !Number.isFinite(value)) continue;

      if (!acc.has(id)) acc.set(id, new Map());
      const teamGwMap = acc.get(id);
      const current = teamGwMap.get(gw) ?? { sum: 0, samples: 0 };
      current.sum += value;
      current.samples += 1;
      teamGwMap.set(gw, current);
    }

    const resolved = new Map();
    for (const [id, gwMap] of acc.entries()) {
      const finalGwMap = new Map();
      for (const [gw, value] of gwMap.entries()) {
        finalGwMap.set(gw, mode === "average" ? value.sum / value.samples : value.sum);
      }
      resolved.set(id, finalGwMap);
    }
    return resolved;
  }, [filtered, mode, selectedMeasure]);

  const matrixRows = useMemo(() => {
    return rankedRows.map((row) => {
      const gwMap = teamGwMeasureMap.get(row.id) ?? new Map();
      return {
        ...row,
        gwValues: gwColumns.map((gw) => {
          const value = gwMap.get(gw);
          return Number.isFinite(Number(value)) ? Number(value) : null;
        }),
      };
    });
  }, [gwColumns, rankedRows, teamGwMeasureMap]);

  const NameLabel = ({ x, y, value }) => {
    if (typeof x !== "number" || typeof y !== "number" || typeof value !== "string") return null;
    return (
      <text
        x={x}
        y={y - 6}
        fontSize={11}
        fill="#334155"
        textAnchor="middle"
        style={{ pointerEvents: "none" }}
      >
        {value}
      </text>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-10">
        <header className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Current Season Team Analysis
          </h1>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="col-span-1">
            <label className="mb-1 block text-[clamp(0.75rem,0.6vw+0.6rem,1rem)] uppercase tracking-wide text-slate-500">
              Measure A
            </label>
            <select
              value={selectedMeasure}
              onChange={(event) => setSelectedMeasure(event.target.value)}
              className="h-[clamp(2.5rem,1vw+2.2rem,3rem)] w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] text-slate-800 outline-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {MEASURE_OPTIONS.map((measure) => (
                <option key={measure.key} value={measure.key} className="bg-white text-slate-800">
                  {measure.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-1">
            <label className="mb-1 block text-[clamp(0.75rem,0.6vw+0.6rem,1rem)] uppercase tracking-wide text-slate-500">
              Second Measure
            </label>
            <select
              value={selectedMeasure2}
              onChange={(event) => setSelectedMeasure2(event.target.value)}
              className="h-[clamp(2.5rem,1vw+2.2rem,3rem)] w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-[clamp(0.875rem,0.7vw+0.7rem,1.125rem)] text-slate-800 outline-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">-- None --</option>
              {MEASURE_OPTIONS.map((measure) => (
                <option key={measure.key} value={measure.key} className="bg-white text-slate-800">
                  {measure.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Aggregation
            </label>
            <div className="flex h-10 overflow-hidden rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setMode("average")}
                className={`flex-1 px-3 text-sm ${
                  mode === "average"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Average
              </button>
              <button
                type="button"
                onClick={() => setMode("total")}
                className={`flex-1 px-3 text-sm ${
                  mode === "total"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Total
              </button>
            </div>
          </div>

          <div className="col-span-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              {bottomEligible && rankDirection === "bottom" ? "Bottom X" : "Top X"}
            </label>
            <TextField
              type="number"
              size="small"
              inputProps={{ min: 1, max: 200 }}
              value={topX}
              onChange={(event) => setTopX(event.target.value)}
              fullWidth
              sx={{ input: { color: "#334155" } }}
            />
            {bottomEligible ? (
              <div className="mt-2 flex overflow-hidden rounded-md border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRankDirection("top")}
                  className={`flex-1 px-2 py-1 text-xs ${
                    rankDirection === "top"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => setRankDirection("bottom")}
                  className={`flex-1 px-2 py-1 text-xs ${
                    rankDirection === "bottom"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Bottom
                </button>
              </div>
            ) : null}
          </div>

          <div className="col-span-2">
            {minGW !== null && maxGW !== null ? (
              <Box sx={{ width: "100%" }}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-500">GW Range</span>
                  <span className="text-xs text-slate-600">
                    {GWRange[0]} - {GWRange[1]}
                  </span>
                </div>
                <Slider
                  value={GWRange}
                  min={minGW}
                  max={maxGW}
                  onChange={(_, value) => setGWRange(value)}
                  valueLabelDisplay="auto"
                  step={1}
                  sx={{ color: "#76AFA0" }}
                />
              </Box>
            ) : null}
          </div>
        </div>

        {!isDoubleMeasure ? (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Display</div>
              <button
                type="button"
                onClick={() => setSingleView("chart")}
                title="Barchart"
                aria-label="Barchart"
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  singleView === "chart"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <BarChart3 size={18} />
              </button>
              <button
                type="button"
                onClick={() => setSingleView("matrix")}
                title="Matrix"
                aria-label="Matrix"
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  singleView === "matrix"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Grid2x2 size={18} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Filter - Team</div>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-sky-50">
              <span className="truncate">
                {teamFilter.size === 0
                  ? "All teams"
                  : teamFilter.size === 1
                    ? Array.from(teamFilter)[0]
                    : `${teamFilter.size} teams selected`}
              </span>
              <span className="ml-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                Select
              </span>
            </summary>

            <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Teams</div>
                <button
                  type="button"
                  onClick={() => setTeamFilter(new Set())}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {allTeams.map((teamName) => {
                  const active = teamFilter.has(teamName);
                  const logo = teamLogos[teamName] || "";
                  return (
                    <label
                      key={teamName}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                        active ? "bg-sky-50 text-sky-900" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleTeam(teamName)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      {logo ? (
                        <img
                          src={logo}
                          alt={teamName}
                          className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5"
                        />
                      ) : null}
                      <span>{teamName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>

          {teamFilter.size > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {Array.from(teamFilter).sort((a, b) => a.localeCompare(b)).map((teamName) => (
                <button
                  key={teamName}
                  type="button"
                  onClick={() => toggleTeam(teamName)}
                  className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800"
                >
                  {teamName} ×
                </button>
              ))}
            </div>
          ) : null}

          {teamFilter.size > 0 ? (
            <button
              type="button"
              onClick={() => setTeamFilter(new Set())}
              className="mt-3 text-xs text-slate-700 underline hover:text-slate-500"
            >
              Clear team filter
            </button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          {!isDoubleMeasure && singleView === "chart" && chartData.length > 0 ? (
            <>
              <div style={{ width: "100%", height: Math.max(220, rankedRows.length * 50) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      tick={(props) => <BarChartNameTick {...props} teamMetaMap={teamMetaMap} />}
                    />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#475569" }} />
                    <Tooltip
                      formatter={(value) => Number(value).toFixed(3)}
                      labelFormatter={(label) => label}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #cbd5e1",
                        color: "#1e293b",
                      }}
                    />
                    <Bar dataKey="Value" fill="#76AFA0">
                      <LabelList
                        dataKey="Value"
                        position="right"
                        formatter={(value) => Number(value).toFixed(1)}
                        fill="#334155"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <RankedTeamList rows={rankedRows} mode={mode} selectedMeasure={selectedMeasure} />
            </>
          ) : null}

          {!isDoubleMeasure && singleView === "matrix" ? (
            <MatrixTable
              rows={matrixRows}
              gws={gwColumns}
              selectedMeasure={selectedMeasure}
              mode={mode}
            />
          ) : null}

          {isDoubleMeasure && scatterData.length > 0 ? (
            <>
              <div style={{ width: "100%", height: 520 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />

                    <XAxis
                      dataKey="x"
                      type="number"
                      name={labelOf(selectedMeasure)}
                      domain={xDomain}
                      allowDataOverflow
                      tick={{ fill: "#475569" }}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                      label={{
                        value: labelOf(selectedMeasure),
                        position: "insideBottom",
                        offset: -10,
                        fill: "#64748b",
                      }}
                    />

                    <YAxis
                      dataKey="y"
                      type="number"
                      name={labelOf(selectedMeasure2)}
                      domain={yDomain}
                      allowDataOverflow
                      tick={{ fill: "#475569" }}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                      label={{
                        value: labelOf(selectedMeasure2),
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                      }}
                    />

                    {tX && Number.isFinite(Number(tX.good)) ? (
                      <ReferenceLine x={Number(tX.good)} stroke="#16a34a" strokeDasharray="4 2" />
                    ) : null}
                    {tX && Number.isFinite(Number(tX.bad)) ? (
                      <ReferenceLine x={Number(tX.bad)} stroke="#dc2626" strokeDasharray="4 2" />
                    ) : null}
                    {tY && Number.isFinite(Number(tY.good)) ? (
                      <ReferenceLine y={Number(tY.good)} stroke="#16a34a" strokeDasharray="4 2" />
                    ) : null}
                    {tY && Number.isFinite(Number(tY.bad)) ? (
                      <ReferenceLine y={Number(tY.bad)} stroke="#dc2626" strokeDasharray="4 2" />
                    ) : null}

                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #cbd5e1" }}
                      labelStyle={{ color: "#1e293b" }}
                      itemStyle={{ color: "#1e293b" }}
                      formatter={(value, name) => [Number(value).toFixed(3), name]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                    />

                    <Scatter data={scatterData}>
                      {scatterData.map((entry) => (
                        <Cell key={entry.id} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="name" content={<NameLabel />} />
                      <ZAxis dataKey={null} range={[80, 80]} />
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <RankedTeamList rows={rankedRows} mode={mode} selectedMeasure={selectedMeasure} />
            </>
          ) : null}

          {((!isDoubleMeasure && singleView === "chart" && chartData.length === 0) ||
            (!isDoubleMeasure && singleView === "matrix" && matrixRows.length === 0) ||
            (isDoubleMeasure && scatterData.length === 0)) ? (
            <div className="py-10 text-center text-slate-500">No data after filters.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SeasonAnalyticsTeams;
