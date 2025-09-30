import React, { useEffect, useMemo, useState } from "react";
import teamLogos from "./utils/team_logos";
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStatsData } from "./Contexts/StatsContext";
import {
  Table as TableIcon,
  LineChart as ChartIcon,
  Save as SaveIcon,
  X as XIcon,
  Trash2 as TrashIcon,
} from "lucide-react";

export default function Team_Analytics_Analysis() {
  const {
    fetchIfNeeded,
    TeamData,
    selected_team,
    setselected_team,
    addAnalysis,     // from context
    analyses,        // from context
    removeAnalysis,  // <-- from context
  } = useStatsData();

  // ---- Config ----
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams";
  const METRICS = [
    { key: "XG", label: "XG" },
    { key: "XGC", label: "XGC" },
    { key: "Clean_Sheet", label: "Clean Sheet" },
    { key: "Threat", label: "Threat" },
  ];

  // ---- UI state ----
  const [team, setTeam] = useState(selected_team || "");
  const [teams, setTeams] = useState([]);
  const [viewMode, setViewMode] = useState("chart"); // 'chart' | 'table'
  const [metric, setMetric] = useState("XG");

  // non-metric filters
  const [opponentSel, setOpponentSel] = useState("all");
  const [opponents, setOpponents] = useState([]);
  const [wasHome, setWasHome] = useState("all"); // 'all' | 'home' | 'away'
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Save analysis modal
  const [modalOpen, setModalOpen] = useState(false);
  const [analysisName, setAnalysisName] = useState("");

  // ---- bootstrap teams + default team ----
  useEffect(() => {
    fetchIfNeeded?.();

    const list = Array.isArray(TeamData?.current)
      ? [...new Set(TeamData.current.map(r => r.name || r.Team).filter(Boolean))].sort()
      : [];
    setTeams(list);

    if (!team) {
      const defaultTeam =
        selected_team && list.includes(selected_team) ? selected_team : (list[0] || "");
      setTeam(defaultTeam);
      setselected_team?.(defaultTeam);
    }
  }, [fetchIfNeeded, TeamData?.current, selected_team]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeTeam = (t) => {
    setTeam(t);
    setselected_team?.(t);
    setOpponentSel("all");
    setWasHome("all");
    setDateFrom("");
    setDateTo("");
  };

  // ---- fetch team data whenever 'team' changes ----
  useEffect(() => {
    let alive = true;
    const fetchTeam = async () => {
      if (!team) return;
      setLoading(true);
      setErr(null);
      try {
        // Try server-side filter first
        const u = new URL(API_URL);
        u.searchParams.set("team", team);
        let r = await fetch(u.toString());
        let data = await r.json();

        // Fallback: fetch all and filter client-side
        if (!Array.isArray(data)) {
          const rAll = await fetch(API_URL);
          const dataAll = await rAll.json();
          data = Array.isArray(dataAll) ? dataAll.filter(d => (d.name || d.Team) === team) : [];
        }

        const toNum = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        const norm = (data || []).map((d, i) => {
          const name         = d.name ?? d.Team ?? "";
          const opponent     = d.opponent ?? d.Opponent ?? "";
          const kickoff_time = d.kickoff_time ?? d.date ?? d.kickoff ?? "";
          const was_home     = Number(d.was_home ?? d.wasHome ?? d.home ?? 0);

          // server id may repeat → create a guaranteed-unique render key
          const serverId = d.id ?? null;
          const rowKey = `${serverId ?? "noid"}|${name}|${opponent}|${kickoff_time}|${i}`;

          return {
            id: serverId,          // domain id
            __key: rowKey,         // unique React key
            name,
            opponent,
            was_home,
            kickoff_time,
            XG: toNum(d.XG),
            XGC: toNum(d.XGC),
            Clean_Sheet: toNum(d.Clean_Sheet),
            Threat: toNum(d.Threat),
          };
        });

        if (alive) {
          setRows(norm);
          const opps = [...new Set(norm.map(r => r.opponent).filter(Boolean))].sort();
          setOpponents(opps);
        }
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchTeam();
    return () => { alive = false; };
  }, [API_URL, team]);

  // ---- apply non-metric filters ----
  const filtered = useMemo(() => {
    let out = rows.slice();

    if (opponentSel !== "all") {
      out = out.filter(r => r.opponent === opponentSel);
    }

    if (wasHome === "home") out = out.filter(r => r.was_home === 1);
    if (wasHome === "away") out = out.filter(r => r.was_home === 0);

    const toDate = (s) => (s ? new Date(s) : null);
    const df = toDate(dateFrom);
    const dt = toDate(dateTo);
    if (df) out = out.filter(r => new Date(r.kickoff_time) >= df);
    if (dt) out = out.filter(r => new Date(r.kickoff_time) <= dt);

    out.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    return out;
  }, [rows, opponentSel, wasHome, dateFrom, dateTo]);

  // ---- chart data ----
  const chartData = useMemo(() => {
    return filtered
      .map(r => ({
        time: r.kickoff_time,
        value: Number.isFinite(r[metric]) ? r[metric] : null,
      }))
      .filter(d => d.value !== null);
  }, [filtered, metric]);

  // ---- metric summary (sum + average over filtered rows) ----
  const metricSummary = useMemo(() => {
    const vals = filtered.map(r => r[metric]).filter(Number.isFinite);
    const count = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = count ? sum / count : 0;
    return { sum, avg, count };
  }, [filtered, metric]);

  // ---- date bounds for placeholders ----
  const [minDate, maxDate] = useMemo(() => {
    if (!rows.length) return ["", ""];
    const times = rows.map(r => new Date(r.kickoff_time).getTime()).filter(Number.isFinite);
    const min = new Date(Math.min(...times));
    const max = new Date(Math.max(...times));
    const iso = (d) => d.toISOString().slice(0, 10);
    return [iso(min), iso(max)];
  }, [rows]);

  // --- map page vars → your desired payload field names ---
  const playerFilter = team;
  const selectedMetric = metric;
  const TotalOfMetric = metricSummary.sum;
  const avgOfMetric = metricSummary.avg;

  // --- Save handler (uses your function signature) ---
  const handleAddAnalysis = (name) => {
    const id = name || `${playerFilter}-${selectedMetric}-${Date.now()}`;
    addAnalysis?.({
      id,
      name: name || id,
      player: playerFilter,
      metric: selectedMetric,
      TotalOfMetric,
      avgOfMetric,
    });
    setModalOpen(false);
    setAnalysisName("");
  };

  // --- Remove handler ---
  const handleRemoveAnalysis = (id) => {
    if (!id || !removeAnalysis) return;
    removeAnalysis(id);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-8">
      {/* Team logo + selector */}
      <div className="flex flex-col items-center gap-3">
        {team ? (
          <img
            src={teamLogos[team] || ""}
            alt={`${team} logo`}
            className="h-20 object-contain"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : null}

        <select
          className="border border-royal-gold text-black text-center py-2 px-3 rounded"
          value={team}
          onChange={(e) => onChangeTeam(e.target.value)}
        >
          {teams.map((t) => (
            <option key={`team-${t}`} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Filters (includes Metric + Opponent dropdown) */}
      <div className="w-full max-w-6xl bg-black/30 border border-royal-gold rounded p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-300 mb-1">Metric</label>
            <select
              className="border border-royal-gold rounded text-black px-2 py-1"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map(m => (
                <option key={`metric-${m.key}`} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-300 mb-1">Opponent</label>
            <select
              className="border border-royal-gold rounded text-black px-2 py-1"
              value={opponentSel}
              onChange={(e) => setOpponentSel(e.target.value)}
            >
              <option key="opp-all" value="all">All opponents</option>
              {opponents.map(o => (
                <option key={`opp-${o}`} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-300 mb-1">Venue</label>
            <select
              className="border border-royal-gold rounded text-black px-2 py-1"
              value={wasHome}
              onChange={(e) => setWasHome(e.target.value)}
            >
              <option value="all">All</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-300 mb-1">From (date)</label>
            <input
              type="date"
              className="border border-royal-gold rounded text-black px-2 py-1"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder={minDate || ""}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-300 mb-1">To (date)</label>
            <input
              type="date"
              className="border border-royal-gold rounded text-black px-2 py-1"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder={maxDate || ""}
            />
          </div>
        </div>
      </div>
      <div className="flex-items-center text-center">
        <h2>Save Analysis</h2>
        <button
              aria-label="Save analysis"
              onClick={() => setModalOpen(true)}
              className="p-1 rounded text-royal-gold hover:text-royal-gold transition py-1 mt-5"
              title="Save analysis"
              disabled={!addAnalysis}
            >
              <SaveIcon size={30} />
            </button>
      </div>
      <div className="flex items-center gap-4">
            <button
              aria-label="Show chart"
              onClick={() => setViewMode("chart")}
              className={`p-1 rounded ${viewMode === "chart" ? "text-royal-gold cursor-pointer underline border-royal-gold " : "text-white"} hover:text-royal-gold transition bg-black`}
              title="Chart"
            >
              <ChartIcon size={20} />
            </button>
            <button
              aria-label="Show table"
              onClick={() => setViewMode("table")}
              className={`p-1 rounded ${viewMode === "table" ? "text-royal-gold underline border-royal-gold " : "text-white"} hover:text-royal-gold transition bg-black`}
              title="Table"
            >
              <TableIcon size={20} />
            </button>
          </div>

      {/* Visualization card with icon toggle + Save button */}
      <div className="w-full max-w-6xl bg-royal-red border border-royal-gold rounded relative">
        <div className="px-3 py-2 text-center">
          <h2 className="text-lg font-semibold text-royal-beige">
            {metric} Over Time
          </h2>
          
        </div>

        {/* Summary box (sum + average) */}
        <div className="px-3 pb-2">
          <div className="bg-black/30 border border-royal-gold rounded p-3 flex flex-wrap gap-6 justify-center">
            <div className="text-center">
              <div className="text-xs text-royal-beige uppercase tracking-wide">Sum</div>
              <div className="text-xl font-semibold text-white">
                {metricSummary.sum.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-royal-beige uppercase tracking-wide">Average</div>
              <div className="text-xl font-semibold text-white">
                {metricSummary.avg.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-200 mt-0.5">
                n = {metricSummary.count}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading && <div className="text-center text-gray-200 py-8">Loading…</div>}
        {err && !loading && (
          <div className="text-center text-red-200 py-8">Error: {String(err)}</div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div className="text-center text-gray-200 py-8">No data for the current filters.</div>
        )}

        {!loading && !err && filtered.length > 0 && viewMode === "chart" && (
          <div className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={320}>
              <RLineChart data={chartData} margin={{ top: 8, right: 0, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#fff" minTickGap={20} />
                <YAxis hide stroke="#fff" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#5A0000", color: "#FFD700", border: "1px solid #FFD700" }}
                  formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                />
                <Line type="monotone" dataKey="value" stroke="#FFD700" dot={false} name={metric} />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && !err && filtered.length > 0 && viewMode === "table" && (
          <div className="bg-black/30 border-t border-royal-gold rounded-b overflow-hidden">
            <div className="grid grid-cols-4 text-royal-beige bg-black/40 text-xs uppercase tracking-wide">
              <div className="py-2 px-3">Kickoff Time</div>
              <div className="py-2 px-3">{metric}</div>
              <div className="py-2 px-3">Opponent</div>
              <div className="py-2 px-3">Was Home</div>
            </div>
            <div>
              {filtered.map((r) => (
                <div
                  key={r.__key} // unique key fix
                  className="grid grid-cols-4 text-white text-sm odd:bg-black/20 even:bg:black/40"
                >
                  <div className="py-2 px-3">
                    {new Date(r.kickoff_time).toLocaleString()}
                  </div>
                  <div className="py-2 px-3">
                    {Number.isFinite(r[metric]) ? r[metric].toFixed(2) : "—"}
                  </div>
                  <div className="py-2 px-3">{r.opponent}</div>
                  <div className="py-2 px-3">{r.was_home === 1 ? "Home" : "Away"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save Analysis Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-black border border-royal-gold rounded-lg w-full max-w-sm p-4 relative">
            <button
              aria-label="Close"
              onClick={() => setModalOpen(false)}
              className="absolute top-2 right-2 text-gray-300 hover:text-white"
            >
              <XIcon size={18} />
            </button>
            <h3 className="text-lg font-semibold text-royal-beige mb-3">Save analysis</h3>
            <div className="space-y-3">
              <input
                type="text"
                className="w-full border border-royal-gold rounded text-black px-3 py-2"
                placeholder={`e.g. ${team} - ${metric}`}
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
              />
              <div className="text-xs text-gray-300">
                Saving: <span className="text-white">{team}</span> / <span className="text-white">{metric}</span> — Sum:{" "}
                <span className="text-white">{metricSummary.sum.toFixed(2)}</span>, Avg:{" "}
                <span className="text-white">{metricSummary.avg.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="px-3 py-1 rounded border border-gray-500 text-gray-200"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1 rounded bg-royal-gold text-black font-semibold"
                  onClick={() => handleAddAnalysis(analysisName.trim())}
                  disabled={!addAnalysis}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved analyses list */}
      {Array.isArray(analyses) && analyses.length > 0 && (
        <div className="w-full max-w-6xl">
          <h3 className="text-xl font-semibold text-royal-beige mb-2">Saved analyses</h3>
          <div className="grid gap-2">
            {analyses.map((a, idx) => (
              <div
                key={a.id ?? `analysis-${idx}`}
                className="flex items-center justify-between bg-black/30 border border-royal-gold rounded px-3 py-2"
              >
                <div>
                  <div className="font-semibold text-white">{a.name}</div>
                  <div className="text-xs text-gray-300">
                    Team: <span className="text-white">{a.player}</span> • Metric:{" "}
                    <span className="text-white">{a.metric}</span> • Sum:{" "}
                    <span className="text-white">{Number(a.TotalOfMetric ?? 0).toFixed(2)}</span> • Avg:{" "}
                    <span className="text-white">{Number(a.avgOfMetric ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                <button
                  aria-label="Remove analysis"
                  className="p-1 rounded text-gray-300 hover:text-red-400 transition"
                  title="Remove analysis"
                  onClick={() => handleRemoveAnalysis(a.id)}
                  disabled={!removeAnalysis || !a.id}
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
