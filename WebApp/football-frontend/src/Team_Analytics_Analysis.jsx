import React, { useEffect, useMemo, useState } from "react";
import teamLogos from "./utils/team_logos";
import Select, { components } from "react-select";
import makeAnimated from "react-select/animated";
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
  ChevronDown,
  ChevronUp,
  Filter as FilterIcon,
} from "lucide-react";

export default function Team_Analytics_Analysis() {
  const {
    fetchIfNeeded,
    TeamData,
    selected_team,
    setselected_team,
    addAnalysis,
    analyses,
    removeAnalysis,
  } = useStatsData();

  // ---- Config ----
  const API_URL = "https://fpl-project-t5e9.onrender.com/Teams_Analysis";
  const METRICS = [
  { key: "xg",            label: "Expected Goals" },
  { key: "xgc",           label: "Expected Goals Conceded" },
  { key: "gs",            label: "Goals Scored" },
  { key: "gc",            label: "Goals Conceded" },
  { key: "xg_adj",            label: "Expected Goals Adjusted" },
  { key: "xgc_adj",            label: "Expected Goals Conceded Adjusted" },
  { key: "cs",            label: "Clean Sheets" },
  { key: "g_minus_xg",    label: "Goals − XG" },
  { key: "gc_minus_xgc",  label: "Goals Conceded − XGC" },
  // (Optional if you kept these in the file)
  // { key: "threat",         label: "Threat" },
  // { key: "threat_against", label: "Threat Against" },
];


  // ---- UI state ----
  const [team, setTeam] = useState(selected_team || "");
  const [teams, setTeams] = useState([]);
  const [viewMode, setViewMode] = useState("chart"); // 'chart' | 'table'
  const [metric, setMetric] = useState("xg");

  // non-metric filters
  const [opponents, setOpponents] = useState([]);       // all available opponent strings
  const [opponentFilter, setOpponentFilter] = useState([]); // selected options ([]) = All
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

  const [seasonOption, setSeasonOption] = useState({ value: "all", label: "All seasons" });
  const [seasonFilter, setSeasonFilter] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const seasonLabelFromNum = (y) => {
  if (!y) return null;
  const yy = String(y % 100).padStart(2, "0");
  return `${y - 1}/${yy}`;
};

  // ---- bootstrap teams + default team ----
  useEffect(() => {
    fetchIfNeeded?.();

    const list = Array.isArray(TeamData?.current)
      ? [...new Set(TeamData.current.map((r) => r.name || r.Team).filter(Boolean))].sort()
      : [];
    setTeams(list);

    if (!team) {
      const def =
        selected_team && list.includes(selected_team) ? selected_team : list[0] || "";
      setTeam(def);
      setselected_team?.(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchIfNeeded, TeamData?.current, selected_team]);

  const onChangeTeam = (t) => {
    setTeam(t);
    setselected_team?.(t);
    // reset dependent filters on team change

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
          data = Array.isArray(dataAll)
            ? dataAll.filter((d) => (d.name || d.Team) === team)
            : [];
        }

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const norm = (data || []).map((d, i) => {
  const name         = d.name ?? d.Team ?? "";
  const opponentCode = d.opponent ?? d.Opponent ?? "";          // numeric in your CSV
  const opponentName = d.opponent_name ?? d.OpponentName ?? ""; // added by Python merge
  const opponent     = opponentName || opponentCode;            // prefer name, fallback code
  const kickoff_time = d.kickoff_time ?? d.date ?? d.kickoff ?? "";
  const was_home     = Number(d.was_home ?? d.wasHome ?? d.home ?? 0);

  // Make a guaranteed-unique React key
  const serverId = d.id ?? null;
  const rowKey = `${serverId ?? "noid"}|${name}|${opponent}|${kickoff_time}|${i}`;

  return {
    id: serverId,
    __key: rowKey,
    name,
    opponent,
    opponent_code: opponentCode,
    was_home,
    kickoff_time,

    // map CSV/JSON fields with spaces → JS-safe keys
    xg:           toNum(d["Expected Goals"]),
    xgc:          toNum(d["Expected Goals Conceeded"]),
    gs:           toNum(d["Goals Scored"]),
    gc:           toNum(d["Goals Conceeded"]),
    xg_adj:           toNum(d["Expected Goals Adjusted"]),
    xgc_adj:           toNum(d["Expected Goals Conceeded Adjusted"]),
    cs:           toNum(d["Clean Sheets"]),
    g_minus_xg:   toNum(d["Goals-XG"]),
    gc_minus_xgc: toNum(d["Goals Conceeded-XGC"]),

    // optional (if present)
    threat:         toNum(d["Threat"]),
    threat_against: toNum(d["Threat_against"]),
    season:         d["Season"] ?? null,
    season_label:   d["Season_Label"] ?? null,
  };
});


        if (alive) {
          setRows(norm);
          setOpponents([...new Set(norm.map(r => r.opponent).filter(Boolean))].sort());
          // keep only previously selected opponents that still exist
          setOpponentFilter(prev => prev.filter(o => setOpponents.has?.(o.value) || opponents.includes(o.value)));

        }
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchTeam();
    return () => {
      alive = false;
    };
  }, [API_URL, team]);

  // ---- Select helpers & styling ----
  const animatedComponents = makeAnimated();

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "#000",
      borderColor: state.isFocused ? "#FFD700" : "#B8860B",
      boxShadow: "none",
      ":hover": { borderColor: "#FFD700" },
      minHeight: 42,
    }),
    valueContainer: (base) => ({ ...base, padding: "2px 8px" }),
    menu: (base) => ({
      ...base,
      backgroundColor: "#0b0b0b",
      border: "1px solid #B8860B",
    }),
    menuPortal: (base) => ({ ...base, zIndex: 50 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#1a1a1a" : "transparent",
      color: "#f7ead6",
      ":active": { backgroundColor: "#333" },
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: "rgba(184,134,11,0.15)",
      border: "1px solid #B8860B",
    }),
    multiValueLabel: (base) => ({ ...base, color: "#FFD700" }),
    multiValueRemove: (base) => ({
      ...base,
      color: "#FFD700",
      ":hover": { backgroundColor: "#B8860B", color: "#000" },
    }),
    placeholder: (base) => ({ ...base, color: "#c8b27a" }),
    input: (base) => ({ ...base, color: "#fff" }),
    singleValue: (base) => ({ ...base, color: "#fff" }),
    indicatorsContainer: (base) => ({ ...base, color: "#FFD700" }),
  };

  const Option = (props) => (
    <components.Option {...props}>
      <div className="flex items-center gap-2">
        {props.data.logo && (
          <img src={props.data.logo} alt="" className="w-5 h-5 object-contain" />
        )}
        <span>{props.data.label}</span>
      </div>
    </components.Option>
  );

  const SingleValue = (props) => (
    <components.SingleValue {...props}>
      <div className="flex items-center gap-2">
        {props.data.logo && (
          <img src={props.data.logo} alt="" className="w-4 h-4 object-contain" />
        )}
        <span>{props.data.label}</span>
      </div>
    </components.SingleValue>
  );

  const MultiValueLabel = (props) => (
    <components.MultiValueLabel {...props}>
      <div className="flex items-center gap-1">
        {props.data.logo && (
          <img src={props.data.logo} alt="" className="w-3.5 h-3.5 object-contain" />
        )}
        <span>{props.data.label}</span>
      </div>
    </components.MultiValueLabel>
  );

  // Team select
  const teamOptions = useMemo(
    () => (teams || []).map((t) => ({ value: t, label: t, logo: teamLogos?.[t] || null })),
    [teams]
  );
  const teamOption = useMemo(
    () => teamOptions.find((o) => o.value === team) || null,
    [team, teamOptions]
  );
  const onChangeTeamSelect = (opt) => opt && onChangeTeam(opt.value);

  // Metric select
