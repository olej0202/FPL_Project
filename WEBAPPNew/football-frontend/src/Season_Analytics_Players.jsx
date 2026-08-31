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
} from "recharts";
import { useOtherData } from "./Contexts/OtherContext";
import { API_BASE_URL } from "./config/apiBase";

const MEASURE_OPTIONS = [
  { key: "total_points", label: "Total Points" },
  { key: "minutes", label: "Minutes" },
  { key: "expected_goals", label: "Expected Goals" },
  { key: "goals_scored", label: "Goals Scored" },
  { key: "assists", label: "Assists" },
  { key: "expected_assists", label: "Expected Assists" },
  { key: "XGI", label: "XGI" },
  { key: "defensive_contribution", label: "Defcon" },
  { key: "defcon_hit", label: "Defcon Hit" },
  { key: "GOALS-XG", label: "GOALS-XG" },
  { key: "Assist-XA", label: "Assist-XA" },
  { key: "XGI_delta", label: "XGI Delta" },
  { key: "saves", label: "Saves" },
  { key: "yellow_cards", label: "Yellow Cards" },
  { key: "clean_sheets", label: "Clean Sheets" },
];

const PLAYER_PHOTO_FALLBACK =
  "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function labelOf(key) {
  return MEASURE_OPTIONS.find((m) => m.key === key)?.label || key;
}

function formatMetric(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (Math.abs(num) >= 10 || Number.isInteger(num)) return num.toFixed(1).replace(/\.0$/, "");
  return num.toFixed(2);
}

function getPlayerKey(row) {
  return String(row?.Full_Name ?? row?.full_name ?? row?.name ?? "").trim();
}

function getPlayerDisplayName(row) {
  const webName = String(row?.web_name ?? "").trim();
  if (webName && webName !== "0") return webName;
  return getPlayerKey(row);
}

function getPlayerTeam(row) {
  return String(row?.team_name ?? row?.TeamName ?? row?.team ?? "").trim();
}

function getPlayerPosition(row) {
  return String(row?.position ?? row?.Position ?? "").trim();
}

function getPlayerCellColor(value, minValue, maxValue) {
  if (!Number.isFinite(value)) {
    return "rgba(248, 250, 252, 0.9)";
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || Math.abs(maxValue - minValue) < 1e-9) {
    return "hsl(55 92% 84%)";
  }
  const t = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  const hue = 6 + t * 114;
  const lightness = 93 - t * 20;
  return `hsl(${hue} 88% ${lightness}%)`;
}

function PlayerIdentity({ row, photoUrl }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img
        src={photoUrl || PLAYER_PHOTO_FALLBACK}
        alt={row.name}
        className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = PLAYER_PHOTO_FALLBACK;
        }}
      />
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{row.name}</div>
        <div className="truncate text-xs text-slate-500">
          {row.teamName || "-"}{row.position ? ` • ${row.position}` : ""}
        </div>
      </div>
    </div>
  );
}

