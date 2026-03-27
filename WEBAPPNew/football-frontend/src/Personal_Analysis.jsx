import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightCircle,
  BarChart3,
  BookOpenCheck,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar as RadarShape,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStatsData } from "./Contexts/StatsContext";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeType = (v) => String(v ?? "").trim().toLowerCase();

const shortLabel = (s, max = 15) => {
  const text = String(s ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
};

function detectType(row, teamNameSet) {
  const type = normalizeType(row?.Type ?? row?.type);
  if (type === "team" || type === "player") return type;

  const subject = String(row?.player ?? "").trim();
  return teamNameSet.has(subject) ? "team" : "player";
}

function normalizeAnalyses(rows, teamNameSet) {
  return (rows || []).map((row, idx) => {
    const subject = String(row?.player ?? "").trim();
    const metric = String(row?.metric ?? "Unknown").trim() || "Unknown";
    const type = detectType(row, teamNameSet);

    return {
      id: row?.id ?? null,
      key: row?.id ?? `${row?.name ?? "analysis"}_${subject}_${metric}_${idx}`,
      name: row?.name || row?.id || "Saved analysis",
      subject,
      metric,
      total: toNum(row?.TotalOfMetric),
      avg: toNum(row?.avgOfMetric),
      type,
      rawType: row?.Type || row?.type || type,
    };
  });
}

function makeSummary(rows) {
  const count = rows.length;
  const total = rows.reduce((acc, r) => acc + toNum(r?.total), 0);
  const avg = rows.reduce((acc, r) => acc + toNum(r?.avg), 0);

  return {
    count,
    total,
    avg: count ? avg / count : 0,
    avgTotal: count ? total / count : 0,
  };
}

function metricBreakdown(rows) {
  const map = new Map();
  for (const row of rows) {
    const metric = row.metric || "Unknown";
    const prev = map.get(metric) || { metric, count: 0, total: 0 };
    prev.count += 1;
    prev.total += toNum(row.total);
    map.set(metric, prev);
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.total - a.total);
}

function buildAnalysisSeries(rows) {
  const seen = new Map();

  return (rows || []).map((row) => {
    const baseName = String(row?.name ?? "Saved analysis").trim() || "Saved analysis";
    const nextCount = (seen.get(baseName) || 0) + 1;
    seen.set(baseName, nextCount);

    const labelBase = shortLabel(baseName, 18);
    const label = nextCount > 1 ? `${labelBase} (${nextCount})` : labelBase;

    return {
      analysisKey: row.key,
      label,
      fullName: baseName,
      subject: row.subject || "-",
      metric: row.metric || "-",
      total: toNum(row.total),
      avg: toNum(row.avg),
      type: row.type || "unknown",
    };
  });
}

function aggregateByMetric(rows) {
  const map = new Map();
  for (const row of rows) {
    const metric = row.metric || "Unknown";
    const prev = map.get(metric) || {
      metric,
      total: 0,
      avgSum: 0,
      count: 0,
    };

    prev.total += toNum(row.total);
    prev.avgSum += toNum(row.avg);
    prev.count += 1;
    map.set(metric, prev);
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      avg: r.count ? r.avgSum / r.count : 0,
      label: shortLabel(r.metric),
    }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}

function Breakdown({ rows }) {
  const items = useMemo(() => metricBreakdown(rows), [rows]);
  const maxCount = items.length ? Math.max(...items.map((i) => i.count)) : 1;

  if (!items.length) {
    return <div className="text-sm text-slate-500">No saved analyses yet.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.metric} className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{item.metric}</span>
            <span className="text-xs text-slate-500">{item.count} saved</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-emerald-400"
              style={{ width: `${Math.max(6, (item.count / maxCount) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalysisList({ rows, onRemove, badgeClass }) {
  if (!rows.length) {
    return <div className="text-sm text-slate-500">No entries available.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-800">{row.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                Subject: <span className="text-slate-700">{row.subject || "-"}</span>
              </div>
              <div className="text-xs text-slate-500">
                Metric: <span className="text-slate-700">{row.metric || "-"}</span>
              </div>
              <div className="text-xs text-slate-500">
                Total <span className="text-slate-700">{toNum(row.total).toFixed(2)}</span> | Avg{" "}
                <span className="text-slate-700">{toNum(row.avg).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                {row.rawType}
              </span>
              <button
                type="button"
                onClick={() => row.id && onRemove(row.id)}
                disabled={!row.id}
                className="rounded-full border border-slate-200 p-1 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Remove saved analysis"
                title="Remove saved analysis"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExplorerChart({ mode, analysisData, metricData, valueMode }) {
  const valueKey = valueMode === "avg" ? "avg" : "total";
  const valueLabel = valueMode === "avg" ? "Average" : "Total";

  if (mode === "subject_line") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={analysisData.slice(0, 20)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#1e293b" }}
            formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={valueKey}
            name={valueLabel}
            stroke={valueMode === "avg" ? "#0284c7" : "#16a34a"}
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (mode === "metric_radar") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={metricData.slice(0, 10)}>
          <PolarGrid />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "#334155" }} />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#1e293b" }}
          />
          <RadarShape
            name={`Metric ${valueLabel}`}
            dataKey={valueKey}
            stroke="#0ea5e9"
            fill="#0ea5e9"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={analysisData.slice(0, 20)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis stroke="#94a3b8" />
        <Tooltip
          contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#1e293b" }}
          formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
        />
        <Legend />
        <Bar
          dataKey={valueKey}
          name={valueLabel}
          fill={valueMode === "avg" ? "#0ea5e9" : "#22c55e"}
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function PersonalAnalysis() {
  const navigate = useNavigate();
  const { analyses = [], removeAnalysis, TeamData } = useStatsData();

  const [filterType, setFilterType] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [chartMode, setChartMode] = useState("subject_bar");
  const [valueMode, setValueMode] = useState("total");

  const teamNameSet = useMemo(() => {
    const src = Array.isArray(TeamData?.current) ? TeamData.current : [];
    return new Set(src.map((r) => r?.name || r?.Team).filter(Boolean));
  }, [TeamData]);

  const normalizedRows = useMemo(
    () => normalizeAnalyses(Array.isArray(analyses) ? analyses : [], teamNameSet),
    [analyses, teamNameSet]
  );

  const typedRows = useMemo(() => {
    if (filterType === "all") return normalizedRows;
    return normalizedRows.filter((r) => r.type === filterType);
  }, [normalizedRows, filterType]);

  const metricOptions = useMemo(
    () => ["all", ...Array.from(new Set(typedRows.map((r) => r.metric))).sort((a, b) => a.localeCompare(b))],
    [typedRows]
  );

  useEffect(() => {
    if (!metricOptions.includes(metricFilter)) setMetricFilter("all");
  }, [metricOptions, metricFilter]);

  const metricRows = useMemo(() => {
    if (metricFilter === "all") return typedRows;
    return typedRows.filter((r) => r.metric === metricFilter);
  }, [typedRows, metricFilter]);

  const subjectOptions = useMemo(
    () => ["all", ...Array.from(new Set(metricRows.map((r) => r.subject))).sort((a, b) => a.localeCompare(b))],
    [metricRows]
  );

  useEffect(() => {
    if (!subjectOptions.includes(subjectFilter)) setSubjectFilter("all");
  }, [subjectOptions, subjectFilter]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return metricRows.filter((r) => {
      const bySubject = subjectFilter === "all" || r.subject === subjectFilter;
      const byQuery =
        !query ||
        r.subject.toLowerCase().includes(query) ||
        r.metric.toLowerCase().includes(query) ||
        r.name.toLowerCase().includes(query);

      return bySubject && byQuery;
    });
  }, [metricRows, subjectFilter, searchTerm]);

  const filteredPlayers = useMemo(() => filteredRows.filter((r) => r.type === "player"), [filteredRows]);
  const filteredTeams = useMemo(() => filteredRows.filter((r) => r.type === "team"), [filteredRows]);

  const playerSummary = useMemo(() => makeSummary(filteredPlayers), [filteredPlayers]);
  const teamSummary = useMemo(() => makeSummary(filteredTeams), [filteredTeams]);

  const analysisChartData = useMemo(() => buildAnalysisSeries(filteredRows), [filteredRows]);
  const metricChartData = useMemo(() => aggregateByMetric(filteredRows), [filteredRows]);

  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold">Personal Analysis</h1>
        <p className="mt-1 text-sm text-slate-600">
          Explore your saved team and player analyses with filters, multiple chart views, and quick actions.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BookOpenCheck size={18} className="text-emerald-600" />
          <h2 className="text-lg font-semibold">How To Create Analyses</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate("/Player_Analytics/Individual")}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
          >
            <div>
              <div className="text-sm font-semibold text-slate-800">Create Player Analysis</div>
              <div className="text-xs text-slate-600">Open Player Analytics, set filters, then click Save Analysis.</div>
            </div>
            <ArrowRightCircle size={18} className="text-emerald-700" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/Team_Analytics/Team_Analysis")}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
          >
            <div>
              <div className="text-sm font-semibold text-slate-800">Create Team Analysis</div>
              <div className="text-xs text-slate-600">Open Team Analysis, set filters, then click Save Analysis.</div>
            </div>
            <ArrowRightCircle size={18} className="text-emerald-700" />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-amber-600" />
            <h2 className="text-lg font-semibold">Analysis Explorer</h2>
          </div>
          <div className="text-xs text-slate-500">
            Showing {filteredRows.length} of {normalizedRows.length} saved analyses
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All</option>
              <option value="player">Players</option>
              <option value="team">Teams</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Metric</label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={metricFilter}
              onChange={(e) => setMetricFilter(e.target.value)}
            >
              {metricOptions.map((m) => (
                <option key={m} value={m}>
                  {m === "all" ? "All metrics" : m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Player or Team</label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All names" : s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search metric or name..."
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setChartMode("subject_bar")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              chartMode === "subject_bar"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <BarChart3 size={14} /> Subject Bar
          </button>
          <button
            type="button"
            onClick={() => setChartMode("subject_line")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              chartMode === "subject_line"
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <BarChart3 size={14} /> Subject Line
          </button>
          <button
            type="button"
            onClick={() => setChartMode("metric_radar")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              chartMode === "metric_radar"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <BarChart3 size={14} /> Metric Radar
          </button>

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setValueMode("total")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              valueMode === "total"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Total
          </button>
          <button
            type="button"
            onClick={() => setValueMode("avg")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              valueMode === "avg"
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Avg
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-2">
          {filteredRows.length ? (
            <ExplorerChart
              mode={chartMode}
              analysisData={analysisChartData}
              metricData={metricChartData}
              valueMode={valueMode}
            />
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              No analyses match the current filters.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <UserRound size={18} className="text-emerald-600" />
            <h2 className="text-lg font-semibold">Player Analyses</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <SummaryCard label="Saved" value={playerSummary.count} />
            <SummaryCard label="Avg Total" value={playerSummary.avgTotal.toFixed(2)} />
            <SummaryCard label="Avg Value" value={playerSummary.avg.toFixed(2)} />
          </div>
          <div className="mb-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">Metric Activity</div>
            <Breakdown rows={filteredPlayers} />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700">Saved Player Entries</div>
            <AnalysisList
              rows={filteredPlayers}
              onRemove={removeAnalysis}
              badgeClass="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Shield size={18} className="text-sky-600" />
            <h2 className="text-lg font-semibold">Team Analyses</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <SummaryCard label="Saved" value={teamSummary.count} />
            <SummaryCard label="Avg Total" value={teamSummary.avgTotal.toFixed(2)} />
            <SummaryCard label="Avg Value" value={teamSummary.avg.toFixed(2)} />
          </div>
          <div className="mb-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">Metric Activity</div>
            <Breakdown rows={filteredTeams} />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700">Saved Team Entries</div>
            <AnalysisList
              rows={filteredTeams}
              onRemove={removeAnalysis}
              badgeClass="border-sky-200 bg-sky-50 text-sky-700"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-amber-600" />
          <h2 className="text-lg font-semibold">Portfolio Snapshot</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Total saved analyses: <span className="font-semibold text-slate-800">{filteredRows.length}</span>
          {" "}(players: {filteredPlayers.length}, teams: {filteredTeams.length}).
        </p>
      </section>
    </div>
  );
}