const metricOptions = useMemo(
  () => METRICS.map(m => ({ value: m.key, label: m.label })),
  []
);
const metricOption = useMemo(
  () => metricOptions.find(o => o.value === metric) || metricOptions[0],
  [metric, metricOptions]
);
const onChangeMetricSelect = (opt) => setMetric(opt?.value || "xg");


  // Venue select
  const venueOptions = [
    { value: "all", label: "All venues" },
    { value: "home", label: "Home" },
    { value: "away", label: "Away" },
  ];
  const venueOption = useMemo(
    () => venueOptions.find((o) => o.value === wasHome) || venueOptions[0],
    [wasHome]
  );
  const onChangeVenueSelect = (opt) => setWasHome(opt?.value || "all");

  // Opponent options
  const opponentOptions = useMemo(
    () =>
      (opponents || []).map((name) => ({
        value: name,
        label: name,
        logo: teamLogos?.[name] || null,
      })),
    [opponents]
  );
  const seasonOptions = useMemo(() => {
  const labels = [
    ...new Set(
      rows
        .map(r => r.season_label || seasonLabelFromNum(r.season))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  return labels.map(l => ({ value: l, label: l }));
}, [rows]);

// Keep only still-valid selected seasons if options change
useEffect(() => {
  setSeasonFilter(prev =>
    (prev || []).filter(o => seasonOptions.some(opt => opt.value === o.value))
  );
}, [seasonOptions]);


  // ---- apply non-metric filters ----
  const filtered = useMemo(() => {
    let out = rows.slice();

    if (opponentFilter.length > 0) {
      const wanted = new Set(opponentFilter.map((o) => o.value));
      out = out.filter((r) => wanted.has(r.opponent));
    }

    if (wasHome === "home") out = out.filter((r) => r.was_home === 1);
    if (wasHome === "away") out = out.filter((r) => r.was_home === 0);

    if (seasonFilter.length > 0) {
  const wanted = new Set(seasonFilter.map(o => o.value));
  out = out.filter(r =>
    wanted.has(r.season_label || seasonLabelFromNum(r.season))
  );
}

    const toDate = (s) => (s ? new Date(s) : null);
    const df = toDate(dateFrom);
    const dt = toDate(dateTo);
    if (df) out = out.filter((r) => new Date(r.kickoff_time) >= df);
    if (dt) out = out.filter((r) => new Date(r.kickoff_time) <= dt);

    out.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    return out;
  }, [rows, opponentFilter, wasHome, dateFrom, dateTo,seasonFilter]);

  // ---- chart data ----
  const chartData = useMemo(() => {
    return filtered
      .map((r) => ({
        time: r.kickoff_time,
        value: Number.isFinite(r[metric]) ? r[metric] : null,
      }))
      .filter((d) => d.value !== null);
  }, [filtered, metric]);

  // ---- metric summary (sum + average over filtered rows) ----
  const metricSummary = useMemo(() => {
    const vals = filtered.map((r) => r[metric]).filter(Number.isFinite);
    const count = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = count ? sum / count : 0;
    return { sum, avg, count };
  }, [filtered, metric]);

  // ---- date bounds for placeholders ----
  const [minDate, maxDate] = useMemo(() => {
    if (!rows.length) return ["", ""];
    const times = rows
      .map((r) => new Date(r.kickoff_time).getTime())
      .filter(Number.isFinite);
    const min = new Date(Math.min(...times));
    const max = new Date(Math.max(...times));
    const iso = (d) => d.toISOString().slice(0, 10);
    return [iso(min), iso(max)];
  }, [rows]);

  // --- map page vars → context payload ---
  const playerFilter = team;
  const selectedMetric = metric;
  const TotalOfMetric = metricSummary.sum;
  const avgOfMetric = metricSummary.avg;
  const currentMetricLabel = METRICS.find(m => m.key === metric)?.label ?? metric;

  // --- Save / Remove handlers ---
  const handleAddAnalysis = (name) => {
    const id = name || `${playerFilter}-${selectedMetric}-${Date.now()}`;
    addAnalysis?.({
      id,
      name: name || id,
      player: playerFilter,
      metric: currentMetricLabel,
      TotalOfMetric,
      avgOfMetric,
      Type:"Team"
    });
    setModalOpen(false);
    setAnalysisName("");
  };

  const handleRemoveAnalysis = (id) => {
    if (!id || !removeAnalysis) return;
    removeAnalysis(id);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-8 space-y-8">
        <h1 className="text-4xl font-bold text-center text-royal-beige">Team Historical Analysis</h1>
      {/* Team logo + selector */}
      <div className="flex flex-col items-center gap-3">
        {team ? (
          <img
            src={teamLogos[team] || ""}
            alt={`${team} logo`}
            className="h-20 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div className="w-72">
          <Select
            options={teamOptions}
            value={teamOption}
            onChange={onChangeTeamSelect}
            isClearable={false}
            placeholder="Select team…"
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </div>
      </div>

      {/* Filters (Metric + Opponents multi + Venue + Dates) */}
{/* Filters (collapsible) */}
<div className="w-full max-w-5xl border border-royal-gold rounded overflow-hidden bg-black/30">
  {/* Header */}
  <button
    type="button"
    aria-expanded={filtersOpen}
    onClick={() => setFiltersOpen((v) => !v)}
    className="w-full flex items-center justify-between px-4 py-3 bg-black/40 hover:bg-black/50 hover:border-none outline-none focus:outline-none focus:ring-0
    focus-visible:outline-none focus-visible:ring-0"
    title={filtersOpen ? "Collapse filters" : "Expand filters"}
  >
    <div className="flex items-center gap-2 hover:border-none">
      {!filtersOpen ? <FilterIcon size={18} /> : null}
      <span className="text-sm font-semibold tracking-wide text-royal-beige">
        Filters
      </span>
    </div>
    {filtersOpen ? (
      <ChevronUp size={18} className="text-royal-gold" />
    ) : (
      <ChevronDown size={18} className="text-royal-gold" />
    )}
  </button>

  {/* Body (hidden when collapsed) */}
  {filtersOpen && (
    <div className="p-3 border-t border-royal-gold/50">
      <div className="grid grid-cols-1 gap-5">
        {/* Metric */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-300 mb-1">Metric</label>
          <Select
            options={metricOptions}
            value={metricOption}
            onChange={onChangeMetricSelect}
            isClearable={false}
            placeholder="Select metric…"
            components={animatedComponents}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </div>

        {/* Opponents (multi) */}
        <div className="flex flex-col md:col-span-1">
          <label className="text-xs text-gray-300 mb-1">Opponents</label>
          <Select
            options={opponentOptions}
            value={opponentFilter}
            onChange={(opts) => setOpponentFilter(opts || [])}
            isMulti
            isClearable
            placeholder="Select opponent(s)…"
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ ...animatedComponents, Option, MultiValueLabel }}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
          {/* quick actions */}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="px-2 py-1 text-xs border border-royal-gold rounded text-royal-gold hover:bg-royal-gold hover:text-black"
              onClick={() => setOpponentFilter([])}
            >
              All
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-royal-gold rounded text-royal-gold hover:bg-royal-gold hover:text-black"
              onClick={() => setOpponentFilter(opponentOptions)}
            >
              Select all
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-gray-500 rounded text-gray-200 hover:bg-gray-700"
              onClick={() => setOpponentFilter([])}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Venue */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-300 mb-1">Venue</label>
          <Select
            options={venueOptions}
            value={venueOption}
            onChange={onChangeVenueSelect}
            isClearable={false}
            placeholder="Venue…"
            components={animatedComponents}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </div>

        {/* Seasons (multi) */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-300 mb-1">Seasons</label>
          <Select
            options={seasonOptions}
            value={seasonFilter}
            onChange={(opts) => setSeasonFilter(opts || [])}
            isMulti
            isClearable
            placeholder="Select season(s)…"
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={animatedComponents}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="px-2 py-1 text-xs border border-royal-gold rounded text-royal-gold hover:bg-royal-gold hover:text-black"
              onClick={() => setSeasonFilter([])}
            >
              All
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-royal-gold rounded text-royal-gold hover:bg-royal-gold hover:text-black"
              onClick={() => setSeasonFilter(seasonOptions)}
            >
              Select all
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-gray-500 rounded text-gray-200 hover:bg-gray-700"
              onClick={() => setSeasonFilter([])}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-300 mb-1">From (date)</label>
          <input
            type="date"
            className="bg-black border border-royal-gold rounded px-3 py-2 text-white placeholder-[#c8b27a] focus:outline-none focus:ring-1 focus:ring-[#FFD700] focus:border-[#FFD700]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder={minDate || ""}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-300 mb-1">To (date)</label>
          <input
            type="date"
            className="bg-black border border-royal-gold rounded px-3 py-2 text-white placeholder-[#c8b27a] focus:outline-none focus:ring-1 focus:ring-[#FFD700] focus:border-[#FFD700]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder={maxDate || ""}
          />
        </div>
      </div>
    </div>
  )}
</div>

      <div className="text-center">
        
        <button
          aria-label="Save analysis"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 p-2 rounded text-royal-gold hover:text-royal-gold transition mt-5 mb-10 text-center"
          title="Save analysis"
          disabled={!addAnalysis}
        >
            <h2>Save Analysis</h2>
          <SaveIcon size={35} />
        </button>
      </div>

      {/* Save + View toggles */}
      <div className="flex items-center gap-6">
        

        <div className="flex items-center gap-3">
          <button
            aria-label="Show chart"
            onClick={() => setViewMode("chart")}
            className=
            {`
          cursor-pointer 
          ${viewMode === "chart" ? "underline text-royal-gold border-royal-gold" 
            : "text-white hover:text-gray-300"
          } bg-black hover:border-none
        `}
            title="Chart"
          >
            <ChartIcon size={20} />
          </button>
          <button
            aria-label="Show table"
            onClick={() => setViewMode("table")}
            className={`
          cursor-pointer 
          ${viewMode === "table" ? "underline text-royal-gold border-royal-gold" 
            : "text-white hover:text-gray-300"
          } bg-black hover:border-none outline-none 
        `}
            title="Table"
          >
            <TableIcon size={20} />
          </button>
        </div>
      </div>

      {/* Visualization card */}
      <div className="w-full max-w-6xl bg-royal-red border border-royal-gold rounded relative">
        <div className="px-3 py-2 text-center">
          <h2 className="text-lg font-semibold text-royal-beige">{currentMetricLabel} Over Time</h2>
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
          <div className="text-center text-gray-200 py-8">
            No data for the current filters.
          </div>
        )}

        {!loading && !err && filtered.length > 0 && viewMode === "chart" && (
          <div className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={320}>
              <RLineChart data={chartData} margin={{ top: 8, right: 0, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="#fff"
                  minTickGap={20}
                />
                <YAxis hide stroke="#fff" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#5A0000",
                    color: "#FFD700",
                    border: "1px solid #FFD700",
                  }}
                  formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#FFD700"
                  dot={false}
                  name={currentMetricLabel}
                />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && !err && filtered.length > 0 && viewMode === "table" && (
          <div className="bg-black/30 border-t border-royal-gold rounded-b overflow-hidden">
            <div className="grid grid-cols-4 text-royal-beige bg-black/40 text-xs uppercase tracking-wide">
              <div className="py-2 px-3">Kickoff Time</div>
              <div className="py-2 px-3">{currentMetricLabel}</div>
              <div className="py-2 px-3">Opponent</div>
              <div className="py-2 px-3">Was Home</div>
            </div>
            <div>
              {filtered.map((r) => (
                <div
                  key={r.__key}
                  className="grid grid-cols-4 text-white text-sm odd:bg-black/20 even:bg-black/40"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="bg-black border border-royal-gold rounded-lg w-full max-w-sm p-4 relative">
            <button
              aria-label="Close"
              onClick={() => setModalOpen(false)}
              className="absolute top-1 right-2 text-black hover:text-white"
            >
              <XIcon size={18} />
            </button>
            <h3 className="text-lg font-semibold text-royal-beige mb-3">Save analysis</h3>
            <div className="space-y-3">
              <input
                type="text"
                className="w-full border border-royal-gold rounded text-black px-3 py-2"
                placeholder={`e.g. ${team} - ${currentMetricLabel}`}
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
              />
              <div className="text-xs text-gray-300">
                Saving: <span className="text-white">{team}</span> /{" "}
                <span className="text-white">{currentMetricLabel}</span> — Sum:{" "}
                <span className="text-white">{metricSummary.sum.toFixed(2)}</span>, Avg:{" "}
                <span className="text-white">{metricSummary.avg.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="px-3 py-1 rounded border border-gray-500 text-black"
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
                    <span className="text-white">
                      {Number(a.TotalOfMetric ?? 0).toFixed(2)}
                    </span>{" "}
                    • Avg:{" "}
                    <span className="text-white">
                      {Number(a.avgOfMetric ?? 0).toFixed(2)}
                    </span>
                    <span className="text-white">• Type {a.Type}</span>
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