function BarChartNameTick({ x, y, payload, playerMetaMap, photoMap }) {
  const value = String(payload?.value ?? "");
  const player = playerMetaMap.get(value);
  const photoUrl = photoMap[player?.id] || PLAYER_PHOTO_FALLBACK;

  return (
    <g transform={`translate(${x},${y})`}>
      <image
        href={photoUrl}
        x={-108}
        y={-14}
        width={24}
        height={24}
        rx={12}
        ry={12}
        preserveAspectRatio="xMidYMid slice"
      />
      <text
        x={-78}
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

function RankedPlayerList({ rows, photoMap, mode, selectedMeasure }) {
  if (!rows.length) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-[minmax(0,1.5fr)_110px_90px] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <div>Player</div>
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
              <PlayerIdentity row={row} photoUrl={photoMap[row.id]} />
              <div className="self-center text-right text-slate-600">{formatMetric(metricValue)}</div>
              <div className="self-center text-right font-semibold text-slate-900">{formatMetric(metricValue)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatrixTable({ rows, gws, photoMap, selectedMeasure, mode }) {
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
            <th className="sticky left-0 z-20 min-w-[260px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">
              Player
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
                <PlayerIdentity row={row} photoUrl={photoMap[row.id]} />
              </td>
              <td className="border-r border-slate-200 px-3 py-3 text-right font-semibold text-slate-900">
                {formatMetric(mode === "average" ? row.avg : row.total)}
              </td>
              {row.gwValues.map((value, index) => (
                <td
                  key={`${row.id}-${gws[index]}`}
                  className="border-r border-slate-200 px-2 py-3 text-center font-semibold text-slate-800"
                  style={{
                    background: getPlayerCellColor(
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

export default function PlayerMeasureAveragesChart_Player() {
  const { fetchIfNeeded, SeasonData } = useOtherData();

  const [rowsRaw, setRowsRaw] = useState([]);
  const [selectedMeasure, setSelectedMeasure] = useState(MEASURE_OPTIONS[0].key);
  const [selectedMeasure2, setSelectedMeasure2] = useState("");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);
  const [topX, setTopX] = useState(10);
  const [mode, setMode] = useState("average");
  const [singleView, setSingleView] = useState("chart");
  const [posFilter, setPosFilter] = useState(new Set());
  const [teamFilter, setTeamFilter] = useState(new Set());
  const [rankDirection, setRankDirection] = useState("top");
  const [photoMap, setPhotoMap] = useState({});

  const bottomEligibleKeys = new Set(["GOALS-XG", "Assist-XA", "XGI_delta"]);
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
      const gws = data
        .map((d) => Number(d.GW))
        .filter(Number.isFinite);
      if (gws.length) {
        const min = Math.min(...gws);
        const max = Math.max(...gws);
        setMinGW(min);
        setMaxGW(max);
        setGWRange([min, max]);
      }
    })();
  }, [fetchIfNeeded, SeasonData]);

  const allPositions = useMemo(() => {
    const positions = new Set();
    for (const row of rowsRaw) {
      const type = String(row?.Type ?? row?.type ?? "").toLowerCase();
      if (type !== "players") continue;
      const position = getPlayerPosition(row);
      if (position) positions.add(position);
    }
    return Array.from(positions).sort((a, b) => a.localeCompare(b));
  }, [rowsRaw]);

  const allTeams = useMemo(() => {
    const teams = new Set();
    for (const row of rowsRaw) {
      const type = String(row?.Type ?? row?.type ?? "").toLowerCase();
      if (type !== "players") continue;
      const teamName = getPlayerTeam(row);
      if (teamName) teams.add(teamName);
    }
    return Array.from(teams).sort((a, b) => a.localeCompare(b));
  }, [rowsRaw]);

  const togglePos = (position) => {
    setPosFilter((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };

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
      const type = String(row?.Type ?? row?.type ?? "").toLowerCase();
      if (type !== "players") return false;

      const gw = Number(row?.GW);
      if (!Number.isFinite(gw) || gw < gmin || gw > gmax) return false;

      const position = getPlayerPosition(row);
      if (posFilter.size > 0 && !posFilter.has(position)) return false;

      const teamName = getPlayerTeam(row);
      if (teamFilter.size > 0 && !teamFilter.has(teamName)) return false;

      return true;
    });
  }, [rowsRaw, GWRange, posFilter, teamFilter]);

  const aggregateByPlayer = useCallback(
    (metricKey) => {
      const acc = new Map();
      for (const row of filtered) {
        const id = getPlayerKey(row);
        if (!id) continue;

        const value = Number(row?.[metricKey]);
        if (!Number.isFinite(value)) continue;

        if (!acc.has(id)) {
          acc.set(id, {
            id,
            name: getPlayerDisplayName(row),
            teamName: getPlayerTeam(row),
            position: getPlayerPosition(row),
            sum: 0,
            samples: 0,
          });
        }

        const current = acc.get(id);
        current.sum += value;
        current.samples += 1;
      }

      const out = [];
      for (const player of acc.values()) {
        if (player.samples <= 0) continue;
        const avg = player.sum / player.samples;
        out.push({
          ...player,
          avg,
          total: player.sum,
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

  const groupedA = useMemo(() => aggregateByPlayer(selectedMeasure), [aggregateByPlayer, selectedMeasure]);
  const groupedB = useMemo(
    () => (isDoubleMeasure ? aggregateByPlayer(selectedMeasure2) : []),
    [aggregateByPlayer, isDoubleMeasure, selectedMeasure2]
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

  const playerMetaMap = useMemo(() => {
    const next = new Map();
    for (const row of rankedRows) {
      next.set(row.name, row);
    }
    return next;
  }, [rankedRows]);

  const groupedBMap = useMemo(() => {
    const next = new Map();
    for (const row of groupedB) next.set(row.id, row);
    return next;
  }, [groupedB]);

  const scatterData = useMemo(() => {
    if (!isDoubleMeasure) return [];

    const out = [];
    for (const row of rankedRows) {
      const other = groupedBMap.get(row.id);
      if (!other) continue;
      out.push({
        id: row.id,
        name: row.name,
        x: Number(mode === "average" ? row.avg : row.total),
        y: Number(mode === "average" ? other.avg : other.total),
      });
    }
    return out;
  }, [groupedBMap, isDoubleMeasure, mode, rankedRows]);

  const gwColumns = useMemo(() => {
    return Array.from(
      new Set(filtered.map((row) => Number(row?.GW)).filter(Number.isFinite))
    ).sort((a, b) => a - b);
  }, [filtered]);

  const playerGwMeasureMap = useMemo(() => {
    const acc = new Map();

    for (const row of filtered) {
      const id = getPlayerKey(row);
      const gw = Number(row?.GW);
      const value = Number(row?.[selectedMeasure]);
      if (!id || !Number.isFinite(gw) || !Number.isFinite(value)) continue;

      if (!acc.has(id)) acc.set(id, new Map());
      const playerGwMap = acc.get(id);
      const current = playerGwMap.get(gw) ?? { sum: 0, samples: 0 };
      current.sum += value;
      current.samples += 1;
      playerGwMap.set(gw, current);
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
      const gwMap = playerGwMeasureMap.get(row.id) ?? new Map();
      return {
        ...row,
        gwValues: gwColumns.map((gw) => {
          const value = gwMap.get(gw);
          return Number.isFinite(Number(value)) ? Number(value) : null;
        }),
      };
    });
  }, [gwColumns, playerGwMeasureMap, rankedRows]);

  const photoTargets = useMemo(() => rankedRows.map((row) => row.id).filter(Boolean), [rankedRows]);

  useEffect(() => {
    const missing = photoTargets.filter((id) => !(id in photoMap));
    if (!missing.length) return;

    let cancelled = false;

    Promise.all(
      missing.map(async (playerName) => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/Player_picture?player=${encodeURIComponent(playerName)}`
          );
          const url = (await response.text()).trim();
          return [playerName, url || PLAYER_PHOTO_FALLBACK];
        } catch {
          return [playerName, PLAYER_PHOTO_FALLBACK];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setPhotoMap((prev) => {
        const next = { ...prev };
        for (const [playerName, url] of entries) {
          next[playerName] = url;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [photoMap, photoTargets]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          padding: "10px",
          color: "#1e293b",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 6 }}>{point.name}</div>
        <div>{labelOf(selectedMeasure)}: {point.x.toFixed(3)}</div>
        <div>{labelOf(selectedMeasure2)}: {point.y.toFixed(3)}</div>
      </div>
    );
  };

  const NameLabel = ({ x, y, value }) => (
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-10">
        <header className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Current Season Player Analysis
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

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Filter - Position</div>
            <div className="flex flex-wrap gap-2">
              {allPositions.map((position) => {
                const active = posFilter.has(position);
                return (
                  <button
                    key={position}
                    type="button"
                    onClick={() => togglePos(position)}
                    className={`rounded-full px-3 py-1 text-sm transition-colors ${
                      active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {position}
                  </button>
                );
              })}
            </div>
            {posFilter.size > 0 ? (
              <button
                type="button"
                onClick={() => setPosFilter(new Set())}
                className="mt-3 text-xs text-slate-700 underline hover:text-slate-500"
              >
                Clear position filter
              </button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
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
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Teams
                  </div>
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
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          {!isDoubleMeasure && singleView === "chart" && chartData.length > 0 ? (
            <>
              <div
                style={{
                  width: "100%",
                  height: Math.max(220, rankedRows.length * 50),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 10, right: 0, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      tick={(props) => (
                        <BarChartNameTick
                          {...props}
                          playerMetaMap={playerMetaMap}
                          photoMap={photoMap}
                        />
                      )}
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
                        position="inside"
                        formatter={(value) => Number(value).toFixed(1)}
                        fill="#334155"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <RankedPlayerList
                rows={rankedRows}
                photoMap={photoMap}
                mode={mode}
                selectedMeasure={selectedMeasure}
              />
            </>
          ) : null}

          {!isDoubleMeasure && singleView === "matrix" ? (
            <MatrixTable
              rows={matrixRows}
              gws={gwColumns}
              photoMap={photoMap}
              selectedMeasure={selectedMeasure}
              mode={mode}
            />
          ) : null}

          {isDoubleMeasure && scatterData.length > 0 ? (
            <>
              <div style={{ width: "100%", height: 480 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      name={labelOf(selectedMeasure)}
                      tick={{ fill: "#475569" }}
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
                      tick={{ fill: "#475569" }}
                      label={{
                        value: labelOf(selectedMeasure2),
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine x={0} stroke="#666" />
                    <ReferenceLine y={0} stroke="#666" />
                    <Scatter data={scatterData} fill="#b8870bc9">
                      <LabelList dataKey="name" content={<NameLabel />} />
                      <ZAxis dataKey={null} range={[80, 80]} />
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <RankedPlayerList
                rows={rankedRows}
                photoMap={photoMap}
                mode={mode}
                selectedMeasure={selectedMeasure}
              />
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
}
